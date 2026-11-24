import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePetTraitNotes } from '../../src/utils/petTraitMechanics.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('石像鬼石化皮肤 pet_09304 补充 10 秒持续时间且各等级均有说明', () => {
  for (const level of [1, 4, 7]) {
    const notes = resolvePetTraitNotes('pet_09304', level)
    assert.ok(Array.isArray(notes) && notes.length === 1)
    assert.equal(notes[0].label, '持续时间')
    assert.match(notes[0].value, /10 秒/)
    assert.match(notes[0].value, /最高 10 层/)
  }
})

test('其他漏写持续时间或冷却的魔物特性均返回源码口径补充说明', () => {
  const cases = [
    ['pet_06204', '持续时间', /20 秒/],
    ['pet_07904', '持续时间', /20 秒/],
    ['pet_09604', '持续时间', /8 秒/],
    ['pet_10004', '冷却时间', /15 秒/]
  ]
  for (const [traitId, label, pattern] of cases) {
    const notes = resolvePetTraitNotes(traitId, 1)
    assert.ok(Array.isArray(notes) && notes.length > 0, `${traitId} 应有补充说明`)
    assert.equal(notes[0].label, label)
    assert.match(notes[0].value, pattern)
  }
})

test('未配置或空特性 ID 返回 null', () => {
  assert.equal(resolvePetTraitNotes('pet_00604', 1), null)
  assert.equal(resolvePetTraitNotes('', 1), null)
  assert.equal(resolvePetTraitNotes(null, 1), null)
})

test('补充数值与 raw/buff.json 及 parsed/pets.json 现行数据一致', () => {
  const parsedPets = JSON.parse(readFileSync(join(root, 'public/data/parsed/pets.json'), 'utf8')).pets
  const expectTraits = new Set(['pet_09304', 'pet_06204', 'pet_07904', 'pet_09604', 'pet_10004'])
  for (const traitId of expectTraits) {
    assert.ok(
      parsedPets.some(pet => pet.skills?.some(s => s.type === 'trait' && s.id === traitId)),
      `parsed/pets.json 应存在特性 ${traitId}`
    )
  }

  const buffPath = join(root, 'raw/buff.json')
  if (!existsSync(buffPath)) return
  const buffs = JSON.parse(readFileSync(buffPath, 'utf8'))

  assert.equal(buffs.pet_09304AddNewBuffBase.buffTime, 10)
  assert.equal(buffs.pet_09304AddNewBuffBase.canOverlay, true)
  assert.equal(buffs.pet_06204_1AddBuff.buffTime, 20)
  assert.equal(buffs.pet079AddBuff.buffTime, 20)
  assert.equal(buffs.pet_09604ShieldBaseBuff.buffTime, 8)
  for (let lv = 1; lv <= 7; lv++) {
    assert.equal(buffs[`pet_10004_${lv}`].para.cd, 15, `pet_10004_${lv} 内置冷却应为 15 秒`)
  }
})
