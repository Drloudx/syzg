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
  relicMaxCounts = {}, // { [relicId]: number } 单个遗器数量上限/库存限制
  globalMaxCountPerRelic = 3, // number | null 全局单品上限（默认每种最多 3 件）
  allRelics = []
}) {
  const openSet = openCells instanceof Set ? openCells : new Set(openCells)
  const excludedStatSet = new Set(excludedStats)
  const excludedCatSet = new Set(excludedCategories)
  const excludedRelicSet = new Set(excludedRelicIds)

  // 获取特定遗器的可用最大数量上限
  function getMaxLimit(relicId) {
    if (relicMaxCounts && typeof relicMaxCounts[relicId] === 'number') {
      return Math.max(0, relicMaxCounts[relicId])
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

  // 3. 阶段 1：放置核心遗器
  // 核心遗器通常居中放置，以便其十字能量范围能够覆盖更多格子
  function placeCoreRelics(coreIndex, currentMask, currentPlaced) {
    if (coreIndex >= coreRelics.length) {
      return { success: true, mask: currentMask, placed: [...currentPlaced] }
    }
    const core = coreRelics[coreIndex]
    const validPositions = findValidPlacements(core, currentMask)

    // 启发式：优先排在中心附近（x 接近 3, y 接近 2.5）
    validPositions.sort((a, b) => {
      const distA = Math.hypot(a.x + a.width / 2 - 4, a.y + a.height / 2 - 3.5)
      const distB = Math.hypot(b.x + b.width / 2 - 4, b.y + b.height / 2 - 3.5)
      return distA - distB
    })

    for (const pos of validPositions) {
      const placedItem = {
        relicId: core.id,
        relic: core,
        x: pos.x,
        y: pos.y,
        width: core.shape.width,
        height: core.shape.height,
        level: 5,
        isCore: true
      }
      const nextRes = placeCoreRelics(coreIndex + 1, currentMask | pos.mask, [...currentPlaced, placedItem])
      if (nextRes.success) return nextRes
    }
    return { success: false }
  }

  const coreResult = placeCoreRelics(0, boardMask, [])
  if (coreResult.success) {
    boardMask = coreResult.mask
    placedRelics.push(...coreResult.placed)
  } else if (coreRelics.length > 0) {
    // 降级：尽量放能放下的核心
    let partialMask = boardMask
    for (const core of coreRelics) {
      const positions = findValidPlacements(core, partialMask)
      if (positions.length) {
        partialMask |= positions[0].mask
        placedRelics.push({
          relicId: core.id,
          relic: core,
          x: positions[0].x,
          y: positions[0].y,
          width: core.shape.width,
          height: core.shape.height,
          level: 5,
          isCore: true
        })
      }
    }
    boardMask = partialMask
  }

  // 4. 阶段 2：在核心遗器的「十字能量共鸣范围」内放置对应的基础遗器
  // 计算所有已放置核心的十字共鸣范围并集
  const placedCores = placedRelics.filter(p => p.isCore)
  const coreRanges = placedCores.map(c => ({
    core: c,
    rangeCells: getCoreResonanceRangeCells(c)
  }))

  for (const { core, rangeCells } of coreRanges) {
    const targetTags = targetResonanceTags?.[core.relicId]
    const resonancesToActivate = (core.relic.resonances || []).filter(res => {
      if (!targetTags) return true
      return targetTags.includes(res.tag)
    })

    // 统计当前核心各元素所需配额
    const neededCounts = {}
    for (const res of resonancesToActivate) {
      for (const part of (res.requirementParts || [])) {
        neededCounts[part.categoryName] = Math.max(neededCounts[part.categoryName] || 0, part.count || 0)
      }
    }

    for (const [elementName, neededCount] of Object.entries(neededCounts)) {
      if (neededCount <= 0) continue

      // 优先选小尺寸（1x1, 1x2, 2x1），且候选位置必须与 rangeCells 重叠！
      const candidates = [...(basesByCat[elementName] || [])].sort((a, b) => {
        return (a.shape.width * a.shape.height) - (b.shape.width * b.shape.height)
      })

      // 统计当前核心范围内已经覆盖的对应元素格子数
      let currentOverlapCount = 0
      for (const placed of placedRelics) {
        if (!placed.isCore && placed.relic?.categoryName === elementName) {
          for (let dy = 0; dy < placed.height; dy += 1) {
            for (let dx = 0; dx < placed.width; dx += 1) {
              if (rangeCells.has(`${placed.x + dx},${placed.y + dy}`)) {
                currentOverlapCount += 1
              }
            }
          }
        }
      }

      while (currentOverlapCount < neededCount && candidates.length > 0) {
        let placedOne = false
        for (const relic of candidates) {
          const currentUsed = usedCountMap.get(relic.id) || 0
          if (currentUsed >= getMaxLimit(relic.id)) {
            continue
          }
          const positions = findValidPlacements(relic, boardMask)
          // 过滤出至少有 1 格落在 rangeCells 内的位置
          const overlappingPositions = positions.filter(pos => {
            for (let dy = 0; dy < relic.shape.height; dy += 1) {
              for (let dx = 0; dx < relic.shape.width; dx += 1) {
                if (rangeCells.has(`${pos.x + dx},${pos.y + dy}`)) return true
              }
            }
            return false
          })

          if (overlappingPositions.length > 0) {
            const chosen = overlappingPositions[0]
            boardMask |= chosen.mask
            placedRelics.push({
              relicId: relic.id,
              relic,
              x: chosen.x,
              y: chosen.y,
              width: relic.shape.width,
              height: relic.shape.height,
              level: 5,
              isCore: false
            })
            usedCountMap.set(relic.id, currentUsed + 1)
            // 计算新加入的重叠格数
            let added = 0
            for (let dy = 0; dy < relic.shape.height; dy += 1) {
              for (let dx = 0; dx < relic.shape.width; dx += 1) {
                if (rangeCells.has(`${chosen.x + dx},${chosen.y + dy}`)) added += 1
              }
            }
            currentOverlapCount += added
            placedOne = true
            break
          }
        }
        if (!placedOne) break
      }
    }
  }

  // 5. 阶段 3：用未被排除且未达数量上限的候选基础遗器贪心填充剩余空余格子
  const fillCandidates = [...candidateBases].sort((a, b) => {
    const areaA = a.shape.width * a.shape.height
    const areaB = b.shape.width * b.shape.height
    if (areaB !== areaA) return areaB - areaA
    return a.name.localeCompare(b.name, 'zh')
  })

  let canContinue = true
  while (canContinue) {
    let placedInLoop = false
    for (const relic of fillCandidates) {
      const currentUsed = usedCountMap.get(relic.id) || 0
      if (currentUsed >= getMaxLimit(relic.id)) {
        continue
      }
      const positions = findValidPlacements(relic, boardMask)
      if (positions.length) {
        const chosen = positions[0]
        boardMask |= chosen.mask
        placedRelics.push({
          relicId: relic.id,
          relic,
          x: chosen.x,
          y: chosen.y,
          width: relic.shape.width,
          height: relic.shape.height,
          level: 5,
          isCore: false
        })
        usedCountMap.set(relic.id, currentUsed + 1)
        placedInLoop = true
        break
      }
    }
    if (!placedInLoop) {
      canContinue = false
    }
  }

  // 6. 准确评估共鸣与属性
  const resonanceStatus = evaluateResonances(placedRelics, coreRelics)
  const totalStats = calculateTotalStats(placedRelics)
  const usedCellCount = placedRelics.reduce((sum, p) => sum + p.width * p.height, 0)
  const usedCounts = Object.fromEntries(usedCountMap.entries())

  return {
    success: true,
    placedRelics,
    boardMask,
    usedCellCount,
    totalOpenCount: openSet.size,
    fillRate: openSet.size > 0 ? (usedCellCount / openSet.size) : 0,
    activeResonances: resonanceStatus.active,
    unmetResonances: resonanceStatus.unmet,
    elementCounts: resonanceStatus.elementCounts,
    totalStats,
    usedCounts
  }
}

/**
 * 校验共鸣激活状态（严格遵循游戏源码 SpRelicPanel::CheckResonances 规则）：
 * 只有落在核心的十字共鸣范围（GetResonanceRangeCells）内的基础遗器才计入该核心的元素统计！
 */
export function evaluateResonances(placedRelics, coreRelics = []) {
  const active = []
  const unmet = []
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
        unmet.push({
          coreId: core.id,
          coreName: core.name,
          tag: res.tag,
          requirement: res.requirement,
          requirementParts: res.requirementParts,
          text: res.text,
          isMet: false
        })
      }
      continue
    }

    // 计算当前核心的十字能量范围
    const rangeCells = getCoreResonanceRangeCells(corePlaced)

    // 统计落在当前核心 rangeCells 内的基础遗器元素统计（对标源码 CalculateRelicCategoryStats）
    const categoryStats = {
      火属性: 0,
      水属性: 0,
      地属性: 0,
      风属性: 0
    }

    for (const cellKey of rangeCells) {
      const [cx, cy] = cellKey.split(',').map(Number)
      for (const base of placedBaseItems) {
        if (cx >= base.x && cx < base.x + base.width && cy >= base.y && cy < base.y + base.height) {
          if (base.relic?.categoryName && categoryStats[base.relic.categoryName] !== undefined) {
            categoryStats[base.relic.categoryName] += 1
          }
          break
        }
      }
    }

    // 逐项判定共鸣
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
      if (isMet) active.push(entry)
      else unmet.push(entry)
    }
  }

  return { active, unmet }
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

