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
            <input v-model="member[key]" :disabled="!member.name" :aria-label="`${index + 1}号位${label}`" :inputmode="key === 'huaji' ? 'text' : 'numeric'" maxlength="30" placeholder="—" @input="markPanelEdited(member)">
          </td></tr>
          <tr><th scope="row">携带命盘</th><td v-for="(member, index) in operators" :key="index" :class="{ selected: detail === 'discs' && slot === index }">
            <button type="button" class="battle-cell-button" :disabled="!member.name" :aria-label="`编辑${index + 1}号位携带命盘`" :aria-expanded="detail === 'discs' && slot === index" aria-controls="battle-member-detail" @click="open(index, 'discs', $event)"><span>{{ member.discs || (member.name ? '选择命盘' : '—') }}</span><Pencil v-if="member.name" :size="13" aria-hidden="true" /></button>
            <span v-if="battleDiscError(member.discs)" class="battle-cell-error">命盘待修正</span>
          </td></tr>
          <tr v-for="kind in ['主星', '辅星']" :key="kind"><th scope="row">{{ kind }}</th><td v-for="(member, index) in operators" :key="index" :class="{ selected: detail === 'stars' && slot === index }">
            <button type="button" class="battle-cell-button" :disabled="!member.name" :aria-label="`编辑${index + 1}号位${kind}`" :aria-expanded="detail === 'stars' && slot === index" aria-controls="battle-member-detail" @click="open(index, 'stars', $event)"><span>{{ battleStarSummary(member.stars, kind) || '—' }}</span><Pencil v-if="member.name" :size="13" aria-hidden="true" /></button>
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
            <span class="battle-dialog-art" aria-hidden="true"><img v-if="portrait(operator)" :src="portrait(operator)" alt=""><UserRound v-else :size="22" /></span>
            <h3 id="battle-member-dialog-title" ref="heading" tabindex="-1">{{ slot + 1 }}号位 · {{ operator.name || '选择密探' }}</h3>
            <div class="battle-dialog-steps" role="group" aria-label="切换槽位">
              <button type="button" :disabled="busy" :aria-label="`上一位：${(slot + 4) % 5 + 1}号位`" @click="step(-1)"><ChevronLeft :size="16" aria-hidden="true" /></button>
              <span aria-hidden="true">{{ slot + 1 }} / 5</span>
              <button type="button" :disabled="busy" :aria-label="`下一位：${(slot + 1) % 5 + 1}号位`" @click="step(1)"><ChevronRight :size="16" aria-hidden="true" /></button>
            </div>
            <button type="button" class="battle-dialog-close" aria-label="关闭密探编辑" @click="close"><X :size="18" aria-hidden="true" /></button>
          </header>
          <div v-if="operator.name" class="battle-config-tools">
            <nav class="battle-subnav" aria-label="配置内容">
              <button v-for="[key, label] in SECTIONS" :key="key" type="button" :aria-pressed="detail === key" @click="open(slot, key)">{{ label }}</button>
              <button v-if="['requiredDiscs', 'forbiddenDiscs'].includes(detail)" type="button" aria-pressed="true">{{ detailLabel }}</button>
            </nav>
            <button v-if="savedMember && detail !== 'picker'" type="button" :disabled="busy" @click="importMember">重新带入账号配置</button>
          </div>
          <div class="battle-dialog-body">
            <template v-if="detail === 'picker'">
              <BattleMemberPicker :key="slot" :slot="slot" :agents="sortedAgents" :account-entries="accountEntries" :busy="busy" @choose="choose" @pending-name="setPending" />
              <button v-if="operator.name" type="button" class="battle-clear-member" :disabled="busy" @click="clearMember">清空该槽位</button>
            </template>
            <div v-else-if="detail === 'stats'" class="battle-stat-fields">
              <label v-for="[key, label] in BATTLE_STATS" :key="key">{{ label }}<input v-model="operator[key]" :inputmode="key === 'huaji' ? 'text' : 'numeric'" maxlength="30" placeholder="未知可留空" @input="markPanelEdited(operator)"></label>
            </div>
            <template v-else>
              <fieldset v-if="detail === 'discs' && operator.discLoadouts?.length" class="battle-loadout-options"><legend>带入的命盘组合</legend><label v-for="(loadout, index) in operator.discLoadouts" :key="index"><input ref="loadoutInputs" type="radio" name="battle-disc-loadout" :value="index" :checked="operator.discIndex === index" :aria-label="`带入命盘组合${index + 1}`" @change="selectLoadout(index)"><span>组合 {{ index + 1 }}<small>{{ loadout.name }}</small></span></label></fieldset>
              <BattleStarEditor v-if="detail === 'stars'" :key="slot" :model-value="operator.stars" :slot="slot" @update:model-value="updateField('stars', $event)" />
              <BattleDiscEditor v-else :key="slot + detail" :operator="operator" :slot="slot" :catalog="discTerms" :field="detail" @change="updateField" />
            </template>
            <p v-if="operator.panelNote && detail !== 'picker'" class="battle-hint">{{ operator.panelNote }}</p>
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
import { ChevronLeft, ChevronRight, Pencil, UserRound, X } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { AGENT_CATALOG } from '../../data/inventory/catalog.js'
import { agentMatchesGame } from '../../data/inventory/agentManifest.js'
import { findBattleCatalogOperator } from '../../utils/battleAccountSnapshot.js'
import { BATTLE_STATS, battleOperatorId, createBattleOperator, battleDiscError } from '../../utils/battleImages.js'
import { battleStarSummary } from '../../utils/battleEditor.js'
import { dialog } from '../../utils/dialog.js'
import { useHorizontalOverflow } from '../../composables/useHorizontalOverflow.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import BattleMemberPicker from './BattleMemberPicker.vue'
import BattleDiscEditor from './BattleDiscEditor.vue'
import BattleStarEditor from './BattleStarEditor.vue'
const props = defineProps({ operators: { type: Array, required: true }, game: { type: String, default: '如鸢' }, catalog: { type: Array, default: () => AGENT_CATALOG }, accountEntries: { type: Array, default: () => [] } })
const emit = defineEmits(['replace', 'pending-name'])
const sortedAgents = computed(() => {
  const owned = new Set(props.accountEntries.map(entry => entry.id))
  return props.catalog.filter(agent => agentMatchesGame(agent, props.game)).sort((a, b) => Number(owned.has(b.id)) - Number(owned.has(a.id)))
})
const slot = ref(0), detail = ref(''), heading = ref(null), busy = ref(false), loadoutInputs = ref([]), namePending = ref(false)
const scroller = ref(null), overflowing = useHorizontalOverflow(scroller)
const operator = computed(() => props.operators[slot.value])
const SECTIONS = [['stats', '练度'], ['discs', '携带命盘'], ['stars', '星石'], ['picker', '更换密探']]
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
const discTerms = computed(() => sortedAgents.value.find(agent => agent.id === operator.value.id || agent.name === operator.value.name)?.discs || [])
const savedMember = computed(() => props.accountEntries.find(entry => entry.id === operator.value.id))
const portrait = member => portraits[member.id || battleOperatorId(member.name)]
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
  loadoutInputs.value.forEach(input => { input.checked = Number(input.value) === member.discIndex })
  if (index === member.discIndex) return
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
