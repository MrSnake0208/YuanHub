<template>
  <Teleport to="body">
    <div v-if="open && step" v-show="!paused && !blocked" class="recognition-tour">
      <div v-for="(rect, index) in rects" :key="index" class="recognition-tour-ring" :style="rectStyle(rect)" aria-hidden="true" />
      <section ref="card" class="recognition-tour-card" :class="{ 'is-collapsed': collapsed }" :style="cardStyle" role="region" aria-label="星石任务引导" tabindex="-1" :data-placement="position.placement">
        <header>
          <button v-if="collapsed" type="button" class="recognition-tour-expand" :aria-label="`展开提示：${step.title}`" @click="expand">{{ step.title }}</button>
          <h2 v-else aria-live="polite">{{ step.title }}</h2>
          <button type="button" class="recognition-tour-move" :aria-label="position.placement === 'top' ? '将提示移到下方' : '将提示移到上方'" @click="move">↕</button>
          <button type="button" class="recognition-tour-close" aria-label="稍后再看，关闭本次引导" @click="emit('close', 'later')">×</button>
        </header>
        <template v-if="!collapsed">
          <p class="recognition-tour-body">{{ step.body }}</p>
          <footer>
            <button type="button" @click="emit('help', step.help)">帮助与示例</button>
            <button v-if="step.id === 'review'" type="button" class="recognition-tour-finish" @click="emit('close', 'complete')">完成引导</button>
            <button v-else type="button" @click="emit('skip', step.id)">跳过此提示</button>
          </footer>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { resolveTutorialTargets, clipTutorialRect, tutorialCardPosition, shouldRevealTutorialTarget } from './recognitionTutorial.js'
const props = defineProps({ open: Boolean, step: { type: Object, default: null }, root: { type: Object, default: null }, replayId: { type: Number, default: 0 }, paused: Boolean, focusOnOpen: Boolean })
const emit = defineEmits(['close', 'skip', 'help'])
const card = ref(null), rects = ref([]), position = ref({ left: 12, top: 12, placement: 'bottom' })
const collapsed = ref(false), blocked = ref(false), ready = ref(false), maxHeight = ref(0)
const cardStyle = computed(() => ({ visibility: ready.value ? 'visible' : 'hidden', left: `${position.value.left}px`, top: `${position.value.top}px`, maxHeight: `${maxHeight.value}px` }))
const rectStyle = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
let opener = null, frame = 0, generation = 0, observer = null, resizeObserver = null, preferredEdge = null, expandedByUser = false
let focusedReplay = null

function viewport() {
  const visual = window.visualViewport
  const style = card.value && getComputedStyle(card.value)
  const safe = side => parseFloat(style?.getPropertyValue(`--tour-safe-${side}`)) || 0
  const left = (visual?.offsetLeft || 0) + safe('left'), viewTop = visual?.offsetTop || 0
  const header = document.querySelector('.mobile-shell')?.getBoundingClientRect()
  const top = Math.max(viewTop + safe('top'), header?.width ? header.bottom : 0)
  const bottom = viewTop + (visual?.height || window.innerHeight) - safe('bottom')
  return { left, top, width: (visual?.width || window.innerWidth) - safe('left') - safe('right'), height: Math.max(24, bottom - top) }
}
function update() {
  if (!props.open || !props.step || props.paused || !card.value) return
  blocked.value = Boolean(props.root?.querySelector('[role="dialog"], dialog[open]'))
  if (blocked.value) return
  const view = viewport(), { primary, related } = resolveTutorialTargets(props.root, props.step, view)
  const target = clipTutorialRect(primary?.getBoundingClientRect(), view)
  rects.value = [target, ...related.map(element => clipTutorialRect(element.getBoundingClientRect(), view))].filter(Boolean)
  const focused = props.root?.contains(document.activeElement) ? document.activeElement?.getBoundingClientRect() : null
  const tools = props.root?.querySelector('.review-workspace-tools')?.getBoundingClientRect()
  const navigation = document.querySelector('.island')?.getBoundingClientRect()
  const protectedRects = [...rects.value, focused, tools, navigation].filter(rect => rect?.width && rect.height)
  maxHeight.value = view.height - 24
  const size = card.value.getBoundingClientRect()
  const next = tutorialCardPosition(target, { width: size.width || Math.min(340, view.width - 24), height: size.height || (collapsed.value ? 60 : 180) }, view, protectedRects, preferredEdge)
  if (next.overlaps && !collapsed.value && !expandedByUser) {
    collapsed.value = true
    void nextTick(scheduleUpdate)
  }
  // If a user tabs into an obscured product control, give the product the space.
  if (next.overlaps && focused?.width && expandedByUser) { expandedByUser = false; collapsed.value = true; void nextTick(scheduleUpdate) }
  position.value = next
  ready.value = true
}
function scheduleUpdate() {
  if (frame || !props.open) return
  frame = requestAnimationFrame(() => { frame = 0; update() })
}
function resize() { collapsed.value = false; expandedByUser = false; scheduleUpdate() }
function move() { preferredEdge = position.value.placement === 'top' ? 'bottom' : 'top'; scheduleUpdate() }
function expand() { expandedByUser = true; collapsed.value = false; void nextTick(scheduleUpdate) }
function keydown(event) {
  if (event.key === 'Escape' && !props.paused && !document.querySelector('[role="dialog"], dialog[open]')) emit('close', 'later')
}
function restoreFocus() {
  if (!card.value?.contains(document.activeElement)) return
  const target = opener?.isConnected ? opener : props.root
  target?.focus({ preventScroll: true })
  if (document.activeElement !== target) props.root?.focus({ preventScroll: true })
}
function stop() {
  ++generation
  cancelAnimationFrame(frame); frame = 0
  observer?.disconnect(); observer = null
  resizeObserver?.disconnect(); resizeObserver = null
  window.removeEventListener('scroll', scheduleUpdate, true)
  window.removeEventListener('resize', resize)
  window.visualViewport?.removeEventListener('resize', resize)
  window.visualViewport?.removeEventListener('scroll', scheduleUpdate)
  document.removeEventListener('keydown', keydown)
  document.removeEventListener('focusin', scheduleUpdate)
}
watch([() => props.open, () => props.replayId], async ([open]) => {
  if (!open) restoreFocus()
  else if (!card.value?.contains(document.activeElement)) opener = document.activeElement
  stop()
  ready.value = false; preferredEdge = null; collapsed.value = false; expandedByUser = false
  if (!open) return
  const token = generation
  await nextTick()
  if (!props.open || token !== generation) return
  window.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true })
  window.addEventListener('resize', resize, { passive: true })
  window.visualViewport?.addEventListener('resize', resize, { passive: true })
  window.visualViewport?.addEventListener('scroll', scheduleUpdate, { passive: true })
  document.addEventListener('keydown', keydown)
  document.addEventListener('focusin', scheduleUpdate)
  observer = new MutationObserver(scheduleUpdate)
  if (props.root) observer.observe(props.root, { childList: true, subtree: true })
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleUpdate)
    if (props.root) resizeObserver.observe(props.root)
    if (card.value) resizeObserver.observe(card.value)
  }
  update()
  if (props.focusOnOpen && !props.paused && !blocked.value && focusedReplay !== props.replayId) {
    card.value?.focus({ preventScroll: true })
    focusedReplay = props.replayId
  }
}, { immediate: true, flush: 'pre' })
watch([() => props.step?.id, () => props.open], async () => {
  const token = generation
  collapsed.value = false; preferredEdge = null; expandedByUser = false
  await nextTick()
  if (!props.open || !props.step || props.paused || token !== generation) return
  const view = viewport(), { primary } = resolveTutorialTargets(props.root, props.step, view)
  const rect = primary?.getBoundingClientRect()
  if (shouldRevealTutorialTarget(props.step, rect, view)) {
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - view.top - 12), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  update()
}, { immediate: true })
watch(() => props.paused, () => { void nextTick(scheduleUpdate) })
onBeforeUnmount(() => { restoreFocus(); stop() })
</script>

<style scoped>
.recognition-tour { position: fixed; inset: 0; z-index: var(--z-popover); pointer-events: none; }
.recognition-tour-ring { position: absolute; border: 2px solid var(--accent); border-radius: 12px; box-sizing: border-box; pointer-events: none; }
.recognition-tour-card { --tour-safe-top: env(safe-area-inset-top, 0px); --tour-safe-bottom: env(safe-area-inset-bottom, 0px); --tour-safe-left: env(safe-area-inset-left, 0px); --tour-safe-right: env(safe-area-inset-right, 0px); position: fixed; box-sizing: border-box; width: min(340px, calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right))); overflow-y: auto; padding: 8px 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); box-shadow: 0 8px 24px rgb(73 59 44 / 16%); pointer-events: auto; font-family: var(--font-b); }
header { display: flex; align-items: center; gap: 4px; }
h2, .recognition-tour-expand { flex: 1; min-width: 0; margin: 0; font-family: var(--font-s); font-weight: 900; font-size: 16px; line-height: 1.4; }
.recognition-tour-body { font-size: 14px; line-height: 1.6; margin: 4px 0 8px; }
button { min-height: 44px; min-width: 44px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; }
button:focus-visible, .recognition-tour-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.recognition-tour-close, .recognition-tour-move { flex: none; border: 0; background: transparent; font-size: 18px; padding: 0; }
.recognition-tour-expand { text-align: left; border: 0; padding: 0; background: transparent; }
footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
.recognition-tour-finish { background: var(--tea); color: var(--cream); }
@media (max-width: 767px) { .recognition-tour-card { width: calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)); } }
@media (prefers-reduced-motion: reduce) { .recognition-tour * { scroll-behavior: auto; transition: none; } }
</style>
