import { isDispatchReward, staminaCostOf } from './exchange.js'

export const UNKNOWN_ACQUISITION_CHANNEL = '未标注来源'

export function acquisitionChannel(value) {
  const channel = String(value || '').trim()
  return channel || UNKNOWN_ACQUISITION_CHANNEL
}

export function localDayKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function ensureEntity(map, id, name) {
  if (!map.has(id)) {
    map.set(id, {
      id,
      name: name || id,
      count: 0,
      recordIds: new Set(),
      channels: new Map(),
      days: new Map()
    })
  }
  const entity = map.get(id)
  if ((!entity.name || entity.name === id) && name) entity.name = name
  return entity
}

function addCount(map, key, count) {
  map.set(key, (map.get(key) || 0) + count)
}

export function dispatchHoursForStaminaCost(staminaCost) {
  if (!Number.isInteger(staminaCost) || staminaCost < 0) return undefined
  if (staminaCost % 10 === 0) return staminaCost / 10
  if (staminaCost % 9 === 0) return staminaCost / 9
  return undefined
}

export function summarizeDispatchDuration(records) {
  const summary = {
    totalHours: 0,
    dispatchRecordCount: 0,
    convertedRecordCount: 0,
    unconvertedRecordCount: 0
  }
  const list = Array.isArray(records) ? records : []
  list.forEach(function (record) {
    if (!isDispatchReward(record)) return
    summary.dispatchRecordCount += 1
    const hours = dispatchHoursForStaminaCost(staminaCostOf(record))
    if (hours === undefined) {
      summary.unconvertedRecordCount += 1
      return
    }
    summary.totalHours += hours
    summary.convertedRecordCount += 1
  })
  return summary
}

export function buildAcquiredStats(records) {
  const rewardRecords = (Array.isArray(records) ? records : []).filter(function (record) {
    return record && record.record_type === 'reward_delta'
  })
  const channels = new Map()
  const days = new Map()
  const entities = new Map()

  rewardRecords.forEach(function (record, recordIndex) {
    const channelName = acquisitionChannel(record.acquisition_channel)
    const dayKey = localDayKey(record.effective_at)
    const recordId = record.record_id || 'record-' + recordIndex
    const entries = Array.isArray(record.entries) ? record.entries : []

    if (!channels.has(channelName)) {
      channels.set(channelName, { name: channelName, recordCount: 0, entityIds: new Set(), counts: new Map() })
    }
    const channel = channels.get(channelName)
    channel.recordCount += 1

    if (dayKey && !days.has(dayKey)) {
      days.set(dayKey, { date: dayKey, recordCount: 0, entityIds: new Set(), counts: new Map() })
    }
    const day = dayKey ? days.get(dayKey) : null
    if (day) day.recordCount += 1

    entries.forEach(function (entry) {
      if (!entry || !entry.id) return
      const count = Number(entry.count) || 0
      const entity = ensureEntity(entities, entry.id, entry.name)
      entity.count += count
      entity.recordIds.add(recordId)
      addCount(entity.channels, channelName, count)
      if (dayKey) addCount(entity.days, dayKey, count)

      channel.entityIds.add(entry.id)
      addCount(channel.counts, entry.id, count)
      if (day) {
        day.entityIds.add(entry.id)
        addCount(day.counts, entry.id, count)
      }
    })
  })

  return {
    recordCount: rewardRecords.length,
    activeDayCount: days.size,
    entityCount: entities.size,
    dispatchDuration: summarizeDispatchDuration(rewardRecords),
    rewardRecords,
    entities: Array.from(entities.values()).map(function (entity) {
      return {
        id: entity.id,
        name: entity.name,
        count: entity.count,
        recordCount: entity.recordIds.size,
        channels: Object.fromEntries(entity.channels),
        days: Object.fromEntries(entity.days)
      }
    }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'zh-CN') }),
    channels: Array.from(channels.values()).map(function (channel) {
      return {
        name: channel.name,
        recordCount: channel.recordCount,
        entityCount: channel.entityIds.size,
        counts: Object.fromEntries(channel.counts)
      }
    }).sort(function (a, b) { return b.recordCount - a.recordCount || a.name.localeCompare(b.name, 'zh-CN') }),
    days: Array.from(days.values()).map(function (day) {
      return {
        date: day.date,
        recordCount: day.recordCount,
        entityCount: day.entityIds.size,
        counts: Object.fromEntries(day.counts)
      }
    }).sort(function (a, b) { return a.date.localeCompare(b.date) })
  }
}

export function mapsHaveSameCounts(left, right) {
  const leftMap = left || {}
  const rightMap = right || {}
  const ids = new Set(Object.keys(leftMap).concat(Object.keys(rightMap)))
  return Array.from(ids).every(function (id) {
    return (Number(leftMap[id]) || 0) === (Number(rightMap[id]) || 0)
  })
}

function positiveCount(value) {
  const count = Number(value) || 0
  return count > 0 ? count : 0
}

function rewardRecords(records) {
  return (Array.isArray(records) ? records : []).filter(function (record) {
    return record && record.record_type === 'reward_delta'
  })
}

function totalsFromRecords(records) {
  const totals = {}
  rewardRecords(records).forEach(function (record) {
    const entries = Array.isArray(record.entries) ? record.entries : []
    entries.forEach(function (entry) {
      if (!entry || !entry.id) return
      totals[entry.id] = (totals[entry.id] || 0) + positiveCount(entry.count)
    })
  })
  return totals
}

function normalizedTotals(totals, records) {
  if (totals && typeof totals === 'object' && !Array.isArray(totals)) return totals
  return totalsFromRecords(records)
}

function dayDistance(fromDay, toDay) {
  const from = Date.parse(String(fromDay || '') + 'T00:00:00Z')
  const to = Date.parse(String(toDay || '') + 'T00:00:00Z')
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined
  return Math.max(0, Math.round((to - from) / 86400000))
}

function longestDayStreak(days) {
  const ordered = Array.from(new Set(days.filter(Boolean))).sort()
  let longest = 0
  let current = 0
  let previous = ''
  ordered.forEach(function (day) {
    current = previous && dayDistance(previous, day) === 1 ? current + 1 : 1
    longest = Math.max(longest, current)
    previous = day
  })
  return longest
}

function bestDay(rows) {
  const ranked = rows.filter(function (row) { return row.count > 0 }).sort(function (left, right) {
    return right.count - left.count || right.date.localeCompare(left.date)
  })
  if (!ranked.length) return null
  const winner = ranked[0]
  return Object.assign({}, winner, {
    tieCount: ranked.filter(function (row) { return row.count === winner.count }).length
  })
}

function biasLabel(ratio) {
  if (ratio < 0.4) return '雨露均沾'
  if (ratio < 0.7) return '有所偏爱'
  return '本期偏爱明显'
}

function namedFavoriteAgents(favoriteAgents) {
  return (Array.isArray(favoriteAgents) ? favoriteAgents : []).filter(function (agent) {
    return agent && agent.id
  }).map(function (agent) {
    return { id: agent.id, name: agent.name || agent.id }
  })
}

export function buildRewardInsights({
  itemTotals,
  agentTotals,
  itemRecords,
  agentRecords,
  favoriteAgents,
  rangeEnd,
  minimumBiasSample = 10
} = {}) {
  const items = rewardRecords(itemRecords)
  const agents = rewardRecords(agentRecords)
  const resolvedItemTotals = normalizedTotals(itemTotals, items)
  const resolvedAgentTotals = normalizedTotals(agentTotals, agents)
  const favorites = namedFavoriteAgents(favoriteAgents)
  const favoriteIds = new Set(favorites.map(function (agent) { return agent.id }))
  const favoriteNames = new Map(favorites.map(function (agent) { return [agent.id, agent.name] }))
  const agentNames = new Map(favorites.map(function (agent) { return [agent.id, agent.name] }))
  const agentRecordMeta = new Map()
  const activeDays = new Set()
  const coinDays = new Map()
  const favoriteDays = new Map()
  const favoriteDayAgents = new Map()
  const luckyCoframes = []
  let yuanbaoWhiteCoin = 0

  items.concat(agents).forEach(function (record) {
    const day = localDayKey(record.effective_at)
    if (day) activeDays.add(day)
  })

  items.forEach(function (record) {
    const day = localDayKey(record.effective_at)
    const isYuanbao = acquisitionChannel(record.acquisition_channel) === '鸢报'
    if (day && !coinDays.has(day)) coinDays.set(day, { date: day, direct: 0, zhuyu: 0, count: 0 })
    const row = day ? coinDays.get(day) : null
    const entries = Array.isArray(record.entries) ? record.entries : []
    entries.forEach(function (entry) {
      if (!entry) return
      if (entry.id === 'baijinbi') {
        const count = positiveCount(entry.count)
        if (row) row.direct += count
        if (isYuanbao) yuanbaoWhiteCoin += count
      }
      if (entry.id === 'zhuyu' && row) row.zhuyu += positiveCount(entry.count)
    })
    if (row) row.count = row.direct + row.zhuyu * 50
  })

  agents.forEach(function (record) {
    const day = localDayKey(record.effective_at)
    const entries = Array.isArray(record.entries) ? record.entries : []
    const favoriteEntries = new Map()
    entries.forEach(function (entry) {
      if (!entry || !entry.id) return
      if (entry.name) agentNames.set(entry.id, entry.name)
      const count = positiveCount(entry.count)
      if (!count) return
      if (!agentRecordMeta.has(entry.id)) agentRecordMeta.set(entry.id, { recordIds: new Set(), lastDay: '' })
      const meta = agentRecordMeta.get(entry.id)
      meta.recordIds.add(record.record_id || record.effective_at || String(meta.recordIds.size))
      if (day && (!meta.lastDay || day > meta.lastDay)) meta.lastDay = day
      if (favoriteIds.has(entry.id)) {
        favoriteEntries.set(entry.id, (favoriteEntries.get(entry.id) || 0) + count)
        if (day) {
          favoriteDays.set(day, (favoriteDays.get(day) || 0) + count)
          if (!favoriteDayAgents.has(day)) favoriteDayAgents.set(day, new Map())
          const dayAgents = favoriteDayAgents.get(day)
          dayAgents.set(entry.id, (dayAgents.get(entry.id) || 0) + count)
        }
      }
    })
    if (favoriteEntries.size >= 2) {
      luckyCoframes.push({
        recordId: record.record_id || '',
        date: day,
        effectiveAt: record.effective_at || '',
        channel: acquisitionChannel(record.acquisition_channel),
        count: Array.from(favoriteEntries.values()).reduce(function (sum, count) { return sum + count }, 0),
        agents: Array.from(favoriteEntries.entries()).map(function (pair) {
          return { id: pair[0], name: favoriteNames.get(pair[0]) || agentNames.get(pair[0]) || pair[0], count: pair[1] }
        }).sort(function (left, right) { return right.count - left.count || left.name.localeCompare(right.name, 'zh-CN') })
      })
    }
  })

  const ranking = Object.keys(resolvedAgentTotals).map(function (id) {
    const meta = agentRecordMeta.get(id)
    return {
      id: id,
      name: agentNames.get(id) || id,
      count: positiveCount(resolvedAgentTotals[id]),
      recordCount: meta ? meta.recordIds.size : 0,
      lastDay: meta ? meta.lastDay : ''
    }
  }).filter(function (agent) { return agent.count > 0 }).sort(function (left, right) {
    return right.count - left.count || left.name.localeCompare(right.name, 'zh-CN')
  })
  const favoriteRanking = ranking.filter(function (agent) { return favoriteIds.has(agent.id) })
  const favoriteTotal = favoriteRanking.reduce(function (sum, agent) { return sum + agent.count }, 0)
  const leader = favoriteRanking[0] || null
  const biasRatio = leader && favoriteTotal ? leader.count / favoriteTotal : 0
  const missingFavorites = favorites.filter(function (agent) {
    return !favoriteRanking.some(function (ranked) { return ranked.id === agent.id })
  })
  const staleFavorites = favoriteRanking.map(function (agent) {
    return Object.assign({}, agent, { daysSinceLast: dayDistance(agent.lastDay, rangeEnd) })
  }).filter(function (agent) {
    return agent.daysSinceLast !== undefined
  }).sort(function (left, right) {
    return right.daysSinceLast - left.daysSinceLast || left.name.localeCompare(right.name, 'zh-CN')
  })

  const coinDayRows = Array.from(coinDays.values())
  const favoriteDayRows = Array.from(favoriteDays.entries()).map(function (pair) {
    const dayAgents = favoriteDayAgents.get(pair[0]) || new Map()
    const rankedAgents = Array.from(dayAgents.entries()).map(function (entry) {
      return { id: entry[0], name: favoriteNames.get(entry[0]) || agentNames.get(entry[0]) || entry[0], count: entry[1] }
    }).sort(function (left, right) {
      return right.count - left.count || left.name.localeCompare(right.name, 'zh-CN')
    })
    return { date: pair[0], count: pair[1], agentCount: rankedAgents.length, agents: rankedAgents }
  })
  luckyCoframes.sort(function (left, right) {
    return right.agents.length - left.agents.length || right.count - left.count || right.effectiveAt.localeCompare(left.effectiveAt)
  })

  const direct = positiveCount(resolvedItemTotals.baijinbi)
  const zhuyu = positiveCount(resolvedItemTotals.zhuyu)
  const yuanbao = Math.min(direct, yuanbaoWhiteCoin)
  const luoyang = Math.max(0, direct - yuanbao)
  return {
    rewardRecordCount: items.length + agents.length,
    activeDayCount: activeDays.size,
    whiteCoin: {
      direct: direct,
      luoyang: luoyang,
      yuanbao: yuanbao,
      zhuyu: zhuyu,
      equivalent: direct + zhuyu * 50,
      bestDay: bestDay(coinDayRows),
      longestStreak: longestDayStreak(coinDayRows.filter(function (row) { return row.count > 0 }).map(function (row) { return row.date }))
    },
    agents: {
      ranking: ranking,
      favoriteRanking: favoriteRanking,
      favoriteTotal: favoriteTotal,
      favoriteCount: favorites.length,
      favoriteAcquiredCount: favoriteRanking.length,
      coverageRatio: favorites.length ? favoriteRanking.length / favorites.length : null,
      missingFavorites: missingFavorites,
      stalestFavorite: staleFavorites[0] || null,
      luckyDay: bestDay(favoriteDayRows),
      luckyCoframes: luckyCoframes,
      bias: {
        leader: leader,
        ratio: biasRatio,
        percent: Math.round(biasRatio * 100),
        sampleSufficient: favoriteTotal >= minimumBiasSample,
        label: leader && favoriteTotal >= minimumBiasSample ? biasLabel(biasRatio) : '样本较少'
      }
    }
  }
}
