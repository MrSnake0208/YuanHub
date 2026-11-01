import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative, extname } from 'node:path'
import { parse, compileScript, compileTemplate, compileStyle, babelParse } from '@vue/compiler-sfc'

// Syntax/compilation gate, not a claim of TypeScript typechecking or visual QA.
function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else if (entry.isFile() && ['.vue', '.js', '.mjs'].includes(extname(path))) yield path
  }
}
let checked = 0, failed = 0
const roots = ['src', 'test', 'test-support', 'behavior', 'scripts', 'promo-site/src']
for (const root of roots) {
  try { readdirSync(root) } catch (error) { if (error.code === 'ENOENT' && root.startsWith('promo-site')) continue; throw error }
  for (const filename of files(root)) {
    checked += 1
    try {
      const source = readFileSync(filename, 'utf8')
      if (filename.endsWith('.vue')) {
        const { descriptor, errors } = parse(source, { filename })
        if (errors.length) throw new Error(errors.join('\n'))
        const script = descriptor.script || descriptor.scriptSetup ? compileScript(descriptor, { id: 'local-static' }) : null
        if (descriptor.template) {
          const compiled = compileTemplate({ source: descriptor.template.content, filename, id: 'local-static', compilerOptions: { bindingMetadata: script?.bindings } })
          if (compiled.errors.length) throw new Error(compiled.errors.join('\n'))
        }
        for (const style of descriptor.styles) {
          const compiled = compileStyle({ source: style.content, filename, id: 'local-static', scoped: style.scoped })
          if (compiled.errors.length) throw new Error(compiled.errors.join('\n'))
        }
      } else babelParse(source, { sourceType: 'unambiguous', plugins: ['importAttributes'] })
    } catch (error) { failed += 1; console.error(`${relative(process.cwd(), filename)}: ${error.message}`) }
  }
}
console.log(`Source compilation: ${checked} checked, ${failed} failed`)
process.exitCode = failed ? 1 : 0
