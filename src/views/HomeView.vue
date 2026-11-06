<template>
  <div class="home-view" :class="{ 'is-mobile': !isDesktop }" data-main-scroll>
    <!-- 1. 顶部焦点海报轮播 (Hero Poster Banner: 洛克王国 Wiki 风格扩展色融合设计) -->
    <section
      class="home-poster-banner corner-nails"
      :class="{ 'is-loading': configLoading && !bannerList.length }"
      @mouseenter="pauseCarousel"
      @mouseleave="resumeCarousel"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <!--
        加载态：海报还没拿到时显示转圈，而不是一块纯黑。
        🔴 只在「没有兜底内容」时出现 —— `bannerList` 有 DEFAULT_BANNERS 兜底，
        但首次渲染时配置尚未回来，`bannerList` 可能是空数组，此时黑块最刺眼。
      -->
      <div v-if="configLoading && !bannerList.length" class="poster-loading">
        <UiEmptyState type="loading" text="正在加载海报..." />
      </div>
      <template v-else>
      <!-- 左右切换箭头 -->
      <button class="poster-nav-btn prev" @click="prevSlide" title="上一张" aria-label="上一张">
        <svg width="8" height="23" viewBox="0 0 12 34" fill="none" style="width:8px;height:23px;display:block;"><path fill="currentColor" d="M7.158 2.33a1.5 1.5 0 0 1 2.684 1.34L3.177 17l6.665 13.33a1.5 1.5 0 0 1-2.684 1.34l-7-14a1.5 1.5 0 0 1 0-1.34z"/></svg>
      </button>
      <button class="poster-nav-btn next" @click="nextSlide" title="下一张" aria-label="下一张">
        <svg width="8" height="23" viewBox="0 0 12 34" fill="none" style="width:8px;height:23px;display:block;"><path fill="currentColor" d="M4.842 2.33a1.5 1.5 0 0 0-2.684 1.34L8.823 17 2.158 30.33a1.5 1.5 0 0 0 2.684 1.34l7-14a1.5 1.5 0 0 0 0-1.34z"/></svg>
      </button>

      <!-- 轮播幻灯片容器 (无缝无限物理滑轨) -->
      <div
        class="poster-track"
        :style="trackStyle"
        @transitionend="onTrackTransitionEnd"
      >
        <div
          v-for="(banner, vIndex) in loopBanners"
          :key="'v-slide-' + vIndex"
          class="poster-slide"
          :style="{
            backgroundColor: banner.bgColor
          }"
        >
          <!-- 左侧文字区域 -->
          <div class="poster-content">
            <div v-if="banner.tagText || banner.subTag" class="poster-tags">
              <span v-if="banner.tagText" class="poster-tag" :class="banner.tagClass">{{ banner.tagText }}</span>
              <span v-if="banner.subTag" class="poster-tag-sub">{{ banner.subTag }}</span>
            </div>
            <h2 class="poster-title">{{ banner.title }}</h2>
            <p class="poster-desc">{{ banner.desc }}</p>
            <div class="poster-btn-wrap">
              <button class="poster-btn" @click="handleBannerAction(banner)">
                <span>{{ banner.btnText }}</span>
                <span class="btn-arrow">&gt;</span>
              </button>
            </div>
          </div>

          <!-- 右侧海报图容器与渐变过渡蒙层 -->
          <div class="poster-image-wrap">
            <img
              :src="getImageUrl(banner.image)"
              class="poster-img"
              :alt="banner.title"
              loading="lazy"
            />
            <!-- 向左羽化融合渐变层：更柔和的左侧渐变，让海报主体最大化露脸 -->
            <div
              class="poster-blend-overlay"
              :style="{
                background: `linear-gradient(90deg, ${banner.bgColor} 0%, ${banner.blendStart} 12%, transparent 48%)`
              }"
            ></div>
          </div>
        </div>
      </div>

      <!-- 轮播底部圆点指示器 -->
      <div class="poster-dots">
        <div
          v-for="(banner, index) in bannerList"
          :key="'dot-' + index"
          class="poster-dot"
          :class="{ active: currentRealIndex === index }"
          @click="jumpToSlide(index)"
        ></div>
      </div>
      </template>
    </section>

    <!-- 1.5 公告与官方更新资讯板块 (Notice & Updates) -->
    <section class="notices-section paper-panel corner-nails">
      <div class="notices-header">
        <div class="notices-tabs">
          <button
            class="notice-tab-btn"
            :class="{ active: activeNoticeTab === 'site' }"
            @click="activeNoticeTab = 'site'"
          >
            本站公告
          </button>
          <button
            class="notice-tab-btn"
            :class="{ active: activeNoticeTab === 'official' }"
            @click="activeNoticeTab = 'official'"
          >
            官方公告
          </button>
        </div>
      </div>

      <div class="notices-body-layout">
        <!-- 左侧：公告条目列表 -->
        <div class="notice-list-column">
          <div
            v-for="item in currentNoticesList"
            :key="item.id || item.title"
            class="notice-list-item"
            @click="openNoticeDetail(item, { syncUrl: true })"
          >
            <span class="notice-tag" :class="item.tagClass">{{ item.tagText }}</span>
            <span class="notice-item-title">{{ item.title }}</span>
            <span class="notice-item-date">{{ item.date }}</span>
          </div>
          <!--
            加载中：配置还没回来时显示转圈。
            🔴 必须与「暂无公告」分开 —— 前者是「还在取」，后者是「取到了但被停用」。
            之前两者共用空态，首次进页面会先闪一下「暂无公告」，看着像坏了。
          -->
          <UiEmptyState
            v-if="configLoading && !currentNoticesList.length"
            type="loading"
            text="正在加载公告..."
          />
          <!--
            空态：该频道公告全被停用时显示占位，而不是留一片空白。
            Tab 与区块本身保留 —— 它们是页面固定结构，消失会让布局塌陷。
          -->
          <div v-else-if="!currentNoticesList.length" class="notice-empty">暂无公告</div>
        </div>

        <!--
          右侧：官方更新公告特色速览卡。
          锚定「带版本号的那条」官方公告（版本日志才有版本号 + 特性要点）；
          没有官方公告时整块隐藏，不留空壳。
        -->
        <div v-if="officialPatchNotice" class="patch-highlight-box">
          <div class="patch-highlight-head">
            <div class="patch-ver-title">
              <span>版本更新：{{ officialPatchNotice.version || officialPatchNotice.title }}</span>
            </div>
          </div>
          <ul v-if="patchFeatures.length" class="patch-features-list">
            <li
              v-for="(feat, i) in patchFeatures"
              :key="i"
              class="patch-feature-item"
            >{{ feat }}</li>
          </ul>
          <button class="patch-view-full-btn" @click="openNoticeDetail(officialPatchNotice)">
            <span>查看完整公告</span>
            <span class="btn-arrow" aria-hidden="true">&gt;</span>
          </button>
        </div>
      </div>
    </section>

    <!-- 2. 核心图鉴金刚区 (4大图鉴大卡片) -->
    <section class="home-core-indexes">
      <div class="section-title section-title-ribbon">
        <span>核心图鉴</span>
      </div>
      <div class="core-indexes-grid">
        <!--
          核心图鉴：4 格固定，但内容 / 图标 / 跳转都由后台配置（home_links 表 section='core'）。
          图标优先取「该路由在导航里的图标」（icon_source='nav'），否则用自定义 URL。
        -->
        <template v-if="coreLinks.length">
        <div
          v-for="link in coreLinks"
          :key="`core-${link.slot}`"
          class="core-index-card paper-panel"
          role="link"
          tabindex="0"
          :title="`前往${link.title}`"
          @click="goTo(buildRouteTarget(link.route, link.queryString))"
          @keydown.enter.prevent="goTo(buildRouteTarget(link.route, link.queryString))"
          @keydown.space.prevent="goTo(buildRouteTarget(link.route, link.queryString))"
        >
          <div class="core-index-icon-wrap">
            <img :src="getImageUrl(resolveIcon(link))" :alt="link.title" class="game-sprite" />
          </div>
          <div class="core-index-name">{{ link.title }}</div>
          <div class="core-index-desc">{{ link.description }}</div>
        </div>
        </template>
        <!-- 加载中：占满整行，避免标题下方出现刺眼的空白 -->
        <UiEmptyState v-else-if="configLoading" class="section-loading" type="loading" text="正在加载图鉴入口..." />
      </div>
    </section>

    <!-- 3. 实用模拟与策略工具精选 (2x2 横向卡片) -->
    <section class="home-tools-section">
      <div class="section-title section-title-ribbon">
        <span>实用工具</span>
      </div>

      <div class="tools-grid">
        <template v-if="toolLinks.length">
        <div
          v-for="link in toolLinks"
          :key="`tool-${link.slot}`"
          class="tool-banner-card paper-panel"
          role="link"
          tabindex="0"
          :title="`前往${link.title}`"
          @click="goTo(buildRouteTarget(link.route, link.queryString))"
          @keydown.enter.prevent="goTo(buildRouteTarget(link.route, link.queryString))"
          @keydown.space.prevent="goTo(buildRouteTarget(link.route, link.queryString))"
        >
          <div class="tool-icon-box">
            <img :src="getImageUrl(resolveIcon(link))" :alt="link.title" class="game-sprite" />
          </div>
          <div class="tool-info">
            <div class="tool-head">
              <span class="tool-title">{{ link.title }}</span>
              <span
                v-if="link.badgeText"
                class="tool-tag"
                :class="BadgeClass(link.badgeColor)"
              >{{ link.badgeText }}</span>
            </div>
            <div class="tool-desc">{{ link.description }}</div>
          </div>
        </div>
        </template>
        <UiEmptyState v-else-if="configLoading" class="section-loading" type="loading" text="正在加载工具入口..." />
      </div>
    </section>

    <!-- 4. 契约者展示 (Hero Showcase) -->
    <!--
      4. 契约者展示 (Hero Showcase)
      🔴 整块按「有没有内容」显示：加载中显示转圈；加载完仍无角色（后台 home_heroes 为空）
         则整块隐藏 —— 否则会留一个只有「契约者展示」标题的空壳，看着像没加载出来。
    -->
    <section v-if="configLoading || featuredHeroes.length" class="hero-showcase paper-panel corner-nails">
      <div class="section-title">
        <span>契约者展示</span>
        <span class="section-title-sub">热门角色</span>
      </div>
      <div class="hero-chibi-grid">
        <template v-if="featuredHeroes.length">
        <div
          v-for="hero in featuredHeroes"
          :key="hero.id"
          class="hero-chibi-card"
          role="link"
          tabindex="0"
          :title="`查看「${hero.name}」的角色详情`"
          @click="goToHero(hero.id)"
          @keydown.enter.prevent="goToHero(hero.id)"
          @keydown.space.prevent="goToHero(hero.id)"
        >
          <!-- 星级角标 (固定左上角，对齐图鉴品质颜色) -->
          <span class="hero-star-badge" :class="`star-${hero.rare}`">
            <img
              :src="getImageUrl('/images/HeroGachaPanel_Atlas/gacha_star.webp')"
              class="star-icon-img"
              alt=""
            />
            {{ hero.rare }}星
          </span>

          <!-- Q版模型立绘容器 -->
          <div class="chibi-img-wrap">
            <img
              :src="getImageUrl(hero.qImg)"
              class="chibi-img"
              :alt="`${hero.name}模型小人`"
              loading="lazy"
              decoding="async"
            />
          </div>

          <!-- 角色名 -->
          <div class="chibi-hero-name">{{ hero.name }}</div>

          <!-- 职业与属性双徽章标签行 -->
          <div class="chibi-tags-row">
            <span class="chibi-tag tag-job" :title="hero.jobName">
              <img :src="getImageUrl(hero.jobIcon)" class="tag-icon" alt="" />
              {{ hero.jobName }}
            </span>
            <span class="chibi-tag tag-element" :title="hero.elementName">
              <img :src="getImageUrl(hero.elementIcon)" class="tag-icon" alt="" />
              {{ hero.elementName }}
            </span>
          </div>

          <!-- 底部特色定位胶囊标签 -->
          <div class="hero-card-tip-pill" :title="hero.tip">
            {{ hero.tip }}
          </div>
        </div>
        </template>
        <UiEmptyState v-else-if="configLoading" class="section-loading" type="loading" text="正在加载角色..." />
      </div>
    </section>

    <!-- 5. 底部两栏：大书院交流 / 新人攻略（内容由 home_blocks 表驱动） -->
    <section class="daily-guide-row">
      <div
        v-for="sec in blockSections"
        :key="sec.key"
        class="daily-col paper-panel corner-nails"
      >
        <div class="section-title">
          <span>{{ sec.title }}</span>
          <span v-if="sec.subtitle && sec.subtitle !== '占位'" class="section-title-sub">{{ sec.subtitle }}</span>
        </div>
        <div class="daily-list">
          <div
            v-for="(row, i) in sec.rows"
            :key="rowKey(sec.key, row, i)"
            class="daily-item"
            :class="{ 'is-clickable': isRowClickable(row) }"
            :role="isRowClickable(row) ? 'link' : undefined"
            :tabindex="isRowClickable(row) ? 0 : undefined"
            :title="isRowClickable(row) ? `前往${row.label}` : undefined"
            @click="handleBlockRowAction(row)"
            @keydown.enter.prevent="handleBlockRowAction(row)"
            @keydown.space.prevent="handleBlockRowAction(row)"
          >
            <span class="daily-item-name">
              <span v-if="row.tag" class="daily-item-badge">{{ row.tag }}</span>
              {{ row.label }}
            </span>
            <span class="daily-item-status">
              {{ row.text }}
              <span v-if="isRowClickable(row)" class="daily-item-arrow">›</span>
            </span>
          </div>
          <div v-if="!sec.rows.length" class="notice-empty">暂无内容</div>
        </div>
      </div>
    </section>

    <!-- 6. 内置精美公告详情弹窗 (Teleport 挂到 body 顶层，确保遮罩覆盖全站视口) -->
    <Teleport to="body">
      <div
        v-if="activeModalNotice"
        class="notice-modal-backdrop"
        @click.self="closeNoticeDetail"
      >
        <div class="notice-modal-content paper-panel corner-nails">
          <button class="notice-modal-close" @click="closeNoticeDetail" title="关闭">✕</button>
          <div class="notice-modal-header">
            <h3 class="notice-modal-title">{{ activeModalNotice.title }}</h3>
            <span class="notice-modal-date">发布时间：{{ activeModalNotice.date }}</span>
          </div>
          <div class="notice-modal-body">
            <!--
              正文用 RichTextView 渲染（受限标记 → VNode，禁 v-html）。
              老公告是纯文本，解析器无标记时原样输出，天然兼容。
            -->
            <RichTextView class="notice-paragraph" :content="activeModalNotice.content" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getImageUrl } from '../utils/env.js'
import { loadHomeConfig, hasHomeConfigCache, buildRouteTarget } from '../utils/homeConfig.js'
import { navIconOf } from '../config/navRoutes.js'
import RichTextView from '../components/ui/RichTextView.vue'
import UiEmptyState from '../components/ui/UiEmptyState.vue'

const router = useRouter()
const route = useRoute()

// 屏幕宽度判断，移动端适配
const isDesktop = ref(typeof window !== 'undefined' ? window.innerWidth >= 768 : true)
const updateDesktopState = () => {
  if (typeof window !== 'undefined') {
    isDesktop.value = window.innerWidth >= 768
  }
}

// 洛克王国 Wiki 风格的海报列表：图片放右侧，左侧根据图片边缘与画面主调平滑向左扩展（方案 B：画面主调提亮系）
/** 海报列表：由 `loadHomeConfig()` 填充，默认值在 homeConfig.js 的 DEFAULT_BANNERS */
const bannerList = ref([])

/** 真实海报张数（不含首尾克隆）。必须跟随 bannerList 变化，不能用一次性常量。 */
const realTotal = computed(() => bannerList.value.length)

// 轮播海报逻辑 (TapTap 源码级无缝无限物理滑轨 + 移动端丝滑触摸手势)
/*
 * 无缝轮播：真实 N 张 → 渲染 N+2 张（首尾各克隆一张）。
 * 滑到克隆位后由 onTrackTransitionEnd 瞬间跳回真实位置，用户看不出接缝。
 *
 * 🔴 必须用 `bannerList.value`：数据改成 ref 后，直接读 `bannerList.length`
 *    拿到的是 ref 对象（undefined），运行时报 "bannerList is not iterable"。
 *    之前这些代码在 `const bannerList = [...]` 上是裸数组，所以不需要 .value。
 */
const loopBanners = computed(() => {
  const list = bannerList.value
  if (!list.length) return []
  const last = list.length - 1
  return [
    list[last],   // index 0: 尾部克隆项
    ...list,      // index 1..N: 真实海报
    list[0]       // index N+1: 头部克隆项
  ]
})

const currentVirtualIndex = ref(1) // 初始定位在真实第 1 张 (虚拟索引 1)
const isAnimated = ref(false)
const isTransitioning = ref(false)
let slideTimer = null

// 移动端触摸拖拽状态
const dragOffset = ref(0)
const isDragging = ref(false)
let touchStartX = 0
let touchStartY = 0
let isHorizontalGesture = null
let hasSwiped = false

const currentRealIndex = computed(() => {
  // 数据未到位时 realTotal 为 0，取模会得 NaN，进而让圆点高亮失效 —— 先挡住。
  const total = realTotal.value
  if (!total) return 0
  return (currentVirtualIndex.value - 1 + total) % total
})

const trackStyle = computed(() => {
  if (isDragging.value && dragOffset.value !== 0) {
    return {
      transform: `translate3d(calc(-${currentVirtualIndex.value * 100}% + ${dragOffset.value}px), 0, 0)`,
      transition: 'none'
    }
  }
  return {
    transform: `translate3d(-${currentVirtualIndex.value * 100}%, 0, 0)`,
    transition: isAnimated.value ? 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
  }
})

const nextSlide = () => {
  if (isTransitioning.value) return
  isTransitioning.value = true
  isAnimated.value = true
  currentVirtualIndex.value++
}

const prevSlide = () => {
  if (isTransitioning.value) return
  isTransitioning.value = true
  isAnimated.value = true
  currentVirtualIndex.value--
}

const jumpToSlide = (realIdx) => {
  if (isTransitioning.value) return
  isTransitioning.value = true
  isAnimated.value = true
  currentVirtualIndex.value = realIdx + 1
  restartCarousel()
}

// 触摸手势处理
const onTouchStart = (e) => {
  if (isTransitioning.value || !e.touches || e.touches.length === 0) return
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
  isHorizontalGesture = null
  isDragging.value = false
  dragOffset.value = 0
  hasSwiped = false
  stopCarousel()
}

const onTouchMove = (e) => {
  if (isTransitioning.value || !e.touches || e.touches.length === 0) return
  const currentX = e.touches[0].clientX
  const currentY = e.touches[0].clientY
  const diffX = currentX - touchStartX
  const diffY = currentY - touchStartY

  // 判定是否为横向滑动手势
  if (isHorizontalGesture === null) {
    if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
      isHorizontalGesture = Math.abs(diffX) >= Math.abs(diffY)
    }
  }

  if (isHorizontalGesture) {
    if (e.cancelable) e.preventDefault()
    isDragging.value = true
    hasSwiped = true
    const bannerEl = document.querySelector('.home-poster-banner')
    const bannerWidth = bannerEl?.offsetWidth || 350
    dragOffset.value = Math.max(-bannerWidth, Math.min(bannerWidth, diffX))
  }
}

const onTouchEnd = () => {
  if (isDragging.value) {
    const bannerEl = document.querySelector('.home-poster-banner')
    const bannerWidth = bannerEl?.offsetWidth || 350
    const threshold = bannerWidth * 0.15 // 划过 15% 宽度即判定翻页
    if (dragOffset.value < -threshold) {
      nextSlide()
    } else if (dragOffset.value > threshold) {
      prevSlide()
    } else {
      isAnimated.value = true
    }
  }
  dragOffset.value = 0
  isDragging.value = false
  setTimeout(() => {
    hasSwiped = false
  }, 120)
  restartCarousel()
}

const onTrackTransitionEnd = (e) => {
  if (e.propertyName !== 'transform') return
  isTransitioning.value = false
  // 滑到了末尾的首张克隆项 (虚拟索引 4) -> 瞬间无动画跳回真实第 1 张 (虚拟索引 1)
  if (currentVirtualIndex.value >= realTotal.value + 1) {
    isAnimated.value = false
    currentVirtualIndex.value = 1
  }
  // 滑到了开头的末张克隆项 (虚拟索引 0) -> 瞬间无动画跳回真实最后一张 (虚拟索引 3)
  else if (currentVirtualIndex.value <= 0) {
    isAnimated.value = false
    currentVirtualIndex.value = realTotal.value
  }
}

const startCarousel = () => {
  stopCarousel()
  slideTimer = setInterval(() => {
    nextSlide()
  }, 6000)
}

const stopCarousel = () => {
  if (slideTimer) {
    clearInterval(slideTimer)
    slideTimer = null
  }
}

const restartCarousel = () => {
  stopCarousel()
  startCarousel()
}

const pauseCarousel = () => stopCarousel()
const resumeCarousel = () => startCarousel()

/**
 * 行动分发（海报与底栏共用）。
 *
 *   route    → 站内跳转（actionValue 是路径，可带 query）
 *   notice   → 打开指定公告的详情弹窗（actionValue 是公告 id），不跳页
 *   external → 新标签打开外链（仅 https://）
 *   none     → 不做任何事
 *
 * 🔴 这里**不判断 hasSwiped**。那是海报的专用状态（"刚横向滑过，别误触按钮"），
 *    底栏离海报很远用不到。由调用方各自决定要不要先挡一道 —— 见 handleBannerAction。
 *
 * 找不到目标时静默不动，绝不让首页抛错。
 */
function dispatchAction(type, rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return

  if (type === 'route') {
    router.push(value)
    return
  }

  if (type === 'notice') {
    const all = [...(noticesData.value.site || []), ...(noticesData.value.official || [])]
    const target = all.find((n) => n.id === value)
    if (target) openNoticeDetail(target)
    return
  }

  if (type === 'external') {
    // 后台已校验协议；这里再挡一次，防止有人直接改库塞进 javascript:
    if (!/^https:\/\//i.test(value)) {
      console.warn('[home] 拒绝打开非 https 外链：', value)
      return
    }
    window.open(value, '_blank', 'noopener,noreferrer')
  }
}

/** 海报按钮：先挡「刚滑过海报」的误触，再分发 */
const handleBannerAction = (banner) => {
  if (hasSwiped) return // 刚滑动切换过海报，不触发链接跳转
  dispatchAction(banner.actionType || 'route', banner.actionValue)
}

/**
 * 底栏条目是否可点击。
 *
 * 抽成函数是因为模板里要用三次（class / role+tabindex / 箭头），
 * 内联写 `row.actionType && row.actionType !== 'none'` 三遍容易改漏一处。
 */
const isRowClickable = (row) => Boolean(row?.actionType && row.actionType !== 'none')

/**
 * 底栏行的稳定 :key。
 *
 * 不用数组下标：后台上移/下移或删除中间行时，下标 key 会让 Vue 复用错 DOM
 * （项目里 AdminSettingsPanel 踩过：输入框焦点与内容错位）。
 * 用「区块+标签+名称」组合 —— 底栏行没有 id，这三项在单块内足以区分。
 */
const rowKey = (sectionKey, row, index) =>
  `${sectionKey}:${row?.tag || ''}:${row?.label || ''}:${index}`

/** 底栏条目点击跳转 */
const handleBlockRowAction = (row) => {
  if (!isRowClickable(row)) return
  dispatchAction(row.actionType, row.actionValue)
}

// 快捷页面跳转
const goTo = (path) => {
  router.push(path)
}

/**
 * 图鉴 / 工具卡片的图标来源。
 *
 * `icon_source='nav'` → 取该路由在导航里的图标（`config/navRoutes.js` 是唯一权威来源）
 * `icon_source='custom'` → 用后台填的 iconUrl
 * 都取不到时给一个透明占位，避免 <img> 显示破图。
 */
const resolveIcon = (link) => {
  if (link.iconSource === 'custom' && link.iconUrl) return link.iconUrl
  return navIconOf(link.route) || '/ui/item_00002.webp'
}

/**
 * 角标配色类名。
 *
 * 后台只允许 5 个预设值（见 HOME_CONTENT.md），这里做一次白名单映射，
 * 非法值退化成默认色，不拼出任意 class。
 */
const BADGE_CLASSES = {
  red: 'is-badge-red',
  green: 'is-badge-green',
  gold: 'is-badge-gold',
  teal: 'is-badge-teal',
  gray: 'is-badge-gray'
}
const BadgeClass = (color) => BADGE_CLASSES[color] || 'is-badge-gray'

/**
 * 打开某个角色的详情。
 *
 * `/heroes` 读 `?id=` 自动打开对应角色的详情弹窗（见 HeroesView 的
 * `openFromQueryId` / `watch(() => route.query.id)`），所以带上 id 就能直达，
 * 不用用户进去后再自己找。
 */
const goToHero = (id) => {
  if (!id) { router.push('/heroes'); return }
  router.push({ path: '/heroes', query: { id } })
}

// 公告标签与数据
const activeNoticeTab = ref('site')

/** 公告：{ site: [], official: [] }，由 loadHomeConfig() 填充 */
const noticesData = ref({ site: [], official: [] })

/**
 * 右侧速览卡指向的公告：**优先取官方频道里带 version 的那条**。
 *
 * 为什么按 version 而不是按日期：
 *   这张卡是「大版本更新速览」，展示版本号 + 特性要点。
 *   带 `version` 字段的才是版本日志；普通修复通知 / 前瞻没有版本号，
 *   放在这张卡上会变成「只有一行标题、没有要点」的空壳。
 *   所以只要库里还有任何一条带版本号的公告，卡片就锚定它，不随日期漂移。
 *
 * 找不到带版本号的，退回官方频道第一条（至少有内容可展示）。
 * 整个官方频道为空时返回 null，模板据此隐藏卡片。
 */
const officialPatchNotice = computed(() => {
  const list = noticesData.value.official || []
  return list.find((n) => n.version) || list[0] || null
})

/** 速览卡的特性列表：直接用该公告自己的 features（没有就不显示列表） */
const patchFeatures = computed(() => {
  const own = officialPatchNotice.value?.features
  return Array.isArray(own) ? own : []
})

const currentNoticesList = computed(() => noticesData.value[activeNoticeTab.value] || [])

// 弹窗状态
const activeModalNotice = ref(null)

/**
 * 打开某条公告的详情。
 *
 * `syncUrl=true` 时把公告 id 写进地址栏（`?notice=site-1`），
 * 这样链接可分享、刷新后弹窗还在、浏览器后退能关掉弹窗 ——
 * 与 `/heroes?id=`、`/misc?tab=` 的口径一致。
 *
 * 海报按钮跳公告时**不写 URL**（`syncUrl=false`）：那是首页内的一个动作，
 * 不改地址更符合用户预期，也不会污染历史记录。
 */
const openNoticeDetail = (item, { syncUrl = false } = {}) => {
  if (!item) return
  activeModalNotice.value = item
  if (syncUrl && item.id && route.query.notice !== item.id) {
    router.replace({ query: { ...route.query, notice: item.id } })
  }
}

/** 关闭弹窗：同步清掉 URL 里的 notice 参数 */
const closeNoticeDetail = () => {
  activeModalNotice.value = null
  if (route.query.notice) {
    const next = { ...route.query }
    delete next.notice
    router.replace({ query: next })
  }
}

/** 按 id 在所有公告里查一条（含两个频道） */
const findNoticeById = (id) => {
  if (!id) return null
  const all = [...(noticesData.value.site || []), ...(noticesData.value.official || [])]
  return all.find((n) => n.id === id) || null
}

/**
 * 处理地址栏的 `?notice=id`。
 *
 * 数据加载完成后再调用 —— 公告还没到就查不到。
 * 找不到对应公告时静默清掉参数，不弹错误（可能是过期链接或公告已删）。
 */
const applyNoticeFromQuery = () => {
  const id = route.query.notice
  if (!id) return
  const hit = findNoticeById(String(id))
  if (hit) {
    activeModalNotice.value = hit
  } else {
    const next = { ...route.query }
    delete next.notice
    router.replace({ query: next }).catch(() => {})
  }
}

// 浏览器前进/后退、或别处改了 ?notice 时跟着变
watch(
  () => route.query.notice,
  (id) => {
    if (!id) {
      activeModalNotice.value = null
      return
    }
    const hit = findNoticeById(String(id))
    if (hit) activeModalNotice.value = hit
  }
)

/**
 * 契约者展示数据（Q版模型展示）
 *
 * 🔴 数值必须与 `public/data/parsed/heroes.json` 一致。改之前先查：
 *    node -e "const d=require('./public/data/parsed/heroes.json');console.log(d.heroes.filter(h=>['hero_053'].includes(h.id)))"
 *
 * 🔴 职业图标 slug 的权威映射在 `src/utils/gameMappings.js` 的 JOB_SLUGS：
 *    1近卫=zs  2守护=qs  3秘术=fs  4射手=yx  5突袭=ck  6支援=fz
 *    没有 `ss` 这个值 —— 射手是 `yx`，写错会 404。
 *
 * 🔴 元素图标在 `/images/HeroGachaShowPanel_Atlas/`：
 *    Water03 / Fire03 / Wind03 / Ground03（注意是 03，不是 01/02）
 *
 * `id` 用于点击跳转 `/heroes?id=<id>`，直接打开该角色详情。
 * `tip` 依据角色两个主动技能的实战定位概括。
 */
/** 核心角色：只含 { slot, heroId, tip }，其余字段由 resolveHeroes() 从 heroes.json join */
const featuredHeroes = ref([])

/** 图鉴 / 工具：来自 API，失败时用 DEFAULT_* */
const coreLinks = ref([])
const toolLinks = ref([])

/** 底部两栏 */
const homeBlocks = ref({ guide: null, help: null })

/**
 * 底栏渲染数据：把 `{guide, help}` 拍平成数组，顺序固定（先交流后攻略）。
 * 缺哪一块就跳过哪一块，不会渲染出半空卡片。
 */
const blockSections = computed(() => {
  const b = homeBlocks.value || {}
  const out = []
  for (const key of ['guide', 'help']) {
    const item = b[key]
    if (!item) continue
    out.push({
      key,
      title: item.title || '',
      subtitle: item.subtitle || '',
      rows: Array.isArray(item.rows) ? item.rows : []
    })
  }
  return out
})

/**
 * 加载态：首屏骨架用；API 失败也置 false（走兜底内容）。
 *
 * 🔴 初值取「是否已有缓存」而不是恒为 true：
 * 配置已在模块级缓存里时，`loadHomeConfig()` 会立刻 resolve，
 * 但 `await` 至少要走一拍微任务 —— 若初值为 true，这一拍里就会先渲染出
 * 5 个转圈再被真实内容替换，用户看到的就是「回来还要加载一次」。
 * 有缓存时直接从 false 起步，页面不闪。
 */
const configLoading = ref(!hasHomeConfigCache())

/**
 * 角色卡渲染所需的完整数据：把 heroId join 到 heroes.json。
 *
 * 为什么不在后端 join：`/heroes`、`/sims` 都已经加载了 heroes.json，
 * 首页再存一份完整角色数据会让「改了图鉴没改首页」这种不一致再现。
 * 这里只存 heroId + tip，展示字段实时取。
 */
function resolveHeroes(list, heroData) {
  if (!Array.isArray(list)) return []
  const byId = new Map((heroData || []).map((h) => [h.id, h]))
  return list
    .map((item) => {
      const h = byId.get(item.heroId)
      if (!h) return null
      return {
        id: h.id,
        name: h.name,
        rare: h.rare,
        qImg: `/images/chara/Q/hero_${h.id.replace(/^hero_/, '')}.webp`,
        jobName: h.jobName,
        jobIcon: `/images/HeroBagPanel/class_icon_s_${JOB_SLUGS[h.job] || 'zs'}.webp`,
        elementName: `${h.elementName}属性`,
        elementIcon: `/images/HeroGachaShowPanel_Atlas/spGachaTag${ELEMENT_SLUGS[h.element] || 'Fire'}03.webp`,
        tip: item.tip || ''
      }
    })
    .filter(Boolean)
}

/** 职业 / 元素 slug 映射（与 gameMappings.js 同源，这里只需数字键） */
const JOB_SLUGS = { 1: 'zs', 2: 'qs', 3: 'fs', 4: 'yx', 5: 'ck', 6: 'fz' }
const ELEMENT_SLUGS = { 1: 'Water', 2: 'Fire', 3: 'Wind', 4: 'Ground' }

/**
 * 首页角色摘要（约 6 KB）。
 *
 * 🔴 用模块级 Promise 缓存，理由同 `loadHomeConfig`：
 * 每次进首页都会走 `loadHomeContent()`，不缓存就会重复下载并重新转圈。
 */
let heroSummaryRequest = null
function loadHeroSummary() {
  if (!heroSummaryRequest) {
    heroSummaryRequest = fetch('/data/parsed/hero-summary.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => data.heroes || [])
      .catch(err => {
        // 失败不缓存，下次进页面还能重试
        heroSummaryRequest = null
        throw err
      })
  }
  return heroSummaryRequest
}

/**
 * 首屏数据加载。
 *
 * 🔴 失败不阻塞页面：loadHomeConfig() 内部已回落默认值，这里不做 try/catch，
 *    只是把结果铺到各个 ref 上。任何板块有问题都只影响该板块。
 */
async function loadHomeContent() {
  try {
  const cfg = await loadHomeConfig()
  bannerList.value = cfg.banners
  noticesData.value = cfg.notices
  coreLinks.value = cfg.coreLinks
  toolLinks.value = cfg.toolLinks
  homeBlocks.value = cfg.blocks

  /*
   * 角色数据：读精简版 `hero-summary.json`（约 6 KB），不再下载 1959 KB 的 heroes.json。
   *
   * 精简版包含**全部 34 个角色**的 6 个字段，所以后台 `home_heroes` 换成任意角色都能查到；
   * 它由 `scripts/parse/heroes.mjs` 与 heroes.json 同批次产出，两者不会脱节。
   * `/heroes`、`/sims`、`/gacha` 仍读完整版，不受影响。
   */
  try {
    featuredHeroes.value = resolveHeroes(cfg.heroes, await loadHeroSummary())
  } catch (err) {
    console.warn('[home] hero-summary.json 加载失败，角色区留空：', err?.message || err)
    featuredHeroes.value = []
  }
  } catch (err) {
    /*
     * 🔴 兜底：`loadHomeConfig()` 理论上内部已回落默认值，但仍要兜住。
     * 少了这层，一旦它抛错 `configLoading` 就永远为 true ——
     * 页面会卡在「正在加载」转圈上，比直接显示兜底内容更糟。
     */
    console.warn('[home] 首页配置加载失败，各部分采用内置默认值：', err?.message || err)
  } finally {
    configLoading.value = false
  }

  // 数据到位后重启轮播（初始 bannerList 为空，轮播定时器此时才有内容）
  startCarousel()

  /*
   * 处理 `?notice=id` 直达。
   * 必须放在数据加载之后 —— 公告还没到就查不到 id。
   * 用于：分享某条公告的链接、刷新后弹窗仍在、从别处深链进来看具体公告。
   */
  applyNoticeFromQuery()
}

onMounted(() => {
  loadHomeContent()

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateDesktopState)
  }
})

onBeforeUnmount(() => {
  stopCarousel()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateDesktopState)
  }
})
</script>

<style scoped>
/* ==========================================================================
   首页核心门户主体 (Exact Sides Match & Rock Kingdom Wiki Style Banner)
   严格复刻测试页面原汁原味的羊皮纸质感、金角钉与层次高光
   ========================================================================== */

.home-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  min-width: 0;
}

.home-view > * {
  flex-shrink: 0;
}

/* ==========================================================================
   1. 首页焦点海报轮播 (洛克王国 Wiki 风格：右图扩展色融合成背景)
   ========================================================================== */
.home-poster-banner {
  position: relative;
  height: 240px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid var(--border-color);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  background: #1e140b;
  user-select: none;
}

/*
 * 海报加载态：占满轮播区并居中。
 *
 * 底色沿用 `.home-poster-banner` 的深木色，转圈文字改浅色 ——
 * `UiEmptyState` 默认按浅色羊皮纸配深色字，直接放进来会看不见。
 */
.poster-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #d9c9ac;
}

.poster-loading :deep(.ui-empty-state__text),
.poster-loading :deep(.ui-empty-state__spinner) {
  color: #d9c9ac;
}

/*
 * 各区块内的加载态：占满整行并留出与内容相当的高度，
 * 避免「只有标题、下面一片空白」的塌陷感（实测会误以为页面坏了）。
 */
.section-loading {
  grid-column: 1 / -1;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  /*
   * 🔴 必须自带面板底色。核心图鉴 / 实用工具这两块没有外层 paper-panel，
   * 转圈会直接浮在地图背景上（实测文字与地图纹理叠在一起，看着像渲染错乱）。
   */
  background-color: rgba(223, 206, 179, 0.94);
  border: 2px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.35), inset 0 0 20px rgba(135, 107, 72, 0.12);
  box-sizing: border-box;
  padding: 16px;
}

.poster-track {
  display: flex;
  width: 100%;
  height: 100%;
  will-change: transform;
}

.poster-slide {
  position: relative;
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  overflow: hidden;
}

/* 左侧文字排版区域 */
.poster-content {
  position: relative;
  z-index: 3;
  padding: 0 0 0 32px;
  width: 42%;
  min-width: 290px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.poster-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.poster-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 3px;
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.poster-tag.gold {
  background: #c69234;
  color: #1a1005;
}

.poster-tag.teal {
  background: #4b7a78;
  color: #fff;
}

.poster-tag.red {
  background: #8b0000;
  color: #fff;
}

.poster-tag.info {
  background: #7a634b;
  color: #f7eedf;
}

.poster-tag-sub {
  font-size: 11px;
  color: #e5d2b7;
  background: rgba(0, 0, 0, 0.45);
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 0.3px;
}

.poster-title {
  margin: 0;
  font-size: 23px;
  font-weight: 700;
  color: #f7ebd7;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
  line-height: 1.25;
}

.poster-desc {
  margin: 0;
  font-size: 12.5px;
  color: #d6be9c;
  line-height: 1.55;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  white-space: pre-line;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.poster-btn-wrap {
  margin-top: 6px;
}

/* 前往按钮 (方案 7：无框微光流线文本链 - 纯净排印与动态引线) */
.poster-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 4px 0;
  box-shadow: none;
  color: #f7ebd7;
  font-size: 13.5px;
  font-weight: 700;
  position: relative;
  cursor: pointer;
  transition: all 0.25s ease;
  text-decoration: none;
  user-select: none;
}

.poster-btn::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1.5px;
  background: linear-gradient(90deg, #d4a74a 0%, rgba(212, 167, 74, 0.25) 75%, transparent 100%);
  transition: all 0.25s ease;
}

.poster-btn .btn-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(198, 146, 52, 0.22);
  border: 1px solid rgba(198, 146, 52, 0.5);
  color: #f7ebd7;
  font-size: 10px;
  font-family: monospace;
  font-weight: 800;
  transition: all 0.25s ease;
}

.poster-btn:hover {
  transform: none;
  color: #ffffff;
  text-shadow: 0 0 8px rgba(212, 167, 74, 0.6);
}

.poster-btn:hover::after {
  background: linear-gradient(90deg, #ffd782 0%, rgba(255, 215, 130, 0.45) 85%, transparent 100%);
  height: 2px;
  box-shadow: 0 0 6px rgba(212, 167, 74, 0.6);
}

.poster-btn:hover .btn-arrow {
  transform: translateX(4px);
  background: rgba(198, 146, 52, 0.5);
  border-color: #ffd782;
  color: #ffffff;
  box-shadow: 0 0 8px rgba(212, 167, 74, 0.5);
}

/* 右侧海报图容器与平滑渐变融合蒙层 */
.poster-image-wrap {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 72%;
  height: 100%;
  z-index: 1;
  overflow: hidden;
}

.poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center right;
  display: block;
}

/* 融合层：向左渐变羽化消除图片与背景的拼接边缘 */
.poster-blend-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* 左右翻页箭头 (TapTap 官方源码级 1:1 精确复刻) */
.poster-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 64px;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: none;
  color: rgba(255, 255, 255, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  border-radius: 8px;
  /* 鼠标移出海报时延时 0.7s 优雅淡出，避免闪烁；移入时 0s 立即淡入 */
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s cubic-bezier(0.2, 0, 0, 1) 0.7s, background-color 0.2s ease;
  padding: 0;
  user-select: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* 内部箭头图标：固定 8px x 23px，独立承载缩放与高光动效 */
.poster-nav-btn svg {
  width: 8px !important;
  height: 23px !important;
  display: block !important;
  flex-shrink: 0;
  transition: transform 0.22s cubic-bezier(0.2, 0, 0, 1), color 0.2s ease;
  pointer-events: none;
  transform-origin: center center;
}

/* 鼠标悬停在海报上：胶囊丝滑显现 */
.home-poster-banner:hover .poster-nav-btn {
  opacity: 1;
  pointer-events: auto;
  transition: opacity 0.2s cubic-bezier(0.2, 0, 0, 1) 0s, background-color 0.2s ease;
}

/* 鼠标悬停在按钮上：
   1. 黑色胶囊底托与阴影颜色绝对不变 (不放大、不加深、不跳动)
   2. 仅内部箭头放大 1.18 倍，同时色彩变为高亮纯白
*/
.poster-nav-btn:hover {
  color: #ffffff;
}

.poster-nav-btn:hover svg {
  transform: scale(1.18) !important;
}

/* 点击按压状态：仅内部箭头轻微回弹 */
.poster-nav-btn:active svg {
  transform: scale(1.05) !important;
}

.poster-nav-btn.prev {
  left: 6px;
}

.poster-nav-btn.next {
  right: 6px;
}

/* 轮播指示器 (方案 E：深渊符石晶菱 - 黄金微光透亮精修版) */
.poster-dots {
  position: absolute;
  bottom: 12px;
  left: 32px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0;
}

.poster-dot {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  transform: rotate(45deg);
  background: rgba(255, 255, 255, 0.24);
  box-shadow: none;
  border: 1px solid rgba(255, 255, 255, 0.4);
  margin: 0 5px;
  cursor: pointer;
  transition: all 0.25s ease;
}

.poster-dot:hover:not(.active) {
  background: rgba(255, 255, 255, 0.45);
  border-color: rgba(255, 255, 255, 0.75);
  transform: rotate(45deg) scale(1.08);
}

.poster-dot.active {
  width: 6.5px;
  height: 6.5px;
  transform: rotate(45deg) scale(1.08);
  background: linear-gradient(135deg, #74deda 0%, #4ea8a4 100%);
  border-color: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 6px rgba(110, 218, 214, 0.65), 0 1px 3px rgba(0, 0, 0, 0.45);
}

/* ==========================================================================
   1.5 公告与官方更新资讯板块 (Notice & Patch Notes)
   ========================================================================== */
.notices-section {
  padding: 14px 16px;
  background: linear-gradient(180deg, rgba(247, 238, 222, 0.95) 0%, rgba(235, 220, 199, 0.95) 100%);
  /*
   * 锁定最小高度 = 成品高度（实测 1440 宽 262px；加载态只有 232px）。
   * 见 `.hero-showcase` 的同款说明。
   */
  min-height: 262px;
  box-sizing: border-box;
}

.notices-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1.5px solid var(--border-soft);
  padding-bottom: 8px;
  margin-bottom: 12px;
}

.notices-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notice-tab-btn {
  padding: 5px 14px;
  font-size: 13.5px;
  font-weight: 700;
  color: #725638;
  background: rgba(143, 115, 81, 0.12);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.notice-tab-btn:hover {
  color: #2b1f15;
  background: rgba(143, 115, 81, 0.2);
}

.notice-tab-btn.active {
  background: linear-gradient(180deg, #3a2717, #24170d);
  color: #f7ebd7;
  border-color: #725638;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.notices-body-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
}

.notice-list-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notice-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(62, 42, 20, 0.05);
  border: 1px solid var(--border-faint);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}

.notice-list-item:hover {
  background: rgba(198, 146, 52, 0.12);
  border-color: #c69234;
  transform: translateX(2px);
}

.notice-tag {
  font-size: 10.5px;
  font-weight: 700;
  padding: 1.5px 6px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.notice-tag.pinned {
  background: #8b1e1e;
  color: #fff;
}

.notice-tag.patch {
  background: #c69234;
  color: #2b1f15;
}

.notice-tag.event {
  background: #3d706e;
  color: #fff;
}

.notice-tag.info {
  background: #7a634b;
  color: #f7eedf;
}

.notice-tag.gold {
  background: #d4a359;
  color: #2b1a0d;
}

.notice-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #2b1f15;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notice-item-date {
  font-size: 11px;
  color: #8a7359;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/*
 * 空态占位：
 * 公告/底栏在后台被清空时显示，避免出现一片无解释的空白区。
 * 刻意做成低对比度的提示，不与真实内容抢注意力。
 */
.notice-empty {
  padding: 18px 12px;
  text-align: center;
  font-size: 12px;
  color: #9a8a75;
  border: 1px dashed rgba(143, 115, 81, 0.35);
  border-radius: 4px;
  background: rgba(143, 115, 81, 0.05);
}

/* 官方更新公告特色速览卡 */
.patch-highlight-box {
  background: linear-gradient(135deg, rgba(62, 42, 20, 0.08) 0%, rgba(62, 42, 20, 0.03) 100%);
  border: 1.5px dashed var(--border-color);
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}

.patch-highlight-head {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin-bottom: 8px;
}

.patch-ver-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #8b0000;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
  width: 100%;
}

.patch-ver-tag {
  font-size: 10px;
  padding: 1px 5px;
  background: #8b0000;
  color: #fff;
  border-radius: 2px;
  font-weight: 700;
}

.patch-features-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.patch-feature-item {
  font-size: 12px;
  color: #4a341f;
  line-height: 1.4;
}

/* 公告跳转按钮 (方案 T1 + H1 极简加深·深木浓墨：纯文字居中浮印·彻底无框无底·通透轻盈) */
.patch-view-full-btn {
  margin-top: 8px;
  padding: 8px 0 2px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.6px;
  color: #4a301a;
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
  cursor: pointer;
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.2s ease;
}

.patch-view-full-btn .btn-arrow {
  display: inline-block;
  transition: transform 0.2s ease;
}

.patch-view-full-btn:hover {
  background: transparent;
  color: #1f140b;
  font-weight: 700;
  transform: translateY(-1px);
}

.patch-view-full-btn:hover .btn-arrow {
  transform: translateX(3px);
}

/* ==========================================================================
   2. 核心图鉴金刚区 (4大图鉴大卡片)
   ========================================================================== */

/* 专门针对核心图鉴与实用工具：方案 4 古典卷轴羽化刻度线样式 */
.section-title.section-title-ribbon {
  display: flex;
  align-items: center;
  position: relative;
  /* 适度拉长至 220px（越过第一张卡片右缘约 25px 进入间隙与第二张卡片左侧过渡带），比例最协调 */
  background: linear-gradient(90deg, rgba(250, 243, 230, 0.96) 0%, rgba(246, 236, 218, 0.78) 48%, rgba(246, 236, 218, 0.28) 80%, rgba(246, 236, 218, 0) 100%);
  border-left: 3.5px solid #b88628;
  border-top: none;
  border-right: none;
  border-bottom: 1px solid transparent;
  border-image: linear-gradient(90deg, rgba(184, 134, 40, 0.7) 0%, rgba(184, 134, 40, 0.25) 65%, transparent 96%) 1;
  border-radius: 0 4px 0 0;
  padding: 5px 14px 5px 12px;
  margin-bottom: 9px;
  width: 220px;
  box-sizing: border-box;
  box-shadow: -1px 0 4px rgba(184, 134, 40, 0.2);
}

.section-title.section-title-ribbon::before {
  display: none;
}

.section-title.section-title-ribbon > span:first-child {
  font-size: 15.5px;
  font-weight: 700;
  color: #2b1f15;
  letter-spacing: 0.5px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #2b1f15;
  padding: 4px 2px;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.section-title::before {
  content: '◆';
  color: #c69234;
  font-size: 13px;
}

.section-title-sub {
  font-size: 12px;
  font-weight: 400;
  color: #725638;
  margin-left: 4px;
}

.core-indexes-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

/*
 * 锁定外层 section 的高度，而不是 grid 本身。
 *
 * 🔴 不要写在 `.core-indexes-grid` / `.tools-grid` 上：grid 默认
 * `align-items: stretch`，min-height 会被分摊给卡片，把卡片一起拉高
 * （实测核心图鉴 188→233、实用工具 201→246，卡片明显变形）。
 * 写在 section 上，卡片保持自身高度，下方留白由 section 撑住。
 */
.home-core-indexes { min-height: 188px; }
.home-tools-section { min-height: 201px; }

.core-index-card {
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.18s ease;
  border: 1.5px solid #b8925f;
  background: linear-gradient(180deg, #efe2cb 0%, #e2ceaf 100%);
  box-shadow: 0 2px 5px rgba(50, 32, 14, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.6);
}

.core-index-card:hover {
  transform: translateY(-2px);
  border-color: #c69234;
  background: linear-gradient(180deg, #f7ecda 0%, #ecdabf 100%);
  box-shadow: 0 6px 14px rgba(50, 32, 14, 0.18), inset 0 0 10px rgba(198, 146, 52, 0.2);
}

.core-index-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(198, 146, 52, 0.18) 0%, rgba(198, 146, 52, 0.03) 55%, transparent 72%);
  border: none;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  transition: all 0.22s cubic-bezier(0.2, 0, 0, 1);
}

.core-index-icon-wrap img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  filter: drop-shadow(0 4px 6px rgba(43, 31, 21, 0.35));
  transition: all 0.22s cubic-bezier(0.2, 0, 0, 1);
}

.core-index-card:hover .core-index-icon-wrap {
  background: radial-gradient(circle, rgba(198, 146, 52, 0.30) 0%, rgba(198, 146, 52, 0.06) 60%, transparent 75%);
  border: none;
}

.core-index-card:hover .core-index-icon-wrap img {
  transform: translateY(-3px) scale(1.12);
  filter: drop-shadow(0 6px 10px rgba(43, 31, 21, 0.45));
}

.core-index-name {
  font-size: 15px;
  font-weight: 700;
  color: #2b1f15;
  margin-bottom: 3px;
}

.core-index-desc {
  font-size: 11.5px;
  color: #725638;
  line-height: 1.3;
  white-space: pre-line;
}

/* ==========================================================================
   3. 实用工具与策略模拟精选 (2x2 横向卡片)
   ========================================================================== */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.tool-banner-card {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.18s ease;
  border: 1.5px solid #b8925f;
  background: linear-gradient(180deg, #efe2cb 0%, #e2ceaf 100%);
  box-shadow: 0 2px 5px rgba(50, 32, 14, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.6);
}

.tool-banner-card:hover {
  transform: translateY(-2px);
  border-color: #c69234;
  background: linear-gradient(180deg, #f7ecda 0%, #ecdabf 100%);
  box-shadow: 0 6px 14px rgba(50, 32, 14, 0.18), inset 0 0 10px rgba(198, 146, 52, 0.2);
}

/* 实用工具图标容器 (方案 5：微光透气圆座 + 42px 大图标) */
.tool-icon-box {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(198, 146, 52, 0.22) 0%, rgba(198, 146, 52, 0.04) 58%, transparent 74%);
  border: none;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.22s cubic-bezier(0.2, 0, 0, 1);
}

.tool-icon-box img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  filter: drop-shadow(0 3px 6px rgba(43, 31, 21, 0.35));
  transition: all 0.22s cubic-bezier(0.2, 0, 0, 1);
}

.tool-banner-card:hover .tool-icon-box {
  background: radial-gradient(circle, rgba(198, 146, 52, 0.34) 0%, rgba(198, 146, 52, 0.08) 62%, transparent 76%);
}

.tool-banner-card:hover .tool-icon-box img {
  transform: translateY(-2px) scale(1.08);
  filter: drop-shadow(0 5px 9px rgba(43, 31, 21, 0.45));
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.tool-title {
  font-size: 14px;
  font-weight: 700;
  color: #2b1f15;
}

.tool-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 700;
}

.tool-tag.hot {
  background: #8b0000;
  color: #fff;
}

.tool-tag.new {
  background: #4b7a78;
  color: #fff;
}

/*
 * 角标配色：后台只允许 5 个预设键（red/green/gold/teal/gray），
 * 由 BadgeClass() 白名单映射到这些类名。新增颜色要同时改 JS 与这里。
 */
.tool-tag.is-badge-red   { background: #8b0000; color: #fff; }
.tool-tag.is-badge-green { background: #4b7a78; color: #fff; }
.tool-tag.is-badge-gold  { background: #b8860b; color: #2b1f15; }
.tool-tag.is-badge-teal  { background: #2f6f6b; color: #fff; }
.tool-tag.is-badge-gray  { background: #7a6a56; color: #fff; }

.tool-desc {
  font-size: 12px;
  color: #6b5134;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==========================================================================
   4. 契约者展示 (Hero Showcase: Q版模型小人风采展示)
   ========================================================================== */
.hero-showcase {
  padding: 16px;
  background: linear-gradient(180deg, rgba(247, 238, 222, 0.94) 0%, rgba(235, 220, 199, 0.94) 100%);
  /*
   * 锁定最小高度 = 成品高度，避免「加载态 → 有内容」时这段变高。
   * 实测（1440 宽）：加载态 200px，成品 308px。不锁的话每次进首页都会
   * 涨 108px，滚动条跟着变。取值见下方各断点。
   */
  min-height: 308px;
  box-sizing: border-box;
}

.hero-chibi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-top: 10px;
}

.hero-chibi-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(180deg, #f2e6d1 0%, #e5d2b5 100%);
  border: 1.5px solid #b8925f;
  border-radius: 8px;
  padding: 12px 6px 10px;
  transition: all 0.22s cubic-bezier(0.2, 0, 0, 1);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(50, 32, 14, 0.09), inset 0 1px 1px rgba(255, 255, 255, 0.6);
  text-decoration: none;
  box-sizing: border-box;
  overflow: hidden;
}

.hero-chibi-card:hover {
  transform: translateY(-4px);
  background: linear-gradient(180deg, #f9f0e1 0%, #ede0cb 100%);
  border-color: #c69234;
  box-shadow: 0 6px 15px rgba(50, 32, 14, 0.16);
}

/* 星级角标：固定左上角 (对齐角色图鉴品质色) */
.hero-star-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  white-space: nowrap;
  z-index: 5;
  box-shadow: 0 1px 3px rgba(43, 31, 21, 0.1);
  pointer-events: none;
}

.hero-star-badge.star-5 {
  background: rgba(255, 250, 240, 0.95);
  color: #b15d00;
  border: 1px solid #ffb64d;
}

.hero-star-badge.star-4 {
  background: rgba(253, 245, 255, 0.95);
  color: #a536aa;
  border: 1px solid #ee62f1;
}

.hero-star-badge .star-icon {
  font-size: 10px;
  line-height: 1;
}

.hero-star-badge .star-icon-img {
  width: 12px;
  height: 12px;
  object-fit: contain;
  display: inline-block;
  vertical-align: -1px;
  flex-shrink: 0;
}

/* Q版小人立绘容器与地台投影 */
.chibi-img-wrap {
  position: relative;
  width: 100%;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}

.chibi-img-wrap::after {
  content: '';
  position: absolute;
  bottom: 2px;
  width: 58px;
  height: 10px;
  background: radial-gradient(ellipse at center, rgba(62, 42, 20, 0.3) 0%, transparent 72%);
  border-radius: 50%;
  z-index: 0;
}

.chibi-img {
  height: 114px;
  max-width: 100%;
  object-fit: contain;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 4px 6px rgba(43, 31, 21, 0.2));
  transition: transform 0.22s cubic-bezier(0.2, 0, 0, 1);
}

.hero-chibi-card:hover .chibi-img {
  transform: scale(1.06);
}

.chibi-hero-name {
  font-size: 14px;
  font-weight: 700;
  color: #2b1f15;
  margin-bottom: 6px;
  letter-spacing: 0.3px;
  text-align: center;
}

/* 职业与属性双徽章 */
.chibi-tags-row {
  display: flex;
  align-items: center;
  gap: 5px;
  justify-content: center;
  flex-wrap: wrap;
}

.chibi-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.2;
}

.chibi-tag.tag-job {
  background: rgba(43, 31, 21, 0.08);
  color: #3e2a14;
  border: 1px solid rgba(143, 115, 81, 0.28);
}

.chibi-tag.tag-element {
  background: rgba(122, 154, 153, 0.16);
  color: #4b7a78;
  border: 1px solid rgba(122, 154, 153, 0.38);
}

.chibi-tag .tag-icon {
  width: 13px;
  height: 13px;
  object-fit: contain;
  display: inline-block;
  vertical-align: middle;
}

/* 特色定位标签 (方案 1：纯净无框浮印字·透气典雅) */
.hero-card-tip-pill {
  font-size: 11.5px;
  color: #5c4024;
  font-weight: 600;
  letter-spacing: 0.3px;
  margin-top: 6px;
  text-align: center;
  background: transparent;
  padding: 4px 4px 2px;
  border-radius: 0;
  border: none;
  box-shadow: none;
  width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s ease;
}

.hero-chibi-card:hover .hero-card-tip-pill {
  background: transparent;
  border: none;
  box-shadow: none;
  color: #9e6b12;
}

/* ==========================================================================
   5. 大书院交流与新人攻略 (2列)
   ========================================================================== */
.daily-guide-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  /*
   * 锁定最小高度 = 成品高度（实测 1440 宽 206px；加载态为 0 —— 整块不存在）。
   * 见 `.hero-showcase` 的同款说明。
   */
  min-height: 206px;
}

/*
 * 1200~1359 这一档：底部两栏换行成 266px，核心图鉴 203px。
 *
 * 🔴 必须写在这里（`.daily-guide-row` 基础规则之后）。
 * CSS 同权重时后写覆盖先写，之前放在文件上方会被上面的 `min-height: 206px` 盖掉，
 * 表现为「1280 宽下 homeHeight 仍会 1489 → 1563 变一次」。
 */
@media (min-width: 1200px) and (max-width: 1359px) {
  .daily-guide-row { min-height: 266px; }
  .home-core-indexes { min-height: 203px; }
}

.daily-col {
  padding: 14px;
}

.daily-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.daily-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: #e9dac0;
  border: 1.5px solid #b8925f;
  border-radius: 4px;
  font-size: 12.5px;
  box-shadow: 0 1px 3px rgba(50, 32, 14, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transition: all 0.18s ease;
}

.daily-item:hover {
  background: #f2e4cc;
  border-color: #c69234;
  box-shadow: 0 2px 6px rgba(50, 32, 14, 0.12);
}

.daily-item-name {
  font-weight: 600;
  color: #2b1f15;
  display: flex;
  align-items: center;
  gap: 6px;
}

.daily-item-badge {
  font-size: 10px;
  padding: 1px 5px;
  background: #dcbe98;
  border: 1px solid #aa8049;
  border-radius: 2px;
  color: #301d0c;
  font-weight: 600;
}

.daily-item-status {
  color: #54361a;
  font-weight: 700;
  font-size: 12.5px;
  display: flex;
  align-items: center;
}

.daily-item.is-clickable {
  cursor: pointer;
}

.daily-item.is-clickable:hover {
  background: #f5e9d3;
  border-color: #c69234;
  transform: translateY(-1px);
}

.daily-item-arrow {
  margin-left: 6px;
  font-size: 13px;
  color: #8f7351;
  font-weight: 800;
  display: inline-block;
  transition: transform 0.15s ease, color 0.15s ease;
}

.daily-item.is-clickable:hover .daily-item-arrow {
  transform: translateX(2px);
  color: #c69234;
}

/* ==========================================================================
   6. 内置精美公告详情弹窗
   ========================================================================== */
.notice-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 6, 3, 0.72);
  backdrop-filter: blur(3px);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.notice-modal-content {
  position: relative;
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px 28px;
  border-radius: 8px;
  background-color: #f7ebd7;
  border: 1.5px solid #a88452;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.notice-modal-close {
  position: absolute;
  top: 14px;
  right: 16px;
  background: none;
  border: none;
  font-size: 16px;
  color: #7d654a;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.notice-modal-close:hover {
  background: rgba(143, 115, 81, 0.2);
  color: #241607;
}

.notice-modal-header {
  border-bottom: 1px solid rgba(143, 115, 81, 0.35);
  padding-bottom: 10px;
  margin-bottom: 14px;
}

.notice-modal-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 700;
  color: #3e2a14;
}

.notice-modal-date {
  font-size: 12px;
  color: #8c7358;
}

.notice-modal-body {
  font-size: 13.5px;
  line-height: 1.7;
  color: #4a341d;
}

.notice-paragraph {
  margin: 0 0 10px;
}

/* ==========================================================================
   7. 暗黑模式全面适配 (Dark Theme Support)
   ========================================================================== */
.dark-mode .section-title,
.dark-theme .section-title {
  color: #f7ebd7;
}

.dark-mode .section-title-sub,
.dark-theme .section-title-sub {
  color: #bfa988;
}

.dark-mode .notices-section,
.dark-theme .notices-section,
.dark-mode .core-index-card,
.dark-theme .core-index-card,
.dark-mode .tool-banner-card,
.dark-theme .tool-banner-card,
.dark-mode .hero-showcase,
.dark-theme .hero-showcase,
.dark-mode .daily-col,
.dark-theme .daily-col {
  background: linear-gradient(180deg, rgba(38, 28, 19, 0.94) 0%, rgba(30, 22, 15, 0.94) 100%);
  border-color: rgba(143, 115, 81, 0.35);
}

.dark-mode .core-index-card:hover,
.dark-theme .core-index-card:hover,
.dark-mode .tool-banner-card:hover,
.dark-theme .tool-banner-card:hover {
  border-color: #d8af56;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

.dark-mode .hero-chibi-card,
.dark-theme .hero-chibi-card {
  background: rgba(43, 31, 21, 0.55);
  border-color: rgba(143, 115, 81, 0.35);
}

.dark-mode .hero-chibi-card:hover,
.dark-theme .hero-chibi-card:hover {
  background: rgba(56, 41, 28, 0.85);
  border-color: #d8af56;
}

.dark-mode .chibi-hero-name,
.dark-theme .chibi-hero-name {
  color: #ebdcc7;
}

.dark-mode .chibi-tag.tag-job,
.dark-theme .chibi-tag.tag-job {
  background: rgba(255, 255, 255, 0.08);
  color: #ebdcc7;
  border-color: rgba(143, 115, 81, 0.35);
}

.dark-mode .hero-card-tip-pill,
.dark-theme .hero-card-tip-pill {
  background: transparent;
  border: none;
  box-shadow: none;
  color: #d4b483;
}

.dark-mode .hero-chibi-card:hover .hero-card-tip-pill,
.dark-theme .hero-chibi-card:hover .hero-card-tip-pill {
  background: transparent;
  border: none;
  box-shadow: none;
  color: #ffd285;
}

.dark-mode .daily-item,
.dark-theme .daily-item {
  background: rgba(43, 31, 21, 0.55);
  border-color: rgba(143, 115, 81, 0.35);
}

.dark-mode .daily-item:hover,
.dark-theme .daily-item:hover {
  background: rgba(56, 41, 28, 0.85);
  border-color: #d8af56;
}

.dark-mode .daily-item-badge,
.dark-theme .daily-item-badge {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(143, 115, 81, 0.45);
  color: #dfceb3;
}

.dark-mode .daily-item-status,
.dark-theme .daily-item-status {
  color: #8acbc5;
}

.dark-mode .core-index-name,
.dark-theme .core-index-name,
.dark-mode .tool-title,
.dark-theme .tool-title,
.dark-mode .hero-card-name,
.dark-theme .hero-card-name,
.dark-mode .daily-item-name,
.dark-theme .daily-item-name {
  color: #f7ebd7;
}

.dark-mode .core-index-desc,
.dark-theme .core-index-desc,
.dark-mode .tool-desc,
.dark-theme .tool-desc,
.dark-mode .hero-card-job,
.dark-theme .hero-card-job,
.dark-mode .notice-item-date,
.dark-theme .notice-item-date {
  color: #bfa988;
}

.dark-mode .notice-tab-btn,
.dark-theme .notice-tab-btn {
  color: #bfa988;
  background: rgba(143, 115, 81, 0.15);
}

.dark-mode .notice-tab-btn:hover,
.dark-theme .notice-tab-btn:hover {
  color: #f7ebd7;
  background: rgba(143, 115, 81, 0.28);
}

.dark-mode .notice-tab-btn.active,
.dark-theme .notice-tab-btn.active {
  background: linear-gradient(180deg, #6a4a26, #483218);
  color: #fff4e0;
  border-color: #926f3e;
}

.dark-mode .notice-list-item,
.dark-theme .notice-list-item {
  background: rgba(143, 115, 81, 0.1);
  border-color: rgba(143, 115, 81, 0.25);
}

.dark-mode .notice-list-item:hover,
.dark-theme .notice-list-item:hover {
  background: rgba(143, 115, 81, 0.2);
  border-color: rgba(198, 146, 52, 0.5);
}

.dark-mode .notice-item-title,
.dark-theme .notice-item-title {
  color: #ebdcc3;
}

.dark-mode .patch-highlight-box,
.dark-theme .patch-highlight-box {
  background: linear-gradient(135deg, rgba(62, 42, 20, 0.25) 0%, rgba(62, 42, 20, 0.12) 100%);
  border-color: rgba(143, 115, 81, 0.4);
}

.dark-mode .patch-feature-item,
.dark-theme .patch-feature-item {
  color: #cbb898;
}

.dark-mode .patch-view-full-btn,
.dark-theme .patch-view-full-btn {
  background: transparent;
  border: none;
  box-shadow: none;
  color: #d8ba88;
}

.dark-mode .patch-view-full-btn:hover,
.dark-theme .patch-view-full-btn:hover {
  background: transparent;
  color: #fff1d6;
  font-weight: 700;
}

.dark-mode .hero-card,
.dark-theme .hero-card {
  background: rgba(43, 31, 21, 0.6);
  border-color: rgba(143, 115, 81, 0.3);
}

.dark-mode .daily-item,
.dark-theme .daily-item {
  background: rgba(143, 115, 81, 0.1);
  border-color: rgba(143, 115, 81, 0.2);
}

.dark-mode .daily-item-badge,
.dark-theme .daily-item-badge {
  background: #483523;
  border-color: #725638;
  color: #e5d2b7;
}

.dark-mode .daily-item-status,
.dark-theme .daily-item-status {
  color: #7faea9;
}

.dark-mode .notice-modal-content,
.dark-theme .notice-modal-content {
  background-color: #241a12;
  border-color: #a88452;
}

.dark-mode .notice-modal-title,
.dark-theme .notice-modal-title {
  color: #f7ebd7;
}

.dark-mode .notice-modal-body,
.dark-theme .notice-modal-body {
  color: #ebdcc3;
}

.dark-mode .notice-modal-close,
.dark-theme .notice-modal-close {
  color: #bfa988;
}

.dark-mode .notice-modal-close:hover,
.dark-theme .notice-modal-close:hover {
  color: #fff;
  background: rgba(143, 115, 81, 0.3);
}

/* ==========================================================================
   8. 移动端响应式 (≤1024px / ≤768px)
   ========================================================================== */
@media (max-width: 1024px) {
  .home-view.is-mobile {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    padding-bottom: calc(28px + var(--safe-bottom, 0px));
    scrollbar-width: none;
  }
  .home-view.is-mobile::-webkit-scrollbar {
    display: none;
  }
}

@media (max-width: 768px) {
  .home-view {
    gap: 14px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  /*
   * 移动端各段高度与桌面端不同（实测 390/768 宽同值）：
   * 公告 418、核心图鉴 339、实用工具 357、角色 544、底部两栏 419。
   * 只锁最小高度，内容更矮时用占位撑住，加载态与成品等高 ——
   * 否则「加载转圈 → 真内容」会把整页撑高 400+ px，滚动条跟着变。
   */
  .notices-section { min-height: 418px; }
  .home-core-indexes { min-height: 339px; }
  .home-tools-section { min-height: 357px; }
  .hero-showcase { min-height: 544px; }
  .daily-guide-row { min-height: 419px; }

  .home-poster-banner {
    height: 180px;
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
    touch-action: pan-y;
  }

  .poster-content {
    width: 65%;
    min-width: 0;
    padding-left: 16px;
  }

  .poster-title {
    font-size: 16px;
    margin-bottom: 4px;
  }

  .poster-desc {
    font-size: 11.5px;
    -webkit-line-clamp: 2;
  }

  .poster-btn {
    font-size: 11.5px;
    padding: 2px 0;
  }

  .poster-image-wrap {
    width: 65%;
  }

  .poster-dots {
    left: 50%;
    transform: translateX(-50%);
    bottom: 8px;
  }

  .notices-section {
    padding: 12px 10px;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
  }

  .notices-body-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .patch-highlight-box {
    order: -1;
    padding: 10px 12px;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
  }

  .patch-ver-title {
    font-size: 13px;
    flex-wrap: wrap;
  }

  .patch-feature-item {
    font-size: 11.5px;
    word-break: break-word;
  }

  .notice-list-column {
    gap: 6px;
    width: 100%;
    min-width: 0;
  }

  .notice-list-item {
    padding: 7px 8px;
    gap: 8px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .notice-item-title {
    font-size: 12.5px;
    min-width: 0;
  }

  .notice-item-date {
    font-size: 10.5px;
  }

  .core-indexes-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .tools-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .hero-chibi-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .daily-guide-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
