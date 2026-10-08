<template>
  <div class="page-recruitment">
    <IslandSidebar />
    <main id="main-content" class="recruitment-main" @keydown.esc="onPageEscape">
      <CompactToolHeader title="招募档案" description="抽完卡，选对卡池，顺手记一笔。">
        <template v-if="enabled" #account>
          <DataAccountContextBar data-guide-target="account" compact :accounts="state.accounts" :account-id="accountId" :game="game" :is-logged-in="!!identity" :loading="state.accountsLoading" :before-switch="beforeAccountSwitch" :switch-disabled="state.busy || !!exchangePanel?.isBusy?.()" switch-disabled-reason="正在保存招募档案，请等待完成后再切换账号。" description="本页记录、进度与备份均归属此账号。" />
        </template>
        <template v-if="enabled" #actions>
          <div class="guide-entry-wrap"><button ref="guideEntry" type="button" class="recruitment-tutorial-entry" :aria-expanded="guidePicker" @click="openGuide"><CircleHelp :size="15" aria-hidden="true" />{{ guideActive ? '退出教程' : '使用教程' }}</button>
          <RecruitmentGuideChoice v-if="guidePicker" @record="startGuide" @practice="openPractice" @close="dismissPageGuide" /></div>
          <button v-if="state.archive" type="button" class="act-btn archive-toggle" :aria-expanded="showArchive" aria-controls="recruitment-exchange" @click="showArchive = !showArchive"><Archive :size="15" aria-hidden="true" />{{ showArchive ? '收起备份与恢复' : '备份与恢复' }}</button>
        </template>
      </CompactToolHeader>
      <div v-if="!enabled" class="wrap"><p class="card">招募档案暂未开放。</p></div>
      <div v-else class="wrap recruitment-content">
        <RecruitmentExchange v-if="state.archive" id="recruitment-exchange" ref="exchangePanel" v-model:open="showArchive" :account-id="accountId" :account-name="state.accounts.find(account => account.id === accountId)?.name" :identity="identity" :revision="state.archive.archive_revision" :game="state.archive.game_snapshot" :read-only="state.archive.game_mismatch" :busy="state.busy" :context-version="state.contextVersion" :request-version="state.requestVersion" @busy="state.busy = $event" @committed="refresh" />
        <RecruitmentGuideHint v-if="guideActive && !editorOpen && pageGuideTarget !== 'pools'" :target="pageGuideTarget" :message="pageGuideMessage"><button type="button" @click="openPractice">先练习一下</button></RecruitmentGuideHint>
        <p data-guide-target="login" v-if="!identity" class="card">请先登录再使用招募档案。</p>
        <p data-guide-target="account-setup" v-else-if="!state.accountsLoading && !state.accounts.length && !state.error" class="card">还没有游戏账号。<router-link to="/user/profile#game-accounts">先创建游戏账号</router-link></p>
        <div data-guide-target="archive-state" class="feedback" aria-live="polite"><p v-if="state.error" class="error" role="alert">{{ state.error }}</p><p v-if="state.catalogError">{{ state.catalogError }}</p><p v-if="state.notice">{{ state.notice }}</p><p v-if="state.loading">正在读取档案…</p><button v-if="state.error" type="button" :disabled="state.loading || state.accountsLoading" @click="available ? refresh() : loadAccounts()">重新读取</button></div>
        <template v-if="state.archive">
          <p v-if="state.archive.game_mismatch" class="card error" role="alert">档案所属游戏为 {{ state.archive.game_snapshot }}，与账号当前游戏不一致。可以查看和导出，请核对账号；暂不能修改或导入。</p>
          <div class="summary" aria-label="当前账号招募摘要">
            <div class="summary-item"><span class="summary-icon" aria-hidden="true"><BookOpen :size="18" /></span><div><span>已知累计抽数</span><div class="summary-number"><strong>{{ state.archive.summary.known_total_pulls.toLocaleString() }}</strong><small class="number-unit">抽</small></div><small v-if="state.archive.summary.has_unknown">部分出货间隔或当前进度未知；累计按已记录的抽数计算</small><small v-else>历史基准 + 记录 + 批次 + 当前进度</small></div></div>
            <div class="summary-item"><span class="summary-icon" aria-hidden="true"><Gem :size="18" /></span><div><span>绝密记录</span><div class="summary-number"><strong>{{ state.archive.summary.event_count }}</strong><small class="number-unit">条</small></div><small>按每次出货分别记录，同一密探可重复</small></div></div>
          </div>
          <div class="archive-tools"><span>记录与进度均归属当前游戏账号</span><button type="button" :disabled="state.loading || state.busy" @click="refresh"><RotateCw :size="15" aria-hidden="true" />刷新档案</button></div>
          <RecruitmentTimeline ref="timeline" :guide-active="guideActive && !editorOpen && pageGuideTarget === 'pools'" :pools="state.archive.pools" :catalog="state.catalog || []" :agents="agents" :pool-summaries="state.archive.pool_summaries || {}" :current-pool-id="state.archive.current_pool_id" :busy="state.loading || state.busy" :context-version="state.contextVersion" @select="openPool" @practice="openPractice" />
          <div v-if="!state.archive.pools.length" class="actions"><button type="button" :disabled="!writable" @click="exchangePanel?.openImport()">导入备份</button></div>
        </template>
      </div>
      <SiteFooter />
    </main>
    <RecruitmentPractice v-if="practiceOpen" @close="practiceOpen = false" />
    <PoolEditor ref="poolEditor" :open="editorOpen" :pool="selectedPool" :pool-summary="state.archive?.pool_summaries?.[selectedPoolId]" :agents="agents" :catalog="state.catalog || []" :can-record="canRecordPool(selectedPool)" :records="state.records" :records-loading="state.recordsLoading" :records-error="state.recordsError" :records-revision="state.recordsRevision" :has-more="!!state.recordsCursor" :busy="state.busy || state.loading" :read-only="!available || !!state.archive?.game_mismatch" :server-error="state.error" :request-version="state.requestVersion" :guided="guideActive" :save-receipt="saveReceipt" @close="editorOpen = false" @save="savePool" @load-more="loadPoolRecords(selectedPoolId, state.recordsCursor)" @retry="retryPoolReadback" @guide-dismiss="guideActive = false" @guide-start="guideActive = true" @practice="openPractice" />
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Archive, BookOpen, CircleHelp, Gem, RotateCw } from '@lucide/vue'
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
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { recruitmentPoolCatalog } from './rules.js'
import { dialog } from '../../utils/dialog.js'
import { useRecruitment } from './useRecruitment.js'

const enabled = isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE)
// Disabled routes do not initialize personal reads even if mounted directly.
const model = enabled ? useRecruitment() : null
const { state, accountId, identity, game, available, writable, agents, capture, matches, refresh, command, loadPoolRecords, loadAccounts } = model || { state: {}, accountId: '', identity: '', game: '', available: false, writable: false, agents: [], refresh() {} }
const editorOpen = ref(false), selectedPoolId = ref(''), showArchive = ref(false)
const saveReceipt = ref(null), guideActive = ref(false), practiceOpen = ref(false), guidePicker = ref(false), guideEntry = ref(null)
const timeline = ref(null), exchangePanel = ref(null), poolEditor = ref(null)
const selectedPool = computed(() => state.archive?.pools.find(pool => pool.pool_id === selectedPoolId.value))
const canRecordPool = pool => !!pool?.snapshot.catalog_pool_id && !!recruitmentPoolCatalog(pool, state.catalog || [])?.enabled && !state.catalogError
const pageGuideTarget = computed(() => {
  if (!identity.value) return 'login'
  if (state.error || state.loading || state.accountsLoading || !state.archive && available.value) return 'archive-state'
  if (!state.accounts.length) return 'account-setup'
  if (!available.value) return 'account'
  return 'pools'
})
const pageGuideMessage = computed(() => {
  if (!identity.value) return '先登录，才能记录自己的真实抽卡；也可以先练习。'
  if (state.error) return '读取失败不代表没有记录。请重新读取，或先练习。'
  if (state.loading || state.accountsLoading) return '正在读取真实资料，读完后会带你找到卡池。'
  if (!state.accounts.length) return '先添加你实际玩的游戏账号，已有账号不需要重建。'
  if (!available.value) return '在这里选择你实际使用的游戏账号。'
  return '正在确认档案；不会把未读到的资料当空数据。'
})
function openGuide() {
  if (editorOpen.value) return poolEditor.value?.openGuide()
  if (guideActive.value) return dismissPageGuide()
  guidePicker.value = !guidePicker.value
}
function startGuide() { guidePicker.value = false; guideActive.value = true }
function openPractice() {
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
async function retryPoolReadback(refreshArchive = true) {
  const token = capture(), poolId = selectedPoolId.value, receipt = saveReceipt.value
  if (receipt && refreshArchive) await refresh()
  if (!matches(token) || poolId !== selectedPoolId.value) return
  let loaded = await loadPoolRecords(poolId)
  const cursors = new Set()
  while (loaded && matches(token) && poolId === selectedPoolId.value && (receipt?.deleted_event_ids.length || receipt?.entries.some(entry => !state.records.some(event => event.event_id === entry.event_id))) && state.recordsCursor && !cursors.has(state.recordsCursor)) {
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
:deep([data-guide-active]){outline:2px solid var(--accent);outline-offset:4px}.guide-entry-wrap{position:relative}.guide-entry-wrap>.guide-choice{position:absolute;right:0;top:100%;width:min(240px,calc(100vw - 32px));z-index:var(--z-popover)}
.archive-toggle{width:auto;min-width:0}.recruitment-content :deep(.timeline-heading h2){font-size:24px}
.recruitment-tutorial-entry{display:inline-flex;align-items:center;gap:5px;padding:0 4px;border:0;border-radius:8px;background:transparent;color:var(--ink-60);font:12px/1.5 var(--font-b);white-space:nowrap}

.archive-toggle{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:1.5px solid var(--line);border-radius:999px;padding:8px 16px;background:transparent;color:var(--ink-60);font-size:12.5px;font-weight:700;white-space:nowrap;transition:border-color .2s var(--ease),color .2s var(--ease),background-color .2s var(--ease)}.archive-toggle:hover{border-color:var(--accent);color:var(--ink);background:var(--cream)}.archive-toggle svg{flex:none}
.recruitment-main{min-width:0}.recruitment-content{padding-top:8px;padding-bottom:32px}.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin:16px 0;min-width:0;overflow-wrap:anywhere}.summary{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:16px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.summary-item{display:flex;align-items:start;gap:8px;min-width:0}.summary-item>div{min-width:0}.summary-icon{flex:none;color:var(--accent-strong);padding-top:4px}.summary-item>div>span,.summary-item small{display:block;font-size:12px;color:var(--ink-60);line-height:1.7}.summary-number{display:flex;align-items:baseline;gap:6px}.summary strong{font:800 20px/1.4 var(--font-d);color:var(--tea)}.summary-item .number-unit{font-size:12px}.archive-toggle{border:0;border-radius:6px;padding:8px;background:transparent}.archive-tools{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:20px}.archive-tools>span{font-size:12px;color:var(--ink-60)}.archive-tools button{display:inline-flex;align-items:center;gap:8px}
button{min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px 14px;color:var(--ink);background:var(--surface);font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.actions{display:flex;flex-wrap:wrap;gap:10px}.error{color:var(--rouge)}.feedback p{line-height:1.7}@media(min-width:768px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.summary-item+.summary-item{border-left:1px solid var(--line);padding-left:24px}}
@media(prefers-reduced-motion:reduce){.archive-toggle{transition:none}}
</style>
