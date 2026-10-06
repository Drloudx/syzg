/**
 * 扫 `.vue` 的 **template 区域**里有没有 Markdown 加粗语法（`**文字**`）。
 *
 * ## 为什么
 *
 * HTML 不认 Markdown —— `**纯数字**` 会**原样显示成星号**。
 * 这个错我犯过两次：
 *   1. `PrivacyView.vue` 的正文；
 *   2. `AdminUsersPanel.vue` 的搜索提示（在真机截图里才看出来 —— 断言全是绿的，
 *      文字也确实"可见"，只是难看）。
 *
 * 写文档的手感会带进模板，所以做成检查。
 *
 * ⚠️ 只查 `<template>` 段：`<script>` 里的 JSDoc 用 `**` 是**正确**的写法。
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const ROOT = process.cwd()

const walk = (d) =>
  readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
  )

/**
 * 取出 `<template>` 段，并**剥掉 HTML 注释**。
 *
 * ⚠️ 不剥注释会报一堆假问题：模板里大量 `<!-- ... -->` 注释是用 Markdown 写的
 * （`**必须套一层普通 inline 容器**` 之类），而注释**根本不渲染**，写 `**` 完全没问题。
 * 第一版没剥，15 条命中里 13 条是假问题 —— 那会让这个检查很快没人看。
 */
function templateSection(text) {
  const start = text.indexOf('<template>')
  if (start < 0) return ''
  const raw = text.slice(start, text.indexOf('</template>', start))
  // 保留换行数，方便报行号
  return raw.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
}

test('模板里没有 Markdown 加粗（HTML 不认，会原样显示成星号）', () => {
  const bad = []

  for (const file of walk('src').filter((f) => f.endsWith('.vue'))) {
    const tpl = templateSection(readFileSync(path.join(ROOT, file), 'utf8'))
    const lines = tpl.split('\n')
    lines.forEach((line, i) => {
      // 成对的 **文字** —— 单星号（如密码遮挡提示）不算
      const hits = line.match(/\*\*[^*\n]+\*\*/g)
      if (hits) bad.push(`${file.replace(/\\/g, '/')} 模板第 ${i + 1} 行: ${hits.join(' , ')}`)
    })
  }

  assert.deepEqual(
    bad,
    [],
    '模板里出现了 Markdown 加粗语法，页面上会显示成字面星号：\n' +
      bad.map((b) => '  · ' + b).join('\n') +
      '\n\n改成 <strong>文字</strong>，或者干脆去掉加粗。'
  )
})
