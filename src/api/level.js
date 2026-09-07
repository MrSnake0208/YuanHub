import { request } from './request.js'

const PUBLIC_PATH = '/v1/level/catalog'
const ADMIN_PATH = '/v1/admin/level-catalog'

function pick(value, ...keys) {
  if (!value || typeof value !== 'object') return undefined
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key]
  }
  return undefined
}

function unwrap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  if ((value.status_code != null || value.statusCode != null) && value.data && typeof value.data === 'object') {
    return value.data
  }
  return value
}

function levelValues(value) {
  const source = unwrap(value)
  if (Array.isArray(source)) return source
  if (!source || typeof source !== 'object') return []
  const values = pick(source, 'levels', 'items', 'rows', 'content')
  return Array.isArray(values) ? values : []
}

function numberValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function normalizeLevel(value) {
  const source = value && typeof value === 'object' ? value : {}
  const status = String(pick(source, 'status') || 'ACTIVE').toUpperCase()
  return {
    ...source,
    id: String(pick(source, 'id', 'levelKey', 'level_key') || ''),
    game: String(pick(source, 'game') || ''),
    catOne: String(pick(source, 'catOne', 'cat_one') || ''),
    catTwo: String(pick(source, 'catTwo', 'cat_two') || ''),
    catThree: String(pick(source, 'catThree', 'cat_three') || ''),
    name: String(pick(source, 'name') || ''),
    levelId: String(pick(source, 'levelId', 'level_id') || ''),
    stageId: String(pick(source, 'stageId', 'stage_id') || ''),
    status,
    isOpen: pick(source, 'isOpen', 'is_open') == null
      ? true
      : Boolean(pick(source, 'isOpen', 'is_open')),
    sortOrder: numberValue(pick(source, 'sortOrder', 'sort_order'), 0),
    endTime: pick(source, 'endTime', 'end_time') ?? null,
    revision: numberValue(pick(source, 'revision'), 0),
    createdAt: pick(source, 'createdAt', 'created_at') ?? null,
    updatedAt: pick(source, 'updatedAt', 'updated_at') ?? null,
    createdBy: pick(source, 'createdBy', 'created_by') ?? null,
    updatedBy: pick(source, 'updatedBy', 'updated_by') ?? null
  }
}

export function normalizeLevelCatalog(value) {
  const source = unwrap(value)
  const object = source && typeof source === 'object' && !Array.isArray(source) ? source : {}
  return {
    ...object,
    catalogVersion: String(pick(object, 'catalogVersion', 'catalog_version') || ''),
    levels: levelValues(source).map(normalizeLevel)
  }
}

function countValue(source, keys) {
  if (!source || typeof source !== 'object') return 0
  for (const key of keys) {
    const value = Number(source[key])
    if (Number.isFinite(value)) return value
  }
  return 0
}

export function normalizeLevelImportPreview(value) {
  const source = unwrap(value)
  const object = source && typeof source === 'object' && !Array.isArray(source) ? source : {}
  const counts = object.counts && typeof object.counts === 'object' ? object.counts : {}
  const readCount = function (keys) {
    return countValue(object, keys) || countValue(counts, keys)
  }
  const conflicts = pick(object, 'conflicts', 'conflict_details', 'conflictDetails')
  const errors = pick(object, 'errors', 'error_details', 'errorDetails', 'invalid_details')
  const conflictCount = readCount(['conflicts', 'conflict_count', 'conflictCount'])
  const invalidCount = readCount(['invalid', 'invalid_count', 'invalidCount', 'error_count', 'errorCount', 'errors', 'errors_count', 'errorsCount'])
  return {
    ...object,
    added: readCount(['added', 'added_count', 'addedCount', 'new_count', 'newCount', 'created', 'created_count', 'createdCount']),
    updated: readCount(['updated', 'updated_count', 'updatedCount']),
    identical: readCount(['identical', 'identical_count', 'identicalCount', 'unchanged', 'unchanged_count', 'unchangedCount', 'same_count', 'sameCount']),
    duplicate: readCount(['duplicate', 'duplicates', 'duplicate_count', 'duplicateCount', 'duplicates_count', 'duplicatesCount']),
    invalid: invalidCount || (Array.isArray(errors) ? errors.length : 0),
    conflicts: conflictCount || (Array.isArray(conflicts) ? conflicts.length : 0),
    conflictDetails: Array.isArray(conflicts) ? conflicts : [],
    errorDetails: Array.isArray(errors) ? errors : []
  }
}

export function normalizeLevelHistory(value) {
  const source = unwrap(value)
  const entries = Array.isArray(source)
    ? source
    : source && Array.isArray(source.history)
      ? source.history
      : source && Array.isArray(source.revisions)
        ? source.revisions
        : source && Array.isArray(source.items)
          ? source.items
          : []
  return entries.map(function (entry) {
    const item = entry && typeof entry === 'object' ? entry : {}
    return {
      ...item,
      levelKey: String(pick(item, 'levelKey', 'level_key', 'levelId', 'level_id') || ''),
      action: String(pick(item, 'action') || '').toUpperCase(),
      revision: numberValue(pick(item, 'revision'), 0),
      actorUserId: pick(item, 'actorUserId', 'actor_user_id') ?? null,
      before: pick(item, 'before') ?? null,
      after: pick(item, 'after') ?? null,
      occurredAt: pick(item, 'occurredAt', 'occurred_at') ?? null
    }
  })
}

export function toLevelPayload(value = {}, { includeId = false, includeExpectedRevision = false } = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const payload = {
    game: String(pick(source, 'game') || '').trim(),
    cat_one: String(pick(source, 'catOne', 'cat_one') || '').trim(),
    cat_two: String(pick(source, 'catTwo', 'cat_two') || '').trim(),
    cat_three: String(pick(source, 'catThree', 'cat_three') || '').trim(),
    name: String(pick(source, 'name') || '').trim(),
    level_id: String(pick(source, 'levelId', 'level_id') || '').trim(),
    stage_id: String(pick(source, 'stageId', 'stage_id') || '').trim(),
    status: String(pick(source, 'status') || 'ACTIVE').toUpperCase(),
    is_open: pick(source, 'isOpen', 'is_open') == null ? true : Boolean(pick(source, 'isOpen', 'is_open')),
    sort_order: numberValue(pick(source, 'sortOrder', 'sort_order'), 0),
    end_time: pick(source, 'endTime', 'end_time') || null
  }
  if (includeId && pick(source, 'id', 'levelKey', 'level_key')) {
    payload.id = pick(source, 'id', 'levelKey', 'level_key')
  }
  if (includeExpectedRevision) {
    payload.expected_revision = numberValue(pick(source, 'expectedRevision', 'expected_revision', 'revision'), 0)
  }
  return payload
}

export function toLevelImportDocument(value) {
  const source = Array.isArray(value) ? { levels: value } : value
  const levels = source && typeof source === 'object' ? source.levels : null
  if (!Array.isArray(levels)) throw new TypeError('导入文档必须包含 levels 数组')
  return { levels: levels.map(function (level) { return toLevelPayload(level, { includeId: true }) }) }
}

function queryString(params = {}) {
  const query = new URLSearchParams()
  if (params.game) query.set('game', params.game)
  if (params.catOne) query.set('cat_one', params.catOne)
  if (params.catTwo) query.set('cat_two', params.catTwo)
  if (params.q) query.set('q', params.q)
  if (params.includeArchived != null) query.set('include_archived', String(Boolean(params.includeArchived)))
  if (params.openOnly != null) query.set('open_only', String(Boolean(params.openOnly)))
  const value = query.toString()
  return value ? '?' + value : ''
}

export async function listLevelCatalog(params = {}) {
  return normalizeLevelCatalog(await request(PUBLIC_PATH + queryString(params)))
}

export const getLevelCatalog = listLevelCatalog
export const getPublicLevelCatalog = listLevelCatalog

export async function getLevel(levelKey) {
  return normalizeLevel(await request(PUBLIC_PATH + '/' + encodeURIComponent(levelKey)))
}

export async function listAdminLevelCatalog() {
  return normalizeLevelCatalog(await request(ADMIN_PATH, { auth: true }))
}

function normalizeMutation(value) {
  const source = unwrap(value)
  const level = source && typeof source === 'object'
    ? pick(source, 'level', 'item', 'level_catalog') || source
    : source
  return normalizeLevel(level)
}

export async function createAdminLevel(level) {
  return normalizeMutation(await request(ADMIN_PATH, {
    method: 'POST',
    auth: true,
    body: toLevelPayload(level)
  }))
}

export async function updateAdminLevel(levelKey, level) {
  return normalizeMutation(await request(ADMIN_PATH + '/' + encodeURIComponent(levelKey), {
    method: 'PUT',
    auth: true,
    body: toLevelPayload(level, { includeExpectedRevision: true })
  }))
}

export async function archiveAdminLevel(levelKey, expectedRevision) {
  return normalizeMutation(await request(ADMIN_PATH + '/' + encodeURIComponent(levelKey) + '/archive', {
    method: 'POST',
    auth: true,
    body: { expected_revision: Number(expectedRevision) || 0 }
  }))
}

export async function restoreAdminLevel(levelKey, expectedRevision) {
  return normalizeMutation(await request(ADMIN_PATH + '/' + encodeURIComponent(levelKey) + '/restore', {
    method: 'POST',
    auth: true,
    body: { expected_revision: Number(expectedRevision) || 0 }
  }))
}

export async function previewAdminLevelImport(document) {
  return normalizeLevelImportPreview(await request(ADMIN_PATH + '/import/preview', {
    method: 'POST',
    auth: true,
    body: toLevelImportDocument(document)
  }))
}

export async function commitAdminLevelImport(document) {
  return normalizeLevelImportPreview(await request(ADMIN_PATH + '/import/commit', {
    method: 'POST',
    auth: true,
    body: toLevelImportDocument(document)
  }))
}

export async function exportAdminLevelCatalog() {
  return normalizeLevelCatalog(await request(ADMIN_PATH + '/export', { auth: true, raw: true }))
}

export async function getAdminLevelHistory(levelKey) {
  return normalizeLevelHistory(await request(ADMIN_PATH + '/' + encodeURIComponent(levelKey) + '/history', { auth: true }))
}

export const getLevelCatalogEntry = getLevel
export const createAdminLevelCatalog = createAdminLevel
export const updateAdminLevelCatalog = updateAdminLevel
export const archiveAdminLevelCatalog = archiveAdminLevel
export const restoreAdminLevelCatalog = restoreAdminLevel
export const previewAdminLevelCatalogImport = previewAdminLevelImport
export const commitAdminLevelCatalogImport = commitAdminLevelImport
export const getAdminLevelCatalogHistory = getAdminLevelHistory

export function isLevelRevisionConflict(error) {
  return !!(error && (error.status === 409 || error.code === 'level_revision_conflict'))
}
