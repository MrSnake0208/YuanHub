import { describe, expect, it, vi } from 'vitest'
import { request } from '../src/api/request.js'
import { annotateRewards, previewRewardAnnotations } from '../src/api/inventory.js'

vi.mock('../src/api/request.js', () => ({ request: vi.fn() }))

describe('inventory annotation API', () => {
  it('uses JWT routes and the standard exchange serializer for preview and frozen confirmation', () => {
    const doc = { format: 'myshare-inventory-exchange', version: 2, exported_at: '2026-10-23T12:00:00Z', producer: { platform: 'yuanhub' }, records: [{
      account_id: 'main', record_id: 'fixed-id', record_type: 'reward_delta', entity_type: 'agent', acquisition_channel: '派遣-寿春',
      effective_at: '2026-10-23T09:00:00Z', staminaCost: 20, entries: [{ id: 'char_001_yangxiu', count: 3 }],
    }] }
    previewRewardAnnotations(doc, { expectedUserId: 'owner' })
    const preview = request.mock.lastCall
    expect(preview[0]).toBe('/v1/inventory/reward-annotations/preview')
    expect(preview[1]).toMatchObject({ method: 'POST', auth: true, expectedUserId: 'owner' })
    expect(preview[1].body.records[0].stamina_cost).toBe(20)
    expect(preview[1].body.records[0]).not.toHaveProperty('staminaCost')
    annotateRewards(doc, 7, { expectedUserId: 'owner' })
    expect(request.mock.lastCall).toEqual(['/v1/inventory/reward-annotations', {
      method: 'POST', auth: true, expectedUserId: 'owner',
      body: { document: preview[1].body, expected_inventory_revision: 7 },
    }])
    expect(doc.records[0]).toHaveProperty('staminaCost', 20)
  })
})
