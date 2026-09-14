<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <Transition name="route-loader">
    <div
      v-if="routeLoadingState.active"
      class="route-loading"
      role="progressbar"
      aria-label="正在切换页面"
    >
      <span class="route-loading-bar" aria-hidden="true"></span>
    </div>
  </Transition>
  <RouterView v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <AccountEventToasts />
  <MobileInstallPrompt />
  <!-- 全站自定义弹窗（alert / confirm / choice / prompt），Teleport 到 body -->
  <AppDialog />
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppDialog from '@/components/AppDialog.vue'
import AccountEventToasts from '@/components/AccountEventToasts.vue'
import MobileInstallPrompt from '@/components/MobileInstallPrompt.vue'
import { auth } from '@/store/auth.js'
import { activeAccount } from '@/store/activeAccount.js'
import { dialog } from '@/utils/dialog.js'
import { stopAccountEventStream, subscribeAccountEvents, syncAccountEventStream } from '@/store/accountEvents.js'
import { routeLoadingState } from '@/router/index.js'
import { operatorUpdateFromEvent } from '@/utils/operatorEvents.js'
import { readActiveOperatorTab } from '@/utils/operatorTabs.js'

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

function isOperatorWorkspaceTab() {
  const activeTab = readActiveOperatorTab()
  return route.path === '/operator' && (activeTab === 'catalog' || activeTab === 'current')
}

async function promptOperatorMonitor(message) {
  const update = operatorUpdateFromEvent(message)
  if (!update || update.preview || isOperatorWorkspaceTab() || monitorPromptPending || monitorPromptDismissed() || dialog._state.visible) return
  monitorPromptPending = true
  try {
    const result = await dialog.choose({
      title: '收到密探更新',
      message: 'MaaYuan 已为殿下同步一位密探的资料。要现在查看更新吗？',
      choices: [
        { value: 'catalog', label: '去密探图鉴', description: '查看刚刚同步的密探资料', tone: 'primary' },
        { value: 'current', label: '去养成总览', description: '查看这位密探的养成状态', tone: 'secondary' },
        { value: 'stay', label: '暂不跳转', description: '继续留在当前页面', tone: 'quiet' }
      ],
      checkboxLabel: '本标签页内不再询问是否跳转',
      type: 'info'
    })
    if (result && result.checked) dismissMonitorPromptForSession()
    if (!result || (result.value !== 'catalog' && result.value !== 'current')) return
    await router.push({
      path: '/operator',
      query: {
        tab: result.value,
        focus: update.operatorId || undefined,
        effect: update.effect || undefined
      }
    })
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
