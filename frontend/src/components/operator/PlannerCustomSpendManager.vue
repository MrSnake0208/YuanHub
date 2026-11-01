<template>
  <PlannerSettingsPanel :open="opened" title="管理常用支出" description="同一大账号下所有子账号共享。修改模板仅影响以后添加的项目；移出列表不会停用已有每日安排。" :dirty="dirty" :busy="busy" :error="localError || error" :save-disabled="!!error" @close="opened = false" @save="save">
    <fieldset :disabled="busy">
    <p v-if="!drafts.length">还没有常用支出。添加后即可在支出列表直接选用。</p>
    <ul class="template-list">
      <li v-for="(item, index) in drafts" :key="item.id">
        <button type="button" :aria-pressed="selected === index" @click="selected = index">{{ item.name || item.label }}<small>每次 {{ item.costPer }} 体力</small></button>
        <button type="button" :aria-label="'移出常用列表：' + (item.name || item.label)" @click="remove(index)">移出</button>
      </li>
    </ul>
    <button type="button" class="template-action" :disabled="drafts.length >= 32 || busy" @click="add">添加常用支出</button>
    <PlannerCustomEntry v-if="selectedItem" :key="selectedItem.id" :entry="selectedItem" kind="spend" :index="selected" :total="0" draft hide-count :disabled="busy" :resources="resources" :resource-name="resourceName"
      @change-name="selectedItem.name = $event.target.value" @change-cost="selectedItem.costPer = number($event)"
      @change-yield="(id, event) => selectedItem.yield[id] = number(event)" @add-yield="selectedItem.yield[$event] = 1" @remove-yield="delete selectedItem.yield[$event]" />
    <div v-if="error" class="template-recovery"><button type="button" :disabled="busy" @click="recover('retry')">重试保存或读取</button><button type="button" :disabled="busy" @click="recover('discard')">放弃待保存内容并读取云端</button></div>
    </fieldset>
  </PlannerSettingsPanel>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import PlannerSettingsPanel from './PlannerSettingsPanel.vue'
import PlannerCustomEntry from './PlannerCustomEntry.vue'
import { createSpend } from '../../data/cultivationPlanner.js'
import { customSpendFromTemplate, validateCustomSpendTemplates } from '../../data/customPlannerSpends.js'
const props = defineProps({ templates: { type: Array, default: () => [] }, owner: String, busy: Boolean, error: String, resources: Array, resourceName: Function })
const emit = defineEmits(['save', 'retry', 'discard'])
const opened = ref(false), drafts = ref([]), baseline = ref(''), selected = ref(-1), localError = ref('')
const selectedItem = computed(() => drafts.value[selected.value])
const dirty = computed(() => JSON.stringify(drafts.value) !== baseline.value)
const number = event => event.target.value === '' ? NaN : Number(event.target.value)
function open(id) {
  drafts.value = props.templates.map(item => customSpendFromTemplate(item))
  baseline.value = JSON.stringify(drafts.value); selected.value = drafts.value.findIndex(item => item.id === id); localError.value = ''; opened.value = true
}
function add() { drafts.value.push(createSpend('custom', { name: '', label: '', yield: {} })); selected.value = drafts.value.length - 1 }
function remove(index) { drafts.value.splice(index, 1); selected.value = -1 }
function save() {
  localError.value = ''
  try {
    const items = validateCustomSpendTemplates(drafts.value)
    const owner = props.owner
    emit('save', items, ok => { if (owner !== props.owner) return; if (ok) opened.value = false; else localError.value = props.error || '尚未确认保存，请重试或读取云端配置' })
  } catch (err) { localError.value = err.message }
}
function recover(action) { const owner = props.owner; emit(action, ok => { if (ok && owner === props.owner) open() }) }
watch(() => props.owner, () => { opened.value = false; drafts.value = []; localError.value = '' }, { flush: 'sync' })
defineExpose({ open })
</script>

<style scoped>
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.template-list { margin: 0; padding: 0; list-style: none; }
.template-list li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.template-list button { border: 0; padding: 8px; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.template-list button:first-child { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.template-list small { display: block; font-size: 12px; color: var(--ink-60); }
.template-action, .template-recovery button { margin: 12px 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: default; }
.template-recovery { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
