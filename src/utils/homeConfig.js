/**
 * 首页内容数据层。
 *
 * 职责：
 *   1. 从 `GET /api/home-config` 拉取可配置内容（公告 / 海报 / 图鉴 / 工具 / 角色 / 底栏）
 *   2. 拉不到时回落到 `DEFAULT_*` 常量
 *   3. 把 D1 行的扁平结构整理成视图需要的形状
 *
 * 🔴 兜底是硬要求：首页是站点入口，API 抖动不能导致整页空白。
 *    各板块独立回落，一个板块失败不影响其它板块。
 *
 * 🔴 **`DEFAULT_*` 是 2026-11-02 从生产 D1 导出的真实配置快照**，
 *    不是占位文案。改后台内容后若希望离线兜底也跟上，
 *    重新导出一次并替换下面六个常量即可（见 docs/context/technical/HOME_CONTENT.md）。
 *
 * 数据口径见 docs/context/technical/HOME_CONTENT.md。
 */

/** 海报默认值（生产 D1 `home_banners` 快照，按 sortOrder） */
export const DEFAULT_BANNERS = [
  {
    id: 'banner-v120',
    title: '欢迎来到深渊之歌',
    desc: '来吧，工匠大人。\n深渊的风，已经静候您多时了。',
    tagText: '欢迎',
    tagClass: 'teal',
    subTag: '',
    btnText: '查看游戏简介',
    image: '/images/banners/home-banner-3.webp',
    bgColor: '#1a3832',
    blendStart: 'rgba(26, 56, 50, 0.95)',
    actionType: 'notice',
    actionValue: 'official-5'
  },
  {
    id: 'banner-gacha',
    title: '荒野计费测试现已开始',
    desc: '「荒野测试」开测在即\n全新角色登场、全新魔物上线、 全新角色时装、限时秘境挑战「洛莉安的幽夜古堡」',
    tagText: '荒野计费测试',
    tagClass: 'red',
    subTag: '付费测试',
    btnText: '前往查看详细',
    image: '/images/banners/home-banner-1.webp',
    bgColor: '#3a2416',
    blendStart: 'rgba(58, 36, 22, 0.95)',
    actionType: 'external',
    actionValue: 'https://www.taptap.cn/moment/864080934587075947?group_id=973894'
  },
  {
    id: 'banner-sims',
    title: '深渊大书院交流群现已创建',
    desc: '深渊大书院交流群现已创建\n欢迎各位契约者前往沟通交流',
    tagText: '大书院交流群',
    tagClass: 'info',
    subTag: '沟通交流',
    btnText: '前往加群',
    image: '/images/banners/home-banner-2.webp',
    bgColor: '#382216',
    blendStart: 'rgba(56, 34, 22, 0.95)',
    actionType: 'external',
    actionValue: 'https://qun.qq.com/universal-share/share?ac=1&authKey=AV%2BTocfcp1TtVCSa1tqSAvCFZDeszAXWB%2B%2Bb3dnsap/5ovn5saulLXMbJM3qCcRD&busi_data=eyJncm91cENvZGUiOiI5NjMzMTg2MjUiLCJ0b2tlbiI6Ik1YNFV3UXpqMDY2a1F2VjdlbkFQNkM3aUZ5dUI0bHJzaTBnOTlqNHNpcWNlTjRyRFllcTQ2WGVVT0pBTHEwM1EiLCJ1aW4iOiIxOTY1MTYxNjQzIn0=&data=8dUiFBVNaonKdN8v0r32UaW8hIXkzXts3GcEcRSaFeobWqA_JlHP7YJuTCJC9cz1iMG-kgMC3bbMKYzVOKf0iO5goSynDZxr3ZsAWKvuS34&svctype=5&tempid=h5_group_info'
  }
]

/** 公告默认值（生产 D1 `notices` 快照，按 `home_notice_slots` 顺序） */
export const DEFAULT_NOTICES = {
  site: [
{
      id: 'site-1',
      channel: 'site',
      tier: 'normal',
      title: '深渊大书院站点免责声明与服务协议',
      date: '2026-09-19',
      tagText: '置顶',
      tagClass: 'pinned',
      showInModal: 1,
      content: '<p>本站由玩家独立维护，是非官方资料站，与深渊之歌、淘气泡游戏不存在隶属关系、官方授权或商业代理关系。本站所提及的游戏名称、商标、标志、截图、游戏数据、角色立绘及相关艺术素材，其版权与所有权归各自权利人所有。<br>本网站仅提供粉丝向参考与信息整理服务。</p>'
    },
{
      id: 'site-5',
      channel: 'site',
      tier: 'normal',
      title: '占位测试',
      date: '2026-11-01',
      tagText: '测试',
      tagClass: 'info',
      showInModal: 1,
      content: ''
    },
{
      id: 'site-7',
      channel: 'site',
      tier: 'normal',
      title: '占位测试',
      date: '2026-11-01',
      tagText: '测试',
      tagClass: 'info',
      showInModal: 1,
      content: ''
    },
{
      id: 'site-4',
      channel: 'site',
      tier: 'normal',
      title: '大书院学者讨论区交流准则',
      date: '2026-10-25',
      tagText: '社区',
      tagClass: 'gold',
      showInModal: 1,
      content: '<p>欢迎各位探求者在讨论区交流游戏体验、阵容心得。</p><p>请自觉遵守讨论区发言礼仪，共建友善、客观的游戏研究氛围。</p>'
    }
  ],
  official: [
{
      id: 'official-6',
      channel: 'official',
      tier: 'normal',
      title: '「荒野计费测试」内容一览！全新角色登场 限时秘境同步开放',
      date: '2026-11-02',
      tagText: '版本',
      tagClass: 'pinned',
      showInModal: 0,
      version: '「荒野计费测试」',
      features: ['✦ 全新角色登场', '✦ 全新魔物上线', '✦ 全新角色时装', '✦ 限时秘境挑战「洛莉安的幽夜古堡」'],
      content: '<p>荒野测试 正式定档 11.12</p><p>一、全新角色</p><p>新增德莉（5 星）、斯卡莉安（5 星）、洛莉安（5 星）、阿尔克丝（4 星）、修瓦莉（4 星）、诺姿（3 星）等伙伴。</p><p>二、全新活动：洛莉安的幽夜古堡</p><p>秘境挑战「亚空回廊」限时开启！发掘失落的遗器，嵌入强大的法盘，不断探索深入这片奇诡的秘境。可获得独特的神器、传说级装备、契约书、小屋外观等道具。</p><p>三、全新时代</p><p>新增彩虹芭菲公主·德莉（传说）、金鹿的假期·菲莉娜（传说）、阳葵田的守望者·芭杜尔（罕见）、胡萝卜小收获日·米拉贝尔（罕见）、一日侍者·米托拉（罕见）等时装。</p><p>四、全新魔物</p><p>新增圣骑士史莱姆（5 星）、洛莉安的眷属（5 星）、蜂刺骑兵（4 星）、黄金史莱姆（4 星）、粉红史莱姆（3 星）、天青史莱姆（3 星）、幽灵史莱姆（3 星）等魔物。</p><p>五、全新体验</p><p>1. 商业化内容更新：上线驿站补给凭证（月卡）、荒野通行手册（通行证），同步对付费商城进行改版优化。</p><p>2. 开放装扮系统。</p><p>3. 新增小屋外观自定义功能。</p><p>4. 上架全新家具系列。</p><p>5. 优化部分关卡难度曲线，调整关卡体验。</p><p>6. 新增万能突破魔物：新增纯白史莱姆、彩虹史莱姆，可用于任意魔物突破。</p><p>7. 新增万能回忆拼图：新增湛蓝、靛紫、灿金回忆拼图，可替代任意伙伴的对应回忆拼图，完成星阶激活。</p><p>8. 新增角色重置道具：新增成长遗忘药水，使用后即可重置角色等级与技能等级，返还经验书与元素碎片。</p><p>9. 修复若干已知问题。</p><p>注：本素材内容仅供参考，具体请以游戏内实际情况为准。<br><br><a target="_blank" rel="noopener noreferrer" class="rich-link" href="https://www.taptap.cn/moment/864080934587075947?group_id=973894">「荒野计费测试」内容一览！全新角色登场 限时秘境同步开放</a></p>'
    },
{
      id: 'official-5',
      channel: 'official',
      tier: 'normal',
      title: '游戏简介',
      date: '2026-11-01',
      tagText: '简介',
      tagClass: 'info',
      showInModal: 0,
      content: '<h2 style="line-height: 24px;"><strong>游戏简介</strong></h2><p>「那是人类得到的教训，因为人类的狂妄自负而应得的教训」<br>糟糕！<br>失忆之后坠落深渊？<br>还要当异世界的救世主？我吗？？<br>虽然听着很不妙，但我们是一款拥有治愈复古画风的蛮轻松的异世界冒险手游，旅途比您想象中悠闲得多～<br>您将扮演年轻有为却丧失记忆的工匠，因为一次意外而坠落到了深渊（Abyss）。<br>在这里，您邂逅了魔人少女——米托拉，最好的伙伴！<br>你们一起一砖一瓦搭建家园，春种秋收收获满仓；<br>招募天南海北的有趣伙伴，孵化风格各异的神奇魔物；<br>亲手锻造神器，打造专属冒险营地。<br><br>你们一起抵挡狂暴种魔物作乱，再踩着晨光往未知的区域奔跑。<br>散落在深渊间的记忆碎片，正等您慢慢拼凑；<br>沉眠在这片土地下的真相，也等待着您亲手揭开它的面纱。<br><br>来吧，工匠大人。<br>深渊的风，已经静候您多时了。</p><h2 style="line-height: 24px;"><strong>开发者的话</strong></h2><p>大家好！我们是《深渊之歌》的开发团队。在营地的篝火旁，我们怀着激动与忐忑的心情写下这封信，邀请你们一同踏入这片深邃而迷人的无主之地——“深渊”。<br><br>《深渊之歌》的核心魅力：<br><br>故事驱动，浸入深渊：<br>数百年前那场席卷卡露蒂亚的灾难余波未平，而“深渊”——这场风暴的正中心，正是故事的起点。被克里斯汀圣教军追捕的小小工匠意外坠入其中。这里环境严酷，魔物环伺，但也蕴藏着失落的历史、奇异的生灵和无尽的可能。<br><br>魔物伙伴，从敌到友：<br>从一枚“蛋”开始，孵化、培育你的魔物！培育的魔物拥有独立的技能和专属特性，能为你的组队策略带来全新维度。无论是派遣它们去获得收益，还是带着它们在荒野中披荆斩棘，它们都是你最特别的伙伴。<br><br>深度养成，自由构筑：<br>六大职业、四种元素属性，自由组建你的四人冒险小队。通过获取经验、升级技能、解锁回忆拼图，每个角色都能绽放独特光彩。别忘了给你的伙伴们送送礼，解锁他们的专属羁绊剧情和奖励！<br><br>立足荒野，建造家园：<br>从一堆篝火开始，亲手在危机四伏的深渊中开辟一隅安身之所。建造、升级、研究科技、制作材料、开垦田地、烹饪料理、摆放家具，邀请伙伴入住……这里的一切都由你规划，打造你和伙伴们的家园！<br><br>匠魂不息，锻造传说：<br>能工巧匠，亦是真正的勇者！传说级的金色装备和稀有词条，都可以用自己的双手去锻造！为伙伴量身打造契合的装备，组成套装、强化底材、洗练词条、附魔特性……工匠锤每一次的锻打，都让你离深渊的秘密更近一步。<br><br>经营有方，放置生财：<br>深渊求生，资源为王。除了亲自去野地采集，也有更轻松的方法获取材料。发出探索队让闲置的伙伴收集材料和战利品，在冒险之余配置生产计划，让种植、磨坊、轻工、锻造、制药形成产业闭环，在市场中完成订单和买卖交易，用赚取的资金购买资源或强化队伍，群英荟萃指日可待！<br><br>《深渊之歌》倾注了我们的全部热爱。我们一直梦想着创造这样一个世界：它不仅仅是冒险战斗的舞台，更是一个你能够扎根、成长、与伙伴建立深刻羁绊的家园。<br><br>准备好你的行囊，点燃营地的篝火，孵化第一枚魔物蛋，和伙伴一起举起亲手锻造的武器……在卡露蒂亚的深渊之中，你的传奇，正等待书写。让我们在篝火旁相聚，共同谱写这首属于工匠与勇者的“深渊之歌”！</p>'
    }
  ]
}

/** 公告插槽默认值（8 个位置：site 4 + official 4，null = 该位置空着） */
export const DEFAULT_NOTICE_SLOTS = {"site":["site-1","site-5","site-7","site-4"],"official":["official-6","official-5",null,null]}

/** 图鉴入口默认值（生产 D1 `home_links` 快照，section = core） */
export const DEFAULT_CORE_LINKS = [
  { slot: 1, title: '角色图鉴', description: '角色属性，技能，星阶\n角色互动文本', route: '/heroes', iconSource: 'nav' },
  { slot: 2, title: '怪物图鉴', description: '怪物基础属性\n怪物状态，技能释放条件', route: '/monsters', iconSource: 'nav' },
  { slot: 3, title: '任务图鉴', description: '全任务流程\n全剧情文本，支持关键词搜索', route: '/tasks', iconSource: 'nav' },
  { slot: 4, title: '副本图鉴', description: '副本路线\n商人，宝箱产出', route: '/dungeons', iconSource: 'nav' }
]

/** 实用工具默认值（生产 D1 `home_links` 快照，section = tool） */
export const DEFAULT_TOOL_LINKS = [
  { slot: 1, title: '模拟招募', description: '欢迎游戏抽卡概率、欧非鉴定器', route: '/gacha', iconSource: 'nav', badgeText: 'HOT', badgeColor: 'red' },
  { slot: 2, title: '魔物出战推荐', description: '实现属性收益最大化', route: '/sims', queryString: 'tab=monster-team', iconSource: 'custom', badgeText: 'NEW', badgeColor: 'green' },
  { slot: 3, title: '魔物收益速查', description: '各魔物蛋孵化时间、银币收益与经验收益全览', route: '/petseggs', iconSource: 'nav', badgeText: '111' },
  { slot: 4, title: '菜谱查询', description: '食材组合、战斗增益 Buff', route: '/recipes', iconSource: 'nav' }
]

/** 核心角色默认值（生产 D1 `home_heroes` 快照；只存 heroId + tip，其余运行时 join heroes.json） */
export const DEFAULT_HEROES = [
  { slot: 1, heroId: 'hero_053', tip: '范围伤害/残血收割' },
  { slot: 2, heroId: 'hero_049', tip: '范围伤害 /高伤爆发 ' },
  { slot: 3, heroId: 'hero_027', tip: '范围伤害 / 高效清场' },
  { slot: 4, heroId: 'hero_036', tip: '范围水伤 / 易伤，控制' }
]

/** 底部两栏默认值（生产 D1 `home_blocks` 快照） */
export const DEFAULT_BLOCKS = {
  guide: {
    title: '大书院交流',
    subtitle: '占位',
    rows: [{ tag: '交流', label: '大书院讨论区', text: '全站自由发言，交流玩法心得' }, { tag: '勘误', label: '数据校准', text: '遇到数值错误或文本缺失可在讨论区反馈' }, { tag: '群号', label: '大书院群', text: '交流群 963318625，一起探索深渊秘境' }]
  },
  help: {
    title: '新人攻略',
    subtitle: '占位',
    rows: [{ tag: '攻略', label: '占位1', text: '占位1' }, { tag: '攻略', label: '占位2', text: '占位2' }, { tag: '攻略', label: '占位3', text: '占位3' }]
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
    /**
     * 8 个位置明细（id 数组，null = 该位置空着）。
     * 用导出的快照而不是从 DEFAULT_NOTICES 现算：现算只能得到「都填满」，
     * 而真实配置里 official 第 3、4 位是空的。
     */
    noticeSlots: {
      site: DEFAULT_NOTICE_SLOTS.site.map((id) => (id ? DEFAULT_NOTICES.site.find((n) => n.id === id) || null : null)),
      official: DEFAULT_NOTICE_SLOTS.official.map((id) => (id ? DEFAULT_NOTICES.official.find((n) => n.id === id) || null : null))
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
