# PROJECT_INDEX —— 任务 → 文档路由

> **条件路由，不是必读清单。** 只在需要定位时查，查到即停。长期规则在 [AGENTS.md](AGENTS.md)。
> **何时读**：需要定位"改某功能该看哪节"时。 **何时更新**：文档入口或职责变化时。**不复制专题正文。**

**定位**：深渊大书院 —— 《深渊之歌》Web / Android 图鉴工具。23 个页面（含后台与隐私页），除评论与账号外全为静态图鉴，**不连游戏账号**。（核对 2026-10-07）

## 一、按任务类型

| 我要做的事 | 读 |
| --- | --- |
| 了解项目用途与用法 | [README.md](README.md) |
| 当前进展 / 断点 / 待办 | [NOW.md](docs/context/NOW.md) |
| 跑起来 / 构建 / 验收 / 发布 | [RUNBOOK.md](docs/context/RUNBOOK.md) |
| 目录、资源、部署、配置位置 | [MAP.md](docs/context/MAP.md) |
| 分层、数据流、构建机制 | [ARCHITECTURE.md](./docs/context/ARCHITECTURE.md) |
| 某页面业务规则与 URL | [specs/](docs/context/specs/) 选领域 → grep 页名 |
| 共享模块与跨领域约定 | [DOMAIN.md](docs/context/DOMAIN.md) |
| 为什么这么设计 | [DECISIONS.md](docs/context/DECISIONS.md) |
| 已知故障 / 风险 / 验证缺口 | [RISKS.md](docs/context/RISKS.md) |
| 授权边界与红线 | [AGENTS.md](AGENTS.md) §三/§四 |
| 提交信息 / 日报 | [CONTRIBUTING](./docs/context/CONTRIBUTING.md)、[dev-logs/README](./docs/history/dev-logs/README.md) |

---

## 二、按功能模块 → 领域文件

| 功能 | 路由 | 领域文件 |
| --- | --- | --- |
| 物品/装备/符石/兑换/其他奖励 | `/items` `/equip` `/runes` `/exchange` `/rewards` | [ITEMS_AND_EQUIPMENT](docs/context/specs/ITEMS_AND_EQUIPMENT.md) |
| 角色/邮件/魔物/怪物/词条 | `/heroes` `/partner-mails` `/pets` `/monsters` `/glossary` | [HEROES_AND_COMBAT](docs/context/specs/HEROES_AND_COMBAT.md) |
| 副本/关卡/章节地图 | `/dungeons` `/chapters` | [DUNGEONS_AND_CHAPTERS](docs/context/specs/DUNGEONS_AND_CHAPTERS.md) |
| 任务/事件 | `/tasks` `/events` | [QUESTS_AND_EVENTS](docs/context/specs/QUESTS_AND_EVENTS.md) |
| 营地/家具/菜谱/魔物收益/成就 | `/facilities` `/furniture` `/recipes` `/petseggs` `/achievement` | [CAMP_AND_LIFE](docs/context/specs/CAMP_AND_LIFE.md) |
| 模拟招募 | `/gacha` | [GACHA_SIMULATOR](docs/context/specs/GACHA_SIMULATOR.md) |
| 主题/组件/长列表/吉祥物 | 全局 | [UI_DESIGN_SYSTEM](docs/context/specs/UI_DESIGN_SYSTEM.md) |
| 讨论区/账号/隐私/后台 | `/discussions` `/privacy` `/admin` | [DOMAIN](docs/context/DOMAIN.md) §一 |

---

## 三、深入专题

领域规范在 [docs/context/specs/](./docs/context/specs)，跨功能专题在 [docs/context/technical/](./docs/context/technical)。**完整清单见 [README.md](README.md) 入口表**，此处不重复。按关键词搜更快：

```powershell
Select-String -Path docs/context/technical/*.md -Pattern "关键词" -Encoding UTF8
```

---

## 四、代码层速查

| 我要改 | 位置 |
| --- | --- |
| 页面 | `src/views/`（23 个） |
| 公共 UI | `src/components/ui/`（30 个）+ [UI 组件库](./docs/context/UI_COMPONENT_LIBRARY.md) |
| 业务工具（纯逻辑） | `src/utils/` |
| 数据预处理 | `scripts/parse/`（31 个，入口 `index.mjs`） |
| 维护脚本 | `scripts/dev/` |
| 运行时数据 | `public/data/parsed/`（37 个，**禁止直接读 `raw/`**） |
| 评论 / 账号后端 | `functions/api/[[path]].js`（单文件，改了**必须重启** `dev:api`） |

**共享模块唯一实现**见 [DOMAIN.md](docs/context/DOMAIN.md) §四；**源资源与配置位置**见 [MAP.md](docs/context/MAP.md) §一、§五。

---

## 五、历史归档（**先搜索，再读命中上下文**）

| 内容 | 位置 |
| --- | --- |
| 每日开发日志（23 个日报，约 624 KB） | [docs/history/dev-logs/](./docs/history/dev-logs) |
| 归档索引与检索方法 | [docs/history/README.md](docs/history/README.md) |
| 改名迁移全过程 | [docs/history/rename-myrzg-to-syzg.md](docs/history/rename-myrzg-to-syzg.md) |
| 审计与旧文档摘录 | `backups/audits-archive/` |

归档**不是当前规范**，结论可能已被取代。
