// 统一子账号（库存 × 密探共用）类型声明 —— /v1/accounts
// 响应元素与旧 InventoryAccountResponse / OperatorAccountResponse 同构。

export interface SubAccount {
  id: string
  name: string
  created_at?: string
  updated_at?: string
}

export function listAccounts(): Promise<SubAccount[]>
export function createAccount(name: string): Promise<SubAccount>
export function renameAccount(accountId: string, name: string): Promise<SubAccount>
export function deleteAccount(accountId: string): Promise<unknown>
