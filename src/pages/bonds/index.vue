<template>
  <div class="bonds-page bonds-codex">
    <IslandSidebar />
    <main v-if="canAccessArchive" id="main-content" class="bonds-main">
      <CompactToolHeader title="羁绊图鉴" description="作者：线线&amp;悠扬 · 独立创作">
        <template #account><DataAccountContextBar compact :accounts="state.accounts" :account-id="accountId" :game="game" :is-logged-in="!!identity" :loading="state.accountsLoading" :error="state.accountsError" :switch-disabled="state.busy" switch-disabled-reason="正在保存或处理文件，请等待完成。" /></template>
        <template #actions>
          <button type="button" class="bond-header-action" :aria-expanded="helpOpen" aria-controls="bond-help" @click="helpOpen = !helpOpen"><Info :size="15" aria-hidden="true" />图鉴说明</button>
          <button type="button" class="bond-header-action" :disabled="state.busy" :aria-expanded="settingsOpen" aria-controls="bond-settings" @click="settingsOpen = !settingsOpen"><Settings :size="15" aria-hidden="true" />设置</button>
        </template>
      </CompactToolHeader>
      <div class="wrap bond-workspace">
        <div v-if="!available" class="bond-toolbar bond-public"><label>浏览游戏<select v-model="publicGame" :disabled="state.busy"><option>代号鸢</option><option>如鸢</option></select></label><p>公开图鉴可浏览；登录并选择游戏账号后才能收录。</p><button v-if="state.accountsError" type="button" @click="loadAccounts">重读账号</button></div>
        <section class="bond-summary" aria-label="账号羁绊进度">
          <div class="bond-collection-stat">
            <span>图鉴收集进度</span>
            <strong data-testid="collection-progress">{{ collectionCount == null ? '—' : collectionCount }} / {{ state.catalog ? activeTotal : '—' }}</strong>
            <div class="bond-progress-line"><progress :value="collectionCount || 0" :max="activeTotal || 1" :aria-label="collectionCount == null ? '收集进度未读取' : '图鉴收集进度'" /><small>{{ collectionCount == null ? '—' : collectionPercent + '%' }}</small></div>
          </div>
          <div><span>下一档羁缘</span><strong data-testid="next-threshold">{{ !summary ? '—' : nextThreshold == null ? '全部达标' : '还差 ' + (nextThreshold - summary.triggered_count) + ' 种' }}</strong><small>达标后需在成就页确认完成</small></div>
          <div class="bond-owned-stat"><span>我的密探</span><strong data-testid="owned-progress">{{ ownedCount == null ? '—' : ownedCount }} / {{ state.operatorError || state.loading ? '—' : gameOperators.length }}</strong><small>基于当前账号的密探库统计</small></div>
        </section>
        <section v-if="helpOpen" id="bond-help" class="bond-secondary-panel" aria-label="图鉴说明">
          <h2>图鉴说明</h2><p>点击天气卡片即可收录，再点一次取消；相同条目在不同密探分组中共用记录，不会重复累计。批量选择可在「设置」中开启。</p>
          <p>本站累计已收录：{{ summary ? summary.triggered_count : '—' }} 种。历史下架仍计入羁缘累计，误录不计数；顶部图鉴进度与密探分组进度仅统计当前条目，不受筛选影响。记录时间为本站更新时间，不代表游戏首次触发。</p>
          <p>羁缘成就共 1、3、10、20、50、100、200 种七档。完成状态由你确认，取消收录不会撤销已确认成就，也不会自动发放库存奖励。</p>
          <router-link v-if="achievementEnabled" :to="{ path: '/achievement', query: { linked_metric: 'yuan_bond_variants' } }">查看关联成就与确认状态</router-link><p v-else>成就页面当前未开放；羁绊仍独立保存和计数。</p>
          <p v-if="state.catalog" class="bond-catalog-info">目录版本：{{ state.catalog.catalog_version }}。备份包含完整账号记录，不受筛选影响。</p>
          <p>独立创作 · 著作权归作者 线线&amp;悠扬 所有。</p>
        </section>
        <section v-show="settingsOpen" id="bond-settings" class="bond-secondary-panel" aria-label="羁绊设置">
          <div class="bond-settings-heading"><h2>设置与更多操作</h2><button type="button" :disabled="state.loading || state.busy" @click="refresh"><RefreshCw :size="14" aria-hidden="true" />刷新资料</button></div>
          <label class="bond-check"><input v-model="batchMode" type="checkbox" :disabled="state.busy">批量选择天气（最多 50 条）</label>
          <h3>备份迁移</h3>
          <BondExchange :identity="identity" :account-id="accountId" :account-name="account?.name || ''" :game="game" :revision="state.archive?.revision" :catalog-version="state.catalog?.catalog_version" :generation="state.generation" :accounts="state.accounts" :can-use="!state.busy && available && !!state.archive && !!state.catalog && !state.loading && !state.error && !state.catalogError" @busy="state.busy = $event" @target="activeAccount.set($event)" @committed="acceptImport" />
        </section>
        <p v-if="state.notice || state.busy" class="bond-feedback" role="status">{{ state.busy ? '正在保存或处理文件…' : state.notice }}</p>
        <p v-if="state.error" class="bond-error" role="alert">{{ state.error }} <button type="button" :disabled="state.busy || state.loading" @click="refresh">重新读取</button></p>
        <nav class="bond-tabs" aria-label="羁绊功能">
          <button type="button" :disabled="state.busy" :aria-pressed="view === 'codex'" @click="view = 'codex'"><BookOpen :size="18" aria-hidden="true" />图鉴收集</button>
          <button type="button" :disabled="state.busy" :aria-pressed="view === 'find'" @click="view = 'find'"><Search :size="18" aria-hidden="true" />查找配对</button>
        </nav>
        <section :aria-label="view === 'codex' ? '图鉴收集' : '查找配对'">
          <form class="bond-filters" @submit.prevent>
            <div class="bond-search-row">
              <label class="bond-search"><Search :size="18" aria-hidden="true" /><input v-model="filters.query" type="search" aria-label="搜索密探或配对" placeholder="搜索密探或配对，多个名称用空格分隔…"></label>
              <button type="button" :aria-expanded="filtersOpen" aria-controls="bond-advanced-filters" @click="filtersOpen = !filtersOpen">{{ filtersOpen ? '收起筛选' : '展开筛选' }}<ChevronDown :size="15" :class="{ 'is-flipped': filtersOpen }" aria-hidden="true" /></button>
            </div>
            <div v-if="view === 'find'" class="bond-today-row"><span>今日查找</span><span>选择行动与天气，快速查看当天可用的组合。</span><button type="button" :aria-pressed="!!filters.weather" @click="filters.weather = filters.weather ? '' : 'sunny'">{{ filters.weather ? '查看全部天气' : '按晴天查找' }}</button></div>
            <div class="bond-common-filters">
              <label>收录状态<select v-model="filters.recorded" :disabled="!state.archive"><option value="">全部</option><option value="missing">未收录</option><option value="collected">已收录</option></select></label>
              <label>行动<select v-model="filters.action"><option value="">全部行动</option><option v-for="(label, value) in ACTIONS" :key="value" :value="value">{{ label }}</option></select></label>
              <label>天气<select v-model="filters.weather"><option value="">全部天气</option><option v-for="(label, value) in WEATHERS" :key="value" :value="value">{{ label }}</option></select></label>
              <label>效果<select v-model="filters.effect"><option value="">全部效果</option><option value="positive">一拍即合</option><option value="negative">貌合神离</option></select></label>
              <label class="bond-check"><input v-model="filters.onlyOwned" type="checkbox" :disabled="!state.owned">仅显示我拥有的密探</label>
            </div>
            <div v-show="filtersOpen" id="bond-advanced-filters" class="bond-advanced-filters">
              <label>资料范围<select v-model="filters.status"><option value="active">当前图鉴</option><option value="">含历史资料</option><option value="retired">历史下架</option><option value="invalid">误录</option></select></label>
              <label class="bond-check"><input v-model="filters.hideRecorded" type="checkbox" :disabled="!state.archive">隐藏已收录</label>
            </div>
          </form>
          <p v-if="state.ownedError" class="bond-hint" role="status">{{ state.ownedError }}</p><p v-else-if="available && !state.owned && !state.loading" class="bond-hint">尚未填写密探拥有资料，默认显示全部组合。<router-link to="/operator">前往我的密探</router-link></p>
          <p v-if="state.operatorError" class="bond-error" role="alert">{{ state.operatorError }} 暂以密探ID展示；请刷新重试。</p>
          <p v-if="state.loading" class="bond-empty" role="status">正在读取目录与账号记录…</p>
          <p v-else-if="state.catalogError" class="bond-error" role="alert">{{ state.catalogError }} <button type="button" @click="refresh">重试目录读取</button></p>
          <p v-else-if="!state.catalog?.entries.length" class="bond-empty">当前游戏尚无已发布羁绊资料。目录收录后会在这里显示；这不代表你的游戏进度为零。</p>
          <template v-else>
            <div v-if="batchMode" class="bond-batch-toolbar" role="group" aria-label="批量收录"><span>已选择 {{ selected.length }} / 50 条</span><button type="button" :disabled="!writable || !selected.length || !selectedCanCollect" @click="saveSelected(true)">收录选中项</button><button type="button" :disabled="!writable || !selected.length" @click="saveSelected(false)">取消选中项收录</button><button type="button" :disabled="state.busy" @click="batchMode = false">退出批量</button></div>
            <p v-if="!filtered.length" class="bond-empty">没有匹配的组合。请调整搜索、收录状态、行动、天气或隐藏条件。</p>
            <div class="bond-groups">
              <details v-for="(group, index) in pageGroups" :key="group.id" class="bond-agent-group" :open="index === 0">
                <summary class="bond-agent-heading">
                  <ChevronRight class="bond-expand-icon" :size="16" aria-hidden="true" />
                  <OperatorAvatar :avatar="operatorFor(group.id).avatar || ''" :name="operatorName(group.id)" :rarity="operatorFor(group.id).rarity" />
                  <h2>{{ operatorName(group.id) }}</h2>
                  <div class="bond-agent-tags">
                    <span v-if="operatorFor(group.id).rarity" class="bond-tag bond-rarity">{{ isMovieOperator(operatorFor(group.id)) ? '电影' : OPERATOR_RARITY_LABELS[operatorFor(group.id).rarity] }}</span>
                    <span v-for="prof in tokens(operatorFor(group.id).prof)" :key="prof" class="bond-tag bond-element" :style="{ '--bond-element': elementAppearance(prof)?.color }">{{ prof }}</span>
                    <span v-for="prof in subProfList(operatorFor(group.id))" :key="prof" class="bond-tag">{{ prof }}</span>
                    <span v-if="state.owned?.get(group.id) === false" class="bond-tag">未拥有</span>
                  </div>
                  <div class="bond-agent-progress"><span>{{ collectionCount == null ? '—' : group.collected }} / {{ group.total }}</span><progress :value="collectionCount == null ? 0 : group.collected" :max="group.total || 1" :aria-label="operatorName(group.id) + '当前图鉴收集进度'" /></div>
                  <ChevronDown class="bond-fold-icon" :size="16" aria-hidden="true" />
                </summary>
                <div class="bond-agent-pairs">
                  <section v-for="pair in group.pairs" :key="pair.key" class="bond-pair" :aria-label="operatorName(group.id) + '与' + pair.members.map(operatorName).join('、')">
                    <div class="bond-pair-heading"><span>与</span><h3>{{ pair.members.map(operatorName).join('、') }}</h3><span class="bond-effect" :class="pair.effect">{{ pair.effect === 'positive' ? '一拍即合' : '貌合神离' }}</span></div>
                    <div class="bond-condition-grid">
                      <div v-for="entry in pair.entries" :key="entry.bond_id" class="bond-condition-wrap">
                        <button type="button" class="bond-condition" :class="{ 'is-saving': savingId === entry.bond_id && state.busy }" :aria-pressed="recorded(entry.bond_id)" :disabled="!writable || entry.status !== 'active' && !recorded(entry.bond_id)" :aria-label="entryLabel(entry)" @click="toggleEntry(entry)">
                          <component :is="weatherIcons[entry.weather]" class="bond-weather-icon" :class="'weather-' + entry.weather" :size="30" :stroke-width="1.5" aria-hidden="true" />
                          <span class="bond-condition-copy"><span>{{ WEATHERS[entry.weather] }}</span><small>{{ ACTIONS[entry.action] }}</small></span>
                          <span v-if="entry.status !== 'active'" class="bond-condition-history">{{ STATUS[entry.status] }}</span>
                          <span class="bond-condition-status"><Check v-if="recorded(entry.bond_id)" :size="12" aria-hidden="true" />{{ savingId === entry.bond_id && state.busy ? '保存中…' : available && !state.archive ? '记录未读取' : recorded(entry.bond_id) ? '已收录' : '未收录' }}</span>
                        </button>
                        <label v-if="batchMode" class="bond-batch-check"><input type="checkbox" :checked="selected.includes(entry.bond_id)" :disabled="!writable || !selected.includes(entry.bond_id) && selected.length >= 50" :aria-label="'批量选择' + entryLabel(entry)" @change="select(entry.bond_id)">选择此天气</label>
                      </div>
                    </div>
                  </section>
                </div>
              </details>
            </div>
            <nav v-if="operatorGroups.length > 20" class="bond-pagination" aria-label="图鉴分页"><button type="button" :disabled="state.busy || page === 0" @click="page--">上一页</button><span>第 {{ page + 1 }} / {{ Math.ceil(operatorGroups.length / 20) }} 页</span><button type="button" :disabled="state.busy || (page + 1) * 20 >= operatorGroups.length" @click="page++">下一页</button></nav>
            <p v-if="filtered.length" class="bond-results">{{ filtered.length }} 个天气条目 · {{ operatorGroups.length }} 位密探。相同配对共用收录，筛选不改变累计。</p>
          </template>
        </section>
      </div><SiteFooter />
    </main>
    <main v-else id="main-content" class="bonds-main"><p role="status">当前账号没有成就与羁绊访问权限。</p></main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BookOpen, Search, Info, Settings, ChevronDown, ChevronRight, RefreshCw, Check, Sun, CloudRain, CloudFog, Wind, CloudSnow, Snowflake, Tornado, CloudLightning } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { activeAccount } from '../../store/activeAccount.js'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { OPERATOR_RARITY_LABELS, subProfList, tokens } from '../../utils/operatorFilters.js'
import { isMovieOperator } from '../../utils/operatorForms.js'
import { elementAppearance } from '../../data/inventory/elementColors.js'
import BondExchange from './BondExchange.vue'
import { useBonds } from './useBonds.js'
import { ACTIONS, STATUS, THRESHOLDS, WEATHERS } from './rules.js'

const canAccessArchive = computed(() => !!auth.accessToken && !!auth.userInfo && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ARCHIVE_ACCESS))
const { state, identity, accountId, account, available, game, publicGame, writable, filters, filtered, operatorGroups, pageGroups, selected, page, summary, recorded, refresh, loadAccounts, save, select } = useBonds()
const view = ref('codex'), helpOpen = ref(false), settingsOpen = ref(false), filtersOpen = ref(false), batchMode = ref(false), savingId = ref('')
const weatherIcons = { sunny: Sun, rain: CloudRain, fog: CloudFog, wind: Wind, light_snow: CloudSnow, heavy_snow: Snowflake, hurricane: Tornado, thunder: CloudLightning }
watch(view, value => { filters.weather = value === 'find' ? 'sunny' : ''; selected.value = [] })
watch(batchMode, () => { selected.value = [] })
const activeTotal = computed(() => state.catalog?.entries.filter(e => e.status === 'active').length || 0)
const collectionCount = computed(() => available.value && summary.value ? summary.value.active_triggered_count : null)
const collectionPercent = computed(() => activeTotal.value ? Math.round(collectionCount.value * 100 / activeTotal.value) : 0)
const nextThreshold = computed(() => summary.value ? THRESHOLDS.find(t => t > summary.value.triggered_count) : null)
const gameOperators = computed(() => state.operators.filter(op => op.games?.includes(game.value)))
const ownedCount = computed(() => available.value && state.owned && !state.loading && !state.operatorError ? gameOperators.value.filter(op => state.owned.get(op.id) === true).length : null)
const operators = computed(() => new Map(state.operators.map(op => [op.id, op])))
const operatorFor = id => operators.value.get(id) || { id }
const operatorName = id => operatorFor(id).name || id
const selectedCanCollect = computed(() => selected.value.every(id => state.catalog?.entries.some(entry => entry.bond_id === id && entry.status === 'active')))
const achievementEnabled = isFeatureEnabled(FEATURE_KEYS.ACHIEVEMENT_ARCHIVE)
const entryLabel = entry => entry.members.map(operatorName).join('、') + '，' + WEATHERS[entry.weather] + '，' + ACTIONS[entry.action] + (recorded(entry.bond_id) ? '，已收录，点击取消' : '，未收录，点击收录')
async function toggleEntry(entry) {
  savingId.value = entry.bond_id
  await save([{ bond_id: entry.bond_id, triggered: !recorded(entry.bond_id) }])
  savingId.value = ''
}
function saveSelected(triggered) { return save(selected.value.map(bond_id => ({ bond_id, triggered }))) }
function acceptImport(result) { if (result.account_id === accountId.value && result.game === game.value) { state.archive = result; state.busy = false; state.notice = '导入已保存到当前账号。' } }
</script>

<style src="./bondsShared.css"></style>
<style src="./bondsDesktop.css"></style>
<style src="./bondsMobile.css"></style>
