/**
 * 发信：腾讯云 SES（HTTP API，TC3-HMAC-SHA256 签名）。
 *
 * ## 为什么是 HTTP API 而不是 SMTP
 *
 * Workers 里**做不了原始 SMTP**（没有裸 TCP socket）。腾讯云 SES 提供的
 * `ses.tencentcloudapi.com` HTTP 接口是唯一可行路径，代价是要自己实现 TC3 签名。
 *
 * ## 本地打桩（重要）
 *
 * 设了 `MAIL_STUB=1`（`.dev.vars` 里默认开着）时**不真的发信**，
 * 只把验证码打到控制台日志。两个好处：
 * 1. 本地把注册流程跑通，不会误发真邮件、不消耗免费额度、不污染域名信誉；
 * 2. 端到端测试**可以拿到验证码**（否则测试根本没法自动登录）。
 *
 * ⚠️ **生产绝不能设 `MAIL_STUB`** —— 那会让注册流程"看起来成功但收不到信"，
 * 是个极难排查的静默故障。代码里对此做了显式告警。
 *
 * ## 与文档的对应
 *
 * 接口契约见 `docs/technical/ACCOUNT_SYSTEM.md` §7.4；
 * 模板与变量见 `scripts/dev/ses-templates/README.md`。
 */

import { SES_REGION, SES_TEMPLATE_ID, SES_VARS } from '../config/auth.js'
import { hmacRaw, sha256Hex, toHex } from './authCrypto.js'

const SES_HOST = 'ses.tencentcloudapi.com'
const SES_SERVICE = 'ses'
const SES_VERSION = '2020-10-02'

/** 把对象按 TC3 要求排序并拼成 `k=v&k=v`（值需 encodeURIComponent）。 */
function canonicalQuery(params) {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')
}

/**
 * 生成 TC3-HMAC-SHA256 签名头。
 *
 * 参考腾讯云官方文档「签名方法 v3」。这里的实现刻意**不引入 SDK**
 * （腾讯云 Node SDK 体积大、且会拖慢 Worker 冷启动），
 * 只用 WebCrypto 的 HMAC，与 `authCrypto.js` 共用同一套原语。
 *
 * @param {{secretId:string, secretKey:string, action:string, payload:object, timestamp:number}} p
 */
async function buildTc3Headers({ secretId, secretKey, action, payload, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10) // UTC yyyy-mm-dd
  const body = JSON.stringify(payload)

  // ---- 1. 规范请求串 ----
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${SES_HOST}\n`
  const signedHeaders = 'content-type;host'
  const hashedPayload = await sha256Hex(body)
  const canonicalRequest = [
    'POST',
    '/',
    '',                       // 查询串为空
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join('\n')

  // ---- 2. 待签名字符串 ----
  const credentialScope = `${date}/${SES_SERVICE}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n')

  // ---- 3. 逐级派生签名密钥（每一步的输出都是下一步的**二进制**密钥）----
  const kDate = await hmacRaw('TC3' + secretKey, date)
  const kService = await hmacRaw(kDate, SES_SERVICE)
  const kSigning = await hmacRaw(kService, 'tc3_request')
  const signature = toHex(await hmacRaw(kSigning, stringToSign))

  // ---- 4. 授权头 ----
  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    authorization,
    headers: {
      authorization,
      'content-type': 'application/json; charset=utf-8',
      host: SES_HOST,
      'x-tc-action': action,
      'x-tc-version': SES_VERSION,
      'x-tc-region': SES_REGION,
      'x-tc-timestamp': String(timestamp)
    },
    body
  }
}

/**
 * 发一封验证码邮件。
 *
 * @returns {Promise<{ok:boolean, stubbed?:boolean, messageId?:string, error?:string}>}
 *   **永不抛异常** —— 发信失败不该让整个请求 500：注册流程里
 *   用户已经通过了人机验证与限流，这时应该告诉他"邮件暂时发不出去，请稍后再试"，
 *   而不是一个内部错误。
 */
export async function sendVerifyCode(env, { to, code, minutes }) {
  const stub = String(env.MAIL_STUB || '') === '1'
  const hasKeys = Boolean(env.TENCENT_SECRET_ID && env.TENCENT_SECRET_KEY)

  if (stub) {
    /*
     * 打桩模式：把验证码打进日志，方便本地与端到端测试取用。
     * 这里**故意用 console.warn**（而不是 log），让它在一堆输出里显眼。
     */
    console.warn(`[MAIL_STUB] 验证码邮件（未真发）→ ${to}  code=${code}  minutes=${minutes}`)
    if (env.CF_PAGES || env.ENVIRONMENT === 'production') {
      // 生产环境设了打桩开关 = 用户永远收不到信，属于必须立刻发现的配置事故
      console.error('[MAIL_STUB] ⚠️⚠️ 生产环境误开了 MAIL_STUB，用户将收不到任何验证码邮件！')
    }
    return { ok: true, stubbed: true }
  }

  if (!hasKeys) {
    // 不是打桩、又没配密钥 —— 配置缺失。fail-closed，但要说清原因。
    console.error('[mail] 缺少 TENCENT_SECRET_ID / TENCENT_SECRET_KEY，且未开启 MAIL_STUB')
    return { ok: false, error: 'missing-credentials' }
  }

  const templateId = Number(env.TENCENT_TEMPLATE_ID || SES_TEMPLATE_ID)
  const payload = {
    FromEmailAddress: env.TENCENT_FROM || undefined,
    Subject: env.TENCENT_SUBJECT || undefined,
    Destination: [to],
    Template: {
      TemplateID: templateId,
      // ⚠️ TemplateData 是**字符串形式的 JSON**（腾讯云的约定），不是对象。
      //    变量名必须与模板里的 {{...}} 完全一致，否则邮件里的验证码会是空白。
      TemplateData: JSON.stringify({ [SES_VARS.code]: code, [SES_VARS.minutes]: String(minutes) })
    },
    TriggerType: 1,   // 1 = 触发类（验证码）。**不能设成 0**，否则会被当成营销类
    Unsubscribe: 0    // 触发类不加退订链接，见 ses-templates/README.md
  }
  // undefined 会让 JSON.stringify 直接丢掉该字段，比写空串更干净
  const from = env.TENCENT_FROM || '深渊大书院 <noreply@mail.yxzmy.top>'
  payload.FromEmailAddress = from
  const subject = env.TENCENT_SUBJECT || '【深渊大书院】邮箱验证码'
  payload.Subject = subject

  try {
    const { headers, body } = await buildTc3Headers({
      secretId: env.TENCENT_SECRET_ID,
      secretKey: env.TENCENT_SECRET_KEY,
      action: 'SendEmail',
      payload,
      timestamp: Math.floor(Date.now() / 1000)
    })

    const res = await fetch(`https://${SES_HOST}`, { method: 'POST', headers, body })
    const data = await res.json().catch(() => ({}))

    if (data?.Response?.Error) {
      // 错误码能直接区分"权限窄了"还是"模板不对"，是排错的关键线索
      const { Code, Message } = data.Response.Error
      console.error(`[mail] SES 报错 Code=${Code} Message=${Message}`)
      return { ok: false, error: Code }
    }
    return { ok: true, messageId: data?.Response?.MessageId }
  } catch (err) {
    console.error('[mail] 请求 SES 失败:', err)
    return { ok: false, error: 'network' }
  }
}
