/**
 * 招募素材一次性导入（从原始资源包 → public/images/gacha）。
 *
 * ⚠️ **不可整体重放**。`copy()` 是「目标已存在且字节不同就报错」的保护机制，这是刻意的：
 * 产物已经过后续加工（PNG→WebP、数值序列化格式归一），与源文件必然不同。
 * 例如 `elsa_rawcard.json` 源里写 `1.0E-5`、产物里是 `0.00001`，两者语义相同但字节不同，
 * 属历史既有差异（HEAD 里就是 `0.00001`），不是缺陷。
 *
 * 需要用时的正确做法：
 *   - 新增单个素材 → 单独调用对应代码段，或在 `copy()` 前先备份并删除目标
 *   - 全量重建 → 先 `git rm -r public/images/gacha` 再跑，事后逐项 review diff
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { atlasAtlas } from './maintenance-paths.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const DATA_ROOT = process.env.MYRZG_DATA_DIR || path.resolve(root, '../游戏数据')
const source = path.resolve(DATA_ROOT, '资源包/assets/res')
const target = path.join(root, 'public/images/gacha')
const manifest = []
function copy(from, to) {
  const bytes = fs.readFileSync(from)
  const output = path.join(target, to)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  if (fs.existsSync(output)) {
    if (!fs.readFileSync(output).equals(bytes)) throw new Error(`Existing asset differs from source; back it up before replacement: ${output}`)
  } else fs.writeFileSync(output, bytes)
  manifest.push({ file: to, source: path.relative(path.resolve(root, '..'), from).replaceAll('\\', '/'),
    bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}

/**
 * 复制 Spine atlas，并把里面的贴图文件名从 `.png` 改成 `.webp`。
 *
 * Spine 的 `.atlas` 是纯文本，区段里写着贴图文件名（如 `Npc_005.png`）。
 * 运行时贴图已被转成 `.webp`（仓库统一口径），而源资源包仍是 `.png`，
 * 直接把源 atlas 原样复制会出现「atlas 指向 .png、目录里只有 .webp」的错配，
 * Spine 加载时报找不到贴图。这里在复制后就地改写，使两者一致。
 *
 * 比较时**规范化行尾**：同一个 atlas 可能来自 CRLF 源、也可能被工具另存为 LF，
 * 逐字节比会把「内容相同、行尾不同」误判成冲突。
 */
const normalizeEol = (s) => s.replace(/\r\n/g, '\n')
function copyAtlas(from, to) {
  const text = fs.readFileSync(from, 'utf8')
  const fixed = text.replace(/^(\s*\S+\.)png(\s*)$/gm, '$1webp$2')
  const output = path.join(target, to)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  if (fs.existsSync(output)) {
    if (normalizeEol(fs.readFileSync(output, 'utf8')) !== normalizeEol(fixed)) {
      throw new Error(`Existing atlas differs from source; back it up before replacement: ${output}`)
    }
  } else fs.writeFileSync(output, fixed, 'utf8')
  manifest.push({ file: to, source: path.relative(path.resolve(root, '..'), from).replaceAll('\\', '/'),
    bytes: Buffer.byteLength(fixed), sha256: crypto.createHash('sha256').update(fixed).digest('hex'), atlasExtensions: 'png→webp' })
}
// 图集切图目录是扁平的（`图片资源/图集/<名>/`），里面还含 `_atlas.png` / `_atlas.json`
// 这两个非精灵文件，必须排除，否则会被当成素材复制进去并撞上已有文件。
const spritesOf = (atlasName) => {
  const a = atlasAtlas(atlasName)
  return fs.readdirSync(a.spriteDir)
    .filter((x) => x.endsWith('.png') && !x.startsWith('_') && !x.includes('#'))
    .map((x) => path.join(a.spriteDir, x))
}

for (const atlas of ['HeroPoolPanel', 'HeroGachaPanel']) {
  for (const file of spritesOf(`${atlas}_Atlas`)) {
    const name = path.basename(file)
    copy(file, name.startsWith('com_') ? `../Common_Atlas/${name}` : `ui/${name}`)
  }
}
for (const name of ['com_btn_N_sp', 'com_btn_Y_sp', 'com_btn_N_sp_press', 'com_btn_Y_sp_press', 'com_btn_close', 'com_btn_back', 'com_btn_mini', 'com_top_item']) {
  copy(path.join(atlasAtlas('Common_Atlas').spriteDir, `${name}.png`), `../Common_Atlas/${name}.png`)
}
copy(path.join(source, 'texture/gacha_cardbackground_main_output.png'), 'shop.png')
const revealDir = path.join(source, 'texture/uipanel/herogachashowpanel')
for (const file of fs.readdirSync(revealDir).filter(x => x.endsWith('.png') && !x.includes('#'))) copy(path.join(revealDir, file), `../uipanel/herogachashowpanel/${file}`)
const heroes = JSON.parse(fs.readFileSync(path.join(root, 'raw/hero/hero.json'))).datas
const talks = JSON.parse(fs.readFileSync(path.join(root, 'raw/hero/heroTalk.json'))).hero
const pools = JSON.parse(fs.readFileSync(path.join(root, 'public/data/parsed/gacha.json'))).pools
const presentation = {}
const imported = new Set()
for (const candidate of pools.filter(pool => pool.kind === 'hero').flatMap(pool => pool.tiers.flatMap(tier => tier.candidates))) {
  if (presentation[candidate.typeId]) continue
  const hero = heroes[candidate.typeId]
  copy(path.join(source, `texture/chara/l/${hero.img}.png`), `../chara/l/${hero.img}.png`)
  const fragment = `${hero.icon.replace('at', 'chara')}_p`
  copy(path.join(atlasAtlas('HeroInfoPanel_Atlas').spriteDir, `${fragment}.png`), `../HeroInfoPanel_Atlas/${fragment}.png`)
  const name = hero.viewData.skeletonName
  const dir = path.join(source, 'spine/model/npc', name.toLowerCase())
  const files = fs.readdirSync(dir)
  const atlasFile = files.find(file => file.toLowerCase() === `${name.toLowerCase()}.atlas`)
  const stem = atlasFile.slice(0, -6)
  const binary = files.some(file => file.toLowerCase() === `${stem.toLowerCase()}.skel`)
  if (!imported.has(name)) {
    copyAtlas(path.join(dir, atlasFile), `spine/heroes/${name}/${name}.atlas`)
    copy(path.join(dir, `${stem}.${binary ? 'skel' : 'asset'}`), `spine/heroes/${name}/${name}.${binary ? 'skel' : 'json'}`)
    for (const file of files.filter(file => file.endsWith('.png') && !file.includes('#'))) copy(path.join(dir, file), `spine/heroes/${name}/${file}`)
    imported.add(name)
  }
  // `hero.imgPos`（`"x_y"`，如 `10_-147`）是立绘锚点：源码 `HeroGachaShowPanelUI` 用
  // `hero.ImgPos.Split('_')` 解析后 + `general.gachaCharaOffset`（prefab 序列化为 (0,0)）
  // → `heroPic.localPosition`。产物不带上它，立绘就只能居中，逐角色会偏。
  const [imgPosX, imgPosY] = String(hero.imgPos ?? '').split('_').map(Number)
  // 🔴 产出路径一律写 `.webp`：仓库运行时图片已统一转成 WebP（见 2026-09-18 日报），
  // 这里若写 `.png`，`gacha-presentation.json` 会指到不存在的文件，招募页立绘/碎片全 404。
  // 源图仍是 `.png`，转换由 convert-* / compress-images 系列脚本完成，本脚本只负责导入原图。
  presentation[candidate.typeId] = { name, binary, skin: hero.viewData.skinName, job: hero.job, element: hero.element,
    idle: hero.viewData.idle_Front_AnimName || 'idle_front', card: `/images/HeroGachaShowPanel_Atlas/gacha_${hero.icon}.webp`,
    portrait: `/images/chara/l/${hero.img}.webp`, fragment: `/images/HeroInfoPanel_Atlas/${fragment}.webp`, dialogue: talks[candidate.typeId]?.gacha?.[0] || '',
    imgPos: Number.isFinite(imgPosX) && Number.isFinite(imgPosY) ? { x: imgPosX, y: imgPosY } : null }
}
const pets = JSON.parse(fs.readFileSync(path.join(root, 'raw/pet/pet.json'))).datas
for (const candidate of pools.filter(pool => pool.kind === 'pet').flatMap(pool => pool.tiers.flatMap(tier => tier.candidates))) {
  if (presentation[candidate.typeId]) continue
  const pet = pets[candidate.typeId]
  copy(path.join(source, `texture/pet/eggs/${pet.eggImg}.png`), `../eggs/${pet.eggImg}.png`)
  // 同上：引用路径写 `.webp`（产物已转格式），源图仍按 `.png` 导入。
  presentation[candidate.typeId] = { name: pet.name, egg: `/images/eggs/${pet.eggImg}.webp` }
}
fs.writeFileSync(path.join(root, 'public/data/parsed/gacha-presentation.json'), JSON.stringify(presentation))
for (const name of ['elsa_rawcard', 'elsa_rawcard_desk']) {
  const dir = path.join(source, `spine/perform/perfprm_elsa/${name}`)
  for (const ext of ['asset', 'atlas', 'png']) {
    const to = `spine/${name}.${ext === 'asset' ? 'json' : ext}`
    if (ext === 'atlas') copyAtlas(path.join(dir, `${name}.${ext}`), to)
    else copy(path.join(dir, `${name}.${ext}`), to)
  }
  if (name === 'elsa_rawcard_desk') copy(path.join(dir, 'elsa_rawcard_desk_2.png'), 'spine/elsa_rawcard_desk_2.png')
}
for (const ext of ['skel', 'atlas', 'png']) {
  const from = path.join(source, `spine/perform/perform_bag/perform_bag.${ext}`)
  if (ext === 'atlas') copyAtlas(from, 'spine/perform_bag.atlas')
  else copy(from, `spine/perform_bag.${ext}`)
}
for (const name of ['gacha_ready_chara', 'gacha_show_chara', 'gacha_ready_egg', 'gacha_show_egg', 'gacha_shop']) {
  copy(path.join(source, `audio/bgm/${name}.wav`), `audio/${name}.wav`)
}
// 音效：按源码实际播放的 id 取（`HeroGachaAniPanel` / `HeroGachaShowPanelUI` / `HeroShowUI` /
// `PetGachaAniPanel` / `GetRewardTip`）：card(结果卡逐张) / card2,card9(星级) / card3(翻卡起手) /
// card7,card8(翻卡普通|稀有) / card10,card12(跳段) / card11(蛋袋) / get3(补播5星) /
// get5(出蛋) / getcard / itemGet(结算逐格) / shining1(tail_tip)。
for (const name of [
  'card', 'card2', 'card3', 'card7', 'card8', 'card9', 'card10', 'card12',
  'card11', 'get3', 'get5', 'getcard', 'itemGet', 'shining1'
]) copy(path.join(source, `audio/effect/ui/${name}.wav`), `audio/${name}.wav`)
copy(path.join(root, 'node_modules/@esotericsoftware/spine-webgl/LICENSE'), 'SPINE-LICENSE.txt')
fs.writeFileSync(path.join(target, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Imported ${manifest.length} original files, ${(manifest.reduce((n, x) => n + x.bytes, 0) / 1048576).toFixed(1)} MiB; no image recompression.`)

// 音频：原始资源包给的是 1411 kbps 未压缩 WAV（19 支 66.45 MB）。导入后立即转 Opus
// （容器为 MP4 —— WebKit/Safari 放不出 Ogg/WebM 里的 Opus，见 convert-audio-opus.mjs 文件头），
// BGM 96k / 音效 64k，共 4.81 MB。否则这个脚本会把 66 MB WAV 重新带回仓库，
// 和 `src/utils/gachaAudio.js` 期望的 `.mp4` 对不上。`--delete-source` 保留仓库里只有 .mp4。
// 单独转码脚本另有独立入口：`node scripts/dev/convert-audio-opus.mjs`。
if (!process.argv.includes('--no-audio-opus')) {
  execFileSync(process.execPath, [path.join(root, 'scripts/dev/convert-audio-opus.mjs'), '--apply', '--delete-source'], { stdio: 'inherit' })
}
