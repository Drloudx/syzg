<template>
  <div class="home-view" :class="{ 'is-mobile': !isDesktop }">
    <!-- 1. 顶部焦点海报轮播 (Hero Poster Banner: 洛克王国 Wiki 风格扩展色融合设计) -->
    <section
      class="home-poster-banner corner-nails"
      @mouseenter="pauseCarousel"
      @mouseleave="resumeCarousel"
    >
      <!-- 左右切换箭头 -->
      <button class="poster-nav-btn prev" @click="prevSlide" title="上一张" aria-label="上一张">‹</button>
      <button class="poster-nav-btn next" @click="nextSlide" title="下一张" aria-label="下一张">›</button>

      <!-- 轮播幻灯片容器 -->
      <div class="poster-track">
        <div
          v-for="(banner, index) in bannerList"
          :key="banner.id"
          class="poster-slide"
          :class="{ active: currentSlide === index }"
          :style="{
            backgroundColor: banner.bgColor
          }"
        >
          <!-- 左侧文字区域 -->
          <div class="poster-content">
            <div class="poster-tags">
              <span class="poster-tag" :class="banner.tagClass">{{ banner.tagText }}</span>
              <span class="poster-tag-sub">{{ banner.subTag }}</span>
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
          :class="{ active: currentSlide === index }"
          @click="setSlide(index)"
        ></div>
      </div>
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
            官方更新公告
          </button>
        </div>
        <a class="notices-more-link" @click="openAllNotices">
          <span>查看完整卷轴</span>
          <span>&gt;</span>
        </a>
      </div>

      <div class="notices-body-layout">
        <!-- 左侧：公告条目列表 -->
        <div class="notice-list-column">
          <div
            v-for="item in currentNoticesList"
            :key="item.title"
            class="notice-list-item"
            @click="openNoticeDetail(item)"
          >
            <span class="notice-tag" :class="item.tagClass">{{ item.tagText }}</span>
            <span class="notice-item-title">{{ item.title }}</span>
            <span class="notice-item-date">{{ item.date }}</span>
          </div>
        </div>

        <!-- 右侧：官方更新公告特色速览卡 -->
        <div class="patch-highlight-box">
          <div class="patch-highlight-head">
            <div class="patch-ver-title">
              <span class="patch-ver-tag">OFFICIAL</span>
              <span>游戏更新：v1.2.0「深境微光」</span>
            </div>
          </div>
          <ul class="patch-features-list">
            <li class="patch-feature-item">新 5 星秘术英雄「奇瓦」限时招募开启</li>
            <li class="patch-feature-item">主线第 8 章「无尽深渊回廊」剧情关卡解锁</li>
            <li class="patch-feature-item">魔物出战羁绊加成数值平衡性微调</li>
            <li class="patch-feature-item">修复部分装备洗练暴击词条显示异常问题</li>
          </ul>
          <button class="patch-view-full-btn" @click="openNoticeDetail(officialPatchNotice)">
            查看官方完整更新日志 &gt;
          </button>
        </div>
      </div>
    </section>

    <!-- 2. 核心图鉴金刚区 (4大图鉴大卡片) -->
    <section class="home-core-indexes">
      <div class="section-title">
        <span>核心图鉴检索</span>
        <span class="section-title-sub">高频基础资料快速直达</span>
      </div>
      <div class="core-indexes-grid">
        <div class="core-index-card paper-panel" @click="goTo('/heroes')">
          <div class="core-index-icon-wrap">
            <img :src="getImageUrl('/ui/class_icon_s_zs.webp')" alt="角色图鉴" class="game-sprite" />
          </div>
          <div class="core-index-name">角色图鉴</div>
          <div class="core-index-desc">全英雄属性、技能天赋与升星材料</div>
        </div>

        <div class="core-index-card paper-panel" @click="goTo('/equip')">
          <div class="core-index-icon-wrap">
            <img :src="getImageUrl('/ui/item_442001.webp')" alt="装备图鉴" class="game-sprite" />
          </div>
          <div class="core-index-name">装备图鉴</div>
          <div class="core-index-desc">武器防具属性、专武词条与锻造</div>
        </div>

        <div class="core-index-card paper-panel" @click="goTo('/pets')">
          <div class="core-index-icon-wrap">
            <img :src="getImageUrl('/ui/colect_mon_072.webp')" alt="魔物图鉴" class="game-sprite" />
          </div>
          <div class="core-index-name">魔物图鉴</div>
          <div class="core-index-desc">魔物羁绊技能、孵化产出与被动</div>
        </div>

        <div class="core-index-card paper-panel" @click="goTo('/runes')">
          <div class="core-index-icon-wrap">
            <img :src="getImageUrl('/images/Common_ItemIcon/item_19310.webp')" alt="符石图鉴" class="game-sprite" />
          </div>
          <div class="core-index-name">符石图鉴</div>
          <div class="core-index-desc">符石共鸣套装、词条洗练与评分</div>
        </div>
      </div>
    </section>

    <!-- 3. 实用模拟与策略工具精选 (2x2 横向卡片) -->
    <section class="home-tools-section">
      <div class="section-title">
        <span>实用模拟与策略工具</span>
        <span class="section-title-sub">深度计算与概率还原</span>
      </div>

      <div class="tools-grid">
        <div class="tool-banner-card paper-panel" @click="goTo('/sims')">
          <div class="tool-icon-box">
            <img :src="getImageUrl('/ui/colect_mon_072.webp')" alt="魔物出战搭配模拟器" class="game-sprite" />
          </div>
          <div class="tool-info">
            <div class="tool-head">
              <span class="tool-title">魔物出战搭配模拟器</span>
              <span class="tool-tag hot">HOT</span>
            </div>
            <div class="tool-desc">全角色与魔物羁绊加成实时计算，智能推导最优方案</div>
          </div>
        </div>

        <div class="tool-banner-card paper-panel" @click="goTo('/gacha')">
          <div class="tool-icon-box">
            <img :src="getImageUrl('/ui/item_20004.webp')" alt="模拟招募抽卡" class="game-sprite" />
          </div>
          <div class="tool-info">
            <div class="tool-head">
              <span class="tool-title">模拟招募抽卡</span>
              <span class="tool-tag new">NEW</span>
            </div>
            <div class="tool-desc">真实还原原版抽卡概率、卡池保底机制与立绘动画</div>
          </div>
        </div>

        <div class="tool-banner-card paper-panel" @click="goTo('/petseggs')">
          <div class="tool-icon-box">
            <img :src="getImageUrl('/ui/pet_079.webp')" alt="魔物收益速查" class="game-sprite" />
          </div>
          <div class="tool-info">
            <div class="tool-head">
              <span class="tool-title">魔物收益速查</span>
            </div>
            <div class="tool-desc">各阶段魔物蛋孵化时间、预计产出与金币收益全览</div>
          </div>
        </div>

        <div class="tool-banner-card paper-panel" @click="goTo('/recipes')">
          <div class="tool-icon-box">
            <img :src="getImageUrl('/ui/item_30047.webp')" alt="营地菜谱查询器" class="game-sprite" />
          </div>
          <div class="tool-info">
            <div class="tool-head">
              <span class="tool-title">营地菜谱查询器</span>
            </div>
            <div class="tool-desc">食材最佳搭配组合、饱食度收益与战斗增益 Buff</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. 强力英雄与推荐展示 (Hero Showcase) -->
    <section class="hero-showcase paper-panel corner-nails">
      <div class="section-title">
        <span>深渊学者推荐 · 核心英雄展示</span>
        <span class="section-title-sub">当前版本热门养成角色</span>
      </div>
      <div class="hero-cards-row">
        <div
          v-for="hero in featuredHeroes"
          :key="hero.name"
          class="hero-card"
          @click="goTo('/heroes')"
        >
          <div class="hero-card-img-wrap">
            <img :src="getImageUrl(hero.image)" class="hero-card-img" :alt="hero.name" loading="lazy" />
            <span class="hero-card-rarity">{{ hero.stars }}</span>
          </div>
          <div class="hero-card-body">
            <span class="hero-card-name">{{ hero.name }}</span>
            <span class="hero-card-job">{{ hero.role }}</span>
            <span class="hero-card-tip">{{ hero.tip }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 5. 今日日常与互助备忘 (2列) -->
    <section class="daily-guide-row">
      <div class="daily-col paper-panel corner-nails">
        <div class="section-title">
          <span>日常备忘与刷新指南</span>
        </div>
        <div class="daily-list">
          <div class="daily-item">
            <span class="daily-item-name">
              <span class="daily-item-badge">刷新</span>
              每日 05:00
            </span>
            <span class="daily-item-status">免费招募、公会签到与扫荡次数</span>
          </div>
          <div class="daily-item">
            <span class="daily-item-name">
              <span class="daily-item-badge">结算</span>
              周一 05:00
            </span>
            <span class="daily-item-status">深渊竞速榜单与挑战赛积分奖励</span>
          </div>
          <div class="daily-item">
            <span class="daily-item-name">
              <span class="daily-item-badge">工坊</span>
              设施制造
            </span>
            <span class="daily-item-status">锻造台与营地烹饪具有每日产出上限</span>
          </div>
        </div>
      </div>

      <div class="daily-col paper-panel corner-nails">
        <div class="section-title">
          <span>大书院互助与数据勘误</span>
        </div>
        <div class="daily-list">
          <div class="daily-item">
            <span class="daily-item-name">
              <span class="daily-item-badge">交流</span>
              学者讨论区
            </span>
            <span class="daily-item-status">全站学者自由发帖，交流配队心得</span>
          </div>
          <div class="daily-item">
            <span class="daily-item-name">
              <span class="daily-item-badge">勘误</span>
              数据校准
            </span>
            <span class="daily-item-status">遇到数值错误或文本缺失可在讨论区反馈</span>
          </div>
          <div class="daily-item">
            <span class="daily-item-name">
              <span class="daily-item-badge">群号</span>
              大书院群
            </span>
            <span class="daily-item-status">交流群 963318625，探索深渊秘境</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 6. 内置精美公告详情弹窗 -->
    <div
      v-if="activeModalNotice"
      class="notice-modal-backdrop"
      @click.self="activeModalNotice = null"
    >
      <div class="notice-modal-content paper-panel corner-nails">
        <button class="notice-modal-close" @click="activeModalNotice = null" title="关闭">✕</button>
        <div class="notice-modal-header">
          <h3 class="notice-modal-title">{{ activeModalNotice.title }}</h3>
          <span class="notice-modal-date">发布时间：{{ activeModalNotice.date }}</span>
        </div>
        <div class="notice-modal-body">
          <p v-for="(p, i) in activeModalNoticeParagraphs" :key="i" class="notice-paragraph">{{ p }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { getImageUrl } from '../utils/env.js'

const router = useRouter()

// 屏幕宽度判断，移动端适配
const isDesktop = ref(typeof window !== 'undefined' ? window.innerWidth >= 768 : true)
const updateDesktopState = () => {
  if (typeof window !== 'undefined') {
    isDesktop.value = window.innerWidth >= 768
  }
}

// 洛克王国 Wiki 风格的海报列表：图片放右侧，左侧根据图片边缘与画面主调平滑向左扩展（方案 B：画面主调提亮系）
const bannerList = [
  {
    id: 1,
    title: '探求深渊秘境的学者殿堂',
    desc: '全新主线第8章「无尽回廊」正式开放！5星火系秘术英雄【奇瓦】限时招募降临，专属符石秘境与限时讨伐活动全面开启。',
    tagText: '官方版本焦点',
    tagClass: 'gold',
    subTag: 'v1.2.0「深境微光」',
    btnText: '查看版本更新详情',
    image: '/images/banners/home-banner-1.jpg',
    bgColor: '#1a3832', // 微透碧绿与林风深调，呼应奇瓦草地大森林，告别发灰草泥色
    blendStart: 'rgba(26, 56, 50, 0.95)',
    action: 'notice',
    noticeTitle: '官方版本更新：v1.2.0「深境微光」'
  },
  {
    id: 2,
    title: '限定角色招募 · 双UP概率提升',
    desc: '掌握禁忌火焰秘术的神秘学者与深渊伙伴！全套技能天赋数据、专属符石词条推荐与配队演算模拟器已同步上线。',
    tagText: '限定招募进行中',
    tagClass: 'red',
    subTag: 'UP 卡池开启',
    btnText: '前往模拟抽卡',
    image: '/images/banners/home-banner-2.jpg',
    bgColor: '#3a2416', // 暗金暖木檀色，提亮暗部，契约羊皮纸与金光角色辉映
    blendStart: 'rgba(58, 36, 22, 0.95)',
    action: 'route',
    path: '/gacha'
  },
  {
    id: 3,
    title: '魔物出战被动搭配模拟系统',
    desc: '全新升级！移动端紧凑自选与四列选择器，实时穷举推导最佳魔物出战组合，助您轻松打通深渊高难关卡。',
    tagText: '学者实用工具',
    tagClass: 'teal',
    subTag: '配队演算升级',
    btnText: '立即体验模拟工具',
    image: '/images/banners/home-banner-3.jpg',
    bgColor: '#382216', // 温暖营地木屋红木色，呼应右侧营地树木与帐篷的温馨探险感
    blendStart: 'rgba(56, 34, 22, 0.95)',
    action: 'route',
    path: '/sims'
  }
]

// 轮播海报逻辑
const currentSlide = ref(0)
let slideTimer = null

const nextSlide = () => {
  currentSlide.value = (currentSlide.value + 1) % bannerList.length
}

const prevSlide = () => {
  currentSlide.value = (currentSlide.value - 1 + bannerList.length) % bannerList.length
}

const setSlide = (idx) => {
  currentSlide.value = idx
}

const startCarousel = () => {
  stopCarousel()
  slideTimer = setInterval(nextSlide, 6000)
}

const stopCarousel = () => {
  if (slideTimer) {
    clearInterval(slideTimer)
    slideTimer = null
  }
}

const pauseCarousel = () => stopCarousel()
const resumeCarousel = () => startCarousel()

const handleBannerAction = (banner) => {
  if (banner.action === 'route' && banner.path) {
    router.push(banner.path)
  } else if (banner.action === 'notice') {
    openNoticeDetail(officialPatchNotice)
  }
}

// 快捷页面跳转
const goTo = (path) => {
  router.push(path)
}

// 公告标签与数据
const activeNoticeTab = ref('site')

const noticesData = {
  site: [
    {
      title: '深渊大书院站点免责声明与服务协议',
      date: '2026-09-19',
      tagText: '置顶',
      tagClass: 'pinned',
      content: '深渊大书院为非盈利性质的玩家自发资料库与攻略整理工具，所有素材与文本版权归原游戏制作组所有。\n本站所有算法模拟器均为基于客户端拆解数据进行的前端重构，旨在提供便捷的配队与数值参考。'
    },
    {
      title: '相关模拟（魔物配队）移动端与算法全面升级',
      date: '2026-10-29',
      tagText: '功能',
      tagClass: 'patch',
      content: '魔物搭配模拟系统完成重大重构！支持自选队伍、自选角色与魔物被动过滤。\n移动端抽屉式选人交互优化完毕，提升手机端排布与浏览体验。'
    },
    {
      title: '客户端解构数据同步与词条修正',
      date: '2026-10-28',
      tagText: '数据',
      tagClass: 'event',
      content: '已将最新客户端解析表与 Wiki 数据对齐，修正了部分装备在洗练状态下的暴击显示异常，补全魔物技能缺失字段。'
    },
    {
      title: '大书院学者讨论区交流准则',
      date: '2026-10-25',
      tagText: '社区',
      tagClass: 'info',
      content: '欢迎各位探求者在讨论区交流游戏体验、魔物孵化收益与阵容心得。\n请自觉遵守讨论区发言礼仪，共建友善、客观的游戏研究氛围。'
    }
  ],
  official: [
    {
      title: 'v1.2.0「深境微光」版本正式实装与停服维护',
      date: '2026-10-28',
      tagText: '版本',
      tagClass: 'pinned',
      content: '亲爱的探求者：\n游戏已于 10 月 28 日完成 v1.2.0 停机维护更新。\n【更新内容】\n1. 全新 5 星秘术英雄「奇瓦」限定招募开启；\n2. 开放主线章节第 8 章「无尽深渊回廊」剧情关卡与相关挑战副本；\n3. 优化部分装备洗练词条描述与魔物羁绊加成数值。'
    },
    {
      title: '关于部分机型闪退与战斗结算延迟的修复通知',
      date: '2026-10-26',
      tagText: '修复',
      tagClass: 'patch',
      content: '技术团队已完成对部分机型内存占用过高导致偶发闪退的紧急补丁更新，请探求者重新启动客户端加载资源包。'
    },
    {
      title: '【开发组通信】第2期：后续养成系统减负前瞻',
      date: '2026-10-20',
      tagText: '前瞻',
      tagClass: 'event',
      content: '开发组正在推进角色升级与技能强化的材料减负优化，预计在下个版本全面实装，同时优化委托任务的扫荡产出。'
    }
  ]
}

const officialPatchNotice = {
  title: '游戏更新日志：v1.2.0「深境微光」',
  date: '2026-10-28',
  tagText: '官方',
  tagClass: 'pinned',
  content: '官方完整更新日志：\n- 新 5 星秘术英雄「奇瓦」限时招募开启；\n- 主线第 8 章「无尽深渊回廊」剧情关卡解锁；\n- 魔物出战羁绊加成数值平衡性微调；\n- 修复部分装备洗练暴击词条显示异常问题。\n\n大书院数据已同步对齐新版本，探求者可在图鉴与模拟工具中查看最新数值！'
}

const currentNoticesList = computed(() => noticesData[activeNoticeTab.value] || [])

// 弹窗状态
const activeModalNotice = ref(null)

const activeModalNoticeParagraphs = computed(() => {
  if (!activeModalNotice.value?.content) return []
  return activeModalNotice.value.content.split('\n')
})

const openNoticeDetail = (item) => {
  activeModalNotice.value = item
}

const openAllNotices = () => {
  activeModalNotice.value = {
    title: '大书院公报总览',
    date: '2026-10-30',
    content: '欢迎查阅大书院历史公报！\n本站所有更新、数据修正与算法优化均会在第一时间公布。\n如有疑问或发现数据偏差，欢迎在右侧讨论区或大书院交流群联系我们。'
  }
}

// 核心英雄展示数据（原版卡片规格）
const featuredHeroes = [
  {
    name: '奇瓦',
    role: '秘术 · 火属性',
    stars: '★★★★★ 5星',
    tip: '群体高爆发 / 灼烧伤害',
    image: '/images/chara/l/chara001_0.webp'
  },
  {
    name: '阿娜洛洁',
    role: '支援 · 水属性',
    stars: '★★★★★ 5星',
    tip: '全队治疗 / 驱散负面效果',
    image: '/images/chara/l/chara002_1.webp'
  },
  {
    name: '菲莉娜',
    role: '近卫 · 风属性',
    stars: '★★★★ 4星',
    tip: '攻防一体 / 破甲反击',
    image: '/images/chara/l/chara005_0.webp'
  },
  {
    name: '米拉贝尔',
    role: '突袭 · 火属性',
    stars: '★★★★★ 5星',
    tip: '单体刺杀 / 弱点暴击收割',
    image: '/images/chara/l/chara007_0.webp'
  }
]

onMounted(() => {
  startCarousel()
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

/* ==========================================================================
   1. 首页焦点海报轮播 (洛克王国 Wiki 风格：右图扩展色融合成背景)
   ========================================================================== */
.home-poster-banner {
  position: relative;
  height: 240px;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid var(--border-color);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  background: #1e140b;
  user-select: none;
}

.poster-track {
  position: relative;
  width: 100%;
  height: 100%;
}

.poster-slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  transform: scale(1.015);
  display: flex;
  align-items: center;
  overflow: hidden;
}

.poster-slide.active {
  opacity: 1;
  visibility: visible;
  transform: scale(1);
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
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.poster-btn-wrap {
  margin-top: 4px;
}

.poster-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: linear-gradient(180deg, #c69234, #91681b);
  color: #1a1005;
  font-size: 12.5px;
  font-weight: 700;
  border-radius: 4px;
  border: 1px solid #e2be74;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
}

.poster-btn:hover {
  background: linear-gradient(180deg, #ddaa44, #a47720);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(198, 146, 52, 0.4);
}

.poster-btn .btn-arrow {
  font-family: monospace;
  font-weight: 800;
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

/* 左右翻页箭头 */
.poster-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 40px;
  background: rgba(20, 13, 7, 0.65);
  border: 1px solid rgba(198, 146, 52, 0.5);
  color: #f7ebd7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  cursor: pointer;
  z-index: 10;
  border-radius: 4px;
  transition: all 0.15s ease;
  opacity: 0.45;
}

.home-poster-banner:hover .poster-nav-btn {
  opacity: 1;
}

.poster-nav-btn:hover {
  background: rgba(198, 146, 52, 0.85);
  color: #1a1005;
  border-color: #f7ebd7;
}

.poster-nav-btn.prev {
  left: 10px;
}

.poster-nav-btn.next {
  right: 10px;
}

/* 底部指示圆点 */
.poster-dots {
  position: absolute;
  bottom: 10px;
  left: 32px;
  z-index: 10;
  display: flex;
  gap: 6px;
}

.poster-dot {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  transition: all 0.2s ease;
}

.poster-dot.active {
  width: 22px;
  background: #c69234;
  box-shadow: 0 0 6px rgba(198, 146, 52, 0.8);
}

/* ==========================================================================
   1.5 公告与官方更新资讯板块 (Notice & Patch Notes)
   ========================================================================== */
.notices-section {
  padding: 14px 16px;
  background: linear-gradient(180deg, rgba(247, 238, 222, 0.95) 0%, rgba(235, 220, 199, 0.95) 100%);
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

.notices-more-link {
  font-size: 12px;
  color: #725638;
  cursor: pointer;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.notices-more-link:hover {
  color: #c69234;
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
  background: #8b0000;
  color: #fff;
}

.notice-tag.patch {
  background: #c69234;
  color: #2b1f15;
}

.notice-tag.event {
  background: #4b7a78;
  color: #fff;
}

.notice-tag.info {
  background: #8f7351;
  color: #fff;
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

/* 官方更新公告特色速览卡 */
.patch-highlight-box {
  background: linear-gradient(135deg, rgba(62, 42, 20, 0.08) 0%, rgba(62, 42, 20, 0.03) 100%);
  border: 1.5px dashed var(--border-color);
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.patch-highlight-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.patch-ver-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #8b0000;
  display: flex;
  align-items: center;
  gap: 6px;
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
  display: flex;
  align-items: flex-start;
  gap: 6px;
  line-height: 1.35;
}

.patch-feature-item::before {
  content: '✔';
  color: #4b7a78;
  font-size: 11px;
  font-weight: 700;
  margin-top: 1px;
}

.patch-view-full-btn {
  margin-top: 10px;
  padding: 6px 0;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #2b1f15;
  background: rgba(198, 146, 52, 0.25);
  border: 1px solid #c69234;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.patch-view-full-btn:hover {
  background: rgba(198, 146, 52, 0.45);
}

/* ==========================================================================
   2. 核心图鉴金刚区 (4大图鉴大卡片)
   ========================================================================== */
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

.core-index-card {
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.18s ease;
  border: 2px solid var(--border-color);
  background: linear-gradient(180deg, rgba(250, 243, 230, 0.94) 0%, rgba(235, 220, 199, 0.94) 100%);
}

.core-index-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25), inset 0 0 20px rgba(198, 146, 52, 0.18);
  border-color: #c69234;
}

.core-index-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(62, 42, 20, 0.08);
  border: 1.5px solid var(--border-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.core-index-icon-wrap img {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25));
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
  border: 1.5px solid var(--border-color);
  background: linear-gradient(180deg, rgba(247, 238, 222, 0.94) 0%, rgba(235, 220, 199, 0.94) 100%);
}

.tool-banner-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  border-color: #c69234;
}

.tool-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  background: linear-gradient(180deg, #44301d, #2b1d11);
  border: 1px solid #725638;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

.tool-icon-box img {
  width: 28px;
  height: 28px;
  object-fit: contain;
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

.tool-desc {
  font-size: 12px;
  color: #6b5134;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==========================================================================
   4. 强力英雄展示 (Hero Showcase)
   ========================================================================== */
.hero-showcase {
  padding: 16px;
  background: linear-gradient(180deg, rgba(247, 238, 222, 0.94) 0%, rgba(235, 220, 199, 0.94) 100%);
}

.hero-cards-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 10px;
}

.hero-card {
  border: 1.5px solid var(--border-soft);
  border-radius: 6px;
  overflow: hidden;
  background: rgba(223, 206, 179, 0.45);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.hero-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.25);
  border-color: #c69234;
}

.hero-card-img-wrap {
  width: 100%;
  height: 140px;
  background: radial-gradient(circle at center, #6b4c2b, #2b1d11);
  position: relative;
  overflow: hidden;
}

.hero-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  transition: transform 0.3s ease;
}

.hero-card:hover .hero-card-img {
  transform: scale(1.05);
}

.hero-card-rarity {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(20, 14, 9, 0.85);
  border: 1px solid #c69234;
  color: #f7a028;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
}

.hero-card-body {
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hero-card-name {
  font-size: 14px;
  font-weight: 700;
  color: #2b1f15;
}

.hero-card-job {
  font-size: 11px;
  color: #725638;
}

.hero-card-tip {
  font-size: 11px;
  color: #4b7a78;
  font-weight: 600;
  margin-top: 4px;
}

/* ==========================================================================
   5. 今日日替与日常指南 (2列)
   ========================================================================== */
.daily-guide-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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
  background: rgba(62, 42, 20, 0.05);
  border: 1px solid var(--border-faint);
  border-radius: 4px;
  font-size: 12.5px;
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
  background: #dfceb3;
  border: 1px solid #8f7351;
  border-radius: 2px;
  color: #3e2a14;
}

.daily-item-status {
  color: #4b7a78;
  font-weight: 700;
  font-size: 11.5px;
}

/* ==========================================================================
   6. 内置精美公告详情弹窗
   ========================================================================== */
.notice-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 6, 3, 0.72);
  backdrop-filter: blur(3px);
  z-index: 1000;
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

.dark-mode .notices-more-link,
.dark-theme .notices-more-link {
  color: #bfa988;
}

.dark-mode .notices-more-link:hover,
.dark-theme .notices-more-link:hover {
  color: #f7ebd7;
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
  background: #4a341e;
  border-color: #8c6a3d;
  color: #ebdcc3;
}

.dark-mode .patch-view-full-btn:hover,
.dark-theme .patch-view-full-btn:hover {
  background: #5d4227;
  color: #fff2db;
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
   8. 移动端响应式 (≤768px)
   ========================================================================== */
@media (max-width: 768px) {
  .home-view {
    gap: 14px;
  }

  .home-poster-banner {
    height: 180px;
  }

  .poster-content {
    width: 65%;
    min-width: 0;
    padding-left: 20px;
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
    font-size: 11px;
    padding: 4px 10px;
  }

  .poster-image-wrap {
    width: 65%;
  }

  .poster-dots {
    left: 20px;
    bottom: 6px;
  }

  .notices-body-layout {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .patch-highlight-box {
    order: -1;
  }

  .core-indexes-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .tools-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .hero-cards-row {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .daily-guide-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
