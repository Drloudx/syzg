# DATA_SOURCES —— 数据源提示词（可直接粘贴给 AI）

> **本文件是"给 AI 的取数说明"的权威版本。** 内容改这里，别处只留链接。
> 路径定义在 `scripts/dev/maintenance-paths.mjs`，本文件不重复实现。
>
> **何时读**：新会话接手、需要让 AI 知道去哪取数时。
> **何时更新**：数据源目录增删、口径变化（哪版是顶层）时。
> 核对时间：2026-11-02

---

## 一、提示词原文（复制这段给 AI）

```text
项目在 E:\Desktop\html\myrzg\vue-myrzg。第一步 cd 进去，不要留在父目录 ——
AGENTS.md 靠「从 cwd 向上找 .git」注入，.git 在 vue-myrzg/，留在 myrzg/ 会让规则文档不在首轮链上。

读取纪律（硬性，别通读 docs/）：
docs/ 实测 80 个文件 / 1.80 MB，dev-logs 单独就 928 KB。按此顺序定位，命中即停：
1. PROJECT_INDEX.md（5 KB，任务→文档路由表）
2. docs/context/NOW.md（21 KB，当前状态/断点/未修问题）
3. 当前任务相关的那一份：跑起来→RUNBOOK｜领域规则→docs/context/specs/ 选 1 个｜
   跨域契约→DOMAIN.md｜为什么这么设计→DECISIONS.md｜风险→RISKS.md
定位到文件后继续定位章节/函数/配置键，用 grep 找行号再 read 带 offset/limit。
禁止从单文件顺序分段读到尾（那是变相通读）。
默认不读：docs/history/dev-logs/**（928 KB 归档）、technical/ACCOUNT_SYSTEM.md 全文（103 KB）、
backups/**、raw/** 直读、public/data/parsed/**、node_modules/**、dist/**。
严禁读取同级 E:\Desktop\html\myrzg\令牌agent勿看\ 与 _ai-credentials\（真实凭据，不读不列举不引用）。

数据源：唯一入口是 E:\Desktop\html\myrzg\游戏数据，路径由
scripts/dev/maintenance-paths.mjs 定义（6 常量 + 6 环境变量），脚本自动找，禁止手动拼路径。
写任何取数脚本时先 import 这个模块拿常量，不要硬编码目录。

  配置表      configRoot       = 游戏数据/配置表        顶层 = APK 首包版
  剧情文本    dialogRoot       = 游戏数据/剧情          顶层 = APK 版 + CDN 独有
  游戏源码    gameSourceRoot   = 游戏数据/源码          判定游戏行为的唯一依据
  UI 图集切图 atlasRoot        = 游戏数据/图片资源/图集  59 图集，扁平切图 + _atlas.json + _atlas.png
  散图        —               游戏数据/图片资源/单图    6 大类 texture/chara/prefab/spine/atlas/...
  完整资源包  bundleRoot       = 游戏数据/资源包        立绘/模型/音效，assets/res/texture/...

数量以脚本实测为准，不要相信口述的数字（会漂）。2026-11-02 实测：
配置表 144 张业务表｜剧情顶层 3224 个 json｜源码 4907 个 .cs / 7 程序集｜
图集 59 目录 4010 文件（3892 切图 + 59 _atlas.png + 59 _atlas.json）｜资源包 44970 文件。
先跑一遍计数确认现状，再开始干活。

口径纪律（违反会静默改产物，不报错）：
- 配置表/剧情的顶层是 APK 版；CDN 较新版在 _CDN新版/（配置表 29 张、剧情 4 份），不参与构建。
- 游戏行为判据只认 gameSourceRoot 的 .cs，不认文档、截图、相邻 ID、同名物品。
- 构建只读 vue-myrzg/raw/，不直读 配置表/。数据流：
  配置表/ →（sync-raw.mjs --apply）→ raw/ →（npm run data:build）→ public/data/parsed/
- 数量相等 ≠ 内容相等；图片比对看像素，不看哈希（同图不同字节很常见）。

三个已知与文档不一致的点，遇到先按实测处理：
- ../Config_decrypted 仍是一个 junction 指向 游戏数据/配置表。文档写「已删除」，脚本也确实不再回退它，
  但按文件名找人会误以为有两套数据 —— 它不是第二份数据。
- ../源码 是子集：其 源码/ 只有 2354 个 .cs，全部能在 游戏数据/源码（4907）按文件名命中。
  不要拿它当判据，也不要以为 4907 里有 2553 个是新增。
- 剧情顶层 3224 个 json 中 143 份是「备份/弃用/复制用空剧本」类非正式副本，净 3081；
  配置表 144 vs 文档 143 的差额是 equipQualityUpgrade.json，而 raw/ 侧同名文件被改名为
  应该没用equipQualityUpgrade.json —— 构建读 raw/，所以这张表不参与产物。

动手前：
- 先 git status。工作区常驻他人未提交改动（2026-11-02 实测 47 项），不在本次范围的文件不 stage、不提交、不改动。
- git push 即上线（Cloudflare Pages 自动部署），本地提交与推送分别判授权。
- 红线（AGENTS.md §四）：不改 CLOUD_URL／不改 Android 包名 com.myrzg.assistant 与目录名 vue-myrzg／
  不删 mail.yxzmy.top 的 DNS／不对生产库跑破坏性 SQL／迁移永远先执行后推送／
  AUTH_PEPPER 与 SALT_SECRET 上线后不可改／mon.json·battle.json·room.json 不写回裁剪版。
- 禁止擅自跑 git clean / reset --hard / checkout -- <file> / restore（会丢他人成果）。

收尾：只检查本次改动及直接关联，不做全项目审计。报告写「新建/修改/沿用的文件、检查结果、待核实项」。
```

---

## 二、为什么要这么写（给维护者）

| 写法 | 原因 |
| --- | --- |
| 点名 `maintenance-paths.mjs` | 路径有 6 个常量 + 6 个环境变量，硬编码会随结构变化失效 |
| 强调"顶层 = APK 版" | 混放 CDN 版会让 `data:build` 静默产出不同结果（`room.json` 少 1 键、`buff.json` 多 98 条） |
| 强调"源码是唯一判据" | 配置数据、旧文档、截图、同名物品都可能与实际字段不符 |
| 强调"逐文件比对" | 目录数与文件数都能对上而内容不同（图集 61 vs 59 就是这种情况） |
| 保留"不要通读 docs/" | `docs/` 实测 80 文件 / 1.80 MB（dev-logs 占 928 KB），全量读会耗尽上下文 |
| 写"数量以实测为准" | 目录数会随同步漂移（配置表 143→144、图集 4257→4010 都发生过），写死数字必然过期 |
| 列"三处文档与实际不一致" | 这三处会让接手者白跑（去错目录、误判新增文件、把副本当正本） |

---

## 三、数据源一览（与 MAP.md §一 同源，此处只列取数口径）

| 数据 | 路径（相对 `游戏数据/`） | 数量（2026-11-02 实测） | 顶层口径 |
| --- | --- | --- | --- |
| 配置表 | `配置表/` | 144 张业务表（含 4 张 `*Bak` / `summary`） | APK 首包版 |
| 配置表 CDN 版 | `配置表/_CDN新版/` | 29 张 | 较新，不参与构建 |
| 剧情 | `剧情/` | 顶层 3224 个 json；净 3081（扣 143 份备份/弃用副本） | APK 版 + CDN 独有 |
| 剧情 CDN 版 | `剧情/_CDN新版/` | 4 份 | 较新，不参与构建 |
| 游戏源码 | `源码/` | 7 程序集 / 4907 .cs | 2026-09-29 反编译版 |
| UI 图集切图 | `图片资源/图集/` | 59 图集 / 4010 文件（3892 切图 + 59 `_atlas.png` + 59 `_atlas.json`） | NGUI `mSprites` 矩形切图 |
| 散图 | `图片资源/单图/` | 8908 张 / 6 大类 | 解包后重新编码 |
| 完整资源包 | `资源包/`（真实目录） | 44970 文件 | 官方资源包原样 |
| APK 解包 | `APK解包/`（真实目录） | 26153 文件 | APK 原样 |

> 旧的同级目录 `Config_decrypted` 仍是**指向 `配置表/` 的 junction**，`GAoNano_decrypted` / `UI_Atlases` / `4.24路资源包` 已不存在。
> 脚本不做旧路径回退（`maintenance-paths.mjs` 的 `pick()`），但按文件名检索会误命中 `Config_decrypted`。

---

## 四、常见误判（核对时容易踩）

| 现象 | 不是问题 | 判据 |
| --- | --- | --- |
| 图集 61 个目录 vs 59 个 | 源侧 `heroicon_Atlas` / `AAA1` 是重复整图堆放目录 | 逐像素比对 |
| 旧 `AAA1/` 49 张整图与 `_atlas.png` 哈希不同 | PNG 编码不同，**像素完全一致（最大差 0）** | 必须做像素比对，哈希会误判 |
| 旧 `heroicon_Atlas` 189 个精灵 | **全部少 2 像素高**，是切坏的旧产物；`图集/HeadIconAtals` 才是正确的 | 按矩形从整图重切比对 |
| `图片资源/单图` 与 `资源包` 哈希 0% 吻合 | 单图是解包后重新编码（体积更小），语义同源但字节不同 | 比对尺寸与内容，不比字节 |
| `EmailPanel_Atlas` 28 文件 vs 15 张 | 差的 13 个是整图 `.png` 与 `_atlas.json` | 比对精灵名 |
| 剧情登记 3481 条 vs 实际 3221 份 | 260 份官方从未发布 | 登记表不是文件清单 |
| `check-task-data.mjs` 报"缺失 82" | 未发布那部分的子集，换数据源前后一致 | `git stash` 复跑对比 |
| 源码 468 个 `.cs` 内容不同 | 两次反编译（ilspycmd 版本/参数）的等价产出 | 语义比对，不比字节 |
| 业务表 144 张 vs 文档 143 张 | 多出的是 `equipQualityUpgrade.json`；`raw/` 侧同名文件叫 `应该没用equipQualityUpgrade.json` | 构建读 `raw/`，该表不参与产物 |
| 剧情顶层 3224 个 json vs 净 3081 份 | 143 份文件名带「备份 / 弃用 / 复制用空剧本」后缀，是副本 | 按文件名过滤这三类，不是数据缺口 |
| `../源码` 只有 2354 个 `.cs` | 它是 `游戏数据/源码`（4907）的子集，2354/2354 按文件名可命中 | 判据取 `gameSourceRoot`，不是同级目录 |
