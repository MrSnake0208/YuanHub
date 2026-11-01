const copy = value => JSON.parse(JSON.stringify(value))
const stable = value => JSON.stringify(value, (_k,v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v)
const conflict = (code, message, status = 409) => Object.assign(new Error(message), {code,status})
export const DEMO_ACCOUNT = 'p3b-isolated-demo-account'
export const DEMO_USER = 'p3b-fictional-user'
export function completionFixture() {
  return { account_id: DEMO_ACCOUNT, game: '如鸢', inventory_revision: 7,
    state: { account_id: DEMO_ACCOUNT, generation: 2, revision: 3, inventory: [
      {instance_id:'demo.tianfu.1',kind:'main',name:'天府',quality:'orange',level:40},
      {instance_id:'demo.tianfu.2',kind:'main',name:'天府',quality:'orange',level:43},
      {instance_id:'demo.tanlang.1',kind:'main',name:'贪狼',quality:'orange',level:40},
      {instance_id:'demo.tianfu.3',kind:'main',name:'天府',quality:'purple',level:20},
    ], plan_targets: {'demo.tianfu.1':50,'demo.tianfu.2':60,'demo.tanlang.1':50,'demo.tianfu.3':40},
    experience:{orange:200,purple:300,white:500},bag:{current_count:4,capacity:200}},
    bottle_balances:{jiezhuping:100,jiezheping:400,jieyangping:300} }
}
/** Virtual server for injected tests/development only. It has no fetch or real-account fallback. */
export function createStarCompletionMock({ initial = completionFixture(), storage = null } = {}) {
  const key = 'yuanhub.p3b-demo-server:v1'
  const saved = storage?.getItem(key)
  let { context, receipts } = saved ? JSON.parse(saved) : {context:copy(initial),receipts:{}}
  const calls = []; let loseResponse = false, hideReceipt = false
  const persist = () => storage?.setItem(key, JSON.stringify({context,receipts}))
  const owned = account => { if (account !== DEMO_ACCOUNT) throw conflict('account_not_found','演示只接受虚构账号',404) }
  const identity = body => stable({...body,stars:body.stars.map(s=>({...s,start_already_broken:s.start_already_broken??null,target_also_broken:s.target_also_broken??null})).sort((a,b)=>a.instance_id.localeCompare(b.instance_id))})
  async function transport(path, options = {}) {
    calls.push({path,options:copy(options)})
    const url = new URL(path,'https://isolated.invalid')
    if (url.pathname.endsWith('/completion-context')) { owned(url.searchParams.get('account_id')); return copy(context) }
    if (url.pathname === '/v1/star-state/completions' && options.method === 'POST') {
      const body = options.body; owned(body.account_id)
      if (receipts[body.operation_id]) {
        if (receipts[body.operation_id].request_identity !== identity(body)) throw conflict('star_completion_idempotency_conflict','操作正文冲突')
        return copy(receipts[body.operation_id])
      }
      if (body.game !== context.game || body.expected_generation !== context.state.generation) throw conflict('star_generation_changed','generation已变化')
      if (body.expected_star_revision !== context.state.revision || body.expected_inventory_revision !== context.inventory_revision) throw conflict('star_state_revision_conflict','revision已变化')
      if (new Set(body.stars.map(s=>s.instance_id)).size !== body.stars.length) throw conflict('star_completion_duplicate_instance','重复实例',422)
      for (const s of body.stars) {
        if (context.state.inventory.find(v=>v.instance_id===s.instance_id)?.level !== s.current_level || context.state.plan_targets[s.instance_id] !== s.target_level) throw conflict('star_plan_changed','计划已变化')
      }
      for (const [consumed,ownedStock,unknown,insufficient] of [[body.experience_consumed,context.state.experience,'star_experience_unknown','insufficient_star_experience'],[body.bottles_consumed,context.bottle_balances,'star_bottle_inventory_unknown','insufficient_inventory']]) {
        for (const [id,value] of Object.entries(consumed)) {
          if (!Number.isSafeInteger(value) || value < 0) throw conflict('star_completion_invalid_request','数量非法',422)
          if (value > 0 && ownedStock[id] == null) throw conflict(unknown,id+'库存未知')
          if (ownedStock[id] != null && value > ownedStock[id]) throw conflict(insufficient,id+'库存不足')
        }
      }
      const next = copy(context)
      for (const s of body.stars) { next.state.inventory.find(v=>v.instance_id===s.instance_id).level=s.target_level; delete next.state.plan_targets[s.instance_id] }
      for (const [id,n] of Object.entries(body.experience_consumed)) if (n) next.state.experience[id]-=n
      for (const [id,n] of Object.entries(body.bottles_consumed)) if (n) next.bottle_balances[id]-=n
      next.state.revision++; next.inventory_revision++
      const receipt = {...copy(next),operation_id:body.operation_id,generation:body.expected_generation,star_revision:next.state.revision,
        changes:body.stars.map(s=>({instance_id:s.instance_id,from:s.current_level,to:s.target_level})),experience_consumed:copy(body.experience_consumed),bottles_consumed:copy(body.bottles_consumed),completed_at:'2026-10-09T00:01:00.000Z',request_identity:identity(body)}
      context=next; receipts[body.operation_id]=receipt; persist()
      if (loseResponse) { loseResponse=false; throw new TypeError('模拟提交成功后响应丢失') }
      return copy(receipt)
    }
    if (url.pathname.startsWith('/v1/star-state/completions/')) {
      owned(url.searchParams.get('account_id'))
      const receipt=receipts[decodeURIComponent(url.pathname.split('/').at(-1))]
      if (!receipt || hideReceipt) throw conflict('star_completion_not_found','回执尚未可见',404)
      return copy(receipt)
    }
    throw new Error('隔离Mock拒绝未定义的网络路径')
  }
  return {transport,calls,context:()=>copy(context), loseNextResponse:()=>{loseResponse=true},hideReceipt:value=>{hideReceipt=value},
    async patch(_account,body) { owned(_account); context.state={...context.state,inventory:copy(body.inventory),plan_targets:copy(body.plan_targets),experience:copy(body.experience),bag:copy(body.bag),revision:context.state.revision+1}; persist(); return {state:copy(context.state)} },
    reset(fixture = initial) { context=copy(fixture); receipts={}; persist() } }
}
