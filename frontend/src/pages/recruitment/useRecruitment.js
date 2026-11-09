import { isRecruitmentOperator } from '../../utils/operatorForms.js'
import { computed, onScopeDispose, reactive, watch } from 'vue'
import * as api from '../../api/recruitment.js'
import { listAccounts } from '../../api/accounts.js'
import { getOperatorCatalog } from '../../api/operator.js'
import { useAccountListUpdates } from '../../store/accountList.js'
import { activeAccount } from '../../store/activeAccount.js'
import { auth } from '../../store/auth.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'
import { operatorCatalogEntries } from './rules.js'
import { useRecruitmentPreviews } from './useRecruitmentPreviews.js'

export function useRecruitment() {
  const state = reactive({ accounts: [], archive: null, catalog: [], operators: [], loading: false, accountsLoading: false, busy: false, error: '', catalogError: '', notice: '', contextVersion: 0, requestVersion: 0, records: [], recordsLoading: false, recordsError: '', recordsRevision: null, recordsCursor: null })
  useAccountListUpdates(next => { state.accounts = next })
  const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
  const accountId = computed(() => activeAccount.id)
  const game = computed(() => activeAccount.gameFor(accountId.value))
  const available = computed(() => !!identity.value && state.accounts.some(account => account.id === accountId.value))
  const writable = computed(() => available.value && !!state.archive && !state.archive.game_mismatch && !state.loading && !state.busy)
  const agents = computed(() => state.operators.filter(agent => isRecruitmentOperator(agent, game.value)))
  let generation = 0, readGeneration = 0, accountsGeneration = 0, alive = true, pendingCommand = null, recordsGeneration = 0
  let refreshFlight = null, catalogGame = '', catalogLoaded = false, operatorsLoaded = false, catalogError = '', operatorsError = ''
  const capture = () => ({ generation, identity: identity.value, accountId: accountId.value, game: game.value })
  const matches = token => alive && token.generation === generation && token.identity === identity.value && token.accountId === accountId.value && token.game === game.value && available.value
  const { previews, load: loadPreview } = useRecruitmentPreviews({ state, capture, matches, available })
  function reset() {
    generation++; readGeneration++; recordsGeneration++; pendingCommand = null
    refreshFlight = null
    const keepCatalog = catalogGame === game.value
    if (!keepCatalog) { catalogGame = game.value; catalogLoaded = false; operatorsLoaded = false; catalogError = ''; operatorsError = '' }
    Object.assign(state, { archive: null, catalog: keepCatalog ? state.catalog : [], operators: keepCatalog ? state.operators : [], records: [], recordsLoading: false, recordsError: '', recordsRevision: null, recordsCursor: null, loading: false, busy: false, error: '', catalogError: keepCatalog ? state.catalogError : '', notice: '', contextVersion: state.contextVersion + 1, requestVersion: state.requestVersion + 1 })
  }
  function refresh(revision) {
    if (!available.value) return
    const requestedRevision = Number.isInteger(revision) ? revision : null
    if (requestedRevision != null && state.archive && requestedRevision <= state.archive.archive_revision) return
    if (refreshFlight && matches(refreshFlight)) {
      if (requestedRevision == null) refreshFlight.rerun = true
      else refreshFlight.revision = Math.max(refreshFlight.revision ?? requestedRevision, requestedRevision)
      return refreshFlight.promise
    }
    const flight = { ...capture(), revision: requestedRevision, rerun: false }
    refreshFlight = flight
    flight.promise = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        flight.rerun = false
        if (!await readArchive(flight)) break
        if (!matches(flight) || !flight.rerun && (flight.revision == null || state.archive && state.archive.archive_revision >= flight.revision)) break
      }
    })().finally(() => { if (refreshFlight === flight) refreshFlight = null })
    return flight.promise
  }
  async function readArchive(token) {
    const read = ++readGeneration
    state.loading = !state.archive
    try {
      const [archive, catalog, operators] = await Promise.all([
        api.getRecruitmentArchive(token.accountId),
        catalogLoaded ? null : api.getRecruitmentCatalog(token.game).then(data => { if (!Array.isArray(data?.pools)) throw new Error('公共卡池目录响应无效'); return data }).catch(error => ({ pools: [], error: error.message })),
        operatorsLoaded ? null : getOperatorCatalog().then(data => ({ operators: operatorCatalogEntries(data) })).catch(error => ({ operators: [], error: error.message }))
      ])
      if (!matches(token) || read !== readGeneration) return
      if (state.archive && state.archive.archive_revision !== archive.archive_revision) state.requestVersion++
      archive.pools = archive.pools.map(pool => ({ ...pool, catalog_state: archive.pool_states?.[pool.pool_id] }))
      state.archive = archive
      state.error = ''
      if (catalog) { catalogError = catalog.error || ''; catalogLoaded = !catalogError; if (catalogLoaded) state.catalog = catalog.pools }
      if (operators) { operatorsError = operators.error || ''; operatorsLoaded = !operatorsError; if (operatorsLoaded) state.operators = operators.operators }
      state.catalogError = [catalogError, operatorsError].filter(Boolean).join('；')
      if (state.catalogError) state.catalogError += '。已有档案仍可查看和维护，新增需等待目录恢复。'
      return true
    } catch (error) {
      if (matches(token) && read === readGeneration) {
        state.error = error.message || '读取失败，请重试'
        if (error.status === 404) await loadAccounts(false)
      }
    } finally { if (matches(token) && read === readGeneration) state.loading = false }
  }
  async function loadPoolRecords(poolId, cursor = null) {
    if (!available.value) return false
    const token = capture(), read = ++recordsGeneration
    state.recordsLoading = true; state.recordsError = ''
    if (!cursor) { state.records = []; state.recordsRevision = null; state.recordsCursor = null }
    try {
      const page = await api.listRecruitmentEvents({ accountId: token.accountId, poolId, cursor, order: 'asc', limit: 100 })
      if (!matches(token) || read !== recordsGeneration) return false
      if (!Array.isArray(page.items) || !Number.isInteger(page.archive_revision) || page.items.some(event => event.pool_id !== poolId || event.deleted_at) || new Set(page.items.map(event => event.event_id)).size !== page.items.length || cursor && page.items.some(event => state.records.some(old => old.event_id === event.event_id))) throw new Error('记录分页不完整或不属于本池，请重新读取')
      if (cursor && page.archive_revision !== state.recordsRevision) throw new Error('档案已变化，请关闭后重新打开本池')
      state.records = cursor ? state.records.concat(page.items) : page.items
      state.recordsRevision = page.archive_revision; state.recordsCursor = page.next_cursor
      return true
    } catch (error) {
      if (matches(token) && read === recordsGeneration) state.recordsError = error.message || '读取出货记录失败，请重试'
      return false
    } finally { if (matches(token) && read === recordsGeneration) state.recordsLoading = false }
  }
  async function command(operation, data, options = {}) {
    if (!writable.value) return null
    const token = capture()
    const content = JSON.stringify({ operation, data, explicitRevision: options.expectedRevision })
    if (!pendingCommand || pendingCommand.content !== content) pendingCommand = { content, id: options.requestId || crypto.randomUUID(), revision: options.expectedRevision ?? state.archive.archive_revision }
    const requestId = pendingCommand.id, expectedRevision = pendingCommand.revision
    state.busy = true; state.error = ''; state.notice = ''
    let result, failure
    try {
      result = await api.recruitmentCommand({ accountId: token.accountId, expectedRevision, requestId, operation, data })
    } catch (error) {
      failure = error
    } finally { if (matches(token)) state.busy = false }
    if (!matches(token)) return null
    if (failure) {
      if (failure.status === 409) { pendingCommand = null; state.requestVersion++; await refresh(); if (matches(token)) state.error = '档案已发生变化。草稿已保留，请核对后重新提交。' }
      else state.error = failure.message || '保存失败，草稿已保留'
      throw failure
    }
    pendingCommand = null; state.requestVersion++
    await refresh(result.archive_revision)
    return matches(token) ? result : null
  }
  async function loadAccounts(reload = true) {
    const owner = identity.value, version = generation, read = ++accountsGeneration
    if (!owner) return
    state.accountsLoading = true
    try {
      const accounts = await listAccounts()
      if (!alive || owner !== identity.value || version !== generation || read !== accountsGeneration) return
      state.accounts = accounts; activeAccount.syncAccounts(accounts)
      if (!accounts.some(account => account.id === accountId.value)) activeAccount.set(accounts[0]?.id || '')
      else if (reload) await refresh()
    } catch (error) { if (owner === identity.value && version === generation && read === accountsGeneration) state.error = error.message }
    finally { if (owner === identity.value && read === accountsGeneration) state.accountsLoading = false }
  }
  watch(identity, () => { reset(); state.accounts = []; loadAccounts() }, { immediate: true, flush: 'sync' })
  watch([accountId, game], () => { reset(); refresh() }, { flush: 'sync' })
  const unsubscribe = subscribeAccountEvents(message => {
    if (!available.value || message.data?.account_id !== accountId.value) return
    const event = message.event || message.type
    if (event === 'account_stream_open' && !message.data?.reconnected) return
    if (['account_updated', 'account_deleted', 'account_stream_open'].includes(event)) loadAccounts()
    else if (event === 'recruitment_changed') refresh(message.data?.archive_revision)
  })
  onScopeDispose(() => { alive = false; generation++; unsubscribe() })
  return { state, accountId, identity, game, available, writable, agents, capture, matches, refresh, command, loadPoolRecords, loadAccounts, previews, loadPreview }
}
