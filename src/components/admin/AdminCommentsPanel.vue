<template>
  <section class="admin-panel">
    <div class="admin-toolbar">
      <div class="admin-filters">
        <button
          v-for="f in FILTERS"
          :key="f.value"
          type="button"
          class="admin-chip"
          :class="{ 'is-on': statusFilter === f.value }"
          @click="setFilter(f.value)"
        >
          {{ f.label }}
          <template v-if="f.value === '0' && pendingCount > 0">（{{ pendingCount }}）</template>
        </button>
      </div>

      <input
        :value="searchInput"
        class="admin-input admin-search"
        type="search"
        placeholder="搜正文 / 昵称 / 页面标识"
        @input="onSearchInput($event.target.value)"
        @keydown.enter="applySearch"
      />
      <button type="button" class="admin-btn admin-btn--sm" @click="applySearch">搜索</button>
      <button v-if="searchQuery" type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="clearSearch">
        清除
      </button>
    </div>

    <!--
      页面类型筛选：**横排按钮，不用下拉**。
      后台是电脑端专用，横排能一眼看全、一次点击到位；下拉要多两次交互。
      移动端才需要下拉（窄屏横排会换行挤成一团），这里不必迁就。
    -->
    <div class="admin-toolbar admin-toolbar--kinds">
      <div class="admin-filters">
        <button
          v-for="k in PAGE_KINDS"
          :key="k.value"
          type="button"
          class="admin-chip admin-chip--sm"
          :class="{ 'is-on': pageKind === k.value }"
          @click="setPageKind(k.value)"
        >
          {{ k.label }}
        </button>
      </div>
    </div>

    <!--
      批量操作栏：**选中有东西时才出现**，不占常驻空间。
      放在工具栏下方而不是表格里，是为了让它不会随横向滚动跑掉。
    -->
    <div v-if="selectedIds.length" class="admin-batch-bar">
      <span class="admin-batch-count">已选 {{ selectedIds.length }} 条</span>
      <button type="button" class="admin-btn admin-btn--sm" @click="batchChangeStatus(1)">批量放行</button>
      <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="batchChangeStatus(2)">批量隐藏</button>
      <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="openBatchPending">批量转待审</button>
      <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="clearSelection">取消选择</button>
      <span v-if="selectedIds.length > BATCH_MAX" class="admin-batch-warn">
        一次最多 {{ BATCH_MAX }} 条，请分批
      </span>
    </div>

    <!--
      命中原因筛选：**词表误伤时的批量处理入口**。
      某个词收得太宽时，靠翻列表一条条找不现实，这里一次捞出那批。
    -->
    <div class="admin-toolbar admin-toolbar--kinds">
      <div class="admin-filters">
        <button
          v-for="f in REASON_FILTERS"
          :key="f.value"
          type="button"
          class="admin-chip admin-chip--sm"
          :class="{ 'is-on': reasonFilter === f.value }"
          @click="setReasonFilter(f.value)"
        >
          {{ f.label }}
        </button>
      </div>
      <span class="admin-filter-sep" aria-hidden="true"></span>
      <div class="admin-filters">
        <button
          v-for="f in NOTE_FILTERS"
          :key="f.value"
          type="button"
          class="admin-chip admin-chip--sm"
          :class="{ 'is-on': noteFilter === f.value }"
          @click="setNoteFilter(f.value)"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <!--
      只看某人的评论（从用户列表点评论数进来）。
      用**内部 id** 筛，不是昵称 —— 昵称是发表时的快照，改名后就搜不到了。
    -->
    <div v-if="userFilter" class="admin-user-filter">
      <span>只看 <strong>{{ userFilter.nick || `#${userFilter.id}` }}</strong> 的评论</span>
      <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="clearUserFilter">
        取消
      </button>
    </div>

    <p v-if="errorMessage" class="admin-error">{{ errorMessage }}</p>
    <p v-if="loading && !comments.length" class="admin-hint">正在加载…</p>
    <p v-else-if="!comments.length && !errorMessage" class="admin-hint">
      {{ searchQuery ? '没有匹配的评论。' : '这一档没有评论。' }}
    </p>

    <div v-else class="admin-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width: 40px">
              <input
                type="checkbox"
                class="admin-check"
                :checked="allVisibleSelected"
                :indeterminate.prop="someVisibleSelected && !allVisibleSelected"
                :title="allVisibleSelected ? '取消全选本页' : '全选本页'"
                @change="toggleAllVisible($event.target.checked)"
              />
            </th>
            <th style="width: 56px">#</th>
            <th style="width: 120px">作者</th>
            <th>正文</th>
            <th style="width: 130px">页面</th>
            <th style="width: 92px">状态</th>
            <th style="width: 140px">时间</th>
            <th style="width: 250px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in comments" :key="c.id" :class="{ 'is-selected': selectedIds.includes(c.id) }">
            <td>
              <input
                type="checkbox"
                class="admin-check"
                :checked="selectedIds.includes(c.id)"
                :aria-label="`选择评论 #${c.id}`"
                @change="toggleOne(c.id, $event.target.checked)"
              />
            </td>
            <td class="admin-num">{{ c.id }}</td>
            <td class="admin-cell-wrap">
              {{ c.nick }}
              <!-- 账号体系之后的新评论带 userId；老的（账号之前）为空 -->
              <span v-if="c.userId" class="admin-num admin-userid">#{{ c.userId }}</span>
            </td>
            <td class="admin-cell-wrap">
              <EmoticonText :text="c.body" />
              <div v-if="c.parentId" class="admin-quote">回复 #{{ c.parentId }}</div>
              <div v-if="c.reviewReason" class="admin-quote admin-quote--warn">命中：{{ c.reviewReason }}</div>
              <!-- 管理员手填的转待审原因：只有「待审」档才可能有值（放行/隐藏后服务端会清空） -->
              <div v-if="c.reviewNote" class="admin-quote admin-quote--note">待审原因：{{ c.reviewNote }}</div>
            </td>
            <td class="admin-cell-wrap">{{ c.pageLabel || c.pageKey }}</td>
            <td>{{ statusLabel(c.status) }}</td>
            <td class="admin-num">{{ formatTime(c.createdAt) }}</td>
            <td>
              <div class="admin-row-actions">
                <button v-if="c.status !== 1" type="button" class="admin-btn admin-btn--sm" @click="changeStatus(c, 1)">
                  放行
                </button>
                <button v-if="c.status !== 2" type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="changeStatus(c, 2)">
                  隐藏
                </button>
                <!--
                  「转待审」：把一条**已处理过**的评论放回待办队列。
                  `status = 0` 只在那边表示"不公开 + 计入待办"，与「已隐藏」的
                  唯一区别就是**算不算在待处理里**（概览页那张卡片据此描红）。
                  所以这个按钮的价值是"挂起待定"，而不是改变可见性。
                -->
                <button
                  v-if="c.status !== 0"
                  type="button"
                  class="admin-btn admin-btn--ghost admin-btn--sm"
                  @click="changeStatus(c, 0)"
                >
                  转待审
                </button>
                <button
                  type="button"
                  class="admin-btn admin-btn--danger admin-btn--sm"
                  :disabled="deletingId === c.id"
                  @click="hardDelete(c)"
                >
                  {{ deletingId === c.id ? '删除中' : '彻底删除' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="hasMore" class="admin-more">
      <button type="button" class="admin-btn admin-btn--ghost" :disabled="loading" @click="loadMore">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
    </div>

    <!--
      「转待审」原因输入。
      用 UiModal 而不是 window.prompt：prompt 在部分浏览器被禁用、样式不受控、
      且不能显示正文摘要（管理员需要对着原文写原因）。
    -->
    <UiModal
      :visible="pendingTarget !== null"
      teleport-to="body"
      title="转为待审"
      max-width="520px"
      @update:visible="(v) => { if (!v) cancelPending() }"
    >
      <p class="admin-modal-lead">
        <template v-if="batchPendingMode">
          把选中的 <strong>{{ selectedIds.length }}</strong> 条评论打回「待审」队列，让其他管理员知道为什么。
        </template>
        <template v-else>
          把 <strong>#{{ pendingTarget?.id }}</strong> 打回「待审」队列，让其他管理员知道为什么。
        </template>
      </p>
      <p v-if="!batchPendingMode" class="admin-modal-quote">{{ String(pendingTarget?.body || '').slice(0, 80) }}</p>
      <!-- 批量时原因对**整批**生效，说清楚免得以为是逐条填 -->
      <p v-else class="admin-modal-quote">这条原因会应用到全部选中的评论。</p>

      <label class="admin-modal-label" for="pending-note">
        待审原因<span class="admin-modal-optional">（可留空）</span>
      </label>
      <!-- 常用选项：点一下就填，仍可自由编辑。超管可在「设置」里维护这份清单 -->
      <div v-if="presets.length" class="admin-preset-row">
        <button
          v-for="p in presets"
          :key="p.id"
          type="button"
          class="admin-chip admin-chip--sm"
          @click="applyPreset(p.text)"
        >
          {{ p.text }}
        </button>
      </div>
      <input
        id="pending-note"
        v-model="pendingNote"
        class="admin-input"
        type="text"
        :maxlength="REVIEW_NOTE_MAX"
        placeholder="如：重复发帖 / 与主题无关 / 外链待确认"
        @keydown.enter="confirmPending"
      />
      <p class="admin-modal-count">{{ pendingNote.length }} / {{ REVIEW_NOTE_MAX }}</p>

      <template #footer>
        <button type="button" class="admin-btn admin-btn--ghost" @click="cancelPending">取消</button>
        <button type="button" class="admin-btn" :disabled="savingPending" @click="confirmPending">
          {{ savingPending ? '处理中…' : '确认转待审' }}
        </button>
      </template>
    </UiModal>
  </section>
</template>

<script setup>
/**
 * 后台 · 评论管理。
 *
 * 从旧的 `views/AdminCommentsView.vue` 搬过来（那时它是**整个页面**，
 * 现在只是后台外壳里的一个面板）：去掉它自己的令牌闸门与页头
 * （那些归 `AdminView.vue`），只留列表本身。
 *
 * 「彻底删除」是真删除，不可恢复 —— 所以按钮做成红色描边而不是实心红，
 * 与「隐藏」（可恢复）在视觉上区分开。想下架请用隐藏。
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmoticonText from '../EmoticonText.vue'
import UiModal from '../ui/UiModal.vue'
import {
  AdminApiError,
  deleteCommentPermanently,
  fetchAdminComments,
  fetchReviewPresets,
  setCommentStatus
} from '../../utils/adminApi.js'

/** 待审原因长度上限，必须与后端 `REVIEW_NOTE_MAX` 一致（服务端超长会回 400） */
const REVIEW_NOTE_MAX = 80

/** 默认看待审：管理端进来通常就是为了处理待审 */
const FILTERS = [
  { value: '0', label: '待审' },
  { value: '1', label: '已显示' },
  { value: '2', label: '已隐藏' },
  { value: '', label: '全部' }
]

const comments = ref([])
const loading = ref(false)
const errorMessage = ref('')
const statusFilter = ref('0')
/**
 * 页面类型筛选。`''` = 全部。
 *
 * ⚠️ 这份清单必须与**服务端 `ADMIN_PAGE_KINDS`** 和 `commentApi.js` 的
 * `COMMENT_PAGE_PREFIX` 三处保持一致：新增评论页面时都要改，否则这里筛不到那一类。
 * 服务端对未知键按"不筛"处理，所以即使这里多写一个也不会报错（只是筛不出东西）。
 */
const PAGE_KINDS = [
  { value: '', label: '全部页面' },
  { value: 'site', label: '站内讨论区' },
  { value: 'item', label: '物品' },
  { value: 'hero', label: '角色' },
  { value: 'pet', label: '魔物' },
  { value: 'monster', label: '怪物' },
  { value: 'furniture', label: '家具' },
  { value: 'task', label: '任务' },
  { value: 'event', label: '活动' },
  { value: 'explore', label: '探索' },
  { value: 'battle', label: '副本' },
  { value: 'stage', label: '关卡' }
]
const pageKind = ref('')

/**
 * 命中原因筛选。`''` = 全部，`'any'` = 命中过任何词。
 *
 * 只给这三个固定档，不做"下拉全部类别"：类别名由词表决定（超管还能新建类别），
 * 列全反而难找；需要定位具体某个词时用上面的搜索框。
 */
const REASON_FILTERS = [
  { value: '', label: '全部' },
  { value: 'any', label: '自动命中' },
  { value: '赌博', label: '赌博' },
  { value: '引流', label: '引流' },
  { value: '外链', label: '外链' }
]
const reasonFilter = ref('')

/** 人工待审原因的有无 */
const NOTE_FILTERS = [
  { value: '', label: '不限原因' },
  { value: '1', label: '有人工备注' },
  { value: '0', label: '无备注' }
]
const noteFilter = ref('')
const cursor = ref(null)
const hasMore = ref(false)
const pendingCount = ref(0)
const deletingId = ref(null)

/** 「转待审」原因弹窗：目标评论 + 输入内容 + 提交中标志 */
const pendingTarget = ref(null)
const pendingNote = ref('')
const savingPending = ref(false)

/**
 * 常用原因选项（超管维护，所有管理员可读）。
 *
 * 拉取失败**不报错**：它只是便利功能，拉不到时自由输入照样能用，
 * 没必要因为这个把整个评论页变成错误页。
 */
const presets = ref([])

const searchInput = ref('')
const searchQuery = ref('')
let searchTimer = 0

/**
 * 「只看某个人的评论」——由用户列表点评论数跳进来（`?userId=123&nick=xxx`）。
 *
 * 🔴 用**内部 id**（`users.id`）而不是昵称：
 *    · `comments.nick` 是**发表时的快照**，用户改名后按旧昵称搜就找不到了；
 *    · 按 id 筛不依赖任何字符串匹配，也不会因昵称规则变化而失效。
 *    （`users.nick` 目前是 UNIQUE，所以"重名混入"当前并不存在 ——
 *     这里选 id 是为了**稳定**，不是因为现在有重名。）
 *
 * `nick` 只在界面上显示提示用（服务端不需要它）。
 */
const route = useRoute()
const router = useRouter()
const userFilter = ref(null)
{
  const raw = Number.parseInt(String(route.query.userId ?? ''), 10)
  if (Number.isFinite(raw)) {
    userFilter.value = { id: raw, nick: String(route.query.nick || '') }
  }
}

/** 一次批量操作最多几条，必须与后端 `BATCH_MAX` 一致 */
const BATCH_MAX = 100

/**
 * 已选中的评论 id。
 *
 * 刻意**不随筛选/翻页清空**：管理员可能先在第 1 页选几条、再翻页继续选，
 * 清空会让他前面白选。代价是"选了但看不见"，所以批量栏里常驻显示已选条数，
 * 并给一个「取消选择」。
 */
const selectedIds = ref([])
const batchBusy = ref(false)
/** 批量转待审复用同一个原因弹窗；非空时表示本次是批量 */
const batchPendingMode = ref(false)

const visibleIds = computed(() => comments.value.map((c) => c.id))
const allVisibleSelected = computed(() => visibleIds.value.length > 0 && visibleIds.value.every((id) => selectedIds.value.includes(id)))
const someVisibleSelected = computed(() => visibleIds.value.some((id) => selectedIds.value.includes(id)))

function toggleOne(id, checked) {
  if (checked) {
    if (!selectedIds.value.includes(id)) selectedIds.value = [...selectedIds.value, id]
  } else {
    selectedIds.value = selectedIds.value.filter((x) => x !== id)
  }
}

/** 全选/取消全选**当前已加载的**（不跨页猜，避免"看不见的也被选中"） */
function toggleAllVisible(checked) {
  if (checked) {
    const merged = new Set(selectedIds.value)
    for (const id of visibleIds.value) merged.add(id)
    selectedIds.value = [...merged]
  } else {
    const drop = new Set(visibleIds.value)
    selectedIds.value = selectedIds.value.filter((id) => !drop.has(id))
  }
}

function clearSelection() {
  selectedIds.value = []
}

/** 批量改状态（放行 / 隐藏）。转待审另走弹窗（要填原因）。 */
async function batchChangeStatus(status) {
  const ids = selectedIds.value
  if (!ids.length || batchBusy.value || ids.length > BATCH_MAX) return
  const verb = status === 1 ? '放行' : '隐藏'
  const extra = status === 1
    ? '放行后所有人可见。'
    : '隐藏后对外不可见（作者自己仍能看到并显示为「已隐藏」）。随时可以再放行。'
  const ok = window.confirm(`批量${verb}这 ${ids.length} 条评论？\n\n${extra}`)
  if (!ok) return

  batchBusy.value = true
  errorMessage.value = ''
  try {
    const data = await setCommentStatus(ids, status)
    clearSelection()
    if (data?.missing?.length) {
      // 有评论在打开页面后被别人删掉了 —— 说清楚，而不是假装全都成功
      errorMessage.value = `已处理 ${data.changed} 条；另有 ${data.missing.length} 条已不存在（可能被他人删除）。`
    }
    safeLoad()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '批量操作失败，请重试'
  } finally {
    batchBusy.value = false
  }
}

/** 批量转待审：复用原因弹窗（原因对整批生效） */
function openBatchPending() {
  if (!selectedIds.value.length || selectedIds.value.length > BATCH_MAX) return
  batchPendingMode.value = true
  pendingTarget.value = { id: null }
  pendingNote.value = ''
}

function onSearchInput(value) {
  searchInput.value = value
  // 输入防抖：边打边搜会把 D1 读额度烧在几个字符上
  clearTimeout(searchTimer)
  searchTimer = setTimeout(applySearch, 350)
}

function applySearch() {
  clearTimeout(searchTimer)
  const next = searchInput.value.trim()
  if (next === searchQuery.value) return
  searchQuery.value = next
  safeLoad()
}

function clearSearch() {
  searchInput.value = ''
  searchQuery.value = ''
  safeLoad()
}

function setFilter(value) {
  if (statusFilter.value === value) return
  statusFilter.value = value
  safeLoad()
}

function setPageKind(value) {
  if (pageKind.value === value) return
  pageKind.value = value
  safeLoad()
}

function setReasonFilter(value) {
  if (reasonFilter.value === value) return
  reasonFilter.value = value
  safeLoad()
}

function setNoteFilter(value) {
  if (noteFilter.value === value) return
  noteFilter.value = value
  safeLoad()
}

/**
 * 取消「只看某人」。
 *
 * 同时**把 URL 上的 query 清掉**：否则刷新页面又会被筛回来，
 * 用户会以为"取消没生效"。
 */
function clearUserFilter() {
  userFilter.value = null
  router.replace({ path: '/admin/comments' })
  safeLoad()
}

async function load({ append = false } = {}) {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchAdminComments({
      status: statusFilter.value,
      q: searchQuery.value,
      pageKind: pageKind.value,
      reason: reasonFilter.value,
      hasNote: noteFilter.value,
      userId: userFilter.value?.id,
      cursor: append ? cursor.value : undefined
    })
    const page = data.comments || []
    comments.value = append ? [...comments.value, ...page] : page
    cursor.value = data.nextCursor ?? null
    hasMore.value = Boolean(data.hasMore)
    if (typeof data.pendingCount === 'number') pendingCount.value = data.pendingCount
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

/** 换筛选/搜索时可能正在请求：吞掉并发，最后一次为准 */
let seq = 0
function safeLoad(options = {}) {
  const mine = ++seq
  return load(options).then(() => {
    // 旧请求后到就别管了（它写的是过期结果）
    if (mine !== seq) return
  })
}

function loadMore() {
  if (loading.value || !hasMore.value) return
  safeLoad({ append: true })
}

/**
 * 改状态：放行 / 隐藏 / 转待审。
 *
 * 🔴 **必须确认**（2026-10-07 补）。此前这里**没有确认框** —— 一键生效，
 * 误点就把用户的评论下架了（虽然可恢复，但用户那边会看到评论消失）。
 * 与"彻底删除"不同，这里都是**可恢复**操作，所以用轻量确认而不是红色警告。
 *
 * ## 三个状态的**实际**区别（别被名字误导）
 *
 * 「待审」与「已隐藏」**对外都是不可见**（服务端一律只放行 `status = 1`），
 * 差别只有两处：
 *   · 作者在「我的评论」里看到的标签：`待审核` / `已隐藏`；
 *   · **算不算进待办** —— 概览页的 `pending > 0` 会描红提示"去处理"。
 *
 * 所以「转待审」的语义是**挂起待定**（放回待办队列），不是"改变可见性"；
 * 而「隐藏」是**已有定论**。文案按这个语义区分，避免把两者说成同一件事。
 */
async function changeStatus(comment, status) {
  /*
   * 「转待审」要走**原因弹窗**，不走确认框：管理员需要说明"为什么打回"，
   * 让接手的人不必重新判断一遍。原因可留空（有时就是"我再看看"）。
   */
  if (status === 0) {
    pendingTarget.value = comment
    pendingNote.value = ''
    return
  }

  const preview = String(comment.body || '').slice(0, 40)
  const CONFIRM_TEXT = {
    1: `放行这条评论？\n\n正文：${preview}\n\n放行后**所有人可见**。`,
    2: `隐藏这条评论？\n\n正文：${preview}\n\n隐藏后对外不可见（作者自己仍能看到并显示为「已隐藏」）。随时可以再放行。`
  }
  const ok = window.confirm(CONFIRM_TEXT[status] || `把这条评论的状态改为 ${status}？`)
  if (!ok) return

  errorMessage.value = ''
  try {
    await setCommentStatus(comment.id, status)
    // 改完**重拉当前筛选**：这条可能已经不满足筛选条件了（如"待审"里放行一条），
    // 就地改状态会让它留在不该在的列表里
    safeLoad()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '操作失败，请重试'
  }
}

/** 关掉原因弹窗并丢弃输入。 */
function cancelPending() {
  pendingTarget.value = null
  pendingNote.value = ''
  batchPendingMode.value = false
}

/**
 * 点常用选项 → 填进输入框。
 *
 * 是**覆盖**而不是追加：管理员点它通常是想用这句话，
 * 而不是在已有文字后面接一段（要接的话自己接着打就是了）。
 * 填完仍可自由编辑，不会被锁定。
 */
function applyPreset(text) {
  pendingNote.value = String(text).slice(0, REVIEW_NOTE_MAX)
}

/** 提交「转待审 + 原因」。原因留空也允许（服务端会存 NULL）。单条与批量走同一段。 */
async function confirmPending() {
  if (savingPending.value || !pendingTarget.value) return
  const note = pendingNote.value.trim()
  const targets = batchPendingMode.value ? [...selectedIds.value] : [pendingTarget.value.id]
  if (!targets.length) return

  savingPending.value = true
  errorMessage.value = ''
  try {
    const data = await setCommentStatus(batchPendingMode.value ? targets : targets[0], 0, note)
    if (batchPendingMode.value) clearSelection()
    if (data?.missing?.length) {
      errorMessage.value = `已处理 ${data.changed} 条；另有 ${data.missing.length} 条已不存在（可能被他人删除）。`
    }
    cancelPending()
    safeLoad()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '操作失败，请重试'
  } finally {
    savingPending.value = false
  }
}

async function hardDelete(comment) {
  if (deletingId.value) return
  const ok = window.confirm(
    `彻底删除 #${comment.id}？\n\n正文：${String(comment.body || '').slice(0, 60)}\n\n` +
      '这一步**不可恢复**。只想下架（可以再放行回来）请用「隐藏」。'
  )
  if (!ok) return
  deletingId.value = comment.id
  errorMessage.value = ''
  try {
    await deleteCommentPermanently(comment.id)
    safeLoad()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '删除失败，请重试'
  } finally {
    deletingId.value = null
  }
}

function statusLabel(status) {
  if (status === 0) return '待审'
  if (status === 1) return '已显示'
  if (status === 2) return '已隐藏'
  return String(status)
}

function formatTime(unixSec) {
  if (!unixSec) return '—'
  return new Date(unixSec * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

onMounted(() => {
  safeLoad()
  // 常用选项是锦上添花，拉不到就算了（自由输入照常可用）
  fetchReviewPresets()
    .then((data) => { presets.value = Array.isArray(data?.presets) ? data.presets : [] })
    .catch(() => {})
})
onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<style scoped>
.admin-userid {
  margin-left: 4px;
  opacity: 0.6;
}

.admin-quote {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted);
}

.admin-quote--warn {
  color: #c98a3a;
}

/* 待审原因：与「命中」（自动判定）区分开，用中性偏蓝的提示色 */
.admin-quote--note {
  color: #5b7fa6;
}

.admin-more {
  display: flex;
  justify-content: center;
}

/* ── 转待审原因弹窗 ── */
.admin-modal-lead {
  margin: 0 0 6px;
  font-size: 14px;
}

.admin-modal-quote {
  margin: 0 0 14px;
  padding: 8px 10px;
  border-left: 3px solid var(--border-color, #d8cdb8);
  background: rgba(0, 0, 0, 0.04);
  font-size: 13px;
  color: var(--text-muted);
  word-break: break-word;
}

.admin-modal-label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
}

.admin-modal-optional {
  color: var(--text-muted);
  font-size: 12px;
}

/* 常用选项：一排 chip，点一下填进输入框 */
.admin-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

/* ── 批量操作栏 ── */
.admin-batch-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #d8cdb8);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.03);
}

.admin-batch-count {
  font-weight: 600;
  font-size: 14px;
}

/* 超上限时的提示：用告警色，因为它会让按钮点了没反应 */
.admin-batch-warn {
  color: #c98a3a;
  font-size: 13px;
}

.admin-check {
  width: 15px;
  height: 15px;
  cursor: pointer;
}

/* 命中原因 / 人工备注两组筛选之间的一道浅分隔线 */
.admin-filter-sep {
  width: 1px;
  align-self: stretch;
  margin: 0 4px;
  background: var(--border-color, #d8cdb8);
}

/* 「只看某人」提示条：带取消按钮，让它看起来是"可撤销的临时筛选" */
.admin-user-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #d8cdb8);
  border-radius: 6px;
  background: rgba(91, 127, 166, 0.08);
  font-size: 14px;
}

/* 选中行底色，便于分辨"我选了哪几条" */
.is-selected {
  background: rgba(91, 127, 166, 0.08);
}

.admin-modal-count {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}
</style>
