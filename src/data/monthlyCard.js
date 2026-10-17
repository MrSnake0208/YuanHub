// 两个游戏分别持有预设；如鸢及白金币数值仍待完整规则核实，允许按实领修改。
const tiers = () => [
  { id: 'none', label: '无有效月卡', stamina: 0, shop: 0, coins: 0 },
  { id: 'yinghuo', label: '萤火', stamina: 30, shop: 20, coins: 60 },
  { id: 'xingguang', label: '星光', stamina: 35, shop: 20, coins: 65 },
  { id: 'yuehua', label: '月华', stamina: 50, shop: 20, coins: 80 },
  { id: 'zhaoyang', label: '昭阳', stamina: 60, shop: 20, coins: 90 },
  { id: 'custom', label: '自定义', stamina: 0, shop: 20, coins: 60 }
]
export const MONTHLY_CARD_TIERS = Object.freeze({ '代号鸢': tiers(), '如鸢': tiers() })
export function monthlyCardTiers(game = '代号鸢') { return MONTHLY_CARD_TIERS[game] || MONTHLY_CARD_TIERS['代号鸢'] }
export function monthlyCardTier(id, game) { return monthlyCardTiers(game).find(tier => tier.id === id) || monthlyCardTiers(game)[0] }
