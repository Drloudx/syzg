/**
 * 后台概览统计的内存缓存（模块级）。
 *
 * ## 为什么必须有
 *
 * `adminStats` 一次要跑 **9 条聚合查询**，其中 7 条是"计数一遍"
 * （`COUNT(*)` / `GROUP BY` / `SUM(CASE …)`）。这类查询**索引无法优化** ——
 * 数一遍就是要把相关行读一遍。实测（本地 ~3.2k 评论 / ~2.3k 会话）：
 * 加索引后仍约 **2.2 万行读/次**。
 *
 * D1 免费额度按 **rows read** 计（5,000,000/天），所以"每次进后台都全算一遍"
 * 会让额度随数据增长线性消耗：2.2 万行/次 → 229 次/天就打满。
 *
 * 缓存后：TTL 窗口内**零查询**，额度开销只与实际刷新次数成比例。
 *
 * ## 为什么能接受"数字滞后"
 *
 * 概览是**只读仪表盘**，不是作业单据。管理员看的是趋势与量级，
 * 不是"精确到毫秒的实时值"。用户已确认滞后可接受。
 *
 * ⚠️ 但**写操作必须主动失效**（见 `invalidateAdminStatsCache`）——
 * 否则管理员处理完待审、回到概览看到的还是旧数字，会以为操作失败。
 * 这是缓存 + 只读页面的标准做法：**读侧容忍滞后，写侧主动作废**。
 *
 * ## 与 `getReviewMatcher` 的分工
 *
 * 两者都是模块级 TTL 缓存，但**失效时机不同**：
 *   · 词表缓存：超管保存词表后失效（配置变更，低频）
 *   · 概览缓存：任何**改变计数**的写操作后失效（评论/用户状态、删评论、改角色…）
 * 所以概览的失效调用点更多，集中在管理端写路径末尾。
 */

/**
 * TTL：5 分钟（2026-10-14 由 30 秒上调）。
 *
 * 🔴 为什么 30 秒**几乎无效**：TTL 的收益取决于「同一段操作内的查看间隔」
 *    是否小于 TTL。管理员的真实节奏是「进概览 → 去处理几条 → 回概览」，
 *    一轮约 4 分钟 —— 大于 30 秒，于是每次都过期重算，缓存形同虚设。
 *    实测（3 管理员 × 3 工作段 × 每段看 5 次概览）：
 *      · TTL 30 秒 → 重算 45 次，占额度 23.2%
 *      · TTL 5 分钟 → 重算 9 次，占额度 4.6%   ← 省 80%
 *    5 分钟刚好覆盖"一轮处理"，段内第 2 次起全部命中。
 *
 * 为什么不取更长（30 分钟）：**拿不到额外收益** —— 在上述模型下 30 分钟
 * 同样是 9 次重算，却把跨实例滞后与跨日错窗都拉长了 6 倍。
 */
const STATS_TTL_MS = 5 * 60 * 1000

let cachedStats = null
let cachedAt = 0
let cachedDayStart = 0
let inflight = null

/** 当前 UTC 日界线（与 `adminStats` 里的 `dayStart` 口径一致） */
function todayStart() {
  const now = Math.floor(Date.now() / 1000)
  return now - (now % 86400)
}

/**
 * 作废概览缓存（**任何改变计数的写操作后必须调用**）。
 *
 * 只要调用，本实例下一次请求就会重新算。其它实例最长 `STATS_TTL_MS` 后各自到期
 * —— 这仍是可接受的（滞后以秒计，而不是"永不更新"）。
 */
export function invalidateAdminStatsCache() {
  cachedStats = null
  cachedAt = 0
  cachedDayStart = 0
  // ⚠️ 不清 inflight：正在飞的那次请求完成后会写入新值，
  //    清掉反而可能让旧值晚一步覆盖新值。
}

/**
 * 把缓存时间戳往前拨（**仅测试用**）。
 *
 * 有了它，"TTL 到期后会重新算"这条才能在测试里秒级验证 —— 否则要真等 5 分钟。
 * 生产代码不该调用它。
 *
 * ⚠️ 同时把 `cachedDayStart` 对齐到当前日界线：否则跨日判定会**先**命中
 *    （`cachedDayStart !== dayStart`）而把缓存清掉，就测不到"TTL 过期"这条了。
 */
export function setStatsCachedAtForTest(ts) {
  cachedAt = ts
  cachedDayStart = todayStart()
}

/**
 * 直接把「缓存是哪天算的」设成指定日界线（**仅测试用**）。
 *
 * 跨日判定没法靠拨 `cachedAt` 验证 —— 拨时间戳会连带把 `cachedDayStart`
 * 对齐成今天。只有能单独指定它，"跨日必须重算"这条才测得到。
 */
export function setStatsCachedDayForTest(dayStart) {
  cachedDayStart = dayStart
}

/**
 * 取概览统计：优先缓存 → 否则真算一次 → **失败不落缓存**（下次继续尝试）。
 *
 * @param {() => Promise<object>} compute 真正执行 9 条聚合的函数
 * @returns {Promise<object>} 概览数据
 */
export async function getAdminStats(compute) {
  const now = Date.now()
  const dayStart = todayStart()
  /*
   * 🔴 跨日界线必须强制重算（`cachedDayStart !== dayStart`）。
   *
   * 概览里的「今日评论 / 昨日评论 / 今日新增 / 7 日趋势」都基于
   * `dayStart = 秒 - 秒 % 86400`，即 **UTC 日界线**（= 北京时间 08:00，
   * 正是上班时段）。若跨过这条线还用旧缓存，「今日」会显示成昨天的数：
   *   · TTL 30 秒 → 错最长 30 秒（几乎无感）
   *   · TTL 5 分钟 → 错最长 5 分钟
   * 有了这条判定，**跨日零滞后**，于是长 TTL 不再有任何可感知代价 ——
   * 这正是把 TTL 从 30 秒提到 5 分钟的前提。
   */
  if (cachedStats && cachedDayStart !== dayStart) {
    cachedStats = null
    cachedAt = 0
  }
  if (cachedStats && now - cachedAt < STATS_TTL_MS) return cachedStats
  // 并发请求只算一次（否则一波刷新会各自打 9 条聚合）
  if (inflight) return inflight

  const dayAtStart = dayStart
  inflight = (async () => {
    try {
      return await compute()
    } catch (err) {
      /*
       * 🔴 算失败**不能写进缓存**：否则接下来整个 TTL 都会返回这个失败，
       *    把一次偶发故障放大成"几分钟持续不可用"。
       *    抛出去让调用方按原有逻辑回 500（与加缓存前行为一致）。
       */
      throw err
    } finally {
      inflight = null
    }
  })()

  const value = await inflight
  cachedStats = value
  cachedAt = Date.now()
  // 记下这批数据是**哪一天**算的（跨日判定用）
  cachedDayStart = dayAtStart
  return value
}
