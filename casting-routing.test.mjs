import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';

// Independent client contexts exercise the real module dialogs and socket listeners.
async function world() {
  const users = [{id:'gm',name:'GM',isGM:true,active:true},{id:'p1',name:'Player 1',active:true},{id:'p2',name:'Player 2',active:true}];
  users.get = id => users.find(u=>u.id===id);
  const documents = new Map();
  function actor(id,owners) {
    const a = {id,name:id,uuid:`Actor.${id}`,documentName:'Actor',items:[],
      testUserPermission:user=>user.isGM || owners.includes(user.id),
      system:{abilities:{int:{mod:4}},attributes:{spellcasting:'int',prof:3},spells:{spell3:{value:3}}},
      async update(data) { a.system.spells.spell3.value=data['system.spells.spell3.value']; }};
    documents.set(a.uuid,a); return a;
  }
  const npc = actor('npc',[]), pc=actor('pc',['p1','p2']);
  function spell(a,id,identifier) {
    const item={id,uuid:`${a.uuid}.Item.${id}`,actor:a,parent:a,documentName:'Item',type:'spell',name:identifier,system:{identifier,level:3}};
    a.items.push(item); documents.set(item.uuid,item);return item;
  }
  const item=spell(npc,'counter','counterspell');
  spell(pc,'counter','counterspell');
  const actors=[npc,pc], clients=[], trace=[], errors=[], messages=[];
  const settings={enabled:true,dispelEnabled:true,removeCurseEnabled:true,identifyEnabled:true,restorationEnabled:true,
    ruleset:'official2014',includeProficiency:true,abjurerEnabled:true,counterspellNames:'Counterspell',counterspellSpecialMinimum:15,rollMode:'publicroll'};
  let serial=0;
  async function client(user) {
    const answers=[],listeners=[],cache=new Map();
    const context=vm.createContext({ console:{debug(){},log(){},error(...args){errors.push(args)}},setTimeout,clearTimeout,queueMicrotask,
      window:{setTimeout,clearTimeout},CONST:{DOCUMENT_OWNERSHIP_LEVELS:{OWNER:3}},CONFIG:{DND5E:{abilities:{}},Dice:{}},
      fromUuidSync:id=>documents.get(id),canvas:{tokens:{placeables:[]}},
      ui:{notifications:{warn:s=>trace.push([user.id,'warning',s]),error:s=>errors.push(s),info(){}}},
      ChatMessage:{getSpeaker:({actor})=>({actor:actor.id}),applyRollMode(){},async create(data){messages.push(data)}},
      foundry:{utils:{escapeHTML:s=>String(s),randomID:()=>`r${++serial}`},applications:{api:{DialogV2:{async wait(config){
        trace.push([user.id,config.window.title,config.content]);
        assert.ok(answers.length,`Unexpected form for ${user.id}: ${config.window.title}`);
        const answer=answers.shift(); return typeof answer==='function'?answer(config):answer;
      }}}}},
      Hooks:{on(){},once(){}},game:{user,users,actors,modules:new Map([['counterspell-plus',{version:'0.5.7'}]]),
        settings:{get:(_module,key)=>settings[key]},i18n:{localize:k=>k,format:(k,data)=>`${k}:${JSON.stringify(data)}`},
        socket:{on:(_name,fn)=>listeners.push(fn),emit:(_name,message)=>{
          trace.push([user.id,'socket',message.type]);
          for (const c of clients) for(const fn of c.listeners) Promise.resolve(fn(structuredClone(message))).catch(e=>errors.push(e));
        }}}});
    for (const file of await fs.readdir('scripts')) {
      if (!file.endsWith('.js')) continue;
      const full=path.resolve('scripts',file);
      cache.set(full,new vm.SourceTextModule(await fs.readFile(full,'utf8'),{context,identifier:full}));
    }
    async function load(file) {
      const module=cache.get(path.resolve(file));
      if (module.status==='unlinked') await module.link((specifier,parent)=>cache.get(path.resolve(path.dirname(parent.identifier),specifier)));
      return module;
    }
    const routing=await load('scripts/casting-session.js');await routing.evaluate();routing.namespace.initializeCastingSessions();
    const workflow=await load('scripts/workflow.js');await workflow.evaluate();workflow.namespace.initializeWorkflow();
    const c={user,context,answers,listeners,routing:routing.namespace,workflow:context.game.counterspellPlus};clients.push(c);return c;
  }
  const gm=await client(users[0]),p1=await client(users[1]),p2=await client(users[2]);
  return {gm,p1,p2,pc,npc,item,documents,users,trace,errors,messages,settings};
}
const select={userId:'gm',actorUuid:'Actor.npc'};
const counter={castingSource:'spell',slotKey:'spell3',ability:'int',rollMode:'publicroll'};
const target={actorUuid:'Actor.pc',ownerUserId:'p2',askOwner:true,sourceType:'spell',spellName:'Fireball',spellLevel:3,ability:'int',targetRollMode:'blindroll'};
const fireball={spellName:'Fireball',spellLevel:4,ability:'int',rollMode:'blindroll'};
const review={counterAbilityMod:4,counterProficiency:3,spellName:'Fireball',spellLevel:3,targetMod:5,targetProf:3};

test('GM Counterspell -> explicitly selected Fireball owner -> GM final review, including blind rolls',async()=>{
 const w=await world();w.gm.answers.push(select,counter,target,config=>{
   assert.match(config.content,/Fireball/);assert.match(config.content,/value="4" selected/);
   return review;
 });w.p2.answers.push(fireball);
 await w.gm.workflow.startFromActivity({item:w.item});
 assert.deepEqual(w.errors,[]);assert.equal(w.npc.system.spells.spell3.value,2);
 assert.equal(w.pc.system.spells.spell3.value,3);
 const forms=w.trace.filter(x=>x[1].startsWith('COUNTERSPELL_PLUS.')).map(x=>[x[0],x[1]]);
 assert.deepEqual(forms,[['gm','COUNTERSPELL_PLUS.Casting.Title'],['gm','COUNTERSPELL_PLUS.Dialog.CounterspellerTitle'],['gm','COUNTERSPELL_PLUS.Dialog.GMTargetTitle'],['p2','COUNTERSPELL_PLUS.Dialog.TargetPlayerTitle'],['gm','COUNTERSPELL_PLUS.Dialog.GMReviewTitle']]);
 assert.equal(w.p1.answers.length,0);assert.equal(w.messages.length,1);
});

test('player Counterspell -> GM target setup -> other player Fireball -> GM review',async()=>{
 const w=await world();w.p1.answers.push({userId:'p1',actorUuid:'Actor.pc'},counter);
 w.gm.answers.push(target,review);w.p2.answers.push(fireball);
 await w.p1.workflow.startFromActivity({item:w.pc.items[0]});
 assert.deepEqual(w.errors,[]);assert.equal(w.pc.system.spells.spell3.value,2);
 assert.ok(w.trace.some(x=>x[0]==='p2'&&x[1].endsWith('TargetPlayerTitle')));
 assert.ok(w.trace.some(x=>x[0]==='gm'&&x[1].endsWith('GMReviewTitle')));
});

test('target cancellation stops before GM review and slot consumption',async()=>{
 const w=await world();w.gm.answers.push(select,counter,target);w.p2.answers.push(null);
 await w.gm.workflow.startFromActivity({item:w.item});
 assert.deepEqual(w.errors,[]);assert.equal(w.npc.system.spells.spell3.value,3);assert.equal(w.messages.length,0);
 assert.ok(!w.trace.some(x=>x[1].endsWith('GMReviewTitle')));
});

test('GM can delegate caster form without giving away final review',async()=>{
 const w=await world();w.gm.answers.push({userId:'p1',actorUuid:'Actor.pc'},target,review);
 w.p1.answers.push(counter);w.p2.answers.push(fireball);
 await w.gm.workflow.startFromActivity({item:w.item});
 assert.deepEqual(w.errors,[]);assert.equal(w.pc.system.spells.spell3.value,2);
 assert.ok(w.trace.some(x=>x[0]==='p1'&&x[1].endsWith('CounterspellerTitle')));
 assert.ok(w.trace.some(x=>x[0]==='gm'&&x[1].endsWith('GMReviewTitle')));
});

test('player cannot choose an unowned actor or another player',async()=>{
 const w=await world();w.p1.answers.push(select);
 const result=await w.p1.routing.selectCastingSession(w.pc,w.pc.items[0],'counterspell');assert.equal(result,null);
 assert.equal(w.npc.system.spells.spell3.value,3);
});

test('offline owner aborts a delegated form immediately',async()=>{
 const w=await world();w.users[1].active=false;
 const result=await w.gm.routing.promptCasting({userId:'p1',actor:w.pc,item:w.pc.items[0]},'counterspell','official2014');
 assert.equal(result,null);assert.ok(w.trace.some(x=>x[1]==='warning'));
});

test('Dispel source details are completed by the chosen owner',async()=>{
 const w=await world();w.p2.answers.push({sourceType:'spell',spellName:'Bless',spellLevel:1,casterMod:4,casterProf:3});
 const result=await w.gm.routing.promptCasting({userId:'p2',actor:w.pc,item:null},'dispel-source',0,1,'actor');
 assert.equal(result.spellName,'Bless');assert.equal(result.casterMod,4);assert.deepEqual(w.errors,[]);
 assert.ok(w.trace.some(x=>x[0]==='p2'&&x[1].includes('GMEffectTitle')));
});

test('non-GM socket requests do not open player forms',async()=>{
 const w=await world();const listener=w.p2.listeners[0];
 await listener({type:'casting-prompt',recipientId:'p2',senderId:'p1',requestId:'bad',actorUuid:'Actor.pc',itemUuid:w.pc.items[0].uuid,method:'counterspell',args:['official2014']});
 assert.ok(!w.trace.some(x=>x[0]==='p2'&&x[1].endsWith('CounterspellerTitle')));
});

test('all other caster forms and follow-up forms route to the selected owner',async()=>{
 const w=await world();
 const session={userId:'p2',actor:w.pc,item:w.pc.items[0]};
 const caster={ruleset:'official2014',activityType:'lesser',slotLevel:3};
 const setup={effects:[],targetName:'Target',defenseRollMode:'publicroll'};
 for (const [method,args] of [
   ['dispel',['official2014']],['remove-curse',['official2014']],
   ['restoration',['official2014','lesser']],['identify',['official2014']],
   ['dispel-effects',[caster,setup]],['remove-curse-effects',[caster,setup]],
   ['restoration-effect',[caster]],['remove-curse-source',[0,1,'actor']]
 ]) {
   w.p2.answers.push(null);
   assert.equal(await w.gm.routing.promptCasting(session,method,...args),null);
 }
 assert.deepEqual(w.errors,[]);assert.equal(w.p2.answers.length,0);
 const forms=w.trace.filter(x=>x[1].startsWith('COUNTERSPELL_PLUS.'));
 assert.equal(forms.length,8);assert.ok(forms.every(x=>x[0]==='p2'));
});

test('selection separates token from actor sheet and defaults the GM to local forms',async()=>{
 const w=await world();
 w.gm.context.canvas.tokens.placeables=[{name:'PC token',document:{uuid:'Scene.s.Token.t'},actor:w.pc}];
 w.gm.answers.push(config=>{
   assert.match(config.content,/<option value="gm" selected>/);
   const userSelect={value:'p2',addEventListener(){}};
   let markup='';
   const itemSelect={value:'',set innerHTML(value){markup=value},get innerHTML(){return markup}};
   config.render(null,{element:{querySelector:selector=>selector.includes('userId')?userSelect:itemSelect}});
   assert.match(markup,/Scene.s.Token.t/);assert.match(markup,/Actor.pc/);
   assert.doesNotMatch(markup,/Actor.npc/);
   return {userId:'p2',actorUuid:'Scene.s.Token.t'};
 });
 const result=await w.gm.routing.selectCastingSession(w.npc,w.item,'counterspell');
 assert.equal(result.userId,'p2');assert.equal(result.actor,w.pc);
});

test('actor without embedded spells can be selected and receives the delegated caster form',async()=>{
 const w=await world();w.pc.items.length=0;
 w.gm.answers.push({userId:'p2',actorUuid:'Actor.pc'});
 const session=await w.gm.routing.selectCastingSession(w.npc,w.item,'counterspell');
 assert.equal(session.actor,w.pc);assert.equal(session.item.uuid,'');
 w.p2.answers.push({...counter,castingSpellName:'Counterspell custom',targetSpellName:'Fireball'});
 const result=await w.gm.routing.promptCasting(session,'counterspell','official2014');
 assert.equal(result.itemName,'Counterspell custom');assert.equal(result.targetSpellName,'Fireball');
 assert.equal(result.actorUuid,'Actor.pc');assert.equal(w.pc.system.spells.spell3.value,3);
 assert.deepEqual(w.errors,[]);
});

test('targeted spell name is entered on the first caster form and carried to GM target setup',async()=>{
 const w=await world();
 w.gm.answers.push(select,config=>{
   assert.match(config.content,/name="castingSpellName"/);
   assert.match(config.content,/name="targetSpellName"/);
   return {...counter,targetSpellName:'Fireball'};
 },config=>{
   assert.match(config.content,/name="spellName" value="Fireball"/);
   return target;
 },review);
 w.p2.answers.push(config=>{
   assert.match(config.content,/name="spellName" value="Fireball"/);
   return fireball;
 });
 await w.gm.workflow.startFromActivity({item:w.item});
 assert.deepEqual(w.errors,[]);assert.equal(w.messages.length,1);
});
