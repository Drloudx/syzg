/**
 * 站点名的守卫。
 *
 * ## 为什么
 *
 * 项目从「深歌小助手」改名为「深渊大书院」（仓库 `Drloudx/syzg`、站点
 * `syzg.yxzmy.top`）。改名时**邮件模板先改了，站点自己的 `<title>` 漏了** ——
 * 上线后线上浏览器标签页还挂着旧名。
 *
 * 这个是**上线后拿 curl 打生产首页**才发现的（`<title>深歌小助手</title>`）。
 * 本地测试全绿，因为没人断言过"标签页上写的是什么"。
 *
 * ## 刻意不查的地方
 *
 * - `android/app/src/main/assets/public/index.html` —— 那是 **Capacitor 的 web 构建产物**，
 *   由 `npx cap sync` 重新生成，手工改没有意义；
 * - `backups/` 与开发日志里的历史记录 —— 那些**本来就该保留旧名**（它们记录的是当时的事）。
 */

import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const OLD_NAME = '深歌小助手'
const NEW_NAME = '深渊大书院'

test(`站点标题是「${NEW_NAME}」而不是旧名`, () => {
  const html = readFileSync('index.html', 'utf8')
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]
  assert.equal(
    title,
    NEW_NAME,
    `index.html 的 <title> 是「${title}」—— 它是浏览器标签页 / 搜索结果 / ` +
      `分享链接预览里显示的名字，必须与项目新名一致。`
  )
})

test(`用户可见的位置没有把旧名「${OLD_NAME}」当成现名用`, () => {
  /*
   * ⚠️ 规则不能写成"完全不许出现旧名" —— README / SPEC 里**有意**留了
   * 「原名『深歌小助手』」作为历史说明，那是对的（改名这件事本身值得记一笔）。
   *
   * 所以要查的是"**当成现名用**"：旧名只允许出现在带「原名」的语境里。
   * 第一版写成完全不许出现，结果把那几处正确用法也报了出来 ——
   * 又是"误报会淹掉真问题"。
   */
  const files = [
    'index.html',
    'capacitor.config.json',
    'android/app/src/main/res/values/strings.xml',
    'src/views/GachaView.vue',
    'src/components/gacha/GachaResultPanel.vue',
    'README.md',
    'docs/ARCHITECTURE.md',
    'docs/SPEC.md',
    'docs/HANDOFF_FULL.md'
  ]

  /** 「历史说明」语境：同一行里出现这些词之一，就算在讲改名这件事，不算当现名用 */
  const HISTORICAL = /原名|旧名|曾用名|改名为|改名成|renamed|formerly/

  const bad = []
  for (const f of files) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!line.includes(OLD_NAME)) return
        if (HISTORICAL.test(line)) return
        bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`)
      })
  }

  assert.deepEqual(
    bad,
    [],
    `这些地方把旧名当现名用了（要么改成「${NEW_NAME}」，要么写成「原名『${OLD_NAME}』」）：\n` +
      bad.map((b) => '  · ' + b).join('\n')
  )
})

test('Android 包名没有被改名波及（改了会让已装用户无法升级）', () => {
  const cap = JSON.parse(readFileSync('capacitor.config.json', 'utf8'))
  assert.equal(
    cap.appId,
    'com.myrzg.assistant',
    'capacitor.config.json 的 appId 是 Android 包名 —— **绝不能改**：' +
      '改了等于换包名，已安装用户无法增量升级、本地数据会丢。'
  )

  const strings = readFileSync('android/app/src/main/res/values/strings.xml', 'utf8')
  assert.match(strings, /name="package_name">com\.myrzg\.assistant</, 'package_name 也必须是原包名')
  assert.match(strings, /name="custom_url_scheme">com\.myrzg\.assistant</, 'custom_url_scheme 同理')
})
