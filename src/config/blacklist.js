/**
 * 全局隐藏/黑名单配置文件 (Global Blacklist Config)
 *
 * 开发者在此数组中添加条目【名称】或【ID】，即可全局自动隐藏对应的条目。
 * 作用范围涵盖：全局搜索下拉、角色图鉴、装备图鉴、成就查询、食谱配方、魔物收益及构建索引等。
 */

// 1. 模糊匹配名单 (只要名称中包含该关键字即隐藏)
export const FUZZY_BLACKLIST = [
    //成就相关
    '未使用',
    //物品图鉴去掉测试相关
    '测试',
    '（废弃）',
    '契约感谢',
    //魔物图鉴和被隐藏的物品
    '黑森林',
    '霜烬平原',
    '黑森林/霜烬平原',
    //特殊章节
    // 幽夜古堡（SP1）已按需求端上（开放），不再隐藏；黏滑溪谷（SP2）仍未开放，整章隐藏。
    '黏滑溪谷',

]
// 2. 精确匹配名单 (ID、typeId 或 完整名称 必须完全匹配才隐藏)
export const EXACT_BLACKLIST = [
    //物品图鉴乱七八糟的物品
    // 希尔旧版获取道具不进入网页图鉴；原始 JSON 保留。
    'item_59001',
    'item_5900101',
    'item_5900102',
    // 阿迪拉（hero_047）的角色碎片，二测未实装
    'item_59047',
    // 铜宝箱/铜钥匙/破旧宝箱：demo 任务链掉落，按约定隐藏
    'item_20001',
    'item_20002',
    'item_20005',
    '11皮',
    '11布',
    '11重分解',
    '12重',
    '21重',
    '22重',
    '全部基础材料',
    '道具药水食物',
    '家具',
    '人物+宠物',
    'c1装备',
    'c2装备',
    'c3装备',
    'C1~C3家具宝箱',
    '全种子各类代币属性碎片',
    'item_26008x',
    'item_26009x',
    '坚韧的板材',
    '自由委托印章',
    //没出的食谱
    '松茸鲜汤',
    '松茸肉汤面',
    '莲香肉干',
    '冰莲火腿三明治',
    //成就
    '坐牢模拟器',
    '冰原老司机',
    '菌毯清洁大师',
    '蓝伞伞，躺板板',
    '赫淮斯托斯',
    '扫黑除恶',
    '来吧！灵魂森友会',
    '否定使命之人',
    '黑森林探索者',
    '霜烬平原探索者',
    '制裁魔女之人',
    '献出心脏',
    '你甚至不愿意叫我一声老大',
    '超绝最可爱天界格莉姆',
   //特殊物品
    '【未使用】石镐',
    '蕈人孢子簇',
    '魔花花瓣',
    '熔火结晶',
    '冰莲种子',
    '冰莲',
    '提纯的冰晶',
    '寒冰粉',
    '寒冰爆桶',
    '熔火护盾',
    //家具图纸：这几类是通用分类图（非具体家具），按用户要求隐藏
    '桌子类制作图',
    '凳子类制作图',
    '书架类制作图',
    /*
     * 奶油布丁史莱姆（pet_098）—— 已按需求取消隐藏。
     * 它 1 星 / 地属性 / 可变异（variantChance 0.2），是正常魔物。
     * 曾以「魔物蛋：奶油布丁史莱姆的蛋」为由列入黑名单，现恢复显示。
     */
    // 'pet_098',
    /*
     * SP2「黏滑溪谷」专属物品（18 件）。
     *
     * 该章节活动 `activityList.sp2` 的 startTime 写的是 2925-12-01（占位，900 年后），
     * 与菲娜试用活动同一套路 —— 内容**未开放**，怪物/关卡都已被隐藏，
     * 但物品本身没被连带过滤，会以「无图标」的裸条目出现在物品图鉴里。
     *
     * 必须用 ID 精确匹配：这些物品的名字（「…制作图」「…宝箱」）与正式物品重名，
     * 按名字模糊匹配会误伤。清单来源：遍历 reward 表，
     * 只在 `sp2 / ex02 / 黏滑` 来源出现的物品。
     */
    'item_10122', // 黏黏菇
    'item_10123', // 虹彩果
    'item_20036', // 秘境挑战之证
    /*
     * 回廊宝箱有 6 个同名条目：3 种外观（木/铜边/银）× 2 套副本（SP1 幽夜古堡 / SP2 黏滑溪谷）。
     * SP1 已开放，保留 item_20029/20030/20031；这里只隐藏 SP2 那 3 个。
     */
    'item_20037', // 回廊宝箱（木箱，SP2）
    'item_20038', // 回廊宝箱（铜边，SP2）
    'item_20039', // 回廊宝箱（银箱，SP2）
    'item_50204', // 公主野营帐篷制作图
    'item_50208', // 草莓挂灯制作图
    'item_50210', // 民家田野挂画制作图
    'item_50213', // 滴答落地灯制作图
    'item_50214', // 黏液拱门制作图
    'item_50215', // 胶质小椅制作图
    'item_50217', // 胶质床头柜制作图
    'item_50218', // 黏糊糊公主御榻制作图
    'item_50220', // 嫩绿懒人沙发制作图
    'item_50221', // 胶质小凳制作图
    'item_50224', // 黏糊糊长沙发制作图
    'item_50225', // 史莱姆王国御座制作图
    'item_50226', // 史莱姆摆件制作图
    'item_52007', // 黏糊糊城堡外观套组
    /*
     * SP2 遗器三件套 + 秘境货币。
     *
     * 与 SP1 的差异只在用字（SP1「遗器」，SP2「遗物」），名字极易混淆：
     *   sp1_yiwu / _base / _core → 神秘遗器…（亚空回廊·特异次元，SP1，已开放，保留）
     *   sp2_yiwu / _base / _core → 神秘遗物…（瓦希什塔秘境，SP2，未开放，隐藏）
     * 归属判据是 `useActionPara.spDungeonId` 为 'sp2'。
     * `item_29202` 粘液之符 = SP2 秘境货币（对照 SP1 的 item_29201 夜之符）。
     */
    'sp2_yiwu',
    'sp2_yiwu_base',
    'sp2_yiwu_core',
    'item_29202', // 粘液之符（瓦希什塔秘境的古代符）
    /*
     * SP2 专属料理（用 SP2 食材 item_10122 黏黏菇 / item_10123 虹彩果 做成）。
     * 上面那 18 件是「按 reward 表反查」得到的，不含**料理成品**——
     * 料理是 menu.json 里的配方产出，不在 reward 表出现，故单列。
     */
    'item_30055', // 香煎黏黏菌菇
    'item_30056', // 虹彩可丽饼

]

/**
 * 「官方奖励池配错」的物品 —— 详情页不显示「开启奖励」区块。
 *
 * 这 5 个都是**材料 / 入场券**，本身没有开启奖励，但官方 item 表把它们的
 * `useActionPara.reward` 错填成了 `relic_sp1_explore_c1`（幽夜古堡的
 * 「通关简普通」结算池：小钱袋 / 神秘遗器 / 装备）。照实渲染会显示
 * 一整套跟物品毫无关系的掉落，误导玩家。
 *
 * 用显式 ID 名单而非「按 reward.tip 前缀判断」—— tips 是策划文案，随时会改，
 * 拿它当判据会在下次数据更新时静默失效。
 */
export const BROKEN_REWARD_POOL_ITEM_IDS = Object.freeze([
    'item_20032', // 湛蓝回忆拼图（替代 3 星伙伴回忆拼图激活星阶）
    'item_20033', // 靛紫回忆拼图（替代 4 星伙伴回忆拼图激活星阶）
    'item_20034', // 灿金回忆拼图（替代 5 星伙伴回忆拼图激活星阶）
    'item_20035', // 回廊挑战之证（进入亚空回廊·特异次元）
    'item_20036'  // 秘境挑战之证（进入瓦希什塔秘境）
])

const BROKEN_REWARD_POOL_SET = new Set(BROKEN_REWARD_POOL_ITEM_IDS)

/** 该物品的「开启奖励」是否为官方配错，应当不显示。 */
export const hasBrokenRewardPool = (itemOrId) => {
    const id = typeof itemOrId === 'object' && itemOrId !== null
        ? String(itemOrId.typeId ?? itemOrId.id ?? '')
        : String(itemOrId ?? '')
    return BROKEN_REWARD_POOL_SET.has(id)
}

/**
 * 手动维护的「隐藏角色」名单 —— 全站唯一入口。
 *
 * 这里的角色在**所有出口**统一隐藏：角色图鉴、伙伴邮件、任务图鉴（含好感度事件）、
 * 词条「来源角色」、全局搜索、相关模拟、模拟招募。
 * 页面不要再各自复制规则，统一调 `isHiddenHero(id)`。
 *
 * ## 为什么需要手工名单，而不是靠 `hero.hide`
 * `hero.hide` 是官方「图鉴不显示」标记，但官方有时未给未实装/预埋角色标上 `hide`
 * （如曾列入的 hero_059 菲娜、hero_070 露库希安、hero_047 阿迪拉，均已按需求解除隐藏）。
 * 后续若需隐藏「有完整数据但玩家暂不可得」的角色，仍统一在此名单维护。
 *
 * ## 只隐藏「角色相关」，不隐藏其它
 * 判定只看角色 id，不做名字模糊匹配 —— 避免误伤同名物品/任务。
 */
export const HIDDEN_HERO_IDS = Object.freeze([
    'hero_059', // 菲娜：2026-11-13 按需求重新隐藏
    'hero_070', // 露库希安：2026-11-13 按需求重新隐藏
    // hero_047 阿迪拉：2026-11-11 按需求解除隐藏（1.7.15 官方已解除 hide）
])

const HIDDEN_HERO_SET = new Set(HIDDEN_HERO_IDS)

/**
 * 是否属于「手工隐藏角色」。
 * @param {string} heroId 角色 id（如 `hero_047`）；也接受只含 id 的对象
 */
export const isHiddenHero = (heroId) => {
    const id = typeof heroId === 'object' && heroId !== null
        ? String(heroId.id ?? heroId.typeId ?? '')
        : String(heroId ?? '')
    return HIDDEN_HERO_SET.has(id)
}

/**
 * 判定一条**任务/邮件/词条**是否归属于隐藏角色。
 *
 * 不同产物的「角色归属」字段不同，这里统一收口：
 *   · 邮件：`heroTypeId`
 *   · 好感度任务：id 形如 `fav_hero_047_1`
 *   · 词条的来源角色：直接传 id
 * 命中任一即视为归属隐藏角色。
 */
export const belongsToHiddenHero = (entry) => {
    if (!entry) return false
    if (typeof entry === 'string') return isHiddenHero(entry)
    const direct = entry.heroTypeId ?? entry.heroId ?? entry.hero_id ?? entry.typeId ?? entry.id
    if (direct && isHiddenHero(direct)) return true
    // 好感度任务 id：fav_hero_047_1 → hero_047
    const idStr = String(entry.id ?? entry.typeId ?? '')
    const m = /^fav_hero_(\d+)(?:_|$)/.exec(idStr)
    if (m) return isHiddenHero('hero_' + m[1].padStart(3, '0'))
    return false
}

/**
 * 手动维护的「隐藏魔物」名单 —— 与角色名单同口径、同入口。
 *
 * 这些魔物在**所有出口**统一隐藏：魔物图鉴、魔物蛋图鉴、魔物收益、全局搜索。
 * 页面统一调 `isHiddenPet(id)`，不要各自复制规则。
 *
 * 判据是魔物 id（`pet` 表的 `monId` / `typeId`），不做名字模糊匹配。
 */
export const HIDDEN_PET_IDS = Object.freeze([
    'pet_105', // 玉鳞之仙龙
])

const HIDDEN_PET_SET = new Set(HIDDEN_PET_IDS)

/**
 * 是否属于「手工隐藏魔物」。
 * @param {string} petId 魔物 id（如 `pet_105`）；也接受只含 id 的对象
 */
export const isHiddenPet = (petId) => {
    const id = typeof petId === 'object' && petId !== null
        ? String(petId.id ?? petId.monId ?? petId.typeId ?? '')
        : String(petId ?? '')
    return HIDDEN_PET_SET.has(id)
}

/**
 * 校验目标条目是否属于全局黑名单
 * @param {Object|string|number} item 支持 { id, name, typeId } 对象或字符串/数字
 * @returns {boolean} true 表示属于黑名单(应当被隐藏)
 */
export const isBlacklisted = (item) => {
  if (item === null || item === undefined) return false

  let idStr = ''
  let nameStr = ''

  if (typeof item === 'object') {
    idStr = item.id !== undefined && item.id !== null ? String(item.id).trim() : ''
    if (!idStr && item.typeId) {
      idStr = String(item.typeId).trim()
    }
    const parts = [
      item.name,
      item.desc,
      item.tip,
      item.source,
      item.label,
      item.keywords,
      ...(item.category || []),
      ...(item.categories || []),
      ...(item.place || []),
      ...(item.mark || [])
    ].filter(Boolean).map(s => String(s).trim())
    nameStr = parts.join(' ')
  } else {
    const s = String(item).trim()
    idStr = s
    nameStr = s
  }

  // 1. 优先检查精确匹配
  const isExactMatch = EXACT_BLACKLIST.some(rule => {
    if (rule === null || rule === undefined) return false
    const ruleStr = String(rule).trim().toLowerCase()
    if (!ruleStr) return false

    if (idStr && idStr.toLowerCase() === ruleStr) return true
    
    // 精确匹配只校验名称本身，不能校验拼合后的 nameStr
    if (typeof item === 'object') {
      if (item.name && String(item.name).trim().toLowerCase() === ruleStr) return true
    } else {
      if (nameStr && nameStr.toLowerCase() === ruleStr) return true
    }
    
    return false
  })

  if (isExactMatch) return true

  // 2. 检查模糊匹配
  const isFuzzyMatch = FUZZY_BLACKLIST.some(rule => {
    if (rule === null || rule === undefined) return false
    const ruleStr = String(rule).trim().toLowerCase()
    if (!ruleStr) return false

    if (nameStr && nameStr.toLowerCase().includes(ruleStr)) return true
    return false
  })

  return isFuzzyMatch
}

/**
 * ─────────── 装备品阶隐藏 ───────────
 *
 * 装备的「阶」对应数据里的 `item.equip.equipLevel`（1~5）。
 * 在此数组填入要**隐藏**的品阶，以下三处一并生效：
 *   1. 物品图鉴 → 装备子类（`ItemsView`）
 *   2. 装备图鉴（`EquipsView`）
 *   3. 设施功能 → 锻造台 → 装备打造（`FacilitiesView`，按配方产出物的阶过滤）
 *
 * 例：`[4, 5]` = 隐藏 4 阶与 5 阶装备；`[]` = 全都不隐藏。
 *
 * 注意：只影响**装备**（`category` 含 4）。符石也有「1阶~6阶」，但走 `category[1]=71~76`，
 * 与 `equipLevel` 无关，不受本数组影响。
 */
export const HIDDEN_EQUIP_TIERS = [4, 5]

/** 品阶取值范围（与游戏 equipLevel 一致） */
export const EQUIP_TIER_RANGE = [1, 2, 3, 4, 5]

/**
 * 该装备是否属于被隐藏的品阶。
 * @param {Object} item 物品条目（需含 category / equip）
 * @returns {boolean} true 表示应被隐藏
 */
export const isEquipTierHidden = (item) => {
  if (!item) return false
  // 非装备不受影响
  const cats = item.category || item.categories || []
  if (!cats.map(String).includes('4')) return false
  const tier = Number(item.equip?.equipLevel)
  if (!Number.isFinite(tier)) return false
  return HIDDEN_EQUIP_TIERS.map(Number).includes(tier)
}

/** 可见的品阶列表（用于筛选行渲染，已排除被隐藏的） */
export const visibleEquipTiers = () =>
  EQUIP_TIER_RANGE.filter(t => !HIDDEN_EQUIP_TIERS.map(Number).includes(t))

/**
 * ─────────── 设施配方可见性 ───────────
 *
 * 设施页（`FacilitiesView`）在渲染前会把配方过两道闸：产出物/任一材料命中黑名单，
 * 以及装备打造模式下被隐藏的品阶。**其他页面在生成「前往设施」链接时必须用同一个判据**，
 * 否则会出现「物品详情写着可以打造、点过去是一个空列表」的死链。
 *
 * 已知的两类死链（2026-10-06 实测）：
 *   1. 4/5 阶装备（`HIDDEN_EQUIP_TIERS`）——物品详情的「查看锻造台」带着 `level=4` 跳过去，
 *      而设施页的等级筛选行已经不含 4 阶，落地即空；
 *   2. 产出物或材料被黑名单隐藏的配方（如「熔火护盾」「燃烧炼金炸弹」）——配方本身被过滤。
 *
 * 注意本函数只回答「这条配方在设施页是否会出现」，**不含**等级筛选（那是页面交互状态）。
 *
 * @param {Object} recipe 设施配方；装备配方用 `equipLevel`，普通配方用 `level`
 * @returns {boolean} true 表示该配方会被设施页隐藏（不应据此生成可点的「前往」）
 */
export const isFacilityRecipeHidden = (recipe) => {
  if (!recipe) return true
  if (isBlacklisted({ id: recipe.output?.typeId, name: recipe.output?.name })) return true
  if ((recipe.materials || []).some(m => isBlacklisted({ id: m.typeId, name: m.name }))) return true
  // 装备打造：物品详情的 `smithing.recipes` 用 `equipLevel`，设施产物的装备配方用 `mode+level`
  const isEquipment = recipe.mode === 'equipment' || recipe.equipLevel != null
  const level = Number(recipe.equipLevel ?? recipe.level)
  if (isEquipment && HIDDEN_EQUIP_TIERS.map(Number).includes(level)) return true
  return false
}
