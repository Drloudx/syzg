# START_PROMPT —— 新会话开场提示词（可直接粘贴）

> **状态**：现行。本文是**新会话第一条消息**的权威文本，整段复制粘贴。
> **设计约束**：只收录**不随进度变化**的内容。数量、断点、待办、已修未修一律不写进正文 ——
> 那些随工作推进必然变化，写进来就得每轮回来改，提示词会变成负担。
> **何时读**：每次开新会话、换工具或换模型接手时。
> **何时更新**：仅在**结构**变化时（数据源入口改位置、数据流改道、红线增删、目录改名）。
> 日常进展**不改本文**，写 [NOW.md](NOW.md) 与当日[开发日志](../history/dev-logs/)。
> **核对时间**：2026-11-05

---

## 一、粘贴区（整段复制，含首行）

```text
项目在 E:\Desktop\html\myrzg\vue-myrzg。第一步 cd 进去，不要留在父目录 ——
AGENTS.md 靠「从 cwd 向上找 .git」注入，.git 在 vue-myrzg/，留在 myrzg/ 会让规则文档不在首轮链上。

本提示词只放不随进度变化的内容。任何会随工作推进而变的事实（数量、断点、待办、已修/未修），
一律以当场实测与 docs/context/NOW.md 为准 —— 不写在这里，也不需要回来改这里。

■ 一、开工三步（顺序固定）
1. git status —— 工作区常驻他人未提交改动，先看清哪些不是自己的。
2. node scripts/dev/count-data-sources.mjs —— 取数据源现状。
   所有数量以它为准；不要相信任何口述或文档里的数字，包括本提示词曾经写过的。
3. 按任务查 PROJECT_INDEX.md 定位文档，命中即停。

■ 二、读取纪律（硬性，别通读 docs/）
按此顺序定位，命中即停：
1. PROJECT_INDEX.md —— 任务→文档路由表
2. docs/context/NOW.md —— 当前状态 / 断点 / 未修问题
3. 当前任务相关的那一份：跑起来→RUNBOOK｜领域规则→docs/context/specs/ 选 1 个｜
   跨域契约→DOMAIN.md｜为什么这么设计→DECISIONS.md｜风险→RISKS.md
定位到文件后继续定位章节 / 函数 / 配置键：grep 找行号，再 read 带 offset/limit。
禁止从单文件顺序分段读到尾（那是变相通读）。
默认不读：docs/history/dev-logs/**（归档，只按关键词搜命中段）、technical/ACCOUNT_SYSTEM.md 全文、
backups/**、raw/** 直读、public/data/parsed/**、node_modules/**、dist/**。
严禁读取同级 E:\Desktop\html\myrzg\令牌agent勿看\ 与 _ai-credentials\（真实凭据，不读不列举不引用）。

■ 三、数据源
唯一入口是 E:\Desktop\html\myrzg\游戏数据。
所有路径由 scripts/dev/maintenance-paths.mjs 定义（常量 + MYRZG_* 环境变量覆盖）。
写任何取数脚本先 import 该模块拿常量，禁止手动拼路径、禁止写死目录名。
「有哪些数据源、各自在哪」以该模块为唯一权威，本提示词不另列清单，避免与代码脱节。
同级目录若出现 Config_decrypted、源码 之类疑似副本，先判断是 junction 还是子集，
不要当成第二份数据源；判据仍以该模块为准。

■ 四、口径纪律（违反会静默改产物，不报错）
- 配置表 / 剧情的顶层是 APK 版；带 _ 前缀的目录是新版暂存，不参与构建。
- 游戏行为判据只认 gameSourceRoot 的 .cs，不认文档、截图、相邻 ID、同名物品。
- 构建只读 vue-myrzg/raw/，不直读 配置表/。数据流：
  配置表/ →（sync-raw.mjs --apply）→ raw/ →（npm run data:build）→ public/data/parsed/
- raw/ 里有一部分是派生表或产物基线，不由配置表同步。发现「配置表有、raw 没有」
  先查 scripts/dev/raw-sync.mjs 的派生 / 跳过清单，再判断是不是缺陷。
- 数量相等 ≠ 内容相等；图片比对看像素，不看哈希（同图不同字节很常见）。
- 计数别用文件名后缀一刀切：不同目录会有名字撞尾的切图，先看清归属再数。
- 文档与实测冲突时按实测。纠正写进对应的权威文档（NOW / RISKS / specs），
  不要改写本提示词来「记住」某个临时差异。

■ 五、动手前
- 只改本次任务范围；不在范围内的文件不 stage、不提交、不改动。
- git push 即上线（Cloudflare Pages 自动部署）。本地提交与推送分别判授权。
- 红线（AGENTS.md §四）：
  不改 CLOUD_URL／不改 Android 包名 com.myrzg.assistant 与目录名 vue-myrzg／
  不删 mail.yxzmy.top 的 DNS／不对生产库跑破坏性 SQL／迁移永远先执行后推送／
  AUTH_PEPPER 与 SALT_SECRET 上线后不可改／mon.json·battle.json·room.json 不写回裁剪版。
- 禁止擅自跑 git clean / reset --hard / checkout -- <file> / restore（会丢他人成果）。

■ 六、收尾
只检查本次改动及直接关联，不做全项目审计。
报告写「新建 / 修改 / 沿用的文件、检查结果、待核实项」。
```

---

## 二、为什么这版不用回来改

| 会漂的东西 | 放在哪 | 提示词怎么写 |
| --- | --- | --- |
| 各数据源文件数、表数、体积 | `count-data-sources.mjs` 实测 | 只写「跑它」，不写数字 |
| 当前状态、未推送笔数、未修问题 | [NOW.md](NOW.md) | 只写「读它」 |
| 某一时刻的文档与实测差异 | [RISKS.md](RISKS.md) / 当日日志 | 只写「冲突按实测，纠正写进权威文档」 |
| 任务类型 → 该读哪篇 | [PROJECT_INDEX.md](../../PROJECT_INDEX.md) | 只写「查它」 |
| 长期规则、授权、红线 | [AGENTS.md](../../AGENTS.md)（自动注入） | 只引用 §四，不复制正文 |

判据：一段文字若会在「做完一批活」之后失效，就不属于提示词。

---

## 三、与本仓其他文档的分工

| 文档 | 负责什么 | 与本文的关系 |
| --- | --- | --- |
| [AGENTS.md](../../AGENTS.md) | 长期规则权威：读取、写入、授权、红线 | harness 自动注入，本文只引用 §四 |
| [HANDOVER.md](HANDOVER.md) | 「这是什么、从哪看起」 | 第一次接手读它，不是开场必读 |
| [DATA_SOURCES.md](DATA_SOURCES.md) | 数据源取数提示词 | 本文第三节是其摘要，冲突以它为准 |
| [NOW.md](NOW.md) | 当前状态 / 断点 / 未修问题 | 本文**不写状态** |
| [PROJECT_INDEX.md](../../PROJECT_INDEX.md) | 任务 → 文档路由 | 本文开工第 3 步就是它 |

**本文只解决一件事**：新会话第一条消息发什么。

---

## 四、取值基线（只在需要时查，不写进提示词）

刷新用只读脚本，路径全部来自 `maintenance-paths.mjs`：

```powershell
# 在 vue-myrzg/ 下执行
node scripts/dev/count-data-sources.mjs          # 人读
node scripts/dev/count-data-sources.mjs --json   # 机读
```

脚本 [count-data-sources.mjs](../../scripts/dev/count-data-sources.mjs) 覆盖：配置表（顶层 / 业务表 / 元数据 / 新版暂存目录）、剧情（顶层 / 非正式副本 / 净数）、源码、图集（目录 / 切图 / 主图 / 清单 / 异常）、资源包、raw、`public/data`。

图集主图按 `<图集名>_atlas.png` 或 `_atlas.png` **精确匹配**，不用 `endsWith('_atlas.png')` —— 否则名字撞尾的切图会被误计成主图，同时又被误排除出切图。

脚本输出的数字**不进本文正文**：它们属于「当场实测」，不属于「开场提示」。
