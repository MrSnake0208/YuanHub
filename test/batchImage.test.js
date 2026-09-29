import { test } from 'node:test'
import assert from 'node:assert/strict'
import { batchImageDirective } from '../src/utils/batchImage.js'

test('heart paper images load at most eight at once and continue after success or failure', () => {
  const images = Array.from({ length: 11 }, () => Object.assign(new EventTarget(), {
    src: '', isConnected: true, hidden: false,
    parentElement: { classList: { add() {} } },
  }))
  images.forEach((image, index) => batchImageDirective.mounted(image, { value: `/agents/${index}.png` }))

  assert.equal(images.filter(image => image.src).length, 8)
  assert.ok(images.every(image => image.hidden))
  images[0].dispatchEvent(new Event('load'))
  images[1].dispatchEvent(new Event('error'))
  assert.equal(images.filter(image => image.src).length, 10)
  batchImageDirective.unmounted(images[2])
  assert.equal(images.filter(image => image.src).length, 11)

  images.forEach(image => batchImageDirective.unmounted(image))
})
