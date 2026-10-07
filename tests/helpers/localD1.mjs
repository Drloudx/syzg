/**
 * 测试专用：直接读**本地 D1 的 SQLite 文件**，反解出验证码与人机验证答案。
 *
 * ## 为什么需要"反解"
 *
 * 邮箱验证码与人机验证答案都是**服务端才该知道的秘密**，正常情况下客户端拿不到。
 * 但自动化测试必须拿到它们才能把流程走完（否则每跑一次都要人工收邮件）。
 *
 * 这里的做法：库里存的是 `HMAC(AUTH_PEPPER, 明文)`，而本地 `.dev.vars` 里的
 * `AUTH_PEPPER` 是已知的固定串，于是**穷举反查**即可：
 * - 人机验证答案只有 5×4×3 = **60** 种可能 → 瞬间出结果；
 * - 6 位验证码有 **100 万** 种 → 用 Node 的同步 HMAC 约 1~2 秒。
 *
 * ## 这个"能反解"本身就是一条安全结论
 *
 * 6 位验证码的空间太小，**拿到哈希就能瞬间穷举** —— 这正是 `code_hash` 必须带
 * `AUTH_PEPPER` 的原因（pepper 只在环境变量里、不在库里，所以光偷到 D1 备份没用）。
 * 这个 helper 里"1~2 秒反解成功"的实验，恰好从反面证明了那条设计。
 *
 * ⚠️ **只在本地可用**：生产库里存的哈希用的是生产 pepper，本地脚本算不出来。
 */

import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const ROOT = path.resolve(import.meta.dirname, '../..')

/** 读 `.dev.vars`（简单的 KEY=VALUE，跳过注释与空行）。 */
export function readDevVars() {
  const raw = readFileSync(path.join(ROOT, '.dev.vars'), 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

/** 打开本地 D1（只读）。找不到文件时给出可操作的报错。 */
export function openLocalD1() {
  return openD1File({ readOnly: true })
}

/**
 * 打开本地 D1（**可写**）。
 *
 * ⚠️ 只在**测试准备阶段**用（如把某个账号设成管理员 —— 生产上那是手工 SQL，
 * 没有接口能造出超管）。测试结束后不要指望它清理：本地 D1 是测试的共享状态，
 * 各 spec 自己负责用唯一邮箱/昵称避免互相干扰。
 */
export function openLocalD1Writable() {
  return openD1File({ readOnly: false })
}

function openD1File({ readOnly }) {
  const dir = path.join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  let file
  try {
    file = readdirSync(dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
  } catch {
    throw new Error(`找不到本地 D1 目录：${dir}\n先跑一次 npm run dev:api 让它建库。`)
  }
  if (!file) throw new Error(`本地 D1 目录里没有 .sqlite 文件：${dir}`)
  return new DatabaseSync(path.join(dir, file), { readOnly })
}

export function createCodeReader() {
  const devVars = readDevVars()
  const pepper = devVars.AUTH_PEPPER
  const saltSecret = devVars.SALT_SECRET
  if (!pepper || !saltSecret) throw new Error('.dev.vars 缺 AUTH_PEPPER / SALT_SECRET')

  const db = openLocalD1()
  const pepperHash = (v) => createHmac('sha256', pepper).update(String(v)).digest('hex')

  return {
    db,
    pepper,
    saltSecret,
    pepperHash,

    /** 反解 6 位验证码（穷举 100 万种，约 1~2 秒）。 */
    readCode(emailHash, purpose) {
      const rows = db
        .prepare(
          `SELECT code_hash FROM auth_codes WHERE email_hash = ? AND purpose = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .all(emailHash, purpose)
      if (!rows.length) return null
      const target = rows[0].code_hash
      for (let i = 0; i < 1_000_000; i++) {
        const code = String(i).padStart(6, '0')
        if (pepperHash(code) === target) return code
      }
      return null
    },

    /** 反解一道人机验证的正解（穷举 60 种）。 */
    readCaptchaAnswer(captchaId) {
      const row = db.prepare(`SELECT answer FROM captchas WHERE id = ?`).get(captchaId)
      if (!row) return null
      for (let a = 0; a < 5; a++) {
        for (let b = 0; b < 5; b++) {
          for (let c = 0; c < 5; c++) {
            if (a === b || a === c || b === c) continue
            const combo = `${a},${b},${c}`
            if (pepperHash(combo) === row.answer) return combo
          }
        }
      }
      return null
    },

    close() {
      try {
        db.close()
      } catch {
        /* 忽略 */
      }
    }
  }
}
