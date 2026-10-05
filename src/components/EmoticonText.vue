<template>
  <!--
    表情正文渲染器：把 `[e:包:名]` 段落换成图片，其余原样输出。

    关键实现约束（都源自"正文永远是纯文本"这条前提）：
      - 文字段用**裸文本节点**输出，不套元素：父级的 `white-space: pre-wrap` 才能继续
        保留换行与连续空格（套一层 span 也行，但裸文本最不容易被后续改动破坏）；
      - 表情只替换**目录里认识**的名字（`splitEmoticonSegments` 负责），
        历史正文与用户手打的 `[e:xx:yy]` 都只会原样显示文字；
      - 图挂了（老热更包离线、素材没同步到包内）时不显示破图，直接回退成 token 原文，
        便于一眼看出是"素材没到位"而不是"内容丢了"。
        ⚠️ 必须带 `data-image-fallback="custom"`：`App.vue` 有一个**捕获阶段**的全局图片
        error 处理（`handleGlobalImageError`）会先把失败的 `<img>` 换成
        `/ui/visibility-off.svg` 并 `stopImmediatePropagation()`——不带这个标记的话，
        本组件的 `@error` 根本不会执行，用户看到的是一只"隐藏"的眼睛图标。
  -->
  <template v-for="(segment, index) in segments" :key="index">
    <img
      v-if="segment.type === 'emoticon' && !failed.has(index)"
      class="emoticon-img"
      :class="`emoticon-img--${segment.item.kind}`"
      :src="getImageUrl(segment.item.path)"
      :alt="segment.item.name"
      :title="segment.item.name"
      loading="lazy"
      decoding="async"
      data-image-fallback="custom"
      @error="markFailed(index)"
    />
    <span v-else-if="segment.type === 'emoticon'" class="emoticon-missing">{{
      segment.item.name
    }}</span>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { splitEmoticonSegments } from '../config/emoticons.js'
import { getImageUrl } from '../utils/env.js'

const props = defineProps({
  /** 评论正文（纯文本，可能含 `[e:包:名]` 表情 token） */
  text: { type: String, default: '' }
})

const segments = computed(() => splitEmoticonSegments(props.text))

/** 加载失败的表情段下标（按段隔离，换正文就清空） */
const failed = ref(new Set())

watch(
  () => props.text,
  () => {
    if (failed.value.size) failed.value = new Set()
  }
)

function markFailed(index) {
  const next = new Set(failed.value)
  next.add(index)
  failed.value = next
}
</script>

<style scoped>
/* 只做尺寸与基线对齐；颜色/背景一律不设（正文样式由使用方的 .comment-body 等负责） */
.emoticon-img {
  display: inline-block;
  vertical-align: middle;
  object-fit: contain;
  /* 图片只在文字基线附近微调，不改变正文的行距观感 */
  margin: -2px 1px;
}

/* 黄豆（90×90 的小脸）：跟随正文字号，与文字混排不撑行 */
.emoticon-img--face {
  width: 1.45em;
  height: 1.45em;
}

/* 游戏第 1 弹（240×240 的贴纸）：固定像素，是"贴在消息里"的插图而不是行内符号 */
.emoticon-img--sticker {
  width: 64px;
  height: 64px;
  margin: 2px 2px;
}

/* 素材缺失时的降级：把 token 原文显示出来，方便判断是素材问题还是内容问题 */
.emoticon-missing {
  color: var(--text-faint);
  font-size: 12px;
  word-break: break-all;
}
</style>
