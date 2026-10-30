import { normalizeDiscNames, discNameOf } from './operatorDiscLoadouts.js'
import { operatorHuajiLabel } from './operatorHuaji.js'
import { subProfList } from './operatorFilters.js'

export const BOX_IMAGE_WIDTH = 1440
export const BOX_IMAGE_PAGE_SIZE = 30

// Only presentation fields cross into the export; private notes and targets stay out.
export function operatorBoxImageEntry(entry, catalog, combat) {
  const terms = new Map((catalog.discs || []).map(disc => [discNameOf(disc), disc]))
  const loadouts = entry.discLoadouts?.length ? entry.discLoadouts : [{ discs: entry.discs || [] }]
  return {
    id: entry.id,
    name: entry.name,
    prof: Array.isArray(entry.prof) ? entry.prof[0] : entry.prof,
    job: subProfList(entry).join('、'),
    avatar: catalog.avatar || '',
    level: entry.level ?? '—',
    elite: entry.elite ?? '—',
    huaji: operatorHuajiLabel(entry).replace(' 星', '★'),
    attack: combat.attackLabel || '—',
    hp: combat.hpLabel || '—',
    loadouts: Array.from({ length: 2 }, (_, index) => normalizeDiscNames(loadouts[index]?.discNames || loadouts[index]?.discs).map(name => {
      const disc = terms.get(name)
      return { name: disc?.abbreviation || name, color: disc?.color || '' }
    })),
  }
}

export function operatorBoxImagePages(entries, full = false) {
  const size = full ? entries.length : BOX_IMAGE_PAGE_SIZE
  const pages = []
  for (let start = 0; start < entries.length; start += size) {
    pages.push({ entries: entries.slice(start, start + size), start: start + 1, end: Math.min(start + size, entries.length) })
  }
  return pages
}

async function waitForAssets(element) {
  const cleanups = []
  let timer
  try {
    const images = Array.from(element.querySelectorAll('img'), img => new Promise((resolve, reject) => {
      const loaded = () => img.naturalWidth > 0 ? resolve() : reject(new Error('立绘加载失败，请重试。'))
      const failed = () => reject(new Error('立绘加载失败，请检查网络后重试。'))
      if (img.complete) return loaded()
      img.addEventListener('load', loaded)
      img.addEventListener('error', failed)
      cleanups.push(() => { img.removeEventListener('load', loaded); img.removeEventListener('error', failed) })
    }))
    await Promise.race([
      Promise.all([document.fonts?.ready, ...images]),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('图片准备超时，请检查网络后重试。')), 20000) }),
    ])
  } finally {
    clearTimeout(timer)
    cleanups.forEach(cleanup => cleanup())
  }
}

export async function renderOperatorBoxImage(element) {
  await waitForAssets(element)
  // Bound canvas memory; browsers that cannot hold the full image can still save 30 per page.
  if (element.scrollHeight > 16384 || element.scrollHeight * BOX_IMAGE_WIDTH > 16000000) {
    throw new Error('完整长图过长，请改用分段图片。')
  }
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, {
    scale: 1, backgroundColor: '#5A4633', useCORS: true,
    windowWidth: BOX_IMAGE_WIDTH, scrollX: 0, scrollY: 0, logging: false,
  })
  try {
    return await new Promise((resolve, reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('图片生成失败，请改用分段图片或重试。'))
    }, 'image/png'))
  } finally {
    canvas.width = canvas.height = 0
  }
}
