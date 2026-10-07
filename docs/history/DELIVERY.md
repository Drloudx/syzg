# DELIVERY —— 本次文档重构的交付报告

> 记录本次任务**新建、修改、迁入了哪些文件**，以及检查结果与待核实项。
> **何时读**：想知道"这套文档是怎么来的、哪些是新的、哪些沿用了旧结构"时。
> **何时更新**：本套文档再次整体调整时。**日常改动不更新本文件**（那是开发日志的职责）。

**任务**：为 `vue-myrzg` 建立项目级文档框架（AI 持久化记忆），使不同模型/平台接手时能按需获取上下文。
**完成时间**：2026-10-07 ｜ **产出位置**：已落入 `docs/`（沙盒 `文档测试/` 已删除）

---

## 一、新建的文件（20 个）

### 根目录（3 个）

| 文件 | 体积 | 职责 |
| --- | --- | --- |
| [AGENTS.md](../../AGENTS.md) | 15.7 KB | 长期规则：读取/写入纪律、授权分级、10 条红线、本机坑 |
| [PROJECT_INDEX.md](../../PROJECT_INDEX.md) | 4.0 KB | 任务 → 权威文档路由（符合 2–4 KB 上限） |
| [README.md](../../README.md) | 5.1 KB | 项目用途、基本使用、文档入口 |

### `docs/context/`（8 个）

| 文件 | 体积 | 职责 |
| --- | --- | --- |
| [NOW.md](../context/NOW.md) | 5.8 KB | 当前状态、阻塞、下一步、证据入口 |
| [MAP.md](../context/MAP.md) | 8.4 KB | 目录、源资源、部署、配置位置映射 |
| [RUNBOOK.md](../context/RUNBOOK.md) | 15.5 KB | 运行、构建、验收、发布、运维 |
| [DECISIONS.md](../context/DECISIONS.md) | 24.9 KB | 109 条已确认决策与理由 |
| [RISKS.md](../context/RISKS.md) | 15.4 KB | 高风险操作、20 条故障目录、验证缺口 |
| [ARCHITECTURE.md](../context/ARCHITECTURE.md) | 16.3 KB | 分层、依赖方向、数据流、构建机制 |
| [DOMAIN.md](../context/DOMAIN.md) | 13.8 KB | 业务契约共享层（索引、共享模块、奖励语义、URL） |
| [specs/](../context/specs/)（7 个） | 68.1 KB | 领域规范，按领域独立成文 |

### `docs/` 与 `docs/history/`（2 个）

| 文件 | 体积 | 职责 |
| --- | --- | --- |
| [MIGRATION.md](MIGRATION.md) | 8.7 KB | 旧结构 → 新结构逐文件映射与替换步骤 |
| [history/README.md](README.md) | 9.2 KB | 历史归档索引：主题索引（15 个主题）+ 按日期浏览 |

### `docs/context/specs/` 领域文件明细

| 文件 | 体积 | 覆盖页面 |
| --- | --- | --- |
| [HEROES_AND_COMBAT.md](../context/specs/HEROES_AND_COMBAT.md) | 22.5 KB | 角色、伙伴邮件、魔物、怪物、词条 |
| [DUNGEONS_AND_CHAPTERS.md](../context/specs/DUNGEONS_AND_CHAPTERS.md) | 17.2 KB | 副本、关卡、章节地图 |
| [CAMP_AND_LIFE.md](../context/specs/CAMP_AND_LIFE.md) | 9.0 KB | 设施营地、家具、菜谱、魔物收益、成就 |
| [ITEMS_AND_EQUIPMENT.md](../context/specs/ITEMS_AND_EQUIPMENT.md) | 7.5 KB | 物品、装备、符石、兑换 |
| [QUESTS_AND_EVENTS.md](../context/specs/QUESTS_AND_EVENTS.md) | 5.3 KB | 任务、事件、其他奖励 |
| [UI_DESIGN_SYSTEM.md](../context/specs/UI_DESIGN_SYSTEM.md) | 3.8 KB | 主题、组件引用、长列表、右栏吉祥物 |
| [GACHA_SIMULATOR.md](../context/specs/GACHA_SIMULATOR.md) | 2.9 KB | 模拟招募 |

---

## 二、迁入的既有文件

以下文件从真实 `docs/` **原样迁入**（逐文件 SHA-256 校验一致），职责单一，未改写：

| 文件 | 体积 | 为什么原样沿用 |
| --- | --- | --- |
| [docs/history/dev-logs/](./dev-logs)（26 个） | 642 KB | **归档**。按 [AGENTS.md](../../AGENTS.md) 第三节「不改写历史记录」 |
| [docs/history/dev-logs/README.md](./dev-logs/README.md) | 3.6 KB | 日志规范，职责单一 |
| [docs/context/UI_COMPONENT_LIBRARY.md](../context/UI_COMPONENT_LIBRARY.md) | 38.3 KB | 组件 API 与设计系统，已相当规范 |
| [docs/context/CONTRIBUTING.md](../context/CONTRIBUTING.md) | 6.1 KB | 提交规范，职责单一 |
| `docs/context/features/**`（6 个） | 51 KB | 功能专题，职责清晰 |
| `docs/context/technical/**`（7 个） | 245 KB | 跨功能接口与离线工具 |
| `backups/audits-archive/**` | — | 归档，不动 |

**本套文档对上述文件的引用均为链接，不复制其正文**（避免重复权威源）。
`docs/history/dev-logs/` 的内部链接**保持原样**：39 条相对链接在真实仓库中全部有效，归档不做路径改写。

---

## 三、旧文件的去向（替换时才执行）

| 旧文件 | 体积 | 新归属 |
| --- | --- | --- |
| `docs/SPEC.md` §一/二/四 | ~40 KB | DOMAIN.md |
| `docs/SPEC.md` §三 | ~50 KB | specs/（7 个领域文件） |
| `docs/SPEC.md` §五 | ~7 KB | ARCHITECTURE.md §4 |
| `docs/SPEC.md` §六 | ~5 KB | ARCHITECTURE §5.3–5.5 + RUNBOOK §4 |
| `docs/SPEC.md` §七 | ~4 KB | AGENTS §五 + RUNBOOK §4 |
| `docs/ARCHITECTURE.md` | 31 KB | ARCHITECTURE.md（精简重排） |
| `docs/HANDOFF.md` | 60.9 KB | NOW + RUNBOOK + DECISIONS（拆分） |
| `docs/HANDOFF_FULL.md` | 24.8 KB | MAP + RUNBOOK §7 + DECISIONS §二 |
| `docs/KNOWN_BUGS_AND_FIXES.md` | 34.4 KB | RISKS.md §二 |
| `docs/rename-myrzg-to-syzg.md` | 16 KB | history/ + DECISIONS §二 |
| `docs/README.md` | 4.2 KB | 并入 PROJECT_INDEX.md |

**建议归档而非直接删除**；替换步骤见 [MIGRATION.md](MIGRATION.md) 第五节。

---

## 四、检查结果

| 检查项 | 结果 |
| --- | --- |
| 相对链接 | **全部有效**（新文件 147 条 + dev-logs 39 条 + history 索引 103 条） |
| 关键判据覆盖 | **35 / 35** 个 SPEC 关键标识符（常量名、函数名、数值）全部保留 |
| 页面契约完整性 | 464 个标识符**全局零丢失**；182 条规则全部迁移 |
| 领域规范规范化 | 最长条目 **530 → 164 字符**；>180 字符的条目 **36 → 0 条** |
| dev-logs 迁入 | 26 个文件**逐文件 SHA-256 一致** |
| 标题层级 | 每个文件恰好 1 个 H1 |
| 叙事禁词 | 0 命中（"我"、"用户反馈"、"本轮"、"已为您"等） |
| 重复权威源 | 无（CSP 理由只在 DECISIONS、红线只在 AGENTS、故障只在 RISKS、其他奖励只在 QUESTS） |
| 最大单文件 | 22.9 KB（DECISIONS.md） |

**未执行**：`npm run verify` 等构建类检查 —— 本次为**纯文档改动**，按 [AGENTS.md](../../AGENTS.md) 第五节「纯文档」行，只需检查链接、UTF-8 与差异格式。

---

## 五、待核实项

| 项 | 说明 |
| --- | --- |
| 两个文档锚点 | `context/technical/COMMENTS_BACKEND.md` 中两个带日期后缀的中文锚点（`#回复引用式不建楼中楼2026-10-04`、`#聊天表情正文里存-e-包名-token2026-10-04`）未做在线核验 |
| `AGENTS.md` 加载位置 | 本项目 `.git` 在 `vue-myrzg/`；若会话工作目录是其父目录 `myrzg/`，`AGENTS.md` 不在初始加载链上。已在 [AGENTS.md](../../AGENTS.md) §八说明，**必要时需在父目录放 stub** |
| 单测条数口径 | 旧文档中曾同时出现 264 与 260 两个数字，本套文档**不复制该数字**，以实际运行为准 |
| dev-logs 内部链接 | 指向旧文档的 14 条已在替换时改指新文档；当前 `docs/` 全部 336 条相对链接有效 |

---

## 六、本文件与 MIGRATION.md 的分工

| | DELIVERY.md（本文件） | [MIGRATION.md](MIGRATION.md) |
| --- | --- | --- |
| 回答 | **本次交付了什么** | **旧结构如何映射到新结构** |
| 读者 | 评审者、想知道来龙去脉的人 | 执行替换的人 |
| 时机 | 交付后一次性 | 替换前查阅 |
