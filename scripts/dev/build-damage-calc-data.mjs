/**
 * 生成角色伤害计算器的精简数据表 `public/data/parsed/damage-calc.json`。
 *
 * 来源：
 *   - public/data/parsed/heroes.json
 *   - public/data/parsed/monsters.json
 *   - public/data/parsed/monLevelStrength.json
 *   - public/data/parsed/pets.json
 *   - public/data/parsed/items.json
 *   - raw/buff.json
 *
 * 支持 `--check` 参数进行一致性校验。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  extractLevelStrengthMap,
  toDamageHeroRecord,
  toDamageMonsterForms,
} from '../../src/utils/damageCalcData.js'
import { buildDamageEffectsCatalog } from '../../src/utils/damageEffects.js'
import { extractSkillSummonsFromRaw, getSkillDotProfile } from '../../src/utils/damageDoTAndSummons.js'
import { buildHeroStarRecords } from '../../src/utils/heroStarsDamage.js'
import { isBlacklisted, isEquipTierHidden, isHiddenHero } from '../../src/config/blacklist.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const parsedDir = join(root, 'public/data/parsed')
const rawDir = join(root, 'raw')
const OUT = join(parsedDir, 'damage-calc.json')
const CHECK = process.argv.includes('--check')

function readJson(dir, name) {
  const file = join(dir, name)
  if (!existsSync(file)) {
    throw new Error(`缺少输入文件：${file}（先跑 npm run data:build）`)
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

// CI / 线上构建环境自适应：未包含 raw/ 原始表且产物已入库就绪时，跳过重新生成
if (!CHECK && !existsSync(join(rawDir, 'buff.json'))) {
  if (existsSync(OUT)) {
    console.log('\n[data:damage] 检测到当前环境未包含 raw/ 原始表（CI/线上部署环境），且 public/data/parsed/damage-calc.json 已就绪，跳过重新生成。\n')
    process.exit(0)
  }
}

const heroData = readJson(parsedDir, 'heroes.json')
const monsterData = readJson(parsedDir, 'monsters.json')
const levelStrengthData = readJson(parsedDir, 'monLevelStrength.json')
const petsData = readJson(parsedDir, 'pets.json')
const itemsData = readJson(parsedDir, 'items.json')
const buffDatas = readJson(rawDir, 'buff.json')
const rawSkillFile = readJson(rawDir, 'skill.json')
const rawMonFile = readJson(rawDir, 'mon.json')
const rawSkillsMap = rawSkillFile?.datas || rawSkillFile || {}
const monDatas = rawMonFile?.datas || rawMonFile || {}

function enrichAbility(sk) {
  const dotProfile = getSkillDotProfile(sk.id)
  const summons = extractSkillSummonsFromRaw({
    skillId: sk.id,
    rawSkillsMap,
    buffDatas,
    monDatas,
  })
  return {
    ...sk,
    ...(dotProfile ? { dotProfile } : {}),
    ...(summons.length ? { summons } : {}),
  }
}

const heroes = (heroData.heroes || heroData.list || [])
  .filter((h) => h && !isHiddenHero(h) && !isBlacklisted(h))
  .map((h) => {
    const rec = toDamageHeroRecord(h)
    return {
      ...rec,
      skills: rec.skills.map(enrichAbility),
      talentSkills: rec.talentSkills.map(enrichAbility),
      starSkills: buildHeroStarRecords({
        rawHero: h,
        skillTriggersData: itemsData.skillTriggers,
        buffDatas,
      }),
    }
  })
const monsters = (monsterData.monsters || monsterData.list || [])
  .filter((m) => m && !isBlacklisted(m))
  .flatMap(toDamageMonsterForms)
  .filter((form) => !isBlacklisted(form))
const levelStrength = extractLevelStrengthMap(levelStrengthData)
const visibleEquips = (itemsData.items || []).filter(
  (it) => it?.equip && !isBlacklisted(it) && !isEquipTierHidden(it),
)
const visibleSuitIds = new Set(visibleEquips.map((it) => it.equip?.suitTypeId).filter(Boolean))
const visibleEquipPrefixIds = new Set()
for (const it of visibleEquips) {
  for (const group of itemsData.itemAffixes?.[it.typeId] || []) {
    for (const prefixId of group?.prefixes || []) visibleEquipPrefixIds.add(prefixId)
  }
}

const effects = buildDamageEffectsCatalog({
  petsData,
  skillTriggersData: itemsData.skillTriggers,
  buffDatas,
  equipSuitsData: itemsData.equipSuits,
  equipGlobalConfigData: itemsData.equipGlobalConfig,
  visibleSuitIds,
  visibleEquipPrefixIds,
})

const payload = {
  _meta: {
    schemaVersion: 2,
    source: [
      'data/parsed/heroes.json',
      'data/parsed/monsters.json',
      'data/parsed/monLevelStrength.json',
      'data/parsed/pets.json',
      'data/parsed/items.json',
      'raw/buff.json',
    ],
    heroCount: heroes.length,
    monsterFormCount: monsters.length,
    effectCount: effects.pets.length + effects.suits.length + effects.equips.length,
    note: '伤害计算器专用精简表；由 scripts/dev/build-damage-calc-data.mjs 生成，勿手改',
  },
  heroes,
  monsters,
  levelStrength,
  effects,
}

const compact = JSON.stringify(payload)
const pretty = `${JSON.stringify(payload, null, 2)}\n`

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error('❌ damage-calc.json 不存在，请跑 npm run data:damage')
    process.exit(1)
  }
  const current = readFileSync(OUT, 'utf8')
  if (current !== pretty) {
    console.error('❌ damage-calc.json 与当前数据不一致，请重新生成')
    process.exit(1)
  }
  console.log('✅ damage-calc.json 与源数据一致')
  process.exit(0)
}

writeFileSync(OUT, pretty, 'utf8')
const kb = (Buffer.byteLength(compact) / 1024).toFixed(1)
console.log('✅ 已生成 public/data/parsed/damage-calc.json')
console.log(`   ${heroes.length} 角色 / ${monsters.length} 怪物形态 → ${kb} KB`)
