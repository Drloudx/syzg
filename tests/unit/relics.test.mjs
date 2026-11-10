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

test('遗器分类名用游戏真名（武器/法器/防器/护器），不是臆造名', () => {
  const data = readParsed('relics.json')
  assert.deepEqual(data.categoryNames, { 1: '武器', 2: '法器', 3: '防器', 4: '护器' })
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

test('法盘尺寸 8×7、上限 30 级，两个秘境各一块', () => {
  const data = readParsed('relics.json')
  assert.equal(data.fapan.length, 2)
  for (const board of data.fapan) {
    assert.equal(board.width, 8)
    assert.equal(board.height, 7)
    assert.equal(board.maxLevel, 30)
  }
  assert.deepEqual(data.dungeons.map(d => d.name).sort(), ['亚空回廊·特异次元', '瓦希什塔秘境'].sort())
})

test('构建产物与 raw 一致（buildRelicsFile 可复现）', () => {
  const built = buildRelicsFile().data
  const parsed = readParsed('relics.json')
  assert.deepEqual(built.relics.map(r => r.id), parsed.relics.map(r => r.id))
  assert.deepEqual(built.categoryNames, parsed.categoryNames)
})
