/**
 * 任务图鉴：剧情全文搜索索引 + 剧情回退与裁剪的回归。
 *
 * 这三件事互为因果，一起锁住：
 *   1. `taskDialogs/` 只留 `text`/`option`（舞台指令不进产物）；
 *   2. 缺本体的 id 回退 `<id>旧` 变体（游戏包里只有带后缀那份）；
 *   3. `parsed/dialog-search.json` 能从上述产物还原出可搜索的剧情正文。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildDialogSearchIndex, cleanDialogSearchLine } from '../../src/utils/taskParser.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'))

const tasks = read('public/data/parsed/tasks.json')
const search = read('public/data/parsed/dialog-search.json')
const dialogDir = join(root, 'public/data/taskDialogs')

test('剧情副本只保留页面读取的 text / option，舞台指令不进产物', () => {
  const files = readdirSync(dialogDir).filter(f => f.endsWith('.json'))
  assert.ok(files.length > 1000, `剧情副本数量异常：${files.length}`)

  const badKeys = new Set()
  let checked = 0
  for (const f of files) {
    const j = JSON.parse(readFileSync(join(dialogDir, f), 'utf8'))
    for (const e of (j.exps || [])) {
      checked++
      if (e.key !== 'text' && e.key !== 'option') badKeys.add(e.key)
    }
  }
  assert.ok(checked > 0, '应当有可检查的 exps 条目')
  assert.deepEqual([...badKeys], [],
    `产物里出现了非 text/option 的舞台指令：${[...badKeys].join(', ')}`)
})

test('缺本体的剧情回退到「旧」变体，且以配置里的原 id 命名', () => {
  // 这 4 个是实测「游戏包里只有 <id>旧 那份」的
  const expected = ['Main_0_07_4', 'Main_0_07_5', 'Main_0_09_2', 'Main_0_09_3']
  for (const id of expected) {
    assert.ok(existsSync(join(dialogDir, `${id}.json`)),
      `${id}.json 应当由「${id}旧」回退生成`)
  }

  // des 必须与任务步骤名对得上（这是判断回退正确的依据）
  const desOf = id => readFileSync(join(dialogDir, `${id}.json`), 'utf8').match(/"des":\s*"([^"]*)"/)?.[1]
  assert.equal(desOf('Main_0_07_4'), '寻找良材')
  assert.equal(desOf('Main_0_07_5'), '交付订单')
  assert.equal(desOf('Main_0_09_2'), '凯旋归来')
  assert.equal(desOf('Main_0_09_3'), '新的冒险')
})

test('剧情搜索索引：任务引用到的剧本都能还原出正文', () => {
  assert.equal(search.meta?.form, 'per-task-fulltext')
  assert.ok(search.meta.taskCount > 250, `有剧情的任务数偏少：${search.meta.taskCount}`)

  // 索引里的每个任务都必须在 tasks.json 里存在，且文本非空
  const ids = new Set(tasks.tasks.map(t => t.id))
  for (const [taskId, text] of Object.entries(search.tasks)) {
    assert.ok(ids.has(taskId), `索引里出现未知任务：${taskId}`)
    assert.ok(text.length > 0, `${taskId} 的剧情文本为空`)
  }

  // 抽样：抽 5 个任务，用 buildDialogSearchIndex 重算，应与产物一致
  const scripts = new Map()
  for (const f of readdirSync(dialogDir).filter(f => f.endsWith('.json'))) {
    scripts.set(f.slice(0, -5), JSON.parse(readFileSync(join(dialogDir, f), 'utf8')))
  }
  const sample = { tasks: tasks.tasks.slice(0, 40) }
  const rebuilt = buildDialogSearchIndex(sample, scripts)
  for (const t of sample.tasks) {
    assert.equal(rebuilt.tasks[t.id], search.tasks[t.id], `${t.id} 的剧情文本与产物不一致`)
  }
})

test('剧情索引里不含舞台标记，可直接用于命中与高亮', () => {
  const all = Object.values(search.tasks).join('\n')
  assert.ok(!/\[show\]|\[l\]|\[cm\]|\[hide\]/.test(all), '剧情索引里仍残留舞台标记')
  assert.equal(cleanDialogSearchLine('[show]你好[l][cm]'), '你好')
})
