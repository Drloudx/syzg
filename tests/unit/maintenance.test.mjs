import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { projectRoot, rawRoot, resolveChild } from '../../scripts/dev/maintenance-paths.mjs'
import { applyRawSyncPlan, createRawSyncPlan, fileDigest } from '../../scripts/dev/raw-sync.mjs'

const fixture = t => {
  const directory = mkdtempSync(join(tmpdir(), 'myrzg-maintenance-'))
  t.after(() => {
    assert.equal(dirname(directory), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('myrzg-maintenance-'))
    rmSync(directory, { recursive: true, force: true })
  })
  const sourceRoot = join(directory, 'source')
  const targetRoot = join(directory, 'raw')
  mkdirSync(sourceRoot)
  const write = (root, file, value) => {
    const target = join(root, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(value))
  }
  return { directory, sourceRoot, targetRoot, write }
}

test('maintenance paths are module-relative and reject escaping paths', () => {
  assert.equal(rawRoot, join(projectRoot, 'raw'))
  assert.ok(existsSync(join(projectRoot, 'package.json')))
  assert.equal(resolveChild(rawRoot, 'hero/hero.json'), join(rawRoot, 'hero/hero.json'))
  assert.throws(() => resolveChild(rawRoot, '..'))
  assert.throws(() => resolveChild(rawRoot, rawRoot))
})

test('preview validates originals and produces aliases without writing', t => {
  const f = fixture(t)
  f.write(f.sourceRoot, 'hero.json', { datas: { hero001: { name: 'Hero' } } })
  f.write(f.sourceRoot, 'condition.json', { datas: {} })
  const plan = createRawSyncPlan(f)
  assert.deepEqual(plan.map(entry => entry.targetName).sort(), ['condition.json', 'hero.json', 'hero/hero.json', 'task/condition.json'])
  assert.ok(plan.every(entry => entry.action === 'add'))
  assert.equal(existsSync(f.targetRoot), false)
})

test('default apply copies missing aliases of matching originals byte-for-byte', t => {
  const f = fixture(t)
  f.write(f.sourceRoot, 'pet.json', { datas: { pet1: { level: 9 } } })
  f.write(f.targetRoot, 'pet.json', { datas: { pet1: { level: 9 } } })
  assert.equal(applyRawSyncPlan(createRawSyncPlan(f)), 1)
  assert.equal(fileDigest(join(f.sourceRoot, 'pet.json')), fileDigest(join(f.targetRoot, 'pet.json')))
  assert.equal(fileDigest(join(f.sourceRoot, 'pet.json')), fileDigest(join(f.targetRoot, 'pet/pet.json')))
})

test('default fill does not create a mismatched alias beside an older original', t => {
  const f = fixture(t)
  f.write(f.sourceRoot, 'pet.json', { newer: true })
  f.write(f.targetRoot, 'pet.json', { old: true })
  const plan = createRawSyncPlan(f)
  assert.deepEqual(plan.map(entry => entry.action), ['keep', 'blocked'])
  assert.equal(applyRawSyncPlan(plan), 0)
  assert.equal(existsSync(join(f.targetRoot, 'pet/pet.json')), false)
  assert.deepEqual(JSON.parse(readFileSync(join(f.targetRoot, 'pet.json'))), { old: true })
})

test('explicit replacement refreshes canonical and aliased originals, preserving all fields', t => {
  const f = fixture(t)
  const original = { datas: { dungeon: { layers: [{ map: { links: [1, 2] }, rooms: { room1: { randomRooms: ['room2'] } } }] } } }
  f.write(f.sourceRoot, 'battle.json', original)
  f.write(f.targetRoot, 'battle.json', { datas: {} })
  f.write(f.sourceRoot, 'equipGroup.json', { full: true })
  f.write(f.targetRoot, 'equip/equipGroup.json', { stale: true })
  applyRawSyncPlan(createRawSyncPlan({ ...f, replace: true }))
  assert.equal(fileDigest(join(f.sourceRoot, 'battle.json')), fileDigest(join(f.targetRoot, 'battle.json')))
  assert.equal(fileDigest(join(f.sourceRoot, 'equipGroup.json')), fileDigest(join(f.targetRoot, 'equip/equipGroup.json')))
})

test('derived input tables are not synchronized even with replace enabled', t => {
  const f = fixture(t)
  for (const file of ['dungeonBattle.json', 'dungeonBattleRooms.json', 'dungeonBattleRoutes.json', 'monsterTowerUsage.json', 'equip/equips.json']) {
    f.write(f.sourceRoot, file, { wrong: true })
    f.write(f.targetRoot, file, { project: true })
  }
  assert.deepEqual(createRawSyncPlan({ ...f, replace: true }), [])
  assert.deepEqual(JSON.parse(readFileSync(join(f.targetRoot, 'dungeonBattleRoutes.json'))), { project: true })
})

test('invalid JSON aborts planning before any output is written', t => {
  const f = fixture(t)
  f.write(f.sourceRoot, 'hero.json', { valid: true })
  writeFileSync(join(f.sourceRoot, 'invalid.json'), '{')
  assert.throws(() => createRawSyncPlan(f), /Invalid JSON/)
  assert.equal(existsSync(f.targetRoot), false)
})

test('preview can enumerate invalid sources alongside the complete valid plan', t => {
  const f = fixture(t)
  f.write(f.sourceRoot, 'hero.json', { valid: true })
  writeFileSync(join(f.sourceRoot, 'invalid.json'), '{')
  const errors = []
  const plan = createRawSyncPlan({ ...f, onInvalid: entry => errors.push(entry) })
  assert.equal(plan.length, 2)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].sourceName, 'invalid.json')
  assert.equal(existsSync(f.targetRoot), false)
})

test('conflicting nested and canonical aliases fail explicitly', t => {
  const f = fixture(t)
  f.write(f.sourceRoot, 'hero.json', { current: true })
  f.write(f.sourceRoot, 'hero/hero.json', { stale: true })
  assert.throws(() => createRawSyncPlan(f), /Conflicting source/)
})

test('changed source or target after preview prevents every planned write', t => {
  const f = fixture(t)
  f.write(f.sourceRoot, 'hero.json', { current: true })
  const plan = createRawSyncPlan(f)
  f.write(f.sourceRoot, 'hero.json', { changed: true })
  assert.throws(() => applyRawSyncPlan(plan), /changed after preview/)
  assert.equal(existsSync(f.targetRoot), false)
})

test('compress preview refuses a missing backup mirror instead of silently skipping', t => {
  const f = fixture(t)
  const imageRoot = join(f.directory, 'imgroot')
  mkdirSync(join(imageRoot, 'sub'), { recursive: true })
  writeFileSync(join(imageRoot, 'sub', 'a.png'), Buffer.alloc(4096, 7))
  const run = args => spawnSync(process.execPath, [join(projectRoot, 'scripts/dev/compress-images.mjs'), ...args], {
    cwd: f.directory, encoding: 'utf8'
  })

  const missing = run(['--root', imageRoot, '--backup', join(f.directory, 'nobackup')])
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /Backup mirror does not exist/)

  const insideRoot = run(['--root', imageRoot, '--backup', imageRoot])
  assert.equal(insideRoot.status, 1)
  assert.match(insideRoot.stderr, /outside the processed image root/)

  const mirror = join(f.directory, 'mirror')
  const built = run(['--root', imageRoot, '--backup-to', mirror])
  assert.equal(built.status, 0, built.stderr)
  assert.equal(fileDigest(join(mirror, 'sub/a.png')), fileDigest(join(imageRoot, 'sub/a.png')))
  assert.match(built.stdout, /1 candidates; 0 missing/)

  // 预览不写源图；镜像内相对路径以处理根为基准（不是恒以 public/images 为基准）。
  assert.equal(fileDigest(join(imageRoot, 'sub/a.png')), fileDigest(join(mirror, 'sub/a.png')))
  const reused = run(['--root', imageRoot, '--backup', mirror])
  assert.equal(reused.status, 0, reused.stderr)
  assert.match(reused.stdout, /1 candidates; 0 missing/)
})

test('task checking from another working directory is read-only and never trims battle', t => {
  const f = fixture(t)
  for (const file of ['battle.json', 'room.json', 'condition.json', 'task.json', 'levelStage.json', 'levelRoom.json', 'area.json', 'instance.json']) {
    f.write(f.sourceRoot, file, { datas: {} })
  }
  const battlePath = join(rawRoot, 'battle.json')
  const originalHash = existsSync(battlePath) ? fileDigest(battlePath) : null
  const run = spawnSync(process.execPath, [join(projectRoot, 'scripts/dev/check-task-data.mjs'), '--config', f.sourceRoot, '--dialogs', f.sourceRoot, '--filelist', join(f.directory, 'none.json')], {
    cwd: f.directory, encoding: 'utf8'
  })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /\[preview\]/)
  assert.equal(existsSync(join(f.directory, 'raw')), false)
  assert.equal(existsSync(join(f.directory, 'public')), false)
  assert.equal(existsSync(battlePath) ? fileDigest(battlePath) : null, originalHash)
})
