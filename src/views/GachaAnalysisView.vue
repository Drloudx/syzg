<template>
  <div class="page-view-container gacha-analysis-page" data-main-scroll>
    <!-- 空状态顶部导航与操作栏（仅在未导入数据时显示引导，导入后直出玩家看板） -->
    <div v-if="!hasRecords" class="analysis-header executive-panel">
      <div class="analysis-header__main">
        <div class="analysis-header__title-group">
          <div class="analysis-header__badge">
            <span class="badge-star">✦</span>
            <span>大书院数据分析</span>
          </div>
          <h1 class="analysis-header__title">招募记录分析</h1>
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

          <UiButton variant="secondary" size="sm" @click="downloadExporterTool">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>下载抽卡记录导出工具</span>
          </UiButton>
        </div>
      </div>
    </div>

    <!-- 空状态：暂未导入真实抽卡记录 -->
    <div v-if="!hasRecords" class="analysis-empty-card executive-panel">
      <div class="empty-hero-block">
        <div class="empty-icon-shield">
          <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="empty-svg-icon" aria-hidden="true">
            <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
          </svg>
        </div>
        <h2 class="empty-title">暂未导入抽卡历史记录</h2>
        <p class="empty-desc">
          请使用数据导出工具提取游戏内抽卡记录，或导入已有的记录文件
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
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
            <span>导出工具使用教程</span>
          </UiButton>
        </div>

        <!-- 极简三步指引 -->
        <div class="quick-guide-grid">
          <div class="guide-step-card">
            <div class="step-header">
              <span class="step-num">01</span>
              <span class="step-title">启动模拟器与游戏</span>
            </div>
            <div class="step-text">在电脑打开 MuMu 12/15、雷电等模拟器，启动《深渊之歌》并进入游戏主界面。</div>
          </div>
          <div class="guide-step-card">
            <div class="step-header">
              <span class="step-num">02</span>
              <span class="step-title">运行导出工具</span>
            </div>
            <div class="step-text">解压压缩包并双击 <code class="code-badge">深渊之歌抽卡导出工具.exe</code>，待状态灯变绿显示「抽卡监听中」。</div>
          </div>
          <div class="guide-step-card">
            <div class="step-header">
              <span class="step-num">03</span>
              <span class="step-title">翻页捕获并导入</span>
            </div>
            <div class="step-text">进入游戏【招募】→【记录查询】，点击工具「一键全自动翻页」，完成后导出并导入本页。</div>
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
              <span class="profile-name" title="点击修改昵称" @click="openEditProfileModal">{{ playerData.nickname || '小小工匠' }}</span>
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
            <!-- 保存截图按钮 -->
            <button
              type="button"
              class="btn-ghost-save"
              title="保存招募看板长图，方便分享"
              :disabled="isCapturing"
              @click="handleSaveScreenshot"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              <span>{{ isCapturing ? '生成中' : '保存' }}</span>
            </button>

            <!-- 清空记录按钮 -->
            <button
              type="button"
              class="btn-ghost-clear"
              title="清空记录"
              @click="confirmClearRecords"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          <!-- 1. 伙伴 (角色限定) -->
          <div
            class="pool-column-box"
            :class="{ 'is-active': activeTab === 'hero_limited' }"
            @click="activeTab = 'hero_limited'"
          >
            <div class="pcol-title">伙伴</div>
            <div class="pcol-pulls">
              <strong class="pulls-num">{{ analysis.heroLimited?.pulls || 0 }}</strong>
              <small class="pulls-unit">抽</small>
            </div>
            <div class="pcol-details">
              <div class="pdetail-item">
                <span class="pdetail-num">
                  <span class="val-up">{{ analysis.heroLimited?.upCount || 0 }}</span>
                  <span class="val-slash">/</span>
                  <span class="val-off">{{ analysis.heroLimited?.offCount || 0 }}</span>
                </span>
                <span class="pdetail-lbl">出卡数/歪</span>
              </div>
              <div class="pdetail-item">
                <span class="pdetail-num text-emerald">{{ analysis.heroLimited?.avgUpPulls || '--' }}</span>
                <span class="pdetail-lbl">UP平均</span>
              </div>
            </div>
          </div>

          <!-- 2. 魔物 (魔物限定) -->
          <div
            class="pool-column-box"
            :class="{ 'is-active': activeTab === 'pet_limited' }"
            @click="activeTab = 'pet_limited'"
          >
            <div class="pcol-title">魔物</div>
            <div class="pcol-pulls">
              <strong class="pulls-num">{{ analysis.petLimited?.pulls || 0 }}</strong>
              <small class="pulls-unit">抽</small>
            </div>
            <div class="pcol-details">
              <div class="pdetail-item">
                <span class="pdetail-num">
                  <span class="val-up">{{ analysis.petLimited?.upCount || 0 }}</span>
                  <span class="val-slash">/</span>
                  <span class="val-off">{{ analysis.petLimited?.offCount || 0 }}</span>
                </span>
                <span class="pdetail-lbl">出卡数/歪</span>
              </div>
              <div class="pdetail-item">
                <span class="pdetail-num text-emerald">{{ analysis.petLimited?.avgUpPulls || '--' }}</span>
                <span class="pdetail-lbl">UP平均</span>
              </div>
            </div>
          </div>

          <!-- 3. 常规 (角色常规 + 魔物常规) -->
          <div
            class="pool-column-box"
            :class="{ 'is-active': activeTab === 'hero_standard' || activeTab === 'pet_standard' }"
            @click="activeTab = 'hero_standard'"
          >
            <div class="pcol-title">常规</div>
            <div class="pcol-pulls">
              <strong class="pulls-num">{{ analysis.standard?.pulls || 0 }}</strong>
              <small class="pulls-unit">抽</small>
            </div>
            <div class="pcol-details">
              <div class="pdetail-item">
                <span class="pdetail-num">
                  <span class="val-hero">{{ analysis.standard?.heroGoldCount || 0 }}</span>
                  <span class="val-slash">/</span>
                  <span class="val-pet">{{ analysis.standard?.petGoldCount || 0 }}</span>
                </span>
                <span class="pdetail-lbl">伙伴/魔物</span>
              </div>
              <div class="pdetail-item">
                <span class="pdetail-num text-emerald">{{ analysis.standard?.avgGoldPulls || '--' }}</span>
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
            <div class="chip-label">{{ formatBannerName(p.name) }}已垫</div>
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
                <span class="banner-name">{{ formatBannerName(banner.poolName) }}</span>
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

            <!-- A. 列表条状视图（严格对标图2：顶端垫抽项与下方出货行结构样式完全统一） -->
            <div v-if="viewMode === 'list'" class="banner-list-flow">
              <!-- 出金瀑布流列表（含顶端已垫抽数行） -->
              <div v-if="banner.golds.length > 0 || banner.pityCount > 0" class="gold-waterfall-flow">
                <!-- 顶端已垫抽数项（严格对标图2：左边问号头像徽章，右边自适应长度彩色出货条，无多余底槽与虚线外框） -->
                <div v-if="banner.pityCount > 0" class="waterfall-card-item waterfall-pity-item">
                  <div class="wf-avatar-block">
                    <div class="waterfall-avatar-wrapper pity-avatar-wrapper">
                      <span class="pity-question-mark">?</span>
                    </div>
                  </div>
                  <div class="wf-track-block">
                    <div class="waterfall-bar-row">
                      <div
                        class="waterfall-bar-fill"
                        :class="resolveBarTierClass(banner.pityCount)"
                        :style="{ width: resolveBarWidth(banner.pityCount) }"
                      >
                        <div class="bar-stripe-overlay"></div>
                        <span class="bar-pulls-label">已垫 {{ banner.pityCount }} 抽</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 历史出金项 -->
                <div
                  v-for="(gold, gIdx) in banner.golds"
                  :key="`gold-${gIdx}-${gold.rawId}`"
                  class="waterfall-card-item"
                  :class="{ 'has-purples': showFourStar && gold.purples && gold.purples.length > 0 }"
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
                      <!-- 状态徽章：单角标设计；歪的 New 改为红色，不显示歪 -->
                      <span
                        v-if="isLimitedPool(banner.poolKind) && !gold.isUp && gold.isNew"
                        class="badge-new badge-new-wai"
                      >New</span>
                      <span
                        v-else-if="isLimitedPool(banner.poolKind) && !gold.isUp"
                        class="stamp-wai"
                      >歪</span>
                      <span
                        v-else-if="gold.isNew"
                        class="badge-new"
                      >New</span>
                    </div>
                    <span
                      v-if="showFourStar && gold.purples && gold.purples.length > 0"
                      class="wf-hero-date"
                    >
                      {{ formatShortDate(gold.at) }}
                    </span>
                  </div>

                  <!-- 右列：抽数彩色进度条 + 挂载的 4 星小头像列表 -->
                  <div class="wf-track-block">
                    <div class="waterfall-bar-row">
                      <div
                        class="waterfall-bar-fill"
                        :class="resolveBarTierClass(gold.pullCount)"
                        :style="{ width: resolveBarWidth(gold.pullCount) }"
                      >
                        <div class="bar-stripe-overlay"></div>
                        <span class="bar-pulls-label">{{ gold.pullCount }} 抽</span>
                      </div>
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
                  <!-- 角标：单角标设计；歪的 New 改为红色，不显示歪 -->
                  <span
                    v-if="isLimitedPool(banner.poolKind) && !gold.isUp && gold.isNew"
                    class="grid-badge-new grid-badge-new-wai"
                  >New</span>
                  <span
                    v-else-if="isLimitedPool(banner.poolKind) && !gold.isUp"
                    class="grid-badge-wai"
                  >歪</span>
                  <span
                    v-else-if="gold.isNew"
                    class="grid-badge-new"
                  >New</span>

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
        title="导出工具使用教程"
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
          支持导入由导出工具生成的 <code class="code-badge">gacha_records.json</code>，或直接粘贴 JSON 文本。
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

    <!-- 弹窗 2：抽卡记录导出工具使用教程 -->
    <UiModal
      v-model:visible="isToolModalOpen"
      title="抽卡记录导出工具使用教程"
      max-width="620px"
      teleport-to="body"
    >
      <div class="tool-modal-body">
        <div class="tool-download-card">
          <div class="tool-download-info">
            <div class="tool-download-name">深渊之歌抽卡导出工具（桌面免安装版）</div>
            <div class="tool-download-meta">解压即得 <code class="code-inline">深渊之歌抽卡导出工具.exe</code> 单文件 · 无需安装额外运行库</div>
          </div>
          <UiButton variant="primary" size="sm" @click="downloadExporterTool">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>下载工具 (.zip)</span>
          </UiButton>
        </div>

        <div v-if="isMobileDevice()" class="tool-mobile-tip">
          当前导出工具仅支持 Windows 电脑端模拟器运行，请在电脑浏览器下载并使用。
        </div>

        <div class="tool-steps-flow">
          <div class="flow-step">
            <span class="step-badge">1</span>
            <div class="step-desc">
              <strong>启动模拟器与游戏：</strong>在电脑打开 <strong>MuMu 12 / 15</strong>、雷电、夜神或逍遥模拟器，启动《深渊之歌》并登录进入主界面。
            </div>
          </div>
          <div class="flow-step">
            <span class="step-badge">2</span>
            <div class="step-desc">
              <strong>双击运行工具：</strong>解压下载的压缩包，双击运行 <code class="code-inline">深渊之歌抽卡导出工具.exe</code>。工具会自动定位模拟器，待右上角状态灯变为绿色「抽卡监听中」即可。
              <div class="step-sub-note">雷电模拟器如未自动连上，请在模拟器【设置 → 其他设置】开启「ADB 调试（本地连接）」后重启模拟器。</div>
            </div>
          </div>
          <div class="flow-step">
            <span class="step-badge">3</span>
            <div class="step-desc">
              <strong>翻页捕获记录：</strong>在游戏内进入【招募】→ 点击左下角【记录查询】，点击工具界面的 <strong>一键全自动翻页</strong>（也可手动逐页点击下一页）；【伙伴招募】翻完后，切到【魔物贩售】再翻一次。
            </div>
          </div>
          <div class="flow-step">
            <span class="step-badge">4</span>
            <div class="step-desc">
              <strong>导出并导入分析：</strong>翻完后点击 <strong>导出并打开 Wiki 分析页</strong>，工具会自动生成 <code class="code-inline">gacha_records.json</code> 并复制到剪贴板；回到本页点击「导入记录」，直接粘贴或选择文件即可查看分析。
            </div>
          </div>
        </div>

        <div class="tool-warning-box">
          <strong>安全提示：</strong>自动翻页期间请勿提前关闭游戏内的【记录查询】弹窗，以免误触主界面抽卡按钮；如需随时中止自动翻页，按 <code class="code-inline">Esc</code> 或 <code class="code-inline">Space</code>（空格）键即可急停。
        </div>
      </div>

      <template #footer>
        <div class="modal-footer-btns">
          <UiButton variant="secondary" size="sm" @click="isToolModalOpen = false">
            <span>我知道了</span>
          </UiButton>
          <UiButton variant="primary" size="sm" @click="isToolModalOpen = false; openImportModal()">
            <span>去导入记录</span>
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
            <div class="acct-avatar-thumb-box">
              <img
                :src="getImageUrl(avatarPreviewPath)"
                alt="当前头像"
                class="acct-avatar-thumb"
                @error="handleImgFallback"
              />
            </div>
            <div class="acct-avatar-info">
              <span class="acct-avatar-row-title">{{ avatarPreviewName }}</span>
              <span class="acct-avatar-row-sub">点击挑选角色或魔物头像</span>
            </div>
            <span class="acct-row-action">
              <span>更换头像</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </span>
          </button>
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
import { renderGachaReportCard } from '../utils/gachaReportCardCanvas.js'
import { shareOrSaveImage } from '../utils/gachaShareImage.js'

// 本地存储 KEY
const STORAGE_KEY = 'syzg_real_gacha_records_v1'
const rawRecords = ref([])
const playerData = ref({
  uid: '',
  nickname: '小小工匠',
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
  isToolModalOpen.value = true
}

function downloadExporterTool() {
  const link = document.createElement('a')
  link.href = '/tools/gacha-exporter.zip'
  link.download = '深渊之歌抽卡导出工具.zip'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  if (isMobileDevice()) {
    showToast('导出工具为 Windows 电脑端程序，请在电脑上解压运行')
  } else {
    showToast('已开始下载导出工具，解压后双击即可使用')
  }
}

// 修改玩家档案（UID、昵称与头像）
const isEditProfileModalOpen = ref(false)
const isAvatarPickerOpen = ref(false)
const activeAvatarId = ref('')
const editUidInput = ref('')
const editNicknameInput = ref('小小工匠')
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
  editNicknameInput.value = playerData.value.nickname || '小小工匠'
  selectedAvatarSrc.value = playerData.value.avatar || ''
  activeAvatarId.value = avatarEntry(playerData.value.avatar)?.id || ''
  isEditProfileModalOpen.value = true
}

function saveProfileEdit() {
  const newName = editNicknameInput.value.trim()
  playerData.value.nickname = newName || '小小工匠'
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

function isLimitedPool(poolKind) {
  return poolKind === 'hero_limited' || poolKind === 'pet_limited'
}

function formatBannerName(name = '') {
  if (!name) return ''
  let n = String(name)
  n = n.replace(/特别贩售/g, '魔物常规')
  n = n.replace(/魔物蛋池|魔物蛋/g, '魔物限定')
  return n
}

function resolvePoolPillClass(poolKind) {
  if (poolKind === 'hero_limited') return 'pill-limited'
  if (poolKind === 'pet_limited') return 'pill-pet-limited'
  if (poolKind === 'hero_standard') return 'pill-standard'
  if (poolKind === 'pet_standard' || poolKind === 'pet') return 'pill-pet-standard'
  return 'pill-standard'
}

const poolFilterOptions = [
  { value: 'all', label: '全部卡池' },
  { value: 'hero_limited', label: '角色限定' },
  { value: 'pet_limited', label: '魔物限定' },
  { value: 'hero_standard', label: '角色常规' },
  { value: 'pet_standard', label: '魔物常规' }
]

// 弹窗状态
const isImportModalOpen = ref(false)
const isToolModalOpen = ref(false)
const importJsonText = ref('')
const importError = ref('')
const fileInputRef = ref(null)

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
  if (kind === 'pet_limited') return 'dot-gold'
  if (kind === 'hero_standard') return 'dot-teal'
  if (kind === 'pet_standard' || kind === 'pet') return 'dot-brown'
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

function resolveBarWidth(pullCount) {
  const p = Number(pullCount) || 1
  if (p <= 1) return '10.5%'
  if (p >= 36) return '100%'
  // 1 抽到 36 抽阶梯平滑递增：8% 基础宽度 + (p / 36) * 92%，确保 2 抽、4 抽有明显可辨的长短差异
  const pct = 8 + (p / 36) * 92
  return `${pct.toFixed(1)}%`
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

const isCapturing = ref(false)

async function handleSaveScreenshot() {
  if (isCapturing.value) return
  isCapturing.value = true
  try {
    const canvas = await renderGachaReportCard({
      playerData: playerData.value,
      avatarUrl: getImageUrl(topPulledAvatar.value),
      formattedCost: formattedCost.value,
      costIconUrl: getImageUrl('/images/Common_ItemIcon/item_00002.webp'),
      analysis: analysis.value,
      overviewTags: overviewTags.value,
      formattedExportDate: formattedExportDate.value,
      resolveAvatarSrc: (item) => getImageUrl(resolveAvatarSrc(item)),
      banners: filteredBanners.value,
      showFourStar: showFourStar.value
    })

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('生成图片失败')

    const dateStr = new Date().toISOString().slice(0, 10)
    const nick = playerData.value.nickname || '小小工匠'
    const fileName = `深渊之歌-招募分析-${nick}-${dateStr}.png`

    const result = await shareOrSaveImage(blob, fileName, {
      title: `《深渊之歌》招募分析报告 - ${nick}`,
      dialogTitle: '分享招募分析报告'
    })

    if (result === 'downloaded') {
      showToast('分析看板长图已保存到下载目录')
    } else {
      showToast('已调起系统分享')
    }
  } catch (err) {
    console.error('截图生成失败:', err)
    showToast('保存截图失败，请稍后重试')
  } finally {
    isCapturing.value = false
  }
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
  max-width: 1060px;
  width: 100%;
  margin: 0 auto;
  position: relative;
  box-sizing: border-box;
  color: var(--text-main, #3e2a14);
  font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
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
    width: 100%;
  }
}

/* 主流顶级二游深色战术面板 (Executive Tactical Panel) */
.executive-panel {
  background-color: rgba(223, 206, 179, 0.94);
  background-image: linear-gradient(180deg, rgba(235, 222, 201, 0.8) 0%, rgba(220, 202, 173, 0.85) 100%);
  border: 2px solid var(--border-color, #8f7351);
  border-radius: 12px;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.15), inset 0 0 20px rgba(135, 107, 72, 0.08);
  color: var(--text-main, #3e2a14);
  position: relative;
  box-sizing: border-box;
}

:deep(.dark-mode) .executive-panel,
.dark-mode .executive-panel,
.dark-theme .executive-panel {
  background: linear-gradient(180deg, #2b1f15 0%, #1e150d 100%);
  border-color: var(--border-color, #7d6040);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  color: var(--text-main, #ebdcc3);
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
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #065f46;
  background: rgba(16, 185, 129, 0.16);
  border: 1px solid rgba(5, 150, 105, 0.45);
  box-shadow: 0 1px 2px rgba(6, 95, 70, 0.1);
  padding: 3px 10px;
  border-radius: 6px;
  margin-bottom: 6px;
}
.badge-star {
  font-size: 11px;
  color: #059669;
}
:deep(.dark-mode) .analysis-header__badge,
.dark-mode .analysis-header__badge,
.dark-theme .analysis-header__badge {
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(52, 211, 153, 0.5);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
:deep(.dark-mode) .badge-star,
.dark-mode .badge-star,
.dark-theme .badge-star {
  color: #34d399;
}
.analysis-header__title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  letter-spacing: 0.02em;
}
:deep(.dark-mode) .analysis-header__title,
.dark-mode .analysis-header__title {
  color: var(--text-main, #ebdcc3);
}
.analysis-header__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .analysis-header__subtitle,
.dark-mode .analysis-header__subtitle {
  color: var(--text-muted, #bfa988);
}
.analysis-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 空状态卡片 */
.analysis-empty-card {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px 28px;
  text-align: center;
}
.empty-hero-block {
  width: 100%;
  max-width: 760px;
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
  border: 1px solid rgba(16, 185, 129, 0.28);
  margin-bottom: 18px;
}
.empty-svg-icon {
  color: #059669;
}
:deep(.dark-mode) .empty-svg-icon,
.dark-mode .empty-svg-icon {
  color: #34d399;
}
.empty-title {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .empty-title,
.dark-mode .empty-title {
  color: var(--text-main, #ebdcc3);
}
.empty-desc {
  max-width: 540px;
  margin: 0 auto 26px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .empty-desc,
.dark-mode .empty-desc {
  color: var(--text-muted, #bfa988);
}
.empty-actions {
  display: flex;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 32px;
}
.quick-guide-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  flex-direction: column;
  gap: 8px;
  background: rgba(233, 220, 195, 0.72);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 10px;
  padding: 15px 16px;
  box-shadow: inset 0 1px 0 rgba(255, 250, 240, 0.45);
}
:deep(.dark-mode) .guide-step-card,
.dark-mode .guide-step-card {
  background: rgba(43, 31, 21, 0.78);
  border-color: var(--border-color, #7d6040);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 22px;
  padding: 0 6px;
  border-radius: 6px;
  background: rgba(16, 185, 129, 0.14);
  border: 1px solid rgba(5, 150, 105, 0.32);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #065f46;
  flex-shrink: 0;
}
:deep(.dark-mode) .step-num,
.dark-mode .step-num {
  background: rgba(16, 185, 129, 0.18);
  border-color: rgba(52, 211, 153, 0.42);
  color: #6ee7b7;
}
.step-title {
  font-size: 13.5px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  line-height: 1.3;
}
:deep(.dark-mode) .step-title,
.dark-mode .step-title {
  color: var(--text-main, #ebdcc3);
}
.step-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .step-text,
.dark-mode .step-text {
  color: var(--text-muted, #bfa988);
}
.code-badge {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 700;
  background: rgba(143, 115, 81, 0.16);
  color: #854d0e;
  padding: 1px 5px;
  border-radius: 4px;
  word-break: keep-all;
}
:deep(.dark-mode) .code-badge,
.dark-mode .code-badge {
  background: rgba(196, 148, 56, 0.18);
  color: #f5d08a;
}

/* ========================================================
   1. 玩家档案头部 (羊皮纸 Wiki 主题主流二游终端 · 高质感重构)
   ======================================================== */
.player-profile-card {
  padding: 18px 22px;
  background-color: rgba(223, 206, 179, 0.94);
  background-image: linear-gradient(180deg, rgba(235, 222, 201, 0.8) 0%, rgba(220, 202, 173, 0.85) 100%);
  border: 2px solid var(--border-color, #8f7351);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.15), inset 0 0 20px rgba(135, 107, 72, 0.08);
  box-sizing: border-box;
}
@media (max-width: 640px) {
  .player-profile-card {
    padding: 14px 12px;
    gap: 12px;
    border-radius: 12px;
  }
}

:deep(.dark-mode) .player-profile-card,
.dark-mode .player-profile-card,
.dark-theme .player-profile-card {
  background: linear-gradient(180deg, #2b1f15 0%, #1e150d 100%);
  border-color: var(--border-color, #7d6040);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
}

.profile-top-row {
  display: flex;
  align-items: center;
  gap: 14px;
  position: relative;
}

/* 头像：精制正圆形金属勋章圆环，108%微缩放彻底抹平切角缝隙，完美贴合 */
.profile-avatar-wrap {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  position: relative;
  cursor: pointer;
  border-radius: 50%;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 3px 8px rgba(60, 42, 22, 0.22));
}
.profile-avatar-wrap:hover {
  transform: scale(1.06);
  filter: drop-shadow(0 4px 12px rgba(196, 148, 56, 0.35));
}
.profile-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  transform: scale(1.08);
  border: 2.5px solid var(--border-color, #8f7351);
  background: var(--paper-solid, #d9c6a6);
  display: block;
  box-sizing: border-box;
  transition: border-color 0.2s ease;
}
.profile-avatar-wrap:hover .profile-avatar-img {
  border-color: #d8af56;
}

/* 头像右下角编辑角标：高层级悬浮小金徽章，确保清晰不被遮挡 */
.avatar-edit-overlay {
  position: absolute;
  bottom: 0px;
  right: 0px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--border-color, #8f7351);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  border: 1.5px solid var(--paper-soft, #f7f3e8);
  z-index: 10;
  transition: all 0.2s ease;
}
.avatar-edit-overlay svg {
  display: block;
  width: 11px;
  height: 11px;
  stroke: #ffffff;
}
.profile-avatar-wrap:hover .avatar-edit-overlay {
  background: var(--accent, #557574);
  transform: scale(1.12);
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
  gap: 8px;
}
.btn-edit-nickname {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-faint, #8a6d4d);
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.btn-edit-nickname:hover {
  color: var(--accent, #557574);
  background: rgba(85, 117, 116, 0.12);
}
.profile-name {
  font-size: 19px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color 0.15s ease;
}
.profile-name:hover {
  color: var(--accent, #557574);
}
:deep(.dark-mode) .profile-name,
.dark-mode .profile-name {
  color: var(--text-main, #ebdcc3);
}

.profile-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 主流现代 UID 胶囊 (告别老旧打字机字体，自然融入羊皮纸) */
.profile-uid-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.4));
  padding: 2px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(60, 42, 22, 0.05);
}
.profile-uid-pill:hover {
  background: #ffffff;
  border-color: var(--accent, #557574);
  color: var(--accent-ink, #2f4a49);
  box-shadow: 0 2px 8px rgba(85, 117, 116, 0.18);
  transform: translateY(-1px);
}
:deep(.dark-mode) .profile-uid-pill,
.dark-mode .profile-uid-pill {
  background: rgba(0, 0, 0, 0.35);
  border-color: var(--border-color, #7d6040);
  color: var(--text-muted, #bfa988);
}
:deep(.dark-mode) .profile-uid-pill:hover,
.dark-mode .profile-uid-pill:hover {
  background: rgba(0, 0, 0, 0.55);
  border-color: var(--accent, #7faea9);
  color: #ffffff;
}
.copy-icon {
  opacity: 0.8;
}

.profile-right-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}
.btn-ghost-save,
.btn-ghost-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 700;
  padding: 3px 10px;
  min-width: 62px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.btn-ghost-save {
  background: rgba(85, 117, 116, 0.08);
  border: 1px solid rgba(85, 117, 116, 0.35);
  color: var(--accent-ink, #2f4a49);
}
.btn-ghost-save:hover:not(:disabled) {
  background: rgba(85, 117, 116, 0.18);
  border-color: var(--accent, #557574);
  color: var(--accent, #557574);
}
.btn-ghost-save:disabled {
  opacity: 0.6;
  cursor: wait;
}

.btn-ghost-clear {
  background: rgba(192, 57, 43, 0.06);
  border: 1px solid rgba(192, 57, 43, 0.3);
  color: #b91c1c;
}
.btn-ghost-clear:hover {
  background: rgba(192, 57, 43, 0.15);
  border-color: #b91c1c;
}

:deep(.dark-mode) .btn-ghost-save,
.dark-mode .btn-ghost-save {
  color: #7faea9;
  border-color: rgba(127, 174, 169, 0.35);
  background: rgba(85, 117, 116, 0.15);
}
:deep(.dark-mode) .btn-ghost-save:hover:not(:disabled),
.dark-mode .btn-ghost-save:hover:not(:disabled) {
  border-color: #7faea9;
  background: rgba(85, 117, 116, 0.28);
}
:deep(.dark-mode) .btn-ghost-clear,
.dark-mode .btn-ghost-clear {
  color: #e25a5a;
  border-color: rgba(226, 90, 90, 0.35);
  background: rgba(192, 57, 43, 0.12);
}
:deep(.dark-mode) .btn-ghost-clear:hover,
.dark-mode .btn-ghost-clear:hover {
  background: rgba(192, 57, 43, 0.22);
}

/* 关键统计横幅 (总消耗 | 生涯评分) */
.profile-stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 10px 16px;
  background: rgba(143, 115, 81, 0.08);
  border-radius: 10px;
  border: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
  box-shadow: inset 0 1px 3px rgba(60, 42, 22, 0.04);
}
:deep(.dark-mode) .profile-stats-bar,
.dark-mode .profile-stats-bar {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.4);
}
.pstats-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  line-height: 1;
}
.pstats-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  letter-spacing: 0.02em;
}
:deep(.dark-mode) .pstats-label,
.dark-mode .pstats-label {
  color: var(--text-muted, #bfa988);
}
.pstats-value {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  line-height: 1;
  display: inline-flex;
  align-items: center;
}
.pstats-cost-value {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 17px;
  font-weight: 800;
  color: #92400e;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
}
:deep(.dark-mode) .pstats-cost-value,
.dark-mode .pstats-cost-value {
  color: #d8af56;
}
.meta-currency-icon {
  width: 17px;
  height: 17px;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}
.text-accent-gold {
  color: #92400e;
  font-weight: 800;
}
:deep(.dark-mode) .text-accent-gold,
.dark-mode .text-accent-gold {
  color: #d8af56;
}
.pstats-divider {
  width: 1px;
  height: 20px;
  background: var(--border-faint, rgba(143, 115, 81, 0.25));
  flex-shrink: 0;
}

/* 生涯评级称号色（天选之子等） */
.luck-text--godly {
  color: #b45309;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.luck-text--lucky {
  color: #0369a1;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.luck-text--normal {
  color: #15803d;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.luck-text--unlucky,
.luck-text--bottom {
  color: #b91c1c;
  font-weight: 900;
  letter-spacing: 0.02em;
}
:deep(.dark-mode) .luck-text--godly,
.dark-mode .luck-text--godly { color: #fbbf24; }
:deep(.dark-mode) .luck-text--lucky,
.dark-mode .luck-text--lucky { color: #60a5fa; }
:deep(.dark-mode) .luck-text--normal,
.dark-mode .luck-text--normal { color: #34d399; }
:deep(.dark-mode) .luck-text--unlucky,
.dark-mode .luck-text--unlucky { color: #f87171; }

/* 当前版本印章与称号横幅 */
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
  padding: 5px 16px;
  border-radius: 8px;
  transform: rotate(-0.5deg);
  box-shadow: 0 3px 10px rgba(60, 42, 22, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.4);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.luck-pill-badge:hover {
  transform: rotate(0deg) scale(1.02);
}
.luck--godly {
  background: linear-gradient(135deg, #c49438 0%, #d8af56 100%);
  color: #2b1f15;
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 3px 10px rgba(196, 148, 56, 0.35);
}
.luck--lucky {
  background: linear-gradient(135deg, #075985 0%, #0284c7 100%);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.45);
  box-shadow: 0 3px 10px rgba(7, 89, 133, 0.3);
}
.luck--normal {
  background: linear-gradient(135deg, #166534 0%, #15803d 100%);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.45);
  box-shadow: 0 3px 10px rgba(22, 101, 52, 0.3);
}
.luck--unlucky,
.luck--bottom {
  background: linear-gradient(135deg, #991b1b 0%, #b91c1c 100%);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.45);
  box-shadow: 0 3px 10px rgba(153, 27, 27, 0.3);
}
.pill-prefix {
  font-size: 9px;
  font-weight: 900;
  line-height: 1.1;
  text-transform: uppercase;
  letter-spacing: 0.05em;
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
  border: 1px dashed var(--border-color, #8f7351);
  border-radius: 6px;
  padding: 4px 10px;
  background: rgba(143, 115, 81, 0.06);
}
.stamp-sub {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-faint, #8a6d4d);
  letter-spacing: 0.03em;
}
.stamp-date {
  font-size: 11px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
}
:deep(.dark-mode) .stamp-watermark-box,
.dark-mode .stamp-watermark-box {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.25);
}
:deep(.dark-mode) .stamp-sub,
.dark-mode .stamp-sub { color: #928068; }
:deep(.dark-mode) .stamp-date,
.dark-mode .stamp-date { color: #ebdcc3; }

/* ========================================================
   三大卡池指标卡片 (现代二游高阶羊皮纸立体卡，绝非死白方盒)
   ======================================================== */
.pools-triple-columns {
  display: grid;
  grid-template-columns: repeat(3, 1fr) !important;
  gap: 10px;
}
@media (max-width: 640px) {
  .pools-triple-columns {
    gap: 6px;
  }
}

.pool-column-box {
  background: rgba(246, 239, 227, 0.7);
  border: 1.5px solid rgba(143, 115, 81, 0.3);
  border-radius: 12px;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 4px rgba(62, 42, 20, 0.04);
  position: relative;
  overflow: hidden;
}
@media (max-width: 640px) {
  .pool-column-box {
    padding: 10px 6px;
    gap: 5px;
  }
}

.pool-column-box:hover {
  border-color: var(--border-color, #8f7351);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(62, 42, 20, 0.08);
}

/* 激活态：保留边框颜色但移除变粗效果，保持 1.5px 正常粗细，彻底移除变亮效果 */
.pool-column-box.is-active {
  border: 1.5px solid var(--border-color, #8f7351);
  box-shadow: 0 2px 8px rgba(62, 42, 20, 0.08);
  transform: translateY(-1px);
}

:deep(.dark-mode) .pool-column-box,
.dark-mode .pool-column-box {
  background: rgba(43, 31, 21, 0.7);
  border-color: var(--border-color, #7d6040);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
:deep(.dark-mode) .pool-column-box:hover,
.dark-mode .pool-column-box:hover {
  border-color: #bfa988;
}
:deep(.dark-mode) .pool-column-box.is-active,
.dark-mode .pool-column-box.is-active {
  border: 1.5px solid #c49438;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.pcol-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-muted, #6b5134);
  text-align: center;
  letter-spacing: 0.05em;
  transition: color 0.2s ease;
}
.pool-column-box.is-active .pcol-title {
  color: var(--text-main, #3e2a14);
  font-weight: 900;
}
:deep(.dark-mode) .pcol-title,
.dark-mode .pcol-title {
  color: var(--text-muted, #bfa988);
}
:deep(.dark-mode) .pool-column-box.is-active .pcol-title,
.dark-mode .pool-column-box.is-active .pcol-title {
  color: #f7ebd7;
}

.pcol-pulls {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 3px;
}
.pcol-pulls .pulls-num {
  font-size: 30px;
  font-weight: 900;
  color: var(--text-main, #3e2a14);
  line-height: 1;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
@media (max-width: 640px) {
  .pcol-pulls .pulls-num {
    font-size: 24px;
  }
}
:deep(.dark-mode) .pcol-pulls .pulls-num,
.dark-mode .pcol-pulls .pulls-num {
  color: #f7ebd7;
}

.pcol-pulls .pulls-unit {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .pcol-pulls .pulls-unit,
.dark-mode .pcol-pulls .pulls-unit {
  color: var(--text-muted, #bfa988);
}

.pcol-details {
  display: flex;
  justify-content: space-around;
  padding-top: 8px;
  border-top: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
}
:deep(.dark-mode) .pdetail-num,
.dark-mode .pdetail-num {
  color: #ebdcc3;
}

.val-up {
  color: #15803d;
  font-weight: 900;
}
:deep(.dark-mode) .val-up,
.dark-mode .val-up { color: #34d399; }

.val-slash {
  color: var(--text-faint, #8a6d4d);
  margin: 0 1px;
}

.val-off {
  color: #b91c1c;
  font-weight: 900;
}
:deep(.dark-mode) .val-off,
.dark-mode .val-off { color: #f87171; }

.val-hero {
  color: #15803d;
  font-weight: 900;
}
:deep(.dark-mode) .val-hero,
.dark-mode .val-hero { color: #34d399; }

.val-pet {
  color: #b45309;
  font-weight: 900;
}
:deep(.dark-mode) .val-pet,
.dark-mode .val-pet { color: #fbbf24; }

.text-emerald {
  color: #15803d !important;
  font-weight: 900;
}
:deep(.dark-mode) .text-emerald,
.dark-mode .text-emerald { color: #34d399 !important; }

.pdetail-lbl {
  font-size: 10px;
  color: var(--text-muted, #6b5134);
  font-weight: 600;
}
:deep(.dark-mode) .pdetail-lbl,
.dark-mode .pdetail-lbl { color: var(--text-muted, #bfa988); }

/* ========================================================
   底部欧气战绩成就标签 (契合羊皮纸大书院UI，轻盈实体标签感)
   ======================================================== */
.profile-tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 6px;
}
.profile-tag-pill {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  letter-spacing: 0.02em;
  line-height: 1.35;
  box-shadow: 0 1px 2px rgba(60, 42, 22, 0.08);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  cursor: default;
}
.profile-tag-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(60, 42, 22, 0.12);
}

/* 欧皇金标签：十连双金、单抽出奇迹、高连UP */
.tag-gold {
  background: #fff8e7;
  color: #8c4a00;
  border: 1px solid #d49a3d;
}

/* 翡翠绿标签：连UP、小保底全胜、超常出金率 */
.tag-emerald {
  background: #f0f9f3;
  color: #146c36;
  border: 1px solid #2ea366;
}

/* 琥珀橙标签：大保底就绪 */
.tag-amber {
  background: #fff5ec;
  color: #b43b02;
  border: 1px solid #e06d2d;
}

/* 典雅朱砂：连歪 */
.tag-danger {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #dc2626;
}

/* 中性朴素：综合出金率 */
.tag-neutral {
  background: #f7f3eb;
  color: #5a3e1b;
  border: 1px solid #8f7351;
}

/* 暗色模式下标签自适应 */
:deep(.dark-mode) .tag-gold, .dark-mode .tag-gold {
  background: rgba(217, 119, 6, 0.16);
  border-color: rgba(245, 158, 11, 0.5);
  color: #fbbf24;
}
:deep(.dark-mode) .tag-emerald, .dark-mode .tag-emerald {
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(16, 185, 129, 0.5);
  color: #34d399;
}
:deep(.dark-mode) .tag-amber, .dark-mode .tag-amber {
  background: rgba(234, 88, 12, 0.16);
  border-color: rgba(249, 115, 22, 0.5);
  color: #fb923c;
}
:deep(.dark-mode) .tag-danger, .dark-mode .tag-danger {
  background: rgba(220, 38, 38, 0.16);
  border-color: rgba(239, 68, 68, 0.5);
  color: #f87171;
}
:deep(.dark-mode) .tag-neutral, .dark-mode .tag-neutral {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  color: #dfceb3;
}
/* 2. 五星收藏总览 (图3) */
.collection-section {
  padding: 18px 22px;
  background-color: rgba(223, 206, 179, 0.94);
  background-image: linear-gradient(180deg, rgba(235, 222, 201, 0.8) 0%, rgba(220, 202, 173, 0.85) 100%);
  border: 2px solid var(--border-color, #8f7351);
  border-radius: 12px;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.15), inset 0 0 20px rgba(135, 107, 72, 0.08);
  box-sizing: border-box;
}
:deep(.dark-mode) .collection-section,
.dark-mode .collection-section {
  background: linear-gradient(180deg, #2b1f15 0%, #1e150d 100%);
  border-color: var(--border-color, #7d6040);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
}
.collection-header {
  margin-bottom: 12px;
}
.collection-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .collection-title,
.dark-mode .collection-title {
  color: var(--text-main, #ebdcc3);
}
.collection-summary {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .collection-summary,
.dark-mode .collection-summary {
  color: var(--text-muted, #bfa988);
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
  width: 34px;
  height: 34px;
  border-radius: 50%;
  filter: drop-shadow(0 2px 4px rgba(60, 42, 22, 0.16));
  flex-shrink: 0;
  transition: transform 0.15s ease, filter 0.15s ease;
}
.collection-item-card:hover .collection-avatar-box {
  transform: translateY(-2px) scale(1.08);
  filter: drop-shadow(0 4px 8px rgba(196, 148, 56, 0.35));
}
.collection-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  transform: scale(1.08);
  border: 2px solid #d8af56;
  background: var(--paper-solid, #d9c6a6);
  display: block;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}
.collection-item-card:hover .collection-avatar-img {
  border-color: #fbbf24;
}
.collection-count-badge {
  z-index: 10;
  position: absolute;
  top: -2px;
  right: -2px;
  background: rgba(30, 20, 10, 0.9);
  color: #fbbf24;
  font-size: 8.5px;
  font-weight: 800;
  padding: 0.5px 3.5px;
  border-radius: 4px;
  line-height: 1.1;
  border: 1px solid rgba(234, 179, 8, 0.6);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
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
  font-weight: 800;
  color: var(--text-main, #3e2a14);
}
:deep(.dark-mode) .history-title,
.dark-mode .history-title {
  color: var(--text-main, #ebdcc3);
}
.history-total-tag {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
}
:deep(.dark-mode) .history-total-tag,
.dark-mode .history-total-tag {
  color: var(--text-muted, #bfa988);
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
  background: rgba(233, 220, 195, 0.75);
  border: 1.5px solid var(--border-color, #8f7351);
  color: var(--text-muted, #6b5134);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 9px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.btn-four-star-toggle:hover {
  background: rgba(245, 237, 222, 0.95);
  color: var(--text-main, #3e2a14);
}
.btn-four-star-toggle.is-active {
  background: var(--wood, #2b1f15);
  border-color: #17100a;
  color: #f7ebd7;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
:deep(.dark-mode) .btn-four-star-toggle,
.dark-mode .btn-four-star-toggle {
  background: rgba(0, 0, 0, 0.3);
  border-color: var(--border-color, #7d6040);
  color: var(--text-muted, #bfa988);
}
:deep(.dark-mode) .btn-four-star-toggle.is-active,
.dark-mode .btn-four-star-toggle.is-active {
  background: linear-gradient(180deg, #573f27, #3d2a19);
  border-color: #ba8c46;
  color: #fff2db;
}
.toggle-icon {
  flex-shrink: 0;
}

/* 视图模式切换组合按钮 [ ≡ | ⊞ ] */
.view-mode-toggle-group {
  display: inline-flex;
  align-items: center;
  background: rgba(143, 115, 81, 0.15);
  border: 1.5px solid var(--border-color, #8f7351);
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
  color: #f7ebd7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
:deep(.dark-mode) .view-mode-toggle-group,
.dark-mode .view-mode-toggle-group {
  background: rgba(0, 0, 0, 0.35);
  border-color: var(--border-color, #7d6040);
}
:deep(.dark-mode) .view-mode-btn.is-active,
.dark-mode .view-mode-btn.is-active {
  background: linear-gradient(180deg, #573f27, #3d2a19);
  color: #fff2db;
}

.history-filters-row {
  margin-bottom: 12px;
}
.pool-tabs-group {
  display: flex;
  background: rgba(143, 115, 81, 0.14);
  padding: 2.5px;
  border-radius: 8px;
  border: 1.5px solid var(--border-color, #8f7351);
}
.pool-tab-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #6b5134);
  font-size: 12px;
  font-weight: 700;
  padding: 4.5px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.pool-tab-btn:hover {
  color: var(--text-main, #3e2a14);
}
.pool-tab-btn.is-active {
  background: var(--wood, #2b1f15);
  color: #f7ebd7;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
:deep(.dark-mode) .pool-tabs-group,
.dark-mode .pool-tabs-group {
  background: rgba(0, 0, 0, 0.35);
  border-color: var(--border-color, #7d6040);
}
:deep(.dark-mode) .pool-tab-btn,
.dark-mode .pool-tab-btn {
  color: var(--text-muted, #bfa988);
}
:deep(.dark-mode) .pool-tab-btn.is-active,
.dark-mode .pool-tab-btn.is-active {
  background: linear-gradient(180deg, #573f27, #3d2a19);
  color: #fff2db;
}

/* 垫抽概览折叠控制条 */
.pity-collapse-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(233, 220, 195, 0.75);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 8px;
  padding: 7px 14px;
  margin-bottom: 10px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  box-shadow: 0 1px 4px rgba(60, 42, 22, 0.05);
}
.pity-collapse-bar:hover {
  background: rgba(245, 237, 222, 0.95);
  border-color: var(--accent, #557574);
}
.pity-collapse-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pity-collapse-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
}
.pity-collapse-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  background: rgba(143, 115, 81, 0.18);
  padding: 1px 7px;
  border-radius: 4px;
}
.pity-collapse-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted, #6b5134);
  font-size: 11px;
  font-weight: 700;
}
.pity-collapse-bar:hover .pity-collapse-toggle {
  color: var(--accent-ink, #2f4a49);
}
:deep(.dark-mode) .pity-collapse-bar,
.dark-mode .pity-collapse-bar {
  background: rgba(43, 31, 21, 0.75);
  border-color: var(--border-color, #7d6040);
}
:deep(.dark-mode) .pity-collapse-title,
.dark-mode .pity-collapse-title {
  color: var(--text-main, #ebdcc3);
}
:deep(.dark-mode) .pity-collapse-badge,
.dark-mode .pity-collapse-badge {
  color: var(--text-muted, #bfa988);
  background: rgba(255, 255, 255, 0.08);
}
.pity-toggle-arrow {
  transition: transform 0.2s ease;
}
.pity-toggle-arrow.is-open {
  transform: rotate(180deg);
}

/* 独立卡池垫抽数胶囊栏 (自适应多卡池独立保底：一体化账本凹槽排版) */
.pity-chips-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr) !important;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px;
  background: rgba(143, 115, 81, 0.06);
  border: 1px solid rgba(143, 115, 81, 0.18);
  border-radius: 10px;
}
@media (max-width: 640px) {
  .pity-chips-row {
    gap: 6px;
    padding: 6px;
  }
}
.pity-chip-item {
  background: rgba(246, 239, 227, 0.7);
  border: 1.5px solid rgba(143, 115, 81, 0.3);
  border-radius: 8px;
  padding: 10px 10px 8px;
  cursor: default;
  transition: all 0.18s ease;
  box-shadow: 0 1px 3px rgba(60, 42, 22, 0.04);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
@media (max-width: 640px) {
  .pity-chip-item {
    padding: 7px 6px;
    border-radius: 6px;
    gap: 3px;
  }
}
.pity-chip-item:hover {
  border-color: var(--border-color, #8f7351);
  box-shadow: 0 2px 6px rgba(60, 42, 22, 0.08);
}
.chip-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.chip-count {
  font-size: 16px;
  font-weight: 900;
  color: var(--text-main, #3e2a14);
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
:deep(.dark-mode) .pity-chips-row,
.dark-mode .pity-chips-row {
  background: rgba(25, 18, 12, 0.5);
  border-color: rgba(125, 96, 64, 0.3);
}
:deep(.dark-mode) .pity-chip-item,
.dark-mode .pity-chip-item {
  background: rgba(43, 31, 21, 0.7);
  border-color: rgba(125, 96, 64, 0.4);
}
:deep(.dark-mode) .chip-label,
.dark-mode .chip-label {
  color: var(--text-muted, #bfa988);
}
:deep(.dark-mode) .chip-count,
.dark-mode .chip-count {
  color: #f7ebd7;
}
.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-emerald { background: #00d084; box-shadow: 0 0 6px rgba(0, 208, 132, 0.5); }
.dot-gold { background: #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.5); }
.dot-teal { background: #14b8a6; box-shadow: 0 0 6px rgba(20, 184, 166, 0.5); }
.dot-brown { background: #78716c; box-shadow: 0 0 6px rgba(120, 113, 108, 0.5); }
.dot-blue { background: #3b82f6; box-shadow: 0 0 6px rgba(59, 130, 246, 0.5); }
.chip-sub {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #8a7052);
  white-space: nowrap;
}
:deep(.dark-mode) .chip-sub,
.dark-mode .chip-sub {
  color: #a38d72;
}

/* 卡池横幅卡片 */
.banner-groups-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.banner-block-card {
  background: rgba(233, 220, 195, 0.75);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 2px 8px rgba(60, 42, 22, 0.08);
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
  gap: 12px;
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
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.banner-pulls-pill.pill-limited {
  background: #6366f1;
}
.banner-pulls-pill.pill-pet-limited {
  background: #d97706;
}
.banner-pulls-pill.pill-pet-standard,
.banner-pulls-pill.pill-pet {
  background: var(--accent, #557574);
}
.banner-pulls-pill.pill-standard {
  background: #15803d;
}
.banner-name {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  letter-spacing: 0.01em;
}
.banner-date-range {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #7c6246);
  margin-left: 8px;
}
:deep(.dark-mode) .banner-block-card,
.dark-mode .banner-block-card {
  background: rgba(43, 31, 21, 0.75);
  border-color: var(--border-color, #7d6040);
}
:deep(.dark-mode) .banner-name,
.dark-mode .banner-name {
  color: var(--text-main, #ebdcc3);
}
:deep(.dark-mode) .banner-date-range,
.dark-mode .banner-date-range {
  color: var(--text-muted, #bfa988);
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
  width: 39px;
  height: 39px;
  border-radius: 50%;
  filter: drop-shadow(0 2px 4px rgba(60, 42, 22, 0.16));
  flex-shrink: 0;
  cursor: default;
  transition: transform 0.15s ease, filter 0.15s ease;
}
.grid-avatar-item:hover {
  transform: translateY(-2px) scale(1.06);
  filter: drop-shadow(0 4px 8px rgba(196, 148, 56, 0.35));
}
.grid-hero-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  transform: scale(1.08);
  border: 2px solid #d8af56;
  background: var(--paper-solid, #d9c6a6);
  display: block;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}
.grid-avatar-item:hover .grid-hero-img {
  border-color: #fbbf24;
}
.grid-pity-item {
  border-radius: 50%;
  border: 1.5px dashed var(--border-color, #8f7351);
  background: rgba(143, 115, 81, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  filter: none;
}
.grid-pity-avatar {
  font-size: 18px;
  font-weight: 900;
  color: var(--text-muted, #6b5134);
  user-select: none;
}
.grid-pulls-chip {
  position: absolute;
  bottom: 0px;
  left: 0px;
  background: rgba(0, 0, 0, 0.85);
  color: #ffffff;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  padding: 1px 3px;
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
.grid-badge-wai,
.grid-badge-new {
  position: absolute;
  top: 2px;
  left: 2px;
  color: #ffffff;
  font-weight: 800;
  line-height: 1;
  padding: 1px 3.5px;
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.35);
  pointer-events: none;
}
.grid-badge-wai {
  background: #ef4444;
  font-size: 9px;
}
.grid-badge-new {
  background: #d97706;
  font-size: 8.5px;
}
.grid-badge-new-wai {
  background: #ef4444 !important;
}
.grid-empty-hint {
  font-size: 12px;
  color: #6b7280;
  padding: 8px 0;
}
.banner-up-heroes-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.up-row-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
  letter-spacing: 0.02em;
}
:deep(.dark-mode) .up-row-label,
.dark-mode .up-row-label {
  color: var(--text-main, #ebdcc3);
}
.up-hero-mini-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  filter: drop-shadow(0 1px 3px rgba(60, 42, 22, 0.18));
  flex-shrink: 0;
}
.up-hero-mini-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  transform: scale(1.08);
  border: 1.5px solid #d8af56;
  background: var(--paper-solid, #d9c6a6);
  display: block;
  box-sizing: border-box;
}

/* 顶端当前已垫抽数头像徽章（严格对标图1：圆形虚线边框 + 半透明底 + 深木色问号） */
.pity-avatar-wrapper {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1.5px dashed var(--border-color, #8f7351);
  background: rgba(143, 115, 81, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.pity-question-mark {
  font-size: 18px;
  font-weight: 900;
  color: var(--text-muted, #7c6246);
  line-height: 1;
  font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  user-select: none;
}
:deep(.dark-mode) .pity-avatar-wrapper,
.dark-mode .pity-avatar-wrapper {
  background: rgba(43, 31, 21, 0.4);
  border-color: var(--border-color, #7d6040);
}
:deep(.dark-mode) .pity-question-mark,
.dark-mode .pity-question-mark {
  color: var(--text-muted, #bfa988);
}

/* 5星出货瀑布流 (严格对标小黑盒图2与图3紧凑黄金比例) */
.gold-waterfall-flow {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.waterfall-card-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.waterfall-card-item.has-purples {
  align-items: flex-start;
}
.wf-avatar-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 38px;
  flex-shrink: 0;
}
.waterfall-avatar-wrapper {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  filter: drop-shadow(0 1px 3px rgba(60, 42, 22, 0.18));
  flex-shrink: 0;
}
.waterfall-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  transform: scale(1.08);
  border: 2px solid #d8af56;
  background: var(--paper-solid, #d9c6a6);
  display: block;
  box-sizing: border-box;
}
.stamp-wai,
.badge-new {
  z-index: 10;
  position: absolute;
  top: -3px;
  left: -2px;
  color: #ffffff;
  font-weight: 900;
  line-height: 1;
  padding: 1.5px 4px;
  border-radius: 3px;
  box-shadow: 0 1.5px 3px rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.35);
  letter-spacing: 0.02em;
  pointer-events: none;
}
.stamp-wai {
  background: #dc2626;
  font-size: 9.5px;
}
.badge-new {
  background: #d97706;
  font-size: 8.5px;
}
.badge-new-wai {
  background: #dc2626 !important;
}
.wf-hero-date {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted, #7c6246);
  line-height: 1.1;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  margin-top: 1px;
}

.wf-track-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.waterfall-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 38px;
}
.waterfall-bar-fill {
  position: relative;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  overflow: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  min-width: 44px;
  box-sizing: border-box;
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
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}
.badge-unlucky {
  font-size: 9.5px;
  font-weight: 900;
  background: #ef4444;
  color: #ffffff;
  padding: 1.5px 5px;
  border-radius: 3px;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(239, 68, 68, 0.4);
}

/* 挂载的 4 星小头像列表 (严格对齐图2，紧贴于进度条下方) */
.wf-purples-subrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding-left: 1px;
}
.wf-purple-mini-chip {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  overflow: hidden;
  border: 1.5px solid #a855f7;
  background: var(--paper-solid, #d9c6a6);
  box-shadow: 0 1px 3px rgba(168, 85, 247, 0.25);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
}
.wf-purple-mini-chip:hover {
  transform: scale(1.15);
  border-color: #c084fc;
}
.purple-mini-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  transform: scale(1.08);
  display: block;
}

/* 暂无五星提示 */
.banner-no-gold-notice {
  text-align: center;
  padding: 14px;
  font-size: 12px;
  color: var(--text-muted, #6b5134);
  background: rgba(143, 115, 81, 0.08);
  border: 1px dashed var(--border-color, #8f7351);
  border-radius: 6px;
}
.history-empty {
  text-align: center;
  padding: 32px;
  color: var(--text-muted, #6b5134);
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
  background: var(--floating-control-background, linear-gradient(180deg, #463424, #2b1f15));
  color: #f7ebd7;
  border: 2px solid var(--border-color, #8f7351);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
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
  color: var(--text-muted, #6b5134);
  line-height: 1.5;
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
  font-weight: 700;
  color: var(--text-main, #3e2a14);
}
.drop-zone-sub {
  font-size: 11px;
  color: var(--text-muted, #6b5134);
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
  background: var(--paper-solid, #d9c6a6);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 6px;
  padding: 10px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--text-main, #3e2a14);
  resize: vertical;
  box-sizing: border-box;
}
.import-textarea:focus {
  border-color: var(--accent, #557574);
  outline: none;
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
  gap: 12px;
}
.tool-download-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: rgba(233, 220, 195, 0.85);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 8px;
  padding: 12px 14px;
}
:deep(.dark-mode) .tool-download-card,
.dark-mode .tool-download-card {
  background: rgba(43, 31, 21, 0.85);
  border-color: var(--border-color, #7d6040);
}
.tool-download-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}
.tool-download-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
}
.tool-download-meta {
  font-size: 11.5px;
  color: var(--text-muted, #6b5134);
  line-height: 1.45;
}
:deep(.dark-mode) .tool-download-name,
.dark-mode .tool-download-name {
  color: var(--text-main, #ebdcc3);
}
:deep(.dark-mode) .tool-download-meta,
.dark-mode .tool-download-meta {
  color: var(--text-muted, #bfa988);
}
.tool-mobile-tip {
  font-size: 12px;
  font-weight: 700;
  color: #92400e;
  background: rgba(217, 119, 6, 0.12);
  border: 1px solid rgba(217, 119, 6, 0.35);
  border-radius: 6px;
  padding: 8px 12px;
}
:deep(.dark-mode) .tool-mobile-tip,
.dark-mode .tool-mobile-tip {
  color: #fcd34d;
  background: rgba(217, 119, 6, 0.16);
  border-color: rgba(251, 191, 36, 0.35);
}
.tool-steps-flow {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.flow-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: rgba(233, 220, 195, 0.68);
  padding: 11px 14px;
  border-radius: 8px;
  border: 1.5px solid var(--border-color, #8f7351);
}
:deep(.dark-mode) .flow-step,
.dark-mode .flow-step {
  background: rgba(35, 25, 17, 0.78);
  border-color: var(--border-color, #7d6040);
}
.step-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #059669;
  color: #ffffff;
  font-size: 11.5px;
  font-weight: 800;
  flex-shrink: 0;
  margin-top: 1px;
}
.step-desc {
  font-size: 12.5px;
  color: var(--text-main, #3e2a14);
  line-height: 1.55;
}
:deep(.dark-mode) .step-desc,
.dark-mode .step-desc {
  color: var(--text-main, #ebdcc3);
}
.step-sub-note {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--text-muted, #6b5134);
  line-height: 1.45;
}
:deep(.dark-mode) .step-sub-note,
.dark-mode .step-sub-note {
  color: var(--text-muted, #bfa988);
}
.code-inline {
  background: rgba(143, 115, 81, 0.16);
  color: #854d0e;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-variant-numeric: tabular-nums;
}
:deep(.dark-mode) .code-inline,
.dark-mode .code-inline {
  background: rgba(196, 148, 56, 0.18);
  color: #f5d08a;
}
.tool-warning-box {
  font-size: 12px;
  line-height: 1.55;
  color: #991b1b;
  background: rgba(185, 28, 28, 0.08);
  border: 1px solid rgba(185, 28, 28, 0.28);
  border-radius: 8px;
  padding: 9px 12px;
}
:deep(.dark-mode) .tool-warning-box,
.dark-mode .tool-warning-box {
  color: #fca5a5;
  background: rgba(185, 28, 28, 0.16);
  border-color: rgba(248, 113, 113, 0.32);
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
  color: var(--text-main, #3e2a14);
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
  font-weight: 600;
  padding: 8px 12px;
  outline: none;
  transition: border-color 0.15s;
}
.edit-text-input:focus {
  border-color: var(--accent, #557574);
}
.btn-quick-fill {
  background: rgba(85, 117, 116, 0.15);
  border: 1.5px solid var(--accent, #557574);
  color: var(--accent-ink, #2f4a49);
  font-size: 11px;
  font-weight: 700;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.btn-quick-fill:hover {
  background: var(--accent, #557574);
  color: #ffffff;
}

/* 修改玩家档案弹窗：当前头像单行选择器 */
.acct-avatar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  background: var(--paper-soft, #e9dcc3);
  border: 1.5px solid var(--border-color, #8f7351);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.18s ease;
  box-sizing: border-box;
  text-align: left;
  outline: none;
  font: inherit;
}
.acct-avatar-row:hover {
  background: var(--paper-solid, #dfceb3);
  border-color: var(--accent, #557574);
  box-shadow: 0 2px 8px rgba(60, 42, 22, 0.08);
}
.acct-avatar-thumb-box {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  filter: drop-shadow(0 2px 4px rgba(60, 42, 22, 0.18));
  flex-shrink: 0;
  box-sizing: border-box;
}
.acct-avatar-thumb {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  transform: scale(1.08);
  border: 2px solid var(--border-color, #8f7351);
  background: var(--paper-solid, #d9c6a6);
  display: block;
  box-sizing: border-box;
}
.acct-avatar-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.acct-avatar-row-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-main, #3e2a14);
}
.acct-avatar-row-sub {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #7c6246);
}
.acct-row-action {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-ink, #2f4a49);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  transition: color 0.15s ease;
}
.acct-avatar-row:hover .acct-row-action {
  color: var(--accent, #557574);
}

:deep(.dark-mode) .acct-avatar-row,
.dark-mode .acct-avatar-row {
  background: rgba(35, 25, 17, 0.8);
  border-color: var(--border-color, #7d6040);
}
:deep(.dark-mode) .acct-avatar-row:hover,
.dark-mode .acct-avatar-row:hover {
  background: rgba(45, 33, 22, 0.95);
  border-color: #c49438;
}
:deep(.dark-mode) .acct-avatar-thumb-box,
.dark-mode .acct-avatar-thumb-box {
  background: #1a120c;
  border-color: #7d6040;
}
:deep(.dark-mode) .acct-avatar-row-title,
.dark-mode .acct-avatar-row-title {
  color: var(--text-main, #ebdcc3);
}
:deep(.dark-mode) .acct-avatar-row-sub,
.dark-mode .acct-avatar-row-sub {
  color: var(--text-muted, #bfa988);
}
:deep(.dark-mode) .acct-row-action,
.dark-mode .acct-row-action {
  color: #7faea9;
}



</style>
