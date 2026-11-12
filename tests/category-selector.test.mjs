import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window={location:{protocol:'http:',hash:'#perfil'},scrollY:516,localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
const {categorySelectionHtml,categorySelectionLists,createCategorySelection,moveCategorySelection,saveCategorySelection}=await import('../assets/js/controllers/exhibitor.controller.js');

const categories=[
 {id:'11111111-1111-1111-1111-111111111111',name:'Cerâmica'},
 {id:'22222222-2222-2222-2222-222222222222',name:'Ilustração'},
 {id:'33333333-3333-3333-3333-333333333333',name:'Moda'},
];
const selected=[categories[1]];

function buttonFixture(){const classes=new Set();return {disabled:false,textContent:'Salvar categorias',classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)},classes};}

test('category selector loads all available and previously selected categories',()=>{
 const state=createCategorySelection(categories,selected);const lists=categorySelectionLists(state);
 assert.deepEqual(lists.available.map(item=>item.name),['Cerâmica','Moda']);assert.deepEqual(lists.selected.map(item=>item.name),['Ilustração']);
});

test('category selector moves multiple categories between containers',()=>{
 const state=createCategorySelection(categories,selected);
 assert.equal(moveCategorySelection(state,categories[0].id,true),true);assert.equal(moveCategorySelection(state,categories[2].id,true),true);
 assert.deepEqual(categorySelectionLists(state).selected.map(item=>item.name),['Cerâmica','Ilustração','Moda']);
 assert.equal(moveCategorySelection(state,categories[1].id,false),true);assert.deepEqual(categorySelectionLists(state).selected.map(item=>item.name),['Cerâmica','Moda']);
});

test('category selector prevents duplicates and rejects unknown category ids',()=>{
 const state=createCategorySelection([...categories,categories[0]],[...selected,selected[0]]);
 moveCategorySelection(state,categories[1].id,true);assert.equal(state.categories.length,3);assert.equal(state.selectedIds.size,1);
 assert.equal(moveCategorySelection(state,'unknown',true),false);assert.equal(state.selectedIds.has('unknown'),false);
});

test('category selector exposes accessible actions and empty states',()=>{
 assert.match(categorySelectionHtml([categories[0]],false),/aria-label="Adicionar categoria Cerâmica"/);
 assert.match(categorySelectionHtml([],false),/Nenhuma categoria disponível/);assert.match(categorySelectionHtml([],true),/Nenhuma categoria selecionada/);
});

test('saving categories sends only the selected category ids and preserves navigation',async()=>{
 const state=createCategorySelection(categories,selected);moveCategorySelection(state,categories[0].id,true);const button=buttonFixture();const calls=[];const feedback={};let confirmation;
 const result=await saveCategorySelection({button,feedback,state,request:async(...args)=>calls.push(args),notify:(_target,message,success)=>{confirmation={message,success};}});
 assert.equal(result,true);assert.deepEqual(calls,[['/me/exhibitor',{method:'PATCH',body:{categoryIds:[categories[0].id,categories[1].id]}}]]);assert.deepEqual(confirmation,{message:'Categorias salvas com sucesso.',success:true});
 assert.equal(button.disabled,false);assert.equal(button.textContent,'Salvar categorias');assert.equal(button.classes.has('is-loading'),false);assert.equal(window.location.hash,'#perfil');assert.equal(window.scrollY,516);
});

test('saving an empty category selection sends an empty list',async()=>{
 const state=createCategorySelection(categories,[]);const button=buttonFixture();let payload;
 await saveCategorySelection({button,feedback:{},state,request:async(_path,options)=>{payload=options.body;},notify:()=>{}});
 assert.deepEqual(payload,{categoryIds:[]});
});

test('a category save failure keeps the current selection and restores the button',async()=>{
 const state=createCategorySelection(categories,selected);moveCategorySelection(state,categories[2].id,true);const before=[...state.selectedIds];const button=buttonFixture();let message;
 const result=await saveCategorySelection({button,feedback:{},state,request:async()=>{throw Error('Categorias indisponíveis');},notify:(_target,value)=>{message=value;}});
 assert.equal(result,false);assert.deepEqual([...state.selectedIds],before);assert.equal(message,'Categorias indisponíveis');assert.equal(button.disabled,false);assert.equal(button.textContent,'Salvar categorias');
});

test('category save ignores duplicate submissions while loading',async()=>{
 const state=createCategorySelection(categories,selected);const button=buttonFixture();button.disabled=true;let calls=0;
 const result=await saveCategorySelection({button,feedback:{},state,request:async()=>{calls+=1;},notify:()=>{}});
 assert.equal(result,false);assert.equal(calls,0);
});
