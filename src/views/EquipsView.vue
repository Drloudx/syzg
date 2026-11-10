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
          :active="selectedSub === sub.type"
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

      <!-- 底部工具栏：计数与视图切换 -->
      <template #footer>
        <div class="equips-toolbar">
          <span class="collection-counter">共 <span class="count-num">{{ filteredItems.length }}</span> 件装备</span>
          <div class="view-mode-toggle" role="group" aria-label="视图模式切换">
            <button
              type="button"
              class="view-mode-btn"
              :class="{ 'is-active': viewMode === 'detail' }"
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
              title="紧凑图标模式（7 列背包格子布局）"
              @click="viewMode = 'grid'"
            >
              <svg class="view-mode-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
              </svg>
              <span>图标模式</span>
            </button>
          </div>
        </div>
      </template>
    </UiFilterPanel>

    <!-- 列表区：支持图文详情与紧凑网格双模式 -->
    <UiCardGrid
      id="itemsGridScroll"
      v-if="isDataReady"
      :class="{ 'items-card-grid': viewMode === 'grid', 'equips-content paper-panel': viewMode === 'detail' }"
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
              <h3 class="equip-entry__name">{{ item.name }}</h3>
              <div class="equip-entry__meta">
                <UiTag :quality="item.quality">{{ item.equip?.equipLevel || 1 }} 阶</UiTag>
                <span>{{ getMetaText(item) }}</span>
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
  translateAttr,
  translateJobArray,
  parseEquipSuit
} from '../utils/itemParser'
import { getImageUrl } from '../utils/env'
import { isBlacklisted, isEquipTierHidden, visibleEquipTiers } from '../config/blacklist.js'
import { getRarityName } from '../utils/gameMappings'
import { useLazyList } from '../composables/useLazyList'
import {
  UiBackToTop,
  UiButton,
  UiCardGrid,
  UiEmptyState,
  UiFilterPill,
  UiFilterRow,
  UiItemCard,
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
let loadOperation = 0

const searchQuery = ref('')
const selectedSub = ref(null)
const selectedLevel = ref(null)
const selectedRarity = ref(null)

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
    // 建搜索索引（只做一次；后面每次按键只查 Map）
    searchIndex.value = buildSearchIndex(data.items)
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

// 提取全部装备属性效果（对齐符石图鉴效果文本与字体样式）
function getEquipEffectHtml(item) {
  if (!item?.equip) return ''
  const range = calculateEquipAttributeRange(item, item.quality, 0)
  if (!range) return ''
  const items = buildEquipAttributeItems(range)
  if (!items.length) return ''
  const parts = items.map(a => {
    const label = translateAttr(a.key)
    const val = a.min === a.max ? `${a.min}` : `${a.min}~${a.max}`
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
  gap: 12px;
  padding: 4px 2px 2px 2px;
  margin-top: 2px;
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
  background: rgba(255, 255, 255, 0.3);
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

.equips-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
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

.equip-entry__name {
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 1.6;
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
  gap: 8px;
}

@media (max-width: 1100px) {
  .items-card-grid :deep(.ui-card-grid) {
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
}

@media (max-width: 900px) {
  .equips-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
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
    gap: 6px;
  }
}

@media (max-width: 640px) {
  .equips-content {
    padding-inline: 10px;
  }
}

@media (max-width: 480px) {
  .items-card-grid :deep(.ui-card-grid) {
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .view-mode-btn span:not(.view-mode-icon) {
    display: none;
  }
  .view-mode-btn {
    padding: 4px 6px;
  }
}
</style>
