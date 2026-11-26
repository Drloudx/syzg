/** Furniture encyclopedia data: public/data/parsed/furniture.json. */
import { buildFurnitureData } from '../../src/utils/furnitureData.js'
import { readJson } from './shared.mjs'

export function buildFurnitureFile() {
  const data = buildFurnitureData({
    homeItemRes: readJson('homeItem.json'),
    itemRes: readJson('item.json'),
    settingRes: readJson('gameSetting.json'),
    consumeRes: readJson('consume.json'),
    playerInitRes: readJson('playerInit.json'),
    conditionRes: readJson('condition.json'),
    taskRes: readJson('task.json'),
    // 用于把「获取方式」里的 market*、房间场景、成就 ID 解析成可读名称
    rewardRes: readJson('reward.json'),
    levelRoomRes: readJson('levelRoom.json'),
    areaRes: readJson('area.json'),
    achievementRes: readJson('achievement.json')
  })
  return { file: 'parsed/furniture.json', data }
}
