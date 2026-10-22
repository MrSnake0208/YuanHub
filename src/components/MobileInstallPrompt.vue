<template>
  <Transition name="pwa-install">
    <aside v-if="visible" ref="panel" class="pwa-install-prompt" role="region" aria-label="添加 YuanHub 到桌面">
      <div class="pwa-install-card">
        <div class="pwa-install-exit"><button ref="exitButton" class="pwa-install-secondary pwa-install-close" type="button" @click="closePrompt">{{ pwaInstallState.guideActive ? '关闭教程' : '暂时关闭' }}</button></div>
        <div class="pwa-install-main">
          <img src="/pwa/icon-192.png" alt="" width="52" height="52" />
          <div>
            <p class="pwa-install-title">把 YuanHub 放到桌面</p>
            <p class="pwa-install-copy">可以添加到桌面，也可以继续使用网页版。</p>
          </div>
        </div>
        <div v-if="pwaInstallState.guideActive" class="pwa-install-guide" aria-live="polite">
          <p v-if="pwaInstallState.requesting">正在打开系统安装提示。你仍可关闭教程。</p>
          <p v-else-if="pwaInstallState.phase === 'waiting-for-install'">正在等待安装完成。请从桌面图标打开 YuanHub，确认安装状态。</p>
          <p v-else-if="pwaInstallState.phase === 'dismissed'">本次系统安装提示已取消。可以重试，也可以关闭教程。</p>
          <p v-else-if="pwaInstallState.phase === 'failed'">系统安装调用失败。可打开安装任务页排查并重试。</p>
          <p v-else-if="pwaInstallState.installable">点击“立即添加到桌面”，在系统提示中选择是否安装。</p>
          <p v-else>{{ getPwaInstallGuidance() }}</p>
        </div>
        <div class="pwa-install-actions">
          <button v-if="!pwaInstallState.guideActive" class="pwa-install-primary" type="button" @click="beginGuide">跟着做一次</button>
          <button v-else-if="pwaInstallState.installable || pwaInstallState.requesting" ref="installButton" class="pwa-install-primary" type="button" :disabled="pwaInstallState.requesting" @click="requestPwaInstall">
            <Download :size="16" aria-hidden="true" />{{ pwaInstallState.requesting ? '正在打开…' : '立即添加到桌面' }}
          </button>
          <router-link v-else class="pwa-install-primary" to="/install">继续实操教程</router-link>
          <button class="pwa-install-secondary" type="button" @click="closePrompt(true)">以后不自动提示</button>
        </div>
        <router-link v-if="pwaInstallState.guideActive && pwaInstallState.installable" class="pwa-install-task-link" to="/install">打开安装任务页</router-link>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Download } from '@lucide/vue'
import { dialog } from '@/utils/dialog.js'
import { useOnboardingStore } from '@/stores/onboarding.js'
import { modalFocusState } from '@/composables/useModalFocus.js'
import { betaCommunity } from '@/store/betaCommunity.js'
import { closePwaInstallGuide, getPwaInstallGuidance, pwaInstallState, requestPwaInstall, shouldShowPwaInstallPrompt, startPwaInstallGuide } from '@/utils/pwaInstall.js'

const props = defineProps({
  routeLoading: { type: Boolean, default: false },
  accessPending: { type: Boolean, default: false }
})
const route = useRoute()
const onboarding = useOnboardingStore()
const ready = ref(false)
const panel = ref(null)
const installButton = ref(null)
const exitButton = ref(null)
let previousFocus = null
let revealTimer = null
let navigationObserver = null
const navigationOpen = ref(false)
const allowedRoutes = new Set(['today', 'changelog', 'feedback-plaza'])
const eligible = computed(() => allowedRoutes.has(route.name)
  && (pwaInstallState.guideActive || (!props.routeLoading && !props.accessPending)) && !navigationOpen.value
  && !modalFocusState.active && !betaCommunity.visible
  && !dialog._state.visible && !onboarding.visible)
const visible = computed(() => eligible.value && ready.value
  && (pwaInstallState.guideActive || shouldShowPwaInstallPrompt()))

watch(() => [route.fullPath, eligible.value], () => {
  window.clearTimeout(revealTimer)
  ready.value = false
  if (eligible.value) revealTimer = window.setTimeout(() => { revealTimer = null; ready.value = true }, 1800)
}, { immediate: true, flush: 'sync' })
watch(() => route.fullPath, (path, previous) => {
  if (previous && path !== previous && path !== '/install' && pwaInstallState.guideActive) closePrompt()
})
watch(() => navigationOpen.value || modalFocusState.active || betaCommunity.visible || dialog._state.visible || onboarding.visible, blocked => {
  if (blocked && pwaInstallState.guideActive) closePrompt()
})
watch(visible, value => {
  if (value) previousFocus = document.activeElement
  else if (panel.value?.contains(document.activeElement) && previousFocus?.isConnected) previousFocus.focus()
})

watch(() => pwaInstallState.requesting, async requesting => {
  const moveFocus = !requesting && document.activeElement === installButton.value && pwaInstallState.guideActive
  if (!moveFocus) return
  await nextTick()
  exitButton.value?.focus()
})
async function beginGuide() {
  startPwaInstallGuide()
  await nextTick()
  installButton.value?.focus()
}
function closePrompt(disableAutoGuide = false) {
  const restoreFocus = panel.value?.contains(document.activeElement)
  closePwaInstallGuide({ disableAutoGuide: disableAutoGuide === true })
  ready.value = false
  if (restoreFocus && previousFocus?.isConnected) previousFocus.focus()
}
function onEscape(event) {
  if (event.key === 'Escape' && visible.value && !modalFocusState.active) closePrompt()
}
onMounted(() => {
  const syncNavigation = () => { navigationOpen.value = document.body.classList.contains('mobile-nav-open') }
  syncNavigation()
  navigationObserver = new MutationObserver(syncNavigation)
  navigationObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  window.addEventListener('keydown', onEscape)
})
onBeforeUnmount(() => {
  window.clearTimeout(revealTimer)
  navigationObserver?.disconnect()
  window.removeEventListener('keydown', onEscape)
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.pwa-install-prompt {
  pointer-events: none;
}
.pwa-install-card {
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--theme-surface, rgba(255, 253, 246, .98));
  box-shadow: 0 18px 48px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.22);
  pointer-events: auto;
  backdrop-filter: blur(14px);
}
.pwa-install-card::before {
  background: linear-gradient(90deg, var(--yellow-deep), var(--accent), transparent 82%);
  content: '';
}
.pwa-install-main img {
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--paper);
}
.pwa-install-title {
  color: var(--ink);
}
.pwa-install-copy {
  color: var(--ink-60);
}
.pwa-install-exit { background: var(--surface); border-bottom: 1px solid var(--line); }
.pwa-install-guide {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
}
.pwa-install-guide p { color: var(--ink); }
.pwa-install-task-link { color: var(--ink); }
.pwa-install-card :focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: -3px; }
.pwa-install-actions {
  border-top: 1px solid var(--line);
  background: var(--theme-wash-strong, rgba(246, 237, 208, .35));
}
.pwa-install-primary,
.pwa-install-secondary {
  border-radius: 999px;
  text-decoration: none;
  cursor: pointer;
}
.pwa-install-primary {
  border: 1px solid var(--tea);
  background: var(--tea);
  color: var(--on-strong);
}
.pwa-install-primary:hover:not(:disabled) { border-color: var(--accent); background: var(--accent); }
.pwa-install-primary:disabled { opacity: .55; cursor: wait; }
.pwa-install-secondary {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
}
.pwa-install-secondary:hover { border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); }
.pwa-install-enter-active,
.pwa-install-leave-active { transition: opacity .25s var(--ease), transform .25s var(--ease); }
.pwa-install-enter-from,
.pwa-install-leave-to { opacity: 0; }
.pwa-install-leave-active .pwa-install-card { pointer-events: none; }

@media (max-width: 420px) {
  .pwa-install-card { border-radius: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .pwa-install-enter-active,.pwa-install-leave-active { transition: none; }
}
</style>
<style scoped src="./mobileInstallPromptDesktop.css"></style>
<style scoped src="./mobileInstallPromptMobile.css"></style>
