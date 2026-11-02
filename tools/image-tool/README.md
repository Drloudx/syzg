# 图片处理工具（WebP 压缩）

把 PNG / JPEG 转成 WebP，用于本站图片资源规范。**输出到原图同目录，保留原图。**

## 用法

双击项目根目录的 `图片处理工具.exe`。

```
┌─────────────────────────────────────────┐
│        把图片拖到这里                    │  ← 拖文件或整个文件夹进来
│   也支持拖入整个文件夹 · 或点这里选择文件  │
├─────────────────────────────────────────┤
│ 质量 [85]  最大宽度 [960] (0=不缩放)     │
│ ☑ 包含子文件夹   ☐ 转换后删除原图         │
├─────────────────────────────────────────┤
│ [选择文件] [选择文件夹] [开始处理] [清空] │
├─────────────────────────────────────────┤
│ 文件            大小      状态           │
│ a.png          950 KB    ✓ 950 → 80 KB  │
│ b.png          774 KB    ✓ 774 → 70 KB  │
├─────────────────────────────────────────┤
│ 日志（逐行输出每个文件的结果）            │
└─────────────────────────────────────────┘
```

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| 质量 | 85 | WebP 有损质量。项目内约定值，与 `compress-images.mjs` 的 JPEG q85 一致 |
| 最大宽度 | 960 | 仅在原图超过此宽度时等比缩小，小图不放大。填 0 = 不缩放 |
| 包含子文件夹 | 开 | 选文件夹时是否递归 |
| 转换后删除原图 | 关 | 默认保留原图（可回退） |

## 行为

| 情况 | 处理 |
| --- | --- |
| 输入已是 WebP | 跳过，不重复编码 |
| 压缩后反而更大 | 跳过，保留原图（常见于小图 / 已高度压缩的图） |
| 输出文件已存在 | 覆盖 |
| 转换失败 | 该文件标记 ✗，其余继续，不影响整批 |

## 依赖

需要以下环境（**本机已具备**）：

- Node.js（`node` 在 PATH 里）
- 项目根目录的 `node_modules`（提供 sharp）
- `scripts/dev/image-tool-cli.mjs`（exe 的后端）

exe 会自己向上查找含 `scripts/dev/image-tool-cli.mjs` 的目录作为项目根。
也可以用环境变量指定：

```powershell
$env:IMAGETOOL_PROJECT_ROOT = "E:\Desktop\html\myrzg\vue-myrzg"
.\图片处理工具.exe
```

## 为什么 exe 只有 23 KB

exe 只做界面，转换交给 Node + sharp。原因：

| 方案 | 体积 | 问题 |
| --- | --- | --- |
| 把 node.exe 塞进 exe | ~100 MB | 太重 |
| 用 pkg / Node SEA 打成单文件 | — | **sharp 是原生模块（libvips 19 MB），打不进去** |
| **C# 直接调 libvips** | ~19 MB | 需要 GObject 调用栈，实现复杂度远超收益 |
| **exe + 调用项目里的 node** | **23 KB** | ✅ 采用。要求本机有 Node + node_modules |

## 重新编译

源码在 `tools/image-tool/ImageTool.cs`。改完执行：

```powershell
cd tools/image-tool
& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" `
  /target:winexe /out:图片处理工具.exe /win32icon:app.ico `
  /r:System.Windows.Forms.dll /r:System.Drawing.dll /optimize+ ImageTool.cs
Copy-Item 图片处理工具.exe ..\..\图片处理工具.exe -Force
```

> 用的是 Windows 自带的 .NET Framework 编译器，不需要装 Visual Studio。
> 但只支持 C# 5 语法（不能用 `ArgumentList`、字符串插值 `$""` 等新特性）。

## 与项目脚本的关系

| 工具 | 用途 |
| --- | --- |
| `图片处理工具.exe` | **手动**处理单个 / 一批图（拖拽） |
| `scripts/dev/convert-remaining-to-webp.mjs` | 命令行版，支持 `--backup-to` 强制备份 |
| `scripts/dev/image-tool-cli.mjs` | exe 的后端，输出 JSON 进度 |
| `scripts/dev/compress-images.mjs` | 有损压缩（同格式重新编码，不转 WebP） |

exe 适合日常手动处理；写脚本或需要备份校验时用命令行版本。
