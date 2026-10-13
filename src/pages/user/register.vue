<template>
  <AuthLayout title="创建账号" sub="创建本站账号 · 注册不占用内测名额">
    <p class="back"><router-link :to="authDestination('/login')">← 返回登录</router-link></p>

    <form class="auth-form" @submit.prevent="onSubmit" novalidate>
          <div class="field">
            <label for="register-email">邮箱 <em>*</em></label>
            <div class="input-wrap" :class="{ focus: focusField === 'email' }">
              <input id="register-email" v-model.trim="form.email" name="email" type="email" autocomplete="email" spellcheck="false" placeholder="you@example.com" @focus="focusField='email'" @blur="focusField=''" />
            </div>
            <p class="field-err" v-if="errors.email">{{ errors.email }}</p>
          </div>

          <div class="field">
            <label for="register-username">用户名 <em>*</em></label>
            <div class="input-wrap" :class="{ focus: focusField === 'userName' }">
              <input id="register-username" v-model.trim="form.userName" name="username" type="text" autocomplete="username" spellcheck="false" placeholder="4~24 位" @focus="focusField='userName'" @blur="focusField=''" />
            </div>
            <p class="field-err" v-if="errors.userName">{{ errors.userName }}</p>
          </div>

          <div class="field split">
            <div class="split-head">
              <label for="register-code">验证码 <em>*</em></label>
            </div>
            <div class="split-row">
              <div class="input-wrap" :class="{ focus: focusField === 'code' }">
                <input id="register-code" v-model.trim="form.registrationToken" name="code" type="text" autocomplete="one-time-code" spellcheck="false" placeholder="邮箱验证码" inputmode="numeric" @focus="focusField='code'" @blur="focusField=''" />
              </div>
              <button
                class="code-btn"
                type="button"
                :disabled="sending || countdown > 0 || !emailOk"
                @click="sendCode"
              >{{ countdown > 0 ? countdown + 's' : (sending ? '发送中…' : '获取验证码') }}</button>
            </div>
            <p class="field-err" v-if="errors.registrationToken">{{ errors.registrationToken }}</p>
            <p class="field-err" v-else-if="codeMsg">{{ codeMsg }}</p>
          </div>

          <div class="field">
            <label for="register-password">密码 <em>*</em></label>
            <PasswordInput id="register-password" v-model="form.password" name="password" placeholder="8~32 位" autocomplete="new-password" />
            <p class="field-err" v-if="errors.password">{{ errors.password }}</p>
          </div>

          <div class="field">
            <label for="register-confirm">确认密码 <em>*</em></label>
            <PasswordInput id="register-confirm" v-model="form.confirm" name="confirm-password" placeholder="再次输入密码" autocomplete="new-password" />
            <p class="field-err" v-if="errors.confirm">{{ errors.confirm }}</p>
          </div>

          <p class="form-err" v-if="serverMsg" role="alert"><span class="dot"></span>{{ serverMsg }}</p>
          <button class="btn-submit" type="submit" :disabled="loading">
            {{ loading ? '注册中…' : '注 册' }}
          </button>
        </form>

    <p class="auth-switch">已有账号？<router-link :to="authDestination('/login')"><b>直接登录</b></router-link></p>
  <BetaNotice />
  </AuthLayout>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AuthLayout from '../../components/AuthLayout.vue'
import PasswordInput from '../../components/PasswordInput.vue'
import BetaNotice from '../../components/beta/BetaNotice.vue'
import { safeBetaRedirect } from '../../utils/betaAccess.js'
// api/user.js 由 eng-api 按契约提供：sendRegistrationToken({email}) { register({email,userName,password,registrationToken}) }
import { sendRegistrationToken, register } from '@/api/user.js'

const router = useRouter()
const route = useRoute()
function authDestination(path) { return { path, query: { redirect: safeBetaRedirect(route.query.redirect, '/beta') } } }
const loading = ref(false)
const sending = ref(false)
const serverMsg = ref('')
const codeMsg = ref('')
const focusField = ref('')
const countdown = ref(0)
let timer = null

const form = reactive({ email: '', userName: '', registrationToken: '', password: '', confirm: '' })
const errors = reactive({ email: '', userName: '', registrationToken: '', password: '', confirm: '' })

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

async function sendCode() {
  codeMsg.value = ''
  serverMsg.value = ''
  if (!form.email) { errors.email = '请先输入邮箱'; return }
  if (!emailRe.test(form.email)) { errors.email = '邮箱格式不正确'; return }
  errors.email = ''
  sending.value = true
  try {
    await sendRegistrationToken({ email: form.email })
    codeMsg.value = '验证码已发送，请注意查收'
    startCountdown()
  } catch (e) {
    codeMsg.value = (e && e.message) || '发送失败，请稍后再试'
  } finally {
    sending.value = false
  }
}

function validate() {
  errors.email = errors.userName = errors.registrationToken = errors.password = errors.confirm = ''
  if (!form.email) errors.email = '请输入邮箱'
  else if (!emailRe.test(form.email)) errors.email = '邮箱格式不正确'
  if (!form.userName) errors.userName = '请输入用户名'
  else if (form.userName.length < 4 || form.userName.length > 24) errors.userName = '用户名长度需在 4~24 位之间'
  if (!form.registrationToken) errors.registrationToken = '请输入验证码'
  if (!form.password) errors.password = '请输入密码'
  else if (form.password.length < 8 || form.password.length > 32) errors.password = '密码长度需在 8~32 位之间'
  if (!form.confirm) errors.confirm = '请再次输入密码'
  else if (form.confirm !== form.password) errors.confirm = '两次输入的密码不一致'
  return !errors.email && !errors.userName && !errors.registrationToken && !errors.password && !errors.confirm
}

async function onSubmit() {
  serverMsg.value = ''
  if (!validate()) return
  loading.value = true
  try {
    await register({
      email: form.email,
      userName: form.userName,
      password: form.password,
      registrationToken: form.registrationToken
    })
    clearTimer()
    router.push({ ...authDestination('/login'), query: { ...authDestination('/login').query, registered: '1' } })
  } catch (e) {
    serverMsg.value = (e && e.message) || '注册失败，请稍后再试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.back a { color: var(--ink-60); text-decoration: none; }
.back a:hover { color: var(--accent); }
.field label { color: var(--ink-60); }
.field label em { color: var(--rouge); }
.input-wrap {
  background: var(--cream); border: 1.5px solid var(--line); border-radius: 12px;
  transition: border-color .3s var(--ease), box-shadow .3s var(--ease);
}
.input-wrap.focus { border-color: var(--yellow-deep); box-shadow: 0 0 0 3px rgba(239,210,142,.35); }
.input-wrap input { border: none; outline: none; background: transparent; color: var(--ink);
}
.input-wrap input::placeholder { color: var(--ink-35); }
.code-btn { border: 1.5px solid var(--line); background: var(--surface);
  border-radius: 999px; color: var(--ink);
  cursor: pointer; transition: color .3s var(--ease), background-color .3s var(--ease), border-color .3s var(--ease);
}
.code-btn:hover:not(:disabled) { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }
.code-btn:disabled { opacity: .5; cursor: default; }
.field-err { color: var(--rouge); }
.form-err {
  background: rgba(166,81,74,.08); border: 1px solid rgba(166,81,74,.28);
  color: var(--rouge); border-radius: 10px;
}
.form-err .dot { border-radius: 50%; background: var(--rouge); }
.btn-submit { background: var(--tea); color: var(--cream);
  border: none; border-radius: 999px; cursor: pointer;
  transition: color .35s var(--ease), background-color .35s var(--ease), transform .35s var(--ease);
}
.btn-submit:hover:not(:disabled) { background: var(--accent); color: #fff; }
.btn-submit:disabled { opacity: .55; cursor: default; }
.auth-switch { border-top: 1px dashed var(--line); color: var(--ink-60);
}
.auth-switch a { text-decoration: none; color: var(--ink-60); }
.auth-switch a b { color: var(--ink); border-bottom: 1.5px solid var(--yellow); }
.auth-switch a:hover b { color: var(--accent); }
</style>
<style scoped src="./registerPageDesktop.css"></style>
<style scoped src="./registerPageMobile.css"></style>
