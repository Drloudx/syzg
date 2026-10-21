# 域名迁移：`syzg.yxzmy.top` → `syzgwiki.top`

> **状态：已上线（2026-10-21 01:50）**。代码、DNS、EdgeOne、Cloudflare 全部就位，
> 线上 `production-smoke.mjs` **18 / 0**，双层头（`EO-*` + `CF-RAY`）同时存在。
> 核对时间：2026-10-21 ｜ 决策见 [DECISIONS.md](DECISIONS.md) #142~#145
>
> **前提**：Android 尚未正式发布（`versionCode 1`、热更清单为测试内容），**无存量用户**，
> 所以本次不做双域名过渡。发版之后此前提失效。
>
> 📌 **实际执行记录见 §九，配置对齐见 §十**（含踩到的坑与最终配置值），本文档前半部分是「该怎么做」。
>
> ⚠️ **本文件不含延迟数字**。本机出口在美国，测出的延迟不代表大陆用户，故不记录。

---

## 零、为什么 Cloudflare 和 EdgeOne 两边都有

这两层**不是二选一**，是串联：

```
用户 → DNSPod 把 syzgwiki.top 指到 EdgeOne（大陆加速）
     → EdgeOne 回源到 syzg.pages.dev（Cloudflare 源站）
     → Cloudflare 按「自定义域」认 Host，交给 Pages 项目 syzg
```

- **Cloudflare 面板的「自定义域」= 源站绑定**：告诉 CF「这个 Host 回哪个项目」。EdgeOne 回源时靠它分发。
- **用户头一跳是 EdgeOne**：因为 DNSPod 不在 CF 那边，域名解析绕过了 CF 的 DNS。

判据（实测响应头）：

```powershell
curl.exe -I https://syzg.yxzmy.top/
# 同时出现：
#   EO-LOG-UUID / EO-Cache-Status   ← EdgeOne
#   CF-RAY / Server: cloudflare     ← Cloudflare
```

只看到一组，说明链路少了一环。**迁移后要用同一条命令验证新域名。**

---

## 一、执行顺序（不可颠倒）

| 步 | 在哪做 | 做什么 | 为什么这个顺序 |
| --- | --- | --- | --- |
| 1 | Cloudflare | 给 `syzg` 项目**添加**自定义域 `syzgwiki.top` | 先让源站认得新 Host，否则后面 DNS 指过来会 522 |
| 2 | 腾讯云 EdgeOne | 添加加速域名 `syzgwiki.top`，回源 `syzg.pages.dev` | 大陆加速层，需先有源站 |
| 3 | DNSPod | `syzgwiki.top` 加 CNAME → EdgeOne 给的加速域名 | 最后切流量，前面都就绪才指 |
| 4 | 本地 | `git push`（代码已改好） | 推送即上线；此时 DNS 已通 |
| 5 | 线上 | 跑验收（见第三节） | 确认全链路 |

> ⚠️ **旧域名先不删**。`syzg.yxzmy.top` 与 `myrzg.yxzmy.top` 在验收通过前保持原样，
> 出问题可立即把 DNSPod 的 CNAME 指回旧 EdgeOne 域名。

---

## 二、Cloudflare 侧（第 1 步）

Pages 项目 `syzg` → **自定义域** → 设置自定义域 → 输入 `syzgwiki.top`。

**注意**：CF 会要求你把域名的 NS 指到 CF，或者用 CNAME 验证。**不要真的改 NS** ——
本站 DNS 在 DNSPod（为了大陆可达性），CF 那边只需要完成「域名所有权验证」即可，
验证通过后 CF 会显示「活动」。

验证方式二选一：
- 在 DNSPod 加一条 CF 要求的 `TXT`/`CNAME` 验证记录（推荐，不动 NS）
- 若 CF 强制要求 NS 接入，则改用 **Pages 项目 → 自定义域 → 允许 CNAME 验证** 的路径

> 若卡住：`syzg.pages.dev` 始终可用，可先用它验证源站没问题，再处理自定义域。

---

## 三、EdgeOne 侧（第 2 步）

腾讯云 EdgeOne 控制台 → 站点加速 → 添加域名：

| 项 | 值 |
| --- | --- |
| 加速域名 | `syzgwiki.top` |
| 源站类型 | 外部源站 |
| 源站地址 | `syzg.pages.dev` |
| 回源协议 | HTTPS |
| 端口 | 443 |

创建后会分配一个 CNAME 目标（形如 `syzgwiki.top.eo.dnse3.com`），**这就是第 3 步要填的**。

**缓存策略建议**（与旧域名保持一致即可）：
- `/api/*` 不缓存
- `/assets/*`、`/data/parsed/**` 长缓存（源站 `_headers` 已声明 `immutable`）
- 首页短 TTL（如 10 分钟），发版后手动刷

---

## 四、DNSPod 侧（第 3 步）

在 `syzgwiki.top` 下添加记录：

| 主机记录 | 类型 | 记录值 | TTL |
| --- | --- | --- | --- |
| `@` | CNAME | EdgeOne 分配的目标 | 600 |

**同一次迁移还要加发信域的记录**（见 §十一）：`mail.syzgwiki.top` 的 MX / SPF / DKIM / DMARC。
`mail.yxzmy.top` 的记录**保持不动**，作为发信退路。

验证解析生效：

```powershell
Resolve-DnsName syzgwiki.top -Type CNAME
# 应指向 EdgeOne 给的目标
```

---

## 五、代码侧（已完成）

| 文件 | 改动 |
| --- | --- |
| `src/utils/env.js` | `DEFAULT_CLOUD_URL = 'https://syzgwiki.top'`，并记录迁移史 |
| `tests/api/production-smoke.mjs` | `BASE` 改新域名 |
| `tests/ui/resilience-overlays.spec.js` | 坏图测试 URL 改新域名 |
| `public/update/hotupdate.json` | `downloadUrl` 改新域名 |
| `index.html` | 注释里的域名 |
| `README.md` / `MAP.md` / `NOW.md` / `DECISIONS.md` / `DOMAIN.md` / `RUNBOOK.md` / `AGENTS.md` | 拓扑、对照表、决策、红线例外 |

**保留未改**（历史记录，改了反而失真）：`docs/history/**`、`env.js` 的迁移史注释、
`site-name.test.mjs` 的历史说明。

> 发信地址**不在保留之列** —— 它在 2026-10-21 的第二轮里改成了 `noreply@mail.syzgwiki.top`，
> 见 §十一。

---

## 六、验收（第 5 步）

```powershell
# 1. 两层都在
curl.exe -I https://syzgwiki.top/

# 2. 站点健康（18 条）
node --no-warnings tests/api/production-smoke.mjs

# 3. 产物里的域名
Select-String -Path dist/assets/*.js -Pattern 'syzgwiki\.top'

# 4. 首页与资源
curl.exe -I https://syzgwiki.top/index.html
curl.exe -I https://syzgwiki.top/images/Common_ItemIcon/item_00001.webp
```

通过标准：第 1 条同时有两组头；第 2 条 18/0；第 3 条命中新域名且**无旧域名**。

---

## 七、回退

任何一步出问题：

| 现象 | 回退动作 |
| --- | --- |
| 新域名 522 / 1016 | 检查 CF 自定义域状态；必要时先删该自定义域重加 |
| 大陆打不开、海外正常 | EdgeOne 没配好或 DNS 未生效；`Resolve-DnsName` 确认 |
| 站点正常但接口 404 | Functions 未随部署生效；CF 里看部署日志 |
| 彻底回退 | DNSPod 把 `syzgwiki.top` 的 CNAME 指回旧 EdgeOne 目标，或直接恢复 `syzg.yxzmy.top` |

**代码侧回退**：`git revert` 那次提交即可，`CLOUD_URL` 会回到旧域。

---

## 八、收尾（验收通过后）

按 [NOW.md](NOW.md) P2「收尾旧域名」：

1. 移除 CF 里 `syzg.yxzmy.top` / `myrzg.yxzmy.top` 的自定义域
2. 移除 EdgeOne 的旧加速域名
3. DNSPod 给旧域名留 301 一段时间（可选）

> 🔴 **`mail.yxzmy.top` 的 DNS 暂时保留**。发信域已迁到 `mail.syzgwiki.top` 且实测可发信，
> 但旧域保持验证状态作为退路（`TENCENT_FROM` 可一键切回）。
>
> 要清理时按「**先删发信地址、再删域名**」两步走，见 §十一「删除发信域的正确顺序」。
> 直接删 DNS 而不删 SES 侧身份，会让它变成「配置了但验证失败」的脏状态。

---

## 九、实际执行记录（2026-10-21）

### 最终生效配置

| 项 | 值 |
| --- | --- |
| Cloudflare Pages 自定义域 | `syzgwiki.top` → 项目 `syzg`，`status: active`，`method: http` |
| EdgeOne 站点 | `syzgwiki.top` = `zone-3wfiuw922p5f`（`partial`，`area=overseas`，独立免费套餐 `edgeone-3szdx806lwf8`） |
| EdgeOne 加速域名 | `syzgwiki.top`，源站 `IP_DOMAIN` → `syzg.pages.dev`，`HostHeader = syzgwiki.top` |
| EdgeOne CNAME 目标 | `syzgwiki.top.eo.dnse3.com` |
| EdgeOne 证书 | `teo-3wfjwqdcrxs3`，`eofreecert`，TrustAsia，有效期至 **2027-01-17** |
| DNSPod 记录 | `@` CNAME → `syzgwiki.top.eo.dnse3.com`（TTL 600） |
| 归属权 TXT | `edgeonereclaim` → `reclaim-cat3v0q0urlvvjbr7a0zdqt8isd2sdj1` |

### 🔴 踩到的坑（下次直接看这里）

| 现象 | 根因 | 解法 |
| --- | --- | --- |
| `LimitExceeded.ZoneBindPlan` | 传了旧站点的 `PlanId`；免费套餐每个站点**各有一个**，不能共用 | 不传 `PlanId`，或让控制台创建（会自动分配新套餐） |
| `VerifyOwnership` 报 `UnknownParameter OneId` | SDK 版本字段名是 `Domain`，但服务端还期望 `ZoneId` | 只传 `Domain`（不传 `ZoneId`） |
| 证书一直 `applying` | `dns_challenge` 的 `_dnsauth` CNAME 指向 `*.eoacme2.com`，而该目标无 A 记录 | 改用 **`http_challenge`**（文件验证），随后 EdgeOne 自动签发成功 |
| TLS 报 `SEC_E_WRONG_PRINCIPAL`，证书是 `*.cdn.myqcloud.com` | EdgeOne 证书尚未部署完成，回落到腾讯云通用 CDN 证书 | **等待即可**，部署完成后自动切换 |
| Windows `curl` 一直报证书错，但 Node 正常 | schannel 缓存了旧证书链 | 用 `node` 的 `tls.connect` 或 `fetch` 验证，别信 `curl` |
| `_dnsauth` 记录已加但仍报「未检测到 DNS 委派记录」 | EdgeOne 该接口要求的是**委派**（NS 级），不是普通 CNAME | 走 `http_challenge` 绕开 |
| 同时存在多个 `applying` 证书 | 重复申请（控制台与 API 各点了一次） | 不影响：`deployed` 那个生效，其余会自动过期 |

### 验证结果

```powershell
# 双层头（必须同时出现）
curl.exe -I https://syzgwiki.top/ | Select-String 'EO-|CF-RAY|Server:'
#   EO-LOG-UUID / EO-Cache-Status   ← EdgeOne
#   CF-RAY / Server: cloudflare     ← Cloudflare
```

| 项 | 结果 |
| --- | --- |
| 双层链路 | `EO-LOG-UUID` 与 `CF-RAY` **同时存在** |
| `production-smoke.mjs` | **18 / 0** |
| TLS 证书 | 受信任，CN=`syzgwiki.top`，TrustAsia，至 2027-01-17 |

> ⚠️ **不记录延迟数字**。本机出口在美国（`loc=US`），测出来的是「美国 → 美东节点」，
> 不能代表大陆用户的实际体验。要评估大陆速度，必须**从大陆网络发起测量**，或看 EdgeOne 控制台的
> 访问数据。此处只保留「配置是否生效」这类与地理无关的判据。

---

## 十、新站点 vs 旧站点的配置对齐（2026-10-21）

新站点建好后是 EdgeOne 默认配置，与旧站点 `yxzmy.top` 有差异。逐项比对后按**大陆访问最优**原则调整。

### 已对齐 / 已调整

| 配置 | 旧站 `yxzmy.top` | 新站原值 | 新站现值 | 说明 |
| --- | --- | --- | --- | --- |
| `MaxAge.MaxAgeTime` | 604800 | 600 | **604800** | 7 天。原来 10 分钟就过期，同一资源一天要回源上百次 |
| `CacheKey.IgnoreCase` | on | off | **on** | URL 大小写归一，避免同一资源存多份缓存 |
| L7 规则「网站加速」 | 有（每域名一条） | **无** | **有** | `rule-3wflk1dsg7tz`；条件 `host in ['syzgwiki.top']`，动作 `Cache` + `CacheKey` |
| `Https.OcspStapling` | off | off | **on** | 省一次 OCSP 查询 |
| `CachePrefresh` | off | off | **on**（90%） | 热点文件提前回源，用户不必等回源 |
| `Ipv6` | off | off | **on** | 部分大陆用户走 IPv6 路径更优 |
| `UpstreamHttp2` | off | off | **on** | 回源用 HTTP/2，多路复用 |

### 刻意不改的

| 配置 | 原因 |
| --- | --- |
| `ImageOptimize` | 项目图片已本地压成 webp，再压会破坏像素；且 [AGENTS.md](../../AGENTS.md) 红线 10 规定图片处理需授权 |
| `Https.Hsts` | 源站 Cloudflare 已发 `Strict-Transport-Security`，EdgeOne 再开重复；且 HSTS 下发后难撤销 |
| `WebSocket` | 项目未使用 |
| `CacheConfig.Cache`（强制缓存） | 会绕过源站 `Cache-Control`，`/api/*` 的 `no-store` 失效 —— 评论数据会被缓存，**不可开** |
| `StandardDebug` | 旧站那个 `Switch=on` 已在 2026-10-08 过期，属临时调试遗留 |

### 🔴 免费版限制（想改但不让改）

| 配置 | 报错 / 依据 | 影响 |
| --- | --- | --- |
| `Quic`（HTTP/3） | `InvalidParameter.InvalidQuicBilling` | 首次握手少 1 RTT 的收益拿不到 |
| `SmartRouting` | `InvalidParameter.InvalidDynamicRoutineBilling` | 无法动态选最优回源路径 |
| `AccelerateMainland` | [官方文档](https://cloud.tencent.cn/document/product/1552/96054)：**仅在 EdgeOne 企业版套餐中提供** | **这是对大陆最关键的一项**：开启后大陆用户调度到香港接入节点。免费版下这对组合（海外站 + 大陆用户）有性能上限 |

### 配置生效的核对方法

```powershell
# 站点级配置
#   DescribeZoneSetting → MaxAge / CacheKey / Https.OcspStapling / Ipv6 / CachePrefresh
# L7 规则
#   DescribeL7AccRules → 应有一条「网站加速-syzgwiki.top」，Status=enable
```

> 写入 `MaxAge` 时注意：SDK 属性名是 `CacheTime`，**服务端字段名是 `MaxAgeTime`**，
> 直接用 SDK 会报 `未定义参数 MaxAge.CacheTime`。改用原始 HTTP 请求（TC3 签名）提交可以绕过。

---

## 十一、发信域迁移（2026-10-21）

站点迁完后，发信地址同步从 `noreply@mail.yxzmy.top` 改为 **`noreply@mail.syzgwiki.top`**。

### 🔴 必须是子域，不能用根域

第一次尝试用根域 `syzgwiki.top`，**失败**：

| 现象 | 原因 |
| --- | --- |
| 根域 TXT（SPF）与 MX 写进去了却解析不出来 | 根域已被 `CNAME → syzgwiki.top.eo.dnse3.com` 占用 |
| `_dmarc` / DKIM 子域正常 | 子域没被 CNAME 占用，所以能解析 |

**DNS 规定 CNAME 不能与 TXT/MX 共存于同一主机名。** 旧的 `mail.yxzmy.top` 用子域，正是同一原因。

处理：删掉根域那两条冲突记录（`@ MX`、`@ TXT`），改用子域 `mail.syzgwiki.top`。

### 最终生效的 4 条记录

| 类型 | 主机（DNSPod SubDomain） | 值 |
| --- | --- | --- |
| MX | `mail` | `mxbiz1.qq.com.`（优先级 5） |
| TXT | `mail` | `v=spf1 include:qcloudmail.com ~all` |
| TXT | `qcloudgz1024._domainkey.mail` | `v=DKIM1; k=rsa; p=…`（1024 位） |
| TXT | `_dmarc.mail` | `v=DMARC1; p=none` |

### 验证状态：4/4 全部通过

| 记录 | SES 状态 |
| --- | --- |
| MX | ✅ |
| SPF | ✅ |
| DKIM | ✅（`qcloudgz1024`，1024 位） |
| DMARC | ✅ |

`VerifiedForSendingStatus = True`，`mail.syzgwiki.top` 可正常发信。

**DMARC 曾一度显示未通过**（`CurrentValue` 读为空），最终靠
**再次调用 `UpdateEmailIdentity` 触发重验**解决 —— 该接口是唯一能强制 SES 重读 DNS 的入口。

排查过程中排除的原因（记下来避免重复走）：

| 猜的方向 | 实测结论 |
| --- | --- |
| DNS 没生效 | 否 —— 4 个公共 DNS（8.8.8.8 / 1.1.1.1 / 223.5.5.5 / 119.29.29.29）都能读到 `v=DMARC1; p=none` |
| 值写错了 | 否 —— 与旧域逐字相同（16 字符） |
| 需要删了重建 | 否 —— 删不掉（见下方「删除发信域的正确顺序」），且重验已经够用 |
| DKIM 该换 2048 位 | 无关 —— 换 `DKIMOption` 不改变 DMARC 结果；最终的 1024 位照样通过 |

### 🔴 删除发信域的正确顺序（2026-10-21 更正）

**「SES 发信域不能删除」是错误结论。** 实际是两步保护，两个错因不一样：

| 域名 | 错误码 | 真实含义 |
| --- | --- | --- |
| `mail.yxzmy.top`（已验证） | `OperationDenied.SenderWithDomainIsNotEmpty` | **该域名下还挂着发信地址**，不能直接删 |
| `syzgwiki.top`（根域，0/4） | `OperationDenied.NotAllowDelete` | 另一原因（无发信地址也报），未查明 |

**正确顺序**：先删该域下的发信地址，再删域名。

```text
DeleteEmailAddress(noreply@mail.yxzmy.top)  →  DeleteEmailIdentity(mail.yxzmy.top)
```

### 发送实测（2026-10-21）

用与生产完全相同的通道（SES `ap-guangzhou`、模板 `62671`、发信地址 `noreply@mail.syzgwiki.top`）
向真实邮箱发了一封：

| 指标 | 值 |
| --- | --- |
| MessageId | `qcloudses-30-…-20261021050244-OIy7lciBF1eY1` |
| `SendStatus` | `0`（发送成功） |
| `DeliverStatus` | `1`（投递成功） |
| 投诉 / 退订 | 均为 false |

**结论：`mail.syzgwiki.top` 发信功能可用。** 这是比「4/4 验证通过」更硬的证据。

> 查询投递状态要带 `RequestDate`（格式 `YYYY-MM-DD`），只传 `MessageId` 会报 `MissingParameter`。

### 应急方案（保留，非当前状态）

`authMail.js` 支持 `TENCENT_FROM` 环境变量覆盖。若将来发信出问题，
在 Cloudflare Pages 环境变量里把它设为 `深渊大书院 <noreply@mail.yxzmy.top>`
即可回退到旧域（同样 4/4 全绿），**不需要改代码重新部署**。

### 代码改动

| 文件 | 改动 |
| --- | --- |
| `src/config/auth.js` | `SES_FROM` → `深渊大书院 <noreply@mail.syzgwiki.top>`，并写明「必须子域」与 DMARC 风险 |
| `src/utils/authMail.js` | fallback 同步，注释补 `TENCENT_FROM` 应急用法 |

模板 `TemplateID = 62671` **未变**（换发信域不影响模板审核）。
