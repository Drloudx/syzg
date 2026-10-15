/**
 * 深色模式不得改变布局几何。
 *
 * ## 守的是什么坑
 *
 * 2026-10-14：切深色后**整个页面向右下位移**（宽 +10px、高 +6px）。
 *
 * 根因是 Vue scoped 样式的编译行为：
 *
 *   源码：`:global(.dark-mode) .ui-item-card__name { padding: 2px 4px !important }`
 *   编译：`.dark-mode, .dark-theme, .dark-mode .ui-item-card__name[data-v-x] { … }`
 *          ↑↑↑ 凭空多出的**裸 `.dark-mode`**（意图里的后代选择器被丢掉了）
 *
 * `dark-mode` 类加在 **`html`** 上（`useNativeShell.js`）与 **`.app-container`** 上，
 * 所以裸 `.dark-mode` + `!important` 会给它们套上边框与内边距 → 页面整体位移。
 *
 * ⚠️ 这类缺陷**只在深色下出现**、且只在"切主题"那一瞬间可见，静态看代码看不出来。
 *    所以必须用几何量断言守住，而不是靠人眼。
 *
 * ## 第二类：组件的盒模型被改（2026-10-14 同日发现）
 *
 * 即使选择器写对了，深色规则里**改了 `border-width` / `padding`** 一样会造成位移：
 * `UiItemCard` 的卡名浅色是 `border: 4px` + `padding: 1px 2px`，深色写成
 * `1px` / `2px 4px` → 净高 −4px → **整片网格上移 4px**（实测第二行 y: 372 → 368）。
 *
 * 所以第二条判据：**切深色前后，每个元素的 `border-width` 与 `padding` 必须一字不变**
 * （颜色随便变，那是深色的目的）。
 *
 * ## 判据
 *
 * 切换深色前后，`html` / `body` / `.app-container` 的**位置与尺寸必须完全不变**，
 * 且全页元素的 `border-width` / `padding` 不变。
 */

import { expect, test } from '@playwright/test'

const geometry = (page) =>
  page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
    }
    const cs = getComputedStyle(document.documentElement)
    return {
      html: r('html'),
      body: r('body'),
      container: r('.app-container'),
      header: r('.app-header'),
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
      htmlPadding: cs.padding,
      htmlBorderWidth: cs.borderWidth
    }
  })

/**
 * 盒模型指纹：**只取 border-width 与 padding**，不含颜色。
 * 用元素下标作主键（同一页面两次采样的顺序一致）。
 */
const boxModel = (page) =>
  page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) continue
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '',
        bw: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(' '),
        pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' ')
      })
    }
    return out
  })

const setDark = (page, on) =>
  page.evaluate((v) => {
    document.documentElement.classList.toggle('dark-mode', v)
    const app = document.querySelector('.app-container')
    app?.classList.toggle('dark-mode', v)
    app?.classList.toggle('dark-theme', v)
  }, on)

for (const [name, path] of [
  ['物品页', '/#/items'],
  ['讨论区', '/#/discussions']
]) {
  test(`🔴 深色模式不改变布局几何（${name}）`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    await page.waitForTimeout(3500)

    await setDark(page, false)
    await page.waitForTimeout(500)
    const light = await geometry(page)

    await setDark(page, true)
    await page.waitForTimeout(700)
    const dark = await geometry(page)

    // 根元素不该被加上内边距/边框 —— 这是那个坑最直接的指纹
    expect(light.htmlPadding, '浅色下 html 应无 padding').toBe('0px')
    expect(
      dark.htmlPadding,
      '🔴 深色下 html 被加了 padding —— 有 scoped 规则用裸 .dark-mode 命中它（见文件头说明）'
    ).toBe('0px')
    expect(
      parseFloat(dark.htmlBorderWidth),
      '🔴 深色下 html 被加了边框 —— 同上'
    ).toBe(0)

    // 几何量逐项比对
    for (const key of ['html', 'body', 'container', 'header']) {
      if (!light[key] || !dark[key]) continue
      for (const dim of ['x', 'y', 'w', 'h']) {
        expect(
          dark[key][dim],
          `🔴 切深色后 ${key}.${dim} 变了（${light[key][dim]} → ${dark[key][dim]}）—— 页面位移`
        ).toBe(light[key][dim])
      }
    }

    expect(dark.docScrollW, '文档宽度不该因深色变化（变化说明有多余溢出）').toBe(light.docScrollW)
    expect(dark.docClientW).toBe(light.docClientW)
  })
}

/* 盒模型判据单独一条：单独跑更快定位到"哪个组件的 border/padding 被深色改了" */
for (const [name, path] of [
  ['物品页', '/#/items'],
  ['角色页', '/#/heroes'],
  ['符石页', '/#/runes'],
  ['怪物收益', '/#/rewards']
]) {
  test(`🔴 深色不改元素的 border/padding（${name}）`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    await page.waitForTimeout(4000)

    await setDark(page, false)
    await page.waitForTimeout(600)
    const light = await boxModel(page)
    await setDark(page, true)
    await page.waitForTimeout(700)
    const dark = await boxModel(page)

    expect(dark.length, `${name}：两次采样元素数应一致`).toBe(light.length)

    const bwChanged = []
    const padChanged = []
    for (let i = 0; i < light.length; i++) {
      const id = `${light[i].tag}.${light[i].cls}`
      if (light[i].bw !== dark[i].bw) bwChanged.push(`${id}: [${light[i].bw}] → [${dark[i].bw}]`)
      if (light[i].pad !== dark[i].pad) padChanged.push(`${id}: [${light[i].pad}] → [${dark[i].pad}]`)
    }

    expect(
      bwChanged.slice(0, 3),
      `🔴 深色改了 border-width（${bwChanged.length} 处）—— 会造成位移。示例：${bwChanged[0] || ''}`
    ).toEqual([])
    expect(
      padChanged.slice(0, 3),
      `🔴 深色改了 padding（${padChanged.length} 处）—— 会造成位移。示例：${padChanged[0] || ''}`
    ).toEqual([])
  })
}
