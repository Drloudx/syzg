import { fetchWithFallback } from './request.js'
import { createCachedLoader } from './resourceClient.js'
import { getItemImageUrl, roundToEven } from './itemParser.js'
import { resolvePlayablePlayerLevelCap } from './levelConfig.js'
import { JOB_NAMES, ELEMENT_NAMES, BASE_REWARD_ICONS, REWARD_MODE_INFO, getCleanSkillName, cleanDialogueBase } from './gameMappings.js'
import { buildSkillMechanics, buildTalentMechanics, buildSummonMechanics, resolveSummonConfig, resolveSummonConfigs } from './heroMechanics.js'
import { buildPartnerMailboxes, parseHeroMail } from './partnerMailData.js'
import { describeBuff } from './buffParser.js'
import { isHiddenHero } from '../config/blacklist.js'

let cachedHeroes = null
let cachedMailboxes = null
let cachedHeroLevel = null
let cachedHeroRank = null
let cachedHeroConsume = null
let cachedPlayerLevelCap = 1

/**
 * 构建期纯函数：由原始 JSON 对象（含 fetchItemData 产物）生成角色图鉴最终数据。
 * 不依赖网络与浏览器，Node 构建脚本（scripts/parse/*.mjs）与浏览器共用。
 */
export function buildHeroData(maps) {
  const {
    heroRes, archivesRes, behaviorRes, levelRes, playerLevelRes, mailRes, rankRes,
    skillUpgradeRes, talkRes, starRes, consumeRes, skillRes, skillTriggerRes,
    taskRes, dialogSegmentsRes, dialogIndexRes, dialogScripts, generalRes, buffRes,
    monRes = {}, // 召唤物属性来源：技能的 `summonData.monTypeId` → mon.json 的 `unitData`
    skinRes = {}, items, lanDict, rewards
  } = maps

  const heroDatas = heroRes.datas || heroRes || {}
  const archivesDatas = archivesRes.archives || archivesRes || {}
  const behaviorDatas = behaviorRes.datas || behaviorRes || {}
  const levelDatas = levelRes.heroLevel || levelRes || {}
  const mailDatas = mailRes.datas || mailRes || {}
  const mailContext = { mailDatas, archivesDatas, rewards, items }
  const rankDatas = rankRes.heroRank || rankRes || {}
  const skillUpgradeDatas = skillUpgradeRes.datas || skillUpgradeRes || {}
  const talkDatas = talkRes.hero || talkRes || {}
  const starDatas = starRes.heroStar || starRes || {}
  const starLevelDatas = starRes.heroStarLevel || {}
  const consumeDatas = consumeRes.datas || consumeRes || {}
  const skillDatas = skillRes.datas || skillRes || {}
  const skillTriggerDatas = skillTriggerRes.datas || skillTriggerRes || {}
  const generalDatas = generalRes?.datas || generalRes || {}
  const buffDatas = buffRes?.datas || buffRes || {}
  const skinDatas = skinRes?.datas || skinRes || {}
  // 召唤物基础属性表（`mon.json`）：技能 summonData.monTypeId 指向这里
  const monDatas = monRes?.datas || monRes || {}

  const skinsByHero = {}
  Object.values(skinDatas).forEach(skin => {
    if (!skin?.show || !skin.heroTypeId || !skin.name || !skin.img) return
    const heroSkins = skinsByHero[skin.heroTypeId] || []
    heroSkins.push({
      id: skin.typeId,
      name: skin.name,
      from: skin.from || '',
      img: skin.img,
      modelImage: maps.skinModelImages?.[skin.typeId] || '',
      icon: skin.icon || '',
      quality: Number(skin.quality) || 0,
      attributes: Object.entries(skin.attrAdd || {}).map(([key, value]) => ({
        key,
        baseValue: Number(value?.baseValue) || 0,
        percent: Number(value?.percent) || 0
      })).filter(attribute => attribute.baseValue || attribute.percent)
    })
    skinsByHero[skin.heroTypeId] = heroSkins
  })

  const jobTraitsByJob = {}
  Object.entries(generalDatas.jobPaBuffConfDes || {}).forEach(([jobId, entries]) => {
    jobTraitsByJob[jobId] = (entries || []).map((entry, index) => {
      const buff = entry.buff ? buffDatas[entry.buff] : null
      return {
        id: entry.buff || `job-${jobId}-${index + 1}`,
        name: buff?.buffName || entry.name || '',
        des: buff?.buffDes || entry.des || '',
        // 职业特性同样带数值（如攻速、属性加成），与词条页共用同一渲染器
        values: buff ? describeBuff(buff, { buffData: buffDatas }) : null
      }
    }).filter(trait => trait.name && trait.des)
  })

    // 任务名索引（角色档案的剧情任务显示任务名）与剧情分段索引
    const taskNameMap = {}
    const taskDatas = taskRes.datas || {}
    for (const [id, t] of Object.entries(taskDatas)) {
      if (t && t.name) taskNameMap[id] = t.name
    }
    const dialogSegmentsMap = dialogSegmentsRes || {}
    const dialogIndexMap = dialogIndexRes || {}

    // 根据任务 ID 解析剧情分段列表：dialogSegments.json 有则用分段，否则单文件；
    // 每段带 dialogIndex 里的剧情名称（如 "米托拉-营地对话【拾荒计划如何？】"）
    const resolveTaskDialogs = (taskTypeId) => {
      if (!taskTypeId) return []
      const segs = dialogSegmentsMap[taskTypeId]
      const ids = Array.isArray(segs) && segs.length > 0 ? segs : [taskTypeId]
      return ids.map(id => ({
        id,
        name: dialogIndexMap[id] || ''
      }))
    }

    // Save global levels and ranks for reference (level calculator)
    // （构建期纯函数内不再写模块缓存，缓存由 fetchHeroData 负责）

    const processedHeroes = Object.keys(heroDatas).map(key => {
      const h = heroDatas[key]
      if (h.hide === true) return null
      // 手工隐藏角色（预埋/不可实得，如 059/070/047），见 blacklist.js 的 HIDDEN_HERO_IDS
      if (isHiddenHero(h.typeId || key)) return null

      const typeId = h.typeId || key
      const rare = h.rare || 3
      const job = h.job || 1
      const element = h.element || 1

      // 1. Job and Element mappings
      const jobName = JOB_NAMES[job] || '未知职业'
      const elementName = ELEMENT_NAMES[element] || '无'

      // 2. Process favorability items (itemFavor)
      const favorItems = []
      if (h.itemFavor) {
        Object.entries(h.itemFavor).forEach(([itemId, val]) => {
          const item = items.find(i => i.typeId === itemId)
          favorItems.push({
            id: itemId,
            points: val,
            name: item ? item.name : itemId,
            quality: item ? item.quality : 1,
            img: item ? getItemImageUrl(item) : ''
          })
        })
      }

      // 3. Process skills: normalAttack and skillList
      const parsedSkills = []
      
      // Normal attack
      if (h.normalAttack) {
        const skillId = h.normalAttack
        const s = skillDatas[skillId]
        if (s) {
          parsedSkills.push(processSkillInfo(skillId, s, 'normal', rare, element, skillUpgradeDatas.skillOne, consumeDatas, items, buffDatas, monDatas, skillDatas))
        }
      }

      // Active skills (correctly mapping idx 0 -> skillOne and idx 1 -> skillTwo)
      if (h.skillList && Array.isArray(h.skillList)) {
        h.skillList.forEach((skillId, idx) => {
          const s = skillDatas[skillId]
          if (s) {
            const upgradeList = idx === 0 ? skillUpgradeDatas.skillOne : skillUpgradeDatas.skillTwo
            parsedSkills.push(processSkillInfo(skillId, s, 'active', rare, element, upgradeList, consumeDatas, items, buffDatas, monDatas, skillDatas))
          }
        })
      }

      // 4. Process star skills (paSkillList)
      const starSkills = []
      if (h.paSkillList) {
        Object.entries(h.paSkillList).forEach(([starKey, skillId], index) => {
          const trigger = skillTriggerDatas[skillId]
          if (trigger) {
            // Get upgrade matrix for this rarity index
            // starSkill1 is index 0, starSkill2 is index 1, starSkill3 is index 2, starSkill4 is index 3
            const shardCosts = (starLevelDatas[rare] && starLevelDatas[rare][index]) || []
            const levelData = []
            if (trigger.levelData) {
              Object.entries(trigger.levelData).forEach(([lvlKey, lvlVal]) => {
                levelData.push({
                  level: parseInt(lvlKey),
                  name: lvlVal.skillName || trigger.skillName || '',
                  des: lvlVal.des || '',
                  cost: shardCosts[parseInt(lvlKey) - 1] || 0
                })
              })
            }
            const rawName = trigger.name || trigger.skillName || (levelData[0] && levelData[0].name) || '星阶技能'
            starSkills.push({
              key: starKey, // e.g. "starSkill1"
              id: skillId,
              icon: trigger.skillIcon || `skill_${skillId}`,
              name: getCleanSkillName(rawName),
              levelData,
              maxLevel: levelData.length
            })
          }
        })
      }

      // 5. Talent / Passive skills (talentSkillList)
      const talentSkills = []
      if (h.talentSkillList && Array.isArray(h.talentSkillList)) {
        h.talentSkillList.forEach(skillId => {
          const trigger = skillTriggerDatas[skillId]
          if (trigger) {
            const levelData = []
            if (trigger.levelData) {
              Object.entries(trigger.levelData).forEach(([lvlKey, lvlVal]) => {
                /*
                 * 天赋也可能是召唤物来源（如乌尔勒「驻守指令」部署浮游炮）。
                 * 召唤配置**不在 levelVal 里**，而在 `buffId` 指向的 buff 的 `para.summonData`，
                 * 所以必须传 `buffDatas`；`resolveSummonConfig` 覆盖这两种位置。
                 */
                const talentSummonConfigs = resolveSummonConfigs(lvlVal, buffDatas)
                const talentSummons = talentSummonConfigs
                  .map(cfg => attachSummonSkills(buildSummonMechanics(lvlVal, monDatas[cfg.monTypeId], cfg, buffDatas), monDatas, skillDatas))
                  .filter(Boolean)

                levelData.push({
                  level: parseInt(lvlKey),
                  name: lvlVal.skillName || trigger.skillName || '被动天赋',
                  des: lvlVal.des || '',
                  mechanics: buildTalentMechanics({ skillId, trigger: lvlVal, buffDatas }),
                  ...(talentSummons.length ? { summons: talentSummons, summon: talentSummons[0] } : {})
                })
              })
            }
            const rawName = trigger.name || trigger.skillName || (levelData[0] && levelData[0].name) || '核心天赋'
            talentSkills.push({
              id: skillId,
              icon: trigger.skillIcon || `skill_${skillId}`,
              name: getCleanSkillName(rawName),
              levelData
            })
          }
        })
      }

      // 6. Archives and Story Tasks (combined in natural favorability order)
      const archives = []
      const heroArchivesList = archivesDatas[typeId] || []

      /*
       * 🔴 2026-11-11：一部分「首次见面」档案的 `archiveDesc` **不是正文，而是剧情 id**
       * （如 hero_069 的 `bsl_hero_069_1`，共 41 条）。此前直接把 id 当正文渲染，
       * 页面显示的就是一串 `bsl_hero_069_1`。
       * 这里若检测到「纯 id 形态」且能在 dialogScripts 里找到对应剧本，就把该剧本里
       * `text` 条目的正文拼出来替换；找不到则留空（宁可空，不显示 id）。
       */
      const isDialogIdLike = value => typeof value === 'string' && /^[A-Za-z0-9_]+$/.test(value)
      const dialogTextOf = id => {
        const script = dialogScripts?.[id]
        if (!script || !Array.isArray(script.exps)) return ''
        const lines = []
        for (const e of script.exps) {
          if (e?.key !== 'text') continue
          const para = e.para || {}
          // 与任务/互动对话共用同一套清洗：剥舞台标记 + 替换 {myName}/[myName]/主角 → 小工匠
          const t = cleanDialogueBase(para.text)
          if (!t) continue
          const rawName = String(para.charaName || '').trim()
          const name = ['主角', '[myName]', '{myName}'].includes(rawName) ? '小工匠' : cleanDialogueBase(rawName)
          lines.push(name ? `${name}：${t}` : t)
        }
        return lines.join('\n')
      }

      heroArchivesList.forEach(arch => {
        const taskTypeId = arch.taskTypeId || ''
        const rawDesc = arch.archiveDesc || ''
        // ① 纯 id 形态 → 取剧情正文；② 普通文本 → 也要走同一套清洗（{myName}/[myName]/主角 → 小工匠）
        const desc = isDialogIdLike(rawDesc)
          ? (dialogTextOf(rawDesc) || '')
          : cleanDialogueBase(rawDesc)
        archives.push({
          title: arch.archiveTitle || '',
          desc,
          taskDesc: arch.archiveTask || '',
          unlockFav: arch.unlockFavValue || 0,
          type: arch.type || 0,
          reward: arch.reward ? parseReward(arch.reward, rewards, items) : null,
          mail: arch.mailTypeId ? parseHeroMail(arch.mailTypeId, mailContext) : null,
          taskTypeId,
          taskName: taskNameMap[taskTypeId] || '',
          dialogs: resolveTaskDialogs(taskTypeId),
          stats: arch.unitData || {}
        })
      })

      // Sort in favorability unlock threshold ascending order
      archives.sort((a, b) => a.unlockFav - b.unlockFav)

      // 7. Behavior voicelines and interaction texts
      const behavior = behaviorDatas[typeId] || {}
      const talk = talkDatas[typeId] || {}

      const touchLines = (behavior.motou || []).map(m => ({
        text: m.text,
        vocal: m.vocal || '',
        face: m.face || '',
        min: m.min || 0,
        max: m.max || 0
      }))

      const walkLines = (behavior.luguo || []).map(l => ({
        text: l.text,
        vocal: l.vocal || '',
        face: l.face || '',
        min: l.min || 0,
        max: l.max || 0
      }))

      const ziyanziyuLines = (behavior.ziyanziyu || []).map(z => ({
        text: z.text,
        vocal: z.vocal || '',
        face: z.face || '',
        min: z.min || 0,
        max: z.max || 0
      }))

      const chatLines = (behavior.chat || []).map(c => ({
        dialog: c.dialog || '',
        min: c.min || 0,
        max: c.max || 0
      }))

      const heroEvents = (behavior.heroEvent || []).map(e => ({
        day: e.day || 0,
        title: e.title || '',
        dialog: e.dialog || ''
      }))

      // Exploration & combat dialogue
      const exploreTalks = {
        start: talk.start || [],
        fight: talk.fight || [],
        win: talk.win || [],
        exploreTalk: talk.exploreTalk || [],
        loopEnd: talk.loopEnd || [],
        readyGoHome: talk.readyGoHome || [],
        over: talk.over || [],
        roomFinishMember: talk.roomFinishMember || [],
        roomFinishLeader: talk.roomFinishLeader || [],
        getGift: talk.getGift || [],
        gacha: talk.gacha || []
      }

      // 8. Star coins memory crystal limits configuration
      const starConfig = starDatas[rare] || {}
      // HeroMsg.starNum = sum(starSkillLevel), not rarity or unlocked big stars.
      const maxStarCount = (starLevelDatas[rare] || [])
        .reduce((sum, levels) => sum + levels.length, 0)
      const starLimitInfo = {
        limit: starConfig.starCoinLimit || 0,
        rewardItemId: starConfig.itemTypeId || 'item_20026',
        rewardItemNum: starConfig.itemNum || 0
      }

      return {
        id: typeId,
        name: h.name,
        name2: h.name2 || '',
        des: h.des || '',
        icon: h.icon || '',
        img: h.img || '',
        rare,
        job,
        jobName,
        jobTraits: jobTraitsByJob[String(job)] || [],
        element,
        elementName,
        itemFavor: favorItems,
        unitData: h.unitData || {},
        skills: parsedSkills,
        starSkills,
        talentSkills,
        skins: skinsByHero[typeId] || [],
        archives,
        behavior: {
          chat: chatLines,
          heroEvent: heroEvents,
          touch: touchLines,
          walk: walkLines,
          ziyanziyu: ziyanziyuLines,
          explore: exploreTalks
        },
        starLimitInfo,
        maxStarCount,
        starGrowthRate: Number(generalDatas.starAttAddData ?? 0.01)
      }
    }).filter(Boolean)

    // Sort: rare descending, then id ascending
    processedHeroes.sort((a, b) => {
      if (b.rare !== a.rare) return b.rare - a.rare
      return a.id.localeCompare(b.id)
    })

    return {
      heroes: processedHeroes,
      mailboxes: buildPartnerMailboxes({ heroDatas, ...mailContext }),
      heroLevel: levelRes,
      heroRank: rankRes,
      playerLevelCap: resolvePlayablePlayerLevelCap(playerLevelRes),
      consumeDatas
    }
}

/**
 * 角色图鉴数据加载：读取构建期预解析的 parsed/heroes.json。
 */
export const fetchHeroData = createCachedLoader(async () => {
  if (cachedHeroes) {
    return {
      heroes: cachedHeroes,
      mailboxes: cachedMailboxes,
      heroLevel: cachedHeroLevel,
      heroRank: cachedHeroRank,
      playerLevelCap: cachedPlayerLevelCap,
      consumeDatas: cachedHeroConsume
    }
  }

  const parsed = await fetchWithFallback('data/parsed/heroes.json')
  cachedHeroes = parsed.heroes
  cachedMailboxes = parsed.mailboxes
  cachedHeroLevel = parsed.heroLevel
  cachedHeroRank = parsed.heroRank
  cachedPlayerLevelCap = parsed.playerLevelCap || 1
  cachedHeroConsume = parsed.consumeDatas
  return parsed
})

// Help process active skills and normal attacks
/**
 * 给召唤物附加「自身技能」名称列表：mon.json 的 skillList[].skillId → skill.json 的 skillName。
 * 召唤物（如德莉的剑盾护卫/弓箭手护卫）不在怪物图鉴单列，但其技能数据在 skill 表里，
 * 角色图鉴的召唤物行可展示这些技能名，避免读者以为召唤物没有技能。
 */
function attachSummonSkills(summon, monDatas, skillDatas) {
  if (!summon) return summon
  const mon = monDatas[summon.monTypeId] || {}
  const list = Array.isArray(mon.skillList) ? mon.skillList : []
  const skillNames = []
  let split = null
  for (const entry of list) {
    const sid = entry?.skillId
    if (!sid) continue
    const s = skillDatas[sid]
    const lv1 = s?.levelData?.['1']
    const nm = lv1?.skillName || s?.skillName || s?.name
    if (nm) skillNames.push(String(nm).replace(/\s*Lv[:：]?\s*\d+$/i, '').trim())
    // 分裂类技能：技能自身带 summonData（再召唤出子单位），记录子单位属性。
    // 例：弓箭手「远程小能分裂」→ 060_1fenlie ×2（生命50%/攻击50%/防御50%，持续6秒）；
    //     剑盾「分裂」→ 060_2fenlie ×2（…持续10秒）。
    if (!split && lv1) {
      const cfgs = resolveSummonConfigs(lv1)
      if (cfgs.length) {
        const childCfg = cfgs[0]
        const child = buildSummonMechanics(lv1, monDatas[childCfg.monTypeId], childCfg)
        if (child) {
          split = {
            ...child,
            skillName: nm ? String(nm).replace(/\s*Lv[:：]?\s*\d+$/i, '').trim() : '',
            skills: (monDatas[childCfg.monTypeId]?.skillList || [])
              .map(e => {
                const cs = skillDatas[e?.skillId]
                const cn = cs?.levelData?.['1']?.skillName || cs?.skillName || cs?.name
                return cn ? String(cn).replace(/\s*Lv[:：]?\s*\d+$/i, '').trim() : ''
              })
              .filter(Boolean)
          }
        }
      }
    }
  }
  return { ...summon, skills: [...new Set(skillNames)], ...(split ? { split } : {}) }
}

function processSkillInfo(skillId, s, type, rare, element, upgradeList, consumeDatas, items, buffDatas, monDatas = {}, skillDatas = {}) {
  // Extract multiplier and damage type for normal attacks
  let power = 100
  let isPhy = true
  if (type === 'normal' && s.levelData && s.levelData["1"] && s.levelData["1"].aniEvents) {
    const ani = s.levelData["1"].aniEvents.find(e => e.arg && e.arg.damage)
    if (ani && ani.arg && ani.arg.damage) {
      const dmg = ani.arg.damage
      if (dmg.muPower !== undefined) {
        power = Math.round(dmg.muPower * 100)
      }
      if (dmg.damageType === 'magicAtk' || dmg.muAddType === 'magicAtk') {
        isPhy = false
      }
    }
  }

  // s.levelData maps level numbers to details
  let levelData = []
  if (s.levelData) {
    Object.entries(s.levelData).forEach(([lvlKey, lvlVal]) => {
      let customDes = lvlVal.des || ''
      if (type === 'normal' && !customDes) {
        customDes = `造成 {${power}%}${isPhy ? '物理攻击' : '魔法攻击'}加成的${isPhy ? '物理' : '魔法'}伤害。`
      }
      // 召唤物属性（只有带 summonData 的技能才有）；`monTypeId` 指向 mon.json
      // 一次可召唤多种单位（德莉「征号召令」= nearOneSummonData + longTwoSummonData），
      // 用 resolveSummonConfigs 收集全部；主动技能在 aniEvents 里，被动天赋在 buff 里。
      const summonConfigs = resolveSummonConfigs(lvlVal, buffDatas)
      const summons = summonConfigs
        .map(cfg => attachSummonSkills(buildSummonMechanics(lvlVal, monDatas[cfg.monTypeId], cfg, buffDatas), monDatas, skillDatas))
        .filter(Boolean)

      levelData.push({
        level: parseInt(lvlKey),
        name: lvlVal.skillName || s.skillName || '',
        des: customDes,
        cd: lvlVal.cd !== undefined ? lvlVal.cd : (s.cd || 0),
        cost: lvlVal.cost !== undefined ? lvlVal.cost : (s.cost || 0),
        mechanics: buildSkillMechanics({ skillId, type, levelValue: lvlVal, buffDatas }),
        ...(summons.length ? { summons, summon: summons[0] } : {})
      })
    })
    // Restrict skill level max to 12
    if (levelData.length > 12) {
      levelData = levelData.slice(0, 12)
    }
  }

  // Upgrade costs matching skill level thresholds
  let upgrades = []
  const rareUpgradeList = upgradeList ? upgradeList[rare] : null
  if (rareUpgradeList && Array.isArray(rareUpgradeList)) {
    rareUpgradeList.forEach(entry => {
      const consumeKey = entry.upgradeConsume ? entry.upgradeConsume[element] : null
      const consumeDetail = consumeKey ? consumeDatas[consumeKey] : null
      
      const parsedItems = []
      if (consumeDetail && consumeDetail.items) {
        consumeDetail.items.forEach(cItem => {
          const dbItem = items.find(i => i.typeId === cItem.typeId)
          parsedItems.push({
            id: cItem.typeId,
            num: cItem.num,
            name: dbItem ? dbItem.name : cItem.typeId,
            quality: dbItem ? dbItem.quality : 1,
            img: dbItem ? getItemImageUrl(dbItem) : ''
          })
        })
      }

      upgrades.push({
        level: entry.level, // Current skill level
        heroLevel: entry.heroLevel, // Hero level threshold required to upgrade to next level
        consumeKey,
        money: consumeDetail ? consumeDetail.money : 0,
        items: parsedItems
      })
    })
    // Restrict upgrades to 11 steps (upgrade to max level 12)
    if (upgrades.length > 11) {
      upgrades = upgrades.slice(0, 11)
    }
  }

  const rawName = s.name || s.skillName || (levelData[0] && levelData[0].name) || '技能'
  return {
    id: skillId,
    type,
    icon: s.skillIcon || s.icon || `skill_${skillId}`,
    name: getCleanSkillName(rawName),
    levelData,
    upgrades,
    maxLevel: levelData.length
  }
}

// Reward list parsing helper
function parseReward(rewardId, rewards, items) {
  if (!rewardId || !rewards) return null
  const rewardData = rewards[rewardId]
  if (!rewardData || !rewardData.items) return null

  const parsedItems = []
  const currencyQuality = mode => items.find(item => item.typeId === BASE_REWARD_ICONS[mode])?.quality || 1
  // Legacy reward configs put currencies on the reward root instead of in items.rules.
  if (Number(rewardData.money) > 0) parsedItems.push({ id: 'money', name: REWARD_MODE_INFO.money.name, img: REWARD_MODE_INFO.money.icon, quality: currencyQuality('money'), count: Number(rewardData.money), chance: 1 })
  if (Number(rewardData.ke) > 0) parsedItems.push({ id: 'ke', name: REWARD_MODE_INFO.ke.name, img: REWARD_MODE_INFO.ke.icon, quality: currencyQuality('ke'), count: Number(rewardData.ke), chance: 1 })
  rewardData.items.forEach(group => {
    group.rules.forEach(rule => {
      if (rule.mode === 'item') {
        const targetItem = items.find(i => i.typeId === rule.typeId)
        parsedItems.push({
          id: rule.typeId,
          name: targetItem ? targetItem.name : rule.typeId,
          img: targetItem ? getItemImageUrl(targetItem) : '',
          quality: targetItem ? targetItem.quality : 1,
          chance: rule.chance || 1
        })
      } else if (rule.mode === 'randomMoney' || rule.mode === 'money') {
        parsedItems.push({
          id: 'money',
          name: REWARD_MODE_INFO.money.name,
          img: REWARD_MODE_INFO.money.icon,
          quality: currencyQuality('money'),
          chance: rule.chance || 1
        })
      } else if (rule.mode === 'ke') {
        parsedItems.push({
          id: 'ke',
          name: REWARD_MODE_INFO.ke.name,
          img: REWARD_MODE_INFO.ke.icon,
          quality: currencyQuality('ke'),
          chance: rule.chance || 1
        })
      }
    })
  })

  return {
    id: rewardId,
    items: parsedItems
  }
}

// Simulate base growth only; star-skill effects enter a separate attribute layer.
export function calculateStats(unitData, level, rank, heroLevelConfig, heroRankConfig, starCount = 0, starGrowthRate = 0.01) {
  const growthFields = ['phyAtk', 'magicAtk', 'phyDef', 'magicDef', 'maxHp']
  const results = {}

  // Get base growth per level (default 0.05 / 5%)
  const levelGrowthRate = Number(heroLevelConfig?.attUp ?? 0.05)
  
  // Calculate total rank attUp sum
  let rankGrowthSum = 0
  const rankList = heroRankConfig?.heroRank || {}
  for (let r = 0; r < rank; r++) {
    const rankInfo = rankList[r]
    if (rankInfo && rankInfo.attUp !== undefined) {
      rankGrowthSum += rankInfo.attUp
    }
  }

  const multiplier = 1 + (level - 1) * levelGrowthRate + starCount * starGrowthRate + rankGrowthSum

  growthFields.forEach(field => {
    const baseVal = unitData[field] || 0
    results[field] = roundToEven(baseVal * multiplier)
  })

  // Copy non-growth attributes
  Object.keys(unitData).forEach(key => {
    if (!growthFields.includes(key)) {
      results[key] = unitData[key]
    }
  })

  return results
}

/**
 * 该稀有度/职业的突破档位是否**真的消耗物品**。
 *
 * 🔴 这是**加载前的守门条件**：无条件加载整张 `items.json`（本地 brotli 约 126 KiB）
 * 只为解析突破材料是纯浪费 —— 当前原表 `heroRank` 引用的 54 个 consume 条目
 * **全部只有 money、没有 items**（`raw/consume.json` 全表 983 条里有 795 条带 items，
 * 说明表结构支持，只是突破没用到）。
 *
 * 当前数据下恒为 false，省掉整张物品表；若配置给突破加了材料，条件自然为真，
 * 行为与不判断时完全一致（`calculateUpgradeCosts` 与材料展示逻辑都不改动）。
 */
export function breakthroughConsumesItems(heroRankConfig, consumeDatas, rarity, job) {
  const rankList = heroRankConfig?.heroRank || {}
  for (const rankInfo of Object.values(rankList)) {
    const consumeKey = rankInfo?.upgradeConsume?.[rarity]?.[job]
    if (!consumeKey) continue
    const detail = consumeDatas?.[consumeKey] || consumeDatas?.datas?.[consumeKey]
    if (detail?.items?.length) return true
  }
  return false
}

// Compute cumulative upgrade and breakthrough costs
export function calculateUpgradeCosts(targetLevel, targetRank, rarity, job, heroLevelConfig, heroRankConfig, consumeDatas, items) {  let totalExp = 0
  let totalUpgradeMoney = 0
  let totalBreakthroughMoney = 0

  // 1. Level upgrade costs (Level 1 -> targetLevel)
  const levelList = heroLevelConfig?.heroLevel || {}
  for (let l = 1; l < targetLevel; l++) {
    const lvlInfo = levelList[l]
    if (lvlInfo && lvlInfo.exp) {
      totalExp += lvlInfo.exp
      totalUpgradeMoney += lvlInfo.exp // 1:1 ratio
    }
  }

  // 2. Rank breakthrough costs (Rank 0 -> targetRank)
  const rankList = heroRankConfig?.heroRank || {}
  const breakthroughItemsMap = {}

  for (let r = 0; r < targetRank; r++) {
    const rankInfo = rankList[r]
    const consumeKey = rankInfo?.upgradeConsume?.[rarity]?.[job]
    if (consumeKey) {
      const consumeDetail = consumeDatas?.[consumeKey] || consumeDatas?.datas?.[consumeKey]
      if (consumeDetail) {
        totalBreakthroughMoney += consumeDetail.money || 0
        if (consumeDetail.items) {
          consumeDetail.items.forEach(cItem => {
            const dbItem = items.find(i => i.typeId === cItem.typeId)
            const itemId = cItem.typeId
            if (!breakthroughItemsMap[itemId]) {
              breakthroughItemsMap[itemId] = {
                id: itemId,
                name: dbItem ? dbItem.name : itemId,
                quality: dbItem ? dbItem.quality : 1,
                img: dbItem ? getItemImageUrl(dbItem) : '',
                num: 0
              }
            }
            breakthroughItemsMap[itemId].num += cItem.num
          })
        }
      }
    }
  }

  return {
    exp: totalExp,
    upgradeMoney: totalUpgradeMoney,
    breakthroughMoney: totalBreakthroughMoney,
    breakthroughItems: Object.values(breakthroughItemsMap)
  }
}
