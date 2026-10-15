// 只读验证：事件图鉴的地区筛选按钮与列表，不应出现隐藏地区
import { test, expect } from '@playwright/test'

test('事件图鉴：隐藏地区不出现在筛选按钮与列表中', async ({ page }) => {
  await page.goto('/#/events')
  await page.waitForSelector('.collection-counter', { timeout: 30_000 })

  // 1. 筛选按钮里不应有黑森林 / 霜烬平原
  const pills = page.locator('.ui-filter-pill')
  const texts = await pills.allInnerTexts()
  const joined = texts.join(' | ')
  console.log('筛选胶囊：', joined)
  expect(joined).not.toContain('黑森林')
  expect(joined).not.toContain('霜烬平原')

  // 2. 随机事件计数
  const counter = await page.locator('.collection-counter').innerText()
  console.log('随机事件计数：', counter.replace(/\s+/g, ' '))

  // 3. 列表里不应出现那两张只属于隐藏地区的卡
  const cards = page.locator('.ui-item-card')
  const cardText = (await cards.allInnerTexts()).join(' | ')
  expect(cardText).not.toContain('逃跑的蕈人')
  expect(cardText).not.toContain('攀登雪山')

  // 4. 切到探索区域，计数应为 48
  await page.getByText('探索区域', { exact: true }).first().click()
  await page.waitForTimeout(600)
  const exploreCounter = await page.locator('.collection-counter').innerText()
  console.log('探索区域计数：', exploreCounter.replace(/\s+/g, ' '))
  expect(exploreCounter.replace(/\s+/g, '')).toContain('48')

  // 5. 探索列表里不应出现隐藏地区
  const exploreText = (await page.locator('.ui-item-card').allInnerTexts()).join(' | ')
  expect(exploreText).not.toContain('黑森林')
  expect(exploreText).not.toContain('霜烬平原')

  // 6. 打一个跨地区事件的详情，确认「出现地图」只剩 3 个可见地区
  await page.getByText('随机事件', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.locator('.ui-item-card').filter({ hasText: '废弃的宝箱' }).first().click()
  await page.waitForSelector('.event-map-tags', { timeout: 20_000 })
  const tags = await page.locator('.event-map-tags .ui-tag').allInnerTexts()
  console.log('详情「出现地图」标签：', tags.join(', '))
  expect(tags).not.toContain('黑森林')
  expect(tags).not.toContain('霜烬平原')
  expect(tags.length).toBe(3)

  await page.screenshot({ path: 'test-results/events-blacklist.png', fullPage: false })
})

/**
 * 🔴 图槽背景**不能平铺**。
 *
 * `.ui-item-card__slot` 的背景图是 76×76 的**单格**品质框（`ItemBagPanel/item_f_N.webp`），
 * 而事件页把图槽改成了 16:9 大卡（246×138 量级）。若用 `background:` **简写**写纸色底，
 * 会把 `UiItemCard.vue` 设的 `background-size: 100% 100%` 与 `no-repeat` **重置回初始值**
 * （`auto` / `repeat`）→ 76×76 贴图在槽里平铺成 **3 列 × 2 行 = 6 个格子**。
 *
 * 图片未加载完时最明显（此时槽里没有 `<img>` 遮住背景），用户会当成显示 bug。
 */
test('事件图鉴：图槽品质框不因 background 简写而平铺成 6 格', async ({ page }) => {
  await page.goto('/#/events')
  await page.waitForSelector('.collection-counter', { timeout: 30_000 })

  const slot = page.locator('.ui-item-card__slot').first()
  await expect(slot).toBeVisible({ timeout: 20_000 })

  const style = await slot.evaluate(el => {
    const cs = getComputedStyle(el)
    return { size: cs.backgroundSize, repeat: cs.backgroundRepeat, image: cs.backgroundImage }
  })
  console.log('图槽背景：', JSON.stringify(style))

  expect(style.image, '图槽应仍带品质框背景图').toContain('item_f_')
  expect(style.size, '76×76 单格框必须拉伸铺满，不能按原尺寸平铺').toBe('100% 100%')
  expect(style.repeat, '必须 no-repeat，否则会平铺出多个格子').toBe('no-repeat')
})
