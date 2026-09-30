<template>
  <section v-if="canManage" class="public-management" aria-label="公开反馈管理">
    <button type="button" class="feedback-button" :disabled="busy" :aria-expanded="opened" @click="toggle">
      {{ opened ? '收起管理' : '管理此反馈' }}
    </button>
    <template v-if="opened">
      <p v-if="loading" role="status">正在核对管理权限…</p>
      <AdminFeedbackPublishPanel
        v-else-if="ticket"
        ref="panel"
        :item="ticket"
        dialog
        :busy="busy"
        :message="message"
        :error="error"
        :format-date="formatDate"
        @save="save"
        @unpublish="unpublish"
      />
      <p v-else-if="error" role="alert">{{ error }}</p>
      <button v-if="error" type="button" class="feedback-button" :disabled="busy" @click="load">重新加载</button>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AdminFeedbackPublishPanel from '@/components/feedback/AdminFeedbackPublishPanel.vue'
import { getManagedFeedback, publishFeedback, unpublishFeedback, updateFeedbackPublicStatus, updateFeedbackType } from '@/api/feedback.js'
import { getPublicFeedback } from '@/api/coCreation.js'
import { auth } from '@/store/auth.js'
import { canManageAnyFeedback } from '@/utils/authPermissions.js'
import { dialog } from '@/utils/dialog.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'

const props = defineProps({ id: { type: String, required: true }, formatDate: { type: Function, required: true } })
const emit = defineEmits(['updated', 'unpublished'])
const canManage = computed(() => !!auth.accessToken && !!auth.userInfo && canManageAnyFeedback(auth.adminAccess))
const opened = ref(false)
const ticket = ref(null)
const panel = ref(null)
const loading = ref(false)
const busy = ref(false)
const message = ref('')
const error = ref('')
let requestId = 0

const confirmDiscard = useUnsavedChanges(computed(() => busy.value || !!panel.value?.hasDraft), '公开反馈修改')
async function confirmClose() {
  return !busy.value && await confirmDiscard()
}
defineExpose({ confirmClose })

function currentRequest() {
  const sequence = ++requestId
  const id = props.id
  const userId = auth.userInfo?.id
  const token = auth.accessToken
  return () => sequence === requestId && id === props.id && userId === auth.userInfo?.id && token === auth.accessToken && canManage.value
}

async function load() {
  if (busy.value || !canManage.value) return
  const current = currentRequest()
  if (!await confirmDiscard() || !current()) return
  ticket.value = null
  error.value = ''
  message.value = ''
  loading.value = true
  try {
    const detail = await getManagedFeedback(props.id)
    if (!current()) return
    if (!detail.viewerCanManage || detail.mergedIntoId || (detail.workflowStage === 'UNASSIGNED' && !auth.adminAccess?.superAdmin)) {
      error.value = '你没有此反馈的管理权限；请由当前负责人或超级管理员处理。'
      return
    }
    ticket.value = detail
    const published = await getPublicFeedback(props.id)
    if (current()) emit('updated', published)
  } catch (e) {
    if (current()) error.value = e.message || '管理信息加载失败，请重试。'
  } finally {
    if (current()) loading.value = false
  }
}

async function toggle() {
  if (opened.value) {
    if (!await confirmClose()) return
    requestId += 1
    opened.value = false
    ticket.value = null
  } else {
    opened.value = true
    await load()
  }
}

async function save(payload) {
  if (busy.value || !ticket.value?.viewerCanManage) return
  const current = currentRequest()
  const id = props.id
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    if (ticket.value.publicConsent === true && payload.type !== ticket.value.type) {
      await updateFeedbackType(id, payload.type)
      if (!current()) return
    }
    const updated = ticket.value.publicConsent === true
      ? await publishFeedback(id, payload)
      : await updateFeedbackPublicStatus(id, payload.publicStatus)
    if (!current()) return
    ticket.value = updated
    message.value = '公开反馈已保存。'
    const detail = await getPublicFeedback(id)
    if (current()) emit('updated', detail)
  } catch (e) {
    if (current()) error.value = message.value ? '修改已保存，公开内容刷新失败，请重新加载。' : e.message || '保存失败，请重试。'
  } finally {
    if (current()) busy.value = false
  }
}

async function unpublish() {
  if (busy.value || !ticket.value?.viewerCanManage) return
  const current = currentRequest()
  const confirmed = await dialog.confirm({ title: '取消公开此反馈？', message: '反馈将从广场移除，已有支持记录会保留。', confirmText: '取消公开', type: 'danger' })
  if (!confirmed || !current()) return
  busy.value = true
  error.value = ''
  try {
    await unpublishFeedback(props.id)
    if (current()) emit('unpublished', props.id)
  } catch (e) {
    if (current()) error.value = e.message || '取消公开失败，请重试。'
  } finally {
    if (current()) busy.value = false
  }
}

watch(() => [props.id, auth.userInfo?.id, auth.accessToken, canManage.value], () => {
  requestId += 1
  opened.value = false
  ticket.value = null
  busy.value = false
  loading.value = false
  error.value = ''
  message.value = ''
}, { flush: 'sync' })
onBeforeUnmount(() => { requestId += 1 })
</script>

<style scoped>
.public-management { display: grid; gap: 12px; padding-top: 14px; border-top: 1px solid var(--feedback-line); }
.public-management > button { justify-self: start; }
.public-management > p { color: var(--feedback-text-muted); font-size: 12px; line-height: 1.7; }
.public-management > p[role="alert"] { color: var(--feedback-danger); }
</style>
