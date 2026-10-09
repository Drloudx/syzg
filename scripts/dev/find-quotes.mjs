import fs from 'node:fs'
import path from 'node:path'

const gaoDir = 'E:/Desktop/html/myrzg/GAoNano_decrypted'
const files = fs.readdirSync(gaoDir)

const list = []
for (const file of files) {
  if (!file.endsWith('.json')) continue
  try {
    const d = JSON.parse(fs.readFileSync(path.join(gaoDir, file), 'utf8'))
    let spk = ''
    for (const exp of (d.exps || [])) {
      if (exp.key === 'text' && exp.para) {
        if (exp.para.name) spk = exp.para.name
        const raw = (exp.para.text || '').replace(/\[.*?\]/g, '').replace(/\{.*?\}/g, '旅人').trim()
        if (raw.length >= 6 && raw.length <= 50) {
          list.push({ file, spk: spk || '旁白', txt: raw })
        }
      }
    }
  } catch (e) {}
}

const keywords = ['大书院', '学者', '记忆', '深渊', '知识', '真相', '手记', '记录', '冒险', '故事', '历史', '世界', '秘密']
const matched = list.filter(item => keywords.some(k => item.txt.includes(k)))

// Filter out chit-chat, conversational filler
const highValue = matched.filter(h => {
  const t = h.txt
  if (/^[（(]/.test(t)) return false
  if (/(?:怎么办|喂|啊啊|快点|可恶|呜呜|嘿嘿|唔|哈|咦|噗)/.test(t)) return false
  return true
})

console.log(`Matched: ${matched.length}, High Value: ${highValue.length}`)

// Group by keywords or show most meaningful ones
const categories = {
  大书院与学者: highValue.filter(h => h.txt.includes('大书院') || h.txt.includes('学者')),
  记忆与历史: highValue.filter(h => h.txt.includes('记忆') || h.txt.includes('历史')),
  深渊与真相: highValue.filter(h => h.txt.includes('深渊') || h.txt.includes('真相')),
  探索与手记: highValue.filter(h => h.txt.includes('探索') || h.txt.includes('手记') || h.txt.includes('记录'))
}

for (const [cat, arr] of Object.entries(categories)) {
  console.log(`\n=== 【${cat}】 ===`)
  for (const item of arr.slice(0, 15)) {
    console.log(`- 「${item.txt}」 —— ${item.spk} (${item.file})`)
  }
}
