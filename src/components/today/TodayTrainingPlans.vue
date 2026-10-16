<template>
  <section v-if="!hideEmpty || !snapshot || loading || error || plans.length || otherNotes.length" class="today-training" aria-labelledby="today-training-title" :aria-busy="loading">
    <header class="training-heading">
      <div class="training-heading-copy">
        <h2 id="today-training-title"><UsersRound :size="19" aria-hidden="true" /> 我的养成计划</h2>
        <p v-if="snapshot && plans.length" class="training-hint">{{ plans.length }} 个清单 · {{ planMemberCount }} 条培养目标</p>
        <p v-else class="training-hint">当前账号的培养清单与密探备注</p>
      </div>
      <router-link class="training-manage" :to="{ path: '/operator', query: { tab: 'current' } }">管理养成<ArrowRight :size="14" aria-hidden="true" /></router-link>
    </header>
    <p v-if="!identity || !accountId">登录并选择游戏账号后，可查看养成计划。</p>
    <template v-else>
      <p v-if="loading && !snapshot" role="status">正在读取养成计划…</p>
      <div v-if="error" class="training-error" role="alert">
        <p>{{ error }}</p>
        <p v-if="snapshot" class="training-hint">下方保留上次读取内容。</p>
        <button v-if="!denied" type="button" :disabled="loading" @click="load">重试读取</button>
      </div>
      <template v-if="snapshot">
        <p v-if="!plans.length && !otherNotes.length">还没有培养成员或备注，可去密探养成设置计划。</p>
        <article v-for="plan in plans.slice(0, 1)" :key="plan.id" class="training-plan" :class="{ 'is-current': plan.id === snapshot.workspace.activePlanId }">
          <header class="training-plan-heading">
            <h3>{{ plan.name }}</h3>
            <span class="training-count">{{ plan.members.length }}人</span>
            <span v-if="plan.id === snapshot.workspace.activePlanId" class="training-current">当前清单</span>
          </header>
          <ul class="training-list">
            <li v-for="member in plan.members.slice(0, 5)" :key="member.id">
              <router-link class="training-member" :to="operatorTo(member.id)">
                <OperatorAvatar :avatar="member.avatar" :name="member.name" :rarity="member.rarity" aria-hidden="true" />
                <span class="training-member-name">{{ member.name }}</span>
              </router-link>
            </li>
          </ul>
          <p v-if="plan.members.length > 5" class="training-hint">另有 {{ plan.members.length - 5 }} 名密探</p>
        </article>
        <div v-if="plans.length > 1 || otherNotes.length" class="training-extra">
          <p v-if="plans.length > 1" class="training-hint">另有 {{ plans.length - 1 }} 个清单，可在养成页查看。</p>
          <p v-if="otherNotes.length" class="training-hint">{{ otherNotes.length }} 名清单外密探有备注，可在养成页查看。</p>
        </div>
        <p v-if="notePreview" class="training-note">{{ notePreview }}</p>
      </template>
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowRight, UsersRound } from '@lucide/vue'
import OperatorAvatar from '../operator/OperatorAvatar.vue'
import { auth } from '../../store/auth.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'
import { getTrainingWorkspace } from '../../api/operatorPlanner.js'
import { getOperatorCatalog, getOperatorAnnotations, getOperatorGrowthTargets } from '../../api/operator.js'
import { listAgentFavorites } from '../../api/inventory.js'
import { workspaceFromRemote } from '../../data/operatorPlannerRemote.js'
import { trainingPlanMemberIds } from '../../data/operatorTrainingPlans.js'
import { AGENT_CATALOG } from '../../data/inventory/catalog.js'
import { operatorHuajiLabel } from '../../utils/operatorHuaji.js'

const props = defineProps({ accountId: { type: String, default: '' }, game: { type: String, default: '' }, hideEmpty: Boolean })
const identity = computed(() => auth.isLoggedIn ? auth.userInfo?.id || '' : '')
const key = computed(() => JSON.stringify([identity.value, props.accountId, props.game]))
const catalog = new Map(AGENT_CATALOG.map(entry => [entry.id, entry]))
const snapshot = ref(null), loading = ref(false), error = ref(''), denied = ref(false)
let generation = 0, refreshTimer = null, unsubscribe = null
const operatorTo = id => ({ path: '/operator', query: { tab: 'current', focus: id } })
function member(id, target) {
  const entry = snapshot.value.catalog.get(id) || { id, name: id }
  const labels = []
  if (target?.level != null) labels.push('等级 ' + target.level)
  if (target?.elite != null) labels.push('修为 ' + target.elite)
  if (target?.huaji || target?.starLevel != null || target?.star_level != null) labels.push(operatorHuajiLabel({ ...entry, ...target }))
  return { id, name: entry.name, avatar: typeof entry.avatar === 'string' ? entry.avatar : '', rarity: Number(entry.rarity) || 3,
    note: snapshot.value.notes[id] || '', target: labels.length ? labels.join(' · ') : '未保存专属目标，详见养成页' }
}
const plans = computed(() => (snapshot.value?.workspace.plans || []).map(plan => ({ ...plan,
  members: [...trainingPlanMemberIds(plan, snapshot.value.favorites)].map(id => member(id, plan.source === 'favorites' ? snapshot.value.targets[id] : plan.targets[id]))
})).filter(plan => plan.members.length)
  .sort((a, b) => Number(b.id === snapshot.value.workspace.activePlanId) - Number(a.id === snapshot.value.workspace.activePlanId)))
const planMemberCount = computed(() => plans.value.reduce((total, plan) => total + plan.members.length, 0))
const otherNotes = computed(() => {
  const planned = new Set(plans.value.flatMap(plan => plan.members.map(item => item.id)))
  return Object.keys(snapshot.value?.notes || {}).filter(id => !planned.has(id) && snapshot.value.notes[id].trim()).map(id => member(id))
})
const notePreview = computed(() => {
  const note = Object.values(snapshot.value?.notes || {}).find(value => value.trim())?.trim() || ''
  return note.length > 80 ? note.slice(0, 80) + '…' : note
})
function itemsFrom(data, account) {
  if (data?.account_id !== account || !Array.isArray(data.items)
    || data.items.some(item => !item || typeof item.operator_id !== 'string' || !item.operator_id
      || item.account_id != null && item.account_id !== account)) throw new Error('养成数据的账号或格式不匹配，请重试。')
  return data.items
}
async function load() {
  if (!identity.value || !props.accountId || denied.value) return
  const token = ++generation, account = props.accountId
  loading.value = true; error.value = ''
  try {
    const [workspace, annotations, favorites, targets, operatorCatalog] = await Promise.all([
      getTrainingWorkspace(account), getOperatorAnnotations(account), listAgentFavorites(account), getOperatorGrowthTargets(account),
      getOperatorCatalog().catch(() => null)
    ])
    if (token !== generation) return
    const notes = itemsFrom(annotations, account)
    if (!Array.isArray(workspace?.plans) || notes.some(item => item.note != null && typeof item.note !== 'string')
      || favorites?.account_id !== account || !Array.isArray(favorites.agent_ids)
      || favorites.agent_ids.some(id => typeof id !== 'string' || !id)) throw new Error('养成数据读取结果不完整，请重试。')
    const resolvedCatalog = new Map(catalog)
    for (const entry of Array.isArray(operatorCatalog?.operators) ? operatorCatalog.operators : []) {
      if (typeof entry?.id === 'string' && typeof entry.name === 'string' && entry.name.trim()) {
        resolvedCatalog.set(entry.id, { ...catalog.get(entry.id), ...entry, name: entry.name.trim() })
      }
    }
    snapshot.value = { catalog: resolvedCatalog, workspace: workspaceFromRemote(workspace, account), favorites: new Set(favorites.agent_ids),
      notes: Object.fromEntries(notes.map(item => [item.operator_id, item.note || ''])),
      targets: Object.fromEntries(itemsFrom(targets, account).map(item => [item.operator_id, item])) }
  } catch (err) {
    if (token !== generation) return
    if ([401, 403].includes(err?.status) || err?.status === 404 && err?.code === 'account_not_found') {
      snapshot.value = null; denied.value = true
      error.value = '身份、权限或账号已失效，请重新登录或选择账号。'
    } else error.value = err?.message || '养成计划暂时无法读取，请重试。'
  } finally { if (token === generation) loading.value = false }
}
watch(key, () => {
  const token = ++generation
  clearTimeout(refreshTimer); refreshTimer = null
  snapshot.value = null; loading.value = false; error.value = ''; denied.value = false
  nextTick(() => { if (token === generation) void load() })
}, { immediate: true, flush: 'sync' })
function refresh() {
  if (document.visibilityState === 'hidden' || refreshTimer != null) return
  refreshTimer = setTimeout(() => { refreshTimer = null; void load() }, 180)
}
function onAccountEvent(message) {
  const account = message?.data?.account_id || message?.data?.accountId
  if (account && account !== props.accountId) return
  if (['operator_training_workspace', 'operator_growth_target', 'operator_annotation', 'operator_favorites', 'account_stream_open'].includes(message?.event)) refresh()
}
onMounted(() => {
  document.addEventListener('visibilitychange', refresh); window.addEventListener('pageshow', refresh)
  unsubscribe = subscribeAccountEvents(onAccountEvent)
})
onBeforeUnmount(() => {
  generation++; clearTimeout(refreshTimer); unsubscribe?.()
  document.removeEventListener('visibilitychange', refresh); window.removeEventListener('pageshow', refresh)
})
</script>

<style scoped>
.today-training { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
h2 { color: var(--tea); font: 800 20px/1.5 var(--font-s); }
h3 { color: var(--tea); font: 700 15px/1.5 var(--font-b); }
p { line-height: 1.7; }
.training-hint { color: var(--ink-60); font-weight: 400; }
.training-plan { border-top: 1px solid var(--line); }
.training-current { border: 1px solid #a8c6b3; background: #e5eee5; color: #365b43; font-weight: 600; }
.training-count, .training-target, .training-chevron { color: var(--ink-60); font-weight: 400; }
.training-target { font-family: var(--font-d); font-variant-numeric: tabular-nums; }
.training-list { list-style: none; }
a, button { color: var(--tea); font-weight: 700; }
.training-manage, .training-member { text-decoration: none; }
.training-manage { font-weight: 500; }
.training-member:focus-visible { background: var(--cream); }
.training-note { border-left: 2px solid var(--line); background: var(--cream); color: var(--ink-60); }
@media (hover: hover) {
  .training-manage:hover { text-decoration: underline; text-underline-offset: 3px; }
  .training-member:hover { background: var(--cream); }
}
.training-error { color: var(--rouge); }
button { border: 1px solid var(--line); background: var(--cream); cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
</style>
<style scoped src="./todayTrainingDesktop.css"></style>
<style scoped src="./todayTrainingMobile.css"></style>
