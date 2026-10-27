<template>
  <div class="page-view-container sim-page">
    <UiFilterPanel class="paper-panel">
      <template #search>
        <UiSearchInput v-model="heroQuery" placeholder="搜索角色名、职业或属性..." />
      </template>
      <UiFilterRow label="职业：">
        <UiFilterPill :active="!jobFilter" @click="jobFilter = ''">全部</UiFilterPill>
        <UiFilterPill v-for="j in JOBS" :key="j" :active="jobFilter === j" @click="jobFilter = j">{{ j }}</UiFilterPill>
      </UiFilterRow>
      <UiFilterRow label="属性：">
        <UiFilterPill :active="!elFilter" @click="elFilter = ''">全部</UiFilterPill>
        <UiFilterPill v-for="e in ELEMENTS" :key="e" :active="elFilter === e" @click="elFilter = e">{{ e }}</UiFilterPill>
      </UiFilterRow>
      <div class="sim-counter">
        已选 <span class="count-num">{{ team.length }}</span> / 4 名角色
        <button v-if="team.length" class="sim-clear" @click="team = []">清空</button>
      </div>
    </UiFilterPanel>

    <UiEmptyState v-if="loading" type="loading" text="正在装配模拟数据..." />
    <UiEmptyState v-else-if="errorMessage" type="error" :text="errorMessage" @retry="load" />

    <!--
      🔴 正文滚动容器必须带 data-main-scroll（UI_COMPONENT_LIBRARY §3 第 9 条）。
      UiCardGrid 自带该标记，所以这里用它当外壳，内容用单列 content-style 铺开，
      不再自建 div —— 自建容器漏标会让内容滚到筛选框上方，且失败是静默的。
    -->
    <UiCardGrid v-else id="teamSimScroll" class="sim-content" :content-style="{ gridTemplateColumns: 'minmax(0, 1fr)' }">
      <!-- 出战队伍 -->
      <section class="sim-section paper-panel">
        <h3 class="sim-section__title">出战队伍</h3>
        <div class="sim-team">
          <div v-for="i in 4" :key="i" class="sim-slot" :class="{ 'is-filled': team[i - 1] }">
            <template v-if="team[i - 1]">
              <img :src="heroPortrait(team[i - 1])" :alt="team[i - 1].name" loading="lazy" @error="onImgError">
              <span class="sim-slot__name">{{ team[i - 1].name }}</span>
              <span class="sim-slot__meta">{{ team[i - 1].jobName }} · {{ team[i - 1].elementName }}</span>
              <!--
                队伍被动点亮标记。图标取自游戏 `PetPanel_Atlas/team_buff(_on)`：
                出战 3 个魔物位，每个位置对该角色生效就点亮一颗，最多 3 颗。
              -->
              <span class="sim-slot__marks" :title="markTitle(team[i - 1])">
                <img
                  v-for="n in TEAM_SLOTS"
                  :key="n"
                  class="sim-slot__mark"
                  :src="n <= slotHitCount(team[i - 1]) ? TEAM_BUFF_ON : TEAM_BUFF_OFF"
                  :alt="n <= slotHitCount(team[i - 1]) ? '已点亮' : '未点亮'"
                >
              </span>
              <button class="sim-slot__remove" @click="removeHero(i - 1)">×</button>
            </template>
            <span v-else class="sim-slot__empty">选择角色</span>
          </div>
        </div>
        <p v-if="team.length" class="sim-team__summary">
          合计可吃 <strong>{{ totalMarks }}</strong> 个队伍被动
        </p>
      </section>

      <!-- 推荐魔物 -->
      <section v-if="team.length" class="sim-section paper-panel">
        <div class="sim-section__head">
          <h3 class="sim-section__title">魔物搭配</h3>
          <div class="sim-mode">
            <button class="sim-mode__btn" :class="{ 'is-active': mode === 'smart' }" @click="mode = 'smart'">智能推荐</button>
            <button class="sim-mode__btn" :class="{ 'is-active': mode === 'manual' }" @click="mode = 'manual'">自组查看</button>
          </div>
        </div>

        <!-- 智能推荐：自动挑出点亮总数最高的 3 只组合 -->
        <template v-if="mode === 'smart'">
          <UiFilterRow label="优先点亮：">
            <UiFilterPill
              v-for="h in team"
              :key="h.id"
              :active="protectHeroIds.includes(h.id)"
              @click="toggleProtect(h.id)"
            >{{ h.name }}</UiFilterPill>
          </UiFilterRow>
          <UiFilterRow label="优先词条：">
            <UiFilterPill
              v-for="s in allStats"
              :key="s"
              :active="preferStats.includes(s)"
              @click="togglePreferStat(s)"
            >{{ s }}</UiFilterPill>
          </UiFilterRow>
          <UiFilterRow label="其他：">
            <UiFilterPill :active="excludeGeneric" @click="excludeGeneric = !excludeGeneric">
              排除通用被动
            </UiFilterPill>
            <span class="sim-hint">通用 = 不限属性/职业，对谁都生效，拿来凑满没意义</span>
          </UiFilterRow>

          <div v-if="bestSolution" class="sim-best">
            <div class="sim-best__head">
              <span class="sim-best__title">最优组合</span>
              <span class="sim-best__sum">
                共点亮 <strong>{{ bestSolution.total }}</strong> / {{ team.length * TEAM_SLOTS }} 个词条
              </span>
            </div>
            <div class="sim-best__pets">
              <article v-for="pet in bestSolution.combo" :key="pet.id" class="sim-best__pet">
                <img :src="petIcon(pet)" :alt="pet.name" loading="lazy" @error="onImgError">
                <div>
                  <span class="sim-best__name">{{ pet.name }}</span>
                  <p class="sim-best__desc">{{ pet.passive.raw }}</p>
                </div>
              </article>
            </div>
            <div class="sim-best__counts">
              <template v-for="(count, idx) in bestSolution.counts" :key="idx">
                <span v-if="team[idx]" class="sim-best__count">
                  <img :src="count >= TEAM_SLOTS ? TEAM_BUFF_ON : TEAM_BUFF_OFF" alt="">
                  {{ team[idx].name }} {{ count }}/{{ TEAM_SLOTS }}
                </span>
              </template>
            </div>
          </div>
          <UiEmptyState v-else text="请先选择角色" />
        </template>

        <!-- 自组查看：列全部魔物，按命中人数排 -->
        <template v-else>
          <UiFilterRow label="加成筛选：">
            <UiFilterPill :active="!statFilter" @click="statFilter = ''">全部</UiFilterPill>
            <UiFilterPill
              v-for="s in availableStats"
              :key="s"
              :active="statFilter === s"
              @click="statFilter = s"
            >{{ s }}</UiFilterPill>
          </UiFilterRow>
          <div class="sim-pets">
            <article
              v-for="row in rankedPets"
              :key="row.pet.id"
              class="sim-pet"
              :class="{ 'is-best': row.count === maxCount && row.count > 0 }"
            >
              <img :src="petIcon(row.pet)" :alt="row.pet.name" loading="lazy" @error="onImgError">
              <div class="sim-pet__body">
                <div class="sim-pet__head">
                  <span class="sim-pet__name">{{ row.pet.name }}</span>
                  <span class="sim-pet__count" :class="`lv${Math.min(row.count, 4)}`">{{ row.count }} 人</span>
                </div>
                <p class="sim-pet__desc">{{ row.pet.passive.raw }}</p>
                <p class="sim-pet__hit">
                  <template v-if="row.hitHeroes.length">受益：{{ row.hitHeroes.map(h => h.name).join('、') }}</template>
                  <template v-else>当前队伍无人受益</template>
                </p>
              </div>
            </article>
            <UiEmptyState v-if="!rankedPets.length" text="没有符合筛选条件的魔物" />
          </div>
        </template>
      </section>

      <!-- 角色选择 -->
      <section class="sim-section paper-panel">
        <h3 class="sim-section__title">选择角色</h3>
        <div class="sim-heroes">
          <button
            v-for="h in filteredHeroes"
            :key="h.id"
            class="sim-hero"
            :class="{ 'is-picked': isPicked(h.id), 'is-full': team.length >= 4 && !isPicked(h.id) }"
            @click="toggleHero(h)"
          >
            <img :src="heroPortrait(h)" :alt="h.name" loading="lazy" @error="onImgError">
            <span class="sim-hero__name">{{ h.name }}</span>
            <span class="sim-hero__meta">{{ h.jobName }} · {{ h.elementName }}</span>
          </button>
          <UiEmptyState v-if="!filteredHeroes.length" text="没有符合条件的角色" />
        </div>
      </section>
    </UiCardGrid>

    <UiBackToTop scroll-container="#teamSimScroll" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getImageUrl } from '../utils/env'
import { fetchWithFallback } from '../utils/request'
import { toHeroRecord, toPetRecord, matchesPassive, ELEMENTS, JOBS } from '../utils/teamSimData'
import { solveBestTeam, TEAM_SLOTS } from '../utils/teamSimSolver'
import UiFilterPanel from '../components/ui/UiFilterPanel.vue'
import UiFilterRow from '../components/ui/UiFilterRow.vue'
import UiFilterPill from '../components/ui/UiFilterPill.vue'
import UiSearchInput from '../components/ui/UiSearchInput.vue'
import UiCardGrid from '../components/ui/UiCardGrid.vue'
import UiEmptyState from '../components/ui/UiEmptyState.vue'
import UiBackToTop from '../components/ui/UiBackToTop.vue'

/** 游戏原素材：队伍被动点亮/未点亮标记（来自 PetPanel_Atlas） */
const TEAM_BUFF_ON = getImageUrl('/images/PetPanel_Atlas/team_buff_on.webp')
const TEAM_BUFF_OFF = getImageUrl('/images/PetPanel_Atlas/team_buff.webp')

const heroes = ref([])
const pets = ref([])
const team = ref([])
const loading = ref(true)
const errorMessage = ref('')

const heroQuery = ref('')
const jobFilter = ref('')
const elFilter = ref('')
const statFilter = ref('')

/** 'smart' = 智能推荐（自动求最优 3 只）；'manual' = 自组查看（列全部） */
const mode = ref('smart')
/** 智能推荐：优先保证吃满的角色 id */
const protectHeroIds = ref([])
/** 智能推荐：优先的加成类型 */
const preferStats = ref([])
/**
 * 排除「通用」被动（不限属性/职业，对任何角色都生效）。
 * 默认开 —— 不排除的话 3 个位置会被通用被动占满，推荐失去意义。
 */
const excludeGeneric = ref(true)

/**
 * 头像与魔物图的**路径规则**（数据里只存文件名，不含目录）：
 *   hero.icon  = "at019_0"       → /images/HeadIconAtals/at019_0.webp
 *   pet.monImg = "colect_mon_007" → /images/PicHandBookPanel_Atlas/colect_mon_007.webp
 * 直接把手文件名传给 getImageUrl 会得到 /at019_0.webp —— 404。
 */
const heroPortrait = hero => getImageUrl(`/images/HeadIconAtals/${hero.icon}.webp`)
const petIcon = pet => getImageUrl(`/images/PicHandBookPanel_Atlas/${pet.monImg}.webp`)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [heroData, petData] = await Promise.all([
      fetchWithFallback('data/parsed/heroes.json'),
      fetchWithFallback('data/parsed/pets.json'),
    ])
    heroes.value = (heroData.heroes || heroData.list || []).map(toHeroRecord)
    pets.value = (petData.pets || petData.list || []).map(toPetRecord)
  } catch (error) {
    errorMessage.value = `模拟数据加载失败：${error?.message || error}`
  } finally {
    loading.value = false
  }
}

onMounted(load)

const filteredHeroes = computed(() => {
  const q = heroQuery.value.trim().toLowerCase()
  return heroes.value.filter(h => {
    if (jobFilter.value && h.jobName !== jobFilter.value) return false
    if (elFilter.value && h.elementName !== elFilter.value) return false
    if (q && !`${h.name} ${h.jobName} ${h.elementName}`.toLowerCase().includes(q)) return false
    return true
  })
})

const isPicked = id => team.value.some(h => h.id === id)

function toggleHero(hero) {
  const idx = team.value.findIndex(h => h.id === hero.id)
  if (idx >= 0) { team.value.splice(idx, 1); return }
  if (team.value.length >= 4) return
  team.value.push(hero)
}

function removeHero(index) {
  team.value.splice(index, 1)
}

/** 某角色能吃到哪些魔物的队伍被动（全量，用于悬停说明） */
function slotMarks(hero) {
  return pets.value.filter(p => matchesPassive(hero, p.passive))
}

/**
 * 该角色在当前**智能推荐组合**里点亮了几颗（最多 TEAM_SLOTS）。
 * 未选模式/未出结果时退回「能吃到几个」，但上限仍是 TEAM_SLOTS。
 */
function slotHitCount(hero) {
  if (mode.value === 'smart' && bestSolution.value) {
    const idx = team.value.findIndex(h => h.id === hero.id)
    if (idx >= 0) return Math.min(bestSolution.value.counts[idx] || 0, TEAM_SLOTS)
  }
  return Math.min(slotMarks(hero).length, TEAM_SLOTS)
}

/** 悬停提示：列出具体能吃到哪些魔物 */
function markTitle(hero) {
  const marks = slotMarks(hero)
  if (!marks.length) return '没有能吃到该角色的队伍被动'
  return marks.map(p => `${p.name}：${p.passive.raw}`).join('\n')
}

function toggleProtect(id) {
  const i = protectHeroIds.value.indexOf(id)
  if (i >= 0) protectHeroIds.value.splice(i, 1)
  else protectHeroIds.value.push(id)
}

function togglePreferStat(stat) {
  const i = preferStats.value.indexOf(stat)
  if (i >= 0) preferStats.value.splice(i, 1)
  else preferStats.value.push(stat)
}

/** 全部魔物的加成类型（智能推荐筛选用，不受队伍限制） */
const allStats = computed(() => {
  const set = new Set()
  for (const p of pets.value) if (p.passive.stat) set.add(p.passive.stat)
  return [...set].sort()
})

/**
 * 智能推荐：穷举 C(32,3)=4960 种组合求最优。
 * 只有 4960 种，直接算完 —— 不用防抖，也不会有性能问题。
 */
const bestSolution = computed(() => {
  if (!team.value.length) return null
  const { best } = solveBestTeam(team.value, pets.value, {
    protectHeroIds: protectHeroIds.value,
    preferStats: preferStats.value,
    excludeGeneric: excludeGeneric.value,
  })
  return best
})

const totalMarks = computed(() => team.value.reduce((sum, h) => sum + slotMarks(h).length, 0))

/** 当前队伍可吃的加成类型（用于筛选） */
const availableStats = computed(() => {
  const set = new Set()
  for (const h of team.value) for (const p of slotMarks(h)) if (p.passive.stat) set.add(p.passive.stat)
  return [...set].sort()
})

const rankedPets = computed(() => {
  const rows = pets.value.map(pet => {
    const hitHeroes = team.value.filter(h => matchesPassive(h, pet.passive))
    return { pet, hitHeroes, count: hitHeroes.length }
  })
  const filtered = statFilter.value ? rows.filter(r => r.pet.passive.stat === statFilter.value) : rows
  return filtered.sort((a, b) => b.count - a.count || b.pet.passive.value - a.pet.passive.value)
})

const maxCount = computed(() => rankedPets.value[0]?.count || 0)

function onImgError(event) {
  const el = event.target
  if (el && el.dataset.fallback !== '1') {
    el.dataset.fallback = '1'
    el.style.visibility = 'hidden'
  }
}
</script>

<style scoped>
.sim-content { display: flex; flex-direction: column; gap: 12px; }
.sim-counter { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
.count-num { color: var(--accent-ink); font-weight: 700; }
.sim-clear {
  margin-left: auto; padding: 3px 10px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border-color); border-radius: 4px;
  background: transparent; color: var(--text-muted);
}
.sim-clear:hover { color: var(--accent-ink); border-color: var(--accent-bright); }

.sim-section { padding: 14px; }
.sim-section__title { margin: 0 0 10px; font-size: 14px; color: var(--text-main); }
.sim-section__head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.sim-section__head .sim-section__title { margin: 0; }

/* 出战队伍 4 格 */
.sim-team { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.sim-slot {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 10px 6px; min-height: 138px; justify-content: center;
  border: 1px dashed var(--border-color); border-radius: 6px; background: #2b1f1508;
}
.sim-slot.is-filled { border-style: solid; background: var(--paper-soft); }
/* 只命中性位里的**角色立绘**——用 > img 限定直接子级，
   否则会把 .sim-slot__marks 里的点亮图标也撑成 64px（踩过） */
.sim-slot > img { width: 64px; height: 64px; object-fit: contain; }
.sim-slot__name { font-size: 12px; font-weight: 700; color: var(--text-main); }
.sim-slot__meta { font-size: 11px; color: var(--text-muted); }
.sim-slot__empty { font-size: 12px; color: var(--text-muted); }
.sim-slot__marks { display: flex; gap: 2px; justify-content: center; margin-top: 3px; min-height: 16px; }
.sim-slot__mark { width: 16px; height: 14px; object-fit: contain; opacity: .45; }
.sim-slot__mark:not([alt="未点亮"]) { opacity: 1; }

/* 模式切换 */
.sim-mode { display: flex; gap: 6px; margin-left: auto; }
.sim-mode__btn {
  padding: 4px 12px; font-size: 12px; cursor: pointer; border-radius: 4px;
  border: 1px solid var(--border-color); background: transparent; color: var(--text-muted);
}
.sim-mode__btn.is-active { background: var(--accent-bright); border-color: var(--accent-bright); color: #fff; font-weight: 700; }

/* 智能推荐结果 */
.sim-best { margin-top: 10px; padding: 12px; border-radius: 6px; border: 1px solid var(--accent-bright); background: #d49e3514; }
.sim-best__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.sim-best__title { font-size: 13px; font-weight: 700; color: var(--accent-ink); }
.sim-best__sum { font-size: 12px; color: var(--text-muted); }
.sim-best__sum strong { color: var(--accent-ink); font-size: 14px; }
.sim-best__pets { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
.sim-best__pet { display: flex; gap: 8px; align-items: flex-start; padding: 8px; border-radius: 5px; background: var(--paper-soft); }
.sim-best__pet img { width: 42px; height: 42px; object-fit: contain; flex-shrink: 0; }
.sim-best__name { font-size: 12.5px; font-weight: 700; color: var(--text-main); }
.sim-best__desc { margin: 3px 0 0; font-size: 11.5px; line-height: 1.55; color: var(--text-muted); }
.sim-best__counts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; padding-top: 9px; border-top: 1px dashed var(--border-faint); }
.sim-best__count { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-main); }
.sim-best__count img { width: 16px; height: 14px; object-fit: contain; }
.sim-hint { font-size: 11.5px; color: var(--text-muted); }
.sim-slot__remove {
  position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; line-height: 1;
  border: none; border-radius: 50%; cursor: pointer;
  background: #00000022; color: var(--text-muted); font-size: 13px;
}
.sim-slot__remove:hover { background: var(--danger); color: #fff; }
.sim-team__summary { margin: 10px 0 0; font-size: 13px; color: var(--text-muted); }
.sim-team__summary strong { color: var(--accent-ink); }

/* 魔物推荐 */
.sim-pets { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-top: 10px; }
.sim-pet {
  display: flex; gap: 9px; padding: 9px; border-radius: 6px;
  border: 1px solid var(--border-faint); background: #2b1f150a;
}
.sim-pet.is-best { border-color: var(--accent-bright); background: #d49e3514; }
.sim-pet img { width: 46px; height: 46px; object-fit: contain; flex-shrink: 0; }
.sim-pet__body { min-width: 0; flex: 1; }
.sim-pet__head { display: flex; align-items: center; gap: 6px; }
.sim-pet__name { font-size: 13px; font-weight: 700; color: var(--text-main); }
.sim-pet__count { margin-left: auto; font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 3px; }
.sim-pet__count.lv0 { background: #00000012; color: var(--text-muted); }
.sim-pet__count.lv1 { background: #d49e3526; color: #8c5d1a; }
.sim-pet__count.lv2 { background: #d49e3540; color: #7a4d10; }
.sim-pet__count.lv3, .sim-pet__count.lv4 { background: var(--accent-bright); color: #fff; }
.sim-pet__desc { margin: 4px 0 0; font-size: 12px; line-height: 1.6; color: var(--text-muted); }
.sim-pet__hit { margin: 4px 0 0; font-size: 11px; color: var(--accent-ink); }

/* 角色选择 */
.sim-heroes { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
.sim-hero {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 7px 4px; cursor: pointer; border-radius: 6px;
  border: 1px solid var(--border-faint); background: transparent;
  transition: border-color .15s ease, transform .15s ease;
}
.sim-hero:hover { border-color: var(--accent-bright); transform: translateY(-2px); }
.sim-hero.is-picked { border-color: var(--accent-bright); background: #d49e3520; }
.sim-hero.is-full { opacity: .45; cursor: not-allowed; }
.sim-hero img { width: 46px; height: 46px; object-fit: contain; }
.sim-hero__name { font-size: 12px; font-weight: 700; color: var(--text-main); }
.sim-hero__meta { font-size: 11px; color: var(--text-muted); }

@media (max-width: 600px) {
  .sim-team { gap: 6px; }
  .sim-slot { min-height: 120px; padding: 8px 3px; }
  .sim-slot > img { width: 48px; height: 48px; }
  .sim-pets { grid-template-columns: 1fr; }
  .sim-heroes { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .sim-hero img { width: 40px; height: 40px; }
}
</style>
