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
import { readJson } from './shared.mjs'

const table = v => v?.datas || v || {}

/** 周几（0=周日）→ 中文 */
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 条件规则 → { kind, label, target }；target 供前端做跳转 */
function parseCondition(conditionRes, condId) {
  const conf = conditionRes?.[condId]
  if (!conf) return { id: condId, text: '', links: [] }

  const links = []
  for (const rule of conf.rules || []) {
    if (rule.need === false) continue
    const para = rule.para || {}
    if (rule.type === 'passTask') {
      const stepText = Number(para.step) < 0 ? '通关' : `推进至第 ${para.step} 步`
      links.push({
        kind: 'task',
        targetId: para.typeId,
        label: `任务 ${para.typeId}（${stepText}）`,
        route: `/tasks?task=${encodeURIComponent(para.typeId)}`
      })
    } else if (rule.type === 'passBattle') {
      for (const b of para.battles || []) {
        links.push({
          kind: 'battle',
          targetId: b,
          label: `通关 ${b}`,
          route: `/dungeons?battle=${encodeURIComponent(b)}`
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
function collectMonsters(battleConf, roomRes) {
  const seen = new Map()
  for (const layer of battleConf.layers || []) {
    for (const layerData of layer.layerDatas || []) {
      for (const roomId of Object.keys(layerData.rooms || {})) {
        const roomTypeId = layerData.rooms[roomId].roomTypeId
        const battleData = roomRes?.[roomTypeId]?.battleData
        if (!battleData?.monRounds) continue
        for (const round of battleData.monRounds) {
          for (const m of round.mons || []) {
            const typeId = m.typeId
            if (!typeId) continue
            if (!seen.has(typeId)) {
              seen.set(typeId, { typeId, levelScale: m.levelScale ?? 1, rounds: 0 })
            }
            seen.get(typeId).rounds += 1
          }
        }
      }
    }
  }
  return [...seen.values()]
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

  /* ── ① 计划与子关卡 ── */
  const plans = []
  for (const [planId, plan] of Object.entries(dailyWork.plans || {})) {
    const stages = []
    for (const stage of plan.plan || []) {
      const battle = battleRes[stage.battle] || null
      const reward = battle ? parseReward(rewardRes, itemRes, battle.reward) : null
      const monsters = battle ? collectMonsters(battle, roomRes) : []

      stages.push({
        name: stage.name || '',
        des: stage.des || '',
        img: stage.img || '',
        battleId: stage.battle || '',
        condition: stage.condition ? parseCondition(conditionRes, stage.condition) : null,
        /* 关卡本体 */
        battleLevel: battle ? Number(battle.battleLevel) || 0 : 0,
        timeSeconds: battle ? Number(battle.time) || 0 : 0,
        battleName: battle?.name || '',
        battleDes: battle?.des || '',
        battleTip: battle?.tip || '',
        battleRoute: stage.battle ? `/dungeons?battle=${encodeURIComponent(stage.battle)}` : '',
        /* 怪物（typeId 已换成可查 mon.json 的类型 id） */
        monsters: monsters.map(m => {
          const info = monRes[m.typeId] || {}
          return {
            typeId: m.typeId,
            name: info.name || m.typeId,
            icon: info.icon || '',
            monRank: Number(info.monRank) || 0,
            levelScale: m.levelScale,
            rounds: m.rounds
          }
        }),
        reward
      })
    }

    plans.push({
      typeId: planId,
      name: plan.name || '',
      des: plan.des || '',
      img: plan.img || '',
      maxNum: Number(plan.maxNum) || 0,
      special: Boolean(plan.special),
      condition: plan.condition ? parseCondition(conditionRes, plan.condition) : null,
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
