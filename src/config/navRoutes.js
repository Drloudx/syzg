/**
 * 站内路由与导航分类的唯一权威配置。
 *
 * 供 NavigationMenu.vue（前台侧边栏/抽屉导航）、HomeView.vue（首页入口图标）
 * 与 AdminHomePanel.vue（后台首页管理）统一读取。
 * 🔴 严禁在业务组件中私自硬编码路由分组或路径。
 */
export const NAV_ROUTES = [
  { name: '物品图鉴', path: '/items', icon: '/ui/item_00002.webp' },
  { name: '家具图鉴', path: '/furniture', icon: '/ui/build_roomFlower_yma9_0.webp' },
  { name: '设施功能', path: '/facilities', icon: '/ui/build_cyyd_yingdizhongxing002.webp' },
  { name: '角色图鉴', path: '/heroes', icon: '/ui/class_icon_s_zs.webp' },
  { name: '伙伴邮件', path: '/partner-mails', icon: '/ui/mail_list_new_task_pt.webp' },
  { name: '魔物图鉴', path: '/pets', icon: '/ui/colect_mon_072.webp' },
  { name: '装备图鉴', path: '/equip', icon: '/ui/item_442001.webp' },
  { name: '符石图鉴', path: '/runes', icon: '/images/Common_ItemIcon/item_19310.webp' },
  { name: '遗器图鉴', path: '/relics', icon: '/images/Common_ItemIcon/item_core_101.webp' },
  { name: '菜谱查询', path: '/recipes', icon: '/ui/item_30047.webp' },
  { name: '魔物收益', path: '/petseggs', icon: '/ui/pet_079.webp' },
  { name: '成就查询', path: '/achievement', icon: '/ui/achv_icon_adv.webp' },
  { name: '怪物图鉴', path: '/monsters', icon: '/ui/colect_mon_052.webp' },
  { name: '任务图鉴', path: '/tasks', icon: '/images/TaskPanel/task_tag1.webp' },
  { name: '事件图鉴', path: '/events', icon: '/ui/mtl1.webp' },
  { name: '副本图鉴', path: '/dungeons', icon: '/ui/map_r_fb_03.webp' },
  { name: '关卡图鉴', path: '/chapters', icon: '/ui/stage_crystal.webp' },
  { name: '兑换', path: '/exchange', icon: '/ui/map_r_fb_19.webp' },
  { name: '货运站', path: '/freight', icon: '/ui/cart_wagon.webp' },
  { name: '日常计划', path: '/daily', icon: '/images/DailyWorkPanel/plan02.webp' },
  { name: '神匠之塔', path: '/tower', icon: '/images/Common_ItemIcon/item_25002.webp' },
  { name: '模拟招募', path: '/gacha', icon: '/ui/item_20004.webp' },
  { name: '相关模拟', path: '/sims', icon: '/ui/colect_mon_072.webp' },
  { name: '词条', path: '/glossary', icon: '/ui/buff_017.webp' },
  { name: '其他', path: '/misc', icon: '/ui/map_r_fb_12.webp' }
]

export const NAV_CATEGORY_DEFINITIONS = [
  {
    key: 'encyclopedia',
    title: '图鉴资料',
    adminTitle: '核心图鉴',
    paths: [
      '/items', '/heroes', '/equip', '/runes', '/relics', '/pets', '/monsters',
      '/dungeons', '/chapters', '/furniture', '/facilities',
      '/tasks', '/events', '/recipes', '/achievement',
      /* 日常计划放图鉴资料末尾：它读的是关卡与掉落，性质接近图鉴 */
      '/daily',
      '/tower'
    ]
  },
  {
    key: 'tools',
    title: '实用工具',
    adminTitle: '实用工具',
    paths: ['/gacha', '/sims', '/petseggs']
  },
  {
    key: 'misc',
    title: '其他功能',
    adminTitle: '其他功能',
    /*
     * 顺序即渲染顺序（`getGroupedNavRoutes` 按本数组逐项取）。
     * 当前：伙伴邮件 → 货运站 → 词条 → 兑换 → 其他。
     */
    paths: ['/partner-mails', '/freight', '/glossary', '/exchange', '/misc']
  }
]

/**
 * 将导航路由按照分类结构打散成组。
 * 供 NavigationMenu（前台）和 AdminHomePanel（后台选择器）共同读取。
 * @param {object} [options]
 * @param {Array} [options.routes] - 自定义路由列表（默认 NAV_ROUTES）
 * @param {boolean} [options.useAdminTitle=false] - 是否使用后台大标题（如「核心图鉴」）
 */
export function getGroupedNavRoutes({ routes = NAV_ROUTES, useAdminTitle = false } = {}) {
  const itemMap = new Map(routes.map((item) => [item.path, item]))
  const groups = []
  const assigned = new Set()

  for (const def of NAV_CATEGORY_DEFINITIONS) {
    const matched = []
    for (const p of def.paths) {
      if (itemMap.has(p)) {
        matched.push(itemMap.get(p))
        assigned.add(p)
      }
    }
    if (matched.length > 0) {
      groups.push({
        key: def.key,
        label: useAdminTitle ? (def.adminTitle || def.title) : def.title,
        items: matched
      })
    }
  }

  // 兜底未匹配的其它条目
  const unassigned = routes.filter((item) => !assigned.has(item.path))
  if (unassigned.length > 0) {
    groups.push({
      key: 'unassigned',
      label: useAdminTitle ? '其他功能' : '其它',
      items: unassigned
    })
  }

  return groups
}

/** 路径 → { name, icon }；找不到时返回 null */
export function navRouteOf(path) {
  return NAV_ROUTES.find((r) => r.path === path) || null
}

/** 路径 → 图标（找不到返回空串，调用方自行兜底） */
export function navIconOf(path) {
  return navRouteOf(path)?.icon || ''
}

/** 路径 → 中文名 */
export function navNameOf(path) {
  return navRouteOf(path)?.name || path
}
