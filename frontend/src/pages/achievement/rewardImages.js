const items = {
  bingdilian: ['并蒂莲', 'achievement/rewards/icon_cj_01.webp'],
  tongxinjie: ['同心结', 'achievement/rewards/icon_cj_02.webp'],
  wugouxue: ['吴钩雪', 'achievement/rewards/icon_cj_03.webp'],
  yuguanhao: ['玉管毫', 'achievement/rewards/icon_cj_04.webp'],
  wufengming: ['梧凤鸣', 'achievement/rewards/icon_cj_05.webp'],
  baijinbi: ['白金币', 'achievement/rewards/icon_hb_001.webp'],
  wuzhuqian: ['五铢钱', 'achievement/rewards/icon_hb_003.webp'],
  unidentified_item: ['微尘', 'achievement/rewards/icon_zywxjf_001.webp'],
  sumi: ['粟米', 'achievement/rewards/icon_zy_00005.webp'],
  hongliaohuazhi: ['红蓼花纸', 'achievement/rewards/icon_nz_1001.webp'],
  zhuluanhuazhi: ['朱栾花纸', 'achievement/rewards/icon_nz_2001.webp'],
  qingzhuhuazhi: ['青竹花纸', 'achievement/rewards/icon_nz_3001.webp'],
  baimeihuazhi: ['白梅花纸', 'achievement/rewards/icon_nz_4001.webp'],
  tumihuazhi: ['荼蘼花纸', 'achievement/rewards/icon_nz_5001.webp'],
  qingxiaoxuanfu_furong: ['青绡玄服·傅融', 'achievement/rewards/icon_2602.webp'],
  gangding: ['钢锭', 'achievement/rewards/icon_mc_00038.webp'],
  guanxing: ['观星', 'achievement/rewards/icon_nz_2201.webp'],
  baixingyao: ['白星曜', 'achievement/rewards/icon_xx_401.webp'],
  yinfu: ['阴符', 'achievement/rewards/icon_nz_011.webp'],
  meiwu_fengjiantingmie: ['郿坞·风翦霆灭', 'achievement/rewards/icon_lb_0023.webp'],
  pengcheng_dafengqixi: ['彭城·大风起兮', 'achievement/rewards/icon_lb_0023.webp'],
  langya_yiwangdonghai: ['琅琊·以望东海', 'achievement/rewards/icon_lb_0023.webp'],
  zuigucao: ['醉骨草', 'inventory-icons/items/zuigucao.webp'],
  bingshucanjuan: ['兵书残卷', 'inventory-icons/items/bingshucanjuan.webp'],
  gongguoge: ['功过格', 'inventory-icons/items/gongguoge.webp'],
  fuchuan: ['符传', 'inventory-icons/items/fuchuan.webp'],
  feiyun: ['飞云', 'inventory-icons/agents/char_030_feiyun.webp'],
  xiuqiu: ['绣球', 'inventory-icons/agents/char_029_xiuqiu.webp']
}

const frames = {
  绣衣主人: 'frame_cj02.webp',
  绣衣天下: 'frame_cj02.webp',
  金兰之义: 'frame_cj03.webp',
  刀光剑影: 'frame_cj04.webp',
  恋念缠绵: 'frame_cj05.webp',
  日理万机: 'frame_cj06.webp'
}

// 两服共用素材；积分档位没有 item_key 时仅按完整奖励名匹配。
export function rewardImagePath(reward) {
  if (reward.item_key?.startsWith('title_') || reward.icon === 'title' || reward.name?.startsWith('称号')) {
    return 'achievement/rewards/icon_xyl_002.webp'
  }
  if (reward.icon === 'frame' || reward.name?.startsWith('头像框')) {
    const name = reward.name?.replace(/^头像框[·【「]?/, '').replace(/[】」]$/, '')
    return Object.hasOwn(frames, name) ? `achievement/rewards/${frames[name]}` : null
  }
  return (reward.item_key ? items[reward.item_key] : Object.values(items).find(([name]) => name === reward.name))?.[1] ?? null
}
