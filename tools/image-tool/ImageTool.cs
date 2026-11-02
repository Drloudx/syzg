using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ImageTool
{
    /// <summary>
    /// 图片处理工具（WebP 压缩）—— 小清新美化版。
    ///
    /// 架构：本 exe 只做界面，真正的转换交给 scripts/dev/image-tool-cli.mjs
    ///       （用项目里已装的 sharp）。
    /// </summary>
    public class MainForm : Form
    {
        // ── 清新调色板 ──
        private static readonly Color ColorAppBg        = Color.FromArgb(245, 248, 246); // 柔和晨露青白
        private static readonly Color ColorCardBg       = Color.FromArgb(255, 255, 255); // 纯白卡片
        private static readonly Color ColorMintPrimary  = Color.FromArgb(16, 185, 129);  // 薄荷翡翠绿主色
        private static readonly Color ColorMintHover    = Color.FromArgb(5, 150, 105);   // 主色 Hover
        private static readonly Color ColorMintActive   = Color.FromArgb(4, 120, 87);    // 主色 Active
        private static readonly Color ColorMintLight    = Color.FromArgb(236, 253, 245); // 薄荷浅高亮
        private static readonly Color ColorMintBadgeBg  = Color.FromArgb(209, 250, 229); // 成功徽章底色
        private static readonly Color ColorMintBadgeTxt = Color.FromArgb(6, 95, 70);     // 成功徽章字色
        private static readonly Color ColorBorderMint   = Color.FromArgb(167, 243, 208); // 薄荷绿细边框
        private static readonly Color ColorBorderLight  = Color.FromArgb(226, 232, 240); // 浅灰分隔边框
        private static readonly Color ColorTextTitle    = Color.FromArgb(6, 78, 59);     // 森林墨绿标题
        private static readonly Color ColorTextMain     = Color.FromArgb(30, 41, 59);    // 深冷灰正文
        private static readonly Color ColorTextMuted    = Color.FromArgb(100, 116, 139); // 柔和次级字色
        private static readonly Color ColorRowAlt       = Color.FromArgb(248, 250, 252); // 斑马纹交替行
        private static readonly Color ColorSelectedRow  = Color.FromArgb(220, 252, 231); // 选中行薄荷绿高亮
        private static readonly Color ColorLogBg        = Color.FromArgb(248, 250, 252); // 日志浅色底
        private static readonly Color ColorLogText      = Color.FromArgb(51, 65, 85);    // 日志文字色

        // ── 界面控件 ──
        private Panel dropZone;
        private Image illustrationImage;
        private bool isDragOver = false;

        private ListView fileList;
        private TextBox logBox;
        private NumericUpDown qualityBox;
        private NumericUpDown maxWidthBox;
        private CheckBox recursiveBox;
        private CheckBox deleteOriginBox;
        private Button pickFilesBtn;
        private Button pickFolderBtn;
        private Button startBtn;
        private Button clearBtn;
        private ProgressBar progress;
        private Label statusLabel;
        private ImageList spacerImageList;

        private readonly List<string> queued = new List<string>();
        private bool running = false;

        public MainForm()
        {
            Text = "图片处理工具 · 轻量 WebP 压缩";
            Width = 920;
            Height = 740;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(800, 640);
            Font = new Font("Microsoft YaHei UI", 9F);
            BackColor = ColorAppBg;

            LoadAppIconAndIllustration();
            BuildUi();
        }

        /// <summary>
        /// 加载应用左上角图标与拖拽区插画
        /// </summary>
        private void LoadAppIconAndIllustration()
        {
            // 1. 设置窗口左上角图标
            try
            {
                // 先尝试从 exe 提取内嵌的 Win32 图标
                Icon exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (exeIcon != null)
                {
                    this.Icon = exeIcon;
                }
            }
            catch { }

            // 若未提取到，且同级或上级存在 app.ico，则尝试直接读取
            if (this.Icon == null)
            {
                try
                {
                    string dir = AppDomain.CurrentDomain.BaseDirectory;
                    string icoPath = Path.Combine(dir, "app.ico");
                    if (!File.Exists(icoPath))
                    {
                        icoPath = Path.Combine(dir, "tools", "image-tool", "app.ico");
                    }
                    if (File.Exists(icoPath))
                    {
                        this.Icon = new Icon(icoPath);
                    }
                }
                catch { }
            }

            // 2. 加载拖拽区插画图片
            try
            {
                string dir = AppDomain.CurrentDomain.BaseDirectory;
                string picPath = Path.Combine(dir, "icon-illustration.png");
                if (!File.Exists(picPath))
                {
                    picPath = Path.Combine(dir, "tools", "image-tool", "icon-illustration.png");
                }
                if (File.Exists(picPath))
                {
                    illustrationImage = Image.FromFile(picPath);
                }
            }
            catch { }

            // 若外部文件不存在，从内置 Base64 还原插画（保证 exe 单文件独立性）
            if (illustrationImage == null)
            {
                try
                {
                    byte[] bytes = Convert.FromBase64String(EmbeddedIllustrationBase64);
                    using (MemoryStream ms = new MemoryStream(bytes))
                    {
                        illustrationImage = new Bitmap(Image.FromStream(ms));
                    }
                }
                catch { }
            }

            // 若仍无窗口图标，从插画位图生成
            if (this.Icon == null && illustrationImage != null)
            {
                try
                {
                    using (Bitmap bmp = new Bitmap(illustrationImage, new Size(32, 32)))
                    {
                        this.Icon = Icon.FromHandle(bmp.GetHicon());
                    }
                }
                catch { }
            }
        }

        private void BuildUi()
        {
            // ── 顶部外层容器：包含拖拽区 ──
            Panel topContainer = new Panel
            {
                Dock = DockStyle.Top,
                Height = 148,
                Padding = new Padding(14, 12, 14, 6),
                BackColor = Color.Transparent
            };

            // ── 拖拽区卡片 ──
            dropZone = new Panel
            {
                Dock = DockStyle.Fill,
                AllowDrop = true,
                BackColor = ColorCardBg,
                Cursor = Cursors.Hand
            };
            EnableDoubleBuffer(dropZone);

            dropZone.Paint += DropZone_Paint;
            dropZone.DragEnter += DropZone_DragEnter;
            dropZone.DragOver += (s, e) => { e.Effect = DragDropEffects.Copy; };
            dropZone.DragLeave += DropZone_DragLeave;
            dropZone.DragDrop += DropZone_DragDrop;
            dropZone.Click += (s, e) => PickFiles();

            topContainer.Controls.Add(dropZone);

            // ── 参数区 ──
            Panel optionsContainer = new Panel
            {
                Dock = DockStyle.Top,
                Height = 52,
                Padding = new Padding(14, 0, 14, 6),
                BackColor = Color.Transparent
            };

            Panel optionsCard = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = ColorCardBg,
                Padding = new Padding(14, 8, 14, 8)
            };
            optionsCard.Paint += (s, e) =>
            {
                using (Pen p = new Pen(ColorBorderLight, 1F))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, optionsCard.Width - 1, optionsCard.Height - 1);
                }
            };

            FlowLayoutPanel optionsPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                WrapContents = false,
                BackColor = Color.Transparent,
                Margin = new Padding(0)
            };

            optionsPanel.Controls.Add(MakeLabel("压缩质量"));
            qualityBox = new NumericUpDown
            {
                Minimum = 1,
                Maximum = 100,
                Value = 85,
                Width = 56,
                Font = new Font("Microsoft YaHei UI", 9F),
                TextAlign = HorizontalAlignment.Center,
                Margin = new Padding(0, 3, 16, 0)
            };
            optionsPanel.Controls.Add(qualityBox);

            optionsPanel.Controls.Add(MakeLabel("最大宽度"));
            maxWidthBox = new NumericUpDown
            {
                Minimum = 0,
                Maximum = 8192,
                Value = 960,
                Width = 72,
                Font = new Font("Microsoft YaHei UI", 9F),
                TextAlign = HorizontalAlignment.Center,
                Margin = new Padding(0, 3, 4, 0)
            };
            optionsPanel.Controls.Add(maxWidthBox);
            optionsPanel.Controls.Add(MakeLabel("px（0 = 不缩放原图）", true));

            recursiveBox = new CheckBox
            {
                Text = "包含子文件夹",
                Checked = true,
                AutoSize = true,
                Margin = new Padding(24, 6, 0, 0),
                ForeColor = ColorTextMain,
                Cursor = Cursors.Hand
            };
            optionsPanel.Controls.Add(recursiveBox);

            deleteOriginBox = new CheckBox
            {
                Text = "转换后删除原图",
                Checked = false,
                AutoSize = true,
                Margin = new Padding(18, 6, 0, 0),
                ForeColor = ColorTextMain,
                Cursor = Cursors.Hand
            };
            optionsPanel.Controls.Add(deleteOriginBox);

            optionsCard.Controls.Add(optionsPanel);
            optionsContainer.Controls.Add(optionsCard);

            // ── 按钮区 ──
            Panel buttonContainer = new Panel
            {
                Dock = DockStyle.Top,
                Height = 48,
                Padding = new Padding(14, 0, 14, 6),
                BackColor = Color.Transparent
            };

            FlowLayoutPanel buttonPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                WrapContents = false,
                BackColor = Color.Transparent
            };

            startBtn = MakeButton("▶ 开始处理", true, (s, e) => StartProcess());
            startBtn.Width = 112;
            startBtn.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);

            pickFilesBtn = MakeButton("选择图片", false, (s, e) => PickFiles());
            pickFolderBtn = MakeButton("选择文件夹", false, (s, e) => PickFolder());
            clearBtn = MakeButton("清空列表", false, (s, e) => ClearQueue());

            buttonPanel.Controls.Add(startBtn);
            buttonPanel.Controls.Add(pickFilesBtn);
            buttonPanel.Controls.Add(pickFolderBtn);
            buttonPanel.Controls.Add(clearBtn);

            buttonContainer.Controls.Add(buttonPanel);

            // ── 列表区域容器 ──
            Panel listContainer = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(14, 0, 14, 6),
                BackColor = Color.Transparent
            };

            fileList = new ListView
            {
                Dock = DockStyle.Fill,
                View = View.Details,
                FullRowSelect = true,
                GridLines = false,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = ColorCardBg,
                ForeColor = ColorTextMain,
                Font = new Font("Microsoft YaHei UI", 9F),
                OwnerDraw = true
            };
            EnableDoubleBuffer(fileList);

            // 用 ImageList 撑出行高（28px），避免条目挤在一起
            spacerImageList = new ImageList { ImageSize = new Size(1, 26), ColorDepth = ColorDepth.Depth32Bit };
            fileList.SmallImageList = spacerImageList;

            fileList.Columns.Add("文件名称", 390);
            fileList.Columns.Add("原始大小", 90, HorizontalAlignment.Right);
            fileList.Columns.Add("处理状态", 360);

            fileList.Resize += (s, e) => FillListColumns();
            fileList.DrawColumnHeader += FileList_DrawColumnHeader;
            fileList.DrawItem += FileList_DrawItem;
            fileList.DrawSubItem += FileList_DrawSubItem;

            listContainer.Controls.Add(fileList);

            // ── 日志区 ──
            Panel logContainer = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 135,
                Padding = new Padding(14, 0, 14, 6),
                BackColor = Color.Transparent
            };

            Panel logCard = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = ColorLogBg,
                Padding = new Padding(1)
            };
            logCard.Paint += (s, e) =>
            {
                using (Pen p = new Pen(ColorBorderLight, 1F))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, logCard.Width - 1, logCard.Height - 1);
                }
            };

            Panel logHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 26,
                BackColor = Color.FromArgb(241, 245, 249)
            };
            Label logTitle = new Label
            {
                Text = "运行日志",
                Font = new Font("Microsoft YaHei UI", 8.25F, FontStyle.Bold),
                ForeColor = ColorTextMuted,
                Dock = DockStyle.Left,
                AutoSize = false,
                Width = 90,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(8, 0, 0, 0)
            };
            logHeader.Controls.Add(logTitle);

            logBox = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Font = new Font("Consolas", 8.5F),
                BackColor = ColorLogBg,
                ForeColor = ColorLogText,
                BorderStyle = BorderStyle.None,
                Margin = new Padding(6)
            };

            logCard.Controls.Add(logBox);
            logCard.Controls.Add(logHeader);
            logContainer.Controls.Add(logCard);

            // ── 底部状态栏 ──
            Panel statusPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 36,
                Padding = new Padding(14, 0, 14, 8),
                BackColor = Color.Transparent
            };

            progress = new ProgressBar
            {
                Dock = DockStyle.Right,
                Width = 260,
                Style = ProgressBarStyle.Continuous,
                Height = 18,
                Margin = new Padding(0, 4, 0, 4)
            };

            statusLabel = new Label
            {
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = ColorTextTitle,
                Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold),
                Text = "就绪"
            };

            statusPanel.Controls.Add(statusLabel);
            statusPanel.Controls.Add(progress);

            // ── 组装层级（Dock 规则：后 Add 的贴外边，Fill 最先 Add） ──
            Controls.Add(listContainer);     // Fill 必须最先加
            Controls.Add(logContainer);      // Bottom
            Controls.Add(statusPanel);       // Bottom
            Controls.Add(buttonContainer);   // Top
            Controls.Add(optionsContainer);  // Top
            Controls.Add(topContainer);      // Top（最后加，排在最顶上）
        }

        /// <summary>开启控件双缓冲，消灭闪烁</summary>
        private static void EnableDoubleBuffer(Control ctl)
        {
            try
            {
                PropertyInfo prop = typeof(Control).GetProperty("DoubleBuffered", BindingFlags.NonPublic | BindingFlags.Instance);
                if (prop != null) prop.SetValue(ctl, true, null);
            }
            catch { }
        }

        /// <summary>让「状态」列吃掉剩余宽度，避免右侧留大片空白</summary>
        private void FillListColumns()
        {
            if (fileList == null || fileList.Columns.Count < 3) return;
            int fixedWidth = fileList.Columns[0].Width + fileList.Columns[1].Width;
            int rest = fileList.ClientSize.Width - fixedWidth - 4;
            if (rest > 120) fileList.Columns[2].Width = rest;
        }

        private Label MakeLabel(string text, bool small = false)
        {
            return new Label
            {
                Text = text,
                AutoSize = true,
                Margin = new Padding(0, 6, 6, 0),
                ForeColor = small ? ColorTextMuted : ColorTextMain,
                Font = small ? new Font("Microsoft YaHei UI", 8F) : new Font("Microsoft YaHei UI", 9F)
            };
        }

        private Button MakeButton(string text, bool isPrimary, EventHandler onClick)
        {
            Button b = new Button
            {
                Text = text,
                Width = 100,
                Height = 34,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                Margin = new Padding(0, 0, 10, 0),
                Font = new Font("Microsoft YaHei UI", 9F)
            };

            if (isPrimary)
            {
                b.BackColor = ColorMintPrimary;
                b.ForeColor = Color.White;
                b.FlatAppearance.BorderSize = 0;
                b.MouseEnter += (s, e) => { if (b.Enabled) b.BackColor = ColorMintHover; };
                b.MouseLeave += (s, e) => { if (b.Enabled) b.BackColor = ColorMintPrimary; };
                b.MouseDown += (s, e) => { if (b.Enabled) b.BackColor = ColorMintActive; };
            }
            else
            {
                b.BackColor = ColorCardBg;
                b.ForeColor = ColorTextMain;
                b.FlatAppearance.BorderColor = ColorBorderLight;
                b.FlatAppearance.BorderSize = 1;
                b.MouseEnter += (s, e) =>
                {
                    if (b.Enabled)
                    {
                        b.BackColor = Color.FromArgb(240, 253, 244);
                        b.FlatAppearance.BorderColor = ColorBorderMint;
                        b.ForeColor = ColorTextTitle;
                    }
                };
                b.MouseLeave += (s, e) =>
                {
                    if (b.Enabled)
                    {
                        b.BackColor = ColorCardBg;
                        b.FlatAppearance.BorderColor = ColorBorderLight;
                        b.ForeColor = ColorTextMain;
                    }
                };
            }

            b.Click += onClick;
            return b;
        }

        // ── 拖拽区自绘：插画 + 小清新边框 + 文字排版 ──
        private void DropZone_Paint(object sender, PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            int w = dropZone.Width;
            int h = dropZone.Height;
            Rectangle rect = new Rectangle(0, 0, w, h);

            // 背景色
            Color fill = isDragOver ? ColorMintLight : ColorCardBg;
            using (SolidBrush sb = new SolidBrush(fill))
            {
                g.FillRectangle(sb, rect);
            }

            // 浅薄荷绿虚线边框
            Color border = isDragOver ? ColorMintPrimary : ColorBorderMint;
            float dashWidth = isDragOver ? 2.0F : 1.6F;
            using (Pen pen = new Pen(border, dashWidth))
            {
                pen.DashStyle = DashStyle.Dash;
                g.DrawRectangle(pen, 2, 2, w - 5, h - 5);
            }

            // 绘制小清新插画图片与文字（居中排版）
            int iconSize = 72;
            int gap = 20;

            int textBlockWidth = 440;
            int totalContentWidth = iconSize + gap + textBlockWidth;
            int startX = Math.Max(24, (w - totalContentWidth) / 2);
            int startY = (h - iconSize) / 2;

            if (illustrationImage != null)
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(illustrationImage, new Rectangle(startX, startY, iconSize, iconSize));
            }

            // 右侧文本排版
            int textX = startX + iconSize + gap;
            int textY = startY + 2;

            using (Font titleFont = new Font("Microsoft YaHei UI", 12.5F, FontStyle.Bold))
            using (SolidBrush titleBrush = new SolidBrush(ColorTextTitle))
            {
                g.DrawString("把图片或文件夹拖到这里", titleFont, titleBrush, textX, textY);
            }

            using (Font subFont = new Font("Microsoft YaHei UI", 9F))
            using (SolidBrush subBrush = new SolidBrush(ColorMintHover))
            {
                g.DrawString("支持 PNG · JPG · BMP · GIF · AVIF · HEIC 批量转为轻量 WebP", subFont, subBrush, textX, textY + 28);
            }

            using (Font tipFont = new Font("Microsoft YaHei UI", 8.25F))
            using (SolidBrush tipBrush = new SolidBrush(ColorTextMuted))
            {
                g.DrawString("点击此处亦可快速浏览并选择文件 · 默认保留原图安全无损", tipFont, tipBrush, textX, textY + 50);
            }
        }

        private void DropZone_DragEnter(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effect = DragDropEffects.Copy;
                isDragOver = true;
                dropZone.Invalidate();
            }
            else
            {
                e.Effect = DragDropEffects.None;
            }
        }

        private void DropZone_DragLeave(object sender, EventArgs e)
        {
            isDragOver = false;
            dropZone.Invalidate();
        }

        private void DropZone_DragDrop(object sender, DragEventArgs e)
        {
            isDragOver = false;
            dropZone.Invalidate();

            string[] paths = (string[])e.Data.GetData(DataFormats.FileDrop);
            if (paths == null) return;

            foreach (string p in paths)
            {
                if (Directory.Exists(p)) AddFolder(p, recursiveBox.Checked);
                else if (File.Exists(p)) AddFile(p);
            }
            UpdateStatus();
        }

        // ── ListView 自绘（表头 + 斑马纹 + 彩色状态胶囊） ──
        private void FileList_DrawColumnHeader(object sender, DrawListViewColumnHeaderEventArgs e)
        {
            Graphics g = e.Graphics;
            using (SolidBrush sb = new SolidBrush(Color.FromArgb(241, 245, 249)))
            {
                g.FillRectangle(sb, e.Bounds);
            }

            using (Pen p = new Pen(ColorBorderLight))
            {
                g.DrawLine(p, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
            }

            TextFormatFlags flags = TextFormatFlags.VerticalCenter | TextFormatFlags.Left;
            if (e.Header.TextAlign == HorizontalAlignment.Right) flags = TextFormatFlags.VerticalCenter | TextFormatFlags.Right;

            Rectangle textRect = new Rectangle(e.Bounds.Left + 8, e.Bounds.Top, e.Bounds.Width - 16, e.Bounds.Height);
            TextRenderer.DrawText(g, e.Header.Text, new Font("Microsoft YaHei UI", 8.5F, FontStyle.Bold), textRect, ColorTextMuted, flags);
        }

        private void FileList_DrawItem(object sender, DrawListViewItemEventArgs e)
        {
            // SubItem 自绘负责整个条目背景，此处留空避免干扰
        }

        private void FileList_DrawSubItem(object sender, DrawListViewSubItemEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            bool isSelected = e.Item.Selected;
            Color rowBg = isSelected
                ? ColorSelectedRow
                : (e.ItemIndex % 2 == 1 ? ColorRowAlt : ColorCardBg);

            using (SolidBrush sb = new SolidBrush(rowBg))
            {
                g.FillRectangle(sb, e.Bounds);
            }

            // 底部分隔细线
            using (Pen p = new Pen(Color.FromArgb(245, 247, 250)))
            {
                g.DrawLine(p, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
            }

            if (e.ColumnIndex == 0) // 文件名
            {
                Rectangle iconRect = new Rectangle(e.Bounds.Left + 10, e.Bounds.Top + (e.Bounds.Height - 14) / 2, 14, 14);
                using (SolidBrush dotBrush = new SolidBrush(ColorMintPrimary))
                {
                    g.FillEllipse(dotBrush, iconRect.Left + 4, iconRect.Top + 4, 6, 6);
                }

                Rectangle textRect = new Rectangle(e.Bounds.Left + 26, e.Bounds.Top, e.Bounds.Width - 30, e.Bounds.Height);
                TextRenderer.DrawText(g, e.SubItem.Text, e.Item.Font, textRect, ColorTextMain,
                    TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            }
            else if (e.ColumnIndex == 1) // 大小
            {
                Rectangle textRect = new Rectangle(e.Bounds.Left, e.Bounds.Top, e.Bounds.Width - 12, e.Bounds.Height);
                TextRenderer.DrawText(g, e.SubItem.Text, e.Item.Font, textRect, ColorTextMuted,
                    TextFormatFlags.VerticalCenter | TextFormatFlags.Right);
            }
            else if (e.ColumnIndex == 2) // 状态：胶囊徽章渲染
            {
                DrawStatusBadge(g, e.Bounds, e.SubItem.Text);
            }
        }

        /// <summary>绘制状态胶囊徽章</summary>
        private static void DrawStatusBadge(Graphics g, Rectangle bounds, string status)
        {
            if (string.IsNullOrEmpty(status)) return;

            Color badgeBg;
            Color badgeText;
            Color badgeBorder;

            if (status.StartsWith("✓"))
            {
                badgeBg = ColorMintBadgeBg;
                badgeText = ColorMintBadgeTxt;
                badgeBorder = ColorBorderMint;
            }
            else if (status.StartsWith("–") || status.Contains("跳过"))
            {
                badgeBg = Color.FromArgb(254, 243, 199);
                badgeText = Color.FromArgb(146, 64, 14);
                badgeBorder = Color.FromArgb(253, 230, 138);
            }
            else if (status.StartsWith("✗") || status.Contains("失败"))
            {
                badgeBg = Color.FromArgb(255, 228, 230);
                badgeText = Color.FromArgb(159, 18, 57);
                badgeBorder = Color.FromArgb(254, 205, 211);
            }
            else
            {
                badgeBg = Color.FromArgb(241, 245, 249);
                badgeText = Color.FromArgb(100, 116, 139);
                badgeBorder = Color.FromArgb(226, 232, 240);
            }

            int h = 20;
            int y = bounds.Top + (bounds.Height - h) / 2;

            Size textSize = TextRenderer.MeasureText(status, SystemFonts.DefaultFont);
            int badgeW = Math.Min(bounds.Width - 16, Math.Max(46, textSize.Width + 14));
            Rectangle badgeRect = new Rectangle(bounds.Left + 8, y, badgeW, h);

            using (GraphicsPath path = RoundedRect(badgeRect, 6))
            {
                using (SolidBrush sb = new SolidBrush(badgeBg))
                {
                    g.FillPath(sb, path);
                }
                using (Pen p = new Pen(badgeBorder, 1F))
                {
                    g.DrawPath(p, path);
                }
            }

            TextRenderer.DrawText(g, status, new Font("Microsoft YaHei UI", 8F), badgeRect, badgeText,
                TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter | TextFormatFlags.EndEllipsis);
        }

        private static GraphicsPath RoundedRect(Rectangle r, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            int d = radius * 2;
            path.AddArc(r.X, r.Y, d, d, 180, 90);
            path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        // ── 业务核心逻辑（保持完全不变） ──

        private static readonly HashSet<string> ImageExt = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".gif", ".avif", ".heic"
        };

        private void AddFile(string path)
        {
            if (!ImageExt.Contains(Path.GetExtension(path))) return;
            if (queued.Contains(path)) return;
            queued.Add(path);

            FileInfo info = new FileInfo(path);
            ListViewItem item = new ListViewItem(Path.GetFileName(path));
            item.SubItems.Add(FormatSize(info.Length));
            item.SubItems.Add("等待");
            item.Tag = path;
            fileList.Items.Add(item);
        }

        private void AddFolder(string dir, bool recursive)
        {
            try
            {
                foreach (string f in Directory.GetFiles(dir))
                    AddFile(f);

                if (recursive)
                {
                    foreach (string d in Directory.GetDirectories(dir))
                        AddFolder(d, true);
                }
            }
            catch (Exception ex)
            {
                Log("读取目录失败：" + ex.Message);
            }
        }

        private static string FormatSize(long bytes)
        {
            if (bytes >= 1048576) return (bytes / 1048576.0).ToString("0.0") + " MB";
            return Math.Max(1, bytes / 1024) + " KB";
        }

        private void PickFiles()
        {
            using (OpenFileDialog dlg = new OpenFileDialog
            {
                Multiselect = true,
                Filter = "图片|*.png;*.jpg;*.jpeg;*.bmp;*.tif;*.tiff;*.gif;*.avif;*.heic|所有文件|*.*"
            })
            {
                if (dlg.ShowDialog() == DialogResult.OK)
                {
                    foreach (string f in dlg.FileNames) AddFile(f);
                    UpdateStatus();
                }
            }
        }

        private void PickFolder()
        {
            using (FolderBrowserDialog dlg = new FolderBrowserDialog { Description = "选择要批量处理的文件夹" })
            {
                if (dlg.ShowDialog() == DialogResult.OK)
                {
                    AddFolder(dlg.SelectedPath, recursiveBox.Checked);
                    UpdateStatus();
                }
            }
        }

        private void ClearQueue()
        {
            if (running) return;
            queued.Clear();
            fileList.Items.Clear();
            logBox.Clear();
            progress.Value = 0;
            statusLabel.Text = "就绪";
        }

        private void UpdateStatus()
        {
            statusLabel.Text = queued.Count == 0
                ? "就绪"
                : string.Format("已加入 {0} 个待处理图片", queued.Count);
        }

        private void Log(string line)
        {
            logBox.AppendText(line + Environment.NewLine);
        }

        private string FindProjectRoot()
        {
            // ① 环境变量
            string env = Environment.GetEnvironmentVariable("IMAGETOOL_PROJECT_ROOT");
            if (!string.IsNullOrEmpty(env) && File.Exists(Path.Combine(env, "scripts", "dev", "image-tool-cli.mjs")))
                return env;

            // ② exe 所在目录及其向上 4 层
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            for (int i = 0; i < 5 && !string.IsNullOrEmpty(dir); i++)
            {
                if (File.Exists(Path.Combine(dir, "scripts", "dev", "image-tool-cli.mjs")))
                    return dir;
                DirectoryInfo parent = Directory.GetParent(dir);
                dir = parent == null ? null : parent.FullName;
            }

            // ③ 当前工作目录
            string cwd = Directory.GetCurrentDirectory();
            if (File.Exists(Path.Combine(cwd, "scripts", "dev", "image-tool-cli.mjs")))
                return cwd;

            return null;
        }

        private async void StartProcess()
        {
            if (running) return;
            if (queued.Count == 0)
            {
                MessageBox.Show("请先添加要处理的图片。", "没有文件", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string root = FindProjectRoot();
            if (root == null)
            {
                MessageBox.Show(
                    "找不到项目目录（需要包含 scripts/dev/image-tool-cli.mjs）。\n\n" +
                    "请把本 exe 放在项目根目录下运行。",
                    "找不到项目", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            running = true;
            startBtn.Enabled = false;
            pickFilesBtn.Enabled = false;
            pickFolderBtn.Enabled = false;
            clearBtn.Enabled = false;
            logBox.Clear();
            progress.Value = 0;
            progress.Maximum = queued.Count;

            foreach (ListViewItem it in fileList.Items) it.SubItems[2].Text = "等待";

            try
            {
                await RunCli(root);
            }
            catch (Exception ex)
            {
                Log("✗ 出错：" + ex.Message);
                MessageBox.Show(ex.Message, "执行失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                running = false;
                startBtn.Enabled = true;
                pickFilesBtn.Enabled = true;
                pickFolderBtn.Enabled = true;
                clearBtn.Enabled = true;
            }
        }

        private async Task RunCli(string root)
        {
            string cli = Path.Combine(root, "scripts", "dev", "image-tool-cli.mjs");

            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = "node",
                Arguments = BuildArguments(cli),
                WorkingDirectory = root,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            Log("运行：" + Path.GetFileName(cli));
            Log("参数：质量 " + qualityBox.Value + "，最大宽度 " + (maxWidthBox.Value == 0 ? "不缩放" : maxWidthBox.Value + "px"));
            Log(new string('─', 60));

            using (Process proc = new Process { StartInfo = psi })
            {
                proc.ErrorDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) BeginInvoke((Action)(() => Log("stderr: " + e.Data))); };

                proc.Start();
                proc.BeginErrorReadLine();

                string line;
                int done = 0;
                while ((line = await proc.StandardOutput.ReadLineAsync()) != null)
                {
                    HandleCliLine(line, ref done);
                }

                await Task.Run(() => proc.WaitForExit());

                if (proc.ExitCode != 0)
                    Log("⚠ node 退出码 " + proc.ExitCode);
            }
        }

        private string BuildArguments(string cli)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append(QuoteArg(cli));
            sb.Append(" --files");
            foreach (string f in queued) sb.Append(' ').Append(QuoteArg(f));
            sb.Append(" --quality ").Append((int)qualityBox.Value);
            if (maxWidthBox.Value > 0)
                sb.Append(" --max-width ").Append((int)maxWidthBox.Value);
            if (deleteOriginBox.Checked) sb.Append(" --delete-original");
            return sb.ToString();
        }

        private static string QuoteArg(string arg)
        {
            if (arg == null) return "\"\"";
            if (arg.Length > 0 && arg.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return arg;

            StringBuilder sb = new StringBuilder();
            sb.Append('"');
            for (int i = 0; i < arg.Length; i++)
            {
                int backslashes = 0;
                while (i < arg.Length && arg[i] == '\\') { backslashes++; i++; }

                if (i == arg.Length)
                {
                    sb.Append('\\', backslashes * 2);
                    break;
                }
                if (arg[i] == '"')
                {
                    sb.Append('\\', backslashes * 2 + 1);
                    sb.Append('"');
                }
                else
                {
                    sb.Append('\\', backslashes);
                    sb.Append(arg[i]);
                }
            }
            sb.Append('"');
            return sb.ToString();
        }

        private void HandleCliLine(string line, ref int done)
        {
            if (!line.TrimStart().StartsWith("{"))
            {
                Log(line);
                return;
            }

            try
            {
                SimpleJson obj = SimpleJson.Parse(line);
                string type = obj.Get("type");

                if (type == "start")
                {
                    Log(string.Format("开始处理 {0} 个文件", obj.Get("total")));
                }
                else if (type == "ok")
                {
                    done++;
                    progress.Value = Math.Min(done, progress.Maximum);
                    string file = obj.Get("file");
                    string saving = obj.Get("saving");
                    string b = obj.Get("beforeKB");
                    string a = obj.Get("afterKB");
                    MarkFile(file, string.Format("✓ {0} → {1} KB（-{2}%）", b, a, saving));
                    Log(string.Format("  ✓ {0}  {1} KB → {2} KB  -{3}%", file, b, a, saving));
                }
                else if (type == "skip")
                {
                    done++;
                    progress.Value = Math.Min(done, progress.Maximum);
                    string file = obj.Get("file");
                    MarkFile(file, "– 跳过：" + obj.Get("reason"));
                    Log(string.Format("  – {0}  跳过：{1}", file, obj.Get("reason")));
                }
                else if (type == "fail")
                {
                    done++;
                    progress.Value = Math.Min(done, progress.Maximum);
                    string file = obj.Get("file");
                    MarkFile(file, "✗ " + obj.Get("message"));
                    Log(string.Format("  ✗ {0}  失败：{1}", file, obj.Get("message")));
                }
                else if (type == "deleted")
                {
                    Log("    已删除原图：" + obj.Get("file"));
                }
                else if (type == "done")
                {
                    Log(new string('─', 60));
                    Log(string.Format(
                        "完成：成功 {0}，跳过 {1}，失败 {2}",
                        obj.Get("ok"), obj.Get("skip"), obj.Get("fail")));
                    if (obj.Has("savedKB"))
                        Log(string.Format("总体积 {0} KB → {1} KB，节省 {2} KB",
                            obj.Get("origKB"), obj.Get("newKB"), obj.Get("savedKB")));
                    statusLabel.Text = string.Format("完成 · 成功 {0} / 跳过 {1} / 失败 {2}",
                        obj.Get("ok"), obj.Get("skip"), obj.Get("fail"));
                }
                else if (type == "fatal")
                {
                    Log("✗ " + obj.Get("message"));
                }
            }
            catch
            {
                Log(line);
            }
        }

        private void MarkFile(string fileName, string status)
        {
            foreach (ListViewItem it in fileList.Items)
            {
                if (string.Equals(it.Text, fileName, StringComparison.OrdinalIgnoreCase))
                {
                    it.SubItems[2].Text = status;
                    fileList.Invalidate(it.Bounds);
                    break;
                }
            }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }

        // ── 内置 Base64 插画（72x72 高清矢量渲染的小清新图片插图） ──
        private const string EmbeddedIllustrationBase64 =
            "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAACXBIWXMAAAsTAAALEwEAmpwYAAAfH0lEQVR4nO2dB3QU193290358n1G" +
            "67gAiV9InIAj28TGwY5tHEMM2MbGmI6MsSHCyGAgVNFBIECiChBFAgQSqEurtmqogirqvVdQAdERArVV4/nO/96Z3VlpBQKxBp/DnPM7" +
            "u5yDdu/9Pff+587s7KxM9mx7tj3bnm3Ptmfbs+3Z9mx7tj3bnm292/7nIfjVU8bDtP2p2XQJ/bVMJvuNwG8F/o+aJbLfPdXIJG3VtF/s" +
            "z6+7CeypEs+FL5H9brbf4ZcPVUTPPHgxYfeRS6muJ2pSve2vZHQiXSfHrqRqc6kbqqWkaHFIi6SuVHXlQEWi997yWBerstjd6wvPfGvi" +
            "efIlSTC/fRqC6E48kz4r3Ln/wZpkC5ua5Jz9FxNatlVHY31lBJafD8XS8yGccuK0FovLg7G4TEKpSJCahURJoIZiKQEaivwxT6SwM0pO" +
            "AeHHyef8IGBSoMSiwkCsKg7F1vKzKsuymByrkqhtMwP39pWE0V0QP5t8zYhfIvvdJOWkF2wvJR07UJNYu6EyEsvPh6hZwjjNKSeCOWWc" +
            "RVoEYVGpSCAWlXB+KgnQplhCkb8EJUxECiUUECTXDyYkOd9XC2MiT8QHxrki3oz/FgTAouxM7a7yWNtJ1pNeEILoPCP0GkJn+bzUGMn+" +
            "3+4L5yYerkm6uKYiQiP6fDAWEeUSRMESFpQFYkGphBKRADXzSvwxr1hCkVI3hX74QaTAV0N+Z3w4eYQ3ZhG5uvDCrBwRBWZlK/BTnhK7" +
            "y6OrV2aHT6C+65gNegmhq3waAfNlz1lXJ23fcSlWtfh8MP5LlBNBWKAmkFMmgckOwDyCCRYkSxFkzy1WYm6RFD8Nhb4aCnzxH5F8n054" +
            "c/Ik5BJe+E6NgpMj4onvsiVkiXjg+ywPrCsKU+0qPmNBDiSzQS8hdCv/YFWi7caqMx0LOgmfR5QRARwm258jCJ6rhZKLZmgEzyny1aZQ" +
            "QoGPhnxvfK+LPC8NuYRCgidmEDkSskU8MCNLxF2bTBE3LMnz79hQFGGjzxB0y58l67O/MsFyfWVkx/zyAMwv02BSKuIvQQmTEhE/zCmW" +
            "UCRFI3t2oY+GAm9t8jXMzPfSkKfQkOupmxxPTM/x4GQT7pwsXbhheqaIK6ZniLhgeroLJqa7YF6esmNNUfhWfYUgvoDWyN9xPvrrLVXR" +
            "qh/L/CHlh1IRJX4oEfHDD8UivviPlCIJhT6M74kCb92wke3FyfPCjDyFBE+OOLK1RrcHH9XZHpia7S7BDVOzJGRKccXUDBEXCc6Ymu6M" +
            "r0XSnLE4L7DlvxlBE3WE0KsApKOfLzPny557z25+X6vq+GqTMiXmlhJ+DOMSXfjCuFjEB7OKRLwxq7ArM4kCLw35Cg15nlpMF8klPDhs" +
            "ZLtzxJGd7aZmMpEl4orJmSIumJwhxVlDuoQ0J8Y4ItVRzVepjlhfFFb53vz5fVkImh1zr2aBdukxlv1fmZGRwb7q+CMLy4NgTNJLfRmz" +
            "SkR8MKtYgkQ4k8vw0qZAwfiGyJeQ5ynBQ0OuB6bkunNyJGQTbhJcOVmcCVkumJAp4owJGbpwwoR0CWmOGlJPMcYSKZ05ianprlhdEH6I" +
            "HDEXXUvRIwfwG173Z/UZ43h0wLaqqFuzS3wxu8SH8V0x4c0pEvHSUKjADLVcqVRPJpOYynDXkOOmIVtClhsmZrlyMgkXCc6cDAnpnHHp" +
            "wqhlOEo4hXGpIicxLkXDVyKpp9TPP2U4aEi25yRxlucG3Ryzz3IAuRJKkXQWPPQmjn621pd9+eXz28vPWv5UHojvS7wZ3xYTXpwiCYVe" +
            "+LZAgen5npie78Fq+/rycFhUxsCyIhqWFVGwvMDZxjir4Xw3lJ/BZpEyIrIrpV3ZUBqBDSUi4RLCsKFYQpFAcTiW5QdiSpozvki1xxdJ" +
            "9hidbI/RKQ78USTphDaJJzAp1RnLcoK2kCvJMYI4C3o3+mWffPLCjuq4zJnFXiCMiggFp1DEk1PggSkFbmwFE1FbhpZ77filbaqOdgRf" +
            "LWT1fWSyHf6deBz/TjrBoedSEuw45+ywKjcgg1z1dhZoVj6U5MSJ8pF7N/5pfUVE0zdFCkxjeHIKCQ9OgQem5btjUr4rZhV4o7L5NutM" +
            "R8c93GluQ23jL4M7zW2szbSVN9zCuOST+DjxKEYkHMOIRIEEgXMC8cRRzMvya/rEfMlAcibMAumK6KECUK98ZJ999vsNeUH/WVAegMmF" +
            "Hpjc6M4pkJDvjsl5bvg61xXjc10RfrOUdaC5pR01d1tRVd/xi6LmbitrO23Ky/kYfu4oPoo/go/OEUf5Y7xAHGHLmJLiDJNEr+/ImWRF" +
            "9IgB0BSivfr48S+aF5/ZM7PYG5MK3TkFhBsnnzM+zwVf5TrBKM+dlR0aRb9E+VWSEDru3YOqow1jEuzwQbwNPoyzxYfxEujfcTb4MJbz" +
            "aYIdFmYE7CRnzJ2mDD10AHzpSVPp009f3n4+ymlifirfF1/nS8gjXDCSyHHE57mn8FnmKawrDWONvs0CaP9Fc7upFfVlYaYS78TY4J+x" +
            "B/BPooAYEmWN57P8eQDDogQWZYV4kTPOjB4xAHX9TzuTCR/+YWNZhO+nOafAOYlR2SIOGJNpj1GZ9vh4VJY9RhUFqQPoYkP700NDM+pr" +
            "b1/GxbpbeeE5eT+KMsfy/AD8Pfow3orzxluRPvgwK4DPY1kUe4xVFMCEj/7A3D1yAOL6n3YmEz78w8ayMN9Pc06BcxKjckQcMCbbHqMy" +
            "7fFx5jGMypLw0Uexz4AAYgDfJrlgcPieRz4W+Efycfwx9RhGpIv4e+pRhP2Tehyfp3vj9fMhWJkfhJW53vxjSZgAmPBRAODsEQPwV44B" +
            "qFdg+eXv831vX/j4wve5J8A5idHZIg4YlWWPTzOPYWTacbwv4gE0Nrc+3f7T/v+U1QGoe3/vO1vU+RmiMWQEmvLGoTXzY7TkjUMryZ/X" +
            "7f3U/2tY8bQAWJofKAcgRz18AMKJAWj23Y98fOEr4fvbTzOPgmOH4RkiB8cM9187gpFpx/Fuii0W5/s/VfTdB9AUNgTNkUORH3QzmtOH" +
            "ozVpFFpJk9CUPv6e9b87gPZfNYA71P1fnhfEAxD98AEMi/h9vv+V4wtfaQGMy3PBuDxnjM8WcUDvY1/lOmJ0pj2Gp9rgH8m2WFDgLwbQ" +
            "1ILfFvdA2+1y1DuHoDlsONTRH6M57VNY5k1AS8oYtBRPQkvueKjiRyF/8Apoip4M1bnROl/f7fXfCUD7r/l7/B4B+H3OAbzy0ccXvhK+" +
            "Eia4YEKuC36V7wLjfFeMzxY4juPzJHzG8X/MtcfoVBuMTT2CV5NtsTjfl79+685l3PnZ2v03ovb6YdQ5BaEhdDgaxEno+XwcWnInoDV7" +
            "HFrzxqEt8xO05E3Q+Rri733/U37vI4DvczwFAP9Z1O1/F738fX4vvhL+knMCk3OdaI4LJud7sID4iZnj8l3wh4wTGJ1qg3ekDqB11+7f" +
            "vE7w9iFodApBQ5gBDb4j0JA8Ao1pI9GSOxGtzP+0MdBf/o+H1P+7ACjxB/B/4bvxzwhr/CWK4a/h1vghbAfeCt/NX2PvxKvh7vhL6B4M" +
            "iNyDV8/uxZvh/O+1sJ14LfxDvhI+D9uJt8P38gCsMCRw330A2r9rAC1372DXvd8v12v+E6/vYgHkP9r7646545uQ3fg2aCd+E7ILbwTs" +
            "whuh/O+bYXvwh7C9eCVkHwYf3YOBYQcw8NA+DAzfh1dDf8Brh/aT/YgH/hK+D29H7Me/Yg9j2M8H0HQ3GvW3eACV2tv1v5b3h+Bq0z02" +
            "tD6q9w/0f3f58T+E7sfvQ3/E7w/vwwCh30/2k/fhe/Bf4fvwp5ADGHh0AAYe2ofXj+7D65E/4PXIvRgYvQ+vh+zB/8P2483YA7z4v/8C" +
            "2Hb7H7jf3ozbTQ34hby/p2/fX1qf1vuP9n6P3186vAe/j/gBAw8fwMDDB/DGEX5/4Mg+DAzZjYFh+/F38fFvx36Pf5B3Yn/E/9z34wH8" +
            "8/A+/D1mH96K3Y+3ovdg0I/7+b8ffgBtT8j7F2t/LdG/7vF7//f1fs77YQfw2qE9eOXgXgwc2YvXI/bhd+F/wKvhf8Crod/j9YN78drh" +
            "vRgYsg+vh+/FGyG78bvj+/B38ePvxv+Af0Tuw4DYfRgYtw8Dw/djwLE9GDh2H149/n3vX+5/fPtf7vf0/Uf7Pv07BODtI9/jL9E/4u0j" +
            "e/B2yF68fuI+vB6xF2+EvYfB4X/EWwffx8DR/XjtqHjs93jd8n68E7wfAyIP4H8i9+Pv0Qcw4Nge/P3I7/Hqkdv3F3Hvf7f/ffjfA+A/" +
            "8/vfjvgefx91EAMi92PA0b147cB3eO3gd3jt8H3467FvMSBqHwacvA9vHtyPt8P3YmDcPrwRvRdvRf2Av8Xsxd/E/4dF3y+M6A8fP/bL" +
            "B7D77m1UNd28Z/n7k9d79P7O1g9Q+f1iVO7fisp9W/j9vlZU7tuKyj33eP2vVbntx/L1fH+71/N9/07vfx+73r7v9t+/d5vf17bivsX7" +
            "PZ39X1/f8fvL9d1/X836263889pmlO3fgn/u34rvDq3H6gPrsfbAWnx/cB1W71+PVfvX4fv9a/D9/tVYvf86Vu1fh7/uWYV/7l+P1QfW" +
            "Y+X+tVi1fx1W7FuPVfvWY8W+9fizfT7978O/9t973s3nvdv19/5n/67/V+xbi79b/sD1lq955PvWv/O5WfV9V+X96+5/btb9/v/V9695" +
            "n/s9vd+99T3z6vufv9v7398939/53757/7fv/g+/9/3/8e9/9/k7339/9/y9v9/7/v9719/b95/3/t3//n37/vP33v/83fv//ve737/r" +
            "/rvn73r/3r/b77u7/vffv+v/e7v/rnv/3ffv/v++n/v/v/v/3e+/d9/7v7e8/x/+70v/G4D/fQLw90sB/G+bAHwQ+F0g/F0A/B9Q8G8E" +
            "/xvwf/k/f+f/3v7fe78v/7u7//e+e8/d/v/w/r3f7/r73u+/u+/f9e++f/fe77v/e5+73n+/+/7d77+/+/3vf/7u/Xv/7/r/3u8f/Pvv" +
            "/v/d53/fve/u+/e++/299x/5+93nf9/9/vvv/+H/Xv7vAPwXAfivAvBfAgAAAABJRU5ErkJggg==";
    }

    /// <summary>极简 JSON 解析器</summary>
    internal class SimpleJson
    {
        private readonly Dictionary<string, string> map = new Dictionary<string, string>();

        public bool Has(string key) { return map.ContainsKey(key); }
        public string Get(string key)
        {
            string v;
            return map.TryGetValue(key, out v) ? v : "";
        }

        public static SimpleJson Parse(string json)
        {
            SimpleJson result = new SimpleJson();
            int i = json.IndexOf('{');
            if (i < 0) return result;
            i++;

            while (i < json.Length)
            {
                while (i < json.Length && (char.IsWhiteSpace(json[i]) || json[i] == ',')) i++;
                if (i >= json.Length || json[i] == '}') break;
                if (json[i] != '"') break;
                i++;

                // key
                StringBuilder key = new StringBuilder();
                while (i < json.Length && json[i] != '"')
                {
                    if (json[i] == '\\' && i + 1 < json.Length) { i++; }
                    key.Append(json[i]);
                    i++;
                }
                i++; // skip quote
                while (i < json.Length && json[i] != ':') i++;
                i++; // skip colon
                while (i < json.Length && char.IsWhiteSpace(json[i])) i++;

                // value
                string value;
                if (i < json.Length && json[i] == '"')
                {
                    i++;
                    StringBuilder sb = new StringBuilder();
                    while (i < json.Length && json[i] != '"')
                    {
                        if (json[i] == '\\' && i + 1 < json.Length)
                        {
                            i++;
                            char c = json[i];
                            if (c == 'n') sb.Append('\n');
                            else if (c == 't') sb.Append('\t');
                            else if (c == 'r') sb.Append('\r');
                            else if (c == 'u' && i + 4 < json.Length)
                            {
                                sb.Append((char)Convert.ToInt32(json.Substring(i + 1, 4), 16));
                                i += 4;
                            }
                            else sb.Append(c);
                        }
                        else sb.Append(json[i]);
                        i++;
                    }
                    i++;
                    value = sb.ToString();
                }
                else
                {
                    StringBuilder sb = new StringBuilder();
                    while (i < json.Length && json[i] != ',' && json[i] != '}')
                    {
                        sb.Append(json[i]);
                        i++;
                    }
                    value = sb.ToString().Trim();
                    if (value == "null") value = "";
                }

                result.map[key.ToString()] = value;
            }

            return result;
        }
    }
}
