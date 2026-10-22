<template>
  <section class="share-manager" :class="{ 'is-compact': compact }" :aria-labelledby="titleId">
    <div v-if="compact" class="share-overview">
      <p v-if="!loading && !error" class="share-summary" :class="{ 'is-active': scopes.length }" role="status" aria-live="polite">
        <strong>{{ busy ? '分享更新中…' : scopes.length ? '分享已开启' : '分享未开启' }}</strong>
        <span>持有链接即可查看已开启内容，无需登录。</span>
      </p>
      <button class="share-button subtle" type="button" :disabled="loading || busy" @click="loadShare"><RefreshCw :size="14" aria-hidden="true" />刷新状态</button>
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
          <span v-if="compact" class="share-scope-icon" aria-hidden="true"><component :is="option.scope === 'operator' ? Users : Gem" :size="22" /></span>
          <span class="share-scope-copy">{{ option.label }}<template v-if="!compact">分享</template><small class="share-scope-description">{{ option.scope === 'operator' ? '公开此账号中已持有密探的档案与佩戴星石' : '公开云端已保存的全部星石' }}</small><small class="share-scope-status" :class="{ 'is-enabled': scopes.includes(option.scope) }">{{ busy ? '更新中…' : scopes.includes(option.scope) ? '已开启' : '未开启' }}</small></span>
          <input type="checkbox" role="switch" :aria-label="option.label + '分享'" :checked="scopes.includes(option.scope)"
            :disabled="!accountId || busy" @change="toggleScope(option.scope, $event)" />
        </label>
      </div>
      <p class="share-description share-scope-note">关闭星石背包分享，不会隐藏密探 BOX 中的佩戴星石。</p>
      <label v-if="scopes.includes('operator')" class="share-scope share-tag-sharing">
        <span v-if="compact" class="share-scope-icon" aria-hidden="true"><Tags :size="22" /></span>
        <span class="share-scope-copy">公开自定义标签<small class="share-scope-description">默认不公开；开启后，所有持有分享链接的人可查看已公开密探的标签并筛选。关闭密探 BOX 会同时关闭此项。</small><small class="share-scope-status" :class="{ 'is-enabled': scopes.includes('operator_tags') }">{{ busy ? '更新中…' : scopes.includes('operator_tags') ? '已开启' : '未开启' }}</small></span>
        <input type="checkbox" role="switch" aria-label="公开自定义标签" :checked="scopes.includes('operator_tags')"
          :disabled="!accountId || busy" @change="toggleScope('operator_tags', $event)" />
      </label>
      <template v-if="share?.active && share.share_code">
        <h3 v-if="compact" class="share-links-title">分享链接</h3>
        <div v-for="option in options.filter(item => scopes.includes(item.scope))" :key="option.scope" class="share-values">
          <label><span>{{ option.label }}分享链接</span><input :value="link(option.scope)" :title="link(option.scope)" readonly :aria-label="option.label + '分享链接'" @focus="compact && $event.target.select()" /></label>
          <div class="share-actions">
            <button class="share-button" type="button" :aria-label="'复制' + option.label + '链接'" :disabled="busy" @click="copy(link(option.scope), option.label + '分享链接')"><Copy v-if="compact" :size="15" aria-hidden="true" />复制<template v-if="!compact">{{ option.label }}链接</template></button>
            <a class="share-button visit" :href="link(option.scope)" :target="compact ? '_blank' : undefined" :rel="compact ? 'noopener noreferrer' : undefined" :aria-label="'访问我的' + option.label"><ExternalLink v-if="compact" :size="15" aria-hidden="true" />{{ compact ? '访问' : '访问我的' + option.label }}</a>
          </div>
        </div>
      </template>
      <p v-else class="share-state">当前未公开任何内容。开启一种分享后，将生成分享链接。</p>
      <slot name="help">
        <details class="share-description share-private">
          <summary>公开范围与隐私说明</summary>
          <p>不公开备注、目标、计划或识别记录。本机未同步的星石修改不会出现在分享中。</p>
          <p>自定义标签默认私有，主动开启后随密探 BOX 公开；置顶与分组顺序始终不公开。</p>
        </details>
      </slot>
      <slot v-if="share?.active && share.share_code" name="management" :busy="busy" :regenerate="regenerate" :revoke="revoke">
        <component :is="compact ? 'details' : 'div'" class="share-actions share-code-actions">
          <summary v-if="compact"><Settings2 :size="18" aria-hidden="true" /><span>更多管理</span><ChevronDown class="share-management-chevron" :size="16" aria-hidden="true" /></summary>
          <p v-if="compact" class="share-management-label">重新生成或全部撤销后，两个分享范围的旧链接立即失效。</p>
          <button class="share-button subtle" type="button" :disabled="busy" @click="regenerate">{{ compact ? '重新生成分享链接' : '重新生成' }}</button>
          <button class="share-button danger" type="button" :disabled="busy" @click="revoke">全部撤销</button>
        </component>
      </slot>
    </template>
    <p v-if="busy" class="share-state" role="status" aria-live="polite">正在更新分享状态…</p>
    <p v-if="message" class="share-message" role="status" aria-live="polite">{{ message }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { ChevronDown, Copy, ExternalLink, Gem, RefreshCw, Settings2, Tags, Users } from '@lucide/vue'
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
  const success = scope === 'operator_tags' ? (enabled ? '自定义标签已公开' : '自定义标签已停止公开') : enabled ? '分享已开启' : '该项分享已关闭'
  return updateShare(id => setAccountShareScope(id, scope, enabled), success)
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
.section-kicker { display: block; margin-bottom: 6px; color: var(--theme-accent-text, var(--accent-strong)); font-size: 11px; font-weight: 800; letter-spacing: .14em }
.share-scopes { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-top: 14px }
.share-scope { display: flex; gap: 8px; align-items: center; justify-content: space-between; min-height: 44px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 12.5px; color: var(--ink); cursor: pointer }
.share-scope input { flex: none; width: 18px; height: 18px; accent-color: var(--tea) }
.share-scope-copy { min-width: 0; overflow-wrap: anywhere }
.share-scope-description { display: block; margin-top: 2px; color: var(--ink-60); font-size: 12px; font-weight: 400; line-height: 1.6 }
.share-scope-status { display: block; margin-top: 2px; color: var(--ink-60); font-size: 11px; font-weight: 400 }
.share-tag-sharing { margin-top: 8px }
.share-scope:focus-within { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px }
.share-private { margin-top: 8px }
.share-scope-note { margin-top: 4px }
.share-values { display: grid; gap: 8px; margin-top: 14px; min-width: 0 }
.share-values label { display: grid; gap: 6px; min-width: 0; color: var(--ink-60); font-size: 11.5px; font-weight: 800 }
.share-values input { width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink); background: var(--paper); font: 12px var(--font-d) }
.share-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px }
.share-code-actions { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line) }
.share-button { min-height: 44px; border: 1px solid var(--tea); border-radius: 999px; padding: 8px 12px; color: var(--on-strong); background: var(--tea); font: 700 12.5px var(--font-b); cursor: pointer }
.share-button.visit { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; text-decoration: none; border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); background: transparent }
.share-button.subtle { border-color: var(--line); color: var(--ink-60); background: transparent }
.share-button.danger { border-color: var(--rouge); color: var(--theme-danger-text, var(--rouge)); background: transparent }
.share-button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px }
.share-button:disabled { opacity: .5; cursor: not-allowed }
.share-state,.share-message { margin-top: 14px }
.share-state.is-error { color: var(--theme-danger-text, var(--rouge)) }
.share-message { color: var(--theme-accent-text, var(--accent-strong)) }
@media(max-width:640px) {
  .share-manager { padding: 14px 16px }
  .share-actions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)) }
  .share-button { padding: 7px 9px; font-size: 12px }
  .share-values input { font-size: 16px }
}
@media(max-width:360px) { .share-scopes { grid-template-columns: 1fr } }
/* Compact mode belongs to the operator modal; the star page keeps the base presentation. */
.share-manager.is-compact { container: account-share / inline-size; padding: 18px 24px calc(20px + env(safe-area-inset-bottom)); }
.is-compact .share-overview { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.is-compact .share-summary { display: grid; gap: 4px; margin: 0; }
.is-compact .share-summary strong { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-size: 14px; }
.is-compact .share-summary strong::before { content: ''; flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--ink-35); }
.is-compact .share-summary.is-active strong { color: var(--theme-success-text, #257348); }
.is-compact .share-summary.is-active strong::before { background: currentColor; }
.is-compact .share-summary > span { padding-left: 17px; font-size: 12px; }
.is-compact .share-overview > button { flex: none; margin-left: auto; }
.is-compact .share-manager-heading { align-items: center; }
.is-compact .share-immediate { grid-column: auto; margin: 0; text-align: right; font-size: 12px; }
.is-compact .share-scopes { margin-top: 10px; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.is-compact .share-scope { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; box-sizing: border-box; min-height: 80px; padding: 12px 14px; border-radius: 10px; background: linear-gradient(110deg, var(--surface), var(--cream)); font-size: 14px; line-height: 1.5; }
.is-compact .share-scope:hover { border-color: var(--accent); }
.is-compact .share-scope-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: var(--paper); color: var(--theme-strong-text, var(--tea)); }
.is-compact .share-scope-copy { min-width: 0; font-weight: 700; }
.is-compact .share-scope-description { display: block; margin-top: 2px; color: var(--ink-60); font-size: 12px; font-weight: 400; }
.is-compact .share-scope-status { font-size: 11px; }
.is-compact .share-scope-status.is-enabled { color: var(--theme-success-text, #257348); }
.is-compact .share-scope input { appearance: none; position: relative; margin: 0; width: 40px; height: 24px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 20px; background: var(--ink-35); cursor: pointer; }
.is-compact .share-scope input::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); }
.is-compact .share-scope input:checked { background: var(--tea); }
.is-compact .share-scope input:checked::after { left: 18px; }
.is-compact .share-scope input:disabled { opacity: .5; cursor: wait; }
.is-compact .share-links-title { margin: 18px 0 0; font: 800 16px/1.4 var(--font-s); }
.is-compact .share-values { grid-template-columns: minmax(0, 1fr); align-items: center; gap: 8px; box-sizing: border-box; min-height: 72px; margin-top: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); }
.is-compact .share-values label { grid-template-columns: minmax(0, 1fr); gap: 4px; color: var(--ink); font-size: 13px; }
.is-compact .share-values input { display: block; min-height: 22px; height: 22px; padding: 0; text-overflow: ellipsis; border: 0; border-radius: 3px; background: transparent; color: var(--ink-60); font: 12px/1.6 var(--font-b); }
.is-compact .share-values input:focus { text-overflow: clip; outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.is-compact .share-values .share-actions { display: flex; justify-content: flex-end; flex-wrap: nowrap; }
.is-compact .share-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-sizing: border-box; min-height: 36px; padding: 6px 10px; border-color: var(--line); border-radius: 8px; color: var(--ink); background: transparent; white-space: nowrap; }
.is-compact .share-button.danger { border-color: var(--rouge); color: var(--theme-danger-text, var(--rouge)); }
.is-compact .share-button:hover:not(:disabled) { background: var(--paper); }
.is-compact .share-code-actions { display: block; margin-top: 10px; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); }
.is-compact .share-code-actions summary { display: flex; align-items: center; gap: 10px; box-sizing: border-box; min-height: 48px; padding: 12px 14px; border-radius: 10px; list-style: none; color: var(--theme-strong-text, var(--tea)); font-size: 13px; line-height: 1.8; cursor: pointer; }
.is-compact .share-code-actions summary::-webkit-details-marker { display: none; }
.is-compact .share-code-actions summary::marker { content: ''; }
.is-compact .share-code-actions summary > span { flex: 1; min-width: 0; font-weight: 700; }
.is-compact .share-code-actions summary > svg { flex: none; }
.is-compact .share-code-actions summary:hover,.is-compact .share-code-actions[open] summary { background: var(--paper); }
.is-compact .share-code-actions[open] .share-management-chevron { transform: rotate(180deg); }
.is-compact .share-code-actions summary:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.is-compact .share-management-label { margin: 0; padding: 10px 14px; border-top: 1px solid var(--line); font-size: 12px; }
.is-compact .share-code-actions > .share-button { margin: 0 0 12px 14px; }
.is-compact .share-code-actions > .share-button + .share-button { margin-left: 8px; }
@media(max-width:640px) {
  .share-manager.is-compact { padding-inline: 16px; }
  .is-compact .share-values input { height: 26px; font-size: 16px; }
  .is-compact .share-button { min-height: 44px; }
}
@container account-share (min-width: 580px) {
  .is-compact .share-scopes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .is-compact .share-values { grid-template-columns: minmax(0, 1fr) auto; }
}
@container account-share (max-width: 360px) {
  .is-compact .share-overview { align-items: flex-start; flex-wrap: wrap; }
  .is-compact .share-immediate { max-width: 130px; }
  .is-compact .share-code-actions > .share-button { display: flex; margin: 0 14px 12px; }
  .is-compact .share-code-actions > .share-button + .share-button { margin-left: 14px; }
}
</style>
