import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  EQUIP_RANDOM_ATTR_QUALITIES,
  buildEquipRandomAttrPool,
  formatEquipAttrValue,
  getEquipRandomAttrCount,
  getEquipRandomAttrLevels,
  isEquipPercentAttr
} from '../../src/utils/itemParser.js'
import { translateStatName } from '../../src/utils/gameMappings.js'

const parsedItems = JSON.parse(fs.readFileSync('public/data/parsed/items.json', 'utf8'))
const config = parsedItems.equipGlobalConfig
const lanDict = parsedItems.lanDict

test('装备随机词条数量与 noRandomAbility 判据', () => {
  const normalEquip = { equip: { equipLevel: 3, noRandomAbility: false } }
  const fixedEquip = { equip: { equipLevel: 1, noRandomAbility: true } }

  assert.equal(getEquipRandomAttrCount(normalEquip, 1, config), 1)
  assert.equal(getEquipRandomAttrCount(normalEquip, 2, config), 1)
  assert.equal(getEquipRandomAttrCount(normalEquip, 3, config), 2)
  assert.equal(getEquipRandomAttrCount(normalEquip, 4, config), 3)
  assert.equal(getEquipRandomAttrCount(normalEquip, 5, config), 3)
  assert.equal(getEquipRandomAttrCount(normalEquip, 6, config), 3)
  assert.equal(getEquipRandomAttrCount(fixedEquip, 5, config), 0)
})

test('百分比属性格式化与官方 lan.json 译名口径一致', () => {
  assert.equal(isEquipPercentAttr('critRes'), true)
  assert.equal(isEquipPercentAttr('skillCool'), true)
  assert.equal(isEquipPercentAttr('phyAtk'), false)

  assert.equal(formatEquipAttrValue('critRes', 5, 5), '5%')
  assert.equal(formatEquipAttrValue('critRes', 5, 5, { withPlus: true }), '+5%')
  assert.equal(formatEquipAttrValue('phyAtk', 351, 364, { withPlus: true }), '+351~364')
  assert.equal(formatEquipAttrValue('skillCool', 1, 2), '1%~2%')

  for (const key of Object.keys(config.equipAttrPool)) {
    assert.equal(translateStatName(key), lanDict[key], `STAT_NAMES[${key}] 应与官方 lan.json 一致`)
  }
})

test('随机词条池按词条品质（白~橙）分档与游戏实机 3 级一致', () => {
  assert.deepEqual(getEquipRandomAttrLevels(config), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.deepEqual(EQUIP_RANDOM_ATTR_QUALITIES.map(q => q.label), ['白', '绿', '蓝', '紫', '橙'])

  const poolOrange = Object.fromEntries(buildEquipRandomAttrPool(3, 5, config).map(e => [e.key, e]))
  assert.equal(poolOrange.phyAtk.rangeText, '68~75')
  assert.equal(poolOrange.phyAtkPen.rangeText, '4%')
  assert.equal(poolOrange.skillCool.rangeText, '2%')

  const poolWhite = Object.fromEntries(buildEquipRandomAttrPool(3, 1, config).map(e => [e.key, e]))
  assert.equal(poolWhite.phyAtk.rangeText, '38~45')
})
