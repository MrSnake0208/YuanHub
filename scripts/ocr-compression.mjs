import { createHash } from 'node:crypto'
import { readdir, readFile, lstat, writeFile, unlink, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzip, gunzip } from 'node:zlib'

export const gzipAsync = promisify(gzip)
export const gunzipAsync = promisify(gunzip)
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const fixedTargets = [
  'yuanstar-embed.js',
  'ort/ort-wasm-simd-threaded.mjs',
  'ort/ort-wasm-simd-threaded.wasm',
  'models/PP-OCRv6_det_small.onnx',
  'models/PP-OCRv6_rec_small.onnx',
  'models/ch_ppocr_mobile_v2.0_cls_mobile.onnx',
  'models/ppocrv6_chars.txt',
]
export const isTarget = (path) => fixedTargets.includes(path) || /^assets\/browser-vision-worker-[\w-]+\.js$/.test(path)
export const compressionPolicy = Object.freeze({ minRawBytes: 16 * 1024, minSavingBytes: 1024, minSavingPercent: 5, gzipLevel: 6 })
export const worthCompressing = (rawBytes, compressedBytes) => rawBytes >= compressionPolicy.minRawBytes &&
  rawBytes - compressedBytes >= compressionPolicy.minSavingBytes &&
  (rawBytes - compressedBytes) / rawBytes * 100 >= compressionPolicy.minSavingPercent
const siblingSource = (path) => path.slice(0, -3)
const isOwnedGzip = (path) => path.endsWith('.gz') && isTarget(siblingSource(path))

export async function listFiles(root, prefix = '') {
  const result = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix + entry.name
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported: ${path}`)
    if (entry.isDirectory()) result.push(...await listFiles(root, path + '/'))
    else if (entry.isFile()) result.push(path)
  }
  return result.sort()
}

export async function targetFiles(root) {
  if (!(await lstat(root)).isDirectory()) throw new Error('OCR asset root must be a real directory')
  const files = await listFiles(root)
  const workers = files.filter((path) => /^assets\/browser-vision-worker-[\w-]+\.js$/.test(path))
  if (workers.length !== 1) throw new Error(`Expected one OCR worker, found ${workers.length}`)
  for (const path of fixedTargets) if (!files.includes(path)) throw new Error(`Missing OCR asset: ${path}`)
  return [workers[0], ...fixedTargets]
}

function checkSourceHash(path, hash, expectedHashes) {
  if (expectedHashes && expectedHashes[path] !== hash) throw new Error(`Original asset differs from provenance: ${path}`)
}

// Only deployment derivatives are written. Never run this against public/.
export async function precompress(root, expectedHashes) {
  if (!(await lstat(root)).isDirectory()) throw new Error('OCR asset root must be a real directory')
  const existingFiles = await listFiles(root)
  for (const path of existingFiles) {
    // Migration cleanup only; unsupported legacy artifacts must not ship.
    if (path.endsWith('.br') || (isOwnedGzip(path) && !existingFiles.includes(siblingSource(path)))) await unlink(join(root, path))
  }
  const paths = await targetFiles(root)
  const sources = []
  for (const path of paths) {
    const raw = await readFile(join(root, path))
    const hash = sha256(raw)
    checkSourceHash(path, hash, expectedHashes)
    sources.push({ path, raw, hash, times: await lstat(join(root, path)) })
  }
  // Includes siblings for removed or renamed workers, and below-threshold assets.
  for (const path of await listFiles(root)) if (isOwnedGzip(path)) await unlink(join(root, path))
  const assets = []
  for (const { path, raw, hash, times } of sources) {
    let output = null
    if (raw.length >= compressionPolicy.minRawBytes) {
      const compressed = await gzipAsync(raw, { level: compressionPolicy.gzipLevel })
      if (worthCompressing(raw.length, compressed.length)) {
        const restored = await gunzipAsync(compressed)
        if (!restored.equals(raw) || sha256(restored) !== hash) throw new Error(`Decompression identity failed: ${path}`)
        const outputPath = path + '.gz'
        await writeFile(join(root, outputPath), compressed)
        // nginx recommends identical modification times for original and sibling.
        await utimes(join(root, outputPath), times.atime, times.mtime)
        output = { path: outputPath, bytes: compressed.length, sha256: sha256(compressed), savingBytes: raw.length - compressed.length, savingPercent: (1 - compressed.length / raw.length) * 100 }
      }
    }
    if (sha256(await readFile(join(root, path))) !== hash) throw new Error(`Original changed during compression: ${path}`)
    assets.push({ path, rawBytes: raw.length, sha256: hash, gzip: output })
  }
  const manifest = { schemaVersion: 2, policy: compressionPolicy, assets }
  await validateCompression(root, manifest, expectedHashes)
  return manifest
}

export async function validateCompression(root, manifest, expectedHashes) {
  if (manifest.schemaVersion !== 2 || JSON.stringify(manifest.policy) !== JSON.stringify(compressionPolicy)) {
    throw new Error('Unsupported compression manifest or policy')
  }
  const paths = await targetFiles(root)
  if (JSON.stringify(paths) !== JSON.stringify(manifest.assets.map((asset) => asset.path))) {
    throw new Error('Compression manifest source set differs from current OCR assets')
  }
  const expectedOutputs = []
  for (const asset of manifest.assets) {
    const raw = await readFile(join(root, asset.path))
    const hash = sha256(raw)
    checkSourceHash(asset.path, hash, expectedHashes)
    if (hash !== asset.sha256 || raw.length !== asset.rawBytes) throw new Error(`Stale compression manifest: ${asset.path}`)
    if (asset.gzip) {
      const output = asset.gzip
      if (output.path !== asset.path + '.gz') {
        throw new Error(`Invalid compression output: ${output.path}`)
      }
      const compressed = await readFile(join(root, output.path))
      if (compressed.length !== output.bytes || sha256(compressed) !== output.sha256 || !worthCompressing(raw.length, compressed.length) ||
          output.savingBytes !== raw.length - compressed.length || output.savingPercent !== (1 - compressed.length / raw.length) * 100) {
        throw new Error(`Invalid compression bytes: ${output.path}`)
      }
      const restored = await gunzipAsync(compressed)
      if (!restored.equals(raw) || sha256(restored) !== hash) throw new Error(`Decompression identity failed: ${output.path}`)
      expectedOutputs.push(output.path)
    }
  }
  const files = await listFiles(root)
  if (files.some((path) => path.endsWith('.br'))) throw new Error('Unsupported legacy compressed artifacts remain')
  const actualOutputs = files.filter(isOwnedGzip)
  if (JSON.stringify(expectedOutputs.sort()) !== JSON.stringify(actualOutputs)) throw new Error('Missing or stale compressed siblings')
  return true
}

export function transferTotals(manifest) {
  const totals = { raw: 0, gzip: 0 }
  for (const asset of manifest.assets) {
    totals.raw += asset.rawBytes
    totals.gzip += asset.gzip?.bytes ?? asset.rawBytes
  }
  return totals
}
