# RISKS —— 风险、已知故障与保护措施

> 任务涉及对应风险时读本文件。已确认的**现象 → 根因 → 解法**在这里；为什么这么设计看 [DECISIONS.md](DECISIONS.md)。
> 证据或状态变化时更新。**报告是当日结果，不写成永久结论。**
>
> **何时读**：执行高风险操作前、排查故障时、或想知道"这块有没有已知问题"时。
> **何时更新**：发现新证据、故障被修复、或验证缺口被补齐时。

**核对时间**：2026-10-08

---

## 一、高风险操作（动手前必读）

| 操作 | 风险 | 保护措施 |
| --- | --- | --- |
| **`git push`** | **就是上线**（Cloudflare Pages GitHub 集成，无二次发布）。推错了直接影响生产 | 推送前跑 `npm run verify`；确认工作区没有他人未完成的改动 |
| **改 D1 表结构** | 新代码先上线而库里没有对应列/表 → **整个讨论区对所有人挂掉**（未登录访客读评论也走同一条 SQL）。D1 的 `ALTER TABLE` **没有回退语句** | 顺序永远是**先迁移、后推送**；迁移前先 `wrangler d1 export` 备份；改迁移脚本后必跑 `npm run test:migration` |
| **对生产库执行 SQL** | 破坏性且不可逆 | `DELETE FROM comments` 只在 `scripts/sql/reset-test-comments.sql` 里，默认整段注释，**必须用户确认** |
| **图片压缩 / 替换** | 有损操作，观感下降不可逆 | 仅在用户**明确要求**时执行；先核对原图备份与 SHA-256；询问压缩状态**不构成**授权 |
| **覆盖 `mon.json` / `battle.json` / `room.json`** | 任务裁剪版会毁掉完整原表 | 这三个表**始终保存完整版本**；`cirtDam → critDam` 只在内存归一化 |
| **改 `functions/` 后忘记重启** | wrangler **不热加载**，改了不生效 | 改完**必须重启** `npm run dev:api`（已踩过两次） |
| **改 `AUTH_PEPPER` / `SALT_SECRET`** | 前者变了**所有人登不上**；后者变了**所有人"不存在"**，且是**静默的**（登录只说"邮箱或密码不对"） | 上线后不能再改。要轮换得写数据迁移 |
| **`CLOUD_URL` 改动** | 会被**编译进产物** → 等于要求所有 Android 用户更新热更包 | 见 [AGENTS.md](../../AGENTS.md) 第四节红线 |
| **删 `dist/data` / `dist/images` 后同步 Android** | 离线资源丢失 | 旧 `clean_dist.bat` 的删除策略**已停用** |
| **手动 `DELETE FROM comments` 清库** | 会让正在手点页面的人下一次刷新出现「列表瞬间变短、页面挤一下」 | 测试脚本会**自动备份并还原**；要重置用 `seed-site-discussion.mjs` |

---

## 二、已知故障目录（现象 → 根因 → 解法）

> **本文件是故障与风险的权威来源。** 原 `docs/KNOWN_BUGS_AND_FIXES.md` 的 17 个编号小节已完整压缩到本节（含全部标识符与判据），替换后不再需要同时维护两份。
> 编号**只增不改**；新增条目追加在对应小节末尾，编号顺延。

### 2.1 弹窗与滚动

| # | 现象 | 根因 | 解法 | 负责模块 |
| --- | --- | --- | --- | --- |
| 1 | 关闭内嵌详情时先露页面背景，或列表与淡出详情叠帧错位 | 列表显隐、视口锁、overlay 离场动画**不同生命周期** | 列表开关取宿主 `ui-modal-host` 上的 `ui-modal-open` 类（随 `visible` 即时移除）；普通内嵌详情**关闭 CSS transition**（`<Transition :css="!!teleportTo \|\| fullscreen">`） | `UiModal.vue` |
| 2 | 短详情下方露出大片列表/地图空白 | 旧"页面滚动"模型：窗口 `height:auto` 按内容撑开，短内容时低于容器 | 改"覆盖式 + 锁视口 + 正文内部滚动"；同层列表用 `visibility:hidden`（**不是 `display:none`**，要保布局高度） | `UiModal.vue` |
| 3 | 关闭详情后**返回不在点击区域**，跳回页面顶部 | 链式：`:has(...)` 设 `max-height:视口` 时浏览器把滚动位置**钳制到 0**，而旧代码在 `flush:'post'`（DOM 已应用钳制）才读 `scrollTop` | `restoreScrollTop` prop + `flush:'pre'` watch **在钳制前捕获**；共享 `modalScrollCoordinator` 多 owner 管理，仅最后一层关闭时恢复（立即 + rAF 双恢复） | `UiModal.vue`、`itemModalState.js`、`App.vue`、`modalScrollCoordinator.js` |
| 4 | 详情正文底部出现横向滚动条 | `overflow-y:auto` 使未显式设置的 `overflow-x` 被计算为 `auto`；正文 2px 描边导致 `scrollWidth(766) > clientWidth(762)` | `.ui-modal-body { overflow-y: auto; overflow-x: hidden; }` | `UiModal.vue` |
| 5 | 全局更新窗按钮落到屏幕外 / 图片预览关闭按钮被顶栏覆盖 | 旧更新窗手写固定遮罩、无视口最大高度；旧预览 `z-index:2000` 低于顶栏 `10000` | 复用 `UiModal teleport-to="body"` + 安全区限高；`globalModalLock` 多 owner 锁背景 | `UiModal.vue`、`globalModalLock.js` |
| 6 | 原生返回直接退出页面，而非关闭当前弹窗 | 旧监听按路径判断，而详情只追加 `itemId`、路径不变 | `overlayStack` / `useOverlay` 登记关闭动作，优先关闭最高层；无覆盖层时注销监听保留 WebView 原生返回 | `overlayStack.js`、`nativeBackHandler.js`、`useNativeShell.js` |
| 7 | 普通图鉴与邮件阅读器滚动职责混用 → 双滚动条/筛选错位 | 混用"所有页面内部滚动"结论 | 普通列表用 `UiCardGrid/UiVirtualGrid`；邮件用 `is-mail-reader` 锁外层，内部各自滚动 | `App.vue`、`UiCardGrid` |

**改造弹窗/滚动前的 8 项自检**：钳制前捕获 `scrollTop`、隐藏用 `visibility` 不用 `display`、正文 `overflow-x:hidden`、单轴 `auto` 时另一轴显式 `hidden`、覆盖式与页面滚动不混用、双恢复守卫到位、多详情同屏必须用共享协调器、物品内部 push/pop 要同时存 `bodyScrollTop`。

### 2.2 聊天式列表

| # | 现象 | 根因 | 解法 | 负责模块 |
| --- | --- | --- | --- | --- |
| 8 | 讨论区点「发布」瞬间**闪一下**，翻历史时尤其明显 | ① 插入后**晚两帧**才滚（双 rAF），中间先绘出"已插入未跟随"的画面；② `scrollTop = scrollHeight` 一帧**瞬移**（实测 `577 → 1196`，619px） | 滚动位置收敛为**唯一决策点**（`watch(commentsLength, { flush:'post' })`）；首次载入直接落底，之后 260ms easeOutCubic；**只在插入前就贴底（120px 内）才跟随** | `DiscussionsView.vue` |
| 9 | 发**表情**消息后不自动滚到底（纯文字看不出） | 贴底判据写在 `flush:'post'` watcher 内 = 新评论 DOM **已插入后**才算几何；贴纸消息约 124px 恰好把贴底用户顶出 120px 阈值 | 判据改为插入前持续维护的 `nearBottomBeforeInsert`；动画结束加 0.9 秒落定窗口；用户滚轮/触摸立刻中断跟随 | `DiscussionsView.vue` |
| 10 | 别的设备发的消息只在**右栏**出现，中间区要重开才刷新 | 中间区域**无自动刷新**：`pageKey` 恒为 `site:general` 永不变，本机广播**不跨设备** | 抽 `useVisibilityPolling.js` 两处共用；刷新走 `mergeNewComments()` **只并新增不替换列表** | `useVisibilityPolling.js`、`CommentsPanel.vue` |
| 11 | 详情页发的评论**混进右栏**「最新讨论」 | 三条件叠加：`/api/recent` 只查 `site:general`（服务端正确）；`addRecentComment` **无条件**往右栏塞；`POST /api/comments` 返回的 `comment` **没有 `pageKey`** | `POST` 补 `pageKey`/`pageLabel` 与两个 GET 对齐；`addRecentComment` 加闸 `pageKey !== SITE_PAGE_KEY` | `App.vue`、服务端 |

### 2.3 组件与交互

| # | 现象 | 根因 | 解法 | 负责模块 |
| --- | --- | --- | --- | --- |
| 12 | 点「插入表情」按钮后正文被清空且**多发一条评论** | `UiButton` 声明了 `type` prop 但模板**从未绑定**（死代码）→ `<form>` 内无 `type` 的按钮默认 `type="submit"` | 模板绑定 `:type="type"`（默认 `button`） | `UiButton.vue` |
| 13 | 手机端详情底部发表区与悬浮按钮**重叠遮挡** | 全局悬浮球固定右下角，与详情底部发表区争位 | 引入 `EdgeFloatingWidget` 贴边二合一拉手；移动端隐藏原悬浮球与 `nav-fab-btn` | `EdgeFloatingWidget.vue` |
| 14 | 移动端点「回到顶部」**无响应** | 移动端实际滚动宿主是内部 `[data-main-scroll]`，而挂件兜底返回 `window`（偏移本就为 0） | `onBackToTopClick` 全场景寻迹：弹窗前台 → `.ui-modal-body`；主页面 → `[data-main-scroll]`；兜底 `.app-container` / `window` | `EdgeFloatingWidget.vue` |
| 15 | Tooltip 左右边缘**刺出弹窗被截断** | 原 Tooltip 默认 `display:none`，首次 `mouseenter` 时渲染树未计算，`getBoundingClientRect()` 读到**宽度 0** → 误判未溢出 | CSS 改 `visibility:hidden; opacity:0`（DOM 初始渲染即完成排版）；边界检测改用纯几何推导 | 详情弹窗 |
| 16 | 虚拟列表高速划动导致图片**网络排队堵塞** | 惯性飞速划动逐帧挂载新行，1~2 秒内上百张图片请求塞爆 HTTP/2 并发池；手指停下时目标图片排在队列末端 | `UiCardGrid` 测速超 `0.8px/ms` 判定快滑 → `UiItemCard` 暂不挂载冷图片，停顿后视口内独占并发；会话级缓存 `window.__loadedUiItemImages` | `UiCardGrid.vue`、`UiItemCard.vue` |
| 17 | 快滑时控制台刷 `ERR_HTTP2_SERVER_REFUSED_STREAM` | 一次拉起数百图片请求，超服务端并发上限时边缘发 `RST_STREAM + REFUSED_STREAM`（语义为"未处理、可安全重试"） | **无需处理**。图仍正常显示（Chromium 自动重试）。要减少只能降低瞬时并发 | — |

### 2.4 数据与展示

| # | 现象 | 根因 | 解法 |
| --- | --- | --- | --- |
| 18 | 家具来源显示「未知」而非「通行证」 | **刻意行为**，非缺陷 | `furnitureData.SOURCE_DISPLAY_ALIAS` 的展示层伪装。原始 `homeItem.tip`/`sourceTags` 保留，清空该表即恢复。`tests/ui/furniture.spec.js` 断言伪装生效 |
| 19 | 设施页某些等级按钮点进去是空列表 | 黑名单把某级整级滤空，而等级按钮照抄了 `mode.levels` | 等级按钮必须从**实际可见配方反推**；统一用 `isFacilityRecipeHidden`（三处共用） |
| 20 | 物品详情的「查看锻造台 / 查看设施」跳到空列表（37 条死链） | 同一条业务规则在**两个页面各写了一份**，只有一处跟着改 | 收敛为 `config/blacklist.js` 的 `isFacilityRecipeHidden`；`tests/unit/facility-recipe-links.test.mjs` 直接对随包产物断言 |
| 21 | 新建的图鉴页里，正文滚动时**内容盖到吸顶筛选框上方**（老页面都正常） | 桌面端靠 `--sticky-clip-top` + `clip-path` 裁掉滚过筛选框的部分，它需要「`.page-view-container` 直接子级的 `UiFilterPanel`」+「内容容器带 `data-main-scroll`」**成对出现**。少任一条就静默失效（不报错） | 用 `UiFilterPanel`（带 `data-sticky-filter`）并放回直接子级；自建滚动容器补 `data-main-scroll`。开发期 `App.vue` 会 `console.warn('[sticky-clip] …')`；回归 `tests/ui/sticky-clip.spec.js`。规则见 [UI 组件库 §3 第 9 条](./UI_COMPONENT_LIBRARY.md#3-使用规则强制) |

---

## 三、配置差异与数据边界（**如实呈现，不"修正"**）

这些是**已核对的配置内部不一致**。页面按引擎实际读取的字段显示，**不擅自修原表，也不在页面上"改正"**。

| 项目 | 差异 |
| --- | --- |
| 营地中心 5 级 | 文案写 175→200，但 `campDecMaxChange=200`，基础上限 100，源码实际读取结果是 **300**；6 级为 225。页面使用数值字段 |
| 货运站 3 级 | 文案写加成 5→10，但 2 级 `orderWeight=5`、3 级 `=10` 按源码**逐级累加**，实际总加成 **15** |
| 伤口处理 / 快速搭建 | `addDes` 是 4%/8%/12%，`actionPara` 是 0.4/0.8/1.2，倍率单位与文案不能直接等同 |
| 破甲战术 / 元素克制 | 9/10 级要求中心 8 级，而建筑表最高中心 7 级。**保留研究条件，但不生成中心 8 级链接，也不补造等级数据** |
| 最高级残留费用 | 中心 7、锻造台 9 等末级仍有 `consume`/门槛字段，源码在不存在下一等级时屏蔽升级。本页同样不显示 |
| `穿甲箭` 伤害倍率 | `para.damage.muPower` 恒为技能说明文本的 **1.1 倍**（Lv.18：buff 3.05 → 页面 305%，说明写 277%），21 级全部如此。而 `胜军之加护`、`重锤眩晕` 的说明与 buff **完全一致**。页面显示引擎实际使用的 buff 值，说明文本疑似某次平衡调整后未同步重生成 |
| 配置笔误 | `attr.restoreHp/restoreSp.percent` 与顶层 `atkSpeed` 有少量漏乘 100 的值（0.05、-0.1 等）。**在渲染时归一化，不改写原表**，逐条记录在 `buffParser.js` 的 `PERCENT_TYPO_KEYS` |
| `damage.repelForce` | 是**击退力度系数**不是距离；`damage.repelSpeed` 源码无读取点，不展示；`attr.cirtDam` 疑似死键但保留原值 |
| 6 个 `buffEffect` | 在源码 switch 里**没有分支**，配置存在但游戏里不生效，由 `BROKEN_BUFF_EFFECTS` 排除 |

---

## 四、验证缺口（**未复测 = 未验证**）

| 项 | 状态 |
| --- | --- |
| `#/privacy` 与兜底路由的**真机**覆盖 | 只有桌面 Playwright 用例，**没有真机用例** |
| 844×390 长邮件正文不可见 | 2026-09-11 记录过自动化失败；**此后未复测**，不能据其他通过项宣称已修复 |
| 关卡内部房间路线图 | `battle.layers[].map` 同构于副本，**尚未渲染** |
| 深色模式 | 2026-10-02 起挂着，当前只隐藏了切换按钮，**代码保留** |
| 探索区域卡片观感 | 已定位（风景图塞进正方形 slot 只占 68%），**未改** |
| 讨论区面板高度魔数 | `calc(--vh100 - … - 190px)` 是推算值，1025 宽时与其他视口差 12px。要动它必须先在 1025 / 1161 / 1440 三视口复核 |
| 移动端 < 360px | 复杂概率文本的字号与排版待微调 |
| 怪物 Buff / 异常状态数值 | `raw/buff.json` 含完整定义，可落地为独立模块，**未做** |
| CSP 是否误伤线上 | **已验证通过（2026-10-07）**：本地 `check-csp.mjs` 9 个场景零违规（含 8 张 `data:` 蛋图确实渲染）；生产强制模式下 4 个页面 398 张图零坏图、零违规。**回归入口**：`npm run build` 后 `node scripts/dev/check-csp.mjs` |
| 任务黑名单的「提到地名」误伤 | 序章 2 条（`main_0_04` / `main_0_04_q`「前往驿站」）因 `desc` 含「黑森林」被隐藏，实际发生在求生者草原。**属旧逻辑，非回归**；修它要动 `desc` 是否参与匹配，**会影响全站所有页面**，用户 2026-10-07 决定**先不动** |
| 剧情台词提到隐藏地区 | 搜剧情能看到「黑森林」等词（如 `fav_hero_025_1`）。**刻意不处理** —— 数据里没有"剧情属于哪个地区"的字段，按文本匹配必然误伤 |

---

## 五、环境与流程风险

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| **`git push` 即上线** | 无二次确认 | 见第一节 |
| **旧域名是唯一退路** | 旧 Android 包的 `CLOUD_URL` 编译时写死 | 热更包铺开前不动 `myrzg.*` |
| **凭据误提交** | 会导致账号被接管 | 凭据放项目外 `_ai-credentials/`；用 `setx` 设用户级环境变量；有 `tests/unit/secret-leak.test.mjs` |
| **密钥泄漏检查假阴性** | 第一版把 41 字符的 `AUTH_PEPPER` 判成"开发占位值"（正则用了 `/i` 又没锚定整串），整个检查**静默变成空操作** | 只在"整个值就是一个已知占位词"或"长度 < 12"时才降级；**拿不准一律算真密钥** |
| **「有记录」≠「信发出去了」** | 发信在 `context.waitUntil` 里异步执行，失败只写 Worker 日志。2026-10-06 事故：接口返回成功、`auth_codes` 有记录，但**邮件一封都到不了** | 本地 `MAIL_STUB=1` 时根本不发信，所以本地全绿不能证明线上能发 |
| **Cloudflare 账户级令牌校验方式** | `cfat_` 前缀令牌用 `/user/tokens/verify` **一律回 `1000 Invalid API Token`** | 正确方式是拿它打真实端点（`/accounts`、`/pages/projects`）。这个误判曾浪费三轮排查 |
| **EdgeOne 缓存策略优先于 `_headers`** | 文件写对 ≠ 线上生效 | 改完用 `npm run cdn:check` 打真实响应头复测 |
| **加 EdgeOne 加速域名不配证书** | 整个域名 HTTPS 不可用（`ERR_EMPTY_RESPONSE`） | 选「申请免费证书 + 自动验证」 |
| **Playwright 并发** | 调高会压死单进程 `wrangler dev` + 单 SQLite 文件，失败的是互不相干的一堆 spec | 保持 `workers: 2` |
| **PowerShell 写中文文件** | `Set-Content`/`Out-File` 会 GBK 乱码或加 BOM | 用编辑工具或 Node `fs.writeFileSync(..., 'utf8')` |
| **前端直接引用 `raw/`** | 原始大表不该进浏览器 | 运行时只能读 `public/data/parsed/` |

---

## 六、本文件的维护

- **现象 → 根因 → 解法**，标明负责模块；不要为套用历史修复而无条件修改 `UiModal`、状态与 App 三处。
- 报告是**当日结果**，不写成永久结论。未复测的项明确标注。
- 新增条目先查是否已有归属；同类问题合并，不为一次改动新建章节。
