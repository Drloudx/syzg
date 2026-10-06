# 完整交接文档（2026-10-03 版 + 2026-10-04 评论模块追加 + 2026-10-05 状态勘误）

> 这份文档是给**下一个接手的人或 AI** 看的完整入口。读完应该能：
> 知道站点现在跑在哪、怎么发版、怎么验证、改哪里会出什么事、还剩什么没做。
>
> 它取代并整合了此前散落的临时说明。日常规范仍以
> [SPEC](SPEC.md) / [ARCHITECTURE](ARCHITECTURE.md) / [UI 组件库](UI_COMPONENT_LIBRARY.md) 为准；
> 本文只讲"现状 + 运维 + 这次的迁移 + 剩什么"。
> **评论/讨论模块的功能细节**看 [HANDOFF 第九节](HANDOFF.md)（那里是收口），
> 本文只记它对运维与验证的影响。
>
> 项目：[深渊大书院](https://syzg.yxzmy.top)（原名「深歌小助手」，《深渊之歌》Wiki 工具）
> 本地路径：`E:\Desktop\html\myrzg\vue-myrzg`（**目录名仍是 myrzg，刻意不改**）
> 远端：`https://github.com/Drloudx/syzg`

---

## 一、一句话现状

**站点已上线、功能完整、改名完成。**
`syzg.yxzmy.top`（新）与 `myrzg.yxzmy.top`（旧）**同时在线**，
新旧两个 Cloudflare Pages 项目共用同一个 D1 数据库。
旧的保留是**故意**的——它是退路，也是旧 Android 包的依赖。

| | 值 |
| --- | --- |
| 线上域名 | `https://syzg.yxzmy.top` |
| 仓库 | `Drloudx/syzg`（`main`） |
| 构建 | Cloudflare Pages 项目 `syzg`，`npm run build` → `dist`，GitHub 推送自动部署 |
| 后端 | Pages Functions `functions/api/[[path]].js`（单文件）+ D1 |
| 数据库 | `myrzg-comments`（**名字未改**，`5f0d4c37-107f-4811-bc5e-768f73c51a3a`） |
| 验收 | `npm run verify` 全绿（2026-10-04 复跑）；单测 177/177；评论套件 14 套全绿 |

**2026-10-04/05 的改动已提交，但尚未推送。** 截至 2026-10-05 17:00，本地 `main`
领先 `origin/main` **3 个提交**：`0c745272`（评论模块：表情 / 富文本 / 回复 / 楼中楼 / 滚动自动加载）、
`b8aaf946`（移动端贴边悬浮拉手初版）、`a3729989`（悬浮拉手无缝胶囊重构 + 长列表快滑图片防排队）。
部署注意：**不需要 D1 迁移**（回复用的是建表时预留的 `parent_id`），
但要多一次前端构建（新增 93 张表情素材 + 重生成的字体子集），素材与单测**都已入库**，
直接 `git push` 即可。

---

## 二、🔴 接手第一件要知道的事

### 2.1 千万别"顺手改掉"这三个 myrzg

改名做得很彻底，但有**三处刻意保留旧名**，改了会出事：

| 保留的东西 | 为什么不能改 |
| --- | --- |
| **本地目录 `vue-myrzg`** | 改目录名会打断本机所有绝对路径引用（`_ai-credentials/`、`backups/` 里的文档链接、脚本里的路径） |
| **旧仓库 / 旧 Pages 项目 / 旧域名** | 旧 Android 包里的 `CLOUD_URL` 是**编译时写死**的；旧域名一停，老包在线资源全失效。**同时它也是唯一的退路** |
| **`wrangler.toml` 的 `name` 与 `database_name`** | 本项目由**控制台 Git 集成**构建，该文件只在**本地手动跑 wrangler** 时生效；旧 Pages 项目还在，改名会冲突。理由已写在文件注释里 |

> 文档里还有大量 `myrzg` 字样，多数是**历史记录**（`docs/dev-logs/**`、`backups/**`），
> **不要批量替换**——那些是归档，改了反而失真。

### 2.2 现在的"双份"结构（容易看晕）

```
GitHub   Drloudx/syzg（新，在用）        Drloudx/myrzg（旧，保留）
             │                                │
Pages    syzg.pages.dev                  myrzg.pages.dev
             │                                │
EdgeOne  syzg.yxzmy.top                  myrzg.yxzmy.top
             │                                │
             └────────► 同一个 D1 ◄───────────┘
                  （myrzg-comments，评论数据互通）
```

**两个域名的内容目前是同源的、但产物不同**：`ui-*.js` 里内嵌的 `CLOUD_URL` 不一样
（新的指向 `syzg.yxzmy.top`，旧的指向 `myrzg.yxzmy.top`）。所以改完代码要**两个项目都会自动构建**，
各自产出各自域名的包——这是正常的，不是构建错乱。

---

## 三、部署链路（这一段不在代码里，最容易被漏）

### 3.1 请求怎么走

```
用户（大陆为主）
  │  DNSPod：syzg.yxzmy.top CNAME → syzg.yxzmy.top.eo.dnse3.com
  ▼
腾讯云 EdgeOne 边缘节点  ← 大陆加速在这一层
  │  回源 syzg.pages.dev
  ▼
Cloudflare Pages 项目 syzg
  │
  ▼
Cloudflare D1
```

**为什么两层 CDN**：Cloudflare Pages 本身是全球 CDN，但**大陆没有节点**，所以前面套 EdgeOne。
两层**不会让静态资源更快**，EdgeOne 的价值只在"大陆可达性"。
（`yxzmy.top` 的 NS 是 `peach/henry.dnspod.net`，即 **DNSPod，不在 Cloudflare**。）

### 3.2 各级账号与凭据

| 平台 | 谁管 | 我能做什么 |
| --- | --- | --- |
| GitHub | `gh` CLI 已登录 `Drloudx`（scopes: `gist, read:org, repo, delete_repo`） | 建/删仓库、改名、推送 |
| Cloudflare | API 令牌（**账户级**，`cfat_` 前缀）存在 `E:\Desktop\html\myrzg\_ai-credentials\CLOUDFLARE_API_TOKEN.txt`；Account ID `9bb287eaddc536b57fa3a88d856416d2` | Pages 项目/自定义域名、D1、读部署状态。**当前令牌权限：Pages Write + D1 Write（无 D1 Edit）** |
| 腾讯云 EdgeOne / DNSPod | **只能用户在控制台操作** | —（无 `tccli`、无腾讯云密钥） |

> ⚠️ **凭据的坑**：账户级令牌（`cfat_`）**不能用 `/user/tokens/verify` 校验**，
> 它对这种令牌一律回 `1000 Invalid API Token`。**正确校验方式是拿它打真实端点**：
> `/accounts`、`/accounts/{id}/pages/projects`、`/accounts/{id}/d1/database`，通即有效。
> 另外这种令牌通常**读不到 `/accounts/{id}` 本身**（403），属正常。
> **这个误判曾浪费三轮排查**，已写进 [改名文档](rename-myrzg-to-syzg.md)。

### 3.3 缓存策略（两侧都在管，最容易打架）

| 路径 | 源站 `public/_headers` | EdgeOne 规则 |
| --- | --- | --- |
| `/api/*` | `no-store` | 不缓存 |
| `/`、`/index.html` | **`no-cache`**（每次回源校验） | — |
| `/assets/*` | `immutable, max-age=31536000` | — |
| `/data/parsed/**` | `immutable, max-age=31536000` | — |
| `/fonts/*` | 1 年 + `?v=` 内容哈希 | 未被改（实测 604800） |
| 图片 `jpg/png/gif/bmp/webp` | 7 天 | **浏览器缓存 TTL = 7 天**（2026-10-03 配置） |
| `svg` | — | **单独一条 = 1 小时**（刻意短：部分 svg 走硬编码路径、不带 `?v=`） |

**已知代价**：首页 HTML 是 `no-cache`，**每次都要跨洋回源**（实测 TTFB ~1.4s，
大陆 ITDOG 平均 1.9s）。这是"发版立刻生效"换来的。**要提速可在 EdgeOne 给
`/` 与 `/index.html` 配节点缓存 TTL（如 10 分钟）**，代价是发版后要手刷缓存——
**未做，是个可选项，不是 bug。**

**历史**：EdgeOne 曾把图片 7 天改成 1 小时（2026-09-27 排查时结论是"免费版没入口"），
2026-10-03 用户在控制台找到并改回。**改这类规则务必复测**：
`node scripts/dev/scratch/probe-cache-headers.mjs`。

### 3.4 证书（最能突然搞挂站点的东西）

- EdgeOne 免费证书 = **自动申请 + 自动续签**，在"域名详情 → 配置证书"里选
  **「申请免费证书 + 自动验证」**。
- 🔴 **加了加速域名但不配证书 = 整个域名 HTTPS 不可用**：
  浏览器 `ERR_EMPTY_RESPONSE`、curl `(52) Empty reply` / `(35) TLS 握手失败`。
  用 `probe-domain.mjs` 会看到 EdgeOne 在甩兜底证书 `*.cdn.myqcloud.com`（`authorized=false`）。
  **2026-10-03 踩过这个坑**：不是 DNS 问题、不是缓存问题，纯粹是证书没配。
- ⚠️ `myrzg.yxzmy.top` 的证书由 Cloudflare 以 `http` 方式签发（TrustAsia），
  **到期时间比新域名早**（2026-10-23）。接手后建议确认它是否已自动续期。

---

## 四、怎么验证（照抄即可）

```powershell
cd E:\Desktop\html\myrzg\vue-myrzg

# 1) 本地开发（两个服务都要起）
npm run dev           # 5173
npm run dev:api       # 8788（评论 API；不起则评论报"无法连接评论服务器"）

# 2) 全量验收（数据再生成 + 构建 + 产物完整性 + 字体子集）
cmd.exe /c "npm run verify"     # 注意：Windows 下 npm 要用 cmd.exe /c

# 3) 线上探测（都在 scripts/dev/scratch/，gitignored，只读）
node scripts/dev/scratch/probe-domain.mjs          # DNS / HTTPS / TLS 证书三方对照
node scripts/dev/scratch/probe-cache-headers.mjs   # 各类资源的缓存头
node scripts/dev/scratch/probe-live-assets.mjs     # 线上首页引用的资源是否真实存在
node scripts/dev/scratch/probe-bundle-domain.mjs   # 线上产物里内嵌的是新域名还是旧域名
node scripts/dev/scratch/speed-compare.mjs 3       # 新旧域名耗时分解
```

**评论/讨论的回归套件**（2026-10-04 起：脚本清库前会**自动备份本地评论**、退出时还原，
实现见 `scripts/dev/scratch/lib/comment-fixture.mjs`；**别再手动 `DELETE FROM comments`**——
开发时人就在同一个本地库上手点页面，清库会让他的页面"列表变短、挤一下"）：

| 脚本 | 覆盖 | 上次结果 |
| --- | --- | --- |
| `verify-post-scroll.mjs` | 发表时滚动跟随（同帧/贴底跟随/翻历史不动） | 12/12（桌面+手机） |
| `verify-cross-device-poll.mjs` | 跨设备轮询（另开的浏览器上下文=另一台设备） | 8/8 |
| `verify-no-flicker.mjs` | 逐帧 130 帧证明布局不抖 | 9/9 |
| `verify-discussions.mjs` | 站内讨论区布局与右栏 | 36/36 |
| `verify-chat-order.mjs` | 聊天式排序 + 上滑自动加载 | 11/11 |
| `verify-autoscroll.mjs` | 打开/发表后停在最新 | 6/6 |
| `verify-discussions-order.mjs` | 排序 + 200 字上限 | 9/9 |
| `verify-comment-mounts.mjs` | 9 个页面逐个验证讨论区挂载 | 27/27 |
| `verify-comments-ui.mjs` | 详情里评论全流程 | 68/68 |
| `verify-emoticons.mjs` | 表情选择器 / 富文本插入 / 显示字数 / 四处渲染 | 66/66 |
| `verify-replies.mjs` | 回复（引用式）：两条链路 + 手机端 + 服务端降级 | 24/24 |
| `verify-nested-replies.mjs` | 楼中楼：前 3 条 + 展开收起 + 滚到底自动加载 + 孤儿升级 | 28/28 |
| `verify-hero-comment-e2e.mjs` | 非物品页面发帖 → 管理页可见 | 4/4 |
| `verify-admin-occlusion.mjs` | 管理页筛选面板遮挡（面板不透明 / z-index / 卡片确实滚过） | 5/5 |
| `measure-poll-cadence.mjs` | 实测轮询间隔 | 60024ms |
| `measure-poll-cost.mjs` | 实测轮询开销 | 2 请求/6.8KB 每周期 |

> 跑之前清限流（`DELETE FROM rate_limits;` 即可，**不要连评论一起删**），
> 否则会因"每 IP 每小时 5 条"的限流误判失败。
> 本地库被测试数据堆脏时（几百条 `historyN` / `楼主N`）：
> `node scripts/dev/scratch/clean-test-comments.mjs`（预览）→ `--apply` 真删，
> 只按已知测试签名匹配，站主自己发的评论不会被删。

---

## 五、这次（2026-10-03）做了什么

### 5.1 修掉"讨论区发表时闪一下"（交接文档列为最优先的遗留项）

**交接时假设的三个成因全都不成立**（实测否定了）：

| 交接时的假设 | 实测结论 |
| --- | --- |
| 面板高度用 `--vh100` 推算有偏差 | ❌ 6 种视口下面板底边恒在视口下 20px、`.app-container` 零溢出 |
| 发表区/滚动区/滚动条尺寸抖动 | ❌ 逐帧全程零变化 |
| 列表被重建 | ❌ MutationObserver 只记录 `+1/-0` 一次 |

**真正根因是滚动跟随**：① 插入后**晚两帧**才滚（双 rAF），中间先绘制一帧"已插入但没跟下去"的画面；
② `scrollTop = scrollHeight` 是**瞬移**——用户翻着历史时点发表，实测 `577 → 1196`（**一帧甩 619px**）。

**改法**（`src/views/DiscussionsView.vue`）：滚动位置收敛为**唯一决策点**——
`watch(commentsLength, { flush:'post' })` 在"DOM 已更新、尚未绘制"这一帧决定；
首次载入直接落底，之后走 **260ms easeOutCubic 逐帧动画**（目标每帧重取、只增不减）；
**只在插入前就贴着底部（120px 内）才跟随**，用户翻历史时原地不动。

顺带修掉两处间距问题（用户看截图指出）：`UiSection` 自带 18px 尾部外边距让
**滚动条比最后一张卡片长一截**（就地清零，不动全局组件）；清零后贴太死，
补 10px 呼吸间距并把面板底部内边距 14→6px，让"卡片＋滚动条"整块上移。

**A/B 对照**（证明断言真能区分新旧）：旧实现单帧 **78px** 瞬移 + 翻历史漂移 **619px**；
修复后单帧最大 **13px**、漂移 **0.0px**。

### 5.2 让别人发的消息不用重开页面就能出现

**根因**：中间区域**根本没有自动刷新**（`pageKey` 恒为 `site:general` 不变；
`commentEvents` 广播只在同一标签页内传、**不跨设备**），所以右栏出现了、中间没有。
右栏则是 30 秒轮询 → 所以"一半有一半没有"。

**改法**：抽 `composables/useVisibilityPolling.js`（中间与右栏共用）；
间隔抽到 `config/discussions.js` 的 **`DISCUSSION_POLL_MS = 60000`（1 分钟，用户指定）**，**一处维护**；
刷新走 `CommentsPanel.mergeNewComments()`——**只并新增，不替换列表**
（`load()` 会整体替换，把"上滑加载的更早消息"丢掉）。

四个边界集中在共享工具里：后台完全停跑（实测隐藏 25 秒 0 请求）、切回立即补一次、
预渲染不跑、`setTimeout` 递归避免堆积。

**额度账**（1 分钟）：5 人 × 4 小时/天 ≈ **2400 请求/天** = Functions 免费版 10 万/天的 **2.4%**。
**轮询只挂讨论区**；物品详情等页面的评论面板不轮询（首页点开极频繁）。

### 5.3 首次上线 + 线上验收

推送 29 个提交后才第一次真正上线（此前线上跑的是旧代码）。
**关键发现**：推送前 `myrzg.yxzmy.top/api/health` 返回 `200 + text/html`——
**线上 Functions 从未生效，评论功能在线上一直不可用**；推送后 40 秒恢复。

### 5.4 仓库/域名改名 myrzg → syzg（详见 [改名文档](rename-myrzg-to-syzg.md)）

**两处偏离原计划，都是实测后改的**：

1. **不是"改仓库名"，而是"删旧建新"**——`Drloudx/syzg` 早已被占用（2026-05 的旧版站点 + GitHub Pages）。
   处理：mirror 备份到 `backups/syzg-old-repo-202605.git` → 删 → 建同名空仓库 → 推 180+ 提交。
   **`myrzg` 仓库未删**。
2. **不是"改 Pages 项目名"，而是"新建项目"**——改 `myrzg` 项目名会让 `myrzg.pages.dev` 消失，
   叠加 EdgeOne 回源就**丢掉退路**。新建 `syzg` 项目后两个 `*.pages.dev` 同时可用，**可秒回滚**。

代码侧：`CLOUD_URL`、`hotupdate.json`、测试 URL、文档 → 已改为新域名并推送（commit `097ad8fd`）。
**线上验证**：`syzg.yxzmy.top/assets/ui-*.js` 含 `syzg.yxzmy.top`、不含旧域名 ✅

### 5.5 顺手修掉的旧问题

- **4 条失效文档链接**（`dev-logs/2026-10/*.md` 少一级 `../`、`COMMENTS_BACKEND` 指向 `KNOWN_BUGS` 的路径）
  → 现在 **168+ 条相对链接全部有效**（校验脚本见第七节）。
- **EdgeOne 图片缓存 1 小时 → 7 天**（用户控制台配置；规则改为
  `jpg png gif bmp webp`=7 天 + `svg` 单独 1 小时）。

---

## 五·B、2026-10-04：评论模块补齐（运维视角）

功能细节不在这里重复，**看 [HANDOFF §九](HANDOFF.md)**（数据怎么存、两种列表形态、
接口契约、9 条踩坑清单、还没做的优先级表）。运维与验证只需记住这几点：

1. **不需要 D1 迁移**：回复用建表时就预留的 `comments.parent_id`，
   `schema.sql` 只是把注释从"一期预留"改成"已启用"。远端库不用跑任何 SQL。
2. **多两类新产物**：`public/images/emoticons/`（93 张无损 WebP，约 590 KB）
   与 `public/ui/emoticon.svg`；字体子集已重生成（`npm run fonts:subset` 的
   断言会核对，忘了就会 `verify` 失败）。
3. **接口形状变了但向后兼容**：`POST /api/comments` 多了可选 `parentId`，
   返回体多了 `parentId` / `replyTo` /（列表侧）`rootId`；旧的平铺取法**一字未改**，
   所以线上旧前端配新后端也能跑。
4. **限流与字数**：上限改成"显示字数"（一个表情算 1 字），
   服务端另有原始长度闸门 `MAX_BODY_RAW = 8200`（放在 `sanitize` **之前**）。
5. **测试卫生**：脚本清了库会**自动还原**（`lib/comment-fixture.mjs`）。
   ⚠️ 还原走 `--file`，不能用 `--command`（50 条以上的 INSERT 会超命令行长度上限，
   实测"报错且数据没写回去"）。`seed-site-discussion.mjs` 是显式重置工具，故意不接入。
6. **顺手修好的旧脚本**：`verify-admin-occlusion.mjs` 一直去 `#/admin/comments`，
   而路由早改成 `#/admin`（脚本没跟着更新，长期跑不起来）→ 现在 5/5 通过。

---

## 六、还没做的（按优先级）

> **评论模块自身还没做的功能**（新消息提示 / 草稿与重试 / 表情"最近使用" / 回复提醒全局化…）
> 单独列在 [HANDOFF §九·9.7](HANDOFF.md)，不重复。

| 优先级 | 事项 | 为什么 / 前置 |
| --- | --- | --- |
| **P0** | **推送已提交的 3 个提交** | `0c745272`（评论模块）+ `b8aaf946` / `a3729989`（移动端悬浮拉手）。**是"已提交未推送"，不是"未提交"**：素材 / 组件 / 单测 / 开发日志都已入库，直接 `git push`，不需要补 `git add`。**无 D1 迁移**，但要多一次构建 |
| **P0** | **发 Android 热更包** | 旧 APK 的 `CLOUD_URL` 写死旧域名 → **这是下掉旧域名的唯一前置**。我能备包（`cap sync` + 打 zip + 更新 `hotupdate.json` 版本），**签名与真机安装要用户做** |
| **P1** | 账号体系（未实施） | 方案 **2026-10-05 已重写**：[账号体系方案](technical/ACCOUNT_SYSTEM.md)。需求是**注册邮箱验证码 + 密码登录 + 改密码邮箱验证**；**已确认路线：客户端 KDF**（2026-10-05；服务端 KDF 受平台封顶：PBKDF2 ≤ 10 万轮、scrypt `N×r×p ≤ 1,048,576`）。**两个前置**：① 发信最小验证（腾讯云 SES + SPF/DKIM；**Cloudflare Email Service 用不了**——需 Paid 且发信域名须是 Cloudflare zone，而 `yxzmy.top` 的 NS 在 DNSPod）；② 隐私政策页位置 |
| **P2** | 收尾旧域名 | 热更包铺开后：移除 `myrzg.yxzmy.top` 的 Pages 自定义域名 + EdgeOne 加速域名。⚠️ 建议先保留 301 一段时间，避免老分享链接失效 |
| **P2** | D1 库名统一为 `syzg-comments` | 纯装饰（绑定走 `database_id`）。当前令牌**没有 D1 Edit 权限**，API 改名返回 400 → 需用户在控制台改，或换有 Edit 权限的令牌 |
| **P3** | 首页 HTML 边缘缓存 | 见 3.3。配 EdgeOne 节点缓存 TTL（如 10 分钟）可把大陆首页从 ~1.9s 压到 ~0.5s，代价是发版后手刷缓存 |
| **P3** | 探索区域卡片观感 | 风景图（440×280）塞进正方形 slot 只占中间 68%，四周露出大片品质框，加载时像"空框"。可放宽图标比例或加淡入。**已定位，未改** |
| — | 深色模式自身问题 | 2026-10-02 起挂着（当前只隐藏了切换按钮，代码保留） |
| — | 关卡内部房间路线图 | `battle.layers[].map` 同构于副本，尚未渲染 |
| — | EdgeOne 缓存规则推广到旧域名 | 规则已生效于新域名；旧域名的缓存副本过期后自动跟上（1 小时内） |

---

## 七、常用操作与红线

### 7.1 命令

```powershell
npm run dev / dev:api        # 两个服务
cmd.exe /c "npm run verify"  # 全量验收（Windows 下 npm 必须走 cmd.exe /c）
cmd.exe /c "npx cap sync android"   # 同步原生壳
npm run fonts:subset -- --apply     # 数据更新后重新子集化字体（否则 verify 失败）
npm run cdn:check            # 只读核对线上缓存头（需网络，不进 verify）
node scripts/dev/scratch/seed-site-discussion.mjs          # 显式重置本地演示评论（会清空评论表）
node scripts/dev/scratch/clean-test-comments.mjs [--apply] # 只清测试脏数据，保留站主自己的评论
npx wrangler d1 execute myrzg-comments --local --command "DELETE FROM rate_limits;"   # 跑评论测试前清限流
```

### 7.2 红线（改了会出事）

1. **`CLOUD_URL` 会被编译进产物** → 改它等于要求所有 Android 用户更新。
2. **旧域名/旧项目是退路** → 热更包铺开前不要动。
3. **改名 Pages 项目 = 改 `*.pages.dev`** → EdgeOne 回源必须同步改，否则整站 502。
4. **加 EdgeOne 加速域名必须配证书** → 否则整个域名 HTTPS 不可用。
5. **`npm` 在 Windows 下走 `cmd.exe /c`**；**写中文文件用编辑工具或 Node `fs.writeFileSync(...,'utf8')`**，
   不要用 PowerShell `Set-Content`/`Out-File`（会 GBK 乱码或加 BOM——提交信息踩过 BOM）。
6. **改 `functions/` 必须重启 `dev:api`**（wrangler 不热加载）。
7. **评论类测试脚本会清库造数**，但 2026-10-04 起**退出时自动还原**；
   **不要手动 `DELETE FROM comments`**（开发时人就在同一个本地库上手点页面），
   要重置演示数据就跑 `seed-site-discussion.mjs`（它才是显式的重置工具）。
8. **`backups/**` 与 `docs/dev-logs/**` 是归档**，不做域名替换。
9. **改了评论的数据/接口形状就同步三处**：`src/config/emoticons.js`（若是表情相关）、
   `docs/technical/COMMENTS_BACKEND.md`、`docs/HANDOFF.md` §九——
   评论模块的"收口"在 HANDOFF 第九节，接手者先看那里。

### 7.3 文档链接校验（纯文档改动时跑）

```powershell
node -e "
const fs=require('fs'),path=require('path');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
let bad=0,total=0;
for(const f of walk('docs').filter(f=>f.endsWith('.md'))){
  const txt=fs.readFileSync(f,'utf8');
  for(const m of txt.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)){
    const t=m[1]; if(/^https?:|^mailto:/.test(t)) continue; total++;
    if(!fs.existsSync(path.resolve(path.dirname(f),t))){ bad++; console.log('  ✗ '+f+' -> '+t); }
  }
}
console.log(total+' 条相对链接，失效 '+bad+' 条');
"
```

---

## 八、文档地图（改代码前先找对文档）

| 文档 | 职责 |
| --- | --- |
| [SPEC](SPEC.md) | 总规范：路由、21 个页面的功能/数据链/URL 契约、共享模块、资源与验收 |
| [ARCHITECTURE](ARCHITECTURE.md) | 目录职责、依赖方向、请求/缓存、构建发布 |
| [UI_COMPONENT_LIBRARY](UI_COMPONENT_LIBRARY.md) | 羊皮纸设计系统、组件接口、页面骨架、强制规则 |
| [KNOWN_BUGS_AND_FIXES](KNOWN_BUGS_AND_FIXES.md) | 14 类疑难 bug 的「现象→根因→解法」（含滚动跟随、聊天式列表、评论漏进右栏） |
| [HANDOFF](HANDOFF.md) | 项目交接（功能视角）；**评论/讨论模块的收口在它的第九节**；本文是完整版（含运维与迁移） |
| [rename-myrzg-to-syzg](rename-myrzg-to-syzg.md) | 改名迁移：执行进度、踩坑、回滚点 |
| [技术·评论后端](technical/COMMENTS_BACKEND.md) | 评论/讨论：设计、缓存风险、错误文案契约、即时推送的成本分析 |
| [技术·账号体系](technical/ACCOUNT_SYSTEM.md) | 账号落地：D1 迁移、接口契约、发信验证、里程碑 |
| [features/*](features/) | 营地设施、符石、伙伴邮件、副本、招募、右栏吉祥物 |
| [dev-logs/YYYY-MM/](dev-logs/) | 每日开发日志（归档，不作规范） |

---

## 九、接手建议（第一条该干什么）

1. **先跑一遍验收**：`cmd.exe /c "npm run verify"` + 起两个 dev 服务 + 打开 `/#/discussions` 发一条评论。
   （评论套件现在会自己备份/还原本地数据，不必再手动重建演示数据。）
2. **确认线上两域名都活着**：`node scripts/dev/scratch/probe-domain.mjs`
   —— 应该看到 `syzg` 与 `myrzg` 都 `authorized=true`。
3. **评论模块先读 [HANDOFF §九](HANDOFF.md)**：数据怎么存、两种列表形态（讨论区平铺 /
   详情页楼中楼）、接口契约、9 条踩坑清单、还没做的优先级表都在那里。
4. **然后按第六节优先级挑活**。最该做的是 **P0：`git push` 那 3 个已提交的提交 + 发 Android 热更包**
   （后者是解锁旧域名下线的唯一前置）。

有任何不确定，**先只读探测、再改动**。这次的教训之一就是：
"看起来像 X"（缓存没热 / token 无效 / 图片加载失败）经过实测往往是别的东西
（跨洋回源 / 校验端点不适用 / 品质框占位）。
