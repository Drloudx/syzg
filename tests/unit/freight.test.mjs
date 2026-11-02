import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { priceTierOf } from '../../scripts/parse/freight.mjs'

const freight = JSON.parse(readFileSync('public/data/parsed/freight.json', 'utf8'))
const { priceMin, priceMax, tiers } = freight.market

/**
 * 判据来自 `FreightMarketItemTemp.cs:51-99`：
 *   step = (priceMax - priceMin) / 5
 *   priceScale > priceMin + step*4 → max
 *   priceScale > priceMin + step*3 → high
 *   priceScale > priceMin + step*2 → ori
 *   priceScale > priceMin + step*1 → low
 *   其余                          → min
 * 严格大于才升级，等于阈值时留在低一档。
 */
test('价格档位判定与源码同构：严格大于阈值才升级', () => {
  const step = (priceMax - priceMin) / 5
  assert.equal(priceTierOf(priceMin + step * 4, priceMin, priceMax), 'high', '等于 4 倍阈值仍是 high')
  assert.equal(priceTierOf(priceMin + step * 4 + 0.0001, priceMin, priceMax), 'max')
  assert.equal(priceTierOf(priceMin + step * 3, priceMin, priceMax), 'ori')
  assert.equal(priceTierOf(priceMin + step * 3 + 0.0001, priceMin, priceMax), 'high')
  assert.equal(priceTierOf(priceMin + step * 2, priceMin, priceMax), 'low')
  assert.equal(priceTierOf(priceMin + step * 2 + 0.0001, priceMin, priceMax), 'ori')
  assert.equal(priceTierOf(priceMin + step, priceMin, priceMax), 'min')
  assert.equal(priceTierOf(priceMin + step + 0.0001, priceMin, priceMax), 'low')
})

test('价格档位覆盖 priceMin ~ priceMax 全区间且不重叠', () => {
  assert.equal(tiers.length, 5)
  // 从高到低排列，每档 max 等于上一档 min
  for (let i = 0; i < tiers.length - 1; i += 1) {
    assert.equal(tiers[i].min, tiers[i + 1].max, `${tiers[i].key} 与 ${tiers[i + 1].key} 边界应相接`)
  }
  assert.equal(tiers[0].max, priceMax)
  assert.equal(tiers[4].min, priceMin)
})

test('每件货品的价格区间 = 基础价 × (priceMin ~ priceMax)', () => {
  assert.ok(freight.goods.length > 0)
  for (const good of freight.goods) {
    assert.equal(good.priceRange.low, Math.round(good.basePrice * priceMin * 100) / 100)
    assert.equal(good.priceRange.high, Math.round(good.basePrice * priceMax * 100) / 100)
    assert.ok(good.priceRange.low <= good.priceRange.high)
  }
})

/**
 * 判据来自 `FreightOrderItemTemp.cs:90`：
 *   money = (int)(Σ(item.sellPrice × items[].num) × orderValue + baseValue)
 * 向下取整，不是四舍五入。
 */
test('订单报酬按源码公式核算，且与成本一致', () => {
  assert.ok(freight.orders.length > 0)
  for (const order of freight.orders) {
    const cost = order.items.reduce((sum, line) => sum + line.sellPrice * line.num, 0)
    assert.equal(order.cost, cost, `${order.orderTypeId} 成本应为 Σ(售价 × 数量)`)
    assert.equal(order.reward, Math.floor(cost * order.orderValue + order.baseValue), `${order.orderTypeId} 报酬公式`)
  }
})

test('订单报酬落在游戏可见区间，无零值', () => {
  const rewards = freight.orders.map(order => order.reward)
  assert.equal(Math.min(...rewards), 447)
  assert.equal(Math.max(...rewards), 1393)
  assert.ok(rewards.every(value => value > 0))
})

test('订单每条都带 NPC 立绘与至少 1 个货品', () => {
  for (const order of freight.orders) {
    assert.ok(order.charaImg, `${order.orderTypeId} 缺少 charaImg`)
    assert.ok(order.items.length >= 1 && order.items.length <= 2)
    for (const line of order.items) {
      assert.ok(line.num > 0)
      assert.ok(line.sellPrice >= 0)
    }
  }
})

test('货运站等级加成按源码逐级累加', () => {
  const levels = freight.carriage.levels
  assert.deepEqual(levels.map(level => level.level), [1, 2, 3])
  // 表里每级写的是「本级新增量」
  assert.equal(levels[0].gain, 0)
  assert.equal(levels[1].gain, 5)
  assert.equal(levels[2].gain, 10)
  // 源码 for (i = 1; i <= level; i++) 累加，所以 Lv3 实际生效是 15 而不是表里的 10
  assert.equal(levels[0].total, 0)
  assert.equal(levels[1].total, 5)
  assert.equal(levels[2].total, 15)
  // 基础 20 + 满级累加 15
  assert.equal(freight.ability.orderWeight, 20)
  assert.equal(freight.ability.maxOrderWeight, 35)
})

test('市场价格与订单的标量配置齐全', () => {
  assert.equal(priceMin, 0.6)
  assert.equal(priceMax, 1.4)
  assert.equal(freight.market.priceInterval, 1800)
  assert.equal(freight.order.orderNumMax, 9)
  assert.equal(freight.order.orderTimeSeconds, 1800)
  assert.equal(freight.order.dailyRewardMoney, 800)
  assert.equal(freight.ability.orderWeight, 20)
})
