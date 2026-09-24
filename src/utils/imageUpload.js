export const IMAGE_UPLOAD_PROFILES = Object.freeze({
  FEEDBACK: Object.freeze({
    maxDimension: 2560,
    optimizeAboveBytes: 800 * 1024,
    targetBytes: 3 * 1024 * 1024,
    hardLimitBytes: 10 * 1024 * 1024,
    maxSourceBytes: 25 * 1024 * 1024,
    maxSourcePixels: 40 * 1000 * 1000,
    maxSourceDimension: 12000,
    quality: 0.84,
    minQuality: 0.68,
    qualityStep: 0.06,
    pngFallbackQuality: 0.9,
    minDimension: 1600,
    maxResizePasses: 2,
    allowOriginal: true
  }),
  CHANGELOG: Object.freeze({
    maxDimension: 2560,
    optimizeAboveBytes: 800 * 1024,
    targetBytes: 3 * 1024 * 1024,
    hardLimitBytes: 10 * 1024 * 1024,
    maxSourceBytes: 25 * 1024 * 1024,
    maxSourcePixels: 40 * 1000 * 1000,
    maxSourceDimension: 12000,
    quality: 0.84,
    minQuality: 0.68,
    qualityStep: 0.06,
    pngFallbackQuality: 0.9,
    minDimension: 1600,
    maxResizePasses: 2,
    allowOriginal: true
  }),
  AVATAR: Object.freeze({
    maxDimension: 1024,
    optimizeAboveBytes: 0,
    targetBytes: 420 * 1024,
    hardLimitBytes: 500 * 1024,
    maxSourceBytes: 25 * 1024 * 1024,
    maxSourcePixels: 40 * 1000 * 1000,
    maxSourceDimension: 12000,
    outputType: 'image/webp',
    requireOutputType: true,
    quality: 0.84,
    minQuality: 0.62,
    qualityStep: 0.06,
    minDimension: 512,
    maxResizePasses: 3,
    allowOriginal: false
  })
})

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

let sharedPica = null
let sharedReducer = null
let sharedReducerPromise = null

export class ImageUploadError extends Error {
  constructor(message, code = 'image_processing_failed') {
    super(message)
    this.name = 'ImageUploadError'
    this.code = code
  }
}

function normalizedType(file) {
  return String(file?.type || '').toLowerCase().split(';', 1)[0].trim()
}

async function ensureReducer() {
  if (sharedReducer) return sharedReducer
  if (!sharedReducerPromise) {
    sharedReducerPromise = Promise.all([
      import('image-blob-reduce'),
      import('pica')
    ]).then(function ([reduceModule, picaModule]) {
      sharedPica = picaModule.default()
      sharedReducer = reduceModule.default({ pica: sharedPica })
      return sharedReducer
    }).catch(function (error) {
      sharedReducerPromise = null
      throw error
    })
  }
  return sharedReducerPromise
}

function imageUrlApi() {
  if (typeof URL === 'undefined') return null
  if (typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') return null
  return URL
}

async function readImageDimensions(file) {
  if (typeof Image !== 'function') return null
  const api = imageUrlApi()
  if (!api) return null

  const url = api.createObjectURL(file)
  try {
    return await new Promise(function (resolve, reject) {
      const image = new Image()
      function releaseImage() {
        image.onload = null
        image.onerror = null
        image.src = ''
      }
      image.onload = function () {
        const width = Number(image.naturalWidth || image.width || 0)
        const height = Number(image.naturalHeight || image.height || 0)
        if (!width || !height) {
          releaseImage()
          reject(new ImageUploadError('无法读取图片尺寸，请更换图片后重试', 'invalid_dimensions'))
          return
        }
        releaseImage()
        resolve({ width, height })
      }
      image.onerror = function () {
        releaseImage()
        reject(new ImageUploadError('图片无法读取或文件已损坏', 'decode_failed'))
      }
      image.src = url
    })
  } finally {
    api.revokeObjectURL(url)
  }
}

function validateSource(file, profile, dimensions) {
  if (!file || typeof file.size !== 'number') {
    throw new ImageUploadError('没有可处理的图片文件', 'missing_file')
  }

  const type = normalizedType(file)
  if (!ACCEPTED_IMAGE_TYPES.has(type)) {
    throw new ImageUploadError('仅支持 JPG、PNG、WebP 图片', 'unsupported_type')
  }

  if (file.size > profile.maxSourceBytes) {
    throw new ImageUploadError('图片原文件不能超过 25 MiB', 'source_too_large')
  }

  if (!dimensions) return

  const { width, height } = dimensions
  if (width > profile.maxSourceDimension || height > profile.maxSourceDimension) {
    throw new ImageUploadError('图片分辨率过高，宽或高不能超过 12000 像素', 'dimensions_too_large')
  }

  if (width * height > profile.maxSourcePixels) {
    throw new ImageUploadError('图片像素总量过高，请选择 4000 万像素以内的图片', 'pixels_too_large')
  }
}

function shouldProcess(file, profile, dimensions) {
  if (!profile.allowOriginal) return true
  if (profile.outputType && normalizedType(file) !== profile.outputType) return true
  if (file.size > profile.optimizeAboveBytes) return true
  if (!dimensions) return file.size > profile.hardLimitBytes
  return Math.max(dimensions.width, dimensions.height) > profile.maxDimension
}

function createOutputName(name, type) {
  const extension = EXTENSION_BY_TYPE[type] || 'img'
  const rawName = String(name || 'image')
  const baseName = rawName.replace(/\.[^.]+$/, '') || 'image'
  return `${baseName}.${extension}`
}

function blobToFile(blob, sourceFile) {
  if (typeof File !== 'function') return blob
  return new File(
    [blob],
    createOutputName(sourceFile?.name, blob.type),
    {
      type: blob.type,
      lastModified: sourceFile?.lastModified || Date.now()
    }
  )
}

function resetCanvas(canvas) {
  if (!canvas) return
  try {
    canvas.width = 0
    canvas.height = 0
  } catch (_) {
    // Some canvas implementations may expose read-only dimensions.
  }
}

async function encodeWithQuality(canvas, mimeType, profile, startingQuality) {
  const reducer = await ensureReducer()
  const resizer = reducer.pica
  let quality = startingQuality
  let blob = await resizer.toBlob(canvas, mimeType, quality)

  while (blob.size > profile.targetBytes && quality > profile.minQuality) {
    quality = Math.max(profile.minQuality, Number((quality - profile.qualityStep).toFixed(2)))
    blob = await resizer.toBlob(canvas, mimeType, quality)
  }

  return { blob, quality }
}

async function encodeCanvas(canvas, sourceType, profile) {
  const requestedType = profile.outputType || sourceType

  if (requestedType === 'image/png' && !profile.outputType) {
    const reducer = await ensureReducer()
    const pngBlob = await reducer.pica.toBlob(canvas, 'image/png')
    if (pngBlob.size <= profile.targetBytes) {
      return { blob: pngBlob, quality: null }
    }

    return encodeWithQuality(
      canvas,
      'image/webp',
      profile,
      Math.max(profile.quality, profile.pngFallbackQuality || profile.quality)
    )
  }

  return encodeWithQuality(canvas, requestedType, profile, profile.quality)
}

async function renderAndEncode(file, profile, maxDimension) {
  const reducer = await ensureReducer()
  const canvas = await reducer.toCanvas(file, { max: maxDimension })

  try {
    const encoded = await encodeCanvas(canvas, normalizedType(file), profile)
    return {
      ...encoded,
      width: Number(canvas.width || 0),
      height: Number(canvas.height || 0)
    }
  } finally {
    resetCanvas(canvas)
  }
}

function nextDimension(current, profile, blobSize) {
  const ratio = Math.sqrt(profile.hardLimitBytes / Math.max(blobSize, 1))
  const adaptive = Math.floor(current * Math.min(0.86, Math.max(0.68, ratio * 0.92)))
  return Math.max(profile.minDimension, adaptive)
}

function assertOutputType(blob, profile) {
  if (!profile.requireOutputType || !profile.outputType) return
  if (blob.type === profile.outputType) return
  throw new ImageUploadError('当前浏览器无法生成 WebP 图片，请更换浏览器后重试', 'output_type_unsupported')
}

export async function prepareImageUpload(file, profile = IMAGE_UPLOAD_PROFILES.FEEDBACK) {
  // Reject obviously unsafe inputs before asking the browser to decode them.
  validateSource(file, profile, null)
  const dimensions = await readImageDimensions(file)
  validateSource(file, profile, dimensions)

  if (!shouldProcess(file, profile, dimensions)) {
    return {
      file,
      changed: false,
      originalBytes: file.size,
      outputBytes: file.size,
      originalWidth: dimensions?.width || null,
      originalHeight: dimensions?.height || null,
      outputWidth: dimensions?.width || null,
      outputHeight: dimensions?.height || null
    }
  }

  let maxDimension = profile.maxDimension
  let encoded = null

  for (let pass = 0; pass < profile.maxResizePasses; pass += 1) {
    encoded = await renderAndEncode(file, profile, maxDimension)
    assertOutputType(encoded.blob, profile)

    if (encoded.blob.size <= profile.hardLimitBytes) break
    if (maxDimension <= profile.minDimension) break
    maxDimension = nextDimension(maxDimension, profile, encoded.blob.size)
  }

  if (!encoded || encoded.blob.size > profile.hardLimitBytes) {
    const limitMiB = Math.round(profile.hardLimitBytes / 1024 / 1024 * 10) / 10
    throw new ImageUploadError(
      `图片优化后仍超过 ${limitMiB} MiB，请换一张分辨率更低的图片`,
      'output_too_large'
    )
  }

  const resizedByDimensions = Boolean(
    dimensions &&
    (encoded.width < dimensions.width || encoded.height < dimensions.height)
  )

  if (
    profile.allowOriginal &&
    !resizedByDimensions &&
    normalizedType(file) === encoded.blob.type &&
    file.size <= profile.hardLimitBytes &&
    encoded.blob.size >= file.size
  ) {
    return {
      file,
      changed: false,
      originalBytes: file.size,
      outputBytes: file.size,
      originalWidth: dimensions?.width || null,
      originalHeight: dimensions?.height || null,
      outputWidth: dimensions?.width || null,
      outputHeight: dimensions?.height || null
    }
  }

  const outputFile = blobToFile(encoded.blob, file)

  return {
    file: outputFile,
    changed: true,
    originalBytes: file.size,
    outputBytes: encoded.blob.size,
    originalWidth: dimensions?.width || null,
    originalHeight: dimensions?.height || null,
    outputWidth: encoded.width || null,
    outputHeight: encoded.height || null
  }
}
