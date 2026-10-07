# 账号体系上线运维手册

> **状态**：**已执行过**（2026-10-05 完成生产验证，账号体系已上线）。
> 本文保留为**运维与故障排查手册**；下文「先读这一段」与「上线前」各节是**当时的操作顺序**，
> 不代表尚未执行。当前状态与待办见 [NOW.md](../NOW.md)。
>
> 面向"要在生产环境把账号体系打开"的人。
> 设计依据见 [`ACCOUNT_SYSTEM.md`](./ACCOUNT_SYSTEM.md)，实现偏差见它的 §十八。
>
> 🔴 **本文件里的 SQL 全部是可重复执行或失败模式单一的**。
> 唯一一条**破坏性**语句（清空评论）单独放在
> [`scripts/sql/reset-test-comments.sql`](../../../scripts/sql/reset-test-comments.sql)，
> **默认注释、必须由人确认后才跑**。
>
> **何时读**：账号体系上线、迁移 D1 或排查线上账号故障时。
> **何时更新**：环境变量、迁移步骤或排查表变化时。

**核对时间**：2026-10-08

---

# 🔴 先读这一段：`git push` 就是上线

这个仓库用 **Cloudflare Pages 的 GitHub 集成**部署
（`wrangler.toml` 里写着"站点用 GitHub 自动部署"）。也就是说：

```
git push  ──────►  Cloudflare 自动构建部署  ──────►  线上生效
```

**没有任何"再点一下发布"的中间步骤。**

## 所以顺序绝对不能反：先迁移 D1，再推送代码

新的**读评论 SQL 里就带着 `comments.user_id`**
（`functions/api/[[path]].js` 里四处 `SELECT c.id, c.user_id, ...`），
写评论也 `INSERT` 它。

> 迁移没跑就部署 → **整个讨论区对所有人挂掉**（不只是登录用户，
> 未登录的访客读评论同样走这条 SQL）。

## 反过来是安全的 —— 所以**可以提前跑迁移**

迁移只做"**新增**"：加四张新表、加一个**可空**列、加几个索引。
对**正在跑的旧代码**完全没有影响：

- 旧代码的查询都**显式列出列名**（不是 `SELECT *`），多一列无所谓；
- `comments.user_id` 可空，旧代码不写它也能 `INSERT`；
- 多出来的 `users` / `auth_codes` / `captchas` / `sessions` 四张表，
  旧代码根本不查。

**结论：先跑第 2 步迁移（无副作用），再推送。** 顺序反了才是事故。

> 这句"无副作用"不是推断，是**实测**的：
> [`tests/migration/rehearse.mjs`](../../../tests/migration/rehearse.mjs) 会拿
> **旧库（加账号体系之前那一版）的真实 SQL 形状**在迁移后的库上跑一遍 ——
> 读评论、写评论、改状态、删评论四条都验，并确认旧代码写入的行
> `user_id` 为 `NULL`（新代码读它不会炸）。
>
> ```bash
> npm run test:migration   # 29 条断言
> ```

---


## 〇、先看清风险等级

| 步骤 | 风险 | 可回滚 |
| --- | --- | --- |
| 0. 处理密钥（换腾讯云 / 新配两个） | 低（改配置） | ✅ |
| 1. 配置环境变量 | 低（改错可改回） | ✅ |
| 2. 跑三步迁移 | **中**（改表结构） | ⚠️ 只能靠备份 |
| 3. 部署前端（`git push`） | 低（重新部署即可） | ✅ |
| 4. 清空测试评论（**可选**） | **高**（不可逆） | ❌ **必须先备份** |

**动手前先给生产 D1 做一次导出**：

```bash
npx wrangler d1 export myrzg-comments --remote --output backup-before-auth.sql
```

> 这一步不是走过场。下面第 2 步会改表结构，而 D1 的 `ALTER TABLE` **没有回退语句**。

---

## 〇之二、上线前的密钥：一项要换、一项要新配

先说清楚**哪些是真要动的、哪些不是** —— 免得去改本来就对的东西：

| | 事项 | 性质 |
| --- | --- | --- |
| ① | 腾讯云 SecretId / SecretKey | **要换**（开发期那对在明文渠道里出现过） |
| ② | `AUTH_PEPPER` / `SALT_SECRET` | **要新配**（账号体系才引入，控制台里还没有） |

> `ADMIN_TOKEN` **已不在清单内**：该通路 2026-10-07 删除，后台改看登录账号的 `users.role`。
> 下文 ② 保留作历史依据。

### ① 腾讯云的 SecretId / SecretKey —— 这一项确实要换

开发期调试发信时用过的那对密钥，如果在**明文渠道**（聊天、截图、文档）
里露过面，就应当视为**已泄漏**。

去腾讯云控制台**新建一对**、把旧的那对**禁用或删除**，然后用新的配到
Cloudflare Pages。

**改文件不足以补救** —— 被看到过的密钥只能作废，不能靠"从仓库里删掉"解决。
（这一条你自己最清楚：那对密钥有没有离开过你的机器。）

### 历史记录（已作废）：确认生产的 `ADMIN_TOKEN` 不是本地那个 `yxzm`

> 🔴 **本节已作废（2026-10-07）**：`ADMIN_TOKEN` 通路**已删除**，后台改为看登录账号的
> `users.role`。所以下面这条检查**不再适用** —— 现在带任何 `x-admin-token` 都不会被识别，
> 未登录一律 401。保留下文只为记录当时的判断依据与运维历史。
> 现在对应的动作见 [COMMENTS_BACKEND.md](./COMMENTS_BACKEND.md) 第十二节「上线清单」第 1 项
> （迁移后手工设超管）。

> ⚠️ **先说清楚：线上大概率已经是对的，这**不是**"发现的风险"。**
> （2026-10-07 前的）交接文档记着"本地令牌 `yxzm`，**线上换随机串**"，
> 并记着"Cloudflare Pages → Environment variables：`ADMIN_TOKEN` 已配"。
> 本地/线上的区分**早就做了**。
>
> 这里只是**花 10 秒确认一下没搞混**：`.dev.vars` 里能看到
> `yxzm` 且只有 4 个字符，万一哪次复制粘贴拿错了，就是用它在保护后台。

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "x-admin-token: yxzm" \
  https://syzg.yxzmy.top/api/admin/stats
# ✅ 期望 401 或 404 —— 线上不是本地那个值（正常情况）
# 🔴 返回 200 —— 线上真的用了本地值，那时才需要去控制台换掉
```

### ② `AUTH_PEPPER` / `SALT_SECRET` 是**新增**的生产变量

这两个是账号体系才引入的，所以**控制台里目前还没有**（旧的 `ADMIN_TOKEN` 通路已于 2026-10-07 删除，
`IP_HASH_SALT` 仍需要）—— 这一步要**新配**，用新生成的随机值：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

不要沿用 `.dev.vars` 里那两个。

**为什么现在用新值没有代价**：它们只影响**服务器端算出来的哈希**，而生产库现在
**还没有任何用户**（第 2 步迁移完就是干净的账号表）—— 不会有存量数据对不上。

**一旦上线就不要再换**：`AUTH_PEPPER` 变了 → 所有人的 `verifier_hash` 对不上 →
**全都登不上**；`SALT_SECRET` 变了 → 所有人的 `email_hash` 变了 →
**全都"不存在"了**，而且是静默的（登录只说"邮箱或密码不对"）。真要轮换得写数据迁移。

### 自动检查：密钥有没有被写进仓库

```bash
node --test tests/unit/secret-leak.test.mjs
```

它从 `.dev.vars` 取出真实密钥值，去所有**被跟踪的文件**里搜，
只报告"有没有"、不打印值本身。开发占位值（如 `local-dev-salt`）会被识别为正常。

> 这个检查本身也验证过"真的会红"：故意把 `AUTH_PEPPER` 写进一个被跟踪的文件，
> 它精确报出文件名。
>
> ⚠️ 顺带记一个**自己踩的坑**：这个检查的第一版把 41 字符的 `AUTH_PEPPER`
> 判成了"开发占位值"（正则用了 `/i` 又没锚定整串），于是**整个检查静默变成空操作**。
> 假阴性比假阳性危险得多 —— 报告一片绿，真泄漏照过。
> 现在只在"整个值就是一个已知占位词"或"长度 < 12"时才降级，**拿不准一律算真密钥**。

---

## 一、配置环境变量（Cloudflare Pages）

在 Pages 项目的 **Settings → Environment variables** 里加。**Production 与 Preview 都要加**
（只在 Preview 配会让预览站点的账号功能坏掉，而线上是好的 —— 很难查）。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `AUTH_PEPPER` | ✅ | 服务器端密钥。用于 `HMAC(pepper, verifier)` 与验证码哈希 |
| `SALT_SECRET` | ✅ | 邮箱→哈希/盐 的派生密钥。**与 `AUTH_PEPPER` 必须是两个不同的值** |
| `IP_HASH_SALT` | ✅ | IP 哈希用的盐（限流与追溯） |
| `TENCENT_SECRET_ID` | ✅ | 腾讯云 SES 发信 |
| `TENCENT_SECRET_KEY` | ✅ | 同上 |
| `MAIL_STUB` | ❌ **不要设** | 设了就**不发真邮件**、只打日志。仅本地开发用 |

> `ADMIN_TOKEN` **已于 2026-10-07 从清单移除**：后台改按登录账号的 `users.role` 鉴权，
> 不再有环境变量令牌通路。

### 🔴 三个不能弄错的点

**① `AUTH_PEPPER` / `SALT_SECRET` 一旦上线就不要再改。**

改了会怎样：`AUTH_PEPPER` 变了 → 所有 `verifier_hash` 与验证码哈希对不上 →
**所有人都登不上**；`SALT_SECRET` 变了 → 所有 `email_hash` 变了 →
**所有人都"不存在"了**，而且是静默的（登录只会说"邮箱或密码不对"）。

真要轮换，得写数据迁移，不是改个变量。

**② 这两个值必须是高熵随机串**，不是"记得住的口令"：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**③ 生产不要设 `RATE_LIMIT_*` / `AUTH_*_MAX` 这些覆盖变量。**

它们是给本地测试放宽阈值用的（见 §四）。生产用代码里的默认值 ——
那些默认值就是给真实流量设计的。

---

## 二、跑三步迁移

### 先确认当前状态

```bash
npx wrangler d1 execute myrzg-comments --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

- 只看到 `comments` / `rate_limits`（可能还有 `sqlite_sequence`）
  → **这是账号体系之前的库**，三步都要跑。
- 已经能看到 `users` 等 → 之前迁过了，跑第 1、3 步（幂等）确认即可。

### 三步（**顺序不能换**）

```bash
# 第 1 步：建表 + 建不依赖新列的索引（幂等，可重跑）
npx wrangler d1 execute myrzg-comments --remote \
  --file=./scripts/sql/2026-10-05-auth-schema.sql

# 第 2 步：给已存在的 comments 表加 user_id（一次性）
npx wrangler d1 execute myrzg-comments --remote \
  --file=./scripts/sql/2026-10-05-auth-columns.sql

# 第 3 步：建依赖 user_id 的两个索引（幂等，可重跑）
npx wrangler d1 execute myrzg-comments --remote \
  --file=./scripts/sql/2026-10-05-auth-indexes.sql
```

### 预期的输出

**三步都应该干净成功，不该出现任何报错。**

| 看到什么 | 意思 | 怎么办 |
| --- | --- | --- |
| 每步末尾打印了自检行（表名/列名/索引名） | 正常 | 继续 |
| `duplicate column name: user_id` | 这一列已经在了（重复跑过） | **正常**，直接进第 3 步 |
| `no such table: users` | **第 1 步没跑或没跑完** | 回去跑第 1 步 |
| `no such column: user_id` | 第 2 步没跑 | 跑第 2 步，再跑第 3 步 |
| 其它任何报错 | 别往下走 | 停下来查；必要时用备份恢复 |

> 🔴 **为什么卡死在这里也不能"硬闯"**：D1 执行文件时**一条失败就中止后续**。
> 半迁移状态（建了表没加列 / 加了列没建索引）不会让站点崩，
> 但会让"我的评论""谁回复了我"在两个方向上各自慢成全表扫描，
> 而且报错时机很晚 —— 那时你已经忘了做过什么。

### 为什么是三个文件而不是一个

因为它们的**依赖链是单向的**，而每一环的失败模式不同：

```
建表  ──→  加列  ──→  建（引用新列的）索引
 │           │              │
幂等      非幂等         幂等
```

混在一起会互相掩盖。这不是理论 —— **这三步的顺序原来写错过两次**：

1. `ALTER TABLE users` 排在 `CREATE TABLE users` **之前** →
   生产库上没有 `users` → `no such table` → 整个文件从这里断掉 →
   **四张表一张都没建、账号功能整体不可用**。
2. `idx_comments_user ON comments(user_id)` 排在加列**之前** →
   `no such column: user_id` → 又带走后面三个索引。

两个都**只在生产会炸**：本地库早就迁完了，开发环境里永远测不到。
它们是 [`tests/migration/rehearse.mjs`](../../../tests/migration/rehearse.mjs)
抓出来的 —— 那个测试从 git 取**迁移前那一版 `schema.sql`**，
造一个临时库、灌几条真实形状的数据，然后把三步真跑一遍。

```bash
npm run test:migration
```

**改动任何迁移脚本后都要跑它。**

---

## 三、上线前端

按项目既有的发布流程部署即可（Pages + Git 集成）。部署完确认：

- `https://syzg.yxzmy.top/#/privacy` 能打开（注册页那个必勾项的链接）；
- 首页能正常加载，评论列表能读出内容（**读评论不需要登录**）；
- 未登录时评论区显示「登录后才能发表评论」。

---

## 四、（可选，且**不可逆**）清空开发期留下的测试评论

> ⚠️ **这一步默认不要做。** 只有当线上评论表里确实全是开发期自测数据
> （`dawdawd` 之类）时才考虑。
>
> **做之前必须先 `wrangler d1 export` 备份。**
>
> 这个文件**默认整段注释掉**，跑之前要手动取消注释。

```bash
npx wrangler d1 export myrzg-comments --remote --output backup-before-clean.sql
# 手动编辑 scripts/sql/reset-test-comments.sql，取消注释
npx wrangler d1 execute myrzg-comments --remote \
  --file=./scripts/sql/reset-test-comments.sql
```

它做两件事：`DELETE FROM comments;` 与 `DELETE FROM rate_limits;`。

---

## 五、上线后的自检

```bash
# 1) 未登录访问管理接口应当被拒
curl -s -o /dev/null -w "%{http_code}\n" https://syzg.yxzmy.top/api/admin/comments
# 期望 401（未登录；2026-10-07 起后台改看登录账号的 users.role，不再有令牌通路）

# 2) 公开接口不该泄漏任何敏感字段
curl -s "https://syzg.yxzmy.top/api/comments?page=site:general&limit=2" | \
  grep -E "verifier|email_hash|token_hash|ip_hash|code_hash" && echo "❌ 泄漏了" || echo "✅ 干净"
```

然后**在真机上走一遍**（这是唯一能证明"能用"的方式）：

1. 注册一个账号（含人机验证）→ 自动登录 → 个人中心显示编号；
2. 发一条评论 → 出现在列表；
3. 退出 → 用同一账号登录；
4. 「我的评论」能看到刚发的那条，能删掉；
5. 换绑邮箱（旧+新两个码）→ 用**新邮箱 + 原密码**登录（这一条专门验 `pw_salt` 那个坑）；
6. 后台 `/admin` 能进，概览/评论/用户三块都有数据。

---

## 六、出问题时

| 现象 | 最可能的原因 |
| --- | --- |
| 所有人都登不上，且"邮箱或密码不对" | `AUTH_PEPPER` 被改过 |
| 所有人都"邮箱不存在"，注册时说邮箱已占用但查不到 | `SALT_SECRET` 被改过 |
| 验证码邮件收不到 | ① `TENCENT_SECRET_*` 没配 / ② `MAIL_STUB` 被设成了 1 / ③ 模板未过审 / ④ **SES 参数类型不对（见下）** |
| 后台整个 404 | 路由未部署或 Functions 未生效（`ADMIN_TOKEN` 缺失已**不再是**原因，该通路 2026-10-07 删除） |
| 「我的评论」「谁回复了我」很慢 | 第 3 步的索引没建 |
| 换绑邮箱后登不上 | `users.pw_salt` 缺失（第 2 步没跑完） |
| 发码按钮点了没反应 | 看服务端日志；本地可能是验证码冷却与限流（见 `.dev.vars`） |

### 🔴 「收不到验证码」但**接口与数据库看起来都正常**

2026-10-06 实际发生过：接口返回「验证码已发送」、`auth_codes` 表里**也有那条记录**，
但邮件一封都到不了。根因是 `src/utils/authMail.js` 的 **`Unsubscribe` 传了数字 `0`**，
而腾讯云 SES 要求**字符串 `'0'`**（严格类型校验，传数字整封拒收）：

```
Code=InvalidParameter
Message=The value type of parameter `Unsubscribe` is not valid, input type should be `string`
```

**为什么查库查不出来**：发信在 `context.waitUntil` 里**异步**执行，
失败只写 Worker 日志 —— 所以「有记录」**不能证明「信发出去了」**。
本地测试也全绿，因为 `MAIL_STUB=1` 时根本不发信。

**最快的定位方式**：直接调 `sendVerifyCode`，收件人用 `@example.invalid`
（RFC 2606 保留 TLD，不会真发信），错误码会直接区分凭据 / 模板 / 参数问题：

```js
// 临时脚本；凭据取自 _ai-credentials/TENCENT_SES.md
const r = await sendVerifyCode({ TENCENT_SECRET_ID, TENCENT_SECRET_KEY },
  { to: 'nobody@example.invalid', code: '000000', minutes: 10 })
console.log(r)   // {ok:false, error:'InvalidParameter'} 等
```

> ⚠️ `TriggerType: 1` **接受数字**（实测正常），**只有 `Unsubscribe` 要求字符串** ——
> 不要"统一成一种类型"。回归见 `tests/unit/mail-payload.test.mjs`。

**排查顺序**：先看 HTTP 状态码（401/403/404/429 各指向完全不同的原因），
再看服务端日志，最后才读代码。反过来的话，很容易在无关的地方耗掉一小时。
