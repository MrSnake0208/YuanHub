<template>
  <section ref="card" class="connection-card account-backup touch-targets" aria-labelledby="account-backup-heading" :aria-busy="backingUp || reading">
    <h2 id="account-backup-heading">备份与恢复</h2>
    <p>把当前账号的密探、库存、羁绊、招募、成就、信赖与传闻一次存成一个文件。</p>
    <p v-if="!canUse">{{ identity ? '请先选择一个游戏账号。' : '请先登录并选择一个游戏账号。' }}</p>
    <div class="account-backup-actions">
      <button type="button" class="btn primary" :disabled="!canUse || busy" @click="exportBackup">{{ backingUp ? '正在备份…' : '备份全部数据' }}</button>
      <button type="button" class="btn ghost" :disabled="!canUse || busy" @click="fileInput.click()">{{ reading ? '正在读取…' : '从备份恢复' }}</button>
      <input ref="fileInput" type="file" hidden accept=".json,application/json" @change="selectBackup" />
    </div>
    <p v-if="exportError" class="action-feedback" role="alert">{{ exportError }}</p>
    <div v-if="receipt" role="status">
      <p class="action-feedback">{{ receipt.notice }}</p>
      <p>已包含：{{ receipt.included || '无' }}</p>
      <p v-if="receipt.missing.length">未包含：{{ receipt.missing.map(item => `${BACKUP_PARTS[item.key].label}（${item.reason}）`).join('、') }}</p>
    </div>
    <p class="account-backup-star">
      <span>星石不在全部数据备份里，请到星石页单独下载。</span>
      <BackupProfileLink :to="{ name: 'star' }">前往星石页</BackupProfileLink>
    </p>
    <p v-if="restoreError" class="action-feedback" role="alert">{{ restoreError }}</p>
    <div v-if="canUse && restoreSession" aria-live="polite">
      <p>将恢复到当前账号「{{ targetName }}」，打开后先显示预览，确认后才写入。</p>
      <p v-if="sourceName !== targetName">这份备份来自「{{ sourceName }}」。</p>
      <p v-if="!includedParts.length">这份备份没有可恢复的记录。</p>
      <ul class="restore-parts" v-else>
        <li v-for="key in includedParts" :key="key">
          <div>
            <strong>{{ BACKUP_PARTS[key].label }}</strong>
            <p>{{ sourceName }} · {{ sourceDate }}</p>
          </div>
          <div class="restore-part-actions">
            <small v-if="restoreSession.openedParts.has(key)">已打开过</small>
            <button type="button" class="btn ghost" :aria-label="`去恢复${BACKUP_PARTS[key].label}`" :disabled="busy" @click="goRestore(key)">去恢复</button>
          </div>
        </li>
      </ul>
      <div class="account-backup-actions">
        <button type="button" class="btn ghost" :disabled="busy" @click="fileInput.click()">换一个备份文件</button>
        <button type="button" class="btn ghost" :disabled="busy" @click="clearRestoreList">清除</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { exportAchievements } from '../../api/achievement.js'
import { exportBonds } from '../../api/bonds.js'
import { exportInventory } from '../../api/inventory.js'
import { exportOperator, getOperatorOrganization } from '../../api/operator.js'
import { getRelationships } from '../../api/operatorRelationships.js'
import { exportRecruitment } from '../../api/recruitment.js'
import BackupProfileLink from '../BackupProfileLink.vue'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { activeAccount, normalizeAccountGame } from '../../store/activeAccount.js'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import { BACKUP_PARTS, BACKUP_PROFILE_HASH, FULL_BACKUP_FORMAT, FULL_BACKUP_MAX_BYTES, backupDownloadNotice, backupFilename, fullBackupPartFile, parseFullBackup } from '../../utils/backupFile.js'
import { downloadBlob } from '../../utils/downloadFile.js'
import { operatorOrganizationBackup } from '../../utils/operatorOrganization.js'
import { makeRelationshipBackup } from '../../utils/operatorRelationships.js'
import { backupRestoreOwner, clearFullBackupRestore, fullBackupRestore as restoreSession, rememberFullBackup, stageBackupRestore } from '../../utils/pendingBackupRestore.js'

const props = defineProps({ account: Object })
const route = useRoute()
const router = route?.matched ? useRouter() : undefined
const card = ref(null), fileInput = ref(null), receipt = ref(null)
const backup = computed(() => restoreSession.value?.backup)
const backingUp = ref(false), reading = ref(false), navigating = ref(false)
const exportError = ref(''), restoreError = ref('')
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const canUse = computed(() => auth.isLoggedIn && !!identity.value && !!props.account?.id && props.account.id === activeAccount.id)
const busy = computed(() => backingUp.value || reading.value || navigating.value)
const includedParts = computed(() => Object.keys(BACKUP_PARTS).filter(key => backup.value && Object.hasOwn(backup.value.parts, key) && backup.value.parts[key] != null))
const sourceName = computed(() => typeof backup.value?.account?.name === 'string' && backup.value.account.name.trim() ? backup.value.account.name : '未命名账号')
const targetName = computed(() => props.account?.name?.trim() ? props.account.name : '未命名账号')
const sourceDate = computed(() => {
  const stamp = Date.parse(backup.value?.exported_at)
  return Number.isFinite(stamp) ? new Date(stamp).toLocaleDateString('zh-CN') : '导出日期不详'
})
const featureFlags = { bonds: FEATURE_KEYS.BOND_ARCHIVE, recruitment: FEATURE_KEYS.RECRUITMENT_ARCHIVE, achievement: FEATURE_KEYS.ACHIEVEMENT_ARCHIVE }

function unavailable(key) {
  if (featureFlags[key] && !isFeatureEnabled(featureFlags[key])) return '功能尚未开放'
  if (key === 'relationships' && !isFeatureEnabled(FEATURE_KEYS.OPERATOR_RELATIONSHIPS) &&
    !hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.OPERATOR_RELATIONSHIP_USE)) return '当前账号无法使用此功能'
  return ''
}

const loaders = {
  operator: ({ id }) => exportOperator({ version: 5, accountId: id }),
  async operator_organization({ id, game }) {
    const data = await getOperatorOrganization(id)
    if (data?.account_id !== id || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('分类归属或版本不一致')
    return operatorOrganizationBackup(data, game)
  },
  inventory: ({ id }) => exportInventory({ accountId: id, include: 'current,rewards' }),
  async bonds({ id, game, user }) {
    const data = await exportBonds(id, user)
    if (data?.format !== 'yuanhub-bonds' || data.game !== game) throw new Error('羁绊备份归属不一致')
    return data
  },
  recruitment: ({ id }) => exportRecruitment(id),
  achievement: ({ id, user }) => exportAchievements(id, user),
  async relationships({ id, game }) {
    const data = await getRelationships(id)
    if (data?.account_id !== id || data.game !== game || !Number.isSafeInteger(data.revision) || data.revision < 0 || !data.entries) throw new Error('信赖与传闻归属或版本不一致')
    return makeRelationshipBackup(game, data.entries)
  },
}

let sequence = 0
watch([backupRestoreOwner, canUse, () => props.account?.game], () => {
  sequence++
  backingUp.value = reading.value = navigating.value = false
  receipt.value = null
  exportError.value = restoreError.value = ''
}, { flush: 'sync' })
onBeforeUnmount(() => { sequence++ })
onMounted(() => {
  if (route?.hash === BACKUP_PROFILE_HASH) card.value?.scrollIntoView({ block: 'start' })
})

async function exportBackup() {
  if (!canUse.value || busy.value) return
  const run = ++sequence
  const { id, name } = props.account
  const game = normalizeAccountGame(props.account.game)
  const owner = { id, game, user: identity.value }
  const exported = { format: FULL_BACKUP_FORMAT, schema_version: 1, exported_at: new Date().toISOString(), game, account: { id, name: name || '' }, parts: {}, missing: [] }
  backingUp.value = true
  receipt.value = null
  exportError.value = ''
  try {
    for (const key of Object.keys(BACKUP_PARTS)) {
      const reason = unavailable(key)
      if (reason) { exported.missing.push({ key, reason }); continue }
      try {
        const data = await loaders[key](owner)
        if (!data || typeof data !== 'object') throw new Error('没有收到备份数据')
        exported.parts[key] = data
      } catch (err) {
        exported.missing.push({ key, reason: err?.status === 403 ? '当前账号没有使用权限' : '暂时读取失败，可稍后重试' })
      }
      if (run !== sequence) return
    }
    const blob = new Blob([JSON.stringify(exported)], { type: 'application/json' })
    if (blob.size > FULL_BACKUP_MAX_BYTES) throw new Error('这份备份太大，请到各页分别下载。')
    const nameForDownload = backupFilename('全部数据', name, game)
    downloadBlob(blob, nameForDownload)
    receipt.value = { notice: backupDownloadNotice(nameForDownload), included: Object.keys(exported.parts).map(key => BACKUP_PARTS[key].label).join('、'), missing: exported.missing }
  } catch (err) {
    if (run === sequence) exportError.value = err.message || '暂时无法下载备份，请重试。'
  } finally {
    if (run === sequence) backingUp.value = false
  }
}

async function selectBackup(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !canUse.value || busy.value) return
  const run = ++sequence
  reading.value = true
  restoreError.value = ''
  try {
    if (file.size > FULL_BACKUP_MAX_BYTES) throw new Error('这份备份太大，请到各页选择单独下载的备份。')
    const parsed = parseFullBackup(await file.text())
    if (!parsed) throw new Error('请选择从「备份全部数据」下载的文件。')
    if (run !== sequence) return
    rememberFullBackup(parsed, file.name)
  } catch (err) {
    if (run === sequence) restoreError.value = err.message || '暂时无法读取这份备份，请重新选择。'
  } finally {
    if (run === sequence) reading.value = false
  }
}

function clearRestoreList() {
  clearFullBackupRestore()
  restoreError.value = ''
}

async function goRestore(key) {
  const session = restoreSession.value
  if (!router || !canUse.value || busy.value || !session) return
  const reason = unavailable(key)
  if (reason) { restoreError.value = `${BACKUP_PARTS[key].label}暂时无法恢复（${reason}）。`; return }
  const run = ++sequence
  const name = BACKUP_PARTS[key].route
  const clear = stageBackupRestore(key, fullBackupPartFile(session.backup, key, session.filename), session.backup.game)
  restoreError.value = ''
  navigating.value = true
  try {
    const failure = await router.push({ name, query: { restore: key } })
    if (failure || router.currentRoute.value.name !== name) {
      clear()
      if (run === sequence) restoreError.value = '暂时打不开恢复页面，请稍后重试。'
    }
  } catch {
    clear()
    if (run === sequence) restoreError.value = '暂时打不开恢复页面，请稍后重试。'
  } finally {
    if (run === sequence) navigating.value = false
  }
}
</script>

<style scoped>
.connection-card.account-backup { margin-block: 20px; overflow-wrap: anywhere; scroll-margin-top: 90px; }
.account-backup h2 { margin: 5px 0 0; color: var(--ink); font: 900 26px/1.4 var(--font-s); letter-spacing: .04em; }
.account-backup p { margin-block: 8px; }
.account-backup-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 12px; }
.account-backup .btn { flex: none; min-height: 44px; max-width: 100%; }
.account-backup-star { display: flex; flex-wrap: wrap; align-items: center; column-gap: 8px; color: var(--ink-60); font-size: 13px; }
.restore-parts { list-style: none; margin: 12px 0; padding: 0; }
.restore-parts li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding-block: 10px; border-block-start: 1px solid var(--line); }
.restore-parts li > div:first-child { flex: 1; min-width: min(100%, 180px); }
.restore-parts li p { margin: 4px 0 0; color: var(--ink-60); }
.restore-part-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-inline-start: auto; }
.restore-part-actions small { color: var(--ink-60); font-size: 12px; }
@media (max-width: 767px) {
  .account-backup h2 { margin-top: 0; font-size: 22px; letter-spacing: 0; }
}
</style>
