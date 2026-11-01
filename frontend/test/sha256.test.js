import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { sha256 } from '../src/utils/sha256.js'

const inputs = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64),
  'a'.repeat(65), 'a'.repeat(127), 'a'.repeat(128), 'a'.repeat(129),
  '化极五星\u{1f31f}'.repeat(100), '\u0000\ud800\udc00\ud800', 'a'.repeat(10000)]

for (const [name, crypto] of [['Web Crypto', webcrypto], ['无 subtle', {}], ['无 crypto', undefined]]) {
  test(`SHA-256 ${name}路径与标准实现一致，包括UTF-8与分块边界`, async t => {
    t.mock.getter(globalThis, 'crypto', () => crypto)
    for (const input of inputs) {
      assert.equal(await sha256(input), createHash('sha256').update(input).digest('hex'))
    }
    assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    assert.notEqual(await sha256('stage24'), await sha256('stage25'))
  })
}

test('Web Crypto 已可用但摘要失败时继续报告错误', async t => {
  t.mock.getter(globalThis, 'crypto', () => ({ subtle: { digest: async () => { throw new Error('digest failed') } } }))
  await assert.rejects(sha256('abc'), /digest failed/)
})
