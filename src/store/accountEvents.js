import { reactive } from 'vue'
import { openAccountEventStream } from '../api/accountEvents.js'
import { AGENT_CATALOG, ITEM_CATALOG } from '../data/inventory/catalog.js'
import { activeAccount } from './activeAccount.js'
import { auth } from './auth.js'

const listeners = new Set()
const seenEventIds = new Set()
const toastTimers = new Map()
const entityNames = new Map(ITEM_CATALOG.concat(AGENT_CATALOG).map(function (entry) { return [entry.id, entry.name] }))
let inventoryToastFavoriteAgentIds = new Set()
let stream = null
let streamAccountId = ''

export const accountEvents = reactive({
  toasts: []
})

function eventIdOf(message) {
  const data = message && message.data
  return (message && message.id) || (data && data.event_id) || ''
}

function rememberEvent(eventId) {
  if (!eventId) return true
  if (seenEventIds.has(eventId)) return false
  seenEventIds.add(eventId)
  if (seenEventIds.size > 300) seenEventIds.delete(seenEventIds.values().next().value)
  return true
}

function removeToast(id) {
  const timer = toastTimers.get(id)
  if (timer != null) clearTimeout(timer)
  toastTimers.delete(id)
  accountEvents.toasts = accountEvents.toasts.filter(function (toast) { return toast.id !== id })
}

function showToast(toast) {
  const id = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'account-event-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  accountEvents.toasts = accountEvents.toasts.concat([Object.assign({ id: id, tone: 'success', kind: 'system', title: '', detail: '' }, toast)]).slice(-3)
  const timer = setTimeout(function () { removeToast(id) }, 3800)
  toastTimers.set(id, timer)
}

function formatInventoryEntry(entry, recordType) {
  const name = entry && (entry.name || entityNames.get(entry.id) || entry.id)
  const rawCount = Number(entry && entry.count)
  const count = Number.isFinite(rawCount) ? rawCount : 0
  const sign = recordType === 'stock_snapshot' ? '=' : (count > 0 ? '+' : '')
  return name + sign + count
}

function inventoryToastRecord(records) {
  const record = Array.isArray(records) ? records.find(function (item) {
    return Array.isArray(item && item.entries) && item.entries.length
  }) : null
  return record || null
}

function inventoryToastEntries(records, channel) {
  const matchingRecords = (Array.isArray(records) ? records : []).filter(function (record) {
    return record && record.record_type !== 'stock_snapshot' && String(record.acquisition_channel || record.acquisitionChannel || '').trim() === channel && Array.isArray(record.entries)
  })
  return matchingRecords.flatMap(function (record) {
    return record.entries.map(function (entry) {
      const entityType = entry && (entry.entity_type || entry.entityType) || record.entity_type || record.entityType || ''
      return Object.assign({}, entry, {
        name: entry && (entry.name || entityNames.get(entry.id) || entry.id),
        entityType: entityType,
        display: formatInventoryEntry(entry, record.record_type),
        highlight: entry && entry.id === 'baijinbi'
          ? 'is-white-coin'
          : (entry && entry.id === 'zhuyu'
              ? 'is-zhuyu'
              : (entityType === 'agent' && inventoryToastFavoriteAgentIds.has(entry.id) ? 'is-favorite-agent' : ''))
      })
    })
  })
}

function inventoryToastDetail(records) {
  const record = inventoryToastRecord(records)
  if (!record) return ''
  const entries = record.entries.slice(0, 2).map(function (entry) {
    return formatInventoryEntry(entry, record.record_type)
  })
  const remaining = record.entries.length - entries.length
  if (remaining > 0) entries.push('另 ' + remaining + ' 项')
  return entries.join(' · ')
}

function notifyForEvent(message) {
  const data = message.data || {}
  if (message.event === 'operator_scan_import') {
    const operator = AGENT_CATALOG.find(function (entry) { return entry.id === data.operator_id })
    const name = (operator && operator.name) || entityNames.get(data.operator_id) || data.operator_id || '密探'
    if (data.status === 'accepted' || data.status === 'partial') {
      const isRecruitment = Number(data.revision) === 1
      showToast({
        kind: 'operator',
        operatorId: data.operator_id,
        rarity: operator && operator.rarity,
        action: isRecruitment ? 'recruited' : 'updated',
        title: name + ' · ' + (isRecruitment ? '已招募' : '已更新'),
        detail: isRecruitment ? 'NEW RECRUITMENT' : 'COMPENDIUM UPDATED'
      })
    }
    else if (data.status === 'review' || data.status === 'rejected') showToast({ kind: 'operator', tone: 'warning', title: name + '需要复核', detail: '采集结果尚未写入档案' })
  } else if (message.event === 'inventory_import') {
    const record = inventoryToastRecord(data.records)
    const isSnapshot = Array.isArray(data.records) && data.records.some(function (item) { return item && item.record_type === 'stock_snapshot' })
    const channel = record && String(record.acquisition_channel || record.acquisitionChannel || '').trim()
    const isExpandedChannel = channel === '据点情报' || channel.indexOf('派遣') === 0
    showToast({
      kind: 'inventory',
      title: isSnapshot ? '库存已同步' : (isExpandedChannel ? channel : '新增库存流水'),
      detail: isSnapshot ? '' : (isExpandedChannel ? '' : (inventoryToastDetail(data.records) || '库存已同步')),
      entries: isSnapshot || !isExpandedChannel ? [] : inventoryToastEntries(data.records, channel),
      inventoryChannel: channel,
      inventorySnapshot: isSnapshot
    })
  }
}

function publish(message) {
  if (!message) return
  const data = message.data || {}
  if (data.account_id && data.account_id !== activeAccount.id) return
  if (!rememberEvent(eventIdOf(message))) return
  notifyForEvent(message)
  listeners.forEach(function (listener) { listener(message) })
}

export function subscribeAccountEvents(listener) {
  listeners.add(listener)
  return function unsubscribe() { listeners.delete(listener) }
}

export function syncAccountEventStream() {
  const accountId = auth.isLoggedIn ? activeAccount.id : ''
  if (stream && streamAccountId === accountId) return
  stopAccountEventStream()
  if (!accountId) return
  streamAccountId = accountId
  seenEventIds.clear()
  stream = openAccountEventStream({
    accountId: accountId,
    onOpen: function () {
      listeners.forEach(function (listener) {
        listener({ event: 'account_stream_open', data: { account_id: accountId } })
      })
    },
    onEvent: publish,
    onError: function () { /* Reconnect is handled by the stream client. */ }
  })
}

export function stopAccountEventStream() {
  if (stream) stream.close()
  stream = null
  streamAccountId = ''
}

export function dismissAccountEventToast(id) {
  removeToast(id)
}

export function setInventoryToastFavoriteAgentIds(ids) {
  inventoryToastFavoriteAgentIds = new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])
}

export function previewAccountEvent(kind) {
  if (!import.meta.env.DEV) return
  const base = {
    event_id: 'preview:' + Date.now() + ':' + Math.random().toString(36).slice(2),
    account_id: activeAccount.id,
    preview: true
  }
  if (kind === 'inventory' || kind === 'inventory-dispatch' || kind === 'inventory-snapshot') {
    publish({ event: 'inventory_import', data: Object.assign({}, base, {
      accepted: 1,
      records: [{
        record_type: kind === 'inventory-snapshot' ? 'stock_snapshot' : 'reward_delta',
        acquisition_channel: kind === 'inventory-dispatch' ? '派遣' : (kind === 'inventory' ? '据点情报' : ''),
        entity_type: 'item',
        entries: [
          { id: 'baimozhijiu', count: 3 },
          { id: 'bingshucanjuan', count: 1 },
          { id: 'baijinbi', count: 500 },
          { id: 'zhuyu', count: 50 },
          { id: 'char_001_yangxiu', entity_type: 'agent', count: 2 }
        ]
      }]
    }) })
    return
  }
  const status = kind === 'review' ? 'review' : 'accepted'
  publish({
    event: 'operator_scan_import',
    data: Object.assign({}, base, {
      operator_id: kind === 'fazheng-new'
        ? 'char_108_fazheng'
        : (kind === 'shizimiao-sp-new'
            ? 'char_085_shizimiaosp'
            : (kind === 'chendeng-sp-new' ? 'char_084_chendengsp' : 'char_121_menghuo')),
      status: status,
      revision: kind === 'operator-new' || kind === 'fazheng-new' || kind === 'shizimiao-sp-new' || kind === 'chendeng-sp-new' ? 1 : 8
    })
  })
}
