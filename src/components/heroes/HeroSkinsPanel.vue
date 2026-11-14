<template>
  <div class="hero-skins-panel">
    <UiSection title="角色皮肤">
      <div class="skin-list">
        <article
          v-for="skin in skins"
          :key="skin.id"
          class="skin-entry paper-panel-solid"
          :class="[skin.quality ? `quality-border-${skin.quality}` : '']"
        >
          <!-- 头部：标题、来源、属性加成，以及右侧视图切换器 -->
          <header class="skin-entry__header">
            <div class="skin-entry__meta">
              <div class="skin-entry__title-row">
                <h4>{{ skin.name }}</h4>
                <UiTag v-if="skin.from" tone="accent">{{ skin.from }}</UiTag>
              </div>
              <div v-if="skin.attributes?.length" class="skin-entry__attributes">
                <UiTag
                  v-for="attribute in skin.attributes"
                  :key="attribute.key"
                  tone="gold"
                >
                  {{ translateStatName(attribute.key) }} {{ formatAttributeValue(attribute) }}
                </UiTag>
              </div>
            </div>

            <div v-if="skin.modelImage" class="skin-entry__toggle-wrap">
              <UiSegmentedToggle
                :model-value="getSkinTab(skin.id)"
                :options="skinTabOptions"
                aria-label="皮肤展示切换"
                @update:model-value="setSkinTab(skin.id, $event)"
              />
            </div>
          </header>

          <!-- 舞台主体：100% 全宽舞台 -->
          <div class="skin-entry__stage">
            <!-- 完整立绘 -->
            <div
              v-if="getSkinTab(skin.id) === 'portrait'"
              class="skin-stage-pane skin-stage-pane--portrait"
              title="点击查看全屏大图"
              @click="openLightbox(skin)"
            >
              <img
                :src="getImageUrl(`/images/chara/l/${skin.img}.webp`)"
                :alt="`${skin.name}立绘`"
                class="skin-portrait-img"
                loading="lazy"
                @error="handleImageError"
              />
              <div class="skin-zoom-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
                <span>点击查看大图</span>
              </div>
            </div>

            <!-- 战斗模型 -->
            <div
              v-else-if="getSkinTab(skin.id) === 'model' && skin.modelImage"
              class="skin-stage-pane skin-stage-pane--model"
            >
              <div class="skin-model-figure">
                <img
                  :src="getImageUrl(skin.modelImage)"
                  :alt="`${skin.name}战斗模型`"
                  class="skin-model-img"
                  loading="lazy"
                  decoding="async"
                  @error="handleImageFallback"
                />
                <div class="skin-model-pedestal" aria-hidden="true"></div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </UiSection>

    <UiImageLightbox
      v-model:visible="lightboxVisible"
      :src="lightboxSrc"
      :alt="lightboxAlt"
    />
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { getImageUrl, handleImageFallback } from '../../utils/env.js'
import { translateStatName } from '../../utils/gameMappings.js'
import { UiSection, UiTag, UiSegmentedToggle, UiImageLightbox } from '../ui/index.js'

defineProps({
  skins: { type: Array, default: () => [] }
})

const skinTabOptions = [
  { value: 'portrait', label: '完整立绘' },
  { value: 'model', label: '战斗模型' }
]

const activeSkinTabs = reactive({})
const getSkinTab = (skinId) => activeSkinTabs[skinId] || 'portrait'
const setSkinTab = (skinId, tab) => {
  activeSkinTabs[skinId] = tab
}

const lightboxVisible = ref(false)
const lightboxSrc = ref('')
const lightboxAlt = ref('')

const openLightbox = (skin) => {
  if (skin?.img) {
    lightboxSrc.value = getImageUrl(`/images/chara/l/${skin.img}.webp`)
    lightboxAlt.value = skin.name ? `${skin.name}立绘` : '皮肤立绘'
    lightboxVisible.value = true
  }
}

const formatAttributeValue = attribute => {
  const values = []
  if (attribute.baseValue) values.push(`+${attribute.baseValue}`)
  if (attribute.percent) {
    const percent = Math.abs(attribute.percent) <= 1 ? attribute.percent * 100 : attribute.percent
    values.push(`+${Number(percent.toFixed(2))}%`)
  }
  return values.join(' / ')
}

const handleImageError = event => {
  event.target.style.display = 'none'
}
</script>

<style scoped>
.hero-skins-panel {
  padding-bottom: 24px;
}

.skin-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skin-entry {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-width: 1px;
  border-style: solid;
  border-radius: 6px;
  background: var(--paper-soft, #f4ede0);
}

.skin-entry__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-faint, rgba(143, 115, 81, 0.22));
  background: rgba(122, 154, 153, 0.05);
}

.skin-entry__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  min-width: 0;
}

.skin-entry__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.skin-entry__title-row h4 {
  margin: 0;
  color: var(--text-main, #3e2a14);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}

.skin-entry__attributes {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.skin-entry__toggle-wrap {
  flex-shrink: 0;
  margin-left: auto;
}

.skin-entry__stage {
  width: 100%;
  min-height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: rgba(122, 154, 153, 0.06);
  overflow: hidden;
}

.skin-stage-pane {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  position: relative;
}

.skin-stage-pane--portrait {
  height: 440px;
  cursor: zoom-in;
  user-select: none;
}

.skin-portrait-img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 4px 10px rgba(43, 31, 21, 0.3));
  transition: transform 0.2s ease;
}

.skin-stage-pane--portrait:hover .skin-portrait-img {
  transform: scale(1.015);
}

.skin-zoom-badge {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #6b5134);
  background: var(--paper-soft, rgba(244, 237, 224, 0.9));
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.3));
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  pointer-events: none;
  transition: all 0.2s ease;
}

.skin-stage-pane--portrait:hover .skin-zoom-badge {
  color: var(--accent-ink, #2d5a57);
  border-color: var(--accent, #7a9a99);
}

.dark-mode .skin-zoom-badge {
  background: rgba(35, 26, 17, 0.85);
  color: var(--text-muted);
}

.skin-stage-pane--model {
  align-items: center;
  justify-content: center;
  height: 440px;
  padding: 24px;
}

.skin-model-figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.skin-model-img {
  display: block;
  width: auto;
  max-width: min(100%, 280px);
  height: 300px;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 6px 12px rgba(43, 31, 21, 0.25));
}

.skin-model-pedestal {
  width: 130px;
  height: 14px;
  margin-top: -6px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(43, 31, 21, 0.32) 0%, rgba(43, 31, 21, 0) 72%);
  pointer-events: none;
}

/* 手机端深度适配 */
@media (max-width: 560px) {
  .skin-entry__header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 10px 12px;
  }

  .skin-entry__meta {
    justify-content: space-between;
    gap: 8px;
  }

  .skin-entry__toggle-wrap {
    margin-left: 0;
    align-self: flex-end;
  }

  .skin-entry__stage {
    min-height: 320px;
  }

  .skin-stage-pane--portrait {
    height: 350px;
  }

  .skin-stage-pane--model {
    height: 350px;
    padding: 16px;
  }

  .skin-model-img {
    height: 250px;
    max-width: 240px;
  }
}
</style>
