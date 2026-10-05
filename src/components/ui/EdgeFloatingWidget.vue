<template>
  <div
    ref="widgetRef"
    class="edge-floating-widget"
    :class="[
      `is-${side}`,
      {
        'is-open': isOpen,
        'is-dragging': isDragging,
        'is-hidden': isHidden
      }
    ]"
    :style="widgetStyle"
  >
    <!-- 一体化原木胶囊外壳：手柄与展开内容完全相连无缝隙 -->
    <div class="edge-widget-capsule">
      <!-- 展开的快捷按钮区（平滑横向伸展） -->
      <Transition name="edge-menu-expand">
        <div v-if="isOpen" class="edge-expanded-content" @click.stop>
          <!-- 回到顶部 -->
          <button
            type="button"
            class="edge-menu-btn"
            title="回到顶部"
            aria-label="回到顶部"
            @click="onBackToTopClick"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
            <span class="edge-btn-text">顶部</span>
          </button>

          <!-- 功能导航 -->
          <button
            type="button"
            class="edge-menu-btn"
            title="功能导航"
            aria-label="功能导航"
            @click="onNavClick"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
            <span class="edge-btn-text">导航</span>
          </button>
        </div>
      </Transition>

      <!-- 贴边原木手柄（收起时为极简贴边把手，展开时充当右/左封口） -->
      <button
        type="button"
        class="edge-handle-btn"
        :aria-expanded="isOpen"
        :aria-label="isOpen ? '收起快捷菜单' : '展开快捷菜单'"
        @pointerdown="onPointerDown"
        @click="onHandleClick"
      >
        <span class="edge-handle-grip" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
        <span class="edge-handle-arrow" :class="{ 'is-flipped': isOpen }" aria-hidden="true">
          {{ side === 'right' ? '‹' : '›' }}
        </span>
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * EdgeFloatingWidget —— 移动端边缘吸附可拖动快捷菜单挂件（方案 A）
 *
 * 聚合「回到顶部」和「功能导航」：
 *   - 平时贴在屏幕边缘（仅露出一个小半圆拉手，宽度约 22px，高度约 52px）；
 *   - 可自由上下拖动贴边（松手自动保存位置，避免挡住当前行内容）；
 *   - 点击展开横向原木胶囊泡泡，提供「顶部」与「导航」；
 *   - 点外部自动收起。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveScrollTarget } from '../../utils/scrollTarget.js'

const props = defineProps({
  /** 是否在整屏模拟卡池等全屏阶段隐藏 */
  hidden: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle-nav'])

const widgetRef = ref(null)
const isOpen = ref(false)
const isDragging = ref(false)
const isHidden = computed(() => props.hidden)

// 吸附侧（默认右侧 'right'，支持拖动到左侧 'left'）
const side = ref('right')
// Y 轴相对视口的像素位置（默认距离屏幕底部 140px 左右）
const topPx = ref(380)

const STORAGE_KEY = 'syzg_edge_widget_pos'

function loadSavedPosition() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data.side === 'left' || data.side === 'right') side.value = data.side
      if (typeof data.top === 'number' && data.top > 80 && data.top < window.innerHeight - 80) {
        topPx.value = data.top
      }
    } else {
      // 默认位置：居中偏下
      topPx.value = Math.max(120, Math.min(window.innerHeight - 160, Math.floor(window.innerHeight * 0.65)))
    }
  } catch {
    /* fallback to default */
  }
}

function savePosition() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ side: side.value, top: topPx.value }))
  } catch {
    /* ignore */
  }
}

const widgetStyle = computed(() => {
  return {
    top: `${topPx.value}px`,
    [side.value]: '0px'
  }
})

// 拖拽手势状态
let startX = 0
let startY = 0
let initialTop = 0
let hasMoved = false
const DRAG_THRESHOLD = 5

function onPointerDown(e) {
  // 只响应主按键
  if (e.button && e.button !== 0) return
  startX = e.clientX
  startY = e.clientY
  initialTop = topPx.value
  hasMoved = false

  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(e) {
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (!hasMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    hasMoved = true
    isDragging.value = true
    isOpen.value = false // 拖动时自动收拢子菜单
  }

  if (hasMoved) {
    e.preventDefault()
    // 限制在安全视口范围内（避开顶栏 70px 和底栏安全区 60px）
    const minTop = 80
    const maxTop = window.innerHeight - 80
    topPx.value = Math.max(minTop, Math.min(maxTop, initialTop + dy))

    // 横向拖拽超过屏幕 40% 时可磁吸换边
    if (side.value === 'right' && e.clientX < window.innerWidth * 0.35) {
      side.value = 'left'
    } else if (side.value === 'left' && e.clientX > window.innerWidth * 0.65) {
      side.value = 'right'
    }
  }
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)

  if (hasMoved) {
    savePosition()
    setTimeout(() => {
      isDragging.value = false
    }, 50)
  }
}

function onHandleClick(e) {
  if (hasMoved) return
  isOpen.value = !isOpen.value
}

function closeMenu() {
  isOpen.value = false
}

// 点击其他地方收拢
function onDocumentClick(e) {
  if (!isOpen.value) return
  if (widgetRef.value && !widgetRef.value.contains(e.target)) {
    isOpen.value = false
  }
}

// 回到顶部动作
function onBackToTopClick() {
  // 1. 优先检查当前是否有处于打开状态的弹窗（UiModal 等）
  const activeModals = Array.from(
    document.querySelectorAll(
      '.ui-modal-overlay:not([style*="display: none"]) .ui-modal-body, .ui-modal-host.ui-modal-open .ui-modal-body, [id$="ModalScroll"]'
    )
  ).filter(el => {
    if (el.offsetParent === null) return false
    const overlay = el.closest('.ui-modal-overlay')
    if (overlay && (overlay.style.display === 'none' || getComputedStyle(overlay).display === 'none')) return false
    return true
  })

  if (activeModals.length > 0) {
    const targetModal = activeModals[activeModals.length - 1]
    targetModal.scrollTo({ top: 0, behavior: 'smooth' })
    isOpen.value = false
    return
  }

  // 2. 主页面核心滚动区（移动端全站由 [data-main-scroll] / .ui-card-grid-scroll 等接管滚动）
  const mainScrollers = Array.from(
    document.querySelectorAll(
      '.page-view-container [data-main-scroll], [data-main-scroll], .ui-card-grid-scroll, [id$="GridScroll"], [id$="Scroll"], .discussions-content'
    )
  ).filter(el => el.offsetParent !== null)

  let hasScrolled = false
  for (const el of mainScrollers) {
    if (el.scrollTop > 0) {
      el.scrollTo({ top: 0, behavior: 'smooth' })
      hasScrolled = true
    }
  }

  // 若某些容器虽有内容但 scrollTop 较小或尚未判定，也对主要滚动容器执行归零
  if (!hasScrolled && mainScrollers.length > 0) {
    mainScrollers.forEach(el => {
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTo({ top: 0, behavior: 'smooth' })
        hasScrolled = true
      }
    })
  }

  // 3. 桌面端主宿主（.app-container）
  const appContainer = document.querySelector('.app-container')
  if (appContainer && appContainer.scrollTop > 0) {
    appContainer.scrollTo({ top: 0, behavior: 'smooth' })
    hasScrolled = true
  }

  // 4. 文档级 window / body / html 兜底
  if (window.scrollY > 0 || document.documentElement?.scrollTop > 0 || document.body?.scrollTop > 0 || !hasScrolled) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (document.documentElement && document.documentElement.scrollTop > 0) {
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' })
    }
    if (document.body && document.body.scrollTop > 0) {
      document.body.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  isOpen.value = false
}

// 触发导航侧边栏
function onNavClick() {
  isOpen.value = false
  emit('toggle-nav')
}

onMounted(() => {
  loadSavedPosition()
  document.addEventListener('pointerdown', onDocumentClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentClick, true)
})
</script>

<style scoped>
.edge-floating-widget {
  position: fixed;
  z-index: var(--floating-control-z, 6002);
  display: flex;
  align-items: center;
  user-select: none;
  touch-action: none;
  transform: translateZ(0);
}

.edge-floating-widget.is-hidden {
  display: none !important;
}

/* 仅在移动端和小屏（<=1024px）生效，桌面端依旧由左侧导航栏主导 */
@media (min-width: 1025px) {
  .edge-floating-widget {
    display: none !important;
  }
}

/* 右侧吸附 */
.edge-floating-widget.is-right {
  flex-direction: row-reverse;
}

/* 左侧吸附 */
.edge-floating-widget.is-left {
  flex-direction: row;
}

/* 一体化原木胶囊外壳容器 */
.edge-widget-capsule {
  display: flex;
  align-items: center;
  background: linear-gradient(180deg, var(--wood-soft, #463424), var(--wood, #2b1f15));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
  transition: border-radius 0.2s ease, box-shadow 0.2s ease;
}

/* 右侧吸附时：左边圆角，右边贴屏 */
.edge-floating-widget.is-right .edge-widget-capsule {
  flex-direction: row;
  border-top-left-radius: 26px;
  border-bottom-left-radius: 26px;
  border-left: 2px solid var(--border-color, #8f7351);
  border-top: 2px solid var(--border-color, #8f7351);
  border-bottom: 2px solid var(--border-color, #8f7351);
}

/* 左侧吸附时：右边圆角，左边贴屏 */
.edge-floating-widget.is-left .edge-widget-capsule {
  flex-direction: row-reverse;
  border-top-right-radius: 26px;
  border-bottom-right-radius: 26px;
  border-right: 2px solid var(--border-color, #8f7351);
  border-top: 2px solid var(--border-color, #8f7351);
  border-bottom: 2px solid var(--border-color, #8f7351);
}

/* 贴边手柄按钮（作为胶囊的一部分，去掉多余外边框，实现无缝衔接） */
.edge-handle-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 20px;
  height: 52px;
  box-sizing: border-box;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--on-wood-text, #dfceb3);
  cursor: grab;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
}

.edge-handle-btn:active,
.edge-floating-widget.is-dragging .edge-handle-btn {
  cursor: grabbing;
}

/* 手柄上的小抓点线段 */
.edge-handle-grip {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.edge-handle-grip span {
  display: block;
  width: 8px;
  height: 1.5px;
  background: var(--border-color, #8f7351);
  border-radius: 1px;
  opacity: 0.85;
}

/* 箭头符号 */
.edge-handle-arrow {
  font-size: 13px;
  line-height: 1;
  font-weight: 700;
  color: var(--on-wood-text, #dfceb3);
  transition: transform 0.22s ease;
}

.edge-handle-arrow.is-flipped {
  transform: rotate(180deg);
}

/* 展开的快捷按钮区（一体化内嵌） */
.edge-expanded-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  overflow: hidden;
}

.edge-floating-widget.is-left .edge-expanded-content {
  padding: 4px 10px 4px 6px;
}

.edge-menu-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(223, 206, 179, 0.35);
  background: rgba(0, 0, 0, 0.22);
  color: var(--on-wood-text, #dfceb3);
  font-size: 11px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.12s ease;
  padding: 0;
  flex-shrink: 0;
}

.edge-menu-btn:active {
  transform: scale(0.92);
  background: rgba(122, 154, 153, 0.25);
  border-color: var(--accent-bright, #7a9a99);
}

.edge-btn-text {
  font-size: 10px;
  line-height: 1;
  transform: scale(0.9);
}

/* 展开伸缩动效：宽度与透明度平滑过渡 */
.edge-menu-expand-enter-active,
.edge-menu-expand-leave-active {
  transition: max-width 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, padding 0.24s ease;
  max-width: 140px;
}

.edge-menu-expand-enter-from,
.edge-menu-expand-leave-to {
  max-width: 0;
  opacity: 0;
  padding-left: 0;
  padding-right: 0;
}
</style>
