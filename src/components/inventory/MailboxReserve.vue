<template>
  <div class="mailbox-container" :class="{ 'compact-mailbox': compact }">
    <div v-if="compact" class="mail-quick">
      <strong>待领邮件 <b>{{ loaded ? mailCount : '—' }}</b> 封</strong>
      <span v-if="loaded">{{ totals.coins.toLocaleString() }} 白金币 · {{ totals.tickets.toLocaleString() }} 符传</span>
      <button type="button" class="btn ghost" :disabled="disabled || confirming || busy || conflict || !loaded || dirty || (!pendingClaim && !totals.coins && !totals.tickets)" @click="claim">{{ busy ? '记录中…' : pendingClaim ? '原样重试领取' : '记录邮件领取' }}</button>
      <small v-if="dirty">先保存邮件修改，再记录领取。</small>
    </div>
    <p v-if="loading" role="status">正在读取邮箱储备…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="pendingClaim && !busy" role="status">领取结果尚未确认，请原样重试；确认前不要重复记录。</p>
    <button v-if="!loaded && !loading || conflict" type="button" class="btn ghost" :disabled="locked || disabled" @click="reload">重新读取</button>
    <details class="mailbox-reserve" @invalid.capture="$event.currentTarget.open = true">
    <summary>{{ compact ? '管理邮件' : '邮箱储备' }} <span v-if="loaded && !compact">{{ totals.coins.toLocaleString() }} 白金币 · {{ totals.tickets.toLocaleString() }} 普通符传<span v-if="dirty">（未保存）</span></span></summary>
    <p>待领储备不计入库存。请按实际邮件填写封数和单封奖励。</p>
    <form v-if="loaded" @submit.prevent="save">
      <fieldset :disabled="locked || disabled || conflict">
        <legend>白金币月卡邮件</legend>
        <p class="mailbox-hint">不同单封奖励分行填写，单封数值以实际邮件为准。</p>
        <div v-for="(row, index) in draft.white_coin_mails" :key="index" class="mailbox-row">
          <label>未领取封数<input v-model.number="row.count" :aria-label="`第${index + 1}行白金币邮件封数`" type="number" min="0" :max="LIMIT" step="1" required inputmode="numeric" /></label>
          <label>每封白金币<input v-model.number="row.coins_per_mail" :aria-label="`第${index + 1}行每封白金币`" type="number" min="0" :max="LIMIT" step="1" required inputmode="numeric" /></label>
          <button type="button" class="btn ghost" :aria-label="`移除第${index + 1}行白金币邮件`" @click="draft.white_coin_mails.splice(index, 1)">移除</button>
        </div>
        <button type="button" class="btn ghost" :disabled="draft.white_coin_mails.length >= 20" @click="draft.white_coin_mails.push({ count: 0, coins_per_mail: 90 })">添加白金币邮件</button>
      </fieldset>
      <fieldset :disabled="locked || disabled || conflict">
        <legend>符传月卡邮件</legend>
        <label class="mailbox-ticket">未领取封数<input v-model.number="draft.fu_chuan_mail_count" aria-label="符传邮件封数" type="number" min="0" :max="LIMIT" step="1" required inputmode="numeric" /><span>每封 3 个普通符传</span></label>
      </fieldset>
      <p aria-live="polite">{{ valid ? `待领取合计：${totals.coins.toLocaleString()} 白金币 · ${totals.tickets.toLocaleString()} 普通符传` : '封数及每封奖励须为0至1000000的整数' }}</p>
      <div class="mailbox-actions">
        <button type="submit" class="btn primary" :disabled="locked || disabled || conflict || !dirty || !valid">{{ busy ? '保存中…' : '保存邮箱储备' }}</button>
        <span role="status">{{ dirty ? '有未保存修改' : notice }}</span>
        <span v-if="updatedAt">最近保存：<time :datetime="updatedAt">{{ new Date(updatedAt).toLocaleString() }}</time></span>
      </div>
    </form>
    </details>
    <p v-if="compact && notice" class="mail-notice" role="status">{{ notice }}</p>
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
import { getMailboxReserve, saveMailboxReserve, claimMailboxReserve } from '../../api/mailboxReserve.js'
import { dialog } from '../../utils/dialog.js'

const props = defineProps({ accountId: { type: String, required: true }, userId: { type: String, required: true }, compact: Boolean, disabled: Boolean })
const emit = defineEmits(['busy', 'recorded'])
const LIMIT = 1000000
const empty = () => ({ white_coin_mails: [], fu_chuan_mail_count: 0 })
const draft = ref(empty()), baseline = ref(''), version = ref(0), updatedAt = ref(null)
const loading = ref(false), loaded = ref(false), busy = ref(false), conflict = ref(false), error = ref(''), notice = ref('')
const pendingClaim = ref(null), confirming = ref(false)
const locked = computed(() => busy.value || confirming.value || !!pendingClaim.value)
watch(locked, value => emit('busy', value), { flush: 'sync' })
const mailCount = computed(() => draft.value.white_coin_mails.reduce((sum, row) => sum + (amountValid(row.count) ? row.count : 0), 0) + (amountValid(draft.value.fu_chuan_mail_count) ? draft.value.fu_chuan_mail_count : 0))
let sequence = 0
const dirty = computed(() => loaded.value && JSON.stringify(draft.value) !== baseline.value)
const amountValid = value => Number.isInteger(value) && value >= 0 && value <= LIMIT
const valid = computed(() => amountValid(draft.value.fu_chuan_mail_count) && draft.value.white_coin_mails.length <= 20 && draft.value.white_coin_mails.every(row => amountValid(row.count) && amountValid(row.coins_per_mail)))
const totals = computed(() => ({
  coins: draft.value.white_coin_mails.reduce((sum, row) => sum + (amountValid(row.count) && amountValid(row.coins_per_mail) ? row.count * row.coins_per_mail : 0), 0),
  tickets: amountValid(draft.value.fu_chuan_mail_count) ? draft.value.fu_chuan_mail_count * 3 : 0
}))
function apply(data) {
  if (data.account_id !== props.accountId) throw new Error('返回的游戏账号不匹配，请重新读取')
  draft.value = { white_coin_mails: data.white_coin_mails.map(row => ({ count: row.count, coins_per_mail: row.coins_per_mail })), fu_chuan_mail_count: data.fu_chuan_mail_count }
  baseline.value = JSON.stringify(draft.value)
  version.value = data.version
  updatedAt.value = data.updated_at
  loaded.value = true
  conflict.value = false
}
async function load() {
  const seq = ++sequence, account = props.accountId, user = props.userId
  loading.value = true
  loaded.value = false
  error.value = ''
  try {
    const data = await getMailboxReserve(account, user)
    if (seq === sequence) apply(data)
  } catch (err) {
    if (seq === sequence) error.value = err.message || '邮箱储备读取失败'
  } finally {
    if (seq === sequence) loading.value = false
  }
}
async function confirmDiscard() {
  if (locked.value) return false
  if (!dirty.value) return true
  const seq = sequence
  const confirmed = await dialog.confirm({ title: '放弃未保存的邮箱储备？', message: '已保存的数据不受影响。', confirmText: '放弃修改', cancelText: '继续编辑' })
  return confirmed && seq === sequence
}
async function reload() {
  if (await confirmDiscard()) await load()
}
async function save() {
  if (!loaded.value || locked.value || props.disabled || conflict.value || !dirty.value || !valid.value) return
  const seq = sequence, account = props.accountId, user = props.userId
  busy.value = true
  error.value = ''
  try {
    const data = await saveMailboxReserve(account, user, { expected_version: version.value, ...JSON.parse(JSON.stringify(draft.value)) })
    if (seq === sequence) { apply(data); notice.value = '已保存' }
  } catch (err) {
    if (seq === sequence) {
      error.value = err.message || '保存失败，草稿已保留'
      conflict.value = err.status === 409
    }
  } finally {
    if (seq === sequence) busy.value = false
  }
}
async function claim() {
  if (props.disabled || busy.value || confirming.value || conflict.value || !loaded.value || dirty.value) return
  const seq = sequence, account = props.accountId, user = props.userId
  if (!pendingClaim.value) {
    if (!totals.value.coins && !totals.value.tickets) return
    confirming.value = true
    let confirmed
    try {
      confirmed = await dialog.confirm({ title: '记录全部邮件领取？', message: `账号「${account}」：${mailCount.value} 封，${totals.value.coins} 白金币、${totals.value.tickets} 符传。仅记录刚领取且尚未计入当前数量的邮件；保存后待领封数归零。未全部领取请取消；部分领取可通过「记一笔」记录，并在管理邮件中更新剩余封数。`, confirmText: '已全部领取，记录', cancelText: '返回' })
    } finally { if (seq === sequence) confirming.value = false }
    if (!confirmed || seq !== sequence || props.disabled) return
    pendingClaim.value = { expected_version: version.value, operation_id: crypto.randomUUID() }
  }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const data = await claimMailboxReserve(account, user, pendingClaim.value)
    if (seq !== sequence) return
    if (data?.account_id !== account || !Number.isSafeInteger(data.version) || data.version <= pendingClaim.value.expected_version) throw new Error('领取结果无法确认，请原样重试')
    apply(data); pendingClaim.value = null; notice.value = '邮件领取已记录，库存与待领封数已同步。'
    emit('recorded', account)
  } catch (err) {
    if (seq !== sequence) return
    error.value = err.message || '领取结果无法确认，请原样重试'
    if ([400, 401, 403, 404, 409, 422].includes(err.status)) { pendingClaim.value = null; conflict.value = true }
  } finally { if (seq === sequence) busy.value = false }
}
watch(() => [props.accountId, props.userId], () => {
  ++sequence
  draft.value = empty()
  baseline.value = ''
  version.value = 0
  updatedAt.value = null
  loaded.value = false
  loading.value = false
  busy.value = false
  pendingClaim.value = null; confirming.value = false
  conflict.value = false
  notice.value = ''
  error.value = ''
  emit('busy', false)
  if (props.accountId && props.userId) load()
}, { immediate: true, flush: 'sync' })
function beforeUnload(event) {
  if (dirty.value || locked.value) { event.preventDefault(); event.returnValue = '' }
}
window.addEventListener('beforeunload', beforeUnload)
if (inject(matchedRouteKey, null)?.value) onBeforeRouteLeave(confirmDiscard)
onBeforeUnmount(() => { ++sequence; window.removeEventListener('beforeunload', beforeUnload); emit('busy', false) })
defineExpose({ confirmDiscard })
</script>

<style scoped>
.compact-mailbox { color: var(--ink); }
.mail-quick > strong { font: 800 15px/1.5 var(--font-b); }
.mail-quick > strong b { color: var(--theme-accent-text, var(--tea)); font: 800 24px/1 var(--font-d); }
.mail-quick > span, .mail-quick > small, .mail-notice { font-size: 12px; }
.compact-mailbox .mailbox-reserve { margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; }
.compact-mailbox .mailbox-reserve > summary { color: var(--ink-60); font-size: 12px; font-weight: 500; }
.compact-mailbox > p { font-size: 13px; overflow-wrap: anywhere; }

.mailbox-reserve { margin: 16px 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: 12px; color: var(--ink); background: var(--surface); }
.mailbox-reserve summary { cursor: pointer; font-weight: 700; }
.mailbox-reserve summary span { font-weight: 400; }
.mailbox-reserve p { line-height: 1.6; }
.mailbox-reserve fieldset { min-width: 0; margin: 12px 0; padding: 0; border: 0; }
.mailbox-reserve legend { font-weight: 700; }
.mailbox-hint { font-size: 13px; }
.mailbox-reserve label { display: grid; gap: 6px; min-width: 0; }
.mailbox-reserve input { box-sizing: border-box; min-width: 0; width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: inherit; }
.mailbox-reserve :is(input, button, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.mailbox-row { display: grid; align-items: end; gap: 10px; margin: 12px 0; }
.mailbox-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.mailbox-actions span { font-size: 13px; }
</style>
<style scoped src="./mailboxReserveMobile.css"></style>
<style scoped src="./mailboxReserveDesktop.css"></style>
