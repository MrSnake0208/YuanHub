export function createLatestAccountSync() {
  let latest = 0
  let tail = Promise.resolve()

  return function sync(task) {
    const generation = ++latest
    const isLatest = () => generation === latest
    const running = tail.catch(() => undefined).then(async () => {
      if (!isLatest()) return false
      const completed = await task(isLatest)
      return completed !== false && isLatest()
    })
    tail = running
    return running
  }
}
