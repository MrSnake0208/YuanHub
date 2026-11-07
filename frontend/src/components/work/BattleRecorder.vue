<template>
  <section class="battle-recorder" aria-label="战斗操作记录">
    <div class="battle-action-legend"><span>操作符号：<b v-for="item in BATTLE_ACTIONS" :key="item.type">{{ item.symbol }} {{ item.label }}</b></span><span>目标：<span v-for="(name, index) in targets" :key="index"><i :style="{ background: TARGET_COLORS[index] }" aria-hidden="true"></i>{{ targetName(index) }}</span></span></div>
    <div ref="scroller" class="battle-table-scroll" role="region" aria-label="回合操作表，左右滑动查看" tabindex="0">
      <table class="battle-matrix battle-action-matrix">
        <caption class="sr-only">回合行动表，数字为全队出手顺序，背景色与文字为目标</caption>
        <thead><tr><th scope="col">回合</th><th v-for="(member, index) in operators" :key="index" scope="col"><span class="battle-slot-number">{{ index + 1 }}号位</span><span class="battle-record-identity"><img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt=""><strong>{{ member.name || '未选择' }}</strong></span></th><th scope="col">备注</th></tr></thead>
        <tbody><tr v-for="(row, rowIndex) in rows" :key="rowIndex" :class="{ 'battle-row-current': expanded && current === rowIndex }"><th scope="row"><button type="button" :aria-label="`编辑第${rowIndex + 1}回合`" @click="selectCell(rowIndex, slot, $event)">第 {{ rowIndex + 1 }} 回合</button></th>
          <td v-for="(actions, index) in row.slots" :key="index" :class="{ selected: expanded && current === rowIndex && slot === index }"><button type="button" class="battle-cell-button battle-action-cell" :disabled="!operators[index].name" :aria-label="`编辑第${rowIndex + 1}回合${index + 1}号位动作`" :aria-expanded="expanded && current === rowIndex && slot === index" aria-controls="battle-action-detail" @click="selectCell(rowIndex, index, $event)"><span v-if="!actions.length">{{ operators[index].name ? '添加动作' : '—' }}</span><span v-for="action in actions" :key="action.order" class="battle-action-mark" :style="{ background: TARGET_COLORS[action.target] }"><b>{{ action.order }}{{ action.symbol }}</b><small>{{ targetName(action.target) }}</small></span></button></td>
          <td><button type="button" class="battle-cell-button battle-remark-cell" :aria-label="`编辑第${rowIndex + 1}回合备注`" @click="selectCell(rowIndex, slot, $event)">{{ row.remark || '添加备注' }}</button></td>
        </tr></tbody>
      </table>
    </div>
    <p v-if="overflowing" class="battle-scroll-hint">左右滑动查看五位密探；点击单元格开始记录。</p>
    <div class="battle-round-toolbar"><button type="button" :disabled="rounds.length >= 50" @click="addRound"><Plus :size="16" aria-hidden="true" />新增回合</button><span>{{ rounds.length }} / 50 回合 · 出手顺序在本回合全队共用</span></div>

    <section v-if="expanded" id="battle-action-detail" class="battle-inline-editor" aria-label="当前回合编辑">
      <header class="battle-inline-heading">
        <h3 ref="heading" tabindex="-1">第 {{ current + 1 }} 回合</h3>
        <div class="battle-round-nav">
          <button type="button" :disabled="current === 0" @click="goRound(current - 1)"><ChevronLeft :size="15" aria-hidden="true" />上一回合</button>
          <button v-if="current < rounds.length - 1" type="button" @click="goRound(current + 1)">下一回合<ChevronRight :size="15" aria-hidden="true" /></button>
          <button v-else type="button" :disabled="rounds.length >= 50" :title="rounds.length >= 50 ? '已达 50 回合上限' : undefined" @click="addRound">新增下一回合<Plus :size="15" aria-hidden="true" /></button>
          <button type="button" class="battle-collapse" @click="close">收起<ChevronUp :size="15" aria-hidden="true" /></button>
        </div>
      </header>

      <div class="battle-sequence">
        <div class="battle-sequence-head">
          <span>出手顺序</span>
          <button type="button" :disabled="!round.actions.length" @click="undoLast"><Undo2 :size="14" aria-hidden="true" />撤回最后一步</button>
        </div>
        <ol v-if="round.actions.length" class="battle-sequence-chips" aria-label="本回合出手顺序">
          <li v-for="(action, index) in round.actions" :key="index">
            <button type="button" :aria-pressed="editing === index" :aria-label="`第${index + 1}步：${actorName(action.slot)} ${actionLabel(action.type)} ${targetName(action.target)}，点按修改`" @click="toggleEdit(index)">
              <b>{{ index + 1 }}</b><span>{{ actorName(action.slot) }}</span><strong>{{ actionSymbol(action.type) }}</strong><small :style="{ background: TARGET_COLORS[action.target] }">{{ targetName(action.target) }}</small>
            </button>
          </li>
        </ol>
        <p v-else class="battle-hint">本回合还没有动作。选好密探和目标，点下方动作即可依次记录。</p>
        <div v-if="editingAction" class="battle-step-tools" role="group" :aria-label="`第${editing + 1}步操作`">
          <span>正在修改第 {{ editing + 1 }} 步，下方选择会直接改这一步</span>
          <button type="button" :disabled="editing === 0" :aria-label="`第${editing + 1}步提前`" @click="moveEditing(-1)"><ArrowLeft :size="15" aria-hidden="true" />提前</button>
          <button type="button" :disabled="editing === round.actions.length - 1" :aria-label="`第${editing + 1}步延后`" @click="moveEditing(1)">延后<ArrowRight :size="15" aria-hidden="true" /></button>
          <button type="button" :aria-label="`删除第${editing + 1}步`" @click="removeAction(editing)"><Trash2 :size="15" aria-hidden="true" />删除</button>
          <button type="button" class="battle-step-done" @click="editing = null">完成</button>
        </div>
        <p v-if="removedHere" class="battle-hint battle-undo-note" role="status">已删除第 {{ removed.index + 1 }} 步。<button type="button" class="battle-link-button" @click="restoreRemoved">撤销删除</button></p>
      </div>

      <div class="battle-composer">
        <div class="battle-composer-row" role="group" aria-label="出手密探">
          <span class="battle-composer-label">密探</span>
          <button v-for="(member, index) in operators" :key="index" type="button" class="battle-actor-option" :disabled="!member.name" :aria-pressed="activeSlot === index" @click="pickSlot(index)">
            <img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt="">{{ member.name || `${index + 1}号位` }}
          </button>
        </div>
        <div class="battle-composer-row" role="group" aria-label="动作目标">
          <span class="battle-composer-label">目标</span>
          <button v-for="(name, index) in targets" :key="index" type="button" class="battle-target-option" :aria-pressed="activeTarget === index" @click="pickTarget(index)">
            <i :style="{ background: TARGET_COLORS[index] }" aria-hidden="true"></i>{{ targetName(index) }}
          </button>
        </div>
        <div class="battle-composer-row" role="group" :aria-label="editingAction ? `修改第${editing + 1}步动作` : '记录动作'">
          <span class="battle-composer-label">{{ editingAction ? '改为' : '记录' }}</span>
          <button v-for="item in BATTLE_ACTIONS" :key="item.type" type="button" class="battle-action-option" :aria-pressed="editingAction ? editingAction.type === item.type : undefined" :disabled="!editingAction && !canRecord" @click="pickAction(item.type)">
            <b aria-hidden="true">{{ item.symbol }}</b>{{ item.label }}
          </button>
        </div>
        <p v-if="!editingAction && !operators[slot]?.name" class="battle-hint">请先在配队表选择密探，再记录动作。</p>
        <p v-else-if="!editingAction && round.actions.length >= 50" class="battle-hint">本回合已达 50 个动作上限。</p>
      </div>

      <label class="battle-round-note">本回合备注<textarea v-model="round.remark" aria-label="本回合备注" rows="2" maxlength="2000" placeholder="控血、重开条件，或需要特别注意的操作"></textarea></label>
      <div class="battle-sequence-tools"><span>{{ round.actions.length }} / 50 个动作</span><button type="button" :disabled="rounds.length === 1" @click="removeRound"><Trash2 :size="14" aria-hidden="true" />删除本回合</button></div>
    </section>
    <details class="battle-target-edit"><summary><Pencil :size="14" aria-hidden="true" />编辑敌方名称</summary><div class="battle-target-fields"><label v-for="(_, index) in targets" :key="index">{{ ['左二', '左一', '主位', '右一', '右二'][index] }}<input v-model="targets[index]" maxlength="20" :aria-label="`敌方${index + 1}名称`"></label></div></details>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ChevronUp, Pencil, Plus, Trash2, Undo2 } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { BATTLE_ACTIONS, TARGET_COLORS, battleOperatorId, battleRoundRows } from '../../utils/battleImages.js'
import { moveBattleAction } from '../../utils/battleEditor.js'
import { dialog } from '../../utils/dialog.js'
import { useHorizontalOverflow } from '../../composables/useHorizontalOverflow.js'
const props = defineProps({ operators: { type: Array, required: true }, rounds: { type: Array, required: true }, targets: { type: Array, required: true } })
const current = ref(0), slot = ref(0), target = ref(2), expanded = ref(false), heading = ref(null)
// editing：正在修改的步骤序号；null 表示密探/目标/动作按钮用于追加新动作。
const editing = ref(null), removed = ref(null)
const scroller = ref(null), overflowing = useHorizontalOverflow(scroller)
const rows = computed(() => battleRoundRows(props.rounds))
const round = computed(() => props.rounds[current.value])
const editingAction = computed(() => editing.value === null ? null : round.value?.actions[editing.value] || null)
const activeSlot = computed(() => editingAction.value ? editingAction.value.slot : slot.value)
const activeTarget = computed(() => editingAction.value ? editingAction.value.target : target.value)
const canRecord = computed(() => Boolean(props.operators[slot.value]?.name) && round.value.actions.length < 50)
const removedHere = computed(() => removed.value && removed.value.round === round.value)
watch(round, () => { editing.value = null })
watch(() => round.value?.actions.length, () => { if (editing.value !== null && !editingAction.value) editing.value = null })
let alive = true, opener
onBeforeUnmount(() => { alive = false })

const targetName = index => props.targets[index] || `目标${index + 1}`
const actorName = index => props.operators[index]?.name || `${index + 1}号位`
const actionSymbol = type => BATTLE_ACTIONS.find(item => item.type === type)?.symbol || '?'
const actionLabel = type => BATTLE_ACTIONS.find(item => item.type === type)?.label || '未知动作'

async function selectCell(row, position, event) {
  opener = event?.currentTarget || opener
  current.value = row; slot.value = position; editing.value = null; expanded.value = true
  await nextTick(); heading.value?.focus({ preventScroll: true }); heading.value?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
}
async function close() { expanded.value = false; editing.value = null; await nextTick(); opener?.focus({ preventScroll: true }) }
function goRound(index) { if (index >= 0 && index < props.rounds.length) current.value = index }
function toggleEdit(index) { editing.value = editing.value === index ? null : index }
function pickSlot(index) {
  if (!props.operators[index]?.name) return
  if (editingAction.value) editingAction.value.slot = index
  else slot.value = index
}
function pickTarget(index) {
  if (editingAction.value) editingAction.value.target = index
  else target.value = index
}
function pickAction(type) {
  if (editingAction.value) { editingAction.value.type = type; return }
  if (canRecord.value) round.value.actions.push({ slot: slot.value, type, target: target.value })
}
function moveEditing(offset) {
  const from = editing.value
  if (from !== null && moveBattleAction(round.value.actions, from, from + offset)) editing.value = from + offset
}
function removeAction(index) {
  const [action] = round.value.actions.splice(index, 1)
  if (action) removed.value = { round: round.value, index, action }
  editing.value = null
}
function undoLast() { if (round.value.actions.length) removeAction(round.value.actions.length - 1) }
function restoreRemoved() {
  const item = removed.value
  if (!item || item.round !== round.value || item.round.actions.length >= 50) return
  item.round.actions.splice(Math.min(item.index, item.round.actions.length), 0, item.action)
  removed.value = null
}
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
</script>
