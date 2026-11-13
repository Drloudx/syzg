<template>
  <Teleport to="body">
    <Transition name="ui-lightbox-fade">
      <div
        v-if="visible"
        class="ui-lightbox"
        :style="{ zIndex }"
        role="dialog"
        aria-modal="true"
        :aria-label="alt || '图片预览'"
        @click="onBackdropClick"
        @touchstart.passive="onTouchStart"
        @touchmove.prevent="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <!-- 图片按视口 contain：不出现滚动条，整图完整可见；支持双指缩放 -->
        <img
          v-if="src"
          :src="src"
          ref="imgEl"
          class="ui-lightbox__img"
          :class="{ 'is-upscaled': upscale }"
          :style="imgStyle"
          :alt="alt || '图片预览'"
          decoding="async"
          @click.stop
          @load="syncUpscale"
        />
        <button class="ui-lightbox__close" type="button" title="关闭" aria-label="关闭" @click.stop="close">✕</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useOverlay } from '../../composables/useOverlay.js'
import { acquireGlobalModalLock, releaseGlobalModalLock } from '../../utils/globalModalLock.js'

/**
 * UiImageLightbox —— 图片放大查看器（B 站评论区 / 主流站点同款交互）
 *
 * 与 UiModal 的区别（为什么单开一个组件）：
 *   - UiModal 是「羊皮纸面板 + 标题条 + body 滚动区」，用来看图会：
 *     ① 图被面板边框压缩；② 大图撑出 body 滚动条；③ 观感不像看图。
 *   - 本组件是**全屏黑底、无边框、图片按视口 contain、永不滚动**：
 *     任何尺寸的图都完整显示在视口内，不出现滚动条。
 *
 * 小图（如家具外观图标本身只有 ~180px）会被放大到接近视口，避免"点开还是很小"；
 * 放大用 CSS width，清晰度受源图限制（源图小则放大不可避免会糊，属资源问题）。
 *
 * 交互：点图片以外任意处关闭、右上角 ✕ 关闭、Esc / 返回键关闭（走 overlayStack）。
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  zIndex: { type: Number, default: 13000 },
  /**
   * 小图放大目标：最长边占视口的比例。默认 0.5（约等于用户黄框的高度比例）。
   * 传 0 关闭自动放大，纯按原尺寸 contain。
   */
  upscaleRatio: { type: Number, default: 0.5 }
})
const emit = defineEmits(['update:visible', 'close'])

const imgEl = ref(null)
const upscale = ref(false)
const upscaleW = ref(0)
const upscaleH = ref(0)

/**
 * 源图明显偏小时按视口可用区域放大，等比缩放。
 * 大图（源图够大）不放大，直接按视口 contain。
 *
 * 竖屏（手机）与横屏（桌面）取不同约束，避免手机竖屏时按短边算出过小的图：
 *   - 竖屏：以「视口宽 × ratio」为主（默认 0.86），高度不超过视口高 × 0.72
 *   - 横屏：最长边 ≈ min(视口宽, 视口高) × ratio（默认约半屏）
 */
const syncUpscale = () => {
  const el = imgEl.value
  const ratio = props.upscaleRatio
  if (!el || !el.naturalWidth || !ratio) { upscale.value = false; return }
  const vw = window.innerWidth || 1024
  const vh = window.innerHeight || 768
  const nw = el.naturalWidth, nh = el.naturalHeight

  let maxW, maxH
  if (vh >= vw) {
    // 竖屏（手机）：占宽为主，最多到视口宽的 88%、高的 72%
    maxW = (vw - 24) * 0.88
    maxH = (vh - 24) * 0.72
  } else {
    // 横屏（桌面）：约半屏
    const shortSide = Math.min(vw, vh)
    maxW = maxH = shortSide * ratio
  }

  // 等比缩放到刚好装进 maxW×maxH
  const scale = Math.min(maxW / nw, maxH / nh)
  upscale.value = scale > 1
  if (upscale.value) {
    upscaleW.value = Math.round(nw * scale)
    upscaleH.value = Math.round(nh * scale)
  }
}

watch(() => [props.visible, props.src], async () => {
  if (props.visible && props.src) {
    upscale.value = false
    pinchScale.value = 1
    pinchTouch = false
    await nextTick()
    // 图片可能来自缓存、load 事件不触发，补一次
    syncUpscale()
  }
}, { flush: 'post' })

/* ─────────── 双指缩放（仅缩放，不拖动） ───────────
 *
 * 与「点任意处关闭」不冲突的原理：按触点数量区分。
 *   - 单指点一下（touchstart 1 指 → touchend 1 指，且未移动）→ 关闭
 *   - 双指捏合（touchstart 出现 2 指）→ 进入缩放，抬起时**不触发关闭**
 *
 * 缩放只改 transform: scale()，不移动位置（以中心缩放），因此不会和点击打架。
 */
const pinchScale = ref(1)
const MIN_SCALE = 1
const MAX_SCALE = 4
let pinchTouch = false      // 本次触摸是否发生过双指
let startDist = 0           // 双指起始间距
let startScale = 1          // 起始缩放
let singleMoved = false     // 单指是否移动过（移动则不视为点击）
let startX = 0
let startY = 0

const imgStyle = computed(() => {
  const base = upscale.value ? { width: upscaleW.value + 'px', height: upscaleH.value + 'px' } : {}
  if (pinchScale.value !== 1) {
    return { ...base, transform: `scale(${pinchScale.value})`, transformOrigin: 'center center' }
  }
  return base
})

const distanceOf = (t1, t2) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)

const onTouchStart = event => {
  const touches = event.touches
  if (touches.length >= 2) {
    pinchTouch = true
    startDist = distanceOf(touches[0], touches[1])
    startScale = pinchScale.value
  } else if (touches.length === 1) {
    singleMoved = false
    startX = touches[0].clientX
    startY = touches[0].clientY
  }
}

const onTouchMove = event => {
  const touches = event.touches
  if (touches.length >= 2 && startDist > 0) {
    pinchTouch = true
    const next = startScale * (distanceOf(touches[0], touches[1]) / startDist)
    pinchScale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
  } else if (touches.length === 1 && !pinchTouch) {
    // 单指移动超过阈值即不视为点击（避免滑动时误关）
    const dx = touches[0].clientX - startX
    const dy = touches[0].clientY - startY
    if (Math.hypot(dx, dy) > 8) singleMoved = true
  }
}

const onTouchEnd = event => {
  // 双指过渡到单指时保持缩放，不重置
  if (event.touches && event.touches.length >= 1) return
  // 手指全部抬起：结束本次手势判定
  startDist = 0
  // 注意：pinchTouch 不能在这里立刻清掉——touchend 之后浏览器还会补发一次
  // click（落在背景上）。若立刻清零，"双指结束后"的那次 click 会把图关掉。
  // 因此留一个「刚刚双指过」的短标记，由 onBackdropClick 消费一次后清除。
  if (pinchTouch) justPinched = true
}

// 刚结束双指手势的标记：消费一次即失效
let justPinched = false

const onBackdropClick = () => {
  if (justPinched) { justPinched = false; pinchTouch = false; return }
  if (pinchTouch) { pinchTouch = false; return }
  if (singleMoved) { singleMoved = false; return }
  close()
}


const close = () => {
  emit('update:visible', false)
  emit('close')
}

// 返回键 / Esc 关闭：注册进全局浮层栈，只有最上层响应
const { isTopOverlay } = useOverlay(() => props.visible, {
  priority: props.zIndex,
  canClose: () => true,
  close
})

// 打开时锁滚动（背景不跟着滚）
const lockOwner = Symbol('ui-lightbox-lock')
let ownsLock = false
watch(() => props.visible, active => {
  if (active && !ownsLock) {
    acquireGlobalModalLock(lockOwner)
    ownsLock = true
  } else if (!active && ownsLock) {
    ownsLock = false
    releaseGlobalModalLock(lockOwner)
  }
}, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  if (ownsLock) {
    ownsLock = false
    releaseGlobalModalLock(lockOwner)
  }
})
</script>

<style scoped>
.ui-lightbox {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(8px, 2vh, 24px);
  background: rgba(0, 0, 0, 0.94);
  cursor: zoom-out;
  /* 彻底禁用滚动与回弹，确保「不滚动、整图可见」 */
  overflow: hidden;
  overscroll-behavior: contain;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

.ui-lightbox__img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  /* 纯图显示：不要边框、圆角、阴影，避免小图放大后出现一圈"框" */
  border: 0;
  border-radius: 0;
  box-shadow: none;
  image-rendering: auto;
  cursor: default;
  user-select: none;
  -webkit-user-drag: none;
}

/*
 * 小图放大：由 JS 结合源图宽高比直接给出宽高，保证等比、不超视口。
 */
.ui-lightbox__img.is-upscaled {
  max-width: 100%;
  max-height: 100%;
  /* width/height 由行内 style 给出（等比缩放的精确像素） */
  object-fit: contain;
}

.ui-lightbox__close {
  position: absolute;
  top: max(12px, env(safe-area-inset-top, 0px));
  right: max(12px, env(safe-area-inset-right, 0px));
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.ui-lightbox__close:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: scale(1.06);
}

.ui-lightbox-fade-enter-active,
.ui-lightbox-fade-leave-active {
  transition: opacity 0.18s ease;
}

.ui-lightbox-fade-enter-from,
.ui-lightbox-fade-leave-to {
  opacity: 0;
}
</style>
