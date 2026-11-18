<template>
  <div class="calendar-page calendar-admin" :class="{ 'calendar-directory-active': workspace === 'directory' }">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header page-header--mobile-context"><div class="wrap">
        <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台"><ArrowLeft :size="16" aria-hidden="true" /> 返回管理工作台</router-link>
        <h1 class="page-header-title">活动日历管理</h1>
        <p class="page-header-description">维护公共活动日程，处理用户补充建议。</p>
      </div></header>
      <div class="wrap calendar-content">
        <p v-if="!permitted" class="calendar-panel" role="alert">需要活动日历维护权限。</p>
        <template v-else>
          <nav class="calendar-actions calendar-workspace-nav" aria-label="活动管理工作区"><button type="button" :aria-pressed="workspace === 'directory'" @click="switchWorkspace('directory')">活动目录</button><button type="button" :aria-pressed="workspace === 'suggestions'" @click="switchWorkspace('suggestions')">用户建议</button></nav>
          <CalendarSuggestionsReview v-if="workspace === 'suggestions'" ref="suggestionsReview" />
          <template v-else>
          <section v-show="showDirectory" class="calendar-directory-controls" aria-labelledby="calendar-list-title">
            <header class="calendar-workspace-head">
              <h2 id="calendar-list-title">活动目录</h2>
              <div class="calendar-actions"><button type="button" :disabled="exporting" @click="exportAll">{{ exporting ? '导出中…' : '导出全部' }}</button><button type="button" :disabled="loading || saving" @click="classificationImporting = true">导入更新分类</button><button type="button" :disabled="loading || saving" @click="importing = true">批量导入</button><button ref="newButton" type="button" class="calendar-primary" :disabled="loading || (saving && editing)" @click="open()">新建活动</button></div>
            </header>
            <form class="calendar-panel calendar-form" @submit.prevent="load()">
              <div class="calendar-fields">
                <label>游戏<select v-model="filters.game"><option value="">全部游戏</option><option v-for="game in CALENDAR_GAMES" :key="game">{{ game }}</option></select></label>
                <label>类型<select v-model="displayGroup"><option value="">全部类型</option><option v-for="(label, key) in CALENDAR_DISPLAY_GROUPS" :key="key" :value="key">{{ label }}</option></select></label>
                <label>启用状态<select v-model="filters.enabled"><option value="">全部状态</option><option value="true">已启用</option><option value="false">已停用</option></select></label>
                <label>搜索标题<input v-model.trim="filters.search" type="search" maxlength="120" placeholder="输入活动标题"></label>
                <label>日期范围起点<input v-model="filters.from" type="date"></label>
                <label>日期范围终点<input v-model="filters.to" type="date" :min="filters.from || undefined"></label>
                <label>排序<select v-model="sortOrder"><option value="desc">开始日期：由新到旧</option><option value="asc">开始日期：由旧到新</option></select></label>
              </div>
              <div class="calendar-actions"><button type="submit" :disabled="loading || saving">{{ loading ? '读取中…' : '筛选 / 刷新' }}</button><button type="button" :disabled="loading || saving" @click="clearFilters">清空筛选</button></div>
            </form>
            <p v-if="listError" ref="listErrorSummary" class="calendar-panel calendar-error" role="alert" tabindex="-1">{{ listError }}</p>
            <p v-if="notice && !form" class="calendar-panel" role="status">{{ notice }}</p>
          </section>

          <div class="calendar-catalog-workspace">
            <section v-show="showDirectory" ref="listRegion" class="calendar-list calendar-catalog-list" aria-label="活动目录列表" tabindex="-1">
              <p v-if="loading && !sortedEntries.length" role="status">正在读取活动目录…</p>
              <p v-else-if="!sortedEntries.length && !listError" class="calendar-panel">没有符合条件的活动。</p>
              <button v-for="entry in sortedEntries" :key="entry.item.id" type="button" class="calendar-catalog-row"
                :aria-current="selectedId === entry.item.id ? 'true' : undefined" :disabled="loading || (saving && editing)" @click="open(entry)">
                <span class="calendar-badges"><span class="calendar-game">{{ entry.item.game }}</span><span class="calendar-category">{{ calendarDisplay(entry.item).path }}</span><span class="calendar-state">{{ entry.enabled ? '已启用' : '已停用' }}</span></span>
                <strong>{{ entry.item.title }}</strong>
                <span class="calendar-range">{{ calendarRangeLabel(entry.item) }} · {{ entry.item.time_zone }}</span>
                <span class="calendar-hint">{{ entry.read_only ? '来自招募卡池 · 只读' : '手工整理' }} · 最近修改：{{ modifiedLabel(entry.updated_at) }}</span>
                <span v-if="(!calendarDisplay(entry.item).key || calendarDisplay(entry.item).preserved) && !entry.read_only" class="calendar-hint">原分类：{{ calendarDisplay(entry.item).original }}</span>
                <span v-if="entry.source_note" class="calendar-hint calendar-catalog-note">来源备注：{{ entry.source_note }}</span>
              </button>
            </section>

            <section v-if="editing" ref="editor" class="calendar-panel calendar-editor calendar-catalog-editor" aria-labelledby="calendar-editor-title" tabindex="-1">
              <div class="calendar-editor-identity">
                <button v-if="compact" type="button" :disabled="saving" @click="requestClose()">返回活动目录</button>
                <template v-if="form">
                  <p v-if="form.id" class="page-header-context">编辑活动</p>
                  <h2 id="calendar-editor-title">{{ form.id ? (form.title || '未命名活动') : '新建活动' }}</h2>
                  <p class="calendar-hint calendar-draft-status">{{ dirty ? '有未保存修改' : '尚未修改' }}</p>
                </template>
                <template v-else>
                  <p class="page-header-context">来自招募卡池 · 只读</p>
                  <h2 id="calendar-editor-title">{{ readOnlyEntry.item.title }}</h2>
                </template>
              </div>
              <form v-if="form" class="calendar-form calendar-editor-form" novalidate @submit.prevent="save">
                <div ref="editorBody" class="calendar-editor-body">
                  <div v-if="error" ref="errorSummary" class="calendar-panel calendar-error" role="alert" tabindex="-1">
                    <p>{{ error }}</p>
                    <ul v-if="Object.keys(fieldErrors).length">
                      <li v-for="(message, key) in fieldErrors" :key="key"><a v-if="key !== 'version'" :href="'#calendar-' + key" @click.prevent="focusField(key)">{{ fieldLabels[key] }}：{{ message }}</a><span v-else>{{ message }}</span></li>
                    </ul>
                  </div>
                  <fieldset :disabled="saving">
                    <legend>活动信息</legend>
                    <div class="calendar-fields">
                      <label>游戏<select id="calendar-game" v-model="form.game" :aria-invalid="!!fieldErrors.game" :aria-describedby="fieldErrors.game ? 'error-game' : undefined"><option v-for="game in CALENDAR_GAMES" :key="game">{{ game }}</option></select><small v-if="fieldErrors.game" id="error-game">{{ fieldErrors.game }}</small></label>
                      <CalendarClassificationFields :form="form" :errors="fieldErrors" />
                      <label v-for="field in basicFields" :key="field.key" :class="{ 'calendar-wide': field.key === 'title' }">{{ field.label }}
                        <input :id="'calendar-' + field.key" v-model="form[field.key]" :type="field.type" :maxlength="field.max" :aria-invalid="!!fieldErrors[field.key]" :aria-describedby="fieldErrors[field.key] ? 'error-' + field.key : field.key === 'end_date' ? 'calendar-end-date-hint' : undefined" :required="field.key !== 'end_date'">
                        <small v-if="field.key === 'end_date'" id="calendar-end-date-hint">留空表示持续进行，后续可补填。</small>
                        <small v-if="fieldErrors[field.key]" :id="'error-' + field.key">{{ fieldErrors[field.key] }}</small>
                      </label>
                    </div>
                    <label class="calendar-checkbox"><input v-model="form.precise" type="checkbox">填写精确时间</label>
                    <p class="calendar-hint">日期和时间按 {{ form.time_zone }} 记录；未填写时间时不补造具体时刻。</p>
                    <div v-if="form.precise" class="calendar-fields">
                      <label v-for="key in (form.end_date ? ['start_time', 'end_time'] : ['start_time'])" :key="key">{{ fieldLabels[key] }}<input :id="'calendar-' + key" v-model="form[key]" type="time" required :aria-invalid="!!fieldErrors[key]" :aria-describedby="fieldErrors[key] ? 'error-' + key : undefined"><small v-if="fieldErrors[key]" :id="'error-' + key">{{ fieldErrors[key] }}</small></label>
                    </div>
                    <div class="calendar-fields">
                      <label class="calendar-wide">简短说明<textarea id="calendar-description" v-model="form.description" rows="3" maxlength="1000" :aria-invalid="!!fieldErrors.description" :aria-describedby="fieldErrors.description ? 'error-description' : undefined"></textarea><small v-if="fieldErrors.description" id="error-description">{{ fieldErrors.description }}</small></label>
                      <label class="calendar-wide">来源链接<input id="calendar-source_url" v-model.trim="form.source_url" type="url" maxlength="2048" placeholder="https://…" :aria-invalid="!!fieldErrors.source_url" :aria-describedby="fieldErrors.source_url ? 'error-source_url' : undefined"><small v-if="fieldErrors.source_url" id="error-source_url">{{ fieldErrors.source_url }}</small></label>
                      <label class="calendar-wide">来源备注（仅管理端）<textarea id="calendar-source_note" v-model="form.source_note" rows="2" maxlength="1000" :aria-invalid="!!fieldErrors.source_note" :aria-describedby="fieldErrors.source_note ? 'error-source_note' : undefined"></textarea><small v-if="fieldErrors.source_note" id="error-source_note">{{ fieldErrors.source_note }}</small></label>
                    </div>
                    <label class="calendar-checkbox"><input v-model="form.enabled" type="checkbox">启用活动（取消后不在公共日历展示）</label>
                  </fieldset>
                </div>
                <footer class="calendar-editor-footer">
                  <p v-if="notice" role="status">{{ notice }}</p>
                  <div class="calendar-actions"><button type="submit" class="calendar-primary" :disabled="saving || conflict">{{ saving ? '保存中…' : '保存活动' }}</button><button v-if="conflict" type="button" @click="requestClose(true)">返回目录并刷新</button><button type="button" :disabled="saving" @click="requestClose()">取消编辑</button></div>
                </footer>
              </form>
              <div v-else ref="editorBody" class="calendar-editor-body">
                <div class="calendar-badges"><span class="calendar-game">{{ readOnlyEntry.item.game }}</span><span class="calendar-category">{{ calendarDisplay(readOnlyEntry.item).path }}</span><span class="calendar-state">{{ readOnlyEntry.enabled ? '已启用' : '已停用' }}</span></div>
                <p class="calendar-range">{{ calendarRangeLabel(readOnlyEntry.item) }} · {{ readOnlyEntry.item.time_zone }}</p>
                <p v-if="readOnlyEntry.item.description" class="calendar-description">{{ readOnlyEntry.item.description }}</p>
                <p class="calendar-hint">最近修改：{{ modifiedLabel(readOnlyEntry.updated_at) }}</p>
                <p v-if="readOnlyEntry.source_note" class="calendar-hint">来源备注：{{ readOnlyEntry.source_note }}</p>
                <router-link v-if="canManageRecruitment" class="calendar-source-link" to="/recruitment/admin">去招募卡池管理 <ExternalLink :size="16" aria-hidden="true" /></router-link>
                <p v-else class="calendar-hint">请由有招募卡池管理权限的成员维护。</p>
              </div>
            </section>
            <p v-else-if="!compact" class="calendar-panel calendar-catalog-empty">选择左侧活动进行编辑，或新建活动</p>
          </div>
          </template>
        </template>
      </div>
      <SiteFooter />
      <CalendarClassificationImportDialog v-if="permitted && classificationImporting" :key="identity" @close="classificationImporting = false" @updated="load()" />
      <CalendarImportDialog v-if="permitted && importing" :key="identity" @close="importing = false" @imported="load()" />
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ExternalLink, ArrowLeft } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import '@/styles/page-header.css'
import CalendarSuggestionsReview from '@/components/calendar/CalendarSuggestionsReview.vue'
import CalendarClassificationFields from '@/components/calendar/CalendarClassificationFields.vue'
import { CALENDAR_DISPLAY_GROUPS, calendarDisplay } from '@/data/activityCalendarTypes.js'
import CalendarClassificationImportDialog from '@/components/calendar/CalendarClassificationImportDialog.vue'
import { downloadClassification } from '@/data/activityCalendarClassificationExchange.js'
import CalendarImportDialog from '@/components/calendar/CalendarImportDialog.vue'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '@/utils/authPermissions.js'
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
import { dialog } from '@/utils/dialog.js'
import { createActivityCalendar, listAdminActivityCalendar, updateActivityCalendar, exportActivityCalendar } from '@/api/activityCalendar.js'
import { CALENDAR_GAMES, calendarForm, calendarPayload, calendarRangeLabel, isCalendarDate, normalizeCalendarItem, validateCalendarForm } from '@/data/activityCalendar.js'

const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permitted = computed(() => enabled && !!identity.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ACTIVITY_CALENDAR_WRITE))
const canManageRecruitment = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.RECRUITMENT_CATALOG_WRITE))
const filters = reactive({ game: '', category: '', enabled: '', from: '', to: '', search: '' })
const workspace = ref('directory'), suggestionsReview = ref(null)
const importing = ref(false), classificationImporting = ref(false), exporting = ref(false), displayGroup = ref('')
const entries = ref([]), form = ref(null), baseline = ref(''), originalEnabled = ref(true)
const readOnlyEntry = ref(null)
const selectedId = computed(() => form.value?.id || readOnlyEntry.value?.item.id)
const editing = computed(() => !!(form.value || readOnlyEntry.value))
const media = window.matchMedia('(max-width: 1080px)')
const compact = ref(media.matches)
const showDirectory = computed(() => !compact.value || !editing.value)
let listScrollY = 0
const sortOrder = ref('desc')
const sortedEntries = computed(() => entries.value.filter(entry => !displayGroup.value || calendarDisplay(entry.item).group === displayGroup.value).sort((a, b) => {
  const order = a.item.start_date.localeCompare(b.item.start_date) || (a.item.start_time || '').localeCompare(b.item.start_time || '')
  return order * (sortOrder.value === 'asc' ? 1 : -1) || a.item.id.localeCompare(b.item.id)
}))
const loading = ref(false), saving = ref(false), error = ref(''), notice = ref(''), fieldErrors = ref({}), conflict = ref(false)
const listError = ref(''), listErrorSummary = ref(null)
const errorSummary = ref(null), editor = ref(null), editorBody = ref(null), listRegion = ref(null), newButton = ref(null)
const dirty = computed(() => !!form.value && JSON.stringify(form.value) !== baseline.value)
const confirmDiscard = useUnsavedChanges(dirty, '活动修改')
const fieldLabels = { game: '游戏', category: '展示分组', subtype: '细分类别', subtype_detail: '关联细目', title: '标题', start_date: '开始日期', end_date: '结束日期', start_time: '开始时间', end_time: '结束时间', description: '简短说明', source_url: '来源链接', source_note: '来源备注' }
const basicFields = [{ key: 'title', label: '标题', type: 'text', max: 120 }, { key: 'start_date', label: '开始日期', type: 'date' }, { key: 'end_date', label: '结束日期', type: 'date' }]
let generation = 0, readGeneration = 0, alive = true
const capture = () => ({ generation, identity: identity.value })
const current = token => alive && permitted.value && token.generation === generation && token.identity === identity.value
function modifiedLabel(value) {
  if (!value) return '暂无记录'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(date) + '（服务器时间）' : '暂无记录'
}
async function showError(message) { error.value = message; await nextTick(); errorSummary.value?.focus() }
function focusField(key) { document.getElementById('calendar-' + key)?.focus() }
function resetEditor() {
  form.value = null; readOnlyEntry.value = null; baseline.value = ''
  fieldErrors.value = {}; error.value = ''; conflict.value = false; notice.value = ''
}
async function restoreListScroll(id, token) {
  await nextTick()
  if (!current(token) || workspace.value !== 'directory' || editing.value) return
  if (compact.value) window.scrollTo({ top: listScrollY, behavior: 'instant' })
  const index = sortedEntries.value.findIndex(entry => entry.item.id === id)
  const row = listRegion.value?.querySelectorAll('.calendar-catalog-row')[index]
  const target = id ? row : newButton.value
  const focusTarget = target && !target.disabled ? target : listRegion.value
  focusTarget?.focus({ preventScroll: true })
}
async function requestClose(refresh = false) {
  if (saving.value) return
  const token = capture()
  if (!await confirmDiscard() || !current(token) || saving.value) return
  const id = selectedId.value
  resetEditor()
  const refreshRequest = refresh ? load() : null
  await restoreListScroll(id, token)
  if (refreshRequest) {
    await refreshRequest
    await restoreListScroll(id, token)
  }
}
async function switchWorkspace(value) {
  if (value === workspace.value || saving.value) return
  const token = capture()
  if (workspace.value === 'directory' && !await confirmDiscard()) return
  if (workspace.value === 'suggestions' && !await suggestionsReview.value?.requestClose()) return
  if (!current(token) || saving.value) return
  resetEditor()
  workspace.value = value
  if (value === 'directory') await load()
}
function setForm(entry) {
  form.value = calendarForm(entry)
  if (!entry && filters.game) form.value.game = filters.game
  baseline.value = JSON.stringify(form.value)
  originalEnabled.value = entry?.enabled !== false
}
async function open(entry = null) {
  if (!permitted.value || saving.value || loading.value) return
  if (entry && selectedId.value === entry.item.id) {
    editor.value?.focus({ preventScroll: true })
    return
  }
  const token = capture()
  if (!await confirmDiscard() || !current(token) || saving.value || loading.value || workspace.value !== 'directory') return
  if (compact.value && !editing.value) listScrollY = window.scrollY
  resetEditor()
  if (entry?.read_only) readOnlyEntry.value = entry
  else setForm(entry)
  await nextTick()
  if (!current(token) || workspace.value !== 'directory') return
  if (editorBody.value) editorBody.value.scrollTop = 0
  if (compact.value) editor.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
  editor.value?.focus({ preventScroll: true })
}
async function clearFilters() { Object.keys(filters).forEach(key => { filters[key] = '' }); sortOrder.value = 'desc'; displayGroup.value = ''; await load() }
async function exportAll() {
  if (!permitted.value || exporting.value) return
  const token = capture()
  exporting.value = true; listError.value = ''
  try {
    const result = await exportActivityCalendar()
    if (current(token)) downloadClassification(result)
  } catch (err) { if (current(token)) await showListError(err.message || '导出失败，请重试。', token) }
  finally { if (current(token)) exporting.value = false }
}
async function showListError(message, token, focus = true) {
  listError.value = message
  await nextTick()
  if (focus && current(token) && workspace.value === 'directory' && showDirectory.value) listErrorSummary.value?.focus()
}
function normalizeEntry(entry) {
  const item = normalizeCalendarItem(entry?.item)
  return item ? { ...entry, item, read_only: entry.read_only === true || item.source_type === 'RECRUITMENT_POOL' } : null
}
async function load(afterSave = false) {
  if (!permitted.value || (saving.value && !afterSave) || workspace.value !== 'directory') return
  const token = capture(), read = ++readGeneration
  listError.value = ''
  if ((filters.from && !isCalendarDate(filters.from)) || (filters.to && !isCalendarDate(filters.to)) || (filters.from && filters.to && filters.to < filters.from)) {
    loading.value = false
    if (!afterSave) entries.value = []
    await showListError('请填写有效日期范围，终点不能早于起点。', token, !afterSave)
    return
  }
  loading.value = true
  try {
    const result = await listAdminActivityCalendar({ ...filters })
    if (!current(token) || read !== readGeneration) return
    entries.value = (result?.items || []).map(normalizeEntry).filter(Boolean)
    return entries.value
  } catch (err) {
    if (current(token) && read === readGeneration) {
      if (!afterSave) entries.value = []
      await showListError(err.message || '活动目录读取失败，请筛选 / 刷新后重试。', token, !afterSave)
    }
  } finally { if (current(token) && read === readGeneration) loading.value = false }
}
async function save() {
  if (!permitted.value || !form.value || saving.value || conflict.value) return
  fieldErrors.value = validateCalendarForm(form.value)
  if (Object.keys(fieldErrors.value).length) { await showError('请检查以下字段后再保存。'); return }
  const token = capture(), draft = form.value
  saving.value = true; error.value = ''; notice.value = ''
  try {
    if (originalEnabled.value && !draft.enabled) {
      const confirmed = await dialog.confirm({ title: '停用这个活动？', message: '停用后公共日历将不再展示，活动和历史记录仍会保留。', type: 'danger', confirmText: '确认停用', cancelText: '继续编辑' })
      if (!confirmed || !current(token) || draft !== form.value) return
    }
    const body = calendarPayload(draft)
    const result = draft.id ? await updateActivityCalendar(draft.id, body) : await createActivityCalendar(body)
    if (!current(token)) return
    const id = draft.id || result?.item?.id || result?.id
    baseline.value = JSON.stringify(draft)
    const refreshed = await load(true)
    if (!current(token)) return
    // 保存后活动可能被当前筛选排除，仍可用服务器返回的新版本继续编辑。
    const savedEntry = id && (refreshed?.find(entry => entry.item.id === id) || normalizeEntry(result))
    resetEditor()
    if (!compact.value && savedEntry && !savedEntry.read_only) setForm(savedEntry)
    notice.value = '活动已保存。'
    if (!form.value) await restoreListScroll(id, token)
  } catch (err) {
    if (!current(token)) return
    if (err.status === 409) { conflict.value = true; await showError('内容已被其他人修改，请刷新后重试。') }
    else await showError(err.message || '活动保存失败，请检查后重试。')
  } finally { if (current(token)) saving.value = false }
}
watch([identity, permitted], () => {
  importing.value = false; classificationImporting.value = false; exporting.value = false
  generation++; readGeneration++
  resetEditor()
  entries.value = []; loading.value = false; saving.value = false; listError.value = ''; listScrollY = 0
  if (permitted.value) void load()
}, { immediate: true })
function onMediaChange(event) {
  if (event.matches) listScrollY = window.scrollY
  compact.value = event.matches
}
media.addEventListener('change', onMediaChange)
onBeforeUnmount(() => {
  media.removeEventListener('change', onMediaChange)
  alive = false; generation++; readGeneration++
})
</script>

<style src="./calendar.css"></style>
<style src="./calendarDesktop.css"></style>
<style src="./calendarMobile.css"></style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.calendar-editor-identity h2 { color: var(--theme-strong-text, var(--tea)); }
.calendar-admin :is(button,a):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
.calendar-admin .calendar-catalog-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3px;
  width: 100%;
  min-width: 0;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
  font-weight: 400;
}
.calendar-catalog-row strong { font: 800 17px/1.4 var(--font-s); }
.calendar-catalog-row :is(.calendar-range, .calendar-hint) { margin: 0; }
.calendar-catalog-row .calendar-hint { font-size: 12px; }
.calendar-catalog-row .calendar-catalog-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.calendar-admin .calendar-catalog-row[aria-current="true"] {
  background: var(--cream);
  border-color: var(--theme-focus, var(--accent));
  box-shadow: inset 3px 0 var(--theme-focus, var(--accent));
}
.calendar-admin .calendar-catalog-row:focus-visible { outline-offset: -3px; }
.calendar-editor-body > .calendar-error { margin-bottom: 12px; }
.calendar-editor-identity .calendar-draft-status { margin: 0; }
</style>
<style scoped src="./calendarAdminDesktop.css"></style>
<style scoped src="./calendarAdminMobile.css"></style>
