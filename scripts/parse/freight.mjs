/**
 * 货运站（FreightPanel）预解析：public/data/parsed/freight.json
 *
 * 数据来源（原表，全部走 readJson 的 raw/ 优先口径）：
 *   - `market.json`           市场货品（51 条）：基础价、库存上限、补货周期、可买/可卖
 *   - `newOrder.json`         委托订单（40 条）：NPC 要什么货、报酬倍率、立绘与台词
 *   - `item.json`             物品名/图标/品质/售价
 *   - `homeLevel.json`        货运站建筑等级（Lv1~3）与载重加成
 *   - `playerAbilityInit.json` 载重/时间基数（orderWeight / orderOverweight 等 6 项）
 *   - `reward.json`           每日订单奖励（carriage01）
 *
 * ## 价格档位口径（源码判据）
 *
 * `FreightMarketItemTemp.cs:51-99` 把「当前价 / 基础价」`priceScale` 落在
 * `[priceMin, priceMax]` = `[0.6, 1.4]` 区间内，按 `step = (priceMax - priceMin) / 5`
 * 切成 5 档，**严格大于**阈值才升级：
 *
 *   priceScale > 1.24 → cart_price_max 「极高」
 *   priceScale > 1.08 → cart_price_high「高价」
 *   priceScale > 0.92 → cart_price_ori 「持平」
 *   priceScale > 0.76 → cart_price_low「低价」
 *   其余             → cart_price_min「极低」
 *
 * 网页不连服务器，拿不到实时的 `priceScale`（它在 `FreightServerData.freightMarketData`
 * 里，是服务端下发）。本产物给出**每件货品的可能价格区间**：基础价 × 各档阈值的上下界，
 * 让前端能如实展示「这件货在什么价位算极低、什么价位算极高」，而不是编一个当前价。
 *
 * ## 订单报酬公式（源码判据）
 *
 * `FreightOrderItemTemp.cs:90`：
 *   money = (int)(Σ(item.sellPrice × items[].num) × orderValue + baseValue)
 *
 * `item.sellPrice` 取 `item.json`，`orderValue` / `baseValue` 取 `newOrder.json`。
 */
import { readJson } from './shared.mjs'

const table = value => value?.datas || value || {}

/** 价格档位：返回 { key, label, sprite, min, max }，min/max 是 priceScale 的半开区间。 */
function buildPriceTiers(priceMin, priceMax) {
  const step = (priceMax - priceMin) / 5
  const bounds = [0, 1, 2, 3, 4].map(i => +(priceMin + step * i).toFixed(6))
  // 与源码的 if/else 链同构：从高到低判定，命中即返回
  return [
    { key: 'max', label: '极高', sprite: 'cart_price_max', min: bounds[4], max: priceMax, tone: 'high' },
    { key: 'high', label: '高价', sprite: 'cart_price_high', min: bounds[3], max: bounds[4], tone: 'high' },
    { key: 'ori', label: '持平', sprite: 'cart_price_ori', min: bounds[2], max: bounds[3], tone: 'normal' },
    { key: 'low', label: '低价', sprite: 'cart_price_low', min: bounds[1], max: bounds[2], tone: 'low' },
    { key: 'min', label: '极低', sprite: 'cart_price_min', min: priceMin, max: bounds[1], tone: 'low' }
  ]
}

/** 源码同构的档位判定，供单测与前端复用。严格大于阈值才升级，故用 min < scale <= max（最顶档含 min）。 */
export function priceTierOf(priceScale, priceMin, priceMax) {
  const step = (priceMax - priceMin) / 5
  if (priceScale > priceMin + step * 4) return 'max'
  if (priceScale > priceMin + step * 3) return 'high'
  if (priceScale > priceMin + step * 2) return 'ori'
  if (priceScale > priceMin + step * 1) return 'low'
  return 'min'
}

/** 物品索引：typeId → { name, img, quality, sellPrice } */
function buildItemIndex() {
  const items = table(readJson('item.json'))
  const index = new Map()
  for (const [typeId, entry] of Object.entries(items)) {
    index.set(typeId, {
      name: entry.name || typeId,
      img: entry.img || typeId,
      quality: Number(entry.quality) || 1,
      sellPrice: Number(entry.sellPrice) || 0
    })
  }
  return index
}

const money = value => Math.round(value)

export function buildFreightFile() {
  const market = table(readJson('market.json'))
  const orders = table(readJson('newOrder.json'))
  const homeLevel = table(readJson('homeLevel.json'))
  const abilities = table(readJson('playerAbilityInit.json'))
  const rewards = table(readJson('reward.json'))
  const items = buildItemIndex()

  const priceMin = Number(market.priceMin) || 0.6
  const priceMax = Number(market.priceMax) || 1.4
  const tiers = buildPriceTiers(priceMin, priceMax)

  /* ── 市场货品 ── */
  const goods = []
  for (const [typeId, conf] of Object.entries(market.goods || {})) {
    const info = items.get(typeId) || { name: typeId, img: typeId, quality: 1, sellPrice: 0 }
    const basePrice = Number(conf.basePrice) || 0
    goods.push({
      typeId,
      name: info.name,
      img: info.img,
      quality: info.quality,
      basePrice,
      /** 基础价 × 5 档阈值 = 这件货在各档位下的价格边界 */
      priceRange: {
        low: money(basePrice * priceMin),
        high: money(basePrice * priceMax)
      },
      maxNum: Number(conf.maxNum) || 0,
      addNum: Number(conf.addNum) || 0,
      addTime: Number(conf.addTime) || 0,
      buyIn: conf.buyIn !== false,
      sellOut: conf.sellOut !== false,
      tip: conf.tip || ''
    })
  }
  // 稳定排序：贵的前，同价按 typeId
  goods.sort((a, b) => (b.basePrice - a.basePrice) || a.typeId.localeCompare(b.typeId))

  /* ── 委托订单 ── */
  const orderList = []
  for (const [orderTypeId, conf] of Object.entries(orders.goods || {})) {
    const lines = (conf.items || []).map(it => {
      const info = items.get(it.typeId) || { name: it.typeId, img: it.typeId, quality: 1, sellPrice: 0 }
      return {
        typeId: it.typeId,
        num: Number(it.num) || 0,
        name: info.name,
        img: info.img,
        quality: info.quality,
        sellPrice: info.sellPrice
      }
    })
    // 源码 FreightOrderItemTemp.cs:68-90：Σ(sellPrice × num) × orderValue + baseValue
    const cost = lines.reduce((sum, line) => sum + line.sellPrice * line.num, 0)
    const baseValue = Number(conf.baseValue) || 0
    const orderValue = Number(conf.orderValue) || 0
    orderList.push({
      orderTypeId,
      name: conf.name || orderTypeId,
      chance: Number(conf.chance) || 0,
      baseValue,
      orderValue,
      charaText: conf.charaText || '',
      charaImg: conf.charaImg || '',
      tip: conf.tip || '',
      cost,
      /** 游戏内实际给的银币奖励（向下取整，与源码 (int) 一致） */
      reward: Math.floor(cost * orderValue + baseValue),
      items: lines
    })
  }
  orderList.sort((a, b) => a.orderTypeId.localeCompare(b.orderTypeId))

  /* ── 货运站建筑等级 ──
   * 源码 `CampResearchData.RefreshPlayerAbilityInitData` 对建筑加成是**逐级累加**：
   *   for (int i = 1; i <= homeLevelData.level; i++) playerAbilityInitData[key] += level[i].playerAbility[key]
   * 所以 Lv3 时 orderWeight 实际是 0 + 5 + 10 = 15，不是表里写的 10。
   * 两个值都要给：`gain` 是该级新增量（表里写的），`total` 是到该级为止的累计值（游戏实际生效）。
   */
  const carriage = homeLevel.carriage || {}
  let cumulative = {}
  const levelList = Object.entries(carriage.level || {}).map(([level, conf]) => {
    const ability = conf.playerAbility || {}
    for (const [key, value] of Object.entries(ability)) {
      cumulative[key] = (cumulative[key] || 0) + (Number(value) || 0)
    }
    return {
      level: Number(level),
      centerLevel: Number(conf.centerLevel) || 0,
      desc: conf.desc || '',
      consume: conf.consume || '',
      gain: Number(ability.orderWeight) || 0,
      total: cumulative.orderWeight || 0
    }
  }).sort((a, b) => a.level - b.level)

  return {
    file: 'parsed/freight.json',
    data: {
      schemaVersion: 1,
      modelVersion: 'config-v1',
      market: {
        priceMin,
        priceMax,
        priceInterval: Number(market.priceInterval) || 1800,
        priceOverScale: Number(market.priceOverScale) || 0.5,
        priceRandomArea: Number(market.priceRandomArea) || 0.45,
        priceRandomMaxChange: Number(market.priceRandomMaxChange) || 0.1,
        desc: market.desc || '',
        weightDesc: market.weightDesc || '',
        tip: market.tip || '',
        tiers
      },
      order: {
        orderNumMax: Number(orders.orderNumMax) || 0,
        orderTimeSeconds: Number(orders.orderTimeSeconds) || 0,
        orderDailyTarget: orders.orderDailyTarget || null,
        priceTip: orders.priceTip || '',
        dailyRewardMoney: Number(rewards.carriage01?.money) || 0
      },
      ability: {
        orderWeight: Number(abilities.orderWeight) || 0,
        orderNumAdd: Number(abilities.orderNumAdd) || 0,
        orderTimeSeconds: Number(abilities.orderTimeSeconds) || 0,
        orderOverweight: Number(abilities.orderOverweight) || 0,
        orderOverweightTimeSeconds: Number(abilities.orderOverweightTimeSeconds) || 0,
        orderTimeSpd: Number(abilities.orderTimeSpd) || 0,
        /** 满级（Lv3）时的累计载重：基础 20 + 建筑 0+5+10 = 35 */
        maxOrderWeight: (Number(abilities.orderWeight) || 0) + (levelList.at(-1)?.total || 0)
      },
      carriage: { name: carriage.name || '货运站', condition: carriage.condition || '', levels: levelList },
      goods,
      orders: orderList
    }
  }
}
