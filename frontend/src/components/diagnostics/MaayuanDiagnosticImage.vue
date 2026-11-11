<template>
  <span ref="frame" class="diagnostic-annotated-image" :class="{ 'diagnostic-annotated-image-expanded': expanded }">
    <img ref="picture" :src="src" :alt="alt" referrerpolicy="no-referrer" @load="measure" @error="failed" />
    <svg v-if="content && (nodeRoi || box)" class="diagnostic-image-overlay" :style="content" :viewBox="(imageRoi || [0, 0, ...resolution]).join(' ')" preserveAspectRatio="none" aria-hidden="true">
      <rect v-if="nodeRoi" :x="nodeRoi[0]" :y="nodeRoi[1]" :width="nodeRoi[2]" :height="nodeRoi[3]" class="diagnostic-node-roi" />
      <rect v-if="box" :x="box[0]" :y="box[1]" :width="box[2]" :height="box[3]" :class="hit ? 'diagnostic-box-hit' : 'diagnostic-box-miss'" />
    </svg>
  </span>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, required: true },
  resolution: { type: Array, default: () => [] },
  imageRoi: { type: Array, default: null },
  nodeRoi: { type: Array, default: null },
  box: { type: Array, default: null },
  hit: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false }
})
const emit = defineEmits(['error'])
const frame = ref(null), picture = ref(null), content = ref(null)
let observer
function measure() {
  const image = picture.value, container = frame.value
  if (!image?.naturalWidth || !image.naturalHeight || !container || !props.resolution[0] || !props.resolution[1]) {
    content.value = null
    return
  }
  const scale = Math.min(container.clientWidth / image.naturalWidth, container.clientHeight / image.naturalHeight)
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale
  content.value = {
    width: `${width}px`, height: `${height}px`,
    left: `${(container.clientWidth - width) / 2}px`, top: `${(container.clientHeight - height) / 2}px`
  }
}
function failed(event) { content.value = null; emit('error', event) }
watch(() => props.src, () => { content.value = null })
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(frame.value)
  measure()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.diagnostic-annotated-image { position: relative; display: block; width: 100%; height: 240px; }
.diagnostic-annotated-image-expanded { height: calc(100dvh - 160px); }
.diagnostic-annotated-image img { display: block; width: 100%; height: 100%; max-height: none; object-fit: contain; object-position: center; }
.diagnostic-image-overlay { position: absolute; pointer-events: none; }
.diagnostic-image-overlay rect { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
.diagnostic-node-roi { stroke: #ffca28; stroke-dasharray: 6 4; filter: drop-shadow(0 0 1px #000); }
.diagnostic-box-hit { stroke: #21c55d; }
.diagnostic-box-miss { stroke: #ff4545; }
</style>
