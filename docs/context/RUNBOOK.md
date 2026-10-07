# RUNBOOK —— 运行、构建、验收、发布

> 执行对应操作**前**读本文件的相关章节。命令与前置条件在这里；为什么这么设计看 [DECISIONS.md](DECISIONS.md)，风险与故障看 [RISKS.md](RISKS.md)。
>
> **何时读**：运行、构建、验收、发布、运维操作之前。
> **何时更新**：方法或前置条件变化时。**未实际执行过的命令必须明确标注。**
>
> ⚠️ **本文件中的步骤不构成执行授权。** 命令已配置 ≠ 执行成功；历史结果 ≠ 当前证据。
> 标注「未执行」的步骤表示**在本文件核对时未实际运行过**。

**核对时间**：2026-10-07 ｜ **环境**：Windows / PowerShell

---

## 一、环境准备

### 1.1 前置条件

| 需要 | 说明 |
| --- | --- |
| Node.js + npm | 依赖见 `package.json` |
| 游戏原表 | 完整数据再生成需要，**不入库**。位置见 [PROJECT_INDEX](../../PROJECT_INDEX.md) 第五节 |
| `bash` / `node` / `npm` 在 PATH | 部分脚本依赖 |
| Windows 下 npm | **走 `cmd.exe /c`** |

### 1.2 首次安装

```powershell
cd E:\Desktop\html\myrzg\vue-myrzg
npm install
```

### 1.3 环境变量

本地值在 `.dev.vars`（gitignored）：`IP_HASH_SALT`、限流阈值等。
**线上是控制台另配的随机串，不是本地值**（已确认：用本地值打线上管理接口返回 401）。

> `ADMIN_TOKEN` 已于 2026-10-07 **废弃** —— 后台改为按登录账号的 `users.role` 鉴权，见 [DECISIONS.md](DECISIONS.md) §六。

> 🔴 `AUTH_PEPPER` / `SALT_SECRET` **上线后不能再改**。见 [AGENTS.md](../../AGENTS.md) 第四节。

---

## 二、本地开发

**两个服务都要起**，缺 API 时评论/账号接口全 502。

```powershell
cmd.exe /c "npm run dev"       # Vite 前端 → http://localhost:5173
cmd.exe /c "npm run dev:api"   # wrangler Pages Functions → http://127.0.0.1:8788
```

- 浏览器始终开 **5173** —— `vite.config.js` 把 `/api/*` 代理到 8788。
- 🔴 **改了 `functions/` 必须重启 `dev:api`**（wrangler 不热加载）。
- 只做静态图鉴相关开发时，可以不起 `dev:api`；评论面板会提示连不上服务，其余页面不受影响。

---

## 三、数据构建

```powershell
cmd.exe /c "npm run data:build"        # 原表 → public/data/parsed/
cmd.exe /c "npm run search:update"     # 重建搜索 / 来源 / 类型索引
```

### 3.1 数据再生成的两条路（必须分别验收）

| 路径 | 条件 | 证明力 |
| --- | --- | --- |
| **沿用已有产物构建** | `raw/` 与 `public/data/` 都找不到 `reward.json`，但已有 `parsed/items.json` | 只证明「前端可构建」，**不证明**产物齐全、同版本或原表完整 |
| **从完整输入再生成** | `raw/` 原表 + 派生输入 + 剧情资源齐全 | 真正的完整数据验收 |

`scripts/parse/index.mjs` 的跳过判断**只检查文件是否存在**。不要用前者证明后者。

### 3.2 构建顺序约束

`items` **必须先构建**，其他解析模块依赖 `itemData`。

### 3.3 不由常规构建自动执行的独立步骤

| 命令 | 作用 |
| --- | --- |
| `node scripts/parse/extractDungeonRoutes.mjs` | 从完整配置提取副本路线输入 |
| `npm run data:dungeons:effects` | 维护女神/泉水等房间结构化效果输入 |
| `npm run data:monsters:tower` | 从完整 tower/battle/room 生成轻量 Boss 塔层索引 |
| `npm run skins:export` | 离线导出皮肤模型 PNG 与清单 |
| `npm run fonts:subset -- --apply` | 字体子集化（数据更新后字符集变大必须重跑） |

---

## 四、验收

### 4.1 全量验收

```powershell
cmd.exe /c "npm run verify"
```

> 🔴 **`verify` 包含构建**（`data:build` + `vite build` + 产物完整性与残留校验 + 字体子集断言），
> **不是只读检查**。构建写产物时**不要并发**运行读取同一生成目录的回归。

字体子集有**三条**断言：① 字符集是否过期；② 产物里每条 `@font-face` 是否指向子集；③ 每个字体 URL 是否带 `?v=<内容哈希>`。
后两条必需——漏带子集或漏带版本号都**不会报错**，只会静默降级（回退全字集／缓存发旧字形最长 7 天）。

### 4.2 测试套件

| 命令 | 覆盖 | 前置 |
| --- | --- | --- |
| `npm run test:unit` | 单测（40 个测试文件） | — |
| `npm run test:api` | 端到端（账号 + 评论） | **API 必须在 8788 跑着** |
| `npm run test:migration` | 迁移演练（34 条） | — |
| `npm run test:ui` | Playwright 交互回归（32 个 spec） | — |
| `node --no-warnings tests/phone/flow.mjs` | 真机（38 条） | USB + adb 转发，见 4.4 |
| `node --no-warnings tests/api/production-smoke.mjs` | 线上验证（18 条，**只读**） | 网络 |

> **新建带筛选框的图鉴页时**，除全量 `test:ui` 外可单独跑吸顶裁切回归（20 条，约 1.2 分钟）：
> `npx playwright test tests/ui/sticky-clip.spec.js --project=desktop --reporter=line`。
> 它逐路由实测「裁切量 == 筛选框底边 − 内容容器顶边」，能抓出「主题目录筛选框没放回页面根」或「自建滚动容器漏 `data-main-scroll`」这两类**静默**失效。规则见 [UI 组件库 §3 第 9 条](UI_COMPONENT_LIBRARY.md#3-使用规则强制)。

### 4.3 Playwright 必须限并发

```powershell
npx playwright test --project=desktop --reporter=line
```

🔴 **不要把 `workers` 改成按 CPU 核数自动。** 本机 `cpus/2` = 8，8 个浏览器会同时打**同一个单进程 `wrangler dev`**，而本地 D1 是**一个 SQLite 文件** → 大面积 `Test timeout` / `ECONNRESET`，**失败的是互不相干的一堆 spec**，看起来像"到处都坏了"。

要更快只能显式覆盖并自担代价：`PLAYWRIGHT_WORKERS=4 npx playwright test`。

### 4.4 真机准备

```powershell
adb shell input keyevent KEYCODE_WAKEUP
adb shell settings put system screen_off_timeout 1800000   # 完事改回 600000
adb reverse tcp:5173 tcp:5173
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

Chrome 必须**在前台跑着**，那条 `localabstract` 才存在。手机息屏会冻结主线程。

### 4.5 CSP 自测

```powershell
cmd.exe /c "npm run build"                 # 先构建出 dist/
node scripts/dev/check-csp.mjs             # 检查 + 截图
node scripts/dev/check-csp.mjs --headed    # 带界面排查
```

从 `public/_headers` **解析真实 CSP**（不另抄一份），起本地静态服务托管 `dist/`，用 Playwright 注入该头，逐页收集 `securitypolicyviolation`。
**CSP 的误伤特点是「不报错、只静默失效」**，所以必须程序化收集违规。退出码：有违规 = 1。

> ⚠️ 开发环境（`npm run dev`）**不受 `_headers` 影响**，看不到 CSP 行为；Android 原生壳同样不受影响。

### 4.6 缓存头核对

```powershell
cmd.exe /c "npm run cdn:check"
```

只读、需网络、**不进 verify**。站点是 Cloudflare Pages + 外层腾讯云 EdgeOne，**后者策略优先**，文件写对不等于线上生效。该脚本同时核对 `Content-Type`——因为 `_redirects` 是 `/* /index.html 200`，不存在的路径也会回 200，只看状态码会把"未部署"误判成"缓存头正确"。

---

## 五、评论 / 账号相关操作

### 5.1 本地数据

```powershell
# 跑评论测试前只清限流（不要连评论一起删）
npx wrangler d1 execute myrzg-comments --local --command "DELETE FROM rate_limits;"

# 显式重置本地演示讨论（清空评论表并铺 5 条）
node scripts/dev/scratch/seed-site-discussion.mjs

# 只清测试脏数据（按已知测试签名匹配，站主自己的评论不会被删）
node scripts/dev/scratch/clean-test-comments.mjs          # 预览
node scripts/dev/scratch/clean-test-comments.mjs --apply  # 真删
```

> 🔴 **不要手动 `DELETE FROM comments` 清库。** 评论类测试脚本自 2026-10-04 起会**自动备份并还原**（`scripts/dev/scratch/lib/comment-fixture.mjs`），手动清库会让正在手点页面的人下一次刷新出现「列表瞬间变短、页面挤一下」。

限流阈值：**每 IP 每小时 5 条 / 每天 20 条**。

### 5.2 新增页面挂讨论区

必须**同时改两处**，否则归属键校验会拒：

1. `src/utils/commentApi.js` 的 `COMMENT_PAGE_PREFIX`
2. `functions/api/[[path]].js` 的 `PAGE_KEY_RE`

并把页面人话名字用 `pageLabel` 传上去，否则管理端只显示 `item:item_00001` 这类内部标识。

### 5.3 后台权限（2026-10-07 起）

后台**不再用环境变量令牌**，改为看登录账号的 `users.role`（`0` 普通 / `1` 管理员 / `2` 超管）。后台必须**已登录且 `role >= 1`**。

| 操作 | 规则 |
| --- | --- |
| 可操作范围 | 只能操作角色**严格低于**自己的 |
| 自己那一行 | **谁都不能操作自己**（界面也不给按钮） |
| 设为/撤销管理员 | **仅超管**（`PATCH /api/admin/users/role`） |
| 产生超管 | **接口不能**（`role=2` 被服务端拒绝） |
| 审计 | `admin_audit` 表 + `GET /api/admin/audit`（**仅超管**可读）；越权被拒**不写审计** |

#### 把自己锁在后台外了怎么恢复

`role` 只能改数据库。**紧急恢复 SQL 写在迁移脚本末尾**：

```powershell
npx wrangler d1 execute myrzg-comments --remote --command "UPDATE users SET role = 2, status = 1 WHERE email = '你的邮箱';"
```

#### 迁移顺序

**必须先迁移、后推送**（同 §6.2）。角色相关的建表与加列在 `scripts/sql/2026-10-07-admin-role.sql`。
改任何迁移脚本后**必跑** `npm run test:migration`。

#### 验证入口

| 命令 | 覆盖 |
| --- | --- |
| `node --no-warnings tests/api/admin-roles.mjs` | 穷举 `操作者角色 × 目标角色 × 操作`（**需 API 在 8788 跑着**）。当日记录 44/0，**本文件未复跑** |
| `npx playwright test tests/ui/admin.spec.js` | 角色按钮可见性、审计记录、自己那行不给操作 |

> **为什么必须穷举**：层级漏洞的形态是"漏了一条分支"，代码看起来是对的 —— 靠"小心点写"防不住。
> ⚠️ 上表的通过数是**当日开发日志的记录**，不代表当前仍通过；要当前证据就自己跑一遍。

---

## 六、发布

### 6.1 发布顺序

1. 在原表/派生输入完整的环境运行 `cmd.exe /c "npm run verify"`。
2. 检查 `dist/data`、`dist/images`、`assets/data-manifests` 齐全；HTML/JS/CSS、图片、JSON 与清单必须来自**同一次构建**。
3. 上传完整产物；缓存过渡期**保留旧 hash 的 assets**，不运行旧的 dist 删除策略。

### 6.2 🔴 推送即上线

本仓库用 **Cloudflare Pages 的 GitHub 集成**部署 —— `git push` **就是上线**，没有"再点一下发布"。

**改表结构的顺序永远是「先迁移、后推送」**：

```powershell
# 1) 先备份
npx wrangler d1 export myrzg-comments --remote --output backup-before.sql
# 2) 建表 + 不依赖新列的索引（幂等）
npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/<建表脚本>.sql
# 3) 加列（非幂等，SQLite 没有 ADD COLUMN IF NOT EXISTS）
npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/<加列脚本>.sql
# 4) 建依赖新列的索引（幂等）
npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/<索引脚本>.sql
```

**改任何迁移脚本后必须跑** `cmd.exe /c "npm run test:migration"`。它从 git 取迁移前那一版 `schema.sql`、造临时库、灌真实形状数据，把三步真跑一遍。

### 6.3 Android 同步

```powershell
cmd.exe /c "npx cap sync android"
```

热更将完整 dist 打成 zip，**`index.html` 在 zip 根层**。云端 `update/hotupdate.json` 的 `version` / `downloadUrl` / `body` 分别为版本、zip 地址、说明，三者必须同步。

> 🔴 **禁止删除 `dist/data`、`dist/images` 后再同步 Android。** 旧 `clean_dist.bat` 的删除策略已停用。

### 6.4 版本与回退

- 热更新以 `CapacitorUpdater.current()` 的**实际运行 bundle** 为准；`local_web_version` 只用于兼容显示，在 ready 确认后才同步。
- **下载或切换前不得提前宣称新版已生效。** 回滚后重新读取实际 bundle。

### 6.5 原生发版顺序

先检查 Gitee APK 大版本，再检查热更小包。下载监听在失败或切换前释放。

---

## 七、运维（部署链路）

### 7.1 请求怎么走

```
用户（大陆为主）
  │  DNSPod: syzg.yxzmy.top CNAME → syzg.yxzmy.top.eo.dnse3.com
  ▼
腾讯云 EdgeOne 边缘节点   ← 大陆加速在这一层
  │  回源 syzg.pages.dev
  ▼
Cloudflare Pages 项目 syzg
  ▼
Cloudflare D1（myrzg-comments）
```

两层 CDN 的原因：Cloudflare Pages 在大陆没有节点，套 EdgeOne 只对大陆可达性有意义，**不会让静态资源更快**。

### 7.2 缓存策略

| 路径 | 源站 `public/_headers` | EdgeOne |
| --- | --- | --- |
| `/api/*` | `no-store` | 不缓存 |
| `/`、`/index.html` | `no-cache`（每次回源校验） | — |
| `/assets/*` | `immutable, max-age=31536000` | — |
| `/data/parsed/**` | `immutable, max-age=31536000` | — |
| `/fonts/*` | 1 年 + `?v=` 内容哈希 | 实测 604800 |
| 图片 `jpg/png/gif/bmp/webp` | 7 天 | **浏览器缓存 TTL = 7 天** |
| `svg` | — | 单独一条 = 1 小时（部分 svg 硬编码路径、不带 `?v=`） |

**已知代价**：首页 HTML 是 `no-cache`，每次跨洋回源（实测 TTFB ~1.4s）。这是"发版立刻生效"换来的。要提速可在 EdgeOne 给 `/` 配节点缓存 TTL，代价是发版后手刷缓存——**未做，是可选项，不是 bug**。

### 7.3 证书

EdgeOne 免费证书 = 自动申请 + 自动续签（域名详情 → 配置证书 → 「申请免费证书 + 自动验证」）。

🔴 **加了加速域名但不配证书 = 整个域名 HTTPS 不可用**（`ERR_EMPTY_RESPONSE` / TLS 握手失败）。这不是 DNS 问题，也不是缓存问题。

### 7.4 凭据

| 平台 | 能做 |
| --- | --- |
| GitHub | `gh` CLI 已登录，可建/删仓库、推送 |
| Cloudflare | API 令牌在 `E:\Desktop\html\myrzg\_ai-credentials\`，可管 Pages / D1。**当前令牌只有 Pages Write + D1 Write，没有 D1 Edit** |
| 腾讯云 EdgeOne / DNSPod | **只能用户在控制台操作** |

> ⚠️ 账户级令牌（`cfat_` 前缀）**不能用 `/user/tokens/verify` 校验** —— 对这种令牌一律回 `1000 Invalid API Token`。
> **正确方式是拿它打真实端点**：`/accounts`、`/accounts/{id}/pages/projects`、`/accounts/{id}/d1/database`。
> 这类令牌通常读不到 `/accounts/{id}` 本身（403），属正常。

---

## 八、本机环境坑

| 坑 | 表现 | 解法 |
| --- | --- | --- |
| **git 连不上 GitHub** | `Could not connect to server`，但 `curl github.com` 返回 200 | `git -c http.sslBackend=openssl -c https.proxy=http://127.0.0.1:7890 push`。**必须同时换 openssl 后端**，只配 `http.proxy` 会 `schannel handshake failed` |
| **wrangler 远程操作** | 非交互环境要求令牌 | `npx wrangler login`；并给进程带 `HTTPS_PROXY` |
| **PowerShell 吃引号** | `node -e "..."` 里的 `[[path]]`、`\\$` 被解析坏 | 写成临时 `.mjs` 文件执行 |
| **`Get-Content` 按 GBK 读** | 中文显示成乱码（文件其实是 UTF-8） | 用编辑工具读，或 `Get-Content -Encoding UTF8` |
| **PowerShell 不认 `&&`** | 报语法错 | 分两条写 |
| **手机调试 CDP 超时** | `Page.navigate` 永远超时 | Chrome **冻结后台标签**；`am start` 打开 Chrome + `bringToFront()` |
| **手机息屏** | 主线程冻结，CDP eval 超时 | 先 `adb shell input keyevent KEYCODE_WAKEUP` |

---

## 九、文档链接校验（纯文档改动时跑）

```powershell
node -e "const fs=require('fs'),path=require('path');const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);let bad=0,total=0;for(const f of walk('docs').filter(f=>f.endsWith('.md'))){const txt=fs.readFileSync(f,'utf8');for(const m of txt.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)){const t=m[1];if(/^https?:|^mailto:/.test(t))continue;total++;if(!fs.existsSync(path.resolve(path.dirname(f),t))){bad++;console.log('  x '+f+' -> '+t);}}}console.log(total+' 条相对链接，失效 '+bad+' 条');"
```
