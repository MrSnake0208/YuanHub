// Task contracts and validators; entries belong to their own pages.
export const ONBOARDING_TASKS = {
  'today-first-data': { title: '建立第一份真实数据', route: '/', result: '第一份数据已建立' },
  'inventory-first-baseline': { title: '完成首次库存盘点', route: '/inventory', result: '首次库存盘点已完成，完整库存基准已验证。' },
  'operator-first-entry': { title: '录入第一位密探', route: '/operator', result: '当前账号的密探录入结果已验证。' },
  'maayuan-first-sync': { title: '第一次连接 MaaYuan', route: '/user/profile', result: '第一次 MaaYuan 同步已完成' },
  'account-create': { title: '建立第一个游戏账号', route: '/user/profile#game-accounts', result: '真实游戏账号已就绪，可以开始记录数据。' }
}

export const FIRST_DATA_TASKS = {
  operator: { title: '录入第一位密探', route: '/operator' },
  inventory: { title: '完成首次库存盘点', route: '/inventory' },
  star: { title: '完成一次星石截图识别', route: '/star' }
}

export function isTutorialTaskRoute(task, firstDataTask, path) {
  if (!Object.hasOwn(ONBOARDING_TASKS, task)) return false
  if (task === 'maayuan-first-sync' || task === 'account-create') return path === '/user/profile'
  if (path === '/user/profile') return true // Account prerequisites keep the original task.
  if (task === 'today-first-data' && ['/', '/today'].includes(path)) return true
  const kind = task === 'today-first-data' ? firstDataTask : task === 'inventory-first-baseline' ? 'inventory' : 'operator'
  return kind === 'operator' ? ['/operator', '/operator/quick'].includes(path) : path === FIRST_DATA_TASKS[kind]?.route
}

export function inventoryBaselineAt(current, accountId) {
  const rows = Array.isArray(current) ? current : current?.entries ? [current] : null
  if (!rows || rows.some(row => !row?.entries || typeof row.entries !== 'object' || Array.isArray(row.entries) ||
    (row.account_id && row.account_id !== accountId) || (row.entity_type && row.entity_type !== 'item') ||
    Object.values(row.entries).some(entry => !Number.isSafeInteger(entry?.count) || entry.count < 0))) {
    throw new Error('库存数据与当前账号或类型不一致，请重试读取。')
  }
  return rows.find(row => typeof row.full_baseline_at === 'string' && Number.isFinite(Date.parse(row.full_baseline_at)))?.full_baseline_at || ''
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
  if (task === 'today-first-data' && !state.firstDataTask) return { waitingFor: 'first_task' }
  if (!state.currentLoaded) return { waitingFor: 'business_state' }
  if (task === 'inventory-first-baseline') return state.baselineAt
    ? { waitingFor: 'verified', evidence: { ...evidence, baselineAt: state.baselineAt } }
    : { waitingFor: 'inventory_saved' }
  if (task === 'today-first-data') {
    const result = state.firstDataTask === 'operator' ? state.operatorId : state.firstDataTask === 'inventory' ? state.baselineAt : state.starId
    if (!result) return { waitingFor: state.firstDataTask === 'operator' ? 'operator_saved' : state.firstDataTask === 'inventory' ? 'inventory_saved' : 'star_saved' }
    if (!state.onToday) return { waitingFor: 'today_return' }
    return { waitingFor: 'verified', evidence: { ...evidence, firstDataTask: state.firstDataTask, operatorId: state.operatorId, baselineAt: state.baselineAt, starId: state.starId } }
  }
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
