<template>
  <div ref="host" class="sidebar-mascot" :data-character="active.id" :data-rigged="hasMascotRig(active.id) ? 'true' : null" :aria-busy="loading" :style="{ '--mascot-play-state': playing ? 'running' : 'paused' }">
    <!-- Trusted, repository-owned SVG; no runtime markup or original PNG download. -->
    <div class="mascot-art" :data-action="currentAction" :data-hero="active.id" :data-rigged="hasMascotRig(active.id) ? 'true' : null" aria-hidden="true">
      <div v-if="hasMascotRig(active.id) && artwork" class="mascot-drawing"><MascotScene :key="active.id" :character="active.id" :action="currentAction" :playing="playing" :paused="paused" :reduced-motion="reducedMotion" @state="hilState = $event" /></div>
      <div v-else class="mascot-drawing" v-html="artwork"></div>
      <span v-if="currentAction === 'think' && !reducedMotion && (!hasMascotRig(active.id) || (hilState.action === 'think' && hilState.stage === 'loop'))" class="mascot-thought-bubble">?</span>
    </div>
    <div class="mascot-controls">
      <UiButton
        ref="switchButton"
        class="mascot-control mascot-switch"
        variant="ghost" size="sm" type="button"
        :disabled="loading"
        aria-label="选择吉祥物角色与设置"
        aria-haspopup="dialog"
        :aria-expanded="pickerOpen"
        aria-controls="mascot-character-picker"
        :title="`当前：${active.name} · ${actionName}；选择吉祥物与动作`"
        @click="pickerOpen = !pickerOpen"
      >
        <span>{{ loading ? '加载中' : '切换角色' }}</span>
        <i v-if="!loading" class="mascot-chevron" :class="{ 'is-open': pickerOpen }" aria-hidden="true"></i>
      </UiButton>
    </div>
    <span class="mascot-announcement" role="status">{{ loadFailed ? '角色加载失败，请重试' : `当前吉祥物：${active.name}` }}</span>
    <UiPopover
      v-model:visible="pickerOpen"
      id="mascot-character-picker"
      :anchor="switchButton?.$el"
      title="选择吉祥物"
    >
      <template #heading-actions v-if="batchCount > 1">
        <nav class="mascot-batch-controls" aria-label="切换吉祥物批次">
          <UiButton variant="ghost" size="sm" :disabled="batch === 0 || loading" aria-label="上一批角色" @click="batch--"><span class="mascot-batch-arrow" aria-hidden="true">‹</span>上一批</UiButton>
          <span class="mascot-batch-position" aria-live="polite">{{ batch + 1 }} / {{ batchCount }}</span>
          <UiButton variant="ghost" size="sm" :disabled="batch >= batchCount - 1 || loading" aria-label="下一批角色" @click="batch++">下一批<span class="mascot-batch-arrow" aria-hidden="true">›</span></UiButton>
        </nav>
      </template>
      <div class="mascot-options">
        <UiButton
          v-for="character in batchCharacters"
          :key="character.id"
          class="mascot-option"
          :variant="active.id === character.id ? 'secondary' : 'ghost'"
          size="sm" type="button"
          :aria-label="`选择${character.name}`"
          :aria-pressed="active.id === character.id"
          :data-character-option="character.id"
          :disabled="loading"
          @click="loadCharacter(character, true)"
        >
          <span v-if="hasMascotRig(character.id) && previews[character.id]" class="mascot-option-art" aria-hidden="true"><MascotScene :character="character.id" preview /></span>
          <span v-else-if="previews[character.id]" class="mascot-option-art" aria-hidden="true" v-html="previews[character.id]"></span>
          <span v-else class="mascot-option-art mascot-preview-placeholder" aria-hidden="true">{{ previewErrors[character.id] ? '点击重试' : '加载中' }}</span>
          <span class="mascot-option-name">{{ character.name }}</span>
        </UiButton>
      </div>

      <!-- 弹窗底部整合工具栏：动作切换与动画开关 -->
      <div v-if="!reducedMotion" class="mascot-footer-settings">
        <div class="mascot-action-bar">
          <span class="mascot-setting-label">动作：</span>
          <div class="mascot-action-chips">
            <button
              v-for="entry in availableActions"
              :key="entry.id"
              type="button"
              class="mascot-action-chip"
              :class="{ 'is-active': selectedAction === entry.id }"
              :aria-pressed="selectedAction === entry.id"
              :title="entry.detail"
              @click="selectAction(entry.id)"
            >
              {{ entry.name }}
            </button>
          </div>
        </div>

        <button
          type="button"
          class="mascot-motion-btn"
          :class="{ 'is-paused': paused }"
          :aria-pressed="paused"
          :title="paused ? '播放动画' : '暂停动画'"
          @click="togglePaused"
        >
          <span class="mascot-motion-icon">{{ paused ? '▶' : '⏸' }}</span>
          <span>{{ paused ? '播放' : '暂停' }}</span>
        </button>
      </div>

      <div v-if="loadFailed" class="mascot-picker-error" role="alert">
        <span>角色加载失败，请重试</span>
        <UiButton variant="ghost" size="sm" @click="loadCharacter(requested, true)">重试</UiButton>
      </div>
    </UiPopover>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { UiButton, UiPopover } from './ui/index.js'
import { MASCOTS } from '../config/mascots.js'
import { loadMascotArtwork } from '../utils/mascotArtwork.js'
import MascotScene from './mascot/MascotScene.vue'
import { hasMascotRig } from './mascot/mascotModels.js'
import '../assets/mascot/idle.css'
import '../assets/mascot/actions.css'

const host = ref(null)
const switchButton = ref(null)
const actionButton = ref(null)
const actionPickerOpen = ref(false)
const route = useRoute()
const pickerOpen = ref(false)
const batchSize = 7
const batch = ref(0)
const batchCount = Math.ceil(MASCOTS.length / batchSize)
const batchCharacters = computed(() => MASCOTS.slice(batch.value * batchSize, (batch.value + 1) * batchSize))
const previews = ref({})
const previewErrors = ref({})
const paused = ref(false)
const selectedAction = ref('random')
const currentAction = ref('idle')
const hilState = ref({ action: 'idle', stage: 'loop' })
const actions = [
  { id: 'random', name: '随机', detail: '轮播切换 · 1~3分钟随机动作' },
  { id: 'idle', name: '待机', detail: '呼吸 · 眨眼' },
  { id: 'think', name: '思考', detail: '抬手托腮 · 偏头' },
  { id: 'swing', name: '秋千', detail: '握绳轻荡 · 晃脚' },
  { id: 'fish', name: '钓鱼', detail: '看漂 · 收线提竿' }
]

// 各动作随机配置（权重与随机持续时间范围/秒，每个动作至少 1 分钟左右）
const ACTION_RANDOM_CONFIGS = {
  idle: { minSec: 60, maxSec: 120, weight: 3 },
  think: { minSec: 50, maxSec: 90, weight: 2 },
  swing: { minSec: 60, maxSec: 150, weight: 2.5 },
  fish: { minSec: 75, maxSec: 180, weight: 2.5 }
}

const actionName = computed(() => actions.find(entry => entry.id === selectedAction.value)?.name || '随机')
const concreteActionName = computed(() => actions.find(entry => entry.id === currentAction.value)?.name || '待机')
const reducedMotion = ref(false)
const inView = ref(false)
const pageVisible = ref(false)
const playing = computed(() => !paused.value && !reducedMotion.value && inView.value && pageVisible.value)
const preferenceKey = 'mitora-mascot-paused'
const characterKey = 'sidebar-mascot-character'
const actionKey = 'sidebar-mascot-action'
const active = ref(MASCOTS[0])
// Only hand-checked articulated models expose the full choreography. A portrait
// remains idle until its limbs and props have been individually verified.
const availableActions = computed(() => {
  if (hasMascotRig(active.value.id)) {
    return actions
  }
  const idleEntry = actions.find(a => a.id === 'idle') || { id: 'idle', name: '待机' }
  return [{ ...idleEntry, detail: '轻呼吸' }]
})
const artwork = ref('')
const loading = ref(false)
const loadFailed = ref(false)
let requested = MASCOTS[0]
let loadOperation = 0
let artworkRequest
let previewRequest
let observer
let motionPreference
let randomTimer = null

function clearRandomTimer() {
  if (randomTimer) {
    clearTimeout(randomTimer)
    randomTimer = null
  }
}

function getRandomDuration(actId) {
  const cfg = ACTION_RANDOM_CONFIGS[actId] || { minSec: 60, maxSec: 120 }
  const sec = cfg.minSec + Math.random() * (cfg.maxSec - cfg.minSec)
  return Math.round(sec * 1000)
}

function pickNextRandomAction(current) {
  const pool = ['idle', 'think', 'swing', 'fish'].filter(id => id !== current)
  const totalWeight = pool.reduce((sum, id) => sum + (ACTION_RANDOM_CONFIGS[id]?.weight || 1), 0)
  let roll = Math.random() * totalWeight
  for (const id of pool) {
    const w = ACTION_RANDOM_CONFIGS[id]?.weight || 1
    if (roll <= w) return id
    roll -= w
  }
  return pool[Math.floor(Math.random() * pool.length)] || 'idle'
}

function scheduleNextRandomAction() {
  clearRandomTimer()
  if (selectedAction.value !== 'random' || !playing.value || !hasMascotRig(active.value.id)) {
    return
  }
  const durationMs = getRandomDuration(currentAction.value)
  randomTimer = setTimeout(() => {
    if (selectedAction.value === 'random' && playing.value && hasMascotRig(active.value.id)) {
      currentAction.value = pickNextRandomAction(currentAction.value)
      scheduleNextRandomAction()
    }
  }, durationMs)
}

async function loadCharacter(character, closePicker = false) {
  const operation = ++loadOperation
  artworkRequest?.abort()
  artworkRequest = new AbortController()
  requested = character
  loading.value = true
  loadFailed.value = false
  try {
    const svg = await loadMascotArtwork(character, artworkRequest.signal)
    if (operation !== loadOperation) return
    artwork.value = svg
    previews.value[character.id] = svg
    active.value = character
    if (!hasMascotRig(character.id) && selectedAction.value !== 'idle') {
      selectedAction.value = 'idle'
      currentAction.value = 'idle'
      clearRandomTimer()
      try { localStorage.setItem(actionKey, 'idle') } catch { /* Session fallback remains available. */ }
    } else if (hasMascotRig(character.id)) {
      if (selectedAction.value === 'random') {
        scheduleNextRandomAction()
      } else {
        currentAction.value = selectedAction.value
      }
    }
    actionPickerOpen.value = false
    if (closePicker) {
      pickerOpen.value = false
    }
    try { localStorage.setItem(characterKey, character.id) } catch { /* Session switching still works without storage. */ }
  } catch {
    if (operation === loadOperation) loadFailed.value = true
  } finally {
    if (operation === loadOperation) loading.value = false
  }
  if (closePicker && !loadFailed.value && operation === loadOperation) {
    await nextTick()
    switchButton.value?.$el?.focus({ preventScroll: true })
  }
}

watch(pickerOpen, open => {
  if (open) batch.value = Math.floor(MASCOTS.findIndex(character => character.id === active.value.id) / batchSize)
}, { flush: 'sync' })
watch([pickerOpen, batch], async ([open]) => {
  previewRequest?.abort()
  if (!open) return
  actionPickerOpen.value = false
  const controller = new AbortController()
  previewRequest = controller
  await Promise.allSettled(batchCharacters.value.map(async character => {
    if (previews.value[character.id]) return
    previewErrors.value[character.id] = false
    try {
      const svg = await loadMascotArtwork(character, controller.signal)
      if (!controller.signal.aborted) previews.value[character.id] = svg
    } catch {
      if (!controller.signal.aborted) previewErrors.value[character.id] = true
    }
  }))
})
watch(() => route.fullPath, () => { pickerOpen.value = false; actionPickerOpen.value = false })
watch(reducedMotion, reduced => { if (reduced) actionPickerOpen.value = false })
watch(playing, isPlaying => {
  if (isPlaying) {
    if (selectedAction.value === 'random' && hasMascotRig(active.value.id)) {
      scheduleNextRandomAction()
    }
  } else {
    clearRandomTimer()
  }
})

function updateVisibility() { pageVisible.value = !document.hidden }
function updateMotionPreference() { reducedMotion.value = motionPreference.matches }
function togglePaused() {
  paused.value = !paused.value
  try { localStorage.setItem(preferenceKey, String(paused.value)) } catch { /* Private browsing may disable storage. */ }
}
async function selectAction(id) {
  if (!availableActions.value.some(entry => entry.id === id)) return
  selectedAction.value = id
  actionPickerOpen.value = false
  clearRandomTimer()
  if (id === 'random') {
    if (hasMascotRig(active.value.id)) {
      currentAction.value = pickNextRandomAction(currentAction.value)
      scheduleNextRandomAction()
    } else {
      currentAction.value = 'idle'
    }
  } else {
    currentAction.value = id
  }
  try { localStorage.setItem(actionKey, selectedAction.value) } catch { /* Keep the session choice. */ }
  await nextTick()
  actionButton.value?.$el?.focus({ preventScroll: true })
}

onMounted(() => {
  try { paused.value = localStorage.getItem(preferenceKey) === 'true' } catch { /* Animation controls remain usable without storage. */ }
  try {
    const saved = localStorage.getItem(actionKey)
    if (saved && actions.some(entry => entry.id === saved)) {
      selectedAction.value = saved === 'hop' ? 'think' : saved
    } else {
      selectedAction.value = 'random'
    }
  } catch {
    selectedAction.value = 'random'
  }
  if (selectedAction.value === 'random') {
    currentAction.value = 'idle'
  } else {
    currentAction.value = selectedAction.value
  }
  let initial = MASCOTS[0]
  try { initial = MASCOTS.find(entry => entry.id === localStorage.getItem(characterKey)) || initial } catch { /* Use the default character. */ }
  loadCharacter(initial)
  updateVisibility()
  document.addEventListener('visibilitychange', updateVisibility)
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  updateMotionPreference()
  motionPreference.addEventListener('change', updateMotionPreference)
  observer = new IntersectionObserver(([entry]) => { inView.value = entry.isIntersecting && entry.intersectionRatio > 0 })
  observer.observe(host.value)
})

onBeforeUnmount(() => {
  clearRandomTimer()
  loadOperation += 1
  artworkRequest?.abort()
  previewRequest?.abort()
  observer?.disconnect()
  document.removeEventListener('visibilitychange', updateVisibility)
  motionPreference?.removeEventListener('change', updateMotionPreference)
})
</script>

<style scoped>
.sidebar-mascot {
  width: 192px;
  max-width: 100%;
  flex: 0 0 auto;
  align-self: flex-end;
  margin-top: auto;
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.mascot-art {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 5;
  contain: layout paint;
}
.mascot-drawing { width: 100%; height: 100%; }
.mascot-art :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.mascot-controls {
  width: max-content;
  align-self: flex-end;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 5px;
  padding-top: 4px;
}
.mascot-control {
  pointer-events: auto;
  font-size: 11.5px;
  font-weight: 600;
  color: #5c3b1e;
  background: rgba(143, 115, 81, 0.12);
  border: 1px solid rgba(143, 115, 81, 0.35);
  border-radius: 4px;
  padding: 3px 8px;
  min-height: 25px;
  line-height: 1.35;
  transition: all 0.18s ease;
  cursor: pointer;
}
.mascot-control:hover {
  background: rgba(197, 145, 62, 0.22);
  border-color: rgba(197, 145, 62, 0.6);
  color: #2b1a0d;
  transform: translateY(-1px);
}
.dark-mode .mascot-control {
  color: #ffd78c;
  background: rgba(143, 115, 81, 0.22);
  border-color: rgba(143, 115, 81, 0.45);
}
.dark-mode .mascot-control:hover {
  background: rgba(197, 145, 62, 0.35);
  border-color: #ffd78c;
  color: #fff;
}
.mascot-switch { min-height: 25px; }
.mascot-chevron {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 2px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-1px) rotate(45deg);
  transition: transform .15s ease;
}
.mascot-chevron.is-open { transform: translateY(2px) rotate(225deg); }
@media (prefers-reduced-motion: reduce) { .mascot-chevron { transition: none; } }
.mascot-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.mascot-options {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}
.mascot-batch-controls { display: flex; align-items: center; gap: 3px; }
.mascot-batch-controls :deep(.ui-btn) { min-height: 30px; padding: 0 7px; font-size: 13px; color: var(--text-main); gap: 5px; }
.mascot-batch-arrow { font-size: 24px; line-height: 1; }
.mascot-batch-position { min-width: 34px; text-align: center; font-size: 12px; color: var(--text-muted); }
.mascot-action-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.mascot-action-option { display: flex; flex-direction: column; gap: 5px; padding: 12px 6px; }
.mascot-action-option small { font-size: 11px; font-weight: 400; color: var(--text-muted); }
.mascot-option {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 8px 6px 7px;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  background: rgba(247, 240, 227, 0.45);
  border: 1px solid rgba(143, 115, 81, 0.28);
  box-shadow: 0 1px 3px rgba(60, 45, 30, 0.05);
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.mascot-option:hover {
  background: rgba(254, 249, 239, 0.88);
  border-color: rgba(197, 145, 62, 0.6);
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(90, 60, 30, 0.15);
}
.mascot-option[aria-pressed="true"] {
  background: rgba(255, 248, 235, 0.95);
  border: 1.5px solid #d4a359;
  box-shadow: 
    0 2px 8px rgba(197, 145, 62, 0.25),
    inset 0 0 10px rgba(212, 163, 89, 0.18);
}
.dark-mode .mascot-option {
  background: rgba(43, 31, 21, 0.55);
  border-color: rgba(143, 115, 81, 0.35);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.dark-mode .mascot-option:hover {
  background: rgba(60, 42, 27, 0.85);
  border-color: rgba(212, 163, 89, 0.7);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
}
.dark-mode .mascot-option[aria-pressed="true"] {
  background: rgba(58, 40, 24, 0.9);
  border-color: #ffd78c;
  box-shadow: 
    0 2px 10px rgba(0, 0, 0, 0.5),
    inset 0 0 10px rgba(212, 163, 89, 0.25);
}
.mascot-option-art {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 5;
  pointer-events: none;
}
.mascot-option-art :deep(svg) { display: block; width: 100%; height: 100%; }
.mascot-option-art :deep(.idle-motion) { animation: none; }
.mascot-option-art :deep(.hil-scene *) { animation: none; }
.mascot-preview-placeholder { display: grid; place-items: center; }
.mascot-option-name {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
  text-align: center;
}
.mascot-option[aria-pressed="true"] .mascot-option-name {
  font-weight: 700;
  color: #3e2613;
}
.dark-mode .mascot-option[aria-pressed="true"] .mascot-option-name {
  color: #ffd78c;
}
.mascot-picker-error { display: flex; align-items: center; justify-content: flex-end; font-size: 13px; gap: 8px; }

/* 弹窗底部整合控制条 */
.mascot-footer-settings {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed rgba(143, 115, 81, 0.35);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.mascot-action-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.mascot-setting-label {
  font-size: 11.5px;
  font-weight: 700;
  color: #6b5134;
  flex-shrink: 0;
}
.mascot-action-chips {
  display: flex;
  gap: 4px;
}
.mascot-action-chip {
  font-size: 11.5px;
  font-family: inherit;
  padding: 2.5px 7px;
  border-radius: 4px;
  background: rgba(143, 115, 81, 0.12);
  border: 1px solid rgba(143, 115, 81, 0.3);
  color: #5c3b1e;
  cursor: pointer;
  transition: all 0.18s ease;
  line-height: 1.35;
}
.mascot-action-chip:hover {
  background: rgba(197, 145, 62, 0.22);
  border-color: rgba(197, 145, 62, 0.6);
  color: #2b1a0d;
}
.mascot-action-chip.is-active {
  background: #c5913e;
  border-color: #ffd78c;
  color: #2b1a0d;
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}
.mascot-motion-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-family: inherit;
  padding: 2.5px 8px;
  border-radius: 4px;
  background: rgba(143, 115, 81, 0.12);
  border: 1px solid rgba(143, 115, 81, 0.3);
  color: #5c3b1e;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 1.35;
  transition: all 0.18s ease;
}
.mascot-motion-btn:hover {
  background: rgba(197, 145, 62, 0.22);
  border-color: rgba(197, 145, 62, 0.6);
  color: #2b1a0d;
}
.mascot-motion-btn.is-paused {
  background: rgba(192, 57, 43, 0.12);
  border-color: rgba(192, 57, 43, 0.45);
  color: #9c2718;
  font-weight: 700;
}
.mascot-motion-icon {
  font-size: 10px;
}
.dark-mode .mascot-setting-label {
  color: #c9b482;
}
.dark-mode .mascot-action-chip,
.dark-mode .mascot-motion-btn {
  background: rgba(143, 115, 81, 0.22);
  border-color: rgba(143, 115, 81, 0.45);
  color: #ffd78c;
}
.dark-mode .mascot-action-chip:hover,
.dark-mode .mascot-motion-btn:hover {
  background: rgba(197, 145, 62, 0.35);
  border-color: #ffd78c;
  color: #fff;
}
.dark-mode .mascot-action-chip.is-active {
  background: #c5913e;
  border-color: #ffe6b0;
  color: #2b1a0d;
}
.dark-mode .mascot-motion-btn.is-paused {
  background: rgba(192, 57, 43, 0.25);
  border-color: rgba(231, 76, 60, 0.6);
  color: #ff8e80;
}

/* Keep the illustration secondary in short desktop windows; the notes stay above it in normal flow. */
@media (max-height: 780px) {
  .sidebar-mascot { width: 144px; padding-top: 8px; }
}
</style>
