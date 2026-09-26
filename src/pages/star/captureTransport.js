function remoteField(value, snake, camel) {
  return value && (value[snake] ?? value[camel])
}

const sections = ['main', 'support', 'experience']

// 采集契约类错误是确定性的，重试没有意义；用显式 code 与网络/运行时错误区分，
// 宿主据此决定是否提供“重试导入”。
export const STAR_CAPTURE_CONTRACT_CODE = 'star_capture_contract_invalid'

function contractError(message) {
  const error = new Error(message)
  error.code = STAR_CAPTURE_CONTRACT_CODE
  return error
}

export function isStarCaptureReadyEvent(message, accountId) {
  const data = message && message.data
  const eventAccountId = String(remoteField(data, 'account_id', 'accountId') || '').trim()
  return Boolean(message && message.event === 'star_capture_ready' && !data.preview && eventAccountId && eventAccountId === String(accountId || '').trim() && String(remoteField(data, 'capture_id', 'captureId') || '').trim())
}

export function starCaptureRouteForEvent(message, accountId) {
  if (!isStarCaptureReadyEvent(message, accountId)) return null
  const data = message.data
  return {
    path: '/star',
    query: {
      account_id: String(remoteField(data, 'account_id', 'accountId')),
      capture_id: String(remoteField(data, 'capture_id', 'captureId')),
    },
  }
}

export function isCurrentStarCapture(current, accountId) {
  return Boolean(current && String(current.accountId || '').trim() && String(current.accountId).trim() === String(accountId || '').trim())
}

export function captureIdFromRouteQuery(query) {
  return String(query && query.capture_id || '').trim()
}

export function clearStarCaptureRouteQuery(query) {
  const next = Object.assign({}, query)
  delete next.capture_id
  delete next.account_id
  return next
}

function imageFromManifest(image) {
  const sourceImageId = String(remoteField(image, 'source_image_id', 'sourceImageId') || '').trim()
  const sourceOrder = Number(remoteField(image, 'source_order', 'sourceOrder'))
  const fileName = String(remoteField(image, 'file_name', 'fileName') || '').trim()
  if (!sourceImageId || !Number.isInteger(sourceOrder) || sourceOrder < 1 || !fileName) throw contractError('星石截图 manifest 图片字段无效。')
  return { sourceImageId, sourceOrder, fileName }
}

function relationFromManifest(relation) {
  return {
    previousSourceImageId: String(remoteField(relation, 'previous_source_image_id', 'previousSourceImageId') || ''),
    currentSourceImageId: String(remoteField(relation, 'current_source_image_id', 'currentSourceImageId') || ''),
    relation: relation.relation,
  }
}

async function loadFullCaptureBatch(api, accountId, captureId, manifest, createFile) {
  const remoteSections = manifest && manifest.sections
  if (!remoteSections || typeof remoteSections !== 'object' || Array.isArray(remoteSections) || Object.keys(remoteSections).length !== sections.length || sections.some(function (section) { return !remoteSections[section] })) throw contractError('星石截图批次缺少完整三段采集。')
  const normalized = {}
  const allImages = []
  for (const sectionName of sections) {
    const section = remoteSections[sectionName]
    const images = Array.isArray(section && section.images) ? section.images.map(imageFromManifest) : []
    const adjacentRelations = Array.isArray(section && (section.adjacent_relations ?? section.adjacentRelations)) ? (section.adjacent_relations ?? section.adjacentRelations).map(relationFromManifest) : []
    const complete = section && section.complete === true
    const stopReason = String(remoteField(section, 'stop_reason', 'stopReason') || '')
    const expectedStopReason = sectionName === 'experience' ? 'single_capture' : 'bottom_no_move'
    if (!complete || stopReason !== expectedStopReason || (sectionName === 'experience' ? images.length !== 1 || adjacentRelations.length !== 0 : images.length === 0)) throw contractError('星石截图分段不满足完整采集契约。')
    normalized[sectionName] = { images, adjacentRelations, complete, stopReason }
    allImages.push(...images)
  }
  allImages.sort(function (left, right) { return left.sourceOrder - right.sourceOrder })
  if (new Set(allImages.map(function (image) { return image.sourceImageId })).size !== allImages.length || allImages.some(function (image, index) { return image.sourceOrder !== index + 1 })) throw contractError('星石截图全局顺序无效。')
  const downloads = await Promise.all(allImages.map(async function (image) {
    const downloaded = await api.getImage(accountId, captureId, image.sourceImageId)
    return [image.sourceImageId, createFile(downloaded.blob, image.fileName)]
  }))
  const files = new Map(downloads)
  for (const sectionName of sections) normalized[sectionName].images = normalized[sectionName].images.map(function (image) { return { sourceImageId: image.sourceImageId, sourceOrder: image.sourceOrder, file: files.get(image.sourceImageId) } })
  return {
    schemaVersion: 1,
    captureId: String(remoteField(manifest, 'capture_id', 'captureId') || captureId),
    source: 'maayuan',
    gameVersion: String(remoteField(manifest, 'game_version', 'gameVersion') || ''),
    sections: normalized,
  }
}

export async function loadStarCaptureBatch(api, accountId, captureId, createFile) {
  const manifest = await api.getManifest(accountId, captureId)
  if (manifest && manifest.sections) return loadFullCaptureBatch(api, accountId, captureId, manifest, createFile)
  throw contractError('星石截图批次缺少完整三段采集。')
}

export const STAR_CAPTURE_IMPORT_SUPERSEDED_CODE = 'star_capture_import_superseded'

const retryableImportCodes = new Set(['capture_import_locked', 'capture_workspace_unavailable', STAR_CAPTURE_IMPORT_SUPERSEDED_CODE])

export function isRetryableCaptureImportError(error) {
  const code = String((error && error.code) || '').trim()
  if (retryableImportCodes.has(code)) return true
  if (code === STAR_CAPTURE_CONTRACT_CODE) return false
  const status = Number(error && error.status)
  if (Number.isFinite(status) && status > 0) return status === 408 || status === 429 || status >= 500
  // 无 code / status 的多为网络或运行时错误，允许用户手动重试。
  return true
}

export async function importLoadedStarCapture(handle, batch, isCurrent = function () { return true }) {
  if (!isCurrent()) return false
  // 宿主与 embed 的契约：批次被其他操作顶掉而没有真正写入 Draft 时，
  // importCaptureBatch 必须返回 false（或抛错）。旧版 embed 返回 undefined，
  // 这里按“已受理”处理以保持兼容。
  const accepted = await handle.importCaptureBatch(batch)
  if (accepted === false) {
    const error = new Error('待识别图片已被其他操作替换，本次导入未生效。')
    error.code = STAR_CAPTURE_IMPORT_SUPERSEDED_CODE
    throw error
  }
  if (!isCurrent()) return false
  return true
}

export async function loadAndImportStarCapture(api, current, handle, createFile, isCurrent) {
  if (!isCurrent()) return false
  if (!current.batch) current.batch = await loadStarCaptureBatch(api, current.accountId, current.captureId, createFile)
  if (!isCurrent()) return false
  return importLoadedStarCapture(handle, current.batch, isCurrent)
}
