<template>
  <div class="achievement-page">
    <IslandSidebar />
    <main id="main-content" class="achievement-main">
      <CompactToolHeader title="成就档案" description="核对游戏成就，记录完成情况。">
        <template #account><DataAccountContextBar compact :accounts="state.accounts" :account-id="accountId" :game="game" :is-logged-in="!!identity" :loading="state.accountsLoading" :before-switch="beforeContextChange" :switch-disabled="state.busy" switch-disabled-reason="正在处理成就档案，请完成后再切换账号。" /></template>
        <template #actions>
          <details class="tool-more"><summary>更多</summary><div class="tool-more-content"><button class="act-btn" type="button" :disabled="state.busy || state.loading" @click="manualRefresh">刷新档案</button><button class="act-btn" type="button" :disabled="!available || !state.archive || state.busy || state.loading" @click="openExchange">导入与导出</button></div></details>
        </template>
        <template #summary>
          <div class="achievement-summary" aria-live="polite">
            <div v-for="item in summaryItems" :key="item.key" class="achievement-stat" :class="'stat-' + item.key"><component :is="item.icon" :size="23" aria-hidden="true" /><span>{{ item.label }}<b>{{ item.key === 'total' || !available || state.archive ? summary[item.key] : '—' }}</b></span></div>
          </div>
        </template>
        <template #help><p>“未完成”表示尚未标记完成，包括历史待核对记录。关注、备注、数值进度不会自动标记完成。这里只统计当前游戏已收录的有效目录。</p><p>保存后在其它设备进入页面或刷新读取，不提供实时同步。导出包含当前账号全部个人记录，包括已移出目录的历史记录。</p></template>
      </CompactToolHeader>
      <div class="wrap achievement-workspace">
        <p v-if="!enabled" class="achievement-notice">成就档案暂未开放。</p>
        <template v-else>
          <div v-if="!available" class="achievement-guest">
            <label>浏览游戏<select v-model="publicGame" aria-label="浏览游戏"><option>代号鸢</option><option>如鸢</option></select></label>
            <p v-if="!identity">游客可以浏览目录。<router-link to="/login?redirect=/achievement">登录后记录</router-link></p>
            <p v-else-if="!state.accountsLoading && !state.accounts.length">请<router-link to="/user/profile#game-accounts">选择或创建已有游戏账号</router-link>；个人记录使用全站统一账号。</p>
          </div>
          <p v-if="state.catalog" class="achievement-coverage">{{ game }} · {{ state.catalog.coverage }}</p>
          <div class="achievement-feedback" aria-live="polite"><p v-if="dirtyEditors.length">有 {{ dirtyEditors.length }} 条未保存的行内修改。<button type="button" @click="revealDraft">返回编辑</button></p><p v-if="state.loading || state.accountsLoading">正在读取成就档案…</p><p v-if="state.error" class="achievement-error" role="alert">{{ state.error }} <router-link v-if="identity && !state.accounts.length" to="/beta?redirect=/achievement">查看体验资格</router-link></p><p v-if="state.catalogError" class="achievement-error" role="alert">{{ state.catalogError }}</p><button v-if="state.error || state.catalogError" type="button" :disabled="state.busy || state.loading" @click="retry">重新读取</button><p v-if="state.notice" class="achievement-save-notice" role="status">{{ state.notice }} <button v-if="state.undo" type="button" :disabled="!writable" @click="undo">撤销</button></p></div>
          <div class="achievement-content">
            <div class="achievement-list-column">
              <template v-if="state.catalog">
                <div class="achievement-toolbar">
                  <label class="achievement-search"><Search :size="16" aria-hidden="true" /><input v-model="filters.query" type="search" aria-label="搜索成就名称、条件或关联密探" placeholder="搜索成就、条件或关键词"></label>
                  <label class="achievement-reward-filter">奖励<input v-model="filters.reward" type="search" list="achievement-rewards" aria-label="成就奖励筛选" placeholder="全部奖励"><datalist id="achievement-rewards"><option v-for="reward in rewardOptions" :key="reward" :value="reward" /></datalist></label>
                  <label>状态<select v-model="filters.status" aria-label="成就状态筛选"><option value="">全部状态</option><option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option></select></label>
                  <label>游戏分类<select v-model="filters.category" aria-label="游戏分类筛选"><option value="">全部分类</option><option v-for="category in state.catalog.categories" :key="category.category_id" :value="category.category_id">{{ category.name }}</option></select></label>
                  <label class="achievement-check"><input v-model="filters.favorite" type="checkbox">仅看关注</label>
                  <details class="achievement-more-filters"><summary>更多筛选{{ filters.hidden ? ' · 隐藏成就' : '' }}</summary><div><label class="achievement-check"><input v-model="filters.hidden" type="checkbox">仅隐藏成就</label><small>隐藏属性尚未核验的条目不纳入。</small></div></details>
                  <button class="achievement-mobile-filters" type="button" aria-haspopup="dialog" @click="openMoreFilters">更多筛选{{ filters.hidden ? ' · 隐藏成就' : '' }}</button>
                  <button type="button" @click="resetFilters">清除筛选</button>
                  <button class="achievement-batch-toggle" type="button" :disabled="!writable" :aria-pressed="batchMode" @click="batchMode = !batchMode; selected = []">{{ batchMode ? '退出批量' : '批量记录' }}</button>
                </div>
                <div v-if="batchMode" class="achievement-batch" aria-label="批量记录">
                  <span>目标：{{ account?.name }} · 已选 {{ selected.length }} 条</span><button type="button" :disabled="!writable || !pageEntries.length" @click="selected = pageEntries.map(entry => entry.achievement_id)">选择本页（{{ pageEntries.length }} 条）</button><button type="button" :disabled="!selected.length || state.busy" @click="selected = []">取消选择</button><button v-for="(label, value) in STATUS_LABELS" :key="value" type="button" :disabled="!writable || !selected.length" @click="bulkSave(value)">标记{{ label }}</button>
                </div>
                <p class="achievement-results">当前筛选命中 {{ filtered.length }} 条 · 每页最多 {{ PAGE_SIZE }} 条</p>
                <div v-if="pageEntries.length" class="achievement-groups" tabindex="-1" aria-label="成就列表">
                  <section v-for="group in pageGroups" :key="group.category_id" class="achievement-group" :aria-label="group.name">
                    <header class="achievement-group-heading"><h2>{{ group.name }}</h2><span>{{ available && !state.archive ? '—' : group.completed }} / {{ group.total }}</span><span class="achievement-group-rule" aria-hidden="true" /></header>
                    <ul class="achievement-list">
                      <AchievementRow v-for="entry in group.entries" :key="entry.achievement_id" :entry="entry" :record="recordFor(entry.achievement_id)" :editor="editorFor(entry.achievement_id)" :writable="writable" :record-ready="!available || !!state.archive" :saving="state.savingIds.includes(entry.achievement_id)" :saved="state.savedIds.includes(entry.achievement_id)" :save-notice="state.notice" :error="state.failedIds.includes(entry.achievement_id) ? state.error : ''" :pending-removal="state.pendingRemoval.includes(entry.achievement_id)" :can-undo="!!state.undo" :batch-mode="batchMode" :selected="selected.includes(entry.achievement_id)" @select="toggleSelection(entry.achievement_id)" @quick-save="saveInline" @edit="openEditor(entry.achievement_id, $event)" @cancel="cancelEditor(entry.achievement_id, $event)" @save="saveEditor(entry, $event)" @undo="undo" />
                    </ul>
                  </section>
                </div>
                <div v-else class="achievement-empty"><p v-if="!entries.length">暂无可发布成就资料。资料核验后才会收录，当前不是完整游戏成就库。</p><template v-else><p>没有匹配的成就：{{ filterDescription }}。</p><button type="button" @click="resetFilters">清除条件并查看全部</button></template></div>
                <nav v-if="filtered.length > PAGE_SIZE" class="achievement-pagination" aria-label="成就分页"><button type="button" :disabled="page === 0" @click="page--">上一页</button><span>第 {{ page + 1 }} / {{ pageCount }} 页</span><button type="button" :disabled="page + 1 >= pageCount" @click="page++">下一页</button></nav>
                <details class="achievement-catalog-info"><summary>目录版本与资料范围</summary><p>{{ state.catalog.catalog_version }} · {{ state.catalog.data_status }} · {{ state.catalog.coverage }}</p><p>目录修订不会重置个人记录。未收录或已移出的记录仍包含在完整备份中。</p></details>
              </template>
            </div>

          </div>
        </template>
      </div>
      <SiteFooter />
    </main>

    <AchievementExchange ref="exchangePanel" :open="exchangeOpen" :account-id="accountId" :account-name="account?.name || ''" :identity="identity" :game="game" :revision="state.archive?.revision" :context-version="state.contextVersion" :can-record="available && !!state.archive && !state.loading" @close="exchangeOpen = false" @busy="state.busy = $event" @committed="acceptImport" />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onScopeDispose, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Award, Check, Clock, Search, Star } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { dialog } from '../../utils/dialog.js'
import { useUnsavedChanges } from '../../utils/useUnsavedChanges.js'
import AchievementRow from './AchievementRow.vue'
import AchievementExchange from './AchievementExchange.vue'
import { useAchievement } from './useAchievement.js'
import { PAGE_SIZE, progressValidationError, STATUS_LABELS, summarizeAchievements } from './rules.js'

const enabled = isFeatureEnabled(FEATURE_KEYS.ACHIEVEMENT_ARCHIVE)
const model = enabled ? useAchievement() : null
// 路由会阻断关闭的入口；模板仍保留关闭状态，避免测试/直接挂载触发私有请求。
const { state, identity, accountId, account, game, publicGame, available, writable, entries, filters, page, batchMode, selected, filtered, pageEntries, summary, recordFor, capture, matches, refresh, loadAccounts, save, undo, toggleSelection, resetFilters } = model || {
  state: {}, summary: {}, filters: {}, entries: [], filtered: [], pageEntries: [], selected: [], recordFor() {}
}
const summaryItems = [
  { key: 'total', label: '已收录成就', icon: Award },
  { key: 'completed', label: '已完成', icon: Check },
  { key: 'incomplete', label: '未完成', icon: Clock },
  { key: 'favorite', label: '我的关注', icon: Star }
]
const rewardOptions = computed(() => [...new Set((entries.value || []).map(entry => entry.reward?.trim()).filter(Boolean))])
const pageGroups = computed(() => (state.catalog?.categories || []).map(category => {
  const categoryEntries = entries.value.filter(entry => entry.category_id === category.category_id)
  return { ...category, ...summarizeAchievements(categoryEntries, categoryEntries.map(entry => recordFor(entry.achievement_id))), entries: pageEntries.value.filter(entry => entry.category_id === category.category_id) }
}).filter(group => group.entries.length))
const exchangeOpen = ref(false), exchangePanel = ref(null), editors = reactive({})
const pageCount = computed(() => Math.max(1, Math.ceil((filtered.value?.length || 0) / PAGE_SIZE)))
const filterDescription = computed(() => [filters.query?.trim() && '搜索“' + filters.query.trim() + '”', filters.category && state.catalog?.categories.find(item => item.category_id === filters.category)?.name, filters.reward?.trim() && '奖励“' + filters.reward.trim() + '”', filters.status && STATUS_LABELS[filters.status], filters.favorite && '仅看关注', filters.hidden && '仅隐藏成就'].filter(Boolean).join('、') || '全部条件')
const dirtyEditors = computed(() => Object.entries(editors).filter(([, editor]) => editor.progress !== editor.baseProgress || editor.note !== editor.baseNote || editor.completed_on !== editor.baseDate).map(([id]) => id))
const dirty = computed(() => !!dirtyEditors.value.length || !!exchangePanel.value?.hasDraft())
const confirmDiscard = useUnsavedChanges(dirty, '成就档案草稿')
async function beforeContextChange() {
  const token = capture()
  return !state.busy && await confirmDiscard() && matches(token) && !state.busy
}
async function openMoreFilters() {
  const version = state.contextVersion
  const choice = await dialog.choose({ title: '更多筛选', message: '当前：' + (filters.hidden ? '仅隐藏成就' : '所有成就') + '。隐藏属性尚未核验的条目不纳入隐藏筛选。', choices: [{ value: 'all', label: '所有成就' }, { value: 'hidden', label: '仅隐藏成就' }] })
  if (version === state.contextVersion && choice.value) filters.hidden = choice.value === 'hidden'
}
onBeforeRouteLeave(() => !state.busy)
watch(() => state.contextVersion, () => { for (const id of Object.keys(editors)) delete editors[id]; exchangeOpen.value = false }, { flush: 'sync' })
watch(() => filtered.value?.length, () => { if (model && page.value >= pageCount.value) page.value = pageCount.value - 1 })
function editorFor(id) {
  if (!editors[id]) {
    const record = recordFor(id)
    editors[id] = { progressOpen: false, noteOpen: false, progress: record.progress == null ? '' : String(record.progress), baseProgress: record.progress == null ? '' : String(record.progress), note: record.note || '', baseNote: record.note || '', completed_on: record.completed_on || '', baseDate: record.completed_on || '' }
  }
  return editors[id]
}
watch(() => state.archive, () => {
  for (const [id, editor] of Object.entries(editors)) {
    const record = recordFor(id)
    for (const [field, base, value] of [['progress', 'baseProgress', record.progress == null ? '' : String(record.progress)], ['note', 'baseNote', record.note || ''], ['completed_on', 'baseDate', record.completed_on || '']]) {
      if (editor[field] === editor[base]) editor[field] = editor[base] = value
    }
  }
})
function openEditor(id, field) {
  if (!writable.value) return
  const editor = editorFor(id)
  if (editor[field + 'Open']) return cancelEditor(id, field)
  editor[field + 'Open'] = true
}
async function cancelEditor(id, field) {
  const token = capture(), editor = editorFor(id)
  const changed = field === 'progress' ? editor.progress !== editor.baseProgress : editor.note !== editor.baseNote || editor.completed_on !== editor.baseDate
  if (state.busy || (changed && !await dialog.confirm({ title: '放弃未保存修改？', message: '当前行的' + (field === 'progress' ? '进度' : '备注') + '尚未保存。', confirmText: '放弃修改', cancelText: '继续编辑' })) || !matches(token) || state.busy) return
  const record = recordFor(id)
  if (field === 'progress') editor.progress = editor.baseProgress = record.progress == null ? '' : String(record.progress)
  else { editor.note = editor.baseNote = record.note || ''; editor.completed_on = editor.baseDate = record.completed_on || '' }
  editor[field + 'Open'] = false
}
async function saveEditor(entry, field) {
  if (!writable.value) return
  const id = entry.achievement_id, editor = editorFor(id), token = capture(), patch = { achievement_id: id }
  if (field === 'progress') {
    if (progressValidationError(entry, editor.progress) || editor.progress === editor.baseProgress) return
    patch.progress = editor.progress === '' ? null : Number(editor.progress)
  } else {
    if (editor.note.length > 500) return
    if (editor.note !== editor.baseNote) patch.note = editor.note
    if (recordFor(id).status === 'completed' && editor.completed_on !== editor.baseDate) patch.completed_on = editor.completed_on || null
  }
  if (Object.keys(patch).length === 1 || !await save([patch]) || !matches(token)) return
  const record = recordFor(id)
  if (field === 'progress') editor.progress = editor.baseProgress = record.progress == null ? '' : String(record.progress)
  else {
    editor.note = editor.baseNote = record.note || ''
    if ('completed_on' in patch || editor.completed_on === editor.baseDate) editor.completed_on = editor.baseDate = record.completed_on || ''
  }
  editor[field + 'Open'] = field === 'note' && editor.completed_on !== editor.baseDate
}
async function revealDraft() {
  const id = dirtyEditors.value[0]
  resetFilters()
  const index = filtered.value.findIndex(entry => entry.achievement_id === id)
  page.value = Math.max(0, Math.floor(index / PAGE_SIZE))
  await nextTick()
  document.getElementById('note-' + id)?.querySelector('textarea')?.focus()
  if (!editors[id]?.noteOpen) document.getElementById('progress-' + id)?.querySelector('input')?.focus()
}
async function openExchange() {
  if (!await beforeContextChange()) return
  for (const id of Object.keys(editors)) delete editors[id]
  exchangeOpen.value = true
}
function acceptImport(archive) { state.pendingRemoval = []; state.savedIds = []; state.archive = archive; state.undo = null; state.notice = '导入已保存到当前账号。' }
async function saveInline(patch) {
  if (!writable.value) return
  if ('status' in patch && recordFor(patch.achievement_id).status === patch.status) return
  await save([patch])
}
async function bulkSave(status) {
  if (!writable.value || !selected.value.length) return
  const token = capture(), ids = [...selected.value]
  const confirmation = await dialog.confirm({ title: '确认批量记录？', message: `目标：${account.value.name} · ${game.value}，将把明确选中的 ${ids.length} 条标记为“${STATUS_LABELS[status]}”。`, confirmText: '确认记录', cancelText: '取消' })
  if (!confirmation || !matches(token) || ids.some(id => !selected.value.includes(id) || !pageEntries.value.some(entry => entry.achievement_id === id))) return
  if (await save(ids.map(id => ({ achievement_id: id, status })))) selected.value = []
}
async function manualRefresh() {
  if (!await beforeContextChange()) return
  for (const id of Object.keys(editors)) delete editors[id]; exchangeOpen.value = false
  await loadAccounts(); await refresh()
}
async function retry() { if (identity.value && !state.accounts.length) await loadAccounts(); await refresh() }
const reactivate = () => { if (document.visibilityState === 'visible' && !state.busy && !state.loading && !dirty.value && !exchangeOpen.value) manualRefresh() }
onMounted(() => document.addEventListener('visibilitychange', reactivate))
onScopeDispose(() => document.removeEventListener('visibilitychange', reactivate))
</script>

<style src="./achievementShared.css"></style>
<style src="./achievementDesktop.css"></style>
<style src="./achievementMobile.css"></style>
