<template>
  <span
    class="ui-tag"
    :class="[
      `ui-tag--${tone}`,
      quality ? `badge-${quality}` : ''
    ]"
    @click="$emit('click')"
  >
    <slot />
  </span>
</template>

<script setup>
/**
 * UiTag —— 小标签/徽章
 * tone: default | accent | danger | gold | wood
 * quality: 1~5 时使用品质徽章色底（白/绿/蓝/紫/橙）
 */
defineProps({
  tone: { type: String, default: 'default' },
  quality: { type: Number, default: 0 }
})
defineEmits(['click'])
</script>

<style scoped>
.ui-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  font-family: var(--font-ui);
}
.ui-tag--default {
  background: rgba(43, 31, 21, 0.12);
  color: var(--text-main, #3e2a14);
  border: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
}
.dark-mode .ui-tag--default,
.dark-theme .ui-tag--default,
.dark-mode .ui-tag--default {
  background: rgba(143, 115, 81, 0.18);
  color: var(--text-main);
  border-color: rgba(143, 115, 81, 0.32);
}

.ui-tag--accent {
  background: rgba(122, 154, 153, 0.2);
  color: var(--accent-ink, #557574);
  border: 1px solid rgba(122, 154, 153, 0.45);
}
.dark-mode .ui-tag--accent,
.dark-theme .ui-tag--accent,
.dark-mode .ui-tag--accent {
  background: rgba(127, 174, 169, 0.18);
  color: var(--accent-bright, #9ec9c5);
  border-color: rgba(127, 174, 169, 0.4);
}

.ui-tag--danger {
  background: var(--danger-soft, rgba(139, 0, 0, 0.1));
  color: var(--danger, #8b0000);
  border: 1px solid rgba(139, 0, 0, 0.3);
}
.dark-mode .ui-tag--danger,
.dark-theme .ui-tag--danger,
.dark-mode .ui-tag--danger {
  background: rgba(226, 90, 90, 0.18);
  color: #f28b82;
  border-color: rgba(226, 90, 90, 0.4);
}

.ui-tag--gold {
  background: rgba(138, 106, 31, 0.18);
  color: var(--gold, #8a6a1f);
  border: 1px solid rgba(138, 106, 31, 0.4);
}
.dark-mode .ui-tag--gold,
.dark-theme .ui-tag--gold,
.dark-mode .ui-tag--gold {
  background: rgba(216, 175, 86, 0.18);
  color: var(--gold, #d8af56);
  border-color: rgba(216, 175, 86, 0.4);
}

.ui-tag--wood {
  background: var(--wood, #2b1f15);
  color: var(--paper, #dfceb3);
  border: 1px solid #17100a;
}
/* 深色木牌：边框同为 1px（与浅色一致），只换颜色 —— 不动盒模型 */
.dark-mode .ui-tag--wood,
.dark-theme .ui-tag--wood {
  background: rgba(56, 41, 27, 0.92) !important;
  color: #f0e2cd !important;
  border: 1px solid rgba(168, 132, 82, 0.45) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.ui-tag--muted {
  background: rgba(107, 81, 52, 0.08);
  color: var(--text-muted, #6b5134);
  border: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
}
.dark-mode .ui-tag--muted,
.dark-theme .ui-tag--muted,
.dark-mode .ui-tag--muted {
  background: rgba(143, 115, 81, 0.14);
  color: var(--text-muted);
  border-color: rgba(143, 115, 81, 0.28);
}

/* 品质徽章：浅色品质底 + 同品质文字/边框，避免白字压在浅色原色上。 */
.ui-tag.badge-1 { background: var(--quality-label-bg) !important; color: var(--q1-text) !important; border-color: var(--q1) !important; }
.ui-tag.badge-2 { background: var(--quality-label-bg) !important; color: var(--q2-text) !important; border-color: var(--q2) !important; }
.ui-tag.badge-3 { background: var(--quality-label-bg) !important; color: var(--q3-text) !important; border-color: var(--q3) !important; }
.ui-tag.badge-4 { background: var(--quality-label-bg) !important; color: var(--q4-text) !important; border-color: var(--q4) !important; }
.ui-tag.badge-5 { background: var(--quality-label-bg) !important; color: var(--q5-text) !important; border-color: var(--q5) !important; }
</style>
