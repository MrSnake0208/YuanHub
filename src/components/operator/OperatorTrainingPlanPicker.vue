<template>
  <div class="plan-toolbar">
    <label class="plan-select">培养清单<select :value="activePlan.id" :disabled="disabled" @change="$emit('select', $event.target.value)"><option v-for="plan in plans" :key="plan.id" :value="plan.id">{{ plan.name }}</option></select></label>
    <button type="button" :disabled="disabled" @click="openEditor(false)"><Users :size="14" aria-hidden="true" />管理密探</button>
    <button type="button" :disabled="disabled" @click="openEditor(true)"><Plus :size="14" aria-hidden="true" />新建计划</button>
    <button v-if="activePlan.source === 'custom'" type="button" :disabled="disabled" @click="$emit('remove')">删除计划</button>
  </div>
  <dialog ref="dialog" class="plan-dialog" aria-labelledby="plan-editor-title" @click="onBackdrop">
    <form @submit.prevent="save">
      <div class="plan-dialog-head"><h3 id="plan-editor-title">{{ creating ? '新建培养计划' : '管理培养清单' }}</h3><button type="button" aria-label="关闭" @click="dialog.close()"><X :size="18" aria-hidden="true" /></button></div>
      <label class="plan-field">清单名称<input ref="nameInput" v-model="name" maxlength="40" required :readonly="!creating && activePlan.source === 'favorites'" /></label>
      <label class="plan-field">查找密探<input v-model="search" type="search" placeholder="名称、属性或职业" /></label>
      <p class="plan-picker-note">已选择 {{ selected.size }} 位<span v-if="!creating && activePlan.source === 'favorites'"> · 清单随特别关注更新，移出清单不会取消星标。</span><span v-else> · 每个计划单独设置养成目标。</span></p>
      <p v-if="error" class="plan-picker-error" role="alert">{{ error }}</p>
      <div class="plan-candidates">
        <label v-for="entry in filteredEntries" :key="entry.id" class="plan-candidate" :class="{ selected: selected.has(entry.id) }">
          <input type="checkbox" :checked="selected.has(entry.id)" @change="toggle(entry.id)" />
          <OperatorAvatar :avatar="entry.avatar || ''" :name="entry.name || entry.id" :rarity="Number(entry.rarity) || 3" />
          <span><b>{{ entry.name || entry.id }}</b><small>{{ entry.prof }} · {{ Array.isArray(entry.subProf) ? entry.subProf.join('、') : entry.subProf }}</small></span>
        </label>
        <p v-if="!filteredEntries.length">没有找到密探</p>
      </div>
      <div class="plan-dialog-actions"><button type="button" @click="dialog.close()">取消</button><button type="submit" :disabled="!name.trim()">{{ creating ? '创建计划' : '保存清单' }}</button></div>
    </form>
  </dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Plus, Users, X } from '@lucide/vue'
import OperatorAvatar from './OperatorAvatar.vue'
const props = defineProps({ plans: Array, activePlan: Object, memberIds: Object, catalogEntries: Array, accountId: String, disabled: Boolean, error: String })
const emit = defineEmits(['select', 'save', 'remove'])
const dialog = ref(null)
const nameInput = ref(null)
const creating = ref(false)
const name = ref('')
const search = ref('')
const selected = ref(new Set())
const filteredEntries = computed(() => props.catalogEntries.filter(entry => [entry.name, entry.id, entry.prof, entry.subProf].join(' ').toLowerCase().includes(search.value.trim().toLowerCase())))
async function openEditor(isNew) {
  creating.value = isNew
  name.value = isNew ? '' : props.activePlan.name
  search.value = ''
  selected.value = isNew ? new Set() : new Set(props.memberIds)
  dialog.value.showModal()
  await nextTick()
  nameInput.value.focus()
}
function toggle(id) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next }
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
.plan-toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin: 18px 0 8px; }
.plan-select { display: flex; flex: 1; min-width: 160px; flex-direction: column; gap: 5px; color: var(--ink-60); font-size: 12px; font-weight: 700; }
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
.plan-picker-note { margin: 12px 0; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.plan-picker-error { margin: 10px 0; color: var(--rouge); font-size: 12px; line-height: 1.6; }
.plan-candidates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; max-height: 40dvh; overflow-y: auto; padding: 3px; }
.plan-candidate { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 9px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.plan-candidate.selected { border-color: var(--accent); background: var(--cream); }
.plan-candidate input { flex: none; accent-color: var(--accent-strong); width: 16px; height: 16px; }
.plan-candidate > span { min-width: 0; }
.plan-candidate b { display: block; font-size: 13px; overflow-wrap: anywhere; }
.plan-candidate small { display: block; color: var(--ink-60); font-size: 11px; }
.plan-dialog-actions { margin-top: 16px; }
.plan-dialog-actions button[type=submit] { background: var(--tea); color: var(--cream); }
@media (max-width: 640px) { button, select { min-height: 44px; } .plan-dialog { padding: 16px; } .plan-candidates { grid-template-columns: minmax(0, 1fr); } }
</style>
