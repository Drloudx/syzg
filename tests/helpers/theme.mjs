/**
 * 测试里的主题切换。
 *
 * ## 为什么不点按钮
 *
 * 走 `useNativeShell` 在挂载时执行的那条路：
 *
 * ```js
 * applyTheme(localStorage.getItem('theme') === 'dark')
 * // → isDarkMode.value = true
 * // → document.documentElement.classList.add('dark-mode')
 * ```
 *
 * 把 `theme` 写进 localStorage 并同步加上 `<html>` 的类，就与顶栏开关等效，
 * 且不依赖按钮的可点击性（顶栏按钮受响应式与覆盖层状态影响）。
 *
 * ⚠️ 这里**不 reload**：多数用例在流程中途切主题，刷新会丢页面状态。
 * 代价是 Vue 里的 `isDarkMode` 这个 ref 不会跟着翻（它只在挂载时读一次）——
 * 受影响用例断言的是 `html.dark-mode` 或计算样式，不依赖那个 ref。
 * 真有用例需要 ref 同步，在调用前自己 `page.reload()`。
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
