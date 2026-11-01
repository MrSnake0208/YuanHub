export function operatorScanReviewFixture(kind = 'star') {
  const catalog = {
    id: 'review-op', name: '合成密探', rarity: 4, prof: '阳', games: ['如鸢'],
    discs: [{ ot_name: '合成命盘甲' }, { ot_name: '合成命盘乙' }],
    oddity_schema: { attack: { max: 350 }, hp: { max: 1820 }, special: { name: '合成特殊奇闻', max: 11 } },
  }
  const entry = { operator_id: catalog.id, level: 90, elite: 15,
    huaji: { owned: true, stage: null, awakened: null }, section_status: { basic: 'ready', huaji: 'review' } }
  const current = { level: 100, elite: 17, revision: 2, huaji: { owned: true, stage: 7, awakened: false } }
  const review = { account_id: 'acc-review-a', record_id: 'scan:synthetic', operator_id: catalog.id, status: 'review', warnings: [], blocking_errors: [],
    draftRecordId: 'review:synthetic', correctedAt: '2026-10-13T09:00:00Z' }
  if (kind === 'disc') {
    entry.disc_loadouts = [{ id: 'disc_1', name: '采集组合', discs: [{ ot_name: '非法合成命盘' }] }]
    entry.section_status.disc_loadouts = 'review'
    review.status = 'rejected'
    review.blocking_errors = [{ code: 'invalid_disc_loadout', message: 'disc is not in the operator catalog', field: 'disc_loadouts[0].discs[0].ot_name' }]
  }
  if (kind === 'oddity') {
    entry.combat_stats = { oddities: { attack: { current: 351 }, hp: { current: 1800 } } }
    entry.section_status.oddities = 'review'
    review.blocking_errors = [{ code: 'invalid_combat_stats', message: 'oddity current exceeds the catalog limit', field: 'combat_stats.oddities.attack.current' }]
  }
  if (kind === 'unsupported') {
    entry.equipped_star_stones = [{ type: 'main', name: '合成星石', level: 1 }]
    entry.section_status.equipment = 'review'
  }
  review.document = { format: 'myshare-operator-exchange', version: 4, producer: { platform: 'synthetic', version: '1' },
    exported_at: '2026-10-12T09:00:00Z', accounts: [{ id: 'local-synthetic', name: '合成采集账号' }],
    records: [{ record_id: review.record_id, account_id: 'local-synthetic', record_type: 'operator_snapshot', source_kind: 'scan', game: '如鸢', snapshot_scope: 'listed', effective_at: '2026-10-12T09:00:00Z', entries: [entry] }] }
  return { catalog, current, review, entry }
}
