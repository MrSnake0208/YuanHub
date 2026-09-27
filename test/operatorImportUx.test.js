import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/operator/index.vue', import.meta.url), 'utf8')

test('v2 先预览影响并二次确认，只有提交函数写入', () => {
  assert.match(page, /@click="previewV2Import"/)
  assert.match(page, /v-if="importV2Preview"/)
  assert.match(page, /v2PreviewKey\(doc\) !== importV2PreviewKey\.value/)
  assert.match(page, /const confirmed = await dialog\.confirm\(/)
  assert.match(page, /const res = await importOperator\(summary\.document\)/)
})

test('密探页两个失败态可重试，桌面和手机页签名称一致', () => {
  assert.match(page, /云端养成同步失败：[\s\S]*?重试同步/)
  assert.match(page, /v-else-if="error" class="state err"[\s\S]*?重试加载/)
  assert.equal((page.match(/养成总览/g) || []).length >= 2, true)
  assert.doesNotMatch(page, /<span>当前养成<\/span>/)
})
