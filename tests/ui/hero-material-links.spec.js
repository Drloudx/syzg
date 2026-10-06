import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/data/notice.json*', route => route.fulfill({ json: { notices: [] } }))
})

test('opens an item detail from a hero skill upgrade material', async ({ page }) => {
  await page.goto('/#/heroes?id=hero_019')

  const heroDetail = page.locator('#heroModalScroll')
  await expect(heroDetail).toBeVisible()
  await heroDetail.locator('.skill-select-card', { hasText: '焚火冲击' }).click()
  await expect(heroDetail.locator('.skill-meta-tags')).toContainText('CD:')
  await expect(heroDetail.locator('.skill-meta-tags')).toContainText('消耗:')

  /*
   * 技能等级控件在 2026-09-25（`dafd3e94`）从「双滑块 + 两个数字输入」重做成
   * 「单滑块 + ＋/－ 步进按钮」（`.calc-range-slider.skill-level-range-input`）。
   *
   * 本用例此前仍在找 `.dual-level-slider` / `.dual-slider-input--target` ——
   * 那两个类在 `src/` 里**已经不存在**，所以 `click` 永远超时。
   * 这里按现行控件改：点「提升一级」把等级推离 1，再验证材料入口。
   * （Lv.1 的消耗里还有「火之结晶」，升到 Lv.2 只剩「火之碎片」，正好证明等级真的变了。）
   */
  const levelValue = heroDetail.locator('.skill-slider-current')
  await expect(levelValue).toHaveText('Lv.1')
  await heroDetail.getByRole('button', { name: '提升一级' }).click()
  await expect(levelValue).toHaveText('Lv.2')

  const material = heroDetail.locator('.cost-item-pill[data-item-id="item_19012"]')
  await expect(material).toBeVisible()
  await expect(material).toHaveAttribute('title', '火之碎片（点击查看物品）')
  await material.click()

  await expect(page).toHaveURL(/#\/heroes\?(?=.*id=hero_019)(?=.*itemId=item_19012)/)
  await expect(page.getByRole('dialog', { name: '火之碎片' })).toBeVisible()
})
