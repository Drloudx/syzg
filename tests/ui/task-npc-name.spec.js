/**
 * 任务详情的「接取 NPC」与「交互对话」两行。
 *
 * 起因（2026-10-15，用户报告）：任务「怒火来自地鼠」的「接取 NPC」显示
 * `未知（cart_at_npc_glt）` —— 那是**立绘资源名**，不是数据 id。
 *
 * 两类 `getTask.npc` 的 `title` 语义不同，两行要分别取：
 *
 * | 类别 | 名字来源 | 交互对话 |
 * | --- | --- | --- |
 * | 贸易小车 `cart_at_npc_*` | `title`（配置里就是名字） | 无（title 已是名字，不重复） |
 * | 场景 NPC | `room.npcList[].npcName` | `title`（搭话台词/旁白） |
 */
import { expect, test } from '@playwright/test'

/** 关掉公告/更新等全局弹窗（与 app-shell.spec.js 同法）。 */
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

const openTask = async (page, taskId) => {
  await page.goto(`/#/tasks?task=${taskId}`)
  await expect(page.locator('.app-container')).not.toHaveClass(/is-boot-loading/)
  await dismissGlobalModals(page)
  /*
   * 任务详情是**页面内嵌**弹窗，挂在 `.page-view-container` 里
   * （不是 `.app-main > .ui-modal-host` —— 那是全局物品详情的挂点）。
   */
  const modal = page.locator('.page-view-container .ui-modal-host .ui-modal-overlay')
  await expect(modal).toBeVisible({ timeout: 20_000 })
  return modal
}

/**
 * 读「接取信息与背景」这一节里的信息行。
 *
 * ⚠️ 必须限定在该 section 内：任务**步骤**里也有「交互对话」行（回报 NPC 时的那句话），
 * 那是另一处功能，扫整个弹窗会把两者混在一起。
 */
const readInfoRows = async modal => modal.evaluate(el => {
  const section = [...el.querySelectorAll('.ui-section')]
    .find(s => s.querySelector('.ui-section__title')?.textContent?.includes('接取信息与背景'))
  if (!section) return []
  return [...section.querySelectorAll('.ui-info-row')]
    .map(row => ({
      label: row.querySelector('.ui-info-row__label')?.textContent?.trim() || '',
      value: row.querySelector('.ui-info-row__value')?.textContent?.trim() || ''
    }))
    .filter(row => row.label)
})

const findRow = (rows, label) => rows.find(row => row.label === label)

test('贸易小车 NPC：显示配置里的名字，且不重复成「交互对话」', async ({ page }) => {
  const modal = await openTask(page, 'wt_yz_02')
  const rows = await readInfoRows(modal)
  const npc = findRow(rows, '接取 NPC')
  console.log('接取 NPC 行：', JSON.stringify(npc))

  expect(npc, '应有「接取 NPC」行').toBeTruthy()
  expect(npc.value).toBe('修业学徒格兰缇')
  expect(npc.value).not.toContain('cart_at_npc_glt')
  // 小车 NPC 的 title 就是名字 —— 不该再出现「交互对话」行
  expect(findRow(rows, '交互对话'), '小车 NPC 不该有「交互对话」行').toBeUndefined()
  await page.screenshot({ path: 'test-results/npc-cart.png' })
})

test('场景 NPC：名字来自 room.npcList，台词进「交互对话」', async ({ page }) => {
  const modal = await openTask(page, 's_4_12')
  const rows = await readInfoRows(modal)
  const npc = findRow(rows, '接取 NPC')
  const line = findRow(rows, '交互对话')
  console.log('接取 NPC 行：', JSON.stringify(npc))
  console.log('交互对话行：', JSON.stringify(line))

  expect(npc?.value, '名字应是真名').toBe('威格迪哆')
  expect(line?.value, '台词应是旁白').toContain('蕈人在向你们招手')
  // 两行内容必须不同（不能都显示 title）
  expect(npc.value).not.toEqual(line.value)
  await page.screenshot({ path: 'test-results/npc-scene.png' })
})

/**
 * 方案 A：查不到名字的 NPC 行**整体不渲染**，不显示「未知（内部 id）」。
 *
 * `main_2_05` 的 `getTask.npc = npcmarco`、第 1 步 `npc = npcmilly` ——
 * 这两个 uid 在任何表里都没有名字（`room.npcList` 无该 uid、其所在房间不在 `room.json`、
 * `npc.json` 只有立绘字段无 name）。依据游戏任务界面（`TaskPanel.cs:385-386`）步骤级没有 NPC 行，故省略。
 */
test('方案A：查不到名字时不渲染 NPC 行，也不暴露内部 id', async ({ page }) => {
  const modal = await openTask(page, 'main_2_05')
  const rows = await readInfoRows(modal)
  console.log('main_2_05 信息行：', JSON.stringify(rows))

  const allText = JSON.stringify(rows)
  expect(allText).not.toContain('未知（')
  expect(allText).not.toContain('npcmarco')
  expect(allText).not.toContain('npcmilly')
  // 其它信息行照常显示（不是整页失效）
  expect(findRow(rows, '接取条件'), '其它信息行应仍在').toBeTruthy()
})

test('方案A：有真名的任务不受影响', async ({ page }) => {
  const modal = await openTask(page, 'm_2_11')
  const rows = await readInfoRows(modal)
  // m_2_11 的 getTask.npc 为空，走「起始 NPC」，名字来自 room.npcList 的 ke02
  expect(findRow(rows, '起始 NPC')?.value, '有真名时应正常显示').toBe('剋大师')
})
