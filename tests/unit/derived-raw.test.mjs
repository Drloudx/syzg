import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { buildDungeonRoutes } from '../../scripts/parse/extractDungeonRoutes.mjs'
import { buildMonsterTowerUsage } from '../../scripts/dev/update-monster-tower-usage.mjs'

const fixture = t => {
  const directory = mkdtempSync(join(tmpdir(), 'myrzg-derived-'))
  t.after(() => {
    assert.equal(dirname(directory), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('myrzg-derived-'))
    rmSync(directory, { recursive: true, force: true })
  })
  return directory
}

const writeJson = (root, name, value) => {
  const target = join(root, name)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(value), 'utf8')
}

test('buildDungeonRoutes 只收「副本」战斗并保留层/房间/连接结构', () => {
  const source = {
    datas: {
      dungeon_a: {
        category: ['副本', 'c2'],
        layers: [{
          layerDatas: [{
            layerId: 'f1A',
            name: '第一层',
            chance: 1,
            startRoomId: 'r1',
            endRoom: 'r2',
            startEntrance: 'entLU',
            map: {
              size: { w: 100, h: 200 },
              levelRoom: [{ typeId: 'r1', x: 1, y: 2 }],
              link: [{ levelRooms: ['r1', 'r2'], x1: 0, y1: 0, x2: 1, y2: 1 }]
            },
            rooms: {
              r1: { typeId: 'r1', roomTypeId: 'enter', name: 'start', roomIcon: 5, hiddenRoom: false, gameLevel: 10, randomRooms: [] },
              r2: { typeId: 'r2', roomTypeId: 'battle', name: 'fight', roomIcon: 3, hiddenRoom: true, gameLevel: 12,
                randomRooms: [{ roomTypeId: 'cand', chance: 2, roomIcon: 7 }] }
            }
          }]
        }]
      },
      not_dungeon: { category: ['主线'], layers: [{ layerDatas: [{ rooms: {} }] }] },
      no_layers: { category: ['副本'] }
    }
  }
  const out = JSON.parse(buildDungeonRoutes(source))
  assert.deepEqual(Object.keys(out.datas), ['dungeon_a'])
  const layer = out.datas.dungeon_a.layers[0]
  assert.equal(layer.startRoomId, 'r1')
  assert.deepEqual(layer.size, { w: 100, h: 200 })
  assert.deepEqual(layer.links, [{ rooms: ['r1', 'r2'], x1: 0, y1: 0, x2: 1, y2: 1 }])
  const r2 = layer.rooms.find(r => r.id === 'r2')
  assert.equal(r2.hidden, true)
  assert.equal(r2.level, 12)
  assert.deepEqual(r2.candidates, [{ typeId: 'cand', chance: 2, icon: 7 }])
})

test('buildDungeonRoutes 对空/异常输入返回空 datas 而不抛错', () => {
  assert.deepEqual(JSON.parse(buildDungeonRoutes({})), { datas: {} })
  assert.deepEqual(JSON.parse(buildDungeonRoutes({ datas: {} })), { datas: {} })
})

test('buildMonsterTowerUsage 只为 Boss 怪记录楼层并从 tower/battle/room 正确串联', t => {
  const dir = fixture(t)
  const cfg = join(dir, '配置表')
  const raw = join(dir, 'raw')
  mkdirSync(cfg, { recursive: true })
  mkdirSync(raw, { recursive: true })

  writeJson(cfg, 'tower.json', { datas: { tower1: { name: '塔一', layers: [{ layer: 3, battles: [{ battleId: 'b1' }] }] } } })
  writeJson(cfg, 'battle.json', { datas: { b1: { rooms: [{ roomTypeId: 'room1' }] } } })
  writeJson(cfg, 'room.json', { datas: { room1: { battleData: { monRounds: [{ mons: [{ typeId: 'bossMon' }, { typeId: 'normalMon' }] }] } } } })
  writeJson(raw, 'mon.json', {
    datas: {
      bossMon: { monRank: 3, unitData: { keyList: [] } },
      normalMon: { monRank: 1, unitData: { keyList: [] } }
    }
  })

  const out = JSON.parse(buildMonsterTowerUsage({ configDir: cfg, rawDir: raw }))
  assert.deepEqual(out.generatedFrom, ['tower.json', 'battle.json', 'room.json'])
  assert.ok(out.datas.bossMon, 'Boss 怪应被收录')
  assert.equal(out.datas.normalMon, undefined, '非 Boss 怪不应收录')
  assert.deepEqual(out.datas.bossMon[0].floors, [3])
})

test('buildMonsterTowerUsage 识别 keyList 里的 boss 标记', t => {
  const dir = fixture(t)
  const cfg = join(dir, '配置表')
  const raw = join(dir, 'raw')
  mkdirSync(cfg, { recursive: true })
  mkdirSync(raw, { recursive: true })
  writeJson(cfg, 'tower.json', { datas: { t: { layers: [{ layer: 1, battles: [{ battleId: 'b' }] }] } } })
  writeJson(cfg, 'battle.json', { datas: { b: { rooms: [{ roomTypeId: 'r' }] } } })
  writeJson(cfg, 'room.json', { datas: { r: { monRounds: [{ mons: [{ typeId: 'm' }] }] } } })
  writeJson(raw, 'mon.json', { datas: { m: { monRank: 1, unitData: { keyList: ['boss'] } } } })
  const out = JSON.parse(buildMonsterTowerUsage({ configDir: cfg, rawDir: raw }))
  assert.ok(out.datas.m, 'keyList 含 boss 的怪也应收录')
})
