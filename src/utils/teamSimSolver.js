/**
 * 配队模拟器的**智能推荐**求解器。
 *
 * 场景：出战位只有 3 个魔物，要从 32 个里选 3 个，让 4 名角色吃到的队伍被动最多。
 *
 * 规模：C(32,3) = 4960 种组合 —— 直接穷举，拿到的是**真正的最优解**，
 * 不用贪心/启发式近似（那些在这种规模下只会更慢且可能算错）。
 *
 * 目标可以叠加三种偏好：
 *   protectHeroIds  优先保证这些角色「吃满」（吃满 = 3 个出战位全都对他们生效）
 *   preferStats     优先保证这些加成类型出现
 *   （不选则纯按总点数最大）
 */

import { matchesPassive } from './teamSimData'

/** 出战魔物位数量 —— 游戏固定 3 个 */
export const TEAM_SLOTS = 3

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
 *   protectHeroIds  Array<string>  优先吃满的角色 id
 *   preferStats     Array<string>  优先的加成类型
 *   excludeGeneric  boolean        排除「通用」被动，默认 true
 *   slots           number         出战位数量，默认 3
 * @returns {{ best: Object|null, all: Array }}
 */
export function solveBestTeam(team, pets, options = {}) {
  const {
    protectHeroIds = [],
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
   */
  const pool = excludeGeneric
    ? pets.filter(p => p.passive && (p.passive.elements.length || p.passive.jobs.length))
    : pets

  if (pool.length < slots) return { best: null, all: [] }

  // 预算相邻矩阵：每只魔物对每个角色是否生效（避免在循环里重复判定）
  const matrix = pool.map(pet => team.map(hero => matchesPassive(hero, pet.passive)))

  const evaluate = combo => {
    const heroHits = team.map(() => [])
    for (const pet of combo) {
      const row = matrix[pool.indexOf(pet)]
      row.forEach((hit, heroIdx) => { if (hit) heroHits[heroIdx].push(pet) })
    }
    const counts = heroHits.map(list => list.length)
    const total = counts.reduce((a, b) => a + b, 0)

    // 吃满的角色数（每个角色最多 slots 个）
    const fullCount = counts.filter(c => c >= slots).length
    // 被保护角色是否吃满
    const protectedFull = protectHeroIds.filter(id => {
      const idx = team.findIndex(h => h.id === id)
      return idx >= 0 && counts[idx] >= slots
    }).length
    // 偏好加成命中数
    const statHit = preferStats.reduce((sum, stat) =>
      sum + combo.filter(pet => pet.passive.stat === stat).length, 0)

    return { combo, counts, heroHits, total, fullCount, protectedFull, statHit }
  }

  let scored = combinations(pool, slots).map(evaluate)

  // 排序优先级：受保护角色吃满 > 吃满人数 > 偏好加成 > 总点数
  scored.sort((a, b) =>
    b.protectedFull - a.protectedFull ||
    b.fullCount - a.fullCount ||
    b.statHit - a.statHit ||
    b.total - a.total,
  )

  return { best: scored[0] || null, all: scored }
}

/**
 * 把求解结果的分数转成可读文案，供 UI 展示"为什么推荐这套"。
 */
export function describeSolution(solution, team) {
  if (!solution) return []
  const lines = []
  solution.counts.forEach((count, idx) => {
    const hero = team[idx]
    if (hero) lines.push(`${hero.name}：${count}/${TEAM_SLOTS}`)
  })
  return lines
}
