<template>
  <PlannerSettingsPanel :open="opened" :title="'持续每日安排：' + item?.label" description="仅用于当前子账号的这份培养清单。每天固定占用体力并计入产出，直到主动修改或停用。" :dirty="true" :busy="busy" :error="localError" :save-disabled="disabled" :save-label="prepared ? '确认保存每日安排' : '预览每日安排'" @close="opened = false" @save="submit">
    <template v-if="item">
      <fieldset :disabled="busy || disabled">
      <p>每次 {{ item.costPer }} 体力<span v-for="(amount, id) in item.yield" :key="id"> · {{ resourceName(id) }} {{ amount }}</span></p>
      <button v-if="latest" type="button" class="daily-link" @click="useLatest">使用最新常用项目资料</button>
      <label class="daily-field"><span>从哪天起</span><input v-model="fromDate" type="date" :min="today" :max="lastDate" required /></label>
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
import PlannerSettingsPanel from './PlannerSettingsPanel.vue'
import { customSpendTemplate, customSpendRuleAt } from '../../data/customPlannerSpends.js'
const props = defineProps({ rules: Array, templates: Array, today: String, date: String, lastDate: String, contextKey: String, disabled: Boolean, resourceName: Function })
const emit = defineEmits(['preview', 'apply'])
const opened = ref(false), item = shallowRef(null), fromDate = ref(''), count = ref(1), enabled = ref(true), busy = ref(false), localError = ref(''), prepared = shallowRef(null)
const latest = computed(() => props.templates?.find(template => template.id === item.value?.id))
function open(entry) {
  const rule = props.rules?.find(rule => rule.id === entry.id), version = customSpendRuleAt(rule, props.date)
  item.value = version?.item ? { id: entry.id, ...version.item } : customSpendTemplate(entry)
  count.value = version?.item ? version.count : (entry.value ?? 1)
  fromDate.value = props.date >= props.today ? props.date : props.today
  enabled.value = version ? version.enabled : true; localError.value = ''; prepared.value = null; opened.value = true
}
function useLatest() { item.value = JSON.parse(JSON.stringify(latest.value)) }
function submit() {
  localError.value = ''
  if (!Number.isSafeInteger(count.value) || count.value < 0 || count.value > 9999 || fromDate.value < props.today || fromDate.value > props.lastDate) { localError.value = '请选择当前90天内的日期，并填写0至9999的整数次数'; return }
  const { id, ...snapshot } = item.value
  const request = { id, version: enabled.value ? { fromDate: fromDate.value, enabled: true, count: count.value, item: snapshot } : { fromDate: fromDate.value, enabled: false } }
  if (!prepared.value) {
    emit('preview', request, result => { if (result.error) localError.value = result.error; else prepared.value = result })
    return
  }
  busy.value = true
  const context = props.contextKey
  emit('apply', prepared.value, result => { if (context !== props.contextKey) return; busy.value = false; if (result?.error) { localError.value = result.error; prepared.value = null } else opened.value = false })
}
watch([item, fromDate, count, enabled], () => { prepared.value = null })
watch(() => props.contextKey, () => { opened.value = false; prepared.value = null; busy.value = false }, { flush: 'sync' })
defineExpose({ open })
</script>

<style scoped>
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.daily-field { display: grid; grid-template-columns: 1fr minmax(120px, 1fr); align-items: center; gap: 12px; margin: 16px 0; }
.daily-field input { width: 100%; min-width: 0; box-sizing: border-box; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; font-variant-numeric: tabular-nums; }
.daily-toggle { display: flex; align-items: center; gap: 8px; }
.daily-toggle input { accent-color: var(--accent); }
.daily-preview { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--line); }
.daily-link { border: 0; padding: 8px 0; background: none; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; font: inherit; cursor: pointer; }
input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
