<template>
  <Teleport to="body">
    <div v-if="open" class="box-viewer-mask" :class="{ 'is-short-viewport': shortViewport }" :style="viewportStyle"
      @pointerdown="backdropPressed = $event.target === $event.currentTarget" @click.self="onBackdrop">
      <section id="operator-box-viewer" ref="panel" class="box-viewer-dialog" :class="{ 'has-results': status !== 'input' }"
        role="dialog" aria-modal="true" aria-labelledby="box-viewer-title" tabindex="-1" @focusin="revealFocusedControl">
        <header class="box-viewer-header">
          <div><h2 id="box-viewer-title">查看他人 BOX</h2><p v-if="status === 'input'">通过分享码或链接查看他人公开的密探档案</p></div>
          <button ref="closeButton" type="button" class="box-viewer-close" aria-label="关闭查看他人 BOX" @click="close"><X :size="20" aria-hidden="true" /></button>
        </header>
        <div ref="scrollBody" class="box-viewer-body">
          <OperatorShareContent :token="token" embedded @submit="token = $event.token" @reset="token = ''" @status-change="onStatusChange" />
        </div>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, watch } from 'vue'
import { X } from '@lucide/vue'
import OperatorShareContent from './OperatorShareContent.vue'
import { modalFocusState, useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'

const open = defineModel('open', { type: Boolean, default: false })
const token = ref(''), status = ref('input')
const panel = ref(null), closeButton = ref(null), scrollBody = ref(null)
const backdropPressed = ref(false)
// 短视口也只滚动内容，标题和关闭入口保持可见。
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(open, scrollBody, scrollBody)
function close() {
  if (modalFocusState.panel && modalFocusState.panel !== panel.value) return
  open.value = false
}
function onBackdrop() {
  if (backdropPressed.value) close()
  backdropPressed.value = false
}
function onStatusChange(value) {
  status.value = value
  if (scrollBody.value) scrollBody.value.scrollTop = 0
}
useModalFocus(open, panel, { initialFocus: () => panel.value?.querySelector('input') || closeButton.value, onEscape: close, preventRestoreScroll: true })
watch(open, (visible, _, onCleanup) => {
  token.value = ''
  status.value = 'input'
  backdropPressed.value = false
  if (!visible) return
  const body = document.body, root = document.documentElement
  const x = window.scrollX, y = window.scrollY
  const previous = Object.fromEntries(['position', 'top', 'left', 'width', 'overflow', 'paddingRight'].map(key => [key, body.style[key]]))
  const rootOverflow = root.style.overflow
  const gap = root.clientWidth ? Math.max(0, window.innerWidth - root.clientWidth) : 0
  if (gap) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight || '0') + gap}px`
  Object.assign(body.style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden' })
  root.style.overflow = 'hidden'
  onCleanup(() => {
    Object.assign(body.style, previous)
    root.style.overflow = rootOverflow
    window.scrollTo(x, y)
  })
}, { immediate: true, flush: 'post' })
</script>
<style scoped>
.box-viewer-mask { position: fixed; inset: 0; z-index: var(--z-overlay-panel); display: grid; place-items: center; box-sizing: border-box; padding: 0; background: var(--theme-overlay, rgba(73, 59, 44, .5)); }
.box-viewer-dialog { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; max-height: 100%; box-sizing: border-box; overflow: hidden; background: var(--surface); color: var(--ink); }
.box-viewer-dialog:focus { outline: none; }
.box-viewer-header { display: flex; flex: none; justify-content: space-between; align-items: center; gap: 12px; padding: calc(12px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left)); border-bottom: 1px solid var(--line); background: var(--surface); }
.box-viewer-header h2 { margin: 0; min-width: 0; font: 900 20px/1.4 var(--font-s); }
.box-viewer-header > div { min-width: 0; }
.box-viewer-header p { margin: 4px 0 0; color: var(--ink-60); font-size: 13px; line-height: 1.6; }
.box-viewer-close { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--ink); cursor: pointer; }
.box-viewer-close:hover { background: var(--paper); }
.box-viewer-close:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.box-viewer-body { min-width: 0; min-height: 0; padding: 16px max(16px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); overflow-y: auto; overscroll-behavior: contain; scroll-padding-block: 12px; }
@media (min-width: 641px) {
  .box-viewer-mask { padding: 24px; }
  .box-viewer-dialog { width: min(660px, 100%); height: auto; max-height: min(90dvh, calc(var(--modal-viewport-height, 100dvh) * .9)); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 32px 80px -24px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.4); }
  .box-viewer-dialog.has-results { width: min(1100px, 100%); }
  .box-viewer-header { padding: 16px 24px; }
  .box-viewer-header h2 { font-size: 22px; }
  .box-viewer-close { width: 36px; height: 36px; }
  .box-viewer-body { padding: 20px 24px 24px; }
}
/* 键盘挤压时保留标题和关闭入口，仍只滚动内容区。 */
.is-short-viewport .box-viewer-header { padding-block: 8px; }
.is-short-viewport .box-viewer-dialog { max-height: 100%; }
.is-short-viewport .box-viewer-header p { display: none; }
</style>
