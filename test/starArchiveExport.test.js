import test from 'node:test'
import assert from 'node:assert/strict'
import { relabelStarArchive } from '../src/pages/star/starArchiveExport.js'

test('rename relabels only archive metadata, preserves all business data and filename date', async () => {
  const payload = { schemaVersion: 1, exportedAt: '2026-10-06T12:00:00Z', gameVersion: '如鸢', accountDisplayName: '旧名字', inventory: [{ name: '测试星石', currentLevel: 20 }], bag: { currentCount: 1, capacity: null }, experience: { orange: null } }
  const source = { blob: new Blob([JSON.stringify(payload)]), filename: 'YuanStar_旧名字_2026-10-06.json' }
  const result = await relabelStarArchive(source, ' 新/名字 ')
  assert.deepEqual(JSON.parse(await result.blob.text()), { ...payload, accountDisplayName: ' 新/名字 ' })
  assert.equal(result.filename, 'YuanStar_新_名字_2026-10-06.json')
  assert.deepEqual(JSON.parse(await source.blob.text()), payload)
})

test('invalid archive text rejects without producing a download', async () => {
  await assert.rejects(relabelStarArchive({ blob: new Blob(['invalid JSON']), filename: 'archive.json' }, '新名称'), SyntaxError)
})
