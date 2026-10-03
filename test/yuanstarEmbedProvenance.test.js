import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const sourceCommit = '91ce034f4aae2a68a4b3c387e44149fe6302a922'

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

// 行为契约（跨版本 CaptureBatch 放行、非法版本拒绝、待养成过滤）由
// behavior/embedProduct.spec.js 真正执行产物来覆盖；这里只做产物来源与
// 错误码契约的静态核对，不再用“某个字符串还在不在”冒充行为验证。
test('generated embed keeps the capture error codes and drops the cross-version guard', () => {
  const code = readFileSync(new URL('public/yuanstar-embed/yuanstar-embed.js', root), 'utf8')
  for (const retained of ['capture_game_invalid', 'capture_import_locked', 'capture_workspace_unavailable', 'onCaptureCommitted']) {
    assert.ok(code.includes(retained), retained)
  }
  // 旧版把“批次游戏版本 ≠ 工作区游戏版本”当成错误直接阻断导入。
  assert.equal(code.includes('capture_game_mismatch'), false)
  // 合法版本集合仍然显式校验，避免“只要不相等就报错”被换成“只要相等就报错”。
  assert.ok(code.includes('"如鸢"') && code.includes('"代号鸢"'))
})

test('vendored embed bounds OCR initialization and documents mobile recovery', () => {
  const code = readFileSync(new URL('public/yuanstar-embed/yuanstar-embed.js', root), 'utf8')
  for (const retained of [
    'worker_initialization_timeout',
    'engine_initialization_timeout',
    '手机端也支持识别',
    '识别引擎加载超时。',
    '识别引擎启动失败。请刷新页面后重试',
    '请保持页面前台并使用稳定网络',
  ]) assert.ok(code.includes(retained), retained)

  // 编译变量名会变化；延迟预热由 behavior/embedProduct.spec.js 执行真实产物验证。
  assert.match(code, /(?:300000|3e5)/)
  const host = readFileSync(new URL('src/pages/star/index.vue', root), 'utf8')
  assert.ok(host.includes('手机和电脑网页端均可使用'))
})

test('vendored release matches documented provenance and the current artifact manifest', () => {
  const doc = readFileSync(new URL('docs/yuanstar-embed-sync.md', root), 'utf8')
  for (const source of [
    'fix/import-draft-lifecycle',
    sourceCommit,
    '已提交 source commit 的干净工作树正式 build',
    'onnxruntime-web-use-extern-wasm',
    '10 秒 / 首批有效图片双触发预热',
    '300 秒初始化 timeout',
    'web/src/yuanstar-embed.ts',
    'build:embed',
    'docs/yuanstar-embed-manifest.json',
  ]) assert.ok(doc.includes(source), source)
  assert.equal(doc.includes('未提交'), false)
  assert.equal(doc.includes('改为用户确认开始识别后再初始化'), false)
  // 同步者本机绝对路径不得入库；一旦有人写回，这里直接失败。
  assert.equal(/[A-Za-z]:\\\\Users/.test(doc), false, '文档不应包含本机 Windows 绝对路径')

  const embed = new URL('public/yuanstar-embed/', root)
  function files(directory, prefix = '') {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = prefix + entry.name
      return entry.isDirectory() ? files(new URL(entry.name + '/', directory), path + '/') : [path]
    })
  }
  // 哈希清单是唯一来源：文档与测试不再各存一份，更新 embed 时只需重建 manifest.json。
  const manifest = JSON.parse(readFileSync(new URL('docs/yuanstar-embed-manifest.json', root), 'utf8'))
  assert.equal(manifest._sourceCommit, sourceCommit)
  assert.equal(manifest._sourceWorkingTree.status, 'clean')
  assert.equal('changedFiles' in manifest._sourceWorkingTree, false)
  for (const path of ['web/vite.config.mjs', 'web/vite.embed.config.mjs', 'web/scripts/verify-ocr-build.mjs']) {
    assert.ok(doc.includes(path), path + ' documented source change')
  }
  const expected = Object.entries(manifest).filter(([key]) => !key.startsWith('_'))
  assert.deepEqual(files(embed).sort(), expected.map(([path]) => path).sort())
  for (const [path, hash] of expected) {
    assert.match(hash, /^[0-9a-f]{64}$/, path + ' manifest hash')
    assert.equal(createHash('sha256').update(readFileSync(new URL(path, embed))).digest('hex'), hash, path)
  }
})

test('vendored entry retains the worker reference, provenance path and star host entry', () => {
  const code = readFileSync(new URL('public/yuanstar-embed/yuanstar-embed.js', root), 'utf8')
  assert.match(code, /export\s*\{[^}]*\bmountYuanStar\b[^}]*\}/)
  const workers = readdirSync(new URL('public/yuanstar-embed/assets/', root))
    .filter((name) => /^browser-vision-worker-[\w-]+\.js$/u.test(name))
  assert.equal(workers.length, 1, 'only the current hashed worker should remain')
  for (const retained of [workers[0], 'maayuan_capture', 'maayuan_mumu', 'layoutHint']) {
    assert.ok(code.includes(retained), retained)
  }
  const host = readFileSync(new URL('src/pages/star/index.vue', root), 'utf8')
  assert.ok(host.includes('"/yuanstar-embed/yuanstar-embed.js"'))
  assert.ok(host.includes('"/yuanstar-embed/yuanstar-embed.css"'))
  assert.ok(host.includes('product.mountYuanStar('))
})

test('vendored worker stays small and uses the external ORT runtime', () => {
  const assets = new URL('public/yuanstar-embed/assets/', root)
  const workers = readdirSync(assets).filter((name) => /^browser-vision-worker-[\w-]+\.js$/u.test(name))
  assert.equal(workers.length, 1)
  const worker = readFileSync(new URL(workers[0], assets))
  assert.ok(worker.length < 1024 * 1024, 'OCR worker must stay below 1 MiB; check ORT export conditions')
  assert.doesNotMatch(worker.toString('utf8'), /data:application\/wasm;base64/iu)
  for (const filename of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    assert.ok(readFileSync(new URL('public/yuanstar-embed/ort/' + filename, root)).length > 0, filename)
  }
})
