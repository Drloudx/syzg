/**
 * 怪物图鉴预解析：列表、形态、技能机制与配置奖励。
 * 对应浏览器端 src/utils/monsterParser.js 的 buildMonsterData（同一纯函数）
 * 依赖物品表（由 index.mjs 传入）
 */
import { buildMonsterMaps, buildMonsterData, buildExtraMonsterData } from '../../src/utils/monsterParser.js'
import { readJson, readDerivedJson } from './shared.mjs'

export function buildMonstersFile(itemData) {
  const baseMaps = buildMonsterMaps({
    items: itemData.items,
    lanDict: itemData.lanDict,
    rewards: itemData.rewards,
    fileMonRes: readJson('fileMon.json'),
    monRes: readJson('mon.json'),
    skillRes: readJson('skill.json'),
    buffRes: readJson('buff.json'),
    equipGroupRes: readJson('equip/equipGroup.json'),
    aiRes: readJson('ai.json'),
    towerUsageRes: readDerivedJson('monsterTowerUsage.json'),
    exploreAreaRes: readJson('exploreArea.json'),
    roomRes: readJson('room.json'),
    battleRes: readJson('battle.json'),
    dungeonBattleRes: readDerivedJson('dungeonBattle.json'),
    dungeonBattleRoomsRes: readDerivedJson('dungeonBattleRooms.json')
  })
  const officialMonsters = buildMonsterData(baseMaps)
  const extraMonsters = buildExtraMonsterData(baseMaps, officialMonsters)
  const files = [{
    file: 'parsed/monsters.json',
    data: {
      monsters: officialMonsters,
      extraMonsters
    }
  }]
  return { files }
}
