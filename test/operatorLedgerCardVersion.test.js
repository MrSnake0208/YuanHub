import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVE_OPERATOR_LEDGER_CARD_VERSION,
  OPERATOR_LEDGER_CARD_VERSIONS,
  operatorLedgerCardVersionClass
} from '../src/config/operatorLedgerCard.js'

test('密探养成卡片默认启用继承 v2 布局的 v3，并可显式回退 v1 / v2', () => {
  assert.equal(ACTIVE_OPERATOR_LEDGER_CARD_VERSION, OPERATOR_LEDGER_CARD_VERSIONS.V3)
  assert.equal(operatorLedgerCardVersionClass(), 'agent-ledger-card--v2 agent-ledger-card--v3')
  assert.equal(operatorLedgerCardVersionClass(OPERATOR_LEDGER_CARD_VERSIONS.V3), 'agent-ledger-card--v2 agent-ledger-card--v3')
  assert.equal(operatorLedgerCardVersionClass(OPERATOR_LEDGER_CARD_VERSIONS.V2), 'agent-ledger-card--v2')
  assert.equal(operatorLedgerCardVersionClass(OPERATOR_LEDGER_CARD_VERSIONS.V1), 'agent-ledger-card--v1')
})

test('未知卡片版本安全回退到当前启用版本', () => {
  assert.equal(operatorLedgerCardVersionClass('future'), 'agent-ledger-card--v2 agent-ledger-card--v3')
})
