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
import { cleanDialogueLine } from '../../src/utils/gameMappings.js'

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

test('剧情搜索索引：按「步骤:剧情」分块，可定位到具体行', () => {
  assert.equal(search.meta?.form, 'per-dialog-lines')
  assert.ok(search.meta.taskCount > 250, `有剧情的任务数偏少：${search.meta.taskCount}`)

  const ids = new Set(tasks.tasks.map(t => t.id))
  for (const [taskId, blocks] of Object.entries(search.tasks)) {
    assert.ok(ids.has(taskId), `索引里出现未知任务：${taskId}`)
    assert.ok(Array.isArray(blocks) && blocks.length > 0, `${taskId} 应当有剧情块`)
    for (const b of blocks) {
      // key 形如 `步骤下标:剧情下标`，与 TasksView 的 dialogOpen 键一致，才能定位
      assert.match(b.key, /^\d+:\d+$/, `${taskId} 的块 key 形状不对：${b.key}`)
      assert.ok(Array.isArray(b.lines) && b.lines.length > 0, `${taskId} ${b.key} 的行数组为空`)
      for (const line of b.lines) assert.equal(typeof line, 'string')
    }
  }

  // 抽样：用 buildDialogSearchIndex 重算，应与产物一致
  const scripts = new Map()
  for (const f of readdirSync(dialogDir).filter(f => f.endsWith('.json'))) {
    scripts.set(f.slice(0, -5), JSON.parse(readFileSync(join(dialogDir, f), 'utf8')))
  }
  const sample = { tasks: tasks.tasks.slice(0, 40) }
  const rebuilt = buildDialogSearchIndex(sample, scripts)
  for (const t of sample.tasks) {
    assert.deepEqual(rebuilt.tasks[t.id], search.tasks[t.id], `${t.id} 的剧情块与产物不一致`)
  }
})

test('索引里的行文本与页面渲染出的条目逐行一致', () => {
  // 这是「滚动到命中行」成立的前提：索引第 N 行必须就是页面第 N 条
  const scripts = new Map()
  for (const f of readdirSync(dialogDir).filter(f => f.endsWith('.json'))) {
    scripts.set(f.slice(0, -5), JSON.parse(readFileSync(join(dialogDir, f), 'utf8')))
  }

  /** 复刻 TasksView.toggleDialog 的条目生成逻辑 */
  const renderLines = script => (script.exps || [])
    .filter(e => e.key === 'text' || e.key === 'option')
    .map(e => {
      if (e.key === 'option') {
        return (e.para.options || []).map(o => cleanDialogueLine(o.text)).join('\n')
      }
      return cleanDialogueLine(e.para.text || '')
    })
    .filter(Boolean)

  let checked = 0
  for (const t of tasks.tasks) {
    const blocks = search.tasks[t.id]
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      const [sIdx, dIdx] = block.key.split(':').map(Number)
      const raw = t.steps?.[sIdx]?.dialogs?.[dIdx]?.meta?.raw
      if (!raw) continue
      const script = scripts.get(raw)
      if (!script) continue
      checked++
      assert.deepEqual(block.lines, renderLines(script),
        `${t.id} ${block.key}（${raw}）的索引行与渲染条目不一致 —— 会导致滚动定位到错误的行`)
    }
  }
  assert.ok(checked > 1000, `应当核对了足够多的剧情块，实际 ${checked}`)
})

test('索引行与页面用的是同一个清洗函数（主角称呼等必须已替换）', () => {
  // 用户看到的是「小工匠」，索引里就必须是「小工匠」而不是 {myName}
  assert.equal(cleanDialogSearchLine('[show]{myName}，你醒了。[l][cm]'), cleanDialogueLine('[show]{myName}，你醒了。[l][cm]'))
  assert.equal(cleanDialogSearchLine('[show]主角，这边走。[l][cm]'), '小工匠，这边走。')

  const all = Object.values(search.tasks)
    .flatMap(blocks => blocks.flatMap(b => b.lines))
    .join('\n')
  assert.ok(!/\[show\]|\[l\]|\[cm\]|\[hide\]/.test(all), '剧情索引里仍残留舞台标记')
  assert.ok(!/\{myName\}|\{callName\d\}/.test(all), '剧情索引里仍残留主角称呼占位符')
})
