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
    <UiTabs v-model="activePack" :options="packTabs" />

    <div class="emoticon-grid" :class="`emoticon-grid--${activeKind}`">
      <button
        v-for="item in activeItems"
        :key="item.key"
        type="button"
        class="emoticon-cell"
        :data-emoticon-key="item.key"
        :title="item.name"
        :aria-label="item.ariaName"
        @click="emit('pick', item)"
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
  </UiPopover>
</template>

<script setup>
import { computed, ref } from 'vue'
import UiPopover from './ui/UiPopover.vue'
import UiTabs from './ui/UiTabs.vue'
import { EMOTICON_PACKS } from '../config/emoticons.js'
import { getImageUrl } from '../utils/env.js'

/** 面板宽度：桌面 352px（黄豆 8 列、贴纸 5 列）；`UiPopover` 在窄屏会自己收窄到视口内 */
const PICKER_WIDTH = 352

defineProps({
  visible: { type: Boolean, default: false },
  /** 定位锚点（发表区那个图标按钮的 DOM） */
  anchor: { type: Object, default: null }
})

const emit = defineEmits(['update:visible', 'pick'])

const packTabs = EMOTICON_PACKS.map((pack) => ({ value: pack.id, label: pack.label }))

/** 记住上次看的页签：连续发表时不必每次重新点一遍 */
const activePack = ref(EMOTICON_PACKS[0]?.id || '')

const activeItems = computed(
  () => EMOTICON_PACKS.find((pack) => pack.id === activePack.value)?.items || []
)
/** 两类表情的格子尺寸不同（小脸密排、贴纸给大格），由目录表的 kind 决定 */
const activeKind = computed(
  () => EMOTICON_PACKS.find((pack) => pack.id === activePack.value)?.kind || 'face'
)

/** 加载失败的格子（按表情名记），显示表情名而不是通用占位图标 */
const failed = ref(new Set())
function markFailed(key) {
  const next = new Set(failed.value)
  next.add(key)
  failed.value = next
}
</script>

<style scoped>
/*
 * 网格自己滚，**不让整个面板滚**：面板滚动会把两个页签一起滚出视野，
 * 选到目录中段时就没法换页签了（`UiPopover` 的 max-height 只保证内容不溢出视口）。
 *
 * 高度是**固定值**（不是 max-height）：两个页签格数差很多（85 vs 8），
 * 若高度跟着内容走，切页签时整个面板会忽高忽低地跳（用户要求"像 QQ 一样保持相同高度"）。
 * 固定高度时格数少的页签下方留白，和 QQ 的表情面板一致。
 */
.emoticon-grid {
  display: grid;
  gap: 4px;
  margin-top: 8px;
  height: min(46vh, 320px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
  /* 滚动条出现/消失不影响列宽，避免切页签时格子轻微错位 */
  scrollbar-gutter: stable;
  align-content: start;
}

.emoticon-grid--face {
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
}

.emoticon-grid--sticker {
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
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
