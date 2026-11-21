<template>
  <section class="dc-wrap">
    <UiEmptyState v-if="loading" type="loading" text="正在加载伤害计算器精简数据..." />
    <UiEmptyState v-else-if="errorMessage" type="error" :text="errorMessage" @retry="loadData" />

    <template v-else-if="selectedHero">
      <!-- 1. 角色与技能选择卡片 -->
      <div class="dc-panel paper-panel">
        <div class="dc-hero-bar">
          <div class="dc-hero-summary">
            <img
              :src="heroPortrait(selectedHero)"
              :alt="selectedHero.name"
              class="dc-hero-avatar"
              @error="onImgError"
            />
            <div class="dc-hero-info">
              <div class="dc-hero-title-row">
                <h3 class="dc-hero-name">{{ selectedHero.name }}</h3>
                <UiTag :quality="selectedHero.rare">{{ selectedHero.rare }}星</UiTag>
                <UiTag>{{ selectedHero.jobName }}</UiTag>
                <UiTag tone="accent">{{ selectedHero.elementName }}</UiTag>
              </div>
              <div class="dc-hero-meta">
                默认攻击浮动：<strong>{{ Math.round(selectedHero.floatMin * 100) }}% ~ {{ Math.round(selectedHero.floatMax * 100) }}%</strong>
                · 基础暴伤：<strong>{{ selectedHero.baseCritDam }}%</strong>
              </div>
            </div>
          </div>

          <div class="dc-hero-actions">
            <UiButton size="sm" @click="heroPickerOpen = true">切换角色</UiButton>
            <UiButton size="sm" variant="ghost" @click="resetInputs">重置面板</UiButton>
          </div>
        </div>

        <!-- 技能与被动天赋列表 -->
        <div v-if="heroAbilities.length" class="dc-skills-strip">
          <button
            v-for="(sk, idx) in heroAbilities"
            :key="`${sk.isTalent ? 'talent' : 'skill'}-${sk.id}`"
            type="button"
            class="dc-skill-btn"
            :class="{ 'is-active': selectedSkillIndex === idx, 'is-talent': sk.isTalent }"
            @click="selectSkill(idx)"
          >
            <img
              v-if="sk.icon && sk.type !== 'normal'"
              :src="skillIconUrl(sk.icon)"
              :alt="sk.name"
              class="dc-skill-icon"
              @error="onImgError"
            />
            <div class="dc-skill-copy">
              <div class="dc-skill-name-row">
                <span class="dc-skill-name">{{ sk.name }}</span>
                <span class="dc-skill-badge" :class="{ 'is-talent': sk.isTalent }">{{ sk.formLabel }}</span>
                <span v-if="sk.crit === 'yes'" class="dc-skill-crit-badge">可暴击</span>
              </div>
              <div class="dc-skill-sub">
                {{ sk.segments.length ? `${sk.segments.length} 段命中` : (sk.isTalent ? '机制/增益被动' : '非直伤/效果技能') }}
                <template v-if="sk.reviewStatus !== 'verified'"> · 表推导</template>
              </div>
            </div>
          </button>
        </div>

        <!-- 当前技能等级与描述 -->
        <div v-if="selectedSkill" class="dc-skill-detail-box">
          <div class="dc-skill-lv-row">
            <label class="dc-lv-label">
              技能等级：<strong>Lv.{{ selectedSkillLevelIndex + 1 }}</strong> / {{ selectedSkill.maxLevel || 1 }}
            </label>
            <input
              v-if="(selectedSkill.levels?.length || 1) > 1"
              v-model.number="selectedSkillLevelIndex"
              type="range"
              class="dc-slider"
              :min="0"
              :max="Math.max(0, (selectedSkill.levels?.length || 1) - 1)"
            />
          </div>
          <p class="dc-skill-desc" v-html="formatSkillDes(currentLevelData?.des)"></p>
          <div v-if="skillCaveatMessage" class="dc-caveat-bar">
            {{ skillCaveatMessage }}
          </div>
        </div>

        <!-- 当前角色星阶技能（命座） -->
        <div v-if="selectedHero.starSkills?.length" class="dc-stars-box">
          <div class="dc-stars-head">
            <div class="dc-effects-head-title">
              <span class="dc-stars-title">星阶技能（命座）</span>
              <span v-if="starEffects.activeCount" class="dc-effect-count-badge">
                已激活 {{ starEffects.activeCount }}/{{ selectedHero.starSkills.length }}
              </span>
            </div>
            <div class="dc-target-actions">
              <button type="button" class="dc-mini-btn" @click="maxAllStars">全部满星</button>
              <button
                v-if="starEffects.activeCount"
                type="button"
                class="dc-mini-btn"
                @click="resetStars"
              >清空星阶</button>
            </div>
          </div>

          <div class="dc-stars-grid">
            <div
              v-for="st in selectedHero.starSkills"
              :key="st.id"
              class="dc-star-card"
              :class="{
                'is-active': (starSelection.starLevels[st.id] || 0) > 0,
                'is-dim': st.effectKind !== 'combat' || !isStarCurrentlyApplicable(st),
              }"
            >
              <button
                type="button"
                class="dc-star-main"
                :title="currentStarEntry(st)?.des || st.label"
                @click="toggleStarSkill(st)"
              >
                <img
                  v-if="st.icon"
                  :src="skillIconUrl(st.icon)"
                  :alt="st.name"
                  class="dc-star-icon"
                  @error="onImgError"
                />
                <div class="dc-star-copy">
                  <div class="dc-star-name-row">
                    <span class="dc-star-slot">{{ st.slot }}星</span>
                    <span class="dc-star-name">{{ st.name }}</span>
                  </div>
                  <div class="dc-star-badge">
                    <template v-if="st.effectKind === 'combat'">
                      {{ currentStarEntry(st)?.badge || st.label }}
                    </template>
                    <template v-else-if="st.effectKind === 'panelStatic'">
                      面板已含（不重复叠加）
                    </template>
                    <template v-else>
                      机制/生存向（不影响直伤）
                    </template>
                  </div>
                </div>
              </button>
              <div
                v-if="(starSelection.starLevels[st.id] || 0) > 0 && (st.maxLevel > 1 || st.maxStacks > 1)"
                class="dc-star-controls"
              >
                <label v-if="st.maxLevel > 1" class="dc-star-ctl">
                  <span>等级</span>
                  <select v-model.number="starSelection.starLevels[st.id]" class="dc-star-select">
                    <option v-for="lv in st.maxLevel" :key="lv" :value="lv">Lv.{{ lv }}</option>
                  </select>
                </label>
                <label v-if="st.maxStacks > 1" class="dc-star-ctl">
                  <span>{{ st.stackLabel || '层数' }}</span>
                  <input
                    v-model.number="starSelection.starStacks[st.id]"
                    type="number"
                    min="1"
                    :max="starMaxStacks(st)"
                    class="dc-chip-stack-input"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. 实时计算结果与八步拆解（置顶紧随技能选择，改面板时同屏可见跳字） -->
      <div class="dc-panel paper-panel dc-result-card">
        <div class="dc-card-head">
          <h4 class="dc-card-title">结算伤害结果</h4>
          <span class="dc-crit-summary">
            有效暴击率：<strong>{{ Math.round(calcResult.critChance * 1000) / 10 }}%</strong>
            <template v-if="!calcResult.allowCrit">（当前技能默认不可暴击）</template>
          </span>
        </div>

        <div v-if="hasDamageSegments" class="dc-result-grid">
          <div class="dc-metric-box">
            <div class="dc-metric-label">不暴击伤害</div>
            <div class="dc-metric-val">{{ formatNumber(calcResult.noCrit.mid) }}</div>
            <div v-if="calcResult.needFloat" class="dc-metric-range">
              区间：{{ formatNumber(calcResult.noCrit.min) }} ~ {{ formatNumber(calcResult.noCrit.max) }}
            </div>
            <div v-else class="dc-metric-range">无浮动（F = 1.0）</div>
          </div>

          <div class="dc-metric-box" :class="{ 'is-muted': calcResult.critChance <= 0 }">
            <div class="dc-metric-label">暴击伤害</div>
            <div class="dc-metric-val dc-metric-val--crit">
              {{ calcResult.allowCrit || effectiveRealCrit ? formatNumber(calcResult.crit.mid) : '—' }}
            </div>
            <div v-if="(calcResult.allowCrit || effectiveRealCrit) && calcResult.needFloat" class="dc-metric-range">
              区间：{{ formatNumber(calcResult.crit.min) }} ~ {{ formatNumber(calcResult.crit.max) }}
            </div>
            <div v-else class="dc-metric-range">
              {{ calcResult.allowCrit || effectiveRealCrit ? `暴伤倍率 ×${((atk.critDam + activeEffects.critDam + starEffects.critDam) / 100).toFixed(2)}` : '未启用暴击' }}
            </div>
          </div>

          <div class="dc-metric-box dc-metric-box--accent">
            <div class="dc-metric-label">综合期望伤害</div>
            <div class="dc-metric-val dc-metric-val--exp">{{ formatNumber(calcResult.expected) }}</div>
            <div class="dc-metric-range">
              按净暴击率 {{ Math.round(calcResult.critChance * 1000) / 10 }}% 加权
            </div>
          </div>
        </div>
        <UiEmptyState
          v-else
          :text="selectedSkill?.isTalent
            ? '该角色被动属于机制/增益/触发型被动（无直接一段式命中倍率），可参考上方说明并填入左侧面板参数参与结算。'
            : '该技能为治疗/增益/召唤等非直接伤害技能，暂无直伤段数值。'"
        />

        <!-- 多段拆解 -->
        <div v-if="calcResult.segments.length > 1" class="dc-segments-wrap">
          <div class="dc-sub-title">分段明细（共 {{ calcResult.segments.length }} 段）</div>
          <div class="dc-segments-list">
            <div v-for="(seg, sIdx) in calcResult.segments" :key="sIdx" class="dc-seg-row">
              <span class="dc-seg-idx">第 {{ sIdx + 1 }} 段</span>
              <span class="dc-seg-tag">
                {{ seg.damageType === 'magicAtk' ? '魔法' : '物理' }}
                <template v-if="seg.elementType !== 'none'">· {{ ELEMENT_LABELS[seg.elementType] }}</template>
                · ×{{ Math.round(seg.multiplier * 1000) / 10 }}%
                <template v-if="seg.baseDamage > 0"> + {{ seg.baseDamage }}</template>
              </span>
              <span class="dc-seg-nums">
                未暴 <strong>{{ formatNumber(seg.noCrit.mid) }}</strong>
                <template v-if="calcResult.allowCrit || effectiveRealCrit">
                  / 暴击 <strong>{{ formatNumber(seg.crit.mid) }}</strong>
                </template>
                / 期望 <strong>{{ formatNumber(seg.expected) }}</strong>
              </span>
            </div>
          </div>
        </div>

        <!-- 八步白盒过程 -->
        <div v-if="firstSegmentSteps" class="dc-steps-wrap">
          <button type="button" class="dc-collapse-btn" @click="showSteps = !showSteps">
            <span>{{ showSteps ? '收起计算过程 ▲' : '展开计算过程 ▼' }}</span>
          </button>
          <div v-if="showSteps" class="dc-steps-grid">
            <div class="dc-step-item">
              <span>1. 基础伤害 X</span>
              <strong>{{ round2(firstSegmentSteps.X) }}</strong>
              <small>属性 {{ round2(firstSegmentSteps.scalingStat) }} × 倍率 + 基值</small>
            </div>
            <div class="dc-step-item">
              <span>2. 第一增减伤区 X₁</span>
              <strong>{{ round2(firstSegmentSteps.X1) }}</strong>
              <small>弱点同区加减 · ×{{ firstSegmentSteps.zone1Mult.toFixed(3) }}</small>
            </div>
            <div class="dc-step-item">
              <span>3. 双曲线防御 X₂</span>
              <strong>{{ round2(firstSegmentSteps.X2) }}</strong>
              <small>K={{ round2(firstSegmentSteps.K) }} · 承伤比 ×{{ firstSegmentSteps.defMult.toFixed(4) }}</small>
            </div>
            <div class="dc-step-item">
              <span>4. 暴击乘区 X₃</span>
              <strong>{{ round2(calcResult.allowCrit || effectiveRealCrit ? firstSegmentSteps.X3Crit : firstSegmentSteps.X3NoCrit) }}</strong>
              <small>暴击倍率 ×{{ firstSegmentSteps.critMult.toFixed(2) }}</small>
            </div>
            <div class="dc-step-item">
              <span>5. 浮动与首次截断 D₀</span>
              <strong>{{ firstSegmentSteps.D0NoCrit }} / {{ firstSegmentSteps.D0Crit }}</strong>
              <small>F = {{ firstSegmentSteps.floatMin }}~{{ firstSegmentSteps.floatMax }}</small>
            </div>
            <div class="dc-step-item">
              <span>6. 动态独立增伤区（二区）</span>
              <strong>×{{ firstSegmentSteps.dynMult.toFixed(3) }}</strong>
              <small>附魔/易伤/技能/元素独立连乘</small>
            </div>
            <div class="dc-step-item">
              <span>7. 等级压制与二区抗性</span>
              <strong>×{{ firstSegmentSteps.lateMult.toFixed(4) }}</strong>
              <small>等级压制 ×{{ firstSegmentSteps.levelMult.toFixed(4) }}</small>
            </div>
            <div class="dc-step-item">
              <span>8. 终伤取整 D</span>
              <strong>{{ calcResult.segments[0].noCrit.mid }} / {{ calcResult.segments[0].crit.mid }}</strong>
              <small>遗器技能 ×{{ firstSegmentSteps.spRelicMult.toFixed(2) }} · 保底 1</small>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. 手动输入面板（左：攻击方角色面板；右：受击目标木桩/怪物） -->
      <div class="dc-columns">
        <!-- 攻击方面板 -->
        <div class="dc-panel paper-panel dc-form-card">
          <div class="dc-card-head">
            <h4 class="dc-card-title">攻击方 · 角色面板（手动填写）</h4>
            <span class="dc-card-tip">上方 6 项直接照抄游戏内角色面板</span>
          </div>

          <div class="dc-field-grid">
            <label class="dc-field">
              <span>角色等级</span>
              <input v-model.number="atk.level" type="number" min="1" max="120" class="dc-input" />
            </label>
            <label class="dc-field">
              <span>物理攻击</span>
              <input v-model.number="atk.phyAtk" type="number" min="0" class="dc-input" />
            </label>
            <label class="dc-field">
              <span>魔法攻击</span>
              <input v-model.number="atk.magicAtk" type="number" min="0" class="dc-input" />
            </label>
            <label class="dc-field">
              <span>暴击率 (%)</span>
              <input v-model.number="atk.crit" type="number" step="0.1" class="dc-input" />
            </label>
            <label class="dc-field">
              <span>暴击伤害 (%)</span>
              <input v-model.number="atk.critDam" type="number" step="1" class="dc-input" />
            </label>
            <label class="dc-field">
              <span>{{ activeDamageType === 'magicAtk' ? '魔法穿透 (%)' : '物理穿透 (%)' }}</span>
              <input
                v-if="activeDamageType === 'magicAtk'"
                v-model.number="atk.magicAtkPenPct"
                type="number"
                step="0.5"
                max="100"
                class="dc-input"
              />
              <input
                v-else
                v-model.number="atk.phyAtkPenPct"
                type="number"
                step="0.5"
                max="100"
                class="dc-input"
              />
            </label>
          </div>

          <div class="dc-subfield-head">
            <span class="dc-subfield-title">战斗额外增伤（二区独立乘区）</span>
            <span class="dc-card-tip">填面板不显示的附魔石 / 圣遗物 / Buff，勿与星阶及下方已选特效重复</span>
          </div>

          <div class="dc-field-grid">
            <label
              class="dc-field"
              :title="activeDamageType === 'magicAtk'
                ? '对应游戏内：魔法伤害提高 / 魔法伤害（套装、随机词条、Buff 等，独立乘区）'
                : '对应游戏内：物理伤害提高 / 物理伤害（套装、随机词条、Buff 等，独立乘区）'"
            >
              <span>{{ activeDamageType === 'magicAtk' ? '魔法增伤 (%)' : '物理增伤 (%)' }}</span>
              <input
                v-if="activeDamageType === 'magicAtk'"
                v-model.number="atk.unitMagicDamAddPct"
                type="number"
                step="0.5"
                class="dc-input"
              />
              <input
                v-else
                v-model.number="atk.unitPhyDamAddPct"
                type="number"
                step="0.5"
                class="dc-input"
              />
            </label>
            <label
              class="dc-field"
              :class="{ 'is-inactive': selectedSkill?.form !== 'skill' }"
              title="对应游戏内：技能伤害 / 技能伤害提高（套装、装备词条等；法盘遗器的技能增伤请填到下方「遗器技能增伤」）"
            >
              <span>技能增伤 (%)<template v-if="selectedSkill?.form !== 'skill'"> · 未生效</template></span>
              <input
                v-model.number="atk.unitSkillDamAddPct"
                type="number"
                step="0.5"
                class="dc-input"
              />
            </label>
            <label
              class="dc-field"
              :class="{ 'is-inactive': selectedSkill?.form !== 'normalAtk' }"
              title="对应游戏内：普通攻击伤害加成 / 普攻伤害提高"
            >
              <span>普攻增伤 (%)<template v-if="selectedSkill?.form !== 'normalAtk'"> · 未生效</template></span>
              <input
                v-model.number="atk.unitNormalDamAddPct"
                type="number"
                step="0.5"
                class="dc-input"
              />
            </label>
            <label
              v-if="primaryElement !== 'none'"
              class="dc-field"
              :title="`对应游戏内：${ELEMENT_LABELS[primaryElement]}属性伤害提高（附魔石/法盘遗器/未收录 Buff，不含技能自身倍率）`"
            >
              <span>{{ ELEMENT_LABELS[primaryElement] }}属性增伤 (%)</span>
              <input
                v-model.number="atk.unitElemDamAddPct[primaryElement]"
                type="number"
                step="0.5"
                class="dc-input"
              />
            </label>
          </div>

          <button type="button" class="dc-collapse-btn" @click="showAdvancedAtk = !showAdvancedAtk">
            <span>{{ showAdvancedAtk ? '收起高级乘区与特判开关 ▲' : '展开高级乘区与特判开关 ▼' }}</span>
          </button>

          <div v-if="showAdvancedAtk" class="dc-advanced-box">
            <div class="dc-switches-row">
              <label class="dc-check">
                <input v-model="allowCritOverride" type="checkbox" />
                <span>允许暴击（默认跟随技能配置）</span>
              </label>
              <label class="dc-check">
                <input v-model="needFloatOverride" type="checkbox" />
                <span>开启攻击浮动 ({{ Math.round(selectedHero.floatMin * 100) }}%~{{ Math.round(selectedHero.floatMax * 100) }}%)</span>
              </label>
              <label class="dc-check">
                <input v-model="atk.realCrit" type="checkbox" />
                <span>强制暴击 (realCrit)</span>
              </label>
              <label class="dc-check">
                <input v-model="atk.realDam" type="checkbox" />
                <span>跳过防御 (realDam)</span>
              </label>
            </div>
            <div class="dc-field-grid">
              <label class="dc-field">
                <span>通用输出增伤（二区） (%)</span>
                <input v-model.number="atk.unitAtkDamAddPct" type="number" step="0.5" class="dc-input" />
              </label>
              <label class="dc-field">
                <span>普攻/技能无视防御 (%)</span>
                <input v-model.number="atk.ignoreDefPct" type="number" step="0.5" max="100" class="dc-input" />
              </label>
              <label class="dc-field">
                <span>遗器技能增伤（最末乘区） (%)</span>
                <input v-model.number="atk.spRelicSkillDmgAddPct" type="number" step="0.5" class="dc-input" />
              </label>
              <label class="dc-field">
                <span>额外事件独立倍率</span>
                <input v-model.number="atk.extraEventMult" type="number" step="0.05" min="0.01" class="dc-input" />
              </label>
              <label
                class="dc-field"
                title="damAddTypes + damKeyTypes（极少出现；与怪物弱点同一括号先加减再乘）"
              >
                <span>前置一区增伤（弱点同区加减） (%)</span>
                <input v-model.number="atk.damAddZone1Pct" type="number" step="0.5" class="dc-input" />
              </label>
              <label v-if="usesMaxHpScaling" class="dc-field">
                <span>自身最大生命</span>
                <input v-model.number="atk.maxHp" type="number" min="0" class="dc-input" />
              </label>
            </div>
          </div>
        </div>

        <!-- 受击目标面板 -->
        <div class="dc-panel paper-panel dc-form-card">
          <div class="dc-card-head">
            <h4 class="dc-card-title">受击目标 · 木桩 / 怪物预设</h4>
            <div class="dc-target-actions">
              <button
                type="button"
                class="dc-mini-btn"
                :class="{ 'is-active': !selectedMonster }"
                @click="useDummyTarget"
              >0防木桩</button>
              <button
                type="button"
                class="dc-mini-btn"
                :class="{ 'is-active': Boolean(selectedMonster) }"
                @click="monsterPickerOpen = true"
              >{{ selectedMonster ? selectedMonster.name : '选择游戏怪物' }}</button>
            </div>
          </div>

          <div v-if="selectedMonster" class="dc-monster-preset-bar">
            <img
              v-if="selectedMonster.icon"
              :src="monsterIconUrl(selectedMonster.icon)"
              :alt="selectedMonster.name"
              class="dc-mon-avatar"
              @error="onImgError"
            />
            <div class="dc-mon-preset-controls">
              <div class="dc-mon-preset-row">
                <span>套用等级：<strong>Lv.{{ presetMonLevel }}</strong></span>
                <input
                  :value="presetMonLevel"
                  type="range"
                  min="1"
                  :max="maxPresetLevel"
                  class="dc-slider"
                  @input="onPresetLevelInput"
                />
              </div>
              <div class="dc-mon-preset-note">
                双防按「基础 × 等级强度系数」计算（实机关卡修正仅影响怪物攻击与生命）
              </div>
            </div>
          </div>

          <div class="dc-field-grid">
            <label class="dc-field">
              <span>{{ selectedMonster ? '目标等级（同步预设防御）' : '目标等级' }}</span>
              <input v-model.number="tgt.level" type="number" min="1" max="150" class="dc-input" />
            </label>
            <label class="dc-field">
              <span>物理防御</span>
              <input v-model.number="tgt.phyDef" type="number" min="-1000" step="any" class="dc-input" />
            </label>
            <label class="dc-field">
              <span>魔法防御</span>
              <input v-model.number="tgt.magicDef" type="number" min="-1000" step="any" class="dc-input" />
            </label>
            <label class="dc-field">
              <span>暴击抗性 (%)</span>
              <input v-model.number="tgt.critRes" type="number" step="0.5" class="dc-input" />
            </label>
            <label class="dc-field">
              <span>元素弱点 / 抗性（一区 · 负为弱点） (%)</span>
              <input
                v-model.number="tgt.damResElementPct"
                type="number"
                step="5"
                title="怪物先天元素抗性或弱点，选游戏怪物自动带入；负数代表弱点（如火弱 -20% 填 -20）"
                class="dc-input"
              />
            </label>
            <label class="dc-field">
              <span>受击易伤 / 减伤（二区 · 正增负减） (%)</span>
              <input
                v-model.number="tgt.unitDamageAddPct"
                type="number"
                step="1"
                title="战斗内挂给目标的易伤或减伤 Buff；正数为易伤增伤，负数为减伤"
                class="dc-input"
              />
            </label>
          </div>

          <button type="button" class="dc-collapse-btn" @click="showAdvancedTgt = !showAdvancedTgt">
            <span>{{ showAdvancedTgt ? '收起目标高级抗性 ▲' : '展开目标高级抗性（先天一区 / 战斗二区）▼' }}</span>
          </button>

          <div v-if="showAdvancedTgt" class="dc-advanced-box">
            <div class="dc-field-grid">
              <label class="dc-field">
                <span>先天物理/魔法抗（一区） (%)</span>
                <input v-model.number="tgt.damResTypePct" type="number" step="5" class="dc-input" />
              </label>
              <label class="dc-field">
                <span>受击技能易伤（二区） (%)</span>
                <input v-model.number="tgt.unitBeHitSkillDamAddPct" type="number" step="1" class="dc-input" />
              </label>
              <label class="dc-field">
                <span>战斗物理/魔法抗（二区 · 上限100%） (%)</span>
                <input v-model.number="tgt.unitTypeResPct" type="number" step="5" max="100" class="dc-input" />
              </label>
              <label class="dc-field">
                <span>战斗元素抗性（二区 · 上限100%） (%)</span>
                <input v-model.number="tgt.unitElemResPct" type="number" step="5" max="100" class="dc-input" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. 魔物特性与装备 / 套装战斗特效（自动合并至对应公式乘区） -->
      <div class="dc-panel paper-panel dc-effects-card">
        <div class="dc-card-head">
          <div class="dc-effects-head-title">
            <h4 class="dc-card-title">战斗特效 · 魔物特性与装备 / 套装</h4>
            <span v-if="activeEffects.activeItems.length" class="dc-effect-count-badge">
              已启用 {{ activeEffects.activeItems.length }} 项
            </span>
          </div>
          <div class="dc-target-actions">
            <button
              v-if="hasAnyEffectSelected"
              type="button"
              class="dc-mini-btn"
              @click="resetEffects"
            >清空特效</button>
            <button
              type="button"
              class="dc-mini-btn"
              :class="{ 'is-active': showEffectsPanel }"
              @click="showEffectsPanel = !showEffectsPanel"
            >{{ showEffectsPanel ? '收起配置' : '展开配置' }}</button>
          </div>
        </div>

        <div v-if="effectSummaryChips.length" class="dc-effect-summary-bar">
          <span class="dc-effect-summary-label">生效增益汇总：</span>
          <span v-for="chip in effectSummaryChips" :key="chip" class="dc-effect-summary-chip">{{ chip }}</span>
        </div>

        <div v-if="showEffectsPanel" class="dc-effects-body">
          <!-- ① 出战魔物特性 -->
          <div class="dc-effect-group">
            <div class="dc-effect-group-head">
              <span class="dc-effect-group-title">出战魔物特性（22 种影响伤害结算）</span>
              <span class="dc-effect-group-tip">仅计入战斗内触发/光环，与手填面板不重复；勾选后随星级自动切换倍率</span>
            </div>
            <div class="dc-pet-slot-row">
              <div v-if="selectedPet" class="dc-pet-active-card">
                <img
                  v-if="selectedPet.icon"
                  :src="monsterIconUrl(selectedPet.icon)"
                  :alt="selectedPet.name"
                  class="dc-pet-avatar"
                  @error="onImgError"
                />
                <div class="dc-pet-active-info">
                  <div class="dc-pet-active-top">
                    <strong>{{ selectedPet.name }}</strong>
                    <span class="dc-skill-badge">{{ selectedPet.traitName }}</span>
                    <span v-if="!isPetApplicable" class="dc-inactive-tag">当前技能未触发</span>
                  </div>
                  <div class="dc-pet-active-desc">{{ currentPetLevelEntry?.des }}</div>
                  <div v-if="selectedPet.note" class="dc-pet-active-note">{{ selectedPet.note }}</div>
                </div>
                <div class="dc-pet-active-controls">
                  <label class="dc-inline-ctl">
                    <span>特性等级</span>
                    <select v-model.number="effectState.petLevel" class="dc-mini-select">
                      <option v-for="lv in selectedPet.levels" :key="lv.level" :value="lv.level">
                        Lv.{{ lv.level }}
                      </option>
                    </select>
                  </label>
                  <label v-if="selectedPet.maxStacks > 1" class="dc-inline-ctl">
                    <span>{{ selectedPet.stackLabel || '层数' }}</span>
                    <input
                      v-model.number="effectState.petStacks"
                      type="number"
                      min="1"
                      :max="selectedPet.maxStacks"
                      class="dc-mini-num"
                    />
                  </label>
                  <label v-if="selectedPet.synergyLabel" class="dc-check dc-synergy-check">
                    <input v-model="effectState.petSynergy" type="checkbox" />
                    <span>{{ selectedPet.synergyLabel }}</span>
                  </label>
                  <UiButton size="sm" @click="petPickerOpen = true">更换魔物</UiButton>
                  <UiButton size="sm" variant="ghost" @click="clearPetEffect">移除</UiButton>
                </div>
              </div>
              <div v-else class="dc-pet-empty-row">
                <UiButton size="sm" @click="petPickerOpen = true">选择出战魔物特性</UiButton>
                <span class="dc-effect-group-tip">支持 Lv.1~Lv.7 星级档位、灼热/硬壳/队伍属性人数叠层与双蕈联动</span>
              </div>
            </div>
          </div>

          <!-- ② 套装战斗特效 -->
          <div class="dc-effect-group">
            <div class="dc-effect-group-head">
              <span class="dc-effect-group-title">套装战斗特效（仅含进图触发项，不重复面板白字）</span>
            </div>
            <div class="dc-effect-chips-grid">
              <div
                v-for="s in effectsCatalog.suits"
                :key="s.id"
                class="dc-effect-chip-wrap"
                :class="{
                  'is-active': effectState.suitIds.includes(s.id),
                  'is-dim': !isItemApplicable(s),
                }"
              >
                <button
                  type="button"
                  class="dc-effect-chip-btn"
                  :title="`${s.des}${!isItemApplicable(s) ? '（当前技能形态/元素不满足触发条件）' : ''}`"
                  @click="toggleEffectId('suitIds', s.id, s)"
                >
                  <span class="dc-effect-chip-name">{{ s.name }}</span>
                  <span class="dc-effect-chip-val">{{ s.effectLabel }}</span>
                </button>
                <label v-if="effectState.suitIds.includes(s.id) && s.maxStacks > 1" class="dc-chip-stack">
                  <span>×</span>
                  <input
                    v-model.number="effectState.suitStacks[s.id]"
                    type="number"
                    min="1"
                    :max="s.maxStacks"
                    class="dc-chip-stack-input"
                  />
                  <span>层</span>
                </label>
              </div>
            </div>
          </div>

          <!-- ③ 装备特技词条 -->
          <div class="dc-effect-group">
            <div class="dc-effect-group-head">
              <span class="dc-effect-group-title">装备 / 专属词条特效</span>
            </div>
            <div class="dc-effect-chips-grid">
              <div
                v-for="eq in effectsCatalog.equips"
                :key="eq.id"
                class="dc-effect-chip-wrap"
                :class="{
                  'is-active': effectState.equipIds.includes(eq.id),
                  'is-dim': !isItemApplicable(eq),
                }"
              >
                <button
                  type="button"
                  class="dc-effect-chip-btn"
                  :title="`${eq.des}${!isItemApplicable(eq) ? '（当前技能形态/元素不满足触发条件）' : ''}`"
                  @click="toggleEffectId('equipIds', eq.id, eq)"
                >
                  <span class="dc-effect-chip-name">{{ eq.name }}</span>
                  <span class="dc-effect-chip-val">{{ eq.effectLabel }}</span>
                </button>
                <label v-if="effectState.equipIds.includes(eq.id) && eq.maxStacks > 1" class="dc-chip-stack">
                  <span>×</span>
                  <input
                    v-model.number="effectState.equipStacks[eq.id]"
                    type="number"
                    min="1"
                    :max="eq.maxStacks"
                    class="dc-chip-stack-input"
                  />
                  <span>层</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 角色选择弹窗（样式与魔物出战页保持一致） -->
    <UiModal
      v-model:visible="heroPickerOpen"
      title="选择计算角色"
      max-width="900px"
      scroll-id="dcHeroPickerScroll"
      teleport-to="body"
      :close-on-overlay="true"
      :z-index="2000"
    >
      <div class="dc-picker-search">
        <UiSearchInput v-model="heroSearch" placeholder="搜索角色名称、职业或属性..." />
      </div>
      <UiFilterPanel class="dc-picker-filter" :collapsible="false">
        <UiFilterRow label="稀有度：">
          <UiFilterPill :active="!heroRareFilter" @click="heroRareFilter = 0">全部</UiFilterPill>
          <UiFilterPill v-for="r in [5, 4, 3]" :key="r" :quality="r" :active="heroRareFilter === r" @click="heroRareFilter = r">{{ r }}星</UiFilterPill>
        </UiFilterRow>
        <UiFilterRow label="职业：">
          <UiFilterPill :active="!heroJobFilter" @click="heroJobFilter = ''">全部</UiFilterPill>
          <UiFilterPill v-for="j in JOBS" :key="j" :active="heroJobFilter === j" @click="heroJobFilter = j">{{ j }}</UiFilterPill>
        </UiFilterRow>
        <UiFilterRow label="属性：">
          <UiFilterPill :active="!heroElemFilter" @click="heroElemFilter = ''">全部</UiFilterPill>
          <UiFilterPill v-for="el in ELEMENTS" :key="el" :active="heroElemFilter === el" @click="heroElemFilter = el">{{ el }}</UiFilterPill>
        </UiFilterRow>
      </UiFilterPanel>
      <div v-if="filteredHeroes.length" class="dc-hero-picker-grid">
        <HeroPickCard
          v-for="h in filteredHeroes"
          :key="h.id"
          :hero="h"
          :picked="selectedHero?.id === h.id"
          @click="pickHero(h)"
        />
      </div>
      <UiEmptyState v-else text="没有符合筛选条件的角色" />
      <UiBackToTop scroll-container="#dcHeroPickerScroll" />
    </UiModal>

    <!-- 怪物目标选择弹窗（同款魔物出战筛选 + 卡片矩阵风格） -->
    <UiModal
      v-model:visible="monsterPickerOpen"
      title="选择目标怪物预设"
      max-width="900px"
      scroll-id="dcMonsterPickerScroll"
      teleport-to="body"
      :close-on-overlay="true"
      :z-index="2000"
    >
      <div class="dc-picker-search">
        <UiSearchInput v-model="monsterSearch" placeholder="搜索怪物名称、弱点属性..." />
      </div>
      <UiFilterPanel class="dc-picker-filter" :collapsible="false">
        <UiFilterRow label="阶位：">
          <UiFilterPill :active="!monsterRankFilter" @click="monsterRankFilter = 0">全部</UiFilterPill>
          <UiFilterPill
            v-for="rk in MONSTER_RANKS"
            :key="rk.value"
            :active="monsterRankFilter === rk.value"
            @click="monsterRankFilter = rk.value"
          >{{ rk.label }}</UiFilterPill>
        </UiFilterRow>
        <UiFilterRow label="弱点：">
          <UiFilterPill :active="!monsterWeakFilter" @click="monsterWeakFilter = ''">全部</UiFilterPill>
          <UiFilterPill
            v-for="wf in MONSTER_WEAK_FILTERS"
            :key="wf.value"
            :active="monsterWeakFilter === wf.value"
            @click="monsterWeakFilter = wf.value"
          >{{ wf.label }}</UiFilterPill>
        </UiFilterRow>
      </UiFilterPanel>
      <div v-if="filteredMonsters.length" class="dc-mon-picker-grid">
        <button
          v-for="m in filteredMonsters"
          :key="m.id"
          type="button"
          class="dc-mon-pick-card"
          :class="{ 'is-picked': selectedMonster?.id === m.id, [`is-rank-${m.monRank || 1}`]: true }"
          :title="`${m.name}｜基础物防 ${m.phyDef} · 基础魔防 ${m.magicDef} · 抗暴 ${m.critRes}%${m.weakAttDes ? ' · ' + m.weakAttDes.replace(/[{}]/g, '') : ''}`"
          @click="pickMonster(m)"
        >
          <span v-if="selectedMonster?.id === m.id" class="dc-mon-pick-badge">已选</span>
          <div class="dc-mon-pick-top">
            <span v-if="m.monRank === 3" class="dc-mon-rank-tag is-boss">首领</span>
            <span v-else-if="m.monRank === 2" class="dc-mon-rank-tag is-elite">精英</span>
            <span v-if="m.weakElement" class="dc-mon-weak-tag" :class="`is-${m.weakElement}`">
              {{ ELEMENT_LABELS[m.weakElement] }}弱
            </span>
          </div>
          <div class="dc-mon-pick-art">
            <img v-if="m.icon" :src="monsterIconUrl(m.icon)" :alt="m.name" loading="lazy" decoding="async" @error="onImgError" />
          </div>
          <div class="dc-mon-pick-meta">
            <span class="dc-mon-pick-name">{{ m.name }}</span>
            <span class="dc-mon-pick-def">物防 {{ m.phyDef }} · 魔防 {{ m.magicDef }}</span>
          </div>
        </button>
      </div>
      <UiEmptyState v-else text="没有匹配的怪物预设" />
      <UiBackToTop scroll-container="#dcMonsterPickerScroll" />
    </UiModal>

    <!-- 魔物特性选择弹窗 -->
    <UiModal
      v-model:visible="petPickerOpen"
      title="选择出战魔物特性"
      max-width="900px"
      scroll-id="dcPetPickerScroll"
      teleport-to="body"
      :close-on-overlay="true"
      :z-index="2000"
    >
      <div class="dc-picker-search">
        <UiSearchInput v-model="petSearch" placeholder="搜索魔物名称、特性名称或效果..." />
      </div>
      <UiFilterPanel class="dc-picker-filter" :collapsible="false">
        <UiFilterRow label="属性：">
          <UiFilterPill :active="!petElemFilter" @click="petElemFilter = ''">全部</UiFilterPill>
          <UiFilterPill v-for="el in ELEMENTS" :key="el" :active="petElemFilter === el" @click="petElemFilter = el">{{ el }}</UiFilterPill>
        </UiFilterRow>
      </UiFilterPanel>
      <div v-if="filteredPets.length" class="dc-mon-picker-grid">
        <button
          v-for="p in filteredPets"
          :key="p.id"
          type="button"
          class="dc-mon-pick-card"
          :class="{ 'is-picked': effectState.petId === p.id }"
          :title="`${p.name} · ${p.traitName}｜${p.levels[p.levels.length - 1]?.des || ''}`"
          @click="pickPet(p)"
        >
          <span v-if="effectState.petId === p.id" class="dc-mon-pick-badge">已选</span>
          <div class="dc-mon-pick-top">
            <span v-if="p.elementName" class="dc-mon-weak-tag" :class="petElementClass(p.elementName)">
              {{ p.elementName }}
            </span>
          </div>
          <div class="dc-mon-pick-art">
            <img v-if="p.icon" :src="monsterIconUrl(p.icon)" :alt="p.name" loading="lazy" decoding="async" @error="onImgError" />
          </div>
          <div class="dc-mon-pick-meta">
            <span class="dc-mon-pick-name">{{ p.name }}</span>
            <span class="dc-mon-pick-def">{{ p.traitName }}</span>
          </div>
        </button>
      </div>
      <UiEmptyState v-else text="没有匹配的魔物特性" />
      <p class="dc-picker-footnote">仅收录直接影响角色技能/普攻伤害乘区的 22 种魔物特性；纯治疗、护盾及独立召唤轰击类未接入。</p>
      <UiBackToTop scroll-container="#dcPetPickerScroll" />
    </UiModal>
  </section>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { getImageUrl } from '../../utils/env'
import { fetchWithFallback } from '../../utils/request'
import { calculateSkillDamage } from '../../utils/damageCalculator'
import { aggregateDamageEffects, isEffectApplicable } from '../../utils/damageEffects'
import { applyStarTransformsToSkill, calculateHeroStarEffects } from '../../utils/heroStarsDamage'
import { ELEMENTS, JOBS } from '../../utils/simsData'
import UiBackToTop from '../ui/UiBackToTop.vue'
import UiButton from '../ui/UiButton.vue'
import UiEmptyState from '../ui/UiEmptyState.vue'
import UiFilterPanel from '../ui/UiFilterPanel.vue'
import UiFilterPill from '../ui/UiFilterPill.vue'
import UiFilterRow from '../ui/UiFilterRow.vue'
import UiModal from '../ui/UiModal.vue'
import UiSearchInput from '../ui/UiSearchInput.vue'
import UiTag from '../ui/UiTag.vue'
import HeroPickCard from '../heroes/HeroPickCard.vue'

const ELEMENT_LABELS = {
  fire: '火',
  water: '水',
  wind: '风',
  earth: '地',
  none: '无',
}

const ELEMENT_CLASS_MAP = {
  火: 'is-fire',
  水: 'is-water',
  风: 'is-wind',
  地: 'is-earth',
}

const MONSTER_RANKS = [
  { value: 1, label: '普通' },
  { value: 2, label: '精英' },
  { value: 3, label: '首领' },
]

const MONSTER_WEAK_FILTERS = [
  { value: 'fire', label: '火弱' },
  { value: 'water', label: '水弱' },
  { value: 'wind', label: '风弱' },
  { value: 'earth', label: '地弱' },
  { value: 'none', label: '无弱点' },
]

const loading = ref(true)
const errorMessage = ref('')
const heroes = ref([])
const monsters = ref([])
const levelStrength = ref({})
const effectsCatalog = ref({ pets: [], suits: [], equips: [] })

const selectedHero = ref(null)
const selectedSkillIndex = ref(0)
const selectedSkillLevelIndex = ref(0)
const selectedMonster = ref(null)
const presetMonLevel = ref(50)

const petPickerOpen = ref(false)
const petSearch = ref('')
const petElemFilter = ref('')
const showEffectsPanel = ref(true)

const effectState = reactive({
  petId: '',
  petLevel: 7,
  petStacks: 1,
  petSynergy: false,
  suitIds: [],
  suitStacks: {},
  equipIds: [],
  equipStacks: {},
})

const heroPickerOpen = ref(false)
const heroSearch = ref('')
const heroRareFilter = ref(0)
const heroJobFilter = ref('')
const heroElemFilter = ref('')

const monsterPickerOpen = ref(false)
const monsterSearch = ref('')
const monsterRankFilter = ref(0)
const monsterWeakFilter = ref('')

const showAdvancedAtk = ref(false)
const showAdvancedTgt = ref(false)
const showSteps = ref(false)

const atk = reactive({
  level: 50,
  phyAtk: 4500,
  magicAtk: 4500,
  maxHp: 12000,
  crit: 10,
  critDam: 155,
  phyAtkPenPct: 0,
  magicAtkPenPct: 0,
  normalAtkPhyPenPct: 0,
  normalAtkMagPenPct: 0,
  ignoreDefPct: 0,
  damAddZone1Pct: 0,
  unitAtkDamAddPct: 0,
  unitPhyDamAddPct: 0,
  unitMagicDamAddPct: 0,
  unitNormalDamAddPct: 0,
  unitSkillDamAddPct: 0,
  unitElemDamAddPct: { fire: 0, water: 0, wind: 0, earth: 0 },
  spRelicSkillDmgAddPct: 0,
  extraEventMult: 1,
  realDam: false,
  realCrit: false,
})

const tgt = reactive({
  level: 50,
  phyDef: 0,
  magicDef: 0,
  critRes: 0,
  damResElementPct: 0,
  damResTypePct: 0,
  unitDamageAddPct: 0,
  unitBeHitSkillDamAddPct: 0,
  unitTypeResPct: 0,
  unitElemResPct: 0,
})

const allowCritOverride = ref(false)
const needFloatOverride = ref(true)

const heroPortrait = (h) => getImageUrl(`/images/HeadIconAtals/${h.icon}.webp`)
const skillIconUrl = (icon) => getImageUrl(`/images/Common_SkillIcon/${icon}.webp`)
const monsterIconUrl = (icon) => getImageUrl(`/images/PicHandBookPanel_Atlas/${icon}.webp`)
const onImgError = (e) => { e.target.style.opacity = '0.25' }

const heroAbilities = computed(() => [
  ...(selectedHero.value?.skills || []),
  ...(selectedHero.value?.talentSkills || []),
])
const selectedSkill = computed(() => heroAbilities.value[selectedSkillIndex.value] || null)
const currentLevelData = computed(() => selectedSkill.value?.levels?.[selectedSkillLevelIndex.value] || selectedSkill.value?.levels?.[0] || null)

const activeDamageType = computed(() => selectedSkill.value?.segments?.[0]?.damageType || 'phyAtk')
const primaryElement = computed(() => {
  const el = selectedSkill.value?.segments?.[0]?.elementType
  return ['fire', 'water', 'wind', 'earth'].includes(el) ? el : 'none'
})
const usesMaxHpScaling = computed(() => Boolean(selectedSkill.value?.segments?.some((s) => s.scaling === 'maxHp')))
const hasDamageSegments = computed(() => {
  const sk = effectiveSkill.value
  const lv = sk?.levels?.[selectedSkillLevelIndex.value] || sk?.levels?.[0]
  return Boolean(sk?.segments?.some((_, i) => {
    const vals = lv?.segments?.[i]
    return vals && (Number(vals[0]) > 0 || Number(vals[1]) > 0)
  }))
})

const skillCaveatMessage = computed(() => {
  const sk = selectedSkill.value
  if (!sk) return ''
  const parts = []
  if (sk.reviewStatus !== 'verified') parts.push('该技能当前为表推导，部分触发条件请以实机跳字为准')
  if (sk.outcomes?.includes('damageOverTime')) parts.push('含持续伤害（DoT 走独立 Buff 结算，此处仅算直接命中段）')
  if (sk.outcomes?.includes('heal') || sk.outcomes?.includes('shield')) parts.push('含治疗/护盾效果')
  return parts.join('；')
})

const starSelection = reactive({
  starLevels: {},
  starStacks: {},
})

function resetStars() {
  Object.keys(starSelection.starLevels).forEach((k) => { delete starSelection.starLevels[k] })
  Object.keys(starSelection.starStacks).forEach((k) => { delete starSelection.starStacks[k] })
}

function maxAllStars() {
  for (const st of selectedHero.value?.starSkills || []) {
    starSelection.starLevels[st.id] = st.maxLevel || 1
    if (st.maxStacks > 1 && !starSelection.starStacks[st.id]) {
      starSelection.starStacks[st.id] = st.defaultStacks || st.maxStacks
    }
  }
}

function toggleStarSkill(st) {
  if ((starSelection.starLevels[st.id] || 0) > 0) {
    starSelection.starLevels[st.id] = 0
    return
  }
  starSelection.starLevels[st.id] = st.maxLevel || 1
  if (st.maxStacks > 1 && !starSelection.starStacks[st.id]) {
    starSelection.starStacks[st.id] = st.defaultStacks || st.maxStacks
  }
}

function currentStarEntry(st) {
  const lv = Number(starSelection.starLevels[st.id] || 0)
  const targetLv = lv > 0 ? lv : (st.maxLevel || 1)
  return st.levels?.find((x) => x.level === targetLv) || st.levels?.[st.levels.length - 1] || null
}

function starMaxStacks(st) {
  return currentStarEntry(st)?.maxStacksOverride || st.maxStacks || 1
}

function isStarCurrentlyApplicable(st) {
  const w = st?.when
  if (!w || w.always) return true
  if (w.skillId) return selectedSkill.value?.id === w.skillId
  if (Array.isArray(w.skillIds)) return w.skillIds.includes(selectedSkill.value?.id)
  return isEffectApplicable({ when: w }, effectContext.value)
}

function syncSkillDefaults() {
  const sk = selectedSkill.value
  if (!sk) return
  allowCritOverride.value = sk.crit === 'yes'
  needFloatOverride.value = sk.form === 'normalAtk'
  selectedSkillLevelIndex.value = Math.max(0, (sk.levels?.length || 1) - 1)
}

function selectSkill(idx) {
  selectedSkillIndex.value = idx
  syncSkillDefaults()
}

function pickHero(h) {
  selectedHero.value = h
  selectedSkillIndex.value = 0
  resetStars()
  syncSkillDefaults()
  heroPickerOpen.value = false
}

const maxPresetLevel = computed(() => {
  const levels = Object.keys(levelStrength.value || {}).map(Number).filter(Number.isFinite)
  return levels.length ? Math.max(...levels) : 100
})

function clampPresetLevel(lv) {
  const n = Math.round(Number(lv) || 1)
  return Math.max(1, Math.min(maxPresetLevel.value, n))
}

function applyMonsterPreset({ syncTargetLevel = false } = {}) {
  const mon = selectedMonster.value
  if (!mon) return
  const coeff = Number(levelStrength.value[String(presetMonLevel.value)] || 1)
  if (syncTargetLevel) {
    tgt.level = presetMonLevel.value
  }
  // 1.7.15 UnitAttribute.InitUnitBaseAttributeData 中双防仅乘等级强度系数（保留浮点数），不受关卡 levelScale 缩放
  tgt.phyDef = Number((mon.phyDef * coeff).toFixed(4))
  tgt.magicDef = Number((mon.magicDef * coeff).toFixed(4))
  tgt.critRes = mon.critRes
  if (mon.weakElement && mon.weakElement === primaryElement.value) {
    tgt.damResElementPct = -Math.round(mon.weakPct * 100)
  } else {
    tgt.damResElementPct = 0
  }
}

function onPresetLevelInput(event) {
  const lv = clampPresetLevel(event?.target?.value)
  presetMonLevel.value = lv
  tgt.level = lv
  applyMonsterPreset({ syncTargetLevel: false })
}

watch(() => tgt.level, (lv) => {
  if (!selectedMonster.value) return
  const num = Number(lv)
  if (!Number.isFinite(num) || num < 1) return
  const nextPreset = clampPresetLevel(num)
  if (presetMonLevel.value !== nextPreset) {
    presetMonLevel.value = nextPreset
  }
  applyMonsterPreset({ syncTargetLevel: false })
})

watch(primaryElement, () => {
  if (selectedMonster.value) applyMonsterPreset({ syncTargetLevel: false })
})

function pickMonster(m) {
  selectedMonster.value = m
  presetMonLevel.value = clampPresetLevel(Number(tgt.level) || Number(atk.level) || 50)
  applyMonsterPreset({ syncTargetLevel: true })
  monsterPickerOpen.value = false
}

function useDummyTarget() {
  selectedMonster.value = null
  tgt.level = Number(atk.level) || 50
  tgt.phyDef = 0
  tgt.magicDef = 0
  tgt.critRes = 0
  tgt.damResElementPct = 0
  tgt.damResTypePct = 0
  tgt.unitDamageAddPct = 0
  tgt.unitBeHitSkillDamAddPct = 0
  tgt.unitTypeResPct = 0
  tgt.unitElemResPct = 0
}

function resetInputs() {
  atk.level = 50
  atk.phyAtk = 4500
  atk.magicAtk = 4500
  atk.maxHp = 12000
  atk.crit = 10
  atk.critDam = 155
  atk.phyAtkPenPct = 0
  atk.magicAtkPenPct = 0
  atk.ignoreDefPct = 0
  atk.damAddZone1Pct = 0
  atk.unitAtkDamAddPct = 0
  atk.unitPhyDamAddPct = 0
  atk.unitMagicDamAddPct = 0
  atk.unitNormalDamAddPct = 0
  atk.unitSkillDamAddPct = 0
  atk.unitElemDamAddPct = { fire: 0, water: 0, wind: 0, earth: 0 }
  atk.spRelicSkillDmgAddPct = 0
  atk.extraEventMult = 1
  atk.realDam = false
  atk.realCrit = false
  resetStars()
  resetEffects()
  syncSkillDefaults()
  useDummyTarget()
}

const effectContext = computed(() => ({
  form: selectedSkill.value?.form || 'skill',
  damageType: activeDamageType.value,
  elementType: primaryElement.value,
}))

const selectedPet = computed(() => (effectsCatalog.value.pets || []).find((p) => p.id === effectState.petId) || null)
const currentPetLevelEntry = computed(() => {
  const pet = selectedPet.value
  if (!pet?.levels?.length) return null
  return pet.levels.find((lv) => lv.level === effectState.petLevel) || pet.levels[pet.levels.length - 1]
})
const isPetApplicable = computed(() => Boolean(selectedPet.value && isEffectApplicable(selectedPet.value, effectContext.value)))

const isItemApplicable = (item) => isEffectApplicable(item, effectContext.value)
const petElementClass = (elemName) => ELEMENT_CLASS_MAP[elemName] || ''

const filteredPets = computed(() => {
  const q = petSearch.value.trim().toLowerCase()
  return (effectsCatalog.value.pets || []).filter((p) => {
    if (petElemFilter.value && p.elementName !== petElemFilter.value) return false
    if (q && !`${p.name} ${p.traitName} ${p.effectLabel} ${p.levels[p.levels.length - 1]?.des || ''}`.toLowerCase().includes(q)) {
      return false
    }
    return true
  })
})

const hasAnyEffectSelected = computed(() => Boolean(effectState.petId || effectState.suitIds.length || effectState.equipIds.length))

function pickPet(p) {
  effectState.petId = p.id
  effectState.petLevel = p.levels[p.levels.length - 1]?.level || 7
  effectState.petStacks = p.defaultStacks || 1
  effectState.petSynergy = false
  petPickerOpen.value = false
}

function clearPetEffect() {
  effectState.petId = ''
  effectState.petLevel = 7
  effectState.petStacks = 1
  effectState.petSynergy = false
}

function toggleEffectId(listKey, id, item) {
  const arr = effectState[listKey]
  const idx = arr.indexOf(id)
  if (idx >= 0) {
    arr.splice(idx, 1)
    return
  }
  arr.push(id)
  const stacksKey = listKey === 'suitIds' ? 'suitStacks' : 'equipStacks'
  if (item?.maxStacks > 1 && !effectState[stacksKey][id]) {
    effectState[stacksKey][id] = item.defaultStacks || item.maxStacks
  }
}

function resetEffects() {
  clearPetEffect()
  effectState.suitIds.splice(0, effectState.suitIds.length)
  effectState.equipIds.splice(0, effectState.equipIds.length)
  Object.keys(effectState.suitStacks).forEach((k) => { delete effectState.suitStacks[k] })
  Object.keys(effectState.equipStacks).forEach((k) => { delete effectState.equipStacks[k] })
}

const starEffects = computed(() =>
  calculateHeroStarEffects(selectedHero.value, starSelection, selectedSkill.value, effectContext.value),
)

const effectiveSkill = computed(() =>
  applyStarTransformsToSkill(selectedSkill.value, selectedSkillLevelIndex.value, starEffects.value),
)

const activeEffects = computed(() => aggregateDamageEffects(effectsCatalog.value, effectState, effectContext.value))

const effectSummaryChips = computed(() => {
  const e = activeEffects.value
  const s = starEffects.value
  const chips = []
  const pct = (v) => `${Math.round(v * 1000) / 10}%`
  const phyAtkPct = e.phyAtkPct + s.phyAtkPct
  const magicAtkPct = e.magicAtkPct + s.magicAtkPct
  const critAdd = e.crit + s.crit
  const critDamAdd = e.critDam + s.critDam
  const tgtPhyDefPct = e.tgtPhyDefPct + s.tgtPhyDefPct
  const tgtMagicDefPct = e.tgtMagicDefPct + s.tgtMagicDefPct
  const tagDamAdd = e.tagDamAdd + s.tagDamAdd
  const unitAtkDamAdd = e.unitAtkDamAdd + s.unitAtkDamAdd
  const unitPhyDamAdd = e.unitPhyDamAdd + s.unitPhyDamAdd
  const unitMagicDamAdd = e.unitMagicDamAdd + s.unitMagicDamAdd
  const unitNormalDamAdd = e.unitNormalDamAdd + s.unitNormalDamAdd
  const unitSkillDamAdd = e.unitSkillDamAdd + s.unitSkillDamAdd
  const extraEventMult = e.extraEventMult * s.extraEventMult

  if (s.skillMultScale !== 1) chips.push(`星阶倍率 ×${s.skillMultScale.toFixed(2)}`)
  if (s.muPowerAdd) chips.push(`星阶额外倍率 +${pct(s.muPowerAdd)}`)
  if (s.extraSegs.length) chips.push(`星阶追加 ${s.extraSegs.length} 段命中`)
  if (phyAtkPct) chips.push(`战斗物攻 +${pct(phyAtkPct)}`)
  if (magicAtkPct) chips.push(`战斗魔攻 +${pct(magicAtkPct)}`)
  if (critAdd) chips.push(`暴击率 +${Math.round(critAdd * 10) / 10}%`)
  if (critDamAdd) chips.push(`暴击伤害 +${Math.round(critDamAdd * 10) / 10}%`)
  if (e.realCrit || s.realCrit || s.firstHitRealCrit) chips.push(s.firstHitRealCrit && !e.realCrit && !s.realCrit ? '首段必暴(realCrit)' : '必暴(realCrit)')
  if (e.damAddPhy) chips.push(`一区物伤 +${pct(e.damAddPhy)}`)
  if (e.damAddMagic) chips.push(`一区魔伤 +${pct(e.damAddMagic)}`)
  for (const el of ['fire', 'water', 'wind', 'earth']) {
    if (e.damAddElement[el]) chips.push(`一区${ELEMENT_LABELS[el]}伤 +${pct(e.damAddElement[el])}`)
  }
  if (tgtPhyDefPct) chips.push(`目标物防 ${pct(tgtPhyDefPct)}`)
  if (tgtMagicDefPct) chips.push(`目标魔防 ${pct(tgtMagicDefPct)}`)
  if (s.unitDamageAdd) chips.push(`目标易伤 +${pct(s.unitDamageAdd)}`)
  if (tagDamAdd) chips.push(`普攻标签 +${pct(tagDamAdd)}`)
  if (unitAtkDamAdd) chips.push(`通用增伤 +${pct(unitAtkDamAdd)}`)
  if (unitPhyDamAdd) chips.push(`物理增伤 +${pct(unitPhyDamAdd)}`)
  if (unitMagicDamAdd) chips.push(`魔法增伤 +${pct(unitMagicDamAdd)}`)
  if (unitNormalDamAdd) chips.push(`普攻增伤 +${pct(unitNormalDamAdd)}`)
  if (unitSkillDamAdd) chips.push(`技能增伤 +${pct(unitSkillDamAdd)}`)
  for (const el of ['fire', 'water', 'wind', 'earth']) {
    if (e.unitElemDamAdd[el]) chips.push(`${ELEMENT_LABELS[el]}伤 +${pct(e.unitElemDamAdd[el])}`)
  }
  if (extraEventMult > 1) chips.push(`事件独立连乘 ×${extraEventMult.toFixed(3)}`)
  return chips
})

const effectiveRealCrit = computed(() => Boolean(atk.realCrit || activeEffects.value.realCrit || starEffects.value.realCrit || starEffects.value.firstHitRealCrit))

const filteredHeroes = computed(() => {
  const q = heroSearch.value.trim().toLowerCase()
  return heroes.value.filter((h) => {
    if (heroRareFilter.value && h.rare !== heroRareFilter.value) return false
    if (heroJobFilter.value && h.jobName !== heroJobFilter.value) return false
    if (heroElemFilter.value && h.elementName !== heroElemFilter.value) return false
    if (q && !`${h.name} ${h.jobName} ${h.elementName}`.toLowerCase().includes(q)) return false
    return true
  })
})

const filteredMonsters = computed(() => {
  const q = monsterSearch.value.trim().toLowerCase()
  return monsters.value.filter((m) => {
    if (monsterRankFilter.value && (m.monRank || 1) !== monsterRankFilter.value) return false
    if (monsterWeakFilter.value === 'none' && m.weakElement) return false
    if (monsterWeakFilter.value && monsterWeakFilter.value !== 'none' && m.weakElement !== monsterWeakFilter.value) return false
    if (q && !`${m.name} ${m.weakAttDes || ''}`.toLowerCase().includes(q)) return false
    return true
  })
})

const calcResult = computed(() => {
  const hero = selectedHero.value
  const sk = effectiveSkill.value
  if (!hero || !sk) {
    return {
      allowCrit: false,
      needFloat: false,
      critChance: 0,
      noCrit: { min: 0, mid: 0, max: 0 },
      crit: { min: 0, mid: 0, max: 0 },
      expected: 0,
      segments: [],
    }
  }
  const elKey = primaryElement.value
  const dType = activeDamageType.value
  const eff = activeEffects.value
  const se = starEffects.value
  const attackerInput = {
    level: atk.level,
    phyAtk: (Number(atk.phyAtk) || 0) * (1 + eff.phyAtkPct + se.phyAtkPct),
    magicAtk: (Number(atk.magicAtk) || 0) * (1 + eff.magicAtkPct + se.magicAtkPct),
    maxHp: atk.maxHp,
    crit: (Number(atk.crit) || 0) + eff.crit + se.crit,
    critDam: (Number(atk.critDam) ?? 150) + eff.critDam + se.critDam,
    phyAtkPen: (Number(atk.phyAtkPenPct) || 0) / 100,
    magicAtkPen: (Number(atk.magicAtkPenPct) || 0) / 100,
    ignoreDef: (Number(atk.ignoreDefPct) || 0) / 100,
    floatMin: hero.floatMin,
    floatMax: hero.floatMax,
    damAddPhy: (dType === 'phyAtk' ? (Number(atk.damAddZone1Pct) || 0) / 100 : 0) + eff.damAddPhy,
    damAddMagic: (dType === 'magicAtk' ? (Number(atk.damAddZone1Pct) || 0) / 100 : 0) + eff.damAddMagic,
    damAddElement: eff.damAddElement,
    tagDamAdd: eff.tagDamAdd + se.tagDamAdd,
    unitAtkDamAdd: (Number(atk.unitAtkDamAddPct) || 0) / 100 + eff.unitAtkDamAdd + se.unitAtkDamAdd,
    unitPhyDamAdd: (Number(atk.unitPhyDamAddPct) || 0) / 100 + eff.unitPhyDamAdd + se.unitPhyDamAdd,
    unitMagicDamAdd: (Number(atk.unitMagicDamAddPct) || 0) / 100 + eff.unitMagicDamAdd + se.unitMagicDamAdd,
    unitNormalDamAdd: (Number(atk.unitNormalDamAddPct) || 0) / 100 + eff.unitNormalDamAdd + se.unitNormalDamAdd,
    unitSkillDamAdd: (Number(atk.unitSkillDamAddPct) || 0) / 100 + eff.unitSkillDamAdd + se.unitSkillDamAdd,
    unitElemDamAdd: {
      fire: (Number(atk.unitElemDamAddPct.fire) || 0) / 100 + eff.unitElemDamAdd.fire,
      water: (Number(atk.unitElemDamAddPct.water) || 0) / 100 + eff.unitElemDamAdd.water,
      wind: (Number(atk.unitElemDamAddPct.wind) || 0) / 100 + eff.unitElemDamAdd.wind,
      earth: (Number(atk.unitElemDamAddPct.earth) || 0) / 100 + eff.unitElemDamAdd.earth,
    },
    spRelicSkillDmgAdd: (Number(atk.spRelicSkillDmgAddPct) || 0) / 100,
    extraEventMult: (Number(atk.extraEventMult) || 1) * eff.extraEventMult * se.extraEventMult,
    realDam: atk.realDam,
    realCrit: Boolean(atk.realCrit || eff.realCrit || se.realCrit),
  }
  const targetInput = {
    level: tgt.level,
    phyDef: (Number(tgt.phyDef) || 0) * Math.max(0, 1 + eff.tgtPhyDefPct + se.tgtPhyDefPct),
    magicDef: (Number(tgt.magicDef) || 0) * Math.max(0, 1 + eff.tgtMagicDefPct + se.tgtMagicDefPct),
    critRes: tgt.critRes,
    damResPhy: dType === 'phyAtk' ? (Number(tgt.damResTypePct) || 0) / 100 : 0,
    damResMagic: dType === 'magicAtk' ? (Number(tgt.damResTypePct) || 0) / 100 : 0,
    damResElement: elKey !== 'none' ? { [elKey]: (Number(tgt.damResElementPct) || 0) / 100 } : {},
    unitDamageAdd: (Number(tgt.unitDamageAddPct) || 0) / 100 + se.unitDamageAdd,
    unitBeHitSkillDamAdd: (Number(tgt.unitBeHitSkillDamAddPct) || 0) / 100,
    unitPhyRes: dType === 'phyAtk' ? (Number(tgt.unitTypeResPct) || 0) / 100 : 0,
    unitMagicRes: dType === 'magicAtk' ? (Number(tgt.unitTypeResPct) || 0) / 100 : 0,
    unitElemRes: elKey !== 'none' ? { [elKey]: (Number(tgt.unitElemResPct) || 0) / 100 } : {},
  }

  return calculateSkillDamage({
    attacker: attackerInput,
    target: targetInput,
    skill: sk,
    levelIndex: selectedSkillLevelIndex.value,
    allowCritOverride: Boolean(allowCritOverride.value || se.allowCritOverrideFromStar),
    needFloatOverride: needFloatOverride.value,
  })
})

const firstSegmentSteps = computed(() => calcResult.value.segments?.[0]?.steps || null)

function formatSkillDes(des) {
  const raw = String(des || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return raw.replace(/\{([^}]+)\}/g, '<span class="dc-des-val">$1</span>')
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('zh-CN')
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchWithFallback('data/parsed/damage-calc.json')
    heroes.value = data.heroes || []
    monsters.value = data.monsters || []
    levelStrength.value = data.levelStrength || {}
    effectsCatalog.value = data.effects || { pets: [], suits: [], equips: [] }
    if (!selectedHero.value && heroes.value.length) {
      pickHero(heroes.value[0])
    }
  } catch (err) {
    errorMessage.value = `伤害计算数据加载失败：${err?.message || err}`
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.dc-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dc-panel {
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dc-hero-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.dc-hero-summary {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dc-hero-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border-color);
  background: var(--dc-avatar-bg, rgba(255, 250, 240, 0.7));
}

.dc-hero-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dc-hero-name {
  margin: 0;
  font-size: 16px;
  color: var(--text-main);
}

.dc-hero-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 3px;
}

.dc-hero-actions {
  display: flex;
  gap: 8px;
}

.dc-skills-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
}

.dc-skill-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.6));
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.dc-skill-btn.is-active {
  border-color: var(--dc-active-border, #8f5b28);
  background: var(--dc-active-bg, rgba(184, 134, 40, 0.14));
}

.dc-skill-icon {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.dc-skill-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dc-skill-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.dc-skill-name {
  font-size: 13px;
  font-weight: 700;
}

.dc-skill-badge,
.dc-skill-crit-badge {
  font-size: 10.5px;
  padding: 0 5px;
  border-radius: 4px;
  font-weight: 600;
}

.dc-skill-badge {
  background: var(--dc-badge-bg, rgba(143, 115, 81, 0.16));
  color: var(--text-muted);
}

.dc-skill-badge.is-talent {
  background: var(--dc-talent-badge-bg, rgba(35, 112, 118, 0.14));
  color: var(--dc-talent-badge-color, #1e5f65);
}

.dc-skill-crit-badge {
  background: var(--dc-crit-badge-bg, rgba(196, 64, 43, 0.14));
  color: var(--dc-crit-badge-color, #a42a18);
}

.dc-skill-sub {
  font-size: 11.5px;
  color: var(--text-muted);
}

.dc-skill-detail-box {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.55));
  border: 1px dashed var(--border-soft);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dc-skill-lv-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.dc-lv-label {
  font-size: 12.5px;
  color: var(--text-main);
}

.dc-slider {
  flex: 1;
  min-width: 140px;
  max-width: 240px;
  background: transparent;
  accent-color: var(--dc-slider-accent, #7a4e21);
  cursor: pointer;
}

.dc-skill-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-main);
}

.dc-skill-desc :deep(.dc-des-val) {
  color: var(--dc-val-color, #2563eb);
  font-weight: 700;
}

.dc-caveat-bar {
  font-size: 12px;
  color: var(--dc-warn-color, #8f4818);
  background: var(--dc-warn-bg, rgba(196, 120, 40, 0.12));
  padding: 5px 8px;
  border-radius: 4px;
}

.dc-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.dc-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.dc-card-title {
  margin: 0;
  font-size: 14.5px;
  color: var(--text-main);
}

.dc-card-tip,
.dc-crit-summary {
  font-size: 12px;
  color: var(--text-muted);
}

.dc-subfield-head {
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dc-subfield-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-main);
}

.dc-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 10px;
}

.dc-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--text-muted);
}

.dc-field.is-inactive {
  opacity: 0.62;
}

.dc-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: 5px;
  border: 1px solid var(--border-soft);
  background: var(--input-bg, #fffaf0);
  color: var(--input-text, var(--text-main));
  font-size: 13px;
  font-weight: 600;
}

.dc-input--sm {
  width: 84px;
}

.dc-collapse-btn {
  align-self: flex-start;
  padding: 3px 0;
  border: none;
  background: transparent;
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.dc-advanced-box {
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dc-switches-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.dc-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-main);
  cursor: pointer;
}

.dc-target-actions {
  display: flex;
  gap: 6px;
}

.dc-mini-btn {
  padding: 4px 9px;
  border-radius: 5px;
  border: 1px solid var(--border-soft);
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.7));
  color: var(--text-main);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.dc-mini-btn.is-active {
  border-color: var(--dc-active-border, #7a4e21);
  background: var(--dc-active-bg, rgba(184, 134, 40, 0.16));
}

.dc-monster-preset-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.6));
  border: 1px solid var(--border-soft);
}

.dc-mon-avatar {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: contain;
  flex-shrink: 0;
}

.dc-mon-preset-controls {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dc-mon-preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-main);
}

.dc-mon-preset-note {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.45;
}

.dc-result-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.dc-metric-box {
  padding: 12px;
  border-radius: 8px;
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.7));
  border: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dc-metric-box--accent {
  border-color: var(--dc-active-border, #c69234);
  background: var(--dc-active-bg, rgba(198, 146, 52, 0.12));
}

.dc-metric-box.is-muted {
  opacity: 0.72;
}

.dc-metric-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}

.dc-metric-val {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.dc-metric-val--crit {
  color: var(--dc-crit-color, #b3321f);
}

.dc-metric-val--exp {
  color: var(--dc-exp-color, #8c5d1e);
}

.dc-metric-range {
  font-size: 11.5px;
  color: var(--text-muted);
}

.dc-segments-wrap {
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dc-sub-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}

.dc-segments-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.dc-seg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 5px;
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.5));
  font-size: 12.5px;
  color: var(--text-main);
}

.dc-seg-idx {
  font-weight: 700;
  color: var(--text-muted);
}

.dc-steps-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dc-steps-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.dc-step-item {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.5));
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.dc-step-item strong {
  font-size: 13.5px;
  color: var(--text-main);
}

.dc-picker-search {
  margin-bottom: 10px;
}

/* 与 SimsView .sim-picker-filter 完全一致：弹窗本身已有底板，筛选区剥去外框只留行距 */
.dc-picker-filter {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
}

.dc-hero-picker-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.dc-mon-picker-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.dc-mon-pick-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  aspect-ratio: 100 / 132;
  padding: 8px 6px 7px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.72));
  color: var(--text-main);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.16s ease, filter 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.dc-mon-pick-card:hover {
  transform: translateY(-3px);
  border-color: var(--dc-active-border, #8f5b28);
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.18));
}

.dc-mon-pick-card.is-picked {
  border-color: var(--accent-bright, #8f5b28);
  background: var(--dc-active-bg, rgba(184, 134, 40, 0.16));
  filter: drop-shadow(0 0 4px var(--accent-bright, #8f5b28));
}

.dc-mon-pick-card.is-rank-3 {
  border-color: rgba(179, 50, 31, 0.38);
}

.dc-mon-pick-card.is-rank-2 {
  border-color: rgba(143, 91, 40, 0.32);
}

.dc-mon-pick-badge {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--accent-bright);
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
}

.dc-mon-pick-top {
  width: 100%;
  min-height: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  pointer-events: none;
}

.dc-mon-rank-tag,
.dc-mon-weak-tag {
  font-size: 10px;
  font-weight: 700;
  line-height: 1.3;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
}

.dc-mon-rank-tag.is-boss {
  background: var(--dc-crit-badge-bg, rgba(179, 50, 31, 0.14));
  color: var(--dc-crit-badge-color, #9f2d1e);
}

.dc-mon-rank-tag.is-elite {
  background: var(--dc-warn-bg, rgba(180, 110, 30, 0.14));
  color: var(--dc-warn-color, #8a5112);
}

.dc-mon-weak-tag {
  margin-left: auto;
  background: var(--dc-badge-bg, rgba(95, 72, 49, 0.12));
  color: var(--text-main);
}

.dc-mon-weak-tag.is-fire {
  background: var(--dc-elem-fire-bg, rgba(220, 38, 38, 0.12));
  color: var(--dc-elem-fire-fg, #b91c1c);
}

.dc-mon-weak-tag.is-water {
  background: var(--dc-elem-water-bg, rgba(2, 132, 199, 0.12));
  color: var(--dc-elem-water-fg, #0284c7);
}

.dc-mon-weak-tag.is-wind {
  background: var(--dc-elem-wind-bg, rgba(16, 149, 106, 0.12));
  color: var(--dc-elem-wind-fg, #047857);
}

.dc-mon-weak-tag.is-earth {
  background: var(--dc-elem-earth-bg, rgba(180, 83, 9, 0.12));
  color: var(--dc-elem-earth-fg, #92400e);
}

.dc-mon-pick-art {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}

.dc-mon-pick-art img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.dc-mon-pick-meta {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.dc-mon-pick-name {
  width: 100%;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dc-mon-pick-def {
  font-size: 10.5px;
  line-height: 1.25;
  color: var(--text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dc-effects-head-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dc-effect-count-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--dc-active-bg, rgba(182, 134, 44, 0.14));
  color: var(--dc-exp-color, #9c5b16);
}

.dc-effect-summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.65));
  border: 1px solid var(--border-soft);
  font-size: 12px;
}

.dc-effect-summary-label {
  font-weight: 700;
  color: var(--text-muted);
}

.dc-effect-summary-chip {
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--dc-active-bg, rgba(182, 134, 44, 0.14));
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.dc-effects-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dc-effect-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dc-effect-group-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.dc-effect-group-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.dc-effect-group-tip {
  font-size: 11.5px;
  color: var(--text-muted);
}

.dc-pet-empty-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.dc-pet-active-card {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 7px;
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.65));
  border: 1px solid var(--dc-active-border, #b6862c);
}

.dc-pet-avatar {
  width: 44px;
  height: 44px;
  object-fit: contain;
  border-radius: 6px;
  background: var(--dc-avatar-bg, rgba(255, 250, 240, 0.7));
  padding: 2px;
  flex-shrink: 0;
}

.dc-pet-active-info {
  flex: 1;
  min-width: 210px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dc-pet-active-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
}

.dc-pet-active-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}

.dc-pet-active-note {
  font-size: 11px;
  color: var(--dc-warn-color, #9c5b16);
}

.dc-inactive-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--dc-warn-bg, rgba(206, 134, 42, 0.12));
  color: var(--dc-warn-color, #9c5b16);
}

.dc-pet-active-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dc-inline-ctl {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted);
}

.dc-mini-select,
.dc-mini-num {
  padding: 4px 6px;
  border-radius: 5px;
  border: 1px solid var(--border-color);
  background: var(--input-bg, var(--paper-soft));
  color: var(--text-main);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.dc-mini-num {
  width: 52px;
}

.dc-synergy-check {
  font-size: 12px;
}

.dc-effect-chips-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(215px, 1fr));
  gap: 7px;
}

.dc-effect-chip-wrap {
  display: flex;
  align-items: stretch;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.65));
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.dc-effect-chip-wrap.is-active {
  border-color: var(--dc-active-border, #b6862c);
  background: var(--dc-active-bg, rgba(182, 134, 44, 0.14));
}

.dc-effect-chip-wrap.is-dim {
  opacity: 0.56;
}

.dc-effect-chip-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 7px 9px;
  border: 0;
  background: transparent;
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
}

.dc-effect-chip-name {
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.25;
}

.dc-effect-chip-val {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
}

.dc-chip-stack {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 7px;
  border-left: 1px solid var(--border-soft);
  font-size: 11.5px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.03);
}

.dc-chip-stack-input {
  width: 38px;
  padding: 2px 3px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--input-bg, var(--paper-soft));
  color: var(--text-main);
  font-size: 11.5px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.dc-picker-footnote {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--text-muted);
  text-align: center;
}

.dc-stars-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
}

.dc-stars-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.dc-stars-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.dc-stars-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.dc-star-card {
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.65));
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.dc-star-card.is-active {
  border-color: var(--dc-active-border, #b6862c);
  background: var(--dc-active-bg, rgba(182, 134, 44, 0.14));
}

.dc-star-card.is-dim {
  opacity: 0.62;
}

.dc-star-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  width: 100%;
  min-width: 0;
}

.dc-star-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--border-soft);
}

.dc-star-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dc-star-name-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.dc-star-slot {
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--dc-badge-bg, rgba(120, 96, 68, 0.12));
  color: var(--text-muted);
  flex-shrink: 0;
}

.dc-star-name {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dc-star-badge {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
}

.dc-star-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 5px 8px;
  border-top: 1px solid var(--border-soft);
  background: rgba(0, 0, 0, 0.03);
}

.dc-star-ctl {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.dc-star-select {
  padding: 2px 5px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--input-bg, var(--paper-soft));
  color: var(--text-main);
  font-size: 11.5px;
}

@media (max-width: 900px) {
  .dc-columns {
    grid-template-columns: minmax(0, 1fr);
  }
  .dc-stars-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dc-steps-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dc-hero-picker-grid,
  .dc-mon-picker-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .dc-panel {
    padding: 12px;
  }
  .dc-stars-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .dc-result-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .dc-field-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .dc-hero-picker-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .dc-mon-picker-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .dc-mon-pick-card {
    padding: 6px 4px;
  }
}
</style>

<style>
.dark-mode,
.dark-theme {
  --dc-avatar-bg: rgba(34, 24, 16, 0.75);
  --dc-subcard-bg: rgba(42, 31, 21, 0.85);
  --dc-active-bg: rgba(216, 175, 86, 0.16);
  --dc-active-border: #d8af56;
  --dc-badge-bg: rgba(143, 115, 81, 0.22);
  --dc-talent-badge-bg: rgba(102, 194, 198, 0.18);
  --dc-talent-badge-color: #8fdcd9;
  --dc-crit-badge-bg: rgba(226, 90, 90, 0.2);
  --dc-crit-badge-color: #f39c9c;
  --dc-slider-accent: #d8af56;
  --dc-val-color: #7cc4ff;
  --dc-warn-color: #f0b878;
  --dc-warn-bg: rgba(216, 150, 62, 0.16);
  --dc-crit-color: #f08c7a;
  --dc-exp-color: #e2b86b;
  --dc-elem-fire-bg: rgba(220, 38, 38, 0.22);
  --dc-elem-fire-fg: #f87171;
  --dc-elem-water-bg: rgba(2, 132, 199, 0.22);
  --dc-elem-water-fg: #38bdf8;
  --dc-elem-wind-bg: rgba(16, 149, 106, 0.22);
  --dc-elem-wind-fg: #34d399;
  --dc-elem-earth-bg: rgba(180, 83, 9, 0.22);
  --dc-elem-earth-fg: #fbbf24;
}
</style>
