<template>
  <div class="plan-heading">
    <h2 class="plan-title"><span>{{ activePlan.name }}</span><ChevronDown :size="18" aria-hidden="true" /><select :value="activePlan.id" :disabled="disabled" aria-label="切换培养计划" title="切换培养计划" @change="$emit('select', $event.target.value)"><option v-for="plan in plans" :key="plan.id" :value="plan.id">{{ plan.name }}</option></select></h2>
    <div class="plan-heading-actions">
      <button type="button" class="plan-icon" :disabled="disabled" aria-label="管理密探" title="管理密探" @click="openEditor(false)"><Users :size="17" aria-hidden="true" /></button>
      <button type="button" class="plan-icon" :disabled="disabled" aria-label="新建计划" title="新建计划" @click="openEditor(true)"><Plus :size="18" aria-hidden="true" /></button>
    </div>
  </div>
  <dialog ref="dialog" class="plan-dialog" aria-labelledby="plan-editor-title" @click="onBackdrop">
    <form @submit.prevent="save">
      <div class="plan-dialog-head"><h3 id="plan-editor-title">{{ creating ? '新建培养计划' : '管理培养清单' }}</h3><button type="button" aria-label="关闭" @click="dialog.close()"><X :size="18" aria-hidden="true" /></button></div>
      <label class="plan-field">清单名称<input ref="nameInput" v-model="name" maxlength="40" required :readonly="!creating && activePlan.source === 'favorites'" /></label>
      <label class="plan-field">查找密探<input v-model="search" type="search" autocomplete="off" placeholder="名称、属性或职业" /></label>
      <div class="plan-filters" role="group" aria-label="筛选密探">
        <div class="plan-filter-head"><span>筛选</span><button v-if="hasFilters" type="button" class="plan-filter-reset" @click="resetFilters">重置筛选</button></div>
        <div class="plan-filter-row">
          <span class="plan-filter-label">属性</span>
          <div class="plan-filter-options" role="group" aria-label="按属性筛选">
            <button v-for="option in profOptions" :key="option" type="button" :class="{ on: profFilter === option }" :aria-pressed="profFilter === option" @click="profFilter = option">{{ option === 'all' ? '全部' : option }}</button>
          </div>
        </div>
        <div class="plan-filter-row">
          <span class="plan-filter-label">职业</span>
          <div class="plan-filter-options" role="group" aria-label="按职业筛选">
            <button v-for="option in subProfOptions" :key="option" type="button" :class="{ on: subProfFilter === option }" :aria-pressed="subProfFilter === option" @click="subProfFilter = option">{{ option === 'all' ? '全部' : option }}</button>
          </div>
        </div>
        <div class="plan-filter-row">
          <span class="plan-filter-label">清单</span>
          <div class="plan-filter-options" role="group" aria-label="按清单状态筛选">
            <button v-for="option in selectionOptions" :key="option.value" type="button" :class="{ on: selectionFilter === option.value }" :aria-pressed="selectionFilter === option.value" @click="selectionFilter = option.value">{{ option.label }}</button>
          </div>
        </div>
      </div>
      <p class="plan-picker-note"><span>已选择 {{ selected.size }} 位</span><span class="plan-picker-result" aria-live="polite">显示 {{ filteredEntries.length }} / {{ props.catalogEntries.length }} 位</span><span class="plan-picker-sort-note">默认按实装倒序</span><span v-if="!creating && activePlan.source === 'favorites'"> · 清单随特别关注更新，移出清单不会取消星标。</span><span v-else> · 每个计划单独设置养成目标。</span></p>
      <p v-if="error" class="plan-picker-error" role="alert">{{ error }}</p>
      <div class="plan-candidates">
        <label v-for="entry in filteredEntries" :key="entry.id" class="plan-candidate" :class="{ selected: selected.has(entry.id) }">
          <input type="checkbox" :checked="selected.has(entry.id)" @change="toggle(entry.id)" />
          <OperatorAvatar :avatar="entry.avatar || ''" :name="entry.name || entry.id" :rarity="Number(entry.rarity) || 3" />
          <span><b>{{ entry.name || entry.id }}</b><small>{{ entry.prof }} · {{ Array.isArray(entry.subProf) ? entry.subProf.join('、') : entry.subProf }}</small></span>
        </label>
        <p v-if="!filteredEntries.length">没有找到密探</p>
      </div>
      <div class="plan-dialog-actions"><button v-if="!creating && activePlan.source === 'custom'" type="button" class="plan-delete" :disabled="disabled" @click="emit('remove'); dialog.close()">删除计划</button><button type="button" @click="dialog.close()">取消</button><button type="submit" :disabled="disabled || !name.trim()">{{ creating ? '创建计划' : '保存清单' }}</button></div>
    </form>
  </dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDown, Plus, Users, X } from '@lucide/vue'
import OperatorAvatar from './OperatorAvatar.vue'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { subProfOptions as deriveSubProfOptions, matchesProfSubFilter, tokens } from '../../utils/operatorFilters.js'
import { compareOperatorIdDesc } from '../../utils/operatorAdmin.js'
const props = defineProps({ plans: Array, activePlan: Object, memberIds: { type: Object, default: () => new Set() }, catalogEntries: { type: Array, default: () => [] }, accountId: String, disabled: Boolean, error: String })
const emit = defineEmits(['select', 'save', 'remove'])
const dialog = ref(null)
const nameInput = ref(null)
const creating = ref(false)
const name = ref('')
const search = ref('')
const profFilter = ref('all')
const subProfFilter = ref('all')
const selectionFilter = ref('all')
const selected = ref(new Set())
const selectionOptions = [{ value: 'all', label: '全部' }, { value: 'selected', label: '已选' }, { value: 'unselected', label: '未选' }]
const profOptions = computed(() => {
  const present = new Set(props.catalogEntries.flatMap(entry => tokens(entry.prof)))
  return ['all', ...AGENT_PROFS, ...[...present].filter(prof => !AGENT_PROFS.includes(prof))]
})
const subProfOptions = computed(() => ['all', ...deriveSubProfOptions(props.catalogEntries)])
const hasFilters = computed(() => Boolean(search.value.trim() || profFilter.value !== 'all' || subProfFilter.value !== 'all' || selectionFilter.value !== 'all'))
const filteredEntries = computed(() => {
  const query = search.value.trim().toLowerCase()
  return props.catalogEntries.filter(entry => {
    const searchable = [entry.name, entry.id, entry.prof, entry.subProf].join(' ').toLowerCase()
    if (query && !searchable.includes(query)) return false
    if (!matchesProfSubFilter(entry, profFilter.value, subProfFilter.value)) return false
    if (selectionFilter.value === 'selected' && !selected.value.has(entry.id)) return false
    if (selectionFilter.value === 'unselected' && selected.value.has(entry.id)) return false
    return true
  }).sort(compareOperatorIdDesc)
})
async function openEditor(isNew) {
  creating.value = isNew
  name.value = isNew ? '' : props.activePlan.name
  resetFilters()
  selected.value = isNew ? new Set() : new Set(props.memberIds)
  dialog.value.showModal()
  await nextTick()
  nameInput.value.focus()
}
function toggle(id) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next }
function resetFilters() { search.value = ''; profFilter.value = 'all'; subProfFilter.value = 'all'; selectionFilter.value = 'all' }
function save() {
  emit('save', { id: creating.value ? null : props.activePlan.id, name: name.value.trim(), operatorIds: [...selected.value] }, () => dialog.value.close())
}
function onBackdrop(event) {
  if (event.target !== dialog.value) return
  const box = dialog.value.getBoundingClientRect()
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.value.close()
}
watch(() => props.accountId, () => dialog.value?.close())
</script>

<style scoped>
.plan-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; min-width: 0; }
.plan-title { position: relative; display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; min-height: 44px; margin: 0; color: var(--ink); font: 900 25px/1.3 var(--font-s); letter-spacing: .02em; }
.plan-title > span { min-width: 0; overflow-wrap: anywhere; }.plan-title > svg { flex: none; color: var(--ink-60); }
.plan-title select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.plan-title:focus-within { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.plan-heading-actions { display: flex; gap: 4px; }
.plan-heading-actions .plan-icon { width: 44px; height: 44px; padding: 0; border-color: transparent; background: transparent; color: var(--ink-60); }
.plan-heading-actions .plan-icon:hover:not(:disabled) { background: var(--paper); color: var(--tea); }
.plan-dialog-actions .plan-delete { margin-right: auto; color: var(--rouge); background: transparent; }
button, select, input { font-family: var(--font-b); color: var(--ink); }
button, select { min-height: 40px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); }
button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; font-size: 12px; font-weight: 700; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-strong); }
:is(button, input, select):focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
:disabled { opacity: .55; cursor: wait; }
.plan-dialog { margin: auto; width: min(620px, calc(100vw - 32px)); max-height: calc(100dvh - 40px); overflow: auto; padding: 22px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: 0 20px 60px rgba(73,59,44,.25); }
.plan-dialog::backdrop { background: rgba(73,59,44,.36); }
.plan-dialog-head, .plan-dialog-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.plan-dialog-head h3 { font: 900 20px var(--font-s); }
.plan-field { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; font-size: 12px; font-weight: 700; }
.plan-field input { min-width: 0; width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); }
.plan-filters { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); }
.plan-filter-head { display: flex; align-items: center; justify-content: space-between; color: var(--tea); font-size: 11px; font-weight: 800; }
.plan-filter-reset { min-height: 30px; padding: 4px 8px; border: 0; background: transparent; color: var(--ink-60); font-size: 10px; }
.plan-filter-reset:hover:not(:disabled) { color: var(--accent-strong); }
.plan-filter-row { display: flex; align-items: flex-start; gap: 8px; }
.plan-filter-label { flex: 0 0 32px; padding-top: 8px; color: var(--tea); font-size: 11px; font-weight: 800; }
.plan-filter-options { display: flex; min-width: 0; flex: 1; flex-wrap: wrap; gap: 4px; }
.plan-filter-options button { min-height: 34px; padding: 6px 10px; border: 0; border-radius: 999px; background: rgba(73,59,44,.07); color: var(--ink-60); font-size: 11px; }
.plan-filter-options button:hover:not(:disabled) { color: var(--ink); }
.plan-filter-options button.on { background: var(--yellow); color: var(--ink); }
.plan-picker-note { display: flex; flex-wrap: wrap; gap: 0 8px; margin: 12px 0; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.plan-picker-result { color: var(--accent-strong); font-family: var(--font-d); font-weight: 800; }
.plan-picker-sort-note { color: var(--tea); font-weight: 700; }
.plan-picker-error { margin: 10px 0; color: var(--rouge); font-size: 12px; line-height: 1.6; }
.plan-candidates { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; max-height: 40dvh; overflow-y: auto; padding: 3px; }
.plan-candidates > p { grid-column: 1 / -1; padding: 12px 4px; color: var(--ink-60); font-size: 12px; text-align: center; }
.plan-candidate { position: relative; display: flex; min-width: 0; min-height: 92px; align-items: center; justify-content: center; gap: 5px; padding: 10px 6px 8px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; text-align: center; }
.plan-candidate.selected { border-color: var(--accent); background: var(--cream); }
.plan-candidate input { position: absolute; top: 7px; right: 7px; z-index: 1; width: 17px; height: 17px; accent-color: var(--accent-strong); }
.plan-candidate > span { display: block; width: 100%; min-width: 0; }
.plan-candidate b, .plan-candidate small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-candidate b { font-size: 12px; }
.plan-candidate small { color: var(--ink-60); font-size: 10px; }
:deep(.plan-candidate .operator-avatar) { width: 38px; height: 38px; border-radius: 9px; }
:deep(.plan-candidate .operator-avatar > span) { font-size: 17px; }
.plan-dialog-actions { margin-top: 16px; }
.plan-dialog-actions button[type=submit] { background: var(--tea); color: var(--cream); }
@media (max-width: 640px) {
  button, select { min-height: 44px; }
  .plan-dialog { padding: 16px; }
  .plan-filter-options button { min-height: 44px; padding-inline: 9px; }
  .plan-candidates { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .plan-candidate { min-height: 88px; }
}
</style>
