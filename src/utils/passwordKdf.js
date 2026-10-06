/**
 * 客户端密码派生（PBKDF2-HMAC-SHA256）。
 *
 * ## 这个模块存在的理由
 *
 * Cloudflare Workers **免费版每请求只有 10ms CPU**，跑不动任何有意义的密码哈希；
 * 付费版又被平台**入口封顶**（PBKDF2 ≤ 100000 轮）。所以本项目把 KDF 挪到
 * **用户自己的设备**上算 —— 那里没有 CPU 预算限制，可以按 OWASP 推荐值跑满 60 万轮。
 *
 * 服务端随后只对这个 `verifier` 做一次 `HMAC-SHA256(AUTH_PEPPER, verifier)`
 * （≈0.02ms），**既不存密码，也不存 verifier 本身**。
 *
 * ## 必须两端一致（这是本模块唯一的风险点）
 *
 * 用户在浏览器注册、在手机 App 登录、服务端只比对哈希 —— 所以
 * **浏览器与 Node 必须对同一组 `(password, salt, iters)` 算出逐字节相同的结果**。
 *
 * 理论依据是两边都遵循 RFC 2898 的 WebCrypto 规范，但**编码细节**（盐怎么编码、
 * 输出用 hex 还是 base64）才是真正的坑。所以：
 * - 编码约定在 `config/auth.js` 里钉死（`SALT_ENCODING`）；
 * - `tests/unit/password-kdf.test.mjs` 用 **Node 的 OpenSSL 实现**交叉验证；
 * - `tests/ui/password-kdf.spec.js` 用 **Playwright 开真浏览器**逐字节比对。
 *
 * ## 零依赖
 *
 * 只用 `crypto.subtle` 与 `TextEncoder` —— Node 18+ 与所有现代浏览器都有。
 * 服务端与前端共用同一份代码，**不引入任何第三方库**。
 */

import {
  PBKDF2_HASH,
  PBKDF2_ITERS,
  PBKDF2_KEY_BYTES,
  SALT_ENCODING
} from '../config/auth.js'

const encoder = new TextEncoder()

/**
 * 字节数组 → 小写 hex 字符串。
 *
 * 为什么不用 base64：hex 无 padding、无 `+` `/` 字符集歧义，
 * 而且**逐字符可比对**，出问题时肉眼就能看出哪一位不同。
 */
export function toHex(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/**
 * hex 字符串 → 字节数组。
 *
 * ⚠️ **注意它不参与 `deriveVerifier`** —— 盐**不做 hex 解码**（见 `SALT_ENCODING`）。
 * 这个函数只留给服务端解析客户端可能传来的 hex 字段用。
 */
export function fromHex(hex) {
  const clean = String(hex || '').trim()
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error('fromHex: 不是合法的 hex 字符串')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * 由密码与盐派生 verifier。
 *
 * @param {string} password 用户输入的密码（**明文只在本函数里存活**）
 * @param {string} salt     服务端 `/api/auth/salt` 返回的**盐字符串**
 * @param {{iterations?: number, hash?: string, keyBytes?: number}} [options]
 *        仅供测试与将来迁移使用。**生产调用不要传** —— 用默认值，
 *        默认值就是 `config/auth.js` 里那套协议。
 * @returns {Promise<string>} 64 位小写 hex
 *
 * ## 盐的处理（读一遍再改）
 *
 * 盐**按 UTF-8 字符串直接使用**，**不做 hex 解码**：服务端给 64 位 hex，
 * 我们就用这 64 个 ASCII 字符本身当 salt（即 64 字节），与
 * `config/auth.js` 的 `SALT_ENCODING = 'utf8-of-hex-string'` 对应。
 *
 * 这是**协议的一部分**，两端必须一致。改它会直接导致
 * **所有已注册用户无法登录**，所以由测试锁住。
 *
 * ## 为什么要 `importKey` 而不是直接 `deriveBits`
 *
 * WebCrypto 的 `deriveBits` 要求先拿到一个 `CryptoKey`。用
 * `importKey(..., extractable = false, ...)` 明确**不允许导出**，
 * 减少这个中间对象在内存里被读走的机会。
 */
export async function deriveVerifier(password, salt, options = {}) {
  const iterations = options.iterations ?? PBKDF2_ITERS
  const hash = options.hash ?? PBKDF2_HASH
  const keyBytes = options.keyBytes ?? PBKDF2_KEY_BYTES

  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('deriveVerifier: 密码不能为空')
  }
  if (typeof salt !== 'string' || salt.length === 0) {
    throw new Error('deriveVerifier: 盐不能为空')
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations,
      hash
    },
    key,
    keyBytes * 8
  )

  return toHex(new Uint8Array(bits))
}

/**
 * 目前 `crypto.subtle` 是否可用。
 *
 * 用途：给 UI 一个**明确的降级提示**，而不是让 `deriveVerifier` 抛出一个
 * 用户看不懂的异常。什么时候会不可用：
 * - 非安全上下文（`http://` 且非 localhost）；
 * - 极老的浏览器。
 *
 * 本项目的两种情况都是安全的：网页走 https，安卓走 `androidScheme: "https"`
 * （页面 origin 是 `https://localhost`，属于安全上下文）。
 */
export function isKdfAvailable() {
  return typeof crypto !== 'undefined'
    && typeof crypto.subtle !== 'undefined'
    && typeof crypto.subtle.importKey === 'function'
}

/** 协议摘要，用于日志与测试断言（**不含任何用户数据**）。 */
export const KDF_PROTOCOL = Object.freeze({
  algo: 'PBKDF2',
  hash: PBKDF2_HASH,
  iterations: PBKDF2_ITERS,
  keyBytes: PBKDF2_KEY_BYTES,
  output: 'hex-lowercase',
  saltEncoding: SALT_ENCODING
})
