import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeGachaRecords,
  classifyPoolKind,
  evaluateLuckScore,
  GAME_GACHA_CONFIG,
  generateDemoGachaRecords
} from '../../src/utils/gachaAnalyzer.js'

describe('gachaAnalyzer - 深渊之歌核心机制校验', () => {
  it('深渊之歌专属保底抽数与概率契约校验', () => {
    assert.equal(GAME_GACHA_CONFIG.PITY_5_STAR, 36, '5星保底必须为36抽，绝非其他游戏的80/90/99抽')
    assert.equal(GAME_GACHA_CONFIG.PITY_4_STAR, 10, '4星保底必须为10抽')
    assert.equal(GAME_GACHA_CONFIG.BASE_RATE_5_STAR, 2.3, '5星基础概率为2.3%')
    assert.equal(GAME_GACHA_CONFIG.CRYSTAL_PER_PULL, 200, '单抽消耗200神晶')
  })

  it('卡池分类与UP判定正确区分限定、常规与魔物蛋池', () => {
    assert.equal(classifyPoolKind({ id: '2', kind: 'hero', upTypes: ['hero_060'] }), 'hero_limited')
    assert.equal(classifyPoolKind({ id: '1', kind: 'hero', upTypes: [] }), 'hero_standard')
    assert.equal(classifyPoolKind({ id: '3', kind: 'hero', name: '新锐招募' }), 'hero_standard')
    assert.equal(classifyPoolKind({ id: '1', kind: 'pet' }), 'pet_standard')
    assert.equal(classifyPoolKind({ id: '3', kind: 'pet', upTypes: ['pet_106'] }), 'pet_limited')
  })

  it('保底进度垫刀与出金抽数精确计算（36抽上限）', () => {
    const records = [
      { id: 1, typeId: 'hero_002', quality: 3, at: 1000 },
      { id: 2, typeId: 'hero_046', quality: 3, at: 2000 },
      { id: 3, typeId: 'hero_060', quality: 5, at: 3000 }, // 3抽第1金 (UP)
      { id: 4, typeId: 'hero_062', quality: 3, at: 4000 },
      { id: 5, typeId: 'hero_049', quality: 5, at: 5000 }, // 2抽第2金 (歪)
      { id: 6, typeId: 'hero_002', quality: 3, at: 6000 },
      { id: 7, typeId: 'hero_046', quality: 3, at: 7000 },
      { id: 8, typeId: 'hero_046', quality: 3, at: 8000 }  // 已垫3抽
    ]

    const result = analyzeGachaRecords(records, {
      poolInfo: { id: '2', name: '公主招募', kind: 'hero', upTypes: ['hero_060'] }
    })

    assert.equal(result.overview.totalPulls, 8)
    assert.equal(result.overview.goldCount, 2)
    assert.equal(result.heroLimited.pityCount, 3, '当前已垫3抽')
    assert.equal(result.heroLimited.pityMax, 36, '保底上限必须是36')
    assert.equal(result.heroLimited.golds.length, 2)
    assert.equal(result.heroLimited.golds[0].pullCount, 3)
    assert.equal(result.heroLimited.golds[0].isUp, true)
    assert.equal(result.heroLimited.golds[1].pullCount, 2)
    assert.equal(result.heroLimited.golds[1].isUp, false)
    assert.equal(result.heroLimited.isGuaranteedUp, true, '上一次出金歪了，当前大保底必定生效')
  })

  it('欧非评级算法贴合36抽期望分布且采用主流二游抽卡称号', () => {
    const godLuck = evaluateLuckScore({ avgGoldPulls: 12, upRate: 100, goldCount: 4 })
    assert.equal(godLuck.title, '天命欧皇')

    const lucky = evaluateLuckScore({ avgGoldPulls: 22, upRate: 50, goldCount: 2 })
    assert.equal(lucky.title, '欧气满满')

    const normalLuck = evaluateLuckScore({ avgGoldPulls: 29, upRate: 50, goldCount: 2 })
    assert.equal(normalLuck.title, '平常心欧皇')
    assert.ok(!normalLuck.title.includes('学者'), '彻底告别冷门学者文案')

    const badLuck = evaluateLuckScore({ avgGoldPulls: 35, upRate: 20, goldCount: 1 })
    assert.ok(badLuck.title.includes('非酋') || badLuck.title.includes('保底'))
  })

  it('限定池连UP标签算法能正确统计历史最长连胜与当前连胜', () => {
    // 构造限定池：第1金UP，第2金UP，第3金UP (历史达成3连UP)，第4金歪
    const streakRecords = [
      { id: 1, typeId: 'hero_060', quality: 5, at: 1000 }, // UP 1
      { id: 2, typeId: 'hero_060', quality: 5, at: 2000 }, // UP 2
      { id: 3, typeId: 'hero_060', quality: 5, at: 3000 }, // UP 3 (3连UP)
      { id: 4, typeId: 'hero_049', quality: 5, at: 4000 }  // 歪 (当前连胜归零，但历史有3连UP)
    ]
    const result = analyzeGachaRecords(streakRecords, {
      poolInfo: { id: '2', name: '公主招募', kind: 'hero', upTypes: ['hero_060'] }
    })

    assert.equal(result.heroLimited.maxUpStreak, 3, '历史最高连UP应为3')
    assert.equal(result.heroLimited.upStreak, 0, '当前连胜因最后一金歪了归零')

    // 标签必须包含 3连UP
    const upTag = result.overview.tags.find(t => t.text === '3连UP')
    assert.ok(upTag, '即使当前中断，成就标签依然必须保留历史达成的 3连UP')
  })

  it('示例数据生成器能产出完备的三池历史数据', () => {
    const demo = generateDemoGachaRecords()
    assert.ok(demo.records.length >= 60, 'Demo 至少包含 60 抽')
    assert.ok(demo.player.uid, '带玩家 UID')

    const analysis = analyzeGachaRecords(demo.records)
    assert.ok(analysis.overview.totalPulls > 0)
    assert.ok(analysis.heroLimited.pulls > 0)
    assert.ok(analysis.heroStandard.pulls > 0)
    assert.ok(analysis.pet.pulls > 0)
    assert.equal(analysis.heroLimited.pityMax, 36)
  })

  it('幽夜招募当期UP仅洛莉安且魔物蛋常规贩售被剔除，5星挂载期间4星', () => {
    const records = [
      { id: 1, poolId: '5', poolName: '幽夜招募', typeId: 'hero_001', quality: 3, at: 1000 },
      { id: 2, poolId: '5', poolName: '幽夜招募', typeId: 'hero_036', quality: 4, at: 2000 }, // 4★
      { id: 3, poolId: '5', poolName: '幽夜招募', typeId: 'hero_025', quality: 4, at: 3000 }, // 4★
      { id: 4, poolId: '5', poolName: '幽夜招募', typeId: 'hero_071', quality: 5, at: 4000 }, // 5★ 洛莉安 (UP)
      { id: 5, poolId: 'pet:2', poolName: '常规贩售', typeId: 'pet_006', quality: 3, at: 5000 }, // 银币池应被剔除
      { id: 6, poolId: 'pet:3', poolName: '御卫贩售', typeId: 'pet_106', quality: 5, at: 6000 }
    ]

    const result = analyzeGachaRecords(records)
    // 剔除常规贩售后，总抽数应为 5 抽（排除第5条）
    assert.equal(result.overview.totalPulls, 5, '常规贩售银币蛋池必须被剔除')

    // 幽夜招募 UP 验证：hero_071 是 UP
    const yongyeBanner = result.banners.find(b => b.poolId === 'hero:5' || b.poolId === '5')
    assert.ok(yongyeBanner, '包含幽夜招募卡池')
    assert.deepEqual(yongyeBanner.upHeroes, ['hero_071'], '幽夜招募当期UP仅洛莉安一人，绝无多余角色')

    // 5星挂载4星验证：第4条出的5星应挂载前面出的2个4★
    assert.equal(yongyeBanner.golds.length, 1)
    const gold = yongyeBanner.golds[0]
    assert.equal(gold.name, '洛莉安')
    assert.equal(gold.isUp, true)
    assert.equal(gold.purples.length, 2, '出5星前掉落的2个4星必须被挂载在该5星记录下')
    assert.equal(gold.purples[0].name, '贝尔卡')
    assert.equal(gold.purples[1].name, '嘉莉缇')
  })

  it('模拟真实导出数据：无poolName纯数字poolId下，魔物常规贩卖被过滤且公主招募独立垫刀31抽', () => {
    const records = [
      // 1. 公主招募（poolId: 2, isPet: false）：垫了 31 抽未出金
      ...Array.from({ length: 31 }, (_, i) => ({
        id: 100 + i,
        poolId: '2',
        typeId: 'hero_001',
        crateAt: 1000 + i
      })),
      // 2. 魔物常规贩售（poolId: 2, isPet: true）：银币贩售，必须全量被过滤
      ...Array.from({ length: 50 }, (_, i) => ({
        id: 200 + i,
        poolId: '2',
        typeId: 'pet_006',
        crateAt: 2000 + i
      })),
      // 3. 特别贩售（poolId: 1, isPet: true）：魔物池，UP 必须为空，不能误配德莉
      { id: 301, poolId: '1', typeId: 'pet_006', crateAt: 3000 }
    ]

    const result = analyzeGachaRecords(records)
    // 50 条魔物常规贩卖必须全部被过滤，只剩 31 + 1 = 32 抽
    assert.equal(result.overview.totalPulls, 32)

    // 公主招募必须独立归类为限定池，且当期 UP 为德莉，垫刀恰好为 31 抽
    const gongzhu = result.banners.find(b => b.poolId === 'hero:2' || b.poolName === '公主招募')
    assert.ok(gongzhu, '包含公主招募')
    assert.equal(gongzhu.poolName, '公主招募')
    assert.equal(gongzhu.poolKind, 'hero_limited')
    assert.deepEqual(gongzhu.upHeroes, ['hero_060'], '公主招募UP为德莉')
    assert.equal(gongzhu.pityCount, 31, '公主招募独立垫抽数为31抽')

    // 特别贩售/魔物常规必须归类为魔物常规池，UP 为空
    const tebie = result.banners.find(b => b.poolId === 'pet:1' || b.poolName === '特别贩售' || b.poolName === '魔物常规')
    assert.ok(tebie, '包含魔物常规/特别贩售')
    assert.equal(tebie.poolKind, 'pet_standard')
    assert.deepEqual(tebie.upHeroes, [], '魔物常规UP必须为空，绝不能误配德莉')
  })

  it('5星伙伴与魔物收藏：魔物与伙伴均区分限定与常驻，限定优先排序且指标准确', () => {
    const records = [
      // 角色限定 UP：德莉 (hero_060) x2
      { id: 1, poolId: '2', typeId: 'hero_060', crateAt: 1000 },
      { id: 2, poolId: '2', typeId: 'hero_060', crateAt: 2000 },
      // 角色常驻歪出：阿莱克西娅 (hero_051) x1
      { id: 3, poolId: '2', typeId: 'hero_051', crateAt: 3000 },
      // 魔物限定 UP：圣骑士史莱姆 (pet_106) x3
      { id: 4, poolId: 'pet:3', typeId: 'pet_106', crateAt: 4000 },
      { id: 5, poolId: 'pet:3', typeId: 'pet_106', crateAt: 5000 },
      { id: 6, poolId: 'pet:3', typeId: 'pet_106', crateAt: 6000 },
      // 魔物常驻歪出：宝石迷迷可 (pet_074) x1
      { id: 7, poolId: 'pet:3', typeId: 'pet_074', crateAt: 7000 },
      // 魔物常驻歪出：真护之黑龙 (pet_077) x1
      { id: 8, poolId: 'pet:3', typeId: 'pet_077', crateAt: 8000 }
    ]

    const result = analyzeGachaRecords(records)
    // 总金数 8，限定金数 2 (德莉) + 3 (圣骑士史莱姆) = 5
    // 常驻金数 1 (阿莱克西娅) + 1 (宝石迷迷可) + 1 (真护之黑龙) = 3
    assert.equal(result.overview.goldCount, 8)
    assert.equal(result.overview.limitedGoldCount, 5, '限定5星总数应为5（含限定角色与限定魔物）')
    assert.equal(result.overview.standardGoldCount, 3, '常驻5星总数应为3（含常驻角色与常驻魔物）')

    // 收藏排序验证：限定排在前面，常驻排在后面
    const collection = result.overview.goldCollection
    assert.equal(collection.length, 5)
    // 前面两项应为限定：圣骑士史莱姆 (count=3, isLimited=true)、德莉 (count=2, isLimited=true)
    assert.equal(collection[0].isLimited, true)
    assert.equal(collection[0].name, '圣骑士史莱姆')
    assert.equal(collection[0].count, 3)
    assert.equal(collection[1].isLimited, true)
    assert.equal(collection[1].name, '德莉')
    assert.equal(collection[1].count, 2)
    // 后面三项应为常驻：isLimited = false
    assert.equal(collection[2].isLimited, false)
    assert.equal(collection[3].isLimited, false)
    assert.equal(collection[4].isLimited, false)
  })
})
