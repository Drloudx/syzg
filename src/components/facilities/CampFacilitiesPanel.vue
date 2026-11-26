<template>
    <UiFilterPanel class="filter-panel paper-panel camp-filter-panel">
      <template #search>
        <UiSearchInput :model-value="search" :placeholder="isResearch ? '搜索研究、效果或材料...' : '搜索建筑、效果或材料...'" @update:model-value="setSearch" />
      </template>
      <slot name="section-tabs" />
      <UiFilterRow v-if="isResearch" label="分类：">
        <UiFilterPill :active="!team" @click="setTeam('')">全部</UiFilterPill>
        <UiFilterPill v-for="option in teams" :key="option.id" :active="team === option.id" @click="setTeam(option.id)">{{ option.name }}</UiFilterPill>
      </UiFilterRow>
      <template v-else>
        <UiFilterRow v-if="matches.length" label="建筑：">
          <UiFilterPill
            v-for="entry in matches"
            :key="entry.id"
            :active="selected?.id === entry.id"
            :aria-label="entry.name"
            @click="selectEntry(entry.id)"
          >{{ entry.name }}</UiFilterPill>
        </UiFilterRow>
        <UiFilterRow v-if="selected" class="camp-level-selector" label="等级：">
          <UiFilterPill :active="level === 'all'" @click="setLevel('all')">全部</UiFilterPill>
          <UiFilterPill v-for="entry in selected.levels" :key="entry.level" :active="level === entry.level" @click="setLevel(entry.level)">{{ entry.level }}级</UiFilterPill>
        </UiFilterRow>
      </template>
      <div class="camp-count">共 <span class="count-num">{{ isResearch ? matches.length : (selected ? visibleLevels.length : 0) }}</span> 项</div>
    </UiFilterPanel>

    <UiCardGrid id="campFacilitiesScroll" class="camp-grid paper-panel" wide>
      <UiEmptyState v-if="!selected" text="没有匹配的营地项目" />
      <div v-else-if="isResearch && !researchDetail" class="camp-content">
        <CampResearchTree :entries="camp.research" :matches="matches" @select="selectResearch" />
      </div>
      <div v-else class="camp-content" :class="{ 'camp-research-detail': isResearch }">
        <div class="camp-heading">
          <div class="camp-heading-portrait" :class="{ 'is-research': isResearch }" :style="isResearch ? { backgroundImage: `url('${getImageUrl('/images/CampCenterPanel/build_tree_iconbotm.webp')}')` } : {}">
            <img :src="getImageUrl(selected.icon)" :alt="selected.name" @error="handleImageError" />
          </div>
          <div class="camp-heading-info">
            <div class="camp-heading-title-row">
              <h2>{{ selected.name }}</h2>
              <span v-if="!isResearch && maxLevel" class="camp-max-badge">最高 {{ maxLevel }} 级</span>
              <span v-else-if="isResearch && maxLevel" class="camp-max-badge">共 {{ maxLevel }} 级</span>
              <UiButton v-if="isResearch" class="camp-overview-button" variant="secondary" size="sm" @click="showResearchTree">返回研究树</UiButton>
            </div>
            <p v-if="isResearch">{{ selected.description }}</p>
            <p v-else-if="selected.unlockCondition">开放条件：{{ selected.unlockCondition }}</p>
          </div>
        </div>

        <div v-if="isResearch" class="camp-research-controls">
          <UiFilterRow class="camp-level-selector camp-level-selector--inline" label="等级：">
            <UiFilterPill :active="level === 'all'" @click="setLevel('all')">全部</UiFilterPill>
            <UiFilterPill v-for="entry in selected.levels" :key="entry.level" :active="level === entry.level" @click="setLevel(entry.level)">{{ entry.level }}级</UiFilterPill>
          </UiFilterRow>
          <div class="camp-prereq-row">
            <span class="camp-prereq-label">前置研究</span>
            <button v-if="selected.prerequisite" type="button" class="camp-recipe-chip" @click="goPrerequisite">{{ selected.prerequisite.name }} 1级</button>
            <span v-else class="camp-prereq-none">无</span>
          </div>
        </div>

        <div class="camp-level-grid" :class="{ 'is-single': visibleLevels.length === 1, 'is-research': isResearch }">
        <UiSection v-for="entry in visibleLevels" :key="`${selected.id}:${entry.level}`" class="camp-level" :data-level="entry.level" :title="levelTitle(entry)">
          <template v-if="isResearch">
            <div class="camp-research-effect"><span>研究效果</span><strong>{{ selected.description }} {{ previousEffect(entry.level) }} → {{ entry.effect }}</strong></div>
            <UiInfoRow label="研究条件">
              <span class="camp-condition-group">
                <span v-if="entry.playerLevel">玩家等级 {{ entry.playerLevel }}级</span>
                <button v-if="canLocateBuilding(entry)" type="button" class="camp-recipe-chip" @click="goBuilding(entry)">{{ entry.buildingName }} {{ entry.buildingLevel }}级</button>
                <span v-else-if="entry.buildingName">{{ entry.buildingName }} {{ entry.buildingLevel }}级</span>
              </span>
            </UiInfoRow>
            <UiInfoRow label="研究时间" :value="formatCampDuration(entry.timeSeconds)" />
            <div class="camp-materials">
              <h4>研究消耗</h4>
              <div class="camp-rewards">
                <UiRewardCard v-for="(cost, index) in entry.costs" :key="index" :rule="toRule(cost)" clickable @click="openItem(cost.typeId)" />
              </div>
              <p v-if="!entry.costs.length">无需消耗</p>
            </div>
            <div v-if="entry.recipes.length" class="camp-links">
              <span>解锁改良配方</span>
              <div class="camp-recipe-chips">
                <button v-for="recipe in entry.recipes" :key="recipe.id" type="button" class="camp-recipe-chip" @click="goRecipe(recipe)">
                  <img v-if="recipe.img" class="camp-recipe-icon" :src="getImageUrl(recipe.img)" alt="" @error="handleImageError" />
                  <span>{{ recipe.name }}</span>
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="camp-upgrade-comparison" :class="{ 'is-max': !entry.upgrade }">
              <div class="camp-upgrade-stage">
                <div class="camp-stage-head">
                  <img :src="getImageUrl(entry.icon)" :alt="`${selected.name}${entry.level}级`" @error="handleImageError" />
                  <h4>当前 {{ entry.level }}级{{ !entry.upgrade ? '（满级）' : '' }}</h4>
                </div>
                <p v-if="entry.description" class="camp-description">{{ entry.description }}</p>
                <UiInfoRow v-for="stat in entry.stats" :key="stat.key" :label="stat.label" :value="stat.value" />
                <div v-if="entry.recipes.length" class="camp-links">
                  <span>本级开放配方</span>
                  <div class="camp-recipe-chips">
                    <button v-for="recipe in entry.recipes" :key="recipe.id" type="button" class="camp-recipe-chip" @click="goRecipe(recipe)">
                      <img v-if="recipe.img" class="camp-recipe-icon" :src="getImageUrl(recipe.img)" alt="" @error="handleImageError" />
                      <span>{{ recipe.name }}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="entry.upgrade" class="camp-upgrade-stage is-next">
                <div class="camp-stage-head">
                  <img :src="getImageUrl(nextLevel(entry).icon)" :alt="`${selected.name}${entry.upgrade.toLevel}级`" @error="handleImageError" />
                  <h4>升级后 {{ entry.upgrade.toLevel }}级</h4>
                </div>
                <p v-if="nextLevel(entry)?.description" class="camp-description">{{ nextLevel(entry).description }}</p>
                <UiInfoRow v-for="stat in nextLevel(entry)?.stats || []" :key="stat.key" :label="stat.label" :value="stat.value" />
                <div v-if="nextLevel(entry)?.recipes.length" class="camp-links">
                  <span>升级后开放配方</span>
                  <div class="camp-recipe-chips">
                    <button v-for="recipe in nextLevel(entry).recipes" :key="recipe.id" type="button" class="camp-recipe-chip" @click="goRecipe(recipe)">
                      <img v-if="recipe.img" class="camp-recipe-icon" :src="getImageUrl(recipe.img)" alt="" @error="handleImageError" />
                      <span>{{ recipe.name }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <template v-if="entry.upgrade">
              <div class="camp-upgrade-meta">
                <UiInfoRow label="升级条件">
                  <span v-if="entry.upgrade.playerLevel">玩家等级 {{ entry.upgrade.playerLevel }}级</span>
                  <button
                    v-if="entry.upgrade.centerLevel"
                    type="button"
                    class="camp-recipe-chip"
                    @click="goBuilding({ building: 'center', buildingLevel: entry.upgrade.centerLevel })"
                  >营地中心 {{ entry.upgrade.centerLevel }}级</button>
                </UiInfoRow>
                <div v-if="nextLevel(entry)?.appearance" class="camp-links camp-links--inline">
                  <span>建筑外观</span>
                  <button type="button" class="camp-recipe-chip" @click="goFurniture(nextLevel(entry).appearance.id)">
                    {{ nextLevel(entry).appearance.name }}
                  </button>
                </div>
              </div>
              <div class="camp-materials">
                <h4>升级消耗</h4>
                <div class="camp-rewards">
                  <UiRewardCard v-for="(cost, index) in entry.upgrade.costs" :key="index" :rule="toRule(cost)" clickable @click="openItem(cost.typeId)" />
                </div>
                <p v-if="!entry.upgrade.costs.length">无需消耗</p>
              </div>
              <div v-if="entry.upgrade.rewards.length" class="camp-materials">
                <h4>升级奖励</h4>
                <div class="camp-rewards">
                  <UiRewardCard v-for="(reward, index) in entry.upgrade.rewards" :key="index" :rule="toRule(reward)" clickable @click="openItem(reward.typeId)" />
                </div>
              </div>
            </template>
          </template>
        </UiSection>
        </div>
      </div>
    </UiCardGrid>
    <UiBackToTop scroll-container="#campFacilitiesScroll" />
</template>

<script setup>
import { computed, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getImageUrl } from '../../utils/env.js'
import { formatCampDuration } from '../../utils/campFacilityData.js'
import { resolveScrollTarget } from '../../utils/scrollTarget.js'
import CampResearchTree from './CampResearchTree.vue'
import { UiBackToTop, UiButton, UiCardGrid, UiEmptyState, UiFilterPill, UiFilterRow, UiInfoRow, UiRewardCard, UiFilterPanel, UiSearchInput, UiSection } from '../ui/index.js'

const props = defineProps({ camp: { type: Object, required: true }, mode: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const isResearch = computed(() => props.mode === 'research')
const search = computed(() => String(route.query.q || ''))
const team = computed(() => String(route.query.group || ''))
const entries = computed(() => isResearch.value ? props.camp.research : props.camp.buildings)
const teams = computed(() => [...new Map(props.camp.research.map(entry => [entry.team, { id: entry.team, name: entry.teamName }])).values()])
const matches = computed(() => {
  const query = search.value.trim().toLowerCase()
  return entries.value.filter(entry => (!isResearch.value || !team.value || entry.team === team.value)
    && (!query || [entry.name, entry.description, ...entry.levels.flatMap(level => [level.description, level.effect,
      ...(level.costs || level.upgrade?.costs || []).map(cost => cost.name),
      ...(level.upgrade?.rewards || []).map(reward => reward.name)])].some(value => String(value || '').toLowerCase().includes(query))))
})
const selected = computed(() => matches.value.find(entry => entry.id === route.query[isResearch.value ? 'research' : 'building']) || matches.value[0])
const maxLevel = computed(() => selected.value?.levels?.at(-1)?.level || 0)
const researchDetail = computed(() => isResearch.value && !!route.query.research && selected.value?.id === route.query.research)
const level = computed(() => selected.value?.levels.some(entry => entry.level === Number(route.query.level)) ? Number(route.query.level)
  : route.query.level === 'all' ? 'all' : (isResearch.value ? 'all' : selected.value?.levels[0]?.level || 'all'))
const visibleLevels = computed(() => (selected.value?.levels || []).filter(entry => level.value === 'all' || entry.level === level.value))
const updateQuery = patch => {
  const query = { ...route.query, ...patch }
  for (const key of Object.keys(query)) if (query[key] === '' || query[key] == null) delete query[key]
  return router.replace({ query })
}
const setSearch = q => updateQuery({ q, level: 'all' })
const setTeam = group => updateQuery({ group, research: undefined, level: 'all' })
const selectEntry = id => updateQuery({ [isResearch.value ? 'research' : 'building']: id, level: 'all' })
const selectResearch = id => updateQuery({ research: id, q: undefined, level: 'all' })
const showResearchTree = () => updateQuery({ research: undefined, level: undefined })
const setLevel = value => updateQuery({ [isResearch.value ? 'research' : 'building']: selected.value?.id, level: value })
const goPrerequisite = () => updateQuery({ research: selected.value.prerequisite.id, group: undefined, q: undefined, level: 'all' })
const canLocateBuilding = entry => props.camp.buildings.some(building => building.id === entry.building && building.levels.some(level => level.level === entry.buildingLevel))
const goBuilding = entry => router.push({ path: '/facilities', query: { facility: 'camp', mode: 'building', building: entry.building, level: entry.buildingLevel } })
const goRecipe = recipe => router.push({ path: '/facilities', query: { facility: recipe.facility, mode: 'crafting', level: recipe.level, item: recipe.itemId } })
const goFurniture = id => router.push({ path: '/furniture', query: { id } })
const openItem = itemId => router.push({ query: { ...route.query, itemId } })
const nextLevel = entry => selected.value.levels.find(candidate => candidate.level === entry.upgrade?.toLevel)
const previousEffect = value => selected.value.levels.find(entry => entry.level === value - 1)?.effect || '未研究'
const levelTitle = entry => isResearch.value ? `${entry.level}级研究` : entry.upgrade ? `${entry.level}级 → ${entry.upgrade.toLevel}级` : `${entry.level}级 · 满级`
const toRule = item => ({ typeId: item.typeId, targetName: item.name, targetImg: getImageUrl(item.img), targetQuality: item.quality, min: item.num, max: item.num })
const handleImageError = event => { event.target.onerror = null; event.target.src = getImageUrl('/ui/visibility-off.svg') }
watch([() => props.mode, () => selected.value?.id, researchDetail], async () => {
  await nextTick()
  resolveScrollTarget('#campFacilitiesScroll').scrollTo({ top: 0, behavior: 'auto' })
})
</script>

<style scoped>
/* The shared active pill uses a background token as text; keep camp controls readable in both themes. */
.camp-filter-panel :deep(.ui-filter-pill.is-active), .camp-level-selector :deep(.ui-filter-pill.is-active) { color: var(--on-wood-text) !important; }
.camp-count { font-size: 13px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.camp-count .count-num { color: var(--accent-ink); }
/* The page shell clips this surface below the sticky filters on desktop. */
.camp-grid { background: var(--paper); padding: 14px; }
.camp-grid :deep(.ui-card-grid) { grid-template-columns: minmax(0, 1fr); }
.camp-content { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.camp-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--paper-soft);
  min-width: 0;
}
.camp-heading-portrait {
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid var(--border-faint);
  background: rgba(143, 115, 81, 0.1);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.camp-heading img { width: 48px; height: 48px; object-fit: contain; }
.camp-heading-portrait.is-research { border-color: transparent; background-color: transparent; }
.camp-heading-portrait.is-research img { width: 42px; height: 42px; }
.camp-heading-info { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.camp-heading-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }
.camp-heading h2 { font-size: 15.5px; margin: 0; line-height: 1.4; letter-spacing: 0; color: var(--text-main); }
.camp-max-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(143, 115, 81, 0.12);
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
}
.camp-heading p, .camp-description, .camp-materials p { margin: 0; font-size: 12.5px; line-height: 1.55; white-space: pre-line; overflow-wrap: anywhere; color: var(--text-muted); }
.camp-description { color: var(--text-main); font-size: 13px; }
.camp-research-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  padding: 8px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--paper-soft);
}
.camp-level-selector--inline { padding: 0; border: 0; }
.camp-prereq-row { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; margin-left: auto; }
.camp-prereq-label { color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.camp-prereq-none { color: var(--text-muted); }
.camp-level-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 12px; align-items: start; }
.camp-level-grid.is-research { grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); }
.camp-level-grid.is-single { grid-template-columns: minmax(0, 1fr); }
.camp-level { margin: 0; padding: 12px 14px; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--paper-soft); box-shadow: 0 2px 5px rgba(62, 42, 20, 0.05); }
.camp-upgrade-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; align-items: stretch; }
.camp-upgrade-comparison.is-max { grid-template-columns: minmax(0, 1fr); }
.camp-upgrade-stage {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: var(--paper);
  border: 1px solid var(--border-faint);
  border-radius: 6px;
}
.camp-upgrade-stage.is-next { border-color: rgba(122, 154, 153, 0.42); }
.camp-stage-head { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-bottom: 6px; border-bottom: 1px dashed var(--border-faint); }
.camp-stage-head > img { display: block; width: 64px; height: 64px; object-fit: contain; }
.camp-stage-head > h4 { text-align: center; margin: 0; font-size: 13px; font-weight: 700; color: var(--text-main); }
.camp-upgrade-stage.is-next .camp-stage-head > h4 { color: var(--accent-ink); }
.camp-upgrade-meta { display: flex; flex-direction: column; gap: 6px; padding-top: 2px; border-top: 1px dashed var(--border-faint); }
.camp-research-effect { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-left: 3px solid var(--accent-ink); border-radius: 0 6px 6px 0; background: var(--paper); margin-bottom: 10px; font-size: 12.5px; line-height: 1.6; }
.camp-research-effect > span { color: var(--text-muted); font-size: 11.5px; }
.camp-research-effect > strong { font-weight: 600; color: var(--text-main); }
.camp-condition-group { display: inline-flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 4px 6px; }
.camp-heading-title-row .camp-overview-button { margin-left: auto; flex: 0 0 auto; }
.camp-overview-button { background: var(--input-bg); color: var(--input-text); }
.camp-level :deep(.ui-section__title) { letter-spacing: 0; }
.camp-level :deep(.ui-info-row) { line-height: 1.6; }
.camp-materials h4 { font-size: 13px; line-height: 1.6; margin: 10px 0 6px; color: var(--text-main); }
.camp-rewards { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 8px; }
.camp-research-detail .camp-rewards { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.camp-rewards :deep(.ui-reward-card) { background: var(--paper); border-color: var(--border-faint); border-radius: 6px; box-shadow: none; }
.camp-rewards :deep(.ui-reward-card__name) { white-space: normal; overflow-wrap: anywhere; line-height: 1.5; font-size: 12px; }
.camp-links { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 2px; font-size: 12.5px; line-height: 1.5; }
.camp-links--inline { flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 8px; margin-top: 0; padding: 4px 0; }
.camp-links > span { color: var(--text-muted); font-size: 12px; font-weight: 600; }
.camp-recipe-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.camp-recipe-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--paper-soft);
  color: var(--text-main);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
}
.camp-recipe-chip:hover { border-color: var(--accent-bright); color: var(--accent-ink); box-shadow: 0 2px 5px rgba(62, 42, 20, 0.1); }
.camp-recipe-icon { width: 18px; height: 18px; flex: 0 0 18px; object-fit: contain; }
@media (max-width: 640px) {
  .camp-grid { padding: 10px; }
  .camp-content { gap: 10px; }
  .camp-heading { padding: 9px 10px; gap: 10px; }
  .camp-heading-portrait { width: 48px; height: 48px; flex-basis: 48px; }
  .camp-heading img { width: 42px; height: 42px; }
  .camp-level-grid, .camp-level-grid.is-research { grid-template-columns: minmax(0, 1fr); }
  .camp-level { padding: 10px; }
  .camp-research-controls { padding: 8px 10px; }
  .camp-prereq-row { margin-left: 0; }
  .camp-upgrade-comparison { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .camp-upgrade-stage { padding: 9px 10px; gap: 6px; }
  .camp-stage-head { flex-direction: row; justify-content: flex-start; gap: 10px; padding-bottom: 6px; }
  .camp-stage-head > img { width: 44px; height: 44px; }
  .camp-stage-head > h4 { text-align: left; }
  .camp-upgrade-stage :deep(.ui-info-row) { flex-wrap: wrap; gap: 2px; }
  .camp-rewards, .camp-research-detail .camp-rewards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
}
</style>
