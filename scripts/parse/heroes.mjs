/**
 * 角色图鉴预解析：public/data/parsed/heroes.json
 * 对应浏览器端 src/utils/heroParser.js 的 buildHeroData（同一纯函数）
 * 依赖 items/heroBuilder 共用物品表（由 index.mjs 传入）
 */
import { buildHeroData } from '../../src/utils/heroParser.js'
import { readJson } from './shared.mjs'
import { loadSkinModelImages } from './skin-models.mjs'

export function buildHeroesFile(itemData) {
  const rawMaps = {
    heroRes: readJson('hero/hero.json'),
    archivesRes: readJson('hero/heroArchives.json'),
    behaviorRes: readJson('hero/heroBehavior.json'),
    levelRes: readJson('hero/heroLevel.json'),
    playerLevelRes: readJson('playerLevel.json'),
    mailRes: readJson('hero/heroMail.json'),
    rankRes: readJson('hero/heroRank.json'),
    skillUpgradeRes: readJson('hero/heroSkillUpgrade.json'),
    talkRes: readJson('hero/heroTalk.json'),
    starRes: readJson('hero/heroStar.json'),
    consumeRes: readJson('consume.json'),
    skillRes: readJson('skill.json'),
    skillTriggerRes: readJson('skillTrigger.json'),
    taskRes: readJson('task.json'),
    dialogSegmentsRes: readJson('parsed/dialogSegments.json'),
    dialogIndexRes: readJson('parsed/dialogIndex.json'),
    generalRes: readJson('general.json'),
    buffRes: readJson('buff.json'),
    skinRes: readJson('skin.json'),
    // 召唤物基础属性（技能的 summonData.monTypeId → mon.json 的 unitData）
    monRes: readJson('mon.json')
  }
  const data = buildHeroData({
    ...rawMaps,
    skinModelImages: loadSkinModelImages(rawMaps.skinRes),
    items: itemData.items,
    lanDict: itemData.lanDict,
    rewards: itemData.rewards
  })

  /*
   * 额外产出「首页角色摘要」`parsed/hero-summary.json`。
   *
   * ## 为什么需要
   *
   * 首页「契约者展示」只用到 6 个字段（id/name/rare/job/jobName/element/elementName），
   * 却要下载整份 `heroes.json`（1959 KB，其中 1669 KB 是 hero 的技能/成长/天赋）。
   * 首屏白下 1.9 MB，手机上要好几秒 —— 这是首页慢的主因。
   *
   * ## 为什么是「拆字段」而不是「拆角色」
   *
   * 只抽字段、**保留全部 34 个角色**：后台 `home_heroes` 表可以换成任意角色，
   * 首页仍能查到。若预先只导出当前那 4 个，后台改设置就会失效。
   *
   * ## 不影响 /heroes
   *
   * `heroes.json` 本身原样输出，一个字节都不动；`/heroes`、`/sims`、`/gacha`
   * 继续读它。这里只是「多产出一个文件」。
   */
  const heroes = Array.isArray(data?.heroes) ? data.heroes : []
  const summary = {
    // 与 heroes.json 同源的构建标识，便于确认两份文件是否同一批次
    schemaVersion: 1,
    heroes: heroes.map(h => ({
      id: h.id,
      name: h.name,
      rare: h.rare,
      job: h.job,
      jobName: h.jobName,
      element: h.element,
      elementName: h.elementName
    }))
  }

  /*
   * 🔴 同时给出 `data` 与 `files`。
   *
   * `data` 是既有契约：`index.mjs` 与多处单测（partner-mails.test.mjs）都读
   * `buildHeroesFile(...).data.heroes`。改成只返回 `files` 会让它们全挂
   * （实测 3 条单测失败）。`files` 只是给写盘用的多文件形态。
   */
  return {
    data,
    files: [
      { file: 'parsed/heroes.json', data },
      { file: 'parsed/hero-summary.json', data: summary }
    ]
  }
}
