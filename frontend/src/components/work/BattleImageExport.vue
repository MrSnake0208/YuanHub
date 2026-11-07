<template>
  <section id="battle-preview" class="battle-export" aria-label="生成分享图片" :aria-busy="busy">
    <div class="battle-preview-heading">
      <div><h2>图片预览</h2><span>{{ kind === 'team' ? '上阵密探' : '战斗操作' }} · 随填写更新</span></div>
      <button class="battle-preview-zoom" type="button" :aria-pressed="zoom" @click="zoom = !zoom"><component :is="zoom ? Minimize2 : ZoomIn" :size="16" aria-hidden="true" />{{ zoom ? '适应宽度' : '放大查看' }}</button>
    </div>
    <div class="battle-preview-viewport" role="region" aria-label="图片实时预览，可滚动查看" tabindex="0">
      <div ref="measure" class="battle-preview-measure">
        <div class="battle-preview-paper" :style="{ width: 1080 * scale + 'px', height: previewHeight * scale + 'px' }">
          <div class="battle-preview-transform" :style="{ transform: `scale(${scale})` }"><BattleImageSheet ref="liveSheet" :model="liveModel" :kind="kind" :rows="previewRows" /></div>
        </div>
      </div>
    </div>
    <div v-if="kind === 'actions' && pageCount > 1" class="battle-preview-pages" aria-label="操作图预览分页">
      <button type="button" :disabled="previewPage === 0" @click="previewPage--"><ChevronLeft :size="16" aria-hidden="true" />上一段</button><span>{{ previewPage + 1 }} / {{ pageCount }}</span><button type="button" :disabled="previewPage >= pageCount - 1" @click="previewPage++">下一段<ChevronRight :size="16" aria-hidden="true" /></button>
    </div>
    <div class="battle-export-footer">
      <div class="battle-export-format"><Image :size="16" aria-hidden="true" /><span>PNG · 1440px <small>{{ kind === 'team' ? '五人配队图' : '全部回合自动分段' }}</small></span><a class="battle-layout-jump" href="#battle-editor">返回编辑</a></div>
      <div class="battle-export-actions">
        <button v-if="showGenerateButton" class="battle-primary" type="button" :disabled="busy" @click="generate"><Download :size="17" aria-hidden="true" />{{ busy ? '正在生成…' : kind === 'team' ? '生成配队图' : '生成操作图' }}</button>
        <button v-if="busy" type="button" @click="reset">取消生成</button>
      </div>
      <p v-if="busy" class="battle-hint" role="status">正在生成第 {{ images.length + 1 }} 张…</p>
      <p v-else class="battle-hint">生成后可下载原图，手机支持长按保存。</p>
    </div>
    <p v-if="error" role="alert" class="battle-error">{{ error }}</p>
    <div v-if="images.length" class="battle-image-results">
      <p role="status">已生成 {{ images.length }} 张。点击图片可查看原图，手机也可长按保存；修改内容后需重新生成。</p>
      <figure v-for="(image, index) in images" :key="image.url">
        <figcaption><span>{{ image.label }}</span><a :href="image.url" :download="image.filename">保存第 {{ index + 1 }} 张 PNG</a></figcaption>
        <a :href="image.url" target="_blank" rel="noopener" :aria-label="`查看第${index + 1}张原图（新窗口）`"><img :src="image.url" :alt="image.label" /></a>
      </figure>
    </div>
    <Teleport to="body"><div v-if="sheetData" class="battle-image-staging" aria-hidden="true" inert><BattleImageSheet ref="sheet" v-bind="sheetData" /></div></Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ChevronLeft, ChevronRight, Download, Image, Minimize2, ZoomIn } from '@lucide/vue'
import BattleImageSheet from './BattleImageSheet.vue'
import { battleFileName, battleImageError, buildBattleImageModel } from '../../utils/battleImages.js'
import { renderBattleImage } from '../../utils/battleImageCapture.js'
const props = defineProps({ draft: { type: Object, required: true }, kind: { type: String, required: true }, roundIndex: { type: Number, default: 0 }, catalog: { type: Array, default: () => [] }, showGenerateButton: { type: Boolean, default: true } })
const emit = defineEmits(['busy'])
const busy = ref(false), error = ref(''), images = shallowRef([]), sheetData = shallowRef(null), sheet = ref(null)
watch(busy, value => emit('busy', value), { flush: 'sync' })
const measure = ref(null), liveSheet = ref(null), previewWidth = ref(500), previewHeight = ref(700), zoom = ref(false), previewPage = ref(Math.floor(props.roundIndex / 5))
const liveModel = computed(() => buildBattleImageModel(props.draft, props.catalog))
const pageCount = computed(() => Math.max(1, Math.ceil(liveModel.value.rows.length / 5)))
const previewRows = computed(() => liveModel.value.rows.slice(previewPage.value * 5, previewPage.value * 5 + 5))
const scale = computed(() => zoom.value ? 1 : Math.min(1, previewWidth.value / 1080))
function measurePreview() {
  if (measure.value?.clientWidth) previewWidth.value = measure.value.clientWidth
  if (liveSheet.value?.sheet?.scrollHeight) previewHeight.value = liveSheet.value.sheet.scrollHeight
}
watch(() => props.roundIndex, index => { previewPage.value = Math.floor(index / 5) })
watch(pageCount, count => { previewPage.value = Math.min(previewPage.value, count - 1) })
let observer
onMounted(() => {
  observer = new ResizeObserver(measurePreview)
  observer.observe(measure.value)
  observer.observe(liveSheet.value.sheet)
  measurePreview()
})
onBeforeUnmount(() => observer?.disconnect())
let generation = 0
function reset() {
  generation++
  images.value.forEach(image => URL.revokeObjectURL(image.url))
  images.value = []; sheetData.value = null; busy.value = false; error.value = ''
}
watch([() => props.draft, () => props.kind], reset, { deep: true, flush: 'sync' })
onBeforeUnmount(reset)

async function generate() {
  if (busy.value) return
  reset()
  error.value = battleImageError(props.draft, props.kind)
  if (error.value) return
  const seq = generation, kind = props.kind
  const model = buildBattleImageModel(props.draft, props.catalog)
  const title = props.draft.title
  const queue = kind === 'team' ? [[]] : Array.from({ length: Math.ceil(model.rows.length / 5) }, (_, index) => model.rows.slice(index * 5, index * 5 + 5))
  busy.value = true
  try {
    while (queue.length && seq === generation) {
      const rows = queue.shift()
      sheetData.value = { model, kind, rows }
      await nextTick()
      if (seq !== generation) return
      let blob
      try { blob = await renderBattleImage(sheet.value.sheet) }
      catch (reason) {
        if (seq !== generation) return
        if (reason.code === 'IMAGE_TOO_TALL' && rows.length > 1) {
          const middle = Math.ceil(rows.length / 2)
          queue.unshift(rows.slice(0, middle), rows.slice(middle))
          continue
        }
        throw reason
      }
      if (seq !== generation) return
      const label = kind === 'team' ? '上阵密探' : `操作记录 · 第${rows[0].round}—${rows.at(-1).round}回合`
      images.value = [...images.value, { url: URL.createObjectURL(blob), label, filename: battleFileName(title, label, 'png') }]
    }
  } catch (reason) {
    if (seq === generation) error.value = (reason.message || '图片生成失败，请重试。') + (images.value.length ? ' 已生成的图片仍可保存。' : '')
  } finally {
    if (seq === generation) { busy.value = false; sheetData.value = null }
  }
}
defineExpose({ generate })
</script>

<style scoped>
.battle-image-staging { position: fixed; top: 0; left: -100000px; pointer-events: none; }
.battle-export { min-width: 0; scroll-margin-top: 90px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); overflow: hidden; }
.battle-preview-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; }
.battle-preview-heading h2 { font-size: 16px; margin: 0 0 4px; } .battle-preview-heading span { font-size: 12px; color: var(--ink-60); }
.battle-preview-viewport { padding: 20px; background: var(--cream); border-block: 1px solid var(--line); max-height: min(570px, calc(100dvh - 260px)); overflow: auto; overscroll-behavior: contain; }
.battle-preview-measure { width: 100%; min-width: 0; }
.battle-preview-paper { position: relative; box-shadow: 0 2px 8px rgba(73,59,44,.08); }
.battle-preview-transform { position: absolute; top: 0; left: 0; width: 1080px; transform-origin: top left; }
.battle-preview-pages { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 20px; font-size: 12px; border-bottom: 1px solid var(--line); }
.battle-export-footer { padding: 18px 20px 6px; }
.battle-export-format { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 14px; }
.battle-export-format small { margin-left: 8px; color: var(--ink-60); } .battle-export-format a { margin-left: auto; color: var(--ink-60); font-size: 12px; text-underline-offset: 4px; }
.battle-export-actions { display: flex; gap: 10px; } .battle-export-actions .battle-primary { flex: 1; min-height: 44px; }
.battle-error { padding: 0 20px 14px; }
.battle-image-results { padding: 0 20px 20px; border-top: 1px solid var(--line); }
.battle-image-results > p { margin-top: 16px; }
figcaption { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.battle-image-results figure { margin: 16px 0; } .battle-image-results p { font-size: 14px; line-height: 1.7; }
figcaption { margin-bottom: 10px; } figcaption a { color: var(--theme-accent-text, var(--tea)); text-underline-offset: 4px; }
.battle-image-results img { display: block; max-width: 100%; max-height: 480px; width: auto; height: auto; object-fit: contain; object-position: left top; }
@media (max-width: 767px) { .battle-preview-heading, .battle-export-footer { padding-inline: 14px; } .battle-preview-viewport { padding: 12px; max-height: 400px; } .battle-export-format small { display: block; margin-left: 0; } }
</style>
