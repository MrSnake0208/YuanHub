import { readCalendarImportFile } from './activityCalendarImport.js'

export const CLASSIFICATION_MAX_BYTES = 20 * 1024 * 1024
export const CLASSIFICATION_MAX_ITEMS = 10000
export const readClassificationFile = file => readCalendarImportFile(file, CLASSIFICATION_MAX_BYTES)
export function checkClassificationText(text) {
  if (new TextEncoder().encode(text).length > CLASSIFICATION_MAX_BYTES) throw new Error('分类文件最多 20 MiB。')
  let value
  try { value = JSON.parse(text) } catch { throw new Error('JSON 格式错误，请检查后重试。') }
  if (value?.document_type !== 'activity-calendar-classification' || value.schema_version !== 1) throw new Error('请选择“导出全部”生成的分类文件；新增型 JSON 请使用批量导入。')
  if (!Array.isArray(value.items) || !Array.isArray(value.reference_items) || value.items.length + value.reference_items.length > CLASSIFICATION_MAX_ITEMS) throw new Error('分类文件须包含 items 和 reference_items 数组，总计最多 10000 条。')
  return text
}
export function downloadClassification(value) {
  let text = JSON.stringify(value, null, 2)
  if (new TextEncoder().encode(text).length > CLASSIFICATION_MAX_BYTES) text = JSON.stringify(value)
  checkClassificationText(text)
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = 'activity-calendar-classification-' + new Date().toISOString().slice(0, 10) + '.json'
  document.body.appendChild(link)
  try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0) }
}
