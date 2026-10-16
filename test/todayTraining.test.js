import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeDailyTraining, trainingTaskView } from '../src/data/todayTraining.js'
import { dailyTrainingResponse, trainingItem } from '../test-support/todayTraining.js'

test('daily response validates exact account plan and business date', () => {
  const data = dailyTrainingResponse()
  assert.equal(decodeDailyTraining(data, 'a', 'p', '2026-10-16'), data)
  for (const [field, value] of Object.entries({ account_id: 'b', plan_id: 'other', date: '2026-10-17', version: -1, needs_update: null, source: null })) {
    assert.throws(() => decodeDailyTraining({ ...data, [field]: value }, 'a', 'p', '2026-10-16'))
  }
})

test('malformed identities quantities duplicates and invalid source budgets fail closed', () => {
  for (const items of [[null], [trainingItem(10, 1), trainingItem(10, 1)], [trainingItem(13, 1)], [trainingItem(10, 0)], [trainingItem(10, 1.5)], [trainingItem(10, 7)],
    [{ ...trainingItem(10, 1), group_id: 'unknown' }], [{ ...trainingItem(10, 1), cost_per: 100 }], [trainingItem(10, 4), trainingItem(12, 4)]]) {
    const data = dailyTrainingResponse({ source: { status: 'ready', revision: 3, items } })
    assert.throws(() => decodeDailyTraining(data, 'a', 'p', '2026-10-16'))
  }
  assert.throws(() => decodeDailyTraining(dailyTrainingResponse({ tasks: [trainingItem(10, 1)] }), 'a', 'p', '2026-10-16'))
})

test('completed runs survive increases reductions and removals without asking to repeat them', () => {
  assert.deepEqual(['remaining', 'done', 'displayCount'].map(key => trainingTaskView(trainingItem(12, 4, 1))[key]), [3, false, 3])
  for (const count of [0, 2, 4]) {
    const data = dailyTrainingResponse({ version: 2, tasks: [trainingItem(12, count, 4)] })
    const task = trainingTaskView(decodeDailyTraining(data, 'a', 'p', '2026-10-16').tasks[0])
    assert.equal(task.done, true)
    assert.equal(task.displayCount, 4)
  }
  assert.equal(trainingTaskView(trainingItem(10, 1)).stage, '10 层')
  assert.equal(trainingTaskView({ ...trainingItem(8, 1), id: 'experience-8', group_id: 'experience' }).stage, '绝境')
})
