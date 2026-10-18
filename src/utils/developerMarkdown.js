import { Lexer } from 'marked'
import { developerDocuments, developerFiles, developerPageLinks } from '../data/developerManifest.js'

export function headingSlug(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section'
}

export function markdownText(tokens) {
  return tokens.map(token => token.tokens ? markdownText(token.tokens) : token.text || '').join('')
}

export function parseDeveloperMarkdown(markdown) {
  const tokens = Lexer.lex(markdown, { gfm: true })
  const headings = []
  const used = new Map()
  for (const token of tokens) {
    if (token.type !== 'heading') continue
    const title = markdownText(token.tokens)
    const slug = headingSlug(title)
    const count = used.get(slug) || 0
    used.set(slug, count + 1)
    token.id = `doc-${slug}${count ? '-' + count : ''}`
    if (token.depth >= 2 && token.depth <= 3) headings.push({ id: token.id, title, depth: token.depth })
  }
  // The shared page header already provides the document's h1.
  if (tokens[0]?.type === 'heading' && tokens[0].depth === 1) tokens[0].coverTitle = true
  return { tokens, headings }
}

function anchorHash(hash) {
  if (!hash) return ''
  try {
    const value = decodeURIComponent(hash.slice(1))
    return '#' + encodeURIComponent(value.startsWith('doc-') ? value : 'doc-' + headingSlug(value))
  } catch {
    return ''
  }
}

export function resolveDeveloperLink(href, source, assetUrl) {
  const value = String(href || '').replace(/&amp;/g, '&').trim()
  if (!value || /[\u0000-\u001f\u007f\\]/u.test(value) || value.startsWith('//')) return null
  if (value.startsWith('#')) return { href: anchorHash(value), internal: true }
  let url
  try { url = new URL(value, `https://docs.invalid/${source}`) } catch { return null }
  if (/^https?:\/\//i.test(value)) {
    return { href: url.href, external: true }
  }
  if (url.origin !== 'https://docs.invalid' || url.search) return null
  let path
  try { path = decodeURIComponent(url.pathname) } catch { return null }
  const doc = developerDocuments.find(entry => '/' + entry.source === path || entry.path === path)
  if (doc) return { href: doc.path + anchorHash(url.hash), internal: true }
  if (developerPageLinks.includes(path)) return { href: path + url.hash, internal: true }
  const file = path.slice(1)
  if (developerFiles.includes(file)) return { href: assetUrl(file), download: file.split('/').pop() }
  return null
}
