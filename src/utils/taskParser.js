/**
 * 任务图鉴数据解析器
 * 规则来源：txt/任务提示词_完整版.txt（已按源码核实）
 */
import { fetchWithFallback } from './request.js'
import { createCachedLoader } from './resourceClient.js'
import {
  TASK_TYPE_LABELS,
  TASK_TYPE_ORDER,
  STEP_TYPE_NAMES,
  DIFFICULTY,
  BASE_REWARD_ICONS,
  BASE_REWARD_NAMES,
  BASE_REWARD_PATHS,
  TAG_LABELS,
  resolveDialogMeta,
  getMonsterIcon,
  getMapName,
  chapterSortKey,
  subSortKey,
  parseRewardEntries
} from './gameMappings.js'

// ---------- 工具 ----------
const arr = (v) => (v && Array.isArray(v) ? v : [])
const firstNonEmpty = (list) => list.find((x) => x && x.trim())

// ---------- 主解析 ----------
let cachedTaskData = null

/**
 * 构建期纯函数：由 18 个原始 JSON 对象生成任务图鉴最终数据。
 * 不依赖网络与浏览器，Node 构建脚本（scripts/parse/*.mjs）与浏览器共用。
 */
export function buildTaskData(maps) {
  const {
    taskJson,
    levelStageJson,
    levelRoomJson,
    areaJson,
    instanceJson,
    battleJson,
    roomJson,
    rewardJson,
    itemJson,
    monJson,
    fileMonJson,
    conditionJson,
    roomCollectJson,
    roomCollectTypeJson,
    newOrderJson,
    heroJson,
    dialogIndexJson,
    dialogSegmentsJson
  } = maps

  const taskMap = taskJson.datas || {}
  const levelStageMap = levelStageJson.datas || {}
  const levelRoomMap = levelRoomJson.datas || {}
  const areaMap = areaJson.datas || {}
  const instanceMap = instanceJson.datas || {}
  const battleMap = battleJson.datas || {}
  const roomMap = roomJson.datas || roomJson || {}
  const itemMap = itemJson.datas || {}
  const monMap = monJson.datas || {}
  const officialMonsterSkeletons = new Set((fileMonJson?.monFile || [])
    .filter((entry) => !entry.hide)
    .map((entry) => {
      const monster = monMap[entry.monTypeId]
      return monster?.viewData?.skeletonName || monster?.typeId || ''
    })
    .filter(Boolean))
  const rewardMap = rewardJson.datas || {}
  const conditionMap = conditionJson.gameConditions || {}
  const collectMap = roomCollectJson.datas || {}
  const collectTypeMap = roomCollectTypeJson.datas || {}
  const heroMap = heroJson.datas || {}
  const newOrderGoods = (newOrderJson && newOrderJson.goods) || {}
  const dialogIndex = dialogIndexJson || {}
  const dialogSegments = dialogSegmentsJson || {}

  // 预构建索引
  const npcUidName = {}
  const roomMonIdType = {}
  for (const scene of Object.values(roomJson)) {
    for (const n of arr(scene && scene.battleData && scene.battleData.npcList)) {
      if (n && n.uid && !npcUidName[n.uid]) {
        const nm = firstNonEmpty([n.npcName, n.npcDes])
        if (nm) npcUidName[n.uid] = nm
      }
    }
    // hunterUid 的 uid（如 mon_s_4_6）在 monRounds.mons 里，monId -> typeId 才是怪的真实 id
    for (const round of arr(scene && scene.battleData && scene.battleData.monRounds)) {
      for (const mn of arr(round && round.mons)) {
        if (mn && mn.monId && !roomMonIdType[mn.monId]) roomMonIdType[mn.monId] = mn.typeId
      }
    }
  }

  const newOrderNpc = {}
  for (const g of Object.values(newOrderGoods)) {
    if (g && g.charaImg && g.tip) {
      newOrderNpc[g.charaImg] = String(g.tip).split(/[,，]/)[0].trim()
    }
  }

  const instBattleIndex = {}
  for (const [instId, inst] of Object.entries(instanceMap)) {
    for (const b of arr(inst && inst.battles)) {
      if (b && b.dungeonBattle) {
        instBattleIndex[b.dungeonBattle] = {
          battleName: b.name,
          instanceId: instId,
          instanceName: inst.name
        }
      }
    }
  }

  const taskNameMap = {}
  for (const [id, t] of Object.entries(taskMap)) taskNameMap[id] = t && t.name

  // ---------- 位置多表回退 ----------
  const resolveLocation = (id) => {
    if (!id) return null
    if (levelStageMap[id]) {
      const s = levelStageMap[id]
      return { type: 'stage', label: `${s.shortName} ${s.name}`.trim(), id }
    }
    if (levelRoomMap[id]) {
      const r = levelRoomMap[id]
      const area = areaMap[r.areaId]
      const mapArea = areaMap[`${r.areaId}_map`] || (area && area.chapter ? areaMap[`${area.chapter}_map`] : null)
      const parts = []
      if (mapArea && mapArea.name) parts.push(mapArea.name)
      if (area && area.name) parts.push(area.name)
      /*
       * 去掉与房间名重复的层级。
       *
       * 房间名常常**正好等于它所在的地区名**（旧日修行所、黑铁锻炉、观星高地…），
       * 拼成 `label（sub）` 后就变成「旧日修行所（秋日荒野 > 旧日修行所）」，
       * 括号里把房间名又说了一遍；`驿站内部` 这类更极端，直接是
       * 「驿站内部（驿站内部）」。实测 199 行、20 个房间名命中。
       *
       * 判据用**包含**而不是相等：房间名常带方位后缀，而地区名是它的前缀 ——
       * 「灾害研究所（外部）」所在的地区就叫「灾害研究所」，
       * 相等判断漏掉这一类（实测还剩 14 行）。反向不成立（地区名一般比房间名短），
       * 所以只判 `label 含 part`，不会误删「秋日荒野」这种真正的上级地图名。
       *
       * 过滤放在这里而不是各调用点，是为了让所有消费 `resolveLocation` 的地方
       * （步骤详情、解锁关卡、来源定位）一次性统一，不必逐个补。
       */
      const roomName = String(r.name || '')
      const deduped = parts.filter(p => p && !(roomName && roomName.includes(p)))
      return { type: 'room', label: r.name, sub: deduped.join(' > ') || undefined, id }
    }
    if (areaMap[id]) {
      return { type: 'area', label: areaMap[id].name, id }
    }
    if (instanceMap[id]) {
      return { type: 'instance', label: instanceMap[id].name, id }
    }
    if (instBattleIndex[id]) {
      const ib = instBattleIndex[id]
      return { type: 'instanceBattle', label: `${ib.instanceName} · ${ib.battleName}`, id }
    }
    if (battleMap[id]) {
      return { type: 'battle', label: battleMap[id].name, id }
    }
    // 章节代码归一化：c0/c1...C5（不带 _map）→ 该章大地图，如 c0 -> c0_map -> 求生者草原
    const lowId = String(id).toLowerCase()
    if (/^c\d+$/.test(lowId) && areaMap[`${lowId}_map`]) {
      return { type: 'area', label: areaMap[`${lowId}_map`].name, id }
    }
    if (areaMap[lowId]) {
      return { type: 'area', label: areaMap[lowId].name, id }
    }
    // 旧版遗留 id：前缀匹配区域（sldsd → 索利德山地）
    if (id.includes('_')) {
      const prefix = id.split('_')[0]
      if (areaMap[prefix] && areaMap[prefix].name) {
        return { type: 'areaLegacy', label: areaMap[prefix].name, id }
      }
    }
    return { type: 'raw', label: id, id }
  }

  // ---------- NPC 解析 ----------
  const heroNpcName = (id) => {
    if (!id) return null
    const key = id.startsWith('fav_') ? id.slice(4) : id
    return (heroMap[key] && heroMap[key].name) || null
  }

  const extractNameFromStep = (stepName, npcId) => {
    if (!stepName) return null
    const m = /(?:与|向|找|把|替|给|同)([^，。！？\s「」“”【】、]+?)(?:对话|聊聊|交谈|回报|提交|交付|谈谈|商量|商量一下|汇合|告别)/.exec(stepName)
    if (m) {
      const nm = m[1].replace(/["“”]/g, '').trim()
      if (nm && nm !== npcId) return nm
    }
    return null
  }

  const resolveNpc = (id, stepName) => {
    if (!id) return null
    if (npcUidName[id]) return { name: npcUidName[id], id }
    if (newOrderNpc[id]) return { name: newOrderNpc[id], id }
    const hn = heroNpcName(id)
    if (hn) return { name: hn, id }
    const extracted = extractNameFromStep(stepName, id)
    if (extracted) return { name: extracted, id }
    return { name: '未知', id }
  }

  // ---------- 奖励解析（统一走 gameMappings.parseRewardEntries） ----------

  // ---------- 条件解析 ----------
  const parseCondition = (condId) => {
    if (!condId) return '无'
    const c = conditionMap[condId]
    if (!c) return condId
    const desc = (c.desc || '').trim()
    if (desc) {
      // 描述里可能直接写任务 id（如“完成 m_2_6 步骤1后可接取”），把任务 id 替换成任务名
      return desc.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (tok) => {
        if (taskNameMap[tok] && tok !== condId) return `《${taskNameMap[tok]}》`
        return tok
      })
    }
    const parts = []
    for (const rule of arr(c.rules)) {
      if (rule.type === 'passTask' && rule.para && rule.para.typeId) {
        const tname = taskNameMap[rule.para.typeId] || rule.para.typeId
        const step = rule.para.step
        parts.push(step > 0 ? `完成《${tname}》第${step}步` : `完成《${tname}》`)
      } else if (rule.type === 'passStage' && rule.para && rule.para.stages) {
        const names = arr(rule.para.stages).map((s) => {
          const loc = resolveLocation(s)
          return loc ? loc.label : s
        })
        parts.push(`通关 ${names.join('、')}`)
      }
    }
    return parts.length ? parts.join('；') : condId
  }

  // ---------- 条件步骤：解锁关卡 ----------
  const parseUnlockStages = (ids) => arr(ids).map((id) => resolveLocation(id)).filter(Boolean)

  // 提取副本/战斗内置关卡剧情（包含房间内触发器与战前战后剧情）
  const getBattleDialogs = (battleId) => {
    const b = battleMap[battleId]
    if (!b) return []
    const items = []
    if (b.storyBefore) items.push({ raw: b.storyBefore, label: '战前剧情' })
    const roomDialogs = []
    for (const lay of arr(b.layers)) {
      for (const ld of arr(lay && lay.layerDatas)) {
        for (const rk of Object.keys((ld && ld.rooms) || {})) {
          const rt = ld.rooms[rk].roomTypeId
          const r = roomMap[rt]
          if (r && r.battleData && r.battleData.triggers) {
            for (const tr of arr(r.battleData.triggers)) {
              for (const act of arr(tr.actions)) {
                if (act.actionType === 'dialog' && act.actionPara && act.actionPara.dialog) {
                  roomDialogs.push({ raw: act.actionPara.dialog, roomName: r.name || rt })
                }
              }
            }
          }
        }
      }
    }
    roomDialogs.sort((a, b) => {
      const na = (/_(\d+)$/.exec(a.raw) || [])[1]
      const nb = (/_(\d+)$/.exec(b.raw) || [])[1]
      if (na !== undefined && nb !== undefined) return Number(na) - Number(nb)
      return a.raw.localeCompare(b.raw)
    })
    /*
     * 先按 dialog id **去重**，再编号。
     *
     * 房间触发器会把同一段剧情挂在多个房间/多个触发器上（实测 59 个战斗有这种重复），
     * 原先直接用去重前的 `roomDialogs.length` 当分母，于是出现
     * 「实际显示 5 条、标签却写 (1/8) 与 (7/8)」—— 分母把重复项也算进去了，
     * 玩家会以为丢了 6 条剧情（43 个步骤组命中）。
     *
     * 去重键取 dialog id：同一个 id 在不同房间出现，指的是同一段剧情。
     */
    const seenRaw = new Set()
    const uniqueRoomDialogs = roomDialogs.filter(rd => {
      if (seenRaw.has(rd.raw)) return false
      seenRaw.add(rd.raw)
      return true
    })
    for (let i = 0; i < uniqueRoomDialogs.length; i++) {
      const rd = uniqueRoomDialogs[i]
      items.push({
        raw: rd.raw,
        label: '关卡剧情',
        fallbackTitle: uniqueRoomDialogs.length > 1
          ? `${b.name || '关卡剧情'} (${i + 1}/${uniqueRoomDialogs.length})`
          : (b.name || '关卡剧情')
      })
    }
    if (b.storyAfter) items.push({ raw: b.storyAfter, label: '战后剧情' })
    return items
  }

  // ---------- 步骤解析 ----------
  const parseStep = (s, index) => {
    const p = s.stepPara || {}
    const type = s.stepType || 'unknown'
    const pos = s.stepPosition || []
    const detail = []
    let dialogs = []
    let monsters = []
    let submitItems = []

    const cleanName = (raw, fallback = '') => {
      const dName = dialogIndex[raw]
      if (dName && dName !== raw && dName !== '空') return dName.replace(/\s+/g, ' ').trim()
      return (fallback || s.stepName || '').replace(/\s+/g, ' ').trim()
    }
    const dlgMeta = (raw, fallback = '') => resolveDialogMeta(raw, cleanName(raw, fallback))
    // NPC：匹配成功只显示名字；匹配失败显示“未知（id）”
    const npcText = (npc) => (npc && (npc.name === '未知' ? `${npc.name}（${npc.id}）` : npc.name)) || null

    const push = (label, value) => {
      if (value !== null && value !== undefined && value !== '' && value !== '—') {
        detail.push({ label, value })
      }
    }

    const pushPos = () => {
      if (!pos || !pos.length) return
      if (detail.some((d) => d.label === '房间' || d.label === '关卡' || d.label === '场景')) return
      if (pos[0] === 'room') {
        const loc = resolveLocation(pos[1])
        if (loc) push('房间', loc.sub ? `${loc.label}（${loc.sub}）` : loc.label)
      } else if (pos[0] === 'stage') {
        const loc = resolveLocation(pos[1])
        if (loc) push('关卡', loc.label)
      } else if (pos[0] === 'battle') {
        const inst = instanceMap[pos[1]]
        push('副本', inst ? inst.name : pos[1])
        const ib = instBattleIndex[pos[2]]
        push('副本关卡', ib ? ib.battleName : pos[2])
      }
    }

    switch (type) {
      case 'talk': {
        const npc = resolveNpc(p.npc, s.stepName)
        push('NPC', npcText(npc))
        pushPos()
        push('交互对话', p.title)
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'npcTalkBattle': {
        const hn = heroNpcName(p.npc)
        const npc = hn ? { name: hn, id: p.npc } : resolveNpc(p.npc, s.stepName)
        push('NPC', npcText(npc))
        pushPos()
        push('交互对话', p.title)
        const b = battleMap[p.battleId]
        if (b) {
          push('事件', b.name)
          const layerNames = []
          for (const lay of arr(b.layers)) {
            for (const ld of arr(lay && lay.layerDatas)) {
              if (ld && ld.name && ld.name !== b.name && !layerNames.includes(ld.name)) {
                layerNames.push(ld.name)
              }
            }
          }
          if (layerNames.length) push('事件关卡', layerNames.join(' / '))

          const roomNames = []
          for (const lay of arr(b.layers)) {
            for (const ld of arr(lay && lay.layerDatas)) {
              const rks = Object.keys((ld && ld.rooms) || {}).sort((ra, rb) => {
                const na = (/_(\d+)$/.exec(ra) || [])[1]
                const nb = (/_(\d+)$/.exec(rb) || [])[1]
                if (na !== undefined && nb !== undefined) return Number(na) - Number(nb)
                return ra.localeCompare(rb)
              })
              for (const rk of rks) {
                const r = ld.rooms[rk]
                if (r && r.name && roomNames[roomNames.length - 1] !== r.name) {
                  roomNames.push(r.name)
                }
              }
            }
          }
          if (roomNames.length) push('事件场景', roomNames.join(' ➔ '))
        } else if (p.battleId) {
          push('事件', p.battleId)
        }
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'passInstance': {
        const pos0 = pos[0]
        if (pos0 === 'battle') {
          const inst = instanceMap[pos[1]]
          push('副本', inst ? inst.name : pos[1])
          const ib = instBattleIndex[pos[2]]
          push('副本关卡', ib ? ib.battleName : pos[2])
        } else if (pos0 === 'stage') {
          const loc = resolveLocation(pos[1])
          push('关卡', loc ? loc.label : pos[1])
          if (pos[2] && DIFFICULTY[pos[2]]) push('难度', DIFFICULTY[pos[2]])
        } else if (pos0 === 'room') {
          const inst = instanceMap[p.instanceId]
          push('副本', inst ? inst.name : p.instanceId || null)
          const b = battleMap[p.battleId]
          push('事件关卡', b ? b.name : p.battleId || null)
          const loc = resolveLocation(pos[1])
          if (loc) push('房间', loc.sub ? `${loc.label}（${loc.sub}）` : loc.label)
        }
        if (!detail.length) {
          const inst = instanceMap[p.instanceId]
          push('副本', inst ? inst.name : p.instanceId || null)
          const b = battleMap[p.battleId]
          push('事件关卡', b ? b.name : p.battleId || null)
        }
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'passStage': {
        // 特殊：只显示名称、类型、剧情与描述，不显示关卡/位置/解锁
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'hunter': {
        const monIds = p.monTypeIds || (p.monTypeId ? [p.monTypeId] : [])
        monsters = monIds.map((id) => {
          const mm = monMap[id]
          return {
            id,
            name: (mm && mm.name) || id,
            icon: mm ? getMonsterIcon(mm.icon, mm.viewData && mm.viewData.skinName) : '',
            hasMonsterDetail: !!mm && officialMonsterSkeletons.has(mm.viewData?.skeletonName || mm.typeId)
          }
        })
        if (p.num) push('数量', `${p.num} 只`)
        pushPos()
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'hunterUid': {
        // uid 可能是怪 id 直查，也可能是房间 npc uid（mon_s_4_6 这种），经 room.json monRounds 反查真实 typeId
        const typeId = monMap[p.uid] ? p.uid : (roomMonIdType[p.uid] || p.uid)
        const mm = monMap[typeId]
        if (mm) {
          monsters = [{
            id: typeId,
            uid: p.uid,
            name: mm.name || p.uid,
            icon: getMonsterIcon(mm.icon, mm.viewData && mm.viewData.skinName),
            hasMonsterDetail: officialMonsterSkeletons.has(mm.viewData?.skeletonName || mm.typeId)
          }]
          if (mm.monDes) push('说明', mm.monDes)
        } else if (p.uid) {
          // 极少数遗留 uid（如 main_002_jiazhu）查不到，从步骤名里提取怪名兜底
          const nameMatch = /(?:击败|狩猎|讨伐|解决|消灭|干掉)(.+)/.exec(s.stepName || '')
          monsters = [{ id: p.uid, name: (nameMatch && nameMatch[1].trim()) || p.uid, icon: '', hasMonsterDetail: false }]
        }
        pushPos()
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'getItemNpc': {
        const rawItems = p.items && p.items.length
          ? p.items
          : (p.itemTypeId ? [{ itemTypeId: p.itemTypeId, num: p.num }] : [])
        submitItems = rawItems.map((i) => {
          const it = itemMap[i.itemTypeId]
          return {
            typeId: i.itemTypeId,
            name: (it && it.name) || i.itemTypeId,
            count: i.num,
            icon: `/Common_ItemIcon/${(it && it.img) || i.itemTypeId}.webp`
          }
        })
        if (p.removeItem) push('说明', '提交后扣除道具')
        const npc = resolveNpc(p.npc, s.stepName)
        push('NPC', npcText(npc))
        pushPos()
        push('交互对话', p.title)
        if (p.dialog0) dialogs.push({ label: '不满足条件', meta: resolveDialogMeta(p.dialog0) })
        if (p.dialog1) dialogs.push({ label: '满足条件', meta: resolveDialogMeta(p.dialog1) })
        break
      }
      case 'getItem': {
        const item = itemMap[p.itemTypeId]
        if (p.itemTypeId) {
          submitItems = [{
            typeId: p.itemTypeId,
            name: (item && item.name) || p.itemTypeId,
            count: p.num,
            icon: `/Common_ItemIcon/${(item && item.img) || p.itemTypeId}.webp`
          }]
        }
        pushPos()
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'collect': {
        // roomCollect.json 的 name 多为策划备注（如“主线main_0_02，绿榛菇采集”），
        // 干净名称在 roomCollectType.json（collectTypeId -> name），优先用它并去重
        const names = []
        for (const id of arr(p.collectIds)) {
          const c = collectMap[id]
          if (!c) { names.push(id); continue }
          const ct = c.collectTypeId ? collectTypeMap[c.collectTypeId] : null
          if (ct && ct.name) { names.push(ct.name); continue }
          // 无类型名时，仅当 roomCollect.name 不含备注特征（逗号/任务id）才使用
          const rawName = c.name || ''
          if (rawName && !/[,，]/.test(rawName) && !/[A-Za-z_]\w*\d/.test(rawName)) names.push(rawName)
          else names.push(id)
        }
        const uniqueNames = [...new Set(names)]
        push('采集点', uniqueNames.length ? uniqueNames.join('、') : null)
        if (p.num) push('数量', `${p.num} 次`)
        pushPos()
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'gotoStage': {
        const loc = resolveLocation(p.stageId)
        if (loc) {
          push('场景', loc.sub ? `${loc.label}（${loc.sub}）` : loc.label)
        } else if (p.stageId) {
          push('场景', p.stageId)
        }
        pushPos()
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'gotoCamp': {
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      case 'tag': {
        push('目标', TAG_LABELS[p.tag] ? TAG_LABELS[p.tag] : p.tag)
        break
      }
      case 'openAreaShow': {
        // areaTypeId 可能是区域、副本（dungeonaseyj 等）或关卡，走多表回退
        const areaLoc = resolveLocation(p.areaTypeId)
        push('解锁区域', areaLoc ? areaLoc.label : p.areaTypeId || null)
        const fatherLoc = resolveLocation(p.fatherAreaTypeId)
        if (fatherLoc) push('所属大地图', fatherLoc.label)
        break
      }
      case 'level': {
        push('目标', p.level ? `达到 Lv.${p.level}` : null)
        break
      }
      case 'sellPet': {
        push('目标', p.num ? `在培育室卖出 ${p.num} 只魔物` : null)
        if (p.dialog) dialogs.push({ label: '剧情', meta: dlgMeta(p.dialog) })
        break
      }
      default: {
        push('stepType', type)
        push('原始数据', JSON.stringify(p))
      }
    }

    if (p.battleId) {
      const bDlgs = getBattleDialogs(p.battleId)
      for (const bd of bDlgs) {
        if (bd.raw !== p.dialog && !dialogs.some((d) => d.meta && d.meta.raw === bd.raw)) {
          dialogs.push({ label: bd.label, meta: dlgMeta(bd.raw, bd.fallbackTitle) })
        }
      }
    }

    const suppressUnlock = type === 'passStage'
    return {
      index,
      name: s.stepName || '',
      des: s.stepDes || '',
      type,
      typeName: STEP_TYPE_NAMES[type] || '未知步骤类型',
      reward: parseRewardEntries(rewardMap, itemMap, s.stepReward),
      unlockStages: suppressUnlock ? [] : parseUnlockStages(s.stepUnlockStage),
      unlockSuppressed: suppressUnlock && arr(s.stepUnlockStage).length > 0,
      detail,
      dialogs,
      monsters,
      submitItems,
      position: pos
    }
  }

  // ---------- 任务解析 ----------
  const rawTasks = []
  for (const [typeId, t] of Object.entries(taskMap)) {
    const cat = arr(t.category)
    const isDemo = cat.includes('demo') || cat.includes('demo支线') || typeId.startsWith('demo_')
    const isPartnerArchive = cat.length === 1 && cat[0] === '伙伴档案'
    if (isDemo || isPartnerArchive) continue

    const type = t.taskType
    const typeLabel = TASK_TYPE_LABELS[type] || `类型${type}`
    const subRaw = cat[1] || ''
    const subLabel = type === 3 && subRaw ? formatEntrustLabel(subRaw, areaMap) : subRaw || '其他'

    const getTask = t.getTask || {}
    const getTaskDialog = getTask.dialog ? resolveDialogMeta(getTask.dialog, (dialogIndex[getTask.dialog] || '').replace(/\s+/g, ' ').trim()) : null
    const parsedSteps = arr(t.steps).map((s, i) => parseStep(s, i + 1))

    let startLocation = null
    const firstStep = parsedSteps[0]
    if (firstStep && firstStep.detail) {
      const roomRow = firstStep.detail.find((d) => d.label === '房间')
      const stageRow = firstStep.detail.find((d) => d.label === '关卡' || d.label === '场景')
      const battleRow = firstStep.detail.find((d) => d.label === '副本' || d.label === '副本关卡')
      if (roomRow) startLocation = roomRow.value
      else if (stageRow) startLocation = stageRow.value
      else if (battleRow) startLocation = battleRow.value
    }

    let startNpc = null
    if (!getTask.npc && firstStep && firstStep.detail) {
      const npcRow = firstStep.detail.find((d) => d.label === 'NPC')
      if (npcRow && npcRow.value && npcRow.value !== '未知') {
        startNpc = { name: npcRow.value, id: t.steps?.[0]?.stepPara?.npc || '' }
      }
    }

    rawTasks.push({
      id: typeId,
      name: t.name || typeId,
      des: t.des || '',
      des2: t.des2 || '',
      type,
      typeLabel,
      typeOrder: TASK_TYPE_ORDER[type] !== undefined ? TASK_TYPE_ORDER[type] : 9,
      subRaw,
      subLabel,
      subKey: type === 3 ? subRaw : (subRaw || '其他'),
      close: !!t.close,
      reward: parseRewardEntries(rewardMap, itemMap, t.reward),
      startLocation,
      startNpc,
      getTask: {
        npc: getTask.npc ? resolveNpc(getTask.npc) : null,
        title: getTask.title || '',
        dialog: getTaskDialog,
        condition: parseCondition(getTask.condition)
      },
      addTasks: arr(t.addTask)
        .map((id) => ({ id, name: taskNameMap[id] || id, close: !!taskMap[id]?.close }))
        .filter((task) => task.id && !task.close),
      unlockTasks: arr(t.unlockTask).map((id) => ({ id, name: taskNameMap[id] || id })).filter(Boolean),
      unlockStages: parseUnlockStages(t.unlockStage),
      steps: parsedSteps
      /*
       * 这里曾经有 `raw: t` —— 把**整条 task.json 配置**原样塞进产物。
       *
       * 2026-10-06 查清它没有任何消费方（`src/` 里 `.raw` 的命中全是剧情 meta 的
       * `{raw, isText, name}`，不是任务字段；解构/模板/`searchData`/`scripts` 都不读它），
       * 而它占了 `tasks.json` 的 **33.7%（549 KB / 1629 KB）**。
       * 其它产物（heroes / pets / items）也都没有这个字段，说明它不是项目约定，是历史遗留。
       * 注释掉后重新构建：1629 → 1078 KB，单测全绿。
       * 构建期若需回查配置，`t` 在当前作用域内仍然可用，不必写进产物。
       */
    })
  }

  /*
   * 同一分类内按任务 ID 排序，**必须用数字感知比较**。
   *
   * 原先直接 `a.id.localeCompare(b.id)` 是字典序，于是 `m_1_10` 排在 `m_1_2` 前面
   * （逐字符比较时 `'1'` 与 `'2'` 先分出胜负，`0` 根本没参与），
   * 表现为第一章列表里「共鸣 / 家园 / 往日的阴影」跑到「深渊」前面。
   *
   * 已用 `addTask` 链条核对过真实顺序：
   *   m_1_1 → m_1_2 → m_1_4 → m_1_4_1 → … → m_1_9 → m_1_10 → m_1_11 → m_1_12
   * 与数字序完全一致，所以这不是"猜一个好看顺序"，是回到配置本身的推进次序。
   *
   * `numeric: true` 同时处理好 `m_1_4` / `m_1_4_1`（前缀短的在前）这类派生任务。
   */
  rawTasks.sort((a, b) =>
    a.typeOrder - b.typeOrder
    || subSortKey(a.type, a.subKey) - subSortKey(b.type, b.subKey)
    || String(a.id).localeCompare(String(b.id), 'en', { numeric: true })
  )

  // 二级分类选项（数据驱动）
  const subOptions = {}
  for (const t of rawTasks) {
    if (!subOptions[t.type]) subOptions[t.type] = []
    const existing = subOptions[t.type].find((x) => x.key === t.subKey)
    if (!existing) {
      subOptions[t.type].push({ key: t.subKey, label: t.subLabel })
    }
  }
  for (const type of Object.keys(subOptions)) {
    subOptions[type].sort((a, b) => subSortKey(Number(type), a.key) - subSortKey(Number(type), b.key))
  }

  const stats = {
    total: rawTasks.length,
    closed: rawTasks.filter((t) => t.close).length,
    byType: {}
  }
  for (const t of rawTasks) {
    stats.byType[t.type] = (stats.byType[t.type] || 0) + 1
  }

  return { tasks: rawTasks, subOptions, stats, TYPE_LABELS: TASK_TYPE_LABELS }
}

/**
 * 任务图鉴数据加载：读取构建期预解析的 parsed/tasks.json。
 */
export const loadTaskData = createCachedLoader(async () => {
  if (cachedTaskData) return cachedTaskData

  const parsed = await fetchWithFallback('data/parsed/tasks.json')
  cachedTaskData = parsed
  return parsed
})

/**
 * 剧情正文里的舞台标记。与 `gameMappings` 清洗对白用的是同一类标记
 * （`[show]` / `[l]` / `[cm]` / `[hide]`），搜索索引里没有保留价值。
 */
const DIALOG_MARKUP_RE = /\[[a-z]+\]/gi
const DIALOG_BRACKET_RE = /\[[^\]]*\]/g

/** 把一条剧本文本行清成可直接搜索+高亮的纯文本。 */
export const cleanDialogSearchLine = (value) => String(value ?? '')
  .replace(DIALOG_MARKUP_RE, '')
  .replace(DIALOG_BRACKET_RE, '')
  .replace(/\r/g, '')
  .trim()

/**
 * 构建期纯函数：生成**任务图鉴剧情搜索索引** `parsed/dialog-search.json`。
 *
 * ## 为什么单独一份产物，而不是并进 `search-index.json`
 *
 * 全量剧情正文约 **111 万字符 / brotli 596 KB**，而 `search-index.json` 是
 * **首屏就要下载**的（`INLINE_HASH_DIRECTORIES` 里的 `data/parsed/`）。并进去等于
 * 让每个冷启动用户为「可能用不到的剧情搜索」多付 0.6 MB，直接违反 SPEC 的首屏约束。
 * 因此拆成独立产物，**只在任务页真正开始搜索时才拉取**（懒加载、按会话缓存）。
 *
 * ## 为什么存「每任务一段全文」而不是倒排索引
 *
 * 实测过 2-gram 倒排：**brotli 680 KB，比直接存正文还大** ——
 * 111 万字的两字组合有 10 万个，索引本身的开销超过了原文。
 * 行去重（全局字典 + 引用）同样是负收益（607 KB > 596 KB，台词只有 14% 重复）。
 * 所以**直接存全文就是最优解**，浏览器的 `String.includes` 足够快。
 *
 * @param {object} tasksData `buildTaskData()` 的返回值
 * @param {Map<string, object>} dialogScripts dialogId -> 剧本对象（已裁剪/已回退「旧」变体）
 * @returns {{generatedAt: string, tasks: Object<string, string>, meta: object}}
 */
export function buildDialogSearchIndex(tasksData, dialogScripts) {
  const scripts = dialogScripts instanceof Map ? dialogScripts : new Map(Object.entries(dialogScripts || {}))
  const out = {}
  let charCount = 0
  let dialogCount = 0

  for (const task of arr(tasksData?.tasks)) {
    const lines = []
    const seenInTask = new Set()
    for (const step of arr(task.steps)) {
      for (const d of arr(step.dialogs)) {
        const raw = d?.meta?.raw
        // `isText` 的条目是配置里直接写的文本目标（「收集 3 株药浆草。」），不是剧本文件
        if (!raw || d.meta.isText) continue
        const script = scripts.get(raw)
        if (!script) continue
        dialogCount++
        for (const e of arr(script.exps)) {
          if (e.key === 'text' && e.para?.text) {
            const t = cleanDialogSearchLine(e.para.text)
            if (t && !seenInTask.has(t)) { seenInTask.add(t); lines.push(t) }
          } else if (e.key === 'option' && Array.isArray(e.para?.options)) {
            for (const o of e.para.options) {
              const t = cleanDialogSearchLine(o?.text)
              if (t && !seenInTask.has(t)) { seenInTask.add(t); lines.push(t) }
            }
          }
        }
      }
    }
    if (lines.length) {
      const text = lines.join('\n')
      out[task.id] = text
      charCount += text.length
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tasks: out,
    meta: {
      taskCount: Object.keys(out).length,
      dialogCount,
      charCount,
      // 供 UI 提示与排查：这是「每任务一段全文」，检索用子串匹配即可
      form: 'per-task-fulltext'
    }
  }
}

function formatEntrustLabel(cKey, areaMap) {
  // 委托分类 C0~C5 -> 统一使用全局地图映射，页面不再各自读取/维护名称。
  return getMapName(cKey)
}
