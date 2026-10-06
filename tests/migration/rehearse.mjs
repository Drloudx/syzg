/**
 * 迁移演练（正式测试，不是一次性脚本）：**在一个"旧生产库"的副本上真跑一遍三步迁移**。
 *
 * ## 为什么必须做这件事
 *
 * 生产库迁移是**不可逆的一次性动作**，而本地开发库早就迁完了 ——
 * 也就是说"迁移脚本还能不能跑"这件事，在开发环境里**永远测不到**。
 *
 * 🔴 第一次跑这个演练就抓出两个只会在生产上炸的问题：
 *
 *   1. **建表顺序写反**：`ALTER TABLE users` 排在 `CREATE TABLE users` 之前。
 *      生产库从来没有过 `users` → `no such table: users` → 而 D1 执行文件时
 *      **一条失败就中止后续** → 四张表一张都没建。本地一直没暴露，
 *      因为本地库早就建过 `users`。
 *   2. **索引建在加列之前**：`idx_comments_user` 引用 `comments.user_id`，
 *      而那列是后一步才加的 → `no such column: user_id` → 又带走后面三个索引。
 *
 * 修法是按**依赖链**拆成三步：建表 → 加列 → 建（依赖新列的）索引。
 *
 * 本脚本验证：
 *   · 旧库 → 三步依次跑：结构变成与全新 `schema.sql` 一致；
 *   · 第 1、3 步**重复跑必须成功**（它们声称幂等）；
 *   · 第 2 步**重复跑必须报 duplicate column** —— 断言这个报错，
 *     等于把"它非幂等"这一事实锁进测试；哪天有人改成幂等写法，这条会变红；
 *   · 全程数据一条不少、旧评论的 `user_id` 保持 NULL。
 *
 * 用法：node --no-warnings tests/migration/rehearse.mjs
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * 迁移前那一版 schema 的**冻结夹具**。
 *
 * 原先这里是 `git show 0c745272:schema.sql` —— 依赖一个具体的提交哈希。
 * 2026-10-07 整理历史（按天合并 221 → 24 条）后那个哈希在**新克隆里不存在**，
 * 演练会在任何干净检出上直接失败。夹具文件不依赖提交，历史怎么整理都不受影响。
 *
 * 夹具内容 = 加账号体系之前那一版 schema.sql（仅 comments / rate_limits 两表）。
 */
const BEFORE_ACCOUNT_SQL = path.join(import.meta.dirname, 'fixtures', 'schema-before-account.sql')

const tmp = mkdtempSync(path.join(tmpdir(), 'myrzg-migrate-'))
const dbFile = path.join(tmp, 'old.sqlite')

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) {
    pass++
    console.log('  ✅ ' + name)
  } else {
    fail++
    console.log('  ❌ ' + name + (detail ? '  [' + detail + ']' : ''))
  }
}

/** 跑一段 SQL；不抛，返回 `{ ok, error }` 让调用方断言 */
function exec(sql) {
  const d = new DatabaseSync(dbFile)
  try {
    d.exec(sql)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  } finally {
    d.close()
  }
}

/** 读一次库、跑个查询、立刻关掉（避免文件句柄残留导致清理失败） */
function query(fn) {
  const d = new DatabaseSync(dbFile)
  try {
    return fn(d)
  } finally {
    d.close()
  }
}

const STEPS = [
  ['第 1 步 schema', 'scripts/sql/2026-10-05-auth-schema.sql'],
  ['第 2 步 columns', 'scripts/sql/2026-10-05-auth-columns.sql'],
  ['第 3 步 indexes', 'scripts/sql/2026-10-05-auth-indexes.sql']
].map(([label, file]) => [label, readFileSync(file, 'utf8')])

const colsOf = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name).sort().join(',')

try {
  // ---- 1. 造一个"旧生产库" ----
  const seed = new DatabaseSync(dbFile)
  seed.exec(readFileSync(BEFORE_ACCOUNT_SQL, 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  const insert = seed.prepare(
    `INSERT INTO comments (id, page_key, parent_id, nick, avatar, body, status, created_at, ip_hash, ua_hash, token_hash, review_reason, page_label)
     VALUES (?, 'site:general', ?, '老用户', NULL, ?, 1, ?, 'iph', 'uah', 'tok', NULL, '站内讨论区')`
  )
  insert.run(1, null, '迁移前就存在的评论', now - 86400)
  insert.run(2, 1, '迁移前就存在的回复', now - 80000)
  seed.prepare(`INSERT INTO rate_limits (bucket, counter) VALUES ('h:abc:1', 7)`).run()

  const before = {
    comments: seed.prepare('SELECT COUNT(*) AS n FROM comments').get().n,
    rates: seed.prepare('SELECT COUNT(*) AS n FROM rate_limits').get().n
  }
  const tablesBefore = seed.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name)
  seed.close()

  console.log('  旧库（夹具 schema-before-account.sql）: ' + tablesBefore.join(', '))
  check('旧库里没有 users 表（确认取对了版本）', !tablesBefore.includes('users'))
  check('旧库有 2 条评论', before.comments === 2, String(before.comments))

  // ---- 2. 三步依次跑 ----
  /*
   * 🔴 三条都**必须干净成功** —— 这是刻意的要求，不是"乐观假设"。
   *
   * 早先第 2 步里还有一条 `ALTER TABLE users ADD COLUMN pw_salt`，而 `users`
   * 是第 1 步刚建的、自带该列 → 生产上会冒一条 `duplicate column name: pw_salt`。
   * 迁移脚本"报错但其实成功了"是最坏的形态：操作者分不清
   * "预期内的重复"和"真的炸了"。所以那条已经挪成注释，
   * 生产路径现在应当**零报错**。这条断言就是守着它。
   */
  for (const [label, sql] of STEPS) {
    const r = exec(sql)
    check('🔴 ' + label + ' 干净执行成功（生产路径不该出现任何报错）', r.ok, r.error)
  }

  // ---- 3. 结构核对 ----
  query((db) => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name)
    for (const t of ['users', 'auth_codes', 'captchas', 'sessions']) {
      check('表 ' + t + ' 已建', tables.includes(t))
    }
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r) => r.name)
    for (const i of ['idx_comments_user', 'idx_comments_parent', 'idx_sessions_user', 'idx_auth_codes_lookup']) {
      check('索引 ' + i + ' 已建', idx.includes(i))
    }
    check('🔴 comments 新增了 user_id 列', colsOf(db, 'comments').split(',').includes('user_id'))
    check('🔴 users 建出来就自带 pw_salt', colsOf(db, 'users').split(',').includes('pw_salt'))
  })

  // ---- 4. 数据不许丢 ----
  query((db) => {
    check('🔴 旧评论一条不少', db.prepare('SELECT COUNT(*) AS n FROM comments').get().n === before.comments)
    check('限流计数没被动过', db.prepare('SELECT COUNT(*) AS n FROM rate_limits').get().n === before.rates)
    check(
      '旧评论的 user_id 是 NULL（账号体系之前的数据，不该被硬塞归属）',
      db.prepare('SELECT user_id FROM comments WHERE id = 1').get().user_id === null
    )
    check('旧评论正文没被改写', db.prepare('SELECT body FROM comments WHERE id = 1').get().body === '迁移前就存在的评论')
  })

  // ---- 5. 幂等性：1、3 步能重跑；第 2 步不能 ----
  const rerun1 = exec(STEPS[0][1])
  check('🔴 第 1 步重复执行成功（声称幂等）', rerun1.ok, rerun1.error)

  const rerun2 = exec(STEPS[1][1])
  /*
   * ⚠️ 这里**断言它失败**，且原因必须是 duplicate column ——
   * 把"第 2 步不是幂等的"这个事实锁进测试。若哪天有人给它加上幂等写法，
   * 这条会变红，提醒回来同步注释与运维文档。
   */
  check(
    '🔴 第 2 步重复执行报 duplicate column（既定行为，不是意外）',
    !rerun2.ok && /duplicate column/i.test(rerun2.error || ''),
    rerun2.error
  )

  const rerun3 = exec(STEPS[2][1])
  check('🔴 第 3 步重复执行成功（声称幂等）', rerun3.ok, rerun3.error)

  query((db) => {
    check('重跑之后数据仍完整', db.prepare('SELECT COUNT(*) AS n FROM comments').get().n === before.comments)
  })

  // ---- 6. 与全新 schema.sql 的结构对齐 ----
  const freshFile = path.join(tmp, 'fresh.sqlite')
  const fresh = new DatabaseSync(freshFile)
  fresh.exec(readFileSync('schema.sql', 'utf8'))
  const freshCols = { users: colsOf(fresh, 'users'), comments: colsOf(fresh, 'comments') }
  fresh.close()

  query((db) => {
    for (const t of ['users', 'comments']) {
      check(`迁移后的 ${t} 列集合与全新 schema.sql 一致`, colsOf(db, t) === freshCols[t], `迁移后 ${colsOf(db, t)} / 全新 ${freshCols[t]}`)
    }
  })

  // ---- 7. 🔴 向后兼容：旧代码的 SQL 在**迁移后的库**上还能不能跑 ----
  /*
   * 这一节回答的是一个**运维顺序**问题，不是代码问题：
   *
   *   推送 = 上线（Cloudflare Pages 的 GitHub 集成，没有"再点一下发布"）。
   *   而新的读评论 SQL 里带着 `c.user_id` —— 迁移没跑就部署，
   *   **整个讨论区对所有人挂掉**。
   *
   * 所以手册要求"先迁移、再推送"。但那个建议要成立，必须先证明一件事：
   * **迁移对正在跑的旧代码没有副作用**；否则"先迁移"反而会提前把线上搞挂。
   *
   * 这里不靠推理，直接拿**旧库真实的 SQL 形状**（见 `fixtures/schema-before-account.sql`）在迁移后的库上跑。
   * 旧代码的写法是显式列出列名（不是 `SELECT *`），且不写 `user_id`：
   *
   *   读：SELECT c.id, c.nick, c.avatar, c.body, c.created_at, c.status, c.page_key, c.page_label …
   *   写：INSERT INTO comments (page_key, parent_id, nick, avatar, body, status, created_at,
   *                            ip_hash, ua_hash, token_hash, review_reason, page_label)
   */
  query((db) => {
    const now2 = Math.floor(Date.now() / 1000)

    let readOk = true
    try {
      db.prepare(
        `SELECT c.id, c.nick, c.avatar, c.body, c.created_at, c.status, c.page_key, c.page_label
           FROM comments c WHERE c.page_key = ?1 AND c.status = 1
          ORDER BY c.id DESC LIMIT 21`
      ).all('site:general')
    } catch (err) {
      readOk = false
      console.log('       读评论失败：' + err.message)
    }
    check('🔴 旧代码的读评论 SQL 在迁移后的库上仍可用', readOk)

    let writeOk = true
    try {
      db.prepare(
        `INSERT INTO comments (page_key, parent_id, nick, avatar, body, status, created_at,
                               ip_hash, ua_hash, token_hash, review_reason, page_label)
         VALUES (?1, NULL, ?2, NULL, ?3, 1, ?4, 'iph', 'uah', 'tok', NULL, '站内讨论区')`
      ).run('site:general', '旧代码写入', '迁移后旧代码仍能发评论', now2)
    } catch (err) {
      writeOk = false
      console.log('       写评论失败：' + err.message)
    }
    check('🔴 旧代码的写评论 SQL 仍可用（新列可空）', writeOk)

    // 旧代码写进去的那条，user_id 应为 NULL，且新代码能正常读出来
    const row = db.prepare('SELECT id, user_id FROM comments WHERE body = ?1').get('迁移后旧代码仍能发评论')
    check('旧代码写入的行 user_id 为 NULL（新代码读它不会炸）', Boolean(row) && row.user_id === null)

    if (row) {
      const upd = db.prepare('UPDATE comments SET status = ?1 WHERE id = ?2').run(2, row.id)
      check('🔴 旧代码的改状态 / 删评论 SQL 仍可用', upd.changes === 1)
      db.prepare('DELETE FROM comments WHERE id = ?1').run(row.id)
    }
  })

  console.log(`\n  演练结果：通过 ${pass} / 失败 ${fail}`)
} finally {
  // Windows 上文件句柄可能还没释放，重试几次
  try {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 })
  } catch {
    console.log('  （临时目录清理失败，不影响结论：' + tmp + '）')
  }
}

process.exit(fail ? 1 : 0)
