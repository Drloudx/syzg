<template>
  <button
    type="button"
    class="ui-filter-pill"
    :class="[
      { 'is-active': active },
      quality ? `quality-text-${quality}` : '',
      { 'is-disabled': disabled }
    ]"
    :disabled="disabled"
    @click="emit('click')"
  >
    <slot />
  </button>
</template>

<script setup>
/**
 * UiFilterPill —— 筛选胶囊按钮
 * quality: 1~5 时文字采用对应品质色，激活底色也随之变化
 */
defineProps({
  active: { type: Boolean, default: false },
  quality: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['click'])
</script>

<style scoped>
.ui-filter-pill {
  background: rgba(233, 220, 195, 0.6);
  border: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
  border-radius: 12px;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted, #6b5134);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  font-family: var(--font-ui);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.ui-filter-pill:hover:not(.is-disabled):not(.is-active) {
  color: var(--text-main, #3e2a14);
  border-color: var(--border-soft, rgba(143, 115, 81, 0.45));
}
.ui-filter-pill.is-active {
  background: var(--wood, #2b1f15);
  color: var(--paper, #dfceb3);
  border-color: #17100a;
  font-weight: 700;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}
.dark-mode .ui-filter-pill,
.dark-theme .ui-filter-pill {
  background: rgba(45, 33, 22, 0.7);
  color: var(--text-muted);
  border-color: rgba(143, 115, 81, 0.32);
}
.dark-mode .ui-filter-pill:hover:not(.is-disabled):not(.is-active),
.dark-theme .ui-filter-pill:hover:not(.is-disabled):not(.is-active) {
  background: rgba(58, 42, 28, 0.85);
  color: var(--text-main);
  border-color: rgba(180, 145, 100, 0.45);
}
/* 普通激活胶囊（无品质）：暖木金边与高对比象牙暖白文字 */
.dark-mode .ui-filter-pill.is-active:not([class*="quality-text-"]),
.dark-theme .ui-filter-pill.is-active:not([class*="quality-text-"]) {
  background: linear-gradient(180deg, #573f27, #3d2a19) !important;
  color: #fff2db !important;
  border-color: #ba8c46 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 215, 140, 0.35) !important;
  font-weight: 700;
}

/* 浅色模式品质激活态：去荧光矿石色，贴合羊皮纸暖调 */
.ui-filter-pill.quality-text-1.is-active { background: #cfc0a6; border-color: #8f7756; color: #2b1f15 !important; }
.ui-filter-pill.quality-text-2.is-active { background: #b9ca76; border-color: #6d8225; color: #222d04 !important; }
.ui-filter-pill.quality-text-3.is-active { background: #9bc3e2; border-color: #4278a5; color: #0e2c46 !important; }
.ui-filter-pill.quality-text-4.is-active { background: #cfa3d3; border-color: #8c4b94; color: #390f3e !important; }
.ui-filter-pill.quality-text-5.is-active { background: #ecc078; border-color: #b4721e; color: #3c1e00 !important; }
.ui-filter-pill.quality-text-6.is-active { background: #de929b; border-color: #a43b4b; color: #4b0c17 !important; }

/* 暗色模式品质激活态：沉稳温润的实体品质胶囊 + 高对比深色文字 */
.dark-mode .ui-filter-pill.quality-text-1.is-active,
.dark-theme .ui-filter-pill.quality-text-1.is-active {
  background: #b5a284 !important;
  color: #18110a !important;
  border-color: #d6c3a4 !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.dark-mode .ui-filter-pill.quality-text-2.is-active,
.dark-theme .ui-filter-pill.quality-text-2.is-active {
  background: #8ea836 !important;
  color: #121c05 !important;
  border-color: #b4cf52 !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.dark-mode .ui-filter-pill.quality-text-3.is-active,
.dark-theme .ui-filter-pill.quality-text-3.is-active {
  background: #5596cc !important;
  color: #071a2e !important;
  border-color: #83b8e6 !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.dark-mode .ui-filter-pill.quality-text-4.is-active,
.dark-theme .ui-filter-pill.quality-text-4.is-active {
  background: #b66ebd !important;
  color: #1f0722 !important;
  border-color: #d796de !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.dark-mode .ui-filter-pill.quality-text-5.is-active,
.dark-theme .ui-filter-pill.quality-text-5.is-active {
  background: #d89542 !important;
  color: #261300 !important;
  border-color: #f0bc72 !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.dark-mode .ui-filter-pill.quality-text-6.is-active,
.dark-theme .ui-filter-pill.quality-text-6.is-active {
  background: #c74f64 !important;
  color: #fff1f4 !important;
  border-color: #e67d90 !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.ui-filter-pill.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(1);
  box-shadow: none;
  border-color: var(--border-faint, rgba(143, 115, 81, 0.18));
}
</style>
