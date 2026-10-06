import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import test from 'node:test'

import {
  emailLookupHash,
  generateNumericCode,
  generateSessionToken,
  hmacHex,
  isDisposableEmail,
  isPlausibleEmail,
  normalizeEmail,
  passwordSalt,
  pepperHash,
  sha256Hex,
  timingSafeEqualHex,
  toHex
} from '../../src/utils/authCrypto.js'

/**
 * 账号体系密码学工具的守护测试。
 *
 * 重点守三件事：
 * 1. **与 Node 的 OpenSSL 实现一致** —— 这些哈希/ HMAC 是两端协议的一部分，
 *    实现跑偏会让"注册成功、之后永远登不上"；
 * 2. **域分隔确实生效** —— 公开的盐推不出入库的 email_hash（见下面专门的用例）；
 * 3. **随机数的质量** —— 验证码与会话令牌不能用可预测的伪随机。
 */

const SECRET = 'unit-test-salt-secret-0123456789'
const PEPPER = 'unit-test-pepper-abcdefghij'
const EMAIL = 'Player@Example.COM'

const nodeHmac = (key, msg) => createHmac('sha256', key).update(msg).digest('hex')
const nodeSha = (msg) => createHash('sha256').update(msg).digest('hex')

// ============================================================
// 一、与 Node 实现交叉验证
// ============================================================

test('hmacHex 与 Node 的 createHmac 逐字节一致', async () => {
  for (const [key, msg] of [
    ['k', 'm'],
    [SECRET, EMAIL],
    ['key', ''],
    ['a'.repeat(200), 'b'.repeat(200)],
    [SECRET, '中文与 emoji 🔒']
  ]) {
    assert.equal(await hmacHex(key, msg), nodeHmac(key, msg), `key=${key.slice(0, 8)}… msg=${msg.slice(0, 8)}…`)
  }
})

test('🔴 空密钥必须抛可读错误（真实场景 = 环境变量没配）', async () => {
  // WebCrypto 原生会抛 "DataError: Zero-length key is not supported"，
  // 那句话看不出"是哪个环境变量没配"。我们主动换成能直接指向原因的话。
  await assert.rejects(() => hmacHex('', 'm'), /密钥为空.*SALT_SECRET/)
  await assert.rejects(() => hmacHex(null, 'm'), /密钥为空/)
  await assert.rejects(() => hmacHex(undefined, 'm'), /密钥为空/)

  // 这一条守的是"fail-closed"：没配 pepper 时**必须报错**，
  // 绝不能静默算出一个看起来正常的哈希存进库。
  await assert.rejects(() => emailLookupHash(EMAIL, ''), /密钥为空/)
  await assert.rejects(() => passwordSalt(EMAIL, ''), /密钥为空/)
  await assert.rejects(() => pepperHash('x', ''), /密钥为空/)
})

test('sha256Hex 与 Node 的 createHash 逐字节一致', async () => {
  for (const msg of ['', 'abc', '中文', '🔒'.repeat(10), 'x'.repeat(1000)]) {
    assert.equal(await sha256Hex(msg), nodeSha(msg))
  }
})

test('emailLookupHash / passwordSalt / pepperHash 都与 Node 一致', async () => {
  assert.equal(await emailLookupHash(EMAIL, SECRET), nodeHmac(SECRET, 'lookup:player@example.com'))
  assert.equal(await passwordSalt(EMAIL, SECRET), nodeHmac(SECRET, 'salt:player@example.com'))
  assert.equal(await pepperHash('abc123', PEPPER), nodeHmac(PEPPER, 'abc123'))
})

// ============================================================
// 二、域分隔（这条守的是"公开的盐推不出入库哈希"）
// ============================================================

test('🔴 盐与 email_hash 必须不同（域分隔生效）', async () => {
  const lookup = await emailLookupHash(EMAIL, SECRET)
  const salt = await passwordSalt(EMAIL, SECRET)

  assert.notEqual(lookup, salt, '盐与 email_hash 相等 —— 域分隔没生效，公开接口会泄漏 email_hash')

  // 再证一层：裸 HMAC(secret, email)（无前缀）与两者都不同
  const naked = nodeHmac(SECRET, 'player@example.com')
  assert.notEqual(lookup, naked)
  assert.notEqual(salt, naked)

  // 而且盐确实等于"带 salt: 前缀"的那个
  assert.equal(salt, nodeHmac(SECRET, 'salt:player@example.com'))
  assert.equal(lookup, nodeHmac(SECRET, 'lookup:player@example.com'))
})

test('同一邮箱大小写/空格不同，得到的哈希与盐相同（规范化生效）', async () => {
  const variants = ['Player@Example.COM', '  player@example.com  ', 'PLAYER@EXAMPLE.COM']
  const hashes = await Promise.all(variants.map((e) => emailLookupHash(e, SECRET)))
  const salts = await Promise.all(variants.map((e) => passwordSalt(e, SECRET)))
  assert.equal(new Set(hashes).size, 1)
  assert.equal(new Set(salts).size, 1)
})

test('不同邮箱得到不同哈希与盐', async () => {
  const a = await emailLookupHash('a@x.com', SECRET)
  const b = await emailLookupHash('b@x.com', SECRET)
  assert.notEqual(a, b)
})

test('换 SALT_SECRET 会让哈希与盐都变（这正是"绝不能改"的原因）', async () => {
  const h1 = await emailLookupHash(EMAIL, SECRET)
  const h2 = await emailLookupHash(EMAIL, SECRET + '-changed')
  const s1 = await passwordSalt(EMAIL, SECRET)
  const s2 = await passwordSalt(EMAIL, SECRET + '-changed')
  assert.notEqual(h1, h2)
  assert.notEqual(s1, s2)
})

// ============================================================
// 三、邮箱规范化与格式校验
// ============================================================

test('normalizeEmail 只做小写与去空格，不做服务商特有规则', () => {
  assert.equal(normalizeEmail('  A@B.COM '), 'a@b.com')
  // ⚠️ Gmail 的点号**刻意不归一**：归一了会把两个不同邮箱判成同一个
  assert.equal(normalizeEmail('a.b@gmail.com'), 'a.b@gmail.com')
  assert.notEqual(normalizeEmail('a.b@gmail.com'), normalizeEmail('ab@gmail.com'))
  // +tag 同样保留
  assert.equal(normalizeEmail('a+tag@x.com'), 'a+tag@x.com')
  assert.equal(normalizeEmail(null), '')
  assert.equal(normalizeEmail(undefined), '')
})

test('isPlausibleEmail 挡住明显不是邮箱的输入', () => {
  for (const good of [
    'a@b.co',
    'player@example.com',
    'a.b+tag@sub.domain.cn',
    'x@qq.com',
    'verylongbutvalid@some-company.com.cn'
  ]) {
    assert.equal(isPlausibleEmail(good), true, `应通过：${good}`)
  }
  for (const badInput of [
    '', 'abc', 'a@b', '@b.com', 'a@.com', 'a@b.', 'a b@c.com', 'a@@b.com', 'a@b .com'
  ]) {
    assert.equal(isPlausibleEmail(badInput), false, `应拒绝：${JSON.stringify(badInput)}`)
  }
})

// ============================================================
// 四、验证码生成
// ============================================================

test('generateNumericCode 产出指定位数的纯数字', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateNumericCode(6)
    assert.match(code, /^[0-9]{6}$/, `第 ${i} 次得到 ${code}`)
  }
  assert.match(generateNumericCode(4), /^[0-9]{4}$/)
})

test('generateNumericCode 的取值覆盖到两端（含前导零）', () => {
  // 2000 次采样：应当既出现小值（含 0 开头的），也出现大值。
  // 这能顺带发现"忘了 padStart 导致位数不足"这类错误。
  let minSeen = 10 ** 6
  let maxSeen = -1
  const zeros = []
  for (let i = 0; i < 2000; i++) {
    const n = Number(generateNumericCode(6))
    if (n < minSeen) minSeen = n
    if (n > maxSeen) maxSeen = n
    if (n < 100000) zeros.push(n)
  }
  assert.ok(minSeen < 100000, `没见过小于 100000 的取值（min=${minSeen}）`)
  assert.ok(maxSeen > 900000, `没见过大于 900000 的取值（max=${maxSeen}）`)
  assert.ok(zeros.length > 5, `前导零样本太少（${zeros.length} 个 / 2000）`)
})

test('generateNumericCode 连续两次相同的概率极低', () => {
  let same = 0
  for (let i = 0; i < 100; i++) {
    if (generateNumericCode(6) === generateNumericCode(6)) same++
  }
  assert.ok(same <= 1, `100 组里撞了 ${same} 次，随机性可疑`)
})

test('generateSessionToken 是 64 位 hex 且不重复', () => {
  const seen = new Set()
  for (let i = 0; i < 300; i++) {
    const t = generateSessionToken()
    assert.match(t, /^[0-9a-f]{64}$/)
    assert.equal(seen.has(t), false, '会话令牌出现重复')
    seen.add(t)
  }
})

// ============================================================
// 五、恒定时间比较
// ============================================================

test('timingSafeEqualHex 判等正确', () => {
  assert.equal(timingSafeEqualHex('abcd', 'abcd'), true)
  assert.equal(timingSafeEqualHex('abcd', 'abce'), false)
  assert.equal(timingSafeEqualHex('abcd', 'abc'), false, '长度不同必须判否')
  assert.equal(timingSafeEqualHex('', ''), true)
  assert.equal(timingSafeEqualHex(null, 'a'), false)
  assert.equal(timingSafeEqualHex('a', undefined), false)
})

// ============================================================
// 六、一次性邮箱黑名单
// ============================================================

test('isDisposableEmail 命中精确域名与子域', () => {
  const list = ['mailinator.com', '10minutemail.com', 'temp-mail.org']
  assert.equal(isDisposableEmail('a@mailinator.com', list), true)
  assert.equal(isDisposableEmail('a@MAILINATOR.com', list), true, '大小写不敏感')
  assert.equal(isDisposableEmail('a@sub.mailinator.com', list), true, '子域也算')
  assert.equal(isDisposableEmail('a@qq.com', list), false)
  assert.equal(isDisposableEmail('a@notmailinator.com', list), false, '不能后缀误伤')
  assert.equal(isDisposableEmail('bogus', list), false)
  assert.equal(isDisposableEmail('a@x.com', new Set(['x.com'])), true, '支持 Set 入参')
  assert.equal(isDisposableEmail('a@x.com', []), false)
})

// ============================================================
// 七、工具函数
// ============================================================

test('toHex 补齐到两位', () => {
  assert.equal(toHex(new Uint8Array([0, 1, 15, 16, 255])), '00010f10ff')
  assert.equal(toHex(new Uint8Array([])), '')
})
