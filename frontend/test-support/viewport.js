import { vi } from 'vitest'

// jsdom fixture: pixel-width media queries only; geometry remains a browser check.
export function installViewport(width = 1440) {
  const queries = []
  const matches = query => [...query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)]
    .every(([, bound, value]) => bound === 'min' ? width >= Number(value) : width <= Number(value)) && /-width:/.test(query)
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('matchMedia', vi.fn(query => {
    const listeners = new Set()
    const media = { media: query, matches: matches(query),
      addEventListener: vi.fn((type, listener) => { if (type === 'change') listeners.add(listener) }),
      removeEventListener: vi.fn((type, listener) => { if (type === 'change') listeners.delete(listener) }),
    }
    queries.push({ media, listeners })
    return media
  }))
  return {
    queries,
    resize(nextWidth) {
      width = nextWidth
      window.innerWidth = width
      for (const { media, listeners } of queries) {
        const next = matches(media.media)
        if (next === media.matches) continue
        media.matches = next
        for (const listener of listeners) listener({ matches: next, media: media.media })
      }
      window.dispatchEvent(new Event('resize'))
    },
  }
}
