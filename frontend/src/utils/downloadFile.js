export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  try { link.click() } finally {
    link.remove()
    // Safari 等浏览器需要先读取 Blob，不能在触发下载后立即释放。
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}

export function downloadJson(value, filename, { pretty = true } = {}) {
  downloadBlob(new Blob([JSON.stringify(value, null, pretty ? 2 : undefined)], { type: 'application/json' }), filename)
}
