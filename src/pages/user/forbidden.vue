<template>
  <div class="page-forbidden">
    <IslandSidebar />
    <main id="main-content">
      <section class="forbidden-band">
        <div class="forbidden-panel">
          <ShieldCheck :size="32" aria-hidden="true" />
          <span class="eyebrow">访问提示</span>
          <h1>{{ copy.title }}</h1>
          <p>{{ copy.description }}</p>
          <p v-if="retryError" class="retry-error" role="alert">{{ retryError }}</p>
          <div class="actions">
            <button v-if="returnPath" type="button" class="command primary" :disabled="retrying" @click="retry">{{ retrying ? '正在重新检查…' : copy.retryLabel }}</button>
            <router-link class="command" :class="returnPath ? 'secondary' : 'primary'" to="/user/profile">返回个人中心</router-link>
            <router-link class="command secondary" to="/feedback">查看我的反馈</router-link>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ShieldCheck } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import { safeBetaRedirect } from '../../utils/betaAccess.js'
import { needsAdminAccess } from '../../utils/routeAccess.js'

const route = useRoute()
const router = useRouter()
const retrying = ref(false)
const retryError = ref('')
const copies = {
  'recruitment-required': {
    title: '当前账号尚未获得招募档案资格',
    description: '招募档案当前为有限访问，需要管理员将账号加入访问名单。资格开通后，可重新检查并返回招募档案。',
    retryLabel: '重新检查资格'
  },
  'recruitment-unavailable': {
    title: '暂时无法确认招募档案资格',
    description: '资格状态读取失败，这不代表你没有资格。请检查网络后重试，或先返回个人中心。',
    retryLabel: '重试'
  },
  'admin-required': {
    title: '当前账号没有此功能的管理权限',
    description: '此功能需要相应的管理权限。权限调整后，可重新检查；也可返回个人中心继续使用其他功能。',
    retryLabel: '重新检查权限'
  },
  'admin-unavailable': {
    title: '暂时无法确认管理权限',
    description: '管理权限读取失败，这不代表权限已被撤销。请检查网络后重试，或先返回个人中心。',
    retryLabel: '重试'
  }
}
const returnPath = computed(() => {
  const path = safeBetaRedirect(route.query.from, '')
  if (!path) return ''
  const target = router.resolve(path)
  // query 只用于恢复导航：限制为真实受保护路由，权限仍由守卫检查。
  if (!target.name || target.name === 'not-found') return ''
  const reason = route.query.reason
  if (reason === 'recruitment-required' || reason === 'recruitment-unavailable') {
    return target.meta.requiresRecruitmentAccess ? path : ''
  }
  if (reason === 'admin-required' || reason === 'admin-unavailable') {
    return needsAdminAccess(target.meta) ? path : ''
  }
  return ''
})
const copy = computed(() => returnPath.value ? copies[route.query.reason] : {
  title: '当前账号暂时无法访问此功能',
  description: '可返回个人中心，继续使用当前可访问的功能。'
})

async function retry() {
  if (retrying.value || !returnPath.value) return
  retrying.value = true
  retryError.value = ''
  try {
    await router.push(returnPath.value)
  } catch (_) {
    retryError.value = '暂时无法返回，请稍后重试。'
  } finally {
    retrying.value = false
  }
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.forbidden-panel { background: var(--surface); border: 1px solid var(--line); border-left: 5px solid var(--rouge); border-radius: 8px }
.forbidden-panel>svg { color: var(--rouge) }
.eyebrow { color: var(--accent-strong) }
h1 { color: var(--ink) }
p { color: var(--ink-60) }
.command { border: 1px solid var(--line); border-radius: 8px; color: var(--ink); text-decoration: none; cursor: pointer }
.command:disabled { opacity: .6; cursor: wait }
.command:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }
.retry-error { color: var(--rouge) }
.command.primary { background: var(--tea); border-color: var(--tea); color: var(--cream) }
.command.secondary { background: var(--surface) }
</style>
<style scoped src="./forbiddenPageDesktop.css"></style>
<style scoped src="./forbiddenPageMobile.css"></style>
