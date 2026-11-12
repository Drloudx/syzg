/**
 * 派生 raw 表统一重建（幂等：内容不变不写盘）。
 *
 * 为什么需要：`sync-raw.mjs` 会跳过 `DERIVED_RAW_FILES`，原表更新后这 4 张派生表
 * 不会自己跟着变，产物会**静默沿用旧数据**。此脚本把它们收进一条命令。
 *
 * | 派生表 | 上游 | 规则 |
 * | --- | --- | --- |
 * | `dungeonBattle.json` | `battle.json` + `instance.json` | `instance.battles[].dungeonBattle` 引用的 id，投影 11 个字段（字符串 `null→""`、`battleLevel/winExp null→0`） |
 * | `dungeonBattleRoutes.json` | `battle.json` | 副本战斗 `layers` → 房间/连接/节点（`buildDungeonRoutes`） |
 * | `dungeonBattleRooms.json` | `battle.json` + `buff*` + 自身 | 只刷新 `roomDetails[*].effects`（`buildRoomEffects`） |
 * | `monsterTowerUsage.json` | `tower/battle/room` + `mon.json` | Boss 怪出现楼层索引（`buildMonsterTowerUsage`） |
 *
 * 用法：
 *   node scripts/dev/rebuild-derived-raw.mjs            # 预览，不写任何文件
 *   node scripts/dev/rebuild-derived-raw.mjs --apply    # 写入有变化的文件
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { derivedDir } from '../parse/shared.mjs'
import { buildRoomEffects } from '../parse/roomEffects.mjs'
import { buildDungeonRoutes } from '../parse/extractDungeonRoutes.mjs'
import { buildMonsterTowerUsage } from './update-monster-tower-usage.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const RAW = join(REPO, 'raw')
const DERIVED = derivedDir

const { values } = parseArgs({ options: { apply: { type: 'boolean' } } })
const APPLY = !!values.apply

const readRaw = name => JSON.parse(readFileSync(join(RAW, name), 'utf8'))
const readDerived = name => JSON.parse(readFileSync(join(DERIVED, name), 'utf8'))
const str = v => (v == null ? '' : v)
const num = v => (v == null ? 0 : Number(v))

/**
 * dungeonBattle.json：字段投影。
 *
 * 键集以**既有文件的键序**为准（它是历史产物，键集合由 `instance` 引用决定）。
 * 上游 `battle.json` 里已不存在的键原样保留，不静默删除条目。
 */
function buildDungeonBattle() {
  const battle = readRaw('battle.json').datas
  const prev = readDerived('dungeonBattle.json').datas
  const FIELDS = ['typeId', 'name', 'des', 'category', 'reward', 'showReward', 'firstReward', 'consume', 'battleLevel', 'winExp', 'tip']
  const NUM = new Set(['battleLevel', 'winExp'])
  const datas = {}
  for (const [k, old] of Object.entries(prev)) {
    if (!(k in battle)) {
      datas[k] = old
      continue
    }
    const b = battle[k]
    const node = {}
    for (const f of FIELDS) {
      if (NUM.has(f)) node[f] = num(b[f])
      else if (f === 'category') node[f] = Array.isArray(b[f]) ? b[f] : []
      else node[f] = str(b[f])
    }
    datas[k] = node
  }
  return { file: 'dungeonBattle.json', text: JSON.stringify({ datas }) }
}

/** dungeonBattleRooms.json：只刷新 effects，其余字段原样。effects 来自 `room.json` 的 battleData。 */
function buildDungeonBattleRooms() {
  const roomCfg = readRaw('room.json')
  const roomMap = roomCfg.datas || roomCfg
  const buffMap = readRaw('buff.json')
  const buffTeamMap = readRaw('battleBuffTeam.json')
  const buffCardMap = readRaw('battleBuffCard.json')
  const extracted = readDerived('dungeonBattleRooms.json')
  const buffs = { buffMap, buffTeamMap, buffCardMap }
  for (const [roomId, detail] of Object.entries(extracted.roomDetails || {})) {
    detail.effects = buildRoomEffects(roomMap[roomId]?.battleData, buffs)
  }
  return { file: 'dungeonBattleRooms.json', text: JSON.stringify(extracted) }
}

const plan = [
  buildDungeonBattle(),
  { file: 'dungeonBattleRoutes.json', text: buildDungeonRoutes(readRaw('battle.json')) },
  buildDungeonBattleRooms(),
  { file: 'monsterTowerUsage.json', text: buildMonsterTowerUsage() }
]

console.log('[derived-raw]')
for (const item of plan) {
  const target = join(DERIVED, item.file)
  const before = readFileSync(target, 'utf8')
  if (item.text === before) {
    console.log(`  ${item.file.padEnd(26)} 无变化`)
    continue
  }
  if (APPLY) {
    writeFileSync(target, item.text, 'utf8')
    console.log(`  ${item.file.padEnd(26)} 已更新 ${before.length} → ${item.text.length} 字节`)
  } else {
    console.log(`  ${item.file.padEnd(26)} 将变更 ${before.length} → ${item.text.length} 字节`)
  }
}
if (!APPLY) console.log('  [preview] 加 --apply 才写入')
