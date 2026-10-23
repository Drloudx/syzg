const DEFAULT_TIMEOUT_MS = 8000

/**
 * `crypto.subtle` 是否存在。
 *
 * 🔴 **只在「安全上下文」可用**：HTTPS 或 localhost。若页面被以 `http://` 打开
 * （QQ / 微信内置浏览器从 http 链接进入时就是这种），`crypto.subtle` 是 `undefined`。
 *
 * 这不是「老浏览器」问题 —— **现代 Chrome 在 http 页面里同样没有 `crypto.subtle`**。
 * 所以外面必须开强制 HTTPS 跳转（EdgeOne `ForceRedirect`），这里只做兜底。
 */
function hasSubtleCrypto() {
  return typeof globalThis.crypto?.subtle?.digest === 'function'
}

export async function sha256(bytes) {
  if (!hasSubtleCrypto()) throw new Error('Resource verification requires HTTPS')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function fetchJsonWithTimeout(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  expectedHash = '',
  validate,
  fetchImpl = (...args) => fetch(...args),
  digest = sha256,
  cache
} = {}) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`Resource request timed out: ${url}`))
    }, timeoutMs)
  })
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetchImpl(url, { signal: controller.signal, ...(cache ? { cache } : {}) })
      if (!response.ok) throw new Error(`Resource request failed (${response.status}): ${url}`)
      const bytes = await response.arrayBuffer()
      /*
       * 没有 `crypto.subtle`（http 页面）时**降级为不校验**，而不是让整个页面挂掉。
       *
       * 取舍：哈希校验防的是「CDN 返回了错版本/被篡改」；而缺 subtle 是「页面在 http 下打开」。
       * 后者若直接抛错，用户看到的是一整页「数据加载失败」——**比少一层校验更糟**。
       * 正常的 HTTPS 访问仍会走完整校验。
       */
      if (expectedHash && hasSubtleCrypto()) {
        if (await digest(bytes) !== expectedHash) {
          throw new Error(`Resource version mismatch: ${url}`)
        }
      }
      const data = JSON.parse(new TextDecoder().decode(bytes))
      if (validate && validate(data) === false) throw new Error(`Invalid resource data: ${url}`)
      return data
    })()])
  } finally {
    clearTimeout(timer)
  }
}

const withVersion = (url, version) => version
  ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`
  : url

const SHA256_HEX = /^[a-f0-9]{64}$/

export function createResourceClient({
  getBaseUrl = () => '',
  resolveLocalUrl = path => path,
  manifests = {},
  inlineHashes = {},
  isDev = false,
  fetchImpl,
  digest,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onFallback = () => {}
} = {}) {
  const resources = new Map()
  const manifestRequests = new Map()
  const enforceManifest = Object.keys(manifests).length > 0
  const readJson = (url, options = {}) => fetchJsonWithTimeout(url, { fetchImpl, digest, timeoutMs, ...options })

  /** 目录内所有文件共用一个 manifest；同目录的进行中请求合并，失败即从缓存移除以便重试。 */
  const manifestRequestFor = directory => {
    const descriptor = manifests[directory]
    if (!descriptor) return null
    if (!manifestRequests.has(directory)) {
      const request = readJson(resolveLocalUrl(descriptor.file), { expectedHash: descriptor.hash })
        .catch(error => { manifestRequests.delete(directory); throw error })
      manifestRequests.set(directory, request)
    }
    return manifestRequests.get(directory)
  }

  /**
   * 期望哈希。**先查内联表**——命中就不必读 manifest，省掉一个串行 RTT
   * （关键路径 `壳 → manifest → 数据` 变成 `壳 → 数据`）。
   * 未内联的目录仍按原样读 `assets/data-manifests/<目录>-*.json`。
   */
  const expectedHashFor = async path => {
    const inline = inlineHashes[path]
    if (typeof inline === 'string' && SHA256_HEX.test(inline)) return inline
    const directory = path.slice(0, path.lastIndexOf('/') + 1)
    if (!manifests[directory]) {
      if (enforceManifest && path !== 'data/notice.json') throw new Error(`Resource is missing from this build: ${path}`)
      return ''
    }
    const manifest = await manifestRequestFor(directory)
    const hash = manifest?.[decodeURI(path)]
    if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) {
      throw new Error(`Resource is missing from this build: ${path}`)
    }
    return hash
  }

  /**
   * 预热某目录的 manifest（不 await、失败静默）。
   *
   * 未内联的目录（副本详情 / 关卡详情 / 任务剧情）只在用户**点开某个详情**时才取数据，
   * 而取数据前必须先读 manifest —— 那次点击会白等一个 RTT。页面挂载时先预热，
   * 这个往返就与用户阅读列表的时间重叠掉了。
   *
   * 刻意**不在启动时预取全部 manifest**：`data/dialogs/`(50.7 KB) 与
   * `data/taskDialogs/`(97 KB) 加起来 148 KB，而冷启动未必会用到它们；
   * 按页面意图预热才能既不浪费字节、又藏掉 RTT。
   *
   * 失败不缓存：`manifestRequestFor` 的 catch 已把条目删除，真正需要时会重新取。
   * 这里额外吞一次 rejection，避免"预热失败"变成 unhandledrejection。
   */
  const prefetchManifest = relativePath => {
    const path = String(relativePath || '').replace(/^\/+/, '')
    const directory = path.slice(0, path.lastIndexOf('/') + 1)
    if (!directory) return
    const inline = inlineHashes[path]
    if (typeof inline === 'string' && SHA256_HEX.test(inline)) return
    manifestRequestFor(directory)?.catch(() => {})
  }

  function fetchResource(relativePath, { validate, cache = true } = {}) {
    const path = String(relativePath || '').replace(/^\/+/, '')
    if (!path || path.includes('://') || path.split('/').includes('..')) {
      return Promise.reject(new Error('Invalid resource path'))
    }
    const cacheable = cache && path !== 'data/notice.json'
    let request = cacheable ? resources.get(path) : null
    if (!request) {
      request = (async () => {
        const expectedHash = await expectedHashFor(path)
        const version = isDev ? String(Date.now()) : expectedHash
        const localUrl = withVersion(resolveLocalUrl(path), version)
        const baseUrl = getBaseUrl()
        const remoteUrl = baseUrl ? withVersion(`${baseUrl.replace(/\/$/, '')}/${path}`, version) : ''
        if (remoteUrl) {
          try {
            return await readJson(remoteUrl, { expectedHash, validate })
          } catch (error) {
            onFallback(path, error)
          }
        }
        return readJson(localUrl, { expectedHash, validate })
      })().catch(error => {
        if (resources.get(path) === request) resources.delete(path)
        throw error
      })
      if (cacheable) resources.set(path, request)
      return request
    }
    if (!validate) return request
    return request.then(data => {
      if (validate(data) === false) throw new Error(`Invalid resource data: ${path}`)
      return data
    }).catch(error => {
      if (resources.get(path) === request) resources.delete(path)
      throw error
    })
  }

  return { fetchResource, prefetchManifest }
}

export function createCachedLoader(load) {
  let pending = null
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(load).catch(error => {
        pending = null
        throw error
      })
    }
    return pending
  }
}
