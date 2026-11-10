<template>
  <div class="page-view-container relics-page">
    <UiFilterPanel class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput :model-value="search" placeholder="搜索遗器、属性或效果..." @update:model-value="setFilter('q', $event)" />
      </template>
      <UiFilterRow label="类型：">
        <UiFilterPill :active="!type" @click="setFilter('type', '')">全部</UiFilterPill>
        <UiFilterPill v-for="option in typeOptions" :key="option.value" :active="type === option.value" @click="setFilter('type', option.value)">{{ option.label }}</UiFilterPill>
      </UiFilterRow>
      <UiFilterRow label="分类：">
        <UiFilterPill :active="!cate" @click="setFilter('cate', '')">全部</UiFilterPill>
        <UiFilterPill v-for="value in categoryOptions" :key="value" :active="cate === String(value)" @click="setFilter('cate', String(value))">{{ categoryName(value) }}</UiFilterPill>
      </UiFilterRow>
      <UiFilterRow label="等级：">
        <UiFilterPill :active="!level" @click="setFilter('lv', '')">全部</UiFilterPill>
        <UiFilterPill v-for="value in levelOptions" :key="value" :active="level === String(value)" @click="setFilter('lv', String(value))">{{ value }} 级</UiFilterPill>
      </UiFilterRow>
      <div class="collection-counter">
        共 <span class="count-num">{{ filteredRelics.length }}</span> 件遗器
        <span v-for="dungeon in dungeons" :key="dungeon.id" class="dungeon-note">· {{ dungeon.name }}</span>
      </div>
    </UiFilterPanel>

    <UiEmptyState v-if="loading" type="loading" text="正在加载遗器图鉴..." />
    <UiEmptyState v-else-if="error" type="error" :text="error" @retry="loadData" />
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
                <UiTag v-if="relic.categoryName">{{ relic.categoryName }}</UiTag>
              </h3>

              <div class="relic-entry__meta">
                <span v-if="relic.attributeName" class="relic-attr">{{ relic.attributeName }}</span>
                <span>占格 {{ relic.shape.width }}×{{ relic.shape.height }}</span>
                <span>点数 {{ relic.relicPoint }}</span>
                <span v-if="relic.energyPattern">能量型 {{ relic.energyPattern }}</span>
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

      <UiSection v-if="fapan.length" title="法盘">
        <div class="fapan-grid">
          <div v-for="board in fapan" :key="board.id" class="fapan-card">
            <div class="fapan-card__name">{{ board.name }}</div>
            <div class="fapan-card__meta">
              {{ board.width }} × {{ board.height }} 格 · 上限 {{ board.maxLevel }} 级 · 锁格 {{ board.lockCount }}
            </div>
          </div>
        </div>
      </UiSection>
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
  UiTag, UiEmptyState, UiBackToTop, UiSection
} from '../components/ui/index.js'
import ItemDetailModal from '../components/ItemDetailModal.vue'

const route = useRoute()
const router = useRouter()

const data = ref(null)
const loading = ref(true)
const error = ref('')

const typeOptions = [
  { value: 'base', label: '基础' },
  { value: 'core', label: '核心' }
]

const queryString = key => (typeof route.query[key] === 'string' ? route.query[key] : '')
const search = computed(() => queryString('q'))
const type = computed(() => queryString('type'))
const cate = computed(() => queryString('cate'))
const level = computed(() => queryString('lv'))
const focus = computed(() => queryString('relic'))

const relics = computed(() => data.value?.relics || [])
const fapan = computed(() => data.value?.fapan || [])
const dungeons = computed(() => data.value?.dungeons || [])

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
.relic-entry__effect-text { margin: 0; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.relics-content :deep(.relic-hl) { color: var(--accent-ink); font-weight: 700; }
/* 详情弹层 */
.fapan-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 10px; }
.fapan-card { padding: 10px 12px; background: var(--paper-soft); border: 1px solid var(--border-soft); border-radius: 6px; }
.fapan-card__name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
.fapan-card__meta { font-size: 12px; color: var(--text-muted); line-height: 1.6; }
@media (max-width: 640px) {
  .relics-content { padding-inline: 10px; }
  .relics-grid { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .relic-entry { padding: 10px; gap: 10px; }
  .relic-entry :deep(.ui-item-card) { flex-basis: 60px; }
}
</style>
