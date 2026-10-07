/**
 * 任务页黑名单回归：**隐藏地区的主线任务必须被挡住**。
 *
 * ## 为什么需要这条（2026-10-07 用户报告）
 *
 * 黑名单里存的是**地区名**（`黑森林` / `霜烬平原`），而主线任务的 `subLabel`
 * 是**章节序号**（`第四章` / `第五章`）—— 两者字面上永远匹配不上，
 * 于是被隐藏的地区**整章漏出**（实测 42 条）。
 *
 * 最明显的表现是**搜剧情正文**：对话里会直接出现「黑森林」这类词，
 * 一搜就把隐藏章节捞出来了。
 *
 * ## 这条测试锁什么
 *
 * 「第 N 章 → cN → 地区名」的映射链路，以及**不能误伤**：
 * 序章、一~三章里也有任务在正文提到「黑森林」（剧情路过），
 * 它们**不该**因为"提到"而被隐藏 —— 判据只能是**章节归属**。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { isBlacklisted } from '../../src/config/blacklist.js'
import { CHAPTER_TO_MAP, getMapName, resolveRegionName } from '../../src/utils/gameMappings.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const tasks = JSON.parse(readFileSync(join(root, 'public/data/parsed/tasks.json'), 'utf8')).tasks

/** 与 `TasksView.filteredTasks` **逐字一致**的黑名单调用（改一处要改两处） */
const isHidden = (t) =>
  isBlacklisted({
    id: t.id,
    name: t.name,
    desc: t.des,
    tip: t.typeLabel,
    label: t.subLabel,
    place: [resolveRegionName(t.subLabel)].filter(Boolean)
  })

test('章节序号能解析成地区名（主线与委托两种写法都认）', () => {
  // 主线写法：章节序号
  assert.equal(resolveRegionName('第四章'), '黑森林')
  assert.equal(resolveRegionName('第五章'), '霜烬平原')
  assert.equal(resolveRegionName('第一章'), '秋日荒野')
  // 委托写法：直接就是地区名
  assert.equal(resolveRegionName('黑森林'), '黑森林')
  assert.equal(resolveRegionName('霜烬平原'), '霜烬平原')
  // 认不出来的返回空串（不误判成某个地区）
  assert.equal(resolveRegionName('其他'), '')
  assert.equal(resolveRegionName(''), '')
  assert.equal(resolveRegionName(null), '')
})

test('🔴 隐藏地区的主线任务被黑名单挡住（修复前整章漏出）', () => {
  const ch4 = tasks.filter((t) => t.subLabel === '第四章')
  const ch5 = tasks.filter((t) => t.subLabel === '第五章')
  assert.ok(ch4.length > 10 && ch5.length > 10, `第四/五章样本太少：${ch4.length} / ${ch5.length}`)

  const leaked4 = ch4.filter((t) => !isHidden(t))
  const leaked5 = ch5.filter((t) => !isHidden(t))
  assert.deepEqual(leaked4.map((t) => t.id), [], '第四章（黑森林）仍有任务漏出')
  assert.deepEqual(leaked5.map((t) => t.id), [], '第五章（霜烬平原）仍有任务漏出')
})

test('🔴 不能误伤：本次改动只应影响"章节归属"，不该波及别的章节', () => {
  /*
   * ⚠️ 判据必须限定在**本次改动新增隐藏的那部分**。
   *
   * 一开始写成"序章/一~三章一条都不该被隐藏"，结果红了 —— 但那两条
   * （`main_0_04` / `main_0_04_q`，序章「前往驿站」）是**旧逻辑本来就隐藏的**：
   * 它们的 `desc` 写着"你救助了一名来自**黑森林**的信使…"，
   * 而黑名单是**按名字模糊匹配**的（desc 也在匹配范围内），所以早就被藏了。
   * 那是既有设计，不在本次改动范围内 —— 拿它当断言等于**要求改别的功能**。
   *
   * 所以这里只对 `after && !before`（**本次新增隐藏**）断言章节归属。
   */
  const before = (t) =>
    isBlacklisted({ id: t.id, name: t.name, desc: t.des, tip: t.typeLabel, label: t.subLabel })
  const newlyHidden = tasks.filter((t) => isHidden(t) && !before(t))

  assert.ok(newlyHidden.length > 0, '没有新增隐藏的任务，说明映射没生效（本测试会空转）')

  const safeLabels = ['序章', '第一章', '第二章', '第三章', '初始章', '其他']
  const wrongly = newlyHidden.filter((t) => safeLabels.includes(t.subLabel))
  assert.deepEqual(
    wrongly.map((t) => `${t.id}[${t.subLabel}]`),
    [],
    '本次改动波及了非隐藏章节的任务'
  )

  /*
   * 反向佐证：新增隐藏的必须**全部**来自被黑名单点名的地区。
   * 若不校验这一条，把 `resolveRegionName` 写成"永远返回黑森林"也能过。
   */
  const hiddenRegions = new Set(['黑森林', '霜烬平原'])
  const fromHiddenRegion = newlyHidden.every((t) => hiddenRegions.has(resolveRegionName(t.subLabel)))
  assert.ok(fromHiddenRegion, '新增隐藏里混进了非隐藏地区的任务')
})

test('CHAPTER_TO_MAP 与 MAP_NAMES 保持一致（不出现指向不存在代号的映射）', () => {
  for (const [label, code] of Object.entries(CHAPTER_TO_MAP)) {
    const name = getMapName(code)
    assert.notEqual(name, code, `${label} → ${code} 在 MAP_NAMES 里没有对应地区名`)
  }
})
