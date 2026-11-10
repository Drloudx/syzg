/**
 * 遗器图鉴预解析：遗器本体（基础 / 核心）、法盘、秘境归属、共鸣与掉落。
 *
 * ## 数据来源
 *
 * | 表 | 用途 |
 * | --- | --- |
 * | `relicInfo` | 遗器本体：name / tip / des / icon / relicPoint / shape / relicCategory，
 *   以及 `type`（'base' 基础 / 'core' 核心）。属性在 `baseAttribute`（base）或
 *   `skillTrigger`（core）里，按 lv 1~5 给出 `des` 文本。 |
 * | `relicFapan` | 法盘：`fapanWidth × fapanHeight` 网格 + `fapanLockPoint`（被锁格子） |
 * | `relicDungeonInfo` | 秘境（sp1 亚空回廊 / sp2 瓦希什塔）名称与货币、称号 |
 * | `relicGroup` | 掉落的遗器等级区间（`baseMin/baseMax`），relicId 用的是 baseA…coreD 占位 |
 *
 * ## 关键判据
 *
 * - `relicInfo.type`：`base` = 基础遗器，`core` = 核心遗器（带技能触发 + 共鸣）。
 * - `relicInfo.relicCategory`：1~4，用于**共鸣条件**（`resonances[].relicCategory`
 *   是 {类别: 需要数量}）。
 * - `des` 在 core 里是内部 id（如 `core_101`），不是可读名 —— 可读名在 `name`。
 * - 掉落用的 `baseA/baseB…`、`coreA/coreB…` 是占位符，不对应 `relicInfo` 的 id，
 *   所以**不展开掉落明细**，只给秘境归属与等级区间。
 *
 * ## 图标
 * `icon` 指向 `Common_ItemIcon/<icon>.webp`（如 `item_phyAtk_1001`），与物品图标同目录。
 */
import { readJson } from './shared.mjs'

/**
 * 遗器分类（relicCategory）的可读名。
 *
 * **权威来源是 `lan.json` 的 `relic_type`：`"0,火属性,水属性,地属性,风属性"`**
 * （按逗号切分，下标即 relicCategory）。客户端 `SpRelicShowTip.GetRelicCateName`
 * 也优先读这条 lan 配置，硬编码只是兜底。
 *
 * 数据可自证：cat1 含「哈玛塔坎之爪 / 火属性伤害」、cat2 含「辛瓦特之泪 / 水属性伤害」、
 * cat3 含「阿娜希塔之碑 / 地属性伤害」、cat4 含「赫尔娜之笛 / 风属性伤害」。
 */
const DEFAULT_RELIC_CATEGORY_NAMES = {
  1: '火属性',
  2: '水属性',
  3: '地属性',
  4: '风属性'
}

/** 从 lan.json 读 relic_type 覆盖默认分类名（lan 结构：{ data: [ {name, desc_cn} ] }）。 */
const readRelicCategoryNames = () => {
  try {
    const lan = readJson('lan.json')
    const list = lan?.data || lan?.datas || []
    const entry = Array.isArray(list) ? list.find(item => item?.name === 'relic_type') : null
    const parts = String(entry?.desc_cn || '').split(',')
    const names = {}
    for (let i = 1; i < parts.length; i += 1) {
      const label = text(parts[i])
      if (label) names[i] = label
    }
    return Object.keys(names).length ? names : DEFAULT_RELIC_CATEGORY_NAMES
  } catch {
    return DEFAULT_RELIC_CATEGORY_NAMES
  }
}

const text = value => String(value ?? '').trim()

/**
 * 把 `{ {类别:数量}, ... }` 的共鸣条件转成可读文本，如「火属性 ×2 + 地属性 ×1」。
 * 键是 relicCategory 的数字字符串。`names` 由 buildRelicsFile 传入（lan 覆盖后的分类名）。
 */
const describeResonanceRequirement = (requirement, names) => Object.entries(requirement || {})
  .filter(([, count]) => Number(count) > 0)
  .map(([category, count]) => `${names[category] || `分类${category}`} ×${count}`)
  .join(' + ')

/** base 遗器的等级化属性：[{ level, value(des 文本) }] */
const buildBaseLevels = relic => Object.entries(relic.baseAttribute || {})
  .map(([, entry]) => ({ level: Number(entry.lv) || 0, text: text(entry.des) }))
  .sort((a, b) => a.level - b.level)

/** core 遗器的等级化技能：[{ level, text(des 文本) }] */
const buildCoreLevels = relic => Object.entries(relic.skillTrigger || {})
  .map(([, entry]) => ({ level: Number(entry.lv) || 0, text: text(entry.des) }))
  .sort((a, b) => a.level - b.level)

const buildResonances = (relic, names) => (relic.resonances || []).map(entry => ({
  requirement: '{' + describeResonanceRequirement(entry.relicCategory, names) + '}',
  requirementParts: Object.entries(entry.relicCategory || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([cat, n]) => ({ category: Number(cat), categoryName: names[cat] || `分类${cat}`, count: Number(n) })),
  text: text(entry.des),
  tag: entry.tag
}))

/**
 * 由 relicDungeonInfo 得出秘境列表 —— **过滤掉未开放的秘境**。
 *
 * 判据用 `activityList` 里同名活动的开放时间（与其它页面同一口径）：
 *   sp1 亚空回廊 = 2025-11-14 起，正常开放
 *   sp2 瓦希什塔 = startTime 2925-12-01（900 年后的占位值）→ 未开放，整章隐藏
 *
 * 不能按名字或 `spDungeonId` 硬编码，改用活动时间判断：以后官方把 sp2 定档，这里自动放行。
 */
const isDungeonOpen = (activity, dungeonId) => {
  if (!activity) return true // 没有对应活动配置的（如普通副本）默认视为开放
  if (activity.condition === 'false') return false
  if (activity.startTime && activity.startTime === activity.endTime) return false
  // 占位时间（年份 >= 2900）视为未定档
  const year = Number(String(activity.startTime || '').slice(0, 4))
  if (Number.isFinite(year) && year >= 2900) return false
  return true
}

const buildDungeons = (info, activityList) => Object.values(info)
  .filter(dungeon => isDungeonOpen(activityList?.[dungeon.id], dungeon.id))
  .map(dungeon => ({
    id: dungeon.id,
    name: text(dungeon.name),
    pointItemId: dungeon.pointItemId || '',
    consumeItemId: dungeon.dungeonConsumeItemId || '',
    comment: text(dungeon._comment)
  }))

/**
 * 遗器 → 它能在哪些秘境的「开箱池」里被开出（`useActionPara.spDungeonId` + `randomRelics`）。
 * 只统计**已开放**秘境，用来判断「某件遗器是否只在未开放副本里产出」。
 */
const buildRelicDungeonMap = (itemJson, openDungeonIds) => {
  const items = itemJson?.datas || itemJson || {}
  const map = new Map() // relicId -> Set<dungeonId>
  for (const entry of Object.values(items)) {
    const para = entry?.useActionPara
    if (!para || !Array.isArray(para.randomRelics)) continue
    const dungeonId = para.spDungeonId
    if (!dungeonId || !openDungeonIds.has(dungeonId)) continue
    for (const drop of para.randomRelics) {
      if (!drop?.relicId) continue
      if (!map.has(drop.relicId)) map.set(drop.relicId, new Set())
      map.get(drop.relicId).add(dungeonId)
    }
  }
  return map
}

const buildFapan = (fapan, openDungeonIds) => Object.values(fapan)
  // 只保留已开放秘境的法盘（未开放的整块隐藏，与 dungeons 同一口径）
  .filter(entry => !openDungeonIds || openDungeonIds.has(entry.fapanId))
  .map(entry => {
  const width = Number(entry.fapanWidth) || 0
  const height = Number(entry.fapanHeight) || 0
  const lockPoints = Array.isArray(entry.fapanLockPoint) ? entry.fapanLockPoint : []
  const locked = new Set(lockPoints.map(p => `${Number(p.x)},${Number(p.y)}`))
  /*
   * 逐格展开成 cells（行优先，共 width×height 个），页面直接按顺序画格子。
   * `fapanLockPoint` 是**被锁**的坐标；未列出的格子才可放置遗器。
   * 当前两套法盘都是 8×7、锁 34 格 → 可放置 20 格（中间 4×5 区域）。
   */
  const cells = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({ x, y, locked: locked.has(`${x},${y}`) })
    }
  }
  return {
    id: entry.fapanId,
    name: text(entry.fapanName),
    width,
    height,
    maxLevel: Number(entry.fapanMaxLevel) || 0,
    lockCount: lockPoints.length,
    openCount: cells.filter(cell => !cell.locked).length,
    cells
  }
})

export function buildRelicsFile() {
  const relicInfo = readJson('relicInfo.json').datas || readJson('relicInfo.json')
  const relicFapan = readJson('relicFapan.json').datas || readJson('relicFapan.json')
  const relicDungeonInfo = readJson('relicDungeonInfo.json').datas || readJson('relicDungeonInfo.json')
  const relicGroup = readJson('relicGroup.json').datas || readJson('relicGroup.json')
  const relicSetting = readJson('relicSetting.json').datas || readJson('relicSetting.json')
  const activityList = (readJson('activityList.json').datas || readJson('activityList.json')) || {}
  const itemJson = readJson('item.json')
  const categoryNames = readRelicCategoryNames()

  // 遗器 → 能在哪些【已开放】秘境开出。只在未开放副本（sp2）产出的遗器应当隐藏。
  const openDungeonIds = new Set(
    Object.values(relicDungeonInfo)
      .filter(dungeon => isDungeonOpen(activityList?.[dungeon.id], dungeon.id))
      .map(dungeon => dungeon.id)
  )
  const relicDungeonMap = buildRelicDungeonMap(itemJson, openDungeonIds)

  const relics = Object.values(relicInfo)
    /*
     * 只保留「在当前已开放秘境里能开出」的遗器。
     * 判据：该遗器出现在某个**已开放**秘境的 randomRelics 池里。
     * 例：petDmg_2001 / shield_2002 / petTime_2003 / killMana_2004 / skillDmg_2005 / core_109
     * 只在 sp2_yiwu* 的池子里，SP1 开不到 → 属于未开放的瓦希什塔秘境，隐藏。
     * 注意不是硬编码 id：官方开放 sp2 后，这些遗器会自动回到列表。
     */
    .filter(relic => relicDungeonMap.has(relic.id))
    .map(relic => {
    const isCore = relic.type === 'core'
    const levels = isCore ? buildCoreLevels(relic) : buildBaseLevels(relic)
    return {
      id: relic.id,
      type: relic.type,
      name: text(relic.name),
      // core 的 des 是内部 id，不可读；base 的 des 是属性名（如「物理攻击」）
      attributeName: isCore ? '' : text(relic.des),
      tip: text(relic.tip),
      icon: relic.icon || '',
      // relicPoint 官方字段名是「带出积分」（副本结算），不是法盘消耗
      relicPoint: Number(relic.relicPoint) || 0,
      shape: { width: Number(relic.shape?.w) || 0, height: Number(relic.shape?.h) || 0 },
      /*
       * 形状格子掩码：渲染「遗器占哪些格」用。
       * 官方 `RelicInfoSizeTempConf` 只有 w/h（**纯矩形**，source 里无额外形状字段），
       * 所以枚举 w×h 个格即可；将来若官方加了异形空格，这里改一行就能支持。
       */
      shapeCells: (() => {
        const w = Number(relic.shape?.w) || 0
        const h = Number(relic.shape?.h) || 0
        const cells = []
        for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) cells.push({ x, y })
        return cells
      })(),
      // relicCategory：1~4（火/水/地/风 属性，见 lan.relic_type）；核心遗器未配（0）
      relicCategory: Number(relic.relicCategory) || 0,
      categoryName: categoryNames[relic.relicCategory] || '',
      energyPattern: Number.isFinite(Number(relic.energyPattern)) ? Number(relic.energyPattern) : null,
      levels,
      resonances: isCore ? buildResonances(relic, categoryNames) : [],
      tags: Array.isArray(relic.tags) ? relic.tags.map(text) : [],

      /*
       * 下面这些字段是给**物品详情弹层**（ItemDetailModal）消费的。
       * 遗器在游戏里没有独立图鉴页，是嵌在「物品详情」形态里展示的；
       * 页面直接复用 ItemDetailModal，所以产物要长成「物品」的形状：
       *   - `img`：Common_ItemIcon 下的图标名（和 item.img 同一目录）
       *   - `desc`：描述文本（ItemDetailModal 的「描述」区块）
       *   - `quality`：官方 relicInfo 表**没有品质字段**，统一 0（不套品质色）
       *   - `itemType`：1 = 材料类；`equip` 给空对象避免走装备分支
       *   - `maxNum`：可堆叠上限（对应界面「可堆叠 (99)」）
       */
      img: relic.icon || '',
      desc: text(relic.tip),
      quality: 0,
      itemType: 1,
      maxNum: 99,
      equip: {},
      // ItemDetailModal 以 `item.typeId` 为身份键（评论、来源、嵌套跳转都靠它）
      typeId: relic.id,
      /*
       * ItemDetailModal 多处把 `item.category` 当**数字路径数组**（如 `[2, 21]`）使用，
       * 遗器的 relicCategory 是单个数字（1~4），语义不同，不能混用。
       * 这里给空数组，分类展示走上面的 `categoryName`。
       */
      category: []
    }
  }).sort((a, b) => {
    // 基础在前、核心在后；同类按分类、再按名字
    if (a.type !== b.type) return a.type === 'base' ? -1 : 1
    if (a.relicCategory !== b.relicCategory) return a.relicCategory - b.relicCategory
    return a.name.localeCompare(b.name, 'zh')
  })

  // 掉落等级区间（relicGroup 是占位配置：baseRelics/coreRelics 用 baseA…coreD 占位，
  // 不对应真实 relicInfo.id，故只保留等级区间，不展开具体遗器）
  const dropTiers = Object.entries(relicGroup).map(([id, group]) => ({
    id,
    baseLevel: [Number(group.baseMin) || 0, Number(group.baseMax) || 0],
    coreLevel: [Number(group.coreMin) || 0, Number(group.coreMax) || 0]
  }))

  /*
   * 法盘 / 遗器规则数值 —— 全部取自 `relicSetting.json`，不写死：
   *   maxCoreRelicNum   法盘最多放几种核心遗器（同名核心只能放 1 个）
   *   relicLevelUpCost  升级消耗几个同类遗器（= 同名可叠多少级的来源）
   *   fapanExp          法盘每级所需经验；总级数 = 键数量
   */
  const fapanExp = relicSetting?.fapanExp || {}
  const rules = {
    maxCoreRelicNum: Number(relicSetting?.maxCoreRelicNum) || 0,
    // 官方文案：relicLevelUpCost 是「升级需要消耗多少个同类型遗物来合成」
    levelUpCost: Number(relicSetting?.relicLevelUpCost) || 0,
    maxFapanLevel: Object.keys(fapanExp).length,
    // 首次进入法盘时默认已解锁的格子数 = 法盘等级 1（见客户端 GetRemainUnlockGridCount）
    initialOpenGrid: 1
  }

  return {
    file: 'parsed/relics.json',
    data: {
      schemaVersion: 1,
      relics,
      fapan: buildFapan(relicFapan, openDungeonIds),
      dungeons: buildDungeons(relicDungeonInfo, activityList),
      dropTiers,
      categoryNames,
      rules
    }
  }
}
