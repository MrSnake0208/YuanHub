<template>
  <section class="battle-recorder" aria-label="战斗操作记录">
    <div class="battle-action-legend">
      <span class="battle-legend-symbols"><span class="battle-legend-prefix">操作符号：</span><b>数字 本回合全队出手顺序</b><b v-for="item in BATTLE_ACTIONS" :key="item.type">{{ item.symbol }} {{ item.label }}</b><b>{{ BATTLE_INTERACTION.symbol }} {{ BATTLE_INTERACTION.label }}</b></span>
      <!-- is-unused 供手机端只列出表中实际用到的目标；单目标时整组目标都不列。 -->
      <span class="battle-legend-targets" :class="{ 'is-single': !usage.multi }">目标：<span v-for="(name, index) in targets" :key="index" :class="{ 'is-unused': !usage.used.includes(index) }"><i :class="{ 'is-plain': legendPlain(index) }" :style="legendPlain(index) ? null : { background: TARGET_COLORS[index] }" aria-hidden="true"></i>{{ targetName(index) }}<small v-if="index === usage.main">（表中未标注即此目标）</small></span>
        <button type="button" class="battle-target-rename" :aria-expanded="renaming" aria-controls="battle-target-fields" @click="renaming = !renaming"><Pencil :size="13" aria-hidden="true" />{{ renaming ? '完成改名' : '改名' }}</button>
      </span>
    </div>
    <div v-if="renaming" id="battle-target-fields" class="battle-target-fields" role="group" aria-label="敌方名称"><label v-for="(_, index) in targets" :key="index">{{ TARGET_POSITIONS[index] }}<input v-model="targets[index]" maxlength="20" :aria-label="`敌方${index + 1}名称（${TARGET_POSITIONS[index]}）`"></label></div>
    <div ref="scroller" class="battle-table-scroll" role="region" aria-label="回合操作表，左右滑动查看" tabindex="0">
      <table class="battle-matrix battle-action-matrix">
        <caption class="sr-only">回合行动表，数字为全队出手顺序，背景色与文字为目标</caption>
        <thead><tr><th scope="col">回合</th><th v-for="(member, index) in operators" :key="index" scope="col"><span class="battle-slot-number">{{ index + 1 }}号位</span><span class="battle-record-identity"><img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt=""><strong>{{ member.name || '未选择' }}</strong></span></th><th scope="col">备注</th></tr></thead>
        <tbody>
          <template v-for="(row, rowIndex) in rows" :key="rowIndex">
            <tr :class="{ 'battle-row-current': expanded && current === rowIndex, 'is-alt': rowIndex % 2 === 1 }"><th scope="row"><button type="button" :aria-label="`编辑第${rowIndex + 1}回合`" :aria-expanded="expanded && current === rowIndex" @click="selectCell(rowIndex, slot, $event)">{{ rowIndex + 1 }}</button></th>
              <td v-for="(actions, index) in row.slots" :key="index"><button type="button" class="battle-cell-button battle-action-cell" :disabled="!operators[index].name" :aria-label="`编辑第${rowIndex + 1}回合${index + 1}号位动作`" :aria-expanded="expanded && current === rowIndex" aria-controls="battle-action-detail" @click="selectCell(rowIndex, index, $event)"><span v-if="!actions.length" :class="{ 'battle-cell-empty': operators[index].name }">{{ operators[index].name ? '+' : '—' }}</span><span v-for="action in actions" :key="action.order" class="battle-action-mark" :class="{ 'is-box': action.box, 'is-plain': !action.box && targetPlain(action.target) }" :style="action.box || targetPlain(action.target) ? null : { background: TARGET_COLORS[action.target] }"><b>{{ action.order }}{{ action.symbol }}</b><small v-if="!action.box && !targetPlain(action.target)">{{ targetName(action.target) }}</small></span></button></td>
              <td><button type="button" class="battle-cell-button battle-remark-cell" :aria-label="`编辑第${rowIndex + 1}回合备注`" @click="selectCell(rowIndex, slot, $event)"><span v-if="row.remark">{{ row.remark }}</span><span v-else class="battle-cell-empty">+</span></button></td>
            </tr>
            <!-- 手机端隐藏备注列，有备注的回合在行下显示一条贯穿整行的备注带（与操作图一致）；桌面端隐藏，仍用备注列。 -->
            <tr v-if="row.remark" class="battle-remark-row" :class="{ 'battle-row-current': expanded && current === rowIndex, 'is-alt': rowIndex % 2 === 1 }"><td :colspan="operators.length + 2"><button type="button" class="battle-remark-band" :aria-label="`第${rowIndex + 1}回合备注：${row.remark}，点按编辑`" @click="selectCell(rowIndex, slot, $event)">{{ row.remark }}</button></td></tr>
            <!-- 编辑区在当前回合正下方展开，边记录边看到这一行的变化，不必滚到表格末尾。 -->
            <tr v-if="expanded && current === rowIndex" class="battle-editor-row"><td :colspan="operators.length + 2">
            <section id="battle-action-detail" :ref="setSection" class="battle-inline-editor" aria-label="当前回合编辑">
              <header class="battle-inline-heading">
                <h3 :ref="setHeading" tabindex="-1">第 {{ current + 1 }} 回合</h3>
                <div class="battle-round-nav">
                  <button type="button" :disabled="current === 0" data-nav="prev" @click="goRound(current - 1, 'prev')"><ChevronLeft :size="15" aria-hidden="true" />上一回合</button>
                  <button v-if="current < rounds.length - 1" type="button" data-nav="next" @click="goRound(current + 1, 'next')">下一回合<ChevronRight :size="15" aria-hidden="true" /></button>
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
                    <button type="button" :aria-pressed="editing === index" :aria-label="`第${index + 1}步：${stepText(action)}，点按修改`" @click="toggleEdit(index)">
                      <b>{{ index + 1 }}</b><template v-if="isBattleInteraction(action)"><span>{{ BATTLE_INTERACTION.label }}</span><strong>{{ BATTLE_INTERACTION.symbol }}</strong></template>
                      <template v-else><span>{{ actorName(action.slot) }}</span><strong>{{ actionSymbol(action.type) }}</strong><small :style="{ background: TARGET_COLORS[action.target] }">{{ targetName(action.target) }}</small></template>
                    </button>
                  </li>
                </ol>
                <p v-else class="battle-hint">本回合还没有动作。选好密探和目标，点下方动作即可依次记录；用到关卡里的箱子时选「箱」。</p>
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
                <div class="battle-composer-row battle-composer-actors" role="group" aria-label="出手方">
                  <span class="battle-composer-label">出手</span>
                  <button v-for="(member, index) in operators" :key="index" type="button" class="battle-actor-option" :disabled="!member.name" :aria-pressed="activeSlot === index" @click="pickSlot(index)">
                    <img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt="">{{ member.name || `${index + 1}号位` }}
                  </button>
                  <button type="button" class="battle-actor-option battle-box-option" :aria-pressed="activeSlot === BOX" :aria-label="`${BATTLE_INTERACTION.label}（箱）`" @click="pickSlot(BOX)"><b aria-hidden="true">{{ BATTLE_INTERACTION.symbol }}</b>{{ BATTLE_INTERACTION.label }}</button>
                </div>
                <div class="battle-composer-row battle-composer-targets" role="group" aria-label="动作目标">
                  <span class="battle-composer-label">目标</span>
                  <button v-for="(name, index) in targets" :key="index" type="button" class="battle-target-option" :aria-pressed="activeSlot !== BOX && activeTarget === index" :disabled="activeSlot === BOX" @click="pickTarget(index)">
                    <i :style="{ background: TARGET_COLORS[index] }" aria-hidden="true"></i><span>{{ targetName(index) }}</span>
                  </button>
                </div>
                <div class="battle-composer-row battle-composer-actions" role="group" :aria-label="editingAction ? `修改第${editing + 1}步动作` : '记录动作'">
                  <span class="battle-composer-label">{{ editingAction ? '改为' : '记录' }}</span>
                  <button v-if="activeSlot === BOX" type="button" class="battle-action-option" :aria-pressed="editingAction ? true : undefined" :disabled="!editingAction && !canRecord" @click="pickAction(BATTLE_INTERACTION.type)">
                    <b aria-hidden="true">{{ BATTLE_INTERACTION.symbol }}</b>{{ BATTLE_INTERACTION.label }}
                  </button>
                  <template v-else><button v-for="item in BATTLE_ACTIONS" :key="item.type" type="button" class="battle-action-option" :aria-pressed="editingAction ? editingAction.type === item.type : undefined" :disabled="!editingAction && !canRecord" @click="pickAction(item.type)">
                    <b aria-hidden="true">{{ item.symbol }}</b>{{ item.label }}
                  </button></template>
                </div>
                <p v-if="!editingAction && slot !== BOX && !operators[slot]?.name" class="battle-hint">请先在配队表选择密探，再记录动作。</p>
                <p v-else-if="!editingAction && round.actions.length >= 50" class="battle-hint">本回合已达 50 个动作上限。</p>
              </div>

              <label class="battle-round-note">本回合备注<textarea v-model="round.remark" aria-label="本回合备注" rows="2" maxlength="2000" placeholder="控血、重开条件，或需要特别注意的操作"></textarea></label>
              <div class="battle-sequence-tools"><span v-if="round.actions.length >= LIMIT_HINT">{{ round.actions.length }} / 50 个动作</span><button type="button" :disabled="rounds.length === 1" @click="removeRound"><Trash2 :size="14" aria-hidden="true" />删除本回合</button></div>
            </section>
            </td></tr>
          </template>
        </tbody>
      </table>
    </div>
    <p v-if="overflowing" class="battle-scroll-hint">左右滑动查看五位密探；点击单元格开始记录。</p>
    <div class="battle-round-toolbar"><button type="button" :disabled="rounds.length >= 50" @click="addRound"><Plus :size="16" aria-hidden="true" />新增回合</button><span v-if="rounds.length >= LIMIT_HINT">{{ rounds.length >= 50 ? '已达 50 回合上限' : `${rounds.length} / 50 回合` }}</span></div>
    <!-- 手机端录入时固定在底部的回合栏，替代页面生成栏，翻回合留在拇指区；桌面端隐藏，用编辑区顶部按钮。 -->
    <div v-if="expanded" class="battle-round-dock" role="group" aria-label="回合切换">
      <button type="button" :disabled="current === 0" @click="dockNav(-1)"><ChevronLeft :size="16" aria-hidden="true" />上一回合</button>
      <span class="battle-round-dock-title"><b aria-live="polite">第 {{ current + 1 }} 回合</b><small>{{ round.actions.length }} 步</small></span>
      <button type="button" :disabled="atLast && rounds.length >= 50" @click="dockNav(1)">{{ atLast ? '新增回合' : '下一回合' }}<component :is="atLast ? Plus : ChevronRight" :size="16" aria-hidden="true" /></button>
      <button type="button" class="battle-round-dock-close" aria-label="收起回合编辑" @click="close"><ChevronDown :size="18" aria-hidden="true" /></button>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Plus, Trash2, Undo2 } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { BATTLE_ACTIONS, BATTLE_INTERACTION, TARGET_COLORS, battleOperatorId, battleRoundRows, battleTargetUsage, isBattleInteraction } from '../../utils/battleImages.js'
import { moveBattleAction } from '../../utils/battleEditor.js'
import { dialog } from '../../utils/dialog.js'
import { useHorizontalOverflow } from '../../composables/useHorizontalOverflow.js'
const props = defineProps({ operators: { type: Array, required: true }, rounds: { type: Array, required: true }, targets: { type: Array, required: true } })
// recording：编辑区是否展开，页面据此在手机端用回合栏替换底部生成栏。
const emit = defineEmits(['recording'])
// slot 为 BOX 时表示选中「箱」（关卡互动），它不属于任何密探槽位。
const BOX = 5
const current = ref(0), slot = ref(0), target = ref(2), expanded = ref(false), renaming = ref(false)
const TARGET_POSITIONS = ['左二', '左一', '主位', '右一', '右二']
// 回合数、动作数接近上限才显示计数，平时不占位置。
const LIMIT_HINT = 40
// 编辑区在 v-for 行内渲染，用函数 ref 取唯一的标题与区块元素。
let headingEl = null, sectionEl = null
const setHeading = el => { headingEl = el }, setSection = el => { sectionEl = el }
// editing：正在修改的步骤序号；null 表示密探/目标/动作按钮用于追加新动作。
const editing = ref(null), removed = ref(null)
const scroller = ref(null), overflowing = useHorizontalOverflow(scroller)
const rows = computed(() => battleRoundRows(props.rounds, props.operators))
// 与出图一致：单目标或主目标的动作不逐格标注目标，只标注“例外”目标。
const usage = computed(() => battleTargetUsage(rows.value))
const targetPlain = index => !usage.value.multi || index === usage.value.main
const legendPlain = index => index === usage.value.main
const round = computed(() => props.rounds[current.value])
const editingAction = computed(() => editing.value === null ? null : round.value?.actions[editing.value] || null)
const activeSlot = computed(() => editingAction.value ? (isBattleInteraction(editingAction.value) ? BOX : editingAction.value.slot) : slot.value)
const activeTarget = computed(() => editingAction.value ? editingAction.value.target : target.value)
const canRecord = computed(() => (slot.value === BOX || Boolean(props.operators[slot.value]?.name)) && round.value.actions.length < 50)
const removedHere = computed(() => removed.value && removed.value.round === round.value)
const atLast = computed(() => current.value >= props.rounds.length - 1)
watch(round, () => { editing.value = null })
watch(expanded, value => emit('recording', value))
watch(() => round.value?.actions.length, () => { if (editing.value !== null && !editingAction.value) editing.value = null })
let alive = true, opener, viewObserver
// 表格横向滚动时，展开的编辑区按可见宽度贴左显示，不随表格一起滑出视口。
onMounted(() => {
  const el = scroller.value
  if (!el || typeof ResizeObserver !== 'function') return
  viewObserver = new ResizeObserver(() => el.style.setProperty('--battle-view-width', `${el.clientWidth}px`))
  viewObserver.observe(el)
})
// 草稿替换会按 revision 重建本组件，卸载时撤销录入状态，避免页面生成栏一直隐藏。
onBeforeUnmount(() => { alive = false; viewObserver?.disconnect(); if (expanded.value) emit('recording', false) })

const targetName = index => props.targets[index] || `目标${index + 1}`
const actorName = index => props.operators[index]?.name || `${index + 1}号位`
const actionSymbol = type => BATTLE_ACTIONS.find(item => item.type === type)?.symbol || '?'
const stepText = action => isBattleInteraction(action) ? `${BATTLE_INTERACTION.label}（箱）` : `${actorName(action.slot)} ${actionLabel(action.type)} ${targetName(action.target)}`
const actionLabel = type => BATTLE_ACTIONS.find(item => item.type === type)?.label || '未知动作'

async function selectCell(row, position, event) {
  opener = event?.currentTarget || opener
  current.value = row; slot.value = position; editing.value = null; expanded.value = true
  await nextTick(); revealHeading()
}
const isMobile = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 767px)').matches)
function revealHeading(focusEl = headingEl) {
  focusEl?.focus({ preventScroll: true })
  // 手机上把当前回合行滚到吸顶表头下方，编辑区紧随其后，尽量一屏内完成选人、目标与动作。
  const row = isMobile() && sectionEl?.closest('tbody')?.querySelector('tr.battle-row-current')
  if (row) row.scrollIntoView?.({ block: 'start', behavior: 'auto' })
  else headingEl?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
}
async function close() { expanded.value = false; editing.value = null; await nextTick(); opener?.focus({ preventScroll: true }) }
// 换回合时编辑区随行移动，按钮会重建：焦点回到新位置的同一按钮，便于连续翻回合。
async function goRound(index, nav) {
  if (index < 0 || index >= props.rounds.length) return
  current.value = index
  await nextTick()
  revealHeading(sectionEl?.querySelector(`[data-nav="${nav}"]:not(:disabled)`) || headingEl)
}
// 回合栏不随编辑区重建，翻回合后焦点留在栏内同一按钮；最后一回合时“下一回合”变为新增回合。
async function dockNav(offset) {
  const index = current.value + offset
  if (index >= props.rounds.length) { if (props.rounds.length < 50) props.rounds.push({ actions: [], remark: '' }); else return }
  if (index < 0) return
  current.value = index; editing.value = null
  await nextTick()
  const focused = typeof document !== 'undefined' ? document.activeElement : null
  revealHeading(focused?.closest?.('.battle-round-dock') && !focused.disabled ? null : headingEl)
}
function toggleEdit(index) { editing.value = editing.value === index ? null : index }
function pickSlot(index) {
  if (index !== BOX && !props.operators[index]?.name) return
  const action = editingAction.value
  if (!action) { slot.value = index; return }
  if ((index === BOX) === isBattleInteraction(action)) { if (index !== BOX) action.slot = index; return }
  // 密探动作与关卡互动互改：原位替换整步，出手顺序不变；改回密探时默认普攻、沿用当前目标。
  round.value.actions.splice(editing.value, 1, index === BOX ? { type: BATTLE_INTERACTION.type } : { slot: index, type: BATTLE_ACTIONS[0].type, target: target.value })
}
function pickTarget(index) {
  if (activeSlot.value === BOX) return
  if (editingAction.value) editingAction.value.target = index
  else target.value = index
}
function pickAction(type) {
  const action = editingAction.value
  if (action) { if (!isBattleInteraction(action) && type !== BATTLE_INTERACTION.type) action.type = type; return }
  if (!canRecord.value) return
  round.value.actions.push(slot.value === BOX ? { type: BATTLE_INTERACTION.type } : { slot: slot.value, type, target: target.value })
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
  await nextTick(); revealHeading()
}
</script>
