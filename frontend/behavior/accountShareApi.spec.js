import { expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { getAccountShare, setAccountShareScope, regenerateAccountShare, revokeAccountShare, viewStarShare } from '../src/api/accountShare.js'
vi.mock('../src/api/request.js', () => ({ request: vi.fn(() => Promise.resolve({})) }))
it('账号命令带认证且一次只修改一个范围；匿名星石读取不带账号参数或凭证', async () => {
  await getAccountShare('a/b')
  await setAccountShareScope('a/b', 'star', true)
  await setAccountShareScope('a/b', 'operator_tags', true)
  await regenerateAccountShare('a/b')
  await revokeAccountShare('a/b')
  await viewStarShare('code/one')
  expect(request.mock.calls).toEqual([
    ['/v1/accounts/share?account_id=a%2Fb', { auth: true }],
    ['/v1/accounts/share?account_id=a%2Fb', { method: 'PATCH', auth: true, body: { scope: 'star', enabled: true } }],
    ['/v1/accounts/share?account_id=a%2Fb', { method: 'PATCH', auth: true, body: { scope: 'operator_tags', enabled: true } }],
    ['/v1/accounts/share/regenerate?account_id=a%2Fb', { method: 'POST', auth: true }],
    ['/v1/accounts/share?account_id=a%2Fb', { method: 'DELETE', auth: true }],
    ['/v1/star/share/view/code%2Fone', { auth: false }]
  ])
})
