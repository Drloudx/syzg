/**
 * 招募页标题位兼作「返回首页」入口。
 *
 * 锁的是**改坏了不报错**的点：标题图退回成纯 `<img>` 后，点击完全没有反应，
 * 且没有任何测试会红 —— 这类「少了一个入口」的回归只能靠读源码断言拦住。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')

test('招募标题位是可点击按钮并发出 home 事件', () => {
  const panel = read('components/gacha/GachaPoolPanel.vue')

  // 标题位必须是 button，且带 home 事件
  const titleBlock = panel.match(/<button[\s\S]{0,400}?pool-title-btn[\s\S]{0,600}?<\/button>/)
  assert.ok(titleBlock, '标题位应为 <button class="pool-title-btn">，而不是纯 <img>')
  assert.match(titleBlock[0], /@click="emit\('home'\)"/, '标题按钮必须发出 home 事件')
  assert.match(titleBlock[0], /title="返回首页"/, '标题按钮需有「返回首页」提示')
  assert.match(titleBlock[0], /aria-label="返回首页"/, '标题按钮需有 aria-label（图标按钮无语义文本）')
  assert.match(titleBlock[0], /g-focusable/, '需带 g-focusable 才能键盘聚焦')
  assert.match(titleBlock[0], /g-hit/, '需带 g-hit 才有按下反馈')

  // 仍用 gachaPos 绝对定位，位置不变
  assert.match(titleBlock[0], /gachaPos\(-500, 315\)/, '标题位置应保持 design (-500,315)')

  // emits 里登记了 home
  assert.match(panel, /'home'/, 'defineEmits 需登记 home')
})

test('标题按钮不改变盒模型（图片尺寸即按钮尺寸）', () => {
  const panel = read('components/gacha/GachaPoolPanel.vue')
  const rule = panel.match(/\.pool-title-btn\s*\{[^}]*\}/)
  assert.ok(rule, '缺少 .pool-title-btn 样式')
  for (const decl of ['padding: 0', 'border: 0', 'background: none']) {
    assert.ok(rule[0].includes(decl), `.pool-title-btn 需声明 ${decl}，否则会撑大标题位`)
  }
})

test('GachaView 接住 home 并跳首页，而不是复用 router.back()', () => {
  const view = read('views/GachaView.vue')
  assert.match(view, /@home="handleHome"/, 'GachaView 需监听 home')

  const fn = view.match(/function handleHome\(\)\s*\{[\s\S]*?\n\}/)
  assert.ok(fn, '缺少 handleHome()')
  // 语义必须是「回首页」，不能是「回上一页」：深链/分享进入时 back() 去向不确定
  assert.match(fn[0], /router\.push\('\/'\)/, 'handleHome 必须 push 首页')
  assert.ok(!/router\.back\(\)/.test(fn[0]), 'handleHome 不能用 router.back()')
})
