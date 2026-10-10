import { computed, onBeforeUnmount, provide, ref, watch } from 'vue'
import { createCalendarPrivateItem, deleteCalendarPrivateItem, getCalendarPrivateItem, listCalendarPrivateItems, updateCalendarPrivateItem } from '../api/calendarPrivateItems.js'
import { CALENDAR_PRIVATE_ITEMS, privateCalendarItem, privateItemForm, validatePrivateItem } from '../data/calendarPrivateItems.js'
import { dialog } from '../utils/dialog.js'
import { calendarRangeLabel, isCalendarDate } from '../data/activityCalendar.js'

export function useCalendarPrivateItems(subscriptions, range, mine) {
  let alive = true, generation = 0, epoch = 0, deferredLoad = false
  const records = ref([]), editor = ref(null), loading = ref(false), error = ref(''), notice = ref(''), busyId = ref(''), denied = ref(false)
  const dirty = computed(() => !!editor.value && JSON.stringify(editor.value.form) !== editor.value.original)
  const key = computed(() => JSON.stringify([subscriptions.key.value, subscriptions.epoch.value, mine.value]))
  const ready = computed(() => mine.value && subscriptions.permitted.value && !!subscriptions.account.value && !denied.value)
  const ticket = () => [key.value, epoch]
  const current = context => alive && ready.value && context[0] === key.value && context[1] === epoch
  watch(key, () => {
    epoch++; generation++; deferredLoad = false; records.value = []; editor.value = null; busyId.value = ''; error.value = ''; notice.value = ''; loading.value = false; denied.value = false
  }, { flush: 'sync' })
  function securityError(err) {
    if (![401, 403].includes(err?.status) && !(err?.status === 404 && err?.code === 'account_not_found')) return false
    denied.value = true; epoch++; generation++; records.value = []; editor.value = null; busyId.value = ''; loading.value = false
    error.value = '身份、权限或账号已失效，请重新登录或选择账号。'
    return true
  }
  async function load() {
    if (!ready.value) return
    if (dirty.value) { deferredLoad = true; return }
    deferredLoad = false
    const context = ticket(), token = ++generation, account = { ...subscriptions.account.value }, user = subscriptions.identity.value
    loading.value = !records.value.length; error.value = ''
    try {
      const result = await listCalendarPrivateItems({ account_id: account.id, ...range.value }, user)
      if (!current(context) || token !== generation) return
      if (dirty.value) { deferredLoad = true; return }
      const values = result?.items?.map(value => privateCalendarItem(value, account))
      if (!values || values.some(value => !value)) throw new Error('私人事项读取结果不完整，请重试。')
      records.value = values
    } catch (err) {
      if (current(context) && token === generation) {
        if (!securityError(err)) error.value = err?.message || '私人事项读取失败，请重试。'
      }
    } finally { if (current(context) && token === generation) loading.value = false }
  }
  watch(key, load, { immediate: true, flush: 'sync' })
  watch(dirty, value => { if (!value && deferredLoad) void load() })
  async function open(record, date) {
    const context = ticket()
    if (!current(context) || busyId.value || editor.value?.busy || record && !privateCalendarItem(record, subscriptions.account.value)) return
    if (!await subscriptions.confirmDiscard() || !current(context)) return
    if (subscriptions.dirty.value) subscriptions.discardDrafts()
    const form = privateItemForm(record, date)
    editor.value = { record, form, original: JSON.stringify(form), errors: {}, error: '', conflict: false, busy: false }
    notice.value = ''
  }
  async function close() {
    const context = ticket(), previous = editor.value
    if (!previous || previous.busy || !await subscriptions.confirmDiscard() || !current(context) || editor.value !== previous) return
    editor.value = null
  }
  function setDate(field, value) {
    const draft = editor.value
    if (!draft || draft.busy) return
    draft.form[field] = value
    if (field === 'end_date') draft.endDateEdited = true
    if (field === 'start_date' && !draft.record && !draft.endDateEdited && isCalendarDate(value) && value > draft.form.end_date) draft.form.end_date = value
    const errors = validatePrivateItem(draft.form)
    for (const key of ['start_date', 'end_date']) {
      if (errors[key]) draft.errors[key] = errors[key]
      else delete draft.errors[key]
    }
  }
  function accept(value) {
    generation++; loading.value = false; error.value = ''
    records.value = records.value.filter(item => item.id !== value.id)
    if (value.start_date <= range.value.to && value.end_date >= range.value.from) records.value.push(value)
  }
  async function save() {
    const draft = editor.value, context = ticket()
    if (!draft || draft.busy || !current(context)) return false
    draft.errors = validatePrivateItem(draft.form)
    if (Object.keys(draft.errors).length) return false
    draft.busy = true; draft.error = ''; draft.conflict = false
    const account = { ...subscriptions.account.value }, user = subscriptions.identity.value
    const body = { account_id: account.id, title: draft.form.title.trim(), start_date: draft.form.start_date, end_date: draft.form.end_date, time: draft.form.time || null, note: draft.form.note }
    try {
      const raw = draft.record
        ? await updateCalendarPrivateItem(draft.record.id, { ...body, expected_version: draft.record.version }, user)
        : await createCalendarPrivateItem(body, user)
      if (!current(context) || editor.value !== draft) return false
      const result = privateCalendarItem(raw, account)
      if (!result || draft.record && (result.id !== draft.record.id || result.version <= draft.record.version)) throw new Error('保存结果需要确认，请读取最新内容。')
      accept(result); editor.value = null
      notice.value = `已保存私人事项 · ${calendarRangeLabel(result)}`
      if (result.end_date < range.value.from || result.start_date > range.value.to) notice.value += '。该区间不在当前日期范围，请在月历或时间轴选择覆盖日期查看。'
      return true
    } catch (err) {
      if (current(context) && editor.value === draft && !securityError(err)) {
        draft.error = err?.status === 409 ? '事项已被修改，草稿仍保留。请读取最新内容后重新编辑。' : err?.message || '保存失败，草稿仍保留，请重试。'
        draft.conflict = err?.status === 409
      }
      return false
    } finally { if (editor.value === draft) draft.busy = false }
  }
  async function reloadEditor() {
    const draft = editor.value, context = ticket()
    if (!draft?.record || draft.busy || !await subscriptions.confirmDiscard() || !current(context) || editor.value !== draft) return
    draft.busy = true
    try {
      const result = privateCalendarItem(await getCalendarPrivateItem(draft.record.id, subscriptions.account.value.id, subscriptions.identity.value), subscriptions.account.value)
      if (!current(context) || editor.value !== draft) return
      if (!result) throw new Error('读取结果需要确认，请重试。')
      accept(result)
      const form = privateItemForm(result)
      editor.value = { record: result, form, original: JSON.stringify(form), errors: {}, error: '', conflict: false, busy: false }
    } catch (err) {
      if (current(context) && editor.value === draft && !securityError(err)) draft.error = err?.message || '读取失败，草稿仍保留。'
    } finally { if (editor.value === draft) draft.busy = false }
  }
  async function remove(record) {
    const context = ticket()
    if (!current(context) || busyId.value || editor.value || dialog._state?.visible || !privateCalendarItem(record, subscriptions.account.value)) return
    busyId.value = record.id
    try {
      if (!await dialog.confirm({ title: '删除私人事项？', message: `“${record.title}”将被删除。`, type: 'danger', confirmText: '删除', cancelText: '保留' }) || !current(context)) return
      await deleteCalendarPrivateItem(record.id, subscriptions.account.value.id, record.version, subscriptions.identity.value)
      if (!current(context)) return
      generation++; loading.value = false
      records.value = records.value.filter(value => value.id !== record.id)
      notice.value = '私人事项已删除。'
    } catch (err) {
      if (current(context) && !securityError(err)) {
        error.value = err?.status === 409 ? '事项已变化，请刷新后确认最新内容再删除。' : err?.message || '删除失败，原内容仍保留。'
      }
    } finally { if (current(context)) busyId.value = '' }
  }
  const state = { records, editor, dirty, loading, error, notice, busyId, ready, load, open, close, setDate, save, reloadEditor, remove, dismiss: () => { editor.value = null } }
  provide(CALENDAR_PRIVATE_ITEMS, state)
  onBeforeUnmount(() => { alive = false; epoch++; generation++; editor.value = null; records.value = [] })
  return state
}
