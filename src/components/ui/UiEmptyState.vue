<template>
  <div
    class="ui-empty-state"
    :class="[
      `ui-empty-state--${type}`,
      {
        'ui-empty-state--card': isCardMode,
        'paper-panel': isCardMode,
        'corner-nails': isCardMode
      }
    ]"
  >
    <!-- 加载中 Spinner -->
    <span v-if="type === 'loading'" class="ui-empty-state__spinner" aria-hidden="true"></span>

    <!-- 错误状态：羊皮纸印章警示徽记 -->
    <div v-else-if="type === 'error'" class="ui-empty-state__error-badge" aria-hidden="true">
      <span class="ui-empty-state__badge-icon">!</span>
    </div>

    <!-- 空状态：羊皮纸经典星芒 -->
    <span v-else class="ui-empty-state__ornament" aria-hidden="true">✦</span>

    <!-- 标题（错误状态或显式传入时） -->
    <h3 v-if="displayTitle" class="ui-empty-state__title">{{ displayTitle }}</h3>

    <!-- 提示正文 -->
    <p class="ui-empty-state__text">{{ displayText }}</p>

    <!-- 原始技术详情（弱化展示，防粗糙裸露） -->
    <p v-if="technicalDetail" class="ui-empty-state__tech-detail" :title="technicalDetail">
      {{ technicalDetail }}
    </p>

    <!-- 动作区：支持具名插槽或自动重试按钮 -->
    <div v-if="$slots.action || canRetry" class="ui-empty-state__action">
      <slot name="action">
        <UiButton
          v-if="canRetry"
          variant="primary"
          size="md"
          @click="emit('retry')"
        >
          {{ retryText }}
        </UiButton>
      </slot>
    </div>
  </div>
</template>

<script setup>
import { computed, useAttrs } from 'vue'
import UiButton from './UiButton.vue'

/**
 * UiEmptyState —— 空/加载/错误状态
 * 支持羊皮纸卡片形态、错误文案智能友好化与一键重试。
 * type: empty | loading | error
 */
const props = defineProps({
  text: { type: String, default: '暂无数据' },
  type: { type: String, default: 'empty' },
  title: { type: String, default: '' },
  retryText: { type: String, default: '重试' },
  card: { type: Boolean, default: null },
  retryable: { type: Boolean, default: null }
})

const emit = defineEmits(['retry'])
const attrs = useAttrs()

/** 默认在 error 模式下呈现带边框底板的羊皮纸警示卡片，避免悬空在地图复杂纹理上 */
const isCardMode = computed(() => {
  if (props.card !== null) return props.card
  return props.type === 'error'
})

const canRetry = computed(() => {
  if (props.retryable !== null) return props.retryable
  return Boolean(attrs.onRetry)
})

/** 智能清洗原始技术报错（如 Failed to fetch / NetworkError），杜绝生硬英文直接暴露 */
const parsedText = computed(() => {
  const raw = props.text || ''
  const isNetworkFetchError = /Failed to fetch|NetworkError|Load failed|Failed to load resource/i.test(raw)

  if (isNetworkFetchError) {
    return {
      text: '网络连接出现波动，未能载入数据，请稍后重试',
      tech: raw
    }
  }

  return {
    text: raw,
    tech: ''
  }
})

const displayText = computed(() => parsedText.value.text)
const technicalDetail = computed(() => parsedText.value.tech)

const displayTitle = computed(() => {
  if (props.title) return props.title
  if (props.type === 'error') return '数据装配未完成'
  return ''
})
</script>

<style scoped>
.ui-empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  gap: 10px;
  color: var(--text-faint, #8a6d4d);
  text-align: center;
  box-sizing: border-box;
}

/* 错误卡片形态：羊皮纸面板底衬，自带边框、阴影与四角铆钉 */
.ui-empty-state--card {
  width: 100%;
  max-width: 520px;
  margin: 32px auto;
  padding: 36px 28px;
  background-color: rgba(223, 206, 179, 0.94);
  border: 2px solid var(--border-color);
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.35), inset 0 0 20px rgba(135, 107, 72, 0.12);
  border-radius: 4px;
}

.dark-mode .ui-empty-state--card {
  background-color: rgba(46, 34, 23, 0.92);
}

.ui-empty-state__ornament {
  font-size: 26px;
  color: var(--border-color, #8f7351);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  line-height: 1;
}

.ui-empty-state__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  letter-spacing: 0.5px;
}

.dark-mode .ui-empty-state__title {
  color: #dfceb3;
}

.ui-empty-state__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-muted, #6b5134);
}

.ui-empty-state--empty .ui-empty-state__text {
  font-style: italic;
  color: var(--text-faint, #8a6d4d);
}

.ui-empty-state--error .ui-empty-state__text {
  color: var(--danger, #8b0000);
}

.dark-mode .ui-empty-state--error .ui-empty-state__text {
  color: #e06a6a;
}

.ui-empty-state__tech-detail {
  margin: 0;
  font-size: 12px;
  color: var(--text-faint, #8a6d4d);
  opacity: 0.75;
  font-family: monospace;
  word-break: break-all;
}

/* 错误印章徽章 */
.ui-empty-state__error-badge {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--danger-soft, rgba(139, 0, 0, 0.10));
  border: 2px solid var(--danger, #8b0000);
  box-shadow: inset 0 0 6px rgba(139, 0, 0, 0.2);
  margin-bottom: 4px;
}

.ui-empty-state__badge-icon {
  font-size: 22px;
  font-weight: 900;
  color: var(--danger, #8b0000);
  line-height: 1;
  font-family: var(--font-ui);
}

.dark-mode .ui-empty-state__error-badge {
  border-color: #e06a6a;
  background: rgba(224, 106, 106, 0.15);
}

.dark-mode .ui-empty-state__badge-icon {
  color: #e06a6a;
}

.ui-empty-state__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(85, 117, 116, 0.25);
  border-top-color: var(--accent, #557574);
  border-radius: 50%;
  animation: ui-empty-spin 0.9s linear infinite;
}

@keyframes ui-empty-spin {
  to { transform: rotate(360deg); }
}

.ui-empty-state__action {
  margin-top: 8px;
}
</style>

