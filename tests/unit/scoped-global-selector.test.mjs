import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.resolve('src')

function collectVueFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectVueFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.vue')) files.push(full)
  }
  return files
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function findTrailingGlobalSelectors(styleBody) {
  const cleaned = stripCssComments(styleBody)
  const hits = []
  const re = /:global\(/g
  let match
  while ((match = re.exec(cleaned))) {
    let depth = 1
    let i = match.index + match[0].length
    while (i < cleaned.length && depth > 0) {
      const ch = cleaned[i]
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
      i += 1
    }
    if (depth !== 0) continue
    // Check what follows the closing ')' of :global(...) before ',' or '{'
    const rest = cleaned.slice(i)
    const boundaryMatch = rest.match(/^([^\r\n,{]*)/)
    const tail = boundaryMatch ? boundaryMatch[1] : ''
    if (/\s+[^\s,){]/.test(tail)) {
      const snippet = cleaned.slice(match.index, i + tail.length).trim()
      hits.push(snippet)
    }
  }
  return hits
}

test('scoped <style> 里禁止 :global(X) Y 写法（会编译出裸 X 污染全局）', () => {
  const violations = []
  for (const file of collectVueFiles(SRC_DIR)) {
    const source = readFileSync(file, 'utf8')
    const styleRe = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi
    let styleMatch
    while ((styleMatch = styleRe.exec(source))) {
      const attrs = styleMatch[1] || ''
      if (!/\bscoped\b/i.test(attrs)) continue
      const bad = findTrailingGlobalSelectors(styleMatch[2])
      for (const snippet of bad) {
        violations.push(`${path.relative(process.cwd(), file).replaceAll('\\', '/')}: ${snippet}`)
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `发现 scoped 样式中 :global(...) 后接选择器片段（请改为普通嵌套或把整条选择器放入 :global(...) 内）：\n${violations.join('\n')}`
  )
})
