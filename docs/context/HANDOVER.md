# 项目交接总览

> **状态**：现行。本文是**接手入口**，只回答「这是什么、从哪看起、什么不能碰」。
> 细节一律指向权威文档，不在此重复。
>
> **何时读**：第一次接手本项目、或隔了很久回来时。
> **何时更新**：目录职责、技术栈、入口命令、红线清单变化时。**不写进度**（进度看 [NOW.md](NOW.md)）。

**核对时间**：2026-11-09 ｜ **最近代码提交**：`44c4636b`

---

## 一、这是什么

《深渊之歌》的**离线图鉴 Wiki**，Web + Android 双端。除评论/账号外全部是静态数据，**不连接游戏账号**。

| 项 | 值 |
| --- | --- |
| 线上 | <https://syzgwiki.top>（经 EdgeOne → Cloudflare 双层） |
| 仓库 | `Drloudx/syzg`（`main`），**`git push` 即上线** |
| 仓库目录 | `vue-myrzg/`（**不能改名**，见红线 ③） |
| 技术栈 | Vue 3.4 + Vite 8 + Vue Router（**Hash 模式**）+ Pinia + Capacitor |
| 后端 | Cloudflare Pages Functions + D1（仅评论与账号） |
| 规模 | 38 条路由 / 29 个视图 / 248 个源文件 / 43 个数据 JSON / 3251 张图（2026-11-09 实测） |

### 一句话定位每个模块

| 模块 | 一句话 |
| --- | --- |
| 图鉴（物/装/符石/角色/魔物/怪物/家具/设施/菜谱/任务/事件/副本/关卡） | 把本地解包的游戏数据渲染成网页，纯静态 |
| 神匠之塔 `/tower` | 80 层挑战数据，每 5 层首领关卡；已用 `UiVirtualGrid` 窗口化 |
| 其他 `/misc` | 挑战赛奖励 / 被隐藏的物品 / 培育室槽位消耗（路径原名 `/rewards`，已废弃） |
| 招募模拟 | 抽卡概率模拟，纯前端 |
| 配队模拟 | 按魔物队伍被动推荐出战组合，纯前端 |
| 讨论区 | 唯一需要后端的业务：D1 存评论 |
| 账号 | 邮箱验证码 + 密码登录，SES 发信 |
| 后台 `/admin/**` | 独立整屏布局，管理用户/评论/公告/首页配置（需 `role >= 1`） |

---

## 二、从哪看起（按目的选一篇，别通读）

| 我要… | 读 |
| --- | --- |
| 知道现在做到哪、下一步做什么 | [NOW.md](NOW.md) |
| 跑起来 / 构建 / 验收 / 发布 | [RUNBOOK.md](RUNBOOK.md) |
| 定位「改某功能该看哪节」 | [PROJECT_INDEX.md](../../PROJECT_INDEX.md) |
| 目录职责 / 数据流 / 分层 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| **去哪取配置表 / 剧情 / 源码 / 图片** | [DATA_SOURCES.md](DATA_SOURCES.md) |
| 某页面的业务规则 | [DOMAIN.md](DOMAIN.md) → 对应 `specs/*.md` |
| 为什么这么设计 | [DECISIONS.md](DECISIONS.md) |
| 已知故障 / 风险 | [RISKS.md](RISKS.md) |
| 迁移域名 / 动 DNS | [DOMAIN_MIGRATION.md](DOMAIN_MIGRATION.md) |
| UI 组件与布局规范 | [UI_COMPONENT_LIBRARY.md](UI_COMPONENT_LIBRARY.md) |

**深层专题**在 `docs/context/technical/`：账号、评论后端、战斗公式、配队模拟等。

> ⚠️ `docs/` 共约 1.2 MB。**不要通读**，按 [AGENTS.md](../../AGENTS.md) 的读取纪律定位章节。

---

## 三、目录骨架

```
vue-myrzg/                      ← 仓库根，目录名不能改
├─ src/
│  ├─ views/                    25 个页面
│  ├─ components/
│  │  ├─ ui/                    公共组件库（羊皮纸风格，唯一视觉来源）
│  │  ├─ heroes/ gacha/ ...     业务组件
│  ├─ utils/                    纯逻辑：解析、映射、算法
│  ├─ config/                   常量（认证、黑名单、表情…）
│  └─ router/index.js           28 条路由（Hash 模式）
├─ public/
│  ├─ data/parsed/              构建产物 JSON（38 个，页面读这个）
│  ├─ images/                   图片（2684 个，与业务名对应）
│  ├─ _headers / _redirects     CF Pages 配置
├─ functions/api/               Pages Functions（评论 + 账号）
├─ scripts/
│  ├─ parse/                    数据构建：raw → parsed
│  └─ dev/                      维护脚本（导入素材、审计、子集化…）
├─ tests/
│  ├─ unit/                     400 条单测
│  ├─ api/                      打真实端点的 smoke
│  └─ ui/                       Playwright
└─ docs/                        文档（本目录）

../游戏数据/                     ← 仓库外，唯一数据源（配置表/剧情/源码/图片/资源包）
../令牌agent勿看/                ← 仓库外，凭据。**任何情况下不读取、不列举**
```

### 数据流

```
游戏解包（../游戏数据/）
  → scripts/parse/*.mjs 解析
  → public/data/parsed/*.json（构建产物，提交进仓库）
  → src/utils/*Parser.js 读取并做字段归一化
  → src/views/*.vue 渲染
```

**原始数据不在仓库里**。要重新生成某张表，先确认 `../游戏数据/配置表/` 有源文件。

---

## 四、上手三步

```bash
npm install
npm run dev            # http://localhost:5173
```

评论/账号要另开终端（Vite 不认识 `functions/`）：

```bash
npm run dev:api        # wrangler，D1 本地
```

详见 [RUNBOOK.md](RUNBOOK.md)。

### 常用命令

| 命令 | 用途 | 注意 |
| --- | --- | --- |
| `npm run dev` | 开发服务 | — |
| `npm run build` | 构建 | — |
| **`npm run verify`** | **全量校验** | **包含构建**，不是只读检查 |
| `npm run test:unit` | 单测 400 条 | — |
| `npm run test:migration` | 迁移脚本校验 | 改迁移后必跑 |
| `npm run data:build` | 数据重建 | 会连带生成配队模拟精简表 |
| `npm run fonts:subset` | 字体子集化 | 内容加字后要跑，否则 verify 会失败 |

> `npm run verify` 通过 ≠ 功能可用；构建成功 ≠ 用户验收。区分这四种状态：**代码完成 / 测试通过 / 安装验证 / 用户验收**。

---

## 五、🔴 不能碰的东西

完整清单在 [AGENTS.md 四、项目红线](../../AGENTS.md)。最容易踩的几条：

| # | 红线 | 后果 |
| --- | --- | --- |
| ① | **`CLOUD_URL` 编进产物** | 改它等于要求所有 Android 用户更新热更包。例外仅限「尚未发版」期间，**发版后失效** |
| ② | **旧域名 / 旧 Pages 项目是退路** | `syzg.yxzmy.top`、`myrzg.pages.dev` 不要动 |
| ③ | **`com.myrzg.assistant` 包名 + `vue-myrzg` 目录名不能改** | 已安装用户无法增量升级、本地数据丢失 |
| ④ | **`mail.yxzmy.top` 的 DNS 永久保留** | 那是 SES 已验证发信域，删了验证码就发不出 |
| ⑤ | **`AUTH_PEPPER` / `SALT_SECRET` 上线后不能改** | 前者所有人登不上；后者所有人「不存在」，且**静默** |
| ⑥ | **迁移顺序：先迁移、后推送** | 反了会让讨论区对所有人挂掉 |
| ⑦ | **不对生产库跑破坏性 SQL** | — |
| ⑧ | **图片压缩/替换需明确授权** | 询问状态**不构成**授权 |
| ⑨ | **改 D1 主键前必须导出备份** | 改一半失败会留下脏数据，且不可逆 |
| ⑩ | **改 EdgeOne / DNS 配置前先备份** | 备份在 `backups/edgeone-*.json`，API 可直接还原 |

### 每次动手前

```bash
git status     # 工作区常驻未提交改动
```

**不在本次任务范围的文件：不 stage、不提交、不改动。**

⚠️ `backups/` **未被 `.gitignore` 覆盖**，里面有两个 5 MB 的 SQL 备份。
**不要用 `git add .`**，会把它们提交进仓库。

---

## 六、这个项目特有的坑

完整清单在 [AGENTS.md 六](../../AGENTS.md)。高频的几条：

| 坑 | 表现 | 解法 |
| --- | --- | --- |
| **git 连不上 GitHub** | `curl github.com` 返回 200 但 git 失败 | 本机有代理，git 默认不走：<br>`git -c http.sslBackend=openssl -c https.proxy=http://127.0.0.1:7890 push`<br>⚠️ 代理端口不通时反而要**去掉**这两个参数重试 |
| **PowerShell 吃引号** | `node -e "..."` 里的 `[[path]]`、`$` 被解析坏 | 写成临时 `.mjs` 文件执行 |
| **`npm` 在 Windows** | 直接 `npm run` 偶发失败 | 走 `cmd.exe /c "npm run ..."` |
| **数据源同名表混放** | 顶层若混入 CDN 新版，产出**静默**不同 | 顶层单一口径（APK 版），CDN 版进 `_CDN新版/` |
| **`_redirects` 的 SPA 兜底** | 缺失文件返回 **200 + text/html**，不是 404 | 判断资源是否失效要看 `Content-Type`，不能看状态码 |
| **D1 拒绝显式事务** | 报错要求用 `state.storage.transaction()` | SQL 文件里**不写** `BEGIN/COMMIT`；D1 按批次原子执行，失败自动回滚 |
| **D1 改主键会撞** | `site-4 → site-2` 时 `site-2` 还在 | 两段式：全部搬到临时前缀 → 再全部落地，不能边搬边落地 |
| **改主键改一半** | 中途失败留下 `old-` 前缀脏数据 | 先导出备份；脚本按「幂等」写（只更新仍处于旧值的行） |

### 首页「加载态与成品等高」

首页各段（公告、核心图鉴、实用工具、契约者展示、底部两栏）的 `min-height` **必须等于成品高度**，否则「加载态 → 真内容」会把整页撑高 400+ px，滚动条跟着变。

| 🔴 约束 | 原因 |
| --- | --- |
| `min-height` 写在 **section** 上，不写在 `.core-indexes-grid` / `.tools-grid` | grid 默认 `align-items: stretch`，会把卡片一起拉高（实测 188→233） |
| 断点媒体查询必须写在基础规则**之后** | 同权重后写覆盖先写，放前面会被 `min-height: 206px` 盖掉 |
| 契约者展示**不能**用 `v-if` 按内容有无显隐 | 该块 308px，中途消失会让下方整体上移 300+ px |

### 路由切换加载态

| 🔴 约束 | 原因 |
| --- | --- |
| **不要用 `<Suspense>`** | vue-router 在赋 `Component` **之前**就 `await` 完 `import()`，fallback 永不触发 |
| `afterEach` **不能**立刻关 `routeNavigating` | 它在 t≈10ms 触发，而布局变化在 t≈105ms，开关只活 8ms |
| **不要用** `overflow: hidden` 藏滚动条 | 滚动条会整根移除再重建，表现为「消失一下又出现」，比原跳变更怪 |
| 后台路由一律不显示前台加载态 | 后台是独立整屏布局，覆盖层会浮在前台地图壳上 |

### EdgeOne 排障（2026-11-06 实测）

站点配置为 **`Area: overseas` + `PlanType: plan-free`**，这决定了以下能力**全部不可用**：

| 能力 | 状态 | 报错 |
| --- | --- | --- |
| 大陆加速 `AccelerateMainland` | ❌ | `套餐包不支持中国大陆加速配置` |
| 智能路由 `SmartRouting` | ❌ | `当前套餐不支持智能加速配置` |
| 改 L7 规则缓存 | ❌ | **原样回写都报 `FailedOperation.InvalidParam`**（无写权限） |
| 站点级缓存 | ✅ 可改 | 但被 L7 规则的 `FollowOrigin` 覆盖，HTML 仍每次回源 |

**关键结论**：`index.html` 的 `Cache-Control: no-cache` 由 Cloudflare Pages 强制，加上 L7 规则不可改 → **HTML 必然每次跨境回源**。这就是部分国内用户 `ERR_CONNECTION_RESET` 的成因。

**大陆加速的真正前提**（不是升级套餐就能解决）：

1. 域名完成 ICP 备案
2. 站点 `Area` 为 `Chinese mainland`（创建时定死，`overseas` 改不了）
3. 套餐含大陆加速能力

备案又要求有国内服务器 → **小站性价比极低，不建议投入**。

**回滚**：配置备份在 `backups/edgeone-*.json`，用 TEO API `ModifyZoneSetting` 逐字段还即可。

---

## 七、改动怎么验证

**检查范围 = 改动半径**，不做全项目审计。

| 改动范围 | 必要检查 |
| --- | --- |
| 纯文档 | 相对链接、UTF-8、核对时间 |
| 配置 / 解析 | 对应单测、原表完整性、相关产物 |
| 页面交互 | 桌面/手机场景、筛选/空态、前进后退 |
| 构建 / 发布 | 完整输入再生成、生产构建、离线回退 |

**收尾动作顺序**：改完 → 范围匹配的验证通过 → 写当日开发日志 → 同步权威文档 → 再提交。

---

## 八、约定

| 项 | 约定 |
| --- | --- |
| 编码 | 统一 **UTF-8**。不用 `Set-Content`/`Out-File`（会 GBK 乱码或加 BOM） |
| 写文件 | 用编辑工具或 Node `fs.writeFileSync(..., 'utf8')` |
| 提交信息 | 见 [CONTRIBUTING.md](CONTRIBUTING.md) |
| 开发日志 | `docs/history/dev-logs/YYYY-MM/YYYY-MM-DD.md`，按日汇总 |
| 状态字段 | 功能上线/废弃后，**同一个改动里**同步文档头部的状态与核对时间 |
| 单一权威 | 每类事实只有一个来源，其他位置写摘要 + 链接 |

### 文档分层

```
README.md              项目做什么、怎么用
AGENTS.md              长期规则（读取纪律、写入纪律、红线）
NOW.md                 当前状态与断点（会频繁变）
docs/context/*.md      领域权威（架构、路由、决策、风险…）
docs/context/specs/    业务规则（按领域分 7 篇，单篇 ≤25 KB）
docs/context/technical/ 深层专题
docs/history/dev-logs/  过程归档（不改写）
```

---

## 九、接手时的三条建议

**① 先跑一次 `npm run verify`**
它包含构建，能在不动代码的前提下暴露环境问题（缺依赖、字体未子集化、产物不一致）。

**② 看 `NOW.md` 的「已知未修问题」，别急着修**
有些是刻意留着的历史包袱，动之前先看 `RISKS.md` 里有没有对应记录。

**③ 动数据前先确认源在不在**
`public/data/parsed/` 是**产物**。要改数据，改 `scripts/parse/` 后重跑 `npm run data:build`，别手改 JSON —— 下次构建会被覆盖。

---

## 十、当前遗留（2026-11-09）

以下问题**已确认存在但没有解决**，接手时不必重新排查：

### 1. 部分国内用户打不开站点（`ERR_CONNECTION_RESET`）

| 项 | 内容 |
| --- | --- |
| 现象 | 特定网络下浏览器报「无法访问此网站，连接已重置」 |
| 已排除 | 站点资源、证书链、DNS 解析、TLS 版本（TLS1.2/1.3 均正常） |
| 根因 | EdgeOne 站点为 `overseas` + `plan-free`，国内用户跨境回源美国（MIA/IAD），HTML 因 `no-cache` **每次必回源** |
| 为何修不了 | 大陆加速需 ICP 备案；备案需国内服务器；2 核 2G 带宽仅撑约 1 并发，性价比极低 |
| 临时对策 | 打不开的用户改走 `https://syzg.pages.dev`（内容与主域名 ETag 一致，但 Cloudflare 直连、较慢） |

相关证据与回滚方式见 [六、EdgeOne 排障](#edgeone-排障2026-11-06-实测)。

### 2. `www.syzgwiki.top` 无 DNS 记录

主域有解析、`www` 没有。带 `www` 访问会直接失败。
**未修复**：需在 DNSPod 添加 `www` CNAME → `syzgwiki.top.eo.dnse3.com`。

### 3. 首屏 743 KB（弱网白屏 60 秒）

| 项 | 数据 |
| --- | --- |
| 首屏传输 | 743 KB（20+ 文件，gzip 后） |
| 2G 弱网 | 实测 **60 秒**才渲染完成，前 24 秒 `#app` 完全为空 |
| 最大浪费 | `assets/env-*.js` **111 KB**，其中约 70 KB 是 **3176 个图片文件名**（`IMAGE_VERSIONS`），首屏只用得上几张 |
| 可优化 | 把 `IMAGE_VERSIONS` 从首屏剥离，预计省 70 KB（约 9%） |
| 未做原因 | 收益有限（不解决「打不开」），且改动涉及图片版本校验逻辑，有风险 |

### 4. 首页角色数据仍走 1.9 MB 的完整文件

已拆出 `parsed/hero-summary.json`（3.5 KB，含全部 34 个角色的 7 个字段），首页已改读它。
**但** `heroes.json` 仍被 `/heroes`、`/sims`、`/gacha` 全量加载（1959 KB），这三个页面的首屏体积未优化。

### 5. `backups/` 未纳入 `.gitignore`

两个 5 MB 的 SQL 备份是未跟踪状态，`git add .` 会误提交。建议加进 `.gitignore`。

---

## 十一、本次（2026-11-05 ~ 11-09）做了什么

只列结论，过程见 [2026-11-06 日志](../history/dev-logs/2026-11/2026-11-06.md)。

| 类别 | 内容 |
| --- | --- |
| 新功能 | 手机端导航默认改底部；首页各段加载态；路由切换加载态 |
| 数据 | 生产库补齐首页 4 张配置表；公告 id 重排连续；本地库对齐生产 |
| 性能 | 首页配置加会话缓存；角色区改读 `hero-summary.json`（1959 KB → 3.5 KB） |
| 修复 | 切页滚动条跳动、后台加载态串场、任务图鉴标签、培育室「金币」应为「氪金」 |
| 运维 | EdgeOne 排障（最终回滚，无改动落地） |
