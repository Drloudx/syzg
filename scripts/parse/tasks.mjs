/**
 * 任务图鉴预解析：public/data/parsed/tasks.json
 * 对应浏览器端 src/utils/taskParser.js 的 buildTaskData（同一纯函数）
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildDialogSearchIndex, buildTaskData } from '../../src/utils/taskParser.js'
import { publicDataDir, readJson } from './shared.mjs'

/** 已裁剪的剧情副本目录（由 `scripts/dev/check-task-data.mjs --apply` 维护）。 */
const TASK_DIALOG_DIR = join(publicDataDir, 'taskDialogs')

/**
 * 读取 `public/data/taskDialogs/` 下的剧本，构建 dialogId -> script 的映射。
 *
 * 该目录的维护者是 `check-task-data.mjs`（`--apply` 时从 GAoNano 复制、裁剪舞台指令、
 * 并在缺本体时回退 `<id>旧` 变体），**不由本脚本生成** —— 这里只消费它的产物。
 * 目录缺失（例如从未跑过该维护脚本的新环境）时返回空表，搜索索引退化为空，
 * 不阻塞常规构建。
 */
function readTaskDialogScripts() {
  const scripts = new Map()
  if (!existsSync(TASK_DIALOG_DIR)) return scripts
  for (const name of readdirSync(TASK_DIALOG_DIR)) {
    if (!name.endsWith('.json')) continue
    try {
      scripts.set(name.slice(0, -'.json'.length), JSON.parse(readFileSync(join(TASK_DIALOG_DIR, name), 'utf8')))
    } catch {
      // 单个剧本损坏不影响整体构建；搜索索引会自然缺少这一个任务的剧情
    }
  }
  return scripts
}

/**
 * 已收录的剧情 id 集合（`public/data/taskDialogs/` 下的文件名）。
 *
 * 传给解析器用于在构建期标出「原表引用了但剧情未收录」的条目（实测 25 个），
 * 页面据此显示「（该剧情未收录）」且不渲染展开按钮 —— 避免把内部 id 暴露给玩家。
 */
function readDialogIdSet() {
  const ids = new Set()
  if (!existsSync(TASK_DIALOG_DIR)) return ids
  for (const name of readdirSync(TASK_DIALOG_DIR)) {
    if (name.endsWith('.json')) ids.add(name.slice(0, -'.json'.length))
  }
  return ids
}

export function buildTasksFile() {
  const maps = {
    taskJson: readJson('task.json'),
    levelStageJson: readJson('levelStage.json'),
    levelRoomJson: readJson('levelRoom.json'),
    areaJson: readJson('area.json'),
    instanceJson: readJson('instance.json'),
    battleJson: readJson('battle.json'),
    roomJson: readJson('room.json'),
    rewardJson: readJson('reward.json'),
    itemJson: readJson('item.json'),
    monJson: readJson('mon.json'),
    fileMonJson: readJson('fileMon.json'),
    conditionJson: readJson('condition.json'),
    roomCollectJson: readJson('roomCollect.json'),
    roomCollectTypeJson: readJson('roomCollectType.json'),
    newOrderJson: readJson('newOrder.json'),
    heroJson: readJson('hero/hero.json'),
    // `tag` 步骤的 `stepPara.tag` 是事件记录键，可读描述在 eventRecord 的 `desc` 里
    eventRecordJson: readJson('eventRecord.json'),
    dialogIndexJson: readJson('parsed/dialogIndex.json'),
    dialogSegmentsJson: readJson('parsed/dialogSegments.json'),
    dialogIds: readDialogIdSet()
  }
  const data = buildTaskData(maps)
  return { file: 'parsed/tasks.json', data }
}

/**
 * 任务图鉴的**剧情全文搜索索引** -> `public/data/parsed/dialog-search.json`。
 *
 * 独立产物的理由（首屏体积）与「为什么存全文而不是倒排」见
 * `taskParser.js` 的 `buildDialogSearchIndex` 注释。
 */
export function buildDialogSearchFile(tasksData) {
  const scripts = readTaskDialogScripts()
  const data = buildDialogSearchIndex(tasksData || buildTasksFile().data, scripts)
  return { file: 'parsed/dialog-search.json', data }
}
