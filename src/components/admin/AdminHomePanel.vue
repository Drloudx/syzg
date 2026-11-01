<template>
  <section class="admin-workshop">
    <div class="workshop-header">
      <h1 class="workshop-title">
        <span class="workshop-title-star">✦</span>
        <span>首页管理</span>
      </h1>
      <p class="workshop-subtitle">
        ✦ 维护首页海报、公告、图鉴入口、核心角色与底栏（仅超管）
      </p>
    </div>

    <p v-if="loading" class="admin-hint">正在加载…</p>
    <p v-else-if="loadError" class="admin-error">⚠ {{ loadError }}</p>

    <template v-else>
      <!-- 主一级分类 Tab (统一采用系统标准的 admin-chip 药丸样式) -->
      <div class="admin-toolbar admin-toolbar--tabs">
        <div class="admin-filters">
          <button
            v-for="tab in TABS"
            :key="tab.key"
            type="button"
            class="admin-chip"
            :class="{ 'is-on': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <span>{{ tab.label }}</span>
            <span v-if="tab.count != null" class="admin-chip-count">{{ tab.count }}</span>
          </button>
        </div>
      </div>

      <p class="admin-hint home-tab-hint">{{ activeTabHint }}</p>

      <!-- ============ 海报 ============ -->
      <template v-if="activeTab === 'banners'">
        <div v-for="(b, i) in banners" :key="b._key" class="home-card">
          <div class="home-card-head">
            <span class="home-card-index">{{ i + 1 }}</span>
            <input v-model="b.title" class="admin-input home-input-flex home-title-input" type="text" placeholder="海报标题" />
            <div class="home-card-ops">
              <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" :disabled="i === 0" @click="moveItem(banners, i, -1)" title="上移">↑ 上移</button>
              <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" :disabled="i === banners.length - 1" @click="moveItem(banners, i, 1)" title="下移">↓ 下移</button>
              <button type="button" class="admin-btn admin-btn--danger admin-btn--sm" @click="removeBanner(i)">删除</button>
            </div>
          </div>

          <div class="home-field-grid">
            <label class="home-field home-field-wide">
              <span class="home-field-label">描述文案</span>
              <textarea v-model="b.description" class="admin-input" rows="2" placeholder="海报副描述" />
            </label>
            <label class="home-field">
              <span class="home-field-label">图片地址（站内路径或 https 外链）</span>
              <input v-model="b.image" class="admin-input" type="text" placeholder="/images/banners/xxx.webp" />
            </label>
            <label class="home-field">
              <span class="home-field-label">角标文案</span>
              <input v-model="b.tagText" class="admin-input" type="text" placeholder="如：官方版本焦点" />
            </label>
            <label class="home-field">
              <span class="home-field-label">角标配色</span>
              <div class="color-select-wrapper">
                <select v-model="b.tagClass" class="admin-input admin-select color-select-input">
                  <option v-for="c in TAG_CLASSES" :key="c.value" :value="c.value">{{ c.label }}</option>
                </select>
                <div
                  class="color-preview-swatch"
                  :class="`is-tag-${b.tagClass}`"
                  :title="`当前配色：${b.tagClass}`"
                ></div>
              </div>
            </label>
            <label class="home-field">
              <span class="home-field-label">副角标</span>
              <input v-model="b.subTag" class="admin-input" type="text" placeholder="如：v1.2.0" />
            </label>
            <label class="home-field">
              <span class="home-field-label">按钮文案</span>
              <input v-model="b.btnText" class="admin-input" type="text" placeholder="如：查看详情" />
            </label>
            <label class="home-field">
              <span class="home-field-label">按钮行动</span>
              <select v-model="b.actionType" class="admin-input admin-select" @change="onBannerActionChange(b)">
                <option value="route">站内跳转</option>
                <option value="notice">打开公告</option>
                <option value="external">外部链接</option>
              </select>
            </label>
            <label class="home-field home-field-wide">
              <span class="home-field-label">{{ actionValueLabel(b.actionType) }}</span>
              <!-- 站内跳转：自定义古木滚动条 + 搜索 + 导航页动态分组 -->
              <div v-if="b.actionType === 'route'" class="route-combobox" :class="{ 'is-open': openRouteDropdownKey === `banner-${i}` }" @click.stop>
                <button
                  type="button"
                  class="route-combobox-trigger"
                  @click="toggleRouteDropdown(`banner-${i}`)"
                >
                  <span class="route-combobox-selected">{{ getRouteLabel(b.actionValue) }}</span>
                  <span class="route-combobox-arrow">▾</span>
                </button>

                <div v-if="openRouteDropdownKey === `banner-${i}`" class="route-combobox-dropdown" @click.stop>
                  <div class="route-search-bar">
                    <span class="route-search-icon">🔍</span>
                    <input
                      :ref="(el) => setRouteSearchInputRef(el, `banner-${i}`)"
                      v-model="routeSearchQueries[`banner-${i}`]"
                      type="text"
                      class="admin-input route-search-input"
                      placeholder="搜索页面名称或路径（如：魔物 / equip）..."
                      @click.stop
                      @keydown.esc="openRouteDropdownKey = null"
                    />
                    <button
                      v-if="routeSearchQueries[`banner-${i}`]"
                      type="button"
                      class="route-search-clear"
                      @click.stop="routeSearchQueries[`banner-${i}`] = ''"
                    >×</button>
                  </div>

                  <div class="route-options-scroll">
                    <template v-for="grp in getFilteredRouteGroups(routeSearchQueries[`banner-${i}`])" :key="grp.key">
                      <div class="route-group-header">{{ grp.label }}</div>
                      <div
                        v-for="r in grp.items"
                        :key="r.path"
                        class="route-option-item"
                        :class="{ 'is-selected': b.actionValue === r.path }"
                        @click="selectRoute(b, 'actionValue', r.path)"
                      >
                        <div class="route-option-info">
                          <span class="route-option-name">{{ r.name }}</span>
                          <span class="route-option-path">{{ r.path }}</span>
                        </div>
                        <span v-if="b.actionValue === r.path" class="route-option-check">✓</span>
                      </div>
                    </template>
                    <div v-if="getFilteredRouteGroups(routeSearchQueries[`banner-${i}`]).length === 0" class="route-option-empty">
                      未找到匹配的页面
                    </div>
                  </div>
                </div>
              </div>
              <!-- 公告：按频道分组 -->
              <select v-else-if="b.actionType === 'notice'" v-model="b.actionValue" class="admin-input admin-select">
                <option value="">（请选择目标公告）</option>
                <optgroup label="── 本站公告 ──">
                  <option v-for="n in siteNotices" :key="n.id" :value="n.id">#{{ n.id }} {{ n.title }}</option>
                </optgroup>
                <optgroup label="── 官方公告 ──">
                  <option v-for="n in officialNotices" :key="n.id" :value="n.id">#{{ n.id }} {{ n.title }}</option>
                </optgroup>
              </select>
              <!-- 外链 -->
              <input v-else v-model="b.actionValue" class="admin-input" type="text" placeholder="https://..." />
            </label>
            <label class="home-field">
              <span class="home-field-label">底色</span>
              <input v-model="b.bgColor" class="admin-input" type="text" placeholder="#264440" />
            </label>
            <label class="home-field">
              <span class="home-field-label">融合渐变起色</span>
              <input v-model="b.blendStart" class="admin-input" type="text" placeholder="rgba(38,68,64,0.95)" />
            </label>
          </div>

          <label class="home-field home-field-inline">
            <input v-model="b.isActive" type="checkbox" :true-value="1" :false-value="0" />
            <span>启用此海报（停用后首页轮播自动忽略）</span>
          </label>
        </div>

        <div class="home-actions">
          <button type="button" class="admin-btn admin-btn--ghost" @click="addBanner">+ 新增海报</button>
          <button type="button" class="admin-btn admin-btn--gold" :disabled="saving" @click="submitBanners">
            {{ saving ? '保存中…' : '保存海报配置' }}
          </button>
          <span v-if="savedMessage" class="admin-saved">✓ {{ savedMessage }}</span>
          <span v-if="errorMessage" class="admin-error">⚠ {{ errorMessage }}</span>
        </div>
      </template>

      <!-- ============ 公告 ============ -->
      <template v-else-if="activeTab === 'notices'">
        <!-- 二级频道筛选 (紧凑胶囊) -->
        <div class="admin-toolbar admin-toolbar--sub">
          <div class="admin-filters">
            <button
              v-for="ch in CHANNELS"
              :key="ch.value"
              type="button"
              class="admin-chip admin-chip--sm"
              :class="{ 'is-on': noticeChannel === ch.value }"
              @click="noticeChannel = ch.value"
            >
              <span>{{ ch.label }}</span>
              <span class="admin-chip-count">{{ noticesByChannel(ch.value).length }}</span>
            </button>
          </div>
        </div>

        <div v-for="n in noticesByChannel(noticeChannel)" :key="n.id" class="home-card">
          <div class="home-card-head">
            <span class="home-card-index">#{{ n.id }}</span>
            <input v-model="n.title" class="admin-input home-input-flex home-title-input" type="text" placeholder="公告标题" />
            <div class="home-card-ops">
              <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="saveNotice(n)">保存单条</button>
              <button
                type="button"
                class="admin-btn admin-btn--sm"
                :class="n.isActive ? 'admin-btn--danger' : 'admin-btn--ghost'"
                @click="toggleNotice(n)"
              >{{ n.isActive ? '停用' : '启用' }}</button>
            </div>
          </div>

          <div class="home-field-grid">
            <label class="home-field">
              <span class="home-field-label">发布日期（YYYY-MM-DD）</span>
              <input v-model="n.date" class="admin-input" type="text" placeholder="2026-11-01" />
            </label>
            <label class="home-field">
              <span class="home-field-label">展示层级</span>
              <select v-model="n.tier" class="admin-input admin-select">
                <option value="normal">滚动项（按日期倒序展示）</option>
                <option value="pin">固定项（锁定固定槽位）</option>
              </select>
            </label>
            <label v-if="n.tier === 'pin'" class="home-field">
              <span class="home-field-label">固定槽位 (1~10)</span>
              <input v-model.number="n.slot" class="admin-input" type="number" min="1" max="10" />
            </label>
            <label class="home-field">
              <span class="home-field-label">标签文案</span>
              <input v-model="n.tagText" class="admin-input" type="text" placeholder="置顶 / 功能 / 版本" />
            </label>
            <label class="home-field">
              <span class="home-field-label">标签配色</span>
              <div class="color-select-wrapper">
                <select v-model="n.tagClass" class="admin-input admin-select color-select-input">
                  <option v-for="c in NOTICE_TAG_CLASSES" :key="c.value" :value="c.value">{{ c.label }}</option>
                </select>
                <div
                  class="color-preview-swatch"
                  :class="`is-notice-${n.tagClass}`"
                  :title="`当前标签配色：${n.tagClass}`"
                ></div>
              </div>
            </label>
            <label v-if="n.channel === 'official'" class="home-field">
              <span class="home-field-label">版本号（有值时作为右侧速览卡展示）</span>
              <input v-model="n.version" class="admin-input" type="text" placeholder="v1.2.0「深境微光」" />
            </label>
            <label v-if="n.channel === 'official'" class="home-field home-field-wide">
              <span class="home-field-label">特性速览列表（每行一条）</span>
              <textarea
                class="admin-input"
                rows="4"
                :value="(n.features || []).join('\n')"
                @input="n.features = $event.target.value.split('\n').map((s) => s.trim()).filter(Boolean)"
              />
            </label>
            <label class="home-field home-field-wide">
              <span class="home-field-label">正文详情（换行自动分段）</span>
              <textarea v-model="n.content" class="admin-input" rows="5" />
            </label>
          </div>
        </div>

        <div class="home-actions">
          <button type="button" class="admin-btn admin-btn--ghost" @click="addNotice">+ 新增{{ noticeChannel === 'site' ? '本站' : '官方' }}公告</button>
          <span v-if="savedMessage" class="admin-saved">✓ {{ savedMessage }}</span>
          <span v-if="errorMessage" class="admin-error">⚠ {{ errorMessage }}</span>
        </div>
      </template>

      <!-- ============ 图鉴 / 工具 ============ -->
      <template v-else-if="activeTab === 'links'">
        <!-- 二级板块筛选 (紧凑胶囊) -->
        <div class="admin-toolbar admin-toolbar--sub">
          <div class="admin-filters">
            <button
              v-for="sec in LINK_SECTIONS"
              :key="sec.value"
              type="button"
              class="admin-chip admin-chip--sm"
              :class="{ 'is-on': linkSection === sec.value }"
              @click="linkSection = sec.value"
            >
              <span>{{ sec.label }}</span>
            </button>
          </div>
        </div>

        <div v-for="(l, i) in currentLinks" :key="`${linkSection}-${i}`" class="home-card">
          <div class="home-card-head">
            <span class="home-card-index">{{ i + 1 }}</span>
            <input v-model="l.title" class="admin-input home-input-flex home-title-input" type="text" placeholder="入口标题" />
            <div class="home-card-ops">
              <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" :disabled="i === 0" @click="moveItem(currentLinks, i, -1)" title="上移">↑ 上移</button>
              <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" :disabled="i === currentLinks.length - 1" @click="moveItem(currentLinks, i, 1)" title="下移">↓ 下移</button>
              <button type="button" class="admin-btn admin-btn--danger admin-btn--sm" :disabled="currentLinks.length <= 1" @click="removeLink(i)">删除</button>
            </div>
          </div>

          <div class="home-field-grid">
            <label class="home-field home-field-wide">
              <span class="home-field-label">入口副描述</span>
              <input v-model="l.description" class="admin-input" type="text" />
            </label>
            <label class="home-field">
              <span class="home-field-label">目标路由</span>
              <div class="route-combobox" :class="{ 'is-open': openRouteDropdownKey === `link-${linkSection}-${i}` }" @click.stop>
                <button
                  type="button"
                  class="route-combobox-trigger"
                  @click="toggleRouteDropdown(`link-${linkSection}-${i}`)"
                >
                  <span class="route-combobox-selected">{{ getRouteLabel(l.route) }}</span>
                  <span class="route-combobox-arrow">▾</span>
                </button>

                <div v-if="openRouteDropdownKey === `link-${linkSection}-${i}`" class="route-combobox-dropdown" @click.stop>
                  <div class="route-search-bar">
                    <span class="route-search-icon">🔍</span>
                    <input
                      :ref="(el) => setRouteSearchInputRef(el, `link-${linkSection}-${i}`)"
                      v-model="routeSearchQueries[`link-${linkSection}-${i}`]"
                      type="text"
                      class="admin-input route-search-input"
                      placeholder="搜索页面名称或路径（如：魔物 / equip）..."
                      @click.stop
                      @keydown.esc="openRouteDropdownKey = null"
                    />
                    <button
                      v-if="routeSearchQueries[`link-${linkSection}-${i}`]"
                      type="button"
                      class="route-search-clear"
                      @click.stop="routeSearchQueries[`link-${linkSection}-${i}`] = ''"
                    >×</button>
                  </div>

                  <div class="route-options-scroll">
                    <template v-for="grp in getFilteredRouteGroups(routeSearchQueries[`link-${linkSection}-${i}`])" :key="grp.key">
                      <div class="route-group-header">{{ grp.label }}</div>
                      <div
                        v-for="r in grp.items"
                        :key="r.path"
                        class="route-option-item"
                        :class="{ 'is-selected': l.route === r.path }"
                        @click="selectRoute(l, 'route', r.path)"
                      >
                        <div class="route-option-info">
                          <span class="route-option-name">{{ r.name }}</span>
                          <span class="route-option-path">{{ r.path }}</span>
                        </div>
                        <span v-if="l.route === r.path" class="route-option-check">✓</span>
                      </div>
                    </template>
                    <div v-if="getFilteredRouteGroups(routeSearchQueries[`link-${linkSection}-${i}`]).length === 0" class="route-option-empty">
                      未找到匹配的页面
                    </div>
                  </div>
                </div>
              </div>
            </label>
            <label class="home-field">
              <span class="home-field-label">二级参数（可留空，如 tab=hidden）</span>
              <input v-model="l.queryString" class="admin-input" type="text" placeholder="tab=hidden" />
            </label>
            <label class="home-field">
              <span class="home-field-label">图标来源</span>
              <select v-model="l.iconSource" class="admin-input admin-select">
                <option value="nav">跟随主导航图标（推荐）</option>
                <option value="custom">自定义图片地址</option>
              </select>
            </label>
            <label v-if="l.iconSource === 'custom'" class="home-field home-field-wide">
              <span class="home-field-label">自定义图标地址</span>
              <input v-model="l.iconUrl" class="admin-input" type="text" placeholder="/ui/xxx.webp" />
            </label>
            <label v-if="linkSection === 'tool'" class="home-field">
              <span class="home-field-label">角标文案（可留空）</span>
              <input v-model="l.badgeText" class="admin-input" type="text" placeholder="HOT / NEW" />
            </label>
            <label v-if="linkSection === 'tool'" class="home-field">
              <span class="home-field-label">角标配色</span>
              <div class="color-select-wrapper">
                <select v-model="l.badgeColor" class="admin-input admin-select color-select-input">
                  <option value="">（无角标）</option>
                  <option v-for="c in BADGE_COLORS" :key="c.value" :value="c.value">{{ c.label }}</option>
                </select>
                <div
                  v-if="l.badgeColor"
                  class="color-preview-swatch"
                  :class="`is-badge-${l.badgeColor}`"
                  :title="`当前角标色：${l.badgeColor}`"
                ></div>
              </div>
            </label>
          </div>
        </div>

        <div class="home-actions">
          <button
            type="button"
            class="admin-btn admin-btn--ghost"
            :disabled="currentLinks.length >= 4"
            @click="addLink"
          >+ 新增一格（上限 4 格）</button>
          <button type="button" class="admin-btn admin-btn--gold" :disabled="saving" @click="submitLinks">
            {{ saving ? '保存中…' : '保存图鉴与工具' }}
          </button>
          <span v-if="savedMessage" class="admin-saved">✓ {{ savedMessage }}</span>
          <span v-if="errorMessage" class="admin-error">⚠ {{ errorMessage }}</span>
        </div>
      </template>

      <!-- ============ 核心角色 ============ -->
      <template v-else-if="activeTab === 'heroes'">
        <div v-for="(h, i) in heroes" :key="`hero-${i}`" class="home-card">
          <div class="home-card-head">
            <span class="home-card-index">{{ i + 1 }}</span>
            <!-- 自定义带搜索与项目专属古木滚动条的角色选择器 -->
            <div class="hero-combobox" :class="{ 'is-open': openHeroIndex === i }" @click.stop>
              <button
                type="button"
                class="hero-combobox-trigger"
                @click="toggleHeroDropdown(i)"
              >
                <span class="hero-combobox-selected">
                  {{ getHeroLabel(h.heroId) }}
                </span>
                <span class="hero-combobox-arrow">▾</span>
              </button>

              <!-- 展开的下拉浮层 -->
              <div v-if="openHeroIndex === i" class="hero-combobox-dropdown" @click.stop>
                <div class="hero-search-bar">
                  <span class="hero-search-icon">🔍</span>
                  <input
                    :ref="(el) => setHeroSearchInputRef(el, i)"
                    v-model="heroSearchQueries[i]"
                    type="text"
                    class="admin-input hero-search-input"
                    placeholder="输入角色名 / 职业 / 属性 / 星级搜索..."
                    @click.stop
                    @keydown.esc="openHeroIndex = null"
                  />
                  <button
                    v-if="heroSearchQueries[i]"
                    type="button"
                    class="hero-search-clear"
                    @click.stop="heroSearchQueries[i] = ''"
                  >×</button>
                </div>

                <div class="hero-options-scroll">
                  <div
                    v-for="opt in getFilteredHeroes(heroSearchQueries[i])"
                    :key="opt.id"
                    class="hero-option-item"
                    :class="{ 'is-selected': String(h.heroId) === String(opt.id) }"
                    @click="selectHero(h, opt.id, i)"
                  >
                    <div class="hero-option-info">
                      <span class="hero-option-name">{{ opt.name }}</span>
                      <span class="hero-option-rare">{{ opt.rare }}★</span>
                      <span class="hero-option-tag">{{ opt.jobName }} · {{ opt.elementName }}</span>
                    </div>
                    <span v-if="String(h.heroId) === String(opt.id)" class="hero-option-check">✓</span>
                  </div>
                  <div v-if="getFilteredHeroes(heroSearchQueries[i]).length === 0" class="hero-option-empty">
                    未找到匹配的角色
                  </div>
                </div>
              </div>
            </div>
            <div class="home-card-ops">
              <button
                type="button"
                class="admin-btn admin-btn--danger admin-btn--sm"
                :disabled="heroes.length <= 1"
                @click="removeHero(i)"
              >删除</button>
            </div>
          </div>
          <div class="home-field-grid">
            <label class="home-field home-field-wide">
              <span class="home-field-label">定位标签</span>
              <input v-model="h.tip" class="admin-input" type="text" placeholder="输入核心定位，如：高频点杀 / 灼烧附着" />
            </label>
          </div>
        </div>

        <div class="home-actions">
          <button
            type="button"
            class="admin-btn admin-btn--ghost"
            :disabled="heroes.length >= 4"
            @click="addHero"
          >+ 新增一位（上限 4 位）</button>
          <button type="button" class="admin-btn admin-btn--gold" :disabled="saving" @click="submitHeroes">
            {{ saving ? '保存中…' : '保存核心角色' }}
          </button>
          <span v-if="savedMessage" class="admin-saved">✓ {{ savedMessage }}</span>
          <span v-if="errorMessage" class="admin-error">⚠ {{ errorMessage }}</span>
        </div>
      </template>

      <!-- ============ 底栏 ============ -->
      <template v-else-if="activeTab === 'blocks'">
        <div v-for="blk in blocks" :key="blk.section" class="home-card">
          <div class="home-card-head">
            <span class="home-card-index">{{ blk.section === 'guide' ? '交流' : '攻略' }}</span>
            <input v-model="blk.title" class="admin-input home-input-flex home-title-input" type="text" placeholder="栏目标题" />
          </div>
          <div class="home-field-grid">
            <label class="home-field home-field-wide">
              <span class="home-field-label">副标题（可留空，填「占位」则前端自动隐藏）</span>
              <input v-model="blk.subtitle" class="admin-input" type="text" />
            </label>
          </div>

          <div class="home-block-rows">
            <div class="home-rows-header">
              <span class="home-field-label">栏目展示条目列表</span>
            </div>
            <div v-for="(row, ri) in blk.rows" :key="ri" class="home-row-card">
              <div class="home-row-main">
                <input v-model="row.tag" class="admin-input home-input-tag" type="text" placeholder="角标" />
                <input v-model="row.label" class="admin-input home-input-flex" type="text" placeholder="条目名称" />
                <input v-model="row.text" class="admin-input home-input-wide" type="text" placeholder="描述与说明" />
                <button type="button" class="admin-btn admin-btn--danger admin-btn--sm" @click="removeBlockRow(blk, ri)">删除</button>
              </div>

              <div class="home-row-action">
                <span class="home-row-action-label">跳转行动</span>
                <select
                  v-model="row.actionType"
                  class="admin-input admin-select home-row-action-select"
                  @change="onRowActionChange(row)"
                >
                  <option v-for="act in ROW_ACTION_TYPES" :key="act.value" :value="act.value">{{ act.label }}</option>
                </select>

                <span v-if="row.actionType === 'none'" class="home-row-action-hint">（前台仅展示纯文本，不触发跳转）</span>

                <!-- 站内跳转：Route Combobox -->
                <div
                  v-if="row.actionType === 'route'"
                  class="route-combobox home-row-action-target"
                  :class="{ 'is-open': openRouteDropdownKey === `block-${blk.section}-${ri}` }"
                  @click.stop
                >
                  <button
                    type="button"
                    class="route-combobox-trigger"
                    @click="toggleRouteDropdown(`block-${blk.section}-${ri}`)"
                  >
                    <span class="route-combobox-selected">{{ getRouteLabel(row.actionValue) }}</span>
                    <span class="route-combobox-arrow">▾</span>
                  </button>

                  <div v-if="openRouteDropdownKey === `block-${blk.section}-${ri}`" class="route-combobox-dropdown" @click.stop>
                    <div class="route-search-bar">
                      <span class="route-search-icon">🔍</span>
                      <input
                        :ref="(el) => setRouteSearchInputRef(el, `block-${blk.section}-${ri}`)"
                        v-model="routeSearchQueries[`block-${blk.section}-${ri}`]"
                        type="text"
                        class="admin-input route-search-input"
                        placeholder="搜索页面名称或路径（如：魔物 / equip）..."
                        @click.stop
                        @keydown.esc="openRouteDropdownKey = null"
                      />
                      <button
                        v-if="routeSearchQueries[`block-${blk.section}-${ri}`]"
                        type="button"
                        class="route-search-clear"
                        @click.stop="routeSearchQueries[`block-${blk.section}-${ri}`] = ''"
                      >×</button>
                    </div>

                    <div class="route-options-scroll">
                      <template v-for="grp in getFilteredRouteGroups(routeSearchQueries[`block-${blk.section}-${ri}`])" :key="grp.key">
                        <div class="route-group-header">{{ grp.label }}</div>
                        <div
                          v-for="r in grp.items"
                          :key="r.path"
                          class="route-option-item"
                          :class="{ 'is-selected': row.actionValue === r.path }"
                          @click="selectRoute(row, 'actionValue', r.path)"
                        >
                          <div class="route-option-info">
                            <span class="route-option-name">{{ r.name }}</span>
                            <span class="route-option-path">{{ r.path }}</span>
                          </div>
                          <span v-if="row.actionValue === r.path" class="route-option-check">✓</span>
                        </div>
                      </template>
                      <div v-if="getFilteredRouteGroups(routeSearchQueries[`block-${blk.section}-${ri}`]).length === 0" class="route-option-empty">
                        未找到匹配的页面
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 公告下拉 -->
                <select
                  v-else-if="row.actionType === 'notice'"
                  v-model="row.actionValue"
                  class="admin-input admin-select home-row-action-target"
                >
                  <option value="">（请选择目标公告）</option>
                  <optgroup label="── 本站公告 ──">
                    <option v-for="n in siteNotices" :key="n.id" :value="n.id">#{{ n.id }} {{ n.title }}</option>
                  </optgroup>
                  <optgroup label="── 官方公告 ──">
                    <option v-for="n in officialNotices" :key="n.id" :value="n.id">#{{ n.id }} {{ n.title }}</option>
                  </optgroup>
                </select>

                <!-- 外链 -->
                <input
                  v-else-if="row.actionType === 'external'"
                  v-model="row.actionValue"
                  class="admin-input home-row-action-target"
                  type="text"
                  placeholder="https://..."
                />
              </div>
            </div>

            <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="blk.rows.push({ tag: '', label: '', text: '', actionType: 'none', actionValue: '' })">
              + 增加一行条目
            </button>
          </div>
        </div>

        <div class="home-actions">
          <button type="button" class="admin-btn admin-btn--gold" :disabled="saving" @click="submitBlocks">
            {{ saving ? '保存中…' : '保存底栏配置' }}
          </button>
          <span v-if="savedMessage" class="admin-saved">✓ {{ savedMessage }}</span>
          <span v-if="errorMessage" class="admin-error">⚠ {{ errorMessage }}</span>
        </div>
      </template>
    </template>

    <!-- 通用删除与操作确认弹窗 -->
    <UiModal
      :visible="confirmModal.visible"
      teleport-to="body"
      :title="confirmModal.title"
      max-width="480px"
      @update:visible="(v) => { if (!v) onConfirmCancel() }"
    >
      <p v-if="confirmModal.lead" class="admin-modal-lead">{{ confirmModal.lead }}</p>
      <div v-if="confirmModal.content" class="admin-modal-quote" style="white-space: pre-line; line-height: 1.6;">
        {{ confirmModal.content }}
      </div>

      <template #footer>
        <button type="button" class="admin-btn admin-btn--ghost" @click="onConfirmCancel">
          {{ confirmModal.cancelText || '取消' }}
        </button>
        <button
          type="button"
          class="admin-btn"
          :class="{ 'admin-btn--danger': confirmModal.isDanger }"
          @click="onConfirmAccept"
        >
          {{ confirmModal.confirmText || '确定' }}
        </button>
      </template>
    </UiModal>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import UiModal from '../ui/UiModal.vue'
import {
  AdminApiError
} from '../../utils/adminApi.js'
import {
  fetchHomeAdmin,
  createNotice,
  updateNotice,
  deleteNotice,
  saveBanners,
  saveLinks,
  saveHeroes,
  saveBlocks
} from '../../utils/adminHomeApi.js'
import { getGroupedNavRoutes, navRouteOf } from '../../config/navRoutes.js'

const TABS = [
  { key: 'banners', label: '海报轮播' },
  { key: 'notices', label: '公告' },
  { key: 'links', label: '图鉴与工具' },
  { key: 'heroes', label: '核心角色' },
  { key: 'blocks', label: '底部两栏' }
]

const CHANNELS = [
  { value: 'site', label: '本站公告' },
  { value: 'official', label: '官方公告' }
]

const LINK_SECTIONS = [
  { value: 'core', label: '核心图鉴（4 格）' },
  { value: 'tool', label: '实用工具（4 格）' }
]

/** 动态读取自导航页分类定义（图鉴资料/核心图鉴、实用工具、其他功能），与侧边栏 1:1 保持一致，零硬编码 */
const groupedRoutes = computed(() => getGroupedNavRoutes({ useAdminTitle: true }))

/** 海报角标配色：与 HomeView 的 .poster-tag 样式对应 */
const TAG_CLASSES = [
  { value: 'gold', label: '金色 · 版本焦点' },
  { value: 'red', label: '红色 · 限时活动' },
  { value: 'teal', label: '青色 · 工具功能' }
]

/** 公告标签配色：与 HomeView 的 .notice-tag 样式对应 */
const NOTICE_TAG_CLASSES = [
  { value: 'pinned', label: '置顶（深色）' },
  { value: 'patch', label: '功能更新' },
  { value: 'event', label: '数据 / 活动' },
  { value: 'info', label: '说明 / 社区' },
  { value: 'gold', label: '强调（金）' }
]

/** 工具角标配色：与 HomeView 的 .tool-tag.is-badge-* 对应 */
const BADGE_COLORS = [
  { value: 'red', label: '红' },
  { value: 'green', label: '绿' },
  { value: 'gold', label: '金' },
  { value: 'teal', label: '青' },
  { value: 'gray', label: '灰' }
]

/** 底部两栏条目跳转行动 */
const ROW_ACTION_TYPES = [
  { value: 'none', label: '关闭（无跳转）' },
  { value: 'route', label: '站内跳转' },
  { value: 'notice', label: '打开公告' },
  { value: 'external', label: '外部链接' }
]

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const savedMessage = ref('')
const errorMessage = ref('')

// 通用确认弹窗
const confirmModal = ref({
  visible: false,
  title: '',
  lead: '',
  content: '',
  confirmText: '确定',
  cancelText: '取消',
  isDanger: false,
  resolve: null
})

function askConfirm({ title, lead = '', content = '', confirmText = '确定', cancelText = '取消', isDanger = false }) {
  return new Promise((resolve) => {
    confirmModal.value = {
      visible: true,
      title,
      lead,
      content,
      confirmText,
      cancelText,
      isDanger,
      resolve
    }
  })
}

function onConfirmAccept() {
  const cb = confirmModal.value.resolve
  confirmModal.value.visible = false
  cb?.(true)
}

function onConfirmCancel() {
  const cb = confirmModal.value.resolve
  confirmModal.value.visible = false
  cb?.(false)
}

const activeTab = ref('banners')
const noticeChannel = ref('site')
const linkSection = ref('core')

const banners = ref([])
const notices = ref([])
const links = ref({ core: [], tool: [] })
const heroes = ref([])
const blocks = ref([])
/** heroes.json 的完整角色表，供下拉选择 */
const heroOptions = ref([])

/** 核心角色自定义搜索下拉框状态 */
const openHeroIndex = ref(null)
const heroSearchQueries = ref({})
const heroSearchInputs = ref({})

function setHeroSearchInputRef(el, idx) {
  if (el) heroSearchInputs.value[idx] = el
}

function toggleHeroDropdown(index) {
  if (openHeroIndex.value === index) {
    openHeroIndex.value = null
  } else {
    openHeroIndex.value = index
    openRouteDropdownKey.value = null
    heroSearchQueries.value[index] = ''
    setTimeout(() => {
      heroSearchInputs.value[index]?.focus()
    }, 60)
  }
}

function selectHero(heroItem, heroId) {
  heroItem.heroId = heroId
  openHeroIndex.value = null
}

function getHeroLabel(heroId) {
  const opt = heroOptions.value.find((o) => String(o.id) === String(heroId))
  if (!opt) return heroId || '（请选择角色）'
  return `${opt.name}（${opt.rare}★ ${opt.jobName}·${opt.elementName}）`
}

function getFilteredHeroes(query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return heroOptions.value
  return heroOptions.value.filter((h) => {
    const text = `${h.name} ${h.rare}星 ${h.rare}★ ${h.jobName} ${h.elementName}`.toLowerCase()
    return text.includes(q)
  })
}

/** 路由选择 Combobox 状态与方法（通用古木滚动条 + 搜索） */
const openRouteDropdownKey = ref(null)
const routeSearchQueries = ref({})
const routeSearchInputs = ref({})

function setRouteSearchInputRef(el, key) {
  if (el) routeSearchInputs.value[key] = el
}

function toggleRouteDropdown(key) {
  if (openRouteDropdownKey.value === key) {
    openRouteDropdownKey.value = null
  } else {
    openRouteDropdownKey.value = key
    openHeroIndex.value = null
    routeSearchQueries.value[key] = ''
    setTimeout(() => {
      routeSearchInputs.value[key]?.focus()
    }, 60)
  }
}

function selectRoute(targetObj, fieldName, path) {
  targetObj[fieldName] = path
  openRouteDropdownKey.value = null
}

function getRouteLabel(path) {
  if (!path) return '（请选择跳转目标路由）'
  const route = navRouteOf(path)
  return route ? `${route.name} · ${route.path}` : path
}

function getFilteredRouteGroups(query) {
  const q = (query || '').trim().toLowerCase()
  const allGroups = groupedRoutes.value
  if (!q) return allGroups
  return allGroups
    .map((grp) => ({
      ...grp,
      items: grp.items.filter((r) =>
        r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)
      )
    }))
    .filter((grp) => grp.items.length > 0)
}

function handleGlobalClick() {
  if (openHeroIndex.value != null) {
    openHeroIndex.value = null
  }
  if (openRouteDropdownKey.value != null) {
    openRouteDropdownKey.value = null
  }
}

/** 海报切换行动模式时，清空不兼容的旧值，避免切外链带出 /sims 等 */
function onBannerActionChange(banner) {
  if (banner.actionType === 'external') {
    if (!banner.actionValue || !banner.actionValue.startsWith('http')) {
      banner.actionValue = ''
    }
  } else if (banner.actionType === 'route') {
    if (!banner.actionValue || !banner.actionValue.startsWith('/')) {
      banner.actionValue = ''
    }
  } else if (banner.actionType === 'notice') {
    if (banner.actionValue && (banner.actionValue.startsWith('http') || banner.actionValue.startsWith('/'))) {
      banner.actionValue = ''
    }
  }
}

/** 底部两栏条目切换跳转模式时清空不兼容旧值 */
function onRowActionChange(row) {
  if (row.actionType === 'external') {
    if (!row.actionValue || !row.actionValue.startsWith('http')) {
      row.actionValue = ''
    }
  } else if (row.actionType === 'route') {
    if (!row.actionValue || !row.actionValue.startsWith('/')) {
      row.actionValue = ''
    }
  } else if (row.actionType === 'notice') {
    if (row.actionValue && (row.actionValue.startsWith('http') || row.actionValue.startsWith('/'))) {
      row.actionValue = ''
    }
  } else if (row.actionType === 'none') {
    row.actionValue = ''
  }
}

/** 稳定 key：整组替换时需要 key 区分行，不能让下标当 key（移动后焦点错位） */
let nextKey = 1
const keyed = () => `k${nextKey++}`

const siteNotices = computed(() => notices.value.filter((n) => n.channel === 'site'))
const officialNotices = computed(() => notices.value.filter((n) => n.channel === 'official'))
const currentLinks = computed(() =>
  linkSection.value === 'core' ? links.value.core : links.value.tool
)

const activeTabHint = computed(() => {
  switch (activeTab.value) {
    case 'banners':
      return '海报数量可增减，顺序即首页轮播顺序。仅 1 张时轮播箭头与圆点会自动隐藏。'
    case 'notices':
      return '固定项按槽位插在指定位置（如槽位 1 在最前、槽位 4 在第 4 位），滚动项按日期倒序填补空位。'
    case 'links':
      return '每区固定 4 格。图标「跟随导航」会自动取该路由在侧边栏的图标。二级参数手填，如 tab=hidden。'
    case 'heroes':
      return '固定 4 格。只存角色 ID 与定位标签，名字/星级/立绘由 heroes.json 实时提供。'
    case 'blocks':
      return '两栏固定。副标题填「占位」时首页不显示该副标题。'
    default:
      return ''
  }
})

function actionValueLabel(type) {
  if (type === 'route') return '跳转路由'
  if (type === 'notice') return '目标公告'
  return '外链地址（必须 https://）'
}

function noticesByChannel(ch) {
  return notices.value.filter((n) => n.channel === ch)
}

/** 上下移动数组元素（保持 key 不变，避免输入框失焦） */
function moveItem(arr, i, delta) {
  const j = i + delta
  if (j < 0 || j >= arr.length) return
  const tmp = arr[i]
  arr[i] = arr[j]
  arr[j] = tmp
}

function flash(msg) {
  savedMessage.value = msg
  errorMessage.value = ''
  setTimeout(() => { if (savedMessage.value === msg) savedMessage.value = '' }, 3000)
}

function fail(err) {
  errorMessage.value = err instanceof AdminApiError ? err.message : (err?.message || '操作失败')
  savedMessage.value = ''
}

/* ---------- 载入 ---------- */

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [data, heroRes] = await Promise.all([
      fetchHomeAdmin(),
      fetch('/data/parsed/heroes.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
    ])

    banners.value = (data.banners || []).map((b) => ({
      ...b,
      _key: keyed(),
      actionValue: b.actionValue || ''
    }))

    // 后台要显示已停用项，所以这里不过滤 isActive
    notices.value = (data.notices || []).map((n) => ({ ...n, features: n.features || [] }))

    links.value = {
      core: (data.links || []).filter((l) => l.section === 'core'),
      tool: (data.links || []).filter((l) => l.section === 'tool')
    }

    heroes.value = (data.heroes || []).map((h) => ({ ...h }))

    const bySection = {}
    for (const b of data.blocks || []) bySection[b.section] = b
    blocks.value = ['guide', 'help'].map((sec) => ({
      section: sec,
      title: bySection[sec]?.title || (sec === 'guide' ? '大书院交流' : '新人攻略'),
      subtitle: bySection[sec]?.subtitle || '',
      rows: (bySection[sec]?.rows || []).map((r) => ({
        tag: r.tag || '',
        label: r.label || '',
        text: r.text || '',
        actionType: r.actionType || 'none',
        actionValue: r.actionValue || ''
      }))
    }))

    const list = heroRes?.heroes || heroRes?.list || []
    heroOptions.value = list.map((h) => ({
      id: h.id,
      name: h.name,
      rare: h.rare,
      jobName: h.jobName,
      elementName: h.elementName
    }))
  } catch (err) {
    loadError.value = err instanceof AdminApiError
      ? `${err.message}${err.isUnauthorized ? '（本页仅超管可访问）' : ''}`
      : (err?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

/* ---------- 海报 ---------- */

function addBanner() {
  banners.value.push({
    _key: keyed(),
    id: '',
    title: '',
    description: '',
    tagText: '',
    tagClass: 'gold',
    subTag: '',
    image: '',
    bgColor: '#264440',
    blendStart: 'rgba(38,68,64,0.95)',
    btnText: '',
    actionType: 'route',
    actionValue: '',
    isActive: 1
  })
}

async function removeBanner(i) {
  const b = banners.value[i]
  const title = b?.title ? `「${b.title}」` : `第 ${i + 1} 张海报`
  const ok = await askConfirm({
    title: '删除海报',
    lead: `确认删除海报 ${title} 吗？`,
    content: '删除后需点击下方的「保存海报配置」才会正式写入生效。在此之前刷新页面即可撤销。',
    confirmText: '确认删除',
    isDanger: true
  })
  if (!ok) return
  banners.value.splice(i, 1)
}

async function submitBanners() {
  saving.value = true
  try {
    await saveBanners(banners.value.map((b) => {
      const { _key, ...rest } = b
      return rest
    }))
    flash('海报已保存')
    await load()
  } catch (err) {
    fail(err)
  } finally {
    saving.value = false
  }
}

/* ---------- 公告 ---------- */

function addNotice() {
  notices.value.push({
    id: '',
    channel: noticeChannel.value,
    tier: 'normal',
    slot: null,
    title: '',
    content: '',
    date: new Date().toISOString().slice(0, 10),
    tagText: '公告',
    tagClass: 'info',
    version: null,
    features: [],
    isActive: 1
  })
}

async function saveNotice(n) {
  saving.value = true
  try {
    const payload = {
      id: n.id,
      channel: n.channel,
      tier: n.tier,
      slot: n.slot,
      title: n.title,
      content: n.content,
      date: n.date,
      tagText: n.tagText,
      tagClass: n.tagClass,
      version: n.version,
      features: n.features,
      isActive: n.isActive
    }
    if (n.id) await updateNotice(payload)
    else await createNotice(payload)
    flash('公告已保存')
    await load()
  } catch (err) {
    fail(err)
  } finally {
    saving.value = false
  }
}

async function toggleNotice(n) {
  saving.value = true
  try {
    if (n.isActive) {
      await deleteNotice(n.id)
      flash('公告已停用')
    } else {
      await updateNotice({ ...n, isActive: 1 })
      flash('公告已启用')
    }
    await load()
  } catch (err) {
    fail(err)
  } finally {
    saving.value = false
  }
}

/* ---------- 图鉴 / 工具 ---------- */

function addLink() {
  if (currentLinks.value.length >= 4) return
  currentLinks.value.push({
    section: linkSection.value,
    slot: currentLinks.value.length + 1,
    title: '',
    description: '',
    route: '/items',
    queryString: '',
    iconSource: 'nav',
    iconUrl: '',
    badgeText: '',
    badgeColor: ''
  })
}

async function removeLink(i) {
  const list = currentLinks.value
  const item = list[i]
  const title = item?.title ? `「${item.title}」` : `第 ${i + 1} 格入口`
  const ok = await askConfirm({
    title: '删除入口',
    lead: `确认删除入口 ${title} 吗？`,
    content: '删除后需点击下方的「保存图鉴与工具」才会正式写入生效。在此之前刷新页面即可撤销。',
    confirmText: '确认删除',
    isDanger: true
  })
  if (!ok) return
  list.splice(i, 1)
}

async function submitLinks() {
  saving.value = true
  try {
    await saveLinks(linkSection.value, currentLinks.value)
    flash('已保存')
    await load()
  } catch (err) {
    fail(err)
  } finally {
    saving.value = false
  }
}

/* ---------- 角色 ---------- */

function addHero() {
  if (heroes.value.length >= 4) return
  heroes.value.push({ slot: heroes.value.length + 1, heroId: heroOptions.value[0]?.id || '', tip: '' })
}

async function removeHero(i) {
  const h = heroes.value[i]
  const heroName = getHeroLabel(h?.heroId) || `第 ${i + 1} 个角色`
  const ok = await askConfirm({
    title: '删除核心角色',
    lead: `确认删除核心角色展示位 ${heroName} 吗？`,
    content: '删除后需点击下方的「保存核心角色」才会正式写入生效。在此之前刷新页面即可撤销。',
    confirmText: '确认删除',
    isDanger: true
  })
  if (!ok) return
  heroes.value.splice(i, 1)
}

async function submitHeroes() {
  saving.value = true
  try {
    await saveHeroes(heroes.value)
    flash('角色已保存')
    await load()
  } catch (err) {
    fail(err)
  } finally {
    saving.value = false
  }
}

/* ---------- 底栏 ---------- */

async function removeBlockRow(blk, ri) {
  const row = blk.rows[ri]
  const rowText = row?.label || row?.text || `第 ${ri + 1} 行条目`
  const ok = await askConfirm({
    title: '删除栏目条目',
    lead: `确认删除条目「${rowText}」吗？`,
    content: '删除后需点击下方的「保存底栏配置」才会正式写入生效。在此之前刷新页面即可撤销。',
    confirmText: '确认删除',
    isDanger: true
  })
  if (!ok) return
  blk.rows.splice(ri, 1)
}

async function submitBlocks() {
  saving.value = true
  try {
    await saveBlocks(blocks.value)
    flash('底栏已保存')
    await load()
  } catch (err) {
    fail(err)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  load()
  window.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  window.removeEventListener('click', handleGlobalClick)
})
</script>

<style scoped>
/* ==================== 羊皮纸主工坊外壳与变量 (与全站标准面板 1:1 对齐) ==================== */
.admin-workshop {
  --wood-border: #7a5c3d;
  --gold-border: rgba(143, 115, 81, 0.45);
  --gold-accent: #c5913e;
  --gold-bright: #ffd78c;
  --text-main: #3e2a14;
  --text-muted: #755c3f;
  --paper-soft: #f4ecdc;
  --paper-card: #f9f5eb;

  flex: 1;
  min-width: 0;
  height: 100%;
  max-height: 100%;
  overflow-y: auto;
  border: 2px solid var(--wood-border);
  border-radius: 8px;
  background: var(--paper-soft);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  box-sizing: border-box;
}

:deep(.dark-mode) .admin-workshop,
.dark-mode .admin-workshop {
  --wood-border: #5c4327;
  --gold-border: rgba(143, 115, 81, 0.3);
  --gold-accent: #d4a359;
  --text-main: #e8dbc3;
  --text-muted: #ab9274;
  --paper-soft: #33261a;
  --paper-card: #271d13;
}

/* WebKit 平滑滚动条美化 */
.admin-workshop::-webkit-scrollbar {
  width: 8px;
}
.admin-workshop::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.04);
  border-radius: 4px;
}
.admin-workshop::-webkit-scrollbar-thumb {
  background: rgba(122, 92, 61, 0.35);
  border-radius: 4px;
}
.admin-workshop::-webkit-scrollbar-thumb:hover {
  background: rgba(122, 92, 61, 0.6);
}

/* 页面大标题 */
.workshop-header {
  flex-shrink: 0;
  border-bottom: 1.5px solid var(--gold-border);
  padding-bottom: 14px;
}
.workshop-title {
  font-size: 23px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.workshop-title-star {
  color: var(--gold-accent);
  font-size: 19px;
}
.workshop-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  margin: 4px 0 0;
  letter-spacing: 0.5px;
}

/* ==================== 顶部 Tab 与工具栏 (与后台统一胶囊规范) ==================== */
.admin-toolbar--tabs {
  margin: 0;
}

.admin-toolbar--sub {
  margin: -4px 0 8px;
}

.admin-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.admin-chip-count {
  margin-left: 2px;
  font-size: 11px;
  opacity: 0.8;
  font-family: ui-monospace, monospace;
}

.home-tab-hint {
  margin: -6px 0 2px !important;
  color: var(--text-muted);
  font-size: 12.5px;
}

/* ==================== 卡片容器 (象牙暖金羊皮纸实体) ==================== */
.home-card {
  border: 1.5px solid rgba(143, 115, 81, 0.35);
  border-radius: 6px;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: var(--paper-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
}

.home-card:hover {
  border-color: rgba(197, 145, 62, 0.6);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.07);
}

.home-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(143, 115, 81, 0.25);
}

.home-card-index {
  font-size: 12px;
  font-weight: 700;
  color: var(--gold-accent);
  background: rgba(197, 145, 62, 0.12);
  border: 1px solid rgba(197, 145, 62, 0.35);
  border-radius: 4px;
  padding: 2px 8px;
  min-width: 20px;
  text-align: center;
  font-family: ui-monospace, monospace;
}

.home-title-input {
  font-size: 14.5px !important;
  font-weight: 700 !important;
  color: var(--text-main) !important;
}

.home-input-flex {
  flex: 1;
  min-width: 0;
}

.home-card-ops {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ==================== 字段网格与排版 ==================== */
.home-field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px 14px;
}

.home-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.home-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.home-field-wide {
  grid-column: 1 / -1;
}

.home-field-inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  cursor: pointer;
  user-select: none;
}

.home-field-inline input[type="checkbox"] {
  accent-color: var(--gold-accent);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* ==================== 下拉菜单 (防 background 重置多箭头平铺) ==================== */
.admin-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding-right: 28px !important;
  background-color: var(--paper-soft, #fdfbf7);
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23755c3f' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e") !important;
  background-repeat: no-repeat !important;
  background-position: right 8px center !important;
  background-size: 14px 14px !important;
  cursor: pointer;
}

.admin-select:focus {
  background-color: #ffffff;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23c5913e' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e") !important;
  background-repeat: no-repeat !important;
  background-position: right 8px center !important;
  background-size: 14px 14px !important;
}

/* 下拉选项内部样式注入 */
.admin-select option {
  background-color: var(--paper-card, #f9f5eb);
  color: var(--text-main, #3e2a14);
  padding: 8px 12px;
  font-size: 13px;
}

.admin-select optgroup {
  background-color: #f0e6d2;
  color: var(--gold-accent, #c5913e);
  font-weight: 800;
  font-style: normal;
  padding: 6px 10px;
}

.dark-mode .admin-select option {
  background-color: #271d13;
  color: #e8dbc3;
}

/* ==================== 角标配色与预览色块 ==================== */
.color-select-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.color-select-input {
  flex: 1;
  min-width: 0;
}

.color-preview-swatch {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s ease, background-color 0.2s ease;
}

.color-preview-swatch:hover {
  transform: scale(1.08);
}

.color-preview-swatch.is-tag-gold,
.color-preview-swatch.is-badge-gold {
  background: #c69234;
}

.color-preview-swatch.is-tag-red,
.color-preview-swatch.is-badge-red {
  background: #8b0000;
}

.color-preview-swatch.is-tag-teal,
.color-preview-swatch.is-badge-teal {
  background: #4b7a78;
}

.color-preview-swatch.is-badge-green {
  background: #3c7d5c;
}

.color-preview-swatch.is-badge-gray {
  background: #7a6a56;
}

/* 公告标签配色 */
.color-preview-swatch.is-notice-pinned {
  background: #8b0000;
}
.color-preview-swatch.is-notice-patch {
  background: #c69234;
}
.color-preview-swatch.is-notice-event {
  background: #4b7a78;
}
.color-preview-swatch.is-notice-info {
  background: #8f7351;
}
.color-preview-swatch.is-notice-gold {
  background: #c69234;
}

.dark-mode .admin-select optgroup {
  background-color: #1a130c;
  color: #ffd78c;
}

/* ==================== 底栏行条目 ==================== */
.home-block-rows {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed rgba(143, 115, 81, 0.25);
}

.home-rows-header {
  margin-bottom: 8px;
}

.home-row-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: rgba(143, 115, 81, 0.06);
  border: 1px solid rgba(143, 115, 81, 0.2);
  border-radius: 5px;
}

.home-row-main {
  display: flex;
  gap: 8px;
  align-items: center;
}

.home-row-action {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 6px;
  border-top: 1px dashed rgba(143, 115, 81, 0.15);
}

.home-row-action-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

.home-row-action-select {
  flex: 0 0 140px !important;
  width: 140px !important;
  max-width: 140px !important;
}

.home-row-action-hint {
  font-size: 12px;
  color: var(--text-muted);
  opacity: 0.75;
}

.home-row-action-target {
  flex: 1;
  min-width: 0;
}

.home-input-tag {
  width: 72px;
  flex-shrink: 0;
  text-align: center;
}

.home-input-wide {
  flex: 2;
  min-width: 0;
}

/* ==================== 核心角色自定义搜索下拉框与项目古木滚动条 ==================== */
.hero-combobox {
  position: relative;
  flex: 1;
  min-width: 0;
}

.hero-combobox-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--paper-soft, #f4ecdc);
  border: 1px solid var(--wood-border, #7a5c3d);
  border-radius: 4px;
  color: var(--text-main, #3e2a14);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.hero-combobox-trigger:hover {
  border-color: var(--gold-accent, #c5913e);
  box-shadow: 0 0 0 1px rgba(197, 145, 62, 0.25);
}

.is-open .hero-combobox-trigger {
  border-color: var(--gold-accent, #c5913e);
  box-shadow: 0 0 0 2px rgba(197, 145, 62, 0.3);
}

.hero-combobox-arrow {
  color: var(--text-muted, #755c3f);
  font-size: 11px;
  margin-left: 8px;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.is-open .hero-combobox-arrow {
  transform: rotate(180deg);
}

.hero-combobox-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 90;
  background: var(--paper-card, #f9f5eb);
  border: 1.5px solid var(--gold-accent, #c5913e);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
}

.hero-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.hero-search-icon {
  font-size: 12px;
  opacity: 0.7;
  flex-shrink: 0;
}

.hero-search-input {
  flex: 1;
  font-size: 13px !important;
  padding: 5px 8px !important;
}

.hero-search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}

.hero-options-scroll {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(143, 115, 81, 0.45) rgba(143, 115, 81, 0.08);
  padding-right: 2px;
}

/* 遵循项目专属 WebKit 古木滚动条标准 */
.hero-options-scroll::-webkit-scrollbar {
  width: 6px;
}
.hero-options-scroll::-webkit-scrollbar-button {
  display: none;
}
.hero-options-scroll::-webkit-scrollbar-track {
  background: rgba(143, 115, 81, 0.08);
  border-radius: 4px;
}
.hero-options-scroll::-webkit-scrollbar-thumb {
  background: rgba(143, 115, 81, 0.42);
  border-radius: 4px;
  transition: background 0.15s;
}
.hero-options-scroll::-webkit-scrollbar-thumb:hover {
  background: #a88452;
}

.hero-option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-main);
  transition: all 0.12s;
}

.hero-option-item:hover {
  background: rgba(197, 145, 62, 0.15);
}

.hero-option-item.is-selected {
  background: rgba(197, 145, 62, 0.25);
  font-weight: 700;
}

.hero-option-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.hero-option-name {
  color: var(--text-main);
  font-weight: 700;
  font-size: 13.5px;
}

.hero-option-rare {
  color: #c5913e;
  font-weight: 800;
  font-size: 12px;
}

.hero-option-tag {
  font-size: 11.5px;
  color: var(--text-muted);
  background: rgba(143, 115, 81, 0.12);
  padding: 1px 6px;
  border-radius: 3px;
}

.hero-option-check {
  color: #287a4c;
  font-weight: 800;
  font-size: 13px;
  margin-left: auto;
}

.hero-option-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12.5px;
}

.dark-mode .hero-combobox-dropdown {
  background: #271d13;
  border-color: #d4a359;
}

.dark-mode .hero-options-scroll {
  scrollbar-color: rgba(220, 180, 120, 0.4) rgba(30, 22, 14, 0.4);
}
.dark-mode .hero-options-scroll::-webkit-scrollbar-track {
  background: rgba(30, 22, 14, 0.4);
}
.dark-mode .hero-options-scroll::-webkit-scrollbar-thumb {
  background: rgba(220, 180, 120, 0.35);
}
.dark-mode .hero-options-scroll::-webkit-scrollbar-thumb:hover {
  background: #e5b060;
}

/* ==================== 路由选择 Combobox 与古木滚动条 (图 3 专属优化) ==================== */
.route-combobox {
  position: relative;
  width: 100%;
}

.route-combobox-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  background: var(--paper-soft, #f4ecdc);
  border: 1px solid var(--wood-border, #7a5c3d);
  border-radius: 4px;
  color: var(--text-main, #3e2a14);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.route-combobox-trigger:hover {
  border-color: var(--gold-accent, #c5913e);
  box-shadow: 0 0 0 1px rgba(197, 145, 62, 0.25);
}

.is-open .route-combobox-trigger {
  border-color: var(--gold-accent, #c5913e);
  box-shadow: 0 0 0 2px rgba(197, 145, 62, 0.3);
}

.route-combobox-selected {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-combobox-arrow {
  color: var(--text-muted, #755c3f);
  font-size: 11px;
  margin-left: 8px;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.is-open .route-combobox-arrow {
  transform: rotate(180deg);
}

.route-combobox-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 95;
  background: var(--paper-card, #f9f5eb);
  border: 1.5px solid var(--gold-accent, #c5913e);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
}

.route-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.route-search-icon {
  font-size: 12px;
  opacity: 0.7;
  flex-shrink: 0;
}

.route-search-input {
  flex: 1;
  font-size: 13px !important;
  padding: 5px 8px !important;
}

.route-search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}

.route-options-scroll {
  max-height: 230px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(143, 115, 81, 0.45) rgba(143, 115, 81, 0.08);
  padding-right: 2px;
}

.route-options-scroll::-webkit-scrollbar {
  width: 6px;
}
.route-options-scroll::-webkit-scrollbar-button {
  display: none;
}
.route-options-scroll::-webkit-scrollbar-track {
  background: rgba(143, 115, 81, 0.08);
  border-radius: 4px;
}
.route-options-scroll::-webkit-scrollbar-thumb {
  background: rgba(143, 115, 81, 0.42);
  border-radius: 4px;
  transition: background 0.15s;
}
.route-options-scroll::-webkit-scrollbar-thumb:hover {
  background: #a88452;
}

.route-group-header {
  font-size: 11px;
  font-weight: 800;
  color: var(--gold-accent, #c5913e);
  background: rgba(197, 145, 62, 0.1);
  padding: 5px 8px;
  border-radius: 3px;
  margin: 6px 0 2px;
  letter-spacing: 1px;
}
.route-group-header:first-of-type {
  margin-top: 2px;
}

.route-option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-main);
  transition: all 0.12s;
}

.route-option-item:hover {
  background: rgba(197, 145, 62, 0.14);
}

.route-option-item.is-selected {
  background: rgba(197, 145, 62, 0.25);
  font-weight: 700;
}

.route-option-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.route-option-name {
  color: var(--text-main);
  font-weight: 600;
}

.route-option-path {
  font-size: 11.5px;
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
}

.route-option-check {
  color: #287a4c;
  font-weight: 800;
  font-size: 13px;
  margin-left: auto;
}

.route-option-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12.5px;
}

.dark-mode .route-combobox-dropdown {
  background: #271d13;
  border-color: #d4a359;
}
.dark-mode .route-options-scroll {
  scrollbar-color: rgba(220, 180, 120, 0.4) rgba(30, 22, 14, 0.4);
}
.dark-mode .route-options-scroll::-webkit-scrollbar-track {
  background: rgba(30, 22, 14, 0.4);
}
.dark-mode .route-options-scroll::-webkit-scrollbar-thumb {
  background: rgba(220, 180, 120, 0.35);
}
.dark-mode .route-options-scroll::-webkit-scrollbar-thumb:hover {
  background: #e5b060;
}

/* ==================== 底部动作条 ==================== */
.home-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 6px;
  padding-top: 6px;
}

.admin-saved {
  color: #287a4c;
  font-size: 13px;
  font-weight: 700;
}

.admin-error {
  color: #b83232;
  font-size: 13px;
  font-weight: 700;
}
</style>
