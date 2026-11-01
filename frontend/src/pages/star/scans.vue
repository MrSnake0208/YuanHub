<template>
  <div class="page-star-scans"><IslandSidebar /><main id="main-content" class="scan-main">
    <header class="page-header"><div class="wrap"><router-link class="page-header-back" to="/star">← 返回星石背包</router-link>
      <h1 class="page-header-title">核对星石识别结果</h1><p v-if="account" class="page-header-context">{{ account.name }} · {{ account.game }}</p>
    </div></header>
    <div class="wrap"><p v-if="error" role="alert">{{ error }}</p><p v-else-if="!account" role="status">正在读取账号…</p>
      <StarScanInbox v-else-if="canReviewScans" :key="owner + ':' + account.id" :account-id="account.id" :apply="apply" />
    </div>
  </main></div>
</template>
<script setup>
import '@/styles/page-header.css'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import { listAccounts } from '../../api/accounts.js'
import { applyStarScan } from '../../api/starScans.js'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import StarScanInbox from './StarScanInbox.vue'
import { waitForYuanStarDisposal } from './embedLifecycle.js'

const route = useRoute(), account = ref(null), error = ref('')
const owner = computed(() => String(auth.userInfo?.id || ''))
const canReviewScans = computed(() => auth.isLoggedIn && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.STAR_SCAN_REVIEW))
let sequence = 0
watch([owner, canReviewScans, () => route.query.account_id], async () => {
  const token = ++sequence
  account.value = null; error.value = ''
  if (!owner.value) { error.value = '请登录后返回星石背包选择账号。'; return }
  if (!canReviewScans.value) { error.value = '暂无该功能的访问权限。'; return }
  try {
    await waitForYuanStarDisposal()
    if (token !== sequence) return
    const accounts = await listAccounts()
    if (token !== sequence) return
    account.value = accounts.find(item => item.id === route.query.account_id) || null
    if (!account.value) error.value = '账号不存在，请返回星石背包重新选择。'
  } catch (failure) { if (token === sequence) error.value = failure.message || '账号读取失败。' }
}, { immediate: true })
function apply(id, body) {
  if (!canReviewScans.value || !account.value || !owner.value) throw new Error('账号或权限已变化，请重新打开核对页面。')
  return applyStarScan(account.value.id, id, body)
}
onBeforeUnmount(() => { ++sequence })
</script>
<style scoped>
.scan-main { margin-left: var(--sidebar-width, 240px); min-height: 100vh; padding-bottom: 2rem; }
@media (max-width: 1024px) { .scan-main { margin-left: 0; padding-bottom: 6rem; } }
</style>
