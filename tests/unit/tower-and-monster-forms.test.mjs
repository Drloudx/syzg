/**
 * 神匠之塔产物与「怪物形态定位」的回归护栏。
 *
 * ## 起源（2026-11-05）
 *
 * 1. **首通奖励曾是硬编码**：`scripts/parse/tower.mjs` 直接写 `isBoss ? 150 : 50`、
 *    `isBoss ? 20 : 5`。当前数值恰好与 `reward.json` 的 `once_boss/once_mon`、
 *    `tower1_boss/tower1_mon` 一致，所以一直看不出来；策划改表后产物静默不变、无报错。
 *    现在改为逐层读 `onceReward`（取 `ke`）与 `reward`（取 `item_25002` 规则的 min）。
 *
 * 2. **形态下标错位导致空弹窗**：`MonsterDetailModal` 用 `monsters.json` 的**原始下标**
 *    去索引**去重后**的 `allForms`。被去重规则剔除的形态（`007crazy` / `008crazy` /
 *    `009crazy` / `037crazy` —— 与本体属性技能阶级全同、只多一个狂暴 buff）
 *    恰好位于 2 号位，过滤后数组不够长 → `currentForm` 为 undefined → 只剩讨论区。
 *    日常计划「药草山林」14 个怪物胶囊里有 6 个点开是空白。
 *
 * 这两条都属「数据看着对、渲染静默错」的类型，单靠人工点页面容易漏，
 * 故用产物 + 纯函数断言守住。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const readParsed = name => JSON.parse(readFileSync(join(repoRoot, 'public/data/parsed', name), 'utf8'))
const readRaw = name => JSON.parse(readFileSync(join(repoRoot, 'raw', name), 'utf8'))

/**
 * 复刻 `MonsterDetailModal.vue` 的 `resolveForms()`。
 *
 * 🔴 与组件里的实现必须同步：去重规则与「强制保留本次点开的形态」这两条是本测试的判据。
 * 组件改动时这里要一起改 —— 否则测试会通过而页面空白（正是本次事故的形态）。
 */
function resolveForms(entry, forceId = '') {
  if (!entry) return []
  const forms = entry.forms || []
  const summons = entry.summons || []
  if (forms.length <= 1) return [...forms, ...summons]

  const base = forms[0]
  const deduped = forms.filter((f, idx) => {
    if (idx === 0) return true
    const isSameStats = f.rawStats?.maxHp === base.rawStats?.maxHp &&
                        f.rawStats?.phyAtk === base.rawStats?.phyAtk &&
                        f.rawStats?.phyDef === base.rawStats?.phyDef
    const isSameSkills = (f.skills?.length || 0) === (base.skills?.length || 0)
    const isSameRank = f.monRank === base.monRank
    if (isSameStats && isSameSkills && isSameRank && !f.transform && !f.towerAppearances?.length) {
      return forceId === f.id
    }
    return true
  })
  return [...deduped, ...summons]
}

const monsters = readParsed('monsters.json')
const tower = readParsed('tower.json')
const rewardRaw = readRaw('reward.json')

test('tower.summary 的首通总额与逐层相加一致', () => {
  const sumKe = tower.layers.reduce((sum, layer) => sum + layer.rewards.ke, 0)
  const sumCube = tower.layers.reduce((sum, layer) => sum + layer.rewards.cube, 0)
  assert.equal(tower.summary.totalKe, sumKe, 'summary.totalKe 必须等于逐层首通氪金之和')
  assert.equal(tower.summary.totalCube, sumCube, 'summary.totalCube 必须等于逐层幻象立方之和')
})

test('每层首通奖励与 reward.json 的对应条目一致（不得是硬编码）', () => {
  const datas = rewardRaw.datas || rewardRaw
  const cubeOf = rewardId => {
    const rule = (datas[rewardId]?.items?.[0]?.rules || []).find(entry => entry.typeId === tower.summary.exchangeItemTypeId)
    return rule ? Number(rule.min ?? rule.max ?? 0) : 0
  }
  for (const layer of tower.layers) {
    const rawOnce = datas[`once_${layer.isBoss ? 'boss' : 'mon'}`]
    assert.equal(layer.rewards.ke, Number(rawOnce?.ke || 0), `第 ${layer.layer} 层首通氪金应等于 once_* 的 ke`)
    assert.equal(
      layer.rewards.cube,
      cubeOf(`tower1_${layer.isBoss ? 'boss' : 'mon'}`),
      `第 ${layer.layer} 层幻象立方应等于 tower1_* 规则`
    )
  }
})

test('summary 的物品 ID 与图标由表输出，不留给前端写死', () => {
  assert.ok(/^item_/.test(tower.summary.exchangeItemTypeId), '必须有兑换货币 ID')
  assert.ok(/^item_/.test(tower.summary.tiItemTypeId), '必须有理智物品 ID')
  assert.ok(/^item_/.test(tower.summary.keItemTypeId), '必须有氪金物品 ID')
  assert.ok(tower.summary.exchangeItemIcon, '兑换货币图标名不能为空')
  assert.equal(typeof tower.summary.totalLayers, 'number')
  assert.ok(tower.summary.totalLayers > 0)
})

test('每层的 tiCost 是数字，且 summary.tiCostPerLayer 取自各层众数', () => {
  for (const layer of tower.layers) {
    assert.equal(typeof layer.tiCost, 'number', `第 ${layer.layer} 层 tiCost 必须是数字`)
  }
  const counts = new Map()
  for (const layer of tower.layers) counts.set(layer.tiCost, (counts.get(layer.tiCost) || 0) + 1)
  let best = 0
  let bestCount = -1
  for (const [value, count] of counts) if (count > bestCount) { best = value; bestCount = count }
  assert.equal(tower.summary.tiCostPerLayer, best)
})

test('tower 每层引用的形态都能在 monsters.json 里找到', () => {
  const known = new Set()
  for (const entry of monsters.monsters) {
    for (const form of [...(entry.forms || []), ...(entry.summons || [])]) known.add(String(form.id))
  }
  for (const id of Object.keys(monsters.extraMonsters || {})) known.add(id)

  const missing = []
  for (const layer of tower.layers) {
    if (layer.showMon?.id && !known.has(String(layer.showMon.id))) missing.push(layer.showMon.id)
    for (const round of layer.rounds || []) {
      for (const mon of round) if (!known.has(String(mon.typeId))) missing.push(mon.typeId)
    }
  }
  assert.deepEqual([...new Set(missing)], [], '塔内引用的形态必须全部可解析')
})

test('本次点开的形态必须出现在 resolveForms 结果里（否则弹窗空白）', () => {
  const failures = []
  for (const entry of monsters.monsters) {
    const all = [...(entry.forms || []), ...(entry.summons || [])]
    for (const form of all) {
      const resolved = resolveForms(entry, String(form.id))
      if (!resolved.some(item => item.id === form.id)) {
        failures.push(`${entry.id}/${form.id}`)
      }
    }
  }
  assert.deepEqual(failures, [], '任何形态作为打开目标时都必须能被定位到')
})

test('被去重规则剔除的形态，仍能以自身 id 打开且拿到本体之外的数据', () => {
  // 007/008/009/037 的 crazy 变体是「属性技能阶级全同、只多一个 buff」的典型
  const crazyIds = ['007crazy', '008crazy', '009crazy', '037crazy']
  for (const id of crazyIds) {
    const entry = monsters.monsters.find(mon =>
      [...(mon.forms || []), ...(mon.summons || [])].some(form => form.id === id))
    assert.ok(entry, `${id} 应存在于图鉴数据中`)
    const resolved = resolveForms(entry, id)
    const target = resolved.find(form => form.id === id)
    assert.ok(target, `${id} 作为打开目标时必须出现在形态列表里`)
  }
})

test('不指定 forceId 时，去重仍按原规则剔除冗余克隆体', () => {
  // 剔除行为本身是设计意图（避免同属性同技能的形态各占一个 Tab），不能因上面的修复而失效
  const entry = monsters.monsters.find(mon => (mon.forms || []).some(form => form.id === '007crazy'))
  assert.ok(entry, '需要 007 这条数据')
  const plain = resolveForms(entry)
  assert.equal(plain.some(form => form.id === '007crazy'), false, '默认（无 forceId）应剔除 007crazy')
})

test('resolveForms 对单形态与缺失数据保持健壮', () => {
  assert.deepEqual(resolveForms(null), [])
  assert.deepEqual(resolveForms({ forms: [] }), [])
  const single = { forms: [{ id: 'x' }], summons: [{ id: 'y' }] }
  assert.deepEqual(resolveForms(single, 'x').map(f => f.id), ['x', 'y'])
})
