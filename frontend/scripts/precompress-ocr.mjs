import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { precompress, validateCompression, transferTotals, listFiles } from './ocr-compression.mjs'

if (process.argv.slice(2).some((arg) => arg !== '--verify')) throw new Error('Usage: node scripts/precompress-ocr.mjs [--verify]')
const root = resolve('dist/yuanstar-embed')
const output = resolve('dist/yuanstar-embed-compression.json')
const expectedHashes = JSON.parse(await readFile(resolve('docs/yuanstar-embed-manifest.json'), 'utf8'))
const verifyOnly = process.argv.includes('--verify')
const manifest = verifyOnly ? JSON.parse(await readFile(output, 'utf8')) : await precompress(root, expectedHashes)
await validateCompression(root, manifest, expectedHashes)
if ((await listFiles(resolve('dist'))).some((path) => path.endsWith('.br'))) throw new Error('Unsupported legacy compressed artifacts remain in dist')
if (!verifyOnly) await writeFile(output, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
console.log(`OCR compression ${verifyOnly ? 'verified' : 'generated and verified'}: ${JSON.stringify(transferTotals(manifest))} bytes`)
