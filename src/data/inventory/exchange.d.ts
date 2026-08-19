export const MAX_STAMINA_COST: 2147483647

export interface InventoryExchangeEntry {
  id: string
  name?: string
  count: number
}

export interface InventoryExchangeRecord {
  account_id?: string
  record_id: string
  record_type: 'reward_delta' | 'stock_snapshot'
  entity_type: 'item' | 'agent'
  acquisition_channel?: string
  effective_at: string
  snapshot_scope?: 'full' | 'listed'
  entries: InventoryExchangeEntry[]
  /** Domain-model name. Serialized to JSON as stamina_cost. */
  staminaCost?: number
}

export interface InventoryExchangeWireRecord extends Omit<InventoryExchangeRecord, 'staminaCost'> {
  /** Present only for reward_delta records whose channel contains "派遣". */
  stamina_cost?: number
}

export interface InventoryExchangeDocument<TRecord = InventoryExchangeRecord> {
  format: 'myshare-inventory-exchange'
  version: 2
  exported_at?: string
  catalog_version?: string
  producer?: { platform: string; version: string }
  accounts?: Array<{ id: string; name?: string }>
  records: TRecord[]
}

export interface InventoryRecordPage {
  items: InventoryExchangeRecord[]
  next_cursor?: string | null
}

export function isDispatchReward(record: InventoryExchangeRecord | InventoryExchangeWireRecord): boolean
export function validateInventoryRecord<T extends InventoryExchangeRecord | InventoryExchangeWireRecord>(record: T): T
export function validateInventoryExchangeDocument<T extends InventoryExchangeDocument>(document: T): T
export function serializeInventoryRecord(record: InventoryExchangeRecord | InventoryExchangeWireRecord): InventoryExchangeWireRecord
export function serializeInventoryExchangeDocument(document: InventoryExchangeDocument): InventoryExchangeDocument<InventoryExchangeWireRecord>
export function deserializeInventoryRecord(record: InventoryExchangeWireRecord): InventoryExchangeRecord
export function deserializeInventoryRecordPage(page: { items: InventoryExchangeWireRecord[]; next_cursor?: string | null }): InventoryRecordPage
export function deserializeInventoryExchangeDocument(document: InventoryExchangeDocument<InventoryExchangeWireRecord>): InventoryExchangeDocument
export function staminaCostOf(record: InventoryExchangeRecord | InventoryExchangeWireRecord): number | undefined
