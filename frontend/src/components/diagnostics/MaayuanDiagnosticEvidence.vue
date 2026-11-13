<template>
  <div class="diagnostic-evidence">
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
        <div v-if="visibleImages.length" class="diagnostic-evidence-grid" :class="{ 'diagnostic-evidence-with-primary': primaryImage }">
          <figure v-for="image in orderedImages" :key="image.assetId" :class="{ 'diagnostic-evidence-primary': image === primaryImage }" :style="image === primaryImage ? { gridRow: `span ${Math.max(1, orderedImages.length - 1)}` } : undefined">
            <figcaption>{{ imageLabel(image) }}</figcaption>
            <p v-if="image.expired" class="diagnostic-muted">图片已过期（保留 14 天）</p>
            <p v-else-if="image.status === 'pending'" class="diagnostic-muted">图片未上传完成</p>
            <p v-else-if="image.status === 'missing'" class="diagnostic-muted">图片未上传或已丢失</p>
            <p v-else-if="image.status === 'invalid'" class="diagnostic-error">图片校验失败</p>
            <p v-else-if="imageErrors[image.assetId]" class="diagnostic-error" role="status">{{ imageErrors[image.assetId] }}</p>
            <button v-else-if="urls[image.assetId]" type="button" class="diagnostic-image-button" :aria-label="`放大${imageLabel(image)}`" @click="zoom = { assetId: image.assetId, image, url: urls[image.assetId], label: imageLabel(image) }">
              <MaayuanDiagnosticImage :src="urls[image.assetId]" :alt="imageLabel(image)" :size="image === primaryImage ? 'primary' : 'crop'" v-bind="annotations(image)" @error="imageFailed(image.assetId, $event.target.getAttribute('src'))" />
            </button>
            <p v-else role="status">正在加载图片…</p>
            <p v-if="annotationLabel(image)" class="diagnostic-muted">{{ annotationLabel(image) }}</p>
          </figure>
        </div>
        <button v-if="Object.keys(imageErrors).length" type="button" @click="load">重新加载证据</button>
      </template>
    </section>
    <section v-if="bagCells.length" class="diagnostic-section diagnostic-bag-cells" aria-label="背包数量可疑明细">
      <h3>背包数量可疑</h3>
      <div class="diagnostic-bag-table-scroll" role="region" aria-label="背包数量读数表，可横向滚动" tabindex="0">
        <table>
          <thead><tr><th scope="col">物品 / 密探</th><th scope="col">各次读数</th><th scope="col" class="diagnostic-bag-number">采用数量（chosen）</th><th scope="col">原因</th></tr></thead>
          <tbody>
            <tr v-for="(cell, index) in bagCells" :key="`${cell.entity_type}:${cell.entity_id}:${index}`">
              <th scope="row">{{ bagCellName(cell) }}<small>{{ cell.entity_type === 'agent' ? '密探' : '物品' }} · {{ cell.entity_id }}</small></th>
              <td><ul class="diagnostic-bag-readings">
                <li v-for="(reading, readingIndex) in cell.readings" :key="readingIndex">
                  <button type="button" :disabled="!readingImageReady(reading)" :aria-label="`查看${bagCellName(cell)}的图片索引 ${reading.image_index} 数量框`" @click="zoomReading(reading)">第 {{ reading.image_index + 1 }} 页（图片索引 {{ reading.image_index }}）</button>
                  <span>count：{{ reading.count ?? '未识别' }} · raw：{{ reading.raw === '' ? '（空）' : reading.raw }} · score：{{ reading.score }} · source：{{ reading.source }}</span>
                  <small>count_box：[{{ reading.count_box.join(', ') }}]</small>
                </li>
              </ul></td>
              <td class="diagnostic-bag-number">{{ cell.chosen ?? '未采用' }}</td>
              <td>{{ cell.reasons.map(bagReasonLabel).join(' / ') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <MaayuanDiagnosticLog v-if="event?.log" :event-id="event.id" :log="event.log" />
    <MaayuanDiagnosticTrace v-if="event?.trace?.length" :trace="event.trace" :issues="event.summary?.issues || []" :issue="issue" :images="event.images" />
    <p v-else-if="event" class="diagnostic-muted diagnostic-trace-empty">本次上报未包含识别轨迹</p>
    <details v-if="event" class="diagnostic-section diagnostic-raw">
      <summary>原始数据</summary>
      <button type="button" @click="copyManifest">复制 manifest JSON</button><span v-if="copyMessage" role="status">{{ copyMessage }}</span>
      <pre tabindex="0">{{ manifestText }}</pre>
    </details>
    <Teleport to="body">
      <div v-if="zoom" class="diagnostic-mask diagnostic-zoom-mask">
        <section ref="zoomPanel" class="diagnostic-zoom" role="dialog" aria-modal="true" :aria-label="zoom.label" tabindex="-1">
          <header><h3>{{ zoom.label }}</h3><button ref="zoomClose" type="button" @click="zoom = null">关闭大图</button></header>
          <MaayuanDiagnosticImage :src="zoom.url" :alt="zoom.label" v-bind="annotations(zoom.image, zoom.countBox)" expanded @error="imageFailed(zoom.assetId, $event.target.getAttribute('src'))" />
          <p v-if="annotationLabel(zoom.image, zoom.countBox)" class="diagnostic-muted">{{ annotationLabel(zoom.image, zoom.countBox) }}</p>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getDiagnosticEvent, getDiagnosticMedia } from '@/api/maayuanDiagnostics.js'
import { diagnosticImageLabels, diagnosticReason } from '@/data/maayuanDiagnostics.js'
import { ITEM_CATALOG, AGENT_CATALOG } from '@/data/inventory/catalog.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useBodyScrollLock } from '@/composables/useBodyScrollLock.js'
import MaayuanDiagnosticImage from './MaayuanDiagnosticImage.vue'
import MaayuanDiagnosticTrace from './MaayuanDiagnosticTrace.vue'
import MaayuanDiagnosticLog from './MaayuanDiagnosticLog.vue'

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
const primaryImage = computed(() => visibleImages.value.find(image => image.role === 'last_frame'))
const orderedImages = computed(() => primaryImage.value ? [primaryImage.value, ...visibleImages.value.filter(image => image !== primaryImage.value)] : visibleImages.value)
const imageOwners = computed(() => [...new Set((event.value?.images || []).map(image => image.operatorId
  ? `${props.operatorNames[image.operatorId] || image.operatorId}（其他密探）` : '未识别密探'))].join('、'))
const zoom = ref(null), zoomPanel = ref(null), zoomClose = ref(null)
const zoomOpen = computed(() => Boolean(zoom.value))
const manifestText = computed(() => JSON.stringify(event.value?.manifest, null, 2))
const resolution = computed(() => event.value?.manifest?.client?.resolution?.split('x').map(Number) || [])
const bagCells = computed(() => event.value?.bagCells || event.value?.manifest?.bag_cells || [])
let generation = 0
let refreshedForExpiry = false
useBodyScrollLock(zoomOpen)
useModalFocus(zoomOpen, zoomPanel, { initialFocus: () => zoomClose.value, onEscape: () => { zoom.value = null } })
function revokeUrls() { Object.values(urls.value).filter(url => url.startsWith('blob:')).forEach(url => URL.revokeObjectURL(url)); urls.value = {} }
function imageLabel(image) {
  if (image.role === 'bag_page') return `${diagnosticImageLabels.bag_page} · 第 ${event.value.images.indexOf(image) + 1} 页`
  return `${diagnosticImageLabels[image.role] || '证据图片'} · ${props.operatorNames[image.operatorId] || image.operatorId || '未识别密探'}`
}
function bagCellName(cell) {
  const catalog = cell.entity_type === 'agent' ? AGENT_CATALOG : ITEM_CATALOG
  return catalog.find(entity => entity.id === cell.entity_id)?.name || cell.entity_id
}
function bagReasonLabel(reason) {
  return reason === 'edge_zone' ? '底部边缘' : diagnosticReason(reason).label
}
function readingImageReady(reading) {
  const image = event.value?.images[reading.image_index]
  return image && !image.expired && image.status === 'ready' && urls.value[image.assetId] && !imageErrors.value[image.assetId]
}
function zoomReading(reading) {
  if (!readingImageReady(reading)) return
  const image = event.value.images[reading.image_index]
  zoom.value = { assetId: image.assetId, image, url: urls.value[image.assetId], label: imageLabel(image), countBox: reading.count_box }
}
function annotations(image, countBox) {
  if (image.role !== 'last_frame' && !countBox) return {}
  const step = event.value?.trace?.[image.traceIndex]
  const index = event.value?.images.findIndex(item => item.assetId === image.assetId)
  const imageRoi = event.value?.manifest?.images?.[index]?.roi
  return { resolution: resolution.value, imageRoi, nodeRoi: image.nodeRoi, box: countBox || step?.box, hit: countBox ? false : step?.hit }
}
function annotationLabel(image, countBox) {
  if (countBox) return `数量框：红色 · count_box：[${countBox.join(', ')}]`
  if (image.role !== 'last_frame') return ''
  const step = event.value?.trace?.[image.traceIndex]
  return [step ? `节点 ${step.node}` : '', image.nodeRoi ? '节点 ROI：黄色虚线' : '',
    step?.box ? `识别框：${step.hit ? '绿色（命中）' : '红色（未命中）'}` : ''].filter(Boolean).join(' · ')
}
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

<style scoped>
.diagnostic-bag-cells { min-width: 0; }
.diagnostic-bag-table-scroll { max-width: 100%; overflow-x: auto; }
.diagnostic-bag-cells table { width: 100%; min-width: 640px; border-collapse: collapse; }
.diagnostic-bag-cells th, .diagnostic-bag-cells td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.diagnostic-bag-cells .diagnostic-bag-number { text-align: right; font-variant-numeric: tabular-nums; }
.diagnostic-bag-cells small, .diagnostic-bag-readings span { display: block; }
.diagnostic-bag-readings { margin: 0; padding: 0; list-style: none; }
.diagnostic-bag-readings li + li { margin-top: 12px; }
</style>
