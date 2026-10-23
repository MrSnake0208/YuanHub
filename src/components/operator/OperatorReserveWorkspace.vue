<template>
  <section class="reserve-workspace" aria-label="未来储备工作区" :aria-busy="loading || saving">
    <p>为尚未确定身份的密探准备材料。每个方案均为独立试算，未预留库存，不代表多个方案可同时完成。</p>
    <p v-if="loading" role="status">正在读取储备方案…</p>
    <p v-if="error && !loaded" class="reserve-error" role="alert">{{ error }}</p>
    <button v-if="!loaded && !loading" type="button" @click="load">重新读取方案</button>
    <template v-if="loaded">
      <p v-if="workspace.read_only" role="status">这是「{{ workspace.game_snapshot }}」的旧方案，仅可查看。请新建对应游戏账号继续编辑。</p>
      <form novalidate @submit.prevent="save()">
        <div v-if="errors.length" ref="errorSummary" class="reserve-error" role="alert" tabindex="-1" aria-label="请检查储备方案">
          <strong>请检查以下内容</strong>
          <ul><li v-for="entry in errors" :key="entry.control"><a :href="'#' + entry.control" @click.prevent="focusField(entry.control)">{{ entry.message }}</a></li></ul>
        </div>
        <fieldset :disabled="saving || workspace.read_only">
          <div class="reserve-toolbar">
            <label :for="prefix + '-plan'">当前方案</label>
            <PlannerSelect :id="prefix + '-plan'" v-model="workspace.active_plan_id" :options="planOptions" label="当前储备方案" />
            <button type="button" :disabled="workspace.plans.length >= 50" @click="addPlan">新建方案</button>
          </div>
          <p v-if="workspace.plans.length >= 50">已达到 50 个方案上限，删除不需要的方案后可新建。</p>
          <p v-if="!activePlan">还没有储备方案，先新建一个方案。</p>
          <template v-else>
            <div class="reserve-toolbar">
              <label :for="nameId(activePlan)">方案名称</label>
              <input :id="nameId(activePlan)" v-model="activePlan.name" maxlength="40" :aria-invalid="!!fieldError(nameId(activePlan)) || undefined" :aria-describedby="fieldError(nameId(activePlan)) ? nameId(activePlan) + '-error' : undefined" />
              <button type="button" @click="confirmDelete = activePlan.id">删除方案</button>
            </div>
            <p v-if="fieldError(nameId(activePlan))" :id="nameId(activePlan) + '-error'" class="reserve-error">{{ fieldError(nameId(activePlan)) }}</p>
            <div v-if="confirmDelete === activePlan.id" class="reserve-delete" role="alert">
              <p>删除「{{ activePlan.name }}」及其需求？保存后从云端移除。</p>
              <button type="button" @click="removePlan">确认删除方案</button>
              <button type="button" @click="confirmDelete = ''">保留方案</button>
            </div>
            <article v-for="(demand, index) in activePlan.demands" :key="demand.id" class="reserve-demand" :aria-label="'需求组 ' + (index + 1)">
              <header><h3>需求组 {{ index + 1 }}</h3><button type="button" @click="activePlan.demands.splice(index, 1)">移除此组</button></header>
              <div class="reserve-fields">
                <div v-for="field in demandFields(demand)" :key="field.key" class="reserve-field">
                  <label :for="controlId(demand, field.key)">{{ field.label }}</label>
                  <PlannerSelect v-if="field.options" :id="controlId(demand, field.key)" :model-value="field.owner[field.property]" :options="field.options"
                    :label="'需求组 ' + (index + 1) + ' ' + field.label" :invalid="!!fieldError(controlId(demand, field.key))"
                    :described-by="fieldError(controlId(demand, field.key)) ? controlId(demand, field.key) + '-error' : ''"
                    @update:model-value="field.owner[field.property] = $event" />
                  <input v-else :id="controlId(demand, field.key)" type="number" inputmode="numeric" step="1" :min="field.min" :max="field.max" :value="field.owner[field.property]"
                    :aria-invalid="!!fieldError(controlId(demand, field.key)) || undefined" :aria-describedby="fieldError(controlId(demand, field.key)) ? controlId(demand, field.key) + '-error' : undefined"
                    @input="field.owner[field.property] = $event.target.value === '' ? null : Number($event.target.value)" />
                  <p v-if="fieldError(controlId(demand, field.key))" :id="controlId(demand, field.key) + '-error'" class="reserve-error">{{ fieldError(controlId(demand, field.key)) }}</p>
                </div>
              </div>
            </article>
            <button type="button" :disabled="activePlan.demands.length >= 50" @click="addDemand">添加需求组</button>
            <p v-if="activePlan.demands.length >= 50">每个方案最多 50 组需求，可移除不需要的组。</p>
          </template>
        </fieldset>

        <section v-if="calculation" class="reserve-totals" aria-label="当前方案费用">
          <p v-if="calculation.money !== null">总五铢钱 {{ format(calculation.money) }} · 总经验 {{ format(calculation.experience) }}</p>
          <p v-for="(item, index) in calculation.unsupportedReasons" :key="index" role="status">{{ unsupportedMessage(item) }}</p>
          <div v-if="calculation.items" class="reserve-table-scroll">
            <table><caption>当前方案材料需求与库存缺口</caption><thead><tr><th scope="col">材料</th><th scope="col">总需求</th><th scope="col">缺口</th></tr></thead>
              <tbody><tr v-for="(amount, id) in calculation.items" :key="id"><th scope="row">{{ materialName(id) }}</th><td>{{ format(amount) }}</td><td>{{ calculation.shortage ? format(calculation.shortage.items[id]) : '待库存可用' }}</td></tr>
                <tr><th scope="row">经验</th><td>{{ format(calculation.experience) }}</td><td>{{ calculation.shortage ? format(calculation.shortage.experience) : '待库存可用' }}</td></tr></tbody>
            </table>
          </div>
          <p v-else>费用尚不能确定，请检查需求或确认突破状态。</p>
        </section>

        <div v-if="conflict" class="reserve-conflict" role="alert">
          <p>云端方案已变化，当前草稿已保留。请先读回比较，再选择要保留的内容。</p>
          <button type="button" :disabled="comparing || saving" @click="compareRemote">{{ comparing ? '正在读取…' : '读回云端比较' }}</button>
          <template v-if="comparison">
            <h3>云端方案（版本 {{ comparison.revision }}）</h3>
            <p v-if="!comparison.plans.length">云端没有方案。</p>
            <div v-for="remotePlan in comparison.plans" :key="remotePlan.id" class="reserve-remote">
              <strong>{{ remotePlan.name }}{{ remotePlan.id === comparison.active_plan_id ? '（当前方案）' : '' }}</strong>
              <p v-for="remoteDemand in remotePlan.demands" :key="remoteDemand.id">{{ describeDemand(remoteDemand) }}</p>
            </div>
            <p>采用云端会替换本地草稿；重试保存会用当前草稿替换上方全部云端方案。</p>
            <button type="button" :disabled="saving" @click="adoptRemote">采用云端，替换草稿</button>
            <button type="button" :disabled="saving || comparison.read_only" @click="save(comparison.revision)">保留草稿，重试保存</button>
          </template>
        </div>
        <div class="reserve-save">
          <button type="submit" :disabled="saving || conflict || workspace.read_only">{{ saving ? '正在保存…' : '保存储备方案' }}</button>
          <span role="status">{{ notice || (dirty ? '有未保存的修改' : '已与云端同步') }}</span>
          <p v-if="error" ref="saveError" class="reserve-error" role="alert" tabindex="-1">{{ error }}</p>
        </div>
      </form>
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import PlannerSelect from './PlannerSelect.vue'
import { getOperatorReserveWorkspace, putOperatorReserveWorkspace } from '../../api/operator.js'
import { reservePlanRequirements, validateReserveDemand } from '../../data/operatorReservePlans.js'
import { getMaxEliteForLevel, isLevelBreakthroughBoundary } from '../../utils/operatorGrowthRules.js'
import { createUuid } from '../../utils/createUuid.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'

const props = defineProps({ accountId: { type: String, required: true }, game: { type: String, required: true }, stock: { type: Object, default: null } })
const prefix = 'reserve-' + useId()
const workspace = ref(null), loaded = ref(false), loading = ref(false), saving = ref(false)
const error = ref(''), notice = ref(''), errors = ref([]), errorSummary = ref(null), baseline = ref('')
const saveError = ref(null)
const conflict = ref(false), comparison = ref(null), comparing = ref(false), confirmDelete = ref('')
let session = 0
const clone = value => JSON.parse(JSON.stringify(value))
const content = () => ({ schema_version: 1, active_plan_id: workspace.value.active_plan_id, plans: workspace.value.plans })
const dirty = computed(() => loaded.value && JSON.stringify(content()) !== baseline.value)
const activePlan = computed(() => workspace.value?.plans.find(plan => plan.id === workspace.value.active_plan_id))
const planOptions = computed(() => workspace.value?.plans.map(plan => ({ value: plan.id, label: plan.name || '未命名方案' })) || [])
const calculation = computed(() => activePlan.value ? reservePlanRequirements(activePlan.value, props.stock) : null)
const format = value => Number(value).toLocaleString('zh-CN')
const materialName = id => ITEM_CATALOG.find(item => item.id === id)?.name || id
const nameId = plan => `${prefix}-${plan.id}-name`
const controlId = (demand, field) => `${prefix}-${demand.id}-${field.replaceAll('.', '-')}`
const fieldError = id => errors.value.find(entry => entry.control === id)?.message || ''
async function focusField(id) {
  const entry = errors.value.find(item => item.control === id)
  if (entry && workspace.value) { workspace.value.active_plan_id = entry.planId; await nextTick() }
  document.getElementById(id)?.focus()
}
function accept(value, account) {
  if (value?.schema_version !== 1 || value.account_id !== account || !Array.isArray(value.plans) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('方案响应不匹配，请重新读取')
  return clone(value)
}
function apply(value) {
  workspace.value = value
  baseline.value = JSON.stringify(content())
  conflict.value = false; comparison.value = null; errors.value = []; confirmDelete.value = ''
}
async function load() {
  const current = ++session, account = props.accountId
  workspace.value = null; loaded.value = false; loading.value = !!account; saving.value = false
  error.value = ''; notice.value = ''; errors.value = []; conflict.value = false; comparison.value = null; comparing.value = false; confirmDelete.value = ''
  if (!account) return
  try {
    const response = await getOperatorReserveWorkspace(account)
    if (current !== session || props.accountId !== account) return
    apply(accept(response, account)); loaded.value = true
  } catch (failure) {
    if (current === session) error.value = failure.message || '方案读取失败，请重试'
  } finally { if (current === session) loading.value = false }
}
function addPlan() {
  const id = createUuid()
  workspace.value.plans.push({ id, name: '新储备方案', demands: [] })
  workspace.value.active_plan_id = id; notice.value = ''; confirmDelete.value = ''
  nextTick(() => focusField(nameId({ id })))
}
function removePlan() {
  workspace.value.plans = workspace.value.plans.filter(plan => plan.id !== confirmDelete.value)
  workspace.value.active_plan_id = workspace.value.plans[0]?.id || null
  confirmDelete.value = ''; notice.value = ''; errors.value = []
  nextTick(() => focusField(prefix + '-plan'))
}
function addDemand() {
  const value = { id: createUuid(), count: 1, attribute: '风', profession: '破军', current: { level: 0, elite: 0, breakthrough_stage: null }, target: { level: 100, elite: 17 } }
  activePlan.value.demands.push(value); notice.value = ''
  nextTick(() => focusField(controlId(value, 'count')))
}
function demandFields(value) {
  const options = values => values.map(item => ({ value: item, label: item }))
  const level = value.current.level
  const stages = [{ value: null, label: '尚未确认' }]
  if (Number.isInteger(level) && level >= 1 && level <= 100) {
    if (isLevelBreakthroughBoundary(level)) stages.push({ value: level / 10 - 1, label: '尚未突破' }, { value: level / 10, label: '已经突破' })
    else stages.push({ value: Math.floor((level - 1) / 10), label: '按当前等级确定' })
  }
  return [
    { key: 'count', owner: value, property: 'count', label: '人数', min: 1, max: 999 },
    { key: 'attribute', owner: value, property: 'attribute', label: '属性', options: options(['风', '火', '地', '水', '阴', '阳', '混沌']) },
    { key: 'profession', owner: value, property: 'profession', label: '职业', options: options(['破军', '龙盾', '岐黄', '神纪', '诡道']) },
    { key: 'current.level', owner: value.current, property: 'level', label: '当前等级', min: 0, max: 100 },
    { key: 'current.elite', owner: value.current, property: 'elite', label: '当前修为', min: 0, max: getMaxEliteForLevel(value.current.level) },
    { key: 'current.breakthrough_stage', owner: value.current, property: 'breakthrough_stage', label: '当前等级突破', options: stages },
    { key: 'target.level', owner: value.target, property: 'level', label: '目标等级', min: 0, max: 100 },
    { key: 'target.elite', owner: value.target, property: 'elite', label: '目标修为', min: 0, max: getMaxEliteForLevel(value.target.level) }
  ]
}
function describeDemand(value) {
  return `${value.count} 人 · ${value.attribute} · ${value.profession} · 等级 ${value.current.level}→${value.target.level} · 修为 ${value.current.elite}→${value.target.elite} · 当前突破${value.current.breakthrough_stage == null ? '未知' : '阶段 ' + value.current.breakthrough_stage}`
}
function unsupportedMessage(value) {
  const index = activePlan.value.demands.findIndex(demand => demand.id === value.demandId)
  return index >= 0 ? `需求组 ${index + 1}：${value.message}` : value.message
}
async function validate() {
  errors.value = []
  for (const plan of workspace.value.plans) {
    if (!plan.name.trim() || plan.name.length > 40) errors.value.push({ planId: plan.id, control: nameId(plan), message: '方案名称须为 1–40 字符' })
    for (const demand of plan.demands) {
      const fields = validateReserveDemand(demand).errors[demand.id] || {}
      for (const [field, message] of Object.entries(fields)) errors.value.push({ planId: plan.id, control: controlId(demand, field), message })
    }
  }
  if (!errors.value.length) return true
  workspace.value.active_plan_id = errors.value[0].planId
  await nextTick(); errorSummary.value?.focus()
  return false
}
async function save(expectedRevision = workspace.value.revision) {
  if (saving.value || !loaded.value || workspace.value.read_only || (conflict.value && expectedRevision !== comparison.value?.revision)) return
  const current = session, account = props.accountId
  saving.value = true
  if (!await validate()) { if (current === session) saving.value = false; return }
  if (current !== session || account !== props.accountId) return
  const body = clone({ ...content(), expected_revision: expectedRevision })
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const response = await putOperatorReserveWorkspace(account, body)
    if (current !== session || account !== props.accountId) return
    apply(accept(response, account)); notice.value = '储备方案已保存'
  } catch (failure) {
    if (current !== session || account !== props.accountId) return
    if (failure.status === 409) { conflict.value = true; comparison.value = null }
    error.value = failure.status === 409 ? '保存冲突，草稿未丢失。' : (failure.message || '保存失败，草稿已保留，请重试')
    await nextTick()
    if (current === session) saveError.value?.focus()
  } finally { if (current === session) saving.value = false }
}
async function compareRemote() {
  const current = session, account = props.accountId
  comparing.value = true; error.value = ''
  try {
    const response = await getOperatorReserveWorkspace(account)
    if (current === session && account === props.accountId) comparison.value = accept(response, account)
  } catch (failure) { if (current === session) error.value = failure.message || '云端比较读取失败，草稿已保留' }
  finally { if (current === session) comparing.value = false }
}
function adoptRemote() { apply(comparison.value); error.value = ''; notice.value = '已采用云端方案' }
watch(() => [props.accountId, props.game], load, { immediate: true, flush: 'sync' })
watch(dirty, value => { if (value) notice.value = '' })
watch(() => workspace.value?.active_plan_id, () => { confirmDelete.value = '' })
onBeforeUnmount(() => { session++ })
</script>

<style scoped>
.reserve-workspace { min-width: 0; color: var(--ink); }
.reserve-workspace p { line-height: 1.6; overflow-wrap: anywhere; }
.reserve-workspace fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.reserve-workspace button, .reserve-workspace input { font: inherit; color: inherit; }
.reserve-workspace button { cursor: pointer; padding: 7px 11px; border: 1px solid var(--theme-border, #d7c6a6); background: var(--surface); border-radius: 7px; white-space: normal; }
.reserve-workspace button:disabled { cursor: default; opacity: .6; }
.reserve-workspace input { min-width: 0; width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--theme-border, #d7c6a6); border-radius: 6px; background: var(--surface); }
.reserve-workspace :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.reserve-toolbar, .reserve-demand header, .reserve-save { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 12px 0; }
.reserve-toolbar input { flex: 1 1 180px; max-width: 420px; }
.reserve-demand { margin: 16px 0; padding-top: 8px; border-top: 1px solid var(--theme-border, #d7c6a6); }
.reserve-demand header { justify-content: space-between; }
.reserve-demand h3, .reserve-conflict h3 { font-size: 1rem; margin: 0; }
.reserve-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.reserve-field { min-width: 0; display: grid; align-content: start; gap: 6px; }
.reserve-field :deep(.planner-select) { width: 100%; min-width: 0; }
.reserve-field :deep(.planner-select-trigger) { width: 100%; }
.reserve-error { color: var(--theme-danger-text, var(--rouge)); }
.reserve-error a { color: inherit; }
.reserve-conflict, .reserve-delete { padding: 12px; border: 1px solid var(--theme-border, #d7c6a6); margin: 12px 0; }
.reserve-remote { padding: 8px 0; }
.reserve-table-scroll { max-width: 100%; overflow-x: auto; }
.reserve-totals table { width: 100%; border-collapse: collapse; }
.reserve-totals caption { text-align: left; padding: 8px 0; }
.reserve-totals th, .reserve-totals td { text-align: left; padding: 8px; border-bottom: 1px solid var(--theme-border, #d7c6a6); }
.reserve-totals td { white-space: nowrap; font-variant-numeric: tabular-nums; }
@media (max-width: 900px) { .reserve-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .reserve-fields { grid-template-columns: minmax(0, 1fr); } .reserve-toolbar { align-items: stretch; } .reserve-toolbar input { max-width: none; } }
</style>
