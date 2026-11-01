const fields = ['reward_items', 'point_tracks', 'reward_filter_keys']

export function achievementSettings(document, game, categories) {
  if (!document || document.format !== 'yuanhub-achievement-settings' || document.schema_version !== 1 || document.game !== game) {
    throw new Error('请选择当前游戏的奖励配置文件。')
  }
  if (Object.keys(document).some(key => !['format', 'schema_version', 'game', ...fields].includes(key)) || fields.some(key => !Array.isArray(document[key]))) {
    throw new Error('奖励配置字段不完整或含未知字段。')
  }
  for (const item of document.reward_items) {
    if (!item || Array.isArray(item) || typeof item.item_key !== 'string' || typeof item.name !== 'string' ||
      !Array.isArray(item.games) || !item.games.length || item.games.some(game => typeof game !== 'string') ||
      Object.keys(item).some(key => !['item_key', 'name', 'games'].includes(key))) {
      throw new Error('奖励物品必须包含文本标识、名称和适用游戏列表。')
    }
  }
  if (document.reward_filter_keys.some(key => typeof key !== 'string')) throw new Error('奖励筛选键必须是文本。')
  const point_tracks = document.point_tracks.map(track => {
    if (!track || typeof track !== 'object') throw new Error('积分配置格式错误。')
    const matches = categories.filter(category => track.category_id ? category.category_id === track.category_id : category.name === track.category_name)
    if (matches.length !== 1) throw new Error('积分配置的分类不存在或不唯一，请先导入分类并核对配置。')
    const { category_name, ...value } = track
    if (category_name && matches[0].name !== category_name) throw new Error('积分配置的分类名称与 ID 不一致。')
    return { ...value, category_id: matches[0].category_id }
  })
  return { reward_items: document.reward_items, point_tracks, reward_filter_keys: document.reward_filter_keys }
}

export function settingsExport(game, draft) {
  return { format: 'yuanhub-achievement-settings', schema_version: 1, game, ...Object.fromEntries(fields.map(key => [key, draft[key] || []])) }
}
