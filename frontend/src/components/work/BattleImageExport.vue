<template>
  <section id="battle-preview" class="battle-export" aria-label="生成的图片" :aria-busy="busy">
    <!-- 不做实时预览：弹窗直接展示生成好的 PNG，所见即保存的文件；保存操作固定在底栏。 -->
    <div class="battle-export-scroll">
      <div v-if="!images.length" class="battle-export-empty">
        <LoaderCircle v-if="busy" class="battle-export-spin" :size="28" aria-hidden="true" />
        <ImageOff v-else :size="28" aria-hidden="true" />
        <p>{{ busy ? '正在生成图片…' : error ? '图片未生成' : '已取消生成' }}</p>
      </div>
      <figure v-for="(image, index) in images" :key="image.url" class="battle-image-result">
        <figcaption v-if="images.length > 1 || busy"><span>{{ image.label }}</span><a :href="image.url" :download="image.filename">保存第 {{ index + 1 }} 张</a></figcaption>
        <a :href="image.url" target="_blank" rel="noopener" :aria-label="`查看${image.label}原图（新窗口）`"><img :src="image.url" :alt="image.label" :style="{ '--image-ratio': image.ratio }" /></a>
      </figure>
    </div>
    <footer class="battle-export-footer">
      <p v-if="error" role="alert" class="battle-error">{{ error }}</p>
      <p v-else-if="busy" class="battle-hint" role="status">正在生成第 {{ images.length + 1 }} 张…</p>
      <p v-else-if="images.length" class="battle-hint" role="status">PNG · 1440px，共 {{ images.length }} 张。点击图片查看原图，手机也可长按保存。</p>
      <p v-else class="battle-hint">点击生成图片后在此保存。</p>
      <div v-if="kind === 'actions'" class="battle-export-variant" role="group" aria-label="操作图样式">
        <button v-for="option in VARIANTS" :key="option.value" type="button" :aria-pressed="variant === option.value" :title="option.hint" @click="variant = option.value">{{ option.label }}</button>
      </div>
      <div v-if="kind === 'actions' && hasRemarks" class="battle-export-variant" role="group" aria-label="备注位置">
        <button v-for="option in REMARK_POSITIONS" :key="option.value" type="button" :aria-pressed="remarkPosition === option.value" :title="option.hint" @click="remarkPosition = option.value">{{ option.label }}</button>
      </div>
      <div class="battle-export-actions">
        <button v-if="busy" type="button" @click="reset">取消生成</button>
        <a v-if="images.length === 1 && !busy" class="battle-primary battle-export-save" :href="images[0].url" :download="images[0].filename"><Download :size="17" aria-hidden="true" />保存图片</a>
        <button v-else-if="images.length > 1 && !busy" class="battle-primary battle-export-save" type="button" @click="saveAll"><Download :size="17" aria-hidden="true" />保存全部 {{ images.length }} 张</button>
        <button v-else class="battle-primary battle-export-save" type="button" :disabled="busy" @click="generate"><Download :size="17" aria-hidden="true" />{{ busy ? '正在生成…' : error ? '重新生成' : '生成图片' }}</button>
      </div>
    </footer>
    <Teleport to="body"><div v-if="sheetData" class="battle-image-staging" aria-hidden="true" inert><BattleImageSheet ref="sheet" v-bind="sheetData" /></div></Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Download, ImageOff, LoaderCircle } from '@lucide/vue'
import BattleImageSheet from './BattleImageSheet.vue'
import { battleFileName, battleImageError, buildBattleImageModel } from '../../utils/battleImages.js'
import { renderBattleImage } from '../../utils/battleImageCapture.js'
const props = defineProps({ draft: { type: Object, required: true }, kind: { type: String, required: true }, catalog: { type: Array, default: () => [] } })
const emit = defineEmits(['busy'])
// 完整款：卡头与配队图一致；简化款：卡头只写名字，图更矮。切换后已生成的图片按新样式重新生成。
const VARIANTS = [{ value: 'full', label: '完整款', hint: '卡头与配队图一致：立绘与名字' }, { value: 'simple', label: '简化款', hint: '卡头只显示密探名字' }]
const variant = ref('full')
const REMARK_POSITIONS = [{ value: 'below', label: '备注在下', hint: '每回合下方整行显示备注' }, { value: 'right', label: '备注在右', hint: '表格右侧单独一列显示备注' }]
const remarkPosition = ref('below')
const hasRemarks = computed(() => props.draft.rounds.some(round => String(round.remark || '').trim()))
const busy = ref(false), error = ref(''), images = shallowRef([]), sheetData = shallowRef(null), sheet = ref(null)
watch(busy, value => emit('busy', value), { flush: 'sync' })
let generation = 0
function reset() {
  generation++
  images.value.forEach(image => URL.revokeObjectURL(image.url))
  images.value = []; sheetData.value = null; busy.value = false; error.value = ''
}
watch([() => props.draft, () => props.kind], reset, { deep: true, flush: 'sync' })
watch([variant, remarkPosition], () => { if (busy.value || images.value.length || error.value) { reset(); generate() } })
onBeforeUnmount(reset)

async function generate() {
  if (busy.value) return
  reset()
  error.value = battleImageError(props.draft, props.kind)
  if (error.value) return
  const seq = generation, kind = props.kind
  const model = buildBattleImageModel(props.draft, props.catalog)
  const title = props.draft.title
  // 末尾没有动作也没有备注的回合不出图；中间的空回合保留，回合编号不断开。
  const lastUsed = model.rows.findLastIndex(row => row.slots.some(entries => entries.length) || String(row.remark || '').trim())
  const rounds = model.rows.slice(0, lastUsed + 1)
  // 操作图默认一张出完全部回合；只有超出单张像素上限时才对半拆分。
  const queue = kind === 'team' ? [[]] : [rounds]
  busy.value = true
  try {
    while (queue.length && seq === generation) {
      const rows = queue.shift()
      sheetData.value = { model, kind, rows, variant: variant.value, remarkPosition: remarkPosition.value, partial: rows.length !== rounds.length }
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
      const ratio = sheet.value.sheet.offsetWidth / sheet.value.sheet.offsetHeight
      const label = kind === 'team' ? '上阵密探' : `操作记录 · 第${rows[0].round}—${rows.at(-1).round}回合`
      images.value = [...images.value, { url: URL.createObjectURL(blob), label, filename: battleFileName(title, label, 'png'), ratio }]
    }
  } catch (reason) {
    if (seq === generation) error.value = (reason.message || '图片生成失败，请重试。') + (images.value.length ? ' 已生成的图片仍可保存。' : '')
  } finally {
    if (seq === generation) { busy.value = false; sheetData.value = null }
  }
}
// 多张操作图依次触发下载；间隔避免浏览器合并或丢弃连续下载。
async function saveAll() {
  for (const [index, image] of images.value.entries()) {
    if (index) await new Promise(resolve => setTimeout(resolve, 300))
    const link = document.createElement('a')
    link.href = image.url; link.download = image.filename
    document.body.append(link); link.click(); link.remove()
  }
}
defineExpose({ generate })
</script>

<style scoped>
.battle-image-staging { position: fixed; top: 0; left: -100000px; pointer-events: none; }
.battle-export { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.battle-export-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 20px; background: var(--cream); container-type: size; }
.battle-export-empty { display: grid; place-items: center; align-content: center; gap: 10px; min-height: 100%; color: var(--ink-60); font-size: 14px; }
.battle-export-empty p { margin: 0; }
.battle-export-spin { animation: battle-export-spin 1s linear infinite; }
@keyframes battle-export-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .battle-export-spin { animation: none; } }
.battle-image-result { margin: 0 auto 16px; max-width: 1080px; }
.battle-image-result:last-child { margin-bottom: 0; }
.battle-image-result figcaption { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 12px; color: var(--ink-60); }
.battle-image-result figcaption a { color: var(--theme-accent-text, var(--tea)); text-underline-offset: 4px; }
/* 预览按可视高度完整显示，不低于最小宽度，长图可滚动；只影响预览，不影响导出文件。 */
.battle-image-result img { display: block; width: min(100%, max(520px, calc(100cqh * var(--image-ratio)))); max-width: 100%; height: auto; margin-inline: auto; box-shadow: 0 2px 8px rgba(73,59,44,.08); }
.battle-export-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--surface); }
.battle-export-footer > p { flex: 1; min-width: 0; margin: 0; }
.battle-export-actions { display: flex; flex-shrink: 0; gap: 10px; }
.battle-export-variant { display: inline-flex; flex-shrink: 0; border: 1px solid var(--battle-border); border-radius: 6px; overflow: hidden; }
.battle-tool .battle-export-variant > button { border: 0; border-radius: 0; padding: 8px 12px; }
.battle-tool .battle-export-variant > button + button { border-left: 1px solid var(--battle-border); }
.battle-tool .battle-export-variant > button[aria-pressed=true] { background: var(--battle-selection); color: var(--battle-accent); font-weight: 600; }
.battle-export-save { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 132px; min-height: 40px; padding: 9px 16px; border-radius: 6px; font-size: 14px; text-decoration: none; }
@media (max-width: 767px) {
  .battle-export-scroll { padding: 12px; }
  .battle-export-footer { flex-wrap: wrap; padding: 10px 16px max(10px, env(safe-area-inset-bottom)); }
  .battle-export-footer > p { flex-basis: 100%; }
  .battle-export-actions { flex: 1; }
  .battle-export-save { flex: 1; min-height: 44px; }
}
</style>
