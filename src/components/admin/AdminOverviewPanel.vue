<template>
  <section class="admin-panel">
    <p v-if="loading && !stats" class="admin-hint">正在加载…</p>
    <p v-else-if="errorMessage" class="admin-error">{{ errorMessage }}</p>

    <template v-else-if="stats">
      <!-- 四个关键数字：管理端最常看的就这几个 -->
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-label">今日评论</span>
          <span class="stat-value">{{ stats.comments.today }}</span>
          <span class="stat-sub">累计 {{ stats.comments.total }} · 其中回复 {{ stats.comments.replies }}</span>
        </div>
        <div class="stat-card" :class="{ 'is-alert': stats.comments.pending > 0 }">
          <span class="stat-label">待审核</span>
          <span class="stat-value">{{ stats.comments.pending }}</span>
          <span class="stat-sub">
            <RouterLink v-if="stats.comments.pending > 0" to="/admin/comments" class="stat-link">去处理 →</RouterLink>
            <template v-else>没有待处理的</template>
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">注册用户</span>
          <span class="stat-value">{{ stats.users.active }}</span>
          <span class="stat-sub">
            今日 +{{ stats.users.today }} · 累计 {{ stats.users.total }}
            <template v-if="stats.users.banned"> · 停用 {{ stats.users.banned }}</template>
          </span>
        </div>
        <div class="stat-card">
          <span class="stat-label">在线会话</span>
          <span class="stat-value">{{ stats.sessions.active }}</span>
          <span class="stat-sub">按未过期的会话数算</span>
        </div>
      </div>

      <!-- 近 7 天：两条柱状，共用同一套刻度，方便直接比"评论多还是注册多" -->
      <div class="chart-card">
        <div class="chart-head">
          <h2 class="chart-title">近 7 天</h2>
          <div class="chart-legend">
            <span class="legend-item"><i class="legend-dot legend-dot--cmt"></i>评论</span>
            <span class="legend-item"><i class="legend-dot legend-dot--usr"></i>注册</span>
          </div>
        </div>

        <div class="chart">
          <div v-for="d in days" :key="d.date" class="chart-col">
            <div class="chart-bars">
              <span
                class="chart-bar chart-bar--cmt"
                :style="{ height: barHeight(d.comments) }"
                :title="`${d.date} 评论 ${d.comments}`"
              ></span>
              <span
                class="chart-bar chart-bar--usr"
                :style="{ height: barHeight(d.users) }"
                :title="`${d.date} 注册 ${d.users}`"
              ></span>
            </div>
            <span class="chart-num">{{ d.comments }}/{{ d.users }}</span>
            <span class="chart-date">{{ d.short }}</span>
          </div>
        </div>
        <p class="admin-hint">
          每根柱子下方是「评论数/注册数」。日期按 **UTC** 划界，与限流的口径一致。
        </p>
      </div>

      <p class="admin-hint">
        数据取到 {{ formatTime(stats.ts) }}。
        <button type="button" class="stat-link stat-link--btn" :disabled="loading" @click="load">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </p>
    </template>
  </section>
</template>

<script setup>
/**
 * 后台概览。
 *
 * ## 为什么把两条曲线画在一起
 *
 * "今天有多少评论"和"今天有多少注册"单独看都没什么信息量；
 * **放在同一根刻度上**才能看出"注册涨了但评论没涨"这类情况 ——
 * 那通常意味着有人注册完就没再回来。
 *
 * ## 日期口径
 *
 * 服务端按 **UTC 日**划界（与限流 `dayBucket()` 同一口径）。
 * 刻意不在前端按本地时区重算 —— 那样"今天的数"与"今天的限额"会对不上，
 * 排查限流问题时最容易怀疑人生。
 */

import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { AdminApiError, fetchAdminStats } from '../../utils/adminApi.js'

const stats = ref(null)
const loading = ref(false)
const errorMessage = ref('')

/**
 * 两条序列按日期对齐成一行一天。
 *
 * ⚠️ 服务端 `dailySeries()` 给的是 `{ day: 'YYYY-MM-DD', n: 数量 }`
 * （**不是** `{date, count}`），而且**缺失的日子已经补 0**、顺序固定 7 天。
 * 所以这里只做"把两条并到一起"，不需要再补空 —— 想当然地按 `date`/`count`
 * 读会得到一屏 `undefined`。
 */
const days = computed(() => {
  const s = stats.value
  if (!s) return []
  const usr = new Map((s.users.last7d || []).map((d) => [d.day, d.n]))
  return (s.comments.last7d || []).map((d) => ({
    date: d.day,
    short: d.day.slice(5), // MM-DD
    comments: d.n || 0,
    users: usr.get(d.day) || 0
  }))
})

/** 所有柱子共用同一个最大值，否则两根柱子高度没法比 */
const peak = computed(() => Math.max(1, ...days.value.flatMap((d) => [d.comments, d.users])))

function barHeight(n) {
  // 最小 2px：0 也要留一条线，否则那一天看起来像"没画"
  return Math.max(2, Math.round((n / peak.value) * 100)) + '%'
}

function formatTime(unixSec) {
  if (!unixSec) return '—'
  return new Date(unixSec * 1000).toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    stats.value = await fetchAdminStats()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 8px;
  background: var(--paper-solid, #d9c6a6);
}

/* 有待审核时把那张卡描红：这是唯一一个"需要你现在去做点什么"的数字 */
.stat-card.is-alert {
  border-color: #b23b3b;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
}

.stat-sub {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.stat-link {
  color: var(--accent-ink);
  text-decoration: none;
}

.stat-link--btn {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

/* ---------- 图表 ---------- */

.chart-card {
  padding: 12px 14px 10px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 8px;
  background: var(--paper-solid, #d9c6a6);
}

.chart-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.chart-title {
  margin: 0;
  font-size: 14px;
}

.chart-legend {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 2px;
}

.legend-dot--cmt {
  background: #6f8fa8;
}

.legend-dot--usr {
  background: #c8a06a;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.chart-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

/* 固定高度 + `align-items: flex-end`：柱子的 height 百分比才有参照 */
.chart-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  height: 96px;
  width: 100%;
}

.chart-bar {
  width: 12px;
  border-radius: 3px 3px 0 0;
}

.chart-bar--cmt {
  background: #6f8fa8;
}

.chart-bar--usr {
  background: #c8a06a;
}

.chart-num {
  font-size: 11px;
  color: var(--text-main);
  font-family: ui-monospace, monospace;
}

.chart-date {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
