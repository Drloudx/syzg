import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const sources = JSON.parse(readFileSync(new URL('../../public/data/parsed/item-sources.json', import.meta.url), 'utf8'))
async function openItem(page, id) {
  await page.goto(`/#/items?itemId=${id}`)
  await expect(page.locator('.app-container')).not.toHaveClass(/is-boot-loading/)
  for (let attempt = 0; attempt < 10; attempt++) {
    const close = page.locator('.ui-modal-overlay.is-teleported .ui-modal-close:visible').first()
    if (!await close.count()) break
    await close.click()
    await page.waitForTimeout(100)
  }
  const modal = page.locator('.app-main > .ui-modal-host .ui-modal-overlay')
  await expect(modal.getByRole('heading', { name: '获取途径', exact: true })).toBeVisible()
  return modal
}
async function group(modal, name) {
  const section = modal.locator('.ui-accordion').filter({ has: modal.page().getByRole('button', { name, exact: true }) })
  await section.getByRole('button', { name, exact: true }).click()
  return section
}

test('named contract opens its self-select parent and returns without losing the child', async ({ page }, testInfo) => {
  const modal = await openItem(page, 'item_59050')
  const section = await group(modal, '礼包与道具')
  await expect(section).toContainText('自选指名契约书')
  await expect(section).toContainText('自选获得')
  await page.screenshot({ path: testInfo.outputPath('contract-source.png') })
  await section.locator('.drawer-chip').click()
  await expect(modal.locator('.ui-modal-title')).toHaveText('自选指名契约书')
  await expect(modal).toContainText('指名契约书：米拉贝尔')
  await modal.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(modal.locator('.ui-modal-title')).toHaveText('指名契约书：米拉贝尔')
})

test('daily, tower and dismantling sources stay concise with no dead navigation', async ({ page }, testInfo) => {
  for (const [id, name, expected] of [
    ['item_00001', '日常计划', '通关结算奖励'],
    ['item_19015', '日常计划', '水火矿洞三层'],
    ['item_25002', '塔层奖励', '神匠之塔'],
    ['item_10075', '装备分解', '第 3 阶']
  ]) {
    const modal = await openItem(page, id)
    const section = await group(modal, name)
    await expect(section).toContainText(expected)
    await expect(section.locator('.source-action-text')).toHaveCount(0)
    await expect(section).not.toContainText('当前未发现正式来源')
    await expect(section).not.toContainText('存在测试配置引用')
    if (name === '日常计划') {
      await expect(section).toContainText('通关结算奖励')
      await expect(section).not.toContainText('通关《')
      await expect(section).not.toContainText('消耗：')
      /*
       * 这条原本只断言 `not.toContainText('单次抽取')` —— 但**界面早就不用这个词了**
       * （改成「概率 X%」），所以它已经变成恒真，等于没测。
       *
       * 意图是"日常计划里不该出现抽取概率那套文案"，所以新旧两种写法一起挡，
       * 这样界面无论回到哪种措辞都仍然有效。
       */
      await expect(section).not.toContainText('单次抽取')
      await expect(section).not.toContainText('概率 ')
      await page.screenshot({ path: testInfo.outputPath(`daily-source-${id}.png`) })
    }
  }
})

test('egg source opens the actual pet pool details', async ({ page }) => {
  const modal = await openItem(page, 'pet_074')
  const section = await group(modal, '招募与贩售')
  await section.locator('.drawer-chip').filter({ hasText: '特别贩售' }).click()
  // pool 用**完整 pool id**（`pet:1:1:0`），不是 poolTypeId（`1`）：
  // GachaView 的 syncFromRoute 按 pool.id 校验，传 poolTypeId 会被判无效并回退默认池。
  await expect(page).toHaveURL(/#\/gacha\?kind=pet&pool=pet:1:1:0&view=pool/)
  // 概率详情的标题由 GachaTipPanel 按池名生成（`${pool.name} · 概率详情`）。
  // 不要写成「卡池详情」—— 那个文案在源码中不存在。
  await expect(page.locator('.tip-panel__title')).toHaveText('特别贩售 · 概率详情')
  // 滚动容器是 `.tip-scroll`（不要写成 `#gachaScroll`，那个 id 在源码中不存在）。
  await expect(page.locator('.tip-scroll')).toContainText('宝石迷迷可的蛋')
})

test('unappraised rune navigates to its dungeon source', async ({ page }, testInfo) => {
  const modal = await openItem(page, 'item_19300')
  const section = await group(modal, '副本掉落')
  await section.locator('.drawer-chip').first().click()
  await expect(page).toHaveURL(/#\/dungeons\?battle=/)
  // 材料来源已收敛为「每个副本一行」并统一定位到结算区，不再逐条指向宝箱，
  // 所以这里只验「能落到该副本的关卡详情且奖励区可见」。
  await expect(page.locator('[data-source-entry]').first()).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: testInfo.outputPath('dungeon-source.png') })
})

test('dungeon sources open the dungeon detail and locate the settlement reward section', async ({ page }) => {
  // 副本来源已按副本聚合为一条（说明统一「副本掉落」、定位统一到结算区），
  // 所以只验一件事：点「前往」能落到该副本的关卡详情，并定位到结算奖励区。
  for (const id of ['item_20016', 'item_00002', 'item_10043']) {
    const source = sources[id].find(source => source.type === 'dungeon')
    expect(source, `${id} 应有副本来源`).toBeTruthy()
    expect(source.des).toBe('副本掉落')

    const modal = await openItem(page, id)
    const section = await group(modal, '副本掉落')
    const chip = section.locator('.drawer-chip').filter({ hasText: source.name }).first()
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(page).toHaveURL(/#\/dungeons\?battle=/)
    await expect(page.locator(`[data-source-entry="${source.dropEntry}"]`).first()).toBeVisible()
    await expect.poll(() => page.evaluate(entry => {
      const element = [...document.querySelectorAll('[data-source-entry]')].find(el => el.dataset.sourceEntry === entry)
      if (!element) return false
      const box = element.getBoundingClientRect()
      return box.top < window.innerHeight && box.bottom > 0
    }, source.dropEntry)).toBe(true)
    await expect(page.getByRole('button', { name: '通关结算掉落' })).toHaveAttribute('aria-expanded', 'true')
  }
})
