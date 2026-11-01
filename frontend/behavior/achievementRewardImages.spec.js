import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { rewardImagePath } from '../src/pages/achievement/rewardImages.js'
import AchievementRewardIcon from '../src/pages/achievement/AchievementRewardIcon.vue'
import AchievementPointRewards from '../src/pages/achievement/AchievementPointRewards.vue'

it('奖励按物品键匹配，档位按完整名称匹配，图片文件均存在', () => {
  const rewards = [
    ['sumi', '粟米'], ['hongliaohuazhi', '红蓼花纸'], ['qingzhuhuazhi', '青竹花纸'],
    ['tumihuazhi', '荼蘼花纸'], ['zhuluanhuazhi', '朱栾花纸'], ['baimeihuazhi', '白梅花纸'],
    ['qingxiaoxuanfu_furong', '青绡玄服·傅融'], ['gangding', '钢锭'], ['guanxing', '观星'],
    ['baixingyao', '白星曜'], ['yinfu', '阴符'], ['meiwu_fengjiantingmie', '郿坞·风翦霆灭'],
    ['pengcheng_dafengqixi', '彭城·大风起兮'], ['langya_yiwangdonghai', '琅琊·以望东海'],
    ['baijinbi', '白金币'], ['fuchuan', '符传'], ['feiyun', '飞云'], ['xiuqiu', '绣球']
  ]
  for (const [item_key, name] of rewards) {
    const path = rewardImagePath({ item_key, name: '显示名称调整' })
    expect(path).toBeTruthy()
    expect(rewardImagePath({ name })).toBe(path)
    const png = readFileSync(`public/${path}`)
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  }
  const packs = rewards.slice(11, 14).map(([item_key]) => rewardImagePath({ item_key }))
  expect(new Set(packs).size).toBe(1)
  expect(rewardImagePath({ item_key: 'title_mingjun' })).toBe(rewardImagePath({ icon: 'title', name: '新称号' }))
  expect(rewardImagePath({ item_key: 'xinzhi_achan', name: '心纸【阿蝉】' })).toBeNull()
  expect(rewardImagePath({ item_key: 'xinzhi_wudan', name: '心纸【伍丹】' })).toBeNull()
  expect(rewardImagePath({ item_key: 'unknown', name: '白金币' })).toBeNull()
  expect(rewardImagePath({ name: '未知奖励' })).toBeNull()
  expect(rewardImagePath({ icon: 'frame', name: 'constructor' })).toBeNull()
})

it('五个头像框使用实际预览，绣衣天下沿用绣衣主人素材', () => {
  const paths = ['绣衣主人', '金兰之义', '刀光剑影', '恋念缠绵', '日理万机'].map(name => {
    const path = rewardImagePath({ icon: 'frame', name })
    expect(rewardImagePath({ name: `头像框【${name}】` })).toBe(path)
    const png = readFileSync(`public/${path}`)
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([640, 640])
    return path
  })
  expect(new Set(paths).size).toBe(5)
  expect(rewardImagePath({ icon: 'frame', name: '绣衣天下' })).toBe(paths[0])
  expect(rewardImagePath({ icon: 'frame', name: '未知头像框' })).toBeNull()
})

it('装饰图片失败回退，切换奖励可加载新图；名称和数量不受影响', async () => {
  const wrapper = mount(AchievementRewardIcon, { props: { reward: { item_key: 'baijinbi' } }, slots: { default: '<span>备用图标</span>' } })
  expect(wrapper.get('img').attributes()).toMatchObject({ src: '/achievement/rewards/icon_hb_001.png', alt: '', 'aria-hidden': 'true', width: '32', height: '32' })
  await wrapper.get('img').trigger('error')
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toBe('备用图标')
  await wrapper.setProps({ reward: { item_key: 'gangding' } })
  expect(wrapper.get('img').attributes('src')).toContain('icon_mc_00038.png')
  wrapper.unmount()

  const points = mount(AchievementPointRewards, { props: { categoryName: '恋念缠绵', track: { itemName: '同心结', tiers: [{ at: 100, name: '恋念缠绵', quantity: 1, icon: 'frame' }] }, alwaysExpanded: true } })
  expect(points.get('.achievement-points-reward img').attributes('src')).toContain('frame_cj05.png')
  await points.get('img').trigger('error')
  expect(points.find('.achievement-points-reward svg').exists()).toBe(true)
  expect(points.get('.achievement-points-reward').text()).toBe('恋念缠绵 ×1')
  points.unmount()
})
