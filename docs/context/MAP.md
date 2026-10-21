# MAP —— 目录、资源、配置与部署位置

> 定位修改对象或运行环境时读本文件。只保存**有效映射**，不堆叠安装与发布流水账。
> 机制说明见 [ARCHITECTURE.md](./ARCHITECTURE.md)，操作步骤见 [RUNBOOK.md](RUNBOOK.md)。
>
> **何时读**：定位"要改的东西在哪"或确认运行环境时。
> **何时更新**：映射变化时（新增源目录、改部署位置、加构建脚本）。**不虚构环境**；不确定标注「待核实」。

**核对时间**：2026-10-19

---

## 一、外部源资源位置（构建前置，**不入库**）

统一入口：**`E:\Desktop\html\myrzg\游戏数据\`**（结构见该目录 [README](../../../游戏数据/README.md)）。
`scripts/dev/maintenance-paths.mjs` 是路径的唯一定义处，下表的"常量"列即该文件的导出名。

| 类型 | 常量 | 现行路径 | 用途 |
| --- | --- | --- | --- |
| 完整游戏配置 | `configRoot` | `游戏数据\配置表\`（143 张） | 构建输入原表 |
| 剧情文本 | `dialogRoot` | `游戏数据\剧情\`（3221 份） | 对话与剧情原表 |
| 游戏源码 | `gameSourceRoot` | `游戏数据\源码\`（4907 个 .cs） | 核对战斗公式与客户端逻辑 |
| UI 图集切图 | `atlasRoot` | `游戏数据\图片资源\图集\`（59 图集） | 面板与图标 |
| 完整资源包 | `bundleRoot` | `游戏数据\资源包\`（真实目录，原 `4.24路资源包` 已迁入） | 立绘/模型/音效/特效 |
| APK 解包 | — | `游戏数据\APK解包\`（真实目录，原 `game.taptap.tqpmyrzg` 已迁入） | AssetBundle 原包与热更 DLL |
| 原图备份 | `imageBackupRoot` | `vue-myrzg备份-资源\images\` | 压缩/替换前的绝对备份源 |
| 旧目录归档 | — | `游戏数据\_迁入归档\`（409 文件 / 99 MB） | 删旧目录前的独有内容留存 |

**环境变量覆盖**：`MYRZG_DATA_DIR` / `MYRZG_CONFIG_DIR` / `MYRZG_DIALOG_DIR` / `MYRZG_SOURCE_DIR` /
`MYRZG_ATLAS_DIR` / `MYRZG_BUNDLE_DIR`。优先级：**环境变量 > `游戏数据/` 子目录**。

> 🔴 **2026-10-20 起不再回退到项目同级旧目录**：`Config_decrypted` / `GAoNano_decrypted` /
> `UI_Atlases` / `4.24包` 已全部删除（独有内容先归档），脚本不再有第二候选路径。
>
> 2026-10-19 结构收敛：移除 `资源包-4.24包` 与 `UI图集源` 两个冗余链接；
> `资源包` / `APK解包` 由 junction 改为**真实目录**。

> 🔴 **严禁读取**：`E:\Desktop\html\myrzg\令牌agent勿看\`、`_ai-credentials\` —— 真实凭据，任何情况下不读取、不列举。

---

## 二、仓库内目录职责

```
vue-myrzg/
├── src/
│   ├── views/                 23 个路由组件（每个图鉴一页）
│   ├── components/ui/         28 个公共组件（27 个经 index.js 统一出口；UiVirtualGrid 按需文件导入）
│   ├── components/            业务组件（gacha/ chapters/ dungeons/ facilities/ heroes/ mascot/ admin/）
│   ├── utils/                 业务工具（纯逻辑，禁止 import 组件）
│   ├── composables/app/       应用壳职责（搜索、原生生命周期、备份）
│   ├── config/                blacklist、emoticons、discussions、auth、combatRules
│   ├── stores/                Pinia（appState）
│   ├── router/index.js        路由表 + 分包预取
│   └── assets/                theme.css（设计系统）、gacha.css（招募皮肤）
├── scripts/
│   ├── parse/                 30 个数据预处理脚本，入口 index.mjs
│   └── dev/                   维护脚本、原表同步、验收
├── functions/api/[[path]].js  评论 + 账号后端（单文件）
├── public/
│   ├── data/parsed/           37 个运行时产物（入库）
│   ├── data/{dialogs,taskDialogs}/  剧情（按需加载）
│   ├── images/  ui/  fonts/   图片、UI 图标、子集字体
│   ├── update/hotupdate.json  热更清单
│   └── _headers  _redirects   缓存/安全响应头、SPA 兜底
├── raw/                       144 个完整原表（根层；含 hero/pet/equip/task 别名子目录共 164 个，**不入库**）
├── tests/                     单元 / 端到端 / 迁移演练 / 真机
└── docs/                      文档（两分法，见下）
```

### `docs/` 的两分法

**规则一句话：`context/` = 现在该看的，`history/` = 追溯才看的。**

```
docs/
├── context/                   当前有效的规范与契约
│   ├── AGENTS 之外的七件套      NOW / MAP / RUNBOOK / DECISIONS / RISKS / ARCHITECTURE / DOMAIN
│   ├── CONTRIBUTING.md         提交规范
│   ├── UI_COMPONENT_LIBRARY.md 组件库完整 API
│   ├── specs/                  7 个领域规范（物品装备 / 角色战斗 / 副本关卡 / 任务事件 / 营地生活 / 招募 / UI）
│   │                           每个域文件末尾带「深入规则」小节，承接原 features/ 的内容
│   └── technical/              7 个跨功能专题（接口契约、公式、离线工具）
└── history/                   历史归档，**不是当前规范**
    ├── README.md               主题索引 + 按日期浏览 + 专项归档索引
    ├── MIGRATION.md / DELIVERY.md  2026-10-07 文档重构的过程记录
    ├── freight-cart-{recon,handoff}.md  贸易小车复刻依据（未实装）
    ├── rename-myrzg-to-syzg.md 改名迁移全过程
    └── dev-logs/               23 个日报（按 YYYY-MM/ 组织）+ 日志规范 README
```

根目录另有 `AGENTS.md` / `PROJECT_INDEX.md` / `README.md` 三个入口。

---

## 三、数据流转映射

```
[外部源: 游戏数据/配置表 与 游戏数据/剧情]
        │  node scripts/dev/sync-raw.mjs --apply
        ▼
    [raw/]  完整原表（不入库，144 个文件）
        │  npm run data:build  →  scripts/parse/index.mjs
        ▼
[public/data/parsed/]  运行时产物（入库，37 个文件）
        │  npm run search:update
        ▼
[search-index.json / item-sources.json]
        │  Vite 打包 / CDN 分发
        ▼
   [前端页面 / Capacitor App]
```

**构建顺序约束**：`items` 必须先构建，其他解析模块依赖 `itemData`。

| 输入原表 | 处理脚本 | 输出产物 | 消费者 |
| --- | --- | --- | --- |
| `item.json`、`equipDec/equipSuit/equipGroup/equipLevel` | `items.mjs` | `items.json` | 物品、装备图鉴 |
| `equipEnchant.json`、`itemExchange.json`、`fushi_itemExchangeMapping.json` | `runes.mjs` | `runes.json` | 符石图鉴 |
| `hero.json`、`skin.json`、`heroMail/heroArchives/heroTalk` | `heroes.mjs` | `heroes.json` | 角色图鉴、伙伴邮件 |
| `pet.json`、`petSetting/petLevel/petPool` | `pets.mjs` | `pets.json` | 魔物图鉴 |
| `mon.json`、`monLevelStrength.json` | `monsters.mjs` | `monsters.json`、`monLevelStrength.json` | 怪物图鉴 |
| `homeItem/homeLevel/roomBuild`、`campResearch` | `facilities.mjs` | `facilities.json` | 设施、营地 |
| `homeItem.json` | `furniture.mjs` | `furniture.json` | 家具图鉴 |
| `menu.json`、`buff.json` | `recipes.mjs` | `recipes.json` | 菜谱查询 |
| `chapterInfo.json`、`area.json`、`levelStage.json` | `chapters.mjs` | `chapters.json`、`stages/*.json` | 关卡图鉴 |
| `instance.json`、`battle.json`、`room.json` | `dungeons.mjs` | `dungeons.json`、`dungeons/*.json` | 副本图鉴 |
| `buff.json`、`skill.json`、`heroSkillUpgrade.json` | `glossary.mjs` | `glossary.json` | 词条 |
| `heroPool/petPool`、`reward.json` | `gacha.mjs` | `gacha.json`、`gacha-presentation.json` | 模拟招募 |
| 全量产物 | `search.mjs` | `search-index.json`、`item-sources.json` | 全局搜索、来源反查 |

---

## 四、部署位置与版本关系

### 4.1 拓扑（两层：EdgeOne 加速 → Cloudflare 源站）

```
用户（大陆为主）
  │  DNSPod: syzgwiki.top CNAME → syzgwiki.top.eo.dnse3.com
  ▼
腾讯云 EdgeOne 边缘节点（大陆加速层，回源 syzg.pages.dev）
  │  证书：eofreecert（TrustAsia，至 2027-01-17）
  ▼
Cloudflare Pages 项目 syzg（静态产物 + Pages Functions）
  ▼
Cloudflare D1  库名 myrzg-comments  id 5f0d4c37-107f-4811-bc5e-768f73c51a3a
```

> **两层都要保留，不是二选一**。Cloudflare 面板里的「自定义域」是**源站绑定** ——
> 告诉 CF 这个 Host 交给哪个 Pages 项目处理，EdgeOne 回源时按它分发；
> 而用户实际访问时，DNSPod 把域名指到 EdgeOne，**不经过 CF 的 DNS**。
>
> 判据（2026-10-21 实测响应头）：同时存在 `EO-LOG-UUID` / `EO-Cache-Status`（EdgeOne）
> 与 `CF-RAY` / `Server: cloudflare`（Cloudflare）。只看到其中一组，说明链路少了一环。
>
> ⚠️ **不记录延迟数字**：本机出口在美国，测出的延迟不代表大陆用户。评估大陆速度须从大陆网络发起。

### 4.2 域名与项目名对照

| | 现在 | 历史（保留作退路） |
| --- | --- | --- |
| 主域名 | `syzgwiki.top` | `syzg.yxzmy.top`、`myrzg.yxzmy.top` |
| GitHub 仓库 | `Drloudx/syzg` | `Drloudx/myrzg`（未删） |
| Pages 项目 | `syzg` → `syzg.pages.dev` | `myrzg` → `myrzg.pages.dev` |
| 前端基址 | `CLOUD_URL = https://syzgwiki.top` | — |
| D1 数据库 | `myrzg-comments`（**名字未改**，两项目共用） | — |
| 发信域名 | `mail.yxzmy.top`（腾讯云 SES，**未随站点迁移**） | — |

**三处不能改**：本地目录 `vue-myrzg`、`wrangler.toml` 的 `name`/`database_name`、Android 包名 `com.myrzg.assistant`。理由见 [AGENTS.md](../../AGENTS.md) 第四节。

> **发信域名独立于站点域名**：`noreply@mail.yxzmy.top` 是腾讯云 SES 的**已验证发信域**
> （四项 DNS 验证 + 模板 `TemplateID = 62671` 均通过）。迁站点域名时**不要动它** ——
> 换发信域要重走验证并重新审核模板，与站点迁移是两件事。

### 4.3 版本关系

- 代码、数据清单与资源版本**必须来自同一次构建**。
- 数据清单按目录分组生成 hash，位于 `dist/assets/data-manifests/`；首屏那组（`data/parsed/`）的哈希**内联进 bundle**。
- 热更以 `CapacitorUpdater.current()` 的**实际运行 bundle** 为准；`local_web_version` 只用于兼容显示。
- `package.json` 的 `version` 为 `1.0.0`；依赖版本以 `package.json` 为准，文档不复制。

### 4.4 缓存位置

| 路径 | 源站 `_headers` | EdgeOne |
| --- | --- | --- |
| `/api/*` | `no-store` | 不缓存 |
| `/`、`/index.html` | `no-cache` | — |
| `/assets/*`、`/data/parsed/**` | `immutable, max-age=31536000` | — |
| `/fonts/*` | 1 年 + `?v=` 内容哈希 | 实测 604800 |
| 图片 `jpg/png/gif/bmp/webp` | 7 天 | 浏览器缓存 7 天 |
| `svg` | — | 单独 1 小时 |

> 外层 EdgeOne 策略**优先于** `public/_headers`。核对用 `npm run cdn:check`。

---

## 五、配置位置

| 配置 | 位置 | 说明 |
| --- | --- | --- |
| 构建 | `vite.config.js` | 含 `fontUrlVersionPlugin`、`INLINE_HASH_DIRECTORIES` |
| 原生壳 | `capacitor.config.json` | `appId` **不可改** |
| D1 表结构 | `schema.sql` | 迁移脚本在 `scripts/sql/` |
| 本地环境变量 | `.dev.vars`（gitignored） | `IP_HASH_SALT`、限流阈值等（`ADMIN_TOKEN` 已于 2026-10-07 废弃） |
| 线上环境变量 | Cloudflare Pages 控制台 | `AUTH_PEPPER`、`SALT_SECRET`、`TENCENT_SECRET_*` |
| 前端基址注入 | `VITE_CLOUD_URL` 环境变量 | 见 `src/utils/env.js` 的 `DEFAULT_CLOUD_URL` + `injectedCloudUrl()` |
| 响应头 | `public/_headers` | CSP、HSTS、缓存 |
| SPA 兜底 | `public/_redirects` | `/* /index.html 200` |
| 测试 | `playwright.config.js` | `workers: 2` **不可改** |
| 认证协议常量 | `src/config/auth.js` | `PBKDF2_ITERS = 600000`（前后端共享唯一定义处） |

---

## 六、本文件的维护

- 只在**映射实际变化**时更新（新增源目录、改部署位置、加构建脚本）。
- **不写**安装步骤、发布流水账、逐次版本历史 —— 那些进 [RUNBOOK.md](RUNBOOK.md) 与 [开发日志](../history/dev-logs)。
- 环境事实不确定时标注「待核实」，不虚构。
