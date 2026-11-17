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

          <UiButton variant="secondary" size="sm" @click="isToolModalOpen = true">
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
          <UiButton variant="secondary" size="md" @click="isToolModalOpen = true">
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
              <span class="profile-name" title="点击修改昵称" @click="openEditProfileModal">{{ playerData.nickname || '云汐渚梦' }}</span>
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
              <span class="profile-server-tag">{{ playerData.server || '官方服务器' }}</span>
            </div>
          </div>

          <div class="profile-right-actions">
            <span class="profile-uid-pill" title="点击复制 UID" @click="copyUid">
              <span>UID:{{ playerData.uid }}</span>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </span>
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
        @click="isToolModalOpen = true"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
          <polyline points="16 6 12 2 8 6"></polyline>
          <line x1="12" y1="2" x2="12" y2="15"></line>
        </svg>
        <span class="fab-circle-text">工具</span>
      </button>
    </div>

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
      max-width="420px"
      teleport-to="body"
    >
      <div class="edit-profile-modal-body">
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
            <button
              v-if="editNicknameInput !== '云汐渚梦'"
              type="button"
              class="btn-quick-fill"
              title="一键填入云汐渚梦"
              @click="editNicknameInput = '云汐渚梦'"
            >
              填入云汐渚梦
            </button>
          </div>
        </div>

        <div class="edit-field-group">
          <label class="edit-field-label">选择佩戴头像</label>
          <div class="avatar-select-grid">
            <div
              v-for="av in availableAvatars"
              :key="av.src"
              class="avatar-select-item"
              :class="{ 'is-selected': (selectedAvatarSrc || topPulledAvatar) === av.src }"
              :title="av.name"
              @click="selectedAvatarSrc = av.src"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { UiButton, UiModal } from '../components/ui/index.js'
import { getImageUrl } from '../utils/env.js'
import {
  analyzeGachaRecords,
  KNOWN_HEROES,
  KNOWN_PETS
} from '../utils/gachaAnalyzer.js'

// 本地存储 KEY
const STORAGE_KEY = 'syzg_real_gacha_records_v1'
const rawRecords = ref([])
const playerData = ref({
  uid: '100233',
  nickname: '云汐渚梦',
  server: '官方服务器',
  avatar: ''
})

// 图4区域：各卡池独立垫抽与保底概览（默认收起）
const isPityOverviewOpen = ref(false)

// 修改玩家档案（昵称与头像）
const isEditProfileModalOpen = ref(false)
const editNicknameInput = ref('云汐渚梦')
const selectedAvatarSrc = ref('')

const availableAvatars = computed(() => {
  return [
    { name: '德莉', src: '/images/HeadIconAtals/at060_0.webp' },
    { name: '洛莉安', src: '/images/HeadIconAtals/at069_0.webp' },
    { name: '阿莱克西娅', src: '/images/HeadIconAtals/at051_0.webp' },
    { name: '伽拉忒亚', src: '/images/HeadIconAtals/at064_0.webp' },
    { name: '圣骑士史莱姆', src: '/images/eggs/avatar_pet_106.webp' }
  ]
})

function openEditProfileModal() {
  editNicknameInput.value = playerData.value.nickname || '云汐渚梦'
  selectedAvatarSrc.value = playerData.value.avatar || ''
  isEditProfileModalOpen.value = true
}

function saveProfileEdit() {
  const newName = editNicknameInput.value.trim()
  if (newName) {
    playerData.value.nickname = newName
  }
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
    background: #0f1118;
    width: 100%;
  }
}

/* 主流顶级二游深色战术面板 (Executive Tactical Panel) */
.executive-panel {
  background: #141721;
  border: 1px solid #202636;
  border-radius: 12px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
  color: #e5e7eb;
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
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  padding: 3px 8px;
  border-radius: 4px;
  margin-bottom: 6px;
}
.badge-star {
  font-size: 10px;
}
.analysis-header__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #f3f4f6;
  letter-spacing: 0.02em;
}
.analysis-header__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9ca3af;
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
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
  margin-bottom: 20px;
}
.empty-svg-icon {
  color: #10b981;
}
.empty-title {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 700;
  color: #f9fafb;
}
.empty-desc {
  margin: 0 0 28px;
  font-size: 13px;
  line-height: 1.6;
  color: #9ca3af;
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
  background: #101319;
  border: 1px solid #1f2533;
  border-radius: 8px;
  padding: 14px;
}
.step-num {
  font-size: 18px;
  font-weight: 800;
  color: #10b981;
  opacity: 0.85;
}
.step-title {
  font-size: 13px;
  font-weight: 600;
  color: #e5e7eb;
  margin-bottom: 4px;
}
.step-text {
  font-size: 11px;
  line-height: 1.5;
  color: #9ca3af;
}
.code-badge {
  font-family: monospace;
  font-size: 11px;
  background: #181d26;
  color: #f59e0b;
  padding: 1px 4px;
  border-radius: 3px;
}

/* 1. 玩家档案头部 (完整复刻小黑盒手机端图2) */
.player-profile-card {
  padding: 16px 18px;
  background: #181a1f;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
@media (max-width: 640px) {
  .player-profile-card {
    padding: 14px 12px;
    gap: 12px;
    border-radius: 10px;
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
}
.profile-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
  border: 2px solid #eab308;
  box-shadow: 0 0 12px rgba(234, 179, 8, 0.35);
  background: #101319;
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
  color: #6b7280;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.btn-edit-nickname:hover {
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.1);
}
.profile-name {
  font-size: 19px;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.profile-meta-row {
  display: flex;
  align-items: center;
}
.profile-server-tag {
  font-size: 10px;
  font-weight: 600;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 1px 7px;
  border-radius: 4px;
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
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.profile-uid-pill:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}
.copy-icon {
  opacity: 0.8;
}

.btn-ghost-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.8;
  transition: all 0.15s;
}
.btn-ghost-clear:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.15);
}

/* 关键统计横幅 (严格对标图2「总消耗 184.4万 | 生涯评分 歪打正着的欧皇」) */
.profile-stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 9px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.04);
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
  color: #9ca3af;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}
.pstats-value {
  font-size: 16px;
  font-weight: 700;
  color: #f3f4f6;
  line-height: 1;
  display: inline-flex;
  align-items: center;
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
  color: #f59e0b;
  font-size: 13px;
}
.text-accent-gold {
  color: #fbbf24;
}
.pstats-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
}

.luck-text--godly { color: #34d399; }
.luck-text--lucky { color: #60a5fa; }
.luck-text--normal { color: #fbbf24; }
.luck-text--unlucky, .luck-text--bottom { color: #f87171; }

/* 当前版本横幅与印章 (严格对标图2 绿色横幅《双层至尊欧皇》+ 黑盒统计自 2024年10月29日) */
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
  transform: rotate(-1deg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.luck--godly, .luck--lucky {
  background: #00d084;
  color: #0c1a13;
}
.luck--normal {
  background: #f59e0b;
  color: #1a1204;
}
.luck--unlucky, .luck--bottom {
  background: #ef4444;
  color: #ffffff;
}
.pill-prefix {
  font-size: 9px;
  font-weight: 900;
  line-height: 1.1;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.85;
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
  border: 1px dashed rgba(255, 255, 255, 0.22);
  border-radius: 4px;
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.25);
  transform: rotate(2deg);
}
.stamp-sub {
  font-size: 9px;
  color: #9ca3af;
  letter-spacing: 0.05em;
}
.stamp-date {
  font-size: 11px;
  font-weight: 700;
  color: #e5e7eb;
  font-family: monospace;
}

/* 三大卡池指标卡片：强制在所有分辨率下保持 3 栏并排 (严格对标图2「限定 / 标准 / 中坚」) */
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
  background: #202227;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
@media (max-width: 640px) {
  .pool-column-box {
    padding: 10px 6px;
    gap: 4px;
  }
}
.pool-column-box:hover, .pool-column-box.is-active {
  border-color: rgba(255, 255, 255, 0.18);
}
.pool-column-box.is-active {
  border-color: #00d084;
  background: #22262d;
}
.pcol-title {
  font-size: 13px;
  font-weight: 700;
  color: #9ca3af;
  text-align: center;
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
  color: #ffffff;
  line-height: 1;
}
@media (max-width: 640px) {
  .pcol-pulls .pulls-num {
    font-size: 22px;
  }
}
.pcol-pulls .pulls-unit {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
}
.pcol-details {
  display: flex;
  justify-content: space-around;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
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
  color: #ffffff;
}
.val-up {
  color: #00d084;
}
.val-slash {
  color: #6b7280;
  margin: 0 1px;
}
.val-off {
  color: #ef4444;
}
.pdetail-lbl {
  font-size: 9px;
  color: #9ca3af;
}

/* 底部标签胶囊行 (图2 特色：十连两金、3连up、大保底就绪) */
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
  background: rgba(16, 185, 129, 0.14);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.35);
}
.tag-amber {
  background: rgba(245, 158, 11, 0.14);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
}
.tag-gold {
  background: rgba(234, 179, 8, 0.16);
  color: #fde047;
  border: 1px solid rgba(234, 179, 8, 0.4);
}
.tag-danger {
  background: rgba(239, 68, 68, 0.14);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.35);
}
.tag-neutral {
  background: rgba(255, 255, 255, 0.05);
  color: #9ca3af;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* 2. 五星收藏总览 (图3) */
.collection-section {
  padding: 16px 20px;
}
.collection-header {
  margin-bottom: 12px;
}
.collection-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #f3f4f6;
}
.collection-summary {
  font-size: 12px;
  color: #9ca3af;
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
  background: #11141c;
  border: 1.5px solid rgba(234, 179, 8, 0.7);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
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
  background: rgba(0, 0, 0, 0.85);
  color: #fbbf24;
  font-size: 9px;
  font-weight: 800;
  padding: 1px 3.5px;
  border-radius: 2px;
  line-height: 1;
  border: 1px solid rgba(234, 179, 8, 0.4);
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
  font-size: 17px;
  font-weight: 700;
  color: #f3f4f6;
}
.history-total-tag {
  font-size: 11px;
  color: #9ca3af;
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #9ca3af;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 9px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.btn-four-star-toggle:hover {
  background: rgba(255, 255, 255, 0.09);
  color: #e5e7eb;
}
.btn-four-star-toggle.is-active {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.28);
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
.toggle-icon {
  flex-shrink: 0;
}

/* 视图模式切换组合按钮 [ ≡ | ⊞ ] */
.view-mode-toggle-group {
  display: inline-flex;
  align-items: center;
  background: #101319;
  border: 1px solid #232938;
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}
.view-mode-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: none;
  background: transparent;
  color: #6b7280;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}
.view-mode-btn:hover {
  color: #d1d5db;
}
.view-mode-btn.is-active {
  background: #252c3c;
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.history-filters-row {
  margin-bottom: 12px;
}
.pool-tabs-group {
  display: flex;
  background: #101319;
  padding: 2px;
  border-radius: 6px;
  border: 1px solid #232938;
}
.pool-tab-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.pool-tab-btn.is-active {
  background: #1f2533;
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

/* 垫抽概览折叠控制条 */
.pity-collapse-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #151922;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 6px 12px;
  margin-bottom: 10px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.pity-collapse-bar:hover {
  background: #1c2230;
  border-color: rgba(255, 255, 255, 0.16);
}
.pity-collapse-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pity-collapse-title {
  font-size: 12px;
  font-weight: 700;
  color: #e5e7eb;
}
.pity-collapse-badge {
  font-size: 10px;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 4px;
}
.pity-collapse-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 600;
}
.pity-collapse-bar:hover .pity-collapse-toggle {
  color: #ffffff;
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
  background: #202227;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 6px;
  cursor: default;
  transition: all 0.15s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
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
  border-color: rgba(255, 255, 255, 0.18);
  background: #252830;
}
.chip-label {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.chip-count {
  font-size: 15px;
  font-weight: 900;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-emerald { background: #00d084; box-shadow: 0 0 6px rgba(0, 208, 132, 0.5); }
.dot-teal { background: #14b8a6; box-shadow: 0 0 6px rgba(20, 184, 166, 0.5); }
.dot-blue { background: #3b82f6; box-shadow: 0 0 6px rgba(59, 130, 246, 0.5); }
.chip-sub {
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
  margin-top: 2px;
  white-space: nowrap;
}

/* 卡池横幅卡片 */
.banner-groups-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.banner-block-card {
  background: #181a20;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
@media (max-width: 640px) {
  .banner-block-card {
    padding: 12px 10px;
  }
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
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
.banner-pulls-pill.pill-limited {
  background: #6366f1;
}
.banner-pulls-pill.pill-pet {
  background: #0284c7;
}
.banner-pulls-pill.pill-standard {
  background: #10b981;
}
.banner-name {
  font-size: 15px;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 0.01em;
}
.banner-date-range {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  margin-left: 2px;
}

/* B. 紧凑折叠网格视图 (小黑盒同款四宫格高密度布局) */
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
  background: #1a1e27;
  border: 1.5px solid rgba(234, 179, 8, 0.45);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  flex-shrink: 0;
  cursor: default;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
@media (max-width: 480px) {
  .grid-avatar-item {
    width: 46px;
    height: 46px;
  }
}
.grid-avatar-item:hover {
  transform: translateY(-2px);
  border-color: #eab308;
}
.grid-hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.grid-pity-item {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
}
.grid-pity-avatar {
  font-size: 20px;
  font-weight: 900;
  color: #9ca3af;
  user-select: none;
}
.grid-pulls-chip {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(0, 0, 0, 0.82);
  color: #ffffff;
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
  color: #6b7280;
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
  color: #9ca3af;
}
.up-hero-mini-avatar {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  overflow: hidden;
  border: 1.5px solid #eab308;
  box-shadow: 0 0 6px rgba(234, 179, 8, 0.35);
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
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 12px;
}
.pity-question-avatar {
  width: 42px;
  height: 42px;
  border-radius: 6px;
  background: #20242e;
  border: 1.5px solid #3b4252;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 900;
  color: #9ca3af;
  flex-shrink: 0;
}
.pity-waterfall-bar {
  flex: 1;
  height: 28px;
  background: #11141c;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}
.pity-bar-fill {
  height: 100%;
  background: repeating-linear-gradient(45deg, #00d084 0, #00d084 10px, #059669 10px, #059669 20px);
  display: flex;
  align-items: center;
  padding-left: 10px;
  transition: width 0.3s ease;
}
.pity-bar-text {
  font-size: 12px;
  font-weight: 800;
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}
.pity-remain-hint {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  white-space: nowrap;
}

/* 5星出货瀑布流 (严格对标图1) */
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
  border: 2px solid #eab308;
  background: #151922;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.stamp-wai {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #dc2626;
  color: #ffffff;
  font-size: 9px;
  font-weight: 900;
  padding: 1px 4px;
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  line-height: 1.1;
}
.badge-up {
  position: absolute;
  top: -4px;
  left: -4px;
  background: #00d084;
  color: #0b1a13;
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
  background: #f59e0b;
  color: #1a1204;
  font-size: 8px;
  font-weight: 900;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.1;
}
.wf-hero-date {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  font-family: monospace;
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
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}
.bar-stripe-overlay {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background: repeating-linear-gradient(45deg, #fff 0, #fff 10px, transparent 10px, transparent 20px);
  pointer-events: none;
}
.bar--lucky {
  background: linear-gradient(90deg, #00d084 0%, #10b981 100%);
  color: #08170e;
}
.bar--normal {
  background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
  color: #1a1204;
}
.bar--pity {
  background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
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

/* 挂载的 4 星小头像列表 (严格对齐图1，整齐排列于条下方) */
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
  background: #141721;
  box-shadow: 0 0 6px rgba(168, 85, 247, 0.35);
  flex-shrink: 0;
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
  color: #6b7280;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 6px;
}
.history-empty {
  text-align: center;
  padding: 32px;
  color: #6b7280;
  font-size: 13px;
}

/* 底部右侧悬浮快捷操作圆形按钮（对标小黑盒「更新」与「分享/工具」圆纽） */
.floating-fab-dock {
  position: fixed;
  bottom: 24px;
  right: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 100;
}
@media (max-width: 640px) {
  .floating-fab-dock {
    bottom: 20px;
    right: 14px;
    gap: 10px;
  }
}
.fab-circle-btn {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #ffffff;
  color: #11141c;
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.fab-circle-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
}
.fab-circle-text {
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
}

/* 弹窗样式 */
.import-modal-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.import-desc {
  margin: 0;
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.5;
}
.file-drop-zone {
  border: 2px dashed #374151;
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  transition: border-color 0.2s, background 0.2s;
}
.file-drop-zone:hover {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.04);
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
  color: #10b981;
}
.drop-zone-text {
  font-size: 14px;
  font-weight: 600;
  color: #e5e7eb;
}
.drop-zone-sub {
  font-size: 11px;
  color: #6b7280;
}
.import-divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: #6b7280;
  font-size: 11px;
}
.import-divider::before, .import-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #232938;
}
.import-divider span {
  padding: 0 10px;
}
.import-textarea {
  width: 100%;
  background: #101319;
  border: 1px solid #283042;
  border-radius: 6px;
  padding: 10px;
  font-family: monospace;
  font-size: 12px;
  color: #e5e7eb;
  resize: vertical;
  box-sizing: border-box;
}
.import-textarea:focus {
  border-color: #10b981;
  outline: none;
}
.import-error-msg {
  color: #ef4444;
  font-size: 12px;
}
.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 导出工具弹窗 */
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
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.tool-intro {
  margin: 0;
  font-size: 13px;
  color: #d1d5db;
  line-height: 1.6;
}
.tool-path-box {
  background: #101319;
  border: 1px solid #1f2533;
  border-radius: 6px;
  padding: 10px 14px;
}
.path-title {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 4px;
}
.path-code {
  font-family: monospace;
  font-size: 12px;
  color: #f59e0b;
  word-break: break-all;
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
  background: #11141c;
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid #1e2432;
}
.step-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #10b981;
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
  margin-top: 2px;
}
.step-desc {
  font-size: 12px;
  color: #d1d5db;
  line-height: 1.5;
}
.code-inline {
  background: #181d26;
  color: #f59e0b;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
}
.command-copy-box {
  background: #101319;
  border: 1px solid #1f2533;
  border-radius: 6px;
  padding: 10px 14px;
}
.copy-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 6px;
}
.btn-copy-cmd {
  background: transparent;
  border: 1px solid #374151;
  color: #10b981;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.cmd-text {
  display: block;
  font-family: monospace;
  font-size: 12px;
  color: #38bdf8;
}

/* 修改玩家档案弹窗样式 */
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
  color: #d1d5db;
}
.edit-input-wrap {
  display: flex;
  gap: 8px;
}
.edit-text-input {
  flex: 1;
  background: #101319;
  border: 1px solid #2d3748;
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  padding: 8px 12px;
  outline: none;
  transition: border-color 0.15s;
}
.edit-text-input:focus {
  border-color: #6366f1;
}
.btn-quick-fill {
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.35);
  color: #a5b4fc;
  font-size: 11px;
  font-weight: 700;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.btn-quick-fill:hover {
  background: rgba(99, 102, 241, 0.25);
  color: #ffffff;
}
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
  padding: 5px;
  border-radius: 6px;
  border: 1.5px solid transparent;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: all 0.15s;
}
.avatar-select-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.avatar-select-item.is-selected {
  border-color: #eab308;
  background: rgba(234, 179, 8, 0.14);
}
.avatar-thumb-img {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.avatar-thumb-name {
  font-size: 10px;
  color: #9ca3af;
  text-align: center;
  white-space: nowrap;
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
  background: rgba(99, 102, 241, 0.9);
}
</style>
