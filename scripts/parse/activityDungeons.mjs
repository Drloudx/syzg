/**
 * 活动副本（秘境爬塔玩法，如 `sp1` 亚空回廊·特异次元）预解析：
 * 生成 `public/data/parsed/activity-dungeons.json`。
 *
 * ## 判据来源（游戏源码）
 * - 开放开关：`activityList[dungeonId]`，沿用 `relics.mjs` 同一口径（未定档/占位年份 >= 2900 隐藏）。
 * - 怪物等级与缩放：`Unit.cs` (`RoomDataType.spDungonRoom`) + `UnitAttribute.InitUnitBaseAttributeData`：
 *   `level = layerConf.battleLevel`，
 *   `atkScale = (mon.levelScale || 1) * (layerConf.battleLevelScale || 1)`，
 *   `hpScale = (mon.levelScaleHp || mon.levelScale || 1) * (layerConf.battleLevelScaleHp || layerConf.battleLevelScale || 1)`。
 * - 失败宝箱结算：`Sp1DungeonPanel.cs:512`（`win ? curBoxNum : curBoxNum / 2`）。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { publicDataDir, readJson } from './shared.mjs'

const relicDungeonImgDir = join(publicDataDir, '..', 'images', 'relic-dungeons')

const text = value => String(value ?? '').trim()

const stripBraces = value => text(value).replace(/\{([^{}]+)\}/g, '$1')

const resolveRelicDungeonImg = stem => {
  const clean = text(stem)
  if (!clean) return ''
  const filePath = join(relicDungeonImgDir, `${clean}.webp`)
  return existsSync(filePath) ? `/images/relic-dungeons/${clean}.webp` : ''
}

const isDungeonOpen = activity => {
  if (!activity) return true
  if (activity.condition === 'false') return false
  if (activity.startTime && activity.startTime === activity.endTime) return false
  const year = Number(String(activity.startTime || '').slice(0, 4))
  return !(Number.isFinite(year) && year >= 2900)
}

const ROOM_POOL_META = {
  startRoomNormal: { key: 'startRoomNormal', label: '常规起点', order: 1 },
  battleRoomEasy: { key: 'battleRoomEasy', label: '简单战斗', order: 2 },
  battleRoomMid: { key: 'battleRoomMid', label: '中等战斗', order: 3 },
  battleRoomHard: { key: 'battleRoomHard', label: '困难战斗', order: 4 }
}

const resolveItemBrief = (typeId, itemRaw) => {
  const item = itemRaw[typeId]
  if (!item) return null
  return {
    id: typeId,
    name: text(item.name) || typeId,
    icon: text(item.img),
    quality: Number(item.quality) || 1,
    desc: text(item.desc)
  }
}

const resolveRewardSummary = (rewardId, rewardRaw, itemRaw, virtualIcons) => {
  const conf = rewardRaw[rewardId]
  if (!conf) return null
  const currencies = []
  if (Number(conf.ke) > 0) {
    currencies.push({ kind: 'ke', label: '氪金', num: Number(conf.ke), itemId: virtualIcons.keItemId, icon: virtualIcons.keIcon })
  }
  if (Number(conf.money) > 0) {
    currencies.push({ kind: 'money', label: '银币', num: Number(conf.money), itemId: virtualIcons.moneyItemId, icon: virtualIcons.moneyIcon })
  }
  if (Number(conf.exp) > 0) {
    currencies.push({ kind: 'exp', label: '队伍经验', num: Number(conf.exp), itemId: '', icon: '' })
  }
  if (Number(conf.heroExp) > 0) {
    currencies.push({ kind: 'heroExp', label: '伙伴经验', num: Number(conf.heroExp), itemId: '', icon: '' })
  }

  const groups = []
  for (const group of conf.items || []) {
    const rate = Number(group.rate ?? 1)
    const drawNum = Number(group.num ?? 1)
    const rules = (group.rules || []).map(rule => {
      const itemObj = itemRaw[rule.typeId]
      return {
        typeId: rule.typeId,
        mode: rule.mode || 'item',
        name: text(itemObj?.name) || rule.typeId,
        icon: text(itemObj?.img),
        quality: Number(rule.quality || itemObj?.quality || 1),
        equipLevel: Number(rule.equipLevel || itemObj?.equip?.equipLevel || 0),
        min: Number(rule.min ?? rule.num ?? 1),
        max: Number(rule.max ?? rule.min ?? rule.num ?? 1),
        chance: Number(rule.chance ?? 1)
      }
    })
    if (rules.length > 0) {
      groups.push({ rate, num: drawNum, rules })
    }
  }

  return {
    id: rewardId,
    tip: text(conf.tip),
    currencies,
    groups
  }
}

const resolveConsume = (consumeId, consumeRaw, itemRaw, virtualIcons) => {
  const conf = consumeRaw[consumeId]
  if (!conf) return null
  const costs = []
  if (Number(conf.ti) > 0) {
    costs.push({
      kind: 'ti',
      id: virtualIcons.tiItemId,
      name: virtualIcons.tiName || '理智',
      icon: virtualIcons.tiIcon,
      quality: 2,
      num: Number(conf.ti)
    })
  }
  if (Number(conf.money) > 0) {
    costs.push({
      kind: 'money',
      id: virtualIcons.moneyItemId,
      name: virtualIcons.moneyName || '银币',
      icon: virtualIcons.moneyIcon,
      quality: 1,
      num: Number(conf.money)
    })
  }
  if (Number(conf.ke) > 0) {
    costs.push({
      kind: 'ke',
      id: virtualIcons.keItemId,
      name: virtualIcons.keName || '氪金',
      icon: virtualIcons.keIcon,
      quality: 4,
      num: Number(conf.ke)
    })
  }
  for (const it of conf.items || []) {
    const item = itemRaw[it.typeId]
    costs.push({
      kind: 'item',
      id: it.typeId,
      name: text(item?.name) || it.typeId,
      icon: text(item?.img),
      quality: Number(item?.quality) || 1,
      num: Number(it.num) || 1
    })
  }
  return { id: consumeId, costs }
}

const buildRoomRounds = (roomObj, monRaw, layerScaleAtk = 1, layerScaleHp = 1) => {
  const rawRounds = roomObj?.battleData?.monRounds || []
  const rounds = []
  for (const r of rawRounds) {
    const map = new Map()
    for (const m of r.mons || []) {
      const mScaleAtk = Number(m.levelScale) || 1
      const mScaleHp = Number(m.levelScaleHp) || mScaleAtk
      const effAtk = Number((mScaleAtk * layerScaleAtk).toFixed(4))
      const effHp = Number((mScaleHp * layerScaleHp).toFixed(4))
      const key = `${m.typeId}__${effAtk}__${effHp}`
      if (!map.has(key)) {
        const monInfo = monRaw[m.typeId] || {}
        map.set(key, {
          typeId: m.typeId,
          name: text(monInfo.name) || m.typeId,
          icon: text(monInfo.icon),
          count: 0,
          monScaleAtk: mScaleAtk,
          monScaleHp: mScaleHp,
          levelScale: effAtk,
          levelScaleHp: effHp
        })
      }
      map.get(key).count += 1
    }
    if (map.size > 0) rounds.push([...map.values()])
  }
  return rounds
}

const buildExchangeList = (team, itemExchangeRaw, consumeRaw, rewardRaw, itemRaw, virtualIcons) => {
  const entries = Object.values(itemExchangeRaw)
    .filter(entry => entry && entry.team === team)
    .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0))

  return entries.map(entry => {
    const consume = resolveConsume(entry.consume, consumeRaw, itemRaw, virtualIcons)
    const reward = resolveRewardSummary(entry.reward, rewardRaw, itemRaw, virtualIcons)
    const firstRule = reward?.groups?.[0]?.rules?.[0] || null
    const targetItem = firstRule?.typeId ? resolveItemBrief(firstRule.typeId, itemRaw) : null

    const limitType = entry.limitCondition?.exchangeType || ''
    const limitNum = Number(entry.limitCondition?.num) || 0
    let limitText = '不限购'
    if (limitNum > 0) {
      if (limitType === 'day') limitText = `每日限购 ${limitNum} 次`
      else if (limitType === 'month') limitText = `每月限购 ${limitNum} 次`
      else if (limitType === 'global') limitText = `活动限购 ${limitNum} 次`
      else limitText = `限购 ${limitNum} 次`
    }

    return {
      id: entry.id,
      name: targetItem?.name || text(entry.name),
      sort: Number(entry.sort) || 0,
      limitText,
      limitNum: limitNum || null,
      limitType,
      costs: consume?.costs || [],
      rewardItem: targetItem
        ? {
            ...targetItem,
            quality: firstRule?.quality || targetItem.quality,
            num: firstRule?.min || 1
          }
        : null
    }
  })
}

const buildDungeonEvents = (eventIds, layers, eventRaw, rewardRaw, itemRaw, buffRaw, roomRaw, monRaw, virtualIcons) => {
  const rewardsNumByLayer = new Map()
  for (const layer of layers || []) {
    for (const [rewardId, limit] of Object.entries(layer.rewardsNum || {})) {
      if (!rewardsNumByLayer.has(rewardId)) rewardsNumByLayer.set(rewardId, [])
      rewardsNumByLayer.get(rewardId).push({ layer: Number(layer.layer), limit: Number(limit) })
    }
  }

  return eventIds
    .map(evId => {
      const ev = eventRaw[evId]
      if (!ev) return null

      const nodes = {}
      for (const [nodeId, node] of Object.entries(ev.nodes || {})) {
        const options = (node.options || []).map(opt => ({
          id: opt.id,
          buttonText: text(opt.buttonText),
          buttonDesc: stripBraces(opt.buttonDesc),
          outcomes: (opt.outcomes || []).map(out => {
            const mapped = {
              chance: Number(out.chance ?? 100),
              nextNodeId: out.nextNodeId || '',
              end: Boolean(out.end),
              actionType: out.actionType || ''
            }
            if (out.actionType === 'changeHpMp' && out.actionPara) {
              mapped.hpChangeRate = Number(out.actionPara.hpChangeRate) || 0
              mapped.mpChangeRate = Number(out.actionPara.mpChangeRate) || 0
            } else if (out.actionType === 'reward' && out.actionPara?.rewardId) {
              const rewardId = out.actionPara.rewardId
              mapped.reward = resolveRewardSummary(rewardId, rewardRaw, itemRaw, virtualIcons)
              const layerLimits = rewardsNumByLayer.get(rewardId) || []
              if (layerLimits.length) {
                const grouped = new Map()
                for (const item of layerLimits) {
                  if (!grouped.has(item.limit)) grouped.set(item.limit, [])
                  grouped.get(item.limit).push(item.layer)
                }
                mapped.layerLimits = [...grouped.entries()].map(([limit, ls]) => ({
                  limit,
                  minLayer: Math.min(...ls),
                  maxLayer: Math.max(...ls)
                }))
              }
            } else if (out.actionType === 'randomBuff' && Array.isArray(out.actionPara?.randomBuff)) {
              mapped.buffs = out.actionPara.randomBuff.map(entry => {
                const b = buffRaw[entry.buff] || {}
                return {
                  id: entry.buff,
                  name: text(b.buffName) || entry.buff,
                  desc: stripBraces(b.buffDes),
                  icon: text(b.buffIcon),
                  tags: Array.isArray(b.buffTags) ? b.buffTags : [],
                  roomNum: Number(entry.roomNum) || 0,
                  chance: Number(entry.chance ?? 100)
                }
              })
            } else if (out.actionType === 'battle' && out.actionPara?.battleRoom) {
              const roomId = out.actionPara.battleRoom
              const roomObj = roomRaw[roomId]
              mapped.battleRoom = {
                roomTypeId: roomId,
                name: text(roomObj?.name) || roomId,
                rounds: buildRoomRounds(roomObj, monRaw, 1, 1)
              }
            }
            return mapped
          })
        }))

        nodes[nodeId] = {
          id: nodeId,
          image: resolveRelicDungeonImg(node.image),
          text: stripBraces(node.text),
          options
        }
      }

      return {
        id: ev.id,
        title: text(ev.title) || ev.id,
        startNodeId: ev.startNodeId || 'node_1',
        coverImg: nodes[ev.startNodeId || 'node_1']?.image || Object.values(nodes).find(n => n.image)?.image || '',
        nodes
      }
    })
    .filter(Boolean)
}

export function buildActivityDungeonsFile() {
  const infoRaw = readJson('relicDungeonInfo.json')?.datas || {}
  const eventRaw = readJson('relicDungeonEvents.json')?.datas || {}
  const activityRaw = readJson('activityList.json')?.datas || {}
  const roomRaw = readJson('room.json') || {}
  const monRaw = readJson('mon.json')?.datas || readJson('mon.json') || {}
  const itemRaw = readJson('item.json')?.datas || readJson('item.json') || {}
  const itemExchangeRaw = readJson('itemExchange.json')?.itemExchange || {}
  const consumeRaw = readJson('consume.json')?.datas || {}
  const rewardRaw = readJson('reward.json')?.datas || {}
  const buffRaw = readJson('buff.json')?.datas || readJson('buff.json') || {}

  const findItemByName = name => Object.values(itemRaw).find(entry => text(entry?.name) === name)
  const keItem = findItemByName('氪金')
  const moneyItem = findItemByName('银币')
  const tiItem = findItemByName('理智') || itemRaw.item_10012

  const virtualIcons = {
    keItemId: keItem?.typeId || '',
    keName: text(keItem?.name) || '氪金',
    keIcon: text(keItem?.img),
    moneyItemId: moneyItem?.typeId || '',
    moneyName: text(moneyItem?.name) || '银币',
    moneyIcon: text(moneyItem?.img),
    tiItemId: tiItem?.typeId || 'item_10012',
    tiName: text(tiItem?.name) || '理智',
    tiIcon: text(tiItem?.img)
  }

  const dungeons = []

  for (const [dungeonId, conf] of Object.entries(infoRaw)) {
    const activity = activityRaw[dungeonId]
    if (!isDungeonOpen(activity)) continue

    const rawLayers = [...(conf.layers || [])].sort((a, b) => Number(a.layer) - Number(b.layer))
    const dungeonEventIds = new Set()

    const layers = rawLayers.map(layer => {
      const battleLevel = Number(layer.battleLevel) || 1
      const scaleAtk = Number(layer.battleLevelScale) || 1
      const scaleHp = Number(layer.battleLevelScaleHp) || scaleAtk

      const resolvePoolRoom = poolName => {
        if (!poolName) return null
        const refs = conf.rooms?.[poolName] || []
        const ref = refs[0]
        if (!ref) return null
        const roomObj = roomRaw[ref.roomTypeId]
        return {
          poolKey: poolName,
          roomTypeId: ref.roomTypeId,
          name: text(ref.name) || text(roomObj?.name) || ref.roomTypeId,
          text: stripBraces(ref.text),
          img: resolveRelicDungeonImg(ref.img),
          forceEscapeLostHpRatio: Number(ref.forceEscapeLostHpRatio) || 0,
          rounds: buildRoomRounds(roomObj, monRaw, scaleAtk, scaleHp)
        }
      }

      const randomSummary = (layer.randomRooms || []).map(rr => {
        if (rr.type === 'rooms') {
          const meta = ROOM_POOL_META[rr.rooms]
          return {
            type: 'rooms',
            poolKey: rr.rooms,
            label: meta?.label || rr.rooms,
            numMin: Number(rr.numMin) || 0,
            numMax: Number(rr.numMax) || 0
          }
        }
        const evIds = Array.isArray(rr.events) ? rr.events : []
        evIds.forEach(id => dungeonEventIds.add(id))
        const isBuffGroup = evIds.every(id => id.startsWith('buff_'))
        return {
          type: 'events',
          label: isBuffGroup ? '增益/休整事件' : '奇遇事件',
          numMin: Number(rr.numMin) || 0,
          numMax: Number(rr.numMax) || 0,
          eventIds: evIds
        }
      })

      const entryConsume = resolveConsume(layer.consume, consumeRaw, itemRaw, virtualIcons)

      return {
        layer: Number(layer.layer),
        name: text(layer.name) || `第${layer.layer}层`,
        layerImg: resolveRelicDungeonImg(layer.layerImg),
        width: Number(layer.width) || 7,
        height: Number(layer.height) || 7,
        exploreStepNum: Number(layer.exploreStepNum) || 0,
        battleLevel,
        scaleAtk: Number(scaleAtk.toFixed(2)),
        scaleHp: Number(scaleHp.toFixed(2)),
        isStoryBoss: /^bossRoomStory/i.test(layer.bossRoom || ''),
        consume: entryConsume?.costs || [],
        startRoom: resolvePoolRoom(layer.startRoom),
        bossRoom: resolvePoolRoom(layer.bossRoom),
        randomSummary,
        rewards: {
          first: resolveRewardSummary(layer.firstReward, rewardRaw, itemRaw, virtualIcons),
          clear: resolveRewardSummary(layer.reward, rewardRaw, itemRaw, virtualIcons),
          explore: resolveRewardSummary(layer.exploreReward, rewardRaw, itemRaw, virtualIcons)
        }
      }
    })

    // 随机房间池（起点普通房、简单/中等/困难战斗房）
    const roomPools = Object.values(ROOM_POOL_META)
      .sort((a, b) => a.order - b.order)
      .map(meta => {
        const refs = conf.rooms?.[meta.key] || []
        const rooms = refs.map(ref => {
          const roomObj = roomRaw[ref.roomTypeId]
          return {
            roomTypeId: ref.roomTypeId,
            name: text(ref.name) || text(roomObj?.name) || ref.roomTypeId,
            text: stripBraces(ref.text),
            img: resolveRelicDungeonImg(ref.img),
            lockAround: Boolean(ref.lockAround),
            forceTrigger: Boolean(ref.forceTrigger),
            forceEscapeLostHpRatio: Number(ref.forceEscapeLostHpRatio) || 0,
            rounds: buildRoomRounds(roomObj, monRaw, 1, 1)
          }
        })
        return {
          key: meta.key,
          label: meta.label,
          rooms
        }
      })
      .filter(pool => pool.rooms.length > 0)

    const enemyBuffs = (conf.enemyBuff || []).map(entry => {
      const b = buffRaw[entry.buffId] || {}
      return {
        id: entry.buffId,
        name: text(b.buffName) || entry.buffId,
        desc: stripBraces(b.buffDes),
        icon: text(b.buffIcon),
        rate: Number(entry.rate ?? 1)
      }
    })

    const heroBuffs = (conf.heroBuff || []).map(buffId => {
      const b = buffRaw[buffId] || {}
      return {
        id: buffId,
        name: text(b.buffName) || buffId,
        desc: stripBraces(b.buffDes),
        icon: text(b.buffIcon)
      }
    })

    const events = buildDungeonEvents(
      [...dungeonEventIds],
      rawLayers,
      eventRaw,
      rewardRaw,
      itemRaw,
      buffRaw,
      roomRaw,
      monRaw,
      virtualIcons
    )

    const shop = buildExchangeList(
      conf.exchangeTeam || '',
      itemExchangeRaw,
      consumeRaw,
      rewardRaw,
      itemRaw,
      virtualIcons
    )

    const totalFirstKe = layers.reduce((sum, l) => {
      const keCur = l.rewards.first?.currencies?.find(c => c.kind === 'ke')
      return sum + (keCur?.num || 0)
    }, 0)

    dungeons.push({
      id: dungeonId,
      name: text(conf.name) || dungeonId,
      activityName: text(activity?.name),
      timeText: text(activity?.timeText),
      startTime: text(activity?.startTime),
      endTime: text(activity?.endTime),
      bgImg: resolveRelicDungeonImg(conf.bgImg),
      pointItem: resolveItemBrief(conf.pointItemId, itemRaw),
      consumeItem: resolveItemBrief(conf.dungeonConsumeItemId, itemRaw),
      exploreFailLostRatio: Number(conf.exploreFailLostRatio ?? 0.5),
      enemyBuffs,
      heroBuffs,
      summary: {
        totalLayers: layers.length,
        totalFirstKe,
        totalEvents: events.length,
        totalShopItems: shop.length,
        totalPoolRooms: roomPools.reduce((sum, p) => sum + p.rooms.length, 0)
      },
      layers,
      roomPools,
      events,
      shop
    })
  }

  return {
    file: 'parsed/activity-dungeons.json',
    data: {
      schemaVersion: 1,
      dungeons
    }
  }
}
