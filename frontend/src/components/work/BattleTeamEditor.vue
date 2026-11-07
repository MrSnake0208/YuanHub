<template>
  <section class="battle-team-editor" aria-label="配队编辑">
    <div ref="scroller" class="battle-table-scroll" role="region" aria-label="五人配队表，左右滑动查看" tabindex="0">
      <table class="battle-matrix battle-team-matrix">
        <caption class="sr-only">出战阵容，已选 {{ operators.filter(item => item.name).length }} / 5 位。点击练度直接编辑，点击命盘或星石展开配置。</caption>
        <thead><tr><th scope="col">出战阵容</th><th v-for="(member, index) in operators" :key="index" scope="col" :class="{ selected: detail && slot === index }">
          <span class="battle-slot-number">{{ index + 1 }} 号位</span>
          <button type="button" class="battle-member-button" :aria-label="`编辑${index + 1}号位`" :aria-expanded="Boolean(detail) && slot === index" aria-haspopup="dialog" aria-controls="battle-member-detail" @click="open(index, member.name ? 'stats' : 'picker', $event)">
            <span class="battle-slot-art"><img v-if="portrait(member)" :src="portrait(member)" alt=""><UserRound v-else :size="28" aria-hidden="true" /></span>
            <span><strong>{{ member.name || '选择密探' }}</strong><small>{{ member.name ? '编辑' : '点击选择' }}</small></span>
          </button>
        </th></tr></thead>
        <tbody>
          <tr v-for="[key, label] in BATTLE_STATS" :key="key"><th scope="row">{{ label }}</th><td v-for="(member, index) in operators" :key="index" :class="{ selected: detail && slot === index }">
            <!-- 化极按星级/节点/觉醒选择，表格中只展示，点击进入练度页选择。 -->
            <button v-if="key === 'huaji'" type="button" class="battle-cell-button" :disabled="!member.name" :aria-label="`编辑${index + 1}号位化极`" @click="open(index, 'stats', $event)"><span>{{ member.huaji || (member.name ? '选择' : '—') }}</span><Pencil v-if="member.name" :size="13" aria-hidden="true" /></button>
            <template v-else>
              <input v-model="member[key]" :disabled="!member.name" :aria-label="`${index + 1}号位${label}`" :aria-describedby="key === 'elite' && eliteOver(member) ? `battle-elite-over-${index}` : undefined" inputmode="numeric" maxlength="30" :placeholder="member.name ? '填写' : '—'" @focus="statBefore = member[key]" @change="commitStat(member, key)">
              <span v-if="key === 'elite' && eliteOver(member)" :id="`battle-elite-over-${index}`" class="battle-cell-error">超出等级上限 {{ eliteOver(member) }}</span>
            </template>
          </td></tr>
          <tr><th scope="row">携带命盘</th><td v-for="(member, index) in operators" :key="index" :class="{ selected: detail === 'discs' && slot === index }">
            <button type="button" class="battle-cell-button" :disabled="!member.name" :aria-label="`编辑${index + 1}号位携带命盘`" :aria-expanded="detail === 'discs' && slot === index" aria-controls="battle-member-detail" @click="open(index, 'discs', $event)"><span class="battle-disc-full">{{ member.discs || (member.name ? '选择命盘' : '—') }}</span><span class="battle-disc-short" aria-hidden="true">{{ discShort(member) || (member.name ? '选择' : '—') }}</span><Pencil v-if="member.name" :size="13" aria-hidden="true" /></button>
            <span v-if="battleDiscError(member.discs)" class="battle-cell-error">命盘待修正</span>
          </td></tr>
          <tr v-for="kind in ['主星', '辅星']" :key="kind"><th scope="row">{{ kind }}</th><td v-for="(member, index) in operators" :key="index" :class="{ selected: detail === 'stars' && slot === index }">
            <button type="button" class="battle-cell-button" :disabled="!member.name" :aria-label="`编辑${index + 1}号位${kind}`" :aria-expanded="detail === 'stars' && slot === index" aria-controls="battle-member-detail" @click="open(index, 'stars', $event)"><span :title="battleStarSummary(member.stars, kind) || undefined">{{ starLabels(member.stars, kind) || (member.name ? '选择' : '—') }}</span><Pencil v-if="member.name" :size="13" aria-hidden="true" /></button>
          </td></tr>
          <tr v-if="operators.some(member => otherStars(member.stars))"><th scope="row">星石其他说明</th><td v-for="(member, index) in operators" :key="index"><button type="button" class="battle-cell-button" :disabled="!member.name" :aria-label="`编辑${index + 1}号位星石说明`" @click="open(index, 'stars', $event)">{{ otherStars(member.stars) || '—' }}</button></td></tr>
          <tr v-if="operators.some(member => member.panelNote)"><th scope="row">面板来源</th><td v-for="(member, index) in operators" :key="index" class="battle-source-note">{{ member.panelNote || (member.name ? '手动填写' : '—') }}</td></tr>
        </tbody>
      </table>
    </div>
    <p v-if="overflowing" class="battle-scroll-hint">左右滑动查看五位密探；点击数值直接修改。</p>
    <details class="battle-requirements"><summary>攻略要求 · 必须 / 禁用命盘<span>{{ operators.some(member => member.requiredDiscs || member.forbiddenDiscs) ? '已填写' : '可选' }}</span></summary>
      <div class="battle-table-scroll" role="region" aria-label="五人命盘要求" tabindex="0"><table class="battle-matrix"><thead class="sr-only"><tr><th>要求</th><th v-for="(member, index) in operators" :key="index">{{ index + 1 }}号位 {{ member.name }}</th></tr></thead><tbody><tr v-for="[field, label] in [['requiredDiscs', '必须命盘'], ['forbiddenDiscs', '禁用命盘']]" :key="field"><th scope="row">{{ label }}</th><td v-for="(member, index) in operators" :key="index"><button type="button" class="battle-cell-button" :disabled="!member.name" :aria-label="`编辑${index + 1}号位${label}`" @click="open(index, field, $event)">{{ member[field] || '—' }}</button></td></tr></tbody></table></div>
    </details>
    <Teleport to="body">
      <div v-if="detail" class="page-battle-images battle-tool battle-dialog-mask">
        <section id="battle-member-detail" ref="panel" class="battle-dialog" role="dialog" aria-modal="true" aria-labelledby="battle-member-dialog-title" tabindex="-1">
          <header class="battle-dialog-header">
            <!-- 更换密探是对整位密探的操作，不与“练度/命盘/星石”并列成页签：点击头像进入选人，角标常驻以便触屏发现。 -->
            <button v-if="operator.name && detail !== 'picker'" type="button" class="battle-swap-trigger" :disabled="busy" :aria-label="`更换${slot + 1}号位密探`" title="更换密探" @click="open(slot, 'picker')">
              <img v-if="portrait(operator)" :src="portrait(operator)" alt=""><UserRound v-else :size="22" aria-hidden="true" />
              <span class="battle-swap-label" aria-hidden="true"><Repeat2 :size="11" />更换</span>
            </button>
            <span v-else class="battle-dialog-art" aria-hidden="true"><img v-if="portrait(operator)" :src="portrait(operator)" alt=""><UserRound v-else :size="22" /></span>
            <h3 id="battle-member-dialog-title" ref="heading" tabindex="-1">{{ slot + 1 }}号位 · {{ operator.name || '选择密探' }}</h3>
            <div class="battle-dialog-steps" role="group" aria-label="切换槽位">
              <button type="button" :disabled="busy" :aria-label="`上一位：${slotLabel(slot + 4)}`" @click="step(-1)"><ChevronLeft :size="16" aria-hidden="true" /></button>
              <span aria-hidden="true">{{ slot + 1 }} / 5</span>
              <button type="button" :disabled="busy" :aria-label="`下一位：${slotLabel(slot + 1)}`" @click="step(1)"><ChevronRight :size="16" aria-hidden="true" /></button>
            </div>
            <button type="button" class="battle-dialog-close" aria-label="关闭密探编辑" @click="close"><X :size="18" aria-hidden="true" /></button>
          </header>
          <div v-if="operator.name && detail === 'picker'" class="battle-config-tools">
            <button type="button" class="battle-back-button" :disabled="busy" @click="open(slot, returnSection)"><ChevronLeft :size="16" aria-hidden="true" />返回配置</button>
          </div>
          <div v-else-if="operator.name" class="battle-config-tools">
            <nav class="battle-subnav" aria-label="配置内容">
              <button v-for="[key, label] in SECTIONS" :key="key" type="button" :aria-pressed="detail === key" @click="open(slot, key)">{{ label }}</button>
              <button v-if="['requiredDiscs', 'forbiddenDiscs'].includes(detail)" type="button" aria-pressed="true">{{ detailLabel }}</button>
            </nav>
            <div class="battle-member-actions">
              <button v-if="savedMember" type="button" :disabled="busy" @click="importMember">重新带入账号配置</button>
              <button type="button" class="battle-danger-text" :disabled="busy" @click="clearMember">清空该槽位</button>
            </div>
          </div>
          <div class="battle-dialog-body">
            <BattleMemberPicker v-if="detail === 'picker'" :key="slot" :slot="slot" :agents="sortedAgents" :account-entries="accountEntries" :team="operators" :busy="busy" @choose="choose" @pending-name="setPending" />
            <!-- 面板来源只在练度页说明一次，紧邻生命与攻击；表格“面板来源”行仍常驻显示。 -->
            <BattleStatFields v-else-if="detail === 'stats'" :operator="operator" :agent="catalogAgent" @change="updateField" />
            <template v-else>
              <fieldset v-if="detail === 'discs' && operator.discLoadouts?.length" class="battle-loadout-options">
                <legend>带入的命盘组合<span v-if="activeLoadout(operator) < 0">（当前命盘已手动调整）</span></legend>
                <label v-for="(loadout, index) in operator.discLoadouts" :key="index" :class="{ selected: activeLoadout(operator) === index }"><input ref="loadoutInputs" type="radio" name="battle-disc-loadout" :value="index" :checked="activeLoadout(operator) === index" :aria-label="`带入命盘组合${index + 1}`" @change="selectLoadout(index)"><span>{{ loadoutTitle(loadout, index) }}<small>{{ loadout.discNames.join('、') || '未带命盘' }}</small></span></label>
              </fieldset>
              <BattleStarEditor v-if="detail === 'stars'" :key="slot" :model-value="operator.stars" :slot="slot" @update:model-value="updateField('stars', $event)" />
              <BattleDiscEditor v-else :key="slot + detail" :operator="operator" :slot="slot" :catalog="discTerms" :field="detail" @change="updateField" />
            </template>
          </div>
          <footer class="battle-dialog-footer">
            <span>修改即时生效，并自动保存到本机</span>
            <button type="button" class="battle-primary" @click="close">完成</button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Pencil, Repeat2, UserRound, X } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { AGENT_CATALOG } from '../../data/inventory/catalog.js'
import { agentMatchesGame } from '../../data/inventory/agentManifest.js'
import { findBattleCatalogOperator } from '../../utils/battleAccountSnapshot.js'
import { BATTLE_STATS, battleOperatorId, createBattleOperator, battleDiscError, battleDiscNames, battleDiscTerms, battleStarStones } from '../../utils/battleImages.js'
import { battleStarSummary } from '../../utils/battleEditor.js'
import { dialog } from '../../utils/dialog.js'
import { useHorizontalOverflow } from '../../composables/useHorizontalOverflow.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import BattleMemberPicker from './BattleMemberPicker.vue'
import BattleDiscEditor from './BattleDiscEditor.vue'
import BattleStarEditor from './BattleStarEditor.vue'
import BattleStatFields from './BattleStatFields.vue'
import { OPERATOR_ELITE_MAX, OPERATOR_LEVEL_MAX, getMaxEliteForLevel } from '../../utils/operatorGrowthRules.js'
const props = defineProps({ operators: { type: Array, required: true }, game: { type: String, default: '如鸢' }, catalog: { type: Array, default: () => AGENT_CATALOG }, accountEntries: { type: Array, default: () => [] } })
const emit = defineEmits(['replace', 'pending-name'])
const sortedAgents = computed(() => {
  const owned = new Set(props.accountEntries.map(entry => entry.id))
  return props.catalog.filter(agent => agentMatchesGame(agent, props.game)).sort((a, b) => Number(owned.has(b.id)) - Number(owned.has(a.id)))
})
const slot = ref(0), detail = ref(''), returnSection = ref('stats'), heading = ref(null), busy = ref(false), loadoutInputs = ref([]), namePending = ref(false)
const scroller = ref(null), overflowing = useHorizontalOverflow(scroller)
const operator = computed(() => props.operators[slot.value])
const SECTIONS = [['stats', '练度'], ['discs', '携带命盘'], ['stars', '星石']]
const detailLabel = computed(() => ({ discs: '命盘', stars: '星石', requiredDiscs: '必须命盘', forbiddenDiscs: '禁用命盘' })[detail.value])
const panel = ref(null), dialogOpen = computed(() => Boolean(detail.value))
// 遮罩点击不关闭；Esc 与“完成”走同一关闭流程，未确认的自定义名称仍需确认。
useModalFocus(dialogOpen, panel, { initialFocus: () => heading.value, onEscape: () => close() })
watch(dialogOpen, (isOpen, _, onCleanup) => {
  if (!isOpen) return
  const previous = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  onCleanup(() => { document.body.style.overflow = previous })
}, { immediate: true })
const catalogAgent = computed(() => sortedAgents.value.find(agent => agent.id === operator.value.id || agent.name === operator.value.name) || null)
const discTerms = computed(() => catalogAgent.value?.discs || [])
const savedMember = computed(() => props.accountEntries.find(entry => entry.id === operator.value.id))
// 手机表格列宽有限，命盘用图鉴简称逐行显示；完整名称仍在桌面表格与编辑弹窗中。
const discShort = member => battleDiscTerms(member.discs, sortedAgents.value.find(agent => agent.id === member.id || agent.name === member.name)?.discs || []).map(term => term.label).join('\n')
const portrait = member => portraits[member.id || battleOperatorId(member.name)]
const slotLabel = index => { const member = props.operators[index % 5]; return `${index % 5 + 1}号位${member.name ? ` · ${member.name}` : ''}` }
// 组合名多为“命盘1”这类序号，与“组合 1”重复；只有作者自定义的名称才替换标题。
const loadoutTitle = (loadout, index) => (loadout.name && !/^命盘\s*\d+$/.test(loadout.name) ? loadout.name : `组合 ${index + 1}`)
// 仅当实际携带命盘与所记组合一致时才视为选中；手动增删后不再误显示为某个组合。
function activeLoadout(member) {
  const loadout = member.discLoadouts?.[member.discIndex]
  return loadout && battleDiscNames(member.discs).join('\n') === battleDiscNames(loadout.discNames.join('\n')).join('\n') ? member.discIndex : -1
}
// 表格只显示“星名+等级”（如 天府40），按槽位 1→3 排列；无法解析的同类行原样附在后面，完整描述留在 title 与编辑弹窗。
function starLabels(value, kind) {
  const stones = battleStarStones(value)
  const labels = (kind === '主星' ? stones.main : stones.support).filter(Boolean).map(stone => stone.label)
  return [...labels, ...stones.other.filter(line => line.startsWith(kind))].join('\n')
}
const otherStars = value => String(value || '').split('\n').filter(line => !/^\s*(主星|辅星)/.test(line)).join('\n')
let alive = true, opener
onBeforeUnmount(() => { alive = false })
async function open(index, section, event) {
  const trigger = event?.currentTarget
  if ((slot.value !== index || detail.value !== section) && !await discardPendingName()) return
  if (!alive) return
  const wasOpen = Boolean(detail.value)
  if (!wasOpen) opener = trigger
  slot.value = index; detail.value = section
  if (section !== 'picker') returnSection.value = section
  await nextTick()
  // 首次打开由弹窗焦点管理负责；弹窗内切换分区或槽位时把焦点移回标题，方便读屏确认位置。
  if (wasOpen) heading.value?.focus({ preventScroll: true })
}
function step(offset) {
  const index = (slot.value + offset + 5) % 5, member = props.operators[index]
  const section = !member.name ? 'picker' : detail.value === 'picker' ? 'stats' : detail.value
  open(index, section)
}
function setPending(value) { namePending.value = value; emit('pending-name', value) }
async function discardPendingName() {
  if (!namePending.value) return true
  return alive && await dialog.confirm({ title: '放弃未确认的名称？', message: '自定义名称还没有带入阵容，继续将丢弃这次输入。', confirmText: '放弃输入', cancelText: '继续填写' })
}
async function close() {
  if (!await discardPendingName() || !alive) return
  detail.value = ''
  // Safari 点击按钮不会聚焦它，弹窗焦点栈记录不到触发者；在其恢复之后再显式回到表格中的触发按钮。
  await nextTick()
  if (opener?.isConnected) opener.focus({ preventScroll: true })
}
// 表格内直接输入与练度弹窗同一规则，离开单元格才校验：最低为 1；等级不超过 100，修为不超过当前等级可解锁的上限
// （未填等级时按 17）；清空或非数字恢复为输入前的值。值确有变化才标记面板已手动调整。
let statBefore = ''
const positiveInteger = value => (/^\d+$/.test(String(value ?? '').trim()) && Number(value) >= 1 ? Number(value) : null)
function eliteLimit(member) {
  const level = positiveInteger(member.level)
  return level && level <= OPERATOR_LEVEL_MAX ? getMaxEliteForLevel(level) : OPERATOR_ELITE_MAX
}
// 先填修为后降低等级时不自动改写修为，与弹窗一样只提示超限，返回该等级的修为上限。
function eliteOver(member) {
  const elite = positiveInteger(member.elite), limit = eliteLimit(member)
  return elite != null && elite > limit ? limit : 0
}
function commitStat(member, key) {
  const limit = key === 'level' ? OPERATOR_LEVEL_MAX : key === 'elite' ? eliteLimit(member) : 0
  const raw = String(member[key] ?? '').trim()
  if (limit && (raw || String(statBefore ?? '').trim())) {
    const value = positiveInteger(raw)
    member[key] = value != null ? String(Math.min(limit, value)) : statBefore
  }
  if (String(member[key] ?? '') !== String(statBefore ?? '')) markPanelEdited(member)
}
function markPanelEdited(member) {
  if (member.panelNote) member.panelNote = '本攻略已手动调整练度或配装，请核对生命与攻击；不会自动重算。'
}
function updateField(field, value) { operator.value[field] = value; markPanelEdited(operator.value) }
async function setMember(index, next) {
  const previous = props.operators[index], signature = JSON.stringify(previous), game = props.game
  if (previous.name && !await dialog.confirm({ title: '更换密探或配装？', message: '该槽位的练度、携带命盘、命盘要求和星石将替换，已记录的槽位动作保留。不会修改账号档案。', confirmText: '替换槽位' })) return false
  if (!alive || props.game !== game || props.operators[index] !== previous || JSON.stringify(previous) !== signature) return false
  emit('replace', index, next)
  return true
}
async function choose(name) {
  if (busy.value || !name.trim()) return
  const index = slot.value
  const found = findBattleCatalogOperator(props.catalog, name, props.game)
  if (props.operators[index].name === name.trim() || (found && props.operators[index].id === found.id)) {
    if (found) props.operators[index].name = found.name
    setPending(false); await open(index, 'stats'); return
  }
  const saved = props.accountEntries.find(entry => entry.id === found?.id)
  busy.value = true
  try {
    const next = saved ? JSON.parse(JSON.stringify(saved)) : createBattleOperator(found?.name || name.trim(), found?.id || '')
    if (await setMember(index, next) && slot.value === index) { setPending(false); await open(index, 'stats') }
  } finally { busy.value = false }
}
async function importMember() {
  if (!savedMember.value || busy.value) return
  busy.value = true
  try { await setMember(slot.value, JSON.parse(JSON.stringify(savedMember.value))) } finally { busy.value = false }
}
async function clearMember() {
  const index = slot.value, member = operator.value, signature = JSON.stringify(member)
  if (!await dialog.confirm({ title: `清空${index + 1}号位？`, message: '本槽位的密探、练度与配装将清空；已记录的槽位动作保留，重新选人后才能生成操作图。', type: 'danger', confirmText: '清空槽位' })) return
  if (!alive || operator.value !== member || JSON.stringify(member) !== signature) return
  emit('replace', index, createBattleOperator()); setPending(false); await close()
}
async function selectLoadout(index) {
  const member = operator.value, signature = JSON.stringify(member), game = props.game
  const active = activeLoadout(member)
  loadoutInputs.value.forEach(input => { input.checked = Number(input.value) === active })
  if (index === active) return
  if (!await dialog.confirm({ title: '带入命盘组合？', message: '仅替换本攻略的携带命盘，必须／禁用要求保留。', confirmText: '带入组合' })) return
  if (!alive || props.game !== game || operator.value !== member || JSON.stringify(member) !== signature) return
  member.discIndex = index; member.discs = member.discLoadouts[index].discNames.join('\n')
  markPanelEdited(member)
}
function revealDiscError() {
  const index = props.operators.findIndex(member => battleDiscError(member.discs))
  if (index >= 0) open(index, 'discs')
}
defineExpose({ revealDiscError })
</script>
