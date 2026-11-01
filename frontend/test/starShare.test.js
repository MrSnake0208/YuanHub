import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { parseShareLink, shareRoute } from '../src/utils/shareLink.js'
import { sharedStarRows, filterSharedStars, STAR_SHARE_SORTS } from '../src/domain/starShare.js'
import { STAR_QUALITIES, starDiscPath } from '../src/data/starDiscs.js'
import { requiresBetaApi } from '../src/utils/betaAccess.js'

test('纯码按入口分流，完整链接及显式 view 参数优先', () => {
  assert.deepEqual(shareRoute(parseShareLink('code', 'star')), { name: 'star-share', params: { token: 'code' } })
  assert.equal(parseShareLink('code', 'operator').view, 'operator')
  assert.equal(parseShareLink('https://example.test/star/share/code', 'operator').view, 'star')
  assert.equal(parseShareLink('/operator/share/code', 'star').view, 'operator')
  assert.equal(parseShareLink('https://example.test/operator/share/code?view=star#bag').view, 'star')
  for (const input of ['bad code', 'https://example.test/not-share/code', '/star/share/bad%2Fcode', 'javascript:/star/share/code', '/star/share/%', '//evil/not-share/code']) assert.equal(parseShareLink(input), null)
})
const stone = (name, quality, level, kind = 'main') => ({ kind, name, quality, level })
test('默认综合迁移背包的等级、图鉴、品质顺序，重复实例保留', () => {
  const rows = sharedStarRows([stone('天府', 'white', 60), stone('天府', 'orange', 10), stone('天府', 'purple', 20), stone('天府', 'orange', 30), stone('天府', 'orange', 30)])
  const sorted = filterSharedStars(rows)
  assert.deepEqual(sorted.map(row => row.level), [60, 30, 30, 20, 10])
  assert.equal(new Set(rows.map(row => row.key)).size, 5)
  assert.deepEqual(sorted.slice(1, 3).map(row => row.key), rows.slice(3).map(row => row.key))
  assert.deepEqual(STAR_SHARE_SORTS.map(option => option.value), ['catalog', 'name', 'level'])
  const tied = sharedStarRows([stone('武曲', 'orange', 30), stone('天府', 'white', 30), stone('天府', 'orange', 10), stone('天府', 'purple', 30)])
  assert.deepEqual(filterSharedStars(tied).map(row => [row.name, row.quality, row.level]), [['天府', 'purple', 30], ['天府', 'white', 30], ['武曲', 'orange', 30], ['天府', 'orange', 10]])
  assert.deepEqual(filterSharedStars(tied, { sort: 'level' }).map(row => [row.name, row.quality, row.level]), [['武曲', 'orange', 30], ['天府', 'purple', 30], ['天府', 'white', 30], ['天府', 'orange', 10]])
  assert.deepEqual(filterSharedStars(tied, { sort: 'name' }).map(row => [row.name, row.quality, row.level]), [['天府', 'purple', 30], ['天府', 'white', 30], ['天府', 'orange', 10], ['武曲', 'orange', 30]])
})
test('名称排序采用现有字典顺序，但未知名称不丢失；名称部分匹配与品质组合过滤', () => {
  const rows = sharedStarRows([stone('新星甲', 'purple', 10, 'support'), stone('武曲', 'orange', 20), stone('天府', 'white', 1), stone('新星乙', 'purple', 30)])
  assert.deepEqual(filterSharedStars(rows, { sort: 'name' }).map(row => row.name), ['天府', '武曲', '新星乙', '新星甲'])
  assert.deepEqual(filterSharedStars(rows, { quality: 'purple', search: ' 新星 ' }).map(row => row.name), ['新星乙', '新星甲'])
  assert.equal(filterSharedStars(rows, { search: '未找到' }).length, 0)
})
test('完全同值或未知名称平局保留响应原顺序，等级刷新保持本地渲染身份', () => {
  const rows = sharedStarRows([stone('新星乙', 'orange', 10), stone('新星甲', 'orange', 10), stone('解神', 'white', 10, 'support')])
  assert.deepEqual(filterSharedStars(rows).map(row => row.key), rows.map(row => row.key))
  assert.deepEqual(filterSharedStars(rows, { sort: 'level' }).map(row => row.key), rows.map(row => row.key))
  assert.deepEqual(sharedStarRows(rows.map(row => ({ ...row, level: 20 }))).map(row => row.key), rows.map(row => row.key))
})
test('映射恰好十张透明 PNG，资源来自宿主 public，未知枚举不给任意路径', () => {
  const files = []
  for (const kind of ['main', 'support']) for (const quality of STAR_QUALITIES) {
    const path = starDiscPath(kind, quality)
    files.push(path.split('/').at(-1))
    const bytes = readFileSync(new URL('../public' + path, import.meta.url))
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(bytes[25], 6)
    assert.equal(bytes.readUInt32BE(16), 512)
    assert.equal(bytes.readUInt32BE(20), 512)
    const original = readFileSync(new URL('../design-assets/star-discs/originals/' + path.split('/').at(-1), import.meta.url))
    assert.equal(original.readUInt32BE(16), 1254)
    assert.equal(original.readUInt32BE(20), 1254)
  }
  assert.deepEqual(readdirSync(new URL('../public/assets/star-discs', import.meta.url)).sort(), files.sort())
  assert.equal(starDiscPath('main', 'gold'), '')
  assert.equal(starDiscPath('../private', 'orange'), '')
})
test('公开读取内测豁免严格限于 GET 分享视图', () => {
  assert.equal(requiresBetaApi('GET', '/v1/star/share/view/code'), false)
  assert.equal(requiresBetaApi('PATCH', '/v1/accounts/share?account_id=a'), true)
  assert.equal(requiresBetaApi('GET', '/v1/star-state/current?account_id=a'), true)
})
