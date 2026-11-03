/**
 * 日常计划预解析：public/data/parsed/daily.json
 *
 * ## 数据来源
 * | 原表 | 用途 |
 * | --- | --- |
 * | `dailyWork.json` | `plans`（7 组计划 + 子关卡）、`weekPlans`（周分配）、`event`（限时） |
 * | `battle.json` | 子关卡 `battle` 指向的关卡：等级、时长、说明、掉落 id |
 * | `room.json` | 房间定义，怪物在 `battleData.monRounds[].mons[]` |
 * | `mon.json` | 怪物名 / 图标 / 属性 |
 * | `reward.json` | 结算掉落（exp / money / items） |
 * | `item.json` | 掉落物品名 / 图标 / 品质 |
 * | `condition.json` | 解锁条件规则 |
 *
 * ## 隐藏内容过滤（与游戏行为一致的近似）
 *
 * 游戏端 `DailyWorkPanel.cs` 用 `ExtentionMethod.CheckResultConditions` **按账号进度**过滤：
 * 条件不满足时子关卡直接 `SetActive(false)`，玩家看不到黑森林/霜烬平原字样。
 *
 * 本站不连账号，改用**静态黑名单**近似。任一命中即隐藏整个子关卡（连同名称、怪物、掉落）：
 *   ① 子关卡名字/描述命中 `blacklist.js`（「黑森林训练室」「雪原火山」）
 *   ② 解锁条件依赖的**关卡**所属章节在 `HIDDEN_CHAPTERS`（c5_6_a ∈ 霜烬平原）
 *   ③ 解锁条件依赖的**任务**本身命中黑名单（m_5_1「霜烬平原的召唤」）
 *
 * 依据：第三章之后客户端无已发布内容。实测隐藏 10 个子关卡、保留 19 个。
 *
 * ## 🔴 三个必须按源码口径处理的点
 *
 * ### 一、怪物取 `typeId`，不是 `monId`
 * `monRounds[].mons[]` 里：
 *   - `monId` 是**关卡内实例 uid**（源码 `BattleManager` 当 uid 用，如 `"mon144"`）
 *   - `typeId` 才是怪物类型（如 `"007"`），用它查 `mon.json`
 * `monId` 在 `mon.json` 里根本不存在，用它查会全部落空。
 *
 * ### 二、`room.json` 是**扁平结构**
 * 顶层直接是 `{ roomTypeId: {...} }`，没有 `datas` 包裹（`battle.json` / `mon.json` 有）。
 *
 * ### 三、解锁条件要拆成可跳转的结构
 * `condition.json` 的 `rules[]` 有两种：
 *   - `passTask`   → `para.typeId` 是任务 id，`para.step` 是步骤（-1 = 整章）
 *   - `passBattle` → `para.battles[]` 是关卡 id
 * 前端据此跳到 `/tasks?task=<id>` 或 `/dungeons?battle=<id>`。
 */
import { readFileSync } from 'node:fs'
import { isBlacklisted } from '../../src/config/blacklist.js'
import { readJson } from './shared.mjs'
import { buildRewardEntries } from '../../src/utils/dungeonData.js'
import { compactRewards } from './compact.mjs'

const table = v => v?.datas || v || {}

/** 周几（0=周日）→ 中文 */
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * `battle.json` 里的关卡 id 形如 `c5_6_a`，而**关卡图鉴**（chapters 产物）用的是
 * `c5_6`（去掉尾部难度字母）。跳 `/chapters?stage=` 必须用后者，
 * 否则页面按 id 匹配不到、停在列表页。
 *
 * 映射失败时退回原始 id —— 关卡图鉴找不到时至少 URL 里能看出是哪个关卡。
 */
function toStageId(battleId, stageIndex) {
  if (!battleId) return ''
  if (stageIndex.has(battleId)) return battleId
  const stripped = battleId.replace(/_[a-z]$/, '')
  return stageIndex.has(stripped) ? stripped : battleId
}

/**
 * 条件规则 → { kind, label, target }；target 供前端做跳转。
 *
 * 🔴 **必须映射成名称，不能只显示 id**：
 *   - 任务名在 `task.json` 的 `name`（如 `m_2_1` → 破损的营地）
 *   - 关卡名在 `battle.json` 的 `name`（如 `c5_6_a` → 5-6 冰棱台地）
 * 两处都有兜底：查不到时退回 id，不编造名字。
 */
function parseCondition(conditionRes, condId, taskRes, battleRes, stageIndex) {
  const conf = conditionRes?.[condId]
  if (!conf) return { id: condId, text: '', links: [] }

  const links = []
  for (const rule of conf.rules || []) {
    if (rule.need === false) continue
    const para = rule.para || {}
    if (rule.type === 'passTask') {
      const taskId = para.typeId
      const taskConf = taskRes?.[taskId]
      const stepNum = Number(para.step)
      /*
       * 依据源码 ExtentionMethod.CheckConditions 的 case "passTask"：
       *   已完成（passTasks.CheckDicCnt）→ 满足
       *   否则 step >= 0 且 当前步骤 > step → 满足
       * 所以：
       *   step < 0  → 要整条任务**完成**
       *   step >= 0 → 任务推进到第 step 步之后
       * 文案里 step < 0 不能说「通关」—— 那是关卡（passBattle）的说法。
       */
      const stepText = stepNum < 0 ? '完成' : `推进至第 ${stepNum} 步`
      const category = (taskConf?.category || []).filter(Boolean).join(' · ')
      const taskName = taskConf?.name || `任务 ${taskId}`
      links.push({
        kind: 'task',
        targetId: taskId,
        name: taskConf?.name || '',
        category,
        step: stepNum,
        stepText,
        label: stepNum < 0
          ? `完成「${taskName}」任务`
          : `任务「${taskName}」${stepText}`,
        route: `/tasks?task=${encodeURIComponent(taskId)}`
      })
    } else if (rule.type === 'passBattle') {
      for (const b of para.battles || []) {
        const battleConf = battleRes?.[b]
        /*
         * 关卡（stage）跳**关卡图鉴** `/chapters?stage=`，不是副本图鉴。
         * `/dungeons?battle=` 是副本内部的战斗节点，语义不同。
         */
        const stageId = toStageId(b, stageIndex)
        const stageConf = stageIndex.get(stageId)
        const stageName = battleConf?.name || stageConf?.name || ''
        links.push({
          kind: 'stage',
          targetId: b,
          stageId,
          name: stageName,
          chapterNo: stageConf?.chapterNo || 0,
          label: stageName ? `通关 ${stageName}` : `通关 ${b}`,
          route: stageId ? `/chapters?stage=${encodeURIComponent(stageId)}` : ''
        })
      }
    }
  }

  return {
    id: condId,
    text: conf.desc || '',
    category: conf.category || [],
    links
  }
}

/** 从 battle 的所有房间收集怪物（按 typeId 去重，保留首次出现的顺序） */
function parseStageRoomsAndWaves(battleConf, roomRes, monRes, roomCollectRes, roomCollectTypeRes, rewardRes, itemRes, equipConfig) {
  const rooms = []
  const allWaves = []
  const monsterSummaryMap = new Map()
  let globalWaveIndex = 1

  let roomIndex = 1
  for (const layer of battleConf.layers || []) {
    for (const layerData of layer.layerDatas || []) {
      for (const [roomId, roomObj] of Object.entries(layerData.rooms || {})) {
        const roomTypeId = roomObj.roomTypeId || roomId
        const room = roomRes?.[roomTypeId]
        const rawName = room?.name || roomObj.name || ''
        const cleanName = rawName.replace(/f\d+[A-Z]?_\d+.*$/, '').trim()
        /*
         * 房间名可能是纯代号（如 `dailyWork_1_shuihuo`），对玩家无意义。
         * 与 `/chapters`（scripts/parse/chapters.mjs）用同一套判定：
         *   名称等于自身 typeId、或含「未命名」、或形如 xxx_N_yyy 的蛇形代号
         * 命中则退化为「房间 N」，编号按房间出现顺序从 1 开始。
         */
        const looksLikeCode = (name) => {
          if (!name) return true
          if (name === roomTypeId) return true
          if (name.includes('未命名')) return true
          /* 形如 dailyWork_1_shuihuo / battle_0_1 / c3_4_a_f1A_1 的复合代号 */
          if (/^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+){2,}$/.test(name)) return true
          /* 正则截断后残留的尾巴，如 c3_4_a_ / c3_4_a */
          if (/^[A-Za-z]\d+_\d+_[A-Za-z]+_?$/.test(name)) return true
          /* 纯「字母_数字_字母」三段且无中文，一律视为代号 */
          if (/^[A-Za-z0-9_]+$/.test(name) && name.includes('_') && !/[\u4e00-\u9fa5]/.test(name)) return true
          return false
        }
        /*
         * 房间名与关卡名相同也没有信息量（多房间时会出现 5 个都叫「藤蔓雨林」），
         * 与 `/chapters` 的处理一致：一并退化为「房间 N」。
         */
        const stageName = (battleConf?.name || '').trim()
        const isSameAsStage = Boolean(stageName) && cleanName === stageName
        const roomDisplayName = (!looksLikeCode(cleanName) && cleanName && !isSameAsStage)
          ? cleanName
          : `房间 ${roomIndex}`

        // 1. 采集物（植物/矿物）
        const colMap = new Map()
        for (const sp of room?.battleData?.spObj || []) {
          const cid = sp.caijiTypeId
          if (!cid) continue
          const colObj = roomCollectRes?.[cid]
          const typeInfo = roomCollectTypeRes?.[colObj?.collectTypeId || cid] || {}
          const colName = typeInfo.name || colObj?.name || cid
          const rewardId = typeInfo.reward || ''
          const rewardEntries = rewardId && rewardRes?.[rewardId]
            ? compactRewards(buildRewardEntries(rewardRes[rewardId], itemRes, null, equipConfig))
            : []
          const rewardItems = rewardId ? parseReward(rewardRes, itemRes, rewardId)?.items || [] : []

          const existing = colMap.get(cid) || {
            collectId: cid,
            name: colName,
            count: 0,
            tags: typeInfo.tags || [],
            reward: rewardEntries,
            rewardItems
          }
          existing.count += 1
          colMap.set(cid, existing)
        }
        const collections = [...colMap.values()]

        // 2. 怪物波次
        const roomWaves = []
        const roomMonsterMap = new Map()
        let localWaveIndex = 1

        for (const round of room?.battleData?.monRounds || []) {
          const waveMonstersMap = new Map()
          for (const m of round.mons || []) {
            const typeId = m.typeId
            if (!typeId) continue
            const info = monRes?.[typeId] || {}
            const name = info.name || typeId
            const icon = info.icon || ''
            const monRank = Number(info.monRank) || 1

            const waveItem = waveMonstersMap.get(typeId) || {
              typeId,
              name,
              icon,
              monRank,
              count: 0,
              levelScale: m.levelScale ?? 1,
              levelScaleHp: m.levelScaleHp ?? 1
            }
            waveItem.count += 1
            waveMonstersMap.set(typeId, waveItem)

            // 全关卡汇总
            const sumItem = monsterSummaryMap.get(typeId) || {
              typeId,
              name,
              icon,
              monRank,
              count: 0,
              levelScale: m.levelScale ?? 1,
              levelScaleHp: m.levelScaleHp ?? 1,
              rounds: 0,
              waveList: []
            }
            sumItem.count += 1
            sumItem.rounds += 1
            if (!sumItem.waveList.includes(globalWaveIndex)) {
              sumItem.waveList.push(globalWaveIndex)
            }
            monsterSummaryMap.set(typeId, sumItem)

            // 本房间汇总
            const roomMon = roomMonsterMap.get(typeId) || {
              typeId,
              name,
              icon,
              monRank,
              count: 0,
              levelScale: m.levelScale ?? 1,
              levelScaleHp: m.levelScaleHp ?? 1
            }
            roomMon.count += 1
            roomMonsterMap.set(typeId, roomMon)
          }

          if (waveMonstersMap.size > 0) {
            const waveData = {
              wave: localWaveIndex++,
              globalWave: globalWaveIndex++,
              monsters: [...waveMonstersMap.values()]
            }
            roomWaves.push(waveData)
            allWaves.push({
              wave: waveData.globalWave,
              roomName: roomDisplayName,
              monsters: waveData.monsters
            })
          }
        }

        rooms.push({
          roomId,
          roomTypeId,
          name: roomDisplayName,
          index: roomIndex++,
          waves: roomWaves,
          collections,
          monsters: [...roomMonsterMap.values()]
        })
      }
    }
  }

  /*
   * 房间重名去重：同一关卡内多个房间可能写同一个场景名
   * （`daily_herb_3` 的 5 个房间都叫「藤蔓雨林」），玩家无法区分。
   *
   * 处理：**仅重名的**追加序号 —— 「藤蔓雨林 1」「藤蔓雨林 2」…，
   * 唯一的房间保持原名不动（避免给「驿站训练场」这种本来就唯一的房间加个多余的 1）。
   * 已经是「房间 N」的代号名不参与编号（它们本来就带序号）。
   */
  const nameCount = new Map()
  for (const r of rooms) {
    if (String(r.name).startsWith('房间 ')) continue
    nameCount.set(r.name, (nameCount.get(r.name) || 0) + 1)
  }
  const nameSeq = new Map()
  for (const r of rooms) {
    if (String(r.name).startsWith('房间 ')) continue
    if ((nameCount.get(r.name) || 0) <= 1) continue
    const next = (nameSeq.get(r.name) || 0) + 1
    nameSeq.set(r.name, next)
    r.name = `${r.name} ${next}`
  }

  return {
    rooms,
    waves: allWaves,
    monsters: [...monsterSummaryMap.values()]
  }
}

/**
 * 结算掉落：exp / money / items[]
 *
 * 🔴 掉落规则有**两种 mode**，不能只认 `typeId`：
 *   - `mode: "item"`       → 单个物品，有 `typeId`
 *   - `mode: "equipGroup"` → 装备池，用 `qualityGroup` + `equipTypeGroup` + `equipLevel`
 *     描述「某品质、某类型、某等级的装备」，**没有 typeId**。
 *     限时双倍经验本（`yzdj_battle1_SpBattle` → `main101`）就是这种。
 *
 * 装备池无法在构建期确定具体装备（要按游戏掉落表随机），
 * 所以这里保留 `mode` 与池参数，前端显示为「某品质装备」而不是编一个具体名字。
 */
function parseReward(rewardRes, itemRes, rewardId) {
  const r = rewardRes?.[rewardId]
  if (!r) return null

  const QUALITY_LABEL = { 1: '普通', 2: '稀少', 3: '珍贵', 4: '罕见', 5: '传说' }

  const items = []
  for (const group of r.items || []) {
    for (const rule of group.rules || []) {
      const mode = rule.mode || 'item'
      const min = Number(rule.min) || 0
      const max = Number(rule.max) || min
      const chance = rule.chance === undefined ? 1 : Number(rule.chance)

      if (mode === 'item') {
        const item = itemRes?.[rule.typeId]
        if (!rule.typeId) continue
        items.push({
          mode,
          typeId: rule.typeId,
          name: item?.name || rule.typeId,
          img: item?.img || rule.typeId,
          quality: Number(item?.quality) || 1,
          min,
          max,
          chance
        })
        continue
      }

      /* 装备池：没有具体 typeId，保留池参数供前端描述 */
      const qMatch = String(rule.qualityGroup || '').match(/quality_(\d+)/)
      const quality = qMatch ? Number(qMatch[1]) : 0
      items.push({
        mode,
        typeId: '',
        name: `${QUALITY_LABEL[quality] || ''}装备`,
        img: '',
        quality: quality || 1,
        equipTypeGroup: rule.equipTypeGroup || '',
        equipLevel: Number(rule.equipLevel) || 0,
        min,
        max,
        chance
      })
    }
  }

  return {
    id: rewardId,
    tip: r.tip || '',
    exp: Number(r.exp) || 0,
    money: Number(r.money) || 0,
    heroExp: Number(r.heroExp) || 0,
    equipExp: Number(r.equipExp) || 0,
    ke: Number(r.ke) || 0,
    items
  }
}

export function buildDailyFile() {
  const dailyWork = table(readJson('dailyWork.json'))
  const battleRes = table(readJson('battle.json'))
  const roomRes = table(readJson('room.json'))
  const monRes = table(readJson('mon.json'))
  const rewardRes = table(readJson('reward.json'))
  const itemRes = table(readJson('item.json'))
  const conditionRes = table(readJson('condition.json')).gameConditions || table(readJson('condition.json'))
  const taskRes = table(readJson('task.json'))
  const roomCollectRes = table(readJson('roomCollect.json'))
  const roomCollectTypeRes = table(readJson('roomCollectType.json'))
  const equipConfig = readJson('equip/equipGroup.json')

  /*
   * 关卡图鉴索引：id → { name, chapterNo }。
   *
   * 🔴 读的是 **parsed 产物** `chapters.json`，不是 `readJson()` ——
   *    `readJson` 的解析根是 `raw/`（原始配置表），而 chapters.json 是
   *     `scripts/parse/chapters.mjs` 的产出，raw 里没有这个文件。
   *     daily 排在 chapters 之后构建，产物此时已就绪。
   */
  const stageIndex = new Map()
  try {
    const chaptersRaw = readFileSync(new URL('../../public/data/parsed/chapters.json', import.meta.url), 'utf8')
    const chaptersRes = JSON.parse(chaptersRaw)
    for (const ch of chaptersRes.chapters || []) {
      for (const st of ch.stages || []) {
        stageIndex.set(st.id, {
          name: st.name || '',
          shortName: st.shortName || '',
          chapterNo: ch.chapterNo || 0,
          areaName: ch.areaName || '',
          /* 章节被黑名单隐藏 → 依赖它的子关卡一并隐藏 */
          chapterHidden: isBlacklisted({ id: ch.id, name: ch.areaName, label: ch.name })
        })
      }
    }
  } catch (err) {
    /* 首次构建时 chapters 可能还没产出；映射退化为「去后缀」，不阻断日常计划产物 */
    console.warn(`[daily] 未读到 chapters.json（${err.message}），关卡名将退回 battle.json`)
  }

  /**
   * 子关卡是否应隐藏。返回命中原因数组，空数组表示保留。
   * 三条判据见文件头注释。
   */
  function stageHiddenReasons(stage) {
    const reasons = []

    /* ① 名字/描述本身命中黑名单 */
    if (isBlacklisted({ name: stage.name, desc: stage.des })) {
      reasons.push('name')
    }

    const conf = stage.condition ? conditionRes?.[stage.condition] : null
    for (const rule of conf?.rules || []) {
      const para = rule.para || {}
      /* ② 依赖关卡所属章节被隐藏 */
      if (rule.type === 'passBattle') {
        for (const b of para.battles || []) {
          const info = stageIndex.get(String(b).replace(/_[a-z]$/, '')) || stageIndex.get(b)
          if (info?.chapterHidden) reasons.push('stage')
        }
      }
      /* ③ 依赖任务本身被隐藏 */
      if (rule.type === 'passTask') {
        const t = taskRes?.[para.typeId]
        if (t && isBlacklisted({ id: para.typeId, name: t.name, desc: t.des })) {
          reasons.push('task')
        }
      }
    }
    return reasons
  }

  /* ── ① 计划与子关卡 ── */
  const plans = []
  for (const [planId, plan] of Object.entries(dailyWork.plans || {})) {
    const stages = []
    /* 被隐藏的子关卡数，供核对（前端不渲染） */
    let hiddenStageCount = 0
    for (const stage of plan.plan || []) {
      /* 命中黑名单的子关卡整块跳过：名称、怪物、掉落都不输出 */
      if (stageHiddenReasons(stage).length) {
        hiddenStageCount += 1
        continue
      }
      const battle = battleRes[stage.battle] || null
      const reward = battle ? parseReward(rewardRes, itemRes, battle.reward) : null
      const rewardEntries = battle?.reward && rewardRes?.[battle.reward]
        ? compactRewards(buildRewardEntries(rewardRes[battle.reward], itemRes, null, equipConfig))
        : []
      const { rooms, waves, monsters } = battle
        ? parseStageRoomsAndWaves(battle, roomRes, monRes, roomCollectRes, roomCollectTypeRes, rewardRes, itemRes, equipConfig)
        : { rooms: [], waves: [], monsters: [] }

      stages.push({
        name: stage.name || '',
        des: stage.des || '',
        img: stage.img || '',
        battleId: stage.battle || '',
        condition: stage.condition ? parseCondition(conditionRes, stage.condition, taskRes, battleRes, stageIndex) : null,
        /* 关卡本体 */
        battleLevel: battle ? Number(battle.battleLevel) || 0 : 0,
        timeSeconds: battle ? Number(battle.time) || 0 : 0,
        battleName: battle?.name || '',
        battleDes: battle?.des || '',
        battleTip: battle?.tip || '',
        /* 房间与波次、采集物与怪物（关卡图鉴同构完整配置） */
        rooms,
        waves,
        monsters,
        reward,
        rewardEntries
      })
    }

    plans.push({
      typeId: planId,
      name: plan.name || '',
      des: plan.des || '',
      img: plan.img || '',
      maxNum: Number(plan.maxNum) || 0,
      special: Boolean(plan.special),
      condition: plan.condition ? parseCondition(conditionRes, plan.condition, taskRes, battleRes, stageIndex) : null,
      /* 原表子关卡总数与其中隐藏数（hiddenStageCount 仅用于核对，页面不渲染） */
      stageCountRaw: (plan.plan || []).length,
      hiddenStageCount,
      stages
    })
  }

  /* ── ② 周分配：把 plan 名与周几展开，前端直接读 ── */
  const weekPlans = []
  for (const [day, list] of Object.entries(dailyWork.weekPlans || {})) {
    const dayNum = Number(day)
    weekPlans.push({
      day: dayNum,
      dayName: WEEKDAY_NAMES[dayNum] || `周${day}`,
      entries: (list || []).map(entry => {
        const plan = plans.find(p => p.typeId === entry.typeId)
        return {
          typeId: entry.typeId,
          name: plan?.name || entry.typeId,
          img: plan?.img || '',
          num: Number(entry.num) || 0
        }
      })
    })
  }
  weekPlans.sort((a, b) => a.day - b.day)

  /* ── ③ 限时活动 ── */
  const events = (dailyWork.event || []).map(e => ({
    name: e.name || '',
    img: e.img || '',
    planTypeId: e.planTypeId || '',
    startTime: e.startTime || '',
    endTime: e.endTime || '',
    week: (e.week || []).map(Number),
    weekNames: (e.week || []).map(Number).map(d => WEEKDAY_NAMES[d] || `周${d}`),
    num: Number(e.num) || 0
  }))

  return {
    file: 'parsed/daily.json',
    data: {
      schemaVersion: 1,
      modelVersion: 'config-v1',
      plans,
      weekPlans,
      events
    }
  }
}
