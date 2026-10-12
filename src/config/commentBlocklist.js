/**
 * 评论审核词表（唯一来源，被 functions/api/[[path]].js 直接 import）
 *
 * ## 来源
 * 按类别从游戏聊天风控词库筛选：`../Config_decrypted/words.json`
 * （约 14,078 条，逗号分隔的单个字符串）
 *
 * ## 为什么不整表同步（2026-10-01 实测，依据 docs/technical/COMMENTS_BACKEND.md）
 * 1. **误伤**：游戏表含大量日常词——比例、真实、购买、买菜、我爸、炸鸡、善良、香港、港口…
 *    整表导入会让正常图鉴讨论全部进待审。
 * 2. **性能**：Workers 免费版只有 10ms CPU/次调用。本地实测每条评论：
 *    全表扫描 0.82ms / 筛后词表+首字索引 0.024ms / **本文件的类别正则 0.0040ms**。
 *
 * ## 表示法：类别正则（而不是逐词表）
 * 实测正则比 97 条逐词匹配快 6 倍，且维护面小。每个模式都刻意避开单字与日常词，
 * 例如【赌博】收 `赌博/赌场/赌球/下注/博彩`，不收单字 `赌`（否则「别赌气」会被拦）。
 *
 * ## 刻意排除的日常词（在游戏表里，但本站不用）
 * `发票`、`办证`、`银行卡`、`诈骗`、`兼职`、`按摩`、`比例`、`真实`、`购买`、`买菜`、
 * `我爸`、`炸鸡`、`善良`、`香港`、`港口`、`毒`、`草`、`杀`（多为单字，误伤极高）
 *
 * ## 命中后的语义是「进待审（status=0）」，不是拒收
 * 误伤的内容不会丢，管理员在管理页面一键放行。
 *
 * ## 超管可维护的部分（2026-10-09）
 *
 * 基线（本文件的类别正则）**永远在代码里**，库里只叠加超管额外加的关键词：
 *   · 库里存**普通关键词**，匹配时转义后拼进正则 —— 不允许网页编辑正则，
 *     否则一个手滑就是"发评论全站 500"或 CPU 回溯爆炸；
 *   · 读库失败 / 迁移没跑 → **回落基线**，基础防护照旧，不会变成"不审核"；
 *   · 生效规则见 `buildMatcher()`：停用类别 = 该类别的词**和**自定义词一起失效。
 * 详见 `scripts/sql/2026-10-09-review-keywords.sql` 与 ADR 122。
 */

export const BLOCKLIST_SOURCE = 'Config_decrypted/words.json'

/**
 * 分类正则 → 命中即进待审。
 * 键名会作为「命中原因」显示在管理页面，便于你判断是误伤还是真垃圾。
 */
export const BLOCKLIST_CATEGORY_PATTERNS = {
  赌博: /赌博|赌场|赌球|赌马|赌具|赌币|赌盘|赌网|轮盘赌|在线赌钱|下注|博彩|百家乐|棋牌|彩票|时时彩|六合彩|老虎机|筹码/,
  色情: /卖淫|嫖娼|嫖客|嫖资|嫖鸡|援交|约炮|色情|情色|裸聊|成人电影|成人网站|嫩模|外围女|楼凤|桑拿技师|qvod|买春|招妓/,
  /*
   * 违禁品：**合并了原「违禁药」**（2026-10-09）。
   *
   * 为什么不直接删掉那一类：删了就等于这 22 个词（毒品/大麻/伟哥/催情…）不再拦，
   * 而那些是广告的常见形态。合并后**拦截能力一字不减**，只是命中原因显示成「违禁品」。
   * 核对依据：生产库 `review_reason LIKE '%违禁药%'` 命中 **0 条**，
   * 所以改名不会让任何历史数据的命中原因对不上。
   */
  违禁品: /枪支|弹药|炸药|管制刀具|仿真枪|手雷|毒品|冰毒|大麻|摇头丸|迷药|吗啡|杜冷丁|三唑仑|咪达唑仑|氯硝安定|氟硝安定|麻黄碱|曲马多|氯尼他秦|伟哥|万艾可|西地那非|壮阳|男根|延时丸|延时液|催情/,
  诈骗: /办假证|假证|洗钱|钓鱼网站/,
  引流: /加微信|加qq|私聊|薇信|威信|代刷|刷单|兼职刷|网络炒作|扫码进群/,
  政治敏感: /法轮|台独|港独|藏独|疆独|颠覆中国政权|和平演变|一中一台|反共|六四/
}

/**
 * 结构性规则（不来自游戏表，本站自加）。
 * 用字符串而非 RegExp 字面量，便于将来移到后台编辑。
 */
export const BLOCKLIST_STRUCTURAL_PATTERNS = [
  { name: '外链', pattern: 'https?://', note: '图鉴讨论不需要外链，广告的主要形态' },
  {
    name: 'HTML 标签',
    pattern: '<\\s*/?\\s*[a-zA-Z][^>]*>',
    note: '本站一律按纯文本渲染，出现标签基本是攻击或粘贴垃圾'
  }
]

/** 预编译正则，避免在请求热路径上重复构造 */
const COMPILED = Object.entries(BLOCKLIST_CATEGORY_PATTERNS).map(([name, re]) => ({ name, re }))
const COMPILED_STRUCTURAL = BLOCKLIST_STRUCTURAL_PATTERNS.map((p) => ({
  name: p.name,
  re: new RegExp(p.pattern, 'i')
}))

/** 基线类别名（供后台「启用的类别」列表使用） */
export const BLOCKLIST_CATEGORY_NAMES = Object.keys(BLOCKLIST_CATEGORY_PATTERNS)

/**
 * 把某个基线类别的正则**拆成可读的词列表**（供后台展示"内置了哪些词"）。
 *
 * 🔴 为什么需要它：这些正则全部形如 `a|b|c`（逐个 `|` 分隔的字面量），
 *    但**界面不能显示正则源码** —— 那会让管理员以为自己在编辑正则，
 *    而实际库里存的是普通词、运行时才转义拼接（见 ADR 122）。
 *    所以这里拆成词，界面上按词展示。
 *
 * 只在后台接口里调用（低频），不在评论提交的热路径上。
 * 若将来某个类别用上真正的正则语法（分组、量词），这里会拆出带元字符的"词" ——
 * 那时界面会显示得不好看，但**匹配行为仍然正确**（展示与匹配是两条独立的路）。
 */
export function listBaselineWords(category) {
  const re = BLOCKLIST_CATEGORY_PATTERNS[category]
  if (!re) return []
  return re.source.split('|').map((w) => w.trim()).filter(Boolean)
}

/**
 * 把一条**普通关键词**转成可以安全拼进正则的字面量。
 *
 * 🔴 这是"允许超管加词"的前提：不转义就等于让网页编辑正则。
 *    `(`、`[`、`*`、`\` 这类字符会直接让 `new RegExp` 抛错（→ 发评论全站 500），
 *    `(a+)+$` 这类会回溯爆炸（→ Workers CPU 超限）。转义后它们只是普通字符。
 *
 * 同时刻意**不允许空词**：空串会匹配一切。
 */
function escapeKeyword(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 用「代码基线 + 数据库叠加」构造生效中的匹配器。
 *
 * ## 生效规则（简单可预测）
 *
 *   有效词表 = 代码基线的各**启用**类别 + 库里各该类别的自定义关键词
 *   停用某类别 = 该类别**连同你在里面加的词**一起不生效
 *
 *   刻意不让"停用类别但自定义词仍生效" —— 那种规则没人能预测得准。
 *
 * ## 性能
 *
 * 自定义词按类别拼成**一个**正则（而不是逐词 `test`），命中成本与基线同级。
 * 实测基线 0.0040ms/条；自定义词通常只有几条，影响可忽略。
 *
 * @param {{keywords?: {text: string, category: string}[], disabled?: string[]}} overlay
 * @returns {{categories: {name: string, re: RegExp, custom: number}[], structural: {name: string, re: RegExp}[]}}
 */
export function buildMatcher(overlay = {}) {
  const disabled = new Set((overlay.disabled || []).map(String))

  // 自定义词按类别归组（类别可能是基线里没有的新名字）
  const customByCategory = new Map()
  for (const row of overlay.keywords || []) {
    const category = String(row?.category || '').trim()
    const text = String(row?.text || '').trim()
    if (!category || !text) continue
    if (!customByCategory.has(category)) customByCategory.set(category, new Set())
    customByCategory.get(category).add(text)
  }

  const categories = []
  // 基线类别：被停用的整个跳过（含其自定义词）
  for (const [name, re] of Object.entries(BLOCKLIST_CATEGORY_PATTERNS)) {
    if (disabled.has(name)) continue
    const custom = [...(customByCategory.get(name) || [])]
    categories.push({
      name,
      re: custom.length ? new RegExp(`${re.source}|${custom.map(escapeKeyword).join('|')}`, 'i') : re,
      custom: custom.length
    })
  }
  // 超管**新建**的类别（基线里没有的）：只由自定义词构成
  for (const [name, set] of customByCategory) {
    if (BLOCKLIST_CATEGORY_PATTERNS[name]) continue
    if (disabled.has(name)) continue
    const custom = [...set]
    if (!custom.length) continue
    categories.push({
      name,
      re: new RegExp(custom.map(escapeKeyword).join('|'), 'i'),
      custom: custom.length
    })
  }

  return { categories, structural: COMPILED_STRUCTURAL }
}

/** 基线的默认匹配器（库读不到时用这个，基础防护不受影响） */
const BASELINE_MATCHER = buildMatcher()

/**
 * 判断文本是否应进待审。
 * 返回命中的来源名数组（类别名/结构性规则名）；空数组表示干净。
 *
 * @param {string} text
 * @param {{categories: {name: string, re: RegExp}[], structural: {name: string, re: RegExp}[]}} [matcher]
 *   不传则用代码基线 —— 后台预览、单测、以及"库不可用"时的兜底都靠这个默认值。
 *
 * 性能：约 0.0040ms/条（本地实测，基线），远低于免费版 10ms CPU 预算。
 */
export function matchReview(text, matcher = BASELINE_MATCHER) {
  const hits = []
  if (!text) return hits
  for (const { name, re } of matcher.categories || []) if (re.test(text)) hits.push(name)
  for (const { name, re } of matcher.structural || COMPILED_STRUCTURAL) if (re.test(text)) hits.push(name)
  return hits
}

/**
 * 审核词表的内存缓存（模块级）。
 *
 * 🔴 为什么必须有缓存：`matchReview` 跑在**每一条评论提交的关键路径**上。
 *    若每次都去 D1 读词表，发一条评论就多一次数据库往返 —— 那才是真正的性能消耗
 *    （还烧 D1 配额）。缓存后同一 Worker 实例内绝大多数请求**零额外查询**。
 *
 * 代价：超管改完词表后，**最长 `TTL_MS` 才全量生效**（各实例各自到期）。
 * 这对"审核词表"完全可接受（不是秒级敏感的配置）；后台保存成功后会清本地缓存，
 * 所以改的人自己立刻能看到效果。
 */
const CACHE_TTL_MS = 30_000
let cachedMatcher = null
let cachedAt = 0
let inflight = null

/** 清缓存（超管保存词表后调用，让改动在本实例立刻生效） */
export function invalidateReviewMatcher() {
  cachedMatcher = null
  cachedAt = 0
  inflight = null
}

/**
 * 把缓存时间戳往前拨（**仅测试用**）。
 *
 * 有了它，"TTL 到期后会重新读库"这条才能在测试里秒级验证 ——
 * 否则要真等 30 秒。生产代码不该调用它。
 */
export function setCachedAtForTest(ts) {
  cachedAt = ts
}

/**
 * 取生效中的匹配器：优先缓存 → 否则读库构造 → 库不可用则回落基线。
 *
 * @param {() => Promise<{keywords?: object[], disabled?: string[]}>} loadOverlay 读库函数
 */
export async function getReviewMatcher(loadOverlay) {
  const now = Date.now()
  if (cachedMatcher && now - cachedAt < CACHE_TTL_MS) return cachedMatcher
  // 并发请求只读一次库（否则一波流量会各自打一次 D1）
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const overlay = await loadOverlay()
      return buildMatcher(overlay || {})
    } catch (err) {
      /*
       * 🔴 读库失败**必须回落基线**，不能抛出去：
       *    审核词表读不到就让人发不出评论，是把"配置故障"放大成"全站故障"。
       *    基线在代码里，基础防护照旧生效。
       */
      console.error('review matcher load failed, falling back to baseline:', err)
      return BASELINE_MATCHER
    } finally {
      inflight = null
    }
  })()

  cachedMatcher = await inflight
  cachedAt = Date.now()
  return cachedMatcher
}
