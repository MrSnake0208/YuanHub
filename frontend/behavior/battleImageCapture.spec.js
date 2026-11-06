import { beforeEach, expect, it, vi } from 'vitest'
import html2canvas from 'html2canvas'
import { renderBattleImage } from '../src/utils/battleImageCapture.js'
vi.mock('html2canvas', () => ({ default: vi.fn() }))
const canvas = () => ({ width: 1440, height: 1000, toBlob: fn => fn(new Blob(['png'])) })
const element = () => {
  const root = document.createElement('section')
  document.body.append(root)
  return root
}
beforeEach(() => { vi.clearAllMocks() })

it('uses fixed PNG geometry, rejects oversized images before canvas allocation', async () => {
  const root = element(), result = canvas()
  html2canvas.mockImplementation(async (element, options) => { await options.onclone(document, element); return result })
  await renderBattleImage(root)
  const options = html2canvas.mock.calls[0][1]
  expect(options.width * options.scale).toBe(1440)
  expect(result.width).toBe(0)
  Object.defineProperty(root, 'scrollHeight', { value: 10000 })
  await expect(renderBattleImage(root)).rejects.toMatchObject({ code: 'IMAGE_TOO_TALL' })
})

it('rejects a failed portrait rather than silently exporting an incomplete image', async () => {
  const root = element(), image = document.createElement('img')
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 0 } })
  root.append(image)
  await expect(renderBattleImage(root)).rejects.toThrow('密探图片加载失败')
  expect(html2canvas).not.toHaveBeenCalled()
})

it('times out stalled images and releases listeners', async () => {
  vi.useFakeTimers()
  const root = element(), image = document.createElement('img')
  Object.defineProperty(image, 'complete', { value: false })
  root.append(image)
  const remove = vi.spyOn(image, 'removeEventListener')
  const check = expect(renderBattleImage(root)).rejects.toThrow('图片准备超时')
  await vi.advanceTimersByTimeAsync(20000)
  await check
  expect(remove).toHaveBeenCalledWith('load', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('error', expect.any(Function))
})

it('releases canvas memory when encoding fails', async () => {
  const result = { ...canvas(), toBlob: fn => fn(null) }
  html2canvas.mockResolvedValue(result)
  await expect(renderBattleImage(element())).rejects.toThrow('图片生成失败')
  expect(result.width).toBe(0)
  expect(result.height).toBe(0)
})
