/**
 * 从完整 tower/battle/room 配置生成怪物实际出现楼层的轻量索引。
 * 默认读取 游戏数据/配置表；也可把配置目录作为第一个参数传入。
 *
 * 也可作为模块使用：`buildMonsterTowerUsage({ configDir?, rawDir? })` 返回 JSON 文本，
 * 由 `rebuild-derived-raw.mjs` 统一调度（不会写盘）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { derivedDir } from '../parse/shared.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** 纯计算：返回要写入的 JSON 文本。 */
export function buildMonsterTowerUsage({ configDir, rawDir } = {}) {
  const cfgDir = resolve(configDir || join(repoRoot, '..', '游戏数据', '配置表'))
  const rDir = resolve(rawDir || join(repoRoot, 'raw'))
  const readConfig = file => JSON.parse(readFileSync(join(cfgDir, file), 'utf8'))
  const towerData = readConfig('tower.json').datas || {}
  const battleData = readConfig('battle.json').datas || {}
  const roomConfig = readConfig('room.json')
  const roomData = roomConfig.datas || roomConfig
  const monsterData = JSON.parse(readFileSync(join(rDir, 'mon.json'), 'utf8')).datas || {}

  const isBossMonster = monsterId => {
    const monster = monsterData[monsterId]
    const keyList = Array.isArray(monster?.unitData?.keyList) ? monster.unitData.keyList : []
    return Number(monster?.monRank || 0) === 3 || keyList.includes('boss')
  }

  const collectValues = (value, key, result = []) => {
    if (!value || typeof value !== 'object') return result
    if (Array.isArray(value)) {
      value.forEach(entry => collectValues(entry, key, result))
      return result
    }
    Object.entries(value).forEach(([entryKey, entry]) => {
      if (entryKey === key) result.push(entry)
      collectValues(entry, key, result)
    })
    return result
  }

  const getRoomMonsterIds = room => {
    const rounds = room?.battleData?.monRounds || room?.monRounds || []
    return rounds.flatMap(round => (round?.mons || round?.monsters || [])
      .map(monster => String(monster?.typeId || ''))
      .filter(Boolean))
  }

  const appearances = new Map()
  Object.entries(towerData).forEach(([towerId, tower]) => {
    ;(tower?.layers || []).forEach(layer => {
      ;(layer?.battles || []).forEach(battleRef => {
        const battleId = String(battleRef?.battleId || '')
        const roomIds = new Set(collectValues(battleData[battleId], 'roomTypeId').filter(value => typeof value === 'string'))
        roomIds.forEach(roomId => {
          new Set(getRoomMonsterIds(roomData[roomId])).forEach(monsterId => {
            if (!isBossMonster(monsterId)) return
            const towerMap = appearances.get(monsterId) || new Map()
            const entry = towerMap.get(towerId) || { towerId, towerName: tower?.name || towerId, floors: new Set() }
            entry.floors.add(Number(layer?.layer || 0))
            towerMap.set(towerId, entry)
            appearances.set(monsterId, towerMap)
          })
        })
      })
    })
  })

  const datas = Object.fromEntries([...appearances.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monsterId, towerMap]) => [monsterId, [...towerMap.values()].map(entry => ({
      towerId: entry.towerId,
      towerName: entry.towerName,
      floors: [...entry.floors].filter(Boolean).sort((a, b) => a - b)
    }))]))

  return JSON.stringify({ generatedFrom: ['tower.json', 'battle.json', 'room.json'], datas })
}

// 直接运行时才写盘
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputFile = join(derivedDir, 'monsterTowerUsage.json')
  const text = buildMonsterTowerUsage({ configDir: process.argv[2] })
  writeFileSync(outputFile, text, 'utf8')
  const datas = JSON.parse(text).datas
  console.log(`已生成 ${outputFile}`)
  console.log(`共 ${Object.keys(datas).length} 个怪物形态，${Object.values(datas).flatMap(entries => entries.flatMap(entry => entry.floors)).length} 条楼层记录`)
}
