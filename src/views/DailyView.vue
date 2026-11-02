<template>
  <div class="page-view-container daily-page">
    <UiFilterPanel class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput
          :model-value="search"
          placeholder="搜索计划、关卡或怪物…（空格=“且”，、=“或”）"
          @update:model-value="setFilter('q', $event)"
        />
      </template>

      <UiFilterRow label="计划类型：">
        <UiFilterPill :active="!typeFilter" @click="setFilter('type', '')">全部</UiFilterPill>
        <UiFilterPill
          v-for="plan in plans"
          :key="plan.typeId"
          :active="typeFilter === plan.typeId"
          @click="setFilter('type', plan.typeId)"
        >{{ plan.name }}</UiFilterPill>
      </UiFilterRow>

      <UiFilterRow label="刷新日：">
        <UiFilterPill :active="!dayFilter" @click="setFilter('day', '')">全部</UiFilterPill>
        <UiFilterPill
          v-for="w in weekPlans"
          :key="w.day"
          :active="dayFilter === String(w.day)"
          @click="setFilter('day', String(w.day))"
        >{{ w.dayName }}</UiFilterPill>
      </UiFilterRow>

      <div class="collection-counter">
        共 <span class="count-num">{{ filteredPlans.length }}</span> 个计划
      </div>
    </UiFilterPanel>

    <UiEmptyState v-if="loading" type="loading" text="正在加载日常计划..." />
    <UiEmptyState v-else-if="error" type="error" :text="error" @retry="loadData" />
    <UiCardGrid v-else id="dailyScroll" class="daily-content paper-panel" :content-style="{ gridTemplateColumns: 'minmax(0, 1fr)' }">
      <div v-if="filteredPlans.length" class="daily-grid">
        <!-- 第一层：计划卡 -->
        <article
          v-for="plan in displayedPlans"
          :key="plan.typeId"
          class="plan-card"
          :class="{ 'is-open': openPlanId === plan.typeId }"
          :data-plan="plan.typeId"
        >
          <button type="button" class="plan-card__head" @click="togglePlan(plan.typeId)">
            <img class="plan-card__art" :src="planImg(plan.img)" :alt="plan.name" loading="lazy" decoding="async" />
            <span class="plan-card__meta">
              <span class="plan-card__title">{{ plan.name }}</span>
              <span class="plan-card__des">{{ plan.des }}</span>
              <span class="plan-card__tags">
                <UiTag tone="accent">持有上限 {{ plan.maxNum }}</UiTag>
                <UiTag v-if="planDayCount(plan.typeId)" tone="gold">每周 {{ planDayCount(plan.typeId) }} 天</UiTag>
                <UiTag v-if="plan.special" tone="danger">限时</UiTag>
              </span>
              <!-- 刷新日明细：用短标签排成一行，避免长串把卡片撑破 -->
              <span v-if="planDays(plan.typeId).length" class="plan-card__days">
                <span class="plan-card__days-label">刷新</span>
                <span v-for="d in planDays(plan.typeId)" :key="d.day" class="plan-card__day">
                  {{ d.dayName }}<em>×{{ d.num }}</em>
                </span>
              </span>
              <span v-if="plan.condition" class="plan-card__cond">
                解锁条件：<template v-for="(link, i) in plan.condition.links" :key="i">
                  <RouterLink class="cond-link" :to="link.route">{{ link.label }}</RouterLink>
                  <span v-if="i < plan.condition.links.length - 1"> · </span>
                </template>
                <span v-if="!plan.condition.links.length">{{ plan.condition.text || '无条件' }}</span>
              </span>
            </span>
            <span class="plan-card__arrow" aria-hidden="true">{{ openPlanId === plan.typeId ? '▾' : '▸' }}</span>
          </button>

          <!-- 第二层：子关卡列表 -->
          <div v-if="openPlanId === plan.typeId" class="stage-list">
            <article
              v-for="stage in plan.stages"
              :key="stage.battleId"
              class="stage-card"
              :class="{ 'is-open': openStageId === stage.battleId }"
              :data-stage="stage.battleId"
            >
              <button type="button" class="stage-card__head" @click="toggleStage(stage.battleId)">
                <img class="stage-card__thumb" :src="planImg(stage.img)" :alt="stage.name" loading="lazy" decoding="async" />
                <span class="stage-card__meta">
                  <span class="stage-card__title">{{ stage.name }}</span>
                  <span class="stage-card__des">{{ stage.des }}</span>
                  <span class="stage-card__tags">
                    <UiTag v-if="stage.battleLevel">Lv{{ stage.battleLevel }}</UiTag>
                    <UiTag v-if="stage.timeSeconds">{{ formatDuration(stage.timeSeconds) }}</UiTag>
                    <UiTag v-if="stage.monsters.length">{{ stage.monsters.length }} 种怪物</UiTag>
                  </span>
                  <span v-if="stage.condition" class="stage-card__cond">
                    解锁条件：<template v-for="(link, i) in stage.condition.links" :key="i">
                      <RouterLink class="cond-link" :to="link.route">{{ link.label }}</RouterLink>
                      <span v-if="i < stage.condition.links.length - 1"> · </span>
                    </template>
                    <span v-if="!stage.condition.links.length">{{ stage.condition.text || '无条件' }}</span>
                  </span>
                </span>
                <span class="stage-card__arrow" aria-hidden="true">{{ openStageId === stage.battleId ? '▾' : '▸' }}</span>
              </button>

              <!-- 第三层：关卡详情 -->
              <div v-if="openStageId === stage.battleId" class="stage-detail">
                <p v-if="stage.battleDes || stage.battleTip" class="stage-detail__des">
                  {{ stage.battleDes || stage.battleTip }}
                </p>

                <UiSection v-if="stage.monsters.length" title="怪物">
                  <div class="monster-grid">
                    <div v-for="mon in stage.monsters" :key="mon.typeId" class="monster-cell" :title="mon.name">
                      <img
                        class="monster-cell__icon"
                        :src="monIcon(mon.icon)"
                        :alt="mon.name"
                        loading="lazy"
                        decoding="async"
                        @error="handleImageFallback"
                      />
                      <span class="monster-cell__name">{{ mon.name }}</span>
                      <span v-if="mon.levelScale !== 1" class="monster-cell__scale">×{{ mon.levelScale }}</span>
                    </div>
                  </div>
                </UiSection>

                <UiSection v-if="stage.reward" title="结算掉落">
                  <div class="reward-summary">
                    <UiTag v-if="stage.reward.exp">经验 {{ stage.reward.exp }}</UiTag>
                    <UiTag v-if="stage.reward.money" tone="gold">银币 {{ stage.reward.money }}</UiTag>
                    <UiTag v-if="stage.reward.heroExp">伙伴经验 {{ stage.reward.heroExp }}</UiTag>
                    <UiTag v-if="stage.reward.equipExp">装备经验 {{ stage.reward.equipExp }}</UiTag>
                  </div>
                  <div v-if="stage.reward.items.length" class="reward-grid">
                    <UiRewardCard
                      v-for="(drop, di) in stage.reward.items"
                      :key="drop.typeId || `pool-${di}`"
                      :rule="rewardRule(drop)"
                      :clickable="Boolean(drop.typeId)"
                      @click="openItem(drop.typeId)"
                    />
                  </div>
                  <p v-else class="reward-empty">该关卡不掉落物品，仅给经验与银币。</p>
                </UiSection>

                <RouterLink v-if="stage.battleRoute" class="stage-detail__link" :to="stage.battleRoute">
                  在副本图鉴中查看该关卡 →
                </RouterLink>
              </div>
            </article>
          </div>
        </article>
      </div>
      <UiEmptyState v-else text="没有符合条件的计划" />
    </UiCardGrid>
    <UiBackToTop scroll-container="#dailyScroll" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithFallback } from '../utils/request.js'
import { getImageUrl, handleImageFallback } from '../utils/env.js'
import { useLazyList } from '../composables/useLazyList.js'
import { UiFilterPanel, UiSearchInput, UiFilterRow, UiFilterPill, UiCardGrid, UiTag,
  UiEmptyState, UiBackToTop, UiSection, UiRewardCard } from '../components/ui/index.js'

const route = useRoute()
const router = useRouter()

const data = ref(null)
const loading = ref(true)
const error = ref('')

const queryString = key => (typeof route.query[key] === 'string' ? route.query[key] : '')
const search = computed(() => queryString('q'))
const typeFilter = computed(() => queryString('type'))
const dayFilter = computed(() => queryString('day'))
const openPlanId = computed(() => queryString('plan'))
const openStageId = computed(() => queryString('stage'))

const plans = computed(() => data.value?.plans || [])
const weekPlans = computed(() => data.value?.weekPlans || [])

/** 计划图 / 关卡缩略图都在同一目录 */
const planImg = name => (name ? `/images/DailyWorkPanel/${name}.webp` : '')
const monIcon = icon => (icon ? getImageUrl(`/HeadIconAtals/${icon}.webp`) : '')

function formatDuration(seconds) {
  const total = Number(seconds) || 0
  if (total >= 3600 && total % 3600 === 0) return `${total / 3600} 小时`
  if (total >= 60) return `${Math.round(total / 60)} 分钟`
  return `${total} 秒`
}

/** 某个计划在哪些天刷新 */
const dayMap = computed(() => {
  const map = new Map()
  for (const w of weekPlans.value) {
    for (const e of w.entries) {
      if (!map.has(e.typeId)) map.set(e.typeId, [])
      map.get(e.typeId).push({ day: w.day, dayName: w.dayName, num: e.num })
    }
  }
  return map
})
const planDays = typeId => dayMap.value.get(typeId) || []
const planDayCount = typeId => planDays(typeId).length

/** 掉落条目 → UiRewardCard 需要的字段 */
/**
 * 掉落条目 → UiRewardCard 需要的字段。
 *
 * `mode: 'equipGroup'` 的装备池没有具体物品 id（要按游戏掉落表随机），
 * 因此不给图标、不可点击，用 `detail` 说明是哪个池。
 */
const rewardRule = drop => ({
  targetName: drop.name,
  targetImg: drop.img ? getImageUrl(`/Common_ItemIcon/${drop.img}.webp`) : '',
  targetQuality: drop.quality,
  min: drop.min,
  max: drop.max,
  detail: drop.mode === 'equipGroup'
    ? `${drop.equipTypeGroup || '装备池'}${drop.equipLevel ? ` · Lv${drop.equipLevel}` : ''}`
    : ''
})

function matchesText(haystack, needle) {
  if (!needle) return true
  const text = haystack.filter(Boolean).join(' ').toLowerCase()
  const groups = needle.trim().toLowerCase().split('、')
  return groups.every(g => g.split(/\s+/).filter(Boolean).every(w => text.includes(w)))
}

const filteredPlans = computed(() => {
  const list = plans.value
  const day = dayFilter.value
  return list.filter(plan => {
    if (typeFilter.value && plan.typeId !== typeFilter.value) return false
    if (day) {
      const w = weekPlans.value.find(x => String(x.day) === day)
      if (!w || !w.entries.some(e => e.typeId === plan.typeId)) return false
    }
    return matchesText(
      [plan.name, plan.des, ...plan.stages.map(s => `${s.name} ${s.des} ${s.monsters.map(m => m.name).join(' ')}`)],
      search.value
    )
  })
})

const { displayedItems: displayedPlans } = useLazyList(filteredPlans, 12, '#dailyScroll')

function togglePlan(typeId) {
  const query = { ...route.query }
  if (query.plan === typeId) {
    delete query.plan
    delete query.stage
  } else {
    query.plan = typeId
    delete query.stage
  }
  router.replace({ query })
}

function toggleStage(battleId) {
  const query = { ...route.query }
  if (query.stage === battleId) delete query.stage
  else query.stage = battleId
  router.replace({ query })
}

function setFilter(key, value) {
  const query = { ...route.query }
  if (value) query[key] = value
  else delete query[key]
  router.replace({ query })
}

function openItem(typeId) {
  if (typeId) router.push({ query: { ...route.query, itemId: typeId } })
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    data.value = await fetchWithFallback('data/parsed/daily.json')
  } catch (cause) {
    error.value = '日常计划数据加载失败，请重试。'
    console.error('Failed to load daily plan data:', cause)
  } finally {
    loading.value = false
  }
}

watch(() => openPlanId.value, () => {
  const scroller = document.querySelector('#dailyScroll')
  if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' })
})

onMounted(loadData)
</script>

<style scoped>
.collection-counter { font-size: 13px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.filter-panel :deep(.ui-filter-pill.is-active) { color: var(--on-wood-text); }

.daily-content { background: var(--paper); padding: 12px 14px calc(88px + var(--safe-bottom, 0px)); }
.daily-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }

/* ── 第一层：计划卡 ── */
.plan-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  overflow: hidden;
}
.plan-card.is-open { grid-column: 1 / -1; }
.plan-card__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 0;
  background: transparent;
  color: var(--text-main);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.plan-card__head:hover { background: rgba(143, 115, 81, 0.06); }
/* 计划竖卡是 360×620 的长图，按高度约束避免撑高卡片 */
.plan-card__art {
  flex: 0 0 auto;
  width: 58px;
  height: 100px;
  object-fit: contain;
  object-position: center;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25));
}
.plan-card__meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.plan-card__title { font-size: 15px; font-weight: 700; }
.plan-card__des { font-size: 12px; line-height: 1.5; color: var(--text-muted); overflow-wrap: anywhere; }
.plan-card__tags { display: flex; flex-wrap: wrap; gap: 5px; }
.plan-card__cond { font-size: 12px; line-height: 1.5; color: var(--text-muted); overflow-wrap: anywhere; }
/* 刷新日明细：一行短标签，超出自动换行，不会把卡片横向撑破 */
.plan-card__days { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.plan-card__days-label { font-size: 11px; color: var(--text-muted); }
.plan-card__day {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  padding: 1px 5px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-main);
  background: rgba(143, 115, 81, 0.1);
  border-radius: 3px;
  white-space: nowrap;
}
.plan-card__day em { font-style: normal; font-weight: 700; color: var(--accent-ink); }
.plan-card__arrow { flex: none; font-size: 14px; color: var(--text-muted); }

.cond-link { color: var(--accent-ink); text-decoration: underline; text-underline-offset: 2px; }
.cond-link:hover { color: var(--accent-bright, var(--accent-ink)); }

/* ── 第二层：子关卡 ── */
.stage-list { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px; }
.stage-card { background: var(--paper); border: 1px solid var(--border-soft); border-radius: 5px; overflow: hidden; }
.stage-card__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 9px;
  border: 0;
  background: transparent;
  color: var(--text-main);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.stage-card__head:hover { background: rgba(143, 115, 81, 0.05); }
.stage-card__thumb {
  flex: 0 0 auto;
  width: 96px;
  height: 54px;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid var(--border-soft);
}
.stage-card__meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.stage-card__title { font-size: 14px; font-weight: 600; }
.stage-card__des { font-size: 12px; line-height: 1.45; color: var(--text-muted); overflow-wrap: anywhere; }
.stage-card__tags { display: flex; flex-wrap: wrap; gap: 5px; }
.stage-card__cond { font-size: 12px; line-height: 1.5; color: var(--text-muted); overflow-wrap: anywhere; }
.stage-card__arrow { flex: none; font-size: 13px; color: var(--text-muted); }

/* ── 第三层：详情 ── */
.stage-detail { padding: 4px 12px 12px; border-top: 1px dashed var(--border-soft); }
.stage-detail__des { margin: 10px 0 0; font-size: 13px; line-height: 1.6; color: var(--text-main); }

.monster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(74px, 1fr)); gap: 8px; }
.monster-cell { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; padding: 6px 4px; background: rgba(143, 115, 81, 0.06); border-radius: 5px; }
.monster-cell__icon { width: 42px; height: 42px; object-fit: contain; }
.monster-cell__name { font-size: 11px; line-height: 1.3; color: var(--text-muted); text-align: center; overflow-wrap: anywhere; }
.monster-cell__scale { position: absolute; top: 3px; right: 4px; font-size: 10px; font-weight: 700; color: var(--accent-ink); }

.reward-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.reward-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 220px)); gap: 8px; }
.reward-empty { margin: 0; font-size: 12px; color: var(--text-muted); }
.stage-detail__link { display: inline-block; margin-top: 10px; font-size: 12px; color: var(--accent-ink); text-decoration: underline; text-underline-offset: 2px; }

@media (max-width: 640px) {
  .daily-content { padding-inline: 10px; }
  .daily-grid { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .plan-card__art { width: 48px; height: 84px; }
  .stage-card__thumb { width: 72px; height: 42px; }
  .monster-grid { grid-template-columns: repeat(auto-fill, minmax(62px, 1fr)); }
  .reward-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
