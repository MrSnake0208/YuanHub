import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

// Only this reviewed schema crosses repositories; never copy a docs directory.
const root = fileURLToPath(new URL('../', import.meta.url))
const source = resolve(root, '../BackEndV3-Share/docs/schema/recruitment-exchange-v1.schema.json')
const target = resolve(root, 'docs/developers/schemas/recruitment-exchange-v1.schema.json')
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--write')) throw new Error('Usage: node scripts/sync-developer-schema.mjs [--write]')
const expected = await readFile(source, 'utf8')
JSON.parse(expected)
if (args.includes('--write')) {
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, expected)
  console.log('Updated recruitment V1 public schema snapshot')
} else {
  if (await readFile(target, 'utf8') !== expected) throw new Error('Recruitment schema snapshot differs; run with --write')
  console.log('Recruitment V1 schema snapshot matches authoritative backend source')
}
