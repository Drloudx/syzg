<template>
  <UiModal
    :visible="modelValue"
    title="切换菜单模式"
    max-width="440px"
    teleport-to="body"
    @update:visible="closeModal"
  >
    <p class="mode-desc">请选择导航按钮的显示方式：</p>
    <div class="trigger-options">
      <label class="mode-option mode-option--compact paper-panel-solid" :class="{ active: currentTrigger === 'header' }">
        <input type="radio" value="header" v-model="currentTrigger" />
        <span class="mode-label">顶部直接导航 <UiTag v-if="currentTrigger === 'header'" tone="accent">默认</UiTag></span>
        <span class="mode-tip">搜索框右侧显示「导航」按钮，不遮挡页面</span>
      </label>
      <label class="mode-option mode-option--compact paper-panel-solid" :class="{ active: currentTrigger === 'floating' }">
        <input type="radio" value="floating" v-model="currentTrigger" />
        <span class="mode-label">侧边悬浮球</span>
        <span class="mode-tip">屏幕边缘可拖动快捷球（含回到顶部）</span>
      </label>
    </div>

    <p class="mode-desc mode-desc--next">请选择您喜欢的菜单呼出方式：</p>
    <div class="mode-options">
      <label class="mode-option paper-panel-solid" :class="{ active: currentMode === 'side' }">
        <input type="radio" value="side" v-model="currentMode" />
        <span class="mode-label">侧边导航栏</span>
        <span class="mode-tip">{{ triggerHintPrefix }}后从屏幕右侧显示导航菜单</span>
      </label>
      <label class="mode-option paper-panel-solid" :class="{ active: currentMode === 'bottom' }">
        <input type="radio" value="bottom" v-model="currentMode" />
        <span class="mode-label">底部导航栏 <UiTag v-if="currentMode === 'bottom'" tone="accent">默认</UiTag></span>
        <span class="mode-tip">{{ triggerHintPrefix }}后从屏幕底部显示导航菜单</span>
      </label>
      <label class="mode-option paper-panel-solid" :class="{ active: currentMode === 'top' }">
        <input type="radio" value="top" v-model="currentMode" />
        <span class="mode-label">顶部导航栏</span>
        <span class="mode-tip">{{ triggerHintPrefix }}后从屏幕顶部显示导航菜单</span>
      </label>
    </div>
    <template #footer>
      <UiButton variant="primary" @click="applyMode">确认应用</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { UiModal, UiButton, UiTag } from './ui/index.js'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    // 与 App.vue 的 menuMode 默认值保持一致（bottom）
    default: 'bottom'
  },
  triggerMode: {
    type: String,
    // 与 App.vue 的 navTriggerMode 默认值保持一致（header：顶部直接导航）
    default: 'header'
  }
})

const emit = defineEmits(['update:modelValue', 'update:mode', 'update:triggerMode'])

const currentMode = ref(props.mode)
const currentTrigger = ref(props.triggerMode)
const triggerHintPrefix = computed(() => currentTrigger.value === 'header' ? '点击顶部「导航」按钮' : '点击侧边悬浮按钮')

watch(() => props.mode, (newVal) => {
  currentMode.value = newVal
})
watch(() => props.triggerMode, (newVal) => {
  currentTrigger.value = newVal
})
watch(() => props.modelValue, (open) => {
  if (open) {
    currentMode.value = props.mode
    currentTrigger.value = props.triggerMode
  }
})

const closeModal = () => {
  emit('update:modelValue', false)
}

const applyMode = () => {
  localStorage.setItem('menuMode', currentMode.value)
  localStorage.setItem('navTriggerMode', currentTrigger.value)
  emit('update:mode', currentMode.value)
  emit('update:triggerMode', currentTrigger.value)
  closeModal()
}
</script>

<style scoped>
.mode-desc {
  margin: 0 0 10px;
  font-size: 13.5px;
  color: var(--text-muted, #6b5134);
  font-style: italic;
}
.mode-desc--next {
  margin-top: 16px;
}
.trigger-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.mode-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mode-option {
  display: flex;
  flex-direction: column;
  padding: 11px 13px;
  cursor: pointer;
  transition: all 0.18s;
}
.mode-option--compact {
  padding: 10px 11px;
}
.mode-option--compact .mode-label {
  font-size: 14px;
  flex-wrap: wrap;
  gap: 5px;
}
.mode-option.active {
  border-color: var(--accent-bright, #7a9a99);
  box-shadow: 0 0 0 2px rgba(122, 154, 153, 0.3);
}
.mode-option input {
  display: none;
}
.mode-label {
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 4px;
  color: var(--text-main, #3e2a14);
  display: flex;
  align-items: center;
  gap: 8px;
}
.mode-tip {
  font-size: 12px;
  color: var(--text-muted, #6b5134);
  line-height: 1.45;
}
@media (max-width: 380px) {
  .trigger-options {
    grid-template-columns: 1fr;
  }
}
</style>
