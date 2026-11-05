/**
 * 数据源计数 —— 只读。给 START_PROMPT 的基线刷新用。
 *
 * 为什么要这个脚本：数量以实测为准，人工口述会漂。
 * 所有路径均由 maintenance-paths.mjs 提供，不在此手拼目录。
 *
 * 用法：
 *   node scripts/dev/count-data-sources.mjs
 *   node scripts/dev/count-data-sources.mjs --json
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  configRoot, dialogRoot, gameSourceRoot, atlasRoot, bundleRoot,
  rawRoot, publicDataRoot
} from './maintenance-paths.mjs'

/** 配置表顶层里不是业务表的工具元数据。 */
const CONFIG_META = new Set(['_manifest.json', '_state.json', '_来源.json'])

/** 剧情里非正式副本的命名特征；命中即不计入净数。 */
const DIALOG_NONFORMAL = /备份|弃用|复制|空剧本|copy|bak/i

function walk(dir) {
  const r = { dirs: 0, files: 0, json: 0, cs: 0, png: 0, webp: 0, other: 0 }
  if (!fs.existsSync(dir)) return { missing: true, ...r }
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, e.name)
      if (e.isDirectory()) { r.dirs++; stack.push(p); continue }
      r.files++
      if (e.name.endsWith('.json')) r.json++
      else if (e.name.endsWith('.cs')) r.cs++
      else if (e.name.endsWith('.png')) r.png++
      else if (e.name.endsWith('.webp')) r.webp++
      else r.other++
    }
  }
  return r
}

const topFiles = (dir, ext) => fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith(ext)).map(e => e.name)
  : []

/**
 * 图集计数：主图按 `<图集名>_atlas.png` 精确匹配，
 * 不用 endsWith('_atlas.png') —— BuildPanel_Atlas/build_btn_atlas.png 会被误计。
 */
function atlasStats(root) {
  const out = { dirs: 0, slices: 0, atlasPng: 0, atlasJson: 0, anomalies: [] }
  if (!fs.existsSync(root)) return out
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory())
  out.dirs = dirs.length
  for (const d of dirs) {
    const names = fs.readdirSync(path.join(root, d.name))
    const mainPng = names.filter(n => n === '_atlas.png' || n === `${d.name}_atlas.png`)
    out.atlasJson += names.filter(n => n.endsWith('_atlas.json')).length
    // 切图要排除的是主图本身，不是所有以 _atlas.png 结尾的文件：
    // BuildPanel_Atlas/build_btn_atlas.png 名字撞尾但确实是切图。
    out.slices += names.filter(n => /\.(png|webp)$/i.test(n) && !mainPng.includes(n)).length
    out.atlasPng += mainPng.length
    if (mainPng.length !== 1) out.anomalies.push(`${d.name}: 主图 ${mainPng.length} 个 -> ${mainPng.join(' | ') || '无'}`)
  }
  return out
}

const cfgTop = topFiles(configRoot, '.json')
const cfgBusiness = cfgTop.filter(n => !CONFIG_META.has(n))
const rawTop = topFiles(rawRoot, '.json')
const dlgTop = topFiles(dialogRoot, '.json')
const dlgNonformal = dlgTop.filter(n => DIALOG_NONFORMAL.test(n))
const cdnCfg = topFiles(path.join(configRoot, '_CDN新版'), '.json')
const cdnDlg = topFiles(path.join(dialogRoot, '_CDN新版'), '.json')
const atl = atlasStats(atlasRoot)

const report = {
  核对时间: new Date().toISOString().slice(0, 10),
  配置表: {
    顶层json: cfgTop.length,
    工具元数据: cfgTop.filter(n => CONFIG_META.has(n)).length,
    业务表: cfgBusiness.length,
    CDN新版: cdnCfg.length,
    目录: walk(configRoot),
  },
  剧情: {
    顶层json: dlgTop.length,
    非正式副本: dlgNonformal.length,
    净数: dlgTop.length - dlgNonformal.length,
    CDN新版: cdnDlg.length,
    目录: walk(dialogRoot),
  },
  源码: walk(gameSourceRoot),
  图集: { 目录: atl.dirs, 切图: atl.slices, atlas主图: atl.atlasPng, atlas清单: atl.atlasJson, 异常: atl.anomalies, 全量: walk(atlasRoot) },
  资源包: walk(bundleRoot),
  raw: { 顶层json: rawTop.length, 目录: walk(rawRoot) },
  'public/data': { parsed: topFiles(path.join(publicDataRoot, 'parsed'), '.json').length, 目录: walk(publicDataRoot) },
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const line = (label, s) => `${label.padEnd(10)} dirs=${String(s.dirs).padStart(4)} files=${String(s.files).padStart(6)} json=${String(s.json).padStart(5)} cs=${String(s.cs).padStart(4)} png=${String(s.png).padStart(5)} webp=${String(s.webp).padStart(4)}`
  console.log(`核对时间 ${report.核对时间}\n`)
  console.log(`配置表     顶层 ${report.配置表.顶层json} = 业务表 ${report.配置表.业务表} + 元数据 ${report.配置表.工具元数据}｜_CDN新版 ${report.配置表.CDN新版}`)
  console.log(`剧情       顶层 ${report.剧情.顶层json}｜非正式副本 ${report.剧情.非正式副本}｜净 ${report.剧情.净数}｜_CDN新版 ${report.剧情.CDN新版}`)
  console.log(`图集       ${report.图集.目录} 目录｜切图 ${report.图集.切图}｜_atlas.png ${report.图集.atlas主图}｜_atlas.json ${report.图集.atlas清单}`)
  if (report.图集.异常.length) report.图集.异常.forEach(a => console.log(`  ⚠ ${a}`))
  console.log(`raw        顶层 ${report.raw.顶层json}`)
  console.log(`parsed     ${report['public/data'].parsed} 个 json`)
  console.log('')
  for (const [k, s] of [['配置表', report.配置表.目录], ['剧情', report.剧情.目录], ['源码', report.源码], ['图集', report.图集.全量], ['资源包', report.资源包], ['raw', report.raw.目录], ['public', report['public/data'].目录]]) {
    console.log(line(k, s))
  }
}
