import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildActivityDungeonsFile } from '../../scripts/parse/activityDungeons.mjs'
import { validateResource } from '../../src/utils/resourceSchemas.js'
import { NAV_ROUTES, getGroupedNavRoutes } from '../../src/config/navRoutes.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const readRaw = name => JSON.parse(readFileSync(join(repoRoot, 'raw', name), 'utf8'))

test('活动副本解析器：开放过滤、20层数据、实机缩放与兑换池完整性', () => {
  const { file, data } = buildActivityDungeonsFile()
  assert.equal(file, 'parsed/activity-dungeons.json')
  assert.equal(validateResource('data/parsed/activity-dungeons.json', data), true)

  // sp1 正常开放，sp2 因 2925 年占位排期被隐藏
  assert.deepEqual(data.dungeons.map(d => d.id), ['sp1'])

  const sp1 = data.dungeons[0]
  const rawSp1 = readRaw('relicDungeonInfo.json').datas.sp1
  assert.equal(sp1.name, rawSp1.name)
  assert.equal(sp1.layers.length, rawSp1.layers.length)
  assert.equal(sp1.layers[0].layer, 1)
  assert.equal(sp1.layers[18].layer, 19)

  // 第 19 层实机缩放与推荐等级对齐原表
  const rawL19 = rawSp1.layers.find(l => l.layer === 19)
  const l19 = sp1.layers.find(l => l.layer === 19)
  assert.equal(l19.battleLevel, rawL19.battleLevel)
  assert.equal(l19.scaleAtk, rawL19.battleLevelScale)
  assert.equal(l19.scaleHp, rawL19.battleLevelScaleHp)
  assert.ok(l19.bossRoom?.rounds?.length > 0, '第 19 层首领房必须有怪物波次')
  const bossMon = l19.bossRoom.rounds[0][0]
  assert.equal(bossMon.levelScale, rawL19.battleLevelScale)
  assert.equal(bossMon.levelScaleHp, rawL19.battleLevelScaleHp)

  // 兑换池（ex01）含体力与银币消耗条目
  assert.equal(sp1.shop.length, 20)
  const tiItem = sp1.shop.find(s => s.id === 'ex01001')
  assert.equal(tiItem?.costs?.[0]?.kind, 'ti')
  assert.equal(tiItem?.costs?.[0]?.id, 'item_00005')
  assert.equal(tiItem?.costs?.[0]?.name, '体力')
  assert.equal(tiItem?.costs?.[0]?.num, 35)
  const moneyItem = sp1.shop.find(s => s.id === 'ex01012')
  assert.equal(moneyItem?.costs?.[0]?.kind, 'money')
  assert.equal(moneyItem?.costs?.[0]?.num, 200)

  // 事件分支与战斗房均已解析
  assert.equal(sp1.events.length, 10)
  const gargoyle = sp1.events.find(e => e.id === 'sp1_gargoyle_relic_mechanism')
  assert.ok(gargoyle?.nodes?.node_3?.options?.[0]?.outcomes?.[0]?.battleRoom?.rounds?.length > 0)

  // 所有引用的 /images/relic-dungeons/ 资源均存在于 public/
  const urls = new Set()
  if (sp1.bgImg) urls.add(sp1.bgImg)
  for (const l of sp1.layers) if (l.layerImg) urls.add(l.layerImg)
  for (const p of sp1.roomPools) for (const r of p.rooms) if (r.img) urls.add(r.img)
  for (const ev of sp1.events) {
    if (ev.coverImg) urls.add(ev.coverImg)
    for (const n of Object.values(ev.nodes)) if (n.image) urls.add(n.image)
  }
  assert.ok(urls.size >= 17)
  for (const u of urls) {
    assert.ok(existsSync(join(repoRoot, 'public', u.replace(/^\//, ''))), `缺少静态图片: ${u}`)
  }
})

test('活动副本导航与路由配置完整', () => {
  const navEntry = NAV_ROUTES.find(r => r.path === '/activity-dungeons')
  assert.ok(navEntry, 'NAV_ROUTES 应包含 /activity-dungeons')
  assert.equal(navEntry.name, '活动副本')
  assert.ok(existsSync(join(repoRoot, 'public', navEntry.icon.replace(/^\//, ''))), '导航图标文件存在')

  const groups = getGroupedNavRoutes()
  const encyclopedia = groups.find(g => g.key === 'encyclopedia')
  assert.ok(encyclopedia?.items.some(i => i.path === '/activity-dungeons'), '活动副本应归入图鉴资料分组')
})

test('活动副本层级列表复用 UiVirtualGrid 窗口化与列模板约定', () => {
  const viewSource = readFileSync(join(repoRoot, 'src/views/ActivityDungeonsView.vue'), 'utf8')
  assert.match(viewSource, /<UiVirtualGrid\b/, '层级挑战应接入 UiVirtualGrid 视口窗口化')
  assert.match(viewSource, /\.ad-layers-scroll\s+:deep\(\.ui-card-grid\)/, '列模板必须写在 :deep(.ui-card-grid) 上')
  assert.doesNotMatch(viewSource, /content-visibility:\s*auto/, '窗口化卡片不得加 content-visibility: auto')
  assert.match(viewSource, /fetchItemData\s*\(/, '点击物品需先取完整物品对象再传给 openItemDetail')
  assert.doesNotMatch(viewSource, /openItemDetail\(\s*itemId\s*\)/, '禁止把字符串 itemId 直接传给 openItemDetail')
})

