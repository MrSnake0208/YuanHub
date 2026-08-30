import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_FEEDBACK_MEDIA_COUNT, useFeedbackMedia } from '../src/utils/feedbackMedia.js'

function apiResponse(id) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    async json() {
      return { status_code: 200, message: 'ok', data: { id } }
    }
  }
}

async function withFetch(handler, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  try {
    return await fn()
  } finally {
    globalThis.fetch = previous
  }
}

test('附件队列接受混合类型并对非法批次保持原子性', () => {
  const media = useFeedbackMedia()
  const image = new File(['png'], 'screen.png', { type: 'image/png' })
  const log = new File(['log'], 'error.log', { type: '' })
  media.addFiles([image, log])

  assert.deepEqual(media.items.map(item => item.kind), ['IMAGE', 'FILE'])
  assert.ok(media.items[0].previewUrl)
  assert.equal(media.items[1].previewUrl, '')

  media.addFiles([new File(['bad'], 'script.js', { type: 'text/javascript' })])
  assert.equal(media.items.length, 2)
  assert.match(media.error, /仅支持/)

  media.addFiles([new File(['fake'], 'script.js', { type: 'image/png' })])
  assert.equal(media.items.length, 2)
  assert.match(media.error, /仅支持/)

  media.addFiles(Array.from({ length: MAX_FEEDBACK_MEDIA_COUNT }, (_, index) =>
    new File(['x'], `extra-${index}.txt`, { type: 'text/plain' })
  ))
  assert.equal(media.items.length, 2)
  assert.match(media.error, /最多添加 3 个附件/)
  media.clear()
})

test('图片粘贴会入队并阻止默认行为，普通文件和文本粘贴不拦截', () => {
  const media = useFeedbackMedia()
  let prevented = 0
  const image = new File(['png'], '', { type: 'image/png' })
  media.handlePaste({
    clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }], files: [] },
    preventDefault() { prevented += 1 }
  })
  assert.equal(prevented, 1)
  assert.equal(media.items.length, 1)
  assert.equal(media.items[0].file.name, 'pasted-image.png')

  const log = new File(['log'], 'paste.log', { type: 'text/plain' })
  media.handlePaste({
    clipboardData: { items: [{ kind: 'file', type: 'text/plain', getAsFile: () => log }], files: [log] },
    preventDefault() { prevented += 1 }
  })
  assert.equal(prevented, 1)
  assert.equal(media.items.length, 1)
  media.clear()
})

test('上传保持队列顺序并缓存已完成的媒体 ID', async () => {
  const media = useFeedbackMedia()
  media.addFiles([
    new File(['one'], 'one.txt', { type: 'text/plain' }),
    new File(['two'], 'two.json', { type: 'application/json' })
  ])
  const uploadedNames = []
  let call = 0
  await withFetch(async (_url, options) => {
    const file = options.body.get('file')
    uploadedNames.push(file.name)
    call += 1
    if (call === 2) throw new Error('network failed')
    return apiResponse(`med_${call}`)
  }, async () => {
    await assert.rejects(media.uploadAll(), /network failed/)
  })

  await withFetch(async (_url, options) => {
    const file = options.body.get('file')
    uploadedNames.push(file.name)
    return apiResponse('med_2')
  }, async () => {
    assert.deepEqual(await media.uploadAll(), ['med_1', 'med_2'])
  })
  assert.deepEqual(uploadedNames, ['one.txt', 'two.json', 'two.json'])
  media.clear()
})

test('clear 只释放图片预览 URL', () => {
  const previousCreate = URL.createObjectURL
  const previousRevoke = URL.revokeObjectURL
  const revoked = []
  URL.createObjectURL = () => 'blob:image-preview'
  URL.revokeObjectURL = value => revoked.push(value)
  try {
    const media = useFeedbackMedia()
    media.addFiles([
      new File(['image'], 'screen.webp', { type: 'image/webp' }),
      new File(['file'], 'note.txt', { type: 'text/plain' })
    ])
    media.clear()
    assert.deepEqual(revoked, ['blob:image-preview'])
  } finally {
    URL.createObjectURL = previousCreate
    URL.revokeObjectURL = previousRevoke
  }
})
