/** Small immutable-at-call-site fixtures. Never use actual user IDs or tokens. */
export function userFixture(overrides = {}) {
  return { user_id: 'test-user-a', user_name: '测试殿下', activated: true, roles: [], ...overrides }
}
export function accountFixture(overrides = {}) {
  return { id: 'test-account-a', name: '大号', game: '如鸢', ...overrides }
}
export function operatorFixture(overrides = {}) {
  return { id: 'char_1_test', name: '测试密探', rarity: 5, prof: ['阳'], sub_prof: ['龙盾'], avatar: '', growth: { level: 40, elite: 2, star_level: 3 }, ...overrides }
}
export function inventoryRecordFixture(overrides = {}) {
  return { record_id: 'test-record-1', record_type: 'reward_delta', entity_type: 'item', acquisition_channel: '派遣-洛阳', effective_at: '2026-09-19T02:00:00Z', entries: [{ id: 'baijinbi', count: 12 }], staminaCost: 10, ...overrides }
}
export function betaFixture(overrides = {}) {
  return { userId: 'test-user-a', canUseBetaFeatures: true, campaign: { campaignId: 'test-beta', accessMode: 'INVITE', publicState: 'OPEN', serverNow: '2026-09-24T12:00:00Z', reservedUntil: '2026-09-27T12:00:00Z' }, ...overrides }
}
export function multiAccountFixture() {
  return { user: userFixture(), accounts: [accountFixture(), accountFixture({ id: 'test-account-b', name: '小号', game: '代号鸢' })] }
}
export function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
