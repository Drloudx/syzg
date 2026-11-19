using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Net.Sockets;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

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

    internal class PoolMetaInfo
    {
        public string Kind; // hero_limited, pet_limited, hero_standard, pet_standard
        public string Name;
    }

    // ================= 纯托管 RFC 8032 Ed25519 签名引擎 (零外部依赖) =================
    internal static class Ed25519SignerHelper
    {
        private const string PrivateKeyBase64 = "ktR6U4w71ycpUzTZyIfLNRbUQ277zAfptvMyRarqqTI=";

        private static readonly BigInteger P = BigInteger.Parse("57896044618658097711785492504343953926634992332820282019728792003956564819949");
        private static readonly BigInteger L = BigInteger.Parse("7237005577332262213973186563042994240857116359379907606001950938285454250989");
        private static readonly BigInteger D = Mod(
            BigInteger.Parse("-121665") * ModInverse(BigInteger.Parse("121666"), P), P);
        private static readonly BigInteger Bx = BigInteger.Parse("15112221349535400772501151409588531511454012693041857206046113283949847762202");
        private static readonly BigInteger By = BigInteger.Parse("46316835694926478169428394003475163141307993866256225615783033603165251855960");

        private static readonly byte[] Seed = Convert.FromBase64String(PrivateKeyBase64);
        private static readonly byte[] Prefix;
        private static readonly BigInteger ScalarA;
        private static readonly byte[] PublicKeyBytes;

        private struct ExtPoint
        {
            public BigInteger X;
            public BigInteger Y;
            public BigInteger Z;
            public BigInteger T;
        }

        static Ed25519SignerHelper()
        {
            byte[] h;
            using (SHA512 sha = SHA512.Create())
            {
                h = sha.ComputeHash(Seed);
            }
            h[0] &= 248;
            h[31] &= 127;
            h[31] |= 64;

            byte[] aBytes = new byte[33];
            Buffer.BlockCopy(h, 0, aBytes, 0, 32);
            ScalarA = new BigInteger(aBytes);

            Prefix = new byte[32];
            Buffer.BlockCopy(h, 32, Prefix, 0, 32);

            ExtPoint basePt = ToExtended(Bx, By);
            ExtPoint pubPt = ScalarMult(basePt, ScalarA);
            PublicKeyBytes = EncodePoint(pubPt);
        }

        public static string Sign(string message)
        {
            byte[] msgBytes = Encoding.UTF8.GetBytes(message);
            byte[] rHash;
            using (SHA512 sha = SHA512.Create())
            {
                byte[] rInput = new byte[Prefix.Length + msgBytes.Length];
                Buffer.BlockCopy(Prefix, 0, rInput, 0, Prefix.Length);
                Buffer.BlockCopy(msgBytes, 0, rInput, Prefix.Length, msgBytes.Length);
                rHash = sha.ComputeHash(rInput);
            }

            BigInteger r = Mod(FromUnsignedLittleEndian(rHash), L);
            ExtPoint R = ScalarMult(ToExtended(Bx, By), r);
            byte[] rEncoded = EncodePoint(R);

            byte[] kHash;
            using (SHA512 sha = SHA512.Create())
            {
                byte[] kInput = new byte[rEncoded.Length + PublicKeyBytes.Length + msgBytes.Length];
                Buffer.BlockCopy(rEncoded, 0, kInput, 0, rEncoded.Length);
                Buffer.BlockCopy(PublicKeyBytes, 0, kInput, rEncoded.Length, PublicKeyBytes.Length);
                Buffer.BlockCopy(msgBytes, 0, kInput, rEncoded.Length + PublicKeyBytes.Length, msgBytes.Length);
                kHash = sha.ComputeHash(kInput);
            }

            BigInteger k = Mod(FromUnsignedLittleEndian(kHash), L);
            BigInteger s = Mod(r + k * ScalarA, L);
            byte[] sEncoded = ToLittleEndian32(s);

            byte[] sig = new byte[64];
            Buffer.BlockCopy(rEncoded, 0, sig, 0, 32);
            Buffer.BlockCopy(sEncoded, 0, sig, 32, 32);
            return Convert.ToBase64String(sig);
        }

        private static BigInteger Mod(BigInteger x, BigInteger m)
        {
            BigInteger r = x % m;
            return r.Sign < 0 ? r + m : r;
        }

        private static BigInteger ModInverse(BigInteger a, BigInteger m)
        {
            return BigInteger.ModPow(Mod(a, m), m - 2, m);
        }

        private static BigInteger FromUnsignedLittleEndian(byte[] bytes)
        {
            byte[] buf = new byte[bytes.Length + 1];
            Buffer.BlockCopy(bytes, 0, buf, 0, bytes.Length);
            return new BigInteger(buf);
        }

        private static byte[] ToLittleEndian32(BigInteger v)
        {
            byte[] raw = v.ToByteArray();
            byte[] outBuf = new byte[32];
            int copyLen = Math.Min(32, raw.Length);
            Buffer.BlockCopy(raw, 0, outBuf, 0, copyLen);
            return outBuf;
        }

        private static ExtPoint ToExtended(BigInteger x, BigInteger y)
        {
            return new ExtPoint
            {
                X = x,
                Y = y,
                Z = BigInteger.One,
                T = Mod(x * y, P)
            };
        }

        private static ExtPoint PointAdd(ExtPoint p1, ExtPoint p2)
        {
            BigInteger a = Mod((p1.Y - p1.X) * (p2.Y - p2.X), P);
            BigInteger b = Mod((p1.Y + p1.X) * (p2.Y + p2.X), P);
            BigInteger c = Mod(p1.T * 2 * D * p2.T, P);
            BigInteger d = Mod(p1.Z * 2 * p2.Z, P);
            BigInteger e = b - a;
            BigInteger f = d - c;
            BigInteger g = d + c;
            BigInteger h = b + a;
            return new ExtPoint
            {
                X = Mod(e * f, P),
                Y = Mod(g * h, P),
                Z = Mod(f * g, P),
                T = Mod(e * h, P)
            };
        }

        private static ExtPoint ScalarMult(ExtPoint pt, BigInteger scalar)
        {
            ExtPoint result = new ExtPoint { X = BigInteger.Zero, Y = BigInteger.One, Z = BigInteger.One, T = BigInteger.Zero };
            ExtPoint current = pt;
            BigInteger k = scalar;
            while (k > BigInteger.Zero)
            {
                if (!k.IsEven) result = PointAdd(result, current);
                current = PointAdd(current, current);
                k >>= 1;
            }
            return result;
        }

        private static byte[] EncodePoint(ExtPoint pt)
        {
            BigInteger zInv = ModInverse(pt.Z, P);
            BigInteger x = Mod(pt.X * zInv, P);
            BigInteger y = Mod(pt.Y * zInv, P);
            byte[] encoded = ToLittleEndian32(y);
            if (!x.IsEven) encoded[31] |= 0x80;
            return encoded;
        }
    }

    // ================= 裸 TCP + Protobuf 协议直连客户端 =================
    internal class ProtocolPacketData
    {
        public string Signature = "";
        public int RouterType;
        public int ServerPushType;
        public long MessageSeqNum;
        public int Code;
        public string Desc = "";
        public long ServerTime;
        public string BodyText = "";
    }

    internal static class ProtoWire
    {
        public static byte[] EncodeFrame(int routerType, long seq, string msgStr)
        {
            string sig = Ed25519SignerHelper.Sign(msgStr);
            byte[] sigBytes = Encoding.UTF8.GetBytes(sig);
            byte[] bodyBytes = Encoding.UTF8.GetBytes(msgStr);

            using (MemoryStream ms = new MemoryStream())
            {
                ms.WriteByte(0x0A);
                WriteVarint(ms, (ulong)sigBytes.Length);
                ms.Write(sigBytes, 0, sigBytes.Length);

                ms.WriteByte(0x10);
                WriteVarint(ms, (ulong)routerType);

                ms.WriteByte(0x20);
                WriteVarint(ms, (ulong)seq);

                ms.WriteByte(0x42);
                WriteVarint(ms, (ulong)bodyBytes.Length);
                ms.Write(bodyBytes, 0, bodyBytes.Length);

                byte[] payload = ms.ToArray();
                using (MemoryStream framed = new MemoryStream())
                {
                    WriteVarint(framed, (ulong)payload.Length);
                    framed.Write(payload, 0, payload.Length);
                    return framed.ToArray();
                }
            }
        }

        private static void WriteVarint(Stream s, ulong v)
        {
            while (v >= 0x80)
            {
                s.WriteByte((byte)((v & 0x7F) | 0x80));
                v >>= 7;
            }
            s.WriteByte((byte)v);
        }

        public static bool TryDecodeVarint(byte[] buf, int offset, int count, out ulong value, out int nextOffset)
        {
            value = 0;
            int shift = 0;
            int pos = offset;
            int end = offset + count;
            while (pos < end)
            {
                byte b = buf[pos++];
                value |= (ulong)(b & 0x7F) << shift;
                if ((b & 0x80) == 0)
                {
                    nextOffset = pos;
                    return true;
                }
                shift += 7;
                if (shift > 63) break;
            }
            nextOffset = offset;
            return false;
        }

        public static ProtocolPacketData ParsePacket(byte[] buf, int offset, int len)
        {
            ProtocolPacketData pkt = new ProtocolPacketData();
            int pos = offset;
            int end = offset + len;
            while (pos < end)
            {
                ulong tag;
                int next;
                if (!TryDecodeVarint(buf, pos, end - pos, out tag, out next)) break;
                pos = next;
                int field = (int)(tag >> 3);
                int wire = (int)(tag & 7);

                if (wire == 0)
                {
                    ulong val;
                    if (!TryDecodeVarint(buf, pos, end - pos, out val, out next)) break;
                    pos = next;
                    if (field == 2) pkt.RouterType = (int)val;
                    else if (field == 3) pkt.ServerPushType = (int)val;
                    else if (field == 4) pkt.MessageSeqNum = (long)val;
                    else if (field == 5) pkt.Code = (int)val;
                    else if (field == 7) pkt.ServerTime = (long)val;
                }
                else if (wire == 2)
                {
                    ulong slen;
                    if (!TryDecodeVarint(buf, pos, end - pos, out slen, out next)) break;
                    pos = next;
                    int byteLen = (int)slen;
                    if (pos + byteLen > end) break;
                    if (field == 1) pkt.Signature = Encoding.UTF8.GetString(buf, pos, byteLen);
                    else if (field == 6) pkt.Desc = Encoding.UTF8.GetString(buf, pos, byteLen);
                    else if (field == 8) pkt.BodyText = Encoding.UTF8.GetString(buf, pos, byteLen);
                    pos += byteLen;
                }
                else
                {
                    break;
                }
            }
            return pkt;
        }
    }

    public enum DoodleIconType
    {
        None,
        Bolt,
        Globe,
        Copy,
        Folder,
        Refresh,
        Trash
    }

    // ================= 现代化羊皮纸风格自绘按钮 =================
    public class ParchmentButton : Button
    {
        public DoodleIconType IconType { get; set; }
        public Color BaseColor { get; set; }
        public Color HoverColor { get; set; }
        public Color PressedColor { get; set; }
        public Color TextColor { get; set; }
        public Color BorderColor { get; set; }
        public int CornerRadius { get; set; }
        public bool CenterText { get; set; }

        private bool isHover = false;
        private bool isPressed = false;

        public ParchmentButton()
        {
            this.SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            this.Cursor = Cursors.Hand;
            this.Font = new Font("微软雅黑", 9.5f, FontStyle.Bold);
            this.CornerRadius = 7;
            this.CenterText = false;
            this.BaseColor = Color.FromArgb(237, 227, 210);
            this.HoverColor = Color.FromArgb(226, 214, 194);
            this.PressedColor = Color.FromArgb(215, 200, 176);
            this.TextColor = Color.FromArgb(62, 42, 20);
            this.BorderColor = Color.FromArgb(200, 182, 159);
            this.IconType = DoodleIconType.None;
            this.FlatStyle = FlatStyle.Flat;
            this.FlatAppearance.BorderSize = 0;
        }

        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); isHover = true; Invalidate(); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); isHover = false; isPressed = false; Invalidate(); }
        protected override void OnMouseDown(MouseEventArgs mevent) { base.OnMouseDown(mevent); isPressed = true; Invalidate(); }
        protected override void OnMouseUp(MouseEventArgs mevent) { base.OnMouseUp(mevent); isPressed = false; Invalidate(); }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

            Color parentColor = this.Parent != null ? this.Parent.BackColor : Color.FromArgb(245, 238, 222);
            using (SolidBrush parentBrush = new SolidBrush(parentColor))
            {
                g.FillRectangle(parentBrush, 0, 0, this.Width, this.Height);
            }

            Color currentBg = isPressed ? PressedColor : (isHover ? HoverColor : BaseColor);

            Rectangle rect = new Rectangle(0, 0, this.Width - 1, this.Height - 1);
            using (GraphicsPath path = CreateRoundRectPath(rect, CornerRadius))
            {
                using (SolidBrush bgBrush = new SolidBrush(currentBg)) g.FillPath(bgBrush, path);
                using (Pen bPen = new Pen(BorderColor, 1.2f)) g.DrawPath(bPen, path);
            }

            int iconLeft = 12;
            int textLeft = 10;

            if (IconType != DoodleIconType.None)
            {
                textLeft = 34;
                DrawDoodleIcon(g, iconLeft, this.Height / 2 - 8, 16, 16);
            }

            Rectangle textRect = new Rectangle(textLeft, 0, this.Width - textLeft - 8, this.Height);
            TextFormatFlags flags = CenterText
                ? (TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis)
                : (TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            TextRenderer.DrawText(g, this.Text, this.Font, textRect, TextColor, flags);
        }

        private void DrawDoodleIcon(Graphics g, int x, int y, int w, int h)
        {
            Color iconColor = TextColor;
            using (Pen pen = new Pen(iconColor, 1.7f))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                pen.LineJoin = LineJoin.Round;

                switch (IconType)
                {
                    case DoodleIconType.Bolt:
                        Point[] bolt = new Point[] {
                            new Point(x + 9, y + 1),
                            new Point(x + 3, y + 9),
                            new Point(x + 8, y + 9),
                            new Point(x + 6, y + 15),
                            new Point(x + 13, y + 7),
                            new Point(x + 8, y + 7)
                        };
                        using (SolidBrush fillB = new SolidBrush(iconColor)) g.FillPolygon(fillB, bolt);
                        break;

                    case DoodleIconType.Globe:
                        g.DrawEllipse(pen, x + 1, y + 1, 13, 13);
                        g.DrawLine(pen, x + 1, y + 7, x + 14, y + 7);
                        g.DrawEllipse(pen, x + 4, y + 1, 7, 13);
                        break;

                    case DoodleIconType.Copy:
                        g.DrawRectangle(pen, x + 4, y + 1, 9, 10);
                        Rectangle frontCard = new Rectangle(x + 1, y + 4, 9, 10);
                        using (SolidBrush cardBg = new SolidBrush(isHover ? HoverColor : BaseColor)) g.FillRectangle(cardBg, frontCard);
                        g.DrawRectangle(pen, frontCard);
                        break;

                    case DoodleIconType.Folder:
                        Point[] boxBody = new Point[] {
                            new Point(x + 2, y + 5),
                            new Point(x + 13, y + 5),
                            new Point(x + 12, y + 14),
                            new Point(x + 3, y + 14)
                        };
                        g.DrawPolygon(pen, boxBody);
                        g.DrawLine(pen, x + 1, y + 4, x + 14, y + 4);
                        g.DrawLine(pen, x + 6, y + 9, x + 9, y + 9);
                        break;

                    case DoodleIconType.Refresh:
                        g.DrawArc(pen, x + 2, y + 2, 11, 11, -40, 275);
                        Point[] arr = new Point[] {
                            new Point(x + 11, y + 1),
                            new Point(x + 14, y + 5),
                            new Point(x + 9, y + 6)
                        };
                        using (SolidBrush ab = new SolidBrush(iconColor)) g.FillPolygon(ab, arr);
                        g.DrawPolygon(pen, arr);
                        break;

                    case DoodleIconType.Trash:
                        g.DrawLine(pen, x + 2, y + 4, x + 13, y + 4);
                        g.DrawLine(pen, x + 5, y + 2, x + 10, y + 2);
                        g.DrawRectangle(pen, x + 3, y + 4, 9, 10);
                        g.DrawLine(pen, x + 6, y + 7, x + 6, y + 11);
                        g.DrawLine(pen, x + 9, y + 7, x + 9, y + 11);
                        break;
                }
            }
        }

        public static GraphicsPath CreateRoundRectPath(Rectangle rect, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            int diameter = Math.Max(2, radius * 2);
            path.AddArc(rect.X, rect.Y, diameter, diameter, 180, 90);
            path.AddArc(rect.Right - diameter, rect.Y, diameter, diameter, 270, 90);
            path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(rect.X, rect.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    // ================= 羊皮纸圆角卡片面板 =================
    public class ParchmentCardPanel : Panel
    {
        public int CornerRadius { get; set; }
        public Color BorderColor { get; set; }
        public Color FillColor { get; set; }
        public Color FillColorBottom { get; set; }
        public float BorderWidth { get; set; }
        public bool DashedBorder { get; set; }

        public ParchmentCardPanel()
        {
            this.SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            this.CornerRadius = 11;
            this.FillColor = Color.FromArgb(255, 253, 248);
            this.FillColorBottom = Color.Empty;
            this.BorderColor = Color.FromArgb(216, 199, 176);
            this.BorderWidth = 1.4f;
            this.DashedBorder = false;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            Color parentColor = this.Parent != null ? this.Parent.BackColor : Color.FromArgb(245, 238, 222);
            using (SolidBrush parentBrush = new SolidBrush(parentColor))
            {
                g.FillRectangle(parentBrush, 0, 0, this.Width, this.Height);
            }

            Rectangle rect = new Rectangle(1, 1, this.Width - 3, this.Height - 3);
            using (GraphicsPath path = ParchmentButton.CreateRoundRectPath(rect, CornerRadius))
            {
                if (!FillColorBottom.IsEmpty && FillColorBottom != FillColor)
                {
                    using (LinearGradientBrush lgb = new LinearGradientBrush(rect, FillColor, FillColorBottom, LinearGradientMode.Vertical))
                    {
                        g.FillPath(lgb, path);
                    }
                }
                else
                {
                    using (SolidBrush bgBrush = new SolidBrush(FillColor))
                    {
                        g.FillPath(bgBrush, path);
                    }
                }

                using (Pen bPen = new Pen(BorderColor, BorderWidth))
                {
                    if (DashedBorder) bPen.DashStyle = DashStyle.Dash;
                    g.DrawPath(bPen, path);
                }
            }
        }
    }

    public class MainForm : Form
    {
        // ================= 静态字典（仅用于卡池分类与5星数量计数） =================
        private static readonly Dictionary<string, PoolMetaInfo> KnownPools = new Dictionary<string, PoolMetaInfo>
        {
            { "hero:1", new PoolMetaInfo { Kind = "hero_standard", Name = "常规招募" } },
            { "hero:2", new PoolMetaInfo { Kind = "hero_limited", Name = "公主招募" } },
            { "hero:3", new PoolMetaInfo { Kind = "hero_standard", Name = "新锐招募" } },
            { "hero:5", new PoolMetaInfo { Kind = "hero_limited", Name = "幽夜招募" } },
            { "pet:1", new PoolMetaInfo { Kind = "pet_standard", Name = "魔物常规" } },
            { "pet:2", new PoolMetaInfo { Kind = "pet_standard", Name = "常规贩售" } },
            { "pet:3", new PoolMetaInfo { Kind = "pet_limited", Name = "御卫贩售" } },
            { "pet:4", new PoolMetaInfo { Kind = "pet_standard", Name = "神秘贩售" } },
            { "pet:5", new PoolMetaInfo { Kind = "pet_limited", Name = "古堡贩售" } }
        };

        private static readonly HashSet<string> FiveStarIds = new HashSet<string>
        {
            "hero_019", "hero_043", "hero_049", "hero_050", "hero_051", "hero_053",
            "hero_055", "hero_060", "hero_061", "hero_064", "hero_065", "hero_071",
            "pet_074", "pet_077", "pet_078", "pet_079", "pet_104", "pet_106", "pet_118"
        };

        // ================= UI 控件 (对标 GachaAnalysisView 羊皮纸终端风) =================
        private Panel panelHeader;
        private Label lblHeaderTitle;
        private Label lblHeaderSub;
        private Label lblStatusRight;
        private ParchmentButton btnReconnect;

        private ParchmentCardPanel panelProfileCard;
        private Panel panelAvatarBadge;
        private Label lblPlayerName;
        private Label lblUidPill;
        private ParchmentButton btnHeaderCopy;
        private ParchmentButton btnHeaderClear;

        private ParchmentCardPanel panelStatsBanner;
        private Label lblTotalPullsValue;
        private Label lblModeStatusValue;

        private ParchmentCardPanel panelStatusPill;
        private Label lblStatusPillText;
        private ParchmentCardPanel panelDateStamp;
        private Label lblDateStampValue;

        private ParchmentCardPanel colHeroCard;
        private Label lblColHeroPulls;
        private Label lblColHeroSubLeft;
        private Label lblColHeroSubRight;

        private ParchmentCardPanel colPetCard;
        private Label lblColPetPulls;
        private Label lblColPetSubLeft;
        private Label lblColPetSubRight;

        private ParchmentCardPanel colStdCard;
        private Label lblColStdPulls;
        private Label lblColStdSubLeft;
        private Label lblColStdSubRight;

        private ParchmentButton btnDirectPull;
        private ParchmentButton btnExportAndOpen;
        private ParchmentButton btnOpenFolder;

        private ParchmentCardPanel panelLogContainer;
        private Label lblLogTitle;
        private TextBox txtLogs;

        // ================= 抓包与协议直连状态 =================
        private readonly object stateLock = new object();
        private string adbPath = "";
        private string targetDevice = "";
        private bool useSuWrapper = false;
        private string runningGamePkg = "";
        private string gameServerHost = "";
        private int gameServerPort = 0;
        private string capturedToken = "";
        private string playerUid = "";
        private string playerNick = "";
        private string playerAvatar = "";

        private int heroServerTotal = 0;
        private int petServerTotal = 0;
        private string lastQueryType = "hero";
        private long lastPullMs = 0;
        private bool isPulling = false;
        private bool hasAutoPulledOnce = false;
        private string lastPullError = "";

        private Process snifferProcess = null;
        private StringBuilder rawBuffer = new StringBuilder();
        private Dictionary<long, GachaItem> recordsMap = new Dictionary<long, GachaItem>();
        private string outputPath = "";

        private string GetExeDirectory()
        {
            try
            {
                string p = Application.ExecutablePath;
                if (!string.IsNullOrEmpty(p))
                {
                    string d = Path.GetDirectoryName(p);
                    if (!string.IsNullOrEmpty(d) && Directory.Exists(d)) return d;
                }
            }
            catch { }
            return AppDomain.CurrentDomain.BaseDirectory;
        }

        private string GetOutputFilePath()
        {
            return Path.Combine(GetExeDirectory(), "gacha_records.json");
        }

        public MainForm()
        {
            InitializeComponent();
            outputPath = GetOutputFilePath();

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

            recordsMap.Clear();
            UpdateBoardUI();
            UpdateStatusRightUI();

            this.Shown += (s, e) => new Thread(InitSniffer) { IsBackground = true }.Start();
            this.FormClosing += (s, e) => StopSniffer();
        }

        private void InitializeComponent()
        {
            this.Text = "深渊大书院 · 抽卡记录导出终端";
            this.AutoScaleDimensions = new SizeF(96f, 96f);
            this.AutoScaleMode = AutoScaleMode.Dpi;
            this.Size = new Size(794, 620);
            this.MinimumSize = new Size(780, 560);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(245, 238, 222); // #F5EEDE 羊皮纸主底色
            this.Font = new Font("Microsoft YaHei UI", 9f, FontStyle.Regular);

            // ================= 1. 顶部深色原木导航栏 (#2B1F15) =================
            panelHeader = new Panel();
            panelHeader.Dock = DockStyle.Top;
            panelHeader.Height = 54;
            panelHeader.BackColor = Color.FromArgb(43, 31, 21);
            panelHeader.Paint += (s, e) => {
                using (Pen pen = new Pen(Color.FromArgb(163, 111, 10), 1.6f))
                {
                    e.Graphics.DrawLine(pen, 0, panelHeader.Height - 1, panelHeader.Width, panelHeader.Height - 1);
                }
            };

            lblHeaderTitle = new Label();
            lblHeaderTitle.Text = "✦ 招募记录导出";
            lblHeaderTitle.Font = new Font("微软雅黑", 11.5f, FontStyle.Bold);
            lblHeaderTitle.ForeColor = Color.FromArgb(248, 238, 220);
            lblHeaderTitle.Location = new Point(16, 8);
            lblHeaderTitle.AutoSize = true;

            lblHeaderSub = new Label();
            lblHeaderSub.Text = "深渊之歌 · 大书院采样终端";
            lblHeaderSub.Font = new Font("微软雅黑", 7.8f, FontStyle.Regular);
            lblHeaderSub.ForeColor = Color.FromArgb(201, 178, 146);
            lblHeaderSub.Location = new Point(20, 31);
            lblHeaderSub.AutoSize = true;

            btnReconnect = new ParchmentButton();
            btnReconnect.Text = "重新连接";
            btnReconnect.IconType = DoodleIconType.Refresh;
            btnReconnect.Font = new Font("微软雅黑", 8.5f, FontStyle.Bold);
            btnReconnect.Size = new Size(98, 28);
            btnReconnect.CornerRadius = 6;
            btnReconnect.BaseColor = Color.FromArgb(59, 43, 30);
            btnReconnect.HoverColor = Color.FromArgb(88, 63, 44);
            btnReconnect.PressedColor = Color.FromArgb(43, 31, 21);
            btnReconnect.BorderColor = Color.FromArgb(163, 111, 10);
            btnReconnect.TextColor = Color.FromArgb(254, 243, 199);
            btnReconnect.Location = new Point(440, 13);
            btnReconnect.Click += BtnReconnect_Click;

            lblStatusRight = new Label();
            lblStatusRight.Text = "● 正在探测模拟器...";
            lblStatusRight.Font = new Font("微软雅黑", 8.8f, FontStyle.Bold);
            lblStatusRight.ForeColor = Color.FromArgb(217, 119, 6);
            lblStatusRight.AutoSize = true;
            lblStatusRight.Location = new Point(550, 18);

            panelHeader.Controls.Add(lblHeaderTitle);
            panelHeader.Controls.Add(lblHeaderSub);
            panelHeader.Controls.Add(btnReconnect);
            panelHeader.Controls.Add(lblStatusRight);
            panelHeader.Resize += (s, e) => {
                lblStatusRight.Left = panelHeader.ClientSize.Width - lblStatusRight.Width - 16;
                btnReconnect.Left = lblStatusRight.Left - btnReconnect.Width - 12;
            };

            // ================= 2. 羊皮纸主档案与三大指标卡 (对标 GachaAnalysisView) =================
            panelProfileCard = new ParchmentCardPanel();
            panelProfileCard.Location = new Point(16, 64);
            panelProfileCard.Size = new Size(746, 250);
            panelProfileCard.FillColor = Color.FromArgb(235, 222, 201);
            panelProfileCard.FillColorBottom = Color.FromArgb(220, 202, 173);
            panelProfileCard.BorderColor = Color.FromArgb(143, 115, 81);
            panelProfileCard.BorderWidth = 1.8f;
            panelProfileCard.CornerRadius = 12;

            // 2.1 头像徽章 + 昵称 + UID + 右上角 复制/清空
            panelAvatarBadge = new Panel();
            panelAvatarBadge.Location = new Point(16, 14);
            panelAvatarBadge.Size = new Size(46, 46);
            panelAvatarBadge.BackColor = Color.Transparent;
            panelAvatarBadge.Paint += (s, e) => {
                Graphics g = e.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (SolidBrush bg = new SolidBrush(Color.FromArgb(235, 222, 201)))
                {
                    g.FillRectangle(bg, 0, 0, 46, 46);
                }
                Rectangle circle = new Rectangle(2, 2, 41, 41);
                using (SolidBrush fill = new SolidBrush(Color.FromArgb(247, 232, 208)))
                using (Pen border = new Pen(Color.FromArgb(143, 115, 81), 2.2f))
                {
                    g.FillEllipse(fill, circle);
                    g.DrawEllipse(border, circle);
                }
                using (SolidBrush slime = new SolidBrush(Color.FromArgb(228, 134, 165)))
                using (Pen slimePen = new Pen(Color.FromArgb(120, 68, 86), 1.4f))
                {
                    g.FillEllipse(slime, 11, 14, 23, 19);
                    g.DrawEllipse(slimePen, 11, 14, 23, 19);
                }
                using (SolidBrush eye = new SolidBrush(Color.FromArgb(62, 42, 20)))
                {
                    g.FillEllipse(eye, 17, 21, 3, 4);
                    g.FillEllipse(eye, 25, 21, 3, 4);
                }
            };

            lblPlayerName = new Label();
            lblPlayerName.Text = "小小工匠";
            lblPlayerName.Font = new Font("微软雅黑", 12f, FontStyle.Bold);
            lblPlayerName.ForeColor = Color.FromArgb(43, 31, 21);
            lblPlayerName.BackColor = Color.Transparent;
            lblPlayerName.Location = new Point(70, 14);
            lblPlayerName.AutoSize = true;

            lblUidPill = new Label();
            lblUidPill.Text = "UID: 未录入";
            lblUidPill.Font = new Font("微软雅黑", 8f, FontStyle.Regular);
            lblUidPill.ForeColor = Color.FromArgb(95, 73, 48);
            lblUidPill.BackColor = Color.FromArgb(243, 235, 219);
            lblUidPill.BorderStyle = BorderStyle.FixedSingle;
            lblUidPill.Padding = new Padding(4, 1, 4, 1);
            lblUidPill.Location = new Point(70, 39);
            lblUidPill.AutoSize = true;

            btnHeaderCopy = new ParchmentButton();
            btnHeaderCopy.Text = "复制";
            btnHeaderCopy.IconType = DoodleIconType.Copy;
            btnHeaderCopy.Font = new Font("微软雅黑", 8.5f, FontStyle.Bold);
            btnHeaderCopy.Size = new Size(76, 28);
            btnHeaderCopy.CornerRadius = 7;
            btnHeaderCopy.BaseColor = Color.FromArgb(245, 240, 230);
            btnHeaderCopy.HoverColor = Color.FromArgb(232, 222, 204);
            btnHeaderCopy.BorderColor = Color.FromArgb(176, 152, 122);
            btnHeaderCopy.Location = new Point(576, 16);
            btnHeaderCopy.Click += BtnCopyJson_Click;

            btnHeaderClear = new ParchmentButton();
            btnHeaderClear.Text = "清空";
            btnHeaderClear.IconType = DoodleIconType.Trash;
            btnHeaderClear.Font = new Font("微软雅黑", 8.5f, FontStyle.Bold);
            btnHeaderClear.Size = new Size(74, 28);
            btnHeaderClear.CornerRadius = 7;
            btnHeaderClear.BaseColor = Color.FromArgb(254, 238, 238);
            btnHeaderClear.HoverColor = Color.FromArgb(254, 222, 222);
            btnHeaderClear.PressedColor = Color.FromArgb(248, 200, 200);
            btnHeaderClear.TextColor = Color.FromArgb(185, 28, 28);
            btnHeaderClear.BorderColor = Color.FromArgb(228, 168, 168);
            btnHeaderClear.Location = new Point(658, 16);
            btnHeaderClear.Click += BtnClearCache_Click;

            // 2.2 关键统计横幅（总捕获 | 抓取模式）
            panelStatsBanner = new ParchmentCardPanel();
            panelStatsBanner.Location = new Point(16, 68);
            panelStatsBanner.Size = new Size(714, 38);
            panelStatsBanner.FillColor = Color.FromArgb(245, 238, 224);
            panelStatsBanner.BorderColor = Color.FromArgb(209, 190, 165);
            panelStatsBanner.BorderWidth = 1f;
            panelStatsBanner.CornerRadius = 8;

            Label lblStatCapLabel = new Label();
            lblStatCapLabel.Text = "总捕获";
            lblStatCapLabel.Font = new Font("微软雅黑", 8.8f, FontStyle.Regular);
            lblStatCapLabel.ForeColor = Color.FromArgb(122, 98, 72);
            lblStatCapLabel.BackColor = Color.FromArgb(245, 238, 224);
            lblStatCapLabel.Location = new Point(98, 10);
            lblStatCapLabel.AutoSize = true;

            lblTotalPullsValue = new Label();
            lblTotalPullsValue.Text = "0 抽";
            lblTotalPullsValue.Font = new Font("微软雅黑", 10.5f, FontStyle.Bold);
            lblTotalPullsValue.ForeColor = Color.FromArgb(190, 60, 80);
            lblTotalPullsValue.BackColor = Color.FromArgb(245, 238, 224);
            lblTotalPullsValue.Location = new Point(150, 8);
            lblTotalPullsValue.AutoSize = true;

            Panel divider = new Panel();
            divider.Location = new Point(356, 8);
            divider.Size = new Size(1, 22);
            divider.BackColor = Color.FromArgb(209, 190, 165);

            Label lblStatModeLabel = new Label();
            lblStatModeLabel.Text = "抓取模式";
            lblStatModeLabel.Font = new Font("微软雅黑", 8.8f, FontStyle.Regular);
            lblStatModeLabel.ForeColor = Color.FromArgb(122, 98, 72);
            lblStatModeLabel.BackColor = Color.FromArgb(245, 238, 224);
            lblStatModeLabel.Location = new Point(445, 10);
            lblStatModeLabel.AutoSize = true;

            lblModeStatusValue = new Label();
            lblModeStatusValue.Text = "等待游戏请求";
            lblModeStatusValue.Font = new Font("微软雅黑", 10f, FontStyle.Bold);
            lblModeStatusValue.ForeColor = Color.FromArgb(2, 132, 199);
            lblModeStatusValue.BackColor = Color.FromArgb(245, 238, 224);
            lblModeStatusValue.Location = new Point(512, 9);
            lblModeStatusValue.AutoSize = true;

            panelStatsBanner.Controls.Add(lblStatCapLabel);
            panelStatsBanner.Controls.Add(lblTotalPullsValue);
            panelStatsBanner.Controls.Add(divider);
            panelStatsBanner.Controls.Add(lblStatModeLabel);
            panelStatsBanner.Controls.Add(lblModeStatusValue);

            // 2.3 状态胶囊 + 右侧虚线统计印章
            panelStatusPill = new ParchmentCardPanel();
            panelStatusPill.Location = new Point(16, 114);
            panelStatusPill.Size = new Size(478, 34);
            panelStatusPill.FillColor = Color.FromArgb(2, 132, 199);
            panelStatusPill.BorderColor = Color.FromArgb(3, 105, 161);
            panelStatusPill.BorderWidth = 1f;
            panelStatusPill.CornerRadius = 7;

            lblStatusPillText = new Label();
            lblStatusPillText.Text = "协议直连  《游戏内点开记录查询或任意界面，秒抓令牌全量拉取》";
            lblStatusPillText.Font = new Font("微软雅黑", 8.6f, FontStyle.Bold);
            lblStatusPillText.ForeColor = Color.White;
            lblStatusPillText.BackColor = Color.Transparent;
            lblStatusPillText.Location = new Point(12, 8);
            lblStatusPillText.AutoSize = true;
            panelStatusPill.Controls.Add(lblStatusPillText);

            panelDateStamp = new ParchmentCardPanel();
            panelDateStamp.Location = new Point(504, 114);
            panelDateStamp.Size = new Size(226, 34);
            panelDateStamp.FillColor = Color.FromArgb(238, 227, 206);
            panelDateStamp.BorderColor = Color.FromArgb(143, 115, 81);
            panelDateStamp.BorderWidth = 1.1f;
            panelDateStamp.DashedBorder = true;
            panelDateStamp.CornerRadius = 6;

            Label lblStampSub = new Label();
            lblStampSub.Text = "大书院采样自";
            lblStampSub.Font = new Font("微软雅黑", 7.8f, FontStyle.Regular);
            lblStampSub.ForeColor = Color.FromArgb(122, 98, 72);
            lblStampSub.BackColor = Color.FromArgb(238, 227, 206);
            lblStampSub.Location = new Point(10, 9);
            lblStampSub.AutoSize = true;

            lblDateStampValue = new Label();
            lblDateStampValue.Text = DateTime.Now.ToString("yyyy年MM月dd日");
            lblDateStampValue.Font = new Font("微软雅黑", 8.6f, FontStyle.Bold);
            lblDateStampValue.ForeColor = Color.FromArgb(43, 31, 21);
            lblDateStampValue.BackColor = Color.FromArgb(238, 227, 206);
            lblDateStampValue.Location = new Point(98, 8);
            lblDateStampValue.AutoSize = true;

            panelDateStamp.Controls.Add(lblStampSub);
            panelDateStamp.Controls.Add(lblDateStampValue);

            // 2.4 三大卡池并排卡片 (伙伴 | 魔物 | 常规) —— 对齐分析页无进度条
            int colW = 230;
            int colH = 78;
            int colY = 156;
            int colGap = 12;

            colHeroCard = BuildPoolColumnCard(16, colY, colW, colH, "伙伴（限定）",
                out lblColHeroPulls, out lblColHeroSubLeft, out lblColHeroSubRight);

            colPetCard = BuildPoolColumnCard(16 + colW + colGap, colY, colW, colH, "魔物（限定）",
                out lblColPetPulls, out lblColPetSubLeft, out lblColPetSubRight);

            colStdCard = BuildPoolColumnCard(16 + (colW + colGap) * 2, colY, colW, colH, "常规（伙伴/魔物）",
                out lblColStdPulls, out lblColStdSubLeft, out lblColStdSubRight);

            panelProfileCard.Controls.Add(panelAvatarBadge);
            panelProfileCard.Controls.Add(lblPlayerName);
            panelProfileCard.Controls.Add(lblUidPill);
            panelProfileCard.Controls.Add(btnHeaderCopy);
            panelProfileCard.Controls.Add(btnHeaderClear);
            panelProfileCard.Controls.Add(panelStatsBanner);
            panelProfileCard.Controls.Add(panelStatusPill);
            panelProfileCard.Controls.Add(panelDateStamp);
            panelProfileCard.Controls.Add(colHeroCard);
            panelProfileCard.Controls.Add(colPetCard);
            panelProfileCard.Controls.Add(colStdCard);

            // ================= 3. 主操作按钮区 =================
            int btnY = 324;
            int btnH = 38;

            btnDirectPull = new ParchmentButton();
            btnDirectPull.IconType = DoodleIconType.Bolt;
            btnDirectPull.Text = "全量抓取";
            btnDirectPull.Location = new Point(16, btnY);
            btnDirectPull.Size = new Size(236, btnH);
            btnDirectPull.BaseColor = Color.FromArgb(72, 107, 106);
            btnDirectPull.HoverColor = Color.FromArgb(60, 90, 89);
            btnDirectPull.PressedColor = Color.FromArgb(47, 72, 71);
            btnDirectPull.TextColor = Color.FromArgb(255, 253, 248);
            btnDirectPull.BorderColor = Color.FromArgb(60, 90, 89);
            btnDirectPull.Click += BtnDirectPull_Click;

            btnExportAndOpen = new ParchmentButton();
            btnExportAndOpen.IconType = DoodleIconType.Globe;
            btnExportAndOpen.Text = "导出并打开 Wiki 分析页";
            btnExportAndOpen.Location = new Point(264, btnY);
            btnExportAndOpen.Size = new Size(276, btnH);
            btnExportAndOpen.BaseColor = Color.FromArgb(163, 111, 10);
            btnExportAndOpen.HoverColor = Color.FromArgb(146, 99, 8);
            btnExportAndOpen.PressedColor = Color.FromArgb(126, 85, 6);
            btnExportAndOpen.TextColor = Color.FromArgb(255, 253, 248);
            btnExportAndOpen.BorderColor = Color.FromArgb(146, 99, 8);
            btnExportAndOpen.Click += BtnExportAndOpen_Click;

            btnOpenFolder = new ParchmentButton();
            btnOpenFolder.IconType = DoodleIconType.Folder;
            btnOpenFolder.Text = "存储目录";
            btnOpenFolder.Location = new Point(552, btnY);
            btnOpenFolder.Size = new Size(210, btnH);
            btnOpenFolder.BaseColor = Color.FromArgb(250, 244, 232);
            btnOpenFolder.HoverColor = Color.FromArgb(240, 230, 214);
            btnOpenFolder.PressedColor = Color.FromArgb(226, 212, 192);
            btnOpenFolder.TextColor = Color.FromArgb(62, 42, 20);
            btnOpenFolder.BorderColor = Color.FromArgb(200, 182, 159);
            btnOpenFolder.Click += BtnOpenFolder_Click;

            // ================= 4. 采样日志流卡片 =================
            panelLogContainer = new ParchmentCardPanel();
            panelLogContainer.Location = new Point(16, 372);
            panelLogContainer.Size = new Size(746, 196);
            panelLogContainer.FillColor = Color.FromArgb(252, 249, 242);
            panelLogContainer.BorderColor = Color.FromArgb(200, 182, 159);
            panelLogContainer.BorderWidth = 1.2f;
            panelLogContainer.CornerRadius = 10;
            panelLogContainer.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;

            lblLogTitle = new Label();
            lblLogTitle.Text = "采样日志与协议状态";
            lblLogTitle.Font = new Font("微软雅黑", 8.6f, FontStyle.Bold);
            lblLogTitle.ForeColor = Color.FromArgb(122, 98, 72);
            lblLogTitle.BackColor = Color.FromArgb(252, 249, 242);
            lblLogTitle.Location = new Point(12, 7);
            lblLogTitle.AutoSize = true;

            txtLogs = new TextBox();
            txtLogs.Multiline = true;
            txtLogs.ReadOnly = true;
            txtLogs.BorderStyle = BorderStyle.None;
            txtLogs.ScrollBars = ScrollBars.Vertical;
            txtLogs.BackColor = Color.FromArgb(252, 249, 242);
            txtLogs.ForeColor = Color.FromArgb(70, 52, 36);
            txtLogs.Font = new Font("Microsoft YaHei UI", 9.2f, FontStyle.Regular);
            txtLogs.Location = new Point(12, 28);
            txtLogs.Size = new Size(722, 158);
            txtLogs.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;

            panelLogContainer.Controls.Add(lblLogTitle);
            panelLogContainer.Controls.Add(txtLogs);

            this.Controls.Add(panelHeader);
            this.Controls.Add(panelProfileCard);
            this.Controls.Add(btnDirectPull);
            this.Controls.Add(btnExportAndOpen);
            this.Controls.Add(btnOpenFolder);
            this.Controls.Add(panelLogContainer);
        }

        private ParchmentCardPanel BuildPoolColumnCard(
            int x, int y, int w, int h, string title,
            out Label lblPulls, out Label lblSubLeft, out Label lblSubRight)
        {
            ParchmentCardPanel card = new ParchmentCardPanel();
            card.Location = new Point(x, y);
            card.Size = new Size(w, h);
            card.FillColor = Color.FromArgb(255, 253, 248);
            card.BorderColor = Color.FromArgb(216, 199, 176);
            card.BorderWidth = 1.2f;
            card.CornerRadius = 9;

            Label lblTitle = new Label();
            lblTitle.Text = title;
            lblTitle.Font = new Font("微软雅黑", 8.5f, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(122, 98, 72);
            lblTitle.BackColor = Color.FromArgb(255, 253, 248);
            lblTitle.Location = new Point(12, 8);
            lblTitle.AutoSize = true;

            lblPulls = new Label();
            lblPulls.Text = "0 抽";
            lblPulls.Font = new Font("微软雅黑", 14.5f, FontStyle.Bold);
            lblPulls.ForeColor = Color.FromArgb(43, 31, 21);
            lblPulls.BackColor = Color.FromArgb(255, 253, 248);
            lblPulls.Location = new Point(12, 26);
            lblPulls.AutoSize = true;

            lblSubLeft = new Label();
            lblSubLeft.Text = "5星 0";
            lblSubLeft.Font = new Font("微软雅黑", 8.2f, FontStyle.Bold);
            lblSubLeft.ForeColor = Color.FromArgb(5, 150, 105);
            lblSubLeft.BackColor = Color.FromArgb(255, 253, 248);
            lblSubLeft.Location = new Point(12, 54);
            lblSubLeft.AutoSize = true;

            lblSubRight = new Label();
            lblSubRight.Text = "等待数据";
            lblSubRight.Font = new Font("微软雅黑", 8.0f, FontStyle.Regular);
            lblSubRight.ForeColor = Color.FromArgb(122, 98, 72);
            lblSubRight.BackColor = Color.FromArgb(255, 253, 248);
            lblSubRight.Location = new Point(120, 54);
            lblSubRight.AutoSize = true;

            card.Controls.Add(lblTitle);
            card.Controls.Add(lblPulls);
            card.Controls.Add(lblSubLeft);
            card.Controls.Add(lblSubRight);
            return card;
        }

        private void Log(string msg)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired)
            {
                if (this.IsHandleCreated) this.BeginInvoke(new Action<string>(Log), msg);
                return;
            }
            string timeStr = DateTime.Now.ToString("HH:mm:ss");
            txtLogs.AppendText(string.Format("[{0}] {1}\r\n", timeStr, msg));
            try
            {
                txtLogs.SelectionStart = txtLogs.TextLength;
                txtLogs.ScrollToCaret();
            }
            catch { }
        }

        private void UpdateStatusRightUI()
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired)
            {
                if (this.IsHandleCreated) this.BeginInvoke(new Action(UpdateStatusRightUI));
                return;
            }

            if (string.IsNullOrEmpty(targetDevice))
            {
                lblStatusRight.Text = "○ 未连接模拟器 | 等待启动";
                lblStatusRight.ForeColor = Color.FromArgb(239, 68, 68);
            }
            else if (!string.IsNullOrEmpty(capturedToken) && !string.IsNullOrEmpty(gameServerHost))
            {
                lblStatusRight.Text = string.Format("● {0} | 令牌就绪", targetDevice);
                lblStatusRight.ForeColor = Color.FromArgb(52, 211, 153);
            }
            else
            {
                lblStatusRight.Text = string.Format("● {0} | 监听令牌中", targetDevice);
                lblStatusRight.ForeColor = Color.FromArgb(251, 191, 36);
            }

            lblStatusRight.Left = panelHeader.ClientSize.Width - lblStatusRight.Width - 16;
            if (btnReconnect != null) btnReconnect.Left = lblStatusRight.Left - btnReconnect.Width - 12;
        }

        private void BtnReconnect_Click(object sender, EventArgs e)
        {
            if (btnReconnect == null || !btnReconnect.Enabled) return;
            btnReconnect.Enabled = false;
            btnReconnect.Text = "连接中...";
            Log("[!] 正在重新探测模拟器与游戏服务器...");

            new Thread(() => {
                try
                {
                    StopSniffer();
                    InitSniffer(true);
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
            }) { IsBackground = true }.Start();
        }

        private void InitSniffer()
        {
            InitSniffer(false);
        }

        private void InitSniffer(bool allowManualPick)
        {
            Log("正在探测系统 ADB 与运行中的模拟器...");
            if (string.IsNullOrEmpty(adbPath) || !File.Exists(adbPath))
            {
                adbPath = FindAdb();
            }

            if (string.IsNullOrEmpty(adbPath) && allowManualPick && !this.IsDisposed && this.IsHandleCreated)
            {
                string picked = "";
                this.Invoke(new Action(() => {
                    if (MessageBox.Show(
                        "未能自动定位模拟器目录中的 adb.exe。\n是否手动选择模拟器安装目录下的 adb.exe？",
                        "定位模拟器 ADB", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                    {
                        using (OpenFileDialog ofd = new OpenFileDialog())
                        {
                            ofd.Title = "请选择模拟器目录中的 adb.exe";
                            ofd.Filter = "ADB 程序 (adb.exe;nox_adb.exe)|adb.exe;nox_adb.exe|所有文件 (*.*)|*.*";
                            if (ofd.ShowDialog(this) == DialogResult.OK)
                            {
                                picked = ofd.FileName;
                            }
                        }
                    }
                }));
                if (!string.IsNullOrEmpty(picked) && File.Exists(picked))
                {
                    adbPath = picked;
                }
            }

            if (string.IsNullOrEmpty(adbPath))
            {
                Log("[×] 未找到有效的 adb.exe！请确认已启动雷电/MuMu等模拟器，再点击右上角【重新连接】手动指定或重试。");
                UpdateDeviceStatus(false, "");
                return;
            }
            Log(string.Format("[✓] 定位 ADB 工具: {0}", adbPath));

            List<string> allDevices = new List<string>();
            targetDevice = DetectDevice(adbPath, allDevices);
            if (string.IsNullOrEmpty(targetDevice))
            {
                Log("[!] 尝试扫描 雷电 / MuMu / 夜神 / 逍遥 常见 ADB 端口...");
                int[] ports = new int[] { 5555, 16384, 5557, 5559, 5561, 7555, 62001, 21503, 5554, 5556, 5558, 16385, 26944 };
                foreach (int p in ports)
                {
                    RunCmd(adbPath, string.Format("connect 127.0.0.1:{0}", p));
                    targetDevice = DetectDevice(adbPath, allDevices);
                    if (!string.IsNullOrEmpty(targetDevice)) break;
                }
            }
            if (allDevices.Count > 1 && !string.IsNullOrEmpty(targetDevice))
            {
                Log(string.Format("[!] 检测到多个 ADB 设备 ({0})，已优先选择模拟器: {1}",
                    string.Join(", ", allDevices.ToArray()), targetDevice));
            }

            if (string.IsNullOrEmpty(targetDevice))
            {
                Log("[×] 未能自动连接到模拟器！若使用雷电模拟器，请检查：");
                Log("    1. 右上角【设置】→【其他设置】→ 将【ADB调试】改为【开启本地连接】或【开启远程连接】；");
                Log("    2. 在同一界面将【Root权限】设为【开启】，保存并重启模拟器后点击【重新连接】。");
                UpdateDeviceStatus(false, "");
                return;
            }

            Log(string.Format("[✓] 已连接模拟器: {0}", targetDevice));
            UpdateStatusRightUI();

            EnsureRoot(targetDevice);
            DiscoverGameServerEndpoint();
            DiscoverPlayerUidFromDevice();
            StartTcpdump();
        }

        private string RunShell(string cmd)
        {
            if (useSuWrapper)
            {
                string escaped = cmd.Replace("'", "'\\''");
                return RunCmd(adbPath, string.Format("-s {0} shell \"su -c '{1}'\"", targetDevice, escaped));
            }
            return RunCmd(adbPath, string.Format("-s {0} shell \"{1}\"", targetDevice, cmd));
        }

        private void EnsureRoot(string device)
        {
            useSuWrapper = false;
            try
            {
                string idOut = RunCmd(adbPath, string.Format("-s {0} shell id", device));
                if (idOut.Contains("uid=0"))
                {
                    Log("[✓] Root 权限就绪 (uid=0)。");
                    return;
                }

                // 先检测雷电等模拟器常见的 su 提权通道
                string suId = RunCmd(adbPath, string.Format("-s {0} shell \"su -c id 2>/dev/null\"", device));
                if (suId.Contains("uid=0"))
                {
                    useSuWrapper = true;
                    Log("[✓] 已通过 su 获取 Root 权限 (uid=0)。");
                    return;
                }

                Log("[!] 正在请求模拟器 ADB Root 权限以捕获会话令牌...");
                RunCmd(adbPath, string.Format("-s {0} root", device));
                Thread.Sleep(1000);
                if (device.Contains(":")) RunCmd(adbPath, string.Format("connect {0}", device));

                idOut = RunCmd(adbPath, string.Format("-s {0} shell id", device));
                if (idOut.Contains("uid=0"))
                {
                    Log("[✓] Root 权限就绪。");
                    return;
                }

                suId = RunCmd(adbPath, string.Format("-s {0} shell \"su -c id 2>/dev/null\"", device));
                if (suId.Contains("uid=0"))
                {
                    useSuWrapper = true;
                    Log("[✓] 已通过 su 获取 Root 权限。");
                    return;
                }

                Log("[!] 未能自动提权为 uid=0，请在模拟器设置中开启【Root 权限】并重启模拟器。");
            }
            catch (Exception ex)
            {
                Log(string.Format("[!] 提权检测异常: {0}", ex.Message));
            }
        }

        private void DiscoverPlayerUidFromDevice()
        {
            try
            {
                string pkg = "";
                lock (stateLock) { pkg = runningGamePkg; }

                string cmd;
                if (!string.IsNullOrEmpty(pkg))
                {
                    cmd = string.Format("head -c 256 /sdcard/Android/data/{0}/files/save/userSave 2>/dev/null", pkg);
                }
                else
                {
                    cmd = "f=$(ls -t /sdcard/Android/data/*/files/save/userSave 2>/dev/null | head -n 1); [ -n \"$f\" ] && head -c 256 \"$f\" 2>/dev/null";
                }

                string head = RunShell(cmd);
                Match m = Regex.Match(head ?? "", "\"playerId\"\\s*:\\s*(\\d+)");
                if (m.Success)
                {
                    string foundUid = m.Groups[1].Value;
                    bool changed = false;
                    lock (stateLock)
                    {
                        if (foundUid != playerUid)
                        {
                            playerUid = foundUid;
                            playerNick = ""; // 切换账号时清空旧昵称与头像重新查
                            playerAvatar = "";
                            changed = true;
                        }
                    }
                    if (changed)
                    {
                        Log(string.Format("[✓] 读取到游戏账号 UID: {0}{1}", foundUid, string.IsNullOrEmpty(pkg) ? "" : " (" + pkg + ")"));
                        if (this.IsHandleCreated && !this.IsDisposed) this.BeginInvoke(new Action(UpdateBoardUI));
                    }
                }
            }
            catch { }
        }

        private void DiscoverGameServerEndpoint()
        {
            try
            {
                string outStr = RunShell("ss -tpn 2>/dev/null || netstat -tpn 2>/dev/null");
                if (string.IsNullOrEmpty(outStr)) return;

                string[] lines = outStr.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string line in lines)
                {
                    if (!line.Contains("tqpmyrzg") && !line.Contains("myrzg") && !line.Contains("bilibili")) continue;
                    MatchCollection ms = Regex.Matches(line, @"(?:\[::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})\]?:(\d+)");
                    if (ms.Count >= 2)
                    {
                        string remoteIp = ms[ms.Count - 1].Groups[1].Value;
                        int remotePort = int.Parse(ms[ms.Count - 1].Groups[2].Value);
                        if (remotePort != 443 && remotePort != 80 && !remoteIp.StartsWith("127.") && !remoteIp.StartsWith("10.0.2."))
                        {
                            string detectedPkg = "";
                            Match pidMatch = Regex.Match(line, @"pid=(\d+)");
                            if (pidMatch.Success)
                            {
                                string cmdline = RunShell(string.Format("tr '\\0' ' ' < /proc/{0}/cmdline 2>/dev/null", pidMatch.Groups[1].Value));
                                if (!string.IsNullOrEmpty(cmdline))
                                {
                                    detectedPkg = cmdline.Trim().Split(new char[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0];
                                }
                            }
                            lock (stateLock)
                            {
                                gameServerHost = remoteIp;
                                gameServerPort = remotePort;
                                if (!string.IsNullOrEmpty(detectedPkg)) runningGamePkg = detectedPkg;
                            }
                            Log(string.Format("[✓] 锁定游戏逻辑服: {0}:{1}{2}", remoteIp, remotePort,
                                string.IsNullOrEmpty(detectedPkg) ? "" : " [" + detectedPkg + "]"));
                            return;
                        }
                    }
                }
            }
            catch { }
        }

        private void StartTcpdump()
        {
            try
            {
                string whichOut = RunShell("which tcpdump 2>/dev/null || ls /system/bin/tcpdump /system/xbin/tcpdump 2>/dev/null");
                if (string.IsNullOrEmpty(whichOut) || !whichOut.Contains("tcpdump"))
                {
                    Log("[×] 当前模拟器系统未内置 tcpdump 工具，无法嗅探会话令牌。");
                    return;
                }

                RunShell("pkill -9 tcpdump 2>/dev/null || killall -9 tcpdump 2>/dev/null");

                string tcpdumpCmd = "tcpdump -i any -nn -A -s 0 -l tcp and not port 5555 and not port 16384 and not port 7555 and not port 62001";
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = adbPath;
                psi.Arguments = useSuWrapper
                    ? string.Format("-s {0} shell \"su -c '{1}'\"", targetDevice, tcpdumpCmd)
                    : string.Format("-s {0} shell {1}", targetDevice, tcpdumpCmd);
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.StandardOutputEncoding = Encoding.UTF8;
                psi.CreateNoWindow = true;

                snifferProcess = new Process();
                snifferProcess.StartInfo = psi;
                snifferProcess.EnableRaisingEvents = true;

                snifferProcess.OutputDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data)) ProcessPacketChunk(e.Data);
                };
                snifferProcess.ErrorDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data) && (e.Data.Contains("Permission denied") || e.Data.Contains("Operation not permitted")))
                    {
                        Log("[×] 抓包权限受限，请在模拟器设置中开启【Root 权限】！");
                    }
                };

                snifferProcess.Start();
                snifferProcess.BeginOutputReadLine();
                snifferProcess.BeginErrorReadLine();

                Thread.Sleep(400);
                if (!snifferProcess.HasExited)
                {
                    Log("[✓] 监听就绪！请在游戏内点开一次【记录查询】或任意界面，工具捕获令牌后将自动全量拉取。");
                }
            }
            catch (Exception ex)
            {
                Log(string.Format("[×] 启动监听异常: {0}", ex.Message));
            }
        }

        private void ProcessPacketChunk(string chunk)
        {
            bool shouldTriggerAutoPull = false;

            lock (rawBuffer)
            {
                rawBuffer.AppendLine(chunk);
                string text = rawBuffer.ToString();
                string recent = text.Length > 8000 ? text.Substring(text.Length - 8000) : text;

                if (string.IsNullOrEmpty(gameServerHost))
                {
                    Match epM = Regex.Match(recent, @">\s*(\d{1,3}(?:\.\d{1,3}){3})\.(\d+)\s*:");
                    if (epM.Success)
                    {
                        string ip = epM.Groups[1].Value;
                        int port = int.Parse(epM.Groups[2].Value);
                        if (port != 443 && port != 80 && !ip.StartsWith("127.") && !ip.StartsWith("10.0.2."))
                        {
                            if (recent.Contains("\"token\"") || recent.Contains("\"heartbeat\"") || recent.Contains("\"queryType\""))
                            {
                                gameServerHost = ip;
                                gameServerPort = port;
                                Log(string.Format("[✓] 从流量捕获逻辑服: {0}:{1}", ip, port));
                            }
                        }
                    }
                }

                Match tokenM = Regex.Match(recent, "\"token\"\\s*:\\s*\"([^\"]{12,128})\"");
                if (tokenM.Success)
                {
                    string tok = tokenM.Groups[1].Value;
                    if (tok != capturedToken)
                    {
                        capturedToken = tok;
                        Log(string.Format("[✓] 已捕获当前会话令牌 (长度 {0})", tok.Length));
                        if (string.IsNullOrEmpty(gameServerHost)) DiscoverGameServerEndpoint();
                        UpdateStatusRightUI();
                        if (!hasAutoPulledOnce && !isPulling)
                        {
                            hasAutoPulledOnce = true;
                            shouldTriggerAutoPull = true;
                        }
                    }
                }

                Match pidM = Regex.Match(recent, "\"playerInfo\"\\s*:\\s*\\{[^}]*\"id\"\\s*:\\s*(\\d+)");
                if (pidM.Success && string.IsNullOrEmpty(playerUid))
                {
                    playerUid = pidM.Groups[1].Value;
                    this.BeginInvoke(new Action(UpdateBoardUI));
                }

                if (chunk.Contains("\"queryType\":\"gacha\"")) lastQueryType = "gacha";
                else if (chunk.Contains("\"queryType\":\"hero\"")) lastQueryType = "hero";

                Match totalM = Regex.Match(chunk, "\"totalRows\"\\s*:\\s*(\\d+)");
                if (totalM.Success)
                {
                    int detected = int.Parse(totalM.Groups[1].Value);
                    if (detected > 0)
                    {
                        bool isPet = (lastQueryType == "gacha" || chunk.Contains("\"pet_"));
                        if (isPet) petServerTotal = detected;
                        else heroServerTotal = detected;
                    }
                }

                int passiveNew = ExtractRecordsFromJsonWindow(recent);
                if (passiveNew > 0)
                {
                    this.BeginInvoke(new Action(UpdateBoardUI));
                    SaveJsonToDisk();
                }

                if (rawBuffer.Length > 300000)
                {
                    rawBuffer.Remove(0, rawBuffer.Length - 100000);
                }
            }

            if (shouldTriggerAutoPull)
            {
                new Thread(ExecuteDirectFullPull) { IsBackground = true }.Start();
            }
        }

        private int ExtractRecordsFromJsonWindow(string text)
        {
            int newCount = 0;
            MatchCollection matches = Regex.Matches(text, "\\{([^{}]+)\\}");
            lock (stateLock)
            {
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
                            string recTypeId = typeM.Groups[1].Value;
                            string recPoolId = poolM.Groups[1].Value;
                            if (IsSilverCoinRecord(recTypeId, recPoolId)) continue;
                            long id = long.Parse(idM.Groups[1].Value);
                            if (!recordsMap.ContainsKey(id))
                            {
                                long crateRaw = long.Parse(crateM.Groups[1].Value);
                                long atMs = (crateRaw > 100000000000L) ? crateRaw : (crateRaw * 1000L);
                                recordsMap[id] = new GachaItem
                                {
                                    Id = id,
                                    TypeId = recTypeId,
                                    PoolId = recPoolId,
                                    CrateAt = crateRaw,
                                    At = atMs
                                };
                                newCount++;
                            }
                        }
                    }
                }
            }
            return newCount;
        }

        private void BtnDirectPull_Click(object sender, EventArgs e)
        {
            if (isPulling) return;

            if (string.IsNullOrEmpty(capturedToken))
            {
                MessageBox.Show(
                    "尚未捕获到当前游戏会话令牌！\n\n" +
                    "请先在模拟器游戏里点一下【记录查询】（只需点开第一页，不用翻页），或点一下背包/邮箱等任意界面触发一次请求。\n\n" +
                    "工具捕获到令牌后，将在 0.4 秒内自动把伙伴与魔物全部抽卡记录拉取完毕！",
                    "等待捕获令牌", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (string.IsNullOrEmpty(gameServerHost) || gameServerPort <= 0) DiscoverGameServerEndpoint();
            if (string.IsNullOrEmpty(gameServerHost) || gameServerPort <= 0)
            {
                MessageBox.Show("未能探测到游戏逻辑服地址，请确认游戏已进入主界面后点击【重新连接】。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            new Thread(ExecuteDirectFullPull) { IsBackground = true }.Start();
        }

        private void ExecuteDirectFullPull()
        {
            lock (stateLock)
            {
                if (isPulling) return;
                isPulling = true;
                lastPullError = "";
            }

            SetPullButtonBusy(true);
            Stopwatch sw = Stopwatch.StartNew();

            try
            {
                string host, tok, uid;
                int port;
                lock (stateLock)
                {
                    host = gameServerHost;
                    port = gameServerPort;
                    tok = capturedToken;
                    uid = playerUid;
                }

                if (string.IsNullOrEmpty(host) || port <= 0 || string.IsNullOrEmpty(tok))
                {
                    Log("[!] 缺少逻辑服地址或会话令牌，暂无法直连拉取。");
                    return;
                }

                if (string.IsNullOrEmpty(runningGamePkg)) DiscoverGameServerEndpoint();
                DiscoverPlayerUidFromDevice();
                lock (stateLock) { uid = playerUid; }

                Log(string.Format("[→] 正在直连逻辑服 {0}:{1} 全量抓取...", host, port));

                using (TcpClient client = new TcpClient())
                {
                    client.NoDelay = true;
                    client.ReceiveTimeout = 8000;
                    client.SendTimeout = 8000;
                    client.Connect(host, port);

                    using (NetworkStream stream = client.GetStream())
                    {
                        List<byte> recvBuf = new List<byte>();
                        long seq = 90000;

                        // 若已拿到 UID 且用户名或头像未知，优先通过 489 (queryFriendDisplayInfo) / 兜底 28 (queryPlayerSimpleInfo) 拉取真实 UTF-8 昵称与头像 ID
                        long uidNum;
                        bool needProfile;
                        lock (stateLock) { needProfile = string.IsNullOrEmpty(playerNick) || string.IsNullOrEmpty(playerAvatar); }
                        if (!string.IsNullOrEmpty(uid) && long.TryParse(uid, out uidNum) && needProfile)
                        {
                            try
                            {
                                string dispBody = string.Format("{{\"token\":\"{0}\",\"playerId\":{1}}}", EscapeJson(tok), uidNum);
                                ProtocolPacketData uResp = SendAndAwaitSeq(stream, recvBuf, 489, ++seq, dispBody);
                                if (uResp == null || uResp.Code != 0 || string.IsNullOrEmpty(uResp.BodyText) || !uResp.BodyText.Contains("\"nickName\""))
                                {
                                    string qUserBody = string.Format("{{\"token\":\"{0}\",\"playerId\":{1},\"nickName\":\"\"}}", EscapeJson(tok), uidNum);
                                    uResp = SendAndAwaitSeq(stream, recvBuf, 28, ++seq, qUserBody);
                                }
                                if (uResp != null && uResp.Code == 0 && !string.IsNullOrEmpty(uResp.BodyText))
                                {
                                    string parsedNick = "";
                                    string parsedAvatar = "";
                                    Match nm = Regex.Match(uResp.BodyText, "\"nickName\"\\s*:\\s*\"([^\"]+)\"");
                                    if (nm.Success) parsedNick = DecodeJsonString(nm.Groups[1].Value);
                                    Match am = Regex.Match(uResp.BodyText, "\"avatar\"\\s*:\\s*\"([^\"]+)\"");
                                    int parsedSex = ExtractIntField(uResp.BodyText, "sex");
                                    if (am.Success) parsedAvatar = NormalizeGameAvatar(DecodeJsonString(am.Groups[1].Value), parsedSex);

                                    lock (stateLock)
                                    {
                                        if (!string.IsNullOrEmpty(parsedNick)) playerNick = parsedNick;
                                        if (!string.IsNullOrEmpty(parsedAvatar)) playerAvatar = parsedAvatar;
                                    }
                                    if (!string.IsNullOrEmpty(parsedNick) || !string.IsNullOrEmpty(parsedAvatar))
                                    {
                                        Log(string.Format("[✓] 获取玩家信息: {0} (UID: {1}{2})",
                                            string.IsNullOrEmpty(parsedNick) ? "小小工匠" : parsedNick,
                                            uid,
                                            string.IsNullOrEmpty(parsedAvatar) ? "" : ", 头像: " + parsedAvatar));
                                    }
                                }
                            }
                            catch { }
                        }

                        int heroTotalRows = 0;
                        int petTotalRows = 0;
                        int skippedSilver = 0;
                        List<GachaItem> pulledItems = new List<GachaItem>();

                        string[] types = new string[] { "hero", "gacha" };
                        foreach (string qType in types)
                        {
                            ProtocolPacketData pResp = null;
                            for (int attempt = 0; attempt < 3; attempt++)
                            {
                                lock (stateLock) { tok = capturedToken; }
                                string pBody = string.Format("{{\"token\":\"{0}\",\"queryType\":\"{1}\"}}", EscapeJson(tok), qType);
                                pResp = SendAndAwaitSeq(stream, recvBuf, 441, ++seq, pBody);
                                if (pResp != null && pResp.Code == 0) break;
                                if (pResp != null && pResp.Code == 100 && attempt < 2)
                                {
                                    int waitMs = attempt == 0 ? 1200 : 1800;
                                    Log(string.Format("[!] 令牌刚初始化/待刷新 (Code=100)，{0:0.0}秒后自动重试...", waitMs / 1000.0));
                                    Thread.Sleep(waitMs);
                                    continue;
                                }
                                break;
                            }
                            if (pResp == null || pResp.Code != 0)
                            {
                                int failCode = pResp != null ? pResp.Code : -1;
                                string failDesc = pResp != null ? pResp.Desc : "无响应";
                                if (failCode == 100)
                                {
                                    throw new Exception("CODE_100:会话令牌未激活或已过期");
                                }
                                throw new Exception(string.Format("查询 {0} 参数失败: Code={1} {2}", qType, failCode, failDesc));
                            }

                            int totalRows = ExtractIntField(pResp.BodyText, "totalRows");
                            int maxId = ExtractIntField(pResp.BodyText, "maxId") + 1;
                            if (qType == "hero") heroTotalRows = totalRows;
                            else petTotalRows = totalRows;

                            int fetchedType = 0;
                            int skippedTypeSilver = 0;
                            int pages = 0;
                            while (totalRows > 0 && fetchedType < totalRows && pages < 200)
                            {
                                pages++;
                                string dBody = string.Format("{{\"token\":\"{0}\",\"queryType\":\"{1}\",\"maxId\":{2},\"pageSize\":100}}", EscapeJson(tok), qType, maxId);
                                ProtocolPacketData dResp = SendAndAwaitSeq(stream, recvBuf, 442, ++seq, dBody);
                                if (dResp == null || dResp.Code != 0)
                                {
                                    throw new Exception(string.Format("拉取 {0} 第 {1} 页失败: Code={2}", qType, pages, dResp != null ? dResp.Code : -1));
                                }

                                List<GachaItem> pageList = ParsePageDatas(dResp.BodyText);
                                if (pageList.Count == 0) break;

                                foreach (GachaItem item in pageList)
                                {
                                    if (IsSilverCoinRecord(item.TypeId, item.PoolId))
                                    {
                                        skippedSilver++;
                                        skippedTypeSilver++;
                                    }
                                    else
                                    {
                                        pulledItems.Add(item);
                                    }
                                }
                                fetchedType += pageList.Count;
                                maxId = (int)pageList[pageList.Count - 1].Id;
                            }
                            string extraNote = skippedTypeSilver > 0 ? string.Format("，已剔除 {0} 条银币池记录", skippedTypeSilver) : "";
                            Log(string.Format("[✓] {0} 全量抓取完成: {1}/{2} 条 ({3} 页{4})",
                                qType == "hero" ? "伙伴招募" : "魔物贩售", fetchedType, totalRows, pages, extraNote));
                        }

                        sw.Stop();
                        lock (stateLock)
                        {
                            heroServerTotal = heroTotalRows;
                            petServerTotal = petTotalRows;
                            lastPullMs = sw.ElapsedMilliseconds;
                            recordsMap.Clear();
                            foreach (GachaItem item in pulledItems)
                            {
                                recordsMap[item.Id] = item;
                            }
                        }

                        SaveJsonToDisk();
                        if (this.IsHandleCreated && !this.IsDisposed)
                        {
                            this.Invoke(new Action(() => {
                                try
                                {
                                    UpdateBoardUI();
                                    UpdateStatusRightUI();
                                }
                                catch (Exception uiEx)
                                {
                                    Log("[!] 刷新看板异常: " + uiEx.Message);
                                }
                            }));
                        }
                        string silverSummary = skippedSilver > 0 ? string.Format("（已剔除 {0} 条银币池记录）", skippedSilver) : "";
                        Log(string.Format("[✓] 全部抽卡记录直连同步完成！有效 {0} 条{1}，耗时 {2} ms",
                            recordsMap.Count, silverSummary, sw.ElapsedMilliseconds));
                    }
                }
            }
            catch (Exception ex)
            {
                bool isTokExpired = ex.Message != null && (ex.Message.Contains("CODE_100") || ex.Message.Contains("Code=100"));
                lock (stateLock)
                {
                    lastPullError = isTokExpired
                        ? "令牌待刷新：请在游戏内点一下翻页/界面，再点击下方【全量抓取】"
                        : ("抓取失败：" + ex.Message);
                }
                if (isTokExpired)
                {
                    Log("[!] 令牌暂未激活或已过期 (Code=100)：请在游戏内点一下【记录查询】翻页或任意界面，再点击上方【全量抓取】即可！");
                }
                else
                {
                    Log(string.Format("[×] 协议直连拉取失败: {0}（请在游戏内点一下翻页后点击【全量抓取】）", ex.Message));
                }
                if (this.IsHandleCreated && !this.IsDisposed)
                {
                    this.BeginInvoke(new Action(() => { UpdateBoardUI(); UpdateStatusRightUI(); }));
                }
            }
            finally
            {
                lock (stateLock) { isPulling = false; }
                SetPullButtonBusy(false);
            }
        }

        private ProtocolPacketData SendAndAwaitSeq(NetworkStream stream, List<byte> recvBuf, int routerType, long seq, string bodyJson)
        {
            byte[] frame = ProtoWire.EncodeFrame(routerType, seq, bodyJson);
            stream.Write(frame, 0, frame.Length);
            stream.Flush();

            byte[] temp = new byte[16384];
            DateTime deadline = DateTime.UtcNow.AddSeconds(8);
            while (DateTime.UtcNow < deadline)
            {
                while (recvBuf.Count > 0)
                {
                    byte[] arr = recvBuf.ToArray();
                    ulong lenVal;
                    int nextOffset;
                    if (!ProtoWire.TryDecodeVarint(arr, 0, arr.Length, out lenVal, out nextOffset)) break;
                    int frameLen = (int)lenVal;
                    if (arr.Length < nextOffset + frameLen) break;

                    ProtocolPacketData pkt = ProtoWire.ParsePacket(arr, nextOffset, frameLen);
                    recvBuf.RemoveRange(0, nextOffset + frameLen);
                    if (pkt.MessageSeqNum == seq) return pkt;
                }

                int read = stream.Read(temp, 0, temp.Length);
                if (read <= 0) break;
                for (int i = 0; i < read; i++) recvBuf.Add(temp[i]);
            }
            return null;
        }

        private static int ExtractIntField(string json, string field)
        {
            Match m = Regex.Match(json ?? "", "\"" + field + "\"\\s*:\\s*(-?\\d+)");
            return m.Success ? int.Parse(m.Groups[1].Value) : 0;
        }

        private static string DecodeJsonString(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return "";
            return Regex.Replace(raw, @"\\u([0-9a-fA-F]{4})", m =>
                ((char)int.Parse(m.Groups[1].Value, NumberStyles.HexNumber)).ToString());
        }

        private static List<GachaItem> ParsePageDatas(string json)
        {
            List<GachaItem> list = new List<GachaItem>();
            if (string.IsNullOrEmpty(json)) return list;
            MatchCollection ms = Regex.Matches(json, "\\{([^{}]+)\\}");
            foreach (Match m in ms)
            {
                string c = m.Groups[1].Value;
                if (!c.Contains("\"id\"") || !c.Contains("\"typeId\"") || !c.Contains("\"poolId\"") || !c.Contains("\"crateAt\""))
                    continue;
                Match idM = Regex.Match(c, "\"id\"\\s*:\\s*(\\d+)");
                Match typeM = Regex.Match(c, "\"typeId\"\\s*:\\s*\"([^\"]+)\"");
                Match poolM = Regex.Match(c, "\"poolId\"\\s*:\\s*\"?([a-zA-Z0-9_]+)\"?");
                Match crateM = Regex.Match(c, "\"crateAt\"\\s*:\\s*(\\d+)");
                if (idM.Success && typeM.Success && poolM.Success && crateM.Success)
                {
                    long crateRaw = long.Parse(crateM.Groups[1].Value);
                    long atMs = (crateRaw > 100000000000L) ? crateRaw : (crateRaw * 1000L);
                    list.Add(new GachaItem
                    {
                        Id = long.Parse(idM.Groups[1].Value),
                        TypeId = typeM.Groups[1].Value,
                        PoolId = poolM.Groups[1].Value,
                        CrateAt = crateRaw,
                        At = atMs
                    });
                }
            }
            return list;
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        private void SetPullButtonBusy(bool busy)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired)
            {
                if (this.IsHandleCreated) this.BeginInvoke(new Action<bool>(SetPullButtonBusy), busy);
                return;
            }
            bool hasErr;
            lock (stateLock) { hasErr = !string.IsNullOrEmpty(lastPullError); }
            btnDirectPull.Enabled = !busy;
            if (busy)
            {
                btnDirectPull.Text = "正在抓取中...";
            }
            else if (hasErr)
            {
                btnDirectPull.Text = "↻ 重试全量抓取";
                btnDirectPull.BaseColor = Color.FromArgb(180, 83, 9);
                btnDirectPull.HoverColor = Color.FromArgb(146, 64, 14);
                btnDirectPull.PressedColor = Color.FromArgb(120, 53, 15);
                btnDirectPull.BorderColor = Color.FromArgb(146, 64, 14);
            }
            else
            {
                btnDirectPull.Text = "全量抓取";
                btnDirectPull.BaseColor = Color.FromArgb(72, 107, 106);
                btnDirectPull.HoverColor = Color.FromArgb(60, 90, 89);
                btnDirectPull.PressedColor = Color.FromArgb(47, 72, 71);
                btnDirectPull.BorderColor = Color.FromArgb(60, 90, 89);
            }
            btnDirectPull.Invalidate();
        }

        private static bool IsSilverCoinRecord(string typeId, string poolId)
        {
            if (string.IsNullOrEmpty(typeId)) return false;
            if (!typeId.StartsWith("pet_")) return false;
            return poolId == "2" || poolId == "4"; // 2=常规贩售, 4=神秘贩售 (consume_mowu2 银币抽)
        }

        private static readonly Dictionary<string, string> AvatarIdToIconMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { "hero_001", "at001_0" },
            { "new_hero_002", "at002_1" },
            { "hero_002_skin01", "at002a_1" },
            { "hero_005_skin01", "at005a" },
            { "hero_015_skin01", "at015a_0" },
            { "hero_036_skin01", "at036a" },
            { "hero_049_skin01", "at049a_0" },
            { "hero_050_skin01", "at050a_0" },
            { "hero_060_skin01", "at060_a" }
        };

        private static string NormalizeGameAvatar(string avatar, int sex)
        {
            if (string.IsNullOrEmpty(avatar)) return "";
            string av = avatar.Trim();
            if ((av == "at001" || av == "at001_0" || av == "hero_001") && sex == 1) return "at001b_0";
            if (av == "at001" || av == "hero_001") return "at001_0";
            string mapped;
            if (AvatarIdToIconMap.TryGetValue(av, out mapped)) return mapped;
            Match hm = Regex.Match(av, @"^(?:new_)?hero_(\d{3})$");
            if (hm.Success) return "at" + hm.Groups[1].Value + "_0";
            Match pm = Regex.Match(av, @"^pet_(\d{3})$");
            if (pm.Success) return "avatar_pet_" + pm.Groups[1].Value;
            if (Regex.IsMatch(av, @"^at\d+$")) return av + "_0";
            return av;
        }

        private static string ResolvePoolKind(GachaItem it)
        {
            string tId = it.TypeId ?? "";
            string pId = it.PoolId ?? "";
            bool isPet = tId.StartsWith("pet_");
            string normKey = (isPet ? "pet:" : "hero:") + pId;
            PoolMetaInfo meta;
            if (KnownPools.TryGetValue(normKey, out meta)) return meta.Kind;
            return isPet ? "pet_standard" : "hero_standard";
        }

        private void UpdateBoardUI()
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired)
            {
                if (this.IsHandleCreated) this.BeginInvoke(new Action(UpdateBoardUI));
                return;
            }

            List<GachaItem> snapshot;
            int hTotal, pTotal;
            long pullMs;
            string uid, nick, errMsg;
            lock (stateLock)
            {
                snapshot = new List<GachaItem>(recordsMap.Values);
                hTotal = heroServerTotal;
                pTotal = petServerTotal;
                pullMs = lastPullMs;
                uid = playerUid;
                nick = playerNick;
                errMsg = lastPullError;
            }

            lblPlayerName.Text = string.IsNullOrEmpty(nick) ? "小小工匠" : nick;
            lblUidPill.Text = string.IsNullOrEmpty(uid) ? "UID: 未录入" : ("UID: " + uid);

            int heroLimPulls = 0, heroLimFive = 0;
            int petLimPulls = 0, petLimFive = 0;
            int stdHeroPulls = 0, stdPetPulls = 0, stdHeroFive = 0, stdPetFive = 0;
            int totalHeroPulls = 0, totalPetPulls = 0;

            foreach (GachaItem it in snapshot)
            {
                string kind = ResolvePoolKind(it);
                string tId = it.TypeId ?? "";
                bool isFive = FiveStarIds.Contains(tId);

                if (tId.StartsWith("pet_")) totalPetPulls++;
                else totalHeroPulls++;

                if (kind == "hero_limited")
                {
                    heroLimPulls++;
                    if (isFive) heroLimFive++;
                }
                else if (kind == "pet_limited")
                {
                    petLimPulls++;
                    if (isFive) petLimFive++;
                }
                else if (kind == "hero_standard")
                {
                    stdHeroPulls++;
                    if (isFive) stdHeroFive++;
                }
                else
                {
                    stdPetPulls++;
                    if (isFive) stdPetFive++;
                }
            }

            int totalCount = snapshot.Count;

            lblTotalPullsValue.Text = string.Format("{0} 抽", totalCount);
            if (!string.IsNullOrEmpty(errMsg) && totalCount == 0)
            {
                lblModeStatusValue.Text = "需重新抓取";
                lblModeStatusValue.ForeColor = Color.FromArgb(180, 83, 9);
            }
            else if (pullMs > 0 && totalCount > 0)
            {
                lblModeStatusValue.Text = string.Format("协议直连 {0}ms", pullMs);
                lblModeStatusValue.ForeColor = Color.FromArgb(5, 150, 105);
            }
            else if (!string.IsNullOrEmpty(capturedToken))
            {
                lblModeStatusValue.Text = "令牌已就绪";
                lblModeStatusValue.ForeColor = Color.FromArgb(5, 150, 105);
            }
            else
            {
                lblModeStatusValue.Text = "等待游戏请求";
                lblModeStatusValue.ForeColor = Color.FromArgb(2, 132, 199);
            }

            if (!string.IsNullOrEmpty(errMsg))
            {
                panelStatusPill.FillColor = Color.FromArgb(180, 83, 9);
                panelStatusPill.BorderColor = Color.FromArgb(146, 64, 14);
                lblStatusPillText.Text = "⚠ " + errMsg;
            }
            else if (totalCount > 0)
            {
                panelStatusPill.FillColor = Color.FromArgb(5, 150, 105);
                panelStatusPill.BorderColor = Color.FromArgb(4, 120, 87);
                lblStatusPillText.Text = string.Format("当前同步  《已捕获 {0} 条完整历史，点击导出即可打开 Wiki》", totalCount);
            }
            else
            {
                panelStatusPill.FillColor = Color.FromArgb(2, 132, 199);
                panelStatusPill.BorderColor = Color.FromArgb(3, 105, 161);
                lblStatusPillText.Text = "协议直连  《游戏内点开记录查询或任意界面，抓令牌自动拉取》";
            }
            panelStatusPill.Invalidate();

            // 1. 伙伴（限定）
            lblColHeroPulls.Text = string.Format("{0} 抽", heroLimPulls);
            lblColHeroSubLeft.Text = string.Format("5星 {0} 个", heroLimFive);
            lblColHeroSubRight.Text = "伙伴限定池";
            lblColHeroSubRight.Left = colHeroCard.Width - lblColHeroSubRight.Width - 12;

            // 2. 魔物（限定）
            lblColPetPulls.Text = string.Format("{0} 抽", petLimPulls);
            lblColPetSubLeft.Text = string.Format("5星 {0} 个", petLimFive);
            lblColPetSubRight.Text = "魔物限定池";
            lblColPetSubRight.Left = colPetCard.Width - lblColPetSubRight.Width - 12;

            // 3. 常规（伙伴/魔物）
            int stdTotal = stdHeroPulls + stdPetPulls;
            lblColStdPulls.Text = string.Format("{0} 抽", stdTotal);
            lblColStdSubLeft.Text = string.Format("伙伴 {0} / 魔物 {1}", stdHeroPulls, stdPetPulls);
            lblColStdSubRight.Text = string.Format("5星 {0} 个", stdHeroFive + stdPetFive);
            lblColStdSubRight.Left = colStdCard.Width - lblColStdSubRight.Width - 12;
        }

        private void UpdateDeviceStatus(bool connected, string text)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired)
            {
                if (this.IsHandleCreated) this.BeginInvoke(new Action<bool, string>(UpdateDeviceStatus), connected, text);
                return;
            }
            targetDevice = connected ? text : "";
            UpdateStatusRightUI();
        }

        private void BtnClearCache_Click(object sender, EventArgs e)
        {
            if (recordsMap.Count == 0 && string.IsNullOrEmpty(capturedToken)) return;
            if (MessageBox.Show("确认清空当前已捕获的抽卡记录缓存？（不会影响游戏账号内数据，可随时再次点击全量抓取）", "清空确认",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

            lock (stateLock)
            {
                recordsMap.Clear();
                heroServerTotal = 0;
                petServerTotal = 0;
                lastPullMs = 0;
                lastPullError = "";
            }
            SetPullButtonBusy(false);
            UpdateBoardUI();
            Log("[!] 已清空工具当前内存记录，可随时点击【全量抓取】重新同步。");
        }

        private void BtnExportAndOpen_Click(object sender, EventArgs e)
        {
            if (recordsMap.Count == 0)
            {
                MessageBox.Show("当前尚未捕获到任何抽卡记录！\n请先在游戏内打开一次【记录查询】或点击【全量抓取】。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            SaveJsonToDisk();
            string json = GenerateJsonText();
            bool copied = SafeSetClipboardText(json);
            Log(copied ? "[✓] 抽卡数据已保存并复制到系统剪贴板！" : "[!] 数据已保存至本地文件 (剪贴板暂时被占用)。");

            string targetUrl = "https://syzgwiki.top/#/gacha/analysis";
            try
            {
                Process.Start(new ProcessStartInfo(targetUrl) { UseShellExecute = true });
                Log(string.Format("[✓] 正在打开 Wiki 分析页: {0}", targetUrl));
            }
            catch { }

            if (copied)
            {
                MessageBox.Show("抽卡记录已复制到剪贴板！\n已为您打开 Wiki 分析页，点击网页中的【导入记录】粘贴即可查看完整图表。", "导出完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show(string.Format("已为您打开 Wiki 分析页！\n数据已保存至：\n{0}\n\n可直接在网页选择【导入本地 JSON 文件】。", outputPath), "导出完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void BtnCopyJson_Click(object sender, EventArgs e)
        {
            string json = GenerateJsonText();
            if (string.IsNullOrEmpty(json) || recordsMap.Count == 0)
            {
                MessageBox.Show("当前尚未捕获到任何抽卡记录！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            SaveJsonToDisk();
            if (SafeSetClipboardText(json))
            {
                Log("[✓] 抽卡数据 JSON 已复制到剪贴板！");
                MessageBox.Show("抽卡数据 JSON 已成功复制到剪贴板！\n可直接前往 Wiki 分析页粘贴导入。", "复制成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show(string.Format("剪贴板暂被占用，数据已写入本地文件：\n{0}", outputPath), "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private bool SafeSetClipboardText(string text)
        {
            if (string.IsNullOrEmpty(text)) return false;
            for (int i = 0; i < 3; i++)
            {
                try { Clipboard.SetText(text); return true; }
                catch { if (i < 2) Thread.Sleep(20); }
            }
            try { Clipboard.Clear(); Clipboard.SetText(text); return true; }
            catch { }
            return false;
        }

        private void BtnOpenFolder_Click(object sender, EventArgs e)
        {
            try
            {
                string filePath = GetOutputFilePath();
                if (File.Exists(filePath)) Process.Start("explorer.exe", string.Format("/select,\"{0}\"", filePath));
                else Process.Start("explorer.exe", string.Format("\"{0}\"", GetExeDirectory()));
            }
            catch { }
        }

        private string GenerateJsonText()
        {
            List<GachaItem> list;
            string uid, nick, avatar;
            lock (stateLock)
            {
                list = new List<GachaItem>(recordsMap.Values);
                uid = playerUid;
                nick = playerNick;
                avatar = playerAvatar;
            }
            list.Sort((a, b) => a.Id.CompareTo(b.Id));

            StringBuilder sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine("  \"schemaVersion\": 1,");
            sb.AppendLine("  \"source\": \"emulator_direct\",");
            sb.AppendLine(string.Format("  \"exportedAt\": \"{0}\",", DateTime.UtcNow.ToString("o")));
            if (!string.IsNullOrEmpty(uid) || !string.IsNullOrEmpty(nick) || !string.IsNullOrEmpty(avatar))
            {
                sb.Append("  \"player\": {");
                bool needComma = false;
                if (!string.IsNullOrEmpty(uid))
                {
                    sb.Append(string.Format(" \"uid\": \"{0}\"", EscapeJson(uid)));
                    needComma = true;
                }
                if (!string.IsNullOrEmpty(nick))
                {
                    if (needComma) sb.Append(",");
                    sb.Append(string.Format(" \"nickname\": \"{0}\"", EscapeJson(nick)));
                    needComma = true;
                }
                if (!string.IsNullOrEmpty(avatar))
                {
                    if (needComma) sb.Append(",");
                    sb.Append(string.Format(" \"avatar\": \"{0}\"", EscapeJson(avatar)));
                }
                sb.AppendLine(" },");
            }
            sb.AppendLine("  \"records\": [");
            for (int i = 0; i < list.Count; i++)
            {
                GachaItem it = list[i];
                sb.Append(string.Format("    {{ \"id\": {0}, \"typeId\": \"{1}\", \"poolId\": \"{2}\", \"crateAt\": {3}, \"at\": {4} }}",
                    it.Id, EscapeJson(it.TypeId), EscapeJson(it.PoolId), it.CrateAt, it.At));
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
                outputPath = GetOutputFilePath();
                string text = GenerateJsonText();
                File.WriteAllText(outputPath, text, new UTF8Encoding(false));
            }
            catch (Exception ex)
            {
                Log(string.Format("[!] 写入本地 JSON 异常: {0}", ex.Message));
            }
        }

        private void StopSniffer()
        {
            try
            {
                if (snifferProcess != null && !snifferProcess.HasExited) snifferProcess.Kill();
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

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool QueryFullProcessImageName(IntPtr hProcess, int dwFlags, StringBuilder lpExeName, ref int lpdwSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        private static string GetProcessExecutablePath(Process p)
        {
            IntPtr hProc = IntPtr.Zero;
            try
            {
                hProc = OpenProcess(0x1000, false, p.Id); // PROCESS_QUERY_LIMITED_INFORMATION (跨32/64位可用)
                if (hProc != IntPtr.Zero)
                {
                    StringBuilder sb = new StringBuilder(1024);
                    int size = sb.Capacity;
                    if (QueryFullProcessImageName(hProc, 0, sb, ref size))
                    {
                        return sb.ToString();
                    }
                }
            }
            catch { }
            finally
            {
                if (hProc != IntPtr.Zero) CloseHandle(hProc);
            }
            try { return p.MainModule.FileName; } catch { return ""; }
        }

        private static string TryProbeAdbInDir(string dir)
        {
            if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) return "";
            string cur = dir;
            for (int depth = 0; depth < 4 && !string.IsNullOrEmpty(cur); depth++)
            {
                string[] subs = new string[] {
                    Path.Combine(cur, "adb.exe"),
                    Path.Combine(cur, "nox_adb.exe"),
                    Path.Combine(cur, "nx_main", "adb.exe"),
                    Path.Combine(cur, "shell", "adb.exe"),
                    Path.Combine(cur, "bin", "nox_adb.exe"),
                    Path.Combine(cur, "bin", "adb.exe"),
                    Path.Combine(cur, "platform-tools", "adb.exe")
                };
                foreach (string tp in subs)
                {
                    if (File.Exists(tp)) return tp;
                }
                DirectoryInfo parent = Directory.GetParent(cur);
                cur = parent != null ? parent.FullName : null;
            }
            return "";
        }

        private static string FindAdb()
        {
            string envAdb = Environment.GetEnvironmentVariable("ADB_PATH");
            if (!string.IsNullOrEmpty(envAdb) && File.Exists(envAdb)) return envAdb;

            // 1. 优先扫描正在运行的模拟器进程（使用跨 32/64 位安全的 QueryFullProcessImageName）
            try
            {
                Process[] allProcs = Process.GetProcesses();
                foreach (Process p in allProcs)
                {
                    try
                    {
                        string pName = p.ProcessName.ToLowerInvariant();
                        if (pName.Contains("dnplayer") || pName.Contains("ldplayer") || pName.Contains("leidian") ||
                            pName.Contains("ld9box") || pName.Contains("ldbox") || pName.Contains("mumu") ||
                            pName.Contains("nemu") || pName.Contains("nox") || pName.Contains("memu") ||
                            pName.Contains("bluestacks"))
                        {
                            string exePath = GetProcessExecutablePath(p);
                            if (!string.IsNullOrEmpty(exePath) && File.Exists(exePath))
                            {
                                string found = TryProbeAdbInDir(Path.GetDirectoryName(exePath));
                                if (!string.IsNullOrEmpty(found)) return found;
                            }
                        }
                    }
                    catch { }
                }
                foreach (Process p in allProcs)
                {
                    try
                    {
                        if (p.ProcessName.Equals("adb", StringComparison.OrdinalIgnoreCase) ||
                            p.ProcessName.Equals("nox_adb", StringComparison.OrdinalIgnoreCase))
                        {
                            string exePath = GetProcessExecutablePath(p);
                            if (!string.IsNullOrEmpty(exePath) && File.Exists(exePath)) return exePath;
                        }
                    }
                    catch { }
                }
            }
            catch { }

            // 2. 从 Windows 注册表读取雷电/MuMu/夜神等安装路径
            try
            {
                string[] regKeys = new string[] {
                    @"Software\leidian\LDPlayer9",
                    @"Software\leidian\LDPlayer",
                    @"Software\ChangZhi2\dnplayer2",
                    @"Software\XuanZhi\LDPlayer9",
                    @"Software\Netease\MuMuPlayer"
                };
                foreach (string rk in regKeys)
                {
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey(rk))
                    {
                        if (key != null)
                        {
                            foreach (string valName in new string[] { "InstallDir", "InstallPath", "Path" })
                            {
                                string v = key.GetValue(valName) as string;
                                string found = TryProbeAdbInDir(v);
                                if (!string.IsNullOrEmpty(found)) return found;
                            }
                        }
                    }
                }
            }
            catch { }

            // 3. 扫描全部本地固定盘符的常见安装目录（含雷电 4/5/9、MuMu 12/15、夜神、逍遥与 SDK）
            List<string> driveRoots = new List<string>();
            try
            {
                foreach (DriveInfo di in DriveInfo.GetDrives())
                {
                    if (di.DriveType == DriveType.Fixed && di.IsReady) driveRoots.Add(di.RootDirectory.FullName);
                }
            }
            catch { }
            if (driveRoots.Count == 0) driveRoots.AddRange(new string[] { @"C:\", @"D:\", @"E:\", @"F:\", @"G:\" });

            string[] relCandidates = new string[] {
                @"leidian\LDPlayer9\adb.exe",
                @"leidian\LDPlayer4\adb.exe",
                @"leidian\LDPlayer\adb.exe",
                @"LDPlayer\LDPlayer9\adb.exe",
                @"LDPlayer\LDPlayer4\adb.exe",
                @"LDPlayer9\adb.exe",
                @"XuanZhi\LDPlayer9\adb.exe",
                @"XuanZhi\LDPlayer4\adb.exe",
                @"Changzhi\dnplayer2\adb.exe",
                @"Program Files\leidian\LDPlayer9\adb.exe",
                @"Program Files (x86)\leidian\LDPlayer9\adb.exe",
                @"Program Files\LDPlayer\LDPlayer9\adb.exe",
                @"Program Files\XuanZhi\LDPlayer9\adb.exe",
                @"MuMuPlayer\nx_main\adb.exe",
                @"MuMuPlayer\nx_device\12.0\shell\adb.exe",
                @"Program Files\Netease\MuMuPlayer-12.0\shell\adb.exe",
                @"Program Files (x86)\Netease\MuMuPlayer-12.0\shell\adb.exe",
                @"Nox\bin\nox_adb.exe",
                @"Program Files\Nox\bin\nox_adb.exe",
                @"Microvirt\MEmu\adb.exe",
                @"platform-tools\adb.exe"
            };
            foreach (string root in driveRoots)
            {
                foreach (string rel in relCandidates)
                {
                    string candidate = Path.Combine(root, rel);
                    if (File.Exists(candidate)) return candidate;
                }
            }

            // 4. 环境变量 ANDROID_HOME / ANDROID_SDK_ROOT 与 PATH
            foreach (string sdkEnv in new string[] { "ANDROID_HOME", "ANDROID_SDK_ROOT" })
            {
                string sdkDir = Environment.GetEnvironmentVariable(sdkEnv);
                if (!string.IsNullOrEmpty(sdkDir))
                {
                    string candidate = Path.Combine(sdkDir, "platform-tools", "adb.exe");
                    if (File.Exists(candidate)) return candidate;
                }
            }

            try
            {
                string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
                foreach (string dir in pathEnv.Split(';'))
                {
                    string trimmed = dir.Trim().Trim('"');
                    if (!string.IsNullOrEmpty(trimmed))
                    {
                        string candidate = Path.Combine(trimmed, "adb.exe");
                        if (File.Exists(candidate)) return candidate;
                    }
                }
            }
            catch { }

            return "";
        }

        private static string DetectDevice(string adb, List<string> outDevices)
        {
            if (outDevices != null) outDevices.Clear();
            try
            {
                string outStr = RunCmd(adb, "devices");
                if (!string.IsNullOrEmpty(outStr) && (outStr.Contains("daemon not running") || outStr.Contains("killing")))
                {
                    Thread.Sleep(600);
                    outStr = RunCmd(adb, "devices");
                }
                if (string.IsNullOrEmpty(outStr)) return "";

                List<string> candidates = new List<string>();
                string[] lines = outStr.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string rawLine in lines)
                {
                    string line = rawLine.Trim();
                    if (string.IsNullOrEmpty(line) || line.StartsWith("List of") || line.StartsWith("*")) continue;
                    string[] parts = line.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 2 && parts[1].Equals("device", StringComparison.OrdinalIgnoreCase))
                    {
                        string dev = parts[0].Trim();
                        if (!string.IsNullOrEmpty(dev) && !dev.Contains("offline") && !candidates.Contains(dev))
                        {
                            candidates.Add(dev);
                        }
                    }
                }
                if (outDevices != null) outDevices.AddRange(candidates);
                if (candidates.Count == 0) return "";
                if (candidates.Count == 1) return candidates[0];

                // 多设备共存时（如手机 USB 调试与模拟器同时连接），优先选择具备 tcpdump / Root 的模拟器实例
                string bestDev = candidates[0];
                int bestScore = int.MinValue;
                foreach (string dev in candidates)
                {
                    int score = 0;
                    if (dev.Contains(":")) score += 110;
                    else if (dev.StartsWith("emulator-", StringComparison.OrdinalIgnoreCase)) score += 100;

                    string probe = RunCmd(adb, string.Format("-s {0} shell \"which tcpdump 2>/dev/null || ls /system/bin/tcpdump /system/xbin/tcpdump 2>/dev/null; id; su -c id 2>/dev/null; pidof com.taoqipao.myrzg.bilibili game.taptap.tqpmyrzg 2>/dev/null\"", dev));
                    if (!string.IsNullOrEmpty(probe))
                    {
                        if (probe.Contains("tcpdump")) score += 200;
                        if (probe.Contains("uid=0")) score += 50;
                        if (Regex.IsMatch(probe, @"(?m)^\d+$")) score += 20;
                    }
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestDev = dev;
                    }
                }
                return bestDev;
            }
            catch { }
            return "";
        }

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        public static void Main()
        {
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
