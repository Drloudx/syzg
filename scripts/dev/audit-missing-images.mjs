/**
 * 反向扫描：找「模板拼接产生、但静态判据漏掉」的图片。
 *
 * 思路：直接问「线上/本地构建后，哪些图片 URL 会被请求到但文件不存在」。
 * 比正向推导引用更可靠 —— 正向永远可能漏掉新的拼接方式。
 *
 * 实现：用 Edge 跑全部路由 + 点开详情，记录所有 /images/ 请求中
 * Content-Type 为 text/html（= SPA 兜底 = 文件不存在）的 URL。
 *
 * 只读，不改任何文件。
 */
import { chromium } from 'playwright'

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:4173'
const ROUTES = ['#/', '#/items', '#/monsters', '#/pets', '#/heroes', '#/glossary', '#/chapters',
  '#/dungeons', '#/tasks', '#/events', '#/furniture', '#/facilities', '#/equip', '#/runes',
  '#/recipes', '#/exchange', '#/rewards', '#/achievement', '#/gacha', '#/petseggs',
  '#/partner-mails', '#/discussions']

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

const missing = new Map()
page.on('response', r => {
  const u = r.url()
  if (!/\/images\//.test(u)) return
  const ct = (r.headers()['content-type'] || '')
  if (ct.includes('text/html')) {
    const p = decodeURIComponent(u.replace(BASE, '').replace(/^\/?/, '/').split('?')[0])
    if (!missing.has(p)) missing.set(p, 0)
    missing.set(p, missing.get(p) + 1)
  }
})

for (const route of ROUTES) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'load', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(2200)
  await page.evaluate(() => { const e = document.querySelector('[data-main-scroll]'); if (e) e.scrollTop = 2000 })
  await page.waitForTimeout(900)
  // 点开前几张卡片，触发详情内图片
  const cards = await page.$$('.ui-item-card')
  for (const c of cards.slice(0, 4)) {
    try { await c.click({ timeout: 2500 }); await page.waitForTimeout(900); await page.keyboard.press('Escape'); await page.waitForTimeout(300) } catch { /* 跳过 */ }
  }
}

await browser.close()

const list = [...missing.entries()].sort((a, b) => b[1] - a[1])
console.log(`=== 缺失图片扫描（${ROUTES.length} 路由 + 详情） ===\n`)
console.log(`  缺失: ${list.length} 个`)
if (list.length) {
  console.log('  按出现次数排序:')
  for (const [p, n] of list.slice(0, 40)) console.log(`    ${String(n).padStart(3)}x  ${p}`)
  console.log('\n  → 这些文件被页面引用但不存在，需从 ../图片资源-全量 恢复')
} else {
  console.log('  ✅ 无缺失')
}
