import { expect, test } from '@playwright/test'
import { enableDarkMode } from '../helpers/theme.mjs'

// 本用例逐张比对 5 个分类下的卡片几何、图片解码、以及商品/消耗点击弹窗跳转，累计耗时较长
// 因此单独放宽超时，不改断言强度。
test.setTimeout(150_000)

async function dismissModals(page) {
  for (let i = 0; i < 10; i++) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.ui-modal-overlay.is-teleported .ui-modal-close')]
        .find(el => el.getClientRects().length > 0)
      if (!btn) return false
      btn.click()
      return true
    })
    if (!clicked) break
    await page.waitForTimeout(200)
  }
}

test('ordinary exchanges keep uniform compact shop cards with balanced icon spacing and clickable costs', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#/exchange?cat=shop&sub=keShop')
  await dismissModals(page)
  const shopCard = page.locator('.ui-compact-shop-card').first()
  await expect(shopCard).toBeVisible()
  const measure = card => card.evaluate(el => {
    const frame = el.getBoundingClientRect()
    const icon = el.querySelector('.ui-compact-shop-card__icon').getBoundingClientRect()
    return {
      width: frame.width,
      height: frame.height,
      iconWidth: icon.width
    }
  })
  const reference = await measure(shopCard)
  expect(Math.round(reference.iconWidth)).toBe(testInfo.project.name === 'mobile' ? 52 : 72)
  await page.screenshot({ path: testInfo.outputPath('shop-size-reference.png'), fullPage: true })

  await page.getByRole('button', { name: '委托兑换', exact: true }).click()
  const cards = page.locator('.ui-compact-shop-card')
  await expect(cards.first()).toBeVisible()
  const bounds = await cards.evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect()
    return { top: r.top, width: r.width, height: r.height }
  }))
  expect(bounds.length).toBeGreaterThan(6)
  const columns = bounds.filter(rect => Math.abs(rect.top - bounds[0].top) < 1).length
  expect(columns).toBe(2)
  for (const card of await cards.all()) {
    const actual = await measure(card)
    expect(Math.abs(actual.width - reference.width)).toBeLessThan(1)
    expect(Math.abs(actual.iconWidth - reference.iconWidth)).toBeLessThan(1)
    await expect.poll(() => card.locator('.ui-item-card__icon').evaluate(img => img.naturalWidth)).toBeGreaterThan(0)
  }
  await expect(cards.first().locator('.ui-compact-shop-card__title')).toHaveText('契约书')
  expect(await page.locator('.exchange-page').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('ordinary-uniform.png'), fullPage: true })
  await enableDarkMode(page)
  await page.screenshot({ path: testInfo.outputPath('ordinary-dark.png'), fullPage: true })

  await cards.first().click()
  await expect(page).toHaveURL(/itemId=item_20004/)
  const modal = page.locator('.app-main > .ui-modal-host > .ui-modal-overlay')
  await expect(modal).toBeVisible()
  await modal.locator('.ui-modal-close').click()
  await expect(page).toHaveURL(/cat=entrust/)
  await expect(modal).toBeHidden()

  await cards.first().locator('.ui-compact-shop-cost.is-clickable').click()
  await expect(page).toHaveURL(/itemId=item_29101/)
  await expect(modal).toBeVisible()
  await modal.locator('.ui-modal-close').click()
  await expect(modal).toBeHidden()

  for (const category of ['种子购买', '地牢商人', '活跃兑换']) {
    await page.getByRole('button', { name: category, exact: true }).click()
    await expect(cards.first()).toBeVisible()
    for (const card of await cards.all()) {
      const actual = await measure(card)
      expect(Math.abs(actual.width - reference.width)).toBeLessThan(1)
      await expect.poll(() => card.locator('.ui-item-card__icon').evaluate(img => img.naturalWidth)).toBeGreaterThan(0)
    }
    await page.screenshot({ path: testInfo.outputPath(`uniform-${category}.png`), fullPage: true })
  }
  expect(errors).toEqual([])
})

test('refresh rules move out of seed and rabbit cards and preserve share links and filters', async ({ page }, testInfo) => {
  await page.goto('/#/exchange?cat=seed&sub=random&view=rules')
  await dismissModals(page)
  const panel = page.locator('.exchange-rules')
  const rulesButton = page.getByRole('button', { name: '刷新规则', exact: true })
  await expect(panel).toBeVisible()
  await expect(rulesButton).toHaveClass(/is-active/)
  await expect(page.locator('.ui-compact-shop-card')).toHaveCount(0)
  await expect(panel).toContainText('每池 5 选 2')
  await expect(panel).toContainText('金铃草种子')
  await expect(panel).toContainText('完成《往日的阴影》后解锁')
  await expect(panel).toContainText('完成《融合的真相》后解锁')
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('seed-rules-tab.png'), fullPage: true })
  await page.getByRole('button', { name: '固定商品', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.ui-compact-shop-card')).toHaveCount(4)
  await expect(page.locator('.exchange-summary, .ui-exchange-trade__meta')).toHaveCount(0)
  await expect(page).not.toHaveURL(/view=rules/)

  await page.getByRole('button', { name: '地牢商人', exact: true }).click()
  await expect(page.locator('.filter-panel').getByText('子类：', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '全部候选', exact: true })).toHaveCount(1)
  await expect(rulesButton).toHaveCount(1)
  await page.getByRole('button', { name: '白', exact: true }).click()
  await expect(page.locator('.ui-compact-shop-card')).toHaveCount(3)
  await rulesButton.click()
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('每次共出现 10 项')
  await expect(panel).toContainText('白色池 3 选 1 · 每次可买 2 个')
  await expect(panel).toContainText('绿色池 19 选 4')
  await expect(page).toHaveURL(/view=rules/)
  await page.reload()
  await expect(panel).toBeVisible()
  await expect(rulesButton).toHaveClass(/is-active/)
  await page.screenshot({ path: testInfo.outputPath('rabbit-rules-tab.png'), fullPage: true })
  await enableDarkMode(page)
  await page.screenshot({ path: testInfo.outputPath('rabbit-rules-dark.png'), fullPage: true })
  await page.getByRole('button', { name: '白', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.ui-compact-shop-card')).toHaveCount(3)
  await page.getByRole('button', { name: '活跃兑换', exact: true }).click()
  await expect(page.locator('.filter-panel').getByText('子类：', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 's1', exact: true })).toHaveCount(0)
  await expect(rulesButton).toHaveCount(0)
  await expect(page.locator('.ui-compact-shop-card')).toHaveCount(16)
})
