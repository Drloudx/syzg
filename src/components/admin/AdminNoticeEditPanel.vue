<template>
  <section class="admin-workshop admin-notice-edit-panel">
    <div class="workshop-header notice-edit-header">
      <h1 class="workshop-title">
        <span class="workshop-title-star">✦</span>
        <span>{{ isNew ? '新建公告' : '编辑公告' }}</span>
        <span v-if="!isNew" class="notice-edit-id">#{{ noticeId }}</span>
      </h1>
      <div class="notice-edit-actions">
        <button type="button" class="admin-btn admin-btn--ghost" @click="goBack">← 返回列表</button>
        <button v-if="!isNew" type="button" class="admin-btn admin-btn--ghost" @click="toggleActive">
          {{ form.isActive ? '停用' : '启用' }}
        </button>
        <button v-if="!isNew" type="button" class="admin-btn admin-btn--danger" :disabled="saving" @click="removeNotice">
          删除公告
        </button>
        <button type="button" class="admin-btn admin-btn--gold" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : (isNew ? '创建公告' : '保存公告') }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="admin-hint">正在加载公告数据…</p>
    <p v-else-if="loadError" class="admin-error">⚠ {{ loadError }}</p>

    <template v-else>
      <!-- 基本信息 -->
      <div class="home-card">
        <div class="home-card-head">
          <span class="home-card-index">信息</span>
          <input v-model="form.title" class="admin-input home-title-input" type="text" placeholder="公告标题（必填）" />
        </div>

        <div class="home-field-grid">
          <label class="home-field">
            <span class="home-field-label">频道</span>
            <select v-model="form.channel" class="admin-input admin-select" :disabled="!isNew" @change="onChannelChange">
              <option value="site">本站公告</option>
              <option value="official">官方公告</option>
            </select>
          </label>

          <label class="home-field">
            <span class="home-field-label">日期</span>
            <input v-model="form.date" class="admin-input" type="date" />
          </label>

          <label class="home-field">
            <span class="home-field-label">标签文案</span>
            <input v-model="form.tagText" class="admin-input" type="text" placeholder="置顶 / 功能 / 数据 / 版本" />
          </label>

          <label class="home-field">
            <span class="home-field-label">标签配色</span>
            <div class="color-select-wrapper">
              <select v-model="form.tagClass" class="admin-input admin-select color-select-input">
                <option v-for="c in TAG_CLASSES" :key="c.value" :value="c.value">{{ c.label }}</option>
              </select>
              <div
                class="color-preview-swatch"
                :class="`is-notice-${form.tagClass}`"
                :title="`当前标签配色：${form.tagClass}`"
              ></div>
            </div>
          </label>

          <!-- 仅官方：版本号 + 特性列表（首页右侧速览卡用） -->
          <label v-if="form.channel === 'official'" class="home-field">
            <span class="home-field-label">版本号（有值才成为右侧速览卡）</span>
            <input v-model="form.version" class="admin-input" type="text" />
          </label>

          <label v-if="form.channel === 'official'" class="home-field home-field-wide">
            <span class="home-field-label">特性列表（每行一条，纯文本）</span>
            <textarea
              class="admin-input"
              rows="4"
              :value="form.featuresText"
              @input="form.featuresText = $event.target.value"
            />
          </label>
        </div>

        <!-- 底部元信息行 (弹窗提示 + 公告 ID 一键复制) -->
        <div class="notice-meta-bar">
          <p v-if="form.channel === 'site'" class="notice-modal-note">
            ✦ 本站公告发布后会<strong>自动弹窗</strong>提示用户（官方公告不会）
          </p>
          <div v-else class="notice-meta-placeholder" />

          <!-- 公告 ID 复制区 (方便去「首页管理」填展示公告) -->
          <div v-if="!isNew" class="notice-id-copy-box" title="点击一键复制公告 ID" @click="copyNoticeId">
            <span class="notice-id-label">公告 ID:</span>
            <code class="notice-id-code">{{ noticeId }}</code>
            <button type="button" class="notice-id-copy-btn" :class="{ 'is-copied': copiedNoticeId }">
              {{ copiedNoticeId ? '✓ 已复制' : '📋 复制 ID' }}
            </button>
          </div>
          <div v-else class="notice-id-new-hint">
            <span>保存后自动分配公告 ID</span>
          </div>
        </div>
      </div>

      <!-- 正文：富文本 -->
      <div class="home-card">
        <div class="home-card-head">
          <span class="home-card-index">正文</span>
        </div>
        <RichTextEditor v-model="form.content" :rows="12" placeholder="公告正文…用空行分段" />
      </div>

      <p v-if="errorMessage" class="admin-error">⚠ {{ errorMessage }}</p>
      <p v-if="savedMessage" class="admin-saved">✓ {{ savedMessage }}</p>
    </template>

    <!-- 通用操作确认弹窗 -->
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
 * 公告编辑页（一公告一页）。
 *
 * 路由：`/admin/notices/:id`，`id === 'new'` 时是新建。
 * 新建时频道由 `?channel=` 带入（从列表页当前 Tab 继承）。
 *
 * 🔴 频道一旦创建就不可改：公告 id 前缀（site-N / official-N）与频道绑定，
 *    改频道会造成 id 与内容不符，且首页插槽的引用也会错位。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RichTextEditor from '../ui/RichTextEditor.vue'
import UiModal from '../ui/UiModal.vue'
import { AdminApiError } from '../../utils/adminApi.js'
import { createNotice, updateNotice, fetchNotices, deleteNotice } from '../../utils/adminNoticesApi.js'

const route = useRoute()
const router = useRouter()

const noticeId = computed(() => String(route.params.id || ''))
const isNew = computed(() => noticeId.value === 'new')

const TAG_CLASSES = [
  { value: 'pinned', label: '置顶（深红）' },
  { value: 'patch', label: '功能更新（金）' },
  { value: 'event', label: '数据 / 活动（青）' },
  { value: 'info', label: '说明 / 社区（灰）' },
  { value: 'gold', label: '强调（亮金）' }
]

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const savedMessage = ref('')
const errorMessage = ref('')
const copiedNoticeId = ref(false)

async function copyNoticeId() {
  if (isNew.value || !noticeId.value) return
  const id = noticeId.value
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(id)
    } else {
      const input = document.createElement('input')
      input.value = id
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    copiedNoticeId.value = true
    flash(`已复制公告 ID：${id}（可直接粘贴至「首页管理」）`)
    setTimeout(() => {
      copiedNoticeId.value = false
    }, 2000)
  } catch {
    fail({ message: '复制失败，请手动选中文本复制' })
  }
}

const form = ref({
  id: '',
  channel: route.query.channel === 'official' ? 'official' : 'site',
  title: '',
  date: new Date().toISOString().slice(0, 10),
  tagText: '',
  tagClass: 'info',
  version: '',
  featuresText: '',
  content: '',
  isActive: 1
})

/** 二次确认弹窗状态与 Promise 机制 */
const confirmModal = ref({
  visible: false,
  title: '操作确认',
  lead: '',
  content: '',
  confirmText: '确定',
  cancelText: '取消',
  isDanger: false,
  resolve: null
})

function askConfirm({ title, lead, content, confirmText, cancelText, isDanger = false }) {
  return new Promise((resolve) => {
    confirmModal.value = {
      visible: true,
      title: title || '操作确认',
      lead: lead || '',
      content: content || '',
      confirmText: confirmText || '确定',
      cancelText: cancelText || '取消',
      isDanger,
      resolve
    }
  })
}

function onConfirmAccept() {
  const res = confirmModal.value.resolve
  confirmModal.value.visible = false
  confirmModal.value.resolve = null
  if (res) res(true)
}

function onConfirmCancel() {
  const res = confirmModal.value.resolve
  confirmModal.value.visible = false
  confirmModal.value.resolve = null
  if (res) res(false)
}

/**
 * 频道切换时把官方专用字段清干净（版本号 / 特性列表只对官方有意义）。
 * 弹窗开关已不需要处理 —— 后端按 channel 决定。
 */
function onChannelChange() {
  if (form.value.channel === 'site') {
    form.value.version = ''
    form.value.featuresText = ''
  }
}

async function load() {
  if (isNew.value) {
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    // 列表接口带全部字段，直接按 id 找（公告量小，一页 50 足够）
    const data = await fetchNotices({ size: 50 })
    let hit = (data.notices || []).find((n) => n.id === noticeId.value)
    if (!hit && data.total > 50) {
      // 极端情况：公告超过 50 条且不在第一页，用搜索精确定位
      const byQ = await fetchNotices({ q: noticeId.value, size: 50 })
      hit = (byQ.notices || []).find((n) => n.id === noticeId.value)
    }
    if (!hit) throw new AdminApiError('公告不存在或已被删除', 404)

    form.value = {
      id: hit.id,
      channel: hit.channel,
      title: hit.title || '',
      date: hit.date || '',
      tagText: hit.tagText || '',
      tagClass: hit.tagClass || 'info',
      version: hit.version || '',
      featuresText: (hit.features || []).join('\n'),
      content: hit.content || '',
      isActive: hit.isActive ? 1 : 0
    }
  } catch (err) {
    loadError.value = err instanceof AdminApiError
      ? `${err.message}${err.isUnauthorized ? '（本页仅超管可访问）' : ''}`
      : (err?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function flash(msg) {
  savedMessage.value = msg
  errorMessage.value = ''
  setTimeout(() => { if (savedMessage.value === msg) savedMessage.value = '' }, 2500)
}

function fail(err) {
  errorMessage.value = err instanceof AdminApiError ? err.message : (err?.message || '操作失败')
  savedMessage.value = ''
}

function payload() {
  const f = form.value
  return {
    id: f.id || undefined,
    channel: f.channel,
    title: f.title.trim(),
    date: f.date,
    tagText: f.tagText,
    tagClass: f.tagClass,
    version: f.channel === 'official' ? f.version : null,
    features: f.channel === 'official'
      ? f.featuresText.split('\n').map((s) => s.trim()).filter(Boolean)
      : null,
    content: f.content,
    isActive: f.isActive
  }
}

async function save() {
  if (!form.value.title.trim()) {
    errorMessage.value = '标题不能为空'
    return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.value.date)) {
    errorMessage.value = '日期需为 YYYY-MM-DD'
    return
  }

  saving.value = true
  try {
    if (isNew.value) {
      const res = await createNotice(payload())
      flash('已创建')
      // 创建后跳到该条的编辑页，ID 由后端生成
      router.replace(`/admin/notices/${encodeURIComponent(res.id)}`)
      load()
    } else {
      await updateNotice(payload())
      flash('已保存')
    }
  } catch (err) {
    fail(err)
  } finally {
    saving.value = false
  }
}

async function toggleActive() {
  saving.value = true
  try {
    await updateNotice({ ...payload(), isActive: form.value.isActive ? 0 : 1 })
    form.value.isActive = form.value.isActive ? 0 : 1
    flash(form.value.isActive ? '已启用' : '已停用')
  } catch (err) {
    fail(err)
  } finally {
    saving.value = false
  }
}

async function removeNotice() {
  const confirmed = await askConfirm({
    title: '删除公告确认',
    lead: `确定要彻底删除公告「${form.value.title || noticeId.value}」吗？`,
    content: '删除后无法恢复。如果该公告被首页插槽引用，首页将不再展示此公告。',
    confirmText: '确认删除',
    isDanger: true
  })
  if (!confirmed) return

  saving.value = true
  try {
    await deleteNotice(noticeId.value)
    flash('已删除公告')
    router.replace({ path: '/admin/notices', query: { channel: form.value.channel } })
  } catch (err) {
    fail(err)
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push({ path: '/admin/notices', query: { channel: form.value.channel } })
}

onMounted(load)
</script>

<style scoped>
/* ==================== 羊皮纸主工坊面板容器 (与首页管理/公告列表统一) ==================== */
.admin-workshop {
  --wood-border: #7a5c3d;
  --gold-border: rgba(143, 115, 81, 0.45);
  --gold-accent: #c5913e;
  --text-main: #3e2a14;
  --text-muted: #755c3f;
  --paper-soft: #f4ecdc;
  --paper-card: #f9f5eb;

  flex: 1;
  min-width: 0;
  height: 100%;
  max-height: 100%;
  overflow-y: auto;
  border: 2px solid var(--wood-border);
  border-radius: 8px;
  background: var(--paper-soft);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

/* 顶部标题区 */
.workshop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1.5px solid var(--gold-border);
  flex-wrap: wrap;
}

.workshop-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 23px;
  font-weight: 800;
  color: #2b1b0d;
  margin: 0;
  letter-spacing: 0.5px;
}

.workshop-title-star {
  font-size: 19px;
  color: var(--gold-accent);
  line-height: 1;
}

.notice-edit-id {
  margin-left: 6px;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 600;
}

.notice-edit-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

/* 象牙古卷卡片容器 */
.home-card {
  background: var(--paper-card);
  border: 1.5px solid var(--wood-border);
  border-radius: 8px;
  padding: 16px 18px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.home-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-card-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--gold-border);
  border-radius: 6px;
  background: rgba(197, 145, 62, 0.1);
  color: #6b4c1b;
  font-weight: 700;
  font-size: 13px;
}

.home-title-input {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-main);
}

.notice-edit-hint {
  font-size: 12px;
  color: var(--text-muted);
}

/* 表单字段网格 */
.home-field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.home-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.home-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.home-field-wide {
  grid-column: 1 / -1;
}

.home-field-inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-main);
  cursor: pointer;
}

/* 标签颜色选择与预览小块 */
.color-select-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.color-select-input {
  flex: 1;
  min-width: 0;
}

.color-preview-swatch {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1.5px solid rgba(0, 0, 0, 0.15);
  box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.color-preview-swatch.is-notice-pinned {
  background: #a93226;
  border-color: #7b241c;
}

.color-preview-swatch.is-notice-patch {
  background: #c5913e;
  border-color: #8c6422;
}

.color-preview-swatch.is-notice-event {
  background: #2e86c1;
  border-color: #1b4f72;
}

.color-preview-swatch.is-notice-info {
  background: #7f8c8d;
  border-color: #515a5a;
}

.color-preview-swatch.is-notice-gold {
  background: #d4ac0d;
  border-color: #9a7d0a;
}

/* 弹窗文本细节 */
.admin-modal-lead {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 10px 0;
}

.admin-modal-quote {
  font-size: 13px;
  color: var(--text-muted);
  background: rgba(122, 92, 61, 0.08);
  border-left: 3px solid var(--gold-accent);
  padding: 10px 14px;
  border-radius: 4px;
}

@media (max-width: 720px) {
  .workshop-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .notice-edit-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

/* 自动弹窗说明（原勾选框位置，改成只读提示） */
.notice-modal-note {
  margin: 0;
  font-size: 12px;
  color: #6b5134;
  background: rgba(184, 134, 11, 0.08);
  border-left: 3px solid rgba(184, 134, 11, 0.5);
  border-radius: 3px;
  padding: 6px 10px;
}

.notice-modal-note strong {
  color: #8a6408;
}

/* 底部元信息行 (弹窗提示 + 公告 ID 一键复制) */
.notice-meta-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(122, 92, 61, 0.2);
  flex-wrap: wrap;
}

.notice-meta-placeholder {
  flex: 1;
}

.notice-id-copy-box {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #ede3ce;
  border: 1px solid rgba(122, 92, 61, 0.35);
  border-radius: 5px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.notice-id-copy-box:hover {
  background: #e6dac1;
  border-color: #8c6422;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.notice-id-label {
  font-size: 12px;
  font-weight: 700;
  color: #6b5134;
}

.notice-id-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #8b2500;
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 6px;
  border-radius: 3px;
  letter-spacing: 0.5px;
}

.notice-id-copy-btn {
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: #7a5c3d;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.notice-id-copy-btn:hover {
  color: #2b1b0d;
  background: rgba(122, 92, 61, 0.12);
}

.notice-id-copy-btn.is-copied {
  color: #27ae60;
  font-weight: 700;
}

.notice-id-new-hint {
  font-size: 12px;
  color: #9c8266;
  font-style: italic;
}
</style>
