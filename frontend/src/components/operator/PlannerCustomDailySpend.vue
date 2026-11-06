<template>
  <PlannerSettingsPanel :open="opened" :title="'持续每日安排：' + (item?.label || '新项目')" description="仅用于当前子账号的这份培养清单。按日期范围占用体力并计入产出；结束后恢复原安排，新项目到期停止。" :dirty="true" :busy="busy" :error="localError" :save-disabled="disabled" :save-label="prepared ? '确认保存每日安排' : '预览每日安排'" @close="opened = false" @save="submit">
    <template v-if="item">
      <fieldset :disabled="busy || disabled">
      <details v-if="savedVersions.length"><summary>已设置的日期安排</summary><button v-for="(version, index) in savedVersions" :key="version.fromDate" type="button" class="daily-link saved-period" :disabled="version.fromDate > lastDate || (savedVersions[index + 1]?.fromDate || '9999-12-31') <= today" @click="selectVersion(index)">{{ version.fromDate }} 起 · {{ version.enabled ? '每天 ' + version.count + ' 次' : '已停用' }}</button></details>
      <button v-if="!creating" type="button" class="daily-link" @click="creating = true">编辑项目内容</button>
      <template v-if="creating">
        <label class="daily-field"><span>从常用项目选择</span><select aria-label="选择常用支出" @change="chooseTemplate($event.target.value)"><option value="">新增自定义支出</option><option v-for="entry in templates" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select></label>
        <PlannerCustomEntry :entry="item" kind="spend" :index="0" :total="0" draft hide-count :resources="resources" :resource-name="resourceName"
          @change-name="item.label = item.name = $event.target.value" @change-cost="item.costPer = Number($event.target.value)"
          @change-yield="(id, event) => item.yield[id] = Number(event.target.value)" @add-yield="item.yield[$event] = 1" @remove-yield="delete item.yield[$event]" />
      </template>
      <p>每次 {{ item.costPer }} 体力<span v-for="(amount, id) in item.yield" :key="id"> · {{ resourceName(id) }} {{ amount }}</span></p>
      <button v-if="latest" type="button" class="daily-link" @click="useLatest">使用最新常用项目资料</button>
      <label class="daily-field"><span>从哪天起</span><input v-model="fromDate" type="date" :min="today" :max="lastDate" required /></label>
      <label class="daily-field"><span>结束日期（含当天）</span><input v-model="endDate" type="date" :min="fromDate" :max="lastDate" /></label>
      <p>结束日期留空表示持续生效。区间外已排规则和当天例外保留。</p>
      <label class="daily-field"><span>每天次数</span><input v-model.number="count" type="number" min="0" max="9999" step="1" required /></label>
      <label class="daily-toggle"><input v-model="enabled" type="checkbox" />启用每日安排</label>
      <p v-if="enabled">每天 {{ count }} 次，共 {{ Number(count) * item.costPer }} 体力<span v-for="(amount, id) in item.yield" :key="id"> · {{ resourceName(id) }} {{ Number(count) * amount }}</span></p>
      <p v-else>从所选日期起停用；已保存的历史与单日例外保留。</p>
      <div v-if="prepared" class="daily-preview" role="status">
        <p>已校验 {{ prepared.fromDate }} 至 {{ prepared.throughDate }}，体力预算可用。</p>
        <p>保留 {{ prepared.exceptions }} 个单日例外；接管 {{ prepared.takeovers }} 个同 ID 手工项目。</p>
        <p v-if="prepared.replacedVersions">将替换该项目 {{ prepared.replacedVersions }} 个已排的后续版本。</p>
        <p>本次只更新当前清单；90天外的体力来源变化将在更新日程时检查。</p>
      </div>
      </fieldset>
    </template>
  </PlannerSettingsPanel>
</template>

<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import PlannerCustomEntry from './PlannerCustomEntry.vue'
import { addCalendarDays } from '../../utils/businessDay.js'
import { createSpend } from '../../data/cultivationPlanner.js'
import { validPlannerDate } from '../../data/plannerRoutinePeriods.js'
import PlannerSettingsPanel from './PlannerSettingsPanel.vue'
import { customSpendTemplate, customSpendRuleAt } from '../../data/customPlannerSpends.js'
const props = defineProps({ rules: Array, templates: Array, today: String, date: String, lastDate: String, contextKey: String, disabled: Boolean, resourceName: Function, resources: Array })
const emit = defineEmits(['preview', 'apply'])
const creating = ref(false), endDate = ref('')
const opened = ref(false), item = ref(null), fromDate = ref(''), count = ref(1), enabled = ref(true), busy = ref(false), localError = ref(''), prepared = shallowRef(null)
const savedVersions = computed(() => props.rules?.find(rule => rule.id === item.value?.id)?.versions || [])
const latest = computed(() => props.templates?.find(template => template.id === item.value?.id))
function open(entry) {
  creating.value = !entry; endDate.value = ''
  entry ||= createSpend('custom', { name: '新每日支出', label: '新每日支出', yield: {} })
  const rule = props.rules?.find(rule => rule.id === entry.id), version = customSpendRuleAt(rule, props.date)
  item.value = version?.item ? { id: entry.id, ...version.item } : customSpendTemplate(entry)
  count.value = version?.item ? version.count : (entry.value ?? 1)
  fromDate.value = props.date >= props.today ? props.date : props.today
  enabled.value = version ? version.enabled : true; localError.value = ''; prepared.value = null; opened.value = true
}
function selectVersion(index) {
  const version = savedVersions.value[index], next = savedVersions.value[index + 1]
  fromDate.value = version.fromDate < props.today ? props.today : version.fromDate
  endDate.value = next ? addCalendarDays(next.fromDate, -1) : ''
  if (endDate.value > props.lastDate) endDate.value = props.lastDate
  enabled.value = version.enabled
  if (version.item) { item.value = { id: item.value.id, ...version.item }; count.value = version.count }
}
function chooseTemplate(id) { const selected = props.templates?.find(entry => entry.id === id); item.value = selected ? JSON.parse(JSON.stringify(selected)) : createSpend('custom', { name: '新每日支出', label: '新每日支出', yield: {} }); prepared.value = null }
function useLatest() { item.value = JSON.parse(JSON.stringify(latest.value)) }
function submit() {
  localError.value = ''
  if (!Number.isSafeInteger(count.value) || count.value < 0 || count.value > 9999 || fromDate.value < props.today || fromDate.value > props.lastDate || !validPlannerDate(fromDate.value) || endDate.value && (!validPlannerDate(endDate.value) || endDate.value < fromDate.value || endDate.value > props.lastDate)) { localError.value = '请选择当前90天内的日期，并填写0至9999的整数次数'; return }
  let snapshot, id
  try { ({ id, ...snapshot } = customSpendTemplate(item.value)) } catch (err) { localError.value = err.message; return }
  const request = { id, endDate: endDate.value, version: enabled.value ? { fromDate: fromDate.value, enabled: true, count: count.value, item: snapshot } : { fromDate: fromDate.value, enabled: false } }
  if (!prepared.value) {
    emit('preview', request, result => { if (result.error) localError.value = result.error; else prepared.value = result })
    return
  }
  busy.value = true
  const context = props.contextKey
  emit('apply', prepared.value, result => { if (context !== props.contextKey) return; busy.value = false; if (result?.error) { localError.value = result.error; prepared.value = null } else opened.value = false })
}
watch([item, fromDate, endDate, count, enabled], () => { prepared.value = null }, { deep: true })
watch(() => props.contextKey, () => { opened.value = false; prepared.value = null; busy.value = false }, { flush: 'sync' })
defineExpose({ open })
</script>

<style scoped>
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.saved-period { display: block; width: 100%; text-align: left; }
.daily-field { display: grid; grid-template-columns: 1fr minmax(120px, 1fr); align-items: center; gap: 12px; margin: 16px 0; }
.daily-field input { width: 100%; min-width: 0; box-sizing: border-box; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; font-variant-numeric: tabular-nums; }
.daily-toggle { display: flex; align-items: center; gap: 8px; }
.daily-toggle input { accent-color: var(--accent); }
.daily-preview { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--line); }
.daily-link { border: 0; padding: 8px 0; background: none; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; font: inherit; cursor: pointer; }
input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
