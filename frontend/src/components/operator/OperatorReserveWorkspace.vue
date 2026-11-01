<template>
  <section class="reserve-workspace" aria-label="未来储备工作区" :aria-busy="loading || saving">
    <p v-if="loading" role="status">正在读取储备方案…</p>
    <p v-if="error && !loaded" class="reserve-error" role="alert">{{ error }}</p>
    <button v-if="!loaded && !loading" type="button" @click="load">重新读取方案</button>
    <template v-if="loaded">
      <p v-if="workspace.read_only" role="status">这是「{{ workspace.game_snapshot }}」的旧方案，仅可查看。请新建对应游戏账号继续编辑。</p>
      <form novalidate @submit.prevent="save()">
        <div v-if="errors.length" ref="errorSummary" class="reserve-error reserve-error-summary" role="alert" tabindex="-1" aria-label="请检查储备方案">
          <strong>请检查以下内容</strong>
          <ul><li v-for="entry in errors" :key="entry.control + entry.message"><a :href="'#' + entry.control" @click.prevent="focusField(entry.control)">{{ entry.message }}</a></li></ul>
        </div>
        <div class="reserve-toolbar">
          <div v-if="workspace.plans.length" class="reserve-plan-picker">
            <label :for="prefix + '-plan'">当前方案</label>
            <PlannerSelect :id="prefix + '-plan'" v-model="workspace.active_plan_id" :options="planOptions" label="当前储备方案" :disabled="saving" />
            <button v-if="activePlan" :id="prefix + '-manage'" type="button" class="reserve-rename" aria-label="管理方案" title="修改方案名称" :aria-expanded="managementOpen" :aria-controls="prefix + '-management'" :disabled="saving" @click="managementOpen = !managementOpen"><Pencil :size="16" aria-hidden="true" /></button>
          </div>
          <button :id="prefix + '-new'" type="button" :disabled="saving || workspace.read_only || workspace.plans.length >= 50" @click="addPlan"><Plus :size="16" aria-hidden="true" />{{ workspace.plans.length ? '新建方案' : '新建储备方案' }}</button>
          <div v-if="workspace.plans.length || dirty" class="reserve-save">
            <button type="submit" class="reserve-primary" :disabled="saving || conflict || workspace.read_only"><Save :size="16" aria-hidden="true" />{{ saving ? '正在保存…' : '保存方案' }}</button>
            <span role="status" :class="{ 'reserve-dirty': dirty }">{{ saving ? '正在同步到云端…' : workspace.read_only ? '只读云端方案' : dirty ? '有未保存的修改' : notice }}</span>
          </div>
          <button v-if="activePlan" :id="prefix + '-delete'" type="button" class="reserve-delete" :disabled="saving || workspace.read_only" @click="confirmDelete = activePlan.id"><Trash2 :size="16" aria-hidden="true" />删除方案</button>
        </div>
        <p v-if="workspace.plans.length >= 50" class="reserve-hint">已达到 50 个方案上限，删除不需要的方案后可新建。</p>
        <p v-if="error" ref="saveError" class="reserve-error" role="alert" tabindex="-1">{{ error }}</p>
        <p v-if="dirty" class="reserve-hint">页内返回会保留草稿；切换账号、切换页面区域或离开页面前，请先保存。</p>
        <p v-if="!activePlan" class="reserve-empty">还没有储备方案，新建一个方案开始估算。</p>
        <div v-if="conflict" class="reserve-conflict" role="alert">
          <p>云端方案已变化，当前草稿已保留。请先读回比较，再选择要保留的内容。</p>
          <button type="button" :disabled="comparing || saving" @click="compareRemote">{{ comparing ? '正在读取…' : '读回云端比较' }}</button>
          <template v-if="comparison">
            <h4>云端方案（版本 {{ comparison.revision }}）</h4>
            <p v-if="!comparison.plans.length">云端没有方案。</p>
            <div v-for="remotePlan in comparison.plans" :key="remotePlan.id" class="reserve-remote">
              <strong>{{ remotePlan.name }}{{ remotePlan.id === comparison.active_plan_id ? '（当前方案）' : '' }}</strong>
              <p v-for="remoteDemand in remotePlan.demands" :key="remoteDemand.id">{{ describeDemand(remoteDemand) }}</p>
            </div>
            <p>采用云端会替换本地草稿；重试保存会用当前草稿替换上方全部云端方案。</p>
            <div class="reserve-actions"><button type="button" :disabled="saving" @click="adoptRemote">采用云端，替换草稿</button><button type="button" :disabled="saving || comparison.read_only" @click="save(comparison.revision)">保留草稿，重试保存</button></div>
          </template>
        </div>

        <fieldset :disabled="saving || workspace.read_only">
          <template v-if="activePlan">
            <div v-if="managementOpen" :id="prefix + '-management'" class="reserve-management">
              <div class="reserve-toolbar">
                <label :for="nameId(activePlan)">方案名称</label>
                <input :id="nameId(activePlan)" v-model="activePlan.name" maxlength="40" autocomplete="off" :aria-invalid="!!fieldError(nameId(activePlan)) || undefined" :aria-describedby="fieldError(nameId(activePlan)) ? nameId(activePlan) + '-error' : undefined" />
              </div>
              <p v-if="fieldError(nameId(activePlan))" :id="nameId(activePlan) + '-error'" class="reserve-error">{{ fieldError(nameId(activePlan)) }}</p>
            </div>
            <div v-if="confirmDelete === activePlan.id" class="reserve-confirm" role="alert">
              <p>删除「{{ activePlan.name }}」及其全部培养目标？保存后从云端移除。</p>
              <div class="reserve-actions"><button type="button" @click="removePlan">确认删除方案</button><button type="button" @click="cancelDelete">保留方案</button></div>
            </div>
            <p class="reserve-hint reserve-plan-note">各方案独立试算，不预留库存，不代表可同时完成；保存方案会同步全部方案。</p>
            <div class="reserve-body">
              <section class="reserve-targets" :aria-labelledby="prefix + '-targets'">
                <header class="reserve-section-heading"><h4 :id="prefix + '-targets'"><Sparkles :size="20" aria-hidden="true" />培养目标</h4><span>共 {{ activePlan.demands.length }} 个目标</span></header>
                <p class="reserve-hint reserve-section-description">添加未来要培养的密探，设置目标等级与修为，自动计算所需材料。</p>
                <p v-if="!activePlan.demands.length" class="reserve-empty">还没有培养目标，添加一位未来密探开始估算。</p>
                <article v-for="(demand, index) in activePlan.demands" :id="controlId(demand, 'legacy')" :key="demand.id" class="reserve-demand" tabindex="-1" :aria-labelledby="controlId(demand, 'heading')">
                  <header><h5 :id="controlId(demand, 'heading')"><span class="reserve-target-number" aria-hidden="true">{{ index + 1 }}</span>培养目标 {{ index + 1 }}<small v-if="isLegacy(demand)">旧目标</small></h5><button type="button" class="reserve-remove" :aria-label="'移除培养目标 ' + (index + 1)" @click="removeDemand(index)"><Trash2 :size="15" aria-hidden="true" />移除</button></header>
                  <template v-if="isLegacy(demand)">
                    <p class="reserve-legacy-summary">{{ describeDemand(demand) }}</p>
                    <p class="reserve-hint">保留旧数据与原计算。转换后每个目标代表一位密探，并统一从零培养；原有培养进度会清零，材料需求可能增加。</p>
                    <p v-if="activePlan.demands.length - 1 + demand.count > 50" class="reserve-hint">拆分后超过 50 个目标上限，暂不能转换。原始人数、进度和计算已保留，可继续保存旧方案。</p>
                    <button v-else :id="controlId(demand, 'convert')" type="button" @click="confirmConvert = demand.id">转为从零培养目标</button>
                    <div v-if="confirmConvert === demand.id" class="reserve-confirm" role="alert">
                      <p>将此旧目标转换为 {{ demand.count }} 个独立目标，保留属性、职业与目标条件，清除原有培养进度。仅修改本地草稿，确认转换？</p>
                      <div class="reserve-actions"><button type="button" @click="convertDemand(demand)">确认转换</button><button type="button" @click="cancelConvert(demand)">保留旧目标</button></div>
                    </div>
                  </template>
                  <div v-else class="reserve-fields">
                    <div v-for="field in demandFields(demand)" :key="field.key" class="reserve-field">
                      <label :for="controlId(demand, field.key)">{{ field.label }}</label>
                      <PlannerSelect v-if="field.options" :id="controlId(demand, field.key)" :model-value="field.owner[field.property]" :options="field.options" :placeholder="'选择' + field.label"
                        :label="'培养目标 ' + (index + 1) + ' ' + field.label" :invalid="!!fieldError(controlId(demand, field.key))"
                        :described-by="fieldError(controlId(demand, field.key)) ? controlId(demand, field.key) + '-error' : ''"
                        @update:model-value="field.owner[field.property] = $event" />
                      <input v-else :id="controlId(demand, field.key)" type="number" inputmode="numeric" step="1" :min="field.min" :max="field.max" :value="field.owner[field.property]"
                        :aria-invalid="!!fieldError(controlId(demand, field.key)) || undefined" :aria-describedby="fieldError(controlId(demand, field.key)) ? controlId(demand, field.key) + '-error' : undefined"
                        @input="field.owner[field.property] = $event.target.value === '' ? null : Number($event.target.value)" />
                      <p v-if="fieldError(controlId(demand, field.key))" :id="controlId(demand, field.key) + '-error'" class="reserve-error">{{ fieldError(controlId(demand, field.key)) }}</p>
                    </div>
                  </div>
                  <p v-if="!isLegacy(demand) && (!demand.attribute || !demand.profession)" class="reserve-hint">请选择属性和职业后查看材料估算。</p>
                </article>
                <button :id="prefix + '-add-target'" type="button" class="reserve-add-target" :disabled="activePlan.demands.length >= 50" @click="addDemand"><Plus :size="16" aria-hidden="true" />添加培养目标</button>
                <p v-if="activePlan.demands.length >= 50" class="reserve-hint">每个方案最多 50 个培养目标，可移除不需要的目标。</p>
              </section>
              <section class="reserve-totals" :aria-labelledby="prefix + '-totals'">
                <header class="reserve-section-heading"><h4 :id="prefix + '-totals'"><Layers :size="20" aria-hidden="true" />材料需求与库存缺口</h4></header>
                <p class="reserve-hint reserve-section-description">汇总当前方案的全部目标，并按当前库存计算缺口。</p>
                <template v-if="calculation">
                  <div v-if="calculation.money !== null" class="reserve-metrics"><div class="reserve-metric"><Coins :size="30" aria-hidden="true" /><p><span>总五铢钱</span><strong>{{ format(calculation.money) }}</strong></p></div><div class="reserve-metric"><BookOpen :size="30" aria-hidden="true" /><p><span>总经验</span><strong>{{ format(calculation.experience) }}</strong></p></div></div>
                  <ul v-if="calculation.unsupportedReasons.length" class="reserve-calculation-notes" aria-live="polite"><li v-for="(item, index) in calculation.unsupportedReasons" :key="index">{{ unsupportedMessage(item) }}</li></ul>
                  <div v-if="calculation.items" class="reserve-table-scroll">
                    <table><caption class="reserve-sr-only">当前方案全部材料需求与库存缺口</caption><thead><tr><th scope="col">材料</th><th scope="col">总需求</th><th scope="col">缺口</th></tr></thead>
                      <tbody><tr v-for="(amount, id) in calculation.items" :key="id"><th scope="row">{{ materialName(id) }}</th><td>{{ format(amount) }}</td><td :class="{ 'reserve-shortage': calculation.shortage?.items[id] > 0 }">{{ calculation.shortage ? format(calculation.shortage.items[id]) : '待库存可用' }}</td></tr>
                        <tr><th scope="row">经验</th><td>{{ format(calculation.experience) }}</td><td :class="{ 'reserve-shortage': calculation.shortage?.experience > 0 }">{{ calculation.shortage ? format(calculation.shortage.experience) : '待库存可用' }}</td></tr></tbody>
                    </table>
                  </div>
                  <p v-else class="reserve-hint">材料需求尚不能确定，请补全目标条件或查看上方提示。</p>
                </template>
                <p v-else class="reserve-empty">添加培养目标后，在这里查看材料需求与库存缺口。</p>
              </section>
            </div>
          </template>
        </fieldset>

        <div v-if="calculation" class="reserve-save reserve-bottom-save">
          <button type="submit" class="reserve-primary" :disabled="saving || conflict || workspace.read_only"><Save :size="16" aria-hidden="true" />{{ saving ? '正在保存…' : '保存方案' }}</button>
          <span>{{ dirty ? '有未保存的修改' : notice }}</span>
        </div>
      </form>
    </template>
  </section>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
import { BookOpen, Coins, Layers, Pencil, Plus, Save, Sparkles, Trash2 } from '@lucide/vue'
import PlannerSelect from './PlannerSelect.vue'
import { getOperatorReserveWorkspace, putOperatorReserveWorkspace } from '../../api/operator.js'
import { reservePlanRequirements, validateReserveDemand } from '../../data/operatorReservePlans.js'
import { getMaxEliteForLevel } from '../../utils/operatorGrowthRules.js'
import { createUuid } from '../../utils/createUuid.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'

const props = defineProps({ accountId: { type: String, required: true }, game: { type: String, required: true }, stock: { type: Object, default: null } })
const prefix = 'reserve-' + useId()
const workspace = ref(null), loaded = ref(false), loading = ref(false), saving = ref(false)
const error = ref(''), notice = ref(''), errors = ref([]), errorSummary = ref(null), baseline = ref('')
const saveError = ref(null)
const conflict = ref(false), comparison = ref(null), comparing = ref(false), confirmDelete = ref('')
const managementOpen = ref(false), confirmConvert = ref('')
let session = 0
const clone = value => JSON.parse(JSON.stringify(value))
const content = () => ({ schema_version: 1, active_plan_id: workspace.value.active_plan_id, plans: workspace.value.plans })
const dirty = computed(() => loaded.value && !workspace.value.read_only && JSON.stringify(content()) !== baseline.value)
const activePlan = computed(() => workspace.value?.plans.find(plan => plan.id === workspace.value.active_plan_id))
const planOptions = computed(() => workspace.value?.plans.map(plan => ({ value: plan.id, label: plan.name || '未命名方案' })) || [])
const calculation = computed(() => activePlan.value?.demands.length ? reservePlanRequirements(activePlan.value, props.stock) : null)
const format = value => Number(value).toLocaleString('zh-CN')
const materialName = id => ITEM_CATALOG.find(item => item.id === id)?.name || id
const nameId = plan => `${prefix}-${plan.id}-name`
const controlId = (demand, field) => `${prefix}-${demand.id}-${field.replaceAll('.', '-')}`
const fieldError = id => errors.value.find(entry => entry.control === id)?.message || ''
async function focusField(id) {
  const entry = errors.value.find(item => item.control === id)
  if (entry && workspace.value) {
    workspace.value.active_plan_id = entry.planId
    if (id === nameId(activePlan.value)) managementOpen.value = true
    await nextTick()
  }
  document.getElementById(id)?.focus()
}
function accept(value, account) {
  if (value?.schema_version !== 1 || value.account_id !== account || !Array.isArray(value.plans) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('方案响应不匹配，请重新读取')
  return clone(value)
}
function apply(value) {
  workspace.value = value
  baseline.value = JSON.stringify(content())
  conflict.value = false; comparison.value = null; errors.value = []; confirmDelete.value = ''; confirmConvert.value = ''
}
async function load() {
  const current = ++session, account = props.accountId
  workspace.value = null; loaded.value = false; loading.value = !!account; saving.value = false
  error.value = ''; notice.value = ''; errors.value = []; conflict.value = false; comparison.value = null; comparing.value = false; confirmDelete.value = ''
  managementOpen.value = false; confirmConvert.value = ''
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
  if (saving.value || workspace.value.read_only || workspace.value.plans.length >= 50) return
  const id = createUuid()
  workspace.value.plans.push({ id, name: '新储备方案', demands: [] })
  workspace.value.active_plan_id = id; notice.value = ''; confirmDelete.value = ''; managementOpen.value = true
  nextTick(() => focusField(nameId({ id })))
}
function removePlan() {
  workspace.value.plans = workspace.value.plans.filter(plan => plan.id !== confirmDelete.value)
  workspace.value.active_plan_id = workspace.value.plans[0]?.id || null
  confirmDelete.value = ''; notice.value = ''; errors.value = []
  nextTick(() => focusField(prefix + (activePlan.value ? '-plan' : '-new')))
}
function cancelDelete() { confirmDelete.value = ''; nextTick(() => focusField(prefix + '-delete')) }
function addDemand() {
  if (saving.value || workspace.value.read_only || activePlan.value.demands.length >= 50) return
  const value = { id: createUuid(), count: 1, attribute: '', profession: '', current: { level: 0, elite: 0, breakthrough_stage: null }, target: { level: 100, elite: 17 } }
  activePlan.value.demands.push(value); notice.value = ''
  nextTick(() => focusField(controlId(value, 'attribute')))
}
function removeDemand(index) {
  activePlan.value.demands.splice(index, 1)
  confirmConvert.value = ''; notice.value = ''; errors.value = []
  nextTick(() => focusField(prefix + '-add-target'))
}
const isLegacy = value => value.count !== 1 || value.current.level !== 0 || value.current.elite !== 0 || value.current.breakthrough_stage != null
function cancelConvert(demand) { confirmConvert.value = ''; nextTick(() => focusField(controlId(demand, 'convert'))) }
function convertDemand(demand) {
  const plan = activePlan.value, index = plan.demands.indexOf(demand)
  if (saving.value || workspace.value.read_only || confirmConvert.value !== demand.id || index < 0 || !Number.isInteger(demand.count) || demand.count < 1 || plan.demands.length - 1 + demand.count > 50) return
  const targets = Array.from({ length: demand.count }, () => ({ ...clone(demand), id: createUuid(), count: 1, current: { level: 0, elite: 0, breakthrough_stage: null } }))
  plan.demands.splice(index, 1, ...targets)
  confirmConvert.value = ''; errors.value = []; notice.value = ''
  nextTick(() => focusField(controlId(targets[0], 'attribute')))
}
function demandFields(value) {
  const options = values => values.map(item => ({ value: item, label: item }))
  return [
    { key: 'attribute', owner: value, property: 'attribute', label: '属性', options: options(['风', '火', '地', '水', '阴', '阳', '混沌']) },
    { key: 'profession', owner: value, property: 'profession', label: '职业', options: options(['破军', '龙盾', '岐黄', '神纪', '诡道']) },
    { key: 'target.level', owner: value.target, property: 'level', label: '目标等级', min: 0, max: 100 },
    { key: 'target.elite', owner: value.target, property: 'elite', label: '目标修为', min: 0, max: getMaxEliteForLevel(value.target.level) }
  ]
}
function describeDemand(value) {
  const target = `${value.attribute || '待选属性'} · ${value.profession || '待选职业'} · 目标等级 ${value.target.level} · 目标修为 ${value.target.elite}`
  return isLegacy(value) ? `${value.count} 人 · ${target} · 原有等级 ${value.current.level} · 原有修为 ${value.current.elite} · 原突破${value.current.breakthrough_stage == null ? '未知' : '阶段 ' + value.current.breakthrough_stage}` : target
}
function unsupportedMessage(value) {
  const index = activePlan.value.demands.findIndex(demand => demand.id === value.demandId)
  return index >= 0 ? `培养目标 ${index + 1}：${value.message}` : value.message
}
async function validate() {
  errors.value = []
  for (const plan of workspace.value.plans) {
    if (!plan.name.trim() || plan.name.length > 40) errors.value.push({ planId: plan.id, control: nameId(plan), message: '方案名称须为 1–40 字符' })
    for (const demand of plan.demands) {
      const fields = validateReserveDemand(demand).errors[demand.id] || {}
      for (const [field, message] of Object.entries(fields)) errors.value.push({ planId: plan.id, control: controlId(demand, isLegacy(demand) ? 'legacy' : field), message })
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
    apply(accept(response, account))
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
function adoptRemote() {
  apply(comparison.value); error.value = ''; notice.value = '已采用云端方案'
  nextTick(() => focusField(prefix + (activePlan.value ? '-plan' : '-new')))
}
watch(() => [props.accountId, props.game], load, { immediate: true, flush: 'sync' })
watch(dirty, value => { if (value) notice.value = '' })
watch(() => workspace.value?.active_plan_id, () => { confirmDelete.value = ''; confirmConvert.value = '' })
function beforeLeave(event) {
  if (!dirty.value) return
  event.preventDefault(); event.returnValue = ''
}
window.addEventListener('beforeunload', beforeLeave)
if (inject(matchedRouteKey, null)) onBeforeRouteLeave(() => !dirty.value || window.confirm('未来储备有未保存的修改，离开将丢失草稿。确定离开？'))
onBeforeUnmount(() => { session++; window.removeEventListener('beforeunload', beforeLeave) })
</script>

<style scoped>
.reserve-workspace { --reserve-line: color-mix(in srgb, var(--planner-line, var(--line)) 70%, transparent); min-width: 0; color: var(--ink); font: 14px/1.6 var(--font-b); container: reserve-workspace / inline-size; }
.reserve-workspace p { margin: 8px 0; overflow-wrap: anywhere; }
.reserve-workspace fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.reserve-workspace button, .reserve-workspace input { font: inherit; color: inherit; }
.reserve-workspace button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; padding: 7px 12px; border: 1px solid var(--planner-line, var(--line)); background: var(--surface); border-radius: 7px; white-space: normal; touch-action: manipulation; }
.reserve-workspace button:disabled { cursor: default; opacity: .6; }
.reserve-workspace .reserve-primary { background: var(--theme-control-bg, var(--accent-strong)); color: var(--on-strong); border-color: transparent; font-weight: 600; }
.reserve-workspace input { min-width: 0; width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid var(--planner-line, var(--line)); border-radius: 7px; background: var(--surface); }
.reserve-workspace :focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
.reserve-workspace [tabindex="-1"] { scroll-margin-block: 24px; }
.reserve-toolbar, .reserve-actions, .reserve-demand header, .reserve-save, .reserve-section-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.reserve-toolbar { margin: 0 0 12px; padding: 12px; border: 1px solid var(--reserve-line); border-radius: 10px; background: var(--cream); }
.reserve-plan-picker { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; flex: 1 1 100%; min-width: 0; }
.reserve-plan-picker > label { font-weight: 600; }
.reserve-plan-picker :deep(.planner-select-trigger) { min-height: 38px; padding: 6px 10px; font-size: 14px; font-weight: 400; }
.reserve-workspace .reserve-rename { padding: 8px; color: var(--ink-60); background: transparent; border-color: transparent; }
.reserve-workspace .reserve-delete { margin-left: auto; color: var(--theme-danger-text, var(--rouge)); background: transparent; border-color: transparent; }
.reserve-toolbar > input { flex: 1 1 180px; max-width: 420px; }
.reserve-save { min-width: 0; gap: 8px 12px; font-size: 13px; }
.reserve-save > span, .reserve-hint, .reserve-section-heading > span { color: var(--ink-60); }
.reserve-workspace .reserve-hint { font-size: 13px; }
.reserve-save .reserve-dirty { color: var(--theme-accent-text, var(--accent-strong)); }
.reserve-management { padding-bottom: 4px; }
.reserve-workspace .reserve-plan-note { margin: 0 0 12px; }
.reserve-body { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 12px; }
.reserve-targets, .reserve-totals { min-width: 0; padding: 16px; border: 1px solid var(--reserve-line); border-radius: 12px; background: var(--surface); }
.reserve-targets { container: reserve-targets / inline-size; }
.reserve-totals { container: reserve-results / inline-size; }
.reserve-section-heading, .reserve-demand header { justify-content: space-between; }
.reserve-section-heading h4 { display: flex; align-items: center; gap: 8px; font: 800 20px/1.4 var(--font-s); margin: 0; }
.reserve-section-heading svg { color: var(--planner-gold, var(--theme-accent-text, var(--accent-strong))); }
.reserve-section-heading > span { font-size: 13px; }
.reserve-workspace .reserve-section-description { margin: 4px 0 16px; }
.reserve-demand { margin: 12px 0; padding: 12px; border: 1px solid var(--reserve-line); border-radius: 10px; background: var(--cream); }
.reserve-demand header { margin-bottom: 10px; gap: 6px; }
.reserve-demand h5 { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font: 700 17px/1.4 var(--font-s); margin: 0; }
.reserve-target-number { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: var(--theme-control-bg, var(--accent-strong)); color: var(--on-strong); font: 600 15px/1 var(--font-d); }
.reserve-demand h5 small { color: var(--ink-60); font: 400 13px/1.5 var(--font-b); }
.reserve-workspace .reserve-remove { padding: 5px 8px; color: var(--theme-danger-text, var(--rouge)); border-color: transparent; background: transparent; font-size: 13px; }
.reserve-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px 16px; padding: 12px; background: var(--surface); border-radius: 8px; }
.reserve-field { min-width: 0; display: grid; align-content: start; gap: 4px; }
.reserve-field label { color: var(--ink); font-size: 13px; }
.reserve-field :deep(.planner-select) { width: 100%; min-width: 0; }
.reserve-field :deep(.planner-select-trigger) { width: 100%; min-height: 38px; padding: 6px 10px; font-size: 14px; font-weight: 400; }
.reserve-field input { min-height: 38px; font-size: 16px; font-variant-numeric: tabular-nums; }
.reserve-workspace .reserve-add-target { width: 100%; margin-top: 8px; padding: 9px 12px; border-style: dashed; background: var(--cream); color: var(--theme-accent-text, var(--accent-strong)); font-weight: 600; }
.reserve-workspace .reserve-empty { margin: 16px 0; color: var(--ink-60); }
.reserve-error { color: var(--theme-danger-text, var(--rouge)); }
.reserve-error a { color: inherit; }
.reserve-error-summary { margin-bottom: 16px; }
.reserve-conflict, .reserve-confirm { padding: 12px; border: 1px solid var(--planner-line, var(--line)); background: var(--cream); border-radius: 7px; margin: 12px 0; }
.reserve-remote { padding: 8px 0; }
.reserve-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
.reserve-metric { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 10px 12px; border: 1px solid var(--reserve-line); border-radius: 9px; background: var(--cream); }
.reserve-metric > svg { color: var(--planner-gold, var(--theme-accent-text, var(--accent-strong))); }
.reserve-metric p { min-width: 0; margin: 0; }
.reserve-metric span { display: block; font-size: 12px; font-weight: 600; }
.reserve-metrics strong { display: block; font: 700 22px/1.3 var(--font-d); font-variant-numeric: tabular-nums; }
.reserve-calculation-notes { padding-left: 20px; }
.reserve-table-scroll { max-width: 100%; overflow-x: auto; }
.reserve-totals table { width: 100%; border-collapse: collapse; }
.reserve-totals th, .reserve-totals td { padding: 4px 8px; border-bottom: 1px solid var(--reserve-line); line-height: 1.5; }
.reserve-totals th { text-align: left; font-weight: 600; }
.reserve-totals tbody th { font-weight: 400; }
.reserve-totals th:not(:first-child), .reserve-totals td { text-align: right; }
.reserve-totals td { font-family: var(--font-d); font-variant-numeric: tabular-nums; white-space: nowrap; }
.reserve-shortage { color: var(--theme-danger-text, var(--rouge)); font-weight: 600; }
.reserve-bottom-save { margin-top: 12px; justify-content: flex-end; }
.reserve-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@container reserve-targets (min-width: 340px) { .reserve-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container reserve-results (max-width: 359px) { .reserve-metrics { grid-template-columns: minmax(0, 1fr); } }
@container reserve-workspace (min-width: 820px) {
  .reserve-body { grid-template-columns: minmax(0, 1fr) minmax(0, .96fr); }
  .reserve-plan-picker { flex: 0 1 380px; }
  .reserve-save { flex: 1 1 260px; }
}
@container reserve-workspace (max-width: 479px) {
  .reserve-targets, .reserve-totals { padding: 12px; }
  .reserve-section-heading h4 { font-size: 18px; }
  .reserve-metric { gap: 8px; padding: 10px 8px; }
  .reserve-metric > svg { width: 20px; height: 20px; }
  .reserve-metrics strong { font-size: 18px; }
  .reserve-bottom-save { justify-content: flex-start; }
}
@media (hover: hover) { .reserve-workspace button:hover:not(:disabled) { border-color: var(--accent); } }
</style>
