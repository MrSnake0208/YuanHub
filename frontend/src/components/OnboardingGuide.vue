<template>
    <Teleport :to="outlet || 'body'" :disabled="!outlet">
      <aside v-if="visible" ref="region" class="tutorial-guide" :aria-labelledby="titleId">
        <div class="tutorial-heading">
          <h2 :id="titleId" tabindex="-1">{{ title }}</h2>
          <button type="button" class="tutorial-exit" @click="close">关闭教程</button>
        </div>
        <template v-if="store.panel === 'result'">
          <p role="status">{{ ONBOARDING_TASKS[store.tutorialTask]?.result }}<template v-if="store.tutorialTask === 'maayuan-first-sync'">，库存已同步到「{{ tutorialBusiness.accountName || store.maaYuan.accountId }}」。</template></p>
          <div class="tutorial-actions">
            <router-link v-if="store.tutorialTask === 'operator-first-entry'" to="/operator?tab=current" @click="close">看看养成总览</router-link>
            <button v-if="store.tutorialTask === 'operator-first-entry'" type="button" @click="close">继续录入</button>
            <router-link v-else-if="store.tutorialTask === 'maayuan-first-sync'" to="/inventory" @click="close">查看库存（选择上方同步账号）</router-link>
            <button v-else-if="['today-first-data', 'inventory-first-baseline'].includes(store.tutorialTask)" type="button" @click="close">继续使用</button>
            <router-link v-else to="/operator" @click="close">去录入密探</router-link>
          </div>
          <p v-if="store.tutorialTask === 'operator-first-entry'" class="tutorial-note">可在养成总览核对并更新已有密探，无需重复录入。</p>
          <p v-else-if="store.tutorialTask === 'inventory-first-baseline'" class="tutorial-note">已有盘点无需重做；库存变化时，点击「更新库存」核对并保存。</p>
          <p v-else-if="store.tutorialTask === 'maayuan-first-sync'" class="tutorial-note">继续用现有连接同步库存，无需重新创建连接码。</p>
          <p v-else-if="store.tutorialTask === 'account-create'" class="tutorial-note">可在「管理游戏账号」核对名称与游戏，无需重复创建。</p>
        </template>
        <template v-else>
          <p aria-live="polite" aria-atomic="true">{{ instruction }}</p>
          <p v-if="store.waitingFor === 'read_error'" class="tutorial-error" role="alert">{{ tutorialBusiness.error }}</p>
          <div v-if="store.waitingFor === 'first_task'" class="tutorial-actions">
            <button v-for="(task, id) in FIRST_DATA_TASKS" :key="id" type="button" @click="chooseFirstData(id)">{{ task.title }}</button>
          </div>
          <div v-if="destination || store.waitingFor === 'read_error'" class="tutorial-actions">
            <router-link v-if="destination" :to="destination.to">{{ destination.label }}</router-link>
            <button v-if="store.waitingFor === 'read_error'" type="button" @click="refreshTutorialBusiness">重新读取资料</button>
          </div>
          <template v-if="store.tutorialTask === 'maayuan-first-sync' && store.waitingFor === 'maa_sync'">
            <p class="tutorial-note">请在 MaaYuan 运行一次库存任务，再返回检查同步结果。仅完成连接设置不代表已同步。</p>
            <button type="button" @click="refreshTutorialBusiness">我已返回，检查同步</button>
          </template>
        </template>
      </aside>
    </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOnboardingStore } from '@/stores/onboarding.js'
import { modalFocusState } from '@/composables/useModalFocus.js'
import { ONBOARDING_TASKS, FIRST_DATA_TASKS, isTutorialTaskRoute } from '@/utils/onboardingTasks.js'
import { destroyOnboardingTour, refreshTutorialBusiness, tutorialBusiness } from '@/utils/onboardingTour.js'
import { TUTORIALS_ENABLED } from '@/config/features.js'

const props = defineProps({ tasks: { type: Array, required: true }, target: { type: [String, Object], default: null } })
const store = useOnboardingStore(), route = useRoute(), router = useRouter()
const region = ref(null), outlet = shallowRef(null), titleId = useId()
let opener = null, modalOutlet = null
const relatedModal = computed(() => modalFocusState.panel?.matches('.account-panel, .dialog'))
const visible = computed(() => TUTORIALS_ENABLED && props.tasks.includes(store.tutorialTask) && ['task', 'result'].includes(store.panel) &&
  isTutorialTaskRoute(store.tutorialTask, store.firstDataTask, route.path) &&
  (!modalFocusState.active || relatedModal.value))
const title = computed(() => ONBOARDING_TASKS[store.tutorialTask]?.title)
const instruction = computed(() => ({
  login: '先登录 YuanHub，返回后继续。',
  business_state: '正在读取账号资料，随时可以退出。',
  read_error: '资料读取失败，请按错误提示处理，或稍后重试。',
  account_created: '点击「创建游戏账号」，填写名称并选择游戏。',
  account_selected: '你已有游戏账号，请在页面账号选择器中选择要录入的账号。',
  first_task: '账号已就绪，选择一项需要录入的资料即可开始。',
  inventory_saved: '点击「开始首次盘点」或「更新库存」，核对全部道具数量，确认完整盘点并保存。首次盘点需要完整录入，局部录入不能完成此步骤。',
  star_saved: '导入星石游戏截图，核对并保存到当前账号，再返回「今日一览」查看保存结果。',
  today_return: '资料已读取，返回「今日一览」确认保存结果。',
  maa_connect: '点击「连接 MaaYuan」。',
  maa_account: '选择要保存库存的游戏账号。',
  maa_create: '核对账号与权限，再点击「创建 MaaYuan 连接码」。',
  maa_copy: '连接码已就绪。点击「复制连接码」，继续设置同步。',
  maa_sync: '现在去 MaaYuan：打开「百宝箱 · 自动识别背包」，开启「同步至 YuanHub」，粘贴刚复制的连接码，运行一次任务。完成后返回 YuanHub 检查同步结果。',
  operator_saved: route.path === '/operator/quick'
    ? '勾选一位密探，按游戏实际情况填写星级、等级与修为，核对预览并确认保存。'
    : '在密探名册点击「开始录入密探」，录入一位你实际拥有的密探。'
}[store.waitingFor] || '请选择需要录入的资料。'))
const destination = computed(() => {
  if (store.waitingFor === 'login') return { to: { path: '/login', query: { redirect: ONBOARDING_TASKS[store.tutorialTask].route } }, label: '去登录' }
  if (store.waitingFor === 'today_return') return { to: '/', label: '返回今日一览查看结果' }
  if (store.tutorialTask === 'maayuan-first-sync' && route.path !== '/user/profile' && store.waitingFor !== 'login') return { to: '/user/profile#maayuan-app-title', label: '返回 MaaYuan 连接' }
  if (store.waitingFor === 'account_created' && route.path !== '/user/profile') return { to: '/user/profile#game-accounts', label: '去创建游戏账号' }
  if (store.waitingFor === 'account_selected') {
    const target = store.tutorialTask === 'today-first-data' ? FIRST_DATA_TASKS[store.firstDataTask]?.route || '/' : ONBOARDING_TASKS[store.tutorialTask].route.split('#')[0]
    if (route.path !== target) return { to: target, label: '返回任务页面选择游戏账号' }
  }
  if (store.waitingFor === 'operator_saved' && !['/operator', '/operator/quick'].includes(route.path)) return { to: '/operator', label: '返回密探名册' }
  if (store.waitingFor === 'inventory_saved' && route.path !== '/inventory') return { to: '/inventory', label: '去库存完成盘点' }
  if (store.waitingFor === 'star_saved' && route.path !== '/star') return { to: '/star', label: '去识别游戏截图' }
  return null
})

function moveOutlet() {
  const panel = visible.value && relatedModal.value ? modalFocusState.panel : null
  const previous = modalOutlet
  if (panel && previous?.parentElement === panel) return
  modalOutlet = null
  if (panel) {
    modalOutlet = document.createElement('div')
    modalOutlet.className = 'tutorial-modal-outlet'
    panel.prepend(modalOutlet)
  }
  let target = null
  if (visible.value && props.target) target = typeof props.target === 'string' ? document.querySelector(props.target) : props.target
  outlet.value = modalOutlet || target
  void nextTick(() => previous?.remove())
}
if (TUTORIALS_ENABLED) {
  watch(() => [modalFocusState.panel, visible.value, props.target], moveOutlet, { flush: 'post' })
  watch(() => store.panel, async panel => {
    if (panel === 'task' && visible.value) {
      opener = document.activeElement
      await nextTick()
      region.value?.querySelector('h2')?.focus({ preventScroll: true })
    }
  })
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
function chooseFirstData(taskId) {
  if (store.chooseFirstData(taskId)) void router.push(FIRST_DATA_TASKS[taskId].route)
}

onMounted(() => {
  if (!TUTORIALS_ENABLED) return
  window.addEventListener('keydown', onEscape, true)
  moveOutlet()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape, true)
  modalOutlet?.remove()
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.tutorial-guide { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); }
.tutorial-guide button, .tutorial-actions a { border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--theme-strong-text, var(--tea)); cursor: pointer; text-decoration: none; }
.tutorial-note { color: var(--ink-60); }
.tutorial-error { color: var(--theme-danger-text, var(--rouge)); }
.tutorial-guide :focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: -2px; }
</style>
<style scoped src="./onboardingGuideDesktop.css"></style>
<style scoped src="./onboardingGuideMobile.css"></style>
