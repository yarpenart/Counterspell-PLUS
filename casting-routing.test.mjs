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
    const answers=[],listeners=[],cache=new Map(),registrations=new Map();
    class MockRoll {
      constructor(formula,data={},options={}) { this.formula=formula;this.data=data;this.options=options;this.dice=[{faces:20,results:[{result:12,active:true}]}]; }
      async evaluate() {
        const kept=this.options.advantage||this.formula.includes('2d20kh')?17:this.options.disadvantage||this.formula.includes('2d20kl')?7:12;
        const minimum=this.options.minimum??Number(this.formula.match(/min(\d+)/)?.[1]??0);
        const prof=this.formula.includes('@prof')?Number(this.data.prof??0)*(this.formula.includes('2 * @prof')?2:1):0;
        this.total=Math.max(kept,minimum)+Number(this.data.slot??0)+Number(this.data.mod??0)+prof;
        trace.push([user.id,'roll',{...this.data},this.formula,{...this.options},this.total]);return this;
      }
      static async toMessage(rolls,data,options) { return rolls[0].toMessage(data,options); }
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
        settings:{get:(_module,key)=>settings[key],register:(_module,key,definition)=>registrations.set(key,definition)},i18n:{localize:k=>k,format:(k,data)=>`${k}:${JSON.stringify(data)}`},
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
    const config=await load('scripts/config.js');await config.evaluate();
    const traits=await load('scripts/roll-traits.js');await traits.evaluate();
    const participants=await load('scripts/participants.js');await participants.evaluate();
    const c={user,context,answers,listeners,routing:routing.namespace,participants:participants.namespace,traits:traits.namespace,config:config.namespace,registrations,workflow:context.game.counterspellPlus};clients.push(c);return c;
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
 w.p2.answers.push(config=>{assert.match(config.content,/name="spellName" value="Fireball"/);assert.doesNotMatch(config.content,/name="slotKey"|name="castingSource"/);return {...fireball,spellName:'Delayed Fireball'}});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
});

test('GM can target an unknown Glyph without an actor, using the target form',async()=>{
 const w=await world();w.gm.answers.push({userId:'gm',actorUuid:''},counter,{...fireball,actorUuid:'special:unknown',sourceType:'glyph',creatorMod:4,creatorProf:3},review);
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);assert.equal(w.messages.length,1);
});

test('remote caster forms are rejected even if requested by a GM',async()=>{
 const w=await world();
 const result=await w.gm.routing.promptCasting({userId:'p2',actor:w.pc,item:w.pc.items[0]},'counterspell','official2014');
 assert.equal(result,null);assert.equal(forms(w).length,0);
 await w.p2.listeners[0]({type:'casting-prompt',recipientId:'p2',senderId:'gm',requestId:'bad',actorUuid:'Actor.pc',spell:{name:'Counterspell'},method:'counterspell',args:['official2014']});
 assert.equal(forms(w).length,0);
});

for (const [kind,api] of [['remove-curse','startRemoveCurseFromActivity']]) test(`${kind}: original 0.5.6 caster and GM flow`,async()=>{
 const w=await world();w.item.name=kind;w.item.system.identifier=kind;
 w.gm.answers.push(counter,{targetUuid:'Actor.pc',effectCount:1,defenseRollMode:'blindroll'}, {spellName:'Curse',spellLevel:4,casterMod:4,casterProf:3}, {}, null);
 await w.gm.workflow[api]({item:w.item});assert.deepEqual(w.errors,[]);
 assert.ok(forms(w).every(x=>x[0]==='gm'));assert.equal(forms(w).length,5);
 assert.ok(!forms(w).some(x=>x[1].includes('Participants.')));
 assert.equal(w.npc.system.spells.spell3.value,3);
});

test('Restoration uses the original 0.5.6 casting, effect choice and GM review flow',async()=>{
 const w=await world();w.item.name='Lesser Restoration';w.item.system.identifier='lesser-restoration';w.item.system.level=2;
 w.gm.answers.push(counter,{effectId:'disease'},null);
 await w.gm.workflow.startRestorationFromActivity({item:w.item},'lesser');assert.deepEqual(w.errors,[]);
 assert.deepEqual(forms(w).map(x=>x[0]),['gm','gm','gm']);
 assert.ok(!forms(w).some(x=>x[1].includes('Participants.')));assert.equal(w.npc.system.spells.spell3.value,3);
});

test('Identify uses the original 0.5.6 caster and GM flow without a recipient form',async()=>{
 const w=await world();w.item.name='Identify';w.item.system.identifier='identify';w.item.system.level=1;
 w.gm.answers.push({castingSource:'ritual',subjectName:'Unknown ring'},null);
 await w.gm.workflow.startIdentifyFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 assert.deepEqual(forms(w).map(x=>x[0]),['gm','gm']);assert.equal(w.p2.answers.length,0);
 assert.ok(!forms(w).some(x=>x[1].includes('Participants.')));
});

test('Homebrew rolls use the initiator and targeted owner separately, after GM corrections',async()=>{
 const w=await world();w.settings.ruleset='homebrew';
 w.gm.answers.push(recipient,counter,{...review,spellLevel:4,targetMod:1});w.p2.answers.push(fireball);
 await w.gm.workflow.startFromActivity({item:w.item});
 assert.deepEqual(w.errors,[]);const rolls=w.trace.filter(x=>x[1]==='roll');
 assert.deepEqual(rolls.map(x=>x[0]),['gm','p2']);assert.equal(rolls[0][2].slot,3);assert.equal(rolls[1][2].slot,4);assert.equal(rolls[1][2].mod,1);
 assert.equal(w.npc.system.spells.spell3.value,2);assert.equal(w.pc.system.spells.spell3.value,3);
});

test('Restoration 0.5.6 review selects the target and consumes only caster slot',async()=>{
 const w=await world();w.item.name='Lesser Restoration';w.item.system.identifier='lesser-restoration';w.item.system.level=2;
 w.gm.answers.push(counter,{effectId:'disease'},{targetUuid:'Actor.pc',effectId:'disease'});
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

test('source counting setting removed; legacy Abjurer setting preserved',async()=>{
 const w=await world();w.gm.config.registerSettings();assert.equal(w.gm.registrations.has('advantageCancellation'),false);assert.equal(w.gm.registrations.get('abjurerEnabled').default,false);
});

test('Counterspell: both rolling sides independently apply disadvantage, Abjurer and minimum',async()=>{
 const w=await world();w.settings.ruleset='homebrew';
 w.gm.answers.push(recipient,{...counter,traitsPresent:'1',disadvantage:true,knowsTargetSpell:true,abjurer:true,specialSpellcaster:true},{...review,knowsTargetSpell:true});
 w.p2.answers.push({...fireball,traitsPresent:'1',disadvantage:true,abjurer:true,specialSpellcaster:true});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 const rolls=w.trace.filter(x=>x[1]==='roll');assert.equal(rolls.length,2);assert.match(rolls[0][3],/^1d20min15/);assert.match(rolls[1][3],/^2d20klmin15/);
 for(const r of rolls) assert.match(r[3],/2 \* @prof/);
});

test('GM can independently change or remove either participant’s declared traits',async()=>{
 const w=await world();w.settings.ruleset='homebrew';w.settings.advantageCancellation='sourceMajority';
 w.gm.answers.push(recipient,{...counter,traitsPresent:'1',advantage:true,abjurer:true,specialSpellcaster:true},{...review,initiatorTraitsPresent:'1',targetTraitsPresent:'1',targetDisadvantage:true,targetDisadvantageSources:2,targetAbjurer:true,targetSpecialSpellcaster:true});
 w.p2.answers.push({...fireball,traitsPresent:'1',advantage:true,advantageSources:3});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 const rolls=w.trace.filter(x=>x[1]==='roll');assert.match(rolls[0][3],/^1d20 \+/);assert.doesNotMatch(rolls[0][3],/min15|2 \* @prof/);
 assert.match(rolls[1][3],/^2d20klmin15/);assert.match(rolls[1][3],/2 \* @prof/);
});

test('system D20Roll receives resolved advantage flags and minimum for both participants',async()=>{
 const w=await world();w.settings.ruleset='homebrew';
 w.gm.context.CONFIG.Dice.D20Roll=w.gm.context.Roll;w.p2.context.CONFIG.Dice.D20Roll=w.p2.context.Roll;
 w.gm.answers.push(recipient,{...counter,traitsPresent:'1',knowsTargetSpell:true,specialSpellcaster:true},{...review,knowsTargetSpell:true});
 w.p2.answers.push({...fireball,traitsPresent:'1',disadvantage:true,specialSpellcaster:true});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 const rolls=w.trace.filter(x=>x[1]==='roll');assert.equal(rolls[0][4].advantage,true);assert.equal(rolls[0][4].disadvantage,false);assert.equal(rolls[0][4].minimum,15);
 assert.equal(rolls[1][4].advantage,false);assert.equal(rolls[1][4].disadvantage,true);assert.equal(rolls[1][4].minimum,15);
});

test('both Counterspell sides and GM review expose all three independent traits even when legacy Abjurer toggle is off',async()=>{
 const w=await world();w.settings.abjurerEnabled=false;
 const check=(content,prefix='')=>{for(const key of ['disadvantage','abjurer','specialSpellcaster']) {
  const name=prefix?prefix+key[0].toUpperCase()+key.slice(1):key;assert.ok(content.includes(`name="${name}"`),name);
 }};
 w.gm.answers.push(recipient,config=>{check(config.content);return counter},config=>{check(config.content,'initiator');check(config.content,'target');return review});
 w.p2.answers.push(config=>{check(config.content);return fireball});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
});

test('fixed Glyph target ignores target roll traits and never creates a defensive d20',async()=>{
 const w=await world();w.settings.ruleset='homebrew';
 w.gm.answers.push({userId:'gm',actorUuid:''},counter,{...fireball,actorUuid:'special:unknown',sourceType:'glyph',creatorMod:4,creatorProf:3,traitsPresent:'1',advantage:true,advantageSources:3,abjurer:true,specialSpellcaster:true},review);
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 assert.equal(w.trace.filter(x=>x[1]==='roll').length,1);
 assert.ok(w.messages.some(m=>m.content?.includes('= <strong>21</strong>')));
});

test('restored workflows and settings match 0.5.6 exactly',async()=>{
 const {execFileSync}=await import('node:child_process');
 for(const file of ['remove-curse-dialogs.js','remove-curse-workflow.js','identify-dialogs.js','identify-workflow.js','restoration-dialogs.js','restoration-workflow.js','restoration-rules.js','config.js'])
 assert.equal(await fs.readFile('scripts/'+file,'utf8'),execFileSync('git',['show','v0.5.6:scripts/'+file],{encoding:'utf8'}),file);
});

for(const special of ['special:unknown','special:object','Actor.pc']) test(`Dispel: player target confirms ${special}; caster keeps own forms and GM reviews both`,async()=>{
 const w=await world();w.settings.dispelRuleset='homebrew';w.settings.dispelSpecialMinimum=15;
 const actor=w.pc,item=actor.items[0];item.name='Dispel Magic';item.system.identifier='dispel-magic';
 w.p1.answers.push({userId:'p2',actorUuid:special}, {...counter,traitsPresent:'1',disadvantage:true,abjurer:true,specialSpellcaster:true});
 w.gm.answers.push(config=>{
  for(const key of ['Disadvantage','Abjurer','SpecialSpellcaster']) {assert.ok(config.content.includes('name="initiator'+key+'"'));assert.ok(config.content.includes('name="target0'+key+'"'));}return {};
 });
 w.p2.answers.push(config=>{
  for(const key of ['disadvantage','abjurer','specialSpellcaster']) assert.ok(config.content.includes('name="'+key+'"'));
  assert.match(config.content,/special:unknown/);assert.match(config.content,/special:object/);assert.doesNotMatch(config.content,/value="Actor.npc"|special:glyph/);
  return {actorUuid:special,sourceType:'spell',spellName:'Bless',spellLevel:4,casterMod:4,casterProf:3,traitsPresent:'1',abjurer:true,specialSpellcaster:true,disadvantage:true};
 });
 await w.p1.workflow.startDispelFromActivity({item});assert.deepEqual(w.errors,[]);
 assert.deepEqual(forms(w).map(f=>f[0]),['p1','p1','p2','gm']);
 const rolls=w.trace.filter(x=>x[1]==='roll');assert.equal(rolls.length,1);assert.equal(rolls[0][0],'p1');assert.match(rolls[0][3],/^2d20klmin15/);assert.match(rolls[0][3],/2 \* @prof/);
 assert.equal(w.pc.system.spells.spell3.value,2);assert.equal(w.npc.system.spells.spell3.value,3);
});

test('Counterspell target submit says Send to GM and pickers use hyphenated type labels',async()=>{
 const w=await world();
 w.gm.answers.push(config=>{assert.match(config.content,/Casting.Actor - npc/);assert.match(config.content,/Participants.Special - COUNTERSPELL_PLUS.Dialog.SpecialUnknown/);assert.doesNotMatch(config.content,/special:object|special:glyph/);return recipient;},counter,review);
 w.p2.answers.push(config=>{assert.equal(config.buttons.find(b=>b.action==='confirm').label,'COUNTERSPELL_PLUS.Dialog.SendToGM');assert.match(config.content,/Casting.Actor - pc/);return fireball;});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
});

test('Dispel initial optional picker offers Object and Unknown; player without actors can use either',async()=>{
 const w=await world();w.p2.context.game.actors=[];
 const picker=w.p2.participants.ownedTargetPicker('',{allowSpecial:true,specialKinds:['unknown','object']});
 assert.equal(picker.entries.length,2);assert.ok(picker.read('special:unknown'));assert.ok(picker.read('special:object'));
 w.p1.answers.push(config=>{assert.match(config.content,/special:object/);assert.match(config.content,/special:unknown/);assert.match(config.content,/Participants.ChooseLater/);return null;});
 await w.p1.participants.selectTargetParticipant({specialKinds:['unknown','object']});assert.deepEqual(w.errors,[]);
});

test('GM-initiated Dispel sends target-only form to player and final correction form back to GM',async()=>{
 const w=await world();
 w.gm.answers.push(recipient,counter,config=>{assert.match(config.content,/Bless/);return null;});
 w.p2.answers.push({actorUuid:'special:object',sourceType:'spell',spellName:'Bless',spellLevel:4,casterMod:4,casterProf:3});
 await w.gm.workflow.startDispelFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 assert.deepEqual(forms(w).map(x=>x[0]),['gm','gm','p2','gm']);assert.equal(w.npc.system.spells.spell3.value,3);
});

test('Dispel target cannot submit a private GM actor and cancellation consumes no slot',async()=>{
 const w=await world();w.gm.answers.push(recipient,counter);
 w.p2.answers.push({actorUuid:'Actor.npc',sourceType:'spell',spellName:'Bless'});
 await w.gm.workflow.startDispelFromActivity({item:w.item});assert.deepEqual(w.errors,[]);assert.equal(w.npc.system.spells.spell3.value,3);assert.equal(w.messages.length,0);
});

test('Dispel initial knowledge reaches final GM review without a return form and applies the DC reduction',async()=>{
 const w=await world();w.settings.dispelRuleset='homebrew';
 w.gm.answers.push(recipient, config=>{assert.match(config.content,/name="knowsTargetSpell"/);return {...counter,knowsTargetSpell:true};}, config=>{assert.match(config.content,/name="known0" checked/);return {known0:true};});
 w.p2.answers.push(config=>{assert.equal(config.buttons.find(b=>b.action==='confirm').label,'COUNTERSPELL_PLUS.Dialog.SendToGM');return {actorUuid:'Actor.pc',sourceType:'spell',spellName:'Bless',spellLevel:4,casterMod:4,casterProf:3,defenseRollMode:'blindroll'};});
 await w.gm.workflow.startDispelFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 assert.deepEqual(forms(w).map(x=>x[0]),['gm','gm','p2','gm']);assert.equal(w.npc.system.spells.spell3.value,2);
 assert.ok(w.messages.some(m=>m.content?.includes('16')));
});

test('Dispel multiple target effects preserve separate GM knowledge corrections and stop on cancellation',async()=>{
 const w=await world();w.settings.dispelRuleset='homebrew';
 w.gm.answers.push(recipient,{...counter,effectCount:2,knowsTargetSpell:true},config=>{assert.match(config.content,/name="known0" checked/);assert.match(config.content,/name="known1" checked/);return null;});
 for(const name of ['Bless','Haste'])w.p2.answers.push({actorUuid:'Actor.pc',sourceType:'spell',spellName:name,spellLevel:3,casterMod:4,casterProf:3});
 await w.gm.workflow.startDispelFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 assert.deepEqual(forms(w).map(x=>x[0]),['gm','gm','p2','p2','gm']);assert.equal(w.npc.system.spells.spell3.value,3);
});

test('selection names use Actor instead of Character sheet in English',async()=>{
 const lang=JSON.parse(await fs.readFile('lang/en.json','utf8')).COUNTERSPELL_PLUS;
 assert.equal(lang.Casting.Actor,'Actor');assert.doesNotMatch(JSON.stringify(lang.Casting)+JSON.stringify(lang.Participants),/character sheet/i);
});
