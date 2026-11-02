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
 * 🔴 不要改回 `git show <哈希>:schema.sql` —— 那依赖一个具体提交，而历史按天合并后
 * 旧哈希在**新克隆里不存在**，演练会在任何干净检出上直接失败。
 * 夹具文件不依赖提交，历史怎么整理都不受影响。
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
  ['第 3 步 indexes', 'scripts/sql/2026-10-05-auth-indexes.sql'],
  ['第 4 步 后台角色', 'scripts/sql/2026-10-07-admin-role.sql'],
  ['第 5 步 待审原因', 'scripts/sql/2026-10-09-comment-review-note.sql'],
  ['第 6 步 常用选项', 'scripts/sql/2026-10-09-review-presets.sql'],
  ['第 7 步 审核词表', 'scripts/sql/2026-10-09-review-keywords.sql'],
  ['第 8 步 封禁理由', 'scripts/sql/2026-10-09-user-ban-note.sql'],
  ['第 9 步 处理通知', 'scripts/sql/2026-10-09-comment-moderation-notice.sql'],
  ['第 10 步 回复未读改 id 基准', 'scripts/sql/2026-10-09-replies-read-id.sql'],
  ['第 11 步 后台分页索引', 'scripts/sql/2026-10-13-admin-paging-indexes.sql'],
  ['第 12 步 首页内容表', 'scripts/sql/2026-11-01-home-content.sql'],
  ['第 13 步 公告管理', 'scripts/sql/2026-11-01-notice-admin.sql']
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
   * 第 2 步里不能再出现 `ALTER TABLE users ADD COLUMN pw_salt`：`users` 是第 1 步刚建的、
   * 自带该列 → 生产上会冒一条 `duplicate column name: pw_salt`。
   * 迁移脚本"报错但其实成功了"是最坏的形态：操作者分不清
   * "预期内的重复"和"真的炸了"。生产路径应当**零报错**，这条断言就是守着它。
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
    check('🔴 users 新增了 role 列（第 4 步）', colsOf(db, 'users').split(',').includes('role'))
    check('🔴 admin_audit 表已建（第 4 步）', tables.includes('admin_audit'))
    check('🔴 comments 新增了 review_note 列（第 5 步）', colsOf(db, 'comments').split(',').includes('review_note'))
    check('🔴 review_note_presets 表已建（第 6 步）', tables.includes('review_note_presets'))
    /*
     * 🔴 第 6 步要**播种默认项**：超管没配之前，界面上就该有几个能用的常用原因。
     *    播种语句带 `NOT EXISTS` 守卫，所以"跑完有 4 条"同时证明了它没重复插入。
     */
    check(
      '🔴 常用选项播种了 4 条默认项（第 6 步）',
      db.prepare('SELECT COUNT(*) AS n FROM review_note_presets').get().n === 4,
      String(db.prepare('SELECT COUNT(*) AS n FROM review_note_presets').get().n)
    )
    check('🔴 review_keywords 表已建（第 7 步）', tables.includes('review_keywords'))
    check('🔴 review_category_flags 表已建（第 7 步）', tables.includes('review_category_flags'))
    /*
     * 🔴 第 7 步**不播种任何词**：基线词表在代码里（`commentBlocklist.js`），
     *    库里只放超管额外加的。若这里播了词，就等于把基线复制了一份 ——
     *    以后改代码基线会被库里的旧副本盖住，是"两份真相"的经典坑。
     */
    check(
      '🔴 词表不播种（基线在代码里）',
      db.prepare('SELECT COUNT(*) AS n FROM review_keywords').get().n === 0,
      String(db.prepare('SELECT COUNT(*) AS n FROM review_keywords').get().n)
    )
    check('🔴 users 新增了 ban_note 列（第 8 步）', colsOf(db, 'users').split(',').includes('ban_note'))
    check(
      '🔴 迁移不回填封禁理由（旧停用账号的 ban_note 应为 NULL）',
      db.prepare('SELECT COUNT(*) AS n FROM users WHERE ban_note IS NOT NULL').get().n === 0,
      String(db.prepare('SELECT COUNT(*) AS n FROM users WHERE ban_note IS NOT NULL').get().n)
    )
    check('🔴 comments 新增了 moderated_at 列（第 9 步）', colsOf(db, 'comments').split(',').includes('moderated_at'))
    check('🔴 users 新增了 moderation_read_at 列（第 9 步）', colsOf(db, 'users').split(',').includes('moderation_read_at'))
    check(
      '🔴 迁移不回填处理时间（旧评论 moderated_at 应为 NULL）',
      db.prepare('SELECT COUNT(*) AS n FROM comments WHERE moderated_at IS NOT NULL').get().n === 0,
      String(db.prepare('SELECT COUNT(*) AS n FROM comments WHERE moderated_at IS NOT NULL').get().n)
    )
    check(
      '🔴 未读基准索引已建（第 9 步）',
      db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_comments_user_moderated'").get().n === 1
    )
    /*
     * 🔴 第 10 步：把「谁回复了我」的未读基准从**时间**换成**评论 id**。
     *
     * 为什么不改 `comments.created_at` 成毫秒：那是既有的**秒**列，全站都在用；
     * 而只把基准换成毫秒会让 `S > S_000` 恒真 → 红点永远清不掉。
     * `comments.id` 是 AUTOINCREMENT、严格单调，换过去两个方向的错同时消失。
     */
    check('🔴 users 新增了 replies_read_id 列（第 10 步）', colsOf(db, 'users').split(',').includes('replies_read_id'))
    check(
      '🔴 旧列 replies_read_at 保留不删（第 10 步的回填来源，删了就无法换算）',
      colsOf(db, 'users').split(',').includes('replies_read_at')
    )
    check(
      '🔴 迁移不改写 replies_read_at（第 10 步只读它做换算）',
      db.prepare('SELECT COUNT(*) AS n FROM users WHERE replies_read_at IS NOT NULL').get().n === 0,
      String(db.prepare('SELECT COUNT(*) AS n FROM users WHERE replies_read_at IS NOT NULL').get().n)
    )
  })

  // ---- 3c. 第 10 步的回填语义：时间基准 → id 基准，且不该凭空造出未读 ----
  query((db) => {
    /*
     * 造一个"迁移前就有未读历史"的用户，核对换算是否等价。
     *
     * 夹具里评论 2 是评论 1 的回复（`parent_id = 1`），而评论 1 的 `user_id` 是 NULL
     * （账号体系之前的数据）。所以这里另造一条**归属于新用户**的评论当父评论，
     * 再挂一条回复上去，才能测到"别人回复了我"这条路径。
     *
     * 🔴 本段自带清理：它插的行会污染后面"数据一条不少"的断言，
     *    所以结尾必须删干净（含 id 80001/80002 与两个测试用户）。
     */
    const uid = 99002
    const untouchedUid = 99003
    const now = Math.floor(Date.now() / 1000)
    db.prepare(
      `INSERT INTO users (id, public_no, email, email_hash, nick, verifier_hash, pw_salt, pw_algo, pw_iters, created_at, replies_read_at)
       VALUES (?, 99002, 'replies@example.com', 'rh', '有回复的老用户', 'vh', 'sh', 'client-pbkdf2-sha256', 600000, ?, ?)`
    ).run(uid, now - 90000, now - 1000)
    // 对照组：从未标过已读（`replies_read_at` 为 NULL）→ 回填语句的 WHERE 应把他跳过
    db.prepare(
      `INSERT INTO users (id, public_no, email, email_hash, nick, verifier_hash, pw_salt, pw_algo, pw_iters, created_at, replies_read_at)
       VALUES (?, 99003, 'neverread@example.com', 'nh', '从没标过已读的用户', 'vh', 'sh', 'client-pbkdf2-sha256', 600000, ?, NULL)`
    ).run(untouchedUid, now - 90000)
    db.prepare(
      `INSERT INTO comments (id, page_key, parent_id, user_id, nick, avatar, body, status, created_at, ip_hash, ua_hash, review_reason, page_label)
       VALUES (80001, 'site:general', NULL, ?, '有回复的老用户', NULL, '我的评论', 1, ?, 'iph', 'uah', NULL, '站内讨论区')`
    ).run(uid, now - 90000)
    // 一条**在基准之前**的回复（旧语义：已读过）
    db.prepare(
      `INSERT INTO comments (id, page_key, parent_id, user_id, nick, avatar, body, status, created_at, ip_hash, ua_hash, review_reason, page_label)
       VALUES (80002, 'site:general', 80001, NULL, '老访客', NULL, '早先的回复', 1, ?, 'iph', 'uah', NULL, '站内讨论区')`
    ).run(now - 5000)

    // 重跑一次第 10 步的**回填语句**（迁移时这一步是在列刚加、还没有数据时跑的，
    // 所以这里要手工再触发一次，才能验证换算规则本身对不对）
    db.exec(`
      UPDATE users
      SET replies_read_id = COALESCE((
        SELECT MAX(c.id) FROM comments c
        JOIN comments p ON p.id = c.parent_id
        WHERE p.user_id = users.id
          AND (c.user_id IS NULL OR c.user_id <> users.id)
          AND c.status = 1
          AND c.created_at <= users.replies_read_at
      ), 0)
      WHERE replies_read_at IS NOT NULL;
    `)

    const row = db.prepare('SELECT replies_read_id FROM users WHERE id = ?').get(uid)
    check('🔴 时间基准换算成了 id 基准（读过 80002）', row?.replies_read_id === 80002, String(row?.replies_read_id))

    /*
     * 🔴 换算必须**等价于旧语义** —— 回填完不该有人"凭空多出未读"。
     *    这是这条迁移最容易出的错：换算偏小 → 所有人红点从 0 跳到几十，是明显故障。
     */
    const unreadNow = db
      .prepare(
        `SELECT COUNT(*) AS n FROM comments c JOIN comments p ON p.id = c.parent_id
         WHERE p.user_id = ? AND (c.user_id IS NULL OR c.user_id <> ?) AND c.status = 1 AND c.id > ?`
      )
      .get(uid, uid, row?.replies_read_id).n
    check('🔴 回填后没有凭空多出的未读（旧语义下应为 0）', unreadNow === 0, String(unreadNow))

    // 回填**不**覆盖未标过已读的用户：他们该保持"全未读"（与旧代码把 NULL 当 0 一致）
    const untouched = db.prepare('SELECT replies_read_id FROM users WHERE id = ?').get(untouchedUid)
    check('🔴 未标过已读的用户不被回填（保持 NULL = 全未读）', untouched?.replies_read_id === null, String(untouched?.replies_read_id))

    // 清理：本段的夹具行不能留给后面的"数据一条不少"断言
    db.prepare('DELETE FROM comments WHERE id IN (80001, 80002)').run()
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(uid, untouchedUid)
    check(
      '🔴 第 10 步夹具已自清理（评论数与用户数复原）',
      db.prepare('SELECT COUNT(*) AS n FROM comments').get().n === 2 &&
        db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0,
      `comments=${db.prepare('SELECT COUNT(*) AS n FROM comments').get().n} users=${db.prepare('SELECT COUNT(*) AS n FROM users').get().n}`
    )
  })

  // ---- 3b. 角色列必须有默认值 0，且老用户不会被误升为管理员 ----
  query((db) => {
    /*
     * 🔴 这条守的是"迁移把所有人变成管理员"这种灾难。
     * `ADD COLUMN ... DEFAULT 0` 对**已存在的行**也要生效（SQLite 会回填默认值），
     * 所以迁移完不该有任何 role > 0 的行。
     */
    db.prepare(
      `INSERT INTO users (public_no, email, email_hash, nick, verifier_hash, pw_salt, pw_algo, pw_iters, created_at)
       VALUES (99001, 'migrated@example.com', 'mh', '迁移前的老用户', 'vh', 'sh', 'client-pbkdf2-sha256', 600000, 1)`
    ).run()
    const row = db.prepare(`SELECT role FROM users WHERE public_no = 99001`).get()
    check('🔴 迁移后新插入的用户 role 默认是 0（普通）', row?.role === 0, String(row?.role))
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
    /*
     * 🔴 第 5 步只加列，**不该回填任何历史数据**：
     *    `review_note` 的语义是"当前为什么在待审队列里"，给老评论补一个空备注
     *    毫无意义，还会让人以为"这条被人工打回过"。
     */
    check(
      '🔴 旧评论的 review_note 是 NULL（迁移不回填历史）',
      db.prepare('SELECT review_note FROM comments WHERE id = 1').get().review_note === null
    )
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

  const rerun4 = exec(STEPS[3][1])
  /*
   * ⚠️ 与第 2 步同理：`ALTER TABLE ... ADD COLUMN` 不幂等，重跑必然报
   * `duplicate column name: role`。这是**既定行为**，锁进测试以免有人误以为"迁移炸了"。
   * （文件里的 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` 是幂等的，
   *   但整份文件因为那条 ALTER 而整体不幂等。）
   */
  check(
    '🔴 第 4 步重复执行报 duplicate column（既定行为，不是意外）',
    !rerun4.ok && /duplicate column/i.test(rerun4.error || ''),
    rerun4.error
  )

  const rerun5 = exec(STEPS[4][1])
  // 与第 2/4 步同理：那条 `ALTER TABLE ... ADD COLUMN` 不幂等
  check(
    '🔴 第 5 步重复执行报 duplicate column（既定行为，不是意外）',
    !rerun5.ok && /duplicate column/i.test(rerun5.error || ''),
    rerun5.error
  )

  /*
   * 🔴 第 6 步与第 2/4/5 步**不同：它是幂等的**（`CREATE TABLE IF NOT EXISTS`
   *    + 播种带 `NOT EXISTS` 守卫）。这条锁住"重复执行既不报错、也不重复播种"。
   */
  const rerun6 = exec(STEPS[5][1])
  check('🔴 第 6 步重复执行成功（幂等，与第 2/4/5 步不同）', rerun6.ok, rerun6.error)
  query((db) => {
    const n = db.prepare('SELECT COUNT(*) AS n FROM review_note_presets').get().n
    check('🔴 第 6 步重跑后仍是 4 条（没有重复播种）', n === 4, String(n))
  })

  // 第 7 步同样是幂等的（只建表建索引）
  const rerun7 = exec(STEPS[6][1])
  check('🔴 第 7 步重复执行成功（幂等）', rerun7.ok, rerun7.error)

  const rerun8 = exec(STEPS[7][1])
  // 与第 2/4/5 步同理：`ALTER TABLE ... ADD COLUMN` 不幂等
  check(
    '🔴 第 8 步重复执行报 duplicate column（既定行为，不是意外）',
    !rerun8.ok && /duplicate column/i.test(rerun8.error || ''),
    rerun8.error
  )

  const rerun9 = exec(STEPS[8][1])
  // 第 9 步含两条 ALTER：重复执行会报第一条 duplicate column
  check(
    '🔴 第 9 步重复执行报 duplicate column（既定行为，不是意外）',
    !rerun9.ok && /duplicate column/i.test(rerun9.error || ''),
    rerun9.error
  )

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

    // ---- 第 12 步：首页内容表 ----
    /*
     * 守三件事：
     *   ① 5 张表建出来了，且列集合与 schema.sql 一致
     *   ② 初始数据条数对得上（公告 7 / 海报 3 / 链接 8 / 角色 4 / 底栏 2）
     *   ③ 重复执行不重复播种（ON CONFLICT DO NOTHING 生效）
     */
    const homeTables = ['notices', 'home_banners', 'home_links', 'home_heroes', 'home_blocks']
    const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
    for (const t of homeTables) {
      check(`🔴 第 12 步建出了 ${t} 表`, allTables.includes(t))
    }

    // 列集合与全新 schema.sql 一致（防止迁移与 schema 漂移）
    const schemaSql = readFileSync(path.join(import.meta.dirname, '..', '..', 'schema.sql'), 'utf8')
    const schemaDb = new DatabaseSync(':memory:')
    try {
      schemaDb.exec(schemaSql)
      for (const t of homeTables) {
        const fromMig = colsOf(db, t)
        const fromSchema = colsOf(schemaDb, t)
        check(
          `🔴 ${t} 的列集合与 schema.sql 一致`,
          fromMig === fromSchema,
          fromMig === fromSchema ? '' : `迁移=${fromMig} / schema=${fromSchema}`
        )
      }
    } finally {
      schemaDb.close()
    }

    // 初始数据条数
    const seedCounts = {
      notices: 7,
      home_banners: 3,
      home_links: 8,
      home_heroes: 4,
      home_blocks: 2
    }
    for (const [t, want] of Object.entries(seedCounts)) {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n
      check(`第 12 步 ${t} 初始数据 ${want} 条`, n === want, `实际 ${n}`)
    }

    // 站点/官方公告数量与固定项
    const sitePins = db.prepare("SELECT COUNT(*) AS n FROM notices WHERE channel='site' AND tier='pin'").get().n
    check('站点公告有 2 条固定项（免责 + 社区规则）', sitePins === 2, `实际 ${sitePins}`)
    const officialVersioned = db.prepare("SELECT COUNT(*) AS n FROM notices WHERE channel='official' AND version IS NOT NULL").get().n
    check('官方公告里 1 条带版本号', officialVersioned === 1, `实际 ${officialVersioned}`)

    // 海报的行动类型覆盖
    const actions = db.prepare('SELECT DISTINCT action_type FROM home_banners ORDER BY action_type').all().map((r) => r.action_type)
    check('海报包含 route 与 notice 两种行动', actions.includes('route') && actions.includes('notice'), actions.join(','))

    // 海报的 notice 行动必须指向真实存在的公告 id（防悬空引用）
    const dangling = db.prepare(
      `SELECT b.id FROM home_banners b
       WHERE b.action_type = 'notice'
         AND NOT EXISTS (SELECT 1 FROM notices n WHERE n.id = b.action_value)`
    ).all()
    check('海报的 notice 行动所指向的公告都存在', dangling.length === 0, dangling.map((r) => r.id).join(','))

    // 角色 hero_id 格式 sanity（真实存在性由前端 join heroes.json 保证）
    const badHeroIds = db.prepare("SELECT slot FROM home_heroes WHERE hero_id NOT LIKE 'hero\\_%' ESCAPE '\\'").all()
    check('核心角色的 hero_id 都形如 hero_xxx', badHeroIds.length === 0, badHeroIds.map((r) => r.slot).join(','))

    // 幂等：重跑第 12 步不重复播种
    // 🔴 用固定下标 11（第 12 步），不能用 STEPS.length - 1 ——
    //    加了第 13 步之后，那个表达式指向的是另一个脚本。
    db.exec(STEPS[11][1])
    const noticesAfter = db.prepare('SELECT COUNT(*) AS n FROM notices').get().n
    check('🔴 第 12 步重复执行成功（幂等，ON CONFLICT DO NOTHING）', noticesAfter === 7, `重跑后 ${noticesAfter}`)
    const linksAfter = db.prepare('SELECT COUNT(*) AS n FROM home_links').get().n
    check('第 12 步重跑后 home_links 仍是 8 条', linksAfter === 8, `重跑后 ${linksAfter}`)

    // ---- 第 13 步：公告管理（插槽表 + show_in_modal + ID 改序号）----
    /*
     * 守四件事：
     *   ① home_notice_slots 建出来了，8 个插槽齐全
     *   ② notices 多了 show_in_modal 列，站点置 1、官方置 0
     *   ③ 老语义 ID 已全部改成序号形式，且不残留旧 id
     *   ④ 站点位置 1、4 有固定值；位置 2、3 与官方四个位置为 NULL（走动态默认）
     */
    check('🔴 第 13 步建出了 home_notice_slots 表', allTables.includes('home_notice_slots'))

    const slotCount = db.prepare('SELECT COUNT(*) AS n FROM home_notice_slots').get().n
    check('第 13 步插槽共 8 个（本站 4 + 官方 4）', slotCount === 8, `实际 ${slotCount}`)

    const siteSlotCount = db.prepare("SELECT COUNT(*) AS n FROM home_notice_slots WHERE channel='site'").get().n
    const officialSlotCount = db.prepare("SELECT COUNT(*) AS n FROM home_notice_slots WHERE channel='official'").get().n
    check('站点 4 个插槽', siteSlotCount === 4, `实际 ${siteSlotCount}`)
    check('官方 4 个插槽', officialSlotCount === 4, `实际 ${officialSlotCount}`)

    // show_in_modal 列存在
    const noticeCols = colsOf(db, 'notices')
    check('🔴 notices 已加 show_in_modal 列', noticeCols.includes('show_in_modal'))

    const siteModal = db.prepare("SELECT COUNT(*) AS n FROM notices WHERE channel='site' AND show_in_modal=1").get().n
    const siteTotal = db.prepare("SELECT COUNT(*) AS n FROM notices WHERE channel='site'").get().n
    check('站点公告全部开启弹窗', siteModal === siteTotal, `${siteModal}/${siteTotal}`)

    const officialModal = db.prepare("SELECT COUNT(*) AS n FROM notices WHERE channel='official' AND show_in_modal=1").get().n
    check('官方公告全部关闭弹窗', officialModal === 0, `实际 ${officialModal}`)

    // ID 已改序号
    const oldIds = db.prepare(
      "SELECT id FROM notices WHERE id NOT GLOB 'site-[0-9]*' AND id NOT GLOB 'official-[0-9]*'"
    ).all()
    check('🔴 所有公告 id 已改为序号形式（site-N / official-N）', oldIds.length === 0, oldIds.map((r) => r.id).join(','))

    const siteIds = db.prepare("SELECT id FROM notices WHERE channel='site' ORDER BY id").all().map((r) => r.id)
    check('站点公告 id 为 site-1..site-4', siteIds.join(',') === 'site-1,site-2,site-3,site-4', siteIds.join(','))
    const officialIds = db.prepare("SELECT id FROM notices WHERE channel='official' ORDER BY id").all().map((r) => r.id)
    check('官方公告 id 为 official-1..official-3', officialIds.join(',') === 'official-1,official-2,official-3', officialIds.join(','))

    // 固定位与动态位
    const slotRows = db.prepare('SELECT channel, slot, notice_id FROM home_notice_slots ORDER BY channel, slot').all()
    const siteSlot1 = slotRows.find((r) => r.channel === 'site' && r.slot === 1)
    const siteSlot2 = slotRows.find((r) => r.channel === 'site' && r.slot === 2)
    const siteSlot3 = slotRows.find((r) => r.channel === 'site' && r.slot === 3)
    const siteSlot4 = slotRows.find((r) => r.channel === 'site' && r.slot === 4)
    check('站点位置 1 固定为 site-1（站点声明）', siteSlot1?.notice_id === 'site-1', String(siteSlot1?.notice_id))
    check('站点位置 4 固定为 site-4（社区准则）', siteSlot4?.notice_id === 'site-4', String(siteSlot4?.notice_id))
    check('站点位置 2、3 为 NULL（走动态最新）', siteSlot2?.notice_id === null && siteSlot3?.notice_id === null,
      `2=${siteSlot2?.notice_id} 3=${siteSlot3?.notice_id}`)

    const officialAllNull = slotRows.filter((r) => r.channel === 'official').every((r) => r.notice_id === null)
    check('官方四个位置全为 NULL（走动态最新）', officialAllNull)

    // 插槽引用的公告必须存在（防悬空）
    const danglingSlots = db.prepare(
      `SELECT s.channel, s.slot FROM home_notice_slots s
       WHERE s.notice_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM notices n WHERE n.id = s.notice_id)`
    ).all()
    check('插槽引用的公告都存在', danglingSlots.length === 0, danglingSlots.map((r) => `${r.channel}-${r.slot}`).join(','))

    // 海报的 notice 行动也要跟着新 id 走（否则第 12 步的引用会悬空）
    const danglingBanners = db.prepare(
      `SELECT b.id FROM home_banners b
       WHERE b.action_type = 'notice'
         AND NOT EXISTS (SELECT 1 FROM notices n WHERE n.id = b.action_value)`
    ).all()
    check('🔴 ID 改序号后海报的 notice 行动仍未悬空', danglingBanners.length === 0,
      danglingBanners.map((r) => r.id).join(','))

    /*
     * 海报引用「旧 id」时必须被 UPDATE 修正。
     *
     * 场景：老库里 banner 的 action_value 曾被人手工改成 `site-community-rules`
     * （第 13 步之前的老 id），迁移后该 id 已不存在 —— 若脚本只处理
     * `official-v120` 这一个旧值，这条引用就会悬空，首页点海报没反应。
     *
     * 做法：把一条海报改成旧的语义 id，重跑第 13 步的 UPDATE 段，验证被修正。
     */
    db.prepare("UPDATE home_banners SET action_type='notice', action_value='site-community-rules' WHERE id='banner-v120'").run()
    const staleBefore = db.prepare("SELECT action_value FROM home_banners WHERE id='banner-v120'").get().action_value
    check('构造出旧的语义 id 引用', staleBefore === 'site-community-rules', staleBefore)

    // 只跑 UPDATE 部分（整脚本会因 ALTER 中断），从 STEPS[12] 里截取 UPDATE 段
    const step13Sql = STEPS[12][1]
    const updateSection = step13Sql
      .split('\n')
      .filter((l) => /^UPDATE home_banners SET action_value/.test(l) || /^\s+WHERE action_type = 'notice'/.test(l))
      .join('\n')
    db.exec(updateSection)
    const staleAfter = db.prepare("SELECT action_value FROM home_banners WHERE id='banner-v120'").get().action_value
    check('🔴 旧 id 引用被迁移脚本修正为 site-4', staleAfter === 'site-4', staleAfter)

    // 还原成正常的官方引用
    db.prepare("UPDATE home_banners SET action_value='official-1' WHERE id='banner-v120'").run()

    // 第 13 步幂等：重跑时只在 ALTER TABLE 处报 duplicate column（既定行为）
    let step13Rerun = ''
    try {
      db.exec(STEPS[12][1])
      step13Rerun = 'ok'
    } catch (err) {
      step13Rerun = String(err.message || err)
    }
    check('第 13 步重复执行报 duplicate column（既定行为，与第 2/4/5/8/9 步一致）',
      /duplicate column name: show_in_modal/i.test(step13Rerun), step13Rerun.slice(0, 60))

    const slotsAfter = db.prepare('SELECT COUNT(*) AS n FROM home_notice_slots').get().n
    check('第 13 步重跑后插槽仍是 8 个（没有重复播种）', slotsAfter === 8, `重跑后 ${slotsAfter}`)
    const noticesStill7 = db.prepare('SELECT COUNT(*) AS n FROM notices').get().n
    check('第 13 步重跑后公告仍是 7 条', noticesStill7 === 7, `重跑后 ${noticesStill7}`)
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
