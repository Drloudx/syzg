import { createRouter, createWebHashHistory } from 'vue-router'
import { closeItemDetail } from '../utils/itemModalState'

const routes = [
  {
    path: '/runes',
    name: 'runes',
    component: () => import('../views/RunesView.vue')
  },
  {
    // 首页 = 物品图鉴（用户指定）。导航顺序里「物品图鉴」也是第一项，保持一致。
    path: '/',
    redirect: '/items'
  },
  {
    path: '/petseggs',
    name: 'PetsEggsView',
    component: () => import('../views/PetsEggsView.vue')
  },
  {
    path: '/achievement',
    name: 'AchievementView',
    component: () => import('../views/AchievementView.vue')
  },
  {
    path: '/recipes',
    name: 'RecipesView',
    component: () => import('../views/RecipesView.vue')
  },
  {
    path: '/items',
    name: 'items',
    component: () => import('../views/ItemsView.vue')
  },
  {
    path: '/furniture',
    name: 'furniture',
    component: () => import('../views/FurnitureView.vue')
  },
  {
    path: '/facilities',
    name: 'facilities',
    component: () => import('../views/FacilitiesView.vue')
  },
  {
    path: '/monsters',
    name: 'monsters',
    component: () => import('../views/MonstersView.vue')
  },
  {
    path: '/pets',
    name: 'pets',
    component: () => import('../views/PetsView.vue')
  },
  {
    path: '/equip',
    name: 'equip',
    component: () => import('../views/EquipsView.vue')
  },
  {
    path: '/rewards',
    name: 'RewardsView',
    component: () => import('../views/RewardsView.vue'),
    /*
     * 旧地址兼容：战斗规则页已经并进**词条百科**，`?tab=combat_rules` / `?tab=ph3`
     * 应当把人送到 `/glossary`。
     *
     * 🔴 **必须放在路由守卫里，不能放在组件的 setup 里。**
     *
     * 原来的写法是在 `RewardsView` 的 `resolveMainCategory()` 里
     * `router.replace('/glossary')` —— 那是个**在"解析函数"里做路由跳转**的副作用。
     * 而组件 `onMounted` 里的 `syncTabsToRoute()` 又会执行
     * `router.replace({ query: { tab: 'pvp', sub: 'exchange', … } })`，
     * **把那次跳转覆盖掉**。实测最终停在
     * `/#/rewards?tab=pvp&sub=exchange&season=s1`，根本没到词条百科 ——
     * 用户点旧链接会落在一个不相关的页面上。
     *
     * 放进 `beforeEnter` 则在**组件挂载之前**就完成跳转，谁也覆盖不了。
     * 另外这里**保留 `q` 等其它参数**（原写法直接丢掉），
     * 所以 `?tab=ph3&q=护盾` 会变成 `/glossary?q=护盾`，
     * 而词条百科正好读 `?q=`（`GlossaryView.vue` 的 `search`），搜索词不丢。
     */
    beforeEnter: (to) => {
      const tab = to.query.tab
      if (tab === 'combat_rules' || tab === 'ph3') {
        const query = { ...to.query }
        delete query.tab
        return { path: '/glossary', query }
      }
      return true
    }
  },
  {
    path: '/heroes',
    name: 'heroes',
    component: () => import('../views/HeroesView.vue')
  },
  {
    path: '/partner-mails',
    name: 'partner-mails',
    component: () => import('../views/PartnerMailsView.vue')
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('../views/TasksView.vue')
  },
  {
    path: '/events',
    name: 'events',
    component: () => import('../views/EventsView.vue')
  },
  {
    path: '/exchange',
    name: 'exchange',
    component: () => import('../views/ExchangeView.vue')
  },
  {
    path: '/dungeons',
    name: 'dungeons',
    component: () => import('../views/DungeonsView.vue')
  },
  {
    path: '/chapters',
    name: 'chapters',
    component: () => import('../views/ChaptersView.vue')
  },
  {
    path: '/glossary',
    name: 'glossary',
    component: () => import('../views/GlossaryView.vue')
  },
  {
    path: '/gacha',
    name: 'gacha',
    component: () => import('../views/GachaView.vue')
  },
  {
    /**
     * 讨论区。独立路由而不是"就地把内容区换成聊天"：链接可分享可刷新、
     * 滚动天然隔离在容器内，也不必让各视图各自接入聊天模式状态。
     * `?page=<page_key>` 指定讨论归属（从详情进来时带上），缺省为站内总讨论区
     * （`site:general`，也就是右栏「最新讨论」镜像的那一个）。
     */
    path: '/discussions',
    name: 'discussions',
    component: () => import('../views/DiscussionsView.vue'),
    meta: { title: '讨论区' }
  },
  {
    /**
     * 隐私说明。
     *
     * 🔴 **它是注册流程的一部分，不是可选的附加页**：注册表单里那个必勾的
     * "我已阅读并同意隐私说明"就指向这里。补上之前这条路由不存在，
     * 点进去是空白页 —— 等于要求用户同意一份打不开的文档。
     */
    path: '/privacy',
    name: 'privacy',
    component: () => import('../views/PrivacyView.vue'),
    meta: { title: '隐私说明' }
  },
  {
    /**
     * 后台。刻意不放进导航面板：它不是给访客的页面，
     * 靠管理员令牌保护（服务端未配置 ADMIN_TOKEN 时接口直接 404）。
     *
     * **用嵌套子路由**而不是在外壳里维护一个 `tab` 状态：
     * 这样刷新、分享链接（`/admin/users` 直接发给别人）、浏览器前进后退全都正常。
     * `/admin` 本身是概览，评论挪到 `/admin/comments`。
     */
    path: '/admin',
    component: () => import('../views/AdminView.vue'),
    meta: { title: '后台' },
    children: [
      {
        path: '',
        name: 'admin-overview',
        component: () => import('../components/admin/AdminOverviewPanel.vue'),
        meta: { title: '后台 · 概览' }
      },
      {
        path: 'comments',
        name: 'admin-comments',
        component: () => import('../components/admin/AdminCommentsPanel.vue'),
        meta: { title: '后台 · 评论' }
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('../components/admin/AdminUsersPanel.vue'),
        meta: { title: '后台 · 用户' }
      },
      {
        // 审计：服务端**仅超管**可读（普通管理员拿到 403），页签也只在超管登录时显示
        path: 'audit',
        name: 'admin-audit',
        component: () => import('../components/admin/AdminAuditPanel.vue'),
        meta: { title: '后台 · 审计' }
      }
    ]
  },
  {
    /**
     * 兜底：**任何没匹配上的 hash 都回首页**，而不是渲染一片空白。
     *
     * 踩过的坑：路由表原先没有这一条，`#/privacy`（当时还没实现）点进去
     * 就是一个**全白的页面** —— 用户不知道是自己点错了还是站点坏了。
     * 现在统一重定向回首页，至少还有个能用的界面。
     */
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  closeItemDetail()
  next()
})

/**
 * 路由分包预取。
 *
 * 为什么需要：`router-view` 对懒加载路由会**等异步组件 chunk 下载完再挂载**，
 * 这段等待里旧页面一直挂在屏幕上不动，真机走网络时就是用户感知的「先卡一下再切过去」。
 * 本机 localhost 实测切换仅 25~120ms（无感），但 chunk 走网络后这个延迟会被放大。
 *
 * 策略分两级，避免与首屏的数据加载抢带宽：
 *   1. `prefetchRouteChunks()` —— 首屏就绪后的空闲时间预取 17 个小 chunk（约 282 KB 未压缩）；
 *   2. `prefetchDeferredRouteChunks()` —— 用户在导航面板上表达跳转意图时，再补最重的
 *      `/gacha`（单个 244 KB，占总视图 chunk 近一半），不放进首屏空闲预取。
 * 预取只是 `import()`，会命中原有的模块缓存，不会重复下载、不执行页面组件。
 */
const ROUTE_LOADERS = routes
  .filter(route => typeof route.component === 'function')
  .map(route => ({ path: route.path, load: route.component }))

/**
 * 首屏空闲预取时跳过的包。
 *   `/gacha`（244 KB，占总视图 chunk 近一半）留给导航意图触发；
 *   `/admin` 是管理页，普通访客永远不会打开，不该占首屏空闲带宽。
 */
const DEFERRED_PREFETCH_PATHS = new Set(['/gacha', '/admin'])

/** 两次预取之间的间隔：既让首屏资源先落稳，也避免主线程被连续解析占满。 */
const PREFETCH_STEP_MS = 220

const prefetchPaths = paths => {
  // 串行 + 间隔下发：一次性并发 import 会在首屏图片/数据还没落稳时抢带宽，
  // 导致「检查全部图片已解码」的用例与弱网首屏偶发失败。逐个让出主线程更温和。
  const pending = ROUTE_LOADERS.filter(route => paths.has(route.path))
  const step = index => {
    if (index >= pending.length) return
    // 失败不重试也不上报：预取是纯优化，真正的导航仍会正常加载并自行处理错误。
    Promise.resolve().then(pending[index].load).catch(() => {})
    setTimeout(() => step(index + 1), PREFETCH_STEP_MS)
  }
  step(0)
}

const idlePrefetchPaths = new Set(
  ROUTE_LOADERS.map(route => route.path).filter(path => !DEFERRED_PREFETCH_PATHS.has(path))
)

/** 首屏空闲预取：跳过重包，逐个让出主线程，避免与首屏数据请求竞争。 */
export function prefetchRouteChunks() {
  const run = () => prefetchPaths(idlePrefetchPaths)
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1200)
}

/** 导航意图预取：补齐被首屏跳过的重包（在 `NavigationMenu` 打开时调用）。 */
let deferredPrefetched = false
export function prefetchDeferredRouteChunks() {
  if (deferredPrefetched) return
  deferredPrefetched = true
  prefetchPaths(DEFERRED_PREFETCH_PATHS)
}

export default router
