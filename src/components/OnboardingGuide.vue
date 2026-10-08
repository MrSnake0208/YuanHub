<template>
  <div ref="globalHost" class="tutorial-global">
    <Teleport :to="outlet || 'body'" :disabled="!outlet">
      <aside v-if="visible" ref="region" class="tutorial-guide" aria-label="实操教程">
        <div class="tutorial-heading">
          <h2 id="tutorial-title" tabindex="-1">{{ title }}</h2>
          <button type="button" class="tutorial-exit" @click="close">{{ store.active ? '退出引导' : '关闭教程' }}</button>
        </div>
        <template v-if="store.panel === 'invitation'">
          <p>想先学会哪件事？可以跟着完成一次真实操作，也可以直接使用。</p>
          <div class="tutorial-actions">
            <button type="button" @click="store.openTasks()">跟着做一次</button>
            <button type="button" @click="close">直接使用 / 暂时关闭</button>
          </div>
          <label class="tutorial-preference"><input v-model="disableAuto" type="checkbox" @change="savePreference" />以后不自动提示</label>
        </template>
        <template v-else-if="store.panel === 'tasks'">
          <p>选择现在要做的事；已有账号和密探无需重复录入。</p>
          <div class="tutorial-actions">
            <button v-if="store.tutorialTask && !store.tutorialCompleted" type="button" @click="start(store.tutorialTask)">继续实操教程：{{ ONBOARDING_TASKS[store.tutorialTask]?.title }}</button>
            <button v-for="(task, id) in ONBOARDING_TASKS" :key="id" type="button" @click="start(id)">{{ task.title }}</button>
          </div>
          <p class="tutorial-note">库存盘点与星石识别，可从对应页面使用。</p>
          <label class="tutorial-preference"><input v-model="disableAuto" type="checkbox" @change="savePreference" />以后不自动提示</label>
        </template>
        <template v-else-if="store.panel === 'result'">
          <p role="status">{{ ONBOARDING_TASKS[store.tutorialTask]?.result }}<template v-if="store.tutorialTask === 'maayuan-first-sync'">，库存已同步到「{{ tutorialBusiness.accountName || store.maaYuan.accountId }}」。</template></p>
          <div class="tutorial-actions">
            <router-link v-if="store.tutorialTask === 'operator-first-entry'" to="/operator?tab=current" @click="close">看看养成总览</router-link>
            <button v-if="store.tutorialTask === 'operator-first-entry'" type="button" @click="close">继续录入</button>
            <router-link v-else-if="store.tutorialTask === 'maayuan-first-sync'" to="/inventory" @click="close">查看库存（选择上方同步账号）</router-link>
            <router-link v-else to="/operator" @click="close">去录入密探</router-link>
          </div>
        </template>
        <template v-else>
          <p aria-live="polite" aria-atomic="true">{{ instruction }}</p>
          <p v-if="store.waitingFor === 'read_error'" class="tutorial-error" role="alert">{{ tutorialBusiness.error }}</p>
          <div v-if="destination || store.waitingFor === 'read_error'" class="tutorial-actions">
            <router-link v-if="destination" :to="destination.to">{{ destination.label }}</router-link>
            <button v-if="store.waitingFor === 'read_error'" type="button" @click="refreshTutorialBusiness">重新读取真实状态</button>
          </div>
          <template v-if="store.tutorialTask === 'maayuan-first-sync' && store.waitingFor === 'maa_sync'">
            <p class="tutorial-note">无法直接观察 MaaYuan 设置；等待这条连接的真实库存记录，返回、刷新或跨页后会重新检查。</p>
            <button type="button" @click="refreshTutorialBusiness">我已返回，检查真实同步</button>
          </template>
          <button type="button" class="tutorial-back" @click="store.openTasks()">返回任务选择</button>
        </template>
      </aside>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOnboardingStore } from '@/stores/onboarding.js'
import { modalFocusState } from '@/composables/useModalFocus.js'
import { ONBOARDING_TASKS } from '@/utils/onboardingTasks.js'
import { destroyOnboardingTour, refreshTutorialBusiness, startOnboardingTask, tutorialBusiness } from '@/utils/onboardingTour.js'

const props = defineProps({ recommendationAllowed: { type: Boolean, default: true } })
const store = useOnboardingStore(), route = useRoute(), router = useRouter()
const globalHost = ref(null), region = ref(null), outlet = shallowRef(null), disableAuto = ref(false)
let opener = null, resizeObserver = null
const visible = computed(() => store.visible && (store.panel !== 'invitation' ||
  (props.recommendationAllowed && route.name === 'today' && !modalFocusState.active)))
const title = computed(() => ['invitation', 'tasks'].includes(store.panel) ? '开始使用 / 实操教程' : ONBOARDING_TASKS[store.tutorialTask]?.title)
const instruction = computed(() => ({
  login: '先登录真实账号，返回后继续实操。',
  business_state: '正在读取真实业务状态；随时可以退出。',
  read_error: '读取失败，暂不能确认成果。请处理真实错误或稍后继续。',
  account_created: '点击真实「创建游戏账号」，填写名称、选择游戏并创建。',
  account_selected: '你已有游戏账号，请在页面账号选择器中选择要录入的账号。',
  maa_connect: '点击页面真实「连接 MaaYuan」按钮。',
  maa_account: '在高亮的游戏账号选择器中，选择要保存库存的真实账号。',
  maa_create: '核对所选账号与权限，再点击真实「创建 MaaYuan 连接码」。',
  maa_copy: '连接码已就绪，还没确认同步。点击这条连接的真实「复制连接码」。',
  maa_sync: '现在去 MaaYuan：打开「百宝箱 · 自动识别背包」，开启「同步至 YuanHub」，粘贴刚复制的连接码，运行一次任务。YuanHub 正在等待第一次真实库存同步。',
  operator_saved: route.path === '/operator/quick'
    ? '勾选一位真实密探，按游戏实际情况填写星级、等级与修为，核对预览并确认保存。'
    : '在密探名册点击「开始录入密探」，录入一位你实际拥有的密探。'
}[store.waitingFor] || '请选择要完成的真实任务。'))
const destination = computed(() => {
  if (store.waitingFor === 'login') return { to: { path: '/login', query: { redirect: ONBOARDING_TASKS[store.tutorialTask].route } }, label: '去登录' }
  if (store.tutorialTask === 'maayuan-first-sync' && route.path !== '/user/profile' && store.waitingFor !== 'login') return { to: '/user/profile#maayuan-app-title', label: '返回 MaaYuan 连接' }
  if (store.waitingFor === 'account_created' && route.path !== '/user/profile') return { to: '/user/profile#game-accounts', label: '去创建游戏账号' }
  if (['account_selected', 'operator_saved'].includes(store.waitingFor) && !['/operator', '/operator/quick'].includes(route.path)) return { to: '/operator', label: '返回密探名册' }
  return null
})

function updateHeight() {
  const height = visible.value && !outlet.value ? globalHost.value?.getBoundingClientRect().height || 0 : 0
  document.documentElement.style.setProperty('--tutorial-height', `${height}px`)
}
function moveOutlet(panel) {
  const previous = outlet.value
  outlet.value = null
  if (panel && visible.value) {
    const target = document.createElement('div')
    target.className = 'tutorial-modal-outlet'
    panel.prepend(target)
    outlet.value = target
  }
  void nextTick(() => { previous?.remove(); updateHeight() })
}
watch(() => [modalFocusState.panel, visible.value], ([panel]) => moveOutlet(panel), { flush: 'post' })
watch(() => store.panel, async panel => {
  if (panel === 'tasks') {
    opener = document.activeElement
    await nextTick()
    region.value?.querySelector('h2')?.focus({ preventScroll: true })
  }
})
watch(visible, () => { void nextTick(updateHeight) })
watch(() => [store.ownerId, visible.value], () => { disableAuto.value = store.disableAutoGuide }, { immediate: true })

function savePreference() {
  store.disableAutoGuide = disableAuto.value
  store.persist()
}

function close() {
  const restore = region.value?.contains(document.activeElement)
  const panel = modalFocusState.panel
  destroyOnboardingTour()
  if (restore) void nextTick(() => {
    // Exit teaching without closing a dialog or clearing its draft.
    const target = panel?.isConnected ? panel.querySelector('input:not(:disabled), button:not(:disabled), [tabindex="0"]') || panel
      : opener?.isConnected ? opener : document.querySelector('main')
    if (target) { if (target.tabIndex < 0) target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }) }
  })
}
function onEscape(event) {
  if (event.key !== 'Escape' || !visible.value) return
  event.preventDefault()
  event.stopImmediatePropagation()
  close()
}
function start(taskId) { void startOnboardingTask(router, taskId) }

onMounted(() => {
  window.addEventListener('keydown', onEscape, true)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(globalHost.value)
  }
  moveOutlet(modalFocusState.panel)
  updateHeight()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape, true)
  resizeObserver?.disconnect()
  outlet.value?.remove()
  document.documentElement.style.removeProperty('--tutorial-height')
})
</script>

<style scoped>
.tutorial-global { position: sticky; top: 0; z-index: var(--z-banner); }
.tutorial-guide { padding: 8px max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left)); border-bottom: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 14px/1.5 var(--font-b); overflow-wrap: anywhere; }
.tutorial-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tutorial-heading h2 { margin: 0; min-width: 0; font-size: 16px; }
.tutorial-guide p { margin: 4px 0; }
.tutorial-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.tutorial-guide button, .tutorial-actions a { min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--tea); font: inherit; cursor: pointer; text-decoration: none; }
.tutorial-exit { flex-shrink: 0; }
.tutorial-preference { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; }
.tutorial-preference input { width: 20px; height: 20px; }
.tutorial-guide .tutorial-back { min-height: 44px; padding: 4px 8px; border: 0; background: transparent; font-size: 12px; }
.tutorial-note { color: var(--ink-60); font-size: 12px; }
.tutorial-error { color: var(--rouge); }
.tutorial-guide :focus-visible { outline: 2px solid var(--tea); outline-offset: -2px; }
@media (min-width: 1081px) { .tutorial-global > .tutorial-guide { padding-inline: max(24px, calc((100vw - 960px) / 2)); } }
@media (max-height: 450px) { .tutorial-guide { font-size: 12px; } .tutorial-guide p { margin-block: 2px; } }
</style>
