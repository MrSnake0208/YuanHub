<template>
  <div class="feedback-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap">
        <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台">← 返回管理工作台</router-link>
        <h1 class="page-header-title">开发目标管理</h1>
        <p class="page-header-description">规划开发目标、维护验收进度并关联公开反馈。</p>
      </div></header>
      <section class="feedback-content"><div class="wrap">
        <div class="goal-workspace-toolbar">
          <h2>开发目标</h2>
          <router-link class="goal-public-view" to="/co-creation">查看公开开发目标</router-link>
          <button class="feedback-primary-action goal-create-action" type="button" :disabled="busy" @click="openEditor()"><Plus :size="18" aria-hidden="true" />新增目标</button>
        </div>
        <p v-if="notice" role="status" class="goal-save-notice">{{ notice }}</p>
        <form v-if="form" class="goal-editor" aria-label="开发目标编辑" @submit.prevent="save">
          <h2>{{ editingId ? '编辑开发目标' : '新增开发目标' }}</h2>
          <p class="goal-admin-context">保存后立即展示给所有用户，请只填写适合公开的内容。</p>
          <fieldset :disabled="busy">
            <label class="full">目标标题<input ref="titleInput" v-model="form.title" class="feedback-form-control" required maxlength="120" /></label>
            <label class="full">目标说明<textarea v-model="form.description" class="feedback-form-control" required rows="4" maxlength="3000" placeholder="说明要解决什么问题，以及预期交付什么" /></label>
            <label>推进阶段<select v-model="form.stage" class="feedback-form-control"><option v-for="stage in DEVELOPMENT_STAGES" :key="stage.key" :value="stage.key">{{ stage.label }}</option></select></label>
            <label>目标版本（可选）<input v-model="form.targetVersion" class="feedback-form-control" maxlength="80" placeholder="例如 0.2.0" /></label>
            <label>目标日期（可选）<input v-model="form.targetDate" class="feedback-form-control" type="date" /></label>
            <section class="full criteria-editor" aria-label="验收清单">
              <h3>验收标准</h3><p>勾选表示已确认通过。全部通过后才可以标记目标完成。</p>
              <div v-for="(criterion, index) in form.criteria" :key="index" class="criterion-row">
                <label class="criterion-check"><input v-model="criterion.completed" type="checkbox" :aria-label="'第 ' + (index + 1) + ' 项已通过验收'" /></label>
                <input v-model="criterion.title" class="feedback-form-control" required maxlength="200" :aria-label="'第 ' + (index + 1) + ' 项验收标准'" placeholder="可明确判断是否完成的交付标准" />
                <button class="feedback-button" type="button" :disabled="form.criteria.length <= 1" :aria-label="'移除第 ' + (index + 1) + ' 项验收标准'" @click="form.criteria.splice(index, 1)">移除</button>
              </div>
              <button class="feedback-button" type="button" :disabled="form.criteria.length >= 20" @click="form.criteria.push({ title: '', completed: false })">添加验收标准</button>
            </section>
            <section class="full link-editor" aria-label="关联公开反馈">
              <h3>关联反馈（可选）</h3><p>仅关联公开反馈，不改变工单状态；取消公开后其标题会从公开目标中隐藏。</p>
              <div v-for="id in form.feedbackIds" :key="id" class="linked-row"><span>{{ feedbackTitles[id] || '已取消公开的关联' }}</span><button class="feedback-button" type="button" @click="form.feedbackIds = form.feedbackIds.filter(value => value !== id)">取消关联</button></div>
              <div class="goal-search"><input v-model="keyword" class="feedback-form-control" aria-label="搜索可关联的公开反馈" placeholder="搜索公开问题或建议" @keydown.enter.prevent="searchFeedback" /><button class="feedback-button" type="button" :disabled="searching || !keyword.trim()" @click="searchFeedback">{{ searching ? '搜索中…' : '搜索' }}</button></div>
              <p v-if="searchError" role="alert">{{ searchError }}</p><p v-else-if="searched && !candidates.length">没有找到公开反馈，请调整关键词。</p>
              <div v-for="item in candidates" :key="item.id" class="linked-row"><span>{{ item.publicTitle }}</span><button class="feedback-button" type="button" :disabled="form.feedbackIds.includes(item.id) || form.feedbackIds.length >= 20" @click="linkFeedback(item)">{{ form.feedbackIds.includes(item.id) ? '已关联' : '关联' }}</button></div>
            </section>
          </fieldset>
          <div v-if="error" class="feedback-form-error" role="alert">{{ error }}<button v-if="conflict" class="feedback-button" type="button" :disabled="busy" @click="reloadEditor">重新加载目标</button></div>
          <div class="goal-editor-actions"><button class="feedback-button" type="button" :disabled="busy" @click="closeEditor">取消</button><button class="feedback-primary-action" type="submit" :disabled="busy">{{ busy ? '处理中…' : '保存并公开' }}</button></div>
        </form>
        <DevelopmentRoadmap ref="roadmap" managed @edit="openEditor" />
      </div></section>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { Plus } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import DevelopmentRoadmap from '@/components/co-creation/DevelopmentRoadmap.vue'
import { DEVELOPMENT_STAGES, getAdminDevelopmentGoal, saveDevelopmentGoal } from '@/api/developmentGoals.js'
import { listPublicFeedback } from '@/api/coCreation.js'
import { auth } from '@/store/auth.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
import '@/styles/feedback-workspace.css'
import '@/styles/page-header.css'

const form = ref(null), editingId = ref(''), original = ref(''), busy = ref(false), error = ref(''), conflict = ref(false), notice = ref('')
const keyword = ref(''), candidates = ref([]), searching = ref(false), searched = ref(false), searchError = ref(''), feedbackTitles = ref({})
const titleInput = ref(null), roadmap = ref(null)
let session = 0, searchId = 0, mounted = true
const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== original.value)
const confirmDiscard = useUnsavedChanges(dirty, '开发目标')
const userId = () => String(auth.userInfo?.id || '')

async function openEditor(goal = null) {
  if (busy.value || !await confirmDiscard()) return
  session += 1; searchId += 1
  editingId.value = goal?.id || ''
  form.value = goal ? {
    title: goal.title, description: goal.description, stage: goal.stage,
    criteria: goal.criteria.map(item => ({ ...item })), feedbackIds: [...goal.feedbackIds],
    targetVersion: goal.targetVersion, targetDate: goal.targetDate, version: goal.version
  } : { title: '', description: '', stage: 'PLANNED', criteria: [{ title: '', completed: false }], feedbackIds: [], targetVersion: '', targetDate: '', version: 0 }
  original.value = JSON.stringify(form.value)
  feedbackTitles.value = Object.fromEntries((goal?.linkedFeedback || []).map(item => [item.id, item.title]))
  error.value = ''; conflict.value = false; notice.value = ''; keyword.value = ''; candidates.value = []; searched.value = false; searching.value = false; searchError.value = ''
  await nextTick()
  titleInput.value?.focus(); titleInput.value?.scrollIntoView?.({ block: 'center' })
}
async function closeEditor() {
  if (busy.value || !await confirmDiscard()) return
  session += 1; searchId += 1; form.value = null; error.value = ''
}
async function reloadEditor() {
  if (busy.value || !await confirmDiscard()) return
  const current = session, identity = userId()
  busy.value = true
  try {
    const goal = await getAdminDevelopmentGoal(editingId.value)
    if (!mounted || current !== session || identity !== userId()) return
    original.value = JSON.stringify(form.value)
    busy.value = false
    await openEditor(goal)
  } catch (e) { if (mounted && current === session && identity === userId()) error.value = e.message || '重新加载失败' }
  finally { if (mounted && current === session) busy.value = false }
}
async function searchFeedback() {
  if (!keyword.value.trim()) return
  const current = ++searchId, editorSession = session
  searching.value = true; searchError.value = ''; searched.value = false
  try {
    const result = await listPublicFeedback({ keyword: keyword.value.trim(), page: 1, pageSize: 20 })
    if (!mounted || current !== searchId || editorSession !== session) return
    candidates.value = result.items; searched.value = true
  } catch (e) { if (mounted && current === searchId && editorSession === session) searchError.value = e.message || '公开反馈搜索失败' }
  finally { if (mounted && current === searchId) searching.value = false }
}
function linkFeedback(item) { form.value.feedbackIds.push(item.id); feedbackTitles.value[item.id] = item.publicTitle }
async function save() {
  if (busy.value || !form.value) return
  if (!form.value.title.trim() || !form.value.description.trim() || form.value.criteria.some(item => !item.title.trim())) { error.value = '请填写目标标题、说明及每项验收标准'; return }
  if (form.value.stage === 'COMPLETED' && form.value.criteria.some(item => !item.completed)) { error.value = '全部验收标准通过后才能标记完成'; return }
  const current = session, identity = userId()
  busy.value = true; error.value = ''; conflict.value = false
  try {
    await saveDevelopmentGoal(editingId.value, form.value)
    if (!mounted || current !== session || identity !== userId()) return
    form.value = null; notice.value = '开发目标已保存并公开。'; session += 1
    await roadmap.value?.reload()
  } catch (e) {
    if (mounted && current === session && identity === userId()) { error.value = e.message || '保存失败，编辑内容已保留'; conflict.value = e.status === 409 }
  } finally { if (mounted) busy.value = false }
}
onBeforeUnmount(() => { mounted = false; session += 1; searchId += 1 })
</script>

<style scoped>
.goal-workspace-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0 12px; padding: 8px 0 12px; border-bottom: 1px solid var(--feedback-line); }
.goal-workspace-toolbar h2 { margin: 0; color: var(--tea); font: 900 20px/1.4 var(--font-s); }
.goal-public-view { grid-column: 1; grid-row: 2; display: inline-flex; align-items: center; justify-self: start; min-height: 44px; color: var(--accent-strong); font-size: 13px; text-decoration: underline; }
.goal-create-action { grid-column: 2; grid-row: 1 / 3; }
.goal-admin-context { margin: 0 0 16px; color: var(--feedback-warn); font-size: 13px; line-height: 1.7; }
.goal-save-notice { margin-top: 16px; color: var(--feedback-success); }
.goal-editor { margin-top: 16px; padding: 24px; border: 1px solid var(--feedback-line); border-radius: 12px; background: var(--feedback-panel); overflow-wrap: anywhere; }
.goal-editor h2 { margin-bottom: 8px; color: var(--feedback-text); font: 900 22px var(--font-s); }
.goal-editor fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; min-width: 0; margin: 0; padding: 0; border: 0; }
.goal-editor label { display: grid; gap: 7px; min-width: 0; color: var(--feedback-text); font-size: 13px; }
.goal-editor .full { grid-column: 1 / -1; }
.goal-editor h3 { color: var(--feedback-text); font-size: 14px; }
.criteria-editor > p,.link-editor > p { margin: 6px 0 12px; color: var(--feedback-text-muted); font-size: 12px; line-height: 1.7; }
.criterion-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.criterion-row > input { flex: 1; min-width: 0; }
.criterion-check { min-width: 44px !important; min-height: 44px; place-content: center; }
.linked-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 10px 0; color: var(--feedback-text); font-size: 13px; }
.linked-row span { min-width: 0; overflow-wrap: anywhere; }
.linked-row button { flex: none; }
.goal-search { display: flex; gap: 8px; margin-top: 14px; }
.goal-search input { min-width: 0; flex: 1; }
.goal-editor-actions { display: flex; justify-content: end; gap: 12px; margin-top: 20px; }
.feedback-form-error { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: 16px; font-size: 13px; line-height: 1.7; }
.goal-search button,.criterion-row button,.goal-editor-actions button,.feedback-form-error button { flex-shrink: 0; white-space: nowrap; }
.feedback-content :deep(.goal-toolbar) { margin-top: 16px; }
.feedback-content :deep(.goal-notice) { margin-top: 8px; }
.feedback-content :deep(.goal-grid) { margin-top: 12px; }
.feedback-content :deep(.goal-card header button) { flex-shrink: 0; white-space: nowrap; }
.feedback-content :is(button,a,summary):focus-visible,.feedback-content :deep(:is(button,a,summary):focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (min-width: 600px) { .goal-workspace-toolbar { grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; } .goal-public-view { grid-column: 2; grid-row: 1; } .goal-create-action { grid-column: 3; grid-row: 1; } }
@media (max-width: 767px) { .goal-editor { padding: 16px; } .goal-editor fieldset { grid-template-columns: minmax(0, 1fr); } .criterion-row { flex-wrap: wrap; } .criterion-row > input { width: calc(100% - 60px); } .goal-editor-actions button { flex: 1; } }
</style>
