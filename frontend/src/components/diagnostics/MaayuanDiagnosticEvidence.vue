<template>
  <div>
    <section class="diagnostic-section" aria-label="事件证据">
      <h3>证据</h3>
      <p v-if="loading" role="status">正在加载事件和证据…</p>
      <p v-else-if="error" class="diagnostic-error" role="alert">{{ error }} <button type="button" @click="load">重试</button></p>
      <template v-else-if="event">
        <p v-if="!event.images.length" class="diagnostic-muted">本次上报未保存图片。</p>
        <template v-else-if="noOperatorImages">
          <p class="diagnostic-muted">本次截图属于 {{ imageOwners }}，本组密探没有截图</p>
          <button type="button" :aria-expanded="showOtherImages" @click="showOtherImages = !showOtherImages">{{ showOtherImages ? '收起其他截图' : '仍然查看' }}</button>
        </template>
        <div v-if="visibleImages.length" class="diagnostic-evidence-grid">
          <figure v-for="image in visibleImages" :key="image.assetId">
            <figcaption>{{ imageLabel(image) }}</figcaption>
            <p v-if="image.expired" class="diagnostic-muted">图片已过期（保留 14 天）</p>
            <p v-else-if="image.status === 'pending'" class="diagnostic-muted">图片未上传完成</p>
            <p v-else-if="image.status === 'missing'" class="diagnostic-muted">图片未上传或已丢失</p>
            <p v-else-if="image.status === 'invalid'" class="diagnostic-error">图片校验失败</p>
            <p v-else-if="imageErrors[image.assetId]" class="diagnostic-error" role="status">{{ imageErrors[image.assetId] }}</p>
            <button v-else-if="urls[image.assetId]" type="button" class="diagnostic-image-button" :aria-label="`放大${imageLabel(image)}`" @click="zoom = { assetId: image.assetId, url: urls[image.assetId], label: imageLabel(image) }">
              <img :src="urls[image.assetId]" :alt="imageLabel(image)" referrerpolicy="no-referrer" @error="imageFailed(image.assetId, $event.target.getAttribute('src'))" />
            </button>
            <p v-else role="status">正在加载图片…</p>
          </figure>
        </div>
        <button v-if="Object.keys(imageErrors).length" type="button" @click="load">重新加载证据</button>
      </template>
    </section>
    <details v-if="event" class="diagnostic-section diagnostic-raw">
      <summary>原始数据</summary>
      <button type="button" @click="copyManifest">复制 manifest JSON</button><span v-if="copyMessage" role="status">{{ copyMessage }}</span>
      <pre tabindex="0">{{ manifestText }}</pre>
    </details>
    <Teleport to="body">
      <div v-if="zoom" class="diagnostic-mask diagnostic-zoom-mask">
        <section ref="zoomPanel" class="diagnostic-zoom" role="dialog" aria-modal="true" :aria-label="zoom.label" tabindex="-1">
          <header><h3>{{ zoom.label }}</h3><button ref="zoomClose" type="button" @click="zoom = null">关闭大图</button></header>
          <img :src="zoom.url" :alt="zoom.label" referrerpolicy="no-referrer" @error="imageFailed(zoom.assetId, $event.target.getAttribute('src'))" />
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getDiagnosticEvent, getDiagnosticMedia } from '@/api/maayuanDiagnostics.js'
import { diagnosticImageLabels } from '@/data/maayuanDiagnostics.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useBodyScrollLock } from '@/composables/useBodyScrollLock.js'

const props = defineProps({
  eventId: { type: String, required: true },
  issue: { type: Object, default: () => ({}) },
  operatorNames: { type: Object, default: () => ({}) }
})
const event = ref(null), loading = ref(false), error = ref(''), urls = ref({}), imageErrors = ref({}), copyMessage = ref('')
const showOtherImages = ref(false)
const operatorImages = computed(() => (event.value?.images || []).filter(image => image.operatorId === props.issue.subject))
const noOperatorImages = computed(() => props.issue.subjectKind === 'operator' && event.value?.images.length > 0 && !operatorImages.value.length)
const visibleImages = computed(() => props.issue.subjectKind !== 'operator' || (noOperatorImages.value && showOtherImages.value)
  ? event.value?.images || [] : operatorImages.value)
const imageOwners = computed(() => [...new Set((event.value?.images || []).map(image => image.operatorId
  ? `${props.operatorNames[image.operatorId] || image.operatorId}（其他密探）` : '未识别密探'))].join('、'))
const zoom = ref(null), zoomPanel = ref(null), zoomClose = ref(null)
const zoomOpen = computed(() => Boolean(zoom.value))
const manifestText = computed(() => JSON.stringify(event.value?.manifest, null, 2))
let generation = 0
let refreshedForExpiry = false
useBodyScrollLock(zoomOpen)
useModalFocus(zoomOpen, zoomPanel, { initialFocus: () => zoomClose.value, onEscape: () => { zoom.value = null } })
function revokeUrls() { Object.values(urls.value).filter(url => url.startsWith('blob:')).forEach(url => URL.revokeObjectURL(url)); urls.value = {} }
function imageLabel(image) { return `${diagnosticImageLabels[image.role] || '证据图片'} · ${props.operatorNames[image.operatorId] || image.operatorId || '未识别密探'}` }
async function load(options = {}) {
  const refresh = options?.refresh === true
  if (!refresh) refreshedForExpiry = false
  const zoomAssetId = refresh ? zoom.value?.assetId : null
  const token = ++generation, id = props.eventId
  if (!refresh) { zoom.value = null; showOtherImages.value = false }
  revokeUrls(); event.value = null; imageErrors.value = {}; copyMessage.value = ''
  loading.value = true; error.value = ''
  try {
    const result = await getDiagnosticEvent(id)
    if (token !== generation) return
    event.value = result
    loading.value = false
    await Promise.all(result.images.filter(image => !image.expired && image.status === 'ready').map(async image => {
      if (image.url) {
        urls.value = { ...urls.value, [image.assetId]: image.url }
        return
      }
      try {
        const { blob } = await getDiagnosticMedia(id, image.assetId)
        if (token === generation) urls.value = { ...urls.value, [image.assetId]: URL.createObjectURL(blob) }
      } catch (failure) {
        if (token === generation) imageErrors.value = { ...imageErrors.value, [image.assetId]: failure.status === 404 ? '图片已过期（保留 14 天）' : '图片加载失败，请重试加载事件' }
      }
    }))
    if (token === generation && zoomAssetId && zoom.value?.assetId === zoomAssetId) {
      zoom.value = urls.value[zoomAssetId] ? { ...zoom.value, url: urls.value[zoomAssetId] } : null
    }
  } catch (failure) {
    if (token === generation) {
      zoom.value = null
      error.value = failure.status === 404 ? '事件已过期或不存在（保留 90 天）' : failure.message || '证据加载失败'
    }
  } finally { if (token === generation) loading.value = false }
}
function imageFailed(assetId, failedUrl) {
  if (failedUrl !== urls.value[assetId]) return
  const image = event.value?.images.find(item => item.assetId === assetId)
  if (image?.url && !refreshedForExpiry) {
    refreshedForExpiry = true
    void load({ refresh: true })
    return
  }
  if (zoom.value?.assetId === assetId) zoom.value = null
  imageErrors.value = { ...imageErrors.value, [assetId]: '图片加载失败，请重试加载事件' }
}
async function copyManifest() {
  try { await navigator.clipboard.writeText(manifestText.value); copyMessage.value = '已复制' }
  catch (_) { copyMessage.value = '复制失败，请选中下方文本复制' }
}
watch(() => props.eventId, load, { immediate: true })
watch(() => [props.issue.subjectKind, props.issue.subject], () => { showOtherImages.value = false; zoom.value = null })
onBeforeUnmount(() => { generation++; revokeUrls() })
</script>
