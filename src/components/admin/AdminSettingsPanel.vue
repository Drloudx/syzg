<template>
  <section class="admin-panel">
    <h2 class="admin-section-title">转待审 · 常用选项</h2>
    <p class="admin-hint">
      管理员在评论列表点「转待审」时，这些文案会作为点一下就填的快捷选项出现（仍可自由编辑）。
      顺序即显示顺序，留空的行会被忽略。删光就只保留自由输入。
    </p>

    <p v-if="errorMessage" class="admin-error">{{ errorMessage }}</p>
    <p v-if="savedMessage" class="admin-saved">{{ savedMessage }}</p>
    <p v-if="loading" class="admin-hint">正在加载…</p>

    <template v-else>
      <div class="admin-preset-editor">
        <div v-for="(row, index) in rows" :key="row.key" class="admin-preset-line">
          <span class="admin-preset-index">{{ index + 1 }}</span>
          <input
            v-model="row.text"
            class="admin-input"
            type="text"
            :maxlength="TEXT_MAX"
            :placeholder="index === 0 ? '如：重复发帖' : ''"
          />
          <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="moveUp(index)" :disabled="index === 0">
            上移
          </button>
          <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" @click="moveDown(index)" :disabled="index === rows.length - 1">
            下移
          </button>
          <button type="button" class="admin-btn admin-btn--danger admin-btn--sm" @click="removeRow(index)">
            删除
          </button>
        </div>
        <p v-if="!rows.length" class="admin-hint">当前没有任何常用选项。</p>
      </div>

      <div class="admin-preset-actions">
        <button type="button" class="admin-btn admin-btn--ghost" :disabled="rows.length >= COUNT_MAX" @click="addRow">
          添加一项
        </button>
        <button type="button" class="admin-btn" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <span class="admin-preset-count">{{ rows.length }} / {{ COUNT_MAX }}</span>
      </div>
    </template>

    <hr class="admin-divider" />

    <h2 class="admin-section-title">评论审核词表</h2>
    <p class="admin-hint">
      命中即让评论进待审（不是拒收），管理员在评论页可一键放行。
      每个类别<span class="admin-kw-strong">代码里已经有内置词</span>（灰底那些，一直生效），
      你可以停用整个类别，或另加自己的关键词。
    </p>

    <p v-if="kwError" class="admin-error">{{ kwError }}</p>
    <p v-if="kwSaved" class="admin-saved">{{ kwSaved }}</p>

    <!-- 只读提示：结构性规则是防注入底线，不给编辑入口 -->
    <p class="admin-hint admin-hint--tight">
      内置结构性规则（不可修改）：{{ structural.map((s) => s.name).join('、') }}
      —— {{ structural[0]?.note || '' }}
    </p>

    <!-- 解释"内置类别为什么不能删"：词在代码里，停用才是等价操作 -->
    <p class="admin-hint admin-hint--tight">
      灰底虚线的是<span class="admin-kw-strong">代码内置词</span>，不能单独删除（它们在代码里，改了要重新部署）。
      要让它们不生效，<span class="admin-kw-strong">取消勾选整个类别</span>即可 —— 效果等同于删掉该类别下的所有词，
      而且随时可以勾回来。
    </p>

    <div v-if="kwCategories.length" class="admin-kw-list">
      <div v-for="cat in kwCategories" :key="cat.name" class="admin-kw-cat">
        <label class="admin-kw-head">
          <input type="checkbox" class="admin-check" :checked="!cat.disabled" @change="toggleCategory(cat.name, $event.target.checked)" />
          <strong>{{ cat.name }}</strong>
          <span class="admin-kw-meta">
            <template v-if="cat.baseline">内置 {{ cat.baselineWords.length }} 词</template>
            <template v-else>自建类别</template>
            <template v-if="cat.custom"> · 另加 {{ cat.custom }} 条</template>
          </span>
          <span v-if="cat.disabled" class="admin-kw-off">已停用</span>
        </label>

        <div v-if="!cat.disabled" class="admin-kw-words">
          <!--
            🔴 内置词**必须列出来**。
            只显示"自定义 N 条"会让管理员以为类别是空的、以为必须自己加词
            （用户实际就这么反馈过）。
            灰底不可删：它们在代码里，停用整个类别才会一起失效。
          -->
          <span v-for="(bw, i) in cat.baselineWords" :key="`b-${cat.name}-${i}`" class="admin-kw-chip admin-kw-chip--builtin" :title="'内置词（代码里，不可单独删除）'">
            {{ bw }}
          </span>

          <span v-for="(w, i) in wordsOf(cat.name)" :key="`${cat.name}-${i}`" class="admin-kw-chip">
            {{ w }}
            <button type="button" class="admin-kw-del" title="移除" @click="removeWord(cat.name, i)">✕</button>
          </span>
          <input
            class="admin-input admin-kw-input"
            type="text"
            :maxlength="KW_MAX"
            placeholder="加关键词后回车"
            @keydown.enter="addWord(cat.name, $event)"
          />
        </div>
      </div>
    </div>

    <div class="admin-preset-actions">
      <button type="button" class="admin-btn admin-btn--ghost" @click="openNewCategory">新建类别</button>
      <button type="button" class="admin-btn admin-btn--ghost" @click="exportKeywords">导出 JSON</button>
      <button type="button" class="admin-btn admin-btn--ghost" @click="triggerImport">导入 JSON</button>
      <!-- 隐藏的选取框：导入走它，避免用 window.prompt 让用户手敲路径（做不到） -->
      <input
        ref="importInput"
        type="file"
        accept="application/json,.json"
        class="admin-sr-only"
        @change="onImportFile"
      />
      <button type="button" class="admin-btn" :disabled="kwSaving" @click="saveKeywords">
        {{ kwSaving ? '保存中…' : '保存词表' }}
      </button>
      <span class="admin-preset-count">自定义词 {{ customKeywordCount }} / {{ KW_COUNT_MAX }}</span>
    </div>
    <p v-if="importHint" class="admin-hint admin-hint--tight admin-import-hint">{{ importHint }}</p>
  </section>
</template>

<script setup>
/**
 * 后台 · 设置（**仅超管**）。
 *
 * 目前只有一项：转待审的「常用选项」。放在设置页而不是塞进评论页，
 * 是因为它属于**审核口径**（影响所有管理员看到的界面），不是某一条评论的操作。
 *
 * ## 保存是「整表替换」
 *
 * 界面上一串文案 + 一次「保存」＝一个整体动作，所以接口用 PUT 整表替换而不是
 * 逐条增删。逐条会产生中间态（删了旧的还没加新的），别的管理员正好打开界面
 * 就会读到半截列表。整表替换是原子的：要么全旧、要么全新。
 *
 * 服务端对写操作**强校验超管**（普通管理员拿到 403），前端隐藏页签只是体验。
 */

import { computed, onMounted, ref } from 'vue'

import {
  AdminApiError,
  fetchReviewKeywords,
  fetchReviewPresets,
  saveReviewKeywords,
  saveReviewPresets
} from '../../utils/adminApi.js'

/** 单条文案上限，与后端 `REVIEW_NOTE_MAX` 一致 */
const TEXT_MAX = 80
/** 条数上限，与后端 `PRESET_COUNT_MAX` 一致 */
const COUNT_MAX = 20

const rows = ref([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const savedMessage = ref('')
/** 行需要一个稳定 key：用数组下标会让「上移/下移」后输入框焦点错位 */
let nextKey = 0
const makeRow = (text = '') => ({ key: `r${nextKey++}`, text })

function addRow() {
  if (rows.value.length >= COUNT_MAX) return
  rows.value.push(makeRow())
}

function removeRow(index) {
  rows.value.splice(index, 1)
}

function moveUp(index) {
  if (index <= 0) return
  const [row] = rows.value.splice(index, 1)
  rows.value.splice(index - 1, 0, row)
}

function moveDown(index) {
  if (index >= rows.value.length - 1) return
  const [row] = rows.value.splice(index, 1)
  rows.value.splice(index + 1, 0, row)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchReviewPresets()
    const list = Array.isArray(data?.presets) ? data.presets : []
    rows.value = list.map((p) => makeRow(p.text))
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  savedMessage.value = ''
  try {
    // 空行直接丢掉（服务端也会去重/丢弃，但这里先清干净更直观）
    const texts = rows.value.map((r) => r.text.trim()).filter(Boolean)
    const data = await saveReviewPresets(texts)
    const list = Array.isArray(data?.presets) ? data.presets : []
    // 用服务端回的结果重建：去重后的真实状态才是"保存成功了什么"
    rows.value = list.map((p) => makeRow(p.text))
    savedMessage.value = '已保存'
    setTimeout(() => { savedMessage.value = '' }, 2000)
  } catch (err) {
    errorMessage.value = err instanceof AdminApiError ? err.message : '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

// ── 评论审核词表 ────────────────────────────────────────────────

/** 关键词上限，与后端 `KEYWORD_MAX` / `KEYWORD_COUNT_MAX` 一致 */
const KW_MAX = 30
const KW_COUNT_MAX = 300

/**
 * 类别列表（每项含启用状态与自定义词数）+ 每个类别下的自定义词。
 *
 * 用 `Map` 存词而不是嵌在类别对象里：增删词时不必重建整个数组，
 * 也避免"改了词但要连着类别状态一起提交"的耦合。
 */
const kwCategories = ref([])
const kwWords = ref({})
const structural = ref([])
const kwSaving = ref(false)
const kwError = ref('')
const kwSaved = ref('')

const customKeywordCount = computed(() =>
  Object.values(kwWords.value).reduce((sum, list) => sum + list.length, 0)
)

const wordsOf = (category) => kwWords.value[category] || []

function toggleCategory(name, enabled) {
  const cat = kwCategories.value.find((c) => c.name === name)
  if (cat) cat.disabled = !enabled
}

function addWord(category, event) {
  const input = event.target
  const text = String(input.value || '').trim()
  input.value = ''
  if (!text) return
  if (text.length > KW_MAX) {
    kwError.value = `关键词不能超过 ${KW_MAX} 个字`
    return
  }
  if (customKeywordCount.value >= KW_COUNT_MAX) {
    kwError.value = `自定义关键词最多 ${KW_COUNT_MAX} 条`
    return
  }
  kwError.value = ''
  const list = kwWords.value[category] || (kwWords.value[category] = [])
  // 同一类别内去重（服务端也去重，这里避免"加了看不出反应"）
  if (list.includes(text)) return
  list.push(text)
  const cat = kwCategories.value.find((c) => c.name === category)
  if (cat) cat.custom = list.length
}

function removeWord(category, index) {
  const list = kwWords.value[category]
  if (!list) return
  list.splice(index, 1)
  const cat = kwCategories.value.find((c) => c.name === category)
  if (cat) cat.custom = list.length
}

function openNewCategory() {
  const name = window.prompt('新类别名（会作为「命中原因」显示在评论列表里）')
  const trimmed = String(name || '').trim()
  if (!trimmed) return
  if (trimmed.length > KW_MAX) {
    kwError.value = `类别名不能超过 ${KW_MAX} 个字`
    return
  }
  if (kwCategories.value.some((c) => c.name === trimmed)) {
    kwError.value = '这个类别已经存在'
    return
  }
  kwError.value = ''
  kwCategories.value.push({ name: trimmed, baseline: false, disabled: false, custom: 0 })
  kwWords.value[trimmed] = []
}

async function loadKeywords() {
  try {
    const data = await fetchReviewKeywords()
    kwCategories.value = Array.isArray(data?.categories) ? data.categories : []
    structural.value = Array.isArray(data?.structural) ? data.structural : []
    const grouped = {}
    for (const row of data?.keywords || []) {
      if (!grouped[row.category]) grouped[row.category] = []
      grouped[row.category].push(row.text)
    }
    kwWords.value = grouped
  } catch (err) {
    kwError.value = err instanceof AdminApiError ? err.message : '加载词表失败，请重试'
  }
}

async function saveKeywords() {
  if (kwSaving.value) return
  kwSaving.value = true
  kwError.value = ''
  kwSaved.value = ''
  try {
    const keywords = []
    const disabled = []
    for (const cat of kwCategories.value) {
      if (cat.disabled) disabled.push(cat.name)
      for (const text of wordsOf(cat.name)) keywords.push({ text, category: cat.name })
    }
    const data = await saveReviewKeywords({ keywords, disabled })
    // 用服务端回的结果重建：去重后的真实状态才是"保存成功了什么"
    const grouped = {}
    for (const row of data?.keywords || []) {
      if (!grouped[row.category]) grouped[row.category] = []
      grouped[row.category].push(row.text)
    }
    kwWords.value = grouped
    for (const cat of kwCategories.value) cat.custom = (grouped[cat.name] || []).length
    kwSaved.value = '词表已保存'
    setTimeout(() => { kwSaved.value = '' }, 2000)
  } catch (err) {
    kwError.value = err instanceof AdminApiError ? err.message : '保存词表失败，请重试'
  } finally {
    kwSaving.value = false
  }
}

onMounted(() => {
  load()
  loadKeywords()
})

/* ── 词表导出 / 导入 ──────────────────────────────────────────
 *
 * 用途：本地配好一套词，搬到线上后台时不必手敲两遍
 * （本地库与生产库各存各的，配置不会自动同步）。
 *
 * 🔴 导入**只填进界面，不直接写库** —— 必须再点一次「保存词表」才生效。
 *    理由：选错文件会静默覆盖线上词表，而"先显示出来让人看一眼"是最低成本的保险。
 *    点取消/关页面就等于没导入。
 */

const importInput = ref(null)
const importHint = ref('')

/** 文件名里塞日期，便于区分多份导出 */
function keywordFileStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function exportKeywords() {
  const payload = {
    // 带版本号与用途标记：将来格式变了可以据此判断；也避免误当成别处的 JSON 导入
    format: 'myrzg-review-keywords',
    version: 1,
    exportedAt: new Date().toISOString(),
    keywords: kwCategories.value.flatMap((cat) =>
      wordsOf(cat.name).map((text) => ({ text, category: cat.name }))
    ),
    disabled: kwCategories.value.filter((c) => c.disabled).map((c) => c.name)
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `审核词表-${keywordFileStamp()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 立刻 revoke 部分浏览器来不及取数据，放到下一轮事件循环
  setTimeout(() => URL.revokeObjectURL(url), 0)
  importHint.value = `已导出 ${payload.keywords.length} 条自定义词`
}

function triggerImport() {
  importHint.value = ''
  importInput.value?.click()
}

/** 选完文件 → 解析 → **只填进界面** */
async function onImportFile(event) {
  const file = event.target.files?.[0]
  // 必须清空 input：否则连续选同一个文件不会再触发 change
  event.target.value = ''
  if (!file) return

  kwError.value = ''
  try {
    const text = await file.text()
    const data = JSON.parse(text)

    // 校验是我们的格式：不校验的话，随便一个 JSON 都会被当成"空词表"清空线上配置
    if (data?.format !== 'myrzg-review-keywords') {
      kwError.value = '这不是本页导出的词表文件（缺少 format 标记）'
      return
    }
    if (!Array.isArray(data.keywords) || !Array.isArray(data.disabled)) {
      kwError.value = '词表文件结构不对（keywords / disabled 必须是数组）'
      return
    }

    // 填进界面。已知或新类别都要能容纳，所以先补全类别列表
    const grouped = {}
    for (const row of data.keywords) {
      const text2 = String(row?.text ?? '').trim()
      const category = String(row?.category ?? '').trim()
      if (!text2 || !category) continue
      if (!grouped[category]) grouped[category] = []
      if (!grouped[category].includes(text2)) grouped[category].push(text2)
    }
    for (const name of Object.keys(grouped)) {
      if (!kwCategories.value.some((c) => c.name === name)) {
        kwCategories.value.push({ name, baseline: false, disabled: false, custom: 0 })
      }
    }
    kwWords.value = grouped

    const disabledSet = new Set(data.disabled.map((c) => String(c)))
    for (const cat of kwCategories.value) {
      cat.disabled = disabledSet.has(cat.name)
      cat.custom = (grouped[cat.name] || []).length
    }

    const total = Object.values(grouped).reduce((s, l) => s + l.length, 0)
    importHint.value = `已载入 ${total} 条自定义词、${data.disabled.length} 个停用类别 —— 确认无误后点「保存词表」才会写入`
  } catch (err) {
    kwError.value = `文件读取失败：${err.message}`
  }
}
</script>

<style scoped>
.admin-preset-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.admin-preset-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.admin-preset-index {
  width: 20px;
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 13px;
  text-align: right;
}

.admin-preset-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.admin-preset-count {
  color: var(--text-muted);
  font-size: 13px;
}

.admin-saved {
  color: #3f7d4e;
  font-size: 14px;
}

/* ── 审核词表 ── */
.admin-divider {
  margin: 28px 0 20px;
  border: 0;
  border-top: 1px solid var(--border-color, #d8cdb8);
}

.admin-hint--tight {
  margin-top: 4px;
}

.admin-kw-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.admin-kw-cat {
  padding: 10px 12px;
  border: 1px solid var(--border-color, #d8cdb8);
  border-radius: 6px;
}

.admin-kw-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.admin-kw-meta {
  color: var(--text-muted);
  font-size: 12px;
}

.admin-kw-off {
  color: #c98a3a;
  font-size: 12px;
}

.admin-kw-words {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.admin-kw-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 8px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 13px;
}

/* 内置词：灰底、无删除按钮 —— 视觉上就要和"自己加的"区分开 */
.admin-kw-chip--builtin {
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px dashed rgba(0, 0, 0, 0.15);
  color: var(--text-muted);
  cursor: default;
}

.admin-kw-strong {
  font-weight: 600;
}

.admin-kw-del {
  border: 0;
  background: none;
  padding: 0 2px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
}

.admin-kw-del:hover {
  color: #a33;
}

.admin-kw-input {
  width: 150px;
  flex: 0 0 auto;
}

/* 视觉上隐藏但仍可被脚本点击（导入用的 file input） */
.admin-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
