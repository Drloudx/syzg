<template>
  <UiModal
    :visible="visible"
    :title="event ? event.title : '事件详情'"
    width="760px"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="event" class="ad-event-modal">
      <div class="ad-event-mode-bar">
        <div class="ad-event-mode-tabs" role="tablist">
          <button
            type="button"
            class="ad-mode-btn"
            :class="{ 'is-active': mode === 'interactive' }"
            @click="mode = 'interactive'"
          >交互推演</button>
          <button
            type="button"
            class="ad-mode-btn"
            :class="{ 'is-active': mode === 'all' }"
            @click="mode = 'all'"
          >全分支总览</button>
        </div>
        <div v-if="mode === 'interactive' && (trail.length > 1 || finishedOutcome)" class="ad-event-actions">
          <button
            type="button"
            class="ad-back-step-btn"
            @click="stepBack"
          >返回上一步</button>
          <button
            type="button"
            class="ad-reset-btn"
            @click="resetTrace"
          >重置到起点</button>
        </div>
      </div>

      <!-- 模式 A：交互推演（按游戏内节点逐层点选） -->
      <div v-if="mode === 'interactive'" class="ad-trace-wrap">
        <div v-if="currentNode" class="ad-node-box">
          <div v-if="currentNode.image" class="ad-node-banner">
            <img :src="getImageUrl(currentNode.image)" :alt="event.title" loading="lazy" decoding="async" />
          </div>
          <p class="ad-node-text">{{ currentNode.text }}</p>

          <div v-if="!finishedOutcome" class="ad-options-list">
            <div
              v-for="opt in currentNode.options"
              :key="opt.id"
              class="ad-option-block"
            >
              <div class="ad-option-head">
                <strong class="ad-option-btn-title">{{ opt.buttonText }}</strong>
                <span v-if="opt.buttonDesc" class="ad-option-desc">{{ opt.buttonDesc }}</span>
              </div>
              <div class="ad-outcomes-list">
                <button
                  v-for="(out, idx) in opt.outcomes"
                  :key="idx"
                  type="button"
                  class="ad-outcome-action"
                  @click="pickOutcome(out)"
                >
                  <span class="ad-chance-pill">{{ out.chance }}%</span>
                  <span class="ad-outcome-summary">{{ summarizeOutcome(out) }}</span>
                  <span class="ad-outcome-arrow">{{ out.nextNodeId ? '→ 继续' : '→ 结束' }}</span>
                </button>
              </div>
            </div>
          </div>

          <div v-else class="ad-finished-box">
            <div class="ad-finished-head">
              <span class="ad-finished-tag">事件结算</span>
              <button type="button" class="ad-back-step-btn" @click="stepBack">返回上一步</button>
            </div>
            <div class="ad-outcome-detail">
              <OutcomeDetails
                :outcome="finishedOutcome"
                :preview-layer="previewLayer"
                @open-item="emit('open-item', $event)"
                @open-monster="(mon) => emit('open-monster', mon)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 模式 B：全分支总览（一屏看清所有节点与产出） -->
      <div v-else class="ad-all-nodes">
        <div
          v-for="node in orderedNodes"
          :key="node.id"
          class="ad-all-node-card"
        >
          <div class="ad-all-node-head">
            <span class="ad-node-id-pill">{{ node.id === event.startNodeId ? '起点' : node.id }}</span>
            <p class="ad-all-node-text">{{ node.text }}</p>
          </div>
          <div v-for="opt in node.options" :key="opt.id" class="ad-all-opt">
            <div class="ad-option-head">
              <strong class="ad-option-btn-title">{{ opt.buttonText }}</strong>
              <span v-if="opt.buttonDesc" class="ad-option-desc">{{ opt.buttonDesc }}</span>
            </div>
            <div v-for="(out, idx) in opt.outcomes" :key="idx" class="ad-all-outcome-row">
              <span class="ad-chance-pill">{{ out.chance }}%</span>
              <div class="ad-all-outcome-body">
                <OutcomeDetails
                  :outcome="out"
                  :preview-layer="previewLayer"
                  @open-item="emit('open-item', $event)"
                  @open-monster="(mon) => emit('open-monster', mon)"
                />
                <span v-if="out.nextNodeId" class="ad-next-node-hint">跳转 → {{ out.nextNodeId }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UiModal>
</template>

<script setup>
import { computed, defineComponent, h, ref, watch } from 'vue'
import UiModal from '../ui/UiModal.vue'
import { getImageUrl } from '../../utils/env.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  event: { type: Object, default: null },
  previewLayer: { type: Object, default: null }
})

const emit = defineEmits(['update:visible', 'open-item', 'open-monster'])

const mode = ref('interactive')
const trail = ref([])
const finishedOutcome = ref(null)

const resetTrace = () => {
  mode.value = 'interactive'
  finishedOutcome.value = null
  trail.value = props.event?.startNodeId ? [props.event.startNodeId] : []
}

watch(() => [props.visible, props.event?.id], () => {
  if (props.visible && props.event) {
    resetTrace()
  }
})

const currentNode = computed(() => {
  if (!props.event?.nodes) return null
  const id = trail.value[trail.value.length - 1] || props.event.startNodeId
  return props.event.nodes[id] || null
})

const orderedNodes = computed(() => {
  if (!props.event?.nodes) return []
  const start = props.event.startNodeId || 'node_1'
  return Object.values(props.event.nodes).sort((a, b) => {
    if (a.id === start) return -1
    if (b.id === start) return 1
    return a.id.localeCompare(b.id, undefined, { numeric: true })
  })
})

const pickOutcome = out => {
  if (out.nextNodeId && props.event?.nodes?.[out.nextNodeId]) {
    trail.value = [...trail.value, out.nextNodeId]
    return
  }
  finishedOutcome.value = out
}

const stepBack = () => {
  if (finishedOutcome.value) {
    finishedOutcome.value = null
    return
  }
  if (trail.value.length > 1) {
    trail.value = trail.value.slice(0, -1)
  }
}

const formatDeltaText = out => {
  const parts = []
  if (out.hpChangeRate) {
    const pct = Math.round(out.hpChangeRate * 100)
    parts.push(`生命 ${pct > 0 ? `+${pct}` : pct}%`)
  }
  if (out.mpChangeRate) {
    const pct = Math.round(out.mpChangeRate * 100)
    parts.push(`法力 ${pct > 0 ? `+${pct}` : pct}%`)
  }
  return parts.join(' · ')
}

const summarizeOutcome = out => {
  if (out.actionType === 'changeHpMp') return formatDeltaText(out) || '状态调整'
  if (out.actionType === 'reward') {
    const first = out.reward?.groups?.[0]?.rules?.[0]
    return first ? `获得 ${first.name}` : '获得奖励'
  }
  if (out.actionType === 'randomBuff') {
    const first = out.buffs?.[0]
    return out.buffs?.length > 1 ? `随机增益（${out.buffs.length} 种）` : `获得「${first?.name || '增益'}」`
  }
  if (out.actionType === 'battle') return `触发战斗：${out.battleRoom?.name || '敌人'}`
  return out.nextNodeId ? `进入 ${out.nextNodeId}` : '结束事件'
}

/** 渲染单条结果详情（支持奖励物品点击、Buff 展示、战斗怪物点击）。 */
const OutcomeDetails = defineComponent({
  name: 'OutcomeDetails',
  props: {
    outcome: { type: Object, required: true },
    previewLayer: { type: Object, default: null }
  },
  emits: ['open-item', 'open-monster'],
  setup(p, { emit: innerEmit }) {
    return () => {
      const out = p.outcome
      const nodes = []

      if (out.actionType === 'changeHpMp') {
        const text = formatDeltaText(out)
        if (text) nodes.push(h('span', { class: 'ad-effect-pill' }, text))
      }

      if (out.actionType === 'reward' && out.reward) {
        const rewardPills = []
        for (const cur of out.reward.currencies || []) {
          rewardPills.push(h('span', { class: 'ad-reward-chip' }, `${cur.label} ×${cur.num}`))
        }
        for (const grp of out.reward.groups || []) {
          for (const rule of grp.rules || []) {
            const countText = rule.min === rule.max ? `×${rule.min}` : `×${rule.min}~${rule.max}`
            rewardPills.push(
              h('button', {
                type: 'button',
                class: `ad-reward-chip is-clickable q-${rule.quality || 1}`,
                onClick: () => innerEmit('open-item', rule.typeId)
              }, [
                rule.icon ? h('img', {
                  src: getImageUrl(`/images/Common_ItemIcon/${rule.icon}.webp`),
                  alt: rule.name,
                  class: 'ad-chip-icon'
                }) : null,
                h('span', `${rule.name} ${countText}`)
              ])
            )
          }
        }
        if (out.layerLimits?.length) {
          const limitStr = out.layerLimits
            .map(l => `${l.minLayer === l.maxLayer ? `第${l.minLayer}层` : `第${l.minLayer}~${l.maxLayer}层`}限${l.limit}次`)
            .join(' / ')
          rewardPills.push(h('span', { class: 'ad-limit-note' }, limitStr))
        }
        nodes.push(h('div', { class: 'ad-chip-row' }, rewardPills))
      }

      if (out.actionType === 'randomBuff' && out.buffs?.length) {
        nodes.push(
          h('div', { class: 'ad-buff-list' }, out.buffs.map(b =>
            h('div', { class: 'ad-buff-row' }, [
              b.icon ? h('img', {
                src: getImageUrl(`/images/CombatPanel_Atlas/${b.icon}.webp`),
                alt: b.name,
                class: 'ad-buff-icon'
              }) : null,
              h('div', { class: 'ad-buff-copy' }, [
                h('strong', `${b.name}${b.roomNum ? `（持续 ${b.roomNum} 房）` : ''}`),
                b.desc ? h('span', b.desc) : null
              ])
            ])
          ))
        )
      }

      if (out.actionType === 'battle' && out.battleRoom) {
        const rounds = out.battleRoom.rounds || []
        const layerAtk = p.previewLayer?.scaleAtk || 1
        const layerHp = p.previewLayer?.scaleHp || 1
        nodes.push(
          h('div', { class: 'ad-battle-box' }, [
            h('div', { class: 'ad-battle-title' }, `触发战斗 · ${out.battleRoom.name}`),
            ...rounds.map((wave, wi) =>
              h('div', { class: 'ad-wave-row' }, [
                h('span', { class: 'ad-wave-idx' }, `第 ${wi + 1} 波：`),
                ...wave.map(mon =>
                  h('button', {
                    type: 'button',
                    class: 'ad-mon-pill',
                    onClick: () => innerEmit('open-monster', {
                      ...mon,
                      levelScale: Number(((mon.monScaleAtk || 1) * layerAtk).toFixed(4)),
                      levelScaleHp: Number(((mon.monScaleHp || 1) * layerHp).toFixed(4))
                    })
                  }, [
                    h('img', {
                      src: getImageUrl(`/images/HeadIconAtals/${mon.icon || 'avatar_Mon_001'}.webp`),
                      alt: mon.name,
                      class: 'ad-mon-avatar'
                    }),
                    h('span', mon.name),
                    mon.count > 1 ? h('span', { class: 'ad-mon-cnt' }, `×${mon.count}`) : null
                  ])
                )
              ])
            )
          ])
        )
      }

      if (!nodes.length) {
        nodes.push(h('span', { class: 'ad-effect-pill' }, out.nextNodeId ? `进入下一阶段 (${out.nextNodeId})` : '无附加效果'))
      }

      return h('div', { class: 'ad-outcome-details-wrap' }, nodes)
    }
  }
})
</script>

<style scoped>
.ad-event-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ad-event-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ad-event-mode-tabs,
.ad-event-actions {
  display: inline-flex;
  gap: 6px;
}

.ad-mode-btn,
.ad-reset-btn,
.ad-back-step-btn {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(143, 115, 81, 0.4);
  background: rgba(232, 218, 193, 0.9);
  color: var(--text-main, #3e2a14);
  font-size: 13px;
  cursor: pointer;
}

.ad-mode-btn.is-active {
  background: #4e3422;
  color: #fff6e8;
  border-color: #4e3422;
}

.ad-node-box,
.ad-all-node-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid rgba(143, 115, 81, 0.34);
  background: rgba(232, 218, 193, 0.9);
}

.ad-node-banner {
  align-self: center;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(143, 115, 81, 0.28);
}

.ad-node-banner img {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: 220px;
  height: auto;
  object-fit: contain;
}

.ad-node-text,
.ad-all-node-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-main);
}

.ad-options-list,
.ad-all-nodes {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ad-option-block,
.ad-all-opt {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(139, 108, 72, 0.28);
  background: rgba(224, 208, 180, 0.72);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ad-option-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.ad-option-btn-title {
  font-size: 14px;
  color: #4e3422;
}

.ad-option-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.ad-outcomes-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ad-outcome-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid rgba(143, 115, 81, 0.34);
  background: rgba(238, 226, 202, 0.85);
  color: var(--text-main, #3e2a14);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.ad-outcome-action:hover {
  border-color: #8b5a2b;
  background: rgba(244, 234, 214, 0.95);
}

.ad-chance-pill {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(139, 90, 43, 0.14);
  color: #6f451f;
  font-size: 12px;
  font-weight: 700;
}

.ad-outcome-summary {
  flex: 1;
}

.ad-outcome-arrow {
  font-size: 12px;
  color: #8b5a2b;
  font-weight: 600;
}

.ad-finished-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(139, 90, 43, 0.35);
  background: rgba(226, 211, 184, 0.82);
}

.ad-finished-head,
.ad-all-node-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ad-all-node-head {
  justify-content: flex-start;
  align-items: flex-start;
}

.ad-finished-tag,
.ad-node-id-pill {
  padding: 2px 8px;
  border-radius: 4px;
  background: #4e3422;
  color: #fff6e8;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.ad-all-outcome-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.ad-all-outcome-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ad-next-node-hint {
  font-size: 12px;
  color: var(--text-muted);
}

:deep(.ad-outcome-details-wrap) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:deep(.ad-effect-pill) {
  display: inline-flex;
  align-self: flex-start;
  padding: 3px 9px;
  border-radius: 6px;
  background: rgba(78, 122, 92, 0.14);
  color: #2f5b3f;
  font-size: 12px;
  font-weight: 600;
}

:deep(.ad-chip-row) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

:deep(.ad-reward-chip) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 12px;
  border: 1px solid rgba(143, 115, 81, 0.34);
  background: rgba(238, 226, 202, 0.82);
  color: var(--text-main, #3e2a14);
  font-size: 12px;
}

:deep(.ad-reward-chip.is-clickable) {
  cursor: pointer;
}

:deep(.ad-reward-chip.is-clickable:hover) {
  border-color: #8b5a2b;
}

:deep(.ad-chip-icon) {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

:deep(.ad-limit-note) {
  font-size: 12px;
  color: var(--text-muted);
}

:deep(.ad-buff-list) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:deep(.ad-buff-row) {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(238, 226, 202, 0.78);
  border: 1px solid rgba(139, 108, 72, 0.24);
}

:deep(.ad-buff-icon) {
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
}

:deep(.ad-buff-copy) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

:deep(.ad-buff-copy span) {
  color: var(--text-muted);
}

:deep(.ad-battle-box) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 6px;
  background: rgba(168, 56, 48, 0.06);
  border: 1px solid rgba(168, 56, 48, 0.18);
}

:deep(.ad-battle-title) {
  font-size: 12px;
  font-weight: 700;
  color: #8f2c24;
}

:deep(.ad-wave-row) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

:deep(.ad-wave-idx) {
  font-size: 12px;
  color: var(--text-muted);
}

:deep(.ad-mon-pill) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 4px;
  border-radius: 999px;
  border: 1px solid rgba(139, 108, 72, 0.3);
  background: rgba(255, 252, 245, 0.92);
  font-size: 12px;
  color: var(--text-main);
  cursor: pointer;
}

:deep(.ad-mon-pill:hover) {
  border-color: #8b5a2b;
}

:deep(.ad-mon-avatar) {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

:deep(.ad-mon-cnt) {
  font-weight: 700;
  color: #7c4820;
}
</style>
