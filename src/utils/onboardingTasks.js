// Only tasks with an observable, server-backed completion contract are selectable.
export const ONBOARDING_TASKS = {
  'operator-first-entry': { title: '录入第一位密探', route: '/operator', result: '当前账号已有真实密探档案，录入结果已验证。' },
  'maayuan-first-sync': { title: '第一次连接 MaaYuan', route: '/user/profile', result: '第一次 MaaYuan 同步已完成' },
  'account-create': { title: '建立第一个游戏账号', route: '/user/profile#game-accounts', result: '真实游戏账号已就绪，可以开始记录数据。' }
}

export function ownedOperatorId(current, accountId, game) {
  const rows = Array.isArray(current) ? current : current?.entries ? [current] : null
  if (!rows) throw new Error('无法确认密探数据，请重试读取。')
  for (const row of rows) {
    if (!row?.entries || typeof row.entries !== 'object' || Array.isArray(row.entries) ||
        (row.account_id && row.account_id !== accountId) || (row.game && row.game !== game)) {
      throw new Error('密探数据与当前账号或游戏不一致，请重试读取。')
    }
  }
  for (const row of rows) {
    const found = Object.entries(row.entries).find(([, entry]) => {
      const level = Number(entry?.star_level ?? entry?.starLevel)
      return Number.isFinite(level) && level > 0
    })
    if (found) return found[0]
  }
  return ''
}

export function resolveTaskProgress(task, state) {
  if (!Object.hasOwn(ONBOARDING_TASKS, task)) return { waitingFor: 'unavailable' }
  if (!state.loggedIn) return { waitingFor: 'login' }
  if (state.error) return { waitingFor: 'read_error' }
  if (!state.accounts) return { waitingFor: 'business_state' }
  if (!state.accounts.length) return { waitingFor: 'account_created' }
  if (task === 'maayuan-first-sync') return { waitingFor: 'business_state' }
  const account = state.accounts.find(item => item.id === state.accountId)
  if (task !== 'account-create' && !account) return { waitingFor: 'account_selected' }
  const evidence = { ownerId: state.ownerId, task, accountId: account?.id || state.accounts[0].id, game: account?.game }
  if (task === 'account-create') return { waitingFor: 'verified', evidence }
  if (!state.currentLoaded) return { waitingFor: 'business_state' }
  if (!state.operatorId) return { waitingFor: 'operator_saved' }
  return { waitingFor: 'verified', evidence: { ...evidence, operatorId: state.operatorId } }
}

export const MAAYUAN_PHASES = ['choose-account', 'token-created', 'token-copied', 'waiting-sync', 'synced']

export function maaYuanCheckpoint(value) {
  return {
    task: 'maayuan-first-sync',
    connectionId: typeof value?.connectionId === 'string' ? value.connectionId : '',
    accountId: typeof value?.accountId === 'string' ? value.accountId : '',
    phase: MAAYUAN_PHASES.includes(value?.phase) ? value.phase : 'choose-account'
  }
}

export function verifiedConnectionSync(receipt, connectionId, accountId) {
  return !!connectionId && !!accountId && receipt?.synced === true && receipt.connection_id === connectionId &&
    receipt.account_id === accountId && receipt.data_type === 'inventory' &&
    typeof receipt.record_id === 'string' && !!receipt.record_id &&
    typeof receipt.received_at === 'string' && Number.isFinite(Date.parse(receipt.received_at))
}
