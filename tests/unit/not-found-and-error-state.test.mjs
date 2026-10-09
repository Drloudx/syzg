/**
 * 404 迷航页面与全站加载错误状态统一规范测试。
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const ROOT = process.cwd()

test('NotFoundView 页面组件存在且具有羊皮纸设计元素', () => {
  const notFoundPath = path.join(ROOT, 'src/views/NotFoundView.vue')
  assert.ok(existsSync(notFoundPath), 'NotFoundView.vue 应当存在')

  const content = readFileSync(notFoundPath, 'utf8')
  assert.ok(content.includes('paper-panel'), '404 页面应包含羊皮纸面板')
  assert.ok(content.includes('404'), '404 页面应包含 404 标识')
  assert.ok(content.includes('返回藏书馆首页'), '404 页面应提供返回首页按钮')
  assert.ok(content.includes('shortcutList') || content.includes('快速传送'), '404 页面应提供快捷推荐')
})

test('路由表正确注册 404 显式路由与未匹配兜底路由', () => {
  const routerPath = path.join(ROOT, 'src/router/index.js')
  const content = readFileSync(routerPath, 'utf8')

  assert.ok(content.includes("path: '/404'"), '应注册 /404 路由')
  assert.ok(content.includes("path: '/:pathMatch(.*)*'"), '应注册未匹配兜底路由')
  assert.ok(content.includes('NotFoundView.vue'), '404 路由应指向 NotFoundView.vue')
})

test('UiEmptyState 组件具备羊皮纸卡片形态、网络错误清洗与重试支持', () => {
  const compPath = path.join(ROOT, 'src/components/ui/UiEmptyState.vue')
  const content = readFileSync(compPath, 'utf8')

  assert.ok(content.includes('ui-empty-state--card'), '应支持错误卡片模式')
  assert.ok(content.includes('Failed to fetch'), '应支持清洗生硬网络错误')
  assert.ok(content.includes('emit(\'retry\')'), '应支持一键重试动作')
})

test('核心数据视图规范了友好错误提示与重试机制', () => {
  const eventsContent = readFileSync(path.join(ROOT, 'src/views/EventsView.vue'), 'utf8')
  const petEggsContent = readFileSync(path.join(ROOT, 'src/views/PetsEggsView.vue'), 'utf8')

  assert.ok(eventsContent.includes('@retry="loadEventsData"'), 'EventsView 必须支持重试')
  assert.ok(!eventsContent.includes("'加载失败：' + (err && err.message"), 'EventsView 禁止直接拼接原生底层异常')

  assert.ok(petEggsContent.includes('errorMessage'), 'PetsEggsView 必须具备独立错误状态')
  assert.ok(petEggsContent.includes('@retry="loadPetEggs"'), 'PetsEggsView 必须支持重试')
})
