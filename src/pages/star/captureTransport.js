function remoteField(value, snake, camel) {
  return value && (value[snake] ?? value[camel])
}

const sections = ['main', 'support', 'experience']

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
  if (!sourceImageId || !Number.isInteger(sourceOrder) || sourceOrder < 1 || !fileName) throw new Error('星石截图 manifest 图片字段无效。')
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
  if (!remoteSections || typeof remoteSections !== 'object' || Array.isArray(remoteSections) || Object.keys(remoteSections).length !== sections.length || sections.some(function (section) { return !remoteSections[section] })) throw new Error('星石截图批次缺少完整三段采集。')
  const normalized = {}
  const allImages = []
  for (const sectionName of sections) {
    const section = remoteSections[sectionName]
    const images = Array.isArray(section && section.images) ? section.images.map(imageFromManifest) : []
    const adjacentRelations = Array.isArray(section && (section.adjacent_relations ?? section.adjacentRelations)) ? (section.adjacent_relations ?? section.adjacentRelations).map(relationFromManifest) : []
    const complete = section && section.complete === true
    const stopReason = String(remoteField(section, 'stop_reason', 'stopReason') || '')
    const expectedStopReason = sectionName === 'experience' ? 'single_capture' : 'bottom_no_move'
    if (!complete || stopReason !== expectedStopReason || (sectionName === 'experience' ? images.length !== 1 || adjacentRelations.length !== 0 : images.length === 0)) throw new Error('星石截图分段不满足完整采集契约。')
    normalized[sectionName] = { images, adjacentRelations, complete, stopReason }
    allImages.push(...images)
  }
  allImages.sort(function (left, right) { return left.sourceOrder - right.sourceOrder })
  if (new Set(allImages.map(function (image) { return image.sourceImageId })).size !== allImages.length || allImages.some(function (image, index) { return image.sourceOrder !== index + 1 })) throw new Error('星石截图全局顺序无效。')
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
  throw new Error('星石截图批次缺少完整三段采集。')
}

export async function importLoadedStarCapture(api, accountId, captureId, handle, batch, isCurrent = function () { return true }) {
  if (!isCurrent()) return false
  handle.importCaptureBatch(batch)
  if (!isCurrent()) return false
  await api.consume(accountId, captureId)
  return true
}

export async function loadAndImportStarCapture(api, current, handle, createFile, isCurrent) {
  if (!isCurrent()) return false
  if (!current.batch) current.batch = await loadStarCaptureBatch(api, current.accountId, current.captureId, createFile)
  if (!isCurrent()) return false
  return importLoadedStarCapture(api, current.accountId, current.captureId, handle, current.batch, isCurrent)
}
