/**
 * 相对时间格式化（"3 分钟前" / "42 天前"）。
 *
 * ## 为什么抽成独立模块
 *
 * 这个项目里已经有**两份重复实现** —— `App.vue` 的 `formatTime()` 与
 * `CommentsPanel.vue` 里的同名函数，逻辑逐行相同。管理后台要用第三处时
 * 不再复制粘贴，改为共用一份。
 *
 * ⚠️ 没有去改那两处的现有实现（它们工作正常，改动半径会溢出到讨论区与
 * 右栏预览）。新代码用本模块，旧代码保持不动 —— 这是刻意的取舍：
 * **统一口径的收益不值当去动两个已稳定的调用点**。
 *
 * ## 成本说明（回答"有没有性能和额度影响"）
 *
 * **零网络、零数据库**。它只接收一个 Unix 秒数，用 `Date.now()` 做差。
 *
 * 🔴 **不挂定时器**：只在**渲染时**算一次。这意味着页面上"3 分钟前"会
 *    随时间变旧（页面开着 10 分钟，仍显示"3 分钟前"）。
 *    这是与既有两处实现一致的取舍 —— 加定时器会让每个用到相对时间的地方
 *    都要管生命周期（挂载/卸载/可见性），而收益只是让文案更"实时"。
 *    后台是低频查看场景，刷新一下就对了。
 *
 * 7 天以内用相对时间，超出显示日期：太远的"87 天前"不如具体日期直观。
 */

const MIN = 60
const HOUR = 3600
const DAY = 86400
const WEEK = 7 * DAY

/** 补零到两位 */
const pad = (n) => String(n).padStart(2, '0')

/**
 * 把 Unix 秒数格式化为相对时间（近 7 天）或日期（更早）。
 *
 * @param {number|null|undefined} unixSec Unix 秒
 * @param {{empty?: string, now?: number}} [opts]
 *   `empty` 空值时的占位文案（默认 `—`）
 *   `now` 当前时间（秒），**仅测试用**，便于固定时间断言
 * @returns {string}
 */
export function formatRelativeTime(unixSec, opts = {}) {
  const { empty = '—', now } = opts
  if (!unixSec) return empty
  const current = now ?? Math.floor(Date.now() / 1000)
  const diff = current - unixSec

  // 未来时间（时钟漂移 / 手工写库）不该显示成"负数分钟前"
  if (diff < 0) return '刚刚'
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < WEEK) return `${Math.floor(diff / DAY)} 天前`

  const d = new Date(unixSec * 1000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 绝对时间（`YYYY-MM-DD HH:mm`），用于 `title` 属性 —— 相对时间可读，
 * 但"要精确到分钟"时仍需要绝对值（鼠标悬停可见）。
 *
 * @param {number|null|undefined} unixSec Unix 秒
 * @param {string} [empty] 空值占位
 */
export function formatAbsoluteTime(unixSec, empty = '—') {
  if (!unixSec) return empty
  const d = new Date(unixSec * 1000)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/**
 * 「距今多久」的粗粒度描述，用于"注册于 X"这类**跨度可能很大**的场景。
 *
 * 与 `formatRelativeTime` 的区别：那个超 7 天就退回日期，这个一路给到"年"。
 * 例：注册 42 天前 → `1 个月前`；注册 400 天前 → `1 年前`。
 */
export function formatAge(unixSec, opts = {}) {
  const { empty = '—', now } = opts
  if (!unixSec) return empty
  const current = now ?? Math.floor(Date.now() / 1000)
  const diff = Math.max(0, current - unixSec)

  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天`
  if (diff < 365 * DAY) return `${Math.floor(diff / (30 * DAY))} 个月`
  return `${Math.floor(diff / (365 * DAY))} 年`
}
