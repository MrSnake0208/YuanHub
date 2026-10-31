<template>
  <section class="operator-organization" aria-label="密探置顶与自定义分类">
    <div v-if="loading" role="status" class="organization-feedback">正在读取分类…</div>
    <div v-if="error && !panelOpen" class="organization-error" role="alert">{{ error }} <button type="button" :disabled="loading || saving" @click="reload">重新读取分类</button></div>
    <div v-if="selectedIds.length && value.tags.length" class="organization-batch">
      <label>已选 {{ selectedIds.length }} 位，批量标签 <select v-model="batchTag" :disabled="!ready"><option value="">选择标签</option><option v-for="tag in value.tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option></select></label>
      <button type="button" :disabled="!ready || !batchTag" @click="applyBatch(true)">添加标签</button>
      <button type="button" :disabled="!ready || !batchTag" @click="applyBatch(false)">移除标签</button>
    </div>
    <Teleport to="body" :disabled="!sheetOpen">
    <div :class="{ 'organization-sheet-mask': sheetOpen }" :style="sheetOpen ? viewportStyle : undefined" @click.self="requestClose">
    <details :id="panelId" ref="panel" class="organization-settings" :class="{ 'organization-sheet': sheetOpen, 'is-short': sheetOpen && shortViewport }" :role="sheetOpen ? 'dialog' : undefined" :aria-modal="sheetOpen ? true : undefined" :aria-label="sheetOpen ? '分类设置' : undefined" :tabindex="sheetOpen ? -1 : undefined" @focusin="revealFocusedControl" @toggle="onToggle">
      <summary hidden>分类设置</summary>
      <header v-if="sheetOpen" class="organization-sheet-header">
        <h2>分类设置</h2><small v-if="changed">未保存</small>
        <button type="button" aria-label="关闭分类设置" :disabled="saving" @click="requestClose"><X :size="20" aria-hidden="true" /></button>
      </header>
      <div v-if="sheetOpen && confirmingClose" class="organization-close-confirm" role="alert">
        <p>分类设置尚未保存，是否放弃修改？</p>
        <button type="button" @click="confirmingClose = false">继续编辑</button>
        <button type="button" @click="discardAndClose">放弃修改并关闭</button>
      </div>
      <form v-if="draft" ref="editor" class="organization-editor" novalidate @submit.prevent="saveDraft">
        <p class="organization-intro">{{ sheetOpen ? '仅调整当前 BOX 的分类与顺序。' : '仅调整当前子账号的展示分类，不改变练度、养成状态或特别关注。' }}</p>
        <div class="organization-editor-grid">
          <div class="organization-order-panel">
            <section class="organization-section" aria-label="分组顺序">
              <div class="organization-section-heading"><SlidersHorizontal :size="16" aria-hidden="true" /><h3>分组顺序</h3></div>
              <p>未置顶密探按以下顺序排列。</p>
              <ol class="organization-sort-list">
                <li v-for="(state, index) in visibleStates" :key="state" class="organization-sort-row">
                  <span class="organization-rank" aria-hidden="true">{{ index + 1 }}</span><span class="organization-sort-name">{{ stateLabel(state) }}</span>
                  <div class="organization-row-actions">
                    <button type="button" :disabled="index === 0 || !ready" :aria-label="'上移' + stateLabel(state)" @click="moveState(state, -1)"><ArrowUp :size="13" aria-hidden="true" />上移</button>
                    <button type="button" :disabled="index === visibleStates.length - 1 || !ready" :aria-label="'下移' + stateLabel(state)" @click="moveState(state, 1)"><ArrowDown :size="13" aria-hidden="true" />下移</button>
                  </div>
                </li>
              </ol>
            </section>
            <section class="organization-section" aria-label="置顶顺序">
              <div class="organization-section-heading"><Pin :size="16" aria-hidden="true" /><h3>置顶顺序</h3><small>{{ draft.pinned_ids.length }} 位</small></div>
              <p v-if="!draft.pinned_ids.length" class="organization-empty">{{ sheetOpen ? '暂无置顶密探，可在密探卡片上置顶。' : '还没有置顶密探。点击下方密探卡片的“置顶”，即可优先展示。' }}</p>
              <ol v-else class="organization-sort-list">
                <li v-for="(id, index) in draft.pinned_ids" :key="id" class="organization-sort-row organization-pin-row">
                  <span class="organization-rank" aria-hidden="true">{{ index + 1 }}</span><span class="organization-sort-name">{{ catalog[id]?.name || id }}</span>
                  <div class="organization-row-actions">
                    <button type="button" :disabled="index === 0 || !ready" :aria-label="'上移置顶' + (catalog[id]?.name || id)" @click="move(draft.pinned_ids, index, -1)"><ArrowUp :size="13" aria-hidden="true" />上移</button>
                    <button type="button" :disabled="index === draft.pinned_ids.length - 1 || !ready" :aria-label="'下移置顶' + (catalog[id]?.name || id)" @click="move(draft.pinned_ids, index, 1)"><ArrowDown :size="13" aria-hidden="true" />下移</button>
                    <button type="button" :disabled="!ready" :aria-label="'取消置顶' + (catalog[id]?.name || id)" @click="draft.pinned_ids.splice(index, 1)">取消置顶</button>
                  </div>
                </li>
              </ol>
            </section>
          </div>
          <section class="organization-section organization-tags-panel" aria-label="自定义标签">
            <div class="organization-section-heading"><Tags :size="16" aria-hidden="true" /><h3>自定义标签</h3><small>{{ draft.tags.length }}/20</small></div>
            <p id="organization-tag-help">一个密探可有多个标签，保存后可用于上方筛选。</p>
            <p v-if="!draft.tags.length" class="organization-empty">按你的习惯分类，例如“主力队”“备用”“暂缓培养”。</p>
            <div v-if="draft.tags.length" class="organization-tag-caption"><span>标签名称</span><small>1–40 字，不可重复</small></div>
            <div v-if="draft.tags.length" class="organization-tag-list">
              <div v-for="(tag, index) in draft.tags" :key="tag.id" class="organization-tag-row">
                <div class="organization-tag-field">
                  <label :for="tagInputId(tag)" class="organization-visually-hidden">标签名称 {{ index + 1 }}</label>
                  <input :id="tagInputId(tag)" v-model="tag.name" data-tag-name :aria-label="'标签名称 ' + (index + 1)" placeholder="例如：主力队" maxlength="40" :disabled="!ready"
                    :aria-invalid="Boolean(visibleTagError(tag, index))" :aria-describedby="visibleTagError(tag, index) ? tagInputId(tag) + '-error' : 'organization-tag-help'" @blur="touchedTagIds.add(tag.id)" />
                  <p v-if="visibleTagError(tag, index)" :id="tagInputId(tag) + '-error'" class="organization-field-error" role="alert">{{ tagErrors[index] }}</p>
                </div>
                <div class="organization-tag-meta"><small>关联 {{ tag.operator_ids.length }} 位<span class="organization-visually-hidden">密探</span></small>
                  <button type="button" class="organization-delete" :disabled="!ready" :aria-label="'删除标签' + (tag.name || (index + 1))" @click="draft.tags.splice(index, 1)">删除</button>
                </div>
              </div>
            </div>
            <button type="button" class="organization-add" :disabled="draft.tags.length >= 20 || !ready" @click="addTag"><Plus :size="14" aria-hidden="true" />新增标签</button>
            <small>删除标签仅移除分类，密探资料保留。</small>
          </section>
        </div>
        <p v-if="invalidIds.length" class="organization-warning">有 {{ invalidIds.length }} 位密探不在当前游戏图鉴中。<button type="button" :disabled="!ready" @click="cleanInvalid">清理失效密探引用</button></p>
        <div class="organization-save-area">
          <div v-if="error" class="organization-error" role="alert">{{ error }} <button type="button" :disabled="loading || saving" @click="reload">重新读取分类</button></div>
          <p v-if="changed && baselineRevision !== value.revision" class="organization-warning" role="status">云端分类已有更新，你的修改仍保留。请先放弃修改，再基于最新分类编辑。</p>
          <div class="organization-actions">
            <button type="submit" class="organization-save" :disabled="!ready || !changed || hasTagErrors">{{ saving ? '保存中…' : '保存分类设置' }}</button>
            <button type="button" :disabled="!ready || !changed" @click="resetDraft">放弃修改</button>
            <span v-if="notice" class="organization-feedback" :class="{ 'organization-field-error': noticeError }" :role="noticeError ? 'alert' : 'status'">{{ notice }}</span>
            <small v-else-if="hasTagErrors">请填写标签名称，名称不能重复。</small>
            <small v-else-if="changed">修改尚未保存</small>
          </div>
        </div>
      </form>
    </details>
    </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, useId, watch } from 'vue'
import { ArrowDown, ArrowUp, Pin, Plus, SlidersHorizontal, Tags, X } from '@lucide/vue'
import { operatorAnnotationStatusLabel } from '../../utils/operatorAnnotations.js'
import { operatorOrganizationContent, updateOperatorTag } from '../../utils/operatorOrganization.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'
import { createUuid } from '../../utils/createUuid.js'
const props = defineProps({ value: { type: Object, required: true }, accountId: { type: String, required: true }, game: { type: String, required: true },
  mobileSheet: Boolean,
  catalog: { type: Object, required: true }, ready: Boolean, loading: Boolean, saving: Boolean, error: { type: String, default: '' },
  discardedEnabled: Boolean, selectedIds: { type: Array, default: () => [] },
  save: { type: Function, required: true }, reload: { type: Function, required: true } })
const panelId = useId()
const panel = ref(null), panelOpen = ref(false), editor = ref(null), draft = ref(null), baseline = ref(''), baselineRevision = ref(0)
const phone = ref(false), confirmingClose = ref(false)
const sheetOpen = computed(() => props.mobileSheet && phone.value && panelOpen.value)
let phoneMedia
function updatePhone(event) { phone.value = event.matches; confirmingClose.value = false }
onMounted(() => {
  if (!props.mobileSheet) return
  phoneMedia = window.matchMedia('(max-width: 767px)')
  updatePhone(phoneMedia)
  phoneMedia.addEventListener('change', updatePhone)
})
onBeforeUnmount(() => phoneMedia?.removeEventListener('change', updatePhone))
useModalFocus(sheetOpen, panel, { initialFocus: () => panel.value, onEscape: requestClose, blocking: true, preventRestoreScroll: true })
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(sheetOpen, panel, panel)
watch(sheetOpen, (open, _, cleanup) => {
  if (!open) return
  const body = document.body, root = document.documentElement
  const bodyOverflow = body.style.overflow, rootOverflow = root.style.overflow
  body.style.overflow = root.style.overflow = 'hidden'
  cleanup(() => { body.style.overflow = bodyOverflow; root.style.overflow = rootOverflow })
}, { flush: 'sync' })
function requestClose() {
  if (!sheetOpen.value || props.saving) return
  if (changed.value) { confirmingClose.value = true; return }
  setPanelOpen(false)
}
function discardAndClose() { resetDraft(); confirmingClose.value = false; setPanelOpen(false) }
const batchTag = ref(''), notice = ref(''), noticeError = ref(false), touchedTagIds = ref(new Set()), validationAttempted = ref(false)
const changed = computed(() => Boolean(draft.value && JSON.stringify(draft.value) !== baseline.value))
defineExpose({ changed, open: panelOpen, panelId, toggle, resetDraft })
const visibleStates = computed(() => draft.value?.status_order.filter(state => props.discardedEnabled || state !== 'discarded') || [])
const invalidIds = computed(() => [...new Set([...(draft.value?.pinned_ids || []), ...(draft.value?.tags.flatMap(tag => tag.operator_ids) || [])])]
  .filter(id => !props.catalog[id]?.games?.includes(props.game)))
const tagErrors = computed(() => {
  const names = draft.value?.tags.map(tag => tag.name.trim()) || []
  return names.map(name => !name ? '请输入标签名称' : name.length > 40 ? '标签名称不能超过 40 字' : names.filter(value => value === name).length > 1 ? '标签名称重复，请换一个名称' : '')
})
const hasTagErrors = computed(() => tagErrors.value.some(Boolean))
const stateLabel = operatorAnnotationStatusLabel
const tagInputId = tag => 'organization-tag-' + props.accountId + '-' + tag.id
const visibleTagError = (tag, index) => tagErrors.value[index] && (tag.name.trim() || touchedTagIds.value.has(tag.id) || validationAttempted.value)
function focusTag(index) { editor.value?.querySelectorAll('[data-tag-name]')[index]?.focus() }
function resetDraft() {
  draft.value = operatorOrganizationContent(props.value)
  baseline.value = JSON.stringify(draft.value); baselineRevision.value = props.value.revision
  notice.value = ''; noticeError.value = false; confirmingClose.value = false; touchedTagIds.value.clear(); validationAttempted.value = false
}
function setPanelOpen(open) {
  if (!panel.value) return
  panel.value.open = panelOpen.value = open
  if (open && !draft.value) resetDraft()
}
function toggle() { setPanelOpen(!panelOpen.value) }
function onToggle() { if (panel.value) setPanelOpen(panel.value.open) }
watch(() => props.accountId, () => { draft.value = null; batchTag.value = ''; notice.value = ''; panelOpen.value = false; if (panel.value) panel.value.open = false })
watch(() => props.value, () => { if (draft.value && !changed.value) resetDraft(); if (!props.value.tags.some(tag => tag.id === batchTag.value)) batchTag.value = '' })
watch(() => draft.value, () => { notice.value = ''; noticeError.value = false }, { deep: true, flush: 'sync' })
function move(list, index, delta) { const [item] = list.splice(index, 1); list.splice(index + delta, 0, item) }
function moveState(state, delta) {
  const other = visibleStates.value[visibleStates.value.indexOf(state) + delta]
  const first = draft.value.status_order.indexOf(state), second = draft.value.status_order.indexOf(other)
  ;[draft.value.status_order[first], draft.value.status_order[second]] = [draft.value.status_order[second], draft.value.status_order[first]]
}
async function addTag() {
  const tag = { id: createUuid(), name: '', operator_ids: [] }
  draft.value.tags.push(tag)
  await nextTick(); focusTag(draft.value?.tags.findIndex(item => item.id === tag.id))
}
function cleanInvalid() {
  const invalid = new Set(invalidIds.value)
  draft.value.pinned_ids = draft.value.pinned_ids.filter(id => !invalid.has(id))
  draft.value.tags.forEach(tag => { tag.operator_ids = tag.operator_ids.filter(id => !invalid.has(id)) })
}
async function saveDraft() {
  validationAttempted.value = true
  if (hasTagErrors.value) { await nextTick(); focusTag(tagErrors.value.findIndex(Boolean)); return }
  if (!props.ready || !changed.value) return
  try {
    const content = operatorOrganizationContent(draft.value)
    if (await props.save(content, baselineRevision.value)) { resetDraft(); notice.value = '分类设置已保存'; if (sheetOpen.value) setPanelOpen(false) }
  } catch (err) { notice.value = err.message; noticeError.value = true }
}
async function applyBatch(add) {
  try { await props.save(updateOperatorTag(props.value, batchTag.value, [...props.selectedIds], add)) }
  catch (err) { notice.value = err.message; noticeError.value = true }
}
</script>

<style scoped>
.operator-organization { container: operator-organization / inline-size; color: var(--ink); font-size: 13px; line-height: 1.6; }
.organization-batch, .organization-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; }
.organization-batch { margin: 0 14px 12px; }
button, select, input { font: inherit; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; max-width: 100%; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--theme-strong-text, var(--tea)); padding: 5px 9px; cursor: pointer; }
button:disabled { opacity: .45; cursor: default; }
button:hover:not(:disabled) { background: var(--cream); border-color: var(--tea); }
summary { padding: 5px 0; cursor: pointer; font-weight: 600; }
.organization-editor { display: grid; gap: 16px; max-width: 1040px; padding: 0 14px 14px; }
.organization-editor-grid, .organization-order-panel { display: grid; gap: 16px; min-width: 0; }
.organization-section { display: grid; align-content: start; gap: 9px; min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--cream); }
.organization-section-heading { display: flex; align-items: center; gap: 7px; }
h3 { font-size: 14px; font-weight: 650; line-height: 1.5; }
.organization-section-heading small { margin-left: auto; }
.organization-sort-list { display: grid; gap: 6px; list-style: none; margin: 0; padding: 0; }
.organization-sort-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; padding: 7px 0; border-bottom: 1px solid var(--line); }
.organization-sort-row:last-child { border-bottom: 0; }
.organization-rank { display: grid; place-items: center; flex: 0 0 22px; height: 22px; border: 1px solid var(--line); border-radius: 6px; color: var(--ink-60); font-family: var(--font-d); font-size: 11px; }
.organization-sort-name { flex: 1 1 60px; min-width: 0; overflow-wrap: anywhere; }
.organization-row-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.organization-pin-row .organization-row-actions { flex-basis: 100%; padding-left: 30px; }
.organization-tag-caption { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; margin-top: 4px; font-size: 12px; font-weight: 600; }
.organization-tag-caption small { font-weight: 400; }
.organization-tag-list { display: grid; gap: 8px; }
.organization-tag-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; }
.organization-tag-field { display: grid; gap: 5px; min-width: 0; }
.organization-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.organization-tag-field input { min-height: 36px; }
.organization-tag-meta { display: flex; flex-wrap: wrap; gap: 8px; min-height: 36px; align-items: center; justify-content: end; }
.organization-tag-meta small { white-space: nowrap; font-variant-numeric: tabular-nums; }
.organization-delete { min-height: 36px; min-width: 44px; color: var(--theme-danger-text, var(--rouge)); background: transparent; border-color: transparent; }
.organization-add { justify-self: stretch; width: 100%; min-height: 36px; border-style: dashed; background: transparent; }
input:not([type="file"]), select { width: 100%; min-width: 0; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); padding: 7px 9px; }
.organization-batch select { width: auto; }
input[aria-invalid="true"] { border-color: var(--rouge); }
p, small { margin: 0; color: var(--ink-60); overflow-wrap: anywhere; }
small { font-size: 12px; }
.organization-empty { padding: 9px 0; }
.organization-save-area { display: grid; gap: 10px; border-top: 1px solid var(--line); padding-top: 14px; }
.organization-save { background: var(--tea); color: var(--on-strong); border-color: var(--tea); padding: 7px 14px; font-weight: 600; }
.organization-save:hover:not(:disabled) { background: var(--tea-deep); color: var(--on-strong); }
.organization-feedback { color: var(--ink-60); font-size: 12px; }
.operator-organization > .organization-feedback { margin: 0 14px 10px; }
.organization-error, .organization-field-error { color: var(--theme-danger-text, var(--rouge)); font-size: 12px; }
.organization-error { margin: 8px 0; }
.operator-organization > .organization-error { margin: 0 14px 12px; }
.organization-warning { padding: 9px 12px; background: var(--paper); border-radius: 7px; }
button:focus-visible, summary:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
@container operator-organization (min-width: 700px) {
  .organization-editor-grid { grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); align-items: start; }
}
@container operator-organization (max-width: 360px) {
  .organization-tag-row { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
</style>

<style scoped src="./operatorOrganizationSheetMobile.css"></style>
