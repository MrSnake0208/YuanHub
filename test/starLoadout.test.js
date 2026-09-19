import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { getCurrentStarLoadout, putCurrentStarLoadout } from '../src/api/starLoadout.js'
import { auth } from '../src/store/auth.js'
import {
  STAR_LOADOUT_SLOTS,
  assignInstanceToDraft,
  buildStarLoadoutCandidates,
  canAssignStarInstance,
  chooseBestMatchingInstance,
  clearDraftSlot,
  cloneLoadout,
  emptyLoadout,
  normalizeLoadout,
  nextGroupSlot,
  slotKind,
} from '../src/domain/starLoadout.js'

const target = { id: 'target', name: '目标密探', prof: '地', subProf: '龙盾' }
const other = { id: 'other', name: '其他密探', prof: '水', subProf: '神纪' }
const run = promisify(execFile)
const orderGenerator = fileURLToPath(new URL('../scripts/build-star-inventory-order.mjs', import.meta.url))

const equivalentYuanStarSnapshot = `
function sortedInventory(inventory, catalog) {
  const kindOrder = { "主星": 0, "辅星": 1 };
  const qualityOrder = { "橙": 0, "紫": 1, "蓝": 2, "绿": 3, "白": 4 };
  return [...inventory].sort((left, right) => (
    kindOrder[left.kind] - kindOrder[right.kind]
    || catalog.orderIndex(left.name) - catalog.orderIndex(right.name)
    || right.level - left.level
    || qualityOrder[left.quality] - qualityOrder[right.quality]
    || left.provenance.sourceOrder - right.provenance.sourceOrder
    || (left.provenance.row ?? -1) - (right.provenance.row ?? -1)
    || (left.provenance.column ?? -1) - (right.provenance.column ?? -1)
    || left.starInstanceId.localeCompare(right.starInstanceId)
  ));
}
export function sentinel() {}
`

async function runOrderGenerator(snapshot) {
  const directory = await mkdtemp(path.join(tmpdir(), 'yuanhub-order-guard-'))
  const sourcePath = path.join(directory, 'snapshot.ts')
  const outputPath = path.join(directory, 'starInventoryOrder.js')
  await writeFile(sourcePath, snapshot, 'utf8')
  try {
    return await run(process.execPath, [orderGenerator, sourcePath, outputPath])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function entry(instanceId, kind, name, quality = 'orange', level = 60) {
  return { instance_id: instanceId, kind, name, quality, level }
}

test('星石配装 API 编码 account_id、附带认证，并透传完整 snapshot body', async function () {
  const previousFetch = globalThis.fetch
  const previousToken = auth.accessToken
  const accountId = 'acc /?&中文'
  const body = { expected_revision: 3, loadouts: { operator: { main1: 'stone-1', main2: null, main3: null, support1: null, support2: null, support3: null } } }
  const calls = []
  auth.accessToken = 'test-access-token'
  globalThis.fetch = async function (url, options) {
    calls.push({ url, options })
    return { ok: true, status: 200, statusText: 'OK', json: async function () { return { status_code: 200, data: { account_id: accountId, revision: 4 } } } }
  }
  try {
    assert.equal((await getCurrentStarLoadout(accountId)).revision, 4)
    assert.equal((await putCurrentStarLoadout(accountId, body)).revision, 4)
    assert.match(calls[0].url, /\/v1\/star-loadout\/current\?account_id=acc%20%2F%3F%26%E4%B8%AD%E6%96%87$/)
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-access-token')
    assert.equal(calls[1].options.body, JSON.stringify(body))
  } finally {
    auth.accessToken = previousToken
    globalThis.fetch = previousFetch
  }
})

for (const status of [409, 422]) {
  test(`星石配装 API 保留 ${status} error handling`, async function () {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async function () {
      return { ok: false, status, statusText: 'Rejected', json: async function () { return { status_code: status, message: 'contract rejection' } } }
    }
    try {
      await assert.rejects(
        putCurrentStarLoadout('account', { expected_revision: 0, loadouts: {} }),
        function (error) { return error.status === status && error.message === 'contract rejection' },
      )
    } finally {
      globalThis.fetch = previousFetch
    }
  })
}

test('六槽 contract 归一化和复制不共享对象', function () {
  assert.deepEqual(STAR_LOADOUT_SLOTS, ['main1', 'main2', 'main3', 'support1', 'support2', 'support3'])
  assert.equal(slotKind('main3'), 'main')
  assert.equal(slotKind('support2'), 'support')
  assert.equal(slotKind('assist1'), null)
  assert.deepEqual(emptyLoadout(), { main1: null, main2: null, main3: null, support1: null, support2: null, support3: null })
  const normalized = normalizeLoadout({ main1: '  main-1 ', support3: 'support-3', unknown: 'ignore' })
  assert.deepEqual(normalized, { main1: 'main-1', main2: null, main3: null, support1: null, support2: null, support3: 'support-3' })
  const copied = cloneLoadout(normalized)
  copied.main1 = null
  assert.equal(normalized.main1, 'main-1')
})

test('candidate builder uses only inventory order, kind, restriction and occupancy contracts', function () {
  const inventoryEntries = [
    entry('m-free', 'main', '天府'),
    entry('m-other', 'main', '天府'),
    entry('s-allowed', 'support', '天魁'),
    entry('s-illegal', 'support', '天钺'),
    entry('s-own', 'support', '天魁'),
  ]
  const loadouts = {
    target: { support1: 's-own' },
    other: { main1: 'm-other', support1: 's-illegal' },
  }
  const main = buildStarLoadoutCandidates({
    inventoryEntries,
    loadouts,
    targetOperator: target,
    selectedSlot: 'main1',
    operatorDisplayNameMap: { other: '张飞' },
    resolveOperatorName: function () { return '其他密探' },
    planTargets: { ignored: { main1: 'never-an-inventory-instance' } },
  })
  assert.deepEqual(main.map(function (candidate) { return candidate.instanceId }), ['m-free', 'm-other'])
  assert.deepEqual(main[1].occupiedBy, { operatorId: 'other', operatorName: '张飞', slot: 'main1' })
  const support = buildStarLoadoutCandidates({ inventoryEntries, loadouts, targetOperator: target, selectedSlot: 'support2' })
  assert.deepEqual(support.map(function (candidate) { return candidate.instanceId }), ['s-allowed', 's-own'])
  assert.equal(support[1].occupiedBy.operatorId, 'target')
  const hidden = buildStarLoadoutCandidates({ inventoryEntries, loadouts, targetOperator: target, selectedSlot: 'main1', hideEquipped: true })
  assert.deepEqual(hidden.map(function (candidate) { return candidate.instanceId }), ['m-free'])
  const ownStillVisible = buildStarLoadoutCandidates({ inventoryEntries, loadouts, targetOperator: target, selectedSlot: 'support1', hideEquipped: true })
  assert.deepEqual(ownStillVisible.map(function (candidate) { return candidate.instanceId }), ['s-allowed', 's-own'])
  const unknownOwner = buildStarLoadoutCandidates({
    inventoryEntries,
    loadouts,
    targetOperator: target,
    selectedSlot: 'main1',
    resolveOperatorName: function () { return '其他密探' },
  })
  assert.equal(unknownOwner[1].occupiedBy.operatorName, '其他密探')
})

test('candidate and resolver use YuanStar default business order instead of Backend instanceId or input order', function () {
  const scrambledInventory = [
    Object.assign(entry('c-catalog-later', 'main', '武曲', 'orange', 60), { source_order: 0 }),
    Object.assign(entry('b-purple', 'main', '天府', 'purple', 60), { source_order: 0 }),
    Object.assign(entry('a-late-source', 'main', '天府', 'orange', 60), { source_order: 9 }),
    Object.assign(entry('y-low-level', 'main', '天府', 'white', 1), { source_order: 0 }),
    Object.assign(entry('z-early-source', 'main', '天府', 'orange', 60), { source_order: 1 }),
  ]
  const expected = ['z-early-source', 'a-late-source', 'b-purple', 'y-low-level', 'c-catalog-later']
  const candidates = buildStarLoadoutCandidates({ inventoryEntries: scrambledInventory, loadouts: {}, targetOperator: target, selectedSlot: 'main1' })
  assert.deepEqual(candidates.map(function (candidate) { return candidate.instanceId }), expected)
  const reversed = buildStarLoadoutCandidates({ inventoryEntries: [...scrambledInventory].reverse(), loadouts: {}, targetOperator: target, selectedSlot: 'main1' })
  assert.deepEqual(reversed.map(function (candidate) { return candidate.instanceId }), expected)
  const selected = chooseBestMatchingInstance({ inventoryEntries: scrambledInventory, loadouts: {}, targetOperator: target, requiredKind: 'main', requiredName: '天府' })
  assert.equal(selected.instanceId, 'z-early-source')
})

test('Backend entries without provenance fall through to stable instanceId ordering', function () {
  const sameBusinessFields = [
    entry('z-instance', 'main', '天府', 'orange', 60),
    entry('a-instance', 'main', '天府', 'orange', 60),
  ]
  const candidateIds = buildStarLoadoutCandidates({ inventoryEntries: sameBusinessFields, loadouts: {}, targetOperator: target, selectedSlot: 'main1' })
    .map(function (candidate) { return candidate.instanceId })
  const reverseCandidateIds = buildStarLoadoutCandidates({ inventoryEntries: [...sameBusinessFields].reverse(), loadouts: {}, targetOperator: target, selectedSlot: 'main1' })
    .map(function (candidate) { return candidate.instanceId })
  assert.deepEqual(candidateIds, ['a-instance', 'z-instance'])
  assert.deepEqual(reverseCandidateIds, candidateIds)
  assert.equal(chooseBestMatchingInstance({ inventoryEntries: sameBusinessFields, loadouts: {}, targetOperator: target, requiredKind: 'main', requiredName: '天府' }).instanceId, 'a-instance')
})

test('YuanStar inventory-order generator rejects comparator drift but accepts whitespace-only changes', async function () {
  await runOrderGenerator(equivalentYuanStarSnapshot)
  const reordered = equivalentYuanStarSnapshot.replace(
    '|| right.level - left.level\n    || qualityOrder[left.quality] - qualityOrder[right.quality]',
    '|| qualityOrder[left.quality] - qualityOrder[right.quality]\n    || right.level - left.level',
  )
  await assert.rejects(runOrderGenerator(reordered), /comparator priority changed/)
  const inserted = equivalentYuanStarSnapshot.replace(
    '|| left.provenance.sourceOrder - right.provenance.sourceOrder',
    '|| left.manualPriority - right.manualPriority\n    || left.provenance.sourceOrder - right.provenance.sourceOrder',
  )
  await assert.rejects(runOrderGenerator(inserted), /comparator priority changed/)
  const deleted = equivalentYuanStarSnapshot.replace(
    '|| (left.provenance.column ?? -1) - (right.provenance.column ?? -1)\n    ',
    '',
  )
  await assert.rejects(runOrderGenerator(deleted), /comparator priority changed/)
  const whitespaceOnly = equivalentYuanStarSnapshot.replace(
    'kindOrder[left.kind] - kindOrder[right.kind]',
    'kindOrder[ left.kind ]\n      -\t kindOrder[ right.kind ]',
  )
  await runOrderGenerator(whitespaceOnly)
})

test('draft assignment moves free, own, and other-owner instances with global uniqueness', function () {
  const base = {
    target: { main1: 'own-main', main2: 'duplicate' },
    other: { support1: 'other-support', support2: 'duplicate' },
  }
  const free = assignInstanceToDraft({ loadouts: base, targetOperatorId: 'target', targetSlot: 'support1', instanceId: 'free' })
  assert.equal(free.target.support1, 'free')
  assert.equal(base.target.support1, undefined)
  const ownMove = assignInstanceToDraft({ loadouts: free, targetOperatorId: 'target', targetSlot: 'main3', instanceId: 'own-main' })
  assert.equal(ownMove.target.main1, null)
  assert.equal(ownMove.target.main3, 'own-main')
  const stolen = assignInstanceToDraft({ loadouts: ownMove, targetOperatorId: 'target', targetSlot: 'support2', instanceId: 'other-support' })
  assert.equal(stolen.other.support1, null)
  assert.equal(stolen.target.support2, 'other-support')
  const allIds = Object.values(stolen).flatMap(function (loadout) { return Object.values(loadout).filter(Boolean) })
  assert.equal(new Set(allIds).size, allIds.length)
  const cleared = clearDraftSlot({ loadouts: stolen, targetOperatorId: 'target', targetSlot: 'support2' })
  assert.equal(cleared.target.support2, null)
})

test('同组同名约束阻止填空，但允许替换该名称原所在槽位', function () {
  const inventoryEntries = [entry('main-a', 'main', '天府'), entry('main-b', 'main', '天府'), entry('main-c', 'main', '武曲'), entry('support-a', 'support', '文曲'), entry('support-b', 'support', '文曲')]
  const loadouts = { target: { main1: 'main-a', main2: null, main3: 'main-c', support1: 'support-a', support2: null, support3: null } }
  assert.equal(canAssignStarInstance({ loadouts, targetOperatorId: 'target', targetSlot: 'main2', instanceId: 'main-b', inventoryEntries }).allowed, false)
  assert.equal(canAssignStarInstance({ loadouts, targetOperatorId: 'target', targetSlot: 'support2', instanceId: 'support-b', inventoryEntries }).allowed, false)
  assert.equal(canAssignStarInstance({ loadouts, targetOperatorId: 'target', targetSlot: 'main1', instanceId: 'main-b', inventoryEntries }).allowed, true)
  const blocked = assignInstanceToDraft({ loadouts, targetOperatorId: 'target', targetSlot: 'main2', instanceId: 'main-b', inventoryEntries })
  assert.equal(blocked.target.main2, null)
  const replacement = assignInstanceToDraft({ loadouts, targetOperatorId: 'target', targetSlot: 'main1', instanceId: 'main-b', inventoryEntries })
  assert.equal(replacement.target.main1, 'main-b')
})

test('按组连续选择始终填第一个空槽，满组必须显式 replacement', function () {
  let loadout = emptyLoadout()
  assert.equal(nextGroupSlot({ loadout, kind: 'main' }), 'main1')
  loadout.main1 = 'a'
  assert.equal(nextGroupSlot({ loadout, kind: 'main' }), 'main2')
  loadout.main2 = 'b'
  assert.equal(nextGroupSlot({ loadout, kind: 'main' }), 'main3')
  loadout.main3 = 'c'
  assert.equal(nextGroupSlot({ loadout, kind: 'main' }), null)
  assert.equal(nextGroupSlot({ loadout, kind: 'main', replacementSlot: 'main2' }), 'main2')
  assert.equal(nextGroupSlot({ loadout, kind: 'support', replacementSlot: 'main2' }), 'support1')
})

test('resolver uses own then free then unprotected occupied inventory candidates without re-sorting', function () {
  const inventoryEntries = [
    entry('other-first', 'main', '天府'),
    entry('free-second', 'main', '天府'),
    entry('own-third', 'main', '天府'),
    entry('illegal-ziwei', 'main', '紫微'),
  ]
  const loadouts = {
    target: { main1: 'own-third' },
    other: { main1: 'other-first' },
  }
  assert.equal(chooseBestMatchingInstance({ inventoryEntries, loadouts, targetOperator: target, requiredKind: 'main', requiredName: '天府' }).instanceId, 'own-third')
  const withoutOwn = { other: { main1: 'other-first' } }
  assert.equal(chooseBestMatchingInstance({ inventoryEntries, loadouts: withoutOwn, targetOperator: target, requiredKind: 'main', requiredName: '天府' }).instanceId, 'free-second')
  const noFree = [entry('other-first', 'main', '天府'), entry('other-second', 'main', '天府')]
  const occupied = { other: { main1: 'other-first', main2: 'other-second' } }
  assert.equal(chooseBestMatchingInstance({ inventoryEntries: noFree, loadouts: occupied, targetOperator: target, requiredKind: 'main', requiredName: '天府' }).instanceId, 'other-first')
  assert.equal(chooseBestMatchingInstance({ inventoryEntries: noFree, loadouts: occupied, targetOperator: target, requiredKind: 'main', requiredName: '天府', hideEquipped: true }), null)
  assert.equal(chooseBestMatchingInstance({ inventoryEntries: noFree, loadouts: occupied, targetOperator: target, requiredKind: 'main', requiredName: '天府', protectedOperatorIds: ['other'] }), null)
  assert.equal(chooseBestMatchingInstance({ inventoryEntries, loadouts: {}, targetOperator: other, requiredKind: 'main', requiredName: '紫微' }), null)
})
