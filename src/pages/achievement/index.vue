<template>
  <div class="achievement-page">
    <IslandSidebar />
    <main id="main-content" class="achievement-main">
      <CompactToolHeader title="成就档案" description="核对游戏成就，记下完成情况。">
        <template #account><DataAccountContextBar compact :accounts="state.accounts" :account-id="accountId" :game="game" :is-logged-in="!!identity" :loading="state.accountsLoading" :before-switch="beforeContextChange" :switch-disabled="state.busy" switch-disabled-reason="正在处理成就档案，请完成后再切换账号。" /></template>
        <template #actions>
          <details class="tool-more"><summary>更多</summary><div class="tool-more-content"><button class="act-btn" type="button" :disabled="state.busy || state.loading" @click="manualRefresh">刷新档案</button><button class="act-btn" type="button" :disabled="!available || !state.archive || state.busy || state.loading" @click="exchangeOpen = true">导入与导出</button></div></details>
        </template>
        <template #summary><div class="achievement-summary" aria-live="polite"><template v-if="!available || state.archive"><span>已完成 <b>{{ summary.completed }}</b> / 已收录 <b>{{ summary.total }}</b></span><span>待核对 {{ summary.pending }}</span><span>确认未完成 {{ summary.incomplete }}</span></template><span v-else>个人记录尚未读取 · 已收录 {{ summary.total }}</span></div></template>
        <template #help><p>“待核对”表示尚未确认游戏内状态。关注、备注、数值进度不会自动标记完成。这里只统计当前游戏已收录的有效目录。</p><p>保存后在其它设备进入页面或刷新读取，不提供实时同步。导出包含当前账号全部个人记录，包括已移出目录的历史记录。</p></template>
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
          <div aria-live="polite"><p v-if="state.loading || state.accountsLoading">正在读取成就档案…</p><p v-if="state.error" class="achievement-error" role="alert">{{ state.error }} <router-link v-if="identity && !state.accounts.length" to="/beta?redirect=/achievement">查看体验资格</router-link></p><p v-if="state.catalogError" class="achievement-error" role="alert">{{ state.catalogError }}</p><button v-if="state.error || state.catalogError" type="button" :disabled="state.busy || state.loading" @click="retry">重新读取</button><p v-if="state.notice" role="status">{{ state.notice }} <button v-if="state.undo" type="button" :disabled="!writable" @click="undo">撤销</button></p></div>
          <template v-if="state.catalog">
            <div class="achievement-category" role="group" aria-label="成就分类"><button type="button" :aria-pressed="!filters.category" @click="filters.category = ''">全部分类</button><button v-for="category in state.catalog.categories" :key="category.category_id" type="button" :aria-pressed="filters.category === category.category_id" @click="filters.category = category.category_id">{{ category.name }}</button></div>
            <div class="achievement-toolbar">
              <label class="achievement-search"><Search :size="16" aria-hidden="true" /><input v-model="filters.query" type="search" aria-label="搜索成就名称、别名、条件或关联密探" placeholder="搜索成就、条件或密探"></label>
              <label>状态<select v-model="filters.status" aria-label="成就状态筛选"><option value="">全部状态</option><option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option></select></label>
              <label class="achievement-check"><input v-model="filters.favorite" type="checkbox">仅看关注</label>
              <details class="achievement-more-filters"><summary>更多筛选{{ filters.hidden ? ' · 隐藏成就' : '' }}</summary><div><label class="achievement-check"><input v-model="filters.hidden" type="checkbox">仅隐藏成就</label><small>隐藏属性尚未核验的条目不纳入。</small></div></details>
              <button class="achievement-mobile-filters" type="button" aria-haspopup="dialog" @click="openMoreFilters">更多筛选{{ filters.hidden ? ' · 隐藏成就' : '' }}</button>
              <button type="button" @click="resetFilters">清除筛选</button>
              <button type="button" :disabled="!writable" :aria-pressed="batchMode" @click="batchMode = !batchMode; selected = []">{{ batchMode ? '退出批量' : '批量记录' }}</button>
            </div>
            <div v-if="batchMode" class="achievement-batch" aria-label="批量记录">
              <span>目标：{{ account?.name }} · 已选 {{ selected.length }} 条</span><button type="button" :disabled="!writable || !pageEntries.length" @click="selected = pageEntries.map(entry => entry.achievement_id)">选择本页（{{ pageEntries.length }} 条）</button><button type="button" :disabled="!selected.length || state.busy" @click="selected = []">取消选择</button><button v-for="(label, value) in STATUS_LABELS" :key="value" type="button" :disabled="!writable || !selected.length" @click="bulkSave(value)">标记{{ label }}</button>
            </div>
            <p class="achievement-results">当前筛选命中 {{ filtered.length }} 条 · 每页最多 {{ PAGE_SIZE }} 条</p>
            <ul v-if="pageEntries.length" ref="list" class="achievement-list" aria-label="成就列表" tabindex="-1">
              <li v-for="entry in pageEntries" :key="entry.achievement_id" class="achievement-row">
                <label v-if="batchMode" class="achievement-selection"><input type="checkbox" :checked="selected.includes(entry.achievement_id)" :disabled="!writable" :aria-label="'选择 ' + entry.name" @change="toggleSelection(entry.achievement_id)"></label>
                <div class="achievement-row-copy"><button type="button" class="achievement-title" @click="openDetail(entry)">{{ entry.name }}</button><p>{{ entry.condition }}</p><small>{{ available && !state.archive ? '个人记录尚未读取' : STATUS_LABELS[recordFor(entry.achievement_id).status] }}<span v-if="entry.is_hidden === true"> · 隐藏成就</span><span v-if="entry.reward"> · {{ entry.reward }}</span></small></div>
                <div class="achievement-row-actions"><label class="achievement-check"><input type="checkbox" :checked="recordFor(entry.achievement_id).status === 'completed'" :disabled="!writable" :aria-label="entry.name + ' 已完成'" @change="markCompleted(entry, $event)">完成</label><button type="button" :aria-pressed="recordFor(entry.achievement_id).favorite" :aria-label="(recordFor(entry.achievement_id).favorite ? '取消关注 ' : '关注 ') + entry.name" :disabled="!writable" @click="save([{ achievement_id: entry.achievement_id, favorite: !recordFor(entry.achievement_id).favorite }])"><Star :size="17" :fill="recordFor(entry.achievement_id).favorite ? 'currentColor' : 'none'" aria-hidden="true" /></button></div>
              </li>
            </ul>
            <div v-else class="achievement-empty"><p v-if="!entries.length">暂无可发布成就资料。资料核验后才会收录，当前不是完整游戏成就库。</p><template v-else><p>没有匹配的成就：{{ filterDescription }}。</p><button type="button" @click="resetFilters">清除条件并查看全部</button></template></div>
            <nav v-if="filtered.length > PAGE_SIZE" class="achievement-pagination" aria-label="成就分页"><button type="button" :disabled="page === 0" @click="page--">上一页</button><span>第 {{ page + 1 }} / {{ pageCount }} 页</span><button type="button" :disabled="page + 1 >= pageCount" @click="page++">下一页</button></nav>
            <details class="achievement-catalog-info"><summary>目录版本与资料范围</summary><p>{{ state.catalog.catalog_version }} · {{ state.catalog.data_status }} · {{ state.catalog.coverage }}</p><p>目录修订不会重置个人记录。未收录或已移出的记录仍包含在完整备份中。</p></details>
          </template>
        </template>
      </div>
      <SiteFooter />
    </main>
    <AchievementDetail ref="detailPanel" :entry="detail" :record="detail ? recordFor(detail.achievement_id) : null" :can-record="available && !!state.archive" :busy="state.busy" :loading="state.loading" :error="state.error" @close="closeDetail" @save="saveDetail" />
    <AchievementExchange ref="exchangePanel" :open="exchangeOpen" :account-id="accountId" :account-name="account?.name || ''" :identity="identity" :game="game" :revision="state.archive?.revision" :context-version="state.contextVersion" :can-record="available && !!state.archive && !state.loading" @close="exchangeOpen = false" @busy="state.busy = $event" @committed="acceptImport" />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Search, Star } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { dialog } from '../../utils/dialog.js'
import { useUnsavedChanges } from '../../utils/useUnsavedChanges.js'
import AchievementDetail from './AchievementDetail.vue'
import AchievementExchange from './AchievementExchange.vue'
import { useAchievement } from './useAchievement.js'
import { PAGE_SIZE, STATUS_LABELS } from './rules.js'

const enabled = isFeatureEnabled(FEATURE_KEYS.ACHIEVEMENT_ARCHIVE)
const model = enabled ? useAchievement() : null
// 路由会阻断关闭的入口；模板仍保留关闭状态，避免测试/直接挂载触发私有请求。
const { state, identity, accountId, account, game, publicGame, available, writable, entries, filters, page, batchMode, selected, filtered, pageEntries, summary, recordFor, capture, matches, refresh, loadAccounts, save, undo, toggleSelection, resetFilters } = model || {
  state: {}, summary: {}, filters: {}, entries: [], filtered: [], pageEntries: [], selected: [], recordFor() {}
}
const detail = ref(null), detailPanel = ref(null), exchangeOpen = ref(false), exchangePanel = ref(null), list = ref(null)
const pageCount = computed(() => Math.max(1, Math.ceil((filtered.value?.length || 0) / PAGE_SIZE)))
const filterDescription = computed(() => [filters.query?.trim() && '搜索“' + filters.query.trim() + '”', filters.category && state.catalog?.categories.find(item => item.category_id === filters.category)?.name, filters.status && STATUS_LABELS[filters.status], filters.favorite && '仅看关注', filters.hidden && '仅隐藏成就'].filter(Boolean).join('、') || '全部条件')
const dirty = computed(() => !!detailPanel.value?.hasDraft() || !!exchangePanel.value?.hasDraft())
const confirmDiscard = useUnsavedChanges(dirty, '成就档案草稿')
async function beforeContextChange() { return !state.busy && await confirmDiscard() }
async function openMoreFilters() {
  const version = state.contextVersion
  const choice = await dialog.choose({ title: '更多筛选', message: '当前：' + (filters.hidden ? '仅隐藏成就' : '所有成就') + '。隐藏属性尚未核验的条目不纳入隐藏筛选。', choices: [{ value: 'all', label: '所有成就' }, { value: 'hidden', label: '仅隐藏成就' }] })
  if (version === state.contextVersion && choice.value) filters.hidden = choice.value === 'hidden'
}
onBeforeRouteLeave(() => !state.busy)
watch(() => state.contextVersion, () => { detail.value = null; exchangeOpen.value = false }, { flush: 'sync' })
watch(() => filtered.value?.length, count => { if (model && page.value >= pageCount.value) page.value = pageCount.value - 1 })
function openDetail(entry) { if (state.busy) return; state.error = ''; detail.value = entry }
async function closeDetail() { detail.value = null; await nextTick(); if (document.activeElement === document.body) list.value?.focus({ preventScroll: true }) }
async function saveDetail(patch) { if (await save([patch])) await closeDetail() }
function acceptImport(archive) { state.archive = archive; state.undo = null; state.notice = '导入已保存到当前账号。' }
async function markCompleted(entry, event) {
  const checked = event.target.checked
  event.target.checked = recordFor(entry.achievement_id).status === 'completed'
  await save([{ achievement_id: entry.achievement_id, status: checked ? 'completed' : 'incomplete' }])
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
  detail.value = null; exchangeOpen.value = false
  await loadAccounts(); await refresh()
}
async function retry() { if (identity.value && !state.accounts.length) await loadAccounts(); await refresh() }
const reactivate = () => { if (document.visibilityState === 'visible' && !state.busy && !state.loading && !detail.value && !exchangeOpen.value) manualRefresh() }
onMounted(() => document.addEventListener('visibilitychange', reactivate))
onScopeDispose(() => document.removeEventListener('visibilitychange', reactivate))
</script>

<style src="./achievementShared.css"></style>
<style src="./achievementDesktop.css"></style>
<style src="./achievementMobile.css"></style>
