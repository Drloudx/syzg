import { execFileSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'

/**
 * Vite 的端口**动态挑**，不写死，而且**跨进程缓存**。
 *
 * 🔴 起因：原本钉在 4174，某天开始稳定报
 * `listen EACCES: permission denied 127.0.0.1:4174`。
 * 端口没在 LISTEN、也不在 Windows 保留段里 —— 是被 **`FlClashCore`（代理软件）**
 * 以 `Bound` 状态占着（它随机 bind 一大批端口做转发），而**占哪些是动态的**。
 *
 * 🔴 更关键的坑：**Playwright 会在每个 worker 进程里重新求值一次本文件**。
 * 第一版每次都现探测，于是同一次运行里一部分用例连 4174、一部分连 4175，
 * 大片 `ERR_CONNECTION_REFUSED`。所以结果必须落盘共享 ——
 * 复用规则见 `scripts/dev/pick-port.mjs` 的注释。
 */
function pickPort(preferred) {
  try {
    const out = execFileSync(
      process.execPath,
      ['scripts/dev/pick-port.mjs', String(preferred), '--cache', '.playwright-vite-port'],
      { encoding: 'utf8' }
    )
    return Number.parseInt(out.trim(), 10)
  } catch {
    // 挑不出来就退回首选端口，让 Playwright 报出原始错误（比在这里吞掉好）
    return preferred
  }
}

const VITE_PORT = process.env.PLAYWRIGHT_VITE_PORT
  ? Number(process.env.PLAYWRIGHT_VITE_PORT)
  : pickPort(4174)

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  /*
   * 🔴 **必须限制并发**，不能让它按 CPU 核数自己决定。
   *
   * 这台机器 `cpus/2` = **8 个 worker**，于是跑全量（272 条）时会：
   *
   *   · 8 个浏览器同时打同一个 **单进程 `wrangler dev`**（8788）；
   *   · 每个账号类用例还要走「取人机验证 → 发码 → 注册 → 登录」四五个来回，
   *     而本地 D1 是**一个 SQLite 文件**，并发写会互相排队；
   *   · 结果是**大面积 `Test timeout of 45000ms exceeded`、`ECONNRESET`、
   *     `/api/recent` 请求失败** —— 而且失败的是**互不相干的一堆 spec**，
   *     看起来像"到处都坏了"，实际只是把本地 dev 服务压死了。
   *
   * 这个坑很费时间：会让人以为是自己的改动弄坏了别人的测试，去挨个查
   * 那些**根本没碰过**的 spec。实测 **2 个 worker 稳定全绿**。
   *
   * 需要更快时用环境变量显式覆盖（并自己承担压垮 dev 服务的风险）：
   *   PLAYWRIGHT_WORKERS=4 npx playwright test
   */
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 2,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${VITE_PORT}`,
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } }
    }
  ],
  /*
   * 两个 webServer：
   *   1. Vite（4174）—— 前端；
   *   2. `wrangler pages dev`（8788）—— `/api/*`，Vite 的 proxy 会转发过去。
   *
   * 为什么要连 API 一起起：账号体系的 UI 测试（tests/ui/account-modal.spec.js）
   * 必须真的注册一个账号，登录/发码/人机验证全都要打接口。之前只起 Vite 的话
   * `/api/*` 会被代理到没人监听的 8788，表现为 502 —— 那种失败很难一眼看出原因。
   *
   * `reuseExistingServer` 保留 true：本地开发时 8788 上往往已经跑着一个 API 服务，
   * 复用它比让 Playwright 再抢一个端口更省事（也避免与手工调试的服务打架）。
   */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command: `npm run dev -- --host 127.0.0.1 --port ${VITE_PORT} --strictPort`,
          url: `http://127.0.0.1:${VITE_PORT}`,
          reuseExistingServer: false,
          timeout: 120_000
        },
        {
          // check-port 会先确认端口空闲；wrangler 没有 strictPort，被占时会静默换端口
          command: 'npm run dev:api',
          url: 'http://127.0.0.1:8788/api/health',
          reuseExistingServer: true,
          timeout: 120_000
        }
      ]
})
