<template>
  <Teleport to="body" :disabled="docked">
    <div v-if="entry" class="achievement-detail-container" :class="docked ? 'achievement-docked' : 'achievement-mask'" :style="docked ? undefined : viewportStyle" @click.self="close">
      <section ref="panel" class="achievement-dialog achievement-detail" :class="{ 'is-short': shortViewport }" :role="docked ? 'region' : 'dialog'" :aria-modal="docked ? undefined : 'true'" aria-labelledby="achievement-detail-title" tabindex="-1" :aria-busy="busy" @focusin="revealFocusedControl">
        <header><span class="achievement-detail-icon" aria-hidden="true"><ListChecks :size="26" /></span><h2 id="achievement-detail-title">{{ entry.name }}</h2><button type="button" :disabled="busy" aria-label="关闭成就详情" @click="close"><X :size="18" aria-hidden="true" /></button></header>
        <div ref="scrollBody" class="achievement-dialog-body">
          <div class="achievement-detail-state">
            <div class="achievement-status" role="group" aria-label="详情完成状态">
              <button v-for="(label, value) in STATUS_LABELS" :key="value" type="button" :class="'status-' + value" :aria-pressed="record?.status === value" :disabled="!canRecord || busy || loading" @click="quickSave({ achievement_id: entry.achievement_id, status: value })">{{ label }}</button>
            </div>
            <button class="achievement-favorite" type="button" :aria-pressed="!!record?.favorite" :aria-label="record?.favorite ? '取消关注此成就' : '关注此成就'" :disabled="!canRecord || busy || loading" @click="quickSave({ achievement_id: entry.achievement_id, favorite: !record?.favorite })"><Star :size="20" :fill="record?.favorite ? 'currentColor' : 'none'" aria-hidden="true" /></button>
          </div>
          <section class="achievement-detail-section"><h3>完成条件</h3><p>{{ entry.condition }}</p>
            <div v-if="hasQuantifiedProgress(entry)" class="achievement-progress"><progress :value="record?.progress ?? 0" :max="entry.target" aria-label="已保存数值进度" /><span>{{ record?.progress ?? '未填' }} / {{ entry.target }}{{ entry.unit ? ' ' + entry.unit : '' }}</span></div>
          </section>
          <section v-if="entry.reward" class="achievement-detail-section"><h3>奖励内容</h3><p class="achievement-detail-reward"><Gift :size="18" aria-hidden="true" />{{ entry.reward }}</p></section>
          <section v-if="entry.method || entry.chapter || entry.spoiler || entry.sources?.length" class="achievement-detail-section"><h3>完成说明</h3>
            <p v-if="entry.chapter">章节：{{ entry.chapter }}</p><p v-if="entry.method">{{ entry.method }}</p>
            <details v-if="entry.spoiler"><summary>注意事项与剧透（展开查看）</summary><p>{{ entry.spoiler }}</p></details>
            <ul v-if="entry.sources?.length" class="achievement-sources"><li v-for="source in entry.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}（原来源）<ExternalLink :size="12" aria-hidden="true" /></a></li></ul>
          </section>
          <form v-if="canRecord" id="achievement-detail-form" class="achievement-form" @submit.prevent="submit">
            <label v-if="hasQuantifiedProgress(entry)">{{ entry.unit || '数值进度' }}（目标 {{ entry.target }}）<input v-model="draft.progress" type="number" min="0" max="9007199254740991" :step="entry.progress_kind === 'integer' ? 1 : 'any'" :disabled="busy || loading" inputmode="decimal" placeholder="未填写"></label>
            <p v-if="reached" class="achievement-hint">数值已达目标，请到游戏内核对。不会自动标记完成。</p>
            <label v-if="draft.status === 'completed'">实际游戏完成日期（可选）<input v-model="draft.completed_on" type="date" min="0001-01-01" max="9999-12-31" :disabled="busy || loading"></label>
            <label>个人备注<textarea v-model="draft.note" maxlength="500" rows="4" :disabled="busy || loading" placeholder="记录自己的完成思路或备注…" /><small class="achievement-note-count">{{ draft.note?.length || 0 }} / 500</small></label>
            <p class="achievement-hint">没有确认时保留“待核对”。关注、备注和进度均独立保存；日期留空表示未知。</p>
          </form>
          <p v-else class="achievement-hint">登录并选择已有游戏账号后，可以记录完成情况。</p>
          <details class="achievement-record-info"><summary>资料与记录信息</summary>
            <small v-if="entry.verified_at">资料核验：{{ entry.verified_at }}</small>
            <p v-if="record?.updated_at" class="achievement-hint">服务器记录时间：{{ record.updated_at }} · 最近编辑来源：{{ record.source === 'import' ? '导入' : '手动' }}</p>
            <p v-if="record?.state_updated_at" class="achievement-hint">状态确认时间：{{ record.state_updated_at }} · {{ record.state_source === 'import' ? '导入' : '手动' }}</p>
          </details>
          <p v-if="error" role="alert" class="achievement-error">{{ error }}</p>
        </div>
        <footer><button type="button" :disabled="busy" @click="close">{{ dirty ? '取消编辑' : '关闭' }}</button><button v-if="canRecord" class="achievement-save" type="submit" form="achievement-detail-form" :disabled="busy || loading || !dirty">{{ busy ? '正在保存…' : '保存记录' }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ExternalLink, Gift, ListChecks, Star, X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'
import { dialog } from '../../utils/dialog.js'
import { emptyRecord, hasQuantifiedProgress, STATUS_LABELS } from './rules.js'

const props = defineProps({ entry: Object, record: Object, canRecord: Boolean, busy: Boolean, loading: Boolean, error: String, docked: Boolean })
const emit = defineEmits(['close', 'save', 'quick-save'])
const panel = ref(null), scrollBody = ref(null), base = ref({}), draft = reactive({})
const open = computed(() => !!props.entry)
const modalOpen = computed(() => open.value && !props.docked)
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(modalOpen, scrollBody, panel)
function recordFields() {
  const record = props.record || emptyRecord(props.entry?.achievement_id)
  return { status: record.status, note: record.note, progress: record.progress == null ? '' : String(record.progress), completed_on: record.completed_on || '' }
}
function acceptSaved() { base.value = recordFields(); Object.assign(draft, base.value) }
watch(() => props.entry?.achievement_id, acceptSaved, { immediate: true, flush: 'sync' })
watch(() => props.record, () => {
  const next = recordFields()
  for (const key of Object.keys(next)) {
    // 行内状态始终跟随已保存记录；备注、进度、日期草稿保留到用户保存或取消。
    if (key === 'status' || (key === 'completed_on' && next.status !== 'completed') || draft[key] === base.value[key]) { draft[key] = next[key]; base.value[key] = next[key] }
  }
}, { deep: true })
const dirty = computed(() => open.value && Object.keys(base.value).some(key => draft[key] !== base.value[key]))
const reached = computed(() => hasQuantifiedProgress(props.entry) && draft.progress !== '' && Number(draft.progress) >= props.entry.target)
useModalFocus(modalOpen, panel, { initialFocus: () => panel.value, onEscape: close, preventRestoreScroll: true })
watch(modalOpen, (visible, _, cleanup) => {
  if (!visible) return
  const overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  cleanup(() => { document.body.style.overflow = overflow })
}, { immediate: true })
async function close() {
  if (props.busy) return
  const id = props.entry?.achievement_id
  if (dirty.value && !await dialog.confirm({ title: '放弃成就草稿？', message: '这次编辑尚未保存。', confirmText: '放弃修改', cancelText: '继续编辑' })) return
  if (id === props.entry?.achievement_id && !props.busy) emit('close')
}
function quickSave(patch) {
  if (!props.canRecord || props.busy || props.loading || ('status' in patch && patch.status === props.record?.status)) return
  emit('quick-save', patch)
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
defineExpose({ hasDraft: () => dirty.value, acceptSaved })
</script>
