<template>
  <section v-if="context?.permitted.value" class="calendar-subscription" aria-label="个人活动进度">
    <p v-if="!context.account.value" class="calendar-hint">选择游戏账号后可订阅本期活动。</p>
    <p v-else-if="item && item.game !== context.account.value.game" class="calendar-hint">请切换到{{ item.game }}账号后订阅。</p>
    <template v-else>
      <div class="calendar-subscription-actions">
        <span v-if="record?.subscribed">{{ record.completed ? '本期已完成' : record.checklist.length ? `已完成 ${record.checklist.filter(entry => entry.completed).length}/${record.checklist.length}` : '本期未完成' }}</span>
        <button type="button" :disabled="busy || context.loading.value || !!context.error.value || (!record?.subscribed && closed)" @click="changeSubscription">{{ record?.subscribed ? '取消订阅' : closed ? '本期已截止' : '订阅本期' }}</button>
        <button v-if="record?.subscribed && item" type="button" :disabled="busy" :aria-expanded="editing" @click="toggleEditor">{{ editing ? '收起进度' : '记录进度' }}</button>
      </div>
      <form v-if="editing && record?.subscribed && item" class="calendar-checklist" @submit.prevent="save">
        <fieldset :disabled="busy || blocked || !!context.error.value">
          <legend>我的关卡 · 仅当前账号可见</legend>
          <label v-if="!draft.checklist.length" class="calendar-check-row"><input v-model="draft.completed" type="checkbox"> 本期已完成</label>
          <div v-for="(entry, index) in draft.checklist" :key="entry.id" class="calendar-check-row">
            <label class="calendar-check-target"><input v-model="entry.completed" type="checkbox" :aria-label="`完成 ${entry.title || '关卡' + (index + 1)}`"></label>
            <input v-model="entry.title" type="text" maxlength="80" required :aria-label="`关卡 ${index + 1} 名称`">
            <button type="button" :aria-label="`删除 ${entry.title || '关卡' + (index + 1)}`" @click="removeEntry(entry.id)">删除</button>
          </div>
          <div class="calendar-subscription-actions">
            <button type="button" :disabled="draft.checklist.length >= 50" @click="addEntry">添加关卡</button>
            <button type="submit" :disabled="!dirty">{{ busy ? '保存中…' : '保存进度' }}</button>
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
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { CALENDAR_SUBSCRIPTIONS, progressDraft, subscriptionCompleted } from '@/data/activityCalendarSubscriptions.js'
import { calendarEnded, serverToday } from '@/data/activityCalendar.js'
import { dialog } from '@/utils/dialog.js'
const props = defineProps({ item: { type: Object, default: null }, unavailable: { type: Object, default: null } })
const context = inject(CALENDAR_SUBSCRIPTIONS, null)
const id = computed(() => props.item?.id || props.unavailable?.event_id || '')
const record = computed(() => context?.byId.value[id.value] || props.unavailable || null)
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
}
function addEntry() {
  draft.value.checklist.push({ id: crypto.randomUUID(), title: '', completed: false })
  draft.value.completed = false
}
async function removeEntry(entryId) {
  const token = stamp()
  if (!await dialog.confirm({ title: '删除个人关卡？', message: '只修改当前账号的清单，保存后生效。', confirmText: '删除', cancelText: '保留', type: 'danger' }) || !current(token)) return
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
    message.value = value.subscribed ? '已订阅本期，已有进度会保留。' : '已取消订阅，进度已保留。'
  } catch (err) { if (current(token)) failed(err) }
  finally { if (current(token)) busy.value = false }
}
async function save() {
  if (busy.value || blocked.value || context.error.value || !dirty.value) return
  const token = stamp()
  busy.value = true; error.value = ''; message.value = ''
  try {
    const value = await context.progress(id.value, version.value, JSON.parse(JSON.stringify(draft.value)))
    if (!current(token) || !value) return
    adopt(value); message.value = '进度已保存。'
  } catch (err) { if (current(token)) failed(err) }
  finally { if (current(token)) busy.value = false }
}
async function refresh() {
  const token = stamp()
  busy.value = true
  try {
    const value = await context.refreshOne(id.value)
    if (!current(token)) return
    if (dirty.value && !await dialog.confirm({ title: '使用最新进度？', message: '将用服务器最新进度替换当前未保存草稿。', confirmText: '使用最新进度', cancelText: '保留草稿' })) return
    if (!current(token)) return
    adopt(value); context.accept(value || { event_id: id.value, subscribed: false }); blocked.value = false; error.value = ''; message.value = '已读取最新状态。'
  } catch (err) { if (current(token)) error.value = err?.message || '读取失败，请重试。' }
  finally { if (current(token)) busy.value = false }
}
</script>
