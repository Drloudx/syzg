/**
 * 遗器图鉴（`data/parsed/relics.json`）回归护栏。
 *
 * ## 守什么
 *
 * 1. **分类名必须是游戏里的真名**（武器/法器/防器/护器），不是臆造的「类别一」。
 *    真名取自客户端 `RelicDetailPanel.GetRelicCateName`；写错会让共鸣条件读起来毫无意义。
 * 2. **件数固定**：基础 25 + 核心 9 = 34。少一件说明 `relicInfo` 读漏了。
 * 3. **等级文本必须齐全**：每件遗器 1~5 级都有非空文本；核心遗器还必须有共鸣。
 * 4. **`des` 不能当名字用**：核心遗器的 `des` 是内部 id（`core_101`），
 *    可读名在 `name`。把 des 写进 `attributeName` 会显示成一串 id。
 * 5. **法盘尺寸**：8×7、上限 30 级。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildRelicsFile } from '../../scripts/parse/relics.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const readParsed = name => JSON.parse(readFileSync(join(repoRoot, 'public/data/parsed', name), 'utf8'))

test('遗器分类名取 lan.relic_type（火/水/地/风属性），不是源码里的死代码分支', () => {
  const data = readParsed('relics.json')
  /*
   * 权威来源是 `lan.json` 的 `relic_type`：`"0,火属性,水属性,地属性,风属性"`。
   * 客户端 `SpRelicShowTip.GetRelicCateName` 优先读这条 lan 配置；
   * `RelicDetailPanel.GetRelicCateName` 的「武器/法器/防器/护器」是**过时死代码分支**，
   * 数据也能自证：cat1 含「哈玛塔坎之爪/火属性伤害」、cat2 含「辛瓦特之泪/水属性伤害」。
   */
  assert.deepEqual(data.categoryNames, { 1: '火属性', 2: '水属性', 3: '地属性', 4: '风属性' })
  const catNames = new Set(data.relics.filter(r => r.type === 'base').map(r => r.categoryName))
  assert.ok(![...catNames].some(name => /武器|法器|防器|护器/.test(name)), `分类名不应出现旧死代码分支：${[...catNames]}`)
  // relicCategory 是 1~4 的数字，不能与 item.category（数字路径数组）混用
  assert.ok(data.relics.every(relic => typeof relic.relicCategory === 'number'))
  assert.ok(data.relics.every(relic => Array.isArray(relic.category)))
})

test('遗器件数与类型分布正确：基础 25 + 核心 9 = 34', () => {
  const data = readParsed('relics.json')
  assert.equal(data.relics.length, 34)
  assert.equal(data.relics.filter(r => r.type === 'base').length, 25)
  assert.equal(data.relics.filter(r => r.type === 'core').length, 9)
})

test('每件遗器的 1~5 级文本齐全且非空；核心遗器必须有共鸣', () => {
  const data = readParsed('relics.json')
  for (const relic of data.relics) {
    assert.equal(relic.levels.length, 5, `${relic.id} 应有 5 级`)
    assert.deepEqual(relic.levels.map(lv => lv.level), [1, 2, 3, 4, 5], `${relic.id} 等级应为 1~5`)
    assert.ok(relic.levels.every(lv => lv.text.length > 0), `${relic.id} 存在空文本`)
    if (relic.type === 'core') {
      assert.ok(relic.resonances.length > 0, `${relic.id} 核心遗器应有共鸣`)
      for (const res of relic.resonances) {
        assert.ok(res.requirementParts.length > 0, `${relic.id} 共鸣条件不能为空`)
        assert.ok(res.text.length > 0, `${relic.id} 共鸣文本不能为空`)
      }
    } else {
      assert.equal(relic.resonances.length, 0, `${relic.id} 基础遗器不应有共鸣`)
    }
  }
})

test('核心遗器不把内部 des 当属性名（des 形如 core_101）', () => {
  const data = readParsed('relics.json')
  for (const relic of data.relics.filter(r => r.type === 'core')) {
    assert.equal(relic.attributeName, '', `${relic.id} 核心遗器不应有 attributeName`)
    assert.ok(!/^core_\d+$/.test(relic.name), `${relic.id} 名字不应是内部 id`)
  }
  // 基础遗器的属性名必须是可读中文
  for (const relic of data.relics.filter(r => r.type === 'base')) {
    assert.ok(relic.attributeName.length > 0, `${relic.id} 基础遗器应有属性名`)
    assert.ok(!/^[a-z]+_\d+$/i.test(relic.attributeName), `${relic.id} 属性名不应是内部 id`)
  }
})

test('法盘尺寸 8×7、上限 30 级；未开放秘境（SP2 瓦希什塔）整块隐藏', () => {
  const data = readParsed('relics.json')
  /*
   * 只保留**已开放**秘境：sp1 亚空回廊（活动 2025-11-14 起）。
   * sp2 瓦希什塔的 activityList.startTime 是 2925-12-01 占位值 → 未开放，秘境与法盘一起隐藏。
   * 判据来自活动开放时间，不是硬编码 id：官方定档后自动放行。
   */
  assert.equal(data.dungeons.length, 1)
  assert.equal(data.dungeons[0].name, '亚空回廊·特异次元')
  assert.equal(data.fapan.length, 1)
  assert.equal(data.fapan[0].name, '法盘·亚空回廊')
  for (const board of data.fapan) {
    assert.equal(board.width, 8)
    assert.equal(board.height, 7)
    assert.equal(board.maxLevel, 30)
    assert.equal(board.cells.length, board.width * board.height, `${board.id} 格子数应为 ${board.width * board.height}`)
    assert.equal(board.cells.filter(cell => cell.locked).length, board.lockCount)
    assert.equal(board.openCount, board.cells.length - board.lockCount)
    const keys = new Set(board.cells.map(cell => `${cell.x},${cell.y}`))
    assert.equal(keys.size, board.cells.length, `${board.id} 坐标有重复`)
  }
})

test('构建产物与 raw 一致（buildRelicsFile 可复现）', () => {
  const built = buildRelicsFile().data
  const parsed = readParsed('relics.json')
  assert.deepEqual(built.relics.map(r => r.id), parsed.relics.map(r => r.id))
  assert.deepEqual(built.categoryNames, parsed.categoryNames)
})

test('玩法规则数值取自 relicSetting，且形状/共鸣结构完整', () => {
  const data = readParsed('relics.json')
  const setting = JSON.parse(readFileSync(join(repoRoot, 'raw/relicSetting.json'), 'utf8'))
  const s = setting.datas || setting
  /*
   * 规则数值必须来自 relicSetting.json，不能写死：
   *   maxCoreRelicNum 核心遗器最多几种、relicLevelUpCost 升级消耗几个同类、
   *   fapanExp 的键数 = 法盘总级数。
   */
  assert.equal(data.rules.maxCoreRelicNum, Number(s.maxCoreRelicNum))
  assert.equal(data.rules.levelUpCost, Number(s.relicLevelUpCost))
  assert.equal(data.rules.maxFapanLevel, Object.keys(s.fapanExp || {}).length)
  // 每件遗器都带形状格子（= w×h），供页面画占格
  for (const relic of data.relics) {
    assert.equal(relic.shapeCells.length, relic.shape.width * relic.shape.height, `${relic.id} 形状格数不对`)
  }
  // 核心遗器的共鸣条件里的分类名必须是火/水/地/风，不能是数字或旧名
  for (const core of data.relics.filter(r => r.type === 'core')) {
    for (const res of core.resonances) {
      for (const part of res.requirementParts) {
        assert.ok(/火属性|水属性|地属性|风属性/.test(part.categoryName), `${core.id} 共鸣分类名异常：${part.categoryName}`)
      }
    }
  }
})
