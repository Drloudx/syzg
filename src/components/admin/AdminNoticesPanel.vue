<template>
  <section class="admin-workshop admin-notices-panel">
    <div class="workshop-header">
      <h1 class="workshop-title">
        <span class="workshop-title-star">✦</span>
        <span>公告管理</span>
      </h1>
      <p class="workshop-subtitle">
        ✦ 维护站内公告与官方公告，首页显示哪几条由「首页管理」挑选（仅超管）
      </p>
    </div>

    <!-- 工具栏：频道 + 搜索 + 新建 -->
    <div class="admin-toolbar admin-toolbar--sub">
      <div class="notice-toolbar-left">
        <div class="admin-filters">
          <button
            v-for="ch in CHANNELS"
            :key="ch.value"
            type="button"
            class="admin-chip"
            :class="{ 'is-on': channel === ch.value }"
            @click="switchChannel(ch.value)"
          >
            <span>{{ ch.label }}</span>
            <span v-if="counts[ch.value] != null" class="admin-chip-count">{{ counts[ch.value] }}</span>
          </button>
        </div>

        <div class="search-input-group">
          <div class="notice-search-box">
            <span class="notice-search-icon">🔍</span>
            <input
              v-model="keyword"
              class="admin-input notice-search-input"
              type="text"
              autocomplete="off"
              placeholder="搜索标题或公告 ID…"
              @keydown="onKeydown"
            />
            <button
              v-show="keyword"
              type="button"
              class="notice-search-clear"
              tabindex="-1"
              title="清除搜索"
              @click="clearSearch"
            >
              ✕
            </button>
          </div>
          <button type="button" class="admin-btn admin-btn--ghost admin-btn--search" @click="doSearch">搜索</button>
          <select v-model="statusFilter" class="select-dropdown" title="按状态筛选公告" @change="onStatusChange">
            <option value="">全部</option>
            <option value="1">启用</option>
            <option value="0">停用</option>
          </select>
        </div>
      </div>

      <div class="notice-toolbar-right">
        <button type="button" class="admin-btn admin-btn--gold" @click="goCreate">
          + 新建{{ channel === 'site' ? '本站' : '官方' }}公告
        </button>
      </div>
    </div>

    <p v-if="loading && !rows.length" class="admin-hint">正在加载公告列表…</p>
    <p v-else-if="loadError" class="admin-error">⚠ {{ loadError }}</p>

    <template v-else>
      <p v-if="!rows.length" class="admin-hint">
        {{ appliedKeyword ? `没有标题包含「${appliedKeyword}」的公告。` : '该频道还没有公告，可点击右上角新建。' }}
      </p>

      <!-- 卡片条目列表 (加载中保持占位半透明，不销毁 DOM 导致闪烁) -->
      <div v-else class="notice-cards-list" :class="{ 'is-loading': loading }">
        <div
          v-for="n in rows"
          :key="n.id"
          class="notice-card-item"
          :class="{ 'is-inactive': !n.isActive }"
          role="button"
          tabindex="0"
          :title="`点击编辑公告「${n.title}」`"
          @click="goEdit(n)"
          @keydown.enter.prevent="goEdit(n)"
          @keydown.space.prevent="goEdit(n)"
        >
          <div class="notice-card-left">
            <span class="notice-card-id">#{{ n.id }}</span>
            <span class="notice-card-title">{{ n.title }}</span>
          </div>

          <div class="notice-card-right">
            <span v-if="n.tagText" class="notice-card-tag" :class="`is-${n.tagClass || 'info'}`">{{ n.tagText }}</span>
            <span v-if="n.showInModal" class="notice-card-modal-badge" title="会在首页有新公告时自动弹窗">自动弹窗</span>
            <span v-if="!n.isActive" class="notice-card-status is-off">已停用</span>
            <span v-else class="notice-card-status is-on">展示中</span>
            <span class="notice-card-date">{{ n.date }}</span>
            <span class="notice-card-arrow">›</span>
          </div>
        </div>
      </div>

      <!-- 翻页控制栏（主流分页：[上一页] [1] ... [7] [8] [9] [10] [11] ... [28] [下一页] + 跳转） -->
      <div v-if="totalPages > 1 || rows.length" class="pagination-bar">
        <span v-if="total > 0" class="pagination-total">共 {{ total.toLocaleString() }} 条</span>

        <button
          type="button"
          class="page-btn"
          :disabled="page <= 1 || loading"
          @click="goPage(page - 1)"
        >
          上一页
        </button>

        <template v-for="(item, idx) in displayedPageItems" :key="idx">
          <span v-if="item === '...'" class="page-ellipsis">…</span>
          <button
            v-else
            type="button"
            class="page-number"
            :class="{ active: item === page }"
            :disabled="loading"
            @click="goPage(item)"
          >
            {{ item }}
          </button>
        </template>

        <button
          type="button"
          class="page-btn"
          :disabled="page >= totalPages || loading"
          @click="goPage(page + 1)"
        >
          下一页
        </button>

        <div v-if="totalPages > 1" class="page-jumper">
          <span>跳至</span>
          <input
            type="number"
            v-model.number="jumpPageInput"
            :min="1"
            :max="totalPages"
            class="page-jumper-input"
            placeholder=""
            @keydown.enter="handleJump"
          />
          <span>页</span>
          <button
            type="button"
            class="page-jumper-btn"
            :disabled="loading || !jumpPageInput"
            @click="handleJump"
          >
            确定
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
/**
 * 公告管理列表。
 *
 * 一公告一行（频道 / 标题 / 标签 / 日期 / 状态），点整行进编辑页。
 * 频道切换与搜索都重新请求 —— 分页在后端做，因为公告会长期增长。
 *
 * 「首页显示哪几条」不在这里管，在「首页管理」的公告 Tab。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AdminApiError } from '../../utils/adminApi.js'
import { fetchNotices } from '../../utils/adminNoticesApi.js'

const route = useRoute()
const router = useRouter()

const CHANNELS = [
  { value: 'site', label: '本站公告' },
  { value: 'official', label: '官方公告' }
]

const PAGE_SIZE = 20

const channel = ref(route.query.channel === 'official' ? 'official' : 'site')
const keyword = ref(String(route.query.q || ''))
const appliedKeyword = ref(String(route.query.q || ''))
const statusFilter = ref(String(route.query.status || ''))
const page = ref(1)

const rows = ref([])
const total = ref(0)
const counts = ref({ site: null, official: null })
const loading = ref(true)
const loadError = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const jumpPageInput = ref('')

const displayedPageItems = computed(() => {
  return getPaginationItems(page.value, totalPages.value, 2)
})

function getPaginationItems(current, total, delta = 2) {
  if (total <= 1) return [1]
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  let left = current - delta
  let right = current + delta

  if (left <= 2) {
    left = 2
    right = 2 + delta * 2
  }
  if (right >= total - 1) {
    right = total - 1
    left = (total - 1) - delta * 2
  }

  left = Math.max(2, left)
  right = Math.min(total - 1, right)

  const items = [1]
  if (left > 2) {
    items.push('...')
  }
  for (let i = left; i <= right; i++) {
    items.push(i)
  }
  if (right < total - 1) {
    items.push('...')
  }
  items.push(total)
  return items
}

function handleJump() {
  const target = Number(jumpPageInput.value)
  if (!target || target < 1 || target > totalPages.value) return
  goPage(target)
  jumpPageInput.value = ''
}

/**
 * 仅在非输入法拼音确认（!isComposing 且 keyCode !== 229）按下 Enter 时触发搜索。
 * 平时打字、选词、删除均不触发任何读库或接口请求。
 */
function onKeydown(e) {
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault()
    doSearch()
  }
}

/** 提交搜索：只有点「搜索」或按 Enter 时才查 */
function doSearch() {
  appliedKeyword.value = keyword.value.trim()
  page.value = 1
  load()
}

function clearSearch() {
  keyword.value = ''
  appliedKeyword.value = ''
  page.value = 1
  load()
}

function onStatusChange() {
  page.value = 1
  load()
}

function switchChannel(v) {
  if (channel.value === v) return
  channel.value = v
  page.value = 1
  load()
}

function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  load()
}

/** URL 带上频道、搜索词与状态，刷新/分享/后退都正常 */
function syncQuery() {
  const q = {}
  if (channel.value !== 'site') q.channel = channel.value
  if (appliedKeyword.value) q.q = appliedKeyword.value
  if (statusFilter.value !== '') q.status = statusFilter.value
  if (page.value > 1) q.page = String(page.value)
  router.replace({ path: '/admin/notices', query: q }).catch(() => {})
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await fetchNotices({
      channel: channel.value,
      q: appliedKeyword.value || undefined,
      status: statusFilter.value !== '' ? statusFilter.value : undefined,
      page: page.value,
      size: PAGE_SIZE
    })
    rows.value = data.notices || []
    total.value = data.total || 0
    counts.value[channel.value] = data.total || 0
    syncQuery()
  } catch (err) {
    loadError.value = err instanceof AdminApiError
      ? `${err.message}${err.isUnauthorized ? '（本页仅超管可访问）' : ''}`
      : (err?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

/** 两个频道的条数：分别查一次 total（只在首次进页面做） */
async function loadCounts() {
  try {
    const [site, official] = await Promise.all([
      fetchNotices({ channel: 'site', page: 1, size: 1 }),
      fetchNotices({ channel: 'official', page: 1, size: 1 })
    ])
    counts.value = { site: site.total || 0, official: official.total || 0 }
  } catch {
    /* 条数拿不到不影响主流程 */
  }
}

function goEdit(n) {
  router.push(`/admin/notices/${encodeURIComponent(n.id)}`)
}

function goCreate() {
  router.push({ path: '/admin/notices/new', query: { channel: channel.value } })
}

onMounted(() => {
  load()
  loadCounts()
})
</script>

<style scoped>
/* ==================== 羊皮纸主工坊面板容器 (与首页管理统一) ==================== */
.admin-workshop {
  --wood-border: #7a5c3d;
  --gold-border: rgba(143, 115, 81, 0.45);
  --gold-accent: #c5913e;
  --text-main: #3e2a14;
  --text-muted: #755c3f;
  --paper-soft: #f4ecdc;
  --paper-card: #f9f5eb;

  flex: 1;
  min-width: 0;
  height: 100%;
  max-height: 100%;
  overflow-y: auto;
  border: 2px solid var(--wood-border);
  border-radius: 8px;
  background: var(--paper-soft);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  box-sizing: border-box;
}

:deep(.dark-mode) .admin-workshop,
.dark-mode .admin-workshop {
  --wood-border: #5c4327;
  --gold-border: rgba(143, 115, 81, 0.3);
  --gold-accent: #d4a359;
  --text-main: #e8dbc3;
  --text-muted: #ab9274;
  --paper-soft: #33261a;
  --paper-card: #271d13;
}

/* WebKit 平滑滚动条美化 */
.admin-workshop::-webkit-scrollbar {
  width: 8px;
}
.admin-workshop::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.04);
  border-radius: 4px;
}
.admin-workshop::-webkit-scrollbar-thumb {
  background: rgba(122, 92, 61, 0.35);
  border-radius: 4px;
}
.admin-workshop::-webkit-scrollbar-thumb:hover {
  background: rgba(122, 92, 61, 0.6);
}

/* 页面大标题 */
.workshop-header {
  flex-shrink: 0;
  border-bottom: 1.5px solid var(--gold-border);
  padding-bottom: 14px;
}
.workshop-title {
  font-size: 23px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.workshop-title-star {
  color: var(--gold-accent);
  font-size: 19px;
}
.workshop-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  margin: 4px 0 0;
  letter-spacing: 0.5px;
}

/* ==================== 工具栏 (胶囊 + 搜索 + 新建按钮) ==================== */
.admin-toolbar--sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin: 0;
}

.notice-toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.admin-filters {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.admin-chip-count {
  margin-left: 2px;
  font-size: 11px;
  opacity: 0.8;
  font-family: ui-monospace, monospace;
}

.search-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 搜索框：紧跟在筛选胶囊后 */
.notice-search-box {
  display: flex;
  align-items: center;
  position: relative;
  width: 240px;
  height: 34px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.notice-search-icon {
  position: absolute;
  left: 10px;
  font-size: 13px;
  color: var(--text-muted);
  pointer-events: none;
}

.notice-search-input {
  width: 100%;
  height: 34px;
  line-height: 34px;
  box-sizing: border-box;
  padding-left: 32px !important;
  padding-right: 28px !important;
  background-color: var(--paper-card, #f9f5eb);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

/* 彻底隐藏 WebKit 浏览器原生搜索清除按钮与原生装饰（蓝色 x） */
.notice-search-input::-webkit-search-cancel-button,
.notice-search-input::-webkit-search-decoration,
.notice-search-input::-webkit-search-results-button,
.notice-search-input::-webkit-search-results-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none !important;
}

.notice-search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  line-height: 1;
  transition: color 0.15s ease, background-color 0.15s ease;
}
.notice-search-clear:hover {
  color: #b83232;
  background: rgba(184, 50, 50, 0.12);
}

/* 状态筛选下拉框 (与用户管理统一风格) */
.select-dropdown {
  height: 34px;
  line-height: 34px;
  padding: 0 28px 0 12px;
  border-radius: 6px;
  border: 1.5px solid rgba(143, 115, 81, 0.45);
  background: var(--paper-card, #f9f5eb) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a5c3d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat calc(100% - 8px) center;
  color: var(--text-main);
  font-size: 13px;
  outline: none;
  cursor: pointer;
  appearance: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.select-dropdown:focus {
  border-color: #a88452;
  box-shadow: 0 0 0 2px rgba(168, 132, 82, 0.2);
}

.notice-toolbar-right {
  display: flex;
  align-items: center;
  margin-left: auto;
}

/* ==================== 公告列表卡片 (象牙暖金羊皮纸实体) ==================== */
.notice-cards-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: opacity 0.15s ease;
}

.notice-cards-list.is-loading {
  opacity: 0.6;
  pointer-events: none;
}

.notice-card-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
  background: var(--paper-card, #f9f5eb);
  border: 1.5px solid rgba(143, 115, 81, 0.35);
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: all 0.18s ease;
  box-sizing: border-box;
}

.notice-card-item:hover {
  background: #ffffff;
  border-color: #c69234;
  box-shadow: 0 4px 14px rgba(122, 92, 61, 0.12);
  transform: translateY(-1px);
}

.notice-card-item:focus-visible {
  outline: 2px solid #c69234;
  outline-offset: 1px;
}

.notice-card-item.is-inactive {
  opacity: 0.6;
  background: rgba(143, 115, 81, 0.06);
}

.notice-card-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.notice-card-id {
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.notice-card-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-card-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.notice-card-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 3px;
  white-space: nowrap;
}

/* 标签配色 */
.notice-card-tag.is-pinned { background: #8b0000; color: #fff; }
.notice-card-tag.is-patch  { background: #c69234; color: #2b1f15; }
.notice-card-tag.is-event  { background: #4b7a78; color: #fff; }
.notice-card-tag.is-info   { background: #8f7351; color: #fff; }
.notice-card-tag.is-gold   { background: #c69234; color: #2b1f15; }

.notice-card-modal-badge {
  font-size: 10.5px;
  padding: 1.5px 5px;
  border-radius: 3px;
  background: rgba(197, 145, 62, 0.18);
  border: 1px solid rgba(197, 145, 62, 0.45);
  color: #8a6408;
  font-weight: 600;
  white-space: nowrap;
}

.notice-card-status {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.notice-card-status.is-on {
  color: #287a4c;
  background: rgba(40, 122, 76, 0.12);
}

.notice-card-status.is-off {
  color: #b83232;
  background: rgba(184, 50, 50, 0.12);
}

.notice-card-date {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.notice-card-arrow {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-muted);
  transition: transform 0.15s ease, color 0.15s ease;
}

.notice-card-item:hover .notice-card-arrow {
  transform: translateX(3px);
  color: #c69234;
}

/* ==================== 统一分页控制栏 ==================== */
.pagination-bar {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pagination-total {
  font-size: 12.5px;
  color: var(--text-muted);
  margin-right: 8px;
  font-variant-numeric: tabular-nums;
}

.page-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid rgba(143, 115, 81, 0.45);
  background: var(--paper-card);
  color: var(--text-main);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.page-btn:hover:not(:disabled) {
  background: rgba(245, 237, 222, 0.9);
  border-color: #a88452;
}
.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-number {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid rgba(143, 115, 81, 0.35);
  background: var(--paper-card);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.page-number:hover:not(:disabled) {
  border-color: #a88452;
}
.page-number.active {
  background: linear-gradient(135deg, #3e2613, #2b1a0d);
  color: #f7e6c4;
  border-color: #c5913e;
  font-weight: 800;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}
.page-number:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:deep(.dark-mode) .page-number.active,
.dark-mode .page-number.active {
  background: linear-gradient(135deg, #52341b, #38210f);
  color: #ffd78c;
  border-color: #e5b060;
}

.page-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 32px;
  color: var(--text-muted);
  font-size: 14px;
  letter-spacing: 2px;
  user-select: none;
}

.page-jumper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.page-jumper-input {
  width: 44px;
  height: 28px;
  padding: 0 4px;
  text-align: center;
  border-radius: 5px;
  border: 1px solid rgba(143, 115, 81, 0.45);
  background: var(--paper-card);
  color: var(--text-main);
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.page-jumper-input:focus {
  border-color: #a88452;
  box-shadow: 0 0 0 2px rgba(168, 132, 82, 0.2);
}

.page-jumper-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 5px;
  border: 1px solid rgba(143, 115, 81, 0.45);
  background: var(--paper-card);
  color: var(--text-main);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.page-jumper-btn:hover:not(:disabled) {
  background: rgba(245, 237, 222, 0.95);
  border-color: #a88452;
}

.page-jumper-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 窄屏适配 */
@media (max-width: 900px) {
  .notice-card-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .notice-card-right {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .notice-card-arrow {
    margin-left: auto;
  }
}
</style>
