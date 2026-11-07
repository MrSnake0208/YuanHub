import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { auth } from '../store/auth.js'
import { activeAccount } from '../store/activeAccount.js'
import { useAccountListUpdates } from '../store/accountList.js'
import { listAccounts } from '../api/accounts.js'
import { getOperatorCatalog, getOperatorCurrent, getCurrentOperatorPanels } from '../api/operator.js'
import { getCurrentStarState } from '../api/starState.js'
import { getCurrentStarLoadout } from '../api/starLoadout.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../utils/authPermissions.js'
import { AGENT_CATALOG } from '../data/inventory/catalog.js'
import { battleAccountEntries } from '../utils/battleAccountSnapshot.js'

export function useBattleAccountSource() {
  const catalog = ref(AGENT_CATALOG), catalogError = ref(''), catalogReady = ref(false)
  const accounts = ref([]), accountsLoading = ref(false), accountError = ref('')
  const entries = ref([]), loading = ref(false), error = ref(''), loaded = ref(false)
  const userId = computed(() => auth.isLoggedIn ? String(auth.userInfo?.id || '') : '')
  const account = computed(() => userId.value ? accounts.value.find(item => item.id === activeAccount.id) : null)
  const scope = computed(() => JSON.stringify([userId.value, userId.value ? activeAccount.id : '', account.value?.game || '']))
  let alive = true, accountSequence = 0, readSequence = 0, catalogRequest = null
  function acceptAccounts(rows) {
    accounts.value = rows
    activeAccount.syncAccounts(rows)
    if (!rows.some(item => item.id === activeAccount.id)) activeAccount.set(rows[0]?.id || '')
  }
  async function loadAccounts() {
    const seq = ++accountSequence, owner = userId.value
    accountsLoading.value = Boolean(owner); accountError.value = ''
    if (!owner) { accounts.value = []; return }
    try {
      const rows = await listAccounts()
      if (alive && seq === accountSequence && owner === userId.value) acceptAccounts(rows)
    } catch {
      if (alive && seq === accountSequence) accountError.value = '账号读取失败，请重试。手动编辑仍可使用。'
    } finally { if (alive && seq === accountSequence) accountsLoading.value = false }
  }
  watch(userId, () => { accounts.value = []; void loadAccounts() }, { immediate: true, flush: 'sync' })
  useAccountListUpdates(rows => { if (userId.value) acceptAccounts(rows) })
  watch(scope, () => {
    readSequence++; entries.value = []; loading.value = false; loaded.value = false; error.value = ''
  }, { flush: 'sync' })
  // 挂载与自动读取账号会同时需要图鉴，共用同一个进行中的请求。
  function loadCatalog() {
    if (catalogRequest) return catalogRequest
    catalogError.value = ''
    catalogRequest = (async () => {
      try {
        const response = await getOperatorCatalog()
        if (!Array.isArray(response?.operators)) throw new Error('invalid catalog')
        if (alive) { catalog.value = response.operators; catalogReady.value = true }
      } catch {
        if (alive) catalogError.value = '公共图鉴读取失败，暂用本地名称目录；可重试读取命盘词条。'
      } finally { catalogRequest = null }
    })()
    return catalogRequest
  }
  async function readAccount() {
    if (!account.value || loading.value) return
    const selected = { ...account.value }, key = scope.value, seq = ++readSequence
    const valid = () => alive && seq === readSequence && key === scope.value
    loading.value = true; error.value = ''; entries.value = []; loaded.value = false
    try {
      if (!catalogReady.value) await loadCatalog()
      if (!valid()) return
      if (!catalogReady.value) throw new Error('请先成功读取公共图鉴，再带入账号密探。')
      const [current, state, loadout] = await Promise.all([
        getOperatorCurrent({ accountId: selected.id, game: selected.game }),
        getCurrentStarState(selected.id), getCurrentStarLoadout(selected.id),
      ])
      if (!valid()) return
      let panels = {}, panelWarning = ''
      if (hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.OPERATOR_PANEL_USE)) {
        try {
          const ids = [...new Set((Array.isArray(current) ? current : [current]).flatMap(row => Object.keys(row?.entries || {})))]
          if (ids.length) panels = await getCurrentOperatorPanels(selected.id, ids)
        } catch { panelWarning = '自动面板读取失败，保留已记录值。' }
      }
      if (!valid()) return
      entries.value = battleAccountEntries({ catalog: catalog.value, current, state, loadout, panels, account: selected, panelWarning })
      loaded.value = true
    } catch (reason) {
      if (valid()) error.value = reason.message || '密探读取失败，请重试。'
    } finally { if (valid()) loading.value = false }
  }
  // 读取账号只生成选人候选，不改动草稿；进入页面或切换账号时自动读取，无需玩家手动带入。
  watch(scope, () => { if (account.value) void readAccount() }, { immediate: true })
  onMounted(loadCatalog)
  onBeforeUnmount(() => { alive = false; accountSequence++; readSequence++ })
  return { userId, account, accounts, accountsLoading, accountError, loadAccounts, catalog, catalogError, loadCatalog, entries, loading, loaded, error, readAccount }
}
