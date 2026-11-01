// Relabel the exported copy; re-entering the embed would reset drafts and undo history.
export async function relabelStarArchive(exported, name) {
  const document = JSON.parse(await exported.blob.text())
  document.accountDisplayName = name
  const safeName = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 48) || 'account'
  const dateSuffix = exported.filename.match(/_\d{4}-\d{2}-\d{2}\.json$/)?.[0] || '.json'
  return {
    blob: new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }),
    filename: 'YuanStar_' + safeName + dateSuffix,
  }
}
