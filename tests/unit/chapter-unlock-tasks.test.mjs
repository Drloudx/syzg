import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

/**
 * 关卡图鉴自由探索房间任务解锁标记测试。
 * 判据来源：
 * - 源码 `MapPanel.cs:2735`、`BattleManager.cs:4253` 与 `RecordData.cs`
 * - 配置表 `raw/task.json` 的 `unlockStage` 与 `steps[].stepUnlockStage`
 */
test('自由探索房间任务解锁标注完整性', () => {
  const stageFilePath = 'public/data/parsed/stages/c2_area4.json'
  assert.ok(existsSync(stageFilePath), 'c2_area4.json 产物应存在')

  const stageData = JSON.parse(readFileSync(stageFilePath, 'utf8'))
  const rooms = stageData.difficulties[0].rooms

  // 1. 山神之殒本体房间：由主线 m_2_9「决意的尖角」解锁
  const r1 = rooms.find(r => r.roomId === 'c2_area4_1')
  assert.ok(r1, '应有山神之殒房间')
  assert.ok(r1.unlockTasks?.length > 0, '山神之殒应有解锁任务')
  assert.equal(r1.unlockTasks[0].id, 'm_2_9')
  assert.equal(r1.unlockTasks[0].name, '决意的尖角')
  assert.equal(r1.unlockTasks[0].typeName, '主线')

  // 2. 安娜的试验场：由支线 s_2_2「长期研究人才征募计划！」解锁
  const r2 = rooms.find(r => r.roomId === 'c2_area4_2')
  assert.ok(r2, '应有安娜的试验场')
  assert.equal(r2.hidden, true, '安娜的试验场为隐藏房间')
  assert.ok(r2.unlockTasks?.length > 0, '安娜的试验场应有解锁任务')
  assert.equal(r2.unlockTasks[0].id, 's_2_2')
  assert.equal(r2.unlockTasks[0].name, '长期研究人才征募计划！')
  assert.equal(r2.unlockTasks[0].typeName, '支线')

  // 3. 安娜的勘测地：由支线 s_2_2「长期研究人才征募计划！」解锁
  const r3 = rooms.find(r => r.roomId === 'c2_area4_3')
  assert.ok(r3, '应有安娜的勘测地')
  assert.equal(r3.hidden, true, '安娜的勘测地为隐藏房间')
  assert.ok(r3.unlockTasks?.length > 0, '安娜的勘测地应有解锁任务')
  assert.equal(r3.unlockTasks[0].id, 's_2_2')

  // 4. 山神之殒外围 (c2_area4_4)：官方未完工废案，应被黑名单全局过滤
  const r4 = rooms.find(r => r.roomId === 'c2_area4_4')
  assert.equal(r4, undefined, '山神之殒外围应被黑名单过滤不展示')
})

test('隐藏物品 parsed-hidden.json 应过滤废案山神之殒外围', () => {
  const hiddenData = JSON.parse(readFileSync('public/data/parsed/parsed-hidden.json', 'utf8'))
  const scrapInHidden = hiddenData.some(h => h.roomId === 'c2_area4_4' || (h.roomName && h.roomName.includes('山神之殒外围')))
  assert.equal(scrapInHidden, false, 'parsed-hidden.json 中不应存在山神之殒外围')
})

test('其他典型隐藏探索房间任务解锁验证', () => {
  // 黑铁锻炉：维丝的秘密基地 (c1_area3_6) -> 格薇勒与秘密基地 (s_1_13)
  const c1Area3 = JSON.parse(readFileSync('public/data/parsed/stages/c1_area3.json', 'utf8'))
  const rSecret = c1Area3.difficulties[0].rooms.find(r => r.roomId === 'c1_area3_6')
  assert.ok(rSecret, '应有维丝的秘密基地')
  assert.equal(rSecret.unlockTasks?.[0]?.id, 's_1_13')

  // 巴诺姆村：菲莉娜的契约台 (c2_area1_8) -> 哈比之王 (s_2_1)
  const c2Area1 = JSON.parse(readFileSync('public/data/parsed/stages/c2_area1.json', 'utf8'))
  const rFeilina = c2Area1.difficulties[0].rooms.find(r => r.roomId === 'c2_area1_8')
  assert.ok(rFeilina, '应有菲莉娜的契约台')
  assert.equal(rFeilina.unlockTasks?.[0]?.id, 's_2_1')
})
