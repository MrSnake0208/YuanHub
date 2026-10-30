<template>
  <div class="bonds-page"><IslandSidebar /><main id="main-content" class="bonds-main"><header class="page-header"><div class="wrap"><router-link to="/manage">返回管理工作台</router-link><h1>羁绊目录管理</h1><p>按成员、行动和天气维护目录。先保存草稿，再核对发布预览；历史身份始终保留。</p></div></header>
    <div class="wrap bond-workspace">
      <p v-if="!permitted" role="alert">需要羁绊目录管理权限。</p>
      <template v-else>
        <div class="bond-toolbar"><button v-for="item in ['代号鸢', '如鸢']" :key="item" type="button" :aria-pressed="game === item" :disabled="busy" @click="switchGame(item)">{{ item }}</button><button type="button" :disabled="busy" @click="reload">重新读取</button><span v-if="busy" role="status">处理中…</span></div>
        <p v-if="error" ref="errorSummary" class="bond-error" role="alert" tabindex="-1">{{ error }}</p><p class="action-feedback" v-if="notice" role="status">{{ notice }}</p>
        <template v-if="data">
          <p>已发布 {{ data.published.entries.length }} 条 · 草稿 {{ draft.length }} 条 · 修订 {{ data.revision }}</p><p class="bond-admin-id">{{ data.published.catalog_version }}</p>
          <div class="bond-toolbar"><strong>{{ dirty ? '有未保存修改' : '草稿已同步' }}</strong><button type="button" :disabled="busy || !dirty" @click="save">保存草稿</button><button type="button" :disabled="busy || dirty" @click="previewPublication()">预览发布</button><button type="button" :disabled="busy" @click="download">导出本地草稿</button><button type="button" :disabled="busy || dirty" @click="discard">放弃服务器草稿</button></div>
          <form class="bond-admin-editor" @submit.prevent="addCombination">
            <h2>新增组合（按天气展开）</h2>
            <label>搜索密探<input v-model="memberQuery" type="search" :disabled="busy" placeholder="输入密探名称"></label>
            <div class="bond-toolbar"><label v-for="op in memberOptions" :key="op.id"><input v-model="newMembers" type="checkbox" :value="op.id" :disabled="busy || !newMembers.includes(op.id) && newMembers.length >= 3">{{ op.name }}</label></div>
            <p>已选 {{ newMembers.map(id => operatorName(id)).join('、') || '无' }}；请选择2或3名不同成员。</p>
            <div class="bond-toolbar"><label>行动<select v-model="newAction" :disabled="busy"><option v-for="(label, key) in ACTIONS" :key="key" :value="key">{{ label }}</option></select></label><label>效果<select v-model="newEffect" :disabled="busy"><option value="positive">一拍即合</option><option value="negative">貌合神离</option></select></label><label v-for="(label, key) in WEATHERS" :key="key"><input v-model="newWeathers" type="checkbox" :value="key" :disabled="busy">{{ label }}</label><button type="submit" :disabled="busy || newMembers.length < 2 || !newWeathers.length">添加到本地草稿</button></div>
          </form>
          <h2>条目维护</h2><label>搜索成员或ID<input v-model="query" type="search"></label>
          <div class="bond-admin-workspace"><div class="bond-admin-list"><p v-if="!visibleEntries.length">没有匹配条目。</p><button v-for="entry in visibleEntries.slice(0, 100)" :key="entry.index" type="button" :aria-pressed="selected === entry.index" @click="selected = entry.index">{{ entry.row.members.map(operatorName).join('、') }} · {{ ACTIONS[entry.row.action] }} · {{ WEATHERS[entry.row.weather] }}</button><p v-if="visibleEntries.length > 100">显示前100条，请搜索缩小范围。</p></div>
            <fieldset v-if="editing" class="bond-admin-editor" :disabled="busy"><legend>编辑当前条目</legend><p class="bond-admin-id">{{ editing.bond_id || '保存草稿时系统发号' }}</p><p>{{ editing.members.map(operatorName).join('、') }} · {{ ACTIONS[editing.action] }} · {{ WEATHERS[editing.weather] }}</p><p>成员、行动或天气变化应新增条目，并显式下架或作废旧条目；不能挪用ID。</p><label>效果<select v-model="editing.effect"><option value="positive">一拍即合</option><option value="negative">貌合神离</option></select></label><label>状态<select v-model="editing.status"><option v-for="(label, key) in STATUS" :key="key" :value="key">{{ label }}</option></select></label></fieldset>
          </div>
          <section class="bond-admin-editor"><h2>本地目录文件预览</h2><p>仅使用已获授权的数据。支持本站目录文件或转换工具产物；待处理资料不自动加入可发布草稿。</p><label>选择目录JSON<input type="file" accept=".json,application/json" :disabled="busy" @change="readImport"></label><template v-if="importCandidate"><p>待合并 {{ importCandidate.length }} 条；{{ pendingCount }} 条因游戏可用性冲突留在转换产物中，尚未发布。</p><details><summary>查看前20条资料</summary><pre>{{ JSON.stringify(importCandidate.slice(0, 20), null, 2) }}</pre></details><button type="button" :disabled="busy" @click="acceptLocalImport">将预览合并到本地草稿</button></template></section>
          <section v-if="publication" class="bond-admin-editor"><h2>发布预览</h2><p>将变更 {{ publication.changes.length }} 条；修订 {{ publication.expected_revision }}。发布会影响所有账号的目录和计数。</p><ul><li v-for="item in publication.errors" :key="item" class="bond-error">{{ item }}</li></ul><details><summary>逐项变更</summary><ul><li v-for="entry in publication.changes" :key="entry.bond_id">{{ entry.members.map(operatorName).join('、') }} · {{ ACTIONS[entry.action] }} · {{ WEATHERS[entry.weather] }} · {{ STATUS[entry.status] }} · {{ entry.effect === 'positive' ? '一拍即合' : '貌合神离' }}</li></ul></details><button type="button" :disabled="busy || dirty || publication.errors.length > 0" @click="publish">确认发布此预览</button></section>
          <details><summary>历史版本（最多5份）</summary><div v-for="snapshot in data.history" :key="snapshot.catalog_version" class="bond-toolbar"><span class="bond-admin-id">{{ snapshot.catalog_version }} · {{ snapshot.entries.length }} 条</span><button type="button" :disabled="busy || dirty" @click="previewPublication(snapshot.catalog_version)">预览恢复</button></div></details>
        </template>
      </template>
    </div><SiteFooter /></main></div>
</template>

<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import { useUnsavedChanges } from '../../utils/useUnsavedChanges.js'
import { dialog } from '../../utils/dialog.js'
import { getOperatorCatalog } from '../../api/operator.js'
import { bondAdminAction, getBondAdminCatalog } from '../../api/bonds.js'
import { ACTIONS, downloadBondFile, STATUS, WEATHERS } from './rules.js'
const game = ref('代号鸢'), data = ref(null), draft = ref([]), baseline = ref('[]'), operators = ref([]), busy = ref(false), error = ref(''), notice = ref(''), query = ref(''), selected = ref(0), publication = ref(null), restoreVersion = ref(null), importCandidate = ref(null), pendingCount = ref(0), errorSummary = ref(null)
const newMembers = ref([]), newWeathers = ref(['sunny']), newAction = ref('arson'), newEffect = ref('positive'), memberQuery = ref('')
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permitted = computed(() => !!identity.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.BOND_CATALOG_WRITE))
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)
const confirmDiscard = useUnsavedChanges(dirty, '羁绊目录草稿')
const operatorName = id => operators.value.find(o => o.id === id)?.name || id
const memberOptions = computed(() => operators.value.filter(o => o.games.includes(game.value) && (!memberQuery.value || o.name.includes(memberQuery.value) || newMembers.value.includes(o.id))))
const visibleEntries = computed(() => draft.value.map((row, index) => ({ row, index })).filter(({ row }) => !query.value || [row.bond_id, ...row.members.map(operatorName)].join(' ').includes(query.value)))
const editing = computed(() => draft.value[selected.value])
let alive = true, serial = 0
const capture = () => ({ serial: ++serial, identity: identity.value, game: game.value })
const matches = t => alive && t.serial === serial && t.identity === identity.value && t.game === game.value && permitted.value
function accept(value) { data.value = value; draft.value = structuredClone(value.draft); baseline.value = JSON.stringify(draft.value); publication.value = null; importCandidate.value = null }
async function run(action) {
  if (!permitted.value || busy.value) return null
  const t = capture(); busy.value = true; error.value = ''; notice.value = ''
  try { const result = await action(t); return matches(t) ? result : null }
  catch (e) { if (matches(t)) { error.value = e.status === 409 ? '目录版本冲突，编辑已保留。请导出本地草稿后重新读取。' : e.message; await nextTick(); errorSummary.value?.focus() } return null }
  finally { if (matches(t)) busy.value = false }
}
async function load() {
  const result = await run(async t => ({ data: await getBondAdminCatalog(t.game, t.identity), operators: await getOperatorCatalog() }))
  if (result) { operators.value = result.operators.operators; accept(result.data) }
}
async function reload() { if (!busy.value && await confirmDiscard()) await load() }
async function switchGame(value) { if (busy.value || game.value === value || !await confirmDiscard()) return; serial++; game.value = value; data.value = null; draft.value = []; baseline.value = '[]'; newMembers.value = []; await load() }
async function save() { const result = await run(t => bondAdminAction(t.game, t.identity, 'draft', { expected_revision: data.value.revision, entries: draft.value })); if (result) { accept(result); notice.value = '服务器草稿已保存，尚未发布。' } }
async function previewPublication(restore = null) {
  const result = await run(t => bondAdminAction(t.game, t.identity, 'preview', { expected_revision: data.value.revision, restore_version: restore }))
  if (result) { publication.value = result; restoreVersion.value = restore }
}
async function publish() {
  if (!publication.value || dirty.value || busy.value) return
  const t = capture(), revision = data.value.revision
  if (!await dialog.confirm({ title: '发布公共羁绊目录？', message: '将修改全站目录与有效计数。请确认数据分发授权及游戏可用性已核实。', confirmText: '发布', cancelText: '返回核对' })) return
  if (!matches(t) || dirty.value || revision !== data.value.revision) return
  const result = await run(t => bondAdminAction(t.game, t.identity, 'publish', { expected_revision: revision, restore_version: restoreVersion.value }))
  if (result) { accept(result); notice.value = '公共目录已发布。' }
}
async function discard() {
  if (busy.value || !await confirmDiscard()) return
  const t = capture()
  if (!await dialog.confirm({ title: '放弃服务器草稿？', message: '草稿将恢复到当前已发布目录。已分配ID和历史仍保留。' }) || !matches(t)) return
  const result = await run(t => bondAdminAction(t.game, t.identity, 'discard', { expected_revision: data.value.revision }))
  if (result) accept(result)
}
function addCombination() {
  if (busy.value || newMembers.value.length < 2 || newMembers.value.length > 3 || !newWeathers.value.length) return
  for (const weather of newWeathers.value) {
    const members = [...newMembers.value].sort()
    const existing = draft.value.find(e => [...e.members].sort().join('|') === members.join('|') && e.action === newAction.value && e.weather === weather)
    if (existing) { error.value = '组合已存在，请在条目维护中更正效果；没有新增重复条目。'; continue }
    draft.value.push({ game: game.value, members, action: newAction.value, weather, effect: newEffect.value, status: 'active' })
  }
  publication.value = null
}
function download() { downloadBondFile({ format: 'yuanhub-bond-catalog', schema_version: 1, game: game.value, entries: draft.value }, '羁绊目录草稿') }
async function readImport(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file || busy.value) return
  const result = await run(async t => {
    if (file.size > 2 * 1024 * 1024) throw new Error('目录文件最多2MiB。')
    const document = JSON.parse(await file.text())
    const conversion = document.format === 'yuanhub-bond-conversion'
    if (document.schema_version !== 1 || !conversion && document.format !== 'yuanhub-bond-catalog') throw new Error('不支持的目录文件格式。')
    const source = conversion ? document.catalogs.find(c => c.game === t.game) : document
    if (source?.game !== t.game || !Array.isArray(source.entries) || source.entries.length > 5000) throw new Error('文件游戏或条目数不匹配。')
    return { entries: source.entries, pending: conversion ? (document.pending || []).filter(p => p.entry.game === t.game).length : 0 }
  })
  if (result) { importCandidate.value = result.entries; pendingCount.value = result.pending }
}
function acceptLocalImport() {
  if (!importCandidate.value || busy.value) return
  const next = [...draft.value]
  for (const entry of importCandidate.value) {
    if (!entry || !Array.isArray(entry.members) || !ACTIONS[entry.action] || !WEATHERS[entry.weather] || entry.game !== game.value) { error.value = '文件存在非法条目，未合并。'; return }
    const old = next.find(e => e.bond_id && e.bond_id === entry.bond_id)
    const same = next.find(e => [...e.members].sort().join('|') === [...entry.members].sort().join('|') && e.action === entry.action && e.weather === entry.weather)
    if (old && old !== same || same && old !== same) { error.value = '文件稳定ID与身份冲突，未合并。请使用当前目录重新转换。'; return }
    if (old) next[next.indexOf(old)] = entry
    else next.push(entry)
  }
  draft.value = JSON.parse(JSON.stringify(next)); importCandidate.value = null; publication.value = null; notice.value = '预览已合并到本地草稿；尚未保存或发布。'
}
watch(draft, () => { publication.value = null }, { deep: true })
watch([identity, permitted], () => { serial++; busy.value = false; data.value = null; draft.value = []; baseline.value = '[]'; publication.value = null; importCandidate.value = null; if (permitted.value) load() }, { immediate: true })
onScopeDispose(() => { alive = false; serial++ })
</script>

<style src="./bondsShared.css"></style><style src="./bondsDesktop.css"></style><style src="./bondsMobile.css"></style>
<style scoped>.bond-admin-list { display: grid; gap: 6px; align-content: start; }.bond-admin-editor { border: 0; padding: 0; margin-block: 20px; }.bond-admin-editor label { display: grid; gap: 6px; }.bond-admin-editor pre { white-space: pre-wrap; overflow-wrap: anywhere; }</style>
