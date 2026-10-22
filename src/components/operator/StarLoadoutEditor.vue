<template>
  <section class="star-loadout-editor" :class="{ 'is-inline': inline }" aria-label="星石装配编辑器">
    <div class="star-preset-row">
      <label>主星预设<SoftSelect v-model="selectedPreset.main" :options="presetOptions.main" :disabled="presetState.loading" aria-label="主星预设" placeholder="自定义" presentation="horizontal" @change="applySelectedPreset('main', $event)" /></label>
      <label>辅星预设<SoftSelect v-model="selectedPreset.support" :options="presetOptions.support" :disabled="presetState.loading" aria-label="辅星预设" placeholder="自定义" presentation="horizontal" @change="applySelectedPreset('support', $event)" /></label>
      <button type="button" class="star-subtle-button" :disabled="presetState.loading" @click="presetManaging = true">{{ presetState.loading ? '加载预设中…' : '管理预设' }}</button>
    </div>
    <p v-if="notice" class="star-loadout-notice" role="status">{{ notice }}</p>

    <div class="star-slot-groups">
      <section v-for="kind in kinds" :key="kind.id" class="star-slot-group" :class="{ active: activeKind === kind.id }" @click="activateKind(kind.id)">
        <button type="button" class="star-group-heading" :aria-pressed="activeKind === kind.id" @click.stop="activateKind(kind.id)">{{ kind.label }} <small>{{ filledCount(kind.id) }}/3</small></button>
        <div class="star-slot-grid" :aria-label="kind.label + '槽位'">
          <article v-for="slot in kind.slots" :key="slot" class="star-loadout-slot" :class="{ replacement: replacementSlot === slot, 'is-target': targetSlot === slot, empty: !slotEntry(slot) }">
            <button type="button" class="star-slot-pick" :aria-label="'选择' + slotLabel(slot) + '，' + (slotEntry(slot)?.name || '未装配')" :aria-pressed="targetSlot === slot" @click.stop="chooseReplacement(slot)">
            <span v-if="inline && !slotEntry(slot)" class="star-slot-add"><Plus :size="20" aria-hidden="true" /></span>
            <span class="star-slot-label">{{ slotLabel(slot) }}</span>
            <template v-if="slotEntry(slot)"><strong class="star-slot-value">{{ slotEntry(slot).name }}</strong><small class="star-slot-level">Lv{{ slotEntry(slot).level || 0 }}</small></template>
            <strong v-else class="star-slot-value is-empty">未装配</strong>
            </button>
            <button v-if="slotEntry(slot)" type="button" class="star-slot-clear" :aria-label="'卸下' + slotLabel(slot)" @click.stop="clear(slot)"><X :size="16" aria-hidden="true" /></button>
            <span v-if="replacementSlot === slot" class="star-replacement-mark">{{ slotEntry(slot) ? '替换' : '选择中' }}</span>
          </article>
        </div>
      </section>
    </div>

    <div class="star-filter-row">
      <label>用途<SoftSelect v-model="usage" :options="usageSelectOptions" aria-label="星石用途" placeholder="全部" /></label>
      <label class="star-query">筛选<input v-model="query" placeholder="天府 武曲 天机" /></label>
      <p class="star-active-slot" role="status">{{ selectionLabel }}</p>
      <label class="star-hide"><input v-model="hideEquipped" type="checkbox" />隐藏已佩戴星石</label>
    </div>

    <div class="star-candidate-scroll">
      <div v-if="!filteredCandidates.length" class="star-empty-state" role="status">
        <component :is="inventoryEntries.length ? SearchX : PackageOpen" :size="40" aria-hidden="true" />
        <strong>{{ inventoryEntries.length ? '没有符合条件的星石。' : '暂无星石库存' }}</strong>
        <p>{{ inventoryEntries.length ? '可以调整用途、搜索或隐藏已佩戴条件，也可切换主星 / 辅星。' : '先到星石背包添加星石，再回来装配。' }}</p>
      </div>
      <div v-else class="star-candidate-grid">
        <button v-for="candidate in decoratedCandidates" :key="candidate.instanceId" type="button" class="star-candidate" :class="['quality-' + (candidate.quality || 'neutral'), { disabled: candidate.disabled }]" :disabled="candidate.disabled" :title="candidate.disabledReason" @click="select(candidate)">
          <span>{{ candidate.name }}</span><strong>Lv{{ candidate.level || 0 }}</strong><small>{{ ownerLabel(candidate) }}</small>
        </button>
      </div>
    </div>

    <StarPresetManager :open="presetManaging" :presets="presetSnapshot" :saving="presetState.saving" :cloud-error="presetState.error" :save-handler="savePresets" @close="presetManaging = false" />
  </section>
</template>

<script setup>
import { X, Plus, PackageOpen, SearchX } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { assignInstanceToDraft, buildStarLoadoutCandidates, canAssignStarInstance, clearDraftSlot, emptyLoadout, groupSlots, nextGroupSlot, slotKind } from '../../domain/starLoadout.js'
import { applySessionPreset, filterStarCandidates } from '../../domain/starLoadoutUi.js'
import { starLoadoutPresetStore } from '../../domain/starLoadoutPresets.js'
import SoftSelect from '../ui/SoftSelect.vue'
import StarPresetManager from './StarPresetManager.vue'

const props = defineProps({ targetOperator: Object, inventoryEntries: { type: Array, default: function () { return [] } }, draftLoadouts: { type: Object, default: function () { return {} } }, initialSlot: String, initialReplacement: Boolean, inline: Boolean, operatorDisplayNameMap: { type: Object, default: function () { return {} } } })
const emit = defineEmits(['update:draftLoadouts'])
const kinds = [{ id: 'main', label: '主星', slots: groupSlots('main') }, { id: 'support', label: '辅星', slots: groupSlots('support') }]
const activeKind = ref('main')
const replacementSlot = ref(null)
const usage = ref('')
const query = ref('')
const hideEquipped = ref(false)
const notice = ref('')
const selectedPreset = ref({ main: '', support: '' })
const presetManaging = ref(false)
const presetState = starLoadoutPresetStore.state
const presetSnapshot = computed(function () { return { main: presetState.main, support: presetState.support } })
const presetOptions = computed(function () {
  return {
    main: presetState.main.map(function (preset) { return { value: preset.id, label: preset.name, description: preset.names.slice(0, 3).join(' · ') } }),
    support: presetState.support.map(function (preset) { return { value: preset.id, label: preset.name, description: preset.names.slice(0, 3).join(' · ') } }),
  }
})
const loadout = computed(function () { return props.draftLoadouts?.[props.targetOperator?.id] || emptyLoadout() })
const instanceMap = computed(function () { return Object.fromEntries(props.inventoryEntries.map(function (item) { return [item.instance_id || item.instanceId || item.id, item] })) })
const selectedRepresentativeSlot = computed(function () { return activeKind.value === 'main' ? 'main1' : 'support1' })
const candidates = computed(function () { return buildStarLoadoutCandidates({ inventoryEntries: props.inventoryEntries, loadouts: props.draftLoadouts, targetOperator: props.targetOperator, selectedSlot: selectedRepresentativeSlot.value, hideEquipped: hideEquipped.value, operatorDisplayNameMap: props.operatorDisplayNameMap, resolveOperatorName: function () { return '其他密探' } }) })
const filteredCandidates = computed(function () { return filterStarCandidates(candidates.value, { usage: usage.value, query: query.value }) })
const usageOptions = computed(function () { return activeKind.value === 'main' ? ['攻击', '生命', '其它'] : ['增伤', '抗性', '治疗', '免伤'] })
const usageSelectOptions = computed(function () { return usageOptions.value.map(function (tag) { return { value: tag, label: tag } }) })
const targetSlot = computed(function () { return nextGroupSlot({ loadout: loadout.value, kind: activeKind.value, replacementSlot: replacementSlot.value }) })
const decoratedCandidates = computed(function () {
  return filteredCandidates.value.map(function (candidate) {
    if (!targetSlot.value) {
      const duplicateSlot = groupSlots(activeKind.value).find(function (slot) { return slotEntry(slot)?.name === candidate.name })
      const duplicateReason = (activeKind.value === 'main' ? '当前主星' : '当前辅星') + '已选择「' + candidate.name + '」'
      return Object.assign({}, candidate, { disabled: Boolean(duplicateSlot), disabledReason: duplicateSlot ? duplicateReason : '' })
    }
    const result = canAssignStarInstance({ loadouts: props.draftLoadouts, targetOperatorId: props.targetOperator?.id, targetSlot: targetSlot.value, instanceId: candidate.instanceId, inventoryEntries: props.inventoryEntries })
    return Object.assign({}, candidate, { disabled: !result.allowed, disabledReason: result.reason })
  })
})
const selectionLabel = computed(function () { return targetSlot.value ? (slotEntry(targetSlot.value) ? '正在替换：' : '正在选择：') + slotLabel(targetSlot.value) : (activeKind.value === 'main' ? '主星' : '辅星') + '已选满，请选择要替换的槽位' })

watch(function () { return [props.targetOperator?.id, props.initialSlot] }, function () {
  const kind = slotKind(props.initialSlot)
  activeKind.value = kind || 'main'
  replacementSlot.value = kind && props.initialReplacement ? props.initialSlot : null
  usage.value = ''
  query.value = ''
  hideEquipped.value = false
  notice.value = ''
  selectedPreset.value = { main: '', support: '' }
}, { immediate: true })

function slotEntry(slot) { return instanceMap.value[loadout.value[slot]] || null }
function slotLabel(slot) { return (slotKind(slot) === 'main' ? '主星' : '辅星') + slot.slice(-1) }
function filledCount(kind) { return groupSlots(kind).filter(function (slot) { return Boolean(slotEntry(slot)) }).length }
function activateKind(kind) { activeKind.value = kind; replacementSlot.value = null; notice.value = '' }
function chooseReplacement(slot) { activeKind.value = slotKind(slot); replacementSlot.value = replacementSlot.value === slot ? null : slot; notice.value = '' }
function publish(next) { emit('update:draftLoadouts', next) }
function clear(slot) { if (!props.targetOperator?.id) return; publish(clearDraftSlot({ loadouts: props.draftLoadouts, targetOperatorId: props.targetOperator.id, targetSlot: slot })); replacementSlot.value = null; selectedPreset.value[slotKind(slot)] = '' }
function select(candidate) {
  if (!props.targetOperator?.id) return
  if (!targetSlot.value) { notice.value = (activeKind.value === 'main' ? '主星' : '辅星') + '已选满，请先点上方星石选择要替换的位置'; return }
  if (candidate.disabled) { notice.value = candidate.disabledReason; return }
  const next = assignInstanceToDraft({ loadouts: props.draftLoadouts, targetOperatorId: props.targetOperator.id, targetSlot: targetSlot.value, instanceId: candidate.instanceId, inventoryEntries: props.inventoryEntries })
  publish(next)
  replacementSlot.value = null
  selectedPreset.value[activeKind.value] = ''
  notice.value = ''
}
function ownerLabel(candidate) { if (!candidate.occupiedBy) return '未佩戴'; return candidate.occupiedBy.operatorId === props.targetOperator?.id ? '当前 · ' + slotLabel(candidate.occupiedBy.slot) : (candidate.occupiedBy.operatorName || '其他密探') + ' · ' + slotLabel(candidate.occupiedBy.slot) }
function applySelectedPreset(kind, presetId) {
  const preset = presetState[kind].find(function (item) { return item.id === presetId })
  if (!preset || !props.targetOperator) return
  const result = applySessionPreset({ names: preset.names, kind, draftLoadouts: props.draftLoadouts, targetOperator: props.targetOperator, inventoryEntries: props.inventoryEntries, hideEquipped: hideEquipped.value })
  publish(result.loadouts)
  activeKind.value = kind
  replacementSlot.value = null
  notice.value = result.message
}
async function savePresets(next) {
  await starLoadoutPresetStore.save(next)
  selectedPreset.value = { main: '', support: '' }
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* C2S: the editor surface intentionally merges into its host instead of adding another card shell. */
.star-slot-pick { display: grid; grid-column: 1 / -1; grid-template-columns: inherit; align-items: center; gap: inherit; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: inherit; cursor: pointer; }
.star-slot-pick:focus-visible, .star-group-heading:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 3px; }
.star-slot-add { display: grid; place-items: center; justify-self: center; width: 32px; height: 32px; border-radius: 50%; background: var(--paper); color: var(--ink-60); }
.star-loadout-slot.is-target { border-color: var(--accent-strong); }
.star-empty-state { display: grid; justify-items: center; gap: 8px; padding: 28px 16px; border-radius: 10px; background: var(--cream); color: var(--ink-60); text-align: center; }
.star-empty-state > svg { color: var(--ink-60); }
.star-empty-state > strong { color: var(--ink); font-size: 15px; }
.star-empty-state > p { margin: 0; font-size: 12px; line-height: 1.6; }
.star-loadout-editor{background:var(--theme-surface, #fffcf7);color:var(--ink,#493b2c)}.star-loadout-editor.is-inline{background:transparent}.star-preset-row{border-bottom:1.5px dashed var(--line,#decdb8)}.star-preset-row label{color:var(--ink,#493b2c)}.star-filter-row label{color:var(--ink-60,#897666)}.star-subtle-button{border:1px solid var(--line-strong,#b89568);border-radius:10px;background:transparent;color:var(--ink,#493b2c);cursor:pointer}.star-subtle-button:hover:not(:disabled){background:var(--theme-surface, #f4e7d5)}.star-subtle-button:disabled{cursor:not-allowed;opacity:.55}.star-loadout-notice{color:var(--rouge,#a6514a)}.star-slot-group+.star-slot-group{border-top:1.5px dashed var(--line,#decdb8)}.star-group-heading{border:0;background:transparent;color:var(--ink,#493b2c);cursor:pointer}.star-slot-group.active .star-group-heading{color:var(--theme-text, #6b4a31)}.star-slot-group.active .star-group-heading::before{border-radius:3px;background:var(--theme-accent-bg, #c78a46);content:''}.star-group-heading small{color:var(--ink-50,#897666)}.star-loadout-slot{border:1px solid var(--theme-line, #decdb8);border-radius:8px;background:var(--theme-surface, #fffcf7);cursor:pointer;transition:border-color .18s,background-color .18s,box-shadow .18s}.star-loadout-slot:hover{border-color:var(--theme-line, #caa77f);background:var(--theme-surface, #fff8ee)}.star-loadout-slot.replacement{border-color:var(--theme-line, rgba(199,138,70,.78));background:var(--theme-surface, #fff9f1);box-shadow:0 2px 8px rgba(var(--theme-shadow-rgb, 89, 61, 36), 0.1)}.star-replacement-mark{opacity:.78;border:1px solid var(--theme-line, rgba(199,138,70,.45));border-radius:7px;background:var(--theme-surface, #fff5e7);color:var(--theme-text, #7a5435)}.star-slot-label{color:var(--ink-60,#897666)}.star-slot-value{color:var(--ink,#493b2c)}.star-slot-level{color:var(--ink-50,#897666)}.star-slot-value.is-empty{color:var(--ink-50,#897666)}.star-loadout-slot.empty{background:var(--theme-surface, #f8f3ea)}.star-slot-clear{border:0;background:transparent;color:var(--ink-50,#897666);cursor:pointer}.star-filter-row{border-top:1.5px dashed var(--line,#decdb8);border-bottom:1.5px dashed var(--line,#decdb8);background:transparent}.star-active-slot{color:var(--ink-60,#897666)}.star-hide{color:var(--ink,#493b2c)!important}.star-query input{border:1.5px solid var(--theme-line, #decdb8);border-radius:10px;background:var(--surface,#fffdf6);color:var(--ink,#493b2c);outline:none}.star-query input:focus{border-color:var(--accent,#d78935);box-shadow:0 0 0 3px rgba(var(--theme-shadow-rgb, 199, 138, 70), 0.12)}.star-hide input{accent-color:#c78a46}.star-candidate{border:1px solid var(--theme-line, #decdb8);border-radius:7px;background:var(--theme-surface, #f4f2ee);color:var(--ink,#493b2c);cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s}.star-candidate::before{border-radius:6px 0 0 6px;background:var(--theme-highlight, #b8b0a5);content:''}.star-candidate:hover:not(:disabled){border-color:var(--theme-line, #c78a46);box-shadow:0 3px 9px rgba(var(--theme-shadow-rgb, 89, 61, 36), 0.1)}.star-candidate small{color:var(--ink-50,#897666)}.star-candidate.disabled{cursor:not-allowed;opacity:.5}.quality-orange{background:var(--theme-surface, #fff1e3)}.quality-orange::before{background:var(--theme-accent-bg, #d99a55)}.quality-purple{background:var(--theme-purple-bg, #f4edfa)}.quality-purple::before{background:var(--theme-purple-bg, #a98bc3)}.quality-blue{background:var(--theme-info-bg, #eef4fa)}.quality-blue::before{background:var(--theme-info-bg, #86a7be)}.quality-green{background:var(--theme-success-bg, #f0f5ec)}.quality-green::before{background:var(--theme-success-bg, #8fa57c)}.quality-white,.quality-gray,.quality-grey,.quality-neutral{background:var(--theme-surface, #f4f2ee)}.quality-white::before,.quality-gray::before,.quality-grey::before,.quality-neutral::before{background:var(--theme-highlight, #b8b0a5)}
</style>
<style scoped src="./starLoadoutEditorDesktop.css"></style>
<style scoped src="./starLoadoutEditorMobile.css"></style>
