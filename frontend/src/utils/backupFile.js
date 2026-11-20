export function backupFilename(feature, accountName, game, format = 'json') {
  const account = (accountName || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 48) || '未命名账号'
  const now = new Date()
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
  const label = format === 'csv' ? `${feature}记录表格` : `${feature}备份`
  return `YuanHub-${label}-${account}-${game}-${date}.${format}`
}

export function backupDownloadNotice(filename) {
  return `已下载「${filename}」。电脑上在「下载」文件夹；手机上可在浏览器的下载记录或「文件」App 里找到。`
}

export const BACKUP_PROFILE_HASH = '#backup-restore'
export const BACKUP_PROFILE_LINK = '/user/profile' + BACKUP_PROFILE_HASH
export const FULL_BACKUP_FORMAT = 'yuanhub-full-backup'
export const FULL_BACKUP_MAX_BYTES = 64 * 1024 * 1024
export const BACKUP_PARTS = Object.freeze({
  operator: { label: '密探', route: 'operator' },
  operator_organization: { label: '密探分类', route: 'operator' },
  inventory: { label: '库存', route: 'inventory' },
  bonds: { label: '羁绊', route: 'bonds' },
  recruitment: { label: '招募', route: 'recruitment' },
  achievement: { label: '成就', route: 'achievement' },
  relationships: { label: '信赖与传闻', route: 'operator' },
})

export function parseFullBackup(text) {
  let backup
  try { backup = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { return null }
  if (backup?.format !== FULL_BACKUP_FORMAT) return null
  if (backup.schema_version !== 1 || !backup.parts || typeof backup.parts !== 'object' || Array.isArray(backup.parts)) {
    throw new Error('无法识别这份全部数据备份，请选择本站下载的备份文件。')
  }
  return backup
}

export function fullBackupPartFile(backup, partKey, filename) {
  if (partKey === 'star') throw new Error('全部数据备份不含星石，请选择星石备份文件。')
  if (!Object.hasOwn(backup.parts, partKey) || backup.parts[partKey] == null) {
    throw new Error(`这个全部数据备份里没有${BACKUP_PARTS[partKey].label}记录。`)
  }
  return new File([JSON.stringify(backup.parts[partKey])], filename, { type: 'application/json' })
}

export async function unwrapFullBackup(file, partKey, { text, game } = {}) {
  if (file.size > FULL_BACKUP_MAX_BYTES) {
    const header = text ?? await file.slice(0, 4096).text()
    if (!/^\s*\{\s*"format"\s*:\s*"yuanhub-full-backup"/.test(header)) return file
    if (partKey === 'star') throw new Error('全部数据备份不含星石，请选择星石备份文件。')
    throw new Error('全部数据备份太大，请选择对应功能单独下载的备份文件。')
  }
  const backup = parseFullBackup(text ?? await file.text())
  if (!backup) return file
  const part = fullBackupPartFile(backup, partKey, file.name)
  if (game && backup.game !== game) throw new Error('备份游戏与当前账号不一致，请切换到对应游戏账号。')
  return part
}
