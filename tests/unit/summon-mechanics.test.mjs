/**
 * 召唤物属性口径（角色技能里的召唤单位）。
 *
 * ## 起因（2026-10-15，用户提问）
 *
 * 「乌尔勒这类有召唤物的角色，召唤物的攻速是固定的吗？能继承角色的暴击和爆伤吗？」
 *
 * ## 源码核实（`Assembly-CSharp`）
 *
 * | 事实 | 位置 |
 * | --- | --- |
 * | 召唤物只继承**攻击/双防/生命** | `Unit.cs:1467-1484` 的 `extendSummoner` 块 |
 * | 攻速/暴击/爆伤取自**怪物配置表**，不读召唤师 | `UnitAttribute.cs:609/613/614` |
 * | 召唤物会进入 `allHeros` | `Unit.cs:1616-1626` |
 * | 全体攻速技能遍历 `GetUnitsByTargetType` 且**不传** `canelSummon` → 含召唤物 | `XiLu_Skill2.SkillPointAction` |
 * | 部分技能显式 `canelSummon: true` → 排除召唤物 | `Buff_Hero051Talent` / `Hero043Skill1` |
 *
 * 结论：**攻速/暴击/爆伤不随角色变化**，但**全体加成类 buff 生效**。
 * 两者不矛盾，必须分开说 —— 合并成一句会误导。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const heroes = JSON.parse(readFileSync(join(root, 'public/data/parsed/heroes.json'), 'utf8'))
const list = Array.isArray(heroes) ? heroes : (heroes.heroes || [])

/** 收集所有带召唤物的技能等级条目。 */
const summonEntries = []
for (const hero of list) {
  for (const key of ['skills', 'starSkills', 'talentSkills']) {
    for (const skill of hero[key] || []) {
      for (const lv of Object.values(skill.levelData || {})) {
        if (lv.summon) summonEntries.push({ hero, skill, level: lv.level, summon: lv.summon })
      }
    }
  }
}

test('产物里带 summon 的技能等级条目存在', () => {
  assert.ok(summonEntries.length > 0, '应至少有一个带召唤物的技能')
  const mons = new Set(summonEntries.map(e => e.summon.monTypeId))
  assert.ok(mons.size >= 5, `召唤物种类应 ≥5，实际 ${mons.size}`)
})

test('🔴 召唤物固定属性含攻速/暴击/爆伤（取自怪物配置表）', () => {
  const byMon = new Map()
  for (const e of summonEntries) if (!byMon.has(e.summon.monTypeId)) byMon.set(e.summon.monTypeId, e.summon)

  for (const [id, s] of byMon) {
    // 不主动攻击的召唤物不该有这三项（见下一条测试）
    if (!s.canAttack) continue
    const keys = new Set(s.fixed.map(x => x.key))
    assert.ok(keys.has('atkSpeed'), `${id}(${s.name}) 缺基础攻速`)
    assert.ok(keys.has('crit'), `${id}(${s.name}) 缺暴击率`)
    assert.ok(keys.has('critDam'), `${id}(${s.name}) 缺暴击伤害`)
    // 值不能是占位
    for (const f of s.fixed) assert.ok(f.value && f.value !== 'undefined%', `${id} ${f.label} 值异常：${f.value}`)
  }
})

/**
 * 🔴 **不主动攻击的召唤物不显示攻速/暴击/爆伤**。
 *
 * 源码 `UnitAI.cs:701`：`yield return new WaitUntil(() => self.noAtk <= 0);`
 * —— `noAtk=1` 时 AI 永远停在等待，不会出手。
 * 此时配置表的 `atkSpeed`/`crit`/`cirtDam` 是**该表默认占位**（实测 14 个不攻击的几乎都是 0.35 / 35% / 125%）。
 *
 * 典型：反击假人 `hero046Mon1`（`noAtk=1` + `rebDam=100`，靠反伤）。
 * 曾错误显示「基础攻速 0.35 · 暴击率 35% · 暴击伤害 125%」，用户质疑「反击假人怎么还有基础攻速」。
 */
test('不主动攻击的召唤物不显示攻速/暴击/爆伤，改为说明攻击方式', () => {
  const byMon = new Map()
  for (const e of summonEntries) if (!byMon.has(e.summon.monTypeId)) byMon.set(e.summon.monTypeId, e.summon)

  const noAtkOnes = [...byMon.values()].filter(s => !s.canAttack)
  assert.ok(noAtkOnes.length > 0, '应至少有一个不主动攻击的召唤物（反击假人）')

  for (const s of noAtkOnes) {
    assert.equal(s.fixed.length, 0, `${s.name}(${s.monTypeId}) 不攻击却显示了固定属性`)
    assert.ok(s.attackNote, `${s.name} 应有攻击方式说明`)
    assert.equal(s.attackNote.noAtk, true)
    assert.ok(s.attackNote.text.includes('不会主动攻击'), `${s.name} 说明文案异常：${s.attackNote.text}`)
  }

  // 反击假人的具体行为：靠反伤
  const dummy = byMon.get('hero046Mon1')
  assert.ok(dummy, '应有反击假人')
  assert.equal(dummy.canAttack, false)
  assert.match(dummy.attackNote.text, /反击|反伤/, '应说明靠反击')
})

test('🔴 乌尔勒浮游炮的具体数值（截图里的技能）', () => {
  const e = summonEntries.find(x => x.summon.monTypeId === '065Summon1')
  assert.ok(e, '应有浮游炮')
  assert.equal(e.hero.name, '乌尔勒')
  assert.equal(e.skill.name, '追击指令')
  const get = key => e.summon.fixed.find(f => f.key === key)?.value
  assert.equal(get('atkSpeed'), '0.81', '基础攻速应为 0.81')
  assert.equal(get('crit'), '12%', '暴击率应为 12%')
  assert.equal(get('critDam'), '150%', '暴击伤害应为 150%')
})

test('🔴 继承项只有生命/攻击/防御，不含攻速/暴击/爆伤', () => {
  const byMon = new Map()
  for (const e of summonEntries) if (!byMon.has(e.summon.monTypeId)) byMon.set(e.summon.monTypeId, e.summon)

  for (const [id, s] of byMon) {
    if (!s.extendsSummoner) continue
    const inheritKeys = new Set(s.inherit.map(x => x.key))
    // 必须有的
    for (const k of ['maxHp', 'atk', 'def']) {
      if (s.rawPercents[k === 'maxHp' ? 'hp' : k] > 0) {
        assert.ok(inheritKeys.has(k), `${id} 应继承 ${k}`)
      }
    }
    // 绝不能有的
    for (const forbidden of ['atkSpeed', 'crit', 'critDam']) {
      assert.ok(!inheritKeys.has(forbidden), `${id} 不应继承 ${forbidden}（源码不复制这三项）`)
    }
  }
})

test('「加成规则」区分「不继承」与「全体加成生效」', () => {
  const e = summonEntries.find(x => x.summon.monTypeId === '065Summon1')
  const notes = new Map(e.summon.bonusNotes.map(n => [n.key, n]))
  assert.ok(notes.has('notInherited'), '应说明哪些不继承')
  assert.match(notes.get('notInherited').value, /攻速|暴击/, '「不继承」应点名攻速/暴击')
  assert.ok(notes.has('teamBuff'), '应说明全体加成生效')
  assert.match(notes.get('teamBuff').value, /生效/)
})

/**
 * 🔴 「加成规则」里**不能**出现「排除召唤物」这类泛化表述。
 *
 * `canelSummon: true` 在源码里 25 处，用途是**选单体治疗目标 / 清除 buff / 按血量判定队友**
 * （`Hero007_Skill1` 治疗、`Hero043Skill1` 查血量、`Hero051_Skill1` 清 buff），
 * **没有一处与攻速类加成相关**。写成「个别技能不生效」会让读者误以为攻速 buff 也会被排除。
 */
test('加成规则不写「排除召唤物」（canelSummon 与攻速加成无关）', () => {
  for (const e of summonEntries) {
    const labels = e.summon.bonusNotes.map(n => n.label)
    assert.ok(!labels.some(l => /排除/.test(l)), `${e.summon.monTypeId} 出现了「排除」表述：${labels.join('/')}`)
    const text = e.summon.bonusNotes.map(n => n.value).join(' ')
    assert.ok(!/排除召唤物|个别.*不生效/.test(text), `${e.summon.monTypeId} 含误导性表述：${text}`)
  }
})

test('extendSummoner=false 的召唤物不显示继承比例', () => {
  for (const e of summonEntries) {
    if (e.summon.extendsSummoner) continue
    assert.equal(e.summon.inherit.length, 0, `${e.summon.monTypeId} 不继承却显示了继承项`)
    assert.ok(e.summon.bonusNotes.some(n => n.key === 'noExtend'), '应说明「不继承召唤师属性」')
  }
})

/**
 * 🔴 **不对游戏配置错误做标注**（用户要求）。
 *
 * 实测原表存在描述与配置不一致的情况，例如乌尔勒「驻守指令」`06504`：
 * 描述写「继承 乌尔勒 {100%} 物理攻击力」，而 buff `hero065Talent` 的
 * `summonData.atkPercent` 是 `0.6`（60%）。
 *
 * 站点的定位是**还原游戏数据**，不是修正它。标注「描述差异/配置以…为准」会：
 *   1. 让玩家以为站点在质疑官方数据；
 *   2. 一旦官方修正或这是有意的（如 `{100%}` 是别的含义），站点反而成了错误来源。
 *
 * 所以：**照配置值显示，不加任何差异提示**。这类不一致需要核实官方意图时另行处理。
 */
test('产物不携带「描述与配置不一致」的标注字段', () => {
  for (const e of summonEntries) {
    const keys = Object.keys(e.summon)
    assert.ok(!keys.some(k => /mismatch|mismatched| inconsistency/i.test(k)), `${e.summon.monTypeId} 带了差异标注字段：${keys.join(',')}`)
    assert.ok(!keys.includes('descMismatches'), `${e.summon.monTypeId} 带了 descMismatches`)
  }
})
