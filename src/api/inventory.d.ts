import type {
  InventoryExchangeDocument,
  InventoryExchangeRecord,
  InventoryExchangeWireRecord,
  InventoryRecordPage
} from '../data/inventory/exchange.js'

type ImportDocument = InventoryExchangeDocument<InventoryExchangeRecord | InventoryExchangeWireRecord>

interface InventoryAccount {
  id: string
  name: string
  created_at?: string
  updated_at?: string
}

interface InventoryImportResult {
  accepted: number
  duplicates: number
  history_only?: number
  superseded?: number
  warnings?: string[]
}

export function listAccounts(): Promise<InventoryAccount[]>
export function createAccount(name: string): Promise<InventoryAccount>
export function renameAccount(accountId: string, name: string): Promise<InventoryAccount>
export function deleteAccount(accountId: string): Promise<unknown>
export function listAgentFavorites(accountId?: string): Promise<unknown>
export function addAgentFavorite(accountId: string | undefined, agentId: string): Promise<unknown>
export function removeAgentFavorite(accountId: string | undefined, agentId: string): Promise<unknown>
export function getCatalog(): Promise<unknown>
export function importInventory(document: ImportDocument): Promise<InventoryImportResult>
export function importInventoryOpenApi(document: ImportDocument, token: string): Promise<InventoryImportResult>
export function getCurrent(options?: { accountId?: string; entityType?: 'item' | 'agent' }): Promise<unknown>
export function getAcquired(options: { accountId: string; entityType: 'item' | 'agent'; from: string; to: string }): Promise<unknown>
export function listRecords(options?: {
  accountId?: string
  entityType?: 'item' | 'agent'
  from?: string
  to?: string
  cursor?: string | null
  limit?: number
}): Promise<InventoryRecordPage>
export function exportInventory(options: {
  accountId?: string
  scope?: 'all'
  include?: string
  from?: string
  to?: string
}): Promise<InventoryExchangeDocument<InventoryExchangeWireRecord>>
export function deleteRecord(recordId: string, accountId?: string): Promise<unknown>
