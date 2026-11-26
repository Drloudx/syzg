import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSupplementalItemSources, getSourceRewardItemIds } from '../../src/utils/supplementalItemSources.js'
import { buildRemainingItemSources } from '../../src/utils/remainingItemSources.js'
import { buildDungeonItemSources } from '../../src/utils/dungeonData.js'
import { buildDungeonsFiles } from '../../scripts/parse/dungeons.mjs'
import { readJson } from '../../scripts/parse/shared.mjs'
import { build } from '../../scripts/parse/search.mjs'

const item = (name, extra = {}) => ({ typeId: name, name, hide: false, ...extra })
const choice = (id, targets) => item(id, { useAction: 'getRewardSelect', useActionPara: {
  rewards: targets.map(itemTypeId => ({ itemTypeId, num: 1 }))
} })
const reward = (typeId, overrides = {}) => ({ items: [{ rate: 1, num: 1,
  rules: [{ mode: 'item', typeId, chance: 1, min: 1, max: 1 }] }], ...overrides })
const base = () => ({
  itemJson: { datas: { a: item('a'), b: item('b'), seed: item('seed'), item_00001: item('item_00001') } },
  rewardJson: { datas: { a: reward('a'), b: reward('b') } }
})

test('source identity excludes zero probability, empty quantity, equipGroup and internal rewards', () => {
  const items = base().itemJson.datas
  const data = reward('a', { money: 5, items: [
    { rate: 0, rules: [{ typeId: 'b', mode: 'item' }] },
    { num: 0, rules: [{ typeId: 'b', mode: 'item' }] },
    { rules: [{ typeId: 'b', mode: 'item', chance: 0 }, { typeId: 'b', mode: 'item', max: 0 },
      { typeId: 'b', mode: 'equipGroup' }, { typeId: 'a', mode: 'equip', chance: 1 }] }
  ] })
  assert.deepEqual(getSourceRewardItemIds(data, items), ['item_00001', 'a'])
  assert.deepEqual(getSourceRewardItemIds({ ...data, category: ['测试'] }, items), [])
  assert.deepEqual(getSourceRewardItemIds(reward('a', { items: [{ rules: [{ mode: 'randomMoney', min: 2, max: 3 }] }] }), items), ['item_00001'])
})

test('events require positive entry references and preserve legitimate abandoned-chest names', () => {
  const maps = base()
  maps.randomEventInfoJson = { datas: {
    live: { name: '废弃的宝箱', reward: 'a' }, orphan: { name: '孤立事件', reward: 'b' }, zero: { name: '零权重', reward: 'b' }
  } }
  maps.randomEventAreaJson = { data: { c1_map: [{ events: [{ typeId: 'live', chance: 1 }, { typeId: 'live', chance: 1 }, { typeId: 'zero', chance: 0 }] }] } }
  const sources = buildSupplementalItemSources(maps)
  assert.equal(sources.a.length, 1)
  assert.equal(sources.a[0].name, '废弃的宝箱')
  assert.equal(sources.b, undefined)
})

test('collection follows the collection foreign key and gates research-only rewards', () => {
  const maps = base()
  maps.fileGatherJson = { gatherFile: [{ gatherTypeId: 'point', place: ['秋日荒野'] }] }
  maps.roomCollectJson = { datas: { point: { collectTypeId: 'ore' } } }
  maps.roomCollectTypeJson = { datas: {
    point: { name: '错误同名类型', reward: 'b' },
    ore: { name: '矿石', reward: 'a', research: { id: 'study', levelReward: [{ level: 1, reward: 'b' }, { level: 9, reward: 'b' }] } }
  } }
  maps.campResearchJson = { datas: { study: { name: '矿物研究', level: [{ level: 1 }] } } }
  const sources = buildSupplementalItemSources(maps)
  assert.equal(sources.a[0].name, '矿石')
  assert.equal(sources.b.length, 1)
  assert.equal(sources.b[0].researchLevel, 1)
  assert.match(sources.b[0].des, /需矿物研究 1级/)
})

test('plant rewards require a real seed and positive candidate, excluding test crops', () => {
  const maps = base()
  maps.plantJson = { seed: { seed: [{ type: 'crop', chance: 1 }, { type: 'crop_test', chance: 1 }, { type: 'zero', chance: 0 }], absent: [{ type: 'zero' }] },
    plant: { crop: { name: '小麦', reward: 'a' }, crop_test: { name: '试验_test', reward: 'b' }, zero: { name: '蔬菜', reward: 'b' } } }
  const sources = buildSupplementalItemSources(maps)
  assert.equal(sources.a[0].seedId, 'seed')
  assert.equal(sources.b, undefined)
})

test('camp rewards belong to the transition from current to next level, not terminal levels', () => {
  const maps = base()
  maps.homeLevelJson = { datas: { center: { name: '营地中心', level: { 1: { reward: 'a' }, 2: { reward: 'b' } } } } }
  const sources = buildSupplementalItemSources(maps)
  assert.equal(sources.a[0].level, 1)
  assert.equal(sources.a[0].targetLevel, 2)
  assert.equal(sources.b, undefined)
})

test('only chapter-referenced stage drops and player-init guide battles are admitted', () => {
  const maps = base()
  maps.levelStageJson = { datas: { c0_1: { typeId: 'c0_1', shortName: '0-1', name: '相遇', hide: true, battle1: 'live' } } }
  maps.battleJson = { datas: { live: { name: '相遇', reward: 'a', firstReward: 'a' }, orphan: { name: '孤立战役', reward: 'b', firstReward: 'b' }, guide: { name: '引导', reward: 'a' }, guide_bak: { name: '备份', reward: 'b' } } }
  maps.playerInitJson = { initBattleId: 'guide', initBattleId2: 'guide_bak' }
  const sources = buildSupplementalItemSources(maps)
  // 章节关卡只产出 `stage` 一条（普通掉落；首通已去掉），名字是 `0-1 相遇`；引导战斗另算。
  assert.deepEqual(sources.a.map(x => x.type), ['stage', 'guide'])
  assert.equal(sources.a[0].name, '0-1 相遇')
  assert.equal(sources.a[0].des, '关卡掉落')
  assert.equal(sources.b, undefined)
})

test('activity signup uses entry rewards, not legacy signIn or preview rewards', () => {
  const maps = base()
  maps.signInJson = { newbieSignIn: { 1: 'b' } }
  maps.activityListJson = { datas: {
    signup: { activityType: '7dayCheck', name: '旅途', para: { achives: [{ reward: 'a' }], showReward: 'b' } },
    off: { activityType: 'activityCheckIn', name: '关闭活动', startTime: '2025-12-01', endTime: '2025-12-01', para: { achives: [{ reward: 'b' }] } },
    test: { activityType: '7dayCheck', name: '测试签到', para: { achives: [{ reward: 'b' }] } }
  } }
  const sources = buildSupplementalItemSources(maps)
  assert.equal(sources.a[0].type, 'signIn')
  assert.equal(sources.b, undefined)
})

test('real source build preserves existing dungeon sources and links target real entries', () => {
  const sentinel = { type: 'dungeon', id: 'retained', name: '保留副本来源', des: '固定装备' }
  const result = build({ dungeonSources: { item_411000: [sentinel] } })
  const sources = result.files.find(x => x.file === 'parsed/item-sources.json').data
  assert.ok(sources.item_411000.some(x => x.id === sentinel.id))
  assert.ok(sources.item_411000.some(x => x.type === 'guide' && x.id === 'c00_1'))
  /*
   * 关卡来源按 **stage id** 归属，不是 battle id：battle `c0_4_a` 属于 stage `c0_3`
   * （0-3 狂乱），两者相差一位，不要照 battle id 写断言。
   *
   * ⚠️ 这里**不再**用 `item_411000` 验关卡来源：它在关卡里只出在**首次通关**奖励中，
   * 而首通来源已按用户要求去掉（噪音大、且是一次性奖励）。改用一件有常规关卡掉落的物品。
   */
  const stageItem = Object.entries(sources)
    .find(([, list]) => list.some(x => x.type === 'stage'))
  assert.ok(stageItem, '应存在带关卡掉落的物品')
  const stageSource = stageItem[1].find(x => x.type === 'stage')
  assert.match(stageSource.id, /^c\d+_\d+$/, `关卡来源 id 应是 stage id：${stageSource.id}`)
  assert.equal(stageSource.des, '关卡掉落')
  /*
   * 用 item_50012（营地中心 1→2 升级奖励产物）验 camp 来源。
   * 原断言写死 item_50004，但 1.7.15 官方把 homeLevel_center1 的奖励从
   * item_50004 换成了 item_50012/50005/50006/50007/50008/50009/50013，
   * 该物品已不再属于这条升级奖励，断言随官方数据同步替换。
   */
  assert.ok(sources.item_50012.some(x => x.type === 'camp' && x.level === 1 && x.targetLevel === 2))
  assert.ok(sources.item_50087.some(x => x.type === 'activity' && x.name === '世界探险挑战'))
  assert.ok(sources.item_10036.some(x => x.type === 'plant' && x.seedId === 'item_15009'))
  const events = readJson('randomEventInfo.json').datas
  const explores = readJson('exploreArea.json').datas
  const items = readJson('item.json').datas
  for (const source of Object.values(sources).flat()) {
    if (source.type === 'event') assert.ok(events[source.id])
    if (source.type === 'explore') assert.ok(explores[source.id])
    if (source.type === 'plant') assert.ok(items[source.seedId])
  }
})

test('containers follow rooted chains, preserve selection, and reject orphan cycles and test rewards', () => {
  const maps = { itemJson: { datas: {
    root: choice('root', ['nested']), nested: choice('nested', ['target']), target: item('target'),
    orphan: choice('orphan', ['cycle']), cycle: choice('cycle', ['orphan', 'no']), no: item('no'),
    bad: item('bad', { useAction: 'getReward', useActionPara: { reward: 'bad' } })
  } }, rewardJson: { datas: { bad: { tip: '测试通用奖励', items: [{ rules: [{ mode: 'item', typeId: 'no', chance: 1 }] }] } } } }
  const sources = buildRemainingItemSources(maps, { root: [{}], bad: [{}] })
  assert.equal(sources.target[0].sourceItemId, 'nested')
  assert.match(sources.target[0].des, /自选获得/)
  assert.doesNotMatch(sources.target[0].des, /概率|必定/)
  assert.equal(sources.no, undefined)
  assert.equal(sources.orphan, undefined)
})

test('containers exclude zero rewards and equipment pool previews', () => {
  const maps = { itemJson: { datas: {
    root: item('root', { useAction: 'getReward', useActionPara: { reward: 'contents' } }),
    target: item('target'), zero: item('zero'), preview: item('preview')
  } }, rewardJson: { datas: { contents: { items: [
    { rate: 0, rules: [{ mode: 'item', typeId: 'zero', chance: 1 }] },
    { num: 0, rules: [{ mode: 'item', typeId: 'zero', chance: 1 }] },
    { rules: [{ mode: 'item', typeId: 'zero', chance: 0 }] },
    { rules: [{ mode: 'equipGroup', typeId: 'preview', equipTypeGroup: 'pool', chance: 1 }] },
    { rules: [{ mode: 'item', typeId: 'target', chance: 1, min: 2, max: 4 }] }
  ] } } } }
  const sources = buildRemainingItemSources(maps, { root: [{}] })
  assert.deepEqual(Object.keys(sources), ['target'])
  assert.equal(sources.target[0].des, '使用获得')
  maps.itemJson.datas.root.name = '宝箱'
  assert.match(buildRemainingItemSources(maps, { root: [{}] }).target[0].des, /使用获得 · 必定获得/)
})

test('dungeon actual items, eggs and fixed equipment get the right targets, never preview or zero rewards', () => {
  const drop = (typeId, extra = {}) => ({ typeId, name: typeId, min: 1, max: 1, actualProb: 1, ruleMode: 'item', ...extra })
  const sources = buildDungeonItemSources([{ name: '副本', battles: [{ id: 'live', name: '关卡',
    reward: [drop('item_money'), drop('item_zero', { actualProb: 0 }), drop('item_empty', { max: 0 }),
      drop('item_preview', { ruleMode: 'equipGroup' }), drop('item_equip', { ruleMode: 'equip' })],
    previewReward: [drop('item_previewOnly')], firstReward: [drop('item_first')],
    rooms: [{ variants: [{ typeId: 'room', name: '房间',
      monsters: [{ typeId: 'mon', name: '怪物', drops: [{ collectTypeId: 'drop', reward: [drop('pet_001')] }] }],
      collections: [{ name: '采集点', collectTypeId: 'gather', reward: [drop('item_herb')] }]
    }] }]
  }] }])
  assert.deepEqual(Object.keys(sources).sort(), ['item_money', 'item_equip', 'item_first', 'pet_001', 'item_herb'].sort())
  for (const list of Object.values(sources)) {
    assert.equal(list.length, 1)
    assert.equal(list[0].des, '副本掉落')
    assert.equal(list[0].dropTab, 'settlement')
    assert.equal(list[0].dropEntry, 'settlement')
  }
})

test('daily special plans are excluded and tower first rewards remain distinct', () => {
  const maps = { itemJson: { datas: { target: item('target'), no: item('no') } },
    rewardJson: { datas: { live: { items: [{ rules: [{ mode: 'item', typeId: 'target', chance: 1 }] }] },
      special: { items: [{ rules: [{ mode: 'item', typeId: 'no', chance: 1 }] }] } } },
    battleJson: { datas: { live: { name: '关卡', reward: 'live' }, special: { name: '限时', reward: 'special' } } },
    dailyWorkJson: { plans: { a: { typeId: 'a', name: '日常', plan: [{ battle: 'live', name: '关卡' }] },
      b: { typeId: 'b', name: '限时', special: true, plan: [{ battle: 'special', name: '限时' }] } } },
    towerJson: { datas: { tower: { typeId: 'tower', name: '塔', layers: [
      { layer: 1, reward: 'live', onceReward: 'live' }, { layer: 2, reward: 'live' }
    ] } } } }
  const sources = buildRemainingItemSources(maps)
  assert.equal(sources.no, undefined)
  const tower = sources.target.filter(x => x.type === 'tower')
  assert.equal(tower.length, 2)
  assert.equal(tower.find(x => x.id.endsWith(':reward')).des, '第 1～2 层 · 通关结算奖励')
  assert.equal(tower.find(x => x.id.endsWith(':onceReward')).des, '第 1 层 · 首次通关奖励')
  assert.equal(sources.target.find(x => x.type === 'dailyPlan').des, '通关结算奖励')
})

test('compact sources merge quantities without inventing missing tower floors or dismantling qualities', () => {
  const reward = (id, count) => ({ items: [{ rules: [{ mode: 'item', typeId: id, chance: 1, min: count, max: count }] }] })
  const maps = {
    itemJson: { datas: { a: item('a'), b: item('b') } },
    rewardJson: { datas: { small: reward('a', 1), large: reward('a', 10), other: reward('b', 1) } },
    towerJson: { datas: { tower: { typeId: 'tower', name: '塔', layers: [
      { layer: 1, reward: 'small' }, { layer: 2, reward: 'large', onceReward: 'other' },
      { layer: 3, reward: 'other' }, { layer: 4, reward: 'large' }
    ] } } },
    equipDecJson: { equipDec: { 1: { 1: 'small', 2: 'large', 3: 'small', 4: 'large', 5: 'small' },
      2: { 1: 'small', 2: 'other' } } }
  }
  const sources = buildRemainingItemSources(maps)
  assert.deepEqual(sources.a.filter(x => x.type === 'tower').map(x => x.des), ['第 1～2、4 层 · 通关结算奖励'])
  assert.deepEqual(sources.a.filter(x => x.type === 'dismantle').map(x => x.des), ['第 1 阶装备分解', '第 2 阶 · 普通装备分解'])
  assert.equal(sources.b.find(x => x.type === 'dismantle').des, '第 2 阶 · 稀少装备分解')
})

test('real build fills reported gaps without inventing unavailable packs, eggs or hero-state item mappings', () => {
  const sources = build().files.find(x => x.file === 'parsed/item-sources.json').data
  for (const id of ['59050', '59055', '59019', '59043', '59049', '59053', '59064', '59065']) {
    assert.ok(sources[`item_${id}`].some(x => x.type === 'container' && x.id === 'item_5Xchoice'))
  }
  assert.ok(sources.pet_074.some(x => x.type === 'gacha' && x.poolKind === 'pet'))
  assert.ok(sources.item_19300.some(x => x.type === 'dungeon'))
  assert.ok(sources.item_19015.some(x => x.type === 'dailyPlan' && x.id === 'daily_mine_3_2'))
  assert.ok(sources.item_19304.some(x => x.type === 'dailyPlan'))
  assert.ok(sources.item_25002.some(x => x.type === 'tower'))
  assert.ok(sources.item_10075.some(x => x.type === 'dismantle'))
  assert.ok(sources.item_20026.some(x => x.type === 'gacha' && /上限/.test(x.des)))
  const allSources = Object.values(sources).flat()
  assert.ok(allSources.filter(x => x.type === 'dailyPlan').every(x => ['通关结算奖励', '首次通关奖励'].includes(x.des)))
  assert.ok(sources.item_00001.filter(x => x.type === 'dailyPlan').length > 0)
  assert.ok(allSources.filter(x => x.type === 'gacha').every(x => !/×|含保底|开放:|开放：/.test(x.des) && !('openTime' in x)))
  assert.ok(allSources.filter(x => x.type === 'dungeon').every(x => !('itemId' in x) && !('dungeonName' in x)))
  const items2 = readJson('item.json').datas
  const isEquip = id => (items2[id]?.category || []).map(String).includes('4')
  const dungeonOf = list => list.filter(x => x.type === 'dungeon')
  for (const [itemId, list] of Object.entries(sources)) {
    for (const s of dungeonOf(list)) {
      if (isEquip(itemId)) assert.ok(s.name.includes(' · '), `装备来源应带难度：${itemId} ${s.name}`)
      else assert.equal(s.des, '副本掉落', `材料来源说明应为「副本掉落」：${itemId} ${s.name} | ${s.des}`)
    }
  }
  assert.ok(sources.item_19300.some(x => x.type === 'dungeon' && x.name === '辛瓦特遗迹'))
  assert.ok(sources.item_59005?.some(x => x.type === 'task'))
  for (const id of ['item_59051', 'item_10076']) assert.ok(!sources[id]?.length, id)
  assert.ok(sources.pet_098?.some(x => /御卫贩售/.test(x.name || '')))
  const parents = new Set(Object.values(sources).flat().filter(x => x.type === 'container').map(x => x.id))
  assert.ok(!parents.has('item_20001'))
  assert.ok(!parents.has('item_26008x'))
  assert.ok(parents.has('item_26013'))
  assert.ok(sources.item_27011?.some(x => x.type === 'container' && x.id === 'item_26013'))
  assert.equal(parents.size, 24)
  // 血族花棺制作图（item_50138）：秘境兑换已映射秘境名、且已从 packDisplay 移除的 pack_jiaju02 不收录
  assert.ok(sources.item_50138.some(x => x.type === 'exchange' && x.id === 'ex01015' && x.name === '秘境兑换 · 亚空回廊·特异次元' && x.sub === 'ex01'))
  assert.ok(!sources.item_50138.some(x => x.id === 'pack_jiaju02'))
  // 在售家具礼包保留具体包名，未开放 ex02 不混入物品来源
  assert.ok(sources.item_50132.some(x => x.type === 'shop' && x.id === 'pack_jiaju01' && x.des === '商城购买 · 家具礼包 · 古堡灯具制作图包'))
  assert.ok(!allSources.some(x => x.type === 'exchange' && x.sub === 'ex02'))
  const fresh = build({ dungeonSources: buildDungeonsFiles().deps.dungeonSources }).files.find(x => x.file === 'parsed/item-sources.json').data
  assert.deepEqual(sources, fresh, 'standalone search must not depend on a stale dungeon source file')
})
