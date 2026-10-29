/**
 * 生成配队模拟器的**精简数据表** `public/data/parsed/sims.json`。
 *
 * 为什么需要它：
 *   页面原本在运行时读 `heroes.json`(2.0 MB) + `pets.json`(140 KB) 再提取，
 *   实测提取本身只要 4.9ms（不卡顿），但**首次要下载 2.1 MB** —— 手机端代价明显。
 *   预处理后这份产物只有约 10 KB，比原方案小约 170 倍。
 *
 * 数据来源（都是构建期已有的产物，不碰原表）：
 *   public/data/parsed/heroes.json
 *   public/data/parsed/pets.json
 *
 * 与运行时提取保持同一套口径：
 *   - 角色只留 id/name/job/jobName/element/elementName/img/rare
 *   - 魔物只取 `skills[3]`（= 配置表的 skill2 = 队伍被动），不取 trait
 *   - 队伍被动的限定条件从**中文描述**解析（`skillTrigger.json` 的 limitJob /
 *     limitElement 没有进前端产物，解析结果已与源码逐条核对过）
 *
 * 幂等：同样的输入产出同样的文件；`--check` 只比对不写入。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toHeroRecord, toPetRecord } from '../../src/utils/simsData.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const parsedDir = join(root, 'public/data/parsed')
const OUT = join(parsedDir, 'sims.json')
const CHECK = process.argv.includes('--check')

function readJson(name) {
  const file = join(parsedDir, name)
  if (!existsSync(file)) {
    throw new Error(`缺少输入文件：${file}（先跑 npm run data:build）`)
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

const heroData = readJson('heroes.json')
const petData = readJson('pets.json')

const heroes = (heroData.heroes || heroData.list || []).map(toHeroRecord)
const pets = (petData.pets || petData.list || []).map(toPetRecord)

/*
 * 🔴 **不要排序**。
 *
 * heroes.json 里的顺序本身就是「按稀有度降序、组内按内部次序」，角色图鉴 `/heroes`
 * 直接沿用这个顺序（HeroesView 的 filteredHeroes 不排序）。
 *
 * 早先这里按 id 排过序，导致配队模拟选人弹窗的顺序与角色图鉴**完全对不上**：
 *   图鉴开头 = 奇瓦 / 阿娜洛洁 / 菲莉娜 / 米拉贝尔 …
 *   弹窗开头 = 希尔 / 茜塔 / 拉碧丝 / 夏库塔拉 …
 * 保序本身就是幂等的（同样的输入必然产出同样的数组），不需要额外排序来「稳定」。
 */

const payload = {
  // 记录生成来源，便于排查「页面数据和图鉴对不上」类问题
  _meta: {
    source: ['data/parsed/heroes.json', 'data/parsed/pets.json'],
    heroCount: heroes.length,
    petCount: pets.length,
    note: '配队模拟器专用精简表；由 scripts/dev/build-sims-data.mjs 生成，勿手改',
  },
  heroes,
  pets,
}

const text = JSON.stringify(payload)
const pretty = `${JSON.stringify(payload, null, 2)}\n`

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error('❌ sims.json 不存在，请跑 npm run data:sims')
    process.exit(1)
  }
  const current = readFileSync(OUT, 'utf8')
  if (current !== pretty) {
    console.error('❌ sims.json 与当前数据不一致（heroes/pets 变了），请重新生成')
    process.exit(1)
  }
  console.log('✅ sims.json 与源数据一致')
  process.exit(0)
}

writeFileSync(OUT, pretty, 'utf8')

const kb = (Buffer.byteLength(text) / 1024).toFixed(1)
console.log(`✅ 已生成 public/data/parsed/sims.json`)
console.log(`   ${heroes.length} 角色 / ${pets.length} 魔物  → ${kb} KB`)
