<template>
  <div class="page-view-container">
    <UiSection title="隐私说明">
      <div class="privacy">
        <p class="privacy-lead">
          这份说明写的是<strong>这个站点实际做了什么</strong>，不是模板套话。
          注册时你勾选了"我已阅读并同意"，所以下面每一条都对应代码里的真实行为。
        </p>
        <p class="privacy-meta">最后更新：2026-10-05</p>

        <h2>一、我们收集什么</h2>
        <table class="privacy-table">
          <thead>
            <tr><th>内容</th><th>为什么要</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>邮箱</td>
              <td>当登录账号用，也是收验证码的唯一渠道</td>
            </tr>
            <tr>
              <td>昵称、头像</td>
              <td>评论时显示。昵称全站唯一</td>
            </tr>
            <tr>
              <td>评论内容与发表时间</td>
              <td>就是评论本身。含你回复了谁</td>
            </tr>
            <tr>
              <td><strong>密码的校验值</strong>（不是密码）</td>
              <td>用来验证登录。见下一节</td>
            </tr>
            <tr>
              <td>IP 的<strong>哈希</strong>、浏览器标识的<strong>哈希</strong></td>
              <td>限流与防滥用。<strong>不是</strong> IP 本身，无法从哈希反推</td>
            </tr>
            <tr>
              <td>注册时间、最近登录时间、会话令牌的哈希</td>
              <td>让"30 天内免登录"生效，以及在你改密码/注销时让旧会话立刻失效</td>
            </tr>
          </tbody>
        </table>

        <h2>二、你的密码不会被上传</h2>
        <p>
          你输入的密码<strong>只停留在你的设备上</strong>：浏览器先用 PBKDF2-SHA256
          迭代 60 万次把它算成一串校验值，<strong>只有那串校验值</strong>会发到服务器。
          服务器再用它和服务器端的密钥算一遍存起来。
        </p>
        <p>
          这意味着：即使数据库被人拿走，也<strong>拿不回你的密码</strong>；
          反过来，我们也无法把"校验值"还原成密码发还给你 ——
          所以密码忘了只能走邮箱验证码重设。
        </p>

        <h2>三、我们不做的事</h2>
        <ul>
          <li>不卖、不交换、不出租你的任何数据；</li>
          <li>不投放广告，不使用第三方统计或行为追踪脚本；</li>
          <li>不发营销邮件 —— 只有你主动点"发送验证码"时才会收到一封，内容只有那 6 位数字；</li>
          <li>不读取你设备上的其它数据。</li>
        </ul>

        <h2>四、谁会碰到你的数据</h2>
        <ul>
          <li>
            <strong>腾讯云邮件推送（SES）</strong>：验证码邮件要经它发出，
            所以它会经手你的邮箱地址与那 6 位数字。
          </li>
          <li>
            <strong>Cloudflare</strong>：站点与数据库托管在它上面（Pages + D1），
            所有请求都会经过它的网络。
          </li>
        </ul>
        <p>除这两者之外，不向任何第三方提供。</p>

        <h2>五、存多久</h2>
        <ul>
          <li><strong>登录状态</strong>：30 天。你在这期间用过就会自动续期；改密码会立刻让所有旧登录失效。</li>
          <li><strong>验证码</strong>：10 分钟后失效，用过即作废。</li>
          <li><strong>评论</strong>：一直保留，直到你（或管理员）删掉它。你随时可以在个人中心「我的评论」里删。</li>
          <li><strong>注销账号后</strong>：见下一节。</li>
        </ul>

        <h2>六、注销账号到底删掉了什么</h2>
        <p>
          这一点很多人会误解，所以说清楚。注销后：
        </p>
        <ul>
          <li>你的邮箱、密码校验值、昵称、头像会从账号表里清空，<strong>无法再登录</strong>；</li>
          <li><strong>你发过的评论会保留</strong>，但作者名会显示为「账号已注销」——
              直接删掉它们会让你参与过的讨论出现断层；</li>
          <li><strong>那个邮箱不能再注册</strong>（保留这个限制是为了防止有人注销后立刻用同一邮箱冒充）；</li>
          <li>如果你要求把评论也一并删掉，或者要求彻底抹除账号记录（连邮箱占用也释放），
              请到站内讨论区说明，管理员可以从后台做<strong>彻底删除</strong>。</li>
        </ul>

        <h2>七、你可以做什么</h2>
        <ul>
          <li>在个人中心<strong>改昵称、换头像</strong>；</li>
          <li>凭邮箱验证码<strong>改密码</strong>，或<strong>换绑邮箱</strong>（旧、新邮箱各收一个码，两个都填对才生效）；</li>
          <li>在「我的评论」里<strong>删除</strong>自己发过的任意一条；</li>
          <li><strong>注销账号</strong>（退出登录下方）；</li>
          <li>随时<strong>退出登录</strong>，或清掉浏览器数据 —— 那会一并清掉本机保存的登录状态。</li>
        </ul>

        <h2>八、关于 Cookie 与本地存储</h2>
        <p>
          本站不使用 Cookie 做追踪。只在你的浏览器里存两样东西：
          登录令牌（键名 <code>myrzg:auth</code>）与主题偏好（<code>theme</code>）。
          前者用于免登录，后者用于记住你选的明暗主题。清掉浏览器数据即可全部移除。
        </p>

        <h2>九、未成年人</h2>
        <p>
          本站是游戏资料站，不面向儿童设计，也不会有意收集未成年人的个人信息。
          如果你未满 14 周岁，请在监护人陪同下使用，或不要注册。
        </p>

        <h2>十、变更与联系</h2>
        <p>
          这份说明如果有实质改动，会在站内公告里说明。任何疑问、数据相关的请求，
          都可以在本站「站内讨论区」提出。
        </p>

        <p class="privacy-foot">
          <RouterLink to="/" class="privacy-back">← 返回首页</RouterLink>
        </p>
      </div>
    </UiSection>
  </div>
</template>

<script setup>
/**
 * 隐私说明页。
 *
 * ## 为什么必须存在（不是"锦上添花"）
 *
 * 注册表单里有一个**必勾**的复选框："我已阅读并同意隐私说明"，
 * 而那个链接指向 `#/privacy` —— 在补上这个页面之前**这条路由根本不存在**，
 * 点进去是空白页（路由表里没有 catch-all，未匹配就什么都不渲染）。
 *
 * 也就是说，用户被要求同意一份**打不开的文档**。这既是体验问题，
 * 也说不通 —— 所以它属于"上线就绪"的必做项，而不是可选项。
 *
 * ## 内容原则
 *
 * 写**这个站点实际做了什么**，而不是抄一段通用模板：
 *   - 密码不上传（客户端 PBKDF2 后只传校验值）—— 这是本站的真实实现；
 *   - 注销后评论**会保留**、邮箱**不能再注册** —— 这两条最容易被误解，必须写明；
 *   - 只列真实会经手数据的两方（腾讯云 SES 发信、Cloudflare 托管）。
 * 含糊其辞的隐私说明比没有更糟：用户会以为自己读过了。
 */

import { RouterLink } from 'vue-router'

import { UiSection } from '../components/ui/index.js'
</script>

<style scoped>
.privacy {
  max-width: 820px;
  /*
   * ⚠️ **必须给不透明底**：站点的地图背景（`html, body` 上那张）会透上来，
   * 正文压在等高线和地名上几乎读不清。第一版没给，截图一看就是一片糊。
   * 用 `--paper-soft`（亮色 `#e9dcc3` / 暗色 `#362a1d`），两种主题都够对比。
   */
  padding: 16px 18px 20px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 10px;
  background: var(--paper-soft, #e9dcc3);
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-main);
}

.privacy-lead {
  margin: 0 0 4px;
  color: var(--text-main);
}

.privacy-meta {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--text-muted);
}

.privacy h2 {
  margin: 22px 0 8px;
  font-size: 15px;
  color: var(--accent-ink);
}

.privacy p {
  margin: 0 0 10px;
}

.privacy ul {
  margin: 0 0 10px;
  padding-left: 20px;
}

.privacy li {
  margin-bottom: 5px;
}

.privacy code {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.12);
  font-size: 12.5px;
}

.privacy-table {
  width: 100%;
  margin: 0 0 10px;
  border-collapse: collapse;
  font-size: 13px;
}

.privacy-table th,
.privacy-table td {
  padding: 7px 10px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--border-color, #8f7351);
}

.privacy-table th {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-muted);
  font-weight: 600;
  white-space: nowrap;
}

.privacy-foot {
  margin-top: 24px;
}

.privacy-back {
  color: var(--accent-ink);
  text-decoration: none;
}
</style>
