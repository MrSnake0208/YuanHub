import test from 'node:test'
import assert from 'node:assert/strict'
import { quickDraftSignature } from '../src/utils/quickDraft.js'

test('快捷录入草稿能识别勾选、清空和有勾选时的批量设置变更', () => {
  const empty = quickDraftSignature([], { level: 0 })
  assert.equal(empty, quickDraftSignature([], { level: 90 }))
  const selected = quickDraftSignature(['a'], { level: 0 })
  assert.notEqual(empty, selected)
  assert.notEqual(selected, quickDraftSignature(['a'], { level: 90 }))
  assert.equal(empty, quickDraftSignature([], { level: 0 }))
})
