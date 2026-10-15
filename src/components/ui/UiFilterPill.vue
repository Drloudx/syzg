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

/* 浅色模式品质激活态 */
.ui-filter-pill.quality-text-1.is-active { background: var(--q1); }
.ui-filter-pill.quality-text-2.is-active { background: var(--q2); }
.ui-filter-pill.quality-text-3.is-active { background: var(--q3); }
.ui-filter-pill.quality-text-4.is-active { background: var(--q4); }
.ui-filter-pill.quality-text-5.is-active { background: var(--q5); }
.ui-filter-pill.quality-text-1.is-active,
.ui-filter-pill.quality-text-2.is-active,
.ui-filter-pill.quality-text-3.is-active,
.ui-filter-pill.quality-text-4.is-active,
.ui-filter-pill.quality-text-5.is-active {
  color: #2b1f15 !important;
  border-color: rgba(0, 0, 0, 0.35);
}

/* 暗色模式品质激活态：鲜亮实体品质胶囊芯片 + 清晰深黑粗体文字，告别灰暗与不可读 */
.dark-mode .ui-filter-pill.quality-text-1.is-active,
.dark-theme .ui-filter-pill.quality-text-1.is-active {
  background: #cbb898 !important;
  color: #18110a !important;
  border-color: #dfceb3 !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.dark-mode .ui-filter-pill.quality-text-2.is-active,
.dark-theme .ui-filter-pill.quality-text-2.is-active {
  background: #9ebb28 !important;
  color: #121c05 !important;
  border-color: #c4e43d !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.dark-mode .ui-filter-pill.quality-text-3.is-active,
.dark-theme .ui-filter-pill.quality-text-3.is-active {
  background: #429eed !important;
  color: #06182c !important;
  border-color: #7cc0fc !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.dark-mode .ui-filter-pill.quality-text-4.is-active,
.dark-theme .ui-filter-pill.quality-text-4.is-active {
  background: #d85ee0 !important;
  color: #210524 !important;
  border-color: #f79aff !important;
  font-weight: 700 !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45) !important;
}

.dark-mode .ui-filter-pill.quality-text-5.is-active,
.dark-theme .ui-filter-pill.quality-text-5.is-active {
  background: #f7a028 !important;
  color: #281200 !important;
  border-color: #ffd072 !important;
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
