import test from 'node:test'
import assert from 'node:assert/strict'
import { readGrowthPlanInventory, createGrowthPlanInventoryWriter } from '../src/pages/star/growthPlanInventory.js'
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
    await assert.rejects(writer.save('a',id,8),/库存可能已发生变化.*保存目标 8，当前读取 3.*不一致/)
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
