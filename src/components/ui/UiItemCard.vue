<template>
  <div
    class="ui-item-card"
    :title="name"
    @click="emit('click')"
  >
    <div
      class="ui-item-card__slot"
      :style="{ backgroundImage: `url('${getImageUrl(`/ItemBagPanel/item_f_${getQualityFrame(quality)}.webp`)}')` }"
    >
      <img
        v-if="img && isImgReady"
        :src="img"
        :alt="name"
        class="ui-item-card__icon"
        :class="{ 'is-loaded': isLoaded }"
        loading="lazy"
        decoding="async"
        @load="onImgLoad"
        @error="onImgError"
      />
      <slot name="icon" />
      <div v-if="$slots.extra" class="ui-item-card__badge">
        <slot name="extra" />
      </div>
    </div>
    <div v-if="showName" class="ui-item-card__name" :class="quality ? `quality-text-${quality}` : ''">
      {{ name }}
    </div>
  </div>
</template>

<script setup>
/**
 * UiItemCard —— 图鉴网格卡片
 * 使用游戏原生 ItemBagPanel 背景框（item_f_1 ~ item_f_6.png）
 */
import { ref, watch, inject } from 'vue'
import { getImageUrl } from '../../utils/env'

const props = defineProps({
  name: { type: String, default: '' },
  img: { type: String, default: '' },
  showName: { type: Boolean, default: true },
  quality: { type: [Number, String], default: 0 }
})
const emit = defineEmits(['click', 'img-error'])

// 全局内存缓存：记录所有已在当前会话中成功加载过的图片 URL（防止二次滚动重复延迟）
const loadedImages = (window.__loadedUiItemImages = window.__loadedUiItemImages || new Set())

// 快滑感知（由上层 UiCardGrid / UiVirtualGrid provide 提供）
const isFastScrolling = inject('isFastScrolling', ref(false))

// 初始状态：若已在内存缓存中，或当前不是快速滑动，立刻就绪
const isCached = !!(props.img && loadedImages.has(props.img))
const isImgReady = ref(isCached || !isFastScrolling.value)
const isLoaded = ref(isCached)

const syncImgState = () => {
  if (!props.img) return
  if (loadedImages.has(props.img)) {
    isImgReady.value = true
    isLoaded.value = true
    return
  }
  if (!isFastScrolling.value) {
    isImgReady.value = true
  }
}

watch(() => props.img, () => {
  isLoaded.value = !!(props.img && loadedImages.has(props.img))
  syncImgState()
})

watch(isFastScrolling, (fast) => {
  if (!fast && props.img) {
    isImgReady.value = true
  }
})

const onImgLoad = () => {
  if (props.img) {
    loadedImages.add(props.img)
  }
  isLoaded.value = true
}

const onImgError = (e) => {
  isLoaded.value = true
  emit('img-error', e)
}

const getQualityFrame = (q) => {
  const num = Number(q)
  if (!num || num < 1) return 1
  if (num > 6) return 6
  return Math.floor(num)
}
</script>

<style scoped>
.ui-item-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 2px;
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease;
  box-sizing: border-box;
  min-width: 0;
  background: transparent;
  border: none;
  width: 100%;
  max-width: 86px;
  margin: 0 auto;
}

.ui-item-card:hover {
  transform: translateY(-3px);
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.45));
}

.ui-item-card:active {
  transform: scale(0.96);
}

/* 游戏原生品质背景框（item_f_1 ~ item_f_6.png） */
.ui-item-card__slot {
  width: 100%;
  aspect-ratio: 1 / 1;
  /*
   * `aspect-ratio` 只是**首选**尺寸：内容更高时会被顶开（flex 项 min-height 默认为 auto）。
   * 竖长图（如「庭院柱灯制作图」原图 59×170）会把 slot 从 82×82 撑成 82×161，
   * 于是边框被纵向拉伸、且图标反而更窄（max-height:68% 是相对被撑高的 slot 计算，恶性循环）。
   * 用 min-height:0 取消 auto 下限，让 aspect-ratio 成为硬约束；图标再由 object-fit 缩放适配。
   */
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-size: 100% 100%;
  background-position: center;
  background-repeat: no-repeat;
  position: relative;
  box-sizing: border-box;
}

/* 中间图标微调适中（68% 大小）；宽高同时受限，长图/宽图都按 contain 缩放，不撑开外框 */
.ui-item-card__icon {
  max-width: 68%;
  max-height: 68%;
  width: auto;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45));
  opacity: 0;
  transition: opacity 0.15s ease-out;
}

.ui-item-card__icon.is-loaded {
  opacity: 1;
}

/* 名称底板复用游戏图鉴资源 colect_list_mx.png，避免网页自定义纯色与游戏视觉不一致。 */
.ui-item-card__name {
  margin: 3px auto 0;
  width: calc(100% - 8px);
  box-sizing: border-box;
  background: transparent;
  color: var(--text-main, #382410);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  padding: 1px 2px;
  min-height: 21px;
  border: 4px solid transparent;
  border-image-source: url('/images/Common_Atlas/com_txt_box.webp');
  border-image-slice: 16 fill;
  border-image-width: 4px;
  border-image-outset: 0;
  border-image-repeat: stretch;
  box-shadow: none;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

/* 品质 5（传说/橙金）：自然温润的琥珀橙金色，无描边突兀感，阅读清晰自然 */
.ui-item-card__name.quality-text-5 {
  color: var(--q5-text, #b15d00) !important;
  text-shadow: none !important;
}

/*
 * 物品卡名 · 深色态。
 *
 * 🔴 **两条硬约束：选择器写法 + 盒模型必须与浅色一致。**
 *
 * ── 一、选择器：不能用 `:global(.dark-mode) X` ──
 * 症状：切深色后**整个页面右下位移**（`html` 被加 padding 2px 4px + border 1px，
 * 宽 +10、高 +6）。
 * 原因：`dark-mode` 类加在 **`html`** 上（`useNativeShell.js` 的
 * `document.documentElement.classList.toggle('dark-mode')`），**不在本组件元素上**。
 * `:global(.dark-mode) .ui-item-card__name` 会被编译成两条并列选择器：
 *
 *   .dark-mode, .dark-theme, .dark-mode .ui-item-card__name[data-v-7058cf59] { … }
 *   ↑↑↑ 凭空多出的**裸 `.dark-mode`**，配 `!important` 命中任何带该类的元素
 *       （`html` 与 `.app-container` 都带）→ 页面整体右下移。
 *
 * 正确写法是普通的 `.dark-mode X`（`<style scoped>` 会编译成带 `[data-v-*]` 的
 * 后代选择器，`.dark-mode` 那截保持裸选择器用于匹配祖先 —— 这正是想要的）。
 *
 * ── 二、盒模型：边框宽度与内边距**必须与浅色相同** ──
 * 浅色基线是 `border: 4px solid transparent` + `border-image`（九宫格木框）
 * 与 `padding: 1px 2px`。深色若改成 `border: 1px` + `padding: 2px 4px`，
 * 净高少 4px（−6 边框 +4 内边距）→ 卡片 115px 变 111px →
 * **整片网格上移 4px**（实测第二行 y: 372 → 368）。
 *
 * 所以这里保持 **4px 边框 + 1px 2px 内边距**，只把木框图换成深色底 —— 几何不动。
 *
 * ⚠️ 试过用 `box-shadow: inset 0 0 0 1px` 代替边框做"细描边"，**已撤回**：
 *    `inset` 阴影在圆角元素上会画出一圈生硬的方框，紧贴文字显得多余（用户反馈
 *    「怎么多一个边框」）。深色下**不需要额外描边** —— 深底 + 暖白字本身对比度
 *    就够了，加上去反而是噪声。
 */
.dark-mode .ui-item-card__name,
.dark-theme .ui-item-card__name {
  /* 4px 透明边框 = 浅色同宽（几何不动） */
  border: 4px solid transparent !important;
  border-image: none !important;
  border-radius: 4px !important;
  /* 不加 inset 描边（见上）—— 只保留一层微弱投影让底板与深底分离 */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45) !important;
  background: rgba(26, 18, 11, 0.88) !important;
  color: var(--text-main) !important;
  /* 内边距与浅色一致（1px 2px）—— 改成 2px 4px 会让盒高变，网格上移 */
  padding: 1px 2px !important;
}

.dark-mode .ui-item-card__name.quality-text-5,
.dark-theme .ui-item-card__name.quality-text-5 {
  color: var(--q5, #ffbe5e) !important;
}
.dark-mode .ui-item-card__name.quality-text-4,
.dark-theme .ui-item-card__name.quality-text-4 {
  color: var(--q4, #f377f6) !important;
}
.dark-mode .ui-item-card__name.quality-text-3,
.dark-theme .ui-item-card__name.quality-text-3 {
  color: var(--q3, #56b0ff) !important;
}
.dark-mode .ui-item-card__name.quality-text-2,
.dark-theme .ui-item-card__name.quality-text-2 {
  color: var(--q2, #b5ce44) !important;
}

.ui-item-card__badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
</style>
