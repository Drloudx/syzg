/**
 * 任务图鉴展示层回归：排序、剧情编号、地点重复。
 *
 * 这三条都是**产物层面**的断言，直接读 `public/data/parsed/tasks.json`，
 * 所以它们锁的是「构建出来的东西对不对」，而不是某个组件的实现细节。
 *
 * 起因（2026-10-06，用户逐条反馈）：
 *   1. 第一章列表里「共鸣 / 家园 / 往日的阴影」跑到「深渊」前面 ——
 *      排序末位用了 `localeCompare` 字典序，`m_1_10` < `m_1_2`；
 *   2. 步骤里的关卡剧情标签出现 `(1/8)`、`(7/8)` 而实际只显示 5 条 ——
 *      分母用了去重前的条数；
 *   3. 地点显示成「旧日修行所（秋日荒野 > 旧日修行所）」，房间名说两遍。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const tasks = JSON.parse(readFileSync(join(root, 'public/data/parsed/tasks.json'), 'utf8'))

test('同一分类内的任务按 ID 数字序排列，不是字典序', () => {
  // 第一章 m_1_* 的真实推进链（已用 addTask 核对）
  //
  // 2026-11-09（1.7.15 数据更新）：官方给主线补了一批 `_BF` 后缀的**已下架**
  // （`close:true`）任务副本。页面用 `HIDE_CLOSED_TASKS` 隐藏它们，所以这里
  // 同样按 `!close` 过滤，校验的才是用户实际看到的列表顺序。
  const ch1 = tasks.tasks
    .filter(t => !t.close && t.type === 1 && t.subKey === '第一章' && t.id.startsWith('m_1_'))
    .map(t => t.id)
  assert.deepEqual(ch1, [
    'm_1_1', 'm_1_2', 'm_1_4', 'm_1_5', 'm_1_6', 'm_1_7',
    'm_1_7_1', 'm_1_8', 'm_1_8_2', 'm_1_9',
    'm_1_10', 'm_1_11', 'm_1_12'
  ])

  // 全局检查：任何相邻两个同分类任务，只要 ID 同族，数字小的必须在前
  const byGroup = new Map()
  for (const t of tasks.tasks) {
    if (t.close) continue // 与页面一致：已下架任务不参与展示排序
    const key = `${t.type}|${t.subKey}`
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key).push(t.id)
  }
  const violations = []
  for (const [key, ids] of byGroup) {
    for (let i = 0; i + 1 < ids.length; i++) {
      const a = ids[i]
      const b = ids[i + 1]
      // 只比较同前缀的（m_1_2 vs m_1_10），跨族顺序由其它规则决定
      const pa = /^(.*?)(\d+)$/.exec(a)
      const pb = /^(.*?)(\d+)$/.exec(b)
      if (!pa || !pb || pa[1] !== pb[1]) continue
      if (Number(pa[2]) > Number(pb[2])) violations.push(`${key}: ${a} 排在 ${b} 前`)
    }
  }
  assert.deepEqual(violations, [], `存在字典序导致的错序：\n${violations.join('\n')}`)
})

test('关卡剧情编号的分母等于该步骤实际展示的条数', () => {
  const bad = []
  for (const t of tasks.tasks) {
    for (const s of t.steps || []) {
      const level = (s.dialogs || []).filter(d => d.label === '关卡剧情')
      if (!level.length) continue
      const numbered = level
        .map(d => /^(.*)\((\d+)\/(\d+)\)$/.exec(d.meta?.name || ''))
        .filter(Boolean)
      if (!numbered.length) continue
      const total = level.length
      for (const m of numbered) {
        if (Number(m[3]) !== total) {
          bad.push(`${t.id} step${s.index}: 标签写 ${m[3]}，实际 ${total} 条`)
          break
        }
      }
      // 编号本身不能重复、不能越界
      const idxs = numbered.map(m => Number(m[2]))
      if (new Set(idxs).size !== idxs.length) bad.push(`${t.id} step${s.index}: 编号重复 ${idxs.join(',')}`)
      if (idxs.some(i => i < 1 || i > total)) bad.push(`${t.id} step${s.index}: 编号越界 ${idxs.join(',')}`)
    }
  }
  assert.deepEqual(bad, [], `关卡剧情编号不一致：\n${bad.join('\n')}`)
})

test('地点不会把房间名在括号里重复一遍', () => {
  const bad = []
  for (const t of tasks.tasks) {
    for (const s of t.steps || []) {
      for (const d of s.detail || []) {
        if (!['房间', '场景', '关卡'].includes(d.label)) continue
        const m = /^(.+?)（(.+)）$/.exec(String(d.value || ''))
        if (!m) continue
        const [, name, sub] = m
        // 括号里任何一段都不应被房间名包含（灾害研究所（外部） vs 灾害研究所）
        for (const part of sub.split(' > ')) {
          if (part && (name === part || name.includes(part))) {
            bad.push(`${t.id} step${s.index} ${d.label}: ${d.value}`)
          }
        }
      }
    }
  }
  assert.deepEqual(bad, [], `地点重复：\n${bad.join('\n')}`)
})

test('截图里的两条具体用例保持修复后的形态', () => {
  const m112 = tasks.tasks.find(t => t.id === 'm_1_12')
  const room = m112.steps.find(s => s.index === 2).detail.find(d => d.label === '房间')
  assert.equal(room.value, '旧日修行所（秋日荒野）')

  const m004 = tasks.tasks.find(t => t.id === 'main_0_04')
  const room2 = m004.steps[1].detail.find(d => d.label === '房间')
  assert.equal(room2.value, '驿站内部')
})

/**
 * 接取 NPC 的名字：`getTask.title` 就是游戏里的 NPC 名。
 *
 * 起因（2026-10-15，用户报告）：任务「怒火来自地鼠」的「接取 NPC」显示
 * `未知（cart_at_npc_glt）`。该 id 在 room/scene/hero 表里都查不到
 * —— 因为它是**立绘资源名**（`Texture/UIPanel/FreightPanel/<npc>`），不是数据 id。
 *
 * 依据源码 `DailyTaskPanel.cs:244-249`（NPC 名与立绘成对显示）：
 *   `taskTitle.text   = getTask.dialog`  ← 任务要做什么
 *   `taskNpcName.text = getTask.title`   ← NPC 名
 *   `LoadAssetFile("Texture/UIPanel/FreightPanel/" + getTask.npc)` ← 仅用于立绘
 *
 * 所以「接取 NPC」用 `title`；页面**不该**再把它显示成「交互对话」（那是 `dialog`）。
 * 部分 `title` 是旁白（如「（上前搭话。）」）—— 那是游戏原样显示的内容，照实展示。
 */
test('🔴 接取 NPC 用 getTask.title 出名字，不再有「未知（立绘资源名）」', () => {
  const withNpc = tasks.tasks.filter(t => t.getTask?.npc)
  assert.ok(withNpc.length > 0, '应有带接取 NPC 的任务')

  // 用户报告的那一条
  const reported = tasks.tasks.find(t => t.id === 'wt_yz_02')
  assert.equal(reported.getTask.npc.name, '修业学徒格兰缇')
  assert.equal(reported.getTask.npc.id, 'cart_at_npc_glt')
  assert.equal(reported.getTask.title, '修业学徒格兰缇')

  // `title` 有值时一律拿它当名字；解析不出时 `name` 必须是 `null`（不是「未知」字符串）
  const unresolvable = withNpc.filter(t => !t.getTask.npc.name)
  for (const t of unresolvable) {
    assert.equal(t.getTask.npc.name, null, `${t.id} 解析不出名字时应为 null`)
  }
})

/**
 * 方案 A：**解析不出名字的 NPC 行不产出**。
 *
 * 背景（2026-10-15）：25 个 uid（`baduer_yzdq_7`、`ke_sldsd_21`、`NPC031` …）在任何表里都没有名字 ——
 * `room.npcList` 无该 uid、其所在房间在 `room.json` 里不存在、`npc.json` 只有立绘字段（无 name）。
 * 原先显示「未知（ke_sldsd_21）」，玩家看不懂且暴露内部 id。
 *
 * 依据：游戏任务界面（`TaskPanel.cs:385-386`）只显示 `stepName` + `stepDes`，**步骤级没有 NPC 行**。
 * 所以查不到时省略，与游戏行为一致。
 */
test('🔴 方案A：产物里不出现「未知（内部 id）」', () => {
  const bad = []
  for (const t of tasks.tasks) {
    for (const [where, v] of [['接取NPC', t.getTask?.npc?.name], ['起始NPC', t.startNpc?.name]]) {
      if (v && (/^未知/.test(v) || /^[a-zA-Z][a-zA-Z0-9_]*\d[a-zA-Z0-9_]*$/.test(v))) {
        bad.push(`${t.id} ${where}=${v}`)
      }
    }
    for (const s of t.steps || []) {
      for (const d of s.detail || []) {
        if (d.label === 'NPC' && /^未知/.test(d.value || '')) bad.push(`${t.id} step${s.index} NPC=${d.value}`)
      }
    }
  }
  assert.deepEqual(bad, [], `仍有「未知（内部 id）」：\n${bad.slice(0, 10).join('\n')}`)
})

test('方案A：查不到名字时该行整体省略，不留空值', () => {
  for (const t of tasks.tasks) {
    // name 为 null 时页面不渲染 —— 但若同时有 startNpc，它的 name 也不能是空串
    if (t.startNpc) assert.ok(t.startNpc.name, `${t.id} startNpc.name 为空会产生空行`)
    for (const s of t.steps || []) {
      for (const d of s.detail || []) {
        if (d.label === 'NPC') assert.ok(d.value, `${t.id} step${s.index} 的 NPC 行值为空`)
      }
    }
  }
})

test('方案A：真名未被误伤，且「交互对话」独立保留', () => {
  // 抽查改动前就有真名的三条
  const expect = { wt_yz_02: '修业学徒格兰缇', s_4_12: '威格迪哆', m_2_11: '剋大师' }
  for (const [id, name] of Object.entries(expect)) {
    const t = tasks.tasks.find(x => x.id === id)
    const got = t?.getTask?.npc?.name || t?.startNpc?.name
    assert.equal(got, name, `${id} 真名丢失`)
  }
  // 名字解析不出时，台词（line）不受影响 —— 它是玩家可读信息
  const withLine = tasks.tasks.filter(t => t.getTask?.npc?.line)
  assert.ok(withLine.length > 0, '「交互对话」应仍有内容')
})

test('NPC 名与「任务目标」是两个字段，不能串用', () => {
  // 名字来自 title、目标来自 dialog（依据 DailyTaskPanel.cs:244-249）。
  // 若有人把两处都写成 title，页面上「接取 NPC」与「任务目标」会重复。
  const sample = tasks.tasks.find(t => t.id === 'wt_yz_02')
  assert.equal(sample.getTask.title, '修业学徒格兰缇', 'NPC 名应取自 title')
  assert.notEqual(sample.getTask.dialog?.raw, sample.getTask.title, '任务目标不该等于 NPC 名')

  // 带对话文本（非纯文本型）的条目，dialog 应指向真实剧情 id
  const withDialog = tasks.tasks.filter(t => t.getTask?.dialog && !t.getTask.dialog.isText)
  assert.ok(withDialog.length > 0, '应有可展开剧情的接取对话')
})

test('起始 NPC 与接取 NPC 保持一致（同一个 getTask.npc 来源）', () => {
  for (const t of tasks.tasks) {
    if (!t.getTask?.npc || !t.startNpc) continue
    assert.equal(t.startNpc.name, t.getTask.npc.name, `${t.id} 两处 NPC 名不一致`)
    assert.equal(t.startNpc.id, t.getTask.npc.id, `${t.id} 两处 NPC id 不一致`)
  }
})

/**
 * `passStage` 与 `gotoStage` 的位置展示必须一致。
 *
 * 依据源码 `TaskPanel.cs:505-521` 的 `ShowCurrentTaskGo`：它对**所有** stepType 通用 ——
 * `stepPosition[0]` 是种类、`[1]` 是 id，`case "room"` 取 `GetRoomLevelDataById` 显示「区域/房间」。
 * `passStage` 的 `stepPosition` 正是 `["room", "ydzb_5"]`，所以游戏里**是显示位置**的。
 *
 * 曾因一行与源码不符的注释（「不显示关卡/位置」）导致 14 条 `passStage` 全部无位置。
 */
test('🔴 passStage 与 gotoStage 一样显示位置（依据 ShowCurrentTaskGo 通用分支）', () => {
  const ofType = type => tasks.tasks.flatMap(t => (t.steps || []).filter(s => s.type === type))
  const passStage = ofType('passStage')
  const gotoStage = ofType('gotoStage')
  assert.ok(passStage.length > 0, '应有 passStage 步骤')

  // 每个 passStage 都应带位置（原表 stepPosition 都有值）
  const noDetail = passStage.filter(s => !(s.detail || []).length)
  assert.deepEqual(noDetail.map(s => s.taskId || ''), [], `passStage 缺少位置：${noDetail.length} 条`)

  // 且位置标签与 gotoStage 同类（房间/关卡/场景）
  const labels = new Set([...passStage, ...gotoStage].flatMap(s => (s.detail || []).map(d => d.label)))
  for (const l of labels) assert.ok(['房间', '关卡', '场景', '副本'].includes(l), `意外的位置标签：${l}`)
})

test('hunter 步骤的怪物列表带可点击详情标记', () => {
  const hunter = tasks.tasks.flatMap(t => (t.steps || []).filter(s => s.type === 'hunter'))
  assert.ok(hunter.length > 0, '应有 hunter 步骤')
  const withMon = hunter.filter(s => (s.monsters || []).length)
  assert.ok(withMon.length > 0, 'hunter 应有怪物列表')
  for (const s of withMon) {
    for (const m of s.monsters) {
      assert.ok(typeof m.hasMonsterDetail === 'boolean', `${m.id} 缺 hasMonsterDetail 标记`)
      assert.ok(m.name, `${m.id} 缺名字`)
    }
  }
})

test('任务接取条件推导与前置任务链（含首次战败、主线后续与好感度）', () => {
  // 1. 变强的方法（s_1_7）：需完成 s_1_5，且标明首次战斗失败后解锁
  const s17 = tasks.tasks.find(t => t.id === 's_1_7')
  assert.ok(s17, 's_1_7 应存在')
  assert.equal(s17.getTask.condition, '完成支线《失败是成功之母》（需首次战斗失败后解锁）')
  assert.ok(s17.predecessorTasks?.some(p => p.id === 's_1_5'), 's_1_7 前置任务应包含 s_1_5')

  // 2. 失败是成功之母（s_1_5）：首次战败触发
  const s15 = tasks.tasks.find(t => t.id === 's_1_5')
  assert.ok(s15, 's_1_5 应存在')
  assert.equal(s15.getTask.condition, '首次战斗失败后解锁（于营地接取）')
  assert.ok(s15.predecessorTasks?.some(p => p.id === 'm_1_1'), 's_1_5 前置任务应包含契约者')

  // 3. 赤血剑姬，贝拉多娜（s_2_3）：过完第二章主线解锁
  const s23 = tasks.tasks.find(t => t.id === 's_2_3')
  assert.ok(s23, 's_2_3 应存在')
  assert.equal(s23.getTask.condition, '完成《索利德的未来》')
  assert.ok(s23.predecessorTasks?.some(p => p.id === 'm_2_11'), 's_2_3 前置任务应包含索利德的未来')

  // 4. 好感度任务：不再是「无」，而是伙伴好感度阶段
  const favTasks = tasks.tasks.filter(t => t.id.startsWith('fav_hero_') && !t.close)
  assert.ok(favTasks.length > 200, '活跃好感度任务应有 200+ 条')
  for (const ft of favTasks) {
    assert.match(ft.getTask.condition, /^伙伴【.+】好感度达到第 \d+ 阶段$/, `${ft.id} 接取条件应为好感度阶段`)
  }

  // 5. 整体接取条件覆盖率：绝大多数活跃任务都有明确条件
  const activeTasks = tasks.tasks.filter(t => !t.close)
  const noneCond = activeTasks.filter(t => t.getTask.condition === '无')
  assert.ok(noneCond.length < 10, `活跃任务无条件数量应极少（实际 ${noneCond.length}）`)
})

test('任务地点优先取接取 NPC 所在房间，而非第 1 步的指引目标房间', () => {
  // 古堡也要大扫除（s_sp1_4）：接取 NPC 茜狄亚在会客厅，第 1 步去餐舍找托利斯
  const sSp14 = tasks.tasks.find(t => t.id === 's_sp1_4')
  assert.ok(sSp14, 's_sp1_4 应存在')
  assert.equal(sSp14.startLocation, '会客厅（幽夜古堡 > 幽夜古堡）', '任务地点应为接取 NPC 茜狄亚所在的会客厅，不能误显示为第 1 步目标餐舍')
  assert.equal(sSp14.steps[0].detail.find(d => d.label === '房间')?.value, '餐舍（幽夜古堡 > 幽夜古堡）', '第 1 步步骤房间保持餐舍')

  // 美食之夜（s_sp1_5）：接取 NPC 在会客厅，第 1 步同样是指引去餐舍
  const sSp15 = tasks.tasks.find(t => t.id === 's_sp1_5')
  assert.ok(sSp15, 's_sp1_5 应存在')
  assert.equal(sSp15.startLocation, '会客厅（幽夜古堡 > 幽夜古堡）')

  // 哈比之王（s_2_1）：接取 NPC 在巴诺姆村，第 1 步是指引去矿山道
  const s21 = tasks.tasks.find(t => t.id === 's_2_1')
  assert.ok(s21, 's_2_1 应存在')
  assert.equal(s21.startLocation, '巴诺姆村（索利德山地）')

  // 营地接取判定：伙伴好感度事件、在营地与米托拉接取的主支线任务
  const favTask = tasks.tasks.find(t => t.id === 'fav_hero_034_5')
  assert.ok(favTask, 'fav_hero_034_5 应存在')
  assert.equal(favTask.startLocation, '营地', '伙伴好感度任务地点应明确标记为「营地」')

  const campSubTask = tasks.tasks.find(t => t.id === 's_1_1')
  assert.ok(campSubTask, 's_1_1 变废为宝应存在')
  assert.equal(campSubTask.startLocation, '营地', '在营地找米托拉接取的支线任务地点应标记为「营地」')
})
