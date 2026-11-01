import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLedgerCatalog, ledgerCampaignProgress, bundledLedgerCatalog, formatLedgerTime } from '../src/utils/ledgerCatalog.js'
import { ledgerFixture } from '../test-support/ledgerCatalog.js'

test('activity times use the declared zone instead of the browser local zone', () => {
  assert.equal(formatLedgerTime('2026-10-01T00:00:00Z', 'Asia/Shanghai'), '2026/10/01 08:00:00')
  assert.equal(formatLedgerTime(null, 'Asia/Shanghai'), '开始时间未记录')
})

test('game scoped duplicate IDs and decimal draws normalize without touching originals', () => {
  const raw = ledgerFixture(), before = JSON.stringify(raw)
  const catalog = normalizeLedgerCatalog(raw)
  assert.equal(catalog.packages.daihao[0].priceUsd, 2)
  assert.equal(catalog.packages.ru[0].priceCny, 6)
  assert.equal(catalog.packages.ru[0].draws, 0.6)
  assert.equal(JSON.stringify(raw), before)
  assert.equal(normalizeLedgerCatalog({ ...raw, packages: [] }).packages.ru.length, 0)
})

test('null partial duplicate and disabled public responses fail visibly instead of clearing data', () => {
  const raw = ledgerFixture()
  for (const bad of [null, {}, { ...raw, settings: {} }, { ...raw, packages: raw.packages.concat(raw.packages[0]) },
    { ...raw, packages: [{ ...raw.packages[0], enabled: false }] }, { ...raw, campaigns: [{ ...raw.campaigns[0], status: 'draft' }] },
    { ...raw, campaigns: [{ ...raw.campaigns[0], time_zone: 'fake' }] }]) assert.throws(() => normalizeLedgerCatalog(bad))
})

test('arbitrary activity count is game scoped and exact start end boundaries never advertise expired rewards', () => {
  const campaigns = ledgerFixture().campaigns, start = Date.parse(campaigns[0].starts_at), end = Date.parse(campaigns[0].ends_at)
  assert.equal(ledgerCampaignProgress(campaigns, 'daihao', 60, start).length, 2)
  assert.equal(ledgerCampaignProgress(campaigns, 'ru', 60, start).length, 1)
  for (const [now, active, label] of [[start - 1, false, '未开始'], [start, true, '剩余:'], [end, false, '已结束']]) {
    const progress = ledgerCampaignProgress(campaigns, 'daihao', 60, now)[0]
    assert.equal(progress.active, active)
    assert.ok(progress.label.includes(label))
    assert.equal(progress.next, active ? 100 : null)
  }
  const off = ledgerCampaignProgress([{ ...campaigns[0], status: 'disabled' }], 'daihao', 100, start)[0]
  assert.equal(off.active, false); assert.equal(off.unlocked.length, 1)
  assert.ok(bundledLedgerCatalog.campaigns.every(c => Date.parse(c.ends_at) < Date.parse('2026-10-11')))
})
