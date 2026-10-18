export const CALENDAR_IMPORT_MAX_BYTES = 1024 * 1024
export const CALENDAR_IMPORT_MAX_ITEMS = 200

export function checkCalendarImportText(text) {
  if (new TextEncoder().encode(text).byteLength > CALENDAR_IMPORT_MAX_BYTES) throw new Error('JSON 原文最多 1 MiB，请拆分后导入。')
  let parsed
  try { parsed = JSON.parse(text) } catch { throw new Error('JSON 格式错误，请检查括号、引号和逗号，再校验。') }
  if (!Array.isArray(parsed) && (!parsed || typeof parsed !== 'object' || parsed.schema_version !== 1)) throw new Error('只支持 schema_version=1 的 items 对象或顶层数组。')
  const items = Array.isArray(parsed) ? parsed : parsed.items
  if (!Array.isArray(items) || items.length < 1 || items.length > CALENDAR_IMPORT_MAX_ITEMS) throw new Error('每批需要 1–200 条活动。')
  return text
}

export async function readCalendarImportFile(file, maxBytes = CALENDAR_IMPORT_MAX_BYTES) {
  if (!file || !/\.json$/i.test(file.name)) throw new Error('请选择 .json 文件。')
  if (file.size > maxBytes) throw new Error(`文件最多 ${maxBytes / 1024 / 1024} MiB，请缩小文件后重试。`)
  let buffer
  try { buffer = await file.arrayBuffer() } catch { throw new Error('文件读取失败，请重新选择或直接粘贴 JSON。') }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer) }
  catch { throw new Error('文件编码不正确，请另存为 UTF-8 JSON 后重试。') }
}
