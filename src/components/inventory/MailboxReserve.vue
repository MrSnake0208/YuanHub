<template>
  <details class="mailbox-reserve" @invalid.capture="$event.currentTarget.open = true">
    <summary>邮箱储备 <span v-if="loaded">{{ totals.coins.toLocaleString() }} 白金币 · {{ totals.tickets.toLocaleString() }} 普通符传<span v-if="dirty">（未保存）</span></span></summary>
    <p>只记录未领取的月卡邮件，不计入背包库存及奖励统计。领取后请手动更新剩余封数。</p>
    <p v-if="loading" role="status">正在读取邮箱储备…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="!loaded && !loading || conflict" type="button" class="btn ghost" :disabled="busy" @click="reload">重新读取</button>
    <form v-if="loaded" @submit.prevent="save">
      <fieldset :disabled="busy || conflict">
        <legend>白金币月卡邮件</legend>
        <p class="mailbox-hint">不同单封奖励分行填写，单封数值以实际邮件为准。</p>
        <div v-for="(row, index) in draft.white_coin_mails" :key="index" class="mailbox-row">
          <label>未领取封数<input v-model.number="row.count" :aria-label="`第${index + 1}行白金币邮件封数`" type="number" min="0" :max="LIMIT" step="1" required inputmode="numeric" /></label>
          <label>每封白金币<input v-model.number="row.coins_per_mail" :aria-label="`第${index + 1}行每封白金币`" type="number" min="0" :max="LIMIT" step="1" required inputmode="numeric" /></label>
          <button type="button" class="btn ghost" :aria-label="`移除第${index + 1}行白金币邮件`" @click="draft.white_coin_mails.splice(index, 1)">移除</button>
        </div>
        <button type="button" class="btn ghost" :disabled="draft.white_coin_mails.length >= 20" @click="draft.white_coin_mails.push({ count: 0, coins_per_mail: 90 })">添加白金币邮件</button>
      </fieldset>
      <fieldset :disabled="busy || conflict">
        <legend>符传月卡邮件</legend>
        <label class="mailbox-ticket">未领取封数<input v-model.number="draft.fu_chuan_mail_count" aria-label="符传邮件封数" type="number" min="0" :max="LIMIT" step="1" required inputmode="numeric" /><span>每封 3 个普通符传</span></label>
      </fieldset>
      <p aria-live="polite">{{ valid ? `待领取合计：${totals.coins.toLocaleString()} 白金币 · ${totals.tickets.toLocaleString()} 普通符传` : '封数及每封奖励须为0至1000000的整数' }}</p>
      <div class="mailbox-actions">
        <button type="submit" class="btn primary" :disabled="busy || conflict || !dirty || !valid">{{ busy ? '保存中…' : '保存邮箱储备' }}</button>
        <span role="status">{{ dirty ? '有未保存修改' : notice }}</span>
        <span v-if="updatedAt">最近保存：<time :datetime="updatedAt">{{ new Date(updatedAt).toLocaleString() }}</time></span>
      </div>
    </form>
  </details>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
import { getMailboxReserve, saveMailboxReserve } from '../../api/mailboxReserve.js'
import { dialog } from '../../utils/dialog.js'

const props = defineProps({ accountId: { type: String, required: true }, userId: { type: String, required: true } })
const emit = defineEmits(['busy'])
const LIMIT = 1000000
const empty = () => ({ white_coin_mails: [], fu_chuan_mail_count: 0 })
const draft = ref(empty()), baseline = ref(''), version = ref(0), updatedAt = ref(null)
const loading = ref(false), loaded = ref(false), busy = ref(false), conflict = ref(false), error = ref(''), notice = ref('')
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
  if (busy.value) return false
  if (!dirty.value) return true
  const seq = sequence
  const confirmed = await dialog.confirm({ title: '放弃未保存的邮箱储备？', message: '已保存的数据不受影响。', confirmText: '放弃修改', cancelText: '继续编辑' })
  return confirmed && seq === sequence
}
async function reload() {
  if (await confirmDiscard()) await load()
}
async function save() {
  if (!loaded.value || busy.value || conflict.value || !dirty.value || !valid.value) return
  const seq = sequence, account = props.accountId, user = props.userId
  busy.value = true
  emit('busy', true)
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
    if (seq === sequence) { busy.value = false; emit('busy', false) }
  }
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
  conflict.value = false
  notice.value = ''
  error.value = ''
  emit('busy', false)
  if (props.accountId && props.userId) load()
}, { immediate: true, flush: 'sync' })
function beforeUnload(event) {
  if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = '' }
}
window.addEventListener('beforeunload', beforeUnload)
if (inject(matchedRouteKey, null)?.value) onBeforeRouteLeave(confirmDiscard)
onBeforeUnmount(() => { ++sequence; window.removeEventListener('beforeunload', beforeUnload); emit('busy', false) })
defineExpose({ confirmDiscard })
</script>

<style scoped>
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
