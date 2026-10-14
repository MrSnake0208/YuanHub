export const STAR_QUALITY_LABELS = Object.freeze({ orange: '橙', purple: '紫', blue: '蓝', green: '绿', white: '白' })
export const STAR_QUALITIES = Object.freeze(Object.keys(STAR_QUALITY_LABELS))
export const STAR_DISC_PATHS = Object.freeze(Object.fromEntries(['main', 'support'].map(kind => [kind,
  Object.freeze(Object.fromEntries(STAR_QUALITIES.map(quality => [quality, '/assets/star-discs/' + kind + '-' + quality + '.png'])))
])))
export const starDiscPath = (kind, quality) => STAR_DISC_PATHS[kind]?.[quality] || ''
