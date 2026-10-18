<template>
  <div class="page-achievement-admin">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header">
        <div class="wrap">
          <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台">返回管理工作台</router-link>
          <h1 class="page-header-title">成就目录管理</h1>
          <p class="page-header-description">导入或编辑成就，确认发布后玩家即可记录自己的完成状态。</p>
        </div>
      </header>
      <div class="wrap catalog-admin">
        <p v-if="!permitted" role="alert">需要成就目录管理权限。</p>
        <template v-else>
          <p v-if="error" ref="errorSummary" class="message error" role="alert" tabindex="-1">{{ error }}</p>
          <p v-if="notice" class="message" role="status">{{ notice }}</p>
          <div class="game-switch" role="group" aria-label="选择目录游戏">
            <button v-for="name in games" :key="name" :aria-pressed="game === name" :disabled="busy" @click="switchGame(name)">{{ name }}</button>
            <button :disabled="busy" @click="reload">重新读取</button>
            <span v-if="busy" role="status">处理中…</span>
          </div>
          <template v-if="data && draft">
            <p class="catalog-summary">已发布 {{ publishedEntries.length }} · 草稿 {{ activeEntries.length }} · 编辑修订 {{ data.revision }}</p>
            <p class="version">当前发布：{{ data.published.version }}<br>{{ data.published.published_at }} · {{ data.published.published_by }}</p>
            <div class="toolbar">
              <label>搜索成就<input v-model="search" type="search" placeholder="名称、别名或 ID"></label>
              <label>分类<select v-model="categoryFilter"><option value="">全部分类</option><option v-for="c in draft.categories" :key="c.category_id" :value="c.category_id">{{ c.name }}</option></select></label>
              <label>编辑状态<select v-model="stateFilter"><option value="">全部</option><option value="add">新增</option><option value="update">已修改</option><option value="retired">已退役</option></select></label>
              <button :disabled="busy || dirty || !draft.categories.some(c => c.enabled)" @click="addEntry">新增成就</button>
              <button :disabled="busy || dirty" @click="showCategories = !showCategories">分类管理 / 新增分类</button>
            </div>
            <div class="save-bar">
              <strong>{{ dirty ? '有未保存修改' : '草稿已保存' }}</strong>
              <button class="primary" :disabled="busy || !dirty" @click="save">保存草稿</button>
              <button :disabled="busy || dirty" @click="previewPublication()">预览发布</button>
              <span v-if="dirty">新增、导入或发布前，请先保存草稿。</span>
            </div>
            <section v-if="showCategories" class="panel" aria-labelledby="categories-title">
              <h2 id="categories-title">游戏分类</h2>
              <form class="category-add" @submit.prevent="addCategory">
                <label>新分类名称<input v-model.trim="categoryName" maxlength="100" :disabled="busy"></label>
                <button :disabled="busy || dirty || !categoryName">新增分类</button>
              </form>
              <div v-for="c in draft.categories" :key="c.category_id" class="category-row">
                <label>名称<input v-model="c.name" maxlength="100" :disabled="busy"></label>
                <label>顺序<input v-model.number="c.sort" type="number" step="1" :disabled="busy"></label>
                <label class="check"><input v-model="c.enabled" type="checkbox" :disabled="busy || categoryCount(c.category_id) > 0">启用</label>
                <small>{{ categoryCount(c.category_id) }} 条有效成就 · {{ c.category_id }}<span v-if="categoryCount(c.category_id)">；先迁移或退役成就才能停用</span></small>
              </div>
            </section>
            <div class="catalog-workspace" :class="{ editing: !!selected }">
              <section ref="listPanel" class="entry-list panel" aria-labelledby="list-title" tabindex="-1">
                <h2 id="list-title">成就列表 <small>{{ filtered.length }} 条</small></h2>
                <p v-if="!filtered.length">暂无符合条件的成就。先新增分类，再新增成就。</p>
                <button v-for="e in filtered" :key="e.achievement_id" class="entry-row" :aria-pressed="selected === e.achievement_id" :disabled="busy" @click="selectEntry(e.achievement_id)">
                  <strong>{{ e.name || '未命名成就' }}</strong>
                  <span>{{ categoryLabel(e.category_id) }}<template v-if="retired(e)"> · 已退役</template></span>
                  <small>{{ e.condition || '尚未填写完成条件' }}</small>
                </button>
              </section>
              <section v-if="entry" ref="editor" class="entry-editor panel" aria-labelledby="editor-title" tabindex="-1">
                <button class="return-list" :disabled="busy" @click="closeEditor">返回列表</button>
                <h2 id="editor-title">{{ entry.name || '新增成就' }}</h2>
                <p class="version">{{ game }} · {{ entry.achievement_id }}<br>稳定 ID 由系统生成，发布后持续关联玩家记录。</p>
                <fieldset :disabled="busy">
                  <legend>基本资料</legend>
                  <div class="fields">
                    <label>名称（必填）<input v-model="entry.name" maxlength="200"></label>
                    <label>游戏原生分类<select v-model="entry.category_id"><option v-for="c in draft.categories.filter(c => c.enabled || c.category_id === entry.category_id)" :key="c.category_id" :value="c.category_id">{{ c.name }}</option></select></label>
                    <label>原始显示顺序<input v-model.number="entry.sort" type="number" step="1"></label>
                    <label>隐藏成就<select v-model="entry.is_hidden"><option :value="null">未知</option><option :value="false">否</option><option :value="true">是</option></select></label>
                    <label class="full">别名（每行一个）<textarea :value="entry.aliases.join('\n')" rows="2" @input="entry.aliases = $event.target.value.split('\n')" @blur="entry.aliases = entry.aliases.map(a => a.trim()).filter(Boolean)"></textarea></label>
                    <label class="check full"><input type="checkbox" :checked="retired(entry)" @change="setRetired(entry.achievement_id, $event.target.checked)">退役（从玩家当前目录移出，保留全部个人记录）</label>
                  </div>
                </fieldset>
                <fieldset :disabled="busy">
                  <legend>完成信息与奖励</legend>
                  <label>完成条件（选填）<textarea v-model="entry.condition" rows="3" maxlength="4000"></textarea></label>
                  <label>完成方法（选填）<textarea v-model="entry.method" rows="3" maxlength="4000"></textarea></label>
                  <div class="fields">
                    <label>章节（可选）<input v-model="entry.chapter" maxlength="4000"></label>
                    <label>奖励文本（选填）<input v-model="entry.reward" maxlength="4000" placeholder="可留空"></label>
                  </div>
                  <label>剧透或注意事项（可选）<textarea v-model="entry.spoiler" rows="2" maxlength="4000"></textarea></label>
                </fieldset>
                <fieldset :disabled="busy">
                  <legend>进度规则</legend>
                  <label>记录口径<select :value="entry.progress_kind" @change="setProgressKind($event.target.value)"><option value="">不支持数值进度</option><option value="integer">整数累计进度</option><option value="number">数值进度</option></select></label>
                  <div v-if="entry.progress_kind" class="fields">
                    <label>目标数量<input :value="entry.target" @input="entry.target = $event.target.value === '' ? null : $event.target.valueAsNumber" type="number" min="0.000000001" :step="entry.progress_kind === 'integer' ? 1 : 'any'"></label>
                    <label>单位（选填）<input v-model="entry.unit" maxlength="40" placeholder="例如：次"></label>
                  </div>
                  <p class="hint">已发布的类型与单位不可变，目标仅可增加；不会重置或裁剪玩家进度。</p>
                </fieldset>
                <details>
                  <summary>资料来源（选填）</summary>
                  <fieldset :disabled="busy">
                    <div v-for="(source, index) in entry.sources" :key="index" class="source-row">
                      <label>来源名称<input v-model="source.title" maxlength="200"></label>
                      <label>HTTPS 原始链接<input v-model="source.url" type="url" maxlength="2000"></label>
                      <label>使用依据或授权说明<textarea v-model="source.usage" rows="2" maxlength="2000"></textarea></label>
                      <button type="button" @click="entry.sources.splice(index, 1)">移除此来源 {{ index + 1 }}</button>
                    </div>
                    <button type="button" :disabled="entry.sources.length >= 10" @click="entry.sources.push({ title: '', url: '', usage: '' })">添加来源</button>
                  </fieldset>
                </details>
                <button class="primary" :disabled="busy || !dirty" @click="save">保存草稿</button>
              </section>
              <p v-else class="editor-placeholder panel">选择成就开始维护。玩家只会看到已发布目录。</p>
            </div>
            <details class="panel coverage">
              <summary>资料覆盖范围（选填）</summary>
              <p class="hint">发布时自动区分空目录和部分收录，无需手动填写；只有确认完整收录时才选择完整目录。</p>
              <div class="fields">
                <label>目录范围<select v-model="draft.data_status" :disabled="busy"><option value="empty">按目录内容自动确定</option><option value="partial">部分收录</option><option value="complete">完整收录（须人工确认）</option></select></label>
                <label>收录范围说明（选填）<textarea v-model="draft.coverage" rows="2" maxlength="2000" :disabled="busy"></textarea></label>
              </div>
            </details>
            <section v-if="publication" ref="publicationPanel" class="panel publication" aria-labelledby="publish-title" tabindex="-1">
              <h2 id="publish-title">{{ publication.restored_from ? '回滚预览' : '发布预览' }}</h2>
              <p>新增 {{ changeCount('add') }} · 修改 {{ changeCount('update') }} · 退役 / 移除 {{ changeCount('retire') }}</p>
              <p v-if="publication.restored_from">将 {{ publication.restored_from }} 发布为一个新版本。</p>
              <details v-if="publication.changes.length"><summary>成就变更明细</summary><p v-for="c in publication.changes" :key="c.achievement_id">{{ changeLabels[c.kind] }} · {{ c.name }} · {{ c.achievement_id }}</p></details>
              <details v-if="publication.category_changes.length"><summary>分类变更 {{ publication.category_changes.length }} 项</summary><p v-for="(c, i) in publication.category_changes" :key="i">{{ c }}</p></details>
              <p>范围：{{ publicationRange }}</p>
              <div v-if="publication.errors.length" class="error" role="alert">
                <strong>请先修正以下问题：</strong>
                <p v-for="issue in publicationIssues" :key="issue.entry?.achievement_id || 'catalog'">
                  <button v-if="issue.entry && !publication.restored_from" :disabled="busy" :title="issue.entry.achievement_id" @click="selectEntry(issue.entry.achievement_id)">编辑「{{ issue.entry.name || issue.entry.achievement_id }}」</button>
                  <strong v-else-if="issue.entry">{{ issue.entry.name || issue.entry.achievement_id }}：</strong>
                  {{ issue.messages.join('；') }}
                </p>
              </div>
              <div v-if="publication.progress_changes.length"><strong>进度规则变更：</strong><p v-for="(issue, i) in publication.progress_changes" :key="i">{{ issue }}</p></div>
              <button class="primary" :disabled="busy || dirty || publication.errors.length > 0" @click="publish">确认{{ publication.restored_from ? '回滚并发布新版本' : '发布' }}</button>
              <button :disabled="busy" @click="publication = null">取消</button>
            </section>
            <details class="panel maintenance">
              <summary>批量导入、导出与发布历史</summary>
              <div class="maintenance-body">
                <div class="actions">
                  <button :disabled="busy" @click="download('published')">导出已发布目录</button>
                  <button :disabled="busy" @click="download('draft')">{{ dirty ? '导出本地未保存草稿' : '导出已保存草稿' }}</button>
                  <button :disabled="busy || dirty" @click="fileInput.click()">选择目录 JSON</button>
                  <input ref="fileInput" class="file-input" type="file" accept=".json,application/json" @change="readFile">
                </div>
                <template v-if="importDocument">
                  <p>{{ importName }} · 只合入草稿，文件缺失条目不会删除现有资料；确认发布后玩家可见。</p>
                  <label>冲突处理<select v-model="importStrategy" :disabled="busy" @change="importPlan = null"><option value="keep">保留已有条目（默认）</option><option value="update">明确更新冲突条目</option></select></label>
                  <button :disabled="busy || dirty" @click="previewImport">预览导入</button>
                  <div v-if="importPlan" class="import-preview">
                    <p>新增 {{ importCount('add') }} · 冲突 {{ importCount('conflict') }} · 非法 {{ importCount('invalid') }} · 未匹配 {{ importCount('unmatched') }} · 无变化 {{ importCount('same') }}</p>
                    <p>非法条目阻止整批导入；未匹配 ID 将跳过。不会按名称自动合并。</p>
                    <details><summary>逐条核对</summary><p v-for="(item, i) in importPlan.items" :key="i">{{ item.achievement_id || '新建条目' }} · {{ item.message }}</p></details>
                    <button :disabled="busy || dirty || importCount('invalid') > 0" @click="confirmImport">确认导入草稿{{ importCount('unmatched') ? '并跳过未匹配项' : '' }}</button>
                  </div>
                </template>
                <h3>发布历史（保留最近 5 个旧版本）</h3>
                <label>历史版本<select v-model="restoreVersion" :disabled="busy"><option value="">选择历史版本</option><option v-for="h in data.history" :key="h.version" :value="h.version">{{ h.published_at }} · {{ h.version }} · {{ h.published_by }}</option></select></label>
                <p class="hint">回滚前须先导出并放弃未发布草稿；回滚也会核对进度兼容性，不覆盖他人修改。</p>
                <div class="actions"><button :disabled="busy || dirty || !restoreVersion" @click="previewPublication(restoreVersion)">对比并预览回滚</button><button :disabled="busy || dirty" @click="discard">放弃已保存草稿</button></div>
              </div>
            </details>
          </template>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import '../../styles/page-header.css'
import IslandSidebar from '../../components/IslandSidebar.vue'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import { achievementCatalogCommand, exportAchievementCatalog, getAchievementCatalogAdmin } from '../../api/achievementCatalogAdmin.js'

const games = ['代号鸢', '如鸢']
const changeLabels = { add: '新增', update: '修改', retire: '退役 / 移除' }
const game = ref(games[0]), data = ref(null), draft = ref(null), selected = ref('')
const busy = ref(false), error = ref(''), notice = ref(''), search = ref(''), categoryFilter = ref(''), stateFilter = ref('')
const showCategories = ref(false), categoryName = ref(''), publication = ref(null), restoreVersion = ref('')
const importDocument = ref(null), importPlan = ref(null), importStrategy = ref('keep'), importName = ref('')
const fileInput = ref(null), errorSummary = ref(null), editor = ref(null), publicationPanel = ref(null), listPanel = ref(null)
const identity = computed(() => String(auth.userInfo?.id || ''))
const permitted = computed(() => !!identity.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ACHIEVEMENT_CATALOG_WRITE))
const dirty = computed(() => !!data.value && JSON.stringify(draft.value) !== JSON.stringify(data.value.draft))
const entry = computed(() => draft.value?.entries.find(e => e.achievement_id === selected.value))
const activeEntries = computed(() => draft.value?.entries.filter(e => !retired(e)) || [])
const publishedEntries = computed(() => data.value?.published.content.entries.filter(e => !data.value.published.content.retired_ids.includes(e.achievement_id)) || [])
const historyContent = computed(() => data.value?.history.find(h => h.version === publication.value?.restored_from)?.content)
const previewContent = computed(() => publication.value?.restored_from ? historyContent.value : draft.value)
const publicationRange = computed(() => {
  const value = previewContent.value
  if (!value?.entries.some(e => !value.retired_ids.includes(e.achievement_id))) return '空目录'
  return value.data_status === 'complete' ? '完整收录' : '部分收录'
})
const publicationIssues = computed(() => {
  const content = previewContent.value
  const entries = new Map((content?.entries || []).map(e => [e.achievement_id, e]))
  const groups = new Map()
  for (const message of publication.value?.errors || []) {
    const separator = message.indexOf('：')
    const entry = separator >= 0 ? entries.get(message.slice(0, separator)) : null
    const key = entry?.achievement_id || 'catalog'
    if (!groups.has(key)) groups.set(key, { entry, messages: [] })
    groups.get(key).messages.push(entry ? message.slice(separator + 1) : message)
  }
  return [...groups.values()]
})
const filtered = computed(() => (draft.value?.entries || []).filter(e => {
  if (categoryFilter.value && e.category_id !== categoryFilter.value) return false
  if (search.value && ![e.name, e.achievement_id, ...e.aliases].join(' ').toLowerCase().includes(search.value.toLowerCase())) return false
  const old = publishedEntries.value.find(p => p.achievement_id === e.achievement_id)
  const status = stateFilter.value
  if (status === 'retired') return retired(e)
  if (status && retired(e)) return false
  if (status === 'add') return !old
  if (status === 'update') return !!old && JSON.stringify(old) !== JSON.stringify(e)
  return true
}).sort((a, b) => a.sort - b.sort))
const clone = value => JSON.parse(JSON.stringify(value))
let generation = 0
function retired(e) { return draft.value?.retired_ids.includes(e.achievement_id) }
function categoryLabel(id) { return draft.value?.categories.find(c => c.category_id === id)?.name || id }
function categoryCount(id) { return activeEntries.value.filter(e => e.category_id === id).length }
function changeCount(kind) { return publication.value?.changes.filter(c => c.kind === kind).length || 0 }
function importCount(outcome) { return importPlan.value?.items.filter(i => i.outcome === outcome).length || 0 }
function accept(value) {
  data.value = value; draft.value = clone(value.draft); publication.value = null; importPlan.value = null
  if (!value.draft.entries.some(e => e.achievement_id === selected.value)) selected.value = ''
}
async function run(action, message = '') {
  if (busy.value || !permitted.value) return null
  const turn = generation, user = identity.value, targetGame = game.value
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await action(targetGame, user)
    if (turn !== generation || user !== identity.value) return null
    if (message) notice.value = message
    return result
  } catch (e) {
    if (turn === generation) { error.value = e.message; await nextTick(); errorSummary.value?.focus() }
    return null
  } finally { if (turn === generation) busy.value = false }
}
async function load() {
  const result = await run(getAchievementCatalogAdmin)
  if (result) accept(result)
}
async function reload() {
  if (dirty.value && !window.confirm('重新读取会放弃当前未保存修改，继续？')) return
  await load()
}
async function switchGame(value) {
  if (value === game.value || busy.value) return
  if (dirty.value && !window.confirm('切换游戏会放弃未保存修改，继续？')) return
  game.value = value; reset(); await load()
}
function reset() {
  generation++; busy.value = false; data.value = null; draft.value = null; selected.value = ''; publication.value = null
  importDocument.value = null; importPlan.value = null; restoreVersion.value = ''; error.value = ''; notice.value = ''
  search.value = ''; categoryFilter.value = ''; stateFilter.value = ''; categoryName.value = ''; showCategories.value = false
}
async function command(action, fields = {}, message = '') {
  const revision = data.value.revision
  const result = await run((g, u) => achievementCatalogCommand(g, u, action, revision, fields), message)
  return result
}
async function save() {
  const value = await command('draft', { catalog: clone(draft.value) }, '草稿已保存，尚未发布。')
  if (value) accept(value)
}
async function closeEditor() { selected.value = ''; await nextTick(); listPanel.value?.focus() }
async function selectEntry(id) { selected.value = id; await nextTick(); editor.value?.focus() }
async function addEntry() {
  const category = draft.value.categories.find(c => c.enabled && (!categoryFilter.value || c.category_id === categoryFilter.value)) || draft.value.categories.find(c => c.enabled)
  const value = await command('entries', { category_id: category.category_id }, '已新建成就草稿。')
  if (value) { accept(value); search.value = ''; stateFilter.value = ''; categoryFilter.value = ''; await selectEntry(value.draft.entries.at(-1).achievement_id) }
}
async function addCategory() {
  const value = await command('categories', { name: categoryName.value }, '分类已加入草稿。')
  if (value) { accept(value); categoryName.value = '' }
}
function setRetired(id, value) { draft.value.retired_ids = value ? [...new Set([...draft.value.retired_ids, id])] : draft.value.retired_ids.filter(i => i !== id) }
function setProgressKind(value) {
  entry.value.progress_kind = value || null
  if (!value) { entry.value.target = null; entry.value.unit = null }
}
async function previewPublication(restore = null) {
  const result = await command('preview', restore ? { restore_version: restore } : {})
  if (result) { publication.value = result; await nextTick(); publicationPanel.value?.focus() }
}
async function publish() {
  const preview = publication.value
  const value = await command('publish', preview.restored_from ? { restore_version: preview.restored_from } : {}, '目录已发布，玩家下次刷新即可获取。')
  if (value) { accept(value); restoreVersion.value = '' }
}
async function discard() {
  if (!window.confirm('放弃已保存草稿并恢复当前发布目录？请先导出需要保留的资料。')) return
  const value = await command('discard', {}, '草稿已恢复为当前发布版本。')
  if (value) { accept(value); selected.value = '' }
}
async function readFile(event) {
  const file = event.target.files?.[0], turn = generation
  event.target.value = ''
  if (!file) return
  importPlan.value = null; importDocument.value = null
  if (file.size > 2 * 1024 * 1024) { error.value = '目录文件最多2MiB'; return }
  try {
    const document = JSON.parse(await file.text())
    if (turn !== generation) return
    importDocument.value = document; importName.value = file.name
  } catch (_) { if (turn === generation) error.value = '文件不是有效 JSON' }
}
async function previewImport() {
  const result = await command('import-preview', { document: importDocument.value, strategy: importStrategy.value })
  if (result) importPlan.value = result
}
async function confirmImport() {
  const value = await command('import-confirm', { document: importDocument.value, strategy: importStrategy.value, preview_token: importPlan.value.preview_token }, '成就已导入草稿，可预览并确认发布。')
  if (value) { accept(value); importDocument.value = null }
}
async function download(scope) {
  const targetGame = game.value
  const local = scope === 'draft' && dirty.value
  const value = local
    ? { format: 'yuanhub-achievement-catalog', schema_version: 1, catalog: clone(draft.value) }
    : await run((g, u) => exportAchievementCatalog(g, u, scope))
  if (!value) return
  if (local) notice.value = '已导出本地未保存草稿，可保留文件后重新读取核对冲突。'
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `成就目录-${targetGame}-${scope}.json`; link.click(); URL.revokeObjectURL(url)
}
watch(draft, () => { publication.value = null; importPlan.value = null }, { deep: true, flush: 'sync' })
watch([identity, permitted], () => { reset(); if (permitted.value) load() }, { immediate: true })
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onBeforeRouteLeave(() => !busy.value && (!dirty.value || window.confirm('离开会放弃未保存修改，继续？')))
onBeforeUnmount(() => { generation++; window.removeEventListener('beforeunload', beforeUnload) })
</script>

<style scoped src="./catalogAdminShared.css"></style>
<style scoped src="./catalogAdminDesktop.css"></style>
<style scoped src="./catalogAdminMobile.css"></style>
