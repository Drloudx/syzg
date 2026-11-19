/**
 * 抽卡记录分析引擎（深渊大书院）
 *
 * 核心契约：
 * 1. 严格遵循《深渊之歌》官方配置与保底机制：
 *    - 5星伙伴 / 5星魔物蛋：基础概率 2.3%，保底 36 抽；
 *    - 4星伙伴 / 4星魔物蛋：基础概率 7.6%，保底 10 抽；
 *    - 3星：基础概率 90.1%；
 *    - 限定池：5星有 50% 概率命中当期 UP，若歪则下一次 5 星必中当期 UP（大保底）；
 *    - 单抽标准消耗：200 神晶 / 1 招募券。
 * 2. 拒绝硬编码其他游戏的 90/80/99 抽规则。
 */

export const GAME_GACHA_CONFIG = {
  PITY_5_STAR: 36,
  PITY_4_STAR: 10,
  BASE_RATE_5_STAR: 2.3,
  BASE_RATE_4_STAR: 7.6,
  BASE_RATE_3_STAR: 90.1,
  CRYSTAL_PER_PULL: 200
}

/**
 * 官方全量角色静态字典（对齐 public/data/parsed/heroes.json 40名角色）
 */
export const KNOWN_HEROES = {
  hero_019: { name: '奇瓦', rare: 5, jobName: '秘术', elementName: '火', icon: 'at019_0', img: 'chara019_0' },
  hero_043: { name: '阿娜洛洁', rare: 5, jobName: '支援', elementName: '地', icon: 'at043_0', img: 'chara043_0' },
  hero_049: { name: '菲莉娜', rare: 5, jobName: '射手', elementName: '地', icon: 'at049_0', img: 'chara049_0' },
  hero_050: { name: '米拉贝尔', rare: 5, jobName: '近卫', elementName: '火', icon: 'at050_0', img: 'chara050_0' },
  hero_051: { name: '阿莱克西娅', rare: 5, jobName: '守护', elementName: '水', icon: 'at051_0', img: 'chara051_0' },
  hero_053: { name: '艾薇杜尔', rare: 5, jobName: '秘术', elementName: '水', icon: 'at053_0', img: 'chara053_0' },
  hero_055: { name: '迦南', rare: 5, jobName: '近卫', elementName: '暗', icon: 'at055_0', img: 'chara055_0' },
  hero_060: { name: '德莉', rare: 5, jobName: '秘术', elementName: '火', icon: 'at060_0', img: 'chara060_0' },
  hero_061: { name: '斯卡莉安', rare: 5, jobName: '突袭', elementName: '地', icon: 'at061_0', img: 'chara061_0' },
  hero_064: { name: '伽拉忒亚', rare: 5, jobName: '射手', elementName: '风', icon: 'at064_0', img: 'chara064_0' },
  hero_065: { name: '乌尔勒', rare: 5, jobName: '近卫', elementName: '水', icon: 'at065_0', img: 'chara065_0' },
  hero_071: { name: '洛莉安', rare: 5, jobName: '射手', elementName: '暗', icon: 'at071_0', img: 'chara071_0' },
  hero_015: { name: '芭杜尔', rare: 4, jobName: '近卫', elementName: '风', icon: 'at015_0', img: 'chara015_0' },
  hero_025: { name: '嘉莉缇', rare: 4, jobName: '射手', elementName: '火', icon: 'at025_0', img: 'chara025_0' },
  hero_026: { name: '贝拉多娜', rare: 4, jobName: '支援', elementName: '暗', icon: 'at026_0', img: 'chara026_0' },
  hero_027: { name: '梅莉莉', rare: 4, jobName: '秘术', elementName: '水', icon: 'at027_0', img: 'chara027_0' },
  hero_029: { name: '安娜', rare: 4, jobName: '突袭', elementName: '光', icon: 'at029_0', img: 'chara029_0' },
  hero_030: { name: '阿尔克丝', rare: 4, jobName: '近卫', elementName: '光', icon: 'at030_0', img: 'chara030_0' },
  hero_033: { name: '乌帕·萝特', rare: 4, jobName: '守护', elementName: '火', icon: 'at033_0', img: 'chara033_0' },
  hero_034: { name: '露帕·萝特', rare: 4, jobName: '近卫', elementName: '水', icon: 'at034_0', img: 'chara034_0' },
  hero_036: { name: '贝尔卡', rare: 4, jobName: '射手', elementName: '水', icon: 'at036_0', img: 'chara036_0' },
  hero_045: { name: '艾尔菲帕', rare: 4, jobName: '近卫', elementName: '风', icon: 'at045_0', img: 'chara045_0' },
  hero_047: { name: '阿迪拉', rare: 4, jobName: '守护', elementName: '地', icon: 'at047_0', img: 'chara047_0' },
  hero_066: { name: '奥格', rare: 4, jobName: '守护', elementName: '风', icon: 'at066_0', img: 'chara066_0' },
  hero_069: { name: '修瓦莉', rare: 4, jobName: '近卫', elementName: '地', icon: 'at069_0', img: 'chara069_0' },
  hero_001: { name: '希尔', rare: 3, jobName: '近卫', elementName: '水', icon: 'at001_0', img: 'chara001_0' },
  hero_005: { name: '茜塔', rare: 3, jobName: '近卫', elementName: '光', icon: 'at005_0', img: 'chara005_0' },
  hero_007: { name: '拉碧丝', rare: 3, jobName: '支援', elementName: '水', icon: 'at007_0', img: 'chara007_0' },
  hero_008: { name: '夏库塔拉', rare: 3, jobName: '射手', elementName: '火', icon: 'at008_0', img: 'chara008_0' },
  hero_009: { name: '可可娜', rare: 3, jobName: '秘术', elementName: '风', icon: 'at009_0', img: 'chara009_0' },
  hero_011: { name: '缇莎', rare: 3, jobName: '突袭', elementName: '暗', icon: 'at011_0', img: 'chara011_0' },
  hero_012: { name: '沃夫加', rare: 3, jobName: '近卫', elementName: '地', icon: 'at012_0', img: 'chara012_0' },
  hero_014: { name: '皮塔', rare: 3, jobName: '射手', elementName: '地', icon: 'at014_0', img: 'chara014_0' },
  hero_023: { name: '卡夫', rare: 3, jobName: '突袭', elementName: '风', icon: 'at023_0', img: 'chara023_0' },
  hero_031: { name: '波特温', rare: 3, jobName: '守护', elementName: '光', icon: 'at031_0', img: 'chara031_0' },
  hero_032: { name: '诺姿', rare: 3, jobName: '射手', elementName: '暗', icon: 'at032_0', img: 'chara032_0' },
  hero_041: { name: '埃迪蒂', rare: 3, jobName: '秘术', elementName: '光', icon: 'at041_0', img: 'chara041_0' },
  hero_046: { name: '迈妮娅', rare: 3, jobName: '守护', elementName: '地', icon: 'at046_0', img: 'chara046_0' },
  hero_062: { name: '露比特·鲁特', rare: 3, jobName: '近卫', elementName: '地', icon: 'at062_0', img: 'chara062_0' },
  new_hero_002: { name: '米托拉', rare: 3, jobName: '突袭', elementName: '火', icon: 'at002_1', img: 'chara002_1' }
}

/**
 * 官方全量魔物蛋静态字典（对齐 public/data/parsed/pet-eggs.json）
 * star: 1 -> 3星, star: 2 -> 4星, star: 3 -> 5星 (displayStar)
 */
export const KNOWN_PETS = {
  pet_074: { name: '宝石迷迷可', rare: 5, star: 3, icon: 'avatar_pet_074', eggImg: 'egg_074', isLimited: false },
  pet_077: { name: '真护之黑龙', rare: 5, star: 3, icon: 'avatar_pet_077', eggImg: 'egg_077', isLimited: false },
  pet_078: { name: '星云史莱姆', rare: 5, star: 3, icon: 'avatar_pet_078', eggImg: 'egg_078', isLimited: false },
  pet_079: { name: '东天之青龙', rare: 5, star: 3, icon: 'avatar_pet_079', eggImg: 'egg_079', isLimited: false },
  pet_104: { name: '洛莉安的眷属', rare: 5, star: 3, icon: 'avatar_pet_104', eggImg: 'egg_104', isLimited: true },
  pet_106: { name: '圣骑士史莱姆', rare: 5, star: 3, icon: 'avatar_pet_106', eggImg: 'egg_106', isLimited: true },
  pet_118: { name: '彩虹史莱姆', rare: 5, star: 3, icon: 'avatar_pet_118', eggImg: 'egg_118', isLimited: true },
  pet_063: { name: '繁茂杜吉芽', rare: 4, star: 2, icon: 'avatar_pet_063', eggImg: 'egg_063' },
  pet_071: { name: '秋风妖精', rare: 4, star: 2, icon: 'avatar_pet_071', eggImg: 'egg_071' },
  pet_073: { name: '源泉猫', rare: 4, star: 2, icon: 'avatar_pet_073', eggImg: 'egg_073' },
  pet_076: { name: '雷素', rare: 4, star: 2, icon: 'avatar_pet_076', eggImg: 'egg_076' },
  pet_088: { name: '熔火喷炎者', rare: 4, star: 2, icon: 'avatar_pet_088', eggImg: 'egg_088' },
  pet_093: { name: '石像鬼', rare: 4, star: 2, icon: 'avatar_pet_093', eggImg: 'egg_093' },
  pet_095: { name: '蜂刺骑兵', rare: 4, star: 2, icon: 'avatar_pet_095', eggImg: 'egg_095' },
  pet_096: { name: '白银迷迷可', rare: 4, star: 2, icon: 'avatar_pet_096', eggImg: 'egg_096' },
  pet_107: { name: '黄金史莱姆', rare: 4, star: 2, icon: 'avatar_pet_107', eggImg: 'egg_107' },
  pet_117: { name: '纯白史莱姆', rare: 4, star: 2, icon: 'avatar_pet_117', eggImg: 'egg_117' },
  pet_006: { name: '提灯妖精', rare: 3, star: 1, icon: 'avatar_pet_006', eggImg: 'egg_006' },
  pet_007: { name: '角布林', rare: 3, star: 1, icon: 'avatar_pet_007', eggImg: 'egg_007' },
  pet_016: { name: '吵吵蕈', rare: 3, star: 1, icon: 'avatar_pet_016', eggImg: 'egg_016' },
  pet_017: { name: '臭臭蕈', rare: 3, star: 1, icon: 'avatar_pet_017', eggImg: 'egg_017' },
  pet_036: { name: '草原黏团', rare: 3, star: 1, icon: 'avatar_pet_036', eggImg: 'egg_036' },
  pet_037: { name: '掘地芙洛波', rare: 3, star: 1, icon: 'avatar_pet_037', eggImg: 'egg_037' },
  pet_038: { name: '扬沙芙洛波', rare: 3, star: 1, icon: 'avatar_pet_038', eggImg: 'egg_038' },
  pet_043: { name: '顽劣灯火', rare: 3, star: 1, icon: 'avatar_pet_043', eggImg: 'egg_043' },
  pet_044: { name: '游离灯火', rare: 3, star: 1, icon: 'avatar_pet_044', eggImg: 'egg_044' },
  pet_045: { name: '囊袋恐兽', rare: 3, star: 1, icon: 'avatar_pet_045', eggImg: 'egg_045' },
  pet_046: { name: '利齿恐兽', rare: 3, star: 1, icon: 'avatar_pet_046', eggImg: 'egg_046' },
  pet_058: { name: '魔水粘团', rare: 3, star: 1, icon: 'avatar_pet_058', eggImg: 'egg_058' },
  pet_062: { name: '射水杜吉芽', rare: 3, star: 1, icon: 'avatar_pet_062', eggImg: 'egg_062' },
  pet_065: { name: '鱼布林', rare: 3, star: 1, icon: 'avatar_pet_065', eggImg: 'egg_065' },
  pet_072: { name: '绿色史莱姆', rare: 3, star: 1, icon: 'avatar_pet_072', eggImg: 'egg_072' },
  pet_075: { name: '格莉姆', rare: 3, star: 1, icon: 'avatar_pet_075', eggImg: 'egg_075' },
  pet_083: { name: '冰棱妖精', rare: 3, star: 1, icon: 'avatar_pet_083', eggImg: 'egg_083' },
  pet_086: { name: '抛雪芙洛波', rare: 3, star: 1, icon: 'avatar_pet_086', eggImg: 'egg_086' },
  pet_094: { name: '布丁史莱姆', rare: 3, star: 1, icon: 'avatar_pet_094', eggImg: 'egg_094' },
  pet_098: { name: '奶油布丁史莱姆', rare: 3, star: 1, icon: 'avatar_pet_098', eggImg: 'egg_098' },
  pet_100: { name: '幽灵史莱姆', rare: 3, star: 1, icon: 'avatar_pet_100', eggImg: 'egg_100' },
  pet_101: { name: '青铜迷迷可', rare: 3, star: 1, icon: 'avatar_pet_101', eggImg: 'egg_101' },
  pet_108: { name: '粉红史莱姆', rare: 3, star: 1, icon: 'avatar_pet_108', eggImg: 'egg_108' },
  pet_109: { name: '澄黄史莱姆', rare: 3, star: 1, icon: 'avatar_pet_109', eggImg: 'egg_109' },
  pet_110: { name: '天青史莱姆', rare: 3, star: 1, icon: 'avatar_pet_110', eggImg: 'egg_110' }
}

/** 常用官方卡池映射（采用标准规范标识符 hero:id / pet:id） */
export const KNOWN_POOLS = {
  'hero:1': { id: 'hero:1', rawId: '1', name: '常规招募', kind: 'hero_standard', upTypes: [] },
  'hero:2': { id: 'hero:2', rawId: '2', name: '公主招募', kind: 'hero_limited', upTypes: ['hero_060'] },
  'hero:3': { id: 'hero:3', rawId: '3', name: '新锐招募', kind: 'hero_standard', upTypes: [] },
  'hero:5': { id: 'hero:5', rawId: '5', name: '幽夜招募', kind: 'hero_limited', upTypes: ['hero_071'] },
  'pet:1': { id: 'pet:1', rawId: '1', name: '魔物常规', kind: 'pet_standard', upTypes: [] },
  'pet:2': { id: 'pet:2', rawId: '2', name: '常规贩售', kind: 'pet_standard', upTypes: [] },
  'pet:3': { id: 'pet:3', rawId: '3', name: '御卫贩售', kind: 'pet_limited', upTypes: ['pet_106'] },
  'pet:4': { id: 'pet:4', rawId: '4', name: '神秘贩售', kind: 'pet_standard', upTypes: [] },
  'pet:5': { id: 'pet:5', rawId: '5', name: '古堡贩售', kind: 'pet_limited', upTypes: ['pet_104'] },
  // 兼容纯数字键
  '1': { id: 'hero:1', rawId: '1', name: '常规招募', kind: 'hero_standard', upTypes: [] },
  '2': { id: 'hero:2', rawId: '2', name: '公主招募', kind: 'hero_limited', upTypes: ['hero_060'] },
  '3': { id: 'hero:3', rawId: '3', name: '新锐招募', kind: 'hero_standard', upTypes: [] },
  '5': { id: 'hero:5', rawId: '5', name: '幽夜招募', kind: 'hero_limited', upTypes: ['hero_071'] }
}

/**
 * 解析规范化卡池键名（区分 hero 与 pet 命名空间）
 * @param {string|number} rawPoolId
 * @param {boolean} isPet
 * @returns {string} e.g. 'hero:2' 或 'pet:3'
 */
export function resolveCanonicalPoolKey(rawPoolId, isPet = false) {
  const str = String(rawPoolId || '1')
  if (str.startsWith('pet:') || str.startsWith('hero:')) {
    return str
  }
  const cleanId = str.replace(/^(hero|pet):/, '')
  return isPet ? `pet:${cleanId}` : `hero:${cleanId}`
}

/**
 * 判定卡池种类
 * @param {Object} pool
 * @returns {'hero_limited' | 'pet_limited' | 'hero_standard' | 'pet_standard'}
 */
export function classifyPoolKind(pool = {}) {
  const poolIdStr = String(pool.id || '')
  const nameStr = String(pool.name || '')
  const upTypes = pool.upTypes || []
  const isPet = pool.kind === 'pet' || pool.kind === 'pet_limited' || pool.kind === 'pet_standard' || pool.isPet || poolIdStr.startsWith('pet:') || poolIdStr.includes('pet') || nameStr.includes('蛋') || nameStr.includes('魔物') || nameStr.includes('贩售') || nameStr.includes('孵化')

  if (isPet) {
    if (upTypes.length > 0 || nameStr.includes('up') || nameStr.includes('UP') || nameStr.includes('限定') || nameStr.includes('御卫') || nameStr.includes('古堡') || nameStr.includes('活动') || pool.kind === 'pet_limited') {
      return 'pet_limited'
    }
    return 'pet_standard'
  }

  if (upTypes.length > 0 || nameStr.includes('up') || nameStr.includes('UP') || nameStr.includes('限定') || nameStr.includes('活动') || nameStr.includes('公主') || nameStr.includes('幽夜') || pool.kind === 'hero_limited') {
    return 'hero_limited'
  }
  return 'hero_standard'
}

/**
 * 欧非评估算法（主流二游与小黑盒抽卡评级体系，基于 2.3% 基础概率与 36 抽保底模型）
 */
export function evaluateLuckScore({ avgGoldPulls = 24, upRate = 50, goldCount = 0 }) {
  if (goldCount === 0) {
    return {
      title: '暂未出金',
      ratingClass: 'neutral',
      desc: '尚无5星记录，多抽几次再来勘测欧气吧！',
      percentile: 50
    }
  }

  // 1. 神话级欧皇档 (平均 <= 15 抽，约前 5% 极欧)
  if (avgGoldPulls <= 15) {
    if (upRate >= 75) {
      return {
        title: '天命欧皇',
        ratingClass: 'godly',
        desc: '神迹降临！平均十几抽出金且小保底几乎百发百中，深渊群星为你加冕！',
        percentile: 99.5
      }
    }
    if (upRate <= 40) {
      return {
        title: '速金歪王',
        ratingClass: 'godly',
        desc: '出金速度堪比流星，虽常驻频频抢镜，但架不住抽数实在太少了！',
        percentile: 96.5
      }
    }
    return {
      title: '绝世欧皇',
      ratingClass: 'godly',
      desc: '极为罕见的超凡运气，平均出金极低，欧气震动深渊！',
      percentile: 98.5
    }
  }

  // 2. 大欧传奇档 (15 < avg <= 19 抽，约前 15%)
  if (avgGoldPulls <= 19) {
    if (upRate >= 70) {
      return {
        title: '天选之子',
        ratingClass: 'godly',
        desc: '远超全服平均线的低抽数出金，且小保底屡屡命中真爱，令人称羡！',
        percentile: 93.5
      }
    }
    return {
      title: '气运爆棚',
      ratingClass: 'godly',
      desc: '出金抽数大幅领先全服均值，好运源源不绝，旅途势如破竹！',
      percentile: 90.0
    }
  }

  // 3. 小欧稳赚档 (19 < avg <= 22.5 抽，优于官方 4.3% 期望)
  if (avgGoldPulls <= 22.5) {
    if (upRate >= 65) {
      return {
        title: '吉星高照',
        ratingClass: 'lucky',
        desc: '出金节奏明快且小保底胜率可观，抽卡体验十分舒心！',
        percentile: 79.0
      }
    }
    return {
      title: '欧气满满',
      ratingClass: 'lucky',
      desc: '运气明显优于全服平均水准，时常提前撞线出金！',
      percentile: 72.0
    }
  }

  // 4. 正常均衡档 (22.5 < avg <= 26.5 抽，围绕 23.3~24.7 全服理论平均线)
  if (avgGoldPulls <= 26.5) {
    if (upRate >= 70) {
      return {
        title: '稳中带欧',
        ratingClass: 'normal',
        desc: '出金抽数贴合全服均值，但小保底格外给力，稳赚不亏！',
        percentile: 58.0
      }
    }
    if (upRate <= 35) {
      return {
        title: '歪卡常客',
        ratingClass: 'unlucky',
        desc: '出金抽数正常，奈何常驻总是准时来客串，下次一定不歪！',
        percentile: 40.0
      }
    }
    return {
      title: '不欧不非',
      ratingClass: 'normal',
      desc: '出金抽数与官方 4.3% 综合概率模型高度吻合，不偏不倚，稳扎稳打。',
      percentile: 50.0
    }
  }

  // 5. 偏非保底档 (26.5 < avg <= 30.5 抽)
  if (avgGoldPulls <= 30.5) {
    if (upRate >= 65) {
      return {
        title: '迟来的真爱',
        ratingClass: 'normal',
        desc: '虽然出金略慢于均值，但当期 UP 大多如期而至，算是不幸中的万幸！',
        percentile: 33.0
      }
    }
    return {
      title: '保底常客',
      ratingClass: 'unlucky',
      desc: '出金常逼近 30 抽关口，非气偶有缠身，期待下一发提前转运！',
      percentile: 22.0
    }
  }

  // 6. 纯血非酋档 (avg > 30.5 抽)
  if (upRate <= 40) {
    return {
      title: '纯血非酋',
      ratingClass: 'bottom',
      desc: '次次逼近 36 抽硬保底且屡屡被常驻背刺，真正的深渊非酋王！',
      percentile: 2.5
    }
  }

  return {
    title: '大保底战神',
    ratingClass: 'bottom',
    desc: '几乎把把吃满 36 抽小保底甚至 72 抽大保底，全靠硬保底抬走五星的真勇者！',
    percentile: 6.5
  }
}

/**
 * 解析单条记录的元数据
 */
export function resolveItemMeta(rawRecord, heroMap = KNOWN_HEROES, petMap = KNOWN_PETS) {
  const typeId = String(rawRecord.typeId || rawRecord.id || '')
  const isPet = typeId.startsWith('pet_') || rawRecord.kind === 'pet' || rawRecord.isPet

  if (isPet) {
    const pet = (petMap && petMap[typeId]) || KNOWN_PETS[typeId] || { name: '神秘魔物蛋', rare: 3, icon: `avatar_${typeId}` }
    const star = rawRecord.quality || rawRecord.rare || (pet.star ? pet.star + 2 : pet.rare) || 3
    return {
      isHero: false,
      isPet: true,
      name: rawRecord.name || pet.name || '神秘魔物蛋',
      rare: star,
      icon: pet.icon || `avatar_${typeId}`,
      img: pet.eggImg || 'egg_007'
    }
  }

  const hero = (heroMap && heroMap[typeId]) || KNOWN_HEROES[typeId] || { name: '神秘伙伴', rare: 3, icon: 'at002_1' }
  const star = rawRecord.quality || rawRecord.rare || hero.rare || 3
  return {
    isHero: true,
    isPet: false,
    name: rawRecord.name || hero.name || '神秘伙伴',
    rare: star,
    icon: hero.icon || 'at002_1',
    img: hero.img || `chara${typeId.replace('hero_', '')}_0`
  }
}

/**
 * 核心分析引擎：接收生记录并输出完整统计与时间线
 * @param {Array} rawRecords 抽卡记录列表
 * @param {Object} options 可选配置项（卡池映射、英雄映射、蛋池映射等）
 */
export function analyzeGachaRecords(rawRecords = [], options = {}) {
  const heroMap = options.heroMap || KNOWN_HEROES
  const petMap = options.petMap || KNOWN_PETS
  const poolInfoFallback = options.poolInfo || null

  // 1. 过滤非氪金抽卡记录（剔除魔物蛋「常规贩售 / 常规贩卖 / 神秘贩售」，其在游戏内为普通银币购买，consume_mowu2）
  const validRaw = (rawRecords || []).filter(item => {
    const meta = resolveItemMeta(item, heroMap, petMap)
    const cKey = resolveCanonicalPoolKey(item.poolId, meta.isPet)
    const pname = String(item.poolName || '')
    if (
      cKey === 'pet:2' ||
      cKey === 'pet:4' ||
      pname.includes('常规贩售') ||
      pname.includes('常规贩卖') ||
      pname.includes('神秘贩售')
    ) {
      return false
    }
    return true
  })

  // 2. 规范化并按时间升序排列（便于计算垫抽数与保底状态）
  const records = validRaw.map((item, index) => {
    const at = item.at || (item.crateAt ? item.crateAt * 1000 : 0) || Date.now() - (validRaw.length - index) * 60000
    const meta = resolveItemMeta(item, heroMap, petMap)

    const cKey = resolveCanonicalPoolKey(item.poolId, meta.isPet)
    const matchedPool = KNOWN_POOLS[cKey] || KNOWN_POOLS[String(item.poolId)] || {}

    let poolName = item.poolName || matchedPool.name || (meta.isPet ? '魔物常规' : '常规招募')
    if (poolName === '特别贩售' || poolName.includes('特别贩售')) {
      poolName = '魔物常规'
    }
    let poolKind = meta.isPet ? (matchedPool.kind || 'pet_standard') : (matchedPool.kind || 'hero_standard')
    if (poolInfoFallback && String(item.poolId) === String(poolInfoFallback.id)) {
      poolName = poolName || poolInfoFallback.name
      poolKind = poolKind || poolInfoFallback.kind
    }

    const upTypes = (matchedPool.upTypes && matchedPool.upTypes.length > 0)
      ? matchedPool.upTypes
      : (poolInfoFallback?.upTypes || [])

    const category = classifyPoolKind({ id: cKey, name: poolName, kind: poolKind, upTypes })

    return {
      rawId: item.id || `idx-${index}`,
      typeId: item.typeId || '',
      name: meta.name,
      rare: meta.rare,
      icon: meta.icon,
      img: meta.img,
      isHero: meta.isHero,
      isPet: meta.isPet,
      at,
      poolId: cKey,
      poolName,
      poolKind: category,
      upTypes
    }
  }).sort((a, b) => a.at - b.at)

  // 3. 初始化各卡池宏观分类桶（用于全局欧非总览统计：伙伴限定、魔物限定、伙伴常规、魔物常规）
  const buckets = {
    hero_limited: { name: '角色限定', pulls: 0, golds: [], purples: [] },
    pet_limited: { name: '魔物限定', pulls: 0, golds: [], purples: [] },
    hero_standard: { name: '角色常规', pulls: 0, golds: [], purples: [] },
    pet_standard: { name: '魔物常规', pulls: 0, golds: [], purples: [] }
  }

  // 独立卡池保底跟踪桶（解决官方多卡池保底互不相通机制）
  const poolBuckets = new Map()
  function getPoolBucket(poolId, poolName, poolKind, upTypes) {
    if (!poolBuckets.has(poolId)) {
      poolBuckets.set(poolId, {
        id: poolId,
        name: poolName,
        kind: poolKind,
        upTypes: upTypes || [],
        pulls: 0,
        pityCount: 0,
        pityMax: GAME_GACHA_CONFIG.PITY_5_STAR,
        isGuaranteedUp: false,
        pendingPurples: [],
        golds: [],
        purples: [],
        lastAt: 0
      })
    }
    return poolBuckets.get(poolId)
  }

  // 记录每个角色/魔物的首次获得（用于 New 徽章标记）
  const seenItems = new Set()

  // 4. 逐条遍历：按【独立卡池】完全隔离计算垫抽数与保底状态
  for (const r of records) {
    const pb = getPoolBucket(r.poolId, r.poolName, r.poolKind, r.upTypes)
    pb.pulls++
    pb.pityCount++
    pb.lastAt = Math.max(pb.lastAt, r.at)

    const b = buckets[r.poolKind] || (r.isPet ? buckets.pet_standard : buckets.hero_standard)
    b.pulls++

    const isNew = !seenItems.has(r.typeId)
    seenItems.add(r.typeId)

    if (r.rare === 5) {
      const pullCost = pb.pityCount
      pb.pityCount = 0 // 该卡池独立重置保底

      let isUp = false
      if (r.upTypes && r.upTypes.length > 0) {
        isUp = r.upTypes.includes(r.typeId)
      } else if (r.poolKind === 'hero_limited' || r.poolKind === 'pet_limited') {
        isUp = true
      } else {
        isUp = false
      }

      // 该卡池专属大保底状态机流转：
      // 若本次命中 UP，则重置大保底；若本次歪了，则进入大保底必中 UP 态
      if (isUp) {
        pb.isGuaranteedUp = false
      } else if (r.poolKind === 'hero_limited' || r.poolKind === 'pet_limited' || (r.upTypes && r.upTypes.length > 0)) {
        pb.isGuaranteedUp = true
      }

      const goldMeta = {
        ...r,
        pullCount: pullCost,
        isUp,
        isNew,
        isGuaranteed: pb.isGuaranteedUp,
        purples: [...pb.pendingPurples] // 挂载出这个 5 星期间在【该卡池内】掉落的所有 4 星
      }
      pb.golds.push(goldMeta)
      b.golds.push(goldMeta)
      pb.pendingPurples = []
    } else if (r.rare === 4) {
      const purpleMeta = { ...r, isNew }
      pb.purples.push(purpleMeta)
      b.purples.push(purpleMeta)
      pb.pendingPurples.push(purpleMeta)
    }
  }

  // 4. 指标统计汇总
  const totalPulls = records.length
  const totalCost = totalPulls * GAME_GACHA_CONFIG.CRYSTAL_PER_PULL
  const allGolds = [
    ...buckets.hero_limited.golds,
    ...buckets.pet_limited.golds,
    ...buckets.hero_standard.golds,
    ...buckets.pet_standard.golds
  ]
  const allPurples = [
    ...buckets.hero_limited.purples,
    ...buckets.pet_limited.purples,
    ...buckets.hero_standard.purples,
    ...buckets.pet_standard.purples
  ]

  const goldCount = allGolds.length
  const purpleCount = allPurples.length
  const blueCount = Math.max(0, totalPulls - goldCount - purpleCount)
  const avgGoldPulls = goldCount > 0 ? Number((totalPulls / goldCount).toFixed(1)) : 0
  const goldRate = totalPulls > 0 ? Number(((goldCount / totalPulls) * 100).toFixed(2)) : 0

  // 1. 角色限定专属指标（伙伴）
  const lim = buckets.hero_limited
  const limGoldCount = lim.golds.length
  const limUpCount = lim.golds.filter(g => g.isUp).length
  const limOffCount = Math.max(0, limGoldCount - limUpCount)
  const limUpRate = limGoldCount > 0 ? Number(((limUpCount / limGoldCount) * 100).toFixed(1)) : 0
  const limAvgGold = limGoldCount > 0 ? Number((lim.pulls / limGoldCount).toFixed(1)) : 0
  const limAvgUp = limUpCount > 0 ? Number((lim.pulls / limUpCount).toFixed(1)) : 0

  // 2. 魔物限定专属指标（魔物）
  const petLim = buckets.pet_limited
  const petLimGoldCount = petLim.golds.length
  const petLimUpCount = petLim.golds.filter(g => g.isUp).length
  const petLimOffCount = Math.max(0, petLimGoldCount - petLimUpCount)
  const petLimUpRate = petLimGoldCount > 0 ? Number(((petLimUpCount / petLimGoldCount) * 100).toFixed(1)) : 0
  const petLimAvgGold = petLimGoldCount > 0 ? Number((petLim.pulls / petLimGoldCount).toFixed(1)) : 0
  const petLimAvgUp = petLimUpCount > 0 ? Number((petLim.pulls / petLimUpCount).toFixed(1)) : 0

  // 3. 常规池合并指标（常规：角色常规 + 魔物常规）
  const heroStd = buckets.hero_standard
  const petStd = buckets.pet_standard
  const stdPulls = heroStd.pulls + petStd.pulls
  const stdHeroGoldCount = heroStd.golds.length
  const stdPetGoldCount = petStd.golds.length
  const stdTotalGoldCount = stdHeroGoldCount + stdPetGoldCount
  const stdAvgGold = stdTotalGoldCount > 0 ? Number((stdPulls / stdTotalGoldCount).toFixed(1)) : 0

  // 计算限定池连 UP 次数与连续歪统计（全面支持历史最高连胜与当前连胜）
  let maxUpStreak = 0
  let curRunningUpStreak = 0
  let maxOffStreak = 0
  let curRunningOffStreak = 0

  for (const g of lim.golds) {
    if (g.isUp) {
      curRunningUpStreak++
      curRunningOffStreak = 0
      if (curRunningUpStreak > maxUpStreak) {
        maxUpStreak = curRunningUpStreak
      }
    } else {
      curRunningOffStreak++
      curRunningUpStreak = 0
      if (curRunningOffStreak > maxOffStreak) {
        maxOffStreak = curRunningOffStreak
      }
    }
  }

  const currentUpStreak = curRunningUpStreak
  const currentOffStreak = curRunningOffStreak

  // 欧非评价
  const luck = evaluateLuckScore({
    avgGoldPulls: avgGoldPulls || 25,
    upRate: limGoldCount > 0 ? limUpRate : 50,
    goldCount
  })

  // 欧皇/战神成就标签生成（全面对标主流抽卡分析「x连UP」「十连双金」「单抽出奇迹」「小保底全胜」）
  const tags = []

  // 1. 连 UP 标签（无论历史还是当前，只要达成过 2 连 UP 及以上必展示）
  if (maxUpStreak >= 2) {
    const isGoldPill = maxUpStreak >= 4
    if (currentUpStreak >= 2 && currentUpStreak === maxUpStreak) {
      tags.push({ text: `${currentUpStreak}连UP`, type: isGoldPill ? 'tag-gold' : 'tag-emerald' })
    } else {
      tags.push({ text: `${maxUpStreak}连UP`, type: isGoldPill ? 'tag-gold' : 'tag-emerald' })
    }
  }

  // 2. 小保底胜率/大保底状态
  if (limGoldCount >= 2 && limOffCount === 0) {
    tags.push({ text: '小保底全胜', type: 'tag-emerald' })
  } else if (lim.isGuaranteedUp) {
    tags.push({ text: '大保底就绪', type: 'tag-amber' })
  }

  // 3. 连续歪标签（若连续歪 2 次及以上，客观呈现非酋战况）
  if (maxOffStreak >= 2) {
    tags.push({ text: `连歪${maxOffStreak}次`, type: 'tag-danger' })
  }

  // 4. 十连双金与超神单抽标签（同卡池短时间内连续出金判真·十连双金，否则判十连内连金）
  let hasDoubleGold = false
  let hasNearDoubleGold = false
  let minGoldPull = 999
  for (let i = 0; i < allGolds.length; i++) {
    if (allGolds[i].pullCount < minGoldPull) {
      minGoldPull = allGolds[i].pullCount
    }
    if (i > 0 && allGolds[i].pullCount <= 10) {
      const prev = allGolds[i - 1]
      const cur = allGolds[i]
      const samePool = cur.poolKey === prev.poolKey
      const sameTenPullWindow = samePool && cur.at && prev.at && Math.abs(cur.at - prev.at) <= 15000
      if (sameTenPullWindow) hasDoubleGold = true
      else hasNearDoubleGold = true
    }
  }
  if (hasDoubleGold) {
    tags.push({ text: '十连双金', type: 'tag-gold' })
  } else if (hasNearDoubleGold) {
    tags.push({ text: '十连内连金', type: 'tag-emerald' })
  }
  if (minGoldPull === 1) {
    tags.push({ text: '单抽出奇迹', type: 'tag-gold' })
  }

  // 5. 出金率标签（官方综合概率 4.3%，>= 5.5% 才属超常）
  if (goldRate >= 5.5) {
    tags.push({ text: `超高出金率 ${goldRate}%`, type: 'tag-emerald' })
  } else if (totalPulls > 0) {
    tags.push({ text: `综合出金率 ${goldRate}%`, type: 'tag-neutral' })
  }

  // 5. 按卡池聚合时间线（彻底解决卡池重复出现问题：每个真实卡池独立聚合为单一卡片）
  // 按照卡池的最新抽卡时间倒序展示
  const bannerMap = new Map()

  for (const item of records) {
    const bannerKey = `${item.poolKind}::${item.poolId}::${item.poolName}`
    if (!bannerMap.has(bannerKey)) {
      bannerMap.set(bannerKey, {
        key: bannerKey,
        poolId: item.poolId,
        poolName: item.poolName,
        poolKind: item.poolKind,
        upHeroes: item.upTypes || [],
        pulls: 0,
        golds: [],
        purples: [],
        items: [],
        firstAt: item.at,
        lastAt: item.at
      })
    }

    const bGroup = bannerMap.get(bannerKey)
    bGroup.pulls++
    bGroup.items.push(item)
    bGroup.lastAt = Math.max(bGroup.lastAt, item.at)
    bGroup.firstAt = Math.min(bGroup.firstAt, item.at)

    if (item.rare === 5) {
      const gDetail = (buckets[item.poolKind]?.golds || []).find(g => g.rawId === item.rawId)
      bGroup.golds.push(gDetail || { ...item, pullCount: 1, isUp: true })
    } else if (item.rare === 4) {
      bGroup.purples.push(item)
    }
  }

  // 转换为数组，按最后活跃时间倒序，卡池内部的出金列表也按时间倒序（最新的在最上方）
  const bannerGroups = Array.from(bannerMap.values())
    .map(b => {
      // 计算该卡池自最后一次出金到目前，在【该卡池内】垫了多少抽（items 顺序为时间升序）
      let pitySinceLastGold = 0
      for (const it of b.items) {
        pitySinceLastGold++
        if (it.rare === 5) {
          pitySinceLastGold = 0
        }
      }
      return {
        ...b,
        pityCount: pitySinceLastGold,
        golds: [...b.golds].reverse(),
        items: [...b.items].reverse()
      }
    })
    .sort((a, b) => {
      const orderMap = { hero_limited: 1, pet_limited: 2, hero_standard: 3, pet_standard: 4 }
      const diffKind = (orderMap[a.poolKind] || 99) - (orderMap[b.poolKind] || 99)
      if (diffKind !== 0) return diffKind
      return b.lastAt - a.lastAt
    })

  // 6. 5星伙伴与魔物收藏汇总（对标 Star Rail 收藏网格，魔物与伙伴均区分限定与常驻）
  const collectionMap = new Map()
  let totalLimitedGoldCount = 0
  let totalStandardGoldCount = 0

  for (const g of allGolds) {
    const petMeta = KNOWN_PETS[g.typeId]
    const isLimited = g.isHero ? !!g.isUp : (g.isUp || !!petMeta?.isLimited)

    if (isLimited) {
      totalLimitedGoldCount++
    } else {
      totalStandardGoldCount++
    }

    if (!collectionMap.has(g.typeId)) {
      collectionMap.set(g.typeId, {
        typeId: g.typeId,
        name: g.name,
        rare: g.rare,
        icon: g.icon,
        isPet: g.isPet,
        isHero: g.isHero,
        isLimited,
        isUp: g.isUp,
        count: 0
      })
    }
    collectionMap.get(g.typeId).count++
  }

  // 排序：限定排在前面，常驻排在后面；同类别下按出金数量降序（完美对标星铁图2展示）
  const goldCollection = Array.from(collectionMap.values()).sort((a, b) => {
    if (a.isLimited !== b.isLimited) {
      return a.isLimited ? -1 : 1
    }
    return b.count - a.count
  })

  // 独立卡池保底明细列表（支持前端展示各个独立卡池的真实垫抽数）
  const poolPities = Array.from(poolBuckets.values()).map(pb => ({
    id: pb.id,
    name: pb.name,
    kind: pb.kind,
    upTypes: pb.upTypes,
    pulls: pb.pulls,
    pityCount: pb.pityCount,
    pityMax: pb.pityMax,
    remain: Math.max(0, pb.pityMax - pb.pityCount),
    isGuaranteedUp: pb.isGuaranteedUp,
    lastAt: pb.lastAt
  })).sort((a, b) => {
    const orderMap = { hero_limited: 1, pet_limited: 2, hero_standard: 3, pet_standard: 4 }
    const diffKind = (orderMap[a.kind] || 99) - (orderMap[b.kind] || 99)
    if (diffKind !== 0) return diffKind
    return b.lastAt - a.lastAt
  })

  // 宏观分类的已垫抽数取该分类下最新活跃卡池的独立垫抽数
  const latestLim = poolPities.find(p => p.kind === 'hero_limited')
  const latestPetLim = poolPities.find(p => p.kind === 'pet_limited')
  const latestStd = poolPities.find(p => p.kind === 'hero_standard')
  const latestPetStd = poolPities.find(p => p.kind === 'pet_standard')

  return {
    overview: {
      totalPulls,
      totalCost,
      goldCount,
      limitedGoldCount: totalLimitedGoldCount,
      standardGoldCount: totalStandardGoldCount,
      purpleCount,
      blueCount,
      goldRate,
      avgGoldPulls,
      luck,
      tags,
      goldCollection
    },
    heroLimited: {
      pulls: lim.pulls,
      goldCount: limGoldCount,
      upCount: limUpCount,
      offCount: limOffCount,
      upRate: limUpRate,
      avgGoldPulls: limAvgGold,
      avgUpPulls: limAvgUp,
      upStreak: currentUpStreak,
      maxUpStreak,
      pityCount: latestLim ? latestLim.pityCount : 0,
      pityMax: GAME_GACHA_CONFIG.PITY_5_STAR,
      isGuaranteedUp: latestLim ? latestLim.isGuaranteedUp : false,
      golds: lim.golds
    },
    petLimited: {
      pulls: petLim.pulls,
      goldCount: petLimGoldCount,
      upCount: petLimUpCount,
      offCount: petLimOffCount,
      upRate: petLimUpRate,
      avgGoldPulls: petLimAvgGold,
      avgUpPulls: petLimAvgUp,
      pityCount: latestPetLim ? latestPetLim.pityCount : 0,
      pityMax: GAME_GACHA_CONFIG.PITY_5_STAR,
      isGuaranteedUp: latestPetLim ? latestPetLim.isGuaranteedUp : false,
      golds: petLim.golds
    },
    standard: {
      pulls: stdPulls,
      goldCount: stdTotalGoldCount,
      heroGoldCount: stdHeroGoldCount,
      petGoldCount: stdPetGoldCount,
      avgGoldPulls: stdAvgGold,
      pityCount: latestStd ? latestStd.pityCount : (latestPetStd ? latestPetStd.pityCount : 0),
      pityMax: GAME_GACHA_CONFIG.PITY_5_STAR
    },
    heroStandard: {
      pulls: heroStd.pulls,
      goldCount: stdHeroGoldCount,
      avgGoldPulls: stdHeroGoldCount > 0 ? Number((heroStd.pulls / stdHeroGoldCount).toFixed(1)) : 0,
      pityCount: latestStd ? latestStd.pityCount : 0,
      pityMax: GAME_GACHA_CONFIG.PITY_5_STAR,
      golds: heroStd.golds
    },
    petStandard: {
      pulls: petStd.pulls,
      goldCount: stdPetGoldCount,
      avgGoldPulls: stdPetGoldCount > 0 ? Number((petStd.pulls / stdPetGoldCount).toFixed(1)) : 0,
      pityCount: latestPetStd ? latestPetStd.pityCount : 0,
      pityMax: GAME_GACHA_CONFIG.PITY_5_STAR,
      golds: petStd.golds
    },
    // 兼容历史字段
    pet: {
      pulls: petLim.pulls + petStd.pulls,
      goldCount: petLimGoldCount + stdPetGoldCount,
      avgGoldPulls: (petLimGoldCount + stdPetGoldCount) > 0 ? Number(((petLim.pulls + petStd.pulls) / (petLimGoldCount + stdPetGoldCount)).toFixed(1)) : 0,
      pityCount: latestPetLim ? latestPetLim.pityCount : (latestPetStd ? latestPetStd.pityCount : 0),
      pityMax: GAME_GACHA_CONFIG.PITY_5_STAR,
      golds: [...petLim.golds, ...petStd.golds]
    },
    poolPities,
    banners: bannerGroups,
    records: [...records].reverse()
  }
}

/**
 * 产生一套贴合《深渊之歌》36抽保底机制的逼真演示数据
 */
export function generateDemoGachaRecords() {
  const now = Date.now()
  const records = []
  let idGen = 10001

  // 1. 公主招募（德莉 UP，72 抽两金：首金歪奇瓦 30 抽，二金大保底德莉 18 抽，已垫 8 抽）
  for (let i = 1; i <= 30; i++) {
    const isGold = (i === 30)
    const isPurple = (i === 8 || i === 18 || i === 27)
    records.push({
      id: idGen++,
      poolId: '2',
      poolName: '公主招募',
      typeId: isGold ? 'hero_019' : (isPurple ? 'hero_046' : (i % 2 === 0 ? 'hero_001' : 'hero_062')),
      crateAt: Math.floor((now - (180 - records.length) * 3600000) / 1000)
    })
  }
  for (let i = 1; i <= 18; i++) {
    const isGold = (i === 18)
    const isPurple = (i === 9)
    records.push({
      id: idGen++,
      poolId: '2',
      poolName: '公主招募',
      typeId: isGold ? 'hero_060' : (isPurple ? 'hero_034' : (i % 2 === 0 ? 'hero_005' : 'hero_008')),
      crateAt: Math.floor((now - (180 - records.length) * 3600000) / 1000)
    })
  }
  for (let i = 1; i <= 8; i++) {
    records.push({
      id: idGen++,
      poolId: '2',
      poolName: '公主招募',
      typeId: i === 5 ? 'hero_045' : 'hero_062',
      crateAt: Math.floor((now - (180 - records.length) * 3600000) / 1000)
    })
  }

  // 2. 幽夜招募（洛莉安 UP，承接前池已垫 8 抽，本池 14 抽欧皇出洛莉安，合计 22 抽；随后垫 16 抽）
  for (let i = 1; i <= 14; i++) {
    const isGold = (i === 14)
    records.push({
      id: idGen++,
      poolId: '5',
      poolName: '幽夜招募',
      typeId: isGold ? 'hero_071' : (i === 6 ? 'hero_036' : 'hero_001'),
      crateAt: Math.floor((now - (180 - records.length) * 3600000) / 1000)
    })
  }
  // 当前限定池已垫 16 抽
  for (let i = 1; i <= 16; i++) {
    records.push({
      id: idGen++,
      poolId: '5',
      poolName: '幽夜招募',
      typeId: i === 10 ? 'hero_030' : 'hero_009',
      crateAt: Math.floor((now - (180 - records.length) * 3600000) / 1000)
    })
  }

  // 3. 常规招募（30 抽出乌尔勒，随后已垫 10 抽）
  for (let i = 1; i <= 40; i++) {
    const isGold = (i === 30)
    const isPurple = (i === 10 || i === 20 || i === 38)
    records.push({
      id: idGen++,
      poolId: '1',
      poolName: '常规招募',
      typeId: isGold ? 'hero_065' : (isPurple ? 'hero_036' : 'hero_005'),
      crateAt: Math.floor((now - (180 - records.length) * 3600000) / 1000)
    })
  }

  // 4. 魔物蛋御卫贩售（24 抽出一枚 5 星圣骑士史莱姆蛋，随后已垫 7 抽）
  for (let i = 1; i <= 31; i++) {
    const isGold = (i === 24)
    const isPurple = (i === 9 || i === 18)
    records.push({
      id: idGen++,
      poolId: 'pet:3',
      poolName: '御卫贩售',
      typeId: isGold ? 'pet_106' : (isPurple ? 'pet_063' : 'pet_007'),
      crateAt: Math.floor((now - (180 - records.length) * 3600000) / 1000)
    })
  }

  return {
    version: 1,
    exportedAt: Math.floor(now / 1000),
    player: {
      uid: '10001',
      nickname: '小小工匠',
      server: '官方服务器'
    },
    records
  }
}
