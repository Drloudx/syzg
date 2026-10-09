/**
 * 「最近使用」的表情（只服务黄豆页签，与 QQ / 微信一致）。
 *
 * 为什么单独一个文件、而不是写进 `config/emoticons.js`：
 * `functions/api/[[path]].js` 会 **import 那份目录表**的纯函数（字数统计等），
 * 在那里碰 `localStorage` 会让 Worker 直接崩。所以本机偏好只能留在前端。
 *
 * 为什么抽成纯函数：去重、上限、失效 key 过滤这三条**改坏了不会报错**，
 * 只会表现为"最近那栏少了几个 / 出现空白格"，必须能单测。
 */

/** 一行放得下的格数：面板 352px、列宽 minmax(36px,1fr)、gap 4px → 实测一行 7 个。 */
export const RECENT_MAX = 7

/**
 * 「最近使用」只收这一种表情（黄豆）。
 * 目录里 `kind` 的取值：`face`（黄豆）/ `sticker`（贴纸）。
 */
export const RECENT_KIND = 'face'

/** localStorage 键（与 `CommentComposer` 的 `myrzg:comment-send-mode` 同一命名空间）。 */
export const RECENT_STORAGE_KEY = 'myrzg:emoticon-recent'

/**
 * 把刚选的表情放到最前，去重并截到上限。**纯函数**，不改入参。
 * @param {string[]} list 现有顺序（新 → 旧）
 * @param {string} key 刚选的表情 key
 * @returns {string[]} 新顺序
 */
export function pushRecent(list, key) {
  if (!key) return Array.isArray(list) ? list.slice(0, RECENT_MAX) : []
  const rest = (Array.isArray(list) ? list : []).filter(item => item !== key)
  return [key, ...rest].slice(0, RECENT_MAX)
}

/**
 * 把存下来的 key 还原成目录里的表情项。
 *
 * **必须过滤掉目录里找不到的 key**：表情包被删、改名或换素材后，
 * 旧记录会指向不存在的项，不过滤就会在「最近使用」里渲染出空白格。
 *
 * **必须过滤掉非黄豆项**（`kind !== 'face'`）：贴纸不进「最近使用」（用户要求）。
 * 这条同时负责**老数据自愈** —— 早期版本（无 kind 判断）把贴纸写进过记录，
 * 只靠“写入时判断”修不回来，必须在**读/显示**这一层也拦一道。
 *
 * @param {string[]} keys 存下来的 key（新 → 旧）
 * @param {Map<string, object>|Array<{key:string}>} catalog 目录索引或目录数组
 * @param {{ kind?: string }} [options] 只保留该 kind（缺省不过滤）
 * @returns {object[]} 能用的表情项（保持传入顺序）
 */
export function resolveRecent(keys, catalog, options = {}) {
  if (!Array.isArray(keys) || !keys.length) return []
  const lookup = catalog instanceof Map
    ? catalog
    : new Map((catalog || []).map(item => [item.key, item]))
  const wantKind = options.kind
  const out = []
  for (const key of keys) {
    const item = lookup.get(key)
    if (!item) continue
    if (wantKind && item.kind !== wantKind) continue
    out.push(item)
    if (out.length >= RECENT_MAX) break
  }
  return out
}

/** 读本机记录。任何异常（隐私模式禁用存储 / 脏数据）都退化成"没有记录"，不抛。 */
export function readRecentKeys(storage) {
  try {
    const raw = (storage || globalThis.localStorage)?.getItem(RECENT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(key => typeof key === 'string') : []
  } catch {
    return []
  }
}

/** 写本机记录。写失败（配额满 / 隐私模式）静默忽略：这只是一份本机偏好，不该影响发评论。 */
export function writeRecentKeys(keys, storage) {
  try {
    ;(storage || globalThis.localStorage)?.setItem(RECENT_STORAGE_KEY, JSON.stringify(keys))
  } catch {
    /* 存不下就算了，不影响发表 */
  }
}
