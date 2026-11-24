<template>
  <div class="relic-simulator">
    <!-- 顶部控制面板 -->
    <div class="sim-ctrl">
      <!-- 格子与等级快速配置 -->
      <div class="sim-ctrl__section">
        <div class="sim-ctrl__header">
          <span class="sim-ctrl__title">法盘格子设定</span>
          <span class="sim-ctrl__badge">当前开启 <b>{{ openCells.size }}</b> / 52 格（点击棋盘格子可自定义点亮/锁定）</span>
        </div>
        <div class="sim-level-row">
          <div class="sim-level-slider-wrap">
            <label class="sim-level-label" for="fapanLevelSlider">法盘等级：<b>Lv.{{ fapanLevel }}</b></label>
            <input
              id="fapanLevelSlider"
              v-model.number="fapanLevel"
              type="range"
              min="1"
              max="30"
              step="1"
              class="sim-level-slider"
              @input="onLevelSliderChange"
            />
          </div>
          <div class="sim-btn-group">
            <button type="button" class="sim-btn" :class="{ 'is-active': fapanLevel === 30 && openCells.size === 52 }" @click="setLevelQuick(30)">满级全开 (52格)</button>
            <button type="button" class="sim-btn" :class="{ 'is-active': fapanLevel === 1 && openCells.size === 22 }" @click="setLevelQuick(1)">初始中心 (22格)</button>
            <button type="button" class="sim-btn sim-btn--subtle" @click="clearAllGrids">清空全盘</button>
          </div>
        </div>
      </div>

      <!-- 核心遗器选择 -->
      <div class="sim-ctrl__section">
        <div class="sim-ctrl__header">
          <span class="sim-ctrl__title">选择核心遗器（最多 4 种）</span>
          <span class="sim-ctrl__badge">已选 <b>{{ selectedCoreIds.length }}</b> / 4 种</span>
        </div>
        <div class="core-selector-grid">
          <div
            v-for="core in coreRelicOptions"
            :key="core.id"
            class="core-chip"
            :class="{ 'is-selected': selectedCoreIds.includes(core.id) }"
            @click="toggleCoreRelic(core.id)"
          >
            <img :src="getImageUrl(`/images/Common_ItemIcon/${core.icon}.webp`)" :alt="core.name" class="core-chip__icon" />
            <div class="core-chip__info">
              <span class="core-chip__name">{{ core.name }}</span>
              <span class="core-chip__shape">{{ core.shape.width }}×{{ core.shape.height }} 格</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 基础遗器拥有量与单品上限配置（我的遗器背包） -->
      <div class="sim-ctrl__section">
        <div class="sim-ctrl__header sim-ctrl__header--collapsible" @click="showInventory = !showInventory">
          <div class="sim-ctrl__title-wrap">
            <span class="sim-ctrl__title">基础遗器数量限制（根据实际拥有量搭配）</span>
            <span class="sim-ctrl__subtitle">限制单个遗器最大消耗，防止同种遗器放太多</span>
          </div>
          <button
            type="button"
            class="sim-ctrl__toggle-btn"
            :class="{ 'is-open': showInventory, 'has-badge': hasCustomInventoryCount }"
            :aria-expanded="showInventory"
            @click.stop="showInventory = !showInventory"
          >
            <span>
              {{ showInventory ? '收起库存面板' : '展开自定义拥有量' }}
              <template v-if="hasCustomInventoryCount">（已限制 {{ hasCustomInventoryCount }} 种）</template>
            </span>
            <svg class="sim-ctrl__toggle-chevron" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        </div>

        <!-- 快捷单品上限条 -->
        <div class="inventory-quick-bar">
          <span class="inventory-quick-label">全局限制：</span>
          <div class="sim-btn-group">
            <button
              type="button"
              class="sim-btn"
              :class="{ 'is-active': globalMaxCountPerRelic === 4 }"
              @click="setGlobalMaxCount(4)"
            >
              每种最多 4 件 (默认)
            </button>
            <button
              type="button"
              class="sim-btn"
              :class="{ 'is-active': globalMaxCountPerRelic === 3 }"
              @click="setGlobalMaxCount(3)"
            >
              每种最多 3 件
            </button>
            <button
              type="button"
              class="sim-btn"
              :class="{ 'is-active': globalMaxCountPerRelic === null }"
              @click="setGlobalMaxCount(null)"
            >
              不限制
            </button>
          </div>
        </div>

        <!-- 展开的各遗器精细拥有量控制面板 -->
        <div v-show="showInventory" class="inventory-panel">
          <div class="inventory-toolbar">
            <div class="inventory-filter-tabs">
              <span
                class="inv-tab"
                :class="{ 'is-active': inventoryFilterCat === 'all' }"
                @click="inventoryFilterCat = 'all'"
              >
                全部 ({{ baseRelics.length }})
              </span>
              <span
                v-for="cat in allCategoryNames"
                :key="cat"
                class="inv-tab"
                :class="{ 'is-active': inventoryFilterCat === cat }"
                @click="inventoryFilterCat = cat"
              >
                <img :src="getElementIconUrl(cat)" :alt="cat" class="inline-element-icon" />
                {{ cat }}
              </span>
            </div>
            <div class="inventory-batch-actions">
              <button type="button" class="sim-btn sim-btn--xs" @click="batchSetMaxCount(4)">全部设为 4</button>
              <button type="button" class="sim-btn sim-btn--xs" @click="batchSetMaxCount(3)">全部设为 3</button>
              <button type="button" class="sim-btn sim-btn--xs" @click="batchSetMaxCount(1)">全部设为 1</button>
              <button type="button" class="sim-btn sim-btn--xs sim-btn--subtle" @click="resetAllMaxCounts">重置数量</button>
            </div>
          </div>

          <div class="inventory-grid">
            <div
              v-for="relic in filteredBaseRelics"
              :key="relic.id"
              class="inv-card"
              :class="{
                'is-zero': getRelicMaxCount(relic.id) === 0,
                'is-placed': getRelicUsedCount(relic.id) > 0,
                'is-full': getRelicUsedCount(relic.id) > 0 && getRelicUsedCount(relic.id) >= getRelicMaxCount(relic.id)
              }"
            >
              <img
                :src="getImageUrl(`/images/Common_ItemIcon/${relic.icon}.webp`)"
                :alt="relic.name"
                class="inv-card__icon"
              />
              <div class="inv-card__main">
                <div class="inv-card__head">
                  <span class="inv-card__name">{{ relic.name }}</span>
                  <span class="inv-card__shape">{{ relic.shape.width }}×{{ relic.shape.height }}格</span>
                </div>
                <div class="inv-card__tags">
                  <span class="inv-attr-badge" :class="`element-${getElementClass(relic.categoryName)}`">
                    {{ relic.attributeName }}
                  </span>
                  <span class="inv-cat-badge">
                    <img :src="getElementIconUrl(relic.categoryName)" :alt="relic.categoryName" class="inline-element-icon" />
                    {{ relic.categoryName }}
                  </span>
                </div>
              </div>
              <div class="inv-card__stepper">
                <span class="inv-stepper-label">可用上限</span>
                <div class="inv-stepper-row">
                  <label
                    class="inv-required-check"
                    :class="{ 'is-checked': isRelicRequired(relic.id) }"
                    :title="isRelicRequired(relic.id) ? '已设为必选：自动搭配时必须包含该遗器' : '设为必选：自动搭配时必须包含该遗器'"
                  >
                    <input
                      type="checkbox"
                      class="inv-required-input"
                      :checked="isRelicRequired(relic.id)"
                      @change="toggleRelicRequired(relic.id)"
                    />
                    <span class="inv-required-box" aria-hidden="true">
                      <svg v-if="isRelicRequired(relic.id)" viewBox="0 0 14 14" class="inv-check-icon">
                        <path d="M2.5 7.2L5.5 10.2L11.5 3.8" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </span>
                    <span class="inv-required-text">必选</span>
                  </label>
                  <div class="stepper-ctrl">
                    <button
                      type="button"
                      class="stepper-btn"
                      :disabled="getRelicMaxCount(relic.id) <= 0"
                      @click="stepRelicMaxCount(relic.id, -1)"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      class="stepper-input"
                      :value="getRelicMaxCount(relic.id)"
                      @change="onStepperInputChange(relic.id, $event)"
                    />
                    <button
                      type="button"
                      class="stepper-btn"
                      @click="stepRelicMaxCount(relic.id, 1)"
                    >
                      +
                    </button>
                  </div>
                </div>
                <span class="inv-used-indicator">
                  已用: <b>{{ getRelicUsedCount(relic.id) }}</b> 件
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 属性与遗器过滤排除 -->
      <div class="sim-ctrl__section">
        <div class="sim-ctrl__header sim-ctrl__header--collapsible" @click="showFilters = !showFilters">
          <span class="sim-ctrl__title">属性与遗器排除过滤（不想要的属性打勾排除）</span>
          <button
            type="button"
            class="sim-ctrl__toggle-btn"
            :class="{ 'is-open': showFilters, 'has-badge': totalExcludedCount > 0 }"
            :aria-expanded="showFilters"
            @click.stop="showFilters = !showFilters"
          >
            <span>
              {{ showFilters ? '收起选项' : '展开选项' }}
              <template v-if="totalExcludedCount > 0">（已排除 {{ totalExcludedCount }} 项）</template>
            </span>
            <svg class="sim-ctrl__toggle-chevron" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        </div>
        <div v-show="showFilters" class="filter-options-wrap">
          <div class="filter-group">
            <span class="filter-group__label">排除属性：</span>
            <div class="filter-pills">
              <span
                v-for="stat in allStatNames"
                :key="stat"
                class="filter-pill"
                :class="{ 'is-excluded': excludedStats.includes(stat) }"
                @click="toggleExcludedStat(stat)"
              >
                {{ stat }}
              </span>
            </div>
          </div>
          <div v-if="excludedRelicIds.length" class="filter-group">
            <span class="filter-group__label">单件排除：</span>
            <div class="filter-pills">
              <span
                v-for="rid in excludedRelicIds"
                :key="rid"
                class="filter-pill is-excluded"
                @click="removeExcludedRelic(rid)"
              >
                {{ getRelicName(rid) }} ✕
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 求解触发与操作按钮 -->
      <div class="sim-action-row">
        <button type="button" class="sim-main-btn" @click="runAutoSolver">
          智能自动装配
        </button>
        <button type="button" class="sim-reset-btn" @click="resetPlacements">
          清空已放置
        </button>
        <div v-if="solutionNotice" class="sim-notice" :class="solutionNoticeType">
          {{ solutionNotice }}
        </div>
      </div>
    </div>

    <!-- 法盘主体展示区域（居中核心） -->
    <div class="board-stage-wrap">
      <div class="board-header">
        <div class="board-title-group">
          <span class="board-title">法盘 · 亚空回廊</span>
          <span class="board-desc">8 × 7 矩形八角盘（四角切角镂空 · 满级有效 52 格）</span>
        </div>
        <div class="board-stats-quick">
          <span class="quick-stat">已放置：<b>{{ solution?.usedCellCount || 0 }}</b> / {{ openCells.size }} 格</span>
          <span class="quick-stat">利用率：<b>{{ solution ? Math.round(solution.fillRate * 100) : 0 }}%</b></span>
        </div>
      </div>

      <!-- 8×7 法盘底板 + 跨格遗器 + SVG 共鸣光束 -->
      <div ref="boardRef" class="fapan-stage">
        <!-- 底层网格插槽（8×7，四角镂空，提供交互点击切换开/关） -->
        <div class="board-grid-slots" :style="{ '--cols': 8, '--rows': 7 }">
          <template v-for="y in 7" :key="`row-${y-1}`">
            <template v-for="x in 8" :key="`cell-${x-1}-${y-1}`">
              <div
                class="grid-slot"
                :class="{
                  'is-corner': isPermanentCorner(x - 1, y - 1),
                  'is-open': !isPermanentCorner(x - 1, y - 1) && openCells.has(`${x - 1},${y - 1}`),
                  'is-locked': !isPermanentCorner(x - 1, y - 1) && !openCells.has(`${x - 1},${y - 1}`),
                  'is-energy-range': activeEnergyRangeCells.has(`${x - 1},${y - 1}`)
                }"
                :title="getSlotTitle(x - 1, y - 1)"
                @click="onSlotClick(x - 1, y - 1)"
              >
                <span v-if="activeEnergyRangeCells.has(`${x - 1},${y - 1}`)" class="range-diamond-icon">✦</span>
              </div>
            </template>
          </template>
        </div>

        <!-- 上层遗器装配（跨格铺放） -->
        <div class="board-placed-layer" :style="{ '--cols': 8, '--rows': 7 }">
          <div
            v-for="(item, idx) in placedRelics"
            :key="`${item.relicId}-${idx}`"
            class="relic-block"
            :class="[
              `element-${getElementClass(item.relic?.categoryName, item.isCore)}`,
              { 'is-core': item.isCore, 'is-active-inspect': inspectingRelic?.relicId === item.relicId }
            ]"
            :style="{
              gridColumn: `${item.x + 1} / span ${item.width}`,
              gridRow: `${item.y + 1} / span ${item.height}`
            }"
            @click="inspectRelic(item)"
          >
            <span class="relic-block__roman">{{ getRomanLevel(item.level || 5) }}</span>
            <img
              :src="getBoardRelicImg(item.relic)"
              :alt="item.relic.name"
              class="relic-block__img"
              @error="handleBoardImgError($event, item.relic)"
            />
            <span class="relic-block__tag">{{ item.relic.name }}</span>
          </div>
        </div>

        <!-- SVG 炫彩共鸣发光光束层（轻盈通透微光） -->
        <svg v-if="resonanceBeams.length" class="board-beam-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <filter id="beamSoftGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" />
            </filter>
          </defs>
          <g v-for="(beam, bIdx) in resonanceBeams" :key="`beam-${bIdx}`">
            <!-- 柔和微光晕外层 -->
            <line
              :x1="beam.x1"
              :y1="beam.y1"
              :x2="beam.x2"
              :y2="beam.y2"
              :stroke="beam.color"
              stroke-width="1.8"
              stroke-linecap="round"
              opacity="0.28"
              filter="url(#beamSoftGlow)"
            />
            <!-- 核心细光束内层 -->
            <line
              :x1="beam.x1"
              :y1="beam.y1"
              :x2="beam.x2"
              :y2="beam.y2"
              :stroke="beam.color"
              stroke-width="0.75"
              stroke-linecap="round"
              opacity="0.45"
            />
          </g>
        </svg>
      </div>

      <!-- 选中遗器详情弹层/卡片 -->
      <div v-if="inspectingRelic" class="relic-inspect-bar">
        <div class="inspect-relic-left">
          <img :src="getImageUrl(`/images/Common_ItemIcon/${inspectingRelic.relic.icon}.webp`)" class="inspect-icon" />
          <div class="inspect-text">
            <div class="inspect-title-row">
              <span class="inspect-name">{{ inspectingRelic.relic.name }}</span>
              <span class="inspect-meta">（{{ inspectingRelic.width }}×{{ inspectingRelic.height }}格 · {{ inspectingRelic.relic.categoryName || '核心' }}）</span>
            </div>
            <p class="inspect-effect" v-html="formatRelicEffect(getRelicEffectText(inspectingRelic.relic, inspectingRelic.level || 5))"></p>
          </div>
        </div>
        <div class="inspect-actions">
          <button type="button" class="inspect-action-btn" @click="removePlacedRelic(inspectingRelic)">卸下此件</button>
          <button v-if="!inspectingRelic.isCore" type="button" class="inspect-action-btn inspect-action-btn--warn" @click="excludeThisRelic(inspectingRelic.relic.id)">排除此件</button>
          <button type="button" class="inspect-action-btn inspect-action-btn--close" @click="inspectingRelic = null">关闭 ✕</button>
        </div>
      </div>
    </div>

    <!-- 底部收益面板：共鸣达成清单 + 全局属性合计 -->
    <div class="sim-summary">
      <!-- 共鸣激活清单 -->
      <div class="summary-section">
        <h4 class="summary-title">核心共鸣达成情况</h4>
        <div v-if="allResonanceStatus.length" class="resonance-list">
          <div
            v-for="(res, rIdx) in allResonanceStatus"
            :key="`res-${rIdx}`"
            class="res-item"
            :class="{ 'is-met': res.isMet }"
          >
            <span class="res-item__status">{{ res.isMet ? '已激活' : '未达成' }}</span>
            <div class="res-item__content">
              <div class="res-item__head">
                <span class="res-item__core-name">[{{ res.coreName }}]</span>
                <div class="resonance-req-badges">
                  <span
                    v-for="part in (res.requirementParts || parseRequirementParts(res.requirement))"
                    :key="part.categoryName"
                    class="resonance-req-badge"
                  >
                    <img :src="getElementIconUrl(part.categoryName)" :alt="part.categoryName" class="resonance-req-icon" />
                    <span class="resonance-req-num">×{{ part.count }}</span>
                  </span>
                </div>
              </div>
              <span class="res-item__desc" v-html="formatRelicEffect(res.text)"></span>
            </div>
          </div>
        </div>
        <p v-else class="summary-empty">未选择核心遗器或暂无共鸣需求。</p>
      </div>

      <!-- 全局加成汇总 -->
      <div class="summary-section">
        <h4 class="summary-title">全局属性收益汇总</h4>
        <div v-if="solution?.totalStats?.length" class="stats-cloud">
          <div v-for="stat in solution.totalStats" :key="stat.name" class="stat-badge">
            <span class="stat-badge__name">{{ stat.name }}</span>
            <span class="stat-badge__val">+{{ stat.value }}{{ stat.name.includes('率') || stat.name.includes('伤害') || stat.name.includes('加成') || stat.name.includes('缩减') || stat.name.includes('攻击') ? '%' : '' }}</span>
            <span class="stat-badge__count">({{ stat.count }}件)</span>
          </div>
        </div>
        <p v-else class="summary-empty">法盘上暂未放置提供基础属性的遗器。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { getImageUrl } from '../../utils/env.js'
import {
  isPermanentCorner,
  getCoreResonanceRangeCells,
  getDefaultOpenGridSet,
  solveFapanPlacement,
  evaluateResonances,
  parseRequirementParts,
  getElementSlug,
  formatRelicEffect
} from '../../utils/relicSolver.js'

const props = defineProps({
  relics: {
    type: Array,
    default: () => []
  },
  fapan: {
    type: Array,
    default: () => []
  },
  dungeons: {
    type: Array,
    default: () => []
  }
})

// 棋盘格位状态
const fapanLevel = ref(30)
const openCells = ref(new Set())
const boardRef = ref(null)

// 选定核心与过滤配置
const selectedCoreIds = ref(['core_107', 'core_102', 'core_104', 'core_103']) // 默认选雷鸣杖冠、涓流长卷、虚空圣杯、圣辉御盾
const excludedStats = ref([])
const excludedRelicIds = ref([])
const showFilters = ref(false)

// 基础遗器库存、必选与数量上限配置
const globalMaxCountPerRelic = ref(4) // 全局单品上限（默认每种最多 4 件）
const relicMaxCounts = ref({}) // 单个遗器限制 { [relicId]: number }
const requiredRelicIds = ref([]) // 勾选必选的基础遗器列表
const showInventory = ref(false)
const inventoryFilterCat = ref('all')

// 放置结果
const solution = ref(null)
const inspectingRelic = ref(null)
const solutionNotice = ref('')
const solutionNoticeType = ref('is-info')

// 基础选项提取
const coreRelicOptions = computed(() => {
  return props.relics.filter(r => r.type === 'core')
})

const baseRelics = computed(() => {
  return props.relics.filter(r => r.type === 'base')
})

const filteredBaseRelics = computed(() => {
  if (inventoryFilterCat.value === 'all') return baseRelics.value
  return baseRelics.value.filter(r => r.categoryName === inventoryFilterCat.value)
})

const hasCustomInventoryCount = computed(() => {
  return Object.keys(relicMaxCounts.value).length
})

const STAT_DISPLAY_ORDER = [
  '物理攻击',
  '魔法攻击',
  '物理穿透',
  '魔法穿透',
  '火属性伤害',
  '水属性伤害',
  '地属性伤害',
  '风属性伤害',
  '暴击率',
  '暴击伤害',
  '攻速加成',
  '冷却缩减',
  '生命值',
  '法力值',
  '物理防御',
  '魔法防御',
  '物理伤害减免',
  '魔法伤害减免',
  '暴击抗性',
  '移速加成',
]

const allStatNames = computed(() => {
  const set = new Set()
  for (const r of props.relics) {
    if (r.type === 'base' && r.attributeName) set.add(r.attributeName)
  }
  return Array.from(set).sort((a, b) => {
    const ia = STAT_DISPLAY_ORDER.indexOf(a)
    const ib = STAT_DISPLAY_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b, 'zh-CN')
  })
})

const allCategoryNames = ['火属性', '水属性', '地属性', '风属性']

const totalExcludedCount = computed(() => {
  return excludedStats.value.length + excludedRelicIds.value.length
})

const placedRelics = computed(() => solution.value?.placedRelics || [])

// 所有选定核心的共鸣达标状态（同一核心的词条按核心聚合在一起展示）
const allResonanceStatus = computed(() => {
  if (!solution.value) {
    const selectedCores = coreRelicOptions.value.filter(c => selectedCoreIds.value.includes(c.id))
    return evaluateResonances([], selectedCores).all
  }
  return solution.value.allResonances || [...solution.value.activeResonances, ...solution.value.unmetResonances]
})

// 初始化与等级切换
function initBoardGrids() {
  const fCells = props.fapan[0]?.cells || []
  openCells.value = getDefaultOpenGridSet(fapanLevel.value, fCells)
}

function onLevelSliderChange() {
  initBoardGrids()
  runAutoSolver()
}

function setLevelQuick(lv) {
  fapanLevel.value = lv
  initBoardGrids()
  runAutoSolver()
}

function clearAllGrids() {
  openCells.value.clear()
  resetPlacements()
}

function onSlotClick(x, y) {
  if (isPermanentCorner(x, y)) return
  const key = `${x},${y}`
  if (openCells.value.has(key)) {
    openCells.value.delete(key)
    // 移除落在该格子上的遗器
    if (solution.value?.placedRelics) {
      solution.value.placedRelics = solution.value.placedRelics.filter(p => {
        const inX = x >= p.x && x < p.x + p.width
        const inY = y >= p.y && y < p.y + p.height
        return !(inX && inY)
      })
    }
  } else {
    openCells.value.add(key)
  }
}

function getSlotTitle(x, y) {
  if (isPermanentCorner(x, y)) return '永久隐藏切角（不可用）'
  const key = `${x},${y}`
  return openCells.value.has(key) ? `已开启可用 (${x}, ${y}) · 点击可锁定` : `未开启锁定 (${x}, ${y}) · 点击可开启`
}

// 核心遗器选择
function toggleCoreRelic(id) {
  const idx = selectedCoreIds.value.indexOf(id)
  if (idx >= 0) {
    selectedCoreIds.value.splice(idx, 1)
  } else {
    if (selectedCoreIds.value.length >= 4) {
      solutionNotice.value = '核心遗器同场最多只能放置 4 种！'
      solutionNoticeType.value = 'is-warn'
      return
    }
    selectedCoreIds.value.push(id)
  }
  runAutoSolver()
}

// 排除过滤
function toggleExcludedStat(stat) {
  const idx = excludedStats.value.indexOf(stat)
  if (idx >= 0) excludedStats.value.splice(idx, 1)
  else excludedStats.value.push(stat)
  runAutoSolver()
}

function removeExcludedRelic(rid) {
  excludedRelicIds.value = excludedRelicIds.value.filter(id => id !== rid)
  runAutoSolver()
}

function getRelicName(rid) {
  return props.relics.find(r => r.id === rid)?.name || rid
}

// 基础遗器库存、必选与数量上限方法
function isRelicRequired(id) {
  return requiredRelicIds.value.includes(id)
}

function toggleRelicRequired(id) {
  const idx = requiredRelicIds.value.indexOf(id)
  if (idx >= 0) {
    requiredRelicIds.value.splice(idx, 1)
  } else {
    requiredRelicIds.value.push(id)
    // 设为必选时，若当前可用上限为 0，自动提升为至少 1
    if (getRelicMaxCount(id) <= 0) {
      relicMaxCounts.value = { ...relicMaxCounts.value, [id]: 1 }
    }
  }
  runAutoSolver()
}

function getRelicMaxCount(id) {
  if (relicMaxCounts.value[id] !== undefined) {
    return relicMaxCounts.value[id]
  }
  if (typeof globalMaxCountPerRelic.value === 'number') {
    return globalMaxCountPerRelic.value
  }
  return 99
}

function setGlobalMaxCount(val) {
  globalMaxCountPerRelic.value = val
  relicMaxCounts.value = {}
  runAutoSolver()
}

function stepRelicMaxCount(id, delta) {
  const current = getRelicMaxCount(id)
  const next = Math.max(0, Math.min(99, current + delta))
  relicMaxCounts.value = { ...relicMaxCounts.value, [id]: next }
  // 上限设为 0 时自动取消必选
  if (next <= 0 && isRelicRequired(id)) {
    requiredRelicIds.value = requiredRelicIds.value.filter(rid => rid !== id)
  }
  runAutoSolver()
}

function onStepperInputChange(id, event) {
  const val = parseInt(event.target.value, 10)
  const validVal = isNaN(val) ? 0 : Math.max(0, Math.min(99, val))
  relicMaxCounts.value = { ...relicMaxCounts.value, [id]: validVal }
  // 上限设为 0 时自动取消必选
  if (validVal <= 0 && isRelicRequired(id)) {
    requiredRelicIds.value = requiredRelicIds.value.filter(rid => rid !== id)
  }
  runAutoSolver()
}

function batchSetMaxCount(val) {
  const next = {}
  for (const r of baseRelics.value) {
    next[r.id] = val
  }
  relicMaxCounts.value = next
  globalMaxCountPerRelic.value = val
  if (val <= 0) {
    requiredRelicIds.value = []
  }
  runAutoSolver()
}

function resetAllMaxCounts() {
  relicMaxCounts.value = {}
  globalMaxCountPerRelic.value = 4
  requiredRelicIds.value = []
  runAutoSolver()
}

function getRelicUsedCount(id) {
  if (!solution.value?.placedRelics) return 0
  return solution.value.placedRelics.filter(p => p.relicId === id).length
}

// 求解器驱动
function runAutoSolver() {
  if (!openCells.value.size) {
    solutionNotice.value = '当前未开启任何法盘格子，请先点击开启格子！'
    solutionNoticeType.value = 'is-warn'
    solution.value = null
    return
  }

  const res = solveFapanPlacement({
    openCells: openCells.value,
    selectedCoreIds: selectedCoreIds.value,
    excludedStats: excludedStats.value,
    excludedCategories: [],
    excludedRelicIds: excludedRelicIds.value,
    requiredRelicIds: requiredRelicIds.value,
    relicMaxCounts: relicMaxCounts.value,
    globalMaxCountPerRelic: globalMaxCountPerRelic.value,
    allRelics: props.relics
  })

  solution.value = res
  if (res.placedRelics.length === 0) {
    solutionNotice.value = '在当前开启格子与过滤条件下，未能放置任何遗器。'
    solutionNoticeType.value = 'is-warn'
  } else {
    const isLimited = globalMaxCountPerRelic.value !== null || hasCustomInventoryCount.value > 0
    const limitTip = (isLimited && res.fillRate < 0.98) ? '（受单品数量上限约束未填满空余格）' : ''
    const reqTip = (res.missingRequiredRelicIds && res.missingRequiredRelicIds.length)
      ? '，部分必选遗器因空间不足未能放置'
      : (requiredRelicIds.value.length ? '，已满足所有勾选必选' : '')
    solutionNotice.value = `装配完成！共放置 ${res.placedRelics.length} 件遗器，激活 ${res.activeResonances.length} 条共鸣，格子利用率 ${Math.round(res.fillRate * 100)}%${limitTip}${reqTip}`
    solutionNoticeType.value = 'is-success'
  }
}

function resetPlacements() {
  if (solution.value) {
    solution.value.placedRelics = []
    solution.value.usedCellCount = 0
    solution.value.fillRate = 0
    solution.value.activeResonances = []
    solution.value.totalStats = []
  }
  inspectingRelic.value = null
  solutionNotice.value = '已清空法盘装配。'
  solutionNoticeType.value = 'is-info'
}

// 遗器检视与单件操作
function inspectRelic(item) {
  inspectingRelic.value = item
}

function removePlacedRelic(target) {
  if (!solution.value) return
  solution.value.placedRelics = solution.value.placedRelics.filter(p => p !== target)
  inspectingRelic.value = null
}

function excludeThisRelic(relicId) {
  if (!excludedRelicIds.value.includes(relicId)) {
    excludedRelicIds.value.push(relicId)
  }
  inspectingRelic.value = null
  runAutoSolver()
}

function getRelicEffectText(relic, lv = 5) {
  return relic.levels?.[lv - 1]?.text || relic.desc || relic.tip || ''
}

// 视觉样式辅助
function getElementIconUrl(catName) {
  const slug = getElementSlug(catName)
  return slug ? getImageUrl(`/images/relics/relic_atr_${slug}.webp`) : ''
}

function getElementClass(catName, isCore = false) {
  if (isCore) return 'core'
  switch (catName) {
    case '火属性': return 'fire'
    case '水属性': return 'water'
    case '地属性': return 'earth'
    case '风属性': return 'wind'
    default: return 'core'
  }
}

const getBoardRelicImg = (relic) => {
  if (!relic?.id) return ''
  return getImageUrl(`/images/relics/board/${relic.id}.webp`)
}

const handleBoardImgError = (event, relic) => {
  if (!relic || !event?.target) return
  const fallback = getImageUrl(`/images/Common_ItemIcon/${relic.icon}.webp`)
  if (event.target.src !== fallback) {
    event.target.src = fallback
  }
}

function getRomanLevel(lv) {
  const roman = ['I', 'II', 'III', 'IV', 'V']
  return roman[lv - 1] || 'I'
}

// 当前生效的核心十字共鸣能量范围 (Set<"x,y">)
const activeEnergyRangeCells = computed(() => {
  const set = new Set()
  const cores = placedRelics.value.filter(p => p.isCore)
  const targetCores = inspectingRelic.value?.isCore ? [inspectingRelic.value] : cores
  for (const c of targetCores) {
    const range = getCoreResonanceRangeCells(c)
    for (const k of range) {
      if (openCells.value.has(k)) {
        set.add(k)
      }
    }
  }
  return set
})

// 计算共鸣发光光束坐标 (0..100 SVG 百分比坐标，柔和淡雅连线，严格仅限十字能量范围内)
const resonanceBeams = computed(() => {
  if (!solution.value || !solution.value.placedRelics) return []
  const beams = []
  const placed = solution.value.placedRelics
  const cores = placed.filter(p => p.isCore)
  const bases = placed.filter(p => !p.isCore)

  for (const core of cores) {
    const cx1 = ((core.x + core.width / 2) / 8) * 100
    const cy1 = ((core.y + core.height / 2) / 7) * 100

    // 计算当前核心的十字能量范围
    const coreRangeCells = getCoreResonanceRangeCells(core)

    // 统计各元素所需满足的最大配额
    const neededCounts = {}
    for (const res of (core.relic.resonances || [])) {
      for (const part of (res.requirementParts || [])) {
        neededCounts[part.categoryName] = Math.max(neededCounts[part.categoryName] || 0, part.count || 0)
      }
    }

    // 针对每个需要共鸣的元素，严格仅连接落在当前核心十字能量范围内的基础遗器
    const connectedBases = new Set()
    for (const [elementName, neededCount] of Object.entries(neededCounts)) {
      if (neededCount <= 0) continue

      const inRangeBases = bases.filter(b => {
        if (b.relic?.categoryName !== elementName || connectedBases.has(b)) return false
        for (let dy = 0; dy < b.height; dy += 1) {
          for (let dx = 0; dx < b.width; dx += 1) {
            if (coreRangeCells.has(`${b.x + dx},${b.y + dy}`)) return true
          }
        }
        return false
      })

      const candidates = inRangeBases
        .map(b => {
          const bx = ((b.x + b.width / 2) / 8) * 100
          const by = ((b.y + b.height / 2) / 7) * 100
          const dist = Math.hypot(bx - cx1, by - cy1)
          return { base: b, dist, bx, by }
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, neededCount)

      let color = '#ffd666'
      if (elementName === '火属性') color = '#ff7875'
      else if (elementName === '水属性') color = '#69c0ff'
      else if (elementName === '地属性') color = '#ffd666'
      else if (elementName === '风属性') color = '#95de64'

      for (const item of candidates) {
        connectedBases.add(item.base)
        beams.push({
          x1: cx1,
          y1: cy1,
          x2: item.bx,
          y2: item.by,
          color
        })
      }
    }
  }
  return beams
})

onMounted(() => {
  initBoardGrids()
  runAutoSolver()
})
</script>

<style scoped>
.relic-simulator {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

/* 控制面板 */
.sim-ctrl {
  padding: 16px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
}
.sim-ctrl__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--border-soft, rgba(0,0,0,0.1));
}
.sim-ctrl__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.sim-ctrl__header--collapsible {
  cursor: pointer;
  user-select: none;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px 12px;
}
.sim-ctrl__header--collapsible > .sim-ctrl__title,
.sim-ctrl__header--collapsible > .sim-ctrl__title-wrap {
  flex: 1 1 0%;
  min-width: 0;
}
.sim-ctrl__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #333);
}
.sim-ctrl__badge {
  font-size: 12px;
  color: var(--text-muted, #777);
}
.sim-ctrl__badge b {
  color: var(--accent-ink, #557574);
}
.sim-ctrl__toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--rb-toggle-border, rgba(85, 117, 116, 0.38));
  background: var(--rb-toggle-bg, rgba(85, 117, 116, 0.1));
  color: var(--rb-toggle-color, var(--accent-ink, #3f6160));
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.sim-ctrl__toggle-btn:hover {
  background: var(--rb-toggle-hover-bg, rgba(85, 117, 116, 0.18));
  border-color: var(--rb-toggle-hover-border, rgba(85, 117, 116, 0.58));
}
.sim-ctrl__toggle-btn.is-open {
  background: var(--rb-active-bg, #557574);
  color: var(--rb-active-color, #fff);
  border-color: var(--rb-active-border, #557574);
}
.sim-ctrl__toggle-btn.has-badge:not(.is-open) {
  background: var(--rb-toggle-hover-bg, rgba(85, 117, 116, 0.16));
  border-color: var(--rb-toggle-hover-border, var(--accent-ink, #557574));
}
.sim-ctrl__toggle-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform 0.18s ease;
}
.sim-ctrl__toggle-btn.is-open .sim-ctrl__toggle-chevron {
  transform: rotate(180deg);
}

/* 等级滑块与快速预设 */
.sim-level-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sim-level-slider-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 280px;
}
.sim-level-label {
  font-size: 13px;
  white-space: nowrap;
}
.sim-level-slider {
  flex: 1;
  background: transparent;
  accent-color: var(--rb-slider-accent, #557574);
  cursor: pointer;
}
.sim-btn-group {
  display: flex;
  gap: 6px;
}
.sim-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--border-soft, #ddd);
  background: var(--paper-solid, #fff);
  color: var(--text-main, #333);
  cursor: pointer;
  transition: all 0.15s ease;
}
.sim-btn.is-active {
  background: var(--rb-active-bg, #557574);
  color: var(--rb-active-color, #fff);
  border-color: var(--rb-active-border, #557574);
}
.sim-btn--subtle {
  color: var(--text-muted, #888);
}

/* 核心遗器选择卡片网格 */
.core-selector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}
.core-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--border-soft, #ddd);
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.core-chip:hover {
  background: rgba(0, 0, 0, 0.06);
}
.core-chip.is-selected {
  background: rgba(184, 134, 11, 0.15);
  border-color: #d4af37;
  box-shadow: 0 0 0 1px #d4af37;
}
.core-chip__icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.core-chip__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.core-chip__name {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.core-chip__shape {
  font-size: 10.5px;
  color: var(--text-muted, #777);
}

.sim-ctrl__title-wrap {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.sim-ctrl__subtitle {
  font-size: 12px;
  font-weight: normal;
  color: var(--text-muted, #777);
}

/* 基础遗器库存快捷与详情面板 */
.inventory-quick-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.inventory-quick-label {
  font-size: 12px;
  color: var(--text-muted, #555);
  white-space: nowrap;
}
.inventory-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.025);
  border-radius: 6px;
  border: 1px solid var(--border-soft, #e2d9cb);
}
.inventory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.inventory-filter-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.inv-tab {
  font-size: 11.5px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--paper-solid, #fff);
  border: 1px solid var(--border-soft, #ddd);
  color: var(--text-muted, #555);
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.inv-tab:hover {
  border-color: var(--accent-ink, #557574);
}
.inv-tab.is-active {
  background: var(--rb-active-bg, #557574);
  color: var(--rb-active-color, #fff);
  border-color: var(--rb-active-border, #557574);
}
.inventory-batch-actions {
  display: flex;
  gap: 6px;
}
.sim-btn--xs {
  font-size: 11px;
  padding: 2px 7px;
}
.inventory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
  max-height: 380px;
  overflow-y: auto;
  padding-right: 4px;
}
.inv-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--paper-solid, #fff);
  border: 1px solid var(--border-soft, #ddd);
  border-radius: 6px;
  transition: all 0.15s ease;
}
.inv-card.is-placed {
  border-color: #d4af37;
  background: rgba(212, 175, 55, 0.05);
}
.inv-card.is-full {
  border-color: #b8860b;
}
.inv-card.is-zero {
  opacity: 0.55;
  filter: grayscale(0.6);
  background: rgba(0, 0, 0, 0.02);
}
.inv-card__icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
}
.inv-card__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.inv-card__head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.inv-card__name {
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-main, #333);
}
.inv-card__shape {
  font-size: 10px;
  color: var(--text-muted, #888);
  white-space: nowrap;
}
.inv-card__tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.inv-attr-badge {
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.05);
}
.inv-attr-badge.element-fire {
  color: #c93b2b;
  background: rgba(201, 59, 43, 0.1);
}
.inv-attr-badge.element-water {
  color: #1976d2;
  background: rgba(25, 118, 210, 0.1);
}
.inv-attr-badge.element-earth {
  color: #b8860b;
  background: rgba(184, 134, 11, 0.1);
}
.inv-attr-badge.element-wind {
  color: #2e7d32;
  background: rgba(46, 125, 50, 0.1);
}
.inv-cat-badge {
  font-size: 10px;
  color: var(--text-muted, #777);
}
.inv-card__stepper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
}
.inv-stepper-label {
  font-size: 10px;
  color: var(--text-muted, #888);
}
.inv-stepper-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.inv-required-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  user-select: none;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}
.inv-required-check:hover {
  background: rgba(143, 115, 81, 0.12);
}
.inv-required-check.is-checked {
  background: rgba(35, 73, 68, 0.1);
  border-color: rgba(35, 73, 68, 0.3);
}
.inv-required-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.inv-required-box {
  width: 18px;
  height: 18px;
  border: 1.8px solid var(--border-color, #8f7351);
  border-radius: 4px;
  background: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}
.inv-required-check:hover .inv-required-box {
  border-color: var(--accent-ink, #234944);
}
.inv-required-check.is-checked .inv-required-box {
  background: var(--accent-ink, #234944);
  border-color: var(--accent-ink, #234944);
  box-shadow: 0 1px 3px rgba(35, 73, 68, 0.35);
}
.inv-check-icon {
  width: 12px;
  height: 12px;
  display: block;
}
.inv-required-text {
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
  color: var(--text-muted, #6b5134);
  letter-spacing: 0.5px;
  transition: color 0.15s ease, font-weight 0.15s ease;
}
.inv-required-check.is-checked .inv-required-text {
  color: var(--accent-ink, #234944);
  font-weight: 700;
}
.dark-mode .inv-required-check:hover,
.dark-theme .inv-required-check:hover {
  background: rgba(212, 163, 89, 0.1);
}
.dark-mode .inv-required-check.is-checked,
.dark-theme .inv-required-check.is-checked {
  background: rgba(85, 135, 129, 0.15);
  border-color: rgba(127, 174, 169, 0.4);
}
.dark-mode .inv-required-box,
.dark-theme .inv-required-box {
  background: rgba(30, 22, 14, 0.9);
  border-color: #8c6a46;
}
.dark-mode .inv-required-check.is-checked .inv-required-box,
.dark-theme .inv-required-check.is-checked .inv-required-box {
  background: #3e6863;
  border-color: #7faea9;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}
.dark-mode .inv-required-text,
.dark-theme .inv-required-text {
  color: #c4ab89;
}
.dark-mode .inv-required-check.is-checked .inv-required-text,
.dark-theme .inv-required-check.is-checked .inv-required-text {
  color: #ffd78c;
}
.stepper-ctrl {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 4px;
  overflow: hidden;
  background: var(--paper-soft, #e9dcc3);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.stepper-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: linear-gradient(180deg, var(--paper-soft, #f0e3c6), var(--paper-dark, #bba282));
  color: var(--text-main, #3e2a14);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  transition: all 0.15s ease;
}
.stepper-btn:hover:not(:disabled) {
  background: var(--accent-ink, #2f4a49);
  color: #fff;
}
.stepper-btn:active:not(:disabled) {
  transform: scale(0.92);
}
.stepper-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(1);
}
.stepper-input {
  width: 34px;
  height: 24px;
  padding: 0;
  margin: 0;
  border: none;
  border-left: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  border-right: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  background: var(--paper-solid, #f3ead5);
  color: var(--text-main, #3e2a14);
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  outline: none;
  box-sizing: border-box;
  -moz-appearance: textfield;
  appearance: textfield;
}
.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.inv-used-indicator {
  font-size: 10px;
  color: var(--text-muted, #777);
}
.inv-used-indicator b {
  color: var(--accent-ink, #557574);
}
.inv-card.is-full .inv-used-indicator b {
  color: #b8860b;
}

/* 过滤选项 */
.filter-options-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}
.filter-group {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.filter-group__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted, #666);
  white-space: nowrap;
  flex: 0 0 65px;
}
.filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.filter-pill {
  padding: 2px 8px;
  font-size: 11.5px;
  border-radius: 4px;
  border: 1px solid var(--border-soft, #ddd);
  background: var(--paper-solid, #fff);
  color: var(--text-main, #333);
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.filter-pill.is-excluded {
  background: rgba(180, 40, 40, 0.12);
  color: #b32d2e;
  border-color: rgba(180, 40, 40, 0.4);
  text-decoration: line-through;
}

/* 操作行 */
.sim-action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}
.sim-main-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 700;
  background: var(--rb-active-bg, #557574);
  color: var(--rb-active-color, #fff);
  border: 1px solid var(--rb-active-border, transparent);
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  transition: all 0.15s ease;
}
.sim-main-btn:hover {
  filter: brightness(1.1);
}
.sim-reset-btn {
  padding: 8px 14px;
  font-size: 13px;
  border: 1px solid var(--border-soft, #ddd);
  background: var(--paper-solid, #fff);
  color: var(--text-muted, #666);
  border-radius: 6px;
  cursor: pointer;
}
.sim-notice {
  font-size: 12.5px;
  font-weight: 600;
}
.sim-notice.is-success { color: var(--rb-success-color, #2e7d32); }
.sim-notice.is-warn { color: var(--rb-warn-color, #d32f2f); }
.sim-notice.is-info { color: var(--text-muted, #666); }

/* 法盘主舞台 */
.board-stage-wrap {
  padding: 20px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: radial-gradient(circle at center, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.08) 100%), var(--paper-soft);
  border: 1px solid var(--border-soft);
}
.board-header {
  width: 100%;
  max-width: 580px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.board-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main, #333);
}
.board-desc {
  font-size: 11.5px;
  color: var(--text-muted, #777);
  display: block;
}
.board-stats-quick {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted, #666);
}
.board-stats-quick b {
  color: var(--accent-ink, #557574);
}

/* 棋盘容器（8×7 比例，带切角遮罩与石质外框） */
.fapan-stage {
  position: relative;
  width: 100%;
  max-width: 540px;
  aspect-ratio: 8 / 7;
  background: #252321;
  border: 6px solid #4a453f;
  border-radius: 12px;
  box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  user-select: none;
}

/* 底层槽位 */
.board-grid-slots {
  position: absolute;
  inset: 6px;
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: 4px;
}
.grid-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
  cursor: pointer;
}
.grid-slot.is-corner {
  visibility: hidden !important;
  pointer-events: none !important;
}
.grid-slot.is-open {
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.18);
}
.grid-slot.is-open:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.35);
}
.grid-slot.is-locked {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(0, 0, 0, 0.7);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
}
.grid-slot.is-locked:hover {
  background: rgba(0, 0, 0, 0.35);
}
.grid-slot.is-energy-range {
  border: 1.5px solid rgba(240, 145, 30, 0.75) !important;
  background: rgba(230, 120, 20, 0.12) !important;
  box-shadow: inset 0 0 6px rgba(240, 140, 20, 0.25);
}
.range-diamond-icon {
  font-size: 13px;
  color: #ffaa33;
  opacity: 0.9;
  text-shadow: 0 0 6px rgba(255, 170, 50, 0.9);
  pointer-events: none;
  line-height: 1;
}
.lock-icon {
  font-size: 10px;
  opacity: 0.35;
}

/* 上层遗器装配网格 */
.board-placed-layer {
  position: absolute;
  inset: 6px;
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: 4px;
  pointer-events: none; /* 让空隙点击穿透到底层 slot */
}

/* 单个放置的遗器块 */
.relic-block {
  pointer-events: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), inset 0 0 4px rgba(255, 255, 255, 0.2);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.relic-block:hover {
  transform: scale(0.98);
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}
.relic-block.is-active-inspect {
  outline: 2px solid #fff;
  transform: scale(0.98);
}

/* 元素主题颜色 */
.relic-block.element-fire {
  background: linear-gradient(135deg, rgba(140, 30, 20, 0.88), rgba(65, 12, 10, 0.95));
  border: 1.5px solid #e74c3c;
}
.relic-block.element-water {
  background: linear-gradient(135deg, rgba(20, 80, 140, 0.88), rgba(10, 40, 75, 0.95));
  border: 1.5px solid #3498db;
}
.relic-block.element-earth {
  background: linear-gradient(135deg, rgba(130, 85, 35, 0.88), rgba(65, 42, 18, 0.95));
  border: 1.5px solid #d38b28;
}
.relic-block.element-wind {
  background: linear-gradient(135deg, rgba(30, 110, 55, 0.88), rgba(15, 55, 28, 0.95));
  border: 1.5px solid #2ecc71;
}
.relic-block.is-core {
  background: linear-gradient(135deg, rgba(160, 115, 25, 0.92), rgba(75, 50, 10, 0.98)) !important;
  border: 2px solid #ffd700 !important;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.4), inset 0 0 8px rgba(255, 215, 0, 0.3);
}

/* 遗器图片与标识 */
.relic-block__img {
  width: auto;
  height: auto;
  max-width: 88%;
  max-height: 86%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.65));
  pointer-events: none;
}
.relic-block__roman {
  position: absolute;
  top: 2px;
  left: 5px;
  font-family: 'Times New Roman', Times, serif, system-ui;
  font-size: 13px;
  font-weight: 700;
  color: #fce6a2;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.95), 0 0 3px rgba(0, 0, 0, 0.9);
  pointer-events: none;
  z-index: 2;
  line-height: 1;
}
.relic-block__tag {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.88);
  text-shadow: 0 1px 2px #000, 0 0 3px #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90%;
  pointer-events: none;
  z-index: 2;
}

/* SVG 光束连线层 */
.board-beam-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  mix-blend-mode: screen;
  opacity: 0.8;
}

/* 检视条 */
.relic-inspect-bar {
  width: 100%;
  max-width: 540px;
  padding: 10px 14px;
  background: var(--paper-solid, #fff);
  border: 1px solid var(--border-soft, #ddd);
  border-radius: 6px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.inspect-relic-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 280px;
}
.inspect-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.inspect-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.inspect-title-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.inspect-name {
  font-size: 13.5px;
  font-weight: 700;
}
.inspect-meta {
  font-size: 11.5px;
  color: var(--text-muted, #777);
}
.inspect-effect {
  margin: 0;
  font-size: 12px;
  color: var(--text-main, #333);
}
.inspect-actions {
  display: flex;
  gap: 6px;
}
.inspect-action-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--border-soft, #ddd);
  background: var(--paper-solid, #fff);
  cursor: pointer;
}
.inspect-action-btn--warn {
  color: #b32d2e;
  border-color: rgba(179, 45, 46, 0.4);
}
.inspect-action-btn--close {
  color: var(--text-muted, #888);
}

/* 底部收益面板 */
.sim-summary {
  padding: 16px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
}
.summary-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #333);
}
.summary-empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted, #888);
}

/* 共鸣条目 */
.resonance-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.res-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.03);
  border-left: 3px solid #999;
}
.res-item.is-met {
  background: rgba(46, 125, 50, 0.08);
  border-left-color: #2e7d32;
}
.res-item__status {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  color: #888;
}
.res-item.is-met .res-item__status {
  color: var(--rb-success-color, #2e7d32);
}
.res-item__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.res-item__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-main, #333);
}
.res-item__core-name {
  font-weight: 700;
}
.resonance-req-badges {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.resonance-req-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 0;
  line-height: 1;
}
:root[data-theme='dark'] .resonance-req-badge,
.dark-mode .resonance-req-badge {
  background: none;
  border: none;
}
.resonance-req-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  vertical-align: middle;
}
.resonance-req-num {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #333);
}
:root[data-theme='dark'] .resonance-req-num,
.dark-mode .resonance-req-num {
  color: #eee;
}
.inline-element-icon {
  width: 17px;
  height: 17px;
  object-fit: contain;
  vertical-align: -3px;
  margin-right: 3px;
}
.relic-num-hl {
  color: #c86400;
  font-weight: 700;
}
:root[data-theme='dark'] .relic-num-hl,
.dark-mode .relic-num-hl {
  color: #ff9800;
}
.res-item__desc {
  font-size: 12px;
  color: var(--text-muted, #666);
}

/* 词条属性云 */
.stats-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.stat-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(85, 117, 116, 0.08);
  border: 1px solid rgba(85, 117, 116, 0.25);
}
.stat-badge__name {
  font-size: 12.5px;
  color: var(--text-muted, #555);
}
.stat-badge__val {
  font-size: 14px;
  font-weight: 800;
  color: var(--accent-ink, #557574);
}
.stat-badge__count {
  font-size: 11px;
  color: var(--text-muted, #888);
}

@media (max-width: 640px) {
  .sim-ctrl, .board-stage-wrap, .sim-summary {
    padding: 12px;
  }
  .sim-ctrl__header--collapsible {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .sim-ctrl__toggle-btn {
    width: 100%;
    justify-content: space-between;
    padding: 7px 12px;
    font-size: 13px;
  }
  .core-selector-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .fapan-stage {
    max-width: 100%;
  }
  .relic-block__roman {
    font-size: 9px;
  }
  .relic-block__tag {
    display: none;
  }
}
</style>

<style>
.dark-mode,
.dark-theme {
  --rb-active-bg: #2f5e5a;
  --rb-active-color: #f3fbfa;
  --rb-active-border: #6ba5a0;
  --rb-toggle-bg: rgba(107, 165, 160, 0.15);
  --rb-toggle-border: rgba(107, 165, 160, 0.44);
  --rb-toggle-color: #a8dbd6;
  --rb-toggle-hover-bg: rgba(107, 165, 160, 0.25);
  --rb-toggle-hover-border: rgba(107, 165, 160, 0.68);
  --rb-slider-accent: #6ba5a0;
  --rb-success-color: #7bd882;
  --rb-warn-color: #f48b8b;
}
</style>
