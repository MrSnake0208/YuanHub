<template>
  <div class="mailbox-container">
    <div class="mail-quick">
      <Mail :size="22" class="mail-quick-icon" aria-hidden="true" />
      <strong>待领邮件 <b>{{ loaded ? mailCount : '—' }}</b> 封</strong>
      <span v-if="loaded && mailCount" class="mail-summary">{{ storedTotals.coins.toLocaleString() }} 白金币 · {{ storedTotals.tickets.toLocaleString() }} 符传</span>
      <div class="mail-quick-actions"><button type="button" class="btn ghost" aria-label="录入／调整储备" :disabled="disabled || locked || !loaded || conflict" @click="openPanel('manage')">录入／调整储备</button><button v-if="loaded && mailCount || pendingClaim" type="button" class="mail-manage" :disabled="disabled || busy || conflict" @click="pendingClaim ? panel = 'claim' : openPanel('claim')">{{ pendingClaim ? '确认领取结果' : '记录领取' }}</button></div>
    </div>
    <p v-if="loading" class="mail-feedback" role="status">正在读取邮件…</p>
    <p v-if="error && !panel" class="mail-feedback" role="alert">{{ error }}</p>
    <button v-if="!loaded && !loading || conflict" type="button" class="mail-manage" :disabled="locked || disabled" @click="reload">重新读取</button>
    <p v-if="notice && !panel" class="mail-feedback" role="status">{{ notice }}</p>
    <InventoryQuickDialog :open="!!panel" :title="panel === 'claim' ? '记录邮件领取' : '管理邮件储备'" :locked="locked" @close="closePanel">
      <form v-if="panel === 'manage' && loaded" class="mailbox-manage-form" @submit.prevent="save">
        <fieldset class="panel-fields" :disabled="locked || disabled || conflict">
          <legend>白金币月卡邮件</legend>
          <p class="panel-note">同一单封奖励的邮件放在一组。</p>
          <div v-for="(row, index) in draft.white_coin_mails" :key="index" class="mailbox-row">
            <label>每封白金币<input v-model.number="row.coins_per_mail" :aria-label="`第${index + 1}行每封白金币`" type="number" min="0" :max="LIMIT" step="1" required inputmode="numeric" /></label>
            <div class="mail-count-field"><label :for="`${claimId}-reserve-${index}`">未领取封数</label><div class="mail-stepper">
              <button type="button" :aria-label="`减少第${index + 1}行白金币邮件一封`" :disabled="!amountValid(row.count) || row.count === 0" @click="row.count--">−</button>
              <input :id="`${claimId}-reserve-${index}`" v-model.number="row.count" :aria-label="`第${index + 1}行白金币邮件封数`" type="number" min="0" :max="LIMIT" step="1" required inputmode="numeric" />
              <button type="button" :aria-label="`增加第${index + 1}行白金币邮件一封`" :disabled="!amountValid(row.count) || row.count === LIMIT" @click="row.count++">＋</button>
            </div></div>
            <button type="button" class="mail-manage" :aria-label="`移除第${index + 1}行白金币邮件`" @click="draft.white_coin_mails.splice(index, 1)">移除</button>
          </div>
          <button type="button" class="btn ghost" :disabled="draft.white_coin_mails.length >= 20" @click="draft.white_coin_mails.push({ count: 0, coins_per_mail: 90 })">添加白金币邮件</button>
        </fieldset>
        <fieldset class="panel-fields" :disabled="locked || disabled || conflict"><legend>符传月卡邮件</legend><div class="mail-count-field"><label :for="`${claimId}-reserve-tickets`">未领取封数</label><div class="mail-stepper">
          <button type="button" aria-label="减少符传邮件一封" :disabled="!amountValid(draft.fu_chuan_mail_count) || draft.fu_chuan_mail_count === 0" @click="draft.fu_chuan_mail_count--">−</button>
          <input :id="`${claimId}-reserve-tickets`" v-model.number="draft.fu_chuan_mail_count" aria-label="符传邮件封数" type="number" min="0" :max="LIMIT" step="1" required inputmode="numeric" />
          <button type="button" aria-label="增加符传邮件一封" :disabled="!amountValid(draft.fu_chuan_mail_count) || draft.fu_chuan_mail_count === LIMIT" @click="draft.fu_chuan_mail_count++">＋</button>
        </div></div><p class="panel-note">每封 3 个普通符传</p></fieldset>
        <p aria-live="polite">{{ valid ? `待领取合计：${totals.coins.toLocaleString()} 白金币 · ${totals.tickets.toLocaleString()} 普通符传` : '封数及每封奖励须为0至1000000的整数' }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <button v-if="conflict" type="button" class="mail-manage" @click="reload">重新读取</button>
        <div class="panel-actions"><button type="button" class="btn ghost" :disabled="locked" @click="closePanel">取消</button><button type="submit" class="btn primary" :disabled="locked || disabled || conflict || !canSave || !valid">{{ busy ? '保存中…' : '保存邮件储备' }}</button></div>
      </form>
      <form v-if="panel === 'claim' && selection" class="mailbox-claim-form" @submit.prevent="claim">
        <fieldset class="panel-fields mail-claim-fields" :disabled="locked || disabled || conflict">
          <div class="mail-claim-heading"><p class="panel-note">填写本次实际领取的封数，未领取的填 0。</p><button type="button" class="mail-manage mail-claim-fill" @click="selectAllMails">全部填入</button></div>
          <div class="mail-claim-list">
            <div v-for="(row, index) in stored.white_coin_mails" v-show="row.count > 0" :key="index" class="mail-claim-row">
              <div class="mail-claim-resource">
                <img src="/inventory-icons/items/baijinbi.png" alt="" class="mail-claim-icon" />
                <div><strong>白金币邮件</strong><p class="mail-claim-meta"><span>每封 {{ row.coins_per_mail }} 白金币</span><span>待领 {{ row.count }} 封</span></p></div>
              </div>
              <label class="mail-claim-input">本次领取（封）<input v-model.number="selection.white_coin_mail_counts[index]" :aria-label="`第${index + 1}组白金币邮件本次领取封数`" :aria-invalid="!!claimErrors.coins[index]" :aria-describedby="claimErrors.coins[index] ? `${claimId}-coin-${index}-error` : undefined" type="number" min="0" :max="row.count" step="1" inputmode="numeric" required /></label>
              <p v-if="claimErrors.coins[index]" :id="`${claimId}-coin-${index}-error`" class="mail-claim-error" role="alert"><CircleAlert :size="14" aria-hidden="true" />{{ claimErrors.coins[index] }}</p>
            </div>
            <div v-if="stored.fu_chuan_mail_count" class="mail-claim-row">
              <div class="mail-claim-resource">
                <img src="/inventory-icons/items/fuchuan.png" alt="" class="mail-claim-icon" />
                <div><strong>符传邮件</strong><p class="mail-claim-meta"><span>每封 3 张</span><span>待领 {{ stored.fu_chuan_mail_count }} 封</span></p></div>
              </div>
              <label class="mail-claim-input">本次领取（封）<input v-model.number="selection.fu_chuan_mail_count" aria-label="符传邮件本次领取封数" :aria-invalid="!!claimErrors.tickets" :aria-describedby="claimErrors.tickets ? `${claimId}-ticket-error` : undefined" type="number" min="0" :max="stored.fu_chuan_mail_count" step="1" inputmode="numeric" required /></label>
              <p v-if="claimErrors.tickets" :id="`${claimId}-ticket-error`" class="mail-claim-error" role="alert"><CircleAlert :size="14" aria-hidden="true" />{{ claimErrors.tickets }}</p>
            </div>
          </div>
        </fieldset>
        <div class="mail-claim-result" :class="{ 'is-invalid': !claimValid, 'has-reward': claimValid && (claimTotals.coins || claimTotals.tickets) }" aria-live="polite" aria-atomic="true">
          <Gift :size="28" aria-hidden="true" />
          <div><p class="panel-note">背包预计增加</p><p class="mail-claim-totals"><span>{{ claimTotals.coins.toLocaleString() }} 白金币</span> · <span>{{ claimTotals.tickets.toLocaleString() }} 符传</span></p></div>
        </div>
        <p v-if="claimValid" class="panel-note">待领邮件减少 {{ selection.white_coin_mail_counts.reduce((sum, count) => sum + count, 0) + selection.fu_chuan_mail_count }} 封；剩余 {{ (storedTotals.coins - claimTotals.coins).toLocaleString() }} 白金币 · {{ (storedTotals.tickets - claimTotals.tickets).toLocaleString() }} 符传。</p>
        <p v-if="!claimValid" class="mail-claim-status is-invalid" role="alert"><CircleAlert :size="14" aria-hidden="true" />存在数量错误，暂不能确认记录。</p>
        <p v-else class="panel-note mail-claim-status"><Info :size="14" aria-hidden="true" />只记录刚领取、尚未计入当前数量的邮件。</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <button v-if="conflict" type="button" class="mail-manage" @click="reload">重新读取</button>
        <p v-if="pendingClaim && !busy" role="status">领取结果尚未确认，请原样重试。</p>
        <div class="panel-actions"><button type="button" class="btn ghost" :disabled="locked" @click="closePanel">取消</button><button type="submit" class="btn primary" :disabled="busy || disabled || conflict || !claimValid || !claimTotals.coins && !claimTotals.tickets">{{ busy ? '记录中…' : pendingClaim ? '原样重试领取' : '确认记录领取' }}</button></div>
      </form>
    </InventoryQuickDialog>
  </div>
</template>
<script setup>
import { computed, inject, onBeforeUnmount, ref, useId, watch } from 'vue'
import { CircleAlert, Gift, Info, Mail } from '@lucide/vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
import { getMailboxReserve, saveMailboxReserve, claimMailboxReserve } from '../../api/mailboxReserve.js'
import InventoryQuickDialog from './InventoryQuickDialog.vue'
import { dialog } from '../../utils/dialog.js'

const props = defineProps({ accountId: { type: String, required: true }, userId: { type: String, required: true }, disabled: Boolean })
const emit = defineEmits(['busy', 'recorded', 'saved'])
const LIMIT = 1000000
const claimId = useId()
const empty = () => ({ white_coin_mails: [], fu_chuan_mail_count: 0 })
const draft = ref(empty()), baseline = ref(''), version = ref(0), updatedAt = ref(null)
const loading = ref(false), loaded = ref(false), busy = ref(false), conflict = ref(false), error = ref(''), notice = ref('')
const panel = ref(''), selection = ref(null), pendingClaim = ref(null)
const locked = computed(() => busy.value || !!pendingClaim.value)
watch(locked, value => emit('busy', value), { flush: 'sync' })
const stored = computed(() => baseline.value ? JSON.parse(baseline.value) : empty())
const mailCount = computed(() => stored.value.white_coin_mails.reduce((sum, row) => sum + row.count, 0) + stored.value.fu_chuan_mail_count)
const storedTotals = computed(() => ({ coins: stored.value.white_coin_mails.reduce((sum, row) => sum + row.count * row.coins_per_mail, 0), tickets: stored.value.fu_chuan_mail_count * 3 }))
const claimValid = computed(() => selection.value && selection.value.white_coin_mail_counts.every((count, index) => amountValid(count) && count <= stored.value.white_coin_mails[index].count) && amountValid(selection.value.fu_chuan_mail_count) && selection.value.fu_chuan_mail_count <= stored.value.fu_chuan_mail_count)
const claimTotals = computed(() => ({ coins: selection.value?.white_coin_mail_counts.reduce((sum, count, index) => sum + (Number(count) || 0) * stored.value.white_coin_mails[index].coins_per_mail, 0) || 0, tickets: (selection.value?.fu_chuan_mail_count || 0) * 3 }))
const claimErrors = computed(() => ({
  coins: selection.value?.white_coin_mail_counts.map((count, index) => claimFieldError(count, stored.value.white_coin_mails[index].count)) || [],
  tickets: claimFieldError(selection.value?.fu_chuan_mail_count, stored.value.fu_chuan_mail_count)
}))
function claimFieldError(count, max) {
  if (Number.isInteger(count) && count > max) return `最多可领取 ${max} 封，当前多填了 ${count - max} 封`
  return amountValid(count) ? '' : `领取封数须为 0 至 ${max} 之间的整数。`
}
function openPanel(value) {
  if (props.disabled || locked.value || !loaded.value || conflict.value) return
  error.value = ''; notice.value = ''
  if (value === 'claim') resetClaimSelection()
  panel.value = value
}
function resetClaimSelection() {
  selection.value = { white_coin_mail_counts: stored.value.white_coin_mails.map(() => 0), fu_chuan_mail_count: 0 }
}
function selectAllMails() {
  if (props.disabled || locked.value || conflict.value || !loaded.value) return
  selection.value = { white_coin_mail_counts: stored.value.white_coin_mails.map(row => row.count), fu_chuan_mail_count: stored.value.fu_chuan_mail_count }
}
async function closePanel() {
  const seq = sequence
  if (!(await confirmDiscard()) || seq !== sequence || locked.value) return
  draft.value = JSON.parse(baseline.value || JSON.stringify(empty()))
  panel.value = ''; selection.value = null; error.value = ''
}
let sequence = 0
let loadPromise = null
const dirty = computed(() => loaded.value && JSON.stringify(draft.value) !== baseline.value)
const canSave = computed(() => loaded.value && (dirty.value || !updatedAt.value))
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
  if (!(await confirmDiscard())) return
  await (loadPromise = load())
  if (loaded.value && panel.value === 'claim') resetClaimSelection()
}
async function save() {
  if (!loaded.value || locked.value || props.disabled || conflict.value || !canSave.value || !valid.value) return
  const seq = sequence, account = props.accountId, user = props.userId
  busy.value = true
  error.value = ''
  try {
    const data = await saveMailboxReserve(account, user, { expected_version: version.value, ...JSON.parse(JSON.stringify(draft.value)) })
    if (seq === sequence) { apply(data); notice.value = '邮件储备已保存'; panel.value = ''; emit('saved', account) }
  } catch (err) {
    if (seq === sequence) {
      error.value = [400, 401, 403, 404, 409, 422].includes(err.status) ? (err.message || '保存失败，草稿已保留') : '保存结果尚未确认，请重新读取并核对储备后再修改。'
      conflict.value = err.status === 409 || ![400, 401, 403, 404, 422].includes(err.status)
    }
  } finally {
    if (seq === sequence) busy.value = false
  }
}
async function claim() {
  if (props.disabled || busy.value || conflict.value || !loaded.value || dirty.value) return
  const seq = sequence, account = props.accountId, user = props.userId
  if (!pendingClaim.value) {
    if (!claimValid.value || !claimTotals.value.coins && !claimTotals.value.tickets) return
    pendingClaim.value = { expected_version: version.value, operation_id: crypto.randomUUID(), selection: JSON.parse(JSON.stringify(selection.value)) }
  }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const data = await claimMailboxReserve(account, user, pendingClaim.value)
    if (seq !== sequence) return
    if (data?.account_id !== account || !Number.isSafeInteger(data.version) || data.version <= pendingClaim.value.expected_version) throw new Error('领取结果无法确认，请原样重试')
    apply(data); pendingClaim.value = null; panel.value = ''; selection.value = null; notice.value = '已记录领取，库存和待领封数已同步。'
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
  pendingClaim.value = null; panel.value = ''; selection.value = null
  conflict.value = false
  notice.value = ''
  error.value = ''
  emit('busy', false)
  loadPromise = props.accountId && props.userId ? load() : null
}, { immediate: true, flush: 'sync' })
function beforeUnload(event) {
  if (dirty.value || locked.value) { event.preventDefault(); event.returnValue = '' }
}
window.addEventListener('beforeunload', beforeUnload)
if (inject(matchedRouteKey, null)?.value) onBeforeRouteLeave(confirmDiscard)
onBeforeUnmount(() => { ++sequence; window.removeEventListener('beforeunload', beforeUnload); emit('busy', false) })
async function openManage() {
  const seq = sequence
  await loadPromise
  if (seq === sequence) openPanel('manage')
}
defineExpose({ confirmDiscard, openManage })
</script>
<style scoped src="./mailboxReserveDesktop.css"></style>
<style scoped src="./mailboxReserveMobile.css"></style>
