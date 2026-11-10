/**
 * 配队模拟器：队伍被动匹配规则回归护栏。
 *
 * ## 守什么（2026-11-11）
 *
 * `matchesPassive` 曾只判「属性 + 职业」，不判**攻击类型**。
 * 结果：沃夫加（火属性·射手，`phyAtk 412` ≫ `magicAtk 223`，物理输出）
 * 被推荐了顽劣灯火的被动「队伍中 {火属性} 伙伴 **魔法攻击**提高 4%」——
 * 属性对得上，但对物理角色毫无收益。
 *
 * 攻击类型判据：`hero.unitData.phyAtk` 与 `magicAtk` 谁更高（游戏无独立类型字段）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { matchesPassive, attackTypeMatches, heroAttackType, isGenericPassive } from '../../src/utils/simsData.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const readParsed = name => JSON.parse(readFileSync(join(repoRoot, 'public/data/parsed', name), 'utf8'))

const physicalHero = { elementName: '火', jobName: '射手', unitData: { phyAtk: 412, magicAtk: 223 } }
const magicHero = { elementName: '火', jobName: '秘术', unitData: { phyAtk: 100, magicAtk: 500 } }

test('攻击类型由 unitData.phyAtk / magicAtk 决定', () => {
  assert.equal(heroAttackType(physicalHero), 'physical')
  assert.equal(heroAttackType(magicHero), 'magic')
  // 缺 unitData 时按物理兜底，不抛错
  assert.equal(heroAttackType({}), 'physical')
})

test('物理角色不匹配「魔法攻击」被动，匹配「物理攻击」被动', () => {
  const magicBuff = { elements: ['火'], jobs: [], stat: '魔法攻击' }
  const phyBuff = { elements: ['火'], jobs: [], stat: '物理攻击' }
  assert.equal(matchesPassive(physicalHero, magicBuff), false, '物理角色不该吃到魔法攻击加成')
  assert.equal(matchesPassive(physicalHero, phyBuff), true)
  assert.equal(matchesPassive(magicHero, magicBuff), true)
  assert.equal(matchesPassive(magicHero, phyBuff), false)
})

test('非攻击类被动不受攻击类型限制（暴击/防御/生命/移速…）', () => {
  for (const stat of ['暴击率', '暴击伤害', '物理防御', '魔法防御', '生命值', '移速', '攻速', '冷却缩减', '攻击和移速']) {
    assert.equal(attackTypeMatches(physicalHero, stat), true, `${stat} 不该被攻击类型拦下`)
    assert.equal(attackTypeMatches(magicHero, stat), true, `${stat} 不该被攻击类型拦下`)
  }
})

test('真实数据：沃夫加不匹配顽劣灯火（火属性·魔法攻击），匹配真护之黑龙（火属性·物理攻击）', () => {
  const sims = readParsed('sims.json')
  const wolf = sims.heroes.find(h => h.name === '沃夫加')
  assert.ok(wolf?.unitData, '沃夫加应带 unitData（攻击类型判据）')
  assert.equal(heroAttackType(wolf), 'physical')

  const badPet = sims.pets.find(p => p.name === '顽劣灯火')
  assert.ok(badPet, '应存在顽劣灯火')
  assert.equal(badPet.passive.stat, '魔法攻击')
  assert.equal(matchesPassive(wolf, badPet.passive), false, '顽劣灯火（魔法攻击）不该匹配物理角色')

  const goodPet = sims.pets.find(p => p.passive?.stat === '物理攻击' && p.passive?.elements?.includes('火'))
  assert.ok(goodPet, '应存在火属性物理攻击被动魔物')
  assert.equal(matchesPassive(wolf, goodPet.passive), true)
})

test('通用被动判定不受影响（不带属性/职业限定）', () => {
  assert.equal(isGenericPassive({ elements: [], jobs: [], stat: '暴击率' }), true)
  assert.equal(isGenericPassive({ elements: ['火'], jobs: [], stat: '暴击率' }), false)
})
