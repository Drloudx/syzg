<template>
  <div class="page-view-container daily-page">
    <!-- 顶部筛选面板（标准书院 paper-panel，固定在顶部） -->
    <UiFilterPanel class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput
          :model-value="search"
          placeholder="搜索计划、关卡或怪物…（空格=“且”，、=“或”）"
          @update:model-value="setFilter('q', $event)"
        />
      </template>

      <UiFilterRow label="计划类型：">
        <UiFilterPill :active="!activePlan" @click="onTypeFilterClick('')">全部</UiFilterPill>
        <UiFilterPill
          v-for="plan in plans"
          :key="plan.typeId"
          :active="activePlan?.typeId === plan.typeId"
          @click="onTypeFilterClick(plan.typeId)"
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

      <!-- 刷新日日程摘要（从底部调整至筛选栏，与刷新日联动） -->
      <div v-if="currentDaySummaryText" class="filter-day-summary">
        <span class="summary-label">{{ currentDaySummaryLabel }}：</span>
        <span class="summary-content">{{ currentDaySummaryText }}</span>
      </div>

      <div class="collection-counter">
        共 <span class="count-num">{{ filteredPlans.length }}</span> 个计划
      </div>
    </UiFilterPanel>

    <UiEmptyState v-if="loading" type="loading" text="正在加载日常计划..." />
    <UiEmptyState v-else-if="error" type="error" :text="error" @retry="loadData" />

    <!-- 核心滚动区域：在标准 paper-panel 框架内滚动，严格限制在可视区内，不会超出搜索栏 -->
    <div v-else id="dailyScroll" class="daily-scroll-container paper-panel" data-main-scroll>
      <!-- ══════════════════════════════════════════════════
           模式 A：陈列态（一排 4 个大书院卡片，仅使用原版立绘图）
           ══════════════════════════════════════════════════ -->
      <section v-if="!activePlan" class="shelf-section">
        <div v-if="filteredPlans.length" class="four-column-grid">
          <article
            v-for="plan in displayedPlans"
            :key="plan.typeId"
            class="plan-book-card"
            :class="{ 'is-special': plan.special }"
            @click="selectPlan(plan.typeId)"
          >
            <!-- 卡片封面原画区（纯净原图全景展示） -->
            <div class="card-cover">
              <img
                class="cover-art"
                :src="planImg(plan.img)"
                :alt="plan.name"
                loading="lazy"
                decoding="async"
              />
              <div class="cover-badge">
                <span class="badge-limit">持有上限 {{ plan.maxNum }}</span>
                <span v-if="plan.special" class="badge-special">限时</span>
              </div>
            </div>

            <!-- 卡片内容排版（标准大书院 UI，去除冗余的周刷新列表，卡片更紧凑精炼） -->
            <div class="card-body">
              <div class="card-title-row">
                <h3 class="card-title">{{ plan.name }}</h3>
                <UiTag v-if="plan.stages?.length" tone="accent">{{ plan.stages.length }} 关卡</UiTag>
              </div>

              <p class="card-des">{{ plan.des }}</p>

              <!-- 解锁条件 -->
              <div v-if="plan.condition" class="card-cond">
                <span class="cond-label">解锁：</span>
                <template v-for="(link, i) in plan.condition.links" :key="i">
                  <RouterLink class="cond-link" :to="link.route" @click.stop>{{ link.label }}</RouterLink>
                  <span v-if="i < plan.condition.links.length - 1"> · </span>
                </template>
                <span v-if="!plan.condition.links.length">{{ plan.condition.text || '无条件' }}</span>
              </div>
            </div>

            <!-- 底部进入箭头 -->
            <div class="card-footer">
              <span class="enter-text">查看关卡与掉落</span>
              <span class="enter-arrow">→</span>
            </div>
          </article>
        </div>
        <UiEmptyState v-else text="没有符合条件的计划" />
      </section>

      <!-- ══════════════════════════════════════════════════
           模式 B：作战详情态（去除左侧区域，全宽舒展大面板）
           ══════════════════════════════════════════════════ -->
      <section v-else class="detail-section">
        <!-- 计划总览横幅（全宽大书院风，取代原本拥挤的左侧大立绘） -->
        <div class="plan-hero-banner">
          <div class="hero-left">
            <img class="hero-cover-thumb" :src="planImg(activePlan.img)" :alt="activePlan.name" />
            <div class="hero-info">
              <div class="hero-title-row">
                <h2 class="hero-title">{{ activePlan.name }}</h2>
                <UiTag tone="accent">持有上限 {{ activePlan.maxNum }}</UiTag>
                <UiTag v-if="planDayCount(activePlan.typeId)" tone="gold">每周 {{ planDayCount(activePlan.typeId) }} 天</UiTag>
                <UiTag v-if="activePlan.special" tone="danger">限时</UiTag>
              </div>
              <p class="hero-des">{{ activePlan.des }}</p>
              <!-- 解锁条件（内嵌式书院胶囊，对齐项目标准 card-cond 规范） -->
              <div v-if="activePlan.condition" class="hero-cond-inline">
                <span class="cond-inline-label">解锁条件：</span>
                <template v-for="(link, i) in activePlan.condition.links" :key="i">
                  <RouterLink class="cond-link" :to="link.route">{{ link.label }}</RouterLink>
                  <span v-if="i < activePlan.condition.links.length - 1"> · </span>
                </template>
                <span v-if="!activePlan.condition.links.length">{{ activePlan.condition.text || '无条件' }}</span>
              </div>
              <!-- 刷新日 -->
              <div v-if="planDays(activePlan.typeId).length" class="hero-days">
                <span class="days-label">刷新分配：</span>
                <span v-for="d in planDays(activePlan.typeId)" :key="d.day" class="day-chip">
                  {{ d.dayName }}<em>×{{ d.num }}</em>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 关卡选择区（全宽横向卡片，支持古典按键切换 + 鼠标抓拽滑动） -->
        <div class="stage-select-box" :class="{ 'has-overflow-right': canScrollStages && !isStageAtEnd }">
          <div class="stage-select-header">
            <div class="stage-header-left">
              <span class="stage-select-title">选择关卡挑战</span>
              <span class="stage-select-sub">共 {{ activePlan.stages?.length || 0 }} 个关卡</span>
            </div>
            <div v-if="canScrollStages" class="stage-nav-group">
              <button
                type="button"
                class="stage-nav-btn"
                :class="{ 'is-disabled': isStageAtStart }"
                :disabled="isStageAtStart"
                aria-label="向左滚动关卡列表"
                title="向左滚动"
                @click="scrollStages('left')"
              >
                ‹
              </button>
              <button
                type="button"
                class="stage-nav-btn"
                :class="{ 'is-disabled': isStageAtEnd }"
                :disabled="isStageAtEnd"
                aria-label="向右滚动关卡列表"
                title="向右滚动"
                @click="scrollStages('right')"
              >
                ›
              </button>
            </div>
          </div>

          <div
            ref="stageGridRef"
            class="stage-cards-grid"
            :class="{ 'is-dragging': isStageDragging }"
            @scroll="syncStageScrollState"
            @pointerdown="handleStagePointerDown"
            @pointermove="handleStagePointerMove"
            @pointerup="finishStagePointerDrag"
            @pointercancel="cancelStagePointerDrag"
            @dragstart.prevent
          >
            <button
              v-for="stg in activePlan.stages"
              :key="stg.battleId"
              type="button"
              class="stage-card-item"
              :class="{ 'is-selected': stg.battleId === activeStage?.battleId }"
              @click="onStageCardClick(stg.battleId)"
              @dragstart.prevent
            >
              <div class="stage-card-thumb-wrap">
                <img
                  class="stage-card-thumb"
                  :src="planImg(stg.img)"
                  :alt="stg.name"
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                />
                <span v-if="stg.battleLevel" class="stage-card-lvl">Lv.{{ stg.battleLevel }}</span>
              </div>
              <div class="stage-card-meta">
                <div class="stage-card-name">{{ stg.name }}</div>
                <div class="stage-card-sub">{{ stg.des || stg.battleDes }}</div>
              </div>
              <div v-if="stg.battleId === activeStage?.battleId" class="stage-card-corner" />
            </button>
          </div>
        </div>

        <!-- 选中的关卡具体情报（全宽展开，对齐副本与关卡图鉴标准规范） -->
        <div v-if="activeStage" class="stage-detail-panel">
          <!-- ① 关卡基本信息 -->
          <UiSection title="关卡信息">
            <UiInfoRow label="所属计划" :value="activePlan.name" />
            <UiInfoRow label="关卡名称" :value="activeStage.name" />
            <UiInfoRow v-if="activeStage.battleLevel" label="推荐等级" :value="`Lv.${activeStage.battleLevel}`" />
            <UiInfoRow label="进入消耗">
              <div class="stage-entry-cost-group">
                <span class="cost-item">计划书 ×1</span>
                <span class="cost-sep">·</span>
                <span class="cost-item">
                  <img :src="getImageUrl(BASE_REWARD_PATHS.ti)" class="cost-ti-icon" alt="体力" />
                  <span>×20</span>
                </span>
              </div>
            </UiInfoRow>
            <UiInfoRow v-if="activeStage.timeSeconds" label="挑战限时" :value="formatDuration(activeStage.timeSeconds)" />
            <UiInfoRow v-if="activeStage.condition" label="解锁条件">
              <template v-for="(link, i) in activeStage.condition.links" :key="i">
                <RouterLink class="cond-link" :to="link.route">{{ link.label }}</RouterLink>
                <span v-if="i < activeStage.condition.links.length - 1"> · </span>
              </template>
              <span v-if="!activeStage.condition.links.length">{{ activeStage.condition.text || '无条件' }}</span>
            </UiInfoRow>
            <UiInfoRow v-if="activeStage.battleDes || activeStage.des" label="关卡描述" :value="activeStage.battleDes || activeStage.des" />
          </UiSection>

          <!-- ② 通关掉落（完全对齐关卡图鉴：使用 RewardPools，经验、银币均有专属图标与品质框） -->
          <UiSection title="通关掉落" data-source-entry="settlement">
            <template #title-end>
              <button
                v-if="activeStageDrops.length"
                type="button"
                class="prob-detail-btn"
                @click.stop="openRewardDetail('通关掉落', activeStageDrops)"
              >
                概率明细
              </button>
            </template>
            <RewardPools
              v-if="activeStageDrops.length"
              :entries="activeStageDrops"
              @item-click="goToItem"
            />
            <p v-else class="stage-empty-reward">暂无可展示的掉落配置</p>
          </UiSection>

          <!-- ③ 房间内容与掉落来源（完全按关卡图鉴规范，分房间、波次怪带图标、展示采集植物） -->
          <UiSection v-if="activeStage.rooms?.length" title="房间内容与掉落来源">
            <!-- 房间选项卡（多房间时展示，对齐关卡图鉴） -->
            <UiFilterRow v-if="activeStage.rooms.length > 1" label="房间：" class="stage-room-tabs">
              <UiFilterPill
                :active="selectedRoomKey === null"
                @click="selectedRoomKey = null"
              >
                全部
              </UiFilterPill>
              <UiFilterPill
                v-for="room in activeStage.rooms"
                :key="room.roomId"
                :active="selectedRoomKey === room.roomId"
                @click="selectedRoomKey = room.roomId"
              >
                {{ room.name || `房间 ${room.index}` }}
              </UiFilterPill>
            </UiFilterRow>

            <!-- 房间列表（对齐关卡图鉴 room-card / room-variant / room-collection 规范） -->
            <div class="rooms-flow-list">
              <article
                v-for="room in displayedRooms"
                :key="room.roomId"
                class="room-card"
              >
                <div class="room-variant">
                  <div class="room-variant__title">
                    <span>{{ room.name || `房间 ${room.index}` }}</span>
                    <UiTag :tone="room.waves?.length ? 'danger' : 'accent'">
                      {{ room.waves?.length ? '战斗房间' : '采集' }}
                    </UiTag>
                  </div>

                  <!-- 怪物波次：按关卡图鉴排版，并给怪物加上头像图标 -->
                  <template v-if="room.waves?.length">
                    <div v-for="w in room.waves" :key="w.wave" class="room-wave-line">
                      <strong class="wave-lead">第{{ w.wave }}波：</strong>
                      <div class="wave-monsters-flow">
                        <span
                          v-for="mon in w.monsters"
                          :key="mon.typeId"
                          class="wave-mon-pill is-clickable"
                          :title="`${mon.name} (Rank ${mon.monRank || 1})`"
                         role="button"
                         tabindex="0"
                         @click.stop="openMonsterDetail(mon.typeId, null, room?.level || activeStage?.battleLevel || activeStage?.level, { scaleHp: mon.levelScaleHp, scaleAtk: mon.levelScale })"
                         @keydown.enter.prevent.stop="openMonsterDetail(mon.typeId, null, room?.level || activeStage?.battleLevel || activeStage?.level, { scaleHp: mon.levelScaleHp, scaleAtk: mon.levelScale })"
                         @keydown.space.prevent.stop="openMonsterDetail(mon.typeId, null, room?.level || activeStage?.battleLevel || activeStage?.level, { scaleHp: mon.levelScaleHp, scaleAtk: mon.levelScale })">
                          <img
                            class="mon-mini-icon"
                            :src="monIcon(mon.icon)"
                            :alt="mon.name"
                            loading="lazy"
                            decoding="async"
                            @error="handleImageFallback"
                          />
                          <span class="mon-name-txt">{{ mon.name }}</span>
                          <span class="mon-count-txt">×{{ mon.count }}</span>
                        </span>
                      </div>
                    </div>
                  </template>
                  <p v-else-if="!room.collections?.length" class="room-variant__line">非战斗房间</p>

                  <!-- 房间采集物配置（植物/矿物/食材）：严格采用关卡图鉴 room-collection 规范与 RewardPools dense -->
                  <div
                    v-for="col in room.collections"
                    :key="col.collectId"
                    class="room-collection"
                  >
                    <div class="room-collection__heading">
                      <span>
                        {{ col.name }}<template v-if="col.count > 1"> ×{{ col.count }}</template>
                        <button
                          v-if="getCollectionRewardEntries(col).length"
                          type="button"
                          class="prob-detail-btn"
                          @click.stop="openRewardDetail(col.name, getCollectionRewardEntries(col))"
                        >
                          概率明细
                        </button>
                      </span>
                    </div>
                    <RewardPools
                      v-if="getCollectionRewardEntries(col).length"
                      dense
                      :entries="getCollectionRewardEntries(col)"
                      @item-click="goToItem"
                    />
                    <p v-else class="room-variant__line">已配置交互，暂无可展示产出</p>
                  </div>
                </div>
              </article>
            </div>
          </UiSection>
        </div>
      </section>
    </div>

    <UiBackToTop scroll-container="#dailyScroll" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithFallback } from '../utils/request.js'
import { getImageUrl, handleImageFallback } from '../utils/env.js'
import { BASE_REWARD_PATHS } from '../utils/gameMappings.js'
import { useLazyList } from '../composables/useLazyList.js'
import {
  UiFilterPanel,
  UiSearchInput,
  UiFilterRow,
  UiFilterPill,
  UiTag,
  UiEmptyState,
  UiBackToTop,
  UiSection,
  UiInfoRow
} from '../components/ui/index.js'
import RewardPools from '../components/RewardPools.vue'
import { openRewardDetail } from '../utils/rewardModalState.js'
import { openMonsterDetail } from '../utils/monsterModalState.js'

const route = useRoute()
const router = useRouter()

const data = ref(null)
const loading = ref(true)
const error = ref('')

const todayDay = new Date().getDay()

const queryString = key => (typeof route.query[key] === 'string' ? route.query[key] : '')
const search = computed(() => queryString('q'))
const typeFilter = computed(() => queryString('type'))
const dayFilter = computed(() => queryString('day'))
const openPlanId = computed(() => queryString('plan'))
const openStageId = computed(() => queryString('stage'))

const plans = computed(() => {
  const raw = data.value?.plans || []
  return raw.filter(p => !p.special && p.typeId !== 'doubleExp')
})
const weekPlans = computed(() => {
  const raw = data.value?.weekPlans || []
  return raw.map(w => ({
    ...w,
    entries: (w.entries || []).filter(e => e.typeId !== 'doubleExp')
  }))
})

/** 计划封面图与关卡缩略图 */
const planImg = name => (name ? `/images/DailyWorkPanel/${name}.webp` : '')
const monIcon = icon => (icon ? getImageUrl(`/HeadIconAtals/${icon}.webp`) : '')

function formatDuration(seconds) {
  const total = Number(seconds) || 0
  if (total <= 0) return '不限时'
  if (total >= 3600 && total % 3600 === 0) return `${total / 3600} 小时`
  if (total >= 60 && total % 60 === 0) return `${total / 60} 分钟`
  if (total >= 60) return `${Math.floor(total / 60)} 分钟 ${total % 60} 秒`
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

/** 当前选中的计划对象（由顶部类型筛选或卡片点击联动，type 为空时展示全部） */
const activePlan = computed(() => {
  const targetId = typeFilter.value || openPlanId.value
  if (!targetId) return null
  return plans.value.find(p => p.typeId === targetId) || null
})

/** 当前选中的关卡对象（如果未选 stage，默认选中该计划下的第 1 关） */
const activeStage = computed(() => {
  if (!activePlan.value || !activePlan.value.stages?.length) return null
  if (openStageId.value) {
    const found = activePlan.value.stages.find(s => s.battleId === openStageId.value)
    if (found) return found
  }
  return activePlan.value.stages[0]
})

/** 关卡房间选择（对齐关卡图鉴） */
const selectedRoomKey = ref(null)
watch(() => activeStage.value?.battleId, () => {
  selectedRoomKey.value = null
})
const displayedRooms = computed(() => {
  if (!activeStage.value?.rooms?.length) return []
  if (selectedRoomKey.value === null) return activeStage.value.rooms
  return activeStage.value.rooms.filter(r => r.roomId === selectedRoomKey.value)
})

/** 获取关卡结算掉落条目（对齐 RewardPools 标准） */
function getStageRewardEntries(stage) {
  if (!stage) return []
  if (Array.isArray(stage.rewardEntries) && stage.rewardEntries.length) {
    return stage.rewardEntries
  }
  // 兼容内存中旧缓存结构：若无 rewardEntries 则从 stage.reward 结构补齐
  const entries = []
  if (stage.reward?.money) {
    entries.push({
      typeId: 'item_00001',
      name: '银币',
      icon: BASE_REWARD_PATHS.money,
      quality: 0,
      min: stage.reward.money,
      max: stage.reward.money,
      actualProb: 1,
      kind: 'money'
    })
  }
  if (stage.reward?.exp) {
    entries.push({
      typeId: 'item_00004',
      name: '营地经验值',
      icon: BASE_REWARD_PATHS.heroExp || '/images/Common_ItemIcon/item_00004.webp',
      quality: 0,
      min: stage.reward.exp,
      max: stage.reward.exp,
      actualProb: 1,
      kind: 'exp'
    })
  }
  for (const item of stage.reward?.items || []) {
    entries.push({
      typeId: item.typeId || '',
      name: item.name || '',
      icon: item.img ? `/images/Common_ItemIcon/${item.img}.webp` : '',
      quality: item.quality || 1,
      min: item.min || 1,
      max: item.max || item.min || 1,
      actualProb: item.chance || 1,
      cumulativeProb: item.chance || 1,
      kind: item.mode || 'item',
      detail: item.mode === 'equipGroup'
        ? `${item.equipTypeGroup || '装备池'}${item.equipLevel ? ` · Lv${item.equipLevel}` : ''}`
        : ''
    })
  }
  return entries
}

/** 获取房间采集物产出（对齐 RewardPools dense 标准） */
function getCollectionRewardEntries(col) {
  if (!col) return []
  if (Array.isArray(col.reward) && col.reward.length) {
    return col.reward
  }
  if (Array.isArray(col.rewardItems) && col.rewardItems.length) {
    return col.rewardItems.map(item => ({
      typeId: item.typeId || '',
      name: item.name || '',
      icon: item.img ? `/images/Common_ItemIcon/${item.img}.webp` : '',
      quality: item.quality || 1,
      min: item.min || 1,
      max: item.max || item.min || 1,
      actualProb: item.chance || 1,
      cumulativeProb: item.chance || 1,
      kind: item.mode || 'item'
    }))
  }
  return []
}

const activeStageDrops = computed(() => getStageRewardEntries(activeStage.value))

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

/** 筛选栏中的刷新日程摘要（根据所选刷新日，或默认今日动态展示） */
const currentDaySummaryLabel = computed(() => {
  if (dayFilter.value) {
    const w = weekPlans.value.find(x => String(x.day) === dayFilter.value)
    return `${w?.dayName || '所选日'}刷新计划`
  }
  const w = weekPlans.value.find(x => x.day === todayDay)
  return `今日（${w?.dayName || '今日'}）刷新计划`
})

const currentDaySummaryText = computed(() => {
  const targetDay = dayFilter.value ? Number(dayFilter.value) : todayDay
  const w = weekPlans.value.find(x => x.day === targetDay)
  if (!w || !w.entries?.length) return '本日暂无计划书刷新。'
  const planMap = new Map(plans.value.map(p => [p.typeId, p.name]))
  return w.entries
    .map(e => `${planMap.get(e.typeId) || e.typeId} ×${e.num}`)
    .join('、')
})

function onTypeFilterClick(typeId) {
  const query = { ...route.query }
  if (typeId) {
    query.type = typeId
  } else {
    delete query.type
  }
  delete query.plan
  delete query.stage
  router.replace({ query })
}

function selectPlan(typeId) {
  onTypeFilterClick(typeId)
}

function closePlan() {
  onTypeFilterClick('')
}

function selectStage(battleId) {
  const query = { ...route.query }
  query.stage = battleId
  router.replace({ query })
}

/** 关卡横向选择栏：支持古典左右箭头切换与鼠标按住拖拽 */
const stageGridRef = ref(null)
const canScrollStages = ref(false)
const isStageAtStart = ref(true)
const isStageAtEnd = ref(true)
const isStageDragging = ref(false)

let stageDragPointerId = null
let stageDragStartX = 0
let stageDragStartScrollLeft = 0
let stageDragMoved = false
let suppressStageClick = false
let lastPointerTime = 0
let lastPointerX = 0
let stageVelocityX = 0
let momentumFrame = null

function cancelStageMomentum() {
  if (momentumFrame) {
    cancelAnimationFrame(momentumFrame)
    momentumFrame = null
  }
}

function syncStageScrollState() {
  const el = stageGridRef.value
  if (!el) return
  canScrollStages.value = el.scrollWidth > el.clientWidth + 1
  isStageAtStart.value = el.scrollLeft <= 1
  isStageAtEnd.value = !canScrollStages.value || el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
}

function scrollStages(direction) {
  cancelStageMomentum()
  const el = stageGridRef.value
  if (!el) return
  const step = Math.max(el.clientWidth * 0.7, 220)
  el.scrollBy({
    left: direction === 'left' ? -step : step,
    behavior: 'smooth'
  })
}

function handleStagePointerDown(event) {
  const el = stageGridRef.value
  if (!el || !canScrollStages.value || event.pointerType !== 'mouse' || event.button !== 0) return
  cancelStageMomentum()
  stageDragPointerId = event.pointerId
  stageDragStartX = event.clientX
  stageDragStartScrollLeft = el.scrollLeft
  stageDragMoved = false
  lastPointerTime = performance.now()
  lastPointerX = event.clientX
  stageVelocityX = 0
}

function handleStagePointerMove(event) {
  const el = stageGridRef.value
  if (!el || stageDragPointerId !== event.pointerId) return
  const now = performance.now()
  const dt = now - lastPointerTime
  if (dt > 0) {
    const v = (event.clientX - lastPointerX) / dt
    stageVelocityX = stageVelocityX * 0.3 + v * 0.7
    lastPointerTime = now
    lastPointerX = event.clientX
  }
  const deltaX = event.clientX - stageDragStartX
  if (!stageDragMoved && Math.abs(deltaX) < 4) return
  if (!stageDragMoved) el.setPointerCapture(event.pointerId)
  stageDragMoved = true
  suppressStageClick = true
  isStageDragging.value = true
  event.preventDefault()
  el.scrollLeft = stageDragStartScrollLeft - deltaX
}

function finishStagePointerDrag(event) {
  const el = stageGridRef.value
  if (!el || stageDragPointerId !== event.pointerId) return
  if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
  stageDragPointerId = null
  isStageDragging.value = false

  // 松手时带有速度则进行平滑惯性滑行，彻底消除强制归位的生硬跳跃感
  if (stageDragMoved && Math.abs(stageVelocityX) > 0.15) {
    let frameVelocity = stageVelocityX * 16
    const friction = 0.94
    const momentumStep = () => {
      if (!el || Math.abs(frameVelocity) < 0.4) {
        cancelStageMomentum()
        syncStageScrollState()
        return
      }
      el.scrollLeft -= frameVelocity
      frameVelocity *= friction
      syncStageScrollState()
      momentumFrame = requestAnimationFrame(momentumStep)
    }
    momentumFrame = requestAnimationFrame(momentumStep)
  } else {
    syncStageScrollState()
  }

  if (stageDragMoved) {
    window.setTimeout(() => {
      suppressStageClick = false
    }, 0)
  }
}

function cancelStagePointerDrag(event) {
  if (stageDragPointerId !== event.pointerId) return
  cancelStageMomentum()
  stageDragPointerId = null
  stageDragMoved = false
  suppressStageClick = false
  isStageDragging.value = false
}

function onStageCardClick(battleId) {
  if (suppressStageClick) {
    suppressStageClick = false
    return
  }
  selectStage(battleId)
}

function setFilter(key, value) {
  const query = { ...route.query }
  if (value) query[key] = value
  else delete query[key]
  router.replace({ query })
}

function goToItem(entry) {
  const typeId = typeof entry === 'string' ? entry : (entry?.typeId || '')
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

watch(() => activePlan.value?.typeId, () => {
  nextTick(syncStageScrollState)
})

onMounted(() => {
  loadData()
  window.addEventListener('resize', syncStageScrollState)
})

onBeforeUnmount(() => {
  cancelStageMomentum()
  window.removeEventListener('resize', syncStageScrollState)
})
</script>

<style scoped>
/* 容器规范：与大书院图鉴完全一致，flex-direction: column，内部区域滚动 */
.daily-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.collection-counter {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}
.filter-panel :deep(.ui-filter-pill.is-active) {
  color: var(--on-wood-text);
}

/* 筛选栏中的刷新日程摘要（从底部调整至筛选栏，与刷新日联动） */
.filter-day-summary {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(143, 115, 81, 0.08);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-main);
  border: 1px dashed var(--border-soft);
}
.summary-icon {
  font-size: 13px;
}
.summary-label {
  font-weight: 700;
  color: var(--accent-ink);
  white-space: nowrap;
}
.summary-content {
  color: var(--text-muted);
}

/* 日常计划面板底色（严格对齐关卡图鉴，使用纯净象牙米黄 var(--modal-bg) 彻底消除色差并不透出底层地图） */
.daily-page :deep(.paper-panel),
.daily-page .paper-panel {
  background-color: var(--modal-bg, #efe2c4);
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.18);
}

.dark-mode .daily-page :deep(.paper-panel),
.dark-mode .daily-page .paper-panel,
.dark-theme .daily-page :deep(.paper-panel),
.dark-theme .daily-page .paper-panel {
  background-color: var(--modal-bg, #261b12);
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.45);
}

/* 核心滚动容器：严格在 paper-panel 内滚动，不会溢出到搜索栏背后 */
.daily-scroll-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px calc(48px + var(--safe-bottom, 0px));
  box-sizing: border-box;
}

/* ══════════════════════════════════════════════════
   模式 A：一排 4 个的竖向大书院卡片
   ══════════════════════════════════════════════════ */
.shelf-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 精准 4 列网格（桌面端一排 4 个） */
.four-column-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}

@media (max-width: 1200px) {
  .four-column-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
}

@media (max-width: 768px) {
  .four-column-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
}

/*
 * 🔴 手机端保持 2 列，不要退成单列。
 *
 * 封面是 360×600 的竖版原画卡（`aspect-ratio: 360/600`），单列全宽时卡片高度
 * 会随宽度等比放大：实测 390px 宽下卡片 334×684，一屏只看得到 1 个，
 * 6 个计划要滑 6 屏。改成 2 列后卡片约 163 宽、封面约 272 高，一屏可见 2~3 个。
 *
 * 上限 480px 仍走 2 列：更窄的屏幕（如 360px）卡片约 150 宽，名字与日期仍可读。
 * 只有极窄（<=340px）才退回单列，避免文字挤压。
 */
@media (max-width: 480px) {
  .four-column-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}

@media (max-width: 340px) {
  .four-column-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
}

/* 书院卡片（纯净书院 UI + 纯原画封面） */
.plan-book-card {
  display: flex;
  flex-direction: column;
  background: var(--paper-soft, #fcf8f0);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 3px 10px rgba(44, 30, 16, 0.06);
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
}

.plan-book-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(44, 30, 16, 0.14);
  border-color: var(--accent-ink);
}

.plan-book-card.is-special {
  border-color: rgba(217, 119, 6, 0.4);
}

/* 封面原画区：完整展示 360×620 立绘卡牌全貌，不裁切 */
.card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 360 / 600;
  background: rgba(143, 115, 81, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 8px 0;
  box-sizing: border-box;
}

.cover-art {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15));
  transition: transform 0.35s ease;
}

.plan-book-card:hover .cover-art {
  transform: scale(1.03);
}

.cover-badge {
  position: absolute;
  top: 14px;
  left: 14px;
  display: flex;
  gap: 6px;
}

.badge-limit {
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 700;
  color: #f3ead5;
  background: rgba(45, 33, 22, 0.82);
  border: 1px solid rgba(186, 140, 70, 0.45);
  border-radius: 3px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
  line-height: 1.4;
}

.badge-special {
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: #dc2626;
  border-radius: 4px;
}

/* 卡片文本内容（去除周几刷新列表，更加精炼工整） */
.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  gap: 6px;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-main);
  letter-spacing: 0.3px;
}

.card-des {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-cond {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  margin-top: 2px;
}

.cond-label {
  color: var(--text-muted);
}

.cond-link {
  color: var(--accent-ink);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.cond-link:hover {
  color: var(--accent-bright, var(--accent-ink));
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-top: 1px dashed var(--border-soft);
  background: rgba(143, 115, 81, 0.04);
}

.enter-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-ink);
}

.enter-arrow {
  font-size: 14px;
  color: var(--accent-ink);
  transition: transform 0.15s ease;
}

.plan-book-card:hover .enter-arrow {
  transform: translateX(3px);
}

/* ══════════════════════════════════════════════════
   模式 B：全宽作战详情台（完全去除左侧挤占区域）
   ══════════════════════════════════════════════════ */
.detail-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 全宽计划总览横幅 */
.plan-hero-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 18px;
  background: rgba(143, 115, 81, 0.05);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
}

.hero-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}

.hero-cover-thumb {
  width: 60px;
  height: 96px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--border-soft);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  flex: none;
}

.hero-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.hero-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.hero-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-main);
}

.hero-des {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted);
}

.hero-days {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.days-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
}

.day-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 7px;
  background: rgba(143, 115, 81, 0.08);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-main);
  white-space: nowrap;
}

.day-chip em {
  font-style: normal;
  font-weight: 700;
  color: #b45309;
}

.hero-cond-inline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  background: rgba(143, 115, 81, 0.08);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-main);
  width: fit-content;
  margin-top: 2px;
}

.cond-inline-label {
  font-weight: 700;
  color: var(--text-muted);
  white-space: nowrap;
}

/* 关卡选择区 */
.stage-select-box {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stage-select-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stage-header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.stage-select-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.stage-select-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.stage-nav-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.stage-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  border: 1px solid rgba(143, 115, 81, 0.45);
  background: rgba(255, 250, 240, 0.75);
  color: var(--text-main);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
  user-select: none;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.08);
}

.stage-nav-btn:hover:not(.is-disabled) {
  background: #ba8c46;
  color: #fff;
  border-color: #ba8c46;
  transform: translateY(-1px);
}

.stage-nav-btn.is-disabled {
  opacity: 0.32;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.stage-select-box.has-overflow-right::after {
  content: '';
  position: absolute;
  top: 36px;
  right: 0;
  bottom: 8px;
  width: 36px;
  pointer-events: none;
  background: linear-gradient(to right, transparent, var(--modal-bg, #efe2c4) 90%);
  z-index: 2;
  border-radius: 0 6px 6px 0;
}

.stage-cards-grid {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 4px 4px 10px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  cursor: grab;
}

.stage-cards-grid::-webkit-scrollbar {
  display: none;
}

.stage-cards-grid.is-dragging {
  cursor: grabbing;
  user-select: none;
}

.stage-cards-grid.is-dragging .stage-card-item {
  pointer-events: none;
  transform: none !important;
}

.stage-card-item {
  position: relative;
  flex: 0 0 210px;
  display: flex;
  flex-direction: column;
  padding: 8px;
  background: rgba(143, 115, 81, 0.06);
  border: 2px solid transparent;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}

.stage-card-item:hover {
  background: rgba(143, 115, 81, 0.12);
  transform: translateY(-2px);
}

.stage-card-item.is-selected {
  background: rgba(143, 115, 81, 0.15);
  border-color: #8f7351;
  box-shadow: 0 0 0 1px #ba8c46, 0 3px 10px rgba(43, 31, 21, 0.3);
}

.stage-card-corner {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 18px 18px 0;
  border-color: transparent #ba8c46 transparent transparent;
}

.stage-card-thumb-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 4px;
  overflow: hidden;
  background: #2b251e;
  pointer-events: none;
  user-select: none;
}

.stage-card-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

.stage-card-lvl {
  position: absolute;
  bottom: 4px;
  left: 6px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 3px;
  line-height: 1.4;
}

.stage-card-meta {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stage-card-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-card-sub {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 关卡详情主面板（全宽展示） */
.stage-detail-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--border-soft);
}

.stage-entry-cost-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.cost-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-weight: 700;
  color: var(--text-main);
}

.cost-sep {
  color: var(--text-muted);
}

.cost-ti-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  vertical-align: middle;
}

.stage-empty-reward {
  margin: 0;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-muted);
}

.reward-base-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.reward-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

/* 房间选项卡（多房间时展示，对齐关卡图鉴） */
.stage-room-tabs {
  margin-bottom: 12px;
}

/* 房间卡片流（对齐关卡图鉴 room-list / room-card） */
.rooms-flow-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-card {
  border: 1px solid var(--border-soft);
  border-radius: 5px;
  background: var(--paper-soft);
  padding: 9px 10px;
}

.room-variant {
  border-left: 3px solid var(--accent);
  padding: 4px 0 4px 9px;
  min-width: 0;
}

.room-variant__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 8px;
}

.room-variant__title span:first-child {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-variant__line {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

/* 怪物波次：关卡图鉴风格，但怪带头像图标 */
.room-wave-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
  margin-top: 5px;
}

.wave-lead {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
}

.wave-monsters-flow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.wave-mon-pill.is-clickable { cursor: pointer; transition: background-color .15s, border-color .15s; }
.wave-mon-pill.is-clickable:hover { background: rgba(85, 117, 116, 0.14); border-color: var(--accent-ink); }
.wave-mon-pill.is-clickable:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 1px; }
.wave-mon-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px 2px 4px;
  background: rgba(255, 250, 240, 0.48);
  border: 1px solid rgba(143, 115, 81, 0.38);
  border-radius: 4px;
  font-size: 12px;
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.05);
}

.mon-mini-icon {
  width: 21px;
  height: 21px;
  object-fit: contain;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(143, 115, 81, 0.25);
}

.mon-name-txt {
  font-weight: 600;
  color: var(--text-main);
}

.mon-count-txt {
  font-weight: 700;
  color: #a16207;
}

/* 房间采集物与产出（对齐关卡图鉴 room-collection） */
.room-collection {
  margin-top: 8px;
  padding: 7px 8px;
  background: var(--paper-solid);
  border: 1px dashed var(--border-soft);
  border-radius: 4px;
}

.room-collection__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-main);
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
}

.room-collection__heading > span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dark-mode .room-card,
.dark-theme .room-card {
  border-color: rgba(143, 115, 81, 0.28);
  background: rgba(38, 28, 19, 0.72);
}

.dark-mode .wave-mon-pill,
.dark-theme .wave-mon-pill {
  background: rgba(45, 33, 22, 0.75);
  border-color: rgba(186, 140, 70, 0.35);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.dark-mode .mon-mini-icon,
.dark-theme .mon-mini-icon {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(223, 206, 179, 0.3);
}

.dark-mode .mon-name-txt,
.dark-theme .mon-name-txt {
  color: #f3ead5;
}

.dark-mode .mon-count-txt,
.dark-theme .mon-count-txt {
  color: #ffd072;
}

.dark-mode .stage-card-item.is-selected,
.dark-theme .stage-card-item.is-selected {
  background: rgba(186, 140, 70, 0.16);
  border-color: #ba8c46;
  box-shadow: 0 0 0 1px rgba(223, 206, 179, 0.25), 0 4px 12px rgba(0, 0, 0, 0.5);
}

.dark-mode .stage-nav-btn,
.dark-theme .stage-nav-btn {
  background: rgba(45, 33, 22, 0.85);
  border-color: rgba(186, 140, 70, 0.35);
  color: #f3ead5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.dark-mode .stage-nav-btn:hover:not(.is-disabled),
.dark-theme .stage-nav-btn:hover:not(.is-disabled) {
  background: #ba8c46;
  color: #2b1d0c;
}

.dark-mode .stage-select-box.has-overflow-right::after,
.dark-theme .stage-select-box.has-overflow-right::after {
  background: linear-gradient(to right, transparent, rgba(33, 23, 15, 0.95) 90%);
}

.dark-mode .stage-card-corner,
.dark-theme .stage-card-corner {
  border-color: transparent #ba8c46 transparent transparent;
}

.dark-mode .room-collection,
.dark-theme .room-collection {
  background: rgba(28, 20, 13, 0.65);
  border-color: rgba(143, 115, 81, 0.22);
}

.dark-mode .hero-cond-inline,
.dark-theme .hero-cond-inline {
  background: rgba(45, 33, 22, 0.65);
  border-color: rgba(186, 140, 70, 0.28);
}

.dark-mode .badge-limit,
.dark-theme .badge-limit {
  background: rgba(30, 20, 12, 0.9);
  border-color: rgba(186, 140, 70, 0.55);
  color: #fbf6ec;
}

@media (max-width: 768px) {
  .plan-hero-banner {
    flex-direction: column;
    align-items: flex-start;
  }
  .stage-card-item {
    flex: 0 0 170px;
  }
}
</style>
