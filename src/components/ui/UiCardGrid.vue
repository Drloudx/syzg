<template>
  <div ref="scrollElement" class="ui-card-grid-scroll" :id="id" data-main-scroll>
    <div ref="gridElement" class="ui-card-grid" :class="{ 'is-wide': wide, 'is-small': small }" :style="contentStyle">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, provide, onMounted, onBeforeUnmount } from 'vue'

/**
 * UiCardGrid —— 数据网格滚动容器（替代旧 .data-grid-scroll / .items-grid）
 * id 传给滚动容器，供 UiBackToTop 定位
 * wide: 宽卡片（220px 起）；small: 小图标卡（88px 起）
 */
defineProps({
  id: { type: String, default: '' },
  wide: { type: Boolean, default: false },
  small: { type: Boolean, default: false },
  contentStyle: { type: Object, default: null }
})

const scrollElement = ref(null)
const gridElement = ref(null)

// 快速滑动状态感知：当用户高速划过列表时，通知子卡片暂停向网络派发非缓存图片请求
const isFastScrolling = ref(false)
provide('isFastScrolling', isFastScrolling)

let scrollTimer = null
let lastScrollTop = 0
let lastScrollTime = 0
const FAST_VELOCITY_THRESHOLD = 0.8 // px/ms（约 800px/s，超过即视为飞速滑动）
const IDLE_DELAY = 120 // ms

const updateScrollVelocity = (currentTop) => {
  const now = performance.now()
  const dt = now - lastScrollTime
  const dy = Math.abs(currentTop - lastScrollTop)

  if (dt > 0 && dt < 400) {
    const velocity = dy / dt
    if (velocity > FAST_VELOCITY_THRESHOLD) {
      isFastScrolling.value = true
    }
  }

  lastScrollTop = currentTop
  lastScrollTime = now

  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    isFastScrolling.value = false
  }, IDLE_DELAY)
}

const onScrollCapture = (e) => {
  const target = e.target
  if (!scrollElement.value) return

  const isMobile = window.innerWidth <= 1024
  let currentTop = 0

  if (isMobile) {
    if (target !== scrollElement.value) return
    currentTop = target.scrollTop || 0
  } else {
    if (
      target !== document &&
      target !== window &&
      !target?.classList?.contains?.('app-container')
    ) {
      return
    }
    currentTop = target.scrollTop || window.scrollY || document.documentElement?.scrollTop || 0
  }

  updateScrollVelocity(currentTop)
}

const onScrollEnd = (e) => {
  const target = e.target
  if (
    target === scrollElement.value ||
    target === window ||
    target === document ||
    target?.classList?.contains?.('app-container')
  ) {
    clearTimeout(scrollTimer)
    isFastScrolling.value = false
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScrollCapture, { capture: true, passive: true })
  window.addEventListener('scrollend', onScrollEnd, { capture: true, passive: true })
})

onBeforeUnmount(() => {
  clearTimeout(scrollTimer)
  window.removeEventListener('scroll', onScrollCapture, { capture: true })
  window.removeEventListener('scrollend', onScrollEnd, { capture: true })
})

defineExpose({ scrollElement, gridElement })
</script>

<style scoped>
.ui-card-grid-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 2px 0 calc(14px + var(--safe-bottom, 0px));
  box-sizing: border-box;
  min-height: 0;
}
.ui-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  grid-auto-rows: max-content;
  align-content: start;
  gap: 14px;
}
.ui-card-grid.is-wide {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.ui-card-grid.is-small {
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
}
@media (min-width: 768px) {
  .ui-card-grid.is-small {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  }
}
</style>
