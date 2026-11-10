<template>
  <UiModal
    :visible="visible"
    :title="item?.name || '物品详情'"
    max-width="820px"
    scroll-id="itemModalScroll"
    :z-index="5000"
    :restore-scroll-top="itemModalState.savedScrollTop"
    @update:visible="handleClose"
  >
    <template v-if="item">
    <!-- 顶部信息区（品质色） -->
    <div class="item-head" :class="`quality-bg-${item.quality}`">
      <div class="icon-wrapper" :class="`quality-bg-${item.quality}`">
        <img :src="getImageUrl(getItemImageUrl(item))" :alt="item.name" class="item-icon" loading="lazy" />
      </div>
      <div class="head-info">
        <h2 class="item-name" :class="item.quality ? `quality-text-${item.quality}` : ''">
          {{ item.name }}
        </h2>
        <div class="item-tags">
          <!-- 物品 / 装备 ID 按需求隐藏（保留代码，需要时取消注释即可恢复） -->
          <!-- <UiTag class="copy-tag" @click="copyId(item.typeId)" title="点击复制 ID">ID: {{ item.typeId }}</UiTag> -->
          <UiTag v-if="categoryName">{{ categoryName }}</UiTag>
          <UiTag v-if="item.maxNum > 1">可堆叠 ({{ item.maxNum }})</UiTag>
        </div>
      </div>
    </div>

    <!-- 描述 -->
    <UiSection v-if="item.desc" title="描述">
      <p class="desc-text">{{ item.desc }}</p>
    </UiSection>

    <!-- 使用效果 / 料理效果 / 内容展示 -->
    <UiSection
      v-if="displayUseDes || recipeInfo || bookContent || isRecipeItem"
      :title="effectSectionTitle"
    >
      <!-- 书籍内容 -->
      <div v-if="bookContent" class="book-content-box paper-panel-solid">
        <template v-for="(para, i) in bookContent.split('\n')" :key="i">
          <p v-if="para.trim()" class="book-para">{{ para.trim() }}</p>
        </template>
      </div>

      <template v-if="recipeInfo">
        <p v-if="recipeInfo.buffDes" class="use-des" v-html="formatUseDes(recipeInfo.buffDes)"></p>
        <div v-if="recipeInfo.effectStacks > 0" class="recipe-effect-stacks">
          <span>效果层数</span>
          <strong>{{ recipeInfo.effectStacks }}</strong>
        </div>
      </template>
      <p v-else-if="displayUseDes" class="use-des" v-html="formatUseDes(displayUseDes)"></p>
    </UiSection>

    <UiSection v-if="potionInfo" title="药水毒性">
      <UiInfoRow label="药水毒性" :value="potionInfo.toxicity" />
      <UiInfoRow label="毒性上限" :value="potionInfo.toxicityCap" />
      <UiInfoRow label="距毒性上限" :value="potionInfo.remainingFromZero" />
      <UiInfoRow
        v-if="potionInfo.toxicity > 0 && potionInfo.researchReduction > 0"
        :label="`${potionInfo.researchName}后`"
        :value="`${potionInfo.toxicityWithResearch} 毒性（降低 ${formatPercent(potionInfo.researchReduction)}）`"
      />
      <p v-if="potionInfo.toxicity > 0" class="parameter-note">当前毒性达到上限后，无法继续使用有毒药水。</p>
    </UiSection>

    <UiSection v-if="seedInfo" title="种植参数">
      <UiInfoRow label="成熟时间" :value="seedInfo.formattedGrowTime" />
      <UiInfoRow v-if="seedInfo.formattedWateringReduce" label="浇水减少时长" :value="seedInfo.formattedWateringReduce" />
      <UiInfoRow v-if="seedInfo.formattedWateringResearch" :label="seedInfo.wateringResearchName || '植物养护 Lv.1'" :value="seedInfo.formattedWateringResearch" />
      <UiInfoRow v-if="seedInfo.harvest" label="基础收获" :value="formatHarvest(seedInfo.harvest)" />
      <UiInfoRow
        v-for="harvest in seedInfo.researchHarvests"
        :key="harvest.level"
        :label="`${seedInfo.researchName} Lv.${harvest.level}`"
        :value="formatHarvest(harvest)"
      />
    </UiSection>

    <!-- 生长过程 -->
    <UiSection v-if="seedInfo?.growthStages && seedInfo.growthStages.length" title="生长过程">
      <div class="growth-stages-panel paper-panel-solid">
        <div
          v-for="(stage, sIdx) in seedInfo.growthStages"
          :key="sIdx"
          class="growth-stage-item"
        >
          <div class="growth-stage-icon-wrap">
            <img
              :src="getImageUrl(stage.img)"
              :alt="stage.name"
              class="growth-stage-img"
              loading="lazy"
              decoding="async"
              @error="handleImageFallback"
            />
          </div>
          <div class="growth-stage-name">{{ stage.name }}</div>
          <div class="growth-stage-time">{{ stage.timeText }}</div>
        </div>
      </div>
    </UiSection>

    <UiSection v-if="petEggInfo" title="孵化与收益">
      <UiInfoRow label="孵化时长" :value="petEggInfo.formattedEggTime" />
      <UiInfoRow label="出售金币" :value="`${petEggInfo.sellPrice} 金币`" />
      <UiInfoRow label="喂养经验" :value="`${petEggInfo.feedExp} 经验`" />
    </UiSection>

    <!-- 装备属性 -->
    <UiSection v-if="item.itemType === 2 && item.equip" title="装备属性">
      <div class="equip-meta-list">
        <div class="equip-meta-item" v-if="item.equip.equipLevel">
          <span class="meta-label">装备品阶:</span>
          <span class="meta-val">{{ item.equip.equipLevel }}</span>
        </div>
        <div class="equip-meta-item" v-if="jobList && jobList.length > 0">
          <span class="meta-label">适用职业:</span>
          <div class="job-tags">
            <UiTag v-for="job in jobList" :key="job" tone="accent">{{ job }}</UiTag>
          </div>
        </div>
        <div class="equip-meta-item">
          <span class="meta-label">品质属性:</span>
          <div class="equip-quality-toggles">
            <UiFilterPill
              v-for="(name, q) in EQUIP_QUALITY_LABELS"
              :key="q"
              :quality="Number(q)"
              :active="selectedAttrQuality == q"
              :disabled="!availableQualities.has(Number(q))"
              :title="availableQualities.has(Number(q)) ? `${name}品质` : `此装备无${name}品质`"
              @click="availableQualities.has(Number(q)) && (selectedAttrQuality = Number(q))"
            >
              {{ name }}
            </UiFilterPill>
          </div>
        </div>
      </div>

      <div v-if="equipEnhanceConfig.maxLevel > 0" class="equip-enhance-control paper-panel-solid">
        <div class="equip-enhance-header">
          <span>强化等级</span>
          <strong>+{{ selectedEnhanceLevel }} / +{{ equipEnhanceConfig.maxLevel }}</strong>
        </div>
        <input
          v-model.number="selectedEnhanceLevel"
          class="equip-enhance-slider"
          type="range"
          min="0"
          :max="equipEnhanceConfig.maxLevel"
          step="1"
          aria-label="装备强化等级"
        />
        <div class="equip-enhance-summary">
          <span>每级基础属性 +{{ enhanceRatePercent }}%</span>
          <span>当前 +{{ enhanceBonusPercent }}%</span>
        </div>
      </div>

      <UiStatGrid v-if="computedUnitItems.length" :items="computedUnitItems" />
    </UiSection>


    <UiSection v-if="skinUnlock?.attributes?.length" title="皮肤属性">
      <div class="skin-attribute-list">
        <div v-for="attribute in skinUnlock.attributes" :key="attribute.key" class="skin-attribute-row">
          <span>{{ translateStatName(attribute.key) }}</span>
          <strong>{{ formatSkinAttribute(attribute) }}</strong>
        </div>
      </div>
    </UiSection>

    <UiSection v-if="recipeInfo" title="配方">
      <div class="recipe-ingredients-mini" v-if="recipeInfo.ingredients && recipeInfo.ingredients.length">
        <div
          v-for="(ing, idx) in recipeInfo.ingredients"
          :key="idx"
          class="ingredient-chip"
          @click="handleIngredientClick(ing.typeId)"
        >
          <img :src="ing.icon" :alt="ing.name" class="ing-icon-img" loading="lazy" />
          <span class="ing-name">{{ ing.name }}</span>
          <span class="ing-count">× {{ ing.count }}</span>
        </div>
      </div>
    </UiSection>

    <UiSection v-if="recipeInfo && PREVIEW_AVAILABLE_IDS.has(recipeInfo.typeId)" title="预览图">
      <div class="recipe-preview-box">
        <img :src="getImageUrl(`/menu_prev/${recipeInfo.typeId}_prev.webp`)" alt="预览图" class="recipe-prev-img" />
      </div>
    </UiSection>

    <!-- 符石效果 -->
    <UiSection v-if="runeEffect" :title="'符石效果：' + runeEffect.skillName">
      <div class="rune-effect-box paper-panel-solid" v-html="runeEffect.desHtml"></div>
      <UiInfoRow label="适用部位" :value="runeEffect.positionLabels.join('、')" />
    </UiSection>

    <!-- 宝箱/奖励掉落 -->
    <AcquisitionRewards :acquisition="acquisition" :title="acquisitionTitle" @item-click="handleRewardClick" />

    <!-- 装备组展示 -->
    <UiSection v-if="equipGroupItems && equipGroupItems.length > 0 && !isEquipsPage" title="包含内容">
      <div class="reward-grid">
        <UiRewardCard
          v-for="(rule, rIdx) in equipGroupItems"
          :key="rIdx"
          :rule="{ ...rule, targetImg: getImageUrl(rule.targetImg) }"
          :clickable="!!rule.typeId"
          @click="handleRewardClick(rule)"
        />
      </div>
    </UiSection>

    <!-- 套装效果 -->
    <UiSection v-if="suitInfo" :title="suitInfo.suitName">
      <div class="suit-items-title">同套装装备</div>
      <div class="reward-grid">
        <UiRewardCard
          v-for="(rule, rIdx) in suitInfo.suitItems"
          :key="rIdx"
          :rule="{ ...rule, targetImg: getImageUrl(rule.targetImg) }"
          :clickable="!!rule.typeId"
          @click="handleRewardClick(rule)"
        />
      </div>
      <div class="suit-effects-list paper-panel-solid">
        <div v-for="(eff, eIdx) in suitInfo.suitEffects" :key="eIdx" class="suit-effect-row">
          <span class="suit-num-badge">【{{ eff.num }}件套】</span>
          <span class="suit-desc" v-html="eff.desHtml"></span>
        </div>
      </div>
    </UiSection>

    <!-- 词条效果 (可携带效果) -->
    <UiSection v-if="affixGroups" title="可携带效果">
      <div class="affix-groups-list">
        <div v-for="(group, gIdx) in affixGroups" :key="gIdx" class="affix-group-block paper-panel-solid">
          <div v-for="(affix, aIdx) in group.prefixes" :key="aIdx" class="affix-row">
            <div class="affix-name">{{ affix.skillName }}</div>
            <div class="affix-desc" v-html="affix.desHtml"></div>
          </div>
        </div>
      </div>
    </UiSection>

    <!-- 神器进阶 -->
    <UiSection v-if="upgradeChain" title="神器进阶">
      <div class="equip-upgrade">
        <!-- 整条进阶链：全部阶段横向摊开，点任意阶段切换查看 -->
        <div class="equip-upgrade__chain">
          <template v-for="(stage, idx) in upgradeChain.stages" :key="stage.typeId">
            <div
              class="equip-upgrade__stage"
              :class="{
                'is-active': upgradeChain.activeIndex === idx,
                'is-current': stage.typeId === item.typeId
              }"
              role="button"
              tabindex="0"
              @click="selectUpgradeStage(idx)"
              @keydown.enter.prevent="selectUpgradeStage(idx)"
              @keydown.space.prevent="selectUpgradeStage(idx)"
            >
              <div class="equip-upgrade__stage-no">第 {{ idx + 1 }} 阶</div>
              <div
                class="equip-upgrade__stage-card"
                :class="[`quality-border-${stage.quality || 1}`, `quality-bg-${stage.quality || 1}`]"
              >
                <img
                  :src="getImageUrl(getItemImageUrl(stage.item))"
                  :alt="stage.item?.name"
                  class="equip-upgrade__icon"
                  loading="lazy"
                  @error="handleImageFallback"
                />
              </div>
              <div class="equip-upgrade__stage-name" :class="`quality-text-${stage.quality || 1}`">
                {{ getRarityName(stage.quality) }}
              </div>
              <span v-if="stage.typeId === item.typeId" class="equip-upgrade__stage-badge">当前</span>
            </div>
            <div v-if="idx < upgradeChain.stages.length - 1" class="equip-upgrade__stage-arrow">→</div>
          </template>
        </div>

        <!-- 选中阶段的详情 -->
        <div v-if="upgradeChain.active" class="equip-upgrade__detail">
          <div class="equip-upgrade__detail-head">
            <span class="equip-upgrade__detail-title">第 {{ upgradeChain.activeIndex + 1 }} 阶</span>
            <UiTag v-if="upgradeChain.active.quality" :quality="upgradeChain.active.quality">
              {{ getRarityName(upgradeChain.active.quality) }}
            </UiTag>
            <button
              v-if="upgradeChain.stages.some(s => s.to)"
              type="button"
              class="equip-upgrade__toggle"
              @click="showAllCosts = !showAllCosts"
            >
              {{ showAllCosts ? '只看当前阶' : '查看全部消耗' }}
            </button>
          </div>

          <!-- 该阶段自身的属性与词条（与上方「装备属性」同源，按这件装备算） -->
          <div v-if="stagePreview" class="equip-upgrade__preview">
            <div v-if="stagePreview.equipLevel || stagePreview.jobList.length" class="equip-upgrade__preview-meta">
              <span v-if="stagePreview.equipLevel">品阶 {{ stagePreview.equipLevel }}</span>
              <span v-if="stagePreview.jobList.length">{{ stagePreview.jobList.join(' / ') }}</span>
            </div>

            <UiStatGrid v-if="stagePreview.attrItems.length" :items="stagePreview.attrItems" />

            <div v-if="stagePreview.affixGroups.length" class="equip-upgrade__preview-affix">
              <span class="equip-upgrade__preview-label">可携带效果</span>
              <div class="affix-groups-list">
                <div v-for="(group, gIdx) in stagePreview.affixGroups" :key="gIdx" class="affix-group-block paper-panel-solid">
                  <div v-for="(affix, aIdx) in group.prefixes" :key="aIdx" class="affix-row">
                    <div class="affix-name">{{ affix.skillName }}</div>
                    <div class="affix-desc" v-html="affix.desHtml"></div>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="equip-upgrade__preview-none">该阶段无可携带效果</p>
          </div>

          <!-- 全部阶段的消耗一览 -->
          <div v-if="showAllCosts" class="equip-upgrade__allcosts">
            <div
              v-for="(stage, idx) in upgradeChain.stages"
              :key="stage.typeId"
              class="equip-upgrade__allcost-row"
              :class="{ 'is-active': upgradeChain.activeIndex === idx }"
            >
              <div class="equip-upgrade__allcost-label">
                <template v-if="stage.to">第 {{ idx + 1 }} 阶 → 第 {{ idx + 2 }} 阶</template>
                <template v-else>第 {{ idx + 1 }} 阶</template>
              </div>
              <template v-if="stage.to">
                <div class="reward-grid">
                  <UiRewardCard
                    v-for="c in stage.to.consumes"
                    :key="c.typeId"
                    :rule="upgradeConsumeRule(c)"
                    :clickable="!!getCachedItem(c.typeId)"
                    @click="handleUpgradeEquipClick(c.typeId)"
                  />
                  <UiRewardCard
                    v-if="stage.to.money"
                    :rule="moneyRewardRule(stage.to.money)"
                    :clickable="false"
                  />
                </div>
              </template>
              <span v-else class="equip-upgrade__allcost-none">已是最高阶</span>
            </div>
          </div>

          <!-- 当前选中阶段的消耗（查看全部时隐藏，避免重复） -->
          <template v-else>
            <template v-if="upgradeChain.active.to">
              <div class="equip-upgrade__consume">
                <span class="equip-upgrade__consume-label">
                  进阶消耗（升至第 {{ upgradeChain.activeIndex + 2 }} 阶）
                </span>
                <div class="reward-grid">
                  <UiRewardCard
                    v-for="c in upgradeChain.active.to.consumes"
                    :key="c.typeId"
                    :rule="upgradeConsumeRule(c)"
                    :clickable="!!getCachedItem(c.typeId)"
                    @click="handleUpgradeEquipClick(c.typeId)"
                  />
                  <UiRewardCard
                    v-if="upgradeChain.active.to.money"
                    :rule="moneyRewardRule(upgradeChain.active.to.money)"
                    :clickable="false"
                  />
                </div>
              </div>
              <p v-if="upgradeChain.active.to.condition" class="equip-upgrade__condition">
                进阶条件：{{ upgradeChain.active.to.condition }}
              </p>
            </template>
            <p v-else class="equip-upgrade__max">已是最高阶（{{ getRarityName(upgradeChain.active.quality) }}）</p>
          </template>
        </div>
      </div>
    </UiSection>

    <!-- 用途 / 解锁内容 -->
    <UiSection v-if="unlockText || homeItemUnlocks.length" :title="usageSectionTitle">
      <div v-if="homeItemUnlocks.length" class="home-item-unlock-list">
        <UiButton
          v-for="unlock in homeItemUnlocks"
          :key="`${unlock.action}:${unlock.typeId}:${(unlock.skinIds || []).join(',')}`"
          class="home-item-unlock-link"
          variant="secondary"
          @click="handleHomeItemNavigate(unlock)"
        >
          <span class="home-item-unlock-icon" :class="`quality-bg-${Number(unlock.quality) || 1}`">
            <img
              v-if="unlock.icon"
              :src="getImageUrl(`/BuildItem/${unlock.icon}.webp`)"
              :alt="unlock.name"
              loading="lazy"
            />
          </span>
          <span class="home-item-unlock-copy">
            <strong>{{ unlock.name }}</strong>
            <small v-if="unlock.skinNames?.length">
              {{ unlock.action === 'unlockHomeItemSkin' ? '解锁外观' : '同时解锁外观' }}：{{ unlock.skinNames.join('、') }}
            </small>
            <small v-else>解锁家具</small>
          </span>
          <span class="home-item-unlock-action">查看家具</span>
        </UiButton>
      </div>
      <div v-else-if="heroUnlock" class="unlock-hero-usage">
        <span>解锁角色：</span>
        <UiButton class="unlock-hero-link" variant="link" size="sm" @click="handleHeroNavigate">
          <img
            v-if="heroUnlock.heroIcon"
            :src="getImageUrl(`/images/HeadIconAtals/${heroUnlock.heroIcon}.webp`)"
            :alt="heroUnlock.heroName"
            class="unlock-hero-icon"
          />
          <span class="unlock-hero-name">{{ heroUnlock.heroName }}</span>
          <span aria-hidden="true">›</span>
        </UiButton>
      </div>
      <div v-else-if="skinUnlock" class="unlock-hero-usage">
        <span>解锁皮肤：</span>
        <UiButton class="unlock-hero-link" variant="link" size="sm" @click="handleSkinNavigate">
          <img
            v-if="item.img"
            :src="getImageUrl(getItemImageUrl(item))"
            :alt="skinUnlock.skinName"
            class="unlock-hero-icon"
          />
          <span class="unlock-hero-name">{{ skinUnlock.skinName }}</span>
          <span class="unlock-skin-owner">{{ skinUnlock.heroName }}</span>
          <span aria-hidden="true">›</span>
        </UiButton>
      </div>
      <p v-else class="unlock-text">{{ unlockText }}</p>
      <div v-if="heroStarUsage" class="star-usage-list">
        <div v-for="stage in heroStarUsage.stages" :key="stage.stage" class="star-usage-row">
          <span class="star-usage-label">星阶 {{ stage.stage }}</span>
          <span class="star-usage-value">{{ stage.costs.join('、') }}</span>
        </div>
        <div class="star-usage-total">
          <span>全部所需</span>
          <strong>{{ heroStarUsage.total }}</strong>
        </div>
      </div>
    </UiSection>

    <UiSection v-if="skinUnlock" title="皮肤立绘">
      <div class="skin-portrait-preview" :class="[skinUnlock.quality ? `quality-border-${skinUnlock.quality}` : '', { 'has-model': skinUnlock.modelImage }]">
        <div class="skin-preview-pane">
          <img
            :src="getImageUrl(`/images/chara/l/${skinUnlock.img}.webp`)"
            :alt="`${skinUnlock.skinName}立绘`"
            loading="lazy"
          />
        </div>
        <div v-if="skinUnlock.modelImage" class="skin-preview-pane skin-preview-pane--model">
          <img :src="getImageUrl(skinUnlock.modelImage)" :alt="`${skinUnlock.skinName}小人模型`"
            loading="lazy" decoding="async" @error="handleImageFallback" />
        </div>
      </div>
    </UiSection>

    <!-- 基础信息 -->
    <UiSection v-if="item.sellable" title="基础信息">
      <UiInfoRow label="售价" :value="item.sellPrice + ' 银币'" />
    </UiSection>

    <!-- 关联信息 -->
    <UiSection v-if="relatedItems && relatedItems.length" title="关联信息">
      <div class="related-scroll-wrapper">
        <div class="related-cards-track">
          <div
            v-for="rel in relatedItems"
            :key="`${rel.targetType}:${rel.id}:${rel.relationType}`"
            class="related-item-card"
            :title="`${rel.relationLabel}：${rel.name}${rel.extra ? `（${rel.extra}）` : ''}`"
            @click="handleRelatedClick(rel)"
          >
            <div
              class="related-item-card__slot"
              :class="[`quality-border-${rel.quality || 1}`, `quality-bg-${rel.quality || 1}`]"
            >
              <img
                :src="getRelatedIcon(rel)"
                :alt="rel.name"
                class="related-item-card__icon"
                :class="{ 'is-hero': rel.targetType === 'hero', 'is-pet': rel.targetType === 'pet', 'is-monster': rel.targetType === 'monster' }"
                loading="lazy"
                decoding="async"
                @error="handleImageFallback"
              />
              <span class="related-item-card__tag" :class="`tag-${rel.relationType}`">
                {{ rel.relationLabel }}
              </span>
            </div>
            <div class="related-item-card__name" :class="rel.quality ? `quality-text-${rel.quality}` : ''">
              {{ rel.name }}
            </div>
          </div>
        </div>
      </div>
    </UiSection>

    <!-- 同类物品 -->
    <UiSection v-if="similarItems && similarItems.length" title="同类物品">
      <div class="related-scroll-wrapper">
        <div class="related-cards-track">
          <div
            v-for="sim in similarItems"
            :key="sim.id"
            class="related-item-card"
            :class="{ 'is-current': sim.id === item.typeId }"
            :title="sim.id === item.typeId ? `当前物品：${sim.name}` : `同类物品：${sim.name}${sim.label ? `（${sim.label}）` : ''}`"
            @click="handleSimilarClick(sim)"
          >
            <div
              class="related-item-card__slot"
              :class="[`quality-border-${sim.quality || 1}`, `quality-bg-${sim.quality || 1}`]"
            >
              <img
                :src="getImageUrl(getItemImageUrl({ img: sim.icon, itemType: 1 }))"
                :alt="sim.name"
                class="related-item-card__icon"
                loading="lazy"
                decoding="async"
                @error="handleImageFallback"
              />
              <span v-if="sim.id === item.typeId" class="related-item-card__tag tag-current">
                当前
              </span>
            </div>
            <div class="related-item-card__name" :class="sim.quality ? `quality-text-${sim.quality}` : ''">
              {{ sim.name }}
            </div>
          </div>
        </div>
      </div>
    </UiSection>

    <!-- 设施制作 -->
    <UiSection v-if="facilityCraftingRecipes.length" title="设施制作">
      <div v-for="recipe in facilityCraftingRecipes" :key="recipe.id" class="smithing-recipe paper-panel-solid">
        <div class="smithing-recipe__head">
          <span>{{ recipe.facilityName }} {{ recipe.level }} 级制作</span>
          <UiButton v-if="canOpenFacilityRecipe(recipe)" variant="link" size="sm" @click="handleFacilityNavigate(recipe)">查看设施</UiButton>
        </div>
        <p v-if="recipe.makeTime" class="smithing-recipe__output">制作时间：{{ formatCraftingDuration(recipe.makeTime) }}</p>
        <div class="smithing-recipe__materials">
          <span class="smithing-recipe__label">制作材料</span>
          <div class="reward-grid">
            <UiRewardCard
              v-for="material in recipe.materials"
              :key="material.typeId"
              :rule="{ targetName: material.name, targetImg: getImageUrl(material.img), targetQuality: material.quality, min: material.num, max: material.num, typeId: material.typeId }"
              :clickable="!!material.typeId"
              @click="handleSmithingMaterialClick(material.typeId)"
            />
          </div>
        </div>
      </div>
    </UiSection>

    <!-- 锻造台打造 -->
    <UiSection v-if="smithingRecipes.length" title="锻造台打造">
      <div v-for="recipe in smithingRecipes" :key="recipe.exchangeId" class="smithing-recipe paper-panel-solid">
        <div class="smithing-recipe__head">
          <span>第 {{ recipe.equipLevel }} 阶装备打造</span>
          <UiButton v-if="canOpenSmithingRecipe(recipe)" variant="link" size="sm" @click="handleSmithingNavigate(recipe)">查看锻造台</UiButton>
        </div>
        <div class="smithing-recipe__meta">
          <span>品质概率</span>
          <span v-for="chance in recipe.qualityChances" :key="chance.quality" :class="`quality-text-${chance.quality}`">
            {{ EQUIP_QUALITY_LABELS[chance.quality] || `品质${chance.quality}` }} {{ formatChance(chance.chance) }}
          </span>
        </div>
        <p class="smithing-recipe__output">
          {{ recipe.outputMode === 'equipGroup' ? '同类装备池中随机产出，品质按以上概率决定。' : '打造该装备，品质按以上概率决定。' }}
        </p>
        <div class="smithing-recipe__materials">
          <span class="smithing-recipe__label">制作材料</span>
          <div class="reward-grid">
            <UiRewardCard
              v-for="material in recipe.materials"
              :key="material.typeId"
              :rule="{ targetName: material.name, targetImg: getImageUrl(material.img), targetQuality: material.quality, min: material.num, max: material.num, typeId: material.typeId }"
              :clickable="!!material.typeId"
              @click="handleSmithingMaterialClick(material.typeId)"
            />
          </div>
        </div>
      </div>
    </UiSection>

    <!-- 获取途径 -->
    <UiSection title="获取途径">
      <div v-if="sharedResourcesLoading" class="empty-tip" role="status">来源与配方加载中...</div>
      <div v-else-if="sharedResourcesError" class="resource-load-error" role="alert">
        <p>{{ sharedResourcesError }}</p>
        <UiButton variant="secondary" size="sm" @click="loadSharedResources">重新加载</UiButton>
      </div>
      <div v-if="hasItemSources" class="source-list">
        <UiAccordion
          v-for="group in groupedSources"
          :key="group.name"
          :model-value="!!expandedSourceGroups[group.name]"
          @update:model-value="(v) => expandedSourceGroups[group.name] = v"
        >
          <template #title>
            <span class="source-group-name">{{ group.name }}</span>
          </template>
          <div class="source-drawer-grid">
            <div
              v-for="(src, idx) in group.sources"
              :key="idx"
              class="drawer-chip"
              :class="{ clickable: canNavigateToSource(src) }"
              @click="handleSourceClick(src)"
            >
              <div class="source-info">
                <span class="source-name">{{ src.name }}</span>
                <span class="source-des" v-if="src.des">{{ src.des }}</span>
              </div>
              <span class="source-action-text" v-if="canNavigateToSource(src)">前往 ▸</span>
            </div>
          </div>
        </UiAccordion>
      </div>

      <div v-else-if="item.origin && item.origin.length > 0">
        <div v-for="(org, idx) in item.origin" :key="idx" class="origin-item ui-list-row">
          <span class="origin-val">{{ org.value || org }}</span>
          <UiButton v-if="org.battleId" variant="secondary" size="sm">前往</UiButton>
        </div>
      </div>

      <div v-else-if="!sharedResourcesLoading && !sharedResourcesError" class="origin-placeholder">
        <p class="empty-tip">数据未补充...</p>
      </div>
    </UiSection>

    <!-- 讨论区：只在物品详情里挂，key 绑定物品 ID，切换物品时重建组件（清空上一件的评论与表单） -->
    <CommentsPanel
      v-if="commentPageKey"
      :key="commentPageKey"
      :page-key="commentPageKey"
      :page-label="item?.name || ''"
    />

    <UiBackToTop scroll-container="#itemModalScroll" />
    </template>
  </UiModal>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getImageUrl, handleImageFallback } from '../utils/env'
import { translateJobArray, translateAttr, translateCategory, parseItemUnlocks, getItemImageUrl, getItemAcquisition, getCachedItem, parseRuneEffect, parseEquipGroup, parseEquipSuit, parseItemAffixes, calculateEquipAttributeRange, buildEquipAttributeItems, getEquipEnhanceConfig } from '../utils/itemParser'
import { getRarityName } from '../utils/gameMappings'
import AcquisitionRewards from './AcquisitionRewards.vue'
import { getRuneSourceTarget } from '../utils/runeData.js'
import { pushItemDetail, popItemDetail, itemModalState } from '../utils/itemModalState'
import { fetchWithFallback } from '../utils/request.js'
import { PREVIEW_AVAILABLE_IDS } from '../utils/recipeUtils'
import { formatHighlightedText, EQUIP_QUALITY_LABELS, translateStatName } from '../utils/gameMappings.js'
import { compareExchangeSources } from '../utils/exchangeData.js'
import { isFacilityRecipeHidden } from '../config/blacklist.js'
import { resolveItemRelations, resolveSimilarItems } from '../utils/relationData.js'
import { UiModal, UiSection, UiTag, UiInfoRow, UiButton, UiFilterPill, UiStatGrid, UiRewardCard, UiAccordion, UiBackToTop } from './ui/index.js'
import CommentsPanel from './CommentsPanel.vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  item: {
    type: Object,
    default: () => ({})
  },
  categoryTree: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible'])

const route = useRoute()
const router = useRouter()
let bodyScrollOperation = 0
let bodyScrollFrame = 0

const isEquipsPage = computed(() => route.path === '/equip')

/**
 * 评论归属键：用业务 ID（typeId）而不是页面路径，
 * 这样从物品图鉴、装备图鉴、任务奖励等任意入口打开同一件物品，
 * 讨论区都是同一处；也不会因为 URL 带不同筛选参数而分裂成多份。
 * 装备与物品共用同一详情，因此同键，这是刻意的。
 */
const commentPageKey = computed(() => (props.item?.typeId ? `item:${props.item.typeId}` : ''))

const cancelBodyScrollRestore = () => {
  bodyScrollOperation += 1
  if (!bodyScrollFrame) return
  cancelAnimationFrame(bodyScrollFrame)
  bodyScrollFrame = 0
}

const getModalBody = () => document.getElementById('itemModalScroll')

const setModalBodyScroll = async (top, expectedTypeId) => {
  cancelBodyScrollRestore()
  const operation = bodyScrollOperation
  const normalizedTop = Math.max(0, Number(top) || 0)

  await nextTick()
  const restore = () => {
    if (
      operation !== bodyScrollOperation ||
      !props.visible ||
      props.item?.typeId !== expectedTypeId
    ) return

    getModalBody()?.scrollTo({ top: normalizedTop, behavior: 'auto' })
  }

  restore()
  bodyScrollFrame = requestAnimationFrame(() => {
    bodyScrollFrame = 0
    restore()
  })
}

const openNestedItem = targetItem => {
  if (!targetItem) return

  const currentBodyScrollTop = getModalBody()?.scrollTop || 0
  pushItemDetail(targetItem, currentBodyScrollTop)
  setModalBodyScroll(0, targetItem.typeId)
}

const handleClose = () => {
  const previous = popItemDetail()
  if (previous) {
    setModalBodyScroll(previous.bodyScrollTop, previous.item.typeId)
    return
  }

  cancelBodyScrollRestore()

  emit('update:visible', false)
  if (route && route.query.itemId) {
    const newQuery = { ...route.query }
    delete newQuery.itemId
    router.replace({ query: newQuery })
  }
}

// ID 显示已隐藏，复制入口随之停用（保留实现，恢复 ID 显示时一并取消注释）
// const copyId = async (id) => {
//   if (!id) return
//   try {
//     await navigator.clipboard.writeText(id)
//   } catch (err) {
//     console.warn('复制失败', err)
//   }
// }

const categoryName = computed(() => {
  if (!props.item?.category || !props.categoryTree) return ''
  return translateCategory(props.item.category, props.categoryTree)
})

const jobList = computed(() => {
  if (!props.item?.equip?.job) return []
  return translateJobArray(props.item.equip.job)
})

const unlockText = computed(() => {
  return parseItemUnlocks(props.item)
})

const heroStarUsage = computed(() => props.item?.heroStarUsage || null)
const heroUnlock = computed(() => props.item?.heroUnlock || null)
const skinUnlock = computed(() => props.item?.skinUnlock || null)
const homeItemUnlocks = computed(() => (props.item?.homeItemUnlocks || [])
  .filter(unlock => unlock?.typeId && unlock.catalogVisible !== false))
const potionInfo = computed(() => props.item?.potionInfo || null)
const seedInfo = computed(() => props.item?.seedInfo || null)
const petEggInfo = computed(() => props.item?.petEggInfo || null)
const smithingRecipes = computed(() => props.item?.smithing?.recipes || [])
const facilityCraftingRecipes = computed(() => props.item?.facilityCrafting || [])
const usageSectionTitle = computed(() =>
  heroStarUsage.value || heroUnlock.value ? '用途' : '解锁内容'
)

const handleHomeItemNavigate = unlock => {
  if (!unlock?.typeId) return
  router
    .push({ path: '/furniture', query: { id: unlock.typeId } })
    .finally(() => emit('update:visible', false))
}

const handleHeroNavigate = () => {
  const heroTypeId = heroUnlock.value?.heroTypeId
  if (!heroTypeId) return
  router.push({ path: '/heroes', query: { id: heroTypeId } })
}

const handleSkinNavigate = () => {
  const heroTypeId = skinUnlock.value?.heroTypeId
  if (!heroTypeId) return
  router.push({ path: '/heroes', query: { id: heroTypeId, tab: 'skins' } })
}

/**
 * 「查看设施 / 查看锻造台」的可达性判断。
 *
 * 设施页渲染前会过滤掉黑名单配方与被隐藏品阶（`HIDDEN_EQUIP_TIERS`），
 * 而物品详情里这些配方仍然存在。不加判断就会生成**指向空列表的死链**：
 * 例如 4 阶装备的「查看锻造台」带着 `level=4` 跳过去，落地一条都不显示。
 *
 * 判据与设施页共用 `isFacilityRecipeHidden`（`config/blacklist.js`），
 * 避免两处各写一份、日后改了一边漏另一边。
 */
const canOpenFacilityRecipe = recipe => !isFacilityRecipeHidden(recipe)
const canOpenSmithingRecipe = recipe => !isFacilityRecipeHidden({ ...recipe, mode: 'equipment' })

const handleSmithingNavigate = recipe => {
  if (!canOpenSmithingRecipe(recipe)) return
  router.push({
    path: '/facilities',
    query: {
      facility: 'blacksmith',
      mode: 'equipment',
      level: recipe?.equipLevel || 1,
      item: props.item?.typeId || undefined
    }
  }).finally(() => emit('update:visible', false))
}

const handleFacilityNavigate = recipe => {
  if (!recipe?.facility || !canOpenFacilityRecipe(recipe)) return
  router.push({
    path: '/facilities',
    query: {
      facility: recipe.facility,
      mode: 'crafting',
      level: recipe.level || 1,
      item: props.item?.typeId || undefined
    }
  }).finally(() => emit('update:visible', false))
}

const handleSmithingMaterialClick = typeId => {
  const targetItem = getCachedItem(typeId)
  if (targetItem) openNestedItem(targetItem)
}

const formatChance = chance => `${Number((Number(chance || 0) * 100).toFixed(1))}%`
const formatCraftingDuration = seconds => {
  const value = Number(seconds) || 0
  if (value < 60) return `${value} 秒`
  const minutes = Math.floor(value / 60)
  const remain = value % 60
  return `${minutes} 分${remain ? `${remain} 秒` : ''}`
}

const formatSkinAttribute = attribute => {
  const values = []
  if (attribute.baseValue) values.push(`+${attribute.baseValue}`)
  if (attribute.percent) {
    const percent = Math.abs(attribute.percent) <= 1 ? attribute.percent * 100 : attribute.percent
    values.push(`+${Number(percent.toFixed(2))}%`)
  }
  return values.join(' / ')
}

const formatPercent = value => `${Number((Number(value) * 100).toFixed(2))}%`
const formatHarvest = harvest => {
  if (!harvest) return ''
  const quantity = harvest.min === harvest.max ? `${harvest.min}` : `${harvest.min}～${harvest.max}`
  return `${harvest.name} × ${quantity}`
}

const runeEffect = computed(() => {
  return parseRuneEffect(props.item)
})

const equipGroupItems = computed(() => {
  return parseEquipGroup(props.item)
})

const suitInfo = computed(() => {
  return parseEquipSuit(props.item)
})

/** 银币图标：与货币栏/市场价签统一使用 item_00001 */
const coinIconUrl = computed(() => getImageUrl('/Common_ItemIcon/item_00001.webp'))

/** 银币也渲染成一张奖励卡，和材料保持同一观感。 */
const moneyRewardRule = (money) => ({
  targetName: '银币',
  targetImg: coinIconUrl.value,
  targetQuality: 1,
  min: Number(money) || 0,
  max: Number(money) || 0,
  typeId: 'item_00001'
})

/**
 * 神器进阶：把整条链一次性摊开，支持点任意阶段切换查看。
 *
 * `item.upgradeTo` / `item.upgradeFrom` 由构建期 buildEquipUpgrades 挂上（只连相邻两跳）。
 * 这里沿 `upgradeTo` 向后走到最高阶、沿 `upgradeFrom` 向前走到起始阶，
 * 拼出完整 stages 数组；默认选中「当前这件」所在阶段。
 */
const selectedUpgradeIndex = ref(null)

const upgradeChain = computed(() => {
  const item = props.item
  if (!item || (!item.upgradeTo && !item.upgradeFrom)) return null

  // 1. 向起点回溯
  const before = []
  let cursor = getCachedItem(item.upgradeFrom?.typeId)
  const guardA = new Set([item.typeId])
  while (cursor && !guardA.has(cursor.typeId)) {
    guardA.add(cursor.typeId)
    before.unshift(cursor)
    cursor = getCachedItem(cursor.upgradeFrom?.typeId)
  }

  // 2. 向终点延伸
  const after = []
  let next = getCachedItem(item.upgradeTo?.typeId)
  const guardB = new Set([item.typeId, ...before.map(x => x.typeId)])
  while (next && !guardB.has(next.typeId)) {
    guardB.add(next.typeId)
    after.push(next)
    next = getCachedItem(next.upgradeTo?.typeId)
  }

  const ordered = [...before, item, ...after]
  const stages = ordered.map(entry => ({
    typeId: entry.typeId,
    item: entry,
    quality: Number(entry.quality) || 1,
    to: entry.upgradeTo || null
  }))

  const currentIndex = before.length
  const activeIndex = selectedUpgradeIndex.value == null
    ? currentIndex
    : Math.min(Math.max(0, selectedUpgradeIndex.value), stages.length - 1)

  return { stages, currentIndex, activeIndex, active: stages[activeIndex] || null }
})

const selectUpgradeStage = (idx) => {
  selectedUpgradeIndex.value = idx
}

/**
 * 选中阶段的属性与词条预览。
 * 每个阶段是榜单上独立的一件装备（typeId 不同），直接按该装备自身算，
 * 不受上方「品质属性」手动切换影响 —— 那套开关是「同一件装备按不同品质估算」，
 * 和进阶链是两回事，混用会让阶段卡片显示错的数值。
 */
const stagePreview = computed(() => {
  const stage = upgradeChain.value?.active
  if (!stage?.item) return null
  const target = stage.item
  const attrRange = calculateEquipAttributeRange(target, Number(target.quality) || 1, 0)
  const attrItems = attrRange
    ? buildEquipAttributeItems(attrRange).map(a => ({
        label: translateAttr(a.key),
        value: a.min === a.max ? `+${a.min}` : `+${a.min}~${a.max}`,
        tone: 2
      }))
    : []
  return {
    attrItems,
    affixGroups: parseItemAffixes(target) || [],
    equipLevel: target.equip?.equipLevel || null,
    jobList: translateJobArray(target.equip?.job || [])
  }
})

/** 「查看全部消耗」：把每个阶段的消耗一次性列出。 */
const showAllCosts = ref(false)

// 切换物品时重置到「当前」阶段，并收起全部消耗
watch(() => props.item?.typeId, () => {
  selectedUpgradeIndex.value = null
  showAllCosts.value = false
})

/** 进阶消耗 → UiRewardCard 的 rule 形状。 */
const upgradeConsumeRule = (consume) => {
  const target = getCachedItem(consume.typeId)
  return {
    targetName: target?.name || consume.typeId,
    targetImg: target ? getImageUrl(getItemImageUrl(target)) : '',
    targetQuality: target?.quality || 1,
    min: consume.num,
    max: consume.num,
    typeId: consume.typeId
  }
}

const handleUpgradeEquipClick = (typeId) => {
  const target = getCachedItem(typeId)
  if (target) openNestedItem(target)
}

// === 装备属性计算 ===
const selectedAttrQuality = ref(5)
const selectedEnhanceLevel = ref(0)
const equipEnhanceConfig = computed(() => getEquipEnhanceConfig())
const enhanceRatePercent = computed(() => Math.round(equipEnhanceConfig.value.attUp * 100))
const enhanceBonusPercent = computed(() => Math.round(selectedEnhanceLevel.value * equipEnhanceConfig.value.attUp * 100))

const availableQualities = computed(() => {
  if (!props.item || props.item.itemType !== 2) return new Set([1, 2, 3, 4, 5, 6])

  // 1. 如果有锻造配方，以配方中能产出的品质为准 (如 [3, 4, 5])
  if (smithingRecipes.value.length) {
    const qualities = new Set()
    for (const r of smithingRecipes.value) {
      for (const qc of (r.qualityChances || [])) {
        if (qc.quality) qualities.add(Number(qc.quality))
      }
    }
    if (qualities.size > 0) return qualities
  }

  // 2. 否则（传说装备、固定装备、首饰等），以物品自身品质为准
  const q = Number(props.item.quality)
  /*
   * 品质上限是 6（神话）。旧代码写死 `q <= 5`，品质 6 的装备会掉进兜底的
   * `new Set([5])`，属性预览按传说系数 1.3 计算 —— 实测洛莉安晚礼服 q6
   * 生命应为 888×1.45=1288，却显示 888×1.3≈1154。这里放开到 6。
   */
  if (q >= 1 && q <= 6) {
    return new Set([q])
  }
  return new Set([q >= 1 ? q : 5])
})

watch(() => props.item, (newVal) => {
  if (newVal) {
    const available = availableQualities.value
    if (available.has(5)) {
      selectedAttrQuality.value = 5
    } else if (available.has(Number(newVal.quality))) {
      selectedAttrQuality.value = Number(newVal.quality)
    } else {
      selectedAttrQuality.value = Array.from(available)[0] || 5
    }
    selectedEnhanceLevel.value = 0
  }
}, { immediate: true })

const computedUnitData = computed(() => {
  return calculateEquipAttributeRange(
    props.item,
    selectedAttrQuality.value,
    selectedEnhanceLevel.value
  )
})

const computedUnitItems = computed(() => {
  if (!computedUnitData.value) return []
  return buildEquipAttributeItems(computedUnitData.value).map(attribute => ({
    label: translateAttr(attribute.key),
    value: attribute.min === attribute.max ? `+${attribute.min}` : `+${attribute.min}~${attribute.max}`,
    tone: 2
  }))
})
// ===================

const affixGroups = computed(() => {
  return parseItemAffixes(props.item)
})

const acquisition = computed(() => getItemAcquisition(props.item))
const acquisitionTitle = computed(() => {
  if (acquisition.value?.action === 'appraisal') return '鉴定奖励'
  return '开启奖励'
})

const handleRewardClick = (rule) => {
  if (rule.typeId) {
    const targetItem = getCachedItem(rule.typeId)
    if (targetItem) {
      openNestedItem(targetItem)
    }
  }
}

const formatUseDes = (text) => formatHighlightedText(text)

const menuDict = ref({})
const diaryData = ref(null)
const bookContent = ref(null)

const bookEventId = computed(() => {
  if (!props.item) return null
  const cat = props.item.category || []
  if (cat.includes(5) || cat.includes('5') || cat.includes(54) || cat.includes('54')) {
    const p = props.item.useActionPara
    if (p && p.eventType && p.eventType.length > 0) {
      return p.eventType[0]
    }
  }
  return null
})

watch(bookEventId, async (newVal) => {
  if (newVal) {
    if (!diaryData.value) {
      try {
        const res = await fetchWithFallback('data/parsed/diary.json')
        diaryData.value = res || {}
      } catch (e) {
        console.error('Failed to load diary.json', e)
      }
    }
    let foundText = ''
    if (diaryData.value) {
      const categories = ['taskMain', 'taskSub', 'word', 'book']
      for (const cat of categories) {
        const list = diaryData.value[cat]
        if (list && Array.isArray(list)) {
          for (const task of list) {
            if (task.content) {
              const matched = task.content.find(c => c.unlockCondition === newVal)
              if (matched) {
                foundText = matched.text
                break
              }
            }
          }
        }
        if (foundText) break
      }
    }
    bookContent.value = foundText
  } else {
    bookContent.value = null
  }
}, { immediate: true })

const globalItemSources = ref({})
const globalItemRelations = ref({})
const globalSimilarItems = ref({})

// Failed resources remain retryable; successful resources are cached by request.js.
let sharedResourcesLoaded = false
let sharedResourcesPending = null
const sharedResourcesLoading = ref(false)
const sharedResourcesError = ref('')
const loadSharedResources = () => {
  if (sharedResourcesLoaded) return Promise.resolve()
  if (sharedResourcesPending) return sharedResourcesPending
  sharedResourcesLoading.value = true
  sharedResourcesError.value = ''
  sharedResourcesPending = Promise.all([
    fetchWithFallback('data/parsed/recipes.json').then(data => {
      menuDict.value = Object.fromEntries(data.recipes.map(recipe => [recipe.id, recipe]))
    }),
    fetchWithFallback('data/parsed/item-sources.json').then(data => { globalItemSources.value = data }),
    fetchWithFallback('data/parsed/item-relations.json').then(data => {
      globalItemRelations.value = data?.relations || data || {}
      globalSimilarItems.value = data?.similar || {}
    }).catch(() => {})
  ]).then(() => {
    sharedResourcesLoaded = true
  }).catch(error => {
    sharedResourcesError.value = '部分来源或配方暂时无法加载，请重试。'
    console.error('Failed to load item detail resources:', error)
  }).finally(() => {
    sharedResourcesPending = null
    sharedResourcesLoading.value = false
  })
  return sharedResourcesPending
}

const relatedItems = computed(() => {
  return resolveItemRelations(props.item, globalItemRelations.value)
})

const similarItems = computed(() => {
  return resolveSimilarItems(props.item, globalSimilarItems.value)
})

const handleSimilarClick = (sim) => {
  if (!sim || sim.id === props.item?.typeId) return
  const targetItem = getCachedItem(sim.id)
  if (targetItem) {
    openNestedItem(targetItem)
  } else {
    openNestedItem({
      typeId: sim.id,
      name: sim.name,
      quality: sim.quality,
      img: sim.icon,
      itemType: 1
    })
  }
}

const getQualityFrame = (q) => {
  const num = Math.floor(Number(q) || 1)
  if (num < 1) return 1
  if (num > 6) return 6
  return num
}

const getRelatedIcon = (rel) => {
  if (rel?.targetType === 'hero') {
    return getImageUrl(`/images/HeadIconAtals/${rel.icon}.webp`)
  }
  if (rel?.targetType === 'pet' || rel?.targetType === 'monster') {
    return getImageUrl(`/images/PicHandBookPanel_Atlas/${rel.icon}.webp`)
  }
  return getImageUrl(getItemImageUrl({ img: rel?.icon, itemType: 1 }))
}

const handleRelatedClick = (rel) => {
  if (!rel) return
  if (rel.targetType === 'hero') {
    router.push({ path: '/heroes', query: { id: rel.id } })
      .finally(() => emit('update:visible', false))
  } else if (rel.targetType === 'monster') {
    router.push({ path: '/monsters', query: { id: rel.id } })
      .finally(() => emit('update:visible', false))
  } else if (rel.targetType === 'pet') {
    router.push({ path: '/pets', query: { id: rel.id } })
      .finally(() => emit('update:visible', false))
  } else if (rel.targetType === 'item') {
    const targetItem = getCachedItem(rel.id)
    if (targetItem) {
      openNestedItem(targetItem)
    } else {
      openNestedItem({
        typeId: rel.id,
        name: rel.name,
        quality: rel.quality,
        img: rel.icon,
        itemType: 1
      })
    }
  }
}

watch(() => props.visible, (v) => { if (v) loadSharedResources() }, { immediate: true })

const currentItemSources = computed(() => {
  if (!props.item?.typeId) return []
  const sources = [...(globalItemSources.value?.[props.item.typeId] || [])]
  const recipe = smithingRecipes.value[0]
  if (recipe) {
    sources.unshift({
      type: 'smithing',
      id: recipe.facilityId || 'sysBlacksmith',
      name: recipe.facilityName || '锻造台',
      des: `第 ${recipe.equipLevel} 阶装备打造`
    })
  }
  for (const facilityRecipe of facilityCraftingRecipes.value) {
    sources.unshift({
      type: 'facility',
      id: facilityRecipe.facilityId,
      facility: facilityRecipe.facility,
      name: facilityRecipe.facilityName,
      level: facilityRecipe.level,
      des: `${facilityRecipe.level} 级制作`
    })
  }
  return sources
})

const groupedSources = computed(() => {
  const groups = {
    achievement: { name: '成就', sources: [] },
    task: { name: '任务', sources: [] },
    event: { name: '随机事件', sources: [] },
    explore: { name: '探索区域', sources: [] },
    collect: { name: '采集', sources: [] },
    plant: { name: '种植', sources: [] },
    camp: { name: '营地升级', sources: [] },
    activity: { name: '活动奖励', sources: [] },
    signIn: { name: '签到奖励', sources: [] },
    firstReward: { name: '关卡首通', sources: [] },
    guide: { name: '新手引导', sources: [] },
    container: { name: '礼包与道具', sources: [] },
    dailyPlan: { name: '日常计划', sources: [] },
    gacha: { name: '招募与贩售', sources: [] },
    tower: { name: '塔层奖励', sources: [] },
    dismantle: { name: '装备分解', sources: [] },
    pvp: { name: '挑战赛', sources: [] },
    monster: { name: '怪物掉落', sources: [] },
    recipe: { name: '配方制作', sources: [] },
    exchange: { name: '兑换', sources: [] },
    runeAppraisal: { name: '符石鉴定', sources: [] },
    runeSynthesis: { name: '符石合成', sources: [] },
    dungeon: { name: '副本掉落', sources: [] },
    stage: { name: '关卡掉落', sources: [] },
    smithing: { name: '锻造台制作', sources: [] },
    facility: { name: '设施制作', sources: [] },
    hidden: { name: '被隐藏的物品', sources: [] },
    other: { name: '其他', sources: [] }
  }
  
  currentItemSources.value.forEach(src => {
    if (groups[src.type]) {
      groups[src.type].sources.push(src)
    } else {
      groups['other'].sources.push(src)
    }
  })

  // 兑换来源按兑换页分类顺序排列，委托兑换内部复用地图映射顺序。
  groups.exchange.sources.sort(compareExchangeSources)

  // 保留关卡首次出现顺序；同一关卡内部按金、银、铜宝箱排列。
  const dungeonBattleOrder = new Map()
  groups.dungeon.sources.forEach((source, index) => {
    if (!dungeonBattleOrder.has(source.id)) dungeonBattleOrder.set(source.id, index)
  })
  const chestOrder = { 'chest-3': 0, 'chest-2': 1, 'chest-1': 2 }
  groups.dungeon.sources.sort((a, b) => {
    const battleDiff = dungeonBattleOrder.get(a.id) - dungeonBattleOrder.get(b.id)
    if (battleDiff) return battleDiff
    return (chestOrder[a.dropEntry] ?? 99) - (chestOrder[b.dropEntry] ?? 99)
  })
  
  return Object.values(groups).filter(g => g.sources.length > 0)
})

const expandedSourceGroups = ref({})

watch(currentItemSources, () => {
  expandedSourceGroups.value = {}
  groupedSources.value.forEach(g => {
    expandedSourceGroups.value[g.name] = false // Closed by default
  })
}, { immediate: true })

const hasItemSources = computed(() => currentItemSources.value.length > 0)

const canNavigateToSource = (src) => {
  if (getRuneSourceTarget(src)) return true
  // 设施/锻造来源：配方被设施页隐藏时（黑名单产出物或材料、4/5 阶装备）不提供「前往」，
  // 否则点过去是一个空列表。来源文案保留——它本身是真实的获取途径，只是没有可达的详情页。
  if (src.type === 'smithing') {
    const recipe = smithingRecipes.value.find(r => r.exchangeId === src.exchangeId) || smithingRecipes.value[0]
    if (!canOpenSmithingRecipe(recipe)) return false
  }
  if (src.type === 'facility') {
    const recipe = facilityCraftingRecipes.value.find(r => r.facility === src.facility && Number(r.level) === Number(src.level))
    if (recipe && !canOpenFacilityRecipe(recipe)) return false
  }
  return ['monster', 'achievement', 'recipe', 'pvp', 'hidden', 'task', 'exchange', 'dungeon', 'stage', 'smithing', 'facility', 'event', 'explore', 'plant', 'camp', 'container', 'gacha'].includes(src.type)
}

const handleSourceClick = (src) => {
  if (!canNavigateToSource(src)) return

  let targetPath = '/'
  let targetQuery = {}

  const runeTarget = getRuneSourceTarget(src)
  if (runeTarget) {
    targetPath = runeTarget.path
    targetQuery = runeTarget.query
  }
  else if (src.type === 'monster') {
    targetPath = '/monsters'
    targetQuery = { id: src.id }
  }
  else if (src.type === 'event' || src.type === 'explore') {
    targetPath = '/events'
    targetQuery = { [src.type]: src.id }
  }
  else if (src.type === 'plant' || src.type === 'container') {
    const seed = getCachedItem(src.type === 'container' ? src.sourceItemId : src.seedId)
    if (seed) openNestedItem(seed)
    return
  }
  else if (src.type === 'camp') {
    targetPath = '/facilities'
    targetQuery = { facility: 'camp', mode: 'building', building: src.building, level: src.level }
  }
  else if (src.type === 'achievement') targetPath = '/achievement'
  else if (src.type === 'recipe') {
    targetPath = '/recipes'
    targetQuery = { id: src.id || '' }
  }
  else if (src.type === 'pvp') {
    targetPath = '/misc'
    targetQuery = { id: src.id || '' }
  }
  else if (src.type === 'hidden') {
    targetPath = '/misc'
    targetQuery = { id: `hidden-${src.id}` }
  }
  else if (src.type === 'task') {
    targetPath = '/tasks'
    targetQuery = { task: src.id || '' }
  }
  else if (src.type === 'exchange') {
    targetPath = '/exchange'
    targetQuery = {
      cat: src.category || 'entrust',
      sub: src.sub || undefined
    }
  }
  else if (src.type === 'dungeon') {
    targetPath = '/dungeons'
    targetQuery = {
      battle: src.id || '',
      drop: src.itemId || props.item?.typeId || '',
      dropTab: src.dropTab || 'chest',
      dropEntry: src.dropEntry || ''
    }
  }
  else if (src.type === 'stage') {
    // 关卡来源：按 `stage` 定位到关卡图鉴的关卡详情（契约见 ChaptersView 的 route.query.stage）。
    targetPath = '/chapters'
    targetQuery = { stage: src.id || '' }
  }
  else if (src.type === 'smithing') {
    targetPath = '/facilities'
    targetQuery = { facility: 'blacksmith', mode: 'equipment', level: smithingRecipes.value[0]?.equipLevel || 1, item: props.item?.typeId || '' }
  }
  else if (src.type === 'facility') {
    targetPath = '/facilities'
    targetQuery = { facility: src.facility || 'workbench', mode: 'crafting', level: src.level || 1, item: props.item?.typeId || '' }
  }
  else if (src.type === 'gacha') {
    // 卡池来源（`remainingItemSources.js` 生成）：跳招募页并直接打开该池的概率详情。
    // URL 契约见 GachaView 顶部注释：`?kind=hero|pet&pool=<poolId>&view=pool`。
    // `pool` 必须用**完整 pool id**（如 `pet:1:1:0`）——GachaView 的 syncFromRoute 按
    // `pool.id` 校验，传 poolTypeId（如 `1`）会被判为无效并回退到默认池。
    targetPath = '/gacha'
    targetQuery = {
      kind: src.poolKind || 'hero',
      pool: src.id || '',
      view: 'pool'
    }
  }

  router
    .push({ path: targetPath, query: Object.keys(targetQuery).length ? targetQuery : undefined })
    .finally(() => emit('update:visible', false))
}

const recipeInfo = computed(() => {
  if (!props.item?.typeId) return null
  const recipe = menuDict.value[props.item.typeId]
  if (!recipe) return null

  const ingredients = (recipe.ingredients || []).map(ing => ({
    ...ing,
    icon: getImageUrl(ing.icon)
  }))

  return { ...recipe, typeId: recipe.id, ingredients }
})

// 料理的 useDes 是旧版展示文案，实际结算和现版本界面均以绑定 Buff 为准。
const isRecipeItem = computed(() => {
  const buffId = props.item?.useActionPara2?.buff || ''
  return !!recipeInfo.value || buffId.startsWith('cook_')
})
const displayUseDes = computed(() => isRecipeItem.value ? '' : (props.item?.useDes || ''))
const effectSectionTitle = computed(() => {
  if (isRecipeItem.value) return '料理效果'
  if (bookContent.value && !displayUseDes.value) return '内容展示'
  return '使用效果'
})

const handleIngredientClick = (typeId) => {
  const targetItem = getCachedItem(typeId)
  if (targetItem) {
    openNestedItem(targetItem)
  }
}

watch(() => props.visible, visible => {
  if (!visible) cancelBodyScrollRestore()
})

onBeforeUnmount(cancelBodyScrollRestore)
</script>

<style scoped>
/* 顶部品质信息区 */
.item-head {
  display: flex;
  gap: 16px;
  align-items: center;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  border-radius: 5px;
  padding: 16px;
  margin-bottom: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
}

.parameter-note {
  margin: 8px 2px 0;
  color: var(--text-muted, #6b5134);
  font-size: 12px;
  line-height: 1.6;
}
.icon-wrapper {
  width: 76px;
  height: 76px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(43, 31, 21, 0.2);
}
.item-icon {
  width: 62px;
  height: 62px;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
}
.head-info {
  flex: 1;
  min-width: 0;
}
.item-name {
  margin: 0 0 8px;
  font-size: 19px;
  font-weight: 700;
  text-shadow: none;
  -webkit-font-smoothing: antialiased;
}
.item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.copy-tag {
  cursor: pointer;
  user-select: none;
}
.copy-tag:active {
  opacity: 0.6;
}

.desc-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-main, #3e2a14);
  white-space: pre-wrap;
  text-align: justify;
}

/* 装备属性 */
.equip-meta-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.equip-meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  min-width: 64px;
}
.meta-val {
  font-size: 13px;
  color: var(--text-main, #3e2a14);
}
.equip-quality-toggles, .job-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.equip-enhance-control {
  margin: 0 0 12px;
  padding: 11px 13px;
}
.equip-enhance-header,
.equip-enhance-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.smithing-recipe {
  padding: 11px 12px;
  margin-bottom: 10px;
}
.smithing-recipe:last-child {
  margin-bottom: 0;
}
.smithing-recipe__head,
.smithing-recipe__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.smithing-recipe__head {
  justify-content: space-between;
  color: var(--text-main, #3e2a14);
  font-size: 14px;
  font-weight: 700;
}
.smithing-recipe__meta {
  margin-top: 5px;
  color: var(--text-muted, #6b5134);
  font-size: 13px;
}
.smithing-recipe__meta > span:not(:first-child) {
  font-weight: 700;
}
.smithing-recipe__output {
  margin: 5px 0 0;
  color: var(--text-muted, #6b5134);
  font-size: 13px;
  line-height: 1.6;
}
.smithing-recipe__materials {
  margin-top: 10px;
}
.smithing-recipe__label {
  display: block;
  margin-bottom: 7px;
  color: var(--text-muted, #6b5134);
  font-size: 13px;
  font-weight: 700;
}
.smithing-recipe .reward-grid {
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
}
.equip-enhance-header {
  margin-bottom: 9px;
  color: var(--text-main, #3e2a14);
  font-size: 13px;
  font-weight: 700;
}
.equip-enhance-header strong {
  color: var(--accent-ink, #557574);
}
.equip-enhance-slider {
  display: block;
  width: 100%;
  height: 6px;
  margin: 0;
  cursor: pointer;
  accent-color: var(--accent-bright, #7a9a99);
}
.equip-enhance-summary {
  margin-top: 9px;
  color: var(--text-muted, #6b5134);
  font-size: 12px;
}

/* 使用效果 */
.use-des {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-main, #3e2a14);
  white-space: pre-wrap;
}
.book-content-box {
  margin-bottom: 12px;
  padding: 12px 14px;
}
.book-para {
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-main, #3e2a14);
  margin: 0 0 8px;
  text-indent: 2em;
  text-align: justify;
}
.book-para:last-child {
  margin-bottom: 0;
}

/* 料理效果 / 配方 */
.recipe-effect-stacks {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 7px 2px;
  border-bottom: 1px dashed var(--border-soft, rgba(143, 115, 81, 0.45));
  color: var(--text-muted, #6b5134);
  font-size: 14px;
  font-weight: 700;
}
.recipe-effect-stacks strong {
  color: var(--accent-ink, #557574);
}
.skin-attribute-list {
  display: flex;
  flex-direction: column;
}
.skin-attribute-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 2px;
  border-bottom: 1px dashed var(--border-soft, rgba(143, 115, 81, 0.45));
  color: var(--text-muted, #6b5134);
  font-size: 14px;
  font-weight: 700;
}
.skin-attribute-row:last-child {
  border-bottom: 0;
}
.skin-attribute-row strong {
  color: var(--accent-ink, #557574);
}
.unlock-skin-owner {
  color: var(--text-muted, #6b5134);
  font-size: 12px;
  font-weight: 400;
}
.skin-portrait-preview {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 360px;
  overflow: hidden;
  border-width: 1px;
  border-style: solid;
  border-radius: 4px;
  background: rgba(122, 154, 153, 0.08);
}
.skin-portrait-preview.has-model {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.skin-preview-pane {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-width: 0;
}
.skin-preview-pane--model {
  align-items: center;
  align-self: stretch;
  padding: 12px;
}
.skin-portrait-preview img {
  display: block;
  width: min(100%, 520px);
  height: 440px;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 4px 10px rgba(43, 31, 21, 0.3));
}
.skin-preview-pane--model img {
  width: min(100%, 280px);
  height: 300px;
  object-position: center;
}
@media (max-width: 560px) {
  .skin-portrait-preview {
    min-height: 300px;
  }
  .skin-portrait-preview img {
    height: 360px;
  }
  .skin-portrait-preview.has-model { min-height: 250px; }
  .has-model .skin-preview-pane img { height: 250px; }
  .has-model .skin-preview-pane--model img { height: 210px; }
}
.recipe-ingredients-mini {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ingredient-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(43, 31, 21, 0.08);
  padding: 5px 10px;
  border-radius: 4px;
  border: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
  cursor: pointer;
  transition: all 0.18s;
  box-shadow: inset 0 1px 2px rgba(43, 31, 21, 0.1);
}
.ingredient-chip:hover {
  background: var(--hover-bg, rgba(85, 117, 116, 0.14));
  border-color: var(--accent-bright, #7a9a99);
}
.ing-icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
.ing-name {
  font-size: 13px;
  color: var(--text-main, #3e2a14);
  font-weight: 600;
}
.ing-count {
  font-size: 13px;
  color: var(--accent-ink, #557574);
  font-weight: 700;
}
.dark-mode .ing-count {
  color: var(--accent-bright, #93b3b2);
}
.recipe-preview-box {
  text-align: left;
}
.recipe-prev-img {
  max-width: 100%;
  height: auto;
  object-fit: contain;
  border-radius: 6px;
  border: 2px solid var(--border-color, #8f7351);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: block;
}

/* 符石 */
.rune-effect-box {
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-main, #3e2a14);
}

/* 奖励 */
.reward-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

/* 套装 */
.suit-items-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  margin: 0 0 8px;
}
.suit-effects-list {
  margin-top: 12px;
  padding: 12px 14px;
}
.suit-effect-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.65;
}
.suit-effect-row:last-child {
  margin-bottom: 0;
}
.suit-num-badge {
  color: var(--accent-ink, #557574);
  font-weight: 700;
  flex-shrink: 0;
}
.dark-mode .suit-num-badge {
  color: var(--accent-bright, #93b3b2);
}
.suit-desc {
  color: var(--text-main, #3e2a14);
}

/* 词条 */
.affix-groups-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.affix-group-block {
  padding: 12px 14px;
}
.affix-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.affix-row:last-child {
  margin-bottom: 0;
}
.affix-name {
  color: var(--accent-ink, #557574);
  font-weight: 700;
  font-size: 14px;
}
.dark-mode .affix-name {
  color: var(--accent-bright, #93b3b2);
}
.affix-desc {
  color: var(--text-main, #3e2a14);
  font-size: 13px;
  line-height: 1.65;
}

/* ===== 神器进阶 ===== */
.equip-upgrade {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.equip-upgrade__chain {
  display: flex;
  align-items: stretch;
  gap: 6px;
  overflow-x: auto;
  padding: 4px 2px 8px;
}
.equip-upgrade__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 8px 6px;
  border-radius: 10px;
  border: 2px solid transparent;
  cursor: pointer;
  flex: 0 0 auto;
  min-width: 88px;
  transition: transform 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
  position: relative;
}
.equip-upgrade__stage:hover {
  transform: translateY(-2px);
  background: rgba(122, 154, 153, 0.10);
}
.equip-upgrade__stage.is-active {
  border-color: var(--accent-bright, #7a9a99);
  background: rgba(122, 154, 153, 0.12);
}
.equip-upgrade__stage-no {
  font-size: 11px;
  color: var(--text-sub, #7a6a52);
  font-weight: 700;
}
.equip-upgrade__stage-card {
  width: 62px;
  height: 62px;
  border: 2px solid transparent;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.equip-upgrade__stage-name {
  font-size: 11px;
  font-weight: 700;
}
.equip-upgrade__stage-badge {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: var(--accent-bright, #7a9a99);
  border-radius: 3px;
  padding: 0 5px;
  line-height: 1.5;
}
.equip-upgrade__stage-arrow {
  display: flex;
  align-items: center;
  color: var(--text-sub, #7a6a52);
  font-size: 16px;
  flex: 0 0 auto;
  padding-bottom: 22px;
}
.equip-upgrade__icon {
  width: 54px;
  height: 54px;
  object-fit: contain;
  border-radius: 6px;
  background: rgba(43, 31, 21, 0.08);
}
.equip-upgrade__detail {
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--paper-soft, #e9dcc3);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.equip-upgrade__detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.equip-upgrade__detail-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-ink, #557574);
}
.equip-upgrade__toggle {
  margin-left: auto;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-ink, #557574);
  background: rgba(122, 154, 153, 0.14);
  border: 1px solid rgba(122, 154, 153, 0.45);
  border-radius: 4px;
  padding: 2px 10px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.equip-upgrade__toggle:hover {
  background: rgba(122, 154, 153, 0.26);
}
/* 阶段自身的属性 / 词条预览 */
.equip-upgrade__preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-faint, rgba(143, 115, 81, 0.25));
}
.equip-upgrade__preview-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-sub, #7a6a52);
}
.equip-upgrade__preview-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-sub, #7a6a52);
  margin-bottom: 6px;
}
.equip-upgrade__preview-none {
  font-size: 12px;
  color: var(--text-sub, #7a6a52);
  margin: 0;
}
.equip-upgrade__allcosts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.equip-upgrade__allcost-row {
  /* 统一两行：第一行阶段标题，第二行消耗卡；各阶段卡片左边缘对齐 */
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: rgba(43, 31, 21, 0.04);
}
.equip-upgrade__allcost-row.is-active {
  border-color: var(--accent-bright, #7a9a99);
  background: rgba(122, 154, 153, 0.10);
}
/* 全部消耗里的奖励卡用网格，自动均分/换行，起始位置一致 */
.equip-upgrade__allcost-row :deep(.reward-grid),
.equip-upgrade__allcost-row .reward-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(122px, 1fr));
  gap: 6px;
  width: 100%;
}
.equip-upgrade__allcost-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-sub, #7a6a52);
}
.equip-upgrade__allcost-money {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-ink, #557574);
}
.equip-upgrade__allcost-none {
  font-size: 12px;
  color: var(--text-sub, #7a6a52);
}
.dark-mode .equip-upgrade__allcost-row {
  background: rgba(255, 255, 255, 0.03);
}

/* 手机端：阶段条与消耗卡整体缩小，保证一屏能看完 */
@media (max-width: 640px) {
  .equip-upgrade {
    gap: 10px;
  }
  .equip-upgrade__chain {
    gap: 0;
    padding: 2px 0 4px;
    justify-content: space-between;
  }
  .equip-upgrade__stage {
    min-width: 56px;
    padding: 4px 3px 3px;
    gap: 1px;
  }
  .equip-upgrade__stage-card {
    width: 40px;
    height: 40px;
  }
  .equip-upgrade__icon {
    width: 34px;
    height: 34px;
  }
  .equip-upgrade__stage-no,
  .equip-upgrade__stage-name {
    font-size: 9px;
  }
  .equip-upgrade__stage-arrow {
    font-size: 10px;
    padding-bottom: 12px;
    flex: 0 0 auto;
  }
  .equip-upgrade__detail {
    padding: 8px 10px;
    gap: 8px;
  }
  .equip-upgrade__detail-head {
    gap: 6px;
  }
  .equip-upgrade__toggle {
    font-size: 11px;
    padding: 1px 8px;
  }
  /* 消耗奖励卡在窄屏用两列自适应，单卡更矮 */
  .equip-upgrade__detail .reward-grid,
  .equip-upgrade__allcost-row .reward-grid {
    grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
    gap: 4px;
  }
  .equip-upgrade__allcost-row {
    padding: 6px 8px;
    gap: 6px;
  }
  .equip-upgrade__allcost-label {
    min-width: 0;
    width: 100%;
    font-size: 11px;
  }
}
.equip-upgrade__consume {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.equip-upgrade__consume-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-sub, #7a6a52);
}
.equip-upgrade__money {
  display: flex;
  align-items: center;
  gap: 8px;
}
.equip-upgrade__money-val {
  font-weight: 700;
  color: var(--accent-ink, #557574);
  font-size: 14px;
}
.equip-upgrade__condition {
  font-size: 12px;
  color: var(--text-sub, #7a6a52);
  margin: 0;
}
.equip-upgrade__max {
  font-size: 13px;
  color: var(--text-sub, #7a6a52);
  margin: 0;
}
.dark-mode .equip-upgrade__detail {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
}
.dark-mode .equip-upgrade__icon {
  background: rgba(255, 255, 255, 0.08);
}

.unlock-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-main, #3e2a14);
  white-space: pre-wrap;
}

.home-item-unlock-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.home-item-unlock-link {
  width: 100%;
  min-height: 66px;
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 7px;
  text-align: left;
}

.home-item-unlock-icon {
  width: 50px;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.home-item-unlock-icon img {
  width: 90%;
  height: 90%;
  object-fit: contain;
}

.home-item-unlock-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.home-item-unlock-copy strong,
.home-item-unlock-copy small {
  overflow-wrap: anywhere;
}

.home-item-unlock-copy strong {
  color: var(--text-main, #3e2a14);
  font-size: 14px;
}

.home-item-unlock-copy small {
  color: var(--text-muted, #6b5134);
  font-size: 12px;
  line-height: 1.45;
}

.home-item-unlock-action {
  color: var(--accent-ink, #557574);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

@media (max-width: 480px) {
  .home-item-unlock-link {
    grid-template-columns: 46px minmax(0, 1fr);
  }

  .home-item-unlock-icon {
    width: 46px;
  }

  .home-item-unlock-action {
    grid-column: 2;
  }
}

.unlock-hero-usage {
  display: flex;
  align-items: center;
  min-height: 32px;
  color: var(--text-main, #3e2a14);
  font-size: 14px;
}

.unlock-hero-link {
  padding: 2px 6px;
  text-decoration: none;
}

.unlock-hero-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(43, 31, 21, 0.32));
}

.unlock-hero-name {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.star-usage-list {
  margin-top: 10px;
  border-top: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
}
.star-usage-row,
.star-usage-total {
  display: grid;
  grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  min-height: 38px;
  padding: 6px 2px;
  border-bottom: 1px solid var(--border-faint, rgba(143, 115, 81, 0.2));
  font-size: 14px;
}
.star-usage-label,
.star-usage-total span {
  color: var(--text-secondary, #735c42);
}
.star-usage-value,
.star-usage-total strong {
  color: var(--text-main, #3e2a14);
  text-align: right;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.star-usage-total {
  border-bottom: 0;
}

/* 获取途径 */
.source-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.source-group-name {
  display: inline-flex;
  align-items: center;
}
.source-drawer-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.drawer-chip {
  display: flex;
  align-items: center;
  background: rgba(233, 220, 195, 0.75);
  border: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
  border-radius: 4px;
  padding: 8px 12px;
  transition: all 0.15s;
}
.dark-mode .drawer-chip {
  background: rgba(63, 48, 32, 0.55);
}
.drawer-chip.clickable {
  cursor: pointer;
}
.drawer-chip.clickable:hover {
  border-color: var(--accent-bright, #7a9a99);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.22);
}
.source-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.source-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-des {
  font-size: 12px;
  color: var(--text-muted, #6b5134);
  margin-top: 1px;
}
.source-action-text {
  font-size: 12px;
  color: var(--accent-ink, #557574);
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
}
.dark-mode .source-action-text {
  color: var(--accent-bright, #93b3b2);
}
.origin-item {
  margin-bottom: 8px;
}
.origin-val {
  font-size: 14px;
  color: var(--text-main, #3e2a14);
}
.origin-placeholder {
  padding: 8px 0;
}

/* === 关联信息卡片：电脑端换行平铺，手机端横向滚动 === */
.related-scroll-wrapper {
  width: 100%;
  padding: 4px 2px;
}

.related-cards-track {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px 10px;
}

.related-item-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 66px;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}

.related-item-card:hover {
  z-index: 10;
}

.related-item-card__slot {
  position: relative;
  width: 66px;
  height: 66px;
  min-height: 0;
  min-width: 0;
  border-radius: 6px;
  border: 2px solid var(--border-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background: var(--paper-soft);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.related-item-card:hover .related-item-card__slot {
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.28);
}

.related-item-card:active .related-item-card__slot {
  transform: scale(0.96);
}

.related-item-card__icon {
  width: 82%;
  height: 82%;
  max-width: 82%;
  max-height: 82%;
  object-fit: contain;
  display: block;
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
}

.related-item-card__icon.is-hero,
.related-item-card__icon.is-pet,
.related-item-card__icon.is-monster {
  border-radius: 4px;
}

/* 关系类型小角标（右上角，与通关掉落角标风格一致） */
.related-item-card__tag {
  position: absolute;
  top: 2px;
  right: 2px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(28, 20, 12, 0.85);
  color: #fce8bd;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1.2;
  pointer-events: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  letter-spacing: -0.2px;
  white-space: nowrap;
}

.related-item-card__tag.tag-monster_drop {
  background: rgba(183, 28, 28, 0.92);
  color: #fff;
  border: 1px solid rgba(255, 112, 67, 0.7);
}
.related-item-card__tag.tag-smithing_product {
  background: rgba(191, 54, 12, 0.92);
  color: #fff;
  border: 1px solid rgba(255, 171, 0, 0.7);
}
.related-item-card__tag.tag-smithing_material {
  background: rgba(69, 90, 100, 0.92);
  color: #eceff1;
  border: 1px solid rgba(144, 164, 174, 0.7);
}
.related-item-card__tag.tag-hero_link {
  background: rgba(184, 115, 51, 0.92);
  color: #fff;
  border: 1px solid rgba(255, 215, 0, 0.6);
}
.related-item-card__tag.tag-harvest_product,
.related-item-card__tag.tag-harvest_source {
  background: rgba(46, 125, 50, 0.92);
  color: #e8f5e9;
  border: 1px solid rgba(129, 199, 132, 0.6);
}
.related-item-card__tag.tag-craft_product {
  background: rgba(21, 101, 192, 0.92);
  color: #e3f2fd;
  border: 1px solid rgba(100, 181, 246, 0.6);
}
.related-item-card__tag.tag-craft_material {
  background: rgba(109, 76, 65, 0.92);
  color: #efebe9;
  border: 1px solid rgba(161, 136, 127, 0.6);
}
.related-item-card__tag.tag-recipe_product,
.related-item-card__tag.tag-recipe_material {
  background: rgba(216, 67, 21, 0.92);
  color: #fbe9e7;
  border: 1px solid rgba(255, 138, 101, 0.6);
}
.related-item-card__tag.tag-pet_link {
  background: rgba(106, 27, 154, 0.92);
  color: #f3e5f5;
  border: 1px solid rgba(186, 104, 200, 0.6);
}
.related-item-card__tag.tag-similar {
  background: rgba(40, 53, 147, 0.92);
  color: #e8eaf6;
  border: 1px solid rgba(121, 134, 203, 0.6);
}
.related-item-card__tag.tag-current {
  background: rgba(184, 115, 51, 0.95);
  color: #fff;
  border: 1px solid rgba(255, 215, 0, 0.9);
}

.related-item-card.is-current .related-item-card__slot {
  border-color: #d4af37;
  box-shadow: 0 0 0 1.5px rgba(212, 175, 55, 0.7), 0 2px 6px rgba(0, 0, 0, 0.25);
}

/* 物品名称：与通关掉落一致居中并最多两行展示 */
.related-item-card__name {
  margin-top: 4px;
  width: 100%;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-main);
  text-align: center;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
  min-height: 29px;
}

.dark-mode .related-item-card__name {
  color: var(--text-main, #dfcfb2);
}

/* 手机移动端：保持横向滚动 */
@media (max-width: 640px) {
  .related-scroll-wrapper {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 4px 2px 8px;
    -webkit-overflow-scrolling: touch;
  }

  .related-cards-track {
    flex-wrap: nowrap;
    min-width: min-content;
    gap: 12px;
  }

  .related-scroll-wrapper::-webkit-scrollbar {
    height: 4px;
  }
  .related-scroll-wrapper::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.06);
    border-radius: 2px;
  }
  .related-scroll-wrapper::-webkit-scrollbar-thumb {
    background: rgba(143, 115, 81, 0.35);
    border-radius: 2px;
  }
  .related-scroll-wrapper::-webkit-scrollbar-thumb:hover {
    background: rgba(143, 115, 81, 0.65);
  }
  .dark-mode .related-scroll-wrapper::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
  }
  .dark-mode .related-scroll-wrapper::-webkit-scrollbar-thumb {
    background: rgba(212, 175, 55, 0.3);
  }
  .dark-mode .related-scroll-wrapper::-webkit-scrollbar-thumb:hover {
    background: rgba(212, 175, 55, 0.55);
  }
}

/* 种子生长过程面板 */
.growth-stages-panel {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  padding: 16px 14px 14px;
  gap: 12px;
}

.growth-stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  flex: 1;
  min-width: 0;
}

.growth-stage-icon-wrap {
  height: 64px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  margin-bottom: 8px;
  width: 100%;
}

.growth-stage-img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.22));
  transition: transform 0.2s ease;
}

.growth-stage-item:hover .growth-stage-img {
  transform: translateY(-2px) scale(1.05);
}

.growth-stage-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  line-height: 1.3;
  margin-bottom: 3px;
}

.growth-stage-time {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-muted, #6b5134);
  line-height: 1.2;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .growth-stages-panel {
    padding: 12px 6px 10px;
    gap: 4px;
  }
  .growth-stage-icon-wrap {
    height: 48px;
    margin-bottom: 6px;
  }
  .growth-stage-name {
    font-size: 11.5px;
  }
  .growth-stage-time {
    font-size: 10px;
    letter-spacing: -0.2px;
  }
}
</style>
