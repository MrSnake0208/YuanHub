import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import * as api from '../../api/achievement.js'
import { listAccounts } from '../../api/accounts.js'
import { activeAccount, DEFAULT_ACCOUNT_GAME } from '../../store/activeAccount.js'
import { auth } from '../../store/auth.js'
import { useAccountListUpdates } from '../../store/accountList.js'
import { emptyRecord, filterAchievements, PAGE_SIZE, summarizeAchievements } from './rules.js'

export function useAchievement() {
  const state = reactive({ accounts: [], accountsLoading: false, archive: null, catalog: null, loading: false, busy: false, error: '', catalogError: '', notice: '', contextVersion: 0, undo: null })
  const publicGame = ref(DEFAULT_ACCOUNT_GAME)
  const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
  const accountId = computed(() => activeAccount.id)
  const account = computed(() => state.accounts.find(item => item.id === accountId.value))
  const available = computed(() => !!identity.value && !!account.value)
  const game = computed(() => available.value ? account.value.game : publicGame.value)
  const writable = computed(() => available.value && !!state.archive && !!state.catalog && !state.loading && !state.busy)
  const records = computed(() => available.value ? state.archive?.records || [] : [])
  const entries = computed(() => state.catalog?.entries || [])
  const filters = reactive({ query: '', category: '', reward: '', status: '', favorite: false, hidden: false })
  const page = ref(0), batchMode = ref(false), selected = ref([])
  const filtered = computed(() => filterAchievements(entries.value, records.value, filters))
  const pageEntries = computed(() => filtered.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE))
  const summary = computed(() => summarizeAchievements(entries.value, records.value))
  const recordFor = id => records.value.find(record => record.achievement_id === id) || emptyRecord(id)
  let generation = 0, read = 0, accountRead = 0, alive = true
  const capture = () => ({ generation, identity: identity.value, accountId: accountId.value, game: game.value })
  const matches = token => alive && token.generation === generation && token.identity === identity.value && token.accountId === accountId.value && token.game === game.value
  function reset() {
    generation++; read++
    Object.assign(state, { archive: null, catalog: null, loading: false, busy: false, error: '', catalogError: '', notice: '', undo: null, contextVersion: state.contextVersion + 1 })
    selected.value = []; batchMode.value = false; page.value = 0
  }
  async function refresh() {
    if (state.busy) return false
    const token = capture(), version = ++read
    state.loading = true; state.error = ''; state.catalogError = ''
    try {
      const [catalog, archive] = await Promise.allSettled([
        api.getAchievementCatalog(token.game),
        available.value ? api.getAchievementArchive(token.accountId, token.identity) : Promise.resolve(null)
      ])
      if (!matches(token) || version !== read) return false
      if (catalog.status === 'fulfilled') state.catalog = catalog.value
      else { state.catalog = null; state.catalogError = catalog.reason.message || '目录读取失败' }
      if (archive.status === 'fulfilled') {
        const value = archive.value
        if (value && (value.account_id !== token.accountId || value.game !== token.game)) throw new Error('档案归属不一致，请重新读取账号。')
        if (state.archive?.revision !== value?.revision) state.undo = null
        state.archive = value
      } else { state.archive = null; state.error = archive.reason.message || '档案读取失败' }
      return catalog.status === 'fulfilled' && archive.status === 'fulfilled'
    } catch (error) { if (matches(token) && version === read) { state.archive = null; state.error = error.message } return false }
    finally { if (matches(token) && version === read) state.loading = false }
  }
  async function loadAccounts() {
    const owner = identity.value, version = ++accountRead
    if (!owner) return
    state.accountsLoading = true
    try {
      const accounts = await listAccounts(owner)
      if (!alive || owner !== identity.value || version !== accountRead) return
      activeAccount.syncAccounts(accounts)
      state.accounts = accounts
      if (!accounts.some(item => item.id === accountId.value)) activeAccount.set(accounts[0]?.id || '')
    } catch (error) { if (alive && owner === identity.value && version === accountRead) state.error = error.message }
    finally { if (alive && owner === identity.value && version === accountRead) state.accountsLoading = false }
  }
  async function save(patches, undoing = false) {
    if (!writable.value || !patches.length || patches.length > PAGE_SIZE) return false
    const token = capture(), revision = state.archive.revision
    const before = patches.map(patch => {
      const current = recordFor(patch.achievement_id)
      const fields = Object.fromEntries(Object.keys(patch).map(key => [key, current[key]]))
      if ('status' in patch) fields.completed_on = current.completed_on
      return fields
    })
    state.busy = true; state.error = ''; state.notice = ''; read++
    try {
      const result = await api.writeAchievements(token.accountId, token.identity, revision, patches)
      if (!matches(token)) return false
      state.archive = result
      state.undo = undoing ? null : { patches: before, revision: result.revision, token }
      state.notice = undoing ? '已撤销，恢复到本次操作之前。' : '已保存到当前账号。'
      return true
    } catch (error) {
      if (matches(token)) {
        state.undo = null
        if (error.status === 409) {
          state.busy = false
          await refresh()
          if (matches(token)) state.error = '档案或账号已变化，已尝试读取最新内容。请核对后重试，编辑草稿已保留。'
        } else state.error = error.message || '保存失败，请重试。'
      }
      return false
    } finally { if (matches(token)) state.busy = false }
  }
  async function undo() {
    const operation = state.undo
    if (!operation || !matches(operation.token) || state.archive?.revision !== operation.revision) return false
    return save(operation.patches, true)
  }
  function toggleSelection(id) {
    if (!pageEntries.value.some(entry => entry.achievement_id === id)) return
    selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id]
  }
  function resetFilters() { Object.assign(filters, { query: '', category: '', reward: '', status: '', favorite: false, hidden: false }) }
  watch(filters, () => { page.value = 0; selected.value = [] }, { flush: 'sync' })
  watch(page, () => { selected.value = [] }, { flush: 'sync' })
  watch(pageEntries, values => { selected.value = selected.value.filter(id => values.some(entry => entry.achievement_id === id)) })
  useAccountListUpdates(next => { state.accounts = next; activeAccount.syncAccounts(next) })
  watch(identity, () => { state.accounts = []; state.accountsLoading = false; accountRead++; loadAccounts() }, { flush: 'sync', immediate: true })
  watch([identity, accountId, game, available], () => { reset(); refresh() }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { alive = false; generation++; accountRead++ })
  return { state, identity, accountId, account, game, publicGame, available, writable, entries, records, filters, page, batchMode, selected, filtered, pageEntries, summary, recordFor, capture, matches, refresh, loadAccounts, save, undo, toggleSelection, resetFilters }
}
