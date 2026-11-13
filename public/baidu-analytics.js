/*
 * 百度统计（Baidu Tongji）加载器 —— 站点 ID: 2c323fc463f70190d30be91e7f402bc3
 *
 * 为什么单独放成同源外部脚本，而不是把官方那段内联 <script> 直接写进 index.html：
 *   - 本站 CSP 是 `script-src 'self'`（无 'unsafe-inline'），**内联脚本会被直接拦掉**；
 *     public/_headers 里明确写着「index.html 与构建产物内联 <script> 为 0 个」，
 *     这条是 CSP 的核心价值，不能为了统计破坏它。
 *   - 做成 /baidu-analytics.js（同源）→ 命中 `script-src 'self'`；
 *     它再去拉 https://hm.baidu.com/hm.js → 由 _headers 的 CSP 放行该域。
 *
 * 为什么只在正式域名加载：
 *   - Android 原生壳（Capacitor）页面跑在 https://localhost。若不加判断，
 *     App 内所有访问都会上报到百度，污染 Web 端数据。
 *   - 因此只认 location.hostname === 'syzgwiki.top'；localhost / pages.dev 预览
 *     等一律不加载。
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.location.hostname !== 'syzgwiki.top') return;

  var _hmt = (window._hmt = window._hmt || []);
  var hm = document.createElement('script');
  hm.async = true;
  hm.src = 'https://hm.baidu.com/hm.js?2c323fc463f70190d30be91e7f402bc3';
  // 用 head.appendChild，避免依赖「页面里第一个 <script>」的位置
  (document.head || document.documentElement).appendChild(hm);
})();
