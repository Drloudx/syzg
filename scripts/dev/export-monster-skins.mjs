import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SRC_MON = 'E:/Desktop/html/myrzg/游戏数据/资源包/assets/res/spine/model/mon'
const SRC_NPC = 'E:/Desktop/html/myrzg/游戏数据/资源包/assets/res/spine/model/npc'
const OUT_DIR = 'public/images/model-previews'
const BUNDLE = fs.readFileSync('scratch/spine-web/spine.iife.js', 'utf8')

// 读取 mon.json 提取所有 (skeletonName, skinName)
const monRaw = JSON.parse(fs.readFileSync('E:/Desktop/html/myrzg/游戏数据/配置表/mon.json', 'utf8'))

const targets = new Map()

for (const [id, m] of Object.entries(monRaw.datas)) {
  const skel = m.viewData?.skeletonName
  if (!skel) continue
  const skin = m.viewData?.skinName || 'default'

  // 输出文件名规范：
  // 1. 特殊皮肤或指定骨骼：${skel.toLowerCase().replace('/', '_')}__${skin.toLowerCase().replace('/', '_')}.webp
  // 2. 如果是 default / normal，同时输出基础文件名：${skel.toLowerCase().replace('/', '_')}.webp
  // 3. 同时支持按怪物 typeId 输出别名：${id.toLowerCase()}.webp，以便精准直击！
  const normSkel = skel.toLowerCase().replace('/', '_')
  const normSkin = skin.toLowerCase().replace('/', '_')

  const key = `${skel}:::${skin}`
  if (!targets.has(key)) {
    targets.set(key, { skel, skin, normSkel, normSkin, ids: [] })
  }
  targets.get(key).ids.push(id.toLowerCase())
}

console.log(`Unique targets to render: ${targets.size}`)

async function renderAll() {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 2 })

  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
  <canvas id="c" width="768" height="768"></canvas></body></html>`)
  await page.addScriptTag({ content: BUNDLE })

  let count = 0

  for (const item of targets.values()) {
    count++
    const { skel, skin, normSkel, normSkin, ids } = item

    // 定位资源目录
    let dir = path.join(SRC_MON, normSkel)
    if (!fs.existsSync(dir)) {
      dir = path.join(SRC_MON, skel)
    }
    if (!fs.existsSync(dir)) {
      dir = path.join(SRC_NPC, normSkel.replace('npc_', ''))
    }
    if (!fs.existsSync(dir)) {
      dir = path.join(SRC_NPC, skel.replace('Npc/', ''))
    }

    if (!fs.existsSync(dir)) {
      console.warn(`[${count}/${targets.size}] Dir not found for ${skel}`)
      continue
    }

    const files = fs.readdirSync(dir)
    const atlasFile = files.find(f => f.endsWith('.atlas'))
    if (!atlasFile) continue

    const atlasText = fs.readFileSync(path.join(dir, atlasFile), 'utf8')
    const targetPngName = atlasText.split('\n')[0].trim()
    let pngFile = files.find(f => f.toLowerCase() === targetPngName.toLowerCase()) || files.find(f => f.endsWith('.png') && !f.includes('#'))
    const skelFile = files.find(f => f.endsWith('.skel'))
    const jsonFile = files.find(f => f.endsWith('_SkeletonData.json') || (f.endsWith('.json') && !f.includes('Atlas')))

    if ((!skelFile && !jsonFile) || !pngFile) continue

    const skelB64 = skelFile ? fs.readFileSync(path.join(dir, skelFile)).toString('base64') : null
    const jsonText = !skelFile && jsonFile ? fs.readFileSync(path.join(dir, jsonFile), 'utf8') : null
    const pngB64 = fs.readFileSync(path.join(dir, pngFile)).toString('base64')

    const res = await page.evaluate(async ({ atlasText, skelB64, jsonText, pngB64, skinName }) => {
      try {
        const S = window.SPINE
        const img = new Image()
        img.src = `data:image/png;base64,${pngB64}`
        await img.decode()

        const atlas = new S.TextureAtlas(atlasText)
        for (const p of atlas.pages) {
          p.texture = new S.CanvasTexture(img)
          p.rendererObject = p.texture
        }

        const attachmentLoader = new S.AtlasAttachmentLoader(atlas)
        let data
        if (skelB64) {
          const bin = Uint8Array.from(atob(skelB64), c => c.charCodeAt(0)).buffer
          data = new S.SkeletonBinary(attachmentLoader).readSkeletonData(new DataView(bin))
        } else {
          data = new S.SkeletonJson(attachmentLoader).readSkeletonData(jsonText)
        }

        const sk = new S.Skeleton(data)
        const skins = data.skins || []
        
        // 查找目标皮肤
        let targetSkin = skins.find(s => s.name === skinName || s.name.toLowerCase() === skinName.toLowerCase())
        if (!targetSkin && skinName !== 'default') {
          // 模糊匹配，如 'Npc/a01' 匹配 'a01'
          targetSkin = skins.find(s => s.name.endsWith(skinName) || skinName.endsWith(s.name))
        }
        if (!targetSkin) {
          targetSkin = skins.find(s => s.name === 'default' || s.name === 'nomal') || skins[0]
        }

        if (targetSkin) sk.setSkin(targetSkin)
        sk.setToSetupPose()
        sk.updateWorldTransform()

        const offset = new S.Vector2()
        const size = new S.Vector2()
        sk.getBounds(offset, size, [])

        if (!size.x || !size.y) return null

        const canvas = document.getElementById('c')
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const pad = 20
        const scale = Math.min((canvas.width - pad * 2) / size.x, (canvas.height - pad * 2) / size.y)

        ctx.save()
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.scale(scale, -scale)
        ctx.translate(-(offset.x + size.x / 2), -(offset.y + size.y / 2))
        const renderer = new S.SkeletonRenderer(ctx)
        renderer.premultipliedAlpha = false
        renderer.triangleRendering = true
        renderer.draw(sk)
        ctx.restore()

        const w = canvas.width
        const h = canvas.height
        const d = ctx.getImageData(0, 0, w, h).data
        let minX = w; let minY = h; let maxX = 0; let maxY = 0
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (d[(y * w + x) * 4 + 3] > 10) {
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }

        if (maxX <= minX || maxY <= minY) return null

        const cropW = maxX - minX + 1
        const cropH = maxY - minY + 1
        const offCanvas = document.createElement('canvas')
        offCanvas.width = cropW
        offCanvas.height = cropH
        const offCtx = offCanvas.getContext('2d')
        offCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH)

        return { pngB64: offCanvas.toDataURL('image/png').split(',')[1] }
      } catch (err) {
        return { error: err.message }
      }
    }, { atlasText, skelB64, jsonText, pngB64, skinName: skin })

    if (res?.pngB64) {
      const buf = Buffer.from(res.pngB64, 'base64')

      // 保存带有皮肤的名字
      const skinOut = path.join(OUT_DIR, `${normSkel}__${normSkin}.webp`)
      await sharp(buf).webp({ quality: 90 }).toFile(skinOut)

      // 保存默认骨骼名（若尚未存在）
      const defaultOut = path.join(OUT_DIR, `${normSkel}.webp`)
      if (!fs.existsSync(defaultOut)) {
        await sharp(buf).webp({ quality: 90 }).toFile(defaultOut)
      }

      // 保存怪物 ID 直通名！
      for (const monId of ids) {
        const idOut = path.join(OUT_DIR, `mon_${monId}.webp`)
        if (!fs.existsSync(idOut)) {
          await sharp(buf).webp({ quality: 90 }).toFile(idOut)
        }
      }

      console.log(`[${count}/${targets.size}] OK: ${skel} (${skin}) -> ${skinOut}`)
    } else {
      console.warn(`[${count}/${targets.size}] Fail: ${skel} (${skin})`, res?.error || 'empty')
    }
  }

  await browser.close()
  console.log('Done rendering all monster skins!')
}

renderAll().catch(console.error)
