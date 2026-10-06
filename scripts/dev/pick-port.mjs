/**
 * 挑一个**能真正 bind 的**端口并打印出来（只打印端口号，便于 `execFileSync` 取值）。
 *
 * ## 为什么需要它（以及为什么不能用固定端口）
 *
 * `playwright.config.js` 原本把 Vite 钉在 4174。某天开始稳定报：
 *
 *     Error: listen EACCES: permission denied 127.0.0.1:4174
 *
 * 查了半天：端口没在 LISTEN、也不在 Windows 的保留段里，
 * 但被 **`FlClashCore`（代理软件）** 以 `Bound` 状态占着 —— 它会随机 bind
 * 一大批端口做转发。**它占哪些端口是动态的**，所以"换个固定端口"只是把问题
 * 推迟到下一次，而且再撞上时报错依然看不出原因。
 *
 * ## 🔴 为什么必须**缓存**（第一版在这里栽了）
 *
 * 第一版每次都现探测。结果跑完整套测试时，**一部分用例连 4174、一部分连 4175**，
 * 大片 `ERR_CONNECTION_REFUSED`。
 *
 * 因为 **Playwright 会在每个 worker 进程里各自求值一次配置文件** ——
 * 每个进程探测到的空闲端口未必相同（第一个进程先起了 Vite 把 4174 占了，
 * 后求值的进程就顺延到 4175）。
 *
 * 所以端口必须**跨进程一致**：把结果写进一个缓存文件，后来的进程直接复用。
 * 复用规则（兼顾"跨进程一致"与"上次跑剩的缓存不能用"）：
 *
 *   1. 缓存文件存在，且**足够新**（< TTL）→ 直接用；
 *   2. 缓存有点旧，但那个端口**正在监听**（多半就是我们这次起的 Vite）→ 用；
 *   3. 否则（缓存过期且端口没人听）→ 重新探测并覆盖缓存。
 *
 * 用法：
 *   node scripts/dev/pick-port.mjs 4174 --cache .playwright-vite-port
 */

import { createServer, Socket } from 'node:net'
import { readFileSync, statSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const preferred = Number.parseInt(args[0] || '4174', 10)

function argValue(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const cacheFile = argValue('--cache', '')
const ttlSec = Number.parseInt(argValue('--ttl-seconds', '600'), 10)
const SPAN = 200

/**
 * 试着独占绑定一个端口；能绑就立刻释放并返回 true。
 *
 * 绑 **`0.0.0.0`** 而不是 `127.0.0.1` —— 这是**故意更严**：
 * Clash 占端口时绑的是 `0.0.0.0`（且带 `SO_EXCLUSIVEADDRUSE`，Windows 给
 * `EACCES`）；而普通进程占着 `0.0.0.0` 时，**绑回环反而可能成功**
 * （实测：Node 占 0.0.0.0:4174 后，子进程绑 127.0.0.1:4174 成功了）。
 * 绑 `0.0.0.0` 两种情况都会失败，判据更可靠。
 */
function canBind(port) {
  return new Promise((resolve) => {
    const s = createServer()
    const done = (ok) => {
      s.removeAllListeners()
      try {
        s.close()
      } catch {
        /* 没在监听，忽略 */
      }
      resolve(ok)
    }
    s.once('error', () => done(false))
    s.once('listening', () => done(true))
    s.listen(port, '0.0.0.0')
  })
}

/** 端口上有没有人在监听（用于判断"缓存里的端口是不是我们刚起的那个服务"） */
function isListening(port) {
  return new Promise((resolve) => {
    const sock = new Socket()
    const done = (ok) => {
      sock.removeAllListeners()
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(400)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
    sock.connect(port, '127.0.0.1')
  })
}

function readCache() {
  if (!cacheFile) return null
  try {
    const raw = readFileSync(cacheFile, 'utf8').trim()
    const port = Number.parseInt(raw, 10)
    if (!Number.isFinite(port) || port <= 0) return null
    const ageSec = (Date.now() - statSync(cacheFile).mtimeMs) / 1000
    return { port, ageSec }
  } catch {
    return null
  }
}

function writeCache(port) {
  if (!cacheFile) return
  try {
    writeFileSync(cacheFile, String(port), 'utf8')
  } catch {
    /* 写不了就算了：最坏情况是各进程各自探测（本次失败模式），不影响正确性 */
  }
}

async function pick() {
  const cached = readCache()
  if (cached) {
    if (cached.ageSec < ttlSec) return cached.port
    if (await isListening(cached.port)) return cached.port
  }
  for (let p = preferred; p < preferred + SPAN; p++) {
    if (await canBind(p)) {
      writeCache(p)
      return p
    }
  }
  return null
}

const port = await pick()
if (port == null) {
  console.error(`  ❌ ${preferred}~${preferred + SPAN - 1} 之间没有可绑的端口`)
  process.exit(1)
}
// ⚠️ 只输出端口号本身：调用方 `execFileSync(...).trim()` 直接拿来用
process.stdout.write(String(port))
