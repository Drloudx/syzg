import assert from 'node:assert/strict'
import { test, before } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveEquipSummons } from '../../src/utils/equipSummonMechanics.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

// Mock globalThis.fetch 读取本地 public/data/parsed/
before(() => {
  globalThis.fetch = async (url) => {
    const urlStr = String(url)
    if (urlStr.includes('items.json')) {
      const buffer = readFileSync(join(root, 'public/data/parsed/items.json'))
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        json: async () => JSON.parse(buffer.toString('utf8'))
      }
    }
    throw new Error(`Unexpected fetch URL in test: ${urlStr}`)
  }
})

test('育母 equip_006 解析出完整的双阶段召唤物（蛛卵 + 幼体）', () => {
  const summons = resolveEquipSummons('equip_006', 1)
  assert.ok(Array.isArray(summons), '应当返回召唤物列表')
  assert.equal(summons.length, 2, '育母应包含 2 个阶段召唤物（蛛卵 + 幼体）')

  const [egg, baby] = summons

  // 阶段 1：蛛卵
  assert.equal(egg.monTypeId, '013_egg')
  assert.equal(egg.name, '砂蜘蛛的蛋')
  assert.equal(egg.duration, 1, '孵化时间应为 1 秒')
  assert.equal(egg.maxCount, 1)
  assert.deepEqual(egg.inherit, [{ key: 'maxHp', label: '生命', value: '10%' }])
  assert.ok(egg.attackNote?.noAtk, '蛛卵不主动攻击')
  assert.ok(egg.fixed.some(f => f.key === 'phyDef' && f.value === '157'), '蛛卵物防 157')
  assert.ok(egg.fixed.some(f => f.key === 'magicDef' && f.value === '120'), '蛛卵魔防 120')

  // 阶段 2：幼体
  assert.equal(baby.monTypeId, '013_baby')
  assert.equal(baby.name, '砂蜘蛛幼体')
  assert.equal(baby.duration, 5, '存活时间应为 5 秒')
  assert.equal(baby.maxCount, 1, '实机代码判定修正为 1 只')
  assert.ok(baby.damageTypes.includes('物理'), '造成物理伤害')
  assert.ok(baby.inherit.some(i => i.key === 'noExtend'), '不继承穿戴者属性，为独立属性')
  assert.equal(baby.fixed.find(f => f.key === 'baseAtk')?.value, '1', '基础攻击为 1')
  assert.equal(baby.fixed.find(f => f.key === 'baseHp')?.value, '1000', '基础生命为 1000')
  assert.ok(baby.fixed.some(f => f.key === 'atkSpeed' && f.value === '0.4'), '基础攻速 0.4')
  assert.ok(baby.fixed.some(f => f.key === 'crit' && f.value === '20%'), '暴击率 20%')
  assert.ok(baby.fixed.some(f => f.key === 'critDam' && f.value === '125%'), '暴击伤害 125%')
  assert.ok(baby.skills.some(s => s.includes('砂蜘蛛仔自爆')), '自带砂蜘蛛仔自爆技能')
  assert.ok(baby.bonusNotes.some(b => b.key === 'role' && b.value.includes('主要作受击炮灰与全队增益触发器')), '应包含实战定位说明')
  assert.ok(baby.bonusNotes.some(b => b.key === 'teamBuff'), '应包含全体加成说明')
  assert.ok(baby.bonusNotes.some(b => b.key === 'weakness'), '应包含弱点属性说明')
})

test('传承的威严 equip_sp0201 四档史莱姆召唤解析', () => {
  const lv1 = resolveEquipSummons('equip_sp0201', 1)
  const lv2 = resolveEquipSummons('equip_sp0201', 2)
  const lv3 = resolveEquipSummons('equip_sp0201', 3)
  const lv4 = resolveEquipSummons('equip_sp0201', 4)

  assert.equal(lv1[0].monTypeId, '109')
  assert.equal(lv1[0].inherit.find(i => i.key === 'atk')?.value, '30%')

  assert.equal(lv2[0].monTypeId, '108')
  assert.equal(lv2[0].inherit.find(i => i.key === 'atk')?.value, '40%')

  assert.equal(lv3[0].monTypeId, '103')
  assert.equal(lv3[0].inherit.find(i => i.key === 'atk')?.value, '50%')

  assert.equal(lv4[0].monTypeId, '114')
  assert.equal(lv4[0].inherit.find(i => i.key === 'atk')?.value, '60%')
})

test('无召唤物的词缀返回 null', () => {
  assert.equal(resolveEquipSummons('equip_001', 1), null)
  assert.equal(resolveEquipSummons('', 1), null)
  assert.equal(resolveEquipSummons('non_exist_trigger', 1), null)
})

test('item_442001（蜘蛛统御头冠）词缀解析集成：带育母召唤物数值', async () => {
  const { fetchItemData, parseItemAffixes } = await import('../../src/utils/itemParser.js')
  const data = await fetchItemData()
  const mockItem = Object.values(data.items).find(x => x.typeId === 'item_442001')

  assert.ok(mockItem, '应当能获取到 item_442001')
  assert.equal(mockItem.name, '蜘蛛统御头冠')

  const affixGroups = parseItemAffixes(mockItem)
  assert.ok(Array.isArray(affixGroups), '应当能解析出可携带效果组')
  assert.ok(affixGroups.length > 0, '词缀组数量应 > 0')

  const prefix = affixGroups[0].prefixes.find(p => p.id === 'equip_006' || p.skillName === '育母')
  assert.ok(prefix, '应包含育母词缀')
  assert.ok(Array.isArray(prefix.summons), '育母词缀应包含 summons 字段')
  assert.equal(prefix.summons.length, 2, '育母应包含 2 个阶段召唤物数值')
  assert.equal(prefix.summons[0].name, '砂蜘蛛的蛋')
  assert.equal(prefix.summons[1].name, '砂蜘蛛幼体')
})

test('item_443002（魔爪异变臂铠）可携带效果保持游戏原描述，并在补充卡片中展示吸血持续 10 秒与 ≤40% 口径', async () => {
  const { fetchItemData, parseItemAffixes } = await import('../../src/utils/itemParser.js')
  const data = await fetchItemData()
  const mockItem = Object.values(data.items).find(x => x.typeId === 'item_443002')

  assert.ok(mockItem, '应当能获取到 item_443002')
  const affixGroups = parseItemAffixes(mockItem)
  assert.ok(Array.isArray(affixGroups) && affixGroups.length > 0)

  const claw = affixGroups.flatMap(g => g.prefixes || []).find(p => p.id === 'equip_305' || p.skillName === '魔爪')
  assert.ok(claw, '应包含魔爪词缀')
  assert.equal(claw.desHtml.includes('实际 ≤'), false, '官方原始描述应保持不变')
  assert.ok(Array.isArray(claw.notes) && claw.notes.length === 2, '应在 notes 中补充持续时间与触发口径')
  assert.equal(claw.notes[0].label, '持续时间')
  assert.ok(claw.notes[0].value.includes('10 秒'))
  assert.equal(claw.notes[1].label, '触发口径')
  assert.ok(claw.notes[1].value.includes('≤ 40%'))
})
