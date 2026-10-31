import { afterEach, expect, it, vi } from 'vitest'
import { prepareOperatorBoxImage } from '../src/utils/operatorBoxImageCapture.js'

afterEach(() => vi.restoreAllMocks())

it('uses measured glyph positions for vertical names, including a supplementary Unicode character', async () => {
  const root = document.createElement('section')
  root.innerHTML = '<div class="ledger-name-tab"><h3>徐𠮷</h3></div>'
  const name = root.querySelector('h3')
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ writingMode: 'vertical-rl', content: 'none', getPropertyValue: () => '' })
  vi.spyOn(name, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 10, width: 26, height: 70 })
  const starts = []
  vi.spyOn(document, 'createRange').mockImplementation(() => ({
    setStart: (_, start) => starts.push(start), setEnd: vi.fn(),
    getBoundingClientRect: () => ({ left: 51, top: 10 + (starts.length - 1) * 35, width: 24, height: 32 }),
  }))
  await prepareOperatorBoxImage(document, root)
  expect(starts).toEqual([0, 1])
  expect(name.textContent).toBe('徐𠮷')
  expect([...name.children].map(glyph => [glyph.style.left, glyph.style.top])).toEqual([['1px', '0px'], ['1px', '35px']])
  expect(name.style.height).toBe('70px')
})

it.each([true, false])('uses the desktop portrait gradient even if a mobile overlay exists: %s', async existing => {
  const root = document.createElement('section')
  root.innerHTML = `<picture class="ledger-portrait ___html2canvas___pseudoelement_after">${existing ? '<html2canvaspseudoelement style="height:10px"></html2canvaspseudoelement>' : ''}</picture>`
  const portrait = root.firstElementChild
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
    if (node === portrait && pseudo === '::after' && !portrait.classList.contains('___html2canvas___pseudoelement_after')) {
      return { 0: 'position', 1: 'height', length: 2, getPropertyValue: key => key === 'position' ? 'absolute' : '258px' }
    }
    return { content: 'none', getPropertyValue: () => '' }
  })
  await prepareOperatorBoxImage(document, root)
  const overlay = portrait.firstElementChild
  expect(overlay.style.position).toBe('absolute')
  expect(overlay.style.height).toBe('258px')
  expect(portrait.classList.contains('___html2canvas___pseudoelement_after')).toBe(true)
})

it('does not scan stat and fate nodes or allocate compatibility canvases', async () => {
  const root = document.createElement('section')
  root.innerHTML = Array.from({ length: 1000 }, () => '<span class="disc-term">真实词条</span>').join('')
  const readStyle = vi.spyOn(window, 'getComputedStyle')
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
  await prepareOperatorBoxImage(document, root)
  expect(readStyle).not.toHaveBeenCalled()
  expect(canvas).not.toHaveBeenCalled()
  expect(root.children).toHaveLength(1000)
  expect(root.firstChild.textContent).toBe('真实词条')
})
