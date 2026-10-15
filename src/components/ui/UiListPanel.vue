<template>
  <div class="ui-list-panel" :class="{ 'is-flat': flat }">
    <div v-if="$slots.header" class="ui-list-panel__header">
      <slot name="header" />
    </div>
    <div class="ui-list-panel__body">
      <slot />
    </div>
  </div>
</template>

<script setup>
/**
 * UiListPanel —— 一体化列表纸面容器 (Parchment Wiki Design System)
 * 供 UiListRow（支持 flush 模式）成组包裹渲染，解决孤岛悬浮感，并支持统一表头。
 * flat: 无多余外框模式（在已有 paper-panel 内无缝嵌入，不额外产生嵌套边框与阴影）
 */
defineProps({
  flat: { type: Boolean, default: false }
})
</script>

<style scoped>
.ui-list-panel {
  width: 100%;
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--paper-soft, #e9dcc3);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

:global(.dark-mode) .ui-list-panel {
  background-color: var(--paper-soft, #32251a);
  border-color: var(--border-soft);
}

.ui-list-panel.is-flat {
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
}

.ui-list-panel__header {
  display: flex;
  align-items: center;
  background: rgba(62, 42, 20, 0.08);
  border-bottom: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  letter-spacing: 0.5px;
}

:global(.dark-mode) .ui-list-panel__header {
  background: rgba(0, 0, 0, 0.25);
}

.ui-list-panel__body {
  display: flex;
  flex-direction: column;
}

@media (max-width: 640px) {
  .ui-list-panel__header {
    padding: 8px 10px;
  }
}
</style>
