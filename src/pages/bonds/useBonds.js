import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import * as api from '../../api/bonds.js'
import { listAccounts } from '../../api/accounts.js'
import { getOperatorCatalog, getOperatorCurrent } from '../../api/operator.js'
import { activeAccount, DEFAULT_ACCOUNT_GAME } from '../../store/activeAccount.js'
import { auth } from '../../store/auth.js'
import { useAccountListUpdates } from '../../store/accountList.js'
import { operatorHuaji } from '../../utils/operatorHuaji.js'
import { filterBonds, groupBonds, groupBondsByOperator } from './rules.js'

export function useBonds() {
  const state = reactive({ accounts: [], accountsLoading: false, accountsError: '', catalog: null, archive: null, operators: [], owned: null, loading: false, busy: false, error: '', catalogError: '', operatorError: '', ownedError: '', notice: '', generation: 0 })
  const publicGame = ref(DEFAULT_ACCOUNT_GAME)
  const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
  const accountId = computed(() => activeAccount.id)
  const account = computed(() => state.accounts.find(a => a.id === accountId.value))
  const available = computed(() => !!identity.value && !!account.value)
  const game = computed(() => available.value ? account.value.game : publicGame.value)
  const writable = computed(() => available.value && !!state.archive && !!state.catalog && !state.loading && !state.busy && !state.catalogError && !state.error)
  const filters = reactive({ query: '', action: '', weather: '', effect: '', status: 'active', recorded: '', hideRecorded: false, onlyOwned: false })
  const records = computed(() => available.value ? state.archive?.records || [] : [])
  const filtered = computed(() => filterBonds(state.catalog?.entries || [], records.value, state.operators, filters, state.owned))
  const groups = computed(() => groupBonds(filtered.value))
  const selected = ref([]), page = ref(0)
  const operatorGroups = computed(() => groupBondsByOperator(filtered.value, state.catalog?.entries || [], records.value))
  const pageGroups = computed(() => operatorGroups.value.slice(page.value * 20, (page.value + 1) * 20))
  const summary = computed(() => state.archive?.summary || null)
  const recorded = id => records.value.some(r => r.bond_id === id && r.triggered)
  let alive = true, read = 0, accountRead = 0
  const capture = () => ({ generation: state.generation, identity: identity.value, accountId: accountId.value, game: game.value })
  const matches = token => alive && token.generation === state.generation && token.identity === identity.value && token.accountId === accountId.value && token.game === game.value
  function reset() {
    state.generation++; read++
    Object.assign(state, { catalog: null, archive: null, operators: [], owned: null, loading: false, busy: false, error: '', catalogError: '', operatorError: '', ownedError: '', notice: '' })
    selected.value = []; page.value = 0; filters.onlyOwned = false; filters.recorded = ''
  }
  async function refresh() {
    if (state.busy) return false
    const token = capture(), serial = ++read
    state.loading = true; state.error = ''; state.catalogError = ''; state.operatorError = ''; state.ownedError = ''
    try {
      const result = await Promise.allSettled([
        api.getBondCatalog(token.game), available.value ? api.getBondArchive(token.accountId, token.identity) : Promise.resolve(null),
        getOperatorCatalog(), available.value ? getOperatorCurrent({ accountId: token.accountId, game: token.game }) : Promise.resolve(null)
      ])
      if (!matches(token) || serial !== read) return false
      const [catalog, archive, operators, owned] = result
      state.catalog = catalog.status === 'fulfilled' ? catalog.value : null
      if (!state.catalog) state.catalogError = catalog.reason?.message || '羁绊目录读取失败，请重试。'
      state.archive = archive.status === 'fulfilled' ? archive.value : null
      if (archive.status === 'rejected') state.error = archive.reason?.message || '个人档案读取失败，请重试。'
      if (state.catalog?.game !== token.game && state.catalog) throw new Error('目录游戏不匹配，请重新读取。')
      if (state.archive && (state.archive.account_id !== token.accountId || state.archive.game !== token.game)) throw new Error('个人档案归属不一致，请重新读取。')
      if (state.archive && state.catalog && state.archive.catalog_version !== state.catalog.catalog_version) {
        state.archive = null; state.error = '目录正在更新，请刷新后继续；未显示旧版进度。'
      }
      state.operators = operators.status === 'fulfilled' ? operators.value.operators || [] : []
      if (operators.status === 'rejected') state.operatorError = operators.reason?.message || '密探资料读取失败。'
      state.owned = null
      if (owned.status === 'fulfilled' && owned.value) {
        const documents = Array.isArray(owned.value) ? owned.value : [owned.value]
        const entries = documents.filter(d => d.account_id === token.accountId && d.game === token.game).flatMap(d => Object.entries(d.entries || {}))
        if (entries.length) state.owned = new Map(entries.map(([id, row]) => [id, operatorHuaji({ ...state.operators.find(o => o.id === id), ...row }).owned]))
      }
      if (owned.status === 'rejected') state.ownedError = '密探拥有资料读取失败，已显示全部组合。'
      if (!state.owned) filters.onlyOwned = false
      return !!state.catalog && (!available.value || !!state.archive)
    } catch (error) {
      if (matches(token) && serial === read) { state.archive = null; state.error = error.message }
      return false
    } finally { if (matches(token) && serial === read) state.loading = false }
  }
  async function loadAccounts() {
    const owner = identity.value, serial = ++accountRead
    if (!owner) return
    state.accountsLoading = true; state.accountsError = ''
    try {
      const accounts = await listAccounts(owner)
      if (!alive || identity.value !== owner || serial !== accountRead) return
      state.accounts = accounts; activeAccount.syncAccounts(accounts)
      if (!accounts.some(a => a.id === accountId.value)) activeAccount.set(accounts[0]?.id || '')
    } catch (error) { if (alive && identity.value === owner && serial === accountRead) state.accountsError = error.message }
    finally { if (alive && identity.value === owner && serial === accountRead) state.accountsLoading = false }
  }
  async function save(changes) {
    if (!writable.value || !changes.length || changes.length > 50) return false
    const token = capture(), revision = state.archive.revision, version = state.catalog.catalog_version
    state.busy = true; state.notice = ''; state.error = ''; read++
    try {
      const result = await api.writeBonds(token.accountId, token.identity, revision, version, changes)
      if (!matches(token)) return false
      if (result.account_id !== token.accountId || result.game !== token.game || result.catalog_version !== version) throw new Error('保存响应归属或目录不一致，请刷新核对。')
      state.archive = result; selected.value = []; state.notice = '已保存到当前账号。'
      return true
    } catch (error) {
      if (matches(token)) {
        if (error.status === 409) { state.busy = false; await refresh(); if (matches(token)) state.error = '档案或目录版本冲突，已尝试刷新。请核对后重试。' }
        else state.error = error.message || '保存失败，未显示为已保存；请刷新后重试。'
      }
      return false
    } finally { if (matches(token)) state.busy = false }
  }
  function select(id) {
    if (selected.value.includes(id)) selected.value = selected.value.filter(value => value !== id)
    else if (selected.value.length < 50) selected.value.push(id)
  }
  watch(filters, () => { selected.value = []; page.value = 0 }, { flush: 'sync' })
  watch(page, () => { selected.value = [] }, { flush: 'sync' })
  useAccountListUpdates(next => { state.accounts = next; activeAccount.syncAccounts(next) })
  watch(identity, () => { state.accounts = []; accountRead++; loadAccounts() }, { flush: 'sync', immediate: true })
  watch([identity, accountId, game, available], () => { reset(); refresh() }, { flush: 'sync', immediate: true })
  onScopeDispose(() => { alive = false; state.generation++; accountRead++; read++ })
  return { state, identity, accountId, account, available, game, publicGame, writable, filters, records, filtered, groups, operatorGroups, pageGroups, selected, page, summary, recorded, capture, matches, refresh, loadAccounts, save, select }
}
