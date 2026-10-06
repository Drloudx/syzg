import { pbkdf2Sync } from 'node:crypto'
import { expect, test } from '@playwright/test'

/**
 * KDF 跨端一致性验证 —— **这是整个账号体系唯一的风险点。**
 *
 * ## 验的是什么
 *
 * 用户在**浏览器**注册、在**手机 App** 登录、服务端只比对哈希。
 * 所以同一个 `(password, salt, iters)` 在
 * **浏览器 WebCrypto** 与 **Node 的 OpenSSL** 上必须算出**逐字节相同**的 verifier。
 *
 * 如果两端不一致，症状是：**注册能成功，但之后永远登录失败**，
 * 而且没有任何报错、日志里也看不出原因。所以这件事必须在写业务代码之前钉死。
 *
 * ## 为什么用 Playwright，而不是在 Node 里 mock 一个 crypto
 *
 * 因为要验的**恰恰是"真浏览器的 WebCrypto"**。在 Node 里 mock 一个
 * `crypto.subtle` 只是把我们的假设又实现了一遍，什么也证明不了。
 *
 * ## 期望值从哪来
 *
 * 期望值用 **`node:crypto` 的 `pbkdf2Sync`（OpenSSL/BoringSSL 实现）** 现算 ——
 * 它与浏览器的 WebCrypto 是**两套完全独立的实现**，不是同一份代码跑两遍。
 *
 * 这样三方形成闭环：
 * ```
 *   浏览器 WebCrypto  ←→  本测试  ←→  Node OpenSSL
 * ```
 * 加上 `tests/unit/password-kdf.test.mjs` 里硬编码的金标准向量，
 * 任何一端跑偏都会立刻红。
 */

const h = (buf) => Buffer.from(buf).toString('hex')

/** 与单测里同一个金标准输入，便于交叉定位。 */
const GOLDEN_PASSWORD = 'correct horse battery staple'
const GOLDEN_SALT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const GOLDEN_VERIFIER = '842507c5a7e19223eac863e592c9e1d54b585c9d340cc67acdae583b2f366c98'

const MODULE_PATH = '/src/utils/passwordKdf.js'

/**
 * 在真浏览器里加载项目模块并派生 verifier。
 *
 * `page.evaluate` 里用**动态 import** 拉 Vite 提供的源码模块
 * （开发服务器会把 `import '../config/auth.js'` 一起解析好），
 * 所以跑的**就是生产要跑的那份代码**，不是复制粘贴的副本。
 */
async function browserDerive(page, password, salt, iterations) {
  return page.evaluate(
    async ({ modulePath, pw, s, iters }) => {
      const mod = await import(/* @vite-ignore */ modulePath)
      const options = iters === undefined ? {} : { iterations: iters }
      return mod.deriveVerifier(pw, s, options)
    },
    { modulePath: MODULE_PATH, pw: password, s: salt, iters: iterations }
  )
}

test('浏览器里 crypto.subtle 可用，且模块能正常加载', async ({ page }) => {
  await page.goto('/')

  const probe = await page.evaluate(async ({ modulePath }) => {
    const mod = await import(/* @vite-ignore */ modulePath)
    return {
      hasSubtle: typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
      isSecureContext: window.isSecureContext,
      kdfAvailable: mod.isKdfAvailable(),
      protocol: mod.KDF_PROTOCOL
    }
  }, { modulePath: MODULE_PATH })

  expect(probe.hasSubtle).toBe(true)
  expect(probe.isSecureContext).toBe(true)
  expect(probe.kdfAvailable).toBe(true)
  expect(probe.protocol.iterations).toBe(600000)
  expect(probe.protocol.hash).toBe('SHA-256')
  expect(probe.protocol.keyBytes).toBe(32)
  expect(probe.protocol.saltEncoding).toBe('utf8-of-hex-string')
})

test('低轮数：浏览器 WebCrypto 与 Node OpenSSL 逐字节一致', async ({ page }) => {
  await page.goto('/')

  // 低轮数先把"算法与编码"这层对齐；生产轮数由下一条守。
  for (const iterations of [1, 2, 4096, 10000]) {
    const actual = await browserDerive(page, GOLDEN_PASSWORD, GOLDEN_SALT, iterations)
    const expected = h(pbkdf2Sync(GOLDEN_PASSWORD, GOLDEN_SALT, iterations, 32, 'sha256'))
    expect(actual, `iterations=${iterations} 时浏览器与 Node 不一致`).toBe(expected)
  }
})

test('生产轮数（600000）：浏览器与 Node 逐字节一致，且命中金标准向量', async ({ page }) => {
  await page.goto('/')

  const started = Date.now()
  const actual = await browserDerive(page, GOLDEN_PASSWORD, GOLDEN_SALT, undefined)
  const elapsed = Date.now() - started

  const nodeValue = h(pbkdf2Sync(GOLDEN_PASSWORD, GOLDEN_SALT, 600000, 32, 'sha256'))
  expect(actual, '浏览器与 Node 在生产轮数下不一致').toBe(nodeValue)
  expect(actual, '浏览器结果与单测里的金标准向量不一致').toBe(GOLDEN_VERIFIER)

  // 输出格式：64 位小写 hex
  expect(actual).toHaveLength(64)
  expect(actual).toMatch(/^[0-9a-f]{64}$/)

  // 记录耗时（桌面 Chrome，仅供参考；低端安卓要另测）
  console.log(`[kdf] 桌面 Chrome @ 600k 轮：${elapsed}ms（含一次模块加载）`)
})

test('浏览器端对 Unicode 密码的处理与 Node 一致', async ({ page }) => {
  await page.goto('/')

  // 中文与 emoji 是真实场景（用户很可能这么设密码）。
  // 两端都用 UTF-8 编码，这里验证浏览器侧确实如此。
  for (const pw of ['我的密码很简单', 'pw-🔒-🗝️', 'a'.repeat(200)]) {
    const actual = await browserDerive(page, pw, GOLDEN_SALT, 4096)
    const expected = h(pbkdf2Sync(pw, GOLDEN_SALT, 4096, 32, 'sha256'))
    expect(actual, `密码 ${JSON.stringify(pw.slice(0, 12))} 两端不一致`).toBe(expected)
  }
})

test('浏览器端：换盐即换结果，确定性成立', async ({ page }) => {
  await page.goto('/')

  const a = await browserDerive(page, 'pw-x', 'salt-a', 4096)
  const b = await browserDerive(page, 'pw-x', 'salt-a', 4096)
  const c = await browserDerive(page, 'pw-x', 'salt-b', 4096)

  expect(a).toBe(b)
  expect(a).not.toBe(c)
})
