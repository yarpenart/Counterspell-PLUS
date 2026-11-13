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
  actors.contents=actors;
  const settings={dispelRuleset:"official2014",removeCurseRuleset:"official2014",restorationRuleset:"official2014",identifyRuleset:"official2014",lesserRestorationNames:"Lesser Restoration",greaterRestorationNames:"Greater Restoration",enabled:true,dispelEnabled:true,removeCurseEnabled:true,identifyEnabled:true,restorationEnabled:true,
    ruleset:'official2014',includeProficiency:true,abjurerEnabled:true,counterspellNames:'Counterspell',counterspellSpecialMinimum:15,rollMode:'publicroll'};
  let serial=0;
  async function client(user) {
    const answers=[],listeners=[],cache=new Map();
    class MockRoll {
      constructor(formula,data={}) { this.formula=formula;this.data=data;this.dice=[{faces:20,results:[{result:12,active:true}]}]; }
      async evaluate() { this.total=12+Number(this.data.slot??0)+Number(this.data.mod??0)+Number(this.data.prof??0);trace.push([user.id,'roll',{...this.data}]);return this; }
      async toMessage(messageData,options) { messages.push({...messageData,...options}); }
    }
    const context=vm.createContext({ Roll:MockRoll, console:{debug(){},log(){},error(...args){errors.push(args)}},setTimeout,clearTimeout,queueMicrotask,
      window:{setTimeout,clearTimeout},CONST:{DOCUMENT_OWNERSHIP_LEVELS:{OWNER:3}},CONFIG:{DND5E:{abilities:{}},Dice:{}},
      fromUuidSync:id=>documents.get(id),canvas:{tokens:{placeables:[]}},
      ui:{notifications:{warn:s=>trace.push([user.id,'warning',s]),error:s=>errors.push(s),info(){}}},
      ChatMessage:{getSpeaker:({actor})=>({actor:actor.id}),applyRollMode(){},async create(data){messages.push(data)}},
      foundry:{utils:{escapeHTML:s=>String(s),randomID:()=>`r${++serial}`},applications:{api:{DialogV2:{async wait(config){
        trace.push([user.id,config.window.title,config.content]);
        assert.ok(answers.length,`Unexpected form for ${user.id}: ${config.window.title}`);
        const answer=answers.shift(); return typeof answer==='function'?answer(config):answer;
      }}}}},
      Hooks:{on(){},once(){}},game:{user,users,actors,items:{contents:[]},modules:new Map([['counterspell-plus',{version:'0.5.9'}]]),
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
    for (const [file,initializer] of [['dispel-workflow.js','initializeDispelWorkflow'],['remove-curse-workflow.js','initializeRemoveCurseWorkflow'],['restoration-workflow.js','initializeRestorationWorkflow'],['identify-workflow.js','initializeIdentifyWorkflow']]) {
      const mod=await load('scripts/'+file);await mod.evaluate();mod.namespace[initializer]();
    }
    const participants=await load('scripts/participants.js');await participants.evaluate();
    const c={user,context,answers,listeners,routing:routing.namespace,participants:participants.namespace,workflow:context.game.counterspellPlus};clients.push(c);return c;
  }
  const gm=await client(users[0]),p1=await client(users[1]),p2=await client(users[2]);
  return {gm,p1,p2,pc,npc,item,documents,users,trace,errors,messages,settings};
}
const recipient={userId:'p2',actorUuid:''};
const counter={castingSource:'spell',slotKey:'spell3',ability:'int',rollMode:'publicroll',targetSpellName:'Fireball'};
const fireball={actorUuid:'Actor.pc',spellName:'Fireball',spellLevel:4,ability:'int',rollMode:'blindroll',sourceType:'spell'};
const review={counterAbilityMod:4,counterProficiency:3,spellName:'Fireball',spellLevel:3,targetMod:5,targetProf:3};
const forms=w=>w.trace.filter(x=>x[1].startsWith('COUNTERSPELL_PLUS.')&&x[1]!=='warning');

test('GM keeps Counterspell; selected player receives only target form; GM reviews both last',async()=>{
 const w=await world();w.gm.answers.push(recipient,counter,config=>{
   assert.match(config.content,/Fireball/);assert.match(config.content,/value="4" selected/);return review;
 });w.p2.answers.push(fireball);
 await w.gm.workflow.startFromActivity({item:w.item});
 assert.deepEqual(w.errors,[]);assert.equal(w.npc.system.spells.spell3.value,2);assert.equal(w.pc.system.spells.spell3.value,3);
 assert.deepEqual(forms(w).map(x=>[x[0],x[1]]),[
  ['gm','COUNTERSPELL_PLUS.Participants.ChooseRecipient'],['gm','COUNTERSPELL_PLUS.Dialog.CounterspellerTitle'],
  ['p2','COUNTERSPELL_PLUS.Dialog.TargetPlayerTitle'],['gm','COUNTERSPELL_PLUS.Dialog.GMReviewTitle']]);
 assert.equal(w.messages.length,1);
});

test('player can target GM without seeing GM cards, and keeps their own Counterspell form',async()=>{
 const w=await world();w.p1.answers.push(config=>{
  assert.match(config.content,/<option value="gm" selected>/);return {userId:'gm',actorUuid:''};
 },counter);w.gm.answers.push({...fireball,actorUuid:'Actor.npc'},review);
 await w.p1.workflow.startFromActivity({item:w.pc.items[0]});
 assert.deepEqual(w.errors,[]);assert.equal(w.pc.system.spells.spell3.value,2);assert.equal(w.npc.system.spells.spell3.value,3);
 assert.deepEqual(forms(w).map(x=>x[0]),['p1','p1','gm','gm']);
 assert.ok(!forms(w).some(x=>x[0]==='gm'&&x[1].endsWith('CounterspellerTitle')));
});

test('recipient confirms a different owned character than the optional suggestion',async()=>{
 const w=await world();const other={...w.pc,id:'other',uuid:'Actor.other',name:'Other character'};
 w.gm.context.game.actors.push(other);w.documents.set(other.uuid,other);
 w.gm.answers.push({userId:'p2',actorUuid:'Actor.pc'},counter,config=>{assert.match(config.content,/Other character/);return review});
 w.p2.answers.push({...fireball,actorUuid:other.uuid});await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
});

test('first picker allows no character and does not require an embedded target spell',async()=>{
 const w=await world();w.pc.items.length=0;
 w.gm.answers.push(recipient,counter,review);w.p2.answers.push(fireball);
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);assert.equal(w.messages.length,1);
 const picker=forms(w)[0][2];assert.doesNotMatch(picker,/name="actorUuid"[^>]*required/);
});

test('privacy: initiator sees visible GM tokens, never unowned actor cards or hidden tokens',async()=>{
 const w=await world();const token={name:'Visible enemy',actor:w.npc,visible:true,document:{uuid:'Scene.s.Token.t',hidden:false}};
 w.p1.context.canvas.tokens.placeables=[token,{...token,name:'Secret enemy',document:{uuid:'Scene.s.Token.secret',hidden:true}}];
 const entries=w.p1.participants.participantEntries(w.users[0]);
 assert.ok(entries.some(e=>e.key==='Scene.s.Token.t'));
 assert.ok(!entries.some(e=>e.key==='Actor.npc'||e.key==='Scene.s.Token.secret'));
 const owned=w.p1.participants.ownedTargetPicker();assert.ok(!owned.html.includes('npc'));assert.ok(!owned.html.includes('Secret enemy'));
});

test('forged private actor selection is rejected before sending a request',async()=>{
 const w=await world();w.p1.answers.push({userId:'gm',actorUuid:'Actor.npc'});
 assert.equal(await w.p1.participants.selectTargetParticipant(),null);
 assert.ok(!w.trace.some(x=>x[1]==='socket'));assert.equal(w.pc.system.spells.spell3.value,3);
});

test('target cannot confirm an unowned actor; resolution and slot consumption stop',async()=>{
 const w=await world();w.gm.answers.push(recipient,counter);w.p2.answers.push({...fireball,actorUuid:'Actor.npc'});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);assert.equal(w.npc.system.spells.spell3.value,3);assert.equal(w.messages.length,0);
});

test('target cancellation stops before final review or consumption',async()=>{
 const w=await world();w.gm.answers.push(recipient,counter);w.p2.answers.push(null);
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);assert.equal(w.npc.system.spells.spell3.value,3);
 assert.ok(!forms(w).some(x=>x[1].endsWith('GMReviewTitle')));
});

test('targeted name is carried from acting form to target form and remains editable',async()=>{
 const w=await world();w.gm.answers.push(recipient,config=>{
  assert.match(config.content,/name="targetSpellName"/);assert.match(config.content,/Participants.CastingSpellName/);return counter;
 },config=>{assert.match(config.content,/Delayed Fireball/);return review});
 w.p2.answers.push(config=>{assert.match(config.content,/name="spellName" value="Fireball"/);assert.doesNotMatch(config.content,/name="slotKey"|name="castingSource"|name="abjurer"/);return {...fireball,spellName:'Delayed Fireball'}});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
});

test('GM can target an unknown Glyph without an actor, using the target form',async()=>{
 const w=await world();w.gm.answers.push({userId:'gm',actorUuid:''},counter,{...fireball,actorUuid:'special:glyph',sourceType:'glyph',creatorMod:4,creatorProf:3},review);
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);assert.equal(w.messages.length,1);
});

test('remote caster forms are rejected even if requested by a GM',async()=>{
 const w=await world();
 const result=await w.gm.routing.promptCasting({userId:'p2',actor:w.pc,item:w.pc.items[0]},'counterspell','official2014');
 assert.equal(result,null);assert.equal(forms(w).length,0);
 await w.p2.listeners[0]({type:'casting-prompt',recipientId:'p2',senderId:'gm',requestId:'bad',actorUuid:'Actor.pc',spell:{name:'Counterspell'},method:'counterspell',args:['official2014']});
 assert.equal(forms(w).length,0);
});

for (const [kind,api,setupTitle,effectTitle,reviewTitle] of [
 ['dispel','startDispelFromActivity','Dispel.Dialog.GMSetupTitle','Dispel.Dialog.GMEffectTitle','Dispel.Dialog.GMReviewTitle'],
 ['remove-curse','startRemoveCurseFromActivity','RemoveCurse.Dialog.GMSetupTitle','RemoveCurse.Dialog.GMEffectTitle','RemoveCurse.Dialog.GMReviewTitle']
]) test(`${kind}: initiator retains casting and knowledge forms; target confirms own spell and character; GM reviews last`,async()=>{
 const w=await world();w.item.name=kind;w.item.system.identifier=kind;
 w.gm.answers.push(recipient,counter,{targetUuid:'special:unknown',effectCount:1,defenseRollMode:'blindroll'},{},null);
 w.p2.answers.push({actorUuid:'Actor.pc',sourceType:'spell',spellName:'Bless',spellLevel:1,casterMod:4,casterProf:3});
 await w.gm.workflow[api]({item:w.item});assert.deepEqual(w.errors,[]);
 const f=forms(w);const received=f.filter(x=>x[0]==='p2');assert.equal(received.length,1);assert.ok(received[0][1].includes(effectTitle));
 assert.match(received[0][2],/name="actorUuid"/);assert.doesNotMatch(received[0][2],/name="slotKey"|name="abjurer"/);
 assert.equal(f.at(-1)[0],'gm');assert.ok(f.at(-1)[1].includes(reviewTitle));assert.match(f.at(-1)[2],/pc/);
 assert.equal(w.npc.system.spells.spell3.value,3);
});

test('Restoration target confirms their character without receiving the casting form',async()=>{
 const w=await world();w.item.name='Lesser Restoration';w.item.system.identifier='lesser-restoration';w.item.system.level=2;
 w.gm.answers.push(recipient,counter,{effectId:'disease'},null);w.p2.answers.push({actorUuid:'Actor.pc'});
 await w.gm.workflow.startRestorationFromActivity({item:w.item},'lesser');assert.deepEqual(w.errors,[]);
 assert.deepEqual(forms(w).map(x=>x[0]),['gm','gm','gm','p2','gm']);
 assert.equal(forms(w).filter(x=>x[0]==='p2')[0][1],'COUNTERSPELL_PLUS.Participants.ConfirmTarget');
 assert.match(forms(w).at(-1)[2],/pc/);assert.equal(w.npc.system.spells.spell3.value,3);
});

test('Identify target selects their character and item; initiator remains the identifier',async()=>{
 const w=await world();w.item.name='Identify';w.item.system.identifier='identify';w.item.system.level=1;
 w.gm.answers.push(recipient,{castingSource:'ritual',subjectName:'Unknown ring'},config=>{assert.match(config.content,/Silver ring/);return null});
 w.p2.answers.push({actorUuid:'Actor.pc',subjectName:'Silver ring',subjectItemUuid:''});
 await w.gm.workflow.startIdentifyFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 assert.deepEqual(forms(w).map(x=>x[0]),['gm','gm','p2','gm']);assert.equal(w.npc.system.spells.spell3.value,3);
});

test('Homebrew rolls use the initiator and targeted owner separately, after GM corrections',async()=>{
 const w=await world();w.settings.ruleset='homebrew';
 w.gm.answers.push(recipient,counter,{...review,spellLevel:4,targetMod:1});w.p2.answers.push(fireball);
 await w.gm.workflow.startFromActivity({item:w.item});
 assert.deepEqual(w.errors,[]);const rolls=w.trace.filter(x=>x[1]==='roll');
 assert.deepEqual(rolls.map(x=>x[0]),['gm','p2']);assert.equal(rolls[0][2].slot,3);assert.equal(rolls[1][2].slot,4);assert.equal(rolls[1][2].mod,1);
 assert.equal(w.npc.system.spells.spell3.value,2);assert.equal(w.pc.system.spells.spell3.value,3);
});

test('Restoration final review preselects confirmed target and consumes only original caster slot',async()=>{
 const w=await world();w.item.name='Lesser Restoration';w.item.system.identifier='lesser-restoration';w.item.system.level=2;
 w.gm.answers.push(recipient,counter,{effectId:'disease'},config=>{
  assert.match(config.content,/<option value="Actor.pc" selected>/);return {targetUuid:'Actor.pc',effectId:'disease'};
 });w.p2.answers.push({actorUuid:'Actor.pc'});
 await w.gm.workflow.startRestorationFromActivity({item:w.item},'lesser');
 assert.deepEqual(w.errors,[]);assert.equal(w.npc.system.spells.spell3.value,2);assert.equal(w.pc.system.spells.spell3.value,3);
 assert.ok(w.messages.some(m=>m.content?.includes('pc')));
});

test('repeated activity while first recipient picker is open does not open a second workflow',async()=>{
 const w=await world();let finish;
 w.gm.answers.push(()=>new Promise(resolve=>{finish=resolve}));
 const first=w.gm.workflow.startFromActivity({item:w.item});
 await new Promise(resolve=>setImmediate(resolve));
 await w.gm.workflow.startFromActivity({item:w.item});
 assert.equal(forms(w).length,1);finish(null);await first;
 assert.equal(w.npc.system.spells.spell3.value,3);assert.deepEqual(w.errors,[]);
});
