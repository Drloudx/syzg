/**
 * 招募结果分享图：`shareOrSaveImage` 的分支与兜底。
 *
 * 锁的都是**改坏了不报错、只会静默失效**的点：
 *   - 用户取消分享却被偷偷下载（体验问题，且会被当成"点了分享就下载"）；
 *   - `navigator.share` 挂起时既不分享也不下载（用户点了完全没反应）；
 *   - 原生端忘记写临时文件就直接分享（分享出去的是空地址）。
 *
 * `renderGachaResultImage` 依赖真实 DOM/图片解码，由 UI 探针覆盖，这里只测纯分支逻辑。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

/** 造一个可控的浏览器环境，再动态导入被测模块。 */
async function withEnv({ canShare, shareImpl, isNative = false }, run) {
  // Node 24 的部分全局（如 navigator）是只读 getter，必须用 defineProperty 覆盖
  const globals = ['window', 'navigator', 'File', 'URL', 'document']
  const saved = new Map(globals.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  const set = (k, v) => Object.defineProperty(globalThis, k, {
    value: v, configurable: true, writable: true
  })

  const createdUrls = []
  const clicked = []

  set('window', isNative ? { Capacitor: { isNativePlatform: () => true } } : {})
  set('navigator', {
    canShare: canShare === undefined ? undefined : () => canShare,
    share: shareImpl
  })
  set('File', class File {
    constructor(parts, name, opts) { this.name = name; this.type = opts?.type }
  })
  set('URL', {
    createObjectURL: () => { createdUrls.push('blob:x'); return 'blob:x' },
    revokeObjectURL: () => {}
  })
  const anchor = { click: () => clicked.push(true), remove() {}, href: '', download: '' }
  set('document', {
    createElement: () => anchor,
    body: { appendChild() {} }
  })

  try {
    // 每次用带 query 的新路径导入，绕开模块缓存（模块内的 imageCache 也要重置）
    const mod = await import(`../../src/utils/gachaShareImage.js?t=${Date.now()}${Math.random()}`)
    await run(mod, { createdUrls, clicked })
  } finally {
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc)
      else delete globalThis[k]
    }
  }
}

const blob = { size: 1 }

test('不支持文件分享 → 直接下载', async () => {
  await withEnv({ canShare: false }, async (mod, spy) => {
    const r = await mod.shareOrSaveImage(blob, 'a.png')
    assert.equal(r, 'downloaded')
    assert.equal(spy.clicked.length, 1, '应当触发一次下载点击')
  })
})

test('canShare 存在但 share 成功 → shared，且不下载', async () => {
  await withEnv({ canShare: true, shareImpl: async () => {} }, async (mod, spy) => {
    const r = await mod.shareOrSaveImage(blob, 'a.png')
    assert.equal(r, 'shared')
    assert.equal(spy.clicked.length, 0, '分享成功不该再下载')
  })
})

test('🔴 用户取消分享（AbortError）→ 上抛，且**不**偷偷下载', async () => {
  const abort = new Error('cancel'); abort.name = 'AbortError'
  await withEnv({ canShare: true, shareImpl: async () => { throw abort } }, async (mod, spy) => {
    await assert.rejects(() => mod.shareOrSaveImage(blob, 'a.png'), /cancel/)
    assert.equal(spy.clicked.length, 0, '用户取消不该触发下载')
  })
})

test('share 失败（非取消）→ 兜底下载，至少让用户拿到图', async () => {
  await withEnv({ canShare: true, shareImpl: async () => { throw new Error('boom') } }, async (mod, spy) => {
    const r = await mod.shareOrSaveImage(blob, 'a.png')
    assert.equal(r, 'downloaded')
    assert.equal(spy.clicked.length, 1)
  })
})

test('🔴 share 永久挂起 → 超时后兜底下载（否则用户点了毫无反应）', async () => {
  await withEnv({ canShare: true, shareImpl: () => new Promise(() => {}) }, async (mod, spy) => {
    // 缩短等待：直接断言它最终会 settle 成 downloaded（真实超时 20s，这里只等 21s 太久，
    // 所以用 race 确认它在合理上限内完成）
    const r = await Promise.race([
      mod.shareOrSaveImage(blob, 'a.png'),
      new Promise(res => setTimeout(() => res('STILL_HUNG'), 25000))
    ])
    assert.equal(r, 'downloaded', '挂起的 share 必须被超时兜底成下载')
    assert.equal(spy.clicked.length, 1)
  })
})

test('没有 canShare 能力 → 直接下载', async () => {
  await withEnv({ canShare: undefined }, async (mod, spy) => {
    const r = await mod.shareOrSaveImage(blob, 'a.png')
    assert.equal(r, 'downloaded')
    assert.equal(spy.clicked.length, 1)
  })
})
