/**
 * 配队模拟器的**智能推荐**求解器。
 *
 * 场景：出战位只有 3 个魔物，要从 32 个里选 3 个，让队伍吃到的队伍被动最多。
 *
 * 规模：C(32,3) = 4960 种组合 —— 直接穷举，拿到的是**真正的最优解**，
 * 不用贪心/启发式近似（那些在这种规模下只会更慢且可能算错）。
 *
 * 🔴 **评分模型：加权求和**
 *
 *   score = Σ(每个角色的权重 × 该角色吃到的数量) + 偏好加成命中 × 小系数
 *
 * 权重默认全部相同（=1），此时 score 就是「总点亮数」，
 * 等价于「平均下来每个角色能吃到的数量最多」。
 *
 * 点某个角色 → 它的权重提高（默认 2.5），求解就会优先照顾它，
 * 但**不强制**：如果为了它要牺牲太多别人的点数，加权后会给出折中方案。
 *
 * 为什么不排序「吃满人数」：那会选出 `[3,0,0,3]`（2 人满 / 2 人空手，总 6）
 * 而不是 `[1,2,2,3]`（4 人都有收益，总 8）。实测 46376 种 4 人组合里
 * **512 种（1.1%）会踩这个坑**。
 */

import { matchesPassive, isGenericPassive } from './simsData'

/** 出战魔物位数量 —— 游戏固定 3 个 */
export const TEAM_SLOTS = 3

/** 默认权重：所有角色相同 */
export const DEFAULT_HERO_WEIGHT = 1

/** 点选后的权重倍数（相对默认） */
export const BOOSTED_HERO_WEIGHT = 2.5

/** 偏好加成命中一只的加分（远小于角色权重，只用作同分时的偏向） */
const STAT_HIT_WEIGHT = 0.15

/**
 * 枚举所有组合。
 * @param {Array} pets 全部魔物
 * @param {number} k   取几个
 */
function combinations(pets, k) {
  const out = []
  const pick = (start, acc) => {
    if (acc.length === k) { out.push([...acc]); return }
    for (let i = start; i < pets.length; i += 1) {
      acc.push(pets[i])
      pick(i + 1, acc)
      acc.pop()
    }
  }
  pick(0, [])
  return out
}

/**
 * 求最优出战组合。
 *
 * @param {Array} team    已选角色（1~4 个）
 * @param {Array} pets    全部魔物
 * @param {Object} options
 *   heroWeights     Object<id, number>  各角色权重，缺省为 DEFAULT_HERO_WEIGHT
 *   boostHeroIds    Array<string>       要提权的角色 id（等价于把权重设为 BOOSTED_HERO_WEIGHT）
 *   preferStats     Array<string>       优先的加成类型
 *   excludeGeneric  boolean             排除「通用」被动，默认 true
 *   slots           number              出战位数量，默认 3
 * @returns {{ best: Object|null, all: Array }}
 */
export function solveBestTeam(team, pets, options = {}) {
  const {
    heroWeights = {},
    boostHeroIds = [],
    preferStats = [],
    excludeGeneric = true,
    slots = TEAM_SLOTS,
  } = options
  if (!team.length) return { best: null, all: [] }

  /*
   * 「通用」= 队伍被动不带任何属性/职业限定（如「队伍伙伴 暴击率 增加 5%」）。
   *
   * 为什么默认排除：这类被动对**任何**角色都生效，一算就把 3 个位置全占满，
   * 表面「12/12 满分」却等于没做任何针对性搭配 —— 推荐结果失去意义。
   * 用户想看它们时可以关掉这个开关。
   *
   * 判定统一走 `isGenericPassive()`，与自组查看列表共用同一口径。
   */
  const pool = excludeGeneric ? pets.filter(p => !isGenericPassive(p.passive)) : pets

  if (pool.length < slots) return { best: null, all: [] }

  // 预算相邻矩阵：每只魔物对每个角色是否生效（避免在循环里重复判定）
  const matrix = pool.map(pet => team.map(hero => matchesPassive(hero, pet.passive)))

  /**
   * 每个角色的最终权重。
   *
   * 默认全部 DEFAULT_HERO_WEIGHT（=1）→ score 就等于「总点亮数」，
   * 也就是「平均下来每个角色能吃到的最多」。
   * 被点选的角色用 BOOSTED_HERO_WEIGHT（=2.5）提权 → 求解偏向它，但不强制。
   */
  const weights = team.map(hero => {
    if (boostHeroIds.includes(hero.id)) return BOOSTED_HERO_WEIGHT
    const w = heroWeights[hero.id]
    return typeof w === 'number' && w > 0 ? w : DEFAULT_HERO_WEIGHT
  })

  const evaluate = combo => {
    const counts = team.map((_, heroIdx) =>
      combo.reduce((sum, pet) => sum + (matrix[pool.indexOf(pet)][heroIdx] ? 1 : 0), 0))

    const total = counts.reduce((a, b) => a + b, 0)
    const covered = counts.filter(c => c > 0).length
    const fullCount = counts.filter(c => c >= slots).length

    // 🔴 核心：加权求和
    const weighted = counts.reduce((sum, c, i) => sum + c * weights[i], 0)

    const statHit = preferStats.reduce((sum, stat) =>
      sum + combo.filter(pet => pet.passive.stat === stat).length, 0)

    // 偏好加成只做同分微调，权重远小于任一角色
    const score = weighted + statHit * STAT_HIT_WEIGHT

    return { combo, counts, total, covered, fullCount, weighted, statHit, score }
  }

  let scored = combinations(pool, slots).map(evaluate)

  // 主序：加权总分；同分时优先总点数、再优先覆盖人数，保证结果稳定
  scored.sort((a, b) => b.score - a.score || b.total - a.total || b.covered - a.covered)

  return { best: scored[0] || null, all: scored }
}
