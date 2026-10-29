<template>
  <div class="page-view-container sim-page">
    <!--
      顶部筛选面板：与 `/misc` 同构（UiFilterPanel + 搜索框 + 板块行）。
      「板块：」下先只有「魔物出战」一个模拟，后续加新模拟时并列成多个 pill 即可。
      这里只筛「推荐哪些魔物」，不筛角色 —— 角色由下方出战槽位点弹窗选择。
    -->
    <UiFilterPanel class="sim-filter-panel paper-panel">
      <template #search>
        <UiSearchInput v-model="petQuery" placeholder="搜索魔物名称或被动..." />
      </template>

      <UiFilterRow label="板块：">
        <UiFilterPill
          v-for="b in BOARDS"
          :key="b.id"
          :active="board === b.id"
          :title="b.title"
          :aria-pressed="board === b.id"
          @click="selectBoard(b.id)"
        >{{ b.name }}</UiFilterPill>
      </UiFilterRow>

      <div class="sim-filters">
          <UiFilterRow label="角色加权：">
            <template v-if="team.length">
              <UiFilterPill
                v-for="h in team"
                :key="h.id"
                :active="boostHeroIds.includes(h.id)"
                @click="toggleBoost(h.id)"
              >{{ h.name }}</UiFilterPill>
            </template>
            <span v-else class="sim-filters__empty">先选角色后可按角色加权</span>
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
            <UiSegmentedToggle
              :model-value="excludeGeneric"
              aria-label="通用被动开关"
              :options="GENERIC_OPTIONS"
              @update:model-value="excludeGeneric = $event"
            />
          </UiFilterRow>
      </div>
    </UiFilterPanel>

    <UiEmptyState v-if="loading" type="loading" text="正在装配模拟数据..." />
    <UiEmptyState v-else-if="errorMessage" type="error" :text="errorMessage" @retry="load" />

    <!--
      🔴 正文滚动容器必须带 data-main-scroll（UI_COMPONENT_LIBRARY §3 第 9 条）。
      UiCardGrid 自带该标记，所以这里用它当外壳，内容用单列 content-style 铺开，
      不再自建 div —— 自建容器漏标会让内容滚到筛选框上方，且失败是静默的。
    -->
    <UiCardGrid v-else id="simsScroll" class="sim-content" :content-style="{ gridTemplateColumns: 'minmax(0, 1fr)' }">
      <!--
        出战队伍 + 魔物搭配 放在**同一张面板**里：
        上半是出战队伍（可折叠），下半是魔物搭配。
      -->
      <section class="sim-board-body paper-panel">
        <!-- 出战队伍：标题右侧带展开/收起 -->
        <UiSection
          class="sim-team-section"
          :class="{ 'is-collapsed': !teamOpen }"
          title="出战队伍"
          collapsible
          :open="teamOpen"
          @update:open="teamOpen = $event"
        >
          <template #title-end>
            <span class="sim-team-count">{{ team.length }} / 4</span>
          </template>

          <div class="sim-team">
            <div
              v-for="i in 4"
              :key="i"
              class="sim-slot"
              :class="{ 'is-filled': team[i - 1] }"
              @click="openPicker(i - 1)"
            >
              <template v-if="team[i - 1]">
                <div class="sim-slot__card-wrap">
                  <HeroPickCard class="sim-slot__card" :hero="team[i - 1]" :clickable="false" />
                  <!-- 移除按钮 -->
                  <button class="sim-slot__remove" title="移出队伍" @click.stop="removeHero(i - 1)">×</button>
                </div>
                <div class="sim-slot__info">
                  <!-- 职业与属性标签 -->
                  <div class="sim-slot__tags">
                    <span class="sim-slot__tag sim-slot__tag--job">{{ team[i - 1].jobName }}</span>
                    <span class="sim-slot__tag sim-slot__tag--elem" :class="`elem--${team[i - 1].elementName}`">
                      {{ team[i - 1].elementName }}
                    </span>
                  </div>
                  <!-- 队伍被动点亮标记 -->
                  <div class="sim-slot__buff-row" :title="markTitle(team[i - 1])">
                    <span class="sim-slot__marks">
                      <img
                        v-for="n in TEAM_SLOTS"
                        :key="n"
                        class="sim-slot__mark"
                        :src="n <= slotHitCount(team[i - 1]) ? TEAM_BUFF_ON : TEAM_BUFF_OFF"
                        :alt="n <= slotHitCount(team[i - 1]) ? '已点亮' : '未点亮'"
                      >
                    </span>
                    <span
                      class="sim-slot__buff-badge"
                      :class="{
                        'is-full': slotHitCount(team[i - 1]) === TEAM_SLOTS,
                        'is-partial': slotHitCount(team[i - 1]) > 0 && slotHitCount(team[i - 1]) < TEAM_SLOTS,
                        'is-zero': slotHitCount(team[i - 1]) === 0
                      }"
                    >
                      {{ slotHitCount(team[i - 1]) }}/{{ TEAM_SLOTS }}
                    </span>
                  </div>
                </div>
              </template>
              <div v-else class="sim-slot__empty">
                <div class="sim-slot__add-icon">
                  <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.2" fill="none">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </div>
                <span class="sim-slot__add-title">选择角色</span>
                <span class="sim-slot__add-sub">角色 {{ i }}</span>
              </div>
            </div>
          </div>
          <div class="sim-team__foot">
            <span v-if="team.length" class="sim-team__summary">
              全队适配魔物候选：<strong>{{ candidatePetCount }}</strong> 只
            </span>
            <!-- 与魔物收益页（PetsEggsView）的「重置」同款：UiButton secondary + sm -->
            <UiButton v-if="team.length" size="sm" variant="secondary" @click="team = []">清空队伍</UiButton>
          </div>
        </UiSection>

        <!-- 收起时的整行角色摘要栏（位于出战队伍和魔物搭配之间） -->
        <div
          v-if="!teamOpen && team.length"
          class="sim-team-collapsed-bar"
          role="button"
          tabindex="0"
          title="点击展开队伍"
          @click="teamOpen = true"
          @keydown.enter="teamOpen = true"
        >
          <div class="sim-team-collapsed-bar__chips">
            <span
              v-for="h in team"
              :key="h.id"
              class="sim-team-collapsed-chip"
              :title="`${h.name}（${h.jobName} · ${h.elementName}）`"
            >
              <img :src="getImageUrl(`/images/HeroBagPanel/${h.img}_ka.webp`)" :alt="h.name">
              <span class="collapsed-name">{{ h.name }}</span>
              <span class="collapsed-elem" :class="`elem--${h.elementName}`">{{ h.elementName }}</span>
            </span>
          </div>
        </div>

        <!-- 魔物搭配：接在出战队伍下面 -->
        <div class="sim-pets-section">
          <div class="sim-section__head">
            <h3 class="sim-section__title">魔物搭配</h3>
            <UiSegmentedToggle
              v-model="mode"
              class="sim-mode"
              aria-label="推荐模式切换"
              :options="MODE_OPTIONS"
            />
          </div>

          <!-- 智能推荐：自动挑出点亮总数最高的 3 只组合 -->
          <template v-if="mode === 'smart'">
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
                  <div class="sim-best__pet-body">
                    <div class="sim-best__pet-head">
                      <span class="sim-best__name">{{ pet.name }}</span>
                      <span class="sim-best__hit-badge" :class="{ 'has-hit': getHitHeroes(pet).length > 0 }">
                        {{ getHitHeroes(pet).length ? `${getHitHeroes(pet).length} 人受益` : '无受益' }}
                      </span>
                    </div>
                    <p class="sim-best__desc" v-html="formatPassiveHtml(pet.passive?.raw)"></p>
                    <div class="sim-best__hit-list">
                      <span class="sim-best__hit-label">受益：</span>
                      <span v-if="getHitHeroes(pet).length" class="sim-best__hit-heroes">
                        {{ getHitHeroes(pet).map(h => h.name).join('、') }}
                      </span>
                      <span v-else class="sim-best__hit-empty">当前队伍无人受益</span>
                    </div>
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

          <!-- 自组查看：列全部魔物，按命中人数排，支持手动选 3 只出战 -->
          <template v-else>
            <!-- 当前自选出战组合栏 -->
            <div class="sim-manual-roster">
              <div class="sim-manual-roster__head">
                <span class="sim-manual-roster__title">
                  当前自选魔物组合 (<strong>{{ manualPets.length }}</strong> / {{ TEAM_SLOTS }})
                  <span v-if="manualPets.length && team.length" class="sim-manual-roster__hits">
                    · 共点亮 <strong>{{ manualTotalHits }}</strong> / {{ team.length * TEAM_SLOTS }} 词条
                  </span>
                </span>
                <UiButton v-if="manualPets.length" size="sm" variant="secondary" @click="clearManualPets">清空自选</UiButton>
              </div>
              <div class="sim-manual-roster__cards">
                <div v-for="pet in manualPets" :key="pet.id" class="sim-manual-chip">
                  <img :src="petIcon(pet)" :alt="pet.name" loading="lazy" @error="onImgError">
                  <div class="sim-manual-chip__info">
                    <span class="sim-manual-chip__name">{{ pet.name }}</span>
                    <span class="sim-manual-chip__hit">{{ getHitHeroes(pet).length }}人受益</span>
                  </div>
                  <button class="sim-manual-chip__remove" title="移出组合" @click="toggleManualPet(pet)">×</button>
                </div>
                <div v-for="n in (TEAM_SLOTS - manualPets.length)" :key="`empty-${n}`" class="sim-manual-chip is-empty">
                  <span>待选</span>
                </div>
              </div>
            </div>

            <UiFilterRow label="加成筛选：">
              <!--
                点击走 selectStat()：它会先稳住滚动位置再改筛选。
                直接写 `@click="statFilter = s"` 会让页面在切换瞬间向上跳。
              -->
              <UiFilterPill :active="!statFilter" @click="selectStat('')">全部</UiFilterPill>
              <UiFilterPill
                v-for="s in availableStats"
                :key="s"
                :active="statFilter === s"
                @click="selectStat(s)"
              >{{ s }}</UiFilterPill>
            </UiFilterRow>
            <div class="sim-pets">
              <article
                v-for="row in rankedPets"
                :key="row.pet.id"
                class="sim-pet"
                :class="{
                  'is-manual-picked': isManualSelected(row.pet.id)
                }"
              >
                <img :src="petIcon(row.pet)" :alt="row.pet.name" loading="lazy" @error="onImgError">
                <div class="sim-pet__body">
                  <div class="sim-pet__head">
                    <span class="sim-pet__name">{{ row.pet.name }}</span>
                    <span class="sim-pet__count" :class="`lv${Math.min(row.count, 4)}`">{{ row.count }} 人</span>
                    <button
                      class="sim-pet__pick-btn"
                      :class="{ 'is-picked': isManualSelected(row.pet.id) }"
                      @click="toggleManualPet(row.pet)"
                    >
                      {{ isManualSelected(row.pet.id) ? '已入选' : '+ 出战' }}
                    </button>
                  </div>
                  <p class="sim-pet__desc" v-html="formatPassiveHtml(row.pet.passive.raw)"></p>
                  <p class="sim-pet__hit">
                    <template v-if="row.hitHeroes.length">受益：{{ row.hitHeroes.map(h => h.name).join('、') }}</template>
                    <template v-else>当前队伍无人受益</template>
                  </p>
                </div>
              </article>
              <UiEmptyState v-if="!rankedPets.length" text="没有符合筛选条件的魔物" />
            </div>
          </template>
        </div>
      </section>
    </UiCardGrid>

    <!-- 选人弹窗：用立绘卡片；点选即填入当前槽位 -->
    <UiModal
      v-model:visible="pickerVisible"
      :title="`选择角色 · 第 ${pickerSlot + 1} 位`"
      max-width="900px"
      scroll-id="heroPickerScroll"
      :z-index="2000"
    >
      <!-- 弹窗搜索框 -->
      <div class="sim-picker-search">
        <UiSearchInput v-model="heroQuery" placeholder="搜索角色名称、职业或属性..." />
      </div>

      <!--
        筛选样式沿用角色图鉴 `/heroes`：UiFilterPill（选中 = 深木实心）。
        星级用 quality 上色（5金/4紫/3蓝），与图鉴一致。

        🔴 必须用 UiFilterPanel 包起来（collapsible=false 只保留筛选行）：
        `UiFilterRow` 自身没有行间距，行距由父容器的 gap 决定。
        直接放在 modal body 里（display:block）会让三行贴在一起。
      -->
      <UiFilterPanel class="sim-picker-filter" :collapsible="false">
        <UiFilterRow label="稀有度：">
          <UiFilterPill :active="!rareFilter" @click="rareFilter = ''">全部</UiFilterPill>
          <UiFilterPill
            v-for="r in [5, 4, 3]"
            :key="r"
            :quality="r"
            :active="rareFilter === r"
            @click="rareFilter = r"
          >{{ r }}星</UiFilterPill>
        </UiFilterRow>
        <UiFilterRow label="职业：">
          <UiFilterPill :active="!jobFilter" @click="jobFilter = ''">全部</UiFilterPill>
          <UiFilterPill v-for="j in JOBS" :key="j" :active="jobFilter === j" @click="jobFilter = j">{{ j }}</UiFilterPill>
        </UiFilterRow>
        <UiFilterRow label="属性：">
          <UiFilterPill :active="!elFilter" @click="elFilter = ''">全部</UiFilterPill>
          <UiFilterPill v-for="e in ELEMENTS" :key="e" :active="elFilter === e" @click="elFilter = e">{{ e }}</UiFilterPill>
        </UiFilterRow>
      </UiFilterPanel>

      <!--
        滚动交给 UiModal 的 scrollId="heroPickerScroll"（它会把该 id 挂在 ui-modal-body 上）。
        这里**不能**再套一个同 id 的 div —— 重复 id 会让点击被上层元素拦截。
      -->
      <div class="sim-picker">
        <HeroPickCard
          v-for="h in filteredHeroes"
          :key="h.id"
          :hero="h"
          :picked="isPicked(h.id)"
          @click="pickHero(h)"
        />
        <UiEmptyState v-if="!filteredHeroes.length" text="没有符合条件的角色" />
      </div>
      <UiBackToTop scroll-container="#heroPickerScroll" />
    </UiModal>

    <UiBackToTop scroll-container="#simsScroll" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getImageUrl } from '../utils/env'
import { fetchWithFallback } from '../utils/request'
import { matchesPassive, isGenericPassive, ELEMENTS, JOBS, formatPassiveHtml } from '../utils/simsData'
import { solveBestTeam, TEAM_SLOTS } from '../utils/simsSolver'
import UiFilterPanel from '../components/ui/UiFilterPanel.vue'
import UiFilterRow from '../components/ui/UiFilterRow.vue'
import UiFilterPill from '../components/ui/UiFilterPill.vue'
import UiSearchInput from '../components/ui/UiSearchInput.vue'
import UiCardGrid from '../components/ui/UiCardGrid.vue'
import UiEmptyState from '../components/ui/UiEmptyState.vue'
import UiBackToTop from '../components/ui/UiBackToTop.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiSection from '../components/ui/UiSection.vue'
import UiModal from '../components/ui/UiModal.vue'
import UiSegmentedToggle from '../components/ui/UiSegmentedToggle.vue'
import HeroPickCard from '../components/heroes/HeroPickCard.vue'

/** 游戏原素材：队伍被动点亮/未点亮标记（来自 PetPanel_Atlas） */
const TEAM_BUFF_ON = getImageUrl('/images/PetPanel_Atlas/team_buff_on.webp')
const TEAM_BUFF_OFF = getImageUrl('/images/PetPanel_Atlas/team_buff.webp')

const route = useRoute()
const router = useRouter()

const heroes = ref([])
const pets = ref([])
const team = ref([])
const loading = ref(true)
const errorMessage = ref('')

const heroQuery = ref('')
const jobFilter = ref('')
const elFilter = ref('')
/** 星级筛选：'' = 全部；3/4/5 = 对应 rare */
const rareFilter = ref('')
const statFilter = ref('')

/** 模式切换选项。写成常量而不是模板内联数组 —— 多行对象字面量会让 Vue 模板编译器报 Unexpected token */
const MODE_OPTIONS = [
  { value: 'smart', label: '智能推荐', title: '自动求出点亮最多的 3 只组合' },
  { value: 'manual', label: '自组查看', title: '列出全部魔物，按命中人数排序' },
]

/** 通用被动开关选项 */
const GENERIC_OPTIONS = [
  { value: true, label: '排除通用被动', title: '通用 = 不限属性/职业，对谁都生效，拿来凑满没意义' },
  { value: false, label: '包含通用被动', title: '把不限属性/职业的被动也算进来' },
]

/**
 * 板块列表。
 *
 * 「相关模拟」是**容器页**，`/sims` 本身不代表任何单个模拟；
 * 每个模拟是一个板块，用 `?tab=` 寻址（与 `/misc?tab=pvp` 同构）。
 * 新增模拟时往这里加一项即可，筛选行的 pill 自动出现。
 */
const BOARDS = [{ id: 'monster-team', name: '魔物出战', title: '按队伍被动推荐 3 只出战魔物' }]

/** 板块 id 白名单；非法值一律回落到第一个（与 RewardsView 的 resolveMainCategory 同策略） */
const resolveBoard = (value) => (BOARDS.some((b) => b.id === value) ? value : BOARDS[0].id)

/** 顶部「板块」当前选中项 —— 由 URL `?tab=` 决定，不是组件私有状态 */
const board = ref(resolveBoard(route.query.tab))

/**
 * 板块切换：写回组件状态并同步 URL。
 *
 * 用 `router.replace` 而不是 `push`：板块切换属于页内导航，
 * 不该在浏览器历史里堆一层（否则按后退会一个个退板块，退不出本页）。
 *
 * 🔴 不要因为「值没变」就提前 return：那样首次进入（URL 上没有 `?tab=`）
 * 时点板块什么都不写，地址栏始终缺参数，用户复制到的链接无法指示当前板块。
 */
const selectBoard = async (id) => {
  const next = resolveBoard(id)
  board.value = next
  if (route.query.tab === next) return
  await router.replace({ query: { ...route.query, tab: next } })
}

/**
 * URL → 状态：支持前进/后退、直接粘贴 `?tab=xxx` 冷链接。
 *
 * 不在 `resolveBoard` 里做跳转：那是"解析函数里的副作用"，
 * 会被随后的 replace 覆盖掉（`RewardsView` 踩过这个坑，见其注释）。
 */
watch(
  () => route.query.tab,
  (tab) => {
    board.value = resolveBoard(tab)
  }
)

/**
 * 切换「加成筛选」。
 *
 * ## 为什么不做滚动位置补偿
 *
 * 曾尝试用「min-height + 记录 scrollTop」撑住页面高度，让切换后滚动位置不变。
 * 实测这是错的方向：
 *   - 列表被撑到「视口 + 已滚距离」，页面中间多出一大片空白（用户直接看到）；
 *   - 补偿定时释放后高度又缩回去，形成**第二次跳动**，比原来的问题更糟。
 *
 * 现在保持浏览器原生行为：内容变短 → `scrollTop` 按规范被夹到新上限。
 * 左右两栏是 `sticky` 独立布局，它们相对视口的位置全程不变
 * （实测面板 top 恒为 93、导航首项恒为 159.19），所以「导航上下移动」的
 * 观感来自页面滚动位置变化，而不是导航本身在动。
 */
const selectStat = (value) => {
  statFilter.value = value
}

/**
 * 进入页面时把规范化后的板块写进 URL。
 *
 * 覆盖两种情况：地址上没有 `?tab=`；或 `?tab=` 是非法值（已回落到首个板块）。
 * 这样「相关模拟」的每个板块都有可复制、可直达的地址，
 * 与 `/misc?tab=pvp` 的行为一致。
 * 仅在参数确实不同时才 replace，避免与路由守卫互相触发。
 */
const normalizeBoardQuery = async () => {
  const raw = typeof route.query.tab === 'string' ? route.query.tab : ''
  // 地址上没有 tab，或 tab 是非法值 → 一律写成规范化后的板块 id
  if (raw === board.value) return
  await router.replace({ query: { ...route.query, tab: board.value } })
}

/** 顶部搜索：筛魔物（名称 / 被动描述） */
const petQuery = ref('')

/** 出战队伍区块是否展开（标题右侧的折叠按钮控制） */
const teamOpen = ref(true)

/** 'smart' = 智能推荐（自动求最优 3 只）；'manual' = 自组查看（列全部） */
const mode = ref('smart')
/** 智能推荐：要提权的角色 id（点一下加权重，不强制吃满） */
const boostHeroIds = ref([])
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
    /*
     * 读**预处理后的精简表**（约 13 KB），不再运行时解析 heroes.json(2.0 MB)。
     * 该表由 `npm run data:sims` 生成，字段口径与 simsData 的
     * toHeroRecord / toPetRecord 完全一致，所以这里直接用，不再二次提取。
     */
    const data = await fetchWithFallback('data/parsed/sims.json')
    heroes.value = data.heroes || []
    pets.value = data.pets || []
  } catch (error) {
    errorMessage.value = `模拟数据加载失败：${error?.message || error}`
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // 先规范化板块参数（地址上没有 `?tab=` 时补上当前板块），再拉数据
  await normalizeBoardQuery()
  await load()
})

/**
 * 筛选 + 排序。
 *
 * 排序**保持数据原始顺序**，与角色图鉴 `/heroes` 一致
 * （HeroesView 的 filteredHeroes 也不排序，直接沿用 allHeroes 的顺序）。
 * 不要按星级或名字重排 —— 那会与角色图鉴的顺序对不上。
 */
const filteredHeroes = computed(() => {
  const q = heroQuery.value.trim().toLowerCase()
  return heroes.value.filter(h => {
    if (rareFilter.value && h.rare !== rareFilter.value) return false
    if (jobFilter.value && h.jobName !== jobFilter.value) return false
    if (elFilter.value && h.elementName !== elFilter.value) return false
    if (q && !`${h.name} ${h.jobName} ${h.elementName}`.toLowerCase().includes(q)) return false
    return true
  })
})

const isPicked = id => team.value.some(h => h.id === id)

/** 选人弹窗：当前正在填哪个槽位 */
const pickerVisible = ref(false)
const pickerSlot = ref(0)

function openPicker(slotIndex) {
  pickerSlot.value = slotIndex
  heroQuery.value = ''
  pickerVisible.value = true
}

/** 点选：填入当前槽位；若该角色已在别处，则与别处交换（避免重复） */
function pickHero(hero) {
  const existing = team.value.findIndex(h => h.id === hero.id)
  const slot = pickerSlot.value

  if (existing >= 0) {
    // 已选：若点的就是本槽，等同取消；否则交换位置
    if (existing === slot) { team.value.splice(existing, 1); pickerVisible.value = false; return }
    const tmp = team.value[slot]
    team.value[slot] = hero
    team.value[existing] = tmp
    // tmp 可能是 undefined（空槽），过滤掉
    team.value = team.value.filter(Boolean)
    pickerVisible.value = false
    return
  }

  // 未选：填空槽或替换当前槽
  if (slot < team.value.length) team.value[slot] = hero
  else team.value.push(hero)
  pickerVisible.value = false
}

function removeHero(index) {
  team.value.splice(index, 1)
}

/** 自组查看模式：用户手动挑选的出战魔物（最多 3 只） */
const manualPets = ref([])

function isManualSelected(petId) {
  return manualPets.value.some(p => p.id === petId)
}

function toggleManualPet(pet) {
  const idx = manualPets.value.findIndex(p => p.id === pet.id)
  if (idx >= 0) {
    manualPets.value.splice(idx, 1)
  } else {
    if (manualPets.value.length >= TEAM_SLOTS) {
      manualPets.value.shift()
    }
    manualPets.value.push(pet)
  }
}

function clearManualPets() {
  manualPets.value = []
}

/** 计算某魔物对当前出战队伍哪些角色生效 */
function getHitHeroes(pet) {
  if (!team.value.length || !pet?.passive) return []
  return team.value.filter(h => matchesPassive(h, pet.passive))
}

/** 自组模式下点亮词条总数 */
const manualTotalHits = computed(() => {
  if (!manualPets.value.length || !team.value.length) return 0
  let sum = 0
  for (const pet of manualPets.value) {
    sum += team.value.filter(h => matchesPassive(h, pet.passive)).length
  }
  return sum
})

/** 某角色能吃到哪些魔物的队伍被动（全量，用于悬停说明） */
function slotMarks(hero) {
  return pets.value.filter(p => matchesPassive(hero, p.passive))
}

/**
 * 该角色在当前出战组合里点亮了几颗（最多 TEAM_SLOTS）。
 * - 智能推荐模式：取算法推荐的最优 3 只
 * - 自组查看模式：取用户手动挑选的魔物
 * - 未出结果/未选时退回「全图鉴能吃到几个」，但上限仍是 TEAM_SLOTS。
 */
function slotHitCount(hero) {
  if (mode.value === 'smart' && bestSolution.value) {
    const idx = team.value.findIndex(h => h.id === hero.id)
    if (idx >= 0) return Math.min(bestSolution.value.counts[idx] || 0, TEAM_SLOTS)
  }
  if (mode.value === 'manual' && manualPets.value.length) {
    return manualPets.value.filter(p => matchesPassive(hero, p.passive)).length
  }
  return Math.min(slotMarks(hero).length, TEAM_SLOTS)
}

/** 悬停提示：列出具体能吃到哪些魔物 */
function markTitle(hero) {
  const marks = slotMarks(hero)
  if (!marks.length) return '全图鉴没有能吃到该角色的队伍被动'

  let activePets = []
  if (mode.value === 'smart' && bestSolution.value) {
    activePets = bestSolution.value.combo.filter(p => matchesPassive(hero, p.passive))
  } else if (mode.value === 'manual' && manualPets.value.length) {
    activePets = manualPets.value.filter(p => matchesPassive(hero, p.passive))
  }

  const lines = []
  if (activePets.length) {
    lines.push(`【当前生效 (${activePets.length}/3)】`)
    lines.push(...activePets.map(p => `• ${p.name}：${p.passive.raw}`))
    lines.push('')
  }
  lines.push(`【全图鉴适配候选 (${marks.length}只)】`)
  lines.push(...marks.map(p => `• ${p.name}：${p.passive.raw}`))
  return lines.join('\n')
}

function toggleBoost(id) {
  const i = boostHeroIds.value.indexOf(id)
  if (i >= 0) boostHeroIds.value.splice(i, 1)
  else boostHeroIds.value.push(id)
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
  // 顶部搜索生效时，只在匹配到的魔物里求最优组合
  const q = petQuery.value.trim().toLowerCase()
  const pool = q
    ? pets.value.filter(p => `${p.name} ${p.passive.raw}`.toLowerCase().includes(q))
    : pets.value
  const { best } = solveBestTeam(team.value, pool, {
    boostHeroIds: boostHeroIds.value,
    preferStats: preferStats.value,
    excludeGeneric: excludeGeneric.value,
  })
  return best
})

/**
 * 全队可选魔物数：**至少一个角色能吃到其被动的魔物**，去重。
 *
 * 🔴 不要用「各角色可吃到数之和」。
 * 同一只魔物可能同时满足多个角色的属性/职业条件，相加会重复计数，
 * 结果甚至超过魔物总数（32 只）。实测 4 人队伍：求和 55、去重 23。
 * 文案写的是「候选魔物 X 只」，所以必须是去重后的数量。
 */
const candidatePetCount = computed(() => {
  if (!team.value.length) return 0
  return pets.value.filter((pet) =>
    team.value.some((hero) => matchesPassive(hero, pet.passive))
  ).length
})

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
  const q = petQuery.value.trim().toLowerCase()
  const filtered = rows.filter(r => {
    /*
     * 顶部「其他：排除通用被动 / 包含通用被动」必须同时作用于**两种模式**。
     *
     * 智能推荐在求解器里筛过 pool，自组查看是本列表 —— 原先漏了这个判断，
     * 于是开着「排除通用被动」时，自组里仍会列出「队伍伙伴 暴击率 +5%」
     * 这类不限属性/职业的魔物，两种模式的口径就对不上了。
     * 判定与求解器共用 `isGenericPassive()`。
     */
    if (excludeGeneric.value && isGenericPassive(r.pet.passive)) return false
    if (statFilter.value && r.pet.passive.stat !== statFilter.value) return false
    if (q) {
      const hay = `${r.pet.name} ${r.pet.passive.raw}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  return filtered.sort((a, b) => b.count - a.count || b.pet.passive.value - a.pet.passive.value)
})

function onImgError(event) {
  const el = event.target
  if (el && el.dataset.fallback !== '1') {
    el.dataset.fallback = '1'
    el.style.visibility = 'hidden'
  }
}
</script>

<style scoped>
/*
 * 页面容器填满可用高度，内容靠 flex 分配。
 *
 * 🔴 不能让它被内容撑开：内容总高超过「视口 - header」时，`.main-layout-row`
 * 会被撑高（实测 927 vs 900），整页就多出可滚动的一条 —— 明明已经显示完了。
 * 参照 `/misc`：它的 page 正好等于可用高度（787），内容不足时由容器拉伸。
 */
/*
 * 页面填满主视图区，正文区自己滚动。
 *
 * 🔴 这里必须用 height:100% + min-height:0 的组合，且父级 .app-main 已 overflow:hidden：
 * 内容（筛选 250 + 正文 552 = 802）会超过可用高度 787，不限制的话
 * `.main-layout-row` 被撑到 951，整页多出滚动条 —— 明明内容已经显示完了。
 * 参照 `/misc`：它的子元素合计 528 < 787，所以不会撑破。
 */
.sim-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

/* 筛选面板固定高度，不参与伸缩 */
.sim-filter-panel { flex: 0 0 auto; }

/*
 * 多行筛选项的容器。
 *
 * 🔴 必须显式 gap，不能靠 `.filter-panel` 的 `gap: 10px` 传下来 ——
 * 那条 gap 只作用于面板的**直接子元素**，而这里多包了一层，
 * 面板里的「板块」行与本容器之间吃到 10px，容器内部的各行却拿到 0。
 *
 * 实测（1920×915）：修复前相邻行间隙是 `10, 0, 0`，
 * 而 `/items` 是 `10`、`/misc` 是 `8`（每个 wrapper 只包一行，靠面板 gap）。
 * 这就是本页筛选行挤在一起的原因。
 */
.sim-filters {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* 正文区吃掉剩余高度；内部自己滚动，不再把整页撑高 */
/*
 * 正文区吃掉筛选面板之外的剩余高度。
 * 再往下一层（.sim-board-body）也要 flex:1 —— 只让外层撑开而面板本身不撑，
 * 面板底边会比左右两栏高出一截（实测差 43px）。
 */
/*
 * `UiCardGrid` 把 `sim-content` 挂在自己的滚动容器上，而它内部写了
 * `.ui-card-grid-scroll { flex: 1; min-height: 0 }` 与 `flex: 0 0 auto` 的竞争，
 * 且 scoped 属性选择器优先级高于这里的类选择器 —— 实测 flex 仍是 0 0 auto。
 * 用 !important 明确压过它，让这个容器在本页伸展到底（底边与左右两栏对齐）。
 */
/*
 * 正文区高度策略：**min-height 托底 + 内容可增长**。
 *
 * 目标两条同时成立：
 *   ① 内容少时（空槽、2 人）→ 撑满剩余高度，面板底边与左右两栏齐平
 *   ② 内容多时（4 人 + 推荐结果）→ 自然变高，交给桌面端整页滚动
 *
 * 🔴 不要用 `flex: 1 1 0`：那会把高度锁死在剩余空间（实测 510px），
 * 而选中 4 人后内容需要 644px，多出的部分被挤出可视区，整页被撑到 1014px。
 * 也不要用 `height: 100%`：`.app-main` 桌面端是 height:auto，会形成循环。
 *
 * min-height 的 262px = 筛选面板 250 + 页面 gap 12。
 */
.sim-content {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 0;
  padding: 2px 0 0;
  /* .sim-page 的 12px gap 在底部也占一格；负 margin 抵消，让面板底边贴齐左右两栏 */
  margin-bottom: -12px;
}

/* UiCardGrid 内部自适应撑满，使背景羊皮纸面板延展到底部 */
.sim-content > :deep(.ui-card-grid) {
  flex: 1 1 auto !important;
  display: flex !important;
  flex-direction: column !important;
  min-height: 100% !important;
  align-content: stretch;
  padding-bottom: 0 !important;
}

.sim-board-body {
  padding: 0;
  /* 撑满正文区剩余全部高度，底边延展对齐到底部 */
  flex: 1 1 auto !important;
  min-height: 100% !important;
  display: flex;
  flex-direction: column;
}

/* 出战队伍区块：UiSection 默认 body 无内边距，这里补上 */
.sim-team-section {
  padding: 12px 14px;
  margin-bottom: 0 !important;
}
.sim-team-section.is-collapsed {
  padding: 10px 14px 2px;
  margin-bottom: 0 !important;
}
.sim-team-section.is-collapsed :deep(.ui-section__title) {
  margin-bottom: 0 !important;
  padding-bottom: 0 !important;
  border-bottom: none !important;
}
.sim-team-section :deep(.ui-section__body) { padding-top: 10px; }
.sim-team-count { font-size: 12px; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }

/* 收起时的整行队伍摘要栏（4 等分填满整行宽度，与出战 4 卡位对齐） */
.sim-team-collapsed-bar {
  display: flex;
  align-items: center;
  padding: 0 14px 10px;
  margin-top: 0;
  cursor: pointer;
  transition: background .15s ease;
  user-select: none;
  width: 100%;
  box-sizing: border-box;
}
.sim-team-collapsed-bar:hover {
  background: rgba(122, 154, 153, 0.08);
}
.sim-team-collapsed-bar__chips {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}
.sim-team-collapsed-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  font-size: 12px;
  color: var(--text-main);
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.04);
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}
.sim-team-collapsed-chip img {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.collapsed-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collapsed-elem {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 700;
  flex-shrink: 0;
}
.collapsed-elem.elem--火 { color: #b91c1c; background: rgba(220, 38, 38, 0.1); }
.collapsed-elem.elem--水 { color: #0284c7; background: rgba(2, 132, 199, 0.1); }
.collapsed-elem.elem--风 { color: #047857; background: rgba(16, 149, 106, 0.1); }
.collapsed-elem.elem--地 { color: #92400e; background: rgba(180, 83, 9, 0.1); }

/* 出战队伍底部：合计说明 + 清空按钮 */
.sim-team__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  min-height: 26px;
}

/* 魔物搭配：与出战队伍之间留分隔线，自身带内边距 */
.sim-pets-section {
  padding: 12px 14px 14px;
  border-top: 1px dashed var(--border-faint);
}
.sim-pets-section .sim-section__head { margin-bottom: 10px; }

/*
 * 「请先选择角色」这类占位：全局 UiEmptyState 上下各 40px，在本页会把
 * 整页内容顶到超出可用高度（超出 15px → 桌面端整页出现滚动条）。
 * 这里只在本页收窄，不改全局组件。
 */
.sim-pets-section :deep(.ui-empty-state) { padding: 10px 16px; }
/*
 * 已选计数 + 右侧「清空」按钮。
 * 布局对齐魔物收益页（PetsEggsView）的 `.control-row-2`：flex + space-between，
 * 让按钮贴右；按钮本体用同款 UiButton secondary/sm。
 */
.sim-counter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  font-size: 13px;
  color: var(--text-muted);
}
.count-num { color: var(--accent-ink); font-weight: 700; }

/*
 * 🔴 必须用 flex + gap:10px。
 *
 * `UiFilterRow` 自己只管行内布局（label + 选项），**行与行之间的间距由父容器决定** ——
 * `UiFilterPanel` 里是 `.ui-filter-content { gap: inherit }`，而它的父级
 * `.filter-panel` 是 10px（与装备图鉴等页面一致）。
 * 这里若用默认的 `display:block`，行间距离就是 0，几行会挤在一起。
 */
.sim-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}
.sim-section__title { margin: 0; font-size: 14px; color: var(--text-main); }
.sim-section__head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.sim-section__head .sim-section__title { margin: 0; }

/* 出战队伍 4 格 */
.sim-team {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.sim-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 8px 10px;
  border-radius: 8px;
  border: 1px dashed var(--border-color);
  background: rgba(43, 31, 21, 0.02);
  min-height: 204px;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, transform .18s ease, box-shadow .18s ease;
}
.sim-slot:hover {
  border-color: var(--accent);
}
.sim-slot.is-filled {
  border-style: solid;
  border-color: var(--border-soft);
  background: var(--paper-soft);
  box-shadow: 0 1px 3px rgba(43, 31, 21, 0.04);
}
.sim-slot.is-filled:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(43, 31, 21, 0.08);
  border-color: var(--accent);
}

/* 卡片立绘包装 */
.sim-slot__card-wrap {
  position: relative;
  width: 100%;
  max-width: 110px;
  display: flex;
  justify-content: center;
  border-radius: 6px;
}
.sim-slot__card {
  width: 100%;
  display: block;
}
.sim-slot__remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: rgba(40, 30, 20, 0.65);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .15s ease, transform .15s ease;
  z-index: 3;
}
.sim-slot__remove:hover {
  background: var(--danger, #dc2626);
  transform: scale(1.1);
}

/* 角色信息与属性标签 */
.sim-slot__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 100%;
  margin-top: 6px;
}
.sim-slot__tags {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sim-slot__tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.3;
  font-weight: 500;
}
.sim-slot__tag--job {
  background: rgba(43, 31, 21, 0.05);
  color: var(--text-main);
  border: 1px solid var(--border-soft);
}
.sim-slot__tag--elem {
  font-weight: 600;
}
.elem--火, .collapsed-elem.elem--火 {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.2);
}
.elem--水, .collapsed-elem.elem--水 {
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  border: 1px solid rgba(37, 99, 235, 0.2);
}
.elem--风, .collapsed-elem.elem--风 {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.elem--地, .collapsed-elem.elem--地 {
  background: rgba(180, 83, 9, 0.1);
  color: #b45309;
  border: 1px solid rgba(180, 83, 9, 0.2);
}

/* 槽位被动点亮概览 */
.sim-slot__buff-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 18px;
  cursor: help;
}
.sim-slot__marks {
  display: flex;
  gap: 3px;
  align-items: center;
}
.sim-slot__mark {
  width: 15px;
  height: 13px;
  object-fit: contain;
  opacity: .35;
  filter: grayscale(0.8);
}
.sim-slot__mark:not([alt="未点亮"]) {
  opacity: 1;
  filter: none;
}
.sim-slot__buff-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1.3;
  background: rgba(43, 31, 21, 0.05);
  color: var(--text-muted);
}
.sim-slot__buff-badge.is-full {
  background: #d49e3526;
  color: #b45309;
  font-weight: 800;
}
.sim-slot__buff-badge.is-partial {
  background: rgba(122, 154, 153, 0.18);
  color: var(--accent-ink);
}
.sim-slot__buff-badge.is-zero {
  color: var(--text-faint);
  background: rgba(0, 0, 0, 0.04);
}

/* 空槽位展示 */
.sim-slot__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  width: 100%;
  gap: 6px;
  color: var(--text-muted);
  padding: 24px 0;
}
.sim-slot__add-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(43, 31, 21, 0.04);
  border: 1px dashed var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: transform .2s ease, border-color .2s ease, color .2s ease, background .2s ease;
}
.sim-slot:hover .sim-slot__add-icon {
  transform: scale(1.1);
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(122, 154, 153, 0.14);
}
.sim-slot__add-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-main);
}
.sim-slot__add-sub {
  font-size: 11px;
  color: var(--text-faint);
}

/* 模式切换：靠右，样式由 UiSegmentedToggle 提供 */
.sim-mode { margin-left: auto; }

/* 智能推荐结果 */
.sim-best {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--accent-bright);
  background: rgba(122, 154, 153, 0.08);
}
.sim-best__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.sim-best__title { font-size: 13.5px; font-weight: 700; color: var(--accent-ink); }
.sim-best__sum { font-size: 12px; color: var(--text-muted); }
.sim-best__sum strong { color: var(--accent-ink); font-size: 14px; }

/* 推荐 3 只魔物：桌面 3 列排满对称，不留右侧孤儿空间 */
.sim-best__pets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 860px) {
  .sim-best__pets {
    grid-template-columns: 1fr;
  }
}
.sim-best__pet {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 8px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  box-shadow: 0 1px 3px rgba(43, 31, 21, 0.04);
}
.sim-best__pet img {
  width: 44px;
  height: 44px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 6px;
  background: rgba(43, 31, 21, 0.03);
  padding: 2px;
}
.sim-best__pet-body { flex: 1; min-width: 0; }
.sim-best__pet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.sim-best__name { font-size: 13.5px; font-weight: 700; color: var(--text-main); }
.sim-best__hit-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(43, 31, 21, 0.06);
  color: var(--text-muted);
}
.sim-best__hit-badge.has-hit {
  background: rgba(47, 74, 73, 0.12);
  color: var(--accent-ink);
  border: 1px solid rgba(47, 74, 73, 0.2);
}
.sim-best__desc { margin: 6px 0 0; font-size: 12px; line-height: 1.6; color: var(--text-main); }
.sim-best__hit-list {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed var(--border-faint);
  font-size: 11.5px;
  color: var(--text-muted);
}
.sim-best__hit-label { color: var(--text-faint); }
.sim-best__hit-heroes { color: var(--accent-ink); font-weight: 600; }
.sim-best__hit-empty { color: var(--text-faint); }

.sim-best__counts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; padding-top: 9px; border-top: 1px dashed var(--border-faint); }
.sim-best__count { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-main); }
.sim-best__count img { width: 16px; height: 14px; object-fit: contain; }
.sim-hint { font-size: 11.5px; color: var(--text-muted); }
.sim-team__summary { margin: 10px 0 0; font-size: 13px; color: var(--text-muted); }
.sim-team__summary strong { color: var(--accent-ink); }

/* 自选魔物组合栏 */
.sim-manual-roster {
  margin: 6px 0 12px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px dashed var(--accent-bright);
  background: rgba(122, 154, 153, 0.08);
}
.sim-manual-roster__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.sim-manual-roster__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}
.sim-manual-roster__title strong { color: var(--accent-ink); }
.sim-manual-roster__hits { font-size: 12px; font-weight: normal; color: var(--text-muted); }
.sim-manual-roster__hits strong { color: var(--accent-ink); }
.sim-manual-roster__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.sim-manual-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.03);
  height: 48px;
  box-sizing: border-box;
}
.sim-manual-chip img {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 4px;
  background: rgba(43, 31, 21, 0.03);
}
.sim-manual-chip__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.sim-manual-chip__name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sim-manual-chip__hit {
  font-size: 11px;
  color: var(--accent-ink);
  font-weight: 600;
}
.sim-manual-chip__remove {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: var(--text-muted);
  padding: 2px 4px;
}
.sim-manual-chip__remove:hover { color: var(--danger, #dc2626); }
.sim-manual-chip.is-empty {
  border-style: dashed;
  background: transparent;
  justify-content: center;
  color: var(--text-faint);
  font-size: 11.5px;
  height: 48px;
  min-height: 48px;
  box-sizing: border-box;
  padding: 0 10px;
}
.sim-manual-chip.is-empty span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 魔物推荐列表 */
.sim-pets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 10px;
}
.sim-pet {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: var(--paper-soft);
  box-shadow: 0 1px 3px rgba(43, 31, 21, 0.04);
  transition: border-color .15s ease, background .15s ease, transform .15s ease, box-shadow .15s ease;
}
.sim-pet:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(43, 31, 21, 0.08);
}
.sim-pet.is-manual-picked {
  border-color: var(--accent);
  background: var(--paper-soft);
}
.sim-pet img {
  width: 46px;
  height: 46px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 6px;
  background: rgba(43, 31, 21, 0.03);
  padding: 2px;
}
.sim-pet__body { min-width: 0; flex: 1; }
.sim-pet__head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sim-pet__name { font-size: 13.5px; font-weight: 700; color: var(--text-main); }
.sim-pet__count {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
}
.sim-pet__count.lv0 { background: rgba(0, 0, 0, 0.05); color: var(--text-muted); }
.sim-pet__count.lv1 { background: rgba(107, 81, 52, 0.1); color: var(--text-muted); }
.sim-pet__count.lv2 { background: rgba(180, 83, 9, 0.12); color: #92400e; }
.sim-pet__count.lv3, .sim-pet__count.lv4 {
  background: rgba(47, 74, 73, 0.12);
  color: var(--accent-ink);
  border: 1px solid rgba(47, 74, 73, 0.2);
}
.sim-pet__pick-btn {
  margin-left: auto;
  border: 1px solid var(--border-color);
  background: var(--paper);
  color: var(--text-main);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all .14s ease;
}
.sim-pet__pick-btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.sim-pet__pick-btn.is-picked {
  background: var(--accent-ink);
  border-color: var(--accent-ink);
  color: #fff;
  font-weight: 700;
}
.sim-pet__desc { margin: 6px 0 0; font-size: 12px; line-height: 1.55; color: var(--text-main); }
.sim-pet__hit {
  margin: 6px 0 0;
  padding-top: 6px;
  border-top: 1px dashed var(--border-faint);
  font-size: 11.5px;
  color: var(--text-muted);
}

/* 魔物被动高亮：职业、属性、数值 */
:deep(.pv-val) {
  color: #b45309;
  font-weight: 700;
  margin: 0 1px;
}
.dark-mode :deep(.pv-val) {
  color: #f59e0b;
}
:deep(.pv-job) {
  display: inline-block;
  padding: 0 5px;
  margin: 0 2px;
  border-radius: 3px;
  background: rgba(47, 74, 73, 0.12);
  color: var(--accent-ink, #2f4a49);
  font-weight: 600;
  font-size: 0.95em;
}
.dark-mode :deep(.pv-job) {
  background: rgba(189, 228, 224, 0.16);
  color: #bde4e0;
}
:deep(.pv-elem) {
  display: inline-block;
  padding: 0 5px;
  margin: 0 2px;
  border-radius: 3px;
  font-weight: 600;
  font-size: 0.95em;
  background: rgba(180, 83, 9, 0.12);
  color: #92400e;
}
:deep(.pv-elem--火) {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}
:deep(.pv-elem--水) {
  background: rgba(2, 132, 199, 0.12);
  color: #0284c7;
}
:deep(.pv-elem--风) {
  background: rgba(16, 149, 106, 0.12);
  color: #047857;
}
:deep(.pv-elem--地) {
  background: rgba(180, 83, 9, 0.12);
  color: #92400e;
}
.dark-mode :deep(.pv-elem--火) { color: #f87171; background: rgba(220, 38, 38, 0.22); }
.dark-mode :deep(.pv-elem--水) { color: #38bdf8; background: rgba(2, 132, 199, 0.22); }
.dark-mode :deep(.pv-elem--风) { color: #34d399; background: rgba(16, 149, 106, 0.22); }
.dark-mode :deep(.pv-elem--地) { color: #fbbf24; background: rgba(180, 83, 9, 0.22); }

/* 选人弹窗搜索栏 */
.sim-picker-search {
  margin-bottom: 10px;
}

/* 选人弹窗网格（滚动由 UiModal 的 body 负责，这里不设 overflow） */
.sim-picker {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}
@media (max-width: 900px) { .sim-picker { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 600px) { .sim-picker { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; } }

/*
 * 弹窗里的筛选面板：只要它提供的行间距，不要外层框（弹窗本身已经是容器）。
 * 行距来自 UiFilterPanel 的 .ui-filter-content { gap: inherit }，
 * 而 .filter-panel 的 gap 是 10px —— 与页面顶部那个筛选面板完全一致。
 */
.sim-picker-filter {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
}

/* 移动端优化 */
@media (max-width: 600px) {
  .sim-content {
    flex: 1 1 0% !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 0 !important;
  }
  .sim-content > :deep(.ui-card-grid) {
    min-height: 100% !important;
    display: flex !important;
    flex-direction: column !important;
  }
  .sim-board-body {
    min-height: 100% !important;
    flex: 1 0 auto !important;
  }
  .sim-team-section {
    padding: 10px 10px 8px;
  }
  .sim-team-section :deep(.ui-section__body) {
    padding-top: 6px;
  }
  .sim-team {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
  }
  .sim-slot {
    min-height: 154px;
    padding: 5px 3px 6px;
    border-radius: 6px;
  }
  .sim-slot__card-wrap {
    max-width: 76px;
  }
  .sim-slot__remove {
    width: 17px;
    height: 17px;
    font-size: 11px;
    top: 2px;
    right: 2px;
  }
  .sim-slot__info {
    margin-top: 3px;
    gap: 3px;
  }
  .sim-slot__tags {
    gap: 2px;
  }
  .sim-slot__tag {
    font-size: 9.5px;
    padding: 0 3px;
    line-height: 1.25;
    border-radius: 3px;
  }
  .sim-slot__buff-row {
    gap: 2px;
    min-height: 14px;
    margin-top: 1px;
  }
  .sim-slot__mark {
    width: 12px;
    height: 10px;
  }
  .sim-slot__buff-badge {
    font-size: 9.5px;
    padding: 0 3px;
    line-height: 1.25;
  }
  .sim-slot__empty {
    padding: 14px 2px;
    gap: 4px;
  }
  .sim-slot__add-icon {
    width: 28px;
    height: 28px;
  }
  .sim-slot__add-title {
    font-size: 11px;
  }
  .sim-slot__add-sub {
    font-size: 9px;
  }
  .sim-team__foot {
    font-size: 11.5px;
    margin-top: 6px;
  }
  .sim-team-section.is-collapsed {
    padding: 8px 10px 2px;
    margin-bottom: 0 !important;
  }
  .sim-team-collapsed-bar {
    padding: 0 10px 8px;
    margin-top: 0;
  }
  .sim-team-collapsed-bar__chips {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
    width: 100%;
  }
  .sim-team-collapsed-chip {
    padding: 3px 4px;
    gap: 3px;
    font-size: 10.5px;
    width: 100%;
    justify-content: center;
  }
  .sim-team-collapsed-chip img {
    width: 16px;
    height: 16px;
  }
  .collapsed-name {
    font-size: 10px;
  }
  .collapsed-elem {
    font-size: 9px;
    padding: 0 2px;
  }
  .sim-pets {
    grid-template-columns: 1fr;
  }
  .sim-manual-roster {
    margin: 4px 0 10px;
    padding: 8px 8px;
  }
  .sim-manual-roster__cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .sim-manual-chip {
    padding: 4px 16px 4px 5px;
    gap: 4px;
    height: 44px;
  }
  .sim-manual-chip img {
    width: 26px;
    height: 26px;
  }
  .sim-manual-chip__name {
    font-size: 11px;
    line-height: 1.2;
  }
  .sim-manual-chip__hit {
    font-size: 9.5px;
    line-height: 1.2;
  }
  .sim-manual-chip__remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    padding: 0;
  }
  .sim-manual-chip.is-empty {
    height: 44px;
    min-height: 44px;
    padding: 0 4px;
    font-size: 11px;
  }
}
</style>
