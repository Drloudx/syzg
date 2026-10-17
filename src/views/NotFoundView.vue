<template>
  <div class="page-view-container not-found-page">
    <div class="not-found-card paper-panel corner-nails">
      <!-- 顶部罗盘与大书院图章 -->
      <div class="not-found-header">
        <div class="not-found-emblem">
          <img
            :src="getImageUrl('/ui/icon_academy_book.svg')"
            alt="大书院图章"
            class="not-found-emblem-icon"
            loading="lazy"
          />
        </div>
        <div class="not-found-code">404</div>
        <div class="not-found-divider" aria-hidden="true">
          <span class="divider-line"></span>
          <span class="divider-star">✦</span>
          <span class="divider-line"></span>
        </div>
      </div>

      <!-- 核心文案 -->
      <div class="not-found-body">
        <h2 class="not-found-title">迷失在深渊深处</h2>
        <p class="not-found-desc">
          大书院的学者们尚未在此处勘测出任何地图或收录记载。<br class="desktop-only" />
          你探寻的历史可能已被深渊吞噬，或是这段记录已湮灭于岁月迷雾之中。
        </p>
      </div>

      <!-- 操作按钮区 -->
      <div class="not-found-actions">
        <UiButton
          variant="primary"
          size="md"
          @click="goHome"
        >
          返回大书院首页
        </UiButton>
        <UiButton
          variant="secondary"
          size="md"
          @click="goBack"
        >
          返回上一页
        </UiButton>
      </div>

      <!-- 快捷传送门 -->
      <div class="not-found-shortcuts">
        <span class="shortcuts-label">快速传送到热门区域：</span>
        <div class="shortcuts-list">
          <button
            v-for="item in shortcutList"
            :key="item.path"
            type="button"
            class="shortcut-pill"
            @click="navigateTo(item.path)"
          >
            {{ item.name }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { UiButton } from '../components/ui/index.js'
import { getImageUrl } from '../utils/env.js'

const router = useRouter()

const shortcutList = [
  { name: '物品图鉴', path: '/items' },
  { name: '角色图鉴', path: '/heroes' },
  { name: '关卡图鉴', path: '/chapters' },
  { name: '副本图鉴', path: '/dungeons' },
  { name: '怪物图鉴', path: '/monsters' },
  { name: '魔物收益', path: '/petseggs' },
  { name: '词条百科', path: '/glossary' }
]

const goHome = () => {
  router.push('/items')
}

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/items')
  }
}

const navigateTo = (path) => {
  router.push(path)
}
</script>

<style scoped>
.not-found-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - var(--header-height, 60px) - 60px);
  padding: 32px 16px;
  box-sizing: border-box;
}

.not-found-card {
  width: 100%;
  max-width: 580px;
  padding: 44px 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  position: relative;
  box-sizing: border-box;
}

.not-found-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.not-found-emblem {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: var(--paper-soft, #e9dcc3);
  border: 2px solid var(--border-color, #8f7351);
  box-shadow: inset 0 0 10px rgba(135, 107, 72, 0.25), 0 2px 6px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.not-found-emblem-icon {
  width: 30px;
  height: 30px;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2));
}

.not-found-code {
  font-size: 56px;
  font-weight: 900;
  line-height: 1;
  color: var(--text-main, #3e2a14);
  letter-spacing: 4px;
  font-family: var(--font-ui);
  text-shadow: 1px 2px 0 rgba(223, 206, 179, 0.8), 2px 3px 6px rgba(0, 0, 0, 0.2);
}

.dark-mode .not-found-code {
  color: #f0e3c6;
  text-shadow: 1px 2px 0 rgba(0, 0, 0, 0.8), 2px 3px 6px rgba(0, 0, 0, 0.5);
}

.not-found-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  max-width: 220px;
  color: var(--border-color, #8f7351);
}

.divider-line {
  flex: 1;
  height: 1px;
  background: var(--border-soft, rgba(143, 115, 81, 0.45));
}

.divider-star {
  font-size: 14px;
  line-height: 1;
}

.not-found-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.not-found-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  letter-spacing: 1px;
}

.dark-mode .not-found-title {
  color: #dfceb3;
}

.not-found-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted, #6b5134);
}

.dark-mode .not-found-desc {
  color: #bba282;
}

.not-found-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  margin-top: 6px;
}

.not-found-shortcuts {
  margin-top: 14px;
  padding-top: 18px;
  border-top: 1px dashed var(--border-soft, rgba(143, 115, 81, 0.4));
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.shortcuts-label {
  font-size: 12px;
  color: var(--text-faint, #8a6d4d);
  letter-spacing: 0.5px;
}

.shortcuts-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.shortcut-pill {
  padding: 4px 10px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-main, #3e2a14);
  background: var(--paper-soft, #e9dcc3);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.shortcut-pill:hover {
  background: var(--paper-solid, #d9c6a6);
  border-color: var(--border-color, #8f7351);
  color: var(--wood-deep, #1e150d);
  transform: translateY(-1px);
}

.dark-mode .shortcut-pill {
  background: rgba(60, 45, 30, 0.7);
  color: #dfceb3;
  border-color: rgba(143, 115, 81, 0.4);
}

.dark-mode .shortcut-pill:hover {
  background: rgba(80, 60, 40, 0.85);
  color: #fff;
}

@media (max-width: 640px) {
  .not-found-card {
    padding: 32px 18px;
    gap: 16px;
  }
  .not-found-code {
    font-size: 44px;
  }
  .not-found-title {
    font-size: 18px;
  }
  .desktop-only {
    display: none;
  }
}
</style>
