/** Feedback follows the actual operation; uncertain commands are recovered by reading. */
export function starCloudFeedback(state) {
  if (state?.loading) return { message: '正在读取云端星石状态…', error: '' }
  if (state?.error) return { message: '', error: !state.ready
    ? '暂时无法读取云端背包，请重试加载；本机数据没有被覆盖。'
    : Number(state.error.status) === 409 ? '云端数据已更新，本次修改尚未保存，请重新加载核对。'
      : [400,401,403,404,422].includes(Number(state.error.status)) ? '本次保存未完成，请核对账号及数据后重新加载。'
        : '保存结果仍待确认，请重新加载核对，不要重复替换或登记完成。' }
  if (state?.replacing || state?.writer?.saving) return { message: '正在保存星石云端状态…', error: '' }
  if (state?.writer?.error) return { message: '', error: Number(state.writer.error.status) === 409
    ? '云端数据已更新，当前修改尚未同步。请先导出需要保留的内容，再核对云端数据。'
    : '当前修改尚未确认同步，可重试核对保存结果；请保留本机数据。' }
  if (state?.writer?.pending) return { message: '正在等待保存星石云端状态…', error: '' }
  if (state?.ready) return { message: '星石云端状态已保存', error: '' }
  return { message: '', error: '' }
}
