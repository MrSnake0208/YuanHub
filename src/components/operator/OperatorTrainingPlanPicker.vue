<template>
  <div class="plan-heading">
    <div v-if="activePlan" ref="planSwitcher" class="plan-switcher" @focusout="onSwitcherFocusout">
      <h2 class="plan-title"><button ref="switcherTrigger" type="button" class="plan-title-trigger" :disabled="disabled" aria-haspopup="menu" :aria-expanded="switcherOpen" aria-controls="plan-switcher-menu" @click="toggleSwitcher" @keydown.down.prevent="openSwitcher(true)" @keydown.esc.prevent="closeSwitcher"><span>{{ activePlan.name }}</span><ChevronDown :size="18" :class="{ open: switcherOpen }" aria-hidden="true" /></button></h2>
      <div v-if="switcherOpen" id="plan-switcher-menu" ref="switcherMenu" class="plan-switcher-menu" role="menu" aria-label="切换培养清单" @keydown="onSwitcherKeydown">
        <button v-for="plan in plans" :key="plan.id" type="button" role="menuitemradio" :aria-checked="plan.id === activePlan.id" :class="{ active: plan.id === activePlan.id }" @click="selectPlan(plan.id)"><span class="plan-switcher-check"><Check v-if="plan.id === activePlan.id" :size="14" aria-hidden="true" /></span><span>{{ plan.name }}</span></button>
      </div>
    </div>
    <h2 v-else class="plan-title plan-title-empty">尚未建立培养清单</h2>
    <div class="plan-heading-actions">
      <button v-if="activePlan" type="button" class="plan-icon" :disabled="disabled" aria-label="编辑清单" title="编辑清单" @click="openEditor(false)"><Users :size="17" aria-hidden="true" /></button>
      <button type="button" class="plan-icon" :class="{ 'plan-add-empty': !activePlan }" :disabled="disabled" :aria-label="activePlan ? '新建计划' : '添加培养清单'" :title="activePlan ? '新建计划' : '添加培养清单'" @click="openEditor(true)"><Plus :size="18" aria-hidden="true" /><span v-if="!activePlan">添加清单</span></button>
    </div>
  </div>
  <dialog ref="dialog" class="plan-dialog" aria-labelledby="plan-editor-title" @click="onBackdrop" @close="resetTransientState">
    <form class="plan-dialog-shell" @submit.prevent="save">
      <header class="plan-dialog-head">
        <div class="plan-dialog-identity">
          <span class="plan-dialog-mark" aria-hidden="true"><Users :size="17" /></span>
          <div><h3 id="plan-editor-title">{{ creating ? '建立培养清单' : '编辑培养清单' }}</h3></div>
        </div>
        <div class="plan-dialog-head-actions"><button type="button" class="plan-dialog-close" aria-label="关闭" title="关闭" @click="dialog.close()"><X :size="19" aria-hidden="true" /></button></div>
      </header>

      <div class="plan-dialog-body">
        <section v-if="confirmingDelete && activePlan" class="plan-delete-confirm" role="alert" aria-labelledby="plan-delete-title">
          <div class="plan-delete-copy"><span aria-hidden="true"><Trash2 :size="17" /></span><div><b id="plan-delete-title">删除「{{ activePlan.name }}」？</b><p>{{ editingFavorites ? '这张清单将从养成规划移除，不会取消已标记的特别关注。' : '清单及其单独保存的养成目标将被删除。' }}删除后仍可在页面提示中撤销。</p></div></div>
          <div><button type="button" :disabled="disabled" @click="confirmingDelete = false">保留清单</button><button ref="deleteConfirm" type="button" class="plan-delete-danger" :disabled="disabled" @click="confirmDelete">确认删除</button></div>
        </section>

        <fieldset v-if="firstPlanSuggestion" class="plan-source-choice">
          <legend>第一张清单</legend>
          <label :class="{ selected: firstPlanMode === 'favorites' }"><input ref="sourceFirstInput" v-model="firstPlanMode" name="first-plan-source" type="radio" value="favorites" @change="applyFirstPlanMode" /><span><b>根据特别关注</b><small>预选 {{ validFavoriteIds.length }} 位，以后会自动跟随关注名单</small></span></label>
          <label :class="{ selected: firstPlanMode === 'custom' }"><input v-model="firstPlanMode" name="first-plan-source" type="radio" value="custom" @change="applyFirstPlanMode" /><span><b>空白清单</b><small>自行命名并挑选成员</small></span></label>
        </fieldset>

        <div class="plan-name-row">
          <label class="plan-name-field" for="plan-name-input">
            <span class="plan-name-meta"><b>清单名称</b><small v-if="editingFavorites">动态跟随特别关注</small><small v-else>各清单独立保存养成目标</small></span>
            <span class="plan-name-control"><PenLine :size="15" aria-hidden="true" /><input id="plan-name-input" ref="nameInput" v-model="name" maxlength="40" required :readonly="editingFavorites" /></span>
          </label>
          <button v-if="!creating && activePlan && !confirmingDelete" type="button" class="plan-inline-delete" :disabled="disabled" @click="requestDelete"><Trash2 :size="15" aria-hidden="true" />删除清单</button>
        </div>

        <div class="plan-toolbar">
          <label class="plan-search" for="plan-search-input"><Search :size="16" aria-hidden="true" /><span class="sr-only">查找密探</span><input id="plan-search-input" ref="searchInput" v-model="search" type="search" autocomplete="off" placeholder="搜索密探、拼音或首字母" /></label>
          <button type="button" class="plan-filter-toggle" :class="{ on: filtersOpen }" :aria-expanded="filtersOpen" aria-controls="plan-advanced-filters" @click="filtersOpen = !filtersOpen"><SlidersHorizontal :size="15" aria-hidden="true" />筛选<span v-if="advancedFilterCount">{{ advancedFilterCount }}</span></button>
        </div>

        <div class="plan-selection-tabs" role="group" aria-label="按清单状态筛选">
          <button v-for="option in selectionOptions" :key="option.value" type="button" :class="{ on: selectionFilter === option.value }" :aria-pressed="selectionFilter === option.value" @click="selectionFilter = option.value">{{ option.label }}<span>{{ selectionCount(option.value) }}</span></button>
        </div>

        <section v-if="filtersOpen" id="plan-advanced-filters" class="plan-filters" aria-label="属性与职业筛选">
          <div class="plan-filter-head"><span>精细筛选</span><button v-if="hasAdvancedFilters" type="button" class="plan-filter-reset" @click="resetAdvancedFilters">清除</button></div>
          <div class="plan-filter-row"><span class="plan-filter-label">属性</span><div class="plan-filter-options" role="group" aria-label="按属性筛选"><button v-for="option in profOptions" :key="option" type="button" :class="{ on: profFilter === option }" :aria-pressed="profFilter === option" @click="profFilter = option">{{ option === 'all' ? '全部' : option }}</button></div></div>
          <div class="plan-filter-row"><span class="plan-filter-label">职业</span><div class="plan-filter-options" role="group" aria-label="按职业筛选"><button v-for="option in subProfOptions" :key="option" type="button" :class="{ on: subProfFilter === option }" :aria-pressed="subProfFilter === option" @click="subProfFilter = option">{{ option === 'all' ? '全部' : option }}</button></div></div>
        </section>

        <div class="plan-roster-meta">
          <p v-if="invalidSelectedCount" class="plan-picker-invalid">保存时将清理 {{ invalidSelectedCount }} 位已失效密探</p>
        </div>
        <p v-if="error" class="plan-picker-error" role="alert">{{ error }}</p>

        <div class="plan-candidates">
          <label v-for="entry in filteredEntries" :key="entry.id" class="plan-candidate" :class="{ selected: selected.has(entry.id) }">
            <input type="checkbox" :checked="selected.has(entry.id)" @change="toggle(entry.id)" />
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
          <p v-if="!filteredEntries.length">当前筛选下没有密探</p>
        </div>
      </div>

      <footer v-if="!confirmingDelete" class="plan-dialog-actions">
        <p><strong>{{ validSelectedCount }}</strong> 位已选<span v-if="editingFavorites">· 移出不会取消特别关注</span></p>
        <div><button type="button" class="plan-cancel" @click="dialog.close()">取消</button><button type="submit" :disabled="disabled || !name.trim()">{{ creating ? '创建清单' : '保存更改' }}</button></div>
      </footer>
    </form>
  </dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, ChevronDown, PenLine, Plus, Search, SlidersHorizontal, Star, Trash2, Users, X } from '@lucide/vue'
import OperatorAvatar from './OperatorAvatar.vue'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { subProfList, subProfOptions as deriveSubProfOptions, matchesOperatorSearch, matchesProfSubFilter, tokens } from '../../utils/operatorFilters.js'
import { compareOperatorIdDesc } from '../../utils/operatorAdmin.js'
const props = defineProps({ plans: { type: Array, default: () => [] }, activePlan: { type: Object, default: null }, memberIds: { type: Object, default: () => new Set() }, favoriteIds: { type: Object, default: () => new Set() }, catalogEntries: { type: Array, default: () => [] }, growthStates: { type: Object, default: () => ({}) }, accountId: String, disabled: Boolean, error: String })
const emit = defineEmits(['select', 'save', 'remove'])
const dialog = ref(null)
const planSwitcher = ref(null)
const switcherTrigger = ref(null)
const switcherMenu = ref(null)
const nameInput = ref(null)
const searchInput = ref(null)
const sourceFirstInput = ref(null)
const deleteConfirm = ref(null)
const creating = ref(false)
const name = ref('')
const search = ref('')
const profFilter = ref('all')
const subProfFilter = ref('all')
const selectionFilter = ref('all')
const selected = ref(new Set())
const firstPlanMode = ref('favorites')
const firstPlanSuggestion = ref(false)
const confirmingDelete = ref(false)
const filtersOpen = ref(false)
const switcherOpen = ref(false)
const selectionOptions = [{ value: 'all', label: '全部' }, { value: 'selected', label: '已选' }, { value: 'unselected', label: '未选' }]
const PROF_ICON_FILES = Object.freeze({ 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' })
const catalogIds = computed(() => new Set(props.catalogEntries.map(entry => entry.id).filter(Boolean)))
const validFavoriteIds = computed(() => [...props.favoriteIds].filter(id => catalogIds.value.has(id)))
const validSelectedCount = computed(() => [...selected.value].filter(id => catalogIds.value.has(id)).length)
const invalidSelectedCount = computed(() => selected.value.size - validSelectedCount.value)
const editingFavorites = computed(() => (!creating.value && props.activePlan?.source === 'favorites') || (firstPlanSuggestion.value && firstPlanMode.value === 'favorites'))
const hasAdvancedFilters = computed(() => profFilter.value !== 'all' || subProfFilter.value !== 'all')
const advancedFilterCount = computed(() => Number(profFilter.value !== 'all') + Number(subProfFilter.value !== 'all'))
const profOptions = computed(() => {
  const present = new Set(props.catalogEntries.flatMap(entry => tokens(entry.prof)))
  return ['all', ...AGENT_PROFS, ...[...present].filter(prof => !AGENT_PROFS.includes(prof))]
})
const subProfOptions = computed(() => ['all', ...deriveSubProfOptions(props.catalogEntries)])
function selectionCount(value) {
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
  if (raw === 'graduated') return 'graduated'
  if (raw === 'inactive' || raw === 'skip') return 'inactive'
  return 'growing'
}
function growthStatusLabel(entry) {
  const status = growthStatus(entry)
  return status === 'graduated' ? '已毕业' : status === 'inactive' ? '养老中' : '养成中'
}
const filteredEntries = computed(() => {
  return props.catalogEntries.filter(entry => {
    if (!matchesOperatorSearch(entry, search.value)) return false
    if (!matchesProfSubFilter(entry, profFilter.value, subProfFilter.value)) return false
    if (selectionFilter.value === 'selected' && !selected.value.has(entry.id)) return false
    if (selectionFilter.value === 'unselected' && selected.value.has(entry.id)) return false
    return true
  }).sort(compareOperatorIdDesc)
})
async function openEditor(isNew, { selectNewMembers = false } = {}) {
  if (props.disabled) return
  creating.value = isNew
  firstPlanSuggestion.value = isNew && !props.plans.length
  firstPlanMode.value = firstPlanSuggestion.value ? 'favorites' : 'custom'
  name.value = isNew ? (firstPlanMode.value === 'favorites' ? '特别关注' : '') : props.activePlan?.name || ''
  resetFilters()
  if (selectNewMembers) selectionFilter.value = 'unselected'
  selected.value = isNew ? new Set(firstPlanMode.value === 'favorites' ? validFavoriteIds.value : []) : new Set(props.memberIds)
  confirmingDelete.value = false
  filtersOpen.value = false
  dialog.value.showModal()
  await nextTick()
  if (firstPlanSuggestion.value) sourceFirstInput.value?.focus()
  else if (selectNewMembers || editingFavorites.value) searchInput.value?.focus()
  else nameInput.value?.focus()
}
function openMemberPicker() {
  if (!props.activePlan) return
  return openEditor(false, { selectNewMembers: true })
}
defineExpose({ openMemberPicker })
function toggle(id) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next }
function resetFilters() { search.value = ''; profFilter.value = 'all'; subProfFilter.value = 'all'; selectionFilter.value = 'all' }
function resetAdvancedFilters() { profFilter.value = 'all'; subProfFilter.value = 'all' }
function applyFirstPlanMode() {
  const favorites = firstPlanMode.value === 'favorites'
  name.value = favorites ? '特别关注' : ''
  selected.value = new Set(favorites ? validFavoriteIds.value : [])
  nextTick(() => (favorites ? searchInput.value : nameInput.value)?.focus())
}
function save() {
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
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.plan-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; min-width: 0; }
.plan-switcher { position: relative; z-index: 4; min-width: 0; max-width: min(100%, 390px); }
.plan-title { min-width: 0; max-width: 100%; margin: 0; color: var(--ink); font: 900 25px/1.3 var(--font-s); letter-spacing: .02em; }
.plan-title-trigger { display: flex; min-width: 0; max-width: 100%; min-height: 44px; align-items: center; gap: 8px; padding: 4px 7px 4px 2px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; letter-spacing: inherit; text-align: left; }
.plan-title-trigger:hover:not(:disabled) { background: color-mix(in srgb, var(--paper) 62%, transparent); color: var(--ink); }
.plan-title-trigger > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-title-trigger > svg { flex: none; color: var(--ink-60); transition: transform 160ms ease; }
.plan-title-trigger > svg.open { transform: rotate(180deg); }
.plan-switcher-menu { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; display: grid; box-sizing: border-box; width: 100%; min-width: 100%; max-width: 100%; max-height: min(360px, 60dvh); gap: 2px; overflow-y: auto; padding: 6px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 16px 38px rgba(73,59,44,.2); }
.plan-switcher-menu button { width: 100%; min-width: 0; min-height: 40px; justify-content: flex-start; padding: 7px 10px 7px 7px; border: 0; border-radius: 8px; background: transparent; color: var(--ink-60); font-size: 12px; text-align: left; }
.plan-switcher-menu button:hover, .plan-switcher-menu button:focus-visible { background: var(--cream); color: var(--ink); }
.plan-switcher-menu button.active { background: color-mix(in srgb, var(--yellow) 24%, var(--surface)); color: var(--tea); }
.plan-switcher-menu button > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-switcher-check { display: grid; width: 18px; height: 18px; flex: none; place-items: center; color: var(--accent-strong); }
.plan-title-empty { color: var(--ink-60); font-size: 21px; }
.plan-heading-actions { display: flex; gap: 4px; }
.plan-heading-actions .plan-icon { width: 44px; height: 44px; padding: 0; border-color: transparent; background: transparent; color: var(--ink-60); }
.plan-heading-actions .plan-icon:hover:not(:disabled) { background: var(--paper); color: var(--tea); }
.plan-heading-actions .plan-add-empty { width: auto; padding: 0 12px; border-color: var(--line); background: var(--cream); color: var(--tea); }
button, select, input { font-family: var(--font-b); color: var(--ink); }
button, select { min-height: 40px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--cream); }
button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; font-size: 12px; font-weight: 750; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-strong); }
:is(button, input, select, summary):focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
:disabled { opacity: .55; cursor: wait; }

.plan-dialog { margin: auto; width: min(720px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: visible; padding: 0; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: 0 24px 70px rgba(73,59,44,.28); }
.plan-dialog::backdrop { background: rgba(73,59,44,.38); backdrop-filter: blur(2px); }
.plan-dialog-shell { display: flex; height: min(720px, calc(100dvh - 32px)); max-height: calc(100dvh - 32px); flex-direction: column; overflow: visible; }
.plan-dialog-head { position: relative; z-index: 3; display: flex; flex: none; align-items: center; justify-content: space-between; gap: 16px; min-height: 68px; padding: 12px 16px 11px 18px; border-bottom: 1px solid var(--line); background: linear-gradient(105deg, color-mix(in srgb, var(--yellow) 18%, var(--surface)), var(--surface) 58%); border-radius: 18px 18px 0 0; }
.plan-dialog-identity { display: flex; min-width: 0; align-items: center; gap: 10px; }
.plan-dialog-mark { display: grid; width: 34px; height: 34px; flex: none; place-items: center; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 10px; background: var(--cream); color: var(--accent-strong); }
.plan-dialog-kicker { display: block; margin-bottom: 1px; color: var(--ink-60); font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.plan-dialog-head h3 { margin: 0; font: 900 19px/1.25 var(--font-s); letter-spacing: .025em; }
.plan-dialog-head-actions { display: flex; flex: none; align-items: center; gap: 4px; }
.plan-dialog-close { display: grid; width: 40px; height: 40px; min-height: 40px; place-items: center; padding: 0; border: 0; border-radius: 10px; background: transparent; color: var(--ink-60); cursor: pointer; }
.plan-dialog-close:hover { background: rgba(73,59,44,.07); color: var(--ink); }

.plan-dialog-body { min-height: 0; flex: 1 1 auto; overflow-y: auto; padding: 14px 18px 16px; overscroll-behavior: contain; }
.plan-delete-confirm { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; padding: 10px 11px; border: 1px solid color-mix(in srgb, var(--rouge) 38%, var(--line)); border-radius: 11px; background: color-mix(in srgb, var(--rouge) 6%, var(--surface)); }
.plan-delete-copy { display: flex; min-width: 0; align-items: flex-start; gap: 9px; }
.plan-delete-copy > span { display: grid; width: 30px; height: 30px; flex: none; place-items: center; border-radius: 8px; background: color-mix(in srgb, var(--rouge) 10%, var(--surface)); color: var(--rouge); }
.plan-delete-copy b, .plan-delete-copy p { display: block; margin: 0; }
.plan-delete-copy b { font-size: 12px; }
.plan-delete-copy p { margin-top: 2px; color: var(--ink-60); font-size: 11px; line-height: 1.5; }
.plan-delete-confirm > div:last-child { display: flex; flex: none; gap: 6px; }
.plan-delete-confirm .plan-delete-danger { border-color: var(--rouge); background: var(--rouge); color: var(--cream); }

.plan-source-choice { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin: 0 0 10px; padding: 8px; border: 1px solid var(--line); border-radius: 12px; }
.plan-source-choice legend { padding: 0 5px; color: var(--tea); font-size: 11px; font-weight: 800; }
.plan-source-choice label { display: flex; min-width: 0; align-items: flex-start; gap: 8px; padding: 8px 9px; border: 1px solid transparent; border-radius: 9px; background: color-mix(in srgb, var(--cream) 72%, var(--surface)); cursor: pointer; }
.plan-source-choice label.selected { border-color: var(--accent); background: color-mix(in srgb, var(--yellow) 26%, var(--surface)); }
.plan-source-choice input { width: 16px; height: 16px; flex: none; margin: 2px 0 0; accent-color: var(--accent-strong); }
.plan-source-choice span, .plan-source-choice b, .plan-source-choice small { display: block; min-width: 0; }
.plan-source-choice b { font-size: 12px; }
.plan-source-choice small { margin-top: 2px; color: var(--ink-60); font-size: 10px; line-height: 1.45; }

.plan-name-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; padding: 9px 10px 10px; border: 1px solid var(--line); border-radius: 11px; background: color-mix(in srgb, var(--cream) 58%, var(--surface)); }
.plan-name-field { display: block; min-width: 0; }
.plan-name-meta { display: flex; min-width: 0; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0 2px 6px; }
.plan-name-meta b, .plan-name-meta small { display: block; min-width: 0; }
.plan-name-meta b { font-size: 12px; }
.plan-name-meta small { overflow: hidden; color: var(--ink-60); font-size: 10px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.plan-name-control { position: relative; display: flex; min-width: 0; align-items: center; }
.plan-name-control > svg { position: absolute; left: 11px; z-index: 1; color: var(--tea); pointer-events: none; }
.plan-name-control input { width: 100%; min-width: 0; min-height: 42px; padding: 7px 10px 7px 34px; border: 1.5px solid color-mix(in srgb, var(--tea) 48%, var(--line)); border-radius: 9px; background: var(--surface); box-shadow: inset 0 1px 2px rgba(73,59,44,.06); font-size: 13px; font-weight: 750; }
.plan-name-control input:hover:not([readonly]) { border-color: var(--tea); }
.plan-name-control input[readonly] { border-color: var(--line); background: color-mix(in srgb, var(--paper) 70%, var(--surface)); color: var(--tea); }
.plan-inline-delete { width: 94px; min-width: 94px; min-height: 42px; border-color: color-mix(in srgb, var(--rouge) 38%, var(--line)); background: var(--surface); color: var(--rouge); }
.plan-inline-delete:hover:not(:disabled) { border-color: var(--rouge); background: color-mix(in srgb, var(--rouge) 6%, var(--surface)); color: var(--rouge); }

.plan-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; margin-top: 10px; padding-right: 10px; }
.plan-search { position: relative; display: flex; min-width: 0; align-items: center; }
.plan-search > svg { position: absolute; left: 11px; z-index: 1; color: var(--ink-60); pointer-events: none; }
.plan-search input { width: 100%; min-width: 0; min-height: 42px; padding: 8px 10px 8px 34px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 12px; }
.plan-filter-toggle { width: 94px; min-width: 94px; background: var(--surface); color: var(--ink-60); }
.plan-filter-toggle.on { border-color: var(--accent); color: var(--ink); }
.plan-filter-toggle > span { display: grid; min-width: 17px; height: 17px; place-items: center; border-radius: 999px; background: var(--yellow); color: var(--ink); font: 800 9px var(--font-d); }

.plan-selection-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; margin-top: 7px; padding: 3px; border: 1px solid color-mix(in srgb, var(--line) 75%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--paper) 54%, var(--surface)); }
.plan-selection-tabs button { min-height: 34px; padding: 5px 9px; border: 0; background: transparent; color: var(--ink-60); }
.plan-selection-tabs button.on { background: var(--surface); color: var(--tea); box-shadow: 0 1px 4px rgba(73,59,44,.09); }
.plan-selection-tabs button span { color: var(--accent-strong); font: 800 10px var(--font-d); }

.plan-filters { display: flex; flex-direction: column; gap: 7px; margin-top: 7px; padding: 8px 9px; border: 1px solid var(--line); border-radius: 11px; background: color-mix(in srgb, var(--cream) 65%, var(--surface)); }
.plan-filter-head { display: flex; align-items: center; justify-content: space-between; color: var(--tea); font-size: 11px; font-weight: 800; letter-spacing: .05em; }
.plan-filter-reset { min-height: 28px; padding: 3px 7px; border: 0; background: transparent; color: var(--ink-60); font-size: 10px; }
.plan-filter-row { display: flex; align-items: flex-start; gap: 7px; }
.plan-filter-label { flex: 0 0 30px; padding-top: 7px; color: var(--tea); font-size: 11px; font-weight: 800; }
.plan-filter-options { display: flex; min-width: 0; flex: 1; flex-wrap: wrap; gap: 3px; }
.plan-filter-options button { min-height: 30px; padding: 4px 9px; border: 0; border-radius: 999px; background: rgba(73,59,44,.06); color: var(--ink-60); font-size: 11px; }
.plan-filter-options button.on { background: var(--yellow); color: var(--ink); }

.plan-roster-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 1px 6px; color: var(--ink-60); font-size: 10px; }
.plan-roster-meta p { margin: 0; }
.plan-roster-meta strong { color: var(--accent-strong); font: 850 12px var(--font-d); }
.plan-roster-meta span { margin-left: 5px; }
.plan-picker-invalid { color: var(--rouge); font-weight: 750; }
.plan-picker-error { margin: 6px 0; padding: 7px 9px; border-radius: 8px; background: color-mix(in srgb, var(--rouge) 7%, var(--surface)); color: var(--rouge); font-size: 11px; line-height: 1.5; }
.plan-candidates { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.plan-candidates > p { grid-column: 1 / -1; margin: 0; padding: 22px 4px; color: var(--ink-60); font-size: 12px; text-align: center; }
.plan-candidate { position: relative; display: flex; min-width: 0; min-height: 60px; align-items: center; gap: 7px; padding: 7px 27px 7px 7px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); cursor: pointer; }
.plan-candidate:hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); background: var(--cream); }
.plan-candidate:focus-within { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.plan-candidate.selected { border-color: color-mix(in srgb, var(--accent) 58%, var(--line)); background: color-mix(in srgb, var(--yellow) 16%, var(--surface)); }
.plan-candidate input { position: absolute; top: 50%; right: 8px; width: 16px; height: 16px; margin: -8px 0 0; accent-color: var(--accent-strong); }
.plan-candidate-avatar { position: relative; display: block; flex: none; }
.plan-candidate-prof { position: absolute; z-index: 1; top: 1px; left: 1px; display: block; width: 14px; height: 14px; object-fit: contain; filter: drop-shadow(0 1px 1px rgba(73,59,44,.22)); }
.plan-candidate-copy { display: block; width: 100%; min-width: 0; }
.plan-candidate-name { display: flex; min-width: 0; align-items: center; gap: 3px; }
.plan-candidate-status-mark { display: none; }
.plan-candidate b { display: block; min-width: 0; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.plan-candidate-favorite { display: inline-grid; width: 13px; height: 13px; flex: none; place-items: center; color: var(--accent); }
.plan-candidate-labels { display: flex; min-width: 0; gap: 3px; margin-top: 4px; overflow: hidden; }
.plan-candidate-label { display: inline-flex; min-width: 0; height: 17px; align-items: center; padding: 0 5px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink-60); font-size: 9px; font-weight: 750; line-height: 1; white-space: nowrap; }
.plan-candidate-label.profession { max-width: 58%; overflow: hidden; background: var(--paper); text-overflow: ellipsis; }
.plan-candidate-label.status { flex: none; }
.plan-candidate-label.status.is-growing { border-color: rgba(111,159,118,.45); background: #bfdcc0; color: #315f38; }
.plan-candidate-label.status.is-graduated { border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); background: color-mix(in srgb, var(--yellow) 35%, var(--surface)); color: var(--accent-strong); }
.plan-candidate-label.status.is-inactive { background: color-mix(in srgb, var(--paper) 62%, var(--surface)); color: var(--ink-60); }
.plan-selected-check { display: none; }
:deep(.plan-candidate .operator-avatar) { width: 34px; height: 34px; border-radius: 8px; }
:deep(.plan-candidate .operator-avatar img) { border-radius: 6px; }
:deep(.plan-candidate .operator-avatar > span) { font-size: 15px; }

.plan-dialog-actions { display: flex; min-height: 62px; flex: none; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px 10px 18px; border-top: 1px solid var(--line); background: var(--surface); border-radius: 0 0 18px 18px; }
.plan-dialog-actions > p { margin: 0; color: var(--ink-60); font-size: 10px; }
.plan-dialog-actions > p strong { color: var(--accent-strong); font: 850 13px var(--font-d); }
.plan-dialog-actions > p span { margin-left: 5px; }
.plan-dialog-actions > div { display: flex; flex: none; gap: 7px; }
.plan-dialog-actions .plan-cancel { border-color: transparent; background: transparent; color: var(--ink-60); }
.plan-dialog-actions button[type=submit] { min-width: 100px; border-color: var(--tea); background: var(--tea); color: var(--cream); }

@media (max-width: 700px) {
  .plan-candidates { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  button, select { min-height: 44px; }
  .plan-dialog { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); border-radius: 15px; }
  .plan-dialog-shell { height: min(720px, calc(100dvh - 16px)); max-height: calc(100dvh - 16px); }
  .plan-dialog-head { min-height: 64px; padding: 10px 10px 9px 12px; border-radius: 15px 15px 0 0; }
  .plan-dialog-head h3 { font-size: 17px; }
  .plan-dialog-close { width: 44px; height: 44px; }
  .plan-dialog-body { padding: 11px 12px 13px; }
  .plan-delete-confirm { align-items: stretch; flex-direction: column; }
  .plan-delete-confirm > div:last-child { justify-content: flex-end; }
  .plan-source-choice { grid-template-columns: 1fr; }
  .plan-source-choice label { min-height: 52px; }
  .plan-name-row { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 8px; }
  .plan-toolbar { padding-right: 8px; }
  .plan-name-meta small { display: none; }
  .plan-inline-delete, .plan-filter-toggle { width: 88px; min-width: 88px; }
  .plan-inline-delete { padding-inline: 9px; }
  .plan-name-control input, .plan-search input { min-height: 44px; font-size: 16px; }
  .plan-selection-tabs button { min-height: 40px; }
  .plan-filter-options button { min-height: 38px; padding-inline: 10px; }
  .plan-candidates { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; }
  .plan-candidate { min-height: 82px; flex-direction: column; justify-content: center; gap: 5px; padding: 7px 4px 6px; border-color: transparent; background: transparent; text-align: center; }
  .plan-candidate:hover { background: color-mix(in srgb, var(--cream) 72%, transparent); }
  .plan-candidate.selected { border-color: color-mix(in srgb, var(--accent) 48%, var(--line)); background: color-mix(in srgb, var(--yellow) 18%, var(--surface)); }
  .plan-candidate input { position: absolute; width: 1px; height: 1px; overflow: hidden; margin: -1px; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
  .plan-candidate-avatar { width: 42px; height: 42px; }
  .plan-candidate-prof { top: -0.5px; left: -0.5px; width: 15px; height: 15px; }
  .plan-candidate-copy { display: grid; width: 100%; justify-items: center; }
  .plan-candidate-name { position: relative; display: block; width: fit-content; max-width: calc(100% - 14px); margin-inline: auto; transform: translateX(3px); }
  .plan-candidate-name.is-three-plus { transform: translateX(4.5px); }
  .plan-candidate-status-mark { position: absolute; top: 50%; right: calc(100% + 3px); display: inline-grid; width: 11px; height: 12px; place-items: center; transform: translateY(calc(-50% + .5px)); }
  .plan-candidate-status-mark:not(.is-favorite)::before { box-sizing: border-box; width: 7px; height: 7px; border-radius: 50%; content: ''; }
  .plan-candidate-status-mark.is-growing:not(.is-favorite)::before { border: 1px solid #56805d; background: #6f9f76; }
  .plan-candidate-status-mark.is-graduated:not(.is-favorite)::before { border: 1px solid var(--accent-strong); background: var(--accent); }
  .plan-candidate-status-mark.is-inactive:not(.is-favorite)::before { border: 1px solid var(--ink-60); background: var(--ink-35); }
  .plan-candidate-status-mark.is-favorite.is-growing { color: #56805d; }
  .plan-candidate-status-mark.is-favorite.is-graduated { color: var(--accent); }
  .plan-candidate-status-mark.is-favorite.is-inactive { color: var(--ink-60); }
  .plan-candidate-status-mark svg { width: 10px; height: 10px; }
  .plan-candidate-favorite { display: none; }
  .plan-candidate-labels { display: none; }
  .plan-selected-check { position: absolute; top: 5px; right: 5px; display: block; width: 17px; height: 17px; padding: 2px; border-radius: 50%; background: var(--tea); color: var(--cream); }
  .plan-candidate b { max-width: 100%; font-size: 11px; text-align: center; }
  :deep(.plan-candidate .operator-avatar) { width: 42px; height: 42px; }
  .plan-dialog-actions { min-height: 66px; padding: 10px 12px; border-radius: 0 0 15px 15px; }
  .plan-dialog-actions > p span { display: none; }
}
@media (max-width: 380px) {
  .plan-dialog-mark { display: none; }
  .plan-toolbar { grid-template-columns: 1fr; }
  .plan-filter-toggle { width: 100%; }
  .plan-roster-meta span { display: none; }
  .plan-dialog-actions > p { display: none; }
  .plan-dialog-actions > div { width: 100%; }
  .plan-dialog-actions button { flex: 1; }
}
</style>
