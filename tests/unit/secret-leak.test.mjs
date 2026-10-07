/**
 * 密钥泄漏体检（随 `npm run test:unit` 一起跑）。
 *
 * ## 查什么
 *
 * 从 `.dev.vars` 取出**真实的密钥值**，拿它们去 `git grep --fixed-strings`
 * 搜整个被跟踪的工作区。**只报告"有没有"，绝不打印值本身。**
 *
 * 为什么需要它：`.dev.vars` 是 gitignored 的，但那只是**当前状态** ——
 * 它保证不了某个值没被顺手写进别的文件（调试时贴进代码、写进文档示例……）。
 *
 * ## 两个让它"不误报"的设计（都踩过）
 *
 * 1. **区分开发占位值与真密钥**。第一版把 `IP_HASH_SALT=local-dev-salt`
 *    报成了泄漏 —— 而那个值本来就写在 `docs/HANDOFF.md` 里给协作者看，
 *    **它本来就该公开**。误报比不查更糟：总是喊狼来了的检查，几次之后
 *    就没人看了，那时连真泄漏也一起放过。
 * 2. **`.dev.vars` 不存在时跳过**（CI、新克隆的仓库都没有它），
 *    而不是失败。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const SENSITIVE = /SECRET|PEPPER|SALT|TOKEN|KEY|PASSWORD/i
const NOT_A_SECRET = /^(0|1|true|false|\d{1,6})$/i

/**
 * 明显的**开发占位值**。
 *
 * ## 🔴 这里必须"保守判定"，因为它是安全边界
 *
 * 第一版写成了：
 *
 *     /^(local|dev|test|demo|sample|change|your|my|xxx|todo)/i.test(v)
 *
 * 用了 `/i` 又没锚定**整串**，于是 41 字符的 `AUTH_PEPPER` 与 46 字符的
 * `SALT_SECRET` 只要恰好以 `dev`/`my` 之类开头，就被判成"占位值" ——
 * **整个泄漏检查被静默降级成空操作**。这是假阴性，比假阳性危险得多：
 * 报告一片绿，而真泄漏照过。
 *
 * 现在的规则只有两条，且都很窄：
 *   1. 整个值**就是**一个已知的占位词（锚定 `^...$`）；
 *   2. 长度 < 12（真实密钥不该这么短）。
 *
 * 拿不准的时候**算它是真密钥** —— 检查宁可多报一次让人来看一眼，
 * 也不能悄悄放过。
 */
const IS_PLACEHOLDER = (v) =>
  /^(local-dev-salt|local-dev|dev|dev-salt|test|testing|changeme|change-me|placeholder|example|dummy|fake|todo|xxx+|your-?secret|my-?secret|secret|password)$/i.test(
    v
  ) || v.length < 12

/** 从 `.dev.vars` 解析出敏感项（值只在本进程内使用，不打印） */
export function readLocalSecrets() {
  if (!existsSync('.dev.vars')) return null
  const out = []
  for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, key, raw] = m
    const value = raw.trim().replace(/^["']|["']$/g, '')
    if (!SENSITIVE.test(key) || value.length < 8 || NOT_A_SECRET.test(value)) continue
    out.push([key, value])
  }
  return out
}

/** 这个值出现在哪些被跟踪文件里（git grep 没命中时退出码是 1，要吞掉） */
export function trackedFilesContaining(value) {
  try {
    const out = execFileSync('git', ['grep', '-I', '-l', '--fixed-strings', value, '--', '.'], {
      encoding: 'utf8',
      stdio: 'pipe'
    })
    return out.trim() ? out.trim().split('\n') : []
  } catch {
    return []
  }
}

test('.dev.vars 没有被 git 跟踪', () => {
  let tracked = true
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '.dev.vars'], { stdio: 'pipe' })
  } catch {
    tracked = false
  }
  assert.equal(
    tracked,
    false,
    '.dev.vars 被 git 跟踪了 —— 里面有 AUTH_PEPPER / SALT_SECRET / 腾讯云密钥。' +
      '执行 `git rm --cached .dev.vars` 并确认 .gitignore 生效，然后**轮换这些密钥**' +
      '（一旦推上去就必须视为已泄漏）。'
  )
})

test('真密钥没有出现在被跟踪的文件里', (t) => {
  const secrets = readLocalSecrets()
  if (secrets === null) {
    t.skip('.dev.vars 不存在（CI / 新克隆的仓库）—— 跳过')
    return
  }
  if (!secrets.length) {
    t.skip('.dev.vars 里没有可判定的敏感项')
    return
  }

  const leaks = []
  const placeholders = []
  for (const [key, value] of secrets) {
    const files = trackedFilesContaining(value)
    if (!files.length) continue
    if (IS_PLACEHOLDER(value)) placeholders.push(`${key} → ${files.join(', ')}`)
    else leaks.push(`${key} → ${files.join(', ')}`)
  }

  if (placeholders.length) {
    // 开发占位值本来就该公开（HANDOFF 里写着给协作者用），不是问题
    console.log('  ℹ️ 开发占位值出现在文档里（正常）：\n    ' + placeholders.join('\n    '))
  }

  assert.deepEqual(
    leaks,
    [],
    '发现**真密钥**被写进了被跟踪的文件：\n' +
      leaks.map((l) => '  · ' + l).join('\n') +
      '\n\n处理：从文件里删掉、换成占位值，并**轮换该密钥**' +
      '（已经提交过的值必须视为已泄漏，改文件不足以补救）。'
  )
})
