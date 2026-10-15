<template>
  <section class="operator-organization" aria-label="密探置顶与自定义分类">
    <div v-if="loading || saving" role="status">{{ saving ? '正在保存分类…' : '正在读取分类…' }}</div>
    <div v-if="error" class="organization-error" role="alert">{{ error }} <button type="button" :disabled="loading || saving" @click="reload">重新读取分类</button></div>
    <div class="organization-filters" role="group" aria-label="按自定义标签筛选">
      <span>标签</span><button type="button" :aria-pressed="!tagFilter" @click="$emit('update:tagFilter', '')">全部</button>
      <button v-for="tag in value.tags" :key="tag.id" type="button" :aria-pressed="tagFilter === tag.id" @click="$emit('update:tagFilter', tag.id)">{{ tag.name }}</button>
    </div>
    <div v-if="selectedIds.length && value.tags.length" class="organization-batch">
      <label>已选 {{ selectedIds.length }} 位，批量标签 <select v-model="batchTag" :disabled="!ready"><option value="">选择标签</option><option v-for="tag in value.tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option></select></label>
      <button type="button" :disabled="!ready || !batchTag" @click="applyBatch(true)">添加标签</button>
      <button type="button" :disabled="!ready || !batchTag" @click="applyBatch(false)">移除标签</button>
    </div>
    <details ref="panel" @toggle="onToggle">
      <summary>管理置顶与标签</summary>
      <div v-if="draft" class="organization-editor">
        <p>置顶密探优先展示，筛选仍然生效。分类按当前子账号云端保存，不改变养成状态或特别关注。</p>
        <div class="organization-section">
          <strong>分组顺序</strong>
          <div v-for="(state, index) in visibleStates" :key="state" class="organization-row">
            <span>{{ stateLabel(state) }}</span>
            <button type="button" :disabled="index === 0 || !ready" :aria-label="'上移' + stateLabel(state)" @click="moveState(state, -1)">上移</button>
            <button type="button" :disabled="index === visibleStates.length - 1 || !ready" :aria-label="'下移' + stateLabel(state)" @click="moveState(state, 1)">下移</button>
          </div>
        </div>
        <div v-if="draft.pinned_ids.length" class="organization-section">
          <strong>置顶顺序</strong>
          <div v-for="(id, index) in draft.pinned_ids" :key="id" class="organization-row">
            <span>{{ catalog[id]?.name || id }}</span>
            <button type="button" :disabled="index === 0 || !ready" :aria-label="'上移置顶' + (catalog[id]?.name || id)" @click="move(draft.pinned_ids, index, -1)">上移</button>
            <button type="button" :disabled="index === draft.pinned_ids.length - 1 || !ready" :aria-label="'下移置顶' + (catalog[id]?.name || id)" @click="move(draft.pinned_ids, index, 1)">下移</button>
            <button type="button" :disabled="!ready" @click="draft.pinned_ids.splice(index, 1)">取消置顶</button>
          </div>
        </div>
        <div class="organization-section">
          <strong>自定义标签（{{ draft.tags.length }}/20）</strong>
          <div v-for="(tag, index) in draft.tags" :key="tag.id" class="organization-row">
            <input v-model="tag.name" :aria-label="'标签名称 ' + (index + 1)" maxlength="40" :disabled="!ready" />
            <small>{{ tag.operator_ids.length }} 位</small><button type="button" :disabled="!ready" :aria-label="'删除标签' + tag.name" @click="draft.tags.splice(index, 1)">删除</button>
          </div>
          <button type="button" :disabled="draft.tags.length >= 20 || !ready" @click="addTag">新增标签</button>
          <small>一个密探可属于多个标签。删除标签保留密探、练度和其他标签；保存后生效。</small>
        </div>
        <p v-if="invalidIds.length">有 {{ invalidIds.length }} 位密探已不在当前游戏图鉴中。<button type="button" :disabled="!ready" @click="cleanInvalid">清理失效密探引用</button></p>
        <div class="organization-actions">
          <button type="button" class="btn primary" :disabled="!ready || !changed" @click="saveDraft">保存分类设置</button>
          <button type="button" :disabled="!ready" @click="resetDraft">放弃草稿，使用已读取分类</button>
        </div>
        <p v-if="changed && baselineRevision !== value.revision" role="status">云端分类已有更新，当前草稿仍保留。请核对后放弃草稿并重新编辑，避免覆盖其他设备的修改。</p>
        <details class="organization-backup">
          <summary>分类备份与恢复</summary>
          <p>此文件只包含置顶、分组顺序和标签，密探档案备份不包含这些设置。</p>
          <button type="button" :disabled="!ready" @click="exportBackup">导出已保存分类</button>
          <label>选择分类备份<input type="file" accept="application/json,.json" :disabled="!ready" @change="readBackupFile" /></label>
          <p v-if="importPreview">备份预览：{{ importPreview.pinned_ids.length }} 位置顶、{{ importPreview.tags.length }} 个标签。确认后替换当前账号的分类草稿，仍需点击“保存分类设置”。</p>
          <button v-if="importPreview" type="button" :disabled="!ready" @click="draft = importPreview; importPreview = null">用备份替换分类草稿</button>
        </details>
        <p v-if="notice" role="status">{{ notice }}</p>
      </div>
    </details>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { operatorAnnotationStatusLabel } from '../../utils/operatorAnnotations.js'
import { operatorOrganizationBackup, operatorOrganizationContent, readOperatorOrganizationBackup, updateOperatorTag } from '../../utils/operatorOrganization.js'
const props = defineProps({ value: { type: Object, required: true }, accountId: { type: String, required: true }, game: { type: String, required: true },
  catalog: { type: Object, required: true }, ready: Boolean, loading: Boolean, saving: Boolean, error: { type: String, default: '' },
  discardedEnabled: Boolean, tagFilter: { type: String, default: '' }, selectedIds: { type: Array, default: () => [] },
  save: { type: Function, required: true }, reload: { type: Function, required: true } })
defineEmits(['update:tagFilter'])
const panel = ref(null), draft = ref(null), baseline = ref(''), baselineRevision = ref(0), batchTag = ref(''), notice = ref(''), importPreview = ref(null)
const changed = computed(() => draft.value && JSON.stringify(draft.value) !== baseline.value)
const visibleStates = computed(() => draft.value?.status_order.filter(state => props.discardedEnabled || state !== 'discarded') || [])
const invalidIds = computed(() => [...new Set([...(draft.value?.pinned_ids || []), ...(draft.value?.tags.flatMap(tag => tag.operator_ids) || [])])]
  .filter(id => !props.catalog[id]?.games?.includes(props.game)))
const stateLabel = operatorAnnotationStatusLabel
function resetDraft() {
  draft.value = operatorOrganizationContent(props.value)
  baseline.value = JSON.stringify(draft.value); baselineRevision.value = props.value.revision
  notice.value = ''; importPreview.value = null
}
function onToggle() { if (panel.value.open && !draft.value) resetDraft() }
watch(() => props.accountId, () => { draft.value = null; batchTag.value = ''; notice.value = ''; importPreview.value = null; if (panel.value) panel.value.open = false })
watch(() => props.value, () => { if (draft.value && !changed.value) resetDraft(); if (!props.value.tags.some(tag => tag.id === batchTag.value)) batchTag.value = '' })
function move(list, index, delta) { const [item] = list.splice(index, 1); list.splice(index + delta, 0, item) }
function moveState(state, delta) {
  const other = visibleStates.value[visibleStates.value.indexOf(state) + delta]
  const first = draft.value.status_order.indexOf(state), second = draft.value.status_order.indexOf(other)
  ;[draft.value.status_order[first], draft.value.status_order[second]] = [draft.value.status_order[second], draft.value.status_order[first]]
}
function addTag() { draft.value.tags.push({ id: crypto.randomUUID(), name: '', operator_ids: [] }) }
function cleanInvalid() {
  const invalid = new Set(invalidIds.value)
  draft.value.pinned_ids = draft.value.pinned_ids.filter(id => !invalid.has(id))
  draft.value.tags.forEach(tag => { tag.operator_ids = tag.operator_ids.filter(id => !invalid.has(id)) })
}
async function saveDraft() {
  try {
    const content = operatorOrganizationContent(draft.value)
    if (await props.save(content, baselineRevision.value)) { resetDraft(); notice.value = '分类设置已保存' }
  } catch (err) { notice.value = err.message }
}
async function applyBatch(add) {
  try { await props.save(updateOperatorTag(props.value, batchTag.value, [...props.selectedIds], add)) }
  catch (err) { notice.value = err.message }
}
function exportBackup() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(operatorOrganizationBackup(props.value, props.game), null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = '密探分类-' + props.accountId + '.json'; link.click(); URL.revokeObjectURL(url)
}
async function readBackupFile(event) {
  const file = event.target.files?.[0], target = props.accountId
  importPreview.value = null; notice.value = ''
  if (!file) return
  try {
    if (file.size > 1024 * 1024) throw new Error('分类备份超过 1 MB')
    const text = await file.text()
    if (props.accountId === target) importPreview.value = readOperatorOrganizationBackup(text, props.game, props.catalog)
  } catch (err) { if (props.accountId === target) notice.value = err.message }
  finally { event.target.value = '' }
}
</script>

<style scoped>
.operator-organization { padding: 12px; margin: 12px 0; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink); }
.organization-filters, .organization-batch, .organization-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
button, select, input { font: inherit; }
button { border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--tea); padding: 5px 9px; cursor: pointer; }
button[aria-pressed="true"] { background: var(--cream); color: var(--ink); border-color: var(--tea); }
button:disabled { opacity: .5; cursor: default; }
summary { padding: 5px 0; cursor: pointer; font-weight: 600; }
.organization-editor { display: grid; gap: 12px; padding-top: 8px; }
.organization-section { display: grid; gap: 7px; }
.organization-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.organization-row > span, .organization-row > input { flex: 1 1 120px; min-width: 0; overflow-wrap: anywhere; }
input:not([type="file"]), select { max-width: 100%; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); color: var(--ink); padding: 5px; }
input[type="file"] { max-width: 100%; }
p, small { margin: 0; color: var(--tea); overflow-wrap: anywhere; }
.organization-backup { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 8px; }
.organization-backup label { display: grid; gap: 6px; margin-top: 8px; }
.organization-error { margin-bottom: 8px; color: var(--tea); }
button:focus-visible, summary:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--tea); outline-offset: 2px; }
</style>
