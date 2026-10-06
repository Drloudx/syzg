/**
 * 任务图鉴展示层回归：排序、剧情编号、地点重复。
 *
 * 这三条都是**产物层面**的断言，直接读 `public/data/parsed/tasks.json`，
 * 所以它们锁的是「构建出来的东西对不对」，而不是某个组件的实现细节。
 *
 * 起因（2026-10-06，用户逐条反馈）：
 *   1. 第一章列表里「共鸣 / 家园 / 往日的阴影」跑到「深渊」前面 ——
 *      排序末位用了 `localeCompare` 字典序，`m_1_10` < `m_1_2`；
 *   2. 步骤里的关卡剧情标签出现 `(1/8)`、`(7/8)` 而实际只显示 5 条 ——
 *      分母用了去重前的条数；
 *   3. 地点显示成「旧日修行所（秋日荒野 > 旧日修行所）」，房间名说两遍。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const tasks = JSON.parse(readFileSync(join(root, 'public/data/parsed/tasks.json'), 'utf8'))

test('同一分类内的任务按 ID 数字序排列，不是字典序', () => {
  // 第一章 m_1_* 的真实推进链（已用 addTask 核对）
  const ch1 = tasks.tasks
    .filter(t => t.type === 1 && t.subKey === '第一章' && t.id.startsWith('m_1_'))
    .map(t => t.id)
  assert.deepEqual(ch1, [
    'm_1_1', 'm_1_2', 'm_1_4', 'm_1_4_1', 'm_1_5', 'm_1_6', 'm_1_7',
    'm_1_7_1', 'm_1_7_2', 'm_1_7_3', 'm_1_8', 'm_1_8_2', 'm_1_9',
    'm_1_10', 'm_1_11', 'm_1_12'
  ])

  // 全局检查：任何相邻两个同分类任务，只要 ID 同族，数字小的必须在前
  const byGroup = new Map()
  for (const t of tasks.tasks) {
    const key = `${t.type}|${t.subKey}`
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key).push(t.id)
  }
  const violations = []
  for (const [key, ids] of byGroup) {
    for (let i = 0; i + 1 < ids.length; i++) {
      const a = ids[i]
      const b = ids[i + 1]
      // 只比较同前缀的（m_1_2 vs m_1_10），跨族顺序由其它规则决定
      const pa = /^(.*?)(\d+)$/.exec(a)
      const pb = /^(.*?)(\d+)$/.exec(b)
      if (!pa || !pb || pa[1] !== pb[1]) continue
      if (Number(pa[2]) > Number(pb[2])) violations.push(`${key}: ${a} 排在 ${b} 前`)
    }
  }
  assert.deepEqual(violations, [], `存在字典序导致的错序：\n${violations.join('\n')}`)
})

test('关卡剧情编号的分母等于该步骤实际展示的条数', () => {
  const bad = []
  for (const t of tasks.tasks) {
    for (const s of t.steps || []) {
      const level = (s.dialogs || []).filter(d => d.label === '关卡剧情')
      if (!level.length) continue
      const numbered = level
        .map(d => /^(.*)\((\d+)\/(\d+)\)$/.exec(d.meta?.name || ''))
        .filter(Boolean)
      if (!numbered.length) continue
      const total = level.length
      for (const m of numbered) {
        if (Number(m[3]) !== total) {
          bad.push(`${t.id} step${s.index}: 标签写 ${m[3]}，实际 ${total} 条`)
          break
        }
      }
      // 编号本身不能重复、不能越界
      const idxs = numbered.map(m => Number(m[2]))
      if (new Set(idxs).size !== idxs.length) bad.push(`${t.id} step${s.index}: 编号重复 ${idxs.join(',')}`)
      if (idxs.some(i => i < 1 || i > total)) bad.push(`${t.id} step${s.index}: 编号越界 ${idxs.join(',')}`)
    }
  }
  assert.deepEqual(bad, [], `关卡剧情编号不一致：\n${bad.join('\n')}`)
})

test('地点不会把房间名在括号里重复一遍', () => {
  const bad = []
  for (const t of tasks.tasks) {
    for (const s of t.steps || []) {
      for (const d of s.detail || []) {
        if (!['房间', '场景', '关卡'].includes(d.label)) continue
        const m = /^(.+?)（(.+)）$/.exec(String(d.value || ''))
        if (!m) continue
        const [, name, sub] = m
        // 括号里任何一段都不应被房间名包含（灾害研究所（外部） vs 灾害研究所）
        for (const part of sub.split(' > ')) {
          if (part && (name === part || name.includes(part))) {
            bad.push(`${t.id} step${s.index} ${d.label}: ${d.value}`)
          }
        }
      }
    }
  }
  assert.deepEqual(bad, [], `地点重复：\n${bad.join('\n')}`)
})

test('截图里的两条具体用例保持修复后的形态', () => {
  const m112 = tasks.tasks.find(t => t.id === 'm_1_12')
  const room = m112.steps.find(s => s.index === 2).detail.find(d => d.label === '房间')
  assert.equal(room.value, '旧日修行所（秋日荒野）')

  const m004 = tasks.tasks.find(t => t.id === 'main_0_04')
  const room2 = m004.steps[1].detail.find(d => d.label === '房间')
  assert.equal(room2.value, '驿站内部')
})
