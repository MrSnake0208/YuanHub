<template>
  <Teleport to="body">
    <div class="modal-mask is-raised milestone-mask" @click.self="close">
      <section ref="panel" class="milestone-panel" role="dialog" aria-modal="true" aria-labelledby="milestone-title" aria-describedby="milestone-help" :aria-busy="busy" tabindex="-1">
        <header><h2 id="milestone-title">{{ entry.name || entry.id }} · 化极历程</h2><button type="button" :disabled="busy" @click="close">关闭</button></header>
        <p id="milestone-help">补录游戏内实际达成日期，查看各阶段用了多久。日期按北京时间填写；保存不改变练度、不扣库存。</p>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <p v-if="busy" role="status">{{ saving ? '正在保存…' : '正在读取历程…' }}</p>
        <form v-if="data" @submit.prevent="save">
          <ol class="milestone-list">
            <li v-for="row in rows" :key="row.key">
              <label :for="'milestone-' + row.key">{{ row.label }}</label>
              <div class="milestone-date">
                <input :id="'milestone-' + row.key" v-model="dates[row.key]" type="date" min="0001-01-01" :max="today" :disabled="busy || conflict" />
                <button v-if="dates[row.key]" type="button" :aria-label="'清空' + row.label + '日期'" :disabled="busy || conflict" @click="dates[row.key] = ''">清空</button>
                <span class="source">{{ dates[row.key] ? '手动确认日期' : '实际日期未知，可补录' }}</span>
              </div>
              <p class="elapsed" v-if="row.key !== 'star_1'">距上一阶段：{{ days(row.previousDays) }} · 距首次获得：{{ days(row.totalDays) }}</p>
              <p class="observed" v-if="row.observed_at">站内记录时已达此阶段：{{ observedDate(row.observed_at) }}（仅供参考）</p>
            </li>
          </ol>
          <p class="hint">空白表示未知；只用已确认日期计算耗时。站内记录时间不代表实际升星日期，也不补齐跳过的星级。现有名册导入／导出不包含这些补录日期。</p>
          <div class="actions"><button class="primary" type="submit" :disabled="busy || conflict || !dirty">保存日期</button><span v-if="dirty">有未保存的修改</span></div>
        </form>
        <button v-if="!busy && (conflict || !data)" type="button" @click="load">{{ conflict ? '放弃草稿并重新读取' : '重新读取' }}</button>
        <div v-if="discard" class="actions" role="alert"><span>日期尚未保存。</span><button type="button" @click="emit('close')">放弃并关闭</button><button type="button" @click="discard = false">继续填写</button></div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
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
const days = value => value == null ? '未知' : value + ' 天'
const observedDate = value => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
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
.milestone-panel { border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); }
h2 { font: 900 20px/1.5 var(--font-s); margin: 0; }
p, span, label, input, button { font: 14px/1.6 var(--font-b); }
button, input { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); }
button { cursor: pointer; padding: 6px 10px; }
button.primary { background: var(--tea); color: var(--cream); }
button:disabled { opacity: .6; cursor: default; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--tea); outline-offset: 2px; }
.error { color: var(--rouge); }
.source, .hint, .observed { color: var(--ink-60); }
.milestone-list { list-style: none; padding: 0; }
.milestone-list li { border-top: 1px solid var(--line); }
label { font-weight: 700; }
</style>
<style scoped src="./operatorMilestoneDialogMobile.css"></style>
<style scoped src="./operatorMilestoneDialogDesktop.css"></style>
