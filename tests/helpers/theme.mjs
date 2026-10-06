/**
 * 测试里的主题切换。
 *
 * ## 为什么不点按钮
 *
 * 顶栏那个「切换暗色模式」按钮**被有意隐藏了**：
 *
 * ```js
 * // src/App.vue
 * const showThemeToggle = false   // 深色模式尚有未解决的问题，等修好再恢复
 * ```
 *
 * 模板里是 `v-if="showThemeToggle"`，所以按钮**根本不渲染** ——
 * 于是原先那批 `page.getByTitle('切换暗色模式').click()` 全部超时。
 * （实测有 6 个 spec、约 9 处调用受影响。）
 *
 * ## 走应用真正支持的那条路
 *
 * `useNativeShell` 在挂载时执行：
 *
 * ```js
 * applyTheme(localStorage.getItem('theme') === 'dark')
 * // → isDarkMode.value = true
 * // → document.documentElement.classList.add('dark-mode')
 * ```
 *
 * 所以只要把 `theme` 写进 localStorage 并同步加上 `<html>` 的类，
 * 就能在不依赖按钮的前提下进入暗色 —— 这也正是 App.vue 注释里说的
 * "localStorage 里已存的 theme=dark 仍会在启动时生效"。
 *
 * ⚠️ 这里**不 reload**：多数用例是在流程中途切主题的，刷新会把页面状态弄丢。
 * 代价是 Vue 里的 `isDarkMode` 这个 ref 不会跟着翻（它只在挂载时读一次）——
 * 好在受影响用例断言的都是 `html.dark-mode` 或计算样式，不依赖那个 ref。
 * 真有用例需要 ref 同步，就在调用前自己 `page.reload()`。
 */

/** 进入暗色模式（不刷新页面） */
export async function enableDarkMode(page) {
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark')
    document.documentElement.classList.add('dark-mode')
  })
  // 给样式一点应用时间（与用户点按钮后的观感一致）
  await page.waitForTimeout(150)
}

/** 回到亮色模式（不刷新页面） */
export async function disableDarkMode(page) {
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light')
    document.documentElement.classList.remove('dark-mode')
  })
  await page.waitForTimeout(150)
}
