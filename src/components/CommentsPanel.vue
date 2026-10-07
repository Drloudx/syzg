<template>
  <!-- `listRoot` 只是给滚动监听挂载用的锚点（真正的滚动容器由 CSS/父级决定） -->
  <UiSection
    ref="listRoot"
    :title="title"
    class="comments-panel"
    :data-has-more="hasMore ? '1' : '0'"
    :data-loading="loading ? '1' : '0'"
    :data-count="comments.length"
  >
    <!-- 加载 / 错误 / 空 三态：统一用 UiEmptyState -->
    <UiEmptyState v-if="loading && !comments.length" type="loading" text="评论加载中..." />

    <template v-else>
      <div v-if="errorMessage" class="comments-error" role="alert">
        <UiEmptyState type="error" :text="errorMessage" />
        <UiButton variant="secondary" size="sm" @click="load()">重新加载</UiButton>
      </div>

      <template v-else>
        <ul v-if="shownComments.length" class="comments-list">
          <li v-for="c in shownComments" :key="c.id" class="comment-item" :data-comment-id="c.id">
            <img
              v-if="avatarOf(c)"
              class="comment-avatar"
              :src="avatarOf(c)"
              alt=""
              loading="lazy"
              decoding="async"
            />
            <div v-else class="comment-avatar comment-avatar-fallback" aria-hidden="true">
              {{ (c.nick || '?').slice(0, 1) }}
            </div>

            <div class="comment-main">
              <div class="comment-head">
                <span class="comment-nick">{{ c.nick }}</span>
                <!-- 「回复你」：这条回复的是本机发过的评论（本机有它的删除令牌）。不依赖账号系统 -->
                <span v-if="c.parentId && ownedIds.has(c.parentId)" class="comment-reply-you">回复你</span>
                <time class="comment-time" :datetime="isoTime(c.createdAt)">{{ formatTime(c.createdAt) }}</time>
                <!-- 操作区整块推到行尾：**不能给每个按钮各自 margin-left:auto**，
                     那样「回复」会被推到中间、与「删除」之间空出一大截（实测被指出） -->
                <div class="comment-actions">
                  <button v-if="replyable" type="button" class="comment-reply" @click="requestReply(c)">回复</button>
                  <button
                    v-if="!readOnly && ownedIds.has(c.id)"
                    type="button"
                    class="comment-delete"
                    :disabled="deletingId === c.id"
                    @click="handleDelete(c)"
                  >
                    {{ deletingId === c.id ? '删除中' : '删除' }}
                  </button>
                </div>
              </div>
              <!--
                引用行（回复）：点在父评论还在当前列表里时滚过去。
                `replyTo` 为空但 `parentId` 有值 = 父评论已被删除/隐藏，
                这时只说"已不可见"，不显示内容（服务端也只关联 status=1 的父评论）。
              -->
              <button
                v-if="c.parentId"
                type="button"
                class="comment-quote"
                @click="scrollToComment(c.parentId)"
              >
                <template v-if="c.replyTo">
                  <span class="comment-quote-nick">回复 @{{ c.replyTo.nick }}</span>
                  <span class="comment-quote-body"><EmoticonText :text="c.replyTo.body" /></span>
                </template>
                <!-- 父评论已被删除/隐藏：只说"不可见"，不渲染 @谁（否则会读成"回复 @该消息 该消息已不可见"） -->
                <span v-else class="comment-quote-gone">回复的那条消息已不可见</span>
              </button>
              <!-- 纯文本渲染：不解析 HTML，评论里的标签按原文显示；
                   正文里的 `[e:包:名]` 表情 token 由 EmoticonText 换成图片（其余仍是纯文本） -->
              <p class="comment-body"><EmoticonText :text="c.body" /></p>

              <!--
                楼中楼（详情页形态）：一串回复收在楼主下面，只显示前几条 +
                「全部 N 条回复」/「收起」。站内讨论区是平铺的（`nestedView` 为 false），
                那里回复与普通消息一样按时间排，靠上面的引用行表示"在回应谁"。
              -->
              <div v-if="nestedView && c.replyCount > 0" class="comment-thread">
                <div v-for="r in c.replies" :key="r.id" class="comment-nested" :data-comment-id="r.id">
                  <!-- ⚠️ 这一行必须是 `div` 不能是 `p`：里面放了 `<div class="comment-actions">`，
                       而 `<p>` 只能装行内内容——浏览器遇到 div 会**提前闭合 p**，
                       操作区被甩出头部（Vue 编译期也会警告 "div cannot be child of p"）。 -->
                  <div class="comment-nested-head">
                    <span class="comment-nested-nick">{{ r.nick }}</span>
                    <!-- 只有"回复的是楼内的另一条回复"才带这个前缀（回复楼主本身不用重复说） -->
                    <span v-if="r.parentId !== c.id" class="comment-nested-to">
                      {{ r.replyTo ? `回复 @${r.replyTo.nick}` : '回复的那条消息已不可见' }}
                    </span>
                    <span v-if="ownedIds.has(r.parentId)" class="comment-reply-you">回复你</span>
                    <time class="comment-time" :datetime="isoTime(r.createdAt)">{{ formatTime(r.createdAt) }}</time>
                    <div class="comment-actions">
                      <button v-if="replyable" type="button" class="comment-reply" @click="requestReply(r)">回复</button>
                      <button
                        v-if="!readOnly && ownedIds.has(r.id)"
                        type="button"
                        class="comment-delete"
                        :disabled="deletingId === r.id"
                        @click="handleDelete(r)"
                      >
                        {{ deletingId === r.id ? '删除中' : '删除' }}
                      </button>
                    </div>
                  </div>
                  <p class="comment-nested-body"><EmoticonText :text="r.body" /></p>
                </div>
                <button
                  v-if="c.expanded || c.replyCount > c.preview.length"
                  type="button"
                  class="comment-thread-toggle"
                  :disabled="c.loadingReplies"
                  @click="toggleThread(c)"
                >
                  {{ c.loadingReplies ? '加载中...' : c.expanded ? '收起' : `全部 ${c.replyCount} 条回复` }}
                  <span v-if="!c.loadingReplies" aria-hidden="true">{{ c.expanded ? '▲' : '▼' }}</span>
                </button>
              </div>
              <!-- 右栏预览里要标明"这条来自哪个页面"，否则一串消息没有上下文 -->
              <button
                v-if="showPage && (c.pageLabel || c.pageKey)"
                type="button"
                class="comment-page-link"
                :title="c.pageKey"
                @click="emit('open-page', c)"
              >
                {{ c.pageLabel || c.pageKey }}
              </button>
            </div>
          </li>
        </ul>
        <UiEmptyState v-else :text="readOnly ? '还没有讨论' : '还没有人讨论，来说两句吧'" />

        <!--
          分页入口：**没有按钮**。往上/往下翻到边界就自动加载（见 listRoot 上的滚动监听）——
          "翻到底"本身就是加载意图，再让人点一次按钮是多余的（用户明确要求去掉「加载更多」）。
          加载中/到底了都**不再额外提示**：前者有内容变化本身作为反馈，
          后者用户翻到头自然知道。
        -->
      </template>

      <!-- 删除等操作的失败提示：列表仍然可见，只提示这一次操作失败 -->
      <p v-if="actionError" class="comment-submit-error" role="alert">{{ actionError }}</p>

      <!-- 发表区：只读形态不显示（右栏预览）。
           抽成 CommentComposer 是为了让讨论区页面能把它放到**滚动容器之外**
           （用户要求"悬浮在底部"：留在容器里消息一多就被推出视野）。
           详情页就是普通的"在列表末尾"，**不做吸附**——试过 sticky 吸底，
           实测观感很差（浮层压住最后几条评论），用户明确要求去掉。 -->
      <CommentComposer
        v-if="!readOnly"
        ref="composerRef"
        :page-key="props.pageKey"
        :page-label="props.pageLabel"
        @posted="onPosted"
      />
    </template>
  </UiSection>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { UiButton, UiEmptyState, UiSection } from './ui/index.js'
import CommentComposer from './CommentComposer.vue'
import EmoticonText from './EmoticonText.vue'
import { getImageUrl } from '../utils/env.js'
import { deleteOwnComment, fetchCommentReplies, fetchComments } from '../utils/commentApi.js'
import { avatarCatalogState, avatarPath, loadAvatarCatalog } from '../utils/avatarCatalog.js'

const props = defineProps({
  /**
   * 评论归属键，形如 `item:30047`。
   * 由调用方从业务 ID 推导，不使用 URL 参数（SPEC 第四章：仅已实现的参数做 URL 同步）。
   */
  pageKey: { type: String, default: '' },
  /**
   * 该页面的人话名字（如「银币」），随评论一起存下来。
   * 管理端与账号弹窗据此显示物品名，而不是让用户去看 `item:item_00001` 这种内部标识；
   * 也不需要在打开评论列表时额外加载整份物品表（性能上更划算）。
   */
  pageLabel: { type: String, default: '' },
  /** 区块标题（右栏预览等处可改） */
  title: { type: String, default: '讨论' },
  /** 只读：不显示发表区与删除按钮（右栏预览用） */
  readOnly: { type: Boolean, default: false },
  /**
   * 显示每条消息的「回复」按钮。
   *
   * **与 `readOnly` 解耦**：讨论区页面用 `readOnly` 拿到纯列表，但发表区被放在
   * 滚动容器之外（`DiscussionsView` 自己渲染 `CommentComposer`），回复照样要能用——
   * 所以这里独立成一个开关，由调用方决定"有没有发表区可回复"。
   */
  replyable: { type: Boolean, default: true },
  /** 最多显示几条（0 = 不限，滚动到底自动加载更多） */
  limit: { type: Number, default: 0 },
  /** 每条下方显示它来自哪个页面（聚合列表才用得到；右栏只镜像站内讨论区，恒为 false） */
  showPage: { type: Boolean, default: false },
  /**
   * **楼中楼**（默认开）：只按顶层评论分页，每条下面挂着自己的回复（前几条 +
   * 「全部 N 条回复」）。图鉴详情、角色/魔物/副本弹窗都是这个形态。
   *
   * ⚠️ **`reverse`（聊天式）下强制平铺**，见 `nestedView`：聊天时间线是一维的，
   * 分页、滚动锚点、贴底跟随都建立在这上面；把回复折进楼主会同时打破这三条。
   * 站内讨论区因此不需要显式关掉这个开关，它本来就传了 `reverse`。
   */
  nested: { type: Boolean, default: true },
  /**
   * 聊天式排序：**最新在最后**（站内讨论区与右栏预览用）。
   *
   * 服务端一律按"最新在前"返回，这里整体反转。默认关闭，
   * 因为图鉴详情里的讨论区是"列表"形态（最新的在最上面更符合翻阅习惯），
   * 而聊天形态是"最新在底部、输入框就在下面"。
   */
  reverse: { type: Boolean, default: false }
})

const emit = defineEmits(['open-page', 'loading-earlier', 'reply'])
/** 面板内部的发表区（详情页形态）；讨论区形态没有它，改由父组件接 `@reply` 事件 */
const composerRef = ref(null)

/**
 * 是否用楼中楼形态。
 *
 * `reverse`（聊天式）下一律平铺：那里回复就是一条普通消息 + 一行引用，
 * 折进楼主会打破"一维时间线"（分页游标、滚动锚点、贴底跟随都依赖它）。
 */
const nestedView = computed(() => props.nested && !props.reverse)

/**
 * 点「回复」：把目标交给发表区。
 *
 * 两种形态：
 *   - 详情页：发表区就在本组件里 → 直接 `ref` 调 `startReply`；
 *   - 讨论区：发表区在滚动容器之外（`DiscussionsView` 里）→ 抛 `reply` 事件让父组件转发。
 * 不这样做的话，讨论区页面得把整份列表项复制一遍才能挂上回复按钮。
 */
function requestReply(comment) {
  if (composerRef.value?.startReply) composerRef.value.startReply(comment)
  else emit('reply', comment)
}

/**
 * 滚到某条评论并闪一下（点引用行、或刚发表完回复时定位回去）。
 *
 * ⚠️ **只滚我们自己的滚动容器，不用 `scrollIntoView`**：后者会把**所有**可滚祖先
 * 一起滚动，包括页面本身——详情弹窗里表现为"一操作整个页面往上挤"（用户反馈）。
 * 这里自己算偏移，并把目标放在视口上方 1/3 处（比居中更稳，不会被底部的发表区挡住）。
 *
 * @returns {boolean} **是否找到了目标**。调用方据此决定"要不要另想办法"
 *   （如讨论区的「去看看」在找不到时改显示定位卡片）。
 *   早先这个函数返回 `undefined`，调用方无从判断"是滚过去了还是压根没这条" ——
 *   于是"定位不到"表现为**静默无事发生**。
 */
let flashTimer = 0
function scrollToComment(id) {
  const target = listRoot.value?.$el?.querySelector?.(`[data-comment-id="${id}"]`)
  if (!target) return false
  const scroller = resolveScroller()
  if (scroller) {
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    const top = scroller.scrollTop + offset - scroller.clientHeight / 3
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }
  target.classList.add('is-quote-flash')
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => target.classList.remove('is-quote-flash'), 1200)
  return true
}

onBeforeUnmount(() => clearTimeout(flashTimer))

/** 实际上列表里显示的条目（`limit` 只是截断展示，不改变分页状态） */
const shownComments = computed(() =>
  props.limit > 0 ? comments.value.slice(0, props.limit) : comments.value
)

/**
 * 已载入的条数。供父组件判断"列表是否已经来了数据"
 * （讨论区页面用它决定何时滚到最新一条）。
 */
const commentsLength = computed(() => comments.value.length)

const comments = ref([])
const loading = ref(false)
const errorMessage = ref('')
/** 删除等操作的失败提示（与"加载失败"分开：列表仍可见，只提示这次操作失败） */
const actionError = ref('')
const cursor = ref(null)
const hasMore = ref(false)
const deletingId = ref(null)

/** 本机发表过的评论 id，用于显示"删除"按钮 */
const ownedIds = ref(new Set())

/**
 * 发表成功后的回调（由 CommentComposer 触发）。
 *
 * 默认**只把这一条并进列表**（`addPostedComment`），不整页重拉：详情页现在也会
 * 滚动自动加载多页，重拉会把用户翻出来的那些页丢掉、滚动位置也会跳。
 *
 * ⚠️ **待审也不重拉**：待审的评论不在公开列表里，重拉只会让列表瞬间变短、
 * 页面"挤一下"（用户反馈"一回复页面挤上去了"），而"已提交待审核"的提示由发表区自己给。
 * 只有连评论对象都没拿到（异常返回）才退回整页重拉。
 */
async function onPosted(data) {
  actionError.value = ''
  const comment = data?.comment
  if (!comment?.id) {
    await load()
    return
  }
  await addPostedComment(comment)
}

/**
 * 供父组件在"发表区在组件外"时刷新列表（讨论区页面就是这种结构）。
 * 例如 DiscussionsView 把 CommentComposer 放在滚动容器之外，
 * 发完由它调用本方法，让列表与发表区状态保持一致。
 * 返回 Promise，调用方可以 `await` 后再滚到最新一条。
 */
function reload() {
  actionError.value = ''
  return load()
}

/**
 * 发表成功后**只把新评论并进列表**，不重新拉整页。
 *
 * 为什么不能直接 `reload()`：重拉会用服务端返回的新数组整体替换 `comments`，
 * Vue 于是把全部列表项**销毁重建**；重建期间 `scrollHeight` 会短暂变化，
 * 表现为"滚动条忽然变长又变短地闪一下"（用户反馈）。
 * 只 push/unshift 一条，其余 DOM 完全不动，就没有这个闪烁。
 *
 * 列表顺序与 `reverse` 一致：聊天式最新在末尾（push），列表式最新在开头（unshift）。
 *
 * ⚠️ **楼中楼里发的是回复**（`parentId` 有值）时不走上面那套：它属于某一层楼，
 * 直接插到顶层会多出一条"孤儿回复"。这里改成**重新取那一串回复**并把该楼展开，
 * 这样计数、顺序、`回复 @谁` 前缀全都与服务端一致（一次请求，不影响其它楼）。
 */
async function addPostedComment(comment) {
  if (!comment?.id) return
  if (nestedView.value && comment.parentId) {
    const root = findThreadRoot(comment.parentId)
    if (root) {
      await loadThread(root, { force: true })
      root.expanded = true
      syncOwned()
      /*
       * 回到那一层楼并闪一下：用户可能是在列表别处点的「回复」，
       * 不把视线带回去，他看不出自己那条落到了哪里（用户要求"能定位回去"）。
       */
      await nextTick()
      scrollToComment(root.id)
      return
    }
  }
  if (props.reverse) comments.value = [...comments.value, comment]
  else comments.value = [toThread(comment), ...comments.value]
  syncOwned()
}

/** 找某条评论所属的楼（`parentId` 可能是楼主本身，也可能是楼里的一条回复） */
function findThreadRoot(id) {
  return comments.value.find(
    (c) => c.id === id || c.replies?.some((r) => r.id === id) || c.allReplies?.some((r) => r.id === id)
  )
}

defineExpose({
  reload,
  addPostedComment,
  /** 轮询刷新：只并新增，不替换列表、不动滚动位置、不显示加载态 */
  mergeNewComments,
  /**
   * 滚到某条评论并闪一下（找不到就什么都不做）。
   *
   * 供「谁回复了我 / 我的评论」的「去看看」用：跳进讨论区后要定位到那一条，
   * 否则用户落在一屏评论里还得自己找。**找不到是正常情况** ——
   * 那一条可能在还没加载的分页里，这时只到页面为止，不要报错。
   */
  scrollToComment,
  commentsLength,
  hasMore,
  loading
})

/**
 * 认领"我发过的评论"：服务端在每条评论上给了 `mine` 布尔（由 `comments.user_id`
 * 与当前会话比对得出），客户端只负责把它收集成一个 id 集合。
 *
 * ⚠️ **必须连楼中楼里的回复一起扫**：嵌套回复的「删除」按钮同样看 `ownedIds`，
 * 只扫顶层的话自己刚发的回复会没有删除入口（实测被指出："回复怎么没有删除"）。
 * `allReplies` 是展开过的全量缓存，也要一起扫，否则收起状态下删不了。
 *
 * 🔴 **换成 `mine` 之后解决了一个老问题**：以前归属靠"本机存的删除令牌"，
 * 于是**换个设备就删不掉自己发的评论**。现在归属在服务端，跨设备一致。
 */
function syncOwned() {
  const set = new Set()
  const consider = (c) => {
    if (c?.id && c.mine) set.add(c.id)
  }
  for (const c of comments.value) {
    consider(c)
    for (const r of c.replies || []) consider(r)
    for (const r of c.allReplies || []) consider(r)
  }
  ownedIds.value = set
}

/** 把评论的 avatar ID 换成图片地址；清单未加载或 ID 未知时返回空串，走昵称首字占位 */
function avatarOf(comment) {
  if (!comment?.avatar) return ''
  const path = avatarPath(comment.avatar)
  return path ? getImageUrl(path) : ''
}

/**
 * 把服务端返回的一条顶层评论标准化成楼中楼形态的本地结构。
 *
 * 三个"显示态"字段是分开的，不要合并：
 *   - `preview`：服务端给的预览回复（收起时显示这些，永远不变）；
 *   - `replies`：**当前显示**的回复（展开后是全部，收起时回到 `preview`）；
 *   - `allReplies`：展开过一次后的全部回复缓存（再展开不再请求）。
 * 混用它们就会出"收起后少了一条""展开后重复"这类问题。
 */
function toThread(root) {
  const preview = root.replies || []
  return {
    ...root,
    preview,
    replies: preview,
    replyCount: root.replyCount ?? preview.length,
    expanded: false,
    loadingReplies: false,
    allReplies: null
  }
}

async function load({ append = false } = {}) {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchComments(props.pageKey, {
      cursor: append ? cursor.value : undefined,
      nested: nestedView.value
    })
    const page = nestedView.value ? data.comments.map(toThread) : data.comments

    /*
     * 排序：服务端一律按 **id 倒序**（最新在前）。
     *
     * `reverse` 模式（站内讨论区，聊天式）下改为**最新在最后**：
     * 接口是"最新在前"，所以整体反转即可；而"加载更早的"这一页同样是"最新在前"，
     * 反转后应**接在列表最前面**（`append` 时用 prepend 而不是 push）。
     */
    if (props.reverse) {
      const reversed = [...page].reverse()
      comments.value = append ? [...reversed, ...comments.value] : reversed
    } else {
      comments.value = append ? [...comments.value, ...page] : page
    }

    hasMore.value = !!data.hasMore
    cursor.value = data.nextCursor ?? null
    syncOwned()
  } catch (err) {
    // 只展示面向用户的中文；技术原因由 commentApi 写进控制台
    errorMessage.value = err?.message || '评论加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

/** 展开/收起一层楼的回复（展开时按需取那一串的全部回复，取过就缓存） */
async function toggleThread(root) {
  if (root.loadingReplies) return
  if (root.expanded) {
    root.expanded = false
    root.replies = root.preview
    return
  }
  if (root.allReplies) {
    root.replies = root.allReplies
    root.expanded = true
    return
  }
  await loadThread(root)
  root.expanded = true
}

/** 取某一层楼的全部回复（`force` 用于"刚发完一条回复"后刷新） */
async function loadThread(root, { force = false } = {}) {
  if (!root?.id) return
  if (root.allReplies && !force) {
    root.replies = root.allReplies
    return
  }
  root.loadingReplies = true
  try {
    const data = await fetchCommentReplies(props.pageKey, root.id)
    root.allReplies = data?.comments || []
    root.replies = root.allReplies
    // 服务端返回的条数才是权威（本地只是乐观显示）
    root.replyCount = Math.max(root.replyCount, root.allReplies.length)
  } catch (err) {
    actionError.value = err?.message || '回复加载失败，请稍后重试'
  } finally {
    root.loadingReplies = false
  }
}

/**
 * 真正实现"只并新增"的刷新（轮询用）。
 *
 * 为什么不能直接复用 `load()`：`load()` 会拿服务端那一页**整体替换** `comments`，
 * 而用户可能已经"上滑加载更早消息"拉进来好几页——替换等于把那些历史丢掉。
 * 这里按 id 只挑本地没有的新条目并进对应端（聊天式接在末尾、列表式接在开头）。
 *
 * 另外两条也是必须的：
 *   - **不显示加载态也不弹错**：轮询周期比人眼快，闪加载态比不刷新更烦；
 *     失败就静默保留已有内容，下个周期还会再试（用户没在操作，不该被打扰）；
 *   - **不动滚动位置**：合并后 `commentsLength` 变化会走 `DiscussionsView` 的 watcher，
 *     而那个 watcher 只在"插入前就贴着底部"时才滚动——用户翻着历史时原地不动。
 *
 * @returns {Promise<number>} 实际并入的新条目数（0 表示没有新内容或失败）
 */
async function mergeNewComments() {
  /*
   * 楼中楼**不做增量合并**：一条新回复必须落在它那层楼里，平铺着并进来会变成孤儿。
   * 详情页也不轮询（轮询只在站内讨论区与右栏），所以这里直接返回 0 而不是做半套。
   */
  if (nestedView.value) return 0
  try {
    const data = await fetchComments(props.pageKey)
    const incoming = data?.comments || []
    if (!incoming.length) return 0

    const known = new Set(comments.value.map((c) => c.id))
    const fresh = incoming.filter((c) => !known.has(c.id))
    if (!fresh.length) return 0

    if (props.reverse) {
      // 聊天式：最新在末尾，新的接在后面（服务端是倒序，所以先翻正）
      comments.value = [...comments.value, ...[...fresh].reverse()]
    } else {
      // 列表式：最新在开头
      comments.value = [...fresh, ...comments.value]
    }
    syncOwned()
    return fresh.length
  } catch {
    return 0
  }
}

/**
 * 绑定滚动监听。
 *
 * **必须挂在真正的滚动祖先上，不能用 capture 挂在自己身上**：
 * capture 只能捕获**后代**的滚动事件，而这里的滚动容器（`.discussion-scroll` /
 * `#itemModalScroll`）是本组件的**祖先**——挂在自己身上永远收不到（实测踩到过）。
 *
 * 也不在 `onMounted` 里一次找完就罢：那一刻列表可能还没渲染出滚动高度，
 * `findScrollParent` 会因为 `scrollHeight <= clientHeight` 而找不到目标。
 * 所以用 watcher 在有数据后重试。
 */
const listRoot = ref(null)
let boundScroller = null

function scrollHost() {
  return listRoot.value?.$el || listRoot.value || null
}

function findScrollParent(el) {
  let node = el?.parentElement
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY
    if (oy === 'auto' || oy === 'scroll') return node
    node = node.parentElement
  }
  return null
}

/** 找一个**能滚**的祖先；找不到时退回到最近的可滚样式祖先（内容还没撑开的情况） */
function resolveScroller() {
  const host = scrollHost()
  let node = host?.parentElement
  let fallback = null
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY
    if (oy === 'auto' || oy === 'scroll') {
      if (!fallback) fallback = node
      if (node.scrollHeight > node.clientHeight + 4) return node
    }
    node = node.parentElement
  }
  return fallback
}

/**
 * 加载下一页（两种方向共用）。
 *
 * `fromTop`（聊天式）：新页要**接在最前面**，加载后必须做锚点补偿，否则用户会被
 * 顶下去一大截；同时要通知父组件"这是往上补历史，别自动滚到底"（它会 watch 条数变化）。
 * 非 `fromTop`（详情页的列表形态）：新页接在**末尾**，浏览器本身不会跳动，无需补偿。
 */
async function loadMore({ fromTop, scroller } = {}) {
  if (!hasMore.value || loading.value) return
  const root = scroller || resolveScroller()
  if (!fromTop) {
    await load({ append: true })
    return
  }
  if (!root) return

  const anchor = root.querySelector?.('.comment-item')
  const before = anchor ? anchor.getBoundingClientRect().top - root.getBoundingClientRect().top : 0

  emit('loading-earlier', true)
  try {
    await load({ append: true })
    await nextTick()
    const anchorAfter = root.querySelector?.('.comment-item')
    if (anchorAfter) {
      const after = anchorAfter.getBoundingClientRect().top - root.getBoundingClientRect().top
      root.scrollTop += after - before
    }
  } finally {
    emit('loading-earlier', false)
  }
}

function onListScroll(event) {
  if (!hasMore.value || loading.value) return
  const root = event?.currentTarget || resolveScroller()
  if (!root) return
  /*
   * 触发方向跟着列表方向走：
   *   - 聊天式（`reverse`）：更早的在上方，滚到**顶部**附近就补历史；
   *   - 列表式（详情页）：更多在下方，滚到**底部**附近就接着加载。
   * 阈值给 120px，避免"必须精准拖到底"的手感。
   */
  if (props.reverse) {
    if (root.scrollTop <= 80) loadMore({ fromTop: true, scroller: root })
    return
  }
  if (root.scrollHeight - root.scrollTop - root.clientHeight <= 120) loadMore({ fromTop: false, scroller: root })
}

function bindScroller() {
  const next = resolveScroller()
  if (!next || next === boundScroller) return
  boundScroller?.removeEventListener('scroll', onListScroll)
  next.addEventListener('scroll', onListScroll, { passive: true })
  boundScroller = next
}

watch(
  () => comments.value.length,
  () => nextTick(bindScroller),
  { immediate: true }
)

onBeforeUnmount(() => {
  boundScroller?.removeEventListener('scroll', onListScroll)
  boundScroller = null
})

/**
 * 删除自己的评论。
 *
 * 三条稳健性要求（都来自实际使用反馈）：
 *   1. **没有登录/不是自己的必须给出提示**。原先直接 `return` 什么都不做，
 *      表现就是"点删除只闪一下、没任何反应"——最难排查的一种失败。
 *   2. **把 403/404 当成"已经不在"**。服务端的删除是幂等的：评论已不可见时返回成功。
 *      客户端仍要容忍旧快照带来的 404，否则用户会看到"评论明明还在，却说不存在"。
 *   3. 无论服务端怎么回，删完都做一次列表刷新，让界面与真实状态对齐。
 */
async function handleDelete(comment) {
  if (deletingId.value) return
  if (!comment?.mine) {
    actionError.value = '只能删除自己发表的评论'
    return
  }

  deletingId.value = comment.id
  actionError.value = ''
  try {
    await deleteOwnComment(comment.id)
    comments.value = comments.value.filter((c) => c.id !== comment.id)
    syncOwned()
  } catch (err) {
    if (err?.status === 404) {
      // 服务端认为它已经不在了：删除的目标状态已达成，按成功处理
      comments.value = comments.value.filter((c) => c.id !== comment.id)
      syncOwned()
    } else {
      actionError.value = err?.message || '删除失败，请稍后重试'
      // 失败时刷新一次列表，让用户看到真实状态（可能已在别处被删）
      try {
        await load()
      } catch {
        /* 刷新失败不再叠加提示，保留上面的错误文案 */
      }
    }
  } finally {
    deletingId.value = null
  }
}

/** 时间 → 相对时间（近 7 天）或日期 */
function formatTime(unixSec) {
  const diff = Math.floor(Date.now() / 1000) - unixSec
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  const d = new Date(unixSec * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoTime(unixSec) {
  return new Date(unixSec * 1000).toISOString()
}

/**
 * 数据加载时机。
 *
 * - **普通形态**（详情里的讨论区）：换 pageKey 时重置并重新加载；
 *   默认展开、挂载即拉评论（按用户要求保持"直接看见讨论"的体验）。
 *   额度提醒（2026-10-02 记录，用户明确要求暂不优化）：物品图鉴是首页、点开很频繁，
 *   因此"每次打开详情一次评论请求"是评论功能最大的一项固定开销。要省额度时把本节的
 *   `UiSection` 改成 `collapsible` + 默认收起、展开时才 `load()` 即可（改动只需几行）。
 */
watch(
  () => props.pageKey,
  () => {
    comments.value = []
    cursor.value = null
    hasMore.value = false
    actionError.value = ''
    if (props.pageKey) load()
  },
  { immediate: true }
)

// 有评论带头像时才需要清单
watch(
  comments,
  (list) => {
    if (list.some((c) => c.avatar) && avatarCatalogState.value === 'idle') loadAvatarCatalog()
  },
  { immediate: true }
)
</script>

<style scoped>
/* 只保留业务特殊布局；面板底色/描边/按钮一律来自 theme.css 与 Ui 组件 */
.comments-list {
  list-style: none;
  margin: 0 0 4px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 每条评论做成卡片：与符石图鉴的 .rune-entry 同一套视觉
   （--paper-soft 底 + 1px --border-soft 描边 + 6px 圆角），
   让讨论区和物品详情的其它 UiSection 在观感上分开。
   注意：详情里"卡片不从上方面板缝里露出来"靠的是 App.vue 对
   `[data-main-scroll]` 的裁剪（UiModal 的 .ui-modal-body 已按 header 底边裁剪），
   与卡片自身的背景/层叠无关——不要为此加 z-index 或改背景。 */
.comment-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: var(--paper-soft);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
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

.comment-main {
  flex: 1 1 auto;
  min-width: 0;
}

.comment-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.comment-nick {
  color: var(--text-main);
  font-size: 14px;
  font-weight: 700;
}

.comment-time {
  color: var(--text-faint);
  font-size: 12px;
}

.comment-delete {
  padding: 0;
  border: none;
  background: none;
  color: var(--danger);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.comment-delete:disabled {
  opacity: 0.6;
  cursor: default;
}

/* 操作区（回复 / 删除）整块贴行尾；间距由容器给，不给按钮各自 margin */
.comment-actions {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-left: auto;
}

/*
 * 「回复」：平时低对比（每条都有，太抢眼会很吵），悬停/键盘聚焦时提亮。
 */
.comment-reply {
  padding: 0;
  border: none;
  background: none;
  color: var(--text-faint);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.comment-reply:hover,
.comment-reply:focus-visible {
  color: var(--accent-ink);
}

/* 「回复你」：本机发过的评论被回复时标一下（不依赖账号系统，靠本机删除令牌认领） */
.comment-reply-you {
  padding: 0 6px;
  border-radius: 3px;
  background: var(--accent-bright);
  color: var(--paper);
  font-size: 11px;
  line-height: 1.6;
}

/*
 * 引用行：左侧一道竖线 + 灰底，弱于正文——它是"这条在回应谁"的注解，不是内容本身。
 * 整行可点（滚到父评论），所以用 `button` 而不是 `div`：键盘也能触发。
 */
.comment-quote {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 4px 0 0;
  padding: 3px 8px;
  border: none;
  border-left: 2px solid var(--border-color);
  border-radius: 0 3px 3px 0;
  background: var(--paper-soft);
  color: var(--text-faint);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
  cursor: pointer;
}

.comment-quote:hover {
  border-left-color: var(--accent-bright);
}

.comment-quote-nick {
  color: var(--accent-ink);
  font-weight: 700;
}

/* 摘录单行省略：引用不该把一条消息撑成三行 */
.comment-quote-body {
  display: inline;
  margin-left: 4px;
  overflow: hidden;
}

.comment-quote-gone {
  margin-left: 4px;
  font-style: italic;
}

/* 从引用跳过去时闪一下，否则用户看不出滚到了哪条 */
.comment-item.is-quote-flash {
  animation: comment-quote-flash 1.2s ease-out;
}

/*
 * 楼中楼：一串回复收在楼主下面。
 *
 * 视觉上"退一级"：左侧一道浅竖线 + 略微缩进，字号比楼主小一档——
 * 这样一眼能看出哪些是回复、哪些是新的楼主（B 站那种两层形态）。
 * 回复**不带头像**：整块本来就窄，再放一次头像会把正文挤成一条。
 */
.comment-thread {
  margin: 6px 0 0 6px;
  padding-left: 10px;
  border-left: 2px solid var(--border-faint, rgba(143, 115, 81, 0.25));
}

.comment-nested {
  padding: 4px 0;
}

.comment-nested + .comment-nested {
  border-top: 1px dashed var(--border-faint, rgba(143, 115, 81, 0.25));
}

.comment-nested-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
}

.comment-nested-nick {
  color: var(--accent-ink);
  font-weight: 700;
}

/* 「回复 @谁」：比昵称弱一档，不抢正文的注意力 */
.comment-nested-to {
  color: var(--text-faint);
}

.comment-nested-body {
  margin: 1px 0 0;
  color: var(--text-main);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

/* 嵌套回复上的「回复 / 删除」：与楼主的同款小字按钮，但更紧凑 */
.comment-nested-head .comment-reply,
.comment-nested-head .comment-delete {
  font-size: 11.5px;
}

.comment-thread-toggle {
  display: inline-block;
  margin: 4px 0 2px;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  color: var(--accent-ink);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.comment-thread-toggle:hover:not(:disabled) {
  border-color: var(--border-faint, rgba(143, 115, 81, 0.25));
  background: var(--hover-bg, rgba(85, 117, 116, 0.14));
}

.comment-thread-toggle:disabled {
  color: var(--text-faint);
  cursor: default;
}

@keyframes comment-quote-flash {
  0%,
  30% {
    background: var(--accent-bright, #7a9a99);
  }
  100% {
    background: transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .comment-item.is-quote-flash {
    animation: none;
    outline: 2px solid var(--accent-bright);
  }
}

.comment-delete:hover:not(:disabled) {
  text-decoration: underline;
}

/* 正文 ≥13px、行高 ≥1.6（UI 组件库 1.3 可读性红线）；长词强制换行 */
.comment-body {
  margin: 4px 0 0;
  color: var(--text-main);
  font-size: 13.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

/* 聚合列表里标注「这条来自哪个页面」：做成可点的小胶囊（`showPage` 才渲染） */
.comment-page-link {
  margin-top: 6px;
  padding: 1px 7px;
  border: 1px solid var(--border-soft);
  border-radius: 3px;
  background: var(--paper-solid);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-page-link:hover {
  border-color: var(--accent-bright);
  color: var(--accent-ink);
}

.comments-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
}

.comment-form {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-faint);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comment-identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.comment-identity-text {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
  min-width: 0;
}

.comment-identity-text strong {
  color: var(--text-main);
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
  resize: vertical;
  min-height: 72px;
}

.comment-textarea:focus {
  outline: 2px solid var(--accent-bright);
  outline-offset: 1px;
}

.comment-textarea::placeholder {
  color: var(--text-faint);
}

/* 蜜罐：正常用户与屏幕阅读器都感知不到。
   刻意不用 display:none —— 部分机器人只跳过 display:none 的字段；
   用 visibility:hidden + opacity:0 + 尺寸归零，元素仍在 DOM 与无障碍树之外。 */
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

.comment-count {
  color: var(--text-faint);
  font-size: 12px;
  margin-right: auto;
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
