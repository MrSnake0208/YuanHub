// Canonical main/support names are generated from YuanStar data/star_catalog.json.
export { MAIN_STAR_OPTIONS, ASSIST_STAR_OPTIONS } from './starCatalog.js'
import { subProfList, tokens } from '../utils/operatorFilters.js'

export const ASSIST_STAR_DESCRIPTIONS = {
  红鸾: '受治疗加成+',
  阴煞: '地/水属性增伤+',
  天魁: '地属性增伤+',
  八座: '地/水属性抗性+',
  陀螺: '地属性抗性+',
  地劫: '技能免伤+',
  解神: '技能增伤+',
  禄存: '普攻免伤+',
  文曲: '普攻增伤+',
  天钺: '水属性增伤+',
  火星: '水属性抗性+',
  文昌: '治疗加成+',
  天巫: '火/风属性增伤+',
  左辅: '火属性增伤+',
  铃星: '火属性抗性+',
  恩光: '火/风属性抗性+',
  三台: '阴/阳属性增伤+',
  擎羊: '阳属性抗性+',
  天贵: '阴/阳属性抗性+',
  天姚: '阳属性抗性+',
  天马: '阴属性增伤+',
  天刑: '阴属性抗性+',
  右弼: '风属性增伤+',
  地空: '风属性抗性+'
}

// 部分星石只允许装备到指定职业或属性的密探。
export const STAR_STONE_RESTRICTIONS = {
  紫微: { subProf: ['龙盾'] },
  破军: { subProf: ['破军'] },
  天机: { subProf: ['神纪', '诡道'] },
  文昌: { subProf: ['岐黄'] },
  天魁: { prof: ['地'] },
  天钺: { prof: ['水'] },
  左辅: { prof: ['火'] },
  右弼: { prof: ['风'] },
  天马: { prof: ['阴'] },
  擎羊: { prof: ['阳'] }
}

export function isStarStoneAllowedForOperator(starName, operator) {
  const restriction = STAR_STONE_RESTRICTIONS[starName]
  if (!restriction || !operator) return true
  if (restriction.subProf) {
    const subProfs = subProfList(operator)
    if (subProfs.length && !restriction.subProf.some(function (value) { return subProfs.includes(value) })) return false
  }
  if (restriction.prof) {
    const profs = tokens(operator.prof)
    if (profs.length && !restriction.prof.some(function (value) { return profs.includes(value) })) return false
  }
  return true
}
