import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSourceIndex, deriveChapterLockedIds, idChapterOf, HIDDEN_CHAPTERS } from '../../scripts/parse/chapterLock.mjs'
import { isVisible, setChapterLockedIds } from '../../src/config/visibility.js'

const load = (n) => {
  for (const p of [`raw/${n}`, `public/data/${n}`]) {
    try { return JSON.parse(readFileSync(p, 'utf8')) } catch { /* next */ }
  }
  throw new Error(`找不到 ${n}`)
}
const unwrap = v => v?.datas || v || {}

const TABLES = {
  rewardRes: load('reward.json'),
  petPoolRes: load('petPool.json'),
  menuRes: load('menu.json'),
  shopRes: load('shop.json'),
  itemExchangeRes: load('itemExchange.json'),
  formulaRes: load('formula.json'),
  taskRes: load('task.json')
}

const items = unwrap(load('item.json'))

/* ─────────── idChapterOf：章节解析 ─────────── */

test('reward id 章节解析：关卡 id 与带章节的活动 id', () => {
  /* c + 1位章节 + 关卡号 */
  assert.equal(idChapterOf('c43'), 4)
  assert.equal(idChapterOf('c415'), 4)
  assert.equal(idChapterOf('c53'), 5)
  assert.equal(idChapterOf('c511'), 5)
  assert.equal(idChapterOf('c19'), 1)
  assert.equal(idChapterOf('c110'), 1)
  /* 分隔符形式 */
  assert.equal(idChapterOf('task_wt_c4_02'), 4)
  assert.equal(idChapterOf('task_wt_c5_01'), 5)
  assert.equal(idChapterOf('collect_c4tyyc'), 4)
  assert.equal(idChapterOf('collect_c5tyyc'), 5)
  assert.equal(idChapterOf('yeWaiPet_c5'), 5)
  assert.equal(idChapterOf('yeWaiPet_c1'), 1)
})

test('reward id 章节解析：无章节线索返回 null（不猜测）', () => {
  /* 这些的章节信息在 category 里或压根没有，正则不能瞎猜 */
  assert.equal(idChapterOf('explore4_15'), null)
  assert.equal(idChapterOf('main51002_boss'), null)
  assert.equal(idChapterOf('collect_bl05'), null)
  assert.equal(idChapterOf('zhongzi15021'), null)
  assert.equal(idChapterOf('reward_item_10117'), null)
  assert.equal(idChapterOf('formula_item_10119'), null)
})

/* ─────────── 章节锁定：不误伤 ─────────── */

test('抽卡能获得的魔物蛋不得被章节锁定', () => {
  const locked = deriveChapterLockedIds(buildSourceIndex(TABLES))
  /* 这些蛋都在 petPool 常驻卡池里，任何进度都能抽 */
  const eggs = ['pet_016', 'pet_017', 'pet_044', 'pet_075', 'pet_083', 'pet_086', 'pet_088']
  for (const id of eggs) {
    assert.ok(!locked.has(id), `${id}（${items[id]?.name}）在常驻卡池里，不应被锁定`)
  }
})

test('料理与通用事件物品不得被章节锁定', () => {
  const locked = deriveChapterLockedIds(buildSourceIndex(TABLES))
  /* 清凉水露果饮：menu 食谱（第二章解锁）+ 每日补给 */
  assert.ok(!locked.has('item_30047'), '清凉水露果饮 有食谱来源，不应被锁定')
})

test('有前三章来源的物品不得被章节锁定', () => {
  const locked = deriveChapterLockedIds(buildSourceIndex(TABLES))
  /* 游离灯火的蛋 有 yeWaiPet_c1（第一章野外采集） */
  assert.ok(!locked.has('pet_044'), '游离灯火的蛋 有第一章来源')
  /* 常见材料在前三章都有掉落 */
  for (const id of ['item_10003', 'item_10088', 'item_10036']) {
    assert.ok(!locked.has(id), `${items[id]?.name} 有前三章来源`)
  }
})

/* ─────────── 章节锁定：确实锁定 ─────────── */

test('第四/五章专属装备应被锁定', () => {
  const locked = deriveChapterLockedIds(buildSourceIndex(TABLES))
  /* 魔花/冻炎/游侠/白魔 四套套装，只从 c4/c5 掉落 */
  for (const id of ['item_421013', 'item_421017', 'item_422013', 'item_423017']) {
    assert.ok(locked.has(id), `${items[id]?.name} 应被锁定`)
  }
})

test('锁定集合的每个 id 都必须真实存在于 item.json', () => {
  const locked = deriveChapterLockedIds(buildSourceIndex(TABLES))
  assert.ok(locked.size > 0, '锁定集合不应为空')
  const missing = [...locked].filter(id => !items[id])
  assert.deepEqual(missing, [], `锁定集合含表里不存在的 id: ${missing.join(', ')}`)
})

/* ─────────── visibility 统一入口 ─────────── */

test('isVisible 三条判据协同：黑名单 / 品阶 / 章节锁定', () => {
  setChapterLockedIds(['item_421013'])

  /* ① 手写黑名单命中 */
  assert.equal(isVisible({ id: 'item_99999', name: '22重' }), false, 'GM 包应隐藏')
  /* ② 4/5 阶装备 */
  assert.equal(isVisible({ id: 'x', category: [4], equip: { equipLevel: 4 } }), false, '4阶装备应隐藏')
  assert.equal(isVisible({ id: 'y', category: [4], equip: { equipLevel: 2 } }), true, '2阶装备应显示')
  /* ③ 章节锁定 */
  assert.equal(isVisible({ id: 'item_421013', name: '魔花头盔' }), false, '章节锁定应隐藏')
  /* 都不命中 */
  assert.equal(isVisible({ id: 'item_10003', name: '铜矿石' }), true, '普通材料应显示')
})

test('未加载章节锁定时不影响显示（避免闪空）', () => {
  setChapterLockedIds([])
  assert.equal(isVisible({ id: 'item_421013', name: '魔花头盔' }), true,
    '锁定集合为空时，只能靠黑名单与品阶判断')
})

test('HIDDEN_CHAPTERS 与产物一致', () => {
  assert.deepEqual(HIDDEN_CHAPTERS, [4, 5])
  const artifact = JSON.parse(readFileSync('public/data/parsed/chapter-lock.json', 'utf8'))
  assert.deepEqual(artifact.hiddenChapters, HIDDEN_CHAPTERS)
  assert.ok(Array.isArray(artifact.ids))
  assert.ok(artifact.ids.length > 0)
})
