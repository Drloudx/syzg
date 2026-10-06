<template>
  <section class="admin-panel">
    <div class="admin-toolbar">
      <div class="admin-filters">
        <button
          v-for="f in FILTERS"
          :key="f.value"
          type="button"
          class="admin-chip"
          :class="{ 'is-on': statusFilter === f.value }"
          @click="setFilter(f.value)"
        >
          {{ f.label }}
          <template v-if="f.value === '0' && pendingCount > 0">（{{ pendingCount }}）</template>
        </button>
      </div>

      <input
        :value="searchInput"
        class="admin-input admin-search"
        type="search"
        placeholder="搜正文 / 昵称 / 页面标识"
        @input="onSearchInput($event.target.value)"
        @keydown.enter="applySearch"
      />
      <button type="button" class="admin-btn admin-btn--sm" @click="applySearch">搜索</button>
      <button v-if="searchQuery" type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="clearSearch">
        清除
      </button>
    </div>

    <p v-if="errorMessage" class="admin-error">{{ errorMessage }}</p>
    <p v-if="loading && !comments.length" class="admin-hint">正在加载…</p>
    <p v-else-if="!comments.length && !errorMessage" class="admin-hint">
      {{ searchQuery ? '没有匹配的评论。' : '这一档没有评论。' }}
    </p>

    <div v-else class="admin-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width: 56px">#</th>
            <th style="width: 120px">作者</th>
            <th>正文</th>
            <th style="width: 130px">页面</th>
            <th style="width: 92px">状态</th>
            <th style="width: 140px">时间</th>
            <th style="width: 190px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in comments" :key="c.id">
            <td class="admin-num">{{ c.id }}</td>
            <td class="admin-cell-wrap">
              {{ c.nick }}
              <!-- 账号体系之后的新评论带 userId；老的（账号之前）为空 -->
              <span v-if="c.userId" class="admin-num admin-userid">#{{ c.userId }}</span>
            </td>
            <td class="admin-cell-wrap">
              <EmoticonText :text="c.body" />
              <div v-if="c.parentId" class="admin-quote">回复 #{{ c.parentId }}</div>
              <div v-if="c.reviewReason" class="admin-quote admin-quote--warn">命中：{{ c.reviewReason }}</div>
            </td>
            <td class="admin-cell-wrap">{{ c.pageLabel || c.pageKey }}</td>
            <td>{{ statusLabel(c.status) }}</td>
            <td class="admin-num">{{ formatTime(c.createdAt) }}</td>
            <td>
              <div class="admin-row-actions">
                <button v-if="c.status !== 1" type="button" class="admin-btn admin-btn--sm" @click="changeStatus(c, 1)">
                  放行
                </button>
                <button v-if="c.status !== 2" type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="changeStatus(c, 2)">
                  隐藏
                </button>
                <button
                  type="button"
                  class="admin-btn admin-btn--danger admin-btn--sm"
                  :disabled="deletingId === c.id"
                  @click="hardDelete(c)"
                >
                  {{ deletingId === c.id ? '删除中' : '彻底删除' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="hasMore" class="admin-more">
      <button type="button" class="admin-btn admin-btn--ghost" :disabled="loading" @click="loadMore">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
    </div>
  </section>
</template>

<script setup>
/**
 * 后台 · 评论管理。
 *
 * 从旧的 `views/AdminCommentsView.vue` 搬过来（那时它是**整个页面**，
 * 现在只是后台外壳里的一个面板）：去掉它自己的令牌闸门与页头
 * （那些归 `AdminView.vue`），只留列表本身。
 *
 * 「彻底删除」是真删除，不可恢复 —— 所以按钮做成红色描边而不是实心红，
 * 与「隐藏」（可恢复）在视觉上区分开。想下架请用隐藏。
 */

import { onBeforeUnmount, onMounted, ref } from 'vue'

import EmoticonText from '../EmoticonText.vue'
import {
  AdminApiError,
  deleteCommentPermanently,
  fetchAdminComments,
  setCommentStatus
} from '../../utils/adminApi.js'

/** 默认看待审：管理端进来通常就是为了处理待审 */
const FILTERS = [
  { value: '0', label: '待审' },
  { value: '1', label: '已显示' },
  { value: '2', label: '已隐藏' },
  { value: '', label: '全部' }
]

const comments = ref([])
const loading = ref(false)
const errorMessage = ref('')
const statusFilter = ref('0')
const cursor = ref(null)
const hasMore = ref(false)
const pendingCount = ref(0)
const deletingId = ref(null)

const searchInput = ref('')
const searchQuery = ref('')
let searchTimer = 0

function onSearchInput(value) {
  searchInput.value = value
  // 输入防抖：边打边搜会把 D1 读额度烧在几个字符上
  clearTimeout(searchTimer)
  searchTimer = setTimeout(applySearch, 350)
}

function applySearch() {
  clearTimeout(searchTimer)
  const next = searchInput.value.trim()
  if (next === searchQuery.value) return
  searchQuery.value = next
  safeLoad()
}

function clearSearch() {
  searchInput.value = ''
  searchQuery.value = ''
  safeLoad()
}

function setFilter(value) {
  if (statusFilter.value === value) return
  statusFilter.value = value
  safeLoad()
}

async function load({ append = false } = {}) {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchAdminComments({
      status: statusFilter.value,
      q: searchQuery.value,
      cursor: append ? cursor.value : undefined
    })
    const page = data.comments || []
    comments.value = append ? [...comments.value, ...page] : page
    cursor.value = data.nextCursor ?? null
    hasMore.value = Boolean(data.hasMore)
    if (typeof data.pendingCount === 'number') pendingCount.value = data.pendingCount
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

/** 换筛选/搜索时可能正在请求：吞掉并发，最后一次为准 */
let seq = 0
function safeLoad(options = {}) {
  const mine = ++seq
  return load(options).then(() => {
    // 旧请求后到就别管了（它写的是过期结果）
    if (mine !== seq) return
  })
}

function loadMore() {
  if (loading.value || !hasMore.value) return
  safeLoad({ append: true })
}

async function changeStatus(comment, status) {
  errorMessage.value = ''
  try {
    await setCommentStatus(comment.id, status)
    // 改完**重拉当前筛选**：这条可能已经不满足筛选条件了（如"待审"里放行一条），
    // 就地改状态会让它留在不该在的列表里
    safeLoad()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '操作失败，请重试'
  }
}

async function hardDelete(comment) {
  if (deletingId.value) return
  const ok = window.confirm(
    `彻底删除 #${comment.id}？\n\n正文：${String(comment.body || '').slice(0, 60)}\n\n` +
      '这一步**不可恢复**。只想下架（可以再放行回来）请用「隐藏」。'
  )
  if (!ok) return
  deletingId.value = comment.id
  errorMessage.value = ''
  try {
    await deleteCommentPermanently(comment.id)
    safeLoad()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '删除失败，请重试'
  } finally {
    deletingId.value = null
  }
}

function statusLabel(status) {
  if (status === 0) return '待审'
  if (status === 1) return '已显示'
  if (status === 2) return '已隐藏'
  return String(status)
}

function formatTime(unixSec) {
  if (!unixSec) return '—'
  return new Date(unixSec * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

onMounted(() => safeLoad())
onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<style scoped>
.admin-userid {
  margin-left: 4px;
  opacity: 0.6;
}

.admin-quote {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted);
}

.admin-quote--warn {
  color: #c98a3a;
}

.admin-more {
  display: flex;
  justify-content: center;
}
</style>
