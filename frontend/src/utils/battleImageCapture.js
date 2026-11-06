const WIDTH = 1080
const SCALE = 4 / 3

async function waitForAssets(element) {
  const cleanups = []
  let timer
  try {
    const images = Array.from(element.querySelectorAll('img'), image => new Promise((resolve, reject) => {
      const loaded = () => image.naturalWidth ? resolve() : failed()
      const failed = () => reject(new Error('密探图片加载失败，请检查网络后重试。'))
      if (image.complete) return loaded()
      image.addEventListener('load', loaded)
      image.addEventListener('error', failed)
      cleanups.push(() => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed) })
    }))
    await Promise.race([
      Promise.all([element.ownerDocument.fonts?.ready, ...images]),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('图片准备超时，请检查网络后重试。')), 20000) }),
    ])
  } finally { clearTimeout(timer); cleanups.forEach(cleanup => cleanup()) }
}

export async function renderBattleImage(element) {
  await waitForAssets(element)
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, {
    width: WIDTH, scale: SCALE, windowWidth: WIDTH, scrollX: 0, scrollY: 0,
    backgroundColor: '#fffaf0', useCORS: true, logging: false,
    ignoreElements: node => !element.ownerDocument.head.contains(node) && !node.contains(element) && !element.contains(node),
    onclone: async (document, cloned) => {
      try {
        await waitForAssets(cloned)
        if (Math.ceil(cloned.scrollHeight * SCALE) * WIDTH * SCALE > 16000000) {
          throw Object.assign(new Error('单段内容过长，请减少该回合的动作或备注后重试。'), { code: 'IMAGE_TOO_TALL' })
        }
      } catch (error) {
        document.defaultView.frameElement?.remove()
        throw error
      }
    },
  })
  try {
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败，请重试。')), 'image/png'))
  } finally { canvas.width = canvas.height = 0 }
}
