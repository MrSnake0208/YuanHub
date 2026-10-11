import { bundledLedgerCatalog } from '../src/utils/ledgerCatalog.js'
export function ledgerFixture() {
  return {
    packages: ['daihao', 'ru'].map(game => ({ id: `${game}:1`, content_id: 1, game, name: game + '公共礼包',
      points: 60, draws: 0.6, limit: 3, category: '测试', sort_id: 1, extra: '公开说明', enabled: true, version: 0,
      price_usd: game === 'daihao' ? 2 : null, price_cny: game === 'ru' ? 6 : null })),
    campaigns: ['daihao', 'daihao', 'ru'].map((game, i) => ({ id: `campaign-${i}`, game, name: `动态活动${i}`,
      starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-31T00:00:00Z', time_zone: 'Asia/Shanghai',
      status: 'published', version: 0, tiers: [{ points: 100, sort_id: 0, enabled: true, rewards: [{ name: '符传', count: 2 }] }] })),
    settings: { id: 'default', exchange_rate: 8, version: 0 },
  }
}

export function legacyLedgerFixture() {
  return { packages: Object.entries(bundledLedgerCatalog.packages).flatMap(([game, items]) => items.map(p => ({
    game, id: `${game}:${p.id}`, content_id: p.id, name: p.name, points: p.points, draws: p.draws, limit: p.limit,
    category: p.category, sort_id: p.sortId, extra: p.extra, price_usd: p.priceUsd, price_cny: p.priceCny, enabled: true,
  }))), campaigns: bundledLedgerCatalog.campaigns, settings: { exchange_rate: 6.7 } }
}
