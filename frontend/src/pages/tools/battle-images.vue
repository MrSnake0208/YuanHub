<template>
  <div v-if="canUseBattleImages" class="page-battle-images">
    <IslandSidebar />
    <main id="main-content" class="battle-tool">
      <CompactToolHeader title="配队与操作图">
        <template #help>五位密探固定成列；点击练度直接填写，点击命盘、星石或动作展开编辑。草稿按站点用户与游戏账号保存在本机，修改攻略不写回账号档案。未知信息可留空。PNG 无法恢复草稿。</template>
        <template #primary-actions>
          <span class="battle-save-status" role="status">{{ pendingName ? '密探名称尚未确认' : status || '编辑后自动保存到本机' }}</span>
          <button ref="exportButton" class="battle-primary" type="button" :disabled="accountsLoading || exportBusy" @click="openExport">
            <Download :size="16" aria-hidden="true" />{{ exportBusy ? '正在生成…' : kind === 'team' ? '生成配队图' : '生成操作图' }}
          </button>
        </template>
        <template #actions>
          <details ref="draftMenu" class="battle-draft-menu" @keydown.esc.stop="closeDraftMenu(true)">
            <summary>草稿管理<ChevronDown :size="14" aria-hidden="true" /></summary>
            <div class="battle-draft-tools">
              <button type="button" @click="closeDraftMenu(); exportDraft()">导出草稿</button>
              <button type="button" :disabled="importing || accountsLoading" @click="closeDraftMenu(); fileInput.click()">导入草稿</button>
              <button type="button" :disabled="accountsLoading" @click="closeDraftMenu(); newDraft()">新建草稿</button>
            </div>
          </details>
        </template>
      </CompactToolHeader>
      <div class="wrap battle-document">
        <input ref="fileInput" type="file" accept=".json,application/json" aria-label="选择草稿文件" hidden @change="importDraft">
        <p v-if="fileError" ref="fileErrorEl" role="alert" class="battle-error">{{ fileError }}</p>
        <p v-if="saveError" role="alert" class="battle-error">
          {{ saveError }}
          <button v-if="discError" type="button" @click="kind = 'team'; teamEditor?.revealDiscError()">定位命盘问题</button>
          <button v-else type="button" @click="retrySave">{{ blocked ? '覆盖本机存档' : '重试保存' }}</button>
        </p>
        <div class="battle-account-context">
          <DataAccountContextBar v-if="userId" compact :accounts="accounts" :account-id="sourceAccountId" :game="account?.game || ''" :is-logged-in="true" :loading="accountsLoading" :error="accountError" :before-switch="beforeAccountSwitch" />
          <label v-if="!account" class="battle-game-field">游戏<select v-model="draft.game" aria-label="游戏"><option>如鸢</option><option>代号鸢</option></select></label>
          <button v-if="accountError" type="button" @click="loadAccounts">重试读取账号</button>
          <template v-if="account && !accountsLoading">
            <span v-if="loading" class="battle-account-status" role="status">正在读取我的密探…</span>
            <span v-else-if="loaded" class="battle-account-status" role="status">{{ entries.length ? `已读取 ${entries.length} 位我的密探，选人时自动带入配置` : '当前账号暂无已拥有的密探，可手动填写' }}</span>
            <button v-if="loaded || error" class="battle-account-import" type="button" :disabled="loading" :title="loaded ? '密探名册有改动时重新读取；不会覆盖已编辑的阵容' : undefined" @click="readAccount">{{ error ? '重试读取' : '重新读取我的密探' }}</button>
          </template>
        </div>
        <p v-if="error" role="alert" class="battle-error">{{ error }}</p>
        <p v-if="accountsLoading" role="status">正在读取账号与本机草稿…</p>
        <template v-else>
          <section class="battle-meta" aria-label="图片基本信息">
            <label class="battle-title-field"><span class="sr-only">标题 / 关卡</span><input v-model="draft.title" aria-label="标题或关卡" maxlength="120" placeholder="给这份攻略起个名字"></label>
            <label class="battle-author-field"><span class="sr-only">署名</span><input v-model="draft.author" aria-label="署名" maxlength="60" placeholder="署名（可选）"></label>
          </section>
          <div class="battle-modes" role="tablist" aria-label="编辑内容" @keydown="moveTab">
            <button v-for="mode in MODES" :id="`battle-tab-${mode.value}`" :key="mode.value" type="button" role="tab" :aria-selected="kind === mode.value" :tabindex="kind === mode.value ? 0 : -1" aria-controls="battle-editor" @click="kind = mode.value">
              <component :is="mode.icon" :size="17" aria-hidden="true" />{{ mode.label }}
            </button>
          </div>
          <p v-if="catalogError" role="alert" class="battle-hint">{{ catalogError }} <button type="button" @click="loadCatalog">重试图鉴</button></p>
          <div id="battle-editor" class="battle-workspace" role="tabpanel" :aria-labelledby="`battle-tab-${kind}`">
            <BattleTeamEditor :key="revision" ref="teamEditor" v-show="kind === 'team'" :operators="draft.operators" :game="draft.game" :catalog="catalog" :account-entries="entries" @pending-name="pendingName = $event" @replace="(slot, operator) => draft.operators[slot] = operator" />
            <BattleRecorder :key="revision" v-show="kind === 'actions'" :operators="draft.operators" :rounds="draft.rounds" :targets="draft.targets" @round-change="roundIndex = $event" />
          </div>
          <details class="battle-common-note">
            <summary><FileText :size="15" aria-hidden="true" />打法说明<span>两种图片共用</span></summary>
            <label><span class="sr-only">图片说明</span><textarea v-model="draft.note" aria-label="图片说明" maxlength="2000" rows="3" placeholder="配队要求、替换建议或打法说明"></textarea></label>
          </details>
          <section v-if="exportOpen" ref="exportPanel" class="battle-export-panel" aria-label="图片预览与下载" tabindex="-1">
            <header><h2>图片预览与下载</h2><button type="button" @click="closeExport"><X :size="16" aria-hidden="true" />返回编辑</button></header>
            <BattleImageExport ref="exporter" :draft="draft" :kind="kind" :round-index="roundIndex" :catalog="catalog" :show-generate-button="false" @busy="exportBusy = $event" />
          </section>
        </template>
        <p class="battle-local-note"><Info :size="14" aria-hidden="true" />草稿仅保存在当前浏览器，清理浏览器数据会丢失。换设备前请导出草稿；图片与草稿均不会自动上传。</p>
      </div>
      <!-- 手机端页头随页面滚走，底部常驻生成入口；桌面端仍用页头按钮。 -->
      <div class="battle-mobile-dock">
        <span class="battle-save-status" role="status">{{ pendingName ? '密探名称尚未确认' : status || '编辑后自动保存到本机' }}</span>
        <button ref="dockExportButton" class="battle-primary" type="button" :disabled="accountsLoading || exportBusy" @click="openExport">
          <Download :size="16" aria-hidden="true" />{{ exportBusy ? '正在生成…' : kind === 'team' ? '生成配队图' : '生成操作图' }}
        </button>
      </div>
    </main>
  </div>
</template>

<script setup>
import './battleImages.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { auth } from '../../store/auth.js'
import { FEATURE_KEYS } from '../../config/features.js'
import { isFeatureAccessible } from '../../utils/featureAccess.js'
import { ChevronDown, Download, FileText, Info, ListOrdered, UsersRound, X } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import BattleTeamEditor from '../../components/work/BattleTeamEditor.vue'
import BattleRecorder from '../../components/work/BattleRecorder.vue'
import BattleImageExport from '../../components/work/BattleImageExport.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import { battleFileName, battleImageError, createBattleDraft } from '../../utils/battleImages.js'
import { BATTLE_DRAFT_MAX_BYTES, decodeBattleDraft, encodeBattleDraft } from '../../utils/battleDraft.js'
import { useBattleDraft } from '../../composables/useBattleDraft.js'
import { useBattleAccountSource } from '../../composables/useBattleAccountSource.js'
import { activeAccount } from '../../store/activeAccount.js'
import { dialog } from '../../utils/dialog.js'

const router = useRouter()
const canUseBattleImages = computed(() => isFeatureAccessible(FEATURE_KEYS.BATTLE_IMAGES, auth))
watch([canUseBattleImages, () => auth.adminAccessLoading], ([allowed, loading]) => {
  if (!allowed && !loading) void router.replace('/cart')
})
const { userId, account, accounts, accountsLoading, accountError, loadAccounts, catalog, catalogError, loadCatalog, entries, loading, loaded, error, readAccount } = useBattleAccountSource()
const sourceAccountId = computed(() => userId.value ? activeAccount.id : '')
const { draft, key, revision, dirty, status, saveError, discError, blocked, replace, overwrite } = useBattleDraft(userId, sourceAccountId)
const kind = ref('team'), roundIndex = ref(0), fileInput = ref(null), fileError = ref(''), importing = ref(false)
const pendingName = ref(false), exportOpen = ref(false), exporter = ref(null), exportPanel = ref(null), teamEditor = ref(null), exportButton = ref(null), dockExportButton = ref(null), fileErrorEl = ref(null)
const exportBusy = ref(false), draftMenu = ref(null)
const MODES = [{ value: 'team', label: '配队表', icon: UsersRound }, { value: 'actions', label: '操作表', icon: ListOrdered }]
async function moveTab(event) {
  const index = MODES.findIndex(mode => mode.value === kind.value)
  const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: MODES.length - 1 }[event.key]
  if (next === undefined) return
  event.preventDefault()
  kind.value = MODES[(next + MODES.length) % MODES.length].value
  await nextTick()
  document.getElementById(`battle-tab-${kind.value}`)?.focus()
}
function closeDraftMenu(restoreFocus = false) {
  if (!draftMenu.value?.open) return
  draftMenu.value.open = false
  if (restoreFocus) draftMenu.value.querySelector('summary')?.focus()
}
function closeDraftMenuOutside(event) { if (draftMenu.value?.open && !draftMenu.value.contains(event.target)) closeDraftMenu() }
async function openExport() {
  fileError.value = pendingName.value ? '请先确认密探名称，再生成图片。' : battleImageError(draft.value, kind.value)
  if (fileError.value) {
    if (discError.value) { kind.value = 'team'; await nextTick(); teamEditor.value?.revealDiscError(); return }
    // 底部按钮触发时错误提示在页面顶部，滚到可见处避免“点了没反应”。
    await nextTick(); fileErrorEl.value?.scrollIntoView?.({ block: 'center', behavior: 'auto' })
    return
  }
  exportOpen.value = true
  await nextTick()
  exportPanel.value?.focus({ preventScroll: true })
  exportPanel.value?.scrollIntoView?.({ block: 'start', behavior: 'auto' })
  await exporter.value?.generate()
}
async function closeExport() {
  exportOpen.value = false
  await nextTick()
  // 手机端页头按钮被隐藏，焦点回到当前可见的生成按钮。
  const visible = [exportButton.value, dockExportButton.value].find(el => el?.getClientRects().length)
  visible?.focus({ preventScroll: true })
}
watch(kind, () => { exportOpen.value = false; fileError.value = '' })
const unsaved = computed(() => dirty.value || pendingName.value)
let alive = true
watch(revision, () => { exportOpen.value = false; roundIndex.value = 0; fileError.value = ''; pendingName.value = false })
watch([account, revision], () => { if (account.value) draft.value.game = account.value.game }, { immediate: true })
onBeforeRouteLeave(() => !canUseBattleImages.value || !unsaved.value || dialog.confirm({ title: '离开图片工具？', message: '仍有未确认或未保存的输入，离开后将丢失。请先修正输入、确认密探名称并保存或导出草稿。', confirmText: '仍然离开', cancelText: '继续编辑' }))
async function beforeAccountSwitch() {
  return dialog.confirm({ title: '切换攻略账号？', message: unsaved.value ? '仍有未确认或未保存的输入。请取消，修正输入并保存或导出备份；继续切换会丢失未保存内容。' : '当前草稿保留在本机，切换后打开另一个账号的独立草稿。不会替换原草稿的阵容。', confirmText: '切换账号' })
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
  if (discError.value) { fileError.value = `草稿未导出：${discError.value}`; return }
  try {
    const url = URL.createObjectURL(new Blob([encodeBattleDraft(draft.value)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = battleFileName(draft.value.title, '配队草稿', 'json'); document.body.append(link); link.click(); link.remove()
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
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); document.addEventListener('pointerdown', closeDraftMenuOutside) })
onBeforeUnmount(() => { alive = false; window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('pointerdown', closeDraftMenuOutside) })
</script>

<style src="./battleImagesDesktop.css"></style>
<style src="./battleImagesMobile.css"></style>
