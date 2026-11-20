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
    await page.waitForTimeout(200)
  }
}

const enableDarkMode = async (page) => {
  await page.evaluate(() => {
    document.documentElement.classList.add('dark-mode')
    const app = document.querySelector('.app-container')
    app?.classList.add('dark-mode', 'dark-theme')
  })
  await page.waitForTimeout(300)
}

const parseRgb = (cssColor) => {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i.exec(cssColor || '')
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

test('神匠之塔深色模式背景、卡片标题、怪物胶囊与兑换弹窗保持可读深色对比', async ({ page, isMobile }) => {
  await page.goto('/#/tower')
  await dismissGlobalModals(page)
  await expect(page.locator('#towerScroll .tower-card').first()).toBeVisible({ timeout: 15000 })

  await enableDarkMode(page)

  const metrics = await page.evaluate(() => {
    const read = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return { color: cs.color, bg: cs.backgroundColor, bgImg: cs.backgroundImage }
    }
    return {
      scroll: read('#towerScroll'),
      card: read('.tower-card'),
      title: read('.tower-card .layer-title'),
      objDesc: read('.tower-card .objective-desc'),
      monPill: read('.tower-card .wave-mon-pill'),
      rewardChip: read('.tower-card .reward-chip'),
      shopBtn: read('.shop-trigger-btn')
    }
  })

  expect(luminance(parseRgb(metrics.scroll.bg))).toBeLessThan(70)
  expect(luminance(parseRgb(metrics.card.bg))).toBeLessThan(75)
  expect(luminance(parseRgb(metrics.title.color))).toBeGreaterThan(180)
  expect(luminance(parseRgb(metrics.objDesc.color))).toBeGreaterThan(180)
  expect(luminance(parseRgb(metrics.monPill.bg))).toBeLessThan(95)
  expect(luminance(parseRgb(metrics.rewardChip.bg))).toBeLessThan(95)
  expect(luminance(parseRgb(metrics.shopBtn.color))).toBeGreaterThan(180)

  const tag = isMobile ? 'mobile' : 'desktop'
  await page.screenshot({ path: path.join(SCRATCH_DIR, `tower-dark-${tag}.png`) })

  // 打开幻象立方兑换弹窗检查深色背景
  await page.locator('.shop-trigger-btn').click()
  await expect(page.locator('.shop-item-card').first()).toBeVisible()
  const shopMetrics = await page.evaluate(() => {
    const card = document.querySelector('.shop-item-card')
    const cost = document.querySelector('.shop-item-card .cost-pill')
    return {
      cardBg: card ? getComputedStyle(card).backgroundColor : '',
      costColor: cost ? getComputedStyle(cost).color : ''
    }
  })
  expect(luminance(parseRgb(shopMetrics.cardBg))).toBeLessThan(90)
  expect(luminance(parseRgb(shopMetrics.costColor))).toBeGreaterThan(180)
})

test('活动副本深色模式列表、标签、事件交互弹窗与兑换弹窗保持可读深色对比', async ({ page, isMobile }) => {
  await page.goto('/#/activity-dungeons')
  await dismissGlobalModals(page)
  await expect(page.locator('#activityDungeonScroll .ad-layer-card').first()).toBeVisible({ timeout: 15000 })

  await enableDarkMode(page)

  const metrics = await page.evaluate(() => {
    const read = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return { color: cs.color, bg: cs.backgroundColor }
    }
    return {
      scroll: read('#activityDungeonScroll'),
      card: read('.ad-layer-card'),
      title: read('.ad-layer-card .ad-layer-title'),
      monPill: read('.ad-layer-card .ad-mon-pill'),
      rewardChip: read('.ad-layer-card .ad-reward-chip'),
      actionBtn: read('.ad-action-btn')
    }
  })

  expect(luminance(parseRgb(metrics.scroll.bg))).toBeLessThan(70)
  expect(luminance(parseRgb(metrics.card.bg))).toBeLessThan(75)
  expect(luminance(parseRgb(metrics.title.color))).toBeGreaterThan(180)
  expect(luminance(parseRgb(metrics.monPill.bg))).toBeLessThan(95)
  expect(luminance(parseRgb(metrics.rewardChip.bg))).toBeLessThan(95)
  expect(luminance(parseRgb(metrics.actionBtn.color))).toBeGreaterThan(180)

  const tag = isMobile ? 'mobile' : 'desktop'
  await page.screenshot({ path: path.join(SCRATCH_DIR, `activity-dark-${tag}.png`) })

  // 打开夜之符兑换弹窗验证深色背景
  await page.locator('.ad-action-btn').first().click()
  await expect(page.locator('.ad-shop-card').first()).toBeVisible()
  const shopMetrics = await page.evaluate(() => {
    const card = document.querySelector('.ad-shop-card')
    const cost = document.querySelector('.ad-shop-card .ad-cost-pill')
    return {
      cardBg: card ? getComputedStyle(card).backgroundColor : '',
      costColor: cost ? getComputedStyle(cost).color : ''
    }
  })
  expect(luminance(parseRgb(shopMetrics.cardBg))).toBeLessThan(90)
  expect(luminance(parseRgb(shopMetrics.costColor))).toBeGreaterThan(180)
  await page.locator('.ui-modal-close').last().click()

  // 切到遭遇房间池检查自定义下拉按钮与房间卡
  await page.getByRole('button', { name: '遭遇房间池' }).click()
  await expect(page.locator('.ad-layer-dropdown-btn')).toBeVisible()
  const roomMetrics = await page.evaluate(() => {
    const btn = document.querySelector('.ad-layer-dropdown-btn')
    const card = document.querySelector('.ad-room-card')
    return {
      btnColor: btn ? getComputedStyle(btn).color : '',
      cardBg: card ? getComputedStyle(card).backgroundColor : ''
    }
  })
  expect(luminance(parseRgb(roomMetrics.btnColor))).toBeGreaterThan(180)
  expect(luminance(parseRgb(roomMetrics.cardBg))).toBeLessThan(75)

  // 切到随机事件并打开事件交互弹窗验证深色节点背景
  await page.getByRole('button', { name: '随机事件' }).click()
  const firstEvent = page.locator('.ad-event-card').first()
  await expect(firstEvent).toBeVisible()
  await firstEvent.click()
  await expect(page.locator('.ad-node-box')).toBeVisible()

  const modalMetrics = await page.evaluate(() => {
    const box = document.querySelector('.ad-node-box')
    const text = document.querySelector('.ad-node-text')
    return {
      boxBg: box ? getComputedStyle(box).backgroundColor : '',
      textColor: text ? getComputedStyle(text).color : ''
    }
  })
  expect(luminance(parseRgb(modalMetrics.boxBg))).toBeLessThan(85)
  expect(luminance(parseRgb(modalMetrics.textColor))).toBeGreaterThan(180)
  if (!isMobile) {
    await page.screenshot({ path: path.join(SCRATCH_DIR, 'activity-event-modal-dark.png') })
  }
})
