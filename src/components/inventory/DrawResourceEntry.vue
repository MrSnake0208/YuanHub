<template>
  <component :is="embedded ? 'div' : 'details'" class="draw-resource-entry" @toggle="onToggle">
    <summary v-if="!embedded">符传快捷记账 <span>获得、使用与白金币兑换</span></summary>
    <p>仅记录尚未记过的实际变动；修改当前余额请用「更新数量」。</p>
    <p v-if="loading" role="status">正在读取抽卡资源库存…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <button v-if="!context && !loading || conflict" type="button" class="btn ghost" :disabled="locked || disabled" @click="load">重新读取库存</button>
    <form v-if="context" @submit.prevent="submit">
      <fieldset :disabled="disabled || locked || conflict">
        <div class="draw-fields">
          <label v-if="!embedded">操作<select v-model="action"><option value="gain">获得奖励</option><option value="use">使用符传</option><option value="exchange">白金币兑换</option></select></label>
          <label>{{ action === 'exchange' ? '兑换项目' : '符传类型' }}<select v-model="ticketId"><option v-for="ticket in DRAW_TICKETS" :key="ticket.id" :value="ticket.id">{{ ticket.name }}</option><option v-if="action === 'exchange'" value="zhuyu">茱萸兑换白金币</option></select></label>
          <label v-if="action === 'exchange' && ticketId !== 'zhuyu'">兑换渠道<select v-model="exchangeChannel"><option value="standard">常规 · 200白金币/张</option><option v-if="ticketId === 'fuchuan'" value="monthly-shop">月卡商店 · 1600白金币/10张</option></select></label>
          <p v-if="action === 'exchange' && ticketId === 'zhuyu'">每个茱萸兑换 50 白金币，仅记录已实际领取的白金币。</p>
          <label v-if="action === 'gain'">奖励来源<input v-model="source" type="text" maxlength="64" placeholder="例如：活动奖励、邮件奖励" required /></label>
          <label>数量（{{ ticketId === 'zhuyu' ? '个' : '张' }}）<span class="draw-quantity"><button type="button" :aria-label="ticketId === 'zhuyu' ? '减少茱萸数量' : '减少符传数量'" :disabled="Number(quantity) <= step" @click="adjust(-1)"><Minus :size="14" aria-hidden="true" /></button><input v-model="quantity" type="text" inputmode="numeric" :aria-label="ticketId === 'zhuyu' ? '茱萸数量' : '符传数量'" required /><button type="button" :aria-label="ticketId === 'zhuyu' ? '增加茱萸数量' : '增加符传数量'" @click="adjust(1)"><Plus :size="14" aria-hidden="true" /></button></span></label>
        </div>
        <p v-if="action === 'exchange' && exchangeChannel === 'monthly-shop'">每份10张普通符传；此处记录已实际购买的数量，不判断游戏内购买资格或剩余限购次数。</p>
      </fieldset>
      <p v-if="preview.error" class="draw-hint">{{ preview.error }}</p>
      <ul v-else class="draw-preview" aria-label="本次库存变化" aria-live="polite"><li v-for="row in preview.rows" :key="row.id"><strong>{{ row.name }} {{ row.count > 0 ? '+' : '−' }}{{ Math.abs(row.count).toLocaleString() }}</strong><span>{{ row.before.toLocaleString() }} → {{ row.after.toLocaleString() }}</span></li></ul>
      <p v-if="pending && !saving">结果尚未确认，草稿已锁定；请原样重试，确认前不要在其他入口重复记录。</p>
      <button type="submit" class="btn primary" :disabled="saving || disabled || conflict || (!pending && !!preview.error)">{{ saving ? '正在记账…' : pending ? '原样重试' : '确认记账' }}</button>
    </form>
  </component>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
import { Minus, Plus } from '@lucide/vue'
import { getDrawResources, recordDrawResources } from '../../api/drawResources.js'
import { DRAW_TICKETS, drawResourcePreview, resourceEntrySummary } from '../../data/inventory/drawResources.js'
import { dialog } from '../../utils/dialog.js'

const props = defineProps({ accountId: { type: String, required: true }, userId: { type: String, required: true }, game: { type: String, required: true }, disabled: Boolean, embedded: Boolean, operation: { type: String, default: 'use' } })
const emit = defineEmits(['busy', 'recorded'])
const context = ref(null), loading = ref(false), saving = ref(false), confirming = ref(false), pending = ref(null), conflict = ref(false)
const action = ref('gain'), ticketId = ref('fuchuan'), quantity = ref('1'), source = ref(''), exchangeChannel = ref('standard')
const error = ref(''), notice = ref('')
let sequence = 0, opened = props.embedded
const locked = computed(() => saving.value || confirming.value || !!pending.value)
const channel = computed(() => action.value === 'exchange' ? exchangeChannel.value : action.value === 'use' ? 'use' : source.value.trim())
const step = computed(() => action.value === 'exchange' && exchangeChannel.value === 'monthly-shop' ? 10 : 1)
const draftBaseline = ref('')
const draft = computed(() => ({ action: action.value, ticketId: ticketId.value, quantity: quantity.value, channel: channel.value }))
const preview = computed(() => {
  try { return { rows: drawResourcePreview(draft.value, context.value?.balances), error: '' } }
  catch (err) { return { rows: [], error: err.message } }
})
watch(locked, value => emit('busy', value), { flush: 'sync' })
watch([action, ticketId, exchangeChannel], () => {
  if (action.value !== 'exchange' && ticketId.value === 'zhuyu') ticketId.value = 'fuchuan'
  if (ticketId.value !== 'fuchuan') exchangeChannel.value = 'standard'
  if (action.value === 'exchange' && exchangeChannel.value === 'monthly-shop' && (Number(quantity.value) < 10 || Number(quantity.value) % 10 !== 0)) quantity.value = '10'
})
function adjust(direction) {
  const value = Number(quantity.value)
  if (Number.isInteger(value)) quantity.value = String(Math.min(2147483647, Math.max(step.value, value + direction * step.value)))
}
async function load() {
  if (locked.value || !props.accountId || !props.userId || props.disabled) return
  const seq = ++sequence, account = props.accountId, user = props.userId, game = props.game
  context.value = null; loading.value = true; error.value = ''; conflict.value = false
  try {
    const data = await getDrawResources(account, user)
    if (seq !== sequence) return
    if (data.account_id !== account || data.game !== game || !Number.isSafeInteger(data.inventory_revision) || data.inventory_revision < 0) throw new Error('库存上下文不匹配，请重新读取')
    context.value = data
  } catch (err) { if (seq === sequence) error.value = err.message || '库存读取失败' }
  finally { if (seq === sequence) loading.value = false }
}
function onToggle(event) { opened = event.currentTarget.open; if (opened && !context.value && !loading.value) load() }
async function submit() {
  if (props.disabled || saving.value || confirming.value || conflict.value || !context.value || (!pending.value && preview.value.error)) return
  const seq = sequence, account = props.accountId, user = props.userId
  if (!pending.value) {
    const body = {
      account_id: account, game: props.game, operation_id: crypto.randomUUID(), expected_inventory_revision: context.value.inventory_revision,
      action: action.value, ticket_id: ticketId.value, quantity: Number(quantity.value), channel: channel.value
    }
    const rows = preview.value.rows
    confirming.value = true
    let confirmed
    try {
      confirmed = await dialog.confirm({ title: '确认本次资源记账？', message: rows.map(row => `${row.name} ${row.count > 0 ? '+' : '−'}${Math.abs(row.count)}，余额 ${row.after}`).join('；'), confirmText: '确认记账', cancelText: '返回修改' })
    } finally { if (seq === sequence) confirming.value = false }
    if (!confirmed || seq !== sequence || props.disabled) return
    pending.value = body
  }
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const result = await recordDrawResources(pending.value, user)
    if (seq !== sequence) return
    if (result?.account_id !== account || result?.record_id !== `yuanhub:draw:${pending.value.operation_id}`) throw new Error('返回结果无法确认')
    notice.value = '已记录：' + resourceEntrySummary(result.entries, result.record_type)
    pending.value = null
    draftBaseline.value = JSON.stringify(draft.value)
    context.value = null
    emit('recorded', account)
  } catch (err) {
    if (seq !== sequence) return
    error.value = err.message || '记账结果无法确认'
    if ([400, 404, 409, 422].includes(err.status)) { pending.value = null; conflict.value = true }
  } finally { if (seq === sequence) saving.value = false }
  if (seq === sequence && !pending.value && !conflict.value) await load()
}
async function confirmDiscard() {
  if (locked.value) return false
  if (JSON.stringify(draft.value) === draftBaseline.value) return true
  const seq = sequence
  const confirmed = await dialog.confirm({ title: '放弃符传记账草稿？', message: '本次尚未提交的内容将清空。', confirmText: '放弃草稿', cancelText: '继续填写' })
  return confirmed && seq === sequence
}
watch(() => props.operation, value => { if (props.embedded && ['use', 'exchange'].includes(value)) action.value = value })
watch(() => [props.accountId, props.userId, props.game], () => {
  ++sequence; context.value = null; pending.value = null; loading.value = false; saving.value = false; confirming.value = false; conflict.value = false
  action.value = 'gain'; ticketId.value = 'fuchuan'; quantity.value = '1'; source.value = ''; exchangeChannel.value = 'standard'; error.value = ''; notice.value = ''
  if (props.embedded) action.value = ['use', 'exchange'].includes(props.operation) ? props.operation : 'use'
  draftBaseline.value = JSON.stringify(draft.value)
  if (opened) load()
}, { immediate: true, flush: 'sync' })
watch(() => props.disabled, value => { if (!value && opened && !context.value && !loading.value && !locked.value && !conflict.value) load() })
function beforeUnload(event) { if (locked.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
if (inject(matchedRouteKey, null)?.value) onBeforeRouteLeave(confirmDiscard)
onBeforeUnmount(() => { ++sequence; window.removeEventListener('beforeunload', beforeUnload); emit('busy', false) })
defineExpose({ confirmDiscard, locked })
</script>

<style scoped>
.draw-resource-entry { margin: 16px 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: 12px; color: var(--ink); background: var(--surface); }
summary { cursor: pointer; font-weight: 700; }
summary span { font-weight: 400; }
p { line-height: 1.6; }
fieldset { min-width: 0; margin: 12px 0; padding: 0; border: 0; }
.draw-fields { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
label { display: grid; gap: 6px; min-width: 0; flex: 1 1 160px; }
input, select { box-sizing: border-box; min-width: 0; width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: inherit; }
.draw-quantity { display: flex; gap: 6px; }
.draw-quantity input { text-align: center; }
.draw-quantity button { display: grid; place-items: center; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); cursor: pointer; }
.draw-preview { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 16px 0; padding: 0; list-style: none; }
.draw-preview li { display: grid; gap: 4px; }
.draw-preview span, .draw-hint { color: var(--ink-60); }
:is(input, select, button, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 640px) { summary span { display: block; margin-top: 4px; font-size: 13px; } label { flex-basis: 100%; } }
</style>
