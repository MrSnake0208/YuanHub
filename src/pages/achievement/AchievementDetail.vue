<template>
  <Teleport to="body">
    <div v-if="entry" class="achievement-mask" :style="viewportStyle" @click.self="close">
      <section ref="panel" class="achievement-dialog" :class="{ 'is-short': shortViewport }" role="dialog" aria-modal="true" aria-labelledby="achievement-detail-title" tabindex="-1" :aria-busy="busy" @focusin="revealFocusedControl">
        <header><h2 id="achievement-detail-title">{{ entry.name }}</h2><button type="button" :disabled="busy" aria-label="关闭成就详情" @click="close"><X :size="18" aria-hidden="true" /></button></header>
        <div ref="scrollBody" class="achievement-dialog-body">
          <p>{{ entry.condition }}</p>
          <p v-if="entry.reward">奖励：{{ entry.reward }}</p>
          <p v-if="entry.chapter">章节：{{ entry.chapter }}</p>
          <p v-if="entry.method">{{ entry.method }}</p>
          <details v-if="entry.spoiler"><summary>注意事项与剧透（展开查看）</summary><p>{{ entry.spoiler }}</p></details>
          <ul v-if="entry.sources?.length" class="achievement-sources"><li v-for="source in entry.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}（原来源）</a></li></ul>
          <small>资料核验：{{ entry.verified_at }} · {{ entry.achievement_id }}</small>
          <form v-if="canRecord" id="achievement-detail-form" class="achievement-form" @submit.prevent="submit">
            <label>完成状态<select v-model="draft.status" :disabled="busy"><option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option></select></label>
            <label class="achievement-check"><input v-model="draft.favorite" type="checkbox" :disabled="busy">关注此成就</label>
            <label v-if="entry.progress_kind">{{ entry.unit || '进度' }}（目标 {{ entry.target }}）<input v-model="draft.progress" type="number" min="0" max="9007199254740991" :step="entry.progress_kind === 'integer' ? 1 : 'any'" :disabled="busy" inputmode="decimal"></label>
            <p v-if="reached" class="achievement-hint">数值已达目标，请到游戏内核对。不会自动标记完成。</p>
            <label v-if="draft.status === 'completed'">实际游戏完成日期（可选）<input v-model="draft.completed_on" type="date" min="0001-01-01" max="9999-12-31" :disabled="busy"></label>
            <label>备注（纯文本，最多500字）<textarea v-model="draft.note" maxlength="500" rows="3" :disabled="busy" /></label>
            <p class="achievement-hint">没有确认状态时保留“待核对”。日期留空表示未知，不会填入今天。</p>
          </form>
          <p v-else class="achievement-hint">登录并选择已有游戏账号后，可以记录完成情况。</p>
          <p v-if="record?.updated_at" class="achievement-hint">服务器记录时间：{{ record.updated_at }} · 最近编辑来源：{{ record.source === 'import' ? '导入' : '手动' }}</p>
          <p v-if="record?.state_updated_at" class="achievement-hint">状态确认时间：{{ record.state_updated_at }} · {{ record.state_source === 'import' ? '导入' : '手动' }}</p>
          <p v-if="error" role="alert" class="achievement-error">{{ error }}</p>
        </div>
        <footer><button type="button" :disabled="busy" @click="close">关闭</button><button v-if="canRecord" type="submit" form="achievement-detail-form" :disabled="busy || loading || !dirty">{{ busy ? '正在保存…' : '保存记录' }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'
import { dialog } from '../../utils/dialog.js'
import { emptyRecord, STATUS_LABELS } from './rules.js'

const props = defineProps({ entry: Object, record: Object, canRecord: Boolean, busy: Boolean, loading: Boolean, error: String })
const emit = defineEmits(['close', 'save'])
const panel = ref(null), scrollBody = ref(null), base = ref({}), draft = reactive({})
const open = computed(() => !!props.entry)
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(open, scrollBody, panel)
watch(() => props.entry?.achievement_id, () => {
  const record = props.record || emptyRecord(props.entry?.achievement_id)
  base.value = { status: record.status, favorite: record.favorite, note: record.note, progress: record.progress == null ? '' : String(record.progress), completed_on: record.completed_on || '' }
  Object.assign(draft, base.value)
}, { immediate: true, flush: 'sync' })
watch(() => draft.status, value => { if (value !== 'completed') draft.completed_on = '' }, { flush: 'sync' })
const dirty = computed(() => open.value && Object.keys(base.value).some(key => draft[key] !== base.value[key]))
const reached = computed(() => props.entry?.progress_kind && draft.progress !== '' && Number(draft.progress) >= props.entry.target)
useModalFocus(open, panel, { initialFocus: () => panel.value, onEscape: close, preventRestoreScroll: true })
watch(open, (visible, _, cleanup) => {
  if (!visible) return
  const overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  cleanup(() => { document.body.style.overflow = overflow })
})
async function close() {
  if (props.busy) return
  const id = props.entry?.achievement_id
  if (dirty.value && !await dialog.confirm({ title: '放弃成就草稿？', message: '这次编辑尚未保存。', confirmText: '放弃修改', cancelText: '继续编辑' })) return
  if (id === props.entry?.achievement_id) emit('close')
}
function submit() {
  if (!props.canRecord || props.busy || props.loading || !dirty.value) return
  const patch = { achievement_id: props.entry.achievement_id }
  for (const key of Object.keys(base.value)) {
    if (draft[key] === base.value[key]) continue
    patch[key] = key === 'progress' ? draft[key] === '' ? null : Number(draft[key]) : key === 'completed_on' ? draft[key] || null : draft[key]
  }
  emit('save', patch)
}
defineExpose({ hasDraft: () => dirty.value })
</script>
