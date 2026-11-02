/**
 * 富文本：受限标记 → VNode 渲染。
 *
 * 支持语法与嵌套：
 *   **加粗**         *倾斜*         ~~删除线~~
 *   {red}彩字{/red}   ← 颜色见 COLOR_PRESETS
 *   - 列表项
 *   > 引用/提示块
 *   --- 分割线
 *   ### 标题 (支持 # / ## / ###)
 *   [文字](链接)
 *
 * 🔴 为什么不用 v-html：公告是管理员输入，但后台账号也可能被盗。
 *    解析成 VNode 后，文本永远是文本节点，不会变成可执行标记。
 *    这也是项目里 docs/context/technical/HOME_CONTENT.md §四 定下的安全红线。
 *
 * 🟢 支持多层嵌套：如 **{red}*加粗倾斜红字*{/red}**、***粗斜体*** 等。
 */

/** 颜色预设：8 个标准色相 + 4 个项目专用色，均为浅底可读的压深值 */
export const COLOR_PRESETS = [
  { key: 'red', label: '重要', value: '#c0392b', hint: '警示、必须注意' },
  { key: 'orange', label: '提醒', value: '#c2660a', hint: '需要留意' },
  { key: 'green', label: '通过', value: '#2d7a3e', hint: '成功、已修复' },
  { key: 'blue', label: '信息', value: '#2563eb', hint: '一般信息、链接' },
  { key: 'purple', label: '特殊', value: '#7c3aed', hint: '稀有、特殊内容' },
  { key: 'pink', label: '活动', value: '#c2185b', hint: '节日、活动' },
  { key: 'gray', label: '次要', value: '#5c6b7a', hint: '备注、次要说明' },
  { key: 'gold', label: '荣誉', value: '#b8860b', hint: '强调、荣誉' },
  // 项目专用（与站点主题一致）
  { key: 'ink', label: '正文', value: '#3a2717', hint: '与正文同色' },
  { key: 'brown', label: '次要文字', value: '#6b5134', hint: '弱化文字' },
  { key: 'darkred', label: '深警示', value: '#8b0000', hint: '更强的警示' },
  { key: 'teal', label: '青灰', value: '#2f6f6b', hint: '冷静、提示' }
]

/** key → 色值；非法 key 返回 null */
export const COLOR_MAP = Object.fromEntries(COLOR_PRESETS.map((c) => [c.key, c.value]))

/**
 * 把标记文本解析成「块片段数组」。
 *
 * 返回 `[{ type, children, ...}]`
 */
export function parseRichText(input) {
  const src = String(input || '')
  if (!src) return []

  const out = []
  const lines = src.split('\n')
  let listBuffer = []

  const flushList = () => {
    if (listBuffer.length) {
      out.push({ type: 'list', items: listBuffer })
      listBuffer = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine

    // 1. 分割线：整行仅有 --- 或 ***
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushList()
      out.push({ type: 'hr' })
      continue
    }

    // 2. 列表项：以 "- " 开头（允许前置空格）
    const listMatch = line.match(/^\s*-\s+(.*)$/)
    if (listMatch) {
      listBuffer.push(parseInline(listMatch[1]))
      continue
    }
    flushList()

    // 3. 引用块：以 "> " 开头
    const quoteMatch = line.match(/^\s*>\s*(.*)$/)
    if (quoteMatch) {
      out.push({ type: 'quote', children: parseInline(quoteMatch[1]) })
      continue
    }

    // 4. 标题：以 # 开头
    const headingMatch = line.match(/^\s*(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      out.push({
        type: 'heading',
        level: headingMatch[1].length,
        children: parseInline(headingMatch[2])
      })
      continue
    }

    // 5. 空行
    if (line.trim() === '') {
      out.push({ type: 'break' })
      continue
    }

    // 6. 普通行
    out.push({ type: 'line', children: parseInline(line) })
  }

  flushList()
  // 去掉末尾连续的 break
  while (out.length && out[out.length - 1].type === 'break') out.pop()
  return out
}

/**
 * 递归解析行内标记。
 * 支持嵌套：**{red}*文字*{/red}**、***加粗倾斜*** 等。
 */
export function parseInline(text, depth = 0) {
  if (!text) return []
  if (depth > 6) return [{ type: 'text', text }]

  const segs = []
  /*
   * 匹配各行内标记：
   * 1. 粗斜体 ***...***
   * 2. 粗体 **...**
   * 3. 斜体 *...*
   * 4. 删除线 ~~...~~
   * 5. 颜色 {color}...{/color}
   * 6. 链接 [text](url)
   */
  const RE = /(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|(\*([^*\n]+?)\*)|(~~(.+?)~~)|(\{([a-z]+)\}([\s\S]*?)\{\/\10\})|(\[([^\n\]]+)\]\(((?:\/|https?:\/\/)[^\s)]+)\))/g

  let last = 0
  let m
  while ((m = RE.exec(text)) !== null) {
    if (m.index > last) {
      segs.push({ type: 'text', text: text.slice(last, m.index) })
    }

    if (m[1]) {
      // 粗斜体 ***text***: 等价于 bold 包含 italic
      segs.push({
        type: 'bold',
        children: [{ type: 'italic', children: parseInline(m[2], depth + 1) }]
      })
    } else if (m[3]) {
      // 粗体 **text**
      segs.push({
        type: 'bold',
        children: parseInline(m[4], depth + 1)
      })
    } else if (m[5]) {
      // 斜体 *text*
      segs.push({
        type: 'italic',
        children: parseInline(m[6], depth + 1)
      })
    } else if (m[7]) {
      // 删除线 ~~text~~
      segs.push({
        type: 'strike',
        children: parseInline(m[8], depth + 1)
      })
    } else if (m[9]) {
      // 颜色 {key}text{/key}
      const colorKey = m[10]
      const colorVal = COLOR_MAP[colorKey]
      if (colorVal) {
        segs.push({
          type: 'color',
          color: colorVal,
          colorKey,
          children: parseInline(m[11], depth + 1)
        })
      } else {
        segs.push({ type: 'text', text: m[0] })
      }
    } else if (m[12]) {
      // 链接 [text](url)
      const linkText = m[13]
      const href = m[14].trim()
      segs.push({
        type: 'link',
        href,
        children: parseInline(linkText, depth + 1)
      })
    }

    last = m.index + m[0].length
  }

  if (last < text.length) {
    segs.push({ type: 'text', text: text.slice(last) })
  }

  return segs
}

/** 递归获取纯文本（用于列表摘要、搜索匹配） */
export function richTextToPlain(input) {
  const blocks = parseRichText(input)
  function extractChildren(children) {
    if (!children) return ''
    if (typeof children === 'string') return children
    if (Array.isArray(children)) return children.map(extractNode).join('')
    return ''
  }

  function extractNode(n) {
    if (!n) return ''
    if (n.type === 'text') return n.text || ''
    if (n.type === 'break') return '\n'
    if (n.type === 'hr') return '\n---\n'
    if (n.type === 'heading') return extractChildren(n.children) + '\n'
    if (n.type === 'quote') return extractChildren(n.children) + '\n'
    if (n.type === 'line') return extractChildren(n.children) + '\n'
    if (n.type === 'list') {
      return (n.items || []).map((it) => '- ' + extractChildren(it)).join('\n') + '\n'
    }
    return extractChildren(n.children)
  }

  return blocks.map(extractNode).join('').trim()
}
