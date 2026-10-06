/**
 * 账号体系的**纯密码学工具**：无状态、无 D1、无网络，因此可在 Node 里完整单测。
 *
 * 真正的 HTTP 处理与 D1 读写留在 `functions/api/[[path]].js`；
 * 这里只放"给定输入必得同一输出"的那部分。
 *
 * ## 两把密钥的分工（**都只在环境变量里，永不入库**）
 *
 * | 密钥 | 用途 | 泄露后果 |
 * | --- | --- | --- |
 * | `SALT_SECRET` | 从邮箱推导**查询哈希**与**公开盐** | 能反推任意邮箱的哈希与盐 |
 * | `AUTH_PEPPER` | 存 `verifier_hash` / `code_hash` 前再混一层 | **等效于所有密码被破** |
 *
 * 🔴 **两把都"设了就永远不能改"**：改 `SALT_SECRET` 会让所有人的盐与查询哈希失效
 * （等于丢全部账号）；改 `AUTH_PEPPER` 会让库里所有哈希对不上（所有人登不上）。
 * 所以必须一次设好并备份。
 *
 * ## 域分隔（domain separation）—— 这里比方案文档多走了一步
 *
 * 方案 §4.2 写的是 `salt = HMAC(SALT_SECRET, normalize(email))`，
 * 而 `email_hash` 也是同一个表达式 —— 也就是说**盐与 email_hash 会完全相等**。
 *
 * 这有个问题：`/api/auth/salt` 是**公开接口**（任何邮箱都能查盐），
 * 于是 `email_hash` 也一并公开了。万一 D1 备份泄露，攻击者就能拿
 * `email_hash` 列表去逐个调 `/api/auth/salt` 做匹配 —— 等于给了一份"这些邮箱在不在库里"的对照器。
 *
 * **修法只需给 HMAC 加一个用途前缀**（域分隔）：
 *
 * ```
 * email_hash = HMAC(SALT_SECRET, 'lookup:' + email)   // 入库、查询用，不公开
 * salt       = HMAC(SALT_SECRET, 'salt:'   + email)   // 公开给客户端，与上面无关
 * ```
 *
 * 代价为零，却让"公开的盐"推不出"入库的哈希"。**后文统称域分隔。**
 */

import { PBKDF2_KEY_BYTES } from '../config/auth.js'

const encoder = new TextEncoder()

/** 字节 → 小写 hex。 */
export function toHex(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

/** SHA-256 → 小写 hex。会话令牌、IP/UA 哈希都用它。 */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(String(text)))
  return toHex(new Uint8Array(buf))
}

/**
 * HMAC-SHA256 → **原始字节**。
 *
 * 为什么需要一个"不转 hex"的版本：腾讯云 TC3 签名的密钥链是
 * `HMAC(HMAC(HMAC("TC3"+key, date), service), "tc3_request")` ——
 * 每一步的输出要**当作下一步的二进制密钥**用，中间转 hex 就错了。
 */
export async function hmacRaw(key, message) {
  const keyBytes = key instanceof Uint8Array ? key : encoder.encode(String(key ?? ''))
  if (keyBytes.length === 0) {
    throw new Error('authCrypto: HMAC 密钥为空 —— 检查 SALT_SECRET / AUTH_PEPPER / 腾讯云密钥是否已配置')
  }
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(String(message)))
  return new Uint8Array(sig)
}

/**
 * HMAC-SHA256 → 小写 hex。
 *
 * 为什么不自己拼 `SHA-256(key + msg)`：那种"前缀拼接"构造对长度扩展攻击不设防，
 * 而且当 key 比块长时行为与 HMAC 不同。用平台的 HMAC 实现即可，且是原生的、极快。
 */
export async function hmacHex(key, message) {
  const k = String(key ?? '')
  if (k.length === 0) {
    /*
     * WebCrypto **明确拒绝零长度 HMAC 密钥**（会抛一句很难懂的
     * `DataError: Zero-length key is not supported`）。
     *
     * 而真实场景几乎只有一个：**环境变量没配**（`SALT_SECRET` / `AUTH_PEPPER`）。
     * 所以这里主动抛一句能直接指向原因的话。
     *
     * 注意调用方的行为：`functions/api/[[path]].js` 会捕获异常并回 500 ——
     * 这是 **fail-closed**（拒绝服务），**不会**放行任何请求。这点很重要：
     * 宁可注册接口暂时不可用，也不能在"没配 pepper"的情况下把哈希存进库。
     */
    throw new Error('authCrypto: HMAC 密钥为空 —— 检查 SALT_SECRET / AUTH_PEPPER 是否已配置')
  }
  return toHex(await hmacRaw(k, message))
}

/**
 * 邮箱规范化。
 *
 * **只做小写化 + 去首尾空格，刻意不做服务商特有规则**：
 * Gmail 的点号（`a.b@gmail.com` 等价于 `ab@gmail.com`）与 `+tag` 都**不处理** ——
 * 那会把两个不同的邮箱判成同一个，是另一种事故（用户会发现自己注册不了）。
 */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

/**
 * 邮箱格式校验。故意宽松：**只挡住明显不是邮箱的输入**，
 * 真正的可用性由"能不能收到验证码"来证明。
 * 过严的正则会误杀合法地址（尤其国内的自定义域名邮箱）。
 */
export function isPlausibleEmail(email) {
  const e = normalizeEmail(email)
  if (e.length < 6 || e.length > 254) return false
  if (/\s/.test(e)) return false
  const at = e.lastIndexOf('@')
  if (at <= 0 || at === e.length - 1) return false
  // 🔴 必须**只有一个** `@`：只用 lastIndexOf 会让 `a@@b.com` 蒙混过关
  // （本地部分是 `a@`、域名是 `b.com`，看着都像那么回事）。
  if (e.indexOf('@') !== at) return false
  const domain = e.slice(at + 1)
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false
  return true
}

/** 入库与查询用的邮箱哈希（**不公开**）。 */
export function emailLookupHash(email, saltSecret) {
  return hmacHex(saltSecret, 'lookup:' + normalizeEmail(email))
}

/**
 * **密码盐：每个用户独立随机生成**（对齐主流做法）。
 *
 * ## 为什么改成随机（2026-10-07）
 *
 * 原先盐是 `HMAC(SALT_SECRET, 'salt:' + 邮箱)` **派生**出来的。它满足"每人不同"，
 * 但**不是随机**，偏离了 bcrypt / Argon2 / scrypt 这些主流密码哈希的通行做法
 * —— 它们都是每条记录一次 CSPRNG，并把盐随哈希一起存。
 *
 * 关键转折点：**盐后来被存进了 `users.pw_salt`**（为了支持换邮箱，见 §4.2.1）。
 * 一旦盐入库，派生盐相对随机盐就**只剩缺点**了：
 *   · 攻击者拿到数据库 + `SALT_SECRET` 时，可以自己算出所有盐 → 预计算可行；
 *   · 而随机盐即使 `SALT_SECRET` 同时泄露，也仍需逐个用户单独爆破。
 *
 * ## 盐的编码约定没有变
 *
 * 仍然是**64 位小写 hex 字符串**，客户端把它**当 UTF-8 字符串**直接用作 PBKDF2 的
 * salt（不做 hex 解码，见 `config/auth.js` 的 `SALT_ENCODING`）。
 * 所以 `tests/ui/password-kdf.spec.js` 的跨端比对依然有效，协议本身没动。
 *
 * ## 盐由客户端生成
 *
 * 因为"先有盐才能派生 verifier"——登录前无法认证，注册时服务端也还没见过这个用户。
 * 所以注册流程里由客户端生成盐、连同 `verifier` 一起提交，服务端只负责**校验格式**
 * （必须是 64 位 hex）并原样存下来。
 */
export function generatePasswordSalt() {
  const bytes = new Uint8Array(PBKDF2_KEY_BYTES)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

/**
 * 未注册邮箱查询盐时返回的**确定性占位盐**。
 *
 * ⚠️ **这不是为了防枚举**（2026-10-07 已明确不做防枚举）—— 而是为了**流程可用**：
 * 登录页在提交前会先取盐，如果对未注册邮箱直接报错，用户会在还没点登录时
 * 就看到一个"邮箱不存在"式的错误。返回一个形状正常的盐，让流程照常走到
 * 服务端比对、统一返回「邮箱或密码不对」，体验与主流站点一致。
 *
 * 顺带的好处：它对同一邮箱是**稳定的**（不会两次请求返回不同值），
 * 因此不会因为"响应随机"而变成新的账号枚举口子。**这是副作用，不是目的。**
 */
export function placeholderPasswordSalt(email, saltSecret) {
  return hmacHex(saltSecret, 'placeholder:' + normalizeEmail(email))
}

/** 存 `verifier_hash` 与 `code_hash` 前混的那一层 pepper。 */
export function pepperHash(value, pepper) {
  return hmacHex(pepper, String(value))
}

/**
 * 生成 6 位数字验证码。
 *
 * 用 `crypto.getRandomValues` 而不是 `Math.random`：
 * 后者是可预测的伪随机，攻击者拿到几个历史码就能推后续的。
 *
 * **拒绝采样**：`% 1000000` 会让 0~999999 的分布出现极小偏差
 * （2^32 不是 10^6 的整数倍）。这里丢弃落在尾部的取值，保证严格均匀。
 */
export function generateNumericCode(digits = 6) {
  const range = 10 ** digits
  const limit = Math.floor(0x100000000 / range) * range
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return String(buf[0] % range).padStart(digits, '0')
  }
}

/**
 * 恒定时间比较两个 hex 串。
 *
 * 用 `crypto.subtle.timingSafeEqual`（Cloudflare 提供的非标准扩展）——
 * 它比手写循环更可靠（JS 引擎可能把手写循环优化掉，从而重新引入时序差异）。
 * 在 Node 里没有这个扩展，所以回落到手写实现（Node 只用于测试）。
 */
export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  const subtle = globalThis.crypto?.subtle
  if (typeof subtle?.timingSafeEqual === 'function') {
    try {
      // 该扩展吃 ArrayBuffer/TypedArray；用编码后的字节比较
      return subtle.timingSafeEqual(encoder.encode(a), encoder.encode(b))
    } catch {
      /* 落到下面的手写实现 */
    }
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 会话令牌：32 字节随机 → 64 位 hex（明文只回给客户端一次）。 */
export function generateSessionToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

/**
 * 一次性邮箱域名黑名单匹配。
 *
 * 零依赖、纯字符串比较 —— 批量注册最省事的办法就是用临时邮箱，
 * 而这类域名是**公开列表**，维护成本几乎为零。命中即拒绝。
 *
 * @param {string} email
 * @param {Set<string>|string[]} domains 域名集合（小写、不含 `@`）
 */
export function isDisposableEmail(email, domains) {
  const at = normalizeEmail(email).lastIndexOf('@')
  if (at <= 0) return false
  const domain = normalizeEmail(email).slice(at + 1)
  const set = domains instanceof Set ? domains : new Set(domains || [])
  if (set.has(domain)) return true
  // 子域也算命中（mail.mailinator.com 这类）
  for (const d of set) {
    if (domain.endsWith('.' + d)) return true
  }
  return false
}

/** 派生结果的字节数（供调用方构造断言，别重复写 32）。 */
export const VERIFIER_BYTES = PBKDF2_KEY_BYTES
