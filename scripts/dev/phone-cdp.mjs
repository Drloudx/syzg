/**
 * 真机 Chrome 驱动（CDP over adb）—— 开发工具。
 *
 * ## 为什么需要它
 *
 * MIUI 把 `adb shell input tap` / `input keyevent` 都拦了
 * （`SecurityException: INJECT_EVENTS`），所以**没法用 adb 模拟触摸**。
 * 但 Chrome 自己的调试协议（CDP）不受这个限制 —— 它能派发**真实触摸事件**，
 * 也能在页面里执行 JS、读 DOM、截图。于是真机 UI 验证这条路才走得通。
 *
 * ## 用法
 *
 * 前置（每次插拔后都要重做）：
 *   adb -s <设备> forward tcp:9222 localabstract:chrome_devtools_remote
 *
 *   node scripts/dev/phone-cdp.mjs targets
 *   node scripts/dev/phone-cdp.mjs eval  "<js 表达式>"  [url子串]
 *   node scripts/dev/phone-cdp.mjs tap   <x> <y> [x2 y2 ...]  [url子串]
 *   node scripts/dev/phone-cdp.mjs log   [url子串]
 *
 * `tap` 的坐标是 **CSS 像素**（不是物理像素）。手机上
 * `CSS 像素 = 物理像素 / devicePixelRatio`，脚本会自己换算提示。
 */

const PORT = Number(process.env.PHONE_CDP_PORT || 9222)

// ---------- 极简 CDP 客户端（Node 自带 WebSocket，不引第三方） ----------
//
// 导出给别的脚本复用：CLI 只覆盖了"看一眼 / 求个值 / 点一下"，
// 而真机全流程走查（注册 → 发评论）需要在一次连接里连续做十几步。
// 直接用 `import { Cdp, listTargets, pickTarget } from './phone-cdp.mjs'`。

export class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.id = 0
    this.pending = new Map()
    this.events = []
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl)
      this.ws = ws
      ws.addEventListener('open', () => resolve(this))
      ws.addEventListener('error', (e) => reject(new Error('WebSocket 失败: ' + (e.message || '未知'))))
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
        } else if (msg.method) {
          this.events.push(msg)
        }
      })
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      /*
       * 超时给到 60 秒（默认 20 秒不够）。
       *
       * 踩过的坑：本站首页是 `#/items`，首次加载要处理大量数据、
       * **主线程会被占住十几秒**，期间 `Runtime.evaluate` 一直不返回 ——
       * 表现是"连接正常、求值超时"，很容易误判成 CDP 坏了。
       */
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 超时: ${method}`))
        }
      }, 60_000)
    })
  }

  /**
   * 把本标签提到前台。
   *
   * 🔴 **驱动手机上的标签之前必须先调这个。**
   *
   * Chrome 会**冻结后台标签**：它的 CDP 连接照样能建、`/json/list` 里照样列出来，
   * 但 `Page.navigate` / `Runtime.evaluate` **永远不返回** —— 表现为
   * `CDP 超时: Page.navigate`，看起来像"CDP 坏了"或"手机没醒"。
   *
   * 实测踩到：手机上残留了上次调试留下的标签（`localhost:5173/scripts/dev/kdf-bench.html`
   * 等），而 `flow.mjs` 的选择器写的是 `localhost:5173`，我们**新开的**那个页面
   * 却是 `127.0.0.1:5173` —— 于是它挑中了一个**冻结的旧标签**，一上来就超时。
   *
   * 提前台之后就活了，不用手工去清标签。
   */
  async bringToFront() {
    return this.send('Page.bringToFront')
  }

  /**
   * 在页面里求值并拿回结果（表达式可以是 async，内层会 await）。
   * 复用者最常用的就是它，所以做成方法而不是让每人各写一遍。
   */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { return (${expression}); })()`,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails) {
      throw new Error('页面里报错: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    }
    return r.result?.value
  }

  /**
   * 派发一次**真实触摸**（touchStart + 短暂间隔 + touchEnd）。
   * 坐标是 CSS 像素，与 `getBoundingClientRect()` 同一坐标系。
   */
  async tap(x, y, { holdMs = 55, settleMs = 220 } = {}) {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }]
    })
    await new Promise((r) => setTimeout(r, holdMs))
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await new Promise((r) => setTimeout(r, settleMs))
  }

  /** 点一个选择器命中的元素（用真实触摸，不是 JS click）。返回是否找到。 */
  async tapSelector(selector) {
    const box = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    if (!box) return false
    await this.tap(box.x, box.y)
    return true
  }

  close() {
    try {
      this.ws?.close()
    } catch {
      /* 忽略 */
    }
  }
}

// ---------- 目标选取 ----------

export async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return res.json()
}

export function pickTarget(targets, filter) {
  const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!pages.length) throw new Error('没有可调试的页面 —— 手机上的 Chrome 是不是没开？')
  if (!filter) return pages[0]

  /*
   * 🔴 匹配要**同时认 127.0.0.1 与 localhost**。
   *
   * 踩过的坑：`flow.mjs` 传的是 `'localhost:5173'`，而它自己用
   * `am start -d http://127.0.0.1:5173/...` 打开的是 **127.0.0.1** ——
   * 两个串**互不包含**，于是 `find` 挑中了一个上次遗留的、**已冻结的**
   * 后台标签（`localhost:5173/scripts/dev/kdf-bench.html`），
   * 一上来就 `CDP 超时: Page.navigate`。
   *
   * 所以：带上 filter 时，把两种写法都当作命中；并且**优先选 URL 更"像站点本身"的**
   * （路径里没有 `/scripts/`、`/scratch/` 这类调试页）。
   */
  const norm = (u) => u.replace(/127\.0\.0\.1/g, 'localhost')
  const needle = norm(filter)
  const hits = pages.filter((t) => norm(t.url).includes(needle) || (t.title || '').includes(filter))
  if (!hits.length) {
    throw new Error(
      `没有匹配 "${filter}" 的页面。当前有：\n` + pages.map((t) => '  · ' + t.url).join('\n')
    )
  }
  const isSite = (t) => !/\/(scripts|scratch)\//.test(t.url)
  return hits.find(isSite) || hits[0]
}

/** 求值并返回 JSON 化的结果。委托给 `Cdp.eval`，避免与复用者各写一套实现。 */
function evaluate(cdp, expression) {
  return cdp.eval(expression)
}

// ---------- 主流程 ----------
//
// 只在**直接执行**这个文件时跑 CLI；被 `import` 时什么都不做（否则复用它的脚本
// 会连带触发一遍 CLI 解析，参数对不上就直接退出了）。

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`

if (isDirectRun) {
  const [cmd, ...rest] = process.argv.slice(2)
  main(cmd, rest).catch((err) => {
    console.error('  ❌ ' + err.message)
    process.exit(1)
  })
}

async function main(cmd, rest) {
  if (!cmd || cmd === 'help') {
    console.log(`
  真机 Chrome 驱动（CDP over adb）

  前置：adb -s <设备> forward tcp:9222 localabstract:chrome_devtools_remote

  node scripts/dev/phone-cdp.mjs targets
  node scripts/dev/phone-cdp.mjs eval  "<js>"  [url子串]
  node scripts/dev/phone-cdp.mjs tap   <x> <y> [x2 y2 ...]  [url子串]
  node scripts/dev/phone-cdp.mjs info  [url子串]
`)
    return
  }

  const targets = await listTargets()

  if (cmd === 'targets') {
    console.log(`  可调试页面 ${targets.filter((t) => t.type === 'page').length} 个：`)
    for (const t of targets.filter((t) => t.type === 'page')) {
      console.log(`    · ${t.title || '(无标题)'}`)
      console.log(`      ${t.url}`)
    }
    return
  }

  // 参数里最后一个不是纯坐标的字符串当作 url 过滤条件
  let filter = null
  let nums = rest
  if (cmd === 'eval') {
    filter = rest[1] || null
    nums = [rest[0]]
  } else if (cmd === 'tap') {
    const tail = rest[rest.length - 1]
    if (tail && Number.isNaN(Number(tail))) {
      filter = tail
      nums = rest.slice(0, -1)
    }
  } else if (cmd === 'info' || cmd === 'log') {
    filter = rest[0] || null
  }

  const target = pickTarget(targets, filter)
  const cdp = await new Cdp(target.webSocketDebuggerUrl).connect()

  try {
    if (cmd === 'info') {
      const info = await evaluate(
        cdp,
        `({
           url: location.href,
           title: document.title,
           dpr: devicePixelRatio,
           viewport: { w: innerWidth, h: innerHeight },
           scrollY: Math.round(scrollY)
         })`
      )
      console.log(JSON.stringify(info, null, 2))
      console.log(`\n  提示：CSS 像素 = 物理像素 / ${info.dpr}；当前视口 ${info.viewport.w}×${info.viewport.h} CSS px`)
      return
    }

    if (cmd === 'eval') {
      const out = await evaluate(cdp, nums[0])
      console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2))
      return
    }

    if (cmd === 'tap') {
      const coords = nums.map(Number)
      if (coords.length < 2 || coords.length % 2 !== 0) throw new Error('tap 需要成对的 x y')
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i]
        const y = coords[i + 1]
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }]
        })
        await new Promise((r) => setTimeout(r, 60))
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await new Promise((r) => setTimeout(r, 250))
        console.log(`  已触摸 (${x}, ${y})`)
      }
      return
    }

    if (cmd === 'log') {
      // 把已缓存的 console 事件打出来
      const logs = cdp.events.filter((e) => e.method === 'Runtime.consoleAPICalled')
      console.log(`  收到 ${logs.length} 条 console 事件`)
      for (const l of logs) {
        console.log('    ' + l.params.args.map((a) => a.value ?? a.description).join(' '))
      }
      return
    }

    throw new Error('未知命令: ' + cmd)
  } finally {
    cdp.close()
  }
}
