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
]) test(`${kind}: caster keeps own forms; source details go to the designated reviewer; GM reviews last`,async()=>{
 const w=await world();w.item.name=kind;w.item.system.identifier=kind;
 w.gm.answers.push(recipient,counter,{targetUuid:'special:unknown',effectCount:1,defenseRollMode:'blindroll'},{},null);
 const source={actorUuid:'Actor.pc',sourceType:'spell',spellName:'Bless',spellLevel:1,casterMod:4,casterProf:3};
 if(kind==='remove-curse') w.gm.answers.splice(3,0,source); else w.p2.answers.push(source);
 await w.gm.workflow[api]({item:w.item});assert.deepEqual(w.errors,[]);
 const f=forms(w);const received=f.filter(x=>x[0]==='p2');assert.equal(received.length,kind==='remove-curse'?0:1);
 const sourceForm=f.find(x=>x[1].includes(effectTitle));assert.ok(sourceForm);assert.equal(sourceForm[0],kind==='remove-curse'?'gm':'p2');
 assert.doesNotMatch(sourceForm[2],/name="slotKey"/);
 assert.equal(f.at(-1)[0],'gm');assert.ok(f.at(-1)[1].includes(reviewTitle));assert.match(f.at(-1)[2],kind==='remove-curse'?/CurseItem/:/pc/);
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

test('world setting defaults to 2014 cancellation; Restoration settings retain their legacy defaults',async()=>{
 const w=await world();w.gm.config.registerSettings();
 const setting=w.gm.registrations.get('advantageCancellation');
 assert.equal(setting.default,'official2014');assert.equal(setting.scope,'world');assert.equal(setting.restricted,true);
 assert.ok(Object.hasOwn(setting.choices,'sourceMajority'));
 assert.equal(w.gm.registrations.get('abjurerEnabled').default,false);
});

test('2014 cancellation ignores source majority; optional homebrew compares counts',async()=>{
 const w=await world();const resolve=w.gm.traits.resolveD20Options;
 for (const [a,d,official,majority] of [[0,0,'normal','normal'],[3,0,'adv','adv'],[0,3,'dis','dis'],[2,1,'normal','adv'],[1,2,'normal','dis'],[3,3,'normal','normal']]) {
  const flags={advantage:a>0,advantageSources:a,disadvantage:d>0,disadvantageSources:d};
  const mode=o=>o.advantage?'adv':o.disadvantage?'dis':'normal';
  w.settings.advantageCancellation='official2014';assert.equal(mode(resolve(flags)),official);
  w.settings.advantageCancellation='sourceMajority';assert.equal(mode(resolve(flags)),majority);
 }
});

test('unchecked fields clear previous traits; source counts alone never enable advantage',async()=>{
 const w=await world();const read=w.gm.traits.readRollTraits;
 const traits=read({initiatorTraitsPresent:'1',initiatorAdvantage:false,initiatorAdvantageSources:8},'initiator',{advantage:true,abjurer:true,specialSpellcaster:true});
 assert.equal(traits.advantage,false);assert.equal(traits.advantageSources,0);assert.equal(traits.abjurer,false);assert.equal(traits.specialSpellcaster,false);
 const mixed=read({traitsPresent:'1',advantage:true,advantageSources:3,disadvantage:true,disadvantageSources:2});
 assert.equal(mixed.advantageSources,3);assert.equal(mixed.disadvantageSources,2);
});

for (const mode of ['official2014','sourceMajority']) test(`Counterspell ${mode}: knowledge counts once and each side has its own Abjurer and minimum`,async()=>{
 const w=await world();w.settings.ruleset='homebrew';w.settings.advantageCancellation=mode;
 w.gm.answers.push(recipient,{...counter,traitsPresent:'1',advantage:true,advantageSources:1,disadvantage:true,disadvantageSources:1,knowsTargetSpell:true,abjurer:true,specialSpellcaster:true},{...review,spellLevel:4,knowsTargetSpell:true});
 w.p2.answers.push({...fireball,traitsPresent:'1',advantage:true,advantageSources:5,abjurer:true,specialSpellcaster:true});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 const rolls=w.trace.filter(x=>x[1]==='roll');assert.equal(rolls.length,2);
 assert.match(rolls[0][3],mode==='sourceMajority'?/2d20khmin15/:/1d20min15/);
 assert.match(rolls[1][3],/2d20khmin15/);assert.doesNotMatch(rolls[1][3],/[3-9]d20/);
 assert.match(rolls[0][3],/2 \* @prof/);assert.match(rolls[1][3],/2 \* @prof/);
 assert.equal(rolls[0][0],'gm');assert.equal(rolls[1][0],'p2');
});

test('known spell plus another advantage source still rolls only 2d20',async()=>{
 const w=await world();w.settings.ruleset='homebrew';
 w.gm.answers.push(recipient,{...counter,traitsPresent:'1',advantage:true,advantageSources:1,knowsTargetSpell:true},{...review,knowsTargetSpell:true});w.p2.answers.push(fireball);
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 assert.match(w.trace.find(x=>x[1]==='roll')[3],/^2d20kh/);
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
 w.gm.answers.push(recipient,{...counter,traitsPresent:'1',advantage:true,specialSpellcaster:true},review);
 w.p2.answers.push({...fireball,traitsPresent:'1',disadvantage:true,specialSpellcaster:true});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 const rolls=w.trace.filter(x=>x[1]==='roll');assert.equal(rolls[0][4].advantage,true);assert.equal(rolls[0][4].disadvantage,false);assert.equal(rolls[0][4].minimum,15);
 assert.equal(rolls[1][4].advantage,false);assert.equal(rolls[1][4].disadvantage,true);assert.equal(rolls[1][4].minimum,15);
});

for (const [kind,api] of [['dispel','startDispelFromActivity'],['remove-curse','startRemoveCurseFromActivity']]) test(`${kind}: advantage and minimum apply to caster checks while target defenses remain fixed`,async()=>{
 const w=await world();w.settings[kind==='dispel'?'dispelRuleset':'removeCurseRuleset']='homebrew';
 w.settings[kind==='dispel'?'dispelSpecialMinimum':'removeCurseSpecialMinimum']=15;
 w.gm.answers.push(recipient,{...counter,traitsPresent:'1',advantage:true,abjurer:true,specialSpellcaster:true}, {targetUuid:'special:unknown',effectCount:1,defenseRollMode:'publicroll'}, {known0:false}, {});
 const source={actorUuid:'Actor.pc',sourceType:'spell',spellName:'Bless',spellLevel:1,casterMod:4,casterProf:3,traitsPresent:'1',advantage:true,abjurer:true,specialSpellcaster:true};
 if(kind==='remove-curse') w.gm.answers.splice(3,0,source); else w.p2.answers.push(source);
 await w.gm.workflow[api]({item:w.item});assert.deepEqual(w.errors,[]);
 const rolls=w.trace.filter(x=>x[1]==='roll');assert.equal(rolls.length,1);assert.equal(rolls[0][0],'gm');assert.match(rolls[0][3],/^2d20khmin15/);assert.match(rolls[0][3],/2 \* @prof/);
});

test('both Counterspell sides and GM review expose all four independent traits even when legacy Abjurer toggle is off',async()=>{
 const w=await world();w.settings.abjurerEnabled=false;
 const check=(content,prefix='')=>{for(const key of ['advantage','disadvantage','abjurer','specialSpellcaster']) {
  const name=prefix?prefix+key[0].toUpperCase()+key.slice(1):key;assert.ok(content.includes(`name="${name}"`),name);
 }};
 w.gm.answers.push(recipient,config=>{check(config.content);return counter},config=>{check(config.content,'initiator');check(config.content,'target');return review});
 w.p2.answers.push(config=>{check(config.content);return fireball});
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
});

test('fixed Glyph target ignores target roll traits and never creates a defensive d20',async()=>{
 const w=await world();w.settings.ruleset='homebrew';
 w.gm.answers.push({userId:'gm',actorUuid:''},counter,{...fireball,actorUuid:'special:glyph',sourceType:'glyph',creatorMod:4,creatorProf:3,traitsPresent:'1',advantage:true,advantageSources:3,abjurer:true,specialSpellcaster:true},review);
 await w.gm.workflow.startFromActivity({item:w.item});assert.deepEqual(w.errors,[]);
 assert.equal(w.trace.filter(x=>x[1]==='roll').length,1);
 assert.ok(w.messages.some(m=>m.content?.includes('= <strong>21</strong>')));
});

for (const initiator of ['gm','p1']) for (const itemMode of ['name','inventory']) test(`Remove Curse ${initiator} → player: GM alone fills curse and ${itemMode} target survives review`,async()=>{
 const w=await world();const actor=initiator==='gm'?w.npc:w.pc;
 const item=actor.items[0];item.name='Remove Curse';item.system.identifier='remove-curse';
 const ring={uuid:'Actor.pc.Item.ring',name:'Cursed ring',type:'equipment'};w.pc.items.push(ring);w.documents.set(ring.uuid,ring);
 w[initiator].answers.push(recipient,counter);
 w.gm.answers.push(config=>{assert.match(config.content,/name="targetItemName"/);assert.match(config.content,/name="targetItemUuid"/);return {targetUuid:'Actor.pc',targetItemName:'Cursed ring',targetItemUuid:itemMode==='inventory'?ring.uuid:'',effectCount:1,defenseRollMode:'blindroll'};},
 {sourceType:'spell',spellName:'Curse',spellLevel:4,casterMod:4,casterProf:3});
 w[initiator].answers.push({});
 w.gm.answers.push(config=>{assert.match(config.content,/Cursed ring/);return {};});
 await w[initiator].workflow.startRemoveCurseFromActivity({item});assert.deepEqual(w.errors,[]);
 assert.equal(forms(w).filter(x=>x[0]==='p2').length,0);
 assert.equal(forms(w).find(x=>x[1].includes('RemoveCurse.Dialog.GMEffectTitle'))[0],'gm');
 assert.equal(actor.system.spells.spell3.value,2);
 assert.ok(w.messages.some(m=>m.content?.includes('Cursed ring')));
});
