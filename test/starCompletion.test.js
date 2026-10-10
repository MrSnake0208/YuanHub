import test from 'node:test'
import assert from 'node:assert/strict'
import { createStarCompletionApi } from '../src/api/starCompletions.js'
import { createStarCompletionPort } from '../src/pages/star/starCompletionPort.js'
import { createStarCloudCoordinator } from '../src/pages/star/starCloudCoordinator.js'
import { createStarCompletionMock, completionFixture, DEMO_ACCOUNT, DEMO_USER } from '../src/pages/star/dev/starCompletionMock.js'
import { completionDemoScenario, resetStarCompletionDemo } from '../src/pages/star/dev/starCompletionDemo.js'
const store=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}}
test('review scenarios retain isolated identity and exact 251k / zero-white balances',()=>{
  for(const name of ['one','two','three','insufficient','unknown','six'])assert.equal(completionDemoScenario(name).account_id,DEMO_ACCOUNT)
  assert.deepEqual(completionDemoScenario('one').state.experience,{orange:500,purple:0,white:0})
  assert.equal(completionDemoScenario('two').state.experience.white,0)
  const value=completionDemoScenario('insufficient').state.experience
  assert.equal(value.orange*1000+value.purple*500+value.white*100,251000)
  assert.equal(completionDemoScenario('unknown').state.experience.orange,null)
})
test('six-star review fixture has six unique stable IDs and plans, reset is only mock',()=>{
  const fixture=completionDemoScenario('six')
  assert.equal(fixture.state.inventory.length,6);assert.equal(new Set(fixture.state.inventory.map(v=>v.instance_id)).size,6)
  assert.equal(Object.keys(fixture.state.plan_targets).length,6)
  const mock=createStarCompletionMock();mock.reset(fixture);assert.deepEqual(mock.context(),fixture);assert.equal(mock.calls.length,0)
})
const snapshot=()=>({inventory:completionFixture().state.inventory.map(v=>({starInstanceId:v.instance_id,kind:'主星',name:v.name,quality:v.quality==='orange'?'橙':'紫',level:v.level})),planTargets:completionFixture().state.plan_targets,experience:completionFixture().state.experience,bag:{currentCount:4,capacity:200}})
const body=()=>({account_id:DEMO_ACCOUNT,game:'如鸢',operation_id:'growth:mock.1',expected_generation:2,expected_star_revision:3,expected_inventory_revision:7,stars:[{instance_id:'demo.tianfu.1',current_level:40,target_level:50}],experience_consumed:{orange:1,purple:2,white:3},bottles_consumed:{jiezhuping:0,jiezheping:50,jieyangping:20}})
for (const scenario of ['three','two']) test(`demo reset to ${scenario} clears lost-response pending only for the fictional owner`,async()=>{
  const storage=store(),mock=createStarCompletionMock({storage})
  const key=(user,account,game)=>'yuanhub.star-completion:v1:'+ [user,account,game].map(encodeURIComponent).join(':')
  const demoKey=key(DEMO_USER,DEMO_ACCOUNT,'如鸢')
  const preserved=[key('real-user',DEMO_ACCOUNT,'如鸢'),key(DEMO_USER,'real-account','如鸢'),key(DEMO_USER,DEMO_ACCOUNT,'代号鸢'),'unrelated']
  for(const other of preserved)storage.setItem(other,'preserve')
  mock.loseNextResponse()
  storage.setItem(demoKey,JSON.stringify({version:1,phase:'pending',scope:{userId:DEMO_USER,accountId:DEMO_ACCOUNT,game:'如鸢',generation:2,revision:3},body:body()}))
  await assert.rejects(mock.transport('/v1/star-state/completions',{method:'POST',body:body()}),/响应丢失/)
  assert.equal((await mock.transport('/v1/star-state/completions/growth%3Amock.1?account_id='+DEMO_ACCOUNT)).operation_id,body().operation_id)
  const fixture=completionDemoScenario(scenario)
  resetStarCompletionDemo(mock,storage,fixture)
  assert.equal(storage.getItem(demoKey),null)
  for(const other of preserved)assert.equal(storage.getItem(other),'preserve')
  assert.deepEqual(mock.context(),fixture)
  await assert.rejects(mock.transport('/v1/star-state/completions/growth%3Amock.1?account_id='+DEMO_ACCOUNT),e=>e.code==='star_completion_not_found')
  assert.equal(mock.calls.filter(call=>call.options.method==='POST').length,1)
})
const harness=async()=>{
  const mock=createStarCompletionMock(),storage=store();let host={accountId:DEMO_ACCOUNT,gameVersion:'如鸢'},userId=DEMO_USER;const patches=[]
  const coordinator=createStarCloudCoordinator({selectedHostAccount:()=>host,storage,getState:async()=>mock.context().state,patchState:async(...args)=>{patches.push(args);return mock.patch(...args)}})
  await coordinator.enter({getCloudBusinessSnapshot:async()=>snapshot(),applyCloudBusinessSnapshot:async()=>{}})
  const api=createStarCompletionApi({userId:DEMO_USER,transport:mock.transport,enabled:true})
  const port=createStarCompletionPort({api,coordinator,storage,enabled:true,identity:()=>({userId,game:host.gameVersion})})
  return {mock,coordinator,port,api,patches,switchAccount:()=>{host={accountId:'other',gameVersion:'如鸢'}},switchUser:()=>{userId='other'}}
}
test('public default guard rejects all three methods before any transport call',async()=>{let calls=0;const api=createStarCompletionApi({userId:'real',transport:()=>{calls++}});for(const fn of [()=>api.context('a'),()=>api.post(body()),()=>api.receipt('id','a')])assert.throws(fn,/尚未开放/);assert.equal(calls,0)})
test('completion adapter uses JWT identity-bound snake-case POST and encoded GET',async()=>{const requests=[];const api=createStarCompletionApi({userId:'fake',enabled:true,transport:async(...args)=>{requests.push(args);return {}}});await api.context('a/b');await api.post(body());await api.receipt('growth:a/b','a/b');assert.equal(requests[0][0],'/v1/star-state/completion-context?account_id=a%2Fb');assert.equal(requests[1][1].method,'POST');assert.equal(requests[1][1].auth,true);assert.equal(requests[1][1].expectedUserId,'fake');assert.deepEqual(requests[1][1].body,body());assert.equal(requests[2][0],'/v1/star-state/completions/growth%3Aa%2Fb?account_id=a%2Fb')})
test('isolated mock refuses real account and undefined paths without network fallback',async()=>{const m=createStarCompletionMock();await assert.rejects(m.transport('/v1/star-state/completion-context?account_id=real'),/虚构账号/);await assert.rejects(m.transport('/v1/inventory/import',{method:'POST'}),/未定义/)})
test('completion lease stops ordinary snapshot PATCH then adopts new revisions',async()=>{const h=await harness();h.port.begin(h.port.scope());assert.equal(h.coordinator.committed({accountId:DEMO_ACCOUNT,snapshot:snapshot()}),false);const receipt=await h.port.post(body());await h.port.adopt(await h.port.context());h.port.release();assert.equal(h.patches.length,0);assert.equal(h.coordinator.state().generation,2);assert.equal(h.port.scope().revision,receipt.star_revision);assert.deepEqual(h.mock.calls.map(v=>v.options.method||'GET'),['POST','GET']);assert.equal(h.mock.calls.some(v=>/inventory\/import|\/current/.test(v.path)),false)})
test('pending cloud PATCH prevents acquiring completion command',async()=>{const h=await harness(),draft=snapshot();draft.experience={orange:199,purple:300,white:500};h.coordinator.committed({accountId:DEMO_ACCOUNT,snapshot:draft});assert.equal(h.port.scope(),null);assert.throws(()=>h.port.begin({userId:DEMO_USER,accountId:DEMO_ACCOUNT,game:'如鸢',generation:2,revision:3}),/变化/)})
test('late account switch rejects command, receipt and authority adoption',async()=>{const h=await harness();h.port.begin(h.port.scope());h.switchAccount();assert.throws(()=>h.port.post(body()),/变化/);assert.throws(()=>h.port.receipt('growth:mock.1',DEMO_ACCOUNT),/变化/);await assert.rejects(h.port.adopt(completionFixture()),/变化/);assert.equal(h.mock.calls.length,0)})
test('late signed-in user switch rejects sending under a new JWT owner',async()=>{const h=await harness();h.port.begin(h.port.scope());h.switchUser();assert.throws(()=>h.port.context(),/变化/);assert.throws(()=>h.port.post(body()),/变化/);assert.equal(h.mock.calls.length,0)})
test('mock persisted server response loss survives new transport and returns original receipt',async()=>{const storage=store(),first=createStarCompletionMock({storage});first.loseNextResponse();await assert.rejects(first.transport('/v1/star-state/completions',{method:'POST',body:body()}),/响应丢失/);const next=createStarCompletionMock({storage});const receipt=await next.transport('/v1/star-state/completions/growth%3Amock.1?account_id='+DEMO_ACCOUNT);const retry=await next.transport('/v1/star-state/completions',{method:'POST',body:body()});assert.deepEqual(receipt,retry);assert.equal(next.context().state.experience.orange,199)})
test('mock same ID changed actual quantities is rejected',async()=>{const h=await harness();await h.api.post(body());const changed=body();changed.experience_consumed.orange=2;await assert.rejects(h.api.post(changed),e=>e.code==='star_completion_idempotency_conflict')})
test('unknown inventory and known zero remain distinct in mock context',async()=>{const f=completionFixture();f.bottle_balances.jiezhuping=null;f.bottle_balances.jiezheping=0;const m=createStarCompletionMock({initial:f});const c=await m.transport('/v1/star-state/completion-context?account_id='+DEMO_ACCOUNT);assert.equal(c.bottle_balances.jiezhuping,null);assert.equal(c.bottle_balances.jiezheping,0);await assert.rejects(m.transport('/v1/star-state/completions',{method:'POST',body:body()}),e=>e.code==='insufficient_inventory');assert.deepEqual(m.context(),f)})
