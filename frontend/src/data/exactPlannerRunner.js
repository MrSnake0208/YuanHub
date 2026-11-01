// A terminated worker cannot publish a result into a newer input/account. Keep
// this lifecycle independent of Vue so cancellation and stale responses are testable.
export function createExactPlannerRunner(createWorker, receive) {
  let worker = null, generation = 0, timer = null
  function cancel() {
    generation++
    clearTimeout(timer); timer = null
    worker?.terminate(); worker = null
  }
  function run(input, solverUrl, timeLimitMs) {
    cancel()
    const token = generation
    worker = createWorker()
    worker.onmessage = ({ data }) => {
      if (token !== generation) return
      if (data.type !== 'progress') cancel()
      receive(data)
    }
    worker.onerror = () => {
      if (token !== generation) return
      cancel(); receive({ type: 'error', message: '求解器加载或运行失败，请重试' })
    }
    timer = setTimeout(() => {
      if (token !== generation) return
      cancel(); receive({ type: 'error', message: '计算超时，未应用结果。可缩小规划范围后重试。' })
    }, timeLimitMs + 15000)
    worker.postMessage({ input, solverUrl, timeLimitMs })
  }
  return { run, cancel }
}

// Run one scenario at a time to avoid multiple WASM heaps/CPU contenders. Each
// completed result survives cancellation of the remaining queue.
export function createExactComparisonRunner(createWorker, receive) {
  let queue = [], current = null, solverUrl = '', timeLimitMs = 0
  const runner = createExactPlannerRunner(createWorker, data => {
    const id = current?.id
    if (!id) return
    receive({ ...data, id })
    if (data.type !== 'progress') { current = null; next() }
  })
  function next() {
    current = queue.shift() || null
    if (!current) { receive({ type: 'complete' }); return }
    receive({ type: 'start', id: current.id })
    try { runner.run(current.input, solverUrl, timeLimitMs) }
    catch (error) { receive({ type: 'error', id: current.id, message: error.message }); current = null; next() }
  }
  function cancel() { queue = []; current = null; runner.cancel() }
  function run(scenarios, url, limit) {
    cancel(); queue = scenarios.slice(); solverUrl = url; timeLimitMs = limit; next()
  }
  return { run, cancel }
}
