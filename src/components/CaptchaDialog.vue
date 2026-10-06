<template>
  <!--
    人机验证弹窗。
    `z-index` 给到 13000（而不是默认的 500）：`UiModal` 的 teleport 模式会把它
    抬到 `max(zIndex, 12000)`，而账号弹窗自己也是 teleport 到 body 的 12000 ——
    同层就得靠 DOM 顺序决定谁在上面，太脆；显式高一档才稳。

    这也让 `useOverlay` 的 Esc 处理正确：后注册的（本题）先被关掉。
  -->
  <UiModal
    :visible="visible"
    title="人机验证"
    max-width="440px"
    :z-index="13000"
    teleport-to="body"
    @update:visible="onClose"
  >
    <CaptchaEgg
      ref="inner"
      embedded
      :visible="visible"
      @complete="(payload) => emit('complete', payload)"
    />
    <p class="captcha-dialog-hint">
      防机器人用的，点对了才会给你发验证码。
    </p>
  </UiModal>
</template>

<script setup>
/**
 * 把人机验证包进弹窗 —— 注册表单不再被一块 360×272 的题目撑长。
 *
 * ## 为什么要单独一个组件
 *
 * `CaptchaEgg` 是"题目本身"（出题 + 收集点击），而"什么时候把它弹出来"
 * 是**布局层**的事。混在一起会让 `CaptchaEgg` 同时关心两件事。
 *
 * ## 为什么要把 `reset` / `load` / `unpick` 转发出去
 *
 * 父组件（`useCodeSender`）拿到的一直是"题目的 ref"，它只调 `reset()`
 * （服务端 403 作废题目后换新题）。包一层之后那个 ref 指向本组件，
 * 所以这里必须**原样转发这三个方法**，否则 403 换题会静默失效 ——
 * 表现为"点错了之后怎么点都不对"，且不报任何错。
 */

import { ref } from 'vue'

import CaptchaEgg from './CaptchaEgg.vue'
import { UiModal } from './ui/index.js'

defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['update:visible', 'complete'])

const inner = ref(null)

function onClose() {
  emit('update:visible', false)
}

defineExpose({
  reset: () => inner.value?.reset(),
  load: () => inner.value?.load(),
  unpick: () => inner.value?.unpick()
})
</script>

<style scoped>
.captcha-dialog-hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}
</style>
