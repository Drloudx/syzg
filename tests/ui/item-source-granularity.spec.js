/**
 * 物品详情的「获取途径」粒度回归：
 *   · 副本掉落**不带难度后缀**，同一副本不再逐难度重复；
 *   · 关卡掉落按 `x-x 关卡名` 出现，且带「前往」可跳 `/chapters?stage=`。
 */
import { expect, test } from '@playwright/test'

const openItem = async (page, itemId) => {
  await page.goto(`/#/items?itemId=${itemId}`)
  await expect(page.locator('.app-container')).not.toHaveClass(/is-boot-loading/)
  for (let i = 0; i < 10; i += 1) {
    const close = page.locator('.ui-modal-overlay.is-teleported .ui-modal-close:visible').first()
    if (!await close.count()) break
    await close.click()
  }
  const modal = page.locator('.app-main > .ui-modal-host .ui-modal-overlay')
  await expect(modal).toBeVisible({ timeout: 20_000 })
  return modal
}

const sourceGroup = (modal, name) =>
  modal.locator('.ui-accordion').filter({ hasText: name }).first()

test('水纹花：副本掉落按副本归并为一行，关卡掉落为 x-x 关卡名', async ({ page }) => {
  const modal = await openItem(page, 'item_10103') // 水纹花

  // ---- 副本掉落 ----
  const dungeon = sourceGroup(modal, '副本掉落')
  await expect(dungeon).toBeVisible({ timeout: 20_000 })
  await dungeon.getByRole('button', { name: '副本掉落', exact: true }).click()
  const rows = dungeon.locator('.drawer-chip')
  const names = await rows.locator('.source-name').allInnerTexts()
  const dess = await rows.locator('.source-des').allInnerTexts()
  console.log('副本来源：', JSON.stringify(names.map((n, i) => `${n} | ${dess[i] || ''}`)))

  expect(names.length).toBeGreaterThan(0)
  for (const n of names) {
    expect(n, `副本名仍带难度后缀：${n}`).not.toContain(' · ')
    for (const suffix of ['浴池·噩梦', '浴池·转化部', '浴池·净化部', '浴池·溶洞部']) {
      expect(n).not.toContain(suffix)
    }
  }
  // 每个副本只留一行 → 副本名不得重复
  expect(new Set(names).size, `同一副本出现多行：${names.join('、')}`).toBe(names.length)
  // 说明统一为「副本掉落」，不再逐条区分结算/宝箱/房间
  for (const d of dess) expect(d, `副本说明未统一：${d}`).toBe('副本掉落')

  // ---- 关卡掉落 ----
  const stage = sourceGroup(modal, '关卡掉落')
  await expect(stage).toBeVisible()
  await stage.getByRole('button', { name: '关卡掉落', exact: true }).click()
  const stageNames = await stage.locator('.drawer-chip .source-name').allInnerTexts()
  console.log('关卡来源名字：', JSON.stringify(stageNames))
  expect(stageNames.length).toBeGreaterThan(0)
  for (const n of stageNames) {
    expect(n, `关卡名不是 x-x 关卡名格式：${n}`).toMatch(/^\d+-\d+ .+/)
    expect(n, `关卡名不应带难度：${n}`).not.toMatch(/简单|普通|困难/)
    expect(n, `关卡名不应带房间：${n}`).not.toContain(' · ')
  }

  // ---- 前往跳转：副本要能落地（不是死链）----
  await dungeon.locator('.drawer-chip.clickable').first().click()
  await expect(page).toHaveURL(/#\/dungeons\?battle=/)
  console.log('副本跳转 URL：', page.url())
  await expect(page.locator('.ui-modal-overlay, .dungeon-detail').first()).toBeVisible({ timeout: 20_000 })
})

test('水纹花：关卡掉落的「前往」跳转到关卡图鉴', async ({ page }) => {
  const modal = await openItem(page, 'item_10103')
  const stage = sourceGroup(modal, '关卡掉落')
  await expect(stage).toBeVisible({ timeout: 20_000 })
  await stage.getByRole('button', { name: '关卡掉落', exact: true }).click()

  const chip = stage.locator('.drawer-chip.clickable').first()
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(page).toHaveURL(/#\/chapters\?stage=c\d+_\d+/)
  console.log('关卡跳转 URL：', page.url())
})
