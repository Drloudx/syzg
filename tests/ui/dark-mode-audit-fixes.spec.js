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

test('首页深色模式标题丝带、星级角标适配且桌面端下午茶不截断', async ({ page, isMobile }) => {
  await page.goto('/#/')
  await dismissGlobalModals(page)
  await expect(page.locator('.section-title-ribbon').first()).toBeVisible({ timeout: 15000 })

  await enableDarkMode(page)

  const metrics = await page.evaluate(() => {
    const ribbon = document.querySelector('.section-title.section-title-ribbon')
    const ribbonText = document.querySelector('.section-title.section-title-ribbon > span:first-child')
    const badge5 = document.querySelector('.hero-star-badge.star-5')
    const mealName = document.querySelector('.daily-meal-name')
    return {
      ribbonBgImg: ribbon ? getComputedStyle(ribbon).backgroundImage : '',
      ribbonTextColor: ribbonText ? getComputedStyle(ribbonText).color : '',
      badge5Bg: badge5 ? getComputedStyle(badge5).backgroundColor : '',
      badge5Color: badge5 ? getComputedStyle(badge5).color : '',
      mealTruncated: mealName ? mealName.scrollWidth > mealName.clientWidth + 1 : false
    }
  })

  expect(metrics.ribbonBgImg).not.toContain('250, 243, 230')
  expect(luminance(parseRgb(metrics.ribbonTextColor))).toBeGreaterThan(180)
  if (metrics.badge5Bg) {
    expect(luminance(parseRgb(metrics.badge5Bg))).toBeLessThan(85)
    expect(luminance(parseRgb(metrics.badge5Color))).toBeGreaterThan(160)
  }
  expect(metrics.mealTruncated).toBe(false)

  await page.screenshot({ path: path.join(SCRATCH_DIR, `verify-home-dark-${isMobile ? 'mobile' : 'desktop'}.png`) })
})

test('遗器法盘模拟器深色模式按钮、标签与提示对比度正常', async ({ page, isMobile }) => {
  await page.goto('/#/relics')
  await dismissGlobalModals(page)
  await expect(page.locator('.sim-main-btn')).toBeVisible({ timeout: 15000 })

  await enableDarkMode(page)

  const metrics = await page.evaluate(() => {
    const activeBtn = document.querySelector('.sim-btn.is-active')
    const mainBtn = document.querySelector('.sim-main-btn')
    const quickLabel = document.querySelector('.inventory-quick-label')
    const notice = document.querySelector('.sim-notice.is-success')
    return {
      activeBg: activeBtn ? getComputedStyle(activeBtn).backgroundColor : '',
      activeColor: activeBtn ? getComputedStyle(activeBtn).color : '',
      mainBg: mainBtn ? getComputedStyle(mainBtn).backgroundColor : '',
      mainColor: mainBtn ? getComputedStyle(mainBtn).color : '',
      quickColor: quickLabel ? getComputedStyle(quickLabel).color : '',
      noticeColor: notice ? getComputedStyle(notice).color : ''
    }
  })

  expect(luminance(parseRgb(metrics.activeBg))).toBeLessThan(110)
  expect(luminance(parseRgb(metrics.activeColor))).toBeGreaterThan(200)
  expect(luminance(parseRgb(metrics.mainBg))).toBeLessThan(110)
  expect(luminance(parseRgb(metrics.mainColor))).toBeGreaterThan(200)
  expect(luminance(parseRgb(metrics.quickColor))).toBeGreaterThan(145)
  if (metrics.noticeColor) {
    expect(luminance(parseRgb(metrics.noticeColor))).toBeGreaterThan(140)
  }

  await page.screenshot({ path: path.join(SCRATCH_DIR, `verify-relics-dark-${isMobile ? 'mobile' : 'desktop'}.png`) })
})

test('伙伴邮件深色模式转为深色羊皮纸质感且文字对比度可读', async ({ page, isMobile }) => {
  await page.goto('/#/partner-mails')
  await dismissGlobalModals(page)
  await expect(page.locator('.mail-columns')).toBeVisible({ timeout: 15000 })

  await enableDarkMode(page)

  const metrics = await page.evaluate(() => {
    const cols = document.querySelector('.mail-columns')
    const body = document.querySelector('.mail-body')
    const meta = document.querySelector('.mail-meta')
    return {
      colsBg: cols ? getComputedStyle(cols).backgroundColor : '',
      bodyColor: body ? getComputedStyle(body).color : '',
      metaColor: meta ? getComputedStyle(meta).color : ''
    }
  })

  expect(luminance(parseRgb(metrics.colsBg))).toBeLessThan(65)
  if (metrics.bodyColor) expect(luminance(parseRgb(metrics.bodyColor))).toBeGreaterThan(180)
  if (metrics.metaColor) expect(luminance(parseRgb(metrics.metaColor))).toBeGreaterThan(150)

  await page.screenshot({ path: path.join(SCRATCH_DIR, `verify-partner-mails-dark-${isMobile ? 'mobile' : 'desktop'}.png`) })
})
