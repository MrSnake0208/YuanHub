<template>
  <div class="page-recruitment">
    <IslandSidebar />
    <main id="main-content" class="recruitment-main">
      <header class="hero"><div class="wrap"><div class="crumb"><span class="pill fill">招募档案</span><span class="pill">内测</span></div><h1>招募档案</h1><p class="hero-sub">记下每次绝密出货，也保留不知道的部分。记录、历史补录和当前进度都归属你的游戏账号。</p></div></header>
      <div v-if="!enabled" class="wrap"><p class="card">招募档案暂未开放。</p></div>
      <div v-else class="wrap recruitment-content">
        <DataAccountContextBar :accounts="state.accounts" :account-id="accountId" :game="game" :is-logged-in="!!identity" :loading="state.accountsLoading" description="本页记录、进度与备份均归属此账号。">
          <template #actions>
            <button v-if="state.archive" type="button" class="act-btn archive-toggle" :aria-expanded="showArchive" aria-controls="recruitment-exchange" @click="showArchive = !showArchive"><Archive :size="15" aria-hidden="true" />{{ showArchive ? '收起备份与恢复' : '备份与恢复' }}</button>
          </template>
        </DataAccountContextBar>
        <RecruitmentExchange v-if="state.archive" id="recruitment-exchange" ref="exchangePanel" v-model:open="showArchive" :account-id="accountId" :account-name="state.accounts.find(account => account.id === accountId)?.name" :identity="identity" :revision="state.archive.archive_revision" :game="state.archive.game_snapshot" :read-only="state.archive.game_mismatch" :busy="state.busy" :context-version="state.contextVersion" :request-version="state.requestVersion" @busy="state.busy = $event" @committed="refresh" />
        <p v-if="!identity" class="card">请先登录再使用招募档案。</p>
        <p v-else-if="!beta.canUseBetaFeatures" class="card">招募档案目前需要内测资格。<router-link to="/beta">查看资格</router-link></p>
        <p v-else-if="!state.accountsLoading && !state.accounts.length" class="card">还没有游戏账号。<router-link to="/user/profile#game-accounts">先创建游戏账号</router-link></p>
        <div class="feedback" aria-live="polite"><p v-if="state.error" class="error" role="alert">{{ state.error }}</p><p v-if="state.catalogError">{{ state.catalogError }}</p><p v-if="state.notice">{{ state.notice }}</p><p v-if="state.loading">正在读取档案…</p></div>
        <template v-if="state.archive">
          <p v-if="state.archive.game_mismatch" class="card error" role="alert">档案所属游戏为 {{ state.archive.game_snapshot }}，与账号当前游戏不一致。可以查看和导出，请核对账号；暂不能修改或导入。</p>
          <section class="card current-card" aria-labelledby="current-title">
            <div class="section-heading"><h2 id="current-title">正在抽的卡池</h2><button type="button" :disabled="state.loading || state.busy" @click="refresh">刷新档案</button></div>
            <label>当前卡池<select :value="currentPool?.pool_id || ''" :disabled="!writable || !state.archive.pools.length" @change="perform('set_current_pool', { pool_id: $event.target.value })"><option value="" disabled>暂无公共卡池</option><option v-for="pool in state.archive.pools" :key="pool.pool_id" :value="pool.pool_id">{{ poolName(pool) }}</option></select></label>
            <div v-if="!state.archive.pools.length" class="empty"><p>当前游戏暂无公共卡池，请联系管理员配置。仍可填写历史总抽数或导入已有备份。</p><div class="actions"><button type="button" :disabled="!writable" @click="openMaintenance()">补历史总抽数</button><button type="button" :disabled="!writable" @click="exchangePanel?.openImport()">导入备份</button></div></div>
            <template v-if="currentPool"><p v-if="!canRecordPool(currentPool)" class="hint">此卡池已停用或不在管理员目录中，保留历史与进度维护；新增记录请选择已启用的公共卡池。</p><p v-if="currentSummary" class="hint">本池已知累计 {{ currentSummary.known_total_pulls }} 抽 · 绝密 {{ currentSummary.event_count }} 条{{ currentSummary.has_unknown ? ' · 仍有未知间隔或进度' : '' }}（不含账号历史基准）</p><p class="current-progress">最后一次绝密后已抽 <strong>{{ currentPool.progress == null ? '未知' : currentPool.progress }}</strong><span v-if="currentPool.progress != null"> 次</span></p><p v-if="currentPool.progress != null && currentPool.progress < 40" class="hint">按 40 抽口径换算，距离下一次为 {{ 40 - currentPool.progress }} 次。此为记录参考，不代表所有卡池已核实相同规则。</p><div class="actions"><button class="primary" type="button" :disabled="!writable || !canRecordPool(currentPool)" @click="openEditor()">记录绝密</button><button type="button" :disabled="!writable || !recordablePools.length" @click="openEditor(true)">补录历史</button></div></template>
            <details><summary>校正当前进度 / 手填剩余次数</summary><form class="compact-form" @submit.prevent="saveProgress"><label>填写方式<select v-model="progressMode"><option value="direct">最后一次绝密后已抽次数</option><option value="remaining">距离下一次 40 抽还需 N 次</option><option value="unknown">进度未知</option></select></label><label v-if="progressMode !== 'unknown'">{{ progressMode === 'remaining' ? 'N（手填，1–40）' : '已抽次数' }}<input v-model="progressValue" type="number" inputmode="numeric" :min="progressMode === 'remaining' ? 1 : 0" :max="progressMode === 'remaining' ? 40 : 1000000000" required></label><p class="hint">会替换此卡池的当前进度。N 由你填写，换算为 40 − N，不会新增一条绝密记录。</p><button type="submit" :disabled="!writable || !currentPool">保存进度</button></form></details>
          </section>
          <div class="summary card"><div><span>已知累计抽数</span><strong>{{ state.archive.summary.known_total_pulls.toLocaleString() }}</strong><small v-if="state.archive.summary.has_unknown">部分出货间隔或当前进度未知；累计按已记录的抽数计算</small><small v-else>历史基准 + 记录 + 批次 + 当前进度</small></div><div><span>绝密记录</span><strong>{{ state.archive.summary.event_count }}</strong><small>{{ state.archive.summary.unknown_event_count }} 条出货抽数未知</small></div></div>
          <section class="card" aria-labelledby="history-title"><div class="section-heading"><h2 id="history-title">{{ historyView === 'recent' ? '最近记录' : '卡池档案' }}</h2><button type="button" :disabled="!writable || !recordablePools.length" @click="openEditor(true)">补录历史</button></div>
            <div class="actions view-buttons" aria-label="档案视图"><button type="button" :aria-pressed="historyView === 'recent'" @click="historyView = 'recent'">最近记录</button><button type="button" :aria-pressed="historyView === 'pools'" @click="historyView = 'pools'">卡池档案</button></div>
            <div v-if="historyView === 'pools'" class="pool-grid"><article v-for="pool in state.archive.pools" :key="pool.pool_id" class="pool-card"><h3>{{ poolName(pool) }}</h3><p v-if="state.archive.pool_summaries?.[pool.pool_id]">已知累计 {{ state.archive.pool_summaries[pool.pool_id].known_total_pulls }} 抽 · 绝密 {{ state.archive.pool_summaries[pool.pool_id].event_count }} 条<span v-if="state.archive.pool_summaries[pool.pool_id].has_unknown"> · 仍有未知间隔或进度</span></p><p>当前进度 {{ pool.progress == null ? '未知' : pool.progress + ' 抽' }}</p><button type="button" :disabled="state.loading" @click="viewPool(pool.pool_id)">查看本池记录</button><button type="button" :disabled="!writable || !canRecordPool(pool)" @click="openEditor(true, pool.pool_id)">补录本池</button></article></div>
            <form class="filters" @submit.prevent="refresh"><label>卡池<select v-model="state.poolFilter"><option value="">全部卡池</option><option v-for="pool in state.archive.pools" :key="pool.pool_id" :value="pool.pool_id">{{ poolName(pool) }}</option></select></label><label>记录顺序<select v-model="state.order"><option value="desc">从新到旧</option><option value="asc">从早到晚</option></select></label><label>开始日期<input v-model="state.dateFrom" type="date"></label><label>结束日期<input v-model="state.dateTo" type="date" :min="state.dateFrom"></label><button type="submit" :disabled="state.loading">筛选</button></form><p class="hint">顺序适用于整个历史档案。按获得日期筛选时，不包括获得日期未知的记录；获得日期与录入时间各自保留。</p>
            <p v-if="!state.events.length && !state.loading" class="empty">还没有符合条件的记录。</p>
            <ol class="event-list"><li v-for="event in state.events" :key="event.event_id" class="event-row"><div class="event-main"><div class="event-identity"><OperatorAvatar :avatar="eventAgent(event).avatar || ''" :name="agentName(event)" :rarity="5" /><strong>{{ agentName(event) }}</strong><small v-if="eventAgent(event).placeholder">UP 占位</small></div><span class="span-number">{{ event.pull_span == null ? '抽数未知' : event.pull_span + ' 抽出货' }}</span><small>{{ poolById(event.pool_id) ? poolName(poolById(event.pool_id)) : event.pool_snapshot.name }} · {{ event.acquired_date || '日期未知' }} · {{ upLabel(event.up_status) }}</small><small v-if="event.created_at">录入于 <time :datetime="event.created_at">{{ formatDate(event.created_at) }}</time></small><small v-if="event.batch_id">属于已知总量批次，累计只计批次一次</small><p v-if="event.note" class="event-note">{{ event.note }}</p></div><div class="event-actions"><button type="button" :disabled="!writable" @click="openEdit(event)">修改</button><button type="button" :disabled="!writable" @click="moveEvent(event, -1)" :aria-label="agentName(event) + ' 向较早位置移动'">前移</button><button type="button" :disabled="!writable" @click="moveEvent(event, 1)" :aria-label="agentName(event) + ' 向较晚位置移动'">后移</button><button class="danger" type="button" :disabled="!writable" @click="deleteEvent(event)">删除</button></div></li></ol>
            <button v-if="state.nextCursor" class="load-more" type="button" :disabled="state.loading" @click="loadMore">加载更多</button>
            <div v-if="state.undo" class="undo" role="status"><span>已删除，可在下一次修改前撤销。</span><button type="button" :disabled="!writable" @click="undoDelete">撤销删除</button></div>
            <details v-if="state.batches.length"><summary>已知总量批次（已加载 {{ state.batches.length }}）</summary><div v-for="batch in state.batches" :key="batch.batch_id" class="batch-row"><span>{{ poolById(batch.pool_id)?.snapshot.name || '卡池' }} · {{ batch.total_pull_count }} 抽</span><button class="danger" type="button" :disabled="!writable" @click="deleteBatch(batch)">删除整批</button></div><button v-if="state.batchCursor" type="button" :disabled="state.loading" @click="loadMoreBatches">加载更多批次</button><p class="hint">批次按卡池筛选，不按节点日期筛选。删除单个绝密不会猜测其抽数；删除整批才移除该批总量。</p></details>
          </section>
          <details ref="maintenancePanel" class="card maintenance"><summary>历史总抽数</summary>
            <section><h2>历史基准</h2><p class="hint">尚未拆成记录的已知历史抽数。仅账号一份；补录已有抽数时选择“从基准拆出”，避免重复计算。</p><form class="compact-form" @submit.prevent="saveBaseline"><label>当前基准 {{ state.archive.baseline }} 抽；调整为<input ref="baselineInput" v-model="baselineValue" type="number" inputmode="numeric" min="0" required></label><button type="submit" :disabled="!writable">更新历史基准</button></form></section>
          </details>
        </template>
      </div>
      <SiteFooter />
    </main>
    <EntryEditor :open="editorOpen" :pools="editingEvent ? state.archive?.pools || [] : recordablePools" :agents="agents" :catalog="state.catalog || []" :current-pool-id="editorPoolId || currentPool?.pool_id" :event="editingEvent" :busy="state.busy" :read-only="!available || !!state.archive?.game_mismatch" :server-error="state.error" :request-version="state.requestVersion" :initial-mode="editorHistorical ? 'historical' : 'current'" @close="editorOpen = false" @save="saveEntry" />
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Archive } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import EntryEditor from './EntryEditor.vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import RecruitmentExchange from './RecruitmentExchange.vue'
import { beta } from '../../store/beta.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { dialog } from '../../utils/dialog.js'
import { listRecruitmentEvents } from '../../api/recruitment.js'
import { integer, progressFromRemaining, recruitmentPoolCatalog, resolveRecruitmentAgent } from './rules.js'
import { useRecruitment } from './useRecruitment.js'
import { formatDate } from '../../utils/workDisplay.js'
const enabled = isFeatureEnabled(FEATURE_KEYS.RECRUITMENT_ARCHIVE)
// Disabled routes do not initialize personal reads even if mounted directly.
const model = enabled ? useRecruitment() : null
const { state, accountId, identity, game, available, writable, agents, capture, matches, refresh, loadMore, loadMoreBatches, command } = model || { state: {}, accountId: '', identity: '', game: '', available: false, writable: false, agents: [], refresh() {}, loadMore() {}, loadMoreBatches() {} }
const editorOpen = ref(false), editorHistorical = ref(false), editingEvent = ref(null), progressMode = ref('direct'), progressValue = ref(''), baselineValue = ref('')
const historyView = ref('recent'), editorPoolId = ref('')
const showArchive = ref(false)
const maintenancePanel = ref(null), baselineInput = ref(null), exchangePanel = ref(null)
const poolById = id => state.archive?.pools.find(pool => pool.pool_id === id)
const canRecordPool = pool => !!pool?.snapshot.catalog_pool_id && !!recruitmentPoolCatalog(pool, state.catalog)?.enabled && !state.catalogError
const recordablePools = computed(() => (state.archive?.pools || []).filter(canRecordPool))
const currentPool = computed(() => poolById(state.archive?.current_pool_id) || recordablePools.value[0] || state.archive?.pools[0])
watch(() => currentPool.value?.pool_id, () => { progressValue.value = ''; progressMode.value = 'direct' })
const currentSummary = computed(() => state.archive?.pool_summaries?.[currentPool.value?.pool_id])
const poolName = pool => recruitmentPoolCatalog(pool, state.catalog)?.name || pool.mapped_snapshot?.name || pool.snapshot.name
const eventAgent = event => resolveRecruitmentAgent(event, poolById(event.pool_id), state.catalog, agents.value || [])
const agentName = event => eventAgent(event).name
const upLabel = status => ({ up: 'UP', non_up: '非 UP', unknown: 'UP 未知' })[status] || 'UP 未知'
watch(() => state.contextVersion, () => { showArchive.value = false; editorOpen.value = false; editingEvent.value = null; editorPoolId.value = ''; historyView.value = 'recent'; baselineValue.value = ''; progressValue.value = '' })
function openEditor(historical = false, poolId = '') { const target = poolById(poolId || currentPool.value?.pool_id); if (!recordablePools.value.length) return; editingEvent.value = null; editorHistorical.value = historical; editorPoolId.value = canRecordPool(target) ? target.pool_id : recordablePools.value[0].pool_id; editorOpen.value = true }
async function openMaintenance() {
  if (!writable.value || !maintenancePanel.value) return
  maintenancePanel.value.open = true
  await nextTick()
  baselineInput.value?.focus()
}
function viewPool(poolId) { state.poolFilter = poolId; refresh() }
function openEdit(event) { editingEvent.value = event; editorOpen.value = true }
async function perform(operation, data, options) { try { return await command(operation, data, options) } catch { return null } }
async function saveEntry(payload) { if (await perform(payload.operation, payload.data, { requestId: payload.requestId })) editorOpen.value = false }
async function validate(action) { try { await action() } catch (error) { state.error = error.message } }
function saveProgress() { return validate(() => perform('progress_set', { pool_id: currentPool.value.pool_id, progress: progressMode.value === 'unknown' ? null : progressMode.value === 'remaining' ? progressFromRemaining(progressValue.value) : integer(progressValue.value, '当前进度') })) }
function saveBaseline() { return validate(() => perform('baseline_set', { baseline: integer(baselineValue.value, '历史基准') })) }
async function deleteEvent(event) {
  const token = capture(), revision = state.archive.archive_revision
  const message = event.batch_id ? '只移除这位绝密结果，批次总抽数不变。' : event.pull_span == null ? '移除此结果（抽数未知），已知累计不变。' : '将减少这条记录计入的 ' + event.pull_span + ' 抽。'
  const ok = await dialog.confirm({ title: '删除这条记录？', message: message + '相邻记录、基准和当前进度不变。下一次修改前可撤销。', type: 'danger', confirmText: '删除记录' })
  if (ok && matches(token)) await perform('event_delete', { event_id: event.event_id }, { expectedRevision: revision })
}
async function deleteBatch(batch) {
  const token = capture(), revision = state.archive.archive_revision
  const ok = await dialog.confirm({ title: '删除整个批次？', message: '此批 ' + batch.total_pull_count + ' 抽及其有效绝密结果将移除。下一次修改前可撤销。', type: 'danger', confirmText: '删除整批' })
  if (ok && matches(token)) await perform('batch_delete', { batch_id: batch.batch_id, confirm_total_pull_count: batch.total_pull_count }, { expectedRevision: revision })
}
async function undoDelete() { const undo = state.undo; if (undo) await perform(undo.operation, undo.data, { expectedRevision: undo.revision }) }
async function moveEvent(event, delta) {
  if (!writable.value) return
  const token = capture(), revision = state.archive.archive_revision
  let cursor = null, events = []
  try {
    do {
      const page = await listRecruitmentEvents({ accountId: token.accountId, poolId: event.pool_id, cursor, order: 'asc', limit: 100 })
      if (!matches(token)) return
      if (page.archive_revision !== revision) throw new Error('记录已更新，请刷新后重排')
      events.push(...page.items); cursor = page.next_cursor
      if (events.length > 20000) throw new Error('此卡池记录超过两万条，暂不支持重排')
    } while (cursor)
    const ids = events.map(item => item.event_id), index = ids.indexOf(event.event_id), target = index + delta
    if (index < 0 || target < 0 || target >= ids.length) { state.notice = '已经位于这一端'; return }
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    if (matches(token)) await perform('event_reorder', { pool_id: event.pool_id, event_ids: ids }, { expectedRevision: revision })
  } catch (error) { if (matches(token)) state.error = error.message }
}
</script>

<style scoped>
.archive-toggle{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:1.5px solid var(--line);border-radius:999px;padding:8px 16px;background:transparent;color:var(--ink-60);font-size:12.5px;font-weight:700;white-space:nowrap;transition:border-color .2s var(--ease),color .2s var(--ease),background-color .2s var(--ease)}.archive-toggle:hover{border-color:var(--accent);color:var(--ink);background:var(--cream)}.archive-toggle svg{flex:none}
.pool-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px;margin:16px 0}.pool-card{padding:14px;border:1px solid var(--line);border-radius:12px;min-width:0;overflow-wrap:anywhere}.pool-card h3{font-family:var(--font-s);margin-bottom:8px}.pool-card p{font-size:13px;line-height:1.8}.pool-card button{margin:8px 6px 0 0}.view-buttons [aria-pressed=true]{background:var(--yellow)}.recruitment-main{min-width:0}.hero{background:var(--cream);padding:36px 0;border-bottom:1px solid var(--line)}.hero::after{content:none}.hero h1{font-size:clamp(32px,5vw,56px);margin-top:14px}.recruitment-content{padding-bottom:24px}.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin:16px 0;min-width:0}.summary{display:grid;grid-template-columns:1fr;gap:20px}.summary span,.summary small{display:block}.summary strong{display:block;font-family:var(--font-d);font-size:36px;margin:4px 0}.summary small,.hint{font-size:13px;line-height:1.7;color:var(--ink-60)}h2{font-family:var(--font-s);font-size:22px;margin:0 0 12px}.section-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.section-heading h2{margin:0}label{min-width:0;overflow-wrap:anywhere;display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700;margin-bottom:12px}input,select{min-width:0;width:100%;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px;background:var(--cream);color:var(--ink);font:inherit}button{min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px 14px;color:var(--ink);background:var(--surface);font:inherit;cursor:pointer}.primary{background:var(--tea);color:var(--cream)}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.actions{display:flex;flex-wrap:wrap;gap:10px}.current-progress strong{font-family:var(--font-d);font-size:26px}details{margin-top:18px}summary{cursor:pointer;min-height:44px;font-weight:800;line-height:1.7;padding:10px 0}details section{border-top:1px solid var(--line);padding-top:20px;margin-top:16px}.filters,.compact-form,.mapping-row{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;align-items:end}.filters label,.compact-form label,.mapping-row label{margin:0}.filters button{justify-self:start}.compact-form .hint{margin:0}.compact-form{margin:12px 0}.event-list{padding:0;list-style:none}.event-row{display:flex;flex-direction:column;gap:12px;padding:16px 0;border-bottom:1px solid var(--line);min-width:0}.event-identity{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px}.event-main{min-width:0;overflow-wrap:anywhere}.event-main strong{margin-right:14px}.span-number{font-family:var(--font-d);color:var(--accent-strong);font-weight:800}.event-main small{display:block;color:var(--ink-60);font-size:12px;line-height:1.8;margin-top:4px}.event-note{white-space:pre-wrap;font-size:13px}.event-actions{display:flex;flex-wrap:wrap;gap:8px}.danger,.error{color:var(--rouge)}.feedback p{line-height:1.7}.undo,.batch-row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin:14px 0}.undo{background:var(--cream);padding:12px;border-radius:12px}.load-more{display:block;margin:18px auto}.empty{padding:20px 0;color:var(--ink-60)}.mapping-row{padding:12px 0;min-width:0;overflow-wrap:anywhere}.mapping-row small{grid-column:1/-1}@media(min-width:768px){.summary{grid-template-columns:2fr 1fr}.filters{grid-template-columns:repeat(2,minmax(0,1fr))}.event-row{flex-direction:row;justify-content:space-between;align-items:center}.event-actions{flex:none}.compact-form{grid-template-columns:minmax(0,1fr) auto}.compact-form .hint{grid-column:1/-1}.compact-form label:has(select){grid-column:1/-1}.mapping-row{grid-template-columns:minmax(0,1fr) auto}.card{padding:22px}}
</style>
