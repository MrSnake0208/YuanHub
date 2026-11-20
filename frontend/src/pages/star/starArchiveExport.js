import { backupFilename } from '../../utils/backupFile.js'

// Relabel the exported copy; re-entering the embed would reset drafts and undo history.
export async function relabelStarArchive(exported, name, game) {
  const filename = backupFilename('星石', name, game)
  if (!name) return { blob: exported.blob, filename }
  const document = JSON.parse(await exported.blob.text())
  document.accountDisplayName = name
  return {
    blob: new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }),
    filename,
  }
}
