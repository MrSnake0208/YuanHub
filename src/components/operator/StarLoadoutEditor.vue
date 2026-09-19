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
        <button type="button" class="star-group-heading" @click.stop="activateKind(kind.id)">{{ kind.label }} <small>{{ filledCount(kind.id) }}/3</small></button>
        <div class="star-slot-grid" :aria-label="kind.label + '槽位'">
          <article v-for="slot in kind.slots" :key="slot" class="star-loadout-slot" :class="{ replacement: replacementSlot === slot, empty: !slotEntry(slot) }" @click.stop="chooseReplacement(slot)">
            <span class="star-slot-label">{{ slotLabel(slot) }}</span>
            <template v-if="slotEntry(slot)"><strong class="star-slot-value">{{ slotEntry(slot).name }}</strong><small class="star-slot-level">Lv{{ slotEntry(slot).level || 0 }}</small><button type="button" class="star-slot-clear" :aria-label="'卸下' + slotLabel(slot)" @click.stop="clear(slot)">×</button></template>
            <strong v-else class="star-slot-value is-empty">未装配</strong>
            <span v-if="replacementSlot === slot" class="star-replacement-mark">替换</span>
          </article>
        </div>
      </section>
    </div>

    <div class="star-filter-row">
      <label>用途<SoftSelect v-model="usage" :options="usageSelectOptions" aria-label="星石用途" placeholder="全部" /></label>
      <label class="star-query">筛选<input v-model="query" placeholder="天府 武曲 天机" /></label>
      <p class="star-active-slot">{{ selectionLabel }}</p>
      <label class="star-hide"><input v-model="hideEquipped" type="checkbox" />隐藏已佩戴星石</label>
    </div>

    <div class="star-candidate-scroll">
      <p v-if="!filteredCandidates.length" class="hint">没有符合条件的星石。</p>
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
const selectionLabel = computed(function () { return replacementSlot.value ? '正在替换：' + slotLabel(replacementSlot.value) : '正在选择：' + (activeKind.value === 'main' ? '主星' : '辅星') + '（' + filledCount(activeKind.value) + '/3）' })

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
function filledCount(kind) { return groupSlots(kind).filter(function (slot) { return Boolean(loadout.value[slot]) }).length }
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
/* C2S: the editor surface intentionally merges into its host instead of adding another card shell. */
.star-loadout-editor{--candidate-columns:6;--candidate-gap:6px;display:grid;min-width:0;overflow:visible;background:#fffcf7;color:var(--ink,#493b2c)}.star-loadout-editor.is-inline{--candidate-columns:4;--candidate-gap:7px;background:transparent}.star-preset-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:9px;align-items:end;padding:8px 0 10px;border-bottom:1.5px dashed var(--line,#decdb8)}.star-preset-row label{display:grid;gap:5px;color:var(--ink,#493b2c);font:900 14px var(--font-b,inherit)}.star-filter-row label{display:grid;grid-template-rows:auto 38px;gap:4px;color:var(--ink-60,#897666);font:800 11px var(--font-b,inherit)}.star-subtle-button{min-height:38px;border:1px solid var(--line-strong,#b89568);border-radius:10px;background:transparent;padding:7px 11px;color:var(--ink,#493b2c);font:800 12px var(--font-b,inherit);cursor:pointer}.star-subtle-button:hover:not(:disabled){background:#f4e7d5}.star-subtle-button:disabled{cursor:not-allowed;opacity:.55}.star-loadout-notice{margin:7px 0 0;color:var(--rouge,#a6514a);font:700 12px var(--font-b,inherit)}.star-slot-groups{display:grid;gap:8px;padding:9px 0}.star-slot-group{padding:0}.star-slot-group+.star-slot-group{padding-top:8px;border-top:1.5px dashed var(--line,#decdb8)}.star-group-heading{position:relative;border:0;background:transparent;padding:1px 4px 5px 9px;color:var(--ink,#493b2c);font:900 14px var(--font-b,inherit);cursor:pointer}.star-slot-group.active .star-group-heading{color:#6b4a31}.star-slot-group.active .star-group-heading::before{position:absolute;top:1px;bottom:5px;left:0;width:3px;border-radius:3px;background:#c78a46;content:''}.star-group-heading small{color:var(--ink-50,#897666);font:800 11px var(--font-b,inherit)}.star-slot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.star-loadout-slot{position:relative;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.25fr) minmax(0,.8fr);align-items:center;gap:4px;min-height:42px;border:1px solid #decdb8;border-radius:8px;background:#fffcf7;padding:5px 19px 5px 7px;cursor:pointer;transition:border-color .18s,background-color .18s,box-shadow .18s}.star-loadout-slot:hover{border-color:#caa77f;background:#fff8ee}.star-loadout-slot.replacement{border-color:rgba(199,138,70,.78);background:#fff9f1;box-shadow:0 2px 8px rgba(89,61,36,.10)}.star-replacement-mark{position:absolute;top:-6px;right:25px;opacity:.78;border:1px solid rgba(199,138,70,.45);border-radius:7px;background:#fff5e7;padding:1px 4px;color:#7a5435;font:800 8.5px var(--font-b,inherit)}.star-slot-label,.star-slot-value,.star-slot-level{min-width:0;overflow:hidden;font:800 12px var(--font-b,inherit);line-height:1.1;text-overflow:ellipsis;white-space:nowrap}.star-slot-label{color:var(--ink-60,#897666)}.star-slot-value{color:var(--ink,#493b2c);text-align:center}.star-slot-level{color:var(--ink-50,#897666);text-align:right}.star-slot-value.is-empty{grid-column:2;color:var(--ink-50,#897666);font-size:12px}.star-loadout-slot.empty{background:#f8f3ea}.star-slot-clear{position:absolute;top:2px;right:2px;border:0;background:transparent;color:var(--ink-50,#897666);font-size:16px;line-height:1;cursor:pointer}.star-filter-row{display:grid;grid-template-columns:repeat(var(--candidate-columns),minmax(0,1fr));gap:var(--candidate-gap);align-items:end;padding:8px 0;border-top:1.5px dashed var(--line,#decdb8);border-bottom:1.5px dashed var(--line,#decdb8);background:transparent}.star-filter-row>label:first-child{grid-column:span 1}.star-query{min-width:0}.star-active-slot{display:flex;grid-column:span 1;align-items:center;min-width:0;min-height:38px;margin:0;overflow:hidden;color:var(--ink-60,#897666);font:700 12px var(--font-b,inherit);text-overflow:ellipsis;white-space:nowrap}.star-hide{display:flex!important;grid-column:span 1;align-items:center;justify-self:end;gap:5px;min-height:38px;margin:0;color:var(--ink,#493b2c)!important;font:700 12px var(--font-b,inherit)!important;white-space:nowrap}.star-query input{min-width:0;min-height:38px;border:1.5px solid #decdb8;border-radius:10px;background:var(--surface,#fffdf6);padding:7px 10px;color:var(--ink,#493b2c);font:700 12px var(--font-b,inherit);outline:none}.star-query input:focus{border-color:var(--accent,#d78935);box-shadow:0 0 0 3px rgba(199,138,70,.12)}.star-hide input{accent-color:#c78a46}.star-candidate-scroll{display:block;width:100%;min-width:0;min-height:150px;max-height:300px;overflow-y:auto;padding:8px 0 0}.star-candidate-grid{display:grid;width:100%;grid-template-columns:repeat(var(--candidate-columns),minmax(0,1fr));gap:var(--candidate-gap)}.star-candidate{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1px;min-height:52px;overflow:hidden;border:1px solid #decdb8;border-radius:7px;background:#f4f2ee;padding:5px 8px 5px 12px;color:var(--ink,#493b2c);text-align:left;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s}.star-candidate::before{position:absolute;top:0;bottom:0;left:0;width:4px;border-radius:6px 0 0 6px;background:#b8b0a5;content:''}.star-candidate:hover:not(:disabled){border-color:#c78a46;box-shadow:0 3px 9px rgba(89,61,36,.10);transform:translateY(-1px)}.star-candidate span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:800 12px var(--font-b,inherit)}.star-candidate strong{font:800 11px var(--font-b,inherit)}.star-candidate small{grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-50,#897666);font:700 10px var(--font-b,inherit)}.star-candidate.disabled{cursor:not-allowed;opacity:.5}.quality-orange{background:#fff1e3}.quality-orange::before{background:#d99a55}.quality-purple{background:#f4edfa}.quality-purple::before{background:#a98bc3}.quality-blue{background:#eef4fa}.quality-blue::before{background:#86a7be}.quality-green{background:#f0f5ec}.quality-green::before{background:#8fa57c}.quality-white,.quality-gray,.quality-grey,.quality-neutral{background:#f4f2ee}.quality-white::before,.quality-gray::before,.quality-grey::before,.quality-neutral::before{background:#b8b0a5}@media(max-width:1120px){.star-loadout-editor:not(.is-inline){--candidate-columns:4;--candidate-gap:7px;}}@media(max-width:700px){.star-loadout-editor{--candidate-columns:3;}.star-filter-row{grid-template-columns:repeat(2,minmax(0,1fr))}.star-filter-row>label:first-child,.star-query{grid-row:1}.star-active-slot,.star-hide{grid-row:2}}@media(max-width:600px){.star-preset-row{grid-template-columns:1fr 1fr}.star-preset-row .star-subtle-button{grid-column:1/-1}.star-loadout-editor{--candidate-columns:2}.star-candidate-scroll{max-height:none}.star-query input{min-height:42px;font-size:14px}}@media(max-width:420px){.star-slot-grid{grid-template-columns:1fr}.star-loadout-editor{--candidate-columns:1}}@media(max-width:320px){.star-filter-row{grid-template-columns:1fr}.star-filter-row>*{grid-column:span 1!important;grid-row:auto!important}}
.star-filter-row{--usage-width:calc((100% - (var(--candidate-columns) - 1) * var(--candidate-gap)) / var(--candidate-columns));grid-template-columns:var(--usage-width) minmax(0,1fr) max-content max-content;overflow-y:auto;scrollbar-gutter:stable}.star-filter-row>label:first-child,.star-query,.star-active-slot,.star-hide{grid-column:auto}
.star-candidate-scroll{scrollbar-gutter:stable}
@media(max-width:700px){.star-filter-row{grid-template-columns:repeat(2,minmax(0,1fr))}.star-filter-row>label:first-child,.star-query,.star-active-slot,.star-hide{grid-column:auto}}
</style>
