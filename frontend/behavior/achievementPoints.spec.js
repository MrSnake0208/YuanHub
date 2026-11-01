import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AchievementPointRewards from '../src/pages/achievement/AchievementPointRewards.vue'

const props = { categoryName: '测试分类', track: { itemName: '测试分', itemKey: 'test_points', tiers: [11, 27, 39, 63].map(at => ({ at, name: '测试奖励', quantity: 2, icon: 'coins' })) }, points: 40, recordState: 'ready', alwaysExpanded: true }

it('展示真实积分、四档奖励和差额，阈值及超额正确，未假定已领取', async () => {
  const wrapper = mount(AchievementPointRewards, { props })
  expect(wrapper.findAll('.is-reached')).toHaveLength(3)
  expect(wrapper.text()).toContain('23')
  expect(wrapper.text()).toContain('测试奖励 ×2')
  expect(wrapper.findAll('button')).toHaveLength(0)
  for (const [points, reached] of [[0, 0], [10, 0], [11, 1], [27, 2], [39, 3], [63, 4], [90, 4]]) {
    await wrapper.setProps({ points })
    expect(wrapper.findAll('.is-reached')).toHaveLength(reached)
    expect(wrapper.find('.achievement-points-current strong').text()).toBe(String(points))
  }
  expect(wrapper.text()).toContain('全部档位已达标')
  wrapper.unmount()
})

it('折叠可展开；读取中、失败、无账号、奖励未知均不伪造零或达标', async () => {
  const wrapper = mount(AchievementPointRewards, { props: { ...props, alwaysExpanded: false } })
  expect(wrapper.find('ol').exists()).toBe(false)
  await wrapper.find('button').trigger('click')
  expect(wrapper.find('button').attributes('aria-expanded')).toBe('true')
  expect(wrapper.findAll('li')).toHaveLength(4)
  for (const [recordState, text] of [['loading', '正在读取'], ['error', '读取失败'], ['unavailable', '选择游戏账号']]) {
    await wrapper.setProps({ recordState })
    expect(wrapper.find('.achievement-points-current strong').text()).toBe('—')
    expect(wrapper.findAll('.is-reached')).toHaveLength(0)
    expect(wrapper.text()).toContain(text)
  }
  await wrapper.setProps({ recordState: 'ready', points: null })
  expect(wrapper.text()).toContain('奖励资料待补齐')
  expect(wrapper.findAll('.achievement-points-state').every(node => node.text() === '待核对')).toBe(true)
  wrapper.unmount()
})
