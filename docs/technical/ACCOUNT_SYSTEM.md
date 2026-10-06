# 账号体系方案（注册 · 登录 · 改密码）

> 状态：**方案已定，未实施**（路线 A / 腾讯云 SES / 改密码只用邮箱验证码，见第十四节）。
> 2026-10-05 **重写**：需求从"无密码邮箱验证码"改为
> **「注册用邮箱验证码 + 密码登录 + 改密码也要邮箱验证」**，并补上平台侧的实测证据。
> 早期那一版（推荐无密码路线）保留在 [ACCOUNT_SYSTEM_EVALUATION.md](ACCOUNT_SYSTEM_EVALUATION.md)，
> 它是"为什么不能随便在 Workers 上存密码"的原始记录；本文取代它作为**现行方案**。
>
> 关联：[评论后端方案](COMMENTS_BACKEND.md)（本方案是它的账号层）、
> [完整交接文档](../HANDOFF_FULL.md)（部署拓扑与凭据）、
> [复现入口](../../scripts/dev/kdf-probe/README.md)（本文第二节数字的重测方式）。

---

## 〇、结论摘要（先看这一段）

| | |
| --- | --- |
| **已确认路线**（2026-10-05 用户选定） | **A：客户端 KDF** —— 密码在**浏览器/手机**里跑 PBKDF2-SHA256 **600,000 轮**，服务端只存 `HMAC(pepper, verifier)` 的快速哈希 |
| **为什么** | 免费版 10ms CPU 跑不动任何有意义的服务端 KDF；付费版又被平台**入口封顶**（PBKDF2 ≤ 10 万轮，不到 OWASP 推荐的 1/6）。客户端 KDF 把成本挪到**没有 CPU 预算限制**的一侧，免费、且强度**达到** OWASP 推荐值 |
| **代价** | 协议是自研的（非标准），需要自己的单测；登录时前端要多花 0.1~0.6 秒算 KDF，要给加载态；服务端**看不到密码**，因此**密码强度只能前端校验**（可被恶意客户端绕过，但只影响他自己） |
| **不要走** | 免费版 + 服务端低轮 PBKDF2（10k 轮 = 4.8ms，强度只有推荐的 1/60，且几乎吃掉全部 CPU 预算） |
| **发信**（已确认） | **腾讯云 SES**，地域 **广州 `ap-guangzhou`**，模板 **`TemplateID = 62671`**（2026-10-05 过审；初版 62664 已作废）。**Cloudflare Email Service 不可用**——它要求发信域名是 Cloudflare 托管的 zone，而 `yxzmy.top` 的 NS 在 DNSPod |
| 🔴 **评论权限**（2026-10-05 **变更**） | **必须登录才能发评论**；**读评论不需要登录**。原"未登录仍可评论 / 本机身份不得回退"**已作废**，本机身份整体移除、老匿名评论清空 |
| **防刷**（已确认） | ❌ Turnstile（国内加载失败 = 完全无法注册）· ❌ PoW（成本对称、性价比为负）<br>✅ **自建蛋点选 SVG 验证码** + 蜜罐字段 + 人类时序校验 + 一次性邮箱域名黑名单 + 同邮箱/同 IP 限流 + SES 日限额 500 硬熔断 |
| **后台**（已确认） | **独立外壳** + 概览 / 评论管理 / 用户管理（含封禁、彻底删除）；羊皮纸主题；**与账号体系一起做** |
| **额外收获** | 客户端 KDF **可与服务端 KDF 叠加**：将来若升级 Workers Paid，服务端可以再对收到的 verifier 跑一次 scrypt，客户端协议不用改 |

> 📌 **全部 22 项已确认决策集中在 §14.1**，开工前先看那一张表。

> ⚠️ 本文第二节的数字是**实测**的，不是估算。重测方式见
> [`scripts/dev/kdf-probe/`](../../scripts/dev/kdf-probe/README.md)。

---

## 一、需求（用户原话）

> "我要做账号的登录和注册，注册的时候邮箱验证码，改密码也是邮箱验证。"

拆成四条硬需求：

1. **注册**：邮箱 + 邮箱验证码（证明邮箱是自己的）→ 同时**设置密码**；
2. **登录**：邮箱 + 密码；
3. **改密码**：在**已登录**状态下，用**邮箱验证码**授权（不要求旧密码）；
4. ~~未登录用户仍能评论~~ → **改为：必须登录才能评论**（**2026-10-05 用户变更决定**）。
   **读评论不需要登录**；未登录时发表区替换为登录引导。原"本机身份 + 匿名评论"**整体移除**。

> 注意第 3 条的一个推论：**"忘记密码"与"改密码"是同一个流程**（都靠邮箱验证码），
> 所以**不需要**单独设计找回密码。
> 同时也意味着一个真实的安全权衡：**邮箱的安全 = 账号的安全**（能读邮箱的人就能改密码）。
> 缓解措施见 4.4。

---

## 二、平台硬约束（本节是决策的全部依据）

### 2.1 实测：workerd 里各 KDF 的真实耗时

2026-10-05 在**真实 `workerd` 运行时**（`wrangler dev` 用的就是它）实测，
每档先预热一次、再取多次平均；纯计算没有等待 I/O，故**墙钟 ≈ CPU 时间**：

| KDF | 参数 | 实测耗时 | 免费版 10ms 预算 |
| --- | --- | --- | --- |
| SHA-256 摘要（基线） | — | **0.005 ~ 0.01 ms** | ✅ 可忽略 |
| PBKDF2-SHA256 | `10,000` 轮 | **4.4 ~ 4.8 ms** | ✅ 放得下 |
| PBKDF2-SHA256 | `100,000` 轮（**生产上限**） | **44.4 ~ 48.4 ms** | ❌ 超 4.8 倍 |
| scrypt | `N=16384 r=8 p=1`（cost 131072，16 MB） | **27 ~ 30 ms** | ❌ 超 3 倍 |
| scrypt | `N=32768 r=8 p=1`（cost 262144，32 MB） | **54 ~ 57 ms** | ❌ |
| scrypt | `N=65536 r=8 p=1`（cost 524288，64 MB） | **111 ~ 116 ms** | ❌ |

**由实测推出的第一条结论**：免费版 10ms 预算大约只够 **PBKDF2-SHA256 约 21,000 轮**
（`10 ÷ 0.00047`）。这是 OWASP 现行推荐值（600,000 轮）的 **1/28**。

**第二条**：这些数字比在 Node 里量到的大约**慢 2.7 倍**
（Node：600k = 100ms；workerd：600k = 279ms）。所以**不要拿 Node/本机基准当依据**
——早期文档里"600k 只是 104ms"的说法就是这么来的，它低估了运行时成本。

### 2.2 封顶：比 CPU 超时更严重的事

CPU 只是"跑久了会报错"，而 Cloudflare 对 KDF 还有一道**入口封顶**：参数超了**直接报错**，
不是跑慢。出处是 workerd 源码 `src/workerd/io/limit-enforcer.h`：

```cpp
static constexpr size_t DEFAULT_MAX_PBKDF2_ITERATIONS = 100'000;
static constexpr uint64_t DEFAULT_MAX_SCRYPT_COST = 1u << 20;   // 1,048,576

virtual kj::Maybe<size_t> checkPbkdfIterations(jsg::Lock& js, size_t iterations) const {
  // ... Note, this current default limit is *WAY* below the recommended
  //     minimum iterations for pbkdf2.
  if (iterations > DEFAULT_MAX_PBKDF2_ITERATIONS) return DEFAULT_MAX_PBKDF2_ITERATIONS;
  return kj::none;
}

virtual kj::Maybe<uint64_t> checkScryptCost(jsg::Lock& js, uint32_t N, uint32_t r, uint32_t p) const {
  if (N > DEFAULT_MAX_SCRYPT_COST || r > DEFAULT_MAX_SCRYPT_COST || p > DEFAULT_MAX_SCRYPT_COST)
    return DEFAULT_MAX_SCRYPT_COST;
  uint64_t cost = static_cast<uint64_t>(N) * r * p;
  if (cost > DEFAULT_MAX_SCRYPT_COST) return DEFAULT_MAX_SCRYPT_COST;
  return kj::none;
}
```

- **PBKDF2 ≤ 100,000 轮**（Cloudflare 自己的注释承认这"**远低于**推荐最小值"）；
- **scrypt：`N × r × p ≤ 1,048,576`**（≈ 上限 N=2^16/r=8/64 MB）。

超限的报错文案形如 `Pbkdf2 failed: iteration counts above 100000 are not supported (requested ...)`。

### 2.3 为什么会有这道封顶（= PBKDF2 确实计入 CPU 的决定性证据）

`cloudflare/workerd` issue **#1346**（2023-10-25 开，**至今仍 open**，最后一次活动 2026-09-20）
里，Workers 运行时负责人 **kentonv** 的原话：

> "Since our CPU time-limiting code **cannot interrupt BoringSSL in the middle of running PBKDF**,
> we have to limit the iterations upfront."

同一 issue 里 **jasnell**：

> "A change has been landed that makes the max iteration count configurable in `workerd`, with the
> default max iteration count *removed* in workerd. **However, in the production environment the
> current limit will remain for at least some period of time.**"

也就是说：**本地 `wrangler dev` 已经没有上限**（所以我们能在本地量出 600k = 279ms），
**但生产仍然封顶**。issue 里 2026-01-26 还有开发者报告"设成 210,000 就在 Workers 上报错"，
说明**到 2026 年生产上限依然在**。

同一结论还有一条来自 Cloudflare 官方论坛（"Constantly running out of CPU time"）的员工回复：

> "The main consumer of **CPU time** in the script you linked to is the **PBKDF2** derivation...
> Can you reduce the number of PBKDF2 iterations your script must perform?"

三条证据互相独立、指向同一件事：**PBKDF2/scrypt 的开销计入 CPU 时间，且生产另有轮数封顶。**

### 2.4 由此确定的边界

| | Workers Free（10ms） | Workers Paid（默认 30s） |
| --- | --- | --- |
| 服务端 PBKDF2 | ❌ 实际可容纳约 21,000 轮（推荐的 1/28） | ⚠️ 只能到平台上限 **100,000** 轮 ≈ 48ms |
| 服务端 scrypt | ❌ 任何有意义档位都超 10ms | ✅ 16 MB ≈ 30ms / 32 MB ≈ 57ms（≤ cost 上限） |
| 服务端 argon2 | **平台不支持**（`node:crypto` 明确排除 `argon2`/`argon2Sync`） | 同左 |
| 客户端（浏览器/手机 WebCrypto） | ✅ **没有任何 CPU 预算限制**，可跑满 600,000 轮 | 同左 |

**这就是推荐路线 A 的全部理由**：唯一能同时做到"免费"和"强度达到推荐值"的位置，
是**客户端**。

> 顺带确认了客户端可行性：项目是 Vue SPA（一定有 JS），
> 且 Android 壳 `capacitor.config.json` 里 `androidScheme: "https"`
> → 页面跑在 `https://localhost`，属于**安全上下文**，`crypto.subtle` 可用。

---

## 三、路线对比（按本次实测重估）

| | **A. 客户端 KDF**（推荐） | B. 服务端 KDF（需 Paid） | C. 无密码邮箱验证码 | D. 托管认证 |
| --- | --- | --- | --- | --- |
| 密码存在？ | 有（客户端派生） | 有 | **没有**（与需求 3 冲突） | 有（在对方） |
| 服务端 CPU | **~0.02ms** | 30~48ms | ~0.02ms | ~0.02ms |
| 是否受平台封顶 | **不受** | 受（PBKDF2 ≤100k） | 不受 | 不受（对方负责） |
| 离线爆破强度 | **600,000 轮**（达推荐） | 100,000 轮（推荐值的 1/6） | 不适用 | 由对方决定 |
| D1 单独泄露可否爆破 | **不可**（pepper 不在库里） | 可 | 不适用 | 不适用 |
| 月费用 | **0 元** | **$5/月**（Workers Paid） | 0 元 | 0 元（额度内） |
| 外部依赖 | 1（邮件） | 1（邮件） | 1（邮件） | 2（邮件 + 认证服务） |
| 开发量 | 3~5 天 | 3~4 天 | 2~3 天 | 1~2 天 |
| 主要风险 | **自研协议**，要自己写对 | 弱于推荐值、且要花钱 | **不满足需求 3** | 数据在对方；国内可达性 |

> **C 路线为什么不选**：它天然满足"改密码"（重发码即可），但用户明确要**密码**。
> 若用户改主意愿意放弃密码，C 仍然是**最省事且最安全**的——它把"密码"这个可被爆破的东西
> 整个删掉了。**这是本文唯一想请你再确认一次的取舍。**

---

## 四、推荐方案 A：客户端 KDF（详细设计）

### 4.1 一句话

> 密码**从不离开用户的设备**。客户端用服务端给的盐把密码派生成一个 256 位 `verifier`，
> 只把 `verifier` 发上去；服务端再对它做一次**快速** HMAC 后入库。

### 4.2 盐与 pepper（两个不同的东西，别混）

| | 用途 | 怎么来 | 谁能看到 |
| --- | --- | --- | --- |
| **盐 `salt`** | PBKDF2 的盐，保证同一密码在不同账号/站点派生结果不同 | **注册时客户端 `crypto.getRandomValues` 随机生成 32 字节**（64 位小写 hex），随注册请求提交，服务端校验形状后原样存进 `users.pw_salt`；此后 `/api/auth/salt` 一律返回存下来的那个 | 公开（`/api/auth/salt` 可查） |

> 🔴 **2026-10-07 起改为每用户独立随机盐**（对齐 bcrypt / Argon2 / scrypt 的通行做法）。
>
> **为什么改**：原先盐是 `HMAC(SALT_SECRET, 'salt:' + 邮箱)` **派生**的。它满足"每人不同"
> 但不是随机。关键转折是**盐后来必须入库**（为了支持换邮箱，见 §4.2.1）——
> 一旦盐进了数据库，派生盐相对随机盐就**只剩缺点**：攻击者拿到 D1 备份 + `SALT_SECRET`
> 时可以自己算出所有盐、做预计算；而随机盐即使 `SALT_SECRET` 同时泄露，仍需逐用户单独爆破。
>
> **盐的编码约定没变**：仍是 64 位小写 hex，客户端把它**当 UTF-8 字符串**直接用作 PBKDF2 的
> salt（不做 hex 解码，见 `config/auth.js` 的 `SALT_ENCODING`）。所以
> `tests/ui/password-kdf.spec.js` 的跨端比对依然有效，**协议本身没动**。
>
> **注册流程因此变了**：盐由客户端生成、与 `verifier` 一起提交（注册时服务端还没有这个用户，
> 没有盐可给）。服务端只做两件事：**校验形状**（`^[a-f0-9]{64}$`，否则是一道免费的
> CPU/存储放大口子）与**原样存下**。
>
> **未注册邮箱查盐**返回一个**确定性占位盐**（`HMAC(SALT_SECRET, 'placeholder:' + 邮箱)`）。
> ⚠️ 它**不是**为了防枚举（2026-10-07 已明确不做防枚举），而是为了让登录流程能正常走到
> "邮箱或密码不对"，而不是在取盐那一步就抛错。它对同一邮箱**稳定**，所以不会因为
> "响应随机"变成新的枚举口子 —— 这是副作用，不是目的。

> 🔴 **域分隔**：`email_hash` 与**占位盐**都源自 `HMAC(SALT_SECRET, 邮箱)`，但**必须带不同的用途前缀**
> （`'lookup:'` / `'placeholder:'`）。否则两者相等 —— 而 `/api/auth/salt` 是公开接口，
> 等于把 `email_hash` 也公开了：万一 D1 备份泄露，攻击者就能拿哈希清单逐个调
> `/api/auth/salt` 反查"这些邮箱在不在库里"。加前缀的代价为零。
> 单测里有一条专门守它（`🔴 盐与 email_hash 必须不同`）。

| **pepper** | 存 `verifier` 时用的服务端密钥 | Cloudflare 环境变量 `AUTH_PEPPER`（随机 32 字节） | **只在 Worker 里**，**绝不在 D1** |

历史沿革（为什么以前是派生的）：原设计想省一次 D1 读、并让不存在的邮箱也返回一个形状一致的盐。
但**盐最终必须入库**（换邮箱会换掉邮箱，现算就与注册时不同 → 用户再也登不上），
入库之后派生盐的这两个好处都消失了，只剩"可被预计算"这一个缺点。

派生与存储：

```
客户端：  verifier = hex( PBKDF2-SHA256(password, salt, 600000, 32 字节) )
服务端：  verifier_hash = hex( HMAC-SHA256(AUTH_PEPPER, verifier) )      // ≈ 0.02ms
入库：    users.verifier_hash, users.pw_algo='client-pbkdf2-sha256', users.pw_iters=600000
```

### 4.3 为什么这**不比**标准服务端哈希弱

这是本方案最需要论证的一点，逐条比：

| 攻击者拿到什么 | 标准服务端哈希（PBKDF2 600k 入库） | **本方案** |
| --- | --- | --- |
| 只有 D1 备份 | 可离线爆破（成本 = 600k/次猜测） | **不可爆破**：库里只有 `HMAC(pepper, verifier)`，反推 `verifier` 要破 HMAC（256 位），且 pepper 不在库里 |
| D1 + 环境变量（pepper）都泄露 | 同上（本来就是全泄露） | 需"猜密码 → 600k PBKDF2 → verifier → HMAC → 比对"，**成本与左边完全相同** |
| 中间人读到请求体 | 拿到密码，可登录 | 拿到 `verifier`，可登录（**等价**） |
| 撞库（同密码复用） | 需要原密码 → 各站盐不同，PBKDF2 结果不同 | 同左（盐由本服务端给出，跨站不可复用） |
| 在线猜密码 | 受限流约束 | 受限流约束；且**每次猜测攻击者自己要付 100ms PBKDF2**（猜 `verifier` 本身是 2^256，不可行） |

**结论**：离线成本**不低于**标准做法，D1 单独泄露时**更强**。
它把"猜密码的算力"从服务端挪到了攻击者自己身上——这恰恰是 KDF 本来想要的效果。

### 4.2.1 🔴 盐**必须存下来**，不能每次现算 —— 换邮箱会踩死

**这一条是端到端测试实测出来的，不是推演出来的。**

原本的设计是"盐按需现算、不入库"，看着很干净：盐不是秘密，公式又是确定性的，何必占一列？

但**盐是按邮箱派生的**，而账号体系里恰好有一个功能会**改掉邮箱**：

```
注册时：salt₀ = HMAC(SALT_SECRET, 'salt:'+旧邮箱)
        verifier₀ = PBKDF2(密码, salt₀)        ← 库里存的是 HMAC(pepper, verifier₀)

换邮箱后（若现算）：salt₁ = HMAC(SALT_SECRET, 'salt:'+新邮箱)
        verifier₁ = PBKDF2(密码, salt₁) ≠ verifier₀
        → 与库里的哈希对不上 → **用户换完邮箱再也登不上**
```

症状极其误导：**密码明明是对的**，但登录永远失败；而且只有"换过邮箱"的用户会中招，
所以初期测试很难碰到。

**修法**：把盐当作**账号的一部分**存进 `users.pw_salt`（盐本来就不是秘密，
`/api/auth/salt` 一直公开返回它），此后一律返回存下来的值。
`/api/auth/salt` 的对外行为不变 —— 未注册邮箱仍返回现算值，两者形状完全一致，
所以**依然不泄漏是否注册过**（注册时存的就是那个现算值）。

> 教训：**任何"由 A 派生、但 A 会变"的东西，都要在 A 变之前固化下来。**

> 为什么**不做**挑战-响应（服务端发 nonce，客户端回 `HMAC(verifier, nonce)`）：
> 那要求服务端持有**明文 verifier 当 HMAC 密钥**，于是"D1 泄露也安全"这条就没了——
> 拿到库就等于拿到密钥。**得不偿失，所以刻意不做。**

### 4.4 残留风险与必须写进代码的红线

1. **服务端永远看不到密码** → **密码强度/长度只能前端校验**。
   恶意客户端可以绕过，但那只影响他自己的账号。前端仍必须做（≥8 位、拒绝常见弱口令），
   并把 600,000 轮作为**协议常量**写进两端共享的配置文件。
2. **请求体绝不能进日志**。现有后端只 `console.error(err)`，没有打印过请求体——**保持这样**。
   新增 `/api/auth/*` 时同样不得把 `verifier` 写进日志、错误信息或响应。
3. **必须 HTTPS**。`verifier` 是密码等价物，明文 HTTP 下与明文密码等价。
4. **限流要按"账号 + IP"两条线**，并给登录失败计数（防在线爆破）。
5. **改密码成功后**：① 立刻作废**其它所有** session；② 给邮箱发一封**通知邮件**
   （"你的密码已变更，若不是你本人请立即…"）——这是"邮箱=信任根"的必需补偿。
6. **邮箱变更**要走新邮箱验证码，并且**盐会变**（盐由 email 推导）→ 客户端必须用新邮箱重新派生
   `verifier` 再提交。这条最容易漏。
7. **`AUTH_PEPPER` 一旦泄露必须轮换**，而轮换会让所有 `verifier_hash` 失效 → 需要一个
   "pepper 版本号"字段 + 双 pepper 过渡期。第一版可以先不做，但**字段留出来**。
8. **不加**"用旧密码改密码"以外的旁路；不提供任何形式的免验证重置。

### 4.5 向上兼容：将来加服务端 KDF 不用改协议

服务端收到的 `verifier` 本身是**高熵值（256 位）**，所以它可以被**再**慢哈希一次：

- 免费版：`HMAC(pepper, verifier)`（~0.02ms）；
- 将来若买 Workers Paid：把这一行换成 `scrypt(verifier, N=16384, r=8, p=1)`（~30ms）
  → 连 pepper 泄露都不怕了。**客户端一行都不用改**，只是 `users.pw_algo` 换个值并做一次登录时迁移。

这是本方案相对"服务端直接哈希密码"的一个额外好处：**强度可以事后无痛加码**。

---

## 五、备选方案 B：Workers Paid + 服务端 KDF

如果你更看重"标准做法、不要自研协议"，那就走这条：

| | |
| --- | --- |
| 成本 | **$5/月**（Workers Paid，CPU 从 10ms → 默认 30s） |
| 服务端 KDF | PBKDF2-SHA256 **100,000 轮**（≈48ms，**平台硬顶**）或 **scrypt N=2^14/16MB**（≈30ms，抗 GPU 更好） |
| 强度 | 100k 轮 = OWASP 推荐值的 **1/6**；Cloudflare 源码注释自己承认"远低于推荐" |
| 附带好处 | 解锁 **Cloudflare Email Service**（3000 封/月）——**前提是发信域名在 Cloudflare** |
| 附带风险 | 一旦降级回免费版，**所有登录都会 1102 报错**（CPU 超限），属于"停不掉的付费依赖" |

**建议**：如果选 B，**用 scrypt 而不是 PBKDF2**——同样 30ms，scrypt 是内存硬、抗 GPU/ASIC，
实际强度明显高于被顶死在 10 万轮的 PBKDF2。参数固定为 `N=16384, r=8, p=1`（cost 131072，安全落在封顶内）。

---

## 六、备选方案 C：托管认证（Supabase / Clerk / Auth0）

保留作为"连协议都不想自己写"的退路：只把"注册/登录/改密码"三步换成对方的 SDK，
拿到对方签发的身份后，在本站 `users` 表里 upsert 一条 `auth_provider_id` 映射，
**仍然签发我们自己的 session**，前端与其余接口不变。

- 优点：密码学交给专业服务，不受 Workers CPU 与封顶约束；
- 缺点：① 用户数据在第三方；② 国内可达性要实测（Supabase 大陆访问不稳）；③ 多一个外部依赖；
  ④ 邮件仍要自己解决（或再用对方的邮件额度）。

---

## 七、发信通道（无论走哪条路线都必须先解决）

### 7.1 Cloudflare Email Service 为什么用不了

Cloudflare 现在有原生 `send_email` 绑定（Beta，文档最后更新 2026-09-16），
`env.EMAIL.send({ to, from, subject, html, text })`，本地 `wrangler dev` 也能测——很诱人，但**两条都卡住**：

1. **需要 Workers Paid**：官方定价页写明 *"Sending to arbitrary recipients requires the Workers Paid plan"*
   （免费版**只能发给已验证的目的地址**）。付费版含 **3000 封/月**，超出 $0.35/1000 封。
2. **发信域名必须是 Cloudflare 托管的 zone**：控制台流程是 *"Choose a domain from your Cloudflare account"*。
   而实测 `yxzmy.top` 的 NS 是 **`peach/henry.dnspod.net`（DNSPod）**，不是 Cloudflare
   → 要么把整个 `yxzmy.top` 迁到 Cloudflare NS（会影响现在的大陆解析链路，**不建议**），
   要么**另买一个便宜域名挂到 Cloudflare 专用于发信**。

> 结论：**除非你愿意同时接受 $5/月 和"再养一个域名"，否则放弃 Cloudflare 发信。**

### 7.2 推荐：腾讯云 SES（HTTP API）

与现有 DNS 一致（记录加在 DNSPod），大陆送达率最好。

| 项目 | 数值（2026-10-02 核实于官方价格页，沿用旧稿） |
| --- | --- |
| 免费额度 | 每账号 **1000 封**，**一次性、用完为止**（不是每月刷新） |
| 超出后 | **0.0019 元/封** |
| 前置 | 绑定自有域名 + 配 **SPF / DKIM**（建议再加 DMARC） |

备选 **Resend**（免费 3000 封/月、100 封/天，需加 DNS 记录，大陆送达需实测）、
**阿里云 DirectMail**（免费 2000 封、2 元/1000 封）。

### 7.3 落地步骤（照抄即可；2026-10-05 复核官方文档）

**✅ 配置进度（2026-10-05 已全部完成，只剩第 ⑥ 步待实测）**：

| 步骤 | 状态 |
| --- | --- |
| ① 账号实名 | ✅ |
| ② 开通 SES（含服务相关角色授权） | ✅ |
| ③ 发信域名 `mail.yxzmy.top` | ✅ 四项全部验证通过（我方另从公网 DNS 独立复核过） |
| ④ 发信地址 `noreply@mail.yxzmy.top` | ✅ |
| ⑤ 验证码模板 | ✅ **审核通过，`TemplateID = 62671`**（初版 62664 已被取代） |
| ⑥ **最小验证：发一封看进不进收件箱** | ⬜ **待做（唯一剩下的）** |
| ⑦ 子账号 `ses-sender` + 自定义策略 `SES-SendOnly` | ✅（仅 `ses:SendEmail`、仅编程访问） |
| ⑧ Cloudflare **生产**环境变量 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` | ✅（已用 401/404 探针确认那套就是生产） |

> 关键前提：**SES 只支持"用模板"发信**，不支持任意 HTML 正文
> （官方原文："默认仅支持使用模板发送邮件"；违规返回 `FailedOperation.WithOutPermission`）。
> 对验证码刚好够用：建一个带变量 `{{code}}` 的模板即可。

#### 步骤 1 — 腾讯云账号实名

- [ ] 到 <https://console.cloud.tencent.com/developer> 完成**实名认证**（个人认证即可）。
      ⚠️ 官方文档**未见 ICP 备案要求**（SES 是发信服务，不是网站）——但请在控制台实测确认。

#### 步骤 2 — 开通 SES

- [ ] 打开 <https://console.cloud.tencent.com/ses> → **开通邮件推送服务**。
- [ ] 开通时会弹一个**「服务授权」**框，要求创建服务相关角色
      `SES_QCSLinkedRoleBilling`（预设策略 `QcloudAccessForSESLinkedRoleInBilling`）。
      **这是正常的，点「同意授权」**：
      ① 它**不需要你交出任何密钥**（对话框自己写着"无需用户托管密钥"）；
      ② `Billing` = **只涉及账务/计费**——因为 SES 是**按量后付费**，得能读你的余额才能扣费；
      ③ 它**不是发信权限**（发信密钥是你后面在 CAM 自建的子账号密钥，两码事），
      也**碰不到**网站、D1、DNS；④ 随时可在 **CAM → 角色**里删除或核对权限。
      不点则开通不了（必需步骤）。同页的**《邮件推送服务协议》勾选框也得勾上**——
      建议真看一眼，它主要是**反滥发**的合规条款。
- [ ] 确认额度：**每账号 1000 封，不限有效期、用完为止**；超出 **0.0019 元/封**（按日结算后付费）。
- [ ] ⚠️ **不要**开通"独立 IP"（增值服务）。它是 **900 元/个/月**、**开通时冻结一个月费用**、
      库存不足还要等 **2~4 周**预热；而且**对小量发信反而更差**——新 IP 的发信声誉**从零开始**，
      要靠**持续的大发信量**才能"养"起来（邮箱服务商对新 IP 先怀疑）。
      我们每天就几十封验证码，**永远养不起来**，独立 IP 只会把送达率拖低。
      **小量发信就该用共享 IP 池**（借用平台已建立的声誉，这正是 `TriggerType: 1` 触发类通道的意义）。
- [ ] 建议**账户里留几元余额**垫底：1000 封免费额度用完后就转成**日结后付费**，
      余额为 0 会扣费失败 → 官方说 24 小时内未充值就**暂停服务**。几元钱 ≈ 几千封，够垫很久。

#### 步骤 3 — 配置发信域名（建议子域 `mail.yxzmy.top`）

> **为什么用子域而不是根域**：① 保护根域声誉；② 一个域名的 DNS 里**只能有一条 SPF 记录**，
> 根域将来若还想用别的邮件服务就会打架。子域的记录全挂在 `mail` 前缀下，互不干扰。

- [ ] 控制台 **邮件配置 → 发信域名 → 新建**，填 `mail.yxzmy.top` → 提交。
      - **不需要先去域名管理里"创建"这个子域**：DNS 的子域名不是对象，加一条主机记录为 `mail`
        的记录它就存在了（`syzg.yxzmy.top` 同理，从没被"创建"过，只是一条 A 记录）。
      - **「标签」留空即可**：它是可选的云资源分组/账单归类功能，与能否发信无关。
      - ⚠️ 弹窗明确警告 **"域名创建成功后不支持删除"**（FAQ 里换发信域名要联系技术支持；
        官方【发信域名】页写的"待验证可删除"与之不一致，**以弹窗为准**）→ **提交前逐字符核对拼写**。
      - ⚠️ **不要用 `syzg.yxzmy.top`**：那是网站正在用的域名（A 记录走 EdgeOne），
        会和网站解析、SPF 语义搅在一起。用 `mail.` 子域是干净的。
- [ ] 点该域名的**验证**，界面会给出**它自己的一组记录值**——**一律以界面为准**；
      下面只是官方示例的形状，用来告诉你"填在哪个位置"：

| 用途 | 主机记录 | 类型 | 记录值（**抄控制台**） | 其它 |
| --- | --- | --- | --- | --- |
| MX 验证 | `mail` | MX | `mxbiz1.qq.com.` ← **末尾那个点必须保留** | **优先级填 `5`**（MX 必填；数字越小优先级越高，`10` 是留给第二条 MX 的。只加一条时数值不影响结果，`5` 是默认值） |
| SPF | `mail` | TXT | `v=spf1 include:qcloudmail.com ~all` | 一个域名的 SPF **只能有一条** |
| DMARC | `_dmarc.mail` | TXT | `v=DMARC1; p=none` ← 必须含 `v` 与 `p` | 权重留空 |
| DKIM | `qcloudhk2048._domainkey.mail` | TXT | 控制台给的长公钥（**用复制图标**） | 见下方 DKIM 三个坑 |

**实测本项目 SES 的实际记录（2026-10-05，用户控制台截图）**：

- DKIM 选择器是 **`qcloudhk2048`** → 该 SES 账号在 **中国香港（`ap-hongkong`）地域**，
  **不是广州**。→ 后面调 `SendEmail` 时 `Region` **必须填 `ap-hongkong`**。
- 控制台给出的主机记录已经是**前缀形式**（`mail` / `_dmarc.mail` / `qcloudhk2048._domainkey.mail`），
  **正好就是 DNSPod 要填的形式**，不要再拼上 `yxzmy.top`。
- 只需配 **2048 位**那一条；控制台同时列出的「1024 位密钥」是给不支持超长 TXT 的 DNS 做兼容用的，
  **不勾选、不用配**。

**DKIM 记录值的三个坑**（最容易在这里卡住）：

1. **必须是一整行连续字符串，中间不能有换行或空格**。控制台里它是**折行显示**的，
   那只是显示折行——**一定要用界面的「复制」图标**，手动拖选很容易把折行也带进去。
2. 整段以 `v=DKIM1; k=rsa; p=` 开头、以 base64 结尾；粘贴后**核对长度完整**（约 400~500 字符）。
3. 若 DNSPod 提示超长或最后验证不通，按 TXT 标准做法**分段**：每 255 字符一段、
   每段用双引号包裹、段间空格连接 —— `"段1" "段2" "段3"`。这是合法写法，不是错误。

- [ ] DKIM 选 **2048 位**（官方推荐）；**广州**地域前缀是 `qcloudgz2048`，**香港**是 `qcloudhk2048`。
- [ ] 回控制台点**提交验证**。DNS 生效要 **5 分钟 ~ 2 小时**，别急着反复点。
- [ ] 自查（官方给的 `dig` 在 Windows 上用 `nslookup` 代替）：

```powershell
nslookup -type=mx  mail.yxzmy.top
nslookup -type=txt mail.yxzmy.top
nslookup -type=txt _dmarc.mail.yxzmy.top
nslookup -type=txt qcloudgz2048._domainkey.mail.yxzmy.top
```

> ⚠️ **两条硬约束**：① 一个域名的 DNS 里**只能有一条 SPF 记录**（多服务商要合并进同一条的
> 多个 `include:`）；② **不可使用企业邮箱域名**（会和它自己的 SPF/MX 冲突）。每账号最多 10 个发信域名。

**已替你做过的前置检查**（2026-10-05 实测 `yxzmy.top`）：

| 查的东西 | 结果 | 意味着 |
| --- | --- | --- |
| `yxzmy.top` TXT（有无现存 SPF） | **无** | 不会撞 SPF |
| `yxzmy.top` MX | **无** | 不会撞 MX |
| `_dmarc.yxzmy.top` TXT | **无** | 可直接加 DMARC |
| `mail.yxzmy.top` TXT / MX | **无** | 子域是干净的 |
| `qcloudgz2048._domainkey.mail.yxzmy.top` | **无** | DKIM 不会撞 |

→ **可以放心按上面四条加记录，不会破坏现有解析**（网站走的是 `syzg.yxzmy.top` 的 A/CNAME，
与 `mail` 子域下的 MX/TXT 互不影响）。

> ⚠️ **先确认域名在哪管**：`yxzmy.top` 的 NS 是 `peach/henry.dnspod.net`。
> **但 NS 不能用来判断归属**——腾讯云"云解析 DNS"与 DNSPod 独立账号**用的是同一组 NS**
> （腾讯收购了 DNSPod）。判断方法：登录 [腾讯云云解析 DNS](https://console.cloud.tencent.com/cns)，
> **若 `yxzmy.top` 在域名列表里**就在那儿管（通常可一键配置）；**若不在**，
> 说明它是 DNSPod 独立账号，去 <https://www.dnspod.cn> 手动加那四条记录。**先确认，再动手。**

#### 步骤 4 — 配置发信地址

- [ ] **邮件配置 → 发信地址 → 新建**：发信域名选上一步**验证通过**的 `mail.yxzmy.top`；
      邮箱前缀填 `noreply`；发件人别名填 `深渊大书院`。
- [ ] 得到发信地址 `noreply@mail.yxzmy.top`（**必须以已验证的发信域名为后缀**）。

#### 步骤 5 — 建验证码模板（**要审核，所以先发起**）

- [ ] **发信模板 → 新建**：名称 `验证码`；类型 **HTML 富文本**；
      **邮件摘要** `深渊大书院账号验证码`；**邮件正文** 单击**上传**，选
      [`scripts/dev/ses-templates/verify-code.html`](../../scripts/dev/ses-templates/verify-code.html)。
      模板里用了 `{{code}}` 与 `{{minutes}}` 两个变量，**变量名要和 `TemplateData` 的 JSON key 对上**。
- [ ] 提交后**进入审核，官方说 1 个工作日**。**所以这一步要在写代码之前就发起**，别等。
- [x] 过审后记下 **`TemplateID`** = **`62671`**（2026-10-05 **审核通过**；初版 62664 已作废，`SendEmail` 用新 ID）。

#### 步骤 6 — 最小验证：先发一封，不动现有代码

- [ ] 控制台 **邮件发送 → 普通发送**（单次上限 20 个收件地址）直接用模板发一封到自己邮箱。
- [ ] 或走 API（见 7.4）测一次，拿到 `MessageId`。
- [ ] **验收三件事**：
      ① **进收件箱还是垃圾箱**？——**分发给 QQ / 163 / Gmail 各测一次**，国内邮箱风控差异很大；
      ② 连发 5 封会不会被限流（错误码 `FailedOperation.FrequencyLimit`）；
      ③ 到信耗时几秒。
- [ ] ⚠️ **`yxzmy.top` 是 `.top` 后缀**：这类后缀在国内部分邮箱的**初始信誉偏低**，
      是本次**最大的送达率风险**。若垃圾箱率明显，退路是换一个 `.com` / `.cn` 域名专门发信。
- [ ] 跑通后把结论写进当日开发日志；**不要把测试接口留在仓库里**。

> ⚠️ 不要走"个人邮箱 SMTP 直连"：Workers **封禁 25 端口**，出口 IP 又是共享池、每次都变，
> 国内邮箱会把异地登录判定为风险并拦截。

### 7.4 `SendEmail` 接口契约（实现时照这个写）

| 项 | 值 |
| --- | --- |
| 请求域名 | `ses.tencentcloudapi.com` |
| Action / Version | `SendEmail` / `2020-10-02` |
| Region | **`ap-guangzhou`**（本项目已切到广州，见 7.6）。**必须与发信地址/模板所在的地域一致**，否则报错 |
| 频率限制 | 20 次/秒 |
| 鉴权 | 腾讯云 API 3.0 的 **TC3-HMAC-SHA256** 签名（HMAC-SHA256，WebCrypto 能算，Worker 里可实现） |

请求体（我们只用这几个字段）：

```json
{
  "FromEmailAddress": "深渊大书院 <noreply@mail.yxzmy.top>",
  "Subject": "【深渊大书院】邮箱验证码",
  "Destination": ["user@example.com"],
  "Template": { "TemplateID": 62671, "TemplateData": "{\"code\":\"123456\",\"minutes\":10}" },
  "TriggerType": 1,
  "Unsubscribe": 0
}
```

要点：

- `FromEmailAddress` 带别名时格式是 **`别名 + 一个空格 + <邮箱>`**，**别名里不能有冒号**。
- `Template` **必填**（除非申请过特殊配置）；`TemplateData` 是**字符串形式的 JSON**，key 要对上模板变量。
- **`TriggerType: 1`** = 触发类（验证码这类即时邮件）——**验证码就走这个**。
- **`Unsubscribe: 0`** = 不插退订链接（那是营销邮件才需要的）。
- `Destination` 最多 50 人，但**非群发请逐个调用**，否则收件人互相可见。
- 凭据用**子账号的最小权限密钥**（只授 SES 发信权限），**不要用主账号密钥**；
  存 Cloudflare 环境变量 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`，**不进仓库**。

要处理并映射成用户文案的错误码（契约见第九节）：

| 错误码 | 含义 | 我们该怎么做 |
| --- | --- | --- |
| `FailedOperation.FrequencyLimit` | 同一地址短时间发太多 | 「发送过于频繁，请稍后再试」 |
| `FailedOperation.ExceedSendLimit` | 超出当日总量（新域名信誉度低） | 记日志告警；「邮件服务暂时不可用」 |
| `FailedOperation.TemporaryBlocked` | 触发收件服务商限制（暂停 10 分钟） | 同上，且**不要重试** |
| `FailedOperation.EmailAddrInBlacklist` | 收件人在黑名单 | 「该邮箱暂时无法接收邮件」 |
| `FailedOperation.InvalidTemplateID` | 模板 ID 无效或未过审 | 记日志（属配置错误） |
| `FailedOperation.WithOutPermission` | 只支持模板发送 | 记日志（属代码错误） |
### 7.5 信誉度等级与发信额度（本项目实测：**1 级 / 500 封每天**）

发信域名「验证通过」后，控制台会给它一个**动态信誉度等级**，等级决定**单日最大发信量**：

| 等级 | 单日上限 | 等级 | 单日上限 |
| --- | --- | --- | --- |
| **1（新建默认）** | **500** | 5 | 10,000 |
| 2 | 1,000 | 6 | 20,000 |
| 3 | 2,000 | … | … |
| 4 | 5,000 | 20 | 1,000,000 |

**升级**（满足任一即可，实时生效）：当日发送量 ≥ 当前上限的 **70%**，且到达率 >92%、
无效地址率 <5%、垃圾退信率 <2.5%、投诉率 <0.1%（另一条路径看打开率 >50%）。

**降级与临时封禁的门槛都写着「当日发送量 > 300」**。

> ✅ **结论：我们的量级非常安全，而且根本碰不到降级线。**
> 验证码按每天几十封算，只占 1 级额度（500/天）的**不到 10%**；
> 而**降级与临时封禁都要求"当日发送量 > 300"**——我们远够不到，等于处在一个"不会掉级"的位置，
> 也解释了为什么共享 IP 对我们完全够用。
>
> ⚠️ 反过来说，**也别指望升级**：升到 2 级需要**单日发 ≥ 350 封**（500 的 70%），
> 那会烧掉 1000 封免费额度的 35%。**我们不需要更高额度，停在 1 级最好。**
>
> ⚠️ **2026-05-07 之后开通的账号**：信誉等级**每个自然日最多提升 1 级**
> （本项目 2026-10-05 开通，适用此规则）。对我们无影响。
>
> 🔴 等级降到 **0 = 禁止发信**，每账号最多 **3 次**申请解封机会，且每次只能解封一个域名。

**控制台另有一列「发信IP」**：本项目显示 **共享IP** —— 正确，**不要点旁边的「添加独立IP」**
（理由见 7.3 步骤 2）。

### 7.6 地域选择：**用广州（`ap-guangzhou`）**

腾讯云 SES **只支持两个地域**：`ap-guangzhou`（广州）与 `ap-hongkong`（香港）。
本项目开通后最初落在**香港**（DKIM 选择器是 `qcloudhk2048`），**现已切到广州**。

#### 🔴 三条资源的隔离粒度**不一样**（实测，2026-10-05）

把控制台地域切到**广州**后逐页实测：

| 资源 | 是否按地域隔离 | 广州看到的 | 结论 |
| --- | --- | --- | --- |
| **发信域名** | ❌ **账号级**（两地域共用） | `mail.yxzmy.top` **验证通过** | **不用重建**，直接用 |
| **发信地址** | ✅ **地域级** | **共 0 条** | **要在广州新建**（秒完成，无审核） |
| **发信模板** | ✅ **地域级** | **共 0 条** | **要在广州新建**（⚠️ 等审核） |

**发信域名是账号级的佐证**——同一页提示原文：

> "单个腾讯云主账号可支持配置域名个数**累计**上限为10个，超过10个后不支持新增。"

**"累计"** = 该配额**跨地域合起来算**，不是每地域各 10 个。

**发信地址/模板是地域级的佐证**——广州视图下两者都是空的；
且发信地址页的注意事项写着 **`gz-smtp.qcloudmail.com`**（`gz-` 前缀 = 广州专属端点）。

**所以切广州的真实成本**：不用重建域名、不用提工单解绑、不用重加 MX/SPF/DMARC；
**只需（1）在广州建一个发信地址（秒完）（2）在广州建模板（等审核）
（3）把 API 的 `Region` 设成 `ap-guangzhou`。**

#### 为什么选广州

收件人主要是国内邮箱（QQ / 163，即国内玩家）。国内 ISP 的反垃圾系统对**境外来源 IP**
普遍更严；广州到国内邮箱路径更短，且地域定位就是国内业务。
（QQ 邮箱是腾讯自家的、受影响最小，但网易系等仍有差异，**综合以广州更优**。）

#### ⚠️ 还要看一眼 DKIM 选择器是否随地域变化

在广州视图下点域名行的「验证」，看它列的 DKIM 主机记录：

- 显示 `qcloudhk2048._domainkey.mail` → 与 DNS 已有记录一致，**不用动**；
- 显示 `qcloudgz2048._domainkey.mail` → 广州用另一把密钥，需在 DNS **再加一条**。

（状态已是「验证通过」，大概率两者一致。）

#### 严谨验证：看邮件的 `Authentication-Results`

发第一封测试邮件后，在收到的信里点「显示原始邮件」，找这一行：

```
Authentication-Results: ... spf=pass ... dkim=pass ...
```

- `spf=pass` 且 `dkim=pass` → 域名 / DNS / 地域三者完全对上 ✅
- `dkim=fail` 或 `none` → 地域与 DKIM 密钥不匹配，需补对应地域的 DKIM 记录

**这一行比"有没有进收件箱"更有信息量** —— 它直接告诉你身份认证过没过。

#### 附：「域名删不掉」已不再影响决策

| 出处 | 原文 |
| --- | --- |
| 控制台发信域名的**操作列** | 只有 **验证 / 添加独立IP / 编辑标签** —— **没有「删除」**（`验证通过` 状态） |
| 新建时的弹窗 | "**域名创建成功后不支持删除**，请确认填写无误后再提交" |
| 官方 FAQ | "如果您需要更换发信域名，请**单独联系腾讯云技术支持**" |

因为域名是**账号级**的、两个地域共用同一条配置，
**不存在"香港占着一份、广州要另建一份"的局面**，所以"删不掉"已经不再是问题。

#### ⏰ 模板审核的时间陷阱

官方模板页原文："**模板提交后，预计1个工作日内完成审核（周末、节假日顺延）**"。
官方 FAQ 补充："在休息日提交，将会在下一个工作日内完成审核"。

⚠️ **本项目首次提交模板是 2026-10-05（周一，国庆期间）**
→ 若 10/5–10/7 属法定假期，审核会**顺延到节后第一个工作日**。
**判断是否被打回要看控制台「当前状态」列的红色感叹号**，
而不是"过了一天还没过"——后者可能只是假期顺延。

---

### 7.7 备案问题：**不需要备案（广州同样不需要）**

官方【域名相关问题】页（2025-08-21 更新）原文：

> **如果域名仅用于发送邮件，不强制备案通过。**
> **如果域名的 A 记录指向大陆服务器，则需要备案。**

对号入座：本项目发信域名 `mail.yxzmy.top` **仅用于发信**，且**没有任何 A 记录**
（实测只有 1 条 MX + 3 条 TXT）→ **不触发备案要求**。
**该规则不分地域**（FAQ 未按地域区分）→ **广州地域同样不需要备案**。

→ 因此"备案"**不是**切广州的障碍。

同一页另外两条（都支持我们的方案）：

> "同一主域名下的子域名可以用于邮件推送。"
> "不同子域名使用不同邮箱服务**没有影响**。"

→ 确认 `mail.yxzmy.top` 作发信域是对的，且将来根域若用别的邮件服务**也不冲突**。

---

### 7.8 邮件模板审核规范（官方原文逐条核对）

官方【模板相关问题】（2025-09-23 更新）：

| 规范 | 官方要求 | 本项目模板 |
| --- | --- | --- |
| 必须体现实际业务 | 除变量外的文本要能判断邮件含义与使用场景 | ✅ 有"深渊大书院""邮箱验证""验证码" |
| **字数** | 营销类 ≥150 字；**通知/事务/测试类 ≥50 字**；**触发类无要求** | ✅ 约 **77 字**（即使按通知类算也达标） |
| 变量比例 | 变量 : 文字 ≤ **1:5**，**不支持全变量模板** | ✅ 2 个变量 vs 77 字，远低于 1:5 |
| 图片 | ≤50 张；不支持全图片、不支持只有一张图而无文字 | ✅ **零图片** |
| 禁止内容 | 含**加 QQ、加微信、加群**、钓鱼、赌博、返利等 | ✅ 全无 |
| URL 链接 | 必须是确定且合规的 | ✅ **零链接**（比"有链接"更安全） |

**结论：`scripts/dev/ses-templates/verify-code.html` 不需要改，可直接提交。**

模板被拒时，**不通过原因显示在控制台 邮件配置 → 发信模板 页面的红色感叹号处**。

---

### 7.9 送达率：风险排序与官方反垃圾要点

#### 🔴 风险排序：**先改模板，最后才考虑地域**

官方【注意事项 → 如何避免邮件被认定为垃圾邮件】里有一条**直接命中我们的模板**：

> 第 5 条："邮件字体注意使用常规字体，**不要使用各种颜色**，或艺术字体。"

`verify-code.html` 用了 3 种文字颜色 + 背景色（同色系、非花哨配色），
**踩在这条建议边上**。同页第 4 条"不要出现 URL 网页链接"我们**已避开**（零链接、零图片）。

**若实测进垃圾箱，修改优先级**：

| 优先级 | 动作 | 理由 |
| --- | --- | --- |
| **1** | **模板改纯文字黑字** | 官方点名"不要用各种颜色"，且这是**已确定的因素** |
| 2 | 检查标题与正文措辞 | 官方："标题不要太另类、不要明显营销体" |
| 3 | 检查收件人地址质量 | bounce 率 >5% 会被 ISP 扣分 |
| **4** | **最后才考虑切地域** | 地域是**不确定的概率**，成本却是重建 + 等审核 |

**先改确定的、再赌不确定的** —— 不要一上来就折腾地域。

#### 其它官方要点

- 🔴 **黑名单库「所有账户通用」、被封 180 天**：官方原文"在其它账户产生黑名单的收件人邮箱，
  也会加入黑名单库" → **别人造成的黑名单会影响我们**，这是共享 IP 之外的另一个不可控风险。
- 📊 **到信时间一般 3 秒 ~ 5 分钟**（最高 72 小时）。
- 📌 **官方明确建议**："所有业务侧增加**'如果没有收到邮件，请检查垃圾箱'**的用户提示"
  → 写进前端（发码后的提示文案）。
- **bounce 率不应超过 5%**。
- **打开的率低于 50% 视为进入垃圾箱的危险信号**（注册类邮件 80% 以上为正常）。
- ⚠️ FAQ 有一条**与定价页/控制台矛盾**："目前暂不提供专用 IP 服务"（该 FAQ 更新于 2025-01-06），
  而定价页与控制台都提供独立 IP → **以控制台为准**（FAQ 未更新）。反正我们不开。

#### 关于"退订按钮"：**触发类不加**

官方反垃圾建议第 6 条说"提供醒目的退订按钮"，但那针对**营销/批量**邮件。
官方【批量发送注意事项】第 1 条明确："**触发类邮件（身份验证、交易相关等）建议通过
API - SendEmail 接口发送**" → 验证码属触发类，用 `TriggerType: 1` + `Unsubscribe: 0`
（**不加退订**：用户不可能"退订"验证码，加了反而更像营销邮件）。

## 八、数据模型（D1 迁移）

新增三张表；`comments` 表**只加一列**，历史匿名评论 `user_id = NULL` 继续显示。
全部 `IF NOT EXISTS`，可重复执行。

```sql
-- 迁移 1：用户
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  public_no      INTEGER NOT NULL UNIQUE,     -- 对外展示的 **5 位**编号，**顺次递增、公开**
  email          TEXT    NOT NULL,            -- 明文：要发信，且用户要能看见自己的账号
  email_hash     TEXT    NOT NULL UNIQUE,     -- HMAC-SHA256(SALT_SECRET, 'lookup:'+normalize(email))，查询与去重用
  nick           TEXT    NOT NULL UNIQUE,     -- 🔴 **昵称唯一**（2026-10-05 决定）
  avatar         TEXT    DEFAULT 'at001_0',   -- 默认「希尔（女主）」；复用评论头像 ID 体系
  -- 密码：只存 verifier 的派生值，**永远不存密码，也不存 verifier 本身**
  verifier_hash  TEXT    NOT NULL,            -- HMAC-SHA256(AUTH_PEPPER, verifier)
  -- 🔴 密码盐必须**存下来**（不能每次从当前邮箱现算）：
  --    盐是按邮箱派生的，而换邮箱会换掉邮箱 —— 现算的话盐就变了，
  --    用户换完邮箱**再也登不上**（库里存的是按旧盐算的 verifier_hash）。
  --    盐不是秘密（本来就随 /api/auth/salt 公开返回），明文存即可。详见 4.2.1
  pw_salt        TEXT    NOT NULL DEFAULT '',
  pw_algo        TEXT    NOT NULL,            -- 'client-pbkdf2-sha256'（将来换服务端 KDF 时改这里）
  pw_iters       INTEGER NOT NULL,            -- 600000，如实记录，便于将来判断是否需要升级
  pepper_ver     INTEGER NOT NULL DEFAULT 1,  -- AUTH_PEPPER 轮换用（见 4.4 第 7 条）
  status         INTEGER NOT NULL DEFAULT 1,  -- 1 正常 / 2 封禁 / **3 已注销**
  replies_read_at INTEGER DEFAULT NULL,       -- 「回复我的」未读数基准（免去另建已读表）
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER DEFAULT NULL,
  pw_changed_at  INTEGER DEFAULT NULL
);
-- email_hash / nick / public_no 上的 UNIQUE 已隐含索引，不再另建
--
-- **public_no 怎么分配**：`public_no = 9999 + id`（首个用户 = 10000）。
--   为什么这样而不是 `MAX(public_no)+1`：**没有竞态**（并发注册不会撞号），也不用多查一次。
--   反正这个编号**本来就是要公开的顺次序号**（用户要求"显示一个注册数量"），
--   与 id 只差一个常量偏移，不构成额外信息泄漏。5 位空间 = 10000~99999，够 9 万用户。
--
-- **三种 status 的语义**：
--   1 正常 ｜ 2 封禁（不能登录、不能评论，**封禁时立即作废其全部 session**）
--   ｜ 3 已注销（**软删除**：清空 email/email_hash/verifier_hash 等个人数据，但**保留 id 与 nick 的占位**，
--      让评论仍能关联、且**该邮箱不能再被重新注册**，防止冒用历史评论）

-- 迁移 2：邮箱验证码（短命、可重发）。三种用途共用一张表
--
-- 为什么**不**用 (email_hash, purpose) 做主键 + UPSERT 覆盖：
--   邮件到信时间为 **3 秒 ~ 5 分钟**，重发时两封可能**乱序到达**
--   （第 2 封先到、第 1 封后到）。若"重发即作废旧码"，用户打开旧邮件输码会**无辜失败**。
--   因此**允许同一 (邮箱, 用途) 同时存在最多 3 个有效码**。
--   6 位码有 100 万种，且尝试次数按邮箱维度限制、窗口仅 10 分钟 —— 多码不实质削弱安全性。
CREATE TABLE IF NOT EXISTS auth_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT    NOT NULL,
  purpose    TEXT    NOT NULL,        -- 'register' | 'password' | 'email_change'
  code_hash  TEXT    NOT NULL,        -- **HMAC-SHA256(AUTH_PEPPER, code)**，见下方说明；不存明文
  expires_at INTEGER NOT NULL,        -- 10 分钟
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup
  ON auth_codes(email_hash, purpose, created_at DESC);
-- 校验：取该 (邮箱, 用途) **最近 3 条未过期**记录逐一比对；命中即删除该 (邮箱, 用途) 全部记录。
-- 尝试次数**不存这里**，按**邮箱维度**记到 rate_limits（bucket = 'authfail:<email_hash>'）。
--
-- 🔴 **为什么 code_hash 必须带 pepper，不能是裸 SHA-256**：
--   验证码只有 **6 位数字 = 100 万种可能**。拿到库的人把 000000~999999 全算一遍 SHA-256
--   是**毫秒级**的事——对这么小的空间，裸哈希基本等于没哈希。
--   改用 **HMAC-SHA256(AUTH_PEPPER, code)** 后，pepper 只存在 Worker 环境变量、**不在库里**，
--   于是**光偷到 D1 备份也破不了**。与 `users.verifier_hash` 用的是同一招，口径一致。
--   （10 分钟过期本身已限制了风险，所以这是顺手补上的加固。）

-- 迁移 3：会话
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT    PRIMARY KEY,   -- SHA-256(token)；明文只在登录响应里给一次
  user_id      INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,      -- 30 天
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER DEFAULT NULL,
  ua_hash      TEXT    DEFAULT NULL,
  ip_hash      TEXT    DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 迁移 3：人机验证（蛋点选）。与 auth_codes 同一套模式
CREATE TABLE IF NOT EXISTS captchas (
  id         TEXT    PRIMARY KEY,   -- 随机 token，前端拿到的就是 captchaId
  answer     TEXT    NOT NULL,      -- HMAC-SHA256(AUTH_PEPPER, 正确实例序号序列)
  expires_at INTEGER NOT NULL,      -- 3 分钟
  created_at INTEGER NOT NULL
);
-- 校验后**无论对错都立即删除该行**（一次性）——所以**不需要 attempts 计数**：
-- 「错 1 次即整题作废」是一次提交定生死，没有"同题内重试"这回事。

-- 迁移 4：评论挂账号
ALTER TABLE comments ADD COLUMN user_id INTEGER DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_user   ON comments(user_id);    -- 「我的评论」列表
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);  -- 「谁回复了我」
-- ⚠️ **上面两条索引推翻了本方案早先的结论**。原文写"不提供按 user_id 列评论的功能，
--    索引先不加"——该结论已作废：新增了「我的评论」与「谁回复了我」两个功能，
--    **两个方向都要查**（按 user_id 找评论；按 parent_id 找子回复）。
--    评论量极小，索引写入成本可忽略。

-- 迁移 5：**清空测试数据**（⚠️ 这不是常规迁移，只是把上线前的测试评论清掉）
DELETE FROM comments;
DELETE FROM rate_limits;
-- 依据：线上现有 id 17~24 共 8+ 条测试评论（全部 site:general，内容为 "dawdawd" 之类）。
-- **本机身份退役后，老匿名评论的自删令牌机制（`comments.token_hash`）一并退役**：
-- `token_hash` 列**保留不用**（SQLite 删列代价高，留着无害），删评论改由账号（user_id）承担。
```

**D1 额度核对**（免费版：读 500 万行/天、写 10 万行/天，索引写入也算行）：

| 动作 | 写行数（估） |
| --- | --- |
| 发一次验证码 | 1（`auth_codes` INSERT）+ 0~2（顺手清该邮箱的过期行）+ 1~2（`rate_limits`） |
| 注册 | 1（`users`）+ 1（删码）+ 1（`sessions`） |
| 登录 | 1（`sessions`）+ 1（更新 `last_login_at`） |
| 改密码 | 1（`users`）+ 1（删码）+ N（作废其它 session） |

日均几十次登录 ≈ 几百行，**远低于 10 万行/天**。

### 8.1 `auth_codes` 行的六条清理路径（实现时都要覆盖）

| # | 时机 | 处理 |
| --- | --- | --- |
| **1** | **验证成功** | 删除该 `(email_hash, purpose)` 的**全部**记录 |
| **2** | **验证码过期**（10 分钟） | 行先留着，校验时被 `expires_at` 过滤；**下次给该邮箱发码时顺手删掉它的过期行** |
| **3** | **尝试超限**（10 分钟内错 5 次） | 删除该 `(email_hash, purpose)` 全部记录，要求重新获取 |
| **4** | **重发导致超过 3 条** | 删掉**最旧的**，保持该 `(email_hash, purpose)` 最多 3 条有效 |
| **5** | **用户删除账号** | 连带删该邮箱**全部**记录（不分 purpose） |
| 6 | （兜底，**可选**）定期全局清理 | Cron Trigger；**本项目量级小，第一版不做也可以** |

> 🔴 **第 1 条为什么必须删「全部」而不是「命中的那一条」**：
> 因为允许**同时存在最多 3 个有效码**（应对到信 3~5 分钟的乱序）。
> 若只删命中那条，**更早那两封邮件里的码仍然有效** —— 于是"改密码已经完成，
> 但旧邮件里的码还能再改一次密码"。必须整体清掉。

**过期行堆积不是问题**（算给实现者看，免得过度设计）：

| 项 | 数值 |
| --- | --- |
| 每行 ≈ | 100 字节 |
| 我们的速度 | 每天几十封 → 一年约 **2 万行** |
| 一年占用 | ≈ **2 MB** |
| D1 免费版存储 | **5 GB**（差 2500 倍） |

且路径 2 已让"还会回来的用户"顺手清掉自己的过期行；不回头的用户留下的过期行
**不影响任何逻辑**（查询永远按 `expires_at` 过滤），只占极小空间。

---

## 九、接口契约

放在 `functions/api/[[path]].js` 同一文件、同一 `onRequest` 分发内
（**改完必须重启 `npm run dev:api`**——wrangler 不热加载 `functions/`，这条已踩过两次）。

**用户端**（文案的完整版见 §十七）：

| 方法 | 路径 | 请求 | 成功响应 | 失败文案（面向用户） |
| --- | --- | --- | --- | --- |
| GET | `/api/auth/captcha` | — | `{ ok, captchaId, svg }` | 验证码暂时出不来，请稍后再试 |
| POST | `/api/auth/code` | `{ email, purpose, captchaId, picks }` | `{ ok, cooldown:60 }` | 人机验证没通过，请重新点击 / 邮箱格式看起来不对，检查一下 / 请用常用邮箱，临时邮箱收不到验证码 / 请 N 秒后再试 / 邮件暂时发不出去，请稍后再试 |
| GET | `/api/auth/salt` | `?email=` | `{ ok, salt, iters, algo }` | 已注册 → 返回**库里存的 `pw_salt`**；未注册 → 现算。**两者形状一致，不区分是否存在** |
| POST | `/api/auth/register` | `{ email, code, verifier, nick, avatar }` | `{ ok, token, user }` | 验证码不对，或者已经过期了 / 验证码已作废，请重新获取 / 这个邮箱已经注册过了，直接登录吧 / 这个名字已经有人用了，换一个吧 / 昵称至少 2 个字符 / 昵称最多 12 个字符 |
| POST | `/api/auth/login` | `{ email, verifier }` | `{ ok, token, user }` | 邮箱或密码不对 / 发得太频繁了，请 N 分钟后再试 / 该账号已被停用 |
| GET | `/api/auth/me` | Bearer | `{ ok, user }` | 登录状态已过期，请重新登录 |
| PATCH | `/api/auth/me` | Bearer + `{ nick?, avatar? }` | `{ ok, user }` | 这个名字已经有人用了，换一个吧 / 昵称至少 2 个字符 / 昵称最多 12 个字符 |
| POST | `/api/auth/password` | Bearer + `{ code, verifier }` | `{ ok }` | 验证码不对，或者已经过期了 |
| POST | `/api/auth/email` | Bearer + `{ newEmail, oldCode, newCode }` | `{ ok, user }` | 验证码不对，或者已经过期了 / 这个邮箱已经被其他账号使用了 / 新邮箱和当前邮箱一样，不用改 |
| GET | `/api/auth/comments` | Bearer + `?cursor=&limit=` | `{ ok, comments, nextCursor }` | 暂时取不到，可能是网络问题。 |
| GET | `/api/auth/replies` | Bearer + `?cursor=` | `{ ok, replies, unread, nextCursor }` | 暂时取不到，可能是网络问题。 |
| POST | `/api/auth/replies/read` | Bearer | `{ ok }` | —（把 `replies_read_at` 推到当前） |
| POST | `/api/auth/logout` | Bearer | `{ ok }` | —（幂等，**只退当前会话**） |
| DELETE | `/api/auth/me` | Bearer | `{ ok }` | —（**软删除**：`status=3`、清个人数据、把其评论的昵称快照改写为「账号已注销」） |

**管理端**（全部在 `ADMIN_TOKEN` 保护下；**不是攻击面**——没令牌在 `isAdmin()` 就返回 401）：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/admin/stats` | 概览指标：评论（总数/今日/回复数/待审/显示/隐藏 + 近 7 天逐日）、用户（总数/正常/封禁/已注销/今日 + 近 7 天逐日）、活跃会话数 |
| GET | `/api/admin/users` | 用户列表（分页 + 按编号 / 昵称 / 邮箱搜索 + 按状态筛；每行带 `commentCount`） |
| PATCH | `/api/admin/users` | 封禁 / 解封（**封禁时同时作废该用户全部 session，立即踢下线**）。只允许在 1↔2 之间切，**不允许改成 3** —— 注销是用户自己的动作 |
| DELETE | `/api/admin/users` | **彻底删除**（删 `users` + `sessions` + `auth_codes`；评论保留、昵称改写为「账号已注销」且 `user_id` 置空）。与用户自助软删除的关键区别：**释放邮箱，可重新注册** |
| GET | `/api/admin/comments` | **已有**，新增 `?userId=` 参数用于"按用户查评论"；返回行新增 `userId` 字段（**只在管理端加**，公开的 `/api/comments` 不含它） |

> **管理端认证**：沿用既有的 `x-admin-token` 头（比对 SHA-256 哈希、恒定时间比较）。
> `ADMIN_TOKEN` 未配置时**整段 `/api/admin/*` 一律 404**（对外表现为"接口不存在"），
> 这条从原来的"仅 `/api/admin/comments`"扩成了**前缀匹配**，新增管理接口不必再改路由判断。

> 🔴 **封禁必须连带清 session**：否则用户手上那个 30 天的令牌还能继续用 ——
> "封了但没封住"是最糟的失败方式。端到端套件里有一条专门守它
> （`🔴 封禁后原令牌立即失效`）。

> **换邮箱为什么一次提交两个码**：前端分两步收集（先输旧邮箱的码、再输新邮箱的码），
> 但**最终一次提交 `{ newEmail, oldCode, newCode }`**，服务端**一次把两个都验掉**。
> 这样不会出现"第一步已通过、第二步半途而废"的中间态。
>
> **"新邮箱是否已被占用"的检查放在验证通过之后** —— 否则一个已注册用户
> 能拿换邮箱接口枚举"某邮箱是否注册"。放到验证之后，攻击者得先能收到那个新邮箱的信。

**硬性契约**（与评论接口同风格，要有单测锁住）：

1. **不泄漏**：任何响应都不得出现 `verifier`、`verifier_hash`、`code`、`code_hash`、
   `email_hash`、`token_hash`、`ip_hash`、`ua_hash`、`AUTH_PEPPER`。
2. **不泄漏账号是否存在**：`/api/auth/login` 对"邮箱不存在"与"密码错误"返回**同一句**
   `邮箱或密码不对`；`/api/auth/salt` 对任何邮箱都返回盐。
3. **限流**：**主防线是同邮箱，IP 只做兜底**。

   | 维度 | 阈值 | 说明 |
   | --- | --- | --- |
   | **同邮箱** | **60 秒 1 次**，且**每天最多 10 次** | 冷却**按邮箱单维度**计，**不分 purpose** —— 否则可用"注册 / 改密码"交替绕过 |
   | **同 IP** | **每小时 20 次 / 每天 100 次** | **宽松兜底**，只拦"同一台机器批量换邮箱刷" |

   > ⚠️ **不要照搬评论接口的 `perHour:5 / perDay:20`**：那是"一个人发内容"的场景；
   > 而注册是**多人共用一个出口**（宿舍 / 公司 / 学校的 NAT）。
   > 5 次/小时会让**第 6 个真实用户被误伤** —— 被刷只是浪费额度，误伤是真人注册不了，后者更糟。

   冷却期内再次请求 **不是静默失败**，而是明确告知剩余秒数：服务端返回
   `{ ok:false, retryAfter:N }` + 文案「请 N 秒后再试」；前端按钮点完立刻变
   「N 秒后可重发」置灰倒计时 —— **两端都挡**（否则用户以为按钮坏了、狂点）。

   闸门顺序：**① 前端倒计时 → ② 同邮箱冷却 → ③ 同 IP 限流 → ④ 生成码并调 SES**。
   SES 侧的 **20 次/秒**（API + 地域 + 子账号维度）是第五道，正常流量**到不了那里**。

   登录失败另有计数（账号维度 + IP 维度），阈值可被环境变量覆盖以便本地端到端测试，**生产不设**。
4. **验证码**：6 位数字、**10 分钟有效**；**同一 (邮箱, 用途) 最多 3 个有效码并存**
   （理由见迁移 2 的注释：到信 3 秒 ~ 5 分钟会乱序）；
   **尝试失败按「邮箱维度」累计，10 分钟内错 5 次即作废该邮箱全部码**并要求重新获取；
   **验证成功立即删除该 (邮箱, 用途) 全部记录**（一次性）。
5. **会话**：30 天；`/api/auth/me` 可选更新 `last_seen_at`（注意写入计费）。
6. **封禁**（`users.status=2`）时拒绝登录与发评论，文案"该账号已被停用"。
7. **登录成功后**才签发 session；**改密码成功后作废其余全部 session**。
8. 对比一律用**恒定时间比较**。Cloudflare 提供了非标准的
   `crypto.subtle.timingSafeEqual(a, b)`，可直接用（比现有手写 `safeEqual` 更稳）。

---

## 十、前端改造点

| 文件 | 改动 |
| --- | --- |
| **`src/config/auth.js`（新）** | **协议的唯一定义处**：`PBKDF2_ITERS = 600000`、盐/字段名、错误文案。**前后端共享同一份**（与 `config/emoticons.js` 的做法一致，避免两端口径漂移） |
| **`src/utils/passwordKdf.js`（新）** | 纯函数：`deriveVerifier(password, salt)`，用 `crypto.subtle` 跑 PBKDF2。零依赖，可在 Node 里单测 |
| **`src/utils/authApi.js`（新）** | `requestCode / fetchSalt / register / login / fetchMe / updateMe / changePassword / logout`，与 `commentApi.js` 同风格（错误文案面向用户中文，技术原因写控制台） |
| `src/config/auth.js`（新） | **协议的唯一定义处**：`PBKDF2_ITERS = 600000`、`TEMPLATE_ID = 62671`（**换模板只改这一行**）、盐/字段名、错误文案、`CAPTCHA_*` 常量。前后端共享一份，避免口径漂移 |
| `src/utils/passwordKdf.js`（新） | 纯函数 `deriveVerifier(password, salt)`，用 `crypto.subtle` 跑 PBKDF2。零依赖，可在 Node 里单测 |
| `src/utils/authApi.js`（新） | `fetchCaptcha / requestCode / fetchSalt / register / login / fetchMe / updateMe / changePassword / changeEmail / fetchMyComments / fetchReplies / markRepliesRead / logout / deleteAccount`，与 `commentApi.js` 同风格 |
| `src/utils/identity.js` | 🔴 **移除本机身份**（昵称 / 头像的 localStorage 持久化整块删掉，含 `myrzg:identity`）；**保留头像目录部分**（`avatarCatalog` / `avatarPath`），注册选头像要用 |
| `src/utils/captcha.js`（新） | 蛋点选：拉 `{captchaId, svg}` → 渲染 SVG → 收集点击的**实例序号** → 提交 `picks` |
| `src/components/AccountModal.vue` | 改造为两个态：**未登录**（登录 / 注册 / 忘记密码 tab）、**已登录**（资料 / 我的评论 / 回复我的 / 账号安全）。复用现有 `UiAccordion` + `avatar-grid` 选头像 |
| `src/components/CommentComposer.vue` | **未登录时替换为登录引导**（不再允许匿名发表）；已登录时用服务端昵称/头像 |
| `src/utils/commentApi.js` | `postComment` 带上 `Authorization`（**必带**）；**自删令牌机制退役**（老评论已清空），删评论改走账号 |
| `src/App.vue` | `/admin` 走**独立外壳**（隐掉左导航与右讨论栏，参考现有 `is-gacha-stage` 的做法，加 `is-admin`）；顶栏账号入口 |
| `src/views/admin/`（新） | 后台改版：独立布局 + **概览 / 评论管理 / 用户管理**；羊皮纸主题 + 提高信息密度 |
| `src/views/PrivacyView.vue`（新） | `/#/privacy` 静态页（位置先占，内容后补） |
| `functions/api/[[path]].js` | 新增 `/api/auth/*` 与 `/api/admin/{stats,users}` 分发；`createComment` 解析 Bearer 得到 `user_id`（**未登录直接拒绝**）；`/api/auth/code` 里把真发信动作放进 `context.waitUntil`（**抹平"已注册/未注册"的响应时间差**） |

**新的行为红线**（写进验收）：

- **未登录不能发表评论**，发表区显示登录引导；**读评论不受限**（这是 2026-10-05 用户明确变更的决定，
  不是 bug——原文"未登录仍可评论、本机身份不得回退"**已作废**）；
- **老匿名评论已清空**，`comments.token_hash` 列保留不用，自删令牌机制退役；
- 账号被**封禁**时立即作废其全部 session（踢下线）；
- 账号**注销**后，其评论昵称位显示「账号已注销」，且**该邮箱不能再被注册**。

---

## 十一、三条流程

### 11.1 注册

```
用户填邮箱 → POST /api/auth/code {email, purpose:'register'}
  服务端：限流 → 生成 6 位码 → 存 code_hash(10 分钟) → SES 发信
用户填码 + 设密码 → 前端 GET /api/auth/salt?email= 拿盐
  → 前端本地：verifier = PBKDF2(password, salt, 600000)      ← 密码到此为止，不上传
  → POST /api/auth/register {email, code, verifier, nick, avatar}
  服务端：校验码 → 查重 email_hash → 存 HMAC(pepper, verifier) → 建 session → 返回 token
```

### 11.2 登录

```
用户填邮箱 + 密码
  → GET /api/auth/salt?email=             （不查库、不泄漏账号是否存在）
  → 前端本地派生 verifier（约 0.1~0.6 秒，需加载态）
  → POST /api/auth/login {email, verifier}
  服务端：email_hash 查用户 → HMAC(pepper, verifier) 恒定时间比对
          → 失败则计数并限流（对外统一文案"邮箱或密码不对"）
          → 成功：建 session、更新 last_login_at
```

### 11.3 改密码 / 忘记密码（**同一个流程**）

```
已登录（或未登录但走"忘记密码"入口）→ POST /api/auth/code {email, purpose:'password'}
  → 验证码发到**账号邮箱**
用户填码 + 新密码
  → 前端用盐派生**新的** verifier
  → POST /api/auth/password {code, verifier}
  服务端：校验码 → 更新 verifier_hash、pw_iters、pw_changed_at
          → **作废该用户其余全部 session**（当前会话保留）
          → 发一封"密码已变更"通知邮件
```

---

## 十二、安全边界与非技术成本

存了用户邮箱，就从"纯静态工具站"变成"**持有个人数据的服务**"——性质变化大于工作量：

- [ ] **隐私政策页**（`/#/privacy`）：收集什么、干什么用、怎么删。**M0 之前先定位置**，内容后补。
- [ ] **能响应删除请求**：`DELETE /api/auth/me`（**已定案：软删除**，`status=3`、清个人数据、
      评论昵称改写为「账号已注销」、该邮箱不可再注册 —— 见 14.1 第 9 项）。
- [ ] **泄露风险**：`email` 明文入库是必需的（要发信）→ 库权限、备份、`AUTH_PEPPER` 与
      `SALT_SECRET` 的存放要收紧（**都放 Cloudflare 环境变量，不进仓库、不进 D1**）。
- [ ] **`AUTH_PEPPER` 与 `SALT_SECRET` 一旦丢失或改动**：pepper 改了/丢了 = 所有人无法登录（只能强制重置）；
      salt 改了/丢了 = 所有 `email_hash` 失效（**等于丢全部账号**）。
      🔴 **两把都已配好，且"设了就永远不能改"——必须单独备份到密码管理器。**

---

## 十三、里程碑与工作量

> ⚠️ **本节是当时的估算**，保持原样以便对照。实际执行时的里程碑编号与内容
> 与这里**不一致**（实际按 M1 后端 → M3 前端 → M4 评论挂账号 → M5 我的评论 →
> M6 谁回复了我 → M7 后台改版 → M8 收尾 推进）。
> 真实进度与验收证据见 **§十八「实现记录（与设计的偏差）」**。

| 里程碑（当时估算） | 内容 | 估时 | 验收 |
| --- | --- | --- | --- |
| **M0** | 发信最小验证跑通（第七节 7.3）；隐私政策页位置定下来 | 0.5~1 天 | 验证码邮件进**收件箱**（QQ/163/Gmail 各一次） |
| **M1** | D1 迁移 + `/api/auth/*` 接口 + 限流 + 不泄漏 | 1~1.5 天 | 接口单测（限流、不泄漏、账号不枚举、幂等、封禁） |
| **M2** | `passwordKdf.js` + 单测（**含与 Node 参考实现的向量对齐**） | 0.5 天 | 同一 `(password, salt, iters)` 在浏览器与 Node 得到**相同** verifier |
| **M3** | 前端注册/登录/改密码 + `identity` 两层改造 | 1~1.5 天 | 端到端：注册 → 发评论 → 退出 → 再登录 → 改密码 → 旧密码失效 |
| **M4** | 评论挂 `user_id` + 管理端显示来源 + 既有评论回归 | 0.5 天 | 既有评论测试套件全绿 |
| **M5** | 真机验证 KDF 耗时 + 文档同步 + 日报 + 上线验收 | 0.5 天 | 低端安卓机上登录耗时实测并记录；`npm run verify` 全绿、线上实测 |

合计约 **4~5.5 天**（路线 A）。路线 B（服务端 KDF）约 3~4 天，但多一项 $5/月 的持续成本。

---

## 十四、决策记录

### 14.1 已确认（2026-10-05 用户逐项选定 —— 共 22 项）

| # | 项 | 决定 |
| --- | --- | --- |
| 1 | **路线** | **A：客户端 KDF**（PBKDF2-SHA256 600k 跑在**用户设备**；服务端只做 `HMAC(AUTH_PEPPER, verifier)`）；数据**仍全在自己的 D1** |
| 2 | **发信服务** | **腾讯云 SES**，地域 **广州 `ap-guangzhou`**；模板 **`TemplateID = 62671`**（2026-10-05 过审；**换模板只改 `src/config/auth.js` 一行**） |
| 3 | **改密码** | **只用邮箱验证码，不校验旧密码**。代价已知：**邮箱被攻破 = 账号被攻破**；缓解：作废其余 session + 发变更通知 |
| 4 | **防刷** | ❌ **Turnstile**（国内加载失败 = 完全无法注册，风险太大；**代码保留接入点**，配环境变量即生效）<br>❌ **PoW**（成本对用户与脚本**对称**；在本项目量级下攻击者成本可忽略，却白让用户耗电发热）<br>✅ **蛋点选 SVG 验证码**（只放在"发码"那一步）<br>✅ **蜜罐字段 + 人类时序校验 + 一次性邮箱域名黑名单** |
| 5 | **昵称** | **唯一** |
| 6 | **编号** | `public_no`，**5 位**（10000 起），顺次递增，**公开显示**（昵称上方一行，不做特殊化） |
| 7 | **账号范围** | 基础账号 + **我的评论列表** + **谁回复了我（可点击定位）** + **换邮箱** |
| 8 | **换邮箱** | **旧邮箱 + 新邮箱双验证**；"新邮箱被占用"的检查**放在验证通过之后**（否则成了枚举器） |
| 9 | **删账号（用户自删）** | **软删除**（`status=3`）：评论保留、昵称显示「账号已注销」、**该邮箱不可再注册**（防冒用历史评论） |
| 10 | **删账号（管理员）** | 可**封禁**（**立即踢下线**）+ **彻底删除**（删 users / sessions / auth_codes；评论保留并改写昵称） |
| 11 | **评论权限** | 🔴 **必须登录才能发**；**读评论不需要登录**；未登录时发表区显示登录引导 |
| 12 | **本机身份** | 🔴 **整个移除**（含 `localStorage['myrzg:identity']`）；**头像目录部分保留**给账号用 |
| 13 | **老评论** | **全部作废**（清空 `comments`，放进迁移脚本） |
| 14 | **防枚举** | `/api/auth/code` 对已/未注册邮箱**返回完全一致的响应**，并用 `context.waitUntil` **抹平响应时间差** |
| 15 | **会话** | **30 天、滑动过期**；改密码后作废其余 session（保留当前那台） |
| 16 | **密码强度** | ≥8 位 + 拒绝常见弱口令。**前端校验** —— 服务端只收到 verifier，**看不到密码** |
| 17 | **注册字段顺序** | 昵称 → 头像 → 密码 → 确认密码 → 邮箱 → 验证码；头像默认 `at001_0`（希尔·女主）；**确认密码纯前端校验** |
| 18 | **前端入口** | **改造现有 `AccountModal.vue`**，不新开弹窗 |
| 19 | **后台** | **独立外壳** + **概览 / 评论管理 / 用户管理**；**羊皮纸主题**（沿用设计体系，提高信息密度）；**与账号体系一起做** |
| 20 | **隐私政策** | 新增 `/#/privacy` 静态页；**注册时必须勾选同意** |
| 21 | **邮件提示** | 发码成功后提示「几分钟没收到的话，翻一下垃圾邮件」（官方建议） |
| 22 | **环境变量** | `AUTH_PEPPER` / `SALT_SECRET` **已配好** —— 🔴 **设了永远不能改**（改了等于全体用户密码作废） |

> **补记：关于"能不能直接走 D1"**。D1 是数据库，A / B 两条路线**都用它**，它不是一个可选项。
> 真正的分歧是"那 60 万轮运算**在哪台机器上算**"——路线 A 把它放在**用户设备**上，
> 而不是让 Cloudflare Worker 去算（后者受 10ms 预算与 10 万轮封顶限制，见第二节）。
> 另外：除了发信，本方案**不需要任何其它服务**——没有 KV、没有 R2、没有第三方认证，
> 存储就是 D1。

### 14.2 已全部定案（无遗留）

原先挂在这里的四个问题，用户已在 2026-10-05 逐项决断：

| 原问题 | 定案 |
| --- | --- |
| 昵称是否唯一 | **唯一**（14.1 第 5 项） |
| 账号能做什么 | 基础 + 我的评论 + 谁回复了我 + 换邮箱（第 7 项）。**"编辑历史"不做**——评论本身不支持编辑，那是伪需求 |
| 删除账号时评论怎么处理 | **软删除 + 显示「账号已注销」**（第 9 项） |
| 隐私政策页谁写、放哪 | `/#/privacy`，**位置先占、内容后补**（第 20 项） |
---

## 十五、明确不做的事（避免范围蔓延）

- **不做**服务端直接哈希密码的免费版方案（10ms 决定的，见第二节）；
- **不做**超过平台封顶的 PBKDF2 轮数（生产会在入口报错，本地测不出来）；
- **不做**挑战-响应 / SRP / OPAQUE（会让"D1 泄露也安全"这条消失，见 4.3）；
- **不用** Redis / KV 存验证码（**考虑过，明确排除**）：

  | 选项 | 有 TTL？ | 为什么不用 |
  | --- | --- | --- |
  | **Redis**（传统后端的标准答案） | ✅ 原生 `SETEX` | **Workers 环境里没有**；要用得接第三方（Upstash 等）→ 多一个依赖 + 一份钱。而"验证码 10 分钟自动消失"这件事，我们用 `expires_at` + 应用层过滤同样能做到，见 8.1 |
  | **Cloudflare KV** | ✅ `expirationTtl` | 🔴 **最终一致** —— 写入后全球生效最多 **60 秒**。而我们是"发码 → 用户回填 → 立刻校验"，**可能读到未同步的旧数据**。验证码场景不能赌这个 |
  | **Durable Objects** | ✅ `alarm` 定时清理 | 强一致、能力更强，但**复杂度远高于收益** |
  | **D1（采用）** | ❌ 无原生 TTL | 但**已经为评论存在**，强一致、有备份、免额外依赖；`expires_at` + 六条清理路径（8.1）已覆盖 |

  > 本质区别只是**"过期"放在哪一层**：Redis 放**存储层**（代码更少），
  > 我们放**应用层**（多几行清理）。**不是先进与否，是环境决定选型。**
- **不做**邮箱验证以外的实名/手机号；
- **不做**账号与游戏数据绑定（本站不连游戏账号，这是 [SPEC](../SPEC.md) 的既定边界）；
- 🔴 **不做**"未登录也能评论" —— **2026-10-05 用户变更决定**：原文"不删本机身份与匿名评论"
  与"未登录仍可评论"**均已作废**。现在是**必须登录才能发、读评论不受限**，
  本机身份整体移除，老匿名评论清空（见 14.1 第 11、12、13 项）。
- **不用** Turnstile（**国内加载失败会导致完全无法注册**；代码保留接入点，将来配环境变量即可启用）；
- **不用**工作量证明 PoW（**成本对用户与脚本对称**；在本项目量级下攻击者成本可忽略，
  却让用户白耗电与发热 —— 性价比为负）；
- **不改**评论现有接口契约（只把 `Authorization` 从**可选**头改为**必带**）。

---

## 十六、复现与验收入口

| 要验的东西 | 入口 |
| --- | --- |
| 本文第二节的耗时与封顶数字 | [`scripts/dev/kdf-probe/`](../../scripts/dev/kdf-probe/README.md)（本地 `wrangler dev`，只读） |
| **发信通道：进不进收件箱** | 第七节步骤 6 —— **这才是真正的开工前置** |
| **生产环境变量到底配没配** | `GET /api/admin/comments` 带**假令牌**：**401 = 生产已配 `ADMIN_TOKEN`**；**404 = 未配**（依据 `[[path]].js` 889 / 917 行）。2026-10-05 实测线上 = **401**，据此确认 Cloudflare「变量和密钥」页签下的那套就是**生产**环境，新增的 `TENCENT_SECRET_*` 同样在生产可用。**只读、用假令牌、不碰真数据** |
| 接口契约 / 限流 / 不泄漏（含账号不枚举） | `npm run dev:api` + 新增 `tests/unit/auth*.test.mjs` |
| KDF 与 Node 参考实现一致（同一 `password/salt/iters` 得同一 verifier） | ✅ **已实施并全绿**：`npm run test:unit`（190 全过）+ `npx playwright test tests/ui/password-kdf.spec.js`（5 passed）。三方闭环 = 浏览器 WebCrypto === Node OpenSSL === 硬编码金标准向量 |
| ~~真机 KDF 耗时~~（已测） | ✅ **2026-10-05 实测完成**：Redmi 22041211AC（天玑 8100 / Android 14 / Chrome，`/proc/cpuinfo` 含 `sha2` 硬件加速）→ **中位数 404ms**（三次 404 / 382 / 412），且**结果与金标准向量一致**。对比：Node 桌面 ≈100ms、桌面 Chrome ≈114~154ms。🔴 **`PBKDF2_ITERS = 600000` 保持不变**，加载态文案按「通常小于 0.5 秒」写即可 |
| 端到端（注册 → 评论 → 退出 → 登录 → 改密码） | Playwright，`tests/ui/` |

### 关于"生产 PBKDF2 封顶要不要验"——**路线 A 下不需要**

这条曾记为待办，现在**可以划掉**，理由：

- 那道封顶（PBKDF2 ≤ 100,000 轮）是**服务端**的限制，
  只有让 **Worker 去算 PBKDF2** 才会碰到（Cloudflare 的 CPU 限流器无法中断 BoringSSL 的循环，
  所以只能在入口按轮数封顶）；
- **路线 A 里那 60 万轮跑在用户的浏览器 / 手机上**，那台机器**没有任何这种上限**，
  600,000 轮就是想用多少用多少；
- 服务端在路线 A 里只做一次 **HMAC-SHA256（≈0.02ms）**，**根本不调用 PBKDF2 / scrypt**。

所以"本地 workerd 已解除默认上限、因此测不出生产封顶"这件事，**对路线 A 没有任何影响**。
将来若把 KDF 挪回服务端（路线 B，或 §4.5 的加固），才需要临时部署一个探针 Worker
实测生产的真实封顶值（现有 Cloudflare 令牌可能没有 Workers Scripts 权限，届时要单独授权）。

---

## 十七、界面文案（全量，实现时照抄）

### 17.0 风格约定

沿用现有评论 / 账号文案的调子：

- **朴实、直白、不装、不甩锅。** 不用感叹号，不用营销词，不用"亲"。
- **技术原因如实说**（现有先例：「暂时取不到，可能是网络问题。」）。
- 引用界面元素名用「」。
- **主题色彩克制使用**：只用在**没有风险的时刻**（欢迎、编号的仪式感、空态）。
  **错误提示一律直白** —— 为了风格牺牲明确性是本末倒置。
- **不承诺做不到的事**：涉及安全的说明必须诚实（见 17.5 的注销警告）。

### 17.1 账号弹窗（未登录）

弹窗标题 `账号`，两个 tab：`登录` / `注册`。

**登录 tab**

| 位置 | 文案 |
| --- | --- |
| 邮箱 label / placeholder | `邮箱` / `你的邮箱` |
| 密码 label / placeholder | `密码` / `你的密码` |
| 密码框右侧 | `显示` / `隐藏`（切换明文） |
| 主按钮 | `登录` |
| 次要链接 | `忘记密码？` |
| 底部引导 | `还没有账号？点上面的「注册」` |

**注册 tab —— 字段顺序：昵称 → 头像 → 密码 → 确认密码 → 邮箱 → 验证码**

> 邮箱放在**最后**：这样"填邮箱 → 发码 → 填码"是连续的三步，中间不用插别的字段。
> 昵称放**最前**：它是唯一需要用户"想一下"的字段，先解决它，后面都是机械填写。

| 位置 | 文案 |
| --- | --- |
| 昵称 label / placeholder | `昵称` / `给自己起个名字，评论时会显示` |
| 昵称 hint | `2~12 个字符 · 全站唯一，先到先得` |
| 头像 label | `头像` |
| 头像摘要行（默认态） | 当前头像缩略图 + 名字（默认 `希尔`）+ `换一个` |
| 头像展开后 | 按分组手风琴；**复用现有** `UiAccordion` + `avatar-grid` |
| 头像 hint | `不选就默认用希尔` |
| 密码 label / placeholder | `密码` / `至少 8 位` |
| 确认密码 label / placeholder | `确认密码` / `再输一次` |
| 邮箱 label / placeholder | `邮箱` / `你的邮箱` |
| 发码按钮 | `发送验证码` → 冷却期变 `60 秒后可重发`（置灰倒计时） |
| 发码成功提示 | `验证码已发送。几分钟没收到的话，翻一下垃圾邮件。` |
| 验证码 label / placeholder | `邮箱验证码` / `6 位数字` |
| 协议勾选 | `我已阅读并同意《隐私政策》`（《隐私政策》是可点链接） |
| 协议未勾提示 | `请先阅读并同意《隐私政策》` |
| 主按钮 | `注册` |

> **头像控件为什么用"内联展开"而不是"再弹一个窗"**：移动端弹窗套弹窗体验很差
> ——两个遮罩层、返回键行为混乱、点外面关掉哪一个不明确。
> 而头像**已有默认值**（希尔），多数人不会动，所以默认只占一行，点「换一个」才展开。

### 17.2 人机验证（蛋点选）

| 位置 | 文案 |
| --- | --- |
| 区块标题 | `人机验证` |
| 提示区上方 | `请依次点击下面相同的 3 个蛋` |
| 换题按钮 | `换一批` |
| 出题中 | `正在出题...` |
| 出题失败 | `验证码暂时出不来，请稍后再试` |
| **点错（整题作废）** | `点错了，已经换了新题，请重新点击` |

> 提示区与画布**只放蛋图，不放名字**。去名字是刻意的：少一个"脚本读文字就知道答案"的泄露点。

**设计规格**：

| 项 | 值 |
| --- | --- |
| 题型 | 照着找 |
| 提示区 | **3 张蛋图**（不带名字），**顺序有意义**，**44px** |
| 画布 | **5 个蛋**，**自由散布**（拒绝采样 + 最小中心距约束，不再是网格） + 每蛋随机偏移 ±6px、旋转 ±12°、缩放 0.9~1.1，**34px** |
| 触摸热区 | **54px**（远大于 44px 最小可用值；**小图不等于难点**）。3000 题实测最小中心距 57.2px > 54px，**热区永不互盖** |
| 整体尺寸 | `viewBox 360×272`，真机渲染 **375×284 CSS px** |
| 背景 | **站点主背景图** `/ui/map_w1_bg.webp`（与 `theme.css` 的 `body` 背景同一张）+ 低透明度颗粒 + 墨点/划痕 + 轻晕影 |
| 交互 | **按提示顺序点 3 下** |
| 容错 | **错 1 次即整题作废**（换新题，不能在同题内重试） |
| 图形 | 只用蛋图；**不画星星** |
| 图片 | 蛋图内联 base64（**去掉文件名**，否则脚本读 `href` 即知身份）；**背景图按 URL 引用**（见下） |
| 兜底 | 「换一批」按钮 |
| 盲猜率 | 1/(5×4×3) = **1/60 ≈ 1.7%** |
| 有效期 | 3 分钟 |
| 存储 | D1 一行：`HMAC(AUTH_PEPPER, 答案)` + `expires_at`（一次性，用完即删，故**不需要** attempts 计数） |
| 体积 | 蛋图 8 张 × 7KB × 1.34 ≈ 75KB + 背景图 0KB（URL 引用，浏览器已缓存）→ 实测 **80~100 KB** |
| 蛋池 | 5 星 5 个 + 4 星 8 个 = **13 个**（不用 3 星蛋） |

> **为什么是 5 个画布**：4 个太少（要点对 3 个就变成"找出那一个不对的"，
> 用户会犹豫"剩下那个要不要点"，盲猜率也只有 1/24 = 4.2%）；6 个用户觉得多。
> **5 个候选 × 3 个目标**：语义清楚（"5 个里找出这 3 个"），盲猜率
> **1/(5×4×3) = 1/60 ≈ 1.7%**。

#### 2026-10-05 真机反馈后的三处调整

第一版在真机上给用户看过之后，改了三点（都是**真机截图才看得出来**的问题）：

| 反馈 | 原来 | 现在 | 为什么 |
| --- | --- | --- | --- |
| "上面和下面的都太大了，下面的得小很多" | 提示 62px / 画布 94px | 提示 **44px** / 画布 **34px** | 画布蛋比提示蛋小，才逼着人真的**去找**；整体也从 375×341 缩到 375×284 |
| "位置更随机一点" | 2×3 网格随机空一格 | **自由散布**（拒绝采样，最小中心距约束） | 网格会留下**可记忆的规律**（看几轮就能靠格子记形状），也给脚本一个强先验 |
| "背景也不能这么干净" | 纯色底 | **站点主背景图** + 颗粒/墨点/划痕/晕影 | 干净背景既不像"找东西"的题，也白送脚本一个无干扰的匹配底 |

> ⚠️ **背景图必须按 URL 引用，不能内联**：原图 251.7KB，base64 后约 340KB，
> 会让**每个**验证码请求凭空多出这么大一坨。而验证码 SVG 本来就必须
> **内联进 DOM**（`.hit` 热区要绑点击事件），内联时相对 URL 正常解析，
> 且站点别处早已加载过这张图 —— **浏览器缓存直接命中，零额外传输**。
> 实测：加背景前后 SVG 只从 79.5KB 变成 85.7KB（+6KB 是那点纹理与标记）。
>
> 代价是**不能把这个 SVG 塞进 `<img src="data:image/svg+xml,...">` 渲染** ——
> 那样外部引用会被拦掉，背景会退化成兜底底色（不报错，只是没图）。

> ⚠️ **背景图不许"虚化"**：中途为了保对比度，在背景图上压过一层
> `opacity=0.6` 的暖色薄纱，用户直接反馈"不要虚化"。现在**不加任何整幅半透明色块**，
> 只保留颗粒（0.1）、墨点、以及只压边缘的轻晕影（0.18）。
> 单测里有一条守着这一点（`🔴 背景图不许被整幅色块压住 / 不许模糊`）。

> **布局失败的兜底**：拒绝采样 400 次仍放不下时，退化为"抖动网格"。
> 验证码生成失败等于**注册停摆**，宁可位置丑一点也不能抛异常。

> ⚠️ **定位要说清**：这类"看图找同款"的验证码，**只要图片资源固定，脚本就能把 13 个蛋全下载建表**。
> 它的作用是**挡住没有图像处理能力的低成本脚本**，**主力防御仍是限流**
> （同邮箱冷却 + 同 IP 限流 + 一次性邮箱黑名单 + SES 日限额 500 的硬熔断）。
> 背景图换成站点地图**也没有**提高这层防护强度（背景每道题都一样，不携带答案信息），
> 它解决的是**观感**与"背景别太干净"，不是安全性。

### 17.3 忘记密码 / 修改密码

两者是**同一个流程**，只是入口不同。

| 位置 | 忘记密码（未登录） | 修改密码（已登录） |
| --- | --- | --- |
| 标题 | `设置新密码` | `修改密码` |
| 邮箱 | 要填（`你的邮箱`） | 不要（用当前账号的邮箱） |
| 验证码 | `邮箱验证码` / `6 位数字` | 同左 |
| 新密码 | `新密码` / `至少 8 位` | 同左 |
| 确认 | `确认新密码` / `再输一次` | 同左 |
| 安全提示 | — | `改完后，其他设备上的登录会失效，需要重新登录。` |
| 主按钮 | `设置新密码` | `保存新密码` |
| 成功 | `密码已改好，现在可以用新密码登录了。` | `密码已改好。其他设备上的登录已失效。` |

### 17.4 换邮箱（双验证）

| 位置 | 文案 |
| --- | --- |
| 说明 | `为了确认是你本人，需要先后验证当前邮箱和新邮箱。` |
| 第 1 步标题 | `第 1 步 · 验证当前邮箱` |
| 第 1 步显示 | 当前邮箱（明文即可，已登录用户自己知道） |
| 第 2 步标题 | `第 2 步 · 验证新邮箱` |
| 第 2 步输入 | `新邮箱` / `新的邮箱地址` |
| 主按钮 | `确认更换` |
| 成功 | `邮箱已改为 {新邮箱}。下次登录请用新邮箱。` |

### 17.5 个人中心（已登录，四个 tab）

tab：`资料` / `我的评论` / `回复我的` / `账号安全`

**资料**

| 位置 | 文案 |
| --- | --- |
| 编号（昵称**上方**一行） | `编号 {no}`（不特殊化、不加仪式感文案） |
| 昵称 | `昵称`（可改，hint 同注册） |
| 头像 | `头像` |
| 注册时间 | `注册于 {日期}` |
| 保存按钮 / 成功 | `保存` / `已保存` |

**我的评论**

| 位置 | 文案 |
| --- | --- |
| 空态 | `你还没有发过评论` |
| 加载中 / 失败 | `加载中...` / `暂时取不到，可能是网络问题。` |
| 删除确认 | `删了就找不回来了，确定吗？` |

**回复我的**

| 位置 | 文案 |
| --- | --- |
| 空态 | `还没有人回复你` |
| 未读提示 | `{n} 条新回复` |
| 点击行为 | 跳到那条评论所在的页面并高亮 |

**账号安全**

| 位置 | 文案 |
| --- | --- |
| 修改密码 / 更换邮箱 | `修改密码` / `更换邮箱` |
| 退出登录 | `退出登录`（只退当前设备） |
| 危险区标题 | `危险操作` |
| 注销说明 | `注销后账号无法恢复。你的评论会保留，但昵称会显示成「账号已注销」，这个邮箱也不能再用来注册。` |
| 注销确认输入 | `请输入你的昵称「{nick}」确认` |
| 注销按钮 | `注销账号` |

### 17.6 评论区（未登录）

| 位置 | 文案 |
| --- | --- |
| 发表区（未登录时替换为） | `登录后就能参与讨论` |
| 按钮 | `登录 / 注册` |
| 补充说明 | `登录后评论跟着账号走，换设备也能看到。` |
| 已注销账号的评论 | 昵称位显示 `账号已注销`，头像用默认占位 |
| 登录状态过期 | `登录状态已过期，请重新登录`（轻提示） |

> **读评论不需要登录**，只有"发"需要。

### 17.7 管理后台

| 位置 | 文案 |
| --- | --- |
| 顶栏 | `深渊大书院 · 管理后台` |
| 菜单 | `概览` / `评论管理` / `用户管理` |
| 概览指标 | `评论总数` / `待审` / `用户总数` / `今日新增` |
| 评论表头 | `评论内容` / `昵称` / `页面` / `时间` / `状态` / `操作` |
| 状态筛选 | `待审` / `已显示` / `已隐藏` / `全部`（沿用现有） |
| 评论操作 | `通过` / `隐藏` / `删除` |
| 用户表头 | `编号` / `昵称` / `邮箱` / `注册时间` / `最后登录` / `状态` / `操作` |
| 用户状态 | `正常` / `已封禁` / `已注销` |
| 用户操作 | `查看评论` / `封禁` / `解封` / `彻底删除` |
| 封禁确认 | `封禁后该用户无法登录和发表评论，并立即从所有设备下线。确定吗？` |
| 彻底删除确认 | `彻底删除会连同该用户的登录凭证一起清除，无法恢复。确定吗？` |
| 空态 | `暂无数据` |

### 17.8 错误文案总表（服务端契约 ↔ 前端展示）

**这张表就是接口契约**：服务端返回什么、前端显示什么，一一对应。

| 场景 | 文案 |
| --- | --- |
| 邮箱格式不对 | `邮箱格式看起来不对，检查一下` |
| 邮箱是一次性域名 | `请用常用邮箱，临时邮箱收不到验证码` |
| 发码冷却中 | `请 {n} 秒后再试` |
| 发码超频 | `发得太频繁了，请 {n} 分钟后再试` |
| 人机验证没过 | `人机验证没通过，请重新点击` |
| 验证码不对 / 过期 | `验证码不对，或者已经过期了` |
| 验证码尝试超限 | `验证码已作废，请重新获取` |
| 注册时邮箱已存在 | `这个邮箱已经注册过了，直接登录吧` |
| 密码太短 | `密码至少 8 位` |
| 两次密码不一致 | `两次输入的密码不一样` |
| 昵称太短 / 太长 | `昵称至少 2 个字符` / `昵称最多 12 个字符` |
| 昵称被占用 | `这个名字已经有人用了，换一个吧` |
| **登录失败**（邮箱不存在与密码错**同一句**） | `邮箱或密码不对` |
| 账号被封禁 | `该账号已被停用` |
| 换邮箱：新邮箱被占用 | `这个邮箱已经被其他账号使用了` |
| 换邮箱：新旧相同 | `新邮箱和当前邮箱一样，不用改` |
| 会话过期 | `登录状态已过期，请重新登录` |
| 邮件服务故障 | `邮件暂时发不出去，请稍后再试` |
| 服务端缺配置 | `功能暂时不可用，请稍后再试`（**不暴露具体缺什么**） |

> ⚠️ **两条硬约束**：
> 1. **登录失败永远只回「邮箱或密码不对」** —— 不区分"邮箱没注册"和"密码错"，
>    否则这个接口本身就是一个**账号枚举器**（见 §9 安全约定）。
> 2. **任何响应都不得出现** `verifier` / `code` / `email_hash` / `token_hash` / 内部错误栈；
>    "缺环境变量"这类内部原因**只记日志，不回前端**。

### 17.9 邮件文案

**验证码邮件**：见 [`scripts/dev/ses-templates/verify-code.html`](../../scripts/dev/ses-templates/verify-code.html)
（已过审，**`TemplateID = 62671`**）。

**邮箱变更通知**（可选，**建议保留** —— 换邮箱成功后再往**旧邮箱**发一封，留个书证）：

| 位置 | 文案 |
| --- | --- |
| 主题 | `【深渊大书院】邮箱已变更` |
| 正文 | `你的账号邮箱已从 {旧邮箱} 改为 {新邮箱}。如果不是你操作的，请立即用新邮箱找回密码，并检查账号安全。` |

---

## 十八、实现记录（与设计的偏差）

> 前面 §一~§十七 是**动手前的设计**，保持原样以便对照"当初怎么想的"。
> 这一节记录**实际做了什么、和设计哪里不一样、为什么** ——
> 这些偏差如果不写下来，过几个月就只剩代码，没人知道当时为什么那么改。
>
> 逐轮的详细过程（含踩坑与排查）在
> [`docs/dev-logs/2026-10/2026-10-05.md`](../dev-logs/2026-10/2026-10-05.md)。

### 18.1 里程碑实际进度

| 实际里程碑 | 内容 | 状态 |
| --- | --- | --- |
| **M1** | 后端全量：`/api/auth/*` 14 个 + 管理端 `stats`/`users` | ✅ 端到端 100 条 |
| **M3** | 前端：`AccountModal` 重写 + 头像/人机验证弹窗 + 评论区登录引导 | ✅ Playwright 16 条 |
| **M4** | 评论挂 `user_id` + 本机身份退役 | ✅ 端到端 +18，真机验过 |
| **M5** | 个人中心「我的评论」 | ✅ 端到端 +真机 |
| **M6** | 谁回复了我（未读红点 + 点击定位） | ✅ Playwright +3，真机验过 |
| **M7** | 后台改版（独立外壳 + 概览/评论/用户） | ✅ Playwright 7 条；真机**待补**（USB 断） |
| **M8** | 隐私说明页 + 路由兜底 + 文档同步 + 上线 | 🚧 进行中 |

设计与实际的编号对不上（设计里的 M5 是"真机验证 + 文档同步"，
实际拆成了 M5/M6 两个功能里程碑）—— 以**实际这一列**为准。

### 18.2 与设计不一致的地方

#### ① 验证码：不是 6 个，是 **5 个蛋 + 3 个提示**

设计时写的是"6 个"（见 §四）。按真机试用的反馈改成
**提示 3 个（44px，有序、不显示名字）→ 画布 5 个（34px，自由散布，最小中心距 58px）**。
用户原话是"画布不要改成 6 个，改成 5 个吧，6 个太多了"。

盲猜命中率 1/60。**点错一个整题作废**（服务端校验一次即删题），
所以"点错了会自动换新题"这句话背后是**服务端 403 驱动客户端 `reset()`**，
不是本地判对错 —— 客户端根本不知道答案。

#### ② 验证码背景：用站点主背景图，且**必须按 URL 引用**

真机反馈的第三轮才定下来（前两轮"太大 / 位置太规律 / 背景太干净"）。
现在用的是 `/ui/map_w1_bg.webp`（与 `theme.css` 里 `html, body` 同一张）。

**关键约束**：它**不能内联成 base64** —— 那会给每次出题凭空加约 340 KB。
代价是这个 SVG **不能**塞进 `<img src="data:image/svg+xml,...">` 渲染
（那里面加载不出外部 URL）。所以 `CaptchaEgg` 必须用 `v-html` 内联进 DOM，
`.hit` 热区才能收到点击。

#### ③ 域分隔（设计中**没有**，是我加的）

`/api/auth/salt` 是公开接口。如果 `email_hash` 与 `salt` 都用
`HMAC(SALT_SECRET, email)`，那么**任何人拿一个邮箱来问 salt，就顺手拿到了
这个邮箱的 `email_hash`** —— 可以拿去和泄露的库对撞。

所以做了**域分隔**：

```
email_hash = HMAC(SALT_SECRET, 'lookup:' + email)
salt       = HMAC(SALT_SECRET, 'salt:'   + email)
```

#### ④ `users.pw_salt` **必须存**（设计里漏了，是个会锁死用户的 bug）

盐是邮箱派生的。一旦换邮箱，盐就变了 → 旧 `verifier_hash` 永远对不上 →
**用户再也登不上**。所以注册时把当时的盐存进 `users.pw_salt`，
换邮箱后仍用它验密码。端到端里有一条专门盯这个的回归断言。

#### ⑤ 评论归属：从"浏览器自删令牌"换成 `comments.user_id`

设计里评论靠"发表时发一个令牌、浏览器存着、删的时候出示"。
**换台设备就删不掉自己的评论** —— 这是用户实际抱怨的点。

M4 把归属整个搬到服务端（`user_id`），令牌机制连同
`/api/my-comments`、`randomToken()`、`DELETE_TOKEN_RE` 一起删掉。

对外只暴露一个 `mine` 布尔，**不暴露 `user_id`** ——
否则等于公开了注册顺序与活跃度。

#### ⑥ 后台是**独立外壳**，不是主站里的一个页面

设计里只说"管理端要能按用户查"。实际做成 `position: fixed` 的全屏覆盖层，
理由是站点布局（网格 / 移动端安全区 / gacha 那套全屏规则）耦合太紧，
在它里面插"另一种布局"每加一条规则都可能碰到别的页面。

`z-index` 必须是 **11000**：站点 `.app-header` 是 10000，全局弹窗是 12000。

#### ⑦ 隐私说明页（设计里标为"位置定下来"，实际是**缺失的上线阻断项**）

注册表单里那个**必勾**的"我已阅读并同意隐私说明"指向 `#/privacy`，
而这条路由**不存在**，且没有 catch-all（未匹配的 hash 渲染成空白）。
已补 `PrivacyView.vue` + `/privacy` + 兜底重定向。

### 18.3 实现期新增的约束（设计里没写，但踩过才知道）

| 约束 | 起因 |
| --- | --- |
| **会话恢复要先 `await whenSessionReady()` 再取令牌** | `restoreSession()` 不 await（不阻塞首屏），而评论列表加载更快，那一刻 `getToken()` 还是空串 → 服务端算出的 `mine` 全 false → 登录用户永远看不到删除按钮 |
| **读评论也要带令牌** | 读不要求登录，但登录了必须带上，否则服务端不知道"哪条是你的" |
| **函数式 `:ref` 里不能解引用可能为 null 的状态** | `:ref` 在**卸载时也会被调用**（传 null），那时 computed 已变 null → 抛异常 → **中断整轮响应式刷新**，把"登录成功→切个人中心"的 watch 一起带崩（表现为注册成功后弹窗空白） |
| **登录失败限流要能覆盖阈值**（`AUTH_LOGIN_MAX_FAILS`） | 端到端要反复跑负向用例，同 IP 每小时 20 次失败一会儿就打满，之后所有登录都变 429 假失败 |
| **`AUTH_*` 环境变量改了要重启 wrangler** | `.dev.vars` 是启动时读的 |
| **真机调试：手机息屏会冻结页面主线程** | 表现为 CDP 连接正常但 `Runtime.evaluate` 永远超时；`svc power stayon true` 在 MIUI 上不生效，得先 `KEYCODE_WAKEUP` |
| **真机点击要先 `scrollIntoView`** | `getBoundingClientRect()` 是视口坐标；弹窗表单很长时目标在折叠线以下，触摸落在空处且**不报任何错** |
| **Playwright 的 Vite 端口要跨进程共享** | 配置会在**每个 worker 进程**里重新求值；每次现探测会让同一次运行一半用例连 4174、一半连 4175 |

### 18.4 验收现状

> 2026-10-06 复核更新：原先记的"单测 252 / 真机 31（M7 与 M8 待补）"已过时。
> M7 后台已进真机套件；下表为当前实际数字。

```
单测        264 / 0        （2026-10-06，含新增的设施死链回归 4 条）
端到端      100 + 42 / 0
Playwright  272 passed / 0 failed / 4 skipped（2026-10-06 全量，含账号 19 + 后台 7）
真机        38 / 0        （tests/phone/flow.mjs，39 条断言，含 M7 后台独立外壳）
生产验证    18 / 0
```

**仍未覆盖**：`/#/privacy` 与兜底路由只有桌面 Playwright 用例，**没有真机用例**。
其余 M3~M8 均已跑通真机。

**红线遵守情况**：

- 未对生产库执行任何破坏性 SQL —— `DELETE FROM comments` 只在
  [`scripts/sql/reset-test-comments.sql`](../../scripts/sql/reset-test-comments.sql)
  里，且**需要用户确认**才跑；
- 未触碰另一条线（任务/剧情）的改动。
