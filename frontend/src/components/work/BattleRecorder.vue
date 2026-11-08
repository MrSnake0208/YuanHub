<template>
  <section class="battle-recorder" aria-label="战斗操作记录">
    <div class="battle-action-legend">
      <span class="battle-legend-symbols"><span class="battle-legend-prefix">操作符号：</span><b>{{ mobile ? '数字=出手顺序' : '数字 本回合全队出手顺序' }}</b><b v-for="item in BATTLE_ACTIONS" :key="item.type">{{ item.symbol }} {{ item.label }}</b><b>{{ BATTLE_INTERACTION.symbol }} {{ BATTLE_INTERACTION.label }}</b></span>
      <!-- is-unused 供手机端只列出表中实际用到的目标；单目标时整组目标都不列。 -->
      <span class="battle-legend-targets" :class="{ 'is-single': !usage.multi }"><template v-if="mobile"> · 未标注={{ targetName(usage.main ?? target) }} · </template><template v-else>目标：</template><span v-for="(name, index) in targets" :key="index" :class="{ 'is-unused': !usage.used.includes(index) || (mobile && index === usage.main) }"><i :class="{ 'is-plain': legendPlain(index) }" :style="legendPlain(index) ? null : { background: TARGET_COLORS[index] }" aria-hidden="true"></i><template v-if="mobile">{{ index + 1 }}</template>{{ targetName(index) }}<small v-if="!mobile && index === usage.main">（表中未标注即此目标）</small></span>
        <button type="button" class="battle-target-rename" :aria-label="mobile ? '改名' : undefined" :title="mobile ? (renaming ? '完成改名' : '改名') : undefined" :aria-expanded="renaming" aria-controls="battle-target-fields" @click="renaming = !renaming"><Pencil :size="13" aria-hidden="true" /><template v-if="!mobile">{{ renaming ? '完成改名' : '改名' }}</template></button>
      </span>
    </div>
    <div v-if="renaming" id="battle-target-fields" class="battle-target-fields" role="group" aria-label="敌方名称"><label v-for="(_, index) in targets" :key="index">{{ TARGET_POSITIONS[index] }}<input v-model="targets[index]" maxlength="20" :aria-label="`敌方${index + 1}名称（${TARGET_POSITIONS[index]}）`"></label></div>
    <div ref="scroller" class="battle-table-scroll" role="region" aria-label="回合操作表，左右滑动查看" tabindex="0">
      <table class="battle-matrix battle-action-matrix">
        <caption class="sr-only">回合行动表，数字为全队出手顺序，背景色与文字为目标</caption>
        <thead><tr><th scope="col">回合</th><th v-for="(member, index) in operators" :key="index" scope="col" :class="{ 'is-active-column': expanded && activeSlot === index }"><span class="battle-slot-number">{{ index + 1 }}号位</span><button type="button" class="battle-record-identity" :aria-label="member.name ? `更换${index + 1}号位密探（当前：${member.name}）` : `选择${index + 1}号位密探`" aria-haspopup="dialog" @click="emit('pick-member', index, $event.currentTarget)"><img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt=""><strong>{{ member.name || '选择密探' }}</strong></button></th><th scope="col">备注</th></tr></thead>
        <tbody>
          <template v-for="(row, rowIndex) in rows" :key="rowIndex">
            <tr :class="{ 'battle-row-current': expanded && current === rowIndex, 'is-alt': rowIndex % 2 === 1 }"><th scope="row"><button type="button" :aria-label="`编辑第${rowIndex + 1}回合`" :aria-expanded="expanded && current === rowIndex" @click="selectCell(rowIndex, slot, $event)">{{ rowIndex + 1 }}</button></th>
              <td v-for="(actions, index) in row.slots" :key="index" :class="{ 'is-target-cell': expanded && current === rowIndex && activeSlot === index }"><button type="button" class="battle-cell-button battle-action-cell" :disabled="!operators[index].name" :aria-label="`编辑第${rowIndex + 1}回合${index + 1}号位动作`" :aria-expanded="expanded && current === rowIndex" aria-controls="battle-action-detail" @click="selectCell(rowIndex, index, $event)"><span v-if="!actions.length" :class="{ 'battle-cell-empty': operators[index].name }">{{ operators[index].name ? '+' : '—' }}</span><span v-for="action in actions" :key="action.order" class="battle-action-mark" :class="{ 'is-box': action.box, 'is-plain': !action.box && targetPlain(action.target) }" :style="action.box || targetPlain(action.target) ? null : { background: TARGET_COLORS[action.target], '--mark-color': TARGET_COLORS[action.target] }"><b>{{ action.order }}{{ action.symbol }}</b><span v-if="!action.box && !targetPlain(action.target)" class="sr-only">打{{ targetName(action.target) }}</span></span></button></td>
              <td><button type="button" class="battle-cell-button battle-remark-cell" :aria-label="`编辑第${rowIndex + 1}回合备注`" @click="selectCell(rowIndex, slot, $event)"><span v-if="row.remark">{{ row.remark }}</span><span v-else class="battle-cell-empty">+</span></button></td>
            </tr>
            <!-- 手机端隐藏备注列，有备注的回合在行下显示一条贯穿整行的备注带（与操作图一致）；桌面端隐藏，仍用备注列。 -->
            <tr v-if="row.remark" class="battle-remark-row" :class="{ 'battle-row-current': expanded && current === rowIndex, 'is-alt': rowIndex % 2 === 1 }"><td :colspan="operators.length + (mobile ? 1 : 2)"><button type="button" class="battle-remark-band" :aria-label="`第${rowIndex + 1}回合备注：${row.remark}，点按编辑`" @click="selectCell(rowIndex, slot, $event)">{{ row.remark }}</button></td></tr>
            <!-- 同一份编辑区：桌面留在回合行下，手机移到底部，不产生隐藏的表格列。 -->
            <EditorRow v-if="expanded && current === rowIndex">
            <Teleport defer to="#battle-mobile-panel-body" :disabled="!mobile">
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

              <div v-show="!mobile || !noteMode" class="battle-sequence">
                <div v-if="round.actions.length" class="battle-sequence-head">
                  <span>出手顺序</span>
                  <button type="button" :disabled="!round.actions.length" @click="undoLast"><Undo2 :size="14" aria-hidden="true" />撤回最后一步</button>
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

              <div v-show="!mobile || !noteMode" class="battle-composer">
                <div class="battle-composer-row battle-composer-actors" role="group" aria-label="出手方">
                  <span class="battle-composer-label">出手</span>
                  <button v-for="(member, index) in operators" :key="index" type="button" class="battle-actor-option" :disabled="!member.name" :aria-pressed="activeSlot === index" @click="pickSlot(index)">
                    <img v-if="portraits[member.id || battleOperatorId(member.name)]" :src="portraits[member.id || battleOperatorId(member.name)]" alt=""><span class="battle-actor-name">{{ member.name || `${index + 1}号位` }}</span>
                  </button>
                </div>
                <div class="battle-composer-row battle-composer-targets" role="group" aria-label="动作目标">
                  <span class="battle-composer-label">目标</span>
                  <button v-for="(name, index) in targets" :key="index" type="button" class="battle-target-option" :aria-label="mobile ? `${index + 1}：${targetName(index)}` : undefined" :title="mobile ? targetName(index) : undefined" :aria-pressed="activeSlot !== BOX && activeTarget === index" :disabled="activeSlot === BOX" @click="pickTarget(index)">
                    <i :style="{ background: TARGET_COLORS[index] }" aria-hidden="true"></i><span><template v-if="mobile"><b>{{ index + 1 }}</b><span class="battle-target-short">{{ battleTargetShortName(targetName(index)) }}</span></template><template v-else>{{ targetName(index) }}</template></span>
                  </button>
                </div>
                <div class="battle-composer-row battle-composer-actions" role="group" :aria-label="editingAction ? `修改第${editing + 1}步动作` : '记录动作'">
                  <span class="battle-composer-label">{{ editingAction ? '改为' : '记录' }}</span>
                  <button v-for="item in BATTLE_ACTIONS" :key="item.type" type="button" class="battle-action-option" :aria-pressed="editingAction ? editingAction.type === item.type : undefined" :disabled="editingAction ? isBattleInteraction(editingAction) : !canRecord" @click="pickAction(item.type)">
                    <b aria-hidden="true">{{ item.symbol }}</b>{{ item.label }}
                  </button>
                  <button type="button" class="battle-action-option" :aria-label="`${BATTLE_INTERACTION.label}（箱）`" :aria-pressed="editingAction ? isBattleInteraction(editingAction) : undefined" :disabled="!editingAction && round.actions.length >= 50" @click="pickAction(BATTLE_INTERACTION.type)"><b aria-hidden="true">{{ BATTLE_INTERACTION.symbol }}</b><span class="battle-actor-name">{{ BATTLE_INTERACTION.label }}</span></button>
                </div>
                <p v-if="editingAction && isBattleInteraction(editingAction)" class="battle-hint">要改回密探动作，请先在上方「出手」选择密探。</p>
                <p v-else-if="!editingAction && !operators[slot]?.name" class="battle-hint">请先在配队表选择密探，再记录动作。</p>
                <p v-else-if="!editingAction && round.actions.length >= 50" class="battle-hint">本回合已达 50 个动作上限。</p>
              </div>

              <label v-show="!mobile || noteMode" class="battle-round-note">本回合备注<textarea v-model="round.remark" aria-label="本回合备注" rows="2" maxlength="2000" placeholder="控血、重开条件，或需要特别注意的操作"></textarea></label>
              <button v-if="mobile && noteMode" type="button" class="battle-note-done" @click="finishNote">完成</button>
              <div class="battle-sequence-tools"><span v-if="round.actions.length >= LIMIT_HINT">{{ round.actions.length }} / 50 个动作</span><button type="button" :disabled="rounds.length === 1" @click="removeRound"><Trash2 :size="14" aria-hidden="true" />删除本回合</button></div>
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
      <div v-show="!noteMode" class="battle-round-dock" role="group" aria-label="回合切换">
        <button type="button" aria-label="上一回合" title="上一回合" :disabled="current === 0" @click="dockNav(-1)"><ChevronLeft :size="16" aria-hidden="true" /></button>
        <span class="battle-round-dock-title"><b aria-live="polite">第 {{ current + 1 }} 回合</b><small>{{ round.actions.length }} 步</small></span>
        <button type="button" :aria-label="atLast ? '新增回合' : '下一回合'" :title="atLast ? '新增回合' : '下一回合'" :disabled="atLast && rounds.length >= 50" @click="dockNav(1)"><component :is="atLast ? Plus : ChevronRight" :size="16" aria-hidden="true" /></button>
        <div ref="moreMenu" class="battle-round-more" @keydown.esc.stop.prevent="closeMore(true)">
          <button type="button" aria-label="更多回合操作" :aria-expanded="menuOpen" aria-controls="battle-round-menu" @click="menuOpen = !menuOpen">⋯</button>
          <div v-if="menuOpen" id="battle-round-menu" class="battle-round-menu" role="group" aria-label="更多回合操作">
            <button type="button" @click="openNote">备注</button>
            <button type="button" :disabled="!round.actions.length" @click="closeMore(true); undoLast()">撤回最后一步</button>
            <button type="button" :disabled="rounds.length === 1" @click="closeMore(true); removeRound()">删除本回合</button>
          </div>
        </div>
        <button type="button" class="battle-round-dock-close" aria-label="收起回合编辑" @click="close"><ChevronDown :size="18" aria-hidden="true" /></button>
        <button type="button" class="battle-primary battle-round-export" aria-label="生成操作图" :disabled="exportDisabled" @click="emit('export', $event.currentTarget)"><Download :size="16" aria-hidden="true" />生成图</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Pencil, Plus, Trash2, Undo2 } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { BATTLE_ACTIONS, BATTLE_INTERACTION, TARGET_COLORS, battleOperatorId, battleRoundRows, battleTargetShortName, battleTargetUsage, isBattleInteraction } from '../../utils/battleImages.js'
import { moveBattleAction } from '../../utils/battleEditor.js'
import { dialog } from '../../utils/dialog.js'
import { useHorizontalOverflow } from '../../composables/useHorizontalOverflow.js'
const props = defineProps({ operators: { type: Array, required: true }, rounds: { type: Array, required: true }, targets: { type: Array, required: true }, exportDisabled: Boolean })
// recording：编辑区是否展开，页面据此在手机端用回合栏替换底部生成栏。
const emit = defineEmits(['recording', 'pick-member', 'export'])
// BOX 仅表示修改箱步骤时的 activeSlot，不是可选的出手位。
const BOX = 5
const current = ref(0), slot = ref(0), target = ref(2), expanded = ref(false), renaming = ref(false)
const mobile = ref(false), panel = ref(null), moreMenu = ref(null), menuOpen = ref(false), noteMode = ref(false)
// 手机只输出 Teleport 锚点，桌面保留原来的 tr/td 结构及编辑区位置。
const EditorRow = (_, { slots }) => mobile.value ? slots.default() : h('tr', { class: 'battle-editor-row' }, [h('td', { colspan: props.operators.length + 2 }, slots.default())])
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
const canRecord = computed(() => Boolean(props.operators[slot.value]?.name) && round.value.actions.length < 50)
const removedHere = computed(() => removed.value && removed.value.round === round.value)
const atLast = computed(() => current.value >= props.rounds.length - 1)
watch(round, () => { editing.value = null; noteMode.value = false; menuOpen.value = false })
watch(expanded, value => emit('recording', value))
watch(() => round.value?.actions.length, () => { if (editing.value !== null && !editingAction.value) editing.value = null })
watch([() => round.value?.actions.length, editing, current, mobile, expanded], async () => {
  if (!mobile.value || !expanded.value) return
  await nextTick()
  const chips = sectionEl?.querySelector('.battle-sequence-chips')
  const chip = editing.value === null ? chips?.lastElementChild : chips?.children[editing.value]
  if (chip) chips.scrollTo?.({ left: chip.offsetLeft, behavior: 'auto' })
})
watch(panel, el => {
  panelObserver?.disconnect()
  panelOwner?.style.removeProperty('--battle-panel-height')
  panelOwner = el?.closest('.battle-tool')
  if (!el || typeof ResizeObserver !== 'function') return
  panelObserver = new ResizeObserver(() => panelOwner?.style.setProperty('--battle-panel-height', `${el.getBoundingClientRect().height}px`))
  panelObserver.observe(el)
}, { flush: 'post' })
let alive = true, opener, viewObserver, panelObserver, panelOwner, mediaQuery
const updateMobile = () => { mobile.value = Boolean(mediaQuery?.matches); noteMode.value = false; menuOpen.value = false }
const onOutside = event => { if (menuOpen.value && !moreMenu.value?.contains(event.target)) closeMore() }
onMounted(() => {
  mediaQuery = window.matchMedia?.('(max-width: 767px)')
  updateMobile()
  mediaQuery?.addEventListener('change', updateMobile)
  document.addEventListener('pointerdown', onOutside)
  // 桌面编辑区随可见宽度贴左，不跟表格一起滑出视口。
  const el = scroller.value
  if (!el || typeof ResizeObserver !== 'function') return
  viewObserver = new ResizeObserver(() => el.style.setProperty('--battle-view-width', `${el.clientWidth}px`))
  viewObserver.observe(el)
})
// 草稿替换会按 revision 重建本组件，卸载时撤销录入状态，避免页面生成栏一直隐藏。
onBeforeUnmount(() => { alive = false; viewObserver?.disconnect(); panelObserver?.disconnect(); panelOwner?.style.removeProperty('--battle-panel-height'); mediaQuery?.removeEventListener('change', updateMobile); document.removeEventListener('pointerdown', onOutside); if (expanded.value) emit('recording', false) })

const targetName = index => props.targets[index] || `目标${index + 1}`
const actorName = index => props.operators[index]?.name || `${index + 1}号位`
const actionSymbol = type => BATTLE_ACTIONS.find(item => item.type === type)?.symbol || '?'
const stepText = action => isBattleInteraction(action) ? `${BATTLE_INTERACTION.label}（箱）` : `${actorName(action.slot)} ${actionLabel(action.type)} ${targetName(action.target)}`
const actionLabel = type => BATTLE_ACTIONS.find(item => item.type === type)?.label || '未知动作'

async function selectCell(row, position, event) {
  opener = event?.currentTarget || opener
  current.value = row; slot.value = position; editing.value = null; noteMode.value = false; menuOpen.value = false; expanded.value = true
  await nextTick(); revealHeading()
}
function revealHeading(focusEl = headingEl) {
  focusEl?.focus({ preventScroll: true })
  // 手机把当前回合行滚到吸顶表头下方，底部面板保持可见。
  const row = mobile.value && scroller.value?.querySelector('tr.battle-row-current')
  if (row) row.scrollIntoView?.({ block: 'start', behavior: 'auto' })
  else if (!mobile.value) headingEl?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
}
async function close() { expanded.value = false; editing.value = null; noteMode.value = false; menuOpen.value = false; await nextTick(); opener?.focus({ preventScroll: true }) }
function closeMore(restoreFocus = false) {
  menuOpen.value = false
  if (restoreFocus) moreMenu.value?.querySelector('button')?.focus({ preventScroll: true })
}
async function openNote() {
  closeMore(); noteMode.value = true
  await nextTick(); sectionEl?.querySelector('textarea')?.focus({ preventScroll: true })
}
async function finishNote() {
  noteMode.value = false
  await nextTick(); moreMenu.value?.querySelector('button')?.focus({ preventScroll: true })
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
function pickSlot(index) {
  if (!props.operators[index]?.name) return
  const action = editingAction.value
  if (!action) { slot.value = index; return }
  if (!isBattleInteraction(action)) { action.slot = index; return }
  round.value.actions.splice(editing.value, 1, { slot: index, type: BATTLE_ACTIONS[0].type, target: target.value })
}
function pickTarget(index) {
  if (activeSlot.value === BOX) return
  if (editingAction.value) editingAction.value.target = index
  else target.value = index
}
function pickAction(type) {
  const action = editingAction.value
  if (action) {
    if (type === BATTLE_INTERACTION.type) round.value.actions.splice(editing.value, 1, { type })
    else if (isBattleInteraction(action)) return
    else action.type = type
    return
  }
  if (round.value.actions.length >= 50 || (type !== BATTLE_INTERACTION.type && !canRecord.value)) return
  round.value.actions.push(type === BATTLE_INTERACTION.type ? { type } : { slot: slot.value, type, target: target.value })
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
