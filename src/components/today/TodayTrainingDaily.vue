<template>
  <Teleport :to="previewTarget || 'body'" :disabled="!previewTarget">
    <div v-if="previewTarget" class="daily-preview" :aria-busy="loading || saving">
      <header class="daily-heading"><h3>今日历练</h3><time :datetime="date">{{ dateLabel }}</time></header>
      <p v-if="loading && !snapshot" role="status">正在读取今日历练…</p>
      <div v-if="error" class="daily-error" role="alert"><p>{{ error }}</p><button v-if="!denied" type="button" :disabled="loading || saving" @click="load(true)">读取最新状态</button></div>
      <template v-if="snapshot">
        <p v-if="sourceMessage" class="daily-hint">{{ sourceMessage }}</p>
        <template v-if="sourceItems.length">
          <template v-if="!added || snapshot.needs_update">
            <ul class="daily-source-list">
              <li v-for="item in sourceItems" :key="item.id" class="daily-source-row">
                <span class="daily-item-name"><b>{{ item.name }}</b><span class="daily-stage">{{ item.stage }}</span><span class="daily-count">×{{ item.count }}</span></span>
                <strong class="daily-cost">−{{ item.count * item.cost_per }}</strong>
              </li>
            </ul>
            <p class="daily-total">共 <b>{{ totalCount }}</b> 次 · 预计消耗 <strong>{{ totalCost }}</strong> 体力</p>
          </template>
          <p v-else class="daily-summary">今日历练 <b>{{ totalCount }}</b> 次 · <strong>{{ totalCost }}</strong> 体力</p>
        </template>
        <p v-if="snapshot.needs_update" class="daily-warning">今日规划已变化，待办仍保留原安排。更新会保留已完成次数。</p>
        <button v-if="sourceItems.length || snapshot.needs_update || added" type="button" class="daily-adopt" :class="{ 'is-added': added && !snapshot.needs_update }" :disabled="locked || (!snapshot.needs_update && added) || snapshot.source.status !== 'ready'" @click="adopt">
          <Check v-if="added && !snapshot.needs_update" :size="18" aria-hidden="true" /><Plus v-else :size="18" aria-hidden="true" />
          {{ saving ? '正在保存…' : snapshot.needs_update ? '更新今日待办' : added ? '已加入今日待办' : '加入今日待办' }}
        </button>
      </template>
      <p v-if="notice" class="daily-notice" role="status">{{ notice }}</p>
      <p v-if="added && !showTodos" class="daily-hint">首页待办已隐藏，可在「自定义首页」中开启。</p>
      <router-link class="daily-details" :to="plannerTo">查看完整规划<ChevronRight :size="15" aria-hidden="true" /></router-link>
      <p v-if="snapshot?.source.status === 'ready'" class="daily-cloud"><Cloud :size="14" aria-hidden="true" />已保存到云端 · 北京时间 05:00 换日</p>
    </div>
  </Teleport>
  <Teleport :to="todosTarget || 'body'" :disabled="!todosTarget" defer>
    <section v-if="showTodos && (tasks.length || error && !previewTarget)" class="daily-todos" aria-labelledby="daily-todos-title" :aria-busy="loading || saving">
      <header class="daily-heading"><h2 id="daily-todos-title" ref="todoHeading" tabindex="-1"><ListChecks :size="19" aria-hidden="true" />今日待办</h2><span v-if="tasks.length" class="daily-progress" :aria-label="`已完成 ${completedTasks} 项，共 ${tasks.length} 项历练`">{{ completedTasks }}/{{ tasks.length }}</span></header>
      <h3>养成历练</h3><p class="daily-hint">{{ planName }} · {{ dateLabel }}</p>
      <div v-if="contextError" class="daily-error" role="alert"><p>{{ contextError }}</p><button type="button" @click="emit('retry-context')">重新读取养成信息</button></div>
      <p v-else-if="!contextReady" class="daily-hint" role="status">正在同步养成信息…</p>
      <p v-if="snapshot?.needs_update" class="daily-warning">规划已变化，以下仍是原待办，请核对后更新。</p>
      <div v-if="error" class="daily-error" role="alert"><p>{{ error }}</p><button v-if="!denied" type="button" :disabled="loading || saving" @click="load(true)">读取最新状态</button></div>
      <ul class="daily-task-list">
        <li v-for="task in tasks" :key="task.id" :class="{ 'is-completed': task.done }">
          <label class="daily-task-row">
            <input type="checkbox" :checked="task.done" :disabled="locked" :aria-label="`${task.name} ${task.stage} ×${task.displayCount}，${task.done ? '已完成' : '待完成'}`" @change="toggle(task, $event)" />
            <span class="daily-task-copy"><span class="daily-item-name"><b>{{ task.name }}</b><span class="daily-stage">{{ task.stage }}</span><span class="daily-count">×{{ task.displayCount }}</span></span>
              <small v-if="task.remaining">{{ task.completed_count ? `已完成 ${task.completed_count} 次，还需 ${task.remaining} 次 · ` : '' }}预计消耗 {{ task.remaining * task.cost_per }} 体力</small>
              <small v-else-if="task.count < task.completed_count">保留原方案已完成的 {{ task.completed_count }} 次</small>
            </span>
            <span v-if="task.done" class="daily-done">已完成</span>
          </label>
        </li>
      </ul>
      <p v-if="tasks.length" class="daily-total">{{ tasks.length === completedTasks ? '今日历练已全部完成' : `还有 ${tasks.length - completedTasks} 项历练待完成` }}</p>
      <p v-if="notice && !previewTarget" class="daily-notice" role="status">{{ notice }}</p>
      <p class="daily-footnote"><Info :size="14" aria-hidden="true" />勾选仅记录完成状态</p>
    </section>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, ChevronRight, Cloud, Info, ListChecks, Plus } from '@lucide/vue'
import { auth } from '../../store/auth.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'
import { getOperatorDailyTasks, adoptOperatorDailyTasks, completeOperatorDailyTask } from '../../api/operatorDailyTasks.js'
import { dailyTrainingStatus, decodeDailyTraining, trainingTaskView } from '../../data/todayTraining.js'
import { businessDate, nextBusinessDayStartIso } from '../../utils/businessDay.js'
import { dialog } from '../../utils/dialog.js'

const props = defineProps({ accountId: { type: String, required: true }, game: { type: String, default: '' }, planId: { type: String, required: true },
  planName: { type: String, default: '' }, contextReady: { type: Boolean, default: true }, contextError: { type: String, default: '' }, previewTarget: { default: null },
  todosTarget: { type: String, default: '' }, showTodos: { type: Boolean, default: true } })
const owner = computed(() => auth.isLoggedIn ? String(auth.userInfo?.id || '') : '')
const emit = defineEmits(['retry-context'])
const todoHeading = ref(null)
const date = ref(businessDate())
const key = computed(() => JSON.stringify([owner.value, props.accountId, props.game, props.planId, date.value]))
const dateLabel = computed(() => `${Number(date.value.slice(5, 7))}月${Number(date.value.slice(8, 10))}日`)
const plannerTo = { path: '/operator', query: { tab: 'tracking' } }
const snapshot = ref(null), loading = ref(false), saving = ref(false), error = ref(''), denied = ref(false), notice = ref(''), confirming = ref(false)
const sourceItems = computed(() => (snapshot.value?.source.items || []).map(trainingTaskView))
const tasks = computed(() => (snapshot.value?.tasks || []).map(trainingTaskView))
const totalCount = computed(() => sourceItems.value.reduce((sum, item) => sum + item.count, 0))
const totalCost = computed(() => sourceItems.value.reduce((sum, item) => sum + item.count * item.cost_per, 0))
const added = computed(() => (snapshot.value?.version || 0) > 0)
const completedTasks = computed(() => tasks.value.filter(task => task.done).length)
const sourceMessage = computed(() => dailyTrainingStatus[snapshot.value?.source.status] || (!sourceItems.value.length ? '今日无需刷取历练。' : ''))
const locked = computed(() => !owner.value || !props.contextReady || !snapshot.value || loading.value || saving.value || confirming.value || !!error.value || denied.value)
let generation = 0, alive = true, refreshTimer = null, dayTimer = null, unsubscribe = null, refreshAgain = false
const ticket = () => [generation, key.value]
const current = token => alive && token[0] === generation && token[1] === key.value && !!owner.value
function reject(errorValue) {
  denied.value = [401, 403].includes(errorValue?.status) || errorValue?.status === 404
  if (denied.value) snapshot.value = null
  error.value = denied.value ? '账号、清单或权限已失效，请刷新首页后重试。' : errorValue?.message || '历练待办暂时无法读取，请重试。'
}
async function load(explicit = false) {
  if (!owner.value || !props.accountId || !props.planId || !props.contextReady || denied.value || !alive) return
  if (loading.value || saving.value || confirming.value) { refreshAgain = true; return }
  if (error.value && !explicit) return
  const token = ticket(), account = props.accountId, plan = props.planId, day = date.value, user = owner.value
  loading.value = true
  try {
    const result = decodeDailyTraining(await getOperatorDailyTasks(account, plan, day, user), account, plan, day)
    if (!current(token)) return
    snapshot.value = result; error.value = ''
  } catch (err) { if (current(token)) reject(err) }
  finally { if (current(token)) { loading.value = false; if (refreshAgain) { refreshAgain = false; refresh() } } }
}
async function write(entry, completed) {
  if (locked.value) return
  const token = ticket(), account = props.accountId, plan = props.planId, day = date.value, user = owner.value
  const before = snapshot.value
  const focused = document.activeElement
  saving.value = true; notice.value = ''
  try {
    const raw = entry ? await completeOperatorDailyTask(account, plan, day, entry, { expected_version: before.version, completed }, user)
      : await adoptOperatorDailyTasks(account, plan, day, { expected_version: before.version, expected_schedule_revision: before.source.revision }, user)
    if (!current(token)) return
    const result = decodeDailyTraining(raw, account, plan, day)
    const task = result.tasks.find(task => task.id === entry)
    if (result.version < before.version || (entry ? completed ? !task || task.completed_count < task.count : task && task.completed_count !== 0
      : result.needs_update || result.version === 0)) throw new Error('保存结果需要确认，请读取最新状态后核对。')
    snapshot.value = result
    notice.value = entry ? completed ? '已标记完成' : '已取消完成' : before.version ? '已更新待办，完成次数已保留' : `已加入 ${result.tasks.length} 项历练待办`
    await nextTick()
    if (current(token) && (!entry || !focused?.isConnected)) {
      const target = todoHeading.value || props.previewTarget?.querySelector('.daily-details')
      target?.focus({ preventScroll: true })
      if (!entry && todoHeading.value) target?.scrollIntoView?.({ block: 'nearest' })
    }
  } catch (err) { if (current(token)) { reject(err); if (!denied.value) error.value += ' 请读取最新状态，确认后再操作。' } }
  finally { if (current(token)) { saving.value = false; if (refreshAgain) { refreshAgain = false; refresh() } } }
}
async function adopt() {
  if (locked.value || snapshot.value.source.status !== 'ready') return
  if (snapshot.value.needs_update) {
    const token = ticket(), version = snapshot.value.version, revision = snapshot.value.source.revision
    confirming.value = true
    const accepted = await dialog.confirm({ title: '更新今日历练待办', message: '将采用已保存的今日规划。保留已完成次数，新增次数记为待完成，移除不再需要的未完成项。', confirmText: '更新待办' })
    if (!current(token)) return
    confirming.value = false
    if (!accepted || version !== snapshot.value?.version || revision !== snapshot.value?.source.revision) { if (refreshAgain) { refreshAgain = false; refresh() } return }
  }
  await write()
}
function toggle(task, event) {
  const desired = event.target.checked
  event.target.checked = task.done
  void write(task.id, desired)
}
function checkDay() {
  clearTimeout(dayTimer)
  date.value = businessDate()
  dayTimer = setTimeout(checkDay, Math.max(25, Date.parse(nextBusinessDayStartIso(date.value)) - Date.now() + 25))
}
function refresh() {
  if (!alive || document.visibilityState === 'hidden') return
  checkDay()
  if (refreshTimer != null) return
  refreshTimer = setTimeout(() => { refreshTimer = null; void load() }, 180)
}
watch(key, () => {
  generation++; clearTimeout(refreshTimer); refreshTimer = null; refreshAgain = false
  snapshot.value = null; loading.value = false; saving.value = false; confirming.value = false; error.value = ''; denied.value = false; notice.value = ''
  const token = ticket()
  nextTick(() => { if (current(token)) void load() })
}, { immediate: true, flush: 'sync' })
watch(() => props.contextReady, ready => { if (ready) refresh() })
onMounted(() => {
  checkDay()
  document.addEventListener('visibilitychange', refresh); window.addEventListener('pageshow', refresh)
  unsubscribe = subscribeAccountEvents(message => {
    if (message?.data?.account_id && message.data.account_id !== props.accountId || message?.data?.plan_id && message.data.plan_id !== props.planId) return
    if (['operator_stamina_schedule', 'operator_training_tasks', 'account_stream_open'].includes(message?.event)) refresh()
  })
})
onBeforeUnmount(() => { alive = false; generation++; clearTimeout(refreshTimer); clearTimeout(dayTimer); unsubscribe?.()
  document.removeEventListener('visibilitychange', refresh); window.removeEventListener('pageshow', refresh) })
</script>

<style scoped>
.daily-preview, .daily-todos { min-width: 0; color: var(--ink); }
.daily-preview { border-top: 1px solid var(--line); }
.daily-todos { border: 1px solid var(--line); background: var(--surface); }
.daily-heading, .daily-item-name, .daily-details, .daily-cloud, .daily-footnote { display: flex; align-items: center; gap: 8px; }
.daily-heading { justify-content: space-between; flex-wrap: wrap; }
h2, h3, p { margin: 0; overflow-wrap: anywhere; }
h2, h3 { color: var(--theme-strong-text, var(--tea)); font-family: var(--font-s); }
h2 { display: flex; align-items: center; gap: 8px; font-weight: 800; }
.daily-heading time, .daily-hint, .daily-cloud, .daily-footnote, small { color: var(--ink-60); }
ul { list-style: none; padding: 0; }
.daily-source-row, .daily-task-list li { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.daily-source-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-left: 4px solid var(--theme-info-line, #668fa7); }
.daily-item-name { flex-wrap: wrap; min-width: 0; }
.daily-stage { padding: 3px 7px; border: 1px solid var(--theme-info-line, #c2d2d6); border-radius: 6px; background: var(--theme-info-bg, #edf2f3); color: var(--theme-info-text, #466c80); white-space: nowrap; }
.daily-count { color: var(--theme-info-text, #466c80); font-weight: 700; white-space: nowrap; }
.daily-cost, .daily-total strong, .daily-summary strong { color: var(--theme-danger-text, var(--rouge)); font-variant-numeric: tabular-nums; }
.daily-total { border-top: 1px dashed var(--line); text-align: center; }
.daily-adopt { width: 100%; display: flex; justify-content: center; align-items: center; gap: 8px; background: var(--tea); color: var(--on-surface); font-weight: 700; }
.daily-adopt.is-added { background: var(--theme-success-bg, #e5eee5); color: var(--theme-success-text, #365b43); border-color: var(--theme-success-line, #b4cbb5); }
.daily-details { justify-content: center; color: var(--theme-strong-text, var(--tea)); text-decoration: none; }
.daily-cloud { justify-content: center; border-top: 1px dashed var(--line); flex-wrap: wrap; }
.daily-task-row { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
.daily-task-row input { flex: none; width: 22px; height: 22px; accent-color: #527d5b; margin: 2px 0 0; cursor: pointer; }
.daily-task-row input:disabled { cursor: default; }
.daily-task-copy { flex: 1; min-width: 0; }
.daily-task-copy small { display: block; margin-top: 5px; line-height: 1.6; }
.daily-done { color: var(--theme-success-text, #365b43); white-space: nowrap; }
.is-completed .daily-item-name > b { color: var(--ink-60); text-decoration: line-through; }
.daily-notice { border: 1px solid var(--theme-success-line, #b4cbb5); border-radius: 8px; background: var(--theme-success-bg, #eef4e9); color: var(--theme-success-text, #365b43); padding: 8px 10px; }
.daily-error { color: var(--theme-danger-text, var(--rouge)); }
.daily-warning { color: var(--theme-text, #815b2e); }
button { border: 1px solid var(--line); border-radius: 9px; cursor: pointer; }
button:not(.daily-adopt) { background: var(--cream); color: var(--theme-strong-text, var(--tea)); padding: 6px 10px; }
button:disabled { cursor: default; opacity: .65; }
.daily-adopt.is-added:disabled { opacity: 1; }
a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
.daily-progress { font-family: var(--font-d); color: var(--theme-strong-text, var(--tea)); }
@media (hover: hover) { .daily-details:hover { text-decoration: underline; text-underline-offset: 3px; } }
</style>
<style scoped src="./todayTrainingDailyMobile.css"></style>
<style scoped src="./todayTrainingDailyDesktop.css"></style>
