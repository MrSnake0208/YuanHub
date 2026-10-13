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
  // Clearing the account invalidates the previous request, including its finally.
  // Reset loading here so the empty-account state cannot remain stuck waiting.
  loading.value = Boolean(accountId)
  if (!accountId) return
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.share-manager { border-top: 1px dashed var(--line); background: var(--cream) }
.share-manager p { color: var(--ink-60) }
.section-kicker { color: var(--accent-strong) }
.share-values label { color: var(--ink-60) }
.share-values input { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink); background: var(--paper) }
.share-button { border: 1px solid var(--tea); border-radius: 999px; color: var(--cream); background: var(--tea); cursor: pointer }
.share-button.visit { text-decoration: none; border-color: var(--accent); color: var(--accent-strong); background: transparent }
.share-button.subtle { border-color: var(--line); color: var(--ink-60); background: transparent }
.share-button.danger { border-color: rgba(166, 81, 74, .45); color: var(--rouge); background: transparent }
.share-button:hover:not(:disabled),.share-button:focus-visible { border-color: var(--accent); outline: 2px solid transparent; box-shadow: 0 0 0 3px rgba(215, 137, 53, .13) }
.share-button:disabled { cursor: not-allowed; opacity: .5 }
.share-state.is-error { color: var(--rouge) }
.share-message { color: var(--accent-strong) }
</style>
<style scoped src="./operatorShareManagerDesktop.css"></style>
<style scoped src="./operatorShareManagerMobile.css"></style>
