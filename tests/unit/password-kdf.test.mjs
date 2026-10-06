import assert from 'node:assert/strict'
import { pbkdf2Sync } from 'node:crypto'
import test from 'node:test'

import {
  PBKDF2_HASH,
  PBKDF2_ITERS,
  PBKDF2_KEY_BYTES,
  SALT_ENCODING
} from '../../src/config/auth.js'
import {
  deriveVerifier,
  fromHex,
  isKdfAvailable,
  KDF_PROTOCOL,
  toHex
} from '../../src/utils/passwordKdf.js'

/**
 * 客户端 KDF 的守护测试。
 *
 * 三层防线，顺序不能反：
 *
 * 1. **标准向量**（低轮数）—— 证明我们实现的**确实是** RFC 2898 的
 *    PBKDF2-HMAC-SHA256，而不是某次重构后悄悄跑偏了；
 * 2. **与 Node 的 OpenSSL 交叉验证**（生产轮数）—— 证明我们的
 *    `crypto.subtle` 调用与另一个**完全独立**的实现一致；
 * 3. **金标准回归锚点**（生产轮数，硬编码期望值）—— 一旦有人改了协议
 *    （轮数、盐编码、输出编码），这条会立刻红。
 *
 * 第 3 条最重要：**它是"改了协议会导致全体用户登不上"这个风险的唯一自动报警器。**
 * 如果你看到它失败，先问自己"我是故意改协议的吗"——是的话要同时走
 * `users.pw_iters` 的迁移路径，不能只改这里。
 */

const h = (buf) => Buffer.from(buf).toString('hex')

/** 生产轮数下要跑 ~100ms，多处复用同一个值，避免重复计算。 */
const GOLDEN_PASSWORD = 'correct horse battery staple'
const GOLDEN_SALT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const GOLDEN_VERIFIER = '842507c5a7e19223eac863e592c9e1d54b585c9d340cc67acdae583b2f366c98'

// ============================================================
// 一、标准测试向量（独立于本项目的协议）
// ============================================================

test('实现的是 RFC 2898 的 PBKDF2-HMAC-SHA256（标准向量）', async () => {
  // 这组向量是公开的 PBKDF2-HMAC-SHA256 标准用例，用低轮数以便快速跑。
  // 它们与我们的盐编码协议无关（盐就是字面量 "salt"），
  // 所以能干净地证明"算法本身实现对了"。
  const cases = [
    [1, '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'],
    [2, 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43'],
    [4096, 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a']
  ]

  for (const [iterations, expected] of cases) {
    const actual = await deriveVerifier('password', 'salt', { iterations })
    assert.equal(actual, expected, `iterations=${iterations} 的标准向量不符`)
  }
})

// ============================================================
// 二、与 OpenSSL（node:crypto）交叉验证
// ============================================================

test('生产轮数下与 Node 的 OpenSSL 实现逐字节一致', async () => {
  const ours = await deriveVerifier(GOLDEN_PASSWORD, GOLDEN_SALT)
  const openssl = h(pbkdf2Sync(GOLDEN_PASSWORD, GOLDEN_SALT, PBKDF2_ITERS, PBKDF2_KEY_BYTES, 'sha256'))
  assert.equal(ours, openssl)
})

test('低轮数下同样与 OpenSSL 一致（快速回归）', async () => {
  for (const iterations of [1, 2, 4096, 10000]) {
    const ours = await deriveVerifier(GOLDEN_PASSWORD, GOLDEN_SALT, { iterations })
    const openssl = h(pbkdf2Sync(GOLDEN_PASSWORD, GOLDEN_SALT, iterations, PBKDF2_KEY_BYTES, 'sha256'))
    assert.equal(ours, openssl, `iterations=${iterations} 时与 OpenSSL 不一致`)
  }
})

// ============================================================
// 三、金标准回归锚点（改协议会立刻红）
// ============================================================

test('金标准向量：生产参数下的 verifier 不得变化', async () => {
  const actual = await deriveVerifier(GOLDEN_PASSWORD, GOLDEN_SALT)
  assert.equal(
    actual,
    GOLDEN_VERIFIER,
    'KDF 协议变了！若是有意改动，必须同时处理 users.pw_iters 的迁移，否则全体用户无法登录'
  )
})

test('协议摘要与 config 一致（防止两处常量漂移）', () => {
  assert.deepEqual(KDF_PROTOCOL, {
    algo: 'PBKDF2',
    hash: PBKDF2_HASH,
    iterations: PBKDF2_ITERS,
    keyBytes: PBKDF2_KEY_BYTES,
    output: 'hex-lowercase',
    saltEncoding: SALT_ENCODING
  })
  assert.equal(PBKDF2_ITERS, 600000, '轮数是 OWASP 推荐值，改动需有明确理由')
  assert.equal(PBKDF2_HASH, 'SHA-256')
  assert.equal(PBKDF2_KEY_BYTES, 32)
})

// ============================================================
// 四、盐编码协议（最容易被"顺手改错"的地方）
// ============================================================

test('盐按 hex 字符串的 UTF-8 字节使用，而不是 hex 解码', async () => {
  // 两种做法都能跑通，所以"写错了"不会报错 —— 只会让服务端与客户端对不上。
  // 用低轮数证明"两者确实不同"即可，不必付 60 万轮的代价。
  const asUtf8 = await deriveVerifier(GOLDEN_PASSWORD, GOLDEN_SALT, { iterations: 4096 })
  const asHexDecoded = h(pbkdf2Sync(GOLDEN_PASSWORD, fromHex(GOLDEN_SALT), 4096, PBKDF2_KEY_BYTES, 'sha256'))

  assert.equal(asUtf8, h(pbkdf2Sync(GOLDEN_PASSWORD, GOLDEN_SALT, 4096, PBKDF2_KEY_BYTES, 'sha256')),
    '我们的实现应当等价于"把 hex 字符串当 UTF-8 用"')
  assert.notEqual(asUtf8, asHexDecoded,
    '两种盐编码必须产生不同结果；若相同说明盐编码协议没生效')
})

// ============================================================
// 五、输出格式
// ============================================================

test('输出为 64 位小写 hex', async () => {
  const v = await deriveVerifier('pw-for-format-test', 'salt-for-format-test', { iterations: 1 })
  assert.equal(v.length, 64)
  assert.equal(v, v.toLowerCase())
  assert.match(v, /^[0-9a-f]{64}$/)
})

test('toHex / fromHex 往返一致', () => {
  const bytes = new Uint8Array([0, 1, 15, 16, 127, 128, 254, 255])
  assert.equal(toHex(bytes), '00010f107f80feff')
  assert.deepEqual(Array.from(fromHex('00010f107f80feff')), [0, 1, 15, 16, 127, 128, 254, 255])
  assert.throws(() => fromHex('abc'), /不是合法的 hex/)
  assert.throws(() => fromHex('zz'), /不是合法的 hex/)
})

// ============================================================
// 六、确定性与敏感性
// ============================================================

test('同一输入必定得到同一结果（确定性）', async () => {
  const a = await deriveVerifier('same-pw', 'same-salt', { iterations: 4096 })
  const b = await deriveVerifier('same-pw', 'same-salt', { iterations: 4096 })
  assert.equal(a, b)
})

test('换密码或换盐都会得到不同结果', async () => {
  const base = await deriveVerifier('pw-a', 'salt-a', { iterations: 4096 })
  const otherPw = await deriveVerifier('pw-b', 'salt-a', { iterations: 4096 })
  const otherSalt = await deriveVerifier('pw-a', 'salt-b', { iterations: 4096 })
  assert.notEqual(base, otherPw)
  assert.notEqual(base, otherSalt)
  assert.notEqual(otherPw, otherSalt)
})

test('Unicode 密码按 UTF-8 编码（中文密码可用）', async () => {
  // 用中文/emoji 当密码是真实场景（用户很可能这么干）。
  // 只要两端都用 TextEncoder 就一致，这里顺便钉住这个约定。
  const cn = await deriveVerifier('我的密码很简单', 'salt-x', { iterations: 4096 })
  const expected = h(pbkdf2Sync('我的密码很简单', 'salt-x', 4096, PBKDF2_KEY_BYTES, 'sha256'))
  assert.equal(cn, expected)

  const emoji = await deriveVerifier('pw-🔒-🗝️', 'salt-x', { iterations: 4096 })
  const emojiExpected = h(pbkdf2Sync('pw-🔒-🗝️', 'salt-x', 4096, PBKDF2_KEY_BYTES, 'sha256'))
  assert.equal(emoji, emojiExpected)
})

// ============================================================
// 七、异常输入
// ============================================================

test('空密码或空盐一律抛错（不静默算出一个"看起来正常"的结果）', async () => {
  await assert.rejects(() => deriveVerifier('', 'salt'), /密码不能为空/)
  await assert.rejects(() => deriveVerifier('pw', ''), /盐不能为空/)
  await assert.rejects(() => deriveVerifier(null, 'salt'), /密码不能为空/)
  await assert.rejects(() => deriveVerifier('pw', undefined), /盐不能为空/)
})

test('当前运行环境支持 crypto.subtle（Node 与浏览器都应支持）', () => {
  assert.equal(isKdfAvailable(), true, 'Node 18+ 应有全局 crypto.subtle')
})
