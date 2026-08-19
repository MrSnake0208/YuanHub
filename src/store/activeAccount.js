// activeAccount 状态管理（Vue reactive 单例，无 pinia）
// - 记录「数据归属」当前选中的子账号 id（库存 × 密探 × 快捷导入共用）
// - localStorage key 'yh_active_account' 持久化：跨页面导航与刷新都不丢
// - 用法：import { activeAccount } from '@/store/activeAccount.js'
//   activeAccount.id 读；activeAccount.set(id) 写（自动持久化）；activeAccount.clear() 清空
import { reactive } from 'vue'

const STORAGE_KEY = 'yh_active_account'

function loadSaved() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch (_e) {
    return ''
  }
}

const savedId = loadSaved()

export const activeAccount = reactive({
  id: savedId,
  set(id) {
    activeAccount.id = id || ''
    persist()
    return activeAccount.id
  },
  clear() {
    activeAccount.set('')
  }
})

function persist() {
  try {
    if (activeAccount.id) localStorage.setItem(STORAGE_KEY, activeAccount.id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch (_e) {
    // 隐私模式 / 存储满等异常静默忽略，不影响读写内存态
  }
}
