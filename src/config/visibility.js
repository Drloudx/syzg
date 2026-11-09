/**
 * 内容可见性 —— 全站唯一判定入口。
 *
 * 三条判据互相独立，任一命中即隐藏：
 *
 * | # | 判据 | 覆盖范围 | 维护方式 |
 * | --- | --- | --- | --- |
 * | ① | 手写黑名单 `blacklist.js` | GM 补给包、测试物、特殊成就 | 手工 |
 * | ② | 装备品阶 `HIDDEN_EQUIP_TIERS` | 4/5 阶装备 | 手工改数组 |
 * | ③ | 章节锁定 `chapter-lock.json` | 只可能来自第四/五章的物品 | **自动生成** |
 *
 * 页面只需调 `isVisible(item)`，不要各自复制规则。
 *
 * ## 为什么章节锁定要独立成产物
 * 判据是「扫全部来源表后，只有 c4/c5 来源」——构建期算一次即可。
 * 运行时读 `parsed/chapter-lock.json` 的 id 集合，零成本。
 */
import { isBlacklisted, isEquipTierHidden, isHiddenPet } from './blacklist.js'

/** 章节锁定 id 集合。构建产物，加载前为空集合（不隐藏任何东西，避免闪空）。 */
let chapterLockedIds = new Set()
let chapterLockLoaded = false

/**
 * 预加载章节锁定集合。应用启动或数据就绪后调用一次。
 * 失败时保持空集合 —— 宁可漏隐藏，也不因网络问题让页面变空。
 *
 * @param {(path: string) => Promise<any>} fetcher 通常传 `fetchWithFallback`
 */
export async function loadChapterLock(fetcher) {
  if (chapterLockLoaded) return chapterLockedIds
  try {
    const data = await fetcher('data/parsed/chapter-lock.json')
    const ids = Array.isArray(data?.ids) ? data.ids : []
    chapterLockedIds = new Set(ids)
    chapterLockLoaded = true
  } catch (err) {
    console.warn('[visibility] chapter-lock.json 加载失败，本次不应用章节锁定', err)
  }
  return chapterLockedIds
}

/** 测试与手动注入用 */
export function setChapterLockedIds(ids) {
  chapterLockedIds = new Set(ids || [])
  chapterLockLoaded = true
}

export function getChapterLockedIds() {
  return chapterLockedIds
}

/**
 * 是否应显示该条目。
 *
 * @param {object} item  需含 `id` 或 `typeId`，可选 `name` / `desc`；装备需 `equip.equipLevel`
 * @returns {boolean}
 */
export function isVisible(item) {
  if (!item) return true

  /* ① 手写黑名单 */
  if (isBlacklisted(item)) return false

  /*
   * ①b 隐藏魔物的蛋：魔物蛋在物品图鉴里是一条 category[0] === 6 的物品，
   * 其 typeId 就是魔物 id。魔物本身已按 HIDDEN_PET_IDS 隐藏，蛋不能单独留着。
   */
  const categories = Array.isArray(item.category) ? item.category : [item.category]
  if (Number(categories[0]) === 6 && isHiddenPet(String(item.typeId ?? item.id ?? ''))) return false

  /* ② 装备品阶 */
  if (isEquipTierHidden(item)) return false

  /* ③ 章节锁定 */
  const id = String(item.id ?? item.typeId ?? '')
  if (id && chapterLockedIds.has(id)) return false

  return true
}

/** 数组过滤便捷函数 */
export function filterVisibleList(list, keyOf = (x) => x) {
  return (list || []).filter(entry => isVisible(keyOf(entry)))
}
