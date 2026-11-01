import test from 'node:test'
import assert from 'node:assert/strict'
import { createStarCloudCoordinator } from '../src/pages/star/starCloudCoordinator.js'
import { createCloudPlanInheritancePort, planSourceBusiness } from '../src/pages/star/starCloudPlanInheritance.js'
const clone = value => JSON.parse(JSON.stringify(value))
function setup() {
  let scope={accountId:'a',generation:2,revision:7},active=true,adopted=[],released=0,commands=[]
  let state={account_id:'a',generation:2,revision:7,
    inventory:[{instance_id:'new1',kind:'main',name:'天府',quality:'orange',level:40}],
    plan_targets:{},experience:{orange:1,purple:525,white:91},bag:{current_count:1,capacity:null}}
  let source={account_id:'a',source_recovery_point_id:'point',source_generation:1,target_generation:2,
    source_state:{inventory:[{instance_id:'old.1',kind:'main',name:'天府',quality:'orange',level:20}],
      plan_targets:[{instance_id:'old.1',target_level:60}],experience:{orange:0,purple:0,white:0},bag:{current_count:1,capacity:500}}}
  const coordinator={
    ocrRebuildScope:()=>clone(scope),
    beginCompletion:()=>({isCurrent:()=>active,adopt:reply=>{adopted.push(reply);scope.revision=reply.state.revision},release:()=>{released++}})
  }
  const send=action=>async(account,body)=>{
    commands.push({account,body:clone(body),action})
    if(action==='confirm') {state.plan_targets=clone(body.plan_targets);if(Object.keys(body.plan_targets).length)state.revision++}
    source=null
    return {operation_id:body.operation_id,source_recovery_point_id:'point',target_generation:2,revision:state.revision,action}
  }
  const deps={coordinator,readState:async()=>clone(state),readPending:async()=>clone(source),
    confirm:send('confirm'),discard:send('discard'),operationId:()=> '11111111-1111-4111-8111-111111111111'}
  return {deps,scope:()=>clone(scope),state:()=>state,source:()=>source,commands,adopted,released:()=>released,
    switchAccount:()=>{active=false;scope.accountId='b'}}
}
const snapshot=()=>({inventory:[{starInstanceId:'new1',kind:'主星',name:'天府',quality:'橙',level:40}],
  planTargets:{new1:60},experience:{orange:1,purple:525,white:91},bag:{currentCount:1,capacity:null}})
test('cloud source maps typed backend plan values and read/later sends no mutation',async()=>{
  const f=setup(),port=createCloudPlanInheritancePort(f.deps),source=await port.read(f.scope())
  assert.deepEqual(source.sourceState.planTargets,{'old.1':60})
  assert.equal(source.sourceState.inventory[0].kind,'主星')
  assert.equal(f.commands.length,0);assert.deepEqual(f.state().plan_targets,{})
  assert.equal(f.source().source_recovery_point_id,'point')
})
test('confirm sends account source generation revision and only targets then adopts matching readback',async()=>{
  const f=setup(),port=createCloudPlanInheritancePort(f.deps),source=await port.read(f.scope())
  assert.deepEqual(await port.confirm(source,snapshot(),f.scope()),snapshot())
  assert.equal(f.commands.length,1)
  assert.deepEqual(f.commands[0].body,{operation_id:'11111111-1111-4111-8111-111111111111',source_recovery_point_id:'point',
    expected_generation:2,expected_revision:7,plan_targets:{new1:60}})
  assert.equal(f.adopted[0].state.revision,8);assert.equal(f.released(),1)
})
test('discard changes no backpack or current plan and uses its own endpoint',async()=>{
  const f=setup(),port=createCloudPlanInheritancePort(f.deps),source=await port.read(f.scope()),before=clone(f.state())
  f.state().plan_targets={new1:50};before.plan_targets={new1:50}
  await port.discard(source,f.scope())
  assert.deepEqual(f.state(),before);assert.equal(f.commands[0].action,'discard')
  assert.equal(Object.hasOwn(f.commands[0].body,'plan_targets'),false)
})
test('lost confirm response retries the same operation and never repeats a state revision',async()=>{
  const f=setup();let original=f.deps.confirm,receipt
  f.deps.confirm=async(...args)=>{
    if(!receipt){receipt=await original(...args);throw Object.assign(new Error('lost'),{status:503})}
    f.commands.push({account:args[0],body:clone(args[1]),action:'retry'});return receipt
  }
  const port=createCloudPlanInheritancePort(f.deps),source=await port.read(f.scope())
  await port.confirm(source,snapshot(),f.scope())
  assert.equal(f.state().revision,8)
  assert.deepEqual(f.commands[0].body,f.commands[1].body)
})
test('stale version or foreign source rejects without resolving',async()=>{
  for(const change of [
    f=>{f.state().revision++},
    f=>{f.source().account_id='b'},
    f=>{f.source().target_generation=3},
  ]){
    const f=setup();change(f)
    await assert.rejects(createCloudPlanInheritancePort(f.deps).read(f.scope()),/已变化/)
    assert.equal(f.commands.length,0)
  }
})
test('account switch before request prevents the old account command',async()=>{
  const f=setup(),port=createCloudPlanInheritancePort(f.deps),source=await port.read(f.scope()),scope=f.scope()
  f.deps.readState=async()=>{f.switchAccount();return clone(f.state())}
  const switched=createCloudPlanInheritancePort(f.deps)
  await assert.rejects(switched.confirm(source,snapshot(),scope),/已变化/)
  assert.equal(f.commands.length,0);assert.equal(f.adopted.length,0);assert.equal(f.released(),1)
})
test('explicit conflict is not retried or adopted and incoming inventory cannot change',async()=>{
  const f=setup();let sends=0
  f.deps.confirm=async()=>{sends++;throw Object.assign(new Error('conflict'),{status:409})}
  const port=createCloudPlanInheritancePort(f.deps),source=await port.read(f.scope())
  const wrong=snapshot();wrong.inventory[0].level=50
  await assert.rejects(port.confirm(source,wrong,f.scope()),/已变化/);assert.equal(sends,0)
  await assert.rejects(port.confirm(source,snapshot(),f.scope()),/conflict/)
  assert.equal(sends,1);assert.equal(f.adopted.length,0)
})
test('malformed source targets cannot be silently coerced into empty plans',()=>{
  const raw=setup().source().source_state
  raw.plan_targets[0].target_level=null
  assert.throws(()=>planSourceBusiness(raw),/已变化/)
})

test('real coordinator adopts confirmation once and the resolved source is not offered again',async()=>{
  const f=setup(),storageValues=new Map()
  const coordinator=createStarCloudCoordinator({
    selectedHostAccount:()=>({accountId:'a',gameVersion:'如鸢'}),
    getState:async()=>clone(f.state()),
    storage:{getItem:key=>storageValues.get(key)??null,setItem:(key,value)=>storageValues.set(key,value),removeItem:key=>storageValues.delete(key)}
  })
  const handle={getCloudBusinessSnapshot:async()=>({...snapshot(),planTargets:{}}),applyCloudBusinessSnapshot:async()=>{}}
  assert.equal(await coordinator.enter(handle),true)
  const port=createCloudPlanInheritancePort({...f.deps,coordinator})
  const scope=coordinator.ocrRebuildScope(),source=await port.read(scope)
  await port.confirm(source,snapshot(),scope)
  assert.equal(coordinator.state().writer.state().revision,8)
  assert.deepEqual(coordinator.state().writer.state().base.planTargets,{new1:60})
  assert.equal(coordinator.state().replacing,false)
  assert.equal(await port.read(coordinator.ocrRebuildScope()),null)
  assert.equal(storageValues.size,0)
  coordinator.leave()
})
