import { prepareOperatorBoxImage } from './operatorBoxImageCapture.js'
import { normalizeDiscNames, discNameOf } from './operatorDiscLoadouts.js'
import { operatorHuaji, operatorHuajiLabel } from './operatorHuaji.js'
import { operatorAnnotationStatus, operatorAnnotationStatusLabel } from './operatorAnnotations.js'
import { subProfList } from './operatorFilters.js'

export const BOX_IMAGE_WIDTH = 1440
// Fixed export geometry is independent of the overview and the generating device.
export const BOX_IMAGE_LAYOUT_WIDTH = 1080
export const BOX_IMAGE_PAGE_SIZE = 15

const discColorOrder = { 金: 0, gold: 0, 紫: 1, purple: 1, 蓝: 2, blue: 2 }

// Only presentation fields cross into the export; private notes and targets stay out.
export function operatorBoxImageEntry(entry, catalog = {}, combat = {}, status) {
  const terms = new Map((catalog.discs || []).map(disc => [discNameOf(disc), disc]))
  const loadouts = entry.discLoadouts?.length ? entry.discLoadouts : [{ discs: entry.discs || [] }]
  const huaji = operatorHuaji(entry)
  const state = operatorAnnotationStatus(status)
  return {
    rarity: entry.rarity || 3,
    status: state,
    statusLabel: operatorAnnotationStatusLabel(state),
    huajiProgress: {
      stars: huaji.stage > 0 ? Math.floor((huaji.stage - 1) / 6) + 1 : null,
      nodes: huaji.stage > 0 && huaji.stage < 25 && !entry.spOf ? (huaji.stage - 1) % 6 : null,
      awakened: huaji.awakened === true,
    },
    id: entry.id,
    name: entry.name || entry.id,
    prof: Array.isArray(entry.prof) ? entry.prof[0] : entry.prof,
    job: subProfList(entry)[0] || '',
    avatar: catalog.avatar || '',
    level: entry.level ?? '—',
    elite: entry.elite ?? '—',
    huaji: operatorHuajiLabel(entry).replace(' 星', '★'),
    attack: (combat.attackLabel || '—').replaceAll(',', ''),
    hp: (combat.hpLabel || '—').replaceAll(',', ''),
    oddities: Object.fromEntries(['attack', 'hp'].map(kind => {
      const oddity = entry.combatStats?.oddities?.[kind]
      return [kind, { current: oddity?.current ?? '—', max: oddity?.max ?? '—' }]
    })),
    loadouts: Array.from({ length: 2 }, (_, index) => normalizeDiscNames(loadouts[index]?.discNames || loadouts[index]?.discs).map(name => {
      const disc = terms.get(name)
      return { name: disc?.abbreviation || name, color: disc?.color || '' }
    }).sort((a, b) => (discColorOrder[a.color] ?? 3) - (discColorOrder[b.color] ?? 3))),
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
  const document = element.ownerDocument
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
    const fonts = document.fonts
    // Include the exported Chinese text so unicode-range font subsets load before capture.
    const exportFonts = fonts?.load ? Promise.all([
      '600 16px "Noto Serif SC"', '900 16px "Noto Serif SC"',
      '700 16px "Archivo"', '800 16px "Archivo"', '900 16px "Archivo"',
    ].map(font => fonts.load(font, element.textContent || '代号鸢 BOX 0123456789').then(faces => {
      if (!faces.length) throw new Error('字体未注册')
    }))).catch(() => { throw new Error('分享图字体加载失败，请检查网络后重试。') }) : Promise.resolve()
    await Promise.race([
      Promise.all([exportFonts, fonts?.ready, ...images]),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('图片准备超时，请检查网络后重试。')), 20000) }),
    ])
  } finally {
    clearTimeout(timer)
    cleanups.forEach(cleanup => cleanup())
  }
}

export async function renderOperatorBoxImage(element) {
  await waitForAssets(element)
  const { default: html2canvas } = await import('html2canvas')
  const options = {
    width: BOX_IMAGE_LAYOUT_WIDTH, scale: BOX_IMAGE_WIDTH / BOX_IMAGE_LAYOUT_WIDTH,
    backgroundColor: '#f6f0e2', useCORS: true,
    // Prune unrelated app subtrees before html2canvas clones and measures them.
    ignoreElements: node => !element.ownerDocument.head.contains(node)
      && !node.contains(element) && !element.contains(node),
    windowWidth: BOX_IMAGE_WIDTH, scrollX: 0, scrollY: 0, logging: false,
    onclone: async (document, cloned) => {
      try {
        await waitForAssets(cloned)
        const pixelHeight = Math.ceil(cloned.scrollHeight * options.scale)
        if (pixelHeight > 16384 || pixelHeight * BOX_IMAGE_WIDTH > 16000000) {
          throw new Error('完整长图过长，请改用分段图片。')
        }
        await prepareOperatorBoxImage(document, cloned)
      } catch (error) {
        document.defaultView.frameElement?.remove()
        throw error
      }
    },
  }
  const canvas = await html2canvas(element, options)
  try {
    return await new Promise((resolve, reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('图片生成失败，请改用分段图片或重试。'))
    }, 'image/png'))
  } finally {
    canvas.width = canvas.height = 0
  }
}
