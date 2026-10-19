<template>
  <div class="bonds-page">
    <IslandSidebar />
    <main id="main-content" class="bonds-main">
      <CompactToolHeader title="羁绊图鉴" description="查找派遣组合，记录不同天气下的羁绊。">
        <template #account><DataAccountContextBar compact :accounts="state.accounts" :account-id="accountId" :game="game" :is-logged-in="!!identity" :loading="state.accountsLoading" :error="state.accountsError" :switch-disabled="state.busy" switch-disabled-reason="正在保存或处理文件，请等待完成。" /></template>
        <template #actions><button type="button" :disabled="state.loading || state.busy" @click="refresh">刷新</button></template>
      </CompactToolHeader>
      <div class="wrap bond-workspace">
        <div v-if="!available" class="bond-toolbar"><label>浏览游戏<select v-model="publicGame" :disabled="state.busy"><option>代号鸢</option><option>如鸢</option></select></label><p>公开图鉴可浏览；登录并选择游戏账号后才能记录。</p><button v-if="state.accountsError" type="button" @click="loadAccounts">重读账号</button></div>
        <section class="bond-summary" aria-label="账号羁绊进度">
          <div><span>本站累计已记录</span><strong>{{ available && summary ? summary.triggered_count : '—' }}</strong><small>含有效历史记录，正负效果均计数</small></div>
          <div><span>当前图鉴</span><strong>{{ state.catalog ? (available && summary ? summary.active_triggered_count + ' / ' : '') + activeTotal : '—' }}</strong><small>下架与误录条目不计入当前分母</small></div>
          <div><span>下一档羁缘</span><strong>{{ summary ? nextThreshold == null ? '全部达标' : nextThreshold + ' 种' : '—' }}</strong><small>达标后仍需在成就页确认完成</small></div>
        </section>
        <p v-if="state.notice" role="status">{{ state.notice }}</p>
        <p v-if="state.error" class="bond-error" role="alert">{{ state.error }} <button type="button" :disabled="state.busy || state.loading" @click="refresh">重新读取</button></p>
        <nav class="bond-tabs" aria-label="羁绊功能"><button v-for="(label, value) in tabs" :key="value" type="button" :disabled="state.busy" :aria-pressed="view === value" @click="view = value">{{ label }}</button></nav>
        <BondExchange v-show="view === 'exchange'" :identity="identity" :account-id="accountId" :account-name="account?.name || ''" :game="game" :revision="state.archive?.revision" :catalog-version="state.catalog?.catalog_version" :generation="state.generation" :accounts="state.accounts" :can-use="!state.busy && available && !!state.archive && !!state.catalog && !state.loading && !state.error && !state.catalogError" @busy="state.busy = $event" @target="activeAccount.set($event)" @committed="acceptImport" />
        <section v-if="view !== 'exchange'" aria-label="羁绊查找与图鉴">
          <form class="bond-toolbar" @submit.prevent>
            <label>成员搜索<input v-model="filters.query" type="search" placeholder="密探名称或拼音"></label>
            <label>派遣行动<select v-model="filters.action"><option value="">全部行动</option><option v-for="(label, value) in ACTIONS" :key="value" :value="value">{{ label }}</option></select></label>
            <label>天气<select v-model="filters.weather"><option v-if="view === 'codex'" value="">全部天气</option><option v-for="(label, value) in WEATHERS" :key="value" :value="value">{{ label }}</option></select></label>
            <label>效果<select v-model="filters.effect"><option value="">全部效果</option><option value="positive">一拍即合</option><option value="negative">貌合神离</option></select></label>
            <label>资料范围<select v-model="filters.status"><option value="active">当前图鉴</option><option value="">含历史资料</option><option value="retired">历史下架</option><option value="invalid">误录</option></select></label>
            <label><input v-model="filters.hideRecorded" type="checkbox" :disabled="!state.archive">隐藏已记录</label>
            <label><input v-model="filters.onlyOwned" type="checkbox" :disabled="!state.owned">仅已有密探</label>
          </form>
          <p v-if="state.ownedError" role="status">{{ state.ownedError }}</p><p v-else-if="available && !state.owned && !state.loading">密探拥有资料未填写，默认显示全部组合。可在「我的密探」维护。</p>
          <p v-if="state.operatorError" class="bond-error" role="alert">{{ state.operatorError }} 暂以密探ID展示；请刷新重试。</p>
          <p v-if="state.loading" role="status">正在读取目录与账号记录…</p>
          <p v-else-if="state.catalogError" class="bond-error" role="alert">{{ state.catalogError }} <button type="button" @click="refresh">重试目录读取</button></p>
          <p v-else-if="!state.catalog?.entries.length">当前游戏尚无已发布羁绊资料。目录收录后会在这里显示；这不代表你的游戏进度为零。</p>
          <template v-else>
            <p>{{ filtered.length }} 个天气条目 · {{ groups.length }} 组配对。筛选不改变累计数量。</p>
            <div v-if="selected.length" class="bond-toolbar" role="group" aria-label="批量记录"><strong>明确选中 {{ selected.length }} 条（最多50条）</strong><button type="button" :disabled="!writable" @click="saveSelected(true)">记录选中项</button><button type="button" :disabled="!writable" @click="saveSelected(false)">取消选中项记录</button><button type="button" :disabled="state.busy" @click="selected = []">清除选择</button></div>
            <p v-if="!filtered.length">没有匹配的组合。请调整行动、天气、成员或隐藏条件。</p>
            <div class="bond-groups">
              <details v-for="group in pageGroups" :key="group.key" class="bond-group" :open="view === 'today'">
                <summary><span class="bond-members"><span v-for="id in group.members" :key="id"><OperatorAvatar :avatar="operatorFor(id).avatar || ''" :name="operatorFor(id).name || id" :rarity="operatorFor(id).rarity" /><span>{{ operatorFor(id).name || id }}</span></span></span><strong>{{ ACTIONS[group.action] }}</strong><small>{{ group.entries.length }} 种天气 · 展开记录</small></summary>
                <div class="bond-weather-grid"><div v-for="entry in group.entries" :key="entry.bond_id" class="bond-weather-cell">
                  <span>{{ WEATHERS[entry.weather] }}</span><small>{{ entry.effect === 'positive' ? '一拍即合' : '貌合神离' }}<template v-if="entry.status !== 'active'"> · {{ STATUS[entry.status] }}</template></small>
                  <button type="button" :aria-pressed="recorded(entry.bond_id)" :disabled="!writable || entry.status !== 'active' && !recorded(entry.bond_id)" :aria-label="group.members.map(id => operatorFor(id).name || id).join('、') + '，' + ACTIONS[entry.action] + '，' + WEATHERS[entry.weather] + (recorded(entry.bond_id) ? '，已记录，点击取消' : '，未记录，点击记录')" @click="save([{ bond_id: entry.bond_id, triggered: !recorded(entry.bond_id) }])">{{ state.busy ? '处理中' : available && !state.archive ? '记录未读取' : recorded(entry.bond_id) ? '已记录 · 取消' : '记录触发' }}</button>
                  <label><input type="checkbox" :checked="selected.includes(entry.bond_id)" :disabled="!writable || !selected.includes(entry.bond_id) && selected.length >= 50" @change="select(entry.bond_id)">选择此天气</label>
                </div></div>
              </details>
            </div>
            <nav v-if="groups.length > 20" class="bond-toolbar" aria-label="图鉴分页"><button type="button" :disabled="page === 0" @click="page--">上一页</button><span>第 {{ page + 1 }} / {{ Math.ceil(groups.length / 20) }} 页</span><button type="button" :disabled="(page + 1) * 20 >= groups.length" @click="page++">下一页</button></nav>
          </template>
        </section>
        <section class="bond-achievements" aria-label="关联成就"><h2>羁缘成就</h2><p>1、3、10、20、50、100、200 种。自动进度按成员组合＋行动＋天气计算，完成状态由你确认。取消记录不会撤销已确认成就，也不会自动发放库存奖励。</p><router-link v-if="achievementEnabled" :to="{ path: '/achievement', query: { linked_metric: 'yuan_bond_variants' } }">查看关联成就与确认状态</router-link><p v-else>成就页面当前未开放；羁绊仍独立保存和计数。</p></section>
        <details v-if="state.catalog" class="bond-catalog-info"><summary>目录与记录说明</summary><p>{{ state.catalog.catalog_version }}</p><p>记录时间是本站更新时间，不代表游戏首次触发。历史下架仍计累计种数，误录不计数。备份包含完整账号记录，不受筛选影响。</p></details>
      </div><SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import CompactToolHeader from '../../components/CompactToolHeader.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { activeAccount } from '../../store/activeAccount.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import BondExchange from './BondExchange.vue'
import { useBonds } from './useBonds.js'
import { ACTIONS, STATUS, THRESHOLDS, WEATHERS } from './rules.js'
const { state, identity, accountId, account, available, game, publicGame, writable, filters, filtered, groups, pageGroups, selected, page, summary, recorded, refresh, loadAccounts, save, select } = useBonds()
const view = ref('today'), tabs = { today: '今日查找', codex: '完整图鉴', exchange: '备份迁移' }
filters.weather = 'sunny'
watch(view, value => { if (value === 'today' && !filters.weather) filters.weather = 'sunny'; if (value === 'codex') filters.weather = ''; selected.value = [] })
const activeTotal = computed(() => state.catalog?.entries.filter(e => e.status === 'active').length || 0)
const nextThreshold = computed(() => summary.value ? THRESHOLDS.find(t => t > summary.value.triggered_count) : null)
const achievementEnabled = isFeatureEnabled(FEATURE_KEYS.ACHIEVEMENT_ARCHIVE)
const operatorFor = id => state.operators.find(op => op.id === id) || { id }
function saveSelected(triggered) { return save(selected.value.map(bond_id => ({ bond_id, triggered }))) }
function acceptImport(result) { if (result.account_id === accountId.value && result.game === game.value) { state.archive = result; state.busy = false; state.notice = '导入已保存到当前账号。' } }
</script>

<style src="./bondsShared.css"></style>
<style src="./bondsDesktop.css"></style>
<style src="./bondsMobile.css"></style>
