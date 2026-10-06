/**
 * 一次性邮箱（临时邮箱）域名黑名单。
 *
 * ## 为什么需要它
 *
 * 批量注册最省事的办法就是用临时邮箱 —— 这类服务免费、能收信、用完即弃。
 * 而它们的域名**公开且稳定**，所以维护一份黑名单的**成本几乎为零**，
 * 却能精准掐住"批量刷账号"最主要的途径。
 *
 * 它其实比图形验证码更有效：**验证码防的是"机器人点按钮"，
 * 这里防的是"根本没有真邮箱"** —— 后者才是批量注册的硬门槛。
 *
 * ## 与其它防线怎么分工
 *
 * | 手段 | 挡住什么 |
 * | --- | --- |
 * | **本黑名单** | 用临时邮箱批量注册 |
 * | 同邮箱冷却（60 秒 / 每天 10 次） | 同一个邮箱被反复轰炸 |
 * | 同 IP 限流（20/小时、100/天） | 同一台机器批量换邮箱 |
 * | SES 日限额 500 封 | **硬熔断**：最坏也只是当天额度用尽 |
 *
 * ## 刻意**不**封的东西（改这份清单前先读这段）
 *
 * | 不封 | 为什么 |
 * | --- | --- |
 * | 隐私别名服务：`simplelogin.com`、`addy.io`、`duck.com`、`anonaddy.com`、`33mail.com`、`relay.firefox.com` | 它们**转发到用户的真实收件箱**。用户用它恰恰说明他在意隐私，封掉是自伤；而批量注册者不会用它们（要配置转发、有额度，比临时邮箱麻烦） |
 * | `privaterelay.appleid.com`、`icloud.com`、各大邮箱商 | **真实邮箱**。封掉会误伤大量正常用户 |
 *
 * 一句话：**"一次性"和"我不喜欢"是两回事。只封前者。**
 *
 * ## 匹配规则
 *
 * 见 `src/utils/authCrypto.js` 的 `isDisposableEmail()`：
 * **精确匹配 + 子域匹配**（`mail.mailinator.com` 也命中），
 * 但**不做后缀模糊匹配** —— 否则 `notmailinator.com` 会被误伤。
 *
 * ⚠️ 本文件只放域名：**不写 `@`、全小写、不要放行清单里的域名。**
 */
export const BLOCKED_EMAIL_DOMAINS = Object.freeze([
  // ---- 国际主流临时邮箱 ----
  'mailinator.com', 'mailinator.net', 'mailinator2.com',
  '10minutemail.com', '10minutemail.net', '10minutemail.org', '10minemail.com',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz',
  'guerrillamail.de', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la',
  'spam4.me', 'tempmail.com', 'tempmail.net', 'tempmail.org', 'temp-mail.org',
  'temp-mail.io', 'tempmailo.com', 'tempinbox.com', 'tempinbox.co.uk',
  'throwawaymail.com', 'throwaway.email', 'throwawayemail.com', 'throwam.com',
  'trashmail.com', 'trashmail.net', 'trashmail.org', 'trash-mail.com',
  'trash-mail.at', 'trash-mail.de', 'trashemail.de', 'trashymail.com', 'trashymail.net',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'yopmail.gq',
  'jetable.fr.nf', 'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'getnada.com', 'getairmail.com', 'maildrop.cc', 'mailnesia.com', 'mailcatch.com',
  'mailmetrash.com', 'mailexpire.com', 'mailforspam.com',
  'dispostable.com', 'fakeinbox.com', 'fakemail.net', 'fakemailgenerator.com',
  'mailnull.com', 'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'mytrashmail.com', 'thankyou2010.com', 'trash2009.com', 'mt2009.com',
  'tmail.ws', 'tmailinator.com',
  'discard.email', 'discardmail.com', 'discardmail.de',
  'binkmail.com', 'bobmail.info', 'chammy.info', 'devnullmail.com',
  'dingbone.com', 'fudgerub.com', 'lookugly.com', 'safetymail.info',
  'sogetthis.com', 'spamavert.com', 'spambob.com', 'spambob.net', 'spambob.org',
  'spambog.com', 'spambog.de', 'spambog.ru', 'spamcannon.com', 'spamcannon.net',
  'spamcon.org', 'spamcorptastic.com', 'spamcowboy.com', 'spamcowboy.net',
  'spamcowboy.org', 'spamday.com', 'spamex.com', 'spamfree24.com', 'spamfree24.de',
  'spamfree24.eu', 'spamfree24.info', 'spamfree24.net', 'spamfree24.org',
  'spamherelots.com', 'spamhereplease.com', 'spamify.com', 'spaminator.de',
  'spamkill.info', 'spaml.com', 'spaml.de', 'spammotel.com', 'spamobox.com',
  'spamoff.de', 'spamslicer.com', 'spamspot.com', 'spamthis.co.uk',
  'spamtrail.com', 'spamtroll.net', 'supergreatmail.com', 'supermailer.jp',
  'suremail.info', 'teewars.org', 'teleworm.com', 'teleworm.us', 'tempalias.com',
  'tempemail.biz', 'tempemail.com', 'tempemail.net', 'tempthe.net',
  'thisisnotmyrealemail.com', 'tradermail.info', 'tyldd.com',
  'uggsrock.com', 'venompen.com', 'veryrealemail.com', 'viditag.com',
  'viewcastmedia.com', 'viewcastmedia.net', 'viewcastmedia.org', 'webemail.me',
  'whyspam.me', 'willhackforfood.biz', 'willselfdestruct.com', 'winemaven.info',
  'wronghead.com', 'wuzup.net', 'xagloo.com', 'xemaps.com', 'xents.com',
  'xmaily.com', 'xoxy.net', 'yep.it', 'yogamaven.com', 'yuurok.com',
  'zehnminuten.de', 'zehnminutenmail.de', 'zippymail.info',
  'zoemail.com', 'zoemail.net', 'zoemail.org',
  'cool.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr',
  'ypmail.webarnak.fr.eu.org',

  // ---- 国内常见临时邮箱 / 接码站 ----
  'linshiyouxiang.net', 'linshiyouxiang.com', 'linshiyou.com', 'linshi-email.com',
  '24mail.chacuo.net', 'chacuo.net', 'bccto.me', 'mail.bccto.me',
  'temp-mail.cn', 'eyunmail.com', 'zhuangting.com', 'youdaoyun.com',
  'zhuangbei.site', 'snapmail.cc', 'mails.li',
  'emailfake.com', 'email-fake.com', 'generator.email', 'mail-temp.com',
  'mail-temp.org', 'tmail.cn', 'mailto.plus'
])
