using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace MyrzgGachaExporter
{
    public class GachaItem
    {
        public long Id;
        public string TypeId;
        public string PoolId;
        public long CrateAt;
        public long At;
    }

    public enum DoodleIconType
    {
        None,
        AutoPlay,   // 播放星芒手绘
        Globe,      // 浏览器与地球手绘
        Copy,       // 双卡片 (羊皮纸 Wiki 手绘图标)
        Folder,     // 收纳小宝箱 (羊皮纸 Wiki 手绘图标)
        Refresh     // 手绘旋转环形箭头 (重连手绘图标)
    }

    // ================= 现代化羊皮纸风格自绘按钮 (100% 消除黑角) =================
    public class ParchmentButton : Button
    {
        public DoodleIconType IconType { get; set; }
        public Color BaseColor { get; set; }
        public Color HoverColor { get; set; }
        public Color PressedColor { get; set; }
        public Color TextColor { get; set; }
        public Color BorderColor { get; set; }
        public int CornerRadius { get; set; }

        private bool isHover = false;
        private bool isPressed = false;

        public ParchmentButton()
        {
            this.SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            this.Cursor = Cursors.Hand;
            this.Font = new Font("微软雅黑", 9.5f, FontStyle.Bold);
            this.CornerRadius = 7;
            this.BaseColor = Color.FromArgb(237, 227, 210);      // 浅羊皮纸底色
            this.HoverColor = Color.FromArgb(226, 214, 194);
            this.PressedColor = Color.FromArgb(215, 200, 176);
            this.TextColor = Color.FromArgb(62, 42, 20);           // 深棕墨水色
            this.BorderColor = Color.FromArgb(200, 182, 159);     // 柔和描边
            this.IconType = DoodleIconType.None;

            this.FlatStyle = FlatStyle.Flat;
            this.FlatAppearance.BorderSize = 0;
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            isHover = true;
            Invalidate();
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            isHover = false;
            isPressed = false;
            Invalidate();
        }

        protected override void OnMouseDown(MouseEventArgs mevent)
        {
            base.OnMouseDown(mevent);
            isPressed = true;
            Invalidate();
        }

        protected override void OnMouseUp(MouseEventArgs mevent)
        {
            base.OnMouseUp(mevent);
            isPressed = false;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

            // 1. 彻底解决 4 角黑色问题：先用父容器底色填充满整个矩形，消除未绘制的黑像素！
            Color parentColor = this.Parent != null ? this.Parent.BackColor : Color.FromArgb(245, 238, 222);
            using (SolidBrush parentBrush = new SolidBrush(parentColor))
            {
                g.FillRectangle(parentBrush, 0, 0, this.Width, this.Height);
            }

            Color currentBg = isPressed ? PressedColor : (isHover ? HoverColor : BaseColor);

            // 2. 绘制平滑圆角矩形按钮主体
            Rectangle rect = new Rectangle(0, 0, this.Width - 1, this.Height - 1);
            using (GraphicsPath path = CreateRoundRectPath(rect, CornerRadius))
            {
                using (SolidBrush bgBrush = new SolidBrush(currentBg))
                {
                    g.FillPath(bgBrush, path);
                }
                using (Pen bPen = new Pen(BorderColor, 1.2f))
                {
                    g.DrawPath(bPen, path);
                }
            }

            int iconLeft = 14;
            int textLeft = 14;

            // 3. 绘制手绘矢量线稿图标
            if (IconType != DoodleIconType.None)
            {
                textLeft = 38;
                DrawDoodleIcon(g, iconLeft, this.Height / 2 - 9, 18, 18);
            }

            // 4. 绘制文字
            Rectangle textRect = new Rectangle(textLeft, 0, this.Width - textLeft - 8, this.Height);
            TextRenderer.DrawText(g, this.Text, this.Font, textRect, TextColor,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        private void DrawDoodleIcon(Graphics g, int x, int y, int w, int h)
        {
            Color iconColor = TextColor;
            using (Pen pen = new Pen(iconColor, 1.8f))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                pen.LineJoin = LineJoin.Round;

                switch (IconType)
                {
                    case DoodleIconType.AutoPlay:
                        // 手绘播放三角形 + 星芒
                        Point[] tri = new Point[] {
                            new Point(x + 3, y + 2),
                            new Point(x + 14, y + 9),
                            new Point(x + 3, y + 16)
                        };
                        using (SolidBrush fillB = new SolidBrush(iconColor))
                        {
                            g.FillPolygon(fillB, tri);
                        }
                        g.DrawPolygon(pen, tri);
                        break;

                    case DoodleIconType.Globe:
                        // 手绘地球/Wiki 经纬环
                        g.DrawEllipse(pen, x + 1, y + 1, 15, 15);
                        g.DrawLine(pen, x + 1, y + 8, x + 16, y + 8);
                        g.DrawEllipse(pen, x + 5, y + 1, 7, 15);
                        break;

                    case DoodleIconType.Copy:
                        // 手绘双卡片 (图3第一枚手绘图标风格)
                        g.DrawRectangle(pen, x + 5, y + 1, 10, 11);
                        Rectangle frontCard = new Rectangle(x + 2, y + 5, 10, 11);
                        using (SolidBrush cardBg = new SolidBrush(isHover ? HoverColor : BaseColor))
                        {
                            g.FillRectangle(cardBg, frontCard);
                        }
                        g.DrawRectangle(pen, frontCard);
                        break;

                    case DoodleIconType.Folder:
                        // 手绘小宝箱/收纳箱 (图3小宝箱风格)
                        Point[] boxBody = new Point[] {
                            new Point(x + 3, y + 6),
                            new Point(x + 14, y + 6),
                            new Point(x + 13, y + 16),
                            new Point(x + 4, y + 16)
                        };
                        g.DrawPolygon(pen, boxBody);
                        g.DrawLine(pen, x + 1, y + 5, x + 16, y + 5);
                        g.DrawLine(pen, x + 7, y + 10, x + 10, y + 10);
                        break;

                    case DoodleIconType.Refresh:
                        // 手绘环形旋转箭头
                        g.DrawArc(pen, x + 2, y + 2, 12, 12, -40, 275);
                        Point[] arr = new Point[] {
                            new Point(x + 12, y + 1),
                            new Point(x + 15, y + 5),
                            new Point(x + 10, y + 6)
                        };
                        using (SolidBrush ab = new SolidBrush(iconColor))
                        {
                            g.FillPolygon(ab, arr);
                        }
                        g.DrawPolygon(pen, arr);
                        break;
                }
            }
        }

        private static GraphicsPath CreateRoundRectPath(Rectangle rect, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            int diameter = radius * 2;
            path.AddArc(rect.X, rect.Y, diameter, diameter, 180, 90);
            path.AddArc(rect.Right - diameter, rect.Y, diameter, diameter, 270, 90);
            path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(rect.X, rect.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    // ================= 现代化羊皮纸圆角卡片面板 (100% 消除黑角) =================
    public class ParchmentCardPanel : Panel
    {
        public int CornerRadius { get; set; }
        public Color BorderColor { get; set; }
        public Color FillColor { get; set; }

        public ParchmentCardPanel()
        {
            this.SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            this.CornerRadius = 10;
            this.FillColor = Color.FromArgb(255, 253, 248);       // 亮色核心羊皮纸
            this.BorderColor = Color.FromArgb(216, 199, 176);     // 雅致暖金棕描边
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            // 1. 先用父容器底色涂满，彻底杜绝 4 个圆角处的黑底
            Color parentColor = this.Parent != null ? this.Parent.BackColor : Color.FromArgb(245, 238, 222);
            using (SolidBrush parentBrush = new SolidBrush(parentColor))
            {
                g.FillRectangle(parentBrush, 0, 0, this.Width, this.Height);
            }

            // 2. 绘制圆角卡片主体
            Rectangle rect = new Rectangle(0, 0, this.Width - 1, this.Height - 1);
            using (GraphicsPath path = new GraphicsPath())
            {
                int d = CornerRadius * 2;
                path.AddArc(rect.X, rect.Y, d, d, 180, 90);
                path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
                path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
                path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
                path.CloseFigure();

                using (SolidBrush bgBrush = new SolidBrush(FillColor))
                {
                    g.FillPath(bgBrush, path);
                }
                using (Pen bPen = new Pen(BorderColor, 1.2f))
                {
                    g.DrawPath(bPen, path);
                }
            }
        }
    }

    // ================= 现代化圆润进度条 (100% 消除黑角) =================
    public class ParchmentProgressBar : Control
    {
        private int min = 0;
        private int max = 100;
        private int val = 0;
        public Color FillColor { get; set; }
        public Color TrackColor { get; set; }

        public int Minimum { get { return min; } set { min = value; Invalidate(); } }
        public int Maximum { get { return max; } set { max = value; Invalidate(); } }
        public int Value { get { return val; } set { val = Math.Max(min, Math.Min(max, value)); Invalidate(); } }

        public ParchmentProgressBar()
        {
            this.SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            this.FillColor = Color.FromArgb(85, 117, 116);      // 湖泊暗青 --accent
            this.TrackColor = Color.FromArgb(234, 223, 206);     // 凹槽暖底色
            this.Height = 8;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            // 1. 先用卡片底色涂满
            Color parentColor = this.Parent != null ? this.Parent.BackColor : Color.FromArgb(255, 253, 248);
            using (SolidBrush parentBrush = new SolidBrush(parentColor))
            {
                g.FillRectangle(parentBrush, 0, 0, this.Width, this.Height);
            }

            int r = Math.Max(2, this.Height / 2);
            Rectangle rect = new Rectangle(0, 0, this.Width - 1, this.Height - 1);
            using (GraphicsPath trackPath = CreateRoundRectPath(rect, r))
            {
                using (SolidBrush tb = new SolidBrush(TrackColor))
                {
                    g.FillPath(tb, trackPath);
                }

                if (max > min && val > min)
                {
                    float pct = (float)(val - min) / (max - min);
                    int fillWidth = (int)Math.Max(this.Height, this.Width * pct);
                    Rectangle fillRect = new Rectangle(0, 0, fillWidth - 1, this.Height - 1);
                    using (GraphicsPath fillPath = CreateRoundRectPath(fillRect, r))
                    using (SolidBrush fb = new SolidBrush(FillColor))
                    {
                        g.FillPath(fb, fillPath);
                    }
                }
            }
        }

        private static GraphicsPath CreateRoundRectPath(Rectangle rect, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            int diameter = radius * 2;
            path.AddArc(rect.X, rect.Y, diameter, diameter, 180, 90);
            path.AddArc(rect.Right - diameter, rect.Y, diameter, diameter, 270, 90);
            path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(rect.X, rect.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    public class MainForm : Form
    {
        // UI 控件
        private Panel panelHeader;
        private Label lblHeaderTitle;
        private Label lblStatusRight;

        private ParchmentCardPanel panelHeroCard;
        private Label lblHeroTag;
        private Label lblHeroTarget;
        private Label lblHeroCount;
        private Label lblHeroPercent;
        private ParchmentProgressBar pbHero;

        private ParchmentCardPanel panelPetCard;
        private Label lblPetTag;
        private Label lblPetTarget;
        private Label lblPetCount;
        private Label lblPetPercent;
        private ParchmentProgressBar pbPet;

        private Panel panelLogContainer;
        private Label lblLogTitle;
        private TextBox txtLogs;

        private ParchmentButton btnAutoPage;
        private ParchmentButton btnExportAndOpen;
        private ParchmentButton btnCopyJson;
        private ParchmentButton btnOpenFolder;
        private ParchmentButton btnReconnect;

        // 后台抓包与状态 (从 0 开始全新抓取，绝不继承本地旧数据)
        private string adbPath = "";
        private string targetDevice = "";
        private string playerId = "";
        private string playerNick = "";
        private int heroTotal = 0;
        private int petTotal = 0;
        private string activePoolContext = "hero"; // 当前活跃卡池上下文 ("hero" 或 "pet")
        private Process snifferProcess = null;
        private StringBuilder rawBuffer = new StringBuilder();
        private Dictionary<long, GachaItem> recordsMap = new Dictionary<long, GachaItem>();
        private bool isAutoPaging = false;
        private Thread autoPageThread = null;
        private string outputPath = "";

        public MainForm()
        {
            InitializeComponent();
            outputPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "gacha_records.json");

            // 直接提取自身 PE 内置的可爱史莱姆图标
            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch
            {
                try
                {
                    string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
                    if (File.Exists(icoPath)) this.Icon = new Icon(icoPath);
                }
                catch { }
            }

            // 严格不继承任何本地旧数据，从 0 条起步！
            recordsMap.Clear();
            UpdateBoardUI();
            UpdateStatusRightUI();

            this.Shown += (s, e) => {
                new Thread(InitSniffer).Start();
            };

            this.FormClosing += (s, e) => {
                isAutoPaging = false;
                StopSniffer();
            };
        }

        private void InitializeComponent()
        {
            this.Text = "深渊大书院 · 抽卡记录一键导出工具";
            this.Size = new Size(785, 590);
            this.MinimumSize = new Size(760, 550);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(245, 238, 222); // 羊皮纸主底色 --paper-light (#F5EEDE)
            this.Font = new Font("微软雅黑", 9f, FontStyle.Regular);

            // ================= 1. 顶部深色原木导航头 (已移除副标题，单行高度 52px 精致对齐) =================
            panelHeader = new Panel();
            panelHeader.Dock = DockStyle.Top;
            panelHeader.Height = 52;
            panelHeader.BackColor = Color.FromArgb(43, 31, 21); // 深色原木 --wood (#2B1F15)
            panelHeader.Paint += (s, e) => {
                using (Pen pen = new Pen(Color.FromArgb(163, 111, 10), 1.5f))
                {
                    e.Graphics.DrawLine(pen, 0, panelHeader.Height - 1, panelHeader.Width, panelHeader.Height - 1);
                }
            };

            lblHeaderTitle = new Label();
            lblHeaderTitle.Text = "✦ 深渊大书院 · 抽卡记录一键导出工具 ✦";
            lblHeaderTitle.Font = new Font("微软雅黑", 11.5f, FontStyle.Bold);
            lblHeaderTitle.ForeColor = Color.FromArgb(248, 238, 220); // 米白正文
            lblHeaderTitle.Location = new Point(18, 15);
            lblHeaderTitle.AutoSize = true;

            // 重新连接按钮 (深色原木质感，紧邻状态文本左侧)
            btnReconnect = new ParchmentButton();
            btnReconnect.Text = "重新连接";
            btnReconnect.IconType = DoodleIconType.Refresh;
            btnReconnect.Font = new Font("微软雅黑", 8.5f, FontStyle.Bold);
            btnReconnect.Size = new Size(104, 26);
            btnReconnect.CornerRadius = 5;
            btnReconnect.BaseColor = Color.FromArgb(59, 43, 30);      // 深金木棕
            btnReconnect.HoverColor = Color.FromArgb(88, 63, 44);     // 高光浅木
            btnReconnect.PressedColor = Color.FromArgb(43, 31, 21);
            btnReconnect.BorderColor = Color.FromArgb(163, 111, 10);  // 金铜描边
            btnReconnect.TextColor = Color.FromArgb(254, 243, 199);    // 米金高亮
            btnReconnect.Location = new Point(430, 13);
            btnReconnect.Click += BtnReconnect_Click;

            // 右侧状态：单行紧凑排列设备状态与玩家身份
            lblStatusRight = new Label();
            lblStatusRight.Text = "● 正在探测模拟器...";
            lblStatusRight.Font = new Font("微软雅黑", 9f, FontStyle.Bold);
            lblStatusRight.ForeColor = Color.FromArgb(217, 119, 6); // 琥珀黄
            lblStatusRight.AutoSize = true;
            lblStatusRight.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            lblStatusRight.Location = new Point(540, 17);

            panelHeader.Controls.Add(lblHeaderTitle);
            panelHeader.Controls.Add(btnReconnect);
            panelHeader.Controls.Add(lblStatusRight);
            panelHeader.Resize += (s, e) => {
                lblStatusRight.Left = panelHeader.ClientSize.Width - lblStatusRight.Width - 18;
                btnReconnect.Left = lblStatusRight.Left - btnReconnect.Width - 12;
            };

            // ================= 2. 卡池看板区 (严格对称、对齐的圆角卡片) =================
            // 窗体总有效宽度 734px (从 18px 到 752px)，两张卡片各宽 360px，间距 14px
            int cardW = 360;
            int cardH = 92;
            int cardY = 66;

            // -------- A. 伙伴招募卡片 --------
            panelHeroCard = new ParchmentCardPanel();
            panelHeroCard.Location = new Point(18, cardY);
            panelHeroCard.Size = new Size(cardW, cardH);

            lblHeroTag = new Label();
            lblHeroTag.Text = "伙伴招募池";
            lblHeroTag.Font = new Font("微软雅黑", 8.5f, FontStyle.Bold);
            lblHeroTag.ForeColor = Color.FromArgb(85, 117, 116); // 湖泊暗青
            lblHeroTag.BackColor = Color.FromArgb(235, 243, 243);
            lblHeroTag.Location = new Point(16, 12);
            lblHeroTag.Padding = new Padding(4, 2, 4, 2);
            lblHeroTag.AutoSize = true;

            // 改为 "目标数量"
            lblHeroTarget = new Label();
            lblHeroTarget.Text = "目标数量: 等待游戏内刷新";
            lblHeroTarget.Font = new Font("微软雅黑", 8.5f, FontStyle.Regular);
            lblHeroTarget.ForeColor = Color.FromArgb(122, 98, 72);
            lblHeroTarget.AutoSize = true;
            lblHeroTarget.Location = new Point(cardW - 170, 14);

            // 严格左对齐在 x = 16
            lblHeroCount = new Label();
            lblHeroCount.Text = "0 条";
            lblHeroCount.Font = new Font("微软雅黑", 16f, FontStyle.Bold);
            lblHeroCount.ForeColor = Color.FromArgb(43, 31, 21); // 浓郁深木
            lblHeroCount.Location = new Point(16, 36);
            lblHeroCount.AutoSize = true;

            lblHeroPercent = new Label();
            lblHeroPercent.Text = "0%";
            lblHeroPercent.Font = new Font("微软雅黑", 9f, FontStyle.Bold);
            lblHeroPercent.ForeColor = Color.FromArgb(85, 117, 116);
            lblHeroPercent.AutoSize = true;
            lblHeroPercent.Location = new Point(cardW - 48, 44);

            pbHero = new ParchmentProgressBar();
            pbHero.Location = new Point(16, 70);
            pbHero.Size = new Size(cardW - 32, 8);
            pbHero.FillColor = Color.FromArgb(85, 117, 116); // 翡翠湖青

            panelHeroCard.Controls.Add(lblHeroTag);
            panelHeroCard.Controls.Add(lblHeroTarget);
            panelHeroCard.Controls.Add(lblHeroCount);
            panelHeroCard.Controls.Add(lblHeroPercent);
            panelHeroCard.Controls.Add(pbHero);

            // -------- B. 魔物贩售卡片 --------
            panelPetCard = new ParchmentCardPanel();
            panelPetCard.Location = new Point(18 + cardW + 14, cardY);
            panelPetCard.Size = new Size(cardW, cardH);

            lblPetTag = new Label();
            lblPetTag.Text = "魔物贩售池";
            lblPetTag.Font = new Font("微软雅黑", 8.5f, FontStyle.Bold);
            lblPetTag.ForeColor = Color.FromArgb(184, 123, 40); // 暖金
            lblPetTag.BackColor = Color.FromArgb(254, 245, 231);
            lblPetTag.Location = new Point(16, 12);
            lblPetTag.Padding = new Padding(4, 2, 4, 2);
            lblPetTag.AutoSize = true;

            // 改为 "目标数量"
            lblPetTarget = new Label();
            lblPetTarget.Text = "目标数量: 等待游戏内刷新";
            lblPetTarget.Font = new Font("微软雅黑", 8.5f, FontStyle.Regular);
            lblPetTarget.ForeColor = Color.FromArgb(122, 98, 72);
            lblPetTarget.AutoSize = true;
            lblPetTarget.Location = new Point(cardW - 170, 14);

            // 严格左对齐在 x = 16
            lblPetCount = new Label();
            lblPetCount.Text = "0 条";
            lblPetCount.Font = new Font("微软雅黑", 16f, FontStyle.Bold);
            lblPetCount.ForeColor = Color.FromArgb(43, 31, 21);
            lblPetCount.Location = new Point(16, 36);
            lblPetCount.AutoSize = true;

            lblPetPercent = new Label();
            lblPetPercent.Text = "0%";
            lblPetPercent.Font = new Font("微软雅黑", 9f, FontStyle.Bold);
            lblPetPercent.ForeColor = Color.FromArgb(217, 119, 6);
            lblPetPercent.AutoSize = true;
            lblPetPercent.Location = new Point(cardW - 48, 44);

            pbPet = new ParchmentProgressBar();
            pbPet.Location = new Point(16, 70);
            pbPet.Size = new Size(cardW - 32, 8);
            pbPet.FillColor = Color.FromArgb(217, 119, 6); // 温暖金橙

            panelPetCard.Controls.Add(lblPetTag);
            panelPetCard.Controls.Add(lblPetTarget);
            panelPetCard.Controls.Add(lblPetCount);
            panelPetCard.Controls.Add(lblPetPercent);
            panelPetCard.Controls.Add(pbPet);

            // ================= 3. 操作按钮区 (横向总宽 734px，与上方卡片与下方日志 100% 对齐) =================
            int btnY = 170;
            int btnH = 40;
            int bGap = 12;
            int b1W = 230;
            int b2W = 230;
            int b3W = 125;
            int b4W = 125; // 230 + 12 + 230 + 12 + 125 + 12 + 125 = 734px

            // 1. 全自动翻页
            btnAutoPage = new ParchmentButton();
            btnAutoPage.IconType = DoodleIconType.AutoPlay;
            btnAutoPage.Text = "一键全自动翻页 (代点防漏)";
            btnAutoPage.Location = new Point(18, btnY);
            btnAutoPage.Size = new Size(b1W, btnH);
            btnAutoPage.BaseColor = Color.FromArgb(72, 107, 106);     // 湖青色
            btnAutoPage.HoverColor = Color.FromArgb(60, 90, 89);
            btnAutoPage.PressedColor = Color.FromArgb(47, 72, 71);
            btnAutoPage.TextColor = Color.FromArgb(255, 253, 248);
            btnAutoPage.BorderColor = Color.FromArgb(60, 90, 89);
            btnAutoPage.Click += BtnAutoPage_Click;

            // 2. 导出并打开 Wiki
            btnExportAndOpen = new ParchmentButton();
            btnExportAndOpen.IconType = DoodleIconType.Globe;
            btnExportAndOpen.Text = "导出并打开 Wiki 分析页";
            btnExportAndOpen.Location = new Point(18 + b1W + bGap, btnY);
            btnExportAndOpen.Size = new Size(b2W, btnH);
            btnExportAndOpen.BaseColor = Color.FromArgb(163, 111, 10);    // 亮金棕
            btnExportAndOpen.HoverColor = Color.FromArgb(146, 99, 8);
            btnExportAndOpen.PressedColor = Color.FromArgb(126, 85, 6);
            btnExportAndOpen.TextColor = Color.FromArgb(255, 253, 248);
            btnExportAndOpen.BorderColor = Color.FromArgb(146, 99, 8);
            btnExportAndOpen.Click += BtnExportAndOpen_Click;

            // 3. 复制数据
            btnCopyJson = new ParchmentButton();
            btnCopyJson.IconType = DoodleIconType.Copy;
            btnCopyJson.Text = "复制数据";
            btnCopyJson.Location = new Point(18 + b1W + bGap + b2W + bGap, btnY);
            btnCopyJson.Size = new Size(b3W, btnH);
            btnCopyJson.BaseColor = Color.FromArgb(250, 244, 232);
            btnCopyJson.HoverColor = Color.FromArgb(240, 230, 214);
            btnCopyJson.PressedColor = Color.FromArgb(226, 212, 192);
            btnCopyJson.TextColor = Color.FromArgb(62, 42, 20);
            btnCopyJson.BorderColor = Color.FromArgb(209, 190, 165);
            btnCopyJson.Click += BtnCopyJson_Click;

            // 4. 存储目录
            btnOpenFolder = new ParchmentButton();
            btnOpenFolder.IconType = DoodleIconType.Folder;
            btnOpenFolder.Text = "存储目录";
            btnOpenFolder.Location = new Point(18 + b1W + bGap + b2W + bGap + b3W + bGap, btnY);
            btnOpenFolder.Size = new Size(b4W, btnH);
            btnOpenFolder.BaseColor = Color.FromArgb(250, 244, 232);
            btnOpenFolder.HoverColor = Color.FromArgb(240, 230, 214);
            btnOpenFolder.PressedColor = Color.FromArgb(226, 212, 192);
            btnOpenFolder.TextColor = Color.FromArgb(62, 42, 20);
            btnOpenFolder.BorderColor = Color.FromArgb(209, 190, 165);
            btnOpenFolder.Click += BtnOpenFolder_Click;

            // ================= 4. 实时活动日志流 (宽度 734px，与上方完全齐平) =================
            panelLogContainer = new Panel();
            panelLogContainer.Location = new Point(18, 222);
            panelLogContainer.Size = new Size(734, 316);
            panelLogContainer.BackColor = Color.FromArgb(252, 249, 242);
            panelLogContainer.BorderStyle = BorderStyle.FixedSingle;
            panelLogContainer.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;

            lblLogTitle = new Label();
            lblLogTitle.Text = "实时活动日志流";
            lblLogTitle.Font = new Font("微软雅黑", 8.5f, FontStyle.Bold);
            lblLogTitle.ForeColor = Color.FromArgb(122, 98, 72);
            lblLogTitle.Location = new Point(10, 8);
            lblLogTitle.AutoSize = true;

            txtLogs = new TextBox();
            txtLogs.Multiline = true;
            txtLogs.ReadOnly = true;
            txtLogs.BorderStyle = BorderStyle.None;
            txtLogs.ScrollBars = ScrollBars.Vertical;
            txtLogs.BackColor = Color.FromArgb(252, 249, 242); // 柔和米黄底色
            txtLogs.ForeColor = Color.FromArgb(70, 52, 36);      // 深棕字体
            txtLogs.Font = new Font("Consolas", 9.5f, FontStyle.Regular);
            txtLogs.Location = new Point(10, 30);
            txtLogs.Size = new Size(712, 276);
            txtLogs.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;

            panelLogContainer.Controls.Add(lblLogTitle);
            panelLogContainer.Controls.Add(txtLogs);

            // 组装窗体
            this.Controls.Add(panelHeader);
            this.Controls.Add(panelHeroCard);
            this.Controls.Add(panelPetCard);
            this.Controls.Add(btnAutoPage);
            this.Controls.Add(btnExportAndOpen);
            this.Controls.Add(btnCopyJson);
            this.Controls.Add(btnOpenFolder);
            this.Controls.Add(panelLogContainer);
        }

        private void Log(string msg)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<string>(Log), msg);
                return;
            }
            string timeStr = DateTime.Now.ToString("HH:mm:ss");
            txtLogs.AppendText(string.Format("[{0}] {1}\r\n", timeStr, msg));
        }

        private void UpdateStatusRightUI()
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(UpdateStatusRightUI));
                return;
            }

            string devPart = string.IsNullOrEmpty(targetDevice) ? "○ 未连接模拟器" : string.Format("● {0}", targetDevice);
            string playerPart = "";

            if (!string.IsNullOrEmpty(playerId) || !string.IsNullOrEmpty(playerNick))
            {
                string nick = string.IsNullOrEmpty(playerNick) ? ("探险家#" + (playerId.Length >= 4 ? playerId.Substring(playerId.Length - 4) : playerId)) : playerNick;
                playerPart = string.Format(" | 玩家: {0}", nick);
            }
            else
            {
                playerPart = " | 等待游戏中点击招募";
            }

            lblStatusRight.Text = devPart + playerPart;
            lblStatusRight.ForeColor = string.IsNullOrEmpty(targetDevice) ? Color.FromArgb(239, 68, 68) : Color.FromArgb(52, 211, 153);
            lblStatusRight.Left = panelHeader.ClientSize.Width - lblStatusRight.Width - 18;
            if (btnReconnect != null)
            {
                btnReconnect.Left = lblStatusRight.Left - btnReconnect.Width - 12;
            }
        }

        private void BtnReconnect_Click(object sender, EventArgs e)
        {
            if (btnReconnect == null || !btnReconnect.Enabled) return;

            btnReconnect.Enabled = false;
            btnReconnect.Text = "连接中...";
            Log("[!] 正在手动重新探测并连接模拟器...");

            new Thread(() => {
                try
                {
                    StopSniffer();
                    InitSniffer();
                }
                catch (Exception ex)
                {
                    Log("[×] 重新连接异常: " + ex.Message);
                }
                finally
                {
                    if (!this.IsDisposed && this.IsHandleCreated)
                    {
                        this.BeginInvoke(new Action(() => {
                            btnReconnect.Text = "重新连接";
                            btnReconnect.Enabled = true;
                            UpdateStatusRightUI();
                        }));
                    }
                }
            }).Start();
        }

        private void InitSniffer()
        {
            Log("正在探测系统 ADB 与运行中的模拟器...");
            adbPath = FindAdb();
            if (string.IsNullOrEmpty(adbPath))
            {
                Log("[×] 未找到 ADB 工具！请确保已安装并启动模拟器。");
                UpdateDeviceStatus(false, "未找到 ADB 工具");
                return;
            }
            Log(string.Format("[✓] 定位 ADB 工具: {0}", adbPath));

            // 先探测当前是否已有已连接的设备
            targetDevice = DetectDevice(adbPath);
            if (string.IsNullOrEmpty(targetDevice))
            {
                Log("[!] 当前无已连接的模拟器，正在尝试连接 MuMu/夜神/雷电 常见端口...");
                int[] ports = new int[] { 16384, 7555, 5555, 62001, 21503, 16385, 26944 };
                foreach (int p in ports)
                {
                    RunCmd(adbPath, string.Format("connect 127.0.0.1:{0}", p));
                    targetDevice = DetectDevice(adbPath);
                    if (!string.IsNullOrEmpty(targetDevice))
                    {
                        Log(string.Format("[✓] 成功探测到模拟器端口: 127.0.0.1:{0}", p));
                        break;
                    }
                }
            }

            if (string.IsNullOrEmpty(targetDevice))
            {
                Log("[×] 未能自动连接到模拟器，请检查模拟器是否启动并开启了调试选项。");
                UpdateDeviceStatus(false, "未连接模拟器");
                return;
            }

            Log(string.Format("[✓] 成功连接模拟器设备: {0}", targetDevice));
            UpdateDeviceStatus(true, targetDevice);

            // 检查并提升 Root 权限 (底层 tcpdump 必须要求 uid=0)
            EnsureRoot(targetDevice);

            // 启动底层 tcpdump 监听
            StartTcpdump();
        }

        private void EnsureRoot(string device)
        {
            try
            {
                string idOut = RunCmd(adbPath, string.Format("-s {0} shell id", device));
                if (idOut.Contains("uid=0"))
                {
                    Log("[✓] 当前模拟器具备 Root 权限 (uid=0)。");
                    return;
                }

                Log("[!] 检测到普通用户权限，正在请求 Root 提权...");
                RunCmd(adbPath, string.Format("-s {0} root", device));
                Thread.Sleep(1200);
                RunCmd(adbPath, string.Format("connect {0}", device));

                idOut = RunCmd(adbPath, string.Format("-s {0} shell id", device));
                if (idOut.Contains("uid=0"))
                {
                    Log("[✓] Root 提权成功！已激活网络底层监听特权。");
                }
                else
                {
                    Log("[!] 未能自动提权为 uid=0，若抓包无数据请在模拟器设置中开启【Root 权限】。");
                }
            }
            catch (Exception ex)
            {
                Log(string.Format("[!] 提权检测异常: {0}", ex.Message));
            }
        }

        private void StartTcpdump()
        {
            try
            {
                // 先清理可能残留的孤儿 tcpdump 进程，避免网卡监听冲突
                RunCmd(adbPath, string.Format("-s {0} shell pkill -9 tcpdump", targetDevice));

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = adbPath;
                // 精准排除 ADB 传输端口，防止死循环自激与内核丢包 (注意：无多余外层双引号)
                psi.Arguments = string.Format("-s {0} shell tcpdump -i any -A -s 0 -l tcp and not port 5555 and not port 16384 and not port 7555 and not port 62001", targetDevice);
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                psi.CreateNoWindow = true;

                snifferProcess = new Process();
                snifferProcess.StartInfo = psi;
                snifferProcess.EnableRaisingEvents = true;

                snifferProcess.OutputDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        ProcessPacketChunk(e.Data);
                    }
                };

                snifferProcess.ErrorDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        if (e.Data.Contains("verbose output suppressed") || e.Data.Contains("listening on any")) return;
                        if (e.Data.Contains("Permission denied") || e.Data.Contains("Operation not permitted"))
                        {
                            Log(string.Format("[×] 抓包权限受限: {0}，请开启模拟器 Root 权限！", e.Data));
                        }
                    }
                };

                snifferProcess.Exited += (s, e) => {
                    if (this.IsHandleCreated && !this.IsDisposed)
                    {
                        this.BeginInvoke(new Action(() => {
                            Log("[!] 网络监听引擎已退出。若仍在抓取，可点击右上角【重新连接】。");
                        }));
                    }
                };

                snifferProcess.Start();
                snifferProcess.BeginOutputReadLine();
                snifferProcess.BeginErrorReadLine();

                Thread.Sleep(500);
                if (snifferProcess.HasExited)
                {
                    Log(string.Format("[×] 网络监听引擎启动失败 (ExitCode: {0})，请检查模拟器 Root 权限！", snifferProcess.ExitCode));
                }
                else
                {
                    Log("[✓] 底层网络监听引擎就绪 (tcpdump 零丢包模式已激活)！");
                    Log(">>> 请在游戏内点击【记录查询】或切换卡池标签，工具将实时抓取并统计数据。");
                }
            }
            catch (Exception ex)
            {
                Log(string.Format("[×] 启动抓包引擎异常: {0}", ex.Message));
            }
        }

        private void ProcessPacketChunk(string chunk)
        {
            lock (rawBuffer)
            {
                rawBuffer.AppendLine(chunk);
                string text = rawBuffer.ToString();

                // 取最近 6000 字符的窗口，防止跨 TCP 分片截断
                string searchWindow = text.Length > 6000 ? text.Substring(text.Length - 6000) : text;

                // 判定活跃卡池上下文 (魔物 vs 伙伴)
                if (searchWindow.Contains("\"pet_") || searchWindow.Contains("\"poolId\":\"10") || searchWindow.Contains("\"poolId\":10"))
                {
                    activePoolContext = "pet";
                }
                else if (searchWindow.Contains("\"hero_") || searchWindow.Contains("\"poolId\":\"1") || searchWindow.Contains("\"poolId\":1,"))
                {
                    activePoolContext = "hero";
                }

                // 捕获官方返回的 totalRows 数量，并精准归属到魔物或伙伴卡池
                Match totalM = Regex.Match(searchWindow, "\"totalRows\"\\s*:\\s*(\\d+)");
                if (totalM.Success)
                {
                    int detected = int.Parse(totalM.Groups[1].Value);
                    if (detected > 0)
                    {
                        bool isPet = searchWindow.Contains("\"pet_") || (!searchWindow.Contains("\"hero_") && activePoolContext == "pet");
                        if (isPet)
                        {
                            if (petTotal != detected)
                            {
                                petTotal = detected;
                                activePoolContext = "pet";
                                Log(string.Format("[✓] 成功捕获【魔物贩售】目标数量: {0} 条 (共 {1} 页)", detected, (detected + 15) / 16));
                                this.BeginInvoke(new Action(UpdateBoardUI));
                            }
                        }
                        else
                        {
                            if (heroTotal != detected)
                            {
                                heroTotal = detected;
                                activePoolContext = "hero";
                                Log(string.Format("[✓] 成功捕获【伙伴招募】目标数量: {0} 条 (共 {1} 页)", detected, (detected + 15) / 16));
                                this.BeginInvoke(new Action(UpdateBoardUI));
                            }
                        }
                    }
                }

                // 捕获玩家 UID 与昵称
                Match uidM = Regex.Match(searchWindow, "\"uid\"\\s*:\\s*\"?(\\d+)\"?");
                if (uidM.Success)
                {
                    string oldUid = playerId;
                    playerId = uidM.Groups[1].Value;
                    if (oldUid != playerId)
                    {
                        Log(string.Format("[✓] 成功识别玩家 UID: {0}", playerId));
                        UpdateStatusRightUI();
                    }
                }

                if (string.IsNullOrEmpty(playerNick))
                {
                    Match nickM = Regex.Match(searchWindow, "\"(?:nickName|nickname|name|playerName)\"\\s*:\\s*\"([^\"]+)\"");
                    if (nickM.Success)
                    {
                        string nick = nickM.Groups[1].Value;
                        if (nick.Length <= 20 && !nick.Contains("{") && !nick.Contains("\\"))
                        {
                            playerNick = nick;
                            Log(string.Format("[✓] 成功识别玩家昵称: {0}", playerNick));
                            UpdateStatusRightUI();
                        }
                    }
                }

                // 提取单条抽卡记录
                MatchCollection matches = Regex.Matches(text, "\\{([^{}]+)\\}");
                int newCount = 0;
                foreach (Match m in matches)
                {
                    string c = m.Groups[1].Value;
                    if (c.Contains("\"id\"") && c.Contains("\"typeId\"") && c.Contains("\"poolId\"") && c.Contains("\"crateAt\""))
                    {
                        Match idM = Regex.Match(c, "\"id\"\\s*:\\s*(\\d+)");
                        Match typeM = Regex.Match(c, "\"typeId\"\\s*:\\s*\"([^\"]+)\"");
                        Match poolM = Regex.Match(c, "\"poolId\"\\s*:\\s*\"?([a-zA-Z0-9_]+)\"?");
                        Match crateM = Regex.Match(c, "\"crateAt\"\\s*:\\s*(\\d+)");

                        if (idM.Success && typeM.Success && poolM.Success && crateM.Success)
                        {
                            long id = long.Parse(idM.Groups[1].Value);
                            string typeId = typeM.Groups[1].Value;
                            string poolId = poolM.Groups[1].Value;

                            // 动态确认卡池类别
                            if (typeId.StartsWith("pet_") || poolId.StartsWith("10"))
                            {
                                activePoolContext = "pet";
                            }
                            else
                            {
                                activePoolContext = "hero";
                            }

                            if (!recordsMap.ContainsKey(id))
                            {
                                recordsMap[id] = new GachaItem
                                {
                                    Id = id,
                                    TypeId = typeId,
                                    PoolId = poolId,
                                    CrateAt = long.Parse(crateM.Groups[1].Value),
                                    At = long.Parse(crateM.Groups[1].Value) * 1000
                                };
                                newCount++;
                            }
                        }
                    }
                }

                if (newCount > 0)
                {
                    this.BeginInvoke(new Action(UpdateBoardUI));
                    Log(string.Format("[+] 新增捕获 +{0} 条记录，当前累计: {1} 条", newCount, recordsMap.Count));
                    SaveJsonToDisk();
                }

                if (rawBuffer.Length > 500000)
                {
                    string rem = text.Substring(text.Length - 200000);
                    rawBuffer.Length = 0;
                    rawBuffer.Append(rem);
                }
            }
        }

        private void UpdateBoardUI()
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(UpdateBoardUI));
                return;
            }

            int hero = 0;
            int pet = 0;
            foreach (GachaItem it in recordsMap.Values)
            {
                string pId = it.PoolId ?? "";
                string tId = it.TypeId ?? "";
                if (pId.StartsWith("10") || tId.StartsWith("pet_")) pet++;
                else hero++;
            }

            // 伙伴池
            lblHeroCount.Text = string.Format("{0} 条", hero);
            if (heroTotal > 0)
            {
                lblHeroTarget.Text = string.Format("目标数量: {0} 条", heroTotal);
                lblHeroPercent.Text = string.Format("{0}%", (int)Math.Min(100, Math.Round((double)hero / heroTotal * 100)));
                pbHero.Maximum = heroTotal;
                pbHero.Value = Math.Min(heroTotal, hero);
            }
            else
            {
                lblHeroTarget.Text = hero > 0 ? "目标数量: 捕获中(可重开弹窗看总数)" : "目标数量: 等待游戏刷新";
                lblHeroPercent.Text = hero > 0 ? string.Format("{0} 条", hero) : "0%";
                pbHero.Maximum = 100;
                pbHero.Value = hero > 0 ? 100 : 0;
            }
            lblHeroTarget.Left = panelHeroCard.Width - lblHeroTarget.Width - 16;
            lblHeroPercent.Left = panelHeroCard.Width - lblHeroPercent.Width - 16;

            // 魔物池
            lblPetCount.Text = string.Format("{0} 条", pet);
            if (petTotal > 0)
            {
                lblPetTarget.Text = string.Format("目标数量: {0} 条", petTotal);
                lblPetPercent.Text = string.Format("{0}%", (int)Math.Min(100, Math.Round((double)pet / petTotal * 100)));
                pbPet.Maximum = petTotal;
                pbPet.Value = Math.Min(petTotal, pet);
            }
            else
            {
                lblPetTarget.Text = pet > 0 ? "目标数量: 捕获中(可重开弹窗看总数)" : "目标数量: 等待游戏刷新";
                lblPetPercent.Text = pet > 0 ? string.Format("{0} 条", pet) : "0%";
                pbPet.Maximum = 100;
                pbPet.Value = pet > 0 ? 100 : 0;
            }
            lblPetTarget.Left = panelPetCard.Width - lblPetTarget.Width - 16;
            lblPetPercent.Left = panelPetCard.Width - lblPetPercent.Width - 16;
        }

        private void UpdateDeviceStatus(bool connected, string text)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<bool, string>(UpdateDeviceStatus), connected, text);
                return;
            }
            targetDevice = connected ? text : "";
            UpdateStatusRightUI();
        }

        private void BtnAutoPage_Click(object sender, EventArgs e)
        {
            if (isAutoPaging)
            {
                isAutoPaging = false;
                btnAutoPage.Text = "一键全自动翻页 (代点防漏)";
                btnAutoPage.BaseColor = Color.FromArgb(72, 107, 106);
                btnAutoPage.HoverColor = Color.FromArgb(60, 90, 89);
                btnAutoPage.BorderColor = Color.FromArgb(60, 90, 89);
                Log("[自动翻页] 用户已手动中止。");
                return;
            }

            if (string.IsNullOrEmpty(targetDevice))
            {
                MessageBox.Show("未检测到连接的模拟器设备！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            isAutoPaging = true;
            btnAutoPage.Text = "停止自动翻页";
            btnAutoPage.BaseColor = Color.FromArgb(185, 28, 28); // 柔和深红
            btnAutoPage.HoverColor = Color.FromArgb(153, 27, 27);
            btnAutoPage.BorderColor = Color.FromArgb(153, 27, 27);

            autoPageThread = new Thread(AutoPageLoop);
            autoPageThread.IsBackground = true;
            autoPageThread.Start();
        }

        private void AutoPageLoop()
        {
            Log("[自动翻页] 启动！开始检测分辨率与横屏状态...");
            int width = 1600;
            int height = 900;
            try
            {
                string outSize = RunCmd(adbPath, string.Format("-s {0} shell wm size", targetDevice));
                // 优先取 Override size，若无则取 Physical size
                Match m = Regex.Match(outSize, "(?:Override|Physical) size:\\s*(\\d+)x(\\d+)");
                if (m.Success)
                {
                    width = int.Parse(m.Groups[1].Value);
                    height = int.Parse(m.Groups[2].Value);
                }
            }
            catch { }

            // 《深渊之歌》为强制横屏游戏，宽度必须大于高度！若底层获取到竖屏尺寸则自动纠正反转
            if (width < height)
            {
                int temp = width;
                width = height;
                height = temp;
            }

            // 【下一页】按钮位于弹窗底部右下侧（宽度的 70.0%，高度的 93.5%，与原 bat 脚本完全一致）
            int clickX = (int)(width * 0.700);
            int clickY = (int)(height * 0.935);
            Log(string.Format("[自动翻页] 屏幕分辨率: {0}x{1}，目标【下一页】点击坐标: ({2}, {3})", width, height, clickX, clickY));

            int lastCount = recordsMap.Count;
            int stuckRounds = 0;

            while (isAutoPaging)
            {
                RunCmd(adbPath, string.Format("-s {0} shell input tap {1} {2}", targetDevice, clickX, clickY));
                Thread.Sleep(800); // 稳健等待网络回包与翻页动画

                // 检查当前卡池是否已全部抓取完毕
                int currentTotal = (activePoolContext == "pet") ? petTotal : heroTotal;
                int currentCount = 0;
                foreach (GachaItem it in recordsMap.Values)
                {
                    string pId = it.PoolId ?? "";
                    string tId = it.TypeId ?? "";
                    bool isPet = pId.StartsWith("10") || tId.StartsWith("pet_");
                    if ((activePoolContext == "pet" && isPet) || (activePoolContext != "pet" && !isPet))
                    {
                        currentCount++;
                    }
                }

                if (currentTotal > 0 && currentCount >= currentTotal)
                {
                    Log(string.Format("[自动翻页] 当前卡池所有记录已全部捕获完毕 (共 {0}/{1} 条)！自动停止。", currentCount, currentTotal));
                    break;
                }

                if (recordsMap.Count > lastCount)
                {
                    lastCount = recordsMap.Count;
                    stuckRounds = 0;
                }
                else
                {
                    stuckRounds++;
                    if (stuckRounds >= 8)
                    {
                        Log("[自动翻页] 连续多次未捕获新记录，已翻至最底页或已无更多数据，自动停止！");
                        break;
                    }
                }
            }

            isAutoPaging = false;
            this.BeginInvoke(new Action(delegate {
                btnAutoPage.Text = "一键全自动翻页 (代点防漏)";
                btnAutoPage.BaseColor = Color.FromArgb(72, 107, 106);
                btnAutoPage.HoverColor = Color.FromArgb(60, 90, 89);
                btnAutoPage.BorderColor = Color.FromArgb(60, 90, 89);
            }));
        }

        private void BtnExportAndOpen_Click(object sender, EventArgs e)
        {
            if (recordsMap.Count == 0)
            {
                MessageBox.Show("当前尚未捕获到任何抽卡记录！\n请先在游戏内打开【记录查询】或点击【一键全自动翻页】。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            SaveJsonToDisk();
            string json = GenerateJsonText();
            try { Clipboard.SetText(json); } catch { }
            Log("[✓] 抽卡数据已保存并复制到系统剪贴板！");

            string targetUrl = "https://syzgwiki.top/#/gacha/analysis";
            try
            {
                Process.Start(new ProcessStartInfo(targetUrl) { UseShellExecute = true });
                Log(string.Format("[✓] 正在打开 Wiki 分析页面: {0}", targetUrl));
            }
            catch { }

            MessageBox.Show("抽卡记录已成功复制到剪贴板！\n已为您打开 Wiki 分析页，只需在网页中点击【导入记录】即可查看完整图表！", "导出完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void BtnCopyJson_Click(object sender, EventArgs e)
        {
            string json = GenerateJsonText();
            if (string.IsNullOrEmpty(json) || recordsMap.Count == 0)
            {
                MessageBox.Show("当前尚未捕获到任何抽卡记录！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            try
            {
                Clipboard.SetText(json);
                Log("[✓] 抽卡数据 JSON 已复制到剪贴板！");
                MessageBox.Show("抽卡数据 JSON 已成功复制到剪贴板！", "复制成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("复制失败: " + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void BtnOpenFolder_Click(object sender, EventArgs e)
        {
            try
            {
                string dir = Path.GetDirectoryName(outputPath);
                Process.Start("explorer.exe", dir);
            }
            catch { }
        }

        private string GenerateJsonText()
        {
            List<GachaItem> list = new List<GachaItem>(recordsMap.Values);
            list.Sort((a, b) => a.Id.CompareTo(b.Id));

            StringBuilder sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine("  \"schemaVersion\": 1,");
            sb.AppendLine("  \"source\": \"emulator_sniff\",");
            sb.AppendLine(string.Format("  \"exportedAt\": \"{0}\",", DateTime.UtcNow.ToString("o")));
            sb.AppendLine("  \"player\": {");
            sb.AppendLine(string.Format("    \"uid\": \"{0}\",", string.IsNullOrEmpty(playerId) ? "100233" : playerId));
            sb.AppendLine(string.Format("    \"nickname\": \"{0}\",", string.IsNullOrEmpty(playerNick) ? "探险家" : playerNick));
            sb.AppendLine("    \"server\": \"官方服务器\"");
            sb.AppendLine("  },");
            sb.AppendLine("  \"records\": [");
            for (int i = 0; i < list.Count; i++)
            {
                GachaItem it = list[i];
                sb.Append(string.Format("    {{ \"id\": {0}, \"typeId\": \"{1}\", \"poolId\": \"{2}\", \"crateAt\": {3}, \"at\": {4} }}", it.Id, it.TypeId, it.PoolId, it.CrateAt, it.At));
                if (i < list.Count - 1) sb.AppendLine(",");
                else sb.AppendLine();
            }
            sb.AppendLine("  ]");
            sb.AppendLine("}");
            return sb.ToString();
        }

        private void SaveJsonToDisk()
        {
            try
            {
                string text = GenerateJsonText();
                // 必须使用 new UTF8Encoding(false)，杜绝生成 UTF-8 BOM 乱码头
                File.WriteAllText(outputPath, text, new UTF8Encoding(false));
            }
            catch { }
        }

        private void StopSniffer()
        {
            try
            {
                if (snifferProcess != null && !snifferProcess.HasExited)
                {
                    snifferProcess.Kill();
                }
            }
            catch { }
        }

        private static string RunCmd(string exe, string args)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(exe, args);
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.CreateNoWindow = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                using (Process p = Process.Start(psi))
                {
                    string res = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(3000);
                    return res;
                }
            }
            catch { return ""; }
        }

        private static string FindAdb()
        {
            string envAdb = Environment.GetEnvironmentVariable("ADB_PATH");
            if (!string.IsNullOrEmpty(envAdb) && File.Exists(envAdb)) return envAdb;

            string[] candidates = new string[] {
                @"E:\MuMuPlayer\nx_main\adb.exe",
                @"D:\MuMuPlayer\nx_main\adb.exe",
                @"C:\Program Files\Netease\MuMuPlayer-12.0\shell\adb.exe",
                @"D:\Program Files\Netease\MuMuPlayer-12.0\shell\adb.exe",
                @"C:\Nox\bin\nox_adb.exe",
                @"D:\Nox\bin\nox_adb.exe",
                @"C:\leidian\LDPlayer9\adb.exe",
                @"D:\leidian\LDPlayer9\adb.exe"
            };
            foreach (string p in candidates)
            {
                if (File.Exists(p)) return p;
            }

            try
            {
                string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
                foreach (string dir in pathEnv.Split(';'))
                {
                    string trimmed = dir.Trim();
                    if (!string.IsNullOrEmpty(trimmed))
                    {
                        string candidate = Path.Combine(trimmed, "adb.exe");
                        if (File.Exists(candidate)) return candidate;
                    }
                }
            }
            catch { }
            return "adb";
        }

        private static string DetectDevice(string adb)
        {
            try
            {
                string outStr = RunCmd(adb, "devices");
                if (string.IsNullOrEmpty(outStr)) return "";

                string[] lines = outStr.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string rawLine in lines)
                {
                    string line = rawLine.Trim();
                    if (string.IsNullOrEmpty(line) || line.StartsWith("List of") || line.StartsWith("*"))
                        continue;

                    string[] parts = line.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 2 && parts[1].Equals("device", StringComparison.OrdinalIgnoreCase))
                    {
                        string dev = parts[0].Trim();
                        if (!string.IsNullOrEmpty(dev) && !dev.Contains("offline"))
                        {
                            return dev;
                        }
                    }
                }
            }
            catch { }
            return "";
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
