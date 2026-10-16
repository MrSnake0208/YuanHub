import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { auth } from '../store/auth.js'
import { getTodayPreferences, saveTodayPreferences } from '../api/todayPreferences.js'

export const TODAY_MODULES = Object.freeze([
  { id: 'highlights', label: '今日重点', description: '临期活动、活动待办与私人提醒' },
  { id: 'checklist', label: '今日待办', description: '活动 Checklist 与已加入的养成历练' },
  { id: 'activities', label: '游戏活动', description: '公开活动与招募日程' },
  { id: 'training', label: '我的养成计划', description: '今日历练与密探培养清单摘要' },
  { id: 'private_items', label: '私人安排', description: '自己创建的日期事项' }
])
const MODES = ['desktop', 'mobile']
const freshState = () => ({ snapshot: null, draft: [], baseline: [], baseVersion: 0, loading: false, saving: false, error: '', saveError: '', conflict: false, notice: '', checkedAt: 0 })
const same = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
function decode(value, mode) {
  if (value?.layout_mode !== mode || value.schema_version !== 1 || !Number.isSafeInteger(value.version) || value.version < 0 ||
      !Array.isArray(value.hidden_modules) || value.hidden_modules.some(id => typeof id !== 'string') || new Set(value.hidden_modules).size !== value.hidden_modules.length) {
    throw new Error('首页设置响应格式不正确，请重试')
  }
  return { ...value, hidden_modules: [...value.hidden_modules] }
}

// 今日页面的唯一偏好控制器；游戏子账号不参与身份和请求键。
export function useTodayPreferences() {
  const owner = computed(() => auth.isLoggedIn ? String(auth.userInfo?.id || '') : '')
  const states = reactive({ desktop: freshState(), mobile: freshState() })
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 768px)') : null
  const layoutMode = ref(media?.matches ? 'desktop' : 'mobile')
  const active = computed(() => states[layoutMode.value])
  const flights = new Map()
  let epoch = 0, alive = true
  const dirty = mode => !same(states[mode].draft, states[mode].baseline)
  const anyDirty = computed(() => MODES.some(dirty))
  const anySaving = computed(() => MODES.some(mode => states[mode].saving))
  const current = (user, ticket) => alive && owner.value === user && epoch === ticket
  const shown = id => !!active.value.snapshot && !active.value.snapshot.hidden_modules.includes(id)

  function adoptDraft(state, snapshot) {
    state.draft = [...snapshot.hidden_modules]
    state.baseline = [...snapshot.hidden_modules]
    state.baseVersion = snapshot.version
    state.conflict = false; state.saveError = ''
  }
  function load(mode, { replaceDraft = false, ifStale = false } = {}) {
    if (!owner.value || states[mode].saving || (ifStale && Date.now() - states[mode].checkedAt < 30000)) return Promise.resolve(false)
    if (flights.has(mode)) {
      const pending = flights.get(mode), user = owner.value, ticket = epoch
      if (!replaceDraft) return pending
      return pending.then(ok => {
        if (!ok || !current(user, ticket)) return false
        adoptDraft(states[mode], states[mode].snapshot)
        return true
      })
    }
    const user = owner.value, ticket = epoch, state = states[mode]
    state.loading = true; state.error = ''; state.checkedAt = Date.now()
    const promise = (async () => {
      try {
        const snapshot = decode(await getTodayPreferences(mode, user), mode)
        if (!current(user, ticket)) return false
        const keepDraft = dirty(mode) || state.conflict
        state.snapshot = snapshot
        if (replaceDraft || !keepDraft) {
          adoptDraft(state, snapshot)
        }
        state.checkedAt = Date.now()
        return true
      } catch (error) {
        if (current(user, ticket)) state.error = error?.message || '读取首页设置失败，请重试'
        return false
      } finally {
        if (current(user, ticket)) { state.loading = false; flights.delete(mode) }
      }
    })()
    flights.set(mode, promise)
    return promise
  }
  async function save(mode) {
    const state = states[mode], user = owner.value, ticket = epoch
    if (!user || !state.snapshot || state.loading || state.saving || state.conflict || state.error) return false
    const hidden = [...state.draft], expected = state.baseVersion
    state.saving = true; state.saveError = ''; state.notice = ''
    try {
      const snapshot = decode(await saveTodayPreferences(mode, { schema_version: 1, expected_version: expected, hidden_modules: hidden }, user), mode)
      if (!current(user, ticket)) return false
      if (snapshot.version !== expected + 1 || !same(snapshot.hidden_modules, hidden)) throw new Error('保存结果未确认，请读取最新设置后重试')
      state.snapshot = snapshot; adoptDraft(state, snapshot); state.checkedAt = Date.now()
      state.notice = '已保存，将同步到同账号的所有' + (mode === 'desktop' ? '电脑端' : '手机端') + '设备'
      return true
    } catch (error) {
      if (current(user, ticket)) {
        state.saveError = error?.message || '保存失败，请重试'
        state.conflict = error?.status === 409
      }
      return false
    } finally {
      if (current(user, ticket)) state.saving = false
    }
  }
  function discardDrafts() {
    MODES.forEach(mode => {
      const state = states[mode]
      if (state.snapshot) adoptDraft(state, state.snapshot)
      state.saveError = ''; state.conflict = false; state.notice = ''
    })
  }
  function setShown(mode, id, visible) {
    const state = states[mode]
    state.draft = visible ? state.draft.filter(item => item !== id) : [...new Set([...state.draft, id])]
    state.notice = ''
  }
  function reset(mode) { states[mode].draft = []; states[mode].notice = '' }
  function syncLayout() { layoutMode.value = media?.matches ? 'desktop' : 'mobile' }
  function resume() {
    if (document.visibilityState === 'hidden') return
    MODES.forEach(mode => { void load(mode, { ifStale: true }) })
  }
  watch(owner, () => {
    epoch++; flights.clear()
    MODES.forEach(mode => { states[mode] = freshState() })
    if (owner.value) MODES.forEach(mode => { void load(mode) })
  }, { immediate: true, flush: 'sync' })
  onMounted(() => {
    media?.addEventListener('change', syncLayout)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    window.addEventListener('focus', resume)
  })
  onBeforeUnmount(() => {
    alive = false; epoch++; flights.clear()
    media?.removeEventListener('change', syncLayout)
    document.removeEventListener('visibilitychange', resume)
    window.removeEventListener('pageshow', resume)
    window.removeEventListener('focus', resume)
  })
  return { owner, states, layoutMode, active, shown, dirty, anyDirty, anySaving, load, save, setShown, reset, discardDrafts }
}
