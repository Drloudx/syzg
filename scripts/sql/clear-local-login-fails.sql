-- 清掉本地开发库里积累的"登录失败"计数。
--
-- 为什么需要：`POST /api/auth/login` 按 `loginfail:<邮箱哈希>:<小时>` 与
-- `loginfail:ip:<ip哈希>:<小时>` 两个桶计数，阈值是每个邮箱 5 次、每个 IP 20 次。
-- 端到端测试要反复跑负向用例（错密码 / 未注册邮箱 / 已封禁），一会儿就打满，
-- 之后**所有**登录都变成 429 假失败。
--
-- 现在阈值可以用 `AUTH_LOGIN_MAX_FAILS` 覆盖（见 .dev.vars），
-- 这个脚本只用来清理历史上已经攒下的计数。
--
-- ⚠️ 只删 `loginfail:` 前缀的桶，不碰其它限流计数，更不碰业务表。
-- ⚠️ `--local`：只作用于本地开发库。

DELETE FROM rate_limits WHERE bucket LIKE 'loginfail:%';
