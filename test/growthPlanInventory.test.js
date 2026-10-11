import test from 'node:test'
import assert from 'node:assert/strict'
import { readGrowthPlanInventory, createGrowthPlanInventoryWriter, growthPlanInventorySession } from '../src/pages/star/growthPlanInventory.js'
test('reads stable bottle IDs from current account items only', async () => {
  let request
  const result = await readGrowthPlanInventory('a', async args => { request=args; return [{account_id:'a',entity_type:'item',entries:{jiezhuping:{count:5},jiezheping:{count:9}}}] },()=>true)
  assert.deepEqual(request,{accountId:'a',entityType:'item'})
  assert.deepEqual(result,{jiezhuping:5,jiezheping:9,jieyangping:0})
})
test('listed bottle save retains explicit zero and leaves unrelated stock outside the document',async()=>{
  let document, reads=0
  const writer=createGrowthPlanInventoryWriter({
    getCurrent:async()=>{reads++;return {account_id:'a',entity_type:'item',full_baseline_at:'2026-10-08T00:00:00Z',entries:{jiezheping:{count:reads===1?5:0,listed_baseline_at:'2026-10-09T00:00:00Z'},baijinbi:{count:999}}}},
    importInventory:async doc=>{document=doc;return {accepted:1}},isCurrent:owner=>owner==='a',createId:()=> 'fixed',now:()=>0,
  })
  const saved=await writer.save('a','jiezheping',0)
  assert.equal(saved.jiezheping,0);assert.equal(writer.hasPending(),false)
  const record=document.records[0]
  assert.equal(record.snapshot_scope,'listed');assert.equal(record.account_id,'a')
  assert.deepEqual(record.entries,[{id:'jiezheping',count:0,name:'解谪瓶'}])
  assert.equal(record.effective_at,'2026-10-09T00:00:00.001Z')
})
test('unconfirmed writes retry the same record and block another edit',async()=>{
  const documents=[];let attempts=0
  const writer=createGrowthPlanInventoryWriter({getCurrent:async()=>({entries:{jiezhuping:{count:attempts>=2?4:0}}}),isCurrent:()=>true,createId:()=> 'retry-fixed',
    importInventory:async doc=>{documents.push(JSON.stringify(doc));if(++attempts===1) throw new TypeError('network lost');return {duplicates:1}}})
  await assert.rejects(writer.save('a','jiezhuping',4));assert.equal(writer.hasPending(),true)
  await assert.rejects(writer.save('a','jieyangping',8),/原样重试/)
  await writer.save('a','jiezhuping',4)
  assert.equal(documents[0],documents[1]);assert.equal(writer.hasPending(),false)
})
test('a late account switch before posting never writes to the new account',async()=>{
  let current=true, writes=0
  const writer=createGrowthPlanInventoryWriter({getCurrent:async()=>{current=false;return []},isCurrent:()=>current,importInventory:async()=>{writes++;return {accepted:1}}})
  await assert.rejects(writer.save('a','jiezhuping',4),/账号已切换/)
  assert.equal(writes,0)
})
test('an acknowledged save with a failed refresh retries only the read',async()=>{
  let reads=0,writes=0
  const writer=createGrowthPlanInventoryWriter({isCurrent:()=>true,getCurrent:async()=>{if(++reads===2) throw new TypeError('refresh lost');return {entries:{jiezhuping:{count:reads>2?4:0}}}},importInventory:async()=>{writes++;return {accepted:1}},createId:()=> 'confirmed'})
  await assert.rejects(writer.save('a','jiezhuping',4));assert.equal(writer.hasPending(),true)
  await writer.save('a','jiezhuping',4)
  assert.equal(writes,1);assert.equal(writer.hasPending(),false)
})

for (const [id,name] of [['jiezhuping','解注瓶'],['jiezheping','解谪瓶'],['jieyangping','解殃瓶']]) {
  test(`${name} readback must match the target; conflict retry only reads`,async()=>{
    let current=3,writes=0
    const unrelated={baijinbi:{count:999},agent_paper:{count:21}}
    const entries={...unrelated,[id]:{count:current}}
    const writer=createGrowthPlanInventoryWriter({isCurrent:()=>true,
      getCurrent:async()=>({account_id:'a',entity_type:'item',entries:{...entries,[id]:{count:current}}}),
      importInventory:async document=>{writes++;assert.deepEqual(document.records[0].entries,[{id,count:8,name}]);return {accepted:1}},createId:()=> 'conflict-'+id})
    await assert.rejects(writer.save('a',id,8),/库存与保存目标不一致.*尝试保存：8，当前读取：3/)
    assert.equal(writer.hasPending(),true)
    await assert.rejects(writer.save('a',id,9),/原样重试/)
    await assert.rejects(writer.save('a',id,8),/不一致/)
    assert.equal(writes,1)
    current=8
    const saved=await writer.save('a',id,8)
    assert.equal(saved[id],8);assert.equal(writes,1);assert.equal(writer.hasPending(),false)
    assert.deepEqual(entries,{...unrelated,[id]:{count:3}})
  })
}
test('single bottle rejected save clears writer pending and keeps other stock untouched',async()=>{
  const entries={jiezhuping:{count:3},jiezheping:{count:6},jieyangping:{count:9},baijinbi:{count:999}}
  const before=JSON.stringify(entries)
  const writer=createGrowthPlanInventoryWriter({isCurrent:()=>true,getCurrent:async()=>({entries}),
    importInventory:async()=>{throw Object.assign(new Error('单项保存失败'),{status:422})}})
  await assert.rejects(writer.save('a','jiezheping',8),/单项保存失败/)
  assert.equal(writer.hasPending(),false);assert.equal(JSON.stringify(entries),before)
})
test('unavailable account stays unknown and performs no request', async () => {
  const result=await readGrowthPlanInventory('',()=>{throw new Error('unexpected request')},()=>false)
  assert.deepEqual(result,{jiezhuping:null,jiezheping:null,jieyangping:null})
})
test('successful empty item snapshot has zero stock, matching inventory tracking', async () => {
  assert.deepEqual(await readGrowthPlanInventory('a',async()=>[],()=>true),{jiezhuping:0,jiezheping:0,jieyangping:0})
})
test('rejects cross-account, malformed and late responses', async () => {
  for (const response of [{account_id:'b',entries:{}},{entity_type:'agent',entries:{}},{entries:{jiezheping:{count:-1}}},{entries:{jiezheping:{count:'3'}}},[{}],null])
    await assert.rejects(readGrowthPlanInventory('a',async()=>response,()=>true))
  let current=true
  await assert.rejects(readGrowthPlanInventory('a',async()=>{current=false;return {entries:{}}},()=>current),/账号已切换/)
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function conflictFixture({ id = 'jiezheping', response = { accepted: 1 } } = {}) {
  let count = 3, baseline = null, failure = null, owner = 'a', version = 0, reads = 0
  const documents = []
  const state = { pending: null, busy: false }
  const options = {
    state, isCurrent: account => account === owner && version === 0,
    now: () => Date.parse('2026-10-08T01:00:00Z'), createId: () => 'fixture-' + documents.length,
    getCurrent: async args => {
      reads++; assert.deepEqual(args, { accountId: 'a', entityType: 'item' })
      if (failure) throw failure
      return [{ account_id: 'a', entity_type: 'item', entries: { [id]: { count, listed_baseline_at: baseline }, baijinbi: { count: 999 } } }]
    },
    importInventory: async doc => { documents.push(JSON.stringify(doc)); baseline = doc.records[0].effective_at; return response },
  }
  const writer = createGrowthPlanInventoryWriter(options)
  return { writer, documents, state, options, get reads() { return reads },
    setCount: value => { count = value }, setBaseline: value => { baseline = value },
    setFailure: error => { failure = error }, switch: () => { owner = 'b'; version++ } }
}
for (const id of ['jiezhuping', 'jiezheping', 'jieyangping']) {
  test(`${id}: explicit acceptance GETs latest stock, unlocks and gives a new edit a new ID`, async () => {
    const f = conflictFixture({ id })
    await assert.rejects(f.writer.save('a', id, 10), error => {
      assert.deepEqual(error.inventoryPending, { accountId: 'a', id, count: 10, phase: 'conflict', currentCount: 3, canAccept: true }); return true
    })
    await assert.rejects(f.writer.read('a'), /不一致/)
    assert.equal(f.documents.length, 1)
    f.setCount(8)
    const accepted = await f.writer.acceptCurrent('a', id, 10)
    assert.equal(accepted[id], 8); assert.equal(f.writer.hasPending(), false); assert.equal(f.documents.length, 1)
    f.setCount(0)
    const saved = await f.writer.save('a', id, 0)
    assert.equal(saved[id], 0); assert.equal(f.documents.length, 2)
    assert.notEqual(JSON.parse(f.documents[0]).records[0].record_id, JSON.parse(f.documents[1]).records[0].record_id)
    assert.equal(JSON.parse(f.documents[1]).records[0].entries.length, 1)
  })
}
test('conflict reread can settle naturally without another import', async () => {
  const f = conflictFixture()
  await assert.rejects(f.writer.save('a', 'jiezheping', 10))
  f.setCount(10)
  assert.equal((await f.writer.read('a')).jiezheping, 10)
  assert.equal(f.writer.hasPending(), false); assert.equal(f.documents.length, 1)
})
test('unconfirmed response cannot be accepted or cleared even if a retry is rejected', async () => {
  const documents = []; let attempts = 0
  const writer = createGrowthPlanInventoryWriter({ isCurrent: () => true, createId: () => 'uncertain',
    getCurrent: async () => ({ entries: {} }), importInventory: async doc => {
      documents.push(JSON.stringify(doc)); if (++attempts === 1) return null
      throw Object.assign(new Error('retry denied'), { status: 403 })
    } })
  await assert.rejects(writer.save('a', 'jiezhuping', 0), /未确认/)
  await assert.rejects(writer.acceptCurrent('a', 'jiezhuping', 0), /不能使用/)
  await assert.rejects(writer.read('a'), /原记录/)
  await assert.rejects(writer.save('a', 'jiezhuping', 0), /retry denied/)
  assert.equal(writer.hasPending(), true); assert.equal(writer.getPending().phase, 'unconfirmed')
  assert.equal(documents[0], documents[1])
})
test('missing/older baseline does not authorize acceptance; fresh full baseline does', async () => {
  const f = conflictFixture()
  await assert.rejects(f.writer.save('a', 'jiezheping', 10))
  for (const baseline of [null, 'invalid', '2026-10-08T00:59:59Z']) {
    f.setBaseline(baseline)
    await assert.rejects(f.writer.read('a'), /尚未证实/)
    assert.equal(f.writer.getPending().canAccept, false)
    await assert.rejects(f.writer.acceptCurrent('a', 'jiezheping', 10), /不能使用/)
  }
  const writer = createGrowthPlanInventoryWriter({ ...f.options,
    getCurrent: async () => ({ account_id: 'a', entity_type: 'item', full_baseline_at: '2026-10-08T01:00:01Z', entries: { jiezheping: { count: 8 } } }) })
  await assert.rejects(writer.read('a'), /不一致/)
  assert.equal(writer.getPending().canAccept, true)
  assert.equal((await writer.acceptCurrent('a', 'jiezheping', 10)).jiezheping, 8)
  assert.equal(f.documents.length, 1)
})
test('failed or invalid refresh revokes acceptance without forgetting import confirmation', async () => {
  const f = conflictFixture()
  await assert.rejects(f.writer.save('a', 'jiezheping', 10))
  for (const status of [401,403,404,409,422,500]) {
    f.setFailure(Object.assign(new Error('GET failed'), { status }))
    await assert.rejects(f.writer.read('a'), /GET failed/)
    assert.equal(f.writer.hasPending(), true); assert.equal(f.writer.getPending().phase, 'acknowledged')
    assert.equal(f.writer.getPending().canAccept, false)
  }
  f.setFailure(null); f.setCount(null)
  await assert.rejects(f.writer.read('a'), /数量无效/)
  assert.equal(f.writer.hasPending(), true); assert.equal(f.documents.length, 1)
  f.setCount(10); await f.writer.read('a'); assert.equal(f.writer.hasPending(), false)
})
test('acceptance revalidates baseline and account instead of trusting the previous offer', async () => {
  const f = conflictFixture()
  await assert.rejects(f.writer.save('a', 'jiezheping', 10))
  f.setBaseline(null)
  await assert.rejects(f.writer.acceptCurrent('a', 'jiezheping', 10), /尚未证实/)
  assert.equal(f.writer.hasPending(), true)
  f.switch()
  await assert.rejects(f.writer.acceptCurrent('a', 'jiezheping', 10), /账号已切换/)
  await assert.rejects(createGrowthPlanInventoryWriter({ ...f.options, isCurrent: () => true }).save('b', 'jiezheping', 10), /原账号/)
  assert.equal(f.documents.length, 1)
})
test('busy operations do not overlap writes, reads or acceptance', async () => {
  const post = deferred(); let writes = 0, reads = 0
  const writer = createGrowthPlanInventoryWriter({ isCurrent: () => true, createId: () => 'busy',
    getCurrent: async () => { reads++; return { entries: { jiezhuping: { count: 0 } } } },
    importInventory: async () => { writes++; return post.promise } })
  const saving = writer.save('a', 'jiezhuping', 0)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  await assert.rejects(writer.save('a', 'jiezhuping', 0), /请稍候/)
  await assert.rejects(writer.read('a'), /请稍候/)
  await assert.rejects(writer.acceptCurrent('a', 'jiezhuping', 0), /请稍候/)
  post.resolve({ accepted: 1 }); await saving
  assert.equal(writes, 1); assert.equal(reads, 2); assert.equal(writer.hasPending(), false)
})
test('obsolete readback retains confirmation and does not publish the old result', async () => {
  const read = deferred(); let reads = 0, current = true, writes = 0
  const state = { pending: null, busy: false }
  const writer = createGrowthPlanInventoryWriter({ state, isCurrent: () => current,
    getCurrent: async () => ++reads === 1 ? { entries: {} } : read.promise,
    importInventory: async () => { writes++; return { accepted: 1 } }, createId: () => 'obsolete' })
  const saving = writer.save('a', 'jiezhuping', 5)
  while (reads < 2) await Promise.resolve()
  current = false; read.resolve({ entries: { jiezhuping: { count: 5 } } })
  await assert.rejects(saving, /账号已切换/)
  assert.equal(writer.getPending().phase, 'acknowledged'); assert.equal(writer.hasPending(), true)
  const next = createGrowthPlanInventoryWriter({ state, isCurrent: () => true,
    getCurrent: async () => ({ entries: { jiezhuping: { count: 5 } } }), importInventory: () => { throw new Error('must not POST') } })
  await next.read('a'); assert.equal(next.hasPending(), false); assert.equal(writes, 1)
})
test('late import confirmation survives component teardown and remount', async () => {
  const post = deferred(); let alive = true, documents = []
  const state = growthPlanInventorySession('unmount-user', 'a')
  const writer = createGrowthPlanInventoryWriter({ state, isCurrent: () => alive, createId: () => 'remount',
    getCurrent: async () => ({ entries: {} }), importInventory: async doc => { documents.push(doc); return post.promise } })
  const saving = writer.save('a', 'jieyangping', 5)
  while (!documents.length) await Promise.resolve()
  alive = false; post.resolve({ accepted: 1 }); await assert.rejects(saving, /账号已切换/)
  const remount = createGrowthPlanInventoryWriter({ state: growthPlanInventorySession('unmount-user', 'a'), isCurrent: () => true,
    getCurrent: async () => ({ entries: { jieyangping: { count: 5 } } }), importInventory: () => { throw new Error('must not POST') } })
  await remount.read('a'); assert.equal(remount.hasPending(), false)
  assert.notEqual(state, growthPlanInventorySession('another-user', 'a'))
  assert.notEqual(state, growthPlanInventorySession('unmount-user', 'b'))
})
test('unconfirmed record contents survive remount and malformed acknowledgement', async () => {
  const state = { pending: null, busy: false }, documents = []
  const options = { state, isCurrent: () => true, createId: () => 'preserve',
    getCurrent: async () => ({ entries: { jiezhuping: { count: 5 } } }) }
  const first = createGrowthPlanInventoryWriter({ ...options, importInventory: async doc => { documents.push(JSON.stringify(doc)); return { accepted: '1' } } })
  await assert.rejects(first.save('a', 'jiezhuping', 5), /未确认/)
  const next = createGrowthPlanInventoryWriter({ ...options, createId: () => { throw new Error('must retain ID') },
    importInventory: async doc => { documents.push(JSON.stringify(doc)); return { duplicates: 1 } } })
  await next.save('a', 'jiezhuping', 5)
  assert.equal(documents[0], documents[1]); assert.equal(next.hasPending(), false)
})
test('superseded/history-only import is confirmed but requires explicit recovery', async () => {
  for (const field of ['superseded', 'history_only']) {
    const f = conflictFixture({ response: { accepted: 1, [field]: 1 } })
    await assert.rejects(f.writer.save('a', 'jiezheping', 10))
    assert.equal(f.writer.getPending().phase, 'conflict')
    await assert.rejects(f.writer.read('a'))
    await f.writer.acceptCurrent('a', 'jiezheping', 10)
    assert.equal(f.documents.length, 1); assert.equal(f.writer.hasPending(), false)
  }
})

test('null and invalid edits never become a zero stock write', async () => {
  let writes = 0
  const writer = createGrowthPlanInventoryWriter({ isCurrent: () => true, getCurrent: async () => ({ entries: {} }), importInventory: async () => { writes++ } })
  for (const count of [null, undefined, '', -1, NaN, 1.5, '0']) await assert.rejects(writer.save('a', 'jiezhuping', count), /非负整数/)
  assert.equal(writes, 0); assert.equal(writer.hasPending(), false)
})
