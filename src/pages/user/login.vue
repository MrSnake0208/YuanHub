<template>
  <AuthLayout title="欢迎回来" sub="登录后即可保存作业 · 同步进度">
    <form class="auth-form" @submit.prevent="onSubmit" novalidate>
          <div class="field">
            <label>邮箱 <em>*</em></label>
            <div class="input-wrap" :class="{ focus: focusField === 'email' }">
              <input
                v-model.trim="form.email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                @focus="focusField = 'email'"
                @blur="focusField = ''"
              />
            </div>
            <p class="field-err" v-if="errors.email">{{ errors.email }}</p>
          </div>

          <div class="field">
            <label>密码 <em>*</em></label>
            <div class="input-wrap" :class="{ focus: focusField === 'password' }">
              <input
                v-model="form.password"
                type="password"
                placeholder="请输入密码"
                autocomplete="current-password"
                @focus="focusField = 'password'"
                @blur="focusField = ''"
              />
            </div>
            <p class="field-err" v-if="errors.password">{{ errors.password }}</p>
          </div>

          <p class="form-err" v-if="serverMsg"><span class="dot"></span>{{ serverMsg }}</p>

          <button class="btn-submit" type="submit" :disabled="loading">
            {{ loading ? '登录中…' : '登 录' }}
          </button>
        </form>

    <div class="auth-switch">
      <router-link to="/register">还没有账号？<b>立即注册</b></router-link>
      <router-link to="/forgot">忘记密码？</router-link>
    </div>
  </AuthLayout>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AuthLayout from '../../components/AuthLayout.vue'
// store/auth.js 由 eng-api 按契约提供：{ login(email, password) } 返回 Promise
import { auth } from '@/store/auth.js'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const serverMsg = ref('')
const focusField = ref('')

const form = reactive({ email: '', password: '' })
const errors = reactive({ email: '', password: '' })

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate() {
  errors.email = ''
  errors.password = ''
  if (!form.email) errors.email = '请输入邮箱'
  else if (!emailRe.test(form.email)) errors.email = '邮箱格式不正确'
  if (!form.password) errors.password = '请输入密码'
  else if (form.password.length < 8 || form.password.length > 32) errors.password = '密码长度需在 8~32 位之间'
  return !errors.email && !errors.password
}

async function onSubmit() {
  serverMsg.value = ''
  if (!validate()) return
  loading.value = true
  try {
    await auth.login(form.email, form.password)
    // 支持守卫重定向回跳（?redirect=...），默认回首页
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } catch (e) {
    serverMsg.value = (e && e.message) || '登录失败，请稍后再试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-form { margin-top: 28px; display: flex; flex-direction: column; gap: 16px; }
.field label {
  display: block; font-size: 12.5px; font-weight: 700; color: var(--ink-60); margin-bottom: 6px;
  letter-spacing: .04em;
}
.field label em { color: var(--rouge); font-style: normal; }
.input-wrap {
  background: var(--cream);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  transition: border-color .3s var(--ease), box-shadow .3s var(--ease);
}
.input-wrap.focus { border-color: var(--yellow-deep); box-shadow: 0 0 0 3px rgba(239,210,142,.35); }
.input-wrap input {
  width: 100%; border: none; outline: none; background: transparent;
  padding: 12px 14px; font-size: 14px; font-family: var(--font-b); color: var(--ink);
}
.input-wrap input::placeholder { color: var(--ink-35); }
.field-err { margin-top: 5px; font-size: 12px; color: var(--rouge); font-weight: 600; }
.form-err {
  display: flex; align-items: center; gap: 8px;
  background: rgba(166,81,74,.08); border: 1px solid rgba(166,81,74,.28);
  color: var(--rouge); font-size: 12.5px; font-weight: 600;
  border-radius: 10px; padding: 9px 12px;
}
.form-err .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--rouge); flex: none; }
.btn-submit {
  margin-top: 4px;
  background: var(--tea); color: var(--cream);
  border: none; border-radius: 999px; padding: 14px 0;
  font-size: 15px; font-weight: 800; font-family: var(--font-b);
  letter-spacing: .14em; cursor: pointer; transition: all .35s var(--ease);
}
.btn-submit:hover:not(:disabled) { background: var(--accent); color: #fff; transform: translateY(-2px); }
.btn-submit:disabled { opacity: .55; cursor: default; }
.auth-switch {
  margin-top: 24px; padding-top: 18px; border-top: 1px dashed var(--line);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  font-size: 13px; color: var(--ink-60);
}
.auth-switch a { text-decoration: none; color: var(--ink-60); transition: color .3s; }
.auth-switch a b { color: var(--ink); border-bottom: 1.5px solid var(--yellow); }
.auth-switch a:hover, .auth-switch a:hover b { color: var(--accent); }
</style>