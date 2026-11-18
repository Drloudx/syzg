<template>
  <div class="page-view-container relics-page">
    <UiFilterPanel class="filter-panel paper-panel">
      <!--
        搜索框放在 Tab **外面**：与货运站等页面一致 —— 切到「玩法规则」时搜索框仍在，
        不会因为整块面板被 v-if 掉而消失。
      -->
      <template #search>
        <UiSearchInput :model-value="search" placeholder="搜索遗器、属性或效果..." @update:model-value="setFilter('q', $event)" />
      </template>
      <UiTabs :model-value="tab" :options="tabs" @update:model-value="changeTab" />
      <template v-if="isList">
        <UiFilterRow label="类型：">
          <UiFilterPill :active="!type" @click="setFilter('type', '')">全部</UiFilterPill>
          <UiFilterPill v-for="option in typeOptions" :key="option.value" :active="type === option.value" @click="setFilter('type', option.value)">{{ option.label }}</UiFilterPill>
        </UiFilterRow>
        <UiFilterRow label="分类：">
          <UiFilterPill :active="!cate" @click="setFilter('cate', '')">全部</UiFilterPill>
          <UiFilterPill v-for="value in categoryOptions" :key="value" :active="cate === String(value)" @click="setFilter('cate', String(value))">
            <img v-if="getElementIconUrl(categoryName(value))" :src="getElementIconUrl(categoryName(value))" :alt="categoryName(value)" class="filter-element-icon" />
            {{ categoryName(value) }}
          </UiFilterPill>
        </UiFilterRow>
        <UiFilterRow label="等级：">
          <UiFilterPill :active="!level" @click="setFilter('lv', '')">全部</UiFilterPill>
          <UiFilterPill v-for="value in levelOptions" :key="value" :active="level === String(value)" @click="setFilter('lv', String(value))">{{ value }} 级</UiFilterPill>
        </UiFilterRow>
        <div class="collection-counter">
          共 <span class="count-num">{{ filteredRelics.length }}</span> 件遗器
          <span v-for="dungeon in dungeons" :key="dungeon.id" class="dungeon-note">· {{ dungeon.name }}</span>
        </div>
      </template>
    </UiFilterPanel>

    <UiEmptyState v-if="loading" type="loading" text="正在加载遗器图鉴..." />
    <UiEmptyState v-else-if="error" type="error" :text="error" @retry="loadData" />

    <!-- 法盘模拟器视图 -->
    <UiCardGrid v-else-if="isSim" id="relicsScroll" class="relics-content paper-panel" :content-style="{ gridTemplateColumns: 'minmax(0, 1fr)' }">
      <RelicBoardSimulator :relics="relics" :fapan="fapan" :dungeons="dungeons" />
    </UiCardGrid>

    <!-- 规则视图（独立 tab，不是列表底部的区块） -->
    <UiCardGrid v-else-if="tab === 'rules'" id="relicsScroll" class="relics-content paper-panel" :content-style="{ gridTemplateColumns: 'minmax(0, 1fr)' }">
      <UiSection title="遗器与法盘玩法规则">
        <div class="rule-copy">
          <p class="rule-scope"><b>⚠ 适用范围</b>：遗器 / 法盘的属性加成与技能效果，<b>只在对应秘境副本（如亚空回廊）的战斗内生效</b>，离开副本即失效，不影响主线、日常等其它玩法。</p>
          <p><b>遗器分两类</b>：基础遗器（<b>火 / 水 / 地 / 风</b> 四种属性之一，提供全局属性加成）；核心遗器（带技能效果与共鸣，没有属性栏，另有「能量型」参数，数值越大覆盖的伙伴位置越多）。</p>
          <p><b>法盘</b>：{{ fapanRuleText }}（四角为永久隐藏切角，实际有效共 <b>52</b> 格）。开局中心默认开放 <b>{{ rules.initialOpenGrid || 22 }}</b> 格可用；法盘共 <b>{{ rules.maxFapanLevel || 30 }}</b> 级，每升 1 级可逐格解锁 1 格，满级 30 级时<b>全部 52 格均可放置遗器</b>。</p>
          <p><b>放置</b>：遗器按自身「占格」形状（纯矩形，见下方示意）平铺进可用格；<b>不能旋转</b>，不能重叠、不能越界。基础遗器可放多个；核心遗器同名<b>最多 1 个</b>、同时在场<b>最多 {{ rules.maxCoreRelicNum }} 种</b>。</p>
          <p><b>共鸣</b>：核心遗器的每条共鸣要求场上某些分类的遗器达到指定数量（如「火属性 ×2 + 地属性 ×1」），满足即激活该条强化。</p>
          <p><b>升级</b>：消耗 <b>{{ rules.levelUpCost }}</b> 个同类遗器合成升级，遗器等级上限 5 级；每次升级同时获得法盘经验，法盘共 <b>{{ rules.maxFapanLevel }}</b> 级。</p>
          <p><b>带出积分</b>：遗器在副本结算时折算的积分（<b>不是法盘消耗</b>），点数越高越值钱。</p>
        </div>
      </UiSection>

      <UiSection title="遗器形状一览">
        <p class="rule-hint">遗器只有「矩形占格」一种形状，下表是全部出现过的尺寸；同一尺寸的遗器可互换放置。</p>
        <div class="shape-catalog">
          <div v-for="shape in shapeCatalog" :key="shape.key" class="shape-catalog__item">
            <div class="shape-mini" :style="{ '--sw': shape.width, '--sh': shape.height }">
              <span v-for="(cell, i) in shape.cells" :key="i" class="shape-mini__cell"></span>
            </div>
            <span class="shape-catalog__label">{{ shape.width }}×{{ shape.height }}<template v-if="shape.count"> · {{ shape.count }} 件</template></span>
          </div>
        </div>
      </UiSection>

      <UiSection v-if="fapan.length" title="法盘格子">
        <p class="rule-hint">法盘整体为 8×7 切角八边形（四角镂空不计入可用格）。初始开放中心 22 格，升级可解锁 30 格，满级 30 级全盘 52 格均可放置遗器。</p>
        <div class="fapan-grid">
          <div v-for="board in fapan" :key="board.id" class="fapan-card">
            <div class="fapan-card__head">
              <div class="fapan-card__title-group">
                <span class="fapan-card__name">{{ board.name }}</span>
                <span class="fapan-card__meta">（8 × 7 八角形 · 满级 {{ board.maxLevel || 30 }} 级）</span>
              </div>
              <div class="fapan-mode-toggle" role="group" aria-label="法盘等级预览模式">
                <button
                  type="button"
                  class="fapan-mode-btn"
                  :class="{ 'is-active': fapanViewMode === 'max' }"
                  @click="fapanViewMode = 'max'"
                >
                  满级全景 (52格)
                </button>
                <button
                  type="button"
                  class="fapan-mode-btn"
                  :class="{ 'is-active': fapanViewMode === 'initial' }"
                  @click="fapanViewMode = 'initial'"
                >
                  初始状态 (22格)
                </button>
              </div>
            </div>
            <div class="fapan-board" :style="{ '--cols': board.width, '--rows': board.height }">
              <template v-for="(cell, index) in board.cells" :key="index">
                <span
                  class="fapan-cell"
                  :class="{
                    'is-corner': isCornerCell(cell, board),
                    'is-open': isCellOpen(cell, board, fapanViewMode),
                    'is-locked': isCellLocked(cell, board, fapanViewMode)
                  }"
                  :title="isCornerCell(cell, board) ? '永久切角（不可用）' : (isCellOpen(cell, board, fapanViewMode) ? `可放置格（${cell.x}, ${cell.y}）` : `升级解锁格（${cell.x}, ${cell.y}）`)"
                ></span>
              </template>
            </div>
            <div class="fapan-legend">
              <template v-if="fapanViewMode === 'max'">
                <span class="fapan-legend__item"><i class="fapan-cell is-open"></i>满级已全解锁 {{ board.maxUsableCount || 52 }} 格</span>
                <span class="fapan-legend__item text-muted">（四角切角已镂空隐藏）</span>
              </template>
              <template v-else>
                <span class="fapan-legend__item"><i class="fapan-cell is-open"></i>初始开放 {{ board.initialCount || 22 }} 格</span>
                <span class="fapan-legend__item"><i class="fapan-cell is-locked"></i>升级解锁 {{ board.unlockableCount || 30 }} 格</span>
                <span class="fapan-legend__item text-muted">（满级 30 级全开共 52 格）</span>
              </template>
            </div>
          </div>
        </div>
      </UiSection>
    </UiCardGrid>
    <UiCardGrid v-else id="relicsScroll" class="relics-content paper-panel" :content-style="{ gridTemplateColumns: 'minmax(0, 1fr)' }">
      <template v-if="filteredRelics.length">
        <div class="relics-grid">
          <article
            v-for="relic in displayedRelics"
            :key="relic.id"
            :data-relic="relic.id"
            class="relic-entry"
            :class="{ 'is-target': focus === relic.id }"
            role="button"
            tabindex="0"
            :aria-label="`查看 ${relic.name} 详情`"
            @click="openDetail(relic.id)"
            @keydown.enter.prevent="openDetail(relic.id)"
            @keydown.space.prevent="openDetail(relic.id)"
          >
            <UiItemCard
              :name="relic.name"
              :img="getImageUrl(`/images/Common_ItemIcon/${relic.icon}.webp`)"
              :quality="0"
              :show-name="false"
              @img-error="handleImageFallback"
            />

            <div class="relic-entry__body">
              <h3 class="relic-entry__name">
                {{ relic.name }}
                <UiTag :tone="relic.type === 'core' ? 'gold' : 'accent'">{{ relic.type === 'core' ? '核心' : '基础' }}</UiTag>
                <UiTag v-if="relic.categoryName" class="relic-cat-tag">
                  <img v-if="getElementIconUrl(relic.categoryName)" :src="getElementIconUrl(relic.categoryName)" :alt="relic.categoryName" class="relic-tag-icon" />
                  {{ relic.categoryName }}
                </UiTag>
              </h3>

              <div class="relic-entry__meta">
                <span v-if="relic.attributeName" class="relic-attr">{{ relic.attributeName }}</span>
                <span>带出积分 {{ relic.relicPoint }}</span>
                <span v-if="relic.energyPattern">能量型 {{ relic.energyPattern }}</span>
              </div>

              <!-- 占格形状：直接画出 w×h 的格子，比「2×3」文字直观 -->
              <div class="relic-entry__shape">
                <span class="relic-entry__shape-label">占格 {{ relic.shape.width }}×{{ relic.shape.height }}</span>
                <div class="shape-mini" :style="{ '--sw': relic.shape.width, '--sh': relic.shape.height }">
                  <span v-for="(cell, i) in relic.shapeCells" :key="i" class="shape-mini__cell"></span>
                </div>
              </div>

              <!-- 核心遗器共鸣条件概览 -->
              <div v-if="relic.type === 'core' && relic.resonances?.length" class="relic-entry__resonances">
                <span class="relic-entry__res-label">共鸣要求：</span>
                <div class="relic-entry__res-list">
                  <div
                    v-for="(res, rIdx) in relic.resonances"
                    :key="rIdx"
                    class="relic-res-badges-wrap"
                  >
                    <span
                      v-for="part in (res.requirementParts || parseRequirementParts(res.requirement))"
                      :key="part.categoryName"
                      class="resonance-mini-badge"
                    >
                      <img :src="getElementIconUrl(part.categoryName)" :alt="part.categoryName" class="resonance-mini-icon" />
                      <span class="resonance-mini-num">×{{ part.count }}</span>
                    </span>
                  </div>
                </div>
              </div>

              <!--
                卡片只承载「一眼要看的」：1 级效果全文。
                背景故事（tip）与 1~5 级 / 共鸣都进详情弹层——故事放卡片会占 3 行挤掉效果。
              -->
              <div class="relic-entry__effect">
                <div class="relic-entry__effect-head">
                  <span class="relic-entry__effect-label">{{ relic.type === 'core' ? '1 级技能' : '1 级加成' }}</span>
                  <span class="relic-entry__more">详情 ›</span>
                </div>
                <p class="relic-entry__effect-text" v-html="highlight(relic.levels[0]?.text)"></p>
              </div>
            </div>
          </article>
        </div>
      </template>
      <UiEmptyState v-else text="没有符合条件的遗器" />
    </UiCardGrid>
    <UiBackToTop scroll-container="#relicsScroll" />

    <!--
      详情统一走「物品详情」弹层（ItemDetailModal）——与物品图鉴同一个组件。
      遗器在游戏里本来就以「物品详情」形态展示；该组件会读 relics.json 自动补
      遗器属性 / 1~5 级效果 / 共鸣。
    -->
    <ItemDetailModal
      v-model:visible="detailVisible"
      :item="detailItem"
      :category-tree="categoryTree"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithFallback } from '../utils/request.js'
import { getImageUrl, handleImageFallback } from '../utils/env.js'
import { useLazyList } from '../composables/useLazyList.js'
import { resolveScrollTarget } from '../utils/scrollTarget.js'
import {
  UiFilterPanel, UiSearchInput, UiFilterRow, UiFilterPill, UiCardGrid, UiItemCard,
  UiTag, UiEmptyState, UiBackToTop, UiSection, UiTabs
} from '../components/ui/index.js'
import ItemDetailModal from '../components/ItemDetailModal.vue'
import RelicBoardSimulator from '../components/relics/RelicBoardSimulator.vue'
import { parseRequirementParts, getElementSlug } from '../utils/relicSolver.js'

const getElementIconUrl = cat => {
  const slug = getElementSlug(cat)
  return slug ? getImageUrl(`/images/HeroBagPanel/card_atr_${slug}.webp`) : ''
}

const route = useRoute()
const router = useRouter()

const data = ref(null)
const loading = ref(true)
const error = ref('')

const typeOptions = [
  { value: 'base', label: '基础' },
  { value: 'core', label: '核心' }
]

/** 顶部 Tab：法盘模拟 / 遗器列表 / 玩法规则 */
const tabs = [
  { value: 'sim', label: '法盘模拟' },
  { value: 'list', label: '遗器列表' },
  { value: 'rules', label: '玩法规则' }
]
const tab = computed(() => (tabs.some(entry => entry.value === route.query.tab) ? route.query.tab : 'sim'))
const isList = computed(() => tab.value === 'list')
const isSim = computed(() => tab.value === 'sim')
function changeTab(value) {
  router.push({ path: '/relics', query: { ...route.query, tab: value } })
}

const queryString = key => (typeof route.query[key] === 'string' ? route.query[key] : '')
const search = computed(() => queryString('q'))
const type = computed(() => queryString('type'))
const cate = computed(() => queryString('cate'))
const level = computed(() => queryString('lv'))
const focus = computed(() => queryString('relic'))

const relics = computed(() => data.value?.relics || [])
const fapan = computed(() => data.value?.fapan || [])
/** 法盘等级预览模式：'max'（满级 30 级全景，默认）/ 'initial'（初始 1 级） */
const fapanViewMode = ref('max')

function isCornerCell(cell, board) {
  if (cell.isCorner !== undefined) return Boolean(cell.isCorner)
  const w = board.width || 8
  const h = board.height || 7
  return (cell.x === 0 || cell.x === w - 1) && (cell.y === 0 || cell.y === h - 1)
}

function isCellOpen(cell, board, mode) {
  if (isCornerCell(cell, board)) return false
  if (mode === 'max') return true
  if (cell.isInitial !== undefined) return Boolean(cell.isInitial)
  return !cell.locked
}

function isCellLocked(cell, board, mode) {
  if (isCornerCell(cell, board)) return false
  if (mode === 'max') return false
  if (cell.isUnlockable !== undefined) return Boolean(cell.isUnlockable)
  return Boolean(cell.locked)
}
const dungeons = computed(() => data.value?.dungeons || [])
const rules = computed(() => data.value?.rules || {
  maxCoreRelicNum: 0, levelUpCost: 0, maxFapanLevel: 0, initialOpenGrid: 1
})
/** 法盘尺寸文案（两块法盘尺寸一致时才合并成一句）。 */
const fapanRuleText = computed(() => {
  const boards = fapan.value
  if (!boards.length) return '遗器放置的格子板'
  const sizes = [...new Set(boards.map(board => `${board.width}×${board.height}`))]
  return `${sizes.join(' / ')} 的格子板`
})

/**
 * 遗器形状一览：按 w×h 去重，统计各尺寸有几件。
 * 官方 shape 只有矩形（RelicInfoSizeTempConf = w/h），所以这里就是全部出现过的尺寸。
 */
const shapeCatalog = computed(() => {
  const groups = new Map()
  for (const relic of relics.value) {
    const { width, height } = relic.shape
    if (!width || !height) continue
    const key = `${width}x${height}`
    if (!groups.has(key)) {
      groups.set(key, { key, width, height, count: 0, cells: relic.shapeCells })
    }
    groups.get(key).count += 1
  }
  return [...groups.values()].sort((a, b) => (a.width * a.height) - (b.width * b.height) || a.width - b.width)
})

const categoryName = value => data.value?.categoryNames?.[value] || `分类${value}`
const categoryOptions = computed(() => [...new Set(relics.value.map(r => r.relicCategory).filter(c => c > 0))].sort((a, b) => a - b))
const levelOptions = computed(() => {
  const set = new Set()
  for (const relic of relics.value) for (const lv of relic.levels) set.add(lv.level)
  return [...set].sort((a, b) => a - b)
})

/** 高亮 `{…}` 包裹的数值，与游戏内一致。 */
const highlight = text => String(text || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\{([^}]+)\}/g, '<span class="relic-hl">$1</span>')

const matches = relic => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    relic.id, relic.name, relic.attributeName, relic.categoryName, relic.tip,
    ...relic.levels.map(lv => lv.text),
    ...relic.resonances.map(res => res.text)
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(needle)
}

const filteredRelics = computed(() => {
  const result = relics.value.filter(relic => matches(relic)
    && (!type.value || relic.type === type.value)
    && (!cate.value || relic.relicCategory === Number(cate.value))
    && (!level.value || relic.levels.some(lv => lv.level === Number(level.value))))
  const target = result.find(relic => relic.id === focus.value)
  return target ? [target, ...result.filter(relic => relic !== target)] : result
})

const { displayedItems: displayedRelics } = useLazyList(filteredRelics, 20, '#relicsScroll')

/* ---- 详情：复用物品详情弹层（ItemDetailModal）---- */
const categoryTree = ref([])
const detailId = ref('')
const detailItem = computed(() => relics.value.find(r => r.id === detailId.value) || null)
const detailVisible = computed({
  get: () => !!detailItem.value,
  set: value => { if (!value) closeDetail() }
})
function openDetail(id) {
  detailId.value = id
  const query = { ...route.query, relic: id }
  router.replace({ query })
}
function closeDetail() {
  detailId.value = ''
  const query = { ...route.query }
  delete query.relic
  router.replace({ query })
}
// 直接带 ?relic= 冷链接进来时，自动打开对应详情
watch(focus, id => { detailId.value = id || '' }, { immediate: true })

function setFilter(key, value) {
  const query = { ...route.query }
  delete query.relic
  if (value) query[key] = value
  else delete query[key]
  router.replace({ query })
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    data.value = await fetchWithFallback('data/parsed/relics.json')
    /*
     * ItemDetailModal 用 categoryTree 解析 `item.category`（数字分类路径）。
     * 遗器本身不带分类路径，但组件需要它才不报错，故顺手取 items.json 的分类树。
     */
    try {
      const itemsData = await fetchWithFallback('data/parsed/items.json')
      categoryTree.value = itemsData?.categoryTree || []
    } catch { /* 分类树失败不影响遗器列表 */ }
  } catch (cause) {
    error.value = '遗器图鉴加载失败，请重试。'
    console.error('Failed to load relic catalog:', cause)
  } finally {
    loading.value = false
  }
}

watch([() => route.query.relic, type, cate, level], async () => {
  await nextTick()
  resolveScrollTarget('#relicsScroll').scrollTo({ top: 0, behavior: 'auto' })
})

onMounted(loadData)
</script>

<style scoped>
.collection-counter { font-size: 13px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.dungeon-note { margin-left: 6px; color: var(--text-muted); font-weight: 500; }
.filter-panel :deep(.ui-filter-pill.is-active) { color: var(--on-wood-text); }
.relics-content { background: var(--paper); padding: 12px 14px calc(88px + var(--safe-bottom, 0px)); }
.relics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
.relic-entry {
  display: flex; align-items: flex-start; gap: 12px; padding: 12px; min-width: 0;
  background: var(--paper-soft); border: 1px solid var(--border-soft); border-radius: 6px;
  transition: background-color 0.15s ease;
}
.relic-entry:hover { background: var(--hover-bg, rgba(85, 117, 116, 0.14)); }
.relic-entry.is-target { outline: 2px solid var(--accent-ink); outline-offset: -2px; }
/* 基础与核心统一底色：类型靠「基础/核心」标签区分，不再用背景色制造差异。 */
.relic-entry :deep(.ui-item-card) { flex: 0 0 72px; margin: 0; }
.relic-entry__body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.relic-entry__name { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 5px; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.relic-entry__meta { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; color: var(--text-muted); font-size: 12px; line-height: 1.5; }
.relic-attr { color: var(--accent-ink); font-weight: 600; }
/* 占格形状小图：把 w×h 画成格子，比「2×3」文字直观 */
.relic-entry__shape { display: flex; align-items: center; gap: 8px; margin-top: 7px; }
.relic-entry__shape-label { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.shape-mini {
  display: grid;
  grid-template-columns: repeat(var(--sw), 1fr);
  grid-template-rows: repeat(var(--sh), 1fr);
  gap: 2px;
  width: calc(var(--sw) * 13px);
  height: calc(var(--sh) * 13px);
  flex: 0 0 auto;
}
.shape-mini__cell {
  background: rgba(233, 220, 195, 0.95);
  border: 1px solid var(--accent-ink, #557574);
  border-radius: 2px;
}
/* 玩法规则 */
.rule-copy p { margin: 0 0 8px; font-size: 13px; line-height: 1.75; color: var(--text-main); }
.rule-copy p:last-child { margin-bottom: 0; }
.rule-copy b { color: var(--accent-ink); font-weight: 700; }
.rule-scope {
  padding: 9px 11px;
  border-radius: 5px;
  background: rgba(176, 97, 12, 0.1);
  border: 1px solid rgba(176, 97, 12, 0.32);
}
.rule-hint { margin: 0 0 10px; font-size: 12px; line-height: 1.7; color: var(--text-muted); }
/* 形状一览 */
.shape-catalog { display: flex; flex-wrap: wrap; gap: 16px; }
.shape-catalog__item { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.shape-catalog__label { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
/* 1 级效果：卡片的主内容，尽量给足行数，不再被背景故事挤占 */
.relic-entry__effect {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
}
.relic-entry__effect-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.relic-entry__effect-label { font-size: 12px; font-weight: 700; color: var(--text-muted); }
.relic-entry__more { font-size: 12px; color: var(--accent-ink); white-space: nowrap; }
.filter-element-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  vertical-align: -2px;
  margin-right: 2px;
}
.relic-cat-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.relic-tag-icon {
  width: 13px;
  height: 13px;
  object-fit: contain;
  vertical-align: -1px;
}
.relic-entry__resonances {
  margin-top: 6px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11.5px;
}
.relic-entry__res-label {
  flex-shrink: 0;
  color: var(--text-muted);
}
.relic-entry__res-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.relic-res-badges-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.resonance-mini-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 4px 1px 2px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  line-height: 1;
}
:root[data-theme='dark'] .resonance-mini-badge,
.dark-mode .resonance-mini-badge {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}
.resonance-mini-icon {
  width: 13px;
  height: 13px;
  object-fit: contain;
  vertical-align: middle;
}
.resonance-mini-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-main, #333);
}
:root[data-theme='dark'] .resonance-mini-num,
.dark-mode .resonance-mini-num {
  color: #eee;
}
.relic-entry__effect-text { margin: 0; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.relics-content :deep(.relic-hl) {
  color: #c86400;
  font-weight: 700;
}
:root[data-theme='dark'] .relics-content :deep(.relic-hl),
.dark-mode .relics-content :deep(.relic-hl) {
  color: #ff9800;
}
/* 法盘 */
.fapan-note { margin: 0 0 12px; font-size: 13px; line-height: 1.7; color: var(--text-muted); }
.fapan-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.fapan-card { padding: 12px 14px; background: var(--paper-soft); border: 1px solid var(--border-soft); border-radius: 6px; }
.fapan-card__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.fapan-card__title-group { display: flex; flex-direction: column; gap: 2px; }
.fapan-card__name { font-size: 15px; font-weight: 700; }
.fapan-card__meta { font-size: 12px; color: var(--text-muted); }
.fapan-mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 2px;
}
.fapan-mode-btn {
  border: none;
  background: transparent;
  padding: 3px 8px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.fapan-mode-btn:hover {
  color: var(--text-main);
}
.fapan-mode-btn.is-active {
  background: var(--paper-solid, #fff);
  color: var(--accent-ink, #557574);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.fapan-board {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: 3px;
  width: 100%;
  max-width: 260px;
  aspect-ratio: var(--cols) / var(--rows);
  margin: 0 auto;
}
.fapan-cell {
  display: block;
  border-radius: 3px;
  min-width: 0;
  min-height: 0;
}
.fapan-cell.is-corner {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}
.fapan-cell.is-locked {
  background: rgba(94, 70, 43, 0.42);
  border: 1px solid rgba(60, 42, 24, 0.55);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.18);
}
.fapan-cell.is-open {
  background: rgba(233, 220, 195, 0.95);
  border: 1px solid var(--accent-ink, #557574);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}
.fapan-legend { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; margin-top: 10px; font-size: 12px; color: var(--text-muted); }
.fapan-legend__item { display: inline-flex; align-items: center; gap: 6px; }
.fapan-legend__item .fapan-cell { width: 13px; height: 13px; flex: 0 0 auto; }
@media (max-width: 640px) {
  .relics-content { padding-inline: 10px; }
  .relics-grid { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .relic-entry { padding: 10px; gap: 10px; }
  .relic-entry :deep(.ui-item-card) { flex-basis: 60px; }
}
</style>
