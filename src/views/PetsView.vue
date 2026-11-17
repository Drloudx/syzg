<template>
  <div class="page-view-container pets-page">

    <!-- 筛选区 -->
    <UiFilterPanel class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput v-model="searchQuery" placeholder="搜索魔物名称、特性、描述..." />
      </template>

      <!-- 属性筛选 -->
      <UiFilterRow label="属性：">
        <UiFilterPill :active="selectedElement === null" @click="selectedElement = null">全部</UiFilterPill>
        <UiFilterPill
          v-for="(elementName, elementKey) in ELEMENT_NAMES"
          :key="elementKey"
          :active="selectedElement === Number(elementKey)"
          @click="selectedElement = Number(elementKey)"
        >{{ elementName }}</UiFilterPill>
      </UiFilterRow>

      <!-- 稀有度筛选 -->
      <UiFilterRow label="稀有度：">
        <UiFilterPill :active="selectedStar === null" @click="selectedStar = null">全部</UiFilterPill>
        <UiFilterPill
          v-for="starVal in [5, 4, 3]"
          :key="starVal"
          :quality="starVal"
          :active="selectedStar === starVal"
          @click="selectedStar = starVal"
        >{{ starVal }}星</UiFilterPill>
      </UiFilterRow>

      <!-- 形态筛选 -->
      <UiFilterRow label="形态：">
        <UiFilterPill :active="filterVariant === null" @click="filterVariant = null">全部</UiFilterPill>
        <UiFilterPill :active="filterVariant === true" @click="filterVariant = true">可变异</UiFilterPill>
      </UiFilterRow>

      <div class="pets-toolbar">
        <div class="collection-counter">共 <span class="count-num">{{ filteredPets.length }}</span> 只魔物</div>
        <!-- 视图模式：图文详情 / 特性表格（桌面默认图文，手机默认表格） -->
        <div class="view-mode-toggle" role="group" aria-label="视图模式切换">
          <button
            type="button"
            class="view-mode-btn"
            :class="{ 'is-active': viewMode === 'detail' }"
            title="图文模式：魔物卡片"
            @click="setViewMode('detail')"
          >
            <svg class="view-mode-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 3h3v3H2V3zm5 1h7v1H7V4zm0 6h7v1H7v-1zM2 9h3v3H2V9z" />
            </svg>
            <span>图文</span>
          </button>
          <button
            type="button"
            class="view-mode-btn"
            :class="{ 'is-active': viewMode === 'table' }"
            title="特性表格：一表看全部魔物的特性与 1~7 级效果"
            @click="setViewMode('table')"
          >
            <svg class="view-mode-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2h14v2H1V2zm0 4h4v3H1V6zm6 0h4v3H7V6zm6 0h2v3h-2V6zM1 11h4v3H1v-3zm6 0h4v3H7v-3zm6 0h2v3h-2v-3z" />
            </svg>
            <span>特性表格</span>
          </button>
        </div>
      </div>

      <!-- 表头行（完全对齐魔物收益页）：放在筛选面板 footer 里，属于顶部固定栏 -->
      <template v-if="viewMode === 'table'" #footer>
        <div class="pets-th-row">
          <div class="pets-th th-name">魔物</div>
          <div class="pets-th th-star">星级</div>
          <div class="pets-th th-element">属性</div>
          <div class="pets-th th-trait">特性名</div>
          <div class="pets-th th-effect">特性效果（满级 7 级）</div>
          <div class="pets-th th-range">1 级 → 7 级</div>
        </div>
      </template>
    </UiFilterPanel>

    <!-- 加载态 / 错误态 -->
    <UiEmptyState v-if="!isDataReady && !errorMessage" type="loading" text="正在装配魔物图鉴数据..." />
    <UiEmptyState v-else-if="errorMessage" type="error" :text="errorMessage" @retry="loadPetsData" />

    <!-- 特性表格视图（结构借鉴魔物收益页：滚动容器 + paper-panel + flex 行） -->
    <div v-else-if="viewMode === 'table'" id="petsTableScroll" class="pets-table-scroll" data-main-scroll>
      <div class="pets-table-container paper-panel">
        <div v-for="pet in filteredPets" :key="pet.id" class="pets-table-row" @click="handlePetClick(pet)">
          <!-- 魔物头像 + 名称 -->
          <div class="pets-td td-name">
            <div class="pet-avatar-wrapper">
              <img
                :src="getImageUrl(`/images/PicHandBookPanel_Atlas/${pet.monImg}.webp`)"
                :alt="pet.name"
                class="pet-avatar-img"
                loading="lazy"
                @error="handleImgError"
              />
            </div>
            <span class="cell-name" :class="`quality-text-${pet.starDisplay}`">
              {{ pet.name }}
            </span>
          </div>

          <!-- 星级（按魔物收益页规范：对齐 quality-text 品质文字色） -->
          <div class="pets-td td-star" :class="`quality-text-${pet.starDisplay}`">{{ pet.starDisplay }}★</div>

          <!-- 属性（沉稳雅致色调） -->
          <div class="pets-td td-element">
            <span class="element-tag" :class="`element-${pet.element}`">{{ pet.elementName }}</span>
          </div>

          <!-- 特性名 -->
          <div class="pets-td td-trait">
            <span class="trait-name">{{ pet.trait?.name || '—' }}</span>
          </div>

          <!-- 特性效果（满级 7 级） -->
          <div class="pets-td td-effect" v-html="pet.trait ? formatSkillDescription(pet.trait.maxText) : '—'"></div>

          <!-- 1 级 → 7 级（纯数值换行） -->
          <div class="pets-td td-range">
            <div v-if="getPetRanges(pet).length" class="range-list">
              <span v-for="(rangeItem, idx) in getPetRanges(pet)" :key="idx" class="range-item">
                {{ rangeItem }}
              </span>
            </div>
            <span v-else class="text-muted">—</span>
          </div>
        </div>

        <!-- 空态提示：筛选无结果时展示，避免表格坍塌为一条线 -->
        <UiEmptyState v-if="filteredPets.length === 0" text="未找到匹配的魔物特性数据" />
      </div>
    </div>

    <!-- 列表区（5列大幅面卡片展示，懒加载每批 60 项） -->
    <UiCardGrid v-else id="petsGridScroll" class="pets-card-grid">
      <UiItemCard
        v-for="pet in displayedPets"
        :key="pet.id"
        :name="pet.name"
        :quality="pet.starDisplay"
        @click="handlePetClick(pet)"
      >
        <template #icon>
          <div class="pet-card-art">
            <img
              :src="getImageUrl(`/images/PetPanel/petcard_botm_${pet.starDisplay}.webp`)"
              class="pet-card-background"
              alt=""
            />
            <img
              :src="getImageUrl(`/images/PicHandBookPanel_Atlas/${pet.monImg}.webp`)"
              :alt="pet.name"
              class="pet-card-avatar"
              loading="lazy"
              @error="handleImgError"
            />
            <img
              :src="getImageUrl(`/images/PetPanel/petcard_${pet.starDisplay}.webp`)"
              class="pet-card-frame"
              alt=""
            />
            <!--
              可变异标记：与游戏内一致（`PicCenterPetTemp.Init` 里 sprite `pet_info_mutate`）。
              仅按 `variantChance != 0` 显隐；真实孵化概率服务端判定、数值未证实，故不展示百分比。
            -->
            <img
              v-if="pet.variantChance > 0"
              :src="getImageUrl('/ui/pet_info_mutate.png')"
              class="pet-card-mutate"
              alt="可变异"
              title="可变异：孵化后判定"
            />
          </div>
        </template>
      </UiItemCard>
      <UiEmptyState v-if="filteredPets.length === 0" text="未找到匹配的魔物数据" />
    </UiCardGrid>

    <UiBackToTop :scroll-container="viewMode === 'table' ? '#petsTableScroll' : '#petsGridScroll'" />

    <!-- FULLSCREEN DETAIL MODAL -->
    <UiModal
      v-model:visible="detailVisible"
      :title="selectedPet ? selectedPet.name : '魔物详情'"
      max-width="820px"
      scroll-id="petModalScroll"
      :z-index="2000"
      @close="closePetDetail"
    >
      <template v-if="selectedPet">
        <!-- TOP PORTRAIT SECTION -->
        <div class="portrait-section" :class="{ 'has-variants-layout': selectedPet.hasVariant }">
          <div class="pet-portraits-row">
            <!-- Regular Portrait -->
            <div class="pet-portrait-box">
              <div class="portrait-label-pos"><UiTag tone="wood">普通形态</UiTag></div>

              <!-- 右上角带图标的属性 -->
              <div class="portrait-element-badge" v-if="selectedPet.element">
                <img :src="getImageUrl(`/images/HeroGachaShowPanel_Atlas/spGachaTag${getSpGachaElementSlug(selectedPet.element)}03.webp`)" class="top-right-badge-icon" alt="" />
                <span :class="`element-${selectedPet.element}`">{{ selectedPet.elementName || getElementName(selectedPet.element) }}</span>
              </div>

              <img
                :src="getImageUrl(`/images/PicHandBookPanel_Atlas/${selectedPet.monImg}.webp`)"
                :alt="selectedPet.name"
                class="pet-portrait-img"
                @error="handleImgError"
              />
            </div>

            <!-- Variant Portrait (if can mutate) -->
            <div class="pet-portrait-box" v-if="selectedPet.hasVariant">
              <div class="portrait-label-pos"><UiTag tone="accent">变异形态</UiTag></div>

              <!-- 右上角带图标的属性 -->
              <div class="portrait-element-badge" v-if="selectedPet.element">
                <img :src="getImageUrl(`/images/HeroGachaShowPanel_Atlas/spGachaTag${getSpGachaElementSlug(selectedPet.element)}03.webp`)" class="top-right-badge-icon" alt="" />
                <span :class="`element-${selectedPet.element}`">{{ selectedPet.elementName || getElementName(selectedPet.element) }}</span>
              </div>

              <img
                :src="variantImgUrl(selectedPet)"
                :alt="selectedPet.name"
                class="pet-portrait-img"
                @error="handleImgError"
              />
            </div>
          </div>

          <!-- Pet Description Box below portraits -->
          <div class="pet-description-text" v-if="selectedPet.des">
            {{ selectedPet.des }}
          </div>

          <!-- Mutant variant details description under portraits -->
          <div class="variant-effect-box" v-if="selectedPet.hasVariant && primaryVariant">
            <div class="variant-line">
              <span class="variant-effect-title">变异效果:</span>
              <span
                v-if="hasVariantDes"
                class="variant-effect-txt"
                v-html="formatSkillDescription(primaryVariant.des)"
              ></span><span
                v-for="(extra, index) in variantExtraEffects"
                :key="extra"
                class="variant-effect-txt"
              >{{ (hasVariantDes || index > 0 ? '，' : '') + extra }}</span>
            </div>
          </div>
        </div>

        <!-- MIDDLE TABS NAVIGATION -->
        <div class="detail-tabs-wrap">
          <UiTabs
            v-model="activeTab"
            :options="[{ value: 'skills', label: '技能特性' }, { value: 'stats', label: '基础属性' }]"
          />
        </div>

        <!-- TAB CONTENT 1: SKILLS -->
        <div class="tab-pane-content" v-if="activeTab === 'skills'">
          <!-- Skills Select Grid matching Character Handbook -->
          <div class="skills-select-grid">
            <div
              v-for="(sk, idx) in selectedPet.skills"
              :key="idx"
              class="skill-select-card"
              :class="{ active: selectedSkillIdx === idx }"
              @click="selectSkill(idx)"
            >
              <!-- Trait (特性) with Circular inner avatar and frame -->
              <div class="skill-select-icon-wrap" v-if="sk.type === 'trait'">
                <img :src="getImageUrl(sk.innerIcon)" class="trait-inner-avatar" alt="" />
                <img :src="getImageUrl(sk.icon)" class="trait-frame-border" alt="" />
              </div>
              <!-- Normal active skill icon (only render if active and has icon) -->
              <img
                v-else-if="sk.type === 'active' && sk.icon"
                :src="getImageUrl(sk.icon)"
                class="skill-select-icon active-skill-sprite"
                alt=""
              />
              <!-- Text labels -->
              <div class="skill-select-info">
                <UiTag :tone="(sk.type === 'trait' || idx === 3) ? 'accent' : 'gold'">
                  {{ sk.type === 'normal' ? '普攻' : (sk.type === 'trait' ? '特性' : (idx === 3 ? '队伍被动' : '技能')) }}
                </UiTag>
                <span class="sk-name">{{ sk.name }}</span>
              </div>
            </div>
          </div>

          <!-- Detail panel below (紧凑高利用率滑块排版) -->
          <div class="skill-desc-detail-card" v-if="activeSkill">
            <header class="sk-detail-header">
              <div class="sk-detail-header-left">
                <span class="sk-detail-title">{{ activeSkill.name }}</span>
                <UiTag :tone="activeSkill.type === 'normal' ? 'default' : ((activeSkill.type === 'trait' || selectedSkillIdx === 3) ? 'accent' : 'gold')">
                  {{ activeSkill.type === 'normal' ? '普通攻击' : (activeSkill.type === 'trait' ? '被动特性' : (selectedSkillIdx === 3 ? '队伍被动' : '主动技能')) }}
                </UiTag>
                <!-- 技能 CD 与消耗（对齐角色图鉴放技能后面） -->
                <div class="skill-meta-tags" v-if="activeSkillLevelData && (activeSkillLevelData.cd || activeSkillLevelData.cost)">
                  <UiTag v-if="activeSkillLevelData.cd" tone="accent">CD: {{ activeSkillLevelData.cd }}s</UiTag>
                  <UiTag v-if="activeSkillLevelData.cost" tone="accent">消耗: {{ activeSkillLevelData.cost }}</UiTag>
                </div>
              </div>
              <UiTag v-if="activeSkill.maxLevel > 1" tone="accent">
                可升至 Lv.{{ activeSkill.maxLevel }}
              </UiTag>
            </header>

            <!-- 技能等级滑块（恢复整行 100% 满宽，无按键阻碍，丝滑手感） -->
            <div class="skill-level-slider-container" v-if="activeSkill.maxLevel > 1">
              <div class="skill-slider-header">
                <span class="skill-slider-title">技能等级:</span>
                <div class="skill-slider-status">
                  <strong class="skill-slider-current">Lv.{{ selectedSkillLevel }}</strong>
                  <span class="skill-slider-max">/ {{ activeSkill.maxLevel }}</span>
                  <UiTag v-if="selectedSkillLevel === activeSkill.maxLevel" tone="gold" size="sm" class="max-badge">满级</UiTag>
                </div>
              </div>
              <input
                type="range"
                min="1"
                :max="activeSkill.maxLevel"
                v-model.number="selectedSkillLevel"
                class="calc-range-slider"
                aria-label="技能等级"
              />
            </div>

            <!-- 当前等级效果描述 -->
            <div class="skill-des-box" v-if="activeSkillLevelData">
              <div class="lvl-subname" v-if="activeSkillLevelData.name && activeSkill.type === 'active'">{{ activeSkillLevelData.name }}</div>
              <p class="lvl-des-txt" v-html="formatSkillDescription(activeSkillLevelData.des)"></p>
            </div>

            <!-- 培育/突破分段标尺 (货运站同款优雅设计，双向联动) -->
            <div class="pet-upgrade-section" v-if="activeSkill.type !== 'normal'">
              <!-- 1. 特性培育阶梯 (Trait: Lv.1 ~ Lv.7) -->
              <template v-if="activeSkill.type === 'trait'">
                <div class="upgrade-section-header">
                  <span class="upgrade-section-title">培育提升要求</span>
                  <span class="upgrade-section-hint">孵化同种魔物获得图鉴值（育成数）</span>
                </div>

                <div class="pet-tier-spectrum">
                  <div class="pet-tier-spectrum__labels">
                    <span
                      v-for="item in traitProgression.tiers"
                      :key="item.level"
                      class="pet-tier-spectrum__label"
                      :class="{ 'is-active': selectedSkillLevel === item.level }"
                      @click="selectSkillLevel(item.level)"
                    >
                      <i v-if="selectedSkillLevel === item.level" class="pet-tier-spectrum__arrow" aria-hidden="true"></i>
                      <span>{{ item.label }}</span>
                      <span v-if="item.isMax" class="max-badge">满级</span>
                    </span>
                  </div>

                  <div class="pet-tier-spectrum__bar">
                    <button
                      type="button"
                      v-for="item in traitProgression.tiers"
                      :key="item.level"
                      class="pet-tier-spectrum__segment"
                      :class="{
                        'is-active': selectedSkillLevel === item.level,
                        'is-reached': selectedSkillLevel >= item.level
                      }"
                      :title="`Lv.${item.level} 需孵化 ${item.cost} 只`"
                      @click="selectSkillLevel(item.level)"
                    ></button>
                  </div>

                  <div class="pet-tier-spectrum__values">
                    <span
                      v-for="item in traitProgression.tiers"
                      :key="item.level"
                      class="pet-tier-spectrum__val"
                      :class="{ 'is-active': selectedSkillLevel === item.level }"
                      @click="selectSkillLevel(item.level)"
                    >
                      {{ item.costLabel }}
                    </span>
                  </div>
                </div>

                <div class="tier-summary-card">
                  <span class="summary-label">当前等级要求：</span>
                  <span class="summary-val highlight">Lv.{{ selectedSkillLevel }}</span>
                  <span class="summary-sub" v-if="selectedSkillLevel > 1">
                    （需孵化 <strong>+{{ traitProgression.tiers[selectedSkillLevel - 1]?.cost }}</strong> 只，累计需 <strong>{{ traitProgression.tiers[selectedSkillLevel - 1]?.cumulative }}</strong> 只）
                  </span>
                  <span class="summary-sub" v-else>
                    （解锁魔物即激活 Lv.1 特性）
                  </span>
                </div>
              </template>

              <!-- 2. 主动技能与队伍被动突破阶梯 (Active / Team Passive: Lv.1 ~ Lv.4) -->
              <template v-else-if="activeSkill.type === 'active'">
                <div class="upgrade-section-header">
                  <span class="upgrade-section-title">突破提升要求</span>
                  <span class="upgrade-section-hint">通过魔物突破提升技能等级（魔物突破共 6 阶）</span>
                </div>

                <div class="pet-tier-spectrum pet-tier-spectrum--active">
                  <div class="pet-tier-spectrum__labels">
                    <span
                      v-for="item in activeSkillProgression.tiers"
                      :key="item.level"
                      class="pet-tier-spectrum__label"
                      :class="{ 'is-active': selectedSkillLevel === item.level }"
                      @click="selectSkillLevel(item.level)"
                    >
                      <i v-if="selectedSkillLevel === item.level" class="pet-tier-spectrum__arrow" aria-hidden="true"></i>
                      <span>{{ item.label }}</span>
                      <span class="stage-tag">{{ item.stageLabel }}</span>
                    </span>
                  </div>

                  <div class="pet-tier-spectrum__bar">
                    <button
                      type="button"
                      v-for="item in activeSkillProgression.tiers"
                      :key="item.level"
                      class="pet-tier-spectrum__segment"
                      :class="{
                        'is-active': selectedSkillLevel === item.level,
                        'is-reached': selectedSkillLevel >= item.level
                      }"
                      :title="`Lv.${item.level} (${item.stageLabel})，消耗 ${item.costLabel}`"
                      @click="selectSkillLevel(item.level)"
                    ></button>
                  </div>

                  <div class="pet-tier-spectrum__values">
                    <span
                      v-for="item in activeSkillProgression.tiers"
                      :key="item.level"
                      class="pet-tier-spectrum__val"
                      :class="{ 'is-active': selectedSkillLevel === item.level }"
                      @click="selectSkillLevel(item.level)"
                    >
                      {{ item.costLabel }}
                    </span>
                  </div>
                </div>

                <div class="tier-summary-card tier-summary-card--active">
                  <span class="summary-label">当前等级要求：</span>
                  <span class="summary-val highlight">Lv.{{ selectedSkillLevel }}</span>
                  <span class="summary-sub" v-if="selectedSkillLevel > 1">
                    （需魔物 <strong>{{ activeSkillProgression.tiers[selectedSkillLevel - 1]?.stageLabel }}</strong>，消耗同种魔物 <strong>{{ activeSkillProgression.tiers[selectedSkillLevel - 1]?.cost }}</strong> 只，累计消耗 <strong>{{ activeSkillProgression.tiers[selectedSkillLevel - 1]?.cumulative }}</strong> 只）
                  </span>
                  <span class="summary-sub" v-else>
                    （无需突破，魔物初始具备）
                  </span>
                </div>

                <!-- 3. 魔物 6 阶突破交替路线图 (Roadmap) -->
                <div class="breakthrough-roadmap-box">
                  <div class="roadmap-header">
                    <span class="roadmap-title">魔物 6 阶突破路线图</span>
                    <span class="roadmap-tip">点击阶段可跳转对应技能</span>
                  </div>
                  <div class="roadmap-steps-grid">
                    <div
                      v-for="step in breakthroughRoadmap"
                      :key="step.stage"
                      class="roadmap-step-pill"
                      :class="{
                        'is-current-skill': step.isCurrentSkillTarget,
                        'is-selected-step': step.isCurrentSkillTarget && selectedSkillLevel === step.targetLevel
                      }"
                      @click="onSelectRoadmapStep(step)"
                    >
                      <div class="step-badge">{{ step.stageLabel }}</div>
                      <div class="step-info">
                        <span class="step-skill-name">{{ step.skillName }}</span>
                        <span class="step-target-lvl">{{ step.targetLevelLabel }}</span>
                      </div>
                      <div class="step-cost">消耗 {{ step.cost }} 只</div>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <!-- 底部汇总说明（角色图鉴同款 star-limits-box） -->
            <div class="star-limits-box" :class="{ 'star-limits-box--active': activeSkill.type !== 'trait' }" v-if="activeSkill.maxLevel > 1">
              <div class="limit-title">
                {{ activeSkill.type === 'trait' ? '特性培育总览：' : '技能突破总览：' }}
              </div>
              <ul class="limit-list">
                <template v-if="activeSkill.type === 'trait'">
                  <li>
                    升至满级（Lv.7）累计需要孵化同种魔物 <span class="limit-num">{{ traitProgression.totalHatch }}</span> 只（当前魔物为 {{ selectedPet.star }} 星）。
                  </li>
                  <li>
                    孵化获得的图鉴值对该魔物的所有同种实例永久生效。
                  </li>
                </template>
                <template v-else>
                  <li>
                    该技能升至满级（Lv.4）需累计突破至 <span class="limit-num">{{ activeSkillProgression.tiers[activeSkillProgression.tiers.length - 1]?.stageLabel }}</span>，累计消耗同种魔物 <span class="limit-num">{{ activeSkillProgression.totalSkillCost }}</span> 只（突破不可跳阶，含全部前序阶段）。
                  </li>
                  <li>
                    魔物突破 1~6 阶全满总计需消耗 <span class="limit-num">{{ activeSkillProgression.totalPetBreakthroughCost }}</span> 只。
                  </li>
                  <li>
                    <strong>突破交替规则：</strong>+1/+3/+5 阶提升主动技能（Lv.2/3/4），+2/+4/+6 阶提升队伍被动（Lv.2/3/4）。
                  </li>
                </template>
              </ul>
            </div>
          </div>
        </div>

        <!-- TAB CONTENT 2: STATS & GROWTHS -->
        <div class="tab-pane-content" v-if="activeTab === 'stats'">
          <div class="stats-growth-layout">
            <!-- 基础属性与成长区间 -->
            <UiSection title="基础属性与成长范围">
              <UiStatGrid :items="[
                { label: '生命', value: selectedPet.hp },
                { label: '成长', value: `${selectedPet.hpMin} ~ ${selectedPet.hpMax}` },
                { label: '攻击', value: selectedPet.atk },
                { label: '成长', value: `${selectedPet.atkMin} ~ ${selectedPet.atkMax}` },
                { label: '防御', value: selectedPet.def },
                { label: '成长', value: `${selectedPet.defMin} ~ ${selectedPet.defMax}` },
                { label: '敏捷', value: selectedPet.dex },
                { label: '成长', value: `${selectedPet.dexMin} ~ ${selectedPet.dexMax}` }
              ]" />
            </UiSection>

            <!-- 其他属性 -->
            <UiSection title="其他属性">
              <UiInfoRow label="孵化时间" :value="formatHatchTime(selectedPet.eggTime)" />
              <UiInfoRow label="出售价值">
                <span class="inline-icon-value">
                  <img :src="getImageUrl(BASE_REWARD_PATHS.money)" class="mini-attr-icon" alt="" />
                  <span>{{ selectedPet.sellPrice }}</span>
                </span>
              </UiInfoRow>
              <UiInfoRow label="孵化经验">
                <span class="inline-icon-value">
                  <img :src="getImageUrl(BASE_REWARD_PATHS.heroExp)" class="mini-attr-icon" alt="" />
                  <span>{{ selectedPet.exp }}</span>
                </span>
              </UiInfoRow>
              <UiInfoRow label="战斗CD" :value="`${selectedPet.petCd}秒`" />
              <UiInfoRow label="房间CD" :value="`${selectedPet.roomCd}间`" />
              <UiInfoRow label="上场时间" :value="`${selectedPet.lifeTime}秒`" />
            </UiSection>

            <!-- 好感相关 -->
            <UiSection title="好感相关">
              <UiStatGrid v-if="petSetting" :items="[
                { label: '总好感上限', value: petSetting.maxFavor },
                { label: '每日好感上限', value: petSetting.maxFavorDaily },
                { label: '上场加时转化', value: `1秒 / ${petSetting.lifeTimeFavor}好感`, stackedMobile: true },
                { label: '抚摸增加好感', value: `+${petSetting.favorActionAdd}` }
              ]" />
            </UiSection>

            <!-- 成长系数调参 -->
            <UiSection title="成长系数调参">
              <div class="stats-inputs-grid">
                <!-- HP Growth -->
                <div class="stat-input-row">
                  <div class="stat-meta">
                    <span class="name">生命成长值:</span>
                    <span class="range">({{ selectedPet.hpMin }} ~ {{ selectedPet.hpMax }})</span>
                  </div>
                  <div class="slider-container-row">
                    <input
                      type="range"
                      :min="selectedPet.hpMin"
                      :max="selectedPet.hpMax"
                      step="0.1"
                      v-model.number="growthHp"
                      class="range-slider-m"
                    />
                    <span class="current-val">{{ growthHp.toFixed(1) }}</span>
                    <span class="rank-badge" :class="getGrowthRankBadge('hp', growthHp)">
                      {{ getGrowthRankLabel('hp', growthHp) }}
                    </span>
                  </div>
                </div>

                <!-- ATK Growth -->
                <div class="stat-input-row">
                  <div class="stat-meta">
                    <span class="name">攻击成长值:</span>
                    <span class="range">({{ selectedPet.atkMin }} ~ {{ selectedPet.atkMax }})</span>
                  </div>
                  <div class="slider-container-row">
                    <input
                      type="range"
                      :min="selectedPet.atkMin"
                      :max="selectedPet.atkMax"
                      step="0.1"
                      v-model.number="growthAtk"
                      class="range-slider-m"
                    />
                    <span class="current-val">{{ growthAtk.toFixed(1) }}</span>
                    <span class="rank-badge" :class="getGrowthRankBadge('atk', growthAtk)">
                      {{ getGrowthRankLabel('atk', growthAtk) }}
                    </span>
                  </div>
                </div>

                <!-- DEF Growth -->
                <div class="stat-input-row">
                  <div class="stat-meta">
                    <span class="name">防御成长值:</span>
                    <span class="range">({{ selectedPet.defMin }} ~ {{ selectedPet.defMax }})</span>
                  </div>
                  <div class="slider-container-row">
                    <input
                      type="range"
                      :min="selectedPet.defMin"
                      :max="selectedPet.defMax"
                      step="0.1"
                      v-model.number="growthDef"
                      class="range-slider-m"
                    />
                    <span class="current-val">{{ growthDef.toFixed(1) }}</span>
                    <span class="rank-badge" :class="getGrowthRankBadge('def', growthDef)">
                      {{ getGrowthRankLabel('def', growthDef) }}
                    </span>
                  </div>
                </div>

                <!-- DEX Growth -->
                <div class="stat-input-row">
                  <div class="stat-meta">
                    <span class="name">敏捷成长值:</span>
                    <span class="range">({{ selectedPet.dexMin }} ~ {{ selectedPet.dexMax }})</span>
                  </div>
                  <div class="slider-container-row">
                    <input
                      type="range"
                      :min="selectedPet.dexMin"
                      :max="selectedPet.dexMax"
                      step="0.1"
                      v-model.number="growthDex"
                      class="range-slider-m"
                    />
                    <span class="current-val">{{ growthDex.toFixed(1) }}</span>
                    <span class="rank-badge" :class="getGrowthRankBadge('dex', growthDex)">
                      {{ getGrowthRankLabel('dex', growthDex) }}
                    </span>
                  </div>
                </div>
              </div>
            </UiSection>

            <!-- 等级数值模拟 -->
            <UiSection title="等级数值模拟">
              <div class="level-slider-block paper-panel-solid">
                <div class="slider-labels">
                  <span class="slider-title">目标等级:</span>
                  <span class="slider-value">Lv.{{ calcLevel }}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  :max="playerLevelCap"
                  v-model.number="calcLevel"
                  class="range-slider-m"
                />
                <div class="pet-level-growth-summary">
                  <span>每级基础属性 + 当前成长值</span>
                </div>
              </div>

              <!-- Exp cumulative and slime equivalent -->
              <div class="exp-cost-box">
                <div class="exp-summary-row">
                  <span>累计升级所需经验:</span>
                  <strong class="highlight-accent">{{ cumulativeLevelExp }} EXP</strong>
                </div>
                <div class="exp-slime-row">
                  <span>约等于绿色史莱姆数量:</span>
                  <div class="slime-chip">
                    <img :src="getImageUrl('/images/PicHandBookPanel_Atlas/colect_mon_072.webp')" class="mini-slime-icon" alt="" />
                    <span>×{{ (cumulativeLevelExp / 125).toFixed(1) }} </span>
                  </div>
                </div>
              </div>

              <!-- Current-level stats -->
              <div class="pet-base-stats-grid">
                <div class="pet-attr-cell">
                  <span class="attr-label">生命</span>
                  <span class="attr-val">{{ Math.floor(selectedPet.hp + growthHp * calcLevel) }}</span>
                </div>
                <div class="pet-attr-cell">
                  <span class="attr-label">成长</span>
                  <div class="attr-val-badge-container">
                    <span class="attr-val">{{ growthHp.toFixed(1) }}</span>
                    <span class="growth-rank-badge" :class="getGrowthRankBadge('hp', growthHp)">
                      {{ getGrowthRankLetter('hp', growthHp) }}
                    </span>
                  </div>
                </div>
                <div class="pet-attr-cell">
                  <span class="attr-label">攻击</span>
                  <span class="attr-val">{{ Math.floor(selectedPet.atk + growthAtk * calcLevel) }}</span>
                </div>
                <div class="pet-attr-cell">
                  <span class="attr-label">成长</span>
                  <div class="attr-val-badge-container">
                    <span class="attr-val">{{ growthAtk.toFixed(1) }}</span>
                    <span class="growth-rank-badge" :class="getGrowthRankBadge('atk', growthAtk)">
                      {{ getGrowthRankLetter('atk', growthAtk) }}
                    </span>
                  </div>
                </div>
                <div class="pet-attr-cell">
                  <span class="attr-label">防御</span>
                  <span class="attr-val">{{ Math.floor(selectedPet.def + growthDef * calcLevel) }}</span>
                </div>
                <div class="pet-attr-cell">
                  <span class="attr-label">成长</span>
                  <div class="attr-val-badge-container">
                    <span class="attr-val">{{ growthDef.toFixed(1) }}</span>
                    <span class="growth-rank-badge" :class="getGrowthRankBadge('def', growthDef)">
                      {{ getGrowthRankLetter('def', growthDef) }}
                    </span>
                  </div>
                </div>
                <div class="pet-attr-cell">
                  <span class="attr-label">敏捷</span>
                  <span class="attr-val">{{ Math.floor(selectedPet.dex + growthDex * calcLevel) }}</span>
                </div>
                <div class="pet-attr-cell">
                  <span class="attr-label">成长</span>
                  <div class="attr-val-badge-container">
                    <span class="attr-val">{{ growthDex.toFixed(1) }}</span>
                    <span class="growth-rank-badge" :class="getGrowthRankBadge('dex', growthDex)">
                      {{ getGrowthRankLetter('dex', growthDex) }}
                    </span>
                  </div>
                </div>
              </div>
            </UiSection>
          </div>
        </div>
      </template>

      <CommentsPanel
        v-if="petCommentPageKey"
        :page-key="petCommentPageKey"
        :page-label="selectedPet?.name || ''"
      />

      <UiBackToTop scroll-container="#petModalScroll" />
    </UiModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import {
  fetchPetData,
  getPetVariantExtraEffects,
  getPetTraitTiers,
  getPetActiveSkillTiers,
  getPetBreakthroughRoadmap,
  getPetSearchText
} from '../utils/petParser'
import { getImageUrl } from '../utils/env'
import { useRoute, useRouter } from 'vue-router'
import {
  UiFilterPanel, UiSearchInput,
  UiFilterRow,
  UiFilterPill,
  UiCardGrid,
  UiItemCard,
  UiEmptyState,
  UiBackToTop,
  UiModal,
  UiTabs,
  UiSection,
  UiInfoRow,
  UiStatGrid,
  UiTag
} from '../components/ui/index.js'
import { isBlacklisted } from '../config/blacklist.js'
import { ELEMENT_SLUGS, ELEMENT_NAMES, formatHighlightedText, BASE_REWARD_PATHS } from '../utils/gameMappings'
import { useLazyList } from '../composables/useLazyList'
import CommentsPanel from '../components/CommentsPanel.vue'
import { buildPageKey, COMMENT_PAGE_PREFIX } from '../utils/commentApi.js'

const route = useRoute()
const router = useRouter()

const allPets = ref([])
const petLevelData = ref(null)
const petSetting = ref(null)
const playerLevelCap = ref(1)
const isDataReady = ref(false)
const detailVisible = ref(false)
const selectedPet = ref(null)

/**
 * 视图模式：`detail`（魔物卡片）/ `table`（特性表格）。
 *
 * 桌面默认「图文」，手机默认「特性表格」——手机上表格比 5 列大卡片更好扫读，
 * 但保留切换按钮，两种视图在两端都能用。用户手动切换后记到 localStorage。
 */
const VIEW_MODE_KEY = 'pets_view_mode'
const isNarrowScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches
const viewMode = ref(
  (typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_MODE_KEY)) ||
  (isNarrowScreen() ? 'table' : 'detail')
)
function setViewMode(mode) {
  viewMode.value = mode
  try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* 隐私模式下忽略 */ }
}

/** 讨论区归属键：`pet:pet_006` */
const petCommentPageKey = computed(() => buildPageKey(COMMENT_PAGE_PREFIX.pet, selectedPet.value?.id))
const errorMessage = ref('')

const searchQuery = ref('')
const selectedElement = ref(null)
const selectedStar = ref(null)
const filterVariant = ref(null)

// Detail Drawer States
const activeTab = ref('skills')
const selectedSkillIdx = ref(0)
const selectedSkillLevel = ref(1)

// Stats Sliders
const growthHp = ref(0)
const growthAtk = ref(0)
const growthDef = ref(0)
const growthDex = ref(0)
const calcLevel = ref(1)

// 获取首字母大写的属性英文名，用于拼接图片路径
const getSpGachaElementSlug = (element) => ELEMENT_SLUGS[element] || 'Water'

// 兜底的属性中文名
const getElementName = (element) => ELEMENT_NAMES[element] || '水'

const loadPetsData = async () => {
  isDataReady.value = false
  errorMessage.value = ''
  try {
    const data = await fetchPetData()
    allPets.value = data.pets
    petLevelData.value = data.petLevel
    petSetting.value = data.petSetting
    playerLevelCap.value = Number(data.playerLevelCap) || 1
    isDataReady.value = true

    // Check URL Query parameter for auto-open
    if (route.query.id) {
      const pet = allPets.value.find(p => p.id === route.query.id)
      if (pet) {
        openPetDetail(pet)
      }
    }
  } catch (err) {
    errorMessage.value = '魔物图鉴加载失败，请重试'
    console.error(err)
  }
}

onMounted(() => {
  loadPetsData()
})

watch(() => route.query.id, (newId) => {
  if (newId) {
    const pet = allPets.value.find(p => p.id === newId)
    if (pet) {
      openPetDetail(pet)
    }
  } else {
    closePetDetail()
  }
})

// Filter computation
const filteredPets = computed(() => {
  if (!isDataReady.value) return []
  
  let result = allPets.value.filter(p => !isBlacklisted(p))
  
  // Element Filter
  if (selectedElement.value !== null) {
    result = result.filter(p => p.element === selectedElement.value)
  }

  // Star Filter
  if (selectedStar.value !== null) {
    result = result.filter(p => p.starDisplay === selectedStar.value)
  }
  
  // Variant Filter
  if (filterVariant.value === true) {
    result = result.filter(p => p.hasVariant)
  }
  
  // Search Query：空格表示“且”，顿号/逗号/斜杠表示“或”
  // 🔴 特性表格视图只检索特性相关内容，不检索主动技能与队伍被动，避免表格中未展示技能引发“货不对板”的困惑
  if (searchQuery.value && searchQuery.value.trim()) {
    const isTable = viewMode.value === 'table'
    const termGroups = searchQuery.value.trim().toLowerCase()
      .split(/\s+/)
      .map(group => group.split(/[、,，|/]+/).filter(Boolean))
      .filter(group => group.length)
    result = result.filter(pet => {
      const searchText = getPetSearchText(pet, { includeSkills: !isTable })
      return termGroups.every(group => group.some(term => searchText.includes(term)))
    })
  }
  
  // Sort：搜索时优先排「特性/名称直接命中」的项，避免仅技能命中的高星魔物强行霸占前排
  if (searchQuery.value && searchQuery.value.trim()) {
    const qLower = searchQuery.value.trim().toLowerCase()
    result.sort((a, b) => {
      const aTraitHit = getPetSearchText(a, { includeSkills: false }).includes(qLower) ? 1 : 0
      const bTraitHit = getPetSearchText(b, { includeSkills: false }).includes(qLower) ? 1 : 0
      if (bTraitHit !== aTraitHit) return bTraitHit - aTraitHit

      if (b.starDisplay !== a.starDisplay) return b.starDisplay - a.starDisplay
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
    })
  } else {
    result.sort((a, b) => {
      if (b.starDisplay !== a.starDisplay) {
        return b.starDisplay - a.starDisplay
      }
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
    })
  }
  
  return result
})

const { displayedItems: displayedPets } = useLazyList(filteredPets, 60, '#petsGridScroll')

// Navigation & Detail toggle
const handlePetClick = (pet) => {
  router.push({ query: { ...route.query, id: pet.id } })
}

const openPetDetail = (pet) => {
  selectedPet.value = pet
  detailVisible.value = true
  activeTab.value = 'skills'
  selectedSkillIdx.value = 0
  selectedSkillLevel.value = 1

  // Set default growth factors to best potential (75% mark of range)
  growthHp.value = pet.hpMin + (pet.hpMax - pet.hpMin) * 0.75
  growthAtk.value = pet.atkMin + (pet.atkMax - pet.atkMin) * 0.75
  growthDef.value = pet.defMin + (pet.defMax - pet.defMin) * 0.75
  growthDex.value = pet.dexMin + (pet.dexMax - pet.dexMin) * 0.75
  calcLevel.value = 1
}

const closePetDetail = () => {
  detailVisible.value = false
  if (route.query.id) {
    router.replace({ query: { ...route.query, id: undefined } })
  }
}

// Format Skill description values
const formatSkillDescription = formatHighlightedText

const primaryVariant = computed(() => selectedPet.value?.variants?.[0] || null)
const hasVariantDes = computed(() => Boolean(primaryVariant.value?.des?.trim()))
const variantExtraEffects = computed(() => getPetVariantExtraEffects(primaryVariant.value))

// Skills Logic
const activeSkill = computed(() => {
  if (!selectedPet.value) return null
  return selectedPet.value.skills[selectedSkillIdx.value] || null
})

const activeSkillLevelData = computed(() => {
  if (!activeSkill.value) return null
  return activeSkill.value.levelData.find(ld => ld.level === selectedSkillLevel.value) || activeSkill.value.levelData[0] || null
})

const selectSkill = (idx) => {
  selectedSkillIdx.value = idx
  selectedSkillLevel.value = 1
}

const selectSkillLevel = (lvl) => {
  if (lvl >= 1 && lvl <= (activeSkill.value?.maxLevel || 1)) {
    selectedSkillLevel.value = lvl
  }
}

// 当前魔物的所有主动技能（通常为2个：主动技能 + 队伍被动）
const currentPetActiveSkills = computed(() => {
  if (!selectedPet.value?.skills) return []
  return selectedPet.value.skills.filter(s => s.type === 'active')
})

// 当前选中的技能是第几个主动技能（0 = 主动技能, 1 = 队伍被动）
const currentActiveSkillIndex = computed(() => {
  if (!activeSkill.value) return 0
  const idx = currentPetActiveSkills.value.findIndex(s => s.id === activeSkill.value.id)
  return idx >= 0 ? idx : 0
})

// 特性培育阶梯数据 (Lv.1 ~ Lv.7)
const traitProgression = computed(() => {
  if (!selectedPet.value || !petSetting.value) return { tiers: [], totalHatch: 0 }
  return getPetTraitTiers(selectedPet.value.star, petSetting.value)
})

// 主动技能 / 队伍被动突破阶梯数据 (Lv.1 ~ Lv.4)
const activeSkillProgression = computed(() => {
  if (!selectedPet.value || !petSetting.value) return { tiers: [], totalSkillCost: 0, totalPetBreakthroughCost: 0 }
  return getPetActiveSkillTiers(selectedPet.value.star, petSetting.value, currentActiveSkillIndex.value)
})

// 6 阶全景突破路线图
const breakthroughRoadmap = computed(() => {
  if (!selectedPet.value || !petSetting.value) return []
  const s1Name = currentPetActiveSkills.value[0]?.name || '技能'
  const s2Name = currentPetActiveSkills.value[1]?.name || '队伍被动'
  return getPetBreakthroughRoadmap(
    selectedPet.value.star,
    petSetting.value,
    s1Name,
    s2Name,
    currentActiveSkillIndex.value
  )
})

// 点击全景路线图某阶时，自动切换到对应技能及对应等级
const onSelectRoadmapStep = (step) => {
  const targetSkillIdx = selectedPet.value.skills.findIndex(s => s.name === step.skillName)
  if (targetSkillIdx >= 0) {
    selectedSkillIdx.value = targetSkillIdx
    selectedSkillLevel.value = step.targetLevel
  }
}

// Active Skill Breakthrough costs list (e.g. [1, 1, 1, 2, 2, 2])
const getPetBreakthroughCosts = computed(() => {
  if (!selectedPet.value || !petSetting.value) return []
  const star = selectedPet.value.star
  const starExp = petSetting.value.petTpExp[star] || {}
  
  const costs = []
  for (let i = 0; i < 6; i++) {
    costs.push(starExp[String(i)] || 0)
  }
  return costs
})

// Active Breakthrough Step Index (0-5) mapping based on skill type and selected level
const getActiveBreakthroughStepIndex = computed(() => {
  if (!selectedPet.value || selectedSkillLevel.value >= 4) return -1
  
  const activeSkills = selectedPet.value.skills ? selectedPet.value.skills.filter(s => s.type === 'active') : []
  const currentActiveIndex = activeSkills.findIndex(s => s.id === activeSkill.value?.id)
  
  if (currentActiveIndex === 0) {
    if (selectedSkillLevel.value === 1) return 0
    if (selectedSkillLevel.value === 2) return 2
    if (selectedSkillLevel.value === 3) return 4
  } else if (currentActiveIndex === 1) {
    if (selectedSkillLevel.value === 1) return 1
    if (selectedSkillLevel.value === 2) return 3
    if (selectedSkillLevel.value === 3) return 5
  }
  return -1
})

const getTraitLevelHatchRequirement = () => {
  if (!selectedPet.value || !petSetting.value) return ''
  const star = selectedPet.value.star
  const starTj = petSetting.value.petTjExp[star] || {}
  
  const nextCost = starTj[selectedSkillLevel.value] || 0
  if (nextCost === 0 || nextCost > 90000) {
    return '已达最大等级'
  }
  return `下一级需育成数: ${nextCost}`
}

// Stats Ratings (C, B, A, S) Logic
const getGrowthRankLabel = (type, val) => {
  if (!selectedPet.value) return 'C'
  const pet = selectedPet.value
  let min = 0, max = 0
  if (type === 'hp') { min = pet.hpMin; max = pet.hpMax; }
  else if (type === 'atk') { min = pet.atkMin; max = pet.atkMax; }
  else if (type === 'def') { min = pet.defMin; max = pet.defMax; }
  else if (type === 'dex') { min = pet.dexMin; max = pet.dexMax; }

  const range = max - min
  if (range <= 0) return 'C'
  const ratio = (val - min) / range

  if (ratio < 0.25) return 'C'
  if (ratio < 0.50) return 'B'
  if (ratio < 0.75) return 'A'
  return 'S'
}

const getGrowthRankBadge = (type, val) => {
  const lbl = getGrowthRankLabel(type, val)
  if (lbl.includes('C')) return 'rank-c'
  if (lbl.includes('B')) return 'rank-b'
  if (lbl.includes('A')) return 'rank-a'
  return 'rank-s'
}

const getGrowthRankLetter = (type, val) => {
  const lbl = getGrowthRankLabel(type, val)
  return lbl.charAt(lbl.length - 1)
}

// Cumulative Upgrade Exp
const cumulativeLevelExp = computed(() => {
  if (!petLevelData.value) return 0
  let total = 0
  for (let lvl = 1; lvl < calcLevel.value; lvl++) {
    const lvlConfig = petLevelData.value[lvl] || petLevelData.value[String(lvl)]
    if (lvlConfig) {
      total += lvlConfig.exp || 0
    }
  }
  return total
})

// Time formatter
const formatHatchTime = (seconds) => {
  if (!seconds) return '0秒'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  let res = ''
  if (h > 0) res += `${h}小时`
  if (m > 0) res += `${m}分钟`
  if (s > 0 || res === '') res += `${s}秒`
  return res
}

const handleImgError = (e) => {
  e.target.style.opacity = '0.3'
}

/**
 * 变异形态图 URL。
 *
 * 图集 `PicHandBookPanel_Atlas` 里绝大多数可变异魔物有 `{monImg}_a.webp`，
 * 但个别魔物（当前只有 pet_101 青铜迷迷可）官方未提供变异图 →
 * 回退到本体图，避免详情页「变异形态」框整块空白（图片 404）。
 */
const VARIANT_IMG_AVAILABLE = new Set([
  // 有独立变异图的 monImg（缺的走回退）
  'colect_mon_006', 'colect_mon_046', 'colect_mon_065', 'colect_mon_071',
  'colect_mon_072', 'colect_mon_073', 'colect_mon_074', 'colect_mon_075',
  'colect_mon_076', 'colect_mon_077', 'colect_mon_078', 'colect_mon_079',
  'colect_mon_093', 'colect_mon_095', 'colect_mon_096', 'colect_mon_097',
  'colect_mon_098', 'colect_mon_105', 'colect_mon_106', 'colect_mon_107',
  'colect_mon_108', 'colect_mon_109', 'colect_mon_110',
])
const variantImgUrl = (pet) => {
  const img = VARIANT_IMG_AVAILABLE.has(pet.monImg) ? `${pet.monImg}_a` : pet.monImg
  return getImageUrl(`/images/PicHandBookPanel_Atlas/${img}.webp`)
}

/**
 * 提取魔物 1 级 → 7 级特性数值变化区间。
 * 纯数值展示：去掉「物理攻击」「魔法攻击」等汉字修饰，仅保留数字与百分比（如 500% → 1100%）；
 * 多个属性区间拆分为数组，便于多行换行展示。
 */
const getPetRanges = (pet) => {
  const trait = pet?.trait
  if (!trait || !trait.rangeText) return []
  const rawParts = String(trait.rangeText).split(/[，,]/).map(s => s.trim()).filter(Boolean)
  return rawParts.map(part => {
    if (!part.includes('→')) return part
    const [left, right] = part.split('→').map(s => s.trim())
    const cleanLeft = left.replace(/[\u4e00-\u9fa5]/g, '').trim()
    const cleanRight = right.replace(/[\u4e00-\u9fa5]/g, '').trim()
    return (cleanLeft && cleanRight) ? `${cleanLeft} → ${cleanRight}` : part
  })
}
</script>

<style scoped>
/* 计数：与其它图鉴页同一套样式（共 N 只魔物） */
.collection-counter {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}
/* 计数 + 视图切换同一行 */
.pets-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.view-mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--paper-soft, rgba(0, 0, 0, 0.05));
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 2px;
}
.view-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.4;
  white-space: nowrap;
}
.view-mode-btn:hover {
  color: var(--accent-ink);
  background: rgba(255, 255, 255, 0.3);
}
.view-mode-btn.is-active {
  background: var(--paper-solid, #fff);
  color: var(--accent-ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.view-mode-icon { width: 14px; height: 14px; flex-shrink: 0; }

/* ====== 特性表格（结构同魔物收益：筛选面板固定表头 + 头像 + 纯数值换行） ====== */
.pets-table-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 2px 0 calc(20px + var(--safe-bottom, 0px));
  box-sizing: border-box;
  min-height: 0;
}
.pets-table-container {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* 表头行：木色条，放在筛选面板 footer，与魔物收益 .table-header-row 完全一致 */
.pets-th-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin-top: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 1px 3px rgba(62, 42, 20, 0.12);
  user-select: none;
  flex-shrink: 0;
}
.pets-table-row {
  display: flex;
  align-items: center;
  padding: 9px 12px;
  background: var(--paper-soft);
  border-bottom: 1px solid var(--border-soft);
  cursor: pointer;
  transition: background 0.15s ease;
  font-size: 13px;
  line-height: 1.6;
}
.pets-table-row:last-child { border-bottom: none; }
.pets-table-row:hover { background: rgba(122, 154, 153, 0.12); }

.pets-th,
.pets-td {
  min-width: 0;
  overflow-wrap: anywhere;
  box-sizing: border-box;
  padding-right: 10px;
}
.pets-th:last-child,
.pets-td:last-child {
  padding-right: 0;
}

/* 列宽用百分比，表头与数据行严格对齐 */
.th-name,    .td-name    { flex: 0 0 20%; }
.th-star,    .td-star    { flex: 0 0 6%; display: flex; align-items: center; justify-content: center; text-align: center; white-space: nowrap; }
.th-element, .td-element { flex: 0 0 6%; display: flex; align-items: center; justify-content: center; text-align: center; white-space: nowrap; }
.th-trait,   .td-trait   { flex: 0 0 12%; }
.th-effect,  .td-effect  { flex: 1 1 auto; }
.th-range,   .td-range   { flex: 0 0 18%; }

/* 魔物列：左侧头像 + 右侧名称（对齐魔物收益页面） */
.td-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pet-avatar-wrapper {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 6px;
  background: var(--paper-light, rgba(255, 255, 255, 0.5));
  border: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
}
.pet-avatar-img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}
.cell-name {
  font-weight: 700;
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
/* 颜色压暗微调，避免过亮刺眼（对齐魔物收益页面的深沉典雅色调） */
.cell-name.quality-text-5 { color: #8e4f07 !important; }
.cell-name.quality-text-4 { color: #722c80 !important; }
.cell-name.quality-text-3 { color: #185c8e !important; }

/* 星级：对齐魔物收益页面品质文字色 */
.td-star {
  font-weight: 700;
}

/* 属性标签：沉稳典雅书卷色 */
.element-tag {
  font-weight: 700;
}
.element-tag.element-1 { color: #1c5b88 !important; } /* 水 */
.element-tag.element-2 { color: #9a2b20 !important; } /* 火 */
.element-tag.element-3 { color: #2e6938 !important; } /* 风 */
.element-tag.element-4 { color: #784c20 !important; } /* 地 */

/* 特性名称 */
.trait-name {
  font-weight: 600;
  color: var(--text-main);
}

/* 1 级 → 7 级数值列：纯数值小气泡，颜色沉稳古朴，多数值时一行一个清晰换行 */
.range-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.range-item {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-main, #3c2f21);
  background: rgba(62, 42, 20, 0.06);
  border: 1px solid var(--border-soft);
  padding: 1px 7px;
  border-radius: 4px;
  white-space: nowrap;
  line-height: 1.5;
}

/* 表格内的高亮数值（formatSkillDescription 产物） */
.pets-table-row :deep(.hl),
.pets-table-row :deep(em),
.pets-table-row :deep(strong) { font-style: normal; color: var(--accent-ink); font-weight: 700; }

/* 移动端窄屏适配：按用户要求隐藏星级、属性、特性名，仅保留魔物、特性效果与 1~7 级数值 */
@media (max-width: 768px) {
  .th-star, .td-star,
  .th-element, .td-element,
  .th-trait, .td-trait {
    display: none !important;
  }
  .th-name, .td-name {
    flex: 0 0 32% !important;
    gap: 6px !important;
    padding-right: 6px !important;
  }
  .th-effect, .td-effect {
    flex: 1 1 auto !important;
    padding-right: 8px !important;
    font-size: 12px;
  }
  .th-range, .td-range {
    flex: 0 0 26% !important;
  }
  .range-item {
    font-size: 11px;
    padding: 1px 5px;
  }
  .cell-name {
    font-size: 12px;
  }
  .pet-avatar-wrapper {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
  }
  .pet-avatar-img {
    width: 26px;
    height: 26px;
  }
}

.pets-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* ====== 筛选面板：继承 theme.css 全局 .filter-panel（padding 12px 14px，搜索框与其余图鉴页面一致） ====== */

/* ====== 魔物卡牌网格（大幅面 5 列精致展示） ====== */
.pets-card-grid :deep(.ui-card-grid) {
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.pets-card-grid :deep(.ui-item-card) {
  max-width: 140px;
  width: 100%;
}

.pets-card-grid :deep(.ui-item-card__slot) {
  max-width: 140px;
  width: 100%;
  background: transparent !important;
  box-shadow: none;
  border: none;
}

.pets-card-grid :deep(.ui-item-card__name) {
  width: calc(100% - 6px);
  margin-top: 4px;
  font-size: 12px;
  padding: 2.5px 4px;
}

.pet-card-art {
  position: relative;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
}

.pet-card-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  object-fit: cover;
}

.pet-card-frame {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
  pointer-events: none;
}

.pet-card-avatar {
  position: absolute;
  top: 10%;
  left: 15%;
  width: 70%;
  height: 70%;
  object-fit: contain;
  z-index: 1;
}

/* 可变异标记：贴在卡片左下角（与游戏内图鉴位置一致），压在边框之上 */
.pet-card-mutate {
  position: absolute;
  left: 8%;
  bottom: 10%;
  width: 20%;
  height: auto;
  z-index: 4;
  pointer-events: none;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
}

/* 列数与 `MonstersView` 保持同一套档位，两页视觉一致 */
@media (max-width: 1100px) {
  .pets-card-grid :deep(.ui-card-grid) {
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
  }
}

/* 平板竖屏：5 列会压到 108px 以下，退到 4 列 */
@media (max-width: 600px) {
  .pets-card-grid :deep(.ui-card-grid) {
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  /*
   * 手机端特性表格：窄屏下把非关键列（星级/属性）压到最小，
   * 空间让给「特性效果」和「1 级 → 7 级」两列，避免内容被裁。
   * 表头与行用同一组比例，仍然对齐。
   */
  .pets-th-row, .pets-table-row { font-size: 12px; padding-inline: 8px; }
  .pets-th, .pets-td { padding-right: 6px; }
  .th-name,   .td-name   { flex: 0 0 17%; }
  .th-star,   .td-star   { flex: 0 0 8%; }
  .th-element,.td-element{ flex: 0 0 8%; }
  .th-trait,  .td-trait  { flex: 0 0 15%; }
  .th-effect, .td-effect { flex: 1 1 auto; }
  .th-range,  .td-range  { flex: 0 0 24%; }
  .cell-mutate { width: 12px; height: 12px; }
}

@media (max-width: 480px) {
  .pets-card-grid :deep(.ui-card-grid) {
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
}

/* ====== 详情弹窗顶部立绘区 ====== */
.portrait-section {
  position: relative;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0 0 16px;
  box-sizing: border-box;
}

@media (max-width: 600px) {
  .portrait-section {
    padding: 12px 10px;
    margin-bottom: 12px;
  }
}

.pet-portraits-row {
  display: flex;
  gap: 24px;
  justify-content: center;
  width: 100%;
  max-width: 600px;
}

.portrait-section.has-variants-layout .pet-portraits-row {
  justify-content: space-between;
}

.pet-portrait-box {
  flex: 1;
  max-width: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(43, 31, 21, 0.05);
  border-radius: 8px;
  border: 1px dashed var(--border-soft);
  padding: 12px;
  position: relative;
}

.portrait-label-pos {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 5;
}

.pet-portrait-img {
  max-height: 180px;
  max-width: 100%;
  object-fit: contain;
  margin-top: 14px;
}

.pet-description-text {
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.7;
  margin: 14px 8px 4px;
  text-align: left;
  width: 100%;
}

/* 变异效果说明 */
.variant-effect-box {
  margin-top: 16px;
  background: rgba(126, 42, 168, 0.08);
  border: 1px solid rgba(126, 42, 168, 0.25);
  padding: 10px 16px;
  border-radius: 8px;
  width: 100%;
  max-width: 500px;
  text-align: center;
  font-size: 13px;
  line-height: 1.6;
}

/* 变异效果独占一行，左标签右内容 */
.variant-line {
  display: block;
}
.variant-line + .variant-line {
  margin-top: 6px;
}

.variant-effect-title {
  font-weight: bold;
  color: var(--q4);
  margin-right: 6px;
}

.variant-effect-txt {
  color: var(--text-main);
}

/* 右上角属性角标定位 */
.portrait-element-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: bold;
  z-index: 5;
}

.top-right-badge-icon {
  width: 20px;
  height: 20px;
}

/* 属性颜色（走主题色） */
.element-1 { color: var(--q3); }   /* 水 - 蓝 */
.element-2 { color: var(--danger); } /* 火 - 红 */
.element-3 { color: var(--q2); }   /* 风 - 绿 */
.element-4 { color: var(--q5); }   /* 地 - 棕 */

/* ====== 详情页签包装 ====== */
.detail-tabs-wrap {
  width: 100%;
  margin: 0 0 14px;
  box-sizing: border-box;
}

/* ====== 页签内容块（对齐角色图鉴，去除多余厚重大外框） ====== */
.tab-pane-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
  width: 100%;
  box-sizing: border-box;
}

/* ====== 技能选择网格（页特有卡组，对齐角色图鉴星阶选择） ====== */
.skills-select-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}

@media (max-width: 600px) {
  .skills-select-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
}

.skill-select-card {
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  border-radius: 8px;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--paper-soft);
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.skill-select-card:hover {
  background: var(--hover-bg, rgba(85, 117, 116, 0.14));
}

.skill-select-card.active {
  background: rgba(85, 117, 116, 0.16);
  border-color: var(--accent-ink, #2f4a49);
  box-shadow: 0 0 0 1px var(--accent-ink, #2f4a49);
}

.skill-select-icon {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  background: rgba(43, 31, 21, 0.10);
}

.skill-select-icon-wrap {
  position: relative;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
}

.trait-inner-avatar {
  position: absolute;
  top: 9%;
  left: 9%;
  width: 82%;
  height: 82%;
  border-radius: 50%;
  object-fit: cover;
}

.trait-frame-border {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.active-skill-sprite {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.skill-select-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  min-width: 0;
}

.sk-name {
  font-size: 12px;
  font-weight: bold;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ====== 技能详情卡（角色图鉴同款纯净面板，去除多余厚重外框） ====== */
.skill-desc-detail-card {
  flex: 1;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.35));
  border-radius: 4px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 600px) {
  .skill-desc-detail-card {
    padding: 8px;
  }
}

.sk-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border-bottom: 1px dashed var(--border-soft, rgba(143, 115, 81, 0.45));
  padding-bottom: 6px;
}

.sk-detail-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sk-detail-title {
  font-size: 15px;
  font-weight: bold;
  color: var(--text-main);
  letter-spacing: 0.5px;
}

/* ====== 角色图鉴同款技能等级滑块（拉等级，纯净无框） ====== */
.skill-level-slider-container {
  padding: 4px 2px 2px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill-slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.skill-slider-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
}

.skill-slider-status {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.skill-slider-current {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-ink, #557574);
}

.skill-slider-max {
  font-size: 12px;
  color: var(--text-muted, #6b5134);
}

.skill-slider-status .max-badge {
  margin-left: 2px;
}

.skill-des-box {
  padding: 8px 10px;
  background: rgba(43, 31, 21, 0.04);
  border: 1px solid var(--border-faint, rgba(143, 115, 81, 0.2));
  border-radius: 4px;
}

.skill-des-box .lvl-subname {
  font-size: 12.5px;
  font-weight: bold;
  color: var(--text-main);
  margin-bottom: 2px;
}

.skill-des-box .lvl-des-txt {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-main);
  margin: 0;
}

.skill-meta-tags {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* ====== 培育与突破分段标尺区 (对齐古典温润纸质风格) ====== */
.pet-upgrade-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(43, 31, 21, 0.04);
  border: 1px solid var(--border-faint, rgba(143, 115, 81, 0.22));
  border-radius: 4px;
  padding: 8px 10px;
}

.upgrade-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.upgrade-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}

.upgrade-section-hint {
  font-size: 11px;
  color: var(--text-muted, #6b5134);
}

/* 货运站同款阶梯标尺（清爽平整、沉稳自然、无刺眼高光） */
.pet-tier-spectrum {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--paper-soft, #f7f1e5);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.35));
  border-radius: 4px;
  padding: 8px 8px 6px;
}

.pet-tier-spectrum__labels,
.pet-tier-spectrum__bar,
.pet-tier-spectrum__values {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  align-items: center;
}

.pet-tier-spectrum--active .pet-tier-spectrum__labels,
.pet-tier-spectrum--active .pet-tier-spectrum__bar,
.pet-tier-spectrum--active .pet-tier-spectrum__values {
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

/* 主动技能 / 队伍被动：字号单独上调（特性页共用基类，故仅在此作用域内覆盖） */
.pet-tier-spectrum--active .pet-tier-spectrum__label {
  font-size: 12.5px;
  font-weight: 700;
}

.pet-tier-spectrum--active .pet-tier-spectrum__val {
  font-size: 12px;
  font-weight: 600;
}

.pet-tier-spectrum__label {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #6b5134);
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;
}

.pet-tier-spectrum__label:hover {
  color: var(--text-main);
}

.pet-tier-spectrum__label.is-active {
  color: var(--accent-ink, #2f4a49);
  font-weight: 700;
}

/* 小倒三角指针：指向当前激活段，清爽明确 */
.pet-tier-spectrum__arrow {
  position: absolute;
  top: -5px;
  width: 0;
  height: 0;
  border-left: 3.5px solid transparent;
  border-right: 3.5px solid transparent;
  border-top: 4px solid var(--accent, #557574);
}

.max-badge {
  font-size: 9px;
  background: var(--danger, #a83a2d);
  color: #fff;
  border-radius: 2px;
  padding: 0 3px;
  line-height: 1.2;
}

.stage-tag {
  font-size: 11px;
  color: var(--text-muted, #6b5134);
  font-weight: 600;
}

.pet-tier-spectrum__label.is-active .stage-tag {
  color: var(--accent-ink, #2f4a49);
  font-weight: 700;
}

/* 连续胶囊标尺条：高度 6px，首尾平整，杜绝任何突兀肥皂泡形变 */
.pet-tier-spectrum__segment {
  appearance: none;
  border: none;
  padding: 0;
  height: 6px;
  border-radius: 999px;
  background: rgba(143, 115, 81, 0.18);
  cursor: pointer;
  outline: none;
  transition: background 0.15s ease;
}

.pet-tier-spectrum__segment.is-reached {
  background: rgba(85, 117, 116, 0.45);
}

/* 激活段：优雅沉稳的湖泊暗青，无白色内边框，无刺眼外发光，平整紧凑 */
.pet-tier-spectrum__segment.is-active {
  background: var(--accent, #557574);
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.18);
}

.pet-tier-spectrum__val {
  font-size: 10px;
  text-align: center;
  color: var(--text-muted, #6b5134);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.pet-tier-spectrum__val:hover {
  color: var(--text-main);
}

.pet-tier-spectrum__val.is-active {
  color: var(--accent-ink, #2f4a49);
  font-weight: 700;
}

/* 阶梯简要预览 */
.tier-summary-card {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-main);
}

.tier-summary-card .summary-label {
  color: var(--text-muted, #6b5134);
}

.tier-summary-card .summary-val.highlight {
  color: var(--accent-ink, #2f4a49);
  font-weight: 700;
}

.tier-summary-card .summary-sub strong {
  color: var(--gold, #8a6a1f);
}

/* 主动 / 被动变体：正文上调（特性页共用基类，故仅作用于此变体） */
.tier-summary-card--active {
  font-size: 13px;
  font-weight: 600;
}

/* 魔物 6 阶突破路线图 */
.breakthrough-roadmap-box {
  margin-top: 2px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px dashed rgba(143, 115, 81, 0.35);
  padding-top: 8px;
}

.roadmap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.roadmap-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}

.roadmap-tip {
  font-size: 10.5px;
  color: var(--text-muted, #6b5134);
}

.roadmap-steps-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.roadmap-step-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 3px;
  background: var(--paper-soft, #f7f1e5);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.4));
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  text-align: center;
}

.roadmap-step-pill:hover {
  border-color: var(--accent, #557574);
}

.roadmap-step-pill.is-current-skill {
  border-color: rgba(85, 117, 116, 0.5);
  background: rgba(85, 117, 116, 0.08);
}

.roadmap-step-pill.is-selected-step {
  border-color: var(--accent, #557574);
  background: rgba(85, 117, 116, 0.16);
  box-shadow: 0 0 0 1px var(--accent, #557574);
}

.step-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 2px;
  background: rgba(43, 31, 21, 0.08);
  color: var(--text-main);
}

.roadmap-step-pill.is-current-skill .step-badge {
  background: var(--accent, #557574);
  color: #fff;
}

.step-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
}

.step-skill-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.step-target-lvl {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-ink, #2f4a49);
}

.step-cost {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #6b5134);
}

@media (max-width: 600px) {
  .roadmap-steps-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  /* 主动 / 被动：手机端字号再上调一档，4 列布局保持不变（收窄间距腾出空间） */
  .pet-tier-spectrum--active .pet-tier-spectrum__labels,
  .pet-tier-spectrum--active .pet-tier-spectrum__bar,
  .pet-tier-spectrum--active .pet-tier-spectrum__values {
    gap: 4px;
  }

  .pet-tier-spectrum--active .pet-tier-spectrum__label {
    font-size: 13.5px;
  }

  .pet-tier-spectrum--active .pet-tier-spectrum__val {
    font-size: 13px;
  }

  .stage-tag {
    font-size: 11.5px;
  }

  .tier-summary-card--active {
    font-size: 13.5px;
  }

  .step-badge {
    font-size: 11.5px;
  }

  .step-skill-name {
    font-size: 11.5px;
  }

  .step-target-lvl {
    font-size: 13px;
  }

  .step-cost {
    font-size: 12px;
  }

  .star-limits-box--active .limit-list {
    font-size: 13px;
  }
}

/* 底部总览 (角色图鉴同款 star-limits-box) */
.star-limits-box {
  background: rgba(138, 106, 31, 0.06);
  border: 1px dashed var(--border-soft, rgba(143, 115, 81, 0.4));
  border-radius: 4px;
  padding: 8px 10px;
  margin-top: 2px;
}

.star-limits-box .limit-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--gold, #8a6a1f);
  margin-bottom: 2px;
}

.star-limits-box .limit-list {
  margin: 0;
  padding-left: 16px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-muted, #6b5134);
}

.star-limits-box .limit-list li {
  margin-bottom: 2px;
}

.star-limits-box .limit-num {
  font-weight: 700;
  color: var(--gold, #8a6a1f);
}

/* 主动 / 被动变体：正文上调（特性页共用基类，故仅作用于此变体） */
.star-limits-box--active .limit-list {
  font-size: 12.5px;
  font-weight: 600;
}

/* ====== 属性/成长区 ====== */
.stats-growth-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 成长等级徽章（C/B/A/S，对应品质色） */
.rank-badge,
.growth-rank-badge {
  font-size: 11px;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 4px;
  color: #fdf6e3;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.rank-badge {
  width: 45px;
  flex-shrink: 0;
}

.growth-rank-badge {
  width: 20px;
  height: 20px;
  padding: 0;
}

.rank-badge.rank-c, .growth-rank-badge.rank-c { background: var(--q2); }
.rank-badge.rank-b, .growth-rank-badge.rank-b { background: var(--q3); }
.rank-badge.rank-a, .growth-rank-badge.rank-a { background: var(--q4); }
.rank-badge.rank-s, .growth-rank-badge.rank-s { background: var(--q5); }

.pet-level-growth-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 12px;
}

/* 等级模拟输出网格 */
.pet-base-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 10px;
}

@media (max-width: 520px) {
  .pet-level-growth-summary {
    justify-content: flex-start;
  }
}

.pet-attr-cell {
  background: var(--paper-soft);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-faint);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  line-height: 1.6;
  min-width: 0;
}

.pet-attr-cell .attr-label {
  color: var(--text-muted);
  font-weight: 600;
}

.pet-attr-cell .attr-val {
  color: var(--text-main);
  font-weight: bold;
}

.attr-val-badge-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ====== 成长系数输入行 ====== */
.stats-inputs-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stat-input-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.stat-meta .name {
  font-weight: bold;
  color: var(--text-main);
}

.stat-meta .range {
  color: var(--text-muted);
}

.slider-container-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-container-row .range-slider-m {
  flex: 1;
}

.slider-container-row .current-val {
  font-size: 13px;
  font-weight: bold;
  color: var(--text-main);
  width: 45px;
  text-align: right;
  flex-shrink: 0;
}

/* ====== 滑块（页特有控件） ====== */
.level-slider-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px 13px;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.slider-title {
  color: var(--text-muted);
}

.slider-value {
  font-weight: bold;
  color: var(--accent-ink);
}

.calc-range-slider,
.range-slider-m {
  width: 100%;
  cursor: pointer;
  accent-color: var(--accent-bright, #7a9a99);
  height: 6px;
  touch-action: pan-y;
}

/* ====== 经验换算 ====== */
.exp-cost-box {
  background: var(--paper-solid);
  border: 1px solid var(--border-soft);
  padding: 10px 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.exp-summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-main);
}

.highlight-accent {
  color: var(--accent-ink);
  font-weight: bold;
}

.exp-slime-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.slime-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  padding: 2px 8px;
  border-radius: 12px;
}

.mini-slime-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

/* 属性图标（其他属性中的钱币/经验图标） */
.inline-icon-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: bold;
  color: var(--text-main);
}

.mini-attr-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
}
</style>
