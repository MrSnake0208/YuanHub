const cleanToken = value => {
  try {
    const token = decodeURIComponent(String(value || '')).trim()
    return token && !/[\s/?#]/.test(token) ? token : ''
  } catch { return '' }
}

/** Explicit link type wins; a raw code uses the entry page's type. */
export function parseShareLink(input, fallbackView = 'operator') {
  const value = String(input || '').trim()
  if (!value) return null
  try {
    const url = new URL(value, 'https://yuanhub.invalid')
    const match = url.pathname.match(/^\/(operator|star)\/share\/([^/]+)\/?$/)
    if (match) {
      if (!['http:', 'https:'].includes(url.protocol)) return null
      const token = cleanToken(match[2])
      // Accept the earlier operator-route query convention without dropping its view.
      const view = url.searchParams.get('view') === 'star' ? 'star' : match[1]
      return token ? { token, view } : null
    }
  } catch { return null }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || /[\s/?#]/.test(value)) return null
  const token = cleanToken(value)
  return token ? { token, view: fallbackView === 'star' ? 'star' : 'operator' } : null
}

export const shareRoute = ({ token, view }) => ({ name: view === 'star' ? 'star-share' : 'operator-share', params: { token } })
export const sharePath = (token, view = 'operator') => '/' + (view === 'star' ? 'star' : 'operator') + '/share/' + encodeURIComponent(token)
