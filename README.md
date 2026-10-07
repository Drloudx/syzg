# 深渊大书院

《深渊之歌》Wiki 工具 —— Web + Android（Capacitor）双端。

覆盖物品、装备、符石、角色、魔物、怪物、家具、设施、菜谱、任务剧情、地图掉落、成就与本地招募模拟；除评论/账号外全部为静态图鉴，**不连接游戏账号**。

> **何时读**：了解或使用本项目时。
> **何时更新**：实际能力或使用方式变化时（新增页面、改命令、改依赖）。

| | |
| --- | --- |
| 线上站点 | <https://syzg.yxzmy.top> |
| 技术栈 | Vue 3 + Vite + Vue Router（Hash）+ Pinia + Capacitor |
| 后端 | Cloudflare Pages Functions + D1（仅评论与账号，其余纯静态） |

---

## 快速开始

```bash
npm install
npm run dev            # 开发服务，http://localhost:5173
```

评论与账号功能需要另开一个终端（Vite 不认识 `functions/` 目录，Pages Functions 只在 wrangler 里跑）：

```bash
npm run dev:api        # 评论 / 账号 API，http://127.0.0.1:8788
```

浏览器始终开 **5173** —— `vite.config.js` 会把 `/api/*` 代理到 8788。
不起 `dev:api` 时评论面板会提示连不上服务，其余页面不受影响。

## 常用命令

```bash
npm run data:build     # 数据预处理（原表 → public/data/parsed/）
npm run build          # data:build + 生产构建
npm run verify         # 一键验收：产物齐全 + 无残留 + 构建通过
npm run test:unit      # 单元测试
npm run test:ui        # Playwright 交互回归
npm run preview        # 预览构建产物
npx cap sync android   # 同步 Android 原生壳
```

完整命令、前置条件与发布流程见 [RUNBOOK](docs/context/RUNBOOK.md)。

## 设计主题

羊皮纸 Wiki 主题：深原木顶栏 + 半透明羊皮纸面板 + 地图铺底。
设计系统入口 `src/assets/theme.css`，组件库 `src/components/ui/`，
所有页面必须从组件库引用公共组件。

## 目录结构

```
src/
  views/          页面（路由组件，每个图鉴一页）
  components/ui/  UI 组件库（羊皮纸设计系统）
  components/     业务组件（招募、副本、关卡地图、详情弹窗等）
  utils/          业务工具与数据解析（纯逻辑）
  assets/         theme.css 等全局样式
scripts/
  parse/          构建期数据预处理入口
  dev/            维护脚本（原表同步、资源导入、验收）
public/
  data/parsed/    构建期生成的运行时数据
  images/  ui/    游戏图片资源
functions/        Pages Functions（评论 / 账号 API）
tests/            单元、端到端、迁移演练与真机套件
docs/
  context/        当前有效的规范与契约（含 specs/ technical/）
  history/        历史归档（含 dev-logs/）
```

> `docs/` 是**两分法**：`context/` = 现在该看的，`history/` = 追溯才看的。详见 [MAP](docs/context/MAP.md)。

---

## 文档入口

> **接手项目请先读 [AGENTS.md](AGENTS.md)** —— 它规定该读什么、能改什么。
> 它同时包含**读取纪律**：本仓库 `docs/` 约 1.2 MB，**不要通读**，按索引定位章节。

| 文档 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | **长期规则**：读取/写入纪律、工作树授权、项目红线、本机坑 |
| [PROJECT_INDEX.md](PROJECT_INDEX.md) | **任务 → 权威章节**路由（条件路由，不是必读清单） |
| [docs/context/NOW.md](docs/context/NOW.md) | 当前状态、阻塞与下一步（接续工作先读） |
| [docs/context/MAP.md](docs/context/MAP.md) | 目录、源资源、部署位置、配置位置映射 |
| [docs/context/RUNBOOK.md](docs/context/RUNBOOK.md) | 运行、构建、验收、发布、运维 |
| [docs/context/ARCHITECTURE.md](./docs/context/ARCHITECTURE.md) | 分层、数据流、构建机制 |
| [docs/context/DOMAIN.md](docs/context/DOMAIN.md) | 业务契约总览：领域索引、共享模块、奖励语义、URL |
| [docs/context/specs/](docs/context/specs/) | 7 个领域规范（物品装备 / 角色战斗 / 副本关卡 / 任务事件 / 营地生活 / 招募 / UI） |
| [docs/context/DECISIONS.md](docs/context/DECISIONS.md) | 已确认决策与理由 |
| [docs/context/RISKS.md](docs/context/RISKS.md) | 风险、已知故障、验证缺口 |
| [docs/context/UI_COMPONENT_LIBRARY.md](./docs/context/UI_COMPONENT_LIBRARY.md) | UI 组件库 API、主题、强制规则 |
| [docs/context/CONTRIBUTING.md](./docs/context/CONTRIBUTING.md) | 提交信息格式与写作要求 |
| [docs/context/technical/](./docs/context/technical) | 跨功能接口（奖励/公式/账号/评论等） |
| [docs/history/README.md](docs/history/README.md) | 历史归档索引（**先搜索再读**） |

---

## 维护须知

- **Android 包名 `com.myrzg.assistant` 与本地目录名 `vue-myrzg` 刻意保持不变** ——
  改包名会让已安装用户无法增量升级、本地数据丢失。`capacitor.config.json` 的 `appId`
  与 `android/.../strings.xml` 的 `package_name` / `custom_url_scheme` 均有单测守着。
- **完整数据再生成需要本机原表**（游戏配置、剧情、源码），这些资源不入库；
  新环境缺原表时构建会沿用已有产物，此时只能验收「前端可构建」，
  **不等于**「能从完整输入再生成」。
- **`raw/` 与 `dist/` 不入库**；`public/data/parsed/*.json` 是随包发布的运行时数据，需要入库。
- **`git push` 就是上线**（Cloudflare Pages GitHub 集成），没有二次发布步骤。
