import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getPetVariantExtraEffects } from '../../src/utils/petParser.js'

const petJson = JSON.parse(readFileSync(new URL('../../raw/pet.json', import.meta.url), 'utf8'))
const petEntries = Object.values(petJson.datas || petJson)

test('变异描述已包含驻场或上场时间时，不重复追加上场时间加成', () => {
  const withLifeAdd = petEntries.filter(
    pet => Array.isArray(pet.variants) && pet.variants.some(v => Number(v.lifeTimeAdd) > 0)
  )
  assert.ok(withLifeAdd.some(pet => pet.name === '圣骑士史莱姆'))
  assert.ok(withLifeAdd.some(pet => pet.name === '青铜迷迷可'))

  for (const pet of withLifeAdd) {
    const variant = pet.variants[0]
    assert.deepEqual(
      getPetVariantExtraEffects(variant),
      [`售价增加 +${variant.sellPriceAdd}`],
      `${pet.name} 不应重复拼出上场时间`
    )
  }
})

test('变异描述未提及时间且 lifeTimeAdd > 0 时保留上场时间补充条目', () => {
  assert.deepEqual(
    getPetVariantExtraEffects({ des: '', lifeTimeAdd: 10, sellPriceAdd: 300 }),
    ['上场时间增加 +10秒', '售价增加 +300']
  )
  assert.deepEqual(
    getPetVariantExtraEffects({ des: '召唤时，获得最大生命值 {20%} 的护盾，持续 {6} 秒', lifeTimeAdd: 5, sellPriceAdd: 0 }),
    ['上场时间增加 +5秒']
  )
})

test('常规仅加属性与售价的变异只返回售价加成', () => {
  const regular = petEntries.find(
    pet => pet.name === '提灯妖精' && Array.isArray(pet.variants) && pet.variants.length > 0
  )
  assert.ok(regular)
  assert.deepEqual(
    getPetVariantExtraEffects(regular.variants[0]),
    [`售价增加 +${regular.variants[0].sellPriceAdd}`]
  )
  assert.deepEqual(getPetVariantExtraEffects(null), [])
})
