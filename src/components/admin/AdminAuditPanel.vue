<template>
  <section class="admin-panel">
    <div class="admin-toolbar">
      <p class="admin-hint admin-audit-lead">
        管理操作留痕：谁在什么时候封禁/删除了谁。按时间倒序，最新在上。
      </p>
      <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" :disabled="loading" @click="load()">
        刷新
      </button>
    </div>

    <p v-if="errorMessage" class="admin-error">{{ errorMessage }}</p>
    <p v-if="loading && !entries.length" class="admin-hint">正在加载…</p>
    <p v-else-if="!entries.length && !errorMessage" class="admin-hint">还没有管理操作记录。</p>

    <div v-else class="admin-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width: 140px">时间</th>
            <th style="width: 130px">操作者</th>
            <th style="width: 110px">动作</th>
            <th style="width: 90px">目标</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td class="admin-num">{{ formatDate(e.createdAt) }}</td>
            <td class="admin-cell-wrap">
              {{ e.actorNick }}
              <span class="admin-dim">（{{ roleLabel(e.actorRole) }}）</span>
            </td>
            <td>
              <!-- 破坏性动作用危险色标出来，扫一眼就知道哪几条要紧 -->
              <span :class="{ 'admin-audit-danger': isDestructive(e.action) }">
                {{ actionLabel(e.action) }}
              </span>
            </td>
            <td class="admin-num">{{ e.targetType === 'user' ? '用户' : '评论' }} #{{ e.targetId }}</td>
            <td class="admin-cell-wrap admin-dim">{{ e.detail || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="hasMore" class="admin-more">
        <button type="button" class="admin-btn admin-btn--ghost" :disabled="loading" @click="loadMore">
          {{ loading ? '加载中…' : '加载更多' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * 审计页（**仅超管可见**，服务端强校验）。
 *
 * 🔴 为什么要有这一页：引入"多个管理员"之后**没有账本就无法追责** ——
 * 谁能封号、谁能彻底删用户、谁能改角色，出问题时必须能查出是谁做的。
 *
 * 与「评论」页的取舍不同：审计**不做筛选**。理由：
 *   · 它天然是**只读、低频、按时间看**的场景（"最近发生了什么"）；
 *   · 记录量增长极慢（只有管理动作才写入，不是每条评论都进）；
 *   · 加筛选要先想清楚"按什么筛最有意义"，在没积累出真实使用习惯前
 *     加一排按钮反而是负担。
 * 真到需要时再加（`admin_audit` 上已有 `actor_id` 索引，按操作者筛不用改表）。
 */
import { onMounted, ref } from 'vue'

import { AdminApiError, fetchAdminAudit } from '../../utils/adminApi.js'

const entries = ref([])
const loading = ref(false)
const hasMore = ref(false)
const cursor = ref(null)
const errorMessage = ref('')

const ACTION_LABELS = {
  ban: '封禁',
  unban: '解封',
  user_delete: '彻底删除用户',
  comment_show: '放行评论',
  comment_hide: '隐藏评论',
  comment_pending: '打回待审',
  comment_delete: '彻底删除评论',
  role_set: '变更角色'
}

/** 不可恢复的动作 —— 在列表里用危险色标出 */
const DESTRUCTIVE = new Set(['user_delete', 'comment_delete', 'ban', 'comment_hide'])

const ROLE_LABELS = { 0: '普通', 1: '管理员', 2: '超管' }

const actionLabel = (a) => ACTION_LABELS[a] || a
const roleLabel = (r) => ROLE_LABELS[r] || String(r)
const isDestructive = (a) => DESTRUCTIVE.has(a)

async function load({ append = false } = {}) {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchAdminAudit({ cursor: append ? cursor.value : undefined })
    entries.value = append ? [...entries.value, ...(data.entries || [])] : (data.entries || [])
    hasMore.value = Boolean(data.hasMore)
    cursor.value = data.nextCursor ?? null
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

function loadMore() {
  if (loading.value || !hasMore.value) return
  load({ append: true })
}

/** 与其它管理页同一套时间格式（本地时区、到分钟） */
function formatDate(sec) {
  if (!sec) return '—'
  const d = new Date(sec * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

onMounted(load)
</script>

<style scoped>
.admin-audit-lead {
  margin: 0;
}

.admin-audit-danger {
  color: #b3261e;
  font-weight: 600;
}

.admin-more {
  display: flex;
  justify-content: center;
  padding: 12px 0 4px;
}
</style>
