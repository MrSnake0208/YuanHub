<template>
  <div class="battle-team-editor">
    <div class="battle-section-heading"><h2>出战阵容</h2><span>{{ operators.filter(item => item.name).length }} / 5 位</span></div>
    <div class="battle-team-strip" aria-label="选择编辑槽位">
      <button v-for="(member, index) in operators" :key="index" type="button" class="battle-slot-card" :aria-pressed="slot === index" :aria-label="`编辑${index + 1}号位`" @click="slot = index">
        <span class="battle-slot-number">{{ index + 1 }}</span>
        <span class="battle-slot-art"><img v-if="portraits[battleOperatorId(member.name)]" :src="portraits[battleOperatorId(member.name)]" alt=""><UserRound v-else :size="28" aria-hidden="true" /></span>
        <strong>{{ member.name || '选择密探' }}</strong>
      </button>
    </div>
    <div class="battle-member-detail">
      <label class="battle-member-name"><span>{{ slot + 1 }} 号位密探</span>
        <span class="battle-name-field"><Search :size="16" aria-hidden="true" /><input :key="slot" :value="operator.name" :aria-label="`${slot + 1}号位密探`" list="battle-operator-names" maxlength="40" placeholder="输入名字，或从候选中选择" @change="replace(slot, $event)"></span>
      </label>
      <template v-if="operator.name">
        <fieldset class="battle-field-group"><legend>练度 <span>按实际面板填写，未知可留空</span></legend>
          <div class="battle-stat-fields">
            <label v-for="[key, label] in BATTLE_STATS" :key="key">{{ label }}<input v-model="operator[key]" :aria-label="`${slot + 1}号位${label}`" :inputmode="key === 'huaji' ? 'text' : 'numeric'" maxlength="30" placeholder="—"></label>
          </div>
        </fieldset>
        <fieldset class="battle-field-group"><legend>命盘与配装</legend>
          <div class="battle-disc-fields"><label v-for="[key, label] in BATTLE_NOTES" :key="key" :class="'battle-field-' + key">{{ label }}<textarea v-model="operator[key]" :aria-label="`${slot + 1}号位${label}`" maxlength="300" rows="2" :placeholder="key === 'stars' ? '主星、辅星与等级' : key === 'discs' ? '一行一个命盘词条' : '无特殊要求可留空'"></textarea></label></div>
        </fieldset>
      </template>
      <div v-else class="battle-member-empty"><UserRound :size="32" aria-hidden="true" /><p>为 {{ slot + 1 }} 号位选择一位密探</p><span>选好后填写练度与命盘，图片会同步更新。</span></div>
    </div>
    <datalist id="battle-operator-names"><option v-for="agent in agents" :key="agent.id" :value="agent.name" /></datalist>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Search, UserRound } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { AGENT_CATALOG } from '../../data/inventory/catalog.js'
import { visibleAgentEntries } from '../../data/inventory/agentManifest.js'
import { BATTLE_STATS, BATTLE_NOTES, battleOperatorId, createBattleOperator } from '../../utils/battleImages.js'
import { dialog } from '../../utils/dialog.js'
const props = defineProps({ operators: { type: Array, required: true } })
const emit = defineEmits(['replace'])
const agents = visibleAgentEntries(AGENT_CATALOG)
const slot = ref(0)
const operator = computed(() => props.operators[slot.value])
async function replace(slot, event) {
  const input = event.target
  const name = input.value.trim()
  const previous = props.operators[slot].name
  if (name === previous) { input.value = name; return }
  if (previous && !await dialog.confirm({ title: '更换密探？', message: '该槽位的练度与命盘将清空，已记录的槽位动作保留并用于新密探。', confirmText: '更换密探' })) {
    input.value = previous
    return
  }
  emit('replace', slot, createBattleOperator(name))
  input.value = name
}
</script>
