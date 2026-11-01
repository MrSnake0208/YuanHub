import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'

// Source contracts must follow the styles actually referenced by the component.
export function readSource(file) {
  const filename = file instanceof URL ? fileURLToPath(file) : file
  const source = readFileSync(filename, 'utf8')
  if (filename.endsWith('.vue')) {
    const { descriptor } = parse(source)
    return source + descriptor.styles.filter(style => style.src)
      .map(style => '\n' + readFileSync(resolve(dirname(filename), style.src), 'utf8')).join('')
  }
  if (filename.endsWith('.css')) {
    return source + ['Desktop', 'Mobile'].map(end => filename.replace(/\.css$/, end + '.css'))
      .filter(target => existsSync(target)).map(target => '\n' + readFileSync(target, 'utf8')).join('')
  }
  return source
}
