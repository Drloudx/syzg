<template>
  <UiModal
    :visible="modelValue"
    :title="modalTitle"
    :max-width="modalMaxWidth"
    max-height="min(93vh, 840px)"
    teleport-to="body"
    @update:visible="close"
  >
    <!-- ==================== 未登录：登录 / 注册 ==================== -->
    <template v-if="!isLoggedIn">
      <div class="acct-switch">
        <button
          type="button"
          class="acct-switch-btn"
          :class="{ 'is-on': view === 'login' }"
          @click="go('login')"
        >
          登录
        </button>
        <button
          type="button"
          class="acct-switch-btn"
          :class="{ 'is-on': view === 'register' }"
          @click="go('register')"
        >
          注册
        </button>
      </div>

      <!-- ---------- 登录 ---------- -->
      <form v-if="view === 'login'" class="acct-form" novalidate @submit.prevent="doLogin">
        <label class="acct-field">
          <span class="acct-label">邮箱</span>
          <input
            v-model="loginForm.email"
            class="acct-input"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="注册时用的邮箱"
            @blur="onLoginEmailBlur"
          />
        </label>
        <div class="acct-field">
          <div class="acct-field-head">
            <span class="acct-label">密码</span>
            <button type="button" class="acct-forgot-link" @click="openForgotPassword">忘记密码？</button>
          </div>
          <input
            v-model="loginForm.password"
            class="acct-input"
            type="password"
            autocomplete="current-password"
            placeholder="密码"
          />
        </div>

        <p v-if="loginForm.error" class="acct-error">{{ loginForm.error }}</p>

        <UiButton type="submit" block :disabled="loginForm.busy">
          {{ loginForm.busy ? '登录中…' : '登录' }}
        </UiButton>
      </form>

      <!-- ---------- 找回密码（未登录） ---------- -->
      <form v-else-if="view === 'forgot'" class="acct-form" novalidate @submit.prevent="doResetPassword">
        <p class="acct-hint">
          输入注册时的邮箱，我们将发送验证码用于重置密码。
        </p>

        <label class="acct-field">
          <span class="acct-label">邮箱</span>
          <input
            v-model="forgotForm.email"
            class="acct-input"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="注册时用的邮箱"
          />
        </label>

        <div class="acct-field">
          <span class="acct-label">邮箱验证码</span>
          <div class="acct-code-row">
            <input
              v-model="forgotForm.code"
              class="acct-input acct-input--code"
              type="text"
              inputmode="numeric"
              :maxlength="CODE_DIGITS"
              autocomplete="one-time-code"
              :placeholder="`${CODE_DIGITS} 位数字`"
            />
            <UiButton variant="secondary" :disabled="!forgotCode.canSend.value || forgotForm.busy" @click="startForgotCode">
              {{ forgotCode.buttonText.value }}
            </UiButton>
          </div>
          <p v-if="forgotCode.error.value" class="acct-error acct-error--tight">{{ forgotCode.error.value }}</p>
          <p v-else-if="forgotCode.sent.value" class="acct-hint">验证码已发出，收不到的话看一眼垃圾邮件。</p>
        </div>

        <label class="acct-field">
          <span class="acct-label">新密码</span>
          <input
            v-model="forgotForm.password"
            class="acct-input"
            type="password"
            autocomplete="new-password"
            :placeholder="`至少 ${PASSWORD_MIN} 位`"
          />
          <span v-if="forgotForm.password" class="acct-strength" :data-level="forgotStrengthLevel">
            <i></i><i></i><i></i>
            <em>{{ forgotStrengthText }}</em>
          </span>
        </label>

        <label class="acct-field">
          <span class="acct-label">确认新密码</span>
          <input
            v-model="forgotForm.confirm"
            class="acct-input"
            type="password"
            autocomplete="new-password"
            placeholder="再输一遍"
          />
        </label>

        <p v-if="forgotForm.error" class="acct-error">{{ forgotForm.error }}</p>
        <p v-else-if="forgotForm.done" class="acct-ok">密码重置成功，正在返回登录…</p>

        <div class="acct-confirm-row">
          <UiButton variant="ghost" type="button" @click="go('login')">返回登录</UiButton>
          <UiButton type="submit" :disabled="forgotForm.busy">
            {{ forgotForm.busy ? '重置中…' : '重置密码' }}
          </UiButton>
        </div>
      </form>

      <!-- ---------- 注册 ---------- -->
      <!--
        字段顺序是用户明确要求的：昵称 → 头像 → 密码 → 确认密码 → 邮箱 → 邮箱验证码。
        把邮箱放在靠后，是因为"发验证码"会插入一块人机验证，
        若它在中间会把后面的字段挤下去、视线来回跳。
      -->
      <form v-else class="acct-form" novalidate @submit.prevent="doRegister">
        <label class="acct-field">
          <span class="acct-label">昵称</span>
          <input
            v-model="regForm.nick"
            class="acct-input"
            type="text"
            :maxlength="NICK_MAX"
            autocomplete="nickname"
            placeholder="评论时会显示这个名字"
          />
          <span class="acct-hint">{{ regForm.nick.trim().length }}/{{ NICK_MAX }} · 注册后也能改</span>
          <p v-if="regErrors.nick" class="acct-error acct-error--tight">{{ regErrors.nick }}</p>
        </label>

        <!--
          头像：主表单里只占一行，点开才是选择器（`AvatarPickerDialog`）。
          原先整块网格铺在这里，即使全收起也把后面的字段挤到要滚动 ——
          注册页变成"先看一堆头像"，用户反馈太占地方。
        -->
        <div class="acct-field">
          <span class="acct-label">头像</span>
          <button type="button" class="acct-avatar-row" @click="avatarPickerOpen = true">
            <img v-if="selectedPath" :src="getImageUrl(selectedPath)" alt="" class="acct-avatar-thumb" />
            <span v-else class="acct-avatar-thumb acct-avatar-thumb--empty" aria-hidden="true">
              {{ regForm.nick.trim().slice(0, 1) || '?' }}
            </span>
            <span class="acct-avatar-row-title">{{ selectedName || '希尔（女主）' }}</span>
            <span class="acct-row-arrow">›</span>
          </button>
        </div>

        <label class="acct-field">
          <span class="acct-label">密码</span>
          <input
            v-model="regForm.password"
            class="acct-input"
            type="password"
            autocomplete="new-password"
            :placeholder="`至少 ${PASSWORD_MIN} 位`"
          />
          <span v-if="regForm.password" class="acct-strength" :data-level="strengthLevel">
            <i></i><i></i><i></i>
            <em>{{ strengthText }}</em>
          </span>
          <p v-if="regErrors.password" class="acct-error acct-error--tight">{{ regErrors.password }}</p>
        </label>

        <label class="acct-field">
          <span class="acct-label">确认密码</span>
          <input
            v-model="regForm.confirm"
            class="acct-input"
            type="password"
            autocomplete="new-password"
            placeholder="再输一遍"
          />
          <p v-if="regErrors.confirm || (regForm.confirm && regForm.confirm !== regForm.password)" class="acct-error acct-error--tight">
            {{ regErrors.confirm || '两次输入的密码不一样' }}
          </p>
        </label>

        <label class="acct-field">
          <span class="acct-label">邮箱</span>
          <input
            v-model="regForm.email"
            class="acct-input"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="用来收验证码，也是以后的登录账号"
          />
          <p v-if="regErrors.email" class="acct-error acct-error--tight">{{ regErrors.email }}</p>
        </label>

        <!-- 邮箱验证码；人机验证在弹窗里（见文件末尾的 CaptchaDialog） -->
        <div class="acct-field">
          <span class="acct-label">邮箱验证码</span>
          <div class="acct-code-row">
            <input
              v-model="regForm.code"
              class="acct-input acct-input--code"
              type="text"
              inputmode="numeric"
              :maxlength="CODE_DIGITS"
              autocomplete="one-time-code"
              :placeholder="`${CODE_DIGITS} 位数字`"
            />
            <UiButton
              variant="secondary"
              :disabled="!regCode.canSend.value || regForm.busy"
              @click="startRegisterCode"
            >
              {{ regCode.buttonText.value }}
            </UiButton>
          </div>

          <p v-if="regErrors.code || regCode.error.value" class="acct-error acct-error--tight">{{ regErrors.code || regCode.error.value }}</p>
          <p v-else-if="regCode.sent.value" class="acct-hint">
            验证码已发出。收不到的话看一眼垃圾邮件。
          </p>
        </div>

        <p v-if="regForm.error" class="acct-error">{{ regForm.error }}</p>

        <UiButton type="submit" block :disabled="regForm.busy">
          {{ regForm.busy ? '注册中…' : '注册并登录' }}
        </UiButton>

        <label class="acct-agree">
          <input v-model="regForm.agreed" type="checkbox" />
          <span>我已阅读并同意<a href="#/privacy" target="_blank" rel="noopener">隐私协议</a></span>
        </label>
      </form>
    </template>

    <!-- ==================== 已登录 ==================== -->
    <template v-else>
      <!-- ---------- 个人中心 ---------- -->
      <div v-if="view === 'center'" class="acct-center">
        <div class="acct-id-card">
          <img v-if="myAvatarPath" :src="getImageUrl(myAvatarPath)" alt="" class="acct-avatar" />
          <div v-else class="acct-avatar acct-avatar--empty">{{ (currentUser?.nick || '?').slice(0, 1) }}</div>

          <div class="acct-id-text">
            <!-- 用户要求：编号显示在名称**上面** -->
            <div class="acct-id-meta">
              <span class="acct-no">编号 {{ publicNo }}</span>
              <span v-if="currentUser?.role === 2" class="acct-role-tag acct-role-tag--super">超级管理员</span>
              <span v-else-if="currentUser?.role === 1" class="acct-role-tag acct-role-tag--admin">管理员</span>
            </div>
            <span class="acct-nick">{{ currentUser?.nick }}</span>
            <span class="acct-mail">{{ currentUser?.email }}</span>
          </div>
        </div>

        <div class="acct-rows">
          <!--
            「谁回复了我」放最上面并带未读红点：这是唯一一个"别人主动找我"的入口，
            有未读时应该第一眼看到。
          -->
          <button type="button" class="acct-row" @click="openMyReplies">
            <span>
              谁回复了我
              <span v-if="repliesUnread > 0" class="acct-badge">{{ repliesUnread > 99 ? '99+' : repliesUnread }}</span>
            </span>
            <span class="acct-row-arrow">›</span>
          </button>
          <button type="button" class="acct-row" @click="openMyComments">
            <span>
              我的评论
              <!--
                「被处理后未读」红点：作者的评论被隐藏/打回待审后，他原本无从得知。
                点进来即视为已读（列表里已有「待审核 / 已隐藏」标签说明状况）。
              -->
              <span v-if="moderatedUnread > 0" class="acct-badge">{{ moderatedUnread > 99 ? '99+' : moderatedUnread }}</span>
            </span>
            <span class="acct-row-arrow">›</span>
          </button>
          <button type="button" class="acct-row" @click="go('password')">
            <span>修改密码</span><span class="acct-row-arrow">›</span>
          </button>
          <button type="button" class="acct-row" @click="go('email')">
            <span>换绑邮箱</span><span class="acct-row-arrow">›</span>
          </button>
          <button type="button" class="acct-row" @click="go('profile')">
            <span>修改昵称与头像</span><span class="acct-row-arrow">›</span>
          </button>
        </div>

        <p class="acct-hint acct-hint--quiet acct-hint--center">
          注册于 {{ formatDate(currentUser?.createdAt) }}<template v-if="currentUser?.lastLoginAt"> · 上次登录 {{ formatDate(currentUser.lastLoginAt) }}</template>
        </p>

        <div class="acct-actions">
          <UiButton variant="secondary" block @click="doSignOut">退出登录</UiButton>
          <button type="button" class="acct-btn-delete" @click="askDelete">注销账号</button>
        </div>

        <div v-if="pendingDelete" class="acct-confirm">
          <p class="acct-error">
            注销后这个账号不能再登录，你发过的评论会显示为「账号已注销」，而且**这个邮箱不能再注册**。
          </p>
          <div class="acct-confirm-row">
            <UiButton variant="ghost" @click="pendingDelete = false">再想想</UiButton>
            <UiButton variant="danger" :disabled="deleting" @click="doDelete">
              {{ deleting ? '注销中…' : '确认注销' }}
            </UiButton>
          </div>
        </div>
      </div>

      <!-- ---------- 谁回复了我 ---------- -->
      <!--
        与「我的评论」的区别：那边是"我发过什么"，这边是"**别人对我说了什么**"。
        数据来源是 `comments.parent_id` 指向我的评论、且仍公开（status=1）的那些。
        父评论已被删除/隐藏的回复**不会出现**（服务端用 JOIN 保证）——
        否则会给出一个点不进去的条目。
      -->
      <div v-else-if="view === 'replies'" class="acct-mine">
        <!--
          ⚠️ 返回按钮**必须在**：这两个列表页比个人中心"深"一层，
          没有它就只剩"关掉整个弹窗"一条路 —— 用户想去改个资料得重新开一遍。
          （这个死角是 Playwright 测试撞出来的：它点完「谁回复了我」再想点
          「我的评论」，发现个人中心那一列 `.acct-row` 已经不在页面上了。）
          放在**顶部**而不是底部：列表可能很长，底部要滚到底才够得着。
        -->
        <div class="acct-back-bar">
          <button type="button" class="acct-back" @click="go('center')">‹ 返回个人中心</button>
        </div>

        <p v-if="replyState === 'loading' && !replyList.length" class="acct-hint">正在加载…</p>

        <template v-else-if="!replyList.length">
          <p class="acct-hint">还没有人回复你。</p>
          <p class="acct-hint acct-hint--quiet">
            别人在你发的评论下面点「回复」，就会出现在这里。
          </p>
        </template>

        <template v-else>
          <ul class="acct-mine-list">
            <li v-for="r in replyList" :key="r.id" class="acct-mine-item">
              <div class="acct-mine-head">
                <img v-if="replyAvatar(r)" :src="replyAvatar(r)" alt="" class="acct-reply-avatar" />
                <strong class="acct-reply-nick">{{ r.nick }}</strong>
                <span class="acct-mine-page">在{{ r.pageLabel || pageNameOf(r.pageKey) }}</span>
                <time class="acct-mine-time">{{ formatDate(r.createdAt) }}</time>
              </div>

              <p class="acct-mine-body"><EmoticonText :text="r.body" /></p>

              <div class="acct-mine-actions">
                <button type="button" class="acct-mine-link" @click="gotoComment(r)">
                  去看看
                </button>
              </div>
            </li>
          </ul>

          <p v-if="replyError" class="acct-error">{{ replyError }}</p>

          <UiButton
            v-if="replyCursor"
            variant="ghost"
            block
            :disabled="replyState === 'loading'"
            @click="loadReplies({ append: true })"
          >
            {{ replyState === 'loading' ? '加载中…' : '加载更多' }}
          </UiButton>
        </template>
      </div>

      <!-- ---------- 我的评论 ---------- -->
      <!--
        这一页能成立，靠的是 M4 把评论挂到了 `user_id` 上：
        归属在服务端，「换设备也看得到、也删得掉」，不像以前靠本机令牌。
      -->
      <div v-else-if="view === 'comments'" class="acct-mine">
        <!-- 同「谁回复了我」：没有它就回不到个人中心（见那边的说明） -->
        <div class="acct-back-bar">
          <button type="button" class="acct-back" @click="go('center')">‹ 返回个人中心</button>
        </div>

        <p v-if="mineState === 'loading' && !mineList.length" class="acct-hint">正在加载…</p>

        <template v-else-if="!mineList.length">
          <p class="acct-hint">你还没有发过评论。</p>
          <p class="acct-hint acct-hint--quiet">
            去「站内讨论区」或在任意物品/角色页面下方都能发表。
          </p>
        </template>

        <template v-else>
          <ul class="acct-mine-list">
            <li v-for="c in mineList" :key="c.id" class="acct-mine-item">
              <div class="acct-mine-head">
                <span class="acct-mine-page">{{ c.pageLabel || pageNameOf(c.pageKey) }}</span>
                <span v-if="c.parentId" class="acct-mine-tag">回复</span>
                <!-- 状态标签：待审/已隐藏别人看不到，作者自己必须看得见，否则会以为"发出去了但没了" -->
                <span v-if="c.status === 0" class="acct-mine-tag acct-mine-tag--pending">待审核</span>
                <span v-else-if="c.status === 2" class="acct-mine-tag acct-mine-tag--hidden">已隐藏</span>
                <time class="acct-mine-time">{{ formatDate(c.createdAt) }}</time>
              </div>

              <p class="acct-mine-body"><EmoticonText :text="c.body" /></p>

              <div class="acct-mine-actions">
                <button
                  v-if="routeForPage(c.pageKey)"
                  type="button"
                  class="acct-mine-link"
                  @click="gotoPage(c.pageKey, c.id)"
                >
                  去看看
                </button>
                <div class="acct-del-box">
                  <template v-if="deletingConfirmId === c.id">
                    <span class="acct-del-prompt">确定删除？</span>
                    <button
                      type="button"
                      class="acct-del-btn is-yes"
                      :disabled="mineDeletingId === c.id"
                      @click="removeMine(c)"
                    >
                      {{ mineDeletingId === c.id ? '…' : '确认' }}
                    </button>
                    <button
                      type="button"
                      class="acct-del-btn is-no"
                      @click="deletingConfirmId = null"
                    >
                      取消
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    class="acct-mine-del"
                    :disabled="mineDeletingId === c.id"
                    @click="deletingConfirmId = c.id"
                  >
                    删除
                  </button>
                </div>
              </div>
            </li>
          </ul>

          <p v-if="mineError" class="acct-error">{{ mineError }}</p>

          <UiButton
            v-if="mineCursor"
            variant="ghost"
            block
            :disabled="mineState === 'loading'"
            @click="loadMine({ append: true })"
          >
            {{ mineState === 'loading' ? '加载中…' : '加载更多' }}
          </UiButton>
        </template>
      </div>

      <!-- ---------- 修改昵称与头像 ---------- -->
      <form v-else-if="view === 'profile'" class="acct-form" novalidate @submit.prevent="doUpdateProfile">
        <label class="acct-field">
          <span class="acct-label">昵称</span>
          <input v-model="profileForm.nick" class="acct-input" type="text" :maxlength="NICK_MAX" />
        </label>

        <div class="acct-field">
          <span class="acct-label">头像</span>
          <button type="button" class="acct-avatar-row" @click="avatarPickerOpen = true">
            <img v-if="selectedPath" :src="getImageUrl(selectedPath)" alt="" class="acct-avatar-thumb" />
            <span v-else class="acct-avatar-thumb acct-avatar-thumb--empty" aria-hidden="true">
              {{ profileForm.nick.trim().slice(0, 1) || '?' }}
            </span>
            <span class="acct-avatar-row-title">{{ selectedName || '希尔（女主）' }}</span>
            <span class="acct-row-arrow">›</span>
          </button>
        </div>

        <p v-if="profileForm.error" class="acct-error">{{ profileForm.error }}</p>
        <div class="acct-confirm-row">
          <UiButton variant="ghost" @click="go('center')">返回</UiButton>
          <UiButton type="submit" :disabled="profileForm.busy">
            {{ profileForm.busy ? '保存中…' : '保存' }}
          </UiButton>
        </div>
      </form>

      <!-- ---------- 修改密码（只用邮箱验证码授权，不校验旧密码） ---------- -->
      <form v-else-if="view === 'password'" class="acct-form" novalidate @submit.prevent="doChangePassword">
        <p class="acct-hint">
          改密码需要邮箱验证码。我们会发到你注册时用的
          <strong>{{ currentUser?.email }}</strong>。
        </p>

        <div class="acct-field">
          <span class="acct-label">邮箱验证码</span>
          <div class="acct-code-row">
            <input
              v-model="pwdForm.code"
              class="acct-input acct-input--code"
              type="text"
              inputmode="numeric"
              :maxlength="CODE_DIGITS"
              autocomplete="one-time-code"
              :placeholder="`${CODE_DIGITS} 位数字`"
            />
            <UiButton variant="secondary" :disabled="!pwdCode.canSend.value || pwdForm.busy" @click="pwdCode.request">
              {{ pwdCode.buttonText.value }}
            </UiButton>
          </div>
          <p v-if="pwdCode.error.value" class="acct-error acct-error--tight">{{ pwdCode.error.value }}</p>
          <p v-else-if="pwdCode.sent.value" class="acct-hint">验证码已发出，收不到的话看一眼垃圾邮件。</p>
        </div>

        <label class="acct-field">
          <span class="acct-label">新密码</span>
          <input
            v-model="pwdForm.password"
            class="acct-input"
            type="password"
            autocomplete="new-password"
            :placeholder="`至少 ${PASSWORD_MIN} 位`"
          />
        </label>
        <label class="acct-field">
          <span class="acct-label">确认新密码</span>
          <input v-model="pwdForm.confirm" class="acct-input" type="password" autocomplete="new-password" />
        </label>

        <p class="acct-hint acct-hint--quiet">改完之后，其它设备上的登录会失效，只有这一台继续有效。</p>
        <p v-if="pwdForm.error" class="acct-error">{{ pwdForm.error }}</p>
        <p v-else-if="pwdForm.done" class="acct-ok">密码已修改</p>

        <div class="acct-confirm-row">
          <UiButton variant="ghost" @click="go('center')">返回</UiButton>
          <UiButton type="submit" :disabled="pwdForm.busy">
            {{ pwdForm.busy ? '提交中…' : '确认修改' }}
          </UiButton>
        </div>
      </form>

      <!-- ---------- 换绑邮箱（旧 + 新双验证） ---------- -->
      <form v-else-if="view === 'email'" class="acct-form" novalidate @submit.prevent="doChangeEmail">
        <label class="acct-field">
          <span class="acct-label">新邮箱</span>
          <input
            v-model="mailForm.newEmail"
            class="acct-input"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="要换成哪个邮箱"
          />
        </label>

        <div class="acct-field">
          <span class="acct-label">新邮箱验证码</span>
          <div class="acct-code-row">
            <input
              v-model="mailForm.newCode"
              class="acct-input acct-input--code"
              type="text"
              inputmode="numeric"
              :maxlength="CODE_DIGITS"
              autocomplete="one-time-code"
              :placeholder="`${CODE_DIGITS} 位数字`"
            />
            <UiButton variant="secondary" :disabled="!newMailCode.canSend.value || mailForm.busy" @click="newMailCode.request">
              {{ newMailCode.buttonText.value }}
            </UiButton>
          </div>
          <p v-if="newMailCode.error.value" class="acct-error acct-error--tight">{{ newMailCode.error.value }}</p>
        </div>

        <div class="acct-field">
          <span class="acct-label">当前邮箱验证码</span>
          <p class="acct-hint">发到 <strong>{{ currentUser?.email }}</strong>，用来确认是你本人。</p>
          <div class="acct-code-row">
            <input
              v-model="mailForm.oldCode"
              class="acct-input acct-input--code"
              type="text"
              inputmode="numeric"
              :maxlength="CODE_DIGITS"
              autocomplete="one-time-code"
              :placeholder="`${CODE_DIGITS} 位数字`"
            />
            <UiButton variant="secondary" :disabled="!oldMailCode.canSend.value || mailForm.busy" @click="oldMailCode.request">
              {{ oldMailCode.buttonText.value }}
            </UiButton>
          </div>
          <p v-if="oldMailCode.error.value" class="acct-error acct-error--tight">{{ oldMailCode.error.value }}</p>
        </div>

        <p class="acct-hint acct-hint--quiet">两个验证码都要填对才会生效。</p>
        <p v-if="mailForm.error" class="acct-error">{{ mailForm.error }}</p>
        <p v-else-if="mailForm.done" class="acct-ok">邮箱已换绑为 {{ currentUser?.email }}</p>

        <div class="acct-confirm-row">
          <UiButton variant="ghost" @click="go('center')">返回</UiButton>
          <UiButton type="submit" :disabled="mailForm.busy">
            {{ mailForm.busy ? '提交中…' : '确认换绑' }}
          </UiButton>
        </div>
      </form>
    </template>

    <!--
      ==================== 人机验证弹窗 × 4 ====================
      四个发码入口**各挂各的**，而不是"按当前视图挑一个"。

      🔴 踩过的坑：一开始写成一个 `<CaptchaDialog :ref="(el) => (activeCode.captchaRef.value = el)">`，
      而 `activeCode` 是个可能返回 null 的 computed。**`:ref` 的函数形式在组件
      卸载时也会被调用**（传 null）—— 那一刻 computed 已经变成 null，
      于是 `null.captchaRef` 抛异常，**中断整轮响应式刷新**，
      连"登录成功 → 切到个人中心"的 watch 都没跑到。表现是：
      注册明明成功了，弹窗却空白（`isLoggedIn` 为 true、`view` 还停在 register，
      所有 `v-if` 分支都不匹配）。一次 ref 回调抛错打崩了一条完全无关的链路。

      各挂各的之后，每个 ref 指向固定那个组件，不存在"取值时机"的问题。
      隐藏时 `UiModal` 的 `v-if` 不渲染内容，四个实例的开销可以忽略。
    -->

    <CaptchaDialog
      :ref="(el) => (regCode.captchaRef.value = el)"
      :visible="regCode.captchaVisible.value"
      @update:visible="(v) => !v && regCode.cancel()"
      @complete="regCode.submit"
    />
    <CaptchaDialog
      :ref="(el) => (pwdCode.captchaRef.value = el)"
      :visible="pwdCode.captchaVisible.value"
      @update:visible="(v) => !v && pwdCode.cancel()"
      @complete="pwdCode.submit"
    />
    <CaptchaDialog
      :ref="(el) => (newMailCode.captchaRef.value = el)"
      :visible="newMailCode.captchaVisible.value"
      @update:visible="(v) => !v && newMailCode.cancel()"
      @complete="newMailCode.submit"
    />
    <CaptchaDialog
      :ref="(el) => (oldMailCode.captchaRef.value = el)"
      :visible="oldMailCode.captchaVisible.value"
      @update:visible="(v) => !v && oldMailCode.cancel()"
      @complete="oldMailCode.submit"
    />
    <CaptchaDialog
      :ref="(el) => (forgotCode.captchaRef.value = el)"
      :visible="forgotCode.captchaVisible.value"
      @update:visible="(v) => !v && forgotCode.cancel()"
      @complete="forgotCode.submit"
    />

    <!-- 头像选择：注册与「修改资料」共用，写回当前视图对应的那份表单 -->
    <AvatarPickerDialog
      v-model="activeAvatarId"
      v-model:visible="avatarPickerOpen"
      :nick="activeNick"
    />
  </UiModal>
</template>

<script setup>
/**
 * 账号弹窗。
 *
 * ## 与旧版的区别（本机身份 → 真账号）
 *
 * 旧版是**本机身份**：昵称与头像只存在这台设备的 localStorage，不注册、不登录、
 * 防不了冒充。现在换成了真账号体系（邮箱 + 验证码 + 客户端 KDF 的密码），
 * 原本身份模块里的**昵称/头像存储部分已退役**，只留下头像清单那半边
 * （`avatarCatalog` / `avatarPath` / `avatarEntry`）。
 *
 * ## 密码在这一层是"透明"的
 *
 * 这里只把用户输入的密码交给 `authSession`，由它做完 PBKDF2 之后**立刻丢弃**。
 * 组件自身不持久化、不记录、不上报密码。唯一的例外是"确认密码"的本地比对。
 */

import { computed, reactive, ref, watch } from 'vue'

import AvatarPickerDialog from './AvatarPickerDialog.vue'
import CaptchaDialog from './CaptchaDialog.vue'
import { UiButton, UiModal, UiSection } from './ui/index.js'
import {
  CODE_DIGITS,
  DEFAULT_AVATAR,
  NICK_MAX,
  NICK_MIN,
  PASSWORD_MIN
} from '../config/auth.js'
import { checkPasswordStrength, passwordStrengthLevel } from '../config/weakPasswords.js'
import { getImageUrl } from '../utils/env.js'
// 头像网格整体搬进了 AvatarPickerDialog；这里只留"查清单拿路径"（预览行要用）
// 与"预先加载清单"（打开弹窗时拉一次，预览行才能显示头像名字）
import { avatarEntry, avatarPath, loadAvatarCatalog } from '../utils/avatarCatalog.js'
import {
  changeEmailWithCodes,
  changePasswordWithCode,
  currentUser,
  deleteMyAccount,
  isLoggedIn,
  loadMyComments,
  loadMyReplies,
  loginWithPassword,
  markMyRepliesRead,
  markModerationReadSafe,
  prefetchPasswordSalt,
  publicNo,
  registerAccount,
  resetPasswordWithCode,
  sessionState,
  signOut,
  updateProfile
} from '../utils/authSession.js'
import { deleteOwnComment } from '../utils/commentApi.js'
import {
  commentDeletedAt,
  commentDeletedId,
  commentPostedAt,
  lastPostedComment,
  notifyCommentDeleted
} from '../utils/commentEvents.js'
import EmoticonText from './EmoticonText.vue'
import { useCodeSender, validateEmailInput } from '../utils/useCodeSender.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

/** 'login' | 'register' | 'forgot' | 'center' | 'profile' | 'password' | 'email' | 'comments' | 'replies' */
const view = ref('login')

const modalTitle = computed(() => {
  if (!isLoggedIn.value) {
    if (view.value === 'forgot') return '找回密码'
    return '账号'
  }
  if (view.value === 'password') return '修改密码'
  if (view.value === 'email') return '换绑邮箱'
  if (view.value === 'profile') return '修改资料'
  if (view.value === 'comments') return '我的评论'
  if (view.value === 'replies') return '谁回复了我'
  return '个人中心'
})

const modalMaxWidth = computed(() => {
  if (['comments', 'replies'].includes(view.value)) return '560px'
  return '420px'
})

// ---------- 表单状态 ----------

const loginForm = reactive({ email: '', password: '', busy: false, error: '' })
const regForm = reactive({
  nick: '',
  /*
   * 头像**预选女主「希尔」**（`DEFAULT_AVATAR`，与服务端注册时的默认值是同一个）。
   *
   * 之前是空串、显示「未选择头像」，用户反馈"默认就该是女主的" ——
   * 既然绝大多数人不会去改，让空态去引导他做一次无意义的选择没有意义。
   * 想换的人在下面那张弹窗里换，想彻底不要头像的可以点「不设置」。
   */
  avatar: DEFAULT_AVATAR,
  password: '',
  confirm: '',
  email: '',
  code: '',
  agreed: false,
  busy: false,
  error: ''
})

const regErrors = reactive({
  nick: '',
  password: '',
  confirm: '',
  email: '',
  code: ''
})

function clearRegErrors() {
  regErrors.nick = ''
  regErrors.password = ''
  regErrors.confirm = ''
  regErrors.email = ''
  regErrors.code = ''
}

watch(() => regForm.nick, () => { regErrors.nick = '' })
watch(() => regForm.password, () => { regErrors.password = '' })
watch(() => regForm.confirm, () => { regErrors.confirm = '' })
watch(() => regForm.email, () => { regErrors.email = '' })
watch(() => regForm.code, () => { regErrors.code = '' })

const profileForm = reactive({ nick: '', avatar: DEFAULT_AVATAR, busy: false, error: '' })
const pwdForm = reactive({ code: '', password: '', confirm: '', busy: false, error: '', done: false })
const mailForm = reactive({ newEmail: '', newCode: '', oldCode: '', busy: false, error: '', done: false })
const forgotForm = reactive({
  email: '',
  code: '',
  password: '',
  confirm: '',
  busy: false,
  error: '',
  done: false
})

const pendingDelete = ref(false)
const deleting = ref(false)

// ---------- 发码（共用同一套逻辑） ----------

const regCode = useCodeSender({ purpose: 'register', getEmail: () => regForm.email })
const pwdCode = useCodeSender({ purpose: 'password', getEmail: () => currentUser.value?.email || '' })
const newMailCode = useCodeSender({ purpose: 'email_change', getEmail: () => mailForm.newEmail })
const oldMailCode = useCodeSender({ purpose: 'email_change', getEmail: () => currentUser.value?.email || '' })
const forgotCode = useCodeSender({ purpose: 'password', getEmail: () => forgotForm.email })

const forgotStrengthLevel = computed(() => passwordStrengthLevel(forgotForm.password))
const forgotStrengthText = computed(() => ['太弱', '偏弱', '不错', '很强'][forgotStrengthLevel.value] || '')

function openForgotPassword() {
  if (loginForm.email) {
    forgotForm.email = loginForm.email.trim()
  }
  forgotForm.code = ''
  forgotForm.password = ''
  forgotForm.confirm = ''
  forgotForm.error = ''
  forgotForm.done = false
  go('forgot')
}

function startForgotCode() {
  forgotForm.error = ''
  const emailErr = validateEmailInput(forgotForm.email)
  if (emailErr) {
    forgotForm.error = emailErr
    return
  }
  forgotCode.request()
}

/** 注册的"发送验证码"：先把邮箱与其它必填项问题挡在前面，再展开人机验证 */
function startRegisterCode() {
  clearRegErrors()
  regForm.error = ''
  const emailErr = validateEmailInput(regForm.email)
  if (emailErr) {
    regErrors.email = emailErr
    return
  }
  const nick = regForm.nick.trim()
  if (nick.length < NICK_MIN) {
    regErrors.nick = `昵称至少 ${NICK_MIN} 个字符`
    return
  }
  const code = checkPasswordStrength(regForm.password, { email: regForm.email, nick })
  if (!code.ok) {
    regErrors.password = code.reason
    return
  }
  if (regForm.password !== regForm.confirm) {
    regErrors.confirm = '两次输入的密码不一样'
    return
  }
  regCode.request()
}

// ---------- 头像选择 ----------

/*
 * 头像清单与网格都在 `AvatarPickerDialog` 里；这里只保留
 * "当前这份表单选的是哪个" 这一个概念，供预览行与弹窗双向绑定。
 *
 * ⚠️ **注册表单与"修改资料"表单的头像是两份独立状态**（`regForm.avatar` /
 * `profileForm.avatar`）—— 注册到一半切去登录再切回来，不该把资料页的选择带过去。
 * 所以这里用 `activeAvatar` 做"按当前视图转发"，弹窗的 `v-model` 读它、写回它。
 */
const avatarPickerOpen = ref(false)

/** 当前视图对应的头像 ID（注册视图用注册表单，其余用资料表单） */
const activeAvatar = computed(() =>
  isLoggedIn.value && view.value !== 'register' ? profileForm.avatar : regForm.avatar
)

/** 弹窗写回：写进当前视图对应的那份表单 */
const activeAvatarId = computed({
  get: () => activeAvatar.value,
  set: (id) => {
    if (isLoggedIn.value && view.value !== 'register') profileForm.avatar = id
    else regForm.avatar = id
  }
})

/** 弹窗里"没选头像"时用来做首字占位 */
const activeNick = computed(() =>
  isLoggedIn.value && view.value !== 'register' ? profileForm.nick : regForm.nick
)

const selectedPath = computed(() => avatarPath(activeAvatar.value || DEFAULT_AVATAR))
const selectedName = computed(() => avatarEntry(activeAvatar.value || DEFAULT_AVATAR)?.name || '希尔（女主）')
const myAvatarPath = computed(() => avatarPath(currentUser.value?.avatar || DEFAULT_AVATAR))

const strengthLevel = computed(() => passwordStrengthLevel(regForm.password))
const strengthText = computed(() => ['太弱', '偏弱', '不错', '很强'][strengthLevel.value] || '')

// ---------- 切换视图 ----------

function go(next) {
  view.value = next
  deletingConfirmId.value = null
  if (next === 'profile') {
    profileForm.nick = currentUser.value?.nick || ''
    profileForm.avatar = currentUser.value?.avatar || DEFAULT_AVATAR
  }
  loginForm.error = ''
  regForm.error = ''
  clearRegErrors()
  pwdForm.error = ''
  pwdForm.done = false
  mailForm.error = ''
  mailForm.done = false
  profileForm.error = ''
  pendingDelete.value = false
  regCode.reset()
  pwdCode.reset()
  newMailCode.reset()
  oldMailCode.reset()
}

// ---------- 我的评论 ----------

/*
 * 归属由服务端按 `user_id` 判定，所以这一页**天生跨设备**：
 * 换台手机登录同一账号，看到的是同一份列表，也删得掉。
 * （本机身份时代做不到 —— 那时靠每台设备各自存的自删令牌。）
 */
const mineList = ref([])
const mineState = ref('idle') // 'idle' | 'loading' | 'ready'
const mineError = ref('')
const mineCursor = ref(null)
const mineDeletingId = ref(null)
const deletingConfirmId = ref(null)

/**
 * 「评论被处理」未读数（个人中心那行上的红点）。
 *
 * 服务端用 `users.moderation_read_at` 当基准算出来 —— 与「谁回复了我」
 * **同一套机制**，不建通知表。点进「我的评论」即视为已读。
 */
const moderatedUnread = ref(0)

/** 页面归属键 → 可跳转的路由。映射不到就返回空串（界面据此不显示「去看看」） */
const PAGE_ROUTES = {
  'site:general': '/discussions',
  item: '/items',
  hero: '/heroes',
  pet: '/pets',
  monster: '/monsters',
  furniture: '/furniture',
  task: '/tasks',
  event: '/events',
  battle: '/dungeons',
  stage: '/chapters'
}

function routeForPage(pageKey) {
  return PAGE_ROUTES[pageKey] || PAGE_ROUTES[String(pageKey || '').split(':')[0]] || ''
}

/** `explore:12` 这种映射不到路由的，至少给个人话名字（服务端没存 pageLabel 时的兜底） */
const PAGE_NAMES = {
  item: '物品', hero: '角色', pet: '宠物', monster: '魔物', furniture: '家具',
  task: '任务', event: '活动', explore: '探索', battle: '副本', stage: '关卡'
}

function pageNameOf(pageKey) {
  const key = String(pageKey || '')
  if (key === 'site:general') return '站内讨论区'
  return PAGE_NAMES[key.split(':')[0]] || key || '评论'
}

async function openMyComments() {
  go('comments')
  // 每次进入「我的评论」都重置游标并重新拉取第一页，确保刚发/刚删的最新状态实时呈现
  mineCursor.value = null
  await loadMine({ append: false })
  /*
   * 进页面即标已读 —— 与「谁回复了我」同一套时机：
   * 由**用户主动点进来**这一刻算起，不在"打开账号弹窗"就标
   * （那会让用户还没看就把红点清了）。
   */
  if (moderatedUnread.value > 0) {
    moderatedUnread.value = 0
    try {
      await markModerationReadSafe()
    } catch {
      // 标记失败下次进来还会显示红点，比"丢了未读"好
    }
  }
}

/**
 * 只取「评论被处理」的未读数（个人中心那行的红点）。
 *
 * `limit=1` 是有意的：只需要那个数字，没必要把一整页评论拉到浏览器里。
 * 与 `loadUnreadReplies` 完全对称。
 */
async function loadModeratedUnread() {
  if (!isLoggedIn.value) return
  try {
    const data = await loadMyComments({ limit: 1 })
    moderatedUnread.value = data?.moderatedUnread || 0
  } catch {
    // 拿不到就不显示红点，不影响任何主路径
    moderatedUnread.value = 0
  }
}

// 广播联动：在讨论区或其他页面发了新消息时，即使不刷新页面，「我的评论」列表也立刻在头部增量补齐
watch(commentPostedAt, () => {
  const c = lastPostedComment.value
  if (!c || !c.id || !isLoggedIn.value) return
  if (mineList.value.some((x) => x.id === c.id)) return
  const item = {
    id: c.id,
    pageKey: c.pageKey,
    pageLabel: c.pageLabel,
    body: c.body,
    createdAt: c.createdAt || Math.floor(Date.now() / 1000),
    status: c.status !== undefined ? c.status : 1,
    parentId: c.parentId || null
  }
  mineList.value = [item, ...mineList.value]
})

// 广播联动：在讨论区或其他页面删了某条评论时，「我的评论」列表同步移除
watch(commentDeletedAt, () => {
  if (commentDeletedId.value) {
    mineList.value = mineList.value.filter((x) => x.id !== commentDeletedId.value)
  }
})

async function loadMine({ append = false } = {}) {
  if (mineState.value === 'loading') return
  mineState.value = 'loading'
  mineError.value = ''
  try {
    const data = await loadMyComments({ cursor: append ? mineCursor.value : undefined })
    const page = Array.isArray(data?.comments) ? data.comments : []
    mineList.value = append ? [...mineList.value, ...page] : page
    mineCursor.value = data?.nextCursor ?? null
    // 首次加载顺带同步服务端给的未读数（可能别处已读过）
    if (!append && typeof data?.moderatedUnread === 'number') {
      moderatedUnread.value = data.moderatedUnread
    }
  } catch (err) {
    mineError.value = err?.message || '加载失败，请稍后重试'
  } finally {
    mineState.value = 'ready'
  }
}

/**
 * 删除自己的评论。
 *
 * 复用评论区那套（`commentApi.deleteOwnComment`）：服务端按 `user_id` 判归属，
 * 不是自己的会 403。这里**只从本地列表移除**，不重拉整页 ——
 * 用户可能已经「加载更多」翻了好几页，重拉会把它们丢掉。
 */
async function removeMine(c) {
  deletingConfirmId.value = null
  if (mineDeletingId.value) return
  mineDeletingId.value = c.id
  mineError.value = ''
  try {
    await deleteOwnComment(c.id)
    mineList.value = mineList.value.filter((x) => x.id !== c.id)
    notifyCommentDeleted(c.id)
  } catch (err) {
    // 404 等价于"已经不在了"：目标状态已达成
    if (err?.status === 404) {
      mineList.value = mineList.value.filter((x) => x.id !== c.id)
      notifyCommentDeleted(c.id)
    } else {
      mineError.value = err?.message || '删除失败，请稍后重试'
    }
  } finally {
    mineDeletingId.value = null
  }
}

/**
 * 跳到那条评论所在的页面（关掉弹窗，否则用户看不到自己跳去了哪）。
 *
 * 带上 `?c=<id>`：**讨论区**会读这个参数、滚到那一条并闪一下 ——
 * 这就是"可点击定位"。其它页面（物品/角色详情）没有这种锚点机制，
 * 只跳到列表页，所以那里不传（传了也没人认）。
 *
 * 用 hash 赋值而不是引入 vue-router：本组件在弹窗层，
 * 为一次跳转把 router 依赖拖进来不划算。
 */
function gotoPage(pageKey, commentId = null) {
  const route = routeForPage(pageKey)
  if (!route) return
  emit('update:modelValue', false)
  const anchor = route === '/discussions' && commentId ? `?c=${encodeURIComponent(commentId)}` : ''
  window.location.hash = '#' + route + anchor
  if (commentId) {
    window.dispatchEvent(new CustomEvent('locate-comment', { detail: { commentId: Number(commentId) } }))
  }
}

// ---------- 谁回复了我 ----------

/*
 * 数据来源：别人在我发的评论下面点的「回复」（`comments.parent_id` 指向我的评论）。
 * 未读数由服务端用 `users.replies_read_id` 当基准算出来 —— **不建已读表**，
 * 一条 SQL 同时给出列表与未读数（少一张表、少一次写入）。
 *
 * 🔴 基准是**评论 id**，不是时间戳（`comments.created_at` 只有秒级精度，
 * 同秒内标已读会吞掉通知）。标已读后前端只需把本地未读清零。
 */
const replyList = ref([])
const replyState = ref('idle')
const replyError = ref('')
const replyCursor = ref(null)
/** 个人中心那行上的红点数字 */
const repliesUnread = ref(0)

function replyAvatar(r) {
  const p = avatarPath(r.avatar || '')
  return p ? getImageUrl(p) : ''
}

/**
 * 只取未读数（顺带把列表第一页拿回来）。
 *
 * `limit=1` 是有意的：个人中心只需要那个数字，没必要为了显示一个红点
 * 把一整页回复都拉到浏览器里。列表等用户真进去了再拉。
 */
async function loadUnreadReplies() {
  if (!isLoggedIn.value) return
  try {
    const data = await loadMyReplies({ limit: 1 })
    repliesUnread.value = data?.unread || 0
  } catch {
    // 红点拿不到就不显示，不影响任何主路径
    repliesUnread.value = 0
  }
}

async function openMyReplies() {
  go('replies')
  if (!replyList.value.length && replyState.value !== 'loading') {
    await loadReplies()
  }
  /*
   * 进页面即标已读：由**用户主动点进来**这一刻算起。
   * 不在"打开账号弹窗"时就标 —— 那会让用户还没看就把红点清了。
   */
  if (repliesUnread.value > 0) {
    repliesUnread.value = 0
    try {
      await markMyRepliesRead()
    } catch {
      // 标记失败下次进来还会显示红点，比"丢了未读"好
    }
  }
}

async function loadReplies({ append = false } = {}) {
  if (replyState.value === 'loading') return
  replyState.value = 'loading'
  replyError.value = ''
  try {
    const data = await loadMyReplies({ cursor: append ? replyCursor.value : undefined })
    const page = Array.isArray(data?.replies) ? data.replies : []
    replyList.value = append ? [...replyList.value, ...page] : page
    replyCursor.value = data?.nextCursor ?? null
    // 首次加载顺带把服务端给的未读数同步过来（可能别处已读过）
    if (!append) repliesUnread.value = data?.unread ?? repliesUnread.value
  } catch (err) {
    replyError.value = err?.message || '加载失败，请稍后重试'
  } finally {
    replyState.value = 'ready'
  }
}

/** 跳到"他回复我的那一条"（不是跳到我的原评论 —— 用户想看的是别人说了什么） */
function gotoComment(r) {
  gotoPage(r.pageKey, r.id)
}

function resetAll() {
  loginForm.email = ''
  loginForm.password = ''
  loginForm.error = ''
  Object.assign(regForm, {
    nick: '', avatar: DEFAULT_AVATAR, password: '', confirm: '', email: '', code: '', agreed: false, busy: false, error: ''
  })
  Object.assign(pwdForm, { code: '', password: '', confirm: '', busy: false, error: '', done: false })
  Object.assign(mailForm, { newEmail: '', newCode: '', oldCode: '', busy: false, error: '', done: false })
  Object.assign(profileForm, { nick: '', avatar: DEFAULT_AVATAR, busy: false, error: '' })
  Object.assign(forgotForm, { email: '', code: '', password: '', confirm: '', busy: false, error: '', done: false })
  pendingDelete.value = false
  deleting.value = false
  deletingConfirmId.value = null
  regCode.reset()
  pwdCode.reset()
  newMailCode.reset()
  oldMailCode.reset()
  forgotCode.reset()
  // 退出登录/注销后，上一账号的评论与回复列表不能留给下一个账号看到
  mineList.value = []
  mineCursor.value = null
  mineState.value = 'idle'
  mineError.value = ''
  replyList.value = []
  replyCursor.value = null
  replyState.value = 'idle'
  replyError.value = ''
  repliesUnread.value = 0
}

// 打开时决定初始视图；登录状态一变就切到个人中心
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    if (isLoggedIn.value) {
      view.value = 'center'
      profileForm.nick = currentUser.value?.nick || ''
      profileForm.avatar = currentUser.value?.avatar || DEFAULT_AVATAR
    } else if (view.value !== 'register') {
      view.value = 'login'
    }
    loginForm.error = ''
    regForm.error = ''
    loadAvatarCatalog()
    /*
     * 顺手取一次未读数（`limit=1`，只为那个红点）。
     * **不 await**：它是一次网络请求，不该卡住弹窗打开。
     */
    loadUnreadReplies().catch(() => {})
    loadModeratedUnread().catch(() => {})
  },
  { immediate: true }
)

watch(isLoggedIn, (logged) => {
  if (logged) {
    view.value = 'center'
    // 进入个人中心时把资料表单初始化成当前值，省得再点一次"修改资料"才填
    profileForm.nick = currentUser.value?.nick || ''
    profileForm.avatar = currentUser.value?.avatar || DEFAULT_AVATAR
    // 刚登录也要把未读数取回来（否则红点要等下次开弹窗才出现）
    loadUnreadReplies().catch(() => {})
    loadModeratedUnread().catch(() => {})
  } else {
    view.value = 'login'
    resetAll()
  }
})

// ---------- 动作 ----------

function close() {
  emit('update:modelValue', false)
}

/**
 * 邮箱填完、光标离开时**预取密码盐**。
 *
 * 为什么值得：登录本来要两次串行往返（取盐 → 登录），而生产实测
 * **每次回源往返中位 1.3 秒**（`/api/*` 走不到边缘缓存），于是手机上
 * 点登录要等两三秒 —— 其中 PBKDF2 只占 0.1 秒。趁用户还在敲密码的这几秒
 * 把盐取回来，点登录时就只剩一次往返。
 *
 * 盐本来由公开接口返回、不是秘密，**缓存不降低安全性**。
 * 这里是"顺手做"：失败也不提示（它只是优化，真需要时会再取一次）。
 */
function onLoginEmailBlur() {
  const email = validateEmailInput(loginForm.email) ? '' : loginForm.email
  if (email) prefetchPasswordSalt(email)
}

async function doLogin() {
  loginForm.error = ''
  const emailErr = validateEmailInput(loginForm.email)
  if (emailErr) {
    loginForm.error = emailErr
    return
  }
  if (!loginForm.password) {
    loginForm.error = '请填写密码'
    return
  }
  loginForm.busy = true
  try {
    await loginWithPassword({ email: loginForm.email.trim(), password: loginForm.password })
    loginForm.password = ''
  } catch (err) {
    loginForm.error = err?.message || '登录失败，请稍后再试'
  } finally {
    loginForm.busy = false
  }
}

async function doResetPassword() {
  forgotForm.error = ''
  const emailErr = validateEmailInput(forgotForm.email)
  if (emailErr) {
    forgotForm.error = emailErr
    return
  }
  if (!forgotForm.code) {
    forgotForm.error = '请填写邮箱验证码'
    return
  }
  const pwd = checkPasswordStrength(forgotForm.password, { email: forgotForm.email })
  if (!pwd.ok) {
    forgotForm.error = pwd.reason
    return
  }
  if (forgotForm.password !== forgotForm.confirm) {
    forgotForm.error = '两次输入的密码不一样'
    return
  }

  forgotForm.busy = true
  try {
    await resetPasswordWithCode({
      email: forgotForm.email.trim(),
      code: forgotForm.code.trim(),
      newPassword: forgotForm.password
    })
    forgotForm.done = true
    setTimeout(() => {
      loginForm.email = forgotForm.email.trim()
      loginForm.password = ''
      loginForm.error = ''
      go('login')
      forgotForm.done = false
    }, 1200)
  } catch (err) {
    forgotForm.error = err?.message || '重置失败，请稍后重试'
  } finally {
    forgotForm.busy = false
  }
}

async function doRegister() {
  clearRegErrors()
  regForm.error = ''
  const nick = regForm.nick.trim()
  if (nick.length < NICK_MIN) {
    regErrors.nick = `昵称至少 ${NICK_MIN} 个字符`
    return
  }
  const pwd = checkPasswordStrength(regForm.password, { email: regForm.email, nick })
  if (!pwd.ok) {
    regErrors.password = pwd.reason
    return
  }
  if (regForm.password !== regForm.confirm) {
    regErrors.confirm = '两次输入的密码不一样'
    return
  }
  const emailErr = validateEmailInput(regForm.email)
  if (emailErr) {
    regErrors.email = emailErr
    return
  }
  if (!new RegExp(`^\\d{${CODE_DIGITS}}$`).test(regForm.code.trim())) {
    regErrors.code = `请填写 ${CODE_DIGITS} 位邮箱验证码`
    return
  }
  if (!regForm.agreed) {
    regForm.error = '请先阅读并同意隐私协议'
    return
  }

  regForm.busy = true
  try {
    await registerAccount({
      email: regForm.email.trim(),
      code: regForm.code.trim(),
      password: regForm.password,
      nick,
      avatar: regForm.avatar
    })
    // 成功后 isLoggedIn 变 true，上面的 watch 会切到个人中心
  } catch (err) {
    regForm.error = err?.message || '注册失败，请稍后再试'
  } finally {
    regForm.busy = false
  }
}

async function doUpdateProfile() {
  profileForm.error = ''
  const nick = profileForm.nick.trim()
  if (nick.length < NICK_MIN) {
    profileForm.error = `昵称至少 ${NICK_MIN} 个字符`
    return
  }
  profileForm.busy = true
  try {
    await updateProfile({ nick, avatar: profileForm.avatar })
    view.value = 'center'
  } catch (err) {
    profileForm.error = err?.message || '保存失败，请稍后再试'
  } finally {
    profileForm.busy = false
  }
}

async function doChangePassword() {
  pwdForm.error = ''
  pwdForm.done = false
  if (!new RegExp(`^\\d{${CODE_DIGITS}}$`).test(pwdForm.code.trim())) {
    pwdForm.error = `请填写 ${CODE_DIGITS} 位邮箱验证码`
    return
  }
  const email = currentUser.value?.email || ''
  const pwd = checkPasswordStrength(pwdForm.password, { email })
  if (!pwd.ok) {
    pwdForm.error = pwd.reason
    return
  }
  if (pwdForm.password !== pwdForm.confirm) {
    pwdForm.error = '两次输入的密码不一样'
    return
  }
  pwdForm.busy = true
  try {
    await changePasswordWithCode({ code: pwdForm.code.trim(), newPassword: pwdForm.password })
    pwdForm.done = true
    pwdForm.code = ''
    pwdForm.password = ''
    pwdForm.confirm = ''
    pwdCode.reset()
  } catch (err) {
    pwdForm.error = err?.message || '修改失败，请稍后再试'
  } finally {
    pwdForm.busy = false
  }
}

async function doChangeEmail() {
  mailForm.error = ''
  mailForm.done = false
  const emailErr = validateEmailInput(mailForm.newEmail)
  if (emailErr) {
    mailForm.error = emailErr
    return
  }
  if (!new RegExp(`^\\d{${CODE_DIGITS}}$`).test(mailForm.newCode.trim())) {
    mailForm.error = '请填写新邮箱收到的验证码'
    return
  }
  if (!new RegExp(`^\\d{${CODE_DIGITS}}$`).test(mailForm.oldCode.trim())) {
    mailForm.error = '请填写当前邮箱收到的验证码'
    return
  }
  mailForm.busy = true
  try {
    await changeEmailWithCodes({
      newEmail: mailForm.newEmail.trim(),
      newCode: mailForm.newCode.trim(),
      oldCode: mailForm.oldCode.trim()
    })
    mailForm.done = true
    mailForm.newEmail = ''
    mailForm.newCode = ''
    mailForm.oldCode = ''
    newMailCode.reset()
    oldMailCode.reset()
  } catch (err) {
    mailForm.error = err?.message || '换绑失败，请稍后再试'
  } finally {
    mailForm.busy = false
  }
}

async function doSignOut() {
  await signOut()
  close()
}

function askDelete() {
  pendingDelete.value = true
}

async function doDelete() {
  deleting.value = true
  try {
    await deleteMyAccount()
    close()
  } catch (err) {
    // 失败时把错误放回确认区上方（用 loginForm.error 之外的独立位置不合适，这里就近提示）
    loginForm.error = err?.message || '注销失败，请稍后再试'
    pendingDelete.value = false
  } finally {
    deleting.value = false
  }
}

function formatDate(unixSec) {
  if (!unixSec) return '—'
  const d = new Date(unixSec * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
</script>

<style scoped>
/* ---------- 顶部页签 ---------- */
.acct-switch {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-color, #8f7351);
}

.acct-switch-btn {
  flex: 1;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 15px;
  opacity: 0.6;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.acct-switch-btn.is-on {
  opacity: 1;
  font-weight: 700;
  border-bottom-color: #c8a06a;
}

/* ---------- 表单 ---------- */
.acct-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.acct-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.acct-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.acct-forgot-link {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--text-faint, #7a6652);
  cursor: pointer;
  transition: color 0.15s ease;
}

.acct-forgot-link:hover {
  color: var(--accent-ink, #946830);
  text-decoration: underline;
}

.acct-label {
  font-size: 13px;
  font-weight: 700;
  opacity: 0.9;
}

.acct-optional {
  font-weight: 400;
  opacity: 0.6;
}

.acct-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 11px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
  color: inherit;
  font-family: inherit;
  font-size: 15px;
}

.acct-input:focus {
  outline: none;
  border-color: #c8a06a;
}

.acct-input--code {
  font-family: ui-monospace, monospace;
  letter-spacing: 3px;
}

.acct-code-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.acct-code-row .acct-input {
  flex: 1;
  min-width: 0;
}

.acct-code-row :deep(button) {
  flex: 0 0 auto;
  white-space: nowrap;
}

/* ---------- 提示文字 ---------- */
.acct-hint {
  font-size: 13px;
  color: var(--text-secondary, #523b20);
  line-height: 1.55;
}

.acct-hint strong {
  color: var(--text-main, #241407);
  font-weight: 700;
  background: rgba(143, 115, 81, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
}

.acct-hint--quiet {
  font-size: 12.5px;
  color: #6d5032;
  opacity: 0.9;
}

.acct-hint--warn {
  color: #a32222;
  font-weight: 600;
  opacity: 1;
}

.acct-error {
  margin: 0;
  font-size: 13px;
  color: #a32222;
  font-weight: 600;
  line-height: 1.5;
}

.acct-error--tight {
  margin-top: 4px;
}

.acct-ok {
  margin: 0;
  font-size: 13px;
  color: #2e8b44;
  font-weight: 600;
}

/* ---------- 密码强度 ---------- */
.acct-strength {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  margin-top: 2px;
}

.acct-strength i {
  width: 26px;
  height: 5px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.16);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: background 0.2s ease;
}

.acct-strength em {
  font-style: normal;
  margin-left: 4px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.acct-strength[data-level='0'] em,
.acct-strength[data-level='1'] em {
  color: #b52a1a;
}
.acct-strength[data-level='1'] i:nth-child(1) {
  background: #c93b2b;
}

.acct-strength[data-level='2'] em {
  color: #9e6409;
}
.acct-strength[data-level='2'] i:nth-child(-n + 2) {
  background: #c88a1e;
}

.acct-strength[data-level='3'] em {
  color: #1e6b32;
}
.acct-strength[data-level='3'] i {
  background: #2e8b44;
}

.dark-mode .acct-hint {
  color: #dfc8a2;
}

.dark-mode .acct-hint strong {
  color: #faebd7;
  background: rgba(255, 255, 255, 0.12);
}

.dark-mode .acct-hint--quiet {
  color: #c4aa82;
  opacity: 0.95;
}

.dark-mode .acct-hint--warn,
.dark-mode .acct-error {
  color: #f87171;
}

.dark-mode .acct-strength i {
  background: rgba(255, 255, 255, 0.18);
}
.dark-mode .acct-strength[data-level='0'] em,
.dark-mode .acct-strength[data-level='1'] em {
  color: #f87171;
}
.dark-mode .acct-strength[data-level='2'] em {
  color: #fbbf24;
}
.dark-mode .acct-strength[data-level='3'] em {
  color: #4ade80;
}

/* ---------- 同意条款 ---------- */
.acct-agree {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-main, #2c1d11);
  cursor: pointer;
  user-select: none;
}

.acct-agree input {
  margin: 0;
  cursor: pointer;
  accent-color: #5c4327;
}

.acct-agree a {
  color: var(--accent-ink, #2f4a49);
  text-decoration: underline;
  font-weight: 600;
  transition: color 0.15s ease;
}

.acct-agree a:hover {
  color: var(--accent, #557574);
}

/* ---------- 个人中心 ---------- */
.acct-center {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.acct-id-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.18);
}

.acct-avatar {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  flex: 0 0 auto;
}

.acct-avatar--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background: rgba(255, 255, 255, 0.1);
}

.acct-id-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.acct-id-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* 用户要求：**编号显示在名称上面** */
.acct-no {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  color: #7a4e1d;
  background: rgba(122, 78, 29, 0.12);
  border: 1px solid rgba(122, 78, 29, 0.25);
  padding: 1px 7px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  line-height: 1.4;
  display: inline-flex;
  align-items: center;
}

.acct-role-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 4px;
  line-height: 1.4;
}

.acct-role-tag--super {
  color: #8f2020;
  background: rgba(143, 32, 32, 0.12);
  border: 1px solid rgba(143, 32, 32, 0.28);
}

.acct-role-tag--admin {
  color: #2f4a49;
  background: rgba(47, 74, 73, 0.12);
  border: 1px solid rgba(47, 74, 73, 0.25);
}

.acct-nick {
  font-size: 18px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acct-mail {
  font-size: 12px;
  color: var(--text-secondary, #6b4c2a);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acct-rows {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 10px;
  overflow: hidden;
}

.acct-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid rgba(143, 115, 81, 0.4);
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.acct-row:hover {
  background: rgba(143, 115, 81, 0.08);
}

.acct-row:last-child {
  border-bottom: 0;
}

.acct-row:active {
  background: rgba(200, 160, 106, 0.14);
}

.acct-row-arrow {
  opacity: 0.5;
}

/* 未读红点：数字用等宽感更强的小字号，超过 99 显示 99+ */
.acct-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: 6px;
  border-radius: 9px;
  background: #b23b3b;
  color: #fff;
  font-size: 11px;
  line-height: 1;
  vertical-align: 1px;
}

/* ---------- 我的评论 / 谁回复了我 ---------- */

.acct-back-bar {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.acct-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 14px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--accent-ink, #2f4a49);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.acct-back:hover {
  background: rgba(143, 115, 81, 0.12);
  border-color: #c8a06a;
}

.dark-mode .acct-back {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.18);
  color: #e5be83;
}

.dark-mode .acct-back:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: #f0c987;
}

.acct-mine > .acct-hint {
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main, #2c1d11);
  margin: 12px 0 4px;
}

.acct-mine > .acct-hint--quiet {
  text-align: center;
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary, #654728);
  margin-bottom: 16px;
  opacity: 0.9;
}

.dark-mode .acct-mine > .acct-hint {
  color: #f5eedf;
}

.dark-mode .acct-mine > .acct-hint--quiet {
  color: #c4aa82;
}

.acct-mine-list {
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 每条做成一张"纸片"：与本项目羊皮纸主题一致，靠边框而不是阴影分层
   （弹窗本身已有背景，再叠阴影会显脏） */
.acct-mine-item {
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 8px;
  padding: 9px 11px;
  background: var(--paper-solid, #d9c6a6);
}

.acct-mine-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 5px;
}

.acct-mine-page {
  color: var(--accent-ink, #2f4a49);
  font-weight: 600;
  font-size: 11px;
  background: rgba(47, 74, 73, 0.08);
  border: 1px solid rgba(47, 74, 73, 0.22);
  padding: 1px 6px;
  border-radius: 4px;
  /* 页面名可能很长（如物品全名），别把时间挤掉 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 48%;
}

.dark-mode .acct-mine-page {
  color: #a8c6c5;
  background: rgba(168, 198, 197, 0.12);
  border-color: rgba(168, 198, 197, 0.3);
}

/* 「谁回复了我」：回复者的头像 + 昵称，比"我的评论"多一个说话人 */
.acct-reply-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}

.acct-reply-nick {
  color: var(--text-main);
  font-weight: 600;
  max-width: 34%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 这条里的 pageLabel 是"在哪儿回复的"，前缀「在」由模板给，
   所以不要再抢 46% 的宽度限制 */
.acct-reply-nick + .acct-mine-page {
  max-width: none;
  font-weight: 400;
  color: var(--text-muted);
}

.acct-mine-tag {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  border: 1px solid var(--border-color, #8f7351);
  font-size: 11px;
  line-height: 16px;
}

/* 待审：用与错误同族的暖色但更轻，表示"还没公开"而不是"出错了" */
.acct-mine-tag--pending {
  color: #c98a3a;
  border-color: currentColor;
}

.acct-mine-tag--hidden {
  color: #e8a0a0;
  border-color: currentColor;
}

.acct-mine-time {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  opacity: 0.7;
}

.acct-mine-body {
  margin: 0 0 7px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-main);
  /* 长评论在列表里只露前三行，点「去看看」看全文 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.acct-mine-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  margin-top: 4px;
}

.acct-mine-link {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  color: var(--accent-ink, #2f4a49);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  transition: color 0.15s ease;
}

.acct-mine-link:hover {
  color: var(--accent, #557574);
  text-decoration: underline;
}

.acct-mine-link::after {
  content: ' ›';
  opacity: 0.8;
}

.acct-del-box {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.acct-del-prompt {
  font-size: 12px;
  color: #a32222;
  font-weight: 600;
}

.acct-mine-del {
  padding: 2px 8px;
  border: 1px solid rgba(163, 34, 34, 0.35);
  border-radius: 4px;
  background: rgba(163, 34, 34, 0.06);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: #a32222;
  cursor: pointer;
  transition: all 0.15s ease;
}

.acct-mine-del:hover:not(:disabled) {
  background: rgba(163, 34, 34, 0.15);
  border-color: #a32222;
}

.acct-del-btn {
  padding: 2px 8px;
  border-radius: 4px;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.acct-del-btn.is-yes {
  background: #a32222;
  color: #fff;
  border: 1px solid #851c1c;
}

.acct-del-btn.is-yes:hover {
  background: #851c1c;
}

.acct-del-btn.is-no {
  background: transparent;
  color: var(--text-secondary, #6b4c2a);
  border: 1px solid var(--border-color, #8f7351);
}

.acct-del-btn.is-no:hover {
  background: rgba(0, 0, 0, 0.06);
}

.acct-mine-link:disabled,
.acct-mine-del:disabled,
.acct-del-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.dark-mode .acct-mine-del {
  color: #fca5a5;
  border-color: rgba(252, 165, 165, 0.35);
  background: rgba(239, 68, 68, 0.12);
}

.dark-mode .acct-del-prompt {
  color: #fca5a5;
}

.dark-mode .acct-del-btn.is-yes {
  background: #dc2626;
  border-color: #ef4444;
}

.dark-mode .acct-del-btn.is-no {
  color: #d1b894;
  border-color: rgba(255, 255, 255, 0.2);
}

.acct-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.acct-btn-delete {
  background: none;
  border: none;
  color: #a32222;
  font-size: 13px;
  cursor: pointer;
  padding: 4px;
  opacity: 0.75;
  transition: opacity 0.15s ease;
  align-self: center;
}

.acct-btn-delete:hover {
  opacity: 1;
  text-decoration: underline;
}

.acct-hint--center {
  text-align: center;
  margin: 2px 0;
  opacity: 0.75;
}

.dark-mode .acct-no {
  color: #e5be83;
  background: rgba(229, 190, 131, 0.16);
  border-color: rgba(229, 190, 131, 0.35);
}

.dark-mode .acct-role-tag--super {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.4);
}

.dark-mode .acct-role-tag--admin {
  color: #a8c6c5;
  background: rgba(168, 198, 197, 0.18);
  border-color: rgba(168, 198, 197, 0.4);
}

.dark-mode .acct-btn-delete {
  color: #f87171;
}

.acct-confirm {
  border: 1px solid #a05a5a;
  border-radius: 10px;
  padding: 12px;
  background: rgba(160, 90, 90, 0.14);
}

.acct-confirm-row {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
  margin-top: 4px;
}

.acct-confirm-row > * {
  min-width: 96px;
}

/* ---------- 头像：主表单里的一行（点开才是选择器） ---------- */

.acct-avatar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 8px;
  /* 与输入框同一底色，视觉上仍是"表单里的一格" */
  background: var(--paper-solid, #d9c6a6);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.acct-avatar-row:active {
  filter: brightness(0.96);
}

.acct-avatar-thumb {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}

.acct-avatar-thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.12);
}

/* 单行：头像 + 名字 + ›。不写"点这里换一个" —— 有 › 就够表意了，
   而这一行省下来的高度正好让注册表单在 800px 高的屏幕上不用滚。 */
.acct-avatar-row-title {
  font-size: 14px;
  color: var(--text-main);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
