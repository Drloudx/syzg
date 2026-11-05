<template>
  <div class="page-view-container tower-page">
    <!-- 顶部筛选面板 -->
    <UiFilterPanel class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput
          :model-value="search"
          placeholder="搜索层数、怪物名称、通关目标…（例：“5”、“杜吉芽”、“首领”）"
          @update:model-value="search = $event"
        />
      </template>

      <!-- 楼层分段快捷筛选 -->
      <UiFilterRow label="楼层分段：">
        <UiFilterPill
          v-for="sec in sectionOptions"
          :key="sec.id"
          :active="activeSection === sec.id"
          @click="setSection(sec.id)"
        >
          {{ sec.label }}
        </UiFilterPill>
      </UiFilterRow>

      <!-- 快捷工具与说明条 -->
      <div class="filter-extra-bar">
        <div class="tower-summary-hint">
          <span class="hint-symbol">◆</span>
          <span class="hint-text">
            神匠之塔共 {{ summary.totalLayers || 0 }} 层，每 5 层为<strong>首领关卡</strong>。首通可获总计 <strong>{{ summary.totalKe || 0 }}</strong> 氪金与 <strong>{{ summary.totalCube || 0 }}</strong> 幻象立方。
          </span>
        </div>
        <button type="button" class="shop-trigger-btn" @click="openShop">
          <span class="btn-cube-icon" :style="{ '--icon-url': cssUrl(exchangeIconUrl) }" aria-hidden="true"></span>
          <span>幻象立方兑换中心</span>
          <span class="btn-arrow">→</span>
        </button>
      </div>

      <div class="collection-counter">
        共 <span class="count-num">{{ filteredLayers.length }}</span> 层
      </div>
    </UiFilterPanel>

    <!-- 加载与错误态 -->
    <UiEmptyState v-if="loading" type="loading" text="正在加载神匠之塔挑战数据..." />
    <UiEmptyState v-else-if="error" type="error" :text="error" @retry="loadData" />

    <!-- 80 层卡片网格列表 -->
    <div v-else id="towerScroll" class="tower-scroll-container paper-panel" data-main-scroll @scroll.passive="onScroll">
      <div v-if="filteredLayers.length" class="tower-cards-grid">
        <article
          v-for="layer in displayedLayers"
          :key="layer.layer"
          class="tower-card"
          :class="{ 'is-boss': layer.isBoss, 'is-targeted': targetLayer === layer.layer }"
          :id="`layer-${layer.layer}`"
        >
          <!-- 左侧：纯净怪物立绘展示（统一大小、去除台子） -->
          <div
            class="card-art-col"
            @click="onStageMonClick(layer)"
            :title="`点击查看【${layer.showMon.name}】怪物属性`"
            tabindex="0"
            role="button"
            @keydown.enter.prevent="onStageMonClick(layer)"
            @keydown.space.prevent="onStageMonClick(layer)"
          >
            <!-- 楼层徽章 -->
            <div class="floor-badge" :class="{ 'boss-badge': layer.isBoss }">
              <span class="badge-num">{{ layer.isBoss ? '首领' : `第 ${layer.layer} 层` }}</span>
            </div>

            <!-- 怪物立绘 -->
            <div class="art-img-box">
              <img
                :src="getImageUrl(layer.showMon.artUrl)"
                :alt="layer.showMon.name"
                class="mon-art-img"
                loading="lazy"
                decoding="async"
                @error="handleMonArtError($event, layer.showMon)"
              />
            </div>
          </div>

          <!-- 右侧：关卡目标、守军与丰厚奖励 -->
          <div class="card-info-container">
            <!-- 头部：层名、推荐等级、弱点属性、关卡实机修正、理智消耗 -->
            <div class="info-header-row">
              <div class="title-with-tags">
                <h3 class="layer-title">
                  {{ layer.name }}
                  <span v-if="layer.isBoss" class="boss-tag">首领</span>
                </h3>
              </div>
              <div class="meta-tags-row">
                <UiTag tone="accent">推荐 Lv.{{ layer.showLevel }}</UiTag>
                <div v-if="layer.elements?.length" class="element-tags">
                  <span
                    v-for="el in layer.elements"
                    :key="el.id"
                    class="element-badge"
                    :class="`el-${el.slug}`"
                    :title="`${el.name}属性弱点`"
                  >
                    {{ el.name }}弱点
                  </span>
                </div>
                <!-- 关卡实机比例修正 -->
                <div v-if="layer.scaleHp !== 1 || layer.scaleAtk !== 1" class="scale-fix-pill" title="关卡实机攻防/生命缩放">
                  修正: 生命×{{ Math.round(layer.scaleHp * 100) }}% · 攻防×{{ Math.round(layer.scaleAtk * 100) }}%
                </div>
                <!-- 理智消耗：图标随 summary.tiItemTypeId 对应的原始图标（item_10012） -->
                <div class="ti-cost-pill" title="挑战消耗理智">
                  <span class="ti-icon" :style="{ '--icon-url': cssUrl(staminaIconUrl) }" aria-hidden="true"></span>
                  <span>{{ layer.tiCost }} 理智</span>
                </div>
              </div>
            </div>

            <!-- 通关目标与机制说明 -->
            <div class="objective-box" :class="{ 'boss-objective': layer.isBoss }">
              <div class="objective-title">
                <span class="obj-dot">◆</span>
                <span>挑战目标：</span>
              </div>
              <p class="objective-desc">{{ layer.des }}</p>
              <div v-if="layer.isBoss && layer.bossRule" class="boss-rule-row">
                <span class="rule-badge">挑战机制</span>
                <span class="rule-desc">{{ layer.bossRule }}</span>
              </div>
            </div>

            <!-- 怪物波次与出场魔物（W1 改为「第 1 波」对齐日常计划，头像支持模型图回退） -->
            <div v-if="layer.rounds?.length" class="waves-section">
              <div class="waves-header">守关阵容（共 {{ layer.rounds.length }} 波）：</div>
              <div class="waves-list">
                <div v-for="(round, rIdx) in layer.rounds" :key="rIdx" class="wave-row">
                  <span class="wave-lead-label">第 {{ rIdx + 1 }} 波：</span>
                  <div class="wave-mons-flow">
                    <div
                      v-for="mon in round"
                      :key="mon.typeId"
                      class="wave-mon-pill"
                      @click="onWaveMonClick(mon, layer.showLevel)"
                      tabindex="0"
                      role="button"
                      :title="`查看【${mon.name}】属性 (实机修正: 生命×${Math.round((mon.levelScaleHp||1)*100)}% 攻防×${Math.round((mon.levelScale||1)*100)}%)`"
                      @keydown.enter.prevent="onWaveMonClick(mon, layer.showLevel)"
                    >
                      <img
                        :src="getWaveAvatarUrl(mon)"
                        :alt="mon.name"
                        class="wave-mon-avatar"
                        loading="lazy"
                        @error="handleWaveAvatarError($event, mon)"
                      />
                      <span class="wave-mon-name">{{ mon.name }}</span>
                      <span v-if="mon.count > 1" class="wave-mon-count">×{{ mon.count }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 底部：首通奖励 -->
            <div class="card-rewards-footer">
              <span class="rewards-label">首通奖励</span>
              <div class="rewards-group">
                <!-- 首通氪金 -->
                <div class="reward-chip chip-ke" title="首通赠送氪金晶石">
                  <span class="reward-icon" :style="{ '--icon-url': cssUrl(keIconUrl) }" aria-hidden="true"></span>
                  <span class="reward-amount">+{{ layer.rewards.ke }}</span>
                </div>

                <!-- 幻象立方 -->
                <div
                  class="reward-chip chip-cube"
                  :class="{ 'is-static': !exchangeItemId }"
                  @click="openItem(exchangeItemId)"
                  role="button"
                  tabindex="0"
                  title="点击查看幻象立方用途"
                >
                  <span class="reward-icon" :style="{ '--icon-url': cssUrl(exchangeIconUrl) }" aria-hidden="true"></span>
                  <span class="reward-amount">+{{ layer.rewards.cube }}</span>
                  <span class="reward-tip">立方</span>
                </div>
              </div>
            </div>
          </div>
        </article>

        <!-- 滚动加载哨兵 -->
        <div v-if="hasMoreLayers" ref="sentinelRef" class="tower-sentinel" aria-hidden="true">
          <span class="sentinel-text">正在翻阅更多挑战...</span>
        </div>
      </div>
      <UiEmptyState v-else type="empty" text="没有找到符合筛选条件的楼层" />
    </div>

    <!-- 幻象立方兑换中心弹窗 -->
    <UiModal
      v-model:visible="shopModalOpen"
      title="幻象立方兑换中心"
      width="780px"
    >
      <div class="tower-shop-modal">
        <!-- 商店介绍 -->
        <div class="shop-intro-banner">
          <span class="shop-cube-large" :style="{ '--icon-url': cssUrl(exchangeIconUrl) }" role="img" aria-label="幻象立方"></span>
          <div class="shop-intro-text">
            <h4>幻象立方</h4>
            <p>通关神匠之塔每一层均可获得幻象立方。首通 {{ summary.totalLayers || 0 }} 层共计可获取 <strong>{{ summary.totalCube || 0 }}</strong> 枚，可在此处兑换契约书、面包、华丽宝箱与升级材料。</p>
          </div>
        </div>

        <!-- 兑换物列表网格 -->
        <div class="shop-items-grid">
          <div
            v-for="item in shopItems"
            :key="item.id"
            class="shop-item-card"
          >
            <!-- 物品图标与品质 -->
            <div class="shop-item-icon-col">
              <UiItemCard
                v-if="item.rewardItem"
                :name="item.rewardItem.name"
                :img="getImageUrl(`/Common_ItemIcon/${item.rewardItem.icon}.webp`)"
                :quality="item.rewardItem.quality"
                :count="item.rewardItem.num"
                @click="openItem(item.rewardItem.id)"
              />
            </div>

            <!-- 物品说明与兑换消耗 -->
            <div class="shop-item-details">
              <div class="shop-item-head">
                <span class="shop-item-title">{{ item.rewardItem?.name || item.name }}</span>
                <span class="shop-limit-tag">{{ item.limitText }}</span>
              </div>
              <p class="shop-item-desc">{{ item.rewardItem?.desc || '神匠之塔稀有兑换道具。' }}</p>

              <div class="shop-cost-row">
                <span class="cost-label">兑换消耗：</span>
                <div class="cost-pill">
                  <span class="cost-icon" :style="{ '--icon-url': cssUrl(exchangeIconUrl) }" aria-hidden="true"></span>
                  <span class="cost-val">{{ item.costCube }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UiModal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import UiFilterPanel from '../components/ui/UiFilterPanel.vue'
import UiFilterRow from '../components/ui/UiFilterRow.vue'
import UiFilterPill from '../components/ui/UiFilterPill.vue'
import UiSearchInput from '../components/ui/UiSearchInput.vue'
import UiEmptyState from '../components/ui/UiEmptyState.vue'
import UiTag from '../components/ui/UiTag.vue'
import UiModal from '../components/ui/UiModal.vue'
import UiItemCard from '../components/ui/UiItemCard.vue'
import { getImageUrl } from '../utils/env.js'
import { fetchWithFallback } from '../utils/request.js'
import { openMonsterDetail } from '../utils/monsterModalState.js'
import { openItemDetail } from '../utils/itemModalState.js'

const route = useRoute()

const loading = ref(true)
const error = ref('')
const layersData = ref([])
const shopItems = ref([])
const summary = ref({})

// 筛选状态
const search = ref('')
const activeSection = ref('all')
const shopModalOpen = ref(false)
const targetLayer = ref(null)

const sectionOptions = computed(() => {
  const total = summary.value.totalLayers || 0
  const step = 20
  const options = [{ id: 'all', label: `全部 (1-${total})` }]
  for (let start = 1; start <= total; start += step) {
    const end = Math.min(start + step - 1, total)
    options.push({ id: `${start}-${end}`, label: `${start} - ${end} 层` })
  }
  if (summary.value.bossCount) {
    options.push({ id: 'boss', label: `首领关卡 (${summary.value.bossCount} 层)` })
  }
  return options
})

/** 兑换货币与图标：全部来自 `tower.json` 的 summary，不在前端抄物品 ID */
const exchangeItemId = computed(() => summary.value.exchangeItemTypeId || '')
const exchangeIconUrl = computed(() => {
  const icon = summary.value.exchangeItemIcon
  return icon ? getImageUrl(`/images/Common_ItemIcon/${icon}.webp`) : ''
})
const staminaIconUrl = computed(() => {
  const icon = summary.value.tiItemIcon
  return icon ? getImageUrl(`/images/Common_ItemIcon/${icon}.webp`) : ''
})
const keIconUrl = computed(() => {
  const icon = summary.value.keItemIcon
  return icon ? getImageUrl(`/images/Common_ItemIcon/${icon}.webp`) : ''
})

/**
 * 把图片 URL 转成可放进 `style` 的 CSS `url(...)` 值。
 *
 * 🔴 图标一律用 CSS 背景而不是 `<img>`：
 * 理智/氪金/立方三个图标在每张卡上各出现一次，80 层全渲染时是 **240 个 `<img>`
 * 元素**、却只对应 3 个文件（浏览器会合并下载，但 DOM 节点、解码对象、
 * `error` 监听全按元素数算）。改用背景图后这些节点不再存在，视觉与点击行为不变。
 *
 * 用 `JSON.stringify` 生成带引号的字符串，避免 URL 里的 `?v=`/`&` 破坏 CSS 解析。
 */
function cssUrl(url) {
  return url ? `url(${JSON.stringify(url)})` : 'none'
}

function setSection(secId) {
  activeSection.value = secId
}

function openShop() {
  shopModalOpen.value = true
}

function openItem(itemId) {
  if (!itemId) return
  openItemDetail(itemId)
}

function onStageMonClick(layer) {
  if (!layer?.showMon?.id) return
  openMonsterDetail(layer.showMon.id, null, layer.showLevel, {
    scaleHp: layer.scaleHp || 1,
    scaleAtk: layer.scaleAtk || 1
  })
}

function onWaveMonClick(mon, level) {
  if (!mon?.typeId) return
  openMonsterDetail(mon.typeId, null, level, {
    scaleHp: mon.levelScaleHp || 1,
    scaleAtk: mon.levelScale || 1
  })
}

/**
 * 波次怪物头像。
 *
 * 直接用建表时写进 `tower.json` 的 `icon`（来自 `mon.json` 的 icon，已含
 * 失控装置 / 安瑟恩单元 / 各塔层专属形态的正确指向）。
 * 🔴 不要在这里按 typeId 再写特判：数据里 707 条波次条目全部带 icon，
 * 特判只会与表脱钩（同 `scripts/parse/shared.mjs` 的 MON_ICON_OVERRIDES 重复维护）。
 */
function getWaveAvatarUrl(mon) {
  return getImageUrl(`/images/HeadIconAtals/${mon.icon || 'avatar_Mon_001'}.webp`)
}

function handleMonArtError(e, showMon) {
  const target = e.target
  if (!target) return
  if (target.src.includes('PicHandBookPanel_Atlas')) {
    target.src = getImageUrl(showMon?.modelUrl || `/images/model-previews/mon_${String(showMon?.id || '').toLowerCase()}.webp`)
  } else if (!target.src.includes('HeadIconAtals')) {
    target.src = getImageUrl(`/images/HeadIconAtals/${showMon?.icon || 'avatar_Mon_001'}.webp`)
  }
}

function handleWaveAvatarError(e, mon) {
  const target = e.target
  if (!target) return
  // 头像缺失 → 模型预览图 → 通用占位。两级都由数据给出的 ID 推导，不写特例。
  const modelUrl = `/images/model-previews/mon_${String(mon?.typeId || '').toLowerCase()}.webp`
  if (!target.src.includes('model-previews') && mon?.typeId) {
    target.src = getImageUrl(modelUrl)
    return
  }
  if (!target.src.includes('avatar_Mon_001')) {
    target.src = getImageUrl('/images/HeadIconAtals/avatar_Mon_001.webp')
  }
}

const filteredLayers = computed(() => {
  let list = layersData.value

  /*
   * 楼层分段按当前数据现算，不写死 1-20/21-40 之类的边界：
   * 分段 id 形如 `61-80`，解析成 [start, end] 再比。`all` 与 `boss` 单独处理。
   * 🔴 不要再按固定字符串分支 —— 层数一变（如扩到 100 层）就再也匹配不上。
   */
  const section = activeSection.value
  if (section === 'boss') {
    list = list.filter(l => l.isBoss)
  } else if (section !== 'all') {
    const [start, end] = String(section).split('-').map(Number)
    if (Number.isFinite(start) && Number.isFinite(end)) {
      list = list.filter(l => l.layer >= start && l.layer <= end)
    }
  }

  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter(l => {
      if (String(l.layer).includes(q) || `第${l.layer}层`.includes(q)) return true
      if (l.name?.toLowerCase().includes(q)) return true
      if (l.showMon?.name?.toLowerCase().includes(q)) return true
      if (l.des?.toLowerCase().includes(q)) return true
      if (q === 'boss' || q === '领主' || q === '首领' || q === '高难') return l.isBoss
      for (const round of (l.rounds || [])) {
        for (const mon of round) {
          if (mon.name?.toLowerCase().includes(q)) return true
        }
      }
      return false
    })
  }

  return list
})

// 渐进式增量懒加载：初始渲染 12 层，滚动触底增量加载，大幅减轻 DOM 与立绘重绘开销
const BATCH_SIZE = 12
const visibleCount = ref(BATCH_SIZE)

const displayedLayers = computed(() => {
  return filteredLayers.value.slice(0, visibleCount.value)
})

const hasMoreLayers = computed(() => {
  return visibleCount.value < filteredLayers.value.length
})

watch([activeSection, search], () => {
  visibleCount.value = BATCH_SIZE
})

const sentinelRef = ref(null)
let sentinelObserver = null

/**
 * 列表滚动容器。
 *
 * 🔴 **桌面端它不是滚动根**：`App.vue` 在 ≥1025px 把 `[data-main-scroll]`
 * 强制 `overflow-y: visible`，滚动由 `.app-container` 承担（整页滚）。
 * 因此不能用它当 `IntersectionObserver.root` —— 它自身高度等于内容高度，
 * 哨兵相对它恒定「可见」，只在首次回调一次，之后再滚也不会触发（实测卡在 24 层）。
 */
function getScrollContainer() {
  return document.getElementById('towerScroll')
}

/**
 * 加载下一批，直到视口填满。
 *
 * 为什么循环：`rootMargin: 400px` 下若新增 12 张仍不足以把哨兵推出阈值，
 * 交叉状态不变 → 不会再有回调 → 列表停住。加载后自检一次可闭合这个缺口。
 */
function loadNextBatch() {
  if (visibleCount.value >= filteredLayers.value.length) return
  visibleCount.value = Math.min(visibleCount.value + BATCH_SIZE, filteredLayers.value.length)
  // 加完立刻再看一眼（只读 rect，不是热路径）
  requestAnimationFrame(() => {
    if (isSentinelNear()) loadNextBatch()
  })
}

/** 哨兵是否已进入「提前 600px」区间（与 IntersectionObserver 的 rootMargin 对齐） */
function isSentinelNear() {
  const sentinel = sentinelRef.value
  if (!sentinel) return false
  const rect = sentinel.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  return rect.top <= viewportHeight + 400
}

/**
 * 滚动触底加载。
 *
 * 用 `window` 捕获阶段监听（与 `useLazyList` 同构）：桌面滚动发生在 `.app-container`、
 * 移动端发生在 `#towerScroll`，捕获阶段都能收到，无需判断谁是滚动根。
 * 热路径只读 `scrollTop / scrollHeight / clientHeight`，不碰 `getBoundingClientRect`。
 */
function onScroll(e) {
  const target = e?.target
  if (!target || typeof target.scrollHeight !== 'number') return
  if (target.scrollHeight - target.scrollTop - target.clientHeight < 600) {
    loadNextBatch()
  }
}

function setupSentinelObserver() {
  if (sentinelObserver) {
    sentinelObserver.disconnect()
    sentinelObserver = null
  }
  if (!sentinelRef.value) return
  if (!('IntersectionObserver' in window)) {
    visibleCount.value = filteredLayers.value.length
    return
  }
  /*
   * `root: null` = 视口。桌面整页滚动、移动端容器内滚动，哨兵相对视口都会移动，
   * 两种布局下语义一致。不要改回 `#towerScroll`（原因见 getScrollContainer 注释）。
   */
  sentinelObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) loadNextBatch()
  }, { root: null, rootMargin: '400px 0px' })
  sentinelObserver.observe(sentinelRef.value)
}

watch(sentinelRef, () => {
  setupSentinelObserver()
})

onMounted(() => {
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll, { capture: true })
  if (sentinelObserver) {
    sentinelObserver.disconnect()
    sentinelObserver = null
  }
})

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    /*
     * 走 `fetchWithFallback`，与其余页面一致：
     * 带 `?v=<内容哈希>`、校验 manifest 的 SHA-256、失败自动回退包内版本。
     * 🔴 不要改回裸 `fetch('/data/parsed/tower.json')` —— 那样既没有版本失效
     * （CDN 会长期发旧文件），也拿不到 `data/parsed/tower.json` 的 schema 校验。
     */
    const json = await fetchWithFallback('data/parsed/tower.json')
    layersData.value = json.layers || []
    shopItems.value = json.shop || []
    summary.value = json.summary || {}

    if (route.query.layer) {
      const targetL = parseInt(route.query.layer, 10)
      if (targetL >= 1 && targetL <= layersData.value.length) {
        targetLayer.value = targetL
        const idx = filteredLayers.value.findIndex(l => l.layer === targetL)
        if (idx >= 0 && idx >= visibleCount.value) {
          visibleCount.value = idx + 6
        }
        nextTick(() => {
          const el = document.getElementById(`layer-${targetL}`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      }
    }
  } catch (err) {
    error.value = err.message || '加载神匠之塔数据出错'
  } finally {
    loading.value = false
    nextTick(() => {
      setupSentinelObserver()
    })
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.tower-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.filter-panel {
  flex-shrink: 0;
  margin-bottom: 12px;
}

/* 楼层计数标签（与全站图鉴统一样式与字号） */
.collection-counter {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted, #7b6348);
  white-space: nowrap;
}

.count-num {
  color: var(--accent-ink, #2563eb);
  font-weight: 700;
}

/* 顶部辅助条（柔和羊皮纸微底色） */
.filter-extra-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(143, 115, 81, 0.08);
  border: 1px dashed rgba(143, 115, 81, 0.35);
  border-radius: 6px;
  gap: 12px;
  flex-wrap: wrap;
}

.tower-summary-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-main, #3e2a14);
}

.hint-symbol {
  color: #8f7351;
  font-size: 12px;
}

.shop-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #e5d5be 0%, #cfba9f 100%);
  border: 1px solid rgba(143, 115, 81, 0.5);
  color: #3e2a14;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(62, 42, 20, 0.1);
  transition: all 0.2s ease;
}

.shop-trigger-btn:hover {
  background: linear-gradient(135deg, #eedfc8 0%, #dbcbaf 100%);
  transform: translateY(-1px);
  box-shadow: 0 3px 6px rgba(62, 42, 20, 0.15);
}

.btn-cube-icon {
  display: inline-block;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  background-image: var(--icon-url, none);
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}

.btn-arrow {
  font-size: 14px;
  color: #8f7351;
}

/* 滚动区域与网格 */
.tower-scroll-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
  background: var(--paper-light, #dfceb3);
}

.tower-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
  gap: 14px;
}

@media (max-width: 600px) {
  .tower-cards-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .tower-card {
    flex-direction: column !important;
  }
  .card-art-col {
    width: 100% !important;
    min-width: 0 !important;
    height: 150px !important;
    border-right: none !important;
    border-bottom: 1px dashed rgba(143, 115, 81, 0.25) !important;
  }
}

/* 楼层大卡片（对齐日常计划与关卡图鉴的柔和羊皮纸色调） */
.tower-card {
  display: flex;
  background: var(--paper-soft, #f7efe1);
  border: 1px solid rgba(143, 115, 81, 0.32);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 5px rgba(62, 42, 20, 0.06);
  transition: all 0.22s ease;
  position: relative;
  /*
   * 离屏卡片跳过渲染，但**占位高度必须接近真实卡高**。
   *
   * 🔴 原值 `0 170px` 只有实测卡高的约一半（实测 273~337px），离屏卡片按 170px 占位、
   * 滚到跟前再按真实高度重算 → `scrollHeight` 一路上跳（实测单次最大 453px），
   * 滚动条与滚动位置随之抖动。
   *
   * 现在按「立绘列 3 行 × 约 300px + 内边距」给一个贴近实测的估值（300px），
   * 留少量余量让重算幅度小于一屏。桌面是整页滚动，估值偏差直接表现为跳动，故不取 170。
   */
  content-visibility: auto;
  contain-intrinsic-size: 0 300px;
}

.tower-sentinel {
  grid-column: 1 / -1;
  padding: 16px 0;
  text-align: center;
  color: #8f7351;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.7;
}

.tower-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 12px rgba(62, 42, 20, 0.12);
  border-color: rgba(143, 115, 81, 0.55);
}

.tower-card.is-boss {
  background: linear-gradient(180deg, #faf3e6 0%, #f3e5d0 100%);
  border: 1.5px solid #d4a753;
  box-shadow: 0 3px 8px rgba(182, 123, 45, 0.12);
}

.tower-card.is-targeted {
  outline: 3px solid #b67b2d;
  box-shadow: 0 0 16px rgba(182, 123, 45, 0.4);
}

/* 左侧：纯净怪物立绘展示 */
.card-art-col {
  width: 140px;
  min-width: 140px;
  background-color: rgba(143, 115, 81, 0.05);
  border-right: 1px dashed rgba(143, 115, 81, 0.22);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  user-select: none;
  padding: 28px 10px 14px 10px;
  box-sizing: border-box;
}

.card-art-col:hover .mon-art-img {
  transform: scale(1.08);
  filter: drop-shadow(0 6px 12px rgba(62, 42, 20, 0.22));
}

/* 楼层徽章 */
.floor-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: #4a789c;
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  z-index: 2;
}

.floor-badge.boss-badge {
  background: linear-gradient(135deg, #b83823 0%, #8c1e0e 100%);
  border: 1px solid #ffcc66;
  color: #fff;
}

/* 立绘框（统一规格 120px 居中自适应） */
.art-img-box {
  width: 100%;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mon-art-img {
  max-width: 115px;
  max-height: 115px;
  object-fit: contain;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.25s ease;
  filter: drop-shadow(0 3px 6px rgba(62, 42, 20, 0.16));
}

/* 右侧详情区 */
.card-info-container {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* 头部 */
.info-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.layer-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #3e2a14;
  display: flex;
  align-items: center;
  gap: 6px;
}

.boss-tag {
  font-size: 11px;
  background: #c4402b;
  color: #fff;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.meta-tags-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.element-tags {
  display: flex;
  gap: 4px;
}

.element-badge {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
}

.el-fire {
  background: #f8ded7;
  color: #b3321f;
  border: 1px solid #e2a89d;
}

.el-water {
  background: #e2eef5;
  color: #31648a;
  border: 1px solid #a8c7dc;
}

.el-wind {
  background: #e4f0e3;
  color: #38783d;
  border: 1px solid #afd3b0;
}

.el-ground {
  background: #f5eccf;
  color: #8b5f25;
  border: 1px solid #d9bf8c;
}

/* 关卡实机比例修正徽章 */
.scale-fix-pill {
  font-size: 10.5px;
  color: #8c5d1e;
  background: rgba(186, 140, 70, 0.12);
  border: 1px solid rgba(186, 140, 70, 0.35);
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
}

.ti-cost-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(143, 115, 81, 0.1);
  border: 1px solid rgba(143, 115, 81, 0.2);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #6b5134;
}

/*
 * 装饰性图标（理智 / 氪金 / 立方）：用 CSS 背景绘制，不生成 <img>。
 * 80 层全渲染时这 3 类图标原本各占 80 个 `<img>` 元素（共 240 个），却只有 3 个文件。
 * 立绘、头像等「每层不同」的图仍用 <img>（需要 alt / lazy / 错误回退）。
 */
.ti-icon {
  display: inline-block;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  background-image: var(--icon-url, none);
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}

/* 目标描述框 */
.objective-box {
  background: rgba(143, 115, 81, 0.06);
  border-left: 3px solid #8f7351;
  padding: 6px 8px;
  border-radius: 0 4px 4px 0;
}

.objective-box.boss-objective {
  background: rgba(196, 64, 43, 0.07);
  border-left: 3px solid #c4402b;
}

.objective-title {
  font-size: 11px;
  font-weight: 700;
  color: #6b5134;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.boss-objective .objective-title {
  color: #a42a18;
}

.obj-dot {
  font-size: 9px;
  color: #8f7351;
}

.objective-desc {
  margin: 0;
  font-size: 12.5px;
  color: #3e2a14;
  line-height: 1.4;
}

.boss-rule-row {
  margin-top: 5px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.45;
}

.rule-badge {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #a42a18;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.rule-desc {
  color: #682216;
  font-weight: 500;
}

/* 阵容波次（对齐日常计划的柔和羊皮纸内嵌胶囊） */
.waves-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.waves-header {
  color: #7b6348;
  font-weight: 600;
  font-size: 11.5px;
}

.waves-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.wave-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wave-lead-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  white-space: nowrap;
}

.wave-mons-flow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.wave-mon-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 3px;
  background: rgba(255, 250, 240, 0.55);
  border: 1px solid rgba(143, 115, 81, 0.32);
  border-radius: 4px;
  font-size: 11.5px;
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.04);
  cursor: pointer;
  transition: all 0.15s ease;
}

.wave-mon-pill:hover {
  background: rgba(255, 255, 255, 0.85);
  border-color: #8f7351;
  transform: translateY(-1px);
}

.wave-mon-avatar {
  width: 19px;
  height: 19px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(143, 115, 81, 0.25);
}

.wave-mon-name {
  font-weight: 600;
  color: var(--text-main, #3e2a14);
}

.wave-mon-count {
  font-weight: 700;
  color: #a16207;
}

/* 底部首通奖励（柔和半透明胶囊，拒绝刺眼纯白） */
.card-rewards-footer {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed rgba(143, 115, 81, 0.25);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rewards-label {
  font-size: 11px;
  font-weight: 700;
  color: #7b6348;
}

.rewards-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reward-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 250, 240, 0.65);
  border: 1px solid rgba(143, 115, 81, 0.32);
  border-radius: 14px;
  padding: 2px 8px 2px 4px;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.05);
}

.chip-ke {
  color: #8c5d1e;
  border-color: #dfc29a;
}

.chip-cube {
  color: #633f82;
  border-color: #c4abd5;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip-cube:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: #9b6ab5;
  transform: translateY(-1px);
}

.reward-icon {
  display: inline-block;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  background-image: var(--icon-url, none);
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}

.reward-tip {
  font-size: 10px;
  color: #8867a5;
  font-weight: normal;
}

/* 兑换商店弹窗内样式 */
.tower-shop-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px;
}

.shop-intro-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(234, 221, 199, 0.72);
  border: 1px solid rgba(143, 115, 81, 0.38);
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.4), 0 2px 5px rgba(62, 42, 20, 0.05);
}

.shop-cube-large {
  display: inline-block;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  background-image: var(--icon-url, none);
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15));
}

.shop-intro-text h4 {
  margin: 0 0 4px 0;
  font-size: 15px;
  color: #3e2a14;
}

.shop-intro-text p {
  margin: 0;
  font-size: 12.5px;
  color: #6b5134;
  line-height: 1.5;
}

.shop-items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.shop-item-card {
  display: flex;
  gap: 12px;
  background: rgba(246, 237, 222, 0.85);
  border: 1px solid rgba(143, 115, 81, 0.32);
  border-radius: 8px;
  padding: 11px;
  box-shadow: 0 1px 3px rgba(62, 42, 20, 0.06);
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.shop-item-card:hover {
  background: rgba(250, 243, 230, 0.95);
  border-color: rgba(143, 115, 81, 0.55);
  box-shadow: 0 3px 8px rgba(62, 42, 20, 0.1);
  transform: translateY(-1px);
}

.shop-item-icon-col {
  flex-shrink: 0;
}

.shop-item-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
}

.shop-item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.shop-item-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #3e2a14;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shop-limit-tag {
  font-size: 12px;
  font-weight: 700;
  color: #7a4f1d;
  background: rgba(143, 115, 81, 0.14);
  border: 1px solid rgba(143, 115, 81, 0.28);
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  letter-spacing: 0.2px;
}

.shop-item-desc {
  margin: 4px 0;
  font-size: 11.5px;
  color: #7b6348;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.shop-cost-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}

.cost-label {
  font-size: 11px;
  color: #7b6348;
  font-weight: 600;
}

.cost-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(124, 58, 237, 0.09);
  border: 1px solid rgba(124, 58, 237, 0.28);
  padding: 2px 9px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  color: #5b21b6;
  box-shadow: 0 1px 2px rgba(91, 33, 182, 0.08);
}

.cost-icon {
  display: inline-block;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  background-image: var(--icon-url, none);
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}
</style>
