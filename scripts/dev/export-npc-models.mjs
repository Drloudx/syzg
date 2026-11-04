import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SRC_ROOT = 'E:/Desktop/html/myrzg/游戏数据/资源包/assets/res/spine/model/npc'
const OUT_DIR = 'public/images/model-previews'
const BUNDLE = fs.readFileSync('scratch/spine-web/spine.iife.js', 'utf8')

async function exportNpcList(targetDirs) {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 2 })

  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
  <canvas id="c" width="768" height="768"></canvas></body></html>`)
  await page.addScriptTag({ content: BUNDLE })

  for (const dirName of targetDirs) {
    const dir = path.join(SRC_ROOT, dirName)
    if (!fs.existsSync(dir)) continue
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

    const res = await page.evaluate(async ({ atlasText, skelB64, jsonText, pngB64 }) => {
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
        const defaultSkin = skins.find(s => s.name === 'default' || s.name === 'nomal') || skins[0]
        if (defaultSkin) sk.setSkin(defaultSkin)
        sk.setToSetupPose()
        sk.updateWorldTransform()

        const offset = new S.Vector2()
        const size = new S.Vector2()
        sk.getBounds(offset, size, [])

        const canvas = document.getElementById('c')
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const pad = 20
        const scale = Math.min((canvas.width - pad * 2) / (size.x || 1), (canvas.height - pad * 2) / (size.y || 1))

        ctx.save()
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.scale(scale, -scale)
        ctx.translate(-(offset.x + (size.x || 1) / 2), -(offset.y + (size.y || 1) / 2))
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
    }, { atlasText, skelB64, jsonText, pngB64 })

    if (res?.pngB64) {
      const buf = Buffer.from(res.pngB64, 'base64')
      const outPath = path.join(OUT_DIR, `${dirName.toLowerCase().replace('/', '_')}.webp`)
      await sharp(buf).webp({ quality: 90 }).toFile(outPath)
      console.log(`Saved NPC model -> ${outPath}`)
    }
  }

  await browser.close()
}

exportNpcList(['npc_cart02', 'npc_022', 'npc_005', 'npc_015', 'npc_019', 'npc_023', 'npc_041', 'npc_045', 'npc_050', 'npc_064']).catch(console.error)
