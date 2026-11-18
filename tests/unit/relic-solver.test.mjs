import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  isPermanentCorner,
  getCoreResonanceRangeCells,
  getDefaultOpenGridSet,
  solveFapanPlacement,
  evaluateResonances,
  calculateTotalStats,
  parseRequirementParts,
  getElementSlug,
  formatRelicEffect
} from '../../src/utils/relicSolver.js'

const relicsData = JSON.parse(readFileSync(resolve('public/data/parsed/relics.json'), 'utf8'))
const allRelics = relicsData.relics
const fapanCells = relicsData.fapan[0]?.cells || []

test('四角永久切角判定正确', () => {
  assert.equal(isPermanentCorner(0, 0), true)
  assert.equal(isPermanentCorner(7, 0), true)
  assert.equal(isPermanentCorner(0, 6), true)
  assert.equal(isPermanentCorner(7, 6), true)
  assert.equal(isPermanentCorner(1, 1), false)
  assert.equal(isPermanentCorner(3, 3), false)
})

test('核心遗器十字能量共鸣范围（对标源码 GetResonanceRangeCells）', () => {
  // 幽夜大弓 2x3, range=2, 放在 (x: 3, y: 2)
  const rangeCells = getCoreResonanceRangeCells({
    x: 3,
    y: 2,
    width: 2,
    height: 3,
    relic: { energyPattern: 2 }
  })

  // 验证垂直方向扩展 2 格
  assert.ok(rangeCells.has('3,0'), '垂直向上 row 0 col 3')
  assert.ok(rangeCells.has('4,0'), '垂直向上 row 0 col 4')
  assert.ok(rangeCells.has('3,1'), '垂直向上 row 1 col 3')
  assert.ok(rangeCells.has('4,1'), '垂直向上 row 1 col 4')
  assert.ok(rangeCells.has('3,5'), '垂直向下 row 5 col 3')
  assert.ok(rangeCells.has('4,5'), '垂直向下 row 5 col 4')
  assert.ok(rangeCells.has('3,6'), '垂直向下 row 6 col 3')
  assert.ok(rangeCells.has('4,6'), '垂直向下 row 6 col 4')

  // 验证水平方向扩展 2 格
  assert.ok(rangeCells.has('1,2'), '水平向左 row 2 col 1')
  assert.ok(rangeCells.has('2,2'), '水平向左 row 2 col 2')
  assert.ok(rangeCells.has('5,2'), '水平向右 row 2 col 5')
  assert.ok(rangeCells.has('6,2'), '水平向右 row 2 col 6')

  // 核心自身占格不得包含在 rangeCells 中
  assert.equal(rangeCells.has('3,2'), false, '核心自身不可作为共鸣生效格')
  assert.equal(rangeCells.has('4,3'), false, '核心自身不可作为共鸣生效格')

  // 斜角（如 0,0 或 1,1）不得在十字范围内
  assert.equal(rangeCells.has('1,1'), false, '斜角不在十字能量范围内')
  assert.equal(rangeCells.has('6,5'), false, '斜角不在十字能量范围内')
})

test('默认已解锁格子集合计算正确', () => {
  const maxSet = getDefaultOpenGridSet(30, fapanCells)
  assert.equal(maxSet.size, 52, '满级应恰好 52 格')
  assert.equal(maxSet.has('0,0'), false)
  assert.equal(maxSet.has('7,0'), false)
  assert.equal(maxSet.has('0,6'), false)
  assert.equal(maxSet.has('7,6'), false)

  const initialSet = getDefaultOpenGridSet(1, fapanCells)
  assert.equal(initialSet.size, 22, '初始应恰好 22 格')
})

test('自动装箱求解器（满级52格，选1个核心，必须在十字能量范围内激活共鸣）', () => {
  const openCells = getDefaultOpenGridSet(30, fapanCells)
  const result = solveFapanPlacement({
    openCells,
    selectedCoreIds: ['core_101'], // 幽夜大弓 (2x3)
    allRelics
  })

  assert.equal(result.success, true)
  assert.ok(result.placedRelics.length > 0)

  // 验证所有放置的遗器没有重叠、没有落在四角、没有超出棋盘
  const occupied = new Set()
  for (const placed of result.placedRelics) {
    for (let dy = 0; dy < placed.height; dy += 1) {
      for (let dx = 0; dx < placed.width; dx += 1) {
        const x = placed.x + dx
        const y = placed.y + dy
        const key = `${x},${y}`
        assert.ok(openCells.has(key), `放置在非开放格子 ${key}`)
        assert.equal(isPermanentCorner(x, y), false, `覆盖了四角隐藏角 ${key}`)
        assert.equal(occupied.has(key), false, `格子 ${key} 发生了重叠`)
        occupied.add(key)
      }
    }
  }

  // 核心遗器必须在盘上
  const corePlaced = result.placedRelics.find(p => p.relicId === 'core_101')
  assert.ok(corePlaced, '选定的核心遗器必须在盘上')
  assert.equal(corePlaced.isCore, true)

  // 必须激活至少 1 条共鸣
  assert.ok(result.activeResonances.length > 0, '在能量范围约束下依然能成功激活共鸣')

  // 汇总词条加成必须非空
  assert.ok(result.totalStats.length > 0)
  assert.ok(result.usedCellCount > 30, `格子利用数 (${result.usedCellCount}) 应充分利用`)
})

test('排除指定属性与元素（如排除魔法攻击与风属性）', () => {
  const openCells = getDefaultOpenGridSet(30, fapanCells)
  const result = solveFapanPlacement({
    openCells,
    selectedCoreIds: ['core_105'], // 荆棘王冠 (2x1)
    excludedStats: ['魔法攻击', '魔法穿透'],
    excludedCategories: ['风属性'],
    allRelics
  })

  assert.equal(result.success, true)
  for (const placed of result.placedRelics) {
    if (!placed.isCore) {
      assert.notEqual(placed.relic.attributeName, '魔法攻击')
      assert.notEqual(placed.relic.attributeName, '魔法穿透')
      assert.notEqual(placed.relic.categoryName, '风属性')
    }
  }

  const statNames = result.totalStats.map(s => s.name)
  assert.equal(statNames.includes('魔法攻击'), false)
  assert.equal(statNames.includes('魔法穿透'), false)
})

test('限制基础遗器拥有量与单品数量上限（如全局每种限 1 件或自定义库存）', () => {
  const openCells = getDefaultOpenGridSet(30, fapanCells)

  // 0. 测试默认情况下每种基础遗器最大使用数 <= 3
  const resDefaultLimit = solveFapanPlacement({
    openCells,
    selectedCoreIds: ['core_101'],
    allRelics
  })
  assert.equal(resDefaultLimit.success, true)
  const defaultCountMap = {}
  for (const placed of resDefaultLimit.placedRelics) {
    if (!placed.isCore) {
      defaultCountMap[placed.relicId] = (defaultCountMap[placed.relicId] || 0) + 1
      assert.ok(defaultCountMap[placed.relicId] <= 3, `遗器 ${placed.relicId} 超出了默认限 3 件的限制`)
    }
  }

  // 1. 测试全局每种最多 1 件
  const resGlobalLimit = solveFapanPlacement({
    openCells,
    selectedCoreIds: ['core_101'],
    globalMaxCountPerRelic: 1,
    allRelics
  })
  assert.equal(resGlobalLimit.success, true)
  const countMap = {}
  for (const placed of resGlobalLimit.placedRelics) {
    if (!placed.isCore) {
      countMap[placed.relicId] = (countMap[placed.relicId] || 0) + 1
      assert.ok(countMap[placed.relicId] <= 1, `遗器 ${placed.relicId} 超出了每种限 1 件的限制`)
    }
  }

  // 2. 测试单独指定特定属性遗器上限（如禁用阿娜希塔之碑，限制断锋短剑为 1 件）
  const resCustomLimit = solveFapanPlacement({
    openCells,
    selectedCoreIds: ['core_101'],
    relicMaxCounts: {
      earthAttack_1001: 0, // 0 件代表禁用
      phyAtk_1001: 1
    },
    allRelics
  })
  assert.equal(resCustomLimit.success, true)
  const hasEarthAttack = resCustomLimit.placedRelics.some(p => p.relicId === 'earthAttack_1001')
  assert.equal(hasEarthAttack, false, '被限制为 0 件的遗器绝不出现在盘上')
  const phyAtkCount = resCustomLimit.placedRelics.filter(p => p.relicId === 'phyAtk_1001').length
  assert.ok(phyAtkCount <= 1, '单独限制 1 件的遗器使用数不超过 1')
})

test('共鸣需求解析、元素映射与效果文本清洗', () => {
  // 1. parseRequirementParts
  const parts = parseRequirementParts('{火属性 ×2 + 风属性 ×1}')
  assert.deepEqual(parts, [
    { categoryName: '火属性', count: 2 },
    { categoryName: '风属性', count: 1 }
  ])

  const multiParts = parseRequirementParts('{火属性 ×1 + 水属性 ×1 + 地属性 ×1 + 风属性 ×1}')
  assert.equal(multiParts.length, 4)

  // 2. getElementSlug
  assert.equal(getElementSlug('火属性'), 'fire')
  assert.equal(getElementSlug('水属性'), 'water')
  assert.equal(getElementSlug('地属性'), 'ground')
  assert.equal(getElementSlug('风属性'), 'wind')

  // 3. formatRelicEffect 消除大括号并将内部包裹为高亮 span
  const rawText = '角色每次普通攻击时减少该效果冷却时间 {3} 秒，伤害提高 {20%}。'
  const formatted = formatRelicEffect(rawText)
  assert.equal(
    formatted,
    '角色每次普通攻击时减少该效果冷却时间 <span class="relic-num-hl">3</span> 秒，伤害提高 <span class="relic-num-hl">20%</span>。'
  )
  assert.equal(formatted.includes('{'), false)
  assert.equal(formatted.includes('}'), false)
})

