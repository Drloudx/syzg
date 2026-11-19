<template>
  <div class="page-view-container facilities-page" :class="{ 'camp-panel': isCamp }">
    <CampFacilitiesPanel v-if="isDataReady && !errorMessage && isCamp && camp" :camp="camp" :mode="section">
      <template #section-tabs>
        <UiTabs :model-value="section" :options="sectionOptions" @update:model-value="setSection" />
      </template>
    </CampFacilitiesPanel>
    <UiFilterPanel v-else class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput v-model="searchQuery" :placeholder="isCamp ? (section === 'research' ? '搜索研究、效果或材料...' : '搜索建筑、效果或材料...') : '搜索产物或制作材料...'" />
      </template>
      <UiTabs :model-value="section" :options="sectionOptions" @update:model-value="setSection" />

      <template v-if="!isCamp">
        <UiFilterRow label="设施：">
          <UiFilterPill
            v-for="option in facilityOptions"
            :key="option.value"
            :active="selectedFacility === option.value"
            @click="selectedFacility = option.value"
          >{{ option.label }}</UiFilterPill>
        </UiFilterRow>

        <UiFilterRow v-if="modeOptions.length > 1" label="功能：">
          <UiFilterPill
            v-for="option in modeOptions"
            :key="option.value"
            :active="selectedMode === option.value"
            @click="selectedMode = option.value"
          >{{ option.label }}</UiFilterPill>
        </UiFilterRow>

        <UiFilterRow v-if="categoryOptions.length > 1" label="分类：">
          <UiFilterPill
            v-for="option in categoryOptions"
            :key="option.value"
            :active="selectedCategory === option.value"
            @click="selectedCategory = option.value"
          >{{ option.label }}</UiFilterPill>
        </UiFilterRow>

        <UiFilterRow v-if="levelOptions.length" label="等级：">
          <UiFilterPill
            v-for="option in levelOptions"
            :key="option.value"
            :active="selectedLevel === option.value"
            @click="selectedLevel = option.value"
          >{{ option.label }}</UiFilterPill>
        </UiFilterRow>

        <div v-if="isDataReady && !errorMessage" class="facility-count">共 <strong>{{ filteredRecipes.length }}</strong> 项</div>
      </template>
    </UiFilterPanel>

    <UiEmptyState v-if="!isDataReady" type="loading" text="正在整理设施数据..." />
    <UiEmptyState v-else-if="errorMessage" type="error" :text="errorMessage" @retry="loadFacilitiesData" />

    <UiEmptyState v-else-if="isCamp && !camp" type="error" text="营地数据加载失败，请更新数据后重试" @retry="loadFacilitiesData" />
    <UiCardGrid v-else-if="!isCamp" id="facilitiesScroll" class="facilities-grid paper-panel" wide>
      <div v-if="currentFacility" class="facility-intro">
        <div class="facility-intro__image quality-bg-2">
          <img :src="getImageUrl(currentFacility.icon)" :alt="currentFacility.name" />
        </div>
        <div class="facility-intro__content">
          <strong class="facility-intro__name">{{ currentFacility.name }}</strong>
          <p class="facility-intro__desc">{{ currentFacility.description }}</p>
        </div>
      </div>

      <article
        v-for="recipe in filteredRecipes"
        :key="recipe.id"
        class="facility-recipe"
        :class="{ 'is-target': targetItemId === recipe.output.typeId }"
      >
        <button type="button" class="facility-output" @click="openItem(recipe.output.typeId)">
          <span
            class="facility-output__icon"
            :class="recipe.mode === 'equipment' ? 'is-equip-frame' : `quality-bg-${recipe.output.quality}`"
          >
            <img :src="getImageUrl(recipe.output.img)" :alt="recipe.output.name" loading="lazy" />
          </span>
          <strong class="facility-output__name">{{ recipe.output.name }}</strong>
          <span class="facility-output__badge">{{ formatRecipeSubBadge(recipe) }}</span>
        </button>

        <div class="facility-materials">
          <div class="facility-materials__head">
            <strong>制作材料</strong>
            <div v-if="recipe.isImproved || recipe.output.min || recipe.makeTime" class="facility-materials__meta">
              <span v-if="recipe.isImproved" class="meta-pill is-improved">改良配方</span>
              <span v-if="recipe.output.min" class="meta-pill">产出 ×{{ formatAmount(recipe.output.min, recipe.output.max) }}</span>
              <span v-if="recipe.makeTime" class="meta-pill">{{ formatDuration(recipe.makeTime) }}</span>
            </div>
          </div>
          <div v-if="recipe.materials.length" class="facility-materials__grid">
            <UiRewardCard
              v-for="material in recipe.materials"
              :key="material.typeId"
              :rule="toRewardRule(material)"
              :clickable="!!material.typeId"
              @click="openItem(material.typeId)"
            />
          </div>
          <UiEmptyState v-else text="无需物品材料" />

          <div v-if="recipe.qualityChances?.length" class="quality-chances">
            <span class="quality-chances__label">品质概率</span>
            <span
              v-for="chance in recipe.qualityChances"
              :key="chance.quality"
              class="quality-pill"
              :class="[`quality-bg-${chance.quality}`, `quality-text-${chance.quality}`]"
            >{{ qualityName(chance.quality) }} {{ formatChance(chance.chance) }}</span>
          </div>
        </div>
      </article>

      <UiEmptyState v-if="filteredRecipes.length === 0" class="facility-empty" text="当前筛选条件没有匹配的制作项目" />
    </UiCardGrid>

    <UiBackToTop v-if="!isCamp" scroll-container="#facilitiesScroll" />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithFallback } from '../utils/request.js'
import { getImageUrl } from '../utils/env.js'
import { resolveScrollTarget } from '../utils/scrollTarget.js'
import { isFacilityRecipeHidden } from '../config/blacklist.js'
import CampFacilitiesPanel from '../components/facilities/CampFacilitiesPanel.vue'
import {
  UiBackToTop,
  UiCardGrid,
  UiEmptyState,
  UiFilterPill,
  UiFilterRow,
  UiRewardCard,
  UiFilterPanel, UiSearchInput,
  UiTabs
} from '../components/ui/index.js'

const CATEGORY_ORDER = ['weapon', 'armor', 'accessory', '恢复', '强化', '材料', '道具', '加工']
const EQUIP_POSITION_CATEGORY = position => {
  const pos = Number(position) || 0
  if (pos === 1) return { value: 'weapon', label: '武器' }
  if (pos >= 2 && pos <= 5) return { value: 'armor', label: '防具' }
  if (pos >= 6) return { value: 'accessory', label: '饰品' }
  return null
}

const route = useRoute()
const router = useRouter()
const facilities = ref([])
const isDataReady = ref(false)
const errorMessage = ref('')
const sectionOptions = [{ value: 'recipes', label: '设施配方' }, { value: 'building', label: '营地升级' }, { value: 'research', label: '属性研究' }]
const isCamp = computed(() => route.query.facility === 'camp')
const section = computed(() => isCamp.value ? (route.query.mode === 'research' ? 'research' : 'building') : 'recipes')
const camp = computed(() => facilities.value.find(facility => facility.key === 'camp'))
const recipeFacilities = computed(() => facilities.value.filter(facility => facility.key !== 'camp'))
const replaceQuery = patch => {
  const query = { ...route.query, ...patch }
  for (const key of Object.keys(query)) if (query[key] == null || query[key] === '') delete query[key]
  return router.replace({ query })
}
const setSection = value => {
  if (value === section.value) return
  replaceQuery({ facility: value === 'recipes' ? 'blacksmith' : 'camp', mode: value === 'recipes' ? 'equipment' : value,
    category: undefined, level: 'all', tier: undefined, q: undefined, item: undefined, itemId: undefined, building: undefined, research: undefined, group: undefined })
}
const selectedFacility = computed({
  get: () => recipeFacilities.value.some(entry => entry.key === route.query.facility) ? String(route.query.facility) : 'blacksmith',
  set: facility => replaceQuery({ facility, mode: recipeFacilities.value.find(entry => entry.key === facility)?.modes[0]?.key || 'crafting', category: undefined, level: 'all', tier: undefined, item: undefined })
})
const selectedMode = computed({
  get: () => currentFacility.value?.modes.some(entry => entry.key === route.query.mode) ? String(route.query.mode) : currentFacility.value?.modes[0]?.key || 'equipment',
  set: mode => replaceQuery({ mode, category: undefined, level: 'all', tier: undefined, item: undefined })
})
const currentFacility = computed(() => recipeFacilities.value.find(facility => facility.key === selectedFacility.value) || recipeFacilities.value[0] || null)
const currentMode = computed(() => currentFacility.value?.modes.find(mode => mode.key === selectedMode.value) || currentFacility.value?.modes[0] || null)
const facilityOptions = computed(() => recipeFacilities.value.map(facility => ({ value: facility.key, label: facility.name })))
const modeOptions = computed(() => (currentFacility.value?.modes || []).map(mode => ({ value: mode.key, label: mode.name })))

/*
 * 统一从当前可见配方推导出「分类」选项：
 * - 锻造台装备打造：武器(pos=1) / 防具(pos=2~5) / 饰品(pos>=6，有可见条目才渲染)
 * - 工作台：原始 category='加工' 在游戏界面上对应「材料」，其余保留「道具」
 * - 制药台：恢复 / 强化 / 加工
 */
const resolveRecipeCategory = recipe => {
  if (!recipe) return null
  if (currentMode.value?.key === 'equipment' || recipe.mode === 'equipment') {
    return EQUIP_POSITION_CATEGORY(recipe.position)
  }
  const rawCat = String(recipe.category || '').trim()
  if (!rawCat) return null
  if (selectedFacility.value === 'workbench' && rawCat === '加工') {
    return { value: '材料', label: '材料' }
  }
  return { value: rawCat, label: rawCat }
}

const visibleModeRecipes = computed(() =>
  (currentMode.value?.recipes || []).filter(recipe => !isFacilityRecipeHidden({ ...recipe, mode: currentMode.value?.key }))
)

const categoryOptions = computed(() => {
  const seen = new Map()
  for (const recipe of visibleModeRecipes.value) {
    const cat = resolveRecipeCategory(recipe)
    if (cat && !seen.has(cat.value)) seen.set(cat.value, cat)
  }
  if (seen.size <= 1) return []
  const ordered = Array.from(seen.values()).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.value)
    const bi = CATEGORY_ORDER.indexOf(b.value)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  return [{ value: 'all', label: '全部' }, ...ordered]
})

const selectedCategory = computed({
  get: () => {
    const q = String(route.query.category || '')
    return categoryOptions.value.some(opt => opt.value === q && q !== 'all') ? q : 'all'
  },
  set: category => replaceQuery({ category: category === 'all' ? undefined : category, level: 'all', tier: undefined })
})

const categoryMatchedRecipes = computed(() => {
  if (selectedCategory.value === 'all') return visibleModeRecipes.value
  return visibleModeRecipes.value.filter(recipe => resolveRecipeCategory(recipe)?.value === selectedCategory.value)
})

const levelOptions = computed(() => {
  const isEquipMode = currentMode.value?.key === 'equipment'
  /*
   * 等级按钮**从实际可见的配方反推**，而不是照抄 `mode.levels`。
   *
   * 🔴 照抄 `mode.levels` 会留下「点了是空列表」的空等级按钮：黑名单会把某级的配方
   * 整级滤空（工作台 6/7 级、制药台 6 级、磨坊 4 级），而 `mode.levels` 里那些级还在。
   * 装备打造模式与普通设施必须用同一个口径（`isFacilityRecipeHidden`）。
   */
  const visibleLevels = new Set(categoryMatchedRecipes.value.map(recipe => Number(recipe.level)))
  return [
    { value: 'all', label: '全部' },
    ...(currentMode.value?.levels || [])
      .filter(level => visibleLevels.has(Number(level)))
      .map(level => ({
        value: level,
        label: `${level}${isEquipMode ? '阶' : '级'}`
      }))
  ]
})

const selectedLevel = computed({
  get: () => {
    const rawLevel = Number(route.query.level || route.query.tier)
    const valid = levelOptions.value.some(opt => opt.value !== 'all' && Number(opt.value) === rawLevel)
    return valid ? rawLevel : 'all'
  },
  set: level => replaceQuery({ level, tier: undefined })
})

const searchQuery = computed({ get: () => String(route.query.q || ''), set: q => replaceQuery({ q }) })
const targetItemId = computed(() => String(route.query.item || ''))

const filteredRecipes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return categoryMatchedRecipes.value.filter(recipe => {
    if (selectedLevel.value !== 'all' && Number(recipe.level) !== Number(selectedLevel.value)) return false
    if (!query) return true
    return [recipe.output?.name, recipe.output?.typeId, ...(recipe.materials || []).flatMap(material => [material.name, material.typeId])]
      .some(value => String(value || '').toLowerCase().includes(query))
  })
})

watch(section, async () => {
  // A recipe deep link has its own target alignment; ordinary tab changes start at the top.
  if (!isCamp.value && targetItemId.value) return
  await nextTick()
  resolveScrollTarget(isCamp.value ? '#campFacilitiesScroll' : '#facilitiesScroll').scrollTo({ top: 0, behavior: 'auto' })
})

watch([isDataReady, () => route.query.facility, () => route.query.mode, targetItemId], async () => {
  if (!isDataReady.value || isCamp.value || !targetItemId.value) return
  await nextTick()
  document.querySelector('.facility-recipe.is-target')?.scrollIntoView({ block: 'center' })
})

const loadFacilitiesData = async () => {
  isDataReady.value = false
  errorMessage.value = ''
  try {
    facilities.value = await fetchWithFallback('data/parsed/facilities.json')
    if (!Array.isArray(facilities.value)) throw new Error('设施数据格式不正确')
  } catch (error) {
    console.error('加载设施功能失败:', error)
    errorMessage.value = '设施数据加载失败，请重试'
  } finally {
    isDataReady.value = true
  }
}

onMounted(() => {
  loadFacilitiesData()
})

const toRewardRule = material => ({
  typeId: material.typeId,
  targetName: material.name,
  targetImg: getImageUrl(material.img),
  targetQuality: material.quality,
  min: material.num,
  max: material.num
})
const openItem = typeId => typeId && router.push({ query: { ...route.query, itemId: typeId } })
const formatAmount = (min, max) => Number(min) === Number(max) ? min : `${min}~${max}`
const formatChance = chance => `${Number((Number(chance || 0) * 100).toFixed(1))}%`
const qualityName = quality => ({ 3: '蓝', 4: '紫', 5: '橙' }[quality] || `品质${quality}`)
const formatRecipeSubBadge = recipe => {
  const isEquip = currentMode.value?.key === 'equipment' || recipe.mode === 'equipment'
  const lvLabel = `${recipe.level}${isEquip ? '阶' : '级'}`
  const catLabel = resolveRecipeCategory(recipe)?.label
  return catLabel ? `${lvLabel} · ${catLabel}` : lvLabel
}
const formatDuration = seconds => {
  const value = Number(seconds) || 0
  if (value < 60) return `制作 ${value} 秒`
  const minutes = Math.floor(value / 60)
  const remain = value % 60
  return `制作 ${minutes} 分${remain ? `${remain} 秒` : ''}`
}
</script>

<style scoped>
.facility-count { font-size: 13px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.facility-count strong { color: var(--accent-ink); }

.facilities-grid {
  background: var(--paper);
  padding: 14px;
}

.facilities-grid :deep(.ui-card-grid) {
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 10px;
  align-items: stretch;
}

.facility-intro {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--paper-soft);
  min-width: 0;
}

.facility-intro__image {
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid var(--border-faint);
}

.facility-intro__image img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.facility-intro__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.facility-intro__name {
  font-size: 15px;
  color: var(--text-main);
}

.facility-intro__desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
}

.facility-recipe {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 10px;
  padding: 10px 12px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  box-shadow: 0 2px 5px rgba(62, 42, 20, 0.06);
  min-width: 0;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.facility-recipe:hover {
  transform: translateY(-1px);
  border-color: var(--accent-bright);
  box-shadow: 0 4px 10px rgba(62, 42, 20, 0.12);
}

.facility-recipe.is-target {
  border-color: var(--accent-bright);
  box-shadow: 0 0 0 2px rgba(122, 154, 153, 0.28);
}

.facility-output {
  appearance: none;
  border: 0;
  border-right: 1px dashed var(--border-faint);
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 2px 10px 2px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  min-width: 0;
}

.facility-output__icon {
  width: 58px;
  height: 58px;
  flex: 0 0 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--border-faint);
  box-sizing: border-box;
}

.facility-output__icon.is-equip-frame {
  background: rgba(143, 115, 81, 0.1);
}

.facility-output__icon img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.22));
}

.facility-output__name {
  width: 100%;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text-main);
  text-align: center;
  word-break: break-word;
}

.facility-output__badge {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(143, 115, 81, 0.12);
  border-radius: 999px;
  padding: 1px 7px;
  white-space: nowrap;
}

.facility-materials {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
}

.facility-materials__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
}

.facility-materials__head strong {
  font-size: 12.5px;
  color: var(--text-main);
}

.facility-materials__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  margin-left: auto;
}

.meta-pill {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(143, 115, 81, 0.12);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}

.meta-pill.is-improved {
  color: var(--accent-ink);
  background: rgba(198, 146, 52, 0.18);
}

.facility-materials__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(115px, 1fr));
  gap: 6px;
}

.facility-materials__grid :deep(.ui-reward-card) {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 7px;
  gap: 7px;
  background: var(--paper);
  border-color: var(--border-faint);
  border-radius: 6px;
  box-shadow: none;
}

.facility-materials__grid :deep(.ui-reward-card.is-clickable:hover) {
  border-color: var(--accent-bright);
  box-shadow: 0 2px 6px rgba(62, 42, 20, 0.12);
}

.facility-materials__grid :deep(.ui-reward-card__icon) {
  width: 34px;
  height: 34px;
}

.facility-materials__grid :deep(.ui-reward-card__icon img) {
  width: 28px;
  height: 28px;
}

.facility-materials__grid :deep(.ui-reward-card__name) {
  font-size: 12px;
}

.quality-chances {
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px dashed var(--border-faint);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  font-size: 11.5px;
}

.quality-chances__label {
  color: var(--text-muted);
  margin-right: 2px;
}

.quality-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.facility-empty {
  grid-column: 1 / -1;
}

@media (max-width: 960px) {
  .facilities-grid :deep(.ui-card-grid) {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .facilities-grid { padding: 10px; }
  .facility-intro { padding: 9px 10px; gap: 10px; }
  .facility-intro__image { width: 48px; height: 48px; flex-basis: 48px; }
  .facility-intro__image img { width: 42px; height: 42px; }
  .facility-recipe { grid-template-columns: 88px minmax(0, 1fr); gap: 8px; padding: 10px; }
  .facility-output { gap: 4px; padding-right: 8px; }
  .facility-output__name { font-size: 12.5px; }
  .facility-output__icon { width: 52px; height: 52px; flex-basis: 52px; }
  .facility-output__icon img { width: 42px; height: 42px; }
  .facility-materials__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .facility-materials__grid :deep(.ui-reward-card) { gap: 5px; padding: 5px 6px; }
  .facility-materials__grid :deep(.ui-reward-card__icon) { width: 34px; height: 34px; }
  .facility-materials__grid :deep(.ui-reward-card__icon img) { width: 28px; height: 28px; }
  .facility-materials__grid :deep(.ui-reward-card__name) { font-size: 11.5px; }
}
</style>
