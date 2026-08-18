<template>
  <AuthLayout
    :title="step === 1 ? '找回密码' : '设置新密码'"
    :sub="step === 1 ? '通过邮箱验证码重置密码' : '验证成功 · 请设置新密码'"
  >
    <p class="back"><router-link to="/login">← 返回登录</router-link></p>

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
          <p class="form-err" v-if="serverMsg"><span class="dot"></span>{{ serverMsg }}</p>
          <button class="btn-submit" type="submit" :disabled="sending || countdown > 0">
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
          <div class="field">
            <label for="forgot-password">新密码 <em>*</em></label>
            <div class="input-wrap" :class="{ focus: focusField === 'password' }">
              <input id="forgot-password" v-model="form.password" name="password" type="password" placeholder="8~32 位" autocomplete="new-password" @focus="focusField='password'" @blur="focusField=''" />
            </div>
            <p class="field-err" v-if="errors.password">{{ errors.password }}</p>
          </div>
          <div class="field">
            <label for="forgot-confirm">确认新密码 <em>*</em></label>
            <div class="input-wrap" :class="{ focus: focusField === 'confirm' }">
              <input id="forgot-confirm" v-model="form.confirm" name="confirm-password" type="password" placeholder="再次输入密码" autocomplete="new-password" @focus="focusField='confirm'" @blur="focusField=''" />
            </div>
            <p class="field-err" v-if="errors.confirm">{{ errors.confirm }}</p>
          </div>
          <p class="form-err" v-if="serverMsg"><span class="dot"></span>{{ serverMsg }}</p>
          <button class="btn-submit" type="submit" :disabled="loading">
            {{ loading ? '提交中…' : '重置密码' }}
          </button>
        </form>

    <div class="auth-switch" v-if="step === 2">
      <router-link to="/login">返回登录</router-link>
      <router-link to="/register">还没有账号？<b>立即注册</b></router-link>
    </div>
    <div class="auth-switch" v-else>
      <router-link to="/register">还没有账号？<b>立即注册</b></router-link>
    </div>
  </AuthLayout>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthLayout from '../../components/AuthLayout.vue'
// api/user.js 由 eng-api 按契约提供：sendResetVCode({email}) { resetPassword({email,activeCode,password}) }
import { sendResetVCode, resetPassword } from '@/api/user.js'

const router = useRouter()
const step = ref(1)
const loading = ref(false)
const sending = ref(false)
const serverMsg = ref('')
const codeMsg = ref('')
const focusField = ref('')
const countdown = ref(0)
let timer = null

const form = reactive({ email: '', activeCode: '', password: '', confirm: '' })
const errors = reactive({ email: '', activeCode: '', password: '', confirm: '' })

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailOk = computed(() => emailRe.test(form.email))

function startCountdown() {
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) clearInterval(timer)
  }, 1000)
}
function clearTimer() { if (timer) { clearInterval(timer); timer = null } }
onUnmounted(clearTimer)

async function onSend() {
  codeMsg.value = ''
  serverMsg.value = ''
  errors.email = ''
  if (!form.email) { errors.email = '请输入邮箱'; return }
  if (!emailRe.test(form.email)) { errors.email = '邮箱格式不正确'; return }
  sending.value = true
  try {
    await sendResetVCode({ email: form.email })
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
    router.push('/login')
  } catch (e) {
    serverMsg.value = (e && e.message) || '重置失败，请稍后再试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.back { position: absolute; top: 18px; left: 22px; font-size: 12.5px; }
.back a { color: var(--ink-60); text-decoration: none; font-weight: 600; }
.back a:hover { color: var(--accent); }
.auth-form { margin-top: 26px; display: flex; flex-direction: column; gap: 14px; }
.field label { display: block; font-size: 12.5px; font-weight: 700; color: var(--ink-60); margin-bottom: 6px; letter-spacing: .04em; }
.field label em { color: var(--rouge); font-style: normal; }
.input-wrap {
  background: var(--cream); border: 1.5px solid var(--line); border-radius: 12px;
  transition: border-color .3s var(--ease), box-shadow .3s var(--ease);
}
.input-wrap.focus { border-color: var(--yellow-deep); box-shadow: 0 0 0 3px rgba(239,210,142,.35); }
.input-wrap input {
  width: 100%; border: none; outline: none; background: transparent;
  padding: 12px 14px; font-size: 14px; font-family: var(--font-b); color: var(--ink);
}
.input-wrap input::placeholder { color: var(--ink-35); }
.split-row { display: flex; gap: 10px; align-items: center; }
.split-row .input-wrap { flex: 1; }
.code-btn {
  flex: none; border: 1.5px solid var(--line); background: var(--surface);
  border-radius: 999px; padding: 0 16px; height: 44px;
  font-size: 12.5px; font-weight: 800; font-family: var(--font-b); color: var(--ink);
  cursor: pointer; transition: color .3s var(--ease), background-color .3s var(--ease), border-color .3s var(--ease); white-space: nowrap;
}
.code-btn:hover:not(:disabled) { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }
.code-btn:disabled { opacity: .5; cursor: default; }
.field-err { margin-top: 5px; font-size: 12px; color: var(--rouge); font-weight: 600; }
.field-err.grn { color: var(--accent-strong); }
.form-err {
  display: flex; align-items: center; gap: 8px;
  background: rgba(166,81,74,.08); border: 1px solid rgba(166,81,74,.28);
  color: var(--rouge); font-size: 12.5px; font-weight: 600; border-radius: 10px; padding: 9px 12px;
}
.form-err .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--rouge); flex: none; }
.btn-submit {
  margin-top: 4px; background: var(--tea); color: var(--cream);
  border: none; border-radius: 999px; padding: 14px 0; font-size: 15px;
  font-weight: 800; font-family: var(--font-b); letter-spacing: .14em; cursor: pointer;
  transition: color .35s var(--ease), background-color .35s var(--ease), transform .35s var(--ease);
}
.btn-submit:hover:not(:disabled) { background: var(--accent); color: #fff; transform: translateY(-2px); }
.btn-submit:disabled { opacity: .55; cursor: default; }
.auth-switch {
  margin-top: 22px; padding-top: 16px; border-top: 1px dashed var(--line);
  text-align: center; font-size: 13px; color: var(--ink-60);
}
.auth-switch a { text-decoration: none; color: var(--ink-60); }
.auth-switch a b { color: var(--ink); border-bottom: 1.5px solid var(--yellow); }
.auth-switch a:hover b { color: var(--accent); }
</style>
