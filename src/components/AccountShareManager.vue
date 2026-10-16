<template>
  <section class="share-manager" :aria-labelledby="titleId">
    <div class="share-manager-heading">
      <slot name="heading" :title-id="titleId"><div><span class="section-kicker">分享链接</span><h2 :id="titleId">分享当前账号</h2></div></slot>
      <button class="share-button subtle" type="button" :disabled="loading || busy" @click="loadShare">刷新状态</button>
      <p class="share-description">两个视图共用分享码。拿到任一链接的人都能查看已开启的内容，无需登录；全部关闭后旧码失效。</p>
    </div>
    <p v-if="loading" class="share-state" role="status">正在读取分享状态…</p>
    <p v-else-if="error" class="share-state is-error" role="alert">{{ error }}</p>
    <template v-else>
      <div class="share-scopes" aria-label="公开内容">
        <label v-for="option in options" :key="option.scope" class="share-scope">
          <span>{{ option.label }}分享<small class="share-scope-status">{{ busy ? '更新中…' : scopes.includes(option.scope) ? '已开启' : '未开启' }}</small></span>
          <input type="checkbox" role="switch" :aria-label="option.label + '分享'" :checked="scopes.includes(option.scope)"
            :disabled="!accountId || busy" @change="toggleScope(option.scope, $event)" />
        </label>
      </div>
      <template v-if="share?.active && share.share_code">
        <div v-for="option in options.filter(item => scopes.includes(item.scope))" :key="option.scope" class="share-values">
          <label><span>{{ option.label }}分享链接</span><input :value="link(option.scope)" readonly :aria-label="option.label + '分享链接'" /></label>
          <div class="share-actions">
            <button class="share-button" type="button" :disabled="busy" @click="copy(link(option.scope), option.label + '分享链接')">复制{{ option.label }}链接</button>
            <a class="share-button visit" :href="link(option.scope)">访问我的{{ option.label }}</a>
          </div>
        </div>
      </template>
      <p v-else class="share-state">当前未公开任何内容。开启一种分享后，将生成分享链接。</p>
      <slot name="help">
        <p class="share-description share-private">仅公开所选内容，不包含备注、目标、计划或 OCR 记录。星石展示云端已保存背包，本机未同步修改不会出现在分享中。</p>
        <p class="share-description share-scope-note">密探 BOX 包含档案中原有的佩戴星石；星石背包公开当前云端背包的全部星石。关闭星石背包分享，不会移除密探 BOX 中已有的佩戴星石信息。</p>
      </slot>
      <div v-if="share?.active && share.share_code" class="share-actions share-code-actions">
        <button class="share-button subtle" type="button" :disabled="busy" @click="regenerate">重新生成</button>
        <button class="share-button danger" type="button" :disabled="busy" @click="revoke">全部撤销</button>
      </div>
    </template>
    <p v-if="busy" class="share-state" role="status" aria-live="polite">正在更新分享状态…</p>
    <p v-if="message" class="share-message" role="status" aria-live="polite">{{ message }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { getAccountShare, setAccountShareScope, regenerateAccountShare, revokeAccountShare } from '../api/accountShare.js'
import { sharePath } from '../utils/shareLink.js'
import { dialog } from '../utils/dialog.js'
import { modalFocusState } from '../composables/useModalFocus.js'

const props = defineProps({ accountId: { type: String, required: true } })
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
</style>
