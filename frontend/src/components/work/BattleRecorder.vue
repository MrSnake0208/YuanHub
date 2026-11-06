<template>
  <section class="battle-recorder" aria-label="战斗操作记录">
    <div class="battle-section-heading"><h2>操作记录</h2><span>{{ rounds.length }} 个回合</span></div>
    <div class="battle-round-toolbar">
      <label>当前回合<select v-model.number="current" aria-label="当前回合"><option v-for="(_, index) in rounds" :key="index" :value="index">第 {{ index + 1 }} 回合 · {{ rounds[index].actions.length }} 个动作</option></select></label>
      <button type="button" :disabled="rounds.length >= 50" @click="addRound">新增回合</button>
      <button type="button" :disabled="rounds.length === 1" @click="removeRound">删除本回合</button>
    </div>
    <div class="battle-targets">
      <div class="battle-target-heading"><strong><Crosshair :size="16" aria-hidden="true" />选择目标</strong><span>新动作指向当前目标</span></div>
      <div class="battle-target-buttons" aria-label="记录目标">
        <button v-for="(name, index) in targets" :key="index" type="button" :aria-pressed="target === index" :aria-label="`目标：${name || `目标${index + 1}`}`" @click="target = index"><i :style="{ background: TARGET_COLORS[index] }" aria-hidden="true"></i><span>{{ name || `目标${index + 1}` }}</span><Check v-if="target === index" :size="14" aria-hidden="true" /></button>
      </div>
      <details class="battle-target-edit"><summary><Pencil :size="13" aria-hidden="true" />编辑敌方名称</summary><div class="battle-target-fields"><label v-for="(_, index) in targets" :key="index">{{ ['左二', '左一', '主位', '右一', '右二'][index] }}<input v-model="targets[index]" maxlength="20" :aria-label="`敌方${index + 1}名称`"></label></div></details>
    </div>
    <p class="battle-hint">点按密探动作，自动记录出手顺序。</p>
    <div class="battle-record-buttons">
      <div v-for="(operator, slot) in operators" :key="slot" class="battle-record-member">
        <div class="battle-record-identity"><span class="battle-record-portrait"><img v-if="portraits[operator.id || battleOperatorId(operator.name)]" :src="portraits[operator.id || battleOperatorId(operator.name)]" alt=""><UserRound v-else :size="22" aria-hidden="true" /></span><strong><small>{{ slot + 1 }} 号位</small>{{ operator.name || '未选择' }}</strong></div>
        <div class="battle-record-pad"><button v-for="action in BATTLE_ACTIONS" :key="action.type" type="button" :disabled="!operator.name || round.actions.length >= 50" :aria-label="`${slot + 1}号位${action.label}`" :data-action="action.type" @click="record(slot, action.type)"><b>{{ action.symbol }}</b><small>{{ action.type === 'sp' ? '特殊' : action.label }}</small></button></div>
      </div>
    </div>
    <div class="battle-round-toolbar battle-sequence-heading"><h3>本回合出手顺序 <span>{{ round.actions.length }} / 50</span></h3><button type="button" :disabled="!round.actions.length" @click="round.actions.pop()"><Undo2 :size="14" aria-hidden="true" />撤回最后一步</button></div>
    <div class="battle-sequence" role="region" aria-label="本回合动作顺序" tabindex="0">
      <p v-if="!round.actions.length">尚未记录动作，从上方选择一次普攻开始。</p>
      <ol v-else><li v-for="(action, index) in round.actions" :key="index"><span>{{ index + 1 }}</span><strong>{{ operators[action.slot].name || `${action.slot + 1}号位` }}</strong><b>{{ BATTLE_ACTIONS.find(item => item.type === action.type)?.symbol }}</b><small><i :style="{ background: TARGET_COLORS[action.target] }" aria-hidden="true"></i>{{ targets[action.target] || `目标${action.target + 1}` }}</small></li></ol>
    </div>
    <details v-if="round.actions.length" class="battle-step-editor"><summary>逐步编辑 <span>调整密探、动作、目标与顺序</span><ChevronDown :size="14" aria-hidden="true" /></summary>
      <ol class="battle-action-list">
      <li v-for="(action, index) in round.actions" :key="index">
        <span class="battle-action-order">{{ index + 1 }}</span>
        <label><span class="sr-only">第 {{ index + 1 }} 步密探</span><select v-model.number="action.slot" :aria-label="`第${index + 1}步密探`"><option v-for="(operator, slot) in operators" :key="slot" :value="slot" :disabled="!operator.name">{{ slot + 1 }} · {{ operator.name || '未指定' }}</option></select></label>
        <label><span class="sr-only">第 {{ index + 1 }} 步动作</span><select v-model="action.type" :aria-label="`第${index + 1}步动作`"><option v-for="item in BATTLE_ACTIONS" :key="item.type" :value="item.type">{{ item.symbol }} {{ item.label }}</option></select></label>
        <label><span class="sr-only">第 {{ index + 1 }} 步目标</span><select v-model.number="action.target" :aria-label="`第${index + 1}步目标`"><option v-for="(name, pos) in targets" :key="pos" :value="pos">{{ name || `目标${pos + 1}` }}</option></select></label>
        <div class="battle-action-tools">
          <button type="button" :disabled="index === 0" :aria-label="`上移第${index + 1}步`" @click="move(index)"><ArrowUp :size="16" aria-hidden="true" /></button>
          <button type="button" :aria-label="`删除第${index + 1}步`" @click="removeAction(index)"><Trash2 :size="16" aria-hidden="true" /></button>
        </div>
      </li>
      </ol>
    </details>
    <label class="battle-round-note">第 {{ current + 1 }} 回合备注<textarea v-model="round.remark" aria-label="本回合备注" rows="2" maxlength="2000" placeholder="控血、重开条件，或需要特别注意的操作"></textarea></label>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowUp, Check, ChevronDown, Crosshair, Pencil, Trash2, Undo2, UserRound } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { BATTLE_ACTIONS, TARGET_COLORS, battleOperatorId } from '../../utils/battleImages.js'
import { dialog } from '../../utils/dialog.js'
const props = defineProps({ operators: { type: Array, required: true }, rounds: { type: Array, required: true }, targets: { type: Array, required: true } })
const current = ref(0), target = ref(2)
const emit = defineEmits(['round-change'])
watch(current, value => emit('round-change', value))
const round = computed(() => props.rounds[current.value])
function record(slot, type) {
  if (props.operators[slot].name && round.value.actions.length < 50) round.value.actions.push({ slot, type, target: target.value })
}
function addRound() {
  if (props.rounds.length >= 50) return
  props.rounds.push({ actions: [], remark: '' })
  current.value = props.rounds.length - 1
}
async function removeRound() {
  if (props.rounds.length <= 1) return
  if (!await dialog.confirm({ title: '删除本回合？', message: '本回合动作与备注将删除，后续回合会重新编号。', type: 'danger', confirmText: '删除回合' })) return
  props.rounds.splice(current.value, 1)
  current.value = Math.min(current.value, props.rounds.length - 1)
}
async function removeAction(index) {
  if (await dialog.confirm({ title: '删除这一步？', message: '删除后，本回合的出手顺序会重新编号。', type: 'danger', confirmText: '删除动作' })) round.value.actions.splice(index, 1)
}
function move(index) {
  const actions = round.value.actions
  ;[actions[index - 1], actions[index]] = [actions[index], actions[index - 1]]
}
</script>
