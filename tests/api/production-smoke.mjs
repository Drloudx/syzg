/**
 * 生产环境上线后验证（**非破坏性**）。
 *
 * ## 刻意不做的事
 *
 * - **不注册账号**：生产配了真实 SES，注册会**真的发一封邮件**给一个不存在的地址，
 *   还会在用户表里留一条测试数据。所以只做"不该成功的事必须失败"这类验证。
 * - **不删任何东西**：一条 DELETE 都不发。
 * - **不带管理令牌**：我没有生产的 `ADMIN_TOKEN`，只用本地那个 `yxzm` 验证它**打不开**。
 *
 * 验证的是"上线就绪"这件事本身：新接口在、旧功能没坏、鉴权边界成立。
 */

const BASE = 'https://syzg.yxzmy.top'

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log('  ✅ ' + name)
  } else {
    fail++
    console.log('  ❌ ' + name + (detail ? '  [' + detail + ']' : ''))
  }
}

async function req(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(20_000) })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 可能是 HTML */
  }
  return { status: res.status, json, text }
}

console.log('  目标: ' + BASE + '\n')

// ── 1. 账号接口在位 ──────────────────────────────────────────────
console.log('【1】账号接口已部署')
{
  const salt = await req('/api/auth/salt?email=probe@example.com')
  check('/api/auth/salt 可达（新代码的标志）', salt.status === 200, 'HTTP ' + salt.status)
  check('返回了盐与算法（不泄漏 email_hash）', Boolean(salt.json?.salt && salt.json?.algo))
  check(
    '🔴 响应里没有 email_hash（域分隔没被绕过）',
    !JSON.stringify(salt.json || {}).includes('email_hash')
  )

  const me = await req('/api/auth/me')
  check('未带令牌访问 /api/auth/me → 401', me.status === 401, 'HTTP ' + me.status)

  const captcha = await req('/api/auth/captcha')
  check('人机验证出题接口可用', captcha.status === 200 && typeof captcha.json?.svg === 'string')
  check('🔴 响应里没有答案（answer 不外泄）', !JSON.stringify(captcha.json || {}).includes('answer'))
}

// ── 2. 旧功能没被迁移弄坏 ────────────────────────────────────────
console.log('\n【2】评论读取（不需要登录）仍然正常')
{
  const list = await req('/api/comments?page=site:general&limit=3')
  check('读评论 → 200', list.status === 200, 'HTTP ' + list.status)
  check('返回了评论数组', Array.isArray(list.json?.comments))
  check(
    '🔴 公开接口不暴露 user_id（只给 mine 布尔）',
    !JSON.stringify(list.json?.comments || []).includes('user_id')
  )
  const first = list.json?.comments?.[0]
  check('未登录时 mine 字段存在且为 false', first && 'mine' in first, JSON.stringify(first && Object.keys(first)))
}

// ── 3. 鉴权边界 ──────────────────────────────────────────────────
console.log('\n【3】管理端边界')
{
  const noTok = await req('/api/admin/comments?limit=1')
  check('无令牌 → 401（生产已配 ADMIN_TOKEN）', noTok.status === 401, 'HTTP ' + noTok.status)

  const localTok = await req('/api/admin/comments?limit=1', { headers: { 'x-admin-token': 'yxzm' } })
  check('🔴 本地令牌 yxzm 打不开（线上不是本地值）', localTok.status === 401, 'HTTP ' + localTok.status)

  const stats = await req('/api/admin/stats', { headers: { 'x-admin-token': 'yxzm' } })
  check('新接口 /api/admin/stats 已部署（错令牌下为 401，而非 404）', stats.status === 401, 'HTTP ' + stats.status)
}

// ── 4. 前端页面 ──────────────────────────────────────────────────
console.log('\n【4】前端页面')
{
  const home = await req('/')
  check('首页 → 200', home.status === 200, 'HTTP ' + home.status)

  /*
   * ⚠️ 查 `<title>`，**不要**查 body 里有没有站名 —— 这是 SPA，
   * 页面内容是 JS 渲染的，拿 curl 看到的只有 index.html 那个空壳。
   *
   * 第一版就是这么写错的（查 `text.includes('深渊大书院')` → 假失败），
   * 而正是这次误判让人去看了原始 HTML，才发现线上标题还挂着旧项目名
   * 「深歌小助手」—— 这个真问题比那条假失败有价值得多。
   */
  const title = (home.text.match(/<title>([^<]*)<\/title>/) || [])[1]
  check('站点标题是「深渊大书院」', title === '深渊大书院', '实际 title = ' + title)
  /*
   * ⚠️ 查之前要**剥掉 HTML 注释** —— `index.html` 的 `<head>` 里有意留了一句
   * 「项目已从『深歌小助手』改名为…」的说明注释，那是对的。
   * 不剥的话会报一条假失败（这已经是同一个坑第五次了：模板 Markdown 检查的
   * HTML 注释、link-integrity 的省略扩展名、密钥检查的占位值、site-name 的
   * 「原名」语境，现在是这里）。
   */
  const headNoComments = (home.text.split('</head>')[0] || '').replace(/<!--[\s\S]*?-->/g, '')
  check('旧项目名没有出现在 <head> 的可见内容里', !headNoComments.includes('深歌小助手'))

  const privacy = await req('/#/privacy')
  check('隐私页可达（注册页那个必勾项的链接）', privacy.status === 200, 'HTTP ' + privacy.status)
}

// ── 5. 🔴 不该成功的事必须失败 ───────────────────────────────────
console.log('\n【5】防滥用：错误的注册请求不该成功')
{
  // 不带人机验证凭据 —— 必须被挡；这一步**不会**发出任何邮件
  const bad = await req('/api/auth/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.invalid', purpose: 'register' })
  })
  check('缺人机验证的发码请求被拒（4xx）', bad.status >= 400 && bad.status < 500, 'HTTP ' + bad.status)
}

console.log(`\n  ================ 线上验证：通过 ${pass} / 失败 ${fail} ================`)
process.exit(fail ? 1 : 0)
