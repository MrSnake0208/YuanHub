<template>
  <Teleport to="body">
    <div v-if="open" class="planner-settings-mask" :class="{ 'is-short-viewport': shortViewport }" :style="viewportStyle" @click.self="requestClose">
      <section ref="panel" class="planner-settings-panel" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="description ? descriptionId : undefined" tabindex="-1" @focusin="revealFocusedControl">
        <header class="settings-panel-heading">
          <div><h3 :id="titleId" ref="heading" tabindex="-1">{{ title }}</h3><p v-if="description" :id="descriptionId">{{ description }}</p></div>
          <button type="button" class="settings-close" aria-label="关闭设置" :disabled="busy || confirming" @click="requestClose"><X :size="20" aria-hidden="true" /></button>
        </header>
        <form ref="form" class="settings-panel-form" @submit.prevent="save">
          <div ref="scrollBody" class="settings-panel-body"><slot /><p v-if="error" ref="errorMessage" class="settings-panel-error" role="alert" tabindex="-1">{{ error }}</p></div>
          <footer class="settings-panel-footer">
            <span role="status">{{ busy ? '正在保存…' : dirty ? '有未保存的修改' : '当前设置' }}</span>
            <button type="button" :disabled="busy || confirming" @click="requestClose">{{ dirty ? '取消' : '关闭' }}</button>
            <button type="submit" class="settings-save" :disabled="busy || saveDisabled || confirming">{{ busy ? '保存中…' : saveLabel }}</button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { inject, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
import { X } from '@lucide/vue'
import { dialog } from '../../utils/dialog.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'

const props = defineProps({ open: Boolean, title: String, description: String, dirty: Boolean, busy: Boolean, error: String, saveDisabled: Boolean, saveLabel: { type: String, default: '保存设置' } })
const emit = defineEmits(['save', 'close'])
const titleId = 'planner-settings-' + useId(), descriptionId = titleId + '-description'
const panel = ref(null), heading = ref(null), scrollBody = ref(null), form = ref(null), errorMessage = ref(null), confirming = ref(false)
let generation = 0
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(() => props.open, scrollBody, panel)
useModalFocus(() => props.open, panel, { initialFocus: () => heading.value, onEscape: escape, preventRestoreScroll: true })
if (inject(matchedRouteKey, null)?.value) onBeforeRouteLeave(() => !props.open || requestClose())
onBeforeUnmount(() => { generation++ })

watch(() => props.open, (open, _, onCleanup) => {
  generation++; confirming.value = false
  if (!open) return
  const overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  const beforeLeave = event => { if (props.dirty || props.busy) { event.preventDefault(); event.returnValue = '' } }
  window.addEventListener('beforeunload', beforeLeave)
  onCleanup(() => { document.body.style.overflow = overflow; window.removeEventListener('beforeunload', beforeLeave) })
}, { immediate: true })
watch(() => props.error, async error => { if (error && props.open) { await nextTick(); errorMessage.value?.focus() } })

function escape() {
  const select = panel.value?.querySelector('[role="combobox"][aria-expanded="true"]')
  if (select) { document.getElementById(select.getAttribute('aria-controls'))?.hidePopover?.(); return }
  requestClose()
}
async function requestClose() {
  if (props.busy || confirming.value) return false
  const token = generation
  if (props.dirty) {
    confirming.value = true
    const discard = await dialog.confirm({ title: '放弃未保存的修改？', message: '已保存的设置会保留。继续编辑可以完成这次修改。', confirmText: '放弃修改', cancelText: '继续编辑' })
    if (token !== generation) return false
    confirming.value = false
    if (!discard) return false
  }
  if (!props.open || props.busy || token !== generation) return false
  emit('close')
  return true
}
function save() { if (!props.busy && !props.saveDisabled && !confirming.value && form.value?.reportValidity()) emit('save') }
</script>

<style scoped>
.planner-settings-mask { position: fixed; inset: 0; z-index: var(--z-overlay-panel); display: flex; justify-content: flex-end; background: var(--theme-overlay, rgba(73, 59, 44, .38)); }
.planner-settings-panel { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; max-height: 100dvh; background: var(--surface); color: var(--ink); box-shadow: -8px 0 32px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.12); }
.settings-panel-heading { display: flex; align-items: flex-start; gap: 12px; padding: calc(18px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left)); border-bottom: 1px solid var(--line); }
.settings-panel-heading > div { flex: 1; min-width: 0; }
h3 { margin: 0; font: 800 20px/1.4 var(--font-s); }
p { margin: 6px 0 0; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.settings-panel-heading p { color: var(--ink-60); }
.settings-panel-form { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.settings-panel-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px max(16px, env(safe-area-inset-right)) 18px max(16px, env(safe-area-inset-left)); scroll-padding-block: 16px; }
.settings-panel-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px max(16px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); border-top: 1px solid var(--line); background: var(--cream); }
.settings-panel-footer > span { flex: 1 0 100%; color: var(--ink-60); font-size: 12px; }
button { min-height: 38px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: 600 13px/1.5 var(--font-b); cursor: pointer; }
.settings-close { display: grid; flex: none; place-items: center; width: 38px; padding: 0; }
.settings-save { background: var(--tea); border-color: var(--tea); color: var(--on-strong); }
.settings-panel-error { color: var(--theme-danger-text, var(--rouge)); }
:is(button, [tabindex]):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
button:disabled { opacity: .55; cursor: default; }
.is-short-viewport .planner-settings-panel { overflow-y: auto; }
.is-short-viewport :is(.settings-panel-form, .settings-panel-body) { flex: none; overflow: visible; }
@media (max-width: 767px) {
  button { min-height: 44px; }
  .settings-close { width: 44px; }
}
@media (min-width: 768px) {
  .planner-settings-panel { width: min(540px, 100%); }
  .settings-panel-footer > span { flex: 1 1 auto; }
}
</style>
