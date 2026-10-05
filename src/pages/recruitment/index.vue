<template>
  <div class="page-recruitment">
    <IslandSidebar />
    <main id="main-content" class="recruitment-main">
      <header class="page-header"><div class="wrap"><h1 class="page-header-title">招募档案</h1><p class="page-header-description">查看与维护当前账号的招募记录与进度。</p></div></header>
      <div v-if="!enabled" class="wrap"><p class="card">招募档案暂未开放。</p></div>
      <div v-else class="wrap recruitment-content">
        <DataAccountContextBar compact :accounts="state.accounts" :account-id="accountId" :game="game" :is-logged-in="!!identity" :loading="state.accountsLoading" :before-switch="beforeAccountSwitch" :switch-disabled="state.busy || !!exchangePanel?.isBusy?.()" switch-disabled-reason="正在保存招募档案，请等待完成后再切换账号。" description="本页记录、进度与备份均归属此账号。">
          <template #actions>
            <button v-if="state.archive" type="button" class="act-btn archive-toggle" :aria-expanded="showArchive" aria-controls="recruitment-exchange" @click="showArchive = !showArchive"><Archive :size="15" aria-hidden="true" />{{ showArchive ? '收起备份与恢复' : '备份与恢复' }}</button>
          </template>
        </DataAccountContextBar>
        <RecruitmentExchange v-if="state.archive" id="recruitment-exchange" ref="exchangePanel" v-model:open="showArchive" :account-id="accountId" :account-name="state.accounts.find(account => account.id === accountId)?.name" :identity="identity" :revision="state.archive.archive_revision" :game="state.archive.game_snapshot" :read-only="state.archive.game_mismatch" :busy="state.busy" :context-version="state.contextVersion" :request-version="state.requestVersion" @busy="state.busy = $event" @committed="refresh" />
        <p v-if="!identity" class="card">请先登录再使用招募档案。</p>
        <p v-else-if="!state.accountsLoading && !state.accounts.length" class="card">还没有游戏账号。<router-link to="/user/profile#game-accounts">先创建游戏账号</router-link></p>
        <div class="feedback" aria-live="polite"><p v-if="state.error" class="error" role="alert">{{ state.error }}</p><p v-if="state.catalogError">{{ state.catalogError }}</p><p v-if="state.notice">{{ state.notice }}</p><p v-if="state.loading">正在读取档案…</p></div>
        <template v-if="state.archive">
          <p v-if="state.archive.game_mismatch" class="card error" role="alert">档案所属游戏为 {{ state.archive.game_snapshot }}，与账号当前游戏不一致。可以查看和导出，请核对账号；暂不能修改或导入。</p>
          <div class="summary" aria-label="当前账号招募摘要">
            <div class="summary-item"><span class="summary-icon" aria-hidden="true"><BookOpen :size="18" /></span><div><span>已知累计抽数</span><div class="summary-number"><strong>{{ state.archive.summary.known_total_pulls.toLocaleString() }}</strong><small class="number-unit">抽</small></div><small v-if="state.archive.summary.has_unknown">部分出货间隔或当前进度未知；累计按已记录的抽数计算</small><small v-else>历史基准 + 记录 + 批次 + 当前进度</small></div></div>
            <div class="summary-item"><span class="summary-icon" aria-hidden="true"><Gem :size="18" /></span><div><span>绝密记录</span><div class="summary-number"><strong>{{ state.archive.summary.event_count }}</strong><small class="number-unit">条</small></div><small>按每次出货分别记录，同一密探可重复</small></div></div>
          </div>
          <div class="archive-tools"><span>记录与进度均归属当前游戏账号</span><button type="button" :disabled="state.loading || state.busy" @click="refresh"><RotateCw :size="15" aria-hidden="true" />刷新档案</button></div>
          <RecruitmentTimeline ref="timeline" :pools="state.archive.pools" :catalog="state.catalog || []" :agents="agents" :pool-summaries="state.archive.pool_summaries || {}" :current-pool-id="state.archive.current_pool_id" :busy="state.loading || state.busy" :context-version="state.contextVersion" @select="openPool" />
          <div v-if="!state.archive.pools.length" class="actions"><button type="button" :disabled="!writable" @click="exchangePanel?.openImport()">导入备份</button></div>
        </template>
      </div>
      <SiteFooter />
    </main>
    <PoolEditor ref="poolEditor" :open="editorOpen" :pool="selectedPool" :agents="agents" :catalog="state.catalog || []" :can-record="canRecordPool(selectedPool)" :records="state.records" :records-loading="state.recordsLoading" :records-error="state.recordsError" :records-revision="state.recordsRevision" :has-more="!!state.recordsCursor" :busy="state.busy || state.loading" :read-only="!available || !!state.archive?.game_mismatch" :server-error="state.error" :request-version="state.requestVersion" @close="editorOpen = false" @save="savePool" @load-more="loadPoolRecords(selectedPoolId, state.recordsCursor)" @retry="loadPoolRecords(selectedPoolId)" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import '@/styles/page-header.css'
import { Archive, BookOpen, Gem, RotateCw } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import PoolEditor from './PoolEditor.vue'
import RecruitmentExchange from './RecruitmentExchange.vue'
import RecruitmentTimeline from './RecruitmentTimeline.vue'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { recruitmentPoolCatalog } from './rules.js'
import { dialog } from '../../utils/dialog.js'
import { useRecruitment } from './useRecruitment.js'

const enabled = isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE)
// Disabled routes do not initialize personal reads even if mounted directly.
const model = enabled ? useRecruitment() : null
const { state, accountId, identity, game, available, writable, agents, capture, matches, refresh, command, loadPoolRecords } = model || { state: {}, accountId: '', identity: '', game: '', available: false, writable: false, agents: [], refresh() {} }
const editorOpen = ref(false), selectedPoolId = ref(''), showArchive = ref(false)
const timeline = ref(null), exchangePanel = ref(null), poolEditor = ref(null)
const selectedPool = computed(() => state.archive?.pools.find(pool => pool.pool_id === selectedPoolId.value))
const canRecordPool = pool => !!pool?.snapshot.catalog_pool_id && !!recruitmentPoolCatalog(pool, state.catalog || [])?.enabled && !state.catalogError
watch(() => state.contextVersion, () => { showArchive.value = false; editorOpen.value = false; selectedPoolId.value = '' })
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
  selectedPoolId.value = poolId; state.error = ''; editorOpen.value = true; loadPoolRecords(poolId)
}
async function savePool(payload) {
  if (!writable.value || payload.data.pool_id !== selectedPoolId.value) return
  const token = capture()
  try {
    const result = await command(payload.operation, payload.data, { requestId: payload.requestId, expectedRevision: payload.revision })
    if (result && matches(token)) editorOpen.value = false
  } catch (error) {
    if (error.status === 409 && matches(token)) await loadPoolRecords(selectedPoolId.value)
  }
}
</script>

<style scoped>
.recruitment-content :deep(.data-account-context-bar.is-compact){display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.recruitment-content .archive-toggle{width:auto;min-width:0}.recruitment-content :deep(.timeline-heading h2){font-size:24px}

.archive-toggle{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:1.5px solid var(--line);border-radius:999px;padding:8px 16px;background:transparent;color:var(--ink-60);font-size:12.5px;font-weight:700;white-space:nowrap;transition:border-color .2s var(--ease),color .2s var(--ease),background-color .2s var(--ease)}.archive-toggle:hover{border-color:var(--accent);color:var(--ink);background:var(--cream)}.archive-toggle svg{flex:none}
.recruitment-main{min-width:0}.recruitment-content{padding-top:8px;padding-bottom:32px}.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin:16px 0;min-width:0;overflow-wrap:anywhere}.summary{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:16px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.summary-item{display:flex;align-items:start;gap:8px;min-width:0}.summary-item>div{min-width:0}.summary-icon{flex:none;color:var(--accent-strong);padding-top:4px}.summary-item>div>span,.summary-item small{display:block;font-size:12px;color:var(--ink-60);line-height:1.7}.summary-number{display:flex;align-items:baseline;gap:6px}.summary strong{font:800 20px/1.4 var(--font-d);color:var(--tea)}.summary-item .number-unit{font-size:12px}.archive-toggle{border:0;border-radius:6px;padding:8px;background:transparent}.archive-tools{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:20px}.archive-tools>span{font-size:12px;color:var(--ink-60)}.archive-tools button{display:inline-flex;align-items:center;gap:8px}
button{min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px 14px;color:var(--ink);background:var(--surface);font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.actions{display:flex;flex-wrap:wrap;gap:10px}.error{color:var(--rouge)}.feedback p{line-height:1.7}@media(min-width:768px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.summary-item+.summary-item{border-left:1px solid var(--line);padding-left:24px}}
@media(prefers-reduced-motion:reduce){.archive-toggle{transition:none}}
</style>
