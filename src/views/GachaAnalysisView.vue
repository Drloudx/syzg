<template>
  <div class="page-view-container gacha-analysis-page" data-main-scroll>
    <!-- 空状态顶部导航与操作栏（仅在未导入数据时显示引导，导入后直出玩家看板） -->
    <div v-if="!hasRecords" class="analysis-header executive-panel">
      <div class="analysis-header__main">
        <div class="analysis-header__title-group">
          <div class="analysis-header__badge">
            <span class="badge-star">✦</span>
            <span>大书院勘测模型</span>
          </div>
          <h1 class="analysis-header__title">招募记录分析</h1>
          <p class="analysis-header__subtitle">
            严格遵循《深渊之歌》官方 36 抽保底与 2.3% 基础出金机制 · 本地隐私计算
          </p>
        </div>

        <div class="analysis-header__actions">
          <UiButton variant="primary" size="sm" @click="openImportModal">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>导入记录</span>
          </UiButton>

          <UiButton variant="secondary" size="sm" @click="handleToolClick">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span>模拟器导出工具</span>
          </UiButton>
        </div>
      </div>
    </div>

    <!-- 空状态：暂未导入真实抽卡记录 -->
    <div v-if="!hasRecords" class="analysis-empty-card executive-panel">
      <div class="empty-hero-block">
        <div class="empty-icon-shield">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="empty-svg-icon" aria-hidden="true">
            <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
          </svg>
        </div>
        <h2 class="empty-title">暂未导入抽卡历史记录</h2>
        <p class="empty-desc">
          本工具专为《深渊之歌》玩家设计，精准测算 36 抽保底曲线与欧非指数。<br />
          请使用模拟器专用一键导出工具提取游戏内真实历史，或导入已有的记录文件。
        </p>

        <div class="empty-actions">
          <UiButton variant="primary" size="md" @click="openImportModal">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>导入本地记录文件 (JSON)</span>
          </UiButton>
          <UiButton variant="secondary" size="md" @click="handleToolClick">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span>模拟器一键导出使用教程</span>
          </UiButton>
        </div>

        <!-- 极简三步指引 -->
        <div class="quick-guide-grid">
          <div class="guide-step-card">
            <div class="step-num">01</div>
            <div class="step-content">
              <div class="step-title">运行模拟器游戏</div>
              <div class="step-text">在电脑上打开 MuMu 12 或雷电模拟器，并登录《深渊之歌》。</div>
            </div>
          </div>
          <div class="guide-step-card">
            <div class="step-num">02</div>
            <div class="step-content">
              <div class="step-title">启动导出工具</div>
              <div class="step-text">运行项目目录中的 <code class="code-badge">tools/gacha-exporter/一键导出抽卡记录.bat</code>。</div>
            </div>
          </div>
          <div class="guide-step-card">
            <div class="step-num">03</div>
            <div class="step-content">
              <div class="step-title">游戏内翻页捕获</div>
              <div class="step-text">进入游戏【招募】->【记录查询】逐页翻看，数据即自动捕获完成！</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 核心分析看板（导入真实数据后展示，完整复刻小黑盒深色尊享风格） -->
    <template v-else>
      <!-- 1. 玩家档案与三大卡池总览（完整对标小黑盒手机端图2） -->
      <div class="player-profile-card executive-panel">
        <!-- 玩家身份首行 -->
        <div class="profile-top-row">
          <div class="profile-avatar-wrap" title="点击修改头像与档案" @click="openEditProfileModal">
            <img
              :src="getImageUrl(topPulledAvatar)"
              alt="玩家头像"
              class="profile-avatar-img"
              @error="handleImgFallback"
            />
            <span class="avatar-edit-overlay">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </span>
          </div>

          <div class="profile-identity">
            <div class="profile-name-row">
              <span class="profile-name" title="点击修改昵称" @click="openEditProfileModal">{{ playerData.nickname || '小工匠' }}</span>
              <button
                type="button"
                class="btn-edit-nickname"
                title="修改游戏昵称与头像"
                @click="openEditProfileModal"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
            </div>
            <div class="profile-meta-row">
              <span class="profile-uid-pill" title="点击复制或修改 UID" @click="copyUid">
                <span>UID: {{ playerData.uid || '未录入' }}</span>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </span>
            </div>
          </div>

          <div class="profile-right-actions">
            <button
              type="button"
              class="btn-ghost-clear"
              title="清空记录"
              @click="confirmClearRecords"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>清空</span>
            </button>
          </div>
        </div>

        <!-- 关键统计横幅（严格对标图2「总消耗 184.4万 | 生涯评分 歪打正着的欧皇」） -->
        <div class="profile-stats-bar">
          <div class="pstats-cell">
            <span class="pstats-label">总消耗</span>
            <span class="pstats-value text-accent-gold pstats-cost-value">
              <img :src="getImageUrl('/images/Common_ItemIcon/item_00002.webp')" class="meta-currency-icon" alt="氪金" />
              <span>{{ formattedCost }}</span>
            </span>
          </div>
          <div class="pstats-divider"></div>
          <div class="pstats-cell">
            <span class="pstats-label">生涯评分</span>
            <span class="pstats-value" :class="`luck-text--${analysis.overview.luck.ratingClass}`">
              {{ analysis.overview.luck.title }}
            </span>
          </div>
        </div>

        <!-- 当前版本横幅与统计印章（严格对标图2：绿色胶囊《歪打正着的欧皇》+ 黑盒统计自 2024年10月29日） -->
        <div class="profile-version-banner">
          <div class="luck-pill-badge" :class="`luck--${analysis.overview.luck.ratingClass}`">
            <span class="pill-prefix">当前<br/>版本</span>
            <span class="pill-title">《{{ analysis.overview.luck.title }}》</span>
          </div>
          <div class="stamp-watermark-box">
            <span class="stamp-sub">大书院统计自</span>
            <span class="stamp-date">{{ formattedExportDate }}</span>
          </div>
        </div>

        <!-- 三大卡池指标卡片：无论手机还是电脑，强制 3 栏并排（对标小黑盒「限定 / 标准 / 中坚」三列） -->
        <div class="pools-triple-columns">
          <!-- 1. 限定 -->
          <div
            class="pool-column-box"
            :class="{ 'is-active': activeTab === 'hero_limited' }"
            @click="activeTab = 'hero_limited'"
          >
            <div class="pcol-title">限定</div>
            <div class="pcol-pulls">
              <strong class="pulls-num">{{ analysis.heroLimited.pulls }}</strong>
              <small class="pulls-unit">抽</small>
            </div>
            <div class="pcol-details">
              <div class="pdetail-item">
                <span class="pdetail-num">
                  <span class="val-up">{{ analysis.heroLimited.upCount }}</span>
                  <span class="val-slash">/</span>
                  <span class="val-off">{{ analysis.heroLimited.offCount }}</span>
                </span>
                <span class="pdetail-lbl">出卡数/歪</span>
              </div>
              <div class="pdetail-item">
                <span class="pdetail-num text-emerald">{{ analysis.heroLimited.avgUpPulls || '--' }}</span>
                <span class="pdetail-lbl">UP平均</span>
              </div>
            </div>
          </div>

          <!-- 2. 标准 -->
          <div
            class="pool-column-box"
            :class="{ 'is-active': activeTab === 'hero_standard' }"
            @click="activeTab = 'hero_standard'"
          >
            <div class="pcol-title">标准</div>
            <div class="pcol-pulls">
              <strong class="pulls-num">{{ analysis.heroStandard.pulls }}</strong>
              <small class="pulls-unit">抽</small>
            </div>
            <div class="pcol-details">
              <div class="pdetail-item">
                <span class="pdetail-num">{{ analysis.heroStandard.goldCount }}</span>
                <span class="pdetail-lbl">出卡数</span>
              </div>
              <div class="pdetail-item">
                <span class="pdetail-num text-emerald">{{ analysis.heroStandard.avgGoldPulls || '--' }}</span>
                <span class="pdetail-lbl">5星平均</span>
              </div>
            </div>
          </div>

          <!-- 3. 魔物 -->
          <div
            class="pool-column-box"
            :class="{ 'is-active': activeTab === 'pet' }"
            @click="activeTab = 'pet'"
          >
            <div class="pcol-title">魔物</div>
            <div class="pcol-pulls">
              <strong class="pulls-num">{{ analysis.pet.pulls }}</strong>
              <small class="pulls-unit">抽</small>
            </div>
            <div class="pcol-details">
              <div class="pdetail-item">
                <span class="pdetail-num">{{ analysis.pet.goldCount }}</span>
                <span class="pdetail-lbl">出卡数</span>
              </div>
              <div class="pdetail-item">
                <span class="pdetail-num text-emerald">{{ analysis.pet.avgGoldPulls || '--' }}</span>
                <span class="pdetail-lbl">5星平均</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部胶囊标签列表（对标图2底部「十连两金」「7连up」「大保底就绪」） -->
        <div v-if="overviewTags.length > 0" class="profile-tags-row">
          <span
            v-for="(tag, tIdx) in overviewTags"
            :key="tIdx"
            class="profile-tag-pill"
            :class="tag.type"
          >
            {{ tag.text }}
          </span>
        </div>
      </div>

      <!-- 2. 五星收藏总览 (若有出金，紧随其后；严格对标星铁图2紧凑网格) -->
      <div v-if="analysis.overview.goldCollection.length > 0" class="collection-section executive-panel">
        <div class="collection-header">
          <div class="collection-title-box">
            <h3 class="collection-title">5星伙伴和魔物</h3>
            <span class="collection-summary">
              共获得限定5星 <strong class="text-accent-gold">{{ analysis.overview.limitedGoldCount }}</strong>个，常驻5星 <strong class="text-accent-gold">{{ analysis.overview.standardGoldCount }}</strong>个，具体如下：
            </span>
          </div>
        </div>

        <div class="collection-grid">
          <div
            v-for="item in analysis.overview.goldCollection"
            :key="item.typeId"
            class="collection-item-card"
            :title="`${item.name} (${item.isLimited ? '限定' : '常驻'}${item.isPet ? '魔物' : '伙伴'}) ×${item.count}`"
          >
            <div class="collection-avatar-box">
              <img
                :src="getImageUrl(resolveAvatarSrc(item))"
                :alt="item.name"
                class="collection-avatar-img"
                @error="handleImgFallback"
              />
              <span v-if="item.count > 1" class="collection-count-badge">{{ item.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. 抽卡历史与保底进度（支持列表条状与小黑盒折叠网格双模式，支持四星显示切换） -->
      <div class="history-section executive-panel">
        <div class="history-header-row">
          <div class="header-title-box">
            <h2 class="history-title">抽卡历史</h2>
            <span class="history-total-tag">共 {{ totalFilteredPulls }} 抽</span>
          </div>

          <!-- 右侧 3 个按键操作栏：展示4星开关 + 视图模式切换 [ ≡ | ⊞ ] -->
          <div class="history-toolbar">
            <!-- 1. 切换展示四星按钮 -->
            <button
              type="button"
              class="btn-four-star-toggle"
              :class="{ 'is-active': showFourStar }"
              @click="showFourStar = !showFourStar"
              :title="showFourStar ? '当前已展示四星，点击隐藏' : '当前已隐藏四星，点击展示'"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="toggle-icon">
                <polyline points="17 4 21 8 17 12"></polyline>
                <line x1="3" y1="8" x2="21" y2="8"></line>
                <polyline points="7 20 3 16 7 12"></polyline>
                <line x1="21" y1="16" x2="3" y2="16"></line>
              </svg>
              <span>{{ showFourStar ? '展示四星' : '隐藏四星' }}</span>
            </button>

            <!-- 2 & 3. 视图模式切换胶囊：列表条状 [ ≡ ] vs 紧凑折叠网格 [ ⊞ ] -->
            <div class="view-mode-toggle-group">
              <button
                type="button"
                class="view-mode-btn"
                :class="{ 'is-active': viewMode === 'list' }"
                @click="viewMode = 'list'"
                title="列表条状视图（带详细出金进度条）"
                aria-label="列表条状视图"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <rect x="3" y="5" width="4" height="2.5" rx="0.8" />
                  <rect x="9" y="5" width="12" height="2.5" rx="0.8" />
                  <rect x="3" y="11" width="4" height="2.5" rx="0.8" />
                  <rect x="9" y="11" width="12" height="2.5" rx="0.8" />
                  <rect x="3" y="17" width="4" height="2.5" rx="0.8" />
                  <rect x="9" y="17" width="12" height="2.5" rx="0.8" />
                </svg>
              </button>
              <button
                type="button"
                class="view-mode-btn"
                :class="{ 'is-active': viewMode === 'grid' }"
                @click="viewMode = 'grid'"
                title="紧凑折叠网格视图"
                aria-label="紧凑网格视图"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
                  <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
                  <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
                  <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 卡池分类筛选标签栏 -->
        <div class="history-filters-row">
          <div class="pool-tabs-group">
            <button
              v-for="opt in poolFilterOptions"
              :key="opt.value"
              type="button"
              class="pool-tab-btn"
              :class="{ 'is-active': activeTab === opt.value }"
              @click="activeTab = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- 各卡池当前垫抽数折叠栏（默认收起，点击展开/收起查看各卡池独立垫抽与保底进度） -->
        <div class="pity-collapse-bar" @click="isPityOverviewOpen = !isPityOverviewOpen">
          <div class="pity-collapse-left">
            <span class="pity-collapse-title">保底垫抽概览</span>
            <span class="pity-collapse-badge">{{ displayPoolPities.length }}个卡池</span>
          </div>
          <div class="pity-collapse-toggle">
            <span class="pity-toggle-text">{{ isPityOverviewOpen ? '收起' : '展开' }}</span>
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="pity-toggle-arrow"
              :class="{ 'is-open': isPityOverviewOpen }"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>

        <!-- 垫抽卡片区（默认收起） -->
        <div v-show="isPityOverviewOpen" class="pity-chips-row">
          <div
            v-for="p in displayPoolPities"
            :key="p.id"
            class="pity-chip-item"
            :title="`${p.name}: 已垫 ${p.pityCount} 抽，距保底还差 ${p.remain} 抽`"
          >
            <div class="chip-label">{{ p.name }}已垫</div>
            <div class="chip-count">
              <span class="chip-dot" :class="resolvePoolDotClass(p.kind)"></span>
              <strong>{{ p.pityCount }}</strong> / {{ p.pityMax }}
            </div>
            <div class="chip-sub">
              {{ p.remain === 0 ? '下次必出5星' : (p.isGuaranteedUp ? `必中UP(差${p.remain}抽)` : `还差 ${p.remain} 抽`) }}
            </div>
          </div>
        </div>

        <!-- 卡池出货列表 -->
        <div v-if="filteredBanners.length === 0" class="history-empty">
          <span>所选分类下暂无抽卡记录</span>
        </div>

        <div v-else class="banner-groups-list">
          <div
            v-for="(banner, bIdx) in filteredBanners"
            :key="`b-${bIdx}-${banner.key}`"
            class="banner-block-card"
          >
            <!-- 卡池横幅标题条（对标小黑盒卡池标题：左侧彩色抽数药丸 + 卡池名 + 日期） -->
            <div class="banner-block__header">
              <div class="banner-title-line">
                <span class="banner-pulls-pill" :class="resolvePoolPillClass(banner.poolKind)">
                  {{ banner.pulls }} 抽
                </span>
                <span class="banner-name">{{ banner.poolName }}</span>
                <span class="banner-date-range">{{ resolveBannerDateRange(banner) }}</span>
              </div>
            </div>

            <!-- 卡池代表角色小头像行（如有 UP 且为列表模式） -->
            <div v-if="viewMode === 'list' && banner.upHeroes && banner.upHeroes.length > 0" class="banner-up-heroes-row">
              <span class="up-row-label">当期UP:</span>
              <div v-for="hId in banner.upHeroes" :key="hId" class="up-hero-mini-avatar">
                <img :src="getImageUrl(resolveAvatarSrc({ typeId: hId }))" :alt="hId" @error="handleImgFallback" />
              </div>
            </div>

            <!-- A. 列表条状视图（带未出金进度长条、出金抽数横条、受 showFourStar 控制的 4 星小头像） -->
            <div v-if="viewMode === 'list'" class="banner-list-flow">
              <!-- 顶端已垫抽数条（当前卡池自上次出金后如有垫抽数，仅在该卡池内部展示） -->
              <div v-if="banner.pityCount > 0" class="banner-pity-current-row">
                <div class="pity-question-avatar">?</div>
                <div class="pity-waterfall-bar">
                  <div
                    class="pity-bar-fill"
                    :style="{ width: `${Math.min(100, Math.max(18, (banner.pityCount / 36) * 100))}%` }"
                  >
                    <span class="pity-bar-text">{{ banner.poolKind === 'pet' ? '已购买' : '已招募' }} {{ banner.pityCount }} 抽</span>
                  </div>
                </div>
                <div class="pity-remain-hint">
                  距 36 抽保底还差 {{ 36 - banner.pityCount }} 抽
                </div>
              </div>

              <!-- 出金瀑布流列表 -->
              <div v-if="banner.golds.length > 0" class="gold-waterfall-flow">
                <div
                  v-for="(gold, gIdx) in banner.golds"
                  :key="`gold-${gIdx}-${gold.rawId}`"
                  class="waterfall-card-item"
                >
                  <!-- 左列：5星头像框 + 出金日期 -->
                  <div class="wf-avatar-block">
                    <div class="waterfall-avatar-wrapper">
                      <img
                        :src="getImageUrl(resolveAvatarSrc(gold))"
                        :alt="gold.name"
                        class="waterfall-avatar-img"
                        @error="handleImgFallback"
                      />
                      <!-- 歪印章 / New徽章（不标UP） -->
                      <span v-if="banner.poolKind === 'hero_limited' && !gold.isUp" class="stamp-wai">歪</span>
                      <span v-if="gold.isNew" class="badge-new">New</span>
                    </div>
                    <span class="wf-hero-date">{{ formatShortDate(gold.at) }}</span>
                  </div>

                  <!-- 右列：抽数彩色进度条 + 挂载的 4 星小头像列表 -->
                  <div class="wf-track-block">
                    <div class="waterfall-bar-row">
                      <div
                        class="waterfall-bar-fill"
                        :class="resolveBarTierClass(gold.pullCount)"
                        :style="{ width: `${Math.min(100, Math.max(22, (gold.pullCount / 36) * 100))}%` }"
                      >
                        <div class="bar-stripe-overlay"></div>
                        <span class="bar-pulls-label">{{ gold.pullCount }} 抽</span>
                      </div>
                      <span v-if="gold.pullCount >= 30" class="badge-unlucky">超非</span>
                    </div>

                    <!-- 挂 4 星出货（由 showFourStar 开关控制显示/隐藏） -->
                    <div v-if="showFourStar && gold.purples && gold.purples.length > 0" class="wf-purples-subrow">
                      <div
                        v-for="(p, pIdx) in gold.purples"
                        :key="pIdx"
                        class="wf-purple-mini-chip"
                        :title="p.name"
                      >
                        <img
                          :src="getImageUrl(resolveAvatarSrc(p))"
                          :alt="p.name"
                          class="purple-mini-img"
                          @error="handleImgFallback"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 该卡池暂无五星 -->
              <div v-else class="banner-no-gold-notice">
                <span>该卡池暂无五星</span>
              </div>
            </div>

            <!-- B. 紧凑折叠网格视图（严格对标小黑盒折叠四宫格模式：头像网格 + 左下角抽数浮层 + 右上角角标） -->
            <div v-else class="banner-grid-flow">
                <!-- 若当前卡池正在垫抽，放首个问号卡片 -->
                <div
                  v-if="banner.pityCount > 0"
                  class="grid-avatar-item grid-pity-item"
                  :title="`当前卡池已垫 ${banner.pityCount} 抽，距 36 抽保底还差 ${36 - banner.pityCount} 抽`"
                >
                  <div class="grid-pity-avatar">?</div>
                  <span class="grid-pulls-chip">
                    {{ banner.pityCount }}
                    <small class="grid-chip-arrow">▶</small>
                  </span>
                </div>

                <!-- 5星正方形头像卡片 -->
                <div
                  v-for="(gold, gIdx) in banner.golds"
                  :key="`grid-gold-${gIdx}-${gold.rawId}`"
                  class="grid-avatar-item"
                  :title="`${gold.name} - 第 ${gold.pullCount} 抽出金 (${formatShortDate(gold.at)})`"
                >
                  <img
                    :src="getImageUrl(resolveAvatarSrc(gold))"
                    :alt="gold.name"
                    class="grid-hero-img"
                    @error="handleImgFallback"
                  />
                  <!-- 右上角角标：歪 / New（UP 不标） -->
                  <span v-if="banner.poolKind === 'hero_limited' && !gold.isUp" class="grid-badge-wai">歪</span>
                  <span v-if="gold.isNew" class="grid-badge-new">New</span>

                  <!-- 左下角抽数浮层（黑色半透明 + 抽数 + 箭头） -->
                  <span class="grid-pulls-chip">
                    {{ gold.pullCount }}
                    <small class="grid-chip-arrow">▶</small>
                  </span>
                </div>

                <!-- 该卡池暂无五星且无垫抽 -->
                <div v-if="banner.golds.length === 0 && banner.pityCount === 0" class="grid-empty-hint">
                  该卡池暂无五星
                </div>
              </div>
            </div>
          </div>
        </div>
    </template>

    <!-- 底部悬浮快捷操作圆形按钮（严格对标小黑盒手机端「更新」与「分享/工具」圆纽） -->
    <div class="floating-fab-dock">
      <button
        type="button"
        class="fab-circle-btn btn-update"
        title="导入 / 更新记录"
        @click="openImportModal"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        <span class="fab-circle-text">更新</span>
      </button>

      <button
        type="button"
        class="fab-circle-btn btn-tool"
        title="模拟器一键导出教程与工具"
        @click="handleToolClick"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
          <polyline points="16 6 12 2 8 6"></polyline>
          <line x1="12" y1="2" x2="12" y2="15"></line>
        </svg>
        <span class="fab-circle-text">工具</span>
      </button>
    </div>

    <!-- 手机端轻量提示条 -->
    <Transition name="fade">
      <div v-if="toastMessage" class="gacha-toast-banner" role="status">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>{{ toastMessage }}</span>
      </div>
    </Transition>

    <!-- 弹窗 1：导入记录 (JSON 文件或直接粘贴) -->
    <UiModal
      v-model:visible="isImportModalOpen"
      title="导入抽卡记录"
      max-width="540px"
      teleport-to="body"
    >
      <div class="import-modal-content">
        <p class="import-desc">
          支持导入由模拟器工具导出的 <code class="code-badge">gacha_records.json</code>，或直接粘贴 JSON 文本。
        </p>

        <!-- 文件上传选择区 -->
        <div class="file-drop-zone" @click="triggerFileInput">
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            class="hidden-file-input"
            @change="handleFileSelect"
          />
          <div class="drop-zone-inner">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="drop-icon" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="12" y2="12"></line>
              <line x1="15" y1="15" x2="12" y2="12"></line>
            </svg>
            <span class="drop-zone-text">点击选择本地 JSON 记录文件</span>
            <span class="drop-zone-sub">支持拖拽文件至此区域</span>
          </div>
        </div>

        <div class="import-divider">
          <span>或直接粘贴 JSON 内容</span>
        </div>

        <textarea
          v-model="importJsonText"
          class="import-textarea"
          rows="6"
          placeholder='粘贴 {"records": [...]} 或 [{"typeId": "hero_060", ...}]'
        ></textarea>

        <div v-if="importError" class="import-error-msg">
          {{ importError }}
        </div>
      </div>

      <template #footer>
        <div class="modal-footer-btns">
          <UiButton variant="secondary" size="sm" @click="isImportModalOpen = false">
            <span>取消</span>
          </UiButton>
          <UiButton variant="primary" size="sm" @click="confirmImport">
            <span>解析并导入</span>
          </UiButton>
        </div>
      </template>
    </UiModal>

    <!-- 弹窗 2：模拟器一键导出工具与教程 -->
    <UiModal
      v-model:visible="isToolModalOpen"
      title="模拟器抽卡记录导出工具"
      max-width="600px"
      teleport-to="body"
    >
      <div class="tool-modal-body">
        <div class="tool-badge-callout">
          <span class="callout-star">✦</span>
          <span>纯官方绿色技术 · 无需改包 · 无需 Root · 模拟器一键直导</span>
        </div>

        <p class="tool-intro">
          《深渊之歌》官方使用原生 TCP Socket 通信。我们为您提供了现成的 Windows 自动化导出工具，已预置在项目仓库中：
        </p>

        <div class="tool-path-box">
          <div class="path-title">工具目录与脚本：</div>
          <code class="path-code">vue-myrzg/tools/gacha-exporter/一键导出抽卡记录.bat</code>
        </div>

        <div class="tool-steps-flow">
          <div class="flow-step">
            <span class="step-badge">1</span>
            <div class="step-desc">
              <strong>启动模拟器：</strong>在电脑上打开 <strong>MuMu 模拟器 12</strong>（或雷电），启动《深渊之歌》并登录游戏。
            </div>
          </div>
          <div class="flow-step">
            <span class="step-badge">2</span>
            <div class="step-desc">
              <strong>运行脚本：</strong>双击运行 <code class="code-inline">一键导出抽卡记录.bat</code>，窗口提示监听已就绪。
            </div>
          </div>
          <div class="flow-step">
            <span class="step-badge">3</span>
            <div class="step-desc">
              <strong>在游戏内翻页：</strong>进入游戏【招募】界面，点击左下角【记录查询】，逐页点击【下一页】浏览历史。
            </div>
          </div>
          <div class="flow-step">
            <span class="step-badge">4</span>
            <div class="step-desc">
              <strong>自动导入：</strong>翻页完毕后，在黑框窗口按回车，工具将自动生成文件并复制剪贴板，本页面即可一键展示！
            </div>
          </div>
        </div>

        <div class="command-copy-box">
          <div class="copy-box-header">
            <span>命令行启动（开发者 / 高级用户）：</span>
            <button type="button" class="btn-copy-cmd" @click="copyCommand">
              {{ commandCopied ? '已复制命令' : '复制命令' }}
            </button>
          </div>
          <code class="cmd-text">node tools/gacha-exporter/export-gacha.mjs</code>
        </div>
      </div>

      <template #footer>
        <div class="modal-footer-btns">
          <UiButton variant="primary" size="sm" @click="isToolModalOpen = false">
            <span>我知道了</span>
          </UiButton>
        </div>
      </template>
    </UiModal>

    <!-- 弹窗 3：修改玩家档案 (昵称与头像) -->
    <UiModal
      v-model:visible="isEditProfileModalOpen"
      title="修改玩家档案"
      max-width="440px"
      teleport-to="body"
    >
      <div class="edit-profile-modal-body">
        <div class="edit-field-group">
          <label class="edit-field-label">游戏 UID</label>
          <div class="edit-input-wrap">
            <input
              v-model="editUidInput"
              type="text"
              class="edit-text-input"
              placeholder="请输入您的游戏 UID (可选)"
              maxlength="20"
              @keydown.enter="saveProfileEdit"
            />
          </div>
        </div>

        <div class="edit-field-group">
          <label class="edit-field-label">游戏昵称</label>
          <div class="edit-input-wrap">
            <input
              v-model="editNicknameInput"
              type="text"
              class="edit-text-input"
              placeholder="请输入您的游戏昵称"
              maxlength="16"
              @keydown.enter="saveProfileEdit"
            />
          </div>
        </div>

        <div class="edit-field-group">
          <label class="edit-field-label">当前头像</label>
          <button type="button" class="acct-avatar-row" @click="openAvatarPickerDialog">
            <img
              :src="getImageUrl(avatarPreviewPath)"
              alt="当前头像"
              class="acct-avatar-thumb"
              @error="handleImgFallback"
            />
            <span class="acct-avatar-row-title">{{ avatarPreviewName }}</span>
            <span class="acct-row-action">更换头像 ›</span>
          </button>
        </div>

        <div class="edit-field-group">
          <label class="edit-field-label">常用快捷选择</label>
          <div class="avatar-select-grid">
            <div
              v-for="av in availableAvatars"
              :key="av.id"
              class="avatar-select-item"
              :class="{ 'is-selected': activeAvatarId === av.id || selectedAvatarSrc === av.src }"
              :title="av.name"
              @click="selectQuickAvatar(av)"
            >
              <img :src="getImageUrl(av.src)" :alt="av.name" class="avatar-thumb-img" />
              <span class="avatar-thumb-name">{{ av.name }}</span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="modal-footer-btns">
          <UiButton variant="secondary" size="sm" @click="isEditProfileModalOpen = false">
            <span>取消</span>
          </UiButton>
          <UiButton variant="primary" size="sm" @click="saveProfileEdit">
            <span>保存修改</span>
          </UiButton>
        </div>
      </template>
    </UiModal>

    <!-- 头像选择弹窗（与账号中心同一体验，全量 109 个官方角色/魔物头像分类折叠可选） -->
    <AvatarPickerDialog
      v-model="activeAvatarId"
      v-model:visible="isAvatarPickerOpen"
      :nick="editNicknameInput"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { UiButton, UiModal } from '../components/ui/index.js'
import AvatarPickerDialog from '../components/AvatarPickerDialog.vue'
import { getImageUrl } from '../utils/env.js'
import { loadAvatarCatalog, avatarPath, avatarEntry } from '../utils/avatarCatalog.js'
import {
  analyzeGachaRecords,
  KNOWN_HEROES,
  KNOWN_PETS
} from '../utils/gachaAnalyzer.js'

// 本地存储 KEY
const STORAGE_KEY = 'syzg_real_gacha_records_v1'
const rawRecords = ref([])
const playerData = ref({
  uid: '',
  nickname: '小工匠',
  server: '官方服务器',
  avatar: ''
})

// 图4区域：各卡池独立垫抽与保底概览（默认收起）
const isPityOverviewOpen = ref(false)

// 手机端提示条
const toastMessage = ref('')
let toastTimer = null

function showToast(msg) {
  toastMessage.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 3500)
}

function isMobileDevice() {
  if (typeof window === 'undefined') return false
  return (
    window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  )
}

function handleToolClick() {
  if (isMobileDevice()) {
    showToast('手机端工具暂未完成，请前往mumu模拟器')
    return
  }
  isToolModalOpen.value = true
}

// 修改玩家档案（UID、昵称与头像）
const isEditProfileModalOpen = ref(false)
const isAvatarPickerOpen = ref(false)
const activeAvatarId = ref('')
const editUidInput = ref('')
const editNicknameInput = ref('小工匠')
const selectedAvatarSrc = ref('')

const availableAvatars = computed(() => {
  return [
    { id: 'at060_0', name: '德莉', src: '/images/HeadIconAtals/at060_0.webp' },
    { id: 'at069_0', name: '洛莉安', src: '/images/HeadIconAtals/at069_0.webp' },
    { id: 'at051_0', name: '阿莱克西娅', src: '/images/HeadIconAtals/at051_0.webp' },
    { id: 'at064_0', name: '伽拉忒亚', src: '/images/HeadIconAtals/at064_0.webp' },
    { id: 'avatar_pet_106', name: '圣骑士史莱姆', src: '/images/HeadIconAtals/avatar_pet_106.webp' }
  ]
})

const avatarPreviewPath = computed(() => {
  return selectedAvatarSrc.value || avatarPath(activeAvatarId.value) || topPulledAvatar.value || '/images/HeadIconAtals/at060_0.webp'
})

const avatarPreviewName = computed(() => {
  const hit = avatarEntry(activeAvatarId.value) || avatarEntry(selectedAvatarSrc.value)
  if (hit?.name) return hit.name
  const matched = availableAvatars.value.find(a => a.src === avatarPreviewPath.value)
  return matched?.name || '德莉'
})

watch(activeAvatarId, (newId) => {
  if (newId) {
    const p = avatarPath(newId)
    if (p) selectedAvatarSrc.value = p
  }
})

function selectQuickAvatar(av) {
  activeAvatarId.value = av.id
  selectedAvatarSrc.value = av.src
}

function openAvatarPickerDialog() {
  activeAvatarId.value = avatarEntry(selectedAvatarSrc.value)?.id || avatarEntry(playerData.value.avatar)?.id || 'at060_0'
  isAvatarPickerOpen.value = true
}

function openEditProfileModal() {
  editUidInput.value = playerData.value.uid || ''
  editNicknameInput.value = playerData.value.nickname || '小工匠'
  selectedAvatarSrc.value = playerData.value.avatar || ''
  activeAvatarId.value = avatarEntry(playerData.value.avatar)?.id || ''
  isEditProfileModalOpen.value = true
}

function saveProfileEdit() {
  const newName = editNicknameInput.value.trim()
  playerData.value.nickname = newName || '探险家'
  playerData.value.uid = editUidInput.value.trim()
  if (selectedAvatarSrc.value) {
    playerData.value.avatar = selectedAvatarSrc.value
  }
  saveCurrentData()
  isEditProfileModalOpen.value = false
}

const overviewTags = computed(() => {
  return analysis.value.overview?.tags || []
})

// 筛选与视图状态
const activeTab = ref('all') // 'all' | 'hero_limited' | 'hero_standard' | 'pet'

const VIEW_MODE_KEY = 'syzg_gacha_view_mode'
const SHOW_4STAR_KEY = 'syzg_gacha_show_4star'

// 视图模式：'list' (详细瀑布流) | 'grid' (紧凑折叠网格)
const viewMode = ref('list')
// 4星展示开关：默认开启 true
const showFourStar = ref(true)

try {
  const savedVm = localStorage.getItem(VIEW_MODE_KEY)
  if (savedVm === 'list' || savedVm === 'grid') viewMode.value = savedVm
  const saved4s = localStorage.getItem(SHOW_4STAR_KEY)
  if (saved4s !== null) showFourStar.value = saved4s !== 'false'
} catch {}

watch(viewMode, (val) => {
  try { localStorage.setItem(VIEW_MODE_KEY, val) } catch {}
})
watch(showFourStar, (val) => {
  try { localStorage.setItem(SHOW_4STAR_KEY, String(val)) } catch {}
})

function resolvePoolPillClass(poolKind) {
  if (poolKind === 'hero_limited') return 'pill-limited'
  if (poolKind === 'pet') return 'pill-pet'
  return 'pill-standard'
}

const poolFilterOptions = [
  { value: 'all', label: '全部卡池' },
  { value: 'hero_limited', label: '角色限定' },
  { value: 'hero_standard', label: '角色常规' },
  { value: 'pet', label: '魔物蛋池' }
]

// 弹窗状态
const isImportModalOpen = ref(false)
const isToolModalOpen = ref(false)
const importJsonText = ref('')
const importError = ref('')
const fileInputRef = ref(null)
const commandCopied = ref(false)

// 响应式解析分析结果
const analysis = computed(() => {
  return analyzeGachaRecords(rawRecords.value)
})

const hasRecords = computed(() => {
  return rawRecords.value && rawRecords.value.length > 0
})

const formattedCost = computed(() => {
  const cost = analysis.value.overview.totalCost || 0
  if (cost >= 10000) {
    return `${(cost / 10000).toFixed(1)}万`
  }
  return cost.toLocaleString()
})

const formattedExportDate = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
})

// 独立卡池垫抽数列表（按当前 Tab 筛选，完美适配多卡池不互通机制）
const displayPoolPities = computed(() => {
  const all = analysis.value.poolPities || []
  if (activeTab.value === 'all') return all
  return all.filter(p => p.kind === activeTab.value)
})

function resolvePoolDotClass(kind) {
  if (kind === 'hero_limited') return 'dot-emerald'
  if (kind === 'hero_standard') return 'dot-teal'
  return 'dot-blue'
}

// 玩家头像（优先取自定义设置或抓取的头像，次选首个5星，没有则默认德莉）
const topPulledAvatar = computed(() => {
  if (playerData.value?.avatar) {
    return playerData.value.avatar
  }
  const limitedGolds = analysis.value.heroLimited?.golds || []
  if (limitedGolds.length > 0) {
    return resolveAvatarSrc(limitedGolds[0])
  }
  const stdGolds = analysis.value.heroStandard?.golds || []
  if (stdGolds.length > 0) {
    return resolveAvatarSrc(stdGolds[0])
  }
  return '/images/HeadIconAtals/at060_0.webp'
})

// 过滤后的卡池横幅（已由分析引擎保证单卡池绝不重复）
const filteredBanners = computed(() => {
  let list = analysis.value.banners || []
  if (activeTab.value !== 'all') {
    list = list.filter(b => b.poolKind === activeTab.value)
  }
  return list
})

const totalFilteredPulls = computed(() => {
  return filteredBanners.value.reduce((sum, b) => sum + (b.pulls || 0), 0)
})

/**
 * 严格准确解析角色与魔物蛋图标
 * 官方全量 40 角色图标与全量魔物蛋头像均位于 HeadIconAtals 中
 */
function resolveAvatarSrc(item = {}) {
  const typeId = String(item.typeId || item.id || '')
  if (item.isPet || typeId.startsWith('pet_')) {
    const petMeta = KNOWN_PETS[typeId]
    const iconName = item.icon || petMeta?.icon || `avatar_${typeId}`
    return `/images/HeadIconAtals/${iconName}.webp`
  }

  const heroMeta = KNOWN_HEROES[typeId]
  const iconName = item.icon || heroMeta?.icon || 'at060_0'
  return `/images/HeadIconAtals/${iconName}.webp`
}

function resolveBarTierClass(pullCount) {
  if (pullCount <= 18) return 'bar--lucky' // 翡翠绿
  if (pullCount <= 28) return 'bar--normal' // 暖金黄
  return 'bar--pity' // 炽红（吃保底）
}

function handleImgFallback(e) {
  e.target.src = getImageUrl('/images/HeadIconAtals/at060_0.webp')
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}.${date} ${h}:${min}`
}

function resolveBannerDateRange(banner) {
  if (!banner.firstAt || !banner.lastAt) return '近期开放'
  const d1 = new Date(banner.firstAt)
  const d2 = new Date(banner.lastAt)
  const f1 = `${String(d1.getMonth() + 1).padStart(2, '0')}.${String(d1.getDate()).padStart(2, '0')}`
  const f2 = `${String(d2.getMonth() + 1).padStart(2, '0')}.${String(d2.getDate()).padStart(2, '0')}`
  return f1 === f2 ? f1 : `${f1} ~ ${f2}`
}

function formatShortDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  return `${m}-${date}`
}

function copyUid() {
  if (!playerData.value.uid) {
    openEditProfileModal()
    return
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(String(playerData.value.uid))
    alert(`已复制玩家 UID: ${playerData.value.uid}`)
  }
}

function copyCommand() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText('node tools/gacha-exporter/export-gacha.mjs')
    commandCopied.value = true
    setTimeout(() => { commandCopied.value = false }, 2000)
  }
}

// 载入本地存储数据
function loadSavedData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        rawRecords.value = parsed
      } else if (parsed && parsed.records) {
        rawRecords.value = parsed.records
        if (parsed.player) {
          playerData.value = { ...playerData.value, ...parsed.player }
          if (playerData.value.nickname === '云汐渚梦') {
            playerData.value.nickname = '探险家'
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to load saved gacha records:', err)
  }
}

function saveCurrentData() {
  try {
    const payload = {
      version: 1,
      savedAt: Date.now(),
      player: playerData.value,
      records: rawRecords.value
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (err) {
    console.error('Failed to save gacha records:', err)
  }
}

function openImportModal() {
  importJsonText.value = ''
  importError.value = ''
  isImportModalOpen.value = true
}

function triggerFileInput() {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

function handleFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (event) => {
    try {
      const content = event.target.result
      parseAndApplyRecords(JSON.parse(content))
      isImportModalOpen.value = false
      alert(`成功导入真实记录！累计 ${rawRecords.value.length} 抽。`)
    } catch (err) {
      importError.value = `解析失败: ${err.message}`
    }
  }
  reader.readAsText(file)
}

function confirmImport() {
  if (!importJsonText.value.trim()) {
    importError.value = '请粘贴抽卡记录 JSON 内容'
    return
  }
  try {
    const parsed = JSON.parse(importJsonText.value.trim())
    parseAndApplyRecords(parsed)
    isImportModalOpen.value = false
    alert(`成功导入真实记录！累计 ${rawRecords.value.length} 抽。`)
  } catch (err) {
    importError.value = `JSON 格式错误: ${err.message}`
  }
}

function parseAndApplyRecords(data) {
  let list = []
  if (Array.isArray(data)) {
    list = data
  } else if (data && Array.isArray(data.records)) {
    list = data.records
    if (data.player) {
      playerData.value = { ...playerData.value, ...data.player }
    }
  } else if (data && Array.isArray(data.datas)) {
    list = data.datas
  }

  if (!list.length) {
    throw new Error('抽卡记录列表为空')
  }

  // 去重合并
  const existMap = new Map(rawRecords.value.map(r => [r.id || `${r.at}-${r.typeId}`, r]))
  for (const item of list) {
    const key = item.id || `${item.at || item.crateAt}-${item.typeId}`
    existMap.set(key, item)
  }

  rawRecords.value = Array.from(existMap.values())
  saveCurrentData()
}

function confirmClearRecords() {
  if (confirm('确认清空当前已导入的所有真实抽卡记录吗？此操作不可撤销。')) {
    rawRecords.value = []
    localStorage.removeItem(STORAGE_KEY)
  }
}

onMounted(() => {
  loadSavedData()
  loadAvatarCatalog()
})
</script>

<style scoped>
/* 核心容器与触屏移动端滚动彻底修复 */
.gacha-analysis-page {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow-y: auto !important;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0;
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
  position: relative;
  box-sizing: border-box;
}

@media (min-width: 1025px) {
  /* 电脑端三栏布局：顶边与底边严格与左右侧边栏水平齐平 */
  .gacha-analysis-page {
    padding: 0 !important;
  }
}

@media (max-width: 1024px) {
  /* 移动端/平板端：适度边距与底部悬浮工具按钮留白 */
  .gacha-analysis-page {
    padding: 10px 8px 84px;
    gap: 10px;
    background: transparent;
    width: 100%;
  }
}

/* 主流顶级二游深色战术面板 (Executive Tactical Panel) */
.executive-panel {
  background: var(--paper, #e0cfb4);
  border: 1.5px solid var(--border-color, #8f7351);
  box-shadow: 0 4px 14px rgba(43, 31, 21, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.45);
  border-radius: 8px;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .executive-panel,
.dark-mode .executive-panel {
  background: #1c140d;
  border-color: #5c4327;
  box-shadow: 2px 4px 14px rgba(0, 0, 0, 0.45);
  color: #dfceb3;
}

/* 顶部 Header（未导入数据时显示引导） */
.analysis-header {
  padding: 18px 24px;
}
.analysis-header__main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
.analysis-header__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent-ink, #2f4a49);
  background: rgba(85, 117, 116, 0.16);
  border: 1px solid var(--accent, #557574);
  padding: 3px 8px;
  border-radius: 4px;
  margin-bottom: 6px;
}
:deep(.dark-mode) .analysis-header__badge,
.dark-mode .analysis-header__badge {
  color: #7a9a99;
  background: rgba(122, 154, 153, 0.18);
  border-color: #557574;
}
.badge-star {
  font-size: 10px;
}
.analysis-header__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  letter-spacing: 0.02em;
}
:deep(.dark-mode) .analysis-header__title,
.dark-mode .analysis-header__title {
  color: #ebdcc3;
}
.analysis-header__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .analysis-header__subtitle,
.dark-mode .analysis-header__subtitle {
  color: #bfa988;
}
.analysis-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 空状态卡片 */
.analysis-empty-card {
  padding: 56px 24px;
  text-align: center;
}
.empty-hero-block {
  max-width: 580px;
  margin: 0 auto;
}
.empty-icon-shield {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(85, 117, 116, 0.14);
  border: 1.5px solid var(--accent, #557574);
  color: var(--accent, #557574);
  margin-bottom: 20px;
}
:deep(.dark-mode) .empty-icon-shield,
.dark-mode .empty-icon-shield {
  background: rgba(122, 154, 153, 0.16);
  border-color: #7a9a99;
  color: #7a9a99;
}
.empty-svg-icon {
  color: inherit;
}
.empty-title {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .empty-title,
.dark-mode .empty-title {
  color: #ebdcc3;
}
.empty-desc {
  margin: 0 0 28px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .empty-desc,
.dark-mode .empty-desc {
  color: #bfa988;
}
.empty-actions {
  display: flex;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 36px;
}
.quick-guide-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  text-align: left;
}
@media (max-width: 768px) {
  .quick-guide-grid {
    grid-template-columns: 1fr;
  }
}
.guide-step-card {
  display: flex;
  gap: 12px;
  background: var(--paper-soft, #e9dcc3);
  border: 1.5px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  border-radius: 8px;
  padding: 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
:deep(.dark-mode) .guide-step-card,
.dark-mode .guide-step-card {
  background: #18110b;
  border-color: #4a3622;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.step-num {
  font-size: 18px;
  font-weight: 800;
  color: var(--accent, #557574);
  opacity: 0.95;
}
:deep(.dark-mode) .step-num,
.dark-mode .step-num {
  color: #7a9a99;
}
.step-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  margin-bottom: 4px;
}
:deep(.dark-mode) .step-title,
.dark-mode .step-title {
  color: #dfceb3;
}
.step-text {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .step-text,
.dark-mode .step-text {
  color: #a59175;
}
.code-badge {
  font-family: monospace;
  font-size: 11px;
  background: rgba(143, 115, 81, 0.15);
  color: #8c5a08;
  border: 1px solid rgba(143, 115, 81, 0.35);
  padding: 1px 5px;
  border-radius: 3px;
}
:deep(.dark-mode) .code-badge,
.dark-mode .code-badge {
  background: #120c08;
  color: #f59e0b;
  border-color: #5c4327;
}

/* 1. 玩家档案头部 (融入大书院羊皮纸战术面板风格) */
.player-profile-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
@media (max-width: 640px) {
  .player-profile-card {
    padding: 14px 12px;
    gap: 12px;
  }
}

.profile-top-row {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}
.profile-avatar-wrap {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  position: relative;
  cursor: pointer;
}
.profile-avatar-wrap:hover .avatar-edit-overlay {
  background: rgba(85, 117, 116, 0.9);
}
.profile-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
  border: 2px solid var(--gold, #8a6a1f);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  background: var(--paper-solid, #d9c6a6);
}
:deep(.dark-mode) .profile-avatar-img,
.dark-mode .profile-avatar-img {
  border-color: #d8af56;
  background: #23180f;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.profile-identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.profile-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-edit-nickname {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted, #6b5134);
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.btn-edit-nickname:hover {
  color: var(--accent, #557574);
  background: rgba(85, 117, 116, 0.12);
}
:deep(.dark-mode) .btn-edit-nickname,
.dark-mode .btn-edit-nickname {
  color: #a59175;
}
:deep(.dark-mode) .btn-edit-nickname:hover,
.dark-mode .btn-edit-nickname:hover {
  color: #7faea9;
}
.profile-name {
  font-size: 19px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
:deep(.dark-mode) .profile-name,
.dark-mode .profile-name {
  color: #ebdcc3;
}
.profile-meta-row {
  display: flex;
  align-items: center;
}
.profile-server-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted, #6b5134);
  background: rgba(143, 115, 81, 0.12);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.4));
  padding: 1px 7px;
  border-radius: 4px;
}
:deep(.dark-mode) .profile-server-tag,
.dark-mode .profile-server-tag {
  color: #bfa988;
  background: rgba(0, 0, 0, 0.3);
  border-color: #4a3622;
}

.profile-right-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.profile-uid-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-family: monospace;
  color: var(--text-muted, #6b5134);
  background: var(--paper-soft, #e9dcc3);
  border: 1.5px solid var(--border-color, #8f7351);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.profile-uid-pill:hover {
  background: var(--paper-solid, #d9c6a6);
  border-color: var(--accent, #557574);
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .profile-uid-pill,
.dark-mode .profile-uid-pill {
  background: #23180f;
  border-color: #5c4327;
  color: #bfa988;
}
:deep(.dark-mode) .profile-uid-pill:hover,
.dark-mode .profile-uid-pill:hover {
  background: #2c1f14;
  border-color: #7faea9;
  color: #ebdcc3;
}
.copy-icon {
  opacity: 0.8;
}

.btn-ghost-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--danger-soft, rgba(139, 0, 0, 0.08));
  border: 1px solid rgba(139, 0, 0, 0.35);
  color: var(--danger, #8b0000);
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.9;
  transition: all 0.15s ease;
}
.btn-ghost-clear:hover {
  opacity: 1;
  background: rgba(139, 0, 0, 0.16);
  border-color: var(--danger, #8b0000);
}
:deep(.dark-mode) .btn-ghost-clear,
.dark-mode .btn-ghost-clear {
  color: #e25a5a;
  border-color: rgba(226, 90, 90, 0.35);
  background: rgba(226, 90, 90, 0.12);
}

/* 关键统计横幅 (总消耗 | 生涯评分) */
.profile-stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 10px 14px;
  background: rgba(143, 115, 81, 0.08);
  border-radius: 6px;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.35));
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
}
:deep(.dark-mode) .profile-stats-bar,
.dark-mode .profile-stats-bar {
  background: #23180f;
  border-color: #4a3622;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.25);
}
.pstats-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 22px;
  line-height: 1;
}
.pstats-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  line-height: 1;
  display: inline-flex;
  align-items: center;
}
:deep(.dark-mode) .pstats-label,
.dark-mode .pstats-label {
  color: #bfa988;
}
.pstats-value {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  line-height: 1;
  display: inline-flex;
  align-items: center;
}
:deep(.dark-mode) .pstats-value,
.dark-mode .pstats-value {
  color: #ebdcc3;
}
.pstats-cost-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  line-height: 1;
}
.meta-currency-icon {
  width: 17px;
  height: 17px;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}
.meta-icon-gem {
  color: var(--gold, #8a6a1f);
  font-size: 13px;
}
.text-accent-gold {
  color: var(--gold, #8a6a1f);
  font-weight: 800;
}
:deep(.dark-mode) .text-accent-gold,
.dark-mode .text-accent-gold {
  color: #d8af56;
}
.pstats-divider {
  width: 1px;
  height: 16px;
  background: var(--border-soft, rgba(143, 115, 81, 0.45));
  flex-shrink: 0;
}
:deep(.dark-mode) .pstats-divider,
.dark-mode .pstats-divider {
  background: #4a3622;
}

.luck-text--godly { color: #047857; font-weight: 800; }
.luck-text--lucky { color: #1d4ed8; font-weight: 800; }
.luck-text--normal { color: #b45309; font-weight: 800; }
.luck-text--unlucky, .luck-text--bottom { color: #991b1b; font-weight: 800; }

:deep(.dark-mode) .luck-text--godly,
.dark-mode .luck-text--godly { color: #34d399; }
:deep(.dark-mode) .luck-text--lucky,
.dark-mode .luck-text--lucky { color: #60a5fa; }
:deep(.dark-mode) .luck-text--normal,
.dark-mode .luck-text--normal { color: #d8af56; }
:deep(.dark-mode) .luck-text--unlucky,
:deep(.dark-mode) .luck-text--bottom,
.dark-mode .luck-text--unlucky,
.dark-mode .luck-text--bottom { color: #e25a5a; }

/* 当前版本横幅与印章 */
.profile-version-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 2px 0;
}
.luck-pill-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  border-radius: 6px;
  transform: rotate(-0.8deg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.luck--godly, .luck--lucky {
  background: linear-gradient(135deg, #254d4b 0%, #163635 100%);
  border-color: rgba(143, 208, 206, 0.45);
  color: #f3eedf;
}
.luck--normal {
  background: linear-gradient(135deg, #8a5716 0%, #5c3506 100%);
  border-color: rgba(245, 158, 11, 0.45);
  color: #fdf8ed;
}
.luck--unlucky, .luck--bottom {
  background: linear-gradient(135deg, #7f1d1d 0%, #4d1010 100%);
  border-color: rgba(239, 68, 68, 0.45);
  color: #fef2f2;
}
.pill-prefix {
  font-size: 9px;
  font-weight: 900;
  line-height: 1.1;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.9;
}
.pill-title {
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.stamp-watermark-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  border: 1.5px dashed rgba(143, 115, 81, 0.55);
  border-radius: 4px;
  padding: 3px 9px;
  background: rgba(143, 115, 81, 0.08);
  transform: rotate(1deg);
}
:deep(.dark-mode) .stamp-watermark-box,
.dark-mode .stamp-watermark-box {
  border-color: #5c4327;
  background: #23180f;
}
.stamp-sub {
  font-size: 9px;
  color: var(--text-muted, #6b5134);
  letter-spacing: 0.05em;
}
:deep(.dark-mode) .stamp-sub,
.dark-mode .stamp-sub {
  color: #bfa988;
}
.stamp-date {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  font-family: monospace;
}
:deep(.dark-mode) .stamp-date,
.dark-mode .stamp-date {
  color: #ebdcc3;
}

/* 三大卡池指标卡片：3 栏并排 */
.pools-triple-columns {
  display: grid;
  grid-template-columns: repeat(3, 1fr) !important;
  gap: 8px;
}
@media (max-width: 640px) {
  .pools-triple-columns {
    gap: 6px;
  }
}
.pool-column-box {
  background: rgba(255, 255, 255, 0.45);
  border: 1.5px solid var(--border-soft, rgba(143, 115, 81, 0.4));
  border-radius: 6px;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 4px rgba(43, 31, 21, 0.05);
}
@media (max-width: 640px) {
  .pool-column-box {
    padding: 10px 6px;
    gap: 4px;
  }
}
.pool-column-box:hover {
  border-color: var(--border-color, #8f7351);
  background: rgba(255, 255, 255, 0.7);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(43, 31, 21, 0.09);
}
.pool-column-box.is-active {
  border-color: var(--accent, #557574);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 1.5px var(--accent, #557574), 0 3px 10px rgba(85, 117, 116, 0.16);
}
:deep(.dark-mode) .pool-column-box,
.dark-mode .pool-column-box {
  background: #23180f;
  border-color: #4a3622;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
:deep(.dark-mode) .pool-column-box:hover,
.dark-mode .pool-column-box:hover {
  border-color: #7d6040;
  background: #2c1f14;
}
:deep(.dark-mode) .pool-column-box.is-active,
.dark-mode .pool-column-box.is-active {
  border-color: #7faea9;
  background: #2c1f14;
  box-shadow: 0 0 0 1.5px #7faea9;
}
.pcol-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  text-align: center;
}
:deep(.dark-mode) .pcol-title,
.dark-mode .pcol-title {
  color: #bfa988;
}
.pcol-pulls {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
}
.pcol-pulls .pulls-num {
  font-size: 26px;
  font-weight: 900;
  color: var(--text-main, #3e2a14);
  line-height: 1;
}
:deep(.dark-mode) .pcol-pulls .pulls-num,
.dark-mode .pcol-pulls .pulls-num {
  color: #ebdcc3;
}
@media (max-width: 640px) {
  .pcol-pulls .pulls-num {
    font-size: 22px;
  }
}
.pcol-pulls .pulls-unit {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .pcol-pulls .pulls-unit,
.dark-mode .pcol-pulls .pulls-unit {
  color: #bfa988;
}
.pcol-details {
  display: flex;
  justify-content: space-around;
  padding-top: 6px;
  border-top: 1px solid var(--border-soft, rgba(143, 115, 81, 0.35));
}
:deep(.dark-mode) .pcol-details,
.dark-mode .pcol-details {
  border-color: #4a3622;
}
.pdetail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.pdetail-num {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
}
.text-emerald {
  color: #047857 !important;
  font-weight: 800;
}
:deep(.dark-mode) .text-emerald,
.dark-mode .text-emerald {
  color: #34d399 !important;
}
:deep(.dark-mode) .pdetail-num,
.dark-mode .pdetail-num {
  color: #ebdcc3;
}
.val-up {
  color: var(--accent-ink, #2f4a49);
}
:deep(.dark-mode) .val-up,
.dark-mode .val-up {
  color: #34d399;
}
.val-slash {
  color: var(--text-faint, #8a6d4d);
  margin: 0 1px;
}
.val-off {
  color: var(--danger, #8b0000);
}
:deep(.dark-mode) .val-off,
.dark-mode .val-off {
  color: #e25a5a;
}
.pdetail-lbl {
  font-size: 9px;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .pdetail-lbl,
.dark-mode .pdetail-lbl {
  color: #bfa988;
}

/* 底部标签胶囊行 */
.profile-tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.profile-tag-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
}
.tag-emerald {
  background: rgba(85, 117, 116, 0.16);
  color: var(--accent-ink, #2f4a49);
  border: 1px solid var(--accent, #557574);
}
:deep(.dark-mode) .tag-emerald,
.dark-mode .tag-emerald {
  background: rgba(127, 174, 169, 0.18);
  color: #7faea9;
  border-color: #557574;
}
.tag-amber {
  background: rgba(138, 106, 31, 0.15);
  color: var(--wood, #2b1f15);
  border: 1px solid var(--gold, #8a6a1f);
}
:deep(.dark-mode) .tag-amber,
.dark-mode .tag-amber {
  background: rgba(216, 175, 86, 0.18);
  color: #d8af56;
  border-color: #a88334;
}
.tag-gold {
  background: rgba(201, 147, 38, 0.18);
  color: var(--wood, #2b1f15);
  border: 1px solid var(--gold, #8a6a1f);
}
:deep(.dark-mode) .tag-gold,
.dark-mode .tag-gold {
  background: rgba(216, 175, 86, 0.2);
  color: #f59e0b;
  border-color: #d8af56;
}
.tag-danger {
  background: var(--danger-soft, rgba(139, 0, 0, 0.1));
  color: var(--danger, #8b0000);
  border: 1px solid rgba(139, 0, 0, 0.35);
}
:deep(.dark-mode) .tag-danger,
.dark-mode .tag-danger {
  background: rgba(226, 90, 90, 0.16);
  color: #e25a5a;
  border-color: rgba(226, 90, 90, 0.35);
}
.tag-neutral {
  background: var(--paper-soft, #e9dcc3);
  color: var(--text-muted, #6b5134);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
}
:deep(.dark-mode) .tag-neutral,
.dark-mode .tag-neutral {
  background: #23180f;
  color: #bfa988;
  border-color: #4a3622;
}

/* 2. 五星收藏总览 */
.collection-section {
  padding: 16px 20px;
}
.collection-header {
  margin-bottom: 12px;
}
.collection-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .collection-title,
.dark-mode .collection-title {
  color: #ebdcc3;
}
.collection-summary {
  font-size: 12px;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .collection-summary,
.dark-mode .collection-summary {
  color: #bfa988;
}
.collection-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.collection-item-card {
  display: inline-flex;
  cursor: default;
  transition: transform 0.15s ease;
}
.collection-item-card:hover {
  transform: translateY(-2px);
}
.collection-avatar-box {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--paper-solid, #d9c6a6);
  border: 1.5px solid var(--gold, #8a6a1f);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}
:deep(.dark-mode) .collection-avatar-box,
.dark-mode .collection-avatar-box {
  background: #23180f;
  border-color: #d8af56;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}
@media (max-width: 480px) {
  .collection-avatar-box {
    width: 38px;
    height: 38px;
  }
}
.collection-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.collection-count-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  background: var(--wood, #2b1f15);
  color: #fde047;
  font-size: 9px;
  font-weight: 800;
  padding: 1px 3.5px;
  border-radius: 2px;
  line-height: 1;
  border: 1px solid var(--gold, #8a6a1f);
}
.collection-pet-tag {
  position: absolute;
  bottom: 1px;
  left: 1px;
  background: rgba(2, 132, 199, 0.9);
  color: #ffffff;
  font-size: 8px;
  font-weight: 700;
  padding: 0.5px 2px;
  border-radius: 2px;
  line-height: 1;
}

/* 3. 抽卡历史与保底进度 */
.history-section {
  padding: 18px 20px;
}
@media (max-width: 640px) {
  .history-section {
    padding: 14px 10px;
    border-radius: 10px;
  }
}

.history-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.header-title-box {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.history-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .history-title,
.dark-mode .history-title {
  color: #ebdcc3;
}
.history-total-tag {
  font-size: 11px;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .history-total-tag,
.dark-mode .history-total-tag {
  color: #bfa988;
}

/* 抽卡历史右侧操作栏 (展示四星开关 + 视图模式切换) */
.history-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-four-star-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--paper-soft, #e9dcc3);
  border: 1.5px solid var(--border-color, #8f7351);
  color: var(--text-main, #3e2a14);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.btn-four-star-toggle:hover {
  background: var(--paper-solid, #d9c6a6);
  border-color: var(--accent, #557574);
}
.btn-four-star-toggle.is-active {
  background: var(--accent, #557574);
  border-color: var(--accent-ink, #2f4a49);
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
:deep(.dark-mode) .btn-four-star-toggle,
.dark-mode .btn-four-star-toggle {
  background: #23180f;
  border-color: #5c4327;
  color: #ebdcc3;
}
:deep(.dark-mode) .btn-four-star-toggle:hover,
.dark-mode .btn-four-star-toggle:hover {
  background: #2c1f14;
  border-color: #7faea9;
}
:deep(.dark-mode) .btn-four-star-toggle.is-active,
.dark-mode .btn-four-star-toggle.is-active {
  background: #557574;
  border-color: #7faea9;
  color: #ffffff;
}
.toggle-icon {
  flex-shrink: 0;
}

/* 视图模式切换组合按钮 [ ≡ | ⊞ ] */
.view-mode-toggle-group {
  display: inline-flex;
  align-items: center;
  background: var(--paper-solid, #d9c6a6);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}
:deep(.dark-mode) .view-mode-toggle-group,
.dark-mode .view-mode-toggle-group {
  background: #18110a;
  border-color: #5c4327;
}
.view-mode-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted, #6b5134);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}
.view-mode-btn:hover {
  color: var(--text-main, #3e2a14);
}
.view-mode-btn.is-active {
  background: var(--wood, #2b1f15);
  color: var(--paper, #dfceb3);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
:deep(.dark-mode) .view-mode-btn,
.dark-mode .view-mode-btn {
  color: #bfa988;
}
:deep(.dark-mode) .view-mode-btn:hover,
.dark-mode .view-mode-btn:hover {
  color: #ebdcc3;
}
:deep(.dark-mode) .view-mode-btn.is-active,
.dark-mode .view-mode-btn.is-active {
  background: #3a2a1b;
  color: #f7ebd7;
}

.history-filters-row {
  margin-bottom: 12px;
}
.pool-tabs-group {
  display: flex;
  background: var(--paper-solid, #d9c6a6);
  padding: 2px;
  border-radius: 6px;
  border: 1.5px solid var(--border-color, #8f7351);
}
:deep(.dark-mode) .pool-tabs-group,
.dark-mode .pool-tabs-group {
  background: #18110a;
  border-color: #5c4327;
}
.pool-tab-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #6b5134);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.pool-tab-btn:hover {
  color: var(--text-main, #3e2a14);
}
.pool-tab-btn.is-active {
  background: var(--wood, #2b1f15);
  color: var(--paper, #dfceb3);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
:deep(.dark-mode) .pool-tab-btn,
.dark-mode .pool-tab-btn {
  color: #bfa988;
}
:deep(.dark-mode) .pool-tab-btn:hover,
.dark-mode .pool-tab-btn:hover {
  color: #ebdcc3;
}
:deep(.dark-mode) .pool-tab-btn.is-active,
.dark-mode .pool-tab-btn.is-active {
  background: #3a2a1b;
  color: #f7ebd7;
}

/* 垫抽概览折叠控制条 */
.pity-collapse-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--paper-soft, #e9dcc3);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 6px;
  padding: 7px 12px;
  margin-bottom: 10px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.pity-collapse-bar:hover {
  background: var(--paper-solid, #d9c6a6);
}
:deep(.dark-mode) .pity-collapse-bar,
.dark-mode .pity-collapse-bar {
  background: #23180f;
  border-color: #5c4327;
}
:deep(.dark-mode) .pity-collapse-bar:hover,
.dark-mode .pity-collapse-bar:hover {
  background: #2c1f14;
}
.pity-collapse-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pity-collapse-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .pity-collapse-title,
.dark-mode .pity-collapse-title {
  color: #ebdcc3;
}
.pity-collapse-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  background: var(--paper-solid, #d9c6a6);
  padding: 1px 6px;
  border-radius: 4px;
}
:deep(.dark-mode) .pity-collapse-badge,
.dark-mode .pity-collapse-badge {
  color: #bfa988;
  background: #18110a;
}
.pity-collapse-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted, #6b5134);
  font-size: 11px;
  font-weight: 600;
}
:deep(.dark-mode) .pity-collapse-toggle,
.dark-mode .pity-collapse-toggle {
  color: #bfa988;
}
.pity-collapse-bar:hover .pity-collapse-toggle {
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .pity-collapse-bar:hover .pity-collapse-toggle,
.dark-mode .pity-collapse-bar:hover .pity-collapse-toggle {
  color: #ebdcc3;
}
.pity-toggle-arrow {
  transition: transform 0.2s ease;
}
.pity-toggle-arrow.is-open {
  transform: rotate(180deg);
}

/* 独立卡池垫抽数胶囊栏 (自适应多卡池独立保底) */
.pity-chips-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr) !important;
  gap: 8px;
  margin-bottom: 16px;
}
@media (max-width: 640px) {
  .pity-chips-row {
    gap: 5px;
  }
}
.pity-chip-item {
  background: var(--paper-soft, #e9dcc3);
  border: 1.5px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  border-radius: 8px;
  padding: 8px 6px;
  cursor: default;
  transition: all 0.15s ease;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
@media (max-width: 640px) {
  .pity-chip-item {
    padding: 7px 4px;
    border-radius: 6px;
  }
}
.pity-chip-item:hover {
  border-color: var(--border-color, #8f7351);
  background: var(--paper-solid, #d9c6a6);
}
:deep(.dark-mode) .pity-chip-item,
.dark-mode .pity-chip-item {
  background: #23180f;
  border-color: #4a3622;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
:deep(.dark-mode) .pity-chip-item:hover,
.dark-mode .pity-chip-item:hover {
  border-color: #7d6040;
  background: #2c1f14;
}
.chip-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
:deep(.dark-mode) .chip-label,
.dark-mode .chip-label {
  color: #bfa988;
}
.chip-count {
  font-size: 15px;
  font-weight: 900;
  color: var(--text-main, #3e2a14);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
:deep(.dark-mode) .chip-count,
.dark-mode .chip-count {
  color: #ebdcc3;
}
.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-emerald { background: #047857; box-shadow: 0 0 4px rgba(4, 120, 87, 0.4); }
.dot-teal { background: #0e7490; box-shadow: 0 0 4px rgba(14, 116, 144, 0.4); }
.dot-blue { background: #1d4ed8; box-shadow: 0 0 4px rgba(29, 78, 216, 0.4); }
.chip-sub {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-faint, #8a6d4d);
  margin-top: 2px;
  white-space: nowrap;
}
:deep(.dark-mode) .chip-sub,
.dark-mode .chip-sub {
  color: #928068;
}

/* 卡池横幅卡片 */
.banner-groups-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.banner-block-card {
  background: var(--paper-soft, #e9dcc3);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 8px;
  padding: 14px 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
@media (max-width: 640px) {
  .banner-block-card {
    padding: 12px 10px;
  }
}
:deep(.dark-mode) .banner-block-card,
.dark-mode .banner-block-card {
  background: #23180f;
  border-color: #5c4327;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.banner-block__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.banner-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.banner-pulls-pill {
  font-size: 11px;
  font-weight: 800;
  color: #ffffff;
  padding: 2.5px 8px;
  border-radius: 4px;
  line-height: 1.2;
  flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
.banner-pulls-pill.pill-limited {
  background: linear-gradient(135deg, #5b21b6 0%, #4c1d95 100%);
  border: 1px solid rgba(196, 181, 253, 0.35);
}
.banner-pulls-pill.pill-pet {
  background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
  border: 1px solid rgba(125, 211, 252, 0.35);
}
.banner-pulls-pill.pill-standard {
  background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
  border: 1px solid rgba(156, 163, 175, 0.35);
}
.banner-name {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  letter-spacing: 0.01em;
}
:deep(.dark-mode) .banner-name,
.dark-mode .banner-name {
  color: #ebdcc3;
}
.banner-date-range {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #6b5134);
  margin-left: 2px;
}
:deep(.dark-mode) .banner-date-range,
.dark-mode .banner-date-range {
  color: #bfa988;
}

/* B. 紧凑折叠网格视图 */
.banner-grid-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0 2px;
}
.grid-avatar-item {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--paper-solid, #d9c6a6);
  border: 1.5px solid var(--gold, #8a6a1f);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
  cursor: default;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
:deep(.dark-mode) .grid-avatar-item,
.dark-mode .grid-avatar-item {
  background: #23180f;
  border-color: #d8af56;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}
@media (max-width: 480px) {
  .grid-avatar-item {
    width: 46px;
    height: 46px;
  }
}
.grid-avatar-item:hover {
  transform: translateY(-2px);
  border-color: var(--border-color, #8f7351);
}
.grid-hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.grid-pity-item {
  border-style: dashed;
  border-color: var(--border-color, #8f7351);
  background: var(--paper-soft, #e9dcc3);
  display: flex;
  align-items: center;
  justify-content: center;
}
:deep(.dark-mode) .grid-pity-item,
.dark-mode .grid-pity-item {
  border-color: #5c4327;
  background: #18110a;
}
.grid-pity-avatar {
  font-size: 20px;
  font-weight: 900;
  color: var(--text-muted, #6b5134);
  user-select: none;
}
:deep(.dark-mode) .grid-pity-avatar,
.dark-mode .grid-pity-avatar {
  color: #bfa988;
}
.grid-pulls-chip {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: var(--wood, #2b1f15);
  color: var(--paper, #dfceb3);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  padding: 1.5px 3.5px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  pointer-events: none;
}
.grid-chip-arrow {
  font-size: 7px;
  opacity: 0.7;
  transform: scale(0.85);
}
.grid-badge-wai {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #ef4444;
  color: #ffffff;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.grid-badge-new {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #f59e0b;
  color: #000000;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.grid-empty-hint {
  font-size: 12px;
  color: var(--text-muted, #6b5134);
  padding: 8px 0;
}
.banner-up-heroes-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.up-row-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .up-row-label,
.dark-mode .up-row-label {
  color: #bfa988;
}
.up-hero-mini-avatar {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  overflow: hidden;
  border: 1.5px solid var(--border-color, #8f7351);
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.15);
  background: var(--paper-solid, #d9c6a6);
}
:deep(.dark-mode) .up-hero-mini-avatar,
.dark-mode .up-hero-mini-avatar {
  border-color: #5c4327;
  background: #23180f;
}
.up-hero-mini-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 顶端当前已垫抽数条 */
.banner-pity-current-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--paper-solid, #d9c6a6);
  border: 1px dashed var(--border-color, #8f7351);
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 12px;
}
:deep(.dark-mode) .banner-pity-current-row,
.dark-mode .banner-pity-current-row {
  background: #1a120b;
  border-color: #5c4327;
}
.pity-question-avatar {
  width: 42px;
  height: 42px;
  border-radius: 6px;
  background: var(--paper-soft, #e9dcc3);
  border: 1.5px solid var(--border-color, #8f7351);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 900;
  color: var(--text-muted, #6b5134);
  flex-shrink: 0;
}
:deep(.dark-mode) .pity-question-avatar,
.dark-mode .pity-question-avatar {
  background: #261b12;
  border-color: #5c4327;
  color: #bfa988;
}
.pity-waterfall-bar {
  flex: 1;
  height: 28px;
  background: rgba(143, 115, 81, 0.10);
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(143, 115, 81, 0.25);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);
}
:deep(.dark-mode) .pity-waterfall-bar,
.dark-mode .pity-waterfall-bar {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(143, 115, 81, 0.25);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
}
.pity-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3f6867 0%, #254d4b 100%);
  display: flex;
  align-items: center;
  padding-left: 10px;
  transition: width 0.3s ease;
  box-shadow: 1px 0 4px rgba(0, 0, 0, 0.15);
}
.pity-bar-text {
  font-size: 12px;
  font-weight: 800;
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
  white-space: nowrap;
}
.pity-remain-hint {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  white-space: nowrap;
}
:deep(.dark-mode) .pity-remain-hint,
.dark-mode .pity-remain-hint {
  color: #bfa988;
}

/* 5星出货瀑布流 */
.gold-waterfall-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.waterfall-card-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.wf-avatar-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 44px;
  flex-shrink: 0;
}
.waterfall-avatar-wrapper {
  position: relative;
  width: 44px;
  height: 44px;
}
.waterfall-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  object-fit: cover;
  border: 2px solid var(--gold, #8a6a1f);
  background: var(--paper-solid, #d9c6a6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
:deep(.dark-mode) .waterfall-avatar-img,
.dark-mode .waterfall-avatar-img {
  border-color: #d8af56;
  background: #23180f;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.stamp-wai {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #7f1d1d;
  color: #fecaca;
  border: 1px solid #dc2626;
  font-size: 9px;
  font-weight: 900;
  padding: 1px 4px;
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  line-height: 1.1;
}
.badge-up {
  position: absolute;
  top: -4px;
  left: -4px;
  background: #164e63;
  color: #cffafe;
  border: 1px solid #0891b2;
  font-size: 9px;
  font-weight: 900;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.1;
}
.badge-new {
  position: absolute;
  top: -4px;
  left: -4px;
  background: #78350f;
  color: #fef08a;
  border: 1px solid #ca8a04;
  font-size: 8px;
  font-weight: 900;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.1;
}
.wf-hero-date {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #6b5134);
  font-family: monospace;
}
:deep(.dark-mode) .wf-hero-date,
.dark-mode .wf-hero-date {
  color: #bfa988;
}

.wf-track-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.waterfall-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.waterfall-bar-fill {
  position: relative;
  height: 28px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  overflow: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
.bar-stripe-overlay {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background: repeating-linear-gradient(45deg, #fff 0, #fff 10px, transparent 10px, transparent 20px);
  pointer-events: none;
}
.bar--lucky {
  background: linear-gradient(90deg, #15803d 0%, #16a34a 100%);
  color: #ffffff;
}
.bar--normal {
  background: linear-gradient(90deg, #b45309 0%, #d97706 100%);
  color: #ffffff;
}
.bar--pity {
  background: linear-gradient(90deg, #991b1b 0%, #b91c1c 100%);
  color: #ffffff;
}
.bar-pulls-label {
  position: relative;
  z-index: 1;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}
.badge-unlucky {
  font-size: 10px;
  font-weight: 900;
  background: #ef4444;
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(239, 68, 68, 0.4);
}

/* 挂载的 4 星小头像列表 */
.wf-purples-subrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  padding-left: 2px;
}
.wf-purple-mini-chip {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  overflow: hidden;
  border: 1.5px solid #a855f7;
  background: var(--paper-solid, #d9c6a6);
  box-shadow: 0 0 6px rgba(168, 85, 247, 0.35);
  flex-shrink: 0;
}
:deep(.dark-mode) .wf-purple-mini-chip,
.dark-mode .wf-purple-mini-chip {
  background: #23180f;
}
.purple-mini-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 暂无五星提示 */
.banner-no-gold-notice {
  text-align: center;
  padding: 14px;
  font-size: 12px;
  color: var(--text-muted, #6b5134);
  background: var(--paper-solid, #d9c6a6);
  border-radius: 6px;
}
:deep(.dark-mode) .banner-no-gold-notice,
.dark-mode .banner-no-gold-notice {
  background: #18110a;
  color: #bfa988;
}
.history-empty {
  text-align: center;
  padding: 32px;
  color: var(--text-muted, #6b5134);
  font-size: 13px;
}
:deep(.dark-mode) .history-empty,
.dark-mode .history-empty {
  color: #bfa988;
}

/* 底部右侧悬浮快捷操作圆形按钮（对标小黑盒「更新」与「分享/工具」圆纽，融入深渊大书院原木烫金质感） */
.floating-fab-dock {
  position: fixed;
  bottom: calc(24px + var(--safe-bottom, 0px));
  right: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: var(--floating-control-z, 6002);
}
@media (max-width: 640px) {
  .floating-fab-dock {
    bottom: calc(18px + var(--safe-bottom, 0px));
    right: 14px;
    gap: 10px;
  }
}
.fab-circle-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(180deg, var(--wood-soft, #463424), var(--wood, #2b1f15));
  color: var(--paper, #dfceb3);
  border: 2px solid var(--border-color, #8f7351);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(223, 206, 179, 0.25);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, color 0.15s;
}
.fab-circle-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
  color: #ffffff;
}
.fab-circle-text {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

/* 手机端轻量提示条 (Toast Banner) */
.gacha-toast-banner {
  position: fixed;
  bottom: calc(84px + var(--safe-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  background: linear-gradient(180deg, var(--wood-soft, #463424), var(--wood, #2b1f15));
  color: var(--paper, #dfceb3);
  border: 1.5px solid var(--border-color, #8f7351);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(223, 206, 179, 0.25);
  padding: 10px 18px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
}

/* 弹窗 1：导入抽卡记录样式 */
.import-modal-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.import-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, #6b5134);
  line-height: 1.5;
}
:deep(.dark-mode) .import-desc,
.dark-mode .import-desc {
  color: #a59175;
}
.file-drop-zone {
  border: 2px dashed var(--border-color, #8f7351);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  background: rgba(143, 115, 81, 0.06);
  transition: border-color 0.2s, background 0.2s;
}
.file-drop-zone:hover {
  border-color: var(--accent, #557574);
  background: rgba(85, 117, 116, 0.1);
}
:deep(.dark-mode) .file-drop-zone,
.dark-mode .file-drop-zone {
  border-color: #7a5c3d;
  background: rgba(0, 0, 0, 0.25);
}
.hidden-file-input {
  display: none;
}
.drop-zone-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.drop-icon {
  color: var(--accent, #557574);
}
:deep(.dark-mode) .drop-icon,
.dark-mode .drop-icon {
  color: #7a9a99;
}
.drop-zone-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .drop-zone-text,
.dark-mode .drop-zone-text {
  color: #dfceb3;
}
.drop-zone-sub {
  font-size: 11px;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .drop-zone-sub,
.dark-mode .drop-zone-sub {
  color: #a59175;
}
.import-divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: var(--text-muted, #6b5134);
  font-size: 11px;
  font-weight: 600;
}
:deep(.dark-mode) .import-divider,
.dark-mode .import-divider {
  color: #a59175;
}
.import-divider::before, .import-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--border-soft, rgba(143, 115, 81, 0.35));
}
.import-divider span {
  padding: 0 10px;
}
.import-textarea {
  width: 100%;
  background: var(--paper-solid, #d9c6a6);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 6px;
  padding: 10px;
  font-family: monospace;
  font-size: 12px;
  color: var(--text-main, #3e2a14);
  resize: vertical;
  box-sizing: border-box;
}
:deep(.dark-mode) .import-textarea,
.dark-mode .import-textarea {
  background: #140e09;
  border-color: #5c4327;
  color: #dfceb3;
}
.import-textarea:focus {
  border-color: var(--accent, #557574);
  outline: none;
}
.import-error-msg {
  color: #c53030;
  font-size: 12px;
  font-weight: 600;
}
.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 弹窗 2：导出工具与教程弹窗 */
.tool-modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tool-badge-callout {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-ink, #2f4a49);
  background: rgba(85, 117, 116, 0.14);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--accent, #557574);
}
:deep(.dark-mode) .tool-badge-callout,
.dark-mode .tool-badge-callout {
  color: #8fd0ce;
  background: rgba(122, 154, 153, 0.18);
  border-color: #557574;
}
.tool-intro {
  margin: 0;
  font-size: 13px;
  color: var(--text-main, #3e2a14);
  line-height: 1.6;
}
:deep(.dark-mode) .tool-intro,
.dark-mode .tool-intro {
  color: #dfceb3;
}
.tool-path-box {
  background: var(--paper-solid, #d9c6a6);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 6px;
  padding: 10px 14px;
}
:deep(.dark-mode) .tool-path-box,
.dark-mode .tool-path-box {
  background: #140e09;
  border-color: #5c4327;
}
.path-title {
  font-size: 11px;
  color: var(--text-muted, #6b5134);
  font-weight: 600;
  margin-bottom: 4px;
}
:deep(.dark-mode) .path-title,
.dark-mode .path-title {
  color: #a59175;
}
.path-code {
  font-family: monospace;
  font-size: 12px;
  color: #8c5a08;
  font-weight: 700;
  word-break: break-all;
}
:deep(.dark-mode) .path-code,
.dark-mode .path-code {
  color: #f59e0b;
}
.tool-steps-flow {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.flow-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--paper-soft, #e9dcc3);
  padding: 10px 14px;
  border-radius: 6px;
  border: 1.5px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
:deep(.dark-mode) .flow-step,
.dark-mode .flow-step {
  background: #1b130c;
  border-color: #4a3622;
}
.step-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent, #557574);
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
  margin-top: 2px;
}
:deep(.dark-mode) .step-badge,
.dark-mode .step-badge {
  background: #466766;
}
.step-desc {
  font-size: 12px;
  color: var(--text-main, #3e2a14);
  line-height: 1.5;
}
:deep(.dark-mode) .step-desc,
.dark-mode .step-desc {
  color: #dfceb3;
}
.step-desc strong {
  color: var(--wood, #2b1f15);
}
:deep(.dark-mode) .step-desc strong,
.dark-mode .step-desc strong {
  color: #f3eedf;
}
.code-inline {
  background: rgba(143, 115, 81, 0.15);
  color: #8c5a08;
  border: 1px solid rgba(143, 115, 81, 0.35);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
}
:deep(.dark-mode) .code-inline,
.dark-mode .code-inline {
  background: #120c08;
  color: #f59e0b;
  border-color: #5c4327;
}
.command-copy-box {
  background: var(--paper-solid, #d9c6a6);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 6px;
  padding: 10px 14px;
}
:deep(.dark-mode) .command-copy-box,
.dark-mode .command-copy-box {
  background: #140e09;
  border-color: #5c4327;
}
.copy-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-muted, #6b5134);
  font-weight: 600;
  margin-bottom: 6px;
}
:deep(.dark-mode) .copy-box-header,
.dark-mode .copy-box-header {
  color: #a59175;
}
.btn-copy-cmd {
  background: var(--paper-soft, #e9dcc3);
  border: 1px solid var(--border-color, #8f7351);
  color: var(--accent-ink, #2f4a49);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-copy-cmd:hover {
  background: var(--paper-solid, #d9c6a6);
  border-color: var(--accent, #557574);
}
:deep(.dark-mode) .btn-copy-cmd,
.dark-mode .btn-copy-cmd {
  background: #261b12;
  border-color: #7a5c3d;
  color: #8fd0ce;
}
.cmd-text {
  display: block;
  font-family: monospace;
  font-size: 12px;
  color: #8c5a08;
  font-weight: 700;
}
:deep(.dark-mode) .cmd-text,
.dark-mode .cmd-text {
  color: #f59e0b;
}

/* 弹窗 3：修改玩家档案弹窗样式（对标 AccountModal 体验） */
.edit-profile-modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 6px 0;
}
.edit-field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.edit-field-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .edit-field-label,
.dark-mode .edit-field-label {
  color: #dfceb3;
}
.edit-input-wrap {
  display: flex;
  gap: 8px;
}
.edit-text-input {
  flex: 1;
  background: var(--paper-solid, #d9c6a6);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 6px;
  color: var(--text-main, #3e2a14);
  font-size: 13px;
  padding: 8px 12px;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
:deep(.dark-mode) .edit-text-input,
.dark-mode .edit-text-input {
  background: #140e09;
  border-color: #5c4327;
  color: #dfceb3;
}
.edit-text-input:focus {
  border-color: var(--accent, #557574);
}

/* 档案头像整行选择器（对标 AccountModal .acct-avatar-row） */
.acct-avatar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  background: var(--paper-soft, #e9dcc3);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-sizing: border-box;
  text-align: left;
}
.acct-avatar-row:hover {
  background: var(--paper-solid, #d9c6a6);
  border-color: var(--accent, #557574);
}
:deep(.dark-mode) .acct-avatar-row,
.dark-mode .acct-avatar-row {
  background: #1b130c;
  border-color: #5c4327;
}
:deep(.dark-mode) .acct-avatar-row:hover,
.dark-mode .acct-avatar-row:hover {
  background: #23180f;
  border-color: #7a5c3d;
}
.acct-avatar-thumb {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  border: 1.5px solid var(--border-color, #8f7351);
  object-fit: cover;
  background: var(--paper, #dfceb3);
  flex-shrink: 0;
}
.acct-avatar-row-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  flex: 1;
}
:deep(.dark-mode) .acct-avatar-row-title,
.dark-mode .acct-avatar-row-title {
  color: #dfceb3;
}
.acct-row-action {
  font-size: 12px;
  color: var(--accent, #557574);
  font-weight: 700;
}
:deep(.dark-mode) .acct-row-action,
.dark-mode .acct-row-action {
  color: #7a9a99;
}

/* 常用快捷头像选择网格 */
.avatar-select-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.avatar-select-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  border-radius: 6px;
  border: 1.5px solid transparent;
  background: var(--paper-soft, #e9dcc3);
  cursor: pointer;
  transition: all 0.15s;
}
.avatar-select-item:hover {
  border-color: var(--border-color, #8f7351);
}
.avatar-select-item.is-selected {
  border-color: #c99326;
  background: rgba(201, 147, 38, 0.18);
  box-shadow: 0 0 8px rgba(201, 147, 38, 0.35);
}
:deep(.dark-mode) .avatar-select-item,
.dark-mode .avatar-select-item {
  background: #18110b;
}
:deep(.dark-mode) .avatar-select-item.is-selected,
.dark-mode .avatar-select-item.is-selected {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.18);
}
.avatar-thumb-img {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.4));
}
.avatar-thumb-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-main, #3e2a14);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
:deep(.dark-mode) .avatar-thumb-name,
.dark-mode .avatar-thumb-name {
  color: #dfceb3;
}
.avatar-edit-overlay {
  position: absolute;
  bottom: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.7);
  color: #ffffff;
  padding: 2px 4px;
  border-radius: 4px 0 6px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.85;
}
.profile-avatar-wrap {
  position: relative;
  cursor: pointer;
}
.profile-avatar-wrap:hover .avatar-edit-overlay {
  background: rgba(85, 117, 116, 0.9);
}
</style>
