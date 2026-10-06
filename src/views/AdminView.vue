<template>
  <!--
    ==================== 后台独立外壳 ====================

    用 `position: fixed; inset: 0` 铺满视口，**盖住站点的头部/侧栏/右栏** ——
    而不是去 `App.vue` 里加一堆 `v-if` 把它藏起来。

    为什么选这种做法：站点的布局（`.main-layout-row` 的网格、移动端的
    安全区 padding、gacha 那套 `is-gacha-stage` 的全屏规则）耦合得很紧，
    在它里面插一个"另一种布局"的页面，每加一条规则都可能碰到别的页面
    （gacha 那段 CSS 里那句 `padding: 0 !important` 就是被这类竞争逼出来的）。
    后台是**另一个应用**，用覆盖层与主站彻底隔开，谁也不用迁就谁。

    代价：主站的 DOM 仍在下面（白白渲染一次）。管理页是低频、单人用的，
    这点开销换来的是"改后台不会弄坏任何一个访客页面"。
  -->
  <div class="admin-shell">
    <header class="admin-head">
      <span class="admin-brand">深渊大书院 · 后台</span>

      <nav v-if="authed" class="admin-tabs">
        <RouterLink to="/admin" class="admin-tab" exact-active-class="is-on">概览</RouterLink>
        <RouterLink to="/admin/comments" class="admin-tab" active-class="is-on">评论</RouterLink>
        <RouterLink to="/admin/users" class="admin-tab" active-class="is-on">用户</RouterLink>
      </nav>

      <div class="admin-head-right">
        <a class="admin-link" href="#/" title="回到前台">← 前台</a>
        <button v-if="authed" type="button" class="admin-quiet-btn" @click="onLogout">退出</button>
      </div>
    </header>

    <!-- 令牌闸门：没令牌就只显示这一个表单，连页签都不给看 -->
    <div v-if="!authed" class="admin-gate">
      <h1 class="admin-gate-title">需要管理令牌</h1>
      <p class="admin-gate-hint">
        在 Cloudflare Pages 的环境变量里配置 <code>ADMIN_TOKEN</code>，
        然后把它填在下面。令牌只存在这台浏览器里，不会发给任何第三方。
      </p>
      <div class="admin-gate-row">
        <input
          v-model="tokenInput"
          class="admin-input"
          type="password"
          autocomplete="off"
          placeholder="管理令牌"
          @keydown.enter="onSubmitToken"
        />
        <button type="button" class="admin-btn" :disabled="checking" @click="onSubmitToken">
          {{ checking ? '校验中…' : '进入' }}
        </button>
      </div>
      <p v-if="gateError" class="admin-error">{{ gateError }}</p>
    </div>

    <main v-else class="admin-body">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
/**
 * 后台外壳：令牌闸门 + 顶部页签 + 内容区。
 *
 * 三块内容（概览 / 评论 / 用户）是 `/admin` 下的**子路由**，
 * 这样刷新、分享链接、浏览器前进后退都正常，而不必在外壳里维护一个 `tab` 状态。
 */

import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'

import { AdminApiError, fetchAdminStats, getAdminToken, setAdminToken } from '../utils/adminApi.js'

const router = useRouter()

const token = ref(getAdminToken())
const tokenInput = ref('')
const gateError = ref('')
const checking = ref(false)

const authed = computed(() => Boolean(token.value))

/**
 * 用**一次真实请求**校验令牌，而不是"填了就信"。
 *
 * 为什么：令牌填错时，如果直接放行，用户会看到三个页签、点进去每个都报错，
 * 得逐个试才知道是令牌的问题。这里当场打一次 `/api/admin/stats`，
 * 401/404 就停在闸门页并说清楚原因。
 */
async function onSubmitToken() {
  const value = tokenInput.value.trim()
  if (!value) {
    gateError.value = '请填写管理令牌'
    return
  }
  checking.value = true
  gateError.value = ''
  const previous = getAdminToken()
  setAdminToken(value)
  try {
    await fetchAdminStats()
    token.value = value
    tokenInput.value = ''
    // 校验通过后回到概览（可能是从 /admin/users 刷新进来的，那条子路由已经能用了）
    if (router.currentRoute.value.path === '/admin') router.replace('/admin')
  } catch (err) {
    setAdminToken(previous)
    gateError.value =
      err instanceof AdminApiError && err.isUnauthorized
        ? '令牌不对，或服务端没有配置 ADMIN_TOKEN'
        : err?.message || '校验失败，请重试'
  } finally {
    checking.value = false
  }
}

function onLogout() {
  setAdminToken('')
  token.value = ''
  tokenInput.value = ''
  gateError.value = ''
}
</script>

<style scoped>
.admin-shell {
  position: fixed;
  inset: 0;
  /*
   * z-index **必须是 11000**，不是随手一个 900：
   *   · 站点的 `.app-header` 是 10000 —— 低于它就盖不住顶栏；
   *   · 全局弹窗（`UiModal` 的 teleport 模式）是 12000 ——
   *     高于它就会把账号弹窗之类的压到我们下面（那些是站点级的，
   *     该在最上面）。
   * 11000 正好卡在两者之间。
   */
  z-index: 11000;
  display: flex;
  flex-direction: column;
  background: var(--bg, #bba282);
  color: var(--text-main);
  overflow: hidden;
}

/* ---------- 顶栏 ---------- */

.admin-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 14px;
  height: 48px;
  border-bottom: 1px solid var(--border-color, #8f7351);
  background: var(--paper-soft, #e9dcc3);
}

.admin-brand {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.admin-tabs {
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
}

.admin-tab {
  padding: 5px 12px;
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
}

.admin-tab.is-on {
  background: var(--paper-solid, #d9c6a6);
  color: var(--text-main);
  font-weight: 600;
}

.admin-head-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.admin-link {
  color: var(--accent-ink);
  font-size: 13px;
  text-decoration: none;
}

.admin-quiet-btn {
  padding: 4px 10px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 6px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

/* ---------- 令牌闸门 ---------- */

.admin-gate {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}

.admin-gate-title {
  margin: 0;
  font-size: 18px;
}

.admin-gate-hint {
  margin: 0;
  max-width: 420px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-muted);
}

.admin-gate-hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.12);
  font-size: 12px;
}

.admin-gate-row {
  display: flex;
  gap: 8px;
  width: min(420px, 100%);
}

.admin-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  /* 桌面端的滚动条槽：这里没有整页布局的顾虑，用 stable 避免表格宽度跳一下 */
  scrollbar-gutter: stable;
}
</style>

<!--
  共用控件样式**刻意不加 scoped**：三个子面板是通过 `<RouterView>` 渲染的，
  scoped 样式带 data 属性，穿不过去。让外壳统一持有后台的设计令牌
  （输入框 / 按钮 / 表格 / 分节标题），子面板只写自己的布局。

  因此这份样式**只在 `/admin` 下生效** —— 外壳没挂载时这些规则不会注入。
  类名统一带 `admin-` 前缀，避免万一与站点的通用类撞名。
-->
<style>
.admin-input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 6px;
  background: var(--paper-solid, #d9c6a6);
  color: var(--text-main);
  font: inherit;
  font-size: 14px;
}

.admin-btn {
  flex: none;
  padding: 7px 14px;
  border: none;
  border-radius: 6px;
  background: var(--accent-ink);
  color: #fff;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.admin-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.admin-btn--ghost {
  background: none;
  border: 1px solid var(--border-color, #8f7351);
  color: var(--text-main);
}

.admin-btn--danger {
  background: none;
  border: 1px solid #b23b3b;
  color: #c65a5a;
}

.admin-btn--sm {
  padding: 3px 9px;
  font-size: 12px;
}

.admin-error {
  margin: 0;
  font-size: 13px;
  color: #e8a0a0;
}

/* ---------- 分节 ---------- */

.admin-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.admin-filters {
  display: flex;
  gap: 4px;
}

.admin-chip {
  padding: 5px 11px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 999px;
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.admin-chip.is-on {
  background: var(--paper-solid, #d9c6a6);
  color: var(--text-main);
  font-weight: 600;
}

.admin-search {
  flex: 1;
  min-width: 180px;
}

.admin-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ---------- 卡片 / 表格 ---------- */

.admin-card {
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 8px;
  background: var(--paper-solid, #d9c6a6);
  overflow: hidden;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.admin-table th,
.admin-table td {
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--border-color, #8f7351);
}

.admin-table th {
  font-weight: 600;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.06);
  white-space: nowrap;
}

.admin-table tr:last-child td {
  border-bottom: none;
}

/* 昵称/正文这类可能很长的列：允许换行，但别把表格撑爆 */
.admin-cell-wrap {
  overflow-wrap: anywhere;
  min-width: 120px;
}

.admin-num {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  white-space: nowrap;
}

.admin-row-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
