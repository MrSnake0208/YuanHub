<template>
  <section ref="panel" class="scan-review-form" aria-labelledby="scan-review-title" tabindex="-1" @keydown.esc.stop.prevent="!busy && $emit('close')">
    <header>
      <OperatorAvatar :avatar="catalog.avatar" :name="catalog.name || '未知密探'" :rarity="Number(catalog.rarity) || 3" />
      <div><h2 id="scan-review-title">复核 {{ catalog.name || '未知密探' }}</h2><p>{{ accountName }} · {{ review.status === 'rejected' ? '本条采集被拒绝，尚未写入' : '部分内容可能已保存，以下内容仍需核对' }}</p></div>
      <button type="button" class="close" :disabled="busy" aria-label="关闭扫描复核" @click="$emit('close')"><X :size="20" aria-hidden="true" /></button>
    </header>
    <p>对照游戏核对采集值，勾选「本次保存此项」后点「校验并预览」。与现值一致也可确认复核，无需故意改成其他数值。</p>
    <ul v-if="issues.length" class="reasons" aria-label="待核原因">
      <li v-for="(issue, index) in issues" :key="index">
        {{ operatorReviewIssueText(issue) }}
        <a v-if="fieldExists(issue)" :href="'#scan-review-field-' + operatorReviewField(issue)" @click.prevent="focusField(operatorReviewField(issue))">修改{{ rows.find(row => row.id === operatorReviewField(issue)).label }}</a>
      </li>
    </ul>
    <label v-if="identityRequired" class="check"><input v-model="identityConfirmed" type="checkbox" :disabled="busy" />我已在游戏中核对，这条记录确实属于 {{ catalog.name || '当前密探' }}</label>
    <p v-if="currentError" role="alert">{{ currentError }}</p>
    <div class="readback"><span>{{ currentLoading ? '正在读取已保存的现值…' : '现值来自当前账号档案；未知项保持未知。' }}</span><button type="button" :disabled="busy || currentLoading" @click="$emit('readback')">重新读回现值</button></div>
    <form novalidate @submit.prevent="preview">
      <div v-if="submitted && errors.length" ref="errorSummary" class="errors" role="alert" tabindex="-1">
        <strong>请先修正以下内容</strong><ul><li v-for="row in errors" :key="row.id"><a :href="'#scan-review-field-' + row.id" @click.prevent="focusField(row.id)">{{ row.label }}：{{ errorFor(row) }}</a></li></ul>
      </div>
      <fieldset v-for="row in rows" :id="'scan-review-field-' + row.id" :key="row.id" :disabled="busy || !row.pending" :aria-invalid="!!errorFor(row)" :aria-describedby="'scan-review-value-' + row.id + (errorFor(row) ? ' scan-review-error-' + row.id : '')" tabindex="-1">
        <legend>{{ row.label }} <small>{{ row.pending ? '待核对' : '本项不参与这次保存' }}</small></legend>
        <p :id="'scan-review-value-' + row.id" class="values">现值：{{ valueLabel(operatorReviewCurrentValue(row, current, catalog), row.id) }}<br />采集值：{{ valueLabel(row.collected, row.id) }}</p>
        <template v-if="row.pending && row.supported">
          <label class="check"><input v-model="row.included" type="checkbox" :aria-label="'确认本次保存' + row.label" />本次保存此项</label>
          <label v-if="row.kind === 'number'" class="number-field">修正后的{{ row.label }}
            <input v-model.number="row.value" type="number" :inputmode="row.key === 'special' ? 'decimal' : 'numeric'" min="0" :max="row.max" :step="row.key === 'special' ? '0.1' : '1'" placeholder="未知，请核对" :aria-label="'修正后的' + row.label" :aria-invalid="!!errorFor(row)" :aria-describedby="errorFor(row) ? 'scan-review-error-' + row.id : 'scan-review-value-' + row.id" @input="row.included = true" />
            <small v-if="row.max != null">上限 {{ row.max }}<template v-if="row.key === 'special'"> · 最多一位小数</template></small>
          </label>
          <OperatorLevelBreakthroughSelect v-else-if="row.kind === 'breakthrough'" v-model="row.value" :level="Number(rows.find(item => item.id === 'level' && item.included)?.value ?? current?.level ?? row.level) || 0" @update:model-value="row.included = true" />
          <div v-else-if="row.kind === 'huaji'" class="huaji-fields">
            <label>拥有状态<select v-model="row.value.owned" aria-label="复核拥有状态" @change="changeOwned(row)"><option :value="null">未知</option><option :value="true">已拥有</option><option :value="false">未拥有</option></select></label>
            <label>化极星级与节点<select v-model="row.value.stage" aria-label="复核化极星级与节点" :disabled="row.value.owned !== true" @change="row.included = true; row.stageEdited = true"><option :value="null">未知，请核对</option><option v-if="row.value.stage === 0" :value="0">未拥有</option><option v-for="stage in stages" :key="stage" :value="stage">{{ valueLabel({ owned: true, stage, awakened: null }, 'huaji').split(' · 觉醒')[0] }}</option></select></label>
            <label>觉醒确认<select v-model="row.value.awakened" aria-label="复核觉醒确认" :disabled="row.value.owned !== true" @change="row.included = true; row.awakenedEdited = true"><option :value="null">待确认</option><option :value="false">确认未觉醒</option><option v-if="awakeningSupported" :value="true">确认已觉醒</option></select></label>
            <small>未修改的未知化极或觉醒值，不会清除现值中已确认的记录。</small>
            <small v-if="Number(catalog.rarity) === 3 && !isMovieOperator(catalog)">蓝卡（隐密）最高为 4 星，满星后没有小节点，也不支持觉醒。旧记录中的额外节点需按游戏实际状态重新确认。</small>
          </div>
          <div v-else-if="row.kind === 'discs'" class="loadouts">
            <div v-for="(loadout, index) in row.value || []" :key="index" class="loadout">
              <label>组合 {{ index + 1 }} 名称<input v-model="loadout.name" maxlength="64" :aria-label="'复核命盘组合' + (index + 1) + '名称'" @input="row.included = true" /></label>
              <label v-for="name in discOptions(loadout)" :key="name" class="check" :class="{ 'invalid-disc': !catalogDiscNames.includes(name) }"><input type="checkbox" :aria-invalid="!catalogDiscNames.includes(name)" :checked="loadout.discs.some(disc => discNameOf(disc) === name)" :disabled="!loadout.discs.some(disc => discNameOf(disc) === name) && loadout.discs.length >= DISC_SELECTION_LIMIT" @change="toggleDisc(row, loadout, name, $event.target.checked)" /><span>{{ name || '空命盘名' }}<strong v-if="!catalogDiscNames.includes(name)" class="invalid-disc-hint">不在该密探图鉴中，可能是识别错误。请取消勾选，再对照游戏选择正确命盘。</strong></span></label>
              <button type="button" @click="row.value.splice(index, 1); row.included = true">删除组合 {{ index + 1 }}</button>
            </div>
            <p v-if="!catalogDiscNames.length">暂无可选命盘，请更新图鉴后重试；原始采集保留在技术详情。</p>
            <button type="button" :disabled="(row.value?.length || 0) >= DISC_LOADOUT_LIMIT || !catalogDiscNames.length" @click="addLoadout(row)">添加命盘组合</button>
          </div>
          <p v-if="errorFor(row)" :id="'scan-review-error-' + row.id" class="field-error" role="alert">{{ errorFor(row) }}</p>
        </template>
        <p v-else-if="row.pending">此项暂不支持字段表单修改，原始内容仍保留；请补充采集证据或用 JSON 高级导入处理。保存其他字段后，此提醒继续保留。</p>
      </fieldset>
      <p v-if="!rows.some(row => row.pending)">当前响应没有可定位的待核字段，请重新读回档案并核对技术详情。</p>
      <p role="status">本次选中 {{ selectedCount }} 项 · 仍待核 {{ pendingCount - selectedCount }} 项。预览不会写入档案。</p>
      <div class="actions"><button class="primary" type="submit" :disabled="busy || currentLoading || !!currentError || !selectedCount">{{ busy ? '处理中…' : '校验并预览' }}</button><button type="button" :disabled="busy" @click="$emit('close')">取消复核</button><button type="button" :disabled="busy" @click="$emit('dismiss')">已完成复核</button></div>
    </form>
    <details class="technical"><summary>技术详情</summary>
      <p>记录：{{ review.record_id }} · 密探标识：{{ review.operator_id }}</p>
      <ul><li v-for="(issue, index) in issues" :key="index">{{ issue.code }} · {{ issue.field || issue.field_path || issue.fieldPath }} · {{ issue.message }}</li></ul>
      <button type="button" @click="copy(operatorReviewDiagnostic(review), '脱敏诊断')">复制脱敏诊断</button>
      <details><summary>原始采集 JSON（含账号信息，仅供本人核对）</summary><button type="button" @click="copy(JSON.stringify(review.document, null, 2), '原始采集 JSON')">复制原文</button><pre>{{ JSON.stringify(review.document, null, 2) }}</pre></details>
      <p role="status">{{ copyStatus }}</p>
    </details>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import OperatorLevelBreakthroughSelect from './OperatorLevelBreakthroughSelect.vue'
import OperatorAvatar from './OperatorAvatar.vue'
import { isMovieOperator } from '../../utils/operatorForms.js'
import { operatorHuajiMax } from '../../utils/operatorHuaji.js'
import { DISC_LOADOUT_LIMIT, DISC_SELECTION_LIMIT, discNameOf } from '../../utils/operatorDiscLoadouts.js'
import { buildOperatorReviewCorrection, operatorReviewCurrentValue, operatorReviewDiagnostic, operatorReviewField, operatorReviewIssueText, operatorReviewIssues, operatorReviewRows, operatorReviewRowError, operatorReviewSource, operatorReviewValueLabel } from '../../utils/operatorScanReview.js'

const props = defineProps({ review: { type: Object, required: true }, catalog: { type: Object, default: () => ({}) }, current: { type: Object, default: null }, accountName: { type: String, default: '当前账号' }, currentLoading: Boolean, currentError: { type: String, default: '' }, busy: Boolean })
const emit = defineEmits(['change', 'preview', 'close', 'dismiss', 'readback'])
const panel = ref(null)
const errorSummary = ref(null)
const rows = ref(operatorReviewRows(props.review, props.catalog))
const identityConfirmed = ref(false)
const identityRequired = computed(() => { const match = operatorReviewSource(props.review).entry.match; return !!match && match.status !== 'ready' })
const submitted = ref(false)
const copyStatus = ref('')
const issues = computed(() => operatorReviewIssues(props.review))
const pendingCount = computed(() => rows.value.filter(row => row.pending).length)
const selectedCount = computed(() => rows.value.filter(row => row.pending && row.supported && row.included).length)
const stages = computed(() => Array.from({ length: operatorHuajiMax(props.catalog) }, (_, index) => index + 1).filter(stage => !isMovieOperator(props.catalog) || [1, 7, 13, 19, 25].includes(stage)))
const awakeningSupported = computed(() => !isMovieOperator(props.catalog) && Number(props.catalog.rarity) !== 3)
const catalogDiscNames = computed(() => (props.catalog.discs || []).map(discNameOf))
const errorFor = row => operatorReviewRowError(row, rows.value, props.catalog, props.current)
const errors = computed(() => rows.value.filter(row => errorFor(row)))
const signature = () => JSON.stringify([rows.value, identityConfirmed.value])
let baseline = signature()
let acceptingReceipt = false
const valueLabel = (value, id) => operatorReviewValueLabel(value, id, props.catalog)
const fieldExists = issue => rows.value.some(row => row.id === operatorReviewField(issue) && row.pending && row.supported)

function emitChange() {
  if (acceptingReceipt) return
  const valid = !errors.value.length && (!identityRequired.value || identityConfirmed.value)
  emit('change', {
    document: valid ? buildOperatorReviewCorrection(props.review, rows.value, props.review.draftRecordId, props.review.correctedAt, props.catalog, props.current) : null,
    complete: pendingCount.value > 0 && selectedCount.value === pendingCount.value && valid,
    dirty: signature() !== baseline,
  })
}
watch([() => rows.value, identityConfirmed], emitChange, { deep: true })
watch(() => props.current, () => { if (selectedCount.value) emitChange() }, { deep: true })

function focusField(id) {
  const field = panel.value?.querySelector('#scan-review-field-' + id)
  field?.scrollIntoView?.({ block: 'nearest' })
  ;(field?.querySelector('.invalid-disc input') || field?.querySelector('input:not([type="checkbox"]), select') || field)?.focus()
}
async function preview() {
  submitted.value = true
  if (errors.value.length) { await nextTick(); errorSummary.value?.focus(); return }
  if (identityRequired.value && !identityConfirmed.value) { panel.value?.querySelector('.check input')?.focus(); return }
  emit('preview')
}
function changeOwned(row) {
  row.included = true
  if (row.value.owned === false) { row.value.stage = 0; row.value.awakened = null }
  else if (row.value.stage === 0) row.value.stage = null
}
const discOptions = loadout => [...new Set([...(loadout.discs || []).map(discNameOf).filter(name => !catalogDiscNames.value.includes(name)), ...catalogDiscNames.value])]
function toggleDisc(row, loadout, name, selected) {
  loadout.discs = selected ? [...loadout.discs, { ot_name: name }] : loadout.discs.filter(disc => discNameOf(disc) !== name)
  row.included = true
}
function addLoadout(row) {
  row.value ||= []
  row.value.push({ id: 'review_disc_' + (row.value.length + 1), name: '复核组合 ' + (row.value.length + 1), discs: [] })
  row.included = true
}
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); copyStatus.value = label + '已复制' }
  catch { copyStatus.value = '复制失败，可展开详情后手动选择复制' }
}
function markSaved() {
  acceptingReceipt = true
  rows.value.filter(row => row.pending && row.supported && row.included).forEach(row => { row.pending = false; row.included = false })
  baseline = signature()
  emit('change', { dirty: false, saved: true, complete: pendingCount.value === 0 })
  nextTick(() => { acceptingReceipt = false })
}
defineExpose({ focus: () => panel.value?.focus(), focusField, hasField: id => rows.value.some(row => row.id === id && row.pending && row.supported), markSaved })
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.scan-review-form { color: var(--ink); outline: none; }
button, input, select { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); }
button { cursor: pointer; }
button:disabled { opacity: .55; cursor: not-allowed; }
.primary { background: var(--tea); color: var(--on-strong); }
a { color: var(--theme-strong-text, var(--tea)); text-decoration: underline; }
:is(a, button, input, select, summary):focus-visible, fieldset:focus-visible, .errors:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
fieldset { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.check input { accent-color: var(--tea); }
.field-error, .errors { color: var(--theme-danger-text, var(--rouge)); }
.invalid-disc { color: var(--theme-danger-text, var(--rouge)); border: 1px solid var(--rouge); border-radius: 8px; }
.errors { border: 1px solid var(--rouge); border-radius: 8px; }
.technical { border-top: 1px solid var(--line); }
summary { cursor: pointer; }
</style>
<style scoped src="./operatorScanReviewFormDesktop.css"></style>
<style scoped src="./operatorScanReviewFormMobile.css"></style>
