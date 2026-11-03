/**
 * 内容可见性：按「未发布章节」自动推导需隐藏的物品。
 *
 * ## 背景
 * 游戏客户端用 `ExtentionMethod.CheckResultConditions` **按账号进度**过滤内容：
 * 未推进到某章时，该章物品/成就/关卡对玩家**完全不可见**。本站不连账号，
 * 改用「静态来源分析」近似——某物品**只可能**从第四、五章获得时，就视为未发布内容。
 *
 * ## 🔴 为什么必须扫描全部来源表
 * 只看 `reward.json` 会大面积误判。实测过的反例：
 *
 * | 物品 | 被误判原因 | 真实来源 |
 * | --- | --- | --- |
 * | 游离灯火的蛋 | 只看到 `explore5_16`(c5) | `yeWaiPet_c1` 第一章野外采集 |
 * | 抛雪芙洛波的蛋 | 同上 | `petPool` 常驻卡池可抽 |
 * | 吵吵蕈的蛋 | 同上 | `event_e_sp2` 通用事件 |
 * | 清凉水露果饮 | 只见 `mail_m_4_1`(c4) | `menu` 食谱（第二章解锁）+ 每日补给 |
 *
 * 因此必须同时扫 `reward` / `petPool` / `menu` / `shop` / `itemExchange` / `formula` / `task`。
 *
 * ## 判定规则
 * 一条来源标记为：
 *   - `chapter:N` —— 该来源限定第 N 章
 *   - `free`      —— 该来源不限章节（抽卡、商店、兑换、合成、料理、任务奖励、通用分类）
 *
 * 物品隐藏 ⇔ 存在 `chapter:4` 或 `chapter:5`，且既无 `chapter:0~3`，也无 `free`。
 *
 * ## 🔴 不要解析 reward id 里的章节号
 * reward id 格式不统一：`c53` = c5+关卡3、`c511` = c5+关卡11、`c415` = c4+关卡15。
 * 正则无法可靠拆分，一律以 `category` 为准（那是策划手写的标记）。
 */

/** 未发布的章节号 */
export const HIDDEN_CHAPTERS = [4, 5]

/** 表示「不限章节」的分类词 —— 出现且 id 无章节线索时，视为任意进度都可能获得 */
const GENERIC_CATEGORY_WORDS = [
  '采集', '探索', '活动', '事件', '邮件', '委托', '商店', '兑换',
  '通行证', '宝箱', '通用', '道具', '关卡掉落', '副本', '主线', '支线', '付费', '免费', '配方', '种植'
]

/**
 * 从 reward id 提取章节号；无章节线索返回 null。
 *
 * 🔴 通用分类（委托/采集/配方）**不等于**「不限章节」——
 * `task_wt_c4_02`「委托」实为第四章委托、`collect_c5tyyc`「采集」实为第五章场景宝箱。
 * 所以通用分类还要再查 id。实测 21/21 准确：
 *   c43 → 4     c415 → 4     c53 → 5     c19 → 1
 *   task_wt_c4_02 → 4        collect_c4tyyc → 4     yeWaiPet_c5 → 5
 *   explore4_15 → null（章节在 category 里）    zhongzi15021 → null
 */
export function idChapterOf(rewardId) {
  const s = String(rewardId ?? '')
  /* ① c + 1 位章节 + 1~2 位关卡号：c43 / c415 / c53 / c12 */
  const m1 = s.match(/^c(\d)(\d{1,2})(?:_|$)/i)
  if (m1) return Number(m1[1])
  /* ② 分隔符包围的 cN：_c4_ / -c5- / _c4tyxx */
  const m2 = s.match(/[_-]c(\d)(?:[_-]|ty(?=[a-z])|$)/i)
  if (m2) return Number(m2[1])
  /* ③ 末尾 _cN：xxx_c5 */
  const m3 = s.match(/[_-]c(\d)$/i)
  if (m3) return Number(m3[1])
  return null
}

/** 视为测试/内部数据、不计入来源的分类 */
const TEST_CATEGORY_WORDS = ['测试', '开发', '测试包']

const unwrap = (v) => v?.datas || v || {}

/**
 * 建立 itemId → Set<来源标记> 索引。
 *
 * @param {object} tables 各原始表（已是 datas 解包后的对象亦可）
 * @returns {Map<string, Set<string>>}
 */
export function buildSourceIndex(tables) {
  const reward = unwrap(tables.rewardRes)
  const petPool = unwrap(tables.petPoolRes)
  const menu = unwrap(tables.menuRes)
  const shop = unwrap(tables.shopRes)
  const exchange = unwrap(tables.itemExchangeRes)
  const formula = unwrap(tables.formulaRes)
  const task = unwrap(tables.taskRes)

  const index = new Map()
  const add = (itemId, tag) => {
    if (!itemId || typeof itemId !== 'string') return
    if (!index.has(itemId)) index.set(itemId, new Set())
    index.get(itemId).add(tag)
  }

  /* ── ① reward.json：掉落 / 任务 / 邮件 / 商店商品位 ── */
  for (const [rid, r] of Object.entries(reward)) {
    const cat = (r.category || []).map(String)
    if (cat.some(w => TEST_CATEGORY_WORDS.includes(w))) continue

    /* category 里的 cN 是策划手写标记，优先级最高 */
    const catChapters = cat.map(c => c.match(/^c(\d+)$/)?.[1]).filter(Boolean).map(Number)
    const isGeneric = cat.some(w => GENERIC_CATEGORY_WORDS.includes(w))

    /*
     * 有 category 章节号 → 直接采信
     * 否则若为通用分类 → 再用 id 补章节（委托/采集/配方常把章节写在 id 里）
     * 都没有 → free
     */
    let chapters = catChapters
    let freeTag = false
    if (!chapters.length && isGeneric) {
      const hint = idChapterOf(rid)
      if (hint !== null) chapters = [hint]
      else freeTag = true
    } else if (!chapters.length) {
      freeTag = true   /* 无章节号也无通用词：保守视为 free，避免误隐藏 */
    }

    for (const group of r.items || []) {
      for (const rule of group.rules || []) {
        const id = rule.typeId
        if (!id) continue
        if (chapters.length) chapters.forEach(n => add(id, `chapter:${n}`))
        if (freeTag) add(id, 'free')
      }
    }
  }

  /* ── ② petPool.json：抽卡卡池，任何进度都能抽 ── */
  for (const pool of Object.values(petPool)) {
    for (const arr of Object.values(pool.rareSetting || {})) {
      for (const entry of arr || []) add(entry.typeId, 'free')
    }
  }

  /* ── ③ menu.json：料理产出 ── */
  for (const [id, entry] of Object.entries(menu)) {
    add(entry.itemTypeId || id, 'free')
  }

  /* ── ④ shop.json：商店直售（exchangeIds 可直接是 itemId） ── */
  for (const s of Object.values(shop)) {
    for (const list of s.shopList || []) {
      for (const ex of list.exchangeIds || []) {
        if (typeof ex === 'string' && ex.startsWith('item_')) add(ex, 'free')
      }
    }
  }

  /* ── ⑤ itemExchange.json：兑换条目展开后取物品 ── */
  for (const entry of Object.values(exchange)) {
    const target = entry.reward
    if (!target) continue
    if (target.startsWith('item_')) { add(target, 'free'); continue }
    const r = reward[target]
    if (!r) continue
    for (const group of r.items || []) {
      for (const rule of group.rules || []) add(rule.typeId, 'free')
    }
  }

  /* ── ⑥ formula.json：工作台合成产出 ── */
  for (const entry of Object.values(formula)) {
    add(entry.showItemTypeId || entry.typeId, 'free')
  }

  /* ── ⑦ task.json：任务奖励内的物品 ── */
  const walkTask = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walkTask); return }
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && v.startsWith('item_') && /itemTypeId|typeId|itemId/i.test(k)) {
        add(v, 'free')
      } else {
        walkTask(v)
      }
    }
  }
  for (const t of Object.values(task)) {
    walkTask(t.reward)
    walkTask(t.steps)
  }

  return index
}

/**
 * 从来源索引判定「只可能来自未发布章节」的物品 id 集合。
 *
 * @param {Map<string, Set<string>>} index buildSourceIndex 的产物
 * @returns {Set<string>}
 */
export function deriveChapterLockedIds(index) {
  const locked = new Set()
  for (const [id, tags] of index) {
    const chapters = [...tags]
      .filter(t => t.startsWith('chapter:'))
      .map(t => Number(t.split(':')[1]))

    if (!chapters.some(n => HIDDEN_CHAPTERS.includes(n))) continue
    if (chapters.some(n => !HIDDEN_CHAPTERS.includes(n))) continue
    if (tags.has('free')) continue

    locked.add(id)
  }
  return locked
}

/**
 * 一次性构建：读表 → 索引 → 锁定集合。
 * 供 `scripts/parse/index.mjs` 在构建期调用一次，各产物共用。
 */
export function buildChapterLock({ readJson }) {
  const index = buildSourceIndex({
    rewardRes: readJson('reward.json'),
    petPoolRes: readJson('petPool.json'),
    menuRes: readJson('menu.json'),
    shopRes: readJson('shop.json'),
    itemExchangeRes: readJson('itemExchange.json'),
    formulaRes: readJson('formula.json'),
    taskRes: readJson('task.json')
  })
  return deriveChapterLockedIds(index)
}
