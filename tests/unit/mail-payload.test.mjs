/**
 * 发信参数的**类型契约**回归。
 *
 * 2026-10-06 的真实事故：`Unsubscribe` 传了数字 `0`，腾讯云 SES 做严格类型校验、
 * **整封拒收**（`InvalidParameter: input type should be string`）。
 *
 * 为什么这个 bug 特别难发现：
 *   · 发信在 `context.waitUntil` 里**异步**执行，失败只写服务端日志；
 *   · 接口照样返回「验证码已发送」，`auth_codes` 里**也有那条记录**；
 *   · 用户侧表现为"一直收不到验证码"，而**所有本地测试都是绿的**（本地 `MAIL_STUB=1` 根本不发信）。
 *
 * 所以这里不看"发信成功"（那要真凭据、真网络），而是锁住**送出去的 payload 形状**：
 * 只要有人把 `Unsubscribe` 改回数字，本用例立刻变红。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const src = readFileSync(join(root, 'src/utils/authMail.js'), 'utf8')

test('SES 的 Unsubscribe 必须是字符串，不能是数字', () => {
  // 抓 payload 里 Unsubscribe 的字面量
  const m = /Unsubscribe:\s*([^,\n]+)/.exec(src)
  assert.ok(m, 'authMail.js 里应当能找到 Unsubscribe 字段')
  const value = m[1].trim().replace(/\/\/.*$/, '').trim()
  assert.equal(value, "'0'",
    `Unsubscribe 必须是字符串 '0'（腾讯云严格类型校验；传数字 0 会被整封拒收）。当前是：${value}`)
})

test('TriggerType 保持数字 1（该字段接受数字，别跟着一起改成字符串）', () => {
  const m = /TriggerType:\s*([^,\n]+)/.exec(src)
  assert.ok(m, 'authMail.js 里应当能找到 TriggerType 字段')
  const value = m[1].trim().replace(/\/\/.*$/, '').trim()
  assert.equal(value, '1', `TriggerType 应当是数字 1。当前是：${value}`)
})

test('TemplateData 是字符串形式的 JSON（腾讯云约定）', () => {
  assert.ok(/TemplateData:\s*JSON\.stringify\(/.test(src),
    'TemplateData 必须 JSON.stringify 成字符串，不能直接传对象')
})

test('发信失败必须被记录，不能静默吞掉', () => {
  // sendVerifyCode 永不抛异常（设计如此），所以失败只能靠日志 —— 必须真的有日志
  assert.ok(src.includes('[mail] SES 报错'),
    'SES 返回错误码时必须 console.error，否则线上故障无从排查')
  assert.ok(src.includes("[mail] 请求 SES 失败"),
    '网络异常也必须记录')
})
