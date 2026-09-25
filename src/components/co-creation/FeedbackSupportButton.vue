<template>
  <div class="support-control">
    <button
      class="support-button"
      :class="{ on: supported, pending }"
      type="button"
      :disabled="pending"
      :aria-pressed="supported"
      :aria-label="actionLabel"
      :title="actionLabel"
      @click="toggle"
    >
      <Heart :size="15" aria-hidden="true" :fill="supported ? 'currentColor' : 'none'" />
      <span>{{ pending ? '处理中…' : supported ? '已支持' : supportActionLabel(type) }}</span>
      <span v-if="showCount" class="support-count">{{ supportCount }}</span>
    </button>
    <span v-if="errorText" class="support-error" role="alert">{{ errorText }}</span>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Heart } from '@lucide/vue'
import { auth } from '@/store/auth.js'
import { supportActionLabel } from '@/utils/feedbackPublic.js'
import { supportPublicFeedback, unsupportPublicFeedback } from '@/api/coCreation.js'

const props = defineProps({
  id: { type: String, required: true },
  type: { type: String, default: '' },
  supported: { type: Boolean, default: false },
  supportCount: { type: Number, default: 0 },
  showCount: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['updated', 'error'])

const route = useRoute()
const router = useRouter()
const pending = ref(false)
const errorText = ref('')

const actionLabel = computed(() => props.supported ? '取消支持' : supportActionLabel(props.type))

async function toggle() {
  if (pending.value || props.disabled) return
  if (!auth.accessToken || !auth.userInfo) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  pending.value = true
  errorText.value = ''
  try {
    const detail = props.supported
      ? await unsupportPublicFeedback(props.id)
      : await supportPublicFeedback(props.id)
    emit('updated', detail)
  } catch (e) {
    errorText.value = e.message || '操作失败，请稍后重试'
    emit('error', errorText.value)
  } finally {
    pending.value = false
  }
}
</script>

<style scoped>
.support-control { display: inline-flex; flex-direction: column; gap: 6px; }
.support-button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  border: 1px solid var(--feedback-line-strong);
  border-radius: 7px;
  background: var(--feedback-panel);
  color: var(--feedback-text);
  font: 800 12.5px var(--font-b);
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, color .18s ease;
}
.support-button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-strong); }
.support-button.on { border-color: var(--rouge); color: var(--rouge); }
.support-button:disabled { opacity: .6; cursor: default; }
.support-count { font: 11px var(--font-d); color: var(--feedback-text-muted); }
.support-error { color: var(--feedback-danger); font-size: 11px; }
</style>
