<template>
  <!--
    UiSplitButton —— 组合按钮：左侧主操作 + 右侧下拉开关，**外观上是同一个按钮**。

    为什么要有这个组件：主操作右侧挂一个小菜单（如发表区的「发表 ⌄」）如果做成两个独立按钮，
    视觉上就是"三明治"——中间多一道边、圆角对不上。这里用一层容器把两个 `UiButton` 拼起来：
    调色板仍来自 `UiButton`（只镜像它的悬停/禁用配色，不另造一套色），本组件改的是几何与
    **整组的状态**。

    ⚠️ 两条必须"整组一起"的状态，否则两半看起来像两个贴在一起的按钮（实测反馈"配色差异太大"）：
      1. **悬停**：鼠标在主操作上时，右半边也要一起亮（`UiButton` 自己的 `:hover` 只管自己那一半）；
      2. **禁用**：内容为空时主操作 `is-disabled`（`opacity: .5`）而右半边是全色，
         一半灰一半深。这里改成**整组统一压暗**，右半边仍可点。

    无障碍：主操作与下拉是**两个真实的 `<button>`**，各自可聚焦、可读屏；
    不要用"一个按钮按 x 坐标切区域"的做法，那样键盘用户没法只开菜单。
  -->
  <div
    class="ui-split-btn"
    :class="[`ui-split-btn--${variant}`, { 'is-disabled': disabled, 'is-expanded': expanded }]"
  >
    <UiButton
      v-bind="$attrs"
      class="ui-split-btn__main"
      :variant="variant"
      :size="size"
      :disabled="disabled"
      @click="emit('click', $event)"
    >
      <slot />
    </UiButton>
    <UiButton
      class="ui-split-btn__caret"
      :variant="variant"
      :size="size"
      :disabled="caretDisabled"
      :aria-label="caretLabel"
      aria-haspopup="dialog"
      :aria-expanded="expanded ? 'true' : 'false'"
      :title="caretTitle || caretLabel"
      @click="emit('toggle', $event)"
    >
      <!-- 细箭头（不是实心三角）：两条边旋转 45°，颜色跟随文字色；展开时翻上去 -->
      <span class="ui-split-btn__chevron" aria-hidden="true"></span>
    </UiButton>
  </div>
</template>

<script setup>
import UiButton from './UiButton.vue'

/**
 * `inheritAttrs: false` + 把 `$attrs` 绑到**主按钮**上：
 * 调用方写的 `class` / `data-*` 会落到主按钮而不是外层容器，这样
 * 「按 `.xxx` 拿按钮并读 `.disabled` / `.textContent`」的既有用法完全不变。
 */
defineOptions({ inheritAttrs: false })

defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'sm' },
  /** 主操作是否禁用（右侧下拉**不受它影响**，否则"内容为空时连发送方式都改不了"） */
  disabled: { type: Boolean, default: false },
  caretDisabled: { type: Boolean, default: false },
  /** 下拉开关的无障碍名（也是默认 tooltip） */
  caretLabel: { type: String, default: '更多选项' },
  caretTitle: { type: String, default: '' },
  /** 菜单是否展开（只用于 `aria-expanded`） */
  expanded: { type: Boolean, default: false }
})

const emit = defineEmits(['click', 'toggle'])
</script>

<style scoped>
.ui-split-btn {
  display: inline-flex;
  align-items: stretch;
}

/* 只改几何：中间那条边合并成一条分隔线，两端各自圆角 */
.ui-split-btn :deep(.ui-btn) {
  border-radius: 0;
}

.ui-split-btn :deep(.ui-split-btn__main) {
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
}

.ui-split-btn :deep(.ui-split-btn__caret) {
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
  /* 主按钮的右边框就是分隔线；开关自己不再描左边，避免"双线" */
  border-left-width: 0;
  padding-left: 7px;
  padding-right: 7px;
}

/* 分隔线：主按钮右侧那条边框在悬停时会变色，这里补一条不随悬停变化的分隔 */
.ui-split-btn__caret::before {
  content: '';
  position: absolute;
  left: 0;
  top: 15%;
  bottom: 15%;
  width: 1px;
  background: currentColor;
  opacity: 0.35;
}

.ui-split-btn :deep(.ui-split-btn__caret) {
  position: relative;
}

/* 细箭头：9×9 的两条边旋转 45°（朝下）；展开时翻成朝上，说明"再点就是收起" */
.ui-split-btn__chevron {
  display: block;
  width: 9px;
  height: 9px;
  border-right: 1.6px solid currentColor;
  border-bottom: 1.6px solid currentColor;
  border-radius: 1px;
  transform: rotate(45deg) translate(-1px, -1px);
  transition: transform 0.16s ease;
}

.ui-split-btn.is-expanded .ui-split-btn__chevron {
  transform: rotate(-135deg) translate(-1px, -1px);
}

@media (prefers-reduced-motion: reduce) {
  .ui-split-btn__chevron {
    transition: none;
  }
}

.ui-split-btn.is-disabled {
  cursor: not-allowed;
}

/*
 * 悬停整组一起亮，但**不动描边**。
 *
 * 为什么不动描边：`UiButton` 自己的悬停会把描边换成 `--accent-bright`（青绿），
 * 那在这一对拼起来的按钮上很像"鼠标移上去就冒出一条线"（用户反馈"很怪"）。
 * 这里只保留底色/文字色的变化，描边始终是静止态那一条。
 */
.ui-split-btn--primary:hover :deep(.ui-btn) {
  background: var(--wood-soft, #463424);
  border-color: #17100a;
}

.ui-split-btn--secondary:hover :deep(.ui-btn) {
  border-color: var(--border-color, #8f7351);
  color: var(--accent-ink, #557574);
}

/*
 * 禁用整组一起暗：主操作禁用时把**整个组合钮**压到同一档透明度，
 * 并取消 `UiButton` 单边的 `opacity: .5`（否则左灰右深，像两个按钮）。
 * 下拉仍然可点（内容为空也能改发送方式），所以指针要是手型。
 */
.ui-split-btn.is-disabled {
  opacity: 0.55;
}

.ui-split-btn.is-disabled :deep(.ui-btn.is-disabled) {
  opacity: 1;
}

.ui-split-btn.is-disabled :deep(.ui-split-btn__caret) {
  cursor: pointer;
}

.ui-split-btn.is-disabled :deep(.ui-split-btn__caret:hover) {
  border-color: var(--accent-bright, #7a9a99);
}
</style>
