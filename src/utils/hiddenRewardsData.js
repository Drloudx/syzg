/**
 * 场景宝箱（隐藏奖励）构建期纯函数：由 reward/roomCollectType/roomCollect/room/levelRoom/area
 * 原始 JSON 生成 { hidden: parsed-hidden.json 内容, sources: parsed-hidden-sources.json 内容 }。
 * 对应原 scripts/parse-hidden-rewards.js（等价迁移）。
 * 不依赖网络与浏览器，Node 构建脚本（scripts/parse/*.mjs）共用。
 */

import { isBlacklisted } from '../config/blacklist.js'

// 点位预览图映射（collectId -> { roomName, file }）。
// 来源：用户实机截图《隐藏点位》整理稿，按采集点 collectId 一一对应。
// 命名规则：`<collectId>.webp`；目录 public/images/hidden_points/。
// collectId 在 parsed-hidden 中全局唯一，同一房间多个采集点各自独立配图；
// md 未覆盖的第 4/5 章（黑森林·霜烬平原·黏滑溪谷等）保持无图。
const HIDDEN_PREV_MAP = {
  'c1tongBookHsl01': { roomName: '三岔路口', file: 'c1tongBookHsl01.webp' },
  'c0yinBookMrymw01': { roomName: '密林深处', file: 'c0yinBookMrymw01.webp' },
  'c1yinBookHsl05': { roomName: '隐居者的药田', file: 'c1yinBookHsl05.webp' },
  'c1yinBookHsl08': { roomName: '驿站住民区', file: 'c1yinBookHsl08.webp' },
  'c1jinBookHsl03': { roomName: '驿站地窖', file: 'c1jinBookHsl03.webp' },
  'c1jinBookHsl02': { roomName: '驿站地窖', file: 'c1jinBookHsl02.webp' },
  'c1changJing01': { roomName: '枯草小径', file: 'c1changJing01.webp' },
  'c1yinBookQryy01': { roomName: '枯草小径', file: 'c1yinBookQryy01.webp' },
  'c1yinBookQryy03': { roomName: '枯草小径', file: 'c1yinBookQryy03.webp' },
  'c1changJing02': { roomName: '风车小镇', file: 'c1changJing02.webp' },
  'c1yinCangHsl04': { roomName: '民居', file: 'c1yinCangHsl04.webp' },
  'c1yinBookQryy05': { roomName: '锻炉外围', file: 'c1yinBookQryy05.webp' },
  'c1jinBookHsl06': { roomName: '维丝的秘密基地', file: 'c1jinBookHsl06.webp' },
  'c1yinBookWhrz01': { roomName: '修行所外围', file: 'c1yinBookWhrz01.webp' },
  'c1changJingHsl07': { roomName: '碎石小径', file: 'c1changJingHsl07.webp' },
  'c1yinBookMrymw02': { roomName: '安瑟恩遗迹入口', file: 'c1yinBookMrymw02.webp' },
  'c1yinCangHsl09': { roomName: '观星高地外围', file: 'c1yinCangHsl09.webp' },
  'c2yinBookBnmc01': { roomName: '工头小屋', file: 'c2yinBookBnmc01.webp' },
  'c2changJing03': { roomName: '工头小屋', file: 'c2changJing03.webp' },
  'c2changJing05': { roomName: '矿山道', file: 'c2changJing05.webp' },
  'c2yinBookBnmc03': { roomName: '后山', file: 'c2yinBookBnmc03.webp' },
  'c2yinBookBnmc02': { roomName: '村口', file: 'c2yinBookBnmc02.webp' },
  'c2changJing04': { roomName: '山腰道路', file: 'c2changJing04.webp' },
  'c2yinBookBnmc04': { roomName: '菲莉娜的契约台', file: 'c2yinBookBnmc04.webp' },
  'c2changJing01': { roomName: '菲莉娜的契约台', file: 'c2changJing01.webp' },
  'c2changJing06': { roomName: '灾害研究所（外部）', file: 'c2changJing06.webp' },
  'c2yinBookMrymw03': { roomName: '灾害研究所（内部）', file: 'c2yinBookMrymw03.webp' },
  'c2yinCang': { roomName: '研究所外围', file: 'c2yinCang.webp' },
  'c2changJing07': { roomName: '外围山崖', file: 'c2changJing07.webp' },
  'c2yinBookSsj01': { roomName: '野草陷坑', file: 'c2yinBookSsj01.webp' },
  'c2changJing08': { roomName: '破败古院', file: 'c2changJing08.webp' },
  'c2yinBookSsj02': { roomName: '古院后院', file: 'c2yinBookSsj02.webp' },
  'c2yinCang02': { roomName: '古院后院', file: 'c2yinCang02.webp' },
  'c2yinBookSsj03': { roomName: '山神之殒', file: 'c2yinBookSsj03.webp' },
  'c2changJing02': { roomName: '安娜的勘测地', file: 'c2changJing02.webp' },
  'c3yinCang': { roomName: '长老小屋内', file: 'c3yinCang.webp' },
  'c3yinBookSwcs01': { roomName: '长老小屋内', file: 'c3yinBookSwcs01.webp' },
  'c3changJing01': { roomName: '尾指村居民区', file: 'c3changJing01.webp' },
  'c3yinBookHfxjl01': { roomName: '尾指村居民区', file: 'c3yinBookHfxjl01.webp' },
  'c3changJing02': { roomName: '尾指村居民区', file: 'c3changJing02.webp' },
  'c3yinBookMrymw04': { roomName: '外围深处', file: 'c3yinBookMrymw04.webp' },
  'c3yinBookSwcs02': { roomName: '献水圣坛', file: 'c3yinBookSwcs02.webp' },
  'c3changJing05': { roomName: '水纹花海', file: 'c3changJing05.webp' },
  'c3yinBookMzhyj01': { roomName: '大市集居民区2', file: 'c3yinBookMzhyj01.webp' },
  'c3changJing06': { roomName: '大市集居民区2', file: 'c3changJing06.webp' },
  'c3yinBookHfxjl02': { roomName: '赛弗的藏身处', file: 'c3yinBookHfxjl02.webp' },
  'c3yinCang02': { roomName: '赛弗的藏身处', file: 'c3yinCang02.webp' },
  'c3yinBookHfxjl03': { roomName: '贫民街·主街道', file: 'c3yinBookHfxjl03.webp' },
  'c3changJing03': { roomName: '柏莉尔的家', file: 'c3changJing03.webp' },
  'c3yinCang03': { roomName: '贫民街·二街道', file: 'c3yinCang03.webp' },
  'c3changJing04': { roomName: '贫民街·民居', file: 'c3changJing04.webp' },
  'c3changJing07': { roomName: '蒸馏工厂内部', file: 'c3changJing07.webp' },
  'c3yinBookSwcs03': { roomName: '郊外野地', file: 'c3yinBookSwcs03.webp' },
  'sp1_jiaju_item_50189': { roomName: '会客厅', file: 'sp1_jiaju_item_50189.webp' },
  'sp1_jiaju_item_50179': { roomName: '城主之间', file: 'sp1_jiaju_item_50179.webp' },
  'sp01_yincang02': { roomName: '城主之间', file: 'sp01_yincang02.webp' },
  'sp01_yincang06': { roomName: '野外', file: 'sp01_yincang06.webp' },
  'sp01_yincang01': { roomName: '餐舍', file: 'sp01_yincang01.webp' },
  'sp1_jiaju_item_50174': { roomName: '画廊', file: 'sp1_jiaju_item_50174.webp' },
  'sp01_yincang03': { roomName: '画廊', file: 'sp01_yincang03.webp' },
  'sp1_jiaju_item_50180': { roomName: '中庭', file: 'sp1_jiaju_item_50180.webp' },
  'sp1_jiaju_item_50186': { roomName: '研究室', file: 'sp1_jiaju_item_50186.webp' },
  'sp01_yincang04': { roomName: '研究室', file: 'sp01_yincang04.webp' },
  'sp01_yincang05': { roomName: '地牢', file: 'sp01_yincang05.webp' }
}
const getPrevImg = (collectId) => {
  const f = HIDDEN_PREV_MAP[collectId]?.file
  return f ? `/images/hidden_points/${f}` : ''
}

/** 简单确定性字符串哈希（djb2），用于生成稳定的条目唯一 id 摘要 */
function hashStr(str) {
  let h = 5381
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}

function normalizeHiddenRewardItems(r) {
  const result = []
  // 1. 基础货币（如偶遇事件必得 500 银币）
  if (r.money && Number(r.money) > 0) {
    result.push({
      kind: 'fixed',
      rate: 1,
      num: 1,
      rules: [{
        mode: 'money',
        typeId: 'item_00001',
        min: Number(r.money),
        max: Number(r.money),
        num: Number(r.money),
        chance: 1,
        actualProb: 1
      }]
    })
  }
  if (r.ke && Number(r.ke) > 0) {
    result.push({
      kind: 'fixed',
      rate: 1,
      num: 1,
      rules: [{
        mode: 'ke',
        typeId: 'item_00002',
        min: Number(r.ke),
        max: Number(r.ke),
        num: Number(r.ke),
        chance: 1,
        actualProb: 1
      }]
    })
  }
  // 2. 物品组（计算抽取概率与模式）
  for (const grp of (r.items || [])) {
    if (!grp || !grp.rules || !grp.rules.length) continue
    const rules = grp.rules.filter(Boolean)
    const totalChance = rules.reduce((sum, rl) => sum + (Number(rl.chance) || 1), 0)
    const rate = Number(grp.rate ?? 1)
    const num = Number(grp.num ?? 1)
    const isRandom = rules.length > 1

    result.push({
      kind: isRandom ? 'random' : 'fixed',
      rate,
      num,
      rules: rules.map(rl => {
        const min = Number(rl.min ?? rl.num ?? 1)
        const max = Number(rl.max ?? rl.num ?? min)
        const chance = Number(rl.chance) || 1
        const prob = totalChance > 0 ? chance / totalChance : 1
        const actualProb = num > 0 ? Number((rate * prob).toFixed(4)) : 0
        return {
          ...rl,
          min,
          max,
          prob,
          actualProb,
          groupCount: num
        }
      })
    })
  }
  return result
}

export function buildHiddenRewards(maps) {
  const { rewardRes, collectTypeRes, collectRes, roomRes, levelRoomRes, areaRes } = maps

  // 场景宝箱定位依赖完整房间表（含采集物引用），优先完整 room主.json，缺失回退 room.json（由脚本层选择传入）
  const rewardData = rewardRes.datas || rewardRes || {}
  const collectTypeData = collectTypeRes.datas || collectTypeRes || {}
  const collectData = collectRes.datas || collectRes || {}
  const roomData = roomRes.datas || roomRes || {}
  const levelRoomData = levelRoomRes.datas || levelRoomRes || {}
  const areaData = areaRes.datas || areaRes || {}

  const hiddenRewards = []
  const globalSources = {}
  const seen = new Set()

  // room.json 的键/room.typeId 是场景配置 ID，levelRoom.roomTypeId 才是指向它的外键。
  // 同一场景配置可能被多个地图房间复用，因此保留全部精确匹配项。
  const levelRoomsByRoomTypeId = new Map()
  for (const lr of Object.values(levelRoomData)) {
    if (!lr?.roomTypeId) continue
    const matches = levelRoomsByRoomTypeId.get(lr.roomTypeId) || []
    matches.push(lr)
    levelRoomsByRoomTypeId.set(lr.roomTypeId, matches)
  }

  // 采集点只认源码实际读取的两个字段，避免 c1_area1_1 命中 c1_area1_10 这类前缀误匹配。
  const roomsByCollectId = new Map()
  for (const [roomKey, room] of Object.entries(roomData)) {
    const collectIds = new Set()
    for (const obj of room?.battleData?.spObj || []) {
      if (obj?.caijiTypeId) collectIds.add(obj.caijiTypeId)
    }
    for (const trigger of room?.battleData?.triggers || []) {
      for (const action of trigger?.actions || []) {
        if (action?.actionPara?.roomCollectId) collectIds.add(action.actionPara.roomCollectId)
      }
    }

    for (const collectId of collectIds) {
      const matches = roomsByCollectId.get(collectId) || []
      matches.push({ ...room, typeId: room.typeId || roomKey })
      roomsByCollectId.set(collectId, matches)
    }
  }

  // 🔴 判据必须是源码语义，不是中文分类名。
  // 源码 `BattleManager.GetCollectUIText(collectType)`：1=对话 2=采集 3=挖掘 4=伐 5=检视。
  // 「场景宝箱」与「书籍」在游戏里都是 collectType=5（检视）的采集物，只是 reward.category 文案不同：
  //   旧：['采集','场景宝箱']；1.7.15 起：['大地图采集','cN','书籍']、['采集','聆听偶遇']。
  // 2026-11-11 前这里写死 `includes('场景宝箱')`，导致 22 本新书 + 2 个聆听偶遇点全部漏收。
  const INSPECT_COLLECT_TYPE = 5
  const inspectRewardIds = new Set()
  for (const ct of Object.values(collectTypeData)) {
    if (Number(ct?.collectType) === INSPECT_COLLECT_TYPE && ct?.reward) inspectRewardIds.add(ct.reward)
  }

  for (const r of Object.values(rewardData)) {
    if (!inspectRewardIds.has(r.typeId)) continue
    {
      const collectTypes = []
      for (const ct of Object.values(collectTypeData)) {
        if (ct.reward === r.typeId && Number(ct?.collectType) === INSPECT_COLLECT_TYPE) {
          collectTypes.push(ct)
        }
      }

      const collects = []
      for (const ct of collectTypes) {
        for (const c of Object.values(collectData)) {
          if (c.collectTypeId === ct.collectTypeId) {
            collects.push({ ...c, baseName: ct.name, tip: ct.tip })
          }
        }
      }

      for (const c of collects) {
        for (const rm of roomsByCollectId.get(c.typeId) || []) {
          for (const lr of levelRoomsByRoomTypeId.get(rm.typeId) || []) {
            if (isBlacklisted({ id: lr.typeId, name: lr.name })) continue
            const areaId = lr.areaId
            const areaName = areaData[areaId] ? areaData[areaId].name : areaId

            const parts = (areaId || '').split('_')
            const bigMapId = parts[0] ? parts[0] + '_map' : 'unknown_map'
            const bigMapName = areaData[bigMapId] ? areaData[bigMapId].name : '未知大地图'

            let sortKey = '99_99'
            if (lr.roomTypeId && lr.roomTypeId.includes('area')) {
              sortKey = lr.roomTypeId.split('area')[1] || sortKey
            }

            const cName = c.baseName || c.name || '场景宝箱'
            const cTip = c.tip || ''

            const uniqueKey = `${lr.typeId}-${c.typeId}-${r.typeId}`
            if (!seen.has(uniqueKey)) {
              seen.add(uniqueKey)

              // 一个物理房间（roomId）可能对应多个采集点/奖励组（各自独立一条隐藏奖励）。
              // 若只用 roomId 作为条目 id，同房多采集点会产生重复 DOM id `hidden-<roomId>`，
              // 前往定位会命中错误条目。这里给每条生成稳定的唯一 id = roomId + 采集点 + 奖励项摘要，
              // 保证同房不同采集点可在 DOM/前往时精确定位到各自条目。
              //
              // 🔴 2026-11-11 修复：摘要原先只含奖励项 typeId，当同一房间的两个不同采集点
              // （如 c1_area2_1 的 lt_pool_c1_area2 与 oy_pool_c1_area2）发放**同一份** reward 时，
              // 摘要完全相同 → id 碰撞 → 页面 DOM id 重复。把 collectId 纳入摘要即可区分。
              const normalizedRewardItems = normalizeHiddenRewardItems(r)
              const itemIdStr = [
                c.typeId,
                ...(r.money ? [`money_${r.money}`] : []),
                ...(r.items || []).map(g => {
                  if (g && g.rules) return g.rules.map(rule => rule.typeId).join('|')
                  return g && g.typeId ? g.typeId : ''
                })
              ].join('~')
              const hash = hashStr(itemIdStr).slice(0, 8)
              const entryId = `${lr.typeId || rm.typeId}-${hash}`

              hiddenRewards.push({
                bigMapId,
                bigMapName,
                areaId,
                areaName,
                roomId: lr.typeId || rm.typeId,
                roomTypeId: rm.typeId,
                roomName: lr.name || rm.name,
                collectId: c.typeId,
                collectName: cName,
                collectTip: cTip,
                rewardId: r.typeId,
                sortKey,
                prevImg: getPrevImg(c.typeId),
                rewardItems: normalizedRewardItems,
                // 页面「隐藏奖励」分组名：按 reward 分类区分，避免把书/偶遇都标成宝箱。
                category: Array.isArray(r.category) ? r.category : [],
                sourceLabel: Array.isArray(r.category) && r.category.includes('书籍')
                  ? '书籍'
                  : (Array.isArray(r.category) && r.category.includes('聆听偶遇') ? '偶遇' : '场景宝箱'),
                id: entryId
              })

              const locStr = `${bigMapName} - ${areaName} - ${lr.name || rm.name}`
              // 展示名按 reward 分类区分：书籍类显示「书籍」，其余检视类沿用「场景宝箱」。
              const sourceLabel = Array.isArray(r.category) && r.category.includes('书籍') ? '书籍' : '场景宝箱'
              for (const itemGrp of normalizedRewardItems) {
                // 基础货币（银币等）不作为隐藏探索点逆向来源写入，避免来源列表过度膨胀
                if (itemGrp.kind === 'fixed' && itemGrp.rules[0]?.mode === 'money') continue
                for (const rule of (itemGrp.rules || [])) {
                  const tId = rule.typeId
                  if (!tId) continue
                  if (!globalSources[tId]) globalSources[tId] = []
                  globalSources[tId].push({
                    type: 'hidden',
                    id: entryId,
                    roomId: lr.typeId || rm.typeId,
                    name: sourceLabel,
                    des: locStr,
                    bigMapId
                  })
                }
              }
            }
          }
        }
      }
    }
  }

  const parseSortKey = (sortKey) => {
    const parts = sortKey.split('_').map(n => parseInt(n, 10))
    return (parts[0] || 0) * 1000 + (parts[1] || 0)
  }

  // 同地区的同名房间聚在首个房间编号所在位置，避免 _2 和 _10 被其他房间隔开。
  const roomGroupOrder = new Map()
  for (const entry of hiddenRewards) {
    const groupKey = `${entry.bigMapId}|${entry.areaId}|${entry.roomName}`
    const ownOrder = parseSortKey(entry.sortKey)
    const currentOrder = roomGroupOrder.get(groupKey)
    if (currentOrder === undefined || ownOrder < currentOrder) roomGroupOrder.set(groupKey, ownOrder)
  }

  hiddenRewards.sort((a, b) => {
    if (a.bigMapId !== b.bigMapId) return a.bigMapId.localeCompare(b.bigMapId)
    const aGroupKey = `${a.bigMapId}|${a.areaId}|${a.roomName}`
    const bGroupKey = `${b.bigMapId}|${b.areaId}|${b.roomName}`
    const groupOrderDiff = roomGroupOrder.get(aGroupKey) - roomGroupOrder.get(bGroupKey)
    if (groupOrderDiff !== 0) return groupOrderDiff
    const roomNameDiff = a.roomName.localeCompare(b.roomName, 'zh-CN')
    if (roomNameDiff !== 0) return roomNameDiff
    return parseSortKey(a.sortKey) - parseSortKey(b.sortKey)
  })

  return { hidden: hiddenRewards, sources: globalSources }
}
