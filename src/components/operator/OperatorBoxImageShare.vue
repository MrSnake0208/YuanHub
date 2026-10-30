<template>
  <section class="box-image-share" aria-labelledby="box-image-heading" :aria-busy="busy">
    <h3 id="box-image-heading">生成 BOX 图片</h3>
    <p class="box-image-help">三列排版，每张最多九位，保留立绘、化极、等级修为、攻血奇闻和双命盘。不含账号名、备注或链接，无需开启公开分享。</p>
    <label class="box-image-scope">导出范围
      <select v-model="scope" :disabled="busy">
        <option value="filtered">当前筛选（{{ filteredIds.length }} 位）</option>
        <option value="all">全部已拥有（{{ entries.length }} 位）</option>
      </select>
    </label>
    <p v-if="!ready" class="box-image-help" role="status">{{ sourceError || '密探档案准备中，请稍后重试。' }}</p>
    <p v-else-if="!selected.length" class="box-image-help">当前范围没有密探，请调整筛选或选择全部已拥有。</p>
    <p class="box-image-help" role="status">
      完整长图预计可容纳约 51 位密探，词条换行较多时会更少，实际以图片尺寸为准。
      <strong v-if="selected.length > 51">当前选择 {{ selected.length }} 位，生成长图可能超出限制，建议直接生成分段图片。</strong>
      <span v-else>人数较多时建议使用分段图片，避免等待后因图片过长而失败。</span>
    </p>
    <div class="box-image-actions">
      <button type="button" class="btn primary" :disabled="busy || !ready || !selected.length" @click="generate(false)">生成分段图片（{{ Math.ceil(selected.length / BOX_IMAGE_PAGE_SIZE) }} 张）</button>
      <button type="button" class="btn ghost" :disabled="busy || !ready || !selected.length" @click="generate(true)">生成完整长图</button>
    </div>
    <p v-if="busy || notice" class="box-image-feedback" role="status" aria-live="polite">{{ busy ? progress : notice }}</p>
    <p v-if="error" class="box-image-feedback is-error" role="alert">{{ error }}</p>
    <template v-if="images.length">
      <nav class="box-image-pages" aria-label="生成的 BOX 图片">
        <button v-for="(image, index) in images" :key="image.url" type="button" :aria-pressed="previewIndex === index" @click="previewIndex = index">第 {{ index + 1 }} 张</button>
      </nav>
      <div class="box-image-save"><span>{{ images[previewIndex].count }} 位密探 · PNG</span><a class="btn primary" :href="images[previewIndex].url" :download="images[previewIndex].filename">保存第 {{ previewIndex + 1 }} 张</a></div>
      <img class="box-image-preview" :src="images[previewIndex].url" :alt="'BOX 图片预览，第 ' + (previewIndex + 1) + ' 张'" />
      <p class="box-image-help">逐张保存；手机端也可长按预览图保存。</p>
    </template>
    <Teleport to="body">
      <div v-if="sheetData" class="box-image-staging" aria-hidden="true" inert>
        <OperatorBoxImageSheet ref="sheet" v-bind="sheetData" />
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { auth } from '../../store/auth.js'
import OperatorBoxImageSheet from './OperatorBoxImageSheet.vue'
import { BOX_IMAGE_PAGE_SIZE, operatorBoxImagePages, renderOperatorBoxImage } from '../../utils/operatorBoxImage.js'

const props = defineProps({
  accountId: { type: String, required: true }, game: { type: String, default: '' }, open: Boolean,
  entries: { type: Array, default: () => [] }, filteredIds: { type: Array, default: () => [] },
  ready: Boolean, sourceError: { type: String, default: '' },
})
const scope = ref('filtered'), busy = ref(false), progress = ref(''), notice = ref(''), error = ref('')
const images = shallowRef([]), previewIndex = ref(0), sheetData = shallowRef(null), sheet = ref(null)
let operation = 0
const selected = computed(() => {
  if (scope.value === 'all') return props.entries
  const byId = new Map(props.entries.map(entry => [entry.id, entry]))
  return props.filteredIds.map(id => byId.get(id)).filter(Boolean)
})
function clearImages() {
  images.value.forEach(image => URL.revokeObjectURL(image.url))
  images.value = []
  previewIndex.value = 0
}
function reset() {
  operation++
  clearImages()
  busy.value = false
  sheetData.value = null
  error.value = notice.value = ''
}
watch([() => props.accountId, () => props.game, () => props.open, () => auth.userInfo?.id, () => auth.isLoggedIn], reset, { flush: 'sync' })
watch(scope, reset)
onBeforeUnmount(reset)

async function generate(full) {
  if (busy.value || !props.open || !props.ready || !selected.value.length) return
  reset()
  const seq = operation
  const game = props.game
  const snapshot = JSON.parse(JSON.stringify(selected.value))
  const pages = operatorBoxImagePages(snapshot, full)
  const date = new Date().toLocaleString('zh-CN', { hour12: false })
  busy.value = true
  try {
    for (const [index, page] of pages.entries()) {
      if (seq !== operation) return
      progress.value = `正在生成第 ${index + 1} / ${pages.length} 张图片…`
      sheetData.value = { ...page, game, total: snapshot.length, page: index + 1, pages: pages.length, generatedAt: date }
      await nextTick()
      if (seq !== operation) return
      const blob = await renderOperatorBoxImage(sheet.value.sheet)
      if (seq !== operation) return
      images.value = [...images.value, {
        url: URL.createObjectURL(blob), count: page.entries.length,
        filename: `YuanHub-BOX-${game}-${full ? '完整长图' : `${index + 1}-${pages.length}`}.png`,
      }]
    }
    notice.value = `已生成 ${images.value.length} 张图片，可预览并逐张保存。`
  } catch (err) {
    if (seq !== operation) return
    error.value = (err?.message || '图片生成失败，请重试。') + (images.value.length ? ` 已生成的 ${images.value.length} 张仍可保存。` : '')
  } finally {
    if (seq === operation) { busy.value = false; sheetData.value = null }
  }
}
</script>

<style scoped>
.box-image-share { padding: 18px 24px; }
.box-image-share h3 { margin: 0; font: 800 16px/1.4 var(--font-s); }
.box-image-help { margin: 8px 0 12px; color: var(--ink-60); font-size: 13px; line-height: 1.7; }
.box-image-scope { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; }
.box-image-scope select { min-width: 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; }
.box-image-actions,.box-image-pages,.box-image-save { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
.box-image-actions .btn,.box-image-save .btn { font-size: 13px; }
.box-image-feedback { font-size: 13px; line-height: 1.6; color: var(--ink-60); }
.box-image-feedback.is-error { color: var(--theme-danger-text, var(--rouge)); }
.box-image-pages button { padding: 7px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); cursor: pointer; }
.box-image-pages button[aria-pressed="true"] { border-color: var(--tea); background: var(--tea); color: var(--on-strong); }
.box-image-save { justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
.box-image-preview { display: block; width: 100%; height: auto; border-radius: 8px; }
.box-image-staging { position: fixed; top: 0; left: -100000px; pointer-events: none; }
@media (max-width: 640px) { .box-image-share { padding: 16px; } }
</style>
