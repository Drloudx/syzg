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
 * 取自客户端 `RelicDetailPanel.GetRelicCateName`：1 武器 / 2 法器 / 3 防器 / 4 护器。
 * 用于共鸣条件展示（如「武器 ×2 + 护器 ×1」）。
 */
const RELIC_CATEGORY_NAMES = {
  1: '武器',
  2: '法器',
  3: '防器',
  4: '护器'
}

const text = value => String(value ?? '').trim()

/**
 * 把 `{ {类别:数量}, ... }` 的共鸣条件转成可读文本，如「类别一 ×2 + 类别四 ×1」。
 * 键是 relicCategory 的数字字符串。
 */
const describeResonanceRequirement = requirement => Object.entries(requirement || {})
  .filter(([, count]) => Number(count) > 0)
  .map(([category, count]) => `${RELIC_CATEGORY_NAMES[category] || `分类${category}`} ×${count}`)
  .join(' + ')

/** base 遗器的等级化属性：[{ level, value(des 文本) }] */
const buildBaseLevels = relic => Object.entries(relic.baseAttribute || {})
  .map(([, entry]) => ({ level: Number(entry.lv) || 0, text: text(entry.des) }))
  .sort((a, b) => a.level - b.level)

/** core 遗器的等级化技能：[{ level, text(des 文本) }] */
const buildCoreLevels = relic => Object.entries(relic.skillTrigger || {})
  .map(([, entry]) => ({ level: Number(entry.lv) || 0, text: text(entry.des) }))
  .sort((a, b) => a.level - b.level)

const buildResonances = relic => (relic.resonances || []).map(entry => ({
  requirement: '{' + describeResonanceRequirement(entry.relicCategory) + '}',
  requirementParts: Object.entries(entry.relicCategory || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([cat, n]) => ({ category: Number(cat), categoryName: RELIC_CATEGORY_NAMES[cat] || `分类${cat}`, count: Number(n) })),
  text: text(entry.des),
  tag: entry.tag
}))

/** 由 relicDungeonInfo 得出「哪些遗器属于哪个秘境」——目前两套秘境共用同一批遗器 id。 */
const buildDungeons = info => Object.values(info).map(dungeon => ({
  id: dungeon.id,
  name: text(dungeon.name),
  pointItemId: dungeon.pointItemId || '',
  consumeItemId: dungeon.dungeonConsumeItemId || '',
  comment: text(dungeon._comment)
}))

const buildFapan = fapan => Object.values(fapan).map(entry => {
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

  const relics = Object.values(relicInfo).map(relic => {
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
      relicPoint: Number(relic.relicPoint) || 0,
      shape: { width: Number(relic.shape?.w) || 0, height: Number(relic.shape?.h) || 0 },
      // relicCategory：1~4（武器/法器/防器/护器）；核心遗器为 0/未配
      relicCategory: Number(relic.relicCategory) || 0,
      categoryName: RELIC_CATEGORY_NAMES[relic.relicCategory] || '',      energyPattern: Number.isFinite(Number(relic.energyPattern)) ? Number(relic.energyPattern) : null,
      levels,
      resonances: isCore ? buildResonances(relic) : [],
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
    if (a.category !== b.category) return a.category - b.category
    return a.name.localeCompare(b.name, 'zh')
  })

  // 掉落等级区间（relicGroup 是占位配置：baseRelics/coreRelics 用 baseA…coreD 占位，
  // 不对应真实 relicInfo.id，故只保留等级区间，不展开具体遗器）
  const dropTiers = Object.entries(relicGroup).map(([id, group]) => ({
    id,
    baseLevel: [Number(group.baseMin) || 0, Number(group.baseMax) || 0],
    coreLevel: [Number(group.coreMin) || 0, Number(group.coreMax) || 0]
  }))

  return {
    file: 'parsed/relics.json',
    data: {
      schemaVersion: 1,
      relics,
      fapan: buildFapan(relicFapan),
      dungeons: buildDungeons(relicDungeonInfo),
      dropTiers,
      categoryNames: RELIC_CATEGORY_NAMES
    }
  }
}
