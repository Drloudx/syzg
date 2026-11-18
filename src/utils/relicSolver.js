/**
 * 法盘遗器自动搭配装箱求解器
 *
 * 核心机制（严格对标游戏源码 SpRelicPanel.cs）：
 * 1. 8×7 棋盘（56 格，四角切角永久隐藏，满级有效共 52 格）。
 * 2. 遗器尺寸固定，不可旋转，纯矩形装箱。
 * 3. 核心遗器拥有 `energyPattern` 能量辐射距离参数（通常为 2, 3 或 4）：
 *    - 核心遗器的共鸣生效范围（Resonance Range）是以核心遗器占格为基准，向「上下左右十字方向」延伸 energyPattern 格；
 *    - 只有落在该十字能量范围内的基础遗器，才能被核心吸收并触发共鸣！
 *    - 不在十字能量范围内的基础遗器，无法为该核心提供共鸣！
 * 4. 使用 64 位 BigInt 位掩码进行纳秒级碰撞检测。
 */

export const BOARD_WIDTH = 8
export const BOARD_HEIGHT = 7
export const TOTAL_CELLS = BOARD_WIDTH * BOARD_HEIGHT // 56

/**
 * 判断坐标是否是四角永久隐藏切角
 */
export function isPermanentCorner(x, y) {
  return (x === 0 || x === BOARD_WIDTH - 1) && (y === 0 || y === BOARD_HEIGHT - 1)
}

/**
 * 坐标转位索引 (0..55)
 */
export function coordToBit(x, y) {
  return y * BOARD_WIDTH + x
}

/**
 * 位索引转坐标
 */
export function bitToCoord(bit) {
  const x = bit % BOARD_WIDTH
  const y = Math.floor(bit / BOARD_WIDTH)
  return { x, y }
}

/**
 * 计算遗器在 (x, y) 处的位掩码，若越界或压角则返回 0n
 */
export function getRelicBitmask(relic, x, y) {
  const w = relic.shape?.width || 1
  const h = relic.shape?.height || 1
  if (x < 0 || y < 0 || x + w > BOARD_WIDTH || y + h > BOARD_HEIGHT) {
    return 0n
  }
  let mask = 0n
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const cx = x + dx
      const cy = y + dy
      if (isPermanentCorner(cx, cy)) {
        return 0n // 压在隐藏角上，非法
      }
      mask |= (1n << BigInt(coordToBit(cx, cy)))
    }
  }
  return mask
}

/**
 * 计算核心遗器的十字能量共鸣范围（SpRelicPanel.cs::GetResonanceRangeCells 算法）
 * 从核心遗器的每个占格出发，沿水平与垂直十字方向延伸 range (energyPattern) 格。
 * 返回格式为 Set<string> ("x,y")
 */
export function getCoreResonanceRangeCells(corePlaced, boardWidth = BOARD_WIDTH, boardHeight = BOARD_HEIGHT) {
  const range = corePlaced.relic?.energyPattern ?? corePlaced.energyPattern ?? 2
  const rangeCells = new Set()
  const left = corePlaced.x
  const top = corePlaced.y
  const w = corePlaced.width ?? corePlaced.shape?.width ?? 1
  const h = corePlaced.height ?? corePlaced.shape?.height ?? 1

  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const cx = left + dx
      const cy = top + dy

      // 水平向左右延伸 range 格 (dx: -range..+range, != 0)
      for (let k = -range; k <= range; k += 1) {
        if (k !== 0) {
          const nx = cx + k
          if (nx >= 0 && nx < boardWidth && !isPermanentCorner(nx, cy)) {
            // 不能落在核心自身占格内
            if (!(nx >= left && nx < left + w && cy >= top && cy < top + h)) {
              rangeCells.add(`${nx},${cy}`)
            }
          }
        }
      }

      // 垂直向上下延伸 range 格 (dy: -range..+range, != 0)
      for (let k = -range; k <= range; k += 1) {
        if (k !== 0) {
          const ny = cy + k
          if (ny >= 0 && ny < boardHeight && !isPermanentCorner(cx, ny)) {
            // 不能落在核心自身占格内
            if (!(cx >= left && cx < left + w && ny >= top && ny < top + h)) {
              rangeCells.add(`${cx},${ny}`)
            }
          }
        }
      }
    }
  }

  return rangeCells
}

/**
 * 获取棋盘在指定等级下的默认已解锁格子集合
 */
export function getDefaultOpenGridSet(level = 30, fapanCells = []) {
  const openSet = new Set()
  const targetLevel = Math.max(1, Math.min(30, Number(level) || 30))

  if (fapanCells && fapanCells.length) {
    for (const cell of fapanCells) {
      if (isPermanentCorner(cell.x, cell.y)) continue
      if (targetLevel === 30) {
        openSet.add(`${cell.x},${cell.y}`)
      } else if (cell.isInitial || (!cell.locked && cell.isInitial !== false)) {
        openSet.add(`${cell.x},${cell.y}`)
      }
    }
    if (targetLevel > 1 && targetLevel < 30) {
      const unlockables = fapanCells.filter(c => !isPermanentCorner(c.x, c.y) && !openSet.has(`${c.x},${c.y}`))
      const toAdd = Math.min(unlockables.length, targetLevel - 1)
      for (let i = 0; i < toAdd; i += 1) {
        openSet.add(`${unlockables[i].x},${unlockables[i].y}`)
      }
    }
    return openSet
  }

  // 兜底几何计算
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (isPermanentCorner(x, y)) continue
      if (targetLevel === 30) {
        openSet.add(`${x},${y}`)
        continue
      }
      const inCenterCore = (x >= 1 && x <= 6 && y >= 2 && y <= 4)
      const topExtra = (x >= 3 && x <= 4 && y === 1)
      const bottomExtra = (x >= 3 && x <= 4 && y === 5)
      if (inCenterCore || topExtra || bottomExtra) {
        openSet.add(`${x},${y}`)
      }
    }
  }
  return openSet
}

/**
 * 求解自动搭配与装箱
 */
export function solveFapanPlacement({
  openCells, // Set<string> "x,y"
  selectedCoreIds = [], // string[]
  targetResonanceTags = null, // { [coreId]: number[] }
  excludedStats = [], // string[] 排除属性
  excludedCategories = [], // string[] 排除元素
  excludedRelicIds = [], // string[] 排除特定遗器
  requiredRelicIds = [], // string[] 必选基础遗器（必须在棋盘上放置至少 1 件）
  relicMaxCounts = {}, // { [relicId]: number } 单个遗器数量上限/库存限制
  globalMaxCountPerRelic = 4, // number | null 全局单品上限（默认每种最多 4 件）
  allRelics = []
}) {
  const openSet = openCells instanceof Set ? openCells : new Set(openCells)
  const excludedStatSet = new Set(excludedStats)
  const excludedCatSet = new Set(excludedCategories)
  const excludedRelicSet = new Set(excludedRelicIds)
  const requiredRelicSet = new Set(requiredRelicIds)

  // 获取特定遗器的可用最大数量上限
  function getMaxLimit(relicId) {
    if (relicMaxCounts && typeof relicMaxCounts[relicId] === 'number') {
      const val = Math.max(0, relicMaxCounts[relicId])
      return requiredRelicSet.has(relicId) ? Math.max(1, val) : val
    }
    if (typeof globalMaxCountPerRelic === 'number' && globalMaxCountPerRelic > 0) {
      return globalMaxCountPerRelic
    }
    return 999
  }

  // 维护每种遗器已放置数量
  const usedCountMap = new Map()

  // 1. 构建初始棋盘位掩码
  let boardMask = 0n
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const bit = coordToBit(x, y)
      if (isPermanentCorner(x, y) || !openSet.has(`${x},${y}`)) {
        boardMask |= (1n << BigInt(bit))
      }
    }
  }

  // 2. 筛选核心遗器
  const coreRelics = []
  for (const id of selectedCoreIds) {
    const relic = allRelics.find(r => r.id === id && r.type === 'core')
    if (relic) coreRelics.push(relic)
  }

  // 基础遗器池
  const candidateBases = allRelics.filter(r => {
    if (r.type !== 'base') return false
    // 勾选必选的基础遗器强制保留进入候选池
    if (requiredRelicSet.has(r.id)) return true
    if (excludedRelicSet.has(r.id)) return false
    if (r.categoryName && excludedCatSet.has(r.categoryName)) return false
    if (r.attributeName && excludedStatSet.has(r.attributeName)) return false
    if (getMaxLimit(r.id) <= 0) return false // 拥有数量或限制为 0 时直接排除
    return true
  })

  const basesByCat = {
    火属性: [],
    水属性: [],
    地属性: [],
    风属性: []
  }
  for (const b of candidateBases) {
    if (basesByCat[b.categoryName]) {
      basesByCat[b.categoryName].push(b)
    }
  }

  const placedRelics = []

  function findValidPlacements(relic, currentMask) {
    const placements = []
    const w = relic.shape?.width || 1
    const h = relic.shape?.height || 1
    for (let y = 0; y <= BOARD_HEIGHT - h; y += 1) {
      for (let x = 0; x <= BOARD_WIDTH - w; x += 1) {
        const mask = getRelicBitmask(relic, x, y)
        if (mask !== 0n && (currentMask & mask) === 0n) {
          placements.push({ x, y, mask, width: w, height: h })
        }
      }
    }
    return placements
  }

  // 3. 核心布局候选生成与多核心联合需求求解
  // 按照面积从大到小与 ID 确定性排序核心，消除用户点击选择顺序对结果的随机影响
  const sortedCores = [...coreRelics].sort((a, b) => {
    const areaA = (a.shape?.width || 1) * (a.shape?.height || 1)
    const areaB = (b.shape?.width || 1) * (b.shape?.height || 1)
    if (areaB !== areaA) return areaB - areaA
    return a.id.localeCompare(b.id)
  })

  function searchCoreLayouts(idx, currentMask, currentPlaced, maxResults = 16) {
    if (idx >= sortedCores.length) {
      return [{ mask: currentMask, placed: currentPlaced }]
    }
    const core = sortedCores[idx]
    const positions = findValidPlacements(core, currentMask)
    // 启发式：优先排在中心附近（x 接近 4, y 接近 3.5）
    positions.sort((a, b) => {
      const distA = Math.hypot(a.x + a.width / 2 - 4, a.y + a.height / 2 - 3.5)
      const distB = Math.hypot(b.x + b.width / 2 - 4, b.y + b.height / 2 - 3.5)
      return distA - distB
    })

    const results = []
    for (const pos of positions.slice(0, 4)) {
      const item = {
        relicId: core.id,
        relic: core,
        x: pos.x,
        y: pos.y,
        width: core.shape.width,
        height: core.shape.height,
        level: 5,
        isCore: true
      }
      const sub = searchCoreLayouts(idx + 1, currentMask | pos.mask, [...currentPlaced, item], maxResults)
      for (const s of sub) {
        results.push(s)
        if (results.length >= maxResults) return results
      }
    }
    return results
  }

  let candidateCoreLayouts = searchCoreLayouts(0, boardMask, [])
  if (candidateCoreLayouts.length === 0 && sortedCores.length > 0) {
    // 降级兜底：尽量放能放下的核心
    let partialMask = boardMask
    const partialPlaced = []
    for (const core of sortedCores) {
      const positions = findValidPlacements(core, partialMask)
      if (positions.length) {
        positions.sort((a, b) => {
          const distA = Math.hypot(a.x + a.width / 2 - 4, a.y + a.height / 2 - 3.5)
          const distB = Math.hypot(b.x + b.width / 2 - 4, b.y + b.height / 2 - 3.5)
          return distA - distB
        })
        const chosen = positions[0]
        partialMask |= chosen.mask
        partialPlaced.push({
          relicId: core.id,
          relic: core,
          x: chosen.x,
          y: chosen.y,
          width: core.shape.width,
          height: core.shape.height,
          level: 5,
          isCore: true
        })
      }
    }
    candidateCoreLayouts = [{ mask: partialMask, placed: partialPlaced }]
  } else if (candidateCoreLayouts.length === 0) {
    candidateCoreLayouts = [{ mask: boardMask, placed: [] }]
  }

  // 4. 针对候选核心布局，执行【多核心联合需求 + 共鸣共享装配】
  // 共鸣满是绝对第一优先级！
  let bestSolution = null

  for (const layout of candidateCoreLayouts) {
    let currentBoardMask = layout.mask
    const currentPlacedRelics = [...layout.placed]
    const currentUsedCountMap = new Map()

    const placedCores = currentPlacedRelics.filter(p => p.isCore)
    const coreInfos = placedCores.map(c => {
      const rangeCells = getCoreResonanceRangeCells(c)
      const targetTags = targetResonanceTags?.[c.relicId]
      const neededCounts = {}
      for (const res of (c.relic.resonances || [])) {
        if (targetTags && !targetTags.includes(res.tag)) continue
        for (const part of (res.requirementParts || [])) {
          neededCounts[part.categoryName] = Math.max(neededCounts[part.categoryName] || 0, part.count || 0)
        }
      }
      return { core: c, rangeCells, neededCounts }
    })

    // 联合需求贪心闭环：反复寻找对当前所有核心共鸣贡献最大的位置
    let keepPlacing = true
    while (keepPlacing) {
      let totalDeficit = 0
      const deficits = []

      for (const ci of coreInfos) {
        for (const [elem, needed] of Object.entries(ci.neededCounts)) {
          let touchCount = 0
          for (const p of currentPlacedRelics) {
            if (p.isCore || p.relic.categoryName !== elem) continue
            let touches = false
            for (let dy = 0; dy < p.height; dy += 1) {
              for (let dx = 0; dx < p.width; dx += 1) {
                if (ci.rangeCells.has(`${p.x + dx},${p.y + dy}`)) {
                  touches = true
                  break
                }
              }
              if (touches) break
            }
            if (touches) touchCount += 1
          }
          const def = Math.max(0, needed - touchCount)
          if (def > 0) {
            totalDeficit += def
            deficits.push({ ci, elem, def })
          }
        }
      }

      if (totalDeficit === 0) {
        break // 所有核心共鸣需求已全部达成！
      }

      const elemDemand = {}
      for (const d of deficits) {
        elemDemand[d.elem] = (elemDemand[d.elem] || 0) + d.def
      }

      let bestMove = null

      for (const [elemName, demand] of Object.entries(elemDemand)) {
        const candidates = basesByCat[elemName] || []
        for (const relic of candidates) {
          const used = currentUsedCountMap.get(relic.id) || 0
          if (used >= getMaxLimit(relic.id)) continue

          const positions = findValidPlacements(relic, currentBoardMask)
          for (const pos of positions) {
            let benefitedCount = 0
            let totalOverlapCells = 0

            for (const ci of coreInfos) {
              const def = deficits.find(d => d.ci === ci && d.elem === elemName)
              if (!def) continue

              let coreOverlap = 0
              for (let dy = 0; dy < relic.shape.height; dy += 1) {
                for (let dx = 0; dx < relic.shape.width; dx += 1) {
                  if (ci.rangeCells.has(`${pos.x + dx},${pos.y + dy}`)) {
                    coreOverlap += 1
                  }
                }
              }
              if (coreOverlap > 0) {
                benefitedCount += 1
                totalOverlapCells += coreOverlap
              }
            }

            if (benefitedCount > 0) {
              const area = relic.shape.width * relic.shape.height
              // 评分准则：
              // 1. 同时满足多个核心共鸣（benefitedCount >= 2）优先（一石多鸟）
              // 2. 元素总需求量高者优先
              // 3. 必选遗器且未达上限，赋予额外权重优先达成，且已放件数越少权重越高
              // 4. 占用面积更小优先（1x1 优先于大件，不挤占后续格子）
              // 5. 触碰十字格数更少优先（边缘微触碰，保护十字通道畅通）
              let reqBonus = 0
              if (requiredRelicSet.has(relic.id)) {
                reqBonus = used === 0 ? 5000 : Math.max(500, 3000 - used * 600)
              }
              const moveScore = (benefitedCount * 1000) + (demand * 50) + reqBonus - (area * 20) - totalOverlapCells

              if (!bestMove || moveScore > bestMove.score) {
                bestMove = {
                  score: moveScore,
                  relic,
                  pos,
                  benefitedCount
                }
              }
            }
          }
        }
      }

      if (bestMove) {
        currentBoardMask |= bestMove.pos.mask
        currentPlacedRelics.push({
          relicId: bestMove.relic.id,
          relic: bestMove.relic,
          x: bestMove.pos.x,
          y: bestMove.pos.y,
          width: bestMove.relic.shape.width,
          height: bestMove.relic.shape.height,
          level: 5,
          isCore: false
        })
        currentUsedCountMap.set(bestMove.relic.id, (currentUsedCountMap.get(bestMove.relic.id) || 0) + 1)
      } else {
        break
      }
    }

    // 4.5 阶段 2.5：优先确保所有必选遗器至少放置 1 件（大面积优先放置）
    const pendingRequired = candidateBases
      .filter(r => requiredRelicSet.has(r.id) && (currentUsedCountMap.get(r.id) || 0) === 0)
      .sort((a, b) => {
        const areaA = (a.shape?.width || 1) * (a.shape?.height || 1)
        const areaB = (b.shape?.width || 1) * (b.shape?.height || 1)
        return areaB - areaA
      })

    for (const relic of pendingRequired) {
      if ((currentUsedCountMap.get(relic.id) || 0) >= getMaxLimit(relic.id)) continue
      const positions = findValidPlacements(relic, currentBoardMask)
      if (positions.length) {
        // 优先选择触碰核心十字格最少的位置（减少通道潜在占用）
        positions.sort((posA, posB) => {
          let overlapA = 0
          let overlapB = 0
          for (const ci of coreInfos) {
            for (let dy = 0; dy < (relic.shape?.height || 1); dy += 1) {
              for (let dx = 0; dx < (relic.shape?.width || 1); dx += 1) {
                if (ci.rangeCells.has(`${posA.x + dx},${posA.y + dy}`)) overlapA += 1
                if (ci.rangeCells.has(`${posB.x + dx},${posB.y + dy}`)) overlapB += 1
              }
            }
          }
          return overlapA - overlapB
        })
        const chosen = positions[0]
        currentBoardMask |= chosen.mask
        currentPlacedRelics.push({
          relicId: relic.id,
          relic,
          x: chosen.x,
          y: chosen.y,
          width: relic.shape.width,
          height: relic.shape.height,
          level: 5,
          isCore: false
        })
        currentUsedCountMap.set(relic.id, (currentUsedCountMap.get(relic.id) || 0) + 1)
      }
    }

    // 4.8 阶段 2.8：在核心共鸣满足后，所有勾选必选的基础遗器雨露均沾、均衡轮流尽量多放
    const requiredBases = candidateBases.filter(r => requiredRelicSet.has(r.id))
    if (requiredBases.length > 0) {
      const unplacableRequired = new Set()
      let keepFillingRequired = true
      while (keepFillingRequired) {
        // 筛选仍未达到各自拥有量/上限且尚未被证明放不下的必选遗器
        const placable = requiredBases.filter(r => {
          if (unplacableRequired.has(r.id)) return false
          const used = currentUsedCountMap.get(r.id) || 0
          return used < getMaxLimit(r.id)
        })

        if (placable.length === 0) {
          keepFillingRequired = false
          break
        }

        // 均衡轮流排序：
        // 1. 已放置数量越少优先（雨露均沾）
        // 2. 数量相等时面积大者优先（先放大件防碎片化）
        // 3. ID 稳定排序
        placable.sort((a, b) => {
          const usedA = currentUsedCountMap.get(a.id) || 0
          const usedB = currentUsedCountMap.get(b.id) || 0
          if (usedA !== usedB) return usedA - usedB
          const areaA = (a.shape?.width || 1) * (a.shape?.height || 1)
          const areaB = (b.shape?.width || 1) * (b.shape?.height || 1)
          if (areaB !== areaA) return areaB - areaA
          return a.id.localeCompare(b.id)
        })

        let placedOne = false
        for (const targetRelic of placable) {
          const positions = findValidPlacements(targetRelic, currentBoardMask)
          if (positions.length === 0) {
            unplacableRequired.add(targetRelic.id)
            continue
          }

          // 优先选择避开核心十字通道且紧凑靠边的位置
          positions.sort((posA, posB) => {
            let overlapA = 0
            let overlapB = 0
            for (const ci of coreInfos) {
              for (let dy = 0; dy < (targetRelic.shape?.height || 1); dy += 1) {
                for (let dx = 0; dx < (targetRelic.shape?.width || 1); dx += 1) {
                  if (ci.rangeCells.has(`${posA.x + dx},${posA.y + dy}`)) overlapA += 1
                  if (ci.rangeCells.has(`${posB.x + dx},${posB.y + dy}`)) overlapB += 1
                }
              }
            }
            if (overlapA !== overlapB) return overlapA - overlapB
            return (posA.y * 10 + posA.x) - (posB.y * 10 + posB.x)
          })

          const chosen = positions[0]
          currentBoardMask |= chosen.mask
          currentPlacedRelics.push({
            relicId: targetRelic.id,
            relic: targetRelic,
            x: chosen.x,
            y: chosen.y,
            width: targetRelic.shape.width,
            height: targetRelic.shape.height,
            level: 5,
            isCore: false
          })
          currentUsedCountMap.set(targetRelic.id, (currentUsedCountMap.get(targetRelic.id) || 0) + 1)
          placedOne = true
          break // 放置成功一件后，重新按最新数量均衡评估下一件
        }

        if (!placedOne) {
          keepFillingRequired = false
        }
      }
    }

    // 5. 阶段 3：用未被排除的基础遗器贪心填充剩余空余格子
    const fillCandidates = [...candidateBases].sort((a, b) => {
      const aIsReq = requiredRelicSet.has(a.id) && (currentUsedCountMap.get(a.id) || 0) < getMaxLimit(a.id)
      const bIsReq = requiredRelicSet.has(b.id) && (currentUsedCountMap.get(b.id) || 0) < getMaxLimit(b.id)
      if (aIsReq && !bIsReq) return -1
      if (!aIsReq && bIsReq) return 1
      const areaA = a.shape.width * a.shape.height
      const areaB = b.shape.width * b.shape.height
      if (areaB !== areaA) return areaB - areaA
      return a.name.localeCompare(b.name, 'zh')
    })

    let canContinue = true
    while (canContinue) {
      let placedInLoop = false
      for (const relic of fillCandidates) {
        const currentUsed = currentUsedCountMap.get(relic.id) || 0
        if (currentUsed >= getMaxLimit(relic.id)) continue

        const positions = findValidPlacements(relic, currentBoardMask)
        if (positions.length) {
          const chosen = positions[0]
          currentBoardMask |= chosen.mask
          currentPlacedRelics.push({
            relicId: relic.id,
            relic,
            x: chosen.x,
            y: chosen.y,
            width: relic.shape.width,
            height: relic.shape.height,
            level: 5,
            isCore: false
          })
          currentUsedCountMap.set(relic.id, currentUsed + 1)
          placedInLoop = true
          break
        }
      }
      if (!placedInLoop) {
        canContinue = false
      }
    }

    const resEval = evaluateResonances(currentPlacedRelics, coreRelics)
    const usedCellCount = currentPlacedRelics.reduce((sum, p) => sum + p.width * p.height, 0)
    let missingRequiredCount = 0
    let totalRequiredPlaced = 0
    for (const rid of requiredRelicSet) {
      const cnt = currentUsedCountMap.get(rid) || 0
      if (cnt < 1) {
        missingRequiredCount += 1
      }
      totalRequiredPlaced += cnt
    }
    // 方案总评分：共鸣达成数绝对第一优先，必选遗器未满足大幅扣分，必选遗器放置件数正向加分，辅以有效格利用率
    const score = (resEval.active.length * 100000)
      - (resEval.unmet.length * 50000)
      - (missingRequiredCount * 80000)
      + (totalRequiredPlaced * 500)
      + (usedCellCount * 10)

    if (!bestSolution || score > bestSolution.score) {
      bestSolution = {
        score,
        placedRelics: currentPlacedRelics,
        boardMask: currentBoardMask,
        usedCellCount,
        resEval,
        usedCountMap: currentUsedCountMap,
        missingRequiredCount,
        totalRequiredPlaced
      }
      // 若当前方案已达成所有可能共鸣且所有必选遗器均已达到最大上限（或无必选），则提前收敛
      let allReqMaxed = true
      for (const rid of requiredRelicSet) {
        if ((currentUsedCountMap.get(rid) || 0) < getMaxLimit(rid)) {
          allReqMaxed = false
          break
        }
      }
      if (resEval.unmet.length === 0 && missingRequiredCount === 0 && allReqMaxed) {
        break
      }
    }
  }

  const resonanceStatus = bestSolution ? bestSolution.resEval : { active: [], unmet: [], all: [] }
  const finalPlacedRelics = bestSolution ? bestSolution.placedRelics : []
  const finalBoardMask = bestSolution ? bestSolution.boardMask : boardMask
  const finalUsedCellCount = bestSolution ? bestSolution.usedCellCount : 0
  const totalStats = calculateTotalStats(finalPlacedRelics)
  const usedCounts = bestSolution ? Object.fromEntries(bestSolution.usedCountMap.entries()) : {}
  const missingRequiredRelicIds = Array.from(requiredRelicSet).filter(id => !bestSolution?.usedCountMap?.get(id))

  return {
    success: true,
    placedRelics: finalPlacedRelics,
    boardMask: finalBoardMask,
    usedCellCount: finalUsedCellCount,
    totalOpenCount: openSet.size,
    fillRate: openSet.size > 0 ? (finalUsedCellCount / openSet.size) : 0,
    activeResonances: resonanceStatus.active,
    unmetResonances: resonanceStatus.unmet,
    allResonances: resonanceStatus.all,
    totalStats,
    usedCounts,
    missingRequiredRelicIds
  }
}

/**
 * 校验共鸣激活状态（严格遵循游戏源码 SpRelicPanel::CheckResonances 规则）：
 * 只有落在核心的十字共鸣范围（GetResonanceRangeCells）内的基础遗器才计入该核心的元素统计！
 */
export function evaluateResonances(placedRelics, coreRelics = []) {
  const active = []
  const unmet = []
  const all = []
  const activeCores = coreRelics.length
    ? coreRelics
    : placedRelics.filter(p => p.isCore).map(p => p.relic)

  const placedCoreItems = placedRelics.filter(p => p.isCore)
  const placedBaseItems = placedRelics.filter(p => !p.isCore)

  for (const core of activeCores) {
    const corePlaced = placedCoreItems.find(p => p.relicId === core.id)
    // 若核心未放置在盘上，则其所有共鸣均为未达成
    if (!corePlaced) {
      for (const res of (core.resonances || [])) {
        const entry = {
          coreId: core.id,
          coreName: core.name,
          tag: res.tag,
          requirement: res.requirement,
          requirementParts: res.requirementParts,
          text: res.text,
          isMet: false
        }
        unmet.push(entry)
        all.push(entry)
      }
      continue
    }

    // 计算当前核心的十字能量范围
    const rangeCells = getCoreResonanceRangeCells(corePlaced)

    // 统计落在当前核心 rangeCells 内的基础遗器元素统计（对标源码 CalculateRelicCategoryStats）
    // 源码中使用 hashSet3 记录已统计过的遗器实例 uid，每件基础遗器只要有任意格子落在 rangeCells 内，该元素计数 +1
    const categoryStats = {
      火属性: 0,
      水属性: 0,
      地属性: 0,
      风属性: 0
    }

    for (const base of placedBaseItems) {
      if (!base.relic?.categoryName || categoryStats[base.relic.categoryName] === undefined) continue
      let touched = false
      for (let dy = 0; dy < base.height; dy += 1) {
        for (let dx = 0; dx < base.width; dx += 1) {
          if (rangeCells.has(`${base.x + dx},${base.y + dy}`)) {
            touched = true
            break
          }
        }
        if (touched) break
      }
      if (touched) {
        categoryStats[base.relic.categoryName] += 1
      }
    }

    // 逐项判定共鸣（按核心顺序紧密聚合，同一核心的所有词条排在一起）
    for (const res of (core.resonances || [])) {
      const isMet = (res.requirementParts || []).every(part => {
        return (categoryStats[part.categoryName] || 0) >= (part.count || 0)
      })
      const entry = {
        coreId: core.id,
        coreName: core.name,
        tag: res.tag,
        requirement: res.requirement,
        requirementParts: res.requirementParts,
        text: res.text,
        isMet
      }
      all.push(entry)
      if (isMet) active.push(entry)
      else unmet.push(entry)
    }
  }

  return { active, unmet, all }
}

/**
 * 汇总当前盘上所有基础遗器的词条加成
 */
export function calculateTotalStats(placedRelics) {
  const statsMap = {}
  for (const item of placedRelics) {
    if (item.isCore || !item.relic) continue
    const attrName = item.relic.attributeName
    if (!attrName) continue

    const lv = Math.min(item.level || 5, item.relic.levels?.length || 5)
    const lvText = item.relic.levels?.[lv - 1]?.text || ''
    const match = lvText.match(/(\d+(?:\.\d+)?)\s*%?/)
    const val = match ? parseFloat(match[1]) : 0
    const isPercent = lvText.includes('%')

    if (!statsMap[attrName]) {
      statsMap[attrName] = {
        name: attrName,
        value: 0,
        isPercent,
        count: 0
      }
    }
    statsMap[attrName].value += val
    statsMap[attrName].count += 1
  }

  return Object.values(statsMap).map(s => ({
    name: s.name,
    value: Math.round(s.value * 10) / 10,
    text: `${s.name} +${Math.round(s.value * 10) / 10}${s.isPercent ? '%' : ''}`,
    count: s.count
  }))
}

/**
 * 解析共鸣需求字符串为结构化 parts
 * 例子："{火属性 ×2 + 风属性 ×1}" -> [{ categoryName: "火属性", count: 2 }, { categoryName: "风属性", count: 1 }]
 */
export function parseRequirementParts(reqText) {
  if (!reqText) return []
  const parts = []
  const regex = /(火属性|水属性|地属性|风属性)\s*[×x*]?\s*(\d+)/g
  let match
  while ((match = regex.exec(reqText)) !== null) {
    parts.push({
      categoryName: match[1],
      count: parseInt(match[2], 10)
    })
  }
  return parts
}

/**
 * 获取元素图标的 slug
 * "火属性" -> "fire", "水属性" -> "water", "地属性" -> "ground", "风属性" -> "wind"
 */
export function getElementSlug(catName) {
  if (!catName) return ''
  if (catName.includes('水')) return 'water'
  if (catName.includes('火')) return 'fire'
  if (catName.includes('地')) return 'ground'
  if (catName.includes('风')) return 'wind'
  return ''
}

/**
 * 格式化遗器效果文本：移除大括号并将里面的数值包在高亮 span 中
 */
export function formatRelicEffect(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{([^{}]+)\}/g, '<span class="relic-num-hl">$1</span>')
}

