<template>
  <div class="navigation-wrapper" :class="{ 'is-desktop': isDesktop }">
    <!-- 1. 侧边栏模式 (默认) -->
    <template v-if="menuMode === 'side'">
      <div v-if="isOpen && !isDesktop" class="nav-mask" @click="handleClose"></div>
      <Transition :name="isDesktop ? '' : 'slide-side'">
        <div v-if="isOpen || isDesktop" class="side-panel" :class="{ 'desktop-panel': isDesktop }">
          <div v-if="!isDesktop" class="side-header">
            <div class="side-header-title">
              <h2>功能导航</h2>
              <span class="side-header-sub">深渊之歌助手</span>
            </div>
            <button class="close-btn" @click="handleClose">✕</button>
          </div>
          <div
            ref="sideBodyRef"
            class="side-body"
            :class="{ 'is-mobile': !isDesktop, 'paper-panel': !isDesktop, 'corner-nails': !isDesktop }"
            @scroll="syncSideScrollState"
          >
            <div class="side-category-title">
              <span>导航目录</span>
            </div>

            <!-- 使用 v-for 统一渲染侧边栏列表 -->
            <div
              v-for="item in navList"
              :key="item.path"
              class="side-item"
              :class="{ active: currentRoute === item.path }"
              @click="handleNavigate(item.path)"
            >
              <img :src="getImageUrl(item.icon)" class="icon-img game-sprite" />
              <span class="item-name">{{ item.name }}</span>
              <span v-if="!isDesktop" class="arrow">›</span>
            </div>
          </div>
          <span v-if="isDesktop && canScrollUp" class="side-scroll-cue side-scroll-cue--up" aria-hidden="true"></span>
          <span v-if="isDesktop && canScrollDown" class="side-scroll-cue side-scroll-cue--down" aria-hidden="true"></span>
        </div>
      </Transition>
    </template>

    <!-- 2. 底部抽屉模式 -->
    <template v-else-if="menuMode === 'bottom'">
      <div v-if="isOpen" class="nav-mask" @click="handleClose"></div>
      <Transition name="slide-bottom">
        <div v-if="isOpen" class="bottom-sheet paper-panel corner-nails">
          <div class="sheet-handle" @click="handleClose"></div>
          <div class="sheet-header">
            <h3>功能导航</h3>
            <button class="close-btn" @click="handleClose">✕</button>
          </div>
          <div class="sheet-content">
            <div class="grid-section">
              <div class="grid-category-title">导航目录</div>
              <div class="tools-grid">
                <div
                  v-for="item in navList"
                  :key="item.path"
                  class="grid-item"
                  :class="{ active: currentRoute === item.path }"
                  @click="handleNavigate(item.path)"
                >
                  <img :src="getImageUrl(item.icon)" class="icon-img game-sprite" />
                  <span class="grid-item-name">{{ item.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </template>

    <!-- 3. 顶部下拉模式 -->
    <template v-else-if="menuMode === 'top'">
      <Transition name="fade-top">
        <div v-if="isOpen" class="top-overlay" @click="handleClose">
          <div class="top-panel paper-panel" @click.stop>
            <div class="grid-section">
              <div class="grid-category-title">导航目录</div>
              <div class="tools-grid">
                <div
                  v-for="item in navList"
                  :key="item.path"
                  class="grid-item"
                  :class="{ active: currentRoute === item.path }"
                  @click="handleNavigate(item.path)"
                >
                  <img :src="getImageUrl(item.icon)" class="icon-img game-sprite" />
                  <span class="grid-item-name">{{ item.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getImageUrl } from '../utils/env.js'
import { prefetchDeferredRouteChunks } from '../router/index.js'

const props = defineProps({
  isOpen: Boolean,
  items: {
    type: Array,
    default: null
  },
  menuMode: {
    type: String,
    default: 'side' // 'side', 'bottom', 'top'
  },
  isDesktop: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['close'])

const route = useRoute()
const router = useRouter()
// 打开导航即表达跳转意图：补齐首屏空闲预取跳过的最重路由分包（/gacha）。
watch(() => props.isOpen, open => { if (open) prefetchDeferredRouteChunks() })

const currentRoute = computed(() => route.path)
const sideBodyRef = ref(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)
let sideBodyResizeObserver = null

const syncSideScrollState = () => {
  const el = sideBodyRef.value
  if (!el || !props.isDesktop) {
    canScrollUp.value = false
    canScrollDown.value = false
    return
  }

  canScrollUp.value = el.scrollTop > 1
  canScrollDown.value = (
    el.scrollHeight > el.clientHeight + 1 &&
    el.scrollTop + el.clientHeight < el.scrollHeight - 1
  )
}

// --- 统一配置导航数据 ---
const defaultNavList = [
  { name: '物品图鉴', path: '/items', icon: '/ui/item_00002.webp' },
  { name: '家具图鉴', path: '/furniture', icon: '/ui/build_roomFlower_yma9_0.webp' },
  { name: '设施功能', path: '/facilities', icon: '/ui/build_cyyd_yingdizhongxing002.webp' },
  { name: '角色图鉴', path: '/heroes', icon: '/ui/class_icon_s_zs.webp' },
  { name: '伙伴邮件', path: '/partner-mails', icon: '/ui/mail_list_new_task_pt.webp' },
  { name: '魔物图鉴', path: '/pets', icon: '/ui/colect_mon_072.webp' },
  { name: '装备图鉴', path: '/equip', icon: '/ui/item_442001.webp' },
  { name: '符石图鉴', path: '/runes', icon: '/images/Common_ItemIcon/item_19310.webp' },
  { name: '菜谱查询', path: '/recipes', icon: '/ui/item_30047.webp' },
  { name: '魔物收益', path: '/petseggs', icon: '/ui/pet_079.webp' },
  { name: '成就查询', path: '/achievement', icon: '/ui/achv_icon_adv.webp' },
  { name: '怪物图鉴', path: '/monsters', icon: '/ui/colect_mon_052.webp' },
  { name: '任务图鉴', path: '/tasks', icon: '/images/TaskPanel/task_tag1.webp' },
  { name: '事件图鉴', path: '/events', icon: '/ui/mtl1.webp' },
  { name: '副本图鉴', path: '/dungeons', icon: '/ui/map_r_fb_03.webp' },
  { name: '关卡图鉴', path: '/chapters', icon: '/ui/stage_crystal.webp' },
  { name: '兑换', path: '/exchange', icon: '/ui/map_r_fb_19.webp' },
  { name: '模拟招募', path: '/gacha', icon: '/ui/item_20004.webp' },
  { name: '配队模拟', path: '/team-sim', icon: '/ui/colect_mon_072.webp' },
  { name: '词条', path: '/glossary', icon: '/ui/buff_017.webp' },
  { name: '其他', path: '/rewards', icon: '/ui/map_r_fb_12.webp' }
]

const navList = computed(() => props.items || defaultNavList)

const handleClose = () => {
  emit('close')
}

const handleNavigate = (path) => {
  if (currentRoute.value !== path) {
    router.push(path)
  }
  handleClose()
}

onMounted(() => {
  nextTick(() => {
    syncSideScrollState()
    if ('ResizeObserver' in window && sideBodyRef.value) {
      sideBodyResizeObserver = new ResizeObserver(syncSideScrollState)
      sideBodyResizeObserver.observe(sideBodyRef.value)
    }
  })
  window.addEventListener('resize', syncSideScrollState)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncSideScrollState)
  sideBodyResizeObserver?.disconnect()
})
</script>

<style scoped>
/* 蒙版动画 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* 侧边栏过渡 */
.slide-side-enter-active, .slide-side-leave-active {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-side-enter-from, .slide-side-leave-to {
  transform: translateX(100%);
}

/* 顶部下拉过渡 */
.fade-top-enter-active, .fade-top-leave-active {
  transition: opacity 0.2s ease;
}
.fade-top-enter-from, .fade-top-leave-to {
  opacity: 0;
}
.fade-top-enter-active .top-panel, .fade-top-leave-active .top-panel {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-top-enter-from .top-panel, .fade-top-leave-to .top-panel {
  transform: translateY(-15px);
}

/* --- 基础样式 --- */
.navigation-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 非桌面（移动端/原生端）时，外层容器不参与父级弹性布局：
   其内部面板（side/bottom/top）均为 fixed 定位，height:100% 会占满
   主区域高度，导致 .app-main 被压缩为 0、页面内容不可见。 */
.navigation-wrapper:not(.is-desktop) {
  height: 0;
  flex: 0 0 0;
  overflow: visible;
}

.nav-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--modal-overlay, rgba(24, 14, 6, 0.5));
  z-index: var(--navigation-overlay-z, 6000);
}

/* --- 1. 侧边栏样式（模板 sidebar 风格） --- */
.side-panel {
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  width: 62%;
  max-width: 270px;
  z-index: var(--navigation-panel-z, 6001);
  display: flex;
  flex-direction: column;
}

.side-panel.desktop-panel {
  position: relative;
  width: 100%;
  max-width: none;
  z-index: 1;
  margin: 0;
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;

  /* 边框 4：手造皮质缝线与内衬层 (无铆钉) */
  border: 2px solid #7a5c3d;
  box-shadow: inset 0 0 0 4px rgba(223, 206, 179, 0.9), inset 0 0 0 5.5px rgba(143, 115, 81, 0.55), 2px 4px 12px rgba(0, 0, 0, 0.22);
  border-radius: 6px;
  background: #e0cfb4;
  padding: 6px;
  overflow: visible;
  box-sizing: border-box;
}

.dark-mode .side-panel.desktop-panel,
.dark-theme .side-panel.desktop-panel,
.dark-mode .side-panel.desktop-panel,
.dark-theme .side-panel.desktop-panel {
  border-color: #5c4327;
  box-shadow: inset 0 0 0 4px rgba(46, 34, 23, 0.95), inset 0 0 0 5.5px rgba(110, 85, 55, 0.55), 2px 4px 12px rgba(0, 0, 0, 0.4);
  background: #2b1f15;
}

.side-header {
  padding: 18px 16px 14px;
  background: linear-gradient(180deg, var(--wood-soft, #463424), var(--wood, #2b1f15));
  border-bottom: 3px solid var(--accent-bright, #7a9a99);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.side-header-title h2 {
  margin: 0;
  font-size: 17px;
  color: var(--on-wood-text);
  font-weight: 700;
  letter-spacing: 2px;
  text-shadow: 0 0 5px rgba(0, 0, 0, 0.8);
}

.side-header-sub {
  font-size: 11px;
  color: rgba(223, 206, 179, 0.65);
  margin-top: 3px;
  display: block;
  letter-spacing: 2px;
}

.close-btn {
  background: transparent;
  border: 1px solid rgba(223, 206, 179, 0.35);
  border-radius: 4px;
  font-size: 15px;
  color: var(--on-wood-text);
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.close-btn:hover {
  background: rgba(223, 206, 179, 0.15);
}

/* 侧栏面板：移动端铺满可用空间 */
.side-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding: 14px 12px;
  border-radius: 0;
  border: none;
  border-left: 2px solid var(--border-color, #8f7351);
  background-color: rgba(223, 206, 179, 0.94);
}
.dark-mode .side-body,
.dark-theme .side-body,
.dark-mode .side-body,
.dark-theme .side-body {
  background-color: rgba(46, 34, 23, 0.95);
}
.side-panel.desktop-panel .side-body {
  flex: 1;
  height: 100%;
  border: none;
  padding: 10px;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  box-sizing: border-box;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.side-panel.desktop-panel .side-body::-webkit-scrollbar { display: none; }

/* 屏蔽默认铜钉，保持定制暗金边框与挂件纯净质感 */
.side-panel.desktop-panel.corner-nails::before,
.side-panel.desktop-panel.corner-nails::after {
  display: none !important;
}

.side-panel.desktop-panel .side-scroll-cue {
  background: linear-gradient(to bottom, transparent, rgba(224, 207, 180, 0.95) 82%);
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}
.side-panel.desktop-panel .side-scroll-cue--up {
  background: linear-gradient(to top, transparent, rgba(224, 207, 180, 0.95) 82%);
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}

.dark-mode .side-panel.desktop-panel .side-scroll-cue,
.dark-theme .side-panel.desktop-panel .side-scroll-cue,
.dark-mode .side-panel.desktop-panel .side-scroll-cue,
.dark-theme .side-panel.desktop-panel .side-scroll-cue,
.dark-mode .side-scroll-cue,
.dark-theme .side-scroll-cue,
.dark-mode .side-scroll-cue,
.dark-theme .side-scroll-cue {
  background: linear-gradient(to bottom, transparent, rgba(43, 31, 21, 0.96) 82%) !important;
}

.dark-mode .side-panel.desktop-panel .side-scroll-cue--up,
.dark-theme .side-panel.desktop-panel .side-scroll-cue--up,
.dark-mode .side-panel.desktop-panel .side-scroll-cue--up,
.dark-theme .side-panel.desktop-panel .side-scroll-cue--up,
.dark-mode .side-scroll-cue--up,
.dark-theme .side-scroll-cue--up,
.dark-mode .side-scroll-cue--up,
.dark-theme .side-scroll-cue--up {
  background: linear-gradient(to top, transparent, rgba(43, 31, 21, 0.96) 82%) !important;
}

.dark-mode .side-scroll-cue::after,
.dark-theme .side-scroll-cue::after,
.dark-mode .side-scroll-cue::after,
.dark-theme .side-scroll-cue::after {
  border-right-color: var(--accent, #7faea9) !important;
  border-bottom-color: var(--accent, #7faea9) !important;
}

.side-scroll-cue {
  position: absolute;
  right: 2px;
  bottom: 2px;
  left: 2px;
  height: 34px;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--paper, #dfceb3) 82%);
}
.side-scroll-cue::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 8px;
  width: 7px;
  height: 7px;
  border-right: 2px solid var(--accent-ink, #557574);
  border-bottom: 2px solid var(--accent-ink, #557574);
  transform: translateX(-50%) rotate(45deg);
}
.side-scroll-cue--up {
  top: 2px;
  bottom: auto;
  background: linear-gradient(to top, transparent, var(--paper, #dfceb3) 82%);
}
.side-scroll-cue--up::after {
  top: 8px;
  bottom: auto;
  transform: translateX(-50%) rotate(225deg);
}

.side-category-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  padding: 6px 10px 8px;
  border-bottom: 2px solid var(--border-color, #8f7351);
  margin-bottom: 10px;
  font-family: var(--font-ui);
  letter-spacing: 2px;
}

.side-item {
  display: flex;
  align-items: center;
  padding: 11px 10px;
  color: var(--text-main, #3e2a14);
  cursor: pointer;
  transition: all 0.18s;
  position: relative;
  border-radius: 4px;
  border-bottom: 1px dashed var(--border-faint, rgba(143, 115, 81, 0.25));
}

.side-item:hover {
  background: var(--hover-bg, rgba(85, 117, 116, 0.14));
}

.side-item .icon-img {
  width: 28px;
  height: 28px;
  margin-right: 10px;
  flex-shrink: 0;
  border-radius: 5px;
  padding: 0;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}

.side-panel.desktop-panel .side-item .icon-img {
  width: 34px;
  height: 34px;
}

.side-item .item-name {
  font-size: 15px;
  font-weight: 600;
}

.side-item .arrow {
  margin-left: auto;
  color: var(--border-color, #8f7351);
  font-size: 16px;
  font-weight: bold;
}

.side-item.active {
  color: var(--accent-ink, #557574);
  font-weight: bold;
  background-color: rgba(122, 154, 153, 0.14);
}
.dark-mode .side-item.active {
  color: var(--accent-bright, #93b3b2);
}

.side-item.active::before {
  content: '▸';
  position: absolute;
  left: -2px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--accent-bright, #7a9a99);
  font-size: 14px;
}

/* 桌面端专属：PA 风格（深棕烫金压纹徽章） */
.side-panel.desktop-panel .side-category-title {
  font-size: 14.5px;
  font-weight: 700;
  color: #4a3419;
  padding: 6px 4px 10px;
  margin-bottom: 8px;
  letter-spacing: 2px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1.5px solid rgba(143, 115, 81, 0.45);
}
.side-panel.desktop-panel .side-category-title::after {
  content: '◆';
  font-size: 10px;
  color: #a88452;
}
.dark-mode .side-panel.desktop-panel .side-category-title {
  color: #dfceb3;
  border-bottom-color: rgba(143, 115, 81, 0.3);
}

.side-panel.desktop-panel .side-item {
  display: flex;
  align-items: center;
  padding: 9px 12px;
  margin-bottom: 4px;
  color: #4a341d;
  cursor: pointer;
  position: relative;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
  background-image: linear-gradient(to right, transparent, rgba(143, 115, 81, 0.18) 20%, rgba(143, 115, 81, 0.18) 80%, transparent);
  background-position: bottom;
  background-size: 100% 1px;
  background-repeat: no-repeat;
  border-bottom: none;
}

.side-panel.desktop-panel .side-item:hover {
  background-color: rgba(245, 237, 222, 0.6);
  transform: translateX(3px);
  color: #2b1f15;
}

.side-panel.desktop-panel .side-item.active {
  background: linear-gradient(135deg, #3e2613, #2b1a0d);
  color: #f7e6c4;
  font-weight: 700;
  box-shadow: 0 3px 8px rgba(43, 31, 21, 0.35), inset 0 1px 1px rgba(255, 215, 140, 0.3);
  border-color: rgba(212, 163, 89, 0.7);
  transform: translateX(3px);
}

.side-panel.desktop-panel .side-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, #ffd78c, #c5913e);
  box-shadow: 0 0 6px rgba(255, 215, 140, 0.7);
  transform: none; /* 关键：重置从通用 .side-item.active::before 继承的 translateY(-50%) */
}

.side-panel.desktop-panel .side-item .icon-img {
  width: 34px;
  height: 34px;
  margin-right: 12px;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
  transition: transform 0.2s ease;
}

.side-panel.desktop-panel .side-item:hover .icon-img {
  transform: scale(1.08);
}

.side-panel.desktop-panel .side-item.active .icon-img {
  filter: drop-shadow(0 2px 5px rgba(255, 215, 140, 0.45));
}

.side-panel.desktop-panel .side-item .item-name {
  font-size: 14.5px;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.side-panel.desktop-panel .side-item.active .item-name {
  color: #f7e6c4;
}

.dark-mode .side-panel.desktop-panel .side-item {
  color: #dfceb3;
  background-image: linear-gradient(to right, transparent, rgba(143, 115, 81, 0.12) 20%, rgba(143, 115, 81, 0.12) 80%, transparent);
}
.dark-mode .side-panel.desktop-panel .side-item:hover {
  background-color: rgba(60, 45, 30, 0.6);
  color: #f7e6c4;
}

/* --- 2. 底部抽屉样式 --- */
.bottom-sheet {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 100%;
  max-width: 860px;
  border-radius: 10px 10px 0 0;
  border-bottom: none;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  z-index: var(--navigation-panel-z, 6001);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.35);
  box-sizing: border-box;
}

.dark-mode .bottom-sheet,
.dark-mode .bottom-sheet {
  background: #251b13;
  border-color: rgba(168, 132, 82, 0.4);
  box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.7);
}
.dark-mode .sheet-header,
.dark-mode .sheet-header {
  border-bottom-color: rgba(168, 132, 82, 0.35);
}
.dark-mode .top-panel,
.dark-mode .top-panel {
  background: #251b13;
  border-color: rgba(168, 132, 82, 0.4);
}

.sheet-handle {
  width: 40px;
  height: 5px;
  background: var(--border-color, #8f7351);
  border-radius: 3px;
  margin: 8px auto 6px;
  cursor: pointer;
}

.sheet-header {
  padding: 8px 16px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid var(--border-color, #8f7351);
}

.sheet-header h3 {
  margin: 0;
  font-size: 15px;
  color: var(--text-main, #3e2a14);
  font-weight: 700;
  letter-spacing: 2px;
}

.sheet-content {
  padding: 12px 16px calc(24px + var(--safe-bottom, 0px));
  overflow-y: auto;
}

.grid-category-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted, #6b5134);
  margin: 14px 0 8px 4px;
  letter-spacing: 1px;
}

.grid-section:first-child .grid-category-title {
  margin-top: 0;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
@media (max-width: 400px) {
  .tools-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.grid-item {
  background: rgba(233, 220, 195, 0.7);
  border: 1px solid var(--border-soft, rgba(143, 115, 81, 0.45));
  border-radius: 5px;
  padding: 12px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.18s;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.16);
}
.dark-mode .grid-item,
.dark-mode .grid-item {
  background: rgba(48, 35, 23, 0.85);
  border-color: rgba(143, 115, 81, 0.35);
}

.grid-item:hover {
  background: rgba(233, 220, 195, 1);
  border-color: var(--accent-bright, #7a9a99);
}

.dark-mode .grid-item:hover,
.dark-mode .grid-item:hover {
  background: rgba(68, 50, 33, 0.95);
  border-color: var(--accent-bright);
}

.grid-item .icon-img {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  background: rgba(43, 31, 21, 0.08);
  border-radius: 5px;
  padding: 4px;
  object-fit: contain;
  box-sizing: border-box;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}

.grid-item-name {
  font-size: 12px;
  color: var(--text-main, #3e2a14);
  line-height: 1.3;
  font-weight: 600;
}

.grid-item.active {
  background: var(--wood, #2b1f15);
  border-color: #17100a;
}
.grid-item.active .grid-item-name {
  color: var(--on-wood-text);
  font-weight: 700;
}

/* --- 3. 顶部下拉样式 --- */
.top-overlay {
  position: fixed;
  top: calc(var(--header-height, 60px) + var(--safe-top, 0px));
  left: 0; right: 0; bottom: 0;
  background: var(--modal-overlay, rgba(24, 14, 6, 0.45));
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  z-index: var(--navigation-panel-z, 6001);
}

.top-panel {
  padding: 16px;
  border-radius: 0 0 10px 10px;
  border-top: none;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  max-height: 75vh;
  overflow-y: auto;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 767px) {
  .top-overlay {
    top: calc(var(--header-height, 60px) + 46px + var(--safe-top, 0px));
  }
}
</style>
