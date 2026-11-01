import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { ocrModelCdn } from '../scripts/ocr-model-cdn.mjs'

const prefix = '/yuanstar-embed/models/'
const expected = [
  ['PP-OCRv6_det_small.onnx', 'PP-OCRv6/det/PP-OCRv6_det_small.onnx'],
  ['PP-OCRv6_rec_small.onnx', 'PP-OCRv6/rec/PP-OCRv6_rec_small.onnx'],
  ['ch_ppocr_mobile_v2.0_cls_mobile.onnx', 'PP-OCRv4/cls/ch_ppocr_mobile_v2.0_cls_mobile.onnx'],
]

for (const hook of ['configureServer', 'configurePreviewServer']) {
  test(`${hook}: only model GET/HEAD requests redirect, without forwarding query parameters`, async t => {
    let middleware
    ocrModelCdn()[hook]({ middlewares: { use(fn) { middleware = fn } } })
    const server = createServer((req, res) => middleware(req, res, () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('local resource')
    }))
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => new Promise(resolve => server.close(resolve)))
    const base = `http://127.0.0.1:${server.address().port}`

    for (const [file, remote] of expected) {
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(base + prefix + file + '?private=value', { method, redirect: 'manual' })
        assert.equal(response.status, 302)
        assert.equal(response.headers.get('location'), 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/' + remote)
        assert.equal(response.headers.get('cache-control'), 'public, max-age=300')
        assert.equal(await response.text(), '')
      }
    }
    const rejected = await fetch(base + prefix + expected[0][0], { method: 'POST', redirect: 'manual' })
    assert.equal(rejected.status, 405)
    assert.equal(rejected.headers.get('location'), null)
    await rejected.text()

    for (const path of [prefix + 'ppocrv6_chars.txt', prefix + 'unknown.onnx', prefix + expected[0][0] + '/extra',
      '/yuanstar-embed/ort/ort-wasm-simd-threaded.wasm', '/yuanstar-embed/yuanstar-embed.js', '/v1/operator/current']) {
      const response = await fetch(base + path, { redirect: 'manual' })
      assert.equal(response.status, 200, path)
      assert.equal(await response.text(), 'local resource')
    }
  })
}

test('production emits only the same three exact redirects, never a model proxy', () => {
  const emitted = []
  ocrModelCdn().generateBundle.call({ emitFile(file) { emitted.push(file) } })
  assert.equal(emitted.length, 1)
  const { fileName, source } = emitted[0]
  assert.equal(fileName, 'nginx/ocr-model-cdn.conf')
  assert.equal((source.match(/location = /g) || []).length, 3)
  for (const [file, remote] of expected) {
    assert.ok(source.includes(`location = ${prefix}${file} {`))
    assert.ok(source.includes(`return 302 https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/${remote};`))
  }
  assert.ok(source.includes('if ($request_method !~ ^(GET|HEAD)$) { return 405; }'))
  assert.equal(/proxy_pass|\$args|\$request_uri/.test(source), false)
})
