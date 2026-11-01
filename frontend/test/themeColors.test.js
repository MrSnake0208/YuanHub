import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import postcss from 'postcss'

const css = postcss.parse(readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8'))
function declarations(selector) {
  const values = {}
  css.walkRules(selector, rule => rule.walkDecls(d => { values[d.prop] = d.value }))
  return values
}
const dark = declarations(':root[data-theme="dark"]')
const light = declarations('[data-theme="light"]')
function luminance(hex) {
  return hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + .05) / (values[1] + .05)
}
test('dark palette normal and muted text remains readable on main surfaces', () => {
  for (const text of ['ink', 'ink-60', 'ink-35', 'theme-text', 'theme-muted', 'theme-strong-text']) {
    for (const bg of ['paper', 'surface', 'cream', 'yellow', 'theme-surface', 'theme-highlight']) {
      assert.ok(contrast(dark[`--${text}`], dark[`--${bg}`]) >= 4.5, `${text} / ${bg}`)
    }
  }
  for (const family of ['success', 'info', 'purple', 'danger', 'accent']) {
    for (const bg of [dark[`--theme-${family}-bg`], dark['--surface']]) {
      assert.ok(contrast(dark[`--theme-${family}-text`], bg) >= 4.5, family)
    }
  }
  for (const bg of ['tea', 'accent', 'slate', 'theme-control-bg', 'theme-success-control']) {
    assert.ok(contrast(dark['--on-strong'], dark[`--${bg}`]) >= 4.5, `button ${bg}`)
  }
  assert.ok(contrast(dark['--theme-focus'], dark['--surface']) >= 3)
  assert.ok(contrast(dark['--line'], dark['--surface']) >= 3)
})
test('light export scope resets every dark override and retains the original light text and paper', () => {
  for (const key of Object.keys(dark).filter(key => key.startsWith('--'))) {
    assert.ok(Object.hasOwn(light, key), `missing export reset ${key}`)
    if (key.startsWith('--theme-')) assert.equal(light[key], 'initial', key)
  }
  assert.equal(light['--paper'], '#F6EDD0')
  assert.equal(light['--surface'], '#FFFDF6')
  assert.equal(light['--ink'], '#493B2C')
})
test('every theme token used in source has a dark definition and export reset', () => {
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
      if (entry.isDirectory()) walk(url)
      else if (/\.(vue|css|js)$/.test(entry.name)) {
        for (const match of readFileSync(url, 'utf8').matchAll(/var\((--theme-[a-z-]+)/g)) {
          assert.ok(Object.hasOwn(dark, match[1]), `${url.pathname}: ${match[1]}`)
          assert.equal(light[match[1]], 'initial')
        }
      }
    }
  }
  walk(new URL('../src/', import.meta.url))
})
