<template>
  <section v-if="context?.permitted.value" class="calendar-subscription" :class="{ 'is-dialog': detail }" aria-label="私人活动待办">
    <p v-if="!context.account.value" class="calendar-hint">选择游戏账号后可订阅本期活动。</p>
    <p v-else-if="item && item.game !== context.account.value.game" class="calendar-hint">请切换到{{ item.game }}账号后订阅。</p>
    <template v-else>
      <div :class="{ 'calendar-completion-section': detail }">
        <component :is="variant === 'day' ? 'h4' : 'h3'" v-if="detail" class="calendar-operation-heading">本期完成状态</component>
        <div class="calendar-subscription-actions">
          <p v-if="record?.subscribed" class="calendar-activity-status">{{ subscriptionCompleted(record) ? '本期已完成' : !item ? '活动不可用 · 本期未完成' : closed ? '已过期 · 本期未完成' : detail ? '本期未完成' : '本期待办' }}</p>
          <p v-else-if="detail" class="calendar-hint">订阅本期后，可记录完成状态与个人待办。</p>
          <button v-if="record?.subscribed" type="button" :class="{ 'calendar-completion-primary': detail && !subscriptionCompleted(record) }" :disabled="busy || blocked || context.dirty.value || context.loading.value || !!context.error.value" @click="changeCompletion">{{ subscriptionCompleted(record) ? '撤销完成' : '标记本期完成' }}</button>
          <p v-if="!detail && record?.subscribed && (!editing || !item)" class="calendar-todo-card-summary">{{ subscriptionProgress(record) }}</p>
          <button v-if="!detail || !record?.subscribed" type="button" :class="{ 'calendar-completion-primary': detail && !closed }" :disabled="busy || context.loading.value || !!context.error.value || (!record?.subscribed && closed)" @click="changeSubscription">{{ record?.subscribed ? '取消订阅' : closed ? '本期已截止' : '订阅本期' }}</button>
          <button v-if="!detail && record?.subscribed" ref="editorToggle" type="button" :disabled="busy" :aria-expanded="editing" @click="toggleEditor()">{{ editing ? '收起待办' : item ? '编辑待办' : '查看待办' }}</button>
        </div>
        <p v-if="record?.subscribed && context.dirty.value" class="calendar-hint">请先保存或收起未保存的修改，再标记本期状态。</p>
      </div>
      <div :class="{ 'calendar-personal-todos': detail && record?.subscribed }">
        <template v-if="detail && record?.subscribed">
          <div class="calendar-todos-heading">
            <component :is="variant === 'day' ? 'h4' : 'h3'" class="calendar-operation-heading">个人待办</component>
            <button ref="editorToggle" type="button" :disabled="busy" :aria-expanded="editing" @click="toggleEditor(!editing && !!item && !record.checklist.length)">{{ editing ? '收起待办' : !item ? '查看待办' : record.checklist.length ? '编辑待办' : '添加待办' }}</button>
          </div>
          <p v-if="!editing" class="calendar-todo-card-summary">{{ subscriptionProgress(record) }}</p>
          <p v-if="!editing" class="calendar-hint">清单完成与本期完成状态独立。</p>
        </template>
        <div v-if="editing && record?.subscribed && !item" class="calendar-todo-readonly">
          <p class="calendar-hint">活动不可用，待办仅可查看。</p>
          <ul v-if="record.checklist.length"><li v-for="entry in record.checklist" :key="entry.id">{{ entry.completed ? '已完成' : '未完成' }} · {{ entry.title }}</li></ul>
          <p v-if="!record.checklist.length" class="calendar-hint">暂无待办</p>
        </div>
        <form v-if="editing && record?.subscribed && item" ref="editor" class="calendar-checklist" @submit.prevent="save">
          <fieldset :disabled="busy || blocked || !!context.error.value">
            <legend>活动待办 · 仅当前账号可见</legend>
            <p class="calendar-todo-summary" role="status" aria-live="polite">待办事项 · 已完成 {{ draft.checklist.filter(entry => entry.completed).length }}/{{ draft.checklist.length }} 项<span v-if="draft.checklist.length && draft.checklist.every(entry => entry.completed)"> · 待办全部完成</span></p>
            <p class="calendar-hint">清单勾选不会自动完成本期活动，请另点“标记本期完成”。</p>
            <p v-if="!draft.checklist.length" class="calendar-hint">暂无待办</p>
            <div v-for="(entry, index) in draft.checklist" :key="entry.id" class="calendar-check-row">
              <label class="calendar-check-target"><input v-model="entry.completed" type="checkbox" :aria-label="`完成 ${entry.title || '待办' + (index + 1)}`"></label>
              <input v-model="entry.title" type="text" maxlength="80" required :aria-label="`待办 ${index + 1} 名称`">
              <button type="button" class="calendar-todo-delete" :aria-label="`删除 ${entry.title || '待办' + (index + 1)}`" @click="removeEntry(entry.id)">删除</button>
            </div>
            <button type="button" :disabled="draft.checklist.length >= 50" @click="addEntry">添加待办</button>
            <p v-if="draft.checklist.length >= 50" class="calendar-hint" role="status">已达 50 条待办上限，删除一条后可继续添加。</p>
            <div class="calendar-subscription-actions">
              <button type="submit" class="calendar-todo-save" :disabled="!dirty">{{ saving ? '保存中…' : '保存待办' }}</button>
              <span class="calendar-todo-status" :class="{ 'is-dirty': dirty }" role="status" aria-live="polite">{{ saveStatus }}</span>
            </div>
          </fieldset>
        </form>
        <details v-if="editing && record?.subscribed && hasHistory" class="calendar-todo-history">
          <summary>查看旧备忘内容（历史数据）</summary>
          <p v-if="record.memo_title && record.memo_title !== DEFAULT_MEMO_TITLE">{{ record.memo_title }}</p>
          <p v-if="record.memo_note" class="calendar-memo-note">{{ record.memo_note }}</p>
          <p v-if="record.legacy_completed" class="calendar-hint">旧完成记录：已完成（不影响待办状态）</p>
        </details>
      </div>
      <div v-if="detail && record?.subscribed" class="calendar-subscription-secondary">
        <button type="button" :disabled="busy || context.loading.value || !!context.error.value" @click="changeSubscription">取消订阅</button>
      </div>
      <p v-if="error" class="calendar-error" role="alert">{{ error }}</p>
      <button v-if="blocked" type="button" :disabled="busy" @click="refresh">读取最新状态</button>
      <p v-if="message" class="calendar-hint" role="status">{{ message }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { CALENDAR_SUBSCRIPTIONS, DEFAULT_MEMO_TITLE, progressDraft, subscriptionCompleted, subscriptionProgress } from '@/data/activityCalendarSubscriptions.js'
import { calendarEnded, serverToday } from '@/data/activityCalendar.js'
import { dialog } from '@/utils/dialog.js'
const props = defineProps({ item: { type: Object, default: null }, unavailable: { type: Object, default: null }, variant: { type: String, default: 'card' } })
const detail = computed(() => props.variant !== 'card')
const context = inject(CALENDAR_SUBSCRIPTIONS, null)
const id = computed(() => props.item?.id || props.unavailable?.event_id || '')
const record = computed(() => context?.byId.value[id.value] || props.unavailable || null)
const editor = ref(null), editorToggle = ref(null)
const editing = ref(false), busy = ref(false), blocked = ref(false), error = ref(''), message = ref('')
const saving = ref(false), saveFailed = ref(false)
const hasHistory = computed(() => (record.value?.memo_title && record.value.memo_title !== DEFAULT_MEMO_TITLE) || !!record.value?.memo_note || record.value?.legacy_completed === true)
const snapshot = value => JSON.stringify(value.checklist.map(entry => [entry.id, entry.title, entry.completed]))
const draft = ref(progressDraft(null)), baseline = ref(snapshot(draft.value)), version = ref(null)
const dirty = computed(() => editing.value && snapshot(draft.value) !== baseline.value)
const saveStatus = computed(() => saving.value ? '保存中…' : dirty.value ? saveFailed.value ? '保存失败，修改仍在此页面' : '有未保存修改' : '已保存')
const closed = computed(() => !props.item || calendarEnded(props.item, serverToday(new Date(context?.now.value || Date.now())), context?.now.value))
let alive = true
const stamp = () => JSON.stringify([context?.key.value, context?.epoch?.value, id.value])
const current = token => alive && stamp() === token
function adopt(value) { draft.value = progressDraft(value); baseline.value = snapshot(draft.value); version.value = value?.version ?? null; saveFailed.value = false }
watch(record, value => { if (!dirty.value && !busy.value) adopt(value) }, { immediate: true })
watch(() => [context?.key.value, context?.epoch?.value, id.value], () => { editing.value = false; busy.value = false; saving.value = false; blocked.value = false; error.value = ''; message.value = ''; adopt(record.value) }, { flush: 'sync' })
watch(dirty, value => { context?.setDirty(id.value, value); if (value) message.value = '' }, { flush: 'sync' })
onBeforeUnmount(() => { alive = false; context?.setDirty(id.value, false) })
async function toggleEditor(addFirst = false) {
  const token = stamp()
  if (editing.value && dirty.value && !await context.confirmDiscard()) return
  if (!current(token)) return
  if (!editing.value) adopt(record.value)
  editing.value = !editing.value
  await nextTick()
  if (!current(token)) return
  if (editing.value && addFirst) await addEntry()
  else (editing.value ? editor.value?.querySelector('input[type="text"], button') : editorToggle.value)?.focus()
}
async function addEntry() {
  if (draft.value.checklist.length >= 50) return
  const token = stamp()
  const crypto = globalThis.crypto
  const baseId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID()
    : typeof crypto?.getRandomValues === 'function'
      ? 'todo-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
      : 'todo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
  let entryId = baseId, suffix = 0
  while (draft.value.checklist.some(entry => entry.id === entryId)) entryId = baseId + '-' + ++suffix
  draft.value.checklist.push({ id: entryId, title: '', completed: false })
  await nextTick()
  if (current(token)) {
    const inputs = editor.value?.querySelectorAll('.calendar-check-row input[type="text"]') || []
    inputs[inputs.length - 1]?.focus()
  }
}
async function removeEntry(entryId) {
  if (busy.value || dialog._state?.visible) return
  const token = stamp()
  if (!await dialog.confirm({ title: '删除待办？', message: '仅删除当前账号、本期活动的这条待办，保存后生效。', confirmText: '删除', cancelText: '保留', type: 'danger' }) || !current(token)) return
  draft.value.checklist = draft.value.checklist.filter(entry => entry.id !== entryId)
}
function failed(err) {
  saveFailed.value = true
  blocked.value = err?.status === 409 || !err?.status || err.status >= 500
  error.value = blocked.value ? '保存结果需要确认，草稿已保留。请读取最新状态后再编辑。' : err?.status === 422 && err?.message === '请求字段不正确' ? '服务端尚不支持待办保存协议，请先升级服务端。草稿已保留。' : err?.message || '保存失败，请重试。'
}
async function changeSubscription() {
  if (busy.value || dialog._state?.visible) return
  const token = stamp(), subscribed = !record.value?.subscribed
  if (dirty.value) {
    if (!await context.confirmDiscard()) return
  } else if (detail.value && !subscribed && !await dialog.confirm({ title: '取消订阅本期活动？', message: `将取消「${props.item?.title || '本期活动'}」在当前账号的订阅；已保存的待办与完成记录会保留。`, confirmText: '取消订阅', cancelText: '继续保留' })) return
  if (!current(token)) return
  if (busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    const value = await context.subscribe(id.value, subscribed)
    if (!current(token) || !value) return
    adopt(value); editing.value = false; blocked.value = false
    message.value = value.subscribed ? '已订阅本期，已有待办与历史内容会保留。' : '已取消订阅，待办与历史内容已保留。'
  } catch (err) { if (current(token)) failed(err) }
  finally { if (current(token)) busy.value = false }
}
async function changeCompletion() {
  if (busy.value || blocked.value || context.dirty.value) return
  const token = stamp(), completed = !subscriptionCompleted(record.value)
  busy.value = true; error.value = ''; message.value = ''
  try {
    const value = await context.complete(id.value, record.value.version, completed)
    if (!current(token) || !value) return
    version.value = value.version
  } catch (err) { if (current(token)) failed(err) }
  finally { if (current(token)) busy.value = false }
}
async function save() {
  if (busy.value || blocked.value || context.error.value || !dirty.value) return
  const invalid = draft.value.checklist.findIndex(entry => !entry.title.trim() || entry.title.length > 80)
  if (draft.value.checklist.length > 50 || invalid !== -1) {
    error.value = '最多 50 条待办，每条名称须为 1–80 字，不能仅含空格。'
    editor.value?.querySelectorAll('input[type="text"]')[invalid]?.focus()
    return
  }
  const token = stamp()
  busy.value = true; saving.value = true; error.value = ''; message.value = ''
  try {
    const value = await context.progress(id.value, version.value, JSON.parse(JSON.stringify(draft.value)))
    if (!current(token) || !value) return
    adopt(value)
  } catch (err) { if (current(token)) failed(err) }
  finally { if (current(token)) { busy.value = false; saving.value = false } }
}
async function refresh() {
  if (busy.value) return
  const token = stamp()
  busy.value = true
  try {
    const value = await context.refreshOne(id.value)
    if (!current(token)) return
    if (dialog._state?.visible) return
    if (dirty.value && !await dialog.confirm({ title: '使用最新待办？', message: '将用服务器最新待办替换当前未保存的待办，历史内容不受影响。', confirmText: '使用最新待办', cancelText: '保留草稿' })) return
    if (!current(token)) return
    adopt(value); context.accept(value || { event_id: id.value, subscribed: false }); blocked.value = false; error.value = ''; message.value = '已读取最新状态。'
  } catch (err) { if (current(token)) error.value = err?.message || '读取失败，请重试。' }
  finally { if (current(token)) busy.value = false }
}
</script>
