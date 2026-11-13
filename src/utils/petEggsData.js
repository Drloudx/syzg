/**
 * 魔物蛋图鉴构建期纯函数：由 pet.json 与卡池配置生成魔物蛋列表。
 * 与 PetsEggsView.vue 的处理逻辑保持一致（eggImg 为相对 key，渲染时由视图包 getImageUrl）。
 * 不依赖网络与浏览器，Node 构建脚本（scripts/parse/*.mjs）与浏览器共用。
 */
import { isHiddenPet } from '../config/blacklist.js'

const tableDatas = (v) => (v && typeof v === 'object' ? (v.datas ?? v) : {})

function isSilverConsumeEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  return (Number(entry.money) || 0) > 0
    && (Number(entry.ke) || 0) <= 0
    && (Number(entry.payKe) || 0) <= 0
}

/**
 * 根据原表 petPool / petPoolTime / consume 计算魔物所属池子集合：
 * - 银币池（silver）：常规银币抽池（无二级氪金兑换且以银币消耗/兑换）；
 * - 氪金池（premium）：除银币池外的所有开放蛋池合并去重（特别贩售 / 御卫贩售 / 古堡贩售等）。
 * 未开启的引导池（petPoolTime.open === false）不参与归类。
 */
export function collectPetPoolSets(maps = {}) {
  const silverIds = new Set()
  const premiumIds = new Set()
  const { petPoolJson, petPoolTimeJson, consumeJson, gachaJson } = maps

  if (petPoolJson) {
    const pools = tableDatas(petPoolJson)
    const times = tableDatas(petPoolTimeJson)
    const consumes = tableDatas(consumeJson)

    const poolOpenState = new Map()
    for (const slot of Object.values(times)) {
      const slotOpen = slot?.open !== false
      for (const team of slot?.heroTeam || []) {
        const pid = String(team?.poolTypeId || '')
        if (!pid) continue
        const isOpen = slotOpen && team?.open !== false
        poolOpenState.set(pid, Boolean(poolOpenState.get(pid) || isOpen))
      }
    }

    for (const [poolId, conf] of Object.entries(pools)) {
      if (poolOpenState.has(poolId) && !poolOpenState.get(poolId)) continue
      const ticketConsume = consumes[conf?.para?.gachaTicketsExchangeRate]
      const baseConsume = consumes[conf?.consume]
      const hasKeExchange = Boolean(conf?.para?.gachaKeExchangeRate)
      const isSilver = !hasKeExchange && (isSilverConsumeEntry(ticketConsume) || isSilverConsumeEntry(baseConsume))
      const target = isSilver ? silverIds : premiumIds
      for (const rareKey of ['rare1', 'rare2', 'rare3']) {
        for (const cand of conf?.rareSetting?.[rareKey] || []) {
          if (cand?.typeId) target.add(String(cand.typeId))
        }
      }
    }
    return { silverIds, premiumIds }
  }

  for (const pool of gachaJson?.pools || []) {
    if (pool?.kind !== 'pet' || pool?.open === false) continue
    const hasKeExchange = Boolean(pool?.exchangeCosts?.gachaKeExchangeRate?.length)
      || String(pool?.name || '').includes('特别')
    const target = hasKeExchange ? premiumIds : silverIds
    for (const tier of pool?.tiers || []) {
      for (const cand of tier?.candidates || []) {
        if (cand?.typeId) target.add(String(cand.typeId))
      }
    }
  }
  return { silverIds, premiumIds }
}

export const PET_DISPOSAL_RULE = Object.freeze({
  feedBelow: 2.2,
  sellAbove: 3.0
})

/**
 * 刚孵化的 1 级普通个体处置建议。
 * 银经比表示换取 1 点基础喂养经验所放弃的银币；两个边界落在当前全量表的自然断层中。
 * 游戏源码没有内置推荐或银币/经验兑换率，因此这里只生成基础收益建议。
 */
export function calcPetDisposalRecommendation(sellPrice, exp) {
  const safeSellPrice = Number(sellPrice) || 0
  const safeExp = Number(exp) || 0

  if (safeExp <= 0) {
    return {
      key: 'sell',
      text: '卖',
      ratio: null
    }
  }

  const ratio = safeSellPrice / safeExp

  if (ratio > PET_DISPOSAL_RULE.sellAbove) {
    return {
      key: 'sell',
      text: '卖',
      ratio
    }
  }

  if (ratio < PET_DISPOSAL_RULE.feedBelow) {
    return {
      key: 'feed',
      text: '喂',
      ratio
    }
  }

  return {
    key: 'optional',
    text: '按需选择',
    ratio
  }
}

export function buildPetEggsData(maps) {
  const { petJson } = maps
  const { silverIds, premiumIds } = collectPetPoolSets(maps)
  // 手工隐藏魔物（blacklist.js HIDDEN_PET_IDS）：蛋图鉴与收益一并排除
  const rawList = Object.values(petJson.datas || {}).filter(p => !isHiddenPet(p.monId || p.typeId))

  const formatEggTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    if (mins === 0) return `${secs}秒`
    return secs > 0 ? `${mins}分钟${secs}秒` : `${mins}分钟`
  }

  const pets = rawList.map(p => {
    const id = p.monId || p.typeId
    const eggTimeMin = p.eggTime > 0 ? p.eggTime / 60 : 1
    const goldPerMin = p.sellPrice / eggTimeMin
    const expPerMin = p.exp / eggTimeMin
    const goldEff = p.exp > 0 ? (p.sellPrice / p.exp) : 0
    const expEff = p.sellPrice > 0 ? (p.exp / p.sellPrice) : 0
    const rec = calcPetDisposalRecommendation(p.sellPrice, p.exp)

    // Star Mapping: In game minimum star is 3 (1->3星, 2->4星, 3->5星)
    const displayStar = p.star + 2
    const pools = []
    if (silverIds.has(id)) pools.push('silver')
    if (premiumIds.has(id)) pools.push('premium')

    return {
      id,
      eggImg: p.eggImg || p.typeId,
      avatarImg: `avatar_${id}`,
      name: p.name,
      star: p.star,
      displayStar,
      quality: displayStar >= 5 ? 5 : (displayStar === 4 ? 4 : 3),
      des: p.des,
      pools,
      eggTime: p.eggTime,
      eggTimeMin: Math.round(eggTimeMin * 10) / 10,
      formattedTime: formatEggTime(p.eggTime),
      sellPrice: p.sellPrice,
      exp: p.exp,
      goldPerMin,
      expPerMin,
      goldEff,
      expEff,
      recommendationKey: rec.key,
      recommendationText: rec.text,
      hp: p.hp,
      atk: p.atk,
      def: p.def,
      dex: p.dex
    }
  })

  return { pets }
}
