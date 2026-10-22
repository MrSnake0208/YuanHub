<template>
  <div class="plan-heading">
    <div class="plan-identity">
      <div v-if="activePlan" ref="planSwitcher" class="plan-switcher" @focusout="onSwitcherFocusout">
        <h2 class="plan-title"><button ref="switcherTrigger" type="button" class="plan-title-trigger" :disabled="disabled" aria-haspopup="menu" :aria-expanded="switcherOpen" aria-controls="plan-switcher-menu" @click="toggleSwitcher" @keydown.down.prevent="openSwitcher(true)" @keydown.esc.prevent="closeSwitcher"><span>{{ activePlan.name }}</span><ChevronDown :size="18" :class="{ open: switcherOpen }" aria-hidden="true" /></button></h2>
        <div v-if="switcherOpen" id="plan-switcher-menu" ref="switcherMenu" class="plan-switcher-menu" role="menu" aria-label="切换培养清单" @keydown="onSwitcherKeydown">
          <button v-for="plan in plans" :key="plan.id" type="button" role="menuitemradio" :aria-checked="plan.id === activePlan.id" :class="{ active: plan.id === activePlan.id }" @pointerdown.prevent @click="selectPlan(plan.id)"><span class="plan-switcher-check"><Check v-if="plan.id === activePlan.id" :size="14" aria-hidden="true" /></span><span>{{ plan.name }}</span></button>
        </div>
      </div>
      <h2 v-else class="plan-title plan-title-empty">尚未建立培养清单</h2>
      <p v-if="activePlan" class="plan-source-note">{{ activePlan.source === 'favorites' ? '随特别关注同步，也可添加其他密探' : '手动管理成员，各清单独立保存养成目标' }}</p>
    </div>
    <div class="plan-heading-actions">
      <button v-if="activePlan" type="button" class="plan-member-add" :disabled="disabled" aria-haspopup="dialog" @click="openMemberPicker"><Users :size="16" aria-hidden="true" />添加密探</button>
      <button type="button" class="plan-text-action" :disabled="disabled" aria-haspopup="dialog" @click="openEditor(true)"><Plus :size="16" aria-hidden="true" />新建清单</button>
      <button v-if="activePlan" type="button" class="plan-text-action" :disabled="disabled" aria-label="管理清单" aria-haspopup="dialog" @click="openEditor(false)"><Pencil :size="15" aria-hidden="true" />管理清单</button>
      <slot name="actions" />
    </div>
  </div>
  <dialog ref="dialog" class="plan-dialog" aria-labelledby="plan-editor-title" @click="onBackdrop" @close="resetTransientState">
    <form class="plan-dialog-shell" :class="{ 'is-adding': addingMembers }" @submit.prevent="save">
      <header class="plan-dialog-head">
        <div class="plan-dialog-identity">
          <span class="plan-dialog-mark" aria-hidden="true"><Users :size="17" /></span>
          <div><h3 id="plan-editor-title" ref="dialogTitle" tabindex="-1" :autofocus="addingMembers">{{ addingMembers ? '添加密探' : creating ? '建立培养清单' : '编辑培养清单' }}</h3></div>
        </div>
        <div class="plan-dialog-head-actions"><button type="button" class="plan-dialog-close" aria-label="关闭" title="关闭" @click="dialog.close()"><X :size="19" aria-hidden="true" /></button></div>
      </header>

      <div class="plan-dialog-body">
        <p v-if="addingMembers" class="plan-picker-help">添加到「{{ name }}」<small>不会改变特别关注或养成状态</small></p>
        <p v-else class="plan-picker-help">选择要培养的密探，可按「养成中」筛选。保存成员不会改变特别关注或养成状态。</p>
        <section v-if="confirmingDelete && activePlan" class="plan-delete-confirm" role="alert" aria-labelledby="plan-delete-title">
          <div class="plan-delete-copy"><span aria-hidden="true"><Trash2 :size="17" /></span><div><b id="plan-delete-title">删除「{{ activePlan.name }}」？</b><p>{{ editingFavorites ? '这张清单将从养成规划移除，不会取消已标记的特别关注。' : '清单及其单独保存的养成目标将被删除。' }}删除后仍可在页面提示中撤销。</p></div></div>
          <div><button type="button" :disabled="disabled" @click="confirmingDelete = false">保留清单</button><button ref="deleteConfirm" type="button" class="plan-delete-danger" :disabled="disabled" @click="confirmDelete">确认删除</button></div>
        </section>

        <fieldset v-if="firstPlanSuggestion" class="plan-source-choice">
          <legend>第一张清单</legend>
          <label :class="{ selected: firstPlanMode === 'favorites' }"><input ref="sourceFirstInput" v-model="firstPlanMode" name="first-plan-source" type="radio" value="favorites" @change="applyFirstPlanMode" /><span><b>根据特别关注</b><small>预选 {{ validFavoriteIds.length }} 位，以后会自动跟随关注名单</small></span></label>
          <label :class="{ selected: firstPlanMode === 'custom' }"><input v-model="firstPlanMode" name="first-plan-source" type="radio" value="custom" @change="applyFirstPlanMode" /><span><b>空白清单</b><small>自行命名并挑选成员</small></span></label>
        </fieldset>

        <div class="plan-name-row" v-if="!addingMembers">
          <label class="plan-name-field" for="plan-name-input">
            <span class="plan-name-meta"><b>清单名称</b><small v-if="editingFavorites">动态跟随特别关注</small><small v-else>各清单独立保存养成目标</small></span>
            <span class="plan-name-control"><PenLine :size="15" aria-hidden="true" /><input id="plan-name-input" ref="nameInput" v-model="name" maxlength="40" required :readonly="editingFavorites" /></span>
          </label>
          <button v-if="!creating && activePlan && !confirmingDelete" type="button" class="plan-inline-delete" :disabled="disabled" @click="requestDelete"><Trash2 :size="15" aria-hidden="true" />删除清单</button>
        </div>

        <div class="plan-toolbar">
          <label class="plan-search" for="plan-search-input"><Search :size="16" aria-hidden="true" /><span class="sr-only">搜索密探名称、拼音或首字母</span><input id="plan-search-input" ref="searchInput" v-model="search" type="search" autocomplete="off" placeholder="搜索名称 / 拼音" /></label>
          <button type="button" class="plan-filter-toggle" :class="{ on: filtersOpen }" :aria-expanded="filtersOpen" aria-controls="plan-advanced-filters" @click="filtersOpen = !filtersOpen"><SlidersHorizontal :size="15" aria-hidden="true" />筛选<span v-if="advancedFilterCount">{{ advancedFilterCount }}</span></button>
        </div>

        <div class="plan-selection-tabs" role="group" aria-label="按成员与养成状态筛选">
          <button v-for="option in selectionOptions" :key="option.value" type="button" :class="{ on: selectionFilter === option.value }" :aria-pressed="selectionFilter === option.value" @click="selectionFilter = option.value">{{ option.label }}<span>{{ selectionCount(option.value) }}</span></button>
        </div>

        <section v-if="filtersOpen" id="plan-advanced-filters" class="plan-filters" aria-label="品质、属性与职业筛选">
          <div class="plan-filter-head"><span>精细筛选</span><button v-if="hasAdvancedFilters" type="button" class="plan-filter-reset" @click="resetAdvancedFilters">清除</button></div>
          <div class="plan-filter-row"><span class="plan-filter-label">品质</span><div class="plan-filter-options" role="group" aria-label="按品质筛选"><button v-for="option in rarityOptions" :key="option.value" type="button" class="rarity-option" :class="[option.value === 'all' ? '' : 'rarity-r' + option.value, { on: rarityFilter === option.value }]" :aria-pressed="rarityFilter === option.value" @click="rarityFilter = option.value">{{ option.label }}</button></div></div>
          <div class="plan-filter-row"><span class="plan-filter-label">属性</span><div class="plan-filter-options" role="group" aria-label="按属性筛选"><button v-for="option in profOptions" :key="option" type="button" :class="{ on: profFilter === option }" :aria-pressed="profFilter === option" @click="profFilter = option">{{ option === 'all' ? '全部' : option }}</button></div></div>
          <div class="plan-filter-row"><span class="plan-filter-label">职业</span><div class="plan-filter-options" role="group" aria-label="按职业筛选"><button v-for="option in subProfOptions" :key="option" type="button" :class="{ on: subProfFilter === option }" :aria-pressed="subProfFilter === option" @click="subProfFilter = option">{{ option === 'all' ? '全部' : option }}</button></div></div>
        </section>

        <div class="plan-roster-meta">
          <p v-if="invalidSelectedCount" class="plan-picker-invalid">保存时将清理 {{ invalidSelectedCount }} 位已失效密探</p>
        </div>
        <p v-if="error" class="plan-picker-error" role="alert">{{ error }}</p>

        <div class="plan-candidates">
          <label v-for="entry in filteredEntries" :key="entry.id" class="plan-candidate" :class="{ selected: selected.has(entry.id) }">
            <input type="checkbox" :checked="selected.has(entry.id)" :disabled="addingMembers && memberIds.has(entry.id)" :aria-label="addingMembers && memberIds.has(entry.id) ? (entry.name || entry.id) + '，已在清单中' : undefined" @change="toggle(entry.id)" />
            <span class="plan-candidate-avatar">
              <OperatorAvatar :avatar="entry.avatar || ''" :name="entry.name || entry.id" :rarity="Number(entry.rarity) || 3" />
              <img v-if="profIcon(entry.prof)" class="plan-candidate-prof" :src="profIcon(entry.prof)" alt="" aria-hidden="true" />
            </span>
            <span class="plan-candidate-copy">
              <span class="plan-candidate-name" :class="{ 'is-three-plus': candidateNameLength(entry) >= 3 }">
                <span class="plan-candidate-status-mark" :class="['is-' + growthStatus(entry), { 'is-favorite': favoriteIds.has(entry.id) }]" role="img" :aria-label="'养成状态：' + growthStatusLabel(entry) + (favoriteIds.has(entry.id) ? '，特别关注' : '')" :title="growthStatusLabel(entry) + (favoriteIds.has(entry.id) ? ' · 特别关注' : '')"><Star v-if="favoriteIds.has(entry.id)" :size="10" fill="currentColor" aria-hidden="true" /></span>
                <b>{{ entry.name || entry.id }}</b>
                <span v-if="favoriteIds.has(entry.id)" class="plan-candidate-favorite" role="img" aria-label="特别关注" title="特别关注"><Star :size="11" fill="currentColor" aria-hidden="true" /></span>
              </span>
              <span class="plan-candidate-labels">
                <span class="plan-candidate-label profession">{{ professionLabel(entry) }}</span>
                <span class="plan-candidate-label status" :class="'is-' + growthStatus(entry)">{{ growthStatusLabel(entry) }}</span>
              </span>
            </span>
            <Check v-if="selected.has(entry.id)" class="plan-selected-check" :size="12" aria-hidden="true" />
          </label>
          <p v-if="!filteredEntries.length">{{ selectionFilter === 'growing' ? '当前筛选下没有已拥有的养成中密探，可切换「全部」或调整搜索条件。' : '当前筛选下没有密探' }}</p>
        </div>
      </div>

      <footer v-if="!confirmingDelete" class="plan-dialog-actions">
        <p aria-live="polite"><strong>{{ addingMembers ? addedMemberCount : validSelectedCount }}</strong> {{ addingMembers ? '位新增' : '位已选' }}<span v-if="editingFavorites && !addingMembers">· 移出不会取消特别关注</span></p>
        <div><button type="button" class="plan-cancel" @click="dialog.close()">取消</button><button type="submit" :disabled="disabled || !name.trim() || (addingMembers && !addedMemberCount)">{{ addingMembers ? `添加 ${addedMemberCount} 位密探` : creating ? '创建清单' : '保存更改' }}</button></div>
      </footer>
    </form>
  </dialog>
</template>

<script setup>
import { matchesOperatorQuality } from "../../utils/operatorForms.js";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, ChevronDown, Pencil, PenLine, Plus, Search, SlidersHorizontal, Star, Trash2, Users, X } from '@lucide/vue'
import OperatorAvatar from './OperatorAvatar.vue'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { OPERATOR_RARITY_OPTIONS, subProfList, subProfOptions as deriveSubProfOptions, matchesOperatorSearch, matchesProfSubFilter, isOperatorOwned, tokens } from '../../utils/operatorFilters.js'
import { operatorAnnotationStatus, operatorAnnotationStatusLabel } from '../../utils/operatorAnnotations.js'
import { compareOperatorIdDesc } from '../../utils/operatorAdmin.js'
const props = defineProps({ plans: { type: Array, default: () => [] }, activePlan: { type: Object, default: null }, memberIds: { type: Object, default: () => new Set() }, favoriteIds: { type: Object, default: () => new Set() }, catalogEntries: { type: Array, default: () => [] }, currentEntries: { type: Array, default: () => [] }, growthStates: { type: Object, default: () => ({}) }, accountId: String, disabled: Boolean, error: String })
const emit = defineEmits(['select', 'save', 'remove'])
const dialog = ref(null)
const dialogTitle = ref(null)
const planSwitcher = ref(null)
const switcherTrigger = ref(null)
const switcherMenu = ref(null)
const nameInput = ref(null)
const searchInput = ref(null)
const sourceFirstInput = ref(null)
const deleteConfirm = ref(null)
const creating = ref(false)
const addingMembers = ref(false)
const name = ref('')
const search = ref('')
const rarityFilter = ref('all')
const profFilter = ref('all')
const subProfFilter = ref('all')
const selectionFilter = ref('all')
const selected = ref(new Set())
const firstPlanMode = ref('favorites')
const firstPlanSuggestion = ref(false)
const confirmingDelete = ref(false)
const filtersOpen = ref(false)
const switcherOpen = ref(false)
const selectionOptions = [{ value: 'all', label: '全部' }, { value: 'growing', label: '养成中' }, { value: 'selected', label: '已选' }, { value: 'unselected', label: '未选' }]
const rarityOptions = OPERATOR_RARITY_OPTIONS
const PROF_ICON_FILES = Object.freeze({ 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' })
const catalogIds = computed(() => new Set(props.catalogEntries.map(entry => entry.id).filter(Boolean)))
const validFavoriteIds = computed(() => [...props.favoriteIds].filter(id => catalogIds.value.has(id)))
const growingIds = computed(() => new Set(props.currentEntries.filter(entry => catalogIds.value.has(entry.id) && isOperatorOwned(entry) && growthStatus(entry) === 'growing').map(entry => entry.id)))
const validSelectedCount = computed(() => [...selected.value].filter(id => catalogIds.value.has(id)).length)
const addedMemberCount = computed(() => [...selected.value].filter(id => catalogIds.value.has(id) && !props.memberIds.has(id)).length)
const invalidSelectedCount = computed(() => selected.value.size - validSelectedCount.value)
const editingFavorites = computed(() => (!creating.value && props.activePlan?.source === 'favorites') || (firstPlanSuggestion.value && firstPlanMode.value === 'favorites'))
const hasAdvancedFilters = computed(() => rarityFilter.value !== 'all' || profFilter.value !== 'all' || subProfFilter.value !== 'all')
const advancedFilterCount = computed(() => Number(rarityFilter.value !== 'all') + Number(profFilter.value !== 'all') + Number(subProfFilter.value !== 'all'))
const profOptions = computed(() => {
  const present = new Set(props.catalogEntries.flatMap(entry => tokens(entry.prof)))
  return ['all', ...AGENT_PROFS, ...[...present].filter(prof => !AGENT_PROFS.includes(prof))]
})
const subProfOptions = computed(() => ['all', ...deriveSubProfOptions(props.catalogEntries)])
function selectionCount(value) {
  if (value === 'growing') return growingIds.value.size
  if (value === 'selected') return validSelectedCount.value
  if (value === 'unselected') return Math.max(0, props.catalogEntries.length - validSelectedCount.value)
  return props.catalogEntries.length
}
async function openSwitcher(focusMenu = false) {
  if (props.disabled) return
  switcherOpen.value = true
  if (!focusMenu) return
  await nextTick()
  const items = [...(switcherMenu.value?.querySelectorAll('[role="menuitemradio"]') || [])]
  ;(items.find(item => item.getAttribute('aria-checked') === 'true') || items[0])?.focus()
}
function closeSwitcher(restoreFocus = false) {
  switcherOpen.value = false
  if (restoreFocus) nextTick(() => switcherTrigger.value?.focus())
}
function toggleSwitcher() { switcherOpen.value ? closeSwitcher() : openSwitcher(false) }
function selectPlan(id) {
  if (id !== props.activePlan?.id) emit('select', id)
  closeSwitcher(true)
}
function onSwitcherKeydown(event) {
  const items = [...(switcherMenu.value?.querySelectorAll('[role="menuitemradio"]') || [])]
  const current = items.indexOf(document.activeElement)
  if (event.key === 'Escape') { event.preventDefault(); closeSwitcher(true); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return
  event.preventDefault()
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length
  items[index]?.focus()
}
function onSwitcherFocusout() { nextTick(() => { if (!planSwitcher.value?.contains(document.activeElement)) closeSwitcher() }) }
function onDocumentPointerDown(event) { if (switcherOpen.value && !planSwitcher.value?.contains(event.target)) closeSwitcher() }
function profIcon(value) {
  const prof = tokens(Array.isArray(value) ? value[0] : String(value || '').split(/[\/／+＋]/)[0])[0]
  const file = PROF_ICON_FILES[prof]
  return file ? (import.meta.env.BASE_URL || '/') + 'assets/prof-icons/' + file : ''
}
function professionLabel(entry) {
  const values = subProfList(entry)
  return values.length ? values.join('、') : '职业待补'
}
function candidateNameLength(entry) {
  return Array.from(String(entry?.name || entry?.id || '')).length
}
function growthStatus(entry) {
  const growth = entry?.growth && typeof entry.growth === 'object' ? entry.growth : {}
  const raw = props.growthStates?.[entry?.id] || growth.growth_state || growth.growthState || entry?.growth_state || entry?.growthState || 'growing'
  return operatorAnnotationStatus(raw)
}
function growthStatusLabel(entry) {
  return operatorAnnotationStatusLabel(growthStatus(entry))
}
const filteredEntries = computed(() => {
  return props.catalogEntries.filter(entry => {
    if (!matchesOperatorSearch(entry, search.value)) return false
    if (!matchesOperatorQuality(entry, rarityFilter.value)) return false
    if (!matchesProfSubFilter(entry, profFilter.value, subProfFilter.value)) return false
    if (selectionFilter.value === 'growing' && !growingIds.value.has(entry.id)) return false
    if (selectionFilter.value === 'selected' && !selected.value.has(entry.id)) return false
    if (selectionFilter.value === 'unselected' && selected.value.has(entry.id)) return false
    return true
  }).sort(compareOperatorIdDesc)
})
async function openEditor(isNew, { selectNewMembers = false } = {}) {
  if (props.disabled) return
  const openingAccountId = props.accountId
  creating.value = isNew
  addingMembers.value = selectNewMembers
  firstPlanSuggestion.value = isNew && !props.plans.length
  firstPlanMode.value = firstPlanSuggestion.value ? 'favorites' : 'custom'
  name.value = isNew ? (firstPlanMode.value === 'favorites' ? '特别关注' : '') : props.activePlan?.name || ''
  resetFilters()
  if (selectNewMembers) selectionFilter.value = 'unselected'
  selected.value = isNew ? new Set(firstPlanMode.value === 'favorites' ? validFavoriteIds.value : []) : new Set(props.memberIds)
  confirmingDelete.value = false
  filtersOpen.value = false
  await nextTick()
  if (!dialog.value || props.accountId !== openingAccountId || props.disabled) return
  dialog.value.showModal()
  if (selectNewMembers && window.matchMedia?.('(max-width: 700px)').matches) dialogTitle.value?.focus()
  else if (firstPlanSuggestion.value) sourceFirstInput.value?.focus()
  else if (selectNewMembers || editingFavorites.value) searchInput.value?.focus()
  else nameInput.value?.focus()
}
function openMemberPicker() {
  if (!props.activePlan) return
  return openEditor(false, { selectNewMembers: true })
}
defineExpose({ openMemberPicker })
function toggle(id) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next }
function resetFilters() { search.value = ''; rarityFilter.value = 'all'; profFilter.value = 'all'; subProfFilter.value = 'all'; selectionFilter.value = 'all' }
function resetAdvancedFilters() { rarityFilter.value = 'all'; profFilter.value = 'all'; subProfFilter.value = 'all' }
function applyFirstPlanMode() {
  const favorites = firstPlanMode.value === 'favorites'
  name.value = favorites ? '特别关注' : ''
  selected.value = new Set(favorites ? validFavoriteIds.value : [])
  nextTick(() => (favorites ? searchInput.value : nameInput.value)?.focus())
}
function save() {
  if (addingMembers.value && !addedMemberCount.value) return
  const id = creating.value ? null : props.activePlan?.id
  if (!creating.value && !id) return
  emit('save', { id, name: name.value.trim(), source: editingFavorites.value ? 'favorites' : 'custom', operatorIds: [...selected.value] }, () => dialog.value.close())
}
async function requestDelete() { confirmingDelete.value = true; await nextTick(); deleteConfirm.value?.focus() }
function confirmDelete() { emit('remove', () => dialog.value.close()) }
function resetTransientState() { confirmingDelete.value = false; filtersOpen.value = false }
function onBackdrop(event) {
  if (event.target !== dialog.value) return
  const box = dialog.value.getBoundingClientRect()
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.value.close()
}
watch(() => props.accountId, () => { closeSwitcher(); dialog.value?.close() })
onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.plan-title { color: var(--ink); }
.plan-title-trigger { border: 0; border-radius: 8px; background: transparent; color: inherit; }
.plan-title-trigger:hover:not(:disabled) { background: color-mix(in srgb, var(--paper) 62%, transparent); color: var(--ink); }
.plan-title-trigger > svg { color: var(--ink-60); transition: transform 160ms ease; }
.plan-switcher-menu { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 16px 38px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.2); }
.plan-switcher-menu button { border: 0; border-radius: 8px; background: transparent; color: var(--ink-60); }
.plan-switcher-menu button:hover, .plan-switcher-menu button:focus-visible { background: var(--cream); color: var(--ink); }
.plan-switcher-menu button.active { background: color-mix(in srgb, var(--yellow) 24%, var(--surface)); color: var(--theme-strong-text, var(--tea)); }
.plan-switcher-check { color: var(--theme-accent-text, var(--accent-strong)); }
.plan-title-empty { color: var(--ink-60); }
.plan-source-note, .plan-picker-help { color: var(--ink-60); }
.plan-member-add { border-color: var(--tea); background: var(--tea); color: var(--on-strong); }
.plan-member-add:hover:not(:disabled) { border-color: var(--ink); background: var(--theme-control-bg, var(--ink)); color: var(--on-strong); }
.plan-text-action { border-color: transparent; background: transparent; color: var(--ink-60); }
.plan-text-action:hover:not(:disabled) { background: var(--paper); color: var(--theme-strong-text, var(--tea)); }
button, select, input { color: var(--ink); }
button, select { border: 1px solid var(--line); border-radius: 9px; background: var(--cream); }
button { cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); }
:is(button, input, select, summary):focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
:disabled { opacity: .55; cursor: wait; }

.plan-dialog { border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: 0 24px 70px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.28); }
.plan-dialog::backdrop { background: var(--theme-wash-strong, rgba(73,59,44,.38)); backdrop-filter: blur(2px); }
.plan-dialog-head { border-bottom: 1px solid var(--line); background: linear-gradient(105deg, color-mix(in srgb, var(--yellow) 18%, var(--surface)), var(--surface) 58%); border-radius: 18px 18px 0 0; }
.plan-dialog-mark { border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 10px; background: var(--cream); color: var(--theme-accent-text, var(--accent-strong)); }
.plan-dialog-kicker { color: var(--ink-60); }
.plan-dialog-close { border: 0; border-radius: 10px; background: transparent; color: var(--ink-60); cursor: pointer; }
.plan-dialog-close:hover { background: var(--theme-wash, rgba(73,59,44,.07)); color: var(--ink); }
.plan-delete-confirm { border: 1px solid color-mix(in srgb, var(--rouge) 38%, var(--line)); border-radius: 11px; background: color-mix(in srgb, var(--rouge) 6%, var(--surface)); }
.plan-delete-copy > span { border-radius: 8px; background: color-mix(in srgb, var(--rouge) 10%, var(--surface)); color: var(--theme-danger-text, var(--rouge)); }
.plan-delete-copy p { color: var(--ink-60); }
.plan-delete-confirm .plan-delete-danger { border-color: var(--rouge); background: var(--rouge); color: var(--on-strong); }

.plan-source-choice { border: 1px solid var(--line); border-radius: 12px; }
.plan-source-choice legend { color: var(--theme-strong-text, var(--tea)); }
.plan-source-choice label { border: 1px solid transparent; border-radius: 9px; background: color-mix(in srgb, var(--cream) 72%, var(--surface)); cursor: pointer; }
.plan-source-choice label.selected { border-color: var(--accent); background: color-mix(in srgb, var(--yellow) 26%, var(--surface)); }
.plan-source-choice input { accent-color: var(--accent-strong); }
.plan-source-choice small { color: var(--ink-60); }

.plan-name-row { border: 1px solid var(--line); border-radius: 11px; background: color-mix(in srgb, var(--cream) 58%, var(--surface)); }
.plan-name-meta small { color: var(--ink-60); }
.plan-name-control > svg { color: var(--theme-strong-text, var(--tea)); pointer-events: none; }
.plan-name-control input { border: 1.5px solid color-mix(in srgb, var(--tea) 48%, var(--line)); border-radius: 9px; background: var(--surface); box-shadow: inset 0 1px 2px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.06); }
.plan-name-control input:hover:not([readonly]) { border-color: var(--tea); }
.plan-name-control input[readonly] { border-color: var(--line); background: color-mix(in srgb, var(--paper) 70%, var(--surface)); color: var(--theme-strong-text, var(--tea)); }
.plan-inline-delete { border-color: color-mix(in srgb, var(--rouge) 38%, var(--line)); background: var(--surface); color: var(--theme-danger-text, var(--rouge)); }
.plan-inline-delete:hover:not(:disabled) { border-color: var(--rouge); background: color-mix(in srgb, var(--rouge) 6%, var(--surface)); color: var(--theme-danger-text, var(--rouge)); }
.plan-search > svg { color: var(--ink-60); pointer-events: none; }
.plan-search input { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.plan-picker-help small { color: var(--ink-60); }
.plan-filter-toggle { background: var(--surface); color: var(--ink-60); }
.plan-filter-toggle.on { border-color: var(--accent); color: var(--ink); }
.plan-filter-toggle > span { border-radius: 999px; background: var(--yellow); color: var(--ink); }

.plan-selection-tabs { border: 1px solid color-mix(in srgb, var(--line) 75%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--paper) 54%, var(--surface)); }
.plan-selection-tabs button { border: 0; background: transparent; color: var(--ink-60); }
.plan-selection-tabs button.on { background: var(--surface); color: var(--theme-strong-text, var(--tea)); box-shadow: 0 1px 4px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.09); }
.plan-selection-tabs button span { color: var(--theme-accent-text, var(--accent-strong)); }

.plan-filters { border: 1px solid var(--line); border-radius: 11px; background: color-mix(in srgb, var(--cream) 65%, var(--surface)); }
.plan-filter-head { color: var(--theme-strong-text, var(--tea)); }
.plan-filter-reset { border: 0; background: transparent; color: var(--ink-60); }
.plan-filter-label { color: var(--theme-strong-text, var(--tea)); }
.plan-filter-options button { border: 0; border-radius: 999px; background: var(--theme-wash, rgba(73,59,44,.06)); color: var(--ink-60); }
.plan-filter-options button.on { background: var(--yellow); color: var(--ink); }
.plan-filter-options .rarity-option.rarity-r3.on { background: color-mix(in srgb, var(--theme-info-bg, #99b5cf) 34%, var(--surface)); color: var(--theme-info-text, #47647d); }
.plan-filter-options .rarity-option.rarity-r4.on { background: color-mix(in srgb, var(--theme-purple-bg, #8672b2) 25%, var(--surface)); color: var(--theme-purple-text, #62508b); }
.plan-filter-options .rarity-option.rarity-r5.on { background: color-mix(in srgb, var(--yellow) 62%, var(--surface)); color: var(--theme-accent-text, var(--accent-strong)); }

.plan-roster-meta { color: var(--ink-60); }
.plan-roster-meta strong { color: var(--theme-accent-text, var(--accent-strong)); }
.plan-picker-invalid { color: var(--theme-danger-text, var(--rouge)); }
.plan-picker-error { border-radius: 8px; background: color-mix(in srgb, var(--rouge) 7%, var(--surface)); color: var(--theme-danger-text, var(--rouge)); }
.plan-candidates > p { color: var(--ink-60); }
.plan-candidate { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); cursor: pointer; }
.plan-candidate:hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); background: var(--cream); }
.plan-candidate:focus-within { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.plan-candidate.selected { border-color: color-mix(in srgb, var(--accent) 58%, var(--line)); background: color-mix(in srgb, var(--yellow) 16%, var(--surface)); }
.plan-candidate input { accent-color: var(--accent-strong); }
.plan-candidate-prof { filter: drop-shadow(0 1px 1px rgba(73,59,44,.22)); }
.plan-candidate-favorite { color: var(--theme-accent-text, var(--accent)); }
.plan-candidate-label { border: 1px solid var(--line); border-radius: 999px; color: var(--ink-60); }
.plan-candidate-label.profession { background: var(--paper); }
.plan-candidate-label.status.is-growing { border-color: var(--theme-success-line, rgba(111,159,118,.45)); background: var(--theme-success-bg, #bfdcc0); color: var(--theme-success-text, #315f38); }
.plan-candidate-label.status.is-graduated { border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); background: color-mix(in srgb, var(--yellow) 35%, var(--surface)); color: var(--theme-accent-text, var(--accent-strong)); }
.plan-candidate-label.status.is-inactive { background: color-mix(in srgb, var(--paper) 62%, var(--surface)); color: var(--ink-60); }
:deep(.plan-candidate .operator-avatar) { border-radius: 8px; }
:deep(.plan-candidate .operator-avatar img) { border-radius: 6px; }

.plan-dialog-actions { border-top: 1px solid var(--line); background: var(--surface); border-radius: 0 0 18px 18px; }
.plan-dialog-actions > p { color: var(--ink-60); }
.plan-dialog-actions > p strong { color: var(--theme-accent-text, var(--accent-strong)); }
.plan-dialog-actions .plan-cancel { border-color: transparent; background: transparent; color: var(--ink-60); }
.plan-dialog-actions button[type=submit] { border-color: var(--tea); background: var(--tea); color: var(--on-strong); }
@media (max-width: 560px) {
  .plan-dialog { border-radius: 15px; }
  .plan-dialog-head { border-radius: 15px 15px 0 0; }
  .plan-candidate { border-color: transparent; background: transparent; }
  .plan-candidate:hover { background: color-mix(in srgb, var(--cream) 72%, transparent); }
  .plan-candidate.selected { border-color: color-mix(in srgb, var(--accent) 48%, var(--line)); background: color-mix(in srgb, var(--yellow) 18%, var(--surface)); }
  .plan-candidate-status-mark:not(.is-favorite)::before { border-radius: 50%; content: ''; }
  .plan-candidate-status-mark.is-growing:not(.is-favorite)::before { border: 1px solid var(--theme-success-line, #56805d); background: var(--theme-success-bg, #6f9f76); }
  .plan-candidate-status-mark.is-graduated:not(.is-favorite)::before { border: 1px solid var(--accent-strong); background: var(--accent); }
  .plan-candidate-status-mark.is-inactive:not(.is-favorite)::before { border: 1px solid var(--ink-60); background: var(--ink-35); }
  .plan-candidate-status-mark.is-favorite.is-growing { color: var(--theme-success-text, #56805d); }
  .plan-candidate-status-mark.is-favorite.is-graduated { color: var(--theme-accent-text, var(--accent)); }
  .plan-candidate-status-mark.is-favorite.is-inactive { color: var(--ink-60); }
  .plan-selected-check { border-radius: 50%; background: var(--tea); color: var(--on-strong); }
  .plan-dialog-actions { border-radius: 0 0 15px 15px; }
}
</style>
<style scoped src="./operatorTrainingPlanPickerDesktop.css"></style>
<style scoped src="./operatorTrainingPlanPickerMobile.css"></style>
