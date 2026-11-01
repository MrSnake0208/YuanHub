import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, unlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { precompress, validateCompression, fixedTargets, sha256, listFiles, worthCompressing } from '../scripts/ocr-compression.mjs'

const worker = 'assets/browser-vision-worker-test.js'
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'yuanhub-ocr-compression-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const expected = {}
  const originals = {}
  for (const path of [worker, ...fixedTargets]) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    const bytes = Buffer.from('fixture OCR resource: ' + path + '\n'.repeat(100))
    const raw = Buffer.concat(Array.from({ length: 300 }, () => bytes))
    await writeFile(join(root, path), raw)
    expected[path] = sha256(raw)
    originals[path] = raw
  }
  return { root, expected, originals }
}

test('gzip generation preserves original bytes, decompresses identically and is byte-stable', async (t) => {
  const { root, expected, originals } = await fixture(t)
  const first = await precompress(root, expected)
  assert.equal(first.assets.length, 8)
  assert.equal(first.assets.filter((asset) => asset.gzip).length, 8)
  const firstOutputs = new Map()
  for (const asset of first.assets) {
    const compressed = await readFile(join(root, asset.gzip.path))
    firstOutputs.set(asset.path, compressed)
    const restored = gunzipSync(compressed)
    assert.deepEqual(restored, originals[asset.path])
    assert.equal(sha256(restored), expected[asset.path])
    assert.deepEqual(await readFile(join(root, asset.path)), originals[asset.path])
    assert.equal(asset.gzip.savingBytes, asset.rawBytes - compressed.length)
  }
  assert.equal(await validateCompression(root, first, expected), true)
  assert.deepEqual(await precompress(root, expected), first, 'second build has identical compressed hashes and manifest')
  for (const asset of first.assets) {
    assert.deepEqual(await readFile(join(root, asset.gzip.path)), firstOutputs.get(asset.path))
    assert.deepEqual(await readFile(join(root, asset.path)), originals[asset.path])
  }
})

test('changed originals reject stale validation and overwrite stale gzip', async (t) => {
  const { root } = await fixture(t)
  const first = await precompress(root)
  await writeFile(join(root, worker), 'different worker content\n'.repeat(3000))
  await assert.rejects(validateCompression(root, first), /Stale compression manifest/)
  const next = await precompress(root)
  assert.notEqual(next.assets[0].sha256, first.assets[0].sha256)
  assert.notEqual(next.assets[0].gzip.sha256, first.assets[0].gzip.sha256)
  assert.deepEqual(gunzipSync(await readFile(join(root, worker + '.gz'))), await readFile(join(root, worker)))
  assert.equal(await validateCompression(root, next), true)
})

test('gzip-only migration removes all legacy .br files without touching original files', async (t) => {
  const { root, expected, originals } = await fixture(t)
  await writeFile(join(root, 'foo'), 'keep unrelated original')
  await mkdir(join(root, 'legacy'), { recursive: true })
  for (const path of ['foo.br', worker + '.br', 'legacy/removed.br']) await writeFile(join(root, path), 'old compressed artifact')
  assert.equal((await listFiles(root)).filter((path) => path.endsWith('.br')).length, 3)
  const manifest = await precompress(root, expected)
  assert.equal((await listFiles(root)).some((path) => path.endsWith('.br')), false)
  assert.equal((await listFiles(root)).filter((path) => path.endsWith('.gz')).length, 8)
  for (const path of Object.keys(originals)) assert.deepEqual(await readFile(join(root, path)), originals[path])
  assert.equal(await readFile(join(root, 'foo'), 'utf8'), 'keep unrelated original')
  assert.equal(await validateCompression(root, manifest, expected), true)
})

test('removed hashed worker has no orphan siblings after next build', async (t) => {
  const { root } = await fixture(t)
  await precompress(root)
  await unlink(join(root, worker))
  const renamed = 'assets/browser-vision-worker-next.js'
  await writeFile(join(root, renamed), 'next worker\n'.repeat(3000))
  const next = await precompress(root)
  const files = await listFiles(root)
  assert.equal(files.some((path) => path.startsWith(worker)), false)
  assert.equal(next.assets[0].path, renamed)
  assert.equal(await validateCompression(root, next), true)
})

test('small or incompressible targets drop old siblings; unrelated resources are excluded', async (t) => {
  const { root } = await fixture(t)
  await writeFile(join(root, 'yuanstar-embed.css'), 'styles\n'.repeat(10000))
  await precompress(root)
  await writeFile(join(root, worker), 'small')
  await writeFile(join(root, 'yuanstar-embed.js'), randomBytes(70000))
  const next = await precompress(root)
  assert.equal(next.assets[0].gzip, null)
  assert.equal(next.assets[1].gzip, null)
  const files = await listFiles(root)
  assert.equal(files.includes(worker + '.gz'), false)
  assert.equal(files.some((path) => /\.css\.gz$/.test(path)), false)
  assert.equal(worthCompressing(16383, 100), false)
  assert.equal(worthCompressing(20000, 19500), false)
  assert.equal(worthCompressing(20000, 18000), true)
  assert.equal(worthCompressing(100000, 98000), false, 'saving percentage must pass')
  assert.equal(worthCompressing(16384, 15384), false, 'saving bytes must pass')
})

test('corrupt, missing, orphan and provenance-mismatched files fail the deployment validation', async (t) => {
  const { root, expected } = await fixture(t)
  await assert.rejects(precompress(root, { ...expected, [worker]: 'incorrect' }), /differs from provenance/)
  let manifest = await precompress(root, expected)
  const output = manifest.assets[0].gzip.path
  await writeFile(join(root, output), 'corrupt')
  await assert.rejects(validateCompression(root, manifest, expected), /Invalid compression bytes/)
  manifest = await precompress(root, expected)
  await unlink(join(root, output))
  await assert.rejects(validateCompression(root, manifest, expected), /ENOENT/)
  manifest = await precompress(root, expected)
  await writeFile(join(root, 'assets/browser-vision-worker-old.js.gz'), 'stale')
  await assert.rejects(validateCompression(root, manifest, expected), /stale compressed siblings/)
  await assert.rejects(precompress(root + '-missing'), /ENOENT/)
  await unlink(join(root, 'models/PP-OCRv6_det_small.onnx'))
  await assert.rejects(precompress(root), /Missing OCR asset/)
  const files = await listFiles(root)
  assert.equal(files.includes('models/PP-OCRv6_det_small.onnx.gz'), false)
})
