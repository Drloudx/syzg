/**
 * CSP 自测：**不需要上线**，用无头浏览器加载构建产物、注入 `public/_headers`
 * 里的真实 CSP，逐页收集违规并把关键页面截图。
 *
 * ## 为什么需要它
 *
 * CSP 的误伤有一个很讨厌的性质：**不报错、只静默失效**。
 * 图不显示、音不播、动态定位错位 —— 页面照样能打开，用户才发现不对。
 * 所以"配好了"不能靠肉眼看，要靠**程序化收集违规**。
 *
 * ## 它怎么做到"不用上线就能验"
 *
 * 1. 从 `public/_headers` **解析出真实的 CSP 字符串**（不是另抄一份，
 *    避免"测的和上的不是同一个值"）；
 * 2. 起一个本地静态服务托管 `dist/`（等价于 Cloudflare Pages 的静态部分）；
 * 3. 用 Playwright **给每个响应注入该 CSP 头**（等价于 Pages 套 `_headers`）；
 * 4. 监听 `securitypolicyviolation` 事件 + 控制台，收集所有违规；
 * 5. 走一遍关键页面（招募 / 注册 / 关卡地图 / 吉祥物 / 物品 …），逐页截图。
 *
 * ## 用法
 *
 * ```bash
 * npm run build                 # 先构建出 dist/（脚本不负责构建）
 * node scripts/dev/check-csp.mjs            # 检查 + 截图
 * node scripts/dev/check-csp.mjs --headed   # 带界面看（本地排查用）
 * ```
 *
 * 退出码：有违规 = 1，无违规 = 0。可直接进 CI。
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const distDir = join(projectRoot, 'dist')
const headersFile = join(projectRoot, 'public', '_headers')
const shotDir = join(projectRoot, 'scratch', 'csp-shots')
const HEADED = process.argv.includes('--headed')

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('[csp] 缺少 dist/index.html —— 先跑 npm run build')
  process.exit(2)
}

// ---------- 1. 从 _headers 解析真实 CSP ----------
const rawHeaders = readFileSync(headersFile, 'utf8')
const cspLine = rawHeaders.split('\n').find(l => /^\s*Content-Security-Policy:/i.test(l))
if (!cspLine) {
  console.error('[csp] public/_headers 里找不到 Content-Security-Policy')
  process.exit(2)
}
const CSP = cspLine.replace(/^\s*Content-Security-Policy:\s*/i, '').trim()
console.log('[csp] 使用 _headers 里的 CSP：')
console.log('      ' + CSP)
console.log()

// ---------- 2. 静态服务托管 dist ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4'
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])
  let filePath = join(distDir, urlPath)
  // SPA 兜底：找不到的路径回 index.html（与 _redirects 的 `/* /index.html 200` 同语义）
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(distDir, 'index.html')
  try {
    const body = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end('not found')
  }
})

const port = await new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)))
const base = `http://127.0.0.1:${port}`
console.log(`[csp] 本地静态服务：${base}`)

// ---------- 3. 用 Playwright 注入 CSP 并逐页检查 ----------
const { chromium } = await import('playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: !HEADED })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })

// 给每个响应注入 CSP —— 等价于 Cloudflare Pages 套上 _headers
await ctx.route('**/*', async route => {
  const url = route.request().url()

  /*
   * 静态服务只托管 dist/，没有 Pages Functions，所以 `/api/auth/captcha` 必然失败
   * → 人机验证弹窗会显示「无法连接账号服务器」→ **蛋图永远渲染不出来**，
   * 而蛋图（base64 → SVG `<image href="data:...">`）正是本脚本最需要验证的
   * `img-src data:` 那一处。所以这里就地用项目自己的 `buildCaptcha()` 出了一道真题，
   * 并 mock 掉这个接口（**只 mock 取题，不 mock 提交**）。
   */
  if (url.includes('/api/auth/captcha')) {
    const { buildCaptcha } = await import('../../src/utils/authCaptcha.js')
    const c = buildCaptcha()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-security-policy': CSP },
      body: JSON.stringify({ ok: true, captchaId: c.captchaId, svg: c.svg })
    })
    return
  }

  const resp = await route.fetch()
  const headers = { ...resp.headers(), 'content-security-policy': CSP }
  await route.fulfill({ response: resp, headers })
})

mkdirSync(shotDir, { recursive: true })

/** 逐页检查的目标：覆盖面按「用了 blob/data/内联 style/音频」的实际风险选 */
const PAGES = [
  { path: '/#/items', name: '物品图鉴', note: '基础页 + 卡片图' },
  { path: '/#/gacha', name: '模拟招募', note: 'Spine(blob) + BGM(media) + 大量内联 style' },
  { path: '/#/chapters', name: '关卡图鉴', note: '世界地图 + 内联 style 定位' },
  { path: '/#/tasks', name: '任务图鉴', note: '本页有剧情索引懒加载' },
  { path: '/#/monsters', name: '怪物图鉴', note: 'v-html 高亮 + 立绘' },
  { path: '/#/heroes', name: '角色图鉴', note: 'v-html + 皮肤模型图' },
  { path: '/#/runes', name: '符石图鉴', note: 'v-html 效果描述' },
  { path: '/#/privacy', name: '隐私说明', note: '另一个 agent 刚改的页' }
]

const allViolations = []

for (const p of PAGES) {
  const page = await ctx.newPage()
  const violations = []

  await page.exposeFunction('__cspReport', (v) => violations.push(v))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspReport({
        directive: e.effectiveDirective || e.violatedDirective,
        blocked: e.blockedURI,
        sample: (e.sample || '').slice(0, 120)
      })
    })
  })

  const consoleErrors = []
  page.on('console', m => {
    const t = m.text()
    if (/Content Security Policy|Refused to/i.test(t)) consoleErrors.push(t.slice(0, 200))
  })

  try {
    await page.goto(base + p.path, { waitUntil: 'load', timeout: 30000 })
  } catch {
    // SPA 的 load 事件可能因长任务延后，忽略；后面照常采样
  }
  await page.waitForTimeout(4500)
  await page.screenshot({ path: join(shotDir, p.name + '.png'), fullPage: false })

  // 合并两类来源：事件监听 + 控制台（有些违规只在控制台出现）
  const merged = [
    ...violations.map(v => `${v.directive}  ←  ${v.blocked}${v.sample ? `  [${v.sample}]` : ''}`),
    ...consoleErrors
  ]
  const uniq = [...new Set(merged)]

  if (uniq.length) {
    allViolations.push({ page: p.name, items: uniq })
    console.log(`  ❌ ${p.name.padEnd(6)} 违规 ${uniq.length} 条`)
    uniq.slice(0, 6).forEach(v => console.log(`       ${v}`))
  } else {
    console.log(`  ✅ ${p.name.padEnd(6)} 无违规`)
  }
  await page.close()
}

// ---------- 4. 额外：注册页的蛋图（data: URI 最可能被误伤的地方） ----------
{
  const page = await ctx.newPage()
  const violations = []
  await page.exposeFunction('__cspReport', (v) => violations.push(v))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspReport({ directive: e.effectiveDirective, blocked: e.blockedURI })
    })
  })
  await page.goto(base + '/#/items', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(2500)

  /*
   * 必须真的把「点选验证码」的 SVG 渲染出来再断言 —— 蛋图是 base64 内联进
   * `<image href="data:...">` 的，只有它渲染了才能验证 `img-src data:` 是否够用。
   * 第一版脚本只点了「含『登录』字样」的按钮，而顶栏入口是 `<button title="账号">`
   * （文案里没有"登录"），于是什么都没测到却报了 ✅ —— 这是空转，必须避免。
   */
  const opened = await page.evaluate(() => {
    const byTitle = document.querySelector('button[title="账号"]')
    const byText = [...document.querySelectorAll('button')].find(b => /账号|登录|注册/.test(b.textContent || ''))
    const btn = byTitle || byText
    if (!btn) return false
    btn.click()
    return true
  })
  await page.waitForTimeout(2000)

  // 切到注册页签，触发验证码出题（出题才会渲染那 32 张 base64 蛋图）
  const toRegister = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button, [role="tab"]')]
      .find(el => (el.textContent || '').trim() === '注册')
    if (!tab) return false
    tab.click()
    return true
  })
  await page.waitForTimeout(1500)

  /*
   * 🔴 必须**先把注册表单填成合法的**，点「发送验证码」才会展开人机验证。
   * `startRegisterCode()` 会先用 `checkPasswordStrength` 挡住弱密码/缺项
   * （实测：只切页签不填表 → 蛋图数量 0，等于没测到 CSP 最可能踩的 `img-src data:`）。
   */
  const filled = await page.evaluate(() => {
    const setVal = (el, v) => {
      if (!el) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }
    /*
     * 🔴 按 placeholder 精确定位，**不要用 /邮箱/ 这种宽匹配**：
     * 注册页的邮箱框 placeholder 是「用来收验证码，也是以后的登录账号」——
     * 里面根本没有"邮箱"二字，宽匹配会命中登录页那个「注册时用的邮箱」，
     * 于是注册表单的邮箱始终为空、`startRegisterCode()` 被「请填邮箱」挡下，
     * 蛋图永远渲染不出来（实测踩过，截图里能看到红字提示）。
     */
    const inputs = [...document.querySelectorAll('input')]
    const byPh = (re) => inputs.find(i => re.test(i.placeholder || ''))
    return {
      nick: setVal(byPh(/评论时会显示这个名字/), 'csp检查用昵称'),
      pwd: setVal(byPh(/^至少 \d+ 位$/), 'Csp-Test-Password-9x'),
      confirm: setVal(byPh(/^再输一遍$/), 'Csp-Test-Password-9x'),
      // 注册页那个框：以「用来收验证码」开头
      email: setVal(byPh(/用来收验证码/), 'csp-probe@example.invalid')
    }
  })
  await page.waitForTimeout(800)

  const clickedSend = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /发送验证码/.test(b.textContent || ''))
    if (!btn) return false
    btn.click()
    return true
  })
  await page.waitForTimeout(6000)

  await page.screenshot({ path: join(shotDir, '账号弹窗-注册.png') })
  const eggCount = await page.evaluate(() =>
    document.querySelectorAll('image[href^="data:"], img[src^="data:"]').length)
  console.log(`\n  账号入口：${opened ? '已打开' : '❌ 未找到'}；注册页签：${toRegister ? '已切换' : '❌'}；填表：${JSON.stringify(filled)}；点发送：${clickedSend ? '已点' : '❌'}；data: 蛋图 = ${eggCount}`)

  /*
   * 🔴 **断言而不是打印**：蛋图数量为 0 说明这一步根本没测到 CSP 的实际风险点，
   * 必须判失败，否则脚本会给出"零违规"的假结论。
   */
  if (eggCount === 0) {
    console.log('  ❌ 未能渲染出点选验证码的蛋图 —— 这一步没测到，结论不可信')
    allViolations.push({ page: '账号弹窗（未渲染蛋图）', items: ['data: 蛋图数量为 0，本步未真正验证 img-src data:'] })
  } else if (violations.length) {
    allViolations.push({ page: '账号弹窗', items: [...new Set(violations.map(v => `${v.directive} ← ${v.blocked}`))] })
    console.log(`  ❌ 账号弹窗 违规 ${violations.length} 条`)
  } else {
    console.log(`  ✅ 账号弹窗 无违规（已渲染 ${eggCount} 张 data: 蛋图，img-src data: 确认够用）`)
  }
  await page.close()
}

await browser.close()
server.close()

// ---------- 5. 汇总 ----------
console.log('\n' + '─'.repeat(60))
if (allViolations.length === 0) {
  console.log('✅ CSP 全站零违规 —— 可以直接上强制模式')
} else {
  console.log(`❌ 共 ${allViolations.length} 个页面存在违规，需要调整 CSP 或改代码：`)
  for (const v of allViolations) {
    console.log(`\n  【${v.page}】`)
    v.items.slice(0, 10).forEach(i => console.log('    · ' + i))
  }
}
console.log(`\n截图目录：${shotDir}`)
process.exit(allViolations.length === 0 ? 0 : 1)
