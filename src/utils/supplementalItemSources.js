import { isBlacklisted } from '../config/blacklist.js'
import { getMapName } from './gameMappings.js'
import { parseRewardGroups, getObtainableRewardRules } from './acquisitionRules.js'

const table = value => value?.datas || value || {}
const internal = value => /测试|废稿|[（(]废弃[）)]|弃用|停用|暂不使用|未使用|备份|待修改|(?:^|[_\s])(?:test|demo|bak|beifen)(?:[_\s\d]|$)/i.test(String(value || ''))
const usable = (entry, id = '') => entry && entry.hide !== true && !internal(id) &&
  !internal([entry.name, entry.des, entry.desc, ...(entry.category || [])].join(' '))

export { internal as isInternalSource, usable as isUsableSourceEntry }

// 这里只反查实际物品身份，不展开装备随机池，也不计算另一套奖励概率。
export function getSourceRewardItemIds(reward, items) {
  if (!reward || internal([reward.tip, ...(reward.category || [])].join(' '))) return []
  return [...new Set(getObtainableRewardRules(parseRewardGroups(reward, { items }))
    .map(rule => rule.typeId).filter(id => items[id]))]
}

export function buildSupplementalItemSources(maps) {
  const items = table(maps.itemJson)
  const rewards = table(maps.rewardJson)
  const sources = {}
  const seen = new Map()
  const rewardIds = new Map()
  /** 装备判据：`category` 含 `4`（与 `isEquipTierHidden` 同一口径，不看品质）。 */
  const isEquipment = item => (item?.category || item?.categories || []).map(String).includes('4')
  const addReward = (rewardId, source) => {
    if (!rewardIds.has(rewardId)) rewardIds.set(rewardId, getSourceRewardItemIds(rewards[rewardId], items))
    for (const itemId of rewardIds.get(rewardId)) {
      if (!usable(items[itemId], itemId) || isBlacklisted(items[itemId])) continue
      // `equipmentOnly` 的来源只写给装备（如关卡首通：对材料是噪音，对装备是核心信息）
      if (source.equipmentOnly && !isEquipment(items[itemId])) continue
      const { equipmentOnly, ...clean } = source
      const key = JSON.stringify(clean)
      if (!seen.has(itemId)) seen.set(itemId, new Set())
      if (seen.get(itemId).has(key)) continue
      seen.get(itemId).add(key)
      ;(sources[itemId] ||= []).push(clean)
    }
  }

  const eventLocations = new Map()
  for (const [mapId, groups] of Object.entries(maps.randomEventAreaJson?.data || {})) {
    for (const group of groups) for (const event of group.events || []) {
      if (Number(event.chance ?? 1) <= 0) continue
      if (!eventLocations.has(event.typeId)) eventLocations.set(event.typeId, new Set())
      eventLocations.get(event.typeId).add(getMapName(mapId))
    }
  }
  for (const [id, event] of Object.entries(table(maps.randomEventInfoJson))) {
    if (!usable(event, id) || !eventLocations.has(id)) continue
    addReward(event.reward, { type: 'event', id, name: event.name, des: `随机事件奖励 · ${[...eventLocations.get(id)].join('、')}` })
  }
  for (const [id, explore] of Object.entries(table(maps.exploreAreaJson))) {
    if (!usable(explore, id) || !explore.name || !/^explore\d+_/.test(id)) continue
    const mapName = getMapName(`c${/^explore(\d+)_/.exec(id)[1]}`)
    addReward(explore.reward, { type: 'explore', id, name: explore.name, des: `探索奖励 · ${mapName}` })
  }

  const research = table(maps.campResearchJson)
  const addCollectRewards = (conf, source) => {
    addReward(conf.reward, source)
    const researchId = conf.research?.id
    const study = research[researchId]
    if (!usable(study, researchId)) return
    for (const upgrade of conf.research?.levelReward || []) {
      if (!(study.level || []).some(level => level.level === upgrade.level)) continue
      // 同一种物品的基础来源已足够；只有研究额外产出的物品才添加条件来源。
      const baseIds = new Set(getSourceRewardItemIds(rewards[conf.reward], items))
      const extraReward = rewards[upgrade.reward]
      const extraIds = getSourceRewardItemIds(extraReward, items).filter(id => !baseIds.has(id))
      if (!extraIds.length) continue
      const conditional = { ...source, research: researchId, researchLevel: upgrade.level,
        des: `${source.des} · 需${study.name} ${upgrade.level}级` }
      for (const itemId of extraIds) {
        if (usable(items[itemId], itemId) && !isBlacklisted(items[itemId]) &&
          !(sources[itemId] || []).some(existing => JSON.stringify(existing) === JSON.stringify(conditional))) {
          (sources[itemId] ||= []).push(conditional)
        }
      }
    }
  }

  const collectTypes = table(maps.roomCollectTypeJson)
  const collects = table(maps.roomCollectJson)
  const monsters = table(maps.monJson)
  for (const entry of maps.fileMonJson?.monFile || []) {
    const id = entry.monTypeId
    const monster = monsters[id]
    if (!usable(entry, id) || !usable(monster, id)) continue
    addReward(entry.reward, { type: 'monster', id, name: entry.name || monster.name || monster.monDes,
      des: '怪物图鉴战利品' })
  }
  // fileGather 是游戏正式采集图鉴入口，gatherTypeId 指向 roomCollect 而非直接指向类型。
  for (const entry of maps.fileGatherJson?.gatherFile || []) {
    const id = entry.gatherTypeId
    const collect = collects[id]
    const conf = collectTypes[collect?.collectTypeId]
    if (!usable(entry, id) || !usable(conf, collect?.collectTypeId)) continue
    addCollectRewards(conf, { type: 'collect', id, name: conf.name,
      des: `采集 · ${(entry.place || []).join('、') || '野外'}` })
  }

  // 正式地图房间的额外采集点（不遍历孤立/测试房间）。
  const rooms = table(maps.roomJson)
  const areas = table(maps.areaJson)
  for (const [id, room] of Object.entries(table(maps.levelRoomJson))) {
    const area = areas[room.areaId]
    if (!/^c\d+_area/.test(room.areaId || '') || !usable(room, id) || !usable(area, room.areaId)) continue
    const physicalRoom = rooms[room.roomTypeId]
    const collectIds = new Set((physicalRoom?.battleData?.spObj || []).map(obj => obj.caijiTypeId).filter(Boolean))
    for (const collectId of collectIds) {
      const conf = collectTypes[collects[collectId]?.collectTypeId]
      if (!usable(conf, collectId) || !(Number(conf.collectType) >= 1 && Number(conf.collectType) <= 3)) continue
      addCollectRewards(conf, { type: 'collect', id: `${id}:${collectId}`, name: conf.name,
        des: `采集 · ${[...new Set([getMapName(room.areaId.split('_')[0]), area.name, room.name].filter(Boolean))].join(' · ')}` })
    }
  }

  const plants = maps.plantJson?.plant || {}
  for (const [seedId, pool] of Object.entries(maps.plantJson?.seed || {})) {
    const seed = items[seedId]
    if (!usable(seed, seedId)) continue
    for (const candidate of pool) {
      const plant = plants[candidate.type]
      if (Number(candidate.chance ?? 1) <= 0 || !usable(plant, candidate.type)) continue
      addCollectRewards(plant, { type: 'plant', id: candidate.type, seedId, name: plant.name,
        des: `营地种植 · ${seed.name}` })
    }
  }

  for (const [building, conf] of Object.entries(table(maps.homeLevelJson))) {
    if (!usable(conf, building)) continue
    for (const [levelKey, level] of Object.entries(conf.level || {})) {
      const fromLevel = Number(levelKey)
      // 升级消费/奖励属于升级前档位；末档没有下一等级，不能作为可领取升级奖励。
      if (!conf.level[fromLevel + 1]) continue
      addReward(level.reward, { type: 'camp', id: `${building}:${fromLevel}`, building,
        level: fromLevel, targetLevel: fromLevel + 1, name: conf.name,
        des: `${fromLevel} → ${fromLevel + 1} 级升级奖励` })
    }
  }

  // 章节表的 hide 是解锁前地图显示状态，不代表测试/废弃关卡。
  const battles = table(maps.battleJson)
  for (const stage of Object.values(table(maps.levelStageJson))) {
    if (!stage.name || internal(stage.name) || !/^c\d+_/.test(stage.typeId || '')) continue
    /*
     * 关卡掉落的归并口径：**同一关卡三个难度合成一条**，名字只写 `x-x 关卡名`。
     *
     * 🔴 不带难度、不带房间：三难度的 `battle1/2/3` 是同一关卡的简单/普通/困难，
     * 逐个列出会让一件常见素材堆出十几条几乎相同的来源（副本掉落就是这么膨胀的）。
     * `id` 用 `stageId`（如 `c0_2`），跳转时按关卡定位，与 `/chapters?stage=` 契约一致。
     *
     * 取「首次出现的那场战斗」的 reward 作代表：三难度的普通掉落表是同一套配置，
     * `addReward` 内部按 rewardId 缓存物品集合、并按 source 去重，不会重复堆叠。
     *
     * ⚠️ `firstReward`（首通）**只对装备保留**：它对材料意义不大（首通是一次性、
     * 且「氪金」这类通用货币会在每个关卡各列一条，实测 152 条），
     * 但装备的"首次通关送什么"是图鉴的核心信息（如新手引导的「角布林的矛」）。
     */
    const firstUsable = [1, 2, 3]
      .map(difficulty => ({ difficulty, id: stage[`battle${difficulty}`] }))
      .find(({ id }) => usable(battles[id], id))
    if (firstUsable) {
      const battle = battles[firstUsable.id]
      const stageName = `${stage.shortName} ${stage.name}`
      addReward(battle.reward, {
        type: 'stage',
        id: stage.typeId,
        name: stageName,
        des: '关卡掉落'
      })
      addReward(battle.firstReward, {
        type: 'stage',
        id: stage.typeId,
        name: stageName,
        des: '关卡首通奖励',
        equipmentOnly: true
      })
    }
  }
  for (const field of ['initBattleId', 'initBattleId2']) {
    const id = maps.playerInitJson?.[field]
    const battle = battles[id]
    if (!usable(battle, id)) continue
    addReward(battle.reward, { type: 'guide', id, name: battle.name, des: '新手引导战斗奖励' })
    addReward(battle.firstReward, { type: 'guide', id, name: battle.name, des: '新手引导首次通关奖励' })
  }

  // 活动入口本身是来源证据；不从 reward 表名称猜测活动，也不扫描展示/预览奖励。
  for (const [id, activity] of Object.entries(table(maps.activityListJson))) {
    if (!usable(activity, id) || activity.condition === 'false') continue
    if (activity.startTime && activity.startTime === activity.endTime) continue
    const kind = activity.activityType
    if (!['7dayCheck', '3dayCheck', 'activityCheckIn', 'battleRewardList', 'gachaHero'].includes(kind)) continue
    const isSignIn = ['7dayCheck', '3dayCheck', 'activityCheckIn'].includes(kind)
    for (const [index, entry] of (activity.para?.achives || []).entries()) {
      const des = isSignIn ? `第 ${index + 1} 天签到奖励`
        : kind === 'gachaHero' ? `累计招募 ${entry.num} 次奖励` : `${entry.text1 || '通关挑战'}奖励`
      addReward(entry.reward, { type: isSignIn ? 'signIn' : 'activity', id: `${id}:${index + 1}`, name: activity.name, des })
    }
  }
  for (const [id, entry] of Object.entries(maps.activityDailyJson?.activityReward || {})) {
    addReward(entry.reward, { type: 'activity', id: `daily:rank:${id}`, name: '每日活跃', des: `活跃度达到 ${entry.activityRank}` })
  }
  for (const [id, entry] of Object.entries(maps.activityDailyJson?.tasks || {})) {
    addReward(entry.reward, { type: 'activity', id: `daily:task:${id}`, name: '每日活跃', des: entry.taskDesc })
  }

  return sources
}
