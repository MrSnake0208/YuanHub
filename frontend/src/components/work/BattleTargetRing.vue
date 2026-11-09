<template>
  <div class="battle-target-ring" :class="{ 'is-disabled': disabled }" role="group" aria-label="动作目标" @pointerdown="startPointer" @pointermove="movePointer" @pointerup="endPointer" @pointercancel="cancelPointer" @click.capture="suppressClick" @keydown="onKeydown">
    <button v-for="index in present" :key="index" type="button" class="battle-target-ring-disc" :class="{ 'is-plain': index === plainIndex }" :style="discStyle(index)" :disabled="disabled" :aria-pressed="!disabled && index === active" :aria-label="names[index]" :title="names[index]" @click="emit('select', index)">
      <span>{{ battleTargetShortName(names[index]) }}</span>
    </button>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { TARGET_COLORS, battleTargetShortName } from '../../utils/battleImages.js'

const props = defineProps({ names: { type: Array, required: true }, present: { type: Array, required: true }, active: { type: Number, required: true }, plainIndex: { type: Number, required: true }, disabled: Boolean })
const emit = defineEmits(['select'])
const count = () => props.present.length
const rank = index => props.present.indexOf(index)
const rotation = ref(rank(props.active))
let frame = null, animationTarget = rotation.value
let pointerId = null, startX = 0, startRotation = 0, stepWidth = 1, dragging = false, justDragged = false
const mod = value => ((value % count()) + count()) % count()

function discStyle(index) {
  const angle = (rank(index) - rotation.value) * 2 * Math.PI / count()
  const depth = (1 + Math.cos(angle)) / 2
  return {
    '--ring-x': Math.sin(angle),
    '--ring-y': 1 - depth,
    '--ring-s': 0.7 + 0.3 * depth,
    opacity: 0.55 + 0.45 * depth,
    zIndex: Math.round(20 * depth),
    background: index === props.plainIndex ? 'var(--surface)' : TARGET_COLORS[index],
  }
}

function nearest(index) {
  const base = Math.round(rotation.value)
  let delta = mod(rank(index) - base)
  if (delta > count() / 2) delta -= count()
  return base + delta
}

function stopAnimation() {
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  animationTarget = null
}

function animateTo(value) {
  stopAnimation()
  animationTarget = value
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rotation.value = value
    return
  }
  const from = rotation.value, started = performance.now()
  function tick(now) {
    const progress = Math.min((now - started) / 260, 1)
    rotation.value = from + (value - from) * (1 - (1 - progress) ** 3)
    frame = progress < 1 ? requestAnimationFrame(tick) : null
  }
  frame = requestAnimationFrame(tick)
}

watch(() => props.present.join(), () => {
  stopAnimation()
  rotation.value = rank(props.active)
  animationTarget = rotation.value
})
watch(() => props.active, index => {
  if (dragging) return
  const destination = nearest(index)
  if (destination !== animationTarget) animateTo(destination)
})
onBeforeUnmount(stopAnimation)

function startPointer(event) {
  if (props.disabled || props.present.length < 2 || !event.isPrimary || event.button !== 0) return
  justDragged = false
  pointerId = event.pointerId
  startX = event.clientX
  startRotation = rotation.value
  stepWidth = event.currentTarget.clientWidth * 0.28
  stopAnimation()
}

function movePointer(event) {
  if (props.disabled || event.pointerId !== pointerId) return
  const dx = event.clientX - startX
  if (!dragging && Math.abs(dx) <= 6) return
  if (!dragging) {
    event.currentTarget.setPointerCapture(pointerId)
    dragging = true
  }
  rotation.value = startRotation - dx / stepWidth
}

function releasePointer(event) {
  if (event.currentTarget.hasPointerCapture(pointerId)) event.currentTarget.releasePointerCapture(pointerId)
  pointerId = null
  dragging = false
}

function endPointer(event) {
  if (event.pointerId !== pointerId) return
  const wasDragging = dragging
  releasePointer(event)
  if (!wasDragging || props.disabled) {
    animateTo(nearest(props.active))
    return
  }
  justDragged = true
  const final = Math.round(rotation.value)
  const index = props.present[mod(final)]
  animateTo(final)
  if (index !== props.active) emit('select', index)
}

function cancelPointer(event) {
  if (event.pointerId !== pointerId) return
  justDragged = dragging
  releasePointer(event)
  animateTo(nearest(props.active))
}

function suppressClick(event) {
  if (!justDragged) return
  event.stopPropagation()
  event.preventDefault()
  justDragged = false
}

function onKeydown(event) {
  if (props.disabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  const index = props.present[mod(rank(props.active) + (event.key === 'ArrowLeft' ? -1 : 1))]
  if (index !== props.active) emit('select', index)
}
</script>
