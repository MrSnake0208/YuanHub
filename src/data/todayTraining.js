import { TRAINING_GROUPS } from './operatorTraining.js'

const statuses = ['ready', 'no_schedule', 'no_day', 'invalid', 'needs_recalculation', 'unsupported', 'daily_limit']
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max
function validItems(items, source = false) {
  return Array.isArray(items) && items.length <= 44 && new Set(items.map(item => item?.id)).size === items.length && items.every(item => {
    const group = TRAINING_GROUPS.find(group => group.id === item?.group_id)
    return group && integer(item.stage_level, group.stages.length) && item.stage_level > 0 && item.id === `${group.id}-${item.stage_level}` &&
      integer(item.count, 6) && integer(item.completed_count, 6) && item.cost_per === 20 &&
      (source ? item.count > 0 && item.completed_count === 0 : item.count > 0 || item.completed_count > 0)
  }) && (!source || TRAINING_GROUPS.every(group => items.filter(item => item.group_id === group.id).reduce((sum, item) => sum + item.count, 0) <= 6))
}

export function decodeDailyTraining(value, account, plan, date) {
  if (!value || value.account_id !== account || value.plan_id !== plan || value.date !== date ||
      !integer(value.version, Number.MAX_SAFE_INTEGER) || typeof value.needs_update !== 'boolean' ||
      !statuses.includes(value.source?.status) || !integer(value.source?.revision, Number.MAX_SAFE_INTEGER) ||
      !validItems(value.source?.items, true) || !validItems(value.tasks) || (!value.version && value.tasks.length)) {
    throw new Error('历练待办的账号、日期或格式不匹配，请重新读取。')
  }
  return value
}

export function trainingTaskView(item) {
  const group = TRAINING_GROUPS.find(group => group.id === item.group_id)
  const remaining = Math.max(0, item.count - item.completed_count)
  return { ...item, name: group.name + '历练', stage: group.id === 'experience' ? group.stages[item.stage_level - 1].name.replace(/历练$/, '') : item.stage_level + ' 层',
    remaining, done: remaining === 0, displayCount: remaining || item.completed_count }
}

export const dailyTrainingStatus = {
  daily_limit: '新方案加上已完成次数超过同类历练每日 6 次，请先在养成页调整规划。',
  no_schedule: '尚未保存体力日程，去养成页生成并保存。',
  no_day: '已保存日程中没有今天的安排。',
  invalid: '今日方案暂不可执行，请先在养成页修正。',
  needs_recalculation: '日程有待重算的修改，请先在养成页更新。',
  unsupported: '日程版本暂不支持，请更新页面或重新保存日程。'
}
