import assert from 'node:assert/strict'
import test from 'node:test'

import { PASSWORD_MIN } from '../../src/config/auth.js'
import {
  checkPasswordStrength,
  passwordStrengthLevel,
  WEAK_PASSWORDS
} from '../../src/config/weakPasswords.js'

/**
 * 弱密码拦截的守护测试。
 *
 * 这套逻辑**只在前端存在**（服务端拿不到密码），所以它没有第二道防线：
 * 漏了就真的漏了。单测要同时守住两个方向：
 *  - **该拦的拦得住**（常见弱密码、序列、重复、含自己信息）；
 *  - **不该拦的别误伤**（长口令、含符号的正常密码、中文密码）。
 *
 * 第二条同样重要 —— 过严的规则会把用户逼去用 `Abc123!@#`，
 * 那反而比一个长口令更容易被字典破。
 */

const OK = (pw, ctx) => assert.equal(checkPasswordStrength(pw, ctx).ok, true, `应通过：${pw}`)
const NO = (pw, ctx) => assert.equal(checkPasswordStrength(pw, ctx).ok, false, `应拒绝：${pw}`)

test('太短的拒绝，恰好 PASSWORD_MIN 位通过', () => {
  NO('')
  NO('a')

  // 直接验证"长度"这条规则本身（挑一个不会被其它规则抢先命中的样本）
  const six = checkPasswordStrength('aB3$xY')
  assert.equal(six.ok, false)
  assert.match(six.reason, /至少/, `6 位应因长度被拒，实际 reason=${six.reason}`)

  // 恰好够长、且不含其它问题 → 通过
  // ⚠️ 别拿 'aaaaaaaa' 当样本：它会被"重复字符"规则拦掉（那是另一条规则的正确行为）
  const exact = 'aB3$xY9z'
  assert.equal(exact.length, PASSWORD_MIN)
  OK(exact)
})

test('常见弱密码全部命中黑名单', () => {
  // 直接遍历整张表：将来往里加词条时，这条会自动覆盖新加的
  for (const weak of WEAK_PASSWORDS) {
    const r = checkPasswordStrength(weak)
    // 有些词条可能因为"太短"或"重复字符"先被别的规则拦掉，那也算拦住了
    assert.equal(r.ok, false, `黑名单里的 "${weak}" 竟然通过了（reason=${r.reason}）`)
  }
  // 这是**精选**清单（中文语境高频 + 键盘序 + 本站相关），不是完整字典：
  // 真正的字典攻击防线是 PBKDF2 60 万轮与服务端限流，不是这张表。
  // 阈值只用来防止"不小心把表删空了"。
  assert.ok(WEAK_PASSWORDS.size >= 70, `黑名单只有 ${WEAK_PASSWORDS.size} 条，疑似被误删`)
})

test('大小写变形也拦得住（黑名单比对前会转小写）', () => {
  NO('PASSWORD')
  NO('Password')
  NO('PASSWORD123')
  NO('WoAiNi1314')
})

test('重复字符与连续序列拒绝', () => {
  NO('aaaaaaaa')
  NO('11111111')
  NO('abababab')
  NO('12345678')
  NO('abcdefgh')
  NO('87654321')
  NO('hgfedcba')
  NO('abcdefghij')
})

test('纯数字拒绝', () => {
  NO('28471937')
  NO('99999999')
})

test('包含自己的邮箱前缀或昵称 → 拒绝', () => {
  NO('player2024pass', { email: 'player@example.com' })
  NO('xxplayerxx99', { email: 'player@example.com' })
  NO('mynick-is-long', { nick: 'mynick' })
  // 短于 3 个字符的片段不参与判断（否则 'ab' 会误伤一大片）
  OK('ab-random-long-pass', { email: 'ab@x.com' })
  // 没传上下文时不检查
  OK('player2024pass')
})

test('不该误伤的：长口令、含符号、中文、无规律', () => {
  OK('correct-horse-battery-staple')
  OK('Tr0ub4dor&3xKcd')
  OK('我的密码很长很安全')
  OK('x7#kQ2!mZp9$wL')
  OK('aB3$dE6&gH9@')
  OK('n4Kp8Qz2Wm5R')
  // 空格的 passphrase 也该通过
  OK('  spaces  are  fine  ')
})

test('reason 是可直接展示的中文，且 ok 时为空串', () => {
  const good = checkPasswordStrength('correct-horse-battery')
  assert.equal(good.reason, '')
  for (const bad of ['', 'abc', '12345678', 'aaaaaaaa', 'abcdefgh', '28471937', 'password']) {
    const r = checkPasswordStrength(bad)
    assert.equal(r.ok, false)
    assert.ok(r.reason.length > 0, `"${bad}" 没有给出原因`)
    assert.ok(!/[A-Za-z]{4,}/.test(r.reason), `原因里不该出现英文单词：${r.reason}`)
  }
})

test('强度等级：弱密码一律 0 级', () => {
  for (const weak of ['12345678', 'password', 'aaaaaaaa']) {
    assert.equal(passwordStrengthLevel(weak), 0, `"${weak}" 的强度应为 0`)
  }
  assert.equal(passwordStrengthLevel('abc'), 0, '太短应为 0')
  assert.ok(passwordStrengthLevel('correct-horse-battery-staple') >= 2)
  assert.ok(passwordStrengthLevel('x7#kQ2!mZp9$wL') >= 2)
})

test('强度等级不超过上限 3', () => {
  const long = 'aB3$' + 'xY9&'.repeat(10)
  assert.ok(passwordStrengthLevel(long) <= 3)
})
