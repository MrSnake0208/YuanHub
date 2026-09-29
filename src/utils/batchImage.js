const MAX_ACTIVE_IMAGES = 8
const queue = []
const states = new WeakMap()
const observed = new WeakMap()
let active = 0
const observer = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        const state = observed.get(entry.target)
        observed.delete(entry.target)
        if (state && !state.done) queue.push(state)
      }
      pump()
    }, { rootMargin: '300px 0px' })
  : null

function pump() {
  while (active < MAX_ACTIVE_IMAGES && queue.length) {
    const state = queue.shift()
    if (state.done || !state.image.isConnected) continue
    state.active = true
    active += 1
    state.image.src = state.url
  }
}

function release(state) {
  if (state.done) return
  state.done = true
  if (state.active) active -= 1
  pump()
}

export const batchImageDirective = {
  mounted(image, binding) {
    if (!binding.value) return
    image.hidden = true
    image.parentElement?.classList.add('has-icon-error')
    const state = { image, url: binding.value, active: false, done: false }
    state.release = () => release(state)
    states.set(image, state)
    image.addEventListener('load', state.release)
    image.addEventListener('error', state.release)
    if (observer && image.parentElement) {
      observed.set(image.parentElement, state)
      observer.observe(image.parentElement)
    } else {
      queue.push(state)
      pump()
    }
  },
  updated(image, binding) {
    if (binding.value === binding.oldValue) return
    batchImageDirective.unmounted(image)
    batchImageDirective.mounted(image, binding)
  },
  unmounted(image) {
    const state = states.get(image)
    if (!state) return
    states.delete(image)
    if (observer && image.parentElement) {
      observer.unobserve(image.parentElement)
      observed.delete(image.parentElement)
    }
    image.removeEventListener('load', state.release)
    image.removeEventListener('error', state.release)
    release(state)
  },
}
