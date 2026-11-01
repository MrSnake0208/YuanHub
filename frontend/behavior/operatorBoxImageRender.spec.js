import { beforeEach, expect, it, vi } from 'vitest'
import html2canvas from 'html2canvas'
import { prepareOperatorBoxImage } from '../src/utils/operatorBoxImageCapture.js'
import { BOX_IMAGE_LAYOUT_WIDTH, renderOperatorBoxImage } from '../src/utils/operatorBoxImage.js'

vi.mock('../src/utils/operatorBoxImageCapture.js', () => ({ prepareOperatorBoxImage: vi.fn() }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))
beforeEach(() => { html2canvas.mockReset() })
const element = () => document.createElement('section')
const canvas = () => ({ width: 1440, height: 2500, toBlob: fn => fn(new Blob(['png'], { type: 'image/png' })) })

it('waits for portraits before capture, creates PNG and releases canvas memory', async () => {
  const root = element(), image = document.createElement('img'), result = canvas()
  Object.defineProperty(image, 'complete', { value: false })
  Object.defineProperty(image, 'naturalWidth', { value: 480 })
  root.append(image)
  html2canvas.mockResolvedValue(result)
  const output = renderOperatorBoxImage(root)
  await Promise.resolve()
  expect(html2canvas).not.toHaveBeenCalled()
  image.dispatchEvent(new Event('load'))
  expect((await output).type).toBe('image/png')
  const options = html2canvas.mock.calls[0][1]
  expect(options).toMatchObject({ width: BOX_IMAGE_LAYOUT_WIDTH, scale: 1440 / BOX_IMAGE_LAYOUT_WIDTH, windowWidth: 1440, useCORS: true })
  expect(Math.floor(options.width * options.scale)).toBe(1440)
  expect(result.width).toBe(0)
  expect(result.height).toBe(0)
})

it('broken portraits fail visibly rather than silently exporting blank artwork', async () => {
  const root = element(), image = document.createElement('img')
  root.append(image)
  await expect(renderOperatorBoxImage(root)).rejects.toThrow('立绘加载失败')
  expect(html2canvas).not.toHaveBeenCalled()
})

it.each([218.5, 210.8, 0])('keeps fixed export dimensions regardless of overview card width %s', async cardWidth => {
  const root = element()
  document.body.innerHTML = '<div class="current-ledger"><article class="agent-ledger-card--editable"></article></div>'
  vi.spyOn(document.querySelector('article'), 'getBoundingClientRect').mockReturnValue({ width: cardWidth })
  html2canvas.mockImplementation(async (element, options) => { await options.onclone(document, element); return canvas() })
  await renderOperatorBoxImage(root)
  const options = html2canvas.mock.calls[0][1]
  expect(options.width).toBe(1080)
  expect(Math.floor(options.width * options.scale)).toBe(1440)
  expect(options.windowWidth).toBe(1440)
})

it('oversized full images apply pixel limits after scaling, before allocating a canvas', async () => {
  const root = element()
  // Fits the old 1x area guard, but exceeds 16 million pixels at the PNG scale.
  Object.defineProperty(root, 'scrollHeight', { value: 9000 })
  html2canvas.mockImplementation(async (element, options) => { await options.onclone(document, element); return canvas() })
  await expect(renderOperatorBoxImage(root)).rejects.toThrow('改用分段图片')
  expect(prepareOperatorBoxImage).not.toHaveBeenCalled()
})

it('stalled portraits time out with a retry message', async () => {
  vi.useFakeTimers()
  try {
    const root = element(), image = document.createElement('img')
    Object.defineProperty(image, 'complete', { value: false })
    root.append(image)
    const output = expect(renderOperatorBoxImage(root)).rejects.toThrow('图片准备超时')
    await vi.advanceTimersByTimeAsync(20000)
    await output
    expect(html2canvas).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})

it('PNG encoding failure still releases the canvas', async () => {
  const result = { ...canvas(), toBlob: fn => fn(null) }
  html2canvas.mockResolvedValue(result)
  await expect(renderOperatorBoxImage(element())).rejects.toThrow('图片生成失败')
  expect(result.width).toBe(0)
})

it('prunes unrelated page branches while retaining export ancestors, descendants and head assets', async () => {
  document.body.innerHTML = '<main id="app"><img src="/unrelated.webp"></main><div class="staging"><section><article>卡片</article></section><aside>无关预览</aside></div>'
  const style = document.createElement('style'), link = document.createElement('link')
  style.textContent = '.staging { color: #352b20 }'
  link.rel = 'stylesheet'
  document.head.append(style, link)
  try {
    const root = document.querySelector('.staging section')
    html2canvas.mockResolvedValue(canvas())
    await renderOperatorBoxImage(root)
    const { ignoreElements } = html2canvas.mock.calls[0][1]
    for (const node of [document.documentElement, document.head, document.body, style, link, root.parentElement, root, root.firstElementChild]) {
      expect(ignoreElements(node)).toBe(false)
    }
    for (const node of document.querySelectorAll('#app, #app img, aside')) expect(ignoreElements(node)).toBe(true)
    expect(document.querySelector('#app img').getAttribute('src')).toBe('/unrelated.webp')
  } finally {
    style.remove(); link.remove(); document.body.replaceChildren()
  }
})

it('waits for all export font weights before capturing', async () => {
  const original = Object.getOwnPropertyDescriptor(document, 'fonts')
  let finish
  const loaded = new Promise(resolve => { finish = resolve })
  const load = vi.fn(() => loaded)
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load, ready: Promise.resolve() } })
  try {
    html2canvas.mockResolvedValue(canvas())
    const root = element()
    root.textContent = "孙权 士燮 47,908"
    const output = renderOperatorBoxImage(root)
    await Promise.resolve()
    expect(load.mock.calls.map(([font]) => font)).toEqual([
      '600 16px "Noto Serif SC"', '900 16px "Noto Serif SC"',
      '700 16px "Archivo"', '800 16px "Archivo"', '900 16px "Archivo"',
    ])
    expect(html2canvas).not.toHaveBeenCalled()
    expect(load.mock.calls.every(([, text]) => text === root.textContent)).toBe(true)
    finish([{}])
    await output
    expect(html2canvas).toHaveBeenCalledOnce()
  } finally {
    if (original) Object.defineProperty(document, 'fonts', original)
    else delete document.fonts
  }
})

it.each(['missing', 'failed'])('does not export fallback text when the export font is %s', async state => {
  const original = Object.getOwnPropertyDescriptor(document, 'fonts')
  const load = state === 'missing' ? vi.fn().mockResolvedValue([]) : vi.fn().mockRejectedValue(new Error('network'))
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load, ready: Promise.resolve() } })
  try {
    await expect(renderOperatorBoxImage(element())).rejects.toThrow('分享图字体加载失败')
    expect(html2canvas).not.toHaveBeenCalled()
  } finally {
    if (original) Object.defineProperty(document, 'fonts', original)
    else delete document.fonts
  }
})

it('waits for the clone fonts before measuring and preparing glyphs', async () => {
  const cloneDocument = document.implementation.createHTMLDocument('export')
  const cloned = cloneDocument.createElement('section')
  cloned.textContent = '士燮'
  let finish
  const loaded = new Promise(resolve => { finish = resolve })
  const load = vi.fn(() => loaded)
  Object.defineProperty(cloneDocument, 'fonts', { value: { load, ready: Promise.resolve() } })
  prepareOperatorBoxImage.mockClear()
  html2canvas.mockResolvedValue(canvas())
  await renderOperatorBoxImage(element())
  const pending = html2canvas.mock.calls[0][1].onclone(cloneDocument, cloned)
  expect(load).toHaveBeenCalledWith('900 16px "Noto Serif SC"', '士燮')
  expect(prepareOperatorBoxImage).not.toHaveBeenCalled()
  finish([{}])
  await pending
  expect(prepareOperatorBoxImage).toHaveBeenCalledWith(cloneDocument, cloned)
})
