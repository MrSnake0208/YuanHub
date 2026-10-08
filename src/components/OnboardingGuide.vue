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
          <p v-if="store.tutorialTask === 'operator-first-entry'" class="tutorial-note">已有档案会直接复用。复习时在养成总览选择已有密探，核对并按实际变化编辑；无需再录入同一位。</p>
          <p v-else-if="store.tutorialTask === 'inventory-first-baseline'" class="tutorial-note">已有完整基准会直接复用。复习时点击「更新库存」，按现在的真实数量盘点并保存；无需创建重复记录。</p>
          <p v-else-if="store.tutorialTask === 'maayuan-first-sync'" class="tutorial-note">已有连接与同步成果会直接复用。以后继续用此连接同步有变化的真实库存，无需再创建连接码。</p>
          <p v-else-if="store.tutorialTask === 'account-create'" class="tutorial-note">已有账号会直接复用。复习时点击「管理游戏账号」，核对名称与游戏；无需再创建同一个账号。</p>
        </template>
        <template v-else>
          <p aria-live="polite" aria-atomic="true">{{ instruction }}</p>
          <p v-if="store.waitingFor === 'read_error'" class="tutorial-error" role="alert">{{ tutorialBusiness.error }}</p>
          <div v-if="store.waitingFor === 'first_task'" class="tutorial-actions">
            <button v-for="(task, id) in FIRST_DATA_TASKS" :key="id" type="button" @click="chooseFirstData(id)">{{ task.title }}</button>
          </div>
          <div v-if="destination || store.waitingFor === 'read_error'" class="tutorial-actions">
            <router-link v-if="destination" :to="destination.to">{{ destination.label }}</router-link>
            <button v-if="store.waitingFor === 'read_error'" type="button" @click="refreshTutorialBusiness">重新读取真实状态</button>
          </div>
          <template v-if="store.tutorialTask === 'maayuan-first-sync' && store.waitingFor === 'maa_sync'">
            <p class="tutorial-note">无法直接观察 MaaYuan 设置；等待这条连接的真实库存记录，返回、刷新或跨页后会重新检查。</p>
            <button type="button" @click="refreshTutorialBusiness">我已返回，检查真实同步</button>
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

const props = defineProps({ tasks: { type: Array, required: true }, target: { type: [String, Object], default: null } })
const store = useOnboardingStore(), route = useRoute(), router = useRouter()
const region = ref(null), outlet = shallowRef(null), titleId = useId()
let opener = null, modalOutlet = null
const relatedModal = computed(() => modalFocusState.panel?.matches('.account-panel, .dialog'))
const visible = computed(() => props.tasks.includes(store.tutorialTask) && ['task', 'result'].includes(store.panel) &&
  isTutorialTaskRoute(store.tutorialTask, store.firstDataTask, route.path) &&
  (!modalFocusState.active || relatedModal.value))
const title = computed(() => ONBOARDING_TASKS[store.tutorialTask]?.title)
const instruction = computed(() => ({
  login: '先登录真实账号，返回后继续实操。',
  business_state: '正在读取真实业务状态；随时可以退出。',
  read_error: '读取失败，暂不能确认成果。请处理真实错误或稍后继续。',
  account_created: '点击真实「创建游戏账号」，填写名称、选择游戏并创建。',
  account_selected: '你已有游戏账号，请在页面账号选择器中选择要录入的账号。',
  first_task: '账号已就绪。选择一项你现在需要的真实任务，建立第一份数据即可。',
  inventory_saved: '点击真实「开始首次盘点」或「更新库存」，核对全部道具的真实数量，确认完整盘点并保存。未保存或只有局部录入都不算完成。',
  star_saved: '在星石背包导入你的真实游戏截图，识别后核对并保存到当前账号；返回 Today 后验证云端保存结果。',
  today_return: '真实数据已读取。返回 Today 重新确认当前账号状态，即可完成首次建档。',
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
  if (store.waitingFor === 'today_return') return { to: '/', label: '返回 Today 验证第一份数据' }
  if (store.tutorialTask === 'maayuan-first-sync' && route.path !== '/user/profile' && store.waitingFor !== 'login') return { to: '/user/profile#maayuan-app-title', label: '返回 MaaYuan 连接' }
  if (store.waitingFor === 'account_created' && route.path !== '/user/profile') return { to: '/user/profile#game-accounts', label: '去创建游戏账号' }
  if (store.waitingFor === 'account_selected') {
    const target = store.tutorialTask === 'today-first-data' ? FIRST_DATA_TASKS[store.firstDataTask]?.route || '/' : ONBOARDING_TASKS[store.tutorialTask].route.split('#')[0]
    if (route.path !== target) return { to: target, label: '返回任务页面选择游戏账号' }
  }
  if (store.waitingFor === 'operator_saved' && !['/operator', '/operator/quick'].includes(route.path)) return { to: '/operator', label: '返回密探名册' }
  if (store.waitingFor === 'inventory_saved' && route.path !== '/inventory') return { to: '/inventory', label: '去库存完成盘点' }
  if (store.waitingFor === 'star_saved' && route.path !== '/star') return { to: '/star', label: '去识别真实截图' }
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
watch(() => [modalFocusState.panel, visible.value, props.target], moveOutlet, { flush: 'post' })
watch(() => store.panel, async panel => {
  if (panel === 'task' && visible.value) {
    opener = document.activeElement
    await nextTick()
    region.value?.querySelector('h2')?.focus({ preventScroll: true })
  }
})

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
  window.addEventListener('keydown', onEscape, true)
  moveOutlet()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape, true)
  modalOutlet?.remove()
})
</script>

<style scoped>
.tutorial-guide { min-width: 0; margin-block: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); font: 14px/1.5 var(--font-b); overflow-wrap: anywhere; }
.tutorial-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tutorial-heading h2 { margin: 0; min-width: 0; font-size: 16px; }
.tutorial-guide p { margin: 4px 0; }
.tutorial-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.tutorial-guide button, .tutorial-actions a { min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--tea); font: inherit; cursor: pointer; text-decoration: none; }
.tutorial-exit { flex-shrink: 0; }
.tutorial-note { color: var(--ink-60); font-size: 12px; }
.tutorial-error { color: var(--rouge); }
.tutorial-guide :focus-visible { outline: 2px solid var(--tea); outline-offset: -2px; }
@media (max-height: 450px) { .tutorial-guide { font-size: 12px; } .tutorial-guide p { margin-block: 2px; } }
</style>
