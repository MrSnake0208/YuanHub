export function recruitmentEvent(id, span, poolId = 'pool-a') {
  return { event_id: id, pool_id: poolId, pool_snapshot: { name: '测试卡池', game: '代号鸢' }, agent_snapshot: { agent_id: 'char-a', name: id, temporary: false }, pull_span: span, sort_order: id === 'A' ? 1 : id === 'B' ? 2 : 3, up_status: 'unknown', acquired_date: null, note: null, source: 'manual', batch_id: null, deleted_at: null }
}
export function recruitmentFixture(accountId = 'acc-a', revision = 3) {
  return { account_id: accountId, game_snapshot: '代号鸢', archive_revision: revision, baseline: 0, current_pool_id: 'pool-a', pools: [{ pool_id: 'pool-a', snapshot: { name: '测试卡池', game: '代号鸢', catalog_pool_id: 'catalog-a' }, progress: 0, mapped_snapshot: null }], temporary_agents: [], summary: { known_total_pulls: 65, recorded_pulls: 65, batch_pulls: 0, known_progress: 0, event_count: 3, exact_event_count: 3, unknown_event_count: 0, unknown_progress_count: 0, has_unknown: false }, game_mismatch: false }
}
export function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
