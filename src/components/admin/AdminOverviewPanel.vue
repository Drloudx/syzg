<template>
  <section class="admin-workshop">
    <!-- 头部 -->
    <div class="workshop-header">
      <h1 class="workshop-title">
        <span class="workshop-title-star">✦</span>
        <span>控制台概览</span>
      </h1>
      <p class="workshop-subtitle">
        ✦ 全站核心运行指标、待审核告警与 7 日活跃趋势
      </p>
    </div>

    <p v-if="loading && !stats" class="empty-hint-box">正在加载运行指标…</p>
    <p v-else-if="errorMessage" class="admin-error-banner">{{ errorMessage }}</p>

    <template v-else-if="stats">
      <!-- 四个关键指标卡片：升级为与用户管理一致的工坊金边卡片，且全卡支持直达跳转 -->
      <div class="stat-cards-grid">
        <!-- 今日评论（点击直达全部评论列表） -->
        <RouterLink to="/admin/comments?status=all" class="stat-card stat-card--clickable stat-card--comments" title="前往评论列表（查看全部）">
          <div class="stat-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">今日评论</span>
            <span class="stat-value">{{ Number(stats.comments.today).toLocaleString() }}</span>
            <span class="stat-sub">累计 {{ stats.comments.total }} · 回复 {{ stats.comments.replies }}</span>
          </div>
          <span class="stat-card-arrow">↗</span>
        </RouterLink>

        <!-- 待审核（点击直达待审列表） -->
        <RouterLink
          to="/admin/comments?status=0"
          class="stat-card stat-card--clickable stat-card--pending"
          :class="{ 'stat-card--alert': stats.comments.pending > 0 }"
          title="前往待审核评论列表"
        >
          <div class="stat-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">待审核</span>
            <span class="stat-value" :class="{ 'stat-value--alert': stats.comments.pending > 0 }">{{ stats.comments.pending }}</span>
            <span class="stat-sub">
              <template v-if="stats.comments.pending > 0">
                <span class="stat-link-text stat-link-text--alert">前往审核处理 →</span>
              </template>
              <template v-else>暂无待处理评论</template>
            </span>
          </div>
          <span class="stat-card-arrow">↗</span>
        </RouterLink>

        <!-- 注册用户（点击直达用户列表） -->
        <RouterLink to="/admin/users" class="stat-card stat-card--clickable stat-card--users" title="前往用户管理列表">
          <div class="stat-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 5c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm-8 0c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 8c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">注册用户</span>
            <span class="stat-value">{{ Number(stats.users.active).toLocaleString() }}</span>
            <span class="stat-sub">
              今日 +{{ stats.users.today }} · 累计 {{ stats.users.total }}
              <template v-if="stats.users.banned"> · 停用 {{ stats.users.banned }}</template>
            </span>
          </div>
          <span class="stat-card-arrow">↗</span>
        </RouterLink>

        <!-- 活跃会话 -->
        <div class="stat-card stat-card--session">
          <div class="stat-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">活跃会话</span>
            <span class="stat-value">{{ stats.sessions.active }}</span>
            <span class="stat-sub">有效管理员与前台会话</span>
          </div>
        </div>
      </div>

      <!-- 今日 vs 昨日环比对比：双环饼图面板 -->
      <div class="table-container chart-card-box donut-cards-grid">
        <!-- 评论对比环 -->
        <div class="donut-card">
          <div class="donut-card-head">
            <span class="donut-star">✦</span>
            <h3 class="donut-title">评论对比（今日 / 昨日）</h3>
          </div>
          <div class="donut-card-body">
            <div class="donut-svg-wrap">
              <svg class="donut-svg" viewBox="0 0 120 120">
                <circle class="donut-bg-track" cx="60" cy="60" r="44" />
                <!-- 昨日弧 -->
                <circle
                  class="donut-segment donut-segment--yesterday-cmt"
                  cx="60"
                  cy="60"
                  r="44"
                  :stroke-dasharray="cmtPie.yDash"
                  :stroke-dashoffset="cmtPie.yOffset"
                />
                <!-- 今日弧 -->
                <circle
                  class="donut-segment donut-segment--today-cmt"
                  cx="60"
                  cy="60"
                  r="44"
                  :stroke-dasharray="cmtPie.tDash"
                  :stroke-dashoffset="cmtPie.tOffset"
                />
              </svg>
              <div class="donut-center-info">
                <span class="donut-center-val">{{ stats.comments.today }}</span>
                <span class="donut-center-sub">今日新增</span>
              </div>
            </div>
            <div class="donut-legend">
              <div class="donut-legend-row">
                <span class="donut-badge donut-badge--today-cmt"></span>
                <span class="donut-legend-lbl">今日评论</span>
                <strong class="donut-legend-val">{{ stats.comments.today }}</strong>
              </div>
              <div class="donut-legend-row">
                <span class="donut-badge donut-badge--yesterday-cmt"></span>
                <span class="donut-legend-lbl">昨日评论</span>
                <strong class="donut-legend-val">{{ stats.comments.yesterday || 0 }}</strong>
              </div>
              <div class="donut-diff-tag" :class="cmtPie.diffClass">
                {{ cmtPie.diffText }}
              </div>
            </div>
          </div>
        </div>

        <!-- 登录活跃用户对比环 -->
        <div class="donut-card">
          <div class="donut-card-head">
            <span class="donut-star">✦</span>
            <h3 class="donut-title">活跃用户对比（今日 / 昨日）</h3>
          </div>
          <div class="donut-card-body">
            <div class="donut-svg-wrap">
              <svg class="donut-svg" viewBox="0 0 120 120">
                <circle class="donut-bg-track" cx="60" cy="60" r="44" />
                <!-- 昨日弧 -->
                <circle
                  class="donut-segment donut-segment--yesterday-usr"
                  cx="60"
                  cy="60"
                  r="44"
                  :stroke-dasharray="usrPie.yDash"
                  :stroke-dashoffset="usrPie.yOffset"
                />
                <!-- 今日弧 -->
                <circle
                  class="donut-segment donut-segment--today-usr"
                  cx="60"
                  cy="60"
                  r="44"
                  :stroke-dasharray="usrPie.tDash"
                  :stroke-dashoffset="usrPie.tOffset"
                />
              </svg>
              <div class="donut-center-info">
                <span class="donut-center-val">{{ stats.users.activeToday || 0 }}</span>
                <span class="donut-center-sub">今日活跃</span>
              </div>
            </div>
            <div class="donut-legend">
              <div class="donut-legend-row">
                <span class="donut-badge donut-badge--today-usr"></span>
                <span class="donut-legend-lbl">今日已登录用户</span>
                <strong class="donut-legend-val">{{ stats.users.activeToday || 0 }}</strong>
              </div>
              <div class="donut-legend-row">
                <span class="donut-badge donut-badge--yesterday-usr"></span>
                <span class="donut-legend-lbl">昨日已登录用户</span>
                <strong class="donut-legend-val">{{ stats.users.activeYesterday || 0 }}</strong>
              </div>
              <div class="donut-diff-tag" :class="usrPie.diffClass">
                {{ usrPie.diffText }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 近 7 天趋势：羊皮纸画卷卡片 -->
      <div class="table-container chart-card-box">
        <div class="chart-head">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #c5913e; font-size: 14px;">✦</span>
            <h2 class="chart-title">近 7 天互动与入驻趋势</h2>
          </div>
          <div class="chart-legend">
            <span class="legend-item"><i class="legend-dot legend-dot--cmt"></i>评论留言</span>
            <span class="legend-item"><i class="legend-dot legend-dot--usr"></i>新用户入驻</span>
          </div>
        </div>

        <div class="chart">
          <div
            v-for="d in days"
            :key="d.date"
            class="chart-col"
            tabindex="0"
          >
            <!-- 悬浮羊皮纸即时气泡 Tooltip -->
            <div class="chart-tooltip">
              <span class="tooltip-date">{{ d.date }}</span>
              <div class="tooltip-row">
                <i class="legend-dot legend-dot--cmt"></i>
                <span>评论：<strong>{{ d.comments }}</strong></span>
              </div>
              <div class="tooltip-row">
                <i class="legend-dot legend-dot--usr"></i>
                <span>注册：<strong>{{ d.users }}</strong></span>
              </div>
            </div>

            <div class="chart-bars">
              <span
                class="chart-bar chart-bar--cmt"
                :style="{ height: barHeight(d.comments) }"
              ></span>
              <span
                class="chart-bar chart-bar--usr"
                :style="{ height: barHeight(d.users) }"
              ></span>
            </div>
            <span class="chart-num">{{ d.comments }}/{{ d.users }}</span>
            <span class="chart-date">{{ d.short }}</span>
          </div>
        </div>
      </div>

      <!-- 底部状态与刷新工具 -->
      <div class="overview-footer-bar">
        <span class="search-hint-text">
          数据统计已于 <strong>{{ formatTime(stats.ts) }}</strong> 更新完成。
        </span>
        <button type="button" class="btn-refresh" :disabled="loading" @click="load">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"></path>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span>{{ loading ? '刷新中…' : '刷新数据' }}</span>
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
/**
 * 后台概览。
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { AdminApiError, fetchAdminStats } from '../../utils/adminApi.js'

const stats = ref(null)
const loading = ref(false)
const errorMessage = ref('')

const days = computed(() => {
  const s = stats.value
  if (!s) return []
  const usr = new Map((s.users.last7d || []).map((d) => [d.day, d.n]))
  return (s.comments.last7d || []).map((d) => ({
    date: d.day,
    short: d.day.slice(5),
    comments: d.n || 0,
    users: usr.get(d.day) || 0
  }))
})

const peak = computed(() => Math.max(1, ...days.value.flatMap((d) => [d.comments, d.users])))

function barHeight(n) {
  return Math.max(4, Math.round((n / peak.value) * 100)) + '%'
}

// 环形饼图计算工具：周长 C = 2 * PI * r = 2 * PI * 44 ≈ 276.46
const CIRCUMFERENCE = 2 * Math.PI * 44

function calcDonut(todayVal = 0, yesterdayVal = 0) {
  const t = Math.max(0, Number(todayVal) || 0)
  const y = Math.max(0, Number(yesterdayVal) || 0)
  const total = t + y

  // 环比百分比
  let diffText = '与昨日持平'
  let diffClass = 'donut-diff--neutral'
  if (y === 0 && t > 0) {
    diffText = `较昨日 +${t}`
    diffClass = 'donut-diff--up'
  } else if (t > y) {
    const pct = Math.round(((t - y) / y) * 100)
    diffText = `较昨日 +${pct}%`
    diffClass = 'donut-diff--up'
  } else if (t < y) {
    const pct = Math.round(((y - t) / y) * 100)
    diffText = `较昨日 -${pct}%`
    diffClass = 'donut-diff--down'
  }

  if (total === 0) {
    return {
      tDash: `0 ${CIRCUMFERENCE.toFixed(2)}`,
      tOffset: 0,
      yDash: `0 ${CIRCUMFERENCE.toFixed(2)}`,
      yOffset: 0,
      tPct: 0,
      yPct: 0,
      diffText: '暂无数据',
      diffClass: 'donut-diff--neutral'
    }
  }

  const tFrac = t / total
  const yFrac = y / total
  const tLen = Number((tFrac * CIRCUMFERENCE).toFixed(2))
  const yLen = Number((yFrac * CIRCUMFERENCE).toFixed(2))

  // 从 12 点钟开始（-90度）
  return {
    tDash: `${tLen} ${(CIRCUMFERENCE - tLen).toFixed(2)}`,
    tOffset: 0,
    yDash: `${yLen} ${(CIRCUMFERENCE - yLen).toFixed(2)}`,
    yOffset: -tLen,
    tPct: Math.round(tFrac * 100),
    yPct: Math.round(yFrac * 100),
    diffText,
    diffClass
  }
}

const cmtPie = computed(() => {
  const s = stats.value
  if (!s) return calcDonut(0, 0)
  return calcDonut(s.comments.today, s.comments.yesterday)
})

const usrPie = computed(() => {
  const s = stats.value
  if (!s) return calcDonut(0, 0)
  return calcDonut(s.users.activeToday, s.users.activeYesterday)
})

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
  overflow-y: auto;
  border: 2px solid var(--wood-border);
  border-radius: 8px;
  background: var(--paper-soft);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  padding: 16px 20px;
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
  border-bottom: 1.5px solid var(--gold-border);
  padding-bottom: 10px;
}
.workshop-title {
  font-size: 21px;
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
  font-size: 18px;
}
.workshop-subtitle {
  font-size: 12.5px;
  color: var(--text-muted);
  margin: 2px 0 0;
  letter-spacing: 0.5px;
}

/* 指标卡片 */
.stat-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  border: 1.5px solid rgba(143, 115, 81, 0.35);
  border-radius: 8px;
  background: var(--paper-card);
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.6), 0 2px 6px rgba(0,0,0,0.06);
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(60, 40, 20, 0.12);
}
.stat-card::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, transparent, #c5913e 40%, transparent);
  opacity: 0.6;
}

.stat-card--alert {
  border-color: rgba(184, 50, 50, 0.5);
  background: rgba(184, 50, 50, 0.05);
}
.stat-card--alert::after {
  background: linear-gradient(90deg, transparent, #b83232 40%, transparent);
  opacity: 0.8;
}

.stat-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(143, 115, 81, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #7a5c3d;
  border: 1px solid rgba(143, 115, 81, 0.25);
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.6), 0 2px 5px rgba(0, 0, 0, 0.08);
}

.stat-card--comments .stat-icon-wrap {
  color: #6a4929;
  background: rgba(106, 73, 41, 0.12);
  border-color: rgba(106, 73, 41, 0.28);
}
.stat-card--pending .stat-icon-wrap {
  color: #a87222;
  background: rgba(168, 114, 34, 0.12);
  border-color: rgba(168, 114, 34, 0.3);
}
.stat-card--alert .stat-icon-wrap {
  color: #a82e2e;
  background: rgba(168, 46, 46, 0.12);
  border-color: rgba(168, 46, 46, 0.35);
}
.stat-card--users .stat-icon-wrap {
  color: #7d4d1d;
  background: rgba(125, 77, 29, 0.12);
  border-color: rgba(125, 77, 29, 0.3);
}
.stat-card--session .stat-icon-wrap {
  color: #246d43;
  background: rgba(36, 109, 67, 0.12);
  border-color: rgba(36, 109, 67, 0.3);
}

.stat-card--clickable {
  text-decoration: none;
  cursor: pointer;
}
.stat-card--clickable:hover {
  transform: translateY(-2px);
  border-color: #c5913e;
  box-shadow: 0 5px 15px rgba(60, 40, 20, 0.16), 0 0 0 1px rgba(197, 145, 62, 0.25);
}

.stat-card-arrow {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  opacity: 0.35;
  transition: all 0.18s ease;
}
.stat-card--clickable:hover .stat-card-arrow {
  opacity: 1;
  color: #c5913e;
  transform: translate(2px, -2px);
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}
.stat-value {
  font-size: 24px;
  font-weight: 800;
  font-family: ui-monospace, "Cascadia Code", "Roboto Mono", monospace;
  color: var(--text-main);
  letter-spacing: 0.5px;
}
.stat-value--alert {
  color: #b83232;
}
.stat-sub {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.4;
}
.stat-link-text {
  text-decoration: underline;
  font-weight: 600;
}
.stat-link-text--alert {
  color: #b83232;
  font-weight: 700;
}

/* 图表容器 */
.chart-card-box {
  padding: 14px 18px 12px;
}

.table-container {
  border: 1.5px solid rgba(143, 115, 81, 0.4);
  border-radius: 6px;
  background: var(--paper-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  border-bottom: 1px dashed rgba(143, 115, 81, 0.3);
  padding-bottom: 8px;
}
.chart-title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.chart-legend {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.legend-dot--cmt {
  background: #6c4e32;
}
.legend-dot--usr {
  background: #c49755;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 6px 0 2px;
}
.chart-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  position: relative;
  padding: 6px 2px;
  border-radius: 6px;
  cursor: default;
  transition: background-color 0.15s ease;
}
.chart-col:hover,
.chart-col:focus-visible {
  background-color: rgba(143, 115, 81, 0.1);
  outline: none;
}

/* 悬浮羊皮纸即时气泡 Tooltip */
.chart-tooltip {
  position: absolute;
  bottom: calc(100% - 6px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  background: var(--paper-card);
  border: 1px solid var(--gold-accent);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11.5px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.chart-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px;
  border-style: solid;
  border-color: var(--gold-accent) transparent transparent transparent;
}
.chart-col:hover .chart-tooltip,
.chart-col:focus-visible .chart-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}
.tooltip-date {
  font-weight: 700;
  color: var(--text-main);
  border-bottom: 1px dashed rgba(143, 115, 81, 0.3);
  padding-bottom: 3px;
  margin-bottom: 2px;
  font-family: ui-monospace, "Cascadia Code", monospace;
}
.tooltip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}
.tooltip-row strong {
  color: var(--text-main);
  font-family: ui-monospace, "Cascadia Code", monospace;
}

.chart-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  height: 125px;
  width: 100%;
}
.chart-bar {
  width: 16px;
  border-radius: 3px 3px 0 0;
  transition: height 0.3s ease, filter 0.18s ease;
}
.chart-col:hover .chart-bar {
  filter: brightness(1.12);
}
.chart-bar--cmt {
  background: linear-gradient(180deg, #7a5c3e, #563f28);
  border-top: 1.5px solid #a8845e;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.16);
}
.chart-bar--usr {
  background: linear-gradient(180deg, #d4a768, #a47738);
  border-top: 1.5px solid #f1cf98;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.16);
}
:deep(.dark-mode) .chart-bar--cmt,
.dark-mode .chart-bar--cmt {
  background: linear-gradient(180deg, #8f6d4a, #684d32);
  border-top-color: #ba946e;
}
:deep(.dark-mode) .chart-bar--usr,
.dark-mode .chart-bar--usr {
  background: linear-gradient(180deg, #e0b476, #b08442);
  border-top-color: #f7dda9;
}

.chart-num {
  font-size: 11.5px;
  color: var(--text-main);
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-weight: 600;
}
.chart-date {
  font-size: 11px;
  color: var(--text-muted);
}

.search-hint-text {
  font-size: 12px;
  color: var(--text-muted);
}
.search-hint-text strong {
  color: var(--text-main);
}

.overview-footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1.5px solid var(--gold-border);
  padding-top: 12px;
  margin-top: auto;
}

.btn-refresh {
  height: 36px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid rgba(143, 115, 81, 0.5);
  color: var(--text-main);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.btn-refresh:hover:not(:disabled) {
  background: rgba(143, 115, 81, 0.18);
  border-color: #a88452;
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

/* ── 双环饼图面板样式 ─────────────────────────────────────── */
.donut-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.donut-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px;
}

.donut-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(143, 115, 81, 0.25);
}

.donut-star {
  color: #c5913e;
  font-size: 13px;
}

.donut-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.donut-card-body {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 4px 6px;
}

.donut-svg-wrap {
  position: relative;
  width: 104px;
  height: 104px;
  flex-shrink: 0;
}

.donut-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  overflow: visible;
}

.donut-bg-track {
  fill: none;
  stroke: rgba(143, 115, 81, 0.15);
  stroke-width: 14;
}

.donut-segment {
  fill: none;
  stroke-width: 14;
  transition: stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease;
}

/* 评论对比环配色：今日胡桃金、昨日柔和浅茶 */
.donut-segment--today-cmt {
  stroke: #c5913e;
}
.donut-segment--yesterday-cmt {
  stroke: #785a3a;
}

/* 活跃用户环配色：今日翠绿金、昨日青苔色 */
.donut-segment--today-usr {
  stroke: #2e8b57;
}
.donut-segment--yesterday-usr {
  stroke: #5d7d6a;
}

:deep(.dark-mode) .donut-segment--today-cmt,
.dark-mode .donut-segment--today-cmt {
  stroke: #dfab58;
}
:deep(.dark-mode) .donut-segment--yesterday-cmt,
.dark-mode .donut-segment--yesterday-cmt {
  stroke: #96734e;
}
:deep(.dark-mode) .donut-segment--today-usr,
.dark-mode .donut-segment--today-usr {
  stroke: #48b476;
}
:deep(.dark-mode) .donut-segment--yesterday-usr,
.dark-mode .donut-segment--yesterday-usr {
  stroke: #729680;
}

.donut-center-info {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.donut-center-val {
  font-size: 19px;
  font-weight: 800;
  font-family: ui-monospace, "Cascadia Code", monospace;
  color: var(--text-main);
  line-height: 1.1;
}

.donut-center-sub {
  font-size: 10.5px;
  color: var(--text-muted);
  margin-top: 2px;
}

.donut-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
  justify-content: center;
}

.donut-legend-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.donut-badge {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.donut-badge--today-cmt { background: #c5913e; }
.donut-badge--yesterday-cmt { background: #785a3a; }
.donut-badge--today-usr { background: #2e8b57; }
.donut-badge--yesterday-usr { background: #5d7d6a; }

.donut-legend-lbl {
  color: var(--text-muted);
}

.donut-legend-val {
  color: var(--text-main);
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-weight: 700;
  font-size: 13.5px;
  margin-left: 2px;
}

.donut-diff-tag {
  align-self: flex-start;
  margin-top: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 600;
}

.donut-diff--up {
  color: #1b7340;
  background: rgba(46, 139, 87, 0.12);
  border: 1px solid rgba(46, 139, 87, 0.25);
}

.donut-diff--down {
  color: #a83232;
  background: rgba(184, 50, 50, 0.1);
  border: 1px solid rgba(184, 50, 50, 0.2);
}

.donut-diff--neutral {
  color: var(--text-muted);
  background: rgba(143, 115, 81, 0.1);
  border: 1px solid rgba(143, 115, 81, 0.2);
}

@media (max-width: 1200px) {
  .stat-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .donut-cards-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .stat-cards-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  .stat-card {
    padding: 8px 10px;
    gap: 8px;
    border-radius: 6px;
  }
  .stat-icon-wrap {
    width: 34px;
    height: 34px;
  }
  .stat-icon-wrap svg {
    width: 18px;
    height: 18px;
  }
  .stat-label {
    font-size: 11px;
  }
  .stat-value {
    font-size: 17px;
  }
  .stat-sub {
    display: none;
  }
  .stat-card-arrow {
    display: none;
  }

  .donut-cards-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .donut-card {
    padding: 10px 12px;
  }
  .donut-card-head {
    margin-bottom: 8px;
  }
  .donut-title {
    font-size: 13.5px;
  }
  .donut-card-body {
    gap: 12px;
  }
  .donut-svg-wrap {
    width: 92px;
    height: 92px;
  }
  .donut-center-val {
    font-size: 15px;
  }
  .donut-center-sub {
    font-size: 9.5px;
  }
  .donut-legend-row {
    font-size: 11.5px;
    gap: 6px;
  }
  .donut-legend-val {
    font-size: 12px;
  }

  .chart-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    margin-bottom: 6px;
  }
  .chart-title {
    font-size: 13.5px;
  }
  .chart-legend {
    font-size: 11px;
    gap: 10px;
  }
}
</style>
