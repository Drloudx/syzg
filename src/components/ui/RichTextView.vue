<template>
  <div class="rich-text">
    <!-- 如果是 HTML 格式（由所见即所得编辑器生成） -->
    <div v-if="isHtml" class="rich-html-content" v-html="sanitizedHtml" />
    <!-- 否则（传统标记纯文本），通过安全 VNode 树渲染 -->
    <template v-else>
      <component :is="RenderView" />
    </template>
  </div>
</template>

<script>
import { computed, defineComponent, h } from 'vue'
import { parseRichText } from '../../utils/richText.js'

export default defineComponent({
  name: 'RichTextView',
  props: {
    content: { type: String, default: '' }
  },
  setup(props) {
    const isHtml = computed(() => {
      const c = (props.content || '').trim()
      return /<(p|h[1-6]|ul|blockquote|div|strong|span|em|s)\b/i.test(c)
    })

    /** 轻量安全清洗：过滤所有 script、iframe、object 及 javascript: 协议 */
    const sanitizedHtml = computed(() => {
      const raw = props.content || ''
      return raw
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/on\w+='[^']*'/gi, '')
        .replace(/href=["']\s*javascript:[^"']*["']/gi, 'href="#"')
    })

    const blocks = computed(() => parseRichText(props.content))

    function renderChildren(children) {
      if (!children) return []
      if (!Array.isArray(children)) return [children]
      return children.map((c) => renderNode(c)).filter(Boolean)
    }

    function renderNode(node) {
      if (!node) return null
      if (node.type === 'text') return node.text
      if (node.type === 'bold') return h('strong', renderChildren(node.children))
      if (node.type === 'italic') return h('em', renderChildren(node.children))
      if (node.type === 'strike') return h('s', renderChildren(node.children))
      if (node.type === 'color') {
        return h(
          'span',
          {
            style: { color: node.color },
            class: ['rich-color', node.colorKey ? `is-color-${node.colorKey}` : null]
          },
          renderChildren(node.children)
        )
      }
      if (node.type === 'link') {
        const isInternal = node.href.startsWith('/')
        return h(
          'a',
          {
            href: node.href,
            target: isInternal ? undefined : '_blank',
            rel: isInternal ? undefined : 'noopener noreferrer',
            class: 'rich-link'
          },
          renderChildren(node.children)
        )
      }
      if (node.type === 'heading') {
        const level = Math.min(Math.max(node.level || 3, 1), 3)
        const tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5'
        return h(tag, { class: ['rich-heading', `is-h${level}`] }, renderChildren(node.children))
      }
      if (node.type === 'quote') {
        return h('blockquote', { class: 'rich-quote' }, renderChildren(node.children))
      }
      if (node.type === 'hr') {
        return h('hr', { class: 'rich-hr' })
      }
      if (node.type === 'list') {
        return h(
          'ul',
          { class: 'rich-list' },
          (node.items || []).map((it) => h('li', renderChildren(it)))
        )
      }
      if (node.type === 'break') {
        return h('br')
      }
      if (node.type === 'line') {
        return h('div', { class: 'rich-line' }, renderChildren(node.children))
      }
      return null
    }

    const RenderView = () => h('div', { class: 'rich-vnode-tree' }, blocks.value.map(renderNode).filter(Boolean))

    return {
      isHtml,
      sanitizedHtml,
      RenderView
    }
  }
})
</script>

<style scoped>
.rich-text {
  font-size: inherit;
  line-height: 1.75;
  word-break: break-word;
  color: inherit;
  font-synthesis: style weight;
}

:deep(p) {
  margin: 0.5em 0;
}

:deep(strong) {
  font-weight: 700;
  font-synthesis: weight !important;
}

:deep(em) {
  font-style: italic;
  font-synthesis: style !important;
}

:deep(s) {
  text-decoration: line-through;
  opacity: 0.75;
}

:deep(h1) {
  font-size: 18px;
  font-weight: 800;
  color: #2b1b0d;
  margin: 0.8em 0 0.4em 0;
  border-bottom: 1px dashed rgba(143, 115, 81, 0.35);
  padding-bottom: 4px;
}

:deep(h2) {
  font-size: 16px;
  font-weight: 800;
  color: #3e2a14;
  margin: 0.7em 0 0.3em 0;
}

:deep(h3) {
  font-size: 14.5px;
  font-weight: 700;
  color: #3e2a14;
  margin: 0.6em 0 0.3em 0;
}

:deep(blockquote) {
  margin: 0.6em 0;
  padding: 6px 12px;
  background: rgba(143, 115, 81, 0.08);
  border-left: 3px solid #c5913e;
  border-radius: 4px;
  color: #755c3f;
  font-size: 13px;
  line-height: 1.6;
}

:deep(hr) {
  margin: 10px 0;
  border: none;
  border-top: 1px dashed rgba(143, 115, 81, 0.4);
}

:deep(ul) {
  margin: 4px 0;
  padding-left: 1.4em;
  list-style: disc;
}

:deep(ul li) {
  margin: 2px 0;
}

:deep(a.rich-link) {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}

:deep(a.rich-link:hover) {
  color: #1d4ed8;
}

/* 暗色主题 */
:global(.dark-mode) :deep(a.rich-link),
:global(.dark-theme) :deep(a.rich-link) {
  color: #7aa7ff;
}

:global(.dark-mode) :deep(a.rich-link:hover),
:global(.dark-theme) :deep(a.rich-link:hover) {
  color: #a8c4ff;
}
</style>
