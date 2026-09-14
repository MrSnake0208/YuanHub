<template>
  <section class="share-manager" aria-labelledby="operator-share-manager-title">
    <div class="share-manager-heading">
      <div>
        <span class="section-kicker">分享链接</span>
        <h2 id="operator-share-manager-title">分享当前密探 BOX</h2>
      </div>
      <button class="share-button subtle" type="button" :disabled="loading || busy" @click="loadShare">
        刷新状态
      </button>
      <p class="share-description">只分享客观养成数据，不包含备注、关注、目标或登录信息。</p>
    </div>

    <p v-if="loading" class="share-state" role="status">正在读取分享状态…</p>
    <p v-else-if="error" class="share-state is-error" role="alert">{{ error }}</p>
    <template v-else-if="share && share.active && share.share_code">
      <div class="share-values">
        <label>
          <span>分享链接</span>
          <input :value="shareLink" readonly aria-label="当前分享链接" />
        </label>
      </div>
      <div class="share-actions">
        <button class="share-button" type="button" :disabled="loading || busy" @click="copy(shareLink, '分享链接')">复制链接</button>
        <a class="share-button visit" :href="shareLink">访问我的分享</a>
        <button class="share-button subtle" type="button" :disabled="loading || busy" @click="regenerate">重新生成</button>
        <button class="share-button danger" type="button" :disabled="loading || busy" @click="revoke">撤销分享</button>
      </div>
    </template>
    <div v-else class="share-inactive">
      <p>当前账号尚未开启分享。生成后，拿到链接的人无需登录即可查看。</p>
      <button class="share-button" type="button" :disabled="loading || busy" @click="generate">
        {{ busy ? '正在生成…' : '生成分享链接' }}
      </button>
    </div>
    <p v-if="message" class="share-message" role="status" aria-live="polite">{{ message }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  createOperatorShare,
  getOperatorShare,
  regenerateOperatorShare,
  revokeOperatorShare
} from '../../api/operator.js'
import { dialog } from '../../utils/dialog.js'

const props = defineProps({ accountId: { type: String, required: true } })
const emit = defineEmits(['status-change', 'share-change'])
const share = ref(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const status = computed(() => loading.value ? '读取中…' : busy.value ? '更新中…' : error.value ? '状态异常，请展开查看' : share.value?.active && share.value?.share_code ? '已开启' : '未开启')
watch(status, value => emit('status-change', value), { immediate: true, flush: 'sync' })
let requestSeq = 0
let loadSeq = 0

const shareLink = computed(function () {
  if (!share.value || !share.value.share_code) return ''
  return window.location.origin + '/operator/share/' + encodeURIComponent(share.value.share_code)
})

watch([status, shareLink, () => props.accountId], () => {
  emit('share-change', { accountId: props.accountId, status: status.value, link: status.value === '已开启' ? shareLink.value : '' })
}, { immediate: true })
defineExpose({ copyCurrentShare: () => status.value === '已开启' ? copy(shareLink.value, '分享链接') : false })

function current(accountId, seq) {
  return props.accountId === accountId && seq === requestSeq
}

function humanErr(err, fallback) {
  if (err && err.message && !/Failed to fetch|NetworkError|fetch/i.test(err.message)) return err.message
  return err ? '网络异常，请稍后重试' : fallback
}

async function loadShare() {
  const accountId = props.accountId
  const seq = ++requestSeq
  const loadRequestSeq = ++loadSeq
  share.value = null
  busy.value = false
  error.value = ''
  message.value = ''
  if (!accountId) return
  loading.value = true
  try {
    const data = await getOperatorShare(accountId)
    if (current(accountId, seq)) share.value = data || { account_id: accountId, active: false, share_code: null }
  } catch (err) {
    if (current(accountId, seq)) error.value = humanErr(err, '分享状态读取失败')
  } finally {
    if (loadRequestSeq === loadSeq) loading.value = false
  }
}

async function updateShare(action, success, inactive) {
  const accountId = props.accountId
  const seq = ++requestSeq
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const data = await action(accountId)
    if (!current(accountId, seq)) return
    share.value = inactive
      ? { account_id: accountId, active: false, share_code: null }
      : data
    message.value = success
  } catch (err) {
    if (current(accountId, seq)) error.value = humanErr(err, '操作失败，请稍后重试')
  } finally {
    if (current(accountId, seq)) busy.value = false
  }
}

function generate() {
  return updateShare(createOperatorShare, '分享链接已生成')
}

async function regenerate() {
  const accountId = props.accountId
  const seq = requestSeq
  const ok = await dialog.confirm({
    title: '重新生成分享链接',
    message: '旧链接会立即失效，是否继续？',
    confirmText: '重新生成',
    type: 'danger'
  })
  if (ok && current(accountId, seq)) await updateShare(regenerateOperatorShare, '新的分享链接已生成')
}

async function revoke() {
  const accountId = props.accountId
  const seq = requestSeq
  const ok = await dialog.confirm({
    title: '撤销分享',
    message: '撤销后当前链接会立即失效。',
    confirmText: '撤销',
    type: 'danger'
  })
  if (ok && current(accountId, seq)) await updateShare(revokeOperatorShare, '分享已撤销', true)
}

async function copy(value, label) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(value)
  } catch (_) {
    const textarea = document.createElement('textarea')
    let copied = false
    try {
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      copied = document.execCommand('copy')
    } catch (_) {
      copied = false
    } finally {
      textarea.remove()
    }
    if (!copied) {
      error.value = '复制失败，请手动选中复制'
      return false
    }
  }
  error.value = ''
  message.value = label + '已复制'
  return true
}

watch(function () { return props.accountId }, loadShare, { immediate: true, flush: 'sync' })
onBeforeUnmount(function () { requestSeq += 1; loadSeq += 1 })
</script>

<style scoped>
.share-manager { border-top: 1px dashed var(--line); padding: 20px 24px 22px; background: var(--cream) }
.share-manager-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 5px 12px }
.share-description { grid-column: 1 / -1 }
.share-manager-heading > button { white-space: nowrap; min-height: 44px; padding-inline: 12px }
.share-manager h2 { font-family: var(--font-s); font-size: 18px; line-height: 1.3; letter-spacing: .04em; font-weight: 900 }
.share-manager p { color: var(--ink-60); font-size: 12.5px; line-height: 1.7 }
.section-kicker { display: block; margin-bottom: 6px; color: var(--accent-strong); font-size: 11px; font-weight: 800; letter-spacing: .14em }
.share-values { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; margin-top: 16px }
.share-values label { display: grid; gap: 6px; min-width: 0; color: var(--ink-60); font-size: 11.5px; font-weight: 800 }
.share-values input { width: 100%; box-sizing: border-box; min-height: 44px; min-width: 0; border: 1.5px solid var(--line); border-radius: 10px; padding: 10px 12px; color: var(--ink); background: var(--paper); font: 12px var(--font-d) }
.share-actions,.share-inactive { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 14px }
.share-inactive { justify-content: space-between }
.share-button { min-height: 44px; border: 1px solid var(--tea); border-radius: 999px; padding: 8px 15px; color: var(--cream); background: var(--tea); cursor: pointer; font: 700 12.5px var(--font-b) }
.share-button.visit { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; text-decoration: none; border-color: var(--accent); color: var(--accent-strong); background: transparent }
.share-button.subtle { border-color: var(--line); color: var(--ink-60); background: transparent }
.share-button.danger { border-color: rgba(166, 81, 74, .45); color: var(--rouge); background: transparent }
.share-button:hover:not(:disabled),.share-button:focus-visible { border-color: var(--accent); outline: 2px solid transparent; box-shadow: 0 0 0 3px rgba(215, 137, 53, .13) }
.share-button:disabled { cursor: not-allowed; opacity: .5 }
.share-state,.share-message { margin-top: 14px }
.share-state.is-error { color: var(--rouge) }
.share-message { color: var(--accent-strong) }
@media (max-width: 640px) {
  .share-manager { padding: 14px 16px }
  .share-manager-heading { gap: 3px 8px }
  .share-manager h2 { font-size: 17px }
  .share-manager p { font-size: 12px; line-height: 1.5 }
  .section-kicker { margin-bottom: 3px }
  .share-manager-heading > button { padding: 6px 10px; font-size: 12px }
  .share-values { margin-top: 10px; gap: 8px }
  .share-values label { gap: 4px }
  .share-values input { padding: 8px 10px; font-size: 16px }
  .share-state,.share-message { margin-top: 10px }
  .share-values { grid-template-columns: 1fr }
  .share-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px }
  .share-actions .share-button { padding: 7px 10px }
  .share-inactive { gap: 8px; margin-top: 10px }
  .share-inactive p { flex: 1 1 180px }
  .share-inactive .share-button { flex: none }
}
</style>
