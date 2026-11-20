<template>
  <div class="page-view-container">

    <!-- 搜索 + 筛选区（半透明羊皮纸面板） -->
    <UiFilterPanel class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput v-model="searchQuery" placeholder="搜索名称、套装效果、属性、职业…" />
      </template>

      <UiFilterRow label="部位：">
        <UiFilterPill :active="selectedSub === null" @click="selectedSub = null">全部</UiFilterPill>
        <UiFilterPill
          v-for="sub in subCategories"
          :key="sub.type"
          :active="String(selectedSub) === String(sub.type)"
          @click="selectedSub = sub.type"
        >{{ sub.name }}</UiFilterPill>
      </UiFilterRow>

      <UiFilterRow v-if="tierOptions.length > 1" label="品阶：">
        <UiFilterPill :active="selectedLevel === null" @click="selectedLevel = null">全部</UiFilterPill>
        <UiFilterPill
          v-for="lvl in tierOptions"
          :key="lvl"
          :active="selectedLevel === lvl"
          @click="selectedLevel = lvl"
        >{{ lvl }}阶</UiFilterPill>
      </UiFilterRow>

      <UiFilterRow label="稀有度：">
        <UiFilterPill :active="selectedRarity === null" @click="selectedRarity = null">全部</UiFilterPill>
        <UiFilterPill
          v-for="r in [1, 2, 3, 4, 5, 6]"
          :key="r"
          :quality="r"
          :active="selectedRarity === r"
          @click="selectedRarity = r"
        >{{ getRarityName(r) }}</UiFilterPill>
      </UiFilterRow>

      <UiFilterRow label="职业：">
        <UiFilterPill :active="selectedJob === null" @click="selectedJob = null">全部</UiFilterPill>
        <UiFilterPill
          v-for="(jobName, jobKey) in JOB_NAMES"
          :key="jobKey"
          :active="selectedJob === Number(jobKey)"
          @click="selectedJob = Number(jobKey)"
        >{{ jobName }}</UiFilterPill>
      </UiFilterRow>

      <!-- 底部工具栏：计数与视图切换 -->
      <template #footer>
        <div class="equips-toolbar">
          <span class="collection-counter">共 <span class="count-num">{{ filteredItems.length }}</span> 件装备</span>
          <div class="equips-toolbar__actions">
            <button
              type="button"
              class="random-guide-btn"
              title="查看 1~10 级随机词条数值区间与品质规则"
              @click="showRandomGuide = true"
            >
              随机词条速查
            </button>
            <div class="view-mode-toggle" role="group" aria-label="视图模式切换">
              <button
                type="button"
                class="view-mode-btn"
                :class="{ 'is-active': viewMode === 'detail' }"
                aria-label="图文模式"
                title="图文详情模式（直接查看装备主属性与适用职业）"
                @click="viewMode = 'detail'"
              >
                <svg class="view-mode-icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 3h3v3H2V3zm5 1h7v1H7V4zm0 6h7v1H7v-1zM2 9h3v3H2V9z"/>
                </svg>
                <span>图文模式</span>
              </button>
              <button
                type="button"
                class="view-mode-btn"
                :class="{ 'is-active': viewMode === 'grid' }"
                aria-label="图标模式"
                title="紧凑图标模式（背包格子布局）"
                @click="viewMode = 'grid'"
              >
                <svg class="view-mode-icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
                </svg>
                <span>图标模式</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </UiFilterPanel>

    <!-- 列表区：图文与图标模式统一置于羊皮纸容器内，手机端保持 5 列 -->
    <UiCardGrid
      id="itemsGridScroll"
      v-if="isDataReady"
      class="equips-content paper-panel"
      :class="{ 'items-card-grid': viewMode === 'grid' }"
      :content-style="viewMode === 'detail' ? { gridTemplateColumns: 'minmax(0, 1fr)' } : null"
    >
      <!-- 1. 图文详情模式（仿符石图鉴） -->
      <template v-if="viewMode === 'detail'">
        <div v-if="filteredItems.length" class="equips-grid">
          <article
            v-for="item in displayedItems"
            :key="item.typeId"
            class="equip-entry"
            @click="handleItemClick(item)"
          >
            <UiItemCard
              :img="getImageUrl(getItemImageUrl(item))"
              :name="item.name"
              :quality="item.quality"
              @img-error="handleImgError"
            />
            <div class="equip-entry__body">
              <div class="equip-entry__head">
                <h3 class="equip-entry__name" :class="`quality-text-${item.quality || 1}`">{{ item.name }}</h3>
                <UiTag v-if="equipMetaOf(item).suitName" tone="accent">{{ equipMetaOf(item).suitName }}</UiTag>
              </div>
              <div class="equip-entry__meta">
                <UiTag :quality="item.quality">{{ item.equip?.equipLevel || 1 }} 阶</UiTag>
                <span>{{ getMetaText(item) }}</span>
                <UiTag v-if="equipMetaOf(item).randomCount > 0">随机×{{ equipMetaOf(item).randomCount }}</UiTag>
                <UiTag v-else-if="item.equip?.noRandomAbility">无随机</UiTag>
              </div>
              <p v-if="getEquipEffectHtml(item)" class="equip-entry__effect" v-html="getEquipEffectHtml(item)"></p>
            </div>
          </article>
        </div>
        <UiEmptyState v-else text="无匹配装备" />
      </template>

      <!-- 2. 紧凑图标模式（7 列背包格子布局） -->
      <template v-else>
        <UiItemCard
          v-for="item in displayedItems"
          :key="item.typeId"
          :img="getImageUrl(getItemImageUrl(item))"
          :name="item.name"
          :quality="item.quality"
          @click="handleItemClick(item)"
          @img-error="handleImgError"
        />
        <UiEmptyState v-if="filteredItems.length === 0" text="无匹配装备" />
      </template>
    </UiCardGrid>

    <UiEmptyState v-else-if="loadError" type="error" text="装备数据暂时不可用">
      <template #action><UiButton @click="loadItems">重新加载</UiButton></template>
    </UiEmptyState>
    <UiEmptyState v-else type="loading" text="数据加载中..." />
    <UiBackToTop scroll-container="#itemsGridScroll" />

    <UiModal
      v-model:visible="showRandomGuide"
      title="随机词条数值速查"
      :close-on-overlay="true"
      scroll-id="equipRandomGuideScroll"
    >
      <EquipRandomAttrPanel standalone />
    </UiModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  compareItemsByCategoryQuality,
  fetchItemData,
  getItemImageUrl,
  isVisibleEquipItem,
  calculateEquipAttributeRange,
  buildEquipAttributeItems,
  formatEquipAttrValue,
  getEquipRandomAttrCount,
  translateAttr,
  translateJobArray,
  parseEquipSuit
} from '../utils/itemParser'
import { getImageUrl } from '../utils/env'
import { isBlacklisted, isEquipTierHidden, visibleEquipTiers } from '../config/blacklist.js'
import { getRarityName, JOB_NAMES } from '../utils/gameMappings'
import { useLazyList } from '../composables/useLazyList'
import EquipRandomAttrPanel from '../components/EquipRandomAttrPanel.vue'
import {
  UiBackToTop,
  UiButton,
  UiCardGrid,
  UiEmptyState,
  UiFilterPill,
  UiFilterRow,
  UiItemCard,
  UiModal,
  UiTag,
  UiFilterPanel,
  UiSearchInput
} from '../components/ui/index.js'

const route = useRoute()
const router = useRouter()

const allItems = ref([])
const subCategories = ref([])
const isDataReady = ref(false)
const loadError = ref(false)
const showRandomGuide = ref(false)
let loadOperation = 0

const parseQueryInt = value => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

const searchQuery = ref(typeof route.query.q === 'string' ? route.query.q : '')
const selectedSub = ref(route.query.sub ? String(route.query.sub) : null)
const selectedLevel = ref(parseQueryInt(route.query.tier))
const selectedRarity = ref(parseQueryInt(route.query.rarity))
const selectedJob = ref(parseQueryInt(route.query.job))

// 筛选条件同步到 URL（保留 itemId 等既有参数，不覆盖）
watch([searchQuery, selectedSub, selectedLevel, selectedRarity, selectedJob], () => {
  const nextQuery = { ...route.query }
  if (searchQuery.value.trim()) nextQuery.q = searchQuery.value.trim()
  else delete nextQuery.q

  if (selectedSub.value !== null) nextQuery.sub = String(selectedSub.value)
  else delete nextQuery.sub

  if (selectedLevel.value !== null) nextQuery.tier = String(selectedLevel.value)
  else delete nextQuery.tier

  if (selectedRarity.value !== null) nextQuery.rarity = String(selectedRarity.value)
  else delete nextQuery.rarity

  if (selectedJob.value !== null) nextQuery.job = String(selectedJob.value)
  else delete nextQuery.job

  const same = ['q', 'sub', 'tier', 'rarity', 'job'].every(
    k => (nextQuery[k] ?? undefined) === (route.query[k] ?? undefined)
  )
  if (!same) {
    router.replace({ query: nextQuery })
  }
})

watch(() => route.query, (q) => {
  const nextQ = typeof q.q === 'string' ? q.q : ''
  if (nextQ !== searchQuery.value) searchQuery.value = nextQ

  const nextSub = q.sub ? String(q.sub) : null
  if (nextSub !== selectedSub.value) selectedSub.value = nextSub

  const nextTier = parseQueryInt(q.tier)
  if (nextTier !== selectedLevel.value) selectedLevel.value = nextTier

  const nextRarity = parseQueryInt(q.rarity)
  if (nextRarity !== selectedRarity.value) selectedRarity.value = nextRarity

  const nextJob = parseQueryInt(q.job)
  if (nextJob !== selectedJob.value) selectedJob.value = nextJob
})

// 视图模式：'detail' 图文模式（默认），'grid' 紧凑图标模式
const viewMode = ref(localStorage.getItem('equips_view_mode') || 'detail')
watch(viewMode, val => {
  try {
    localStorage.setItem('equips_view_mode', val)
  } catch (_) {}
})

/** 可见品阶（已排除 config/blacklist.js 里隐藏的阶） */
const tierOptions = computed(() => visibleEquipTiers())

/**
 * 搜索索引：把「一次搜索可能命中的所有文本」预先拼成一串小写字符串。
 *
 * 为什么要建索引而不是在 filter 里逐字段 includes：
 *   816 件装备 × 每次按键 → filter 会跑 816 次。若每件都现算套装效果、
 *   翻译职业名、拼属性词条，单次输入就要几万次字符串操作。
 *   索引只在数据加载后建一次（O(n)），搜索时退化为一次 includes。
 *
 * 覆盖的字段（原来只有 name / desc / typeId）：
 *   ① 名称、描述、内部 ID
 *   ② 套装名 + 套装效果文本（"冷却缩减提升 5%" 这类）← 本次新增的重点
 *   ③ 适用职业中文名（"近卫""射手"）
 *   ④ 基础属性词条（"生命值""暴击率"）与词条说明
 *   ⑤ 品质名（"传说""史诗"）、部位名（"上衣""项链"）
 *   ⑥ 附魔 / 强化相关说明
 */
const searchIndex = ref(new Map())

function buildSearchIndex(items) {
  const idx = new Map()

  for (const item of items) {
    const parts = [
      item.name,
      item.desc,
      item.typeId,
      // 品质与部位的中文名（用户习惯搜「传说上衣」这种组合）
      getRarityName(item.quality)
    ]

    // ② 套装：名称 + 每条效果（去掉 { } 花括号后拼原文）
    try {
      const suit = parseEquipSuit(item)
      if (suit) {
        parts.push(suit.suitName)
        for (const e of suit.suitEffects || []) {
          // desHtml 里含 <span> 标签，去掉标签保留文字
          parts.push(String(e.desHtml || '').replace(/<[^>]+>/g, ''))
        }
      }
    } catch (_) { /* 个别数据异常不影响整体 */ }

    // ③ 适用职业
    try {
      const jobs = item.equip?.job
      if (Array.isArray(jobs) && jobs.length) {
        parts.push(...translateJobArray(jobs))
      }
    } catch (_) {}

    // ④ 基础属性词条（unitData 的键翻译成中文）
    try {
      const unit = item.equip?.unitData
      if (unit && typeof unit === 'object') {
        for (const key of Object.keys(unit)) parts.push(translateAttr(key))
      }
    } catch (_) {}

    // ⑥ 附魔 / 强化说明
    if (item.useDes) parts.push(item.useDes)
    if (item.equip?.sqEquip) parts.push('专属')

    idx.set(item.typeId, parts.filter(Boolean).join(' ').toLowerCase())
  }

  return idx
}

/** 缓存每件装备的轻量展示元信息（套装名 + 默认随机词条条数），避免滚动/筛选时重复解析 */
const equipMetaMap = ref(new Map())

function buildEquipMetaMap(items) {
  const map = new Map()
  for (const item of items) {
    if (!item?.equip) continue
    let suitName = ''
    try {
      suitName = parseEquipSuit(item)?.suitName || ''
    } catch (_) {}
    const randomCount = getEquipRandomAttrCount(item, item.quality || 1)
    map.set(item.typeId, { suitName, randomCount })
  }
  return map
}

function equipMetaOf(item) {
  return equipMetaMap.value.get(item?.typeId) || { suitName: '', randomCount: 0 }
}

/** 搜索用的文本（索引未命中时回落到即时拼接，保证不漏） */
function searchTextOf(item) {
  const cached = searchIndex.value.get(item.typeId)
  if (cached) return cached
  return `${item.name || ''} ${item.desc || ''} ${item.typeId || ''}`.toLowerCase()
}

const loadItems = async () => {
  const operation = ++loadOperation
  loadError.value = false
  try {
    const data = await fetchItemData()
    if (operation !== loadOperation) return
    allItems.value = data.items
    // 建搜索索引与展示缓存（只做一次；后面每次按键/滚动只查 Map）
    searchIndex.value = buildSearchIndex(data.items)
    equipMetaMap.value = buildEquipMetaMap(data.items)
    subCategories.value = data.categoryTree.find(c => String(c.type) === '4')?.info || []
    isDataReady.value = true
  } catch (error) {
    if (operation === loadOperation) loadError.value = true
    console.error('Equipment loading failed:', error)
  }
}
onMounted(loadItems)
onBeforeUnmount(() => { loadOperation += 1 })

const handleImgError = (e) => {
  e.target.style.opacity = '0.3'
}

const filteredItems = computed(() => {
  if (!isDataReady.value) return []
  return allItems.value.filter(item => {
    // 1. 与游戏 PicHandBookPanel 一致：只保留正式、未隐藏的装备
    if (!isVisibleEquipItem(item)) return false

    // 2. 黑名单过滤
    if (isBlacklisted(item)) return false

    // 2.5 被隐藏的装备品阶（config/blacklist.js）
    if (isEquipTierHidden(item)) return false

    // 3. 必须包含图标
    if (!item.img) return false

    /*
     * 4. 搜索关键词匹配（多词 AND）
     *
     * 用空格分隔多个词时全部命中才算匹配 —— 「传说 上衣」「冷却 5%」
     * 这类组合查询才符合直觉。原来只支持单个词。
     */
    if (searchQuery.value) {
      const terms = searchQuery.value.toLowerCase().trim().split(/\s+/).filter(Boolean)
      if (terms.length) {
        const haystack = searchTextOf(item)
        if (!terms.every((t) => haystack.includes(t))) return false
      }
    }

    // 5. 部位过滤 (category[1] 对应部位类型)
    if (selectedSub.value !== null) {
      if (String(item.category?.[1]) !== String(selectedSub.value)) return false
    }

    // 6. 装备品阶过滤 (对应 equip.equipLevel)
    if (selectedLevel.value !== null) {
      if (!item.equip || Number(item.equip.equipLevel) !== Number(selectedLevel.value)) return false
    }

    // 7. 稀有度过滤
    if (selectedRarity.value !== null && item.quality !== selectedRarity.value) {
      return false
    }

    // 8. 职业过滤
    if (selectedJob.value !== null) {
      if (!item.equip || !Array.isArray(item.equip.job) || !item.equip.job.includes(selectedJob.value)) {
        return false
      }
    }

    return true
  }).sort(compareItemsByCategoryQuality)
})

const { displayedItems } = useLazyList(filteredItems, 60, '#itemsGridScroll')

const handleItemClick = (item) => {
  router.push({ query: { ...route.query, itemId: item.typeId } })
}

// 部位名称映射
function getPositionName(item) {
  const sub = subCategories.value.find(s => String(s.type) === String(item.category?.[1]))
  return sub?.name || '装备'
}

// 适用职业映射
function getJobText(item) {
  if (!item?.equip?.job) return ''
  const jobs = translateJobArray(item.equip.job)
  if (!jobs || !jobs.length) return ''
  if (jobs.length >= 6) return '全职业'
  return jobs.join(' / ')
}

// 部位与职业汇总（对齐符石图鉴第二行元信息）
function getMetaText(item) {
  const parts = [getPositionName(item), getJobText(item)].filter(Boolean)
  return parts.join(' · ')
}

// 提取全部装备属性效果（补全百分比属性 % 后缀）
function getEquipEffectHtml(item) {
  if (!item?.equip) return ''
  const range = calculateEquipAttributeRange(item, item.quality, 0)
  if (!range) return ''
  const items = buildEquipAttributeItems(range)
  if (!items.length) return ''
  const parts = items.map(a => {
    const label = translateAttr(a.key)
    const val = formatEquipAttrValue(a.key, a.min, a.max)
    return `${label}增加 <span class="value-highlight">${val}</span>`
  })
  return `${parts.join('，')}。`
}
</script>

<style scoped>
/* 底部工具栏与模式切换按钮 */
.equips-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 4px 2px 2px 2px;
  margin-top: 2px;
}

.equips-toolbar__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.random-guide-btn {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--paper-soft);
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1.4;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.random-guide-btn:hover {
  border-color: var(--accent-ink);
  background: var(--hover-bg);
}

.collection-counter {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.count-num {
  color: var(--accent-ink);
  font-weight: 700;
}

.view-mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--paper-soft, rgba(0, 0, 0, 0.05));
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 2px;
}

.view-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.4;
}

.view-mode-btn:hover {
  color: var(--accent-ink);
  background: var(--hover-bg);
}

.view-mode-btn.is-active {
  background: var(--paper-solid, #fff);
  color: var(--accent-ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.view-mode-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* ==================== 1. 图文详情网格（仿符石图鉴） ==================== */
/*
 * 高度策略：跟随全站桌面端「整页滚动」模式。
 *
 * 实测口径（1920×1080）：
 *   /misc   appMain 967px   —— 内容少，不触发滚动
 *   /equip  appMain 4020px  —— 53 件装备，整页滚动
 *   /items  appMain 10864px —— 更多物品，同样整页滚动
 * 三者行为一致；左右两侧栏是 position: sticky; top: 93px，
 * 滚动时始终贴顶，这就是「左右平齐」的实现方式。
 *
 * 🔴 不要给本页加 height/flex 锁定去"让正文自己滚"：
 *   桌面端 .app-main 是 display:block; height:auto; overflow:visible，
 *   强制内部滚动会与全站模式冲突（实测会引出 12px 溢出与双滚动条）。
 */
.equips-content {
  background: var(--paper);
  padding: 12px 14px calc(88px + var(--safe-bottom, 0px));
  /*
   * 高度伸缩（内容少时撑满、底边与左右两栏齐平）由 App.vue 的
   * `.app-main :deep(.page-view-container > [data-main-scroll]) { flex: 1 0 auto }`
   * 统一处理，全站图鉴页共用一条规则。
   */
}

.equips-content.items-card-grid {
  padding-inline: 10px;
}

.equips-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  /* 行高按内容排布，不被拉伸 */
  align-content: start;
}

.equip-entry {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  min-width: 0;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.06);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.equip-entry:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
  border-color: var(--accent-ink);
}

.equip-entry :deep(.ui-item-card) {
  flex: 0 0 70px;
  margin: 0;
}

.equip-entry :deep(.ui-item-card__name) {
  display: none;
}

.equip-entry__body {
  flex: 1;
  min-width: 0;
}

.equip-entry__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 5px;
}

.equip-entry__name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.equip-entry__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  color: var(--text-muted);
  font-size: 13px;
}

.equip-entry__effect {
  margin: 8px 0 4px;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

/* ==================== 2. 紧凑图标模式（7 列背包格子布局） ==================== */
.items-card-grid :deep(.ui-card-grid) {
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

@media (max-width: 1100px) {
  .items-card-grid :deep(.ui-card-grid) {
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
}

@media (max-width: 900px) {
  .equips-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .equip-entry {
    padding: 10px;
  }
  .equip-entry :deep(.ui-item-card) {
    flex-basis: 58px;
  }
}

@media (max-width: 768px) {
  .items-card-grid :deep(.ui-card-grid) {
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
}

@media (max-width: 640px) {
  .equips-content {
    padding-inline: 10px;
  }
  .equips-content.items-card-grid {
    padding-inline: 6px;
  }
}

@media (max-width: 480px) {
  .equips-content.items-card-grid {
    padding: 8px 4px calc(88px + var(--safe-bottom, 0px));
  }
  .items-card-grid :deep(.ui-card-grid) {
    grid-template-columns: repeat(5, 1fr);
    gap: 3px;
  }
  .view-mode-btn span:not(.view-mode-icon) {
    display: none;
  }
  .view-mode-btn {
    padding: 4px 6px;
  }
}
</style>
