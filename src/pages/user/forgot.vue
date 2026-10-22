<template>
  <AuthLayout
    :title="step === 1 ? '找回密码' : '设置新密码'"
    :sub="step === 1 ? '通过邮箱验证码重置密码' : '验证成功 · 请设置新密码'"
  >
    <p class="back"><router-link :to="authDestination('/login')"><ArrowLeft :size="16" aria-hidden="true" /> 返回登录</router-link></p>

    <!-- 步骤一：发送验证码 -->
        <form v-if="step === 1" class="auth-form" @submit.prevent="onSend" novalidate>
          <div class="field">
            <label for="forgot-email">邮箱 <em>*</em></label>
            <div class="split-row">
              <div class="input-wrap" :class="{ focus: focusField === 'email' }">
                <input id="forgot-email" v-model.trim="form.email" name="email" type="email" autocomplete="email" spellcheck="false" placeholder="you@example.com" @focus="focusField='email'" @blur="focusField=''" />
              </div>
              <button
                class="code-btn" type="button" :disabled="sending || countdown > 0 || !emailOk" @click="onSend"
              >{{ countdown > 0 ? countdown + 's' : (sending ? '发送中…' : '发送验证码') }}</button>
            </div>
            <p class="field-err" v-if="errors.email">{{ errors.email }}</p>
            <p class="field-err grn" v-else-if="codeMsg">{{ codeMsg }}</p>
          </div>
          <p class="form-err" v-if="serverMsg" role="alert"><span class="dot"></span>{{ serverMsg }}</p>
          <button class="btn-submit" type="submit" :disabled="sending || (countdown > 0 && sentEmail !== form.email)">
            下一步
          </button>
        </form>

        <!-- 步骤二：验证码 + 新密码 -->
        <form v-else class="auth-form" @submit.prevent="onSubmit" novalidate>
          <div class="field">
            <label for="forgot-code">邮箱验证码 <em>*</em></label>
            <div class="input-wrap" :class="{ focus: focusField === 'code' }">
              <input id="forgot-code" v-model.trim="form.activeCode" name="code" type="text" autocomplete="one-time-code" spellcheck="false" placeholder="请输入验证码" inputmode="numeric" @focus="focusField='code'" @blur="focusField=''" />
            </div>
            <p class="field-err" v-if="errors.activeCode">{{ errors.activeCode }}</p>
          </div>
          <div class="recovery-actions">
            <button class="code-btn" type="button" :disabled="sending || countdown > 0" @click="onSend">{{ sending ? '发送中…' : countdown > 0 ? `重新发送（${countdown}s）` : '重新发送验证码' }}</button>
            <button class="code-btn" type="button" @click="step = 1">返回上一步</button>
          </div>
          <p v-if="codeMsg" class="field-err grn" role="status">{{ codeMsg }}</p>
          <div class="field">
            <label for="forgot-password">新密码 <em>*</em></label>
            <PasswordInput id="forgot-password" v-model="form.password" name="password" placeholder="8~32 位" autocomplete="new-password" />
            <p class="field-err" v-if="errors.password">{{ errors.password }}</p>
          </div>
          <div class="field">
            <label for="forgot-confirm">确认新密码 <em>*</em></label>
            <PasswordInput id="forgot-confirm" v-model="form.confirm" name="confirm-password" placeholder="再次输入密码" autocomplete="new-password" />
            <p class="field-err" v-if="errors.confirm">{{ errors.confirm }}</p>
          </div>
          <p class="form-err" v-if="serverMsg" role="alert"><span class="dot"></span>{{ serverMsg }}</p>
          <button class="btn-submit" type="submit" :disabled="loading">
            {{ loading ? '提交中…' : '重置密码' }}
          </button>
        </form>

    <div class="auth-switch" v-if="step === 2">
      <router-link :to="authDestination('/login')">返回登录</router-link>
      <router-link :to="authDestination('/register')">还没有账号？<b>立即注册</b></router-link>
    </div>
    <div class="auth-switch" v-else>
      <router-link :to="authDestination('/register')">还没有账号？<b>立即注册</b></router-link>
    </div>
  <BetaNotice />
  </AuthLayout>
</template>

<script setup>
import { ArrowLeft } from '@lucide/vue'
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AuthLayout from '../../components/AuthLayout.vue'
import PasswordInput from '../../components/PasswordInput.vue'
import BetaNotice from '../../components/beta/BetaNotice.vue'
import { safeBetaRedirect } from '../../utils/betaAccess.js'
// api/user.js 由 eng-api 按契约提供：sendResetVCode({email}) { resetPassword({email,activeCode,password}) }
import { sendResetVCode, resetPassword } from '@/api/user.js'

const router = useRouter()
const route = useRoute()
function authDestination(path) { return { path, query: { redirect: safeBetaRedirect(route.query.redirect, '/beta') } } }
const step = ref(1)
const loading = ref(false)
const sending = ref(false)
const serverMsg = ref('')
const codeMsg = ref('')
const focusField = ref('')
const countdown = ref(0)
const sentEmail = ref('')
let timer = null

const form = reactive({ email: '', activeCode: '', password: '', confirm: '' })
const errors = reactive({ email: '', activeCode: '', password: '', confirm: '' })

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailOk = computed(() => emailRe.test(form.email))

function startCountdown() {
  clearTimer()
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) clearInterval(timer)
  }, 1000)
}
function clearTimer() { if (timer) { clearInterval(timer); timer = null } }
onUnmounted(clearTimer)

async function onSend() {
  if (sending.value) return
  if (sentEmail.value === form.email && countdown.value > 0 && step.value === 1) { step.value = 2; return }
  if (countdown.value > 0) return
  codeMsg.value = ''
  serverMsg.value = ''
  errors.email = ''
  if (!form.email) { errors.email = '请输入邮箱'; return }
  if (!emailRe.test(form.email)) { errors.email = '邮箱格式不正确'; return }
  sending.value = true
  try {
    await sendResetVCode({ email: form.email })
    sentEmail.value = form.email
    codeMsg.value = '验证码已发送，请注意查收'
    startCountdown()
    step.value = 2
  } catch (e) {
    serverMsg.value = (e && e.message) || '发送失败，请稍后再试'
  } finally {
    sending.value = false
  }
}

function validate() {
  errors.activeCode = errors.password = errors.confirm = ''
  if (!form.activeCode) errors.activeCode = '请输入验证码'
  if (!form.password) errors.password = '请输入新密码'
  else if (form.password.length < 8 || form.password.length > 32) errors.password = '密码长度需在 8~32 位之间'
  if (!form.confirm) errors.confirm = '请再次输入密码'
  else if (form.confirm !== form.password) errors.confirm = '两次输入的密码不一致'
  return !errors.activeCode && !errors.password && !errors.confirm
}

async function onSubmit() {
  serverMsg.value = ''
  if (!validate()) return
  loading.value = true
  try {
    await resetPassword({
      email: form.email,
      activeCode: form.activeCode,
      password: form.password
    })
    clearTimer()
    router.push(authDestination('/login'))
  } catch (e) {
    serverMsg.value = (e && e.message) || '重置失败，请稍后再试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.back a { color: var(--ink-60); text-decoration: none; }
.back a:hover { color: var(--theme-accent-text, var(--accent)); }
.field label { color: var(--ink-60); }
.field label em { color: var(--theme-danger-text, var(--rouge)); }
.input-wrap {
  background: var(--cream); border: 1.5px solid var(--line); border-radius: 12px;
  transition: border-color .3s var(--ease), box-shadow .3s var(--ease);
}
.input-wrap.focus { border-color: var(--yellow-deep); box-shadow: 0 0 0 3px rgba(var(--theme-shadow-rgb, 239, 210, 142), 0.35); }
.input-wrap input { border: none; outline: none; background: transparent; color: var(--ink);
}
.input-wrap input::placeholder { color: var(--ink-35); }
.code-btn { border: 1.5px solid var(--line); background: var(--surface);
  border-radius: 999px; color: var(--ink);
  cursor: pointer; transition: color .3s var(--ease), background-color .3s var(--ease), border-color .3s var(--ease);
}
.code-btn:hover:not(:disabled) { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }
.code-btn:disabled { opacity: .5; cursor: default; }
.field-err { color: var(--theme-danger-text, var(--rouge)); }
.field-err.grn { color: var(--theme-accent-text, var(--accent-strong)); }
.form-err {
  background: var(--theme-danger-wash, rgba(166,81,74,.08)); border: 1px solid var(--theme-danger-line, rgba(166,81,74,.28));
  color: var(--theme-danger-text, var(--rouge)); border-radius: 10px;
}
.form-err .dot { border-radius: 50%; background: var(--rouge); }
.btn-submit { background: var(--tea); color: var(--on-strong);
  border: none; border-radius: 999px; cursor: pointer;
  transition: color .35s var(--ease), background-color .35s var(--ease), transform .35s var(--ease);
}
.btn-submit:hover:not(:disabled) { background: var(--accent); color: #fff; }
.btn-submit:disabled { opacity: .55; cursor: default; }
.auth-switch { border-top: 1px dashed var(--line); color: var(--ink-60);
}
.auth-switch a { text-decoration: none; color: var(--ink-60); }
.auth-switch a b { color: var(--ink); border-bottom: 1.5px solid var(--yellow); }
.auth-switch a:hover b { color: var(--theme-accent-text, var(--accent)); }
</style>
<style scoped src="./forgotPageDesktop.css"></style>
<style scoped src="./forgotPageMobile.css"></style>
