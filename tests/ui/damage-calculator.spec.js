import path from 'node:path'
import { expect, test } from '@playwright/test'

const SCRATCH_DIR =
  'C:/Users/Drloud/.gemini/antigravity/brain/847c7e7a-a7d9-4b99-bf78-bafaddd89801/scratch'

const dismissGlobalModals = async (page) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll('.ui-modal-overlay.is-teleported .ui-modal-close')]
        .find((el) => el.getClientRects().length > 0)
      if (!button) return false
      button.click()
      return true
    })
    if (!clicked) break
    await page.waitForTimeout(250)
  }
}

test('伤害计算器支持直达 URL、手填面板计算、怪物预设带入与深色模式适配', async ({ page, isMobile }) => {
  test.setTimeout(90_000)
  await page.goto('/#/sims?tab=damage')
  await dismissGlobalModals(page)
  await expect(page.locator('.dc-hero-name')).toBeVisible({ timeout: 45_000 })
  await dismissGlobalModals(page)

  // 0. 校验默认面板数值（等级 50、双攻 4500、暴击率 10%、暴击伤害 155%、目标等级 50）且隐藏装备特效未展示
  await expect(page.locator('.dc-field', { hasText: '角色等级' }).locator('input')).toHaveValue('50')
  await expect(page.locator('.dc-field', { hasText: '物理攻击' }).locator('input')).toHaveValue('4500')
  await expect(page.locator('.dc-field', { hasText: '魔法攻击' }).locator('input')).toHaveValue('4500')
  await expect(page.locator('.dc-field', { hasText: '暴击率' }).locator('input')).toHaveValue('10')
  await expect(page.locator('.dc-field', { hasText: '暴击伤害' }).locator('input')).toHaveValue('155')
  await expect(page.locator('.dc-field', { hasText: '目标等级' }).locator('input')).toHaveValue('50')
  await expect(page.locator('.dc-metric-box--dps')).toBeVisible()
  await expect(page.locator('.dc-dps-card')).toBeVisible()
  await expect(page.locator('.dc-subfield-title')).toContainText('战斗额外增伤（二区独立乘区）')
  await expect(page.locator('.dc-field', { hasText: '前置一区增伤' })).toHaveCount(0)

  // 0.1 验证「基准方案 A」对比、「攻速加成」影响 DPS、「词条边际收益分析」与「预设存档」
  await page.locator('.dc-result-card .dc-target-actions button', { hasText: '设为对比基准 A' }).click()
  await expect(page.locator('.dc-benchmark-bar')).toBeVisible()
  const aspdInput = page.locator('.dc-field', { hasText: '攻速加成' }).locator('input')
  await aspdInput.fill('100')
  await expect(page.locator('.dc-metric-box--dps .dc-delta-badge.is-up')).toContainText('+')
  await page.locator('.dc-result-card .dc-target-actions button', { hasText: '取消对比' }).click()
  await aspdInput.fill('0')

  await page.locator('.dc-weights-box .dc-collapse-btn').click()
  await expect(page.locator('.dc-weight-row').first()).toBeVisible()
  await page.locator('.dc-dps-card').screenshot({ path: path.join(SCRATCH_DIR, `damage-calc-dps-${isMobile ? 'mobile' : 'desktop'}.png`), animations: 'disabled' })
  await page.locator('.dc-dps-card button', { hasText: '自定义爆发轴' }).click()
  await expect(page.locator('.dc-dps-toolbar')).toContainText('爆发轴总耗时')
  await expect(page.locator('.dc-weights-box .dc-caveat-bar')).toContainText('自定义爆发轴模式')
  await page.locator('.dc-dps-card button', { hasText: '自动木桩循环' }).click()

  await page.locator('.dc-hero-actions button', { hasText: '预设存档' }).click()
  await page.locator('.dc-preset-name-input').fill('测试奇瓦方案')
  await page.locator('.dc-presets-drawer button', { hasText: '保存当前方案' }).click()
  await expect(page.locator('.dc-preset-chip', { hasText: '测试奇瓦方案' })).toBeVisible()
  await page.locator('.dc-preset-chip .dc-preset-del-btn').first().click()
  await page.locator('.dc-hero-actions button', { hasText: '预设存档' }).click()
  const tag = isMobile ? 'mobile' : 'desktop'
  await page.locator('.dc-columns').screenshot({ path: path.join(SCRATCH_DIR, `damage-calc-columns-${tag}.png`), animations: 'disabled' })
  for (const hiddenLabel of ['花圃守护者', '霜寒守护者', '世界树的枝桠', '诅咒', '反击']) {
    await expect(page.locator('.dc-effect-chip-btn', { hasText: hiddenLabel })).toHaveCount(0)
  }

  // 1. 验证「切换角色」弹窗（魔物出战同款筛选 + 6列立绘网格）可正常在视口中弹出、筛选、加载立绘并完成切换
  await page.locator('.dc-hero-actions button', { hasText: '切换角色' }).click()
  const heroModal = page.locator('.ui-modal-overlay.is-teleported .ui-modal-window').last()
  await expect(heroModal).toBeVisible()
  await expect(heroModal.locator('.ui-filter-row', { hasText: '职业：' })).toBeVisible()
  const heroBox = await heroModal.boundingBox()
  const viewport = page.viewportSize()
  expect(heroBox && heroBox.height > 150 && heroBox.y >= 0 && heroBox.y < viewport.height).toBeTruthy()
  await page.screenshot({ path: path.join(SCRATCH_DIR, `damage-calc-hero-modal-${tag}.png`), animations: 'disabled' })
  const heroCardImgSrc = await heroModal.locator('.hero-pick-card img').first().getAttribute('src')
  expect(heroCardImgSrc || '').toContain('_ka.webp')
  expect(heroCardImgSrc || '').not.toContain('undefined')

  await heroModal.locator('.ui-filter-row', { hasText: '职业：' }).locator('button', { hasText: '近卫' }).click()
  await heroModal.locator('input').first().fill('迦南')
  await heroModal.locator('.hero-pick-card', { hasText: '迦南' }).first().click()
  await expect(page.locator('.dc-hero-name')).toHaveText('迦南')
  await expect(heroModal).toBeHidden()
  await expect(page.locator('.dc-field', { hasText: '暴击伤害' }).locator('input')).toHaveValue('155')

  // 切回「奇瓦」，验证被动天赋（火种引燃）与焚火冲击（2段技能）均可点击并结算
  await page.locator('.dc-hero-actions button', { hasText: '切换角色' }).click()
  await heroModal.locator('.ui-filter-row', { hasText: '职业：' }).locator('button', { hasText: '全部' }).click()
  await heroModal.locator('input').first().fill('奇瓦')
  await heroModal.locator('.hero-pick-card', { hasText: '奇瓦' }).first().click()
  await expect(page.locator('.dc-hero-name')).toHaveText('奇瓦')

  const talentBtn = page.locator('.dc-skill-btn.is-talent', { hasText: '火种引燃' })
  await expect(talentBtn).toBeVisible()
  // 普攻不显示占位图标
  await expect(page.locator('.dc-skill-btn').first().locator('img')).toHaveCount(0)
  await talentBtn.click()
  await expect(page.locator('.dc-skill-desc')).toContainText('火种')

  // 点击「全部满星」，验证星阶技能激活（01908 给火种引燃追加第 2 段 30% 伤害）
  await page.locator('.dc-stars-head button', { hasText: '全部满星' }).click()
  await expect(page.locator('.dc-star-card.is-active')).toHaveCount(4)
  await expect(page.locator('.dc-segments-wrap')).toContainText('共 2 段')
  await page.locator('.dc-stars-head button', { hasText: '清空星阶' }).click()
  await expect(page.locator('.dc-star-card.is-active')).toHaveCount(0)

  // 切换到焚火冲击（2段技能），验证 DoT 总伤汇总、分段明细与八步白盒第1/2段切换
  await page.locator('.dc-skill-btn', { hasText: '焚火冲击' }).click()
  await expect(page.locator('.dc-dot-summary-bar')).toContainText('共 8 跳')
  await expect(page.locator('.dc-segments-wrap')).toBeVisible()
  await page.locator('.dc-steps-wrap .dc-collapse-btn').click()
  await expect(page.locator('.dc-steps-seg-tabs button', { hasText: '第 2 段' })).toBeVisible()
  await page.locator('.dc-steps-seg-tabs button', { hasText: '第 2 段' }).click()
  await expect(page.locator('.dc-steps-grid')).toBeVisible()

  // 切到「德莉」，验证召唤物独立输出结算与循环占比，并通过 URL 短码还原
  await page.locator('.dc-hero-actions button', { hasText: '切换角色' }).click()
  await heroModal.locator('input').first().fill('德莉')
  await heroModal.locator('.hero-pick-card', { hasText: '德莉' }).first().click()
  await expect(page.locator('.dc-hero-name')).toHaveText('德莉')
  await page.locator('.dc-skill-btn', { hasText: '征召号令' }).click()
  await expect(page.locator('.dc-result-grid .dc-metric-box--span2')).toContainText('弓箭手护卫')
  await expect(page.locator('.dc-result-grid .dc-metric-box--span2')).toContainText('剑盾护卫')
  await expect(page.locator('.dc-dps-share-legend')).toContainText('召唤物')
  await page.screenshot({ path: path.join(SCRATCH_DIR, `damage-calc-deli-${tag}.png`), animations: 'disabled' })

  // 用分享短码 URL 直达还原（纯客户端解码，不经服务端）
  await page.goto('/#/sims?tab=damage&c=DC2:eyJoIjoiaGVyb18wMTkiLCJhIjp7Im1hZ2ljQXRrIjo1NTAwfX0')
  await expect(page.locator('.dc-hero-name')).toHaveText('奇瓦', { timeout: 45_000 })
  await expect(page.locator('.dc-field', { hasText: '魔法攻击' }).locator('input')).toHaveValue('5500')
  // 重置回默认 4500 面板并选中焚火冲击供后续怪物测试
  await page.locator('.dc-hero-actions button', { hasText: '重置面板' }).click()
  await expect(page.locator('.dc-field', { hasText: '魔法攻击' }).locator('input')).toHaveValue('4500')
  await page.locator('.dc-skill-btn', { hasText: '焚火冲击' }).click()

  // 2. 滚到下方目标卡点击「选择游戏怪物」，验证卡片矩阵弹窗在视口内可见、筛选生效且可选中
  const pickMonBtn = page.locator('.dc-form-card .dc-target-actions .dc-mini-btn').nth(1)
  await pickMonBtn.scrollIntoViewIfNeeded()
  await pickMonBtn.click()
  const monModal = page.locator('.ui-modal-overlay.is-teleported .ui-modal-window').last()
  await expect(monModal).toBeVisible()
  await expect(monModal.locator('.ui-filter-row', { hasText: '阶位：' })).toBeVisible()
  await expect(monModal.locator('.ui-filter-row', { hasText: '弱点：' })).toBeVisible()
  const monBox = await monModal.boundingBox()
  expect(monBox && monBox.height > 150 && monBox.y >= 0 && monBox.y < viewport.height).toBeTruthy()
  await page.screenshot({ path: path.join(SCRATCH_DIR, `damage-calc-mon-modal-${tag}.png`), animations: 'disabled' })
  // 验证黑森林隐藏怪物已通过通用黑名单过滤
  await monModal.locator('input').first().fill('吵吵蕈')
  await expect(monModal.locator('.dc-mon-pick-card')).toHaveCount(0)
  await monModal.locator('input').first().fill('砂蜘蛛毒卫')
  await monModal.locator('.dc-mon-pick-card', { hasText: '砂蜘蛛毒卫' }).first().click()
  await expect(page.locator('.dc-monster-preset-bar')).toBeVisible()

  // 修改目标等级（27级），验证「套用等级」同步变为 Lv.27 且怪物防御重算
  const phyDefInput = page.locator('.dc-field', { hasText: '物理防御' }).locator('input')
  const defAtDefaultLevel = await phyDefInput.inputValue()
  const tgtLevelInput = page.locator('.dc-field', { hasText: '目标等级' }).locator('input')
  await tgtLevelInput.fill('27')
  await expect(page.locator('.dc-mon-preset-row').first()).toContainText('Lv.27')
  const defAt27 = await phyDefInput.inputValue()
  expect(Number(defAt27)).toBeLessThan(Number(defAtDefaultLevel))

  // 切选「角猪」Lv.1，验证双防保留 rawDef × coeff 小数精度（132 × 1.36 = 179.52）且不再显示「关卡攻防修正」
  await pickMonBtn.click()
  await monModal.locator('input').first().fill('角猪')
  await monModal.locator('.dc-mon-pick-card', { hasText: '角猪' }).first().click()
  await tgtLevelInput.fill('1')
  await expect(phyDefInput).toHaveValue('179.52')
  const magicDefInput = page.locator('.dc-field', { hasText: '魔法防御' }).locator('input')
  await expect(magicDefInput).toHaveValue('68')
  await expect(page.locator('.dc-monster-preset-bar')).not.toContainText('关卡攻防修正')

  // 3. 验证第 4 节「魔物特性与装备/套装特效」弹窗选宠、套装与词条切换实时影响伤害数字
  const noCritMetric = page.locator('.dc-result-grid .dc-metric-box').first().locator('.dc-metric-val')
  const baseDmgText = (await noCritMetric.textContent()) || '0'
  const baseDmgVal = Number(baseDmgText.replace(/,/g, ''))

  await page.locator('.dc-pet-empty-row button', { hasText: '选择出战魔物特性' }).click()
  const petModal = page.locator('.ui-modal-overlay.is-teleported .ui-modal-window').last()
  await expect(petModal).toBeVisible()
  await petModal.locator('input').first().fill('真护之黑龙')
  await petModal.locator('.dc-mon-pick-card', { hasText: '真护之黑龙' }).first().click()
  await expect(page.locator('.dc-pet-active-card')).toContainText('真护之黑龙')

  await page.locator('.dc-effect-chip-btn', { hasText: '荒原守护者 (2件)' }).click()
  await page.locator('.dc-effect-chip-btn', { hasText: '高温' }).click()
  await expect(page.locator('.dc-effect-summary-bar')).toContainText('火伤')
  await expect(page.locator('.dc-effect-summary-bar')).toContainText('事件独立连乘')

  const boostedDmgVal = Number(((await noCritMetric.textContent()) || '0').replace(/,/g, ''))
  expect(boostedDmgVal).toBeGreaterThan(baseDmgVal)

  // 4. 验证星阶详细说明「点开才显示、悬停不切换」且每枚星阶拥有独立「启用 / 已启用」按钮；切乌尔勒召唤技能置顶输出 + 圣骑士联动
  const firstStarCard = page.locator('.dc-star-card').first()
  await expect(page.locator('.dc-star-detail-box')).toHaveCount(0)
  await firstStarCard.hover()
  await expect(page.locator('.dc-star-detail-box')).toHaveCount(0)
  await firstStarCard.locator('.dc-star-main').click()
  await expect(page.locator('.dc-star-detail-box')).toBeVisible()
  await expect(page.locator('.dc-star-detail-box .dc-star-desc')).toContainText('%')
  await firstStarCard.locator('.dc-star-enable-btn').click()
  await expect(firstStarCard).toHaveClass(/is-active/)
  await expect(firstStarCard.locator('.dc-star-enable-btn')).toHaveText('已启用')
  await page.locator('.dc-star-detail-box button', { hasText: '收起' }).click()
  await expect(page.locator('.dc-star-detail-box')).toHaveCount(0)

  await page.locator('.dc-hero-actions button', { hasText: '切换角色' }).click()
  const wuerleHeroModal = page.locator('.ui-modal-overlay.is-teleported .ui-modal-window').last()
  await expect(wuerleHeroModal).toBeVisible()
  await wuerleHeroModal.locator('input').first().fill('乌尔勒')
  await wuerleHeroModal.locator('.hero-pick-card', { hasText: '乌尔勒' }).first().click()

  await page.locator('.dc-skill-btn', { hasText: '追击指令' }).click()
  await expect(page.locator('.dc-result-grid .dc-metric-box--span3')).toHaveCount(0)
  await expect(page.locator('.dc-result-grid')).toContainText('召唤单次普攻')
  await expect(page.locator('.dc-result-grid')).toContainText('召唤物折算秒伤')

  const summonBoxVal = page.locator('.dc-result-grid .dc-metric-box').first().locator('.dc-metric-val')
  const baseSummonHit = Number(((await summonBoxVal.textContent()) || '0').replace(/[^\d.]/g, ''))

  await page.locator('.dc-pet-active-card button', { hasText: '更换魔物' }).click()
  const slimeModal = page.locator('.ui-modal-overlay.is-teleported .ui-modal-window').last()
  await expect(slimeModal).toBeVisible()
  await slimeModal.locator('input').first().fill('圣骑士史莱姆')
  await slimeModal.locator('.dc-mon-pick-card', { hasText: '圣骑士史莱姆' }).first().click()
  await expect(page.locator('.dc-pet-active-card')).toContainText('圣骑士史莱姆')
  await page.locator('.dc-pet-active-card input[type="number"]').fill('4')

  const slimeSummonHit = Number(((await summonBoxVal.textContent()) || '0').replace(/[^\d.]/g, ''))
  expect(slimeSummonHit).toBeGreaterThan(baseSummonHit * 1.7)

  // 校验桌面与手机均无横向溢出
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)

  await page.screenshot({ path: path.join(SCRATCH_DIR, `damage-calc-light-${tag}.png`), animations: 'disabled' })

  // 切深色模式校验背景和主数字对比度
  await page.evaluate(() => {
    document.documentElement.classList.add('dark-mode')
    document.querySelector('.app-container')?.classList.add('dark-mode', 'dark-theme')
  })
  await page.waitForTimeout(300)

  const darkColors = await page.evaluate(() => {
    const panel = document.querySelector('.dc-panel')
    const val = document.querySelector('.dc-metric-val')
    return {
      panelBg: panel ? getComputedStyle(panel).backgroundColor : '',
      valColor: val ? getComputedStyle(val).color : '',
    }
  })
  expect(darkColors.panelBg).not.toBe('rgb(247, 239, 225)')
  expect(darkColors.valColor).not.toBe('rgb(43, 31, 21)')

  await page.screenshot({ path: path.join(SCRATCH_DIR, `damage-calc-dark-${tag}.png`), animations: 'disabled' })
})
