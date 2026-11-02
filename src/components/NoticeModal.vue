<template>
  <UiModal
    :visible="modelValue"
    title="公告"
    max-width="440px"
    teleport-to="body"
    @update:visible="closeModal"
  >
    <UiEmptyState v-if="isLoading" type="loading" text="正在翻阅公告卷轴..." />
    <UiEmptyState v-else-if="error" type="error" :text="'加载失败: ' + error" />
    <div v-else class="notice-list">
      <div v-for="notice in sortedNotices" :key="noticeKey(notice)" class="notice-item paper-panel-solid">
        <h4 class="notice-item-title">
          <UiTag v-if="notice.isPinned" tone="danger">置顶</UiTag>
          {{ notice.title }}
        </h4>
        <span class="notice-item-date">{{ notice.date }}</span>
        <!--
          正文用 RichTextView 渲染（受限标记 → VNode），**不用 v-html**。
          老数据是纯文本，解析器遇到无标记内容会原样输出，所以兼容。
        -->
        <RichTextView class="notice-item-content" :content="notice.content" />
      </div>

      <!-- 交流群：所有公告通用，放在列表末尾，点击直接跳转加群 -->
      <div class="notice-contact">
        <span class="notice-contact-label">交流群</span>
        <a
          class="notice-contact-link"
          href="https://qm.qq.com/q/iolDkZyD2E"
          target="_blank"
          rel="noopener noreferrer"
        >963318625</a>
      </div>
    </div>
    <template #footer>
      <UiButton variant="primary" @click="closeModal">确认</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { UiModal, UiButton, UiTag, UiEmptyState } from './ui/index.js'
import RichTextView from './ui/RichTextView.vue'
import { fetchWithFallback } from '../utils/request.js'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const notices = ref([])
const isLoading = ref(true)
const error = ref(null)

/**
 * 公告的「已读」标识。
 *
 * 🔴 不能用 `date` 做去重键：它是**天粒度**的。
 * 同一天发第二条公告时 `date` 没变，用户就不会再看到弹窗。
 *
 * 优先级：
 *   1. `id`      —— 最稳，随便一天发多少条都各自独立
 *   2. `date` + `title` —— 没写 id 时的兜底，至少同一天不同标题能区分
 *   3. `date`    —— 最后兜底（与旧行为兼容）
 */
const noticeKey = (notice) => {
  if (!notice) return ''
  if (notice.id) return `id:${notice.id}`
  if (notice.date && notice.title) return `${notice.date}#${notice.title}`
  return String(notice.date || '')
}

/**
 * 展示顺序：**最新的在最上面**。
 *
 * 规则：置顶项固定在最前（它是常驻声明），其余按 `date` 倒序。
 * 同一天的多条保持 json 里的书写顺序（越靠前越新）—— 也就是 author
 * 只需把当天最新的一条写在前面，不必改日期。
 *
 * 🔴 不要改成纯 `date` 倒序：那样置顶声明会被新公告挤下去，
 * 而它是要一直挂在顶上的站点声明。
 */
const sortedNotices = computed(() => {
  const pinned = []
  const normal = []
  for (const n of notices.value) {
    (n.isPinned ? pinned : normal).push(n)
  }
  // 稳定排序：date 相同则保留原相对顺序
  const sortedNormal = normal
    .map((n, i) => ({ n, i }))
    .sort((a, b) => {
      const d = String(b.n.date || '').localeCompare(String(a.n.date || ''))
      return d !== 0 ? d : a.i - b.i
    })
    .map((x) => x.n)
  return [...pinned, ...sortedNormal]
})

const closeModal = () => {
  emit('update:modelValue', false)
}

/** 自动弹窗的已读记录：存**已读过的全部 key**（JSON 数组） */
const READ_KEY = 'lastNoticeKey'
/** 旧版只存了一条日期，仅为兼容历史数据保留读取 */
const LEGACY_KEY = 'lastNoticeDate'

/** 读出已读集合；兼容旧版「只存了单条」的格式 */
const readSeenKeys = () => {
  const raw = localStorage.getItem(READ_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((k) => typeof k === 'string')
  } catch {
    // 旧格式：直接存了一个 key 字符串
    return [raw]
  }
  return [raw]
}

const writeSeenKeys = (keys) => {
  // 只保留最近 50 条，避免无限增长
  localStorage.setItem(READ_KEY, JSON.stringify(keys.slice(-50)))
}

/**
 * 载入公告。
 *
 * 🔴 数据源已从 `public/data/notice.json` 改为 `GET /api/home-config`（2026-11-01）。
 *    那次改造把「弹窗」与「首页公告」合并到同一张 `notices` 表，
 *    解决了「首页改了弹窗还是旧的」两套数据源问题。
 *    接口不可用时仍回落到本地文件，保证弹窗不会整块消失。
 *
 * 只取 `channel === 'site'` 的公告 —— 官方更新是「游戏版本信息」，
 * 不该在用户进站时打扰，它们只在首页展示。
 */
const loadNotices = async () => {
  isLoading.value = true
  error.value = null
  try {
    let all = []
    try {
      const res = await fetch('/api/home-config', { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data?.ok) throw new Error('payload not ok')
      all = Array.isArray(data.notices) ? data.notices : []
    } catch (apiErr) {
      // 回落：接口挂了也要能看到公告（用打包时的快照）
      console.warn('[notice] 接口不可用，回落到 data/notice.json：', apiErr?.message || apiErr)
      const data = await fetchWithFallback('data/notice.json')
      all = data.notices || []
    }

    /*
     * 只保留站点公告。字段映射：
     *   接口返回 tagClass/tagText/isPinned 语义不同 —— 接口里置顶由 tier==='pin' 表示。
     *   这里统一成弹窗组件期望的形状（isPinned 布尔）。
     */
    notices.value = all
      .filter((n) => (n.channel || 'site') === 'site')
      .map((n) => ({
        id: n.id,
        title: n.title,
        date: n.date,
        content: n.content,
        isPinned: n.tier === 'pin',
        tagText: n.tagText,
        tagClass: n.tagClass,
        // 1 = 有新内容时自动弹（官方恒为 0；本站默认 1）
        showInModal: n.showInModal === undefined ? 1 : Number(n.showInModal)
      }))

    /*
     * 自动弹出：只对**非置顶**且 `showInModal=1` 的公告判定。
     *
     * 🔴 已读记录存的是**集合**，不是单条。
     * 只记最后一条的话，用户读完最新的那条，旧的未读公告下次又会被判成未读、
     * 每次都弹 —— 实测「一天发两条」时表现为每次刷新都弹窗。
     *
     * 判定后把「本次展示出来的所有可弹公告」一次性全部标记已读：
     * 弹窗里这些内容用户都看到了，不该再逐条补弹。
     */
    if (!props.modelValue) {
      const seen = new Set(readSeenKeys())
      const legacyDate = localStorage.getItem(LEGACY_KEY)
      const expanded = new Set(seen)

      const unread = notices.value.filter((n) => {
        if (n.isPinned) return false
        if (!n.showInModal) return false
        const key = noticeKey(n)
        if (seen.has(key)) return false
        // 兼容旧版：只有日期记录的，视为当天这些公告都已读
        if (!seen.size && legacyDate && legacyDate === n.date) return false
        return true
      })

      if (unread.length) {
        /*
         * 🔴 后台路由不自动弹。
         *
         * 管理员进 /admin/* 是为了干活（编辑公告、审核评论），
         * 这时被一条「有新公告」的弹窗盖住只会碍事 —— 而且他很可能
         * 正是刚发那条公告的人。手动点头部图标仍可打开。
         */
        const onAdminPage = typeof window !== 'undefined' &&
          String(window.location.hash || '').startsWith('#/admin')
        if (onAdminPage) return

        emit('update:modelValue', true)
        // 一次把所有可弹公告记为已读（它们都会显示在弹窗里）
        for (const n of notices.value) {
          if (!n.isPinned && n.showInModal) expanded.add(noticeKey(n))
        }
        writeSeenKeys([...expanded])
        localStorage.removeItem(LEGACY_KEY)
      }
    }
  } catch (err) {
    error.value = err.message
    console.error('Failed to load notices:', err)
  } finally {
    isLoading.value = false
  }
}

watch(() => props.modelValue, (newVal) => {
  if (newVal && notices.value.length === 0) {
    loadNotices()
  }
})

onMounted(() => {
  loadNotices()
})
</script>

<style scoped>
.notice-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.notice-item {
  padding: 12px 14px;
}
.notice-item-title {
  margin: 0 0 4px 0;
  font-size: 15px;
  color: var(--text-main, #3e2a14);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.notice-item-date {
  font-size: 12px;
  color: var(--text-faint, #8a6d4d);
  display: block;
  margin-bottom: 8px;
  font-style: italic;
}
.notice-item-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  color: var(--text-main, #3e2a14);
}

/* 交流群：与公告正文同字号，数值加粗可点 */
.notice-contact {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-main, #3e2a14);
}
.notice-contact-label {
  color: var(--text-muted, #6b5134);
  font-weight: 700;
}
.notice-contact-link {
  color: var(--text-main, #3e2a14);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.notice-contact-link:hover {
  opacity: 0.75;
}
</style>
