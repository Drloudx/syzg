# 抽卡记录分析 —— 方案勘察与设计

> **状态**：方案已定，**未实施**（仅勘察与设计，无代码）
> **核对时间**：2026-11-03
> 目标端：**纯官方客户端**（不改包、不单机化），用户侧通过模拟器获取数据

---

## 一、结论先行

| 问题 | 结论 |
| --- | --- |
| 手机端（官方 APK、无 root）能拿到抽卡记录吗 | **不能**。协议是 TCP + protobuf，客户端不留本地文件 |
| 模拟器能吗 | **能**。两条路都通（Frida Hook / TCP 透明代理） |
| 有没有设备绑定 | **没有**。登录只认 `token` |
| 有没有反外挂检测 | **没有**。7 个程序集里无任何反作弊模块 |
| 最大风险 | 模拟器本身（非技术检测），不是抓包行为 |

用户侧必须装模拟器（云汐/MuMu 均可）。这是协议架构决定的，与实现方式无关。

---

## 二、为什么不能照搬原神那套

原神抽卡记录能做「断网刷新拿 URL」，是因为它的架构是 **WebView + HTTP**：

```text
游戏内 WebView → webstatic.mihoyo.com/... → HTTP 接口返回 JSON
断网刷新 → WebView 暴露正在请求的 URL → 玩家用浏览器复现
```

本游戏不具备任何一个前提：

| 检查项 | 原神 | 深渊之歌 |
| --- | --- | --- |
| 记录页实现 | WebView + H5 | **原生 Unity UI**（`HeroPoolTips.cs`） |
| 传输协议 | HTTP(S)，浏览器可发 | **裸 TCP + protobuf**（`ReciveFilter.cs`） |
| 断网表现 | 暴露 URL | 只提示连接失败 |
| 记录是否落地 | 接口可复现 | 内存 `cacheData`，关页即丢 |

本游戏确有 `UniWebView`（`WebViewHelper.cs`），但仅用于问卷与官网跳转（`MainPanel.cs:182/193`、`LoginPanel.cs:277`），与抽卡记录无关。

---

## 三、协议事实（全部来自源码核实）

| 项 | 事实 | 依据 |
| --- | --- | --- |
| 传输层 | 裸 TCP，**无 TLS/无加密** | `SocketControl.cs` 全文无 `SslStream`/`TlsStream`/`Certificate`/`Aes` |
| 框架 | SuperSocket `EasyClient` | `ConnectAsync(new DnsEndPoint(host, port))` |
| 分帧 | `int32 长度前缀 + N 字节 Protobuf` | `ReciveFilter.cs`：`num = ReadInt32()` → `ReadRawBytes(num)` |
| 包结构 | `ProtocolPacket` 8 字段 | `ProtocolPacket.cs`：`Signature(1)` / `RouterType(2)` / `ServerPushType(3)` / `MessageSeqNum(4)` / `Code(5)` / `Desc(6)` / `ServerTime(7)` / `BodyData(8)` |
| 签名 | **Ed25519，私钥硬编码在客户端** | `SignUtil.cs`：`PrivateKey = "ktR6U4w71ycpUzTZyIfLNRbUQ277zAfptvMyRarqqTI="` |
| 抽卡记录路由 | `441` = queryPageParams，`442` = queryPageData | `RouterTypes.cs:405-408` |
| 记录字段 | `id` / `typeId` / `poolId` / `crateAt` | `PageData.cs` |
| 记录存放 | **仅服务端**，客户端不落盘 | `HeroPoolTips.cs:48` 的 `cacheData` 每次 `OpenHeroPoolRecord()` 新建 |
| 分页口径 | `pageSize = 面板高度 / 36`，约 10~15 条/页 | `HeroPoolTips.cs:150` |
| 客户端存档 | `persistentDataPath/save/userSave`（官方原生行为） | `ClientData.cs:465/506`；但 `ClientSaveData` **无抽卡记录字段** |

**签名的影响**：私钥内置，说明可以自己构造请求，但没必要。透明代理只读不写，签名原样透传，最稳。

---

## 四、账号与设备（决定跨端可行性）

| 检查项 | 结果 |
| --- | --- |
| 登录凭证 | **只有 `token`**（`PlayerMsg` 全部请求形态：`CreaDicInfo("token", ...)`） |
| 设备标识（deviceId / imei / androidId） | 登录链路**完全没有**；仅在 `TDAnalyticsDemo.cs`（第三方统计 SDK 示例）出现 |
| `SystemInfo.deviceUniqueIdentifier` | 无引用 |
| 设备锁 / 单设备绑定 | 无 |
| 多端限制 | 有，但只是 **顶号**（`GameServiceOtherLogin` 推送，`ServerPushTypes.cs:17-18`），同账号不能同时在线 |

结论：**账号可跨端**。用户在模拟器登录自己的号即可，导完退出，回手机继续玩。

---

## 五、两条可行路径

### 路径 1：Frida Hook（推荐，实现最省事）

```text
云汐/MuMu（root）→ 运行 frida-server
        ↓
hook PlayerMsg.ResponseQueryPageData
        ↓
参数 bodyData 已是 {"datas":[...]} 的 JSON 字符串
        ↓
写 /sdcard/Download/myrzg-gacha.json
```

```javascript
Java.perform(function () {
  var PlayerMsg = Java.use('PlayerMsg');
  PlayerMsg.ResponseQueryPageData.implementation = function (bodyData) {
    send({ tag: 'gacha', body: bodyData });
    return this.ResponseQueryPageData(bodyData);
  };
});
```

**为什么最简单**：`ResponseQueryPageData` 收到的 `bodyData` 已经解码完毕，不需要处理分帧、不需要解 protobuf、不需要碰签名。

| 项 | 说明 |
| --- | --- |
| 前置 | 模拟器需 root（云汐自带） |
| 用户操作 | 装 frida-server → 跑脚本 → 游戏内翻一次记录页 |
| 服务端可见 | 与正常玩家完全一致（hook 只拦本地函数） |

### 路径 2：TCP 透明代理（不 root 也行）

```text
模拟器改 hosts → 127.0.0.1:PORT
        ↓
本地代理：读 int32 长度 + protobuf，原样转发
        ↓
RouterType == 442 时，把 BodyData 另存一份
```

| 项 | 说明 |
| --- | --- |
| 前置 | 模拟器能改 hosts（云汐/MuMu 均可） |
| 实现量 | 需实现 `ProtocolPacket` 的 protobuf 解包（8 字段，结构简单） |
| 优点 | 不入侵进程 |

---

## 六、网站端设计（不依赖导出器）

网站只做分析，不碰客户端。数据入口三种，兼容不同用户能力：

```text
/gacha/stats
├─ ① 上传 gacha.json
├─ ② 粘贴 JSON 文本
└─ ③ 手填汇总（抽数 / 出卡数 / 歪数，只算概率）
```

**解析在浏览器本地完成**（`FileReader` + `JSON.parse`），文件不上传服务器。

### 输入格式约定

```json
{
  "schemaVersion": 1,
  "source": "manual | frida | proxy",
  "exportedAt": "2026-11-03T12:00:00+08:00",
  "records": [
    { "id": 1, "typeId": "hero_053", "poolId": "1", "crateAt": 1699999999 }
  ]
}
```

### 可算指标（对照小黑盒）

| 指标 | 算法 | 依赖字段 |
| --- | --- | --- |
| 各池抽数 | 按 `poolId` 分组计数 | `poolId` |
| 出卡数 | 按 `typeId` 查 `rare` 后过滤 | `typeId` |
| 歪数 | 出卡中 `typeId` 不在池 `upTypes` | `typeId` + 池配置 |
| UP 平均抽数 | 池总抽数 ÷ UP 命中次数 | 同上 |
| 距保底（已垫 N/99） | 从末尾倒数到最近一次高稀有 | 排序后推算 |
| 出货时间线 | 按 `crateAt` 排序 | `crateAt` |
| 稀有度分布 | 按 `rare` 分组 | `typeId` |
| 欧非评价 | 需自定义阈值规则 | 需产品定义 |

数据来源：`heroPool.json`（池配置、`rareSetting`、`upTypes`）、`hero.json`（角色 `rare`）。

---

## 七、风险清单

| 风险 | 可能性 | 说明 |
| --- | --- | --- |
| 因模拟器被封 | 低 | 客户端**无模拟器检测代码**；本游戏无 PC 端，官方对模拟器通常宽容 |
| 因透明代理被封 | 很低 | 流量与正常玩家无差别 |
| 因 Frida 被封 | 低 | 无 `frida`/`magisk`/`xposed`/`RootCheck` 检测（全源码 0 命中） |
| 顶号掉线 | 中 | 操作问题：手机与模拟器不能同时在线 |
| 版本更新后工具失效 | **高** | 协议/路由号可能变，必然要跟版本维护 |

**技术层面风险低**，但服务端处罚策略无法从客户端代码验证。页面上须写明「自行承担风险」，建议先用小号试。

---

## 八、待确认（实施前）

| # | 问题 |
| --- | --- |
| 1 | 先做哪个：网站分析页 / 导出器 |
| 2 | 导出触发方式：翻记录页自动写文件，还是显式按钮 |
| 3 | 欧非评价的分档规则（需产品定义） |
| 4 | 导出器是否公开发布（若只做网站端，风险转移给用户自行取数） |

---

## 九、相关文档

| 内容 | 位置 |
| --- | --- |
| 角色/稀有度配置 | `游戏数据/配置表/hero.json` |
| 卡池配置 | `游戏数据/配置表/heroPool.json`、`heroPoolTime.json` |
| 魔物蛋池 | `游戏数据/配置表/petPool.json` |
| 现有招募模拟页 | [GACHA_SIMULATOR](../specs/GACHA_SIMULATOR.md) |
| 协议入口（反编译源码） | `游戏数据/源码/Assembly-CSharp/SocketControl.cs` |
| 记录页 UI | `游戏数据/源码/Assembly-CSharp/HeroPoolTips.cs` |
| 记录请求定义 | `游戏数据/源码/Assembly-CSharp/PlayerMsg.cs:227/238` |
