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
        <!-- 审计只给超管看：记录里含其他管理员的操作痕迹，追责是超管的职责 -->
        <RouterLink v-if="isSuper" to="/admin/audit" class="admin-tab" active-class="is-on">审计</RouterLink>
      </nav>

      <div class="admin-head-right">
        <a class="admin-link" href="#/" title="回到前台">← 前台</a>
        <button v-if="authed" type="button" class="admin-quiet-btn" @click="onLogout">退出</button>
      </div>
    </header>

    <!--
      权限闸门（2026-10-07 改）：不再有"填令牌"这一步，改为看**登录账号的角色**。
      三种情况各有明确文案，不混成一句"无权限"：
        · 没登录        → 引导去登录
        · 登录了但非管理员 → 说明权限不足（不是让他反复试）
        · 网络/服务端异常 → 提示重试
    -->
    <div v-if="!authed" class="admin-gate">
      <h1 class="admin-gate-title">{{ gateTitle }}</h1>
      <p class="admin-gate-hint">{{ gateHint }}</p>
      <div class="admin-gate-row">
        <button v-if="!loggedIn" type="button" class="admin-btn" @click="onGoLogin">去登录</button>
        <button v-else type="button" class="admin-btn admin-btn--ghost" :disabled="checking" @click="recheck">
          {{ checking ? '检查中…' : '重新检查' }}
        </button>
        <a class="admin-btn admin-btn--ghost" href="#/">返回前台</a>
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
 * 后台外壳：权限闸门 + 顶部页签 + 内容区。
 *
 * 三块内容（概览 / 评论 / 用户 / 审计）是 `/admin` 下的**子路由**，
 * 这样刷新、分享链接、浏览器前进后退都正常，而不必在外壳里维护一个 `tab` 状态。
 *
 * ## 鉴权（2026-10-07 改）
 *
 * 旧实现是"填管理令牌 → 存 localStorage → 带 `x-admin-token`"。已删除，
 * 原因见 `adminApi.js` 顶部注释（永不过期、明文存 localStorage、无法追溯身份）。
 * 现在直接看**登录账号的 `users.role`**：
 *
 *   · 用一次真实请求（`/api/admin/stats`）确认权限，而不是只看本地 role ——
 *     本地那份是**上次登录时的快照**，账号可能已经被降级或封禁；
 *   · 所以 `authed` 由"请求成功"决定，不由 `currentUser.role` 决定。
 *     后者只用来决定**显不显示"审计"页签**（少一次请求的乐观渲染）。
 */
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'

import { AdminApiError, fetchAdminStats } from '../utils/adminApi.js'
import { openAccountModal } from '../utils/accountModal.js'
import { currentUser, isLoggedIn } from '../utils/authSession.js'

const router = useRouter()

const authed = ref(false)
const checking = ref(false)
const gateError = ref('')
const gateTitle = ref('需要管理员权限')
const gateHint = ref('')

const loggedIn = computed(() => isLoggedIn.value)
/** 仅用于页签显隐的乐观判断；真正的准入由服务端请求决定 */
const isSuper = computed(() => Number(currentUser.value?.role) >= 2)

/**
 * 用**一次真实请求**确认权限。
 *
 * 为什么不能只看 `currentUser.role`：那是登录时的快照，
 * 账号被降级/封禁后本地仍是旧值，会让人看到"三个页签、点进去全报错"。
 */
async function recheck() {
  checking.value = true
  gateError.value = ''
  try {
    await fetchAdminStats()
    authed.value = true
    if (router.currentRoute.value.path === '/admin') router.replace('/admin')
  } catch (err) {
    authed.value = false
    if (err instanceof AdminApiError && err.isUnauthorized) {
      gateTitle.value = loggedIn.value ? '这个账号不是管理员' : '需要先登录'
      gateHint.value = loggedIn.value
        ? '当前账号没有后台权限。若应由你管理，请在数据库里把该账号的 role 设为 1 或 2。'
        : '后台需要管理员账号。请先用管理员账号登录，再回到这里。'
    } else {
      gateTitle.value = '无法确认权限'
      gateHint.value = '服务端暂时没有响应，请稍后重试。'
      gateError.value = err?.message || '请求失败'
    }
  } finally {
    checking.value = false
  }
}

/** 会话变化（登录/登出）后重新确认 —— 否则登录完还得手动刷新 */
watch(isLoggedIn, () => { recheck() }, { immediate: true })

function onGoLogin() {
  openAccountModal()
}

function onLogout() {
  // 只退出后台视图，不动用户会话 —— "退出后台"与"退出登录"是两件事
  authed.value = false
  router.replace('/')
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

/* ---------- 权限闸门 ---------- */

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
  /*
   * 🔴 **必须显式居中**：这一行是固定 420px 宽的盒子，而 flex 默认
   * `justify-content: flex-start` —— 内容会贴着盒子左边。
   *
   * 旧设计里这里是「输入框 + 按钮」，输入框占满 420px 所以看不出来；
   * 删掉令牌闸门后只剩两个小按钮，就露出"标题居中、按钮偏左"的错位
   * （用户截图指出）。保留固定宽度是为了让窄屏下也不至于撑满，
   * 所以不是去掉宽度，而是把内容居中。
   */
  justify-content: center;
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

/*
 * 页面类型那一排 chip 的紧凑版（评论页用）。
 * 为什么要小一号：状态筛选只有 4 个，页面类型有 12 个 —— 同尺寸会占掉两行，
 * 把评论表格挤下去。缩一号后能在一行放下。
 */
.admin-chip--sm {
  padding: 3px 9px;
  font-size: 12px;
}

/* 页面类型那一行与上面的搜索行贴紧，避免两组筛选之间出现大空隙 */
.admin-toolbar--kinds {
  margin-top: -2px;
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
