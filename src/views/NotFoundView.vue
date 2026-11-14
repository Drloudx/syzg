<template>
  <div class="page-view-container not-found-page">
    <div class="not-found-card paper-panel corner-nails">
      <!-- 顶部大书院古典罗盘徽记 -->
      <div class="not-found-header">
        <div class="not-found-emblem" aria-hidden="true">
          <div class="not-found-emblem__ring">
            <img
              :src="getImageUrl('/ui/icon_academy_book.svg')"
              alt="大书院图章"
              class="not-found-emblem-icon"
              loading="lazy"
            />
          </div>
        </div>

        <div class="not-found-code">404</div>

        <div class="not-found-divider" aria-hidden="true">
          <span class="divider-line divider-line--left"></span>
          <span class="divider-ornament">
            <span class="divider-dot"></span>
            <span class="divider-star">✦</span>
            <span class="divider-dot"></span>
          </span>
          <span class="divider-line divider-line--right"></span>
        </div>
      </div>

      <!-- 核心文案 -->
      <div class="not-found-body">
        <h2 class="not-found-title">迷失在深渊深处</h2>
        <p class="not-found-desc">
          大书院的学者们尚未在此处勘测出任何地图或收录记载。<br class="desktop-only" />
          你探寻的坐标可能已被深渊吞噬，或是这段记录已湮灭于岁月迷雾之中。
        </p>
      </div>

      <!-- 操作按钮区 -->
      <div class="not-found-actions">
        <UiButton
          variant="primary"
          size="md"
          class="not-found-btn not-found-btn--primary"
          @click="goHome"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <span>返回大书院首页</span>
        </UiButton>
        <UiButton
          variant="secondary"
          size="md"
          class="not-found-btn not-found-btn--secondary"
          @click="goBack"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>返回上一页</span>
        </UiButton>
      </div>

      <!-- 快捷传送门（8个规整对齐，彻底消除孤立项） -->
      <div class="not-found-shortcuts">
        <div class="shortcuts-header">
          <span class="shortcuts-decor" aria-hidden="true">~</span>
          <span class="shortcuts-label">快速传送到热门区域</span>
          <span class="shortcuts-decor" aria-hidden="true">~</span>
        </div>
        <div class="shortcuts-grid">
          <button
            v-for="item in shortcutList"
            :key="item.path"
            type="button"
            class="shortcut-badge"
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
  { name: '词条百科', path: '/glossary' },
  { name: '招募模拟', path: '/gacha' }
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
  padding: 36px 16px;
  box-sizing: border-box;
}

.not-found-card {
  width: 100%;
  max-width: 640px;
  padding: 42px 36px 36px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  position: relative;
  box-sizing: border-box;
  background: var(--paper-soft, #f4ede0);
  border: 1px solid var(--border-color, #8f7351);
  box-shadow: 0 10px 30px rgba(43, 31, 21, 0.22), inset 0 0 24px rgba(135, 107, 72, 0.12);
}

.not-found-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

/* 古典双环罗盘徽章 */
.not-found-emblem {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: var(--paper-solid, #ebe0cd);
  border: 1px solid var(--border-color, #8f7351);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  box-sizing: border-box;
}

.not-found-emblem__ring {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px dashed rgba(143, 115, 81, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}

.not-found-emblem-icon {
  width: 28px;
  height: 28px;
  opacity: 0.88;
  filter: drop-shadow(0 1px 2px rgba(43, 31, 21, 0.2));
}

/* 古典衬线体 404 */
.not-found-code {
  font-size: 64px;
  font-weight: 700;
  line-height: 1;
  color: var(--wood-deep, #2b1f15);
  letter-spacing: 6px;
  font-family: 'Cinzel', 'Palatino Linotype', 'Book Antiqua', 'Georgia', serif;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.6);
  user-select: none;
}

.dark-mode .not-found-code {
  color: #dfceb3;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}

/* 古典星芒分隔条 */
.not-found-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  max-width: 260px;
}

.divider-line {
  flex: 1;
  height: 1px;
}

.divider-line--left {
  background: linear-gradient(to right, transparent, var(--border-soft, rgba(143, 115, 81, 0.45)));
}

.divider-line--right {
  background: linear-gradient(to left, transparent, var(--border-soft, rgba(143, 115, 81, 0.45)));
}

.divider-ornament {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent-bright, #7a9a99);
}

.divider-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--border-color, #8f7351);
  opacity: 0.6;
}

.divider-star {
  font-size: 13px;
  line-height: 1;
}

/* 核心文案 */
.not-found-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 500px;
}

.not-found-title {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  letter-spacing: 2px;
}

.dark-mode .not-found-title {
  color: #dfceb3;
}

.not-found-desc {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text-muted, #6b5134);
  letter-spacing: 0.3px;
}

.dark-mode .not-found-desc {
  color: #bba282;
}

/* 主行动按钮 */
.not-found-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  margin-top: 4px;
}

.not-found-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 快捷传送门 */
.not-found-shortcuts {
  margin-top: 8px;
  padding-top: 18px;
  border-top: 1px dashed var(--border-faint, rgba(143, 115, 81, 0.28));
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.shortcuts-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.shortcuts-decor {
  color: var(--accent-bright, #7a9a99);
  font-size: 13px;
  opacity: 0.7;
}

.shortcuts-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-faint, #8a6d4d);
  letter-spacing: 0.8px;
}

/* 4列对称网格：桌面端 4+4 完美对称 */
.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  max-width: 480px;
}

.shortcut-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-ui);
  color: var(--text-main, #3e2a14);
  background: var(--paper-solid, #ebe0cd);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.35));
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.16s ease;
  white-space: nowrap;
  box-sizing: border-box;
}

.shortcut-badge:hover {
  background: var(--paper-soft, #f7efe2);
  border-color: var(--accent, #7a9a99);
  color: var(--accent-ink, #2d5a57);
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
}

.dark-mode .shortcut-badge {
  background: rgba(45, 33, 23, 0.8);
  color: #dfceb3;
  border-color: rgba(143, 115, 81, 0.32);
}

.dark-mode .shortcut-badge:hover {
  background: rgba(65, 48, 33, 0.95);
  border-color: var(--accent-bright, #7a9a99);
  color: #fff;
}

/* 移动端适配 */
@media (max-width: 640px) {
  .not-found-page {
    padding: 20px 12px;
  }
  .not-found-card {
    padding: 28px 18px 24px;
    gap: 16px;
  }
  .not-found-code {
    font-size: 48px;
    letter-spacing: 4px;
  }
  .not-found-title {
    font-size: 18px;
  }
  .not-found-desc {
    font-size: 12.5px;
    line-height: 1.65;
  }
  .desktop-only {
    display: none;
  }
  .shortcuts-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .shortcut-badge {
    padding: 5px 4px;
    font-size: 11.5px;
  }
}

@media (max-width: 400px) {
  .shortcuts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .not-found-actions {
    flex-direction: column;
    width: 100%;
  }
  .not-found-btn {
    width: 100%;
  }
}
</style>
