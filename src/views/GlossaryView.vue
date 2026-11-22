<template>
  <div class="page-view-container glossary-page">
    <!-- 顶层搜索与分类面板 -->
    <UiFilterPanel class="filter-panel paper-panel" :collapsible="hasFilterOptions">
      <template #search>
        <UiSearchInput :model-value="search"
          placeholder="搜索词条名称、机制、属性或施加者（如 中毒、暴击、波特温...）"
          @update:model-value="setFilter('q', $event)" />
      </template>

      <!-- 一级大类 Tab -->
      <UiTabs :model-value="activeSection" :options="sectionTabs" @update:model-value="changeSection" />

      <!-- 二级分类筛选胶囊 -->
      <UiFilterRow v-if="categories.length > 1" label="分类：">
        <UiFilterPill :active="!category" @click="setFilter('category', '')">
          全部（{{ totalCountForSection }}）
        </UiFilterPill>
        <UiFilterPill v-for="item in categories" :key="item.category"
          :active="category === item.category"
          @click="setFilter('category', item.category)">
          {{ item.category }}（{{ item.count }}）
        </UiFilterPill>
      </UiFilterRow>

      <!-- 计数与当前说明 -->
      <div class="collection-counter">
        <span class="count-num">{{ filteredEntries.length }}</span> 条词条
        <span v-if="searchActive" class="counter-hint">· 包含全部板块的搜索匹配结果</span>
        <span v-else-if="currentSectionObj" class="counter-hint">· {{ currentSectionObj.name }}：{{ currentSectionObj.desc }}</span>
      </div>
    </UiFilterPanel>

    <!-- 词条百科主体内容 -->
    <UiEmptyState v-if="loading" type="loading" text="正在加载游戏机制与状态词条..." />
    <UiEmptyState v-else-if="error" type="error" :text="error" @retry="loadData" />
    <UiCardGrid v-else id="glossaryScroll" class="glossary-content paper-panel" :content-style="{ gridTemplateColumns: 'minmax(0, 1fr)' }">
      <div v-if="displayedEntries.length" class="glossary-grid">
        <article v-for="entry in displayedEntries" :key="entry.id || entry.name"
          class="glossary-card" :class="{ 'is-target': openedId === (entry.id || entry.name) }">
          <button type="button" class="glossary-card__button"
            :aria-label="`查看 ${entry.name} 的百科详情`"
            @click="openEntry(entry)">
            
            <!-- 图标或首字徽章 -->
            <img v-if="entry.icon" class="glossary-card__icon" :src="getImageUrl(entry.icon)" :alt="entry.name"
              loading="lazy" decoding="async" width="38" height="38" @error="handleImageFallback" />
            <span v-else class="glossary-card__icon glossary-card__icon--text" aria-hidden="true">
              {{ entry.name.slice(0, 1) }}
            </span>

            <!-- 卡片主体 -->
            <span class="glossary-card__body">
              <span class="glossary-card__head">
                <span class="glossary-card__name">{{ entry.name }}</span>
                <UiTag tone="accent">{{ entry.category }}</UiTag>
                <UiTag v-if="searchActive" tone="wood">{{ sectionName(entry.group) }}</UiTag>
              </span>

              <!-- 人话摘要 -->
              <p class="glossary-card__summary">{{ entry.summary }}</p>

              <!-- 核心特征提取胶囊 -->
              <div v-if="entry.rules && entry.rules.length" class="glossary-card__chips">
                <span v-for="r in entry.rules.slice(0, 3)" :key="r.label" class="rule-chip">
                  <span class="rule-chip__label">{{ r.label }}：</span>
                  <span class="rule-chip__value">{{ r.value }}</span>
                </span>
              </div>

              <!-- 来源概览提示 -->
              <div v-if="hasSources(entry)" class="glossary-card__source-hint">
                <span class="source-hint-badge">{{ sourceSummaryText(entry) }}</span>
              </div>
            </span>
          </button>
        </article>
      </div>
      <UiEmptyState v-else text="没有找到符合条件的词条，换个关键词试试" />
    </UiCardGrid>
    <UiBackToTop scroll-container="#glossaryScroll" />

    <!-- 词条百科详情弹窗 -->
    <UiModal v-model:visible="detailVisible" :title="currentEntry ? currentEntry.name : '词条百科'"
      max-width="840px" scroll-id="glossaryModalScroll" :z-index="2000">
      <template v-if="currentEntry">
        <!-- 弹窗顶栏 -->
        <div class="detail-header">
          <img v-if="currentEntry.icon" class="detail-header__icon" :src="getImageUrl(currentEntry.icon)"
            :alt="currentEntry.name" width="54" height="54" @error="handleImageFallback" />
          <span v-else class="detail-header__icon detail-header__icon--text" aria-hidden="true">
            {{ currentEntry.name.slice(0, 1) }}
          </span>
          <div class="detail-header__info">
            <div class="detail-header__tags">
              <UiTag tone="accent">{{ currentEntry.category }}</UiTag>
              <UiTag tone="wood">{{ sectionName(currentEntry.group) }}</UiTag>
              <UiTag v-for="tag in currentEntry.tags" :key="tag" tone="default">{{ tag }}</UiTag>
            </div>
            <p class="detail-header__summary">{{ currentEntry.summary }}</p>
          </div>
        </div>

        <!-- 机制与结算规则 -->
        <!-- 机制与结算规则 -->
        <UiSection v-if="currentEntry.rules && currentEntry.rules.length" title="机制与结算规则">
          <div class="rules-table">
            <div v-for="r in currentEntry.rules" :key="r.label" class="rule-row-container">
              <UiInfoRow :label="r.label">
                <div class="rule-value-content">
                  <span class="rule-value-text">{{ r.value }}</span>
                  <!-- 步骤专属可折叠公式与解析按钮 -->
                  <button v-if="currentEntry.id === 'mech_damage_flow' && hasStepDiagram(r.label)"
                    type="button" class="rule-toggle-btn"
                    @click="toggleStepDiagram(r.label)">
                    <span class="rule-toggle-icon">{{ isStepExpanded(r.label) ? '▲' : '▼' }}</span>
                    <span>{{ isStepExpanded(r.label) ? '收起公式与解析' : '展开公式与解析' }}</span>
                  </button>
                </div>
              </UiInfoRow>

              <!-- 八步结算流水线：统一清晰数学式与解析卡片 -->
              <transition name="formula-fade">
                <div
                  v-if="currentEntry.id === 'mech_damage_flow' && getStepDiagram(r.label) && isStepExpanded(r.label)"
                  class="step-inline-diagram"
                >
                  <div v-for="diagram in [getStepDiagram(r.label)]" :key="diagram.title" class="formula-card">
                    <div class="formula-display">
                      <div v-if="diagram.fraction" class="formula-fraction-row">
                        <span class="formula-lhs">{{ diagram.fraction.lhs }}</span>
                        <span class="formula-eq-sym">=</span>
                        <div class="formula-fraction">
                          <div class="formula-fraction__num">{{ diagram.fraction.num }}</div>
                          <div class="formula-fraction__bar"></div>
                          <div class="formula-fraction__den">{{ diagram.fraction.den }}</div>
                        </div>
                      </div>

                      <div v-for="(eq, idx) in diagram.equations || []" :key="idx" class="formula-eq-line">
                        {{ eq }}
                      </div>

                      <div class="formula-display__meta">
                        <div v-if="diagram.parenNote" class="formula-meta-paren">{{ diagram.parenNote }}</div>
                        <div v-for="(line, idx) in diagram.paramLines || []" :key="`p-${idx}`" class="formula-meta-param">
                          <template v-for="(seg, sIdx) in line" :key="sIdx">
                            <sup v-if="seg.sup" class="formula-sup">{{ seg.text }}</sup>
                            <span v-else-if="seg.accent" class="formula-meta-highlight">{{ seg.text }}</span>
                            <template v-else>{{ seg.text }}</template>
                          </template>
                        </div>
                        <div v-if="diagram.takeaway" class="formula-meta-takeaway">{{ diagram.takeaway }}</div>
                      </div>
                    </div>

                    <div v-if="diagram.notes && diagram.notes.length" class="formula-card__notes">
                      <div v-for="(note, nIdx) in diagram.notes" :key="nIdx" class="formula-card__note">
                        <span class="formula-card__bullet" :class="`formula-card__bullet--${note.tone || 'default'}`"></span>
                        <div class="formula-card__text">
                          <strong>{{ note.title }}</strong>：{{ note.text }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </UiSection>

        <!-- 等级压制伤害全量对照表 -->
        <UiSection v-if="currentEntry.id === 'mech_level_suppression'" title="等级差减免与实际造成伤害对照表（0~16+级）">
          <div class="level-sup-table-wrapper">
            <table class="level-sup-table">
              <thead>
                <tr>
                  <th scope="col">敌我等级差</th>
                  <th scope="col">目标免伤率</th>
                  <th scope="col">实际造成伤害</th>
                  <th scope="col">实际承伤占比</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in LEVEL_SUPPRESSION_ROWS" :key="item.diff" :class="{ 'level-sup-table__row--max': item.isMax }">
                  <td class="level-sup-table__cell level-sup-table__diff">
                    {{ item.diff }}
                    <span v-if="item.isMax" class="level-sup-table__badge">上限</span>
                  </td>
                  <td class="level-sup-table__cell level-sup-table__red">-{{ item.redRate }}</td>
                  <td class="level-sup-table__cell level-sup-table__dmg">{{ item.dmgRate }}</td>
                  <td class="level-sup-table__cell level-sup-table__bar-cell">
                    <div class="level-sup-table__bar-track" :title="`造成伤害: ${item.dmgRate}`">
                      <div class="level-sup-table__bar-fill" :style="{ width: item.dmgRate }"></div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UiSection>

        <!-- 施加来源：角色 -->
        <UiSection v-if="currentHeroSources.length"
          :title="`施加角色（${currentHeroSources.length} 位）`">
          <div class="source-chips">
            <button v-for="hero in currentHeroSources" :key="hero.name"
              type="button" class="source-chip source-chip--hero"
              :title="`前往查看角色「${hero.name}」`"
              @click="navigateToHero(hero)">
              <span class="source-chip__name">{{ hero.name }}</span>
              <span v-if="hero.skillName" class="source-chip__skill">「{{ hero.skillName }}」</span>
              <span class="source-chip__arrow">➔</span>
            </button>
          </div>
        </UiSection>

        <!-- 施加来源：怪物与首领 -->
        <UiSection v-if="currentMonsterSources.length"
          :title="`携带 / 施加怪物（${currentMonsterSources.length} 种）`">
          <div class="source-chips">
            <button v-for="mon in currentMonsterSources" :key="mon.id || mon.name"
              type="button" class="source-chip source-chip--mon"
              :title="`前往查看怪物「${mon.name}」`"
              @click="navigateToMonster(mon)">
              <span class="source-chip__name">{{ mon.name }}</span>
              <span v-if="mon.skillName" class="source-chip__skill">「{{ mon.skillName }}」</span>
              <span class="source-chip__arrow">➔</span>
            </button>
          </div>
        </UiSection>

        <!-- 施加来源：魔物 -->
        <UiSection v-if="currentPetSources.length"
          :title="`魔物伙伴（${currentPetSources.length} 种）`">
          <div class="source-chips">
            <button v-for="pet in currentPetSources" :key="pet.name"
              type="button" class="source-chip source-chip--pet"
              :title="`前往查看魔物「${pet.name}」`"
              @click="navigateToPet(pet)">
              <span class="source-chip__name">{{ pet.name }}</span>
              <span v-if="pet.skillName" class="source-chip__skill">「{{ pet.skillName }}」</span>
              <span class="source-chip__arrow">➔</span>
            </button>
          </div>
        </UiSection>

        <!-- 装备、套装、符石与词缀 -->
        <UiSection v-if="currentEquipSourceChips.length"
          :title="`装备 / 套装 / 词缀（${currentEquipSourceChips.length} 项）`">
          <div class="source-chips">
            <button v-for="chip in currentEquipSourceChips" :key="chip.key"
              type="button" class="source-chip source-chip--equip"
              :title="chip.title"
              @click="chip.onClick()">
              <span class="source-chip__name">{{ chip.name }}</span>
              <span v-if="chip.skillName" class="source-chip__skill">「{{ chip.skillName }}」</span>
              <span class="source-chip__arrow">➔</span>
            </button>
          </div>
        </UiSection>

        <!-- 秘境、遗器与副本祝福 -->
        <UiSection v-if="currentDungeonSourceChips.length"
          :title="`秘境 / 遗器 / 副本（${currentDungeonSourceChips.length} 项）`">
          <div class="source-chips">
            <button v-for="chip in currentDungeonSourceChips" :key="chip.key"
              type="button" class="source-chip source-chip--dungeon"
              :title="chip.title"
              @click="chip.onClick()">
              <span class="source-chip__name">{{ chip.name }}</span>
              <span v-if="chip.skillName" class="source-chip__skill">「{{ chip.skillName }}」</span>
              <span class="source-chip__arrow">➔</span>
            </button>
          </div>
        </UiSection>

        <!-- 职业通用被动 -->
        <UiSection v-if="currentJobSources.length"
          :title="`职业通用被动（${currentJobSources.length} 项）`">
          <div class="source-chips">
            <button v-for="job in currentJobSources" :key="`${job.id}-${job.name}`"
              type="button" class="source-chip source-chip--job"
              :title="`前往角色图鉴查看「${job.name}」`"
              @click="router.push({ path: '/heroes' })">
              <span class="source-chip__name">{{ job.name }}</span>
              <span v-if="job.skillName" class="source-chip__skill">「{{ job.skillName }}」</span>
              <span class="source-chip__arrow">➔</span>
            </button>
          </div>
        </UiSection>

        <!-- 关联道具与料理 -->
        <UiSection v-if="currentItemSources.length"
          :title="`关联道具与料理（${currentItemSources.length} 件）`">
          <div class="source-chips">
            <button v-for="item in currentItemSources" :key="item.id || item.name"
              type="button" class="source-chip source-chip--item"
              :title="`查看道具「${item.name}」`"
              @click="navigateToItem(item)">
              <span class="source-chip__name">{{ item.name }}</span>
              <span class="source-chip__arrow">➔</span>
            </button>
          </div>
        </UiSection>

        <UiBackToTop scroll-container="#glossaryModalScroll" />
      </template>
    </UiModal>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchWithFallback } from '../utils/request.js'
import { getImageUrl, handleImageFallback } from '../utils/env.js'
import { facetCountsForGroup, GLOSSARY_SECTIONS } from '../utils/glossaryData.js'
import { resolveScrollTarget } from '../utils/scrollTarget.js'
import { useLazyList } from '../composables/useLazyList.js'
import {
  UiTabs, UiFilterPanel, UiSearchInput, UiFilterRow, UiFilterPill, UiCardGrid, UiTag,
  UiButton, UiEmptyState, UiBackToTop, UiSection, UiInfoRow, UiModal
} from '../components/ui/index.js'
import { isBlacklisted } from '../config/blacklist.js'

const route = useRoute()
const router = useRouter()

const sectionTabs = [
  { value: 'all', label: '全部' },
  { value: 'status', label: '异常与状态' },
  { value: 'stats', label: '战斗属性' },
  { value: 'mechanics', label: '核心机制' },
  { value: 'buffs', label: 'Buff 效果' }
]

const LEVEL_SUPPRESSION_ROWS = [
  { diff: '差 0 级（平级/我高于敌）', redRate: '0.00%', dmgRate: '100.00%', isMax: false },
  { diff: '差 1 级', redRate: '0.80%', dmgRate: '99.20%', isMax: false },
  { diff: '差 2 级', redRate: '2.26%', dmgRate: '97.74%', isMax: false },
  { diff: '差 3 级', redRate: '4.16%', dmgRate: '95.84%', isMax: false },
  { diff: '差 4 级', redRate: '6.40%', dmgRate: '93.60%', isMax: false },
  { diff: '差 5 级', redRate: '8.94%', dmgRate: '91.06%', isMax: false },
  { diff: '差 6 级', redRate: '11.76%', dmgRate: '88.24%', isMax: false },
  { diff: '差 7 级', redRate: '14.82%', dmgRate: '85.18%', isMax: false },
  { diff: '差 8 级', redRate: '18.10%', dmgRate: '81.90%', isMax: false },
  { diff: '差 9 级', redRate: '21.60%', dmgRate: '78.40%', isMax: false },
  { diff: '差 10 级', redRate: '25.30%', dmgRate: '74.70%', isMax: false },
  { diff: '差 11 级', redRate: '29.19%', dmgRate: '70.81%', isMax: false },
  { diff: '差 12 级', redRate: '33.26%', dmgRate: '66.74%', isMax: false },
  { diff: '差 13 级', redRate: '37.50%', dmgRate: '62.50%', isMax: false },
  { diff: '差 14 级', redRate: '41.91%', dmgRate: '58.09%', isMax: false },
  { diff: '差 15 级', redRate: '46.48%', dmgRate: '53.52%', isMax: false },
  { diff: '差 16 级及以上', redRate: '50.00%', dmgRate: '50.00%', isMax: true }
]

const DAMAGE_FLOW_DIAGRAMS = [
  {
    step: '第一步',
    title: '第一步：原始基准伤害公式',
    equations: ['原始伤害 X = 基础伤害 + 技能倍率 × 对应攻击属性'],
    parenNote: '(对应属性按该段攻击配置取「物理攻击 / 魔法攻击 / max(物攻, 魔攻) [auto]」；无攻击者或空配置仅取基础伤害)',
    takeaway: '取值属性、伤害类型（物/魔）与元素（水/火/风/地）相互独立，按技能各自设定生效。',
    notes: [
      { tone: 'add', title: '属性与伤害类型分离', text: '按物攻取值不代表一定是物理伤害；按生命百分比预先算入基础伤害的技能也仍受防御结算，除非标记 realDam。' },
      { tone: 'key', title: '无攻击者 / 环境伤害', text: '无攻击者时直接取基础伤害并跳过第三～五步（防御、暴击、浮动），但仍受目标自身增减伤与抗性影响。' }
    ]
  },
  {
    step: '第二步',
    title: '第二步：第一增减伤区（属性与特攻相加减）',
    equations: ['X₁ = X × ( 1 + 类型增伤 + 元素增伤 + 特定目标特攻 − 目标类型抗性 − 目标元素抗性 )'],
    parenNote: '(同区内部全部相加减；括号整体不设 100% 封顶)',
    paramLines: [
      [
        { text: '示例：火增伤 ' },
        { text: '+20%', accent: true },
        { text: ' 命中火抗 ' },
        { text: '−30%', accent: true },
        { text: '（弱点）→ 倍率 = 1 + 0.20 − (−0.30) = ' },
        { text: '×1.50', accent: true }
      ]
    ],
    takeaway: '仅当受击方在本区抗性为负时触发「弱点」飘字（若同时暴击会被暴击飘字覆盖）。',
    notes: [
      { tone: 'add', title: '匹配规则', text: '类型（物理/魔法）与元素（水/火/风/地）按「本次伤害」自带属性匹配；特定目标加成（如首领特攻）按目标携带标签逐项累加。' },
      { tone: 'res', title: '同区加减而非连乘', text: '攻方静态类型/元素增伤与守方对应静态抗性处于同一括号内直接加减，不要把它们拆成独立乘法。' }
    ]
  },
  {
    step: '第三步',
    title: '第三步：双曲线防御承伤比公式',
    fraction: {
      lhs: '实际承伤比',
      num: 'K(L)',
      den: 'K(L) + 防御 × (1 − 穿透率)'
    },
    equations: ['防御后伤害 X₂ = X₁ × 实际承伤比'],
    parenNote: '(分子 = K(L), 分母 = K(L) + 防御 × (1 − 穿透率))',
    paramLines: [
      [
        { text: 'K(L) = a·L' },
        { text: '2', sup: true },
        { text: ' + b·L + c  (L=攻击方等级)' }
      ],
      [
        { text: '物理 [a,b,c] = [ ' },
        { text: '0.6125, 45.269, 351.98', accent: true },
        { text: ' ]  |  魔法 [ ' },
        { text: '0.5011, 37.039, 287.98', accent: true },
        { text: ' ]' }
      ]
    ],
    takeaway: '当「有效防御 = K(L)」时正好减伤 50%; 防御越高减伤越多，但边际递减。',
    notes: [
      { tone: 'k', title: '穿透率与真伤跳过', text: '穿透率 = min(100%, 自身对应穿透 + 普攻额外穿透 + 本次无视防御)（普攻额外穿透仅普通攻击计入）；满 100% 穿透或标记为真实伤害（realDam = true）时直接跳过防御减免，此时 X₂ = X₁。' },
      { tone: 'def', title: '常用 K 值（物 / 魔）', text: '1级 398/326 · 20级 1502/1229 · 40级 3143/2571 · 60级 5273/4314 · 100级 11004/9003。' }
    ]
  },
  {
    step: '第四步',
    title: '第四步：净暴击率与暴伤倍率结算',
    equations: [
      '净暴击率 p = clamp( 攻击者暴击率 − 目标暴击抗性, 0%, 100% )',
      '触发暴击：X₃ = X₂ × (暴击伤害% ÷ 100%)   |   未暴击：X₃ = X₂'
    ],
    parenNote: '(进入条件：(允许暴击 且 自身暴击率 > 0%) 或 触发强制暴击 realCirt)',
    paramLines: [
      [
        { text: '常规角色默认暴击伤害 = ' },
        { text: '150%', accent: true },
        { text: '（暴击造成 1.5 倍伤害）' }
      ]
    ],
    takeaway: '目标暴击抗性按 1:1 百分比直接抵消攻击方暴击率；p ≤ 0% 不暴击，p ≥ 100% 必暴击。',
    notes: [
      { tone: 'crit', title: '哪些攻击能暴击', text: '常规普攻默认允许暴击；技能、追加伤害与持续伤害是否允许暴击由具体配置决定，不能仅凭面板暴击率推断技能会暴击。' },
      { tone: 'crit-dam', title: '强制暴击机制', text: '持有强制暴击（realCirt / normalAtkRealCrit）时直接跳过概率与暴击抗性强制暴击，不再要求本次攻击原本开启暴击或面板暴击率 > 0%。' }
    ]
  },
  {
    step: '第五步',
    title: '第五步：随机浮动与第一次截断取整',
    equations: ['阶段一伤害 D₀ = trunc( X₃ × 浮动倍率 F )'],
    parenNote: '(开启浮动时 F 在 [atkFloatMin, atkFloatMax] 区间内均匀随机取值；未开启时 F = 1.0)',
    paramLines: [
      [
        { text: '常见基础浮动 4 档：' },
        { text: '80%~120%', accent: true },
        { text: ' · ' },
        { text: '85%~115%', accent: true },
        { text: ' · ' },
        { text: '90%~110%', accent: true },
        { text: ' · ' },
        { text: '95%~105%', accent: true }
      ]
    ],
    takeaway: '浮动之后立刻执行第一次向零截断取整（trunc 直接舍去小数），再进入后续乘区。',
    notes: [
      { tone: 'add', title: '开关差异', text: '常规普攻通常开启浮动，技能与追加伤害默认关闭（F 固定为 1.0），具体仍看攻击实现类配置。' }
    ]
  },
  {
    step: '第六步',
    title: '第六步：动态增伤、易伤与受击事件',
    equations: [
      'D₁ = D₀ × (1 + 普攻状态标签增伤) × (1 + 通用输出增伤) × (1 + 目标易伤) × (1 + 技能受击易伤) × (1 + 动态物/魔增伤) × (1 + 动态元素增伤) × (1 + 普攻/技能增伤)'
    ],
    parenNote: '(与第二步不同：各独立维度之间「逐项相乘」；同一字段内的多个来源先相加再 +1)',
    takeaway: '受击方的「易伤（正数）/ 全局减伤（负数）」与技能受击易伤分别乘算，直接与攻方动态增伤连乘。',
    notes: [
      { tone: 'key', title: '同项相加与跨项相乘', text: '例如同时获得通用增伤 +20% 与目标易伤 +25%，合计乘数为 1.20 × 1.25 = 1.50；Buff 持续伤害不吃「普攻/技能增伤」。' },
      { tone: 'add', title: '事件回调改写', text: '本步同时串联攻击与受击事件（如按目标生命或叠层加成的专属效果 1 + rate × 层数），直接改写当前结算伤害。' }
    ]
  },
  {
    step: '第七步',
    title: '第七步：等级压制、独立抗性与保底取整',
    equations: [
      '等级倍率 = 1 − min( 50%, 0.8% × ΔL^1.5 )   （ΔL = max(目标等级 − 攻击者等级, 0)）',
      'D₂ = max( 1, D₁ × 等级倍率 × [1 − min(1, 动态类型抗性)] × [1 − min(1, 动态元素抗性)] )'
    ],
    parenNote: '(ΔL ≥ 16 级起固定封顶减伤 50%；攻击低等级目标时等级倍率固定 100%，无额外增伤)',
    paramLines: [
      [
        { text: '越级压制节点：差1级 ' },
        { text: '−0.80%', accent: true },
        { text: ' · 5级 ' },
        { text: '−8.94%', accent: true },
        { text: ' · 10级 ' },
        { text: '−25.30%', accent: true },
        { text: ' · 15级 ' },
        { text: '−46.48%', accent: true },
        { text: ' · ≥16级 ' },
        { text: '−50.00%', accent: true }
      ]
    ],
    takeaway: '保底 1 点之后仍会判定普攻职业闪避（可置 0）与秘境遗器技能增伤倍率，最后第二次截断取整得最终伤害 D。',
    notes: [
      { tone: 'suppress', title: '与第二步抗性的区别', text: '本步的动态类型抗性与动态元素抗性各自独立封顶 100% 并相乘（例双 20% 抗性为 0.8 × 0.8 = 0.64），不与第二步抗性相加减。' }
    ]
  },
  {
    step: '第八步',
    title: '第八步：吸血、反伤与护盾吸收',
    equations: [
      '生命损失 = max( D − 当前总护盾, 0 )   |   剩余护盾 = max( 当前总护盾 − D, 0 )'
    ],
    parenNote: '(吸血与反伤均按「护盾前」最终伤害 D 计算；打在护盾上或溢出残血仍按 D 取基数)',
    paramLines: [
      [
        { text: '普攻吸血 = trunc(D × 吸血% / 100) × (1 + 受治疗加成% / 100)   |   普攻反伤基础 = trunc(D × 反伤% / 100)' }
      ]
    ],
    takeaway: '护盾享受前七步全部防御与抗性减免；同时存在多个护盾时从最新施加者开始逆序扣除。',
    notes: [
      { tone: 'def', title: '反伤再结算规则', text: '通用普攻反伤由受击者作为攻击方生成「魔法、无元素、Buff 形态」伤害重走流程（无暴击浮动），不会再次递归触发普攻反伤。' },
      { tone: 'k', title: '锁血与重伤濒死', text: '扣血后若携带锁血（lockHp ≠ 0），当前生命不低于 lockHp；普通副本归零先判濒死重伤。' }
    ]
  }
]

const expandedStepDiagrams = ref({})

function getStepDiagram(label) {
  if (!label) return null
  return DAMAGE_FLOW_DIAGRAMS.find(item => label.startsWith(item.step)) || null
}

function hasStepDiagram(label) {
  return Boolean(getStepDiagram(label))
}

function isStepExpanded(label) {
  return !!expandedStepDiagrams.value[label]
}

function toggleStepDiagram(label) {
  expandedStepDiagrams.value = {
    ...expandedStepDiagrams.value,
    [label]: !expandedStepDiagrams.value[label]
  }
}

const activeSection = computed(() => {
  const s = route.query.section || route.query.tab || route.query.group
  return sectionTabs.some(t => t.value === s) ? s : 'all'
})

const queryString = key => (typeof route.query[key] === 'string' ? route.query[key] : '')
const search = computed(() => queryString('q'))
const category = computed(() => queryString('category'))

const data = ref(null)
const loading = ref(false)
const error = ref('')

const entries = computed(() => data.value?.entries || data.value?.buffs || [])
const sections = computed(() => data.value?.sections || GLOSSARY_SECTIONS)
const currentSectionObj = computed(() => sections.value.find(s => s.id === activeSection.value) || null)

function sectionName(secId) {
  const found = sections.value.find(s => s.id === secId)
  return found ? found.name : ''
}

const facets = computed(() => facetCountsForGroup(entries.value, activeSection.value))
const categories = computed(() => facets.value.categories)
const totalCountForSection = computed(() => {
  if (activeSection.value === 'all') return entries.value.length
  return entries.value.filter(e => e.group === activeSection.value).length
})

const hasFilterOptions = computed(() => categories.value.length > 1)
const searchActive = computed(() => search.value.trim().length > 0)

// 全局过滤检索
const filteredEntries = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return entries.value.filter(entry => {
    // 非搜索状态下按一级大类过滤
    if (!searchActive.value && activeSection.value !== 'all' && entry.group !== activeSection.value) {
      return false
    }
    // 二级分类过滤
    if (category.value && entry.category !== category.value) {
      return false
    }
    if (!keyword) return true

    // 关键词全文匹配
    const s = entry.sources || {}
    const extraSourceTerms = [
      ...(s.suits || []).flatMap(x => [x.name, x.skillName]),
      ...(s.runes || []).map(x => x.name),
      ...(s.affixes || []).map(x => x.name),
      ...(s.dungeons || []).flatMap(x => [x.name, x.skillName]),
      ...(s.relics || []).map(x => x.name),
      ...(s.jobs || []).flatMap(x => [x.name, x.skillName]),
      ...(s.roomBuffs || []).map(x => x.name)
    ]
    const haystack = [
      entry.name,
      entry.category,
      sectionName(entry.group),
      entry.summary,
      ...(entry.tags || []),
      ...(entry.rules || []).flatMap(r => [r.label, r.value]),
      ...(s.heroes || []).filter(h => !isBlacklisted(h)).flatMap(h => [h.name, h.skillName]),
      ...(s.monsters || []).filter(m => !isBlacklisted(m)).flatMap(m => [m.name, m.skillName]),
      ...(s.pets || []).filter(p => !isBlacklisted(p)).flatMap(p => [p.name, p.skillName]),
      ...(s.items || []).filter(i => !isBlacklisted(i)).map(i => i.name),
      ...extraSourceTerms
    ].filter(Boolean).join(' ').toLowerCase()

    return haystack.includes(keyword)
  })
})

const { displayedItems: displayedEntries } = useLazyList(filteredEntries, 60, '#glossaryScroll')

// 来源摘要显示
function countEntrySources(entry) {
  const s = entry?.sources || {}
  const items = (s.items || []).filter(i => !isBlacklisted(i))
  return {
    heroes: (s.heroes || []).filter(h => !isBlacklisted(h)).length,
    monsters: (s.monsters || []).filter(m => !isBlacklisted(m)).length,
    pets: (s.pets || []).filter(p => !isBlacklisted(p)).length,
    equips: items.filter(i => i.isEquip).length
      + (s.suits || []).length + (s.runes || []).length + (s.affixes || []).length,
    dungeons: (s.dungeons || []).length + (s.relics || []).length + (s.roomBuffs || []).length,
    jobs: (s.jobs || []).length,
    items: items.filter(i => !i.isEquip).length
  }
}

function hasSources(entry) {
  const c = countEntrySources(entry)
  return Boolean(c.heroes || c.monsters || c.pets || c.equips || c.dungeons || c.jobs || c.items)
}

function sourceSummaryText(entry) {
  const c = countEntrySources(entry)
  const parts = []
  if (c.heroes) parts.push(`${c.heroes} 位角色`)
  if (c.pets) parts.push(`${c.pets} 种魔物`)
  if (c.equips) parts.push(`${c.equips} 项装备/套装`)
  if (c.dungeons) parts.push(`${c.dungeons} 处秘境/遗器`)
  if (c.jobs) parts.push(`${c.jobs} 项职业被动`)
  if (c.monsters) parts.push(`${c.monsters} 种怪物`)
  if (c.items) parts.push(`${c.items} 件道具`)
  return parts.length ? `来源：${parts.join(' · ')}` : ''
}

// 详情弹窗管理
const openedId = computed(() => queryString('id') || queryString('buff'))
const detailVisible = computed({
  get: () => Boolean(openedId.value),
  set: val => { if (!val) closeEntry() }
})
const currentEntry = computed(() => {
  if (!openedId.value) return null
  return entries.value.find(e => (e.id && e.id === openedId.value) || e.name === openedId.value) || null
})
const currentHeroSources = computed(() => {
  return (currentEntry.value?.sources?.heroes || []).filter(h => !isBlacklisted(h))
})
const currentMonsterSources = computed(() => {
  return (currentEntry.value?.sources?.monsters || []).filter(m => !isBlacklisted(m))
})
const currentPetSources = computed(() => {
  return (currentEntry.value?.sources?.pets || []).filter(p => !isBlacklisted(p))
})
const currentItemSources = computed(() => {
  return (currentEntry.value?.sources?.items || []).filter(i => !isBlacklisted(i) && !i.isEquip)
})
const currentJobSources = computed(() => currentEntry.value?.sources?.jobs || [])
const currentEquipSourceChips = computed(() => {
  const s = currentEntry.value?.sources || {}
  const chips = []
  for (const suit of s.suits || []) {
    chips.push({
      key: `suit-${suit.id || suit.name}-${suit.skillName || ''}`,
      name: suit.name,
      skillName: suit.skillName ? `套装·${suit.skillName}` : '套装',
      title: `前往装备图鉴查看「${suit.name}」`,
      onClick: () => router.push(
        suit.equipId
          ? { path: '/equip', query: { itemId: suit.equipId } }
          : { path: '/equip', query: { q: suit.name } }
      )
    })
  }
  for (const item of (s.items || []).filter(i => !isBlacklisted(i) && i.isEquip)) {
    chips.push({
      key: `equip-${item.id || item.name}`,
      name: item.name,
      skillName: '单件装备',
      title: `前往装备图鉴查看「${item.name}」`,
      onClick: () => router.push({ path: '/equip', query: { itemId: item.id } })
    })
  }
  for (const rune of s.runes || []) {
    chips.push({
      key: `rune-${rune.id || rune.name}`,
      name: rune.name,
      skillName: '符石',
      title: `前往符石图鉴查看「${rune.name}」`,
      onClick: () => router.push(rune.id ? { path: '/runes', query: { focus: rune.id } } : { path: '/runes', query: { q: rune.name } })
    })
  }
  for (const affix of s.affixes || []) {
    chips.push({
      key: `affix-${affix.id || affix.name}`,
      name: affix.name,
      skillName: affix.skillName || '装备词缀',
      title: `前往装备图鉴查看词缀「${affix.name}」`,
      onClick: () => router.push({ path: '/equip' })
    })
  }
  return chips
})
const currentDungeonSourceChips = computed(() => {
  const s = currentEntry.value?.sources || {}
  const chips = []
  for (const d of s.dungeons || []) {
    chips.push({
      key: `dungeon-${d.id}-${d.eventId || d.skillName || ''}`,
      name: d.name,
      skillName: d.skillName || '活动秘境',
      title: `前往活动副本查看「${d.name}」`,
      onClick: () => router.push({
        path: '/activity-dungeons',
        query: d.eventId ? { dungeon: d.id, tab: 'events', event: d.eventId } : { dungeon: d.id }
      })
    })
  }
  for (const r of s.relics || []) {
    chips.push({
      key: `relic-${r.id || r.name}`,
      name: r.name,
      skillName: '核心遗器',
      title: `前往遗器图鉴查看「${r.name}」`,
      onClick: () => router.push({ path: '/relics', query: { tab: 'list', relic: r.id } })
    })
  }
  for (const rb of s.roomBuffs || []) {
    chips.push({
      key: `roombuff-${rb.id || rb.name}`,
      name: rb.name,
      skillName: rb.skillName || '副本增益',
      title: `前往副本图鉴查看「${rb.name}」`,
      onClick: () => router.push({ path: '/dungeons' })
    })
  }
  return chips
})

watch(openedId, () => {
  expandedStepDiagrams.value = {}
})

function openEntry(entry) {
  router.push({ query: { ...route.query, id: entry.id || entry.name } })
}

function closeEntry() {
  const query = { ...route.query }
  delete query.id
  delete query.buff
  router.replace({ query })
}

function changeSection(sec) {
  const query = { ...route.query, section: sec }
  delete query.category
  delete query.id
  delete query.buff
  router.replace({ query })
}

function setFilter(key, val) {
  const query = { ...route.query }
  if (val) query[key] = val
  else delete query[key]
  router.replace({ query })
}

// 页面联动跳转
function navigateToHero(hero) {
  if (!hero.id) return
  router.push({ path: '/heroes', query: { id: hero.id } })
}

function navigateToMonster(mon) {
  if (!mon.id) return
  router.push({ path: '/monsters', query: { id: mon.id } })
}

function navigateToPet(pet) {
  if (!pet.id) return
  router.push({ path: '/pets', query: { id: pet.id } })
}

function navigateToItem(item) {
  if (!item.id) return
  router.push({ query: { ...route.query, itemId: item.id } })
}

async function loadData() {
  if (loading.value || data.value) return
  loading.value = true
  error.value = ''
  try {
    data.value = await fetchWithFallback('data/parsed/glossary.json')
  } catch (err) {
    error.value = '词条数据加载失败，请重试。'
    console.error('Failed to load glossary data:', err)
  } finally {
    loading.value = false
  }
}

watch([activeSection, category], async () => {
  await nextTick()
  resolveScrollTarget('#glossaryScroll')?.scrollTo({ top: 0, behavior: 'auto' })
})

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.glossary-content {
  background: var(--paper);
  padding: 12px 14px calc(88px + var(--safe-bottom, 0px));
}

.collection-counter {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}
.count-num {
  color: var(--accent-ink);
}
.counter-hint {
  font-weight: 400;
}

/* 网格与卡片 */
.glossary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
}

.glossary-card {
  display: flex;
  min-width: 0;
}

.glossary-card.is-target {
  outline: 2px solid var(--accent-ink);
  outline-offset: -2px;
  border-radius: 6px;
}

.glossary-card__button {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--paper-soft);
  color: var(--text-main);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.glossary-card__button:hover {
  background: var(--paper-solid);
  border-color: var(--border-color);
}

.glossary-card__button:focus-visible {
  outline: 2px solid var(--accent-bright);
  outline-offset: 2px;
}

.glossary-card__icon {
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  object-fit: contain;
}

img.glossary-card__icon {
  border: none;
  background: transparent;
  padding: 1px;
}

.glossary-card__icon--text {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-soft);
  border-radius: 5px;
  background: var(--wood-soft);
  color: var(--on-wood-text);
  font-weight: 700;
  font-size: 16px;
}

.glossary-card__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.glossary-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.glossary-card__name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.glossary-card__summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.glossary-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.rule-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  padding: 2px 6px;
  background: var(--paper);
  border: 1px solid var(--border-faint);
  border-radius: 3px;
  font-size: 12px;
}
.rule-chip__label {
  color: var(--text-faint);
}
.rule-chip__value {
  font-weight: 600;
  color: var(--accent-ink);
}

.glossary-card__source-hint {
  margin-top: 2px;
  font-size: 12px;
}
.source-hint-badge {
  display: inline-block;
  padding: 1px 6px;
  background: var(--paper-solid);
  border-radius: 3px;
  color: var(--text-muted);
}

/* 详情弹窗内部 */
.detail-header {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.detail-header__icon {
  flex: 0 0 54px;
  width: 54px;
  height: 54px;
  object-fit: contain;
}

img.detail-header__icon {
  border: none;
  background: transparent;
  padding: 2px;
}

.detail-header__icon--text {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--wood-soft);
  color: var(--on-wood-text);
  font-size: 24px;
  font-weight: 700;
}

.detail-header__info {
  flex: 1;
  min-width: 0;
}

.detail-header__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.detail-header__summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-main);
}

.rules-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rules-table :deep(.ui-info-row) {
  align-items: flex-start;
  gap: 16px;
  padding: 8px 4px;
}

.rules-table :deep(.ui-info-row__label) {
  flex: 0 0 140px;
  max-width: 140px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  white-space: normal;
  line-height: 1.6;
}

.rules-table :deep(.ui-info-row__value) {
  text-align: left;
  line-height: 1.6;
  color: var(--text-main, #3e2a14);
  word-break: normal;
  overflow-wrap: break-word;
}

/* 来源跳转卡片 */
.source-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.source-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  border-radius: 5px;
  color: var(--text-main);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.source-chip:hover {
  background: var(--paper-solid);
  border-color: var(--accent-ink);
  color: var(--accent-ink);
}

.source-chip__name {
  font-weight: 600;
}

.source-chip__skill {
  font-size: 12px;
  color: var(--text-muted);
}

.source-chip__arrow {
  font-size: 12px;
  opacity: 0.7;
}

.glossary-error {
  text-align: center;
  padding: 24px;
}

/* 等级压制梯度对照表 */
.level-sup-table-wrapper {
  overflow-x: auto;
  margin-top: 8px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--paper-soft);
}

.level-sup-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.level-sup-table th {
  padding: 8px 12px;
  background: var(--level-sup-th-bg, rgba(139, 90, 43, 0.08));
  color: var(--text-muted);
  font-weight: 700;
  border-bottom: 1px solid var(--border-soft);
  white-space: nowrap;
}

.level-sup-table td {
  padding: 7px 12px;
  border-bottom: 1px dashed var(--border-soft);
  color: var(--text-main);
  white-space: nowrap;
}

.level-sup-table tr:last-child td {
  border-bottom: none;
}

.level-sup-table__row--max {
  background: var(--level-sup-max-bg, rgba(180, 50, 50, 0.06));
}

.level-sup-table__diff {
  font-weight: 600;
}

.level-sup-table__badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: #c0392b;
  border-radius: 3px;
}

.level-sup-table td.level-sup-table__red {
  color: var(--level-sup-red, #c0392b);
  font-weight: 600;
}

.level-sup-table td.level-sup-table__dmg {
  color: var(--level-sup-dmg, #27ae60);
  font-weight: 600;
}

.level-sup-table__bar-cell {
  width: 130px;
}

.level-sup-table__bar-track {
  height: 8px;
  width: 100px;
  background: rgba(192, 57, 43, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.level-sup-table__bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #d35400, #27ae60);
  border-radius: 4px;
}

/* 步骤公式与解析卡片（象牙白单层洁净板面 + 书卷衬线分式排版；深色变量由末尾非 scoped 块注入） */
.formula-card {
  margin-top: 8px;
  padding: 20px 18px 16px;
  background: var(--glossary-formula-bg, #fdf9f0);
  border: 1px solid var(--glossary-formula-border, rgba(135, 107, 72, 0.28));
  border-radius: 6px;
}

.formula-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.formula-fraction-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", Georgia, "Times New Roman", serif;
  font-size: clamp(16px, 3.8vw, 20px);
  font-weight: 500;
  color: var(--text-main);
  margin-bottom: 4px;
}

.formula-lhs {
  color: var(--text-main);
}

.formula-eq-sym {
  color: var(--text-main);
  opacity: 0.82;
}

.formula-fraction {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  vertical-align: middle;
}

.formula-fraction__num {
  padding: 0 14px 6px;
  font-size: inherit;
  font-weight: 500;
  color: var(--text-main);
}

.formula-fraction__bar {
  width: 100%;
  height: 1.5px;
  background: var(--text-main);
  opacity: 0.85;
}

.formula-fraction__den {
  padding: 6px 12px 0;
  font-size: clamp(15px, 3.6vw, 19px);
  font-weight: 500;
  color: var(--text-main);
}

.formula-eq-line {
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", Georgia, "Times New Roman", serif;
  font-size: clamp(14.5px, 3.3vw, 17px);
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-main);
  overflow-wrap: anywhere;
}

.formula-sup {
  font-size: 0.72em;
  line-height: 0;
  vertical-align: super;
}

.formula-display__meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
}

.formula-meta-paren {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

.formula-meta-param {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-main);
  overflow-wrap: anywhere;
}

.formula-meta-highlight {
  font-weight: 700;
  color: var(--glossary-formula-accent, #8a4b08);
}

.formula-meta-takeaway {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
  margin-top: 2px;
}

.formula-card__notes {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed rgba(135, 107, 72, 0.22);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-muted);
}

.formula-card__note strong {
  color: var(--text-main);
}

.formula-card__note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.formula-card__bullet {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-top: 7px;
  flex-shrink: 0;
  background: var(--accent-ink);
}

.formula-card__bullet--add {
  background: #2980b9;
}

.formula-card__bullet--key {
  background: #d35400;
}

.formula-card__bullet--res {
  background: #c0392b;
}

.formula-card__bullet--k {
  background: #27ae60;
}

.formula-card__bullet--def {
  background: #8e44ad;
}

.formula-card__bullet--crit {
  background: #e67e22;
}

.formula-card__bullet--crit-dam {
  background: #e74c3c;
}

.formula-card__bullet--suppress {
  background: #c0392b;
}

.formula-card__text code {
  padding: 1px 4px;
  background: var(--glossary-code-bg, rgba(0, 0, 0, 0.06));
  border-radius: 3px;
  font-family: monospace;
}

/* 步骤折叠按钮与内容 */
.rule-value-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
}

.rule-value-text {
  width: 100%;
}

.rule-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-ink);
  background: var(--paper-soft);
  border: 1px dashed var(--border-soft);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  margin-top: 4px;
}

.rule-toggle-btn:hover {
  background: var(--paper-solid);
  border-color: var(--accent-ink);
}

.rule-toggle-icon {
  font-size: 10px;
}

.step-inline-diagram {
  margin: 6px 0 10px 0;
  width: 100%;
}

/* 过渡动画 */
.formula-fade-enter-active,
.formula-fade-leave-active {
  transition: all 0.2s ease;
}

.formula-fade-enter-from,
.formula-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 860px) {
  .glossary-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .glossary-content {
    padding-inline: 10px;
  }
  .glossary-card__button {
    padding: 10px;
    gap: 10px;
  }
  .glossary-card__icon {
    flex-basis: 34px;
    width: 34px;
    height: 34px;
  }
  .rules-table :deep(.ui-info-row) {
    flex-direction: column;
    gap: 4px;
  }
  .rules-table :deep(.ui-info-row__label) {
    flex: none;
    max-width: none;
    color: var(--accent-ink);
  }
}

@media (max-width: 480px) {
  .glossary-content {
    padding-inline: 6px;
  }
}
</style>

<style>
.dark-mode,
.dark-theme {
  --glossary-formula-bg: #32251a;
  --glossary-formula-border: rgba(143, 115, 81, 0.45);
  --glossary-formula-accent: #f0b95d;
  --glossary-code-bg: rgba(255, 240, 210, 0.1);
  --level-sup-th-bg: rgba(255, 240, 210, 0.08);
  --level-sup-max-bg: rgba(226, 90, 90, 0.14);
  --level-sup-red: #f1948a;
  --level-sup-dmg: #58d68d;
}
</style>
