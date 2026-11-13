import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getRoomNpcs, ROOM_NPC_MAP } from '../../src/utils/roomNpcMap.js'

test('sp1_7_a_f1A_3 (EX1-7 房间3) 返回结构化 NPC 列表，默认自动去重同名同头像剧本分镜机位', () => {
  const npcs = getRoomNpcs('sp1_7_a_f1A_3')
  assert.equal(npcs.length, 2, '默认去重后应有 2 个 NPC（加尔戈萝与斯卡莉安各 1 位）')

  const rawNpcs = getRoomNpcs('sp1_7_a_f1A_3', { dedupe: false })
  assert.equal(rawNpcs.length, 4, 'dedupe: false 时保留全量 4 个机位实体')

  const names = npcs.map(n => n.name)
  assert.deepEqual(names, ['加尔戈萝', '斯卡莉安'])

  // 验证加尔戈萝头像
  const jegl = npcs.find(n => n.name === '加尔戈萝')
  assert.equal(jegl.icon, 'avatar_Mon_102')
  assert.ok(jegl.iconUrl.includes('avatar_Mon_102.webp'))

  // 验证斯卡莉安头像
  const skla = npcs.find(n => n.name === '斯卡莉安')
  assert.equal(skla.icon, 'at061_0')
  assert.ok(skla.iconUrl.includes('at061_0.webp'))
})

test('所有已解析关卡中标记了 npcCount > 0 的房间均在 ROOM_NPC_MAP 中有定义', () => {
  const stagesDir = 'public/data/parsed/stages'
  const stageFiles = fs.readdirSync(stagesDir).filter(f => f.endsWith('.json'))

  const missing = []
  for (const file of stageFiles) {
    const stage = JSON.parse(fs.readFileSync(path.join(stagesDir, file), 'utf8'))
    for (const diff of (stage.difficulties || [])) {
      for (const room of (diff.rooms || [])) {
        for (const v of (room.variants || [])) {
          if (v.npcCount > 0) {
            const list = getRoomNpcs(v.typeId)
            if (!list || list.length === 0) {
              missing.push({ stage: stage.id, room: v.typeId, npcCount: v.npcCount })
            }
          }
        }
      }
    }
  }

  assert.equal(missing.length, 0, `有 ${missing.length} 个带 NPC 的关卡房间在 ROOM_NPC_MAP 中缺失: ${JSON.stringify(missing)}`)
})
