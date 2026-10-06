# 深渊大书院

《深渊之歌》Wiki 工具 —— Web + Android（Capacitor）双端。

覆盖物品、装备、符石、角色、魔物、怪物、家具、设施、菜谱、任务剧情、地图掉落、
成就与本地招募模拟；除评论/账号外全部为静态图鉴，不连接游戏账号。

| | |
| --- | --- |
| 线上站点 | <https://syzg.yxzmy.top> |
| 技术栈 | Vue 3 + Vite + Vue Router（Hash）+ Pinia + Capacitor |
| 后端 | Cloudflare Pages Functions + D1（仅评论与账号，其余纯静态） |

## 快速开始

```bash
npm install
npm run dev            # 开发服务，http://localhost:5173
```

评论与账号功能需要另开一个终端（Vite 不认识 `functions/` 目录，
Pages Functions 只在 wrangler 里跑）：

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

完整命令与本地开发注意事项见 [docs/HANDOFF.md](docs/HANDOFF.md) 与
[docs/HANDOFF_FULL.md](docs/HANDOFF_FULL.md)。

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
docs/             规范与交接文档
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/SPEC.md](docs/SPEC.md) | 前端总规范：路由、页面契约、共享边界、资源与验收 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 目录职责、分层、数据流、构建与发布机制 |
| [docs/UI_COMPONENT_LIBRARY.md](docs/UI_COMPONENT_LIBRARY.md) | UI 组件库 API、主题、布局与强制规则 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | 项目交接（功能视角，〇节是最新状态） |
| [docs/HANDOFF_FULL.md](docs/HANDOFF_FULL.md) | 完整交接：部署拓扑、凭据、验证命令、待办 |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | 贡献与提交规范 |
| [docs/dev-logs/README.md](docs/dev-logs/README.md) | 开发日志规范 |
| [docs/README.md](docs/README.md) | 文档导航（专题、技术、审计资料） |

## 维护须知

- **Android 包名 `com.myrzg.assistant` 与本地目录名 `vue-myrzg` 刻意保持不变** ——
  改包名会让已安装用户无法增量升级、本地数据丢失。`capacitor.config.json` 的 `appId`
  与 `android/.../strings.xml` 的 `package_name` / `custom_url_scheme` 均有单测守着。
- **完整数据再生成需要本机原表**（游戏配置、剧情、源码），这些资源不入库；
  新环境缺原表时构建会沿用已有产物，此时只能验收「前端可构建」，
  不等于「能从完整输入再生成」。细节见 [docs/SPEC.md](docs/SPEC.md#六资源维护)。
- **`raw/` 与 `dist/` 不入库**；`public/data/parsed/*.json` 是随包发布的运行时数据，需要入库。
