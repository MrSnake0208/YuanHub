import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNT_GAMES,
  DEFAULT_ACCOUNT_GAME,
  activeAccount,
  normalizeAccountGame
} from '../src/store/activeAccount.js'

test('子账号游戏版本仅保留代号鸢与如鸢，默认代号鸢', function () {
  assert.deepEqual(ACCOUNT_GAMES, ['代号鸢', '如鸢'])
  assert.equal(DEFAULT_ACCOUNT_GAME, '代号鸢')
  assert.equal(normalizeAccountGame('如鸢'), '如鸢')
  assert.equal(normalizeAccountGame('all'), '代号鸢')
  assert.equal(normalizeAccountGame(''), '代号鸢')
})

test('游戏版本按子账号分别记忆并可清理', function () {
  const first = 'test-account-first'
  const second = 'test-account-second'
  activeAccount.forgetGame(first)
  activeAccount.forgetGame(second)

  assert.equal(activeAccount.gameFor(first), '代号鸢')
  activeAccount.setGame('如鸢', first)
  activeAccount.setGame('代号鸢', second)
  assert.equal(activeAccount.gameFor(first), '如鸢')
  assert.equal(activeAccount.gameFor(second), '代号鸢')

  activeAccount.forgetGame(first)
  activeAccount.forgetGame(second)
  assert.equal(activeAccount.gameFor(first), '代号鸢')
})

test('新版账号响应覆盖本地兜底，旧响应不覆盖', function () {
  const id = 'test-account-server-sync'
  activeAccount.setGame('如鸢', id)
  activeAccount.syncAccounts([{ id: id, name: '旧响应' }])
  assert.equal(activeAccount.gameFor(id), '如鸢')

  activeAccount.syncAccounts([{ id: id, name: '新版响应', game: '代号鸢' }])
  assert.equal(activeAccount.gameFor(id), '代号鸢')
  activeAccount.forgetGame(id)
})
