<template>
  <div class="battle-team-editor">
    <div class="battle-section-heading"><h2>出战阵容</h2><span>{{ operators.filter(item => item.name).length }} / 5 位</span></div>
    <div class="battle-team-strip" aria-label="选择编辑槽位">
      <button v-for="(member, index) in operators" :key="index" type="button" class="battle-slot-card" :aria-pressed="slot === index" :aria-label="`编辑${index + 1}号位`" @click="slot = index">
        <span class="battle-slot-number">{{ index + 1 }}</span>
        <span class="battle-slot-art"><img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt=""><UserRound v-else :size="28" aria-hidden="true" /></span>
        <strong>{{ member.name || '选择密探' }}</strong>
      </button>
    </div>
    <div class="battle-member-detail">
      <label class="battle-member-name"><span>{{ slot + 1 }} 号位密探</span>
        <span class="battle-name-field"><Search :size="16" aria-hidden="true" /><input :key="slot" :value="operator.name" :aria-label="`${slot + 1}号位密探`" :aria-describedby="accountEntries.length ? 'battle-member-source' : undefined" list="battle-operator-names" maxlength="40" placeholder="搜索密探，或填写自定义名称" @input="emit('pending-name', true)" @change="replace(slot, $event)"></span>
      </label>
      <div v-if="accountEntries.length" class="battle-member-source">
        <span id="battle-member-source">选择我的密探时带入已保存的练度与配装。</span>
        <button v-if="savedMember" type="button" @click="importMember">重新带入账号配置</button>
      </div>
      <template v-if="operator.name">
        <fieldset class="battle-field-group"><legend>练度 <span>按实际面板填写，未知可留空</span></legend>
          <div class="battle-stat-fields">
            <label v-for="[key, label] in BATTLE_STATS" :key="key">{{ label }}<input v-model="operator[key]" :aria-label="`${slot + 1}号位${label}`" :inputmode="key === 'huaji' ? 'text' : 'numeric'" maxlength="30" placeholder="—" @input="markPanelEdited"></label>
          </div>
          <p v-if="operator.panelNote" class="battle-hint">{{ operator.panelNote }}</p>
        </fieldset>
        <fieldset class="battle-field-group"><legend>命盘与配装</legend>
          <fieldset v-if="operator.discLoadouts?.length" class="battle-loadout-options">
            <legend>带入的命盘组合</legend>
            <label v-for="(loadout, index) in operator.discLoadouts" :key="index">
              <input ref="loadoutInputs" type="radio" name="battle-disc-loadout" :value="index" :checked="operator.discIndex === index" :aria-label="`带入命盘组合${index + 1}`" @change="selectLoadout(index)">
              <span>组合 {{ index + 1 }}<small>{{ loadout.name }}</small></span>
            </label>
          </fieldset>
          <div class="battle-disc-fields">
            <label v-for="[key, label] in BATTLE_NOTES" :key="key" :class="'battle-field-' + key">{{ label }}
              <textarea v-model="operator[key]" :aria-label="`${slot + 1}号位${label}`" :aria-invalid="key === 'discs' && Boolean(carriedDiscError)" :aria-describedby="key === 'discs' ? 'battle-carried-disc-status' : undefined" maxlength="300" rows="2" :placeholder="key === 'stars' ? '主星、辅星与等级' : key === 'discs' ? '一行一个命盘词条' : '无特殊要求可留空'" @input="markPanelEdited"></textarea>
              <span v-if="key === 'discs'" id="battle-carried-disc-status" :role="carriedDiscError ? 'alert' : undefined">{{ carriedDiscError || `${carriedDiscNames.length} / ${DISC_SELECTION_LIMIT} 项 · 一行一个词条，选满后请先移除再添加` }}</span>
            </label>
          </div>
          <details v-if="discTerms.length" class="battle-disc-picker"><summary>从图鉴选择命盘词条</summary>
            <label>填入位置<select v-model="discField" aria-label="命盘填写位置"><option value="discs">携带命盘</option><option value="requiredDiscs">必须命盘</option><option value="forbiddenDiscs">禁用命盘</option></select></label>
            <div class="battle-catalog-terms"><button v-for="name in discTerms" :key="name" type="button" :disabled="discField === 'discs' && carriedDiscNames.length >= DISC_SELECTION_LIMIT && !carriedDiscNames.includes(name)" @click="addDisc(name)">{{ name }}</button></div>
            <p v-if="discError" role="alert" class="battle-hint">{{ discError }}</p>
          </details>
        </fieldset>
      </template>
    </div>
    <datalist id="battle-operator-names"><template v-for="agent in sortedAgents" :key="agent.id"><option :value="agent.name">{{ accountEntries.some(entry => entry.id === agent.id) ? '我的密探 · 带入练度与配装' : '手动填写练度' }}</option><option v-if="agent.alias" :value="agent.alias">{{ agent.name }}</option></template></datalist>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Search, UserRound } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { AGENT_CATALOG } from '../../data/inventory/catalog.js'
import { agentMatchesGame } from '../../data/inventory/agentManifest.js'
import { findBattleCatalogOperator } from '../../utils/battleAccountSnapshot.js'
import { DISC_SELECTION_LIMIT, discNameOf } from '../../utils/operatorDiscLoadouts.js'
import { BATTLE_STATS, BATTLE_NOTES, battleOperatorId, createBattleOperator, battleDiscNames, battleDiscError } from '../../utils/battleImages.js'
import { dialog } from '../../utils/dialog.js'
const props = defineProps({ operators: { type: Array, required: true }, game: { type: String, default: '如鸢' }, catalog: { type: Array, default: () => AGENT_CATALOG }, accountEntries: { type: Array, default: () => [] } })
const emit = defineEmits(['replace', 'pending-name'])
const agents = computed(() => props.catalog.filter(agent => agentMatchesGame(agent, props.game)))
const sortedAgents = computed(() => {
  const owned = new Set(props.accountEntries.map(entry => entry.id))
  return [...agents.value].sort((a, b) => Number(owned.has(b.id)) - Number(owned.has(a.id)))
})
const slot = ref(0)
const operator = computed(() => props.operators[slot.value])
const savedMember = computed(() => props.accountEntries.find(entry => entry.id === operator.value.id))
const loadoutInputs = ref([])
const discField = ref('discs'), discError = ref('')
const carriedDiscNames = computed(() => battleDiscNames(operator.value.discs))
const carriedDiscError = computed(() => battleDiscError(operator.value.discs))
watch([operator, discField, () => operator.value[discField.value]], () => { discError.value = '' })
const discTerms = computed(() => (agents.value.find(agent => agent.id === operator.value.id)?.discs || []).map(discNameOf).filter(Boolean))
let alive = true
onBeforeUnmount(() => { alive = false })
function markPanelEdited() {
  if (operator.value.panelNote) operator.value.panelNote = '本攻略已手动调整练度或配装，请核对生命与攻击；不会自动重算。'
}
async function setMember(index, next) {
  const previous = props.operators[index], signature = JSON.stringify(previous)
  if (previous.name && !await dialog.confirm({ title: '更换密探或配装？', message: '该槽位的练度、携带命盘、命盘要求和星石将替换，已记录的槽位动作保留。不会修改账号档案。', confirmText: '替换槽位' })) return false
  if (!alive || props.operators[index] !== previous || JSON.stringify(previous) !== signature) return false
  emit('replace', index, next)
  return true
}
async function importMember() {
  if (savedMember.value) await setMember(slot.value, JSON.parse(JSON.stringify(savedMember.value)))
}
async function selectLoadout(index) {
  const member = operator.value, signature = JSON.stringify(member)
  loadoutInputs.value.forEach(input => { input.checked = Number(input.value) === member.discIndex })
  if (index === member.discIndex) return
  if (!await dialog.confirm({ title: '带入命盘组合？', message: '仅替换本攻略的携带命盘，必须／禁用要求保留。', confirmText: '带入组合' })) return
  if (!alive || operator.value !== member || JSON.stringify(member) !== signature) return
  member.discIndex = index; member.discs = member.discLoadouts[index].discNames.join('\n')
  markPanelEdited()
}
function addDisc(name) {
  const names = battleDiscNames(operator.value[discField.value])
  if (!names.includes(name)) names.push(name)
  const value = names.join('\n')
  discError.value = value.length > 300 ? '该字段最多 300 字，请先整理已填写的词条。' : discField.value === 'discs' ? battleDiscError(value) : ''
  if (!discError.value) { operator.value[discField.value] = value; markPanelEdited() }
}
async function replace(slot, event) {
  const input = event.target
  const name = input.value.trim()
  const previous = props.operators[slot].name
  if (name === previous) { input.value = name; emit('pending-name', false); return }
  const found = findBattleCatalogOperator(props.catalog, name, props.game)
  if (found && found.id === props.operators[slot].id) {
    props.operators[slot].name = found.name; input.value = found.name; emit('pending-name', false); return
  }
  const saved = props.accountEntries.find(entry => entry.id === found?.id)
  const next = saved ? JSON.parse(JSON.stringify(saved)) : createBattleOperator(found?.name || name, found?.id || '')
  if (!await setMember(slot, next)) {
    input.value = previous
    if (alive) emit('pending-name', false)
    return
  }
  input.value = found?.name || name
  emit('pending-name', false)
}
</script>
