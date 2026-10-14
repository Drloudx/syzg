<template>
  <div class="admin-users-view">
    <!-- 2. 中间主工坊面板 -->
    <section class="admin-workshop admin-users-main">
      <!-- 页面大标题 -->
      <div class="workshop-header">
        <h1 class="workshop-title">
          <span class="workshop-title-star">✦</span>
          <span>用户管理</span>
        </h1>
        <p class="workshop-subtitle">
          ✦ 管理深渊之歌 (Tragoudi tou Abel) 注册用户状态、角色权限与违规封禁
        </p>
      </div>

      <!-- 4 联数据指标卡片（基于真实后端 /api/admin/stats 映射） -->
      <div v-if="stats?.users" class="stat-cards-grid">
        <div class="stat-card stat-card--total">
          <div class="stat-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 5c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm-8 0c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 8c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">用户总数</span>
            <span class="stat-value">{{ Number(stats.users.total).toLocaleString() }}</span>
          </div>
        </div>

        <div class="stat-card stat-card--ok">
          <div class="stat-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">正常用户</span>
            <span class="stat-value">{{ Number(stats.users.active).toLocaleString() }}</span>
          </div>
        </div>

        <div class="stat-card stat-card--today">
          <div class="stat-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">今日新增</span>
            <span class="stat-value">+{{ stats.users.today }}</span>
          </div>
        </div>

        <div class="stat-card stat-card--ban">
          <div class="stat-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">已封禁停用</span>
            <span class="stat-value">{{ stats.users.banned || 0 }}</span>
          </div>
        </div>
      </div>

      <!-- 搜索与操作过滤条（与后端接口参数严格对应：q / status / role） -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div class="workshop-toolbar">
          <div class="toolbar-search-row">
            <div class="search-input-wrap">
              <svg class="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                class="search-input admin-search"
                placeholder="搜对外编号 / 昵称 / 邮箱..."
                :value="searchInput"
                @input="onSearchInput($event.target.value)"
                @keydown.enter="applySearch"
              />
            </div>
            <button type="button" class="btn-search" @click="applySearch">搜索</button>
            <button type="button" class="btn-refresh" title="刷新用户列表与统计" @click="refreshList">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6"></path>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              <span>刷新</span>
            </button>
          </div>

          <div class="toolbar-filter-row">
            <select v-model="statusFilter" class="select-dropdown" @change="resetAndLoad">
              <option value="">全部状态</option>
              <option value="1">正常</option>
              <option value="2">已停用</option>
              <option value="3">已注销</option>
            </select>

            <select v-if="isSuper" v-model="roleFilter" class="select-dropdown" @change="resetAndLoad">
              <option value="">全部角色</option>
              <option value="admin">仅管理员 (超管/管理)</option>
              <option value="user">普通用户</option>
            </select>
          </div>
        </div>
      </div>

      <!-- 错误与空状态 -->
      <p v-if="errorMessage" class="admin-error-banner">{{ errorMessage }}</p>
      <div v-if="loading && !users.length" class="empty-hint-box">正在加载用户数据…</div>
      <div v-else-if="!users.length && !errorMessage" class="empty-hint-box">
        {{ searchQuery ? '没有匹配的用户。' : roleFilter === 'admin' ? '没有管理员账号。' : '这一档没有用户。' }}
      </div>

      <!-- 羊皮纸精细数据表格（完全依照生产 UsersPanel 字段） -->
      <div v-else class="table-container" ref="tableContainerRef">
        <table class="admin-table">
          <thead>
            <tr>
              <!--
                两套编号（2026-10-14 明确命名，消除混淆）：
                  · 「用户编号」= `users.public_no`，**对外**，从 10000 起，用户来反馈时报的就是它；
                  · 「用户 ID」  = `users.id`（SQLite 自增主键），**对内**，`comments.user_id` 指向它。
                🔴 两者**不同**（实测差 9975：id=711 的用户其编号是 10690）。
                两列都显示，便于核对；内部 ID 用等宽字体 + 加粗提高可读性（原先太淡看不清）。
              -->
              <th style="width: 84px;">用户编号</th>
              <th class="col-hide-mobile" style="width: 74px;">用户 ID</th>
              <th style="width: 130px;">用户</th>
              <th class="col-hide-mobile" style="width: 150px;">邮箱</th>
              <th class="col-hide-mobile" style="width: 60px; text-align: center;">评论</th>
              <!-- 「超级管理员」五个字要横排放下，列宽按最长角色名给 -->
              <th style="width: 105px;">角色</th>
              <!-- 「已停用」三个字要横排（原先 80px 会折行，见 .status-badge 注释） -->
              <th style="width: 92px; text-align: center;">状态</th>
              <!--
                只留「最近登录」（2026-10-14）。
                注册时间与右侧档案里的「注册时间」重复 —— 表格再列一遍是冗余，还占宽度。
              -->
              <th class="col-hide-mobile" style="width: 115px;">最近登录</th>
              <!--
                操作列要放得下「封禁 / 设为管理员 / 删除」三个文字链（不换行），
                超管那档最长，故按内容给足宽度（2026-10-14）。
              -->
              <th style="width: 185px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in users"
              :key="u.id"
              :class="{ 'is-selected': selectedUser?.id === u.id }"
              @click="selectUser(u)"
            >
              <td class="mono-cell">#{{ u.publicNo }}</td>
              <td class="mono-cell col-hide-mobile admin-inner-id">#{{ u.id }}</td>
              <td>
                <div class="user-cell">
                  <img v-if="avatarUrl(u.avatar)" :src="avatarUrl(u.avatar)" class="table-avatar" alt="" />
                  <div v-else class="table-avatar table-avatar--fallback">{{ (u.nick || '用')[0] }}</div>
                  <span class="user-name-text">{{ u.nick }}</span>
                </div>
              </td>
              <td class="col-hide-mobile">
                <div class="email-cell">{{ u.email || '（已清空）' }}</div>
                <div v-if="u.banNote" class="ban-note-badge">封禁：{{ u.banNote }}</div>
              </td>
              <td class="col-hide-mobile" style="text-align: center;">
                <RouterLink
                  v-if="u.commentCount > 0"
                  class="comment-count-link"
                  :to="{ path: '/admin/comments', query: { userId: u.id, nick: u.nick } }"
                  :title="`只看「${u.nick}」的评论`"
                  @click.stop
                >
                  {{ u.commentCount }}
                </RouterLink>
                <span v-else class="mono-cell" style="opacity: 0.6;">0</span>
              </td>
              <td>
                <span class="role-badge" :class="{ 'role-badge--super': u.role >= 2, 'role-badge--admin': u.role === 1 }">
                  {{ roleLabel(u.role) }}
                </span>
              </td>
              <td style="text-align: center;">
                <span :class="['status-badge', statusBadgeClass(u.status)]">{{ statusLabel(u.status) }}</span>
              </td>
              <td class="col-hide-mobile mono-cell">
                <div>{{ u.lastLoginAt ? formatDate(u.lastLoginAt) : '从未' }}</div>
              </td>
              <td style="text-align: right;">
                <div class="actions-chain" style="justify-content: flex-end;" @click.stop>
                  <template v-if="u.status === 1">
                    <span
                      class="action-link"
                      :class="{ 'action-link--disabled': busyId === u.id || !canModerate(u) }"
                      :title="canModerate(u) ? '' : '不能操作同级或更高级账号'"
                      @click="canModerate(u) && toggleBan(u)"
                    >
                      {{ busyId === u.id ? '处理中' : '封禁' }}
                    </span>
                  </template>
                  <template v-else-if="u.status === 2">
                    <span
                      class="action-link"
                      style="color: #287a4c;"
                      :class="{ 'action-link--disabled': busyId === u.id || !canModerate(u) }"
                      :title="canModerate(u) ? '' : '不能操作同级或更高级账号'"
                      @click="canModerate(u) && toggleBan(u)"
                    >
                      {{ busyId === u.id ? '处理中' : '解封' }}
                    </span>
                  </template>
                  <span v-else class="mono-cell" style="font-size: 11px;">已注销</span>

                  <template v-if="canSetRole(u)">
                    <span
                      class="action-link"
                      :class="{ 'action-link--disabled': busyId === u.id }"
                      @click="changeRole(u, u.role === 0 ? 1 : 0)"
                    >
                      {{ u.role === 0 ? '设为管理员' : '撤销管理' }}
                    </span>
                  </template>

                  <span
                    class="action-link action-link--danger"
                    :class="{ 'action-link--disabled': busyId === u.id || !canModerate(u) }"
                    :title="canModerate(u) ? '' : '不能操作同级或更高级账号'"
                    @click="canModerate(u) && hardDelete(u)"
                  >
                    删除
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 翻页控制栏（主流分页：[上一页] [1] ... [7] [8] [9] [10] [11] ... [28] [下一页] + 跳转） -->
      <div v-if="totalPages > 1 || users.length" class="pagination-bar">
        <!-- 总条数：复用分页接口本来就要算的 `total`，零额外查询（2026-10-14 加） -->
        <span v-if="totalCount > 0" class="pagination-total">共 {{ totalCount.toLocaleString() }} 条</span>

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
    </section>

    <!-- 移动端档案浮层背景蒙版 -->
    <div
      v-if="showMobileDrawer"
      class="mobile-drawer-backdrop"
      @click="closeMobileDrawer"
    ></div>

    <!-- 3. 右栏：真实用户概览与活动足迹（边框 4：手造皮质缝线与内衬层） -->
    <aside class="admin-detail-side leather-panel-container" :class="{ 'is-mobile-open': showMobileDrawer }">
      <div class="panel-header-title">
        <span>✦ 用户档案与足迹 ✦</span>
        <button type="button" class="drawer-close-btn" @click="closeMobileDrawer" aria-label="关闭档案">✕</button>
      </div>

      <template v-if="selectedUser">
        <!-- 用户名片 -->
        <div class="profile-card">
          <img v-if="avatarUrl(selectedUser.avatar)" :src="avatarUrl(selectedUser.avatar)" class="profile-avatar-big" alt="用户头像" />
          <div v-else class="profile-avatar-big profile-avatar-big--fallback">{{ (selectedUser.nick || '用')[0] }}</div>
          <div class="profile-name-row">
            <span class="profile-name">{{ selectedUser.nick }}</span>
            <span :class="['status-badge', statusBadgeClass(selectedUser.status)]">{{ statusLabel(selectedUser.status) }}</span>
          </div>
          <!-- 两套编号并列：保持「用户编号」与「用户 ID」命名，采用胶囊徽章排版加深清晰度与对比度 -->
          <div class="profile-ids">
            <div class="profile-id-chip">
              <span class="id-chip-label">用户编号</span>
              <strong class="id-chip-val">#{{ selectedUser.publicNo }}</strong>
            </div>
            <div class="profile-id-chip profile-id-chip--inner">
              <span class="id-chip-label">用户 ID</span>
              <strong class="id-chip-val id-chip-val--inner">#{{ selectedUser.id }}</strong>
            </div>
          </div>

          <!-- 针对该用户的快捷管理操作（提权、封号、查评论） -->
          <div class="profile-quick-actions">
            <button
              v-if="selectedUser.status === 1"
              type="button"
              class="quick-act-btn quick-act-btn--danger"
              :disabled="busyId === selectedUser.id || !canModerate(selectedUser)"
              @click="toggleBan(selectedUser)"
            >
              封禁账号
            </button>
            <button
              v-else-if="selectedUser.status === 2"
              type="button"
              class="quick-act-btn"
              :disabled="busyId === selectedUser.id || !canModerate(selectedUser)"
              @click="toggleBan(selectedUser)"
            >
              解除封禁
            </button>
            <button
              v-else
              type="button"
              class="quick-act-btn"
              disabled
            >
              已注销
            </button>

            <button
              v-if="canSetRole(selectedUser)"
              type="button"
              class="quick-act-btn"
              :disabled="busyId === selectedUser.id"
              @click="changeRole(selectedUser, selectedUser.role === 0 ? 1 : 0)"
            >
              {{ selectedUser.role === 0 ? '设为管理员' : '撤销管理' }}
            </button>
          </div>
        </div>

        <!-- 属性列表（100% 对应项目数据库 users 表字段） -->
        <div class="prop-list">
          <div class="prop-row">
            <span class="prop-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
              <span>用户类别</span>
            </span>
            <span class="prop-val" :class="{ 'role-badge--super': selectedUser.role >= 2, 'role-badge--admin': selectedUser.role === 1 }">
              {{ roleLabel(selectedUser.role) }}
            </span>
          </div>

          <div class="prop-row">
            <span class="prop-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
              <span>绑定邮箱</span>
            </span>
            <span class="prop-val mono">{{ selectedUser.email || '（已清空）' }}</span>
          </div>

          <div class="prop-row">
            <span class="prop-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>
              <span>累计评论</span>
            </span>
            <RouterLink
              v-if="selectedUser.commentCount > 0"
              class="prop-val mono comment-count-link"
              :to="{ path: '/admin/comments', query: { userId: selectedUser.id, nick: selectedUser.nick } }"
            >
              {{ selectedUser.commentCount }} 条 →
            </RouterLink>
            <span v-else class="prop-val mono" style="opacity: 0.6;">0 条</span>
          </div>

          <div class="prop-row">
            <span class="prop-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>
              <span>注册时间</span>
            </span>
            <span class="prop-val mono">{{ formatDate(selectedUser.createdAt) }}</span>
          </div>

          <div class="prop-row">
            <span class="prop-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>
              <span>最近登录</span>
            </span>
            <span class="prop-val mono">{{ selectedUser.lastLoginAt ? formatDate(selectedUser.lastLoginAt) : '从未' }}</span>
          </div>

          <!-- 封禁理由 -->
          <div v-if="selectedUser.banNote" class="prop-ban-note">
            <strong>封禁理由：</strong>{{ selectedUser.banNote }}
          </div>
        </div>

        <!--
          近期动态与足迹（2026-10-14 重排 + 相对时间）。

          🔴 **正序**（入驻 → 评论 → 登录 → 封禁 → 注销）：标题写的是"足迹"，
             语义就是从起点讲到现在。原先是"登录在最上、入驻在最下"的写死顺序 ——
             而新账号这两件事常在同一秒发生，看起来像时间倒错。

          🔴 时间用**相对时间**（"3 分钟前"），`title` 放绝对时间。
             零网络零数据库（见 utils/timeFormat.js 的成本说明）；
             也**不挂定时器**，与项目既有两处实现口径一致。

          ⚠️ 「封禁 / 注销」拿不到**准确发生时间** —— 数据源里只有
             `ban_note`（文案）与 `status`（当前状态），没有时间戳。
             所以这两个节点不显示时间，只写状态；编一个时间是骗人。
        -->
        <div class="activity-section">
          <div class="panel-header-title" style="margin-bottom: 0; padding-bottom: 6px;">✦ 近期动态与足迹 ✦</div>
          <div class="timeline">
            <!-- 节点 1：入驻（起点，永远第一条） -->
            <div class="timeline-item">
              <span class="timeline-node">◇</span>
              <div class="timeline-row">
                <span class="timeline-tag">入驻</span>
                <span class="timeline-time" :title="absoluteTime(selectedUser.createdAt)">
                  {{ relativeTime(selectedUser.createdAt) }}
                </span>
              </div>
              <span class="timeline-desc">
                注册于 {{ ageText(selectedUser.createdAt) }} · 正式加入深渊之歌大书院
              </span>
            </div>

            <!-- 节点 2：评论（无评论时也显示，填满列表避免空旷） -->
            <div class="timeline-item">
              <span class="timeline-node">◇</span>
              <div class="timeline-row">
                <span class="timeline-tag timeline-tag--comment">评论</span>
                <span class="timeline-time">
                  {{ selectedUser.commentCount > 0 ? `累计 ${selectedUser.commentCount} 条` : '暂无发表' }}
                </span>
              </div>
              <span class="timeline-desc">
                {{
                  selectedUser.commentCount > 0
                    ? '在 Wiki 词条或讨论区发表过交流留言'
                    : '尚未在词条或讨论区发表过留言'
                }}
              </span>
            </div>

            <!-- 节点 3：登录 -->
            <div class="timeline-item">
              <span class="timeline-node">◇</span>
              <div class="timeline-row">
                <span class="timeline-tag">登录</span>
                <span class="timeline-time" :title="absoluteTime(selectedUser.lastLoginAt)">
                  {{ selectedUser.lastLoginAt ? relativeTime(selectedUser.lastLoginAt) : '从未登录' }}
                </span>
              </div>
              <span class="timeline-desc">
                {{ selectedUser.lastLoginAt ? '最近一次活跃登录会话' : '注册后尚无登录会话' }}
              </span>
            </div>

            <!-- 节点 4：封禁留痕（只有被封才有；无准确时间，故不显示时间） -->
            <div v-if="selectedUser.banNote" class="timeline-item">
              <span class="timeline-node">◇</span>
              <div class="timeline-row">
                <span class="timeline-tag timeline-tag--audit">封禁</span>
                <span class="timeline-time">状态受限</span>
              </div>
              <span class="timeline-desc">被管理员封禁停用：{{ selectedUser.banNote }}</span>
            </div>

            <!-- 节点 5：注销留痕（只有 status === 3 才有） -->
            <div v-if="selectedUser.status === 3" class="timeline-item">
              <span class="timeline-node">◇</span>
              <div class="timeline-row">
                <span class="timeline-tag timeline-tag--audit">注销</span>
                <span class="timeline-time">账号已注销</span>
              </div>
              <span class="timeline-desc">用户在前台自行申请注销账号，邮箱已安全释放</span>
            </div>
          </div>
        </div>
      </template>

      <div v-else style="padding: 24px 10px; text-align: center; color: var(--text-muted); font-size: 13px;">
        在左侧表格中点击任意用户，查看详细档案与动态足迹。
      </div>
    </aside>

    <!-- 封禁理由输入弹窗 -->
    <UiModal
      :visible="banTarget !== null"
      teleport-to="body"
      title="封禁账号"
      max-width="520px"
      @update:visible="(v) => { if (!v) cancelBan() }"
    >
      <p class="admin-modal-lead">
        停用 <strong>{{ banTarget?.nick }}</strong>（编号 {{ banTarget?.publicNo }}）。
      </p>
      <p class="admin-modal-quote">
        停用后该账号立即无法登录（现有会话同时作废）。理由只有管理员能看到，用户只会看到「该账号已被停用」。
      </p>

      <label class="admin-modal-label" for="ban-note-input">
        封禁理由
        <span class="admin-modal-optional">（选填，最多 {{ BAN_NOTE_MAX }} 字）</span>
      </label>
      <input
        id="ban-note-input"
        v-model="banNote"
        class="admin-input"
        type="text"
        :maxlength="BAN_NOTE_MAX"
        placeholder="例如：在评论区多次发布违规广告"
        @keydown.enter.prevent="confirmBan"
      />
      <div class="admin-modal-count">{{ banNote.length }} / {{ BAN_NOTE_MAX }}</div>

      <template #footer>
        <button type="button" class="admin-btn admin-btn--ghost" @click="cancelBan">取消</button>
        <button type="button" class="admin-btn admin-btn--danger" :disabled="savingBan" @click="confirmBan">
          {{ savingBan ? '处理中…' : '确认封禁' }}
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
  </div>
</template>

<script setup>
/**
 * 后台 · 用户管理。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { avatarPath } from '../../utils/avatarCatalog.js'
import { getImageUrl } from '../../utils/env.js'
import { currentUser } from '../../utils/authSession.js'
import { formatAbsoluteTime, formatAge, formatRelativeTime } from '../../utils/timeFormat.js'
import UiModal from '../ui/UiModal.vue'
import {
  AdminApiError,
  deleteUserPermanently,
  fetchAdminStats,
  fetchAdminUsers,
  setUserRole,
  setUserStatus
} from '../../utils/adminApi.js'

const stats = ref(null)
const selectedUser = ref(null)

const users = ref([])
const loading = ref(false)
const errorMessage = ref('')
const statusFilter = ref('') // 默认全部状态，与预览页保持一致
const roleFilter = ref('')
const cursor = ref(null)
const hasMore = ref(false)
const busyId = ref(null)

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

const BAN_NOTE_MAX = 80
const banTarget = ref(null)
const banNote = ref('')
const savingBan = ref(false)

const searchInput = ref('')
const searchQuery = ref('')
let searchTimer = 0

const showMobileDrawer = ref(false)

function avatarUrl(id) {
  const p = avatarPath(id || '')
  return p ? getImageUrl(p) : ''
}

function selectUser(user) {
  selectedUser.value = user
  showMobileDrawer.value = true
}

function closeMobileDrawer() {
  showMobileDrawer.value = false
}

function statusBadgeClass(status) {
  if (status === 1) return 'status-badge--ok'
  if (status === 2) return 'status-badge--ban'
  return 'status-badge--del'
}

function onSearchInput(value) {
  searchInput.value = value
  clearTimeout(searchTimer)
  searchTimer = setTimeout(applySearch, 350)
}

function applySearch() {
  clearTimeout(searchTimer)
  const next = searchInput.value.trim()
  searchQuery.value = next
  resetAndLoad()
}

function resetAndLoad() {
  currentPage.value = 1
  totalCount.value = 0
  safeLoad({ page: 1 })
}

function refreshList() {
  searchInput.value = ''
  searchQuery.value = ''
  statusFilter.value = ''
  roleFilter.value = ''
  totalCount.value = 0
  resetAndLoad()
  loadStats()
}

async function load({ page: reqPage } = {}) {
  loading.value = true
  errorMessage.value = ''
  const targetPage = reqPage !== undefined ? reqPage : currentPage.value
  try {
    const data = await fetchAdminUsers({
      status: statusFilter.value,
      q: searchQuery.value,
      role: roleFilter.value,
      page: targetPage,
      total: totalCount.value > 0 && targetPage !== 1 ? totalCount.value : undefined
    })
    const page = data.users || []
    users.value = page
    currentPage.value = data.page ?? targetPage
    totalPages.value = data.totalPages ?? 1
    totalCount.value = data.total ?? page.length
    hasMore.value = Boolean(data.hasMore)

    if (!selectedUser.value && users.value.length) {
      selectedUser.value = users.value[0]
    } else if (selectedUser.value) {
      const found = users.value.find((u) => u.id === selectedUser.value.id)
      if (found) selectedUser.value = found
    }
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

function reloadCurrentPage() {
  return safeLoad({ page: currentPage.value })
}

const tableContainerRef = ref(null)

function scrollToTableTop() {
  if (tableContainerRef.value) {
    tableContainerRef.value.scrollTop = 0
  }
  const el = document.querySelector('.admin-users-view .table-container')
  if (el) el.scrollTop = 0
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

async function toggleBan(user) {
  if (user.status === 1) {
    banTarget.value = user
    banNote.value = ''
    return
  }

  const ok = await askConfirm({
    title: '解封账号',
    lead: `解封「${user.nick}」（编号 ${user.publicNo}）？`,
    content: '该用户将可以重新正常登录前台讨论区与个人中心。',
    confirmText: '确认解封'
  })
  if (!ok) return
  busyId.value = user.id
  errorMessage.value = ''
  try {
    await setUserStatus(user.id, 1)
    reloadCurrentPage()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '操作失败，请重试'
  } finally {
    busyId.value = null
  }
}

function cancelBan() {
  banTarget.value = null
  banNote.value = ''
}

async function confirmBan() {
  if (savingBan.value || !banTarget.value) return
  const target = banTarget.value
  const note = banNote.value.trim()
  savingBan.value = true
  errorMessage.value = ''
  try {
    await setUserStatus(target.id, 2, note)
    cancelBan()
    reloadCurrentPage()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '操作失败，请重试'
  } finally {
    savingBan.value = false
  }
}

async function hardDelete(user) {
  const ok = await askConfirm({
    title: '彻底删除用户',
    lead: `彻底删除「${user.nick}」（编号 ${user.publicNo}）？`,
    content:
      '· 这个邮箱会被释放，用户可以重新注册\n' +
      `· 他的 ${user.commentCount} 条评论会保留，但不再挂在账号上\n` +
      '· 此操作不可恢复！若只想禁止登录请用「封禁」',
    confirmText: '彻底删除',
    isDanger: true
  })
  if (!ok) return
  busyId.value = user.id
  errorMessage.value = ''
  try {
    await deleteUserPermanently(user.id)
    reloadCurrentPage()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '删除失败，请重试'
  } finally {
    busyId.value = null
  }
}

async function changeRole(user, role) {
  const toAdmin = role === 1
  const ok = await askConfirm({
    title: toAdmin ? '设为管理员' : '撤销管理权限',
    lead: toAdmin ? `把「${user.nick}」（编号 ${user.publicNo}）设为管理员？` : `撤销「${user.nick}」（编号 ${user.publicNo}）的管理员身份？`,
    content: toAdmin
      ? '· 他能进入后台，管理评论、封禁/删除普通用户\n· 他不能操作其他管理员或超级管理员\n· 他的每一步操作都会记进审计日志'
      : '· 他将无法再进入后台（已登录会话仍在，但后台接口会拒绝）\n· 他作为普通用户的一切都不受影响\n· 这个操作会记进审计日志',
    confirmText: toAdmin ? '设为管理员' : '撤销权限',
    isDanger: !toAdmin
  })
  if (!ok) return
  busyId.value = user.id
  errorMessage.value = ''
  try {
    await setUserRole(user.id, role)
    reloadCurrentPage()
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '操作失败，请重试'
  } finally {
    busyId.value = null
  }
}

const myRole = computed(() => Number(currentUser.value?.role) || 0)
const isSuper = computed(() => myRole.value >= 2)

function isSelf(user) {
  return Number(user.publicNo) === Number(currentUser.value?.id)
}

function canSetRole(user) {
  if (myRole.value < 2) return false
  if (isSelf(user)) return false
  return Number(user.role) < 2
}

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
  const d = new Date(unixSec * 1000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const date = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${date} ${hh}:${mm}`
}

/*
 * 足迹用到的三个时间格式化（薄封装，指向 utils/timeFormat.js）。
 *
 * 用 `title` 属性承载绝对时间：相对时间好读，但要精确到分钟时仍需绝对值。
 * 三者都是**纯函数、零网络零数据库**，且在渲染时算一次（无定时器）。
 */
const relativeTime = (t) => formatRelativeTime(t)
const absoluteTime = (t) => formatAbsoluteTime(t)
const ageText = (t) => formatAge(t)

async function loadStats() {
  try {
    const res = await fetchAdminStats()
    stats.value = res
  } catch {
    /* 允许统计指标静默失败 */
  }
}

onMounted(() => {
  safeLoad()
  loadStats()
})
onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<style scoped>
.admin-users-view {
  --wood-border: #7a5c3d;
  --gold-border: rgba(143, 115, 81, 0.45);
  --gold-accent: #c5913e;
  --gold-bright: #ffd78c;
  --text-main: #3e2a14;
  --text-muted: #755c3f;
  --text-light: #f7e6c4;
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
  --status-del-bg: #eae6df;
  --status-del-text: #8c765c;
  --status-del-border: #c4b6a5;

  display: flex;
  gap: 16px;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

:deep(.dark-mode) .admin-users-view,
.dark-mode .admin-users-view {
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
  --status-ban-bg: rgba(184, 50, 50, 0.22);
  --status-ban-text: #f07f7f;
  --status-ban-border: rgba(240, 127, 127, 0.4);
  --status-del-bg: rgba(140, 118, 92, 0.22);
  --status-del-text: #b09a82;
  --status-del-border: rgba(176, 154, 130, 0.4);
}

/* 2. 中间主工作坊面板 */
.admin-workshop {
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

.workshop-header {
  flex-shrink: 0;
  border-bottom: 1.5px solid var(--gold-border);
  padding-bottom: 12px;
}
.workshop-title {
  font-size: 23px;
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
  font-size: 13px;
  color: var(--text-muted);
  margin: 4px 0 0;
  letter-spacing: 0.5px;
}

/* 4 联数据指标卡片 */
.stat-cards-grid {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.stat-card {
  border: 1.5px solid rgba(143, 115, 81, 0.35);
  border-radius: 8px;
  background: var(--paper-card);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.6), 0 2px 6px rgba(0,0,0,0.06);
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(60, 40, 20, 0.12);
}
.stat-card::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, transparent, #c5913e 40%, transparent);
  opacity: 0.6;
}

.stat-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(143, 115, 81, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #7a5c3d;
  border: 1px solid rgba(143, 115, 81, 0.25);
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.6), 0 2px 5px rgba(0, 0, 0, 0.08);
}

.stat-card--total .stat-icon-wrap { color: #7d4d1d; background: rgba(125, 77, 29, 0.12); border-color: rgba(125, 77, 29, 0.3); }
.stat-card--ok .stat-icon-wrap { color: #246d43; background: rgba(36, 109, 67, 0.12); border-color: rgba(36, 109, 67, 0.3); }
.stat-card--today .stat-icon-wrap { color: #a87222; background: rgba(168, 114, 34, 0.12); border-color: rgba(168, 114, 34, 0.3); }
.stat-card--ban .stat-icon-wrap { color: #a82e2e; background: rgba(168, 46, 46, 0.12); border-color: rgba(168, 46, 46, 0.35); }

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.stat-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}
.stat-value {
  font-size: 24px;
  font-weight: 800;
  font-family: ui-monospace, "Cascadia Code", "Roboto Mono", monospace;
  color: var(--text-main);
  letter-spacing: 0.5px;
}

/* 搜索与工具条 */
.workshop-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-search-row,
.toolbar-filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.toolbar-search-row {
  flex: 1;
}

.search-input-wrap {
  flex: 1;
  min-width: 260px;
  position: relative;
}

.search-input {
  width: 100%;
  height: 38px;
  padding: 0 14px 0 38px;
  border-radius: 6px;
  border: 1.5px solid rgba(143, 115, 81, 0.45);
  background: var(--paper-card);
  color: var(--text-main);
  font-size: 13.5px;
  outline: none;
  box-sizing: border-box;
  transition: all 0.2s;
}
.search-input:focus {
  border-color: #a88452;
  box-shadow: 0 0 0 3px rgba(168, 132, 82, 0.2);
}
.search-input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}

.select-dropdown {
  height: 38px;
  padding: 0 28px 0 14px;
  border-radius: 6px;
  border: 1.5px solid rgba(143, 115, 81, 0.45);
  background: var(--paper-card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a5c3d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat calc(100% - 10px) center;
  color: var(--text-main);
  font-size: 13px;
  outline: none;
  cursor: pointer;
  appearance: none;
}
.select-dropdown:focus {
  border-color: #a88452;
}

.btn-search {
  height: 38px;
  padding: 0 20px;
  background: linear-gradient(180deg, #4d331a, #2f1d0d);
  border: 1px solid #c5913e;
  color: #f7e6c4;
  border-radius: 6px;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: all 0.18s;
}
.btn-search:hover {
  background: linear-gradient(180deg, #5c3e21, #3b2513);
  border-color: #ffd78c;
  color: #fff;
}

.btn-refresh {
  height: 38px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid rgba(143, 115, 81, 0.5);
  color: var(--text-main);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s;
}
.btn-refresh:hover {
  background: rgba(143, 115, 81, 0.18);
  border-color: #a88452;
}

.search-hint-text {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: -6px;
}
.search-hint-text strong {
  color: var(--text-main);
}

.admin-error-banner {
  padding: 10px 14px;
  background: rgba(184, 50, 50, 0.12);
  border: 1px solid rgba(184, 50, 50, 0.3);
  border-radius: 6px;
  color: #b83232;
  font-size: 13px;
}

.empty-hint-box {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13.5px;
}

/* 羊皮纸精细数据表格 */
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

.admin-table tbody tr:last-child td {
  border-bottom: none;
}

.admin-table tbody tr {
  cursor: pointer;
  position: relative;
}

.admin-table tbody tr:hover td {
  background-color: rgba(245, 237, 222, 0.85);
}
:deep(.dark-mode) .admin-table tbody tr:hover td,
.dark-mode .admin-table tbody tr:hover td {
  background-color: rgba(60, 45, 30, 0.5);
}

.admin-table tbody tr.is-selected td {
  background-color: rgba(212, 163, 89, 0.18) !important;
}
.admin-table tbody tr.is-selected td:first-child {
  position: relative;
}
.admin-table tbody tr.is-selected td:first-child::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 4px;
  border-radius: 0 2px 2px 0;
  background: #c5913e;
}

/* 表格内字段样式 */
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.table-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1.5px solid #c5913e;
  object-fit: cover;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  flex-shrink: 0;
}
.table-avatar--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #7a5c3d;
  color: #ffd78c;
  font-size: 13px;
  font-weight: bold;
}

.user-name-text {
  font-weight: 700;
  color: var(--text-main);
}

.mono-cell {
  font-family: ui-monospace, "Cascadia Code", "Roboto Mono", monospace;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

/*
 * 「用户 ID」列（内部自增 id）。
 *
 * 🔴 必须比普通 `.mono-cell` 更醒目：用户反馈原先**看不清**。
 *    原样式是 `--text-muted`（灰）+ 12px，在一堆信息里几乎看不见。
 *    既然这一列存在的意义就是"内部对照"，看不清等于没有，故：
 *      · 字号提到 12.5px
 *      · 颜色改用正文色（而不是 muted）
 *      · 加 600 字重
 */
.admin-inner-id {
  font-size: 12.5px;
  color: var(--text-main);
  font-weight: 600;
}

.email-cell {
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.ban-note-badge {
  display: inline-block;
  font-size: 11px;
  color: #b83232;
  background: rgba(184, 50, 50, 0.12);
  padding: 1px 5px;
  border-radius: 3px;
  margin-top: 2px;
}

.comment-count-link {
  color: #557574;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  text-decoration: underline;
  cursor: pointer;
}
.comment-count-link:hover {
  color: var(--text-main);
}

/*
 * 角色徽标（普通用户 / 管理员 / 超级管理员）。
 *
 * 🔴 `white-space: nowrap` 是必需的（2026-10-14 补）：这类短标签是 `<span>`，
 * 中文可在任意处断行，角色列一窄就折成「超级管理/员」。
 * 英文单词默认不断行、中文才会，所以这类缺陷只在中文字段上冒出来。
 */
.role-badge {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.role-badge--super {
  color: #c5913e;
  font-weight: 800;
  text-shadow: 0 0 1px rgba(197, 145, 62, 0.5);
}
.role-badge--admin {
  color: #557574;
  font-weight: 700;
}

/* 状态微胶囊标签 */
/*
 * 状态徽标（正常 / 已停用 / 已注销）。
 *
 * 🔴 `white-space: nowrap` 是必需的（2026-10-14 补）。
 *    同 `.role-badge` 那一处：这些标签是 `<span>`，**中文可在任意处断行**，
 *    列一窄就折成「正/常」两行（新增「用户 ID」列后实测出现）。
 *    英文单词默认不断行、中文才会 —— 所以这类缺陷只在中文字段上冒出来。
 */
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
  white-space: nowrap;
}

.status-badge--ok {
  background: var(--status-ok-bg);
  color: var(--status-ok-text);
  border-color: var(--status-ok-border);
}
.status-badge--ban {
  background: var(--status-ban-bg);
  color: var(--status-ban-text);
  border-color: var(--status-ban-border);
}
.status-badge--del {
  background: var(--status-del-bg);
  color: var(--status-del-text);
  border-color: var(--status-del-border);
}

/*
 * 行内操作链（封禁 / 设为管理员 / 删除）。
 *
 * 🔴 必须显式 `nowrap` + `flex-shrink: 0`（2026-10-14 补）。
 * 这两条原先**只写在手机端 `@media` 里**，桌面端没有，于是列一窄就
 * **逐字换行**（「封/禁」「删/除」各占一行）—— 因为这几个 `.action-link`
 * 是 `<span>`，默认 `white-space: normal`，中文可以任意处断行。
 * 这类缺陷只在桌面宽度不足以放下整列时出现，靠改窗口大小才发现。
 */
.actions-chain {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  white-space: nowrap;
}

.action-link {
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
  /* 不允许在按钮内部换行，也不允许被 flex 压缩到换行 */
  white-space: nowrap;
  flex-shrink: 0;
}
.action-link:hover {
  color: #c5913e;
  text-decoration: underline;
}
.action-link--danger:hover {
  color: #b83232;
}
.action-link--disabled {
  opacity: 0.4;
  cursor: not-allowed !important;
  text-decoration: none !important;
}

/* 复古翻页栏 */
.pagination-bar {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
}

/*
 * 「共 N 条」贴分页栏左侧。
 * 用绝对定位让它**不参与** `justify-content: center` 的居中计算 ——
 * 否则页码会被总条数挤偏，而且位数变化（"9 条" vs "1,234 条"）偏移量还会变。
 */
.pagination-total {
  position: absolute;
  left: 0;
  font-size: 12.5px;
  color: var(--text-muted);
  white-space: nowrap;
  pointer-events: none;
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

/* 3. 右侧信息概览与活动栏（手造皮质缝线与内衬层容器） */
.admin-detail-side {
  width: 300px;
  flex-shrink: 0;
  height: 100%;
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.leather-panel-container {
  border: 2px solid var(--wood-border);
  box-shadow: inset 0 0 0 4px rgba(223, 206, 179, 0.9),
              inset 0 0 0 5.5px rgba(143, 115, 81, 0.55),
              2px 4px 12px rgba(0, 0, 0, 0.22);
  border-radius: 6px;
  background: #e0cfb4;
  padding: 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

:deep(.dark-mode) .leather-panel-container,
.dark-mode .leather-panel-container {
  border-color: #5c4327;
  box-shadow: inset 0 0 0 4px rgba(46, 34, 23, 0.95),
              inset 0 0 0 5.5px rgba(110, 85, 55, 0.55),
              2px 4px 12px rgba(0, 0, 0, 0.4);
  background: #2b1f15;
}

.panel-header-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  padding: 6px 6px 10px;
  margin-bottom: 8px;
  letter-spacing: 2px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1.5px solid var(--gold-border);
}
.panel-header-title::after {
  content: '◆';
  font-size: 10px;
  color: #a88452;
}

/* 用户名片卡 */
.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8px 4px 14px;
  border-bottom: 1px dashed rgba(143, 115, 81, 0.35);
}

.profile-avatar-big {
  width: 74px;
  height: 74px;
  border-radius: 50%;
  border: 3px solid #ffd78c;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35), 0 0 0 1px #a88452;
  object-fit: cover;
  margin-bottom: 10px;
}
.profile-avatar-big--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #7a5c3d;
  color: #ffd78c;
  font-size: 28px;
  font-weight: bold;
}

.profile-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

/*
 * 右栏顶部两套编号并列（2026-10-14 视觉重构）。
 *
 * 1. 概念明确：分别命名为「对外编号」与「内部 ID」，消除同义混淆；
 * 2. 胶囊化排版：每个编号自成一枚精致小卡（Chip），标签与数值分明，不挤在一起；
 * 3. 对比度加深：亮色模式下内部 ID 采用深琥珀褐（#8f520e，对比度 > 5:1），拒绝浅金漂色看不清；
 * 4. 等宽字体加粗：便于核对与抄写。
 */
.profile-ids {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin: 4px 0 2px;
}

.profile-id-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  background: rgba(143, 115, 81, 0.12);
  border: 1px solid rgba(143, 115, 81, 0.3);
  border-radius: 12px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
}

.profile-id-chip--inner {
  background: rgba(197, 145, 62, 0.12);
  border-color: rgba(197, 145, 62, 0.4);
}

.id-chip-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.3px;
}

.id-chip-val {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: 0.5px;
}

.id-chip-val--inner {
  color: #8f520e;
}

:deep(.dark-mode) .profile-id-chip,
.dark-mode .profile-id-chip {
  background: rgba(0, 0, 0, 0.28);
  border-color: rgba(143, 115, 81, 0.45);
}

:deep(.dark-mode) .profile-id-chip--inner,
.dark-mode .profile-id-chip--inner {
  background: rgba(212, 163, 89, 0.14);
  border-color: rgba(212, 163, 89, 0.45);
}

:deep(.dark-mode) .id-chip-val--inner,
.dark-mode .id-chip-val--inner {
  color: var(--gold-accent, #d4a359);
}

.profile-name {
  font-size: 17px;
  font-weight: 800;
  color: var(--text-main);
}

.profile-quick-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  width: 100%;
}
.quick-act-btn {
  flex: 1;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  border: 1px solid rgba(143, 115, 81, 0.5);
  background: rgba(245, 237, 222, 0.7);
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.15s;
}
.quick-act-btn:hover:not(:disabled) {
  background: #4d331a;
  color: #ffd78c;
  border-color: #ffd78c;
}
.quick-act-btn--danger:hover:not(:disabled) {
  background: #7a2828;
  color: #fff;
  border-color: #e8a0a0;
}
.quick-act-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 属性条目列表 */
.prop-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 4px;
}

.prop-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12.5px;
}

.prop-label {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.prop-label svg {
  color: #c5913e;
}

.prop-val {
  font-weight: 700;
  color: var(--text-main);
}
.prop-val.mono {
  font-family: ui-monospace, "Cascadia Code", "Roboto Mono", monospace;
}

.prop-ban-note {
  background: rgba(184, 50, 50, 0.1);
  border: 1px solid rgba(184, 50, 50, 0.3);
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11.5px;
  color: #b83232;
  line-height: 1.4;
  margin-top: 4px;
}

/* 最近动态与足迹时间线 */
.activity-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 4px;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  padding-left: 18px;
  margin-top: 6px;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 6px;
  bottom: 6px;
  width: 1.5px;
  background: rgba(143, 115, 81, 0.35);
}

.timeline-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/*
 * 标签 + 时间那一行（原先写的是内联 `display:flex; align-items:center`，
 * 抽出成类名以便统一管住换行 —— 同 `.status-badge` 那处的教训：
 * 中文可在任意处断行，不写 nowrap 就会折）。
 */
.timeline-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 4px;
}
.timeline-row .timeline-tag,
.timeline-row .timeline-time {
  white-space: nowrap;
}

.timeline-node {
  position: absolute;
  left: -18px;
  top: 2px;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c5913e;
  font-size: 11px;
}

.timeline-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(143, 115, 81, 0.2);
  color: var(--text-muted);
  margin-right: 4px;
}
.timeline-tag--comment { background: rgba(85, 117, 116, 0.2); color: #557574; }
.timeline-tag--audit { background: rgba(197, 145, 62, 0.2); color: #a88452; }

.timeline-time {
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: var(--text-muted);
}

.timeline-desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-main);
  font-weight: 500;
}

/* 封禁理由弹窗辅助样式 */
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
.admin-modal-count {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}

.drawer-close-btn {
  display: none;
  background: transparent;
  border: none;
  color: #8f7351;
  font-size: 15px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.drawer-close-btn:hover {
  color: var(--text-main);
  background: rgba(143, 115, 81, 0.15);
}

/*
 * 移动端档案抽屉的遮罩。
 *
 * 🔴 **必须在窄屏之外彻底不参与布局**（2026-10-14 两轮修）。
 *
 * 第一轮只把它的样式（背景 / fixed 定位）用媒体查询排除了，以为够了 ——
 * 结果用户反馈「不灰屏了，但点用户后中间区域变窄了」。
 *
 * 根因：这个 `<div>` 是 `.admin-users-view`（`display: flex; gap: 16px`）
 * 的**第二个子项**。媒体查询排除的只是它的**样式**，元素本身仍在 flex 流里
 * —— 于是它按自身（`inset: 0` 失效后为 0 宽，但 `gap` 仍生效）占一个槽位，
 * 中间的 `.admin-workshop` 被挤窄。
 *
 * 所以正确修法是**让元素在窄屏之外完全不参与布局**：`display: none`。
 * 桌面端它既不渲染、也不占位、也不产生 gap。
 */
.mobile-drawer-backdrop {
  display: none;
}

@media (max-width: 900px) {
  .mobile-drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    z-index: 12050;
    animation: fadeIn 0.2s ease-out;
  }
}

@media (max-width: 1280px) {
  .admin-detail-side {
    width: 260px;
  }
  .stat-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 900px) {
  /* 移动端抽屉：隐藏标题右侧的装饰菱形，把最右上角空间留给关闭按钮 */
  .admin-detail-side > .panel-header-title::after {
    display: none !important;
  }

  .drawer-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    width: 30px;
    height: 30px;
    font-size: 16px;
    font-weight: 700;
    line-height: 1;
    color: var(--text-muted);
    background: rgba(143, 115, 81, 0.12);
    border: 1px solid rgba(143, 115, 81, 0.28);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
    flex-shrink: 0;
  }
  .drawer-close-btn:active {
    background: rgba(143, 115, 81, 0.28);
    color: var(--text-main);
  }

  .col-hide-mobile {
    display: none !important;
  }

  .admin-users-view {
    gap: 0;
  }

  /* 移动端详情档案转为右侧滑出抽屉，不再常驻挤压中间内容 */
  .admin-detail-side {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(340px, 86vw);
    z-index: 12100;
    transform: translateX(105%);
    transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.5);
    border-radius: 8px 0 0 8px;
    background: var(--paper, #e0cfb4);
  }
  .admin-detail-side.is-mobile-open {
    transform: translateX(0);
  }

  /* 顶部 4 联指标卡在移动端压缩为紧凑 2x2 网格 */
  .stat-cards-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  .stat-card {
    padding: 8px 10px;
    gap: 10px;
    border-radius: 6px;
  }
  .stat-icon-wrap {
    width: 34px;
    height: 34px;
  }
  .stat-icon-wrap svg {
    width: 18px;
    height: 18px;
  }
  .stat-label {
    font-size: 11px;
  }
  .stat-value {
    font-size: 17px;
  }

  /* 图 2 优化：搜索与过滤工具栏两行整齐自适应排版 */
  .workshop-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .toolbar-search-row {
    width: 100%;
    display: flex;
    gap: 6px;
  }
  .toolbar-filter-row {
    width: 100%;
    display: flex;
    gap: 6px;
  }
  .toolbar-filter-row .select-dropdown {
    flex: 1;
    min-width: 0;
  }

  .search-input-wrap {
    min-width: 0;
    flex: 1;
  }
  .search-input {
    height: 34px;
    font-size: 12.5px;
  }
  .select-dropdown {
    height: 34px;
    font-size: 12px;
    padding: 0 24px 0 8px;
  }
  .btn-search,
  .btn-refresh {
    height: 34px;
    font-size: 12px;
    padding: 0 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* 图 2 核心修复：表格支持向右平滑滚动，所有单元格及操作按钮横放，禁止竖排折叠 */
  .table-container {
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    width: 100% !important;
  }
  .admin-table {
    min-width: 580px !important;
    width: 100% !important;
  }
  .admin-table th,
  .admin-table td {
    white-space: nowrap !important;
  }
  .user-cell {
    white-space: nowrap !important;
  }
  .role-badge {
    white-space: nowrap !important;
    display: inline-block !important;
  }
  .status-badge {
    white-space: nowrap !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 2px 8px !important;
    border-radius: 4px !important;
  }
  .actions-chain {
    display: inline-flex !important;
    flex-direction: row !important;
    align-items: center !important;
    flex-wrap: nowrap !important;
    gap: 10px !important;
    white-space: nowrap !important;
  }
  .action-link {
    white-space: nowrap !important;
    display: inline-block !important;
    padding: 2px 5px !important;
  }

  /* 翻页栏优化：隐藏冗余的跳页输入框，按钮不折行 */
  .page-jumper {
    display: none !important;
  }
  .page-btn {
    white-space: nowrap !important;
    flex-shrink: 0 !important;
    padding: 6px 12px !important;
    font-size: 12px !important;
    height: 32px !important;
  }
  .page-number {
    flex-shrink: 0 !important;
    width: 30px !important;
    height: 30px !important;
    font-size: 12px !important;
  }
}
</style>
