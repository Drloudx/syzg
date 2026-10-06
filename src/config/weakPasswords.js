/**
 * 弱密码拦截（**只在前端做**）。
 *
 * ## 为什么是前端
 *
 * 服务端**永远收不到密码** —— 它只收到客户端 PBKDF2 推导出的 `verifier`（见方案 §四）。
 * 所以"这个密码是不是 123456"这种判断，服务端在原理上就做不了。
 * 这不是偷懒，是路线 A 的必然结果：**代价是弱密码检查必须在客户端**。
 *
 * 反过来也有好处：密码不需要上传就能得到反馈，用户体验更快；
 * 而且弱密码**根本不会被提交**，连一次多余的 KDF 都省了。
 *
 * ## 拦什么、不拦什么
 *
 * 拦：太短、全是同一种字符、连续序列、纯数字、常见弱密码、包含自己的邮箱/昵称。
 * **不拦**：复杂度要求（大小写+数字+符号）。NIST SP 800-63B 明确不建议强制字符类，
 * 因为它逼出 `Abc123!@#` 这种**看着复杂其实极易猜**的密码，反而更差。
 * 我们只挡"明显会被字典秒破"的那一类，鼓励长口令（≥8，越长越好）。
 */

import { PASSWORD_MIN } from './auth.js'

/**
 * 常见弱密码。
 *
 * 不是完整的字典（那得几十万条），只收**在中文互联网语境下最常被撞**的那些：
 * 纯数字序列、键盘序、`woaini`/`520` 系列、网站名相关。
 * 真正的字典攻击防线是 PBKDF2 60 万轮 + 服务端限流，不是这张表。
 */
export const WEAK_PASSWORDS = new Set([
  // 纯数字 / 序列
  '12345678', '123456789', '1234567890', '01234567', '11111111', '00000000',
  '88888888', '66666666', '520131452', '123123123', '11223344', '98765432',
  '14725836', '15935785', 'a1234567', 'aa123456', 'abc12345', 'abcd1234',
  // 键盘序
  'qwertyui', 'qwertyuiop', 'asdfghjk', 'asdfghjkl', 'zxcvbnm,', '1qaz2wsx',
  '1q2w3e4r', 'qazwsxedc', '!qaz2wsx', 'qwerty12', 'qwerty123', 'zxcvbnm1',
  // 英文常见
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword', 'p@ssw0rd',
  'iloveyou', 'sunshine', 'princess', 'football', 'baseball', 'superman',
  'letmein1', 'welcome1', 'admin123', 'root1234', 'test1234', 'guest123',
  'monkey12', 'dragon12', 'master12', 'shadow12', 'michael1', 'charlie1',
  // 中文语境高频
  'woaini1314', 'woaini520', 'woaini123', 'wodemima', 'woshishui', 'nihao123',
  'zhangwei', 'wangwei1', 'liwei123', 'chenjie1', 'yangyang', 'lixiaolong',
  'xiaoming', 'zhonghua', 'beijing1', 'shanghai', 'shenzhen', 'guangzhou',
  'woainiwo', '520520520', '13145200', '520131400', 'a5201314',
  // 与本站相关
  'shenyuan', 'shenyuandashuyuan', 'myrzg123', 'syzg1234', 'dashuyuan'
])

/** 把连续序列判断出来：`12345678`、`abcdefgh`、`87654321`、`hgfedcba` 都算。 */
function isStraightSequence(s) {
  if (s.length < 4) return false
  let asc = true
  let desc = true
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1)
    if (d !== 1) asc = false
    if (d !== -1) desc = false
  }
  return asc || desc
}

/** 同一个字符重复（`aaaaaaaa`）或只有两种字符来回（`abababab`）。 */
function isRepetitive(s) {
  if (new Set(s).size === 1) return true
  if (s.length >= 6) {
    const two = s.slice(0, 2)
    if (s === two.repeat(Math.ceil(s.length / 2)).slice(0, s.length) && two[0] !== two[1]) return true
  }
  return false
}

/**
 * 校验密码强度。
 *
 * @param {string} password
 * @param {{ email?: string, nick?: string }} [context]
 *   传入时额外检查"密码里包含自己的邮箱前缀/昵称"——这是撞库之外最容易被定向猜中的一类。
 * @returns {{ ok: boolean, reason: string }}
 *   `reason` 是**可直接展示的中文**；`ok: true` 时为空串。
 */
export function checkPasswordStrength(password, context = {}) {
  const pwd = String(password ?? '')

  if (pwd.length === 0) return { ok: false, reason: '请设置密码' }
  if (pwd.length < PASSWORD_MIN) return { ok: false, reason: `密码至少 ${PASSWORD_MIN} 位` }

  const lower = pwd.toLowerCase()
  if (WEAK_PASSWORDS.has(lower)) return { ok: false, reason: '这个密码太常见了，换一个吧' }
  if (isRepetitive(pwd)) return { ok: false, reason: '密码不能是重复的字符' }
  if (isStraightSequence(pwd)) return { ok: false, reason: '密码不能是连续的数字或字母' }
  if (/^\d+$/.test(pwd)) return { ok: false, reason: '密码不要只用数字' }

  // 与账号信息相关：邮箱前缀 / 昵称（≥3 个字符才有意义，太短会误伤）
  const pieces = []
  const email = String(context.email || '').toLowerCase().trim()
  if (email.includes('@')) pieces.push(email.slice(0, email.indexOf('@')))
  const nick = String(context.nick || '').toLowerCase().trim()
  if (nick) pieces.push(nick)
  for (const piece of pieces) {
    if (piece.length >= 3 && lower.includes(piece)) {
      return { ok: false, reason: '密码里不要包含自己的邮箱或昵称' }
    }
  }

  return { ok: true, reason: '' }
}

/** 给界面用的强度提示（不拦截，只提示）。返回 0~3。 */
export function passwordStrengthLevel(password) {
  const pwd = String(password ?? '')
  if (pwd.length < PASSWORD_MIN) return 0
  let score = 1
  if (pwd.length >= 12) score++
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pwd)).length
  if (classes >= 3) score++
  if (!checkPasswordStrength(pwd).ok) return 0
  return Math.min(score, 3)
}
