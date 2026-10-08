<template>
  <Transition name="pwa-install">
    <aside v-if="visible" ref="panel" class="pwa-install-prompt" role="region" aria-label="添加 YuanHub 到桌面">
      <div class="pwa-install-card">
        <div class="pwa-install-exit"><button ref="exitButton" class="pwa-install-secondary pwa-install-close" type="button" @click="closePrompt">{{ pwaInstallState.guideActive ? '关闭教程 / 退出引导' : '直接使用 / 暂时关闭' }}</button></div>
        <div class="pwa-install-main">
          <img src="/pwa/icon-192.png" alt="" width="52" height="52" />
          <div>
            <p class="pwa-install-title">把 YuanHub 放到桌面</p>
            <p class="pwa-install-copy">可以跟着完成真实安装，也可以继续使用网页版。</p>
          </div>
        </div>
        <div v-if="pwaInstallState.guideActive" class="pwa-install-guide" aria-live="polite">
          <p v-if="pwaInstallState.requesting">正在打开系统安装提示。你仍可关闭教程。</p>
          <p v-else-if="pwaInstallState.phase === 'waiting-for-install'">正在等待系统完成安装。请从桌面图标打开 YuanHub；系统同意安装还不代表安装完成。</p>
          <p v-else-if="pwaInstallState.phase === 'dismissed'">本次系统安装提示已取消。可以重试，也可以关闭教程。</p>
          <p v-else-if="pwaInstallState.phase === 'failed'">系统安装调用失败。可打开安装任务页排查并重试。</p>
          <p v-else-if="pwaInstallState.installable">点击“立即添加到桌面”，在真实系统提示中选择是否安装。</p>
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
.pwa-install-prompt {
  position: fixed;
  z-index: var(--z-popover);
  right: 12px;
  bottom: max(12px, env(safe-area-inset-bottom));
  left: 12px;
  pointer-events: none;
}
.pwa-install-card {
  position: relative;
  width: min(520px, 100%);
  margin: 0 auto;
  max-height: calc(60dvh - env(safe-area-inset-bottom));
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: rgba(255, 253, 246, .98);
  box-shadow: 0 18px 48px rgba(73, 59, 44, .22);
  pointer-events: auto;
  backdrop-filter: blur(14px);
}
.pwa-install-card::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--yellow-deep), var(--accent), transparent 82%);
  content: '';
}
.pwa-install-main {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 17px;
}
.pwa-install-main img {
  width: 52px;
  height: 52px;
  flex: none;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--paper);
}
.pwa-install-title {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 17px;
  font-weight: 900;
  letter-spacing: .035em;
}
.pwa-install-copy {
  margin: 5px 0 0;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
}
.pwa-install-exit { position: sticky; top: 0; z-index: 2; padding: 8px 12px; background: var(--surface); border-bottom: 1px solid var(--line); }
.pwa-install-close { width: 100%; }
.pwa-install-guide {
  margin: 0 16px 12px;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
}
.pwa-install-guide p { margin: 0; color: var(--ink); font-size: 13px; line-height: 1.65; }
.pwa-install-task-link { display: block; padding: 12px 16px; min-height: 48px; color: var(--ink); }
.pwa-install-card :focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
.pwa-install-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 11px 16px 14px;
  border-top: 1px solid var(--line);
  background: rgba(246, 237, 208, .35);
}
.pwa-install-primary,
.pwa-install-secondary {
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: 999px;
  font-family: var(--font-b);
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}
.pwa-install-primary {
  border: 1px solid var(--tea);
  background: var(--tea);
  color: var(--cream);
}
.pwa-install-primary:hover:not(:disabled) { border-color: var(--accent); background: var(--accent); }
.pwa-install-primary:disabled { opacity: .55; cursor: wait; }
.pwa-install-secondary {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
}
.pwa-install-secondary:hover { border-color: var(--accent); color: var(--accent-strong); }
.pwa-install-enter-active,
.pwa-install-leave-active { transition: opacity .25s var(--ease), transform .25s var(--ease); }
.pwa-install-enter-from,
.pwa-install-leave-to { opacity: 0; transform: translateY(14px); }
.pwa-install-leave-active .pwa-install-card { pointer-events: none; }

@media (max-width: 420px) {
  .pwa-install-prompt { right: 8px; left: 8px; bottom: max(8px, env(safe-area-inset-bottom)); }
  .pwa-install-card { border-radius: 16px; }
  .pwa-install-main { padding: 15px 14px; }
  .pwa-install-main img { width: 48px; height: 48px; }
  .pwa-install-title { font-size: 15.5px; }
  .pwa-install-copy { font-size: 11.5px; }
  .pwa-install-actions { padding: 10px 13px 12px; }
  .pwa-install-primary,.pwa-install-secondary { min-height: 48px; padding-inline: 12px; font-size: 11.5px; }
}

@media (prefers-reduced-motion: reduce) {
  .pwa-install-enter-active,.pwa-install-leave-active { transition: none; }
}

@media (orientation: landscape) and (max-height: 520px) {
  .pwa-install-copy { display: none; }
  .pwa-install-main { padding-block: 11px; }
  .pwa-install-actions { padding-block: 8px; }
}
</style>
