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
  parseRewardEntries,
  cleanDialogueLine
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
    eventRecordJson,
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

  /*
   * 贸易小车 NPC 名：`newOrder.goods[].tip` 的格式是「**名字**，货品1，货品2…」
   * （个别条目前面还带等级，如「lv1，比绍，木板+石砖」）。
   *
   * 🔴 取 `split(',')[0]` 会拿到 `lv1` —— 那不是名字。判据是**跳过等级段**：
   * 形如 `lv数字` / 纯数字的段不是名字，取其后第一个非货品段。
   * 名字里可能带引号（如 `“双刃”费萨`），保留原样。
   */
  const newOrderNpc = {}
  for (const g of Object.values(newOrderGoods)) {
    if (!g || !g.charaImg || !g.tip) continue
    const segments = String(g.tip).split(/[,，]/).map(s => s.trim()).filter(Boolean)
    const name = segments.find(s => !/^lv\s*\d+$/i.test(s) && !/^\d+$/.test(s))
    if (name) newOrderNpc[g.charaImg] = name
  }

  /*
   * `tag` 步骤的官方描述：`eventRecord.eventRecords[tag].desc`
   * （如 `rolelv5` → 「任意角色升到5级」）。官方 `desc` 存在时优先于手写的 `TAG_LABELS`。
   */
  const eventRecordDesc = {}
  for (const [tag, rec] of Object.entries((eventRecordJson?.datas || eventRecordJson || {}).eventRecords || {})) {
    const desc = (rec && rec.desc) || ''
    if (tag && desc) eventRecordDesc[tag] = desc
  }

  /*
   * 已收录的剧情 id 集合 —— 用来在构建期标出「原表引用了但剧情未收录」的条目。
   *
   * 由调用方传入（Node 构建脚本读 `public/data/taskDialogs/` 目录名）。
   * 为空（浏览器端或未维护该目录的环境）时**不做缺失判断**，条目按正常处理 ——
   * 宁可显示展开按钮也不要误报缺失。
   */
  const dialogIds = maps.dialogIds instanceof Set && maps.dialogIds.size ? maps.dialogIds : null

  /**
   * 给剧情元数据打「未收录」标记。
   *
   * 原表引用了但 `public/data/taskDialogs/` 里没有对应文件时置 `missing: true`
   * （实测 25 个，如 `wt_c5_01_1`、`fav_hero_046_2_0`）。
   * `dialogIds` 为空时不做判断 —— 宁可显示展开按钮也不要误报缺失。
   */
  const markDialogMissing = meta => {
    if (meta && !meta.isText && dialogIds && !dialogIds.has(meta.raw)) meta.missing = true
    return meta
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

  /**
   * 战斗 id → 可读名，**多表回退**。
   *
   * `instBattleIndex` 只覆盖 `instance.json` 里登记过的战斗。任务的 `stepPosition`
   * 还引用了未登记的（实测 4 条：`yzdj_1`/`yzdj_4`/`yzdj_5`，`instanceId` 写的是
   * 不存在的 `dungeonB`），原先直接显示裸 id。
   *
   * 回退到 `battle.json` 的 `name`（如 `yzdj_1` → 「地窖深处一层（弃）」）——
   * 名称里的「（弃）/（停用）」是原表自带标记，照实显示，玩家能看出这是废弃关卡。
   */
  const battleLabel = (battleId) => {
    if (!battleId) return null
    const fromInstance = instBattleIndex[battleId]
    if (fromInstance && fromInstance.battleName) return fromInstance.battleName
    const fromBattle = battleMap[battleId]
    if (fromBattle && fromBattle.name) return fromBattle.name
    return null
  }

  const taskNameMap = {}
  for (const [id, t] of Object.entries(taskMap)) taskNameMap[id] = t && t.name

  /*
   * 地点名清洗：剥离原表里混入的策划备注。
   *
   * 实测 `area.json` 的 `yz` 区域名是「驿站区域（废弃方案存档」—— 括号没闭合，
   * 且整段是开发备注。它会一路带到 `task_100100/200100` 等任务的「任务地点」，
   * 玩家看到「驿站郊外02（驿站区域（废弃方案存档）」。
   *
   * 判据：截断到第一个 `（`/`(` 之前（正常地区名不带括号备注），并丢弃明显是
   * 开发标记的片段（废弃/停用/方案存档/待改/测试/未使用）。
   * 若截断后为空则保留原名，避免把地点名洗没。
   */
  const DEV_MARK = /废弃|停用|方案存档|待改|测试|未使用|备份|暂不使用/
  const cleanPlaceName = (name) => {
    const raw = String(name || '').trim()
    if (!raw) return ''
    if (!DEV_MARK.test(raw)) return raw
    const cut = raw.split(/[（(]/)[0].trim()
    return cut || raw
  }

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
      if (mapArea && mapArea.name) parts.push(cleanPlaceName(mapArea.name))
      if (area && area.name) parts.push(cleanPlaceName(area.name))
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
      return { type: 'area', label: cleanPlaceName(areaMap[id].name), id }
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

  /**
   * 接取 NPC 的**名字**。
   *
   * 两类 `getTask.npc` 的 `title` 语义**不同**（实测 129 条）：
   *
   * | 类别 | 条数 | `title` 是 | 例 |
   * | --- | --- | --- | --- |
   * | 贸易小车 `cart_at_npc_*` | 57 | **NPC 名字** | `契约官艾尔莎`、`侍者维丝` |
   * | 场景 NPC（`xxx_areaN_M` 等） | 72 | **搭话台词 / 旁白** | `（蕈人在向你们招手。）`、`请问……` |
   *
   * 所以名字按类别取：
   *   · 小车 → `title` 即名字（源码 `DailyTaskPanel.cs:248` 的 `taskNpcName.text`）；
   *   · 场景 NPC → `title` 是台词，名字去 `room.npcList[].npcName` 查（`npcUidName`）。
   *
   * 台词本身（`title`）不丢：页面的「交互对话」行按同一个判据决定显不显示。
   */
  const npcNameOf = (id, title) => {
    if (!id) return null
    const t = String(title || '').trim()
    if (id.startsWith('cart_at_npc_') && t) return { name: t, kind: 'cart' }
    if (npcUidName[id]) return { name: npcUidName[id], kind: 'scene' }
    if (t) return { name: t, kind: 'cart' }
    return null
  }

  const resolveNpc = (id, stepName) => {
    if (!id) return null
    if (newOrderNpc[id]) return { name: newOrderNpc[id], id }
    if (npcUidName[id]) return { name: npcUidName[id], id }
    const hn = heroNpcName(id)
    if (hn) return { name: hn, id }
    const extracted = extractNameFromStep(stepName, id)
    if (extracted) return { name: extracted, id }
    return { name: '未知', id }
  }

  // ---------- 奖励解析（统一走 gameMappings.parseRewardEntries） ----------

  // ---------- 条件解析 ----------
  /**
   * 接取条件文案。
   *
   * 🔴 **优先用 `rules` 生成，`desc` 只作补充**。
   *
   * `condition.json` 的 `desc` 常是**策划备注**而非玩家文案，实测 112/760 条形如
   * 「任务接取步骤条件」「NPC显示条件」「解锁风车平野后接取步骤条件」——
   * 直接透出会让玩家看到内部占位词（41 条任务命中）。
   * 真实条件在 `rules` 里（`passTask` → 「完成《暴风般的复仇》第2步」）。
   *
   * `desc` 仍作**补充**：它能提供 `rules` 表达不了的信息（如「完成 m_4_6 后可接取」里的
   * 任务名替换、或「紧急契约：蔓晶采石场」这类前缀）。但备注性片段会被剔除。
   *
   * @param {string} condId condition.json 的键
   */
  const parseCondition = (condId) => {
    if (!condId) return '无'
    const c = conditionMap[condId]
    if (!c) return condId

    // 1) 先从 rules 生成结构化条件（这是权威来源）
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

    /*
     * 2) desc 只在**无法从 rules 得到条件**时使用（见下方 4)。
     *
     * 实测 `desc` 混有大量非条件内容：任务自身名（「蛙肉却如此滑嫩……」「我的研究员们去了哪里」）、
     * 策划备注（「任务接取步骤条件」「NPC显示条件」）、装饰性描述（「珍贵的装饰鸟羽」）。
     * 把它们拼进条件只会制造噪声 —— 有 rules 时**完全以 rules 为准**。
     */
    const rawDesc = String(c.desc || '').trim()
    const NOTE_ONLY = /^(?:任务接取步骤条件|NPC显示条件|NPC交互项条件|.*?(?:显示|接取|交互项?)?条件)$/
    const cleanedDesc = rawDesc
      .replace(/^[^，,。;；]{0,12}?(?:任务)?(?:接取)?(?:步骤)?条件[，,。;；\s]*/, '')
      .trim()
    const descUsable = cleanedDesc && !NOTE_ONLY.test(rawDesc)

    // 3) rules 是权威来源
    if (parts.length) return parts.join('；')

    // 4) rules 为空时才退回 desc（剔除纯备注）
    if (descUsable) {
      return cleanedDesc.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (tok) => {
        if (taskNameMap[tok] && tok !== condId) return `《${taskNameMap[tok]}》`
        return tok
      })
    }
    if (rawDesc && !NOTE_ONLY.test(rawDesc)) return rawDesc
    return '无'
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
     * 🔴 分母必须用去重后的条数：房间触发器会把同一段剧情挂在多个房间/多个触发器上
     * 用去重前的 `roomDialogs.length` 会让标签出现「实际显示 5 条、标签却写 (1/8)」，
     * 玩家会以为丢了剧情。
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
    const dlgMeta = (raw, fallback = '') => markDialogMissing(resolveDialogMeta(raw, cleanName(raw, fallback)))
    /*
     * NPC 文本：**查不到名字就不产出这一行**。
     *
     * 实测 25 个 uid（`baduer_yzdq_7`、`ke_sldsd_21`、`NPC031` …）在任何表里都没有名字：
     * `room.npcList` 无该 uid、其所在房间在 `room.json` 里不存在、`npc.json` 只有立绘字段。
     * 原先把内部 id 显示成「未知（ke_sldsd_21）」，玩家看不懂且暴露实现细节。
     *
     * 依据：游戏任务界面（`TaskPanel.cs:385-386`）只显示 `stepName` + `stepDes`，
     * **步骤级根本没有「NPC」这一行**，所以查不到时省略与游戏行为一致。
     * 返回 `null` 后由 `push` 跳过，不产生空行。
     */
    const npcText = (npc) => (npc && npc.name && npc.name !== '未知' ? npc.name : null)

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
        push('副本关卡', battleLabel(pos[2]))
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
          // 副本名同样多表回退：`stepPosition[1]` 可能是未登记的实例 id（如 `dungeonB`），
          // 此时退回该战斗在 `battle.json` 里的 `category` 归属，避免显示裸 id。
          const inst = instanceMap[pos[1]]
          const battle = battleMap[pos[2]]
          const instLabel = inst
            ? inst.name
            : (battle && battle.category ? String(battle.category[1] || battle.category[0] || '') : '')
          push('副本', instLabel || null)
          push('副本关卡', battleLabel(pos[2]))
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
        /*
         * 与 `gotoStage` **字段相同**（`stageId` + `dialog`），位置走同一条 `pushPos()`。
         *
         * 🔴 源码 `TaskPanel.cs:505-521` 的 `ShowCurrentTaskGo` 对**所有** stepType 通用：
         * `stepData.stepPosition[0]` 是种类（`room`/`stage`/`battle`），`[1]` 是 id，
         * `case "room"` 分支取 `GetRoomLevelDataById(stepTypeId)` 显示「区域/房间」。
         * `passStage` 的 `stepPosition` 正是 `["room", "ydzb_5"]` —— 游戏里**显示位置**。
         *
         * 旧注释写「不显示关卡/位置」与源码不符，已改为与 `gotoStage` 一致。
         * 区别只在完成条件（`CheckPassStage` 要通过记录，`gotoStage` 进入即可），展示相同。
         */
        pushPos()
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
        // 用 dlgMeta 而非 resolveDialogMeta：前者会打「未收录」标记（这两条实测各有 5 个缺失）
        if (p.dialog0) dialogs.push({ label: '不满足条件', meta: dlgMeta(p.dialog0) })
        if (p.dialog1) dialogs.push({ label: '满足条件', meta: dlgMeta(p.dialog1) })
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
        // 官方 desc 优先（`eventRecord.eventRecords[tag].desc`），手写 TAG_LABELS 兜底
        push('目标', eventRecordDesc[p.tag] || TAG_LABELS[p.tag] || p.tag)
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
    const getTaskDialog = markDialogMissing(
      getTask.dialog
        ? resolveDialogMeta(getTask.dialog, (dialogIndex[getTask.dialog] || '').replace(/\s+/g, ' ').trim())
        : null
    )
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

    /*
     * 接取 NPC：名字与台词**分开取**。
     *
     *   · 名字（`getTask.npc.name`）→ 小车 NPC 用 `title`，场景 NPC 用 room 里的 `npcName`；
     *   · 台词（`getTask.npc.line`）→ 只有**场景 NPC** 才有（`title` 就是那句搭话/旁白），
     *     小车 NPC 的 `title` 已经是名字，再当台词显示就会与上一行重复。
     *
     * 名字解析不出时（实测 7 个 uid 无任何名字来源）`name` 为 `null` —— 页面据此**不渲染这一行**，
     * 不显示「未知（内部 id）」。台词与名字相互独立：名字查不到但 `title` 有内容时，
     * 台词照常显示（它是玩家能看懂的信息）。
     */
    const getTaskTitle = getTask.title || ''
    const npcNameInfo = getTask.npc ? npcNameOf(getTask.npc, getTaskTitle) : null
    const getTaskNpcName = npcNameInfo
      ? npcNameInfo.name
      : (getTask.npc ? resolveNpc(getTask.npc).name : null)
    const hasGetTaskNpcName = !!getTaskNpcName && getTaskNpcName !== '未知'
    // 场景 NPC 的 title 才是"交互对话"；小车 NPC 的 title 是名字，不重复显示
    const getTaskNpcLine = npcNameInfo?.kind === 'scene' ? getTaskTitle : ''

    /*
     * 起始 NPC：仅当第 1 步有**可读的** NPC 行时才取。
     *
     * `getTask.npc` 有名字时用它；否则退回第 1 步的 NPC 行（已由 `npcText` 过滤掉查不到的）。
     * 两者都没有名字就保持 `null` —— 页面不渲染该行。
     */
    let startNpc = null
    if (getTask.npc && hasGetTaskNpcName) {
      startNpc = { name: getTaskNpcName, id: getTask.npc }
    } else if (firstStep && firstStep.detail) {
      const npcRow = firstStep.detail.find((d) => d.label === 'NPC')
      if (npcRow && npcRow.value) {
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
        // 名字查不到时 `name` 为 `null`（页面据此不渲染「接取 NPC」行）；
        // `line`（交互对话）独立保留 —— 它是玩家可读的台词，不受名字是否解析成功影响。
        npc: getTask.npc
          ? {
            name: hasGetTaskNpcName ? getTaskNpcName : null,
            id: getTask.npc,
            line: getTaskNpcLine,
            kind: npcNameInfo?.kind || ''
          }
          : null,
        title: getTaskTitle,
        dialog: getTaskDialog,
        condition: parseCondition(getTask.condition)
      },
      addTasks: arr(t.addTask)
        .map((id) => ({ id, name: taskNameMap[id] || id, close: !!taskMap[id]?.close }))
        .filter((task) => task.id && !task.close),
      /*
       * 🔴 `unlockTask` 与 `addTask` 口径必须一致：两者都排除 `close=true` 的目标。
       *
       * 原表里存在指向已下架任务的引用（实测 6 条，如 `s_1_8`→`s_1_9`、`sub_0_02`→`sub_0_03`，
       * 目标 `close=true`）。展示层已隐藏已下架任务（`HIDE_CLOSED_TASKS`），
       * 若这里不过滤会列出**点不进、也搜不到**的任务名。
       */
      unlockTasks: arr(t.unlockTask)
        .map((id) => ({ id, name: taskNameMap[id] || id, close: !!taskMap[id]?.close }))
        .filter((task) => task.id && !task.close),
      unlockStages: parseUnlockStages(t.unlockStage),
      // 🔴 产物里**不要**塞整条原表配置（如 `raw: t`）：它在 `src/` 无消费方，
      // 却会让 tasks.json 体积翻倍。构建期回查配置时 `t` 在当前作用域内仍然可用。
      steps: parsedSteps
    })
  }

  /*
   * 同一分类内按任务 ID 排序，**必须用数字感知比较**。
   *
   * 🔴 `a.id.localeCompare(b.id)` 是字典序：逐字符比较时 `'1'` 与 `'2'` 先分出胜负，
   * `0` 根本没参与，于是 `m_1_10` 排在 `m_1_2` 前面，表现为第一章列表里
   * 「共鸣 / 家园 / 往日的阴影」跑到「深渊」前面。
   *
   * `numeric: true` 得到的就是配置本身的推进次序：
   *   m_1_1 → m_1_2 → m_1_4 → m_1_4_1 → … → m_1_9 → m_1_10 → m_1_11 → m_1_12
   * 同时处理好 `m_1_4` / `m_1_4_1`（前缀短的在前）这类派生任务。
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
 * 把一条剧本文本行清成**与页面渲染完全一致**的纯文本。
 *
 * 🔴 **必须复用 `cleanDialogueLine`，不能自己写一套标记剥离。**
 *
 * 自己写简化实现（只剥 `[show]/[l]/[cm]`）会与页面渲染不一致：页面还会把
 * `{myName}` / `主角` 换成「小工匠」、`{callNameN}` 换成「他（她）」。于是：
 *   · 用户**看到的是**「小工匠，你醒了。」，搜「小工匠」却搜不到（索引里是 `{myName}`）；
 *   · 就算搜到了，索引里的行与页面上渲染出的行也对不上，没法滚动定位。
 *
 * 复用同一个清洗函数后，**索引里的每一行就是页面上那一行的文本**，
 * 命中判定与定位才同时成立。
 */
export const cleanDialogSearchLine = (value) => cleanDialogueLine(String(value ?? ''))

/**
 * 构建期纯函数：生成**任务图鉴剧情搜索索引** `parsed/dialog-search.json`。
 *
 * ## 为什么单独一份产物，而不是并进 `search-index.json`
 *
 * 全量剧情正文约 74 万字符 / brotli 约 0.58 MB，而 `search-index.json` 是
 * **首屏就要下载**的（`INLINE_HASH_DIRECTORIES` 里的 `data/parsed/`）。并进去等于
 * 让每个冷启动用户为「可能用不到的剧情搜索」多付 0.6 MB，直接违反 SPEC 的首屏约束。
 * 因此拆成独立产物，**只在任务页真正开始搜索时才拉取**（懒加载、按会话缓存）。
 *
 * ## 为什么存「按剧情块分组的行数组」而不是一坨文本
 *
 * 用户要的不只是"搜得到"，还要**点开后自动展开并滚到那句话**。一坨文本只能回答
 * "这个任务命中了吗"，无法回答"命中在哪一步、哪段剧情、第几行"，于是没法定位。
 *
 * 因此按 `步骤下标:剧情下标` 分块、块内保留**行数组**。实测这个形状与一坨文本的
 * 压缩后体积**几乎相同**（brotli 0.58 MB，差 < 1%）—— 因为块边界与换行本来就存在，
 * 拆成数组只是把它显式化，并没有引入额外冗余。
 *
 * 实测过的负收益方案（都不采用）：2-gram 倒排 brotli 680 KB、全局行去重字典 607 KB，
 * **都比直接存正文更大** —— 中文两字组合太多，索引开销超过原文。
 *
 * ## 行文本必须与页面渲染的一致
 *
 * 这里用 `cleanDialogSearchLine` 清洗，页面用 `cleanDialogueLine`。
 * 两者都剥掉 `[show]/[l]/[cm]` 一类舞台标记，所以**同一句话在索引与页面上
 * 是同一个字符串**，`String.includes` 才能直接对齐到具体某一行。
 *
 * @param {object} tasksData `buildTaskData()` 的返回值
 * @param {Map<string, object>} dialogScripts dialogId -> 剧本对象（已裁剪/已回退「旧」变体）
 * @returns {{generatedAt: string, tasks: Object<string, Array<{key: string, lines: string[]}>>, meta: object}}
 */
export function buildDialogSearchIndex(tasksData, dialogScripts) {
  const scripts = dialogScripts instanceof Map ? dialogScripts : new Map(Object.entries(dialogScripts || {}))
  const out = {}
  let charCount = 0
  let dialogCount = 0
  let lineCount = 0

  for (const task of arr(tasksData?.tasks)) {
    const blocks = []
    for (const [stepIndex, step] of arr(task.steps).entries()) {
      for (const [dialogIndex, d] of arr(step.dialogs).entries()) {
        const raw = d?.meta?.raw
        // `isText` 的条目是配置里直接写的文本目标（「收集 3 株药浆草。」），不是剧本文件
        if (!raw || d.meta.isText) continue
        const script = scripts.get(raw)
        if (!script) continue
        dialogCount++

        /*
         * 🔴 这里必须**逐条镜像页面渲染出来的条目**，索引下标才能对上 DOM。
         *
         * 页面（`TasksView.toggleDialog`）把 exps 过滤成 text/option 后：
         *   · `text`   → **一条**条目 `{ speaker, text }`，文本为空则整条丢弃；
         *   · `option` → **一条**条目 `{ isOption: true, options: [...] }`，
         *                所有选项收在同一个条目里（不是每个选项一条）。
         *
         * 🔴 粒度必须与页面一致：把每个选项**各推一行**会让含选项的剧情里
         * 索引行号与页面行号错位，滚动落到错误的行上。
         * 现在按同样的粒度产出：选项组合成一条，其可搜索文本是各选项的拼接。
         */
        const lines = []
        for (const e of arr(script.exps)) {
          if (e.key === 'text' && e.para?.text) {
            const t = cleanDialogSearchLine(e.para.text)
            if (t) lines.push(t)
          } else if (e.key === 'option' && Array.isArray(e.para?.options)) {
            const opts = e.para.options.map((o) => cleanDialogSearchLine(o?.text)).filter(Boolean)
            if (opts.length) lines.push(opts.join('\n'))
          }
        }
        if (!lines.length) continue
        // key 用「步骤下标:剧情下标」，与 TasksView 里 dialogOpen 的键一致，可直接定位
        blocks.push({ key: `${stepIndex}:${dialogIndex}`, lines })
        charCount += lines.join('\n').length
        lineCount += lines.length
      }
    }
    if (blocks.length) out[task.id] = blocks
  }

  return {
    generatedAt: new Date().toISOString(),
    tasks: out,
    meta: {
      taskCount: Object.keys(out).length,
      dialogCount,
      lineCount,
      charCount,
      // 供 UI 提示与排查：按「步骤:剧情」分块、块内为行数组，可定位到具体某一行
      form: 'per-dialog-lines'
    }
  }
}

function formatEntrustLabel(cKey, areaMap) {
  // 委托分类 C0~C5 -> 统一使用全局地图映射，页面不再各自读取/维护名称。
  return getMapName(cKey)
}
