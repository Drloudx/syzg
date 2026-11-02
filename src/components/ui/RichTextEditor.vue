<template>
  <div class="rich-editor" :class="{ 'is-fullscreen': isFullscreen }">
    <!-- 顶部木质工具栏 -->
    <div v-if="editor" class="rich-toolbar">
      <!-- 撤回与重做 -->
      <button
        type="button"
        class="rich-tool-btn"
        title="撤销 (Ctrl+Z)"
        :disabled="!editor.can().undo()"
        @click="editor.chain().focus().undo().run()"
      >
        <span class="rich-icon">↶</span>
      </button>
      <button
        type="button"
        class="rich-tool-btn"
        title="重做 (Ctrl+Y)"
        :disabled="!editor.can().redo()"
        @click="editor.chain().focus().redo().run()"
      >
        <span class="rich-icon">↷</span>
      </button>

      <span class="rich-tool-sep" />

      <!-- 粗体、斜体、下划线、删除线、行内代码 -->
      <button
        type="button"
        class="rich-tool-btn font-bold"
        :class="{ 'is-active': editor.isActive('bold') }"
        title="加粗 (Ctrl+B，再次点击取消)"
        @click="editor.chain().focus().toggleBold().run()"
      >
        B
      </button>
      <button
        type="button"
        class="rich-tool-btn font-italic"
        :class="{ 'is-active': editor.isActive('italic') }"
        title="倾斜 (Ctrl+I，再次点击取消)"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        I
      </button>
      <button
        type="button"
        class="rich-tool-btn font-underline"
        :class="{ 'is-active': editor.isActive('underline') }"
        title="下划线 (Ctrl+U，再次点击取消)"
        @click="editor.chain().focus().toggleUnderline().run()"
      >
        U
      </button>
      <button
        type="button"
        class="rich-tool-btn font-strike"
        :class="{ 'is-active': editor.isActive('strike') }"
        title="删除线"
        @click="editor.chain().focus().toggleStrike().run()"
      >
        S
      </button>
      <button
        type="button"
        class="rich-tool-btn font-code"
        :class="{ 'is-active': editor.isActive('code') }"
        title="行内代码标记"
        @click="editor.chain().focus().toggleCode().run()"
      >
        &lt;/&gt;
      </button>

      <span class="rich-tool-sep" />

      <!-- 文字全色盘选择器 -->
      <div class="rich-dropdown-wrap" @click.stop>
        <button
          type="button"
          class="rich-tool-btn rich-dropdown-trigger"
          :class="{ 'is-active': !!currentColor }"
          title="文本颜色"
          @click="toggleDropdown('color')"
        >
          <span
            class="rich-color-preview-bar"
            :style="{ background: currentColor || '#3e2a14' }"
          />
          <span class="rich-btn-text">字色</span>
          <span class="rich-caret">▾</span>
        </button>

        <!-- 现代专业多色阶色盘下拉面板 -->
        <div v-if="activeDropdown === 'color'" class="rich-popover rich-palette-popover" @mousedown.stop @click.stop>
          <div class="rich-popover-title">常用色谱</div>
          <div class="rich-palette-matrix">
            <div v-for="(row, rIdx) in FULL_COLOR_PALETTE" :key="rIdx" class="rich-palette-row">
              <button
                v-for="color in row"
                :key="color"
                type="button"
                class="rich-palette-cell"
                :style="{ background: color }"
                :title="color"
                @click="applyTextColor(color)"
              />
            </div>
          </div>

          <div class="rich-popover-footer">
            <label class="rich-custom-color-btn" title="自定义任意颜色">
              <input
                type="color"
                :value="currentColor || '#c5913e'"
                class="rich-native-color-picker"
                @input="applyTextColor($event.target.value)"
              />
              <span class="rich-color-rainbow-icon">🎨</span>
              <span>自定义取色</span>
            </label>
            <button
              type="button"
              class="rich-btn-clear"
              title="清除颜色，恢复默认"
              @click="clearTextColor"
            >
              清除颜色
            </button>
          </div>
        </div>
      </div>

      <!-- 字号调节 -->
      <div class="rich-dropdown-wrap" @click.stop>
        <button
          type="button"
          class="rich-tool-btn rich-dropdown-trigger"
          :class="{ 'is-active': activeDropdown === 'fontSize' || currentFontSize !== '字号' }"
          title="文字大小"
          @click="toggleDropdown('fontSize')"
        >
          <span class="rich-btn-text">{{ currentFontSize }}</span>
          <span class="rich-caret">▾</span>
        </button>

        <div v-if="activeDropdown === 'fontSize'" class="rich-popover rich-fontsize-popover" @mousedown.stop @click.stop>
          <div class="rich-popover-title">字号</div>
          <div class="rich-fontsize-list">
            <button
              v-for="size in FONT_SIZE_OPTIONS"
              :key="size"
              type="button"
              class="rich-fontsize-item"
              :class="{ 'is-active': currentFontSize === size }"
              @click="applyFontSize(size)"
            >
              <span>{{ size }}</span>
            </button>
          </div>
          <button
            type="button"
            class="rich-btn-clear"
            style="width: 100%; margin-top: 6px;"
            @click="clearFontSize"
          >
            恢复默认 (14px)
          </button>
        </div>
      </div>

      <!-- 行间距调节 (直接显示纯数字，如 1.2 1.4 1.5 1.7) -->
      <div class="rich-dropdown-wrap" @click.stop>
        <button
          type="button"
          class="rich-tool-btn rich-dropdown-trigger"
          :class="{ 'is-active': activeDropdown === 'lineHeight' }"
          title="段落行间距"
          @click="toggleDropdown('lineHeight')"
        >
          <span class="rich-icon-lineheight">↕</span>
          <span class="rich-btn-text">行距</span>
          <span class="rich-caret">▾</span>
        </button>

        <div v-if="activeDropdown === 'lineHeight'" class="rich-popover rich-lineheight-popover" @mousedown.stop @click.stop>
          <div class="rich-popover-title">行间距</div>
          <div class="rich-lineheight-list">
            <button
              v-for="val in LINE_HEIGHT_OPTIONS"
              :key="val"
              type="button"
              class="rich-lineheight-item"
              @click="applyLineHeight(val)"
            >
              <span class="rich-lineheight-num">{{ val }}</span>
            </button>
          </div>
          <button
            type="button"
            class="rich-btn-clear"
            style="width: 100%; margin-top: 6px;"
            @click="clearLineHeight"
          >
            恢复默认 (1.5)
          </button>
        </div>
      </div>

      <span class="rich-tool-sep" />

      <!-- 标题层级 -->
      <div class="rich-dropdown-wrap" @click.stop>
        <button
          type="button"
          class="rich-tool-btn"
          :class="{ 'is-active': editor.isActive('heading') }"
          title="段落与标题"
          @click="toggleDropdown('heading')"
        >
          <span>{{ currentHeadingLabel }}</span>
          <span class="rich-caret">▾</span>
        </button>
        <div v-if="activeDropdown === 'heading'" class="rich-popover rich-heading-popover" @mousedown.stop @click.stop>
          <button
            type="button"
            class="rich-heading-item p"
            :class="{ 'is-active': !editor.isActive('heading') }"
            @click="editor.chain().focus().setParagraph().run(); activeDropdown = null"
          >
            正文段落
          </button>
          <button
            type="button"
            class="rich-heading-item h1"
            :class="{ 'is-active': editor.isActive('heading', { level: 1 }) }"
            @click="editor.chain().focus().toggleHeading({ level: 1 }).run(); activeDropdown = null"
          >
            大标题 (H1)
          </button>
          <button
            type="button"
            class="rich-heading-item h2"
            :class="{ 'is-active': editor.isActive('heading', { level: 2 }) }"
            @click="editor.chain().focus().toggleHeading({ level: 2 }).run(); activeDropdown = null"
          >
            中标题 (H2)
          </button>
          <button
            type="button"
            class="rich-heading-item h3"
            :class="{ 'is-active': editor.isActive('heading', { level: 3 }) }"
            @click="editor.chain().focus().toggleHeading({ level: 3 }).run(); activeDropdown = null"
          >
            小标题 (H3)
          </button>
        </div>
      </div>

      <!-- 对齐方式 -->
      <button
        type="button"
        class="rich-tool-btn"
        :class="{ 'is-active': editor.isActive({ textAlign: 'left' }) }"
        title="居左对齐"
        @click="editor.chain().focus().setTextAlign('left').run()"
      >
        ≡
      </button>
      <button
        type="button"
        class="rich-tool-btn"
        :class="{ 'is-active': editor.isActive({ textAlign: 'center' }) }"
        title="居中对齐"
        @click="editor.chain().focus().setTextAlign('center').run()"
      >
        ≂
      </button>
      <button
        type="button"
        class="rich-tool-btn"
        :class="{ 'is-active': editor.isActive({ textAlign: 'right' }) }"
        title="居右对齐"
        @click="editor.chain().focus().setTextAlign('right').run()"
      >
        ≣
      </button>

      <span class="rich-tool-sep" />

      <!-- 列表与引用 -->
      <button
        type="button"
        class="rich-tool-btn"
        :class="{ 'is-active': editor.isActive('bulletList') }"
        title="无序列表 (圆点)"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        • 列表
      </button>
      <button
        type="button"
        class="rich-tool-btn"
        :class="{ 'is-active': editor.isActive('orderedList') }"
        title="有序列表 (数字)"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        1. 列表
      </button>
      <button
        type="button"
        class="rich-tool-btn"
        :class="{ 'is-active': editor.isActive('blockquote') }"
        title="引用/提示框"
        @click="editor.chain().focus().toggleBlockquote().run()"
      >
        引用
      </button>
      <button
        type="button"
        class="rich-tool-btn"
        title="分割线"
        @click="editor.chain().focus().setHorizontalRule().run()"
      >
        分割线
      </button>

      <span class="rich-tool-sep" />

      <!-- 美化内联悬浮链接弹窗 -->
      <div class="rich-dropdown-wrap" @click.stop>
        <button
          type="button"
          class="rich-tool-btn"
          :class="{ 'is-active': editor.isActive('link') }"
          title="插入或编辑链接"
          @click="openLinkPopover"
        >
          <span>🔗 链接</span>
        </button>

        <div v-if="activeDropdown === 'link'" class="rich-popover rich-link-popover" @mousedown.stop @click.stop>
          <div class="rich-popover-title">插入 / 编辑超链接</div>
          <div class="rich-link-field">
            <span class="rich-link-label">链接地址:</span>
            <input
              ref="linkInputRef"
              v-model="linkForm.href"
              type="text"
              class="rich-link-input"
              placeholder="https://... 或站内 /heroes"
              @keydown.enter.prevent="saveLink"
            />
          </div>
          <div v-if="linkForm.needText" class="rich-link-field">
            <span class="rich-link-label">显示文字:</span>
            <input
              v-model="linkForm.text"
              type="text"
              class="rich-link-input"
              placeholder="链接显示的标题"
              @keydown.enter.prevent="saveLink"
            />
          </div>

          <div class="rich-link-actions">
            <button
              v-if="editor.isActive('link')"
              type="button"
              class="rich-btn-danger"
              @click="removeLink"
            >
              移除链接
            </button>
            <a
              v-if="editor.isActive('link') && linkForm.href"
              :href="linkForm.href"
              target="_blank"
              class="rich-link-test-btn"
              title="新窗口预览测试打开"
            >
              测试打开 ↗
            </a>
            <button type="button" class="rich-btn-primary" @click="saveLink">
              确定
            </button>
          </div>
        </div>
      </div>

      <!-- 清除格式 -->
      <button
        type="button"
        class="rich-tool-btn rich-tool-btn--clear"
        title="清除选中文字的全部格式"
        @click="clearAllFormats"
      >
        <span class="rich-icon">T⃠</span>
        <span>清除格式</span>
      </button>

      <!-- 弹性占位 -->
      <div class="rich-toolbar-spacer" />

      <!-- 字数统计 -->
      <div class="rich-counter">
        <span>共 {{ characterCount }} 字</span>
      </div>

      <!-- 全屏沉浸编辑切换 -->
      <button
        type="button"
        class="rich-tool-btn rich-tool-btn--fullscreen"
        :title="isFullscreen ? '退出全屏' : '全屏沉浸编辑'"
        @click="isFullscreen = !isFullscreen"
      >
        {{ isFullscreen ? '⤢ 退出全屏' : '⛶ 全屏' }}
      </button>
    </div>

    <!-- 真实所见即所得编辑器容器 (羊皮纸古卷底色) -->
    <div
      class="rich-editor-scroll"
      :style="{ minHeight: isFullscreen ? '72vh' : (rows * 26 + 'px') }"
      @click="focusEditor"
    >
      <EditorContent :editor="editor" class="rich-tiptap-content" />
    </div>

    <!-- 底部状态说明 -->
    <div class="rich-footer-hints">
      <span class="rich-hint-desc">Ctrl+Z 撤销、Ctrl+Y 重做、Ctrl+B 加粗、Ctrl+I 倾斜、Ctrl+U 下划线</span>
      <span v-if="isFullscreen" class="rich-fullscreen-tip">按 Esc 或右上角按钮可退出全屏</span>
    </div>
  </div>
</template>

<script setup>
/**
 * 现代工业级所见即所得编辑器（TipTap 核心全功能版）。
 *
 * 覆盖：加粗、倾斜、下划线、删除线、行内代码、全色盘矩阵、背景高亮荧光笔、
 * 对齐方式、多级标题、有序/无序列表、引用、分割线、美化内联链接、撤销重做。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Extension } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style'
import { Underline } from '@tiptap/extension-underline'
import { TextAlign } from '@tiptap/extension-text-align'
import { Link } from '@tiptap/extension-link'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '输入公告正文内容…' },
  rows: { type: Number, default: 12 }
})
const emit = defineEmits(['update:modelValue'])

const activeDropdown = ref(null) // 'color' | 'fontSize' | 'lineHeight' | 'heading' | 'link'
const isFullscreen = ref(false)
const linkInputRef = ref(null)

const linkForm = ref({
  href: '',
  text: '',
  needText: false
})

// ==================== 专业多色阶调色板 ====================
const FULL_COLOR_PALETTE = [
  ['#000000', '#2d3748', '#4a5568', '#718096', '#a0aec0', '#ffffff'],
  ['#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171'],
  ['#78350f', '#92400e', '#b45309', '#d97706', '#f59e0b', '#fbbf24'],
  ['#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80'],
  ['#134e4a', '#115e59', '#0f766e', '#0d9488', '#14b8a6', '#2dd4bf'],
  ['#1e3a8a', '#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa'],
  ['#581c87', '#6b21a8', '#7e22ce', '#9333ea', '#a855f7', '#c084fc'],
  ['#831843', '#9d174d', '#be185d', '#db2777', '#ec4899', '#f472b6']
]

// ==================== 字号预设选项 ====================
const FONT_SIZE_OPTIONS = [
  '12px',
  '13px',
  '14px',
  '16px',
  '18px',
  '20px',
  '24px',
  '28px',
  '32px'
]

// ==================== 行间距预设选项 (纯数字) ====================
const LINE_HEIGHT_OPTIONS = ['1.2', '1.4', '1.5', '1.7', '2.0', '2.4']

// 自定义段落与标题级行间距扩展
const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() {
    return {
      types: ['paragraph', 'heading', 'listItem']
    }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {}
              return { style: `line-height: ${attributes.lineHeight}` }
            }
          }
        }
      }
    ]
  },
  addCommands() {
    return {
      setLineHeight:
        (lineHeight) =>
        ({ commands }) => {
          return this.options.types.some((type) =>
            commands.updateAttributes(type, { lineHeight })
          )
        },
      unsetLineHeight:
        () =>
        ({ commands }) => {
          return this.options.types.some((type) =>
            commands.resetAttributes(type, 'lineHeight')
          )
        }
    }
  }
})

// ==================== TipTap 引擎初始化 ====================
const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
      underline: false
    }),
    TextStyle,
    Color,
    FontSize,
    Underline,
    LineHeight,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'rich-link',
        rel: 'noopener noreferrer'
      }
    })
  ],
  onUpdate: () => {
    if (!editor.value) return
    const html = editor.value.getHTML()
    emit('update:modelValue', html)
  }
})

// 监听外部 modelValue 同步
watch(
  () => props.modelValue,
  (val) => {
    if (!editor.value) return
    const current = editor.value.getHTML()
    if (current !== (val || '')) {
      editor.value.commands.setContent(val || '', false)
    }
  }
)

function focusEditor() {
  if (editor.value && !editor.value.isFocused) {
    editor.value.commands.focus()
  }
}

function toggleDropdown(name) {
  if (activeDropdown.value === name) {
    activeDropdown.value = null
  } else {
    activeDropdown.value = name
  }
}

// ==================== 字体颜色操作 ====================
const currentColor = computed(() => {
  if (!editor.value) return ''
  return editor.value.getAttributes('textStyle').color || ''
})

function applyTextColor(hex) {
  if (!editor.value) return
  editor.value.chain().focus().setColor(hex).run()
  activeDropdown.value = null
}

function clearTextColor() {
  if (!editor.value) return
  editor.value.chain().focus().unsetColor().run()
  activeDropdown.value = null
}

// ==================== 字号大小操作 ====================
const currentFontSize = computed(() => {
  if (!editor.value) return '字号'
  return editor.value.getAttributes('textStyle').fontSize || '字号'
})

function applyFontSize(size) {
  if (!editor.value) return
  editor.value.chain().focus().setFontSize(size).run()
  activeDropdown.value = null
}

function clearFontSize() {
  if (!editor.value) return
  editor.value.chain().focus().unsetFontSize().run()
  activeDropdown.value = null
}

// ==================== 行间距操作 ====================
function applyLineHeight(lh) {
  if (!editor.value) return
  editor.value.chain().focus().setLineHeight(lh).run()
  activeDropdown.value = null
}

function clearLineHeight() {
  if (!editor.value) return
  editor.value.chain().focus().unsetLineHeight().run()
  activeDropdown.value = null
}

// ==================== 标题层级 ====================
const currentHeadingLabel = computed(() => {
  if (!editor.value) return '正文'
  if (editor.value.isActive('heading', { level: 1 })) return '大标题 (H1)'
  if (editor.value.isActive('heading', { level: 2 })) return '中标题 (H2)'
  if (editor.value.isActive('heading', { level: 3 })) return '小标题 (H3)'
  return '正文'
})

// ==================== 美化内联链接交互 ====================
function openLinkPopover() {
  if (!editor.value) return
  const attrs = editor.value.getAttributes('link')
  const { from, to } = editor.value.state.selection
  const selectedText = editor.value.state.doc.textBetween(from, to, ' ')

  linkForm.value = {
    href: attrs.href || '',
    text: selectedText || '',
    needText: from === to // 光标未选中文本时，需要提供文本
  }
  activeDropdown.value = 'link'
  nextTick(() => {
    if (linkInputRef.value) {
      linkInputRef.value.focus()
      linkInputRef.value.select()
    }
  })
}

function saveLink() {
  if (!editor.value) return
  const href = linkForm.value.href.trim()
  if (!href) {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    activeDropdown.value = null
    return
  }

  if (linkForm.value.needText && linkForm.value.text.trim()) {
    // 未选中文字，直接插入带链接的文本
    editor.value
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text: linkForm.value.text.trim(),
        marks: [{ type: 'link', attrs: { href } }]
      })
      .run()
  } else {
    // 已有选区，包裹链接
    editor.value.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }
  activeDropdown.value = null
}

function removeLink() {
  if (!editor.value) return
  editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
  activeDropdown.value = null
}

// ==================== 清除全部格式 ====================
function clearAllFormats() {
  if (!editor.value) return
  editor.value.chain().focus().unsetAllMarks().clearNodes().run()
}

// 字数统计
const characterCount = computed(() => {
  if (!editor.value) return 0
  return editor.value.getText().replace(/\s+/g, '').length
})

// 全局监听关闭下拉
function onDocPointerDown(e) {
  const t = e?.target
  if (t && typeof t.closest === 'function') {
    if (t.closest('.rich-dropdown-wrap')) return
  }
  activeDropdown.value = null
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    if (activeDropdown.value) {
      activeDropdown.value = null
    } else if (isFullscreen.value) {
      isFullscreen.value = false
    }
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('mousedown', onDocPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
  }
})

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy()
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('mousedown', onDocPointerDown, true)
    window.removeEventListener('keydown', onKeyDown)
  }
})
</script>

<style scoped>
.rich-editor {
  border: 1.5px solid rgba(122, 92, 61, 0.4);
  border-radius: 6px;
  background: #fdfbf7;
  display: flex;
  flex-direction: column;
  transition: all 0.2s ease;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
}

.rich-editor:focus-within {
  border-color: #c5913e;
  box-shadow: 0 0 0 2px rgba(197, 145, 62, 0.25);
}

/* 全屏沉浸模式 */
.rich-editor.is-fullscreen {
  position: fixed;
  top: 16px;
  left: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 10001;
  background: #fdfbf7;
  border: 2px solid #7a5c3d;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

/* 工具栏 */
.rich-toolbar {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(143, 115, 81, 0.25);
  background: rgba(143, 115, 81, 0.08);
  flex-wrap: wrap;
}

.rich-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 28px;
  height: 28px;
  padding: 0 7px;
  font-size: 13px;
  font-weight: 600;
  color: #4a341c;
  background: #fffdf8;
  border: 1px solid rgba(143, 115, 81, 0.35);
  border-radius: 4px;
  cursor: pointer;
  line-height: 1;
  transition: all 0.15s ease;
}

.rich-tool-btn:hover:not(:disabled) {
  background: #f4ecdc;
  border-color: #b08d5e;
  color: #2b1b0d;
}

/* 按钮激活态：温润羊皮纸微凹高亮 */
.rich-tool-btn.is-active {
  background: #e8d7be !important;
  border-color: #a87f4c !important;
  color: #3b220d !important;
  box-shadow: inset 0 1.5px 3px rgba(80, 50, 20, 0.2);
  font-weight: 800;
}

.rich-tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: #f5f2eb;
  border-color: rgba(143, 115, 81, 0.2);
}

.rich-tool-sep {
  width: 1px;
  height: 18px;
  background: rgba(143, 115, 81, 0.25);
  margin: 0 2px;
}

.font-bold {
  font-weight: 800;
  font-family: serif;
}

.font-italic {
  font-style: italic;
  font-family: serif;
}

.font-underline {
  text-decoration: underline;
  font-family: serif;
}

.font-strike {
  text-decoration: line-through;
}

.font-code {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: -0.5px;
}

.rich-icon {
  font-size: 15px;
  line-height: 1;
}

.rich-highlight-icon {
  font-size: 13px;
}

.rich-btn-text {
  font-size: 12px;
}

/* 下拉菜单包裹容器 */
.rich-dropdown-wrap {
  position: relative;
}

.rich-caret {
  font-size: 9px;
  opacity: 0.65;
  margin-left: 1px;
}

.rich-color-preview-bar {
  width: 12px;
  height: 4px;
  border-radius: 1px;
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.4);
}

/* 统一复古古卷悬浮弹出面板 (Popover) */
.rich-popover {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  z-index: 200;
  background: #fffdf8;
  border: 1.5px solid #7a5c3d;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  padding: 10px 12px;
  box-sizing: border-box;
}

.rich-popover-title {
  font-size: 11.5px;
  font-weight: 700;
  color: #755c3f;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px dashed rgba(143, 115, 81, 0.3);
}

/* 调色盘矩阵 */
.rich-palette-popover {
  width: 200px;
}

.rich-palette-matrix {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rich-palette-row {
  display: flex;
  gap: 3px;
}

.rich-palette-cell {
  width: 24px;
  height: 20px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s, box-shadow 0.1s;
}

.rich-palette-cell:hover {
  transform: scale(1.18);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  z-index: 10;
}

.rich-popover-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(143, 115, 81, 0.3);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rich-custom-color-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #4a341c;
  cursor: pointer;
  position: relative;
}

.rich-native-color-picker {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.rich-btn-clear {
  padding: 3px 8px;
  font-size: 11px;
  color: #8b0000;
  background: rgba(139, 0, 0, 0.06);
  border: 1px solid rgba(139, 0, 0, 0.25);
  border-radius: 3px;
  cursor: pointer;
}

.rich-btn-clear:hover {
  background: rgba(139, 0, 0, 0.12);
}

/* 字号选择面板 */
.rich-fontsize-popover {
  width: 140px;
  padding: 8px;
}

.rich-fontsize-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  max-height: 190px;
  overflow-y: auto;
}

.rich-fontsize-item {
  padding: 5px 6px;
  border: 1px solid rgba(143, 115, 81, 0.2);
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  text-align: center;
  color: #3e2a14;
  font-family: ui-monospace, monospace;
}

.rich-fontsize-item:hover,
.rich-fontsize-item.is-active {
  background: #f4ecdc;
  border-color: #c5913e;
  color: #8f5a1a;
  font-weight: 700;
}

/* 行间距面板 (WPS 风格纯数字) */
.rich-lineheight-popover {
  width: 120px;
  padding: 8px;
}

.rich-lineheight-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rich-lineheight-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px 8px;
  border: 1px solid rgba(143, 115, 81, 0.2);
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  font-family: ui-monospace, monospace;
  font-weight: 700;
  color: #3e2a14;
}

.rich-lineheight-item:hover {
  background: #f4ecdc;
  border-color: #c5913e;
  color: #c5913e;
}

.rich-icon-lineheight {
  font-size: 13px;
  font-weight: bold;
}

/* 标题下拉 */
.rich-heading-popover {
  width: 130px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rich-heading-item {
  padding: 6px 8px;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 4px;
  font-size: 13px;
  color: #3e2a14;
  cursor: pointer;
}

.rich-heading-item:hover,
.rich-heading-item.is-active {
  background: #f4ecdc;
  font-weight: 700;
}

.rich-heading-item.h1 {
  font-size: 15px;
  font-weight: 800;
}

.rich-heading-item.h2 {
  font-size: 14px;
  font-weight: 700;
}

.rich-heading-item.h3 {
  font-size: 13px;
  font-weight: 600;
}

/* 美化内嵌链接面板 */
.rich-link-popover {
  width: 290px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rich-link-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rich-link-label {
  font-size: 11px;
  font-weight: 600;
  color: #755c3f;
}

.rich-link-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid rgba(143, 115, 81, 0.4);
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  color: #2b1b0d;
  outline: none;
  box-sizing: border-box;
}

.rich-link-input:focus {
  border-color: #c5913e;
  box-shadow: 0 0 0 2px rgba(197, 145, 62, 0.2);
}

.rich-link-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.rich-btn-primary {
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #c5913e;
  border: 1px solid #996e2a;
  border-radius: 4px;
  cursor: pointer;
}

.rich-btn-primary:hover {
  background: #b08134;
}

.rich-btn-danger {
  padding: 4px 8px;
  font-size: 11.5px;
  color: #8b0000;
  background: rgba(139, 0, 0, 0.06);
  border: 1px solid rgba(139, 0, 0, 0.25);
  border-radius: 4px;
  cursor: pointer;
}

.rich-link-test-btn {
  font-size: 11.5px;
  color: #2563eb;
  text-decoration: underline;
  cursor: pointer;
  margin-right: auto;
}

.rich-tool-btn--clear {
  color: #8b0000;
  border-color: rgba(139, 0, 0, 0.25);
}

.rich-toolbar-spacer {
  flex: 1;
}

.rich-counter {
  font-size: 12px;
  color: #755c3f;
  margin-right: 6px;
  font-family: ui-monospace, monospace;
}

/* 编辑器滚动容器 */
.rich-editor-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 18px 24px;
  background: #fffdfa;
  cursor: text;
}

/* TipTap 编辑核心样式定制 */
:deep(.rich-tiptap-content .ProseMirror) {
  min-height: 200px;
  outline: none;
  font-size: 14.5px;
  line-height: 1.5;
  color: #2b1b0d;
  font-synthesis: style weight;
}

:deep(.rich-tiptap-content .ProseMirror em),
:deep(.rich-tiptap-content .ProseMirror i) {
  font-style: italic;
  font-synthesis: style !important;
}

:deep(.rich-tiptap-content .ProseMirror strong),
:deep(.rich-tiptap-content .ProseMirror b) {
  font-weight: 700;
  font-synthesis: weight !important;
}

:deep(.rich-tiptap-content .ProseMirror p) {
  margin: 0.5em 0;
}

:deep(.rich-tiptap-content .ProseMirror h1) {
  font-size: 20px;
  font-weight: 800;
  color: #2b1b0d;
  margin: 0.8em 0 0.4em 0;
  border-bottom: 1.5px dashed rgba(143, 115, 81, 0.35);
  padding-bottom: 5px;
}

:deep(.rich-tiptap-content .ProseMirror h2) {
  font-size: 17.5px;
  font-weight: 800;
  color: #3e2a14;
  margin: 0.7em 0 0.3em 0;
}

:deep(.rich-tiptap-content .ProseMirror h3) {
  font-size: 15.5px;
  font-weight: 700;
  color: #3e2a14;
  margin: 0.6em 0 0.3em 0;
}

:deep(.rich-tiptap-content .ProseMirror code) {
  background: rgba(143, 115, 81, 0.12);
  color: #8b0000;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}

:deep(.rich-tiptap-content .ProseMirror blockquote) {
  margin: 0.8em 0;
  padding: 8px 16px;
  background: rgba(143, 115, 81, 0.08);
  border-left: 3.5px solid #c5913e;
  border-radius: 4px;
  color: #6b5134;
  font-size: 13.5px;
}

:deep(.rich-tiptap-content .ProseMirror hr) {
  margin: 1.2em 0;
  border: none;
  border-top: 1.5px dashed rgba(143, 115, 81, 0.35);
}

:deep(.rich-tiptap-content .ProseMirror ul) {
  margin: 0.5em 0;
  padding-left: 1.5em;
  list-style: disc;
}

:deep(.rich-tiptap-content .ProseMirror ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
  list-style: decimal;
}

:deep(.rich-tiptap-content .ProseMirror li) {
  margin: 2px 0;
}

:deep(.rich-tiptap-content .ProseMirror a.rich-link) {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}

:deep(.rich-tiptap-content .ProseMirror mark) {
  border-radius: 2px;
  padding: 0 2px;
}

/* 底部状态说明 */
.rich-footer-hints {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(143, 115, 81, 0.05);
  border-top: 1px solid rgba(143, 115, 81, 0.2);
  font-size: 12px;
  color: #755c3f;
}

.rich-hint-tag {
  font-weight: 700;
}

.rich-fullscreen-tip {
  margin-left: auto;
  font-weight: 700;
  color: #c5913e;
}
</style>
