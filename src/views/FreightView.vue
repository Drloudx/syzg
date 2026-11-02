<template>
  <div class="page-view-container freight-page">
    <UiFilterPanel class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput
          :model-value="search"
          placeholder="搜索货品、订单、NPC 或材料…（空格=“且”，、=“或”）"
          @update:model-value="setFilter('q', $event)"
        />
      </template>
      <UiTabs :model-value="tab" :options="tabs" @update:model-value="changeTab" />

      <!-- 市场 / 订单的价格档位。市场是「查看档位价格」，订单是真的按奖励分档筛选。 -->
      <UiFilterRow v-if="tab !== 'rules'" :label="tab === 'market' ? '价格档位：' : '奖励档位：'">
        <UiFilterPill :active="!tier" @click="setFilter('tier', '')">{{ tab === 'market' ? '只看基价' : '全部' }}</UiFilterPill>
        <UiFilterPill
          v-for="entry in tiers"
          :key="entry.key"
          :active="tier === entry.key"
          @click="setFilter('tier', entry.key)"
        >{{ entry.label }}</UiFilterPill>
      </UiFilterRow>

      <!-- 市场专属：采购方式 -->
      <UiFilterRow v-if="tab === 'market'" label="交易方式：">
        <UiFilterPill :active="!kind" @click="setFilter('kind', '')">全部</UiFilterPill>
        <UiFilterPill :active="kind === 'buyIn'" @click="setFilter('kind', 'buyIn')">可买入</UiFilterPill>
        <UiFilterPill :active="kind === 'sellOut'" @click="setFilter('kind', 'sellOut')">可卖出</UiFilterPill>
      </UiFilterRow>

      <div v-if="tab !== 'rules'" class="collection-counter">
        共 <span class="count-num">{{ counter }}</span> {{ tab === 'market' ? '件货品' : '个订单' }}
      </div>
    </UiFilterPanel>

    <UiEmptyState v-if="loading" type="loading" text="正在加载货运站数据..." />
    <UiEmptyState v-else-if="error" type="error" :text="error" @retry="loadData" />
    <UiCardGrid v-else id="freightScroll" class="freight-content paper-panel" :content-style="{ gridTemplateColumns: 'minmax(0, 1fr)' }">
      <!-- ── 市场 ── -->
      <template v-if="tab === 'market'">
        <div v-if="filteredGoods.length" class="freight-grid">
          <article v-for="good in displayedGoods" :key="good.typeId" class="good-entry" :data-good="good.typeId">
            <UiItemCard
              :name="good.name"
              :img="getImageUrl(`/Common_ItemIcon/${good.img}.webp`)"
              :quality="good.quality"
              @img-error="handleImageFallback"
            />
            <div class="good-entry__body">
              <h3 class="good-entry__name">{{ good.name }}</h3>
              <div class="good-entry__meta">
                <UiTag :quality="good.quality">{{ qualityLabel(good.quality) }}</UiTag>
                <span v-if="good.buyIn">可买入</span>
                <span v-else>仅能卖出</span>
                <span v-if="good.sellOut && good.buyIn">· 可卖出</span>
              </div>
              <!--
                A 口径：只给「基价 × 5 档阈值」的区间，不编造实时价。
                主价签按游戏原版：`cart_price_*` 整条（64×28，右侧箭头已画在 sprite 内）里放
                银币图标 item_00001 + 数字。默认显示基价（对应「持平」），
                选中档位后换成该档的可能价区间。
              -->
              <div class="good-entry__price">
                <span class="price-bar" :class="`price-bar--${activeTier ? activeTier.key : 'ori'}`">
                  <img class="price-bar__coin" :src="coinIcon" alt="" aria-hidden="true" />
                  <span class="price-bar__value">
                    {{ activeTier ? `${tierRange(good, activeTier).low}~${tierRange(good, activeTier).high}` : good.basePrice }}
                  </span>
                </span>
                <span class="good-entry__price-note">
                  <template v-if="activeTier">{{ activeTier.label }}档可能价 · 基价 {{ good.basePrice }}</template>
                  <template v-else>基价 · 可能 {{ good.priceRange.low }} ~ {{ good.priceRange.high }}</template>
                </span>
              </div>
              <!--
                5 档对照：文字 + 小箭头。
                这块**不用**价格条 —— 卡片正文只有约 290px，5 条游戏价签每条不足 55px，
                银币 + 三位数 + 24px 箭头必然互相压住。价签只在上面那条主价签上用。
              -->
              <div class="tier-compare">
                <span v-for="entry in tiers" :key="entry.key" class="tier-compare__cell"
                  :class="{ 'is-active': tier === entry.key }" :title="`${entry.label} ${tierRange(good, entry).low}~${tierRange(good, entry).high}`">
                  <i class="tier-compare__arrow" :class="`tier-compare__arrow--${entry.key}`" aria-hidden="true"></i>
                  <span class="tier-compare__label">{{ entry.label }}</span>
                  <span class="tier-compare__value">{{ tierPrice(good, entry) }}</span>
                </span>
              </div>
              <!--
                库存与补货只在「可买入」时显示。
                依据 `FreightMarketItemTemp.Init(typeId, num, haveNum, isBuy)`：
                `haveNum` 是市场当前存货，只在买入列表有意义；`buyIn=false` 的货品
                市场根本不进货（源码 `isBuy && !marketItemConf.buyIn` 直接置遮罩），
                给它标库存上限与补货周期是编出来的信息。
              -->
              <p v-if="good.buyIn" class="good-entry__stock">
                库存上限 {{ good.maxNum }} · 每 {{ formatDuration(good.addTime) }} 补 {{ good.addNum }}
              </p>
            </div>
          </article>
        </div>
        <UiEmptyState v-else text="没有符合条件的货品" />
      </template>

      <!-- ── 订单 ── -->
      <template v-else-if="tab === 'orders'">
        <div v-if="filteredOrders.length" class="order-grid">
          <article v-for="order in displayedOrders" :key="order.orderTypeId" class="order-card" :data-order="order.orderTypeId">
            <div class="order-card__top">
              <p v-if="order.charaText" class="order-card__say">
                <span class="order-card__say-text">{{ order.charaText }}</span>
              </p>
              <img
                v-if="order.charaImg"
                class="order-card__npc"
                :src="npcUrl(order.charaImg)"
                :alt="order.name"
                loading="lazy"
                decoding="async"
                @error="onNpcError($event, order.charaImg)"
              />
            </div>
            <h3 class="order-card__name">{{ order.name }}</h3>
            <div class="order-card__items">
              <div v-for="line in order.items" :key="line.typeId" class="order-card__item">
                <UiItemCard
                  :name="line.name"
                  :img="getImageUrl(`/Common_ItemIcon/${line.img}.webp`)"
                  :quality="line.quality"
                  :show-name="false"
                  @img-error="handleImageFallback"
                />
                <span class="order-card__need">×{{ line.num }}</span>
              </div>
            </div>
            <div class="order-card__foot">
              <span class="order-card__cost">成本 {{ order.cost }}</span>
              <span class="order-card__reward">+{{ order.reward }}</span>
            </div>
            <p class="order-card__formula">
              {{ order.cost }} × {{ order.orderValue }} + {{ order.baseValue }}
            </p>
          </article>
        </div>
        <UiEmptyState v-else text="没有符合条件的订单" />
      </template>

      <!-- ── 货运站规则 ── -->
      <template v-else>
        <UiSection title="货运站等级">
          <div class="rule-table">
            <div class="rule-row rule-row--head">
              <span>等级</span><span>营地中心</span><span>载重新增</span><span>累计载重</span><span>说明</span>
            </div>
            <div v-for="level in levels" :key="level.level" class="rule-row">
              <span>Lv{{ level.level }}</span>
              <span>{{ level.centerLevel }} 级</span>
              <span>{{ level.gain }}</span>
              <span>{{ level.total }}</span>
              <span>{{ level.desc.replace(/\{[^}]+\}/g, '…') }}</span>
            </div>
          </div>
          <p class="rule-table__note">
            表里每级写的是本级新增量；源码按 <code>for (i = 1; i &lt;= 等级; i++)</code> 逐级累加，
            所以 Lv3 实际载重加成是 <strong>{{ levels.at(-1)?.total ?? 0 }}</strong>，不是表里写的 {{ levels.at(-1)?.gain ?? 0 }}。
          </p>
        </UiSection>

        <UiSection title="订单规则">
          <div class="rule-list">
            <p>订单上限 <strong>{{ data.order.orderNumMax }}</strong> 个，超过后不再刷新新订单。</p>
            <p>空位每 <strong>{{ formatDuration(data.order.orderTimeSeconds) }}</strong> 刷新 1 个订单。</p>
            <p>每日完成 <strong>{{ dailyTarget }}</strong> 个订单可领 <strong>{{ data.order.dailyRewardMoney }}</strong> 银币。</p>
            <p>报酬公式：<strong>Σ(货品售价 × 数量) × 委托倍率 + 基础值</strong>，向下取整。</p>
            <p v-if="data.order.priceTip" class="rule-list__note">{{ data.order.priceTip }}</p>
          </div>
        </UiSection>

        <UiSection title="市场价格规则">
          <div class="rule-list">
            <p>市场价格每 <strong>{{ formatDuration(data.market.priceInterval) }}</strong> 刷新一次。</p>
            <p>
              当前价 / 基础价 落在 <strong>{{ data.market.priceMin }} ~ {{ data.market.priceMax }}</strong>，
              均分 5 档：<strong>极低</strong>（≤{{ thresholds[0] }}）、<strong>低价</strong>（≤{{ thresholds[1] }}）、
              <strong>持平</strong>（≤{{ thresholds[2] }}）、<strong>高价</strong>（≤{{ thresholds[3] }}）、
              <strong>极高</strong>（>{{ thresholds[3] }}）。
            </p>
            <p>超载系数 <strong>{{ data.market.priceOverScale }}</strong>，随机浮动区 <strong>{{ data.market.priceRandomArea }}</strong>。</p>
            <p>
              载重：基础 <strong>{{ data.ability.orderWeight }}</strong>（满级建筑累计 {{ data.ability.maxOrderWeight }}），
              超出部分按比例追加运回时间，超重基数为
              <strong>{{ formatDuration(data.ability.orderOverweightTimeSeconds) }}</strong>。
            </p>
            <p v-if="data.market.desc" class="rule-list__note">{{ data.market.desc }}</p>
            <p v-if="data.market.weightDesc" class="rule-list__note">{{ data.market.weightDesc }}</p>
          </div>
        </UiSection>
      </template>
    </UiCardGrid>
    <UiBackToTop scroll-container="#freightScroll" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithFallback } from '../utils/request.js'
import { getImageUrl, handleImageFallback } from '../utils/env.js'
import { useLazyList } from '../composables/useLazyList.js'
import { UiTabs, UiFilterPanel, UiSearchInput, UiFilterRow, UiFilterPill, UiCardGrid, UiItemCard, UiTag,
  UiEmptyState, UiBackToTop, UiSection } from '../components/ui/index.js'

const route = useRoute()
const router = useRouter()

const tabs = [
  { value: 'market', label: '市场' },
  { value: 'orders', label: '订单' },
  { value: 'rules', label: '货运站规则' }
]

const data = ref(null)
const loading = ref(true)
const error = ref('')
/** NPC 立绘加载失败时记下的名字，用于回退到 order_empty 占位图 */
const failedNpcs = ref(new Set())

const queryString = key => (typeof route.query[key] === 'string' ? route.query[key] : '')
const tab = computed(() => (tabs.some(entry => entry.value === route.query.tab) ? route.query.tab : 'market'))
const search = computed(() => queryString('q'))
const tier = computed(() => queryString('tier'))
const kind = computed(() => queryString('kind'))

const tiers = computed(() => data.value?.market.tiers || [])
const levels = computed(() => data.value?.carriage.levels || [])
const thresholds = computed(() => (tiers.value.length
  ? [...tiers.value].reverse().map(entry => entry.max)
  : []))

/** 每日订单目标：orderDailyTarget 形如 { "1": { num, reward } }，取第一档 */
const dailyTarget = computed(() => {
  const target = data.value?.order.orderDailyTarget
  const first = target ? Object.values(target)[0] : null
  return first?.num ?? 0
})

/** 银币图标：游戏货币栏与市场价签用的都是 item_00001 */
const coinIcon = computed(() => getImageUrl('/Common_ItemIcon/item_00001.webp'))
const npcUrl = name => `/images/FreightPanel_Atlas/${name}.webp`

const QUALITY_LABELS = { 1: '普通', 2: '精良', 3: '稀有', 4: '史诗', 5: '传说' }
const qualityLabel = quality => QUALITY_LABELS[Number(quality)] || '普通'

function formatDuration(seconds) {
  const total = Number(seconds) || 0
  if (total >= 3600 && total % 3600 === 0) return `${total / 3600} 小时`
  if (total >= 60) return `${Math.round(total / 60)} 分钟`
  return `${total} 秒`
}

/** 某件货在某个档位下的代表价：档位区间中值 × 基础价，向上取整到整数便于阅读 */
const tierPrice = (good, entry) => Math.round(good.basePrice * ((entry.min + entry.max) / 2))

/** 某件货在某个档位下的价格区间：基础价 × 档位上下界 */
const tierRange = (good, entry) => ({
  low: Math.round(good.basePrice * entry.min),
  high: Math.round(good.basePrice * entry.max)
})

/** 当前选中的档位对象；未选中时为 null */
const activeTier = computed(() => tiers.value.find(entry => entry.key === tier.value) || null)

/**
 * 价格档位对货品的命中判定。
 *
 * 网页拿不到服务端实时 `priceScale`，所以这里按「这件货的价格区间是否覆盖该档」来筛：
 * 基础价 × 档位阈值区间与货品自身的 [low, high] 有交集即算命中 —— 也就是
 * 「这档价位对这件货是可能的」。全部 5 档都会命中同一件货，因此该筛选的真实含义是
 * **按档位给货品排序并标出该档价格**，而不是排除。
 *
 * 这一点必须如实：不假装知道当前价。见 docs/context/specs/CAMP_AND_LIFE.md 的货运站小节。
 */
const matchesText = (haystack, needle) => {
  if (!needle) return true
  const text = haystack.filter(Boolean).join(' ').toLowerCase()
  // 空格 = 且，、= 或
  const groups = needle.trim().toLowerCase().split('、')
  return groups.every(group => group.split(/\s+/).filter(Boolean).every(word => text.includes(word)))
}

const filteredGoods = computed(() => {
  const list = data.value?.goods || []
  return list.filter(good => matchesText(
    [good.name, good.tip, good.typeId],
    search.value
  ) && (!kind.value || good[kind.value] === true))
})

const filteredOrders = computed(() => {
  const list = data.value?.orders || []
  return list.filter(order => {
    if (!matchesText([order.name, order.charaText, order.tip, ...order.items.map(line => line.name)], search.value)) return false
    if (!tier.value) return true
    // 订单按奖励金额落在哪一档来筛（订单没有 priceScale，用 reward 的相对高低代替）
    return orderTierOf(order) === tier.value
  })
})

/** 订单的「价值档位」：按 reward 在全部订单中的分位，5 等分。 */
const orderRewardBounds = computed(() => {
  const rewards = (data.value?.orders || []).map(order => order.reward).sort((a, b) => a - b)
  if (!rewards.length) return []
  const step = (rewards[rewards.length - 1] - rewards[0]) / 5
  return [0, 1, 2, 3, 4].map(i => rewards[0] + step * i)
})

function orderTierOf(order) {
  const bounds = orderRewardBounds.value
  if (bounds.length < 5) return ''
  if (order.reward > bounds[4]) return 'max'
  if (order.reward > bounds[3]) return 'high'
  if (order.reward > bounds[2]) return 'ori'
  if (order.reward > bounds[1]) return 'low'
  return 'min'
}

const counter = computed(() => (tab.value === 'market' ? filteredGoods.value.length : filteredOrders.value.length))

const { displayedItems: displayedGoods } = useLazyList(filteredGoods, 24, '#freightScroll')
const { displayedItems: displayedOrders } = useLazyList(filteredOrders, 12, '#freightScroll')

function onNpcError(event, name) {
  if (failedNpcs.value.has(name)) return
  failedNpcs.value = new Set([...failedNpcs.value, name])
  event.target.src = '/images/FreightPanel_Atlas/cart_order_empty.webp'
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    data.value = await fetchWithFallback('data/parsed/freight.json')
  } catch (cause) {
    error.value = '货运站数据加载失败，请重试。'
    console.error('Failed to load freight data:', cause)
  } finally {
    loading.value = false
  }
}

function changeTab(value) {
  const query = { ...route.query, tab: value }
  // 切模块时清掉只属于上一模块的筛选，避免 URL 里留着无效键
  delete query.tier
  delete query.kind
  router.push({ path: '/freight', query })
}

function setFilter(key, value) {
  const query = { ...route.query, tab: tab.value }
  if (value) query[key] = value
  else delete query[key]
  router.replace({ query })
}

watch(() => tab.value, () => {
  const scroller = document.querySelector('#freightScroll')
  if (scroller) scroller.scrollTo({ top: 0, behavior: 'auto' })
})

onMounted(loadData)
</script>

<style scoped>
.collection-counter { font-size: 13px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.filter-panel :deep(.ui-filter-pill.is-active) { color: var(--on-wood-text); }

.freight-content { background: var(--paper); padding: 12px 14px calc(88px + var(--safe-bottom, 0px)); }

/* ── 市场 ── */
.freight-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.good-entry { display: flex; align-items: flex-start; gap: 12px; padding: 12px; min-width: 0; background: var(--paper-soft); border: 1px solid var(--border-soft); border-radius: 6px; }
.good-entry :deep(.ui-item-card) { flex: 0 0 70px; width: 70px; margin: 0; }
.good-entry :deep(.ui-item-card__name) { display: none; }
.good-entry__body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.good-entry__name { margin: 0 0 6px; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.good-entry__meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; color: var(--text-muted); font-size: 13px; }
.good-entry__price { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; font-size: 13px; }

/*
 * 价格条 —— 与游戏市场列表同构。
 *
 * 背景用 `cart_price_*`（64×28，右侧箭头已画在 sprite 内）。图集给的是
 * borderLeft 8 / borderRight 24：左边 8px 圆角、右边 24px 箭头，中段拉伸。
 * 游戏里这几条 sprite 是 `mType: 1`（Sliced）+ `mWidth: 148`，所以这里也用九宫格，
 * 不能用 `background-size: 100% 100%` —— 整图拉伸会把箭头横向扯宽。
 *
 * 🔴 左右用 border-width、上下必须为 **0**：原来写 `border: 24px` 会真的占掉
 *    上下各 24px，元素被撑到 76px 再把内容盒压成 0；而 `border-image-width`
 *    只改绘制宽度、不改布局。所以这里显式 `border-width: 0 24px 0 8px`。
 */
.price-bar {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  height: 28px;
  padding: 0 2px 0 4px;
  box-sizing: border-box;
  border-style: solid;
  border-width: 0 24px 0 8px;
  border-color: transparent;
  border-image-slice: 0 24 0 8 fill;
  border-image-width: 0 24px 0 8px;
  border-image-repeat: stretch;
  font-size: 12px;
  line-height: 1;
}
.price-bar--max { border-image-source: url('/images/FreightPanel_Atlas/cart_price_max.webp'); }
.price-bar--high { border-image-source: url('/images/FreightPanel_Atlas/cart_price_high.webp'); }
.price-bar--ori { border-image-source: url('/images/FreightPanel_Atlas/cart_price_ori.webp'); }
.price-bar--low { border-image-source: url('/images/FreightPanel_Atlas/cart_price_low.webp'); }
.price-bar--min { border-image-source: url('/images/FreightPanel_Atlas/cart_price_min.webp'); }
.price-bar__coin { width: 17px; height: 17px; flex: none; object-fit: contain; }
.price-bar__value { font-weight: 700; color: #fff8e6; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); white-space: nowrap; }

.good-entry__price-note { font-size: 12px; line-height: 1.5; color: var(--text-muted); }

/*
 * 5 档对照（纯文字 + 箭头字形）。
 * 这里刻意不重复用游戏价签：卡片正文可用宽度约 290px，5 条价签每条不足 55px，
 * 而一条价签光右侧箭头就占 24px、银币 17px —— 必然压字。
 * 价签只在上面那条主价签上用一次，档位对照保持可读。
 */
.tier-compare { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; margin-top: 8px; }
.tier-compare__cell { display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 0; padding: 3px 2px; border-radius: 4px; background: rgba(143, 115, 81, 0.07); }
.tier-compare__cell.is-active { background: rgba(85, 117, 116, 0.2); box-shadow: inset 0 0 0 1px var(--accent-ink); }
.tier-compare__arrow { display: block; width: 0; height: 0; margin-bottom: 1px; }
.tier-compare__arrow--max { border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 9px solid #d4553f; }
.tier-compare__arrow--high { border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 9px solid #d38a2e; }
.tier-compare__arrow--ori { width: 10px; height: 3px; border-radius: 1px; background: #8c7d6c; }
.tier-compare__arrow--low { border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 9px solid #a8b52c; }
.tier-compare__arrow--min { border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 9px solid #4f9b45; }
.tier-compare__label { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.tier-compare__value { font-size: 12px; font-weight: 700; color: var(--text-main); }
/* 库存与补货：一行小字，与游戏里 market 列表底部的辅助信息同位置 */
.good-entry__stock { margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-muted); }

/* ── 订单 ── */
.order-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.order-card { position: relative; display: flex; flex-direction: column; padding: 10px; min-width: 0; background: var(--paper-soft); border: 1px solid var(--border-soft); border-radius: 6px; }
.order-card__top { position: relative; min-height: 96px; }
/*
 * 台词条用图集里的 `cart_order_say`（128×52 深棕气泡，带下尖角）。
 * 该精灵是**深色底**，文字必须用浅色，否则与背景同深、读不出来。
 * 用九宫格 border-image 而不是整图拉伸：整图拉伸会把尖角横向扯宽。
 */
.order-card__say {
  position: relative;
  margin: 0 0 4px;
  padding: 2px 6px 8px;
  border: 10px solid transparent;
  border-image-source: url('/images/FreightPanel_Atlas/cart_order_say.webp');
  border-image-slice: 14 14 20 14 fill;
  border-image-width: 10px;
  border-image-repeat: stretch;
  box-sizing: border-box;
}
.order-card__say-text { display: block; font-size: 11px; line-height: 1.35; color: #f4e6c8; text-align: center; overflow-wrap: anywhere; }
.order-card__npc { display: block; height: 76px; width: auto; max-width: 100%; margin: 0 auto; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25)); }
.order-card__name { margin: 6px 0 4px; font-size: 14px; text-align: center; overflow-wrap: anywhere; }
.order-card__items { display: flex; justify-content: center; gap: 8px; }
.order-card__item { position: relative; flex: 0 0 54px; }
.order-card__item :deep(.ui-item-card) { max-width: 54px; }
.order-card__need { position: absolute; right: 0; bottom: -2px; font-size: 11px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9); }
.order-card__foot { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--border-soft); }
.order-card__cost { font-size: 12px; color: var(--text-muted); }
.order-card__reward { font-size: 15px; font-weight: 700; color: var(--accent-ink); }
.order-card__formula { margin: 2px 0 0; font-size: 11px; color: var(--text-muted); text-align: right; }

/* ── 规则 ── */
.rule-table { display: flex; flex-direction: column; gap: 2px; }
.rule-row { display: grid; grid-template-columns: 56px 80px 76px 76px minmax(0, 1fr); gap: 8px; padding: 6px 4px; font-size: 13px; border-bottom: 1px solid var(--border-soft); }
.rule-row--head { font-weight: 700; color: var(--text-muted); }
.rule-row span { min-width: 0; overflow-wrap: anywhere; }
.rule-table__note { margin: 8px 0 0; font-size: 12px; line-height: 1.7; color: var(--text-muted); }
.rule-table__note code { font-family: var(--font-mono, monospace); font-size: 12px; }
.rule-table__note strong { color: var(--accent-ink); }
.rule-list { display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 1.7; }
.rule-list p { margin: 0; }
.rule-list strong { color: var(--accent-ink); }
.rule-list__note { color: var(--text-muted); font-size: 12px; }

@media (max-width: 1024px) {
  .order-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .freight-content { padding-inline: 10px; }
  .freight-grid { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .order-grid { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .good-entry { padding: 10px; gap: 8px; }
  /* 手机上一行放不下 5 档：改成两行 */
  .tier-compare { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rule-row { grid-template-columns: 44px 62px 62px 62px minmax(0, 1fr); font-size: 12px; }
}
</style>
