<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask" role="presentation" @click.self="$emit('close')">
      <div class="modal public-detail-modal" role="dialog" aria-modal="true" aria-labelledby="public-detail-title" @keydown.esc.prevent="$emit('close')">
        <div class="modal-head">
          <div>
            <span class="public-detail-kicker">PLAZA / FEEDBACK</span>
            <h2 id="public-detail-title">反馈详情</h2>
          </div>
          <button type="button" aria-label="关闭详情" title="关闭" @click="$emit('close')"><X :size="20" /></button>
        </div>
        <div class="public-detail-body">
          <PublicFeedbackDetail
            :item="item"
            :loading="loading"
            :error="error"
            :format-date="formatDate"
            @updated="$emit('updated', $event)"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { X } from '@lucide/vue'
import PublicFeedbackDetail from '@/components/co-creation/PublicFeedbackDetail.vue'

defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  formatDate: { type: Function, required: true }
})

defineEmits(['close', 'updated'])
</script>

<style scoped>
.public-detail-modal { width: min(720px, calc(100vw - 28px)); max-height: min(820px, calc(100vh - 32px)); display: flex; flex-direction: column; overflow: hidden; }
.public-detail-kicker { display: block; margin-bottom: 6px; color: var(--accent-strong); font: 800 10px var(--font-d); letter-spacing: .16em; }
.public-detail-body { min-height: 0; overflow-y: auto; padding: 18px 20px 22px; }
</style>
