export const ELEMENT_APPEARANCE = Object.freeze({
  阴: Object.freeze({ color: '#8a5ca6', darkInk: false }),
  阳: Object.freeze({ color: '#f6c87d', darkInk: true }),
  风: Object.freeze({ color: '#4a8a41', darkInk: false }),
  火: Object.freeze({ color: '#d2772f', darkInk: false }),
  水: Object.freeze({ color: '#5eb6e0', darkInk: true }),
  地: Object.freeze({ color: '#8d580d', darkInk: false }),
  混沌: Object.freeze({ color: '#7d7bab', darkInk: false })
})

function lockAppearance(element) {
  return Object.freeze(Object.assign({ element }, ELEMENT_APPEARANCE[element]))
}

export const ELEMENT_LOCKS = Object.freeze({
  huaiyinjinsuo: lockAppearance('阴'),
  yangmingjinsuo: lockAppearance('阳'),
  tianfengjinsuo: lockAppearance('风'),
  huoyuanjinsuo: lockAppearance('火'),
  shuixinjinsuo: lockAppearance('水'),
  zaidijinsuo: lockAppearance('地')
})

export function elementAppearance(element) {
  return ELEMENT_APPEARANCE[String(element || '').trim()] || null
}
