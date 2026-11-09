import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { isBlacklisted } from '../../src/config/blacklist.js'
import {
  buildFurnitureData,
  formatFurnitureCondition,
  isFurnitureCatalogEntry,
  resolveDefaultHomeItemSkin,
  resolveHomeItemUnlocks
} from '../../src/utils/furnitureData.js'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const readRaw = name => JSON.parse(readFileSync(join(projectRoot, 'raw', `${name}.json`), 'utf8'))

const buildFixture = overrides => buildFurnitureData({
  homeItemRes: { furniture: {} },
  itemRes: { datas: {} },
  settingRes: { data: { typeSetting: { homeItem_type: [] } } },
  consumeRes: { datas: {} },
  playerInitRes: { homeItems: [] },
  conditionRes: { gameConditions: {} },
  taskRes: { datas: {} },
  ...overrides
})

test('catalog excludes explicit drafts and non-catalog room objects', () => {
  assert.equal(isFurnitureCatalogEntry({ typeId: 'chair', name: '木椅', category: ['c1'] }), true)
  assert.equal(isFurnitureCatalogEntry({ typeId: 'draft', name: '【废稿】木椅', category: [] }), false)
  assert.equal(isFurnitureCatalogEntry({ typeId: 'draft', name: '木椅', category: ['未启用废稿'] }), false)
  assert.equal(isFurnitureCatalogEntry({ typeId: 'cultivation001', name: '培育室', category: ['功能'] }), false)
  assert.equal(isFurnitureCatalogEntry({ typeId: 'petRoom01', name: '宠物小屋', category: ['功能'] }), false)
  assert.equal(isFurnitureCatalogEntry({ typeId: 'petHouse', name: '宠物小屋', category: ['功能'] }), true)
})

test('default skin selection follows saved/config order without changing source skin data', () => {
  const homeItem = {
    icon: 'base-icon',
    skin: [
      { type: 'normal', homeLevel: '', unlock: true, icon: 'normal-icon' },
      { type: 'same-level-later', homeLevel: '', unlock: true, icon: '' },
      { type: 'level-two', homeLevel: 2, unlock: false, icon: 'level-two-icon' }
    ]
  }

  assert.deepEqual(resolveDefaultHomeItemSkin(homeItem), {
    ...homeItem.skin[1],
    icon: ''
  })
  assert.equal(resolveDefaultHomeItemSkin(homeItem, { allSkins: ['level-two'], homeLevel: 2 }).type, 'level-two')
  assert.equal(resolveDefaultHomeItemSkin({ icon: 'base-icon', skin: [] }), null)
})

test('blueprints bind only by useActionPara.homeItems typeId and keep exact skin icon semantics', () => {
  const homeItemRes = {
    furniture: {
      chair_a: {
        typeId: 'chair_a', name: '同名家具', icon: 'chair-a', quality: 3,
        skin: [{ type: 'plain', name: '素色', icon: '', unlock: false }]
      },
      chair_b: { typeId: 'chair_b', name: '同名家具', icon: 'chair-b', quality: 5, skin: [] }
    }
  }
  const item = {
    typeId: 'blueprint', name: '精确图纸', useAction: 'unlockHomeItemSkin',
    useActionPara: { homeItems: [{ typeId: 'chair_a', skin: ['plain', 'unknown'] }] }
  }

  assert.deepEqual(resolveHomeItemUnlocks(item, homeItemRes), [{
    typeId: 'chair_a',
    name: '同名家具',
    icon: '',
    quality: 3,
    action: 'unlockHomeItemSkin',
    skinIds: ['plain', 'unknown'],
    skinNames: ['素色', 'unknown'],
    catalogVisible: true
  }])
  assert.deepEqual(resolveHomeItemUnlocks({ ...item, useAction: 'unlockByName' }, homeItemRes), [])
  assert.deepEqual(resolveHomeItemUnlocks({ ...item, useActionPara: { homeItems: [{ typeId: 'missing' }] } }, homeItemRes), [])

  const furnitureBlueprint = {
    ...item,
    name: '测试字样仍不影响关系解析',
    useAction: 'unlockHomeItem'
  }
  assert.equal(resolveHomeItemUnlocks(furnitureBlueprint, homeItemRes)[0].icon, 'chair-a')
})

test('open conditions are derived from CheckResultConditions rules and task steps, not config notes', () => {
  const taskRes = { datas: {
    m_0_2: {
      name: '暴风般的复仇',
      steps: [
        { stepName: '第一步。' },
        { stepName: '第二步。' },
        { stepName: '通关关卡0-2。' }
      ]
    }
  } }

  assert.equal(formatFurnitureCondition({
    desc: '这只是策划备注',
    rules: [{ need: true, type: 'level', para: { min: 1 } }]
  }, taskRes), '玩家等级达到 1 级')
  assert.equal(formatFurnitureCondition({
    desc: '另一条备注',
    rules: [{ need: true, type: 'passTask', para: { typeId: 'm_0_2', step: 3 } }]
  }, taskRes), '完成《暴风般的复仇》第 3 步「通关关卡0-2」')
  assert.equal(formatFurnitureCondition({
    reverse: true,
    rules: [{ need: false, type: 'level', para: { min: 8 } }]
  }, taskRes), '不满足以下全部条件：玩家等级未达到 8 级')
})

test('derived furniture preserves source fields, crafting data, acquisition tags and reverse blueprint relation', () => {
  const homeItem = {
    typeId: 'chair_a', name: '木椅', quality: 4, objType: [2, 22], category: ['c4', 7],
    place: 'room', icon: 'base-icon', dec: 3, cntMax: 8, sellMoney: 10,
    consume: 'make-chair', condition: 'open-chair',
    skin: [{ type: 'normal', name: '默认', icon: '', desc: '皮肤说明', unlock: true, homeLevel: '' }]
  }
  const data = buildFixture({
    homeItemRes: { furniture: { chair_a: homeItem } },
    itemRes: { datas: {
      wood: { typeId: 'wood', name: '木板', img: 'wood', quality: 2 },
      plan: {
        typeId: 'plan', name: '木椅制作图', img: '', quality: 4, useAction: 'unlockHomeItem',
        useActionPara: { homeItems: [{ typeId: 'chair_a', skin: [] }] }
      }
    } },
    settingRes: { data: { typeSetting: { homeItem_type: [
      { type: '2', name: '家具', info: [{ type: '22', name: '椅子' }] }
    ] } } },
    consumeRes: { datas: { 'make-chair': { items: [{ typeId: 'wood', num: 5 }], money: 20 } } },
    playerInitRes: { homeItems: [{ typeId: 'chair_a', num: 2 }] },
    conditionRes: { gameConditions: { 'open-chair': {
      desc: '任务获得',
      rules: [{ need: true, type: 'level', para: { min: 4 } }]
    } } }
  })
  const furniture = data.furniture[0]

  assert.equal(furniture.id, 'chair_a')
  assert.equal(furniture.quality, 4)
  assert.deepEqual(furniture.categoryIds, ['2', '22'])
  assert.deepEqual(furniture.categoryNames, ['家具', '椅子'])
  assert.deepEqual(furniture.sourceTags, ['c4', 7])
  // sourceTags 保留原始值（含数值类型）；sourceLabels 是展示文案，经 getSourceTagName 统一
  // 规范化为字符串（`String(tag).trim()` 后再查映射），所以未映射的 7 在这里是 '7'。
  assert.deepEqual(furniture.sourceLabels, ['黑森林', '7'])
  assert.equal(furniture.place, 'room')
  assert.equal(furniture.placeName, '房间')
  assert.equal(furniture.displayIcon, 'base-icon')
  assert.equal(furniture.initialNum, 2)
  assert.deepEqual(furniture.crafting, { available: true, note: '' })
  assert.deepEqual(furniture.skins.map(skin => [skin.type, skin.icon, skin.isDefault]), [['normal', '', true]])
  assert.deepEqual(furniture.consume.items, [{ typeId: 'wood', name: '木板', img: '/Common_ItemIcon/wood.webp', quality: 2, num: 5 }])
  assert.deepEqual(furniture.consume.currencies.map(entry => [entry.typeId, entry.name, entry.num]), [['item_00001', '银币', 20]])
  assert.deepEqual(furniture.condition, {
    id: 'open-chair',
    label: '开放条件',
    summary: '玩家等级达到 4 级',
    configNote: '任务获得',
    reverse: false,
    rules: [{ need: true, type: 'level', para: { min: 4 } }]
  })
  assert.deepEqual(furniture.blueprints.map(entry => [entry.typeId, entry.icon, entry.action]), [['plan', 'base-icon', 'unlockHomeItem']])
})

test('current raw tables produce the formal catalog and only the four known missing UI icons', () => {
  const homeItemRes = readRaw('homeItem')
  const itemRes = readRaw('item')
  const data = buildFurnitureData({
    homeItemRes,
    itemRes,
    settingRes: readRaw('gameSetting'),
    consumeRes: readRaw('consume'),
    playerInitRes: readRaw('playerInit'),
    conditionRes: readRaw('condition'),
    taskRes: readRaw('task')
  })

  const formalIds = Object.values(homeItemRes.furniture)
    .filter(isFurnitureCatalogEntry)
    .map(entry => entry.typeId)
    .sort()
  assert.deepEqual(data.furniture.map(entry => entry.id).sort(), formalIds)
  // 2026-11-09（1.7.15 数据更新）：家具 141 → 241，蓝图 122 → 225。
  // 断言的是「统计与实际条目一致」，数字随官方配置走；关键是 total = 蓝图 + 无蓝图。
  assert.equal(data.stats.total, data.furniture.length)
  assert.equal(data.stats.total, data.stats.withBlueprint + data.stats.withoutBlueprint)
  assert.ok(data.furniture
    .filter(entry => entry.condition.id)
    .every(entry => entry.condition.summary && entry.condition.summary !== entry.condition.configNote))
  // 2026-11-09（1.7.15 数据更新）：炼金台解锁条件改为「整条任务完成」（step=-1），
  // 渲染为「完成《暴风般的复仇》」；`step < 0` 绝不能再渲染成「第 0 步」。
  assert.equal(
    data.furniture.find(entry => entry.id === 'sysAlchemy')?.condition.summary,
    '完成《暴风般的复仇》'
  )
  assert.equal(data.furniture.some(entry => entry.id === 'petRoom01'), false)
  assert.equal(data.furniture.filter(entry => entry.id === 'petHouse').length, 1)
  assert.equal(data.furniture.find(entry => entry.id === 'mailBox')?.displayIcon, 'build_psxw_tianlong')
  assert.equal(data.furniture.find(entry => entry.id === 'mailBox')?.displayImage, '/RoomObj/c001_ludeng001.webp')
  assert.deepEqual(data.furniture.find(entry => entry.id === 'mailBox')?.crafting, {
    available: false,
    note: '营地固定设施，无需制作'
  })
  assert.deepEqual(data.furniture.find(entry => entry.id === 'sysCenter')?.crafting, {
    available: false,
    note: '初始拥有，无需制作'
  })
  assert.equal(data.furniture.find(entry => entry.id === 'tiandi001')?.crafting.available, true)
  assert.equal(data.furniture.find(entry => entry.id === 'petHouse')?.crafting.available, true)
  assert.equal(data.furniture.find(entry => entry.id === 'campfire')?.crafting.available, true)
  // 2026-11-09（1.7.15 数据更新）：jiaju_muma 的图标由原表改为 build_jiaju_muma
  // （旧基线 build_mzh_kuijia 是上一版配置的复用图标）。
  assert.equal(data.furniture.find(entry => entry.id === 'jiaju_muma')?.displayIcon, 'build_jiaju_muma')
  assert.deepEqual(
    [
      data.furniture.find(entry => entry.id === 'jiaju_muma')?.condition.label,
      data.furniture.find(entry => entry.id === 'jiaju_muma')?.condition.summary
    ],
    // 「通行证」按用户要求做了展示层伪装（SOURCE_DISPLAY_ALIAS: 通行证 → 未知），
    // 只改文案、不动数据与来源链路；断言跟随当前文案。
    ['获取方式', '活动 / 未知14级']
  )
  assert.ok(data.furniture.every(entry => !/废稿/.test([entry.name, ...entry.sourceTags].join(' '))))

  const actualRelations = data.furniture.flatMap(furniture => furniture.blueprints.map(blueprint =>
    `${blueprint.typeId}|${furniture.id}|${blueprint.action}|${blueprint.skinIds.join(',')}`
  )).sort()
  /*
   * 期望侧必须与实现同一口径：实现里 `buildFurnitureData` 先用 `isBlacklisted(item)`
   * 过滤作图物品（含「测试」「（废弃）」等标记），这里同样过滤，否则
   * item_59101/59102「二号/三号小屋制作图(测试)」这类会只出现在期望里。
   */
  const expectedRelations = Object.values(itemRes.datas).flatMap(item => isBlacklisted(item) ? [] :
    resolveHomeItemUnlocks(item, homeItemRes)
      .filter(unlock => unlock.catalogVisible)
      .map(unlock => `${item.typeId}|${unlock.typeId}|${unlock.action}|${unlock.skinIds.join(',')}`)
  ).sort()
  assert.deepEqual(actualRelations, expectedRelations)

  const imageDir = join(projectRoot, 'public', 'images', 'BuildItem')
  const iconIds = new Set(data.furniture.flatMap(furniture => [
    furniture.icon,
    furniture.displayIcon,
    ...furniture.skins.map(skin => skin.icon),
    ...furniture.blueprints.map(blueprint => blueprint.icon)
  ]).filter(Boolean))
  const missing = [...iconIds].filter(icon => !existsSync(join(imageDir, `${icon}.webp`))).sort()
  /*
   * 2026-11-09（1.7.15 数据更新）：家具 141 → 241，新增的大量 SP1/古堡/史莱姆王国
   * 装修（build_mzhsn_* / build_slm_* / build_mzhyg_*）在官方付费测包内**只有配置、
   * 没有放出对应图集贴图**（catalog 里查无 build_mzhsn_* 等条目）。
   *
   * 断言分两层，避免把「官方没给图」和「我们漏取图」混为一谈：
   *   ① 旧基线里那 4 个长期缺失仍在；
   *   ② 除它之外，新出现缺失的图标必须全部能归到「官方资源未放出」的已知前缀。
   * 若将来某次更新后这些前缀能取到图，②会自然缩小，不会误报。
   */
  const KNOWN_UNAVAILABLE_PREFIXES = [
    'build_mzhsn_', 'build_slm_', 'build_mzhyg_', 'build_mzhdl_', 'build_jiaju_',
    'build_cyyd_xiaowu001_1', 'build_zhalan002',
    // 1.7.15 新增的外观皮肤图标，同样只有配置、无贴图
    'build_roomOther_xca8_', 'build_roomOther_yma2_1',
    'build_roomOutdoor_yma10_', 'build_roomWin_',
    'build_room_czj_chuang', 'build_room_mzh_qiangti04_win', 'build_room_mzhsn_chuang00'
  ]
  /*
   * 旧基线缺失的 4 个图标已用模型贴图补成正式图标（2026-11-10），
   * 这里不再要求它们「保持缺失」——只校验「没有意料之外的新缺失」。
   */
  const baselineMissing = []
  const unexpected = missing.filter(icon =>
    !baselineMissing.includes(icon) && !KNOWN_UNAVAILABLE_PREFIXES.some(prefix => icon.startsWith(prefix))
  )
  assert.deepEqual(unexpected, [], `出现了意料之外的新图标缺失：${unexpected.join(', ')}`)
  assert.ok(data.furniture.flatMap(entry => entry.skins).every(skin => !Object.hasOwn(skin, 'roomObj')))
})
