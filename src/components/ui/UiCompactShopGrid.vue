<template>
  <div class="ui-compact-shop-grid">
    <div
      v-for="entry in items"
      :key="entry.id"
      :id="entry.domId || undefined"
      :role="entry.rewardItem?.id ? 'button' : undefined"
      :tabindex="entry.rewardItem?.id ? 0 : undefined"
      :aria-disabled="!entry.rewardItem?.id ? 'true' : undefined"
      class="ui-compact-shop-card"
      :class="[cardClass, { 'is-disabled': !entry.rewardItem?.id }]"
      @click="entry.rewardItem?.id && emit('item-click', entry.rewardItem.id)"
      @keydown.enter.self="entry.rewardItem?.id && emit('item-click', entry.rewardItem.id)"
      @keydown.space.self.prevent="entry.rewardItem?.id && emit('item-click', entry.rewardItem.id)"
    >
      <div class="ui-compact-shop-card__icon">
        <UiItemCard
          v-if="entry.rewardItem"
          :name="entry.rewardItem.name"
          :img="rewardIconUrl(entry.rewardItem)"
          :quality="entry.rewardItem.quality"
          :show-name="false"
        />
      </div>
      <div class="ui-compact-shop-card__info">
        <div class="ui-compact-shop-card__head">
          <span class="ui-compact-shop-card__title">{{ formatTitle(entry) }}</span>
          <span
            v-if="entry.limitText"
            class="ui-compact-shop-card__limit"
            :class="{ 'is-unlimited': isEntryUnlimited(entry) }"
          >{{ entry.limitText }}</span>
        </div>
        <div class="ui-compact-shop-card__costs">
          <template v-for="cost in entry.costs || []" :key="`${entry.id}-${cost.id || cost.name}`">
            <button
              v-if="cost.id"
              type="button"
              class="ui-compact-shop-cost is-clickable"
              :class="costClass"
              :title="`查看 ${cost.name} 详情`"
              @click.stop="emit('item-click', cost.id)"
            >
              <span
                v-if="costIconUrl(cost)"
                class="ui-compact-shop-cost__icon"
                :style="{ '--icon-url': cssUrl(costIconUrl(cost)) }"
                aria-hidden="true"
              ></span>
              <span>{{ cost.name }} ×{{ cost.num }}</span>
            </button>
            <span
              v-else
              class="ui-compact-shop-cost"
              :class="costClass"
            >
              <span
                v-if="costIconUrl(cost)"
                class="ui-compact-shop-cost__icon"
                :style="{ '--icon-url': cssUrl(costIconUrl(cost)) }"
                aria-hidden="true"
              ></span>
              <span>{{ cost.name }} ×{{ cost.num }}</span>
            </span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import UiItemCard from './UiItemCard.vue'
import { getImageUrl } from '../../utils/env.js'

defineProps({
  items: { type: Array, default: () => [] },
  cardClass: { type: String, default: '' },
  costClass: { type: String, default: '' }
})

const emit = defineEmits(['item-click'])

const cssUrl = url => (url ? `url(${JSON.stringify(url)})` : 'none')

const resolveIconPath = icon => {
  if (!icon) return ''
  if (/^(https?:)?\//.test(icon) || /\.(webp|png|jpe?g)$/i.test(icon)) return getImageUrl(icon)
  return getImageUrl(`/Common_ItemIcon/${icon}.webp`)
}

const rewardIconUrl = rewardItem => {
  if (rewardItem?.iconUrl) return rewardItem.iconUrl
  return resolveIconPath(rewardItem?.icon)
}

const costIconUrl = cost => {
  if (cost?.iconUrl) return cost.iconUrl
  return resolveIconPath(cost?.icon)
}

const isEntryUnlimited = entry => {
  if (typeof entry?.isUnlimited === 'boolean') return entry.isUnlimited
  if (entry?.limitNum != null) return Number(entry.limitNum) <= 0
  return entry?.limitText === '不限购' || !entry?.limitType
}

const formatTitle = entry => {
  const base = entry?.rewardItem?.name || entry?.name || ''
  const num = Number(entry?.rewardItem?.num)
  return num > 1 ? `${base} ×${num}` : base
}
</script>

<style scoped>
.ui-compact-shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 10px;
}

.ui-compact-shop-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 8px 12px 8px 9px;
  border-radius: 8px;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.34));
  background: var(--ui-shop-card-bg, #e8dac1);
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

.ui-compact-shop-card:hover:not(.is-disabled) {
  transform: translateY(-1px);
  border-color: var(--ui-shop-card-hover-border, rgba(164, 118, 56, 0.65));
  box-shadow: 0 3px 10px rgba(72, 49, 24, 0.12);
}

.ui-compact-shop-card:active:not(.is-disabled) {
  transform: translateY(0);
}

.ui-compact-shop-card:focus-visible {
  outline: 2px solid var(--accent-bright, #7a9a99);
  outline-offset: 1px;
}

.ui-compact-shop-card.is-disabled {
  cursor: default;
}

.ui-compact-shop-card__icon {
  width: 72px;
  flex-shrink: 0;
}

.ui-compact-shop-card__icon :deep(.ui-item-card) {
  padding: 0;
  pointer-events: none;
}

.ui-compact-shop-card__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ui-compact-shop-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ui-compact-shop-card__title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-main, #4e3422);
  font-variant-numeric: tabular-nums;
  min-width: 0;
}

.ui-compact-shop-card__limit {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--ui-shop-limit-bg, rgba(168, 118, 46, 0.16));
  color: var(--ui-shop-gold-text, #7a4f1d);
  font-weight: 700;
  white-space: nowrap;
}

.ui-compact-shop-card__limit.is-unlimited {
  background: var(--ui-shop-limit-muted-bg, rgba(123, 99, 72, 0.1));
  color: var(--text-muted, #7b6348);
  font-weight: 600;
}

.ui-compact-shop-card__costs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--ui-shop-divider, rgba(143, 115, 81, 0.24));
}

.ui-compact-shop-cost {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px 2px 6px;
  margin: 0;
  border-radius: 999px;
  border: 1px solid var(--ui-shop-cost-border, rgba(139, 90, 43, 0.18));
  background: var(--ui-shop-cost-bg, rgba(139, 90, 43, 0.11));
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-main, #4e3422);
  appearance: none;
}

.ui-compact-shop-cost.is-clickable {
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.ui-compact-shop-cost.is-clickable:hover,
.ui-compact-shop-cost.is-clickable:focus-visible {
  border-color: var(--ui-shop-card-hover-border, rgba(164, 118, 56, 0.72));
  background: var(--ui-shop-cost-hover-bg, rgba(139, 90, 43, 0.19));
  outline: none;
}

.ui-compact-shop-cost__icon {
  display: inline-block;
  flex-shrink: 0;
  width: 17px;
  height: 17px;
  background-image: var(--icon-url, none);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.dark-mode .ui-compact-shop-grid,
.dark-theme .ui-compact-shop-grid {
  --ui-shop-card-bg: #34271b;
  --ui-shop-cost-bg: rgba(186, 140, 70, 0.22);
  --ui-shop-cost-hover-bg: rgba(186, 140, 70, 0.34);
  --ui-shop-gold-text: #e2b86b;
  --ui-shop-limit-bg: rgba(212, 166, 86, 0.2);
  --ui-shop-limit-muted-bg: rgba(160, 134, 102, 0.14);
  --ui-shop-card-hover-border: rgba(216, 175, 86, 0.65);
  --ui-shop-cost-border: rgba(216, 175, 86, 0.28);
  --ui-shop-divider: rgba(216, 175, 86, 0.22);
}

@media (max-width: 640px) {
  .ui-compact-shop-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .ui-compact-shop-card {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    grid-template-rows: 1fr auto;
    align-items: stretch;
    gap: 6px 8px;
    padding: 7px 8px;
  }

  .ui-compact-shop-card__icon {
    grid-column: 1;
    grid-row: 1;
    width: 52px;
    align-self: center;
  }

  .ui-compact-shop-card__info {
    display: contents;
  }

  .ui-compact-shop-card__head {
    grid-column: 2;
    grid-row: 1;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 4px;
  }

  .ui-compact-shop-card__title {
    font-size: 12.5px;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .ui-compact-shop-card__limit {
    font-size: 10px;
    padding: 1px 5px;
  }

  .ui-compact-shop-card__costs {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: center;
    padding-top: 5px;
  }

  .ui-compact-shop-cost {
    font-size: 11px;
    padding: 2px 7px 2px 5px;
  }
}
</style>
