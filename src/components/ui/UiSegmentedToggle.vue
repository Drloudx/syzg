<template>
  <div class="seg-toggle" role="group" :aria-label="ariaLabel">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="seg-btn"
      :class="{ 'is-active': modelValue === opt.value }"
      :title="opt.title || opt.label"
      @click="$emit('update:modelValue', opt.value)"
    >{{ opt.label }}</button>
  </div>
</template>

<script setup>
/**
 * 分段按钮组 —— 与装备图鉴 `/equip` 的「图文模式 / 图标模式」同一套视觉，
 * 但不带图标（纯文字）。
 *
 * 为什么单独抽组件：配队模拟里有两处要这种样式（模式切换、其他开关），
 * 复制两份样式会漂移。
 */
defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  /** [{ value, label, title? }] */
  options: { type: Array, required: true },
  ariaLabel: { type: String, default: '' },
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.seg-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--paper-soft, rgba(0, 0, 0, 0.05));
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 2px;
}

.seg-btn {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: all .15s ease;
  white-space: nowrap;
}

.seg-btn:hover {
  color: var(--accent-ink);
  background: rgba(255, 255, 255, .3);
}

.seg-btn.is-active {
  background: var(--paper-solid, #fff);
  color: var(--accent-ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .08);
}
</style>
