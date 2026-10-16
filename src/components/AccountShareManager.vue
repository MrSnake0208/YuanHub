<template>
  <section class="share-manager" :class="{ 'is-compact': compact }" :aria-labelledby="titleId">
    <div v-if="compact" class="share-overview">
      <p v-if="!loading && !error" class="share-summary" :class="{ 'is-active': scopes.length }" role="status" aria-live="polite">
        <strong>{{ busy ? '分享更新中…' : scopes.length ? '分享已开启' : '分享未开启' }}</strong>
        <span>仅开放已开启的内容，无需登录。</span>
      </p>
      <button class="share-button subtle" type="button" :disabled="loading || busy" @click="loadShare">刷新状态</button>
    </div>
    <div class="share-manager-heading">
      <slot name="heading" :title-id="titleId"><div><span class="section-kicker">分享链接</span><h2 :id="titleId">分享当前账号</h2></div></slot>
      <button v-if="!compact" class="share-button subtle" type="button" :disabled="loading || busy" @click="loadShare">刷新状态</button>
      <p v-if="!compact" class="share-description">两个视图共用分享码。拿到任一链接的人都能查看已开启的内容，无需登录；全部关闭后旧码失效。</p>
      <p v-else class="share-description share-immediate">更改权限后立即生效，无需额外保存。</p>
    </div>
    <p v-if="loading" class="share-state" role="status">正在读取分享状态…</p>
    <p v-else-if="error" class="share-state is-error" role="alert">{{ error }}</p>
    <template v-else>
      <div class="share-scopes" aria-label="公开内容">
        <label v-for="option in options" :key="option.scope" class="share-scope">
          <span>{{ option.label }}<template v-if="!compact">分享</template><small class="share-scope-status">{{ busy ? '更新中…' : scopes.includes(option.scope) ? '已开启' : '未开启' }}</small></span>
          <input type="checkbox" role="switch" :aria-label="option.label + '分享'" :checked="scopes.includes(option.scope)"
            :disabled="!accountId || busy" @change="toggleScope(option.scope, $event)" />
        </label>
      </div>
      <template v-if="share?.active && share.share_code">
        <h3 v-if="compact" class="share-links-title">分享链接</h3>
        <div v-for="option in options.filter(item => scopes.includes(item.scope))" :key="option.scope" class="share-values">
          <label><span>{{ option.label }}<template v-if="!compact">分享链接</template></span><input :value="link(option.scope)" :title="link(option.scope)" readonly :aria-label="option.label + '分享链接'" @focus="compact && $event.target.select()" /></label>
          <div class="share-actions">
            <button class="share-button" type="button" :aria-label="'复制' + option.label + '链接'" :disabled="busy" @click="copy(link(option.scope), option.label + '分享链接')"><Copy v-if="compact" :size="15" aria-hidden="true" />复制<template v-if="!compact">{{ option.label }}链接</template></button>
            <a class="share-button visit" :href="link(option.scope)" :target="compact ? '_blank' : undefined" :rel="compact ? 'noopener noreferrer' : undefined" :aria-label="'访问我的' + option.label"><ExternalLink v-if="compact" :size="15" aria-hidden="true" />{{ compact ? '访问' : '访问我的' + option.label }}</a>
          </div>
        </div>
      </template>
      <p v-else class="share-state">当前未公开任何内容。开启一种分享后，将生成分享链接。</p>
      <slot name="help">
        <p class="share-description share-private">仅公开所选内容，不包含备注、目标、计划或 OCR 记录。星石展示云端已保存背包，本机未同步修改不会出现在分享中。</p>
        <p class="share-description share-scope-note">密探 BOX 包含档案中原有的佩戴星石；星石背包公开当前云端背包的全部星石。关闭星石背包分享，不会移除密探 BOX 中已有的佩戴星石信息。</p>
      </slot>
      <component :is="compact ? 'details' : 'div'" v-if="share?.active && share.share_code" class="share-actions share-code-actions">
        <summary v-if="compact">更多管理</summary>
        <p v-if="compact" class="share-management-label">重新生成或全部撤销后，两个分享范围的旧链接立即失效。</p>
        <button class="share-button subtle" type="button" :disabled="busy" @click="regenerate">{{ compact ? '重新生成分享链接' : '重新生成' }}</button>
        <button class="share-button danger" type="button" :disabled="busy" @click="revoke">全部撤销</button>
      </component>
    </template>
    <p v-if="busy" class="share-state" role="status" aria-live="polite">正在更新分享状态…</p>
    <p v-if="message" class="share-message" role="status" aria-live="polite">{{ message }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { Copy, ExternalLink } from '@lucide/vue'
import { getAccountShare, setAccountShareScope, regenerateAccountShare, revokeAccountShare } from '../api/accountShare.js'
import { sharePath } from '../utils/shareLink.js'
import { dialog } from '../utils/dialog.js'
import { modalFocusState } from '../composables/useModalFocus.js'

const props = defineProps({ accountId: { type: String, required: true }, compact: { type: Boolean, default: false } })
const emit = defineEmits(['status-change', 'share-change'])
const titleId = 'account-share-title-' + useId()
const options = [{ scope: 'operator', label: '密探 BOX' }, { scope: 'star', label: '星石背包' }]
const share = ref(null), loading = ref(false), busy = ref(false), error = ref(''), message = ref('')
const scopes = computed(() => Array.isArray(share.value?.scopes) ? share.value.scopes : [])
// Keep the existing operator ledger badge scoped to operator, even for star-only accounts.
const status = computed(() => loading.value ? '读取中…' : busy.value ? '更新中…' : error.value ? '状态异常，请查看分享管理' : scopes.value.includes('operator') ? '已开启' : '未开启')
let requestSeq = 0, loadSeq = 0
const current = (id, seq) => props.accountId === id && seq === requestSeq
function link(scope) { return share.value?.share_code ? window.location.origin + sharePath(share.value.share_code, scope) : '' }
watch(status, value => emit('status-change', value), { immediate: true, flush: 'sync' })
watch([status, () => share.value, () => props.accountId], () => {
  emit('share-change', { accountId: props.accountId, status: status.value, link: status.value === '已开启' ? link('operator') : '', scopes: scopes.value })
}, { immediate: true })
defineExpose({ copyCurrentShare: () => status.value === '已开启' ? copy(link('operator'), '分享链接') : false })
const humanErr = err => err?.message && !/Failed to fetch|NetworkError|fetch/i.test(err.message) ? err.message : '网络异常，请稍后重试'

async function loadShare() {
  const id = props.accountId, seq = ++requestSeq, readSeq = ++loadSeq
  share.value = null; busy.value = false; error.value = ''; message.value = ''; loading.value = Boolean(id)
  if (!id) return
  try { const data = await getAccountShare(id); if (current(id, seq)) share.value = data }
  catch (err) { if (current(id, seq)) error.value = humanErr(err) }
  finally { if (readSeq === loadSeq) loading.value = false }
}
async function updateShare(action, success) {
  const id = props.accountId, seq = ++requestSeq
  busy.value = true; error.value = ''; message.value = ''
  try {
    const data = await action(id)
    if (!current(id, seq)) return
    share.value = data; message.value = success
  } catch (err) { if (current(id, seq)) error.value = humanErr(err) }
  finally { if (current(id, seq)) busy.value = false }
}
function toggleScope(scope, event) {
  const enabled = event.target.checked
  event.target.checked = scopes.value.includes(scope)
  if (!props.accountId || busy.value || loading.value) return
  return updateShare(id => setAccountShareScope(id, scope, enabled), enabled ? '分享已开启' : '该项分享已关闭')
}
async function regenerate() {
  const id = props.accountId, seq = requestSeq
  const ok = await dialog.confirm({ title: '重新生成分享链接', message: '密探与星石的旧链接都会立即失效，是否继续？', confirmText: '重新生成', type: 'danger' })
  if (ok && current(id, seq)) await updateShare(regenerateAccountShare, '新的分享链接已生成')
}
async function revoke() {
  const id = props.accountId, seq = requestSeq
  const ok = await dialog.confirm({ title: '撤销全部分享', message: '密探与星石分享都将关闭，两个旧链接都会立即失效。', confirmText: '全部撤销', type: 'danger' })
  if (ok && current(id, seq)) await updateShare(revokeAccountShare, '全部分享已撤销')
}
async function copy(value, label) {
  const id = props.accountId, seq = requestSeq
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(value)
  } catch {
    const textarea = document.createElement('textarea')
    let copied = false
    const focused = document.activeElement
    try {
      textarea.value = value; textarea.readOnly = true
      Object.assign(textarea.style, { position: 'fixed', opacity: '0', fontSize: '16px' })
      ;(modalFocusState.panel || document.body).appendChild(textarea)
      textarea.focus({ preventScroll: true }); textarea.select()
      copied = document.execCommand('copy')
    }
    catch { copied = false }
    finally { textarea.remove(); focused?.focus({ preventScroll: true }) }
    if (!copied) { if (current(id, seq)) message.value = '复制失败，请手动选中复制'; return false }
  }
  if (!current(id, seq)) return false
  error.value = ''; message.value = label + '已复制'; return true
}
watch(() => props.accountId, loadShare, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { requestSeq++; loadSeq++ })
</script>

<style scoped>
.share-manager { border-top: 1px dashed var(--line); padding: 20px 24px 22px; background: var(--cream) }
.share-manager-heading { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 5px 12px; align-items: start }
.share-description { grid-column: 1 / -1 }
.share-manager h2 { font: 900 18px/1.3 var(--font-s); letter-spacing: .04em }
.share-manager p { color: var(--ink-60); font-size: 12.5px; line-height: 1.7 }
.section-kicker { display: block; margin-bottom: 6px; color: var(--accent-strong); font-size: 11px; font-weight: 800; letter-spacing: .14em }
.share-scopes { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-top: 14px }
.share-scope { display: flex; gap: 8px; align-items: center; justify-content: space-between; min-height: 44px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 12.5px; color: var(--ink); cursor: pointer }
.share-scope input { flex: none; width: 18px; height: 18px; accent-color: var(--tea) }
.share-scope-status { display: block; margin-top: 2px; color: var(--ink-60); font-size: 11px; font-weight: 400 }
.share-scope:focus-within { outline: 2px solid var(--accent); outline-offset: 2px }
.share-private { margin-top: 8px }
.share-scope-note { margin-top: 4px }
.share-values { display: grid; gap: 8px; margin-top: 14px; min-width: 0 }
.share-values label { display: grid; gap: 6px; min-width: 0; color: var(--ink-60); font-size: 11.5px; font-weight: 800 }
.share-values input { width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink); background: var(--paper); font: 12px var(--font-d) }
.share-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px }
.share-code-actions { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line) }
.share-button { min-height: 44px; border: 1px solid var(--tea); border-radius: 999px; padding: 8px 12px; color: var(--cream); background: var(--tea); font: 700 12.5px var(--font-b); cursor: pointer }
.share-button.visit { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; text-decoration: none; border-color: var(--accent); color: var(--accent-strong); background: transparent }
.share-button.subtle { border-color: var(--line); color: var(--ink-60); background: transparent }
.share-button.danger { border-color: var(--rouge); color: var(--rouge); background: transparent }
.share-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
.share-button:disabled { opacity: .5; cursor: not-allowed }
.share-state,.share-message { margin-top: 14px }
.share-state.is-error { color: var(--rouge) }
.share-message { color: var(--accent-strong) }
@media(max-width:640px) {
  .share-manager { padding: 14px 16px }
  .share-actions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)) }
  .share-button { padding: 7px 9px; font-size: 12px }
  .share-values input { font-size: 16px }
}
@media(max-width:360px) { .share-scopes { grid-template-columns: 1fr } }
.share-manager.is-compact { container: account-share / inline-size; padding: 16px 20px calc(16px + env(safe-area-inset-bottom)); }
.is-compact .share-overview { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.is-compact .share-summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; }
.is-compact .share-summary strong { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-size: 14px; }
.is-compact .share-summary strong::before { content: ''; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--ink-35); }
.is-compact .share-summary.is-active strong { color: #257348; }
.is-compact .share-summary.is-active strong::before { background: currentColor; }
.is-compact .share-overview > button { flex: none; margin-left: auto; }
.is-compact .share-manager-heading { align-items: center; }
.is-compact .share-immediate { grid-column: auto; margin: 0; text-align: right; font-size: 12px; }
.is-compact .share-scopes { margin-top: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.is-compact .share-scope { min-height: 0; padding: 10px 12px; font-size: 14px; line-height: 1.5; }
.is-compact .share-scope-status { font-size: 12px; }
.is-compact .share-scope input { appearance: none; position: relative; width: 38px; height: 22px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 20px; background: var(--ink-35); cursor: pointer; }
.is-compact .share-scope input::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--surface); }
.is-compact .share-scope input:checked { background: var(--tea); }
.is-compact .share-scope input:checked::after { left: 18px; }
.is-compact .share-scope input:disabled { opacity: .5; cursor: wait; }
.is-compact .share-links-title { margin: 18px 0 0; font: 800 16px/1.4 var(--font-s); }
.is-compact .share-values { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 8px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; }
.is-compact .share-values label { grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 12px; color: var(--ink); font-size: 13px; }
.is-compact .share-values input { min-height: 36px; padding: 6px; text-overflow: ellipsis; border: 0; border-radius: 4px; background: transparent; }
.is-compact .share-values input:focus { text-overflow: clip; outline: 2px solid var(--accent); outline-offset: 2px; }
.is-compact .share-values .share-actions { display: flex; flex-wrap: nowrap; }
.is-compact .share-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-sizing: border-box; min-height: 36px; padding: 6px 10px; border-color: var(--line); border-radius: 8px; color: var(--ink); background: transparent; white-space: nowrap; }
.is-compact .share-button.danger { border-color: var(--rouge); color: var(--rouge); }
.is-compact .share-button:hover:not(:disabled) { background: var(--paper); }
.is-compact .share-code-actions { display: block; margin-top: 14px; padding-top: 12px; }
.is-compact .share-code-actions summary { width: fit-content; color: var(--ink); font-size: 13px; line-height: 1.8; cursor: pointer; }
.is-compact .share-code-actions summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.is-compact .share-management-label { margin: 8px 0; font-size: 12px; }
.is-compact .share-code-actions > .share-button + .share-button { margin-left: 8px; }
@media(max-width:640px) {
  .share-manager.is-compact { padding-inline: 16px; }
  .is-compact .share-scopes { gap: 8px; }
  .is-compact .share-scope { gap: 6px; padding: 10px 8px; font-size: 12.5px; }
}
@container account-share (max-width: 560px) {
  .is-compact .share-values { align-items: end; gap: 8px; }
  .is-compact .share-values label { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .is-compact .share-values .share-button { gap: 4px; padding-inline: 8px; }
  .is-compact .share-immediate { max-width: 150px; }
}
</style>
