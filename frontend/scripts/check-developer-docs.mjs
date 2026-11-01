import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Lexer } from 'marked'
import { developerDocuments, developerFiles } from '../src/data/developerManifest.js'
import { resolveDeveloperLink } from '../src/utils/developerMarkdown.js'

const root = fileURLToPath(new URL('../', import.meta.url))
export async function checkDeveloperDocs({ dist = false } = {}) {
  const assetModule = await readFile(resolve(root, 'src/data/developerAssets.js'), 'utf8')
  const allowlist = JSON.parse(assetModule.match(/import\.meta\.glob\((\[[\s\S]*?\])/)[1])
  assert.deepEqual(allowlist, developerFiles.map(file => '../../docs/' + file), 'Asset allowlist and document registry differ')
  assert.ok(allowlist.every(path => !/[?*{}!]/.test(path) && path.startsWith('../../docs/')), 'Only exact doc paths may be public')
  assert.equal(new Set(developerDocuments.map(doc => doc.id)).size, developerDocuments.length)
  assert.equal(new Set(developerDocuments.map(doc => doc.path)).size, developerDocuments.length)
  const sources = new Map()
  for (const file of developerFiles) {
    assert.ok(/\.(md|json)$/.test(file) && !file.split('/').includes('..'), 'Invalid public source: ' + file)
    const body = await readFile(resolve(root, 'docs', file), 'utf8')
    sources.set(file, body)
    if (file.endsWith('.json')) JSON.parse(body)
  }
  for (const doc of developerDocuments) {
    const tokens = Lexer.lex(sources.get(doc.source))
    const links = []
    function visit(nodes) {
      for (const token of nodes || []) {
        if (token.type === 'link') links.push(token.href)
        visit(token.tokens)
        for (const item of token.items || []) visit(item.tokens)
        for (const row of [token.header || [], ...(token.rows || [])]) for (const cell of row) visit(cell.tokens)
      }
    }
    visit(tokens)
    for (const link of links) assert.ok(resolveDeveloperLink(link, doc.source, file => '/download/' + file), `Unpublished/broken link in ${doc.source}: ${link}`)
  }
  if (dist) {
    const assetsDir = resolve(root, 'dist/assets')
    const published = (await readdir(assetsDir)).filter(file => /\.(md|json)$/.test(file))
    const emittedBodies = new Set()
    for (const file of published) {
      const body = await readFile(resolve(assetsDir, file), 'utf8')
      assert.ok([...sources.values()].includes(body), 'Unexpected public document asset: ' + file)
      emittedBodies.add(body)
    }
    for (const [file, body] of sources) assert.ok(emittedBodies.has(body), 'Missing standalone public asset: ' + file)
    const sw = await readFile(resolve(root, 'dist/sw.js'), 'utf8')
    for (const file of published) assert.ok(!sw.includes(file), 'Document in PWA precache: ' + file)
    const html = await readFile(resolve(root, 'dist/index.html'), 'utf8')
    const entryPaths = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => resolve(root, 'dist', match[1].replace(/^\//, '')))
    const visited = new Set()
    while (entryPaths.length) {
      const path = entryPaths.pop()
      if (visited.has(path)) continue
      visited.add(path)
      const body = await readFile(path, 'utf8')
      for (const file of published) assert.ok(!body.includes(file), 'Document eagerly included in initial JS: ' + file)
      for (const match of body.matchAll(/(?:from|import)\s*["'](\.\/[^"']+\.js)["']/g)) entryPaths.push(resolve(dirname(path), match[1]))
    }
    console.log(`Verified ${published.length} standalone document assets; no unexpected assets, initial-JS document URLs or PWA precache entries`)
  }
  return { documents: developerDocuments.length, files: sources.size }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--dist')) throw new Error('Usage: node scripts/check-developer-docs.mjs [--dist]')
  const result = await checkDeveloperDocs({ dist: process.argv.includes('--dist') })
  console.log(`Developer docs OK: ${result.documents} pages, ${result.files} explicitly public sources`)
}
