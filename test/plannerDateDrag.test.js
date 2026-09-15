import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlannerDateDrag } from '../src/data/plannerDateDrag.js'

function fixture() {
  const captures = new Set()
  const changes = []
  const element = { scrollLeft: 100, setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) }
  const drag = createPlannerDateDrag(value => changes.push(value))
  const event = overrides => ({ pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 100, clientY: 20,
    currentTarget: element, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true }, ...overrides })
  return { drag, event, element, captures, changes }
}

test('鼠标水平拖动滚动日期而非选中，松开后拦截误点击', () => {
  const { drag, event, element, captures, changes } = fixture()
  drag.down(event())
  drag.move(event({ clientX: 60 }))
  assert.equal(element.scrollLeft, 140)
  assert.ok(captures.has(1))
  drag.finish(event())
  assert.equal(captures.size, 0)
  assert.deepEqual(changes, [true, false])
  const click = event({ detail: 1 })
  drag.click(click)
  assert.ok(click.prevented && click.stopped)
})

test('轻点和键盘激活不被拖动拦截，新的点击可正常选择', () => {
  const { drag, event, element } = fixture()
  drag.down(event())
  drag.move(event({ clientX: 103 }))
  drag.finish(event())
  const click = event({ detail: 1 })
  drag.click(click)
  assert.equal(click.prevented, undefined)
  assert.equal(element.scrollLeft, 100)
  drag.down(event())
  drag.move(event({ clientX: 70 }))
  drag.finish(event())
  const keyboard = event({ detail: 0 })
  drag.click(keyboard)
  assert.equal(keyboard.prevented, undefined)
  drag.down(event())
  drag.finish(event())
  const nextClick = event({ detail: 1 })
  drag.click(nextClick)
  assert.equal(nextClick.prevented, undefined)
})

test('触屏保留原生惯性和页面滚动；非主指针、右键不会抢占拖动', () => {
  const { drag, event, element, captures } = fixture()
  for (const overrides of [{ pointerType: 'touch' }, { isPrimary: false }, { button: 2 }]) {
    drag.down(event(overrides))
    const move = event({ ...overrides, clientX: 20 })
    drag.move(move)
    assert.equal(element.scrollLeft, 100)
    assert.equal(move.prevented, undefined)
    assert.equal(captures.size, 0)
  }
})

test('取消和卸载释放捕获；其他指针不能中断已有拖动', () => {
  const { drag, event, element, captures } = fixture()
  drag.down(event())
  drag.move(event({ clientX: 70 }))
  drag.finish(event({ pointerId: 2 }))
  assert.ok(captures.has(1))
  drag.move(event({ pointerId: 2, clientX: 20 }))
  assert.equal(element.scrollLeft, 130)
  drag.dispose()
  assert.equal(captures.size, 0)
})

test('日期仅在被遮挡时最小滚动，左右切换使用同一视口参照且不强制居中', async () => {
  const { plannerDateRevealOffset: reveal } = await import('../src/data/plannerDateDrag.js')
  const viewport = { left: 300, right: 800 }
  assert.equal(reveal(viewport, { left: 420, right: 500 }, 100, 1000), 100)
  assert.equal(reveal(viewport, { left: 780, right: 860 }, 100, 1000), 164)
  assert.equal(reveal(viewport, { left: 280, right: 360 }, 100, 1000), 76)
  assert.equal(reveal(viewport, { left: 300, right: 380 }, 0, 1000), 0)
  assert.equal(reveal(viewport, { left: 750, right: 830 }, 990, 1000), 1000)
})
