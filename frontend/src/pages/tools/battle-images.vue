<template>
  <div class="page-battle-images">
    <IslandSidebar />
    <main id="main-content">
      <CompactToolHeader title="配队与操作图" description="整理一份配队，分享每一步打法。" mobile-description>
        <template #help>无需登录也可手动编辑。草稿按站点用户与游戏账号保存在本机，可导出文件继续编辑；PNG 不能恢复草稿。从账号带入的是快照，修改攻略不会写回密探或星石。</template>
      </CompactToolHeader>
      <div class="wrap battle-tool">
        <nav class="battle-modes" aria-label="编辑内容">
          <button type="button" :aria-pressed="kind === 'team'" @click="kind = 'team'"><UsersRound :size="18" aria-hidden="true" />配队</button>
          <button type="button" :aria-pressed="kind === 'actions'" @click="kind = 'actions'"><ListOrdered :size="18" aria-hidden="true" />操作记录</button>
          <a href="#battle-preview"><Eye :size="16" aria-hidden="true" />看预览</a>
        </nav>
        <div class="battle-draft-tools" aria-label="草稿保存">
          <span role="status">{{ pendingName ? '密探名称尚未确认' : status || '编辑后自动保存到本机' }}</span>
          <button type="button" @click="exportDraft">导出草稿</button>
          <button type="button" :disabled="importing || accountsLoading" @click="fileInput.click()">导入草稿</button>
          <button type="button" :disabled="accountsLoading" @click="newDraft">新建草稿</button>
          <input ref="fileInput" type="file" accept=".json,application/json" aria-label="选择草稿文件" hidden @change="importDraft">
        </div>
        <p v-if="fileError" role="alert" class="battle-hint">{{ fileError }}</p>
        <p v-if="saveError" role="alert" class="battle-hint">{{ saveError }} <button type="button" @click="retrySave">{{ blocked ? '覆盖本机存档' : '重试保存' }}</button></p>
        <div v-if="userId" class="battle-account-context">
          <DataAccountContextBar compact :accounts="accounts" :account-id="sourceAccountId" :game="account?.game || ''" :is-logged-in="true" :loading="accountsLoading" :error="accountError" :before-switch="beforeAccountSwitch" />
          <button v-if="accountError" type="button" @click="loadAccounts">重试读取账号</button>
          <span class="battle-hint">切换账号会打开该账号的独立草稿。</span>
        </div>
        <p v-if="accountsLoading" role="status">正在读取账号与本机草稿…</p>
        <div v-else class="battle-workspace">
          <div id="battle-editor" class="battle-editor-panel">
            <section class="battle-meta" aria-label="图片基本信息">
              <label class="battle-title-field">标题 / 关卡<input v-model="draft.title" aria-label="标题或关卡" maxlength="120" placeholder="给这份攻略起个名字"></label>
              <div class="battle-byline-fields"><label>游戏{{ account ? '（跟随账号）' : '' }}<select v-model="draft.game" :disabled="Boolean(account)" aria-label="游戏"><option>如鸢</option><option>代号鸢</option></select></label><label>署名<input v-model="draft.author" aria-label="署名" maxlength="60" placeholder="攻略作者（可选）"></label></div>
            </section>
            <div class="battle-editor-body">
              <section v-show="kind === 'team'" aria-label="配队编辑">
                <div v-if="account" class="battle-account-import">
                  <button type="button" :disabled="loading" @click="readAccount">{{ loading ? '正在读取我的密探…' : loaded ? '重新读取我的密探' : '从我的密探带入' }}</button>
                  <p class="battle-hint">{{ loaded ? (entries.length ? '在各槽位选择密探带入；重新读取不会覆盖已编辑的阵容。' : '当前账号暂无已拥有的密探，可继续手动填写。') : '读取当前账号已保存的练度、两套命盘与星石配装，只用于本次攻略。' }}</p>
                  <p v-if="error" role="alert" class="battle-hint">{{ error }}</p>
                </div>
                <p v-if="catalogError" role="alert" class="battle-hint">{{ catalogError }} <button type="button" @click="loadCatalog">重试图鉴</button></p>
                <BattleTeamEditor :key="revision" :operators="draft.operators" :game="draft.game" :catalog="catalog" :account-entries="entries" @pending-name="pendingName = $event" @replace="(slot, operator) => draft.operators[slot] = operator" />
              </section>
              <BattleRecorder :key="revision" v-show="kind === 'actions'" :operators="draft.operators" :rounds="draft.rounds" :targets="draft.targets" @round-change="roundIndex = $event" />
              <details class="battle-common-note"><summary><FileText :size="15" aria-hidden="true" />打法说明<span>两种图片共用</span><ChevronDown :size="14" aria-hidden="true" /></summary><label><span class="sr-only">图片说明</span><textarea v-model="draft.note" aria-label="图片说明" maxlength="2000" rows="3" placeholder="配队要求、替换建议或打法说明"></textarea></label></details>
            </div>
          </div>
          <BattleImageExport :draft="draft" :kind="kind" :round-index="roundIndex" />
        </div>
        <p class="battle-local-note"><Info :size="14" aria-hidden="true" />草稿仅保存在当前浏览器，清理浏览器数据会丢失。换设备前请导出草稿；图片与草稿均不会自动上传。</p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ChevronDown, Eye, FileText, Info, ListOrdered, UsersRound } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import BattleTeamEditor from '../../components/work/BattleTeamEditor.vue'
import BattleRecorder from '../../components/work/BattleRecorder.vue'
import BattleImageExport from '../../components/work/BattleImageExport.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import { createBattleDraft } from '../../utils/battleImages.js'
import { BATTLE_DRAFT_MAX_BYTES, decodeBattleDraft, encodeBattleDraft } from '../../utils/battleDraft.js'
import { useBattleDraft } from '../../composables/useBattleDraft.js'
import { useBattleAccountSource } from '../../composables/useBattleAccountSource.js'
import { activeAccount } from '../../store/activeAccount.js'
import { dialog } from '../../utils/dialog.js'

const { userId, account, accounts, accountsLoading, accountError, loadAccounts, catalog, catalogError, loadCatalog, entries, loading, loaded, error, readAccount } = useBattleAccountSource()
const sourceAccountId = computed(() => userId.value ? activeAccount.id : '')
const { draft, key, revision, dirty, status, saveError, blocked, replace, overwrite } = useBattleDraft(userId, sourceAccountId)
const kind = ref('team'), roundIndex = ref(0), fileInput = ref(null), fileError = ref(''), importing = ref(false)
const pendingName = ref(false)
const unsaved = computed(() => dirty.value || pendingName.value)
let alive = true
watch(revision, () => { roundIndex.value = 0; fileError.value = ''; pendingName.value = false })
watch([account, revision], () => { if (account.value) draft.value.game = account.value.game }, { immediate: true })
onBeforeRouteLeave(() => !unsaved.value || dialog.confirm({ title: '离开图片工具？', message: '仍有未确认或未保存的输入，离开后将丢失。请先确认密探名称并导出草稿文件。', confirmText: '仍然离开', cancelText: '继续编辑' }))
async function beforeAccountSwitch() {
  return dialog.confirm({ title: '切换攻略账号？', message: unsaved.value ? '仍有未确认或未保存的输入。请取消并导出备份；继续切换会丢失未保存内容。' : '当前草稿保留在本机，切换后打开另一个账号的独立草稿。不会替换原草稿的阵容。', confirmText: '切换账号' })
}
async function retrySave() {
  const scope = key.value
  if (blocked.value && !await dialog.confirm({ title: '覆盖本机存档？', message: '无法读取的原存档将被当前编辑内容替换。', confirmText: '覆盖存档' })) return
  if (alive && scope === key.value) overwrite()
}
async function newDraft() {
  const scope = key.value, previous = JSON.stringify(draft.value)
  if (!await dialog.confirm({ title: '新建草稿？', message: '当前内容将被空白草稿替换。如需保留，请先导出草稿文件。', confirmText: '新建草稿' })) return
  if (!alive || scope !== key.value || previous !== JSON.stringify(draft.value)) return
  replace({ ...createBattleDraft(), game: account.value?.game || draft.value.game })
}
function exportDraft() {
  fileError.value = ''
  if (pendingName.value) { fileError.value = '请先确认密探名称，再导出草稿。'; return }
  try {
    const url = URL.createObjectURL(new Blob([encodeBattleDraft(draft.value)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'YuanHub-配队草稿.json'; document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (reason) { fileError.value = reason.message || '草稿导出失败，请重试。' }
}
async function importDraft(event) {
  const file = event.target.files?.[0], scope = key.value, previous = JSON.stringify(draft.value)
  event.target.value = ''
  if (!file) return
  importing.value = true; fileError.value = ''
  try {
    if (file.size > BATTLE_DRAFT_MAX_BYTES) throw new Error('草稿文件不能超过 1 MB。')
    const value = decodeBattleDraft(await file.text())
    if (!alive || scope !== key.value) return
    if (account.value && value.game !== account.value.game) throw new Error('草稿游戏与当前账号不同，请先切换到对应游戏账号。')
    if (!await dialog.confirm({ title: '导入草稿？', message: '将替换当前攻略的全部内容，不会写入密探与星石档案。原内容如需保留，请先导出。', confirmText: '替换草稿' })) return
    if (!alive || scope !== key.value) return
    if (previous !== JSON.stringify(draft.value)) throw new Error('读取文件期间草稿已变化，请重新导入。')
    replace(value)
  } catch (reason) { if (alive && scope === key.value) fileError.value = reason.message || '草稿导入失败。' }
  finally { importing.value = false }
}
function beforeUnload(event) { if (unsaved.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { alive = false; window.removeEventListener('beforeunload', beforeUnload) })
</script>

<style>
.battle-tool { color: var(--ink); padding-bottom: 40px; }
.battle-draft-tools, .battle-account-context { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-bottom: 16px; }
.battle-draft-tools > span { margin-right: auto; font-size: 12px; color: var(--ink-60); }
.battle-account-import { margin-bottom: 18px; }
.battle-catalog-terms { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.battle-tool .battle-catalog-terms button { font-size: 12px; }
.battle-tool label { display: grid; gap: 7px; font-size: 12px; font-weight: 600; min-width: 0; color: var(--ink-60); }
.battle-tool :is(input, select, textarea) { box-sizing: border-box; min-width: 0; width: 100%; padding: 10px 11px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: 400 14px/1.5 var(--font-b); transition: border-color .15s; }
.battle-tool :is(input, textarea)::placeholder { color: var(--ink-35); }
.battle-tool textarea { resize: vertical; }
.battle-tool button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font: 500 13px/1.5 var(--font-b); cursor: pointer; transition: border-color .15s, background-color .15s; }
.battle-tool button:disabled { opacity: .4; cursor: not-allowed; }
.battle-tool :is(button, input, select, textarea, summary, a, [tabindex]):focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
.battle-tool .battle-primary { background: var(--tea); color: var(--on-strong); border-color: var(--tea); font-weight: 700; }
.battle-modes { display: flex; align-items: center; gap: 24px; border-bottom: 1px solid var(--line); margin-bottom: 22px; }
.battle-modes button { position: relative; padding: 14px 2px; border: 0; border-bottom: 3px solid transparent; border-radius: 0; background: transparent; color: var(--ink-60); font-size: 15px; }
.battle-modes button[aria-pressed="true"] { border-bottom-color: var(--theme-accent-text, var(--tea)); color: var(--ink); font-weight: 700; }
.battle-modes a { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: 13px; color: var(--ink-60); text-decoration: none; }
.battle-workspace { display: grid; align-items: start; gap: 24px; }
.battle-editor-panel { min-width: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); scroll-margin-top: 90px; }
.battle-meta { display: grid; gap: 14px; padding: 22px; border-bottom: 1px solid var(--line); }
.battle-title-field input { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; padding: 4px 0 10px; font-size: 20px; font-weight: 600; }
.battle-byline-fields { display: grid; grid-template-columns: minmax(90px, .7fr) minmax(0, 1.3fr); gap: 14px; }
.battle-editor-body { padding: 22px; }
.battle-section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.battle-section-heading h2 { margin: 0; font-size: 16px; font-weight: 700; }
.battle-section-heading > span { color: var(--ink-60); font-size: 12px; }
.battle-hint { font-size: 12px; line-height: 1.7; color: var(--ink-60); margin: 10px 0; }
.battle-team-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
.battle-tool .battle-slot-card { position: relative; display: flex; flex-direction: column; gap: 0; min-width: 0; padding: 0 0 9px; border: 1px solid var(--line); background: var(--cream); overflow: hidden; }
.battle-tool .battle-slot-card[aria-pressed="true"] { border-color: var(--theme-accent-text, var(--tea)); box-shadow: inset 0 -2px 0 var(--theme-accent-text, var(--tea)); }
.battle-slot-number { position: absolute; top: 4px; left: 6px; z-index: 1; color: var(--ink-60); font: 600 11px/1.5 var(--font-d); }
.battle-slot-art { display: flex; align-items: center; justify-content: center; width: 100%; height: 78px; color: var(--ink-35); }
.battle-slot-art img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.battle-slot-card strong { display: block; max-width: 100%; padding: 0 3px; color: var(--ink); font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.battle-member-detail { margin-top: 22px; }
.battle-name-field { position: relative; display: flex; align-items: center; }
.battle-name-field > svg { position: absolute; left: 11px; pointer-events: none; }
.battle-name-field input { padding-left: 35px; }
.battle-field-group { min-width: 0; border: 0; margin: 20px 0 0; padding: 0; }
.battle-field-group legend { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; width: 100%; padding: 0 0 12px; font-size: 13px; font-weight: 700; }
.battle-field-group legend span { font-size: 11px; font-weight: normal; color: var(--ink-60); }
.battle-stat-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.battle-stat-fields label:last-child { grid-column: span 2; }
.battle-stat-fields input { font-family: var(--font-d); }
.battle-disc-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
.battle-field-discs, .battle-field-stars { grid-column: 1 / -1; }
.battle-member-empty { display: grid; justify-items: center; gap: 10px; padding: 40px 10px; color: var(--ink-60); text-align: center; }
.battle-member-empty > svg { color: var(--ink-35); } .battle-member-empty p { font-size: 14px; } .battle-member-empty span { font-size: 12px; line-height: 1.7; }
.battle-round-toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin: 16px 0; }
.battle-round-toolbar > label { flex: 1; min-width: 130px; }
.battle-round-toolbar > button:last-child { font-size: 12px; }
.battle-targets { margin: 20px 0 12px; padding-block: 16px; border-block: 1px solid var(--line); }
.battle-target-heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; font-size: 12px; }
.battle-target-heading strong { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; } .battle-target-heading > span { color: var(--ink-60); }
.battle-target-buttons { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
.battle-target-buttons button { position: relative; min-width: 0; flex-direction: column; gap: 6px; padding: 10px 3px; font-size: 12px; overflow-wrap: anywhere; }
.battle-target-buttons button[aria-pressed="true"] { border-color: var(--theme-accent-text, var(--tea)); background: var(--cream); font-weight: 700; }
.battle-target-buttons button > svg { position: absolute; right: 3px; top: 3px; }
.battle-target-buttons i, .battle-sequence i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(73,59,44,.2); flex-shrink: 0; }
.battle-target-edit { margin-top: 10px; } .battle-target-edit summary { width: fit-content; font-size: 12px; color: var(--ink-60); }
.battle-tool summary { cursor: pointer; } .battle-target-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.battle-record-buttons { display: grid; gap: 0; }
.battle-record-member { display: grid; grid-template-columns: minmax(90px, 1fr) minmax(0, 1.7fr); gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); min-width: 0; }
.battle-record-identity { display: flex; align-items: center; gap: 8px; min-width: 0; }
.battle-record-portrait { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 40px; height: 44px; background: var(--cream); border-radius: 4px; overflow: hidden; color: var(--ink-35); }
.battle-record-portrait img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.battle-record-identity strong { min-width: 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.battle-record-identity small { display: block; font-size: 10px; font-weight: normal; color: var(--ink-60); margin-bottom: 2px; }
.battle-record-pad { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
.battle-record-pad button { flex-direction: column; gap: 1px; padding: 5px 2px; }
.battle-record-pad b { font: 600 19px/1.3 var(--font-b); } .battle-record-pad small { font-size: 11px; white-space: nowrap; }
.battle-sequence-heading { justify-content: space-between; align-items: center; margin-top: 24px; }
.battle-round-toolbar h3 { margin: 0; font-size: 13px; } .battle-round-toolbar h3 span { margin-left: 4px; font-size: 11px; color: var(--ink-60); font-weight: normal; }
.battle-sequence-heading button { border: 0; background: transparent; padding: 5px 0; }
.battle-sequence { overflow-x: auto; padding-bottom: 8px; }
.battle-sequence > p { font-size: 12px; padding: 18px 0; color: var(--ink-60); line-height: 1.6; }
.battle-sequence ol { display: flex; gap: 8px; padding: 0; list-style: none; }
.battle-sequence li { position: relative; display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; flex: 0 0 auto; min-width: 105px; max-width: 190px; border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px 10px 28px; background: var(--cream); }
.battle-sequence li > span { position: absolute; top: 12px; left: 9px; font: 600 10px/1.5 var(--font-d); color: var(--ink-60); }
.battle-sequence strong { font-size: 12px; overflow-wrap: anywhere; } .battle-sequence b { font-size: 15px; }
.battle-sequence small { grid-column: 1 / -1; display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--ink-60); overflow-wrap: anywhere; }
.battle-step-editor { margin: 10px 0 20px; }
.battle-step-editor > summary, .battle-common-note > summary { display: flex; align-items: center; gap: 8px; list-style: none; font-size: 13px; padding: 10px 0; }
.battle-step-editor > summary::-webkit-details-marker, .battle-common-note > summary::-webkit-details-marker { display: none; }
.battle-step-editor > summary span, .battle-common-note > summary span { margin-left: auto; font-size: 11px; color: var(--ink-60); }
.battle-step-editor[open] > summary > svg:last-child, .battle-common-note[open] > summary > svg:last-child { transform: rotate(180deg); }
.battle-action-list { list-style: none; padding: 0; margin: 8px 0; }
.battle-action-list li { display: grid; gap: 7px; align-items: center; grid-template-columns: 20px repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--line); padding: 10px 0; }
.battle-action-list li > label:nth-of-type(3) { grid-column: 2; }
.battle-action-order { font-weight: 600; font-size: 12px; text-align: center; }
.battle-action-tools { display: flex; justify-content: flex-end; gap: 6px; } .battle-action-tools button { padding: 9px; }
.battle-common-note { margin-top: 22px; padding-top: 10px; border-top: 1px solid var(--line); }
.battle-local-note { display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--ink-60); font-size: 12px; line-height: 1.7; margin-top: 24px; }
.battle-tool .battle-error { color: var(--theme-danger-text, var(--rouge)); font-size: 14px; }
.battle-tool .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (hover: hover) { .battle-tool button:hover:not(:disabled) { border-color: var(--ink-60); } .battle-record-pad button:hover:not(:disabled) { background: var(--cream); } }
@media (prefers-reduced-motion: reduce) { .battle-tool :is(button, input, textarea, select) { transition: none; } }
</style>
<style src="./battleImagesDesktop.css"></style>
<style src="./battleImagesMobile.css"></style>
