<template>
  <section class="admin-workshop">
    <!-- 头部 -->
    <div class="workshop-header">
      <h1 class="workshop-title">
        <span class="workshop-title-star">✦</span>
        <span>审计日志</span>
      </h1>
      <p class="workshop-subtitle">
        ✦ 管理员操作留痕与追责账本（封禁、删除、提权等高权动作留痕）
      </p>
    </div>

    <!-- 工具与操作提示 -->
    <div class="audit-toolbar">
      <p class="search-hint-text">
        说明：按时间倒序收录所有管理员与超管的后台操作记录。
      </p>
      <button type="button" class="btn-refresh" :disabled="loading" @click="load()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"></path>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span>{{ loading ? '刷新中…' : '刷新日志' }}</span>
      </button>
    </div>

    <p v-if="errorMessage" class="admin-error-banner">{{ errorMessage }}</p>
    <div v-if="loading && !entries.length" class="empty-hint-box">正在读取审计账本…</div>
    <div v-else-if="!entries.length && !errorMessage" class="empty-hint-box">还没有任何管理操作留痕记录。</div>

    <!-- 羊皮纸日志表格 -->
    <div v-else class="table-container" ref="tableContainerRef">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width: 150px">发生时间</th>
            <th style="width: 140px">操作执行者</th>
            <th style="width: 120px">执行动作</th>
            <th style="width: 110px">涉及目标</th>
            <th>详细说明与上下文</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td class="mono-cell">{{ formatDate(e.createdAt) }}</td>
            <td>
              <div class="user-name-text">
                {{ e.actorNick }}
                <span class="role-badge" :class="{ 'role-badge--super': e.actorRole >= 2, 'role-badge--admin': e.actorRole === 1 }">
                  （{{ roleLabel(e.actorRole) }}）
                </span>
              </div>
            </td>
            <td>
              <span class="action-badge" :class="{ 'action-badge--danger': isDestructive(e.action) }">
                {{ actionLabel(e.action) }}
              </span>
            </td>
            <td class="mono-cell">
              {{ e.targetType === 'user' ? '用户' : '评论' }} #{{ e.targetId }}
            </td>
            <td class="detail-cell">{{ e.detail || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 翻页控制栏（主流分页：[上一页] [1] ... [7] [8] [9] [10] [11] ... [28] [下一页] + 跳转） -->
    <div v-if="totalPages > 1 || entries.length" class="pagination-bar">
      <button
        type="button"
        class="page-btn"
        :disabled="currentPage <= 1 || loading"
        @click="goToPage(currentPage - 1)"
      >
        上一页
      </button>

      <template v-for="(item, idx) in displayedPageItems" :key="idx">
        <span v-if="item === '...'" class="page-ellipsis">…</span>
        <button
          v-else
          type="button"
          class="page-number"
          :class="{ active: item === currentPage }"
          :disabled="loading"
          @click="goToPage(item)"
        >
          {{ item }}
        </button>
      </template>

      <button
        type="button"
        class="page-btn"
        :disabled="currentPage >= totalPages || loading"
        @click="goToPage(currentPage + 1)"
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
        <button type="button" class="page-jumper-btn" :disabled="loading" @click="handleJump">
          确定
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * 审计页（**仅超管可见**，服务端强校验）。
 */
import { computed, onMounted, ref } from 'vue'

import { AdminApiError, fetchAdminAudit } from '../../utils/adminApi.js'

const entries = ref([])
const loading = ref(false)
const errorMessage = ref('')

// 分页控制
const currentPage = ref(1)
const totalPages = ref(1)
const totalCount = ref(0)
const jumpPageInput = ref('')

const displayedPageItems = computed(() => {
  return getPaginationItems(currentPage.value, totalPages.value, 2)
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
  if (left > 2) items.push('...')
  for (let i = left; i <= right; i++) {
    items.push(i)
  }
  if (right < total - 1) items.push('...')
  items.push(total)
  return items
}

const ACTION_LABELS = {
  ban: '封禁账号',
  unban: '解除封禁',
  user_delete: '彻底删除用户',
  comment_show: '放行评论',
  comment_hide: '隐藏评论',
  comment_pending: '打回待审',
  comment_delete: '彻底删除评论',
  role_set: '变更权限角色',
  review_presets_set: '改待审常用选项'
}

const DESTRUCTIVE = new Set(['user_delete', 'comment_delete', 'ban', 'comment_hide'])

const ROLE_LABELS = { 0: '普通用户', 1: '管理员', 2: '超级管理员' }

const actionLabel = (a) => ACTION_LABELS[a] || a
const roleLabel = (r) => ROLE_LABELS[r] || String(r)
const isDestructive = (a) => DESTRUCTIVE.has(a)

function resetAndLoad() {
  currentPage.value = 1
  totalCount.value = 0
  safeLoad({ page: 1 })
}

const tableContainerRef = ref(null)

function scrollToTableTop() {
  if (tableContainerRef.value) {
    tableContainerRef.value.scrollTop = 0
  }
  const el = document.querySelector('.admin-workshop .table-container')
  if (el) el.scrollTop = 0
}

function goToPage(p) {
  if (p < 1 || p === currentPage.value || loading.value) return
  if (p > totalPages.value) return
  scrollToTableTop()
  safeLoad({ page: p }).then(() => {
    scrollToTableTop()
  })
}

function handleJump() {
  const p = Number.parseInt(jumpPageInput.value, 10)
  if (!Number.isFinite(p) || p < 1) return
  const validPage = Math.min(Math.max(p, 1), totalPages.value)
  jumpPageInput.value = ''
  goToPage(validPage)
}

async function load({ page: reqPage } = {}) {
  loading.value = true
  errorMessage.value = ''
  const targetPage = reqPage !== undefined ? reqPage : currentPage.value
  try {
    const data = await fetchAdminAudit({
      page: targetPage,
      total: totalCount.value > 0 && targetPage !== 1 ? totalCount.value : undefined
    })
    entries.value = data.entries || []
    currentPage.value = data.page ?? targetPage
    totalPages.value = data.totalPages ?? 1
    totalCount.value = data.total ?? entries.value.length
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

let seq = 0
function safeLoad(options = {}) {
  const mine = ++seq
  return load(options).then(() => {
    if (mine !== seq) return
  })
}

function formatDate(sec) {
  if (!sec) return '—'
  const d = new Date(sec * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

onMounted(() => {
  safeLoad({ page: 1 })
})
</script>

<style scoped>
.admin-workshop {
  --wood-border: #7a5c3d;
  --gold-border: rgba(143, 115, 81, 0.45);
  --gold-accent: #c5913e;
  --gold-bright: #ffd78c;
  --text-main: #3e2a14;
  --text-muted: #755c3f;
  --paper-soft: #f4ecdc;
  --paper-card: #f9f5eb;

  flex: 1;
  min-width: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  border: 2px solid var(--wood-border);
  border-radius: 8px;
  background: var(--paper-soft);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  padding: 18px 24px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.workshop-header {
  flex-shrink: 0;
  border-bottom: 1.5px solid var(--gold-border);
  padding-bottom: 12px;
}
.workshop-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.workshop-title-star {
  color: #c5913e;
  font-size: 19px;
}
.workshop-subtitle {
  font-size: 12.5px;
  color: var(--text-muted);
  margin: 4px 0 0;
  letter-spacing: 0.5px;
}

.audit-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.table-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
  border: 1.5px solid rgba(143, 115, 81, 0.4);
  border-radius: 6px;
  background: var(--paper-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.admin-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 12px 12px;
  background: #ebe0ce;
  color: var(--text-muted);
  font-weight: 700;
  border-bottom: 1.5px solid rgba(143, 115, 81, 0.35);
  letter-spacing: 0.5px;
  box-shadow: 0 1px 0 rgba(143, 115, 81, 0.35);
}

:deep(.dark-mode) .admin-table thead th,
.dark-mode .admin-table thead th {
  background: #251b11;
}

.admin-table td {
  padding: 10px 12px;
  border-bottom: 1px dashed rgba(143, 115, 81, 0.25);
  color: var(--text-main);
  vertical-align: middle;
  transition: background 0.15s;
}

.admin-table tbody tr:last-child td {
  border-bottom: none;
}

.admin-table tbody tr:hover td {
  background-color: rgba(245, 237, 222, 0.85);
}
:deep(.dark-mode) .admin-table tbody tr:hover td,
.dark-mode .admin-table tbody tr:hover td {
  background-color: rgba(60, 45, 30, 0.5);
}

.user-name-text {
  font-weight: 700;
  color: var(--text-main);
}

.mono-cell {
  font-family: ui-monospace, "Cascadia Code", "Roboto Mono", monospace;
  font-size: 12px;
  color: var(--text-muted);
}

.detail-cell {
  color: var(--text-main);
  font-size: 12.5px;
  line-height: 1.4;
}

.role-badge {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
}
.role-badge--super {
  color: #c5913e;
  font-weight: 800;
}
.role-badge--admin {
  color: #557574;
  font-weight: 700;
}

.action-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(143, 115, 81, 0.15);
  color: var(--text-main);
  border: 1px solid rgba(143, 115, 81, 0.3);
}

.action-badge--danger {
  color: #b83232;
  background: rgba(184, 50, 50, 0.12);
  border-color: rgba(184, 50, 50, 0.3);
}

.pagination-bar {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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

.btn-refresh {
  height: 34px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid rgba(143, 115, 81, 0.5);
  color: var(--text-main);
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.btn-refresh:hover:not(:disabled) {
  background: rgba(143, 115, 81, 0.18);
  border-color: #a88452;
}

.search-hint-text {
  font-size: 12px;
  color: var(--text-muted);
}

.admin-error-banner {
  padding: 10px 14px;
  background: rgba(184, 50, 50, 0.12);
  border: 1px solid rgba(184, 50, 50, 0.3);
  border-radius: 6px;
  color: #b83232;
  font-size: 13px;
}

.empty-hint-box {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13.5px;
}
</style>
