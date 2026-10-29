import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AchievementPointRewards from '../src/pages/achievement/AchievementPointRewards.vue'
import { pointRewardTrack } from '../src/pages/achievement/pointRewards.js'

const props = { categoryName: '刀光剑影', track: pointRewardTrack('代号鸢', '刀光剑影'), points: 1780, recordState: 'ready', alwaysExpanded: true }

it('展示真实积分、四档奖励和差额，阈值及超额正确，未假定已领取', async () => {
  const wrapper = mount(AchievementPointRewards, { props })
  expect(wrapper.findAll('.is-reached')).toHaveLength(3)
  expect(wrapper.text()).toContain('220')
  expect(wrapper.text()).toContain('头像框【刀光剑影】 ×1')
  expect(wrapper.findAll('button')).toHaveLength(0)
  for (const [points, reached] of [[0, 0], [499, 0], [500, 1], [1000, 2], [1500, 3], [2000, 4], [2605, 4]]) {
    await wrapper.setProps({ points })
    expect(wrapper.findAll('.is-reached')).toHaveLength(reached)
    expect(wrapper.find('.achievement-points-current strong').text()).toBe(String(points))
  }
  expect(wrapper.text()).toContain('四档均已达标')
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
