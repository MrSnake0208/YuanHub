// 媒体上传接口封装
import { request } from './request.js'

// 上传反馈附件（截图或普通文件）
export function uploadMedia(file) {
  const formData = new FormData()
  formData.append('file', file)
  return request('/v1/media/upload', {
    method: 'POST',
    auth: true,
    multipart: true,
    body: formData
  })
}
