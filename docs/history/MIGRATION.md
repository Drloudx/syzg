# 迁移对照表 —— 旧文档 → 新结构

> 本文件说明**新文档体系如何映射到现有 `docs/`**，供最终替换时对照。
> 替换动作**已于 2026-10-07 执行完成**：旧文档已废弃并备份到 `backups/docs-before-restructure-20261007-141516/`。
>
> **核对时间**：2026-10-07

---

## 一、总览

| | 旧结构 | 新结构 |
| --- | --- | --- |
| 文件数 | 9 个顶层 + 13 个专题 + 27 个日志 = **49** | 3 个根 + 8 个 context + 7 个领域 + 专题 + 日志 |
| 顶层规范 | 307 KB | 约 188 KB（业务契约分层后） |
| 入口 | 无 AGENTS.md | **AGENTS.md**（自动加载） |
| 定位方式 | 靠人猜该读哪篇 | **PROJECT_INDEX.md** 任务路由（3.9 KB） |
| 状态源 | HANDOFF §〇（60.9 KB 文件里的一个章节） | **NOW.md**（独立、5.9 KB） |
| 位置映射 | 散在 HANDOFF_FULL / ARCHITECTURE / SPEC | **MAP.md**（独立、8.1 KB） |
| 业务契约 | 混在 SPEC.md 里（91.5 KB，一个文件五种职责） | **DOMAIN.md**（共享层 13.5 KB）+ **specs/**（7 个领域，61.4 KB） |

---

## 二、逐文件映射

| 旧文件 | 体积 | 新归属 | 说明 |
| --- | --- | --- | --- |
| （无） | — | **[AGENTS.md](../../AGENTS.md)** | **新建**。长期规则：读取/写入纪律、授权分级、红线、本机坑 |
| （无） | — | **[PROJECT_INDEX.md](../../PROJECT_INDEX.md)** | **新建**。任务 → 权威章节路由 |
| `README.md` | 4.2 KB | **[README.md](../../README.md)** | 改写。补文档入口表，指向 AGENTS/PROJECT_INDEX |
| `docs/README.md` | 4.2 KB | 并入 **PROJECT_INDEX.md** | 原文已是路由表，扩充为任务维度 |
| `docs/SPEC.md` §一/二/四 | ~40 KB | **[docs/context/DOMAIN.md](../context/DOMAIN.md)** | 共享约定层：领域索引、路由表、共享模块、奖励语义、URL |
| `docs/SPEC.md` §三 页面契约 | ~50 KB | **[docs/context/specs/](../context/specs/)**（7 个领域文件） | 按领域拆分，**判据一条不丢**（445 个标识符 0 缺失） |
| `docs/SPEC.md` §五 | ~7 KB | **[ARCHITECTURE.md](../context/ARCHITECTURE.md)** §4 | 数据链与来源边界属架构职责 |
| `docs/SPEC.md` §六 | ~5 KB | **ARCHITECTURE** §5.3–5.5 + **RUNBOOK** §4 | 资源维护拆分：机制进架构，操作进 Runbook |
| `docs/SPEC.md` §七 | ~4 KB | **AGENTS** §五 + **RUNBOOK** §4 | 验收表进 AGENTS，命令进 Runbook |
| `docs/ARCHITECTURE.md` | 31 KB | **[ARCHITECTURE.md](../context/ARCHITECTURE.md)** | 精简重排；删去与 SPEC 重复的页面描述 |
| `docs/HANDOFF.md` | 60.9 KB | **NOW.md** + **RUNBOOK.md** + **DECISIONS.md** | **拆分**：状态→NOW，命令→RUNBOOK，决策→DECISIONS |
| `docs/HANDOFF_FULL.md` | 24.8 KB | **MAP.md** + **RUNBOOK.md** §7 + **DECISIONS.md** §二 | 拓扑与位置映射→MAP；凭据/缓存→RUNBOOK；改名决策→DECISIONS |
| `docs/KNOWN_BUGS_AND_FIXES.md` | 34.4 KB | **[RISKS.md](../context/RISKS.md)** §二 | 压缩为「现象→根因→解法」表，**保留全部标识符** |
| `docs/rename-myrzg-to-syzg.md` | 16 KB | **[history/](README.md)** + **DECISIONS** §二 | 决策进 DECISIONS，过程归档 |
| `docs/context/UI_COMPONENT_LIBRARY.md` | 38.3 KB | **保持原位** | 已相当规范，职责单一，无需重写 |
| `docs/context/CONTRIBUTING.md` | 6.1 KB | **保持原位** | 提交规范，职责单一 |
| `docs/history/dev-logs/README.md` | 3.6 KB | **迁入 `docs/history/dev-logs/`** | 日志规范，原样迁入 |
| `docs/history/dev-logs/**`（25 个日报 + 2 份专项） | 626 KB | **迁入 `docs/history/dev-logs/`** | **归档原样迁入**（逐文件 SHA-256 一致）。见 [AGENTS.md](../../AGENTS.md) 第三节 |
| `docs/context/features/**`（6 个） | 51 KB | **保持原位** | 功能专题，职责清晰 |
| `docs/context/technical/**`（7 个） | 245 KB | **保持原位** | 跨功能接口与离线工具 |
| `backups/audits-archive/**` | — | **保持原位** | 归档，不动 |

> **为什么 dev-logs 保持 `docs/history/dev-logs/` 这个名字**：作者的通用方案把历史放在 `history/`，但同时写明「已有结构可使用等价文件或章节承载」「不强制改名」。本项目 626 KB 归档已在位、格式统一、内部 39 条链接全部有效，**改名只会让所有链接失效**。`docs/history/README.md` 承担索引职责（主题索引 + 按日期浏览）。

---

## 三、新增了什么（旧结构没有的）

| 新增 | 为什么必须新增 |
| --- | --- |
| **AGENTS.md** | 旧结构**没有任何自动加载的规则入口**。`docs/` 1.2 MB / 约 47 万 token，没有读取纪律时，接手者只能靠猜 |
| **PROJECT_INDEX.md** | 旧的 `docs/README.md` 只按"文档"组织，不按"任务"组织。改一个功能仍要读 3~4 篇才能确定看哪节 |
| **NOW.md** | 旧的状态源是 `HANDOFF.md` §〇 —— 60.9 KB 文件里的一个章节，且与 `HANDOFF_FULL.md` 互相勘误 |
| **MAP.md** | 位置映射散在 `HANDOFF_FULL.md`、`ARCHITECTURE.md`、`SPEC.md §六` 三处，且 `HANDOFF_FULL` 的拓扑描述已部分过期 |
| **DOMAIN.md + specs/** | 旧的业务契约混在 `SPEC.md` 里，与资源维护、验收、文档治理同处一个 91.5 KB 文件 |
| **specs/ 领域拆分** | 单文件 74.5 KB 仍偏重：即使有读取纪律，**物理边界比纪律可靠**。按领域拆成 7 个文件后，最大 19.8 KB |
| **DECISIONS.md** | 决策散在 `ACCOUNT_SYSTEM.md` §十四（100 KB 文件）、`rename` 文档、HANDOFF 里，无统一入口 |
| **RISKS.md** | 旧 `KNOWN_BUGS_AND_FIXES.md` 只有"故障"，没有"高风险操作授权"与"验证缺口" |

---

## 四、与通用 9 文件方案的差异

作者的通用方案列了 9 类文件。本项目**全部具备**，差异只有三处：

| 通用方案 | 本方案 | 理由 |
| --- | --- | --- |
| `history/` 新建目录 | 沿用 **docs/history/dev-logs/** 作归档，**docs/history/README.md** 作索引 | 626 KB 归档已在位、格式统一、内部 39 条链接全部有效；改名会让链接全失效。作者明写「不强制改名」 |
| （通用方案无此项） | 增设 **DOMAIN.md + specs/** | 通用方案的 9 类文件里**没有"长期业务规则"的位置**，而本项目有 21 个页面的业务契约（原 `SPEC.md` 91.5 KB）。塞进 PROJECT_INDEX 会撑爆其 2–4 KB 上限，塞进 DECISIONS 又混淆了"规则"与"决策" |
| （通用方案无此项） | 增设 **ARCHITECTURE.md** | 分层与数据流机制不属于 MAP（位置映射），也不属于 RUNBOOK（操作步骤） |

`DECISIONS.md` 的规模也验证了判断：合并三个来源后是 100 条决策，**独立成文是合理的**（若只有十几条，就该并入 ARCHITECTURE）。

> `MAP.md` 曾一度并入 ARCHITECTURE，后**拆回独立文件**：原表 → 脚本 → 产物 → 消费者的映射表有独立检索价值，混在架构文档里不易定位。

---

## 五、替换步骤（**已于 2026-10-07 执行**）

若确认替换，建议顺序：

1. **先备份**：`backups/docs-before-restructure-<日期>/`（含 SHA-256 清单）。
2. **移入新文件**：`AGENTS.md`、`PROJECT_INDEX.md`、`README.md` 放仓库根；`docs/context/*` 放对应位置。
3. **处理旧文件**：
   - `SPEC.md` → 内容已迁入 DOMAIN/ARCHITECTURE/RUNBOOK/AGENTS，**归档而非直接删**（保留追溯）
   - `HANDOFF.md` / `HANDOFF_FULL.md` → 同上
   - `KNOWN_BUGS_AND_FIXES.md` → 同上
   - `rename-myrzg-to-syzg.md` → 移入 `docs/history/`
   - `docs/README.md` → 被 PROJECT_INDEX 取代
4. **改引用**：全仓搜索 `SPEC.md`、`HANDOFF`、`KNOWN_BUGS` 的链接并改指新位置。
   ⚠️ `backups/**` 与 `docs/history/dev-logs/**` 里的引用**不改**（归档）。
5. **验证**：跑 `RUNBOOK.md` §9 的链接校验；确认无失效相对链接。
6. **提交**：按 [CONTRIBUTING.md](../context/CONTRIBUTING.md) 格式，`docs:` 类型，单独一个提交。

> 🔴 **`AGENTS.md` 的位置决定它是否生效**：harness 从会话工作目录**向上查找 `.git`** 确定项目根。
> 本项目 `.git` 在 `vue-myrzg/`。若会话工作目录是其父目录 `myrzg/`，向上找不到 `.git`，`projectRoot` 回退为 cwd 本身，
> `AGENTS.md` **不在初始加载链上**。必要时在 `myrzg/` 根放一个 10 行 stub 指过来。

---

## 六、未决问题

| 问题 | 说明 |
| --- | --- |
| 是否替换 `docs/` | **待用户决定**。当前为独立产出，可并存对比 |
| 旧文件归档还是删除 | 建议归档（`backups/`），不直接删 |
| `SPEC.md` 是否保留壳 | 若外部有链接指向它，可保留一个跳转壳；否则直接归档 |
| `UI_COMPONENT_LIBRARY.md` / `CONTRIBUTING.md` 是否改名 | 二者职责单一、命名可接受，**建议不动** |
| 命名一致性 | 新文件用全大写 `AGENTS` / `PROJECT_INDEX` / `NOW` / `RUNBOOK` / `DECISIONS` / `RISKS` / `DOMAIN` / `ARCHITECTURE`（主流约定）；旧的 `KNOWN_BUGS_AND_FIXES`、`rename-myrzg-to-syzg` 不符合，已分别归入 RISKS 与 history |
