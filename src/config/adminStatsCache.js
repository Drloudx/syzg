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
 * TTL：30 秒。
 *
 * 取这个值的理由：后台刷新数据是**人工动作**（点「刷新数据」按钮 / 重进页面），
 * 人手速度不可能快过 30 秒一轮。再长会让"处理完看不到变化"的窗口变大。
 */
const STATS_TTL_MS = 30_000

let cachedStats = null
let cachedAt = 0
let inflight = null

/**
 * 作废概览缓存（**任何改变计数的写操作后必须调用**）。
 *
 * 只要调用，本实例下一次请求就会重新算。其它实例最长 `STATS_TTL_MS` 后各自到期
 * —— 这仍是可接受的（滞后以秒计，而不是"永不更新"）。
 */
export function invalidateAdminStatsCache() {
  cachedStats = null
  cachedAt = 0
  // ⚠️ 不清 inflight：正在飞的那次请求完成后会写入新值，
  //    清掉反而可能让旧值晚一步覆盖新值。
}

/**
 * 把缓存时间戳往前拨（**仅测试用**）。
 *
 * 有了它，"TTL 到期后会重新算"这条才能在测试里秒级验证 —— 否则要真等 30 秒。
 * 生产代码不该调用它。
 */
export function setStatsCachedAtForTest(ts) {
  cachedAt = ts
}

/**
 * 取概览统计：优先缓存 → 否则真算一次 → **失败不落缓存**（下次继续尝试）。
 *
 * @param {() => Promise<object>} compute 真正执行 9 条聚合的函数
 * @returns {Promise<object>} 概览数据
 */
export async function getAdminStats(compute) {
  const now = Date.now()
  if (cachedStats && now - cachedAt < STATS_TTL_MS) return cachedStats
  // 并发请求只算一次（否则一波刷新会各自打 9 条聚合）
  if (inflight) return inflight

  inflight = (async () => {
    try {
      return await compute()
    } catch (err) {
      /*
       * 🔴 算失败**不能写进缓存**：否则接下来 30 秒都会返回这个失败，
       *    把一次偶发故障放大成"半分钟持续不可用"。
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
  return value
}
