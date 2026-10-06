/**
 * 头像清单（`data/parsed/avatarCatalog.json`）。
 *
 * ## 这个模块曾经叫 `identity.js`
 *
 * 它以前还管**本机身份** —— 昵称与头像只存这台设备的 localStorage、
 * 不注册不登录。那套东西在 2026-10-05 的账号体系上线后**整体退役**：
 * 它解决的是"没账号时怎么让用户不用每次重填"，而账号体系把这个问题
 * 连根解决了（而且顺带解决了它最大的毛病：任何人都能把昵称设成别人的名字）。
 *
 * 只剩头像清单这半边还有用 —— 账号选头像、评论区渲染头像都要它。
 * 所以文件同步改名为 `avatarCatalog.js`，免得"identity"这个名字误导后来的人。
 *
 * ## 为什么存头像 ID 而不是图片路径
 *
 * 存 `avatar_pet_006` 这样的 ID，路径由清单查。
 * 这样素材目录改名或迁移时只需更新清单，**库里的历史评论不会指向失效路径**；
 * 服务端也能用同一份 ID 白名单校验，避免客户端塞任意字符串进库。
 */

import { ref } from 'vue'

/** 头像 ID 白名单（与服务端 `functions/api/[[path]].js` 的校验同源，都来自 avatarCatalog.json） */
export const AVATAR_ID_RE = /^[A-Za-z0-9_]{1,40}$/

/** 头像清单加载状态：'idle' | 'loading' | 'ready' | 'error' */
export const avatarCatalogState = ref('idle')
export const avatarGroups = ref([])

/**
 * 载入头像清单（`data/parsed/avatarCatalog.json`，
 * 由 `scripts/dev/sync-avatar-catalog.mjs` 生成）。
 * 只在第一次需要时请求。
 *
 * 路径必须在 `data/parsed/` 下：`verify.mjs` 的护栏限定浏览器运行时只能读
 * `data/parsed/`、`data/dialogs/`、`data/taskDialogs/` 与 `data/notice.json`。
 */
export async function loadAvatarCatalog() {
  if (avatarCatalogState.value === 'ready' || avatarCatalogState.value === 'loading') return
  avatarCatalogState.value = 'loading'
  try {
    const res = await fetch('data/parsed/avatarCatalog.json')
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    avatarGroups.value = Array.isArray(data?.groups) ? data.groups : []
    avatarCatalogState.value = 'ready'
  } catch {
    // 清单缺失时选择器显示空态，不影响"只改昵称"这条主路径
    avatarCatalogState.value = 'error'
  }
}

/** 头像 ID → 图片路径（清单未加载或 ID 未知时返回空串） */
export function avatarPath(id) {
  return avatarEntry(id)?.path || ''
}

/** 头像 ID → 清单条目 `{id, path, name}`（含角色/魔物名，供选择器显示与提示） */
export function avatarEntry(id) {
  if (!id) return null
  for (const group of avatarGroups.value) {
    const hit = (group.items || []).find((it) => it.id === id)
    if (hit) return hit
  }
  return null
}
