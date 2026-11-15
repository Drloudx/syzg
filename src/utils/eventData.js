/**
 * 事件/探索图鉴构建期纯函数：由 randomEventInfo/area/reward/item/exploreArea/mon 原始 JSON
 * 生成事件与探索区域列表。与 EventsView.vue 的组装逻辑保持一致；
 * imgUrl 存相对路径（调用方再包 getImageUrl），奖励条目 icon 为相对路径（渲染时包 getImageUrl）。
 * 不依赖网络与浏览器，Node 构建脚本（scripts/parse/*.mjs）与浏览器共用。
 */
import { BASE_REWARD_NAMES, getRarityName, parseRewardEntries, parseRewardGroups } from './gameMappings.js'
import { isBlacklisted } from '../config/blacklist.js'

/**
 * 探索区域奖励解析（方案 A）：
 * 1. 基础货币/经验（fixed）：固定展示对应数值。
 * 2. 主材组（组内单一物品）：独立抽取 num 轮，累计获得区间为 (num * min) ~ (num * max)（例如木材 80~120）。
 * 3. 候选池组（组内多物品）：合并同 ID 物品权重，按二项分布核心波动 (mu +- 1.25*sigma) 计算
 *    高概率常见预估区间（例如小麦 3~7、亚麻 1~4），并计算单次抽取概率与综合获得率。
 */
export function parseExploreRewardEntries(rewardMap, itemMap, rewardId) {
  const groups = parseRewardGroups(rewardId, { rewards: rewardMap, items: itemMap })
  const entries = []
  let groupIndex = 0

  for (const group of groups) {
    if (group.kind === 'fixed') {
      let hasFixed = false
      for (const rule of group.rules) {
        if (!rule.typeId && !rule.targetName) continue
        const count = Number(rule.min ?? 1)
        entries.push({
          kind: rule.mode,
          typeId: rule.typeId || rule.mode,
          name: rule.targetName,
          quality: rule.targetQuality || 1,
          icon: rule.targetImg,
          rawMin: count,
          rawMax: count,
          min: count,
          max: count,
          count,
          countMin: count,
          countMax: count,
          probText: '必定获得',
          detail: '基础货币/经验',
          hideCountProb: true,
          groupIndex,
          groupRate: 1,
          groupCount: 1,
          actualProb: 1,
          cumulativeProb: 1
        })
        hasFixed = true
      }
      if (hasFixed) groupIndex++
      continue
    }

    const num = Math.max(1, Math.floor(Number(group.num || 1)))
    const rate = Math.min(1, Math.max(0, Number(group.rate ?? 1)))
    const validRules = (group.rules || []).filter(r => r && (r.typeId || r.targetName))
    if (!validRules.length) continue

    // 按 typeId 聚合规则（合并同物品在候选池中的多条权重）
    const itemAgg = new Map()
    for (const rule of validRules) {
      const key = rule.typeId || rule.targetName
      if (!itemAgg.has(key)) {
        itemAgg.set(key, {
          rule,
          min: Number(rule.min ?? 1),
          max: Number(rule.max ?? (rule.min ?? 1)),
          probSum: Number(rule.prob ?? 0),
          actualProbSum: Number(rule.actualProb ?? 0)
        })
      } else {
        const agg = itemAgg.get(key)
        agg.min = Math.min(agg.min, Number(rule.min ?? 1))
        agg.max = Math.max(agg.max, Number(rule.max ?? (rule.min ?? 1)))
        agg.probSum += Number(rule.prob ?? 0)
        agg.actualProbSum += Number(rule.actualProb ?? 0)
      }
    }

    const isSingleItem = itemAgg.size === 1

    for (const [key, agg] of itemAgg) {
      const { rule } = agg
      const rawIcon = String(rule.targetImg || '').replace(/^\/images\//, '/')
      const icon = rawIcon && rawIcon.trim() ? rawIcon : (rule.typeId ? `/Common_ItemIcon/${rule.typeId}.webp` : '')
      const quality = rule.targetQuality || 1

      if (isSingleItem) {
        // 主材组：独立抽取 num 轮，累计获得 [num * min, num * max]
        const countMin = agg.min * num
        const countMax = agg.max * num
        entries.push({
          kind: rule.mode || 'item',
          typeId: rule.typeId || key,
          name: rule.targetName,
          quality,
          icon,
          rawMin: agg.min,
          rawMax: agg.max,
          min: countMin,
          max: countMax,
          count: countMin,
          countMin,
          countMax,
          probText: rate < 1 ? `${Math.round(rate * 100)}% 概率` : '必定获得',
          detail: num > 1 ? `共 ${num} 轮抽取累计` : '',
          hideCountProb: true,
          groupIndex,
          groupRate: rate,
          groupCount: num,
          actualProb: rate,
          cumulativeProb: rate
        })
      } else {
        // 候选池组：在多个候选项中总计抽取 num 轮
        // 方案 A（高概率常见预估区间）：基于二项分布核心波动 (mu +- 1.25 * sigma)
        const prob = agg.actualProbSum
        const pct = (prob * 100).toFixed(prob * 100 % 1 === 0 ? 0 : 1)
        const pSingle = rate > 0 ? Math.min(1, prob / rate) : prob
        const cumulativeProb = Math.min(1, Math.max(0, rate * (1 - Math.pow(1 - pSingle, num))))

        const avgPerDraw = (agg.min + agg.max) / 2
        const theoMax = num * agg.max
        const expVal = num * pSingle * avgPerDraw
        const std = Math.sqrt(num * pSingle * (1 - pSingle)) * avgPerDraw
        const countMin = Math.min(theoMax, Math.max(agg.min, Math.round(expVal - 1.25 * std)))
        const countMax = Math.min(theoMax, Math.max(countMin, Math.round(expVal + 1.25 * std)))

        entries.push({
          kind: rule.mode || 'item',
          typeId: rule.typeId || key,
          name: rule.targetName,
          quality,
          icon,
          rawMin: agg.min,
          rawMax: agg.max,
          min: countMin,
          max: countMax,
          count: countMin,
          countMin,
          countMax,
          probText: `单次 ${pct}%`,
          detail: '',
          hideCountProb: true,
          groupIndex,
          groupRate: rate,
          groupCount: num,
          actualProb: prob,
          cumulativeProb
        })
      }
    }
    groupIndex++
  }

  return { entries, text: [] }
}

const CONSUME_FIELDS = ['money', 'ke', 'payKe', 'ti', 'speed']

const consumeText = (consumeMap, itemMap, consumeId) => {
  if (!consumeId) return ''
  const consume = consumeMap[consumeId]
  if (!consume) return consumeId

  const parts = []
  for (const field of CONSUME_FIELDS) {
    const value = Number(consume[field] || 0)
    if (value > 0) parts.push(`${value} ${BASE_REWARD_NAMES[field] || field}`)
  }
  for (const entry of consume.items || []) {
    if (!entry?.typeId) continue
    const item = itemMap[entry.typeId]
    parts.push(`${item?.name || entry.typeId} x${Number(entry.num || 1)}`)
  }

  return parts.join('、') || consume.name || consumeId
}

export function buildEventData(maps) {
  const { eventJson, areaJson, rewardJson, consumeJson, itemJson, mapJson, exploreJson, monJson } = maps

  const eventMap = (eventJson && eventJson.datas) || eventJson || {}
  const areaData = (areaJson && areaJson.data) || {}
  const rewardMap = (rewardJson && rewardJson.datas) || {}
  const consumeMap = (consumeJson && consumeJson.datas) || consumeJson || {}
  const itemMap = (itemJson && itemJson.datas) || {}
  const mapNameData = (mapJson && mapJson.datas) || mapJson || {}
  const exploreData = (exploreJson && exploreJson.datas) || exploreJson || {}
  const monMap = (monJson && monJson.datas) || monJson || {}

  const mapNameMap = {}
  for (const k of ['c1_map', 'c2_map', 'c3_map', 'c4_map', 'c5_map']) {
    if (mapNameData[k]) mapNameMap[k] = mapNameData[k].name
  }

  // ===== 随机事件 =====
  const eventLoc = {}
  for (const [mapId, groups] of Object.entries(areaData)) {
    for (const g of groups) {
      for (const ev of g.events || []) {
        if (!eventLoc[ev.typeId]) eventLoc[ev.typeId] = []
        eventLoc[ev.typeId].push({
          mapId,
          group: g.group || '',
          chance: Number(ev.chance || 0)
        })
      }
    }
  }

  const groupCoolTime = (areaJson && areaJson.groupCoolTime) || {}

  const events = []
  for (const ev of Object.values(eventMap)) {
    if (!ev || !ev.typeId) continue
    const locations = eventLoc[ev.typeId]
    if (!locations || !locations.length) continue
    const groups = [...new Set(locations.map(loc => loc.group).filter(Boolean))]
    const maps = [...new Set(locations.map(loc => loc.mapId))]
    const groupLabel = groups.includes('rare2') ? '稀有' : (groups.includes('rare1') ? '普通' : '')
    // 随机事件分组映射到品质体系（统一颜色）：普通 rare1 -> 品质1(灰)，稀有 rare2 -> 品质3(蓝)
    const groupQuality = groups.includes('rare2') ? 3 : 1
    const group = groups[0] || ''
    const chance = locations[0]?.chance || 0
    events.push({
      id: ev.typeId,
      name: ev.name || ev.typeId,
      des: ev.des || '',
      img: ev.img || ev.typeId,
      imgUrl: `/images/event/${(ev.img || ev.typeId)}.webp`,
      buttonText: ev.buttonText || '',
      maps,
      mapNames: maps.map(m => mapNameMap[m] || m),
      group,
      groupCooldown: Number(groupCoolTime[group] || 0),
      badgeText: groupLabel,
      quality: groupQuality,
      chance,
      consumeText: consumeText(consumeMap, itemMap, ev.consume),
      reward: parseRewardEntries(rewardMap, itemMap, ev.reward)
    })
  }

  // ===== 探索区域 =====
  const explores = []
  for (const [id, conf] of Object.entries(exploreData)) {
    if (!conf || !conf.name) continue
    const m = /^explore(\d+)_/.exec(id)
    const mapKey = m ? `c${m[1]}_map` : ''
    const enemys = (conf.enemys || []).map(eid => ({
      id: eid,
      name: (monMap[eid] && (monMap[eid].name || monMap[eid].monDes)) || eid
    }))
    explores.push({
      id,
      name: conf.name || id,
      des: conf.eventDes || '',
      img: conf.eventImg || '',
      imgUrl: `/images/event/${(conf.eventImg || 'none')}.webp`,
      level: conf.level || 0,
      quality: conf.quality || 1,
      timeMinute: conf.timeMinute || 0,
      maxNum: conf.maxNum || 1,
      consumeText: consumeText(consumeMap, itemMap, conf.consume),
      mapKey,
      mapName: mapNameMap[mapKey] || '',
      positions: conf.positions || [],
      enemys,
      badgeText: getRarityName(conf.quality),
      reward: parseExploreRewardEntries(rewardMap, itemMap, conf.reward)
    })
  }

  return { events, explores, mapNameMap }
}

/**
 * 该事件/探索条目所属的地区名（**唯一实现**，页面与单测共用）。
 *
 * 随机事件用 `mapNames`（数组），探索区域用 `mapName`（单值）。
 */
export function eventRegionLabels(item) {
  if (!item) return []
  return [...(item.mapNames || []), item.mapName].filter(Boolean)
}

/**
 * 条目是否应因地区被隐藏。
 *
 * 🔴 判据是「**全部**所属地区都命中黑名单」：只命中部分时保留 ——
 * 该条目在可见地区也能遇到（如「废弃的宝箱」c1~c5 都有），藏掉会连正常内容一起丢。
 *
 * 🔴 不能只传 `{ id, name }`：`isBlacklisted` **只读固定一组字段名**，
 * `maps` / `mapKey` 会被静默忽略；而事件名（「废弃的宝箱」）不含地区名 →
 * 隐藏地区的事件会照常漏出（筛选按钮没了、卡片还在）。
 */
export function isHiddenRegionEvent(item) {
  if (!item) return false
  if (isBlacklisted({ id: item.id, name: item.name })) return true
  const labels = eventRegionLabels(item)
  if (!labels.length) return false
  return labels.every(label => isBlacklisted(label))
}

/** 详情「出现地图」应展示的地区名：与筛选栏、列表口径一致，不列隐藏地区。 */
export function visibleEventMapNames(item) {
  return (item?.mapNames || []).filter(name => !isBlacklisted(name))
}
