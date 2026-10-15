/**
 * 「打开账号弹窗」的注册表。
 *
 * ## 为什么要有这么个东西
 *
 * 账号弹窗挂在 `App.vue` 上（页面上只有一个），但**深层组件也需要打开它** ——
 * 评论组装器在用户没登录时要弹出来（"登录后才能发表评论"）。
 * 如果没有这个注册表，就得把"打开弹窗"这件事一层层往下传 props / emit，
 * 穿过好几层与账号毫无关系的组件。
 *
 * 做法：`App.vue` 启动时把开弹窗的函数注册进来，任何地方 `openAccountModal()` 即可。
 * 这是**刻意的全局单例** —— 弹窗本来就只该有一个。
 *
 * 与 `avatarCatalog.js`（头像清单）是两个互不相关的模块，不要合并。
 */

let opener = null

/** 由 `App.vue` 在 setup 时注入，避免子组件各自维护一份弹窗状态 */
export function registerAccountModal(openFn) {
  opener = typeof openFn === 'function' ? openFn : null
}

/** 打开账号弹窗（评论组装器等深度组件调用） */
export function openAccountModal() {
  opener?.()
}
