import { beforeEach, expect, it, vi } from 'vitest'
import { IMAGE_UPLOAD_PROFILES, prepareImageUpload } from '../src/utils/imageUpload.js'
import { useFeedbackMedia } from '../src/utils/feedbackMedia.js'
import { uploadMedia } from '../src/api/media.js'

const encoder = vi.hoisted(() => ({ toCanvas: vi.fn(), toBlob: vi.fn() }))
vi.mock('image-blob-reduce', () => ({ default: () => ({ toCanvas: encoder.toCanvas, pica: { toBlob: encoder.toBlob } }) }))
vi.mock('pica', () => ({ default: () => ({}) }))
vi.mock('../src/api/media.js', () => ({ uploadMedia: vi.fn() }))

const KiB = 1024
const MiB = 1024 * KiB
let dimensions

function imageFile(size, type = 'image/png') {
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type]
  return new File([new Uint8Array(size)], `screenshot.${extension}`, { type })
}

// 模拟编码器只验证选择、尺寸和上传分支，不代替真实图片的视觉验收。
function encodedBlob(size, type) {
  return new Blob([new Uint8Array(size)], { type })
}

beforeEach(() => {
  dimensions = { width: 1080, height: 10000 }
  encoder.toCanvas.mockReset().mockImplementation(async (_file, { max }) => {
    const ratio = Math.min(1, max / Math.max(dimensions.width, dimensions.height))
    return { width: Math.round(dimensions.width * ratio), height: Math.round(dimensions.height * ratio) }
  })
  encoder.toBlob.mockReset().mockImplementation(async (_canvas, type) => encodedBlob(400 * KiB, type))
  uploadMedia.mockReset().mockResolvedValue({ id: 'med_compressed' })
  vi.stubGlobal('Image', class {
    naturalWidth = dimensions.width
    naturalHeight = dimensions.height
    set src(value) { if (value) queueMicrotask(() => this.onload?.()) }
  })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:synthetic'), revokeObjectURL: vi.fn() })
})

it('长截图优先转 WebP，保留原始像素尺寸、比例和文件扩展名', async () => {
  const result = await prepareImageUpload(imageFile(8 * MiB))
  expect(encoder.toBlob.mock.calls[0].slice(1)).toEqual(['image/webp', 0.84])
  expect(result).toMatchObject({ changed: true, originalBytes: 8 * MiB, outputBytes: 400 * KiB, outputWidth: 1080, outputHeight: 10000 })
  expect(result.file.type).toBe('image/webp')
  expect(result.file.name).toBe('screenshot.webp')
  expect(result.file.size).toBe(400 * KiB)
})

it('达到质量下限后接受 3 MiB 以内的结果，不为目标体积继续缩小或降质', async () => {
  encoder.toBlob.mockImplementation(async (_canvas, type) => encodedBlob(2 * MiB, type))
  const result = await prepareImageUpload(imageFile(8 * MiB))
  expect(encoder.toBlob.mock.calls.map(call => call[2])).toEqual([0.84, 0.81, 0.78])
  expect(encoder.toCanvas).toHaveBeenCalledTimes(1)
  expect(result).toMatchObject({ outputBytes: 2 * MiB, outputWidth: 1080, outputHeight: 10000 })
})

it('8 MiB 压缩结果拒绝入队，提示拆图且不会上传原图', async () => {
  encoder.toBlob.mockImplementation(async (_canvas, type) => encodedBlob(8 * MiB, type))
  const media = useFeedbackMedia()
  await media.addFiles([imageFile(12 * MiB)])
  expect(media.items).toHaveLength(0)
  expect(media.error).toMatch(/超过 3 MiB.*分成多张截图/)
  expect(media.optimizing).toBe(false)
  await media.uploadAll()
  expect(uploadMedia).not.toHaveBeenCalled()
})

it('压缩结果恰好 3 MiB 可上传，多一个字节即拒绝', async () => {
  encoder.toBlob.mockImplementation(async (_canvas, type) => encodedBlob(3 * MiB, type))
  expect((await prepareImageUpload(imageFile(8 * MiB))).file.size).toBe(3 * MiB)
  encoder.toBlob.mockImplementation(async (_canvas, type) => encodedBlob(3 * MiB + 1, type))
  await expect(prepareImageUpload(imageFile(8 * MiB))).rejects.toMatchObject({ code: 'output_too_large' })
})

it('WebP 编码更大时保留 3 MiB 以内的较小原图，包括编码结果超限的情况', async () => {
  for (const outputSize of [2 * MiB, 4 * MiB]) {
    encoder.toBlob.mockImplementation(async (_canvas, type) => encodedBlob(outputSize, type))
    const original = imageFile(MiB, 'image/jpeg')
    const result = await prepareImageUpload(original)
    expect(result.file).toBe(original)
    expect(result).toMatchObject({ changed: false, outputBytes: MiB })
  }
})

it('小图直接保留，大图上传使用编码结果', async () => {
  const small = imageFile(128 * KiB)
  expect((await prepareImageUpload(small)).file).toBe(small)
  expect(encoder.toCanvas).not.toHaveBeenCalled()
  const media = useFeedbackMedia()
  await media.addFiles([imageFile(8 * MiB)])
  const prepared = media.items[0].file
  expect(prepared.type).toBe('image/webp')
  expect(prepared.size).toBe(400 * KiB)
  expect(await media.uploadAll()).toEqual(['med_compressed'])
  expect(uploadMedia).toHaveBeenCalledWith(prepared, true)
  media.clear()
})

it('保留原文件大小与像素上限，不把超大源图交给编码器', async () => {
  await expect(prepareImageUpload(imageFile(26 * MiB))).rejects.toMatchObject({ code: 'source_too_large' })
  dimensions = { width: 8000, height: 6000 }
  await expect(prepareImageUpload(imageFile(MiB))).rejects.toMatchObject({ code: 'pixels_too_large' })
  expect(encoder.toCanvas).not.toHaveBeenCalled()
})

it('公告仍按 2560 像素缩图并保留 PNG，头像仍强制生成 WebP', async () => {
  const changelog = await prepareImageUpload(imageFile(8 * MiB), IMAGE_UPLOAD_PROFILES.CHANGELOG)
  expect(changelog.outputHeight).toBe(2560)
  expect(changelog.file.type).toBe('image/png')
  encoder.toBlob.mockImplementation(async () => encodedBlob(300 * KiB, 'image/png'))
  await expect(prepareImageUpload(imageFile(MiB), IMAGE_UPLOAD_PROFILES.AVATAR))
    .rejects.toMatchObject({ code: 'output_type_unsupported' })
})
