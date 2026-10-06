<template>
  <div class="page-view-container privacy privacy-page">
    <div class="privacy-card paper-panel">
      <header class="privacy-header">
        <h1 class="privacy-title">
          <span class="privacy-diamond" aria-hidden="true"></span>
          深渊大书院隐私政策
        </h1>
        <p class="privacy-meta">版本生效日期：2026-10-07</p>
      </header>

      <div class="privacy-body">
        <p class="privacy-lead">
          欢迎使用「深渊大书院」（以下简称“本站”或“我们”）。我们高度重视用户的个人信息安全与隐私保护。本《隐私政策》旨在向您规范、清晰地说明我们在您浏览、注册、登录及使用本站互动服务时，如何收集、使用、存储与保护您的个人信息，以及您所享有的相关权利。在注册或使用本站服务前，请您审慎阅读并充分理解本政策。
        </p>

        <h2>一、我们如何收集和使用您的个人信息</h2>
        <p>
          在您使用本站服务的过程中，我们仅基于合法、合理、必要的原则，收集为您提供服务所必需的信息：
        </p>
        <table class="privacy-table">
          <thead>
            <tr><th>信息类型</th><th>使用场景与目的</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>电子邮箱</td>
              <td>用作账号唯一登录凭证，以及接收身份验证码（注册、找回密码、换绑邮箱）</td>
            </tr>
            <tr>
              <td>用户昵称、个人头像</td>
              <td>用于社区交流及公开发表评论时的身份标识（昵称全站唯一）</td>
            </tr>
            <tr>
              <td>评论内容、互动回复及时间戳</td>
              <td>用于展示社区公开发表内容与维护交流互动链路</td>
            </tr>
          </tbody>
        </table>

        <h2>二、我们如何保护您的个人信息安全</h2>
        <p>我们严格遵循合法、正当、必要的原则保护您的个人信息，并采取多重安全防护措施：</p>
        <ul>
          <li><strong>传输与存储加密</strong>：本站全站强制采用网络传输加密协议（HTTPS）。服务端仅保存不可逆加盐慢哈希凭据，明文密码不会被上传或持久化到数据库中，即使数据库泄露也无法还原原始密码；</li>
          <li><strong>防暴力破解与内容安全</strong>：系统部署有接口访问频率限制策略，防止自动化脚本恶意暴力破解密码；同时采用严格的内容过滤机制，防范恶意脚本注入，维护交流讨论环境的安全；</li>
          <li><strong>无商业共享与追踪</strong>：我们绝不会向任何第三方商业机构出售、出租或共享您的个人信息，本站未接入任何商业广告画像或用户追踪脚本；</li>
          <li><strong>无营销垃圾邮件</strong>：我们仅在您主动发起身份验证请求时发送包含验证码的系统邮件，绝不发送任何营销推广信息。</li>
        </ul>

        <h2>三、第三方技术基础设施服务商</h2>
        <p>为保障本站的高可用性与核心功能正常运作，部分业务环节依赖于合规第三方云服务提供商，其仅在必要限度内处理相关数据：</p>
        <ul>
          <li>
            <strong>腾讯云邮件推送</strong>：负责邮件发送底层通道。在您请求验证码时，系统会将目标接收邮箱及一次性动态验证码交由该服务完成投递；
          </li>
          <li>
            <strong>Cloudflare</strong>：负责全球内容分发网络（CDN）分发、网络安全防护及计算托管服务，所有网络请求均通过其合规安全网络节点传输。
          </li>
        </ul>
        <p>除上述保障服务基础运行的基础设施服务商外，我们不会将您的个人信息委托给任何第三方处理。</p>

        <h2>四、个人信息存储期限</h2>
        <ul>
          <li><strong>登录状态凭证</strong>：默认有效期为 30 天，采用滑动过期策略（活跃期间自动续期）；一旦发生修改密码等敏感安全操作，旧凭据将被即刻强制失效；</li>
          <li><strong>动态验证码</strong>：生成后有效期为 10 分钟，核验成功或超时后即刻作废；</li>
          <li><strong>社区公开发表内容</strong>：在您主动删除或依社区公约被处理前持续保留。您随时可在个人中心「我的评论」界面中自主删除由您发表的任何内容；</li>
          <li><strong>账号注销后的数据</strong>：依下文第五节规则执行。</li>
        </ul>

        <h2>五、账号注销与数据处理规则</h2>
        <p>
          您有权随时注销您的本站账号。为兼顾用户个人隐私权与公共讨论上下文的完整性，当您在个人中心确认注销账号后，系统将依以下规则执行数据处理：
        </p>
        <ul>
          <li><strong>个人身份信息清除</strong>：您的邮箱、密码验证凭据、用户昵称及自定义头像数据将从用户主表中彻底移除，注销完成后该账号将无法再登录或恢复；</li>
          <li><strong>公开互动内容匿名化</strong>：为保障公共话题讨论的连贯性，您此前发表的评论及回复内容不会被系统级物理删除，评论会保留在相关条目下，但发布者标识将永久统一脱敏变更为「账号已注销」；</li>
          <li><strong>防冒用安全限制</strong>：为防止他人恶意利用已注销的原邮箱抢注冒充历史发言者，原注册邮箱在系统中将保持锁定状态，不支持再次注册；</li>
          <li><strong>彻底物理删除的行权途径</strong>：如您因特殊要求需要彻底抹除所有历史评论内容或完全释放原邮箱占用，可在本站「站内讨论区」向管理员提出申请，管理员核验后可通过后台操作执行不可逆的物理级彻底删除。</li>
        </ul>

        <h2>六、用户权利与行权方式</h2>
        <p>按照适用的法律法规与社区规范，您对自己的个人信息享有充分的控制权：</p>
        <ul>
          <li><strong>查询与更正</strong>：您可在个人中心随时修改您的昵称、更换头像；</li>
          <li><strong>凭据变更与绑定管理</strong>：您可凭邮箱验证码重置登录密码，或在通过原邮箱与新邮箱双向验证后更换绑定的电子邮箱；</li>
          <li><strong>内容管理与删除</strong>：您可在个人中心「我的评论」界面中，随时自主删除您发表的任意一条评论或互动内容；</li>
          <li><strong>注销账号</strong>：您可在个人中心操作注销账号，随时终止本站服务；</li>
          <li><strong>退出与缓存清除</strong>：您可随时点击「退出登录」，或通过清除浏览器本地缓存彻底移除设备上保存的登录状态。</li>
        </ul>

        <h2>七、关于本地缓存技术的使用</h2>
        <p>
          本站不使用任何追踪类 Cookie。为保障核心服务运行与记住您的使用偏好，我们仅在您的浏览器本地缓存中保存以下必要配置：
        </p>
        <ul>
          <li><strong>登录状态凭证</strong>：用于保持您的免登录状态，避免频繁重复输入账号密码；</li>
          <li><strong>界面显示偏好</strong>：用于记录您所选择的明暗视觉主题。</li>
        </ul>
        <p>您随时可以通过浏览器的「清除浏览数据」功能清空上述所有本地缓存。</p>

        <h2>八、未成年人信息保护</h2>
        <p>
          本站为游戏非官方资料与 Wiki 查询工具，主要面向具有完全民事行为能力的成年用户。若您为未满 14 周岁的未成年人，请在法定监护人的陪同、指导与同意下阅读本政策并使用本站服务；若未取得监护人同意，请勿注册账号或提交任何个人信息。
        </p>

        <h2>九、政策更新与联系方式</h2>
        <p>
          为反映业务发展、技术演进或法规调整，我们可能会适时修订本政策。对于政策的实质性变更，我们将在本站以公告或弹窗等醒目方式进行通知。如您对本隐私说明有任何疑问、意见、建议或数据权利诉求，均可通过本站「站内讨论区」与管理员取得联系。
        </p>

        <p class="privacy-foot">
          <RouterLink to="/" class="privacy-back" @click="handleBack">← 返回首页</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 隐私说明页。
 * 规范化主流法律风格，单栏居中收纳于羊皮纸面板内。
 */
import { RouterLink, useRouter } from 'vue-router'

const router = useRouter()

function handleBack(e) {
  if (window.history.length > 1) {
    e.preventDefault()
    router.back()
  }
}
</script>

<style scoped>
.privacy-page {
  display: flex;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  padding-bottom: 40px;
  box-sizing: border-box;
}

.privacy-card {
  width: 100%;
  max-width: 860px;
  padding: 24px 28px 28px;
  border: 1px solid var(--border-color, #8f7351);
  border-radius: 10px;
  background: var(--paper-soft, #e9dcc3);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .privacy-page {
    padding: 6px 4px 36px;
  }
  .privacy-card {
    padding: 16px 14px 22px;
    border-radius: 8px;
  }
}

.privacy-header {
  border-bottom: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
  padding-bottom: 14px;
  margin-bottom: 18px;
}

.privacy-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 6px 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main, #3e2a14);
  letter-spacing: 1px;
}

.privacy-diamond {
  display: inline-block;
  width: 12px;
  height: 12px;
  background: var(--accent-bright, #7a9a99);
  transform: rotate(45deg);
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.privacy-meta {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, #7c6853);
}

.privacy-body {
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-main, #3e2a14);
}

.privacy-lead {
  margin: 0 0 16px;
  color: var(--text-main, #3e2a14);
}

.privacy-body h2 {
  margin: 24px 0 10px;
  font-size: 15.5px;
  font-weight: 700;
  color: var(--accent-ink, #8f4b1e);
  border-bottom: 1px dashed var(--border-faint, rgba(143, 115, 81, 0.25));
  padding-bottom: 4px;
}

.privacy-body p {
  margin: 0 0 10px;
}

.privacy-body ul {
  margin: 0 0 12px;
  padding-left: 20px;
}

.privacy-body li {
  margin-bottom: 6px;
}

.privacy-table {
  width: 100%;
  margin: 0 0 16px;
  border-collapse: collapse;
  font-size: 13px;
}

.privacy-table th,
.privacy-table td {
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--border-color, #8f7351);
}

.privacy-table th {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-muted, #7c6853);
  font-weight: 600;
  white-space: nowrap;
}

.privacy-foot {
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid var(--border-faint, rgba(143, 115, 81, 0.25));
}

.privacy-back {
  display: inline-block;
  color: var(--accent-ink, #8f4b1e);
  text-decoration: none;
  font-weight: 600;
  transition: opacity 0.2s;
}

.privacy-back:hover {
  opacity: 0.8;
  text-decoration: underline;
}
</style>
