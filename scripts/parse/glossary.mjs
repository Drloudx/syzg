/**
 * 词条页预解析：public/data/parsed/glossary.json
 * 对应浏览器端 src/utils/glossaryData.js 的 buildGlossaryData（同一纯函数）。
 *
 * 除 buff 表外还要读角色/魔物/怪物/技能/物品表：用来建立「这个状态是谁在施加」的来源索引。
 * 另读 heroSkillUpgrade.json：它决定游戏内的技能等级上限（每个稀有度 12 行），
 * 词条库据此滤掉配置里有、客户端升不到的 Lv.13–21。
 *
 * 🔴 **来源按三张图鉴的可见性过滤**：角色/魔物/怪物来源必须能在对应图鉴里点开，
 * 否则 chip 点了没反应。可见 id 取自同一次构建的 `heroes.json` / `pets.json` / `monsters.json`
 * （`scripts/parse/index.mjs` 的 jobs 顺序保证了它们先于 glossary 产出），
 * 口径与运行时 `HeroesView` / `PetsView` / `MonstersView` 的 `filter` 一致。
 * 不这么做的话，`hero.hide` 角色（阿迪拉、格薇勒、艾茵、米托拉（旧））会以来源身份出现在词条里，
 * 但角色图鉴里没有它们 —— 只能靠前端标注「图鉴未收录」兜底，属于修表象。
 */
import { buildGlossaryData } from '../../src/utils/glossaryData.js'
import { readJson } from './shared.mjs'

export function buildGlossaryFile(monstersData, { heroes, pets } = {}) {
  let monsters = monstersData
  if (!monsters) {
    try {
      monsters = readJson('parsed/monsters.json')?.monsters
    } catch {}
  }
  // 可见 id 集合：优先用同一次构建的内存产物，缺了就回读上一版产物。
  const heroList = heroes || readJson('parsed/heroes.json')?.heroes || []
  const petList = pets || readJson('parsed/pets.json')?.pets || []
  const monsterList = Array.isArray(monsters) ? monsters : []

  const data = buildGlossaryData({
    buffJson: readJson('buff.json'),
    heroJson: readJson('hero.json'),
    petJson: readJson('pet.json'),
    monJson: readJson('mon.json'),
    skillJson: readJson('skill.json'),
    skillTriggerJson: readJson('skillTrigger.json'),
    itemJson: readJson('item.json'),
    heroSkillUpgradeJson: readJson('heroSkillUpgrade.json'),
    fileMonJson: readJson('fileMon.json'),
    monstersJson: monsters,
    visibleHeroIds: new Set(heroList.map(h => h.id).filter(Boolean)),
    visiblePetIds: new Set(petList.map(p => p.id).filter(Boolean)),
    visibleMonsterIds: new Set(
      monsterList.flatMap(m => [m.id, ...(m.forms || []).map(f => f.id)]).filter(Boolean)
    )
  })
  return { file: 'parsed/glossary.json', data }
}
