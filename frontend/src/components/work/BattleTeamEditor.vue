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
      <label v-if="accountEntries.length">从我的密探带入 {{ slot + 1 }} 号位
        <select :key="slot + ':' + accountEntries.length" aria-label="从我的密探选择" value="" @change="importMember"><option value="">选择密探，带入已保存的练度与配装</option><option v-for="entry in accountEntries" :key="entry.id" :value="entry.id">{{ entry.name }} · {{ entry.level || '未知' }}级</option></select>
      </label>
      <label class="battle-member-name"><span>{{ slot + 1 }} 号位密探</span>
        <span class="battle-name-field"><Search :size="16" aria-hidden="true" /><input :key="slot" :value="operator.name" :aria-label="`${slot + 1}号位密探`" list="battle-operator-names" maxlength="40" placeholder="输入名字，或从候选中选择" @input="emit('pending-name', true)" @change="replace(slot, $event)"></span>
      </label>
      <template v-if="operator.name">
        <fieldset class="battle-field-group"><legend>练度 <span>按实际面板填写，未知可留空</span></legend>
          <div class="battle-stat-fields">
            <label v-for="[key, label] in BATTLE_STATS" :key="key">{{ label }}<input v-model="operator[key]" :aria-label="`${slot + 1}号位${label}`" :inputmode="key === 'huaji' ? 'text' : 'numeric'" maxlength="30" placeholder="—" @input="markPanelEdited"></label>
          </div>
          <p v-if="operator.panelNote" class="battle-hint">{{ operator.panelNote }}</p>
        </fieldset>
        <fieldset class="battle-field-group"><legend>命盘与配装</legend>
          <label v-if="operator.discLoadouts?.length">带入的命盘组合
            <select :value="operator.discIndex" aria-label="选择已保存的命盘组合" @change="selectLoadout"><option v-for="(loadout, index) in operator.discLoadouts" :key="index" :value="index">组合 {{ index + 1 }} · {{ loadout.name }}</option></select>
          </label>
          <div class="battle-disc-fields"><label v-for="[key, label] in BATTLE_NOTES" :key="key" :class="'battle-field-' + key">{{ label }}<textarea v-model="operator[key]" :aria-label="`${slot + 1}号位${label}`" maxlength="300" rows="2" :placeholder="key === 'stars' ? '主星、辅星与等级' : key === 'discs' ? '一行一个命盘词条' : '无特殊要求可留空'" @input="markPanelEdited"></textarea></label></div>
          <details v-if="discTerms.length" class="battle-disc-picker"><summary>从图鉴选择命盘词条</summary>
            <label>填入位置<select v-model="discField" aria-label="命盘填写位置"><option value="discs">携带命盘</option><option value="requiredDiscs">必须命盘</option><option value="forbiddenDiscs">禁用命盘</option></select></label>
            <div class="battle-catalog-terms"><button v-for="name in discTerms" :key="name" type="button" @click="addDisc(name)">{{ name }}</button></div>
            <p v-if="discError" role="alert" class="battle-hint">{{ discError }}</p>
          </details>
        </fieldset>
      </template>
      <div v-else class="battle-member-empty"><UserRound :size="32" aria-hidden="true" /><p>为 {{ slot + 1 }} 号位选择一位密探</p><span>选好后填写练度与命盘，图片会同步更新。</span></div>
    </div>
    <datalist id="battle-operator-names"><template v-for="agent in agents" :key="agent.id"><option :value="agent.name" /><option v-if="agent.alias" :value="agent.alias">{{ agent.name }}</option></template></datalist>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { Search, UserRound } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { AGENT_CATALOG } from '../../data/inventory/catalog.js'
import { agentMatchesGame } from '../../data/inventory/agentManifest.js'
import { findBattleCatalogOperator } from '../../utils/battleAccountSnapshot.js'
import { discNameOf } from '../../utils/operatorDiscLoadouts.js'
import { BATTLE_STATS, BATTLE_NOTES, battleOperatorId, createBattleOperator } from '../../utils/battleImages.js'
import { dialog } from '../../utils/dialog.js'
const props = defineProps({ operators: { type: Array, required: true }, game: { type: String, default: '如鸢' }, catalog: { type: Array, default: () => AGENT_CATALOG }, accountEntries: { type: Array, default: () => [] } })
const emit = defineEmits(['replace', 'pending-name'])
const agents = computed(() => props.catalog.filter(agent => agentMatchesGame(agent, props.game)))
const slot = ref(0)
const operator = computed(() => props.operators[slot.value])
const discField = ref('discs'), discError = ref('')
const discTerms = computed(() => (agents.value.find(agent => agent.id === operator.value.id)?.discs || []).map(discNameOf).filter(Boolean))
let alive = true
onBeforeUnmount(() => { alive = false })
function markPanelEdited() {
  if (operator.value.panelNote) operator.value.panelNote = '本攻略已手动调整练度或配装，请核对生命与攻击；不会自动重算。'
}
async function setMember(index, next) {
  const previous = props.operators[index], signature = JSON.stringify(previous)
  if (previous.name && !await dialog.confirm({ title: '更换密探或配装？', message: '该槽位的练度与配装将替换，已记录的槽位动作保留。不会修改账号档案。', confirmText: '替换槽位' })) return false
  if (!alive || props.operators[index] !== previous || JSON.stringify(previous) !== signature) return false
  emit('replace', index, next)
  return true
}
async function importMember(event) {
  const next = props.accountEntries.find(entry => entry.id === event.target.value)
  event.target.value = ''
  if (next) await setMember(slot.value, JSON.parse(JSON.stringify(next)))
}
async function selectLoadout(event) {
  const member = operator.value, index = Number(event.target.value), signature = JSON.stringify(member)
  event.target.value = String(member.discIndex)
  if (!await dialog.confirm({ title: '带入命盘组合？', message: '仅替换本攻略的携带命盘，必须／禁用要求保留。', confirmText: '带入组合' })) return
  if (!alive || operator.value !== member || JSON.stringify(member) !== signature) return
  member.discIndex = index; member.discs = member.discLoadouts[index].discNames.join('\n')
  event.target.value = String(index)
  markPanelEdited()
}
function addDisc(name) {
  const names = operator.value[discField.value].split('\n').filter(Boolean)
  if (!names.includes(name)) names.push(name)
  const value = names.join('\n')
  discError.value = value.length > 300 ? '该字段最多 300 字，请先整理已填写的词条。' : ''
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
  if (!await setMember(slot, createBattleOperator(found?.name || name, found?.id || ''))) {
    input.value = previous
    if (alive) emit('pending-name', false)
    return
  }
  input.value = found?.name || name
  emit('pending-name', false)
}
</script>
