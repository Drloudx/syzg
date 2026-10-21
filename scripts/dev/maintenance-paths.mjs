import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * 游戏数据总目录（唯一数据源入口）。
 *
 * 结构见 `游戏数据/README.md`：
 *   - 配置表/        143 张明文 JSON（顶层 = APK 首包版）
 *   - 剧情/          APK 版 + CDN 独有剧本
 *   - 源码/          反编译 C#（游戏行为的唯一判据）
 *   - 图片资源/图集/  59 个图集，**扁平切图 + `_atlas.json`（键 `sprites`）+ `_atlas.png`**
 *   - 图片资源/单图/  按包路径分组的散图（纹理/立绘/特效）
 *   - 资源包/        真实目录（原 `4.24路资源包`，立绘/模型/音效/特效/UI 原图）
 *   - APK解包/       真实目录（原 `game.taptap.tqpmyrzg`，含 AssetBundle 原包）
 *   - 工具/          拉取、提取、审计脚本
 *   - 报告/          审计与普查产物
 *
 * 2026-10-19 收敛：`资源包-4.24包` 与 `UI图集源` 两个冗余 junction 已移除；
 * `资源包` / `APK解包` 由 junction 改为**真实目录**。
 * 2026-10-20 清场：同级 `Config_decrypted` / `GAoNano_decrypted` / `UI_Atlases` / `4.24包`
 * 已删除（独有内容先归档到 `游戏数据/_迁入归档/`），本文件不再有旧路径回退。
 */
export const dataRoot = resolve(process.env.MYRZG_DATA_DIR || join(projectRoot, '../游戏数据'))

export const rawRoot = join(projectRoot, 'raw')
export const publicDataRoot = join(projectRoot, 'public/data')

/**
 * 兼容旧环境变量：`MYRZG_CONFIG_DIR` 等仍可覆盖。
 * 未设置时一律取 游戏数据 下的对应子目录。
 *
 * 🔴 2026-10-20 起**不再回退到项目同级的旧目录**：`Config_decrypted` / `GAoNano_decrypted` /
 * `UI_Atlases` / `4.24包` 已全部迁入 `游戏数据/` 并删除，回退目标不存在。
 * 子目录缺失时直接抛错，避免脚本拿着不存在的路径跑出「0 条」的假结果。
 */
function pick(envName, dataChild) {
  const fromEnv = process.env[envName]
  if (fromEnv) return resolve(fromEnv)
  return join(dataRoot, dataChild)
}

export const configRoot = pick('MYRZG_CONFIG_DIR', '配置表')
export const dialogRoot = pick('MYRZG_DIALOG_DIR', '剧情')
export const gameSourceRoot = pick('MYRZG_SOURCE_DIR', '源码')
export const atlasRoot = pick('MYRZG_ATLAS_DIR', '图片资源/图集')
export const bundleRoot = pick('MYRZG_BUNDLE_DIR', '资源包')

/**
 * 图集查表：统一入口。现行布局是
 * `图片资源/图集/<名>/` = 扁平 `<精灵名>.png` + `_atlas.json`（键 `sprites`）+ `_atlas.png`。
 *
 * 仍接受 `sprites/` + `mSprites` 这种旧键名（`_atlas.json` 里若出现也能读），
 * 但**不再去同级 `UI_Atlases/` 找** —— 该目录已于 2026-10-20 删除。
 *
 * 用法：`const a = atlasAtlas('CombatPanel_Atlas')`，再用 `a.spriteDir` / `a.rects` 等。
 */
export function atlasAtlas(name) {
  const dir = join(atlasRoot, name)
  const jsonPath = join(dir, '_atlas.json')
  const pngPath = join(dir, '_atlas.png')
  const spriteDir = existsSync(join(dir, 'sprites')) ? join(dir, 'sprites') : dir
  if (!existsSync(jsonPath)) throw new Error(`图集元数据缺失: ${jsonPath}`)
  const meta = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const list = meta.sprites || meta.mSprites || []
  return {
    dir,
    spriteDir,
    atlasPng: pngPath,
    metas: list,
    /** 精灵名 → 矩形（x/y/width/height） */
    rects: new Map(list.map((s) => [s.name, s])),
  }
}

export const imageBackupRoot = resolve(process.env.MYRZG_IMAGE_BACKUP_DIR || join(projectRoot, '../vue-myrzg备份-资源/images'))
/**
 * 项目级备份根（`../vue-myrzg备份-资源/`，里面按 images / fonts / ui / data 分子目录）。
 * SPEC 六章约定的原图备份位置；非图片类产物（如剧情 JSON）瘦身前也备份到这里。
 */
export const backupRoot = resolve(process.env.MYRZG_BACKUP_DIR || join(projectRoot, '../vue-myrzg备份-资源'))

export function resolveChild(root, child) {
  const result = resolve(root, child)
  const difference = relative(resolve(root), result)
  if (!difference || difference === '..' || difference.startsWith(`..${sep}`) || isAbsolute(difference)) {
    throw new Error(`Path must be inside ${root}: ${child}`)
  }
  return result
}
