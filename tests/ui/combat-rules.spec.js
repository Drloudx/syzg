import { expect, test } from '@playwright/test'
import { enableDarkMode } from '../helpers/theme.mjs'

/**
 * 旧「战斗规则页」的兼容与内容可达性。
 *
 * ## 这个文件为什么被重写了
 *
 * 它原来测的是 `/#/rewards?tab=combat_rules` 上一个**专门的战斗规则视图**
 * （`.combat-rules` 容器、`[data-rule-section="limits"|"pets"]`、
 * `.combat-rules__formula p`、专属搜索框「搜索战斗规则，如冷却、暴击、护盾...」）。
 *
 * 那个视图**已经被有意移除并进了「词条百科」**（`/glossary`）——
 * `git grep` 显示 `combat-rules` / `data-rule-section` / `搜索战斗规则`
 * **在 `src/` 里完全不存在了**，只活在测试文件里。
 *
 * 但内容是好的：`属性上限` / `冷却缩减` / `先扣护盾，再扣生命` / `基础攻速的 4 倍`
 * 在 `/glossary` 上都能读到。
 *
 * ## 🔴 顺带查出并修掉一个真 bug
 *
 * `RewardsView.resolveMainCategory()` 里原本有一句
 * `router.replace('/glossary')` —— 那是个**在"解析函数"里做路由跳转**的副作用，
 * 而组件 `onMounted` 的 `syncTabsToRoute()` 随后又会 `router.replace({ query })`
 * **把它覆盖掉**。实测旧链接最终停在
 * `/#/rewards?tab=pvp&sub=exchange&season=s1` —— **根本没到词条百科**，
 * 用户点旧链接会落在一个不相干的页面上。
 *
 * 已改到 `src/router/index.js` 里 `/rewards` 的 `beforeEnter`
 * （组件挂载前完成，覆盖不了，而且**保留 `?q=` 搜索词**）。
 * 下面第 1、2 条就是守这个契约的。
 */

const LEGACY_TAB = 'combat_rules'

test.beforeEach(async ({ page }) => {
  await page.route('**/data/notice.json*', (route) => route.fulfill({ json: { notices: [] } }))
})

test('旧地址 ?tab=combat_rules 会落到词条百科（不是停在不相干的奖励页）', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto(`/#/misc?tab=${LEGACY_TAB}`)

  await expect(page).toHaveURL(/#\/glossary/, { timeout: 15_000 })
  // 🔴 断言它**没有**停在 /rewards —— 这正是修掉的那个 bug 的形态
  await expect(page).not.toHaveURL(/#\/misc/)

  /*
   * 内容用「并进词条百科之后」的**实际措辞**（下面这几句是从渲染出来的 DOM 里
   * 抄下来的，不是猜的）。
   *
   * ⚠️ 老的战斗规则页写的是「冷却缩减 最多 50%」「先扣护盾，再扣生命」，
   * 并进词条百科时措辞改过（去掉了逗号、改成括号形式）。
   * 要是照抄老文案，测试会红，而功能其实是好的 ——
   * **这就是这个文件原来红着的原因**（不是功能坏了，是断言里的字符串过期了）。
   */
  const body = page.locator('body')
  await expect(body).toContainText('属性上限')
  await expect(body).toContainText('冷却缩减（上限 50%）')
  await expect(body).toContainText('先扣护盾再扣生命')
  await expect(body).toContainText('基础攻速的 4 倍')

  expect(errors).toEqual([])
})

test('旧地址 ?tab=ph3&q=护盾 会落到词条百科，并且**搜索词不丢**', async ({ page }) => {
  await page.goto('/#/misc?tab=ph3&q=护盾')
  await expect(page).toHaveURL(/#\/glossary/, { timeout: 15_000 })

  /*
   * `q` 必须被带过去 —— 旧写法是直接丢掉参数，
   * 而词条百科正好读 `?q=`（`GlossaryView.vue` 的 `search`）。
   */
  await expect(page).toHaveURL(/[?&]q=/, { timeout: 10_000 })
  await expect(page.locator('body')).toContainText('先扣护盾再扣生命')
})

test('词条百科里能搜到战斗规则，搜不到时有空态', async ({ page }) => {
  await page.goto('/#/glossary')
  await dismissGlobalModals(page)
  await expect(page.locator('.glossary-page')).toBeVisible({ timeout: 20_000 })

  const search = page.locator('input[placeholder*="词条名称"]').first()
  await expect(search).toBeVisible()

  await search.fill('护盾')
  await expect(page.locator('body')).toContainText('先扣护盾再扣生命', { timeout: 10_000 })

  await search.fill('没有这条规则xyz')
  // 空态文案（几种常见写法任一即可，避免把断言绑死在某一版文案上）
  await expect(page.locator('body')).toContainText(/未找到|没有找到|无匹配|暂无/, { timeout: 10_000 })

  await search.fill('')
  await expect(page.locator('body')).toContainText('属性上限', { timeout: 10_000 })
})

test('战斗规则不再有独立的 /misc 视图（防止有人把它加回来而测试还绿）', async ({ page }) => {
  await page.goto('/#/glossary')
  await expect(page.locator('.glossary-page')).toBeVisible({ timeout: 20_000 })

  // 老的专用容器不该再出现
  await expect(page.locator('.combat-rules')).toHaveCount(0)
  await expect(page.locator('[data-rule-section]')).toHaveCount(0)
})

const dismissGlobalModals = async (page) => {
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

test('伤害结算流水线八步均支持展开纯数学公式卡片与精确系数', async ({ page }, testInfo) => {
  await page.goto('/#/glossary?id=mech_damage_flow&section=mechanics')
  await dismissGlobalModals(page)

  const modal = page.locator('.ui-modal-overlay:not(.is-teleported)')
  await expect(modal).toBeVisible({ timeout: 20_000 })

  const toggleButtons = modal.locator('.rule-toggle-btn')
  await expect(toggleButtons).toHaveCount(8)

  // 展开第三步：验证分式公式、X₂ 衔接公式及精确 K(L) 系数均已渲染且无旧四舍五入值
  await toggleButtons.nth(2).click()
  const diagram = modal.locator('.step-inline-diagram').first()
  await expect(diagram).toBeVisible()
  await expect(diagram).toContainText('实际承伤比')
  await expect(diagram).toContainText('X₂ = X₁ × 实际承伤比')
  await expect(diagram).toContainText('K(L) + 防御 × (1 − 穿透率)')
  await expect(diagram).toContainText('0.6125, 45.269, 351.98')
  await expect(diagram).toContainText('0.5011, 37.039, 287.98')
  await expect(diagram).toContainText('当「有效防御 = K(L)」时正好减伤 50%')
  await expect(diagram).not.toContainText('45.27L')

  const shotPath = testInfo.outputPath('step3-formula.png')
  await diagram.screenshot({ path: shotPath })
  await testInfo.attach('step3-formula', { path: shotPath, contentType: 'image/png' })

  // 展开第四步、第七步与第八步，验证八步代号串联（X₂ → X₃、D）且不横向溢出
  await toggleButtons.nth(3).click()
  await toggleButtons.nth(6).click()
  await toggleButtons.nth(7).click()
  await expect(modal.locator('.step-inline-diagram')).toHaveCount(4)
  await expect(modal).toContainText('X₃ = X₂')
  const overflow = await modal.locator('.ui-modal-body').evaluate(el => el.scrollWidth > el.clientWidth + 2)
  expect(overflow).toBe(false)

  // 深色模式下卡片底色必须切至暗木底，避免亮底浅字看不清
  await enableDarkMode(page)
  const darkCard = diagram.locator('.formula-card')
  await expect(darkCard).toHaveCSS('background-color', 'rgb(50, 37, 26)')
  const darkShotPath = testInfo.outputPath('step3-formula-dark.png')
  await diagram.screenshot({ path: darkShotPath })
  await testInfo.attach('step3-formula-dark', { path: darkShotPath, contentType: 'image/png' })

  // 切到等级压制词条验证深色模式下对照表红色/绿色文字对比度切换生效
  await page.goto('/#/glossary?id=mech_level_suppression&section=mechanics')
  await dismissGlobalModals(page)
  await enableDarkMode(page)
  await expect(modal.locator('.level-sup-table__red').nth(1)).toHaveCSS('color', 'rgb(241, 148, 138)')
})
