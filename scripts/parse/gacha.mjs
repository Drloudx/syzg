/**
 * 卡池数据（模拟招募页）。
 *
 * 结构说明（2026-11-11 重构）：
 *   产物 `parsed/gacha.json` 的 `pools` 按 **era（测次阵营）** 分组：
 *     · `3ce`：三测卡池 = 常规招募 + 活动招募（伽拉忒亚·特别招募），当前线上版本；
 *     · `4ce`：四测卡池 = 公主招募（德莉）+ 幽夜招募（洛莉安）+ 常规招募，即游戏 1.7.15 新四池（不含新锐）。
 *   每个 pool 带 `era` 字段；同 id 不同 era 的池各自独立（例：常规招募两测的候选角色不同）。
 *
 *   3ce 池的 `tiers`（候选池、星级权重、保底）来自**历史基线**（既有产物，重数据）；
 *   4ce 新池（公主/幽夜/四测常规）**由 raw 配置完整生成**：
 *     - `heroPool.<id>.rareSetting` → 各星级候选
 *     - `heroPool.<id>.rareChance`   → 星级权重 / 保底次数
 *     - `heroPool.<id>.typeGuaranty` → UP 保底
 *     - `hero.json`                  → 候选 name / icon / portrait / element / job
 *   页面展示字段（percTip / packDisplay / para / slotDesc / 期次贴图）统一从 raw 附加。
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { parsedDir, readJson } from './shared.mjs'

const file = 'gacha.json'
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** 读取既有产物（仅用于保留 initialWallet 等未重构字段）。 */
function readExisting(target) {
  if (!existsSync(target)) return null
  try {
    const data = JSON.parse(readFileSync(target, 'utf8'))
    if (data && Array.isArray(data.pools)) return data
  } catch {}
  return null
}

const table = v => v?.datas ?? v ?? {}
const text = v => (v == null ? '' : typeof v === 'object' ? String(v.text ?? v.name ?? '') : String(v))

/** 'YYYY-MM-DD HH:mm:ss'（月/日可不补零）→ 毫秒时间戳；空/非法返回 null。 */
function toMs(s) {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}):(\d{1,2}))?/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0))
  const t = d.getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * 原表卡池配置索引：key = `${kind}:${poolTypeId}`。
 */
function collectPoolMeta() {
  const meta = new Map()
  const collect = (poolsTable, timeTable, kind) => {
    for (const [poolTypeId, conf] of Object.entries(table(poolsTable))) {
      meta.set(`${kind}:${poolTypeId}`, { conf, time: null })
    }
    for (const [slotId, slot] of Object.entries(table(timeTable))) {
      for (const team of slot.heroTeam ?? []) {
        const entry = meta.get(`${kind}:${team.poolTypeId}`)
        if (!entry) continue
        entry.time = { ...team, slotId, slotDesc: slot.desc ?? '', open: Boolean(slot.open) }
      }
    }
  }
  collect(readJson('heroPool.json'), readJson('heroPoolTime.json'), 'hero')
  collect(readJson('petPool.json'), readJson('petPoolTime.json'), 'pet')
  return meta
}

/**
 * 新号初始持有（`raw/playerInit.json`）。
 */
function collectInitialWallet() {
  const init = readJson('playerInit.json') ?? {}
  return {
    money: Number(init.money) || 0,
    ke: Number(init.ke) || 0,
    payKe: Number(init.payKe) || 0,
    ti: Number(init.ti) || 0,
    items: (Array.isArray(init.initItems) ? init.initItems : [])
      .filter(entry => entry?.itemTypeId)
      .map(entry => ({ typeId: String(entry.itemTypeId), count: Number(entry.num) || 0 }))
  }
}

/* ────────────────────────────── tiers 构建（从 raw） ────────────────────────────── */

const RARITY_LABEL = { 3: 'rare3', 4: 'rare4', 5: 'rare5' }

/**
 * 由 raw `heroPool.<id>` 完整生成 tiers。
 * 候选顺序沿用 rareSetting 的定义顺序；档内权重 = UP 角色权重拉满到其余候选之和的一半以上，
 * 使 UP 命中占比恰为 50%（与游戏公告「命中 5 星时 50% 为 UP」一致），其余候选等权 1。
 */
function buildTiersFromRaw(conf, heroes) {
  const rareSetting = conf.rareSetting ?? {}
  const rareChance = Array.isArray(conf.rareChance) ? conf.rareChance : []
  const upTypes = Array.isArray(conf.upTypes) ? conf.upTypes : []
  const guaranty = conf.typeGuaranty?.rare5 ?? null

  // rareChance 索引：rare3/4/5 → { chance(星级权重), safe, firstSafe, secondSafeMin, secondSafeMax }
  const chanceByRare = {}
  for (const c of rareChance) chanceByRare[c.rare] = c

  const tiers = []
  for (const rank of [3, 4, 5]) {
    const key = RARITY_LABEL[rank]
    const list = Array.isArray(rareSetting[key]) ? rareSetting[key] : []
    if (!list.length) continue
    const chance = chanceByRare[key] ?? {}
    const weight = Number(chance.chance) || (rank === 5 ? 2.3 : rank === 4 ? 7.6 : 90.1)
    const safe = Number(chance.safe) || 0
    const firstSafe = Number(chance.firstSafe) || 0

    const total = list.length
    const upCount = list.filter(x => upTypes.includes(x.typeId)).length
    const nonUp = total - upCount
    // UP 每只权重：非UP 总权重(nonUp*1) 分给 upCount 只，使 UP 合计 = 50% ⇒ 每只 UP 权重 = (nonUp/upCount)*(1/1)≈nonUp/upCount（四舍五入保整）
    const upWeight = upCount > 0 && nonUp > 0 ? Math.max(1, Math.round(nonUp / upCount)) : 1

    const candidates = list.map(x => {
      const hid = x.typeId
      const h = heroes[hid] ?? {}
      const isUp = upTypes.includes(hid)
      const w = isUp ? upWeight : 1
      const img = h.img || ''
      return {
        typeId: hid,
        name: h.name ?? hid,
        quality: Number(h.rare) || rank,
        icon: img ? `/images/HeroBagPanel/${img}_ka.webp` : '',
        portrait: img ? `/images/chara/l/${img}.webp` : '',
        element: h.element ?? null,
        job: h.job ?? null,
        weight: w,
        isUp,
        detail: { path: '/heroes', query: { id: hid } },
        itemId: null,
        // duplicate 数量按星级（与既有产物一致：3星230/4星140/5星90，溢出→回忆结晶）
        duplicate: {
          fragments: 10,
          limit: rank === 5 ? 90 : rank === 4 ? 140 : 230,
          overflow: {
            typeId: 'item_20026', name: '回忆结晶', quality: 5,
            icon: '/images/Common_ItemIcon/item_20026.webp', count: rank === 5 ? 20 : rank === 4 ? 8 : 1
          }
        }
      }
    })

    // 档内条件概率与基础概率（仅用于展示，按权重占比计算）
    const sumW = candidates.reduce((s, c) => s + c.weight, 0)
    for (const c of candidates) {
      c.conditionalProbability = sumW ? c.weight / sumW : 0
      c.baseProbability = (weight / 100) * c.conditionalProbability
    }

    tiers.push({
      key, rank, quality: rank, weight,
      safe, firstSafe,
      secondSafeMin: Number(chance.secondSafeMin) || 0,
      secondSafeMax: Number(chance.secondSafeMax) || 0,
      guaranty: rank === 5 && guaranty ? { safe: Number(guaranty.safe) || 0, firstSafe: Number(guaranty.firstSafe) || 0, typeIds: guaranty.typeIds ?? [] } : null,
      probability: weight / 100,
      candidates
    })
  }
  tiers.sort((a, b) => a.rank - b.rank)
  return tiers
}

/* ────────────────────────────── 池身份定义（三测 / 四测） ────────────────────────────── */

/**
 * 要构建的池清单。每项：
 *   id              产物内唯一 id（era 前缀区分，避免与 3ce 同 poolTypeId 冲突）
 *   era             3ce / 4ce
 *   kind            hero
 *   poolTypeId      raw 里的 poolTypeId
 *   slotId          heroPoolTime 的 slot（决定开放时间与期次贴图）
 *   source          'baseline'（沿用既有 tiers）｜'raw'（从 raw 生成 tiers）
 *   baselineId      当 source=baseline 时，从既有产物的哪个 id 复制 tiers
 */
const HERO_POOLS = [
  // ===== 四测（游戏 1.7.15）：公主 + 幽夜 + 常规，全部由 raw 生成 =====
  { id: 'hero:4ce:2', era: '4ce', kind: 'hero', poolTypeId: '2', slotId: '2' },
  { id: 'hero:4ce:5', era: '4ce', kind: 'hero', poolTypeId: '5', slotId: '5' },
  { id: 'hero:4ce:1', era: '4ce', kind: 'hero', poolTypeId: '1', slotId: '3' }
]

/**
 * 生成替代消耗汇率 `exchangeCosts`（对应旧产物结构）：
 *   `para.gachaTicketsExchangeRate` → consume 表（如 chouka001：`ke:200`）→ 200 氪金换 1 券
 *   `para.gachaKeExchangeRate`      → consume 表（如 chouka002：`payKe:1`）→ 1 神晶换 1 氪金
 * 输出 `{ gachaTicketsExchangeRate:[{typeId:item_00002,count:200}], gachaKeExchangeRate:[{typeId:item_00003,count:1}] }`
 * （货币 typeId/名称/图标对齐 acquisitionRules.BASE_REWARD_ICONS：ke=item_00002 氪金、payKe=item_00003 神晶）
 */
const CURRENCY_META = {
  money: { typeId: 'item_00001', name: '银币', quality: 1 },
  ke: { typeId: 'item_00002', name: '氪金', quality: 1 },
  payKe: { typeId: 'item_00003', name: '神晶', quality: 1 },
  ti: { typeId: 'item_00004', name: '营地经验值', quality: 1 }
}

function buildExchangeCosts(para, consumeId) {
  const consumeMap = table(readJson('consume.json'))
  const mk = (entry) => {
    if (!entry) return null
    // consume 里用 ke/payKe/money/ti 字段表示货币消耗
    for (const field of ['payKe', 'ke', 'money', 'ti']) {
      const v = Number(entry[field]) || 0
      if (v > 0) {
        const meta = CURRENCY_META[field]
        return {
          typeId: meta.typeId, name: meta.name, quality: meta.quality,
          icon: `/images/Common_ItemIcon/${meta.typeId}.webp`, count: v
        }
      }
    }
    return null
  }
  const ticketEntry = consumeMap[para?.gachaTicketsExchangeRate]
  const keEntry = consumeMap[para?.gachaKeExchangeRate]
  const out = {}
  const tk = mk(ticketEntry)
  const ke = mk(keEntry)
  if (tk) out.gachaTicketsExchangeRate = [tk]
  if (ke) out.gachaKeExchangeRate = [ke]
  return Object.keys(out).length ? out : null
}

/**
 * 由 raw `consume.<consumeId>` 生成消耗列表（costs）：
 * consume.items 每项 { typeId, num } → { typeId, name(取 item 表), quality, icon, count }。
 * 按 `Common_ItemIcon/<typeId>.webp` 取图标（与既有产物一致）。
 */
function buildCostsFromRaw(consumeId, itemsTable) {
  const consumeMap = table(readJson('consume.json'))
  const entry = consumeMap[consumeId]
  if (!entry) return []
  return (entry.items ?? []).map(it => {
    const item = itemsTable[it.typeId] ?? {}
    return {
      typeId: it.typeId,
      name: item.name ?? it.typeId,
      quality: item.quality ?? 5,
      icon: `/images/Common_ItemIcon/${it.typeId}.webp`,
      count: Number(it.num) || 1
    }
  })
}

/**
 * 由 raw `reward.<rewardId>` 生成赠品（bonus）：
 * reward.items[].rules[].{ typeId, min/max, mode } → { kind:'item', name, count, typeId, icon, quality }。
 * 只取首条规则的代表数量（与游戏展示一致）。
 */
function buildBonusFromRaw(rewardId, itemsTable) {
  if (!rewardId) return []
  const rewardMap = table(readJson('reward.json'))
  const entry = rewardMap[rewardId]
  if (!entry) return []
  const out = []
  for (const group of entry.items ?? []) {
    const rule = (group.rules ?? [])[0]
    if (!rule || !rule.typeId) continue
    const item = itemsTable[rule.typeId] ?? {}
    const count = Number(rule.max ?? rule.min ?? 1) || 1
    out.push({
      kind: 'item',
      name: item.name ?? rule.typeId,
      count,
      typeId: rule.typeId,
      icon: `/Common_ItemIcon/${rule.typeId}.webp`,
      quality: item.quality ?? 5
    })
  }
  return out
}

function buildHeroPool(def, meta, heroes, itemsTable) {
  const entry = meta.get(`hero:${def.poolTypeId}`)
  const conf = entry?.conf ?? {}
  const time = entry?.time ?? null

  const tiers = buildTiersFromRaw(conf, heroes)

  // 池展示名：优先 heroPool.name（如「公主招募」「幽夜招募」「常规招募」）
  const name = text(conf.name) || `卡池${def.poolTypeId}`
  const packDisplay = conf.packDisplay ?? ''
  const para = conf.para ?? {}
  const upTypes = Array.isArray(conf.upTypes) ? conf.upTypes : []

  // 期次贴图 / 立绘 / 小图标
  const img = time?.img ?? ''
  const imgTitle = time?.imgTitle ?? ''
  const icon = conf.icon ?? ''
  const cover = img ? `/images/gacha/${img}.webp` : '/images/gacha/gacha_p0.webp'

  return {
    id: def.id,
    era: def.era,
    kind: 'hero',
    poolTypeId: def.poolTypeId,
    slotId: def.slotId,
    stateKey: def.id,
    name,
    des: conf.des ?? '',
    percTip: conf.percTip ?? '',
    upTypes,
    packDisplay,
    rewardId: conf.reward ?? '',
    consumeId: conf.consume ?? '',
    para,
    typeGuaranty: conf.typeGuaranty ?? null,
    open: time ? Boolean(time.open) : true,
    openTime: time?.openTime ?? '',
    closeTime: time?.closeTime ?? '',
    opensAt: toMs(time?.openTime),
    closesAt: toMs(time?.closeTime),
    slotDesc: time?.slotDesc ?? '',
    assets: {
      cover,
      coverSprite: img,
      titleSprite: imgTitle,
      poolSprite: icon
    },
    // 消耗与赠品：直接从原表生成（consume / reward），不依赖历史基线
    costs: buildCostsFromRaw(conf.consume, itemsTable),
    bonus: buildBonusFromRaw(conf.reward, itemsTable),
    // 替代消耗：契约书→氪金/氪金→神晶 的汇率（来自 para 指向的 consume 表）
    exchangeCosts: buildExchangeCosts(para, conf.consume),
    tiers
  }
}

/* ────────────────────────────── 魔物蛋 tiers 构建（从 raw） ────────────────────────────── */

const PET_RARITY = {
  rare1: { rank: 1, quality: 3 },
  rare2: { rank: 2, quality: 4 },
  rare3: { rank: 3, quality: 5 }
}

/**
 * 由 raw `petPool.<id>` 生成 tiers。pet 用 star(1/2/3)→rank/quality（quality=star+2），
 * 候选图 `/images/eggs/<typeId>.webp`（与既有产物一致）。
 */
function buildPetTiersFromRaw(conf, pets) {
  const rareSetting = conf.rareSetting ?? {}
  const rareChance = Array.isArray(conf.rareChance) ? conf.rareChance : []
  const upTypes = Array.isArray(conf.upTypes) ? conf.upTypes : []
  const chanceByRare = {}
  for (const c of rareChance) chanceByRare[c.rare] = c

  const tiers = []
  for (const rareKey of ['rare1', 'rare2', 'rare3']) {
    const list = Array.isArray(rareSetting[rareKey]) ? rareSetting[rareKey] : []
    if (!list.length) continue
    const { rank, quality } = PET_RARITY[rareKey]
    const chance = chanceByRare[rareKey] ?? {}
    const weight = Number(chance.chance) || (rank === 3 ? 2.3 : rank === 2 ? 7.6 : 90.1)
    const total = list.length
    const upCount = list.filter(x => upTypes.includes(x.typeId)).length
    const nonUp = total - upCount
    const upWeight = upCount > 0 && nonUp > 0 ? Math.max(1, Math.round(nonUp / upCount)) : 1
    const guarantyRaw = conf.typeGuaranty?.[rareKey] ?? null

    const candidates = list.map(x => {
      const tid = x.typeId
      const pet = pets[tid] ?? {}
      const isUp = upTypes.includes(tid)
      const img = `/images/eggs/${tid}.webp`
      return {
        typeId: tid,
        name: pet.name ?? tid,
        quality,
        icon: img,
        portrait: img,
        element: pet.element ?? null,
        job: null,
        weight: isUp ? upWeight : 1,
        isUp,
        detail: { path: '/pets', query: { id: tid } },
        itemId: tid,
        duplicate: null
      }
    })
    const sumW = candidates.reduce((s, c) => s + c.weight, 0)
    for (const c of candidates) {
      c.conditionalProbability = sumW ? c.weight / sumW : 0
      c.baseProbability = (weight / 100) * c.conditionalProbability
    }
    tiers.push({
      key: rareKey, rank, quality, weight,
      safe: Number(chance.safe) || 0,
      firstSafe: Number(chance.firstSafe) || 0,
      secondSafeMin: Number(chance.secondSafeMin) || 0,
      secondSafeMax: Number(chance.secondSafeMax) || 0,
      guaranty: guarantyRaw ? { safe: Number(guarantyRaw.safe) || 0, firstSafe: Number(guarantyRaw.firstSafe) || 0, typeIds: guarantyRaw.typeIds ?? [] } : null,
      probability: weight / 100,
      candidates
    })
  }
  tiers.sort((a, b) => a.rank - b.rank)
  return tiers
}

/**
 * 魔物蛋池定义：全部四测，顺序 = 特别贩售 → 御卫贩售 → 古堡(圣经)贩售 → 常规贩售。
 * tiers 全部由 raw petPool 生成。
 */
const PET_POOLS = [
  { id: 'pet:4ce:1', era: '4ce', kind: 'pet', poolTypeId: '1', slotId: '1' },
  { id: 'pet:4ce:3', era: '4ce', kind: 'pet', poolTypeId: '3', slotId: '3' },
  { id: 'pet:4ce:5', era: '4ce', kind: 'pet', poolTypeId: '5', slotId: '5' },
  { id: 'pet:4ce:2', era: '4ce', kind: 'pet', poolTypeId: '2', slotId: '2' }
]

function buildPetPool(def, meta, pets, itemsTable) {
  const entry = meta.get(`pet:${def.poolTypeId}`)
  const conf = entry?.conf ?? {}
  const time = entry?.time ?? null
  const tiers = buildPetTiersFromRaw(conf, pets)
  const name = text(conf.name) || `魔物蛋池${def.poolTypeId}`
  const img = time?.img ?? ''
  const imgTitle = time?.imgTitle ?? ''
  const icon = conf.icon ?? ''
  // 封面大图若未导出（如圣经贩售 gacha_pet104 暂缺），回退常规蛋池封面，避免 404
  const gachaImgDir = join(parsedDir, '..', '..', 'images', 'gacha')
  const cover = img && existsSync(join(gachaImgDir, `${img}.webp`))
    ? `/images/gacha/${img}.webp`
    : '/images/gacha/gacha_egg0.webp'
  return {
    id: def.id, era: def.era, kind: 'pet',
    poolTypeId: def.poolTypeId, slotId: def.slotId, stateKey: def.id,
    name, des: conf.des ?? '',
    percTip: conf.percTip ?? '',
    upTypes: Array.isArray(conf.upTypes) ? conf.upTypes : [],
    packDisplay: conf.packDisplay ?? '',
    rewardId: conf.reward ?? '',
    consumeId: conf.consume ?? '',
    para: conf.para ?? {},
    typeGuaranty: conf.typeGuaranty ?? null,
    open: time ? Boolean(time.open) : true,
    openTime: time?.openTime ?? '',
    closeTime: time?.closeTime ?? '',
    opensAt: toMs(time?.openTime),
    closesAt: toMs(time?.closeTime),
    slotDesc: time?.slotDesc ?? '',
    assets: {
      cover,
      coverSprite: img,
      titleSprite: imgTitle,
      poolSprite: icon
    },
    // 消耗与赠品：从原表生成（consume / reward）
    costs: buildCostsFromRaw(conf.consume, itemsTable),
    bonus: buildBonusFromRaw(conf.reward, itemsTable),
    exchangeCosts: buildExchangeCosts(conf.para ?? {}, conf.consume),
    tiers
  }
}

export function buildGachaFile() {
  const target = join(parsedDir, file)
  const existing = readExisting(target)
  const meta = collectPoolMeta()
  const heroes = table(readJson('hero.json'))
  const pets = table(readJson('pet.json'))
  const itemsTable = table(readJson('item.json'))

  // 全部由原表生成（已删除三测卡池，不再依赖历史基线）
  const heroPools = HERO_POOLS.map(def => buildHeroPool(def, meta, heroes, itemsTable))
  const petPools = PET_POOLS.map(def => buildPetPool(def, meta, pets, itemsTable))

  const pools = [...heroPools, ...petPools]
  return { file, data: { ...existing, schemaVersion: 1, modelVersion: 'config-v1', initialWallet: collectInitialWallet(), pools } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = buildGachaFile()
  mkdirSync(parsedDir, { recursive: true })
  writeFileSync(join(parsedDir, output.file), JSON.stringify(output.data), 'utf8')
  const h = output.data.pools.filter(p => p.kind === 'hero').length
  const pt = output.data.pools.filter(p => p.kind === 'pet').length
  console.log(`gacha.json: ${output.data.pools.length} pools（角色 ${h} / 魔物 ${pt}）`)
}
