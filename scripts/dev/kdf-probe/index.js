/**
 * KDF 平台上限探针（诊断用，见同目录 README.md）
 *
 * 背景（已核实，出处见 README）：
 *   1. Workers 免费版 CPU = 10ms/请求；付费版默认 30s。
 *   2. PBKDF2 的 CPU 开销**计入** CPU 时间——Cloudflare 运行时负责人的原话是
 *      "our CPU time-limiting code cannot interrupt BoringSSL in the middle of running PBKDF,
 *       so we have to limit the iterations upfront"（cloudflare/workerd#1346）。
 *      所以生产 PBKDF2 迭代数被**入口封顶**在 100,000，超了直接报错、不是跑慢。
 *   3. scrypt 同样封顶：N × r × p ≤ 1,048,576。
 *   4. 本项目 `compatibility_date = 2026-09-01` ≥ 2026-08-04 → `nodejs_compat` 默认开启，
 *      而 `node:crypto` 除 `argon2` 外全部支持 → **scrypt 可用**。
 *
 * 用法：
 *   /?runs=5                          全部档位
 *   /?runs=5&pbkdf2=10000,100000      只测指定 PBKDF2 轮数
 *   /?runs=5&scrypt=16384,32768       只测指定 scrypt 的 N（r=8, p=1）
 */
import { scryptSync, pbkdf2Sync, randomBytes } from 'node:crypto'

const enc = new TextEncoder()

function timeIt(runs, fn) {
  fn() // 预热：不要让 JIT / 首次分配算进结果
  const t0 = performance.now()
  for (let i = 0; i < runs; i++) fn()
  return Number(((performance.now() - t0) / runs).toFixed(3))
}

function intList(raw, fallback) {
  const src = raw ? raw.split(',') : fallback
  const out = src.map((v) => Number.parseInt(String(v).trim(), 10)).filter((n) => Number.isFinite(n) && n > 0)
  return out.length ? out : fallback
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const runs = Math.max(1, Math.min(Number.parseInt(url.searchParams.get('runs') || '5', 10) || 5, 50))
    const pbkdfIters = intList(url.searchParams.get('pbkdf2'), [10000, 100000])
    const scryptNs = intList(url.searchParams.get('scrypt'), [1 << 14, 1 << 15, 1 << 16])

    const password = 'correct horse battery staple'
    const salt = randomBytes(16)
    const saltHex = salt.toString('hex')
    const rows = []

    // ── WebCrypto PBKDF2（评论接口现在唯一在用的原语，也是"服务端哈希"最可能的落点）──
    for (const iterations of pbkdfIters) {
      const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
      const params = { name: 'PBKDF2', salt: enc.encode(saltHex), iterations, hash: 'SHA-256' }
      await crypto.subtle.deriveBits(params, key, 256)
      const t0 = performance.now()
      for (let i = 0; i < runs; i++) await crypto.subtle.deriveBits(params, key, 256)
      rows.push({
        kdf: 'webcrypto pbkdf2-sha256',
        params: `iters=${iterations}`,
        avgMs: Number(((performance.now() - t0) / runs).toFixed(3))
      })
    }

    // ── node:crypto pbkdf2Sync：对照"同轮数、另一条实现路径" ──
    for (const iterations of pbkdfIters) {
      rows.push({
        kdf: 'node pbkdf2Sync-sha256',
        params: `iters=${iterations}`,
        avgMs: timeIt(runs, () => pbkdf2Sync(password, salt, iterations, 32, 'sha256'))
      })
    }

    // ── scrypt：内存硬（抗 GPU/ASIC），同 CPU 代价下强度高于 PBKDF2 ──
    for (const N of scryptNs) {
      const r = 8
      const p = 1
      const memBytes = 128 * N * r * p
      const cost = N * r * p
      try {
        rows.push({
          kdf: 'node scryptSync',
          params: `N=${N} r=${r} p=${p} cost=${cost} mem≈${Math.round(memBytes / 1048576)}MB`,
          avgMs: timeIt(runs, () => scryptSync(password, salt, 32, { N, r, p, maxmem: memBytes * 2 }))
        })
      } catch (err) {
        rows.push({
          kdf: 'node scryptSync',
          params: `N=${N} r=${r} p=${p} cost=${cost}`,
          avgMs: null,
          error: String(err && err.message).slice(0, 160)
        })
      }
    }

    // ── 基线：现网评论接口每个请求本来就要跑几次 SHA-256，用来判断 10ms 里还剩多少 ──
    const d0 = performance.now()
    for (let i = 0; i < 200; i++) await crypto.subtle.digest('SHA-256', enc.encode(`probe-${i}`))
    const digestMs = Number(((performance.now() - d0) / 200).toFixed(4))

    return new Response(
      JSON.stringify(
        {
          ok: true,
          runtime: 'workerd (wrangler dev)',
          caveat: '本地 workerd 已解除 PBKDF2 轮数默认上限；生产仍保留 100,000 与 scrypt cost 1,048,576 的封顶',
          sha256DigestAvgMs: digestMs,
          freePlanBudgetMs: 10,
          rows
        },
        null,
        2
      ),
      { headers: { 'content-type': 'application/json; charset=utf-8' } }
    )
  }
}
