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
        keywords: `${pet.name} ${elementName} ${pet.des || ''}`.toLowerCase()
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
