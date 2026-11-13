<!--
  房间内容与掉落（副本图鉴 / 关卡图鉴共用）。

  消费构建期产物里同构的 `rooms` 数组：房间 → 候选变体 → 效果 / 怪物波次 / 采集物 / 怪物自动掉落。
  两个页面的数据结构、波次文案、奖励池分组和可点击判断完全一致，因此渲染与样式只在这里维护一份；
  页面负责章节/关卡归属和打开全局物品详情。
  `data-source-entry` 保留在元素上，供来源直达按 `dropEntry` 定位。
-->
<template>
  <div class="room-list">
    <article v-for="room in rooms" :key="`${room.layer}-${room.roomId}`" class="room-card">
      <div v-if="room.level || room.hidden || room.unlockTasks?.length" class="room-card__heading" :class="{ 'room-card__heading--meta-only': !room.unlockTasks?.length }">
        <div v-if="room.unlockTasks?.length" class="room-unlock-cond">
          <span class="unlock-cond-label">解锁条件：</span>
          <span
            v-for="task in room.unlockTasks"
            :key="task.id"
            class="unlock-task-link"
            :title="`点击前往任务详情：${task.typeName}「${task.name}」`"
            role="button"
            tabindex="0"
            @click.stop="goToTask(task.id)"
            @keydown.enter.prevent.stop="goToTask(task.id)"
            @keydown.space.prevent.stop="goToTask(task.id)"
          >
            {{ task.typeName }}「{{ task.name }}」
          </span>
        </div>
        <div class="room-card__meta-tags">
          <UiTag v-if="room.level" tone="default">Lv.{{ room.level }}</UiTag>
          <UiTag v-if="room.hidden" tone="muted">隐藏</UiTag>
        </div>
      </div>
      <div class="room-card__variants">
        <template v-for="variant in room.variants" :key="variant.typeId">
          <div class="room-variant">
            <div class="room-variant__title">
              <span>{{ variant.name }}</span>
              <UiTag v-if="variant.source?.candidate" tone="muted">随机候选</UiTag>
              <UiTag :tone="variant.kind.includes('宝箱') ? 'gold' : 'default'">{{ variant.kind }}</UiTag>
            </div>
            <div v-if="variant.effects?.length" class="room-effects">
              <div v-for="effect in variant.effects" :key="`${variant.typeId}-${effect.type}`" class="room-effect">
                <strong>{{ effect.title }}</strong>
                <p>{{ effect.summary }}</p>
                <div v-if="effect.options?.length" class="room-effect__options">
                  <span v-for="option in effect.options" :key="`${effect.type}-${option.name}`">
                    <b>{{ option.name }}</b>{{ option.detail }}
                  </span>
                </div>
              </div>
            </div>
            <!-- 房间战斗特殊机制（增援 / 破盾 / 坚守） -->
            <div v-if="variant.mechanics?.length" class="room-mechanics">
              <div v-for="(mech, mIdx) in variant.mechanics" :key="mIdx" class="room-mechanic-card">
                <div class="room-mechanic-header">
                  <UiTag tone="gold">机制</UiTag>
                  <strong class="mechanic-title">{{ mech.title }}</strong>
                </div>
                <p v-if="mech.summary" class="mechanic-summary">{{ mech.summary }}</p>

                <div class="mechanic-box">
                  <div v-if="mech.rule" class="mechanic-row">
                    <span class="mech-lead">增援规则</span>
                    <span class="mech-rule-text">{{ mech.rule }}</span>
                  </div>

                  <div v-if="mech.units?.length" class="mechanic-row mechanic-units-row">
                    <span class="mech-lead">增援单位：</span>
                    <div class="wave-monsters-flow">
                      <span
                        v-for="unit in mech.units"
                        :key="unit.typeId"
                        class="wave-mon-pill is-clickable"
                        :title="unit.name + ' · 点击查看详情'"
                        role="button"
                        tabindex="0"
                        @click.stop="openMonsterDetail(unit.typeId, null, room?.level || room?.gameLevel, { scaleHp: unit.levelScaleHp, scaleAtk: unit.levelScale })"
                        @keydown.enter.prevent.stop="openMonsterDetail(unit.typeId, null, room?.level || room?.gameLevel, { scaleHp: unit.levelScaleHp, scaleAtk: unit.levelScale })"
                        @keydown.space.prevent.stop="openMonsterDetail(unit.typeId, null, room?.level || room?.gameLevel, { scaleHp: unit.levelScaleHp, scaleAtk: unit.levelScale })"
                      >
                        <img
                          class="mon-mini-icon"
                          :src="unit.iconUrl"
                          :alt="unit.name"
                          loading="lazy"
                          decoding="async"
                          @error="handleMonsterIconError($event, unit)"
                        />
                        <span class="mon-name-txt">{{ unit.name }}</span>
                        <span v-if="unit.count > 1" class="mon-count-txt">×{{ unit.count }}</span>
                        <span class="mon-arrow-txt">→</span>
                      </span>
                    </div>
                  </div>

                  <div v-if="mech.target" class="mechanic-row">
                    <span class="mech-lead">破解目标</span>
                    <span class="mech-text">{{ mech.target }}</span>
                  </div>

                  <div v-if="mech.effect" class="mechanic-row">
                    <span class="mech-lead">破解效果</span>
                    <span class="mech-text mech-text--highlight">{{ mech.effect }}</span>
                  </div>

                  <div v-if="mech.clearCondition" class="mechanic-row">
                    <span class="mech-lead">通关条件</span>
                    <span class="mech-text">{{ mech.clearCondition }}</span>
                  </div>
                </div>
              </div>
            </div>
            <template v-if="variant.monsters?.length">
              <div v-for="line in monsterWaveLines(variant)" :key="line.key" class="room-wave-line">
                <strong class="wave-lead" v-if="line.wave">第{{ line.wave }}波：</strong>
                <strong class="wave-lead" v-else>怪物：</strong>
                <div class="wave-monsters-flow">
                  <span
                    v-for="mon in line.monsters"
                    :key="mon.typeId"
                    class="wave-mon-pill is-clickable"
                    :title="(mon.rank ? `${mon.name} (Rank ${mon.rank})` : mon.name) + ' · 点击查看详情'"
                    role="button"
                    tabindex="0"
                    @click.stop="openMonsterDetail(mon.typeId, null, room?.level || room?.gameLevel, { scaleHp: mon.levelScaleHp, scaleAtk: mon.levelScale })"
                    @keydown.enter.prevent.stop="openMonsterDetail(mon.typeId, null, room?.level || room?.gameLevel, { scaleHp: mon.levelScaleHp, scaleAtk: mon.levelScale })"
                    @keydown.space.prevent.stop="openMonsterDetail(mon.typeId, null, room?.level || room?.gameLevel, { scaleHp: mon.levelScaleHp, scaleAtk: mon.levelScale })">
                    <img
                      class="mon-mini-icon"
                      :src="mon.iconUrl"
                      :alt="mon.name"
                      loading="lazy"
                      decoding="async"
                      @error="handleMonsterIconError($event, mon)"
                    />
                    <span class="mon-name-txt">{{ mon.name }}</span>
                    <span class="mon-count-txt">×{{ mon.count }}</span>
                  </span>
                </div>
              </div>
            </template>
            <p v-else-if="variant.notFightRoom" class="room-variant__line">非战斗房间</p>
            <!-- 房间 NPC 展示：优先展示带头像与名称的 NPC 胶囊流，兜底展示计数 -->
            <div v-if="getRoomNpcs(variant.typeId).length" class="room-wave-line room-npc-line">
              <strong class="wave-lead">NPC：</strong>
              <div class="wave-monsters-flow">
                <span
                  v-for="(npc, idx) in getRoomNpcs(variant.typeId)"
                  :key="idx"
                  class="wave-mon-pill wave-npc-pill"
                  :title="npc.name"
                >
                  <img
                    v-if="npc.iconUrl"
                    class="mon-mini-icon"
                    :src="npc.iconUrl"
                    :alt="npc.name"
                    loading="lazy"
                    decoding="async"
                    @error="handleImageFallback"
                  />
                  <span class="mon-name-txt">{{ npc.name }}</span>
                </span>
              </div>
            </div>
            <p v-else-if="variant.npcCount" class="room-variant__line">NPC：{{ variant.npcCount }} 个</p>
            <div
              v-for="collection in sortedCollections(variant.collections)"
              :key="`${variant.typeId}-${collection.collectTypeId}`"
              :data-source-entry="`${variant.typeId}:${collection.collectTypeId}`"
              class="room-collection"
            >
              <div class="room-collection__heading">
                <span>
                  {{ collection.name }}<template v-if="collection.count > 1"> ×{{ collection.count }}</template>
                  <button
                    v-if="collection.reward?.length"
                    type="button"
                    class="prob-detail-btn"
                    @click.stop="openRewardDetail(collection.name, collection.reward)"
                  >
                    概率明细
                  </button>
                </span>
                <small v-if="collection.consume">{{ collectConsumeText(collection) }}</small>
              </div>
              <RewardPools v-if="collection.reward.length" dense :entries="collection.reward" @item-click="emit('item-click', $event)" />
              <p v-else class="room-variant__line">已配置交互，奖励表未提供可展示条目</p>
            </div>
            <div
              v-for="drop in sortedMonsterDrops(variant.monsters)"
              :key="`${variant.typeId}-${drop.key}`"
              :data-source-entry="`${variant.typeId}:${drop.sourceEntry}`"
              class="room-collection room-collection--monster"
            >
              <div class="room-collection__heading">
                <span>
                  {{ drop.monsterName }}
                  <button
                    v-if="drop.reward?.length"
                    type="button"
                    class="prob-detail-btn"
                    @click.stop="openRewardDetail(drop.monsterName, drop.reward)"
                  >
                    概率明细
                  </button>
                </span>
                <small v-if="drop.dropRate">{{ (drop.dropRate * 100).toFixed(0) }}%</small>
              </div>
              <RewardPools v-if="drop.reward.length" dense :entries="drop.reward" @item-click="emit('item-click', $event)" />
            </div>
          </div>
        </template>
      </div>
    </article>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { UiTag } from './ui/index.js'
import RewardPools from './RewardPools.vue'
import { handleImageFallback, getImageUrl } from '../utils/env.js'
import { openMonsterDetail } from '../utils/monsterModalState.js'
import { getRoomNpcs } from '../utils/roomNpcMap.js'
import {
  collectConsumeText,
  monsterWaveLines,
  sortedCollections,
  sortedMonsterDrops
} from '../utils/roomDisplay.js'
import { openRewardDetail } from '../utils/rewardModalState.js'

const router = useRouter()

const goToTask = (taskId) => {
  if (!taskId || !router) return
  router.push({ path: '/tasks', query: { task: taskId } })
}

const handleMonsterIconError = (event, mon) => {
  const img = event?.target
  if (!img) return
  const typeId = String(mon?.typeId || '')
  const clean = typeId.replace(/^(?:mon_|pet_)/i, '').replace(/_(?:rf|h|srb|elite|boss|fenLie|crazy|main_03|main_02|\d+)$/i, '')
  const padded = clean.padStart(3, '0')
  const step = Number(img.dataset.fallbackStep || 0)

  if (step === 0) {
    img.dataset.fallbackStep = '1'
    img.src = getImageUrl(`/images/PicHandBookPanel_Atlas/colect_mon_${clean}.webp`)
  } else if (step === 1) {
    img.dataset.fallbackStep = '2'
    img.src = getImageUrl(`/images/PicHandBookPanel_Atlas/colect_mon_${padded}.webp`)
  } else if (step === 2) {
    img.dataset.fallbackStep = '3'
    img.src = getImageUrl(`/images/model-previews/mon_${padded}.webp`)
  } else {
    handleImageFallback(event)
  }
}

defineProps({
  rooms: { type: Array, default: () => [] }
})
const emit = defineEmits(['item-click'])
</script>

<style scoped>
.room-list { display: flex; flex-direction: column; gap: 8px; overflow: visible; padding-right: 0; }
.room-card { border: 1px solid var(--border-soft); border-radius: 5px; background: var(--paper-soft); padding: 9px 10px; }
.room-card__heading, .room-variant__title, .room-collection__heading { display: flex; align-items: center; gap: 7px; min-width: 0; }
.room-card__heading { color: var(--text-main); font-size: 13px; justify-content: space-between; flex-wrap: wrap; margin-bottom: 2px; }
.room-card__heading--meta-only { justify-content: flex-end; }
.room-unlock-cond {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-sub);
  background: rgba(143, 115, 81, 0.08);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 2px 7px;
}
.dark-mode .room-unlock-cond,
.dark-theme .room-unlock-cond {
  background: rgba(143, 115, 81, 0.16);
}
.unlock-cond-label {
  color: var(--text-muted);
  font-weight: 600;
  white-space: nowrap;
}
.unlock-task-link {
  color: var(--accent-ink);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color 0.15s ease;
}
.unlock-task-link:hover {
  color: var(--accent-bright, var(--accent-ink));
}
.room-card__meta-tags { display: flex; align-items: center; gap: 7px; margin-left: auto; }
.room-card__variants { display: flex; flex-direction: column; gap: 7px; margin-top: 7px; }
.room-variant { border-left: 3px solid var(--accent); padding: 6px 0 6px 9px; min-width: 0; }
.room-variant__title { font-size: 12px; font-weight: 700; color: var(--text-main); }
.room-variant__title span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.room-variant__line { margin: 4px 0 0; color: var(--text-muted); font-size: 11px; line-height: 1.5; }
.room-effects { display: grid; gap: 6px; margin-top: 7px; }
.room-effect { min-width: 0; border-left: 2px solid var(--accent); padding-left: 8px; }
.room-effect > strong { color: var(--text-main); font-size: 11px; }
.room-effect > p { margin: 2px 0 0; color: var(--text-sub); font-size: 12px; line-height: 1.5; }
.room-effect__options { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.room-effect__options span { border: 1px solid var(--border-soft); border-radius: 3px; background: var(--paper-solid); padding: 3px 6px; color: var(--text-sub); font-size: 11px; line-height: 1.4; }
.room-effect__options b { margin-right: 5px; color: var(--text-main); }
.room-collection { margin-top: 6px; padding: 6px 7px; background: var(--paper-solid); border: 1px dashed var(--border-soft); border-radius: 4px; }
.room-collection--monster { border-style: solid; }
.room-collection__heading { justify-content: space-between; color: var(--text-main); font-size: 12px; font-weight: 700; margin-bottom: 9px; }
.room-collection__heading > span { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.room-collection__heading small { color: var(--text-muted); font-weight: 600; }

.dark-mode .room-card,
.dark-theme .room-card,
.dark-mode .room-card,
.dark-theme .room-card {
  border-color: rgba(143, 115, 81, 0.28);
  background: rgba(38, 28, 19, 0.72);
}

.dark-mode .room-collection,
.dark-theme .room-collection,
.dark-mode .room-collection,
.dark-theme .room-collection {
  background: rgba(28, 20, 13, 0.65);
  border-color: rgba(143, 115, 81, 0.22);
}

/* 怪物与 NPC 波次展示（严格水平对齐） */
.room-wave-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  min-height: 27px;
}

.wave-lead {
  color: var(--text-muted);
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 27px;
  display: inline-flex;
  align-items: center;
}

.wave-monsters-flow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.wave-mon-pill.is-clickable { cursor: pointer; transition: background-color .15s, border-color .15s; }
.wave-mon-pill.is-clickable:hover { background: rgba(85, 117, 116, 0.14); border-color: var(--accent-ink); }
.wave-mon-pill.is-clickable:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 1px; }
.wave-mon-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px 2px 4px;
  background: rgba(255, 250, 240, 0.48);
  border: 1px solid rgba(143, 115, 81, 0.38);
  border-radius: 4px;
  font-size: 12px;
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.05);
}

.mon-mini-icon {
  width: 21px;
  height: 21px;
  object-fit: contain;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(143, 115, 81, 0.25);
}

.mon-name-txt {
  font-weight: 600;
  color: var(--text-main);
}

.mon-count-txt {
  font-weight: 700;
  color: #a16207;
}

.dark-mode .wave-mon-pill,
.dark-theme .wave-mon-pill {
  background: rgba(45, 33, 22, 0.75);
  border-color: rgba(186, 140, 70, 0.35);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.dark-mode .mon-mini-icon,
.dark-theme .mon-mini-icon {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(223, 206, 179, 0.3);
}

.dark-mode .mon-name-txt,
.dark-theme .mon-name-txt {
  color: #f3ead5;
}

.dark-mode .mon-count-txt,
.dark-theme .mon-count-txt {
  color: #eab308;
}

.wave-npc-pill {
  background: rgba(240, 248, 255, 0.45);
  border-color: rgba(94, 120, 140, 0.35);
}

.wave-npc-pill:not(:has(.mon-mini-icon)) {
  padding: 3px 8px;
}

.dark-mode .wave-npc-pill,
.dark-theme .wave-npc-pill {
  background: rgba(30, 38, 48, 0.72);
  border-color: rgba(120, 150, 180, 0.35);
}

/* 房间战斗特殊机制卡片 */
.room-mechanics {
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-mechanic-card {
  background: rgba(253, 250, 243, 0.7);
  border: 1px solid rgba(186, 140, 70, 0.35);
  border-radius: 4px;
  padding: 8px 10px;
}

.room-mechanic-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.mechanic-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.mechanic-summary {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
  margin: 0 0 6px 0;
}

.mechanic-box {
  background: rgba(245, 237, 224, 0.55);
  border-left: 3px solid #b45309;
  padding: 6px 8px;
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
}

.mechanic-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 24px;
}

.mech-lead {
  font-weight: 700;
  color: #92400e;
  flex-shrink: 0;
}

.mech-text,
.mech-rule-text {
  color: var(--text-main);
  font-size: 12px;
}

.mech-text--highlight {
  color: #b91c1c;
  font-weight: 700;
}

.mon-arrow-txt {
  color: var(--text-muted);
  font-size: 11px;
  margin-left: 2px;
}

.dark-mode .room-mechanic-card,
.dark-theme .room-mechanic-card {
  background: rgba(35, 27, 19, 0.75);
  border-color: rgba(186, 140, 70, 0.3);
}

.dark-mode .mechanic-box,
.dark-theme .mechanic-box {
  background: rgba(45, 35, 25, 0.65);
  border-left-color: #d97706;
}

.dark-mode .mech-lead,
.dark-theme .mech-lead {
  color: #f59e0b;
}

.dark-mode .mech-text--highlight,
.dark-theme .mech-text--highlight {
  color: #f87171;
}

</style>
