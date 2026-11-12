import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window={location:{protocol:'http:',hash:'#perfil'},scrollY:684,localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
const { profileUpdatePayload, toggleProfileVisibility }=await import('../assets/js/controllers/exhibitor.controller.js');

function fixture(visibility){
 const classes=new Set();const controlClasses=new Set();const control={classList:{add:value=>controlClasses.add(value),remove:value=>controlClasses.delete(value),contains:value=>controlClasses.has(value)}};
 const attributes=new Map([['aria-checked',String(visibility==='PUBLIC')]]);
 const button={dataset:{visibility},disabled:false,classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)},setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name),closest:()=>control};
 return {button,stateLabel:{textContent:visibility==='PUBLIC'?'Público':'Privado'},statValue:{textContent:''},publicLink:{hidden:true},feedback:{},classes,controlClasses};
}

test('visibility toggle activates a private profile using only profileVisibility',async()=>{
 const ui=fixture('PRIVATE');const calls=[];const notices=[];
 await toggleProfileVisibility({...ui,profileStatus:'APPROVED',request:async(...args)=>calls.push(args),notify:(...args)=>notices.push(args)});
 assert.deepEqual(calls,[['/me/exhibitor',{method:'PATCH',body:{profileVisibility:'PUBLIC'}}]]);
 assert.equal(ui.button.dataset.visibility,'PUBLIC');assert.equal(ui.button.getAttribute('aria-checked'),'true');assert.equal(ui.stateLabel.textContent,'Público');assert.equal(ui.statValue.textContent,'Público');assert.equal(ui.publicLink.hidden,false);
 assert.equal(ui.button.disabled,false);assert.equal(ui.classes.has('is-loading'),false);assert.equal(notices[0][2],true);assert.equal(window.location.hash,'#perfil');assert.equal(window.scrollY,684);
});

test('visibility toggle deactivates a public profile',async()=>{
 const ui=fixture('PUBLIC');let payload;
 await toggleProfileVisibility({...ui,profileStatus:'APPROVED',request:async(_path,options)=>{payload=options.body;},notify:()=>{}});
 assert.deepEqual(payload,{profileVisibility:'PRIVATE'});assert.equal(ui.button.getAttribute('aria-checked'),'false');assert.equal(ui.stateLabel.textContent,'Privado');assert.equal(ui.statValue.textContent,'Privado');assert.equal(ui.publicLink.hidden,true);
});

test('visibility toggle reverts its UI when the API fails',async()=>{
 const ui=fixture('PRIVATE');let message;
 await toggleProfileVisibility({...ui,profileStatus:'PENDING',request:async()=>{throw Error('Falha controlada');},notify:(_target,value)=>{message=value;}});
 assert.equal(ui.button.dataset.visibility,'PRIVATE');assert.equal(ui.button.getAttribute('aria-checked'),'false');assert.equal(ui.stateLabel.textContent,'Privado');assert.equal(ui.statValue.textContent,'Privado');assert.equal(message,'Falha controlada');assert.equal(ui.button.disabled,false);
});

test('visibility toggle ignores duplicate activation while disabled',async()=>{
 const ui=fixture('PRIVATE');ui.button.disabled=true;let calls=0;
 await toggleProfileVisibility({...ui,profileStatus:'APPROVED',request:async()=>{calls+=1;},notify:()=>{}});
 assert.equal(calls,0);assert.equal(ui.button.dataset.visibility,'PRIVATE');
});

test('the full profile form payload remains separate from profile visibility and categories',()=>{
 const data={displayName:'Ateliê',contactName:'Ana',phone:'15999999999',city:'Sorocaba',state:'SP',bio:'Bio',instagram:'https://example.test/ana',website:'https://example.test'};
 const payload=profileUpdatePayload(data,null,{social_links:{facebook:'https://example.test/facebook'}});
 assert.equal(Object.hasOwn(payload,'profileVisibility'),false);assert.equal(Object.hasOwn(payload,'categoryIds'),false);assert.equal(payload.displayName,'Ateliê');assert.equal(payload.socialLinks.facebook,'https://example.test/facebook');
});
