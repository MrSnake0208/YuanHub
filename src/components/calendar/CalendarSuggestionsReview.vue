<template>
  <section class="calendar-section" aria-label="用户活动建议审核">
    <div v-if="error" ref="errorSummary" class="calendar-panel calendar-error" role="alert" tabindex="-1"><h2>审核提示</h2><p>{{ error }}</p><ul v-if="Object.keys(fieldErrors).length"><li v-for="(message, key) in fieldErrors" :key="key"><a :href="'#review-' + key" @click.prevent="focusField(key)">{{ SUGGESTION_FIELD_LABELS[key] || key }}：{{ message }}</a></li></ul></div>
    <p v-if="notice" class="calendar-panel" role="status">{{ notice }}</p>
    <section v-if="!selectedId" ref="listRegion" class="calendar-list" tabindex="-1" aria-labelledby="review-list-title">
      <h2 id="review-list-title">用户建议</h2>
      <form class="calendar-panel calendar-form" @submit.prevent="page = 1; load()"><div class="calendar-fields"><label>游戏<select v-model="filters.game"><option value="">全部游戏</option><option v-for="game in CALENDAR_GAMES" :key="game">{{ game }}</option></select></label><label>状态<select v-model="filters.status"><option value="">全部状态</option><option v-for="(label, key) in SUGGESTION_STATUSES" :key="key" :value="key">{{ label }}</option></select></label></div><button type="submit" :disabled="loading">{{ loading ? '读取中…' : '筛选 / 刷新' }}</button></form>
      <p v-if="loading" role="status">正在读取建议队列…</p><p v-else-if="!entries.length && !error" class="calendar-panel">没有符合条件的建议。</p>
      <article v-for="entry in entries" :key="entry.id" class="calendar-panel"><div class="calendar-badges"><span class="calendar-game">{{ entry.original.game }}</span><span class="calendar-state">{{ SUGGESTION_STATUSES[entry.status] }}</span></div><h3>{{ entry.original.title }}</h3><p class="calendar-range">{{ calendarRangeLabel(entry.original) }}</p><p class="calendar-hint">提交时间：{{ suggestionTimestamp(entry.created_at) }}</p><button type="button" @click="openDetail(entry.id)">{{ entry.status === 'PENDING' ? '核对并审核' : '查看处理结果' }}</button></article>
      <nav class="calendar-actions" aria-label="审核队列分页"><button type="button" :disabled="loading || page <= 1" @click="changePage(-1)">上一页</button><span class="calendar-pagination" role="status">第 {{ page }} 页 · 共 {{ total }} 条</span><button type="button" :disabled="loading || page * pageSize >= total" @click="changePage(1)">下一页</button></nav>
    </section>
    <section v-else ref="editorRegion" class="calendar-editor" tabindex="-1" aria-labelledby="review-editor-title">
      <div class="calendar-workspace-head"><button type="button" :disabled="saving" @click="requestClose">返回建议队列</button><span v-if="dirty" class="calendar-hint">有未保存审核修改</span></div><h2 id="review-editor-title">核对活动建议</h2>
      <p v-if="detailLoading" role="status">正在读取提交资料…</p><button v-if="!detail && !detailLoading" type="button" @click="openDetail(selectedId)">重试读取详情</button>
      <div v-if="detail" class="calendar-review-columns">
        <CalendarSuggestionOriginal :suggestion="detail" />
        <form v-if="detail.status === 'PENDING' && form" class="calendar-panel calendar-form" novalidate @submit.prevent="review('accept')">
          <h3>修正后的活动资料</h3><p class="calendar-hint">采纳后直接启用。私人说明不会自动写入公开内容。</p>
          <fieldset :disabled="saving || !permitted"><legend>正式活动（* 为必填）</legend><CalendarSuggestionFields :form="form" :errors="fieldErrors" prefix="review-" /></fieldset>
          <CalendarSuggestionDuplicates :key="selectedId + ':' + generation" :form="form" :disabled="saving || !permitted" />
          <div class="calendar-fields"><label class="calendar-wide">审核说明（不采纳时必填，向提交人展示）<textarea id="review-review_note" v-model="reviewNote" rows="3" maxlength="1000" :disabled="saving" :aria-invalid="!!fieldErrors.review_note" :aria-describedby="fieldErrors.review_note ? 'review-error-review_note' : undefined"></textarea><small v-if="fieldErrors.review_note" id="review-error-review_note">{{ fieldErrors.review_note }}</small></label></div>
          <div class="calendar-actions"><button type="submit" class="calendar-primary" :disabled="saving || conflict || !permitted">{{ saving ? '处理中…' : '采纳并加入日历' }}</button><button type="button" :disabled="saving || conflict || !permitted" @click="review('reject')">不采纳</button><button v-if="conflict" type="button" :disabled="saving" @click="refreshStatus">保留草稿并刷新状态</button></div>
          <div v-if="refreshed" class="calendar-panel" role="status"><p>最新状态：{{ SUGGESTION_STATUSES[refreshed.status] }}。本页草稿仍保留，旧版本不能继续提交。</p><p v-if="refreshed.review_note">最新审核说明：{{ refreshed.review_note }}</p><button type="button" @click="replaceWithLatest">放弃草稿，打开最新结果</button></div>
        </form>
        <CalendarSuggestionResult v-else :suggestion="detail" />
      </div>
    </section>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import CalendarSuggestionFields from './CalendarSuggestionFields.vue'
import CalendarSuggestionOriginal from './CalendarSuggestionOriginal.vue'
import CalendarSuggestionResult from './CalendarSuggestionResult.vue'
import CalendarSuggestionDuplicates from './CalendarSuggestionDuplicates.vue'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '@/utils/authPermissions.js'
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
import { dialog } from '@/utils/dialog.js'
import { acceptActivityCalendarSuggestion, getActivityCalendarSuggestion, listAdminActivityCalendarSuggestions, rejectActivityCalendarSuggestion } from '@/api/activityCalendar.js'
import { CALENDAR_GAMES, calendarForm, calendarPayload, calendarRangeLabel, safeCalendarUrl, validateCalendarForm } from '@/data/activityCalendar.js'
import { SUGGESTION_FIELD_LABELS, SUGGESTION_STATUSES, suggestionTimestamp } from '@/data/activityCalendarSuggestions.js'
const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permitted = computed(() => enabled && !!identity.value && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ACTIVITY_CALENDAR_WRITE))
const filters = reactive({ game: '', status: 'PENDING' }), page = ref(1), pageSize = 20, entries = ref([]), total = ref(0)
const selectedId = ref(''), detail = ref(null), form = ref(null), reviewNote = ref(''), baseline = ref(''), refreshed = ref(null)
const loading = ref(false), detailLoading = ref(false), saving = ref(false), conflict = ref(false), error = ref(''), notice = ref(''), fieldErrors = ref({})
const errorSummary = ref(null), listRegion = ref(null), editorRegion = ref(null)
const serialized = () => JSON.stringify({ form: form.value, reviewNote: reviewNote.value })
const dirty = computed(() => !!form.value && (saving.value || serialized() !== baseline.value))
const confirmDiscard = useUnsavedChanges(dirty, '活动建议审核')
let generation = 0, readGeneration = 0, detailGeneration = 0, alive = true
const capture = () => ({ generation, identity: identity.value, selected: selectedId.value })
const current = token => alive && permitted.value && token.generation === generation && token.identity === identity.value
const currentSelection = token => current(token) && token.selected === selectedId.value
function focusField(key) { document.getElementById('review-' + key)?.focus() }
async function showError(message) { const token = capture(); error.value = message; await nextTick(); if (currentSelection(token) && error.value === message) errorSummary.value?.focus() }
async function load() {
  if (!permitted.value || selectedId.value) return
  const token = capture(), read = ++readGeneration
  loading.value = true; error.value = ''; entries.value = []
  try { const response = await listAdminActivityCalendarSuggestions({ ...filters, page: page.value, page_size: pageSize }); if (!current(token) || read !== readGeneration) return; entries.value = response.items || []; total.value = response.total || 0; const lastPage = Math.max(1, Math.ceil(total.value / pageSize)); if (page.value > lastPage) { page.value = lastPage; await load() } }
  catch (err) { if (current(token) && read === readGeneration) await showError(err.message || '审核队列读取失败。') }
  finally { if (current(token) && read === readGeneration) loading.value = false }
}
function applyDetail(response) {
  detail.value = response; conflict.value = false; refreshed.value = null; reviewNote.value = ''; fieldErrors.value = {}
  form.value = response.status === 'PENDING' ? calendarForm({ item: response.original, enabled: true }) : null
  baseline.value = serialized()
}
async function openDetail(id) {
  if (!permitted.value || saving.value) return
  const previous = capture()
  if (!await confirmDiscard() || !currentSelection(previous)) return
  readGeneration++; loading.value = false
  selectedId.value = id
  const token = capture(), read = ++detailGeneration
  detail.value = null; form.value = null; baseline.value = ''; error.value = ''; notice.value = ''; detailLoading.value = true
  await nextTick(); if (!currentSelection(token) || read !== detailGeneration) return; editorRegion.value?.focus()
  try { const response = await getActivityCalendarSuggestion(id); if (currentSelection(token) && read === detailGeneration) applyDetail(response) }
  catch (err) { if (currentSelection(token) && read === detailGeneration) await showError(err.message || '建议详情读取失败。') }
  finally { if (currentSelection(token) && read === detailGeneration) detailLoading.value = false }
}
async function closeEditor() { const token = capture(); detailGeneration++; selectedId.value = ''; detail.value = null; form.value = null; baseline.value = ''; reviewNote.value = ''; refreshed.value = null; conflict.value = false; error.value = ''; fieldErrors.value = {}; detailLoading.value = false; await nextTick(); if (current(token) && !selectedId.value) listRegion.value?.focus() }
async function requestClose() { if (saving.value) return false; const token = capture(); if (!await confirmDiscard() || !currentSelection(token)) return false; await closeEditor(); return true }
async function refreshStatus() {
  const token = capture(), read = ++detailGeneration
  detailLoading.value = true
  try { const response = await getActivityCalendarSuggestion(selectedId.value); if (currentSelection(token) && read === detailGeneration) refreshed.value = response }
  catch (err) { if (currentSelection(token) && read === detailGeneration) await showError(err.message || '刷新状态失败，草稿仍保留。') }
  finally { if (currentSelection(token) && read === detailGeneration) detailLoading.value = false }
}
async function replaceWithLatest() { const token = capture(); if (!await confirmDiscard() || !currentSelection(token) || !refreshed.value) return; applyDetail(refreshed.value); error.value = ''; await nextTick(); if (currentSelection(token)) editorRegion.value?.focus() }
async function changePage(offset) { const token = capture(); page.value += offset; await load(); await nextTick(); if (current(token) && !selectedId.value) listRegion.value?.focus() }
async function review(action) {
  if (!permitted.value || !form.value || !detail.value || saving.value || conflict.value || detail.value.status !== 'PENDING') return
  fieldErrors.value = action === 'accept' ? validateCalendarForm(form.value) : {}
  if (action === 'accept' && !safeCalendarUrl(form.value.source_url)) fieldErrors.value.source_url = '请填写可核对的 http/https 来源链接。'
  const note = reviewNote.value.trim()
  if ((action === 'reject' && !note) || note.length > 1000) fieldErrors.value.review_note = action === 'reject' ? '不采纳必须填写 1–1000 字的原因。' : '审核说明最多 1000 字。'
  if (!Number.isInteger(detail.value.version) || detail.value.version < 0) { conflict.value = true; await showError('版本信息缺失，请刷新状态。'); return }
  if (Object.keys(fieldErrors.value).length) { await showError('请检查以下字段后再审核。'); return }
  const token = capture(), draft = serialized(), version = detail.value.version
  const event = { ...calendarPayload(form.value), enabled: true }
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const confirmed = await dialog.confirm({ title: action === 'accept' ? '采纳并加入日历？' : '确认不采纳？', message: action === 'accept' ? '请核对来源、日期与已有活动。确认后将创建一条启用的正式活动，不能重新审核。' : '原因将向提交人展示，处理后不能重新审核。', confirmText: action === 'accept' ? '确认采纳' : '确认不采纳', cancelText: '继续核对', type: action === 'reject' ? 'danger' : 'info' })
    if (!confirmed || !currentSelection(token) || draft !== serialized()) return
    const body = { expected_version: version, review_note: note || null }
    const response = action === 'accept' ? await acceptActivityCalendarSuggestion(token.selected, { ...body, event }) : await rejectActivityCalendarSuggestion(token.selected, body)
    if (!currentSelection(token)) return
    baseline.value = serialized(); saving.value = false
    await closeEditor()
    if (!current(token)) return
    notice.value = action === 'accept' ? `建议已采纳，活动编号：${response.event_id || '已生成'}。` : '建议已标记为未采纳，原因已保存。'
    await load()
  } catch (err) {
    if (!currentSelection(token)) return
    if (err.status === 409) { conflict.value = true; await showError('建议状态或版本已变化。草稿已保留，请刷新状态后核对，不能重试旧版本。') }
    else await showError(err.message || '审核失败，草稿已保留，可以核对后重试。')
  } finally { if (currentSelection(token)) saving.value = false }
}
watch([identity, permitted], () => {
  generation++; readGeneration++; detailGeneration++; entries.value = []; total.value = 0; page.value = 1; selectedId.value = ''; detail.value = null; form.value = null; baseline.value = ''; reviewNote.value = ''; refreshed.value = null; loading.value = false; detailLoading.value = false; saving.value = false; conflict.value = false; error.value = ''; notice.value = ''; fieldErrors.value = {}
  if (permitted.value) void load()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { alive = false; generation++; readGeneration++; detailGeneration++ })
defineExpose({ requestClose })
</script>
