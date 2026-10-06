# KDF 平台上限探针（诊断用，不参与构建）

> 这不是项目产物，也不进 `npm run verify`。它的唯一用途是**在真实 `workerd` 运行时里
> 复现 `docs/technical/ACCOUNT_SYSTEM.md` 第二节那张表的数字**——
> 那些数字决定了「账号 + 密码」能不能落到 Cloudflare Workers 上，不能靠猜。

## 为什么需要它

Cloudflare 对密码哈希做了**输入侧的硬性封顶**（不是 CPU 超了才报错，而是根本不让传）：

| 限制 | 值 | 出处 |
| --- | --- | --- |
| PBKDF2 迭代上限 | `100'000` | `workerd/src/workerd/io/limit-enforcer.h` 的 `DEFAULT_MAX_PBKDF2_ITERATIONS` |
| scrypt 成本上限 | `N × r × p ≤ 1'048'576` | 同文件的 `DEFAULT_MAX_SCRYPT_COST = 1u << 20` 与 `checkScryptCost()` |

而 `checkPbkdfLimits()` / `checkScryptLimits()` 的注释自己写着：
*"this current default limit is **WAY** below the recommended minimum iterations for pbkdf2"*。

**本地 `workerd` 已解除 PBKDF2 默认上限**（`jasnell` 在 cloudflare/workerd#1346 里说明：
"the default max iteration count *removed* in workerd. However, **in the production environment
the current limit will remain**"）。所以：

- 本地能量出**真实毫秒成本**（本探针的用途）；
- 但本地**量不出生产会不会拒绝**——那个要单独在生产账号上验（见方案第十二节的待办）。

## 怎么跑

```powershell
cd E:\Desktop\html\myrzg\vue-myrzg\scripts\dev\kdf-probe
cmd.exe /c "npx wrangler dev --port 8799 --ip 127.0.0.1"
# 另开一个终端：
#   全部档位
curl.exe "http://127.0.0.1:8799/?runs=5"
#   只看某几档
curl.exe "http://127.0.0.1:8799/?runs=5&scrypt=16384,32768"
```

`runs` 是每档重复次数（取平均前会先预热一次，避免把 JIT 首次成本算进去）。
纯计算没有等待 I/O，所以**墙钟 ≈ CPU 时间**，可作为 CPU 预算的下界依据。

> ⚠️ Windows 下 `npm`/`npx` 必须走 `cmd.exe /c`（PowerShell 的执行策略会拦 `.ps1`）。
