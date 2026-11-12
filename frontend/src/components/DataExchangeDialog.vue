<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask data-exchange-mask" :style="viewportStyle">
      <section ref="panel" class="data-exchange-dialog" :class="{ 'is-short': shortViewport }" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-busy="busy || closing" tabindex="-1" @focusin="revealFocusedControl">
        <header class="data-exchange-header">
          <div><h2 :id="titleId">{{ title }}</h2><p v-if="accountName || game">{{ [accountName, game].filter(Boolean).join(' · ') }}</p></div>
          <button type="button" class="data-exchange-close" :disabled="busy || closing" :aria-label="'关闭' + title" @click="requestClose"><X :size="18" aria-hidden="true" /></button>
        </header>
        <div class="data-exchange-tabs" role="tablist" :aria-label="title" @keydown="onTabKeydown">
          <button v-for="name in tabs" :id="`${id}-${name}-tab`" :key="name" type="button" role="tab" :aria-selected="activeTab === name" :aria-controls="`${id}-${name}-panel`" :tabindex="activeTab === name ? 0 : -1" :disabled="busy || closing" @click="selectTab(name)">{{ name === 'import' ? '导入' : '导出' }}</button>
        </div>
        <div ref="scrollBody" class="data-exchange-body">
          <div v-for="name in tabs" :id="`${id}-${name}-panel`" v-show="activeTab === name" :key="name" role="tabpanel" :aria-labelledby="`${id}-${name}-tab`" tabindex="0"><slot :name="name" /></div>
        </div>
        <footer class="data-exchange-footer">
          <button type="button" class="data-exchange-close" :disabled="busy || closing" @click="requestClose">关闭</button>
          <div class="data-exchange-footer-actions"><slot :name="`${activeTab}-footer`" /></div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue'
import { X } from '@lucide/vue'
import { useModalFocus } from '../composables/useModalFocus.js'
import { useModalViewport } from '../composables/useModalViewport.js'

const props = defineProps({ open: Boolean, title: { type: String, default: '导入/导出' }, accountName: String, game: String, busy: Boolean, beforeClose: Function, hideExport: Boolean, hideImport: Boolean })
const tab = defineModel('tab', { type: String, default: 'import' })
const emit = defineEmits(['update:open', 'close'])
const id = useId(), titleId = `${id}-title`
const panel = ref(null), scrollBody = ref(null), closing = ref(false)
const visible = computed(() => props.open)
const tabs = computed(() => ['import', 'export'].filter(name => name === 'import' ? !props.hideImport : !props.hideExport))
const activeTab = computed(() => tabs.value.includes(tab.value) ? tab.value : tabs.value[0])
// 极矮视口也只滚动主体，保持头部、页签和底栏可见。
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(visible, scrollBody, scrollBody)
useModalFocus(visible, panel, { initialFocus: () => panel.value, onEscape: requestClose, preventScroll: true, preventRestoreScroll: true })
let visibilityVersion = 0
watch(visible, (open, _, cleanup) => {
  visibilityVersion++
  closing.value = false
  if (!open) return
  const overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  cleanup(() => { document.body.style.overflow = overflow })
}, { immediate: true, flush: 'sync' })

async function requestClose() {
  if (!props.open || props.busy || closing.value) return
  const version = visibilityVersion
  closing.value = true
  try {
    if (props.beforeClose && await props.beforeClose() === false) return
    if (!props.open || props.busy || version !== visibilityVersion) return
    emit('update:open', false)
    emit('close')
  } finally { if (version === visibilityVersion) closing.value = false }
}
function selectTab(name) {
  if (!props.busy && !closing.value) tab.value = name
}
async function onTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  if (props.busy || closing.value) return
  const index = tabs.value.indexOf(activeTab.value)
  selectTab(tabs.value[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.value.length) % tabs.value.length])
  await nextTick()
  panel.value?.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true })
}
</script>

<style scoped>
.data-exchange-mask { box-sizing: border-box; }
.data-exchange-dialog { display: flex; flex-direction: column; min-width: 0; overflow: hidden; border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
.data-exchange-header, .data-exchange-tabs, .data-exchange-footer { flex-shrink: 0; }
.data-exchange-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line); }
.data-exchange-header > div { min-width: 0; overflow-wrap: anywhere; }
.data-exchange-header h2 { margin: 0; font-family: var(--font-s); font-size: 21px; line-height: 1.4; }
.data-exchange-header p { margin: 4px 0 0; color: var(--ink-60); font-size: 14px; }
.data-exchange-close, .data-exchange-tabs button { min-width: 44px; min-height: 44px; font: inherit; color: var(--ink); background: var(--surface); cursor: pointer; }
.data-exchange-close { padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; }
.data-exchange-header .data-exchange-close { display: grid; place-items: center; flex: none; padding: 8px; }
.data-exchange-tabs { display: flex; border-bottom: 1px solid var(--line); }
.data-exchange-tabs button { flex: 1; border: 0; border-bottom: 2px solid transparent; }
.data-exchange-tabs button[aria-selected="true"] { border-bottom-color: var(--accent); background: var(--cream); font-weight: 600; }
.data-exchange-body { flex: 1; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; overflow-wrap: anywhere; }
.data-exchange-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--line); }
.data-exchange-footer-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; min-width: 0; }
.data-exchange-footer-actions :deep(button) { min-height: 44px; max-width: 100%; white-space: normal; }
.data-exchange-close:disabled, .data-exchange-tabs button:disabled { cursor: not-allowed; opacity: .5; }
.data-exchange-dialog :is(button, [role="tabpanel"]):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: -3px; }
</style>
<style scoped src="./dataExchangeDialogDesktop.css"></style>
<style scoped src="./dataExchangeDialogMobile.css"></style>
