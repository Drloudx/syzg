/**
 * 「发送邮箱验证码」的共用逻辑。
 *
 * 注册、改密码、换邮箱（旧 + 新各一次）一共 **4~5 处**都要走同一条流程：
 *
 * ```
 * 点按钮 → 本地校验邮箱 → 展开蛋点选 → 点满 3 个 → 提交 /api/auth/code
 *        ├─ 成功      → 收起题目，开 60 秒冷却，提示"已发送"
 *        ├─ 403 人机没过 → **换一道新题**（服务端已把旧题作废）+ 提示重试
 *        └─ 429 限流   → 收起题目，按服务端给的秒数冷却
 * ```
 *
 * 抽出来的理由不只是"少写几遍"：**`403 → reset()` 这条是正确性细节**，
 * 漏掉它的话用户会遇到"点了没反应、再点还说错"的死循环
 * （服务端的作废规则是"校验一次即删题"，旧 `captchaId` 已经不存在了）。
 * 分散在 5 处各写一遍，迟早漏一处。
 */

import { computed, onScopeDispose, ref } from 'vue'

import { isPlausibleEmail, isDisposableEmail, normalizeEmail } from './authCrypto.js'
import { BLOCKED_EMAIL_DOMAINS } from '../config/disposableEmails.js'
import { sendAuthCode } from './authApi.js'

/**
 * 客户端能提前给出的邮箱问题（与 `authRequestCode` 的第一道校验对齐）。
 * **服务端仍会再校验一遍** —— 这里只是让用户少走一趟、少做一次人机验证。
 */
export function validateEmailInput(raw) {
  const email = normalizeEmail(raw)
  if (!email) return '请填写邮箱'
  if (!isPlausibleEmail(email)) return '邮箱格式看起来不对，检查一下'
  if (isDisposableEmail(email, BLOCKED_EMAIL_DOMAINS)) return '请用常用邮箱，临时邮箱收不到验证码'
  return ''
}

/**
 * @param {object} opts
 * @param {'register'|'password'|'email_change'} opts.purpose
 * @param {() => string} opts.getEmail 取当前邮箱（**每次调用都重新取**，别传值 —— 用户可能在展开题目后又改了邮箱）
 */
export function useCodeSender({ purpose, getEmail }) {
  /** 题目是否展开 */
  const captchaVisible = ref(false)
  /** 绑到 `<CaptchaEgg ref>`，403 时用它换新题 */
  const captchaRef = ref(null)
  const sending = ref(false)
  /** 已经成功发出过至少一次（用于显示"没收到？看看垃圾邮件"） */
  const sent = ref(false)
  const cooldown = ref(0)
  const error = ref('')

  let timer = null

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function startCooldown(seconds) {
    stopTimer()
    const sec = Math.max(0, Math.floor(Number(seconds) || 0))
    cooldown.value = sec
    if (sec <= 0) return
    timer = setInterval(() => {
      cooldown.value -= 1
      if (cooldown.value <= 0) stopTimer()
    }, 1000)
  }

  /** 点「发送验证码」：先本地校验，通过才展开题目 */
  function request() {
    error.value = ''
    if (cooldown.value > 0) return false
    const local = validateEmailInput(getEmail())
    if (local) {
      error.value = local
      return false
    }
    captchaVisible.value = true
    return true
  }

  /** 题目点满 3 个后由 `<CaptchaEgg @complete>` 调进来 */
  async function submit({ captchaId, picks }) {
    sending.value = true
    try {
      const data = await sendAuthCode({ email: getEmail(), purpose, captchaId, picks })
      captchaVisible.value = false
      sent.value = true
      error.value = ''
      startCooldown(data?.cooldown ?? 60)
      return true
    } catch (err) {
      if (err?.status === 403) {
        // 🔴 服务端已把这道题删了，必须换新题，否则用户再点也是错
        error.value = '点错了，已经换了新题，请重新点击'
        captchaRef.value?.reset()
      } else {
        captchaVisible.value = false
        error.value = err?.message || '发送失败，请稍后再试'
        if (err?.retryAfter) startCooldown(err.retryAfter)
      }
      return false
    } finally {
      sending.value = false
    }
  }

  /**
   * 收起题目（关人机验证弹窗时调）。
   *
   * 与 `reset()` 的区别：**只收起题目，不动冷却与"已发出"状态**。
   * 用户点了「发送验证码」→ 题目弹出 → 想反悔关掉 —— 这时如果连冷却一起清，
   * 他会看到"发送验证码"按钮又能点了，点了却因为服务端仍在冷却而被拒，
   * 反而更困惑。题目的 cookie 与服务端的题都还在，重开弹窗能接着点。
   */
  function cancel() {
    captchaVisible.value = false
  }

  /** 收起题目并清冷却（切视图、退出登录时调） */
  function reset() {
    stopTimer()
    captchaVisible.value = false
    sending.value = false
    sent.value = false
    cooldown.value = 0
    error.value = ''
  }

  onScopeDispose(stopTimer)

  const canSend = computed(() => cooldown.value <= 0 && !sending.value && !captchaVisible.value)
  const buttonText = computed(() => (cooldown.value > 0 ? `${cooldown.value} 秒后可重发` : sent.value ? '重新发送' : '发送验证码'))

  return {
    captchaVisible,
    captchaRef,
    sending,
    sent,
    cooldown,
    error,
    canSend,
    buttonText,
    request,
    submit,
    cancel,
    reset,
    startCooldown
  }
}
