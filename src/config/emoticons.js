/**
 * 聊天表情（讨论区 / 评论发表区）——表情包目录、正文 token 语法与纯函数工具。
 *
 * ## 为什么正文里存的是 token 而不是文件名 / URL / unicode
 *
 * 1. **不是 unicode**：黄豆与《深渊之歌》表情都是**图片**（贴吧经典黄豆由百度贴吧 app 提取、
 *    游戏第 1 弹是官方微信表情包），在 Unicode 里没有对应码位，存字符等于存不出来。
 * 2. **不存路径**：`public/images/` 下的目录会随资源整理迁移，路径入库后历史评论就全成死链。
 *    token 只记「哪个包的哪个名字」，路径由本文件的目录表推导
 *    （与头像 ID 的解耦同理，见 `functions/api/[[path]].js` 的 `AVATAR_ID_RE` 注释）。
 * 3. **不新增数据库列**：`comments.body` 仍是纯文本列，token 只是正文里的一段普通字符。
 *    老评论（无 token）行为完全不变；服务端也不需要认识这份表情目录。
 *
 * ## token 语法
 *
 * ```
 * [e:<包ID>:<表情名>]        例：[e:tieba:25]   [e:abyss1:cheer_up]
 * ```
 *
 * - 包 ID：`[a-z0-9]{2,12}`（`tieba`、`abyss1`；将来第 2 弹按同一规则加一个包即可）
 * - 表情名：`[a-z0-9_]{1,24}`（黄豆是编号 `25`，游戏表情是源文件名 `cheer_up`）
 * - 语法允许的最长 token 41 字（`[e:` + 12 + `:` + 24 + `]`），见 `EMOTICON_TOKEN_MAX_LENGTH`。
 *
 * **服务端只校验格式、不校验是否在目录里**（与头像同口径）：Worker 读不到 `public/`，
 * 硬编码清单必然与素材脱节。目录里没有的 token 在渲染时当**普通文字**原样显示，无害。
 *
 * ## 字数上限
 *
 * 上限 200 是**显示字数**：一个表情算 1 字（`v[表情]你好` = 4 字）。
 * 因此正文的**原始长度**可以远大于 200，服务端另设 `MAX_BODY_RAW` 闸门，
 * 两边都用本文件的 `countEmoticonDisplayChars` 计算，口径一处维护。
 *
 * ## 本模块必须保持零依赖
 *
 * 服务端 `functions/api/[[path]].js` 直接 import 它。**不要**在这里引入 `utils/env.js`
 * 之类的浏览器/原生依赖（那些会拖进 Capacitor）。图片 URL 由组件调 `getImageUrl` 自己拼。
 */

/**
 * 正文**显示字数**上限。**必须与 `functions/api/[[path]].js` 的 `MAX_BODY` 一致**
 * （超出会被服务端明确拒绝，不是静默截断）。
 */
export const MAX_BODY_DISPLAY = 200

/** token 语法（字符串形式，供 `new RegExp(..., 'g')` 使用，避免共享正则的 `lastIndex` 状态） */
export const EMOTICON_TOKEN_SOURCE = String.raw`\[e:([a-z0-9]{2,12}):([a-z0-9_]{1,24})\]`

/** 语法允许的最长 token 长度：`[e:`(3) + 包ID(12) + `:`(1) + 表情名(24) + `]`(1) */
export const EMOTICON_TOKEN_MAX_LENGTH = 41

/**
 * 正文**原始长度**闸门（字符数，含 token 全文）。
 *
 * 取 `200 × 最长 token`：这是"200 个表情"这种极端但合法的输入所可能达到的最大长度。
 * 它只用来挡住超长请求体（避免把几 MB 的字符串送进 D1），**不是**用户可见的限制——
 * 用户看到的限制始终是 200 显示字。
 */
export const MAX_BODY_RAW = MAX_BODY_DISPLAY * EMOTICON_TOKEN_MAX_LENGTH

/**
 * 黄豆表情：`[文件名（不含扩展名）, 中文名]`。**数组顺序就是选择器里的顺序。**
 *
 * 素材来自维护目录 `贴吧经典黄豆表情包` 的两个子目录，**黄豆在前、物品与符号在后**（用户指定）：
 * 前 60 条 = `tb_黄豆表情`，后 25 条 = `tb_物品与符号`。
 *
 * 两段各自**先经典、后新增**：经典表情按包内 `经典命名版`（50 张人工命名的 `NN_名称.png`）
 * 的顺序排，其余是本包新增的表情（拼音命名）排在后面。
 *
 * **中文名的依据**（不靠回忆、不靠猜）：
 *   1. 与 `经典命名版` **逐张像素比对**得到的 50 条，直接用它的中文名；
 *   2. 其余按包内 `tb_黄豆表情` 的拼音命名（如 `tb_yiwen` → 疑问）并**逐张看图确认**
 *      （`tb_wuzuixiao` 的拼音有歧义，看图确认是「捂嘴笑」）。
 * 英文对照见包内 `tb_英文命名版`（可作为复核依据）。
 *
 * ⚠️ 名字与顺序都**手写在这里**，导入脚本会双向核对（缺图、漏登记、名字缺失都会报错）。
 */
const TIEBA_ITEMS = [
  // ── 黄豆表情 · 经典 50（顺序同 `经典命名版` 01–50）──
  ['tb_hehe', '呵呵'],
  ['tb_haha', '哈哈'],
  ['tb_tushe', '吐舌'],
  ['tb_a', '啊'],
  ['tb_ku', '酷'],
  ['tb_nu', '怒'],
  ['tb_kaixin', '开心'],
  ['tb_han', '汗'],
  ['tb_lei', '泪'],
  ['tb_heixian', '黑线'],
  ['tb_bishi', '鄙视'],
  ['tb_bugaoxing', '不高兴'],
  ['tb_zhenbang', '真棒'],
  ['tb_qian', '钱'],
  ['tb_yiwen', '疑问'],
  ['tb_yinxian', '阴险'],
  ['tb_tu', '吐'],
  ['tb_yi', '咦'],
  ['tb_weiqu', '委屈'],
  ['tb_huaxin', '花心'],
  ['tb_hu', '呼'],
  ['tb_xiaoyan', '笑眼'],
  ['tb_leng', '冷'],
  ['tb_taikaixin', '太开心'],
  ['tb_huaji', '滑稽'],
  ['tb_mianqiang', '勉强'],
  ['tb_kuanghan', '狂汗'],
  ['tb_guai', '乖'],
  ['tb_shuijiao', '睡觉'],
  ['tb_jingku', '惊哭'],
  ['tb_shengtian', '升天'],
  ['tb_jingya', '惊讶'],
  ['tb_pen', '喷'],
  // ── 黄豆表情 · 本包新增（按拼音排序）──
  ['tb_chigua', '吃瓜'],
  ['tb_chuolian', '戳脸'],
  ['tb_daxiao', '大笑'],
  ['tb_dianzhayao', '点炸药'],
  ['tb_goutou', '狗头'],
  ['tb_goutoupazhuo', '狗头趴桌'],
  ['tb_guaiqiao', '乖巧'],
  ['tb_heilian', '黑脸'],
  ['tb_heilianxiao', '黑脸笑'],
  ['tb_hejiu', '喝酒'],
  ['tb_heqian', '喝钱'],
  ['tb_huajixieyan', '滑稽斜眼'],
  ['tb_jiujie', '纠结'],
  ['tb_luchixiao', '露齿笑'],
  ['tb_nuhou', '怒吼'],
  ['tb_penshui', '喷水'],
  ['tb_toukan', '偷看'],
  ['tb_tuosai', '托腮'],
  ['tb_wabi', '挖鼻'],
  ['tb_wuzuixiao', '捂嘴笑'],
  ['tb_xiaoguai', '小乖'],
  ['tb_xiaoku', '笑哭'],
  ['tb_xili', '犀利'],
  ['tb_xingfen', '兴奋'],
  ['tb_xiuse', '羞涩'],
  ['tb_yaoya', '咬牙'],
  ['tb_zhoumei', '皱眉'],
  // ── 物品与符号 · 经典（顺序同 `经典命名版` 34–50）──
  ['tb_aixin', '爱心'],
  ['tb_xinsui', '心碎'],
  ['tb_meigui', '玫瑰'],
  ['tb_liwu', '礼物'],
  ['tb_caihong', '彩虹'],
  ['tb_xingyue', '星星月亮'],
  ['tb_taiyang', '太阳'],
  ['tb_qianbi', '钱币'],
  ['tb_dengpao', '灯泡'],
  ['tb_chabei', '茶杯'],
  ['tb_dangao', '蛋糕'],
  ['tb_yinyue', '音乐'],
  ['tb_haha2', 'haha'],
  ['tb_shengli', '胜利'],
  ['tb_damuzhi', '大拇指'],
  ['tb_ruo', '弱'],
  ['tb_ok', 'OK'],
  // ── 物品与符号 · 本包新增（按拼音排序）──
  ['tb_bianbian', '便便'],
  ['tb_honglingjin', '红领巾'],
  ['tb_juanzhi', '卷纸'],
  ['tb_lazhu', '蜡烛'],
  ['tb_sandaogang', '三道杠'],
  ['tb_shafa', '沙发'],
  ['tb_xiangjiao', '香蕉'],
  ['tb_yaowan', '药丸']
]

/**
 * 《深渊之歌》第 1 弹（官方微信表情包）：`[源文件名（不含扩展名）, 中文名]`。
 *
 * `key` **原样取源文件名**（含官方 `syzg_` 前缀）——"目录表 ↔ 素材文件"是纯机械对应
 * （`<key>.webp` ↔ `<key>.png`），少一张图或改了名字都会在导入脚本与单测里立刻报错。
 * 中文名是按文件名的英文义翻译的（`angry` → 生气），只用于悬停提示与无障碍标签。
 */
const ABYSS_PACK_1_ITEMS = [
  ['syzg_angry', '生气'],
  ['syzg_awkward', '尴尬'],
  ['syzg_cheer_up', '加油'],
  ['syzg_furious', '暴怒'],
  ['syzg_ok', 'OK'],
  ['syzg_surprised', '惊讶'],
  ['syzg_take_notes', '记笔记'],
  ['syzg_thinking', '思考']
]

/**
 * 表情包目录。
 *
 * `kind` 决定正文里的展示尺寸：
 *   - `face`（黄豆，90×90）：**跟随正文字号**，与文字混排不撑行；
 *   - `sticker`（游戏第 1 弹，240×240）：固定像素的大贴纸，单独发或跟在文字后面。
 */
const PACK_DEFS = [
  {
    id: 'tieba',
    label: '黄豆 emoji',
    dir: '/images/emoticons/tieba/',
    kind: 'face',
    items: TIEBA_ITEMS.map(([key, name]) => ({ key, name, file: `${key}.webp` }))
  },
  {
    id: 'abyss1',
    label: '深渊之歌第1弹',
    dir: '/images/emoticons/abyss1/',
    kind: 'sticker',
    items: ABYSS_PACK_1_ITEMS.map(([key, name]) => ({ key, name, file: `${key}.webp` }))
  }
]

/**
 * 归一化后的表情包目录（消费方只用这一份）：
 * 每个 item 补齐了 `packId`、`path`（相对 `public` 的图片路径）、
 * `name`（**中文名**，用于悬停提示）与 `ariaName`（带包名，用于无障碍标签）。
 */
export const EMOTICON_PACKS = PACK_DEFS.map((pack) => ({
  id: pack.id,
  label: pack.label,
  dir: pack.dir,
  kind: pack.kind,
  items: pack.items.map((item) => ({
    key: item.key,
    file: item.file,
    packId: pack.id,
    packLabel: pack.label,
    kind: pack.kind,
    path: `${pack.dir}${item.file}`,
    name: item.name,
    ariaName: `${pack.label} ${item.name}`
  }))
}))

const EMOTICON_BY_ID = new Map()
for (const pack of EMOTICON_PACKS) {
  for (const item of pack.items) EMOTICON_BY_ID.set(`${pack.id}:${item.key}`, item)
}

/** 全部表情（拍平），供单测与导入脚本核对素材 */
export const EMOTICON_ITEMS = EMOTICON_PACKS.flatMap((pack) => pack.items)

/** 生成正文 token */
export function buildEmoticonToken(packId, key) {
  return `[e:${packId}:${key}]`
}

/** 按包 ID + 表情名取目录项；不在目录里返回 null */
export function findEmoticon(packId, key) {
  return EMOTICON_BY_ID.get(`${packId}:${key}`) || null
}

/**
 * 把正文切成「文字段 / 表情段」，供渲染层消费（纯函数，不拼 URL）。
 *
 * 目录里**不认识**的 token 不替换，继续当普通文字——所以历史正文、用户手打的
 * `[e:xx:yy]` 都不会被吃掉或渲染成破图。
 *
 * @param {string} text 评论正文
 * @returns {Array<{type:'text',text:string}|{type:'emoticon',item:object}>}
 */
export function splitEmoticonSegments(text) {
  const source = String(text ?? '')
  const re = new RegExp(EMOTICON_TOKEN_SOURCE, 'g')
  const segments = []
  let last = 0

  for (const match of source.matchAll(re)) {
    const item = findEmoticon(match[1], match[2])
    if (!item) continue
    if (match.index > last) segments.push({ type: 'text', text: source.slice(last, match.index) })
    segments.push({ type: 'emoticon', item })
    last = match.index + match[0].length
  }

  if (last < source.length) segments.push({ type: 'text', text: source.slice(last) })
  return segments
}

/**
 * 显示字数：**认识的表情算 1 字**，其余按原字符数（`String.length`）计。
 *
 * 前后端共用这一个函数，避免"前端说没超、后端说超了"。
 * 注意 `String.length` 是 UTF-16 码元数，用户直接打进去的 emoji（😀）算 2 —— 
 * 这是改表情功能**之前**就有的口径，刻意不动（改它会让所有历史评论的计长同时变化）。
 */
export function countEmoticonDisplayChars(text) {
  const source = String(text ?? '')
  return source.replace(new RegExp(EMOTICON_TOKEN_SOURCE, 'g'), (match, packId, key) =>
    findEmoticon(packId, key) ? 'x' : match
  ).length
}

/**
 * 把正文转成**纯文字**：认识的表情换成 `[中文名]`，其余原样。
 *
 * 用途：没法放图片的地方要显示正文——回复条的引用摘录、`title`/无障碍名、
 * 以后可能有的纯文本导出。**不要**用它替代 `EmoticonText` 渲染：
 * 能放图的地方就该放图（用户明确要求"直接显示表情"）。
 *
 * @param {string} text 评论正文（含 `[e:包:名]` token）
 * @returns {string} 形如 `大家觉得 [呵呵] 这个角色好用吗`
 */
export function emoticonPlainText(text) {
  return splitEmoticonSegments(text)
    .map((segment) => (segment.type === 'emoticon' ? `[${segment.item.name}]` : segment.text))
    .join('')
}
