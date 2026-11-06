import { ref } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { closeItemDetail } from '../utils/itemModalState'

/**
 * 路由切换加载态（跨页面共享）。
 *
 * ## 为什么需要
 *
 * 所有页面都是 `() => import()` 懒加载。点导航后要先下载分包、再挂载，
 * 这段时间中间区域**整块空白**（左右栏正常），弱网下会持续好几秒，看着像卡死。
 *
 * ## 为什么不用 `<Suspense>`
 *
 * 实测无效：vue-router 在把异步组件赋给 `RouterView` 的 `Component` **之前**
 * 就已经 `await` 完 `import()`，所以 Suspense 拿到的是已解析的组件，
 * fallback 永远不触发（2026-11-05 用最小用例确认 Suspense 本身正常）。
 *
 * ## 这里怎么做
 *
 * 在守卫里手动开关：`beforeEach` 置 true（但要延时一点，避免本地秒开时闪一下），
 * `afterEach` 与 `onError` 一律置 false。**必须两条都关** —— 只关成功路径，
 * 一旦导航被取消或报错，转圈会永远留在屏幕上。
 */
export const routeLoading = ref(false)
export const routeLoadingText = ref('正在打开页面...')

/**
 * 「导航进行中」的**即时**信号（与 `routeLoading` 的区别见下）。
 *
 * - `routeLoading`：延迟 150ms 才 true，用于**显示**转圈（避免秒开时闪一下）；
 * - `routeNavigating`：`beforeEach` 立刻 true、`afterEach`/`onError` 立刻 false，
 *   用于**隐藏滚动条**这类「必须在第一帧就生效」的动作。
 *
 * 为什么滚动条要用即时的这个：滚动条滑块的长度由 `scrollHeight` 决定。
 * 旧页面卸载 → 新页面挂载之间会有一次布局，高度先掉到「空白 + 加载占位」，
 * 滑块瞬间拉满、再随内容撑开变短 —— 用户看到的就是「先变长再变短」。
 * 等 150ms 才隐藏就晚了，那一帧已经画出来了。
 */
export const routeNavigating = ref(false)

/** 加载态至少延迟这么久才显示：本地/已预取时切换只要 20~120ms，闪一下反而更差。 */
const LOADING_DELAY_MS = 150
let loadingTimer = 0
let navigatingPollRaf = 0

const beginRouteLoading = to => {
  /*
   * 🔴 新导航开始时必须取消上一次的收尾轮询。
   * 否则「A→B 开始轮询 → 立刻再 B→C」时，前一次的 poll 看到 B 已就位就会把
   * `routeNavigating` 关掉，而 C 其实还在加载，滚动条又露出来闪一次。
   */
  if (navigatingPollRaf) {
    cancelAnimationFrame(navigatingPollRaf)
    navigatingPollRaf = 0
  }
  routeNavigating.value = true
  const title = to?.meta?.title
  routeLoadingText.value = title ? `正在打开「${title}」...` : '正在打开页面...'
  clearTimeout(loadingTimer)
  loadingTimer = setTimeout(() => { routeLoading.value = true }, LOADING_DELAY_MS)
}

/** 供 `afterEach` / `onError` 统一调用；同时防止延时定时器在结束后又把开关打开。 */
const endRouteLoading = () => {
  clearTimeout(loadingTimer)
  loadingTimer = 0
  routeLoading.value = false
  scheduleNavigatingEnd()
}

/**
 * 收尾 `routeNavigating` —— **不能跟着 `afterEach` 立刻关**。
 *
 * 实测（2026-11-06，/items → /）：`afterEach` 在 t=10ms 就把开关关了，
 * 但新页面的布局变化发生在 t=105ms。开关只活了 8ms，一帧都没盖住，滚动条照样闪。
 *
 * 原因：`afterEach` 在**异步组件 import 完成**时触发，此刻新组件还没 patch 进 DOM、
 * 更没走完第一次布局。要等到「路由 view 里出现了新页面的根节点」才算真的换了内容。
 *
 * 判据同时认 `.page-view-container` 与首页的 `.home-view` —— 首页不用 pvc 这个类
 * （同 `setRoutePending` 的注释）。
 */
const scheduleNavigatingEnd = () => {
  if (navigatingPollRaf) cancelAnimationFrame(navigatingPollRaf)
  const started = performance.now()
  const poll = () => {
    const page =
      document.querySelector('.page-view-container') ||
      document.querySelector('.home-view')
    /*
     * 两个收尾条件：
     *   1. 新页面根节点出现，且不再有 loading/error 骨架 → 内容就位；
     *   2. 超时兜底 1500ms：万一某个页面的判据不适用，不能把滚动条永久藏起来。
     */
    const settled = !!page && !page.querySelector('.ui-empty-state--loading, .ui-empty-state--error')
    if (settled || performance.now() - started > 1500) {
      routeNavigating.value = false
      navigatingPollRaf = 0
      return
    }
    navigatingPollRaf = requestAnimationFrame(poll)
  }
  navigatingPollRaf = requestAnimationFrame(poll)
}

const routes = [
  {
    path: '/runes',
    name: 'runes',
    component: () => import('../views/RunesView.vue')
  },
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: '书院首页' }
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
    /*
     * 杂项汇总页：挑战赛奖励 / 被隐藏的物品 / 育室槽位消耗。
     *
     * 路径原名 `/rewards`（当时页面只叫「奖励」）。现在导航与页面标题都是
     * **「其他」**，路径名与语义已对不上，故改为 `/misc`。
     * 🔴 未保留 `/rewards` 的兼容重定向 —— 按用户决定直接替换。
     *
     * 板块用 `?tab=` 寻址（`?tab=pvp` / `?tab=hidden` / `?tab=slot_cost`），
     * 可直达、可前进后退。
     */
    path: '/misc',
    name: 'MiscView',
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
     * `/#/misc?tab=pvp&sub=exchange&season=s1`，根本没到词条百科 ——
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
    /**
     * 货运站（游戏内 FreightPanel）：市场 / 订单 / 规则三块。
     *
     * 板块用 `?tab=` 寻址（`market` / `orders` / `rules`），可直达、可前进后退。
     * 筛选同样进 URL：`?q=` 搜索、`?tier=` 价格档位、`?kind=` 交易方式。
     *
     * 🔴 页面**不显示实时价格**：`priceScale` 是服务端下发（`FreightServerData`），
     * 配置表里没有。网页只给「基础价 × 5 档阈值」的价格区间，不编造当前价。
     */
    path: '/freight',
    name: 'freight',
    component: () => import('../views/FreightView.vue'),
    meta: { title: '货运站' }
  },
  {
    /**
     * 日常计划（游戏内 DailyWorkPanel）：计划 → 子关卡 → 关卡详情 三层钻取。
     *
     * 层级用 URL 表达，可直达可后退：`?plan=<planTypeId>&stage=<battleId>`。
     * 筛选：`?q=` 搜索、`?type=` 计划类型、`?day=` 刷新日（0=周日）。
     *
     * 解锁条件里的任务/关卡可点击跳转：`/tasks?task=<id>`、`/dungeons?battle=<id>`。
     */
    path: '/daily',
    name: 'daily',
    component: () => import('../views/DailyView.vue'),
    meta: { title: '日常计划' }
  },
  {
    path: '/tower',
    name: 'tower',
    component: () => import('../views/TowerView.vue'),
    meta: { title: '神匠之塔' }
  },
  {
    path: '/gacha',
    name: 'gacha',
    component: () => import('../views/GachaView.vue')
  },
  {
    /**
     * 配队模拟器：选 4 名角色，按队伍被动的属性/职业条件推荐魔物。
     * 纯前端计算，数据来自 heroes.json / pets.json，不新增构建产物。
     */
    path: '/sims',
    name: 'sims',
    component: () => import('../views/SimsView.vue')
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
      },
      {
        // 设置：同样是**仅超管**（服务端对写操作强校验，不只是前端隐藏）
        path: 'settings',
        name: 'admin-settings',
        component: () => import('../components/admin/AdminSettingsPanel.vue'),
        meta: { title: '后台 · 设置' }
      },
      {
        // 首页内容管理：仅超管（服务端 role >= 2 强校验）
        path: 'home',
        name: 'admin-home',
        component: () => import('../components/admin/AdminHomePanel.vue'),
        meta: { title: '后台 · 首页管理' }
      },
      {
        // 公告管理列表：仅超管。一公告一行，点整行进编辑页。
        path: 'notices',
        name: 'admin-notices',
        component: () => import('../components/admin/AdminNoticesPanel.vue'),
        meta: { title: '后台 · 公告管理' }
      },
      {
        // 公告编辑（一公告一页）。放在列表之后，避免 'notices/:id' 抢匹配父路径。
        path: 'notices/:id',
        name: 'admin-notice-edit',
        component: () => import('../components/admin/AdminNoticeEditPanel.vue'),
        meta: { title: '后台 · 编辑公告' }
      }
    ]
  },
  {
    path: '/404',
    name: 'notFound',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: '迷失 (404)' }
  },
  {
    /**
     * 兜底：未匹配到的路由统一渲染 404 迷失页面，融入羊皮纸 Wiki 主题并提供回退与快捷入口。
     */
    path: '/:pathMatch(.*)*',
    name: 'catchAllNotFound',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: '迷失 (404)' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  closeItemDetail()
  // 首次进入不显示（首屏有各自的骨架），只在页面之间切换时给反馈
  if (from.matched.length) beginRouteLoading(to)
  next()
})

/*
 * 🔴 收尾必须两条守卫都挂上。
 * `afterEach` 在「导航被取消（如重复点同一个链接）」时也会触发；
 * `onError` 覆盖分包下载失败。只挂成功路径的话，转圈会永远留在屏幕上。
 */
router.afterEach(() => { endRouteLoading() })
router.onError(() => { endRouteLoading() })

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
