export const OPERATOR_ORGANIZATION_STATES = ['active', 'graduated', 'skip', 'discarded']
export const OPERATOR_ORGANIZATION_FORMAT = 'yuanhub.operator-organization'

export function emptyOperatorOrganization() {
  return { schema_version: 1, status_order: [...OPERATOR_ORGANIZATION_STATES], pinned_ids: [], tags: [] }
}

function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !names.includes(key)))
    throw new Error('分类数据格式不正确')
}

function ids(value, limit = 1000) {
  if (!Array.isArray(value) || value.length > limit || value.some(id => typeof id !== 'string' || !id.length || id.length > 128) || new Set(value).size !== value.length)
    throw new Error('密探或分组列表无效，不能重复')
  return [...value]
}

export function operatorOrganizationContent(value) {
  fields(value, ['schema_version', 'status_order', 'pinned_ids', 'tags', 'account_id', 'revision'])
  if (value.schema_version !== 1) throw new Error('不支持的分类数据版本')
  const order = ids(value.status_order, 4)
  if (order.length !== 4 || order.some(state => !OPERATOR_ORGANIZATION_STATES.includes(state))) throw new Error('养成分组顺序无效')
  if (!Array.isArray(value.tags) || value.tags.length > 20) throw new Error('最多可创建 20 个标签')
  const tagIds = new Set(), names = new Set()
  const tags = value.tags.map(tag => {
    fields(tag, ['id', 'name', 'operator_ids'])
    const name = typeof tag.name === 'string' ? tag.name.trim() : ''
    if (typeof tag.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(tag.id) || tagIds.has(tag.id)) throw new Error('标签标识无效或重复')
    if (!name || name.length > 40 || names.has(name)) throw new Error('标签名称须为 1–40 字，且不能重复')
    tagIds.add(tag.id); names.add(name)
    return { id: tag.id, name, operator_ids: ids(tag.operator_ids) }
  })
  return { schema_version: 1, status_order: order, pinned_ids: ids(value.pinned_ids), tags }
}

export function operatorOrganizationRanks(value) {
  const states = new Map(value.status_order.map((state, index) => [state, index]))
  states.set('growing', states.get('active')); states.set('inactive', states.get('skip'))
  return { pins: new Map(value.pinned_ids.map((id, index) => [id, index])), states }
}

export function compareOperatorOrganization(aId, aState, bId, bState, ranks) {
  const aPin = ranks.pins.get(aId), bPin = ranks.pins.get(bId)
  if (aPin !== undefined || bPin !== undefined) return (aPin ?? Infinity) - (bPin ?? Infinity)
  return (ranks.states.get(aState) ?? 99) - (ranks.states.get(bState) ?? 99)
}

export function updateOperatorTag(value, tagId, operatorIds, add) {
  const next = operatorOrganizationContent(value)
  const tag = next.tags.find(item => item.id === tagId)
  if (!tag) throw new Error('标签不存在，请重新选择')
  const selected = new Set(operatorIds)
  tag.operator_ids = add ? [...new Set([...tag.operator_ids, ...selected])] : tag.operator_ids.filter(id => !selected.has(id))
  return operatorOrganizationContent(next)
}

export function operatorOrganizationBackup(value, game) {
  return { format: OPERATOR_ORGANIZATION_FORMAT, version: 1, game, organization: operatorOrganizationContent(value) }
}

export function readOperatorOrganizationBackup(text, game, catalog) {
  if (text.length > 1024 * 1024) throw new Error('分类备份超过 1 MB')
  const document = JSON.parse(text)
  fields(document, ['format', 'version', 'game', 'organization'])
  if (document.format !== OPERATOR_ORGANIZATION_FORMAT || document.version !== 1) throw new Error('请选择独立的密探分类备份')
  if (document.game !== game) throw new Error('备份游戏版本与当前账号不一致')
  const content = operatorOrganizationContent(document.organization)
  const referenced = new Set([...content.pinned_ids, ...content.tags.flatMap(tag => tag.operator_ids)])
  for (const id of referenced) {
    if (!catalog[id] || !catalog[id].games?.includes(game)) throw new Error('备份包含当前游戏图鉴未收录的密探：' + id)
  }
  return content
}
