import { registerHooks } from 'node:module'

// Native Node tests opt into the same explicit Vite environment as tutorial development.
const featureUrl = new URL('../src/config/features.js', import.meta.url).href
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context)
    return url === featureUrl
      ? { ...result, source: `import.meta.env = { VITE_TUTORIALS_ENABLED: 'true' };\n${result.source}` }
      : result
  }
})
