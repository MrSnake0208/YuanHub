<template>
  <div class="page-recruitment">
    <IslandSidebar />
    <main id="main-content" class="recruitment-main" @keydown.esc="onPageEscape">
      <CompactToolHeader title="招募档案" description="抽完卡，选对卡池，顺手记一笔。">
        <template v-if="enabled" #account>
          <div class="account-controls">
          <DataAccountContextBar data-guide-target="account" compact :accounts="state.accounts" :account-id="accountId" :game="game" :is-logged-in="!!identity" :loading="state.accountsLoading" :before-switch="beforeAccountSwitch" :switch-disabled="state.busy || !!exchangePanel?.isBusy?.()" switch-disabled-reason="正在保存招募档案，请等待完成后再切换账号。" description="本页记录、进度与备份均归属此账号。" />
            <button v-if="state.archive" class="archive-refresh" type="button" :disabled="state.loading || state.busy" @click="refresh"><RotateCw :size="15" aria-hidden="true" />刷新档案</button>
          </div>
        </template>
        <template v-if="enabled" #actions>
          <div v-if="TUTORIALS_ENABLED" class="guide-entry-wrap"><button ref="guideEntry" type="button" class="recruitment-tutorial-entry" :aria-expanded="guidePicker" @click="openGuide"><CircleHelp :size="15" aria-hidden="true" />{{ guideActive ? '退出教程' : '使用教程' }}</button>
          <RecruitmentGuideChoice v-if="guidePicker" @record="startGuide" @practice="openPractice" @close="dismissPageGuide" /></div>
          <button v-if="state.archive" type="button" class="act-btn archive-toggle" :aria-expanded="showArchive" aria-controls="recruitment-exchange" @click="showArchive = !showArchive"><Archive :size="15" aria-hidden="true" />{{ showArchive ? '收起导入与导出' : '导入与导出' }}</button>
        </template>
      </CompactToolHeader>
      <div v-if="!enabled" class="wrap"><p class="card">招募档案暂未开放。</p></div>
      <div v-else class="wrap recruitment-content">
        <RecruitmentExchange v-if="state.archive" id="recruitment-exchange" ref="exchangePanel" v-model:open="showArchive" :account-id="accountId" :account-name="state.accounts.find(account => account.id === accountId)?.name" :identity="identity" :revision="state.archive.archive_revision" :game="state.archive.game_snapshot" :read-only="state.archive.game_mismatch" :busy="state.busy" :context-version="state.contextVersion" :request-version="state.requestVersion" @busy="state.busy = $event" @committed="refresh" />
        <RecruitmentGuideHint v-if="TUTORIALS_ENABLED && guideActive && !editorOpen && pageGuideTarget !== 'pools'" :target="pageGuideTarget" :message="pageGuideMessage"><button type="button" @click="openPractice">先练习一下</button></RecruitmentGuideHint>
        <p data-guide-target="login" v-if="!identity" class="card">请先登录再使用招募档案。</p>
        <p data-guide-target="account-setup" v-else-if="!state.accountsLoading && !state.accounts.length && !state.error" class="card">还没有游戏账号。<router-link to="/user/profile#game-accounts">先创建游戏账号</router-link></p>
        <div data-guide-target="archive-state" class="feedback" aria-live="polite"><p v-if="state.error" class="error" role="alert">{{ state.error }}</p><p v-if="state.catalogError">{{ state.catalogError }}</p><p v-if="state.notice">{{ state.notice }}</p><p v-if="state.loading">正在读取档案…</p><button v-if="state.error" type="button" :disabled="state.loading || state.accountsLoading" @click="available ? refresh() : loadAccounts()">重新读取</button></div>
        <template v-if="state.archive">
          <p v-if="state.archive.game_mismatch" class="card error" role="alert">档案所属游戏为 {{ state.archive.game_snapshot }}，与账号当前游戏不一致。可以查看和导出，请核对账号；暂不能修改或导入。</p>
          <div class="summary" aria-label="当前账号招募摘要">
            <div class="summary-item"><span class="summary-icon" aria-hidden="true"><BookOpen :size="18" /></span><div><span>已知累计抽数</span><div class="summary-number"><strong>{{ state.archive.summary.known_total_pulls.toLocaleString() }}</strong><small class="number-unit">抽</small></div></div></div>
            <div class="summary-item"><span class="summary-icon" aria-hidden="true"><Gem :size="18" /></span><div><span>密探记录</span><div class="summary-number"><strong>{{ state.archive.summary.event_count }}</strong><small class="number-unit">条</small></div></div></div>
            <div class="summary-item summary-average"><span class="summary-icon" aria-hidden="true"><ChartNoAxesColumn :size="18" /></span><div><span>平均出绝密抽数</span><div class="summary-number"><strong>{{ state.archive.summary.average_gold_pulls ?? '—' }}</strong><small class="number-unit">抽</small></div></div></div>
            <div class="summary-item summary-permanent"><span class="summary-icon" aria-hidden="true"><Layers3 :size="18" /></span><div><span>绣衣天下已知抽数</span><div class="summary-number"><strong>{{ state.archive.summary.permanent_known_total_pulls?.toLocaleString() ?? '—' }}</strong><small class="number-unit">抽</small></div></div></div>
            <div v-for="metric in goldAgentHighlights" :key="metric.key" class="summary-item summary-agent" :class="'summary-' + metric.key">
              <span class="summary-icon" aria-hidden="true"><component :is="metric.icon" :size="18" /></span>
              <div><span>{{ metric.label }}</span>
                <p v-if="metric.agents == null" class="summary-empty">—</p>
                <p v-else-if="!metric.agents.length" class="summary-empty">暂无记录</p>
                <ul v-else class="summary-agent-list"><li v-for="agent in metric.agents" :key="agent.agent_id"><strong>{{ agents.find(item => item.id === agent.agent_id)?.name || agent.name }}</strong><small>{{ agent.count }} 次</small></li></ul>
              </div>
            </div>
          </div>
          <RecruitmentTimeline ref="timeline" :guide-active="TUTORIALS_ENABLED && guideActive && !editorOpen && pageGuideTarget === 'pools'" :pools="state.archive.pools" :catalog="state.catalog || []" :agents="agents" :pool-summaries="state.archive.pool_summaries || {}" :previews="previews.pools" @load-preview="loadPreview" :busy="state.loading || state.busy" :context-version="state.contextVersion" @select="openPool" @practice="openPractice" />
          <div v-if="!state.archive.pools.length" class="actions"><button type="button" :disabled="!writable" @click="exchangePanel?.openImport()">导入备份</button></div>
        </template>
      </div>
      <SiteFooter />
    </main>
    <RecruitmentPractice v-if="TUTORIALS_ENABLED && practiceOpen" @close="practiceOpen = false" />
    <PoolEditor ref="poolEditor" :open="editorOpen" :pool="selectedPool" :pool-summary="state.archive?.pool_summaries?.[selectedPoolId]" :agents="agents" :catalog="state.catalog || []" :can-record="canRecordPool(selectedPool)" :records="state.records" :records-loading="state.recordsLoading" :records-error="state.recordsError" :records-revision="state.recordsRevision" :has-more="!!state.recordsCursor" :busy="state.busy || state.loading" :read-only="!available || !!state.archive?.game_mismatch" :server-error="state.error" :request-version="state.requestVersion" :guided="TUTORIALS_ENABLED && guideActive" :save-receipt="saveReceipt" @close="editorOpen = false" @save="savePool" @load-more="loadPoolRecords(selectedPoolId, state.recordsCursor)" @load-all="loadAllPoolRecords" @retry="retryPoolReadback" @guide-dismiss="guideActive = false" @guide-start="guideActive = true" @practice="openPractice" />
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Archive, BookOpen, ChartNoAxesColumn, CircleHelp, Gem, Layers3, RotateCw, Shuffle, Trophy } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import PoolEditor from './PoolEditor.vue'
import RecruitmentGuideChoice from './RecruitmentGuideChoice.vue'
import RecruitmentGuideHint from './RecruitmentGuideHint.vue'
import RecruitmentPractice from './RecruitmentPractice.vue'
import RecruitmentExchange from './RecruitmentExchange.vue'
import RecruitmentTimeline from './RecruitmentTimeline.vue'
import { FEATURE_KEYS, isFeatureEnabled, TUTORIALS_ENABLED } from '../../config/features.js'
import { recruitmentPoolCatalog } from './rules.js'
import { dialog } from '../../utils/dialog.js'
import { useRecruitment } from './useRecruitment.js'

const enabled = isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE)
// Disabled routes do not initialize personal reads even if mounted directly.
const model = enabled ? useRecruitment() : null
const { state, accountId, identity, game, available, writable, agents, capture, matches, refresh, command, loadPoolRecords, loadAccounts, previews, loadPreview } = model || { state: {}, accountId: '', identity: '', game: '', available: false, writable: false, agents: [], refresh() {} }
const editorOpen = ref(false), selectedPoolId = ref(''), showArchive = ref(false)
const saveReceipt = ref(null), guideActive = ref(false), practiceOpen = ref(false), guidePicker = ref(false), guideEntry = ref(null)
const timeline = ref(null), exchangePanel = ref(null), poolEditor = ref(null)
const selectedPool = computed(() => state.archive?.pools.find(pool => pool.pool_id === selectedPoolId.value))
const goldAgentHighlights = computed(() => [
  { key: 'most-obtained', label: '抽中最多的绝密', icon: Trophy, agents: state.archive?.summary.most_obtained_gold_agents?.slice(0, 1) },
  { key: 'most-non-up', label: '歪得最多的绝密', icon: Shuffle, agents: state.archive?.summary.most_non_up_gold_agents }
])
const canRecordPool = pool => {
  const directory = recruitmentPoolCatalog(pool, state.catalog || [])
  return !!pool?.snapshot.catalog_pool_id && !!directory?.enabled && !directory.hidden && !state.catalogError
}
const pageGuideTarget = computed(() => {
  if (!identity.value) return 'login'
  if (state.error || state.loading || state.accountsLoading || !state.archive && available.value) return 'archive-state'
  if (!state.accounts.length) return 'account-setup'
  if (!available.value) return 'account'
  return 'pools'
})
const pageGuideMessage = computed(() => {
  if (!identity.value) return '登录后记录自己的抽卡，也可以先练习。'
  if (state.error) return '读取失败不代表没有记录。请重新读取，或先练习。'
  if (state.loading || state.accountsLoading) return '正在读取招募档案，请稍候。'
  if (!state.accounts.length) return '先添加你实际玩的游戏账号，已有账号不需要重建。'
  if (!available.value) return '在这里选择你实际使用的游戏账号。'
  return '正在读取档案，已有记录无需重复录入。'
})
function openGuide() {
  if (!TUTORIALS_ENABLED) return
  if (editorOpen.value) return poolEditor.value?.openGuide()
  if (guideActive.value) return dismissPageGuide()
  guidePicker.value = !guidePicker.value
}
function startGuide() { if (!TUTORIALS_ENABLED) return; guidePicker.value = false; guideActive.value = true }
function openPractice() {
  if (!TUTORIALS_ENABLED) return
  if (state.busy) return
  guidePicker.value = false; guideActive.value = false; practiceOpen.value = true
}
function onPageEscape(event) {
  if (editorOpen.value || (!guidePicker.value && !guideActive.value)) return
  event.preventDefault(); event.stopPropagation(); dismissPageGuide()
}
function dismissPageGuide() {
  guidePicker.value = false; guideActive.value = false
  nextTick(() => guideEntry.value?.focus({ preventScroll: true }))
}
watch(() => state.contextVersion, () => { showArchive.value = false; editorOpen.value = false; selectedPoolId.value = ''; saveReceipt.value = null; guidePicker.value = false })
async function beforeAccountSwitch() {
  if (state.busy || exchangePanel.value?.isBusy?.()) return false;
  if (poolEditor.value?.hasDraft?.() || exchangePanel.value?.hasDraft?.()) {
    return dialog.confirm({ title: '放弃当前账号的招募草稿？', message: '切换账号会关闭卡池编辑与备份预览。已保存的记录不受影响。', type: 'danger', confirmText: '放弃并切换', cancelText: '继续处理' });
  }
  return true;
}
function openPool(poolId) {
  if (state.loading || state.busy || !state.archive?.pools.some(pool => pool.pool_id === poolId)) return
  timeline.value?.focusPool(poolId)
  selectedPoolId.value = poolId; saveReceipt.value = null; state.error = ''; editorOpen.value = true; loadPoolRecords(poolId)
}
let loadingAllRecords = null
async function loadAllPoolRecords() {
  const token = { ...capture(), poolId: selectedPoolId.value }, poolId = token.poolId, cursors = new Set()
  if (loadingAllRecords && matches(loadingAllRecords) && loadingAllRecords.poolId === poolId || state.recordsLoading || state.busy) return
  loadingAllRecords = token
  try {
    while (matches(token) && editorOpen.value && poolId === selectedPoolId.value && state.recordsCursor) {
      if (state.records.length >= 20000) { state.recordsError = '历史排序最多支持本池20000条记录，请导出备份核对'; return }
      if (cursors.has(state.recordsCursor)) { state.recordsError = '分页游标重复，尚未读完本池记录，请重新读取'; return }
      cursors.add(state.recordsCursor)
      if (!await loadPoolRecords(poolId, state.recordsCursor)) return
    }
  } finally { if (loadingAllRecords === token) loadingAllRecords = null }
}
async function retryPoolReadback(refreshArchive = true) {
  const token = capture(), poolId = selectedPoolId.value, receipt = saveReceipt.value
  if (receipt && refreshArchive) await refresh()
  if (!matches(token) || poolId !== selectedPoolId.value) return
  let loaded = await loadPoolRecords(poolId)
  const cursors = new Set()
  while (loaded && matches(token) && poolId === selectedPoolId.value && (receipt?.ordered_event_ids || receipt?.deleted_event_ids.length || receipt?.entries.some(entry => !state.records.some(event => event.event_id === entry.event_id))) && state.recordsCursor) {
    if (cursors.has(state.recordsCursor)) { state.recordsError = '分页游标重复，保存顺序尚未核对，请重新读取'; return }
    if (receipt?.ordered_event_ids && state.records.length >= 20000) { state.recordsError = '回读记录超过20000条，保存顺序尚未核对'; return }
    cursors.add(state.recordsCursor)
    loaded = await loadPoolRecords(poolId, state.recordsCursor)
  }
}
async function savePool(payload) {
  if (!writable.value || payload.data.pool_id !== selectedPoolId.value) return
  const token = capture()
  try {
    const beforeSummary = state.archive?.pool_summaries?.[selectedPoolId.value] ? { ...state.archive.pool_summaries[selectedPoolId.value] } : null
    const result = await command(payload.operation, payload.data, { requestId: payload.requestId, expectedRevision: payload.revision })
    if (result && matches(token)) {
      state.notice = ''
      saveReceipt.value = { ...payload.data, entries: payload.data.entries.map(entry => ({ ...entry })), revision: result.archive_revision, requestId: payload.requestId, beforeSummary }
      await retryPoolReadback(false)
    }
  } catch (error) {
    if (error.status === 409 && matches(token)) await loadPoolRecords(selectedPoolId.value)
  }
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
:deep([data-guide-active]){outline:2px solid var(--accent);outline-offset:4px}
.recruitment-tutorial-entry{border:0;border-radius:8px;background:transparent;color:var(--ink-60)}

.archive-toggle{border:1.5px solid var(--line);border-radius:999px;background:transparent;color:var(--ink-60);transition:border-color .2s var(--ease),color .2s var(--ease),background-color .2s var(--ease)}.archive-toggle:hover{border-color:var(--accent);color:var(--ink);background:var(--cream)}.card{background:var(--surface);border:1px solid var(--line);border-radius:16px}.summary{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.summary-icon{color:var(--accent-strong)}.summary-item>div>span,.summary-item small{color:var(--ink-60)}.summary strong{color:var(--tea)}.archive-toggle{border:0;border-radius:6px;background:transparent}.account-note{color:var(--ink)}.archive-refresh{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:6px 8px;font-size:12px;background:transparent}.account-note{margin:4px 0 0;font-size:12px;line-height:1.6}
button{border:1px solid var(--line);border-radius:10px;color:var(--ink);background:var(--surface);cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.error{color:var(--rouge)}@media(min-width:768px){.summary-item:not(:nth-child(3n+1)){border-left:1px solid var(--line)}}
.summary-agent-list{list-style:none;margin:4px 0 0;padding:0}.summary-agent-list li{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 8px}.summary .summary-agent-list strong{font:700 15px/1.6 var(--font-b);overflow-wrap:anywhere}.summary-agent-list small{white-space:nowrap}.summary-empty{margin:4px 0 0;color:var(--ink-60)}
@media(prefers-reduced-motion:reduce){.archive-toggle{transition:none}}
</style>
<style scoped src="./recruitmentWorkspaceDesktop.css"></style>
<style scoped src="./recruitmentWorkspaceMobile.css"></style>
