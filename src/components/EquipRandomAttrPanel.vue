<template>
  <div class="equip-random-panel paper-panel-solid">
    <div class="equip-random-summary">
      <div class="equip-random-summary__text">
        <template v-if="standalone">
          <span>生成条数按装备品质：</span>
          <span class="equip-random-sub">白/绿 1 条 · 蓝 2 条 · 紫/橙/红 3 条</span>
        </template>
        <template v-else>
          <span>{{ qualityLabel }}品质生成</span>
          <strong class="equip-random-count">{{ attrCount }} 条</strong>
        </template>
      </div>
      <button
        v-if="!standalone"
        type="button"
        class="equip-random-toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <span>{{ expanded ? '收起词条池' : '查看 1~10 级词条池' }}</span>
        <span aria-hidden="true">{{ expanded ? '▴' : '▾' }}</span>
      </button>
    </div>

    <div v-if="standalone || expanded" class="equip-random-body">
      <div class="equip-random-row">
        <span class="equip-random-row__label">词条品质：</span>
        <div class="equip-random-pills">
          <UiFilterPill
            v-for="tier in attrQualities"
            :key="tier.quality"
            :quality="tier.quality"
            :active="activeAttrQuality === tier.quality"
            @click="selectedAttrQuality = tier.quality"
          >{{ tier.label }}</UiFilterPill>
        </div>
      </div>

      <div class="equip-random-row">
        <span class="equip-random-row__label">词条等级：</span>
        <div class="equip-random-pills">
          <UiFilterPill
            v-for="lvl in levels"
            :key="lvl"
            :active="selectedLevel === lvl"
            :title="lvl === nativeEquipLevel ? `与当前装备品阶（${nativeEquipLevel}阶）一致` : `${lvl} 级随机词条`"
            @click="selectedLevel = lvl"
          >{{ lvl }}级</UiFilterPill>
        </div>
      </div>

      <UiStatGrid :items="statGridItems" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  EQUIP_RANDOM_ATTR_QUALITIES,
  buildEquipRandomAttrPool,
  getEquipRandomAttrCount,
  getEquipRandomAttrLevels
} from '../utils/itemParser.js'
import { getRarityName } from '../utils/gameMappings.js'
import { UiFilterPill, UiStatGrid } from './ui/index.js'

const props = defineProps({
  item: { type: Object, default: null },
  quality: { type: Number, default: 5 },
  standalone: { type: Boolean, default: false }
})

const expanded = ref(false)
const selectedAttrQuality = ref(5)
const selectedLevel = ref(1)

const attrQualities = EQUIP_RANDOM_ATTR_QUALITIES
const activeAttrQuality = computed(() =>
  attrQualities.some(q => q.quality === selectedAttrQuality.value) ? selectedAttrQuality.value : 5
)
const levels = computed(() => getEquipRandomAttrLevels())
const nativeEquipLevel = computed(() => Number(props.item?.equip?.equipLevel) || 1)

watch(
  () => props.item?.typeId,
  () => {
    expanded.value = false
    selectedAttrQuality.value = 5
    const lvl = Number(props.item?.equip?.equipLevel) || 1
    selectedLevel.value = Math.min(levels.value[levels.value.length - 1] || 10, Math.max(1, lvl))
  },
  { immediate: true }
)

const attrCount = computed(() => getEquipRandomAttrCount(props.item, Number(props.quality) || 5))
const qualityLabel = computed(() => getRarityName(Number(props.quality) || 5))

const statGridItems = computed(() => {
  const tone = activeAttrQuality.value
  return buildEquipRandomAttrPool(selectedLevel.value, activeAttrQuality.value).map(entry => ({
    label: entry.label,
    value: entry.rangeText,
    tone
  }))
})
</script>

<style scoped>
.equip-random-panel {
  padding: 11px 13px;
}

.equip-random-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.equip-random-summary__text {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 5px;
  font-size: 13px;
  color: var(--text-main, #3e2a14);
}

.equip-random-count {
  color: var(--accent-ink, #2f4a49);
  font-weight: 700;
}

.equip-random-sub {
  font-size: 12px;
  color: var(--text-muted, #6b5134);
}

.equip-random-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 4px;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  background: var(--paper-soft, #e9dcc3);
  color: var(--accent-ink, #2f4a49);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.equip-random-toggle:hover {
  border-color: var(--accent, #557574);
  background: var(--hover-bg, rgba(85, 117, 116, 0.14));
}

.dark-mode .equip-random-toggle {
  background: var(--paper, #261c13);
}

.equip-random-body {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.equip-random-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.equip-random-row__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  padding-top: 4px;
  min-width: 62px;
}

.equip-random-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  flex: 1;
  min-width: 0;
}
</style>
