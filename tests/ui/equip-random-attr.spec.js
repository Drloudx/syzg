import { expect, test } from '@playwright/test'

const dismissGlobalModals = async page => {
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

test('装备列表筛选同步 URL、补全百分比单位、图标模式带羊皮纸容器且 PC 7 列/手机 5 列，可打开词条速查', async ({ page, isMobile }) => {
  await page.goto('/#/equip?q=%E6%B9%96%E6%99%B6%E9%95%BF%E5%88%80')
  await dismissGlobalModals(page)

  const retryBtn = page.getByRole('button', { name: '重新加载' })
  const entry = page.locator('.equip-entry', { hasText: '湖晶长刀' }).first()
  if (await retryBtn.isVisible().catch(() => false)) {
    await retryBtn.click()
  }
  await expect(entry).toBeVisible()
  await expect(entry.locator('.equip-entry__effect')).toContainText('暴击抗性增加 5%')
  await expect(entry.locator('.equip-entry__meta')).toContainText('3 阶')

  await page.getByRole('button', { name: '图标模式' }).click()
  const gridPanel = page.locator('#itemsGridScroll')
  await expect(gridPanel).toHaveClass(/paper-panel/)
  await expect(gridPanel).toHaveClass(/items-card-grid/)

  const cols = await page.locator('#itemsGridScroll .ui-card-grid').evaluate(el =>
    getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length
  )
  expect(cols).toBe(isMobile ? 5 : 7)

  await page.getByRole('button', { name: '图文模式' }).click()
  await page.getByRole('button', { name: '随机词条速查' }).click()

  const guideModal = page.locator('.page-view-container > .ui-modal-host .ui-modal-overlay')
  await expect(guideModal).toBeVisible()
  await expect(guideModal).toContainText('词条品质：')
  await expect(guideModal.getByRole('button', { name: '橙', exact: true })).toHaveClass(/is-active/)
  await expect(guideModal.getByRole('button', { name: '全部', exact: true })).toHaveCount(0)
  await expect(guideModal.getByRole('button', { name: '红', exact: true })).toHaveCount(0)
  await guideModal.getByRole('button', { name: '3级', exact: true }).click()
  await expect(guideModal).toContainText('68~75')
  await expect(guideModal).toContainText('4%')
  await expect(guideModal).toContainText('2%')
  await expect(guideModal).toContainText('暴击抗性')
  await expect(guideModal).not.toContainText('暴击抵抗')

  await guideModal.getByRole('button', { name: '白', exact: true }).click()
  await expect(guideModal).toContainText('38~45')
})

test('装备详情显示百分比单位，且随机属性位于特殊效果下方并支持展开切换词条品质', async ({ page }) => {
  await page.goto('/#/equip?itemId=item_412004')
  await dismissGlobalModals(page)

  const modal = page.locator('.app-main > .ui-modal-host .ui-modal-overlay')
  await expect(modal).toBeVisible()
  await expect(modal.locator('.ui-stat-grid').first()).toContainText('暴击抗性')
  await expect(modal.locator('.ui-stat-grid').first()).toContainText('+5%')

  const sections = await modal.locator('.ui-section .ui-section__title').allTextContents()
  const affixIdx = sections.findIndex(t => t.includes('可携带效果'))
  const randomIdx = sections.findIndex(t => t.includes('随机属性'))
  expect(affixIdx).toBeGreaterThan(-1)
  expect(randomIdx).toBeGreaterThan(affixIdx)

  const randomSection = modal.locator('.ui-section', { hasText: '随机属性' })
  await expect(randomSection).toContainText(/传说品质生成\s*3 条/)

  await randomSection.getByRole('button', { name: /查看 1~10 级词条池/ }).click()
  await expect(randomSection.getByRole('button', { name: '橙', exact: true })).toHaveClass(/is-active/)
  await expect(randomSection).toContainText('68~75')
  await randomSection.getByRole('button', { name: '白', exact: true }).click()
  await expect(randomSection).toContainText('38~45')

  await modal.locator('.ui-modal-close').click()
  await expect(modal).toBeHidden()

  // noRandomAbility 装备不展示随机属性词条池
  await page.goto('/#/equip?itemId=item_507002')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText('该装备不会生成随机词条')
  await expect(modal.locator('.ui-section__title', { hasText: '随机属性' })).toHaveCount(0)
})
