<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask" role="presentation" @click.self="close">
      <div ref="dialogPanel" class="modal public-detail-modal" role="dialog" aria-modal="true" aria-labelledby="public-detail-title" tabindex="-1">
        <div class="modal-head">
          <div>
            <span class="public-detail-kicker">PLAZA / FEEDBACK</span>
            <h2 id="public-detail-title">反馈详情</h2>
          </div>
          <button ref="closeButton" type="button" aria-label="关闭详情" title="关闭" @click="close"><X :size="20" /></button>
        </div>
        <div class="public-detail-body">
          <PublicFeedbackDetail
            ref="detail"
            :item="item"
            :loading="loading"
            :error="error"
            :format-date="formatDate"
            @updated="$emit('updated', $event)"
            @unpublished="$emit('unpublished', $event)"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { X } from '@lucide/vue'
import PublicFeedbackDetail from '@/components/co-creation/PublicFeedbackDetail.vue'
import { useModalFocus } from '@/composables/useModalFocus.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  formatDate: { type: Function, required: true }
})

const emit = defineEmits(['close', 'updated', 'unpublished'])

// 打开时把焦点移入弹窗,关闭时还给触发元素。
const closeButton = ref(null)
const dialogPanel = ref(null)
const detail = ref(null)
const confirmClose = () => detail.value?.confirmClose() ?? true
defineExpose({ confirmClose })
async function close() {
  if (await confirmClose()) emit('close')
}
useModalFocus(() => props.open, dialogPanel, {
  initialFocus: () => closeButton.value,
  onEscape: close
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.public-detail-kicker { color: var(--theme-accent-text, var(--accent-strong)); }
</style>
<style scoped src="./publicFeedbackDetailModalDesktop.css"></style>
<style scoped src="./publicFeedbackDetailModalMobile.css"></style>
