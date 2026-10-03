<template>
  <div class="calendar-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="calendar-header wrap">
        <AdminBackLink />
        <h1>活动日历管理</h1>
        <p>维护公共活动日程。招募活动自动来自招募卡池，停用手工活动会保留历史记录。</p>
      </header>
      <div class="wrap calendar-content">
        <p v-if="!permitted" class="calendar-panel" role="alert">需要活动日历维护权限。</p>
        <template v-else>
          <nav class="calendar-actions calendar-workspace-nav" aria-label="活动管理工作区"><button type="button" :aria-pressed="workspace === 'directory'" @click="switchWorkspace('directory')">活动目录</button><button type="button" :aria-pressed="workspace === 'suggestions'" @click="switchWorkspace('suggestions')">用户建议</button></nav>
          <CalendarSuggestionsReview v-if="workspace === 'suggestions'" ref="suggestionsReview" />
          <template v-else>
          <div v-if="error" ref="errorSummary" class="calendar-panel calendar-error" role="alert" tabindex="-1">
            <p>{{ error }}</p>
            <ul v-if="form && Object.keys(fieldErrors).length">
              <li v-for="(message, key) in fieldErrors" :key="key"><a v-if="key !== 'version'" :href="'#calendar-' + key" @click.prevent="focusField(key)">{{ fieldLabels[key] }}：{{ message }}</a><span v-else>{{ message }}</span></li>
            </ul>
          </div>
          <p v-if="notice" class="calendar-panel" role="status">{{ notice }}</p>

          <section v-if="!form" ref="listRegion" class="calendar-list" aria-labelledby="calendar-list-title" tabindex="-1">
            <header class="calendar-workspace-head">
              <h2 id="calendar-list-title">活动目录</h2>
              <button type="button" class="calendar-primary" :disabled="loading" @click="openNew">新建活动</button>
            </header>
            <form class="calendar-panel calendar-form" @submit.prevent="load">
              <div class="calendar-fields">
                <label>游戏<select v-model="filters.game"><option value="">全部游戏</option><option v-for="game in CALENDAR_GAMES" :key="game">{{ game }}</option></select></label>
                <label>类型<select v-model="filters.category"><option value="">全部类型</option><option v-for="(label, key) in CALENDAR_CATEGORIES" :key="key" :value="key">{{ label }}</option></select></label>
                <label>启用状态<select v-model="filters.enabled"><option value="">全部状态</option><option value="true">已启用</option><option value="false">已停用</option></select></label>
                <label>搜索标题<input v-model.trim="filters.search" type="search" maxlength="120" placeholder="输入活动标题"></label>
                <label>日期范围起点<input v-model="filters.from" type="date"></label>
                <label>日期范围终点<input v-model="filters.to" type="date" :min="filters.from || undefined"></label>
              </div>
              <div class="calendar-actions"><button type="submit" :disabled="loading">{{ loading ? '读取中…' : '筛选 / 刷新' }}</button><button type="button" :disabled="loading" @click="clearFilters">清空筛选</button></div>
            </form>
            <p v-if="loading" role="status">正在读取活动目录…</p>
            <p v-else-if="!entries.length && !error" class="calendar-panel">没有符合条件的活动。</p>
            <article v-for="entry in entries" :key="entry.item.id" class="calendar-panel">
              <div class="calendar-badges"><span class="calendar-game">{{ entry.item.game }}</span><span class="calendar-category">{{ CALENDAR_CATEGORIES[entry.item.category] }}</span><span class="calendar-state">{{ entry.enabled ? '已启用' : '已停用' }}</span></div>
              <h3>{{ entry.item.title }}</h3>
              <p class="calendar-range">{{ calendarRangeLabel(entry.item) }}<span v-if="entry.item.start_time"> · {{ entry.item.time_zone }}</span></p>
              <p class="calendar-hint">{{ entry.read_only ? '来自招募卡池 · 只读' : '手工整理' }} · 最近修改：{{ modifiedLabel(entry.updated_at) }}</p>
              <p v-if="entry.source_note" class="calendar-hint">来源备注：{{ entry.source_note }}</p>
              <div class="calendar-actions">
                <template v-if="entry.read_only"><router-link v-if="canManageRecruitment" class="calendar-source-link" to="/recruitment/admin">去招募卡池管理 <ExternalLink :size="16" aria-hidden="true" /></router-link><p v-else class="calendar-hint">请由有招募卡池管理权限的成员维护。</p></template>
                <button v-else type="button" :disabled="loading" @click="openEdit(entry)">编辑活动</button>
              </div>
            </article>
          </section>

          <section v-else ref="editor" class="calendar-editor" aria-labelledby="calendar-editor-title" tabindex="-1">
            <div class="calendar-workspace-head">
              <button type="button" :disabled="saving" @click="requestClose">返回活动目录</button>
              <span class="calendar-hint">{{ dirty ? '有未保存修改' : '尚未修改' }}</span>
            </div>
            <h2 id="calendar-editor-title">{{ form.id ? '编辑活动' : '新建活动' }}</h2>
            <form class="calendar-panel calendar-form" novalidate @submit.prevent="save">
              <fieldset :disabled="saving">
                <legend>活动信息</legend>
                <div class="calendar-fields">
                  <label>游戏<select id="calendar-game" v-model="form.game" :aria-invalid="!!fieldErrors.game" :aria-describedby="fieldErrors.game ? 'error-game' : undefined"><option v-for="game in CALENDAR_GAMES" :key="game">{{ game }}</option></select><small v-if="fieldErrors.game" id="error-game">{{ fieldErrors.game }}</small></label>
                  <label>类型<select id="calendar-category" v-model="form.category" :aria-invalid="!!fieldErrors.category" :aria-describedby="fieldErrors.category ? 'error-category' : undefined"><option v-for="(label, key) in MANUAL_CATEGORIES" :key="key" :value="key">{{ label }}</option></select><small v-if="fieldErrors.category" id="error-category">{{ fieldErrors.category }}</small></label>
                  <label v-for="field in basicFields" :key="field.key" :class="{ 'calendar-wide': field.key === 'title' }">{{ field.label }}
                    <input :id="'calendar-' + field.key" v-model="form[field.key]" :type="field.type" :maxlength="field.max" :aria-invalid="!!fieldErrors[field.key]" :aria-describedby="fieldErrors[field.key] ? 'error-' + field.key : undefined" required>
                    <small v-if="fieldErrors[field.key]" :id="'error-' + field.key">{{ fieldErrors[field.key] }}</small>
                  </label>
                </div>
                <label class="calendar-checkbox"><input v-model="form.precise" type="checkbox">填写精确时间（开始、结束成对）</label>
                <p class="calendar-hint">日期和时间按 {{ form.time_zone }} 记录；未填写时间时不补造具体时刻。</p>
                <div v-if="form.precise" class="calendar-fields">
                  <label v-for="key in ['start_time', 'end_time']" :key="key">{{ fieldLabels[key] }}<input :id="'calendar-' + key" v-model="form[key]" type="time" required :aria-invalid="!!fieldErrors[key]" :aria-describedby="fieldErrors[key] ? 'error-' + key : undefined"><small v-if="fieldErrors[key]" :id="'error-' + key">{{ fieldErrors[key] }}</small></label>
                </div>
                <div class="calendar-fields">
                  <label class="calendar-wide">简短说明<textarea id="calendar-description" v-model="form.description" rows="3" maxlength="1000" :aria-invalid="!!fieldErrors.description" :aria-describedby="fieldErrors.description ? 'error-description' : undefined"></textarea><small v-if="fieldErrors.description" id="error-description">{{ fieldErrors.description }}</small></label>
                  <label class="calendar-wide">来源链接<input id="calendar-source_url" v-model.trim="form.source_url" type="url" maxlength="2048" placeholder="https://…" :aria-invalid="!!fieldErrors.source_url" :aria-describedby="fieldErrors.source_url ? 'error-source_url' : undefined"><small v-if="fieldErrors.source_url" id="error-source_url">{{ fieldErrors.source_url }}</small></label>
                  <label class="calendar-wide">来源备注（仅管理端）<textarea id="calendar-source_note" v-model="form.source_note" rows="2" maxlength="1000" :aria-invalid="!!fieldErrors.source_note" :aria-describedby="fieldErrors.source_note ? 'error-source_note' : undefined"></textarea><small v-if="fieldErrors.source_note" id="error-source_note">{{ fieldErrors.source_note }}</small></label>
                </div>
                <label class="calendar-checkbox"><input v-model="form.enabled" type="checkbox">启用活动（取消后不在公共日历展示）</label>
              </fieldset>
              <div class="calendar-actions"><button type="submit" class="calendar-primary" :disabled="saving || conflict">{{ saving ? '保存中…' : '保存活动' }}</button><button v-if="conflict" type="button" @click="refreshAfterConflict">返回目录并刷新</button><button type="button" :disabled="saving" @click="requestClose">取消编辑</button></div>
            </form>
          </section>
          </template>
        </template>
      </div>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ExternalLink } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import AdminBackLink from '@/components/admin/AdminBackLink.vue'
import CalendarSuggestionsReview from '@/components/calendar/CalendarSuggestionsReview.vue'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '@/utils/authPermissions.js'
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
import { dialog } from '@/utils/dialog.js'
import { createActivityCalendar, listAdminActivityCalendar, updateActivityCalendar } from '@/api/activityCalendar.js'
import { CALENDAR_CATEGORIES, CALENDAR_GAMES, MANUAL_CATEGORIES, calendarForm, calendarPayload, calendarRangeLabel, isCalendarDate, normalizeCalendarItem, validateCalendarForm } from '@/data/activityCalendar.js'
import './calendar.css'

const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permitted = computed(() => enabled && !!identity.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ACTIVITY_CALENDAR_WRITE))
const canManageRecruitment = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.RECRUITMENT_CATALOG_WRITE))
const filters = reactive({ game: '', category: '', enabled: '', from: '', to: '', search: '' })
const workspace = ref('directory'), suggestionsReview = ref(null)
const entries = ref([]), form = ref(null), baseline = ref(''), originalEnabled = ref(true)
const loading = ref(false), saving = ref(false), error = ref(''), notice = ref(''), fieldErrors = ref({}), conflict = ref(false)
const errorSummary = ref(null), editor = ref(null), listRegion = ref(null)
const dirty = computed(() => !!form.value && JSON.stringify(form.value) !== baseline.value)
const confirmDiscard = useUnsavedChanges(dirty, '活动修改')
const fieldLabels = { game: '游戏', category: '类型', title: '标题', start_date: '开始日期', end_date: '结束日期', start_time: '开始时间', end_time: '结束时间', description: '简短说明', source_url: '来源链接', source_note: '来源备注' }
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
async function closeEditor() {
  form.value = null; baseline.value = ''; fieldErrors.value = {}; error.value = ''; conflict.value = false
  await nextTick(); listRegion.value?.focus()
}
async function requestClose() {
  if (saving.value) return false
  const token = capture()
  if (await confirmDiscard() && current(token)) { await closeEditor(); return true }
  return false
}
async function switchWorkspace(value) {
  if (value === workspace.value || saving.value) return
  const token = capture()
  if (workspace.value === 'directory' && form.value && !await requestClose()) return
  if (workspace.value === 'suggestions' && !await suggestionsReview.value?.requestClose()) return
  if (!current(token)) return
  workspace.value = value
  if (value === 'directory') await load()
}
async function refreshAfterConflict() { if (await requestClose()) await load() }
async function open(entry = null) {
  if (!permitted.value || saving.value || loading.value || entry?.read_only || entry?.item?.source_type === 'RECRUITMENT_POOL') return
  form.value = calendarForm(entry)
  if (!entry && filters.game) form.value.game = filters.game
  baseline.value = JSON.stringify(form.value); originalEnabled.value = entry?.enabled !== false
  error.value = ''; notice.value = ''; fieldErrors.value = {}; conflict.value = false
  await nextTick(); editor.value?.focus()
}
const openNew = () => open()
const openEdit = entry => open(entry)
async function clearFilters() { Object.keys(filters).forEach(key => { filters[key] = '' }); await load() }
async function load() {
  if (!permitted.value || form.value || workspace.value !== 'directory') return
  const token = capture(), read = ++readGeneration
  error.value = ''; entries.value = []
  if ((filters.from && !isCalendarDate(filters.from)) || (filters.to && !isCalendarDate(filters.to)) || (filters.from && filters.to && filters.to < filters.from)) {
    loading.value = false; await showError('请填写有效日期范围，终点不能早于起点。'); return
  }
  loading.value = true
  try {
    const result = await listAdminActivityCalendar({ ...filters })
    if (!current(token) || read !== readGeneration) return
    entries.value = (result?.items || []).flatMap(entry => {
      const item = normalizeCalendarItem(entry.item)
      return item ? [{ ...entry, item, read_only: entry.read_only === true || item.source_type === 'RECRUITMENT_POOL' }] : []
    })
  } catch (err) {
    if (current(token) && read === readGeneration) await showError(err.message || '活动目录读取失败，请筛选 / 刷新后重试。')
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
    if (draft.id) await updateActivityCalendar(draft.id, body)
    else await createActivityCalendar(body)
    if (!current(token)) return
    await closeEditor()
    if (!current(token)) return
    notice.value = '活动已保存。'
    await load()
  } catch (err) {
    if (!current(token)) return
    if (err.status === 409) { conflict.value = true; await showError('内容已被其他人修改，请刷新后重试。') }
    else await showError(err.message || '活动保存失败，请检查后重试。')
  } finally { if (current(token)) saving.value = false }
}
watch([identity, permitted], () => {
  generation++; readGeneration++
  entries.value = []; form.value = null; baseline.value = ''; loading.value = false; saving.value = false; error.value = ''; notice.value = ''; fieldErrors.value = {}; conflict.value = false
  if (permitted.value) void load()
}, { immediate: true })
onBeforeUnmount(() => { alive = false; generation++; readGeneration++ })
</script>
