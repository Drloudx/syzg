/**
 * 首页内容数据层。
 *
 * 职责：
 *   1. 从 `GET /api/home-config` 拉取可配置内容（公告 / 海报 / 图鉴 / 工具 / 角色 / 底栏）
 *   2. 拉不到时回落到 `DEFAULT_*` 常量（就是原先写死在 HomeView.vue 里的那份）
 *   3. 把 D1 行的扁平结构整理成视图需要的形状
 *
 * 🔴 兜底是硬要求：首页是站点入口，API 抖动不能导致整页空白。
 *    各板块独立回落，一个板块失败不影响其它板块。
 *
 * 数据口径见 docs/context/technical/HOME_CONTENT.md。
 */

/** 海报默认值（与迁移脚本的初始数据一致） */
export const DEFAULT_BANNERS = [
  {
    id: 'banner-v120',
    title: '探求深渊秘境的学者殿堂',
    desc: '全新主线第8章「无尽回廊」正式开放！5星火系秘术英雄【奇瓦】限时招募降临，专属符石秘境与限时讨伐活动全面开启。',
    tagText: '官方版本焦点',
    tagClass: 'gold',
    subTag: 'v1.2.0「深境微光」',
    btnText: '查看版本更新详情',
    image: '/images/banners/home-banner-1.webp',
    bgColor: '#264440',
    blendStart: 'rgba(38, 68, 64, 0.95)',
    actionType: 'notice',
    actionValue: 'official-v120'
  },
  {
    id: 'banner-gacha',
    title: '限定角色招募 · 双UP概率提升',
    desc: '掌握禁忌火焰秘术的神秘学者与深渊伙伴！全套技能天赋数据、专属符石词条推荐与配队演算模拟器已同步上线。',
    tagText: '限定招募进行中',
    tagClass: 'red',
    subTag: 'UP 卡池开启',
    btnText: '前往模拟抽卡',
    image: '/images/banners/home-banner-2.webp',
    bgColor: '#3c281a',
    blendStart: 'rgba(60, 40, 26, 0.95)',
    actionType: 'route',
    actionValue: '/gacha'
  },
  {
    id: 'banner-sims',
    title: '魔物出战被动搭配模拟系统',
    desc: '全新升级！移动端紧凑自选与四列选择器，实时穷举推导最佳魔物出战组合，助您轻松打通深渊高难关卡。',
    tagText: '学者实用工具',
    tagClass: 'teal',
    subTag: '配队演算升级',
    btnText: '立即体验模拟工具',
    image: '/images/banners/home-banner-3.webp',
    bgColor: '#42291b',
    blendStart: 'rgba(66, 41, 27, 0.95)',
    actionType: 'route',
    actionValue: '/sims'
  }
]

/** 公告默认值 */
export const DEFAULT_NOTICES = {
  site: [
    {
      id: 'site-disclaimer',
      tier: 'pin',
      title: '深渊大书院站点免责声明与服务协议',
      date: '2026-09-19',
      tagText: '置顶',
      tagClass: 'pinned',
      content: '深渊大书院为非盈利性质的玩家自发资料库与攻略整理工具，所有素材与文本版权归原游戏制作组所有。\n本站所有算法模拟器均为基于客户端拆解数据进行的前端重构，旨在提供便捷的配队与数值参考。'
    },
    {
      id: 'site-sims-upgrade',
      tier: 'normal',
      title: '相关模拟（魔物配队）移动端与算法全面升级',
      date: '2026-10-29',
      tagText: '功能',
      tagClass: 'patch',
      content: '魔物搭配模拟系统完成重大重构！支持自选队伍、自选角色与魔物被动过滤。\n移动端抽屉式选人交互优化完毕，提升手机端排布与浏览体验。'
    },
    {
      id: 'site-data-sync',
      tier: 'normal',
      title: '客户端解构数据同步与词条修正',
      date: '2026-10-28',
      tagText: '数据',
      tagClass: 'event',
      content: '已将最新客户端解析表与 Wiki 数据对齐，修正了部分装备在洗练状态下的暴击显示异常，补全魔物技能缺失字段。'
    },
    {
      id: 'site-community-rules',
      tier: 'pin',
      title: '大书院学者讨论区交流准则',
      date: '2026-10-25',
      tagText: '社区',
      tagClass: 'info',
      content: '欢迎各位探求者在讨论区交流游戏体验、魔物孵化收益与阵容心得。\n请自觉遵守讨论区发言礼仪，共建友善、客观的游戏研究氛围。'
    }
  ],
  official: [
    {
      id: 'official-v120',
      tier: 'pin',
      title: 'v1.2.0「深境微光」版本正式实装与停服维护',
      date: '2026-10-28',
      tagText: '版本',
      tagClass: 'pinned',
      version: 'v1.2.0「深境微光」',
      features: [
        '新 5 星秘术英雄「奇瓦」限时招募开启',
        '主线第 8 章「无尽深渊回廊」剧情关卡解锁',
        '魔物出战羁绊加成数值平衡性微调',
        '修复部分装备洗练暴击词条显示异常问题'
      ],
      content: '亲爱的探求者：\n游戏已于 10 月 28 日完成 v1.2.0 停机维护更新。\n【更新内容】\n1. 全新 5 星秘术英雄「奇瓦」限定招募开启；\n2. 开放主线章节第 8 章「无尽深渊回廊」剧情关卡与相关挑战副本；\n3. 优化部分装备洗练词条描述与魔物羁绊加成数值。'
    },
    {
      id: 'official-crashfix',
      tier: 'normal',
      title: '关于部分机型闪退与战斗结算延迟的修复通知',
      date: '2026-10-26',
      tagText: '修复',
      tagClass: 'patch',
      content: '技术团队已完成对部分机型内存占用过高导致偶发闪退的紧急补丁更新，请探求者重新启动客户端加载资源包。'
    },
    {
      id: 'official-devletter-2',
      tier: 'normal',
      title: '【开发组通信】第2期：后续养成系统减负前瞻',
      date: '2026-10-20',
      tagText: '前瞻',
      tagClass: 'event',
      content: '开发组正在推进角色升级与技能强化的材料减贫优化，预计在下个版本全面实装，同时优化委托任务的扫荡产出。'
    }
  ]
}

/** 核心图鉴默认值 */
export const DEFAULT_CORE_LINKS = [
  { slot: 1, title: '角色图鉴', description: '全英雄属性、技能天赋与升星材料', route: '/heroes', iconSource: 'nav' },
  { slot: 2, title: '装备图鉴', description: '武器防具属性、专武词条与锻造', route: '/equip', iconSource: 'nav' },
  { slot: 3, title: '魔物图鉴', description: '魔物羁绊技能、孵化产出与被动', route: '/pets', iconSource: 'nav' },
  { slot: 4, title: '符石图鉴', description: '符石共鸣套装、词条洗练与评分', route: '/runes', iconSource: 'nav' }
]

/** 实用工具默认值 */
export const DEFAULT_TOOL_LINKS = [
  { slot: 1, title: '魔物出战搭配模拟器', description: '全角色与魔物羁绊加成实时计算，智能推导最优方案', route: '/sims', iconSource: 'nav', badgeText: 'HOT', badgeColor: 'red' },
  { slot: 2, title: '模拟招募抽卡', description: '真实还原原版抽卡概率、卡池保底机制与立绘动画', route: '/gacha', iconSource: 'nav', badgeText: 'NEW', badgeColor: 'green' },
  { slot: 3, title: '魔物收益速查', description: '各阶段魔物蛋孵化时间、预计产出与金币收益全览', route: '/petseggs', iconSource: 'nav' },
  { slot: 4, title: '营地菜谱查询器', description: '食材最佳搭配组合、饱食度收益与战斗增益 Buff', route: '/recipes', iconSource: 'nav' }
]

/** 核心角色默认值（只存 heroId + tip，其余运行时 join heroes.json） */
export const DEFAULT_HEROES = [
  { slot: 1, heroId: 'hero_053', tip: '多段连击 / 范围刈割' },
  { slot: 2, heroId: 'hero_049', tip: '箭雨压制 / 穿甲破防' },
  { slot: 3, heroId: 'hero_027', tip: '散射爆刀 / 穿透清兵' },
  { slot: 4, heroId: 'hero_036', tip: '范围水伤 / 击退控场' }
]

/** 底部两栏默认值 */
export const DEFAULT_BLOCKS = {
  guide: {
    title: '大书院交流',
    subtitle: '站内自由发言，交流玩法心得',
    rows: [
      { tag: '交流', label: '大书院讨论区', text: '全站自由发言，交流玩法心得' },
      { tag: '勘误', label: '数据校准', text: '遇到数值错误或文本缺失可在讨论区反馈' },
      { tag: '群号', label: '大书院群', text: '交流群 963318625，一起探索深渊秘境' }
    ]
  },
  help: {
    title: '新人攻略',
    subtitle: '占位',
    rows: [
      { tag: '攻略', label: '占位1', text: '占位1' },
      { tag: '攻略', label: '占位2', text: '占位2' },
      { tag: '攻略', label: '占位3', text: '占位3' }
    ]
  }
}

/**
 * 拉取首页配置。
 *
 * 任何一步失败都回落默认值，**永不抛异常** —— 调用方不需要 try/catch。
 *
 * @param {{ fresh?: boolean }} opts fresh=true 跳过服务端 60 秒缓存
 * @returns {Promise<{banners, notices, coreLinks, toolLinks, heroes, blocks, degraded}>}
 *   degraded=true 表示至少有一个板块用了兜底值（可用于开发期提示）
 */
export async function loadHomeConfig(opts = {}) {
  const result = {
    banners: DEFAULT_BANNERS,
    notices: DEFAULT_NOTICES,
    /** 8 个位置明细；默认值下按「有内容就依次排」生成，null 表示该位置空着 */
    noticeSlots: {
      site: DEFAULT_NOTICES.site.map((n) => n),
      official: DEFAULT_NOTICES.official.map((n) => n)
    },
    coreLinks: DEFAULT_CORE_LINKS,
    toolLinks: DEFAULT_TOOL_LINKS,
    heroes: DEFAULT_HEROES,
    blocks: DEFAULT_BLOCKS,
    degraded: false
  }

  let data
  try {
    const url = opts.fresh ? '/api/home-config?fresh=1' : '/api/home-config'
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
    if (!data?.ok) throw new Error('payload not ok')
  } catch (err) {
    console.warn('[home] 配置接口不可用，使用内置默认值：', err?.message || err)
    result.degraded = true
    return result
  }

  // ① 海报：空数组也算「无内容」，用默认值兜底避免首页没有焦点区
  if (Array.isArray(data.banners) && data.banners.length) {
    result.banners = data.banners.map((b) => ({
      id: b.id,
      title: b.title,
      desc: b.description,
      tagText: b.tagText,
      tagClass: b.tagClass,
      subTag: b.subTag,
      btnText: b.btnText,
      image: b.image,
      bgColor: b.bgColor,
      blendStart: b.blendStart,
      actionType: b.actionType || 'route',
      actionValue: b.actionValue
    }))
  } else {
    result.degraded = true
  }

  /*
   * ② 公告：按 channel 分组，**并按插槽顺序排列**。
   *
   * 后端 `/api/home-config` 返回两样：
   *   - `notices`     摊平的公告数组（已按位置顺序排好，缺位的不占位置）
   *   - `noticeSlots` 8 个位置的 id 明细（null = 该位置空着）
   *
   * 为什么要用 `noticeSlots` 重排：摊平数组丢失了「第几位是空的」这个信息。
   * 前端若只按数组顺序渲染，位置 3 留空时位置 4 会顶上来，与后台所见不符。
   * 这里按插槽重建顺序，`null` 位置原样保留，交给视图决定「跳过」还是「显示占位」。
   */
  if (Array.isArray(data.notices)) {
    const byId = new Map(data.notices.map((n) => [n.id, n]))
    const slots = data.noticeSlots

    const pickBySlots = (channel) => {
      const ids = slots?.[channel]
      if (!Array.isArray(ids)) {
        // 后端没给插槽（老版本或降级）→ 退回按数组顺序
        return data.notices.filter((n) => n.channel === channel)
      }
      return ids.map((id) => (id ? byId.get(id) || null : null))
    }

    const siteSlots = pickBySlots('site')
    const officialSlots = pickBySlots('official')

    // 视图用：过滤掉空位后的实际公告（首页列表只渲染有内容的）
    const site = siteSlots.filter(Boolean)
    const official = officialSlots.filter(Boolean)

    // 两个频道都为空才回落（单个频道为空是合法的，说明后台清空了该频道）
    if (site.length || official.length) {
      result.notices = { site, official }
      // 位置明细：null 表示该位置空着（供将来做「该位置未选择」提示用）
      result.noticeSlots = { site: siteSlots, official: officialSlots }
    } else {
      result.degraded = true
    }
  }

  // ③ 图鉴 / 工具
  if (Array.isArray(data.links)) {
    const core = data.links.filter((l) => l.section === 'core')
    const tool = data.links.filter((l) => l.section === 'tool')
    if (core.length) result.coreLinks = core
    if (tool.length) result.toolLinks = tool
  }

  // ④ 角色
  if (Array.isArray(data.heroes) && data.heroes.length) {
    result.heroes = data.heroes
  }

  // ⑤ 底栏
  if (Array.isArray(data.blocks) && data.blocks.length) {
    const map = {}
    for (const b of data.blocks) map[b.section] = b
    result.blocks = {
      guide: map.guide || DEFAULT_BLOCKS.guide,
      help: map.help || DEFAULT_BLOCKS.help
    }
  }

  return result
}

/**
 * 按路由 + 可选查询串拼出最终 URL。
 * 用于图鉴 / 工具的 `route` + `queryString`（后台手填，如 `tab=hidden`）。
 */
export function buildRouteTarget(route, queryString) {
  if (!route) return '/'
  const q = String(queryString || '').trim().replace(/^\?/, '')
  return q ? `${route}?${q}` : route
}
