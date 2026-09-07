import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  normalizeLevel,
  normalizeLevelCatalog,
  normalizeLevelImportPreview,
  toLevelImportDocument,
  toLevelPayload
} from '../src/api/level.js'
import { ADMIN_PERMISSIONS, hasPermission, normalizeAdminAccess } from '../src/utils/authPermissions.js'
import { routes } from '../src/router/routes.js'
import { getVisibleAdminTools } from '../src/utils/adminTools.js'

function readSource(path) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

test('normalizes level catalog snake_case fields and catalog version', function () {
  const catalog = normalizeLevelCatalog({
    catalog_version: '2026-09-07T12:34:56Z',
    levels: [{
      id: 'lvl_1',
      cat_one: '地宫',
      cat_two: '灯之国',
      cat_three: '普通',
      level_id: 'level/one',
      stage_id: 'stage_one',
      is_open: false,
      sort_order: 4,
      revision: 3,
      status: 'ARCHIVED'
    }]
  })

  assert.equal(catalog.catalogVersion, '2026-09-07T12:34:56Z')
  assert.deepEqual(catalog.levels[0], {
    id: 'lvl_1',
    cat_one: '地宫',
    cat_two: '灯之国',
    cat_three: '普通',
    level_id: 'level/one',
    stage_id: 'stage_one',
    is_open: false,
    sort_order: 4,
    revision: 3,
    status: 'ARCHIVED',
    game: '',
    catOne: '地宫',
    catTwo: '灯之国',
    catThree: '普通',
    name: '',
    levelId: 'level/one',
    stageId: 'stage_one',
    isOpen: false,
    sortOrder: 4,
    endTime: null,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null
  })
})

test('builds snake_case write payloads with revision and import IDs', function () {
  const level = {
    id: 'lvl_1', game: '通用', catOne: '地宫', catTwo: '灯之国', catThree: '普通',
    name: '灯之国', levelId: 'level/one', stageId: 'stage_one', status: 'ACTIVE',
    isOpen: true, sortOrder: 2, endTime: '', revision: 7
  }
  assert.deepEqual(toLevelPayload(level, { includeExpectedRevision: true }), {
    game: '通用', cat_one: '地宫', cat_two: '灯之国', cat_three: '普通', name: '灯之国',
    level_id: 'level/one', stage_id: 'stage_one', status: 'ACTIVE', is_open: true,
    sort_order: 2, end_time: null, expected_revision: 7
  })
  assert.deepEqual(toLevelImportDocument({ levels: [level] }), {
    levels: [{
      id: 'lvl_1', game: '通用', cat_one: '地宫', cat_two: '灯之国', cat_three: '普通', name: '灯之国',
      level_id: 'level/one', stage_id: 'stage_one', status: 'ACTIVE', is_open: true,
      sort_order: 2, end_time: null
    }]
  })
})

test('normalizes import preview counts and details', function () {
  const preview = normalizeLevelImportPreview({
    added_count: 2,
    updated_count: 3,
    identical_count: 4,
    duplicate_count: 1,
    error_count: 5,
    conflict_count: 6,
    conflicts: [{ reason: 'revision' }],
    errors: [{ message: 'missing name' }]
  })
  assert.deepEqual(
    [preview.added, preview.updated, preview.identical, preview.duplicate, preview.invalid, preview.conflicts],
    [2, 3, 4, 1, 5, 6]
  )
  assert.equal(preview.conflictDetails.length, 1)
  assert.equal(preview.errorDetails.length, 1)
  assert.equal(preview.conflicts, 6)
  assert.equal(preview.invalid, 5)
})

test('registers the permission-protected level management route and tool', function () {
  const route = routes.find(function (item) { return item.path === '/level/admin' })
  assert.ok(route)
  assert.equal(route.meta.requiresAuth, true)
  assert.equal(route.meta.requiredPermission, 'level_catalog:write')
  const access = normalizeAdminAccess({ permissions: [ADMIN_PERMISSIONS.LEVEL_CATALOG_WRITE] })
  assert.equal(hasPermission(access, ADMIN_PERMISSIONS.LEVEL_CATALOG_WRITE), true)
  assert.deepEqual(getVisibleAdminTools(access).map(function (tool) { return tool.to }), ['/level/admin'])
})

test('keeps the level page contracts for conflict handling and mobile readability', function () {
  const page = readSource('../src/pages/level/admin.vue')
  const api = readSource('../src/api/level.js')
  assert.match(api, /\/v1\/level\/catalog/)
  assert.match(api, /\/v1\/admin\/level-catalog/)
  assert.match(api, /expected_revision/)
  assert.match(api, /level_revision_conflict/)
  assert.match(page, /level_revision_conflict|isLevelRevisionConflict/)
  assert.match(page, /重新加载最新数据后再保存/)
  assert.match(page, /class="level-table-wrap"/)
  assert.match(page, /class="level-mobile-list"/)
  assert.match(page, /previewAdminLevelImport/)
  assert.match(page, /commitAdminLevelImport/)
  assert.match(page, /link\.download = 'level-catalog\.json'/)
})
