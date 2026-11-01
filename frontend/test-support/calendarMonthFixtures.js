// Synthetic overlapping business intervals; no user records or account identities.
export function denseMonthItems() {
  const types = [
    ['ACTIVITY', 'LARGE_EVENT'], ['ACTIVITY', 'UNDERGROUND'], ['RECRUITMENT', ''],
    ['SHOP', 'ACTIVITY_SHOP'], ['LOGIN', 'SIGN_IN'], ['MAINTENANCE', 'MAINTENANCE'],
  ]
  return Array.from({ length: 12 }, (_, index) => ({
    id: `month-${String(index).padStart(2, '0')}`, source_type: index % 6 === 2 ? 'RECRUITMENT_POOL' : 'MANUAL', game: '如鸢',
    title: `合成${index + 1} · ${index === 0 ? '跨月大型活动与很长的中文名称'.repeat(4) : '活动计划'}`,
    category: types[index % types.length][0], subtype: types[index % types.length][1],
    pool_type: index % 2 ? 'LIMITED' : 'STANDARD',
    start_date: index < 3 ? '2026-09-25' : index === 11 ? '2026-10-15' : `2026-10-${String(index + 1).padStart(2, '0')}`,
    end_date: index === 0 ? '2026-11-10' : index === 1 ? null : index === 11 ? '2026-10-15' : '2026-10-18',
    description: '合成密集场景，完整名称与说明在当天清单查看。',
  }))
}
