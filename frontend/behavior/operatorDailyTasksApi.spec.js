import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { getOperatorDailyTasks, adoptOperatorDailyTasks, completeOperatorDailyTask } from '../src/api/operatorDailyTasks.js'

vi.mock('../src/api/request.js', () => ({ request: vi.fn() }))
vi.mock('../src/store/auth.js', () => ({ auth: { userInfo: { id: 'current' } } }))
beforeEach(() => vi.clearAllMocks())

it('pins every request to its captured user and encodes account plan date and task identity', async () => {
  const base = '/v1/operator/training-plans/plan%2F1/daily-tasks'
  await getOperatorDailyTasks('a&b', 'plan/1', '2026-10-16', 'owner')
  expect(request).toHaveBeenLastCalledWith(base + '?account_id=a%26b&date=2026-10-16', { auth: true, expectedUserId: 'owner' })
  const body = { expected_version: 0, expected_schedule_revision: 3 }
  await adoptOperatorDailyTasks('a', 'plan/1', '2026-10-16', body, 'owner')
  expect(request).toHaveBeenLastCalledWith(base + '?account_id=a&date=2026-10-16', { auth: true, expectedUserId: 'owner', method: 'PUT', body })
  const completion = { expected_version: 1, completed: true }
  await completeOperatorDailyTask('a', 'plan/1', '2026-10-16', 'ds-12', completion, 'owner')
  expect(request).toHaveBeenLastCalledWith(base + '/ds-12?account_id=a&date=2026-10-16', { auth: true, expectedUserId: 'owner', method: 'PUT', body: completion })
})
