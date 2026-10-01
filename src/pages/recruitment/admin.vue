<template>
  <div class="page-recruitment-admin">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero"><div class="wrap"><AdminBackLink /><div class="crumb"><span class="pill fill">内容维护</span><span class="pill">公共招募目录</span></div><h1>招募卡池管理</h1><p class="hero-sub">管理卡池和每池 N 个 UP 名额。占位密探对应到图鉴后，已有记录继续使用同一身份。</p></div></header>
      <div class="wrap catalog-content">
        <p v-if="!permitted" class="card" role="alert">需要招募卡池管理权限。</p>
        <template v-else>
          <p v-if="error" ref="errorSummary" class="card error" role="alert" tabindex="-1">{{ error }}</p>
          <p v-if="notice" role="status">{{ notice }}</p>
          <p v-if="loading" role="status">正在读取公共卡池和密探图鉴…</p>
          <div class="toolbar"><label>游戏<select v-model="filterGame"><option value="">全部</option><option>代号鸢</option><option>如鸢</option></select></label><label>搜索卡池<input v-model.trim="search" type="search" placeholder="名称或 ID"></label><button type="button" :disabled="loading || saving" @click="load">刷新目录</button><button class="primary" type="button" :disabled="loading || saving" @click="openNew">新建卡池</button></div>
          <div class="catalog-layout">
            <section aria-labelledby="catalog-list-title"><h2 id="catalog-list-title">公共卡池（{{ filteredPools.length }}）</h2><p v-if="!loading && !filteredPools.length" class="card">没有符合条件的卡池。</p><article v-for="pool in filteredPools" :key="pool.pool_id" class="card pool-row"><div><h3>{{ pool.name }}</h3><p>{{ pool.game }} · {{ pool.enabled ? '已启用' : '已停用' }} · UP {{ pool.up_agents.filter(slot => slot.active).length }} 名</p><small>{{ pool.start_date || '开始日期未知' }} — {{ pool.end_date || '结束日期未知' }}</small></div><button type="button" :disabled="saving" @click="openEdit(pool)">编辑卡池</button></article></section>
            <section v-if="form" ref="editor" class="card editor" aria-labelledby="catalog-editor-title" tabindex="-1">
              <h2 id="catalog-editor-title">{{ isNew ? '新建卡池' : '编辑卡池' }}</h2>
              <form @submit.prevent="save">
                <div class="fields"><label>游戏<select v-model="form.game" :disabled="!isNew || saving" @change="resetNewSlots"><option>代号鸢</option><option>如鸢</option></select></label><label>卡池名称<input v-model.trim="form.name" required maxlength="128" :disabled="saving"></label><label>卡池类型<input v-model.trim="form.pool_type" maxlength="64" placeholder="如：限时 / 常驻" :disabled="saving"></label><label>开始日期<input v-model="form.start_date" type="date" :disabled="saving"></label><label>结束日期<input v-model="form.end_date" type="date" :min="form.start_date" :disabled="saving"></label></div>
                <label class="check"><input v-model="form.enabled" type="checkbox" :disabled="saving">启用，允许用户添加档案与新增记录</label>
                <p class="hint">停用仍保留已有历史。减少 UP 数量只退役末尾名额；新增加的名额使用新身份。修改真实映射会同步改变该槽历史的展示，抽数、进度与顺序保持。</p>
                <div class="count-control"><label>UP 数量 N<input v-model="desiredCount" type="number" inputmode="numeric" min="0" max="120" required :disabled="saving"></label><button type="button" :disabled="saving" @click="applyCount">调整 UP 数量</button></div>
                <fieldset v-for="(slot, index) in form.up_agents" :key="slot.id"><legend>UP 名额 {{ index + 1 }}{{ slot.active ? '' : '（已退役）' }}</legend><label>显示名称<input v-model.trim="slot.name" maxlength="128" required :disabled="saving"></label><label>对应图鉴绝密<select v-model="slot.operator_id" :disabled="saving || operatorError" @change="selectOperator(slot)"><option value="">占位，尚未进入图鉴</option><option v-for="operator in eligibleOperators" :key="operator.id" :value="operator.id">{{ operator.name }}</option><option v-if="slot.operator_id && !eligibleOperators.some(operator => operator.id === slot.operator_id)" :value="slot.operator_id">{{ slot.name }}（当前图鉴不可用）</option></select></label><div class="slot-preview"><OperatorAvatar :avatar="operatorById(slot.operator_id)?.avatar || ''" :name="operatorById(slot.operator_id)?.name || slot.name" :rarity="5" /><small>{{ slot.operator_id ? '已对应图鉴，沿用已有记录身份' : '占位密探，可先记录再对应图鉴' }}</small></div></fieldset>
                <p v-if="operatorError" class="error">{{ operatorError }}。可保存占位密探，刷新后再对应图鉴。</p>
                <div class="actions"><button type="button" :disabled="saving" @click="form = null">取消编辑</button><button class="primary" type="submit" :disabled="saving || loading">{{ saving ? '保存中…' : '保存卡池' }}</button></div>
              </form>
            </section>
          </div>
        </template>
      </div>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import AdminBackLink from '../../components/admin/AdminBackLink.vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import { getOperatorCatalog } from '../../api/operator.js'
import { createAdminRecruitmentPool, listAdminRecruitmentCatalog, updateAdminRecruitmentPool } from '../../api/recruitment.js'
import { operatorCatalogEntries } from './rules.js'

const router = useRouter(), pools = ref([]), operators = ref([]), loading = ref(false), saving = ref(false), error = ref(''), operatorError = ref(''), notice = ref(''), filterGame = ref(''), search = ref(''), form = ref(null), isNew = ref(false), desiredCount = ref(0), editor = ref(null), errorSummary = ref(null)
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permitted = computed(() => !!identity.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.RECRUITMENT_CATALOG_WRITE))
const filteredPools = computed(() => pools.value.filter(pool => (!filterGame.value || pool.game === filterGame.value) && [pool.name, pool.pool_id].some(value => value.toLowerCase().includes(search.value.toLowerCase()))))
const eligibleOperators = computed(() => operators.value.filter(operator => operator.rarity === 5 && operator.games?.includes(form.value?.game)))
const operatorById = id => operators.value.find(operator => operator.id === id)
let generation = 0, alive = true
const current = token => alive && permitted.value && token.generation === generation && token.identity === identity.value
const capture = () => ({ generation, identity: identity.value })

async function showError(message) { error.value = message; await nextTick(); errorSummary.value?.focus() }
async function load() {
  if (!permitted.value) return
  const token = capture(), read = ++generation
  token.generation = read; loading.value = true; error.value = ''; operatorError.value = ''
  try {
    const [catalog, operatorResult] = await Promise.all([listAdminRecruitmentCatalog(), getOperatorCatalog().then(operatorCatalogEntries).catch(err => ({ error: err.message }))])
    if (!current(token)) return
    if (!Array.isArray(catalog?.pools)) throw new Error('公共卡池目录响应无效')
    pools.value = catalog.pools; operators.value = Array.isArray(operatorResult) ? operatorResult : []; operatorError.value = operatorResult.error || ''
  } catch (err) {
    if (!current(token)) return
    if (err.status === 403) { form.value = null; pools.value = []; await router.replace({ path: '/forbidden', query: { from: '/recruitment/admin' } }); return }
    await showError(err.message || '目录读取失败，请重试')
  } finally { if (current(token)) loading.value = false }
}
async function focusEditor() { await nextTick(); editor.value?.focus() }
function openNew() {
  if (!permitted.value) return
  isNew.value = true; desiredCount.value = 0; form.value = { pool_id: 'pool_' + crypto.randomUUID(), game: filterGame.value || '代号鸢', name: '', pool_type: '', start_date: '', end_date: '', enabled: true, revision: 0, up_agents: [] }; error.value = ''; notice.value = ''; focusEditor()
}
function openEdit(pool) {
  if (!permitted.value) return
  isNew.value = false; form.value = { ...pool, start_date: pool.start_date || '', end_date: pool.end_date || '', up_agents: pool.up_agents.map(slot => ({ ...slot, operator_id: slot.operator_id || '' })) }; desiredCount.value = form.value.up_agents.filter(slot => slot.active).length; error.value = ''; notice.value = ''; focusEditor()
}
function resetNewSlots() { if (isNew.value && form.value.up_agents.length) { form.value.up_agents = []; desiredCount.value = 0 } }
function applyCount() {
  if (!permitted.value || saving.value || !form.value) return
  const count = Number(desiredCount.value)
  if (!form.value.pool_id || !/^[A-Za-z0-9._:-]{1,80}$/.test(form.value.pool_id)) return showError('卡池身份无效，请重新打开新建表单')
  if (desiredCount.value === '' || !Number.isInteger(count) || count < 0 || count > 120) return showError('UP 数量须为 0–120 的整数')
  const active = form.value.up_agents.filter(slot => slot.active)
  if (count < active.length) active.slice(count).forEach(slot => { slot.active = false })
  for (let index = active.length; index < count; index++) form.value.up_agents.push({ id: form.value.pool_id + ':up:' + crypto.randomUUID(), name: 'UP 占位 ' + (index + 1), operator_id: '', active: true })
  error.value = ''
}
function selectOperator(slot) { if (slot.operator_id) slot.name = operatorById(slot.operator_id)?.name || slot.name }
async function save() {
  if (!permitted.value || saving.value || !form.value) return
  const token = capture()
  try {
    if (Number(desiredCount.value) !== form.value.up_agents.filter(slot => slot.active).length) throw new Error('请先点击“调整 UP 数量”应用 N')
    if (form.value.start_date && form.value.end_date && form.value.end_date < form.value.start_date) throw new Error('结束日期不能早于开始日期')
    const activeIds = form.value.up_agents.filter(slot => slot.active).map(slot => slot.operator_id).filter(Boolean)
    if (new Set(activeIds).size !== activeIds.length) throw new Error('同池启用的 UP 名额不能重复对应同一密探')
    const body = { pool_id: form.value.pool_id, game: form.value.game, name: form.value.name, pool_type: form.value.pool_type || null, start_date: form.value.start_date || null, end_date: form.value.end_date || null, enabled: form.value.enabled, expected_revision: form.value.revision, up_agents: form.value.up_agents.map(slot => ({ id: slot.id, name: slot.name, operator_id: slot.operator_id || null, active: slot.active })) }
    saving.value = true; error.value = ''; notice.value = ''
    const result = isNew.value ? await createAdminRecruitmentPool(body) : await updateAdminRecruitmentPool(body.pool_id, body)
    if (!current(token)) return
    pools.value = [result, ...pools.value.filter(pool => pool.pool_id !== result.pool_id)]; form.value = null; notice.value = '卡池已保存，已有记录沿用固定身份'
  } catch (err) {
    if (!current(token)) return
    await showError(err.status === 409 ? '目录已被其他管理员更新。草稿保留，请刷新目录并重新编辑后保存。' : err.message || '保存失败，草稿已保留')
  } finally { if (current(token)) saving.value = false }
}
watch([identity, permitted], () => { generation++; pools.value = []; operators.value = []; form.value = null; loading.value = false; saving.value = false; error.value = ''; notice.value = ''; if (permitted.value) load() }, { immediate: true, flush: 'sync' })
onScopeDispose(() => { alive = false; generation++ })
</script>

<style scoped>
main{min-width:0}.hero{background:var(--cream);padding:36px 0;border-bottom:1px solid var(--line)}.hero::after{content:none}.hero h1{font-size:clamp(32px,5vw,56px);margin-top:14px}.catalog-content{padding-top:20px;padding-bottom:30px}.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin:14px 0;min-width:0;overflow-wrap:anywhere}h2,h3{font-family:var(--font-s);margin:0 0 12px}h2{font-size:24px}h3{font-size:20px}.toolbar,.fields{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}.toolbar{align-items:end;margin:16px 0 24px}.catalog-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:24px}.catalog-layout>section{min-width:0}.pool-row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px}.pool-row p{font-size:14px;line-height:1.7}.pool-row small{display:block;font-size:12px;line-height:1.8;color:var(--ink-60)}.pool-id{overflow-wrap:anywhere}label{min-width:0;display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700;margin-bottom:10px}input:not([type=checkbox]),select{width:100%;min-width:0;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px;color:var(--ink);background:var(--cream);font:inherit}button{min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px 14px;background:var(--surface);color:var(--ink);font:inherit;cursor:pointer}.primary{background:var(--tea);color:var(--cream)}button:disabled{opacity:.5;cursor:not-allowed}.error{color:var(--rouge)}.hint,label small{font-size:13px;font-weight:400;line-height:1.7;color:var(--ink-60)}.check{flex-direction:row;align-items:center;min-height:44px}.count-control{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:20px 0}.count-control label{flex:1;min-width:100px;margin:0}.count-control button{flex:1}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}fieldset{border:1px solid var(--line);border-radius:12px;padding:12px;margin:14px 0;min-width:0}legend{font-weight:700}.slot-preview{display:flex;align-items:center;gap:12px}.slot-preview small{min-width:0;overflow-wrap:anywhere;color:var(--ink-60)}button:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(min-width:768px){.toolbar{grid-template-columns:minmax(0,1fr) minmax(0,2fr) auto auto}.fields{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1024px){.catalog-layout{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)}.editor{margin-top:0}}
</style>
