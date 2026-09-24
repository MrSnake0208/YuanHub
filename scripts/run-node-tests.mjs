import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const root = process.cwd()
const testRoots = [resolve(root, 'test'), resolve(root, 'promo-site/test')]
const excluded = new Set()
let listOnly = false

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]
  if (arg === '--exclude') {
    const value = process.argv[index + 1]
    if (!value) throw new Error('--exclude requires a path')
    excluded.add(value.replaceAll('\\', '/'))
    index += 1
    continue
  }
  if (arg === '--list') {
    listOnly = true
    continue
  }
  throw new Error(`Unknown argument: ${arg}`)
}

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) return collect(fullPath)
    if (!entry.isFile() || !/\.test\.(?:cjs|mjs|js)$/.test(entry.name)) return []
    return [relative(root, fullPath).replaceAll('\\', '/')]
  })
}

const files = testRoots
  .flatMap(collect)
  .filter((file) => !excluded.has(file))
  .sort()

if (files.length === 0) {
  throw new Error('No repository test files selected')
}

if (listOnly) {
  process.stdout.write(files.join('\n') + '\n')
  process.exit(0)
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
