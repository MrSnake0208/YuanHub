<template>
  <div class="calendar-page calendar-community"><IslandSidebar /><main id="main-content">
    <header class="calendar-header wrap">
      <router-link class="calendar-source-link" to="/calendar">返回活动日历</router-link>
      <h1>建议补充活动</h1>
      <p>发现漏掉的游戏活动？提交资料，审核通过后会加入日历。</p>
      <nav class="calendar-submission-nav" aria-label="活动建议"><router-link to="/calendar/suggestions">我的建议</router-link></nav>
    </header>
    <div class="wrap calendar-content">
      <p v-if="!permitted" class="calendar-panel" role="alert">请登录后提交活动资料。</p>
      <section v-else-if="result" ref="successRegion" class="calendar-panel calendar-section" tabindex="-1" aria-labelledby="suggestion-success"><h2 id="suggestion-success">{{ SUGGESTION_STATUSES[result.status] }}：资料已提交</h2><p>建议编号：{{ result.id }}。提交后不能修改或撤回。</p><router-link class="calendar-source-link" :to="{ path: '/calendar/suggestions', query: { id: result.id } }">查看我的建议与审核结果</router-link><button type="button" @click="startAnother">再补充一条活动</button></section>
      <form v-else class="calendar-panel calendar-form" novalidate @submit.prevent="submit">
        <div v-if="error" ref="errorSummary" class="calendar-error" role="alert" tabindex="-1"><h2>请检查提交资料</h2><p>{{ error }}</p><ul v-if="Object.keys(fieldErrors).length"><li v-for="(message, key) in fieldErrors" :key="key"><a :href="'#suggestion-' + key" @click.prevent="focusField(key)">{{ SUGGESTION_FIELD_LABELS[key] }}：{{ message }}</a></li></ul></div>
        <p v-if="attempt" role="status">这次提交的资料和请求标识已保留。结果可能已保存，可重试相同资料，或先查看“我的建议”。</p>
        <fieldset :disabled="saving || !!attempt || !permitted"><legend>活动资料（* 为必填）</legend><CalendarSuggestionFields :form="form" :errors="fieldErrors" submission /></fieldset>
        <CalendarSuggestionDuplicates :key="identity" :form="form" :disabled="saving || !permitted" />
        <p class="calendar-hint">这里补充已经公布的活动信息；希望游戏举办新活动请使用反馈中心。私人说明只供核对，不会自动公开。</p>
        <div class="calendar-actions"><button type="submit" class="calendar-primary" :disabled="saving || !permitted">{{ saving ? '提交中…' : attempt ? '重试相同资料' : '提交资料，等待审核' }}</button><button v-if="attempt" type="button" :disabled="saving" @click="newAttempt">开始新的提交</button><router-link v-if="attempt" class="calendar-source-link" to="/calendar/suggestions">先查看我的建议</router-link></div>
      </form>
    </div><SiteFooter />
  </main></div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import CalendarSuggestionFields from '@/components/calendar/CalendarSuggestionFields.vue'
import CalendarSuggestionDuplicates from '@/components/calendar/CalendarSuggestionDuplicates.vue'
import { auth } from '@/store/auth.js'
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'
import { calendarFilters } from '@/data/activityCalendar.js'
import { SUGGESTION_FIELD_LABELS, SUGGESTION_STATUSES, suggestionForm, suggestionPayload, validateSuggestionForm } from '@/data/activityCalendarSuggestions.js'
import { submitActivityCalendarSuggestion } from '@/api/activityCalendar.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
import { dialog } from '@/utils/dialog.js'
import './calendar.css'
const route = useRoute()
const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permitted = computed(() => enabled && !!identity.value)
const form = ref(suggestionForm()), baseline = ref(''), result = ref(null), attempt = ref(null)
const saving = ref(false), error = ref(''), fieldErrors = ref({}), errorSummary = ref(null), successRegion = ref(null)
const dirty = computed(() => permitted.value && !result.value && (!!attempt.value || JSON.stringify(form.value) !== baseline.value))
useUnsavedChanges(dirty, '活动建议')
let generation = 0, alive = true
const capture = () => ({ generation, identity: identity.value })
const current = token => alive && permitted.value && token.generation === generation && token.identity === identity.value
function reset() { form.value = suggestionForm(calendarFilters(route.query).game); baseline.value = JSON.stringify(form.value); result.value = null; attempt.value = null; saving.value = false; error.value = ''; fieldErrors.value = {} }
function focusField(key) { document.getElementById('suggestion-' + key)?.focus() }
async function showError(message) { const token = capture(); error.value = message; await nextTick(); if (current(token) && error.value === message) errorSummary.value?.focus() }
async function startAnother() { const token = capture(); reset(); await nextTick(); if (current(token)) document.getElementById('suggestion-game')?.focus() }
async function newAttempt() {
  const token = capture()
  if (await dialog.confirm({ title: '开始新的提交？', message: '上次资料可能已经保存。建议先查看“我的建议”；新的提交会使用新的编号，可能重复。', confirmText: '开始新的提交', cancelText: '保留并重试' }) && current(token)) { attempt.value = null; error.value = ''; await nextTick(); if (current(token)) document.getElementById('suggestion-title')?.focus() }
}
async function submit() {
  if (!permitted.value || saving.value) return
  if (!attempt.value) {
    fieldErrors.value = validateSuggestionForm(form.value)
    if (Object.keys(fieldErrors.value).length) { await showError('请按字段提示补充后再提交。'); return }
    attempt.value = suggestionPayload(form.value, crypto.randomUUID())
  }
  const token = capture(), body = attempt.value
  saving.value = true; error.value = ''
  try {
    const response = await submitActivityCalendarSuggestion(body)
    if (!current(token)) return
    result.value = response; attempt.value = null
    await nextTick(); if (current(token)) successRegion.value?.focus()
  } catch (err) {
    if (!current(token)) return
    // A definite validation/auth rejection did not save this request; uncertain outcomes retain the exact payload.
    if ([400, 401, 403, 404, 422].includes(err.status)) attempt.value = null
    await showError(err.status === 409 ? '该请求编号已有不同资料。请先查看我的建议，再明确开始新的提交。' : err.message || '提交结果未知。资料已保留，请重试相同资料。')
  } finally { if (current(token)) saving.value = false }
}
watch(identity, () => { generation++; reset() }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { alive = false; generation++ })
</script>
