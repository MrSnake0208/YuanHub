<template>
  <Teleport to="body">
    <div class="modal-mask is-raised milestone-mask" @click.self="close">
      <section ref="panel" class="milestone-panel" role="dialog" aria-modal="true" aria-labelledby="milestone-title" aria-describedby="milestone-help" :aria-busy="busy" tabindex="-1">
        <header><h2 id="milestone-title">{{ entry.name || entry.id }} · 化极历程</h2><button class="close-button" type="button" :disabled="busy" @click="close">关闭<X :size="16" aria-hidden="true" /></button></header>
        <p id="milestone-help" class="intro">补录实际达成日期，查看各阶段耗时。</p>
        <p class="hint date-help">按北京时间填写，留空表示未知。</p>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <p v-if="busy" role="status">{{ saving ? '正在保存…' : '正在读取历程…' }}</p>
        <form v-if="data" @submit.prevent="save">
          <ol class="milestone-list">
            <li v-for="row in rows" :key="row.key">
              <label :for="'milestone-' + row.key">{{ row.label }}</label>
              <div class="milestone-fields">
                <div class="milestone-date">
                  <input :id="'milestone-' + row.key" v-model="dates[row.key]" type="date" min="0001-01-01" :max="today" :disabled="busy || conflict" />
                  <button v-if="dates[row.key]" class="clear-button" type="button" :aria-label="'清空' + row.label + '日期'" :disabled="busy || conflict" @click="dates[row.key] = ''">清空</button>
                </div>
                <p v-if="row.previousDays != null || row.totalDays != null" class="elapsed">
                  <span v-if="row.previousDays != null">距上一阶段 <strong>{{ row.previousDays }} 天</strong></span>
                  <span v-if="row.previousDays != null && row.totalDays != null" aria-hidden="true"> · </span>
                  <span v-if="row.totalDays != null">累计 <strong>{{ row.totalDays }} 天</strong></span>
                </p>
              </div>
            </li>
          </ol>
          <aside v-if="observations.length" class="observations" aria-labelledby="milestone-reference-title">
            <h3 id="milestone-reference-title">站内参考记录</h3>
            <p v-for="observation in observations" :key="observation.date">截至 {{ observation.date }}，已记录达到 {{ observation.labels.join('、') }}。</p>
            <p class="hint">参考记录不代表实际达成日期，也不补齐跳过的星级。</p>
          </aside>
          <p class="hint export-hint">名册导入 / 导出暂不包含补录日期。</p>
          <div class="actions save-actions">
            <div><p class="hint">仅保存日期，不影响练度或库存</p><p v-if="dirty" class="unsaved" role="status">有未保存的修改</p></div>
            <button class="primary" type="submit" :disabled="busy || conflict || !dirty">{{ saving ? '正在保存…' : '保存日期' }}</button>
          </div>
        </form>
        <button v-if="!busy && (conflict || !data)" type="button" @click="load">{{ conflict ? '放弃草稿并重新读取' : '重新读取' }}</button>
        <div v-if="discard" class="actions" role="alert"><span>日期尚未保存。</span><button type="button" @click="emit('close')">放弃并关闭</button><button type="button" @click="discard = false">继续填写</button></div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { getOperatorMilestones, putOperatorMilestones } from '../../api/operatorMilestones.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { dateInZone } from '../../utils/businessDay.js'
import { milestoneRows } from '../../utils/operatorMilestones.js'

const props = defineProps({ entry: { type: Object, required: true }, accountId: { type: String, required: true }, game: { type: String, required: true }, userId: { type: String, required: true } })
const emit = defineEmits(['close'])
const panel = ref(null), data = ref(null), dates = ref({}), busy = ref(false), saving = ref(false), error = ref(''), notice = ref(''), conflict = ref(false), discard = ref(false)
const context = [props.userId, props.accountId, props.game, props.entry.id]
let active = true
const current = () => active && context.every((value, i) => value === [props.userId, props.accountId, props.game, props.entry.id][i])
watch(() => [props.userId, props.accountId, props.game, props.entry.id], () => { active = false; emit('close') }, { flush: 'sync' })
onScopeDispose(() => { active = false })
const dirty = computed(() => data.value?.milestones.some(row => (row.date || '') !== (dates.value[row.key] || '')) || false)
const rows = computed(() => milestoneRows(data.value?.milestones || [], dates.value))
const today = computed(() => dateInZone('Asia/Shanghai'))
const observedDate = value => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
const observations = computed(() => {
  const groups = new Map()
  for (const row of rows.value) {
    if (!row.observed_at) continue
    const date = observedDate(row.observed_at)
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date).push(row.label)
  }
  return Array.from(groups, ([date, labels]) => ({ date, labels }))
})
function close() { if (busy.value) return; if (dirty.value) discard.value = true; else emit('close') }
useModalFocus(computed(() => true), panel, { initialFocus: () => panel.value, onEscape: close })
function accept(value) { data.value = value; dates.value = Object.fromEntries(value.milestones.map(row => [row.key, row.date || ''])); conflict.value = false; discard.value = false }
async function load() {
  if (!current() || busy.value || !props.userId || !props.accountId) return
  busy.value = true; error.value = ''; notice.value = ''
  try { const result = await getOperatorMilestones(context[1], context[2], context[3], context[0]); if (current()) accept(result) }
  catch (err) { if (current()) error.value = err.message || '读取失败，请重试' }
  finally { if (current()) busy.value = false }
}
async function save() {
  if (!current() || busy.value || conflict.value || !dirty.value) return
  busy.value = true; saving.value = true; error.value = ''; notice.value = ''
  try {
    const result = await putOperatorMilestones(context[1], context[2], context[3], context[0], { expected_revision: data.value.revision, dates: Object.fromEntries(Object.entries(dates.value).map(([key, value]) => [key, value || null])) })
    if (current()) { accept(result); notice.value = '日期已保存，耗时已更新。' }
  } catch (err) {
    if (current()) { conflict.value = err.status === 409 || err.code === 'milestone_revision_conflict'; error.value = conflict.value ? '记录已被更新。草稿仍保留，请核对后重新读取。' : err.message || '保存失败，填写内容已保留。' }
  } finally { if (current()) { busy.value = false; saving.value = false } }
}
load()
</script>

<style scoped>
.milestone-panel { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); box-shadow: 0 8px 28px rgba(73,59,44,.12); }
h2 { font: 900 24px/1.5 var(--font-s); margin: 0; overflow-wrap: anywhere; }
h3 { font: 700 14px/1.6 var(--font-b); margin: 0; }
p, span, label, input, button { font: 14px/1.6 var(--font-b); }
button, input { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); }
button { cursor: pointer; padding: 6px 10px; }
button.primary { background: var(--tea); color: var(--cream); }
button.primary:disabled { background: var(--line); color: var(--ink-60); opacity: 1; }
button:disabled { opacity: .6; cursor: default; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--tea); outline-offset: 2px; }
.error { color: var(--rouge); }
.hint, .elapsed { color: var(--ink-60); }
.elapsed strong { color: var(--ink); font-weight: 600; }
.milestone-list { list-style: none; padding: 0; }
.milestone-list li { position: relative; border-top: 1px solid var(--line); }
.milestone-list li::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; border-left: 1px solid var(--line); }
.milestone-list li:first-child::before { top: 30px; }
.milestone-list li:last-child::before { bottom: calc(100% - 30px); }
.milestone-list li::after { content: ''; position: absolute; left: 0; top: 23px; width: 12px; height: 12px; border: 2px solid var(--ink-35); border-radius: 50%; background: var(--surface); }
label { font-weight: 700; font-size: 16px; }
.close-button { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
.clear-button { border-color: transparent; background: transparent; color: var(--ink-60); }
.observations, .save-actions { border-top: 1px solid var(--line); }
.unsaved { color: var(--tea); }
</style>
<style scoped src="./operatorMilestoneDialogMobile.css"></style>
<style scoped src="./operatorMilestoneDialogDesktop.css"></style>
