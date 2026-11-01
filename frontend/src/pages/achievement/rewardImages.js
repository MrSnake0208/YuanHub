const items = {
  bingdilian: ['并蒂莲', 'achievement/rewards/icon_cj_01.png'],
  tongxinjie: ['同心结', 'achievement/rewards/icon_cj_02.png'],
  wugouxue: ['吴钩雪', 'achievement/rewards/icon_cj_03.png'],
  yuguanhao: ['玉管毫', 'achievement/rewards/icon_cj_04.png'],
  wufengming: ['梧凤鸣', 'achievement/rewards/icon_cj_05.png'],
  baijinbi: ['白金币', 'achievement/rewards/icon_hb_001.png'],
  wuzhuqian: ['五铢钱', 'achievement/rewards/icon_hb_003.png'],
  unidentified_item: ['微尘', 'achievement/rewards/icon_zywxjf_001.png'],
  sumi: ['粟米', 'achievement/rewards/icon_zy_00005.png'],
  hongliaohuazhi: ['红蓼花纸', 'achievement/rewards/icon_nz_1001.png'],
  zhuluanhuazhi: ['朱栾花纸', 'achievement/rewards/icon_nz_2001.png'],
  qingzhuhuazhi: ['青竹花纸', 'achievement/rewards/icon_nz_3001.png'],
  baimeihuazhi: ['白梅花纸', 'achievement/rewards/icon_nz_4001.png'],
  tumihuazhi: ['荼蘼花纸', 'achievement/rewards/icon_nz_5001.png'],
  qingxiaoxuanfu_furong: ['青绡玄服·傅融', 'achievement/rewards/icon_2602.png'],
  gangding: ['钢锭', 'achievement/rewards/icon_mc_00038.png'],
  guanxing: ['观星', 'achievement/rewards/icon_nz_2201.png'],
  baixingyao: ['白星曜', 'achievement/rewards/icon_xx_401.png'],
  yinfu: ['阴符', 'achievement/rewards/icon_nz_011.png'],
  meiwu_fengjiantingmie: ['郿坞·风翦霆灭', 'achievement/rewards/icon_lb_0023.png'],
  pengcheng_dafengqixi: ['彭城·大风起兮', 'achievement/rewards/icon_lb_0023.png'],
  langya_yiwangdonghai: ['琅琊·以望东海', 'achievement/rewards/icon_lb_0023.png'],
  zuigucao: ['醉骨草', 'inventory-icons/items/zuigucao.png'],
  bingshucanjuan: ['兵书残卷', 'inventory-icons/items/bingshucanjuan.png'],
  gongguoge: ['功过格', 'inventory-icons/items/gongguoge.png'],
  fuchuan: ['符传', 'inventory-icons/items/fuchuan.png'],
  feiyun: ['飞云', 'inventory-icons/agents/char_030_feiyun.png'],
  xiuqiu: ['绣球', 'inventory-icons/agents/char_029_xiuqiu.png']
}

const frames = {
  绣衣主人: 'frame_cj02.png',
  绣衣天下: 'frame_cj02.png',
  金兰之义: 'frame_cj03.png',
  刀光剑影: 'frame_cj04.png',
  恋念缠绵: 'frame_cj05.png',
  日理万机: 'frame_cj06.png'
}

// 两服共用素材；积分档位没有 item_key 时仅按完整奖励名匹配。
export function rewardImagePath(reward) {
  if (reward.item_key?.startsWith('title_') || reward.icon === 'title' || reward.name?.startsWith('称号')) {
    return 'achievement/rewards/icon_xyl_002.png'
  }
  if (reward.icon === 'frame' || reward.name?.startsWith('头像框')) {
    const name = reward.name?.replace(/^头像框[·【「]?/, '').replace(/[】」]$/, '')
    return Object.hasOwn(frames, name) ? `achievement/rewards/${frames[name]}` : null
  }
  return (reward.item_key ? items[reward.item_key] : Object.values(items).find(([name]) => name === reward.name))?.[1] ?? null
}
