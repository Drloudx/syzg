import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  getPetTraitTiers,
  getPetActiveSkillTiers,
  getPetBreakthroughRoadmap
} from '../../src/utils/petParser.js'

const petSetting = JSON.parse(readFileSync(new URL('../../raw/petSetting.json', import.meta.url), 'utf8'))

test('特性培育阶梯 (getPetTraitTiers)', () => {
  // 3星魔物（如宝石迷迷可）: 0->1: 1, 1->2: 1, 2->3: 1, 3->4: 1, 4->5: 2, 5->6: 2, 6->7: 2
  const star3 = getPetTraitTiers(3, petSetting)
  assert.equal(star3.tiers.length, 7)
  assert.equal(star3.totalHatch, 10)
  assert.deepEqual(
    star3.tiers.map(t => ({ level: t.level, cost: t.cost, cumulative: t.cumulative })),
    [
      { level: 1, cost: 1, cumulative: 1 },
      { level: 2, cost: 1, cumulative: 2 },
      { level: 3, cost: 1, cumulative: 3 },
      { level: 4, cost: 1, cumulative: 4 },
      { level: 5, cost: 2, cumulative: 6 },
      { level: 6, cost: 2, cumulative: 8 },
      { level: 7, cost: 2, cumulative: 10 }
    ]
  )

  // 1星魔物: 0->1: 1, 1->2: 2, 2->3: 4, 3->4: 6, 4->5: 7, 5->6: 8, 6->7: 9 (满级累计37只)
  const star1 = getPetTraitTiers(1, petSetting)
  assert.equal(star1.tiers.length, 7)
  assert.equal(star1.totalHatch, 37)
  assert.equal(star1.tiers[6].cumulative, 37)
})

test('主动技能与队伍被动突破阶梯 (getPetActiveSkillTiers)', () => {
  // 3星魔物，技能1 (activeIndex 0)
  const skill1 = getPetActiveSkillTiers(3, petSetting, 0)
  assert.equal(skill1.tiers.length, 4)
  assert.deepEqual(
    skill1.tiers.map(t => ({ level: t.level, stage: t.stage, cost: t.cost, cumulative: t.cumulative })),
    [
      { level: 1, stage: 0, cost: 0, cumulative: 0 },
      { level: 2, stage: 1, cost: 1, cumulative: 1 },
      { level: 3, stage: 3, cost: 1, cumulative: 2 },
      { level: 4, stage: 5, cost: 2, cumulative: 4 }
    ]
  )
  assert.equal(skill1.totalSkillCost, 4)
  assert.equal(skill1.totalPetBreakthroughCost, 9)

  // 3星魔物，队伍被动 (activeIndex 1)
  const partySkill = getPetActiveSkillTiers(3, petSetting, 1)
  assert.equal(partySkill.tiers.length, 4)
  assert.deepEqual(
    partySkill.tiers.map(t => ({ level: t.level, stage: t.stage, cost: t.cost, cumulative: t.cumulative })),
    [
      { level: 1, stage: 0, cost: 0, cumulative: 0 },
      { level: 2, stage: 2, cost: 1, cumulative: 1 },
      { level: 3, stage: 4, cost: 2, cumulative: 3 },
      { level: 4, stage: 6, cost: 2, cumulative: 5 }
    ]
  )
  assert.equal(partySkill.totalSkillCost, 5)
  // 两者突破消耗之和：4 + 5 = 9，正好等于 totalPetBreakthroughCost
  assert.equal(skill1.totalSkillCost + partySkill.totalSkillCost, partySkill.totalPetBreakthroughCost)
})

test('6阶全景突破路线图 (getPetBreakthroughRoadmap)', () => {
  const roadmap = getPetBreakthroughRoadmap(3, petSetting, '诅咒金币', '坚韧祝福', 0)
  assert.equal(roadmap.length, 6)
  assert.equal(roadmap[0].skillName, '诅咒金币')
  assert.equal(roadmap[0].targetLevel, 2)
  assert.equal(roadmap[0].isCurrentSkillTarget, true)

  assert.equal(roadmap[1].skillName, '坚韧祝福')
  assert.equal(roadmap[1].targetLevel, 2)
  assert.equal(roadmap[1].isCurrentSkillTarget, false)

  assert.equal(roadmap[5].skillName, '坚韧祝福')
  assert.equal(roadmap[5].targetLevel, 4)
  assert.equal(roadmap[5].cumulative, 9)
})
