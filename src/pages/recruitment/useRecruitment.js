import { computed, onScopeDispose, reactive, watch } from 'vue'
import * as api from '../../api/recruitment.js'
import { listAccounts } from '../../api/accounts.js'
import { getOperatorCatalog } from '../../api/operator.js'
import { activeAccount } from '../../store/activeAccount.js'
import { auth } from '../../store/auth.js'
import { beta } from '../../store/beta.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'
import { operatorCatalogEntries } from './rules.js'

export function useRecruitment() {
  const state = reactive({ accounts: [], archive: null, catalog: [], operators: [], loading: false, accountsLoading: false, busy: false, error: '', catalogError: '', notice: '', contextVersion: 0, requestVersion: 0, records: [], recordsLoading: false, recordsError: '', recordsRevision: null, recordsCursor: null })
  const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
  const accountId = computed(() => activeAccount.id)
  const game = computed(() => activeAccount.gameFor(accountId.value))
  const available = computed(() => !!identity.value && beta.canUseBetaFeatures && state.accounts.some(account => account.id === accountId.value))
  const writable = computed(() => available.value && !!state.archive && !state.archive.game_mismatch && !state.loading && !state.busy)
  const agents = computed(() => state.operators.filter(agent => agent.rarity === 5 && agent.games?.includes(game.value)))
  let generation = 0, readGeneration = 0, accountsGeneration = 0, alive = true, pendingCommand = null, recordsGeneration = 0
  const capture = () => ({ generation, identity: identity.value, accountId: accountId.value })
  const matches = token => alive && token.generation === generation && token.identity === identity.value && token.accountId === accountId.value && available.value
  function reset() {
    generation++; readGeneration++; recordsGeneration++; pendingCommand = null
    Object.assign(state, { archive: null, catalog: [], operators: [], records: [], recordsLoading: false, recordsError: '', recordsRevision: null, recordsCursor: null, loading: false, busy: false, error: '', catalogError: '', notice: '', contextVersion: state.contextVersion + 1, requestVersion: state.requestVersion + 1 })
  }
  async function refresh() {
    if (!available.value) return
    const token = capture(), read = ++readGeneration
    state.loading = true; state.error = ''
    try {
      const [archive, catalog, operators] = await Promise.all([
        api.getRecruitmentArchive(token.accountId), api.getRecruitmentCatalog(game.value).then(data => { if (!Array.isArray(data?.pools)) throw new Error('公共卡池目录响应无效'); return data }).catch(error => ({ pools: [], error: error.message })), getOperatorCatalog().then(data => ({ operators: operatorCatalogEntries(data) })).catch(error => ({ operators: [], error: error.message }))
      ])
      if (!matches(token) || read !== readGeneration) return
      if (state.archive && state.archive.archive_revision !== archive.archive_revision) state.requestVersion++
      Object.assign(state, { archive, catalog: catalog.pools, operators: operators.operators })
      state.catalogError = [catalog.error, operators.error].filter(Boolean).join('；')
      if (state.catalogError) state.catalogError += '。已有档案仍可查看和维护，新增需等待目录恢复。'
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
    try {
      const result = await api.recruitmentCommand({ accountId: token.accountId, expectedRevision, requestId, operation, data })
      if (!matches(token)) return null
      pendingCommand = null; state.requestVersion++
      await refresh()
      if (!matches(token)) return null
      state.notice = '已保存'
      return result
    } catch (error) {
      if (!matches(token)) return null
      if (error.status === 409) { pendingCommand = null; state.requestVersion++; await refresh(); if (matches(token)) state.error = '档案已发生变化。草稿已保留，请核对后重新提交。' }
      else state.error = error.message || '保存失败，草稿已保留'
      throw error
    } finally { if (matches(token)) state.busy = false }
  }
  async function loadAccounts(reload = true) {
    const owner = identity.value, version = generation, read = ++accountsGeneration
    if (!owner || !beta.canUseBetaFeatures) return
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
  watch([identity, () => beta.canUseBetaFeatures], () => { reset(); state.accounts = []; loadAccounts() }, { immediate: true, flush: 'sync' })
  watch([accountId, game], () => { reset(); refresh() }, { flush: 'sync' })
  const unsubscribe = subscribeAccountEvents(message => {
    if (!available.value || message.data?.account_id !== accountId.value) return
    if (['account_updated', 'account_deleted', 'account_stream_open'].includes(message.event || message.type)) loadAccounts()
    else if (message.event === 'recruitment_changed') refresh()
  })
  const onVisibility = () => { if (document.visibilityState === 'visible') loadAccounts() }
  document.addEventListener('visibilitychange', onVisibility)
  onScopeDispose(() => { alive = false; generation++; unsubscribe(); document.removeEventListener('visibilitychange', onVisibility) })
  return { state, accountId, identity, game, available, writable, agents, capture, matches, refresh, command, loadPoolRecords }
}
