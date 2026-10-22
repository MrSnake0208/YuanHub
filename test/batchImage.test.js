import { test } from 'node:test'
import assert from 'node:assert/strict'
import { batchImageDirective } from '../src/utils/batchImage.js'

test('eager portraits load without viewport observation and keep draining after errors or removal', async () => {
  const previousObserver = globalThis.IntersectionObserver
  let observations = 0
  globalThis.IntersectionObserver = class {
    observe() { observations += 1 }
    unobserve() {}
  }
  const images = Array.from({ length: 12 }, () => Object.assign(new EventTarget(), {
    src: '', isConnected: true, hidden: false,
    parentElement: { classList: { add() { assert.fail('portraits must remain visible') } } },
  }))
  let directive
  try {
    ;({ batchImageDirective: directive } = await import('../src/utils/batchImage.js?eager-test'))
    images.forEach((image, index) => directive.mounted(image, {
      value: `/portraits/${index}.webp`, modifiers: { eager: true },
    }))
    assert.equal(observations, 0)
    assert.equal(images.filter(image => image.src).length, 8)
    assert.ok(images.every(image => !image.hidden && image.loading === 'eager'))
    directive.unmounted(images[8])
    images[0].dispatchEvent(new Event('error'))
    assert.equal(images[8].src, '')
    assert.equal(images[9].src, '/portraits/9.webp')
    images[1].dispatchEvent(new Event('load'))
    assert.equal(images[10].src, '/portraits/10.webp')
    directive.updated(images[11], {
      value: '/portraits/replacement.webp', oldValue: '/portraits/11.webp', modifiers: { eager: true },
    })
    images[2].dispatchEvent(new Event('load'))
    assert.equal(images[11].src, '/portraits/replacement.webp')
  } finally {
    if (directive) images.forEach(image => directive.unmounted(image))
    if (previousObserver === undefined) delete globalThis.IntersectionObserver
    else globalThis.IntersectionObserver = previousObserver
  }
})

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
