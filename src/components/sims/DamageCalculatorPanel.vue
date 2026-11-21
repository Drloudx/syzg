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
                · 基础攻速：<strong>{{ (selectedHero.baseAtkSpeed || 0.7).toFixed(2) }} 次/秒</strong>
              </div>
            </div>
          </div>

          <div class="dc-hero-actions">
            <UiButton size="sm" @click="heroPickerOpen = true">切换角色</UiButton>
            <UiButton size="sm" variant="ghost" @click="showPresetsDrawer = !showPresetsDrawer">
              预设存档<template v-if="savedPresets.length"> ({{ savedPresets.length }})</template>
            </UiButton>
            <UiButton size="sm" variant="ghost" @click="resetInputs">重置面板</UiButton>
          </div>
        </div>

        <!-- 本地预设存档与配置导入导出栏 -->
        <div v-if="showPresetsDrawer" class="dc-presets-drawer">
          <div class="dc-presets-row">
            <input
              v-model="presetNameInput"
              type="text"
              maxlength="28"
              placeholder="输入配置名称（如：奇瓦50级火队）"
              class="dc-input dc-preset-name-input"
            />
            <button type="button" class="dc-mini-btn is-active" @click="saveCurrentPreset">保存当前方案</button>
            <button type="button" class="dc-mini-btn" @click="copyShareUrl">{{ shareUrlNotice || '复制分享链接' }}</button>
            <button type="button" class="dc-mini-btn" @click="copyShareCode">{{ shareNotice || '复制短码' }}</button>
            <button type="button" class="dc-mini-btn" @click="showShareImport = !showShareImport">
              {{ showShareImport ? '收起导入' : '导入配置' }}
            </button>
          </div>
          <div v-if="showShareImport" class="dc-presets-row">
            <input
              v-model="shareCodeInput"
              type="text"
              placeholder="粘贴分享链接或 DC2/DC1 短码..."
              class="dc-input dc-preset-name-input"
            />
            <button type="button" class="dc-mini-btn is-active" @click="importShareCode">应用配置</button>
            <span v-if="shareImportError" class="dc-preset-error">{{ shareImportError }}</span>
          </div>
          <div v-if="savedPresets.length" class="dc-presets-list">
            <div v-for="p in savedPresets" :key="p.id" class="dc-preset-chip">
              <button type="button" class="dc-preset-load-btn" @click="applySavedPreset(p)">
                {{ p.name }} · {{ p.heroName }}
              </button>
              <button type="button" class="dc-preset-del-btn" title="删除此预设" @click="deleteSavedPreset(p.id)">×</button>
            </div>
          </div>
          <div v-else class="dc-effect-group-tip">
            暂无本地预设；点击「保存当前方案」即可把当前角色、星阶、面板、怪物与特效保存到本机浏览器。
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
                'is-inspected': inspectedStarId === st.id,
                'is-dim': st.effectKind !== 'combat' || !isStarCurrentlyApplicable(st),
              }"
            >
              <div class="dc-star-head-bar">
                <button
                  type="button"
                  class="dc-star-head-inspect"
                  :title="`点击查看详情：${currentStarEntry(st)?.des || st.label}`"
                  @click="inspectStarSkill(st)"
                >
                  <span class="dc-star-slot">{{ st.slot }}星</span>
                  <span class="dc-star-name">{{ st.name }}</span>
                </button>
                <button
                  type="button"
                  class="dc-star-enable-btn"
                  :class="{ 'is-enabled': (starSelection.starLevels[st.id] || 0) > 0 }"
                  :aria-pressed="(starSelection.starLevels[st.id] || 0) > 0"
                  @click.stop="toggleStarSkill(st)"
                >{{ (starSelection.starLevels[st.id] || 0) > 0 ? '已启用' : '启用' }}</button>
              </div>
              <button
                type="button"
                class="dc-star-main"
                :title="`点击查看详情：${currentStarEntry(st)?.des || st.label}`"
                @click="inspectStarSkill(st)"
              >
                <img
                  v-if="st.icon"
                  :src="skillIconUrl(st.icon)"
                  :alt="st.name"
                  class="dc-star-icon"
                  @error="onImgError"
                />
                <div class="dc-star-copy">
                  <div class="dc-star-badge">
                    <template v-if="st.effectKind === 'combat'">
                      {{ currentStarEntry(st)?.badge || st.label }}
                    </template>
                    <template v-else>
                      {{ starPreviewText(st) }}
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

          <!-- 命座属性说明栏（点击卡片后展开显示完整数值，再次点击卡片或点「收起」关闭） -->
          <div v-if="inspectedStar" class="dc-skill-detail-box dc-star-detail-box">
            <div class="dc-star-detail-head">
              <div class="dc-star-detail-title">
                <span class="dc-star-slot">{{ inspectedStar.slot }}星</span>
                <strong>{{ inspectedStar.name }}</strong>
                <span
                  class="dc-star-status"
                  :class="`is-${inspectedStar.effectKind}`"
                >
                  <template v-if="inspectedStar.effectKind === 'combat'">已接入战斗计算</template>
                  <template v-else-if="inspectedStar.effectKind === 'panelStatic'">面板已含（不重复叠）</template>
                  <template v-else>机制/生存向说明</template>
                </span>
              </div>
              <button
                type="button"
                class="dc-mini-btn"
                @click="inspectedStarId = ''"
              >收起</button>
            </div>
            <p class="dc-star-desc" v-html="formatSkillDes(inspectedStarEntry?.des)"></p>
          </div>
        </div>
      </div>

      <!-- 2. 实时计算结果与八步拆解（置顶紧随技能选择，改面板时同屏可见跳字） -->
      <div class="dc-panel paper-panel dc-result-card">
        <div class="dc-card-head">
          <div class="dc-effects-head-title">
            <h4 class="dc-card-title">结算伤害结果</h4>
            <span v-if="!hasDamageSegments && primarySummon" class="dc-crit-summary">
              召唤物暴击率：<strong>{{ Math.round(primarySummon.critChance * 1000) / 10 }}%</strong>
              · 暴伤 {{ primarySummon.critDam }}%（取召唤物配置）
            </span>
            <span v-else class="dc-crit-summary">
              有效暴击率：<strong>{{ Math.round(calcResult.critChance * 1000) / 10 }}%</strong>
              <template v-if="!calcResult.allowCrit">（当前技能默认不可暴击）</template>
            </span>
          </div>
          <div class="dc-target-actions">
            <button
              type="button"
              class="dc-mini-btn"
              :class="{ 'is-active': Boolean(benchmarkA) }"
              @click="lockBenchmarkA"
            >{{ benchmarkA ? '更新基准 A' : '设为对比基准 A' }}</button>
            <button
              v-if="benchmarkA"
              type="button"
              class="dc-mini-btn"
              @click="clearBenchmarkA"
            >取消对比</button>
          </div>
        </div>

        <div v-if="benchmarkA" class="dc-benchmark-bar">
          <span>对比基准 A：<strong>{{ benchmarkA.label }}</strong>（单发期望 {{ formatNumber(benchmarkA.expected) }} · 综合 DPS {{ formatNumber(Math.round(benchmarkA.dps)) }}/s）</span>
        </div>

        <div class="dc-result-grid">
          <template v-if="hasDamageSegments">
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
              <div v-if="expectedCompare" class="dc-delta-badge" :class="`is-${expectedCompare.direction}`">
                较 A：{{ formatDeltaText(expectedCompare) }}
              </div>
            </div>
          </template>
          <template v-else-if="activeSummons.length">
            <template v-if="activeSummons.length === 1 && primarySummon">
              <div class="dc-metric-box">
                <div class="dc-metric-label">
                  召唤单次普攻 · {{ primarySummon.name }}{{ primarySummon.count > 1 ? ` ×${primarySummon.count}` : '' }}
                </div>
                <div class="dc-metric-val">{{ formatNumber(primarySummon.singleExpected) }}</div>
                <div class="dc-metric-range">
                  不暴 {{ formatNumber(primarySummon.singleNoCrit) }} / 暴击 {{ formatNumber(primarySummon.singleCrit) }}
                </div>
              </div>

              <div class="dc-metric-box">
                <div class="dc-metric-label">
                  {{ primarySummon.durtime > 0 ? `单轮 ${primarySummon.durtime}s 总期望` : '常驻属性与加成' }}
                </div>
                <div class="dc-metric-val dc-metric-val--crit">
                  <template v-if="primarySummon.durtime > 0">{{ formatNumber(Math.round(primarySummon.singleCastExpected)) }}</template>
                  <template v-else>{{ formatNumber(Math.round(primarySummon.steadyDps)) }}<small>/s</small></template>
                </div>
                <div class="dc-metric-range">
                  继承攻 {{ Math.round(primarySummon.atkPct * 100) }}% · 自身攻速 {{ primarySummon.atkSpeed }}/s（不继承人物面板攻速）
                  <template v-if="primarySummon.summonPhyAtkPct > 0"> · 物攻 +{{ Math.round(primarySummon.summonPhyAtkPct * 100) }}%</template>
                  <template v-if="primarySummon.summonUnitAtkDamAdd > 0"> · 召唤增伤 +{{ Math.round(primarySummon.summonUnitAtkDamAdd * 100) }}%</template>
                  <template v-if="primarySummon.expiryBlastPerUnit > 0"> · 自爆 {{ formatNumber(Math.round(primarySummon.expiryBlastPerUnit)) }}/只</template>
                </div>
              </div>

              <div class="dc-metric-box dc-metric-box--accent">
                <div class="dc-metric-label">召唤物折算秒伤</div>
                <div class="dc-metric-val dc-metric-val--exp">{{ formatNumber(Math.round(primarySummon.steadyDps)) }}<small>/s</small></div>
                <div class="dc-metric-range">
                  {{ primarySummon.durtime > 0 ? `覆盖率 ${Math.round(primarySummon.uptimeRatio * 100)}%` : '常驻出战' }} · 吃圣骑士/星阶召唤加成
                </div>
              </div>
            </template>
            <template v-else>
              <div class="dc-metric-box dc-metric-box--span2">
                <div class="dc-metric-label">召唤物明细（{{ activeSummons.length }} 种单位 · 不继承人物面板攻速）</div>
                <div class="dc-summon-top-list">
                  <div v-for="sum in activeSummons" :key="sum.id" class="dc-summon-top-row">
                    <div class="dc-summon-top-name">
                      <strong>{{ sum.name }}{{ sum.count > 1 ? ` ×${sum.count}` : '' }}</strong>
                      <span class="dc-summon-top-meta">攻{{ Math.round(sum.atkPct * 100) }}% · 速{{ sum.atkSpeed }}/s</span>
                    </div>
                    <div class="dc-summon-top-vals">
                      <span>单发 <strong>{{ formatNumber(sum.singleExpected) }}</strong> <small>({{ formatNumber(sum.singleNoCrit) }}/{{ formatNumber(sum.singleCrit) }})</small></span>
                      <strong class="dc-summon-top-dps">{{ formatNumber(Math.round(sum.steadyDps)) }}/s</strong>
                    </div>
                  </div>
                </div>
                <div v-if="totalSummonUnitDamAdd > 0" class="dc-metric-range">
                  召唤物全伤加成 +{{ Math.round(totalSummonUnitDamAdd * 100) }}%
                </div>
              </div>

              <div class="dc-metric-box dc-metric-box--accent">
                <div class="dc-metric-label">召唤物合计折算秒伤</div>
                <div class="dc-metric-val dc-metric-val--exp">{{ formatNumber(Math.round(totalSummonSteadyDps)) }}<small>/s</small></div>
                <div class="dc-metric-range">
                  共 {{ totalSummonUnitCount }} 个召唤单位 · 吃圣骑士/星阶召唤加成
                </div>
              </div>
            </template>
          </template>
          <div v-else class="dc-metric-box dc-metric-box--span3">
            <UiEmptyState
              :text="selectedSkill?.isTalent
                ? '该角色被动属于机制/增益/触发型被动（无直接一段式命中倍率），可参考上方说明并填入左侧面板参数参与结算。'
                : '该技能为治疗/增益等非直接伤害技能，暂无直伤段数值。'"
            />
          </div>

          <div class="dc-metric-box dc-metric-box--dps">
            <div class="dc-metric-label">综合循环 DPS</div>
            <div class="dc-metric-val dc-metric-val--dps">{{ formatNumber(Math.round(dpsResult.totalDps)) }}<small>/s</small></div>
            <div class="dc-metric-range">
              {{ dpsResult.mode === 'auto' ? `${dpsResult.durationSec}s 自动循环` : `${dpsResult.durationSec}s 爆发轴` }}
              · 总伤 {{ formatNumber(Math.round(dpsResult.totalDamage)) }}
            </div>
            <div v-if="dpsCompare" class="dc-delta-badge" :class="`is-${dpsCompare.direction}`">
              较 A：{{ formatDeltaText(dpsCompare) }}
            </div>
          </div>
        </div>

        <!-- 持续伤害 DoT 完整跳数汇总 -->
        <div v-if="activeDotSummary?.hasDot" class="dc-dot-summary-bar">
          <div class="dc-dot-summary-head">
            <span class="dc-skill-badge is-dot">持续伤害 DoT（共 {{ activeDotSummary.totalTicks }} 跳）</span>
            <span class="dc-dot-summary-text">{{ activeDotSummary.summaryLabel }}</span>
          </div>
          <div class="dc-dot-summary-nums">
            <span>完整持续总伤期望：<strong>{{ formatNumber(Math.round(activeDotSummary.fullExpected)) }}</strong></span>
            <template v-for="ed in activeDotSummary.extraDotResults" :key="ed.name">
              <span>{{ ed.name }}：{{ formatNumber(ed.singleExpected) }}/跳 × {{ ed.ticks }} 跳 = <strong>{{ formatNumber(ed.totalExpected) }}</strong></span>
            </template>
          </div>
        </div>

        <!-- 召唤物独立输出结算（仅兼具直伤+召唤的混合技能在下方补充列出；纯召唤技能已置顶） -->
        <div v-if="hasDamageSegments && activeSummons.length" class="dc-summons-wrap">
          <div class="dc-sub-title">召唤物独立输出（按源码继承攻防生命，暴击/攻速取召唤物配置，吃圣骑士/对应星阶召唤加成）</div>
          <div class="dc-summons-grid">
            <div v-for="sum in activeSummons" :key="sum.id" class="dc-summon-item">
              <div class="dc-summon-head">
                <strong>{{ sum.name }}{{ sum.count > 1 ? ` ×${sum.count}` : '' }}</strong>
                <span class="dc-skill-badge is-summon">继承攻击 {{ Math.round(sum.atkPct * 100) }}%</span>
                <span class="dc-effect-group-tip">
                  攻速 {{ sum.atkSpeed }}/s · 暴击 {{ sum.crit }}% · 暴伤 {{ sum.critDam }}%
                  <template v-if="sum.summonUnitAtkDamAdd > 0"> · 召唤增伤 +{{ Math.round(sum.summonUnitAtkDamAdd * 100) }}%</template>
                </span>
              </div>
              <div class="dc-summon-nums">
                <span>单次普攻期望 <strong>{{ formatNumber(sum.singleExpected) }}</strong>（不暴 {{ formatNumber(sum.singleNoCrit) }} / 暴 {{ formatNumber(sum.singleCrit) }}）</span>
                <span>
                  <template v-if="sum.durtime > 0">存在 {{ sum.durtime }}s 总期望 <strong>{{ formatNumber(Math.round(sum.singleCastExpected)) }}</strong> · 覆盖率 {{ Math.round(sum.uptimeRatio * 100) }}%</template>
                  <template v-else>常驻召唤物</template>
                  · 折算秒伤 <strong>{{ formatNumber(Math.round(sum.steadyDps)) }}/s</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

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
                <template v-if="(activeDotSummary?.tickBreakdown?.[sIdx]?.factor || 1) > 1">
                  · ×{{ activeDotSummary.tickBreakdown[sIdx].ticks }}跳<template v-if="activeDotSummary.tickBreakdown[sIdx].stacks > 1">×{{ activeDotSummary.tickBreakdown[sIdx].stacks }}层</template>
                </template>
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
          <div v-if="showSteps && calcResult.segments.length > 1" class="dc-steps-seg-tabs">
            <button
              v-for="(seg, idx) in calcResult.segments"
              :key="`step-tab-${idx}`"
              type="button"
              class="dc-mini-btn"
              :class="{ 'is-active': selectedStepSegIndex === idx }"
              @click="selectedStepSegIndex = idx"
            >
              第 {{ idx + 1 }} 段（{{ seg.damageType === 'magicAtk' ? '魔' : '物' }}<template v-if="seg.elementType !== 'none'">·{{ ELEMENT_LABELS[seg.elementType] }}</template>）
            </button>
          </div>
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
              <strong>{{ round2(activeStepSegment && activeStepSegment.critChance > 0 ? firstSegmentSteps.X3Crit : firstSegmentSteps.X3NoCrit) }}</strong>
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
              <strong>{{ activeStepSegment?.noCrit.mid ?? 0 }} / {{ activeStepSegment?.crit.mid ?? 0 }}</strong>
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
            <span class="dc-card-tip">上方 8 项直接照抄游戏内角色面板</span>
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
            <label
              class="dc-field"
              title="游戏内面板「攻速加成」，影响普攻 DPS；源码上限 +300%（最多基础攻速的 4 倍）"
            >
              <span>攻速加成 (%)</span>
              <input v-model.number="atk.atkSpeedAddPct" type="number" step="5" max="300" class="dc-input" />
            </label>
            <label
              class="dc-field"
              title="游戏内面板「冷却缩减」，缩短主动技能 CD；源码上限 50%"
            >
              <span>冷却缩减 (%)</span>
              <input v-model.number="atk.coolDownPct" type="number" step="1" max="50" class="dc-input" />
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

      <!-- 5. 通用 DPS 输出循环、伤害占比拆解与词条边际收益 -->
      <div class="dc-panel paper-panel dc-dps-card">
        <div class="dc-card-head">
          <div class="dc-effects-head-title">
            <h4 class="dc-card-title">DPS 输出循环与词条收益分析</h4>
            <span class="dc-effect-count-badge">
              综合 DPS {{ formatNumber(Math.round(dpsResult.totalDps)) }}/s
            </span>
          </div>
          <div class="dc-target-actions">
            <button
              type="button"
              class="dc-mini-btn"
              :class="{ 'is-active': rotationConfig.mode === 'auto' }"
              @click="rotationConfig.mode = 'auto'"
            >自动木桩循环</button>
            <button
              type="button"
              class="dc-mini-btn"
              :class="{ 'is-active': rotationConfig.mode === 'custom' }"
              @click="rotationConfig.mode = 'custom'"
            >自定义爆发轴</button>
            <button
              type="button"
              class="dc-mini-btn"
              @click="showDpsPanel = !showDpsPanel"
            >{{ showDpsPanel ? '收起配置' : '展开配置' }}</button>
          </div>
        </div>

        <div v-if="showDpsPanel" class="dc-dps-body">
          <div class="dc-dps-toolbar">
            <template v-if="rotationConfig.mode === 'auto'">
              <div class="dc-dps-ctl-group">
                <span class="dc-dps-ctl-label">统计时长：</span>
                <button
                  v-for="sec in [15, 30, 60, 120]"
                  :key="sec"
                  type="button"
                  class="dc-mini-btn"
                  :class="{ 'is-active': rotationConfig.durationSec === sec }"
                  @click="rotationConfig.durationSec = sec"
                >{{ sec }}s</button>
              </div>
              <label class="dc-inline-ctl">
                <span>单次放技能损普攻 (s)</span>
                <input
                  v-model.number="rotationConfig.skillCastLossSec"
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  class="dc-mini-num"
                />
              </label>
            </template>
            <template v-else>
              <label class="dc-inline-ctl">
                <span>爆发轴总耗时 (s)</span>
                <input
                  v-model.number="rotationConfig.durationSec"
                  type="number"
                  step="1"
                  min="1"
                  max="300"
                  class="dc-mini-num"
                />
              </label>
            </template>

            <div class="dc-dps-speed-pills">
              <span class="dc-effect-summary-chip">
                有效攻速 {{ dpsResult.atkSpeedInfo.effectiveAtkSpeed.toFixed(2) }} 次/秒
                <template v-if="dpsResult.atkSpeedInfo.isCapped">（+300%上限）</template>
              </span>
              <span class="dc-effect-summary-chip">
                冷却缩减 {{ dpsResult.coolDownInfo.cappedCoolDownPct }}%
                <template v-if="dpsResult.coolDownInfo.isCapped">（50%上限）</template>
              </span>
            </div>
          </div>

          <!-- 伤害来源占比条 -->
          <div v-if="dpsResult.totalDamage > 0" class="dc-dps-share-wrap">
            <div class="dc-dps-share-bar">
              <div
                v-for="entry in dpsResult.entries.filter((e) => e.totalDamage > 0)"
                :key="`bar-${entry.id}`"
                class="dc-dps-share-seg"
                :class="`is-${entry.category}`"
                :style="{ width: `${Math.max(2, entry.sharePct)}%` }"
                :title="`${entry.name}：${entry.sharePct.toFixed(1)}%`"
              />
            </div>
            <div class="dc-dps-share-legend">
              <span v-if="dpsResult.normalDps > 0" class="dc-legend-item is-normal">
                <i />普攻 {{ ((dpsResult.normalDps / dpsResult.totalDps) * 100).toFixed(1) }}%（{{ formatNumber(Math.round(dpsResult.normalDps)) }}/s）
              </span>
              <span v-if="dpsResult.skillDps > 0" class="dc-legend-item is-skill">
                <i />主动技能 {{ ((dpsResult.skillDps / dpsResult.totalDps) * 100).toFixed(1) }}%（{{ formatNumber(Math.round(dpsResult.skillDps)) }}/s）
              </span>
              <span v-if="dpsResult.talentDps > 0" class="dc-legend-item is-talent">
                <i />被动触发 {{ ((dpsResult.talentDps / dpsResult.totalDps) * 100).toFixed(1) }}%（{{ formatNumber(Math.round(dpsResult.talentDps)) }}/s）
              </span>
              <span v-if="dpsResult.summonDps > 0" class="dc-legend-item is-summon">
                <i />召唤物 {{ ((dpsResult.summonDps / dpsResult.totalDps) * 100).toFixed(1) }}%（{{ formatNumber(Math.round(dpsResult.summonDps)) }}/s）
              </span>
            </div>
          </div>

          <!-- 各技能循环明细 -->
          <div class="dc-dps-table">
            <div
              v-for="entry in dpsResult.entries"
              :key="`dps-${entry.id}`"
              class="dc-dps-row"
              :class="{ 'is-disabled': !entry.enabled }"
            >
              <label class="dc-dps-row-check">
                <input
                  type="checkbox"
                  :checked="entry.enabled"
                  :disabled="!entry.hasDamage"
                  @change="setAbilityEnabled(entry.id, $event.target.checked)"
                />
                <span class="dc-dps-row-name">{{ entry.name }}</span>
                <span
                  class="dc-skill-badge"
                  :class="{
                    'is-talent': entry.category === 'talent',
                    'is-summon': entry.category === 'summon',
                  }"
                >
                  {{ entry.category === 'normal' ? '普攻' : (entry.category === 'talent' ? '被动' : (entry.category === 'summon' ? '召唤物' : `Lv.${entry.level}`)) }}
                </span>
                <span v-if="entry.hasDot" class="dc-skill-badge is-dot">含DoT {{ entry.dotTicks }}跳</span>
              </label>

              <div v-if="entry.hasDamage" class="dc-dps-row-meta">
                <span>{{ entry.category === 'summon' ? '单下期望' : (entry.hasDot ? '单轮总期望' : '单次期望') }} <strong>{{ formatNumber(Math.round(entry.singleExpected)) }}</strong></span>
                <span v-if="entry.category === 'normal'">间隔 {{ entry.intervalSec.toFixed(2) }}s</span>
                <span v-else-if="entry.category === 'summon'">
                  攻速 {{ entry.atkSpeed }}/s · <template v-if="entry.durtime > 0">覆盖 {{ Math.round(entry.uptimeRatio * 100) }}%</template><template v-else>常驻</template>
                </span>
                <span v-else-if="entry.category === 'skill'">
                  CD {{ entry.effectiveCd.toFixed(1) }}s<template v-if="entry.effectiveCd !== entry.baseCd">（原{{ entry.baseCd }}s）</template>
                </span>
                <label v-else-if="entry.category === 'talent' && entry.baseCd <= 0 && rotationConfig.mode === 'auto'" class="dc-inline-ctl">
                  <span>触发间隔(s)</span>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    :value="getAbilityInterval(entry)"
                    class="dc-mini-num"
                    @input="setAbilityInterval(entry.id, $event.target.value)"
                  />
                </label>
                <span v-else-if="entry.category === 'talent'">CD {{ entry.intervalSec.toFixed(1) }}s</span>

                <template v-if="rotationConfig.mode === 'auto'">
                  <span>期望 {{ entry.casts.toFixed(1) }} {{ entry.category === 'summon' ? '击' : '次' }}</span>
                </template>
                <label v-else-if="entry.category !== 'summon'" class="dc-inline-ctl">
                  <span>次数</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    :value="getAbilityCustomCasts(entry)"
                    class="dc-mini-num"
                    @input="setAbilityCustomCasts(entry.id, $event.target.value)"
                  />
                </label>
                <span v-else>累计 {{ entry.casts.toFixed(0) }} 击</span>

                <span class="dc-dps-row-val">
                  <strong>{{ formatNumber(Math.round(entry.dps)) }}</strong>/s
                  <small>（{{ entry.sharePct.toFixed(1) }}%）</small>
                </span>
              </div>
              <div v-else class="dc-dps-row-meta">
                <span class="dc-effect-group-tip">非直接伤害技能，不计入循环直伤</span>
              </div>
            </div>
          </div>

          <!-- 词条边际收益权重榜 -->
          <div class="dc-weights-box">
            <button type="button" class="dc-collapse-btn" @click="showStatWeights = !showStatWeights">
              <span>{{ showStatWeights ? '收起词条边际收益分析 ▲' : '展开词条边际收益分析（查看当前最缺哪条属性）▼' }}</span>
            </button>
            <div v-if="showStatWeights && rotationConfig.mode === 'custom'" class="dc-caveat-bar">
              自定义爆发轴模式按固定手填次数结算，因此「+10% 冷却缩减」不折算额外释放次数（显示 +0.00%）；如需评估冷缩收益，请切换上方「自动木桩循环」。
            </div>
            <div v-if="showStatWeights" class="dc-weights-grid">
              <div
                v-for="w in statWeights"
                :key="w.key"
                class="dc-weight-row"
              >
                <span class="dc-weight-label">{{ w.label }}</span>
                <div class="dc-weight-bar-track">
                  <div
                    class="dc-weight-bar-fill"
                    :style="{ width: `${maxWeightPct > 0 ? Math.max(0, (w.diffPct / maxWeightPct) * 100) : 0}%` }"
                  />
                </div>
                <span class="dc-weight-pct">+{{ w.diffPct.toFixed(2) }}%</span>
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
import { useRoute } from 'vue-router'
import { getImageUrl } from '../../utils/env'
import { fetchWithFallback } from '../../utils/request'
import { aggregateDamageEffects, isEffectApplicable } from '../../utils/damageEffects'
import { calculateHeroStarEffects } from '../../utils/heroStarsDamage'
import {
  DEFAULT_PASSIVE_INTERVAL_SEC,
  DEFAULT_ROTATION_DURATION_SEC,
  DEFAULT_SKILL_CAST_LOSS_SEC,
  calculateDpsStatWeights,
  calculateHeroDpsRotation,
  compareAgainstBaseline,
  decodeSharePayload,
  encodeCompactShareCode,
  evaluateHeroAbility,
} from '../../utils/damageDps'
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
const selectedStepSegIndex = ref(0)
const showDpsPanel = ref(true)
const showStatWeights = ref(false)
const showPresetsDrawer = ref(false)
const showShareImport = ref(false)

const PRESETS_STORAGE_KEY = 'myrzg_damage_presets_v1'
const savedPresets = ref(loadSavedPresetsFromStorage())
const presetNameInput = ref('')
const shareCodeInput = ref('')
const shareImportError = ref('')
const shareNotice = ref('')
const shareUrlNotice = ref('')
const benchmarkA = ref(null)

const skillLevelMap = reactive({})
const rotationConfig = reactive({
  mode: 'auto',
  durationSec: DEFAULT_ROTATION_DURATION_SEC,
  skillCastLossSec: DEFAULT_SKILL_CAST_LOSS_SEC,
  abilities: {},
})

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
  atkSpeedAddPct: 0,
  coolDownPct: 0,
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

const inspectedStarId = ref('')

const inspectedStar = computed(() => {
  if (!inspectedStarId.value) return null
  const stars = selectedHero.value?.starSkills || []
  return stars.find((s) => s.id === inspectedStarId.value) || null
})

const inspectedStarEntry = computed(() => (
  inspectedStar.value ? currentStarEntry(inspectedStar.value) : null
))

function inspectStarSkill(st) {
  if (!st?.id) return
  inspectedStarId.value = inspectedStarId.value === st.id ? '' : st.id
}

function starPreviewText(st) {
  const des = String(currentStarEntry(st)?.des || '').trim()
  if (st.effectKind === 'panelStatic') {
    const brief = des.replace(/^[^，。]*?(?:使|令|的)?/, '').replace(/[。]$/, '')
    const short = brief.length > 18 ? `${brief.slice(0, 18)}…` : brief
    return short ? `面板已含 · ${short}` : '面板已含（不重复叠加）'
  }
  if (!des) return '机制/生存向（不影响直伤）'
  return des.length > 24 ? `${des.slice(0, 24)}…` : des
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
  const savedIdx = skillLevelMap[sk.id]
  const maxIdx = Math.max(0, (sk.levels?.length || 1) - 1)
  selectedSkillLevelIndex.value = Number.isInteger(savedIdx)
    ? Math.max(0, Math.min(maxIdx, savedIdx))
    : maxIdx
}

watch(selectedSkillLevelIndex, (lv) => {
  const sk = selectedSkill.value
  if (sk?.id) skillLevelMap[sk.id] = lv
})

function selectSkill(idx) {
  selectedSkillIndex.value = idx
  syncSkillDefaults()
}

function resetRotationForHero() {
  Object.keys(skillLevelMap).forEach((k) => { delete skillLevelMap[k] })
  Object.keys(rotationConfig.abilities).forEach((k) => { delete rotationConfig.abilities[k] })
}

function pickHero(h) {
  selectedHero.value = h
  selectedSkillIndex.value = 0
  inspectedStarId.value = ''
  resetStars()
  resetRotationForHero()
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
  atk.normalAtkPhyPenPct = 0
  atk.normalAtkMagPenPct = 0
  atk.atkSpeedAddPct = 0
  atk.coolDownPct = 0
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
  rotationConfig.mode = 'auto'
  rotationConfig.durationSec = DEFAULT_ROTATION_DURATION_SEC
  rotationConfig.skillCastLossSec = DEFAULT_SKILL_CAST_LOSS_SEC
  resetRotationForHero()
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

const activeEffects = computed(() => aggregateDamageEffects(effectsCatalog.value, effectState, effectContext.value))

const evaluatedActive = computed(() => evaluateHeroAbility({
  hero: selectedHero.value,
  skill: selectedSkill.value,
  levelIndex: selectedSkillLevelIndex.value,
  atk,
  tgt,
  effectsCatalog: effectsCatalog.value,
  effectState,
  starSelection,
  allowCritOverride: allowCritOverride.value,
  needFloatOverride: needFloatOverride.value,
}))

const effectiveSkill = computed(() => evaluatedActive.value.skill || selectedSkill.value)
const calcResult = computed(() => evaluatedActive.value.result)
const activeDotSummary = computed(() => evaluatedActive.value.dotSummary || null)
const activeSummons = computed(() => evaluatedActive.value.summonResults || [])
const primarySummon = computed(() => activeSummons.value[0] || null)
const totalSummonSteadyDps = computed(() => activeSummons.value.reduce((s, item) => s + (item.steadyDps || 0), 0))
const totalSummonUnitCount = computed(() => activeSummons.value.reduce((s, item) => s + (item.count || 0), 0))
const totalSummonUnitDamAdd = computed(() => Number(primarySummon.value?.summonUnitAtkDamAdd || 0))

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
  if (s.extraDots?.length) chips.push(`星阶附加 ${s.extraDots.length} 项持续伤害`)
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
  const sumUnitDam = (e.summonUnitAtkDamAdd || 0) + (s.summonMods?.summonUnitAtkDamAdd || 0)
  if (sumUnitDam) chips.push(`召唤物全伤 +${pct(sumUnitDam)}`)
  if (s.summonMods?.summonPhyAtkPct) chips.push(`召唤物物攻 +${pct(s.summonMods.summonPhyAtkPct)}`)
  if (s.summonMods?.summonAtkSpeedPct) chips.push(`召唤物攻速 +${s.summonMods.summonAtkSpeedPct}%`)
  if (s.summonMods?.summonInheritAtkAdd) chips.push(`召唤额外继承 +${pct(s.summonMods.summonInheritAtkAdd)}`)
  if (s.summonMods?.summonDurtimeAdd) chips.push(`召唤延长 +${s.summonMods.summonDurtimeAdd}s`)
  if (s.summonMods?.summonExtraCount) chips.push(`额外召唤 +${s.summonMods.summonExtraCount} 只`)
  if (s.summonMods?.expiryBlasts?.length) chips.push(`退场自爆 ${Math.round((s.summonMods.expiryBlasts[0].multiplier || 0) * 100)}%`)
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

const dpsResult = computed(() => calculateHeroDpsRotation({
  hero: selectedHero.value,
  atk,
  tgt,
  effectsCatalog: effectsCatalog.value,
  effectState,
  starSelection,
  skillLevelMap,
  rotationConfig,
}))

const statWeights = computed(() => {
  if (!showStatWeights.value) return []
  return calculateDpsStatWeights({
    hero: selectedHero.value,
    atk,
    tgt,
    effectsCatalog: effectsCatalog.value,
    effectState,
    starSelection,
    skillLevelMap,
    rotationConfig,
  })
})

const maxWeightPct = computed(() => {
  const vals = statWeights.value.map((w) => w.diffPct)
  return vals.length ? Math.max(...vals, 0) : 0
})

const expectedCompare = computed(() => (benchmarkA.value
  ? compareAgainstBaseline(calcResult.value.expected, benchmarkA.value.expected)
  : null))

const dpsCompare = computed(() => (benchmarkA.value
  ? compareAgainstBaseline(dpsResult.value.totalDps, benchmarkA.value.dps)
  : null))

function lockBenchmarkA() {
  const heroName = selectedHero.value?.name || '方案'
  const skillName = selectedSkill.value?.name || ''
  benchmarkA.value = {
    label: skillName ? `${heroName} · ${skillName}` : heroName,
    expected: calcResult.value.expected,
    dps: dpsResult.value.totalDps,
  }
}

function clearBenchmarkA() {
  benchmarkA.value = null
}

function formatDeltaText(cmp) {
  if (!cmp) return ''
  const sign = cmp.diff > 0 ? '+' : ''
  return `${sign}${formatNumber(Math.round(cmp.diff))} (${sign}${cmp.diffPct.toFixed(1)}%)`
}

function ensureAbilityCfg(skillId) {
  if (!rotationConfig.abilities[skillId]) {
    rotationConfig.abilities[skillId] = {}
  }
  return rotationConfig.abilities[skillId]
}

function setAbilityEnabled(skillId, enabled) {
  ensureAbilityCfg(skillId).enabled = Boolean(enabled)
}

function getAbilityInterval(entry) {
  return Number(rotationConfig.abilities[entry.id]?.intervalSec ?? entry.intervalSec ?? DEFAULT_PASSIVE_INTERVAL_SEC)
}

function setAbilityInterval(skillId, val) {
  const n = Math.max(0.5, Number(val) || DEFAULT_PASSIVE_INTERVAL_SEC)
  ensureAbilityCfg(skillId).intervalSec = n
}

function getAbilityCustomCasts(entry) {
  return Number(rotationConfig.abilities[entry.id]?.customCasts ?? (entry.category === 'normal' ? 10 : 1))
}

function setAbilityCustomCasts(skillId, val) {
  const n = Math.max(0, Math.round(Number(val) || 0))
  ensureAbilityCfg(skillId).customCasts = n
}

function loadSavedPresetsFromStorage() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PRESETS_STORAGE_KEY) : null
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistSavedPresets(list) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(list))
    }
  } catch {
    // 忽略无痕/配额异常
  }
}

function buildSnapshotPayload(name = '') {
  return {
    v: 1,
    name: String(name || `${selectedHero.value?.name || '方案'} Lv.${atk.level}`),
    heroId: selectedHero.value?.id || '',
    heroName: selectedHero.value?.name || '',
    skillIndex: selectedSkillIndex.value,
    skillLevelMap: { ...skillLevelMap },
    monsterId: selectedMonster.value?.id || '',
    presetMonLevel: presetMonLevel.value,
    atk: JSON.parse(JSON.stringify(atk)),
    tgt: JSON.parse(JSON.stringify(tgt)),
    starSelection: JSON.parse(JSON.stringify(starSelection)),
    effectState: JSON.parse(JSON.stringify(effectState)),
    rotationConfig: JSON.parse(JSON.stringify(rotationConfig)),
  }
}

function applySnapshotPayload(snap) {
  if (!snap || typeof snap !== 'object') return false
  const hero = heroes.value.find((h) => h.id === snap.heroId)
  if (!hero) return false
  selectedHero.value = hero
  resetStars()
  resetRotationForHero()

  if (snap.atk) Object.assign(atk, snap.atk)
  if (snap.atk?.unitElemDamAddPct) {
    Object.assign(atk.unitElemDamAddPct, snap.atk.unitElemDamAddPct)
  }
  if (snap.tgt) Object.assign(tgt, snap.tgt)
  if (snap.starSelection?.starLevels) Object.assign(starSelection.starLevels, snap.starSelection.starLevels)
  if (snap.starSelection?.starStacks) Object.assign(starSelection.starStacks, snap.starSelection.starStacks)
  if (snap.effectState) {
    resetEffects()
    effectState.petId = snap.effectState.petId || ''
    effectState.petLevel = snap.effectState.petLevel || 7
    effectState.petStacks = snap.effectState.petStacks || 1
    effectState.petSynergy = Boolean(snap.effectState.petSynergy)
    if (Array.isArray(snap.effectState.suitIds)) effectState.suitIds.push(...snap.effectState.suitIds)
    if (snap.effectState.suitStacks) Object.assign(effectState.suitStacks, snap.effectState.suitStacks)
    if (Array.isArray(snap.effectState.equipIds)) effectState.equipIds.push(...snap.effectState.equipIds)
    if (snap.effectState.equipStacks) Object.assign(effectState.equipStacks, snap.effectState.equipStacks)
  }
  if (snap.skillLevelMap) Object.assign(skillLevelMap, snap.skillLevelMap)
  if (snap.rotationConfig) {
    rotationConfig.mode = snap.rotationConfig.mode === 'custom' ? 'custom' : 'auto'
    rotationConfig.durationSec = Number(snap.rotationConfig.durationSec) || DEFAULT_ROTATION_DURATION_SEC
    rotationConfig.skillCastLossSec = Number(snap.rotationConfig.skillCastLossSec ?? DEFAULT_SKILL_CAST_LOSS_SEC)
    if (snap.rotationConfig.abilities) Object.assign(rotationConfig.abilities, snap.rotationConfig.abilities)
  }

  const mon = snap.monsterId ? monsters.value.find((m) => m.id === snap.monsterId) : null
  selectedMonster.value = mon || null
  if (snap.presetMonLevel) presetMonLevel.value = clampPresetLevel(snap.presetMonLevel)
  const maxSkillIdx = Math.max(0, heroAbilities.value.length - 1)
  selectedSkillIndex.value = Math.max(0, Math.min(maxSkillIdx, Number(snap.skillIndex) || 0))
  syncSkillDefaults()
  return true
}

function saveCurrentPreset() {
  if (!selectedHero.value) return
  const label = presetNameInput.value.trim() || `${selectedHero.value.name} Lv.${atk.level}`
  const snap = {
    ...buildSnapshotPayload(label),
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  }
  const next = [snap, ...savedPresets.value.filter((p) => p.name !== label)].slice(0, 20)
  savedPresets.value = next
  persistSavedPresets(next)
  presetNameInput.value = ''
}

function applySavedPreset(preset) {
  applySnapshotPayload(preset)
}

function deleteSavedPreset(id) {
  const next = savedPresets.value.filter((p) => p.id !== id)
  savedPresets.value = next
  persistSavedPresets(next)
}

function buildShareUrl(code) {
  if (typeof window === 'undefined') return code
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#/sims?tab=damage&c=${encodeURIComponent(code)}`
}

async function copyTextSafe(text, noticeRef) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      noticeRef.value = '已复制!'
      setTimeout(() => { noticeRef.value = '' }, 1800)
      return true
    }
  } catch {
    // 回退到输入框展示
  }
  shareCodeInput.value = text
  showShareImport.value = true
  return false
}

async function copyShareCode() {
  const code = encodeCompactShareCode(buildSnapshotPayload())
  await copyTextSafe(code, shareNotice)
}

async function copyShareUrl() {
  const code = encodeCompactShareCode(buildSnapshotPayload())
  const url = buildShareUrl(code)
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    try {
      window.history.replaceState(null, '', `#/sims?tab=damage&c=${encodeURIComponent(code)}`)
    } catch {
      // 忽略部分只读宿主
    }
  }
  await copyTextSafe(url, shareUrlNotice)
}

function extractShareTokenFromInput(raw) {
  const text = String(raw || '').trim()
  if (text.includes('c=')) {
    const q = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text
    const param = new URLSearchParams(q).get('c')
    if (param) return param
  }
  return text
}

function importShareCode() {
  shareImportError.value = ''
  try {
    const token = extractShareTokenFromInput(shareCodeInput.value)
    const parsed = decodeSharePayload(token)
    if (!applySnapshotPayload(parsed)) {
      shareImportError.value = '配置码角色不存在或格式无效'
      return
    }
    shareCodeInput.value = ''
    showShareImport.value = false
  } catch {
    shareImportError.value = '配置码解析失败，请确认粘贴完整'
  }
}

watch(() => calcResult.value.segments.length, (len) => {
  if (selectedStepSegIndex.value >= len) selectedStepSegIndex.value = 0
})

const activeStepSegment = computed(() =>
  calcResult.value.segments?.[selectedStepSegIndex.value] || calcResult.value.segments?.[0] || null,
)
const firstSegmentSteps = computed(() => activeStepSegment.value?.steps || null)

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

const route = useRoute()

function applyUrlShareToken(rawToken) {
  if (!rawToken || !heroes.value.length) return false
  try {
    const parsed = decodeSharePayload(String(rawToken))
    return applySnapshotPayload(parsed)
  } catch {
    return false
  }
}

watch(() => route.query.c, (token) => {
  if (token) applyUrlShareToken(token)
})

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchWithFallback('data/parsed/damage-calc.json')
    heroes.value = data.heroes || []
    monsters.value = data.monsters || []
    levelStrength.value = data.levelStrength || {}
    effectsCatalog.value = data.effects || { pets: [], suits: [], equips: [] }
    const hashQuery = typeof window !== 'undefined' && window.location.hash.includes('?')
      ? new URLSearchParams(window.location.hash.split('?')[1] || '').get('c')
      : ''
    const urlToken = route.query.c || hashQuery
    const restoredFromUrl = urlToken ? applyUrlShareToken(urlToken) : false
    if (!restoredFromUrl && !selectedHero.value && heroes.value.length) {
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

.dc-skill-desc,
.dc-star-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-main);
}

.dc-skill-desc :deep(.dc-des-val),
.dc-star-desc :deep(.dc-des-val) {
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.dc-metric-box--span2 {
  grid-column: span 2;
}

.dc-metric-box--span3 {
  grid-column: span 3;
}

.dc-metric-box--accent {
  border-color: var(--dc-active-border, #c69234);
  background: var(--dc-active-bg, rgba(198, 146, 52, 0.12));
}

.dc-metric-box--dps {
  border-color: var(--dc-dps-border, #2b7a78);
  background: var(--dc-dps-bg, rgba(43, 122, 120, 0.1));
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

.dc-metric-val small {
  font-size: 13px;
  font-weight: 700;
  margin-left: 2px;
}

.dc-metric-val--crit {
  color: var(--dc-crit-color, #b3321f);
}

.dc-metric-val--exp {
  color: var(--dc-exp-color, #8c5d1e);
}

.dc-metric-val--dps {
  color: var(--dc-dps-color, #1e5f65);
}

.dc-benchmark-bar {
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.7));
  border: 1px dashed var(--dc-active-border, #b6862c);
  font-size: 12px;
  color: var(--text-main);
}

.dc-delta-badge {
  margin-top: 2px;
  font-size: 11.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.dc-delta-badge.is-up {
  color: var(--dc-delta-up, #15803d);
}

.dc-delta-badge.is-down {
  color: var(--dc-crit-color, #b3321f);
}

.dc-delta-badge.is-flat {
  color: var(--text-muted);
}

.dc-presets-drawer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px dashed var(--border-soft);
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.6));
}

.dc-presets-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.dc-preset-name-input {
  flex: 1;
  min-width: 180px;
  max-width: 280px;
}

.dc-preset-error {
  font-size: 12px;
  color: var(--dc-crit-color, #b3321f);
}

.dc-presets-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dc-preset-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 5px;
  border: 1px solid var(--border-soft);
  background: var(--paper-soft);
  overflow: hidden;
}

.dc-preset-load-btn,
.dc-preset-del-btn {
  border: 0;
  background: transparent;
  color: var(--text-main);
  font-size: 12px;
  cursor: pointer;
}

.dc-preset-load-btn {
  padding: 4px 8px;
  font-weight: 600;
}

.dc-preset-del-btn {
  padding: 4px 7px;
  color: var(--text-muted);
  border-left: 1px solid var(--border-soft);
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

.dc-star-card.is-inspected {
  box-shadow: 0 0 0 1px var(--dc-active-border, #b6862c);
}

.dc-star-card.is-dim {
  opacity: 0.62;
}

.dc-star-head-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 7px;
  border-bottom: 1px dashed var(--border-soft);
  background: rgba(0, 0, 0, 0.025);
}

.dc-star-head-inspect {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
}

.dc-star-enable-btn {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--paper-soft);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.dc-star-enable-btn.is-enabled {
  background: var(--dc-active-border, #b6862c);
  border-color: var(--dc-active-border, #b6862c);
  color: #fff;
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

.dc-star-detail-box {
  margin-top: 2px;
}

.dc-star-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.dc-star-detail-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-main);
}

.dc-star-status {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--dc-badge-bg, rgba(120, 96, 68, 0.12));
  color: var(--text-muted);
}

.dc-star-status.is-combat {
  background: var(--dc-talent-badge-bg, rgba(43, 122, 120, 0.14));
  color: var(--dc-dps-color, #1e5f65);
  font-weight: 700;
}

.dc-summon-top-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.dc-summon-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  font-size: 12px;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.dc-summon-top-name {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  white-space: nowrap;
}

.dc-summon-top-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.dc-summon-top-vals {
  display: flex;
  align-items: baseline;
  gap: 10px;
  white-space: nowrap;
}

.dc-summon-top-vals small {
  font-weight: 400;
  color: var(--text-muted);
}

.dc-summon-top-dps {
  color: var(--dc-dps-color, #1e5f65);
}

.dc-dps-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dc-dps-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.dc-dps-ctl-group,
.dc-dps-speed-pills {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dc-dps-ctl-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
}

.dc-dps-share-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dc-dps-share-bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--dc-subcard-bg, rgba(143, 115, 81, 0.14));
  border: 1px solid var(--border-soft);
}

.dc-dps-share-seg.is-normal {
  background: var(--dc-dps-normal, #c0842d);
}

.dc-dps-share-seg.is-skill {
  background: var(--dc-dps-skill, #2b7a78);
}

.dc-dps-share-seg.is-talent {
  background: var(--dc-dps-talent, #7c4dff);
}

.dc-dps-share-seg.is-summon {
  background: var(--dc-dps-summon, #d97706);
}

.dc-dps-share-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-size: 12px;
  color: var(--text-main);
}

.dc-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dc-legend-item i {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: inline-block;
}

.dc-legend-item.is-normal i {
  background: var(--dc-dps-normal, #c0842d);
}

.dc-legend-item.is-skill i {
  background: var(--dc-dps-skill, #2b7a78);
}

.dc-legend-item.is-talent i {
  background: var(--dc-dps-talent, #7c4dff);
}

.dc-legend-item.is-summon i {
  background: var(--dc-dps-summon, #d97706);
}

.dc-skill-badge.is-dot {
  background: var(--dc-dot-badge-bg, rgba(217, 119, 6, 0.14));
  color: var(--dc-dot-badge-fg, #b45309);
}

.dc-skill-badge.is-summon {
  background: var(--dc-dps-bg, rgba(43, 122, 120, 0.14));
  color: var(--dc-dps-color, #1e5f65);
}

.dc-dot-summary-bar,
.dc-summons-wrap {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px dashed var(--border-soft);
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.6));
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
}

.dc-dot-summary-head,
.dc-dot-summary-nums,
.dc-summon-head,
.dc-summon-nums,
.dc-steps-seg-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
}

.dc-summons-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dc-summon-item {
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--paper-soft);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dc-dps-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dc-dps-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--dc-subcard-bg, rgba(255, 250, 240, 0.6));
  font-size: 12.5px;
}

.dc-dps-row.is-disabled {
  opacity: 0.56;
}

.dc-dps-row-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.dc-dps-row-name {
  font-weight: 700;
  color: var(--text-main);
}

.dc-dps-row-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.dc-dps-row-val {
  color: var(--dc-dps-color, #1e5f65);
  font-weight: 700;
}

.dc-weights-box {
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dc-weights-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 14px;
}

.dc-weight-row {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr) 56px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.dc-weight-label {
  color: var(--text-main);
  font-weight: 600;
  white-space: nowrap;
}

.dc-weight-bar-track {
  height: 7px;
  border-radius: 999px;
  background: var(--dc-badge-bg, rgba(143, 115, 81, 0.16));
  overflow: hidden;
}

.dc-weight-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--dc-dps-skill, #2b7a78);
}

.dc-weight-pct {
  text-align: right;
  font-weight: 700;
  color: var(--dc-delta-up, #15803d);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .dc-result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dc-metric-box--span2,
  .dc-metric-box--span3 {
    grid-column: 1 / -1;
  }
  .dc-weights-grid {
    grid-template-columns: minmax(0, 1fr);
  }
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
  .dc-metric-box--span2,
  .dc-metric-box--span3 {
    grid-column: auto;
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
  --dc-dps-color: #6ee7df;
  --dc-dps-border: rgba(110, 231, 223, 0.55);
  --dc-dps-bg: rgba(43, 122, 120, 0.22);
  --dc-dps-normal: #e2b86b;
  --dc-dps-skill: #4fd1c5;
  --dc-dps-talent: #a78bfa;
  --dc-dps-summon: #f59e0b;
  --dc-dot-badge-bg: rgba(245, 158, 11, 0.2);
  --dc-dot-badge-fg: #fbbf24;
  --dc-delta-up: #4ade80;
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
