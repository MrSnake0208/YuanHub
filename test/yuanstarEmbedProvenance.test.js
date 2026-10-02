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

test('vendored release matches the documented source and complete build artifacts', () => {
  const doc = readFileSync(new URL('docs/yuanstar-embed-sync.md', root), 'utf8')
  for (const source of [
    'fix/import-draft-lifecycle',
    'fd1cf7c89919a495203d0b8e2596572fa920633b',
    'f8382de4508f1f3b3ffdcd318eb0c3b27d67e459',
    'web/src/yuanstar-embed.ts',
    'build:embed',
    'docs/yuanstar-embed-manifest.json',
  ]) assert.ok(doc.includes(source), source)
  assert.equal(doc.includes('加本轮未提交修改'), false)
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
  for (const retained of ['browser-vision-worker-Bt0Z67D1.js', 'maayuan_capture', 'maayuan_mumu', 'layoutHint']) {
    assert.ok(code.includes(retained), retained)
  }
  assert.equal(code.includes('browser-vision-worker-Ci-YovYF.js'), false)
  const host = readFileSync(new URL('src/pages/star/index.vue', root), 'utf8')
  assert.ok(host.includes('"/yuanstar-embed/yuanstar-embed.js"'))
  assert.ok(host.includes('"/yuanstar-embed/yuanstar-embed.css"'))
  assert.ok(host.includes('product.mountYuanStar('))
})
