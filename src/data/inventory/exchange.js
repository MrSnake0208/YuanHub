export const MAX_STAMINA_COST = 2147483647

function owns(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key)
}

function recordValue(record, snakeKey, camelKey) {
  if (owns(record, camelKey)) return record[camelKey]
  return record && record[snakeKey]
}

export function isDispatchReward(record) {
  const recordType = recordValue(record, 'record_type', 'recordType')
  const channel = recordValue(record, 'acquisition_channel', 'acquisitionChannel')
  return recordType === 'reward_delta' && typeof channel === 'string' && channel.includes('派遣')
}

function staminaField(record) {
  const hasSnake = owns(record, 'stamina_cost') && record.stamina_cost !== undefined
  const hasCamel = owns(record, 'staminaCost') && record.staminaCost !== undefined
  if (hasSnake && hasCamel && record.stamina_cost !== record.staminaCost) {
    throw new TypeError('消耗体力字段值不一致')
  }
  return {
    present: hasSnake || hasCamel,
    value: hasCamel ? record.staminaCost : record && record.stamina_cost
  }
}

export function validateInventoryRecord(record) {
  const stamina = staminaField(record)
  if (isDispatchReward(record) && !stamina.present) {
    throw new TypeError('派遣奖励必须填写消耗体力数')
  }
  if (!isDispatchReward(record) && stamina.present) {
    throw new TypeError('仅派遣奖励可以填写消耗体力数')
  }
  if (stamina.present && (!Number.isInteger(stamina.value) || stamina.value < 0 || stamina.value > MAX_STAMINA_COST)) {
    throw new TypeError('消耗体力必须是 0 至 2147483647 的整数')
  }
  return record
}

export function validateInventoryExchangeDocument(document) {
  const records = document && document.records
  if (!Array.isArray(records)) return document
  records.forEach(validateInventoryRecord)
  return document
}

export function serializeInventoryRecord(record) {
  const serialized = Object.assign({}, record)
  const stamina = staminaField(record)
  delete serialized.staminaCost
  if (stamina.present) serialized.stamina_cost = stamina.value
  else delete serialized.stamina_cost
  validateInventoryRecord(serialized)
  return serialized
}

export function serializeInventoryExchangeDocument(document) {
  if (!document || typeof document !== 'object') return document
  const serialized = Object.assign({}, document)
  if (Array.isArray(document.records)) {
    serialized.records = document.records.map(serializeInventoryRecord)
  }
  return serialized
}

export function deserializeInventoryRecord(record) {
  if (!record || typeof record !== 'object') return record
  const deserialized = Object.assign({}, record)
  if (owns(record, 'stamina_cost')) deserialized.staminaCost = record.stamina_cost
  delete deserialized.stamina_cost
  return deserialized
}

export function deserializeInventoryRecordPage(page) {
  if (!page || typeof page !== 'object') return page
  const deserialized = Object.assign({}, page)
  if (Array.isArray(page.items)) deserialized.items = page.items.map(deserializeInventoryRecord)
  return deserialized
}

export function deserializeInventoryExchangeDocument(document) {
  if (!document || typeof document !== 'object') return document
  const deserialized = Object.assign({}, document)
  if (Array.isArray(document.records)) {
    deserialized.records = document.records.map(deserializeInventoryRecord)
  }
  return deserialized
}

export function staminaCostOf(record) {
  if (!isDispatchReward(record)) return undefined
  const stamina = staminaField(record)
  if (!stamina.present || !Number.isInteger(stamina.value)) return undefined
  if (stamina.value < 0 || stamina.value > MAX_STAMINA_COST) return undefined
  return stamina.value
}
