import fs from 'node:fs'
import path from 'node:path'

const gaoDir = (process.env.MYRZG_DATA_DIR || 'E:/Desktop/html/myrzg/游戏数据') + '/剧情'
const files = fs.readdirSync(gaoDir)

const candidates = []

for (const file of files) {
  if (!file.endsWith('.json')) continue
  try {
    const d = JSON.parse(fs.readFileSync(path.join(gaoDir, file), 'utf8'))
    let speaker = ''
    for (const exp of (d.exps || [])) {
      if (exp.key === 'text' && exp.para) {
        if (exp.para.name) speaker = exp.para.name.trim()
        let raw = (exp.para.text || '').replace(/\[.*?\]/g, '').replace(/\{.*?\}/g, '旅人').trim()

        if (!raw || /^[（(【]/.test(raw)) continue
        if (raw.length < 8 || raw.length > 55) continue

        // Skip chatty / casual dialogue
        if (/(?:喂|救命|可恶|混蛋|哈哈|嘿嘿|呜呜|啊啊|笨蛋|买定离手|开什么玩笑|快跑|站住|怎么办|哼|切|好吧)/.test(raw)) continue

        candidates.push({ file, speaker: speaker || '未知', raw })
      }
    }
  } catch (e) {}
}

// Themes
const themes = {
  '书籍·记录·手记': [
    '书', '手记', '笔记', '记录', '写', '纸', '翻开', '篇章', '笔'
  ],
  '探索·旅途·足迹': [
    '旅途', '旅人', '足迹', '探索', '同行', '前行', '起点', '终点', '脚步', '彼方'
  ],
  '记忆·时间·历史': [
    '记忆', '时间', '历史', '岁月', '时光', '证明', '遗忘', '铭记', '回响', '曾经'
  ],
  '知识·智慧·真理': [
    '知识', '智慧', '学者', '大书院', '真理', '答案', '追寻', '探求', '理解', '秘密', '真相'
  ],
  '深渊·星光·微光': [
    '深渊', '星光', '光芒', '黑暗', '微光', '火光', '破晓', '希望'
  ]
}

const categorized = {}
for (const [theme, kws] of Object.entries(themes)) {
  categorized[theme] = []
  const seen = new Set()
  for (const c of candidates) {
    if (kws.some(k => c.raw.includes(k))) {
      if (!seen.has(c.raw)) {
        seen.add(c.raw)
        categorized[theme].push(c)
      }
    }
  }
}

for (const [theme, items] of Object.entries(categorized)) {
  console.log(`\n=================== 【${theme}】 (共 ${items.length} 条) ===================`)
  // Filter for most poetic, thoughtful lines
  const selected = items.filter(it => {
    const t = it.raw
    return t.length >= 10 && t.length <= 42 &&
      (t.includes('。') || t.includes('……') || t.includes('，') || t.includes('！'))
  })
  for (const it of selected.slice(0, 20)) {
    console.log(`- 「${it.raw}」 —— ${it.speaker} (${it.file})`)
  }
}
