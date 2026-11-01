import { createStarCompletionMock, completionFixture, DEMO_ACCOUNT, DEMO_USER } from './starCompletionMock.js'
import { createStarCloudCoordinator } from '../starCloudCoordinator.js'
import { createStarCompletionApi } from '../../../api/starCompletions.js'
import { createStarCompletionPort } from '../starCompletionPort.js'

export function completionDemoScenario(name) {
  const fixture=completionFixture()
  if(name==='one')fixture.state.experience={orange:500,purple:0,white:0}
  if(name==='two')fixture.state.experience={orange:200,purple:300,white:0}
  if(name==='insufficient')fixture.state.experience={orange:200,purple:102,white:0}
  if(name==='unknown')fixture.state.experience={orange:null,purple:300,white:0}
  if(name==='six'){
    fixture.state.inventory=fixture.state.inventory.slice(0,3)
    delete fixture.state.plan_targets['demo.tianfu.3']
    for(let i=1;i<=3;i++){
      const id='demo.extra.'+i
      fixture.state.inventory.push({instance_id:id,kind:'main',name:'天府',quality:'orange',level:40})
      fixture.state.plan_targets[id]=50
    }
    fixture.state.bag.current_count=6;fixture.state.experience.orange=1000
  }
  return fixture
}

/** Reset only this fictional owner; use the existing completion v1 storage key. */
export function resetStarCompletionDemo(mock, storage, fixture = completionFixture()) {
  const key = 'yuanhub.star-completion:v1:' + [DEMO_USER, DEMO_ACCOUNT, '如鸢'].map(encodeURIComponent).join(':')
  storage.removeItem(key)
  mock.reset(fixture)
}

/** Opt-in preview can use honest dirty-source build artifacts without formal release sync. */
export async function loadStarCompletionDemoProduct(fallback) {
  const base='/.ux/audits/p3b-ui-preview/'
  const response=await fetch(base+'preview-manifest.json',{cache:'no-store'})
  if(!response.ok)return fallback()
  const manifest=await response.json()
  if(manifest.kind!=='development-review-only')throw new Error('隔离预览来源不合法。')
  const link=document.createElement('link');link.rel='stylesheet';link.href=base+'yuanstar-embed.css';document.head.append(link)
  return import(/* @vite-ignore */ base+'yuanstar-embed.js')
}

/** Imported only behind Vite DEV + explicit demo opt-in, before mounting a real workspace. */
export async function mountStarCompletionDemo(product, root, onSummaryChange) {
  const mock = createStarCompletionMock({storage:localStorage})
  const host = {accountId:DEMO_ACCOUNT,displayName:'P3-B 隔离演示',gameVersion:'如鸢'}
  let controls=null
  const coordinator = createStarCloudCoordinator({selectedHostAccount:()=>host,storage:localStorage,
    onState:state=>{controls?.querySelectorAll('select,button').forEach(field=>{field.disabled=!!state.replacing})},
    getState:async()=>mock.context().state,patchState:mock.patch})
  const port = createStarCompletionPort({api:createStarCompletionApi({userId:DEMO_USER,transport:mock.transport,enabled:true}),coordinator,enabled:true,
    identity:()=>({userId:DEMO_USER,game:'如鸢'})})
  port.demo=true
  const handle=product.mountYuanStar(root,{embedded:true,hostAccount:host,assetBaseUrl:'/yuanstar-embed/',reviewView:'plan',completion:port,
    onSummaryChange, onBusinessStateCommitted:event=>coordinator.committed(event),
    onReadBreakthroughInventory:async()=>mock.context().bottle_balances})
  await handle.setHostAccount(host); await coordinator.enter(handle); handle.setActiveTab('review'); handle.setReviewView('plan')
  controls=document.createElement('div'); controls.className='star-completion-demo-controls'
  controls.innerHTML='<span>虚构数据 · 不写真实库存</span><label>演示场景 <select aria-label="完成演示场景"><option value="three">三色经验</option><option value="one">一种经验</option><option value="two">两种经验</option><option value="insufficient">251k资源不足</option><option value="unknown">库存未知</option><option value="six">六颗星石</option></select></label><button type="button">下次模拟响应丢失</button><button type="button">重置演示数据</button>'
  const scenarioKey='yuanhub.p3b-demo-ui-scenario:v1'
  const select=controls.querySelector('select');select.value=localStorage.getItem(scenarioKey)||'three'
  select.onchange=()=>{
    if(coordinator.state()?.replacing)return
    resetStarCompletionDemo(mock,localStorage,completionDemoScenario(select.value));localStorage.setItem(scenarioKey,select.value);location.reload()
  }
  controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;margin:8px 0;color:#5a4633'
  controls.querySelectorAll('button').forEach(button=>{button.className='button button-tertiary'})
  controls.querySelectorAll('button')[0].onclick=()=>{mock.loseNextResponse();controls.querySelector('span').textContent='下次响应丢失：提交后可刷新，再查原回执'}
  controls.querySelectorAll('button')[1].onclick=()=>{if(coordinator.state()?.replacing)return;resetStarCompletionDemo(mock,localStorage,completionDemoScenario(select.value));location.reload()}
  root.prepend(controls)
  await handle.recoverCompletion()
  return handle
}
