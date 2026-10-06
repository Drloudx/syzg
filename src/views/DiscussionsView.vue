<template>
  <div class="page-view-container discussions-page">
    <!--
      这是**站内总讨论区**：归属键固定为 `site:general`，与各图鉴页面的讨论
      （`item:xxx`、`hero:xxx`…）是**完全分开**的两套内容，不聚合、不互相搬运。
      各页面的讨论在各自详情里；右栏「最新讨论」只镜像**本站内讨论区**
      （服务端 `/api/recent` 只查 `site:general`，右栏发表后本地直插也按 `pageKey` 过滤）。

      外层纸张面板：内容直接铺在地图背景上会看不清，与符石图鉴的内容区同一形态。
    -->
    <section class="discussion-panel paper-panel">
      <header class="discussion-head">
        <h3 class="discussion-title">◆ 站内讨论区</h3>
      </header>

      <!--
        正文区：**只有列表在这里滚**。
        `overflow-y: auto` + `min-height: 0` 让它受父级高度约束，消息再多也不会把整页撑长。
        `reverse` = 聊天式排序（最新在最后，紧挨下方输入框）；
        首次载入停在最新一条、发表后跟到最新，均由下方的 watch 统一负责。
      -->
      <div ref="scrollRoot" class="discussion-scroll">
        <CommentsPanel
          ref="listRef"
          :page-key="SITE_PAGE_KEY"
          :page-label="SITE_PAGE_LABEL"
          title=""
          read-only
          reverse
          @loading-earlier="(busy) => (suppressAutoScroll = busy)"
          @reply="(comment) => composerRef?.startReply(comment)"
        />
      </div>

      <!--
        发表区：**放在滚动容器之外**，因此始终固定在面板底部（用户要求"悬浮"）。
        留在容器里就只能跟着列表滚，消息一多会被推出视野——那是"列表底部"不是"容器底部"。
        列表里的「回复」按钮在本组件之外（`CommentsPanel` 里），所以经这里把目标转发给发表区。
      -->
      <CommentComposer
        ref="composerRef"
        class="discussion-composer"
        :page-key="SITE_PAGE_KEY"
        :page-label="SITE_PAGE_LABEL"
        @posted="onPosted"
      />
    </section>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CommentsPanel from '../components/CommentsPanel.vue'
import CommentComposer from '../components/CommentComposer.vue'
import { SITE_PAGE_KEY, SITE_PAGE_LABEL } from '../utils/commentApi.js'
import { useVisibilityPolling } from '../composables/useVisibilityPolling.js'
import { DISCUSSION_POLL_MS } from '../config/discussions.js'

const listRef = ref(null)
/** 发表区（在滚动容器之外）：接收列表里「回复」转发的目标 */
const composerRef = ref(null)
/** 滚动容器 DOM（`ref` 在 setup 期间为 null，所以必须 watch 而不是直接调用） */
const scrollRoot = ref(null)

function scrollToLatest() {
  const el = scrollRoot.value
  if (el) el.scrollTop = el.scrollHeight
}

/**
 * 贴着底部（阈值内）就当作"用户在看最新"，新消息进来时自动跟到底。
 *
 * 阈值取一条**文字**消息的高度量级（新评论实测约 78px）：用户已经自己往上翻了一屏，
 * 就不该再被拽下去。
 */
const NEAR_BOTTOM_PX = 120

function isNearBottom() {
  const el = scrollRoot.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
}

/**
 * **插入之前**是否贴着底部 —— 自动跟随与否只看这一个值。
 *
 * 为什么不能在 watcher 里现算：`flush:'post'` 的 watcher 跑在 DOM 已插入之后，
 * 那时 `scrollHeight` 已经变大，贴底的用户会被算成"已经翻上去了"。文字消息约 78px
 * 还不至于跨过 120px 阈值，但**表情/贴纸消息更高**（贴纸 64px + 署名行 ≈ 124px），
 * 于是"发一条表情消息不自动滚到底"（2026-10-04 用户反馈，复现：gap 992→124）。
 *
 * 维护方式：滚动事件里刷新（用户滚动会触发；程序跟随结束时也停在新底部 → true），
 * 输入过程中发表区高度变化不会触发滚动事件，因此这个值恰好就是"插入前"的状态。
 */
let nearBottomBeforeInsert = true

function refreshNearBottom() {
  nearBottomBeforeInsert = isNearBottom()
}

/**
 * 平滑滚到最新一条，并在随后一小段窗口里**继续贴底**。
 *
 * 为什么不直接 `el.scrollTop = el.scrollHeight`：那是一次瞬移。用户往上翻着历史
 * 点发表时，画面会在**一帧内**被甩出近千像素（实测 471 → 1357），看起来就是"闪一下"。
 * 换成动画曲线后每帧只移动十几像素，是连续位移而不是瞬移。
 *
 * 为什么不用 `scrollTo({behavior:'smooth'})`：它的时长由浏览器决定且无法取消，
 * 后续插入/上滑加载会与它抢滚动位置；自己按帧推进可以随时被新的滚动目标接管。
 *
 * **目标每帧重取**（`el.scrollHeight - el.clientHeight`）：新评论的 DOM 先插入、
 * 高度随后才稳定，写死一个起始目标会在收尾时对不齐，还得再补跳一下。
 *
 * ⚠️ **动画结束后还要再跟一小段（`FOLLOW_SETTLE_MS`）**：表情图片解码、字体回退、
 * 换行落定都可能在动画结束**之后**才改变内容高度，那时位置已经不在底部了——
 * 用户看到的就是"发了表情消息，中间区域没自动滚到底"（2026-10-04 反馈）。
 * 这段窗口内只做"贴到 scrollHeight"，用户一旦自己滚动就立刻放弃（`onUserScroll`）。
 */
const FOLLOW_ANIM_MS = 260
const FOLLOW_SETTLE_MS = 900
let scrollAnimFrame = 0
let scrollingToLatest = false
let followUntil = 0

function cancelScrollToLatest() {
  if (scrollAnimFrame) {
    cancelAnimationFrame(scrollAnimFrame)
    scrollAnimFrame = 0
  }
  scrollingToLatest = false
}

function animateScrollToLatest() {
  const el = scrollRoot.value
  if (!el) return
  cancelScrollToLatest()
  scrollingToLatest = true

  const start = performance.now()
  followUntil = start + FOLLOW_ANIM_MS + FOLLOW_SETTLE_MS
  const from = el.scrollTop
  let rendered = from
  let lastHeight = el.scrollHeight

  const step = (now) => {
    scrollAnimFrame = 0
    if (!scrollRoot.value) {
      scrollingToLatest = false
      return
    }

    const p = Math.min(1, (now - start) / FOLLOW_ANIM_MS)
    if (p < 1) {
      // 目标每帧重取：新评论插入后 `scrollHeight` 会变，写死目标收尾会对不齐
      const to = el.scrollHeight - el.clientHeight
      // easeOutCubic：起步快、收尾稳，接近聊天软件"滑到最新"的手感
      const want = from + (to - from) * (1 - Math.pow(1 - p, 3))
      /*
       * **只增不减**：这里只会"往最新滚"，任何回退都是抖动。
       * 实测浏览器在收尾时会再微调一次 `scrollHeight`（新评论的换行/图片解码），
       * 若直接写 `want` 就会出现 1px 的回落；钳一下即可消除，且不影响总位移。
       */
      rendered = want > rendered ? want : rendered
      el.scrollTop = rendered
      scrollAnimFrame = requestAnimationFrame(step)
      return
    }

    /*
     * 落定窗口：**只在"内容高度又变了"时补一次贴底**，并且一旦发现位置已经被别人
     * （用户、上滑加载、测试里的程序滚动）挪走就立刻放弃。
     *
     * 为什么不是"每帧强制贴底"：那会与任何外部滚动打架——实测 `verify-post-scroll`
     * 的场景 B（往上翻历史时发表，要求列表原地不动）会被这个窗口反复拽回底部。
     * 改成"高度变了才写 + 位置不对就退出"之后，它只补图片解码/字体落定这一种情况。
     */
    const target = el.scrollHeight - el.clientHeight
    if (Math.abs(el.scrollTop - target) > 2) {
      scrollingToLatest = false
      return
    }
    if (el.scrollHeight !== lastHeight) {
      lastHeight = el.scrollHeight
      el.scrollTop = el.scrollHeight
    }
    if (now < followUntil) {
      scrollAnimFrame = requestAnimationFrame(step)
      return
    }
    scrollingToLatest = false
  }

  // 关键：**同步推第一帧**（此刻仍在"DOM 已更新、尚未绘制"这一帧里，用 rAF 启动会多画一帧中间态）
  step(start)
}

/* 用户自己滚动＝想自己看：立刻放弃"滑到最新"，不跟用户抢滚动位置。
   只认用户发起的滚动，程序滚动（scrollingToLatest）不触发。
   顺带刷新"插入前是否贴底"（这个标志只能在插入之前维护，见 nearBottomBeforeInsert）。 */
function onUserScroll() {
  refreshNearBottom()
  if (!scrollingToLatest) cancelScrollToLatest()
}

/**
 * 用户**明确的交互意图**：立刻放弃自动跟随。
 *
 * 为什么不能只靠 `scroll` 事件分辨：程序滚动也会触发 `scroll`，而 0.9 秒的落定窗口里
 * 每帧都在写 `scrollTop`，靠"是不是我们滚的"去猜会很脆。滚轮 / 触摸 / 按键这些事件
 * **只会由用户产生**，用它来打断最可靠（用户往上翻时不该被继续拽到底部）。
 */
function onUserIntent() {
  cancelScrollToLatest()
}

/**
 * 抑制"自动滚到最新"的标志。
 *
 * 往上翻历史（自动加载更早消息）时，`commentsLength` 会变化，
 * 若不管就会把用户又拽回底部（同时也会覆盖 CommentsPanel 内部的锚点补偿）。
 */
let suppressAutoScroll = false

/** 数据是否已经来过一次：首次载入直接落到底，之后的增量才用动画 */
let hadData = false

/**
 * 发表后：
 *   - 正常评论：**只把新那一条并进列表**（不重拉整页，避免列表重建导致滚动条闪烁）；
 *   - 进了待审（`pending`）：它不在公开列表里，才需要重拉一次以保持与真实状态一致。
 *
 * 滚到最新那条由下面的 watch 统一负责（它按"是否贴近底部"决定跟不跟），
 * 这里不再自己滚一次——否则会与 watch 抢滚动目标。
 */
async function onPosted(data) {
  suppressAutoScroll = false
  if (data?.pending) {
    await listRef.value?.reload()
  } else if (data?.comment) {
    listRef.value?.addPostedComment(data.comment)
  }
}

/**
 * 滚动位置的**唯一**决策点。
 *
 * `flush: 'post'` 是关键：它在 DOM 更新之后、浏览器绘制之前执行，所以
 * "插入新评论"和"滚动到最新"落在**同一帧**里。之前用双 rAF 延后两帧才滚，
 * 中间会先绘制一帧"新消息已插进视野、但列表还没跟下去"的画面，
 * 紧接着整块再跳一次——用户看到的就是发表时闪一下。
 *
 * 分工：
 *   - 首次载入（`hadData === false`）：直接落到底，不要动画（打开就该停在最新）；
 *   - 新评论插入：**插入前**就在底部附近才自动跟随；用户往上翻着历史时保持不动；
 *   - 往上翻历史（`suppressAutoScroll`）：完全不滚，位置由 CommentsPanel 的锚点补偿负责。
 */
watch(
  () => listRef.value?.commentsLength,
  (n, old) => {
    if (!n || suppressAutoScroll) return
    if (!hadData) {
      hadData = true
      scrollToLatest()
      return
    }
    /*
     * 判据是 `nearBottomBeforeInsert`（**插入前**记下的状态），不是现算的 `isNearBottom()`：
     * 这个 watcher 跑在 DOM 已插入之后，表情消息有 124px 高，现算会把贴底的用户误判成
     * "已经翻上去了"，于是不跟随（2026-10-04 用户反馈的那个 bug）。
     */
    if (typeof old === 'number' && old > 0 && !nearBottomBeforeInsert) return
    animateScrollToLatest()
  },
  { flush: 'post' }
)

/**
 * 首帧/重新挂载时先落到底（此时还没有列表数据，只是把空容器对齐）。
 * 真正的"停在最新"由上面的 watcher 在数据到位后完成。
 */
watch(
  scrollRoot,
  (el) => {
    if (el) {
      scrollToLatest()
      refreshNearBottom()
    }
  },
  { immediate: true }
)

/**
 * 别人发的消息要**不用重开页面就能出现**（用户明确要求）。
 *
 * 之前中间区域只在挂载时拉一次：`pageKey` 永远是 `site:general` 不会变，
 * 而 `commentEvents` 广播只在同一个标签页内传、不跨设备 ——
 * 所以别的设备发的评论在右栏出现了、中间区域却一直没有，必须重开一次聊天。
 *
 * 这里补上前台轮询，间隔见 `config/discussions.js`（与右栏共用同一个值）：
 *   - 只在前台可见时跑，切走/后台完全停，切回立刻补一次（`useVisibilityPolling`）；
 *   - 刷新走 `mergeNewComments`：**只并新增**，不替换列表，
 *     所以"上滑加载过的更早消息"一条不丢，也不会重置滚动位置；
 *   - 并入后 `commentsLength` 变化会触发上面的 watcher，
 *     于是"贴着底部就跟随、翻着历史就原地不动"的规则照旧生效。
 */
useVisibilityPolling(
  () => listRef.value?.mergeNewComments?.(),
  { intervalMs: DISCUSSION_POLL_MS }
)

/**
 * `?c=<评论 id>` —— 从「谁回复了我 / 我的评论」的「去看看」跳进来时，
 * **滚到那一条并闪一下**（这就是"可点击定位"）。
 *
 * 三个必须处理的现实情况：
 *   1. **那一条可能还没加载**（只在第一页里找）—— 这时只到页面为止，
 *      不报错、不自动翻页去找（找不到就翻页会让用户莫名其妙地看一屏新内容）；
 *   2. **列表是异步来的**，挂载那一刻还没渲染 —— 所以要等 `commentsLength` 变化后重试；
 *   3. 定位完就把参数从地址栏抹掉：否则用户手动滚走再刷新，又会被拽回去。
 */
const route = useRoute()
const router = useRouter()
const locateId = ref(0)

async function locateFromQuery() {
  const raw = route.query?.c
  const id = Number.parseInt(Array.isArray(raw) ? raw[0] : raw, 10)
  if (!Number.isFinite(id) || id <= 0) return
  locateId.value = id
  // 清掉参数（`replace` 不新增历史，返回键仍然回到上一页）
  router.replace({ query: {} })
  await nextTick()
  listRef.value?.scrollToComment?.(id)
}

// 列表首屏到达后再试一次：进来时 commentsLength 还是 0，那一次必然找不到
watch(
  () => listRef.value?.commentsLength,
  (n) => {
    if (locateId.value && n > 0) {
      nextTick(() => listRef.value?.scrollToComment?.(locateId.value))
    }
  }
)

onMounted(() => {
  const el = scrollRoot.value
  el?.addEventListener('scroll', onUserScroll, { passive: true })
  // 落定窗口内用户一有滚动意图就停（滚轮/触摸/按键只可能来自用户）
  el?.addEventListener('wheel', onUserIntent, { passive: true })
  el?.addEventListener('touchstart', onUserIntent, { passive: true })
  el?.addEventListener('keydown', onUserIntent)
  locateFromQuery()
})

onBeforeUnmount(() => {
  const el = scrollRoot.value
  el?.removeEventListener('scroll', onUserScroll)
  el?.removeEventListener('wheel', onUserIntent)
  el?.removeEventListener('touchstart', onUserIntent)
  el?.removeEventListener('keydown', onUserIntent)
  cancelScrollToLatest()
})
</script>

<style scoped>
/* 只保留业务布局；按钮/空态等样式仍来自 theme.css 与 Ui 组件 */
.discussions-page {
  display: flex;
  flex-direction: column;
  /* 用 --vh100 而不是字面量 dvh：旧内核不认 dvh 会整条丢弃（见 UI 组件库 1.6） */
  min-height: calc(var(--vh100) - var(--header-height, 60px) - var(--safe-top, 0px) - 53px);
}

/*
 * 内容区纸张底：与符石图鉴的 `.runes-content`（`background: var(--paper)` + 内边距）同一形态。
 * 不加这层的话讨论直接铺在地图背景上，空态与提示文字几乎读不出来。
 */
.discussion-panel {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  /* 底部内边距取小值：给发表区的 10px 呼吸间距腾出空间，
     使卡片＋滚动条整体上移而不是把发表区顶出面板（见 `.discussion-composer` 说明） */
  padding: 12px 14px calc(6px + var(--safe-bottom, 0px));
  background: var(--paper);
}

.discussion-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-shrink: 0;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-faint);
}

.discussion-title {
  margin: 0;
  color: var(--text-main);
  font-size: 15px;
  line-height: 1.6;
}

/*
 * 滚动容器：`min-height: 0` 是关键——flex 子项默认 min-height:auto 会被内容撑开，
 * 那样消息一多就会把整页撑长、滚动条跑到页面外层（正是用户要求避免的"超出区域"）。
 * 发表区**不在这里面**，所以它始终固定在面板底部。
 *
 * `overflow-anchor: none`：关掉浏览器的**滚动锚定**。它在追加内容时会自行调整滚动位置，
 * 与我们的"滚到最新"互相打架，表现为发表瞬间位置抖动、滚动条闪一下（用户反馈）。
 *
 * `scrollbar-gutter: stable`：滚动条出现/消失不再改变内容宽度，
 * 避免"滚动条一变、列表重排一下"的连带闪烁。
 *
 * ⚠️ **里面 `CommentsPanel` 的尾部外边距必须清掉**（见下方 `:deep`）：
 * `UiSection` 自带 `margin-bottom: 18px`，而讨论区的 `.comments-panel` 正是滚动区里
 * 最后一个区块——这 18px 会变成滚动容器底部的空白尾巴，
 * 表现就是**滚动条比最后一张卡片长出一截**（用户截图指出）。
 * 这里就地清零，不动全局 `UiSection`（其他页面仍需要那 18px 的章节间距）。
 */
.discussion-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  overflow-anchor: none;
  scrollbar-gutter: stable;
  padding-right: 2px;
}

.discussion-scroll :deep(.comments-panel) {
  margin-bottom: 0;
}

/* 列表最后一条之后也不再留外边距：滚动区内容的底边＝最后一张卡片的下沿 */
.discussion-scroll :deep(.comments-list) {
  margin-bottom: 0;
}

/*
 * 发表区：固定在滚动容器之外的下方。
 *
 * **不画分隔线、也不留大段空带**（用户明确要求去掉）：原先 `margin-top:10px` +
 * `padding-top:10px` 那 20px 空白横在"最后一条留言"和"署名行"之间，
 * 看起来像列表底下多出一块没用的区域。
 *
 * 但**不能贴死**：滚动区底边（也就是滚动条的底端）与署名行完全贴在一起会显得挤
 * （用户指出"挨得太近"）。这里留 10px 呼吸间距，并且**同时把面板底部内边距从 14px 收到 6px**，
 * 让"最后一张卡片＋滚动条"这一整块**整体上移约 4px**、滚动条也跟着往上，
 * 而不是把署名行往下推、把发表区挤出面板底边。
 */
.discussion-composer {
  flex: 0 0 auto;
  padding-top: 10px;
}

/*
 * 面板高度用 CSS 固定值（**不要改成脚本量高度**，见下）。
 *
 * 桌面端 App.vue 会把 `[data-main-scroll]` 的滚动整个禁用
 * （`overflow-y: visible !important; max-height: none !important`），改由整页滚动。
 * 不封顶的话讨论列表会无限长、发表区被顶出屏幕、整页多出一条滚动条
 * （实测：.app-container scrollHeight 950 > 900）。
 *
 * `- 190px` 覆盖：顶部 33px 吸附留白 + 面板内边距 + 标题栏 + 发表区。
 *
 * ⚠️ 曾经改成"用 JS 量出真实高度"（`innerHeight - top - 8`）想消除闪烁，
 * 结果**高度不对**（用户反馈），已回退到这个 CSS 固定值。
 * 若要再动高度，务必先在 1025 / 1161 / 1440 三种视口下核对
 * 「输入区底边 ≤ 视口高」且「.app-container 无纵向溢出」。
 */
@media (min-width: 1025px) {
  .discussion-panel {
    height: calc(var(--vh100) - var(--header-height, 60px) - var(--safe-top, 0px) - 190px);
  }
}
</style>
