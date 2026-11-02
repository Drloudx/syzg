import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const daily = JSON.parse(readFileSync('public/data/parsed/daily.json', 'utf8'))

/**
 * 判据来源：`room.json` 的 `battleData.monRounds[].mons[]` 里，
 * `monId` 是关卡内实例 uid（源码 BattleManager 当 uid 用，如 `"mon144"`），
 * `typeId` 才是怪物类型（如 `"007"`）。用 monId 查 mon.json 会全部落空。
 */
test('怪物取 typeId 而非 monId，且都能解析出名字', () => {
  const allMons = daily.plans.flatMap(p => p.stages.flatMap(s => s.monsters))
  assert.ok(allMons.length > 0, '应有怪物')
  for (const m of allMons) {
    assert.match(m.typeId, /^[0-9]/, `typeId 应为数字类型（实际 ${m.typeId}）`)
    assert.ok(m.name && m.name !== m.typeId, `${m.typeId} 应有名字`)
    assert.ok(m.icon, `${m.typeId} 应有图标`)
  }
})

test('日常本怪物覆盖：55 种类型全部解析成功', () => {
  const types = new Set(daily.plans.flatMap(p => p.stages.flatMap(s => s.monsters.map(m => m.typeId))))
  assert.equal(types.size, 55)
})

test('三层结构完整：计划 → 子关卡 → 详情', () => {
  assert.equal(daily.plans.length, 7)
  for (const plan of daily.plans) {
    assert.ok(plan.name, `${plan.typeId} 应有名字`)
    assert.ok(plan.img, `${plan.typeId} 应有配图`)
    assert.ok(plan.stages.length > 0, `${plan.typeId} 应有子关卡`)
    for (const stage of plan.stages) {
      assert.ok(stage.battleId, '子关卡应有 battleId')
      assert.ok(stage.battleRoute.startsWith('/dungeons?battle='), '子关卡应能跳副本图鉴')
      if (stage.reward) {
        assert.ok(Array.isArray(stage.reward.items))
      }
    }
  }
})

/**
 * 解锁条件必须拆成可跳转的结构：
 *   passTask   → /tasks?task=<id>
 *   passBattle → /dungeons?battle=<id>
 */
test('解锁条件拆成可跳转链接', () => {
  const conds = daily.plans
    .flatMap(p => [p.condition, ...p.stages.map(s => s.condition)])
    .filter(Boolean)
  assert.ok(conds.length > 0)
  const links = conds.flatMap(c => c.links)
  assert.ok(links.length > 0)
  for (const l of links) {
    assert.ok(['task', 'battle'].includes(l.kind), `未知 kind ${l.kind}`)
    assert.ok(l.targetId, '链接应有 targetId')
    if (l.kind === 'task') assert.equal(l.route, `/tasks?task=${encodeURIComponent(l.targetId)}`)
    if (l.kind === 'battle') assert.equal(l.route, `/dungeons?battle=${encodeURIComponent(l.targetId)}`)
  }
})

test('周分配覆盖 7 天且都能对上计划名', () => {
  assert.equal(daily.weekPlans.length, 7)
  assert.deepEqual(daily.weekPlans.map(w => w.day), [0, 1, 2, 3, 4, 5, 6])
  assert.equal(daily.weekPlans[0].dayName, '周日')
  for (const w of daily.weekPlans) {
    assert.ok(w.entries.length > 0, `${w.dayName} 应有计划`)
    for (const e of w.entries) {
      assert.ok(e.name !== e.typeId, `${e.typeId} 应能对上计划名`)
      assert.ok(e.num > 0)
    }
  }
})

/**
 * 掉落规则有两种 mode：
 *   - item       → 具体物品，必须有 typeId / 名字 / 图标
 *   - equipGroup → 装备池（某品质 + 某类型 + 某等级），**没有具体 id 与图标**
 * 后者是游戏按掉落表随机产出，构建期无法确定具体装备，不能编一个名字。
 */
test('结算掉落：具体物品有名字与图标，装备池有池参数', () => {
  const drops = daily.plans.flatMap(p => p.stages.flatMap(s => s.reward?.items || []))
  assert.ok(drops.length > 0)

  const itemDrops = drops.filter(d => d.mode === 'item')
  const poolDrops = drops.filter(d => d.mode === 'equipGroup')

  assert.ok(itemDrops.length > 0, '应有具体物品掉落')
  for (const d of itemDrops) {
    assert.ok(d.typeId, '具体物品应有 typeId')
    assert.ok(d.name && d.name !== d.typeId, `${d.typeId} 应有名字`)
    assert.ok(d.img, `${d.typeId} 应有图标`)
    assert.ok(d.max >= d.min, 'max 应不小于 min')
  }

  for (const d of poolDrops) {
    assert.equal(d.typeId, '', '装备池不应有 typeId')
    assert.ok(d.name, '装备池应有可读名称')
    assert.ok(d.equipTypeGroup, '装备池应有 equipTypeGroup')
    assert.ok(d.max >= d.min, 'max 应不小于 min')
  }
})

test('经验本掉落与截图一致：战斗笔记 + 经验 80', () => {
  const plan = daily.plans.find(p => p.typeId === 'plan_2')
  const stage = plan.stages.find(s => s.battleId === 'daily_exp_1')
  assert.ok(stage, '应有驿站训练室')
  assert.equal(stage.reward.exp, 80)
  const note = stage.reward.items.find(d => d.typeId === 'item_20016')
  assert.ok(note, '应有战斗笔记 item_20016')
  assert.equal(note.min, 15)
})
