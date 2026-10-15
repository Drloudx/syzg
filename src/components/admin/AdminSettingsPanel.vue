<template>
  <section class="admin-workshop">
    <div class="workshop-header">
      <h1 class="workshop-title">
        <span class="workshop-title-star">✦</span>
        <span>系统设置</span>
      </h1>
      <p class="workshop-subtitle">
        ✦ 维护全站审核口径、转待审快捷预设原因与敏感词黑名单库（仅超管）
      </p>
    </div>

    <h2 class="admin-section-title">转待审 · 常用选项</h2>
    <p class="admin-hint">
      管理员在评论列表点「转待审」时，这些文案会作为点一下就填的快捷选项出现（仍可自由编辑）。
      顺序即显示顺序，留空的行会被忽略。删光就只保留自由输入。
    </p>

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
        <span v-if="savedMessage" class="admin-saved">✓ {{ savedMessage }}</span>
        <span v-if="errorMessage" class="admin-error">⚠ {{ errorMessage }}</span>
      </div>
    </template>

    <hr class="admin-divider" />

    <h2 class="admin-section-title">评论审核词表</h2>
    <p class="admin-hint">
      命中即让评论进待审（不是拒收），管理员在评论页可一键放行。
      每个类别<span class="admin-kw-strong">代码里已经有内置词</span>（灰底那些，一直生效），
      你可以停用整个类别，或另加自己的关键词。
    </p>



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
          <!--
            删除自建类别（2026-10-14 补）。
            🔴 **只对自建类别显示**：内置类别的词在代码基线里，删掉条目也会
               在下一次保存时"复活"（服务端按基线重建），所以删除对它们无意义 ——
               要让内置类别失效只能**停用**（`v-else` 那个分支没有这个按钮）。
            ⚠️ 删除是**改内存 + 需点保存才落库**（与导入一致），不是立即生效。
          -->
          <button
            v-if="!cat.baseline"
            type="button"
            class="admin-kw-cat-del"
            :title="`删除自建类别「${cat.name}」`"
            @click.prevent.stop="askRemoveCategory(cat.name)"
          >
            ✕
          </button>
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
      <span v-if="kwSaved" class="admin-saved">✓ {{ kwSaved }}</span>
      <span v-if="kwError" class="admin-error">⚠ {{ kwError }}</span>
    </div>
    <p v-if="importHint" class="admin-hint admin-hint--tight admin-import-hint">{{ importHint }}</p>

    <!-- 新建类别弹窗（替代原生 window.prompt） -->
    <UiModal
      :visible="newCategoryModal"
      teleport-to="body"
      title="新建敏感词类别"
      max-width="480px"
      @update:visible="(v) => { if (!v) closeNewCategory() }"
    >
      <p class="admin-modal-lead">新类别名（会作为「命中原因」显示在评论列表中）：</p>
      <input
        v-model="newCategoryInput"
        type="text"
        class="admin-input admin-modal-input"
        placeholder="例如：广告引流 / 涉政 / 违规外链"
        :maxlength="KW_MAX"
        @keydown.enter.prevent="confirmNewCategory"
      />
      <div class="admin-modal-count">{{ newCategoryInput.length }} / {{ KW_MAX }}</div>
      <p v-if="newCategoryError" style="margin-top: 8px; color: #b83232; font-size: 13px;">
        {{ newCategoryError }}
      </p>

      <template #footer>
        <button type="button" class="admin-btn admin-btn--ghost" @click="closeNewCategory">取消</button>
        <button type="button" class="admin-btn" @click="confirmNewCategory">确认创建</button>
      </template>
    </UiModal>

    <!-- 删除自建类别的确认弹窗（2026-10-14 补） -->
    <UiModal
      :visible="removeTarget !== null"
      teleport-to="body"
      title="删除自建类别"
      max-width="480px"
      @update:visible="(v) => { if (!v) cancelRemoveCategory() }"
    >
      <p class="admin-modal-lead">
        删除类别 <strong>{{ removeTarget }}</strong>？
      </p>
      <p class="admin-modal-quote">
        {{
          (kwWords[removeTarget] || []).length > 0
            ? `该类别下的 ${(kwWords[removeTarget] || []).length} 条自定义词会一并删除。`
            : '该类别下没有自定义词。'
        }}
        删除后需点「保存词表」才真正生效，之前可以取消。
      </p>

      <template #footer>
        <button type="button" class="admin-btn admin-btn--ghost" @click="cancelRemoveCategory">取消</button>
        <button type="button" class="admin-btn admin-btn--danger" @click="confirmRemoveCategory">确认删除</button>
      </template>
    </UiModal>
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

import UiModal from '../ui/UiModal.vue'
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

const newCategoryModal = ref(false)
const newCategoryInput = ref('')
const newCategoryError = ref('')

function openNewCategory() {
  newCategoryInput.value = ''
  newCategoryError.value = ''
  newCategoryModal.value = true
}

function closeNewCategory() {
  newCategoryModal.value = false
  newCategoryInput.value = ''
  newCategoryError.value = ''
}

/* ── 删除自建类别 ────────────────────────────
 *
 * 没有删除时，建错了只能停用（停用会保留条目，且仍占着自定义词计数上限）。
 *
 * 🔴 三条约束：
 *   1. **只对自建类别可用**：内置类别的词在代码基线里，删掉条目也会在下次
 *      保存时被服务端按基线重建（等于"删了又回来"），故按钮只对 `!baseline` 渲染。
 *   2. **必须确认**：会连带删掉该类别的所有自定义词。
 *   3. **只改内存，不直接落库**：与「导入」的口径一致 —— 点「保存词表」才生效。
 *      这样误删还能靠"不保存"挽回。
 */
const removeTarget = ref(null)

function askRemoveCategory(name) {
  removeTarget.value = name
}

function cancelRemoveCategory() {
  removeTarget.value = null
}

function confirmRemoveCategory() {
  const name = removeTarget.value
  if (!name) return
  const cat = kwCategories.value.find((c) => c.name === name)
  // 二次兜底：即使 UI 被绕过，也不许删内置类别
  if (cat && cat.baseline) {
    kwError.value = '内置类别不能删除，请改用「停用」'
    removeTarget.value = null
    return
  }
  kwCategories.value = kwCategories.value.filter((c) => c.name !== name)
  delete kwWords.value[name]
  kwError.value = ''
  removeTarget.value = null
}

function confirmNewCategory() {
  const trimmed = newCategoryInput.value.trim()
  if (!trimmed) {
    newCategoryError.value = '类别名不能为空'
    return
  }
  if (trimmed.length > KW_MAX) {
    newCategoryError.value = `类别名不能超过 ${KW_MAX} 个字`
    return
  }
  if (kwCategories.value.some((c) => c.name === trimmed)) {
    newCategoryError.value = '这个类别已经存在'
    return
  }
  newCategoryError.value = ''
  kwCategories.value.push({ name: trimmed, baseline: false, disabled: false, custom: 0 })
  kwWords.value[trimmed] = []
  closeNewCategory()
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
.admin-workshop {
  --wood-border: #7a5c3d;
  --gold-border: rgba(143, 115, 81, 0.45);
  --gold-accent: #c5913e;
  --gold-bright: #ffd78c;
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
}

.workshop-header {
  border-bottom: 1.5px solid var(--gold-border);
  padding-bottom: 14px;
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

.admin-preset-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1.5px solid rgba(143, 115, 81, 0.35);
  border-radius: 6px;
  background: var(--paper-card);
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
  font-family: ui-monospace, monospace;
}

.admin-preset-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}

.admin-preset-count {
  color: var(--text-muted);
  font-size: 13px;
  font-family: ui-monospace, monospace;
}

.admin-saved {
  color: #287a4c;
  font-size: 13px;
  font-weight: 600;
}

/* ── 审核词表 ── */
.admin-divider {
  margin: 20px 0 14px;
  border: 0;
  border-top: 1.5px dashed var(--gold-border);
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
  padding: 12px 14px;
  border: 1.5px solid rgba(143, 115, 81, 0.35);
  border-radius: 6px;
  background: var(--paper-card);
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

/*
 * 删除自建类别的按钮（2026-10-14）。
 * 用 `margin-left: auto` 推到行尾，避免与类别名/计数挤在一起；
 * 悬停才显红，平时低调 —— 它是破坏性操作，不该抢视觉焦点。
 */
.admin-kw-cat-del {
  margin-left: auto;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}
.admin-kw-cat-del:hover {
  color: #b83232;
  border-color: rgba(184, 50, 50, 0.4);
  background: rgba(184, 50, 50, 0.08);
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
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(143, 115, 81, 0.12);
  border: 1px solid rgba(143, 115, 81, 0.3);
  color: var(--text-main);
  font-size: 13px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  transition: all 0.15s ease;
}

/* 内置词：灰底、无删除按钮 —— 视觉上就要和"自己加的"区分开 */
.admin-kw-chip--builtin {
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.04);
  border: 1px dashed rgba(143, 115, 81, 0.35);
  color: var(--text-muted);
  cursor: default;
}

.dark-mode .admin-kw-chip {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(143, 115, 81, 0.35);
  color: #e8dbc3;
}

.dark-mode .admin-kw-chip--builtin {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(143, 115, 81, 0.25);
  color: #ab9274;
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
  line-height: 1;
}

.admin-kw-del:hover {
  color: #b83232;
}

.admin-kw-input {
  width: 140px;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 12px;
  font-size: 12.5px;
  border-radius: 999px;
  background: #ffffff;
  border: 1.5px dashed rgba(143, 115, 81, 0.55);
  color: var(--text-main);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03);
  transition: all 0.18s ease;
}

.admin-kw-input:focus {
  width: 175px;
  border-style: solid;
  border-color: #c5913e;
  box-shadow: 0 0 0 2px rgba(197, 145, 62, 0.22);
}

.dark-mode .admin-kw-input {
  background: #251b12;
  border-color: rgba(143, 115, 81, 0.5);
  color: #e8dbc3;
}

.dark-mode .admin-kw-input:focus {
  background: #1c140d;
  border-color: #ffd78c;
  box-shadow: 0 0 0 2px rgba(255, 215, 140, 0.2);
}

.admin-modal-input {
  width: 100% !important;
  box-sizing: border-box !important;
  display: block;
  height: 40px;
  font-size: 14px;
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

@media (max-width: 900px) {
  .admin-preset-line {
    flex-wrap: wrap;
    gap: 4px;
  }
  .admin-preset-actions {
    flex-wrap: wrap;
    gap: 8px;
  }
  .admin-kw-head {
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
