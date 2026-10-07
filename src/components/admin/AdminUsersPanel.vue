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
        </button>
      </div>

      <input
        :value="searchInput"
        class="admin-input admin-search"
        type="search"
        placeholder="搜编号 / 昵称 / 邮箱"
        @input="onSearchInput($event.target.value)"
        @keydown.enter="applySearch"
      />
      <button type="button" class="admin-btn admin-btn--sm" @click="applySearch">搜索</button>
      <button v-if="searchQuery" type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="clearSearch">
        清除
      </button>
    </div>

    <p class="admin-hint">
      搜<strong>纯数字</strong>会按对外编号精确匹配 —— 用户来反馈时通常报的就是那 5 位编号，不是内部 id。
    </p>

    <p v-if="errorMessage" class="admin-error">{{ errorMessage }}</p>
    <p v-if="loading && !users.length" class="admin-hint">正在加载…</p>
    <p v-else-if="!users.length && !errorMessage" class="admin-hint">
      {{ searchQuery ? '没有匹配的用户。' : '这一档没有用户。' }}
    </p>

    <div v-else class="admin-card">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width: 74px">编号</th>
            <th style="width: 150px">昵称</th>
            <th>邮箱</th>
            <th style="width: 70px">评论</th>
            <th style="width: 82px">状态</th>
            <th style="width: 96px">角色</th>
            <th style="width: 150px">注册 / 最近登录</th>
            <th style="width: 250px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td class="admin-num">{{ u.publicNo }}</td>
            <td class="admin-cell-wrap">
              <img v-if="avatarUrl(u.avatar)" :src="avatarUrl(u.avatar)" alt="" class="admin-avatar" />
              {{ u.nick }}
            </td>
            <td class="admin-cell-wrap">{{ u.email || '（已清空）' }}</td>
            <td class="admin-num">{{ u.commentCount }}</td>
            <td>{{ statusLabel(u.status) }}</td>
            <!-- 角色列：**所有人都能看到**（知道谁是管理员是公开信息），但只有超管能改 -->
            <td :class="{ 'admin-role-super': u.role >= 2, 'admin-role-admin': u.role === 1 }">
              {{ roleLabel(u.role) }}
            </td>
            <td class="admin-num">
              {{ formatDate(u.createdAt) }}<br />
              <span class="admin-dim">{{ u.lastLoginAt ? formatDate(u.lastLoginAt) : '从未' }}</span>
            </td>
            <td>
              <div class="admin-row-actions">
                <!--
                  🔴 角色按钮**仅超管可见**（`canSetRole`）：
                  管理员根本看不到这两个按钮，而不是看到禁用态。
                  后端同样会 403 —— 前端隐藏只是体验，不是防线。
                -->
                <template v-if="canSetRole(u)">
                  <button
                    v-if="u.role === 0"
                    type="button"
                    class="admin-btn admin-btn--ghost admin-btn--sm"
                    :disabled="busyId === u.id"
                    @click="changeRole(u, 1)"
                  >
                    设为管理员
                  </button>
                  <button
                    v-else-if="u.role === 1"
                    type="button"
                    class="admin-btn admin-btn--ghost admin-btn--sm"
                    :disabled="busyId === u.id"
                    @click="changeRole(u, 0)"
                  >
                    撤销管理员
                  </button>
                </template>

                <template v-if="u.status === 1">
                  <button
                    type="button"
                    class="admin-btn admin-btn--ghost admin-btn--sm"
                    :disabled="busyId === u.id || !canModerate(u)"
                    :title="canModerate(u) ? '' : '不能操作同级或更高级的账号'"
                    @click="toggleBan(u)"
                  >
                    {{ busyId === u.id ? '处理中' : '封禁' }}
                  </button>
                </template>
                <template v-else-if="u.status === 2">
                  <button
                    type="button"
                    class="admin-btn admin-btn--sm"
                    :disabled="busyId === u.id || !canModerate(u)"
                    :title="canModerate(u) ? '' : '不能操作同级或更高级的账号'"
                    @click="toggleBan(u)"
                  >
                    {{ busyId === u.id ? '处理中' : '解封' }}
                  </button>
                </template>
                <!-- status=3 是用户自己注销的：管理员既不该"解封"，也不该伪造这个状态 -->
                <span v-else class="admin-dim">已自行注销</span>

                <button
                  type="button"
                  class="admin-btn admin-btn--danger admin-btn--sm"
                  :disabled="busyId === u.id || !canModerate(u)"
                  :title="canModerate(u) ? '' : '不能操作同级或更高级的账号'"
                  @click="hardDelete(u)"
                >
                  彻底删除
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
  </section>
</template>

<script setup>
/**
 * 后台 · 用户管理。
 *
 * ## 封禁与彻底删除的区别（按钮文案与确认框都要说清）
 *
 * | | 封禁（status 1↔2） | 彻底删除 |
 * | --- | --- | --- |
 * | 能否登录 | 不能 | 不能（已经没了） |
 * | 会话 | **立即失效** | 立即失效 |
 * | 邮箱 | 仍占用 | **释放**（可以重新注册） |
 * | 他的评论 | 保留 | 保留，但 `user_id` 置空（不再挂在账号上） |
 * | 可恢复 | 可以解封 | **不可恢复** |
 *
 * 所以"想让人闭嘴"用封禁，"用户要求删除数据"才用彻底删除。
 *
 * ## status=3 不给操作
 *
 * 那是**用户自己注销**留下的标记，管理员既不该替他"解封"
 * （他本人没要求回来），也不该把别人改成 3（服务端也只允许 1↔2）。
 *
 * ## 角色与层级（2026-10-07 新增）
 *
 * | 角色 | 能做什么 |
 * | --- | --- |
 * | 2 超级管理员 | 全部 + **设/撤管理员** |
 * | 1 管理员 | 评论与用户管理，但**只能动普通用户** |
 * | 0 普通用户 | 进不来后台 |
 *
 * 🔴 前端做两件事，**但都不是防线**：
 *   1. `canSetRole()` —— 角色按钮**仅超管可见**（不是禁用，是不渲染）；
 *   2. `canModerate()` —— 动不了同级/更高级时把按钮置灰并给出原因提示。
 * 真正的准入在服务端（`canActOn`），伪造请求会拿到 403。
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { avatarPath } from '../../utils/avatarCatalog.js'
import { getImageUrl } from '../../utils/env.js'
import { currentUser } from '../../utils/authSession.js'
import {
  AdminApiError,
  deleteUserPermanently,
  fetchAdminUsers,
  setUserRole,
  setUserStatus
} from '../../utils/adminApi.js'

const FILTERS = [
  { value: '1', label: '正常' },
  { value: '2', label: '已停用' },
  { value: '3', label: '已注销' },
  { value: '', label: '全部' }
]

const users = ref([])
const loading = ref(false)
const errorMessage = ref('')
/** 默认看"正常"：日常主要是查人，不是看一堆注销记录 */
const statusFilter = ref('1')
const cursor = ref(null)
const hasMore = ref(false)
const busyId = ref(null)

const searchInput = ref('')
const searchQuery = ref('')
let searchTimer = 0

function avatarUrl(id) {
  const p = avatarPath(id || '')
  return p ? getImageUrl(p) : ''
}

function onSearchInput(value) {
  searchInput.value = value
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

async function load({ append = false } = {}) {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchAdminUsers({
      status: statusFilter.value,
      q: searchQuery.value,
      cursor: append ? cursor.value : undefined
    })
    const page = data.users || []
    users.value = append ? [...users.value, ...page] : page
    cursor.value = data.nextCursor ?? null
    hasMore.value = Boolean(data.hasMore)
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

let seq = 0
function safeLoad(options = {}) {
  const mine = ++seq
  return load(options).then(() => {
    if (mine !== seq) return
  })
}

function loadMore() {
  if (loading.value || !hasMore.value) return
  safeLoad({ append: true })
}

async function toggleBan(user) {
  const banning = user.status === 1
  const ok = window.confirm(
    banning
      ? `封禁「${user.nick}」（编号 ${user.publicNo}）？\n\n他会立刻掉线，且无法再登录。评论保留，随时可以解封。`
      : `解封「${user.nick}」（编号 ${user.publicNo}）？\n\n他可以重新登录。`
  )
  if (!ok) return
  busyId.value = user.id
  errorMessage.value = ''
  try {
    await setUserStatus(user.id, banning ? 2 : 1)
    safeLoad()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '操作失败，请重试'
  } finally {
    busyId.value = null
  }
}

async function hardDelete(user) {
  const ok = window.confirm(
    `彻底删除「${user.nick}」（编号 ${user.publicNo}）？\n\n` +
      `· 这个邮箱会**被释放**，那个人可以重新注册；\n` +
      `· 他的 ${user.commentCount} 条评论**会保留**，但不再挂在账号上；\n` +
      `· **不可恢复**。\n\n` +
      '只是不想让他登录的话，请用「封禁」。'
  )
  if (!ok) return
  busyId.value = user.id
  errorMessage.value = ''
  try {
    await deleteUserPermanently(user.id)
    safeLoad()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '删除失败，请重试'
  } finally {
    busyId.value = null
  }
}

async function changeRole(user, role) {
  const toAdmin = role === 1
  const ok = window.confirm(
    toAdmin
      ? `把「${user.nick}」（编号 ${user.publicNo}）设为管理员？\n\n` +
        '· 他能进入后台，管理评论、封禁/删除**普通用户**；\n' +
        '· 他**不能**操作其他管理员或超级管理员；\n' +
        '· 他的每一步操作都会记进审计日志。'
      : `撤销「${user.nick}」（编号 ${user.publicNo}）的管理员身份？\n\n` +
        '· 他将**无法再进入后台**（已登录的会话仍在，但后台接口会拒绝）；\n' +
        '· 他作为普通用户的一切都不受影响；\n' +
        '· 这个操作会记进审计日志。'
  )
  if (!ok) return
  busyId.value = user.id
  errorMessage.value = ''
  try {
    await setUserRole(user.id, role)
    safeLoad()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '操作失败，请重试'
  } finally {
    busyId.value = null
  }
}

/**
 * 当前登录者的角色。
 *
 * ⚠️ 这是**登录时的快照**，账号被降级后本地仍是旧值。所以它只用于
 * "按钮显不显示"，**不构成准入** —— 真正的判定在服务端。
 * 若快照过期（本地以为自己是超管、实际已被降级），按钮会出现但点击拿到 403，
 * 那时会显示错误文案，不会静默失败。
 */
const myRole = computed(() => Number(currentUser.value?.role) || 0)

/**
 * 判断某一行是不是**我自己**。
 *
 * 🔴 **必须用 `publicNo` 比，不能用 `id` 比** —— 两个 `id` 不是一回事：
 *   · 管理端列表的 `u.id`      = **内部自增 id**（服务端 `adminUsers` 的 `id: r.id`）
 *   · `currentUser.value.id`  = **对外编号**（`toPublicUser()` 把 `public_no` 映射成了 `id`）
 *
 * 早先这里写成 `Number(user.id) === Number(currentUser.value?.id)`，两个不同量纲的数
 * 永远不会相等 —— 于是"不能操作自己"这条**在界面上完全失效**：
 * 超管会看到自己那一行也有「封禁」「彻底删除」按钮，点了才被服务端 403 拦下。
 * 后端是稳的（所以没有安全问题），但界面在骗人。
 */
function isSelf(user) {
  return Number(user.publicNo) === Number(currentUser.value?.id)
}

/** 角色按钮：**仅超管可见**，且不能改自己（超管也不能改超管，服务端同样拒绝） */
function canSetRole(user) {
  if (myRole.value < 2) return false
  if (isSelf(user)) return false
  return Number(user.role) < 2
}

/** 能否封禁/删除该用户：只能动角色**严格低于**自己、且不是自己的账号 */
function canModerate(user) {
  if (isSelf(user)) return false
  return myRole.value > Number(user.role)
}

function roleLabel(role) {
  if (role >= 2) return '超级管理员'
  if (role === 1) return '管理员'
  return '普通用户'
}

function statusLabel(status) {
  if (status === 1) return '正常'
  if (status === 2) return '已停用'
  if (status === 3) return '已注销'
  return String(status)
}

function formatDate(unixSec) {
  if (!unixSec) return '—'
  return new Date(unixSec * 1000).toLocaleDateString('zh-CN')
}

onMounted(() => safeLoad())
onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<style scoped>
.admin-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  vertical-align: -5px;
  margin-right: 4px;
}

.admin-dim {
  color: var(--text-muted);
}

.admin-more {
  display: flex;
  justify-content: center;
}

/*
 * 角色列配色：管理员/超管用不同权重标出。
 * 只是**视觉提示**（扫一眼知道谁是管理员），不承担权限语义 —— 权限由
 * 服务端的 canActOn 决定，前端改样式不会带来任何越权。
 */
.admin-role-admin {
  color: #8a6d1f;
  font-weight: 600;
}

.admin-role-super {
  color: #b3261e;
  font-weight: 700;
}
</style>
