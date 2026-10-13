<template>
  <section class="admin-workshop">
    <div class="workshop-header">
      <h1 class="workshop-title">
        <span class="workshop-title-star">✦</span>
        <span>评论审核</span>
      </h1>
      <p class="workshop-subtitle">
        ✦ 管理 Wiki 评论流、敏感词命中判定与批量放行/隐藏处置
      </p>
    </div>

    <div class="admin-toolbar admin-toolbar--main">
      <div class="admin-filters admin-filters--status">
        <!--
          档位按钮**只显示名字，不显示条数**（2026-10-14 去掉了）。
          原因：那是唯一一处「每翻一页都要全表数一遍」的开销。
          四个数字来自 `SELECT status, COUNT(*) … GROUP BY status`，
          实测它占单页成本的 91%~99%（分页本身只读 50 行，而这个要读全表）。
          且它随评论量线性增长 —— 评论到 2.5 万条时，每天翻 200 页就能吃满
          D1 免费额度。而"总数"对筛选没有帮助：点进去自然就看到有多少条了。
        -->
        <button
          v-for="f in FILTERS"
          :key="f.value"
          type="button"
          class="admin-chip"
          :class="{ 'is-on': statusFilter === f.value }"
          @click="setFilter(f.value)"
        >
          {{ f.label }}
        </button>
      </div>

      <div class="search-input-group">
        <input
          :value="searchInput"
          class="admin-input admin-search"
          type="search"
          placeholder="搜正文 / 昵称 / 页面标识"
          @input="onSearchInput($event.target.value)"
          @keydown.enter="applySearch"
        />
        <button type="button" class="admin-btn admin-btn--search" @click="applySearch">搜索</button>
        <button v-if="searchQuery" type="button" class="admin-btn admin-btn--ghost admin-btn--search" @click="clearSearch">
          清除
        </button>
      </div>
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

    <div v-else class="table-container" ref="tableContainerRef">
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
            <th class="col-hide-mobile" style="width: 56px">#</th>
            <th style="width: 110px">作者</th>
            <!--
              🔴 正文列**不设 width**，让它在剩余空间里自然伸缩；
              上限由 `.admin-comment-body` 的 `max-width` 收（2026-10-14）。
              原先它吃掉全部余量，操作列被挤到换行（「放行/隐藏」一行、「彻底删除」另起一行）。
            -->
            <th>正文</th>
            <th class="col-hide-mobile" style="width: 130px">页面</th>
            <th style="width: 82px; text-align: center;">状态</th>
            <th class="col-hide-mobile" style="width: 140px">时间</th>
            <!-- 操作列要放得下三个按钮横排，宽度按内容定 -->
            <th style="width: 210px">操作</th>
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
            <td class="admin-num col-hide-mobile">{{ c.id }}</td>
            <td class="admin-cell-wrap">
              {{ c.nick }}
              <!-- 账号体系之后的新评论带 userId；老的（账号之前）为空 -->
              <span v-if="c.userId" class="admin-num admin-userid">#{{ c.userId }}</span>
            </td>
            <td class="admin-cell-wrap admin-comment-body">
              <EmoticonText :text="c.body" />
              <div v-if="c.parentId" class="admin-quote">回复 #{{ c.parentId }}</div>
              <div v-if="c.reviewReason" class="admin-quote admin-quote--warn">命中：{{ c.reviewReason }}</div>
              <!-- 管理员手填的转待审原因：只有「待审」档才可能有值（放行/隐藏后服务端会清空） -->
              <div v-if="c.reviewNote" class="admin-quote admin-quote--note">待审原因：{{ c.reviewNote }}</div>
              <!-- 移动端将页面标识与发表时间整合在正文底部 -->
              <div class="col-show-mobile admin-mobile-subinfo">
                {{ c.pageLabel || c.pageKey }} · {{ formatTime(c.createdAt) }}
              </div>
            </td>
            <td class="admin-cell-wrap col-hide-mobile">{{ c.pageLabel || c.pageKey }}</td>
            <td style="text-align: center;">
              <span :class="['status-badge', commentStatusBadgeClass(c.status)]">
                {{ statusLabel(c.status) }}
              </span>
            </td>
            <td class="admin-num col-hide-mobile">{{ formatTime(c.createdAt) }}</td>
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

    <!-- 翻页控制栏（主流分页：[上一页] [1] ... [7] [8] [9] [10] [11] ... [28] [下一页] + 跳转） -->
    <div v-if="totalPages > 1 || comments.length" class="pagination-bar">
      <button
        type="button"
        class="page-btn"
        :disabled="currentPage <= 1 || loading"
        @click="goToPage(currentPage - 1)"
      >
        上一页
      </button>

      <template v-for="(item, idx) in displayedPageItems" :key="idx">
        <span v-if="item === '...'" class="page-ellipsis">…</span>
        <button
          v-else
          type="button"
          class="page-number"
          :class="{ active: item === currentPage }"
          :disabled="loading"
          @click="goToPage(item)"
        >
          {{ item }}
        </button>
      </template>

      <button
        type="button"
        class="page-btn"
        :disabled="currentPage >= totalPages || loading"
        @click="goToPage(currentPage + 1)"
      >
        下一页
      </button>

      <div v-if="totalPages > 1" class="page-jumper">
        <span>跳至</span>
        <input
          type="number"
          v-model.number="jumpPageInput"
          :min="1"
          :max="totalPages"
          class="page-jumper-input"
          placeholder=""
          @keydown.enter="handleJump"
        />
        <span>页</span>
        <button
          type="button"
          class="page-jumper-btn"
          :disabled="loading || !jumpPageInput"
          @click="handleJump"
        >
          确定
        </button>
      </div>
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

    <!-- 通用确认弹窗（替代原生 window.confirm） -->
    <UiModal
      :visible="confirmModal.visible"
      teleport-to="body"
      :title="confirmModal.title"
      max-width="480px"
      @update:visible="(v) => { if (!v) onConfirmCancel() }"
    >
      <p v-if="confirmModal.lead" class="admin-modal-lead">{{ confirmModal.lead }}</p>
      <div v-if="confirmModal.content" class="admin-modal-quote" style="white-space: pre-line; line-height: 1.6;">
        {{ confirmModal.content }}
      </div>

      <template #footer>
        <button type="button" class="admin-btn admin-btn--ghost" @click="onConfirmCancel">
          {{ confirmModal.cancelText || '取消' }}
        </button>
        <button
          type="button"
          class="admin-btn"
          :class="{ 'admin-btn--danger': confirmModal.isDanger }"
          @click="onConfirmAccept"
        >
          {{ confirmModal.confirmText || '确定' }}
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

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const route = useRoute()
const router = useRouter()

// 如果 URL 显式指定了 status（如 ?status=0 或 ?status=all 或 ?status=），按 URL 优先；
// 如果带有 userId 参数跳转过来查某人评论，默认看该用户的「全部」评论；
// 否则常规进入面板默认看待审（'0'）
const initialStatus = (() => {
  if (route.query.status !== undefined) {
    return route.query.status === 'all' ? '' : String(route.query.status)
  }
  if (route.query.userId) {
    return '' // 点用户进来看他的评论，看全部
  }
  return '0' // 默认看待审
})()
const statusFilter = ref(initialStatus)
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
// 档位条数已随胶囊数字一起去掉（见模板注释）：这两个 ref 不再有消费者
const deletingId = ref(null)

// 分页控制
const currentPage = ref(1)
const totalPages = ref(1)
const totalCount = ref(0)
const jumpPageInput = ref('')

const displayedPageItems = computed(() => {
  return getPaginationItems(currentPage.value, totalPages.value, 2)
})

function getPaginationItems(current, total, delta = 2) {
  if (total <= 1) return [1]
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  let left = current - delta
  let right = current + delta

  if (left <= 2) {
    left = 2
    right = 2 + delta * 2
  }
  if (right >= total - 1) {
    right = total - 1
    left = (total - 1) - delta * 2
  }

  left = Math.max(2, left)
  right = Math.min(total - 1, right)

  const items = [1]
  if (left > 2) {
    items.push('...')
  }
  for (let i = left; i <= right; i++) {
    items.push(i)
  }
  if (right < total - 1) {
    items.push('...')
  }
  items.push(total)
  return items
}

// 通用确认弹窗
const confirmModal = ref({
  visible: false,
  title: '',
  lead: '',
  content: '',
  confirmText: '确定',
  cancelText: '取消',
  isDanger: false,
  resolve: null
})

function askConfirm({ title, lead = '', content = '', confirmText = '确定', cancelText = '取消', isDanger = false }) {
  return new Promise((resolve) => {
    confirmModal.value = {
      visible: true,
      title,
      lead,
      content,
      confirmText,
      cancelText,
      isDanger,
      resolve
    }
  })
}

function onConfirmAccept() {
  const cb = confirmModal.value.resolve
  confirmModal.value.visible = false
  cb?.(true)
}

function onConfirmCancel() {
  const cb = confirmModal.value.resolve
  confirmModal.value.visible = false
  cb?.(false)
}

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
  const ok = await askConfirm({
    title: `批量${verb}评论`,
    lead: `批量${verb}这 ${ids.length} 条评论？`,
    content: extra,
    confirmText: `确认批量${verb}`
  })
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
    reloadCurrentPage()
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
  resetAndLoad()
}

function clearSearch() {
  searchInput.value = ''
  searchQuery.value = ''
  resetAndLoad()
}

function setFilter(value) {
  if (statusFilter.value === value) return
  statusFilter.value = value
  resetAndLoad()
}

function setPageKind(value) {
  if (pageKind.value === value) return
  pageKind.value = value
  resetAndLoad()
}

function setReasonFilter(value) {
  if (reasonFilter.value === value) return
  reasonFilter.value = value
  resetAndLoad()
}

function setNoteFilter(value) {
  if (noteFilter.value === value) return
  noteFilter.value = value
  resetAndLoad()
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
  resetAndLoad()
}

const tableContainerRef = ref(null)

function scrollToTableTop() {
  if (tableContainerRef.value) {
    tableContainerRef.value.scrollTop = 0
  }
  const el = document.querySelector('.admin-workshop .table-container')
  if (el) el.scrollTop = 0
}

function resetAndLoad() {
  currentPage.value = 1
  totalCount.value = 0
  scrollToTableTop()
  safeLoad({ page: 1 }).then(() => {
    scrollToTableTop()
  })
}

function reloadCurrentPage() {
  return safeLoad({ page: currentPage.value })
}

function goToPage(p) {
  if (p < 1 || p === currentPage.value || loading.value) return
  if (p > totalPages.value) return
  scrollToTableTop()
  safeLoad({ page: p }).then(() => {
    scrollToTableTop()
  })
}

function handleJump() {
  const p = Number.parseInt(jumpPageInput.value, 10)
  if (!Number.isFinite(p) || p < 1) return
  const validPage = Math.min(Math.max(p, 1), totalPages.value)
  jumpPageInput.value = ''
  goToPage(validPage)
}

async function load({ page: reqPage } = {}) {
  loading.value = true
  errorMessage.value = ''
  const targetPage = reqPage !== undefined ? reqPage : currentPage.value
  try {
    const data = await fetchAdminComments({
      status: statusFilter.value,
      q: searchQuery.value,
      pageKind: pageKind.value,
      reason: reasonFilter.value,
      hasNote: noteFilter.value,
      userId: userFilter.value?.id,
      page: targetPage,
      total: totalCount.value > 0 && targetPage !== 1 ? totalCount.value : undefined
    })
    const page = data.comments || []
    comments.value = page
    currentPage.value = data.page ?? targetPage
    totalPages.value = data.totalPages ?? 1
    totalCount.value = data.total ?? page.length
    hasMore.value = Boolean(data.hasMore)
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
  const isApprove = status === 1
  const ok = await askConfirm({
    title: isApprove ? '放行评论' : '隐藏评论',
    lead: isApprove ? '放行这条评论？' : '隐藏这条评论？',
    content: `正文：${preview}\n\n${
      isApprove
        ? '放行后所有人可见。'
        : '隐藏后对外不可见（作者本人仍能看到并显示为已隐藏），随时可以再次放行。'
    }`,
    confirmText: isApprove ? '确认放行' : '确认隐藏'
  })
  if (!ok) return

  errorMessage.value = ''
  try {
    await setCommentStatus(comment.id, status)
    // 改完重拉当前页：保持用户在当前分页视界
    reloadCurrentPage()
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
    reloadCurrentPage()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '操作失败，请重试'
  } finally {
    savingPending.value = false
  }
}

async function hardDelete(comment) {
  if (deletingId.value) return
  const ok = await askConfirm({
    title: '彻底删除评论',
    lead: `彻底删除评论 #${comment.id}？`,
    content: `正文：${String(comment.body || '').slice(0, 60)}\n\n此操作不可恢复！只想下架（可随时恢复）请使用「隐藏」。`,
    confirmText: '彻底删除',
    isDanger: true
  })
  if (!ok) return
  deletingId.value = comment.id
  errorMessage.value = ''
  try {
    await deleteCommentPermanently(comment.id)
    reloadCurrentPage()
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

function commentStatusBadgeClass(status) {
  if (status === 0) return 'status-badge--wait'
  if (status === 1) return 'status-badge--ok'
  return 'status-badge--ban'
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

// 监听路由参数变化（例如从用户管理点某人评论，或控制台点待审/全部评论）
watch(
  () => [route.query.status, route.query.userId],
  ([newStatus, newUserId], [oldStatus, oldUserId]) => {
    if (newStatus === oldStatus && newUserId === oldUserId) return
    let targetStatus = '0'
    if (newStatus !== undefined) {
      targetStatus = newStatus === 'all' ? '' : String(newStatus)
    } else if (newUserId) {
      targetStatus = '' // 查看特定用户评论时看全部
    }
    statusFilter.value = targetStatus

    const rawUid = Number.parseInt(String(newUserId ?? ''), 10)
    userFilter.value = Number.isFinite(rawUid) ? { id: rawUid, nick: String(route.query.nick || '') } : null

    resetAndLoad()
  }
)

onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<style scoped>
.admin-workshop {
  --wood-border: #7a5c3d;
  --gold-border: rgba(143, 115, 81, 0.45);
  --gold-accent: #c5913e;
  --gold-bright: #ffd78c;
  --text-main: #3e2a14;
  --text-muted: #755c3f;
  --paper-soft: #f4ecdc;
  --paper-card: #f9f5eb;
  --status-ok-bg: #e5f4eb;
  --status-ok-text: #287a4c;
  --status-ok-border: #a3d9b8;
  --status-wait-bg: #fcf4e3;
  --status-wait-text: #b37318;
  --status-wait-border: #f0d092;
  --status-ban-bg: #fae8e8;
  --status-ban-text: #b83232;
  --status-ban-border: #e8a7a7;

  flex: 1;
  min-width: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  border: 2px solid var(--wood-border);
  border-radius: 8px;
  background: var(--paper-soft);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  padding: 18px 24px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  box-sizing: border-box;
}

:deep(.dark-mode) .admin-workshop,
.dark-mode .admin-workshop {
  --wood-border: #5c4327;
  --gold-border: rgba(143, 115, 81, 0.3);
  --gold-accent: #d4a359;
  --text-main: #e8dbc3;
  --text-muted: #ab9274;
  --paper-soft: #33261a;
  --paper-card: #271d13;
  --status-ok-bg: rgba(40, 122, 76, 0.22);
  --status-ok-text: #6ad197;
  --status-ok-border: rgba(106, 209, 151, 0.4);
  --status-wait-bg: rgba(179, 115, 24, 0.22);
  --status-wait-text: #f0b760;
  --status-wait-border: rgba(240, 183, 96, 0.4);
  --status-ban-bg: rgba(184, 50, 50, 0.22);
  --status-ban-text: #f07f7f;
  --status-ban-border: rgba(240, 127, 127, 0.4);
}

.workshop-header {
  flex-shrink: 0;
  border-bottom: 1.5px solid var(--gold-border);
  padding-bottom: 12px;
}
.workshop-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.workshop-title-star {
  color: #c5913e;
  font-size: 19px;
}
.workshop-subtitle {
  font-size: 12.5px;
  color: var(--text-muted);
  margin: 4px 0 0;
  letter-spacing: 0.5px;
}

.admin-toolbar {
  flex-shrink: 0;
}

.table-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
  border: 1.5px solid rgba(143, 115, 81, 0.4);
  border-radius: 6px;
  background: var(--paper-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.admin-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 12px 12px;
  background: #ebe0ce;
  color: var(--text-muted);
  font-weight: 700;
  border-bottom: 1.5px solid rgba(143, 115, 81, 0.35);
  letter-spacing: 0.5px;
  box-shadow: 0 1px 0 rgba(143, 115, 81, 0.35);
}

:deep(.dark-mode) .admin-table thead th,
.dark-mode .admin-table thead th {
  background: #251b11;
}

.admin-table td {
  padding: 10px 12px;
  border-bottom: 1px dashed rgba(143, 115, 81, 0.25);
  color: var(--text-main);
  vertical-align: middle;
  transition: background 0.15s;
}

/*
 * 正文列：**限宽**，把余量让给操作列（2026-10-14）。
 *
 * 🔴 起因：正文是唯一不设 `width` 的列，于是吃掉全部剩余宽度，
 * 操作列被压到装不下三个按钮 → 「放行/隐藏」一行、「彻底删除」换到第二行。
 * 这里给正文一个上限，多余空间自然回流给操作列。
 *
 * `max-width` 而不是固定 `width`：窄屏时仍能收缩，不会把表格顶出容器。
 */
.admin-comment-body {
  max-width: 420px;
}

/*
 * 行内操作：三个按钮**必须横排不换行**。
 *
 * `flex-wrap: nowrap` 是硬要求（换行就是本次要修的缺陷）；
 * `white-space: nowrap` 防止「彻底删除」四个字在按钮内部折成两行。
 */
.admin-row-actions {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.admin-row-actions .admin-btn {
  white-space: nowrap;
  flex-shrink: 0;
}

.admin-table tbody tr:last-child td {
  border-bottom: none;
}

.admin-table tbody tr:hover td {
  background-color: rgba(245, 237, 222, 0.85);
}
:deep(.dark-mode) .admin-table tbody tr:hover td,
.dark-mode .admin-table tbody tr:hover td {
  background-color: rgba(60, 45, 30, 0.5);
}

/* 状态微胶囊标签 */
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  border: 1px solid;
}

.status-badge--ok {
  background: var(--status-ok-bg);
  color: var(--status-ok-text);
  border-color: var(--status-ok-border);
}
.status-badge--wait {
  background: var(--status-wait-bg);
  color: var(--status-wait-text);
  border-color: var(--status-wait-border);
}
.status-badge--ban {
  background: var(--status-ban-bg);
  color: var(--status-ban-text);
  border-color: var(--status-ban-border);
}

.pagination-bar {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.page-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid rgba(143, 115, 81, 0.45);
  background: var(--paper-card);
  color: var(--text-main);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.page-btn:hover:not(:disabled) {
  background: rgba(245, 237, 222, 0.9);
  border-color: #a88452;
}
.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-number {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid rgba(143, 115, 81, 0.35);
  background: var(--paper-card);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.page-number:hover:not(:disabled) {
  border-color: #a88452;
}
.page-number.active {
  background: linear-gradient(135deg, #3e2613, #2b1a0d);
  color: #f7e6c4;
  border-color: #c5913e;
  font-weight: 800;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}
.page-number:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:deep(.dark-mode) .page-number.active,
.dark-mode .page-number.active {
  background: linear-gradient(135deg, #52341b, #38210f);
  color: #ffd78c;
  border-color: #e5b060;
}

.page-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 32px;
  color: var(--text-muted);
  font-size: 14px;
  letter-spacing: 2px;
  user-select: none;
}

.page-jumper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.page-jumper-input {
  width: 44px;
  height: 28px;
  padding: 0 4px;
  text-align: center;
  border-radius: 5px;
  border: 1px solid rgba(143, 115, 81, 0.45);
  background: var(--paper-card);
  color: var(--text-main);
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.page-jumper-input:focus {
  border-color: #a88452;
  box-shadow: 0 0 0 2px rgba(168, 132, 82, 0.2);
}

.page-jumper-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 5px;
  border: 1px solid rgba(143, 115, 81, 0.45);
  background: var(--paper-card);
  color: var(--text-main);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.page-jumper-btn:hover:not(:disabled) {
  background: rgba(245, 237, 222, 0.95);
  border-color: #a88452;
}

.page-jumper-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-userid {
  margin-left: 4px;
  opacity: 0.6;
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
}

.admin-quote {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.admin-quote--warn {
  color: #c98a3a;
  background: rgba(201, 138, 58, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
}

.admin-quote--note {
  color: #557574;
  background: rgba(85, 117, 116, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
}

/* 批量操作栏 */
.admin-batch-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 14px;
  border: 1.5px solid rgba(197, 145, 62, 0.5);
  border-radius: 6px;
  background: var(--paper-card);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.admin-batch-count {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--text-main);
}

.admin-batch-warn {
  color: #b83232;
  font-size: 12.5px;
}

.admin-check {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: #7a5c3d;
}

.admin-filter-sep {
  width: 1px;
  align-self: stretch;
  margin: 0 4px;
  background: var(--gold-border);
}

.admin-user-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid rgba(85, 117, 116, 0.4);
  border-radius: 6px;
  background: rgba(85, 117, 116, 0.1);
  font-size: 13px;
  color: var(--text-main);
}

.is-selected {
  background: rgba(212, 163, 89, 0.18) !important;
}

/* 弹窗样式 */
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

.admin-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.admin-modal-count {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}

.search-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 260px;
}
.search-input-group .admin-search {
  flex: 1;
  min-width: 0;
}
.search-input-group .admin-btn--search {
  flex-shrink: 0;
  white-space: nowrap;
}

.col-show-mobile {
  display: none;
}

@media (max-width: 900px) {
  .col-hide-mobile {
    display: none !important;
  }
  .col-show-mobile {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.3;
  }

  /* 图 3 优化：胶囊分类与命中原因横排整齐滑块，高度统一固定，禁止垂直拉伸 */
  .admin-toolbar--kinds {
    width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }
  .admin-toolbar--kinds .admin-filters,
  .admin-filters {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    max-width: 100% !important;
    width: 100% !important;
    padding: 3px 0 !important;
    gap: 6px !important;
    scrollbar-width: none !important;
  }
  .admin-filters::-webkit-scrollbar {
    display: none !important;
  }

  .admin-chip,
  .admin-chip--sm {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    height: 30px !important;
    min-height: 30px !important;
    max-height: 30px !important;
    padding: 0 12px !important;
    line-height: 1 !important;
    border-radius: 999px !important;
    box-sizing: border-box !important;
  }

  /* 评论表格支持向右平滑滚动，操作按钮水平横放 */
  .admin-table {
    min-width: 580px !important;
    width: 100% !important;
  }
  .admin-table th,
  .admin-table td {
    white-space: nowrap !important;
  }
  .admin-cell-wrap {
    white-space: normal !important;
    min-width: 180px;
    max-width: 280px;
  }
  /* 手机端正文列已由上面的 `.admin-cell-wrap` 收窄，桌面端的上限在此失效 */
  .admin-comment-body {
    max-width: 280px !important;
  }
  .admin-row-actions {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 6px !important;
    white-space: nowrap !important;
  }
  .admin-row-actions .admin-btn {
    white-space: nowrap !important;
    flex-shrink: 0 !important;
    padding: 4px 8px !important;
    font-size: 12px !important;
  }

  .admin-toolbar {
    gap: 6px;
  }
  .admin-toolbar--main {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
  }
  .search-input-group {
    width: 100% !important;
    min-width: 0 !important;
    display: flex !important;
    gap: 6px !important;
  }
  .search-input-group .admin-search {
    flex: 1 !important;
    min-width: 0 !important;
    height: 34px !important;
  }
  .search-input-group .admin-btn--search {
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    height: 34px !important;
    padding: 0 14px !important;
    font-size: 13px !important;
  }

  /* 分页栏隐藏冗余跳转框，按钮不折行 */
  .page-jumper {
    display: none !important;
  }
  .page-btn {
    white-space: nowrap !important;
    flex-shrink: 0 !important;
    padding: 6px 12px !important;
    height: 32px !important;
  }
  .page-number {
    flex-shrink: 0 !important;
    width: 30px !important;
    height: 30px !important;
  }
}
</style>
