import { expect, test } from '@playwright/test'

const dismissGlobalModals = async (page) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll('.ui-modal-overlay.is-teleported .ui-modal-close')]
        .find(element => element.getClientRects().length > 0)
      if (!button) return false
      button.click()
      return true
    })
    if (!clicked) break
    await page.waitForTimeout(250)
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/data/notice.json*', (route) => route.fulfill({ json: { notices: [] } }))
})

test('驻足聆听 / 偶遇事件隐藏已收集筛选并支持双池切换，刷新机制展示源码口径', async ({ page }) => {
  test.setTimeout(90_000)
  const errors = []
  page.on('pageerror', err => errors.push(err.message))

  // 1. 驻足聆听 / 偶遇事件分支：不显示「状态：/已收集」，改为「事件：全部 / 驻足聆听 / 偶遇事件」切换
  await page.goto('/#/misc?tab=hidden&type=encounter')
  await dismissGlobalModals(page)
  await expect(page.locator('.hidden-list-row').first()).toBeVisible({ timeout: 20_000 })

  const filterPanel = page.locator('.filter-panel')
  await expect(filterPanel).not.toContainText('状态：')
  await expect(filterPanel).not.toContainText('已收集')
  await expect(filterPanel).toContainText('事件：')
  await expect(filterPanel).toContainText('共有 51 个点位')
  await expect(page.locator('.hidden-list-row .ui-collection-toggle')).toHaveCount(0)

  await filterPanel.getByRole('button', { name: '驻足聆听', exact: true }).click()
  await expect(page).toHaveURL(/kind=listening/)
  await expect(filterPanel).toContainText('共有 20 个点位')

  await filterPanel.getByRole('button', { name: '偶遇事件', exact: true }).click()
  await expect(page).toHaveURL(/kind=encounter/)
  await expect(filterPanel).toContainText('共有 31 个点位')

  // 2. 被隐藏的物品分支：仍保留「状态：全部 / 已收集 / 未收集」与收集开关
  await page.goto('/#/misc?tab=hidden&type=hidden')
  await dismissGlobalModals(page)
  await expect(filterPanel).toContainText('状态：')
  await expect(filterPanel).toContainText('已收集')
  await expect(page.locator('.hidden-list-row .ui-collection-toggle').first()).toBeVisible({ timeout: 15_000 })

  // 3. 魔物蛋巢分支：仅收录地图野外蛋巢，无已收集状态栏，支持稀有蛋概率展示
  await page.goto('/#/misc?tab=hidden&type=nest')
  await dismissGlobalModals(page)
  await expect(page.locator('.hidden-list-row').first()).toBeVisible({ timeout: 20_000 })
  await expect(filterPanel).not.toContainText('状态：')
  await expect(filterPanel).not.toContainText('已收集')
  await expect(filterPanel).toContainText('共有 19 个点位')
  await expect(page.locator('.hidden-list-row .ui-collection-toggle')).toHaveCount(0)
  await expect(page.locator('.hidden-list-row').first()).toContainText('魔物蛋巢')
  await expect(page.locator('.hidden-list-row').first()).toContainText('消耗 1 体力 · 每日 04:00 重置')
  await expect(page.locator('.hidden-list-row').first()).toContainText('概率 2%')

  // 4. 刷新机制分支：验证校准后的描述（不含副本蛋巢）
  await page.goto('/#/misc?tab=hidden&type=rules')
  await dismissGlobalModals(page)
  const rulesContainer = page.locator('.hidden-rules-container')
  await expect(rulesContainer).toBeVisible({ timeout: 15_000 })
  await expect(rulesContainer).toContainText('被隐藏的物品 / 书籍 / ？？？')
  await expect(rulesContainer).toContainText('凌晨 04:00')
  await expect(rulesContainer).toContainText('WeatherEffect')
  await expect(rulesContainer).toContainText('各自独立成池、互不占用次数')
  await expect(rulesContainer).toContainText('魔物蛋巢')
  await expect(rulesContainer).toContainText('消耗 1 体力 (collect_white)')
  await expect(rulesContainer).not.toContainText('副本')

  expect(errors).toEqual([])
})
