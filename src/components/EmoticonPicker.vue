<template>
  <!--
    表情选择器：挂在发表区的图标按钮上方（`UiPopover` 自己负责定位、Esc / 点外部关闭、
    覆盖层登记与滚动跟随），面板内分「黄豆 emoji」与「深渊之歌第1弹」两个页签。

    为什么用 `UiPopover` 而不是自建浮层：UI 组件库明确要求选择层复用 `UiPopover`
    （自带羊皮纸面板、覆盖层登记、窗外/Esc 关闭、窗口变化重新定位），
    页面/业务组件不得再手写低层级浮层。

    刻意**不点一下关一次**：发表区常常要连发几个表情，选完留在面板里更顺手；
    关闭靠 Esc、× 或点面板外。
  -->
  <UiPopover
    :visible="visible"
    :anchor="anchor"
    id="emoticonPicker"
    title="表情"
    :width="PICKER_WIDTH"
    align="start"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <div class="emoticon-body">
      <!--
        最近使用：只有黄豆（`kind === 'face'`）有，贴纸包不显示（用户要求，与 QQ/微信一致）。

        🔴 **无记录时整块不渲染**（连标题都不出现）。曾经为了让"切包时面板不跳"而给这块
        留了固定高度占位，结果没记录时「所有表情」上方凭空多出一道空白，
        用户直接指出来了。现在**面板本身已定高**（见下方 CSS），切包高度天然不变，
        不需要再靠占位，所以这里可以老老实实按"有才显示"渲染。
      -->
      <template v-if="showRecent && recentItems.length">
        <p class="emoticon-section-title">最近使用</p>
        <div class="emoticon-grid emoticon-grid--face emoticon-grid--recent">
          <button
            v-for="item in recentItems"
            :key="`recent-${item.key}`"
            type="button"
            class="emoticon-cell"
            :data-emoticon-key="item.key"
            :title="item.name"
            :aria-label="item.ariaName"
            @click="doPick(item)"
          >
            <img
              v-if="!failed.has(item.key)"
              :src="getImageUrl(item.path)"
              :alt="item.name"
              loading="lazy"
              decoding="async"
              data-image-fallback="custom"
              @error="markFailed(item.key)"
            />
            <span v-else class="emoticon-missing">{{ item.name }}</span>
          </button>
        </div>
        <p class="emoticon-section-title">所有表情</p>
      </template>

      <!--
        整体滚动（用户要求）：**不设高度、不自己滚**，让内容自然撑开，
        由「最近使用 + 所有表情」一起决定面板高度，滚动交给面板本身。
        这样才和微信一致：鼠标在哪都能滚，而不是只有指到网格里才滚。
      -->
      <div class="emoticon-grid" :class="`emoticon-grid--${activeKind}`">
        <button
          v-for="item in activeItems"
          :key="item.key"
          type="button"
          class="emoticon-cell"
          :data-emoticon-key="item.key"
          :title="item.name"
          :aria-label="item.ariaName"
          @click="doPick(item)"
        >
          <!--
            `data-image-fallback="custom"` 是必须的：`App.vue` 的全局图片 error 处理是
            **捕获阶段**的，会先把失败的 `<img>` 换成 `/ui/visibility-off.svg` 并
            `stopImmediatePropagation()`，本组件的 `@error` 就不会执行——那样一格坏图会伪装成
            "眼睛被划掉"的通用占位，看不出是哪个表情缺素材。这里自己处理，直接显示表情名。
          -->
          <img
            v-if="!failed.has(item.key)"
            :src="getImageUrl(item.path)"
            :alt="item.name"
            loading="lazy"
            decoding="async"
            data-image-fallback="custom"
            @error="markFailed(item.key)"
          />
          <span v-else class="emoticon-missing">{{ item.name }}</span>
        </button>
      </div>
    </div>

    <!--
      底部包切换（用户要求做成微信那样）：以「该包首图」当图标，比文字页签更直观，
      也不占正文高度。用 `role="tablist"` 保留键盘/无障碍语义。
    -->
    <div class="emoticon-switch" role="tablist" aria-label="表情包">
      <button
        v-for="pack in packTabs"
        :key="pack.id"
        type="button"
        role="tab"
        class="emoticon-switch__btn"
        :class="{ 'is-active': activePack === pack.id }"
        :aria-selected="activePack === pack.id ? 'true' : 'false'"
        :title="pack.label"
        :data-pack-id="pack.id"
        @click="activePack = pack.id"
      >
        <img :src="getImageUrl(pack.icon)" :alt="pack.label" loading="lazy" decoding="async" />
      </button>
    </div>
  </UiPopover>
</template>

<script setup>
import { computed, ref } from 'vue'
import UiPopover from './ui/UiPopover.vue'
import { EMOTICON_ITEMS, EMOTICON_PACKS } from '../config/emoticons.js'
import { getImageUrl } from '../utils/env.js'
import { RECENT_KIND, pushRecent, readRecentKeys, resolveRecent, writeRecentKeys } from '../utils/emoticonRecent.js'

/** 面板宽度：桌面 352px（黄豆 8 列、贴纸 5 列）；`UiPopover` 在窄屏会自己收窄到视口内 */
const PICKER_WIDTH = 352

defineProps({
  visible: { type: Boolean, default: false },
  /** 定位锚点（发表区那个图标按钮的 DOM） */
  anchor: { type: Object, default: null }
})

const emit = defineEmits(['update:visible', 'pick'])

/**
 * 底部切换器用的包清单：图标取**该包的代表表情**（微信就是这么做的，比文字页签直观），
 * 保留 `label` 作 title/aria。
 *
 * 🔴 黄豆包**不能取 `items[0]`**：首项是「呵呵」，那个表情看着像在"斜眼/无奈"，
 * 当切换器图标容易被误解成面板状态。用「哈哈」（`ICON_KEY`）——最中性、一眼就是"表情"。
 * 其它包仍取首图（贴纸包首图本来就有品牌感）。
 */
const FACE_ICON_KEY = 'tb_haha'
const packTabs = EMOTICON_PACKS.map((pack) => ({
  id: pack.id,
  label: pack.label,
  kind: pack.kind,
  icon: (pack.kind === RECENT_KIND && pack.items.find(i => i.key === FACE_ICON_KEY)?.path)
    || pack.items[0]?.path
    || ''
}))

/** 记住上次看的页签：连续发表时不必每次重新点一遍 */
const activePack = ref(EMOTICON_PACKS[0]?.id || '')

const activeItems = computed(
  () => EMOTICON_PACKS.find((pack) => pack.id === activePack.value)?.items || []
)
/** 两类表情的格子尺寸不同（小脸密排、贴纸给大格），由目录表的 kind 决定 */
const activeKind = computed(
  () => EMOTICON_PACKS.find((pack) => pack.id === activePack.value)?.kind || RECENT_KIND
)

/** 加载失败的格子（按表情名记），显示表情名而不是通用占位图标 */
const failed = ref(new Set())
function markFailed(key) {
  const next = new Set(failed.value)
  next.add(key)
  failed.value = next
}

/**
 * 「最近使用」只服务黄豆页签（用户要求，与 QQ / 微信一致）——贴纸数量少且各有品牌感，
 * 不需要"最近"这一层。判据用 `kind`，不用包 id，将来新增黄豆包也能自动享受。
 */
const showRecent = computed(() => activeKind.value === RECENT_KIND)

/** 目录索引：解析本机记录时要按 key 找项，同时把失效的 key 过滤掉 */
const itemByKey = new Map(EMOTICON_ITEMS.map(item => [item.key, item]))

/** 本机记录（key 顺序，新 → 旧）。挂载时读一次即可，pick 时由 doPick 同步写回。 */
const recentKeys = ref(readRecentKeys())

/**
 * 🔴 只保留黄豆项。`kind` 这一道**读的时候也要过**，不只是写的时候：
 * 早期版本没有写侧判断，已经把贴纸写进过记录；只在写侧修，老数据会一直留在
 * 「最近使用」里（用户看到的正是这个）。
 */
const recentItems = computed(() => resolveRecent(recentKeys.value, itemByKey, { kind: RECENT_KIND }))

/**
 * 选表情：先写「最近使用」再冒泡给发表区插入，两件事互不阻塞。
 *
 * 🔴 **只有黄豆（`kind === 'face'`）才记**。贴纸不进「最近使用」（用户要求，与微信一致）：
 * 那两排贴纸本来就在底部切换器里一眼可见，混进"最近"反而挤掉真正常用的黄豆。
 */
function doPick(item) {
  if (item.kind === RECENT_KIND) {
    recentKeys.value = pushRecent(recentKeys.value, item.key)
    writeRecentKeys(recentKeys.value)
  }
  emit('pick', item)
}
</script>

<style scoped>
/*
 * 版式（微信那样）：内容是「最近使用 + 所有表情」，底下是**包切换条**。
 *
 * 🔴 **整体滚动**（用户要求）：`UiPopover` 面板自带 `overflow: auto`，
 * 所以这里**不再让网格自己滚**。以前是网格内部滚动，导致：
 *   ① 鼠标必须指进网格区域才能滚（在标题/切换条上滚不动），与微信不一致；
 *   ② 面板内出现第二个滚动容器，切包时内部滚动位置还要单独维护。
 * 现在内容自然撑开 → 超出面板最大高时由**面板**统一滚。
 */
/*
 * 内容区：占满切换条以外的剩余高度，**自己滚**（`min-height: 0` 是 flex 子项能收缩的前提）。
 * 鼠标在内容区任意位置滚轮都能带动，不需要指进网格里。
 */
.emoticon-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* 滚动条始终占位，内容不会因它出现/消失而左右跳 */
  scrollbar-gutter: stable;
}

.emoticon-grid {
  display: grid;
  gap: 4px;
  margin-top: 8px;
  align-content: start;
}

/* ── 「最近使用」分区 ── */

/* 分区小标题：与面板标题层级区分开，用弱色小字 */
.emoticon-section-title {
  margin: 10px 0 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text-muted);
}

/*
 * 最近使用是**固定一行**（7 列 = 面板一行放得下的格数）。
 * 它只有一行，不参与滚动；`padding-right` 与下面的网格对齐，避免两栏左边缘错开。
 */
.emoticon-grid--recent {
  grid-template-columns: repeat(7, 1fr);
  margin-top: 6px;
}

.emoticon-grid--face {
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
}

.emoticon-grid--sticker {
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
}

/* ── 底部包切换条 ── */

/*
 * 切换条是**独立的一段**（`flex: 0 0 auto`），不参与滚动、不浮在内容上：
 * 内容区只占它以外的高度，所以表情永远不会滚到它下面（sticky 版会重叠，用户反馈"没固定"）。
 */
.emoticon-switch {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-soft, rgba(143, 115, 81, 0.35));
}

/*
 * 图标按钮：用「该包首图」当图标。选中态用与其它选中项一致的强调色描边 + 浅底，
 * 不额外引入新颜色（主题变量即可，暗色模式自动跟随）。
 */
.emoticon-switch__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.emoticon-switch__btn:hover {
  background: var(--paper-soft);
}

.emoticon-switch__btn.is-active {
  border-color: var(--accent-bright);
  background: var(--paper-soft);
}

.emoticon-switch__btn img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/*
 * 版式：`内容区`（占满剩余高度、内部整体滚）+ `底部切换条`（固定，不参与滚动）。
 *
 * 🔴 为什么改成 flex 两段而不是 `position: sticky`：
 * sticky 版实测切换条会**浮在内容之上**（滚动时它与表情格子重叠，看起来像"没固定"，
 * 且会有一条分隔线横穿内容）。改成 flex 后切换条是**独立的一段**，
 * 永远贴在面板底部、内容永远不会滚到它下面 —— 这才是微信/QQ 的观感。
 */
/*
 * 面板：定高 + flex 两段（内容区 / 切换条）+ **不自己滚**（滚动交给内容区）。
 * 定高保证切包时面板不跳；flex 保证切换条是独立一段、内容不会滚到它下面。
 */
:global(#emoticonPicker) {
  height: min(56vh, 440px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* 面板标题行不参与压缩，避免内容多时把标题挤没 */
:global(#emoticonPicker > .ui-popover-heading) {
  flex: 0 0 auto;
}

/*
 * 滚动条：**鼠标移入表情框才出现，移出即隐藏**；**比全局细一档**（6px）；
 * 无上下三角、无背景框；配色与全局同款（拖动时不变深）。
 *
 * ⚠️ **必须先把 `scrollbar-color` 压回 `auto`**：
 * `theme.css` 第 8 节有一条全局 `* { scrollbar-color: ... }`，
 * 而 Chromium 只要看到它的最终值**不是 `auto`**，就**整体忽略所有
 * `::-webkit-scrollbar-*` 伪元素** —— 下面这些规则会全部失效（三角复现、宽度变回系统默认）。
 * 这一条是下面所有规则生效的前提，不能删。
 *
 * 另外注意：全局那条 `* { scrollbar-color }` 同时**也让 `theme.css` 第 8 节自己失效**
 * （全站滚动条其实是 15px 系统默认 + 带三角，而非该节写的 8px / 无三角）。
 * 这是既有问题，**本轮未改全局**（用户要求回退），只在这里做本面板所需的覆盖。
 */
:global(#emoticonPicker .emoticon-body) {
  scrollbar-color: auto;
  scrollbar-width: auto;
}

/* 比全局细一档 */
:global(#emoticonPicker .emoticon-body::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}

/* 两端按钮归零 → **没有上下三角** */
:global(#emoticonPicker .emoticon-body::-webkit-scrollbar-button) {
  display: none;
  width: 0;
  height: 0;
}

/*
 * 轨道透明：本面板**不要那条背景框**（全局是有的，按用户要求这里去掉）。
 * 只影响表情面板，不动全局观感。
 */
:global(#emoticonPicker .emoticon-body::-webkit-scrollbar-track),
:global(#emoticonPicker .emoticon-body::-webkit-scrollbar-track-piece) {
  background: transparent;
}

/*
 * 平时**完全不可见**（占位但看不见）。
 *
 * 🔴 `border: none` 不可省：全局 `theme.css` 第 8 节给 thumb 带了
 * `border: 1px solid rgba(43,31,21,.25)`。若只清 `background` 而留着边框，
 * 就会剩一个**只有边框、没有填充的空框**浮在面板右侧（用户 2026-10-09 截图指出）。
 */
:global(#emoticonPicker .emoticon-body::-webkit-scrollbar-thumb) {
  background: transparent;
  border: none;
}

/* 鼠标移入表情框 → 出现，颜色与全局同款 */
:global(#emoticonPicker:hover .emoticon-body::-webkit-scrollbar-thumb) {
  background: var(--border-color);
}

/*
 * 拖动/悬停时**保持同色**：覆盖全局那条会转成 `--wood-soft`（很深）的规则。
 * 少了这一条，拖动时就会比别处深（用户指出过一次）。
 */
:global(#emoticonPicker:hover .emoticon-body::-webkit-scrollbar-thumb:hover) {
  background: var(--border-color);
}

/* 格子只是图片的载体：底色/描边走羊皮纸变量，悬停给一点浅色反馈 */
.emoticon-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.emoticon-cell:hover,
.emoticon-cell:focus-visible {
  border-color: var(--accent-bright);
  background: var(--paper-soft);
}

.emoticon-cell img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* 素材缺失时的降级：显示中文名（如「疑问」），看得出是哪一个缺图 */
.emoticon-missing {
  padding: 0 2px;
  color: var(--text-faint);
  font-size: 10px;
  line-height: 1.2;
  word-break: break-all;
}
</style>
