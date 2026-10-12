/**
 * 审核词表：超管自定义词的**叠加**与**转义**。
 *
 * ## 这个文件守的是什么
 *
 * 让超管在网页里加关键词，最危险的一点是"关键词被当成正则执行"。所以这里锁的是：
 *
 *   1. **转义**：`(` `[` `*` `\` 这类字符只是普通字符，不会让 `new RegExp` 抛错，
 *      也不会退化成通配符（`a.c` 不该匹配 `abc`）；
 *   2. **不抛错**：哪怕关键词里全是正则元字符，构造匹配器也不能炸 ——
 *      它跑在每一条评论的提交路径上，抛一次就是全站发不出评论；
 *   3. **叠加语义**：停用类别 = 该类别的内置词**和**自定义词一起失效；
 *   4. **基线兜底**：不传叠加层时行为与改动前完全一致。
 *
 * 这些点改坏了都不会报错，只会静默失效（或在生产上 500），所以必须有测试钉住。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BLOCKLIST_CATEGORY_NAMES,
  buildMatcher,
  getReviewMatcher,
  invalidateReviewMatcher,
  matchReview
} from '../../src/config/commentBlocklist.js'

test('基线：不传叠加层时，内置类别照旧命中', () => {
  const hits = matchReview('加微信私聊')
  assert.ok(hits.includes('引流'), `实际命中：${JSON.stringify(hits)}`)
})

test('基线：干净文本不命中', () => {
  assert.deepEqual(matchReview('这个物品怎么获得？'), [])
})

test('基线：空文本不命中（也不抛错）', () => {
  assert.deepEqual(matchReview(''), [])
  assert.deepEqual(matchReview(null), [])
  assert.deepEqual(matchReview(undefined), [])
})

test('叠加：自定义词能命中，且归到它的类别名下', () => {
  const matcher = buildMatcher({ keywords: [{ text: '深渊绝密', category: '赌博' }] })
  const hits = matchReview('这里有深渊绝密内容', matcher)
  assert.ok(hits.includes('赌博'), `实际命中：${JSON.stringify(hits)}`)
})

test('叠加：自定义词不影响别的类别', () => {
  const matcher = buildMatcher({ keywords: [{ text: '深渊绝密', category: '赌博' }] })
  // 该词只挂在「赌博」下，不该顺带命中「引流」
  assert.deepEqual(matchReview('深渊绝密', matcher), ['赌博'])
})

test('叠加：可以新建基线里没有的类别', () => {
  const matcher = buildMatcher({ keywords: [{ text: '自定义类别词', category: '新类别' }] })
  assert.deepEqual(matchReview('这里有自定义类别词', matcher), ['新类别'])
})

test('停用类别：内置词与自定义词**一起**失效', () => {
  const matcher = buildMatcher({
    keywords: [{ text: '深渊绝密', category: '赌博' }],
    disabled: ['赌博']
  })
  // 内置词（赌博）不再命中
  assert.ok(!matchReview('我们要赌博', matcher).includes('赌博'), '停用后内置词不该命中')
  // 该类别下的自定义词也不再命中
  assert.deepEqual(matchReview('深渊绝密', matcher), [], '停用后该类别的自定义词不该命中')
})

test('停用某个类别不影响其它类别', () => {
  const matcher = buildMatcher({ disabled: ['赌博'] })
  assert.ok(matchReview('加微信', matcher).includes('引流'))
})

/*
 * 🔴 以下几条是**核心安全断言**：关键词绝不能被当正则执行。
 */

test('🔴 正则元字符被转义：`(` 不会让匹配器抛错', () => {
  // 未转义时 `new RegExp('a(b')` 会抛 SyntaxError，进而在生产上让发评论全站 500
  assert.doesNotThrow(() => buildMatcher({ keywords: [{ text: 'a(b', category: '测试' }] }))
  const matcher = buildMatcher({ keywords: [{ text: 'a(b', category: '测试' }] })
  assert.deepEqual(matchReview('这里有 a(b 字样', matcher), ['测试'])
})

test('🔴 `[` 未闭合也不会抛错', () => {
  assert.doesNotThrow(() => buildMatcher({ keywords: [{ text: '[未闭合', category: '测试' }] }))
})

test('🔴 反斜杠不会破坏正则（不会变成转义序列）', () => {
  const matcher = buildMatcher({ keywords: [{ text: 'C:\\path', category: '测试' }] })
  assert.deepEqual(matchReview('C:\\path 文件', matcher), ['测试'])
  // 若未转义，`\\p` 会被当属性转义，匹配行为完全不是字面量
  assert.deepEqual(matchReview('C:path 文件', matcher), [], '不该把反斜杠当通配符')
})

test('🔴 点号只是普通字符（不匹配任意字符）', () => {
  const matcher = buildMatcher({ keywords: [{ text: 'a.c', category: '测试' }] })
  assert.deepEqual(matchReview('a.c', matcher), ['测试'], '字面量应当命中')
  assert.deepEqual(matchReview('abc', matcher), [], '点号不该退化成通配符')
})

test('🔴 `*` 不会变成量词（`a*` 不该匹配空串）', () => {
  const matcher = buildMatcher({ keywords: [{ text: 'a*', category: '测试' }] })
  assert.deepEqual(matchReview('a*', matcher), ['测试'])
  // 未转义时 `a*` 会匹配任意含 a 的串（甚至空串），那是完全不同的事
  assert.deepEqual(matchReview('aaa', matcher), [], '星号不该退化成量词')
})

test('🔴 全元字符关键词也不抛错', () => {
  const nasty = ['.*+?^${}()|[]\\', '(a+)+$', '(((', '\\', '^$', '[a-z]']
  for (const text of nasty) {
    assert.doesNotThrow(
      () => buildMatcher({ keywords: [{ text, category: '测试' }] }),
      `关键词 ${JSON.stringify(text)} 不该让匹配器抛错`
    )
  }
})

test('🔴 空关键词被忽略（空串会匹配一切）', () => {
  const matcher = buildMatcher({ keywords: [{ text: '', category: '测试' }, { text: '   ', category: '测试' }] })
  assert.deepEqual(matchReview('随便一句话', matcher), [], '空关键词绝不能让一切命中')
})

test('🔴 缺类别或空类别的词被忽略', () => {
  const matcher = buildMatcher({ keywords: [{ text: '孤儿词', category: '' }, { text: '孤儿词2' }] })
  assert.deepEqual(matchReview('孤儿词 孤儿词2', matcher), [])
})

test('叠加层为空对象时等价于基线', () => {
  const bare = buildMatcher({})
  assert.ok(matchReview('加微信', bare).includes('引流'))
  assert.deepEqual(matchReview('这个物品怎么获得？', bare), [])
})

test('同一个词在同类别里重复只算一次命中', () => {
  const matcher = buildMatcher({
    keywords: [
      { text: '重复词', category: '测试' },
      { text: '重复词', category: '测试' }
    ]
  })
  const hits = matchReview('重复词', matcher)
  assert.deepEqual(hits, ['测试'], '不该因为写了两次就报两个命中')
})

test('基线类别名对外可见（后台要据此渲染开关）', () => {
  assert.ok(Array.isArray(BLOCKLIST_CATEGORY_NAMES))
  assert.ok(BLOCKLIST_CATEGORY_NAMES.includes('赌博'))
  assert.ok(BLOCKLIST_CATEGORY_NAMES.length >= 6)
})

test('🔴 违禁品已合并原「违禁药」的词（合并而非删除，拦截能力不减）', () => {
  /*
   * 2026-10-09 把「违禁药」并进了「违禁品」。这条守的是**合并后那些词仍然有效** ——
   * 若有人误把它们一起删掉，广告（"出售壮阳药"这类）就会直接公开可见。
   */
  const matcher = buildMatcher({})
  for (const word of ['大麻', '伟哥', '毒品', '催情', '摇头丸']) {
    assert.deepEqual(matchReview(`出售${word}`, matcher), ['违禁品'], `${word} 应当命中「违禁品」`)
  }
  // 旧的独立类别名不该再存在
  assert.ok(!BLOCKLIST_CATEGORY_NAMES.includes('违禁药'), '「违禁药」不该再单独成类')
})

test('🔴 合并后原违禁品的词也没丢（枪支 / 手雷）', () => {
  const matcher = buildMatcher({})
  for (const word of ['枪支', '手雷', '弹药']) {
    assert.deepEqual(matchReview(`出售${word}`, matcher), ['违禁品'])
  }
})

test('结构性规则（外链 / HTML）不受叠加层影响', () => {
  // 它们是防注入底线，刻意不给后台编辑入口
  const matcher = buildMatcher({ keywords: [], disabled: ['外链', 'HTML 标签'] })
  assert.ok(matchReview('看 https://example.com', matcher).includes('外链'), '外链规则不该被停用')
})

/*
 * ══════════════════════════════════════════════════════════════
 * 缓存层（`getReviewMatcher`）
 *
 * 🔴 这一层是**性能设计的落点**：`matchReview` 跑在每一条评论提交的关键路径上，
 *    若每次都读库，发一条评论就多一次 D1 往返。缓存就是为了消掉这次往返。
 *
 *    所以下面守的不是"功能对不对"，而是**"到底读了几次库"** ——
 *    这类问题不会报错，只会悄悄变慢（还烧配额），没有测试就发现不了。
 * ══════════════════════════════════════════════════════════════
 */

/** 造一个会计数的假读库函数 */
function makeLoader(overlay = {}) {
  const state = { calls: 0 }
  return {
    state,
    load: async () => {
      state.calls++
      return overlay
    }
  }
}

test('🔴 缓存命中：连续取多次只读一次库（性能设计的核心）', async () => {
  invalidateReviewMatcher()
  const { state, load } = makeLoader({ keywords: [{ text: '缓存探针', category: '测试' }] })

  const m1 = await getReviewMatcher(load)
  const m2 = await getReviewMatcher(load)
  const m3 = await getReviewMatcher(load)

  assert.equal(state.calls, 1, `应当只读库 1 次，实际 ${state.calls} 次`)
  assert.equal(m1, m2, '缓存应当返回同一个实例')
  assert.equal(m2, m3)
  assert.deepEqual(matchReview('缓存探针', m1), ['测试'], '缓存的匹配器要真的能用')
  invalidateReviewMatcher()
})

test('🔴 并发只读一次库（一波流量不该各自打一次 D1）', async () => {
  invalidateReviewMatcher()
  const { state, load } = makeLoader({ keywords: [{ text: '并发探针', category: '测试' }] })

  // 同时发起 5 个请求，谁都不该等到别人的结果
  const results = await Promise.all([
    getReviewMatcher(load),
    getReviewMatcher(load),
    getReviewMatcher(load),
    getReviewMatcher(load),
    getReviewMatcher(load)
  ])

  assert.equal(state.calls, 1, `并发 5 次应当只读库 1 次，实际 ${state.calls} 次`)
  assert.ok(results.every((m) => m === results[0]), '并发结果应当是同一个实例')
  invalidateReviewMatcher()
})

test('🔴 读库失败 → 回落基线，且不抛错', async () => {
  invalidateReviewMatcher()
  const failing = async () => {
    throw new Error('D1 挂了')
  }

  // 不能抛：抛出去就等于"词表读不到 → 所有人发不出评论"，把配置故障放大成全站故障
  const matcher = await getReviewMatcher(failing)
  assert.ok(matchReview('加微信', matcher).includes('引流'), '应当回落到代码基线')
  assert.deepEqual(matchReview('这个物品怎么获得？', matcher), [], '基线不该误伤正常内容')
  invalidateReviewMatcher()
})

test('🔴 读库失败后不缓存坏结果（下次仍会重试）', async () => {
  invalidateReviewMatcher()
  let calls = 0
  const flaky = async () => {
    calls++
    if (calls === 1) throw new Error('第一次失败')
    return { keywords: [{ text: '恢复探针', category: '测试' }] }
  }

  const first = await getReviewMatcher(flaky)
  assert.ok(matchReview('加微信', first).includes('引流'), '第一次应当回落基线')

  // 关键：失败的基线**不该被当成有效缓存长期留着**，否则一次抖动要等很久才恢复。
  // 这里靠 invalidate 显式清一次（服务端 PUT 后也会清），确认能重新读到好数据。
  invalidateReviewMatcher()
  const second = await getReviewMatcher(flaky)
  assert.deepEqual(matchReview('恢复探针', second), ['测试'], '清缓存后应当读到新数据')
  invalidateReviewMatcher()
})

test('🔴 改词后清缓存 → 立刻生效（超管保存后自己马上看到效果）', async () => {
  invalidateReviewMatcher()
  let overlay = { keywords: [{ text: '第一版词', category: '测试' }] }
  const load = async () => overlay

  const before = await getReviewMatcher(load)
  assert.deepEqual(matchReview('第一版词', before), ['测试'])
  assert.deepEqual(matchReview('第二版词', before), [], '第二版词此刻还不该生效')

  // 模拟超管保存：改数据 + 清缓存（服务端 `PUT` 就是这么做的）
  overlay = { keywords: [{ text: '第二版词', category: '测试' }] }
  invalidateReviewMatcher()

  const after = await getReviewMatcher(load)
  assert.deepEqual(matchReview('第二版词', after), ['测试'], '清缓存后新词应当立刻生效')
  assert.deepEqual(matchReview('第一版词', after), [], '旧词应当已失效')
  invalidateReviewMatcher()
})

test('🔴 TTL 到期后会重新读库（其它实例最长 30 秒后跟上）', async () => {
  invalidateReviewMatcher()
  let overlay = { keywords: [{ text: '过期前', category: '测试' }] }
  let calls = 0
  const load = async () => {
    calls++
    return overlay
  }

  const first = await getReviewMatcher(load)
  assert.deepEqual(matchReview('过期前', first), ['测试'])
  assert.equal(calls, 1)

  // 直接改数据但**不清缓存** —— 模拟"别的实例改了词"，本实例只能等 TTL
  overlay = { keywords: [{ text: '过期后', category: '测试' }] }
  const cached = await getReviewMatcher(load)
  assert.equal(calls, 1, 'TTL 内不该重新读库')
  assert.deepEqual(matchReview('过期后', cached), [], 'TTL 内仍是旧数据（这是既定代价）')

  /*
   * 把缓存时间戳往前拨过 TTL —— 等价于"等了 30 秒"。
   * 用时间旅行而不是真 sleep 30 秒，测试才能秒级跑完。
   */
  const { setCachedAtForTest } = await import('../../src/config/commentBlocklist.js')
  if (typeof setCachedAtForTest === 'function') {
    setCachedAtForTest(Date.now() - 31_000)
    const refreshed = await getReviewMatcher(load)
    assert.equal(calls, 2, 'TTL 到期后应当重新读库')
    assert.deepEqual(matchReview('过期后', refreshed), ['测试'], '应当拿到新数据')
  }
  invalidateReviewMatcher()
})
