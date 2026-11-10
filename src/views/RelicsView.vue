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
                <span>遗器点数 {{ relic.relicPoint }}</span>
                <span v-if="relic.energyPattern">能量型 {{ relic.energyPattern }}</span>
              </div>

              <p v-if="relic.tip" class="relic-entry__tip">{{ relic.tip }}</p>

              <!-- 卡片只显示 1 级效果作为摘要，完整 1~5 级与共鸣进详情页 -->
              <p class="relic-entry__summary">
                <span class="relic-entry__summary-label">{{ relic.type === 'core' ? '技能效果' : '属性加成' }}</span>
                <span v-html="highlight(relic.levels[0]?.text)"></span>
              </p>
              <span class="relic-entry__more">查看 1~{{ relic.levels.length }} 级与{{ relic.type === 'core' ? '共鸣' : '详情' }} ›</span>
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

    <!-- 遗器详情 -->
    <UiModal :visible="!!detailRelic" :title="detailRelic?.name || '遗器详情'" max-width="760px" max-height="86vh" teleport-to="body" @update:visible="v => !v && closeDetail()">
      <div v-if="detailRelic" class="relic-detail">
        <div class="relic-detail__head">
          <UiItemCard
            :name="detailRelic.name"
            :img="getImageUrl(`/images/Common_ItemIcon/${detailRelic.icon}.webp`)"
            :quality="0"
            :show-name="false"
            @img-error="handleImageFallback"
          />
          <div class="relic-detail__head-body">
            <div class="relic-detail__tags">
              <UiTag :tone="detailRelic.type === 'core' ? 'gold' : 'accent'">{{ detailRelic.type === 'core' ? '核心遗器' : '基础遗器' }}</UiTag>
              <UiTag v-if="detailRelic.categoryName">{{ detailRelic.categoryName }}</UiTag>
              <UiTag v-if="detailRelic.attributeName">{{ detailRelic.attributeName }}</UiTag>
            </div>
            <div class="relic-detail__stats">
              <span>占格 {{ detailRelic.shape.width }} × {{ detailRelic.shape.height }}</span>
              <span>遗器点数 {{ detailRelic.relicPoint }}</span>
              <span v-if="detailRelic.energyPattern">能量型 {{ detailRelic.energyPattern }}</span>
            </div>
          </div>
        </div>

        <p v-if="detailRelic.tip" class="relic-detail__tip">{{ detailRelic.tip }}</p>

        <UiSection :title="detailRelic.type === 'core' ? '技能效果（1~5 级）' : '属性加成（1~5 级）'">
          <ul class="relic-levels__list relic-levels__list--detail">
            <li v-for="lv in detailRelic.levels" :key="lv.level" class="relic-level" :class="{ 'is-active': lv.level === detailLevel }">
              <span class="relic-level__badge">{{ lv.level }} 级</span>
              <span class="relic-level__text" v-html="highlight(lv.text)"></span>
            </li>
          </ul>
        </UiSection>

        <UiSection v-if="detailRelic.resonances.length" title="共鸣">
          <div v-for="(res, index) in detailRelic.resonances" :key="index" class="relic-resonance">
            <span class="relic-resonance__cond">{{ res.requirement }}</span>
            <span class="relic-resonance__text" v-html="highlight(res.text)"></span>
          </div>
        </UiSection>
      </div>
    </UiModal>
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
  UiTag, UiEmptyState, UiBackToTop, UiSection, UiModal
} from '../components/ui/index.js'

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
const categoryOptions = computed(() => [...new Set(relics.value.map(r => r.category).filter(c => c > 0))].sort((a, b) => a - b))
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
    && (!cate.value || relic.category === Number(cate.value))
    && (!level.value || relic.levels.some(lv => lv.level === Number(level.value))))
  const target = result.find(relic => relic.id === focus.value)
  return target ? [target, ...result.filter(relic => relic !== target)] : result
})

const { displayedItems: displayedRelics } = useLazyList(filteredRelics, 20, '#relicsScroll')

/* ---- 详情弹层 ---- */
const detailId = ref('')
const detailRelic = computed(() => relics.value.find(r => r.id === detailId.value) || null)
const detailLevel = computed(() => {
  const wanted = Number(level.value)
  if (wanted && detailRelic.value?.levels.some(lv => lv.level === wanted)) return wanted
  return detailRelic.value?.levels[0]?.level || 1
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
.relics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.relic-entry {
  display: flex; align-items: flex-start; gap: 12px; padding: 12px; min-width: 0;
  background: var(--paper-soft); border: 1px solid var(--border-soft); border-radius: 6px;
}
.relic-entry.is-target { outline: 2px solid var(--accent-ink); outline-offset: -2px; }
/* 基础与核心统一底色：类型靠「基础/核心」标签区分，不再用背景色制造差异。 */
.relic-entry :deep(.ui-item-card) { flex: 0 0 72px; margin: 0; }
.relic-entry__body { flex: 1; min-width: 0; }
.relic-entry__name { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 6px; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.relic-entry__meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; color: var(--text-muted); font-size: 12px; }
.relic-attr { color: var(--accent-ink); font-weight: 600; }
.relic-entry__tip { margin: 8px 0 0; font-size: 12px; line-height: 1.65; color: var(--text-muted); }
.relic-entry__summary { display: flex; gap: 8px; align-items: baseline; margin: 8px 0 0; padding-top: 8px; border-top: 1px dashed var(--border-soft); font-size: 13px; line-height: 1.6; }
.relic-entry__summary-label { flex: 0 0 auto; font-size: 12px; font-weight: 700; color: var(--text-muted); }
.relic-entry__more { display: block; margin-top: 6px; font-size: 12px; color: var(--accent-ink); }
/* 详情弹层 */
.relic-detail__head { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 10px; border-bottom: 1px solid var(--border-soft); }
.relic-detail__head :deep(.ui-item-card) { flex: 0 0 84px; margin: 0; }
.relic-detail__head-body { flex: 1; min-width: 0; }
.relic-detail__tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.relic-detail__stats { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--text-muted); }
.relic-detail__tip { margin: 10px 0 0; font-size: 13px; line-height: 1.7; color: var(--text-muted); }
.relic-levels { margin-top: 10px; border-top: 1px dashed var(--border-soft); padding-top: 8px; }
.relic-levels__list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.relic-levels__list--detail { margin-top: 0; }
.relic-level { display: flex; gap: 8px; align-items: flex-start; padding: 5px 8px; border-radius: 4px; font-size: 13px; line-height: 1.6; }
.relic-level.is-active { background: rgba(122, 154, 153, 0.14); }
.relic-level__badge { flex: 0 0 auto; font-size: 11px; font-weight: 700; color: var(--accent-ink); padding-top: 1px; }
.relic-level__text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
:deep(.relic-hl) { color: var(--accent-ink); font-weight: 700; }
.relic-resonances { margin-top: 10px; border-top: 1px dashed var(--border-soft); padding-top: 8px; }
.relic-resonances__label { font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 5px; }
.relic-resonance { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; font-size: 12px; line-height: 1.6; padding: 3px 0; }
.relic-resonance__cond { flex: 0 0 auto; font-weight: 700; color: var(--q5-text, #b15d00); }
.relic-resonance__text { flex: 1 1 160px; min-width: 0; overflow-wrap: anywhere; }
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
