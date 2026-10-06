/**
 * 任务图鉴数据维护脚本
 * - 默认只读校验；--apply 时将缺失的完整 battle/room/condition 原表补入 raw/
 * - 更新已有原表需显式 --apply --replace，不在维护阶段裁剪原始表
 * - 从 GAoNano_decrypted 复制任务剧情到 public/data/taskDialogs（去重）
 * - 校验任务引用解析率，输出统计 + unresolved.json
 *
 * 用法：node scripts/dev/check-task-data.mjs [--apply] [--replace] [--config 目录] [--dialogs 目录]
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { configRoot, dialogRoot, gameSourceRoot, publicDataRoot, rawRoot } from './maintenance-paths.mjs'
import { applyRawSyncPlan, createRawSyncPlan } from './raw-sync.mjs'

const { values } = parseArgs({ options: {
  apply: { type: 'boolean' }, replace: { type: 'boolean' },
  config: { type: 'string' }, dialogs: { type: 'string' }, filelist: { type: 'string' }
} })
const APPLY = !!values.apply
const SRC = path.resolve(values.config || configRoot)
const GAO = path.resolve(values.dialogs || dialogRoot)
const FILELIST = path.resolve(values.filelist || path.join(gameSourceRoot, 'CDN最新配置/json/GAoNano/GAoNanoFileList.json'))
const DATA = publicDataRoot
const RAW = rawRoot

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'))
const writeJson = (p, obj) => {
  if (!APPLY) return
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8')
}

/**
 * 剧情文件瘦身：只保留页面真正读取的条目。
 *
 * GAoNano 每个剧本里 `exps` 是**逐帧舞台指令流**：`moveLayer` / `tag` / `wait` /
 * `top` / `setLayer` / `setLayerFace` / `event` / `shake` … 这些是给游戏引擎排布
 * 立绘与特效用的。本站两个消费方（`TasksView.toggleDialog`、
 * `HeroStoryPanels.normalizeDialogue`）**都只读 `text` 与 `option`**。
 *
 * 实测 169,240 条 exps 里只有 28,696 条是被读取的（`text` 25,980 + `option` 2,716），
 * 其余 83% 是站点永远不会渲染的舞台指令 —— 两个目录合计 20.92 MB → 3.47 MB。
 *
 * **只裁剪进产物的副本**，`GAoNano_decrypted` 源文件不动（与项目「不写回原表」一致）。
 */
const pruneDialogScript = (obj) => {
  if (!obj || !Array.isArray(obj.exps)) return obj
  return { ...obj, exps: obj.exps.filter(e => e && (e.key === 'text' || e.key === 'option')) }
}

/**
 * 读取源剧本并按需裁剪后写入目标；目标已存在时按内容比对，变化才重写。
 *
 * **找不到本体时回退 `<name>旧`**（2026-10-06 加）。
 *
 * GAoNano 里有 24 个带「旧」后缀的剧本，它们**全部**列在游戏自己的清单
 * `GAoNanoFileList.json` 里，而对应的无后缀名字**反而不在清单**——即后缀是策划改名时
 * 留下的历史残留，游戏实际加载带后缀那份，任务配置却没跟着改名。三处独立吻合可证：
 *   · `Main_0_07_4旧` 的 des =「寻找良材」= `main_0_07_q` 第 4 步名；
 *   · `Main_0_09_2旧` =「凯旋归来」= `main_0_09` 第 3 步所引 `Main_0_09_2`；
 *   · `Main_0_09_3旧` =「新的冒险」= 该任务第 4 步所引 `Main_0_09_3`。
 * 因此这类 id **回退取「旧」变体**，产物仍以配置里的原 id 命名（前端按原 id 请求）。
 * 回退过的 id 全部记进 `legacyFallbacks` 并在末尾打印，不静默替换。
 */
let copiedDialog = 0
const legacyFallbacks = []
const copyDialogScript = (name, targetDir) => {
  const target = path.join(targetDir, `${name}.json`)
  let src = path.join(GAO, `${name}.json`)
  let viaOld = false
  if (!fs.existsSync(src)) {
    const oldSrc = path.join(GAO, `${name}旧.json`)
    if (!fs.existsSync(oldSrc)) return false
    src = oldSrc
    viaOld = true
  }
  const raw = JSON.parse(fs.readFileSync(src, 'utf-8'))
  const pruned = JSON.stringify(pruneDialogScript(raw), null, 2)
  let changed = true
  if (fs.existsSync(target)) {
    try { changed = fs.readFileSync(target, 'utf-8') !== pruned } catch { changed = true }
  }
  if (changed) {
    if (APPLY) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, pruned, 'utf-8')
    }
    if (!fs.existsSync(target) || APPLY) copiedDialog++
  }
  if (viaOld && !legacyFallbacks.includes(name)) legacyFallbacks.push(name)
  return true
}

// ---------- 1. 预览/同步完整原始表；裁剪仅属于构建后的派生数据 ----------
const rawPlan = createRawSyncPlan({ sourceRoot: SRC, targetRoot: RAW, replace: !!values.replace, files: ['battle.json', 'room.json', 'condition.json'] })
for (const entry of rawPlan) console.log(`[${entry.action}] ${entry.sourceName} -> raw/${entry.targetName}`)
if (APPLY) applyRawSyncPlan(rawPlan)
else console.log('[preview] 只读检查；--apply 补缺，--apply --replace 显式更新完整原表。')

// ---------- 2. 收集任务引用的剧情 id（含步骤触发的战斗副本关卡内剧情） ----------
const task = readJson(path.join(SRC, 'task.json')).datas
const battle = readJson(path.join(SRC, 'battle.json')).datas || {}
const room = readJson(path.join(SRC, 'room.json')) || {}
const dialogIds = new Set()
for (const t of Object.values(task)) {
  const gt = t.getTask || {}
  for (const k of ['dialog', 'dialog0', 'dialog1']) if (gt[k]) dialogIds.add(gt[k])
  for (const s of t.steps || []) {
    const p = s.stepPara || {}
    for (const k of ['dialog', 'dialog0', 'dialog1']) if (p[k]) dialogIds.add(p[k])
    if (p.battleId && battle[p.battleId]) {
      const b = battle[p.battleId]
      if (b.storyBefore) dialogIds.add(b.storyBefore)
      for (const lay of (b.layers || [])) {
        for (const ld of (lay.layerDatas || [])) {
          for (const rk of Object.keys((ld && ld.rooms) || {})) {
            const rt = ld.rooms[rk].roomTypeId
            const r = room[rt]
            if (r && r.battleData && r.battleData.triggers) {
              for (const tr of r.battleData.triggers) {
                for (const act of (tr.actions || [])) {
                  if (act.actionType === 'dialog' && act.actionPara && act.actionPara.dialog) {
                    dialogIds.add(act.actionPara.dialog)
                  }
                }
              }
            }
          }
        }
      }
      if (b.storyAfter) dialogIds.add(b.storyAfter)
    }
  }
}

// ---------- 3. 复制剧情脚本（去重，保留原文件名） ----------
const dialogDir = path.join(DATA, 'taskDialogs')
if (APPLY) fs.mkdirSync(dialogDir, { recursive: true })
const missingDialogs = []

for (const id of dialogIds) {
  // 分段事件：fav_hero_041_4_0 这类 id 只是某段，整个事件是 fav_hero_041_4_0/1/2...
  // （_1/_2 可能只出现在 room.json 的战斗触发器里，任务表引用不到，必须整族复制）
  const existed = []
  const segMatch = /^(.*)_\d+$/.exec(id)
  const baseId = segMatch ? segMatch[1] : id

  // 族内分段：base_0, base_1, ...（有 base_0 才说明是分段事件）
  if (copyDialogScript(`${baseId}_0`, dialogDir)) {
    existed.push(baseId + '_0')
    let segIdx = 1
    while (true) {
      const segName = `${baseId}_${segIdx}`
      if (copyDialogScript(segName, dialogDir)) {
        existed.push(segName)
        segIdx++
      } else {
        break
      }
    }
  }

  // 非分段事件：直接复制 id 本体（内部会回退 `<id>旧`）
  if (copyDialogScript(id, dialogDir)) existed.push(id)

  // 兼容：id 是分段事件的一段的场景，确保该段本身也在
  if (segMatch && !existed.includes(id) && copyDialogScript(id, dialogDir)) {
    existed.push(id)
  }

  // 旧逻辑兜底：id_0 / id_1 ...（处理“id 是基名”的情况）
  if (!segMatch && !existed.length) {
    let segIdx = 0
    while (true) {
      const segName = `${id}_${segIdx}`
      if (copyDialogScript(segName, dialogDir)) {
        existed.push(segName)
        segIdx++
      } else {
        break
      }
    }
  }

  if (!existed.length) {
    missingDialogs.push(id)
  }
}
console.log(`[dialog] 唯一剧情 id：${dialogIds.size}，${APPLY ? '新增复制' : '待复制'}：${copiedDialog}，缺失文件：${missingDialogs.length}`)
if (legacyFallbacks.length) {
  console.log(`[dialog] 回退「旧」变体的 id（${legacyFallbacks.length} 个，游戏包里只有带后缀那份）：`)
  console.log('  ' + legacyFallbacks.join('、'))
}
if (missingDialogs.length) {
  console.log('[dialog] 缺失（多为纯文本目标，如“提交 1 个xxx。”）：')
  console.log('  ' + missingDialogs.slice(0, 30).join('、'))
}

// ---------- 3.5 生成剧情名称索引（GAoNanoFileList 的 des，页面用作剧情标题） ----------
if (fs.existsSync(FILELIST)) {
  const fl = JSON.parse(fs.readFileSync(FILELIST, 'utf-8'))
  const flFiles = Array.isArray(fl) ? fl : fl.files || []
  const dialogIndex = {}
  for (const f of flFiles) {
    if (f && f.type === 'script' && f.name) dialogIndex[f.name] = f.des || ''
  }
  writeJson(path.join(DATA, 'parsed', 'dialogIndex.json'), dialogIndex)
  console.log(`[dialog] 剧情名称索引${APPLY ? '已生成' : '预览'}（${Object.keys(dialogIndex).length} 条）-> public/data/parsed/dialogIndex.json`)
}

// ---------- 3.6 生成分段事件索引（基名 -> 段列表，用于分段剧情按段分开展示） ----------
const segmentIndex = {}
for (const id of dialogIds) {
  const m = /^(.*)_\d+$/.exec(id)
  if (!m) continue
  const baseId = m[1]
  if (segmentIndex[baseId]) continue
  const segs = []
  let idx = fs.existsSync(path.join(GAO, `${baseId}_0.json`)) ? 0 : 1
  while (fs.existsSync(path.join(GAO, `${baseId}_${idx}.json`))) {
    segs.push(`${baseId}_${idx}`)
    idx++
  }
  if (segs.length >= 2) segmentIndex[baseId] = segs
}
writeJson(path.join(DATA, 'parsed', 'dialogSegments.json'), segmentIndex)
console.log(`[dialog] 分段事件索引${APPLY ? '已生成' : '预览'}（${Object.keys(segmentIndex).length} 个事件）-> public/data/parsed/dialogSegments.json`)

// ---------- 4. 基础引用解析率校验 ----------
const levelStage = readJson(path.join(SRC, 'levelStage.json')).datas
const levelRoom = readJson(path.join(SRC, 'levelRoom.json')).datas
const area = readJson(path.join(SRC, 'area.json')).datas
const instance = readJson(path.join(SRC, 'instance.json')).datas

const instBattleIds = new Set()
for (const iv of Object.values(instance)) {
  for (const b of iv.battles || []) if (b.dungeonBattle) instBattleIds.add(b.dungeonBattle)
}

const unresolved = new Set()
const resolve = (id) => {
  if (levelStage[id] || levelRoom[id] || area[id] || instance[id] || battle[id] || instBattleIds.has(id)) return true
  if (id.includes('_')) {
    const prefix = id.split('_')[0]
    if (area[prefix]) return true
  }
  unresolved.add(id)
  return false
}

let refTotal = 0
let refMiss = 0
const stepTypes = new Map()
const demoCount = { demo: 0, pa: 0, close: 0 }
for (const t of Object.values(task)) {
  const cat = t.category || []
  const isDemo = cat.includes('demo') || cat.includes('demo支线') || String(t.typeId).startsWith('demo_')
  const isPa = JSON.stringify(cat) === JSON.stringify(['伙伴档案'])
  if (isDemo) { demoCount.demo++; continue }
  if (isPa) { demoCount.pa++; continue }
  if (t.close) demoCount.close++

  for (const u of t.unlockStage || []) { refTotal++; if (!resolve(u)) refMiss++ }
  for (const s of t.steps || []) {
    stepTypes.set(s.stepType, (stepTypes.get(s.stepType) || 0) + 1)
    for (const u of s.stepUnlockStage || []) { refTotal++; if (!resolve(u)) refMiss++ }
    const pos = s.stepPosition || []
    if (pos.length >= 2) { refTotal++; if (!resolve(pos[1])) refMiss++ }
  }
}

writeJson(path.join(DATA, 'parsed', 'task-unresolved.json'), {
  generatedAt: new Date().toISOString(),
  summary: {
    taskTotal: Object.keys(task).length,
    removedDemo: demoCount.demo,
    removedPartnerArchive: demoCount.pa,
    keptClosed: demoCount.close,
    refTotal,
    refMiss
  },
  stepTypes: Object.fromEntries([...stepTypes.entries()].sort()),
  unresolved: [...unresolved].sort()
})

console.log(`[check] 任务总数 ${Object.keys(task).length}，删除 demo ${demoCount.demo}，删除伙伴档案 ${demoCount.pa}，保留已下架 ${demoCount.close}`)
console.log(`[check] 引用总数 ${refTotal}，未命中 ${refMiss}`)
console.log(`[check] stepType 分布：`, Object.fromEntries([...stepTypes.entries()].sort()))
console.log(APPLY ? '[check] 报告已写入 public/data/parsed/task-unresolved.json' : '[check] 只读检查完成，未写入表、剧情或报告。')
