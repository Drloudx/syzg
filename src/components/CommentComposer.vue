<template>
  <form class="comment-form" @submit.prevent="submit">
    <!--
      身份条：**评论必须登录**（读不需要）。未登录时这里就是登录引导 ——
      按钮点了直接开账号弹窗，不跳页。
    -->
    <div class="comment-identity">
      <template v-if="isLoggedIn">
        <img v-if="myAvatarPath" class="comment-avatar" :src="myAvatarPath" alt="" />
        <div v-else class="comment-avatar comment-avatar-fallback" aria-hidden="true">
          {{ (currentUser?.nick || '?').slice(0, 1) }}
        </div>
        <span class="comment-identity-text">
          {{ currentUser?.nick }}
        </span>
        <button type="button" class="comment-identity-edit" @click="openAccountModal()">修改</button>
      </template>
      <template v-else>
        <div class="comment-avatar comment-avatar-fallback" aria-hidden="true">?</div>
        <span class="comment-identity-text">登录后才能发表评论</span>
        <button type="button" class="comment-identity-edit" @click="openAccountModal()">
          登录 / 注册
        </button>
      </template>
    </div>

    <!--
      回复条：只有点了某条消息的「回复」才出现。
      显示"回复 @谁 + 被引用内容的纯文字摘录"（摘录里认识的表情用中文名，
      见 `emoticonPlainText`）——输入框里放不了图片，用文字最省地方也最不容易误读。
    -->
    <div v-if="form.replyTo" class="comment-reply-bar">
      <span class="comment-reply-bar-text">
        回复 <strong>@{{ form.replyTo.nick }}</strong>
        <span v-if="replyExcerpt" class="comment-reply-bar-excerpt">：{{ replyExcerpt }}</span>
      </span>
      <button
        type="button"
        class="comment-reply-bar-cancel"
        aria-label="取消回复"
        title="取消回复（Esc）"
        @click="cancelReply"
      >
        ✕
      </button>
    </div>

    <!--
      输入区是 **contenteditable 富文本**（不是 `<textarea>`）：表情要**直接显示成图片**，
      而 textarea 只能显示文字——那样用户看到的是 `[e:tieba:tb_yiwen]` 这种内部代号
      （用户明确反馈过）。这里 DOM 只是"视图"，`form.body` 始终保存序列化后的 token 文本，
      提交、计数、超长判断全都只看 `form.body`。
    -->
    <div
      ref="bodyRef"
      class="comment-textarea comment-editor"
      :class="{ 'is-replying': form.replyTo }"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :aria-label="form.replyTo ? `回复 ${form.replyTo.nick}` : '说点什么…'"
      :data-placeholder="form.replyTo ? `回复 @${form.replyTo.nick}…` : '说点什么…'"
      @input="syncFromDom"
      @paste="onPaste"
      @copy="onCopy"
      @keydown="onKeydown"
      @compositionend="syncFromDom"
      @keyup="rememberRange"
      @mouseup="rememberRange"
    ></div>

    <!-- 蜜罐：正常用户与屏幕阅读器都感知不到，但不静默移除（display:none 会被部分机器人跳过）。
         用 visibility+opacity 而非仅移出视口，避免键盘 Tab 落在它上面。 -->
    <input
      v-model="form.hp"
      class="comment-honeypot"
      type="text"
      tabindex="-1"
      autocomplete="off"
      aria-hidden="true"
      @focus="onHoneypotFocus"
    />

    <div class="comment-form-foot">
      <!--
        表情入口：样式复用 UiButton（羊皮纸描边钮，与右侧「发布」同一套皮肤），
        scoped 里只改**方形尺寸与对齐**，不重复声明按钮底色/描边。
        位置按用户要求放最左，字数计数器紧随其后。
      -->
      <UiButton
        ref="emoticonBtn"
        type="button"
        variant="secondary"
        size="sm"
        class="comment-emoticon-btn"
        :class="{ 'is-open': pickerVisible }"
        aria-haspopup="dialog"
        :aria-expanded="pickerVisible ? 'true' : 'false'"
        aria-label="插入表情"
        title="插入表情"
        @click="togglePicker"
      >
        <!--
          图标是**矢量**（`public/ui/emoticon.svg`），用 CSS mask 上色：
          SVG 自带 `fill="white"`，直接当图片用只能白色；做成 mask 之后颜色由
          `background-color` 决定，可以取主题变量（这里取滚动条同色 `--border-color`）。
        -->
        <span class="comment-emoticon-glyph" aria-hidden="true"></span>
      </UiButton>
      <!-- 计的是**显示字数**（一个表情算 1 字），与 `[e:包:名]` 的原始长度无关 -->
      <span class="comment-count" :class="{ 'is-over': overLimit }">{{ displayLength }}/{{ MAX_BODY }}</span>
      <div class="comment-send-group">
        <!--
          发送方式开关（用户要求）：默认「Enter 发送」，可切到「Ctrl + Enter 发送」。
          用 `UiSplitButton` 拼成**一个按钮**的外观：左侧主操作（发布）+ 右侧细箭头，
          点箭头开菜单、点主按钮发布；不再用"两个独立按钮"或实心三角。
        -->
        <UiSplitButton
          ref="sendBtn"
          class="comment-submit-btn"
          variant="primary"
          size="sm"
          caret-label="发送方式"
          :caret-title="`发送方式：${activeSendModeLabel}`"
          :expanded="sendModeVisible"
          :disabled="submitting || !canSubmit"
          @click="submit"
          @toggle="sendModeVisible = !sendModeVisible"
        >
          {{ submitting ? '提交中...' : '发布' }}
        </UiSplitButton>
      </div>
    </div>

    <!-- 选择层：`UiPopover` 会 Teleport 到 body，因此不参与这里的表单布局 -->
    <EmoticonPicker v-model:visible="pickerVisible" :anchor="emoticonAnchor" @pick="insertEmoticon" />

    <UiPopover
      v-model:visible="sendModeVisible"
      :anchor="sendModeAnchor"
      id="commentSendMode"
      title="发送方式"
      :width="240"
      align="end"
    >
      <button
        v-for="option in SEND_MODE_OPTIONS"
        :key="option.value"
        type="button"
        class="send-mode-option"
        :class="{ 'is-active': sendMode === option.value }"
        :aria-pressed="sendMode === option.value"
        @click="setSendMode(option.value)"
      >
        <span class="send-mode-check" aria-hidden="true">{{ sendMode === option.value ? '✓' : '' }}</span>
        <span>{{ option.label }}</span>
      </button>
    </UiPopover>

    <!-- 超长与失败提示：文案与服务端同口径（服务端也回这一句） -->
    <p v-if="overLimit" class="comment-submit-error" role="alert">
      评论最多 {{ MAX_BODY }} 字，请精简后再发
    </p>
    <p v-else-if="error" class="comment-submit-error" role="alert">{{ error }}</p>
    <p v-else-if="notice" class="comment-submit-notice" role="status">{{ notice }}</p>
  </form>
</template>

<script setup>
/**
 * CommentComposer —— 评论发表区（昵称/头像来自「账号」弹窗，这里不重复填写）。
 *
 * 为什么从 `CommentsPanel` 拆出来：讨论区页面需要**把发表区固定在滚动容器之外**
 * （用户要求"悬浮在底部"）。留在 `CommentsPanel` 里就只能跟着列表一起滚，
 * 消息一多就被推出视野——那是"列表底部"而不是"容器底部"。
 *
 * 复用：`CommentsPanel` 内部仍用它（详情弹窗里的讨论区形态不变），
 * 讨论区页面则单独放在滚动容器下方。
 *
 * 表情：正文里存的是 `[e:包:名]` token（见 `src/config/emoticons.js`），
 * 这里只负责"插入到光标处"与"按显示字数计数"，渲染由 `EmoticonText` 负责。
 */
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { UiButton, UiPopover, UiSplitButton } from './ui/index.js'
import EmoticonPicker from './EmoticonPicker.vue'
import {
  EMOTICON_TOKEN_SOURCE,
  MAX_BODY_DISPLAY,
  MAX_BODY_RAW,
  buildEmoticonToken,
  countEmoticonDisplayChars,
  emoticonPlainText,
  findEmoticon
} from '../config/emoticons.js'
import { getImageUrl } from '../utils/env.js'
import { postComment } from '../utils/commentApi.js'
import { notifyCommentPosted } from '../utils/commentEvents.js'
import { avatarPath } from '../utils/avatarCatalog.js'
import { openAccountModal } from '../utils/accountModal.js'
import { currentUser, isLoggedIn } from '../utils/authSession.js'

const props = defineProps({
  /** 评论归属键（`item:xxx` / `site:general`） */
  pageKey: { type: String, required: true },
  /** 该页面的人话名字，随评论一起存下来（管理端与账号弹窗据此显示） */
  pageLabel: { type: String, default: '' }
})

const emit = defineEmits(['posted'])

/**
 * 正文**显示字数**上限（一个表情算 1 字）。**必须与服务端 `MAX_BODY` 保持一致**
 * （`functions/api/[[path]].js`，超出会被服务端明确拒绝）。
 * 前端 `maxlength` 只是第一道防线：绕过它（改 DOM / 直接调接口）也不会被接受。
 */
const MAX_BODY = MAX_BODY_DISPLAY

/**
 * 原始长度闸门（含 `[e:包:名]` 全文），与服务端 `MAX_BODY_RAW` 一致。
 *
 * 富文本输入本身没有 `maxlength`，这个常量只用于**粘贴时的兜底**：
 * 一次粘进来几十万字符没有意义，先截到闸门长度，剩下的交给 `displayLength` 判断。
 */
const RAW_MAX = MAX_BODY_RAW

const form = reactive({ body: '', hp: '', replyTo: null })
const submitting = ref(false)
const error = ref('')
const notice = ref('')
/** 表情选择层的开关与锚点（锚点必须是 UiButton 的根 DOM） */
const pickerVisible = ref(false)
const emoticonBtn = ref(null)
const bodyRef = ref(null)

const emoticonAnchor = computed(() => emoticonBtn.value?.$el || null)

/**
 * 回复条的引用摘录：纯文字、单行、截断。
 *
 * 用 `emoticonPlainText` 把认识的表情写成 `[中文名]`——回复条放不下图片，
 * 但"引用了一条表情"这件事必须看得出来（否则摘录会是空的，用户以为没引用上）。
 */
const replyExcerpt = computed(() => {
  const raw = String(form.replyTo?.body ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const plain = emoticonPlainText(raw)
  return plain.length > REPLY_EXCERPT_MAX ? `${plain.slice(0, REPLY_EXCERPT_MAX)}…` : plain
})

const myAvatarPath = computed(() => {
  const path = avatarPath(currentUser.value?.avatar || '')
  return path ? getImageUrl(path) : ''
})

/** 显示字数：一个 `[e:包:名]` 算 1 字，其余按字符数（按 trim 后计，纯空白不算内容） */
const displayLength = computed(() => countEmoticonDisplayChars(form.body.trim()))
const overLimit = computed(() => displayLength.value > MAX_BODY)

const canSubmit = computed(() => displayLength.value > 0 && !overLimit.value)

/** 蜜罐被意外聚焦时立即移开焦点（例如密码管理器自动填充） */
function onHoneypotFocus(event) {
  event?.target?.blur?.()
}

function togglePicker() {
  pickerVisible.value = !pickerVisible.value
}

// ── 回复（引用式）────────────────────────────────────────────────────────────

/** 引用摘录显示多少字（纯显示，不影响能发多少字） */
const REPLY_EXCERPT_MAX = 42

/**
 * 开始回复某条消息（由列表里的「回复」按钮调用，父组件经 `ref` 转发进来）。
 *
 * 只存 `{ id, nick, body }` 三样：`id` 用于提交时的 `parentId`，
 * 另外两样只用来渲染回复条——真正的引用数据以服务端返回的 `replyTo` 为准
 * （对方改名/那条被隐藏，都以服务端为准）。
 */
function startReply(comment) {
  if (!comment?.id) return
  form.replyTo = { id: comment.id, nick: comment.nick || '', body: comment.body || '' }
  error.value = ''
  notice.value = ''
  nextTick(() => bodyRef.value?.focus())
}

function cancelReply() {
  form.replyTo = null
}

// ── 发送方式（Enter / Ctrl + Enter）─────────────────────────────────────────

/**
 * 发送方式偏好（`enter` 默认 / `ctrlEnter`），存 localStorage。
 *
 * 为什么放 localStorage 而不是 Pinia：它纯粹是本机输入习惯，与账号、收集进度都无关，
 * 也不需要跨设备同步；备份导入导出（`useBackupData`）里塞一个键盘习惯没有意义。
 */
const SEND_MODE_KEY = 'myrzg:comment-send-mode'
const SEND_MODE_OPTIONS = [
  { value: 'enter', label: '按 Enter 键发送消息' },
  { value: 'ctrlEnter', label: '按 Ctrl + Enter 键发送消息' }
]

const sendMode = ref('enter')
const sendModeVisible = ref(false)
/** 组合钮的根元素（下拉面板的锚点：`align="end"` 会贴齐它的右边缘，也就是箭头那一侧） */
const sendBtn = ref(null)
const sendModeAnchor = computed(() => sendBtn.value?.$el || null)
const activeSendModeLabel = computed(
  () => SEND_MODE_OPTIONS.find((option) => option.value === sendMode.value)?.label || ''
)

function setSendMode(value) {
  sendMode.value = value === 'ctrlEnter' ? 'ctrlEnter' : 'enter'
  sendModeVisible.value = false
  try {
    localStorage.setItem(SEND_MODE_KEY, sendMode.value)
  } catch {
    /* 隐私模式下写不了，降级为"本次会话有效" */
  }
}

/**
 * 回车行为：默认 Enter 发送（Shift+Enter 换行），可切到 Ctrl/⌘+Enter 发送（Enter 换行）。
 *
 * **输入法组词中的回车绝不能当发送**（`isComposing` / `keyCode === 229`）：
 * 中文用拼音打字时那一下回车是"选词"，误发会直接把半成品发出去。
 *
 * `Esc`：先取消回复（在详情弹窗里按 Esc 不该把整个弹窗关掉）。
 */
function onKeydown(event) {
  if (event.key === 'Escape' && form.replyTo) {
    event.preventDefault()
    // 拦住冒泡：`useOverlay` 在 document 上监听 Esc 关弹窗，回复条还没取消就关掉弹窗很突兀
    event.stopPropagation()
    cancelReply()
    return
  }
  if (event.key !== 'Enter') return
  if (event.isComposing || event.keyCode === 229) return
  const withModifier = event.ctrlKey || event.metaKey
  const shouldSend = sendMode.value === 'ctrlEnter' ? withModifier : withModifier || !event.shiftKey
  if (!shouldSend) return
  event.preventDefault()
  submit()
}

// ── 富文本输入区：DOM 是视图，`form.body` 是唯一的真值 ────────────────────────

/**
 * 把一个节点序列化成 token 文本。**这是"表情能存进数据库"的关键一步。**
 *
 * 四种情况都必须处理，否则会出现"看到的和发出去的不一样"：
 *   - 文本节点：原样拼接（换行在 `white-space: pre-wrap` 下就是一个 `\n` 字符）；
 *   - `<br>`：换行（Shift+Enter 与部分输入法会插它）；
 *   - 表情图片：取 `data-emoticon-token`（**不是** src —— 路径会随素材目录变）；
 *   - 块级元素（`<div>`/`<p>`，Chrome 按回车就是这种）：块与块之间补一个换行。
 */
function serializeNode(node) {
  let out = ''
  let wroteAny = false
  const push = (text) => {
    if (!text) return
    out += text
    wroteAny = true
  }

  const walk = (parent) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        push(child.nodeValue)
        continue
      }
      if (child.nodeName === 'BR') {
        push('\n')
        continue
      }
      if (child.nodeName === 'IMG') {
        push(child.dataset?.emoticonToken || child.getAttribute('alt') || '')
        continue
      }
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (/^(DIV|P)$/.test(child.nodeName) && wroteAny) push('\n')
        walk(child)
      }
    }
  }

  walk(node)
  return out
}

/** 建一个表情芯片（`contenteditable="false"` 让它成为一个整体，退格一次删掉） */
function createEmoticonChip(item) {
  const chip = document.createElement('img')
  chip.className = `comment-emoticon-chip comment-emoticon-chip--${item.kind}`
  chip.src = getImageUrl(item.path)
  chip.alt = item.name
  chip.title = item.name
  chip.dataset.emoticonToken = buildEmoticonToken(item.packId, item.key)
  chip.setAttribute('contenteditable', 'false')
  chip.setAttribute('loading', 'lazy')
  chip.setAttribute('decoding', 'async')
  // 与 EmoticonText 同理：不带这个标记会被 App.vue 捕获阶段的全局兜底换成"眼睛被划掉"
  chip.setAttribute('data-image-fallback', 'custom')
  chip.addEventListener('error', () => {
    // 素材没到位时退回可读、可提交的 token 文本（而不是在输入框里留一个破图）
    chip.replaceWith(document.createTextNode(chip.dataset.emoticonToken))
    syncFromDom()
  })
  return chip
}

/** token 文本 → DOM（清空输入框、以及将来"编辑已发出的评论"复用） */
function renderInput(text) {
  const el = bodyRef.value
  if (!el) return
  el.textContent = ''
  const source = String(text ?? '')
  const fragment = document.createDocumentFragment()

  const appendText = (chunk) => {
    if (!chunk) return
    chunk.split('\n').forEach((part, index) => {
      if (index > 0) fragment.appendChild(document.createElement('br'))
      if (part) fragment.appendChild(document.createTextNode(part))
    })
  }

  let last = 0
  for (const match of source.matchAll(new RegExp(EMOTICON_TOKEN_SOURCE, 'g'))) {
    const item = findEmoticon(match[1], match[2])
    if (!item) continue
    appendText(source.slice(last, match.index))
    fragment.appendChild(createEmoticonChip(item))
    last = match.index + match[0].length
  }
  appendText(source.slice(last))
  el.appendChild(fragment)
}

/** DOM → `form.body`（每次 input / 合成结束 / 插入表情后调用） */
function syncFromDom() {
  const el = bodyRef.value
  if (!el) return
  // 只剩一个空 <br> 时清掉：否则 `:empty` 不成立，占位符不显示
  if (el.childNodes.length === 1 && el.firstChild?.nodeName === 'BR') el.textContent = ''
  form.body = serializeNode(el)
}

/**
 * 记住输入框里最后一次光标位置（一个 Range）。
 *
 * ⚠️ **只在输入框处于聚焦状态时记录**（`keyup` / 鼠标在框内抬起）。
 * 不要在 `focus` / `blur` 时记：实测浏览器在这两个时刻给不出可信的选区——
 * 重新聚焦时选区还可能停在开头，于是"第二次插入的表情跑到最前面"
 * （`[tb_haha][tb_hehe]` 这个形状）。插入后由 `insertEmoticon` 自己把位置推到芯片之后。
 */
let savedRange = null

function rememberRange() {
  const el = bodyRef.value
  if (!el || document.activeElement !== el) return
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) return
  const range = selection.getRangeAt(0)
  if (el.contains(range.startContainer)) savedRange = range.cloneRange()
}

/**
 * 把表情芯片插到**光标处**（没有有效光标时追加到末尾），插完**关闭选择层**并把光标还回输入框。
 *
 * 光标位置自己记（`savedRange`）：点选择器里的表情时输入框已经失焦，
 * `window.getSelection()` 已经不在输入框里，所以要靠 `rememberRange` 在
 * 输入/点击/失焦/按键时各记一次。
 *
 * 关闭选择层是**用户明确要求**的（"选完表情直接关闭这个窗口"）；顺手把焦点和光标放回
 * 输入框里芯片之后，关掉面板就能接着打字。注意不要"只抢焦点不管选区"——
 * 那样光标会跑到开头，接着打的字会插到表情前面。
 */
function insertEmoticon(item) {
  const el = bodyRef.value
  if (!el) return
  const selection = window.getSelection()
  const live = selection && selection.rangeCount ? selection.getRangeAt(0) : null
  const focused = !!live && el.contains(live.startContainer)

  let range
  if (focused) range = live
  else if (savedRange && el.contains(savedRange.startContainer)) range = savedRange.cloneRange()
  else {
    range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
  }

  range.deleteContents()
  const chip = createEmoticonChip(item)
  range.insertNode(chip)

  const after = document.createRange()
  after.setStartAfter(chip)
  after.collapse(true)
  savedRange = after.cloneRange()
  if (focused && selection) {
    selection.removeAllRanges()
    selection.addRange(after)
  }

  syncFromDom()
  pickerVisible.value = false
  nextTick(() => {
    const node = bodyRef.value
    if (!node) return
    node.focus()
    const sel = window.getSelection()
    if (sel && savedRange) {
      sel.removeAllRanges()
      sel.addRange(savedRange)
    }
  })
  // 插入后不再是"发送失败"的状态，清掉上一次的错误/提示
  error.value = ''
  notice.value = ''
}

/**
 * 粘贴一律按**纯文本**插入：富文本粘贴会带进 `style`/`font`/站外图片，
 * 既污染序列化结果，也可能把外站内容贴进评论。
 */
function onPaste(event) {
  const text = String(event.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n')
  if (!text) return
  event.preventDefault()
  document.execCommand('insertText', false, text.slice(0, RAW_MAX))
  syncFromDom()
}

/** 复制时把选区还原成 token 文本，避免复制出来的是"没有表情的空文本" */
function onCopy(event) {
  const el = bodyRef.value
  const selection = window.getSelection()
  if (!el || !selection || selection.isCollapsed || !el.contains(selection.anchorNode)) return
  const holder = document.createElement('div')
  holder.appendChild(selection.getRangeAt(0).cloneContents())
  event.clipboardData?.setData('text/plain', serializeNode(holder))
  event.preventDefault()
}

async function submit() {
  if (submitting.value || !canSubmit.value) return

  /*
   * 未登录：把账号弹窗打开让用户登录，回来再点发布。
   * 不自动用"匿名"顶替 —— 服务端也会拒绝（401），本地先拦一下省一次往返。
   */
  if (!isLoggedIn.value) {
    error.value = ''
    notice.value = '请先登录，登录后再点「发布」'
    openAccountModal()
    return
  }

  submitting.value = true
  error.value = ''
  notice.value = ''
  try {
    /*
     * 昵称与头像**不再传** —— 服务端从会话令牌解析账号，一律用账号上的值。
     * （传了也会被忽略，见 `functions/api/[[path]].js` 的 `createComment`。）
     */
    const data = await postComment({
      pageKey: props.pageKey,
      pageLabel: props.pageLabel,
      body: form.body.trim(),
      hp: form.hp,
      // 回复目标（没有引用时为 null，服务端会忽略）
      parentId: form.replyTo?.id ?? null
    })

    if (data.pending) {
      // 进待审：不直接插进列表，避免"看得见但别人看不见"的误导
      notice.value = data.notice || '评论已提交，将尽快审核后显示'
    }
    form.body = ''
    // 回复目标用掉即清：下一条默认是普通评论（想继续回复就再点一次「回复」）
    form.replyTo = null
    renderInput('')
    // 广播：右栏「最新讨论」等据此**直接插入这一条**（不重新拉取，避免列表重建闪一下）
    notifyCommentPosted(data.comment || null)
    // 交给调用方刷新列表（发表区在组件外时由父组件调 CommentsPanel.addPostedComment）
    emit('posted', data)
  } catch (err) {
    error.value = err?.message || '发布失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

/**
 * 对外暴露：列表里的「回复」按钮经父组件转发到这里。
 * （详情页的发表区在 `CommentsPanel` 内部，直接 `ref` 调用；讨论区的发表区在面板外，
 *  由 `DiscussionsView` 接 `@reply` 事件再转发。）
 */
defineExpose({ startReply, cancelReply })

// DOM 是视图：挂载后按 `form.body` 渲染一次（当前恒为空，留着是为了将来"编辑已发出的评论"），
// 并把本机记住的发送方式读回来
onMounted(() => {
  if (form.body) renderInput(form.body)
  try {
    const saved = localStorage.getItem(SEND_MODE_KEY)
    if (saved === 'enter' || saved === 'ctrlEnter') sendMode.value = saved
  } catch {
    /* 读不到就用默认 Enter 发送 */
  }
})
</script>

<style scoped>
/* 与 CommentsPanel 里的同名类保持一致（同一视觉，两处使用） */
.comment-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/*
 * 回复条：一条消息的高度，**不能挤走输入框**（详情弹窗里空间本来就紧）。
 * 摘录单行省略号截断，长了也不换行。
 */
.comment-reply-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 9px;
  border-left: 3px solid var(--accent-bright);
  border-radius: 0 4px 4px 0;
  background: var(--paper-soft);
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.comment-reply-bar-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.comment-reply-bar-text strong {
  color: var(--accent-ink);
}

.comment-reply-bar-excerpt {
  color: var(--text-faint);
}

/* 小圆叉：与弹窗关闭钮同一形状语言（方形描边、悬停变深），只是尺寸更紧凑 */
.comment-reply-bar-cancel {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  color: var(--text-faint);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.comment-reply-bar-cancel:hover {
  border-color: var(--border-faint);
  color: var(--text-main);
}

.comment-identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.comment-avatar {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border-soft);
  object-fit: cover;
}

.comment-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper-solid);
  color: var(--text-muted);
  font-size: 15px;
  font-weight: 700;
}

/*
 * 身份条现在只显示**昵称**（用户要求去掉「以…的身份发表」与其下的编号）。
 *
 * 因为文案从"以 X 的身份发表"缩成一个名字，原来那套"灰色小字 + 竖排"
 * 不再合适 —— 单看一个灰名字会像是占位符。所以这里改成：
 * **正文字号、正常颜色**，让它读起来就是"这条是你发的"。
 */
.comment-identity-text {
  color: var(--text-main);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-identity-edit {
  margin-left: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent-ink);
  font-family: inherit;
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
  flex: 0 0 auto;
}

.comment-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--paper-soft);
  color: var(--text-main);
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.6;
  min-height: 72px;
}

/*
 * 输入区是 contenteditable（表情要直接显图），所以要自己补上原生 textarea 的几件事：
 *   - `white-space: pre-wrap`：文本节点里的 `\n` 才会真的换行，同时也保留连续空格；
 *   - 占位符：`:empty::before`（原生 `placeholder` 属性对 div 无效）；
 *   - 高度：不再支持拖拽调整（`resize` 对 contenteditable 没意义），改成随内容长高、封顶滚动。
 */
.comment-editor {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  overflow-y: auto;
  max-height: 180px;
  caret-color: var(--text-main);
}

.comment-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--text-faint);
  pointer-events: none;
}

/*
 * 输入框里的表情芯片：**尺寸与正文里完全一致**（用户要求"和发出去的大小一样"）。
 *
 * ⚠️ 必须用 `:deep()`：芯片是 `document.createElement` 建出来的（不走模板），
 * **拿不到 scoped 样式的 `data-v-*` 属性**——直接写 `.comment-emoticon-chip` 匹配不上，
 * 表现就是"输入框里的表情按原图大小显示"（实测 240px 的贴纸撑满输入区）。
 * `:deep()` 编译成 `.comment-editor[data-v-x] .comment-emoticon-chip`，父元素有属性即可命中。
 */
.comment-editor :deep(.comment-emoticon-chip) {
  display: inline-block;
  vertical-align: middle;
  object-fit: contain;
  margin: -2px 1px;
}

.comment-editor :deep(.comment-emoticon-chip--face) {
  width: 1.45em;
  height: 1.45em;
}

.comment-editor :deep(.comment-emoticon-chip--sticker) {
  width: 64px;
  height: 64px;
  margin: 2px 2px;
}

.comment-textarea:focus {
  outline: 2px solid var(--accent-bright);
  outline-offset: 1px;
}

.comment-textarea::placeholder {
  color: var(--text-faint);
}

.comment-honeypot {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.comment-form-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

/*
 * 表情入口只改**方形尺寸与对齐**：底色/描边/阴影/悬停仍由 UiButton 提供
 * （UI 组件库规则 2：不要在业务样式里重复声明按钮皮肤）。
 *
 * 用 `secondary`（羊皮纸描边钮）而不是 `primary`（深原木）：用户反馈深色太沉，
 * 换成与**滚动条同色**的浅色描边钮（描边 → `--border-color`，正是滚动条滑块的颜色）。
 *
 * `align-self: stretch` + `aspect-ratio: 1` 让它自动等于这一行的高度且保持正方形——
 * 不写死像素值，改动「发布」按钮字号/内边距时也不会与它错位、不会改变发表区总高度。
 */
.comment-emoticon-btn {
  flex: 0 0 auto;
  align-self: stretch;
  aspect-ratio: 1 / 1;
  padding: 0;
  /* 描边与图标用滚动条滑块的颜色，和聊天区的滚动条呼应 */
  border-color: var(--border-color);
}

.comment-emoticon-glyph {
  display: block;
  width: 25px;
  height: 25px;
  background-color: var(--border-color);
  /* 矢量蒙版上色：`mask` 只取 alpha，颜色由 background-color 决定 */
  -webkit-mask-image: url('/ui/emoticon.svg');
  mask-image: url('/ui/emoticon.svg');
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}

/* 面板打开时的状态提示：只加一圈描边，不动按钮底色 */
.comment-emoticon-btn.is-open {
  outline: 2px solid var(--accent-bright);
  outline-offset: 1px;
}

.comment-count {
  color: var(--text-faint);
  font-size: 12px;
  margin-right: auto;
}

/* 超出 200 显示字：计数器变红（提示行另有同口径文案） */
.comment-count.is-over {
  color: var(--danger);
  font-weight: 700;
}

/* 「发布」+ 发送方式开关合成一个组合钮（UiSplitButton），这里只控制它在行尾 */
.comment-send-group {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

/*
 * 手机端只留「发布」：手机上没有物理回车键，"Enter 还是 Ctrl+Enter 发送"没有意义
 * （用户明确要求）。箭头隐藏后主按钮要补回右侧圆角，否则右边是直角。
 * 断点跟项目其它页面一致（767px），见 ChaptersView 的 MOBILE_QUERY。
 */
@media (max-width: 767px) {
  .comment-send-group :deep(.ui-split-btn__caret) {
    display: none;
  }

  .comment-send-group :deep(.ui-split-btn__main) {
    border-top-right-radius: 4px;
    border-bottom-right-radius: 4px;
  }
}

/* 选择层里的两行选项：左侧打勾、整行可点 */
.send-mode-option {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 7px 6px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--text-main);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  text-align: left;
  cursor: pointer;
}

.send-mode-option:hover {
  background: var(--hover-bg, rgba(85, 117, 116, 0.14));
}

.send-mode-option.is-active {
  color: var(--accent-ink);
  font-weight: 700;
}

.send-mode-check {
  flex: 0 0 auto;
  width: 14px;
  color: var(--accent-ink);
}

.comment-submit-error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
  line-height: 1.6;
}

.comment-submit-notice {
  margin: 0;
  color: var(--accent-ink);
  font-size: 13px;
  line-height: 1.6;
}
</style>
