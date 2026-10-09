<template>
  <section v-if="context?.permitted.value" class="calendar-subscription" aria-label="私人活动备忘录">
    <p v-if="!context.account.value" class="calendar-hint">选择游戏账号后可订阅本期活动。</p>
    <p v-else-if="item && item.game !== context.account.value.game" class="calendar-hint">请切换到{{ item.game }}账号后订阅。</p>
    <template v-else>
      <div class="calendar-subscription-actions">
        <div v-if="record?.subscribed" class="calendar-memo-summary">
          <strong>{{ record.memo_title ?? DEFAULT_MEMO_TITLE }}</strong>
          <span>{{ record.checklist.length ? `已完成 ${record.checklist.filter(entry => entry.completed).length}/${record.checklist.length} 项${record.completed ? ' · 本期已完成' : ''}` : record.completed ? '本期已完成' : '本期未完成' }}</span>
        </div>
        <button type="button" :disabled="busy || context.loading.value || !!context.error.value || (!record?.subscribed && closed)" @click="changeSubscription">{{ record?.subscribed ? '取消订阅' : closed ? '本期已截止' : '订阅本期' }}</button>
        <button v-if="record?.subscribed" ref="editorToggle" type="button" :disabled="busy" :aria-expanded="editing" @click="toggleEditor">{{ editing ? '收起备忘' : item ? '编辑备忘' : '查看备忘' }}</button>
      </div>
      <div v-if="editing && record?.subscribed && !item" class="calendar-memo-readonly">
        <p class="calendar-hint">活动不可用，备忘录仅可查看。</p>
        <ul v-if="record.checklist.length"><li v-for="entry in record.checklist" :key="entry.id">{{ entry.completed ? '已完成' : '未完成' }} · {{ entry.title }}</li></ul>
        <p v-if="record.memo_note" class="calendar-memo-note">{{ record.memo_note }}</p>
      </div>
      <form v-if="editing && record?.subscribed && item" ref="editor" class="calendar-checklist" @submit.prevent="save">
        <fieldset :disabled="busy || blocked || !!context.error.value">
          <legend>活动备忘录 · 仅当前账号可见</legend>
          <label class="calendar-memo-field">备忘标题
            <input v-model="draft.memo_title" type="text" maxlength="60" required aria-label="备忘标题">
            <span class="calendar-hint">{{ draft.memo_title.length }}/60 字 · 标题不影响完成状态</span>
          </label>
          <label v-if="!draft.checklist.length" class="calendar-check-row"><input v-model="draft.completed" type="checkbox"> 本期已完成</label>
          <div v-for="(entry, index) in draft.checklist" :key="entry.id" class="calendar-check-row">
            <label class="calendar-check-target"><input v-model="entry.completed" type="checkbox" :aria-label="`完成 ${entry.title || '待办' + (index + 1)}`"></label>
            <input v-model="entry.title" type="text" maxlength="80" required :aria-label="`待办 ${index + 1} 名称`">
            <button type="button" :aria-label="`删除 ${entry.title || '待办' + (index + 1)}`" @click="removeEntry(entry.id)">删除</button>
          </div>
          <button type="button" :disabled="draft.checklist.length >= 50" @click="addEntry">添加待办</button>
          <p v-if="draft.checklist.length >= 50" class="calendar-hint" role="status">已达 50 条待办上限，删除一条后可继续添加。</p>
          <label class="calendar-memo-field">文字备注（可选）
            <textarea v-model="draft.memo_note" rows="2" maxlength="1000" aria-label="文字备注（可选）" placeholder="攻略提示、兑换提醒…" />
            <span class="calendar-hint">{{ draft.memo_note.length }}/1000 字</span>
          </label>
          <div class="calendar-subscription-actions">
            <button type="submit" :disabled="!dirty">{{ busy ? '保存中…' : '保存备忘' }}</button>
          </div>
        </fieldset>
      </form>
      <p v-if="error" class="calendar-error" role="alert">{{ error }}</p>
      <button v-if="blocked" type="button" :disabled="busy" @click="refresh">读取最新状态</button>
      <p v-if="message" class="calendar-hint" role="status">{{ message }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { CALENDAR_SUBSCRIPTIONS, DEFAULT_MEMO_TITLE, progressDraft, subscriptionCompleted } from '@/data/activityCalendarSubscriptions.js'
import { calendarEnded, serverToday } from '@/data/activityCalendar.js'
import { dialog } from '@/utils/dialog.js'
const props = defineProps({ item: { type: Object, default: null }, unavailable: { type: Object, default: null } })
const context = inject(CALENDAR_SUBSCRIPTIONS, null)
const id = computed(() => props.item?.id || props.unavailable?.event_id || '')
const record = computed(() => context?.byId.value[id.value] || props.unavailable || null)
const editor = ref(null), editorToggle = ref(null)
const editing = ref(false), busy = ref(false), blocked = ref(false), error = ref(''), message = ref('')
const draft = ref(progressDraft(null)), baseline = ref(JSON.stringify(draft.value)), version = ref(null)
const dirty = computed(() => editing.value && JSON.stringify(draft.value) !== baseline.value)
const closed = computed(() => !props.item || calendarEnded(props.item, serverToday(new Date(context?.now.value || Date.now())), context?.now.value))
let alive = true
const stamp = () => JSON.stringify([context?.key.value, id.value])
const current = token => alive && stamp() === token
function adopt(value) { draft.value = progressDraft(value); baseline.value = JSON.stringify(draft.value); version.value = value?.version ?? null }
watch(record, value => { if (!dirty.value && !busy.value) adopt(value) }, { immediate: true })
watch(() => [context?.key.value, id.value], () => { editing.value = false; busy.value = false; blocked.value = false; error.value = ''; message.value = ''; adopt(record.value) }, { flush: 'sync' })
watch(dirty, value => context?.setDirty(id.value, value), { flush: 'sync' })
onBeforeUnmount(() => { alive = false; context?.setDirty(id.value, false) })
async function toggleEditor() {
  const token = stamp()
  if (editing.value && dirty.value && !await context.confirmDiscard()) return
  if (!current(token)) return
  if (!editing.value) adopt(record.value)
  editing.value = !editing.value
  await nextTick()
  if (current(token)) (editing.value ? editor.value?.querySelector('[aria-label="备忘标题"]') : editorToggle.value)?.focus()
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
  draft.value.completed = false
  await nextTick()
  if (current(token)) {
    const inputs = editor.value?.querySelectorAll('.calendar-check-row input[type="text"]') || []
    inputs[inputs.length - 1]?.focus()
  }
}
async function removeEntry(entryId) {
  const token = stamp()
  if (!await dialog.confirm({ title: '删除待办？', message: '仅删除当前账号、本期活动的这条待办，保存后生效。', confirmText: '删除', cancelText: '保留', type: 'danger' }) || !current(token)) return
  const completed = subscriptionCompleted(draft.value)
  draft.value.checklist = draft.value.checklist.filter(entry => entry.id !== entryId)
  if (!draft.value.checklist.length) draft.value.completed = completed
}
function failed(err) {
  blocked.value = err?.status === 409 || !err?.status || err.status >= 500
  error.value = blocked.value ? '保存结果需要确认，草稿已保留。请读取最新状态后再编辑。' : err?.message || '保存失败，请重试。'
}
async function changeSubscription() {
  const token = stamp()
  if (dirty.value && !await context.confirmDiscard()) return
  if (!current(token)) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    const value = await context.subscribe(id.value, !record.value?.subscribed)
    if (!current(token) || !value) return
    adopt(value); editing.value = false; blocked.value = false
    message.value = value.subscribed ? '已订阅本期，已有备忘会保留。' : '已取消订阅，备忘已保留。'
  } catch (err) { if (current(token)) failed(err) }
  finally { if (current(token)) busy.value = false }
}
async function save() {
  if (busy.value || blocked.value || context.error.value || !dirty.value) return
  if (!draft.value.memo_title.trim() || draft.value.memo_title.length > 60) {
    error.value = '备忘标题须为 1–60 字，不能仅含空格。'
    editor.value?.querySelector('[aria-label="备忘标题"]')?.focus()
    return
  }
  if (draft.value.memo_note.length > 1000 || draft.value.checklist.length > 50 || draft.value.checklist.some(entry => !entry.title.trim() || entry.title.length > 80)) {
    error.value = '最多 50 条待办，待办名称须为 1–80 字；文字备注最多 1000 字。'
    return
  }
  const token = stamp()
  busy.value = true; error.value = ''; message.value = ''
  try {
    const value = await context.progress(id.value, version.value, JSON.parse(JSON.stringify(draft.value)))
    if (!current(token) || !value) return
    adopt(value); message.value = '备忘已保存。'
  } catch (err) { if (current(token)) failed(err) }
  finally { if (current(token)) busy.value = false }
}
async function refresh() {
  const token = stamp()
  busy.value = true
  try {
    const value = await context.refreshOne(id.value)
    if (!current(token)) return
    if (dirty.value && !await dialog.confirm({ title: '使用最新备忘？', message: '将用服务器最新备忘替换当前未保存的标题、待办和备注。', confirmText: '使用最新备忘', cancelText: '保留草稿' })) return
    if (!current(token)) return
    adopt(value); context.accept(value || { event_id: id.value, subscribed: false }); blocked.value = false; error.value = ''; message.value = '已读取最新状态。'
  } catch (err) { if (current(token)) error.value = err?.message || '读取失败，请重试。' }
  finally { if (current(token)) busy.value = false }
}
</script>
