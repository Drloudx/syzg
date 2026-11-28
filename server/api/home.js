/**
 * 首页可配置内容与公告管理接口。
 */
import { ERR, bad, json, writeAudit } from './shared.js'

/* ============================================================
 * 首页内容（2026-11-01，迁移第 12 步）
 * 设计依据：docs/context/technical/HOME_CONTENT.md
 *
 * 五张表：notices / home_banners / home_links / home_heroes / home_blocks
 * 权限：全部管理端点要求 role >= ROLE_SUPER（与「系统设置」同级）
 * 缓存：公开读接口在本 isolate 内存里缓存 60 秒
 * ============================================================ */

/** 公开读缓存：isolate 内存，60 秒。?fresh=1 可跳过 */
const HOME_CONFIG_CACHE_MS = 60_000
let homeConfigCache = null
let homeConfigCacheAt = 0

/**
 * 按 `home_notice_slots` 组装首页公告区的 4 个位置。
 *
 * 规则（2026-11-01 定）：
 *   - 插槽有 `notice_id` → 用该条公告（可能是三个月前的老公告）
 *   - 插槽为 NULL     → **动态默认**：按日期倒序在「未被其他插槽占用」的公告里补位
 *
 * 为什么要「排除已占用」：
 *   站点位置 1 固定挂最老的站点声明。若位置 2 不排除已占用的，
 *   它会取到最新一条；但若位置 1 恰好也是最新（新建站时），
 *   两条就会显示同一条公告。
 *
 * @param {Array} notices   该频道全部启用中的公告（已按 date DESC 排好）
 * @param {Array} slots     该频道的插槽行（slot 1..4）
 * @returns {Array} 长度为 4 的数组，元素为公告行或 null
 */
function composeNoticeSlots(notices, slots) {
  const byId = new Map(notices.map((n) => [n.id, n]))
  const used = new Set()
  const out = new Array(4).fill(null)

  // 第一轮：处理显式指定的位置
  for (const s of slots) {
    const idx = Number(s.slot) - 1
    if (idx < 0 || idx > 3) continue
    if (!s.notice_id) continue
    const row = byId.get(s.notice_id)
    if (!row) continue // 公告被删或停用 → 该位置留空，走动态补位
    out[idx] = row
    used.add(row.id)
  }

  // 第二轮：空位置按日期倒序补最新（跳过已占用的）
  const pool = notices.filter((n) => !used.has(n.id))
  let cursor = 0
  for (let i = 0; i < 4; i++) {
    if (out[i]) continue
    while (cursor < pool.length && used.has(pool[cursor].id)) cursor++
    if (cursor >= pool.length) break
    out[i] = pool[cursor]
    used.add(pool[cursor].id)
    cursor++
  }

  return out
}

/** 统一的空值兜底：D1 里没有行时返回空数组，前端用 DEFAULT_* 顶上 */
async function loadHomeConfig(env) {
  const [notices, banners, links, heroes, blocks, slots] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM notices WHERE is_active = 1
       ORDER BY channel, date DESC`
    ).all(),
    env.DB.prepare(
      'SELECT * FROM home_banners WHERE is_active = 1 ORDER BY sort_order, id'
    ).all(),
    env.DB.prepare('SELECT * FROM home_links WHERE is_active = 1 ORDER BY section, slot').all(),
    env.DB.prepare('SELECT * FROM home_heroes WHERE is_active = 1 ORDER BY slot').all(),
    env.DB.prepare('SELECT * FROM home_blocks WHERE is_active = 1').all(),
    // 插槽表可能尚未迁移（老库），失败时退化为「全动态」
    env.DB.prepare('SELECT * FROM home_notice_slots ORDER BY channel, slot').all().catch(() => ({ results: [] }))
  ])

  const noticeRows = notices.results || []
  const slotRows = slots.results || []
  const siteNotices = noticeRows.filter((r) => r.channel === 'site')
  const officialNotices = noticeRows.filter((r) => r.channel === 'official')

  /*
   * 首页公告区：站点与官方各 4 个位置。
   * 位置里的 null 保留（前端据此显示「该位置未选择」或折叠），
   * 但为了兼容旧前端（按数组顺序渲染），这里把存在的公告按位置顺序摊平输出。
   */
  const siteSlots = composeNoticeSlots(siteNotices, slotRows.filter((s) => s.channel === 'site'))
  const officialSlots = composeNoticeSlots(officialNotices, slotRows.filter((s) => s.channel === 'official'))

  return {
    notices: [
      ...siteSlots.filter(Boolean).map(cloneNotice),
      ...officialSlots.filter(Boolean).map(cloneNotice)
    ],
    // 插槽明细：前端要按「位置」渲染时用它（null 表示该位置空着）
    noticeSlots: {
      site: siteSlots.map((n) => (n ? n.id : null)),
      official: officialSlots.map((n) => (n ? n.id : null))
    },
    banners: (banners.results || []).map(cloneBanner),
    links: (links.results || []).map(cloneLink),
    heroes: (heroes.results || []).map(cloneHero),
    blocks: (blocks.results || []).map(cloneBlock)
  }
}

/** 行 → 公开 JSON（去掉内部字段，features_json 解析成数组） */
const cloneNotice = (r) => ({
  id: r.id,
  channel: r.channel,
  tier: r.tier,
  slot: r.slot,
  title: r.title,
  content: r.content,
  date: r.date,
  tagText: r.tag_text,
  tagClass: r.tag_class,
  version: r.version,
  features: parseJsonArray(r.features_json),
  sourceUrl: r.source_url,
  // 1 = 有新内容时自动弹窗；官方频道恒为 0（第 13 步新增列）
  showInModal: Number(r.show_in_modal) || 0
})

const cloneBanner = (r) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  tagText: r.tag_text,
  tagClass: r.tag_class,
  subTag: r.sub_tag,
  image: r.image_url,
  bgColor: r.bg_color,
  blendStart: r.blend_start,
  btnText: r.btn_text,
  actionType: r.action_type,
  actionValue: r.action_value,
  sortOrder: r.sort_order
})

const cloneLink = (r) => ({
  section: r.section,
  slot: r.slot,
  title: r.title,
  description: r.description,
  route: r.route,
  queryString: r.query_string,
  iconSource: r.icon_source,
  iconUrl: r.icon_url,
  badgeText: r.badge_text,
  badgeColor: r.badge_color
})

const cloneHero = (r) => ({
  slot: r.slot,
  heroId: r.hero_id,
  tip: r.tip
})

const cloneBlock = (r) => ({
  section: r.section,
  title: r.title,
  subtitle: r.subtitle,
  rows: parseJsonArray(r.rows_json)
})

/** JSON 列容错解析：坏了就当空数组，不让首页整页炸掉 */
function parseJsonArray(raw) {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * 公开读：GET /api/home-config
 *
 * 缓存 60 秒。理由：首页每次访问都打一次这个端点，5 张表的全量读
 * 在 D1 免费额度下虽够用，但没必要每次都读。60 秒足够让「后台改完刷新即见」，
 * 又能把高峰期的重复读压掉。
 * 想绕过缓存（后台保存后立即核对）用 `?fresh=1`。
 */
export async function getHomeConfig(env, { fresh = false } = {}) {
  const now = Date.now()
  if (!fresh && homeConfigCache && now - homeConfigCacheAt < HOME_CONFIG_CACHE_MS) {
    return homeConfigCache
  }
  const data = await loadHomeConfig(env)
  homeConfigCache = data
  homeConfigCacheAt = now
  return data
}

/** 后台保存后让缓存失效，避免「改完还是旧内容」 */
export function invalidateHomeConfigCache() {
  homeConfigCache = null
  homeConfigCacheAt = 0
}

/* ---------- 写操作：公告单条 CRUD ---------- */

const NOTICE_FIELDS = {
  channel: 'channel',
  tier: 'tier',
  slot: 'slot',
  title: 'title',
  content: 'content',
  date: 'date',
  tagText: 'tag_text',
  tagClass: 'tag_class',
  version: 'version',
  sourceUrl: 'source_url',
  isActive: 'is_active'
}

/** 校验公告 payload；返回 { error } 或 { values } */
function normalizeNotice(body) {
  const title = String(body?.title || '').trim()
  if (!title) return { error: '标题不能为空' }
  const channel = body?.channel === 'official' ? 'official' : 'site'
  const tier = body?.tier === 'pin' ? 'pin' : 'normal'
  const date = String(body?.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: '日期需为 YYYY-MM-DD' }
  const slot = tier === 'pin' && Number.isFinite(Number(body?.slot)) ? Number(body.slot) : null
  return {
    values: {
      channel,
      tier,
      slot,
      title,
      content: body?.content == null ? null : String(body.content),
      date,
      tag_text: body?.tagText == null ? null : String(body.tagText),
      tag_class: body?.tagClass == null ? null : String(body.tagClass),
      version: body?.version == null ? null : String(body.version),
      features_json: Array.isArray(body?.features) ? JSON.stringify(body.features) : null,
      source_url: body?.sourceUrl == null ? null : String(body.sourceUrl),
      is_active: body?.isActive === 0 || body?.isActive === false ? 0 : 1,
      /*
       * 自动弹窗：**站点频道一律 1，官方一律 0**（2026-11-02 简化）。
       *
       * 之前是前端勾选框控制的，但实际使用中永远是勾上的 ——
       * 「站内公告」发布的目的就是让人看到，留个开关只会让人忘勾。
       * 官方公告是游戏版本信息，不该在用户进站时打扰，恒为 0。
       *
       * 这里按 channel 强约束、**忽略 body.showInModal**：
       * 前端不再传这个字段，直接调 API 也改不了。
       */
      show_in_modal: channel === 'site' ? 1 : 0
    }
  }
}

/* ---------- 写操作：四块固定槽位，整组 PUT ---------- */

const MAX_SLOT = 4

function normalizeBanners(list) {
  if (!Array.isArray(list)) return { error: 'banners 需为数组' }
  const out = []
  for (const [i, b] of list.entries()) {
    const title = String(b?.title || '').trim()
    if (!title) return { error: `第 ${i + 1} 张海报缺少标题` }
    const type = ['route', 'notice', 'external'].includes(b?.actionType) ? b.actionType : 'route'
    const value = String(b?.actionValue || '').trim()
    if (type === 'external' && value && !/^https:\/\//i.test(value)) {
      return { error: `第 ${i + 1} 张海报的外链必须是 https:// 开头` }
    }
    if (/^(javascript|data):/i.test(value)) {
      return { error: `第 ${i + 1} 张海报的链接含非法协议` }
    }
    out.push({
      id: String(b?.id || '').trim() || `banner-${Date.now()}-${i}`,
      title,
      description: b?.description == null ? null : String(b.description),
      tag_text: b?.tagText == null ? null : String(b.tagText),
      tag_class: b?.tagClass == null ? null : String(b.tagClass),
      sub_tag: b?.subTag == null ? null : String(b.subTag),
      image_url: b?.image == null ? null : String(b.image),
      bg_color: b?.bgColor == null ? null : String(b.bgColor),
      blend_start: b?.blendStart == null ? null : String(b.blendStart),
      btn_text: b?.btnText == null ? null : String(b.btnText),
      action_type: type,
      action_value: value || null,
      sort_order: i + 1,
      is_active: b?.isActive === 0 || b?.isActive === false ? 0 : 1
    })
  }
  return { values: out }
}

function normalizeLinks(section, list) {
  if (!['core', 'tool'].includes(section)) return { error: 'section 需为 core 或 tool' }
  if (!Array.isArray(list)) return { error: 'links 需为数组' }
  if (list.length > MAX_SLOT) return { error: `${section} 最多 ${MAX_SLOT} 格` }
  const out = []
  for (const [i, l] of list.entries()) {
    const title = String(l?.title || '').trim()
    const route = String(l?.route || '').trim()
    if (!title) return { error: `第 ${i + 1} 格缺少标题` }
    if (!route.startsWith('/')) return { error: `第 ${i + 1} 格的路由需以 / 开头` }
    out.push({
      section,
      slot: i + 1,
      title,
      description: l?.description == null ? null : String(l.description),
      route,
      query_string: l?.queryString == null ? null : String(l.queryString),
      icon_source: l?.iconSource === 'custom' ? 'custom' : 'nav',
      icon_url: l?.iconUrl == null ? null : String(l.iconUrl),
      badge_text: l?.badgeText == null ? null : String(l.badgeText),
      badge_color: l?.badgeColor == null ? null : String(l.badgeColor),
      is_active: l?.isActive === 0 || l?.isActive === false ? 0 : 1
    })
  }
  return { values: out }
}

function normalizeHeroes(list) {
  if (!Array.isArray(list)) return { error: 'heroes 需为数组' }
  if (list.length > MAX_SLOT) return { error: `核心角色最多 ${MAX_SLOT} 格` }
  const out = []
  for (const [i, h] of list.entries()) {
    const heroId = String(h?.heroId || '').trim()
    if (!heroId) return { error: `第 ${i + 1} 格缺少 heroId` }
    out.push({
      slot: i + 1,
      hero_id: heroId,
      tip: h?.tip == null ? null : String(h.tip),
      is_active: h?.isActive === 0 || h?.isActive === false ? 0 : 1
    })
  }
  return { values: out }
}

/**
 * 底栏行内行动类型白名单。
 *
 * 🔴 必须校验：`rows_json` 是整体透传的 JSON，不校验的话
 *    `actionType='external', actionValue='javascript:alert(1)'` 会原样入库。
 *    前端 dispatchAction 有第二道 https 校验挡着，但数据层的闸不能只靠前端
 *    —— 将来若导出、其他端渲染、或后台预览直接插 DOM，就没保护了。
 */
const BLOCK_ACTION_TYPES = new Set(['none', 'route', 'notice', 'external'])

/** 校验并规整底栏的一行；返回 { row } 或 { error } */
function normalizeBlockRow(raw, sectionLabel, rowIndex) {
  const where = `${sectionLabel}第 ${rowIndex + 1} 行`
  const actionType = BLOCK_ACTION_TYPES.has(raw?.actionType) ? raw.actionType : 'none'
  const actionValue = raw?.actionValue == null ? '' : String(raw.actionValue).trim()

  if (actionType === 'route' && actionValue && !actionValue.startsWith('/')) {
    return { error: `${where}：站内跳转的路径需以 / 开头` }
  }
  if (actionType === 'external' && actionValue) {
    if (/^(javascript|data|vbscript):/i.test(actionValue)) {
      return { error: `${where}：链接含非法协议` }
    }
    if (!/^https:\/\//i.test(actionValue)) {
      return { error: `${where}：外部链接必须是 https:// 开头` }
    }
  }
  if (actionType === 'notice' && actionValue) {
    // 公告 id 允许字母数字与连字符，不允许带协议或路径
    if (/[\/\\]|^https?:/i.test(actionValue)) {
      return { error: `${where}：公告 id 不能包含协议或斜杠` }
    }
  }

  return {
    row: {
      tag: raw?.tag == null ? '' : String(raw.tag),
      label: raw?.label == null ? '' : String(raw.label),
      text: raw?.text == null ? '' : String(raw.text),
      actionType,
      actionValue: actionValue || ''
    }
  }
}

function formatDailyWindow(startHour, endHour) {
  const start = `${String(startHour).padStart(2, '0')}:00`
  const end = endHour >= 24 ? '23:59' : `${String(endHour).padStart(2, '0')}:00`
  return `${start} ~ ${end}`
}

/** 校验并规整「今日必做」的一条；返回 { row } 或 { error } */
function normalizeDailyRow(raw, rowIndex) {
  const where = `今日必做第 ${rowIndex + 1} 项`
  const label = raw?.label == null ? '' : String(raw.label).trim()
  if (!label) return { error: `${where}缺少名称` }

  const kind = raw?.kind === 'meal' ? 'meal' : 'regular'
  const rawId = raw?.id == null ? '' : String(raw.id).trim()
  const id = (rawId || `daily_${rowIndex + 1}`).slice(0, 64)
  const hint = raw?.hint == null ? '' : String(raw.hint).trim()
  const route = raw?.route == null ? '' : String(raw.route).trim()

  if (route && (!route.startsWith('/') || route.startsWith('//') || /^(javascript|data|vbscript):/i.test(route))) {
    return { error: `${where}：站内跳转路径必须是以单斜杠 / 开头的站内路由` }
  }

  if (kind === 'meal') {
    const startParsed = Number(raw?.startHour)
    const endParsed = Number(raw?.endHour)
    const startHour = Number.isFinite(startParsed) ? Math.min(23, Math.max(0, Math.trunc(startParsed))) : 12
    const endHour = Number.isFinite(endParsed) ? Math.min(24, Math.max(1, Math.trunc(endParsed))) : 24
    if (endHour <= startHour) {
      return { error: `${where}（${label}）：结束时间必须晚于开始时间` }
    }
    const windowText = raw?.windowText == null ? '' : String(raw.windowText).trim()
    return {
      row: {
        id,
        kind: 'meal',
        label,
        windowText: windowText || formatDailyWindow(startHour, endHour),
        startHour,
        endHour,
        icon: raw?.icon === 'dinner' ? 'dinner' : 'tea'
      }
    }
  }

  return {
    row: {
      id,
      kind: 'regular',
      label,
      hint,
      route
    }
  }
}

function normalizeBlocks(list) {
  if (!Array.isArray(list)) return { error: 'blocks 需为数组' }
  const out = []
  for (const [i, blk] of list.entries()) {
    const section = blk?.section === 'daily'
      ? 'daily'
      : (blk?.section === 'help' ? 'help' : 'guide')
    const title = String(blk?.title || '').trim()
    if (!title) return { error: `第 ${i + 1} 个区块缺少标题` }

    // 逐行校验并规整（不透传原始对象，避免夹带未声明的字段）
    let rowsJson = null
    if (Array.isArray(blk?.rows)) {
      const rows = []
      const seenIds = new Set()
      for (const [ri, raw] of blk.rows.entries()) {
        if (section === 'daily') {
          const { row, error } = normalizeDailyRow(raw, ri)
          if (error) return { error }
          let uniqueId = row.id
          while (seenIds.has(uniqueId)) {
            uniqueId = `${row.id}_${ri + 1}`
          }
          seenIds.add(uniqueId)
          rows.push({ ...row, id: uniqueId })
        } else {
          const { row, error } = normalizeBlockRow(raw, `「${title}」`, ri)
          if (error) return { error }
          rows.push(row)
        }
      }
      rowsJson = JSON.stringify(rows)
    }

    out.push({
      section,
      title,
      subtitle: blk?.subtitle == null ? null : String(blk.subtitle),
      rows_json: rowsJson,
      is_active: blk?.isActive === 0 || blk?.isActive === false ? 0 : 1
    })
  }
  return { values: out }
}

/* ---------- 管理端：读 ---------- */

/** GET /api/admin/home —— 后台读全量（含已停用项），不走公开缓存 */
export async function adminHomeGet(env) {
  const [notices, banners, links, heroes, blocks, slots] = await Promise.all([
    env.DB.prepare('SELECT * FROM notices ORDER BY channel, CASE tier WHEN \'pin\' THEN 0 ELSE 1 END, slot, date DESC').all(),
    env.DB.prepare('SELECT * FROM home_banners ORDER BY sort_order, id').all(),
    env.DB.prepare('SELECT * FROM home_links ORDER BY section, slot').all(),
    env.DB.prepare('SELECT * FROM home_heroes ORDER BY slot').all(),
    env.DB.prepare('SELECT * FROM home_blocks').all(),
    env.DB.prepare('SELECT * FROM home_notice_slots ORDER BY channel, slot').all().catch(() => ({ results: [] }))
  ])
  return json({
    ok: true,
    notices: (notices.results || []).map((r) => ({ ...cloneNotice(r), isActive: Number(r.is_active) })),
    // 8 个插槽的当前选择（null = 留空走动态）；后台用它回填选择器
    noticeSlots: (slots.results || []).map((r) => ({
      channel: r.channel,
      slot: r.slot,
      noticeId: r.notice_id || null
    })),
    banners: (banners.results || []).map((r) => ({ ...cloneBanner(r), isActive: Number(r.is_active) })),
    links: (links.results || []).map((r) => ({ ...cloneLink(r), isActive: Number(r.is_active) })),
    heroes: (heroes.results || []).map((r) => ({ ...cloneHero(r), isActive: Number(r.is_active) })),
    blocks: (blocks.results || []).map((r) => ({ ...cloneBlock(r), isActive: Number(r.is_active) }))
  })
}

/* ---------- 管理端：公告单条 CRUD ---------- */

/**
 * POST /api/admin/home/notices —— 新建公告
 * PATCH  /api/admin/home/notices —— 修改（body 需带 id）
 * DELETE /api/admin/home/notices —— 软删（is_active=0）
 *
 * 为什么公告用单条 CRUD、其余四块用整组 PUT：
 *   公告是**可增减**的流式内容（会持续新增），单条操作才能并发安全；
 *   其余四块是固定槽位，整组提交天然完成排序与增删。
 */
export async function adminNoticeWrite(env, request, actor, method, ts) {
  const body = await request.json().catch(() => null)
  if (!body) return bad(ERR.badRequest)

  if (method === 'DELETE') {
    const id = String(body.id || '').trim()
    if (!id) return bad(ERR.badRequest)
    const r = await env.DB.prepare(
      'UPDATE notices SET is_active = 0, updated_at = ?2 WHERE id = ?1'
    ).bind(id, ts).run()
    if (!r.meta?.changes) return bad(ERR.badRequest)
    await writeAudit(env, actor, { action: 'home.notice.delete', targetType: 'notice', targetId: id }, ts)
    invalidateHomeConfigCache()
    return json({ ok: true })
  }

  const { values, error } = normalizeNotice(body)
  if (error) return json({ ok: false, message: error }, 400)

  if (method === 'POST') {
    const id = String(body.id || '').trim() || (await nextNoticeId(env, values.channel))
    await env.DB.prepare(
      `INSERT INTO notices
         (id, channel, tier, slot, title, content, date, tag_text, tag_class,
          version, features_json, source_url, show_in_modal, is_active, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)`
    ).bind(
      id, values.channel, values.tier, values.slot, values.title, values.content,
      values.date, values.tag_text, values.tag_class, values.version,
      values.features_json, values.source_url, values.show_in_modal, values.is_active, ts
    ).run()
    await writeAudit(env, actor, { action: 'home.notice.create', targetType: 'notice', targetId: id, detail: values.title }, ts)
    invalidateHomeConfigCache()
    return json({ ok: true, id })
  }

  // PATCH
  const id = String(body.id || '').trim()
  if (!id) return bad(ERR.badRequest)
  await env.DB.prepare(
    `UPDATE notices SET
       channel = ?2, tier = ?3, slot = ?4, title = ?5, content = ?6, date = ?7,
       tag_text = ?8, tag_class = ?9, version = ?10, features_json = ?11,
       source_url = ?12, show_in_modal = ?13, is_active = ?14, updated_at = ?15
     WHERE id = ?1`
  ).bind(
    id, values.channel, values.tier, values.slot, values.title, values.content,
    values.date, values.tag_text, values.tag_class, values.version,
    values.features_json, values.source_url, values.show_in_modal, values.is_active, ts
  ).run()
  await writeAudit(env, actor, { action: 'home.notice.update', targetType: 'notice', targetId: id, detail: values.title }, ts)
  invalidateHomeConfigCache()
  return json({ ok: true })
}

/**
 * 生成下一个公告 ID：`site-N` / `official-N`。
 *
 * 取**同频道现有最大序号 + 1**。不用 COUNT(*) —— 删过公告后 COUNT 会重复。
 * 并发风险：两个请求同时算到同一个 N，`id` 是主键，第二个会插入失败。
 * 这里失败即报错让用户重试，比静默覆盖好（公告内容比 ID 连续性重要）。
 */
async function nextNoticeId(env, channel) {
  const prefix = channel === 'official' ? 'official-' : 'site-'
  const row = await env.DB.prepare(
    'SELECT id FROM notices WHERE id LIKE ?1 ORDER BY LENGTH(id) DESC, id DESC LIMIT 1'
  ).bind(`${prefix}%`).first()
  if (!row) return `${prefix}1`
  const n = Number.parseInt(String(row.id).slice(prefix.length), 10)
  return `${prefix}${Number.isFinite(n) ? n + 1 : 1}`
}

/* ---------- 管理端：首页公告插槽 ---------- */

/**
 * PUT /api/admin/home/notice-slots —— 保存 8 个插槽的选择。
 *
 * body: { slots: [{ channel, slot, noticeId }] }
 * `noticeId` 为空串/null 表示该位置「未选择」→ 前端走动态默认（取最新）。
 *
 * 校验：channel 必须 site/official，slot 必须 1..4，
 * noticeId 若给了就必须存在于 notices 表（防悬空）。
 */
export async function adminNoticeSlotsPut(env, request, actor, ts) {
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.slots)) return bad(ERR.badRequest)

  const CHANNELS = new Set(['site', 'official'])
  const rows = []
  for (const [i, s] of body.slots.entries()) {
    const channel = s?.channel
    if (!CHANNELS.has(channel)) return json({ ok: false, message: `第 ${i + 1} 项频道非法` }, 400)
    const slot = Number(s?.slot)
    if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SLOT) {
      return json({ ok: false, message: `第 ${i + 1} 项位置需为 1..${MAX_SLOT}` }, 400)
    }
    const rawId = s?.noticeId == null ? '' : String(s.noticeId).trim()
    if (rawId && /[\/\\]|^https?:/i.test(rawId)) {
      return json({ ok: false, message: `第 ${i + 1} 项公告 id 不能包含协议或斜杠` }, 400)
    }
    rows.push({ channel, slot, noticeId: rawId || null })
  }

  // 引用完整性：给的值必须存在
  const ids = [...new Set(rows.map((r) => r.noticeId).filter(Boolean))]
  if (ids.length) {
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(',')
    const found = await env.DB.prepare(
      `SELECT id FROM notices WHERE id IN (${placeholders})`
    ).bind(...ids).all()
    const foundSet = new Set((found.results || []).map((r) => r.id))
    const missing = ids.filter((id) => !foundSet.has(id))
    if (missing.length) {
      return json({ ok: false, message: `公告不存在：${missing.join(', ')}` }, 400)
    }
  }

  // 先删后插，保证「提交的 8 个位置 == 库里最终状态」
  const statements = [env.DB.prepare('DELETE FROM home_notice_slots')]
  for (const r of rows) {
    statements.push(
      env.DB.prepare(
        'INSERT INTO home_notice_slots (channel, slot, notice_id, updated_at) VALUES (?1,?2,?3,?4)'
      ).bind(r.channel, r.slot, r.noticeId, ts)
    )
  }
  await env.DB.batch(statements)
  await writeAudit(env, actor, {
    action: 'home.notice-slots.replace',
    targetType: 'home',
    targetId: 'notice-slots',
    detail: `${rows.length} 个位置`
  }, ts)
  invalidateHomeConfigCache()
  return json({ ok: true, count: rows.length })
}

/**
 * GET /api/admin/notices —— 公告管理列表（专属端点，不复用 /api/admin/home）
 *
 * 为什么不复用：
 *   `/api/admin/home` 一次返回 5 张表的全量，公告管理页只需要公告。
 *   列表页会翻页、搜索，每次都拉全站首页配置是浪费。
 *
 * 查询参数：
 *   channel  site | official | 省略=全部
 *   q        标题模糊搜索（LIKE %q%）
 *   page     1 起，每页 20
 *   size     每页条数，上限 50
 *
 * 返回里带 total 供分页器使用。
 */
export async function adminNoticesList(env, url) {
  const channel = url.searchParams.get('channel')
  const q = String(url.searchParams.get('q') || '').trim()
  const status = url.searchParams.get('status')
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const size = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('size') || '20', 10) || 20))

  const where = []
  const binds = []
  if (channel === 'site' || channel === 'official') {
    where.push('channel = ?')
    binds.push(channel)
  }
  if (status === '1' || status === '0') {
    where.push('is_active = ?')
    binds.push(Number.parseInt(status, 10))
  }
  if (q) {
    const cleanId = q.replace(/^#/, '').trim()
    where.push('(title LIKE ? OR id LIKE ?)')
    binds.push(`%${q}%`, `%${cleanId}%`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notices ${whereSql}`
  ).bind(...binds).first()
  const total = Number(totalRow?.n) || 0

  const rows = await env.DB.prepare(
    `SELECT * FROM notices ${whereSql}
     ORDER BY date DESC, id DESC
     LIMIT ? OFFSET ?`
  ).bind(...binds, size, (page - 1) * size).all()

  return json({
    ok: true,
    total,
    page,
    size,
    notices: (rows.results || []).map((r) => ({
      ...cloneNotice(r),
      isActive: Number(r.is_active),
      updatedAt: r.updated_at || null
    }))
  })
}

/**
 * GET /api/admin/notices/pick —— 首页选择器用的精简列表
 *
 * 只返回 id / title / date / channel，且**默认最近 10 条**（用户定的口径）。
 * 前端拿全量做本地过滤太浪费 —— 选择器不需要正文。
 *
 * 参数：channel、q（搜索时忽略 limit，最多 50 条）、limit（默认 10，上限 50）
 */
export async function adminNoticesPick(env, url) {
  const channel = url.searchParams.get('channel')
  const q = String(url.searchParams.get('q') || '').trim()
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '10', 10)
  const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 10))

  const where = ['is_active = 1']
  const binds = []
  if (channel === 'site' || channel === 'official') {
    where.push('channel = ?')
    binds.push(channel)
  }
  if (q) {
    where.push('title LIKE ?')
    binds.push(`%${q}%`)
  }

  // 搜索时放宽到 50 条，否则只取最近 limit 条
  const effectiveLimit = q ? 50 : limit
  const rows = await env.DB.prepare(
    `SELECT id, channel, title, date FROM notices
     WHERE ${where.join(' AND ')}
     ORDER BY date DESC, id DESC
     LIMIT ?`
  ).bind(...binds, effectiveLimit).all()

  return json({
    ok: true,
    limit: effectiveLimit,
    notices: (rows.results || []).map((r) => ({
      id: r.id,
      channel: r.channel,
      title: r.title,
      date: r.date
    }))
  })
}

/* ---------- 管理端：四块整组 PUT ---------- */

/**
 * PUT /api/admin/home/{banners|links|heroes|blocks} —— 整组替换
 *
 * 事务语义：先删后插。数量固定或可增减都由上层决定，这里只保证
 * 「提交的数组 == 库里的最终状态」，顺带完成排序。
 */
export async function adminHomePut(env, request, actor, section, ts) {
  const body = await request.json().catch(() => null)
  if (!body) return bad(ERR.badRequest)

  const statements = []
  let auditAction = ''
  let count = 0

  if (section === 'banners') {
    const { values, error } = normalizeBanners(body.banners)
    if (error) return json({ ok: false, message: error }, 400)
    statements.push(env.DB.prepare('DELETE FROM home_banners'))
    for (const v of values) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO home_banners
             (id, title, description, tag_text, tag_class, sub_tag, image_url,
              bg_color, blend_start, btn_text, action_type, action_value,
              sort_order, is_active, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)`
        ).bind(
          v.id, v.title, v.description, v.tag_text, v.tag_class, v.sub_tag, v.image_url,
          v.bg_color, v.blend_start, v.btn_text, v.action_type, v.action_value,
          v.sort_order, v.is_active, ts
        )
      )
    }
    auditAction = 'home.banners.replace'
    count = values.length
  } else if (section === 'links') {
    const sec = body.section === 'tool' ? 'tool' : 'core'
    const { values, error } = normalizeLinks(sec, body.links)
    if (error) return json({ ok: false, message: error }, 400)
    statements.push(env.DB.prepare('DELETE FROM home_links WHERE section = ?1').bind(sec))
    for (const v of values) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO home_links
             (section, slot, title, description, route, query_string,
              icon_source, icon_url, badge_text, badge_color, is_active)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
        ).bind(
          v.section, v.slot, v.title, v.description, v.route, v.query_string,
          v.icon_source, v.icon_url, v.badge_text, v.badge_color, v.is_active
        )
      )
    }
    auditAction = `home.links.${sec}.replace`
    count = values.length
  } else if (section === 'heroes') {
    const { values, error } = normalizeHeroes(body.heroes)
    if (error) return json({ ok: false, message: error }, 400)
    statements.push(env.DB.prepare('DELETE FROM home_heroes'))
    for (const v of values) {
      statements.push(
        env.DB.prepare(
          'INSERT INTO home_heroes (slot, hero_id, tip, is_active) VALUES (?1,?2,?3,?4)'
        ).bind(v.slot, v.hero_id, v.tip, v.is_active)
      )
    }
    auditAction = 'home.heroes.replace'
    count = values.length
  } else if (section === 'blocks') {
    const { values, error } = normalizeBlocks(body.blocks)
    if (error) return json({ ok: false, message: error }, 400)
    statements.push(env.DB.prepare('DELETE FROM home_blocks'))
    for (const v of values) {
      statements.push(
        env.DB.prepare(
          'INSERT INTO home_blocks (section, title, subtitle, rows_json, is_active) VALUES (?1,?2,?3,?4,?5)'
        ).bind(v.section, v.title, v.subtitle, v.rows_json, v.is_active)
      )
    }
    auditAction = 'home.blocks.replace'
    count = values.length
  } else {
    return bad(ERR.fallback, 404)
  }

  await env.DB.batch(statements)
  await writeAudit(env, actor, {
    action: auditAction,
    targetType: 'home',
    targetId: section,
    detail: `${count} 条`
  }, ts)
  invalidateHomeConfigCache()
  return json({ ok: true, count })
}


