<template>
  <div class="page-view-container activity-dungeons-page">
    <!-- 顶部筛选面板 -->
    <UiFilterPanel class="filter-panel paper-panel">
      <template #search>
        <UiSearchInput
          :model-value="search"
          placeholder="搜索层数、怪物、事件、奖励或房间…"
          @update:model-value="search = $event"
        />
      </template>

      <!-- 活动/秘境切换（参考赛季筛选 pill：当前仅显示已开放秘境，后续新开自动出现） -->
      <UiFilterRow label="活动：">
        <UiFilterPill
          v-for="d in dungeons"
          :key="d.id"
          :active="activeDungeonId === d.id"
          @click="selectDungeon(d.id)"
        >
          {{ d.name }}
        </UiFilterPill>
      </UiFilterRow>

      <!-- 板块切换 -->
      <UiFilterRow label="板块：">
        <UiFilterPill
          v-for="t in tabOptions"
          :key="t.key"
          :active="activeTab === t.key"
          @click="selectTab(t.key)"
        >
          {{ t.label }}
        </UiFilterPill>
      </UiFilterRow>

      <!-- 子筛选：层级分段 -->
      <UiFilterRow v-if="activeTab === 'layers' && layerSectionOptions.length > 1" label="分段：">
        <UiFilterPill
          v-for="sec in layerSectionOptions"
          :key="sec.id"
          :active="activeSection === sec.id"
          @click="activeSection = sec.id"
        >
          {{ sec.label }}
        </UiFilterPill>
      </UiFilterRow>

      <!-- 子筛选：房间池类型 -->
      <UiFilterRow v-if="activeTab === 'rooms' && roomPoolOptions.length > 1" label="类型：">
        <UiFilterPill
          v-for="opt in roomPoolOptions"
          :key="opt.key"
          :active="activeRoomPool === opt.key"
          @click="activeRoomPool = opt.key"
        >
          {{ opt.label }}
        </UiFilterPill>
      </UiFilterRow>

      <!-- 摘要条与快捷操作 -->
      <div v-if="activeDungeon" class="filter-extra-bar">
        <div class="ad-summary-hint">
          <span class="hint-symbol">◆</span>
          <span class="hint-text">
            <strong>{{ activeDungeon.activityName || activeDungeon.name }}</strong>
            <template v-if="activeDungeon.timeText">（{{ activeDungeon.timeText }}）</template>
            · 共 <strong>{{ activeDungeon.summary.totalLayers }}</strong> 层
            · 首通合计 <strong>{{ activeDungeon.summary.totalFirstKe }}</strong> 氪金
          </span>
        </div>

        <div class="ad-quick-actions">
          <button
            v-if="activeDungeon.shop?.length"
            type="button"
            class="ad-action-btn"
            @click="shopModalOpen = true"
          >
            <span
              v-if="pointIconUrl"
              class="ad-btn-icon"
              :style="{ '--icon-url': cssUrl(pointIconUrl) }"
              aria-hidden="true"
            ></span>
            <span>{{ activeDungeon.pointItem?.name || '秘境' }}兑换</span>
            <span class="btn-arrow">→</span>
          </button>

          <button
            type="button"
            class="ad-action-btn"
            @click="goToRelicBoard"
          >
            <span
              class="ad-btn-icon"
              :style="{ '--icon-url': cssUrl(getImageUrl('/ui/relic_guide.webp')) }"
              aria-hidden="true"
            ></span>
            <span>遗器法盘模拟器</span>
            <span class="btn-arrow">→</span>
          </button>
        </div>
      </div>

      <div v-if="activeDungeon" class="collection-counter">
        <template v-if="activeTab === 'layers'">
          共 <span class="count-num">{{ filteredLayers.length }}</span> 层
        </template>
        <template v-else-if="activeTab === 'rooms'">
          共 <span class="count-num">{{ filteredRooms.length }}</span> 个随机战斗房
        </template>
        <template v-else-if="activeTab === 'events'">
          共 <span class="count-num">{{ filteredEvents.length }}</span> 个随机事件
        </template>
        <template v-else>
          秘境规则与实机机制说明
        </template>
      </div>
    </UiFilterPanel>

    <!-- 加载 / 错误态 -->
    <UiEmptyState v-if="loading" type="loading" text="正在加载活动副本数据…" />
    <UiEmptyState v-else-if="error" type="error" :text="error" @retry="loadData" />
    <UiEmptyState v-else-if="!activeDungeon" text="当前暂无已开放的活动副本" />

    <!-- 1. 层级挑战：与神匠之塔相同的 UiVirtualGrid 视口窗口化，长列表不卡顿 -->
    <UiVirtualGrid
      v-else-if="activeTab === 'layers'"
      ref="layerGridRef"
      id="activityDungeonScroll"
      class="ad-scroll-container ad-layers-scroll"
      :items="filteredLayers"
      item-key="layer"
      :estimate-size="310"
      :overscan="2"
    >
      <template #default="{ item: layer }">
        <article
          :id="`ad-layer-${layer.layer}`"
          class="ad-layer-card"
          :class="{ 'is-story-boss': layer.isStoryBoss, 'is-targeted': targetLayer === layer.layer }"
        >
            <!-- 左列：层徽章、门扉立绘、迷宫尺寸与步数 -->
            <div class="ad-layer-art-col">
              <div class="ad-floor-badge" :class="{ 'is-story': layer.isStoryBoss }">
                <span>{{ layer.isStoryBoss ? `第 ${layer.layer} 层 · 剧情` : `第 ${layer.layer} 层` }}</span>
              </div>

              <div class="ad-gate-box">
                <img
                  v-if="layer.layerImg"
                  :src="getImageUrl(layer.layerImg)"
                  :alt="layer.name"
                  class="ad-gate-img"
                  loading="lazy"
                  decoding="async"
                />
              </div>

              <div class="ad-maze-meta">
                <span>{{ layer.width }}×{{ layer.height }} 迷宫</span>
                <span>{{ layer.exploreStepNum }} 步/宝箱</span>
              </div>
            </div>

            <!-- 右列：属性缩放、固定战斗、随机构成、三档奖励 -->
            <div class="ad-layer-body">
              <div class="ad-layer-head">
                <div class="ad-layer-title-group">
                  <h3 class="ad-layer-title">{{ layer.name }}</h3>
                  <UiTag tone="accent">推荐 Lv.{{ layer.battleLevel }}</UiTag>
                  <span
                    v-if="layer.scaleHp !== 1 || layer.scaleAtk !== 1"
                    class="ad-scale-pill"
                    title="来源自游戏源码 Unit.cs / UnitAttribute.cs 关卡修正倍率"
                  >
                    关卡修正: 生命×{{ Math.round(layer.scaleHp * 100) }}% · 攻击×{{ Math.round(layer.scaleAtk * 100) }}%
                  </span>
                </div>

                <button
                  v-for="cost in layer.consume"
                  :key="`${layer.layer}-${cost.id}`"
                  type="button"
                  class="ad-cost-chip"
                  :title="`${cost.name} ×${cost.num}`"
                  @click="openItem(cost.id)"
                >
                  <span
                    v-if="cost.icon"
                    class="ad-mini-icon"
                    :style="{ '--icon-url': cssUrl(getImageUrl(`/images/Common_ItemIcon/${cost.icon}.webp`)) }"
                    aria-hidden="true"
                  ></span>
                  <span>{{ cost.name }} ×{{ cost.num }}</span>
                </button>
              </div>

              <!-- 固定遭遇（起点战 + 首领战） -->
              <div class="ad-encounters-box">
                <div v-if="layer.startRoom?.rounds?.length" class="ad-encounter-block">
                  <div class="ad-encounter-label">起点遭遇（{{ layer.startRoom.name }}）</div>
                  <div
                    v-for="(wave, wi) in layer.startRoom.rounds"
                    :key="`start-${wi}`"
                    class="ad-wave-row"
                  >
                    <span class="ad-wave-idx">第 {{ wi + 1 }} 波：</span>
                    <button
                      v-for="(mon, mi) in wave"
                      :key="`${mon.typeId}-${mi}`"
                      type="button"
                      class="ad-mon-pill"
                      :title="`查看【${mon.name}】Lv.${layer.battleLevel} 属性（生命×${Math.round(mon.levelScaleHp * 100)}% 攻击×${Math.round(mon.levelScale * 100)}%）`"
                      @click="onLayerMonsterClick(mon, layer.battleLevel)"
                    >
                      <img
                        :src="getWaveAvatarUrl(mon)"
                        :alt="mon.name"
                        class="ad-mon-avatar"
                        loading="lazy"
                        decoding="async"
                        @error="handleWaveAvatarError($event, mon)"
                      />
                      <span>{{ mon.name }}</span>
                      <span v-if="mon.count > 1" class="ad-mon-cnt">×{{ mon.count }}</span>
                    </button>
                  </div>
                </div>

                <div v-if="layer.bossRoom?.rounds?.length" class="ad-encounter-block">
                  <div class="ad-encounter-label is-boss">守关首领（{{ layer.bossRoom.name }}）</div>
                  <div
                    v-for="(wave, wi) in layer.bossRoom.rounds"
                    :key="`boss-${wi}`"
                    class="ad-wave-row"
                  >
                    <span class="ad-wave-idx">第 {{ wi + 1 }} 波：</span>
                    <button
                      v-for="(mon, mi) in wave"
                      :key="`${mon.typeId}-${mi}`"
                      type="button"
                      class="ad-mon-pill"
                      :title="`查看【${mon.name}】Lv.${layer.battleLevel} 属性（生命×${Math.round(mon.levelScaleHp * 100)}% 攻击×${Math.round(mon.levelScale * 100)}%）`"
                      @click="onLayerMonsterClick(mon, layer.battleLevel)"
                    >
                      <img
                        :src="getWaveAvatarUrl(mon)"
                        :alt="mon.name"
                        class="ad-mon-avatar"
                        loading="lazy"
                        decoding="async"
                        @error="handleWaveAvatarError($event, mon)"
                      />
                      <span>{{ mon.name }}</span>
                      <span v-if="mon.count > 1" class="ad-mon-cnt">×{{ mon.count }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 随机房间与事件分布 -->
              <div v-if="layer.randomSummary?.length" class="ad-random-mix">
                <span
                  v-for="(rr, ri) in layer.randomSummary"
                  :key="ri"
                  class="ad-mix-pill"
                  :class="{ 'is-link': rr.type === 'rooms' }"
                  @click="rr.type === 'rooms' ? jumpToRoomPool(rr.poolKey, layer.layer) : jumpToEvents()"
                >
                  {{ rr.label }} {{ rr.numMin === rr.numMax ? rr.numMin : `${rr.numMin}~${rr.numMax}` }}
                </span>
              </div>

              <!-- 三档奖励 -->
              <div class="ad-rewards-rows">
                <div v-if="hasRewardContent(layer.rewards.first)" class="ad-reward-row">
                  <span class="ad-reward-tag is-first">首通</span>
                  <div class="ad-reward-items">
                    <span
                      v-for="cur in layer.rewards.first.currencies"
                      :key="`fc-${cur.kind}`"
                      class="ad-reward-chip"
                    >
                      <span
                        v-if="cur.icon"
                        class="ad-mini-icon"
                        :style="{ '--icon-url': cssUrl(getImageUrl(`/images/Common_ItemIcon/${cur.icon}.webp`)) }"
                        aria-hidden="true"
                      ></span>
                      <span>{{ cur.label }} ×{{ cur.num }}</span>
                    </span>
                    <button
                      v-for="rule in flattenRewardRules(layer.rewards.first)"
                      :key="`fr-${rule.typeId}-${rule.rate}`"
                      type="button"
                      class="ad-reward-chip is-clickable"
                      :class="`q-${rule.quality}`"
                      @click="openItem(rule.typeId)"
                    >
                      <span
                        v-if="rule.icon"
                        class="ad-mini-icon"
                        :style="{ '--icon-url': cssUrl(getImageUrl(`/images/Common_ItemIcon/${rule.icon}.webp`)) }"
                        aria-hidden="true"
                      ></span>
                      <span>{{ rule.name }} {{ formatRuleCount(rule) }}</span>
                    </button>
                  </div>
                </div>

                <div v-if="hasRewardContent(layer.rewards.clear)" class="ad-reward-row">
                  <span class="ad-reward-tag">通关</span>
                  <div class="ad-reward-items">
                    <span
                      v-for="cur in layer.rewards.clear.currencies"
                      :key="`cc-${cur.kind}`"
                      class="ad-reward-chip"
                    >
                      <span
                        v-if="cur.icon"
                        class="ad-mini-icon"
                        :style="{ '--icon-url': cssUrl(getImageUrl(`/images/Common_ItemIcon/${cur.icon}.webp`)) }"
                        aria-hidden="true"
                      ></span>
                      <span>{{ cur.label }} ×{{ cur.num }}</span>
                    </span>
                    <button
                      v-for="rule in flattenRewardRules(layer.rewards.clear)"
                      :key="`cr-${rule.typeId}-${rule.rate}`"
                      type="button"
                      class="ad-reward-chip is-clickable"
                      :class="`q-${rule.quality}`"
                      @click="openItem(rule.typeId)"
                    >
                      <span
                        v-if="rule.icon"
                        class="ad-mini-icon"
                        :style="{ '--icon-url': cssUrl(getImageUrl(`/images/Common_ItemIcon/${rule.icon}.webp`)) }"
                        aria-hidden="true"
                      ></span>
                      <span>{{ rule.name }} {{ formatRuleCount(rule) }}<template v-if="rule.displayChance < 1"> ({{ Math.round(rule.displayChance * 100) }}%)</template></span>
                    </button>
                  </div>
                </div>

                <div v-if="hasRewardContent(layer.rewards.explore)" class="ad-reward-row">
                  <span class="ad-reward-tag is-explore">宝箱</span>
                  <div class="ad-reward-items">
                    <button
                      v-for="rule in flattenRewardRules(layer.rewards.explore)"
                      :key="`er-${rule.typeId}-${rule.rate}`"
                      type="button"
                      class="ad-reward-chip is-clickable"
                      :class="`q-${rule.quality}`"
                      @click="openItem(rule.typeId)"
                    >
                      <span
                        v-if="rule.icon"
                        class="ad-mini-icon"
                        :style="{ '--icon-url': cssUrl(getImageUrl(`/images/Common_ItemIcon/${rule.icon}.webp`)) }"
                        aria-hidden="true"
                      ></span>
                      <span>{{ rule.name }} {{ formatRuleCount(rule) }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
      </template>
      <template #empty>
        <UiEmptyState text="未找到符合条件的层数" />
      </template>
    </UiVirtualGrid>

    <!-- 2~4. 房间池 / 随机事件 / 玩法机制 -->
    <div v-else id="activityDungeonScroll" class="ad-scroll-container" data-main-scroll>
      <!-- 2. 遭遇房间池（支持按层切换关卡修正预览） -->
      <template v-if="activeTab === 'rooms'">
        <div class="ad-pool-toolbar">
          <div ref="layerDropdownRef" class="ad-layer-picker">
            <span class="ad-layer-picker-label">关卡修正预览：</span>
            <div class="ad-layer-dropdown">
              <button
                type="button"
                class="ad-layer-dropdown-btn"
                :aria-expanded="layerMenuOpen"
                @click="layerMenuOpen = !layerMenuOpen"
              >
                <span class="ad-dropdown-btn-text">
                  第 {{ previewLayerObj?.layer || 1 }} 层 · Lv.{{ previewLayerObj?.battleLevel || '-' }}
                  <span class="ad-dropdown-scale">
                    (生命×{{ Math.round((previewLayerObj?.scaleHp || 1) * 100) }}% · 攻击×{{ Math.round((previewLayerObj?.scaleAtk || 1) * 100) }}%)
                  </span>
                </span>
                <span class="ad-dropdown-caret" :class="{ 'is-open': layerMenuOpen }">▾</span>
              </button>
              <div v-if="layerMenuOpen" class="ad-layer-dropdown-menu" role="listbox">
                <button
                  v-for="l in activeDungeon.layers"
                  :key="l.layer"
                  type="button"
                  role="option"
                  :aria-selected="previewLayerNum === l.layer"
                  class="ad-layer-option"
                  :class="{ 'is-active': previewLayerNum === l.layer }"
                  @click="selectPreviewLayer(l.layer)"
                >
                  <span class="ad-opt-main">第 {{ l.layer }} 层 · Lv.{{ l.battleLevel }}</span>
                  <span class="ad-opt-sub">生命×{{ Math.round(l.scaleHp * 100) }}% · 攻击×{{ Math.round(l.scaleAtk * 100) }}%</span>
                </button>
              </div>
            </div>
          </div>
          <span class="ad-pool-tip">点击下方怪物胶囊，按所选层的关卡修正展示属性与技能</span>
        </div>

        <UiEmptyState v-if="filteredRooms.length === 0" text="未找到符合条件的随机房间" />
        <div v-else class="ad-rooms-grid">
          <article
            v-for="room in filteredRooms"
            :key="`${room.poolKey}-${room.roomTypeId}`"
            class="ad-room-card"
          >
            <div v-if="room.img" class="ad-room-cover">
              <img :src="getImageUrl(room.img)" :alt="room.name" loading="lazy" decoding="async" />
              <span class="ad-room-pool-badge">{{ room.poolLabel }}</span>
            </div>
            <div class="ad-room-body">
              <div class="ad-room-head">
                <h4>{{ room.name }}</h4>
                <span v-if="!room.img" class="ad-room-pool-inline">{{ room.poolLabel }}</span>
              </div>
              <p v-if="room.text" class="ad-room-desc">{{ room.text }}</p>
              <div class="ad-room-flags">
                <span v-if="room.forceTrigger" class="ad-flag-pill is-warn">踩入即战</span>
                <span v-if="room.lockAround" class="ad-flag-pill">封锁周围格</span>
                <span v-if="room.forceEscapeLostHpRatio > 0" class="ad-flag-pill is-warn">
                  逃跑扣血 {{ Math.round(room.forceEscapeLostHpRatio * 100) }}%
                </span>
              </div>

              <div class="ad-room-waves">
                <div v-for="(wave, wi) in room.rounds" :key="wi" class="ad-wave-row">
                  <span class="ad-wave-idx">第 {{ wi + 1 }} 波：</span>
                  <button
                    v-for="(mon, mi) in wave"
                    :key="`${mon.typeId}-${mi}`"
                    type="button"
                    class="ad-mon-pill"
                    @click="onPoolMonsterClick(mon)"
                  >
                    <img
                      :src="getWaveAvatarUrl(mon)"
                      :alt="mon.name"
                      class="ad-mon-avatar"
                      loading="lazy"
                      decoding="async"
                      @error="handleWaveAvatarError($event, mon)"
                    />
                    <span>{{ mon.name }}</span>
                    <span v-if="mon.count > 1" class="ad-mon-cnt">×{{ mon.count }}</span>
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </template>

      <!-- 3. 随机事件 -->
      <template v-else-if="activeTab === 'events'">
        <UiEmptyState v-if="filteredEvents.length === 0" text="未找到符合条件的秘境事件" />
        <div v-else class="ad-events-grid">
          <article
            v-for="ev in filteredEvents"
            :key="ev.id"
            class="ad-event-card"
            tabindex="0"
            role="button"
            @click="openEvent(ev)"
            @keydown.enter.prevent="openEvent(ev)"
            @keydown.space.prevent="openEvent(ev)"
          >
            <div v-if="ev.coverImg" class="ad-event-cover">
              <img :src="getImageUrl(ev.coverImg)" :alt="ev.title" loading="lazy" decoding="async" />
            </div>
            <div class="ad-event-body">
              <div class="ad-event-head">
                <h4>{{ ev.title }}</h4>
                <span class="ad-event-node-cnt">{{ Object.keys(ev.nodes || {}).length }} 节点</span>
              </div>
              <p class="ad-event-snippet">{{ ev.nodes?.[ev.startNodeId]?.text }}</p>
              <span class="ad-event-cta">查看选项与分支 →</span>
            </div>
          </article>
        </div>
      </template>

      <!-- 4. 玩法机制 -->
      <template v-else>
        <div class="ad-rules-wrap">
          <UiSection title="秘境全局 Buff">
            <div class="ad-global-buffs">
              <div
                v-for="b in activeDungeon.heroBuffs"
                :key="b.id"
                class="ad-global-buff-card is-hero"
              >
                <img
                  v-if="b.icon"
                  :src="getImageUrl(`/images/CombatPanel_Atlas/${b.icon}.webp`)"
                  :alt="b.name"
                  class="ad-global-buff-icon"
                />
                <div>
                  <div class="ad-global-buff-title">我方全局增益 · {{ b.name }}</div>
                  <div class="ad-global-buff-desc">{{ b.desc }}</div>
                </div>
              </div>

              <div
                v-for="b in activeDungeon.enemyBuffs"
                :key="b.id"
                class="ad-global-buff-card is-enemy"
              >
                <img
                  v-if="b.icon"
                  :src="getImageUrl(`/images/CombatPanel_Atlas/${b.icon}.webp`)"
                  :alt="b.name"
                  class="ad-global-buff-icon"
                />
                <div>
                  <div class="ad-global-buff-title">敌方词条（{{ Math.round(b.rate * 100) }}% 概率）· {{ b.name }}</div>
                  <div class="ad-global-buff-desc">{{ b.desc }}</div>
                </div>
              </div>
            </div>
          </UiSection>

          <UiSection title="探索与结算规则（依据游戏源码）">
            <div class="ad-rule-copy">
              <p><b>随机迷宫生成</b>：每层进入时按递归回溯算法现算 <code>width × height</code> 迷宫（第 1～2 层 7×7，逐步扩至第 19～20 层 10×10），非固定平面地图。</p>
              <p><b>宝箱与探索进度</b>：每走 <code>exploreStepNum</code>（6）步触发探索宝箱累计；击败本层守关首领时带出全部持有宝箱并结算通关奖励；若中途失败或撤离，仅保留 <b>半数宝箱（向下取整，<code>curBoxNum / 2</code>）</b>。</p>
              <p><b>强制战斗与逃跑</b>：带有「封锁周围格 / 踩入即战」标记的战斗房在未击败前会锁住周边格；逃跑将扣除对应比例队伍生命值（普通/中等/困难战斗房为 10%，首领房不扣血）。</p>
              <p><b>怪物关卡修正</b>：同层所有战斗（含随机房、事件战斗、首领房）共享该层的 <code>battleLevel</code>、<code>battleLevelScale</code>（攻击修正）与 <code>battleLevelScaleHp</code>（生命修正）。</p>
              <p><b>遗器法盘作用域</b>：法盘上嵌入的遗器属性与共鸣技能仅在本秘境战斗内生效，不影响主线、日常或神匠之塔。</p>
            </div>
          </UiSection>
        </div>
      </template>
    </div>

    <!-- 兑换弹窗 -->
    <UiModal
      :visible="shopModalOpen"
      :title="`${activeDungeon?.pointItem?.name || '秘境'}兑换`"
      width="780px"
      @update:visible="shopModalOpen = $event"
    >
      <div v-if="activeDungeon" class="ad-shop-modal">
        <div class="ad-shop-intro">
          <span
            v-if="pointIconUrl"
            class="ad-shop-icon-lg"
            :style="{ '--icon-url': cssUrl(pointIconUrl) }"
            aria-hidden="true"
          ></span>
          <div>
            <h4>{{ activeDungeon.pointItem?.name || '夜之符' }}</h4>
            <p>{{ activeDungeon.pointItem?.desc || '在秘境中获取的专属兑换货币，可在此兑换限定家具图纸、传奇装备与召唤券。' }}</p>
          </div>
        </div>

        <div class="ad-shop-grid">
          <div v-for="entry in activeDungeon.shop" :key="entry.id" class="ad-shop-card">
            <div class="ad-shop-card-icon">
              <UiItemCard
                v-if="entry.rewardItem"
                :name="entry.rewardItem.name"
                :img="getImageUrl(`/Common_ItemIcon/${entry.rewardItem.icon}.webp`)"
                :quality="entry.rewardItem.quality"
                :count="entry.rewardItem.num"
                @click="openItem(entry.rewardItem.id)"
              />
            </div>
            <div class="ad-shop-card-info">
              <div class="ad-shop-card-head">
                <span class="ad-shop-card-title">{{ entry.rewardItem?.name || entry.name }}</span>
                <span class="ad-shop-limit">{{ entry.limitText }}</span>
              </div>
              <p class="ad-shop-card-desc">{{ entry.rewardItem?.desc || '活动秘境限定兑换物品。' }}</p>
              <div class="ad-shop-costs">
                <span class="ad-cost-label">兑换消耗：</span>
                <span v-for="c in entry.costs" :key="`${entry.id}-${c.id}`" class="ad-cost-pill">
                  <span
                    v-if="c.icon"
                    class="ad-mini-icon"
                    :style="{ '--icon-url': cssUrl(getImageUrl(`/images/Common_ItemIcon/${c.icon}.webp`)) }"
                    aria-hidden="true"
                  ></span>
                  <span>{{ c.name }} ×{{ c.num }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UiModal>

    <!-- 事件分支弹窗 -->
    <ActivityDungeonEventModal
      :visible="eventModalOpen"
      :event="activeEvent"
      :preview-layer="previewLayerObj"
      @update:visible="onEventModalVisibleChange"
      @open-item="openItem"
      @open-monster="onEventMonsterClick"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiFilterPanel from '../components/ui/UiFilterPanel.vue'
import UiFilterRow from '../components/ui/UiFilterRow.vue'
import UiFilterPill from '../components/ui/UiFilterPill.vue'
import UiSearchInput from '../components/ui/UiSearchInput.vue'
import UiEmptyState from '../components/ui/UiEmptyState.vue'
import UiTag from '../components/ui/UiTag.vue'
import UiModal from '../components/ui/UiModal.vue'
import UiItemCard from '../components/ui/UiItemCard.vue'
import UiSection from '../components/ui/UiSection.vue'
import UiVirtualGrid from '../components/ui/UiVirtualGrid.vue'
import ActivityDungeonEventModal from '../components/activity/ActivityDungeonEventModal.vue'
import { getImageUrl } from '../utils/env.js'
import { fetchWithFallback } from '../utils/request.js'
import { fetchItemData } from '../utils/itemParser.js'
import { openMonsterDetail } from '../utils/monsterModalState.js'
import { openItemDetail } from '../utils/itemModalState.js'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref('')
const dungeons = ref([])

const activeDungeonId = ref('')
const activeTab = ref('layers')
const activeSection = ref('all')
const activeRoomPool = ref('all')
const search = ref('')
const previewLayerNum = ref(1)
const layerMenuOpen = ref(false)
const layerDropdownRef = ref(null)
const layerGridRef = ref(null)
const targetLayer = ref(null)

const shopModalOpen = ref(false)
const eventModalOpen = ref(false)
const activeEvent = ref(null)

const tabOptions = [
  { key: 'layers', label: '层级挑战' },
  { key: 'rooms', label: '遭遇房间池' },
  { key: 'events', label: '随机事件' },
  { key: 'rules', label: '玩法机制' }
]

const cssUrl = url => (url ? `url(${JSON.stringify(url)})` : 'none')

const activeDungeon = computed(() =>
  dungeons.value.find(d => d.id === activeDungeonId.value) || dungeons.value[0] || null
)

const pointIconUrl = computed(() => {
  const icon = activeDungeon.value?.pointItem?.icon
  return icon ? getImageUrl(`/images/Common_ItemIcon/${icon}.webp`) : ''
})

const previewLayerObj = computed(() => {
  const layers = activeDungeon.value?.layers || []
  return layers.find(l => l.layer === previewLayerNum.value) || layers[0] || null
})

const layerSectionOptions = computed(() => {
  const layers = activeDungeon.value?.layers || []
  const maxLayer = layers.reduce((m, l) => Math.max(m, Number(l.layer) || 0), 0)
  const opts = [{ id: 'all', label: `全部 (${layers.length}层)` }]
  for (let start = 1; start <= maxLayer; start += 5) {
    const end = Math.min(start + 4, maxLayer)
    opts.push({ id: `${start}-${end}`, label: `${start}-${end}层` })
  }
  const storyCount = layers.filter(l => l.isStoryBoss).length
  if (storyCount > 0) opts.push({ id: 'story', label: `剧情首领 (${storyCount})` })
  return opts
})

const roomPoolOptions = computed(() => {
  const pools = activeDungeon.value?.roomPools || []
  const total = pools.reduce((s, p) => s + p.rooms.length, 0)
  return [
    { key: 'all', label: `全部 (${total})` },
    ...pools.map(p => ({ key: p.key, label: `${p.label} (${p.rooms.length})` }))
  ]
})

const flattenRewardRules = rewardObj => {
  if (!rewardObj?.groups?.length) return []
  const list = []
  for (const grp of rewardObj.groups) {
    for (const r of grp.rules || []) {
      list.push({
        ...r,
        rate: grp.rate,
        displayChance: Number(((grp.rate ?? 1) * (r.chance ?? 1)).toFixed(4))
      })
    }
  }
  return list
}

const hasRewardContent = rewardObj =>
  Boolean(rewardObj && ((rewardObj.currencies?.length || 0) > 0 || flattenRewardRules(rewardObj).length > 0))

const formatRuleCount = rule => (rule.min === rule.max ? `×${rule.min}` : `×${rule.min}~${rule.max}`)

const filteredLayers = computed(() => {
  let list = activeDungeon.value?.layers || []
  if (activeSection.value === 'story') {
    list = list.filter(l => l.isStoryBoss)
  } else if (/^\d+-\d+$/.test(activeSection.value)) {
    const [s, e] = activeSection.value.split('-').map(Number)
    list = list.filter(l => l.layer >= s && l.layer <= e)
  }

  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(l => {
    if (String(l.layer).includes(q) || l.name.toLowerCase().includes(q)) return true
    const roomMons = [
      ...(l.startRoom?.rounds || []).flat(),
      ...(l.bossRoom?.rounds || []).flat()
    ]
    if (roomMons.some(m => m.name.toLowerCase().includes(q))) return true
    const allRules = [
      ...flattenRewardRules(l.rewards.first),
      ...flattenRewardRules(l.rewards.clear),
      ...flattenRewardRules(l.rewards.explore)
    ]
    return allRules.some(r => r.name.toLowerCase().includes(q))
  })
})

const filteredRooms = computed(() => {
  const pools = activeDungeon.value?.roomPools || []
  const flat = pools.flatMap(p => p.rooms.map(r => ({ ...r, poolKey: p.key, poolLabel: p.label })))
  let list = activeRoomPool.value === 'all' ? flat : flat.filter(r => r.poolKey === activeRoomPool.value)
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(r =>
    r.name.toLowerCase().includes(q)
    || r.text.toLowerCase().includes(q)
    || r.poolLabel.toLowerCase().includes(q)
    || (r.rounds || []).flat().some(m => m.name.toLowerCase().includes(q))
  )
})

const filteredEvents = computed(() => {
  const list = activeDungeon.value?.events || []
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(ev => {
    if (ev.title.toLowerCase().includes(q)) return true
    return Object.values(ev.nodes || {}).some(node =>
      (node.text || '').toLowerCase().includes(q)
      || (node.options || []).some(opt => (opt.buttonText || '').toLowerCase().includes(q))
    )
  })
})

const updateQuery = patch => {
  router.replace({ path: '/activity-dungeons', query: { ...route.query, ...patch } })
}

const selectDungeon = id => {
  activeDungeonId.value = id
  activeSection.value = 'all'
  activeRoomPool.value = 'all'
  updateQuery({ dungeon: id })
}

const selectTab = key => {
  activeTab.value = key
  updateQuery({ tab: key })
}

const jumpToRoomPool = (poolKey, layerNum) => {
  activeTab.value = 'rooms'
  activeRoomPool.value = poolKey || 'all'
  if (layerNum) previewLayerNum.value = layerNum
  updateQuery({ tab: 'rooms' })
}

const jumpToEvents = () => {
  activeTab.value = 'events'
  updateQuery({ tab: 'events' })
}

const goToRelicBoard = () => {
  router.push({ path: '/relics', query: { tab: 'sim' } })
}

const openItem = async itemId => {
  if (!itemId) return
  try {
    const { items, categoryTree } = await fetchItemData()
    const found = items.find(i => i.typeId === itemId)
    if (found) {
      openItemDetail(found, categoryTree)
      return
    }
  } catch (err) {
    console.error('Failed to load item detail:', err)
  }
  router.push({ query: { ...route.query, itemId } })
}

const openEvent = ev => {
  activeEvent.value = ev
  eventModalOpen.value = true
  updateQuery({ tab: 'events', event: ev.id })
}

const onEventModalVisibleChange = val => {
  eventModalOpen.value = val
  if (!val && route.query.event) {
    const next = { ...route.query }
    delete next.event
    router.replace({ path: '/activity-dungeons', query: next })
  }
}

const onLayerMonsterClick = (mon, level) => {
  if (!mon?.typeId) return
  openMonsterDetail(mon.typeId, null, level, {
    scaleHp: mon.levelScaleHp || 1,
    scaleAtk: mon.levelScale || 1
  })
}

const onPoolMonsterClick = mon => {
  const layer = previewLayerObj.value
  const level = layer?.battleLevel || 1
  const scaleAtk = Number(((mon.monScaleAtk || 1) * (layer?.scaleAtk || 1)).toFixed(4))
  const scaleHp = Number(((mon.monScaleHp || 1) * (layer?.scaleHp || 1)).toFixed(4))
  openMonsterDetail(mon.typeId, null, level, { scaleHp, scaleAtk })
}

const onEventMonsterClick = mon => {
  const level = previewLayerObj.value?.battleLevel || 1
  openMonsterDetail(mon.typeId, null, level, {
    scaleHp: mon.levelScaleHp || 1,
    scaleAtk: mon.levelScale || 1
  })
}

const getWaveAvatarUrl = mon => getImageUrl(`/images/HeadIconAtals/${mon.icon || 'avatar_Mon_001'}.webp`)

const handleWaveAvatarError = (e, mon) => {
  const target = e.target
  if (!target) return
  if (!target.src.includes('model-previews') && mon?.typeId) {
    target.src = getImageUrl(`/images/model-previews/mon_${String(mon.typeId).toLowerCase()}.webp`)
    return
  }
  if (!target.src.includes('avatar_Mon_001')) {
    target.src = getImageUrl('/images/HeadIconAtals/avatar_Mon_001.webp')
  }
}

const scrollToTargetLayer = async layerNum => {
  if (!layerNum) return
  const index = filteredLayers.value.findIndex(l => l.layer === layerNum)
  if (index < 0) return
  await nextTick()
  await nextTick()
  await layerGridRef.value?.scrollToItem(index)
}

const syncFromRoute = () => {
  const q = route.query || {}
  if (q.dungeon && dungeons.value.some(d => d.id === q.dungeon)) {
    activeDungeonId.value = String(q.dungeon)
  } else if (!activeDungeonId.value && dungeons.value.length) {
    activeDungeonId.value = dungeons.value[0].id
  }

  if (q.tab && tabOptions.some(t => t.key === q.tab)) {
    activeTab.value = String(q.tab)
  }

  const layerParam = Number(q.layer)
  if (Number.isFinite(layerParam) && layerParam > 0) {
    targetLayer.value = layerParam
    previewLayerNum.value = layerParam
    activeSection.value = 'all'
    if (activeTab.value === 'layers') scrollToTargetLayer(layerParam)
  } else {
    targetLayer.value = null
  }

  if (q.event && activeDungeon.value) {
    const matched = activeDungeon.value.events.find(e => e.id === q.event)
    if (matched) {
      activeTab.value = 'events'
      activeEvent.value = matched
      eventModalOpen.value = true
    }
  }
}

watch(() => route.query, () => {
  if (!loading.value && dungeons.value.length) syncFromRoute()
})

const loadData = async () => {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchWithFallback('data/parsed/activity-dungeons.json')
    dungeons.value = data.dungeons || []
    if (dungeons.value.length) {
      activeDungeonId.value = dungeons.value[0].id
      previewLayerNum.value = dungeons.value[0].layers?.[0]?.layer || 1
      syncFromRoute()
    }
  } catch (err) {
    error.value = err?.message || '加载活动副本数据失败'
  } finally {
    loading.value = false
  }
}

const selectPreviewLayer = layerNum => {
  previewLayerNum.value = layerNum
  layerMenuOpen.value = false
}

const handleDocumentClick = e => {
  if (!layerMenuOpen.value) return
  if (layerDropdownRef.value && !layerDropdownRef.value.contains(e.target)) {
    layerMenuOpen.value = false
  }
}

const handleDocumentKeydown = e => {
  if (e.key === 'Escape' && layerMenuOpen.value) {
    layerMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleDocumentKeydown)
  loadData()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<style scoped>
.activity-dungeons-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.filter-panel {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.collection-counter {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted, #7b6348);
  margin-top: 8px;
}

.count-num {
  color: var(--accent-ink, #2563eb);
  font-weight: 700;
}

.filter-extra-bar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(143, 115, 81, 0.08);
  border: 1px dashed rgba(143, 115, 81, 0.35);
  border-radius: 6px;
  gap: 10px;
}

.ad-summary-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-main);
}

.hint-symbol {
  color: var(--text-muted, #8f7351);
  font-size: 12px;
}

.ad-quick-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ad-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--ad-btn-bg, linear-gradient(135deg, #e5d5be 0%, #cfba9f 100%));
  border: 1px solid var(--ad-btn-border, rgba(143, 115, 81, 0.5));
  color: var(--text-main, #3e2a14);
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(62, 42, 20, 0.1);
  transition: all 0.2s ease;
}

.ad-action-btn:hover {
  background: var(--ad-btn-hover-bg, linear-gradient(135deg, #eedfc8 0%, #dbcbaf 100%));
  transform: translateY(-1px);
  box-shadow: 0 3px 6px rgba(62, 42, 20, 0.15);
}

.btn-arrow {
  font-size: 14px;
  color: var(--text-muted, #8f7351);
}

.ad-btn-icon,
.ad-mini-icon {
  display: inline-block;
  flex-shrink: 0;
  width: 17px;
  height: 17px;
  background-image: var(--icon-url, none);
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}

/* 滚动容器：移动端（<=1024px）独立承担滚动，桌面端由 App.vue 交回整页滚动 */
.ad-scroll-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
  padding-bottom: calc(20px + var(--safe-bottom, 0px));
  box-sizing: border-box;
  background: var(--ad-scroll-bg, #d7c4a4);
  border-radius: 8px;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.32));
}

/*
 * UiVirtualGrid 列模板必须写在 `.ui-card-grid` 上（同 TowerView.vue）。
 * UiVirtualGrid 从这里读取列数后再内联写给每行 .ui-virtual-grid__row。
 */
.ad-layers-scroll :deep(.ui-card-grid) {
  grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
  gap: 14px;
  align-content: start;
}

@media (max-width: 1024px) {
  .ad-scroll-container {
    padding: 12px;
    padding-bottom: calc(88px + var(--floating-control-size, 44px) + var(--safe-bottom, 0px));
  }
}

@media (max-width: 600px) {
  .ad-layers-scroll :deep(.ui-card-grid) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .ad-layer-card {
    flex-direction: column;
  }
  .ad-layer-art-col {
    width: 100% !important;
    min-width: 0 !important;
    border-right: none !important;
    border-bottom: 1px dashed rgba(143, 115, 81, 0.25);
    padding: 10px 12px !important;
    flex-direction: row !important;
    justify-content: space-between;
  }
  .ad-floor-badge {
    position: static !important;
    width: auto !important;
  }
  .ad-gate-box {
    width: 68px !important;
    height: 68px !important;
  }
}

.ad-layer-card {
  display: flex;
  background: var(--paper-soft, #e9dcc3);
  border: 1px solid rgba(143, 115, 81, 0.34);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 5px rgba(62, 42, 20, 0.06);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.ad-layer-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 12px rgba(62, 42, 20, 0.12);
  border-color: rgba(143, 115, 81, 0.55);
}

.ad-layer-card.is-story-boss {
  background: var(--ad-boss-bg, linear-gradient(180deg, #ede0c8 0%, #e3d1b2 100%));
  border: 1.5px solid var(--ad-boss-border, #cfa04b);
  box-shadow: 0 3px 8px rgba(182, 123, 45, 0.12);
}

.ad-layer-card.is-targeted {
  outline: 3px solid #b67b2d;
  box-shadow: 0 0 16px rgba(182, 123, 45, 0.4);
}

.ad-layer-art-col {
  width: 132px;
  min-width: 132px;
  flex-shrink: 0;
  background-color: rgba(143, 115, 81, 0.05);
  border-right: 1px dashed rgba(143, 115, 81, 0.22);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
  padding: 32px 10px 12px;
  box-sizing: border-box;
}

.ad-floor-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #4a789c;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.ad-floor-badge.is-story {
  background: linear-gradient(135deg, #b83823 0%, #8c1e0e 100%);
  border: 1px solid #ffcc66;
  color: #fff;
}

.ad-gate-box {
  width: 100px;
  height: 108px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ad-gate-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 3px 6px rgba(62, 42, 20, 0.16));
}

.ad-maze-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--text-muted, #7b6348);
  font-weight: 600;
}

.ad-layer-body {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ad-layer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.ad-layer-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ad-layer-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}

.ad-scale-pill {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ad-gold-text, #8c5d1e);
  background: rgba(186, 140, 70, 0.12);
  border: 1px solid rgba(186, 140, 70, 0.35);
}

.ad-cost-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(143, 115, 81, 0.1);
  border: 1px solid rgba(143, 115, 81, 0.22);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  cursor: pointer;
}

.ad-encounters-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ad-encounter-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--ad-enc-bg, rgba(143, 115, 81, 0.06));
  border-left: 3px solid #8f7351;
}

.ad-encounter-label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
}

.ad-encounter-label.is-boss {
  color: var(--ad-boss-title, #a42a18);
}

.ad-wave-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.ad-wave-idx {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  white-space: nowrap;
}

.ad-mon-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 3px;
  border-radius: 4px;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.32));
  background: var(--ad-pill-bg, rgba(255, 250, 240, 0.55));
  color: var(--text-main, #3e2a14);
  font-size: 11.5px;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(43, 31, 21, 0.04);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ad-mon-pill:hover {
  background: var(--ad-pill-hover-bg, rgba(250, 242, 226, 0.9));
  border-color: #8f7351;
  transform: translateY(-1px);
}

.ad-mon-avatar {
  width: 19px;
  height: 19px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(143, 115, 81, 0.25);
}

.ad-mon-cnt {
  font-weight: 700;
  color: var(--ad-count-color, #a16207);
}

.ad-random-mix {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ad-mix-pill {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(143, 115, 81, 0.14);
  border: 1px solid rgba(143, 115, 81, 0.24);
  color: var(--text-muted, #6b5134);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.ad-mix-pill:hover {
  background: rgba(143, 115, 81, 0.25);
  color: var(--text-main, #3e2a14);
}

.ad-rewards-rows {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed rgba(143, 115, 81, 0.25);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ad-reward-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.ad-reward-tag {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(143, 115, 81, 0.2);
  color: var(--text-main, #4e3422);
  font-size: 11px;
  font-weight: 700;
  margin-top: 2px;
}

.ad-reward-tag.is-first {
  background: #a42a18;
  color: #fff6e8;
}

.ad-reward-tag.is-explore {
  background: #38664e;
  color: #f4fbf6;
}

.ad-reward-items {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ad-reward-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 5px;
  border-radius: 12px;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.32));
  background: var(--ad-chip-bg, rgba(255, 250, 240, 0.62));
  color: var(--text-main, #3e2a14);
  font-size: 11.5px;
  font-weight: 600;
}

.ad-reward-chip.is-clickable {
  cursor: pointer;
}

.ad-reward-chip.is-clickable:hover {
  background: var(--ad-chip-hover-bg, rgba(250, 242, 226, 0.92));
  border-color: #8f7351;
}

.ad-reward-chip.q-4 {
  color: var(--ad-q4-color, #633f82);
  border-color: var(--ad-q4-border, #c4abd5);
}

.ad-reward-chip.q-5 {
  color: var(--ad-q5-color, #8c5d1e);
  border-color: var(--ad-q5-border, #d4a753);
  background: var(--ad-q5-bg, rgba(246, 232, 200, 0.78));
}

/* 房间池：自定义羊皮纸下拉选择器 */
.ad-pool-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--paper-soft, #f7efe1);
  border: 1px solid rgba(143, 115, 81, 0.32);
}

.ad-layer-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  position: relative;
}

.ad-layer-picker-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}

.ad-layer-dropdown {
  position: relative;
}

.ad-layer-dropdown-btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(143, 115, 81, 0.45);
  background: var(--ad-dropdown-bg, linear-gradient(180deg, #faf2e4 0%, #efe1c9 100%));
  color: var(--text-main, #3e2a14);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(62, 42, 20, 0.08);
}

.ad-layer-dropdown-btn:hover {
  border-color: #8f7351;
}

.ad-dropdown-scale {
  color: var(--text-muted, #7b6348);
  font-size: 12px;
  font-weight: 500;
}

.ad-dropdown-caret {
  font-size: 11px;
  color: var(--text-muted, #7b6348);
  transition: transform 0.15s ease;
}

.ad-dropdown-caret.is-open {
  transform: rotate(180deg);
}

.ad-layer-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  min-width: 100%;
  width: max-content;
  max-width: min(360px, 86vw);
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 8px;
  background: var(--paper-soft, #f7efe1);
  border: 1px solid rgba(143, 115, 81, 0.52);
  box-shadow: 0 10px 24px rgba(43, 31, 21, 0.24);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ad-layer-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-main, #3e2a14);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.ad-layer-option:hover {
  background: rgba(143, 115, 81, 0.14);
}

.ad-layer-option.is-active {
  background: var(--ad-active-bg, #4e3422);
  color: var(--ad-active-color, #fff6e8);
}

.ad-opt-main {
  font-weight: 700;
  white-space: nowrap;
}

.ad-opt-sub {
  font-size: 11.5px;
  opacity: 0.85;
  white-space: nowrap;
}

.ad-pool-tip {
  font-size: 12px;
  color: var(--text-muted, #7b6348);
}

.ad-rooms-grid,
.ad-events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.ad-room-card,
.ad-event-card {
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(143, 115, 81, 0.32);
  background: var(--paper-soft, #f7efe1);
  box-shadow: 0 2px 5px rgba(62, 42, 20, 0.06);
  user-select: none;
  -webkit-user-select: none;
}

.ad-event-card {
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.ad-event-card:hover {
  transform: translateY(-2px);
  border-color: rgba(143, 115, 81, 0.58);
  box-shadow: 0 5px 12px rgba(62, 42, 20, 0.12);
}

.ad-room-cover,
.ad-event-cover {
  position: relative;
  height: 150px;
  overflow: hidden;
  background: rgba(62, 42, 20, 0.1);
}

.ad-room-cover img,
.ad-event-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ad-room-pool-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(34, 24, 14, 0.8);
  color: #fff6e8;
  font-size: 11px;
  font-weight: 700;
}

.ad-room-body,
.ad-event-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.ad-room-head,
.ad-event-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ad-room-head h4,
.ad-event-head h4 {
  margin: 0;
  font-size: 15px;
  color: var(--text-main, #3e2a14);
}

.ad-room-pool-inline,
.ad-event-node-cnt {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(143, 115, 81, 0.16);
  color: var(--text-muted, #6b5134);
}

.ad-room-desc,
.ad-event-snippet {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted, #7b6348);
}

.ad-event-cta {
  margin-top: auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--ad-gold-text, #8c5d1e);
}

.ad-room-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ad-flag-pill {
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(143, 115, 81, 0.16);
  color: var(--text-main, #3e2a14);
  font-size: 11px;
}

.ad-flag-pill.is-warn {
  background: var(--ad-warn-bg, rgba(168, 56, 48, 0.13));
  color: var(--ad-warn-color, #8f2c24);
}

.ad-room-waves {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* 机制页 */
.ad-rules-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ad-global-buffs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 12px;
}

.ad-global-buff-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid rgba(143, 115, 81, 0.32);
  background: var(--paper-soft, #f7efe1);
}

.ad-global-buff-card.is-enemy {
  border-color: rgba(168, 56, 48, 0.35);
}

.ad-global-buff-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex-shrink: 0;
}

.ad-global-buff-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}

.ad-global-buff-desc {
  font-size: 12px;
  color: var(--text-muted, #7b6348);
  margin-top: 2px;
}

.ad-rule-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 6px;
  background: var(--paper-soft, #f7efe1);
  border: 1px solid rgba(143, 115, 81, 0.28);
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-main, #3e2a14);
}

.ad-rule-copy p {
  margin: 0;
}

/* 兑换中心弹窗 */
.ad-shop-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ad-shop-intro {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(143, 115, 81, 0.12);
  border: 1px solid rgba(143, 115, 81, 0.25);
}

.ad-shop-intro h4 {
  margin: 0 0 4px;
  font-size: 15px;
  color: var(--text-main, #3e2a14);
}

.ad-shop-intro p {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, #7b6348);
}

.ad-shop-icon-lg {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  background-image: var(--icon-url, none);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.ad-shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px;
}

.ad-shop-card {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.34));
  background: var(--ad-shop-card-bg, rgba(232, 218, 193, 0.9));
}

.ad-shop-card-icon {
  width: 72px;
  flex-shrink: 0;
}

.ad-shop-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ad-shop-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.ad-shop-card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}

.ad-shop-limit {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(143, 115, 81, 0.14);
  color: var(--ad-gold-text, #7a4f1d);
  font-weight: 700;
  white-space: nowrap;
}

.ad-shop-card-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, #7b6348);
  line-height: 1.45;
}

.ad-shop-costs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}

.ad-cost-label {
  font-size: 11px;
  color: var(--text-muted, #7b6348);
  font-weight: 600;
}

.ad-cost-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ad-cost-pill-bg, rgba(139, 90, 43, 0.13));
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main, #4e3422);
}
</style>

<style>
.dark-mode,
.dark-theme {
  --ad-scroll-bg: var(--paper, #261c13);
  --ad-btn-bg: linear-gradient(135deg, #4a3726 0%, #3a2a1c 100%);
  --ad-btn-border: rgba(216, 175, 86, 0.45);
  --ad-btn-hover-bg: linear-gradient(135deg, #59432e 0%, #463423 100%);
  --ad-boss-bg: linear-gradient(180deg, #3c2a1c 0%, #312116 100%);
  --ad-boss-border: #b88a3a;
  --ad-gold-text: #e2b86b;
  --ad-enc-bg: rgba(143, 115, 81, 0.12);
  --ad-boss-title: #f08c7a;
  --ad-pill-bg: rgba(66, 49, 34, 0.85);
  --ad-pill-hover-bg: rgba(84, 62, 42, 0.95);
  --ad-count-color: #e5b963;
  --ad-chip-bg: rgba(62, 46, 32, 0.85);
  --ad-chip-hover-bg: rgba(84, 62, 42, 0.95);
  --ad-q4-color: #d3b3f0;
  --ad-q4-border: rgba(182, 138, 219, 0.5);
  --ad-q5-color: #ebc878;
  --ad-q5-border: #b88a3a;
  --ad-q5-bg: rgba(126, 92, 34, 0.35);
  --ad-dropdown-bg: linear-gradient(180deg, #423122 0%, #332519 100%);
  --ad-active-bg: #7a5832;
  --ad-active-color: #fff6e8;
  --ad-warn-bg: rgba(196, 64, 43, 0.22);
  --ad-warn-color: #f3a195;
  --ad-shop-card-bg: rgba(52, 39, 27, 0.95);
  --ad-cost-pill-bg: rgba(186, 140, 70, 0.22);
}
</style>
