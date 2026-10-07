<template>
  <Teleport to="body">
    <div v-if="open" class="recognition-tour" :class="{ 'is-mobile': mobile }">
      <svg class="recognition-tour-shade" aria-hidden="true" width="100%" height="100%">
        <defs><mask id="recognition-tour-mask" maskUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="white" />
          <rect v-for="(rect, index) in rects" :key="index" :x="rect.left" :y="rect.top" :width="rect.width" :height="rect.height" rx="12" fill="black" />
        </mask></defs>
        <rect width="100%" height="100%" fill="rgb(73 59 44 / 48%)" mask="url(#recognition-tour-mask)" />
      </svg>
      <div v-for="(rect, index) in rects" :key="index" class="recognition-tour-ring" :style="rectStyle(rect)" />
      <section ref="card" class="recognition-tour-card" :style="cardStyle" role="region" :aria-label="tutorialLabel" tabindex="-1" :data-placement="placement">
        <div v-if="mobile" class="recognition-tour-handle-row">
          <button class="recognition-tour-handle" type="button" :aria-label="`拖动${tutorialLabel}，上下方向键也可移动`" @pointerdown="beginDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @keydown.up.prevent="moveSheet(32)" @keydown.down.prevent="moveSheet(-32)"><span /></button>
        </div>
        <header>
          <div aria-live="polite"><span class="recognition-tour-count">{{ stepIndex + 1 }} / {{ steps.length }}</span><h2>{{ step.title }}</h2></div>
          <button type="button" class="recognition-tour-close" :aria-label="`关闭${tutorialLabel}`" @click="close">×</button>
        </header>
        <div class="recognition-tour-details">
          <p v-for="(paragraph, index) in step.paragraphs || [step.body]" :key="index" class="recognition-tour-body">{{ paragraph }}</p>
          <button v-if="step.exampleAction" type="button" class="recognition-tour-example" @click="exampleKind = step.exampleAction">{{ step.exampleLabel }}</button>
          <p v-if="mobile && showMobileHint" class="recognition-tour-hint">本教程卡片可拖动，不挡住操作即可</p>
          <footer><button type="button" :disabled="stepIndex === 0" @click="navigate(-1)">上一步</button><button type="button" class="recognition-tour-next" @click="stepIndex === steps.length - 1 ? close() : navigate(1)">{{ stepIndex === steps.length - 1 ? '完成' : '下一步' }}</button></footer>
        </div>
      </section>
    </div>
  </Teleport>
  <RecognitionExampleModal :items="exampleItems" :info="exampleKind === 'review-info' ? bagReviewInfo : null" @close="exampleKind = null" />
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import RecognitionExampleModal from './RecognitionExampleModal.vue'
import { recognitionTutorialSteps, recognitionTutorialExamples, tutorialStepIndex, resolveTutorialTargets, clipTutorialRect, tutorialCardPosition, clampTutorialLift, shouldRevealTutorialTarget, tutorialSheetBounds, tutorialElementRect } from './recognitionTutorial.js'
import { bagTutorialSteps, bagReviewInfo } from './bagTutorial.js'

const props = defineProps({ open: Boolean, replayId: { type: Number, default: 0 }, root: { type: Object, default: null }, mode: { type: String, default: 'recognition' } })
const emit = defineEmits(['close', 'step-change'])
const stepIndex = ref(0), mobile = ref(false), lift = ref(0), card = ref(null)
const rects = ref([]), position = ref({ left: 12, top: 12 }), placement = ref('fallback'), ready = ref(false)
const sheetBounds = ref(null)
const exampleKind = ref(null), showMobileHint = ref(false)
const steps = computed(() => props.mode === 'bag' ? bagTutorialSteps : recognitionTutorialSteps)
const tutorialLabel = computed(() => props.mode === 'bag' ? '使用教程' : '识别教程')
const step = computed(() => steps.value[stepIndex.value])
const exampleItems = computed(() => recognitionTutorialExamples[exampleKind.value] || [])
const cardStyle = computed(() => ({ visibility: ready.value ? 'visible' : 'hidden', ...(mobile.value ? { bottom: `${(sheetBounds.value?.bottom ?? 12) + lift.value}px`, ...(sheetBounds.value ? { maxHeight: `min(62dvh, calc(100dvh - 96px), ${sheetBounds.value.maxHeight}px)` } : {}) } : { left: `${position.value.left}px`, top: `${position.value.top}px` }) }))
const rectStyle = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
let opener = null
let frame = 0, settleFrame = 0, settleResolve = null, navigation = 0, dragging = null, resizeTimer = 0
let resizeObserver = null, mutationObserver = null, observed = [], highlighted = [], hintShown = false

function viewport() {
  const view = window.visualViewport
  return { left: view?.offsetLeft || 0, top: view?.offsetTop || 0, width: view?.width || window.innerWidth, height: view?.height || window.innerHeight }
}
function sheetSafeArea() {
  const style = card.value && window.getComputedStyle(card.value)
  return { top: Math.max(0, parseFloat(style?.getPropertyValue('--recognition-tour-safe-top')) || 0), bottom: Math.max(0, parseFloat(style?.getPropertyValue('--recognition-tour-safe-bottom')) || 0) }
}
function clearHighlights() {
  highlighted.forEach(element => element.classList.remove('recognition-tutorial-related'))
  highlighted = []
}
function update() {
  if (!props.open) return
  const view = viewport()
  mobile.value = window.innerWidth < 768
  const safeArea = sheetSafeArea()
  if (mobile.value && !hintShown) { hintShown = true; showMobileHint.value = true }
  const { primary, related } = resolveTutorialTargets(props.root, step.value, view.height)
  const visibleRelated = related.filter(element => tutorialElementRect(element, view))
  if (mobile.value) sheetBounds.value = tutorialSheetBounds(view, window.innerHeight, safeArea,
    step.value.mobileAvoidTarget ? clipTutorialRect(primary?.getBoundingClientRect(), view, 0) : null)
  const elements = Array.from(new Set([primary, ...visibleRelated].filter(Boolean)))
  clearHighlights()
  highlighted = visibleRelated
  highlighted.forEach(element => element.classList.add('recognition-tutorial-related'))
  if (resizeObserver && (elements.length !== observed.length || elements.some((element, index) => element !== observed[index]))) {
    observed.forEach(element => resizeObserver.unobserve?.(element))
    elements.forEach(element => resizeObserver.observe(element))
    observed = elements
  }
  rects.value = elements.map(element => tutorialElementRect(element, view)).filter(Boolean)
  const size = card.value?.getBoundingClientRect() || { width: 340, height: 270 }
  const nextPosition = tutorialCardPosition(clipTutorialRect(primary?.getBoundingClientRect(), view), size, view, step.value.relatedTargets ? rects.value : [])
  position.value = nextPosition
  placement.value = nextPosition.placement
  lift.value = boundedSheetLift(lift.value)
}
function scheduleUpdate() {
  if (frame || !props.open) return
  frame = requestAnimationFrame(() => { frame = 0; update() })
}
function stopSettling() {
  cancelAnimationFrame(settleFrame)
  settleFrame = 0
  settleResolve?.()
  settleResolve = null
}
function waitForScroll(token) {
  stopSettling()
  return new Promise(resolve => {
    settleResolve = resolve
    let previous = window.scrollY, stable = 0, count = 0
    function tick() {
      const current = window.scrollY
      stable = Math.abs(current - previous) < 1 ? stable + 1 : 0
      previous = current
      // Wait at least six frames so delayed smooth scroll has time to begin.
      if (token !== navigation || !props.open || (++count >= 6 && stable >= 4) || count >= 90) {
        settleFrame = 0; settleResolve = null; resolve(); return
      }
      settleFrame = requestAnimationFrame(tick)
    }
    settleFrame = requestAnimationFrame(tick)
  })
}
async function revealStep(resetHint = true) {
  const token = ++navigation
  emit('step-change', step.value)
  ready.value = false
  if (resetHint) showMobileHint.value = false
  await nextTick()
  if (!props.open || token !== navigation) return
  update()
  await nextTick()
  const view = viewport()
  const { primary } = resolveTutorialTargets(props.root, step.value, view.height)
  const rect = primary?.getBoundingClientRect()
  if (shouldRevealTutorialTarget(step.value, rect, view)) {
    const top = Math.max(0, window.scrollY + rect.top - view.top - Math.max(64, view.height * (mobile.value ? 0.16 : 0.1)))
    window.scrollTo({ top, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    await waitForScroll(token)
  }
  if (!props.open || token !== navigation) return
  await nextTick()
  update()
  ready.value = true
}
function onResize() {
  scheduleUpdate()
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    if (!props.open || exampleKind.value) return
    const view = viewport(), { primary } = resolveTutorialTargets(props.root, step.value, view.height)
    const rect = primary?.getBoundingClientRect(), sheetTop = mobile.value ? card.value?.getBoundingClientRect().top : view.top + view.height
    if (rect && step.value.scroll !== 'preserve' && (rect.top < view.top + 64 || rect.top >= sheetTop - 16)) void revealStep(false)
  }, 160)
}
function navigate(delta) {
  stepIndex.value = tutorialStepIndex(stepIndex.value, delta, steps.value.length)
  lift.value = 0
  exampleKind.value = null
  void revealStep()
}
function close() { exampleKind.value = null; emit('close') }
function onKeydown(event) {
  // Product dialogs and the example viewer own Escape while they are open.
  if (event.key === 'Escape' && !exampleKind.value && !document.querySelector('[role="dialog"], dialog[open]')) close()
}
function boundedSheetLift(value) {
  const view = viewport(), safeArea = sheetSafeArea()
  const extraBottom = mobile.value ? Math.max(0, (sheetBounds.value?.bottom || 0) - (window.innerHeight - view.top - view.height + 12 + safeArea.bottom)) : 0
  return clampTutorialLift(value, view.height, card.value?.getBoundingClientRect().height || 0, { ...safeArea, bottom: safeArea.bottom + extraBottom })
}
function moveSheet(delta) { lift.value = boundedSheetLift(lift.value + delta) }
function beginDrag(event) {
  if (event.button !== 0) return
  event.preventDefault()
  dragging = { id: event.pointerId, y: event.clientY, lift: lift.value }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}
function moveDrag(event) {
  if (!dragging || event.pointerId !== dragging.id) return
  event.preventDefault()
  lift.value = boundedSheetLift(dragging.lift + dragging.y - event.clientY)
}
function endDrag(event) {
  if (event.pointerId !== dragging?.id) return
  event.currentTarget.releasePointerCapture?.(event.pointerId)
  dragging = null
}
function stop() {
  ++navigation
  stopSettling()
  window.clearTimeout(resizeTimer)
  cancelAnimationFrame(frame); frame = 0
  resizeObserver?.disconnect(); resizeObserver = null
  mutationObserver?.disconnect(); mutationObserver = null
  observed = []; dragging = null; clearHighlights(); rects.value = []
  window.removeEventListener('scroll', scheduleUpdate, true)
  window.removeEventListener('resize', onResize)
  window.visualViewport?.removeEventListener('resize', onResize)
  window.visualViewport?.removeEventListener('scroll', scheduleUpdate)
  document.removeEventListener('keydown', onKeydown)
}
function restoreFocus() {
  if (!card.value?.contains(document.activeElement)) return
  const target = opener?.isConnected ? opener : props.root
  target?.focus({ preventScroll: true })
  if (document.activeElement !== target) props.root?.focus({ preventScroll: true })
}
watch([() => props.open, () => props.replayId, () => props.mode], async ([open], previous) => {
  if (open && (!previous?.[0] || !card.value?.contains(document.activeElement))) opener = document.activeElement
  if (!open) restoreFocus()
  stop()
  if (!open) { exampleKind.value = null; return }
  stepIndex.value = 0; lift.value = 0
  await nextTick()
  if (!props.open) return
  window.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true })
  window.addEventListener('resize', onResize, { passive: true })
  window.visualViewport?.addEventListener('resize', onResize, { passive: true })
  window.visualViewport?.addEventListener('scroll', scheduleUpdate, { passive: true })
  document.addEventListener('keydown', onKeydown)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleUpdate)
    if (props.root) resizeObserver.observe(props.root)
    resizeObserver.observe(document.body)
    if (card.value) resizeObserver.observe(card.value)
  }
  mutationObserver = new MutationObserver(scheduleUpdate)
  if (props.root) mutationObserver.observe(props.root, { childList: true, subtree: true })
  const opening = revealStep(), token = navigation
  void opening.then(() => { if (props.open && token === navigation && !exampleKind.value) card.value?.focus({ preventScroll: true }) })
}, { immediate: true })
watch(() => props.root, () => {
  if (!props.open) return
  mutationObserver?.disconnect()
  if (props.root) mutationObserver?.observe(props.root, { childList: true, subtree: true })
  scheduleUpdate()
})
onBeforeUnmount(() => { restoreFocus(); stop() })
</script>

<style>
.recognition-tutorial-related { outline: 2px solid var(--accent) !important; outline-offset: 4px; }
</style>
<style scoped>
.recognition-tour { position: fixed; inset: 0; z-index: var(--z-popover); pointer-events: none; }
.recognition-tour-shade { position: absolute; inset: 0; pointer-events: none; }
.recognition-tour-ring { position: absolute; border: 2px solid var(--accent); border-radius: 12px; box-sizing: border-box; pointer-events: none; }
.recognition-tour-card { position: fixed; box-sizing: border-box; width: min(340px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow-y: auto; padding: 12px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: 0 12px 36px rgb(73 59 44 / 22%); pointer-events: auto; font-family: var(--font-b); }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
h2 { margin: 2px 0 0; font-family: var(--font-s); font-weight: 900; font-size: 16px; line-height: 1.4; }
.recognition-tour-count { font-family: var(--font-d); font-size: 12px; }
.recognition-tour-body { white-space: pre-line; font-size: 13px; line-height: 1.6; margin: 8px 0 0; }
.recognition-tour-body + .recognition-tour-body { margin-top: 0; }
button { min-height: 32px; min-width: 32px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
button:disabled { opacity: .45; cursor: default; }
.recognition-tour-close { flex: none; font-size: 18px; }
.recognition-tour-example { min-height: 28px; border: 0; text-decoration: underline; background: transparent; padding-inline: 0; }
footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; }
.recognition-tour-next { background: var(--tea); color: var(--cream); }
.recognition-tour-hint { font-size: 13px; line-height: 1.5; margin: 4px 0; }
.is-mobile .recognition-tour-card { --recognition-tour-safe-top: env(safe-area-inset-top, 0px); --recognition-tour-safe-bottom: env(safe-area-inset-bottom, 0px); left: max(12px, env(safe-area-inset-left)); right: max(12px, env(safe-area-inset-right)); width: auto; max-height: min(62dvh, calc(100dvh - 96px)); padding: 8px 12px 10px; }
.recognition-tour-handle-row { display: flex; justify-content: space-between; align-items: center; }
.recognition-tour-handle { display: grid; place-items: center; flex: 1; border: 0; background: transparent; touch-action: none; user-select: none; cursor: ns-resize; }
.recognition-tour-handle span { width: 40px; height: 4px; border-radius: 4px; background: var(--tea); opacity: .55; }
.is-mobile button { min-height: 44px; min-width: 44px; }
.is-mobile .recognition-tour-handle { min-height: 44px; padding: 0; }
.is-mobile .recognition-tour-close { position: absolute; top: 8px; right: 10px; min-height: 44px; min-width: 44px; padding: 0; font-size: 18px; }
@media (pointer: coarse) {
  .recognition-tour-card button { min-height: 44px; min-width: 44px; }
}
</style>
