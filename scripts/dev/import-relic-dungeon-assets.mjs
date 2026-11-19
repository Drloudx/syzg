/**
 * 导入活动副本（秘境）素材到 public/images/relic-dungeons 与导航图标。
 *
 * 源：游戏数据/图片资源/单图/（通过 maintenance-paths.mjs 的 dataRoot 定位）
 * 目标：public/images/relic-dungeons/*.webp、public/ui/item_20035.webp
 *
 * 只导入当前已开放秘境（由 raw/activityList.json 判定）实际引用的层级门扉、房间与事件插画，
 * 避免未开放秘境的图进入产物或被 audit:images:usage 判为未引用。
 * 默认只预览，加 --apply 写入。
 *
 * 用法：
 *   node scripts/dev/import-relic-dungeon-assets.mjs
 *   node scripts/dev/import-relic-dungeon-assets.mjs --apply
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { dataRoot, rawRoot, projectRoot } from './maintenance-paths.mjs'

const apply = process.argv.includes('--apply')
const singleRoot = join(dataRoot, '图片资源/单图')
const targetDir = join(projectRoot, 'public/images/relic-dungeons')
const navSrcIcon = join(projectRoot, 'public/images/Common_ItemIcon/item_20035.webp')
const navDstIcon = join(projectRoot, 'public/ui/item_20035.webp')

const readRaw = name => JSON.parse(readFileSync(join(rawRoot, name), 'utf8'))

function isDungeonOpen(activity) {
  if (!activity) return true
  if (activity.condition === 'false') return false
  if (activity.startTime && activity.startTime === activity.endTime) return false
  const year = Number(String(activity.startTime || '').slice(0, 4))
  return !(Number.isFinite(year) && year >= 2900)
}

function indexSinglePngs(dir, map = new Map()) {
  if (!existsSync(dir)) return map
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      indexSinglePngs(full, map)
    } else if (/\.png$/i.test(entry.name)) {
      const stem = entry.name.replace(/\.png$/i, '')
      if (!map.has(stem)) map.set(stem, full)
    }
  }
  return map
}

function collectReferencedNames() {
  const info = readRaw('relicDungeonInfo.json')?.datas || {}
  const events = readRaw('relicDungeonEvents.json')?.datas || {}
  const activities = readRaw('activityList.json')?.datas || {}
  const names = new Set()

  for (const [id, dungeon] of Object.entries(info)) {
    if (!isDungeonOpen(activities[id])) continue
    if (dungeon.bgImg) names.add(dungeon.bgImg)
    for (const layer of dungeon.layers || []) {
      if (layer.layerImg) names.add(layer.layerImg)
      for (const rr of layer.randomRooms || []) {
        for (const evId of rr.events || []) {
          const ev = events[evId]
          if (!ev) continue
          for (const node of Object.values(ev.nodes || {})) {
            if (node?.image) names.add(node.image)
          }
        }
      }
    }
    for (const pool of Object.values(dungeon.rooms || {})) {
      for (const roomRef of pool || []) {
        if (roomRef?.img) names.add(roomRef.img)
      }
    }
  }
  return [...names].sort()
}

async function main() {
  const pngIndex = indexSinglePngs(join(singleRoot, 'texture'))
  indexSinglePngs(join(singleRoot, '根目录'), pngIndex)

  const referenced = collectReferencedNames()
  const missing = referenced.filter(name => !pngIndex.has(name))
  const found = referenced.filter(name => pngIndex.has(name))

  console.log(`[import-relic-dungeon-assets] 引用 ${referenced.length} 项，命中 ${found.length} 项，缺失 ${missing.length} 项`)
  if (missing.length) console.log('  未在单图目录找到（页面将自动隐藏/回退）：', missing)

  if (!apply) {
    console.log('预览模式，未写入文件。追加 --apply 执行导入。')
    return
  }

  mkdirSync(targetDir, { recursive: true })
  let totalBytes = 0
  for (const name of found) {
    const src = pngIndex.get(name)
    const dst = join(targetDir, `${name}.webp`)
    const isBg = /dungeonBg/i.test(name)
    let pipe = sharp(src)
    if (isBg) {
      pipe = pipe.resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 82, effort: 5 })
    } else {
      pipe = pipe.webp({ quality: 88, effort: 5 })
    }
    const buf = await pipe.toBuffer()
    await sharp(buf).toFile(dst)
    totalBytes += buf.length
    console.log(`  写入 ${name}.webp (${(buf.length / 1024).toFixed(1)} KB)`)
  }

  if (existsSync(navSrcIcon)) {
    copyFileSync(navSrcIcon, navDstIcon)
    console.log('  同步导航图标 public/ui/item_20035.webp')
  }

  console.log(`完成，共输出 ${found.length} 张 WebP（合计 ${(totalBytes / 1024).toFixed(1)} KB）。`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
