export const OPERATOR_LEDGER_CARD_VERSIONS = Object.freeze({
  V1: 'v1',
  V2: 'v2'
})

// Change this one value to switch every ledger-card caller to another skin.
export const ACTIVE_OPERATOR_LEDGER_CARD_VERSION = OPERATOR_LEDGER_CARD_VERSIONS.V2

export function operatorLedgerCardVersionClass(version = ACTIVE_OPERATOR_LEDGER_CARD_VERSION) {
  const selected = Object.values(OPERATOR_LEDGER_CARD_VERSIONS).includes(version)
    ? version
    : ACTIVE_OPERATOR_LEDGER_CARD_VERSION

  return `agent-ledger-card--${selected}`
}
