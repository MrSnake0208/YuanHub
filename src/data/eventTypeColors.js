// Shared calendar accents and recruitment cover colors; keep the warm paper surfaces.
export const EVENT_TYPE_COLORS = Object.freeze({
  tea: { background: '#F3EFE9', text: '#5A4633', border: '#CDBEAC', mark: '#806B55', cover: '#E8DFD2' },
  rouge: { background: '#FAEEEB', text: '#833F3D', border: '#D9AAA4', mark: '#A6514A', cover: '#F1D5D1' },
  purple: { background: '#F4EEF8', text: '#65507D', border: '#C9B5DD', mark: '#88669F', cover: '#E7DCF4' },
  blue: { background: '#EDF3F9', text: '#395772', border: '#ACC3D7', mark: '#597D9B', cover: '#D9E8F5' },
  yellow: { background: '#FFF7D9', text: '#6C551E', border: '#D8C17B', mark: '#97762A', cover: '#F0E0AE' },
  gold: { background: '#FBF4DF', text: '#705115', border: '#DAC38B', mark: '#98722A', cover: '#F2DFAD' },
  gray: { background: '#F0EFEC', text: '#56534F', border: '#C9C5BE', mark: '#7D7972', cover: '#E8E5DE' },
  orange: { background: '#FFF1E4', text: '#854A20', border: '#DDB58E', mark: '#AC672E', cover: '#F1D5B5' },
  neutral: { background: '#F4F0E7', text: '#645A4B', border: '#D4C9B8', mark: '#887B68', cover: '#F6EDD0' },
})

export function eventTypeStyle(color) {
  const token = EVENT_TYPE_COLORS[color] || EVENT_TYPE_COLORS.neutral
  return { '--event-bg': token.background, '--event-text': token.text, '--event-border': token.border, '--event-mark': token.mark }
}
