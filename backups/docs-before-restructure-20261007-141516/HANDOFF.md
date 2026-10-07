# 项目交接说明文档 (HANDOFF)

> 更新时间：2026-10-03（最近一次：发布闪烁修复 + **仓库/域名改名 myrzg → syzg** + 域名迁移落地；
> 2026-10-05 勘误：评论模块与移动端悬浮拉手**已提交、尚未推送**，此前"尚未提交"的说法已过时）
> 项目路径：`E:\Desktop\html\myrzg\vue-myrzg`（**目录名仍是 myrzg，这是刻意保留的**，见〇·0.0）
> 远端仓库：`https://github.com/Drloudx/syzg` ｜ 线上域名：`https://syzg.yxzmy.top`
> 技术栈：Vue 3 + Vite 8 + Pinia + Capacitor Android
> 适用对象：后续接手开发对话/工程师
>
> ⚠️ **本次改名很彻底**，接手第一件事请先读 **〇·0.0「现在的仓库与域名」**——
> 文档里不少地方还写着 `myrzg`，那是**旧名/历史记录**，不代表现状。
>
> 📘 **运维与迁移的完整版本在 [HANDOFF_FULL.md](HANDOFF_FULL.md)**：
> 部署拓扑（EdgeOne → Pages → D1）、凭据与校验的坑、缓存策略、验证命令、
> 改名迁移全过程、剩余待办优先级。**建议先读那份，再回来看本文的功能细节。**

---

## 〇、最新状态（2026-10-06）：账号体系**已上线并跑在生产上**

> 这一节是给接手者的**入口**。改名过程见 [改名落地文档](rename-myrzg-to-syzg.md)，
> 闪烁修复见下文 0.5，评论模块的全部改动见
> [开发日志 2026-10-04](dev-logs/2026-10/2026-10-04.md) 与
> [评论后端方案](technical/COMMENTS_BACKEND.md)；
> **账号体系的方案见 [ACCOUNT_SYSTEM.md](technical/ACCOUNT_SYSTEM.md)**
> （§一~§十七是动手前的设计，**§十八是实现记录与偏差**）；
> **逐轮的完整过程（含踩坑与排查）见
> [开发日志 2026-10-05](dev-logs/2026-10/2026-10-05.md) 的 §18 之后**。

### 一句话现状

**账号体系做完并上线了。** 生产库已迁移、代码已部署、
[线上验证 18/18](technical/GO_LIVE_ACCOUNT_SYSTEM.md)、
[真机全流程 38/38](../tests/phone/flow.mjs)。

**Playwright 全套已清零**（2026-10-06，见下「接手第一件事」）。

```
单测        264 / 0
迁移演练     29 / 0
端到端      100 + 42 / 0
真机         38 / 0
生产验证     18 / 0
Playwright  272 passed / 0 failed / 4 skipped（2026-10-06 全量复跑）
```

---

## ✅ 接手第一件事（已完成 2026-10-06）：Playwright 既有失败已全部清掉

> 这一节保留**方法**与**踩坑记录**——那套「改测试还是改产品」的判断办法仍然有效，
> 而且这次正是靠它抓出了一个**被测试固化住的真 bug**。清单本身已经清空。

### 上一轮留下的清单，以及本轮的结论

| spec | 上一轮的判断 | 本轮结论 |
| --- | --- | --- |
| `furniture.spec.js:81` | 🔴 最可疑，显示"未知"像数据问题 | **测试过期**。`通行证 → 未知` 是 `SOURCE_DISPLAY_ALIAS` 的**刻意伪装**（用户要求），断言已改为「伪装生效」 |
| `facilities.spec.js:63` | 数据 or 文案 | **测试过期**。`熔火护盾` 等在黑名单里（"按用户要求隐藏"）；顺带修掉同一根因的**空等级按钮** |
| `partner-mails.spec.js:156` | 布局 or 数据依赖 | 已自行恢复，无需改动 |
| `sidebar-mascot.spec.js` ×2 | IntersectionObserver 时序 or 真没暂停 | 一条已自行恢复；另一条是**断言前提错了**（压到 120px 时吉祥物仍有 38% 可见，`running` 是正确的） |
| `hero-material-links.spec.js:7` | 还没查 | **测试过期**。`.dual-level-slider` 在 `src/` 里**已不存在**（2026-09-25 重做成单滑块 + ＋/－ 步进） |
| `smithing.spec.js:38` | 还没查 | 🔴 **真 bug，而且测试把它固化了**：断言「4 阶装备跳到 `level=4` 能看到魔花头盔」，而设施页早就不渲染 4/5 阶 |
| — | （上一轮**漏列**） | `chapters-map.spec.js:107`：全量红、单跑 6/6 绿 → 并发偶发，未改 |

**教训**：上一轮说"7 条"时清单来自部分 spec 的对照，全量实际 6 条且**漏列一条**。
**别信任何二手清单，自己跑一遍** —— 这句话本轮再次生效。

### 本轮修出的真 bug（值得单独记）

物品详情的「查看锻造台 / 查看设施」**无条件渲染**，而设施页渲染前会过滤黑名单配方与
`HIDDEN_EQUIP_TIERS`（4/5 阶）。判据分散在两处、只有一处跟着改 → **37 条指向空列表的死链**。

根因形状很典型：**同一条业务规则在两个页面各写了一份**。修法是把它收敛成
`config/blacklist.js` 的 `isFacilityRecipeHidden`，三处共用，并用
`tests/unit/facility-recipe-links.test.mjs` 直接对**随包产物**断言「凡被隐藏的配方都不被当成可达目标」。
详见 [2026-10-06 日报](dev-logs/2026-10/2026-10-06.md)。

### 仍然有效的判断办法（改测试还是改产品）

1. 先看**元素/文案是否真的不存在**（探针打 DOM，别只看报错）；
2. 再去 `src/` 里 `git grep` 那个类名/文案 —— 如果**只在测试文件里出现**，
   说明界面早就改掉了，是测试过期；
3. 如果产品里**有意隐藏/隐藏名单**（如 `blacklist.js`、`showThemeToggle`），
   那是产品决策 → 改测试，但**要断言"它被有意去掉"**而不是删掉断言，
   这样将来决策变了测试会红并提醒；
4. **新增**：如果断言的是「跳过去之后能看到 X」，先确认**目标页真的会渲染 X** ——
   `smithing` 那条就是死在这一点上。

```bash
# ⚠️ 必须限并发（原因见下面「🔴 跑全量必须限并发」）
npx playwright test --project=desktop --reporter=line
```

### 本轮已经修掉的（都已提交，别重复修）

| 根因 | 影响 | 修法 |
| --- | --- | --- |
| **暗色切换按钮被有意隐藏**（`App.vue` 里 `showThemeToggle = false`） | 6 个 spec、9 处点击超时 | 新增 [`tests/helpers/theme.mjs`](../tests/helpers/theme.mjs) 的 `enableDarkMode()`，走 `localStorage.theme` + `html.dark-mode` |
| **旧战斗规则页并进了词条百科** | `combat-rules.spec.js` 整个文件在测一个已不存在的界面 | 重写为测「旧地址跳词条百科」+ 内容可达 |
| **旧地址重定向被覆盖**（真 bug） | 用户点 `?tab=combat_rules` 落到不相干页面 | 改到 `/rewards` 的 `beforeEnter` 守卫，并保留 `?q=` |
| 「黑森林/霜烬平原」**被黑名单隐藏** | `app-shell` 两条 | 改成断言"**它不在**" |
| 物品详情**有意多了「讨论」区块** | `app-shell:751` | 断言前 6 个 + 单独确认「讨论」在场 |
| `.ui-section__title` 的 `textContent` 带前导空格 | 同上 | 改用 `innerText` 再 trim |
| 文案改名（「单次抽取」→「概率」、「抽取 3 次」→「获得 3 次」等） | `acquisition-rules`、`runes` | 按实测 DOM 更新 |

### ⚠️ 其中有一个坑，别再踩

`runes.spec.js` 里**同一页面的概率有两条渲染路径**：

```
次数 = 1  →  「概率 23.50%」
次数 > 1  →  「单次抽取 23.50%」（走 formatRewardProbability）
```

我一度把整个文件里的「单次抽取」批量换成「概率」，结果第 99 行过了、
第 105 行反而红了。**批量替换文案之前先确认它有几条渲染路径。**

---

## 🔴 跑全量测试时**必须限制并发**

`playwright.config.js` 现在默认 `workers: 2`。**不要改成按 CPU 核数自动**：

这台机器 `cpus/2` = 8，8 个浏览器会同时打**同一个单进程 `wrangler dev`**，
而本地 D1 是**一个 SQLite 文件** → 大面积 `Test timeout` / `ECONNRESET` /
`/api/recent` 请求失败，**失败的是互不相干的一堆 spec**，
看起来像"到处都坏了"，实际只是把 dev 服务压死了。

要更快就显式覆盖（并自己承担代价）：`PLAYWRIGHT_WORKERS=4 npx playwright test`。

---

## 🔴 这一条对将来仍然有效：`git push` 就是上线

这个仓库用 **Cloudflare Pages 的 GitHub 集成**部署（见 `wrangler.toml` 开头注释）
—— 推送即上线，**没有"再点一下发布"**。

**已经迁过了**（`comments.user_id` 与账号四表都在生产库上），所以**这次不用再迁**。
但只要以后再动表结构，顺序仍是**先迁移、后推送**：
新代码一旦先上线而库里没有对应的列/表，**整个讨论区会对所有人挂掉**
（未登录访客读评论也走同一条 SQL）。

迁移脚本按依赖链拆成三步（**顺序不能换**，每步的失败模式不同）：

```bash
# 1) 先备份
npx wrangler d1 export myrzg-comments --remote --output backup-before.sql
# 2) 建表 + 不依赖新列的索引（幂等）
npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-05-auth-schema.sql
# 3) 加列（非幂等，SQLite 没有 ADD COLUMN IF NOT EXISTS）
npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-05-auth-columns.sql
# 4) 建依赖新列的索引（幂等）
npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-05-auth-indexes.sql
```

> **改任何迁移脚本后都要跑** [`tests/migration/rehearse.mjs`](../tests/migration/rehearse.mjs)
> （`npm run test:migration`）。它从 git 取**迁移前那一版 `schema.sql`**、造临时库、
> 灌真实形状的数据，把三步**真跑一遍**。
>
> 这套演练不是形式：第一次跑就抓出三个**只会在生产上炸**的问题
> （建表顺序写反 → 账号功能整体不可用；索引建在加列之前；`schema.sql` 初始化全新库也是坏的）。

完整手册：[**账号体系上线运维手册**](technical/GO_LIVE_ACCOUNT_SYSTEM.md)
（环境变量、"上线前必须换掉的三件东西"、按现象查因的排查表）。

---

## 🔴 本机环境的坑（不知道这些会白花几小时）

| 坑 | 表现 | 解法 |
| --- | --- | --- |
| **git 连不上 GitHub** | `Could not connect to server`，但 `curl github.com` 是 **200**（极具迷惑性 —— 本机有 FlClash，curl 走系统代理、**git 默认不走**） | `git -c http.sslBackend=openssl -c https.proxy=http://127.0.0.1:7890 push`。⚠️ 只配 `http.proxy` 会 `schannel handshake failed`，**必须同时换 openssl 后端** |
| **wrangler 远程操作** | 非交互环境要求 `CLOUDFLARE_API_TOKEN` | `npx wrangler login`（浏览器授权一次即可，令牌落到 `~/.wrangler`）；并给进程带上 `HTTPS_PROXY` |
| **PowerShell 吃引号** | `node -e "..."` 里的 `[[path]]`、`\\$`、`JSON.stringify` 会被解析坏 | 写成临时 `.mjs` 文件执行；`cmd.exe /c "..."` 里用**单引号**做 SQL 字符串 |
| **`Get-Content` 按 GBK 读** | 中文显示成乱码（文件其实是 UTF-8） | 用 `read` 工具看；或 `Get-Content -Encoding UTF8` |
| **PowerShell 不认 `&&`** | `git check-ignore -q x && echo ok` 报语法错 | 分两条写 |
| **手机调试** | CDP 连得上但 `Page.navigate` 永远超时 | Chrome **冻结后台标签**。`am start` 打开 Chrome + `<Cdp>.bringToFront()`（`tests/phone/flow.mjs` 已内置）；另外选择器要认 `127.0.0.1` 与 `localhost` 两种写法 |
| **手机息屏** | 页面主线程冻结，CDP eval 超时 | 先 `adb shell input keyevent KEYCODE_WAKEUP`；MIUI 上 `svc power stayon true` 不生效 |

开发服务（两个都要起）：
```bash
npm run dev        # Vite 5173
npm run dev:api    # wrangler pages dev 8788 —— 不起的话评论/账号接口全 502
```

---

## 账号体系做了什么

| 能力 | 一句话 |
| --- | --- |
| 注册 / 登录 | 邮箱验证码注册；密码**只在本机** PBKDF2-SHA256 60 万次，服务端只存 `HMAC(pepper, verifier)` |
| 改密码 | 走邮箱验证码（不验旧密码） |
| 换邮箱 | **旧、新邮箱各收一个码**，两个都对才生效 |
| 人机验证 | 自制**蛋点选**：提示 3 个 → 画布 5 个里按序点 3 个，点错整题作废。**不用 Turnstile** |
| 个人中心 | 我的评论（可删）、谁回复了我（未读红点、点击定位）、改昵称头像 |
| 发评论 | **需要登录**；读评论不需要 |
| 后台 | `/admin` 独立外壳：概览 / 评论 / 用户（封禁、彻底删除）。入口不放进导航，靠令牌保护 |
| 隐私说明 | `/#/privacy`（注册页那个必勾项的链接） |

**几条改之前必须先读的硬约束**（详见 §0.9）：

- 🔴 `AUTH_PEPPER` / `SALT_SECRET` **上线后不能再改**：前者变了所有人登不上，
  后者变了所有人"不存在"（且是静默的 —— 登录只说"邮箱或密码不对"）；
- 🔴 `users.pw_salt` **必须存**：盐是邮箱派生的，换邮箱会让盐变化 → 不存就再也登不上；
- 🔴 `email_hash` 与 `salt` 做了**域分隔**（`'lookup:'` / `'salt:'` 前缀），
  否则公开的 `/api/auth/salt` 会顺手泄漏 `email_hash`，可拿去和泄露库对撞；
- `.dev.vars` 里是**本地**值（`ADMIN_TOKEN=yxzm` 等），线上是控制台里另配的随机串
  —— **已确认线上不是本地值**（用 `yxzm` 打线上管理接口返回 401）。

---

## 红线（别越）

1. **绝不对生产库执行破坏性 SQL。** `DELETE FROM comments` 只在
   [`scripts/sql/reset-test-comments.sql`](../scripts/sql/reset-test-comments.sql) 里，
   默认整段注释、**必须经用户确认**才跑。
2. **不碰另一条线（任务/剧情）的改动。** 工作区里常年有它们的未提交改动：
   `src/utils/taskParser.js`、`src/views/TasksView.vue`、`public/data/parsed/tasks.json`、
   `public/data/parsed/dialogSegments.json`、`public/fonts/*`、
   `scripts/dev/check-task-data.mjs` —— **别 stage、别提交、别改**。
   （`public/fonts/*` 有时会出现在提交里，那是历史提交带来的，不是你该动的。）
3. **`capacitor.config.json` 的 `appId` 与 `android/.../strings.xml` 的
   `package_name` / `custom_url_scheme` 绝不能改** —— 改了等于换 Android 包名，
   已安装用户无法增量升级、本地数据会丢。`tests/unit/site-name.test.mjs` 守着这条。

---

## 常用命令

```bash
npm run dev / dev:api        # 开发服务（5173 / 8788）
npm run test:unit            # 单测 260 条
npm run test:api             # 端到端 100 + 42 条（需要 API 在 8788 跑着）
npm run test:migration       # 迁移演练 29 条（改迁移脚本后必跑）
npx playwright test --project=desktop --reporter=line   # UI（已限 workers=2）
node --no-warnings tests/phone/flow.mjs                 # 真机 38 条（需 USB + adb 转发）
node --no-warnings tests/api/production-smoke.mjs        # 线上验证 18 条（只读，不产生数据）
npm run verify               # 数据/构建产物校验
```

真机准备：

```bash
adb -s IBKZIRHQJBOF7PUS shell input keyevent KEYCODE_WAKEUP
adb -s IBKZIRHQJBOF7PUS shell settings put system screen_off_timeout 1800000   # 完事改回 600000
adb -s IBKZIRHQJBOF7PUS reverse tcp:5173 tcp:5173
adb -s IBKZIRHQJBOF7PUS forward tcp:9222 localabstract:chrome_devtools_remote
# Chrome 必须在前台跑着，那条 localabstract 才存在
```

---

### 0.9 账号体系（**已实现并上线**，2026-10-05）

用户要的是"注册用邮箱验证码 + 密码登录 + 改密码也要邮箱验证"。

**方案**：[账号体系方案](technical/ACCOUNT_SYSTEM.md)（§十四有 22 项已定决策，
§十八是实现记录与与设计的偏差）；
早期评估稿 [ACCOUNT_SYSTEM_EVALUATION.md](technical/ACCOUNT_SYSTEM_EVALUATION.md)
只保留"不要随便在 Workers 上存密码"的实测证据与邮件额度核实记录。

**已实现**：后端 `/api/auth/*` 14 个接口 + 管理端 3 个；前端
`AccountModal`（登录/注册/个人中心/改密码/换邮箱/我的评论/谁回复了我）、
`CaptchaEgg`（蛋点选）、`/admin` 后台三块、`/#/privacy` 隐私说明。

**关键的几条硬约束**（改之前先读，否则会踩）：

- ⚠️ **旧版那条"PBKDF2 600k 轮实测 104ms"是 Node 的数**。在真实 workerd 里是 **279ms**（慢 2.7 倍），
  而且生产对 KDF 是**入口封顶**：PBKDF2 ≤ **100,000 轮**、scrypt `N×r×p ≤ 1,048,576`
  ——**超了直接报错，不是跑慢**。Cloudflare 源码注释自己承认这"远低于推荐值"。
- 因此**服务端存密码**这条路：免费版（10ms）不可行；付费版也被顶在 10 万轮。
- **路线：客户端 KDF** ——浏览器/手机跑 PBKDF2-SHA256 600k，服务端只存
  `HMAC(pepper, verifier)`（约 0.02ms）→ 免费、强度达标、且 **D1 单独泄露不可爆破**。
- Workers **封禁 25 端口**；国内邮箱对"异地登录"会反复拦截 → **不要走 SMTP 直连**。
- **Cloudflare Email Service 用不了**（需 Paid，且发信域名必须是 CF 托管的 zone）。
  **发信走腾讯云 SES**，模板见 `scripts/dev/ses-templates/`，`TemplateID = 62671`。
- 🔴 `AUTH_PEPPER` / `SALT_SECRET` **一旦上线就不能再改**：前者变了所有人登不上，
  后者变了所有人"不存在"（且是静默的）。要轮换得写数据迁移。
- 🔴 `users.pw_salt` **必须存**：盐是邮箱派生的，换邮箱会让盐变化 → 不存用户就再也登不上。
  这个是端到端测试跑出来的，套件里留了回归断言。
- 🔴 `email_hash` 与 `salt` 做了**域分隔**（`'lookup:'` / `'salt:'` 前缀），
  否则公开的 `/api/auth/salt` 会顺手泄漏 `email_hash`，可拿去和泄露库对撞。

---

### 0.0 现在的仓库与域名（**先看这个**）

| | 现在（新） | 旧（保留中） |
| --- | --- | --- |
| GitHub 仓库 | **`Drloudx/syzg`** | `Drloudx/myrzg`（未删，原地保留） |
| Pages 项目 | **`syzg`** → `syzg.pages.dev` | `myrzg` → `myrzg.pages.dev` |
| 自定义域名 | **`syzg.yxzmy.top`** | `myrzg.yxzmy.top` |
| EdgeOne 加速域名 | **`syzg.yxzmy.top`**（回源 `syzg.pages.dev`） | `myrzg.yxzmy.top`（回源 `myrzg.pages.dev`） |
| 本地 git remote | `origin → https://github.com/Drloudx/syzg.git` | — |
| 前端基址 `CLOUD_URL` | **`https://syzg.yxzmy.top`** | — |
| D1 数据库 | `myrzg-comments`（**名字没改**，两个项目共用同一个库） | — |

**三个刻意保留旧名的地方**（不要"顺手改掉"，会出问题）：

1. **本地目录仍是 `vue-myrzg`** —— 改名会打断本机所有绝对路径引用（含 `_ai-credentials/`、`backups/` 的文档链接）。
2. **旧仓库 / 旧 Pages 项目 / 旧域名全部保留** —— 旧 Android 包里的 `CLOUD_URL` 是**编译时写死**的，
   旧域名一停，老包在线资源全失效。**这也是唯一的退路**：`myrzg.pages.dev` + `myrzg.yxzmy.top` 都还在服务。
3. **`wrangler.toml` 的 `name` 与 `database_name` 仍是 `myrzg`** —— 本项目由控制台的 Git 集成构建，
   该文件只在本地手动跑 wrangler 时生效；旧 Pages 项目还在，改名会冲突。理由写在文件注释里。

**为什么是"删旧建新"而不是"改仓库名"**：`Drloudx/syzg` 这个仓库名**早已被占用**
（2026-05 的一个旧版站点 + 它的 GitHub Pages）。经确认后：mirror 备份到
`backups/syzg-old-repo-202605.git` → 删旧仓库 → 建同名空仓库 → 本仓历史整体推出。
**没有改 `myrzg` 的名字。**

### 0.1 一句话状态

**新域名已完全可用**（2026-10-03）：`syzg.yxzmy.top` 证书已签、EdgeOne 已生效、
`/api/health` 返回 JSON、前端产物里已是新域名；旧域名与旧项目**同时在线**作退路。
本地与线上验证均通过；`npm run verify` 全绿；闪烁问题已解决（见 0.5）。

**2026-10-04 追加**：评论模块补齐表情 / 富文本输入 / 回复（平铺 + 楼中楼）/ 滚动自动加载，
并把"测试脚本吃掉本地数据"这类开发体验问题一并修掉（见 §二·9）。
该改动**已提交**（`0c745272`）：`public/images/emoticons/`（93 张）、`public/ui/emoticon.svg`、
`src/config/emoticons.js`、`EmoticonPicker/EmoticonText/UiSplitButton`、单测与开发日志**都已入库**。
但**尚未推送**——截至 2026-10-05，本地 `main` 领先 `origin/main` 3 个提交
（另两个是当天的移动端贴边悬浮拉手 `b8aaf946`、`a3729989`）。

### 0.2 这块是什么：全站唯一需要后端的部分

整站其余部分都是**纯静态**（游戏文件在构建期生成 JSON，用户只读）。
只有评论/讨论需要"一个用户写、所有人读"，所以必须有存储与服务端：

| 组件 | 位置 |
| --- | --- |
| 存储 | Cloudflare **D1**（SQLite），库名 `myrzg-comments`，id `5f0d4c37-107f-4811-bc5e-768f73c51a3a` |
| 服务端 | Cloudflare **Pages Functions**，单文件 `functions/api/[[path]].js` |
| 前端 | `src/components/CommentsPanel.vue`（列表）+ `CommentComposer.vue`（发表区） |
| 客户端 | `src/utils/commentApi.js`（接口 + `page_key` 前缀表）、`identity.js`（本机身份/头像）、`commentEvents.js`（跨组件广播） |
| 管理端 | `/#/admin`（评论管理；本地令牌 `yxzm`，线上换随机串） |

费用为 0：Functions 10 万次/天、D1 读 500 万行/天、写 10 万行/天，当前用量远低于此；
**静态图鉴不限量不计费**，只有评论那点 JSON 走 API。

### 0.3 讨论区怎么用

- **顶栏聊天图标** → `/#/discussions`：站内讨论区（归属键 `site:general`），
  与各图鉴页面的讨论 `item:xxx` / `hero:xxx` …**完全分开**，不聚合。
- **各图鉴详情里的「讨论」**：物品 / 角色 / 魔物 / 家具 / 副本 / 关卡 / 怪物 / 任务 / 事件，共 9 处。
  符石与菜谱**刻意不单独挂**（它们点卡片走全局物品详情，那里已有讨论区）。
- **右栏「最新讨论」**：只显示站内讨论区的最新 5 条，只读、不放输入框。
  ⚠️ 它**只镜像 `site:general`**：服务端 `/api/recent` 只查这一个 `page_key`，
  前端"发表后本地直插"也必须按 `pageKey` 过滤（2026-10-04 修过一个 bug：在物品页发评论
  会漏进右栏，见 [KNOWN_BUGS 第 14 条](KNOWN_BUGS_AND_FIXES.md)）。
- **回复**（2026-10-04）：
  - **站内讨论区**：回复就是一条普通消息 + 一行引用（「回复 @谁：摘录」），点引用行滚到原消息；
  - **详情页**：**楼中楼**——顶层评论下面收着它的回复（默认前 3 条 + 「全部 N 条回复」），
    回复楼内另一条时带「回复 @谁」，楼主有头像、嵌套回复不带头像。
  - 自己发过的评论被回复时会标「回复你」（靠本机删除令牌认领，不依赖账号）。
- **别人发的消息会自动出现**（2026-10-03 起）：中间区域与右栏都是**前台轮询**
  （间隔 `config/discussions.js` 的 `DISCUSSION_POLL_MS`，当前 **1 分钟**，两处共用一处维护），
  不必重开页面。中间区域此前**完全没有自动刷新**（`pageKey` 恒定不变、本机广播不跨设备），
  表现就是"右栏有了、中间没有"。轮询只挂讨论区；**物品详情等页面的评论面板不轮询**——
  那会把"每次打开详情一次请求"放大成"停留期间每 1 分钟一次"。详见
  [评论后端方案](technical/COMMENTS_BACKEND.md#讨论区中间的自动刷新2026-10-03-补)。

### 0.4 三个必须知道的开发约定（不然一定踩）

1. **改了 `functions/` 必须重启 API**：`npm run dev:api` 起的 wrangler **不热加载**。
   本日在此踩了两次（改 `MAX_BODY`、加 `site:` 白名单后没生效，误以为代码错）。
2. **新增页面挂讨论区要改两处**：`src/utils/commentApi.js` 的 `COMMENT_PAGE_PREFIX`
   **和** `functions/api/[[path]].js` 的 `PAGE_KEY_RE`；并记得把页面人话名字用 `pageLabel` 传上去
   （否则管理端只显示 `item:item_00001` 这种内部标识）。
3. **本站是 hash 路由**：站内切页**不重载应用**。所以"只在启动时拉一次"的写法
   （右栏最初就是这样）会导致用户发完评论后数据一直是旧的。改数据要显式触发刷新。

### 0.5 ✅ 已解决：发表时的闪烁（2026-10-03）
用户反馈"中间区域发消息的时候闪一下"。**已定位并修复**，成因与交接时假设的**不一样**：

| 交接时列的成因 | 复核结论 |
| --- | --- |
| 发表后重拉整页 → 列表 DOM 全部重建 | ✅ 早已修掉（只追加一条），列表 MutationObserver 只记录 `+1/-0` 一次 |
| 浏览器滚动锚定与"滚到最新"打架 | ✅ 已由 `overflow-anchor: none` + `scrollbar-gutter: stable` 处理 |
| 面板高度用 `--vh100` 推算有偏差 | ❌ **实测不成立**：6 种视口下面板底边恒在视口下 20px、输入区底边最小余量 36px、`.app-container` 纵向溢出 0px |

**真正根因是"滚动跟随"本身**（逐帧数据）：

1. 新评论插入后**晚两帧才滚**（`scrollToLatestAfterLayout` 的双 rAF 等布局），
   中间会先绘制一帧"新消息已插进视野、列表还没跟下去"的画面，紧接下一帧整块再动；
2. 滚动是 `scrollTop = scrollHeight` 的**一次瞬移**——用户往上翻着历史时点发表，
   实测 `scrollTop 577 → 1196`，**619px 在一帧内甩过去**。

修法在 `src/views/DiscussionsView.vue`：滚动位置收敛为**唯一决策点**
（`watch(commentsLength, { flush:'post' })`，在"DOM 已更新、尚未绘制"这一帧决定），
首次载入直接落底、之后走 260ms 动画曲线，且**只在插入前就贴着底部（120px 内）时才自动跟随**；
用户往上翻历史时原地不动。A/B 对照：旧实现单帧 **78px** 瞬移 + 翻历史漂移 **619px**；
修复后单帧最大 **14px**、漂移 **0.0px**。

回归入口：`node scripts/dev/scratch/verify-post-scroll.mjs [宽] [高]`
（桌面 1440×900 与手机 390×844 各 12/12；交接文档既有的 5 套专项全部复跑无回归）。
完整分析见 [评论后端方案](technical/COMMENTS_BACKEND.md)，过程见
[开发日志 2026-10-03](dev-logs/2026-10/2026-10-03.md)。

> ⚠️ `- 190px` 这个面板高度魔数**仍是推算值**，且在 1025 宽时与其它视口差 12px；本轮刻意不动它
> （上次改成脚本量高度被用户实测"高度不对"而回退）。要改请按评论后端方案里的三视口复核流程走。

### 0.6 本地怎么跑起来（两个服务，缺一不可）

```powershell
# 1) 前端（5173）
npm run dev

# 2) 评论 API（8788）——不启动则页面上评论/讨论会报"无法连接评论服务器"
npm run dev:api
```

- Vite 已配 `/api` 代理到 `127.0.0.1:8788`（否则 `npm run dev` 下评论不可用，早期踩过）。
- 本地环境变量在 `.dev.vars`（gitignored）：`ADMIN_TOKEN=yxzm`、`IP_HASH_SALT=local-dev-salt`、
  放宽的限流阈值。**线上必须换成足够长的随机 `ADMIN_TOKEN`**，且不存在免密旁路。
- 本地 D1 里可能留着演示数据（站内讨论，含带头像/无头像两种，用户名是「旅行者/老玩家/萌新/工匠/路人」），
  便于直接看效果。清库：`npx wrangler d1 execute myrzg-comments --local --command "DELETE FROM comments; DELETE FROM rate_limits;"`
  重建演示数据：`node scripts/dev/scratch/seed-site-discussion.mjs`。
- ✅ **评论类测试脚本不再吃掉本地数据**（2026-10-04 起）：清库前会整表备份，
  进程退出（正常/断言失败/Ctrl+C）**自动还原**，实现见
  `scripts/dev/scratch/lib/comment-fixture.mjs`。
  ⚠️ 还原**必须用 `--file`**（50 条以上的 INSERT 会超 `--command` 的命令行长度上限，
  实测"报错且数据没写回去"）；`seed-site-discussion.mjs` 是显式重置工具，故意不接入。
  ⚠️ **别再手动 `DELETE FROM comments` 清库**：开发时人常在同一个本地库上手点页面，
  清库会让他的下一次刷新/发表出现"列表瞬间变短、页面挤一下"（2026-10-04 用户实际遇到）。
- 本地库被测试数据堆脏时（例如几百条 `historyN` / `楼主N`）：先预览再清理——
  `node scripts/dev/scratch/clean-test-comments.mjs`（预览）→ 加 `--apply` 才真删；
  它只按**已知测试签名**匹配，站主自己发的评论不会被删。

### 0.7 测试脚本（都在 `scripts/dev/scratch/`，gitignored）

| 脚本 | 覆盖 |
| --- | --- |
| `test-comments-api.py` | 43 项：接口契约、错误文案、限流、幂等删除、超长拒绝 |
| `verify-comments-ui.mjs` | 68 项：详情里评论全流程（发帖/自删/账号弹窗/管理页/顶栏标题） |
| `verify-emoticons.mjs` | 66 项：表情选择器（中文名 tooltip/向右展开/图片逐个解码）、富文本插入、显示字数、四处渲染 |
| `verify-replies.mjs` | 24 项：回复（引用式）——两条链路、手机端、服务端降级、待审父评论不可引用 |
| `verify-nested-replies.mjs` | 28 项：**楼中楼**（前 3 条 + 展开/收起）、回复落楼、嵌套删除、滚到底自动加载、孤儿升级 |
| `verify-discussions.mjs` | 36 项：站内讨论区、发表区固定、右栏归属与样式 |
| `verify-post-scroll.mjs` | 12 项：发表滚动跟随（同帧完成/贴底跟随/翻历史不动/三处高度零变化） |
| `verify-chat-order.mjs` | 11 项：最新在下、上滑自动加载 |
| `verify-no-flicker.mjs` | 9 项：**逐帧采样 130 帧**证明布局不抖动 |
| `verify-comment-mounts.mjs` | 27 项：9 个页面逐个验证挂载与 `page_key` 合法性 |
| `verify-discussions-order.mjs` | 9 项：排序与 200 字上限 |
| `verify-autoscroll.mjs` | 6 项：打开/发表后停在最新一条 |
| `verify-cross-device-poll.mjs` | 8 项：别人发的消息在中间区域与右栏都能自动出现 |
| `verify-hero-comment-e2e.mjs` | 4 项：非物品页面发帖 → 管理页可见 |
| `verify-admin-occlusion.mjs` | 5 项：管理页筛选面板的遮挡（面板不透明、z-index 高于卡片、卡片确实从背后滚过） |

**跑测试前先清限流**（限流是"每 IP 每小时 5 条 / 每天 20 条"，跑多了会误判失败）。
⚠️ 只清 `rate_limits`，**不要连评论一起删**（评论由脚本自己备份还原）：

```powershell
npx wrangler d1 execute myrzg-comments --local --command "DELETE FROM rate_limits;"
```

### 0.8 上线清单（**2026-10-03 已执行并实测通过**）

> **2026-10-04/05 的改动已提交、但还没推**（本地领先 `origin/main` 3 个提交）：
> 推之前先确认第 1~4 条仍然成立。新文件（表情素材 / 新组件 / 单测 / 开发日志）
> **早已入库**，直接 `git push` 即可，不再需要补 `git add`。
> 回复用的是预留列，**不需要跑任何 D1 迁移**；但要多一次前端构建（素材 + 字体子集已重生成）。

1. ✅ Cloudflare Pages 项目 → Settings → Environment variables：`ADMIN_TOKEN`、`IP_HASH_SALT` 已配。
2. ✅ **已推送 `main`**（29 个提交，首个从 `952e06b6` 推到 `b67f6e07`），Pages 自动部署成功。
3. ✅ **实测线上 `/api/health` 返回 JSON**：推送后 **40 秒**即生效
   （此前是 `200 + text/html`，被 SPA 兜底吃掉）。同时确认 `_redirects` 的
   `/api/*` 放行已上线：不存在的路径 → `200 text/html`（SPA 兜底正常），
   不存在的 `/api/*` → `404`（不再被兜底吃掉）。
4. ✅ 缓存头复测：`/api/health`、`/api/comments` 均为 `cache-control: no-store`（不会被 EdgeOne 缓存）；
   `/data/parsed/items.json` 为 `public, immutable, max-age=31536000`；
   `/ui/logo.webp` 仍是 `max-age=3600`（EdgeOne 按文件类型改写，已知且接受，见架构 4.7）。
5. ⬜ Turnstile 仍未配（不影响功能，未配 `TURNSTILE_SECRET` 时自动跳过人机校验）。
6. ⬜ **Fail open 必须保持**：Pages 的 Fail open/closed 要选 Fail open，
   否则免费额度耗尽会让整个图鉴站变成错误页。

**线上接口验收（2026-10-03 实测）**

| 接口 | 结果 |
| --- | --- |
| `GET /api/health` | `200` + JSON |
| `GET /api/comments?page=site:general` | `200` + JSON，公开列表 **0 条**（生产库为空，属正常） |
| `GET /api/recent` | `200` + JSON |
| `POST /api/comments` 非法 `page_key` | `400`（白名单生效） |
| `POST /api/comments` 空内容 | `400` |
| `GET /api/admin/comments` 无令牌 | `401` |
| `POST /api/comments` 正常写入（探测用、已自删） | `201`，`status=0` 进待审（命中「外链」规则），自删 `200` |
| 远程 D1 建表 | ✅ 写入/查询/删除全通，说明 `schema.sql` 已在远程执行过 |

> 线上评论列表目前是空的：本地那 5 条演示数据只在**本地** D1，生产库没有。
> 想造演示数据可对远程执行 `wrangler d1 execute myrzg-comments --remote --file=...`，
> 或直接在线上发几条。

### 0.9 账号体系（**已实现**，2026-10-05）—— 详见开头 §〇

> 上面 §〇 的"账号体系做了什么"表格与硬约束清单就是这一节的内容，
> 不再重复。**要看方案与全部 22 项决策** →
> [technical/ACCOUNT_SYSTEM.md](technical/ACCOUNT_SYSTEM.md)；
> **要上线** → [technical/GO_LIVE_ACCOUNT_SYSTEM.md](technical/GO_LIVE_ACCOUNT_SYSTEM.md)。

---

## 〇·B、部署拓扑与线上运维（2026-10-03 现状）

接手者最容易踩的就是这一节，因为它**不在代码里**。

### B.1 一次请求怎么走

```
用户（大陆为主）
  │  DNSPod：syzg.yxzmy.top CNAME → syzg.yxzmy.top.eo.dnse3.com
  ▼
腾讯云 EdgeOne 边缘节点（大陆加速；回源 syzg.pages.dev）
  │
  ▼
Cloudflare Pages 项目 syzg（静态产物 + Pages Functions）
  │
  ▼
Cloudflare D1（库名 myrzg-comments，两个项目共用）
```

**为什么是两层 CDN**：Cloudflare Pages 本身就是全球 CDN，但它在大陆没有节点，
所以前面套了 EdgeOne。**只对大陆用户有意义**；两层不会让静态资源更快，
EdgeOne 的价值只在"大陆可达性"。

### B.2 缓存策略（两侧都在管，容易打架）

| 路径 | 源站（`public/_headers`） | EdgeOne 规则 |
| --- | --- | --- |
| `/api/*` | `no-store` | 不缓存 |
| `/`、`/index.html` | **`no-cache`**（每次回源校验） | — |
| `/assets/*` | `immutable, max-age=31536000` | — |
| `/data/parsed/**` | `immutable, max-age=31536000` | — |
| `/fonts/*` | 1 年 + `?v=` 内容哈希 | 未被改（实测 604800） |
| 图片 `jpg/png/gif/bmp/webp` | 7 天 | **浏览器缓存 TTL = 7 天**（2026-10-03 用户配置） |
| `svg` | — | 单独一条 = 1 小时（**刻意短**：部分 svg 硬编码路径、不走 `?v=`） |

> 历史：EdgeOne 曾把图片的 7 天改成 1 小时（2026-09-27 排查过，当时结论"免费版无入口"）。
> 2026-10-03 用户在控制台找到了那组规则并改回 7 天。**改这类规则后必须复测**，用
> `node scripts/dev/scratch/probe-cache-headers.mjs`。

### B.3 三件必须记得的运维事

1. **证书**：EdgeOne 免费证书 = **自动申请 + 自动续签**（域名详情里选「申请免费证书 + 自动验证」）。
   ⚠️ **加了加速域名但不配证书 = 整个域名 HTTPS 不可用**——浏览器 `ERR_EMPTY_RESPONSE`、
   curl `(52) Empty reply` / `(35) TLS 握手失败`，探测会发现 EdgeOne 甩兜底证书
   `*.cdn.myqcloud.com`。**这个坑 2026-10-03 踩过**。
2. **`.pages.dev` 会随项目名走**：改 Pages 项目名会**改掉** `*.pages.dev`，
   而 EdgeOne 回源写的正是它 → **回源必须同步改**，否则整站 502。这也是当初选择
   "新建项目"而不是"改名项目"的原因（保住退路）。
3. **Cloudflare API 令牌**：账户级令牌（`cfat_` 前缀）**不能用 `/user/tokens/verify` 校验**
   （它对用户级令牌才有效，对 `cfat_` 一律回 `1000 Invalid API Token`）。
   正确校验方式是拿它去打真实端点（`/accounts`、`/accounts/{id}/pages/projects`）。
   注意这种令牌通常**读不到 `/accounts/{id}` 本身**（403），属正常。
            当前令牌只有 Pages Write + D1 Write，**没有 D1 Edit** → D1 库改名会返回 400。

---

## 一、当前项目状态概览

1. **分支状态**：
   - 处于 `main` 分支，远端 `origin` = **`https://github.com/Drloudx/syzg.git`**（2026-10-03 由 `Drloudx/myrzg` 迁入）。
   - 工作区干净；**本地领先 `origin/main` 3 个提交（未推送）**——`0c745272`（评论模块）、
     `b8aaf946` / `a3729989`（移动端贴边悬浮拉手，2026-10-05）。历史上那次
     "本地领先 27 个提交未推送"已于 2026-10-03 推完。
2. **开发服务器（两个都要起）**：
   - 前端 `npm run dev` → `5173`；
   - **评论 API `npm run dev:api` → `8788`**（不起这个，评论/讨论会报"无法连接评论服务器"）。
   - 详见上文〇·0.6。
3. **构建与健康状态**：
   - `npm run verify`（`data:build` + `vite build` + 产物完整性与残留校验）**全部通过**（2026-10-03 复跑，因改域名重新构建过）。
   - 评论/讨论相关的专项脚本全部通过（数字见〇·0.7 + 本轮新增的两个，见〇·0.5 与"讨论区自动刷新"）。
4. **代码整洁度**：
   - 探索性的词条/Buff 实验模块已彻底清理，未留存多余文件或无用依赖。
   - 评论/讨论的后端只有**一个文件**：`functions/api/[[path]].js`。

---

## 二、近期核心功能与改动梳理

### 1. 关卡图鉴（`/chapters`）
- **导航图标更换**：关卡图鉴导航侧边栏已换用全新素材 `/ui/stage_crystal.webp`。
- **两级地图与路线图体系**：
  - **世界地图**（`ChapterMapCanvas.vue`）：底图 + 6 块章节拼块。
  - **地区路线图**（`RegionRouteMap.vue`）：底图 + 关卡节点 + 连线 + 锚点校准（地区立体图圆盘中心锚定、副本图标中心锚定）。
- **房间标签筛选胶囊（关卡详情 & 自由探索小地区）**：
  - 在「房间内容与掉落来源」标题下方注入了房间筛选胶囊（`UiFilterRow` + `UiFilterPill`）。
  - 支持「全部」、各具体房间（房间 1、房间 2...）以及**「带隐藏物品」**专属快捷胶囊。
  - **带隐藏物品筛选逻辑**：智能过滤包含隐藏房间、被隐藏的物品、以及带有 `？？？` 描述的房间内容。
  - **移动端多行对齐**：移动端下标签文字（如「房间：」）与首行胶囊保持顶部对齐（`align-items: flex-start; line-height: 25px;`），多行折行排版自然舒适。

### 2. 战利品货架与掉落概率明细（`RewardPools.vue` / `RewardProbabilityModal.vue`）
- **掉落规则解析与跨池去重**：
  - 支持复杂掉落规则（分组抽取率、组内单件概率、单次抽取率与综合最终获得率）。
  - 遇到同名/同 ID 跨奖励池掉落时，明细浮层与卡片自动进行来源聚合与概率合并。
- **Tooltip 浮窗边界自适应与遮挡 Bug 彻底修复**：
  - **Bug 根因**：原 Tooltip 默认使用 `display: none`，首次 `@mouseenter` 触发时浏览器尚未计算 `:hover` 渲染树，导致 `getBoundingClientRect()` 读取宽度为 0，误判为未溢出而保持居中 `translateX(-50%)`，使左右边缘卡片的浮窗直接刺出弹窗被硬遮挡截断。
  - **优雅修复方案**：
    1. CSS 将 Tooltip 默认隐藏方式改为 `visibility: hidden; opacity: 0; pointer-events: none;`，让 DOM 在初始渲染时就完成物理排版与尺寸布局（随时具备真实 `offsetWidth`）；
    2. JS 水平边界检测改用**纯几何数学推导**（依赖卡片中心点 `slotCenterX` 与浮窗物理宽度 `tooltipWidth`，结合弹窗左右边界安全垫 `pad = 12px`），彻底消除对历史残留 `transform` 的依赖；
    3. 小三角指示箭头（`--arrow-shift`）与浮窗平移联动，始终精准指向物品卡片中心；
    4. 移出（`mouseleave`）时同步清理样式。
  - **效果**：无论是否首次 hover、无论从何处移入，左侧与右侧边缘浮窗均在弹窗内部完整呈现，左右安全边距一致，不发生任何截断或跳动。

### 3. 物品详情与装备改造（`ItemDetailModal.vue` / `AcquisitionRewards.vue`）
- **传说装备品质展示方案 A**：
  - 游戏内传说装备默认品质为橙色（无其他品质），详情中的品质属性行调整为固定展示橙色品质，不出现无意义的灰阶品质项。
- **药水使用效果与设施制作顺序调优**：
  - 药水类物品详情中，将「使用效果」展示块调整至「设施制作」上方，符合玩家阅读直觉与消耗品优先级。
- **符石包与特殊物品隐藏**：
  - 符石开包与特殊掉落逻辑规范化，避免未开放或内部道具泄露到公开货架。

### 4. 怪物详情 — 界面清爽化与阶段流转卡优化
- **移除多余图标与误导文案**：
  - 移除了阶段流转卡中无实义的小闪电图标。
  - 清除二阶段误导文案（如 `已进入狂暴变身状态...` 以及硬编码 `(变身狂暴)`），全面规整为客观精确的 `二阶段` 或专属阶段名。
- **形态切换按钮样式调优**：
  - 桌面端阶段流转卡底部操作栏改为靠右对齐（`justify-content: flex-end`），按钮视觉更精致平衡；移动端保持全宽撑满触控友好。
- **形态 Tab 前缀自动呼应**：
  - `formTabOptions` 计算中，二阶段（`after`）形态自动寻找其对应的一阶段形态前缀；
  - 效果：若一阶段为 `剧情 / 探索`，则二阶段自动展示为 `剧情 / 探索 (二阶段)`，不再出现前后缀割裂。

### 5. 怪物技能触发条件解析增强
- **主客体与动作明确**（在 `monsterParser.js` 中解析 AI 状态转移树 `triList`）：
  - `triType: 2` → `自身生命值降至 XX% 及以下`
  - `triType: 7` → `自身普攻 X 次后`
  - `triType: 16` → `自身受到 X 次攻击后`
  - `triType: 1` → `战斗持续 X 秒后`
  - `triType: 8` → `自身死亡时`
- **离散随机概率精准标注**：
  - 对于区间型判定（如普攻 2~4 次），计算出各档位的离散几率：
    - 例：`自身普攻 2~4 次后（各 33.3% 几率）`

### 6. 全怪物普通攻击（普攻）展示修复
- **问题根因**：原先怪物技能解析中，普攻（`skillType: 0`）在去重和未命名过滤时被判定为开发者占位符，导致大量怪物的普攻未被渲染。
- **修复方案**：
  - 放行怪物的默认普通攻击，统一将其规范命名为【普通攻击】；
  - 补全普通攻击的段数伤害拆解（`damageHits`）、倍率以及附加状态。

### 7. 砂蜘蛛织网者（012 / 012_1）专属机制 —「方案一」落地
- **底层机制揭秘**：
  - **一阶段（012）**：悬挂于半空蛛网，处于固定射手状态，击退抗性高达 `999999999`（绝对霸体，无法击退与打断）；
  - **击落条件**：受到玩家任意攻击命中 4 次后，触发动作 `down` 摔至地面，形态切换为 `012_1`；
  - **二阶段（012_1）**：掉落至地面后击退抗性暴跌为 `0`（完全破防，玩家可随意打断与击退）；在地面仓皇反抗普攻 2 次后触发 `goAway` 并执行动作 `up_2` 重新结网逃窜回天花板，变回一阶段。
- **定制化呈现**：
  - **形态 Tab 标签**：`空中结网 (一阶段)` / `坠地虚弱 (二阶段)`
  - **阶段 Badge**：`当前查看：空中结网 · 霸体` / `当前查看：坠地虚弱 · 破防`
  - **动态条件气泡**：一阶段显示 `条件：被命中 4 次后击落`；二阶段显示 `回网：完成 2 次攻击后逃窜回网`
  - **切换按键文案**：`查看【坠地虚弱 · 破防】➔` / `🠔 返回【空中结网 · 霸体】`

### 8. 词条百科（`/glossary`）—— 方案 A 全自动化重构
- **核心定位革新**：彻底摒弃底层配置参数查看器模式，构建面向玩家的清爽 Wiki 词条百科。
- **三大板块知识体系**：
  - **异常与状态**（持续伤害、强力控制、削弱减益、增益生存、怪物异变）；
  - **战斗属性**（基础面板、高级进阶与硬性上限如攻速+300%、冷却缩减50%）；
  - **核心机制**（普攻/主动/被动/星阶技能系统、伤害结算七步流、等级压制50%）。
- **全自动化数据管道**：
  - 自动扫描全量 `buff.json`，根据 `STATUS_RULES` 自动匹配各状态；
  - 自动聚合计算持续时间区间（如 `3 ~ 10 秒`）、跳字结算频率（如 `每 1 秒结算一次`）、伤害元素属性；
  - 自动反查施加来源（`hero.json` / `mon.json` / `pet.json` / `item.json`），提取施加角色（附技能名）、怪物、魔物与道具；
  - 未来更新游戏原表，只需运行 `npm run data:build`，所有新角色、新怪物、新技能、新数值范围全自动同步更新。
- **图鉴深度联动**：词条详情弹窗中，点击施加角色直达角色图鉴（`/heroes?id=`），点击怪物直达怪物图鉴（`/monsters?id=`），点击魔物直达魔物图鉴（`/pets?id=`），点击道具直达全局物品详情。

### 9. 评论与讨论区（`2026-10-04`）—— 表情 · 富文本 · 回复 · 楼中楼

> 这一节是评论模块的**收口**：数据怎么存、两种列表形态怎么分、踩过哪些坑、回归在哪。
> 完整设计与数据流见 [评论后端方案](technical/COMMENTS_BACKEND.md)，
> 当天逐项改动见 [开发日志 2026-10-04](dev-logs/2026-10/2026-10-04.md)。

#### 9.1 数据怎么存（一句话：**没有新列、没有新表、没有迁移**）

| 内容 | 存法 | 为什么 |
| --- | --- | --- |
| 表情 | 正文里的 `[e:包:名]`（如 `[e:tieba:tb_yiwen]`） | 这些表情是**图片**，Unicode 没有码位；存路径会随素材目录整理成批变死链 |
| 回复 | `comments.parent_id` = 被回复那条的 id | **建表时就预留了**（原来的注释写着"预留楼中楼，一期不使用"），2026-10-04 启用 → 零迁移 |
| 楼主 vs 回复 | `parent_id IS NULL` = 顶层；否则是回复 | 楼中楼只按顶层评论分页，`replyCount` 由同页查询算出来 |

- **上限是"显示字数"**：一个认识的表情算 **1 字**（`countEmoticonDisplayChars`），200 字照旧。
  服务端两道闸门：原始长度 `MAX_BODY_RAW = 8200`（放 `sanitize` 截断**之前**，
  否则会把 token 砍成半截）+ 显示字数复核。
- **`src/config/emoticons.js` 是唯一来源**（表情包目录 + token 语法 + 计数 + 分段 +
  `emoticonPlainText`），**零依赖纯函数，Worker 也 import 同一份**——前后端计长口径不允许有两套。

#### 9.2 两种列表形态（**别搞混**）

| | 站内讨论区 `/discussions` | 详情页（9 个入口的弹窗） |
| --- | --- | --- |
| 排序 | `reverse`：最新在**底部**（聊天式） | 最新在**顶部**（列表式） |
| 回复呈现 | 平铺 + 引用行「回复 @谁：摘录」 | **楼中楼**：楼主下面收着回复（前 3 条 + 「全部 N 条回复」） |
| 头像 | 每条都有 | 楼主有、**嵌套回复没有**（整块窄，头像会挤正文） |
| 分页游标 | **全部**评论的 id | **顶层评论**的 id（否则会出现"父评论不在本页"的孤儿） |
| 加载方向 | 往上翻到顶 → 加载**更早** | 往下到底 → 加载**更多** |
| 发表区位置 | 滚动容器**之外**（父组件渲染，常驻底部） | 列表末尾（普通文档流，**刻意不吸底**） |

前端是同一个 `CommentsPanel`，用 `nested` 开关切换，**`reverse` 下强制平铺**——
讨论区因此不需要显式关掉它（它本来就传了 `reverse`）。
接口也是同一个 `GET /api/comments`：`?nested=1` 走楼中楼、`?parent=<楼主id>` 展开一串、缺省平铺。

#### 9.3 接口契约（改动过的地方）

- `POST /api/comments` 新增可选 `parentId`；返回的 `comment` 新增 `parentId` / `replyTo` /
  （列表侧）`rootId`，并已与两个 GET 接口**字段对齐**（`pageKey` / `pageLabel` 那次教训见
  [KNOWN_BUGS 第 14 条](KNOWN_BUGS_AND_FIXES.md)）。
- `parentId` 只做三条校验（正整数 / 同一 `page_key` / 仍公开），**任一不满足就静默降级成普通评论**：
  用户点回复时对方可能刚好删了，把正文整条拒掉是最糟的体验。
- 父评论被删/被隐藏**不级联**：平铺视图里回复仍在，引用行退化成「回复的那条消息已不可见」；
  楼中楼里那条回复**升级为顶层**继续显示（顶层查询含"父评论不公开"的孤儿）。

#### 9.4 踩过的坑（都已在代码注释里标明，别再踩）

1. **`UiButton` 的 `type` prop 没绑到模板** → 在 `<form>` 里等于隐式 `submit`，点表情按钮会把表单提交掉。
   （[KNOWN_BUGS 12](KNOWN_BUGS_AND_FIXES.md)）
2. **全局图片 `@error` 兜底会吃掉组件自己的 `@error`**（`App.vue` 在捕获阶段 `stopImmediatePropagation`）；
   表情图要带 `data-image-fallback="custom"` 自己处理失败。
3. **表情芯片的样式必须写在 `:deep()` 里**：芯片是 `document.createElement` 建的，
   拿不到 scoped 样式的 `data-v-*`，否则输入框里的表情会按**原图大小**显示（240px 贴纸撑满输入区）。
4. **光标位置只在输入框聚焦时记**（`keyup` / 框内 `mouseup`）：`focus`/`blur` 时拿到的选区不可信
   （重新聚焦可能停在开头），表现为"第二次插入的表情跑到最前面"。
5. **"是否贴底"必须在插入之前取**：`flush:'post'` 里现算会量到"插入后"的世界；
   贴纸消息 124px 高 > 120px 阈值，于是"发完表情不自动滚到底"。
6. **`scrollIntoView` 会把所有可滚祖先一起滚**（含页面本身）→ 详情弹窗里表现为"页面挤上去"；
   只滚自己的滚动容器。
7. **「回复 / 删除」要给操作区一个 `margin-left: auto`**，不能给两个按钮各自加（回复会被推到行中间）。
8. **`ownedIds` 要连嵌套回复一起扫**，否则自己发的回复没有删除入口。
9. **待审评论不要触发整页重拉**（列表会瞬间变短、页面挤一下），提示交给发表区自己。

#### 9.5 回归与开发卫生

- 套件清单见 §0.7；表情 / 回复 / 楼中楼三套是 2026-10-04 新增的。
- **脚本不再吃掉本地数据**：`scripts/dev/scratch/lib/comment-fixture.mjs` 负责"清库前备份、
  退出时还原"（详见 §0.6 的说明与 ⚠️）。本地被测试数据堆脏时用
  `clean-test-comments.mjs`（先预览、`--apply` 才删）。
- 加新表情包：改 `src/config/emoticons.js` 目录表 → `node scripts/dev/import-emoticons.mjs`
  （预览）→ `--apply`；导入脚本与单测会**双向核对**目录表与 `public/images/emoticons/`。

#### 9.6 表情素材与命名（换包/换名时看这里）

- **两个包**：黄豆 emoji 85 张（来自 `贴吧经典黄豆表情包` 的 `tb_黄豆表情`(60) + `tb_物品与符号`(25)
  两个子目录，**按这个顺序**展示）、深渊之歌第1弹 8 张（官方微信表情包去背景版）。
  全部无损 WebP（像素与原图一致，不是"压缩"），共约 590 KB。
- **中文名有据可查**，不是回忆出来的：与包内 `经典命名版`（50 张人工命名）**逐张像素比对**得到 50 条，
  其余按包内拼音命名 + 逐张看图确认（`tb_wuzuixiao` 拼音有歧义，看图确认是「捂嘴笑」）。
  名字与顺序手写在 `src/config/emoticons.js` 的目录表里，选择器的 tooltip / aria 用它们。
- **导入**：`node scripts/dev/import-emoticons.mjs`（预览）→ `--apply`。
  脚本与单测会**双向核对**目录表 ↔ `public/images/emoticons/`（少图 / 漏登记 / 缺名字 / 重名都报错），
  `--apply` 还会清掉本包目录里不在目录表内的旧文件。
- ⚠️ **命名方案换过一次**：黄豆从编号（`[e:tieba:20]`）改成拼音（`[e:tieba:tb_yiwen]`）——
  **换名之前发的表情评论会退化成 token 原文**。当时线上还没有公开数据，所以没做别名映射；
  将来若再换名，先加一层旧名映射再改目录表。
- ⚠️ **Android 老包**：`public/images/**` 走 CDN 优先，在线时能自动拿到新素材；
  离线且热更包未更新时，表情回退成**中文名文字**（不会显示破图）。

#### 9.7 还没做的（按性价比排序，给接手者挑）

| 优先级 | 事项 | 说明 |
| --- | --- | --- |
| P1 | **「↓ 新消息」提示 / 未读计数** | 现在翻历史时新消息来了**毫无提示**；和"贴底才跟随"的规则直接配套 |
| P1 | **草稿保留 + 失败重试** | 刷新/切页会丢掉打的字（目前只存了"发送方式"偏好）；失败后正文还在但没有重试入口 |
| P1 | **表情「最近使用」** | 85 格里翻常用表情很烦；纯前端 `localStorage` 即可 |
| P2 | **回复提醒全局化** | 现在只有"正好看到那条"才有「回复你」标记；跨页面要"有 N 条新回复"，绕不开按 `parent_id` 反查（没索引 → 全表扫，得先决定要不要加索引） |
| P2 | **点引用行跳到未加载的父评论** | 父评论更早、还没被加载时现在什么都不做（怕把阅读位置挪走） |
| P2 | **链接自动识别** | 正文里的 http 链接目前是纯文本，不可点（需要 `rel="noopener"`） |
| P2 | **举报入口** | 用户侧没有，只能等管理员看到 |
| P3 | 连续同一人的消息合并、未读分隔线「以下是新消息」 | 纯观感 |
| P3 | 楼中楼长列表虚拟化、消息搜索 | 现在 20 条/页 + 自动加载，几百条以内没问题 |
| P3 | 账号体系 | 方案见 [ACCOUNT_SYSTEM.md](technical/ACCOUNT_SYSTEM.md)，未实施（§0.9） |

---

## 三、核心文件与代码架构

### 1. 关键文件速查表

| 文件路径 | 核心职责 |
| :--- | :--- |
| `src/utils/monsterParser.js` | 怪物数据预解析纯函数。包含 `SPECIAL_TRANSFORM_CONFIGS` 配置表、AI 触发条件格式化、普通攻击过滤修正与变身边关系提取。 |
| `src/components/MonsterDetailModal.vue` | 怪物详情弹窗组件。承载形态 Tab 联动、阶段流转卡（支持定制节点名与动态回网条件）、技能详情与召唤物联动。 |
| `scripts/parse/monsters.mjs` | 构建期怪物数据编译脚本。调用 `monsterParser.js` 输出预解析产物 `public/data/parsed/monsters.json`。 |
| `scripts/parse/index.mjs` | 数据预编译总调度。定义构建任务队列与执行顺序（`items` 必须先于其他任务构建）。 |
| `scripts/dev/verify.mjs` | 全局自动化验收脚本。检查全图鉴 Tab 命名无冲突、产物大小完整性、浏览器运行时纯净度与构建验证。 |
| `src/views/ChaptersView.vue` | 关卡图鉴主页。管理世界地图、地区路线图与关卡详情的层级导航。 |
| `src/components/RewardPools.vue` | 战利品货架。承载奖励池展示、掉落概率明细弹窗与跨池去重聚合。 |
| `src/components/ItemDetailModal.vue` | 物品详情弹窗。处理装备品质展示、药水效果排序与符石包过滤。 |
| `src/components/CommentsPanel.vue` | 评论列表（**两种形态**：讨论区平铺 / 详情页楼中楼）+ 面板内的发表区；列表、引用行、回复块、自动加载都在这里。 |
| `src/components/CommentComposer.vue` | 发表区：富文本输入（`contenteditable`，表情直接显图）、序列化回 token、发送方式、回复条。 |
| `src/components/EmoticonPicker.vue` / `EmoticonText.vue` | 表情选择层（两个页签、中文名 tooltip、向右展开）/ 正文渲染（token → 图片，未知 token 当普通文字）。 |
| `src/config/emoticons.js` | **表情唯一来源**：包目录、token 语法、显示字数、分段、`emoticonPlainText`；零依赖，Worker 也 import 同一份。 |
| `functions/api/[[path]].js` | 评论 API 单文件：列表（平铺/楼中楼/展开一串）、发表（含 `parentId` 校验与降级）、自删、管理端、右栏最新。 |

### 2. 数据流水线与预解析（`scripts/parse/`）
- **数据源单一真实性**：
  - 运行时纯粹读取 `public/data/parsed/` 下的预处理 JSON，前端禁止直接引用 `raw/` 下的原始大表。
  - 每次改动数据解析脚本后，必须运行 `npm run build` 或 `npm run verify` 生成并验证对应清单。
- **构建顺序**：`items` 必须先构建，其他解析模块依赖 `itemData`。

---

## 四、特殊变身阶段配置规范（拓展指南）

若后续游戏更新或需为其他拥有特殊机制的怪物配置生动的阶段展示，只需在 `src/utils/monsterParser.js` 的 `SPECIAL_TRANSFORM_CONFIGS` 中注册对应的怪物 ID：

```javascript
const SPECIAL_TRANSFORM_CONFIGS = {
  // 怪物基础 ID 或变身发起 ID
  '012': {
    stage1Name: '空中结网 · 霸体',        // 节点 1 名称
    stage2Name: '坠地虚弱 · 破防',        // 节点 2 名称
    stage1Tab: '空中结网 (一阶段)',       // 一阶段 Tab 显示文本
    stage2Tab: '坠地虚弱 (二阶段)',       // 二阶段 Tab 显示文本
    condition: '被命中 4 次后击落',       // 阶段 1 -> 阶段 2 触发条件（可选覆盖）
    reverseCondition: '完成 2 次攻击后逃窜回网' // 阶段 2 -> 阶段 1 逆向逃窜条件（可选覆盖）
  }
}
```

配置后，`MonsterDetailModal.vue` 会自动优先读取这些字段，未配置的普通变身怪（如角布林头领）将优雅回退为默认的 `一阶段` / `二阶段`，完全向前向后兼容。

---

## 五、关键架构与技术要点（避坑指南）

### 1. 样式的布局与测量安全性
- **动态测量元素（Tooltip / 弹出气泡）**：
  - 避免用 `display: none` 配合 JS 首次 hover 测量尺寸。若需要读取元素宽高，优先使用 `visibility: hidden; opacity: 0;` 让其保留在 Layout Tree 中。
- **弹窗内相对容器定位**：
  - 弹窗内容区带有 `overflow-y: auto` 和边框，Tooltip 计算容器优先通过 `slot.closest('.ui-modal-body, .ui-modal-window')` 获取可视边界。

### 2. 坐标转换与地图画布规范
- **Unity 坐标系到 Web 坐标系**：
  - Unity UI 的 `localPosition` 是 `+y` 向上，CSS 的 `top` 是 `+y` 向下。统一使用 `y_css = size.h - y_unity`。
  - 节点坐标、连线端点、底图中心点均需同步翻转，任何偏移量（如地区 -80、副本 -75）需在 Unity 坐标系内先行相加再行翻转。
- **地图缩放与事件捕获**：
  - 地区路线图交互使用显式偏移（Translate），禁止使用 `scrollLeft/scrollTop`。
  - 节点使用 `1/zoom` 反向补偿缩放，确保在任意视口缩放下保持物理像素清晰与视觉尺寸稳定。

### 3. Windows / PowerShell 开发注意事项
- **编码问题**：
  - 禁止使用 PowerShell 自带的 `Out-File` 或 `Set-Content` 直接写入 UTF-8 中文字符串（容易引发乱码或引入 BOM）。推荐使用专用的文件写入工具或 Node.js `fs.writeFileSync(file, content, 'utf8')`。
- **npm 执行策略限制**：
  - 在当前 Windows 环境下，直接在 PowerShell 终端执行 `npm` 命令可能会受到脚本执行策略限制，必须使用 `cmd.exe /c <command>`。
- **自动化校验**：
  - 提交前务必运行 `node scripts/dev/verify.mjs`，确保全部数据校验、死链检查和产物构建通过。

---

## 六、常用命令一览

| 目标 | 执行命令 | 说明 |
| --- | --- | --- |
| 本地开发 | `cmd.exe /c npm run dev` | 启动 Vite 开发服务器（支持热重载） |
| **评论 API（本地必需）** | `cmd.exe /c npm run dev:api` | 启动 wrangler Pages Functions（8788）；**改了 `functions/` 必须重启** |
| 数据预构建 | `cmd.exe /c npm run data:build` | 重新生成所有 `parsed/*.json` 数据 |
| 全量校验 | `cmd.exe /c npm run verify` | 执行完整预解析检查与生产构建打包 |
| UI 自动化测试 | `cmd.exe /c npm run test:ui` | 运行 Playwright UI 交互与回归测试 |
| 清本地限流 | `npx wrangler d1 execute myrzg-comments --local --command "DELETE FROM rate_limits;"` | 跑评论测试前只清限流；**不要连评论一起删**（见 §0.6/0.7） |
| 重建演示讨论 | `node scripts/dev/scratch/seed-site-discussion.mjs` | 显式重置：清空评论表并铺 5 条站内演示讨论（故意不接入备份还原） |
| 清理测试脏数据 | `node scripts/dev/scratch/clean-test-comments.mjs [--apply]` | 只删已知测试签名的评论，保留站主自己发的 |

> **提示**：修改了 `monsterParser.js`、`items.mjs` 等预解析逻辑或原始配置表后，必须执行 `data:build` 重新生成 JSON 文件。交付前必须确保 `verify` 命令退出码为 0（全部 ✅）。

---

## 七、后续可关注优化方向

0. **[最优先] 推送已提交的 3 个提交**（见 §0.1 末尾与 §9）。
   `0c745272`（评论模块：`public/images/emoticons/` 93 张、`public/ui/emoticon.svg`、
   `src/config/emoticons.js`、`EmoticonPicker/EmoticonText/UiSplitButton`、
   `tests/unit/emoticons.test.mjs`、`docs/dev-logs/2026-10/2026-10-04.md`）与
   `b8aaf946`、`a3729989`（移动端贴边悬浮拉手 + 长列表快滑图片防排队）
   **全都已入库**，直接 `git push`；不再需要补 `git add`。
   **回复不需要 D1 迁移**（用预留的 `parent_id`），推上去即可用。
1. **评论模块还没做的功能**：见 §9.6 的优先级表（P1：新消息提示 / 草稿与重试 / 表情"最近使用"）。
2. 讨论区面板高度仍是 `calc(--vh100 - … - 190px)` 的**推算魔数**（〇·0.5 末尾），
   要动它必须先在 1025 / 1161 / 1440 三视口复核；
3. 关卡图鉴中更多特殊关卡（如隐藏探索点位、支线任务交互）的视觉高亮与过滤增强；
4. 移动端在极端小屏（< 360px）下复杂概率文本的字号与排版微调；
5. 为更多拥有特殊战斗机制的 Boss 配置 `SPECIAL_TRANSFORM_CONFIGS`，丰富阶段展示；
6. 怪物 Buff / 异常状态数值补全（已做前期数据探索，`raw/buff.json` 中含完整 Buff 定义，可在后续版本中落地为独立模块）；
7. 后续版本若有新增关卡/怪物/装备数据，运行 `scripts/parse/` 重新构建即可平滑接入。
