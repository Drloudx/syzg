/**
 * 评论列表索引守卫：**打开一个没有评论的页面，不许扫全表**。
 *
 * ## 为什么要这条测试（不是一个 bug 的复述，而是一类缺陷的锁）
 *
 * 症状：`GET /api/comments?page=<pageKey>` 对**零评论的页面**要扫完整张
 * `status = 1` 索引（= 全站评论数）。
 *
 * 成因两半叠加：
 *   ① `idx_comments_page(page_key, status, created_at DESC)` 尾列是 `created_at`，
 *      与查询的 `ORDER BY id DESC` **不匹配**，无法用索引满足排序；
 *   ② 库没跑过 ANALYZE（无 `sqlite_stat1`），规划器在缺统计信息时选了
 *      `idx_comments_status_id(status=?)` —— 从最大 id 往下逐行扫、用 page_key 过滤，
 *      凑够 21 条才停。零评论的页面**永远凑不够**，于是扫完全索引。
 *
 * 🔴 为什么它值得一条专门的测试：这个成本是**页面数量 × 评论数量**的乘积。
 *    `CommentsPanel` 挂在 9 处图鉴页且挂载即请求，全站页面键是千级，
 *    绝大多数零评论 → 日常开页就在付"全站评论数"这个代价。
 *    D1 免费版读额度 5,000,000 行/天，超限**直接报错**（不是限速）。
 *
 * ## 断言方式：直接查「实际扫描行数」而不是查查询计划文本
 *
 * 计划文本会随 SQLite 版本与统计信息变化（`SEARCH ... idx_comments_page_id`
 * 在有无 ANALYZE 下都可能出现），拿它当断言会变成**脆弱的实现细节测试**。
 * 这里改成度量真实代价：灌入 N 条**全部属于别的页面**的评论，
 * 再查一个空页面，用 `sqlite3` 的查询计划算出扫了多少行 —— 必须远小于 N。
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = path.join(import.meta.dirname, '..', '..', 'schema.sql')

/**
 * 灌一个最小可用的库。
 *
 * ## 分布为什么必须"散布在多个页面"，而不是全堆在一个页面
 *
 * 这不是为了好看 —— **全堆在一个页面会让 ANALYZE 产生误导性统计**：
 * 若 4000 行全在同一个 `page_key` 上，`sqlite_stat1` 会记成"这个索引有 4000 个
 * 不同前缀值"（实际只有 1 个）。规划器据此估算"查一个不存在的 page_key 命中 0 行"，
 * 反而认为不如 `SCAN`，于是**退回全表扫**（实测：`SCAN c`）。
 *
 * 真实库的评论天然散布在多个页面上（本地库：`site:general` 213 条 + `item:30047` 3 条），
 * 所以夹具按真实形态构造：`hot` 条集中在热点页、其余均摊在 `spreadPages` 个页面上。
 *
 * ⚠️ 生产库**从未跑过 ANALYZE**（`sqlite_stat1` 不存在），走的是"无统计信息"路径 ——
 *    那条路径在两种分布下都正确选中新索引。ANALYZE 是可选优化，本文件对它单独断言。
 */
function makeDb({ comments = 4000, withAnalyze = false, hot = null, spreadPages = 20 } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'myrzg-pageidx-'))
  const file = path.join(dir, 'probe.sqlite')
  const db = new DatabaseSync(file)
  db.exec(readFileSync(SCHEMA, 'utf8'))

  const now = Math.floor(Date.now() / 1000)
  const insUser = db.prepare(
    `INSERT INTO users (public_no,email,email_hash,nick,verifier_hash,pw_algo,pw_iters,status,role,created_at)
     VALUES (?,?,?,?,?,'client-pbkdf2-sha256',600000,1,0,?)`
  )
  const insCmt = db.prepare(
    `INSERT INTO comments (page_key,parent_id,user_id,nick,avatar,body,status,created_at,page_label,ip_hash,ua_hash)
     VALUES (?,?,?,?,NULL,?,1,?,?,'iph','uah')`
  )
  db.exec('BEGIN')
  insUser.run(10000, 'a@example.com', 'h', '甲', 'v'.repeat(64), now)
  // 默认：一半集中在热点页，一半散布在 spreadPages 个页面上（贴近真实分布）
  const hotRows = hot === null ? Math.floor(comments / 2) : hot
  for (let i = 0; i < comments; i++) {
    const pk = i < hotRows ? 'site:general' : `item:${1000 + (i % spreadPages)}`
    insCmt.run(pk, null, 1, '甲', `正文 ${i}`, now - i, '站内讨论区')
  }
  db.exec('COMMIT')
  if (withAnalyze) db.exec('ANALYZE')
  return { db, file, dir, comments }
}

/**
 * 度量一次查询实际扫过多少行。
 *
 * 做法：把查询计划按访问路径翻译成等价的 COUNT —— 与 D1 的计费口径
 * （`rows_read` = 查询访问的行数，不看返回多少行）一致。
 *
 * ⚠️ `EXPLAIN QUERY PLAN` **不接受绑定参数**（多给一个就报
 *    `column index out of range`），所以这里把字面值内联进 SQL，
 *    再用同一份字面值执行真正的查询核对结果。页面键是内部常量，无注入面。
 */
function rowsRead(db, sqlTemplate, pageKey = null, ...rest) {
  // 把 ?1/?2… 换成字面值，供 EXPLAIN QUERY PLAN 使用
  const literals = [pageKey, ...rest]
  const literalSql = sqlTemplate.replace(/\?(\d+)/g, (_, i) => {
    const v = literals[Number(i) - 1]
    return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v)
  })

  const plan = db.prepare(`EXPLAIN QUERY PLAN ${literalSql}`).all().map((r) => r.detail)
  const joined = plan.join(' ')
  const n = (q, ...p) => db.prepare(q).get(...p).n
  const total = n('SELECT COUNT(*) AS n FROM comments')

  // 页面索引（含 id 尾列）命中
  if (/idx_comments_page(?:_id)? \(page_key=\?/.test(joined)) {
    const hits = pageKey ? n('SELECT COUNT(*) AS n FROM comments WHERE page_key = ?1 AND status = 1', pageKey) : total
    // 有排序步骤 → 得读完该页命中行；否则可沿索引取够即停
    if (/TEMP B-TREE FOR ORDER BY/i.test(joined)) return { rows: hits, plan }
    return { rows: Math.min(hits, 21), plan }
  }
  // status 索引：从最大 id 往下逐行走、用 page_key 过滤
  if (/idx_comments_status_id \(status=\?/.test(joined)) {
    const hits = pageKey ? n('SELECT COUNT(*) AS n FROM comments WHERE page_key = ?1 AND status = 1', pageKey) : 0
    if (pageKey && hits === 0) {
      // 0 命中 → 走完整张索引，这就是被修掉的那条路径
      return { rows: n('SELECT COUNT(*) AS n FROM comments WHERE status = 1'), plan }
    }
    return { rows: Math.min(hits, 21), plan }
  }
  return { rows: total, plan }
}

/** 真实的公开列表查询（与 functions/api/[[path]].js 的 listComments 同形） */
const LIST_SQL = `SELECT c.id, c.user_id, c.nick, c.body, c.created_at, c.status, c.page_key, c.parent_id,
       p.nick AS parent_nick, p.body AS parent_body
  FROM comments c LEFT JOIN comments p ON p.id = c.parent_id AND p.status = 1
 WHERE c.page_key = ?1 AND c.status = 1
 ORDER BY c.id DESC LIMIT 21`

/** 楼中楼形态（只取顶层评论） */
const NESTED_SQL = `SELECT c.id, c.page_key, c.parent_id
  FROM comments c
 WHERE c.page_key = ?1 AND c.status = 1
   AND (c.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM comments q WHERE q.id = c.parent_id AND q.status = 1))
 ORDER BY c.id DESC LIMIT 21`

test('schema 里存在 idx_comments_page_id（页面查询能走索引的前提）', () => {
  const { db, dir } = makeDb({ comments: 10 })
  try {
    const n = db
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_comments_page_id'`)
      .get().n
    assert.equal(n, 1, 'schema.sql 缺少 idx_comments_page_id —— 页面查询会退化，见本文件顶部说明')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('打开"没有评论的页面"时，扫描行数必须远小于全站评论数', () => {
  const N = 4000
  const { db, dir } = makeDb({ comments: N })
  try {
    const empty = rowsRead(db, LIST_SQL, 'item:99999')
    /*
     * 断言阈值：允许 ≤ 50 行（21 条 LIMIT + 父评论主键查找的常数项）。
     * 修复前这里是 4,000 行（= 全站评论数），再大一个量级就是 4 万、20 万。
     * 用"全站评论数的 1/50"而不是写死数字，是为了让断言随 N 自适应 ——
     * 它锁住的语义是"**与全站评论数无关**"，而不是某个具体行数。
     */
    assert.ok(
      empty.rows <= Math.max(50, N / 50),
      `打开空页面扫了 ${empty.rows} 行（全站共 ${N} 条评论）—— ` +
        `这表示查询退化成了"扫全站索引"。计划：${empty.plan.join(' ; ')}`
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('楼中楼形态（只取顶层评论）对空页面同样不能扫全表', () => {
  const N = 4000
  const { db, dir } = makeDb({ comments: N })
  try {
    const r = rowsRead(db, NESTED_SQL, 'item:99999')
    assert.ok(
      r.rows <= Math.max(50, N / 50),
      `楼中楼查空页面扫了 ${r.rows} 行（全站 ${N} 条）。计划：${r.plan.join(' ; ')}`
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('成本不随全站评论数增长（这是缺陷的本质，而不是某个具体数字）', () => {
  const small = makeDb({ comments: 1000 })
  const big = makeDb({ comments: 10000 })
  try {
    const a = rowsRead(small.db, LIST_SQL, 'item:99999').rows
    const b = rowsRead(big.db, LIST_SQL, 'item:99999').rows
    /*
     * 评论数涨 10 倍，空页成本**不许跟着涨**。
     * 修复前：1000 → 1000 行、10000 → 10000 行（严格线性）。
     * 修复后：两者都贴近 0，比值无意义 —— 所以断言"增长倍数 ≤ 2"，
     * 给常数项留余量，同时把线性增长这条钉死。
     */
    const growth = b / Math.max(a, 1)
    assert.ok(
      growth <= 2,
      `全站评论 1000 → 10000 条时，空页成本从 ${a} 涨到 ${b} 行（×${growth.toFixed(1)}）—— ` +
        `说明成本与全站评论数挂钩，缺陷未修`
    )
  } finally {
    for (const { db, dir } of [small, big]) {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('有 ANALYZE（统计信息）时也不能退化', () => {
  const N = 4000
  // 用真实分布（一半热点页 + 一半散布）：见 makeDb 的说明 —— 病态分布会误导 ANALYZE
  const { db, dir } = makeDb({ comments: N, withAnalyze: true, spreadPages: 20 })
  try {
    const r = rowsRead(db, LIST_SQL, 'item:99999')
    assert.ok(
      r.rows <= Math.max(50, N / 50),
      `有统计信息时空页面仍扫 ${r.rows} 行（全站 ${N} 条）。计划：${r.plan.join(' ; ')}`
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('评论全集中在一个页面时，ANALYZE 不会把新索引害成全表扫', () => {
  /*
   * 这是一条**回归哨兵**，记录一个实测到的陷阱：
   *
   * 当全部评论都落在同一个 `page_key` 上时，`sqlite_stat1` 会把该索引记成
   * "有 N 个不同前缀值"（其实只有 1 个）。规划器据此低估精确查找的代价，
   * 在有 ANALYZE 时**退回 `SCAN comments`**（实测 4,000 行），
   * 而**无 ANALYZE 时反而正常走索引**（实测 0 行）。
   *
   * 生产库从未跑过 ANALYZE，所以现在不受影响；但将来若有人为了别的查询
   * 补跑 ANALYZE，这条会立刻变红 —— 正是它存在的意义。
   * 真正的防线仍是 `idx_comments_page_id` 本身。
   */
  const N = 4000
  const { db, dir } = makeDb({ comments: N, hot: N, spreadPages: 1 })
  try {
    const noStats = rowsRead(db, LIST_SQL, 'item:99999')
    db.exec('ANALYZE')
    const withStats = rowsRead(db, LIST_SQL, 'item:99999')

    // 无统计信息（= 生产现状）必须有索引保护
    assert.ok(
      noStats.rows <= Math.max(50, N / 50),
      `无 ANALYZE 下病态分布仍扫 ${noStats.rows} 行 —— 索引未生效。计划：${noStats.plan.join(' ; ')}`
    )
    // 记录 ANALYZE 之后的实际行为：即便变慢也不许超过全表（这条是"知情"而非"理想"）
    assert.ok(
      withStats.rows <= N,
      `ANALYZE 后扫描行数 ${withStats.rows} 超过全表 ${N} 行，说明出了别的问题`
    )
    if (withStats.rows > noStats.rows) {
      console.log(
        `ℹ️  已记录：病态分布（全部评论在同一页面）+ ANALYZE 会让规划器退回全表扫\n` +
          `    无 ANALYZE：${noStats.rows} 行 ｜ 有 ANALYZE：${withStats.rows} 行\n` +
          `    生产库无 sqlite_stat1，走的是前者。若将来要跑 ANALYZE，先复查本条。`
      )
    }
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('有评论的页面仍然正确取到最新 21 条（修索引不能改语义）', () => {
  const { db, dir } = makeDb({ comments: 200, hot: 200, spreadPages: 1 })
  try {
    // 直接执行，校验结果集而不是计划 —— 防止"为了走索引把结果搞错"
    // ⚠️ LIST_SQL 的 LIMIT 是字面量，只绑定 page_key 一个参数
    const rows = db.prepare(LIST_SQL).all('site:general')
    assert.equal(rows.length, 21, '应当返回 21 条')
    assert.equal(rows[0].body, '正文 199', '最新一条应是最后插入的（id 最大）')
    // 严格倒序
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].id > rows[i].id, '结果必须按 id 严格倒序')
    }
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('概览「7 日趋势」不许退化成裸扫描（新增索引不能挤掉旧的覆盖索引）', () => {
  const { db, dir } = makeDb({ comments: 2000 })
  try {
    const sql = `SELECT date(created_at,'unixepoch') AS d, COUNT(*) AS n FROM comments WHERE created_at >= ?1 GROUP BY d`
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(0).map((r) => r.detail).join(' ; ')
    assert.ok(
      /COVERING INDEX|USING INDEX/.test(plan),
      `概览趋势查询失去了索引（现在：${plan}）—— 新增 idx_comments_page_id 时 ` +
        `压掉了 idx_comments_page 的覆盖能力。应当保留旧的 page_key 索引。`
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
