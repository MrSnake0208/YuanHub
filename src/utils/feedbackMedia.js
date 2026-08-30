import { onBeforeUnmount, reactive, ref } from 'vue'
import { uploadMedia } from '@/api/media.js'

export const FEEDBACK_MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp'
export const MAX_FEEDBACK_MEDIA_COUNT = 3
export const MAX_FEEDBACK_MEDIA_SIZE = 10 * 1024 * 1024

const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function revokePreview(item) {
  if (!item?.previewUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  URL.revokeObjectURL(item.previewUrl)
}

function createPreview(file) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return ''
  return URL.createObjectURL(file)
}

function isImageType(type) {
  return String(type || '').toLowerCase().startsWith('image/')
}

function normalizeClipboardFile(file, type) {
  if (!file) return null
  const mime = String(file.type || type || '').toLowerCase()
  if (!isImageType(mime)) return null
  if (file.type || typeof File !== 'function') return file

  return new File([file], file.name || 'pasted-image', {
    type: mime,
    lastModified: file.lastModified || Date.now()
  })
}

function getClipboardImageFile(item) {
  if (item?.kind !== 'file' || typeof item.getAsFile !== 'function') return null
  try {
    return normalizeClipboardFile(item.getAsFile(), item.type)
  } catch (_) {
    return null
  }
}

export function useFeedbackMedia() {
  const items = ref([])
  const error = ref('')
  const uploading = ref(false)

  function addFiles(files) {
    const nextFiles = Array.from(files || [])
    if (!nextFiles.length) return

    error.value = ''
    if (items.value.length + nextFiles.length > MAX_FEEDBACK_MEDIA_COUNT) {
      error.value = `最多添加 ${MAX_FEEDBACK_MEDIA_COUNT} 张截图`
      return
    }
    for (const file of nextFiles) {
      const mime = String(file.type || '').toLowerCase()
      if (!ACCEPTED_MIME_TYPES.has(mime)) {
        error.value = '仅支持 JPEG、PNG 或 WebP 图片'
        return
      }
      if (file.size > MAX_FEEDBACK_MEDIA_SIZE) {
        error.value = '单张图片不能超过 10 MiB'
        return
      }
    }

    items.value = items.value.concat(nextFiles.map(file => ({
      file,
      previewUrl: createPreview(file),
      mediaId: null
    })))
  }

  function selectFiles(event) {
    const input = event?.target
    const files = Array.from(input?.files || [])
    if (input) input.value = ''
    addFiles(files)
  }

  function handlePaste(event) {
    if (uploading.value) return

    const clipboardData = event?.clipboardData
    const clipboardItems = Array.from(clipboardData?.items || [])
    const imageFiles = clipboardItems
      .map(getClipboardImageFile)
      .filter(Boolean)

    const fallbackType = clipboardItems.find(item => item?.kind === 'file' && isImageType(item.type))?.type
    const files = imageFiles.length
      ? imageFiles
      : Array.from(clipboardData?.files || [])
        .map(file => normalizeClipboardFile(file, fallbackType))
        .filter(Boolean)
    if (!files.length) return

    event.preventDefault()
    addFiles(files)
  }

  function remove(index) {
    const item = items.value[index]
    if (!item) return
    revokePreview(item)
    items.value.splice(index, 1)
    error.value = ''
  }

  function clear() {
    items.value.forEach(revokePreview)
    items.value = []
    error.value = ''
  }

  async function uploadAll() {
    uploading.value = true
    try {
      const mediaIds = []
      for (const item of items.value) {
        if (!item.mediaId) {
          const uploaded = await uploadMedia(item.file)
          if (!uploaded?.id) throw new Error('上传响应无效')
          item.mediaId = uploaded.id
        }
        mediaIds.push(item.mediaId)
      }
      return mediaIds
    } finally {
      uploading.value = false
    }
  }

  onBeforeUnmount(clear)

  return reactive({
    items,
    error,
    uploading,
    addFiles,
    selectFiles,
    handlePaste,
    remove,
    clear,
    uploadAll
  })
}
