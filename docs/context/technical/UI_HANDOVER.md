# UI 设计系统与导航菜单交接文档

> 本文档是深渊大书院（《深渊之歌》Wiki 工具）UI 设计系统、桌面端/移动端导航菜单、主题色系及组件库的交接契约。
> 供后续接手开发、视觉迭代及维护时查阅。

**状态**：现役 / 实施完成  
**核对时间**：2026-10-09  
**核心实现文件**：
- 导航菜单组件：`src/components/NavigationMenu.vue`
- 全局主题变量：`src/assets/theme.css`
- 公共组件库目录：`src/components/ui/`（28 个基础/公共组件）
- 领域契约：[docs/context/specs/UI_DESIGN_SYSTEM.md](../specs/UI_DESIGN_SYSTEM.md)
- 组件库详述：[docs/context/UI_COMPONENT_LIBRARY.md](../UI_COMPONENT_LIBRARY.md)

---

## 一、界面整体布局与响应式分流

全站采用古典二游手账 · 羊皮纸典籍设计风格，支持明暗双主题自适应（`.dark-mode`）。

```text
桌面端 (isDesktop = true，视口宽 ≥ 1025px):
┌──────────────┬──────────────────────────────────────────┬──────────────┐
│  左侧导航栏   │               主内容工作区                │  右栏辅助区   │
│  (Navigation)│              (RouterView)                │  (Mascot/    │
│  固定 240px  │  UiFilterPanel + 列表/虚拟网格/详情       │   工具浮窗)   │
└──────────────┴──────────────────────────────────────────┴──────────────┘

移动端 / 窄屏 (isDesktop = false):
┌────────────────────────────────────────────────────────────────────────┐
│  顶部顶栏 (木质质感 + 汉堡菜单按钮 + 标题)                              │
├────────────────────────────────────────────────────────────────────────┤
│  主内容视口 (可滚动区域)                                               │
├────────────────────────────────────────────────────────────────────────┤
│  抽屉侧边栏 (点击汉堡唤出 slide-side 抽屉，羊皮纸面板 .paper-panel)      │
└────────────────────────────────────────────────────────────────────────┘
```

- **响应式判据**：通过 `src/utils/` 或组件内响应式状态判断 `isDesktop`（断点 1024px）。
- **样式隔离**：桌面端侧栏使用 `.side-panel.desktop-panel` 专属作用域，与移动端抽屉严格解耦，互不干扰。

---

## 二、导航菜单组件 (`NavigationMenu.vue`) 契约

### 1. 桌面端视觉规格（现行方案）

| 视觉层 | 规范与实现 | 参数值 |
| :--- | :--- | :--- |
| **底框方案** | **边框 4：手造皮质缝线与内衬层**（无铆钉、无多余外角） | `border: 2px solid #7a5c3d`<br>`box-shadow: inset 0 0 0 4px rgba(223, 206, 179, 0.9), inset 0 0 0 5.5px rgba(143, 115, 81, 0.55), 2px 4px 12px rgba(0, 0, 0, 0.22)`<br>`border-radius: 6px`<br>`background: #e0cfb4`<br>`padding: 6px` |
| **四角处理** | **极简皮质圆角**（零挂件、无外溢铜角） | 彻底移除四叶草、微金星等游离挂件及所有四角金属 SVG 装饰，保持边缘规整清爽。 |
| **分类标题** | 古籍章节压印小标 | `color: #4a3419; font-weight: 700; letter-spacing: 2px; border-bottom: 1.5px solid rgba(143, 115, 81, 0.45)`，右侧带菱形徽记 `◆`。 |
| **菜单项（普通）** | 羊皮纸手账条目 | 高度自适应，字号 `14.5px`，底边细腻虚化分隔线，hover 时微向右位移 `translateX(3px)`。 |
| **菜单项（激活）** | **PA 风格：深棕烫金压纹徽章** | `background: linear-gradient(135deg, #3e2613, #2b1a0d); color: #f7e6c4; border: 1px solid rgba(212, 163, 89, 0.7); box-shadow: 0 3px 8px rgba(43, 31, 21, 0.35);` |
| **激活金光指示条** | 侧边金光立体凹凸指示条 | `position: absolute; left: 0; top: 8px; bottom: 8px; width: 4px; border-radius: 0 3px 3px 0; background: linear-gradient(180deg, #ffd78c, #c5913e); box-shadow: 0 0 6px rgba(255, 215, 140, 0.7);` |
| **滚动提示遮罩** | 上下边缘淡入淡出遮罩 | `.side-scroll-cue` 渐变融合，跟随桌面端背景色 `#e0cfb4`。 |

### 2. 移动端抽屉规格

- 移动端保持使用全站统一的古典羊皮纸面板类 `.paper-panel` + 四角铜铆钉 `.corner-nails`；
- 移动端菜单条目右侧保留箭头 `›`，桌面端已隐藏该箭头以保持徽章紧凑感。

---

## 三、核心踩坑点与维护红线（⚠️ 必读）

1. **指示条错位陷阱（`transform: none`）**：
   - 全局/移动端样式 `.side-item.active::before` 预设了 `transform: translateY(-50%)`（旧逻辑居中用）；
   - 桌面端指示条使用 `top: 8px; bottom: 8px;` 拉伸定高。**必须在 `.side-panel.desktop-panel .side-item.active::before` 中显式设置 `transform: none`**。若遗漏此声明，指示条会被向上抽起 50%，导致半截探出菜单卡片。
2. **默认铜钉屏蔽**：
   - 桌面端由于应用了定制皮质双层缝线底框，必须屏蔽伪元素生成的四角旧铜钉：
     ```css
     .side-panel.desktop-panel.corner-nails::before,
     .side-panel.desktop-panel.corner-nails::after {
       display: none !important;
     }
     ```
3. **滚动穿透与滚动条隐藏**：
   - `.side-panel.desktop-panel .side-body` 启用原生滚动但在各浏览器下隐藏滚动条：`scrollbar-width: none; -ms-overflow-style: none; &::-webkit-scrollbar { display: none; }`；
   - 滚动位置通过 `canScrollUp` / `canScrollDown` 控制上下边缘阴影提示。

---

## 四、主题色彩体系与暗色模式

全局样式定义于 `src/assets/theme.css`。明暗主题通过在根元素切换 `html.dark-mode` 驱动。

| 语义角色 | 亮色模式（羊皮纸经典） | 暗色模式（暗木羊皮卷） | 用途 |
| :--- | :--- | :--- | :--- |
| **桌面侧栏背景** | `#e0cfb4` | `#2b1f15` | 左侧导航栏外壳底色 |
| **侧栏外边框** | `#7a5c3d` | `#5c4327` | 缝线外层主皮革轮廓线 |
| **侧栏缝线内层** | `rgba(223, 206, 179, 0.9)` | `rgba(46, 34, 23, 0.95)` | 第一层浅色压槽缓冲 |
| **侧栏缝线微金线** | `rgba(143, 115, 81, 0.55)` | `rgba(110, 85, 55, 0.55)` | 第二层深色车线阴影 |
| **激活菜单渐变** | `#3e2613 → #2b1a0d` | `#3e2613 → #2b1a0d` | 压纹烫金徽章背景 |
| **激活文字高光** | `#f7e6c4` | `#f7e6c4` | 烫金高光米白字 |
| **金色指示光芒** | `#ffd78c → #c5913e` | `#ffd78c → #c5913e` | 左侧发光竖条与阴影 |

---

## 五、公共 UI 组件库速查

全站 28 个基础组件收敛在 `src/components/ui/`，禁止在业务组件内随意手写非标弹窗、非标按钮或非标输入框。

| 模块类别 | 核心组件 | 说明与使用约束 |
| :--- | :--- | :--- |
| **容器与面板** | `UiCard`, `UiPanel`, `UiDialog`, `UiDrawer`, `UiPopover` | 统一羊皮纸纸张质感，弹窗与抽屉受公共层栈管理 |
| **筛选与搜索** | `UiFilterPanel`, `UiSearchInput`, `UiSelect`, `UiCheckbox` | 筛选区默认展开，带右侧折叠按钮；切页保持规范 |
| **列表与表格** | `UiVirtualGrid`, `UiTable`, `UiPagination`, `UiEmpty` | 百条以上大列表一律走 `UiVirtualGrid` 虚拟滚动 |
| **操作与反馈** | `UiButton`, `UiBadge`, `UiTooltip`, `UiToast`, `UiLoading` | 按钮严格遵循 Primary / Secondary / Ghost 阶梯 |

---

## 六、试验性历史方案与资产留档

在本次导航栏与边框演进过程中，曾迭代并试验过多套视觉方案。为防止后续产品方向变动或需要回溯，相关工坊页面均已妥善归档在 `public/`，不影响生产打包：

1. **边角艺术雕花工坊**：`public/corners-comparison.html`
   - 归档了 4 套高精雕花方案：K1（对角星耀·古籍天平）、K2（鎏金镂空·月桂卷草）、K3（哥特三叶·古铜护角）、K4（星海罗盘·以太切线）；
   - 如果未来有运营活动或典藏皮肤需要更华丽的边角，可直接从中取用现成的 SVG 路径与动画。
2. **多底框与多挂件预览工坊**：`public/nav-preview.html`
   - 归档了 M1~M4 边框风格与多挂件（四叶草、微金星、暗金月桂纹等）拖拽与叠放实验数据。
