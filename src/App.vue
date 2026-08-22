<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <RouterView v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <AccountEventToasts />
  <!-- 全站自定义弹窗（alert / confirm / prompt），Teleport 到 body -->
  <AppDialog />
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppDialog from '@/components/AppDialog.vue'
import AccountEventToasts from '@/components/AccountEventToasts.vue'
import { auth } from '@/store/auth.js'
import { activeAccount } from '@/store/activeAccount.js'
import { dialog } from '@/utils/dialog.js'
import { stopAccountEventStream, subscribeAccountEvents, syncAccountEventStream } from '@/store/accountEvents.js'

let stopWatch = null
let stopEventPrompt = null
let monitorPromptPending = false
const MONITOR_DISMISSED_KEY = 'yuanhub:operator-monitor-prompt-dismissed:v1'
const router = useRouter()
const route = useRoute()

function resetMonitorPromptForFreshNavigation() {
  try {
    const navigation = performance.getEntriesByType('navigation')[0]
    // 新 tab / 新窗口通常是 navigate；同一 tab 刷新是 reload，应继续保留本次选择。
    if (navigation && navigation.type === 'navigate') sessionStorage.removeItem(MONITOR_DISMISSED_KEY)
  } catch (_) { /* performance/sessionStorage may be unavailable */ }
}

function monitorPromptDismissed() {
  try {
    return sessionStorage.getItem(MONITOR_DISMISSED_KEY) === '1'
  } catch (_) {
    return false
  }
}

function dismissMonitorPromptForSession() {
  try { sessionStorage.setItem(MONITOR_DISMISSED_KEY, '1') } catch (_) { /* sessionStorage may be unavailable */ }
}

function isMonitorableAccountEvent(message) {
  if (!message || message.data && message.data.preview) return false
  if (message.event !== 'operator_scan_import') return false
  const status = message.data && message.data.status
  return status === 'accepted' || status === 'partial'
}

async function promptOperatorMonitor(message) {
  if (!isMonitorableAccountEvent(message) || route.path === '/operator' || monitorPromptPending || monitorPromptDismissed() || dialog._state.visible) return
  monitorPromptPending = true
  try {
    const shouldGo = await dialog.confirm({
      title: '发现数据更新',
      message: 'MaaYuan正在为殿下吭哧吭哧地录入密探数据，是否前往密探图鉴实时监工？选择“不跳转”后，本窗口后续更新将不再自动询问。',
      confirmText: '去密探图鉴',
      cancelText: '本次不跳转',
      type: 'info'
    })
    if (!shouldGo) {
      dismissMonitorPromptForSession()
      return
    }
    await router.push('/operator')
  } finally {
    monitorPromptPending = false
  }
}

onMounted(function () {
  resetMonitorPromptForFreshNavigation()
  stopWatch = watch(
    function () { return [auth.accessToken, activeAccount.id] },
    syncAccountEventStream,
    { immediate: true }
  )
  stopEventPrompt = subscribeAccountEvents(promptOperatorMonitor)
})

onBeforeUnmount(function () {
  if (stopWatch) stopWatch()
  if (stopEventPrompt) stopEventPrompt()
  stopAccountEventStream()
})
</script>
