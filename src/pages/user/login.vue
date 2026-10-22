<template>
  <AuthLayout title="欢迎回来" sub="登录本站账号 · 内测资格另行领取">
    <p v-if="route.query.loggedOut === '1'" class="logout-result" role="status">已退出登录。再次访问个人数据需要登录。</p>
    <p v-if="route.query.registered === '1'" class="logout-result" role="status">注册成功，请登录。</p>
    <form class="auth-form" @submit.prevent="onSubmit" novalidate>
          <div class="field">
            <label for="login-email">邮箱 <em>*</em></label>
            <div class="input-wrap" :class="{ focus: focusField === 'email' }">
              <input
                id="login-email"
                v-model.trim="form.email"
                name="email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                spellcheck="false"
                @focus="focusField = 'email'"
                @blur="focusField = ''"
              />
            </div>
            <p class="field-err" v-if="errors.email">{{ errors.email }}</p>
          </div>

          <div class="field">
            <label for="login-password">密码 <em>*</em></label>
            <PasswordInput
                id="login-password"
                v-model="form.password"
                name="password"
                placeholder="请输入密码"
                autocomplete="current-password"
              />
            <p class="field-err" v-if="errors.password">{{ errors.password }}</p>
          </div>

          <p class="form-err" v-if="serverMsg" role="alert"><span class="dot"></span>{{ serverMsg }}</p>

          <button class="btn-submit" type="submit" :disabled="loading">
            {{ loading ? '登录中…' : '登 录' }}
          </button>
        </form>

    <div class="auth-switch">
      <router-link :to="authDestination('/register')">还没有账号？<b>立即注册</b></router-link>
      <router-link :to="authDestination('/forgot')">忘记密码？</router-link>
    </div>
  <BetaNotice />
  </AuthLayout>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AuthLayout from '../../components/AuthLayout.vue'
import PasswordInput from '../../components/PasswordInput.vue'
import BetaNotice from '../../components/beta/BetaNotice.vue'
import { safeBetaRedirect } from '../../utils/betaAccess.js'
// store/auth.js 由 eng-api 按契约提供：{ login(email, password) } 返回 Promise
import { auth } from '@/store/auth.js'

const router = useRouter()
const route = useRoute()
function authDestination(path) { return { path, query: { redirect: safeBetaRedirect(route.query.redirect, '/beta') } } }
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
    const redirect = safeBetaRedirect(route.query.redirect, '/beta')
    router.push(redirect)
  } catch (e) {
    serverMsg.value = (e && e.message) || '登录失败，请稍后再试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.logout-result { border:1px solid var(--line); border-radius:8px; background:var(--surface); color:var(--theme-strong-text, var(--tea)); }
.field label { color: var(--ink-60);
}
.field label em { color: var(--theme-danger-text, var(--rouge)); }
.input-wrap {
  background: var(--cream);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  transition: border-color .3s var(--ease), box-shadow .3s var(--ease);
}
.input-wrap.focus { border-color: var(--yellow-deep); box-shadow: 0 0 0 3px rgba(var(--theme-shadow-rgb, 239, 210, 142), 0.35); }
.input-wrap input { border: none; outline: none; background: transparent; color: var(--ink);
}
.input-wrap input::placeholder { color: var(--ink-35); }
.field-err { color: var(--theme-danger-text, var(--rouge)); }
.form-err {
  background: var(--theme-danger-wash, rgba(166,81,74,.08)); border: 1px solid var(--theme-danger-line, rgba(166,81,74,.28));
  color: var(--theme-danger-text, var(--rouge));
  border-radius: 10px;
}
.form-err .dot { border-radius: 50%; background: var(--rouge); }
.btn-submit {
  background: var(--tea); color: var(--on-strong);
  border: none; border-radius: 999px; cursor: pointer; transition: color .35s var(--ease), background-color .35s var(--ease), transform .35s var(--ease);
}
.btn-submit:hover:not(:disabled) { background: var(--accent); color: #fff; }
.btn-submit:disabled { opacity: .55; cursor: default; }
.auth-switch { border-top: 1px dashed var(--line); color: var(--ink-60);
}
.auth-switch a { text-decoration: none; color: var(--ink-60); transition: color .3s; }
.auth-switch a b { color: var(--ink); border-bottom: 1.5px solid var(--yellow); }
.auth-switch a:hover, .auth-switch a:hover b { color: var(--theme-accent-text, var(--accent)); }
</style>
<style scoped src="./loginPageDesktop.css"></style>
<style scoped src="./loginPageMobile.css"></style>
