import { expect, test } from '@playwright/test'

const dismissGlobalModals = async page => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const close = page.locator('.ui-modal-overlay.is-teleported .ui-modal-close:visible').first()
    if (!await close.count()) return
    await close.click()
    await page.waitForTimeout(150)
  }
}

for (const path of ['/equip', '/items']) {
  test(`${path} equipment detail shows source-backed smithing materials`, async ({ page }) => {
    await page.goto(`/#${path}?itemId=item_421013`)
    await dismissGlobalModals(page)

    const modal = page.locator('.app-main > .ui-modal-host .ui-modal-overlay')
    await expect(modal).toBeVisible()
    await expect(modal.getByText('锻造台打造', { exact: true })).toBeVisible()
    await expect(modal.locator('.smithing-recipe__head').getByText('第 4 阶装备打造', { exact: true })).toBeVisible()
    await expect(modal.getByText('蓝 25%', { exact: true })).toBeVisible()
    await expect(modal.getByText('紫 60%', { exact: true })).toBeVisible()
    await expect(modal.getByText('橙 15%', { exact: true })).toBeVisible()
    await expect(modal.getByText('铜锭', { exact: true })).toBeVisible()
    await expect(modal.getByText('结实的板材', { exact: true })).toBeVisible()

    const section = modal.locator('.smithing-recipe')
    const layout = await section.evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      materialCount: element.querySelectorAll('.ui-reward-card').length
    }))
    expect(layout.materialCount).toBe(4)
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)
  })
}

test('smithing material opens its item detail and facility link opens the blacksmith', async ({ page }) => {
  /*
   * 用 **3 阶** 装备（治安队手套）走正向路径。
   *
   * 原先这里用 4 阶的「魔花头盔」，断言「查看锻造台」跳到 `level=4` 后能看到魔花头盔 ——
   * 而 `HIDDEN_EQUIP_TIERS = [4, 5]` 之后设施页不再渲染 4/5 阶，那个断言变成了
   * 「点过去是空列表」这个 bug 的**固化**。现在按可见品阶验证真实可达路径。
   */
  await page.goto('/#/equip?itemId=item_422012')
  await dismissGlobalModals(page)
  const modal = page.locator('.app-main > .ui-modal-host .ui-modal-overlay')
  // 限定在「锻造台打造」那块配方卡内点材料：页面其它区块（同类装备等）也可能出现同名物品
  const smithingSection = modal.locator('.smithing-recipe').last()
  await expect(smithingSection).toBeVisible()
  await smithingSection.getByText('粗糙鳞片', { exact: true }).click()
  await expect(modal.locator('.ui-modal-title')).toHaveText('粗糙鳞片')

  await modal.locator('.ui-modal-close').click()
  await expect(modal.getByText('锻造台打造', { exact: true })).toBeVisible()
  await modal.getByRole('button', { name: '查看锻造台' }).click()
  await expect(page).toHaveURL(/#\/facilities\?facility=blacksmith&mode=equipment&level=3&item=item_422012$/)
  await expect(page.getByText('治安队手套', { exact: true }).first()).toBeVisible()
})

test('hidden equipment tiers expose the recipe but no dead facility link', async ({ page }) => {
  /*
   * 4/5 阶装备被有意隐藏（`HIDDEN_EQUIP_TIERS`）。
   *
   * 配方**本身**仍然展示 —— 它来自真实配置，玩家在游戏里确实能打造；
   * 但「查看锻造台」不能出现：设施页已不渲染该品阶，点过去是空列表。
   * 断言「按钮不在」而不是「整段不在」，这样将来解除品阶隐藏时用例会红并提醒。
   */
  await page.goto('/#/equip?itemId=item_421013')
  await dismissGlobalModals(page)
  const modal = page.locator('.app-main > .ui-modal-host .ui-modal-overlay')
  await expect(modal.getByText('锻造台打造', { exact: true })).toBeVisible()
  await expect(modal.locator('.smithing-recipe__head').getByText('第 4 阶装备打造', { exact: true })).toBeVisible()
  await expect(modal.getByRole('button', { name: '查看锻造台' })).toHaveCount(0)

  // 「获取途径」里的锻造台来源同样不提供「前往」（来源文案保留，它是真实获取途径）
  const smithingSource = modal.locator('.drawer-chip', { hasText: '锻造台' }).first()
  await expect(smithingSource).toBeVisible()
  await expect(smithingSource.locator('.source-action-text')).toHaveCount(0)
})

test('blacklisted facility recipe exposes the recipe but no dead facility link', async ({ page }) => {
  /*
   * 配方因**材料**命中黑名单而被设施页整条滤掉时，物品详情也不应给出「查看设施」。
   *
   * 用「燃烧炼金炸弹」：它自己不在黑名单里（所以详情页能打开、配方区块仍在），
   * 但材料含「魔花花瓣」—— 那一项在「霜烬平原/黑森林相关素材」名单里，
   * 于是工作台 6 级整级被滤空。断言按钮不在，而不是整段不在。
   */
  await page.goto('/#/items?itemId=item_31011')
  await dismissGlobalModals(page)
  const modal = page.locator('.app-main > .ui-modal-host .ui-modal-overlay')
  await expect(modal.getByRole('heading', { name: '设施制作' })).toBeVisible()
  await expect(modal.getByText('工作台 6 级制作', { exact: true })).toBeVisible()
  await expect(modal.getByRole('button', { name: '查看设施' })).toHaveCount(0)
})
