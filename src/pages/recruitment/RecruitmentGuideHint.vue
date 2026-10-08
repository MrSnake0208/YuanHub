<template>
  <aside ref="hint" class="guide-hint" :data-guide-for="target" aria-label="当前操作提示">
    <p role="status" aria-atomic="true">{{ message }}</p>
    <slot />
  </aside>
</template>
<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
const props = defineProps({ target: { type: String, required: true }, message: { type: String, required: true } })
const hint = ref(null)
let anchor, frame = 0
function clear() { anchor?.removeAttribute('data-guide-active'); anchor = null }
async function locate() {
  clear()
  await nextTick()
  const root = hint.value?.closest('.pool-editor, .pool-timeline, .recruitment-main, .practice-panel')
  anchor = root?.querySelector(`[data-guide-target="${props.target}"]`)
  if (!anchor || !anchor.getClientRects().length || anchor.matches(':disabled, [aria-disabled="true"]')) return
  anchor.setAttribute('data-guide-active', 'true')
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (!hint.value || !anchor?.isConnected) return
    const body = hint.value.closest('.editor-body, .practice-panel'), viewport = window.visualViewport
    const bounds = body?.getBoundingClientRect()
    const top = Math.max(viewport?.offsetTop || 0, root.querySelector('.editor-header')?.getBoundingClientRect().bottom || 0, bounds?.top || 0) + 12
    const bottom = Math.min(viewport ? viewport.offsetTop + viewport.height : window.innerHeight, bounds?.bottom ?? Infinity) - 16
    const first = hint.value.getBoundingClientRect(), last = anchor.getBoundingClientRect()
    if (first.top >= top && last.bottom <= bottom) return
    const delta = last.bottom - first.top <= bottom - top && last.bottom > bottom ? last.bottom - bottom : first.top - top
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    if (body) body.scrollBy({ top: delta, behavior })
    else window.scrollBy({ top: delta, behavior })
  })
}
watch(() => props.target, locate)
onMounted(locate)
onBeforeUnmount(() => { clear(); cancelAnimationFrame(frame) })
</script>
<style scoped>
.guide-hint{position:relative;width:fit-content;max-width:100%;margin:10px 0 12px;padding:10px 12px;border:1px solid var(--accent);border-radius:10px;background:var(--cream);color:var(--ink);font:13px/1.6 var(--font-b);overflow-wrap:anywhere}.guide-hint::after{position:absolute;bottom:-6px;left:20px;width:10px;height:10px;content:'';transform:rotate(45deg);border-right:1px solid var(--accent);border-bottom:1px solid var(--accent);background:var(--cream)}p{margin:0}.guide-hint :deep(button){margin-top:8px}
</style>
