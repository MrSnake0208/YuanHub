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
  const log = new File(['log'], 'error.log', { type: 'application/octet-stream' })
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
  assert.match(media.error, /最多添加 10 个附件/)
  media.clear()
})

test('每条消息接受 10 张图片或 10 个混合附件，第 11 个被拒绝且保留队列', async () => {
  for (const mixed of [false, true]) {
    const media = useFeedbackMedia()
    const files = Array.from({ length: 10 }, (_, index) =>
      mixed && index % 2
        ? new File(['log'], `error-${index}.log`, { type: 'text/plain' })
        : new File(['image'], `screen-${index}.png`, { type: 'image/png' })
    )
    await media.addFiles(files.slice(0, 9))
    await media.addFiles(files.slice(9))
    assert.deepEqual(media.items.map(item => item.file), files)
    assert.equal(media.error, '')

    await media.addFiles([new File(['extra'], 'extra.png', { type: 'image/png' })])
    assert.deepEqual(media.items.map(item => item.file), files)
    assert.match(media.error, /最多添加 10 个附件/)
    media.clear()
  }
})

test('LOG 接受浏览器常见 MIME 声明', () => {
  for (const type of ['', 'text/plain', 'text/x-log', 'application/octet-stream']) {
    const media = useFeedbackMedia()
    media.addFiles([new File(['log'], 'maa.log', { type })])
    assert.equal(media.items.length, 1, type || 'empty MIME')
    assert.equal(media.items[0].kind, 'FILE')
    media.clear()
  }
})

test('手机选图补齐缺失或通用 MIME，兼容 image/jpg，保留文件名及图片字节', async () => {
  for (const [name, type, expectedType] of [
    ['截图.PNG', '', 'image/png'],
    ['camera.jpeg', 'application/octet-stream', 'image/jpeg'],
    ['camera.jpg', 'image/jpg', 'image/jpeg'],
    ['screen.webp', '', 'image/webp']
  ]) {
    const media = useFeedbackMedia()
    const input = { files: [new File(['image-bytes'], name, { type, lastModified: 123 })], value: name }
    await media.selectFiles({ target: input })
    assert.equal(input.value, '')
    assert.equal(media.error, '')
    assert.equal(media.items.length, 1, `${name}: ${type}`)
    const file = media.items[0].file
    assert.equal(file.type, expectedType)
    assert.equal(file.name, name)
    assert.equal(file.lastModified, 123)
    assert.equal(await file.text(), 'image-bytes')
    await withFetch(async (_url, options) => {
      assert.equal(options.body.get('file').type, expectedType)
      return apiResponse('med_phone')
    }, async () => assert.deepEqual(await media.uploadAll(), ['med_phone']))
    media.clear()
  }
})

test('图片 MIME 与后缀明确冲突或格式不支持时仍拒绝', async () => {
  for (const [name, type] of [
    ['screen.png', 'image/jpeg'],
    ['screen.png', 'image/jpg'],
    ['script.js', 'image/jpg'],
    ['camera.heic', 'image/heic'],
    ['script.js', 'application/octet-stream']
  ]) {
    const media = useFeedbackMedia()
    await media.addFiles([new File(['invalid'], name, { type })])
    assert.equal(media.items.length, 0)
    assert.match(media.error, /仅支持/)
  }
})

test('图片和普通文件粘贴会入队，纯文本粘贴不拦截', () => {
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
  assert.equal(prevented, 2)
  assert.equal(media.items.length, 2)

  media.handlePaste({
    clipboardData: { items: [{ kind: 'string', type: 'text/plain' }], files: [] },
    preventDefault() { prevented += 1 }
  })
  assert.equal(prevented, 2)
  assert.equal(media.items.length, 2)
  media.clear()
})

test('拖拽图片和文件共用附件校验并按顺序入队', () => {
  const media = useFeedbackMedia()
  let prevented = 0
  media.handleDrop({
    dataTransfer: {
      files: [
        new File(['image'], 'screen.webp', { type: 'image/webp' }),
        new File(['log'], 'maa.log', { type: 'application/octet-stream' })
      ]
    },
    preventDefault() { prevented += 1 }
  })

  assert.equal(prevented, 1)
  assert.deepEqual(media.items.map(item => item.kind), ['IMAGE', 'FILE'])
  assert.deepEqual(media.items.map(item => item.file.name), ['screen.webp', 'maa.log'])
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
