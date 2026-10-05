<template>
  <Teleport to="body">
    <Transition name="ui-popover" @after-enter="focusInitial">
      <section
        v-if="visible"
        :id="id"
        ref="panel"
        class="ui-popover-panel paper-panel corner-nails"
        role="dialog"
        :aria-label="title"
        tabindex="-1"
        :style="positionStyle"
      >
        <div class="ui-popover-heading">
          <span>{{ title }}</span>
          <slot name="heading-actions" />
          <UiButton variant="ghost" size="sm" type="button" class="ui-popover-close" aria-label="关闭" @click="close()">✕</UiButton>
        </div>
        <slot />
      </section>
    </Transition>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import UiButton from './UiButton.vue'
import { useOverlay } from '../../composables/useOverlay.js'

const props = defineProps({
  visible: Boolean,
  anchor: { type: Object, default: null },
  id: { type: String, required: true },
  title: { type: String, default: '' },
  width: { type: Number, default: 720 },
  zIndex: { type: Number, default: 6003 },
  /**
   * 水平对齐方式：
   *   - `end`（默认）：面板**右边缘**贴齐锚点右边缘——适合靠右的锚点（右栏吉祥物等），
   *     否则面板会往右伸出视口；
   *   - `start`：面板**左边缘**贴齐锚点左边缘（向右展开）——适合靠左的锚点，
   *     例如发表区左下角的表情按钮（用户明确要求向右展开）。
   * 两种都会再夹到视口内，锚点贴近边缘时不会溢出。
   */
  align: { type: String, default: 'end' }
})
const emit = defineEmits(['update:visible'])
const panel = ref(null)
const positionStyle = ref({ visibility: 'hidden' })
let frame = 0
let resizeObserver
let lifecycle = 0

function close(restoreFocus = true) {
  emit('update:visible', false)
  if (restoreFocus && props.anchor?.isConnected) props.anchor.focus({ preventScroll: true })
}

const { isTopOverlay } = useOverlay(() => props.visible, { priority: props.zIndex, close: () => close() })

function position() {
  if (!panel.value || !props.anchor || !props.visible) return
  const anchor = props.anchor.getBoundingClientRect()
  if (!props.anchor.getClientRects().length || anchor.bottom <= 0 || anchor.top >= innerHeight) {
    close(false)
    return
  }
  const gutter = 16
  const width = Math.min(props.width, innerWidth - gutter * 2)
  const maxHeight = Math.max(1, anchor.top - gutter - 10)
  const height = Math.min(panel.value.offsetHeight, maxHeight)
  // `start` = 向右展开（面板左边贴锚点左边）；`end` = 向左展开（面板右边贴锚点右边）
  const wantedLeft = props.align === 'start' ? anchor.left : anchor.right - width
  positionStyle.value = {
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
    left: `${Math.max(gutter, Math.min(wantedLeft, innerWidth - width - gutter))}px`,
    top: `${Math.max(gutter, anchor.top - height - 10)}px`,
    zIndex: props.zIndex,
    visibility: 'visible'
  }
}
function schedulePosition() {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; position() })
}
function outside(event) {
  if (!isTopOverlay() || panel.value?.contains(event.target) || props.anchor?.contains(event.target)) return
  close(false)
}
function keydown(event) {
  if (event.key !== 'Escape' || !isTopOverlay()) return
  event.preventDefault()
  event.stopPropagation()
  close()
}
function focusInitial() {
  if (!props.visible || !isTopOverlay()) return
  const initial = panel.value?.querySelector('[aria-pressed="true"]:not(:disabled)') || panel.value?.querySelector('button:not(:disabled)')
  ;(initial || panel.value)?.focus({ preventScroll: true })
}
function cleanup() {
  cancelAnimationFrame(frame)
  frame = 0
  resizeObserver?.disconnect()
  window.removeEventListener('resize', schedulePosition)
  window.removeEventListener('scroll', schedulePosition, true)
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('focusin', outside)
  document.removeEventListener('keydown', keydown, true)
}
watch(() => props.visible, async visible => {
  const operation = ++lifecycle
  cleanup()
  if (!visible) return
  positionStyle.value = { width: `${Math.min(props.width, innerWidth - 32)}px`, visibility: 'hidden' }
  await nextTick()
  if (!props.visible || operation !== lifecycle) return
  position()
  resizeObserver = new ResizeObserver(schedulePosition)
  resizeObserver.observe(panel.value)
  if (props.anchor) resizeObserver.observe(props.anchor)
  window.addEventListener('resize', schedulePosition, { passive: true })
  window.addEventListener('scroll', schedulePosition, { passive: true, capture: true })
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('focusin', outside)
  document.addEventListener('keydown', keydown, true)
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => { lifecycle += 1; cleanup() })
</script>

<style scoped>
.ui-popover-panel {
  position: fixed;
  box-sizing: border-box;
  padding: 12px 14px 14px;
  overflow: auto;
  overscroll-behavior: contain;
  color: var(--text-main);
  font-family: var(--font-ui);
  /* Same parchment surface and brown outline as the existing information sidebar. */
  transform-origin: bottom right;
}
.ui-popover-panel.paper-panel {
  /* Keep the sidebar's paper color while hiding text and artwork underneath. */
  background-color: var(--paper);
}
.ui-popover-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
  padding-left: 5px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
}
.ui-popover-heading > :last-child { margin-left: auto; }
/*
 * 关闭按钮与 `UiModal` 的关闭钮**同一规格**（28×28 方形、14px 字形、`✕`）：
 * 之前用 `UiButton` 的默认内边距，渲染成 34×28 的长方形、字形只有 12px，
 * 在小面板（发送方式 240px）里就显得"这个叉大小不对"（用户反馈）。
 * 面板是羊皮纸底，所以用羊皮纸的描边/字色，不照搬弹窗的木色。
 */
.ui-popover-close {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  color: var(--text-faint, #8a7358);
}

.ui-popover-close:hover:not(.is-disabled) {
  color: var(--text-main, #3e2a14);
}
.ui-popover-enter-active { transition: opacity .15s ease, transform .15s ease; }
.ui-popover-enter-from { opacity: 0; transform: translateY(8px); }
@media (prefers-reduced-motion: reduce) {
  .ui-popover-enter-active { transition: none; }
}
</style>
