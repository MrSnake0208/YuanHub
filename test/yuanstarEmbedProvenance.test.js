import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)

test('vendored YuanStar embed keeps provenance and is marked as generated output', () => {
  const doc = readFileSync(new URL('docs/yuanstar-embed-sync.md', root), 'utf8')
  assert.match(doc, /public\/yuanstar-embed\/yuanstar-embed\.js/)
  assert.match(doc, /importCaptureBatch/)
  assert.match(doc, /onCaptureCommitted/)

  const attributes = readFileSync(new URL('.gitattributes', root), 'utf8')
  assert.match(attributes, /public\/yuanstar-embed\/yuanstar-embed\.js[^\n]*-diff/)
  assert.match(attributes, /public\/yuanstar-embed\/assets\/\*\*[^\n]*-diff/)
  assert.match(attributes, /public\/yuanstar-embed\/\*\*\s+-text/)
})

test('generated embed accepts cross-version CaptureBatch metadata and retains host guards', () => {
  const code = readFileSync(new URL('public/yuanstar-embed/yuanstar-embed.js', root), 'utf8')
  assert.equal(code.includes('capture_game_mismatch'), false)
  for (const retained of ['capture_game_invalid', 'capture_import_locked', 'capture_workspace_unavailable', 'onCaptureCommitted']) {
    assert.ok(code.includes(retained), retained)
  }
  assert.match(code, /gameVersion:\s*[\w$]+\.account\.gameVersion/)
})

test('vendored release matches the documented source and complete build artifacts', () => {
  const doc = readFileSync(new URL('docs/yuanstar-embed-sync.md', root), 'utf8')
  for (const source of [
    'drifty13/YuanStar-dev',
    'D:\\Users\\Yan\\AppData\\.codex\\yuanstar-yuanhub',
    'fix/import-draft-lifecycle',
    'fd1cf7c89919a495203d0b8e2596572fa920633b',
    'f8382de4508f1f3b3ffdcd318eb0c3b27d67e459',
    'web/src/yuanstar-embed.ts',
    'npm.cmd run build:embed',
  ]) assert.ok(doc.includes(source), source)
  assert.equal(doc.includes('加本轮未提交修改'), false)

  const embed = new URL('public/yuanstar-embed/', root)
  function files(directory, prefix = '') {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = prefix + entry.name
      return entry.isDirectory() ? files(new URL(entry.name + '/', directory), path + '/') : [path]
    })
  }
  assert.deepEqual(files(embed).sort(), [
    'assets/browser-vision-worker-Bt0Z67D1.js',
    'models/PP-OCRv6_det_small.onnx',
    'models/PP-OCRv6_rec_small.onnx',
    'models/README.md',
    'models/ch_ppocr_mobile_v2.0_cls_mobile.onnx',
    'models/ppocrv6_chars.txt',
    'ort/.gitkeep',
    'ort/ort-wasm-simd-threaded.mjs',
    'ort/ort-wasm-simd-threaded.wasm',
    'reference/YuanStar_Phase0_6A_经验星曜规则与逐级数据.xlsx',
    'yuanstar-embed.css',
    'yuanstar-embed.js',
  ].sort())

  const hashes = {
    'yuanstar-embed.js': '5580862f64c43aec696d75fbdbc9a247202beb46d730b39884f42fd80739bb53',
    'yuanstar-embed.css': '24deb13819d1b215f28bb7abbbd62d22ef3cc0c51fb9d59002ceed0851ce2f91',
    'assets/browser-vision-worker-Bt0Z67D1.js': 'b653c986d6470bcb39a8334f9ec5af10088a89eef93f8bfc631e6fdefbcbab14',
  }
  for (const [path, expected] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(path, embed))).digest('hex'), expected, path)
    assert.ok(doc.includes(expected), path + ' documented hash')
  }
})

test('vendored entry retains the worker reference, provenance path and star host entry', () => {
  const code = readFileSync(new URL('public/yuanstar-embed/yuanstar-embed.js', root), 'utf8')
  assert.match(code, /export\s*\{[^}]*\bmountYuanStar\b[^}]*\}/)
  for (const retained of ['browser-vision-worker-Bt0Z67D1.js', 'maayuan_capture', 'maayuan_mumu', 'layoutHint']) {
    assert.ok(code.includes(retained), retained)
  }
  assert.equal(code.includes('browser-vision-worker-Ci-YovYF.js'), false)
  const host = readFileSync(new URL('src/pages/star/index.vue', root), 'utf8')
  assert.ok(host.includes('"/yuanstar-embed/yuanstar-embed.js"'))
  assert.ok(host.includes('"/yuanstar-embed/yuanstar-embed.css"'))
  assert.ok(host.includes('product.mountYuanStar('))
})
