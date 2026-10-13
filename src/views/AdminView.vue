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
      <div class="brand-group">
        <button
          v-if="authed"
          type="button"
          class="admin-menu-toggle-btn"
          :class="{ 'is-active': mobileNavOpen }"
          title="切换管理目录"
          aria-label="切换管理目录"
          @click="mobileNavOpen = !mobileNavOpen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <svg class="brand-symbol" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/>
        </svg>
        <span class="brand-title">Tragoudi tou Abel · Wiki · Admin</span>
        <span class="brand-badge">深渊大书院</span>
      </div>

      <div class="admin-head-right">
        <div v-if="authed" class="admin-profile" title="当前管理员会话">
          <img v-if="adminAvatarUrl" :src="adminAvatarUrl" class="admin-avatar-mini" alt="" />
          <div v-else class="admin-avatar-mini admin-avatar-mini--fallback">{{ (adminNick || '管')[0] }}</div>
          <span class="admin-name">{{ adminNick }}</span>
          <span class="admin-role-pill">{{ adminRoleText }}</span>
        </div>

        <a class="admin-head-link" href="#/" title="回到前台 Wiki">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span>前台</span>
        </a>
        <button v-if="authed" type="button" class="admin-exit-btn" @click="onLogout">退出</button>
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
      <div class="admin-gate-card leather-panel-container">
        <div class="panel-header-title">✦ 权限验证 ✦</div>
        <div class="admin-gate-body">
          <div class="admin-gate-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h1 class="admin-gate-title">{{ gateTitle }}</h1>
          <p class="admin-gate-hint">{{ gateHint }}</p>
          <div class="admin-gate-row">
            <button v-if="!loggedIn" type="button" class="admin-btn admin-btn--gold" @click="onGoLogin">去登录</button>
            <button v-else type="button" class="admin-btn admin-btn--gold" :disabled="checking" @click="recheck">
              {{ checking ? '检查中…' : '重新检查' }}
            </button>
            <a class="admin-btn admin-btn--ghost" href="#/">返回前台</a>
          </div>
          <div v-if="gateError" class="admin-gate-error-banner">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{{ gateError }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 已登录：三栏大工作台 -->
    <div v-else class="admin-main-stage">
      <!-- 移动端侧栏遮罩 -->
      <div
        v-if="mobileNavOpen"
        class="admin-nav-backdrop"
        @click="mobileNavOpen = false"
      ></div>

      <!-- 左栏：管理目录（边框 4：手造皮质缝线与内衬层） -->
      <aside class="admin-side-nav leather-panel-container" :class="{ 'is-mobile-open': mobileNavOpen }">
        <div class="mobile-nav-top-wrap">
          <div class="panel-header-title">
            <span>✦ 管理目录 ✦</span>
            <button type="button" class="mobile-nav-close-btn" @click="mobileNavOpen = false" aria-label="关闭目录">✕</button>
          </div>
          <nav class="nav-list" @click="mobileNavOpen = false">
            <RouterLink to="/admin" class="nav-item" exact-active-class="active">
              <svg class="nav-icon" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
              <span>控制台概览</span>
            </RouterLink>
            <RouterLink to="/admin/users" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 24 24"><path d="M16 5c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm-8 0c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 8c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
              <span>用户管理</span>
            </RouterLink>
            <RouterLink to="/admin/comments" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>
              <span>评论审核</span>
            </RouterLink>
            <!-- 审计只给超管看：记录里含其他管理员的操作痕迹，追责是超管的职责 -->
            <RouterLink v-if="isSuper" to="/admin/audit" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
              <span>审计日志</span>
              <span class="nav-tag-super">超管</span>
            </RouterLink>
            <!-- 设置只给超管：里面是"审核口径"一类影响所有管理员的配置 -->
            <RouterLink v-if="isSuper" to="/admin/settings" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
              <span>系统设置</span>
              <span class="nav-tag-super">超管</span>
            </RouterLink>
          </nav>
        </div>

        <div class="side-footer-actions">
          <a class="side-footer-link" href="#/" title="跳转前台首页">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>前往首页</span>
          </a>
          <a class="side-footer-link" href="#/discussions" title="前往讨论区">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>前往讨论区</span>
          </a>
        </div>
      </aside>

      <!-- 中间内容区 -->
      <main class="admin-body">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup>
/**
 * 后台外壳：权限闸门 + 顶部栏 + 左侧手造皮质缝线管理目录 + 内容区。
 */
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'

import { AdminApiError, fetchAdminStats } from '../utils/adminApi.js'
import { openAccountModal } from '../utils/accountModal.js'
import { currentUser, isLoggedIn } from '../utils/authSession.js'
import { avatarPath } from '../utils/avatarCatalog.js'
import { getImageUrl } from '../utils/env.js'

const router = useRouter()

const authed = ref(false)
const checking = ref(false)
const gateError = ref('')
const gateTitle = ref('需要管理员权限')
const gateHint = ref('')

const mobileNavOpen = ref(false)
watch(() => router.currentRoute.value.path, () => {
  mobileNavOpen.value = false
})

const loggedIn = computed(() => isLoggedIn.value)
/** 仅用于页签显隐的乐观判断；真正的准入由服务端请求决定 */
const isSuper = computed(() => Number(currentUser.value?.role) >= 2)

const adminNick = computed(() => currentUser.value?.nick || '管理员')
const adminRoleText = computed(() => isSuper.value ? '超级管理员' : '管理员')
const adminAvatarUrl = computed(() => {
  const p = avatarPath(currentUser.value?.avatar || '')
  return p ? getImageUrl(p) : ''
})

/**
 * 用**一次真实请求**确认权限。
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
  authed.value = false
  router.replace('/')
}
</script>

<style scoped>
.admin-shell {
  position: fixed;
  inset: 0;
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
  justify-content: space-between;
  padding: 0 20px;
  height: 54px;
  background: linear-gradient(180deg, #2c1d11, #1a1109);
  border-bottom: 2px solid #85653e;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  color: #f7e6c4;
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-symbol {
  width: 22px;
  height: 22px;
  color: #ffd78c;
  filter: drop-shadow(0 0 6px rgba(255, 215, 140, 0.6));
}

.brand-title {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: #f7e6c4;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  font-family: var(--font-ui, "Cinzel", "Times New Roman", "Microsoft YaHei", serif);
}

.brand-badge {
  font-size: 11px;
  letter-spacing: 1px;
  padding: 2px 7px;
  border-radius: 4px;
  background: linear-gradient(135deg, #7a5c3d, #4d331a);
  color: #ffd78c;
  border: 1px solid rgba(255, 215, 140, 0.4);
  font-weight: 700;
}

.admin-head-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.admin-profile {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 4px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(212, 163, 89, 0.35);
}

.admin-avatar-mini {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid #ffd78c;
  object-fit: cover;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
}

.admin-avatar-mini--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #7a5c3d;
  color: #ffd78c;
  font-size: 12px;
  font-weight: bold;
}

.admin-name {
  font-size: 13px;
  font-weight: 700;
  color: #f7e6c4;
}

.admin-role-pill {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #7a5c3d;
  color: #ffd78c;
  font-weight: 600;
}

.admin-head-link {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #dfceb3;
  font-size: 13px;
  text-decoration: none;
  padding: 5px 10px;
  border-radius: 5px;
  transition: all 0.18s;
}
.admin-head-link:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.admin-exit-btn {
  padding: 5px 12px;
  border: 1px solid #8f7351;
  border-radius: 5px;
  background: linear-gradient(180deg, #463424, #2b1f15);
  color: #f7e6c4;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.admin-exit-btn:hover {
  background: linear-gradient(180deg, #5c4327, #3b2818);
  border-color: #ffd78c;
  color: #fff;
}

/* ---------- 主工作台架构 ---------- */

.admin-main-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
  max-width: 1720px;
  width: 100%;
  margin: 0 auto;
}

/* 左侧边栏：手造皮质缝线与内衬层 */
.admin-side-nav {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.leather-panel-container {
  border: 2px solid var(--wood-border, #7a5c3d);
  box-shadow: inset 0 0 0 4px rgba(223, 206, 179, 0.9),
              inset 0 0 0 5.5px rgba(143, 115, 81, 0.55),
              2px 4px 12px rgba(0, 0, 0, 0.22);
  border-radius: 6px;
  background: var(--paper, #e0cfb4);
  padding: 8px;
  box-sizing: border-box;
}

:deep(.dark-mode) .leather-panel-container,
.dark-mode .leather-panel-container {
  border-color: #5c4327;
  box-shadow: inset 0 0 0 4px rgba(46, 34, 23, 0.95),
              inset 0 0 0 5.5px rgba(110, 85, 55, 0.55),
              2px 4px 12px rgba(0, 0, 0, 0.4);
  background: #2b1f15;
}

.panel-header-title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  padding: 6px 6px 10px;
  margin-bottom: 8px;
  letter-spacing: 2px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1.5px solid var(--gold-border, rgba(143, 115, 81, 0.45));
}
.panel-header-title::after {
  content: '◆';
  font-size: 10px;
  color: #a88452;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* PA 风格菜单项（深棕烫金压纹徽章） */
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  border: 1px solid transparent;
  color: var(--text-main, #4a341d);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.18s ease;
  background-image: linear-gradient(to right, transparent, rgba(143, 115, 81, 0.18) 20%, rgba(143, 115, 81, 0.18) 80%, transparent);
  background-position: bottom;
  background-size: 100% 1px;
  background-repeat: no-repeat;
}
.nav-item:hover {
  background-color: rgba(245, 237, 222, 0.6);
  transform: translateX(3px);
  color: #2b1f15;
}
:deep(.dark-mode) .nav-item:hover,
.dark-mode .nav-item:hover {
  background-color: rgba(60, 45, 30, 0.6);
  color: #f7e6c4;
}

.nav-item.active {
  background: linear-gradient(135deg, #3e2613, #2b1a0d);
  color: #f7e6c4;
  font-weight: 700;
  box-shadow: 0 3px 8px rgba(43, 31, 21, 0.35), inset 0 1px 1px rgba(255, 215, 140, 0.3);
  border-color: rgba(212, 163, 89, 0.7);
  transform: translateX(3px);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, #ffd78c, #c5913e);
  box-shadow: 0 0 6px rgba(255, 215, 140, 0.7);
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.85;
  fill: currentColor;
}
.nav-item.active .nav-icon {
  opacity: 1;
  filter: drop-shadow(0 0 4px rgba(255, 215, 140, 0.5));
}

.nav-tag-super {
  margin-left: auto;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(197, 145, 62, 0.25);
  color: #a88452;
  border: 1px solid rgba(197, 145, 62, 0.4);
}

.side-footer-actions {
  border-top: 1.5px solid var(--gold-border, rgba(143, 115, 81, 0.45));
  padding-top: 10px;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.side-footer-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 5px;
  color: var(--text-muted);
  font-size: 13px;
  text-decoration: none;
  transition: all 0.18s;
  cursor: pointer;
}
.side-footer-link:hover {
  background: rgba(143, 115, 81, 0.18);
  color: var(--text-main);
}
.side-footer-link svg {
  flex-shrink: 0;
  transition: transform 0.18s ease;
}
.side-footer-link:hover svg {
  transform: translateX(-2px);
}

.admin-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.admin-body > * {
  flex: 1;
  height: 100%;
  min-height: 0;
}

/* ---------- 权限闸门 ---------- */

.admin-gate {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  box-sizing: border-box;
}

.admin-gate-card {
  width: min(460px, 100%);
  background: var(--paper-card, #f9f5eb);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  animation: fadeIn 0.2s ease-out;
}

.admin-gate-body {
  padding: 16px 20px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.admin-gate-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(143, 115, 81, 0.12);
  border: 1px solid rgba(143, 115, 81, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c5913e;
  margin-bottom: 4px;
}

.admin-gate-title {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
}

.admin-gate-hint {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text-muted, #755c3f);
}

.admin-gate-row {
  display: flex;
  gap: 10px;
  width: 100%;
  justify-content: center;
  margin-top: 4px;
}

.admin-gate-error-banner {
  margin-top: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fae8e8;
  border: 1px solid #e8a7a7;
  color: #b83232;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

:deep(.dark-mode) .admin-gate-card,
.dark-mode .admin-gate-card {
  background: #271d13;
}

:deep(.dark-mode) .admin-gate-error-banner,
.dark-mode .admin-gate-error-banner {
  background: rgba(184, 50, 50, 0.22);
  border-color: rgba(240, 127, 127, 0.4);
  color: #f07f7f;
}

/* ---------- 移动端专属控制 ---------- */
.admin-menu-toggle-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 5px;
  border: 1px solid rgba(255, 215, 140, 0.35);
  background: rgba(255, 255, 255, 0.08);
  color: #ffd78c;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.2s ease;
}
.admin-menu-toggle-btn:hover {
  background: rgba(255, 215, 140, 0.2);
  border-color: #ffd78c;
}
.admin-menu-toggle-btn.is-active {
  background: #c5913e;
  color: #2b1f15;
}

.mobile-nav-top-wrap {
  display: flex;
  flex-direction: column;
}

.mobile-nav-close-btn {
  display: none;
  background: transparent;
  border: none;
  color: #8f7351;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.mobile-nav-close-btn:hover {
  color: var(--text-main);
  background: rgba(143, 115, 81, 0.15);
}

.admin-nav-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 12050;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 900px) {
  .admin-menu-toggle-btn {
    display: inline-flex;
  }
  .mobile-nav-close-btn {
    display: inline-flex;
  }
  .admin-head {
    height: 48px;
    padding: 0 10px;
    gap: 8px;
  }
  .brand-group {
    gap: 6px;
  }
  .brand-title {
    display: none;
  }
  .brand-symbol {
    width: 20px;
    height: 20px;
  }
  .brand-badge {
    font-size: 10px;
    padding: 1px 5px;
  }
  .admin-head-right {
    gap: 6px;
  }
  .admin-profile {
    padding: 2px 6px 2px 2px;
    gap: 4px;
  }
  .admin-role-pill {
    display: none;
  }
  .admin-avatar-mini {
    width: 24px;
    height: 24px;
  }
  .admin-name {
    font-size: 12px;
    max-width: 68px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .admin-head-link {
    font-size: 12px;
    padding: 3px 6px;
  }
  .admin-exit-btn {
    font-size: 12px;
    padding: 3px 8px;
  }

  .admin-main-stage {
    padding: 6px;
    gap: 0;
  }

  .admin-side-nav {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 250px;
    max-width: 80vw;
    z-index: 12100;
    transform: translateX(-105%);
    transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
    background: var(--paper, #e0cfb4);
    border-radius: 0 8px 8px 0;
  }
  .admin-side-nav.is-mobile-open {
    transform: translateX(0);
  }

  .admin-body {
    width: 100%;
    min-width: 0;
    height: 100%;
  }
}

@media (max-width: 480px) {
  .admin-name {
    display: none;
  }
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
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1.5px solid rgba(143, 115, 81, 0.45);
  border-radius: 6px;
  background: #fdfbf7;
  color: var(--text-main, #3e2a14);
  font: inherit;
  font-size: 13.5px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.18s ease;
}

.admin-input:focus {
  outline: none;
  border-color: #c5913e;
  background: #ffffff;
  box-shadow: 0 0 0 2.5px rgba(197, 145, 62, 0.22), inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

.admin-input::placeholder {
  color: var(--text-muted, #755c3f);
  opacity: 0.65;
}

.dark-mode .admin-input {
  background: #251b12;
  border-color: rgba(143, 115, 81, 0.45);
  color: #e8dbc3;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.35);
}

.dark-mode .admin-input:focus {
  background: #1c140d;
  border-color: #ffd78c;
  box-shadow: 0 0 0 2.5px rgba(255, 215, 140, 0.2);
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

.admin-btn--gold {
  background: linear-gradient(135deg, #463424, #2b1f15);
  border: 1px solid #c5913e;
  color: #f7e6c4;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: all 0.15s;
}
.admin-btn--gold:hover:not(:disabled) {
  background: linear-gradient(135deg, #5c4327, #3b2818);
  border-color: #ffd78c;
  color: #fff;
}

.admin-error {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #b83232;
}

.dark-mode .admin-error {
  color: #f07f7f;
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

.admin-toolbar .admin-btn {
  height: 34px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #4d331a, #2f1d0d);
  border: 1px solid #c5913e;
  color: #f7e6c4;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.18);
  transition: all 0.15s;
}

.admin-toolbar .admin-btn:hover {
  background: linear-gradient(180deg, #5c3e21, #3b2513);
  border-color: #ffd78c;
  color: #fff;
}

.admin-toolbar .admin-btn--ghost {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(143, 115, 81, 0.45);
  color: var(--text-main);
  box-shadow: none;
}
.admin-toolbar .admin-btn--ghost:hover {
  background: #fff;
  border-color: #a88452;
  color: var(--text-main);
}

.admin-filters {
  display: flex;
  gap: 4px;
}

.admin-chip {
  padding: 5px 12px;
  border: 1px solid rgba(143, 115, 81, 0.38);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  color: var(--text-muted, #755c3f);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.16s ease;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.admin-chip:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: #c5913e;
  color: var(--text-main, #3e2a14);
}

.admin-chip.is-on {
  background: linear-gradient(135deg, #443222, #2c1f14);
  border-color: #c5913e;
  color: #ffd78c;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.admin-chip.is-on:hover {
  background: linear-gradient(135deg, #543c26, #362518);
  border-color: #ffd78c;
  color: #fff2d1;
}

.dark-mode .admin-chip {
  background: rgba(0, 0, 0, 0.28);
  border-color: rgba(143, 115, 81, 0.35);
  color: var(--text-muted, #ab9274);
}

.dark-mode .admin-chip:hover {
  background: rgba(0, 0, 0, 0.45);
  border-color: #d4a359;
  color: var(--text-main, #e8dbc3);
}

.dark-mode .admin-chip.is-on {
  background: linear-gradient(135deg, #5c4228, #3b2816);
  border-color: #ffd78c;
  color: #ffd78c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
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
  min-width: 200px;
  height: 34px;
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

/* ---------- 羊皮纸主工坊面板 ---------- */

.admin-workshop {
  border: 2px solid var(--wood-border, #7a5c3d);
  border-radius: 8px;
  background: var(--paper-soft, #f4ecdc);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.dark-mode .admin-workshop {
  background: var(--paper, #2b1f15);
  border-color: #5c4327;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.admin-workshop-header {
  border-bottom: 1.5px solid var(--gold-border, rgba(143, 115, 81, 0.45));
  padding-bottom: 12px;
}

.admin-workshop-title {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.admin-workshop-star {
  color: #c5913e;
  font-size: 18px;
}

.admin-workshop-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  margin: 4px 0 0;
  letter-spacing: 0.5px;
}

/* ---------- 指标统计卡片 ---------- */

.stat-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card-item {
  border: 1.5px solid rgba(143, 115, 81, 0.35);
  border-radius: 8px;
  background: var(--paper-card, #f9f5eb);
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.6), 0 2px 6px rgba(0,0,0,0.06);
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.stat-card-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(60, 40, 20, 0.12);
}
.stat-card-item::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, transparent, #c5913e 40%, transparent);
  opacity: 0.6;
}

.dark-mode .stat-card-item {
  background: #271d13;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.05), 0 2px 6px rgba(0,0,0,0.3);
}

.stat-icon-badge {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid rgba(143, 115, 81, 0.25);
}
.stat-icon-badge--total { color: #5a422a; background: rgba(122, 92, 61, 0.15); }
.stat-icon-badge--ok { color: #287a4c; background: rgba(40, 122, 76, 0.15); border-color: rgba(40, 122, 76, 0.3); }
.stat-icon-badge--today { color: #b37318; background: rgba(179, 115, 24, 0.15); border-color: rgba(179, 115, 24, 0.3); }
.stat-icon-badge--ban { color: #b83232; background: rgba(184, 50, 50, 0.15); border-color: rgba(184, 50, 50, 0.3); }

.dark-mode .stat-icon-badge--total { color: #d4a359; background: rgba(212, 163, 89, 0.15); }
.dark-mode .stat-icon-badge--ok { color: #6ad197; }
.dark-mode .stat-icon-badge--today { color: #f0b760; }
.dark-mode .stat-icon-badge--ban { color: #f07f7f; }

.stat-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-item-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
}
.stat-item-val {
  font-size: 22px;
  font-weight: 800;
  font-family: ui-monospace, "Cascadia Code", "Roboto Mono", monospace;
  color: var(--text-main);
  letter-spacing: 0.5px;
}

/* 状态微胶囊 */
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  border: 1px solid;
}
.status-badge--ok {
  background: var(--status-ok-bg, #e5f4eb);
  color: var(--status-ok-text, #287a4c);
  border-color: var(--status-ok-border, #a3d9b8);
}
.status-badge--ban {
  background: var(--status-ban-bg, #fae8e8);
  color: var(--status-ban-text, #b83232);
  border-color: var(--status-ban-border, #e8a7a7);
}
.status-badge--del {
  background: var(--status-del-bg, #eae6df);
  color: var(--status-del-text, #8c765c);
  border-color: var(--status-del-border, #c4b6a5);
}

.dark-mode .status-badge--ok {
  background: rgba(40, 122, 76, 0.22);
  color: #6ad197;
  border-color: rgba(106, 209, 151, 0.4);
}
.dark-mode .status-badge--ban {
  background: rgba(184, 50, 50, 0.22);
  color: #f07f7f;
  border-color: rgba(240, 127, 127, 0.4);
}
.dark-mode .status-badge--del {
  background: rgba(140, 118, 92, 0.22);
  color: #b09a82;
  border-color: rgba(176, 154, 130, 0.4);
}

/* ---------- 联动详情右栏 ---------- */

.admin-detail-side {
  width: 290px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8px 4px 14px;
  border-bottom: 1px dashed rgba(143, 115, 81, 0.35);
}

.profile-avatar-big {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  border: 3px solid #ffd78c;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35), 0 0 0 1px #a88452;
  object-fit: cover;
  margin-bottom: 10px;
}

.profile-avatar-big--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #7a5c3d;
  color: #ffd78c;
  font-size: 28px;
  font-weight: bold;
}

.profile-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.profile-name {
  font-size: 16.5px;
  font-weight: 800;
  color: var(--text-main);
}

.profile-quick-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  width: 100%;
}
.quick-act-btn {
  flex: 1;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  border: 1px solid rgba(143, 115, 81, 0.5);
  background: rgba(245, 237, 222, 0.7);
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.15s;
}
.quick-act-btn:hover {
  background: var(--wood, #2b1f15);
  color: #ffd78c;
  border-color: #ffd78c;
}
.quick-act-btn--danger:hover {
  background: #7a2828;
  color: #fff;
  border-color: #e8a0a0;
}

.dark-mode .quick-act-btn {
  background: rgba(43, 31, 21, 0.7);
  color: #e8dbc3;
  border-color: rgba(143, 115, 81, 0.35);
}

/* 属性条目列表 */
.prop-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 4px;
}

.prop-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12.5px;
}

.prop-label {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.prop-val {
  font-weight: 700;
  color: var(--text-main);
}
.prop-val.mono {
  font-family: ui-monospace, "Cascadia Code", "Roboto Mono", monospace;
}

.prop-ban-note {
  background: rgba(184, 50, 50, 0.1);
  border: 1px solid rgba(184, 50, 50, 0.3);
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11.5px;
  color: #b83232;
  line-height: 1.4;
  margin-top: 4px;
}
.dark-mode .prop-ban-note {
  background: rgba(184, 50, 50, 0.2);
  color: #f07f7f;
}

/* 时间线 */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  padding-left: 18px;
  margin-top: 6px;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 6px;
  bottom: 6px;
  width: 1.5px;
  background: rgba(143, 115, 81, 0.35);
}

.timeline-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.timeline-node {
  position: absolute;
  left: -18px;
  top: 2px;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c5913e;
  font-size: 11px;
}

.timeline-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(143, 115, 81, 0.2);
  color: var(--text-muted);
  margin-right: 4px;
}
.timeline-tag--comment { background: rgba(85, 117, 116, 0.2); color: #557574; }
.timeline-tag--audit { background: rgba(197, 145, 62, 0.2); color: #a88452; }
.dark-mode .timeline-tag--comment { color: #7a9a99; }
.dark-mode .timeline-tag--audit { color: #ffd78c; }

.timeline-time {
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: var(--text-muted);
}

.timeline-desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-main);
  font-weight: 500;
}

/* ====== 后台专属定制复古滚动条（无系统三角、6px 精致金棕滑块） ====== */
:global(.admin-shell *) {
  scrollbar-color: auto;
  scrollbar-width: auto;
}

:global(.admin-shell ::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}
:global(.admin-shell ::-webkit-scrollbar-button) {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
:global(.admin-shell ::-webkit-scrollbar-track) {
  background: rgba(143, 115, 81, 0.08);
  border-radius: 4px;
}
:global(.admin-shell ::-webkit-scrollbar-thumb) {
  background: rgba(143, 115, 81, 0.38);
  border-radius: 4px;
  transition: background 0.15s;
}
:global(.admin-shell ::-webkit-scrollbar-thumb:hover) {
  background: #a88452;
}

:global(.dark-mode .admin-shell ::-webkit-scrollbar-track) {
  background: rgba(30, 22, 14, 0.4);
}
:global(.dark-mode .admin-shell ::-webkit-scrollbar-thumb) {
  background: rgba(220, 180, 120, 0.3);
}
:global(.dark-mode .admin-shell ::-webkit-scrollbar-thumb:hover) {
  background: #e5b060;
}

@media (max-width: 900px) {
  .admin-workshop {
    padding: 10px 10px 8px !important;
    gap: 8px !important;
  }
  .workshop-header {
    padding-bottom: 8px !important;
  }
  .workshop-title {
    font-size: 17px !important;
  }
  .workshop-subtitle {
    display: none !important;
  }
  .table-container {
    -webkit-overflow-scrolling: touch;
    overflow-x: auto;
  }
  .admin-table {
    font-size: 12px;
  }
  .admin-table th,
  .admin-table td {
    padding: 6px 8px;
  }
}
</style>
