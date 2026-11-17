import { fetchWithFallback } from './request.js'
import { createCachedLoader } from './resourceClient.js'
import { ELEMENT_NAMES, getCleanSkillName } from './gameMappings.js'
import { resolvePlayablePlayerLevelCap } from './levelConfig.js'
import { isHiddenPet } from '../config/blacklist.js'

let cachedPets = null
let cachedPetLevel = null
let cachedPetSetting = null
let cachedPlayerLevelCap = 1

/**
 * 构建期纯函数：由原始 JSON 对象生成魔物图鉴最终数据。
 * 不依赖网络与浏览器，Node 构建脚本（scripts/parse/*.mjs）与浏览器共用。
 */
export function buildPetData(maps) {
  const { petRes, petLevelRes, petSettingRes, playerLevelRes, skillRes, skillTriggerRes } = maps

  const petDatas = petRes.datas || petRes || {}
  const petLevelDatas = petLevelRes.petLevel || petLevelRes || {}
  const petSettingDatas = petSettingRes || {}
  const skillDatas = skillRes.datas || skillRes || {}
  const skillTriggerDatas = skillTriggerRes.datas || skillTriggerRes || {}

  const processedPets = Object.entries(petDatas).map(([key, pet]) => {
      if (pet.hide === true) return null
      // 手工隐藏魔物（见 blacklist.js HIDDEN_PET_IDS）
      if (isHiddenPet(pet.monId || pet.typeId || key)) return null

      const typeId = pet.typeId || key
      const star = pet.star || 1
      const starDisplay = star + 2 // 3, 4, or 5 star
      const element = pet.element || 1
      
      const elementName = ELEMENT_NAMES[element] || '无'

      // Process mutant variants
      const variantsList = (pet.variants || []).map(v => ({
        type: v.type || 'a',
        chance: v.chance || 0,
        name: v.name || '变异',
        des: v.des || '',
        lifeTimeAdd: v.lifeTimeAdd || 0,
        sellPriceAdd: v.sellPriceAdd || 0
      }))
      /*
       * 变异：`variantChance`（配置值 0.2）在客户端只作**开关**用 —— 非 0 即可变异，
       * 客户端从不把它当概率参与运算或显示（`PicCenterPetTemp.Init` / `PicPetDetail.InitVariantButtons`
       * 均只判断 `!= 0f`）。真实孵化变异概率由服务端判定，反编译客户端与配置表均无法证实具体数值，
       * 故页面不展示百分比，仅以 0/非0 判定「可变异」。`variants[].chance` 亦未被客户端读取。
       */
      const variantChance = Number(pet.variantChance) || 0
      // 保留供将来确认口径后再展示；当前页面不渲染任何百分比
      const variantChancePercent = Math.round(variantChance * 1000) / 10

      // Process Skills
      const skillsList = []
      // 特性摘要（供表格视图），在下方解析到 trait 时填充
      let traitSummary = null
      // 0. Normal Attack (普攻)
      skillsList.push({
        id: `${typeId}_normal`,
        type: 'normal',
        name: `${pet.name}普攻`,
        icon: '', // No icon
        levelData: [
          {
            level: 1,
            name: `${pet.name}普攻`,
            des: `对单体目标造成 {100%攻击力} 加成的物理伤害。`
          }
        ],
        maxLevel: 1
      })

      // 1. Passive Feature / Trait (特性) - First
      if (pet.skillSp) {
        const trigger = skillTriggerDatas[pet.skillSp]
        if (trigger) {
          const levelData = []
          if (trigger.levelData) {
            Object.entries(trigger.levelData).forEach(([lvlKey, lvlVal]) => {
              levelData.push({
                level: parseInt(lvlKey),
                name: lvlVal.skillName || trigger.skillName || '特性',
                des: lvlVal.des || ''
              })
            })
          }
          const rawName = trigger.name || trigger.skillName || (levelData[0] && levelData[0].name) || '特性'
          skillsList.push({
            id: pet.skillSp,
            type: 'trait',
            name: getCleanSkillName(rawName),
            icon: `/images/PetPanel/pet_skill_${starDisplay}.webp`, // Frame border
            innerIcon: `/images/PicHandBookPanel_Atlas/${pet.monImg}.webp`, // Cropped inner face
            levelData,
            maxLevel: levelData.length
          })
          /*
           * 特性摘要：供「特性表格」视图使用。
           * `maxText` = 满级（7 级）文本；`rangeText` = 「1 级 → 7 级」的数值区间摘要
           * （例如「15% → 27%」）。区间取首末两级文本里 `{…}` 高亮片段；两级的片段数量/顺序
           * 不一致时退化为整段文本，避免给出错误对照。
           */
          const pctOf = text => [...String(text || '').matchAll(/\{([^}]+)\}/g)].map(m => m[1])
          const firstPct = pctOf(levelData[0]?.des)
          const lastPct = pctOf(levelData[levelData.length - 1]?.des)
          /*
           * 只列出**确实随等级变化**的数值（首级 ≠ 满级）。
           * 「100%→100%」这类恒定值对读者没信息量，剔除。
           * 两级的高亮片段数量/顺序不一致时不生成区间，避免错配。
           */
          const changed = firstPct.length && firstPct.length === lastPct.length
            ? firstPct.map((v, i) => [v, lastPct[i]]).filter(([a, b]) => a !== b)
            : []
          const rangeText = changed.map(([a, b]) => `${a} → ${b}`).join('，')
          traitSummary = {
            name: getCleanSkillName(rawName),
            maxText: levelData[levelData.length - 1]?.des || '',
            rangeText
          }
        }
      }

      // 2. Active Skills (Skill 1 and Skill 2)
      const activeSkillIds = [pet.skill1, pet.skill2]
      const activeSkillIcons = [pet.skill1Icon, pet.skill2Icon]
      activeSkillIds.forEach((skillId, index) => {
        if (skillId) {
          const s = skillDatas[skillId] || skillTriggerDatas[skillId]
          if (s) {
            const levelData = []
            if (s.levelData) {
              Object.entries(s.levelData).forEach(([lvlKey, lvlVal]) => {
                levelData.push({
                  level: parseInt(lvlKey),
                  name: lvlVal.skillName || s.name || '技能',
                  des: lvlVal.des || '',
                  cd: lvlVal.cd || 0,
                  cost: lvlVal.cost || 0
                })
              })
            }
            
            let iconName = activeSkillIcons[index] || `skill_${skillId}`
            // 图片已统一为 .webp；若配置里已带扩展名则保留（兼容旧配置）
            if (!/\.(?:png|jpe?g|webp)$/i.test(iconName)) {
              iconName += '.webp'
            }

            const rawName = s.name || s.skillName || (levelData[0] && levelData[0].name) || '技能'
            skillsList.push({
              id: skillId,
              type: 'active',
              name: getCleanSkillName(rawName),
              icon: `/images/Common_SkillIcon/${iconName}`,
              levelData,
              maxLevel: levelData.length
            })
          }
        }
      })

      return {
        id: typeId,
        name: pet.name,
        des: pet.des || '',
        monImg: pet.monImg,
        eggImg: pet.eggImg,
        star,
        starDisplay,
        element,
        elementName,
        variants: variantsList,
        hasVariant: variantsList.length > 0,
        // 特性摘要（表格视图用）：{ name, maxText(满级文本), rangeText(1→7 级区间) }
        trait: traitSummary,
        // 变异开关（配置值；非 0 即可变异）。具体概率服务端判定，页面不展示百分比
        variantChance,
        variantChancePercent,
        skills: skillsList,
        // Base stats
        atk: pet.atk || 0,
        atkMin: pet.atkMin || 0,
        atkMax: pet.atkMax || 0,
        def: pet.def || 0,
        defMin: pet.defMin || 0,
        defMax: pet.defMax || 0,
        hp: pet.hp || 0,
        hpMin: pet.hpMin || 0,
        hpMax: pet.hpMax || 0,
        dex: pet.dex || 0,
        dexMin: pet.dexMin || 0,
        dexMax: pet.dexMax || 0,
        // Hatching stats
        eggTime: pet.eggTime || 0,
        sellPrice: pet.sellPrice || 0,
        exp: pet.exp || 0,
        petCd: pet.petCd || 0,
        roomCd: pet.roomCd || 0,
        lifeTime: pet.lifeTime || 0,
        keywords: [
          pet.name,
          elementName,
          `${elementName}属性`,
          `${starDisplay}星`,
          `${starDisplay}★`,
          variantChance > 0 ? '可变异 变异' : '',
          pet.des || '',
          traitSummary ? `${traitSummary.name} ${traitSummary.maxText} ${traitSummary.rangeText || ''}` : '',
          skillsList.map(s => `${s.name} ${s.levelData ? s.levelData.map(l => l.des).join(' ') : ''}`).join(' ')
        ].filter(Boolean).join(' ').replace(/[{}\[\]]/g, ' ').toLowerCase()
      }
    }).filter(Boolean)

  return {
    pets: processedPets,
    petLevel: petLevelDatas,
    petSetting: petSettingDatas,
    playerLevelCap: resolvePlayablePlayerLevelCap(playerLevelRes)
  }
}

/**
 * 魔物图鉴数据加载：读取构建期预解析的 parsed/pets.json。
 */
export const fetchPetData = createCachedLoader(async () => {
  if (cachedPets) {
    return {
      pets: cachedPets,
      petLevel: cachedPetLevel,
      petSetting: cachedPetSetting,
      playerLevelCap: cachedPlayerLevelCap
    }
  }

  const parsed = await fetchWithFallback('data/parsed/pets.json')
  cachedPets = parsed.pets
  cachedPetLevel = parsed.petLevel
  cachedPetSetting = parsed.petSetting
  cachedPlayerLevelCap = parsed.playerLevelCap || 1
  return parsed
})

/**
 * 返回魔物变异在 `des` 之外需要补充展示的效果文案列表。
 * `des` 已包含驻场/上场时间说明时不重复追加 `lifeTimeAdd`（如圣骑士史莱姆、青铜迷迷可）。
 */
export function getPetVariantExtraEffects(variant) {
  if (!variant) return []
  const extras = []
  const des = String(variant.des || '').trim()
  const lifeTimeAdd = Number(variant.lifeTimeAdd) || 0
  const sellPriceAdd = Number(variant.sellPriceAdd) || 0
  if (lifeTimeAdd > 0 && !/(?:驻场|上场)时间/.test(des)) {
    extras.push(`上场时间增加 +${lifeTimeAdd}秒`)
  }
  if (sellPriceAdd > 0) {
    extras.push(`售价增加 +${sellPriceAdd}`)
  }
  return extras
}

/**
 * 计算魔物特性（Trait）各等级培育阶梯数据（Lv.1 ~ Lv.7）。
 * 数据源：petSetting.petTjExp[star]
 * @param {number} star 魔物星级 (1, 2, 3)
 * @param {Object} petSetting 配置表中的 petSetting 对象
 * @returns {{ tiers: Array, totalHatch: number }}
 */
export function getPetTraitTiers(star, petSetting) {
  if (!petSetting || !petSetting.petTjExp) {
    return { tiers: [], totalHatch: 0 }
  }
  const starTj = petSetting.petTjExp[String(star)] || petSetting.petTjExp[star] || {}
  let cumulative = 0
  const tiers = []

  for (let lvl = 1; lvl <= 7; lvl++) {
    const cost = Number(starTj[String(lvl - 1)] ?? starTj[lvl - 1]) || 0
    cumulative += cost
    tiers.push({
      level: lvl,
      label: `Lv.${lvl}`,
      cost,
      cumulative,
      costLabel: lvl === 1 ? '初始获得' : `+${cost}只`,
      cumLabel: `累积${cumulative}只`,
      isMax: lvl === 7
    })
  }

  return {
    tiers,
    totalHatch: cumulative
  }
}

/**
 * 计算魔物主动技能或队伍被动的各等级突破阶梯（Lv.1 ~ Lv.4）。
 * 数据源：petSetting.petTpExp[star]
 * 魔物共有 6 阶突破（+1 ~ +6），技能1 与 技能2（队伍被动）交替提升：
 *   - activeIndex 0 (技能1)：突破 +1, +3, +5 阶分别升至 Lv.2, Lv.3, Lv.4
 *   - activeIndex 1 (队伍被动)：突破 +2, +4, +6 阶分别升至 Lv.2, Lv.3, Lv.4
 *
 * 突破只能逐阶 +1、不可跳阶（`PetBagPanelUI.GetAddTpLevel` / `PetServerData.GetCurTpExp`
 * 均按 petTpExp 顺序扣阈值）。因此升到某阶的「累计消耗」= petTpExp 的**前缀和**
 * （含全部前序阶段），而不是只累加本技能跳到的几阶。技能本身不能单独升级，
 * 只能跟随 tpLevel 提升（`ExtentionMethod.GetPetSkillLevel` / `GetPetPaSkillLevel`）。
 * @param {number} star 魔物星级 (1, 2, 3)
 * @param {Object} petSetting 配置表中的 petSetting 对象
 * @param {number} activeIndex 0 表示主动技能1，1 表示队伍被动技能2
 * @returns {{ tiers: Array, totalSkillCost: number, totalPetBreakthroughCost: number }}
 */
export function getPetActiveSkillTiers(star, petSetting, activeIndex = 0) {
  if (!petSetting || !petSetting.petTpExp) {
    return { tiers: [], totalSkillCost: 0, totalPetBreakthroughCost: 0 }
  }
  const starTp = petSetting.petTpExp[String(star)] || petSetting.petTpExp[star] || {}
  const steps = activeIndex === 1 ? [1, 3, 5] : [0, 2, 4]

  // 每一阶的突破消耗（petTpExp 为 tpLevel 逐阶阈值）
  const stageCosts = []
  for (let s = 0; s < 6; s++) {
    stageCosts.push(Number(starTp[String(s)] ?? starTp[s]) || 0)
  }
  // 到达某阶的累计消耗（含全部前序阶段，突破不可跳阶）
  const prefix = []
  let running = 0
  for (let s = 0; s < 6; s++) {
    running += stageCosts[s]
    prefix.push(running)
  }
  const totalPetBreakthroughCost = prefix[5]

  const tiers = [
    {
      level: 1,
      label: 'Lv.1',
      stage: 0,
      stageLabel: '初始解锁',
      cost: 0,
      cumulative: 0,
      costLabel: '初始无需突破',
      cumLabel: '消耗 0',
      isMax: false
    }
  ]

  steps.forEach((stepIdx, idx) => {
    const cost = stageCosts[stepIdx]
    const cumulative = prefix[stepIdx]
    const lvl = idx + 2
    const stage = stepIdx + 1
    tiers.push({
      level: lvl,
      label: `Lv.${lvl}`,
      stage,
      stageLabel: `突破+${stage}阶`,
      cost,
      cumulative,
      costLabel: `${cost}只`,
      cumLabel: `累计消耗 ${cumulative}只`,
      isMax: lvl === 4
    })
  })

  // 该技能满级所需累计消耗 = 满级所在阶的前缀和（前序阶无法跳过，必须一并突破）
  const totalSkillCost = prefix[steps[steps.length - 1]]

  return {
    tiers,
    totalSkillCost,
    totalPetBreakthroughCost
  }
}

/**
 * 魔物 6 阶全景突破路线图（Breakthrough Roadmap）。
 * @param {number} star 魔物星级 (1, 2, 3)
 * @param {Object} petSetting 配置表
 * @param {string} s1Name 技能1名称
 * @param {string} s2Name 技能2（队伍被动）名称
 * @param {number} currentActiveIndex 当前激活的技能索引 (0 或 1)
 * @returns {Array} 6 个阶段的路线图对象
 */
export function getPetBreakthroughRoadmap(star, petSetting, s1Name = '技能', s2Name = '队伍被动', currentActiveIndex = 0) {
  if (!petSetting || !petSetting.petTpExp) return []
  const starTp = petSetting.petTpExp[String(star)] || petSetting.petTpExp[star] || {}
  const roadmap = []
  let cumulative = 0

  for (let step = 0; step < 6; step++) {
    const cost = Number(starTp[String(step)] ?? starTp[step]) || 0
    cumulative += cost
    const isS1 = step % 2 === 0
    const targetLevel = Math.floor(step / 2) + 2
    const skillIndex = isS1 ? 0 : 1
    roadmap.push({
      stepIndex: step,
      stage: step + 1,
      stageLabel: `+${step + 1}阶`,
      cost,
      cumulative,
      costLabel: `消耗 ${cost}只`,
      skillType: isS1 ? 'active' : 'party',
      skillTypeName: isS1 ? '主动技能' : '队伍被动',
      skillName: isS1 ? s1Name : s2Name,
      targetLevel,
      targetLevelLabel: `Lv.${targetLevel}`,
      isCurrentSkillTarget: skillIndex === currentActiveIndex
    })
  }

  return roadmap
}

/**
 * 魔物检索文本聚合（WeakMap 缓存）。
 * @param {object} pet 魔物对象
 * @param {object} [options]
 * @param {boolean} [options.includeSkills=true] 是否包含主动/被动技能（特性表格视图应为 false，避免未展示技能产生误解）
 */
const petSearchTextCache = new WeakMap()
export function getPetSearchText(pet, { includeSkills = true } = {}) {
  if (!pet || typeof pet !== 'object') return ''
  const cacheKey = includeSkills ? 'all' : 'traitOnly'
  let cachedMap = petSearchTextCache.get(pet)
  if (!cachedMap) {
    cachedMap = {}
    petSearchTextCache.set(pet, cachedMap)
  }
  if (cachedMap[cacheKey]) return cachedMap[cacheKey]

  const traitTexts = []
  if (pet.trait) {
    if (pet.trait.name) traitTexts.push(pet.trait.name)
    if (pet.trait.maxText) traitTexts.push(pet.trait.maxText)
    if (pet.trait.rangeText) traitTexts.push(pet.trait.rangeText)
  }

  const skillTexts = []
  if (includeSkills && Array.isArray(pet.skills)) {
    for (const s of pet.skills) {
      if (s.name) skillTexts.push(s.name)
      if (Array.isArray(s.levelData)) {
        for (const l of s.levelData) {
          if (l.des) skillTexts.push(l.des)
          if (l.name && l.name !== s.name) skillTexts.push(l.name)
        }
      }
    }
  }

  const raw = [
    pet.name,
    pet.elementName,
    `${pet.elementName}属性`,
    `${pet.starDisplay}星`,
    `${pet.starDisplay}★`,
    pet.hasVariant ? '可变异 变异' : '',
    pet.des,
    ...traitTexts,
    ...skillTexts
  ].filter(Boolean).join(' ')

  const text = raw.replace(/[{}\[\]]/g, ' ').toLowerCase()
  cachedMap[cacheKey] = text
  return text
}

