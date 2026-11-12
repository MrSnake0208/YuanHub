<template>
  <section class="battle-recorder" aria-label="战斗操作记录">
    <div class="battle-action-legend">
      <span class="battle-legend-symbols"><span class="battle-legend-prefix">操作符号：</span><b>{{ mobile ? '数字=出手顺序' : '数字 本回合全队出手顺序' }}</b><b v-for="item in legendActions" :key="item.type">{{ item.symbol }} {{ item.label }}</b><b>{{ BATTLE_INTERACTION.symbol }} {{ BATTLE_INTERACTION.label }}</b></span>
      <!-- is-unused 供手机端只列出表中实际用到的非主位目标；只打主位时不列目标。 -->
      <span class="battle-legend-targets" :class="{ 'is-single': !usage.multi }"><template v-if="mobile"> · 未标注={{ targetName(usage.main) }} · </template><template v-else>目标：</template><span v-for="(name, index) in targets" v-show="!absentTargets.includes(index)" :key="index" :class="{ 'is-unused': !usage.used.includes(index) || (mobile && index === usage.main) }"><i :class="{ 'is-plain': legendPlain(index) }" :style="legendPlain(index) ? null : { background: TARGET_COLORS[index] }" aria-hidden="true"></i>{{ targetName(index) }}<small v-if="!mobile && index === usage.main">（表中未标注即此目标）</small></span>
        <button v-if="!mobile" type="button" class="battle-target-rename" :aria-expanded="renaming" aria-controls="battle-target-fields" @click="renaming = !renaming"><Pencil :size="13" aria-hidden="true" />{{ renaming ? '完成设置' : '敌方设置' }}</button>
      </span>
    </div>
    <Teleport v-if="renaming && (!mobile || expanded)" defer to="#battle-mobile-panel-body" :disabled="!mobile">
    <div id="battle-target-fields" class="battle-target-fields" role="group" aria-label="敌方设置">
      <h3 v-if="mobile" ref="enemyHeading" tabindex="-1">敌方设置</h3>
      <p v-if="mobile" class="battle-hint">关掉不在场的位置，也可以改名</p>
      <div v-for="(_, index) in targets" :key="index" class="battle-target-field">
        <label>{{ TARGET_POSITIONS[index] }}<input v-model="targets[index]" maxlength="20" :disabled="absentTargets.includes(index)" :aria-label="`敌方${index + 1}名称（${TARGET_POSITIONS[index]}）`"></label>
        <label v-if="index !== BATTLE_MAIN_TARGET" class="battle-target-presence"><input type="checkbox" :checked="!absentTargets.includes(index)" :disabled="!absentTargets.includes(index) && targetCounts[index] > 0" :aria-label="`${TARGET_POSITIONS[index]}在场`" @change="setTargetPresent(index, $event.target.checked)">在场<span v-if="!absentTargets.includes(index) && targetCounts[index] > 0">已有 {{ targetCounts[index] }} 步</span></label>
      </div>
      <button v-if="mobile" type="button" class="battle-note-done" @click="closeEnemySettings">完成</button>
    </div>
    </Teleport>
    <div ref="scroller" class="battle-table-scroll" role="region" aria-label="回合操作表，左右滑动查看" tabindex="0">
      <table class="battle-matrix battle-action-matrix">
        <caption class="sr-only">回合行动表，数字为全队出手顺序，背景色与文字为目标</caption>
        <thead><tr><th scope="col">回合</th><th v-for="(member, index) in operators" :key="index" scope="col" :class="{ 'is-active-column': expanded && (mobile || editingAction) && activeSlot === index }"><span class="battle-slot-number">{{ index + 1 }}号位</span><button type="button" class="battle-record-identity" :aria-label="member.name ? `更换${index + 1}号位密探（当前：${member.name}）` : `选择${index + 1}号位密探`" aria-haspopup="dialog" @click="emit('pick-member', index, $event.currentTarget)"><img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt=""><strong>{{ member.name || '选择密探' }}</strong></button></th><th scope="col">备注</th></tr></thead>
        <tbody>
          <template v-for="(row, rowIndex) in rows" :key="rowIndex">
            <!-- 桌面端将回合标题与出手顺序放在当前回合行上方。 -->
            <tr v-if="!mobile && expanded && current === rowIndex" class="battle-editor-row battle-editor-row-top"><td :colspan="operators.length + 2"><div id="battle-editor-top" class="battle-inline-editor"></div></td></tr>
            <tr v-if="!mobile && expanded && current === rowIndex" class="battle-record-tools-row">
              <td><span class="battle-composer-label">目标</span></td>
              <td :colspan="operators.length"><BattleTargetRing :names="targets.map((_, i) => targetName(i))" :present="presentTargets" :active="activeTarget ?? target" :plain-index="usage.main" :disabled="activeSlot === BOX" @select="pickTarget" /></td>
              <td><div class="battle-sequence-actions">
                <button type="button" :aria-label="`${BATTLE_INTERACTION.label}（${BATTLE_INTERACTION.symbol}）`" :aria-pressed="editingAction ? isBattleInteraction(editingAction) : undefined" :disabled="!editingAction && round.actions.length >= 50" @click="recordInteraction"><b aria-hidden="true">{{ BATTLE_INTERACTION.symbol }}</b>{{ BATTLE_INTERACTION.label }}</button>
                <button type="button" :disabled="!round.actions.length" @click="undoLast"><Undo2 :size="14" aria-hidden="true" />撤回最后一步</button>
              </div></td>
            </tr>
            <tr :class="{ 'battle-row-current': expanded && current === rowIndex, 'is-alt': rowIndex % 2 === 1 }"><th scope="row"><button type="button" :aria-label="`编辑第${rowIndex + 1}回合`" :aria-expanded="expanded && current === rowIndex" @click="selectCell(rowIndex, slot, $event)">{{ rowIndex + 1 }}</button></th>
              <td v-for="(actions, index) in row.slots" :key="index" :class="{ 'is-target-cell': expanded && current === rowIndex && (mobile || editingAction) && activeSlot === index }"><button type="button" class="battle-cell-button battle-action-cell" :disabled="!operators[index].name" :aria-label="`编辑第${rowIndex + 1}回合${index + 1}号位动作`" :aria-expanded="expanded && current === rowIndex" aria-controls="battle-action-detail" @click="selectCell(rowIndex, index, $event)"><span v-if="!actions.length" :class="{ 'battle-cell-empty': operators[index].name }">{{ operators[index].name ? '+' : '—' }}</span><span v-for="action in actions" :key="action.order" class="battle-action-mark" :data-order="action.order" :class="{ 'is-box': action.box, 'is-plain': !action.box && targetPlain(action.target) }" :style="action.box || targetPlain(action.target) ? null : { background: TARGET_COLORS[action.target], '--mark-color': TARGET_COLORS[action.target] }"><b>{{ action.order }}{{ action.symbol }}</b><span v-if="!action.box && !targetPlain(action.target)" class="sr-only">打{{ targetName(action.target) }}</span></span></button></td>
              <td v-if="!mobile && expanded && current === rowIndex" class="battle-remark-editor" :rowspan="matrixActions.length + 1"><textarea :ref="setRemark" v-model="round.remark" :aria-label="`第${current + 1}回合备注`" :rows="matrixActions.length * 2 + 1" maxlength="2000" placeholder="控血、重开条件，或需要特别注意的操作"></textarea></td>
              <td v-else><button type="button" class="battle-cell-button battle-remark-cell" :aria-label="`编辑第${rowIndex + 1}回合备注`" @click="selectCell(rowIndex, slot, $event, true)"><span v-if="row.remark">{{ row.remark }}</span><span v-else class="battle-cell-empty">+</span></button></td>
            </tr>
            <template v-if="!mobile && expanded && current === rowIndex">
              <tr v-for="(item, actionIndex) in matrixActions" :key="item.type" class="battle-action-input-row" :class="{ 'is-last': actionIndex === matrixActions.length - 1 }" :aria-label="`${editingAction ? `修改第${editing + 1}步` : '记录'}${item.label}`">
                <td></td>
                <td v-for="(_, index) in operators" :key="index"><button v-if="item.type !== 'sp' || slotHasSpecial(index)" v-bind="actionButtonAttrs(index, item)" type="button" class="battle-record-action" @click="recordCell(index, item.type)"><b aria-hidden="true">{{ item.symbol }}</b><span>{{ item.label }}</span></button></td>
              </tr>
            </template>
            <!-- 手机端隐藏备注列，有备注的回合在行下显示一条贯穿整行的备注带（与操作图一致）；桌面端由 CSS 隐藏，仍用备注列。 -->
            <tr v-if="row.remark" class="battle-remark-row" :class="{ 'battle-row-current': expanded && current === rowIndex, 'is-alt': rowIndex % 2 === 1 }"><td :colspan="operators.length + (mobile ? 1 : 2)"><button type="button" class="battle-remark-band" :aria-label="`第${rowIndex + 1}回合备注：${row.remark}，点按编辑`" @click="selectCell(rowIndex, slot, $event)">{{ row.remark }}</button></td></tr>
            <!-- 同一份编辑区：桌面留在回合行下，手机移到底部，不产生隐藏的表格列。 -->
            <EditorRow v-if="expanded && current === rowIndex">
            <Teleport defer to="#battle-mobile-panel-body" :disabled="!mobile">
            <section id="battle-action-detail" :ref="setSection" class="battle-inline-editor battle-inline-footer" aria-label="当前回合编辑">
              <Teleport defer to="#battle-editor-top" :disabled="mobile">
              <header class="battle-inline-heading">
                <h3 :ref="setHeading" tabindex="-1">第 {{ current + 1 }} 回合</h3>
              </header>

              <div v-show="!panelForm" class="battle-sequence">
                <div class="battle-sequence-head">
                  <span v-if="!mobile || !round.actions.length">出手顺序</span>
                  <div v-if="mobile" class="battle-round-tools" role="group" aria-label="回合操作">
                    <button type="button" aria-label="撤回最后一步" title="撤回最后一步" :disabled="!round.actions.length" @click="undoLast"><Undo2 :size="18" aria-hidden="true" /></button>
                    <button type="button" :aria-label="`${BATTLE_INTERACTION.label}（${BATTLE_INTERACTION.symbol}）`" :aria-pressed="editingAction ? isBattleInteraction(editingAction) : undefined" :disabled="!editingAction && round.actions.length >= 50" @click="recordInteraction">{{ BATTLE_INTERACTION.symbol }}</button>
                    <button :ref="setNoteButton" type="button" :aria-label="round.remark ? '编辑备注（已有备注）' : '编辑备注'" :title="round.remark ? '编辑备注（已有备注）' : '编辑备注'" @click="openNote"><NotebookPen :size="18" aria-hidden="true" /><i v-if="round.remark" aria-hidden="true"></i></button>
                  </div>
                </div>
                <ol v-if="round.actions.length" class="battle-sequence-chips" aria-label="本回合出手顺序">
                  <li v-for="(action, index) in round.actions" :key="index">
                    <button type="button" :class="{ 'is-targeted': !isBattleInteraction(action) && !targetPlain(action.target) }" :style="!isBattleInteraction(action) && !targetPlain(action.target) ? { background: TARGET_COLORS[action.target], '--mark-color': TARGET_COLORS[action.target] } : null" :aria-pressed="editing === index" :aria-label="`第${index + 1}步：${stepText(action)}，点按修改`" @click="toggleEdit(index)">
                      <b>{{ index + 1 }}</b><template v-if="isBattleInteraction(action)"><span>{{ BATTLE_INTERACTION.label }}</span><strong>{{ BATTLE_INTERACTION.symbol }}</strong></template>
                      <template v-else><span>{{ actorName(action.slot) }}</span><strong>{{ actionSymbol(action.type) }}</strong></template>
                    </button>
                  </li>
                </ol>
                <div v-if="editingAction" class="battle-step-tools" role="group" :aria-label="`修改第${editing + 1}步：下方选择会直接改这一步`">
                  <span>修改第 {{ editing + 1 }} 步</span>
                  <button type="button" :disabled="editing === 0" :aria-label="`第${editing + 1}步提前`" :title="`第${editing + 1}步提前`" @click="moveEditing(-1)"><ArrowLeft :size="15" aria-hidden="true" /></button>
                  <button type="button" :disabled="editing === round.actions.length - 1" :aria-label="`第${editing + 1}步延后`" :title="`第${editing + 1}步延后`" @click="moveEditing(1)"><ArrowRight :size="15" aria-hidden="true" /></button>
                  <button type="button" class="battle-step-delete" :aria-label="`删除第${editing + 1}步`" :title="`删除第${editing + 1}步`" @click="removeAction(editing)"><Trash2 :size="15" aria-hidden="true" /></button>
                  <button type="button" class="battle-step-done" @click="editing = null">完成</button>
                </div>
                <p v-if="removedHere" class="battle-hint battle-undo-note" role="status">已删除第 {{ removed.index + 1 }} 步。<button type="button" class="battle-link-button" @click="restoreRemoved">撤销删除</button></p>
              </div>
              </Teleport>

              <div v-show="!panelForm" class="battle-composer">
                <div v-if="mobile" class="battle-composer-row battle-composer-ring">
                  <div class="battle-enemy-controls">
                    <span class="battle-composer-label">目标</span>
                    <button v-if="mobile" :ref="setEnemyButton" type="button" class="battle-enemy-settings" :aria-expanded="renaming" aria-controls="battle-target-fields" @click="openEnemySettings">敌方设置</button>
                  </div>
                  <BattleTargetRing :names="targets.map((_, i) => targetName(i))" :present="presentTargets" :active="activeTarget ?? target" :plain-index="usage.main" :disabled="activeSlot === BOX" @select="pickTarget" />
                </div>
                <div v-if="mobile" class="battle-composer-row battle-composer-grid" role="group" :aria-label="editingAction ? `修改第${editing + 1}步动作` : '记录动作'">
                  <span class="battle-composer-label" aria-hidden="true"></span>
                  <span v-for="(member, index) in operators" :key="index" class="battle-grid-heading"><img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt=""><span>{{ member.name || `${index + 1}号位` }}</span></span>
                  <template v-for="item in matrixActions" :key="item.type">
                    <span class="battle-composer-label">{{ item.label.slice(0, 2) }}</span>
                    <template v-for="(_, index) in operators" :key="index">
                      <button v-if="item.type !== 'sp' || slotHasSpecial(index)" v-bind="actionButtonAttrs(index, item)" type="button" @click="recordCell(index, item.type)"><b aria-hidden="true">{{ item.symbol }}</b></button>
                      <span v-else aria-hidden="true"></span>
                    </template>
                  </template>
                </div>
                <p v-if="!editingAction && !operators.some(o => o.name)" class="battle-hint">请先在配队表选择密探，再记录动作。</p>
                <p v-else-if="!editingAction && round.actions.length >= 50" class="battle-hint">本回合已达 50 个动作上限。</p>
              </div>

              <label v-if="mobile" v-show="noteMode" class="battle-round-note">第 {{ current + 1 }} 回合备注<textarea v-model="round.remark" :aria-label="`第${current + 1}回合备注`" rows="2" maxlength="2000" placeholder="控血、重开条件，或需要特别注意的操作"></textarea></label>
              <button v-if="mobile && noteMode" type="button" class="battle-note-done" @click="finishNote">完成</button>
              <div v-if="!mobile" class="battle-round-nav">
                <button type="button" :disabled="current === 0" data-nav="prev" @click="goRound(current - 1, 'prev')"><ChevronLeft :size="15" aria-hidden="true" />上一回合</button>
                <button v-if="current < rounds.length - 1" type="button" data-nav="next" @click="goRound(current + 1, 'next')">下一回合<ChevronRight :size="15" aria-hidden="true" /></button>
                <button v-else type="button" :disabled="rounds.length >= 50" :title="rounds.length >= 50 ? '已达 50 回合上限' : undefined" @click="addRound">新增下一回合<Plus :size="15" aria-hidden="true" /></button>
                <button type="button" class="battle-collapse" @click="close">收起<ChevronUp :size="15" aria-hidden="true" /></button>
              </div>
              <div class="battle-sequence-tools"><span v-if="round.actions.length >= LIMIT_HINT">{{ round.actions.length }} / 50 个动作</span><button type="button" :disabled="!round.actions.length || rounds.length >= 50" @click="copyRound"><Copy :size="14" aria-hidden="true" />复制到下一回合</button><button type="button" :disabled="rounds.length === 1" @click="removeRound"><Trash2 :size="14" aria-hidden="true" />删除本回合</button></div>
            </section>
            </Teleport>
            </EditorRow>
          </template>
        </tbody>
      </table>
    </div>
    <p v-if="overflowing" class="battle-scroll-hint">左右滑动查看五位密探；点击单元格开始记录。</p>
    <div class="battle-round-toolbar"><button type="button" :disabled="rounds.length >= 50" @click="addRound"><Plus :size="16" aria-hidden="true" />新增回合</button><span v-if="rounds.length >= LIMIT_HINT">{{ rounds.length >= 50 ? '已达 50 回合上限' : `${rounds.length} / 50 回合` }}</span></div>
    <!-- 面板不锁页面滚动，仍可点表格其它回合直接切换。 -->
    <div v-if="expanded" ref="panel" class="battle-mobile-panel">
      <div id="battle-mobile-panel-body"></div>
      <div v-show="!panelForm" class="battle-round-dock" role="group" aria-label="回合切换">
        <button type="button" aria-label="上一回合" title="上一回合" :disabled="current === 0" @click="dockNav(-1)"><ChevronLeft :size="16" aria-hidden="true" /></button>
        <button ref="roundMenuButton" type="button" class="battle-round-dock-title" aria-haspopup="menu" :aria-expanded="roundMenuOpen" :aria-label="`第${current + 1}回合操作`" @click="roundMenuOpen = !roundMenuOpen"><b aria-live="polite">第 {{ current + 1 }} 回合</b><small>{{ round.actions.length }} 步</small><component :is="roundMenuOpen ? ChevronDown : ChevronUp" :size="12" aria-hidden="true" /></button>
        <button type="button" :aria-label="atLast ? '新增回合' : '下一回合'" :title="atLast ? '新增回合' : '下一回合'" :disabled="atLast && rounds.length >= 50" @click="dockNav(1)"><component :is="atLast ? Plus : ChevronRight" :size="16" aria-hidden="true" /></button>
        <button type="button" class="battle-round-dock-close" aria-label="收起回合编辑" @click="close"><ChevronDown :size="18" aria-hidden="true" /></button>
        <button type="button" class="battle-primary battle-round-export" aria-label="生成操作图" :disabled="exportDisabled" @click="emit('export', $event.currentTarget)"><Download :size="16" aria-hidden="true" />生成图</button>
        <div v-if="roundMenuOpen" ref="roundMenu" class="battle-round-menu" role="menu" :aria-label="`第${current + 1}回合操作`">
          <button type="button" role="menuitem" :disabled="!round.actions.length || rounds.length >= 50" @click="roundMenuOpen = false; copyRound()">复制到下一回合</button>
          <button type="button" role="menuitem" class="battle-round-delete" :disabled="rounds.length === 1" @click="roundMenuOpen = false; removeRound()">删除本回合</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Download, NotebookPen, Pencil, Plus, Trash2, Undo2 } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import BattleTargetRing from './BattleTargetRing.vue'
import { BATTLE_ACTIONS, BATTLE_INTERACTION, BATTLE_MAIN_TARGET, TARGET_COLORS, battleOperatorHasSpecial, battleOperatorId, battleRoundRows, battleTargetUsage, isBattleInteraction } from '../../utils/battleImages.js'
import { moveBattleAction } from '../../utils/battleEditor.js'
import { dialog } from '../../utils/dialog.js'
import { useHorizontalOverflow } from '../../composables/useHorizontalOverflow.js'
const props = defineProps({ operators: { type: Array, required: true }, rounds: { type: Array, required: true }, targets: { type: Array, required: true }, absentTargets: { type: Array, required: true }, exportDisabled: Boolean })
// recording：编辑区是否展开，页面据此在手机端用回合栏替换底部生成栏。
const emit = defineEmits(['recording', 'pick-member', 'export'])
// BOX 仅表示修改箱步骤时的 activeSlot，不是可选的出手位。
const BOX = 5
const current = ref(0), slot = ref(0), target = ref(2), expanded = ref(false), renaming = ref(false)
const mobile = ref(false), panel = ref(null), noteMode = ref(false)
const panelForm = computed(() => mobile.value && (noteMode.value || renaming.value))
const enemyHeading = ref(null)
const roundMenuOpen = ref(false), roundMenu = ref(null), roundMenuButton = ref(null)
// 手机只输出 Teleport 锚点，桌面保留原来的 tr/td 结构及编辑区位置。
const EditorRow = (_, { slots }) => mobile.value ? slots.default() : h('tr', { class: 'battle-editor-row' }, [h('td', { colspan: props.operators.length + 2 }, slots.default())])
const TARGET_POSITIONS = ['左二', '左一', '主位', '右一', '右二']
const presentTargets = computed(() => props.targets.map((_, index) => index).filter(index => !props.absentTargets.includes(index)))
const targetCounts = computed(() => {
  const counts = [0, 0, 0, 0, 0]
  for (const round of props.rounds) {
    for (const action of round.actions) if (!isBattleInteraction(action)) counts[action.target]++
  }
  return counts
})
function setTargetPresent(index, present) {
  if (index === BATTLE_MAIN_TARGET) return
  const absentIndex = props.absentTargets.indexOf(index)
  if (present) {
    if (absentIndex !== -1) props.absentTargets.splice(absentIndex, 1)
  } else if (absentIndex === -1 && !targetCounts.value[index]) {
    props.absentTargets.push(index)
    if (target.value === index) target.value = BATTLE_MAIN_TARGET
  }
}
// 回合数、动作数接近上限才显示计数，平时不占位置。
const LIMIT_HINT = 40
// 编辑区在 v-for 行内渲染，用函数 ref 取唯一的标题与区块元素。
let headingEl = null, sectionEl = null, noteButton = null, enemyButton = null, remarkEl = null
let noteViewportCleanup = null
function clearNoteViewportListener() {
  noteViewportCleanup?.()
  noteViewportCleanup = null
}
const setHeading = el => { headingEl = el }, setSection = el => { sectionEl = el }, setNoteButton = el => { noteButton = el }
const setEnemyButton = el => { enemyButton = el }
const setRemark = el => { remarkEl = el }
// editing：正在修改的步骤序号；null 表示密探/目标/动作按钮用于追加新动作。
const editing = ref(null), removed = ref(null)
const scroller = ref(null), overflowing = useHorizontalOverflow(scroller)
const rows = computed(() => battleRoundRows(props.rounds, props.operators))
// 与出图一致：主位动作无色，其余目标按位置上色。
const usage = computed(() => battleTargetUsage(rows.value))
const targetPlain = index => index === usage.value.main
const legendPlain = index => index === usage.value.main
const round = computed(() => props.rounds[current.value])
const editingAction = computed(() => editing.value === null ? null : round.value?.actions[editing.value] || null)
const activeSlot = computed(() => editingAction.value ? (isBattleInteraction(editingAction.value) ? BOX : editingAction.value.slot) : slot.value)
const slotHasSpecial = index => battleOperatorHasSpecial(props.operators[index]) || (editingAction.value?.type === 'sp' && editingAction.value.slot === index)
const matrixActions = computed(() => ['ultimate', 'attack', 'defense', 'sp'].filter(type => type !== 'sp' || props.operators.some((_, index) => slotHasSpecial(index))).map(type => BATTLE_ACTIONS.find(item => item.type === type)))
const legendActions = computed(() => BATTLE_ACTIONS.filter(item => item.type !== 'sp' || props.operators.some(battleOperatorHasSpecial) || props.rounds.some(round => round.actions.some(action => action.type === 'sp'))))
const activeTarget = computed(() => editingAction.value ? editingAction.value.target : target.value)
const removedHere = computed(() => removed.value && removed.value.round === round.value)
const atLast = computed(() => current.value >= props.rounds.length - 1)
watch(round, () => { editing.value = null; noteMode.value = false; roundMenuOpen.value = false })
watch(noteMode, value => { if (!value) clearNoteViewportListener() }, { flush: 'sync' })
watch(expanded, value => { if (!value) roundMenuOpen.value = false; emit('recording', value) })
watch(() => round.value?.actions.length, () => { if (editing.value !== null && !editingAction.value) editing.value = null })
watch([() => round.value?.actions.length, editing, current, mobile, expanded], async () => {
  if (!mobile.value || !expanded.value) return
  await nextTick()
  keepCurrentRowVisible()
  const chips = sectionEl?.querySelector('.battle-sequence-chips')
  const chip = editing.value === null ? chips?.lastElementChild : chips?.children[editing.value]
  if (chip) chips.scrollTo?.({ left: chip.offsetLeft, behavior: 'auto' })
})
watch(panel, el => {
  panelObserver?.disconnect()
  panelOwner?.style.removeProperty('--battle-panel-height')
  panelOwner = el?.closest('.battle-tool')
  if (!el || typeof ResizeObserver !== 'function') return
  panelObserver = new ResizeObserver(() => {
    panelOwner?.style.setProperty('--battle-panel-height', `${el.getBoundingClientRect().height}px`)
    keepCurrentRowVisible()
  })
  panelObserver.observe(el)
}, { flush: 'post' })
let alive = true, opener, viewObserver, panelObserver, panelOwner, mediaQuery, recordingScrollY = 0
function onMenuPointerdown(event) {
  if (!roundMenu.value?.contains(event.target) && !roundMenuButton.value?.contains(event.target)) roundMenuOpen.value = false
}
function onMenuKeydown(event) {
  if (event.key !== 'Escape' || !roundMenuOpen.value) return
  event.preventDefault()
  roundMenuOpen.value = false
  roundMenuButton.value?.focus({ preventScroll: true })
}
const updateMobile = () => { mobile.value = Boolean(mediaQuery?.matches); noteMode.value = false; renaming.value = false }
onMounted(() => {
  document.addEventListener('pointerdown', onMenuPointerdown)
  document.addEventListener('keydown', onMenuKeydown)
  mediaQuery = window.matchMedia?.('(max-width: 767px)')
  updateMobile()
  mediaQuery?.addEventListener('change', updateMobile)
  // 桌面编辑区随可见宽度贴左，不跟表格一起滑出视口。
  const el = scroller.value
  if (!el || typeof ResizeObserver !== 'function') return
  viewObserver = new ResizeObserver(() => el.style.setProperty('--battle-view-width', `${el.clientWidth}px`))
  viewObserver.observe(el)
})
// 草稿替换会按 revision 重建本组件，卸载时撤销录入状态，避免页面生成栏一直隐藏。
onBeforeUnmount(() => { alive = false; clearNoteViewportListener(); document.removeEventListener('pointerdown', onMenuPointerdown); document.removeEventListener('keydown', onMenuKeydown); viewObserver?.disconnect(); panelObserver?.disconnect(); panelOwner?.style.removeProperty('--battle-panel-height'); mediaQuery?.removeEventListener('change', updateMobile); if (expanded.value) emit('recording', false) })

const targetName = index => props.targets[index] || `目标${index + 1}`
const actorName = index => props.operators[index]?.name || `${index + 1}号位`
const actionSymbol = type => BATTLE_ACTIONS.find(item => item.type === type)?.symbol || '?'
const stepText = action => isBattleInteraction(action) ? `${BATTLE_INTERACTION.label}（${BATTLE_INTERACTION.symbol}）` : `${actorName(action.slot)} ${actionLabel(action.type)} ${targetName(action.target)}`
const actionLabel = type => BATTLE_ACTIONS.find(item => item.type === type)?.label || '未知动作'

function actionButtonAttrs(index, item) {
  const member = props.operators[index]
  return {
    'data-action': item.type,
    'aria-label': `${member.name || `${index + 1}号位`} ${item.label}`,
    'aria-pressed': editingAction.value ? editingAction.value.slot === index && editingAction.value.type === item.type : undefined,
    disabled: !member.name || (!editingAction.value && round.value.actions.length >= 50),
  }
}

async function selectCell(row, position, event, focusRemark = false) {
  if (mobile.value && !expanded.value) recordingScrollY = window.scrollY
  opener = event?.currentTarget || opener
  current.value = row; slot.value = position; editing.value = null; noteMode.value = false; expanded.value = true
  await nextTick()
  if (!mobile.value && focusRemark) {
    remarkEl?.focus({ preventScroll: true })
    remarkEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
  } else revealHeading()
}
function revealHeading(focusEl = headingEl) {
  focusEl?.focus({ preventScroll: true })
  // 手机把当前回合行滚到吸顶表头下方，底部面板保持可见。
  const row = mobile.value && scroller.value?.querySelector('tr.battle-row-current')
  if (row) row.scrollIntoView?.({ block: 'start', behavior: 'auto' })
  else if (!mobile.value) headingEl?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
}
function keepCurrentRowVisible() {
  if (!mobile.value || !expanded.value || !panel.value) return
  const row = scroller.value?.querySelector('tr.battle-row-current')
  if (!row) return
  const rowRect = row.getBoundingClientRect()
  const overlap = rowRect.bottom - panel.value.getBoundingClientRect().top
  if (overlap <= 0) return
  const headerBottom = scroller.value.querySelector('thead')?.getBoundingClientRect().bottom ?? 0
  window.scrollBy(0, Math.min(overlap + 8, Math.max(0, rowRect.top - headerBottom)))
}
async function openEnemySettings() {
  renaming.value = true
  await nextTick()
  enemyHeading.value?.focus({ preventScroll: true })
}
async function closeEnemySettings() {
  renaming.value = false
  await nextTick()
  enemyButton?.focus({ preventScroll: true })
}
async function close() {
  expanded.value = false; editing.value = null; noteMode.value = false; renaming.value = false
  await nextTick()
  if (mobile.value) window.scrollTo(0, recordingScrollY)
  // 桌面备注按钮在展开时被文本框替换，收起后找回新渲染的按钮。
  const focusEl = !mobile.value && opener?.classList.contains('battle-remark-cell')
    ? scroller.value?.querySelector(`[aria-label="编辑第${current.value + 1}回合备注"]`) : opener
  focusEl?.focus({ preventScroll: true })
}
async function openNote() {
  clearNoteViewportListener()
  noteMode.value = true
  await nextTick()
  if (!alive || !noteMode.value) return
  const textarea = sectionEl?.querySelector('textarea')
  if (!mobile.value) {
    textarea?.focus({ preventScroll: true })
    return
  }
  const viewport = window.visualViewport
  if (viewport && textarea) {
    const onResize = () => {
      clearNoteViewportListener()
      if (textarea.getBoundingClientRect().bottom > viewport.offsetTop + viewport.height) textarea.scrollIntoView({ block: 'nearest' })
    }
    noteViewportCleanup = () => viewport.removeEventListener('resize', onResize)
    viewport.addEventListener('resize', onResize, { once: true })
  }
  textarea?.focus()
}
async function finishNote() {
  noteMode.value = false
  await nextTick(); (noteButton || headingEl || panel.value?.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true })
}
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
  revealHeading(focused?.closest?.('.battle-round-dock') && !focused.disabled ? null : panel.value?.querySelector('.battle-round-dock button:not(:disabled)') || headingEl)
}
function toggleEdit(index) { editing.value = editing.value === index ? null : index }
function recordCell(index, type) {
  if (!props.operators[index]?.name || (type === 'sp' && !slotHasSpecial(index))) return
  const action = editingAction.value
  if (action) {
    if (isBattleInteraction(action)) round.value.actions.splice(editing.value, 1, { slot: index, type, target: target.value })
    else { action.slot = index; action.type = type }
    return
  }
  if (round.value.actions.length >= 50) return
  slot.value = index
  round.value.actions.push({ slot: index, type, target: target.value })
  flashAddedAction()
}
function pickTarget(index) {
  if (activeSlot.value === BOX) return
  if (editingAction.value) editingAction.value.target = index
  else target.value = index
}
function recordInteraction() {
  if (editingAction.value) round.value.actions.splice(editing.value, 1, { type: BATTLE_INTERACTION.type })
  else if (round.value.actions.length < 50) {
    round.value.actions.push({ type: BATTLE_INTERACTION.type })
    flashAddedAction()
  }
}
async function flashAddedAction() {
  const addedRound = round.value, order = addedRound.actions.length, action = addedRound.actions[order - 1]
  await nextTick()
  if (!alive || round.value !== addedRound || addedRound.actions[order - 1] !== action || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
  const mark = scroller.value?.querySelector(`tr.battle-row-current .battle-action-mark[data-order="${order}"]`)
  mark?.animate?.([
    { outline: '2px solid var(--battle-accent)', outlineOffset: '2px' },
    { outline: '2px solid transparent', outlineOffset: '2px' },
  ], { duration: 600, easing: 'ease-out' })
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
  const absentIndex = props.absentTargets.indexOf(item.action.target)
  if (absentIndex !== -1) props.absentTargets.splice(absentIndex, 1)
  item.round.actions.splice(Math.min(item.index, item.round.actions.length), 0, item.action)
  removed.value = null
}
function addRound() {
  if (props.rounds.length >= 50) return
  props.rounds.push({ actions: [], remark: '' })
  selectCell(props.rounds.length - 1, slot.value)
}
async function copyRound() {
  if (!round.value.actions.length || props.rounds.length >= 50) return
  props.rounds.splice(current.value + 1, 0, { actions: round.value.actions.map(action => ({ ...action })), remark: '' })
  current.value += 1
  await nextTick(); revealHeading()
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
