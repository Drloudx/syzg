import { readJson } from './shared.mjs'

const ELEMENT_MAP = {
  1: { id: 1, name: '水', slug: 'water' },
  2: { id: 2, name: '火', slug: 'fire' },
  3: { id: 3, name: '风', slug: 'wind' },
  4: { id: 4, name: '地', slug: 'ground' }
}

export function buildTowerFile() {
  const towerRaw = readJson('tower.json')?.datas?.towerA || {}
  const battleRaw = readJson('battle.json')?.datas || {}
  const roomRaw = readJson('room.json') || {}
  const monRaw = readJson('mon.json')?.datas || readJson('mon.json') || {}
  const itemRaw = readJson('item.json')?.datas || readJson('item.json') || {}
  const itemExchangeRaw = readJson('itemExchange.json')?.itemExchange || {}
  const consumeRaw = readJson('consume.json')?.datas || {}
  const rewardRaw = readJson('reward.json')?.datas || {}

  // 1. 幻象立方兑换中心商店数据（tower1 兑换池）
  // 兑换货币以表级 `exchangeItemTypeId` 为准，不在本文件与前端各写一份 item_25002。
  const exchangeItemId = towerRaw.exchangeItemTypeId || 'item_25002'
  const allExchangeEntries = Object.values(itemExchangeRaw).filter(x => x.team === 'tower1')
  allExchangeEntries.sort((a, b) => (a.sort || 0) - (b.sort || 0))

  const shop = []
  for (const ex of allExchangeEntries) {
    const consumeObj = consumeRaw[ex.consume]
    const costCube = consumeObj?.items?.find(it => it.typeId === exchangeItemId)?.num || 0

    const rewardObj = rewardRaw[ex.reward]
    const rewRule = rewardObj?.items?.[0]?.rules?.[0]
    const targetItemId = rewRule?.typeId
    const targetItemNum = rewRule?.num || rewRule?.min || 1
    const targetItemObj = targetItemId ? itemRaw[targetItemId] : null

    let limitText = '不限购'
    if (ex.limitCondition?.num) {
      if (ex.limitCondition.exchangeType === 'global') {
        limitText = `周期限购 ${ex.limitCondition.num} 次`
      } else {
        limitText = `限购 ${ex.limitCondition.num} 次`
      }
    }

    shop.push({
      id: ex.id,
      name: targetItemObj?.name || ex.name,
      sort: ex.sort || 0,
      costCube,
      limitText,
      limitNum: ex.limitCondition?.num || null,
      rewardItem: targetItemObj ? {
        id: targetItemId,
        name: targetItemObj.name,
        icon: targetItemObj.img,
        quality: targetItemObj.quality || 1,
        num: targetItemNum,
        desc: targetItemObj.desc || ''
      } : null
    })
  }

  /**
   * 通关幻象立方数量一律读 `reward.json`（`tower1_mon` / `tower1_boss` 的 items[0].rules）。
   *
   * 🔴 分层对应关系（原表 `tower.json → layers[].onceReward / reward`），`once*` 只带 `ke`：
   *   - `onceReward`（once_mon / once_boss）→ 首通氪金，取 `ke`
   *   - `reward`（tower1_mon / tower1_boss）→ 通关幻象立方，取对应 id 规则的 min~max
   * 硬编码 50/150、5/20 会与配置表静默脱钩（策划改表后产物不变、无任何报错）。
   */
  const readCubeOf = rewardId => {
    const rules = rewardRaw[rewardId]?.items?.[0]?.rules || []
    const rule = rules.find(entry => entry.typeId === exchangeItemId)
    if (!rule) return 0
    return Number(rule.min ?? rule.max ?? 0)
  }
  const bossKe = Number(rewardRaw.once_boss?.ke || 0)
  const normalKe = Number(rewardRaw.once_mon?.ke || 0)
  const bossCube = readCubeOf('tower1_boss')
  const normalCube = readCubeOf('tower1_mon')

  /**
   * 首通氪金是 `reward.json` 的虚拟货币字段（`ke`），本身没有物品 ID。
   * 它的图标/名称在 `item.json` 里叫「氪金」，按名称反查一次，避免前端写死 item_00002。
   */
  const keItemTypeId = Object.values(itemRaw)
    .find(entry => entry?.name === '氪金')?.typeId || ''
  const tiItemTypeId = towerRaw.tiShowItemTypeId || ''
  const exchangeItemTypeId = exchangeItemId

  // 2. 80 层数据解析
  let totalKe = 0
  let totalCube = 0
  let bossCount = 0
  let totalTiCost = 0

  const layers = (towerRaw.layers || []).map(layer => {
    const monId = String(layer.showMonId || '')
    const monObj = monRaw[monId] || {}

    // 官方怪物图鉴立绘优先：PicHandBookPanel_Atlas/colect_mon_${cleanId}.webp
    // 例如 046 -> colect_mon_046.webp
    const paddedId = monId.padStart(3, '0')
    const officialArtUrl = `/images/PicHandBookPanel_Atlas/colect_mon_${paddedId}.webp`
    const modelPreviewUrl = `/images/model-previews/mon_${monId.toLowerCase()}.webp`

    // 关卡 battle 数据
    const battleId = layer.battles?.[0]?.battleId
    const battleObj = battleId ? battleRaw[battleId] : null
    const battleScale = battleObj?.battleLevelScale || 1
    const battleScaleHp = battleObj?.battleLevelScaleHp || 1

    const firstLayerRoom = battleObj?.layers?.[0]?.layerDatas?.[0]?.rooms
    const roomKeys = firstLayerRoom ? Object.keys(firstLayerRoom) : []
    const firstRoomRef = roomKeys.length > 0 ? firstLayerRoom[roomKeys[0]] : null
    const roomTypeId = firstRoomRef?.roomTypeId || ''
    const actualRoom = roomTypeId ? roomRaw[roomTypeId] : null

    // 检查是否有保护装置倒计时 countdownStart
    let countdownTime = null
    if (actualRoom?.battleData?.triggers) {
      for (const t of actualRoom.battleData.triggers) {
        for (const a of (t.actions || [])) {
          if (a.actionType === 'countdownStart' && a.actionPara?.time) {
            countdownTime = a.actionPara.time
          }
        }
      }
    }

    const timeLimit = countdownTime || battleObj?.time || 300

    // 怪物波次
    const rounds = []
    const rawRounds = actualRoom?.battleData?.monRounds || []
    for (const r of rawRounds) {
      const monMap = new Map()
      for (const m of (r.mons || [])) {
        if (!monMap.has(m.typeId)) {
          const mInfo = monRaw[m.typeId] || {}
          const monScale = (m.levelScale || 1) * battleScale
          const monScaleHp = (m.levelScaleHp || 1) * battleScaleHp
          monMap.set(m.typeId, {
            typeId: m.typeId,
            name: mInfo.name || m.typeId,
            icon: mInfo.icon || '',
            count: 0,
            levelScale: Number(monScale.toFixed(2)),
            levelScaleHp: Number(monScaleHp.toFixed(2))
          })
        }
        monMap.get(m.typeId).count++
      }
      if (monMap.size > 0) {
        rounds.push(Array.from(monMap.values()))
      }
    }

    const isBoss = layer.mode === 2
    if (isBoss) bossCount++

    const tiCost = Number(layer.tiCost) || 0
    totalTiCost += tiCost

    // 首通奖励按该层自己的 onceReward / reward 引用读取；两者都缺才退回按档位的读表结果
    const layerKe = rewardRaw[layer.onceReward]?.ke
    const layerCube = readCubeOf(layer.reward)
    const keReward = Number.isFinite(Number(layerKe)) && layerKe !== undefined
      ? Number(layerKe)
      : (isBoss ? bossKe : normalKe)
    const cubeReward = layerCube || (isBoss ? bossCube : normalCube)
    totalKe += keReward
    totalCube += cubeReward

    // 元素弱点
    const elements = (layer.showElement || []).map(el => ELEMENT_MAP[el] || { id: el, name: String(el), slug: 'neutral' })

    // 挑战目标文案与时长
    let des = layer.des || '击败所有敌人'
    if (isBoss) {
      des = layer.pointDes 
        ? `${layer.finishDes || '通关条件'}：${layer.point?.toLocaleString?.() || layer.point} (${layer.pointDes})` 
        : '首领挑战关卡'
    } else {
      if (countdownTime) {
        des = `限定时间（${countdownTime}秒）内保护装置不被破坏。`
      } else if (des.includes('限定时间') && !des.includes('秒')) {
        des = des.replace('限定时间内', `限定时间（${timeLimit}秒）内`)
      }
    }

    // 首领限制机制（一次打不完，多次累计）
    let bossRule = ''
    if (isBoss && layer.point && layer.pointLimit) {
      const minAttempts = Math.ceil(layer.point / layer.pointLimit)
      const unit = layer.pointType === 'hp' ? '点伤害' : '只魔物'
      bossRule = `单次限时 ${timeLimit} 秒，单次最多计入 ${layer.pointLimit.toLocaleString()} ${unit}。进度跨次累计，至少需挑战 ${minAttempts} 次。`
    }

    return {
      layer: layer.layer,
      name: layer.name,
      des,
      bossRule,
      timeLimit,
      isBoss,
      tiCost,
      showLevel: layer.showLevel,
      elements,
      scaleAtk: Number(battleScale.toFixed(2)),
      scaleHp: Number(battleScaleHp.toFixed(2)),
      showMon: {
        id: monId,
        name: monObj.name || layer.name,
        icon: monObj.icon,
        artUrl: officialArtUrl,
        modelUrl: modelPreviewUrl,
        scale: layer.showScale || 1
      },
      rewards: {
        ke: keReward,
        cube: cubeReward
      },
      point: layer.point || null,
      pointDes: layer.pointDes || '',
      finishDes: layer.finishDes || '',
      battleId: battleId || '',
      rounds
    }
  })

  /**
   * 单层理智消耗取众数：80 层同值（15）时即该值；将来分层不同也不会被个别层带偏。
   */
  const tiCostCounts = new Map()
  for (const layer of layers) tiCostCounts.set(layer.tiCost, (tiCostCounts.get(layer.tiCost) || 0) + 1)
  let tiCostPerLayer = 0
  let tiCostBestCount = -1
  for (const [value, count] of tiCostCounts) {
    if (count > tiCostBestCount) { tiCostPerLayer = value; tiCostBestCount = count }
  }

  return {
    file: 'tower.json',
    data: {
      summary: {
        totalLayers: layers.length,
        bossCount,
        totalKe,
        totalCube,
        /**
         * 单层理智消耗：取各层 `tiCost` 的一致值（原表 80 层同为 15）。
         * 层级不一致时取众数，前端只用于「挑战消耗 N 理智」的说明文案。
         * 🔴 不要用表级 `towerTi`（90）—— 那是整塔的累计口径，不是单层。
         */
        tiCostPerLayer,
        totalTiCost,
        /**
         * 图标/物品 ID 全部由表输出，前端不再抄 `item_25002` 之类的常量：
         *   - `tiItemTypeId` / `tiItemIcon`：挑战消耗的理智（原表 `tiShowItemTypeId`，
         *     该物品的 `img` 才是 item_10012，故单独给出图标名）
         *   - `exchangeItemTypeId` / `exchangeItemIcon`：兑换货币（幻象立方）
         *   - `keItemTypeId` / `keItemIcon`：首通氪金（reward.json 的 `ke` 是无物品 ID 的虚拟货币，
         *     对应物品据 `item.json` 的「氪金」条目解析，表缺失时留空由前端回退）
         */
        tiItemTypeId,
        tiItemIcon: itemRaw[tiItemTypeId]?.img || '',
        exchangeItemTypeId,
        exchangeItemIcon: itemRaw[exchangeItemTypeId]?.img || '',
        keItemTypeId,
        keItemIcon: itemRaw[keItemTypeId]?.img || '',
        resetTime: towerRaw.resetTime ?? null
      },
      shop,
      layers
    }
  }
}
