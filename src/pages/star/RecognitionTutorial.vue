<template>
  <Teleport to="body">
    <div v-if="open" v-show="!suspended" class="recognition-tour" :class="{ 'is-mobile': mobile }">
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
          <p v-if="mode === 'plan' && planSwitchHint" class="recognition-tour-hint">当前编辑或视图状态需要保留，可以自行切换视图后继续查看。</p>
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
import { modalFocusState } from '../../composables/useModalFocus.js'
import { recognitionTutorialSteps, recognitionTutorialExamples, tutorialStepIndex, resolveTutorialTargets, clipTutorialRect, tutorialCardPosition, clampTutorialLift, shouldRevealTutorialTarget, tutorialSheetBounds, tutorialElementRect, tutorialOcrRunning } from './recognitionTutorial.js'
import { bagTutorialSteps, bagReviewInfo } from './bagTutorial.js'
import { growthPlanStepsForView, readGrowthPlanView, createGrowthTutorialViewGuard } from './growthPlanTutorial.js'

const props = defineProps({ open: Boolean, replayId: { type: Number, default: 0 }, root: { type: Object, default: null }, mode: { type: String, default: 'recognition' }, planSwitchBlocked: Boolean })
const emit = defineEmits(['close', 'step-change'])
const stepIndex = ref(0), mobile = ref(false), lift = ref(0), card = ref(null)
const rects = ref([]), position = ref({ left: 12, top: 12 }), placement = ref('fallback'), ready = ref(false)
const sheetBounds = ref(null)
const exampleKind = ref(null), showMobileHint = ref(false)
const blocked = ref(false)
const suspended = computed(() => blocked.value || modalFocusState.active)
const planFirstView = ref(null), planActualView = ref(null), planSwitchHint = ref(false)
const steps = computed(() => props.mode === 'plan' ? growthPlanStepsForView(planFirstView.value) : props.mode === 'bag' ? bagTutorialSteps : recognitionTutorialSteps)
const tutorialLabel = computed(() => props.mode === 'plan' ? '养成教程' : props.mode === 'bag' ? '使用教程' : '识别教程')
const step = computed(() => {
  const current = steps.value[stepIndex.value]
  return props.mode === 'plan' && current.editorView && current.editorView !== planActualView.value ? { ...current, target: '', relatedTargets: '' } : current
})
const exampleItems = computed(() => recognitionTutorialExamples[exampleKind.value] || [])
const cardStyle = computed(() => ({ visibility: ready.value ? 'visible' : 'hidden', ...(mobile.value ? { bottom: `${(sheetBounds.value?.bottom ?? 12) + lift.value}px`, ...(sheetBounds.value ? { maxHeight: `min(62dvh, calc(100dvh - 96px), ${sheetBounds.value.maxHeight}px)` } : {}) } : { left: `${position.value.left}px`, top: `${position.value.top}px` }) }))
const rectStyle = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
let opener = null
let planViewGuard = null
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
  if (props.mode === 'plan') planActualView.value = readGrowthPlanView(props.root)
  blocked.value = Boolean(props.root?.querySelector('[role="dialog"], dialog[open]')) || tutorialOcrRunning(props.root)
  if (suspended.value) { clearHighlights(); rects.value = []; return }
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
  if (!suspended.value && shouldRevealTutorialTarget(step.value, rect, view)) {
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
    if (!props.open || exampleKind.value || suspended.value) return
    const view = viewport(), { primary } = resolveTutorialTargets(props.root, step.value, view.height)
    const rect = primary?.getBoundingClientRect(), sheetTop = mobile.value ? card.value?.getBoundingClientRect().top : view.top + view.height
    if (rect && step.value.scroll !== 'preserve' && (rect.top < view.top + 64 || rect.top >= sheetTop - 16)) void revealStep(false)
  }, 160)
}
async function navigate(delta) {
  const from = stepIndex.value, to = tutorialStepIndex(from, delta, steps.value.length)
  const root = props.root, replay = props.replayId, visit = navigation
  const currentPlanNavigation = () => props.open && props.mode === 'plan' && props.root === root && props.replayId === replay && stepIndex.value === from && navigation === visit
  if (props.mode === 'plan') {
    planSwitchHint.value = false
    if (to === 2 && planFirstView.value === null) planFirstView.value = readGrowthPlanView(props.root) || 'detail'
    // Reading steps 1/2 never owns the view. Only entering an already fixed
    // editing topic may request its matching view; later steps leave it alone.
    if ((to === 2 && (from === 3 || planFirstView.value !== readGrowthPlanView(props.root))) || (from === 2 && to === 3)) {
      await nextTick()
      if (!currentPlanNavigation()) return
      const targetView = growthPlanStepsForView(planFirstView.value)[to].editorView
      const outcome = planViewGuard?.switchTo(targetView, props.planSwitchBlocked)
      planSwitchHint.value = outcome === 'blocked'
      await nextTick()
      if (!currentPlanNavigation()) return
    }
    planActualView.value = readGrowthPlanView(props.root)
  }
  stepIndex.value = to
  lift.value = 0
  exampleKind.value = null
  void revealStep()
}
function close() { exampleKind.value = null; emit('close') }
function onKeydown(event) {
  // Product dialogs and the example viewer own Escape while they are open.
  if (event.key === 'Escape' && !suspended.value && !exampleKind.value && !document.querySelector('[role="dialog"], dialog[open]')) close()
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
  planFirstView.value = null; planSwitchHint.value = false
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
  if (props.root) mutationObserver.observe(props.root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open', 'role', 'disabled'] })
  const opening = revealStep(), token = navigation
  void opening.then(() => { if (props.open && token === navigation && !exampleKind.value && !suspended.value) card.value?.focus({ preventScroll: true }) })
}, { immediate: true })
watch(() => props.root, root => {
  planViewGuard?.dispose()
  planViewGuard = root ? createGrowthTutorialViewGuard(root) : null
  if (!props.open) return
  mutationObserver?.disconnect()
  if (props.root) mutationObserver?.observe(props.root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open', 'role', 'disabled'] })
  scheduleUpdate()
}, { immediate: true })
onBeforeUnmount(() => { planViewGuard?.dispose(); restoreFocus(); stop() })
watch(() => modalFocusState.active, () => { void nextTick(scheduleUpdate) })
</script>

<style>
.recognition-tutorial-related { outline: 2px solid var(--accent) !important; outline-offset: 4px; }
</style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.recognition-tour { pointer-events: none; }
.recognition-tour-shade { pointer-events: none; }
.recognition-tour-ring { border: 2px solid var(--accent); border-radius: 12px; pointer-events: none; }
.recognition-tour-card { border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: 0 12px 36px rgb(73 59 44 / 22%); pointer-events: auto; }
button { border: 1px solid var(--line); border-radius: 12px; background: var(--cream); color: var(--ink); cursor: pointer; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
button:disabled { opacity: .45; cursor: default; }
.recognition-tour-example { border: 0; text-decoration: underline; background: transparent; }
.recognition-tour-next { background: var(--tea); color: var(--cream); }
.recognition-tour-handle { border: 0; background: transparent; user-select: none; cursor: ns-resize; }
.recognition-tour-handle span { border-radius: 4px; background: var(--tea); opacity: .55; }
</style>
<style scoped src="./recognitionTutorialDesktop.css"></style>
<style scoped src="./recognitionTutorialMobile.css"></style>
