import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CartPage from '../src/pages/tools/cart.vue'
import { ledgerFixture } from '../test-support/ledgerCatalog.js'
import { campaignEnds } from '../src/data/rewards.js'

vi.mock('../src/api/ledgerCatalog.js', () => ({ getLedgerCatalog: vi.fn(async () => { const data = ledgerFixture(); data.campaigns = [{ ...data.campaigns[0], starts_at: '2026-04-01T00:00:00Z', ends_at: campaignEnds.track1 }]; return data }) }))

vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: false } }))

it('活动到期后显示结束态且不再提示下一档可领取', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse(campaignEnds.track1) - 1000)
  const wrapper = mount(CartPage, { global: {
    stubs: { IslandSidebar: true, SiteFooter: true },
    directives: { reveal: () => {} },
  } })
  await flushPromises()
  await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
  expect(wrapper.findAll('.milestone .head')[1].text()).toContain('剩余:')
  expect(wrapper.findAll('.milestone .head')[1].text()).not.toContain('活动已结束')
  vi.advanceTimersByTime(1000)
  await flushPromises()
  expect(wrapper.findAll('.milestone .head')[1].text()).toContain('活动已结束')
  expect(wrapper.findAll('.milestone .head')[1].text()).not.toContain('剩余:')
  expect(wrapper.findAll('.milestone .head')[1].text()).not.toContain('距下一档')
  expect(wrapper.get('.campaign-ended-note').text()).toContain('仅供历史参考')
})
