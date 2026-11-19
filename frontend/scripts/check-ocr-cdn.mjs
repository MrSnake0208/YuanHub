import { redirects } from './ocr-model-cdn.mjs'

for (const [path, target] of redirects) {
  const url = new URL(path, process.env.SITE_URL)
  url.searchParams.set('deploy', crypto.randomUUID())
  const response = await fetch(url, {
    method: 'HEAD', redirect: 'manual', cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  if (response.status !== 302 || response.headers.get('location') !== target) {
    throw new Error(`OCR redirect for ${path}: got ${response.status} ${response.headers.get('location') ?? ''}, expected 302 to ${target}. Load the candidate's nginx/ocr-model-cdn.conf before activation.`)
  }
}
