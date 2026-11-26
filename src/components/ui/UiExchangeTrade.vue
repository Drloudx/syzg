<template>
  <article class="ui-exchange-trade" :class="{ 'is-pack': isPackCard, 'is-daily': daily, 'is-skin': skin, 'is-shop': shop, 'is-compact': compact, 'has-details': compact && (metaText || consumeItems.length > 1 || rewardItems.length > 1) }"
    :style="cardStyle">
    <div v-if="isPackCard" class="ui-exchange-trade__pack-visual">
      <img v-if="packImage && !packImgFailed" :src="packImage" :alt="title" @error="hidePackImage" />
      <div v-else class="ui-exchange-trade__pack-collage" aria-hidden="true">
        <img
          v-for="(item, index) in rewardItems.slice(0, 4)"
          :key="`collage-${item.typeId || index}`"
          :src="imageSrc(item.icon)"
          :alt="item.name || '物品'"
          @error="handleItemError"
        />
      </div>
    </div>

    <header class="ui-exchange-trade__header">
      <h3 class="ui-exchange-trade__title" :title="skin ? skin.heroName : cardTitle">{{ skin ? skin.heroName : cardTitle }}</h3>
      <span v-if="limitText && !skin" class="ui-exchange-trade__limit"
        :style="shop ? { backgroundImage: `url('${imageSrc('/PackPane/shop_tag_quota.webp')}')` } : null">{{ limitText }}</span>
    </header>

    <button v-if="skin" type="button" class="ui-exchange-trade__skin-visual"
      :aria-label="`查看${skin.heroName}时装：${skin.name}`"
      @click="emit('item-click', rewardItems[0]?.typeId)">
      <span class="ui-exchange-trade__skin-art">
        <img :src="imageSrc(skin.image) || '/ui/visibility-off.svg'" :alt="skin.name"
          width="172" height="256" loading="lazy" decoding="async" @error="handleImageFallback" />
      </span>
      <span class="ui-exchange-trade__skin-caption">
        <span class="ui-exchange-trade__skin-name">{{ skin.name }}</span>
        <span class="ui-exchange-trade__skin-hero">{{ skin.heroName }}</span>
      </span>
    </button>

    <p v-if="metaText && !daily" class="ui-exchange-trade__meta">{{ metaText }}</p>

    <div v-if="!skin" class="ui-exchange-trade__reward-stage">
      <div class="ui-exchange-trade__items ui-exchange-trade__items--reward">
        <button
          v-for="(item, index) in rewardItems"
          :key="`reward-${item.typeId || index}`"
          type="button"
          class="ui-exchange-trade__item ui-exchange-trade__item--reward"
          :title="`${item.name || '物品'} ×${item.num ?? 1}`"
          @click="emit('item-click', item.typeId)"
        >
          <UiItemCard
            v-if="daily"
            :name="item.name || '物品'"
            :img="imageSrc(item.icon)"
            :quality="item.quality"
            :show-name="false"
          />
          <img v-else :src="imageSrc(item.icon)" :alt="item.name || '物品'"
            :style="compact ? { '--exchange-icon-scale': compactIconScale(item.icon) } : null"
            @error="handleItemError" />
          <span v-if="isPackCard || daily" class="ui-exchange-trade__pack-item-name">{{ item.name || '物品' }}</span>
          <span v-if="!shop && !compact" class="ui-exchange-trade__item-count">{{ `×${item.num ?? 1}` }}</span>
        </button>
        <span v-if="!rewardItems.length" class="ui-exchange-trade__empty">暂无</span>
      </div>
    </div>

    <footer class="ui-exchange-trade__consume-footer">
      <template v-if="daily">
        <p v-if="metaText" class="ui-exchange-trade__meta">{{ metaText }}</p>
        <span class="ui-exchange-trade__pack-summary">每日免费领取</span>
      </template>
      <template v-else>
        <span v-if="!skin && !shop && !compact && !isPackCard" class="ui-exchange-trade__label">消耗</span>
        <div v-if="isPackCard && priceText" class="ui-exchange-trade__items ui-exchange-trade__items--consume">
          <span class="ui-exchange-trade__price-pill">{{ priceText }}</span>
        </div>
        <div v-else class="ui-exchange-trade__items ui-exchange-trade__items--consume">
          <button
            v-for="(item, index) in consumeItems"
            :key="`consume-${item.typeId || index}`"
            type="button"
            class="ui-exchange-trade__item ui-exchange-trade__item--consume"
            :title="`${item.name || '物品'} ×${item.num ?? 1}`"
            @click="emit('item-click', item.typeId)"
          >
            <img :src="imageSrc(item.icon)" :alt="item.name || '物品'" @error="handleItemError" />
            <span v-if="skin || isPackCard" class="ui-exchange-trade__item-count">{{ `${item.name || '消耗'} ×${item.num ?? 1}` }}</span>
            <span v-else class="ui-exchange-trade__item-count">{{ shop || compact ? (item.num ?? 1) : `×${item.num ?? 1}` }}</span>
          </button>
          <span v-if="!consumeItems.length" class="ui-exchange-trade__empty">无需消耗</span>
        </div>
        <span v-if="isPackCard && rewardItems.length" class="ui-exchange-trade__pack-summary">{{ priceText ? '直购礼包' : '礼包内容' }} · {{ rewardItems.length }} 项</span>
        <span v-if="skin && limitText" class="ui-exchange-trade__skin-limit">{{ limitText }}</span>
      </template>
    </footer>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import UiItemCard from './UiItemCard.vue'
import { getImageUrl, handleImageFallback } from '../../utils/env.js'

const props = defineProps({
  title: { type: String, default: '兑换物品' },
  rewardItems: { type: Array, default: () => [] },
  consumeItems: { type: Array, default: () => [] },
  priceText: { type: String, default: '' },
  limitText: { type: String, default: '' },
  metaText: { type: String, default: '' },
  packImage: { type: String, default: '' },
  pack: { type: Boolean, default: false },
  daily: { type: Boolean, default: false },
  skin: { type: Object, default: null },
  shop: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})

const emit = defineEmits(['item-click'])

const packImgFailed = ref(false)
watch(() => props.packImage, () => { packImgFailed.value = false })
const isPackCard = computed(() => props.pack || Boolean(props.packImage))

const imageSrc = (path) => getImageUrl(path)

// 原图 alpha > 24 的可见包围盒测量：目标占原画布 84%，缩放限制在 0.9~1.14。
// 大部分图标接近满幅，统一留出 10%；这里只记录透明留白较多的例外，不改动原图。
const compactIconScaleOverrides = {
  item_20004: 0.97, item_10045: 1.06, item_27008: 0.92, item_27003: 0.99,
  item_27009: 0.92, item_20016: 0.92, item_10047: 1.14, item_10108: 1.14,
  item_10110: 0.92, item_10114: 0.92, item_10116: 1.1, item_10043: 0.92,
  item_10044: 0.92, item_10046: 0.92, item_10048: 0.95, item_10104: 0.92,
  item_10113: 1.14, item_10115: 1.14, item_30014: 0.93, item_30004: 0.98,
  item_30013: 0.94, item_30016: 0.95, item_31004: 1.02, item_31007: 0.97,
  item_31010: 0.93, item_30015: 0.97, item_31002: 1.01, item_31003: 1.04,
  item_31008: 0.99, item_30001: 1.14, item_31001: 1.05, item_20027: 0.97,
  item_00002: 0.92, item_00008: 0.97, item_19207: 1, item_27004: 1
}
// overrides 的键是物品 id（无扩展名）；图片已统一为 .webp，故剥掉任意图片扩展名再查表
const compactIconScale = icon => compactIconScaleOverrides[icon?.split('/').pop()?.replace(/\.(?:png|jpe?g|webp)$/i, '')] ?? 0.9

const cardTitle = computed(() => {
  if (!props.compact || !props.rewardItems.length) return props.title
  if (props.rewardItems.length > 1) {
    return props.rewardItems.map(item => `${item.name || '物品'}×${item.num ?? 1}`).join('、')
  }
  const suffix = `×${props.rewardItems[0].num ?? 1}`
  return props.title.endsWith(suffix) ? props.title : `${props.title}${suffix}`
})

const cardStyle = computed(() => {
  if (props.skin) return null
  if (!props.shop) return null
  const quality = Math.min(5, Math.max(1, Number(props.rewardItems[0]?.quality) || 1))
  return {
    borderImageSource: `url('${imageSrc('/PackPane/shop_list_pack.webp')}')`,
    '--shop-quality-image': `url('${imageSrc(`/Shop/item_info_f_${quality}.webp`)}')`
  }
})

const handleItemError = (event) => {
  event.target.style.opacity = '0.25'
}

const hidePackImage = () => {
  packImgFailed.value = true
}
</script>

<style scoped>
.ui-exchange-trade {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  height: 100%;
  min-width: 0;
  min-height: 224px;
  padding: 11px 12px 10px;
  box-sizing: border-box;
  background: #e8dac1;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.34));
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(62, 42, 20, 0.08);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}
.dark-mode .ui-exchange-trade,
.dark-theme .ui-exchange-trade {
  background: #34271b;
  border-color: var(--border-soft, rgba(164, 126, 78, 0.34));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
}
.ui-exchange-trade__pack-visual {
  width: 100%;
  min-width: 0;
  height: 60px;
  padding: 0 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-faint);
}
.ui-exchange-trade__pack-visual img {
  display: block;
  width: 100%;
  height: 54px;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px rgba(43, 31, 21, 0.24));
}
.ui-exchange-trade__header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding-bottom: 8px;
}
.ui-exchange-trade__meta {
  min-height: 2.8em;
  margin: -2px 0 7px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  text-align: left;
}
.ui-exchange-trade__title {
  display: -webkit-box;
  min-width: 0;
  flex: 1;
  min-height: 2.7em;
  margin: 0;
  color: var(--text-main);
  font-size: 15px;
  line-height: 1.35;
  font-weight: 700;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}
.ui-exchange-trade__limit {
  flex: 0 0 auto;
  max-width: 84px;
  padding: 3px 6px;
  color: var(--accent-ink);
  background: var(--hover-bg);
  border: 1px solid var(--accent-bright);
  border-radius: 4px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}
.ui-exchange-trade__reward-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 88px;
  padding: 9px 0;
  background: rgba(255, 255, 255, 0.08);
  border-top: 1px solid var(--border-faint);
  border-bottom: 1px solid var(--border-faint);
}
.ui-exchange-trade__consume-footer {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  padding-top: 8px;
}
.ui-exchange-trade__label {
  flex: 0 0 30px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
}
.ui-exchange-trade__items {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
}
.ui-exchange-trade__items--reward {
  justify-content: center;
  flex-wrap: wrap;
}
.ui-exchange-trade__items--consume {
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  overflow: visible;
}
.ui-exchange-trade__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  padding: 3px 6px 3px 3px;
  color: var(--text-main);
  background: var(--paper);
  border: 1px solid var(--border-faint);
  border-radius: 4px;
  font: inherit;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}
.ui-exchange-trade__item:hover,
.ui-exchange-trade__item:focus-visible {
  border-color: var(--accent-bright);
  background: var(--hover-bg);
  outline: none;
}
.ui-exchange-trade__item img {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  object-fit: contain;
}
.ui-exchange-trade__item--reward {
  position: relative;
  width: 108px;
  min-height: 68px;
  justify-content: center;
  padding: 4px;
  background: var(--paper-solid);
}
.ui-exchange-trade__item--reward img {
  width: 48px;
  height: 48px;
  flex-basis: 48px;
}
.ui-exchange-trade__item--reward .ui-exchange-trade__item-count {
  position: absolute;
  right: 5px;
  bottom: 4px;
  padding: 2px 4px;
  border: 1px solid var(--border-faint);
  border-radius: 999px;
  background: var(--paper);
  font-size: 12px;
}
.ui-exchange-trade__item--consume {
  min-width: 64px;
  justify-content: center;
  padding: 3px 6px 3px 4px;
}
.ui-exchange-trade__item--consume img {
  width: 24px;
  height: 24px;
  flex-basis: 24px;
}
.ui-exchange-trade__item-count {
  flex: 0 0 auto;
  color: var(--accent-ink);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.ui-exchange-trade__empty {
  color: var(--text-faint);
  font-size: 13px;
  font-style: italic;
}

/* 两类商品共用尺寸、内边距占位与图标容器，背景仅由各自变体决定。 */
.ui-exchange-trade:is(.is-compact, .is-shop) {
  display: grid;
  grid-template-rows: 42px auto minmax(0, 1fr) minmax(30px, max-content);
  height: auto;
  min-height: 0;
  aspect-ratio: 3 / 4;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__header {
  grid-row: 1;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 0;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__title {
  display: block;
  flex: 0 0 auto;
  min-height: 0;
  padding: 0 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 22px;
  text-align: center;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__reward-stage {
  grid-row: 3;
  min-height: 0;
  padding: 2px 8px 8px;
  background: transparent;
  border: 0;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__items--reward {
  height: 100%;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__item--reward {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__item--reward img {
  position: absolute;
  width: 100%;
  height: 100%;
  max-width: 116px;
  max-height: 116px;
  object-fit: contain;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__consume-footer {
  grid-row: 4;
  min-height: 0;
  padding: 0;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__items--consume {
  justify-content: center;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__item--consume {
  min-width: 0;
  padding: 0;
  gap: 3px;
  border: 0;
  background: transparent;
}
.ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__item--consume .ui-exchange-trade__item-count {
  font-size: 19px;
  font-weight: 400;
}
.ui-exchange-trade.is-compact {
  /* 1px 羊皮纸边框 + 5px 留白，与商店的 6px 边框占位相同。 */
  padding: 5px;
  grid-template-rows: 42px auto minmax(0, 1fr) minmax(24px, max-content);
}
.ui-exchange-trade.is-compact .ui-exchange-trade__header { gap: 4px; }
.ui-exchange-trade.is-compact .ui-exchange-trade__title {
  height: 20px;
  line-height: 20px;
}
.ui-exchange-trade.is-compact .ui-exchange-trade__limit {
  align-self: flex-end;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0 4px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--text-muted) 4%, transparent);
  border-color: color-mix(in srgb, var(--border-faint) 45%, transparent);
  border-radius: 3px;
  font-size: 11px;
  font-weight: 400;
  line-height: 15px;
}
.ui-exchange-trade.is-compact .ui-exchange-trade__meta {
  grid-row: 2;
  min-height: 0;
  margin: 0 0 4px;
  text-align: center;
  overflow-wrap: anywhere;
}
.ui-exchange-trade.is-compact.has-details {
  /* 有规则说明或多材料时增加实际内容空间，不裁掉数据或挤没图标。 */
  grid-template-rows: 42px max-content minmax(64px, 1fr) minmax(24px, max-content);
}
.ui-exchange-trade.is-compact.has-details .ui-exchange-trade__items--reward {
  flex-wrap: nowrap;
}
.ui-exchange-trade.is-compact.has-details .ui-exchange-trade__item--reward {
  flex: 1 1 0;
}
.ui-exchange-trade.is-compact .ui-exchange-trade__reward-stage {
  padding: 3px 6px 6px;
  box-shadow: inset 0 -1px color-mix(in srgb, var(--border-faint) 50%, transparent);
}
.ui-exchange-trade.is-compact .ui-exchange-trade__item--reward img {
  transform: scale(var(--exchange-icon-scale, 0.9));
}
.ui-exchange-trade.is-compact .ui-exchange-trade__item--consume img {
  width: 20px;
  height: 20px;
  flex-basis: 20px;
}
.ui-exchange-trade.is-compact .ui-exchange-trade__item--consume .ui-exchange-trade__item-count {
  color: var(--text-main);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.ui-exchange-trade.is-compact .ui-exchange-trade__item {
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.ui-exchange-trade.is-compact .ui-exchange-trade__item:focus-visible {
  outline: 2px solid var(--accent-bright);
  outline-offset: 2px;
}

/* PackCenterTempUI 商品卡：原版纸卡 + 品质渐变 + 大图标 + 底部价格。 */
.ui-exchange-trade.is-shop {
  position: relative;
  isolation: isolate;
  padding: 0;
  border: 6px solid transparent;
  border-image-slice: 60 40 fill;
  border-image-width: 45px 30px;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.ui-exchange-trade.is-shop::before {
  content: '';
  position: absolute;
  inset: 26px 0 30px;
  z-index: -1;
  background: var(--shop-quality-image) center / 100% 100% no-repeat;
  pointer-events: none;
}
.ui-exchange-trade.is-shop .ui-exchange-trade__header {
  position: relative;
}
.ui-exchange-trade.is-shop .ui-exchange-trade__title {
  color: var(--wood-soft);
}
.ui-exchange-trade.is-shop .ui-exchange-trade__limit {
  align-self: flex-end;
  width: max-content;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0 5px 0 22px;
  border: 0;
  border-radius: 0;
  background-color: transparent;
  background-size: 100% 100%;
  color: var(--on-image-text);
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
}
.ui-exchange-trade.is-shop .ui-exchange-trade__item--consume .ui-exchange-trade__item-count {
  color: var(--on-wood-text);
}
.ui-exchange-trade.is-shop .ui-exchange-trade__item:focus-visible {
  outline: 2px solid var(--accent-bright);
  outline-offset: -2px;
}

/* 时装商店：沿用游戏干净竖版立绘卡，外框与底部价格/限购角标统一到全站暖纸卡面。 */
.ui-exchange-trade.is-skin {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 6px;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.34));
  border-radius: 8px;
  overflow: hidden;
  background: #e8dac1;
  box-shadow: 0 2px 6px rgba(62, 42, 20, 0.08);
}
.dark-mode .ui-exchange-trade.is-skin,
.dark-theme .ui-exchange-trade.is-skin {
  background: #34271b;
  border-color: var(--border-soft, rgba(164, 126, 78, 0.34));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
}
.ui-exchange-trade.is-skin .ui-exchange-trade__header {
  display: none;
}
.ui-exchange-trade__skin-visual {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 7px;
  position: relative;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ui-exchange-trade__skin-visual:focus-visible {
  outline: 2px solid var(--accent-bright);
  outline-offset: 2px;
}
.ui-exchange-trade__skin-art {
  display: block;
  width: 100%;
  border-radius: 5px;
  overflow: hidden;
}
.ui-exchange-trade__skin-art img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 172 / 256;
  object-fit: contain;
}
.ui-exchange-trade__skin-caption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 2px 6px;
  padding: 0 2px;
  min-width: 0;
}
.ui-exchange-trade__skin-name {
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-main, #3e2816);
  min-width: 0;
}
.ui-exchange-trade__skin-hero {
  flex: 0 0 auto;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--text-sub, #786048);
  white-space: nowrap;
}
.ui-exchange-trade.is-skin .ui-exchange-trade__consume-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
  min-height: 0;
  padding: 7px 2px 1px;
  margin: 0;
  background: transparent;
  border: 0;
  box-sizing: border-box;
}
.ui-exchange-trade.is-skin .ui-exchange-trade__items--consume {
  flex: 0 1 auto;
  justify-content: flex-start;
}
.ui-exchange-trade.is-skin .ui-exchange-trade__item--consume {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: auto;
  min-width: 0;
  min-height: 0;
  padding: 2px 7px 2px 5px;
  border-radius: 999px;
  border: 1px solid var(--ui-shop-cost-border, rgba(139, 90, 43, 0.18));
  background: var(--ui-shop-cost-bg, rgba(139, 90, 43, 0.11));
  transition: background-color 0.14s ease, border-color 0.14s ease;
}
.ui-exchange-trade.is-skin .ui-exchange-trade__item--consume::before {
  display: none;
}
.ui-exchange-trade.is-skin .ui-exchange-trade__item--consume:hover,
.ui-exchange-trade.is-skin .ui-exchange-trade__item--consume:focus-visible {
  background: var(--ui-shop-cost-hover-bg, rgba(139, 90, 43, 0.2));
  border-color: var(--ui-shop-cost-hover-border, rgba(139, 90, 43, 0.42));
}
.dark-mode .ui-exchange-trade.is-skin .ui-exchange-trade__item--consume,
.dark-theme .ui-exchange-trade.is-skin .ui-exchange-trade__item--consume {
  border-color: rgba(216, 175, 86, 0.28);
  background: rgba(186, 140, 70, 0.22);
}
.dark-mode .ui-exchange-trade.is-skin .ui-exchange-trade__item--consume:hover,
.dark-mode .ui-exchange-trade.is-skin .ui-exchange-trade__item--consume:focus-visible,
.dark-theme .ui-exchange-trade.is-skin .ui-exchange-trade__item--consume:hover,
.dark-theme .ui-exchange-trade.is-skin .ui-exchange-trade__item--consume:focus-visible {
  background: rgba(202, 152, 78, 0.34);
  border-color: rgba(232, 191, 102, 0.56);
}
.ui-exchange-trade.is-skin .ui-exchange-trade__item--consume img {
  width: 15px;
  height: 15px;
  flex-basis: 15px;
  filter: none;
}
.ui-exchange-trade.is-skin .ui-exchange-trade__item--consume .ui-exchange-trade__item-count {
  color: var(--text-main, #4e3422);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  text-shadow: none;
}
.ui-exchange-trade__skin-limit {
  font-size: 10.5px;
  line-height: 1.25;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--ui-shop-limit-bg, rgba(168, 118, 46, 0.16));
  color: var(--ui-shop-gold-text, #7a4f1d);
  font-weight: 700;
  white-space: nowrap;
}
.dark-mode .ui-exchange-trade__skin-limit,
.dark-theme .ui-exchange-trade__skin-limit {
  background: rgba(212, 166, 86, 0.2);
  color: #e2b86b;
}

/* 礼包商店卡片：统一暖纸表面，顶部标题+限购，左侧封面/2x2拼图，右侧可点物品芯片，底部价格/消耗 */
.ui-exchange-trade.is-pack {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  grid-template-rows: auto minmax(92px, 1fr) auto;
  column-gap: 11px;
  row-gap: 8px;
  align-items: stretch;
  min-height: 0;
  padding: 10px 12px;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__pack-visual {
  grid-column: 1;
  grid-row: 2;
  width: 96px;
  height: 100%;
  min-height: 92px;
  align-self: stretch;
  padding: 6px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.36);
  border: 1px solid rgba(139, 90, 43, 0.18);
}
.dark-mode .ui-exchange-trade.is-pack .ui-exchange-trade__pack-visual,
.dark-theme .ui-exchange-trade.is-pack .ui-exchange-trade__pack-visual {
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(216, 175, 86, 0.2);
}
.ui-exchange-trade.is-pack .ui-exchange-trade__pack-visual img {
  width: 100%;
  height: 100%;
  max-width: 84px;
  max-height: 96px;
  object-fit: contain;
}
.ui-exchange-trade__pack-collage {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  width: 100%;
  height: 100%;
  place-items: center;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__pack-visual .ui-exchange-trade__pack-collage img {
  width: 30px;
  height: 30px;
  object-fit: contain;
  filter: none;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__header {
  grid-column: 1 / -1;
  grid-row: 1;
  align-items: center;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(139, 90, 43, 0.14);
}
.ui-exchange-trade.is-pack .ui-exchange-trade__title {
  min-height: 0;
  font-size: 14px;
  -webkit-line-clamp: 1;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__limit {
  font-size: 11px;
  line-height: 1.25;
  padding: 2px 7px;
  border: 0;
  border-radius: 4px;
  background: var(--ui-shop-limit-bg, rgba(168, 118, 46, 0.16));
  color: var(--ui-shop-gold-text, #7a4f1d);
  font-weight: 700;
}
.dark-mode .ui-exchange-trade.is-pack .ui-exchange-trade__limit,
.dark-theme .ui-exchange-trade.is-pack .ui-exchange-trade__limit {
  background: rgba(212, 166, 86, 0.2);
  color: #e2b86b;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__meta {
  display: none;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__reward-stage {
  grid-column: 2;
  grid-row: 2;
  min-height: 0;
  align-items: center;
  justify-content: flex-start;
  padding: 0;
  background: transparent;
  border: 0;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__items--reward {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  width: 100%;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__item--reward {
  width: 100%;
  min-width: 0;
  min-height: 0;
  justify-content: flex-start;
  gap: 4px;
  padding: 3px 6px 3px 4px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.34);
  border: 1px solid rgba(139, 90, 43, 0.18);
  overflow: hidden;
}
.dark-mode .ui-exchange-trade.is-pack .ui-exchange-trade__item--reward,
.dark-theme .ui-exchange-trade.is-pack .ui-exchange-trade__item--reward {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(216, 175, 86, 0.22);
}
.ui-exchange-trade.is-pack .ui-exchange-trade__item--reward:hover,
.ui-exchange-trade.is-pack .ui-exchange-trade__item--reward:focus-visible {
  background: rgba(139, 90, 43, 0.14);
  border-color: var(--accent-bright);
}
.ui-exchange-trade.is-pack .ui-exchange-trade__item--reward img {
  width: 22px;
  height: 22px;
  flex-basis: 22px;
}
.ui-exchange-trade__pack-item-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-main);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__item--reward .ui-exchange-trade__item-count {
  position: static;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ui-shop-gold-text, #7a4f1d);
  font-size: 11.5px;
  font-weight: 700;
}
.dark-mode .ui-exchange-trade.is-pack .ui-exchange-trade__item--reward .ui-exchange-trade__item-count,
.dark-theme .ui-exchange-trade.is-pack .ui-exchange-trade__item--reward .ui-exchange-trade__item-count {
  color: #e2b86b;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__consume-footer {
  grid-column: 1 / -1;
  grid-row: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 7px;
  border-top: 1px solid rgba(139, 90, 43, 0.14);
}
.ui-exchange-trade.is-pack .ui-exchange-trade__item--consume {
  min-width: 0;
  gap: 4px;
  padding: 2px 9px 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--ui-shop-cost-border, rgba(139, 90, 43, 0.18));
  background: var(--ui-shop-cost-bg, rgba(139, 90, 43, 0.11));
}
.ui-exchange-trade.is-pack .ui-exchange-trade__item--consume:hover,
.ui-exchange-trade.is-pack .ui-exchange-trade__item--consume:focus-visible {
  background: var(--ui-shop-cost-hover-bg, rgba(139, 90, 43, 0.2));
  border-color: var(--ui-shop-cost-hover-border, rgba(139, 90, 43, 0.42));
}
.dark-mode .ui-exchange-trade.is-pack .ui-exchange-trade__item--consume,
.dark-theme .ui-exchange-trade.is-pack .ui-exchange-trade__item--consume {
  border-color: rgba(216, 175, 86, 0.28);
  background: rgba(186, 140, 70, 0.22);
}
.ui-exchange-trade.is-pack .ui-exchange-trade__item--consume img {
  width: 16px;
  height: 16px;
  flex-basis: 16px;
}
.ui-exchange-trade.is-pack .ui-exchange-trade__item--consume .ui-exchange-trade__item-count {
  color: var(--text-main);
  font-size: 12px;
  font-weight: 600;
}
.ui-exchange-trade__price-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(168, 118, 46, 0.2);
  border: 1px solid rgba(139, 90, 43, 0.32);
  color: #6e3f10;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.dark-mode .ui-exchange-trade__price-pill,
.dark-theme .ui-exchange-trade__price-pill {
  background: rgba(212, 166, 86, 0.24);
  border-color: rgba(232, 191, 102, 0.42);
  color: #f4ce7c;
}
.ui-exchange-trade__pack-summary {
  font-size: 11.5px;
  color: var(--text-sub, #786048);
  white-space: nowrap;
}

/* 每日补给卡片（下午茶 / 晚宴）：去掉留白和蓝框，统一为暖纸卡面 + 品质框物品列表 + 时段底栏 */
.ui-exchange-trade.is-daily {
  min-height: 0;
  padding: 11px 13px;
  gap: 10px;
}
.ui-exchange-trade.is-daily .ui-exchange-trade__header {
  align-items: center;
  padding-bottom: 7px;
  border-bottom: 1px solid rgba(139, 90, 43, 0.14);
}
.ui-exchange-trade.is-daily .ui-exchange-trade__title {
  min-height: 0;
  font-size: 15px;
  -webkit-line-clamp: 1;
}
.ui-exchange-trade.is-daily .ui-exchange-trade__limit {
  font-size: 11px;
  line-height: 1.25;
  padding: 2px 7px;
  border: 0;
  border-radius: 4px;
  background: var(--ui-shop-limit-bg, rgba(168, 118, 46, 0.16));
  color: var(--ui-shop-gold-text, #7a4f1d);
  font-weight: 700;
}
.dark-mode .ui-exchange-trade.is-daily .ui-exchange-trade__limit,
.dark-theme .ui-exchange-trade.is-daily .ui-exchange-trade__limit {
  background: rgba(212, 166, 86, 0.2);
  color: #e2b86b;
}
.ui-exchange-trade.is-daily .ui-exchange-trade__reward-stage {
  flex: 1 0 auto;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  justify-content: flex-start;
}
.ui-exchange-trade.is-daily .ui-exchange-trade__items--reward {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  width: 100%;
}
.ui-exchange-trade.is-daily .ui-exchange-trade__item--reward {
  width: 100%;
  min-width: 0;
  min-height: 0;
  justify-content: flex-start;
  gap: 6px;
  padding: 5px 7px 5px 5px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.34);
  border: 1px solid rgba(139, 90, 43, 0.18);
  overflow: hidden;
}
.dark-mode .ui-exchange-trade.is-daily .ui-exchange-trade__item--reward,
.dark-theme .ui-exchange-trade.is-daily .ui-exchange-trade__item--reward {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(216, 175, 86, 0.22);
}
.ui-exchange-trade.is-daily .ui-exchange-trade__item--reward:hover,
.ui-exchange-trade.is-daily .ui-exchange-trade__item--reward:focus-visible {
  background: rgba(139, 90, 43, 0.14);
  border-color: var(--accent-bright);
}
.ui-exchange-trade.is-daily .ui-exchange-trade__item--reward :deep(.ui-item-card) {
  width: 36px;
  flex-shrink: 0;
  padding: 0;
  pointer-events: none;
}
.ui-exchange-trade.is-daily .ui-exchange-trade__item--reward .ui-exchange-trade__pack-item-name {
  flex: 0 1 auto;
  font-size: 12px;
  font-weight: 700;
}
.ui-exchange-trade.is-daily .ui-exchange-trade__item--reward .ui-exchange-trade__item-count {
  position: static;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ui-shop-gold-text, #7a4f1d);
  font-size: 12px;
  font-weight: 700;
}
.dark-mode .ui-exchange-trade.is-daily .ui-exchange-trade__item--reward .ui-exchange-trade__item-count,
.dark-theme .ui-exchange-trade.is-daily .ui-exchange-trade__item--reward .ui-exchange-trade__item-count {
  color: #e2b86b;
}
.ui-exchange-trade.is-daily .ui-exchange-trade__consume-footer {
  justify-content: space-between;
  padding-top: 7px;
  border-top: 1px solid rgba(139, 90, 43, 0.14);
}
.ui-exchange-trade.is-daily .ui-exchange-trade__meta {
  min-height: 0;
  margin: 0;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--ui-shop-cost-bg, rgba(139, 90, 43, 0.11));
  border: 1px solid var(--ui-shop-cost-border, rgba(139, 90, 43, 0.18));
  color: var(--text-main, #4e3422);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.dark-mode .ui-exchange-trade.is-daily .ui-exchange-trade__meta,
.dark-theme .ui-exchange-trade.is-daily .ui-exchange-trade__meta {
  background: rgba(186, 140, 70, 0.2);
  border-color: rgba(216, 175, 86, 0.28);
  color: var(--text-main);
}
@media (max-width: 640px) {
  .ui-exchange-trade {
    min-height: 208px;
    padding: 9px;
  }
  .ui-exchange-trade__title { font-size: 14px; }
  .ui-exchange-trade:is(.is-compact, .is-shop) {
    grid-template-rows: 26px auto minmax(0, 1fr) minmax(20px, max-content);
  }
  .ui-exchange-trade.is-compact {
    padding: 2px;
    grid-template-rows: 30px auto minmax(0, 1fr) minmax(20px, max-content);
  }
  .ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__title {
    font-size: 9px;
    line-height: 14px;
  }
  .ui-exchange-trade.is-compact .ui-exchange-trade__limit {
    padding: 0 2px;
    font-size: 8px;
    line-height: 12px;
  }
  .ui-exchange-trade.is-compact .ui-exchange-trade__header { gap: 2px; }
  .ui-exchange-trade.is-compact .ui-exchange-trade__title {
    height: 14px;
    line-height: 14px;
  }
  .ui-exchange-trade.is-compact .ui-exchange-trade__meta { font-size: 10px; }
  .ui-exchange-trade.is-compact.has-details {
    grid-template-rows: 30px max-content minmax(40px, 1fr) minmax(20px, max-content);
  }
  .ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__reward-stage {
    padding: 2px 3px 4px;
  }
  .ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__item--consume img {
    width: 16px;
    height: 16px;
    flex-basis: 16px;
  }
  .ui-exchange-trade:is(.is-compact, .is-shop) .ui-exchange-trade__item--consume .ui-exchange-trade__item-count {
    font-size: 13px;
  }
  .ui-exchange-trade.is-compact .ui-exchange-trade__item--consume img {
    width: 14px;
    height: 14px;
    flex-basis: 14px;
  }
  .ui-exchange-trade.is-compact .ui-exchange-trade__item--consume .ui-exchange-trade__item-count { font-size: 12px; }
  .ui-exchange-trade.is-shop {
    padding: 0;
    border-width: 3px;
    border-image-width: 25px 16px;
  }
  .ui-exchange-trade.is-shop::before { inset: 18px 0 20px; }
  .ui-exchange-trade.is-shop .ui-exchange-trade__limit {
    padding: 0 2px 0 10px;
    font-size: 8px;
    line-height: 12px;
  }
  .ui-exchange-trade.is-skin {
    padding: 5px;
    border-radius: 7px;
  }
  .ui-exchange-trade__skin-visual {
    gap: 5px;
  }
  .ui-exchange-trade__skin-caption {
    gap: 1px 5px;
    padding: 0 1px;
  }
  .ui-exchange-trade__skin-name {
    font-size: 12.5px;
  }
  .ui-exchange-trade__skin-hero {
    font-size: 11px;
  }
  .ui-exchange-trade.is-skin .ui-exchange-trade__consume-footer {
    padding: 6px 1px 1px;
    gap: 4px;
  }
  .ui-exchange-trade.is-skin .ui-exchange-trade__item--consume {
    gap: 4px;
    padding: 2px 7px 2px 5px;
  }
  .ui-exchange-trade.is-skin .ui-exchange-trade__item--consume img {
    width: 15px;
    height: 15px;
    flex-basis: 15px;
  }
  .ui-exchange-trade.is-skin .ui-exchange-trade__item--consume .ui-exchange-trade__item-count {
    font-size: 11px;
  }
  .ui-exchange-trade__skin-limit {
    font-size: 10.5px;
    padding: 2px 6px;
  }
  .ui-exchange-trade__limit { max-width: 72px; }
  .ui-exchange-trade.is-daily {
    min-height: 0;
    padding: 10px 11px;
    gap: 8px;
  }
  .ui-exchange-trade.is-daily .ui-exchange-trade__items--reward {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .ui-exchange-trade.is-daily .ui-exchange-trade__item--reward :deep(.ui-item-card) {
    width: 38px;
  }
  .ui-exchange-trade.is-daily .ui-exchange-trade__item--reward .ui-exchange-trade__pack-item-name {
    font-size: 12px;
  }
  .ui-exchange-trade.is-pack {
    min-height: 0;
    grid-template-columns: 78px minmax(0, 1fr);
    grid-template-rows: auto minmax(78px, 1fr) auto;
    column-gap: 9px;
    row-gap: 7px;
    padding: 9px 10px;
  }
  .ui-exchange-trade.is-pack .ui-exchange-trade__pack-visual {
    width: 78px;
    height: 100%;
    min-height: 78px;
    padding: 5px;
  }
  .ui-exchange-trade.is-pack .ui-exchange-trade__pack-visual img {
    max-width: 68px;
    max-height: 78px;
  }
  .ui-exchange-trade.is-pack .ui-exchange-trade__items--reward {
    grid-template-columns: minmax(0, 1fr);
  }
  .ui-exchange-trade.is-pack .ui-exchange-trade__pack-visual .ui-exchange-trade__pack-collage img {
    width: 25px;
    height: 25px;
  }
  .ui-exchange-trade.is-pack .ui-exchange-trade__item--reward {
    padding: 2px 6px 2px 4px;
  }
  .ui-exchange-trade.is-pack .ui-exchange-trade__item--reward img {
    width: 19px;
    height: 19px;
    flex-basis: 19px;
  }
  .ui-exchange-trade__pack-item-name {
    font-size: 11.5px;
  }
}
</style>
