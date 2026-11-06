<template>
  <section class="battle-recorder" aria-label="战斗操作记录">
    <div class="battle-action-legend"><span>操作符号：<b v-for="item in BATTLE_ACTIONS" :key="item.type">{{ item.symbol }} {{ item.label }}</b></span><span>目标：<span v-for="(name, index) in targets" :key="index"><i :style="{ background: TARGET_COLORS[index] }" aria-hidden="true"></i>{{ name || `目标${index + 1}` }}</span></span></div>
    <div class="battle-table-scroll" role="region" aria-label="回合操作表，左右滑动查看" tabindex="0">
      <table class="battle-matrix battle-action-matrix">
        <caption class="sr-only">回合行动表，数字为全队出手顺序，背景色与文字为目标</caption>
        <thead><tr><th scope="col">回合</th><th v-for="(member, index) in operators" :key="index" scope="col"><span class="battle-slot-number">{{ index + 1 }}号位</span><span class="battle-record-identity"><img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt=""><strong>{{ member.name || '未选择' }}</strong></span></th><th scope="col">备注</th></tr></thead>
        <tbody><tr v-for="(row, rowIndex) in rows" :key="rowIndex"><th scope="row"><button type="button" :aria-label="`编辑第${rowIndex + 1}回合`" @click="selectCell(rowIndex, slot, $event)">第 {{ rowIndex + 1 }} 回合</button></th>
          <td v-for="(actions, index) in row.slots" :key="index" :class="{ selected: expanded && current === rowIndex && slot === index }"><button type="button" class="battle-cell-button battle-action-cell" :disabled="!operators[index].name" :aria-label="`编辑第${rowIndex + 1}回合${index + 1}号位动作`" :aria-expanded="expanded && current === rowIndex && slot === index" aria-controls="battle-action-detail" @click="selectCell(rowIndex, index, $event)"><span v-if="!actions.length">{{ operators[index].name ? '添加动作' : '—' }}</span><span v-for="action in actions" :key="action.order" class="battle-action-mark" :style="{ background: TARGET_COLORS[action.target] }"><b>{{ action.order }}{{ action.symbol }}</b><small>{{ targets[action.target] || `目标${action.target + 1}` }}</small></span></button></td>
          <td><button type="button" class="battle-cell-button battle-remark-cell" :aria-label="`编辑第${rowIndex + 1}回合备注`" @click="selectCell(rowIndex, slot, $event)">{{ row.remark || '添加备注' }}</button></td>
        </tr></tbody>
      </table>
    </div>
    <p class="battle-scroll-hint">左右滑动查看五位密探；点击单元格修改动作。</p>
    <div class="battle-round-toolbar"><button type="button" :disabled="rounds.length >= 50" @click="addRound"><Plus :size="16" aria-hidden="true" />新增回合</button><span>{{ rounds.length }} / 50 回合 · 出手顺序在本回合全队共用</span></div>
    <section v-if="expanded" id="battle-action-detail" class="battle-inline-editor" aria-label="当前回合编辑">
      <header class="battle-inline-heading"><h3 ref="heading" tabindex="-1">第 {{ current + 1 }} 回合 · {{ operators[slot].name || `${slot + 1}号位` }}</h3><button type="button" @click="close">收起<ChevronUp :size="15" aria-hidden="true" /></button></header>
      <div class="battle-recorder-context"><label>当前回合<select v-model.number="current" aria-label="当前回合"><option v-for="(_, index) in rounds" :key="index" :value="index">第 {{ index + 1 }} 回合</option></select></label><label>当前密探<select v-model.number="slot" aria-label="当前密探"><option v-for="(member, index) in operators" :key="index" :value="index">{{ index + 1 }} · {{ member.name || '未选择' }}</option></select></label><button type="button" :disabled="rounds.length === 1" @click="removeRound">删除本回合</button></div>
      <p v-if="!operators[slot].name" class="battle-hint">请先在配队表选择该槽位密探，再记录动作。</p>
      <p v-else-if="!selectedActions.length" class="battle-hint">本回合尚未记录这位密探的动作，从下方选择一次动作开始。</p>
      <ol v-if="selectedActions.length" class="battle-action-list">
        <li v-for="{ action, index } in selectedActions" :key="index">
          <label class="battle-order-field">出手顺序<input :value="index + 1" type="number" min="1" :max="round.actions.length" :aria-label="`第${index + 1}步顺序`" @change="reorder(index, $event)"></label>
          <fieldset class="battle-action-choices"><legend>动作</legend><label v-for="item in BATTLE_ACTIONS" :key="item.type"><input v-model="action.type" type="radio" :name="`battle-action-${index}`" :value="item.type" :aria-label="`第${index + 1}步${item.label}`"><span>{{ item.symbol }} {{ item.label }}</span></label></fieldset>
          <label class="battle-action-target">目标<select v-model.number="action.target" :aria-label="`第${index + 1}步目标`"><option v-for="(name, pos) in targets" :key="pos" :value="pos">{{ name || `目标${pos + 1}` }}</option></select></label>
          <div class="battle-action-tools"><button type="button" :disabled="index === 0" :aria-label="`上移第${index + 1}步`" @click="moveBattleAction(round.actions, index, index - 1)"><ArrowUp :size="16" aria-hidden="true" /></button><button type="button" :aria-label="`删除第${index + 1}步`" @click="removeAction(index)"><Trash2 :size="16" aria-hidden="true" /></button></div>
        </li>
      </ol>
      <p v-if="orderError" role="alert" class="battle-error">{{ orderError }}</p>
      <div class="battle-add-action"><span>添加动作</span><button v-for="item in BATTLE_ACTIONS" :key="item.type" type="button" :disabled="!operators[slot].name || round.actions.length >= 50" :aria-label="`${slot + 1}号位${item.label}`" @click="record(item.type)">{{ item.symbol }} {{ item.label }}</button><label>新动作目标<select v-model.number="target" aria-label="新动作目标"><option v-for="(name, index) in targets" :key="index" :value="index">{{ name || `目标${index + 1}` }}</option></select></label></div>
      <div class="battle-sequence-tools"><span>{{ round.actions.length }} / 50 个动作 · 新动作追加到本回合末尾</span><button type="button" :disabled="!round.actions.length" @click="round.actions.pop()"><Undo2 :size="14" aria-hidden="true" />撤回最后一步</button></div>
      <details v-if="round.actions.length" class="battle-step-editor"><summary>全队出手顺序 / 更换执行密探</summary><ol class="battle-team-sequence"><li v-for="(action, index) in round.actions" :key="index"><b>{{ index + 1 }}</b><select v-model.number="action.slot" :aria-label="`第${index + 1}步密探`"><option v-for="(member, position) in operators" :key="position" :value="position" :disabled="!member.name">{{ position + 1 }} · {{ member.name || '未选择' }}</option></select><span>{{ BATTLE_ACTIONS.find(item => item.type === action.type)?.symbol }} · {{ targets[action.target] || `目标${action.target + 1}` }}</span></li></ol></details>
      <label class="battle-round-note">本回合备注<textarea v-model="round.remark" aria-label="本回合备注" rows="2" maxlength="2000" placeholder="控血、重开条件，或需要特别注意的操作"></textarea></label>
    </section>
    <details class="battle-target-edit"><summary><Pencil :size="14" aria-hidden="true" />编辑敌方名称</summary><div class="battle-target-fields"><label v-for="(_, index) in targets" :key="index">{{ ['左二', '左一', '主位', '右一', '右二'][index] }}<input v-model="targets[index]" maxlength="20" :aria-label="`敌方${index + 1}名称`"></label></div></details>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowUp, ChevronUp, Pencil, Plus, Trash2, Undo2 } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { BATTLE_ACTIONS, TARGET_COLORS, battleOperatorId, battleRoundRows } from '../../utils/battleImages.js'
import { moveBattleAction } from '../../utils/battleEditor.js'
import { dialog } from '../../utils/dialog.js'
const props = defineProps({ operators: { type: Array, required: true }, rounds: { type: Array, required: true }, targets: { type: Array, required: true } })
const emit = defineEmits(['round-change'])
const current = ref(0), slot = ref(0), target = ref(2), expanded = ref(false), heading = ref(null), orderError = ref('')
const rows = computed(() => battleRoundRows(props.rounds))
const round = computed(() => props.rounds[current.value])
const selectedActions = computed(() => round.value.actions.flatMap((action, index) => action.slot === slot.value ? [{ action, index }] : []))
watch(current, value => { emit('round-change', value); orderError.value = '' })
let alive = true, opener
onBeforeUnmount(() => { alive = false })
async function selectCell(row, position, event) {
  opener = event?.currentTarget || opener
  current.value = row; slot.value = position; expanded.value = true; orderError.value = ''
  await nextTick(); heading.value?.focus({ preventScroll: true }); heading.value?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
}
async function close() { expanded.value = false; await nextTick(); opener?.focus({ preventScroll: true }) }
function record(type) { if (props.operators[slot.value].name && round.value.actions.length < 50) round.value.actions.push({ slot: slot.value, type, target: target.value }) }
function addRound() {
  if (props.rounds.length >= 50) return
  props.rounds.push({ actions: [], remark: '' })
  selectCell(props.rounds.length - 1, slot.value)
}
async function removeRound() {
  if (props.rounds.length <= 1) return
  const selected = round.value, signature = JSON.stringify(selected)
  if (!await dialog.confirm({ title: '删除本回合？', message: '本回合动作与备注将删除，后续回合会重新编号。', type: 'danger', confirmText: '删除回合' })) return
  if (!alive || round.value !== selected || JSON.stringify(selected) !== signature) return
  props.rounds.splice(current.value, 1)
  current.value = Math.min(current.value, props.rounds.length - 1)
}
async function removeAction(index) {
  const selected = round.value, signature = JSON.stringify(selected)
  if (!await dialog.confirm({ title: '删除这一步？', message: '删除后，本回合的出手顺序会重新编号。', type: 'danger', confirmText: '删除动作' })) return
  if (alive && round.value === selected && JSON.stringify(selected) === signature) selected.actions.splice(index, 1)
}
function reorder(index, event) {
  const value = event.target.value
  orderError.value = value.trim() && moveBattleAction(round.value.actions, index, Number(value) - 1) ? '' : `出手顺序请填写 1—${round.value.actions.length} 的整数。`
  if (orderError.value) event.target.value = String(index + 1)
}
</script>
