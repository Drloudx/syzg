/**
 * 生成 `src/config/captchaEggs.js` —— 人机验证（蛋点选）要用的蛋图内联数据。
 *
 * 用法：
 *   node scripts/dev/gen-captcha-eggs.mjs
 *
 * ## 为什么必须内联
 *
 * 两个独立的硬约束叠在一起：
 *
 * 1. **Cloudflare Worker 读不到 `public/` 下的文件**（现有 API 注释里已写明）。
 *    所以运行时的 Worker 拿不到 `public/images/eggs/*.webp`；
 * 2. **不能把图片 URL 发给前端**。若 SVG 里写 `<image href="/images/eggs/pet_074.webp">`，
 *    脚本读一下 `href` 就知道"这个位置是哪个蛋"，题目形同虚设。
 *
 * 于是只剩一条路：**构建期把 webp 转成 base64 data URI，随模块一起打进 Worker 包**。
 *
 * ## 诚实的防护定位
 *
 * 内联 base64 只能防"读文件名"这种最偷懒的做法。**同一张图的 base64 字节仍然相同**，
 * 所以有心的脚本依然能把 13 个蛋全下载下来建表匹配。
 *
 * 这不是本方案独有的问题 —— **任何"用户能看懂"的图片验证码都防不住能写图像处理的脚本**。
 * 真正的防线是**限流**（同邮箱冷却 + 同 IP 限流 + 一次性邮箱黑名单 + SES 日限额 500 的硬熔断）。
 * 详见 `docs/technical/ACCOUNT_SYSTEM.md` §17.2。
 *
 * ## 蛋池范围
 *
 * 只用 **4 星与 5 星**蛋（`pet-eggs.json` 的 `displayStar >= 4`），共 13 个。
 * ⚠️ 必须用 `displayStar` —— `star` 是内部值，32 个蛋里没有一个是两者相同的
 * （内部 1/2/3 对应显示 3/4/5）。
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const SRC_JSON = path.join(ROOT, 'public/data/parsed/pet-eggs.json')
const EGGS_DIR = path.join(ROOT, 'public/images/eggs')
const OUT = path.join(ROOT, 'src/config/captchaEggs.js')

const MIN_STAR = 4

const data = JSON.parse(readFileSync(SRC_JSON, 'utf8'))
const pool = (data.pets || [])
  .filter((p) => Number(p.displayStar) >= MIN_STAR)
  .sort((a, b) => (b.displayStar - a.displayStar) || a.name.localeCompare(b.name, 'zh'))

if (pool.length < 6) {
  throw new Error(`蛋池太小（${pool.length} 个），至少需要 6 个才能出题`)
}

const entries = []
let rawBytes = 0

for (const pet of pool) {
  const file = path.join(EGGS_DIR, `${pet.eggImg}.webp`)
  let buf
  try {
    buf = readFileSync(file)
  } catch {
    throw new Error(`缺图：${file}（pet-eggs.json 里的 eggImg=${pet.eggImg}）`)
  }
  rawBytes += statSync(file).size
  entries.push({
    id: pet.eggImg,
    star: Number(pet.displayStar),
    // name 只用于服务端调试日志，**不会发给前端**（§17.2：提示区与画布都不放名字）
    name: pet.name,
    b64: 'data:image/webp;base64,' + buf.toString('base64')
  })
}

const stars = {}
for (const e of entries) stars[e.star] = (stars[e.star] || 0) + 1

const body = entries
  .map((e) => `  { id: ${JSON.stringify(e.id)}, star: ${e.star}, name: ${JSON.stringify(e.name)}, b64: ${JSON.stringify(e.b64)} }`)
  .join(',\n')

const out = `/**
 * 人机验证（蛋点选）用的蛋图内联数据。
 *
 * 🔴 **本文件由脚本自动生成，不要手改。**
 *    重新生成：\`node scripts/dev/gen-captcha-eggs.mjs\`
 *    数据源：\`public/data/parsed/pet-eggs.json\`（displayStar >= ${MIN_STAR}）+ \`public/images/eggs/*.webp\`
 *
 * 为什么要内联、以及它的防护边界，见生成脚本头部的说明。
 * 一句话：**内联只防"读文件名"，真正的防线是限流。**
 *
 * 蛋池构成：${Object.entries(stars).map(([s, n]) => `${s} 星 ${n} 个`).join('、')}，共 ${entries.length} 个。
 */

/** 每个元素：\`{ id, star, name, b64 }\`。\`name\` 仅服务端调试用，绝不返回给客户端。 */
export const CAPTCHA_EGGS = Object.freeze([
${body}
])

/** 可用星级（升序）。出题时随机取一个星级当"目标星级"。 */
export const CAPTCHA_STARS = Object.freeze([...new Set(CAPTCHA_EGGS.map((e) => e.star))].sort())

/** 按星级取蛋池。 */
export function eggsOfStar(star) {
  return CAPTCHA_EGGS.filter((e) => e.star === star)
}
`

writeFileSync(OUT, out, 'utf8')

const outSize = statSync(OUT).size
console.log('=== 生成完毕 ===')
console.log('  输出      : ' + path.relative(ROOT, OUT))
console.log('  蛋池      : ' + entries.length + ' 个（' + Object.entries(stars).map(([s, n]) => s + '星 ' + n + '个').join(' / ') + '）')
console.log('  原图合计  : ' + (rawBytes / 1024).toFixed(1) + ' KB')
console.log('  模块大小  : ' + (outSize / 1024).toFixed(1) + ' KB（base64 膨胀约 1.34×）')
console.log('  可用星级  : ' + [...new Set(entries.map((e) => e.star))].sort().join(', '))
console.log('')
console.log('  蛋池明细：')
entries.forEach((e) => console.log('    ' + e.star + '星  ' + e.id.padEnd(10) + e.name))
