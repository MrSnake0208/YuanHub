<template>
  <div class="ledger-admin">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap">
        <router-link class="page-header-back" to="/manage">← 返回管理工作台</router-link>
        <h1 class="page-header-title">广陵账房管理</h1>
        <p class="page-header-description">维护公共数据。保存后，用户刷新账房即可读取；私人方案仍使用原快照。</p>
      </div></header>
      <div class="wrap ledger-content">
        <p v-if="!permitted" role="alert" class="ledger-panel">需要广陵账房公共数据维护权限。</p>
        <template v-else>
          <nav class="ledger-actions ledger-nav" aria-label="账房管理工作区">
            <button v-for="item in workspaces" :key="item.key" type="button" :aria-pressed="workspace === item.key" :disabled="saving" @click="switchWorkspace(item.key)">{{ item.label }}</button>
            <router-link to="/cart" target="_blank" rel="noopener">打开公开账房预览 ↗</router-link>
          </nav>
          <div v-if="error" ref="errorSummary" class="ledger-panel ledger-error" role="alert" tabindex="-1">
            <p>{{ error }}</p>
            <ul v-if="Object.keys(fieldErrors).length"><li v-for="(message, key) in fieldErrors" :key="key"><a :href="'#ledger-' + key" @click.prevent="focusField(key)">{{ message }}</a></li></ul>
          </div>
          <p v-if="notice" class="ledger-panel" role="status">{{ notice }}</p>
          <p v-if="loading" role="status">正在读取公共数据…</p>
          <template v-if="!form">
            <div class="ledger-workspace-head">
              <h2>{{ workspaces.find(w => w.key === workspace).label }}</h2>
              <div class="ledger-actions"><button type="button" :disabled="loading" @click="load">刷新</button><button v-if="workspace !== 'settings'" class="ledger-primary" type="button" :disabled="loading || !data" @click="open()">{{ workspace === 'packages' ? '新增礼包' : '新增活动' }}</button></div>
            </div>
            <template v-if="workspace !== 'settings'">
              <div class="ledger-panel ledger-filters">
                <label>搜索<input v-model.trim="filters.search" type="search" placeholder="名称 / ID" aria-label="搜索名称或ID"></label>
                <details><summary>筛选条件</summary><div class="ledger-fields">
                  <label>游戏<select v-model="filters.game"><option value="">全部游戏</option><option value="daihao">代号鸢 · USD</option><option value="ru">如鸢 · CNY</option></select></label>
                  <label>状态<select v-model="filters.status"><option value="">全部状态</option><template v-if="workspace === 'packages'"><option value="enabled">已启用</option><option value="disabled">已停用</option></template><template v-else><option value="draft">草稿</option><option value="published">已发布</option><option value="disabled">已停用</option></template></select></label>
                  <label v-if="workspace === 'packages'">分类<select v-model="filters.category"><option value="">全部分类</option><option v-for="category in categories" :key="category">{{ category }}</option></select></label>
                </div></details>
              </div>
              <p v-if="!loading && !entries.length && data" class="ledger-panel">没有符合条件的数据。</p>
              <div class="ledger-list">
                <article v-for="entry in entries" :key="entry.id" class="ledger-panel ledger-row">
                  <div><span class="ledger-badge">{{ gameLabel(entry.game) }}</span><h3>{{ entry.name }}</h3><p class="ledger-hint">ID {{ entry.content_id ?? entry.id }} · {{ workspace === 'packages' ? (entry.enabled ? '已启用' : '已停用') : statusLabels[entry.status] }}</p></div>
                  <div v-if="workspace === 'packages'"><p>{{ entry.game === 'daihao' ? '$' + entry.price_usd : '¥' + entry.price_cny }} · {{ entry.draws }} 抽 · {{ entry.points }} 分</p><p class="ledger-hint">{{ entry.category }} · 限购 {{ entry.limit }} · 排序 {{ entry.sort_id }}</p></div>
                  <div v-else><p>{{ entry.tiers.length }} 个档位 · {{ progress(entry).label }}</p><p class="ledger-hint">{{ formatLedgerTime(entry.starts_at, entry.time_zone) }} — {{ formatLedgerTime(entry.ends_at, entry.time_zone) }} · {{ entry.time_zone }}</p></div>
                  <button type="button" :disabled="loading" @click="open(entry)">{{ workspace === 'packages' ? '编辑礼包' : '编辑活动' }}</button>
                </article>
              </div>
            </template>
            <section v-else-if="data" class="ledger-panel"><p>公共 USD→CNY 默认参考汇率：<b>{{ data.settings.exchange_rate }}</b></p><p class="ledger-hint">仅用于用户尚未修改汇率的新预算。如鸢直接按人民币计价；已保存方案的汇率保持原值。</p><button type="button" @click="open(data.settings)">修改默认汇率</button></section>
          </template>
          <section v-else ref="editor" tabindex="-1" aria-labelledby="ledger-editor-title">
            <div class="ledger-workspace-head"><button type="button" :disabled="saving" @click="close">返回列表</button><span>{{ dirty ? '有未保存修改' : '尚未修改' }}</span></div>
            <h2 id="ledger-editor-title">{{ form.id ? '编辑' : '新增' }}{{ workspaces.find(w => w.key === workspace).label }}</h2>
            <form class="ledger-panel" novalidate @submit.prevent="save">
              <fieldset :disabled="saving">
                <legend>编辑信息</legend>
                <div v-if="workspace !== 'settings'" class="ledger-fields">
                  <label>游戏 / 币种<select id="ledger-game" v-model="form.game" :disabled="!!form.id"><option value="daihao">代号鸢 · USD</option><option value="ru">如鸢 · CNY</option></select></label>
                  <label>名称<input id="ledger-name" v-model="form.name" maxlength="120" :aria-invalid="!!fieldErrors.name" :aria-describedby="fieldErrors.name ? 'ledger-error-name' : undefined"><small v-if="fieldErrors.name" id="ledger-error-name">{{ fieldErrors.name }}</small></label>
                </div>
                <div v-if="workspace === 'packages'" class="ledger-fields">
                  <label v-for="field in packageFields" :key="field.key">{{ field.label === 'price' ? '价格（' + (form.game === 'daihao' ? 'USD' : 'CNY') + '）' : field.label }}<input :id="'ledger-' + field.key" v-model="form[field.key]" :type="field.type" :step="field.step" :min="field.min" :max="field.max" :maxlength="field.maxlength" :aria-invalid="!!fieldErrors[field.key]" :aria-describedby="fieldErrors[field.key] ? 'ledger-error-' + field.key : undefined"><small v-if="fieldErrors[field.key]" :id="'ledger-error-' + field.key">{{ fieldErrors[field.key] }}</small></label>
                  <label class="ledger-check"><input v-model="form.enabled" type="checkbox">启用（保存后立即作为公共商品显示）</label>
                </div>
                <template v-if="workspace === 'campaigns'">
                  <p class="ledger-hint">时间必须含时区偏移，例如 2026-10-11T12:00:00+08:00。按下面的 IANA 时区展示。新活动必须填写开始和结束；不延长历史活动。</p>
                  <p v-if="form.source_note" class="ledger-hint">{{ form.source_note }}</p>
                  <div class="ledger-fields">
                    <label v-for="field in campaignFields" :key="field.key">{{ field.label }}<input :id="'ledger-' + field.key" v-model="form[field.key]" :placeholder="field.placeholder" :aria-invalid="!!fieldErrors[field.key]" :aria-describedby="fieldErrors[field.key] ? 'ledger-error-' + field.key : undefined"><small v-if="fieldErrors[field.key]" :id="'ledger-error-' + field.key">{{ fieldErrors[field.key] }}</small></label>
                    <label>状态<select id="ledger-status" v-model="form.status"><option value="draft">草稿</option><option value="published">发布</option><option value="disabled">停用</option></select></label>
                  </div>
                  <h3>奖励档位</h3>
                  <small v-if="fieldErrors.tiers" id="ledger-tiers" role="alert" tabindex="-1">{{ fieldErrors.tiers }}</small>
                  <article v-for="(tier, index) in form.tiers" :key="index" class="ledger-tier">
                    <div class="ledger-fields">
                      <label>第 {{ index + 1 }} 档 · 积分门槛<input v-model.number="tier.points" type="number" min="1" max="10000000" step="1" :aria-label="'第' + (index + 1) + '档积分门槛'"></label>
                      <label>顺序<input v-model.number="tier.sort_id" type="number" min="0" max="1000000" step="1" :aria-label="'第' + (index + 1) + '档顺序'"></label>
                      <label class="ledger-check"><input v-model="tier.enabled" type="checkbox" :aria-label="'启用第' + (index + 1) + '档'">启用档位（取消以停用）</label>
                    </div>
                    <div v-for="(reward, ri) in tier.rewards" :key="ri" class="ledger-fields ledger-reward">
                      <label>奖励名称<input v-model="reward.name" maxlength="120" :aria-label="'第' + (index + 1) + '档奖励' + (ri + 1) + '名称'"></label>
                      <label>数量<input v-model.number="reward.count" type="number" min="1" max="10000000" step="1" :aria-label="'第' + (index + 1) + '档奖励' + (ri + 1) + '数量'"></label>
                      <button type="button" :aria-label="'移除第' + (index + 1) + '档奖励' + (ri + 1)" @click="tier.rewards.splice(ri, 1)">移除奖励</button>
                    </div>
                    <button type="button" @click="tier.rewards.push({ name: '', count: 1 })">添加奖励</button>
                    <button v-if="!form.id" type="button" @click="form.tiers.splice(index, 1)">移除未保存档位</button>
                  </article>
                  <button type="button" @click="form.tiers.push(newTier(form.tiers.length))">添加档位</button>
                </template>
                <label v-if="workspace === 'settings'">USD→CNY 默认参考汇率<input id="ledger-exchange_rate" v-model="form.exchange_rate" type="number" min="0.0001" max="10000" step="any" :aria-invalid="!!fieldErrors.exchange_rate" :aria-describedby="fieldErrors.exchange_rate ? 'ledger-error-exchange_rate' : undefined"><small v-if="fieldErrors.exchange_rate" id="ledger-error-exchange_rate">{{ fieldErrors.exchange_rate }}</small></label>
              </fieldset>
              <section class="ledger-preview" aria-label="发布数据预览">
                <h3>公开数据预览</h3>
                <template v-if="workspace === 'packages'"><p>{{ gameLabel(form.game) }} · {{ form.name || '未命名礼包' }} · {{ form.game === 'daihao' ? 'USD' : 'CNY' }} {{ form.price }} · {{ form.draws }} 抽 · {{ form.points }} 分</p><p>{{ form.enabled ? '保存后立即公开' : '已停用，不再作为新商品展示' }} · {{ form.extra }}</p></template>
                <template v-else-if="workspace === 'campaigns'"><p>{{ gameLabel(form.game) }} · {{ form.name }} · {{ progress(form).label }}</p><p>{{ formatLedgerTime(form.starts_at, form.time_zone) }} — {{ formatLedgerTime(form.ends_at, form.time_zone) }} · {{ form.time_zone }}</p><p v-for="(tier, i) in form.tiers" :key="i">{{ tier.enabled ? '' : '已停用 · ' }}{{ tier.points }} 分：{{ tier.rewards.map(r => r.name + ' ×' + r.count).join('、') }}</p><p class="ledger-hint">未开始、结束、停用活动仅供预算或历史参考，不表示当前可领取。</p></template>
                <p v-else>新预算默认：1 USD = {{ form.exchange_rate }} CNY；用户自选和历史汇率优先。</p>
              </section>
              <div class="ledger-actions"><button class="ledger-primary" type="submit" :disabled="saving || conflict">{{ saving ? '保存中…' : '确认预览并保存' }}</button><button type="button" :disabled="saving" @click="close">取消编辑</button><button v-if="conflict" type="button" @click="refreshConflict">放弃修改并刷新</button></div>
            </form>
          </section>
        </template>
      </div>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '@/utils/authPermissions.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
import { dialog } from '@/utils/dialog.js'
import { ledgerCampaignProgress, formatLedgerTime } from '@/utils/ledgerCatalog.js'
import { getAdminLedgerCatalog, saveLedgerPackage, saveLedgerCampaign, saveLedgerSettings, previewLedgerCampaign } from '@/api/ledgerCatalog.js'
import '@/styles/page-header.css'

const workspaces = [{ key: 'packages', label: '礼包目录' }, { key: 'campaigns', label: '累充活动' }, { key: 'settings', label: '默认设置' }]
const statusLabels = { draft: '草稿', published: '已发布', disabled: '已停用' }
const gameLabel = game => game === 'daihao' ? '代号鸢 · USD' : '如鸢 · CNY'
const identity = computed(() => String(auth.userInfo?.id || ''))
const permitted = computed(() => !!auth.accessToken && !!identity.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.LEDGER_CATALOG_WRITE))
const workspace = ref('packages'), data = ref(null), form = ref(null), baseline = ref('')
const loading = ref(false), saving = ref(false), error = ref(''), notice = ref(''), fieldErrors = ref({}), conflict = ref(false)
const errorSummary = ref(null), editor = ref(null)
const filters = reactive({ game: '', category: '', status: '', search: '' })
const categories = computed(() => [...new Set((data.value?.packages || []).map(p => p.category))])
const entries = computed(() => (data.value?.[workspace.value] || []).filter(entry =>
  (!filters.game || entry.game === filters.game) && (!filters.search || `${entry.name} ${entry.content_id ?? entry.id}`.toLowerCase().includes(filters.search.toLowerCase())) &&
  (!filters.status || (workspace.value === 'packages' ? (entry.enabled ? 'enabled' : 'disabled') : entry.status) === filters.status) &&
  (workspace.value !== 'packages' || !filters.category || entry.category === filters.category)))
const dirty = computed(() => !!form.value && JSON.stringify(form.value) !== baseline.value)
const discard = useUnsavedChanges(dirty, '账房公共数据')
let generation = 0, alive = true
const current = token => alive && permitted.value && token === generation
const packageFields = [
  { key: 'price', label: 'price', type: 'number', step: 'any', min: 0, max: 10000000 },
  { key: 'points', label: '积分', type: 'number', step: 1, min: 0, max: 10000000 },
  { key: 'draws', label: '抽数（支持小数）', type: 'number', step: 'any', min: 0, max: 1000000 },
  { key: 'limit', label: '限购数量', type: 'number', step: 1, min: 1, max: 9999 },
  { key: 'category', label: '分类', type: 'text', maxlength: 40 },
  { key: 'sort_id', label: '排序（越小越靠前）', type: 'number', step: 1, min: 0, max: 1000000 },
  { key: 'extra', label: '补充说明', type: 'text', maxlength: 1000 },
]
const campaignFields = [{ key: 'starts_at', label: '开始时间（含偏移）', placeholder: '2026-10-11T12:00:00+08:00' }, { key: 'ends_at', label: '结束时间（含偏移）', placeholder: '2026-10-18T23:59:59+08:00' }, { key: 'time_zone', label: '展示时区（IANA）', placeholder: 'Asia/Shanghai' }]
const newTier = index => ({ points: 100, sort_id: index, enabled: true, rewards: [{ name: '', count: 1 }] })
function progress(entry) { return ledgerCampaignProgress([{ ...entry, tiers: entry.tiers || [] }], entry.game, 0, Date.now())[0] }
function focusField(key) { document.getElementById('ledger-' + key)?.focus() }
async function fail(message) { error.value = message; await nextTick(); errorSummary.value?.focus() }
async function load() {
  if (!permitted.value || loading.value) return
  const token = generation
  loading.value = true; error.value = ''
  try { const result = await getAdminLedgerCatalog(); if (current(token)) data.value = result }
  catch (err) { if (current(token)) await fail(err.message || '读取失败，请重试') }
  finally { if (current(token)) loading.value = false }
}
async function open(entry) {
  if (!permitted.value || loading.value || saving.value) return
  error.value = ''; notice.value = ''; fieldErrors.value = {}; conflict.value = false
  if (workspace.value === 'packages') form.value = entry ? { ...entry, price: entry.game === 'daihao' ? entry.price_usd : entry.price_cny } : { game: 'daihao', name: '', price: 0, points: 0, draws: 0, limit: 1, category: '', sort_id: 0, extra: '', enabled: true }
  else if (workspace.value === 'campaigns') form.value = entry ? JSON.parse(JSON.stringify(entry)) : { game: 'daihao', name: '', starts_at: '', ends_at: '', time_zone: 'Asia/Shanghai', status: 'draft', tiers: [newTier(0)] }
  else form.value = { ...entry }
  baseline.value = JSON.stringify(form.value)
  await nextTick(); editor.value?.focus()
}
async function close() {
  if (saving.value) return false
  const token = generation
  if (!await discard() || !current(token)) return false
  form.value = null; baseline.value = ''; error.value = ''; fieldErrors.value = {}; conflict.value = false
  return true
}
async function switchWorkspace(key) {
  if (saving.value || workspace.value === key) return
  if (form.value && !await close()) return
  workspace.value = key; filters.status = ''; filters.category = ''; notice.value = ''
}
async function refreshConflict() { if (await close()) await load() }
function payload() {
  const f = form.value, errors = {}
  const number = (key, min, max, integer = false) => {
    const value = f[key] === '' ? NaN : Number(f[key])
    const label = key === 'price' ? '价格' : packageFields.find(field => field.key === key)?.label || '默认汇率'
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) errors[key] = `${label}请输入${min}至${max}的${integer ? '整数' : '数值'}`
    return value
  }
  let body
  if (workspace.value !== 'settings' && (!f.name.trim() || f.name.length > 120)) errors.name = '名称必填且最多120字'
  if (workspace.value === 'packages') {
    body = { game: f.game, name: f.name, points: number('points', 0, 10000000, true), draws: number('draws', 0, 1000000), limit: number('limit', 1, 9999, true), category: f.category, sort_id: number('sort_id', 0, 1000000, true), extra: f.extra || '', enabled: f.enabled,
      price_usd: f.game === 'daihao' ? number('price', 0, 10000000) : null, price_cny: f.game === 'ru' ? number('price', 0, 10000000) : null }
    if (!f.category.trim() || f.category.length > 40) errors.category = '分类必填且最多40字'
  } else if (workspace.value === 'campaigns') {
    for (const key of ['starts_at', 'ends_at']) {
      if (key === 'starts_at' && f.source_note && !f[key]) continue
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(f[key]) || !Number.isFinite(Date.parse(f[key]))) errors[key] = '请填写带时区偏移的完整日期时间'
    }
    if (f.starts_at && Date.parse(f.starts_at) >= Date.parse(f.ends_at)) errors.ends_at = '结束时间必须晚于开始时间'
    try { new Intl.DateTimeFormat('zh-CN', { timeZone: f.time_zone }).format() } catch { errors.time_zone = '请输入有效IANA时区' }
    if (!f.tiers.length || f.tiers.length > 100 || new Set(f.tiers.map(t => t.points)).size !== f.tiers.length || f.tiers.some(t => !Number.isInteger(t.points) || t.points < 1 || t.points > 10000000 || !Number.isInteger(t.sort_id) || t.sort_id < 0 || t.sort_id > 1000000 || !t.rewards.length || t.rewards.length > 30 || t.rewards.some(r => !r.name.trim() || r.name.length > 120 || !Number.isInteger(r.count) || r.count < 1 || r.count > 10000000))) errors.tiers = '档位门槛须为不同正整数；奖励名称必填，数量须为正整数'
    body = { game: f.game, name: f.name, starts_at: f.starts_at || null, ends_at: f.ends_at, time_zone: f.time_zone, status: f.status, tiers: f.tiers }
  } else body = { exchange_rate: number('exchange_rate', 0.0001, 10000) }
  if (f.id) body.expected_version = f.version
  fieldErrors.value = errors
  return Object.keys(errors).length ? null : body
}
async function save() {
  if (!permitted.value || saving.value || conflict.value) return
  const body = payload()
  if (!body) return fail('请修正以下字段后重试；编辑内容已保留。')
  const token = generation, id = form.value.id, kind = workspace.value
  const original = JSON.parse(baseline.value)
  saving.value = true; error.value = ''
  try {
    if (kind === 'campaigns' && body.starts_at) await previewLedgerCampaign(body)
    if (!current(token)) return
    const needsConfirm = (kind === 'campaigns' && body.status === 'published') || (kind === 'campaigns' && body.status === 'disabled' && original.status !== 'disabled') || (kind === 'packages' && (!id || original.enabled !== body.enabled))
    if (needsConfirm && !await dialog.confirm({ title: '确认公共数据变更', message: kind === 'campaigns' ? `确认${statusLabels[body.status]}「${body.name}」？请核对游戏、时间、时区和预览档位。` : `确认${body.enabled ? '公开' : '停用'}「${body.name}」？用户刷新账房后生效。`, confirmText: '确认保存', type: body.status === 'disabled' || body.enabled === false ? 'danger' : 'info' })) return
    if (!current(token)) return
    if (kind === 'packages') await saveLedgerPackage(id, body)
    else if (kind === 'campaigns') await saveLedgerCampaign(id, body)
    else await saveLedgerSettings(body)
    if (!current(token)) return
    form.value = null; baseline.value = ''; notice.value = '已保存公共数据；用户刷新账房后生效，私人快照保留原值。'
    await load()
  } catch (err) {
    if (current(token)) { conflict.value = err.status === 409; await fail(err.message || '保存失败，编辑内容已保留') }
  } finally { if (current(token)) saving.value = false }
}
watch([identity, permitted], () => {
  generation++; data.value = null; form.value = null; baseline.value = ''; loading.value = false; saving.value = false; error.value = ''; notice.value = ''
  if (permitted.value) load()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { alive = false; generation++ })
</script>

<style scoped>
.ledger-content{padding-block:24px 48px;min-width:0}.ledger-panel{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin-block:12px;min-width:0;overflow-wrap:anywhere}.ledger-admin h2,.ledger-admin h3{font-family:var(--font-heading,'Noto Serif SC',serif);color:var(--ink)}.ledger-admin h3{margin-block:8px}.ledger-actions,.ledger-workspace-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.ledger-workspace-head{justify-content:space-between;margin-block:18px}.ledger-nav{background:var(--surface);padding:8px;border:1px solid var(--line);border-radius:12px}.ledger-nav [aria-pressed=true]{background:var(--yellow);box-shadow:inset 0 -2px var(--tea)}.ledger-admin button,.ledger-nav a,.ledger-admin summary{min-height:44px;padding:10px 14px;cursor:pointer;color:var(--ink);border:1px solid var(--line);border-radius:10px;background:var(--surface);font:inherit}.ledger-admin button:disabled{opacity:.55;cursor:default}.ledger-admin .ledger-primary{background:var(--tea);color:var(--cream)}.ledger-admin :focus-visible{outline:2px solid var(--tea);outline-offset:2px}.ledger-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin-block:14px}.ledger-admin label{display:flex;flex-direction:column;gap:6px;min-width:0}.ledger-admin input,.ledger-admin select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface);color:var(--ink);font:inherit}.ledger-admin small,.ledger-error{color:var(--rouge)}.ledger-admin [aria-invalid=true]{border-color:var(--rouge)}.ledger-hint{color:var(--ink-60);font-size:13px;line-height:1.7}.ledger-badge{display:inline-block;padding:4px 10px;border:1px solid var(--line);border-radius:20px;font-size:12px}.ledger-row{display:grid;gap:12px;align-items:center}.ledger-row p{margin-block:6px}.ledger-row>div{min-width:0}.ledger-admin fieldset{border:0;padding:0;margin:0;min-width:0}.ledger-admin .ledger-check{flex-direction:row;align-items:center;min-height:44px}.ledger-check input{width:20px;min-height:20px}.ledger-tier,.ledger-preview{padding:14px;border:1px solid var(--line);border-radius:12px;margin-block:16px;background:var(--cream)}.ledger-tier button{margin:4px}.ledger-admin a{color:var(--tea)}.ledger-preview p{overflow-wrap:anywhere}.ledger-admin ul{padding-left:20px}
@media(min-width:768px){.ledger-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.ledger-filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:16px}.ledger-row{grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) auto}.ledger-reward{grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;align-items:end}}
</style>
