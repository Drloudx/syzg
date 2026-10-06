<template>
  <div v-if="visible" class="captcha">
    <div class="captcha-head" :class="{ 'is-embedded': embedded }">
      <!-- 放进弹窗时标题由弹窗给（`CaptchaDialog`），这里再来一个就重复了 -->
      <span v-if="!embedded" class="captcha-title">人机验证</span>
      <span class="captcha-progress">{{ picked.length }} / {{ expected }}</span>
    </div>
    <p class="captcha-tip">请依次点击下面相同的 {{ expected }} 个蛋</p>

    <!--
      ⚠️ 占位态**不能**复用 `.captcha-stage` 这个类：
      那个类是"SVG 容器"的标识，测试与父组件都靠它找题目。
      混用会让"正在出题…"也被当成题目（表现为拿到一个没有 <svg> 的容器）。
    -->
    <div v-if="state === 'loading'" class="captcha-placeholder">正在出题…</div>
    <div v-else-if="state === 'error'" class="captcha-placeholder">
      <p class="captcha-err">{{ errorText }}</p>
      <button type="button" class="captcha-btn" @click="load()">重试</button>
    </div>
    <div
      v-else
      ref="stageEl"
      class="captcha-stage"
      :class="{ 'is-sending': state === 'sending' }"
      @click="onStageClick"
      v-html="svg"
    ></div>

    <div class="captcha-foot">
      <button
        type="button"
        class="captcha-btn captcha-btn--ghost"
        :disabled="state === 'loading' || state === 'sending'"
        @click="load()"
      >
        换一批
      </button>
      <span v-if="state === 'sending'" class="captcha-note">正在校验…</span>
      <span v-else-if="picked.length" class="captcha-note">点错了会自动换新题</span>
    </div>
  </div>
</template>

<script setup>
/**
 * 蛋点选人机验证。
 *
 * ## 职责边界（重要）
 *
 * 本组件**只负责出题与收集点击**，拿到 `{ captchaId, picks }` 就 emit 出去；
 * **真正的提交与判定由父组件（发码那一步）做**。原因是：
 *
 * 🔴 **客户端不知道答案，所以"点错"只能由服务端判定。**
 *    服务端的作废规则是"校验一次即删题"（无论对错），所以父组件拿到 403 后
 *    必须调 `reset()` 换新题 —— 界面上的"点错了会自动换新题"说的就是这个流程，
 *    而不是本地先判一次对错。
 *
 * ## `v-html` 的安全性
 *
 * 这里渲染的是**服务端生成的 SVG**，内容 = 固定模板 + 蛋图 base64 + 随机数，
 * **不含任何用户输入**，所以不存在注入面。它必须内联进 DOM（而不是塞进 `<img>`），
 * 原因有二：一是 `.hit` 热区要能接收点击；二是背景图是按 URL 引用的
 * （见 `src/utils/authCaptcha.js` 的说明），`<img data:>` 里加载不出来。
 */

import { nextTick, ref, watch } from 'vue'

import { CAPTCHA_PROMPT_COUNT } from '../config/auth.js'
import { fetchCaptcha } from '../utils/authApi.js'

const props = defineProps({
  /** 是否展开。父组件在"点了发送验证码"时置 true */
  visible: { type: Boolean, default: false },
  /**
   * 放进弹窗（`CaptchaDialog`）里渲染。
   *
   * 只改一件事：**不再自己画标题**（弹窗标题已经是「人机验证」）。
   * 进度 `0 / 3` 与提示文字都保留 —— 那是题目本身的一部分，
   * 去掉用户就不知道要点几个、点了几个。
   */
  embedded: { type: Boolean, default: false }
})

const emit = defineEmits(['complete', 'state'])

const state = ref('loading') // loading | picking | sending | error
const svg = ref('')
const captchaId = ref('')
const picked = ref([])
const errorText = ref('')
const stageEl = ref(null)

const expected = CAPTCHA_PROMPT_COUNT

/** 出题（也用于「换一批」与父组件在失败后调用的 reset） */
async function load() {
  state.value = 'loading'
  picked.value = []
  svg.value = ''
  errorText.value = ''
  emit('state', 'loading')
  try {
    const data = await fetchCaptcha()
    captchaId.value = data.captchaId
    svg.value = data.svg
    state.value = 'picking'
    emit('state', 'picking')
    // 等 DOM 换上新的 SVG 再放开交互，避免把点击记到旧题上
    await nextTick()
  } catch (err) {
    state.value = 'error'
    errorText.value = err?.message || '验证码暂时出不来，请稍后再试'
    emit('state', 'error')
  }
}

/** 题目点满即交给父组件去提交（本地无法判对错） */
function onStageClick(event) {
  if (state.value !== 'picking') return
  const hit = event.target?.closest?.('.hit')
  if (!hit) return
  const index = Number(hit.dataset.i)
  if (!Number.isInteger(index)) return

  // 同一个位置不重复计（用户连点两下同一只蛋，第二次忽略）
  if (picked.value.includes(index)) return

  picked.value = [...picked.value, index]
  markSelected(index)

  if (picked.value.length >= expected) {
    state.value = 'sending'
    emit('state', 'sending')
    emit('complete', { captchaId: captchaId.value, picks: [...picked.value] })
  }
}

/** 给选中的热区加个视觉反馈（直接改 SVG 元素的 class，不重渲染整题） */
function markSelected(index) {
  const el = stageEl.value?.querySelector(`.hit[data-i="${index}"]`)
  el?.classList.add('is-picked')
}

/** 把已选状态也同步到热区上的序号角标（纯视觉） */
function clearMarks() {
  stageEl.value?.querySelectorAll('.hit.is-picked').forEach((el) => el.classList.remove('is-picked'))
}

/**
 * 父组件在服务端判定失败后调用：换一道新题，并清掉已选标记。
 * 这正是"错 1 次即整题作废"在界面上的落地。
 */
async function reset() {
  await load()
  await nextTick()
  clearMarks()
}

/** 父组件在提交失败但**题目仍然有效**（比如网络错误）时调用：保留题目，只清已选 */
function unpick() {
  picked.value = []
  state.value = 'picking'
  clearMarks()
}

/**
 * 展开时才出题（`immediate` 让"一开始就 visible"的情况也能触发）。
 *
 * ⚠️ **别在条件里判断 `state !== 'loading'`** —— `state` 的初值就是 `'loading'`，
 * 那个条件会永远为假，`load()` 一次都不会被调用，界面卡在"正在出题…"。
 * （这个 bug 是 Playwright 测试抓到的：容器一直停在占位态。）
 *
 * 判据只用 `!svg.value`：有题就不重复出（用户切走再切回来仍是同一道题），
 * 没题就出（首次展开、或上一次出题失败后重试）。
 */
watch(
  () => props.visible,
  (open) => {
    if (open && !svg.value) load()
  },
  { immediate: true }
)

defineExpose({ load, reset, unpick })
</script>

<style scoped>
.captcha {
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 10px;
  padding: 10px 12px 12px;
  background: rgba(0, 0, 0, 0.18);
}

.captcha-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}

/* 弹窗模式：标题由弹窗给，这一行只剩进度，靠右对齐 */
.captcha-head.is-embedded {
  justify-content: flex-end;
}

.captcha-title {
  font-size: 14px;
  font-weight: 700;
}

.captcha-progress {
  font-family: ui-monospace, monospace;
  font-size: 14px;
  color: #f0c987;
}

.captcha-tip {
  margin: 0 0 8px;
  font-size: 13px;
  opacity: 0.8;
}

.captcha-stage {
  border-radius: 8px;
  overflow: hidden;
  line-height: 0; /* 去掉 SVG 底部的行高缝隙 */
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.captcha-stage.is-sending {
  opacity: 0.7;
  pointer-events: none;
}

/* 选中的热区：描一圈金边 + 右上角序号。样式由全局选择器注入不进去（scoped），
   所以这里允许穿透到 v-html 生成的内容 */
.captcha-stage :deep(.hit.is-picked) {
  fill: rgba(240, 201, 135, 0.28) !important;
  stroke: #f0c987;
  stroke-width: 2;
  stroke-dasharray: 4 3;
}

.captcha-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.14);
  font-size: 14px;
  opacity: 0.85;
  line-height: 1.6;
}

.captcha-err {
  margin: 0;
  color: #e8a0a0;
}

.captcha-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.captcha-btn {
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-family: inherit;
  background: #c8a06a;
  color: #2a2118;
  font-weight: 700;
  cursor: pointer;
}

.captcha-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.captcha-btn--ghost {
  background: transparent;
  color: inherit;
  font-weight: 400;
}

.captcha-note {
  font-size: 12px;
  opacity: 0.65;
}
</style>
