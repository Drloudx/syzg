/**
 * 链接与接口路径体检（**会随 `npm run test:unit` 一起跑**）。
 *
 * ## 为什么值得做成测试
 *
 * 之前抓到一个**上线阻断级**的问题：注册表单里那个**必勾**的
 * 「我已阅读并同意隐私说明」，链接指向 `#/privacy`，而**那条路由根本不存在** ——
 * 点进去是空白页。所有测试都是绿的，因为**谁也没点过那个链接**。
 *
 * 那类问题的共性是：**代码里写了一个目标，而目标不存在**。
 * 它可以被机械地查出来，不该指望"有人记得点一下"。
 *
 * 本文件查四类：
 *   1. `href="#/xxx"` 指向的前端路由是否存在；
 *   2. `<RouterLink to="/xxx">` 指向的路由是否存在；
 *   3. 代码里 `fetch('/api/...')` / `request('/api/...')` 的路径在
 *      `functions/api/[[path]].js` 里有没有对应分支；
 *   4. `src` 里相对 import 的文件能不能解析到。
 *
 * ## 两个"必须按项目约定来"的点（第一版都栽过）
 *
 * - **import 常省略扩展名**（`from '../utils/env'`，实际是 `env.js`），
 *   Vite 会解析。不补扩展名就报了 60 多条误报，把真问题淹了。
 * - **`?raw` / `?url` 这类查询后缀**要剥掉再判断路径。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const ROOT = process.cwd()

const walk = (d) =>
  readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(path.join(d, e.name))
      : [path.join(d, e.name)]
  )

const rel = (f) => f.replace(/\\/g, '/')

// ── 真实存在的路由 ────────────────────────────────────────────────
function collectRoutes() {
  const text = readFileSync(path.join(ROOT, 'src/router/index.js'), 'utf8')
  const out = new Set()
  for (const m of text.matchAll(/path:\s*'([^']*)'/g)) {
    const p = m[1]
    if (p.startsWith('/:')) continue // 兜底路由，任何路径都能命中，不算"存在的页面"
    if (p.startsWith('/')) out.add(p)
  }
  // 嵌套子路由：`/admin` 下挂了 ''、'comments'、'users'
  for (const c of ['', '/comments', '/users']) out.add('/admin' + c)
  return out
}

// ── 真实存在的 API 路径 ──────────────────────────────────────────
function collectApiRoutes() {
  const text = readFileSync(path.join(ROOT, 'functions/api/[[path]].js'), 'utf8')
  const exact = new Set()
  for (const m of text.matchAll(/path\s*===\s*'(\/api\/[^']+)'/g)) exact.add(m[1])
  const prefixes = [...text.matchAll(/path\.startsWith\('(\/api\/[^']+)'\)/g)].map((m) => m[1])
  return { exact, prefixes }
}

/**
 * 按 Vite 的规则解析相对 import：补扩展名、剥查询后缀。
 *
 * ⚠️ 少了任何一条都会产生大量误报 —— 而**误报比不查更糟**：
 * 它会让真问题淹没在噪音里，几次之后就没人看这个测试了。
 */
function resolveImport(fromFile, spec) {
  const clean = spec.split('?')[0].split('#')[0]
  const base = path.resolve(path.dirname(path.join(ROOT, fromFile)), clean)
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.vue`,
    `${base}.json`,
    `${base}.svg`,
    path.join(base, 'index.js'),
    path.join(base, 'index.vue')
  ]
  return candidates.some((c) => existsSync(c))
}

const srcFiles = walk('src').filter((f) => /\.(vue|js)$/.test(f))

test('前端路由、接口路径与相对 import 的"目标"都真实存在', () => {
  const routes = collectRoutes()
  const { exact: apiExact, prefixes: apiPrefixes } = collectApiRoutes()

  const routeExists = (href) => {
    const clean = href.replace(/^#/, '').split('?')[0].split('#')[0] || '/'
    return routes.has(clean)
  }
  const apiExists = (p) => {
    const clean = p.split('?')[0]
    return apiExact.has(clean) || apiPrefixes.some((pre) => clean.startsWith(pre))
  }

  const problems = []

  for (const f of srcFiles) {
    const text = readFileSync(path.join(ROOT, f), 'utf8')
    const R = rel(f)

    for (const m of text.matchAll(/href="(#\/[^"]*)"/g)) {
      if (!routeExists(m[1])) problems.push(`${R}: href="${m[1]}" 没有对应路由`)
    }

    for (const m of text.matchAll(/<RouterLink[^>]*\bto="(\/[^"]*)"/g)) {
      if (!routeExists(m[1])) problems.push(`${R}: <RouterLink to="${m[1]}"> 没有对应路由`)
    }

    for (const m of text.matchAll(/(?:fetch|request)\(\s*[`'"](\/api\/[^`'"?]*)/g)) {
      if (!apiExists(m[1])) problems.push(`${R}: 调用了 ${m[1]}，但 API 里没有对应分支`)
    }

    for (const m of text.matchAll(/from\s+'(\.[^']+)'/g)) {
      if (!resolveImport(f, m[1])) problems.push(`${R}: import '${m[1]}' 解析不到目标文件`)
    }
  }

  assert.deepEqual(
    problems,
    [],
    '发现"目标不存在"的引用：\n' +
      problems.map((p) => '  · ' + p).join('\n') +
      '\n\n（这类问题会让用户点到一个空白页，或让请求打到不存在的接口）'
  )
})

test('兜底路由存在：没匹配上的 hash 不该渲染成空白页', () => {
  const text = readFileSync(path.join(ROOT, 'src/router/index.js'), 'utf8')
  assert.match(
    text,
    /path:\s*'\/:pathMatch\(\.\*\)\*/,
    '路由表缺少 catch-all。没有它，任何拼错的 hash 都会得到一个全白页面 —— ' +
      '用户分不清是自己点错了还是站点坏了。'
  )
})
