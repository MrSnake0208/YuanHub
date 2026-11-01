// 合成测试目录；不是游戏资料，禁止用于生产或开发运行时播种。
export const achievementEntry = (index = 1, extra = {}) => ({
  achievement_id: 'yh_fixture_dhy_' + index, game: '代号鸢', category_id: 'test', name: '测试成就 ' + index,
  condition: '仅用于测试的条件 ' + index, sort: index, is_hidden: index === 2,
  rewards: null, target: null, linked_metric: null, ...extra
})
export const achievementCatalog = (count = 3) => ({ catalog_version: 'fixture-v1', game: '代号鸢', data_status: 'fixture', coverage: '合成测试数据', reward_filters: ['测试币', '测试钱', '测试券', '测试格'], point_tracks: [], categories: [{ category_id: 'test', name: '测试分类' }], entries: Array.from({ length: count }, (_, index) => achievementEntry(index + 1)) })
export const achievementArchive = (accountId = 'a', extra = {}) => ({ account_id: accountId, game: '代号鸢', revision: 0, records: [], ...extra })
export const achievementBackup = (records = []) => ({ format: 'yuanhub-achievement', schema_version: 1, game: '代号鸢', catalog_version: 'fixture-v1', records })
export const deferredAchievement = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
