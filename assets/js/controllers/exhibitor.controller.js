import { api } from '../models/api.model.js';
import { escapeHtml as h, field, status, label, date, notice, busy, bindForm, openDialog } from '../ui.js';
import { viewApplication } from './application.controller.js';

const finalApplicationLabels = { APPROVED:'Candidatura aprovada', CONFIRMED:'Candidatura aprovada', DECLINED:'Candidatura recusada', REJECTED:'Candidatura recusada', WAITLISTED:'Lista de espera' };

export function openEditionApplicationState(application, editionId) {
 const parameters=new URLSearchParams({edicao:editionId});
 if(!application)return {label:'Inscrever-se',href:`inscricao-expositor.html?${parameters}`,kind:'primary'};
 parameters.set('inscricao',application.id);
 const href=`inscricao-expositor.html?${parameters}`;
 if(application.status==='DRAFT')return {label:'Continuar inscrição',href,kind:'primary'};
 return {label:finalApplicationLabels[application.status]||label(application.status),kind:'status',status:application.status};
}

function summarized(value,max=220){const text=String(value||'').trim();return text.length>max?`${text.slice(0,max-1).trimEnd()}…`:text;}
function locationText(location){return [location?.name,location?.address_line,location?.city,location?.state].filter(Boolean).join(' · ')||'Local a definir';}
function editionApplication(applications,editionId){return applications.find(item=>(item.fair_edition_id||item.edition_id||item.edition?.id)===editionId);}
function openEditionCard(edition,applications){
 const application=editionApplication(applications,edition.id);
 const action=openEditionApplicationState(application,edition.id);
 const statusTone=['APPROVED','CONFIRMED'].includes(action.status)?'approved':['DECLINED','REJECTED'].includes(action.status)?'rejected':'pending';
 const upcoming=edition.registration_status==='UPCOMING';
 const actionHtml=upcoming&&!application?`<span class="open-edition-opening"><b>Inscrições abrirão a partir de</b><span>${h(date(edition.registration_opens_at))}</span></span>`:action.kind==='status'?`<span class="open-edition-state"><span class="status ${statusTone}">${h(action.label)}</span></span>`:`<a class="btn btn-${action.kind}" href="${h(action.href)}" target="_blank" rel="noopener noreferrer" data-application-link>${h(action.label)}</a>`;
 const description=summarized(edition.public_description||edition.fair?.short_description||edition.fair?.description||'Confira os detalhes desta edição e envie sua candidatura.');
 return `<article class="open-edition-card" data-registration-status="${h(edition.registration_status)}"><div class="open-edition-card__content"><span class="eyebrow">${h(edition.fair?.name||'Feira BECO')}</span><h3>${h(edition.title||'Próxima edição')}</h3><dl class="open-edition-meta"><div><dt>Data</dt><dd>${h(date(edition.starts_at))}</dd></div><div><dt>Local</dt><dd>${h(locationText(edition.location))}</dd></div><div><dt>${upcoming?'Inscrições a partir de':'Inscrições até'}</dt><dd>${h(date(upcoming?edition.registration_opens_at:edition.registration_closes_at))}</dd></div></dl><p>${h(description)}</p></div><div class="open-edition-card__action">${actionHtml}</div></article>`;
}
export function openEditionsHtml(editions,applications=[]){return editions.map(edition=>openEditionCard(edition,applications)).join('')||'<p class="workflow-empty open-editions-empty">Nenhuma edição corresponde aos filtros selecionados.</p>';}

function opportunityDate(value,endOfDay=false){
 if(!value)return null;
 const parsed=new Date(`${value}T${endOfDay?'23:59:59.999':'00:00:00.000'}`);
 return Number.isFinite(parsed.getTime())?parsed.getTime():null;
}

function filterOpportunities(editions,applications,{status:registrationStatus='',startsOn='',endsOn=''}={}){
 const periodStart=opportunityDate(startsOn);
 const periodEnd=opportunityDate(endsOn,true);
 return editions.filter(edition=>{
  const application=editionApplication(applications,edition.id);
  if(application&&application.status!=='DRAFT')return false;
  if(registrationStatus&&edition.registration_status!==registrationStatus)return false;
  const eventStart=Date.parse(edition.starts_at);
  const eventEnd=Date.parse(edition.ends_at||edition.starts_at);
  if(periodStart!==null&&(!Number.isFinite(eventEnd)||eventEnd<periodStart))return false;
  if(periodEnd!==null&&(!Number.isFinite(eventStart)||eventStart>periodEnd))return false;
  return true;
 });
}

function editExhibitorProfile(profile,categories,onSaved){
 const dialog=openDialog('Editar perfil do expositor',`<form data-profile-editor><p>Revise seus dados. As alterações serão publicadas somente depois de salvas.</p><div class="form-grid">${field('displayName','Nome público',profile.display_name,'text','required minlength="2" maxlength="180"')}${field('contactName','Nome de contato',profile.contact_name,'text','required minlength="3" maxlength="180"')}${field('phone','WhatsApp',profile.phone,'tel','required minlength="8" maxlength="30"')}${field('city','Cidade',profile.city||'','text','maxlength="120"')}${field('state','Estado (UF)',profile.state||'','text','required minlength="2" maxlength="2" pattern="[A-Za-z]{2}"')}${field('instagram','Instagram',profile.social_links?.instagram||profile.instagram_url||'','url')}${field('website','Site ou catálogo',profile.social_links?.website||'','url')}<label class="form-field full">Sobre seu trabalho<textarea name="bio" maxlength="5000">${h(profile.bio||'')}</textarea></label></div><fieldset><legend>Categorias do seu trabalho</legend><div class="workflow-checks">${categories.map(category=>`<label><input type="checkbox" name="categoryIds" value="${h(category.id)}" ${profile.categories.some(item=>item.id===category.id)?'checked':''}>${h(category.name)}</label>`).join('')}</div></fieldset><label class="check-row"><input name="publicProfile" type="checkbox" ${profile.profile_visibility==='PUBLIC'?'checked':''}><span>Autorizo meu perfil e imagens aprovadas no diretório público.</span></label><p data-feedback aria-live="polite"></p><div class="hero-actions"><button type="button" class="btn btn-outline" data-cancel-profile>Cancelar</button><button type="submit" class="btn btn-primary">Salvar perfil</button></div></form>`);
 const form=dialog.querySelector('[data-profile-editor]');
 let dirty=false;
 const markDirty=()=>{dirty=true;};
 form.addEventListener('input',markDirty);
 form.addEventListener('change',markDirty);
 dialog.beforeWorkflowClose=()=>!dirty||confirm('As alterações do perfil não foram salvas. Deseja fechar mesmo assim?');
 dialog.querySelector('[data-cancel-profile]').addEventListener('click',()=>dialog.requestWorkflowClose());
 bindForm(form,async(data,currentForm)=>{
  await api.request('/me/exhibitor',{method:'PATCH',body:{displayName:data.displayName,contactName:data.contactName,phone:data.phone,city:data.city,state:data.state.toUpperCase(),bio:data.bio,instagramUrl:data.instagram,socialLinks:{...(profile.social_links||{}),instagram:data.instagram,website:data.website},profileVisibility:data.publicProfile?'PUBLIC':'PRIVATE',categoryIds:new FormData(currentForm).getAll('categoryIds')}});
  dirty=false;
  dialog.close();
  await onSaved();
 });
}

function editPortfolioImages(profile,onSaved){
 const existing=profile.portfolio||[];
 const dialog=openDialog('Editar imagens do perfil',`<div class="portfolio-editor"><p>Adicione, ajuste, substitua ou remova até 6 imagens. Formatos aceitos: JPG, PNG e WebP, com até 10 MB por arquivo.</p><p class="workflow-note" data-portfolio-count>${existing.length} de 6 imagens utilizadas.</p><section class="portfolio-existing" data-existing-list></section><label class="form-field">Adicionar imagens<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-add-portfolio></label><section class="gallery-upload-previews" data-pending-section hidden><h4>Imagens aguardando confirmação</h4><p>Ajuste e confirme individualmente cada enquadramento antes de salvar.</p><div data-gallery-editor-list></div></section><p data-feedback aria-live="polite"></p><div class="hero-actions"><button type="button" class="btn btn-outline" data-cancel-portfolio>Cancelar</button><button type="button" class="btn btn-primary" data-save-portfolio>Salvar imagens</button></div></div>`);
 dialog.classList.add('portfolio-editor-dialog');
 const existingList=dialog.querySelector('[data-existing-list]');
 const pendingList=dialog.querySelector('[data-gallery-editor-list]');
 const pendingSection=dialog.querySelector('[data-pending-section]');
 const input=dialog.querySelector('[data-add-portfolio]');
 const feedback=dialog.querySelector('[data-feedback]');
 const removals=new Set();
 const pending=[];
 let selectedCover=existing.find(media=>media.is_featured)?.id||existing[0]?.id||null;
 let dirty=false;

 const currentTotal=()=>existing.length-removals.size+pending.filter(item=>!item.replaceMediaId).length;
 const updateSummary=()=>{
  const total=currentTotal();
  dialog.querySelector('[data-portfolio-count]').textContent=`${total} de 6 imagens utilizadas. ${Math.max(0,6-total)} espaço(s) disponível(is).`;
  input.disabled=total>=6;
  pendingSection.hidden=!pending.length;
 };
 const cropFile=(canvas,name)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(new File([blob],String(name||'imagem').replace(/\.[^.]+$/, '')+'-perfil.jpg',{type:'image/jpeg'})):reject(new Error('Não foi possível preparar a imagem.')),'image/jpeg',.9));
 const loadImage=source=>new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Não foi possível abrir esta imagem.'));image.src=source;});
 const fallbackCover=excluded=>existing.find(media=>!removals.has(media.id)&&media.id!==excluded)?.id||pending.find(item=>item!==excluded)||null;
 const syncPendingPurposes=()=>pending.forEach(item=>{const select=item.article.querySelector('[data-image-purpose]');if(select)select.value=selectedCover===item||selectedCover===item.replaceMediaId?'COVER':'GALLERY';});

 const removePending=item=>{
  const index=pending.indexOf(item);
  if(index>=0)pending.splice(index,1);
  item.objectUrl&&URL.revokeObjectURL(item.objectUrl);
  item.article.remove();
  if(selectedCover===item)selectedCover=fallbackCover(item);
  dirty=true;
  renderExisting();
  syncPendingPurposes();
  updateSummary();
 };
 const addEditor=async(file,{replaceMediaId=null,title='',altText=''}={})=>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>10*1024*1024)throw new Error('Envie imagens JPG, PNG ou WebP de até 10 MB.');
  if(!replaceMediaId&&currentTotal()>=6)throw new Error('O perfil pode ter no máximo 6 imagens.');
  const objectUrl=URL.createObjectURL(file);
  const image=await loadImage(objectUrl);
  const article=document.createElement('article');
  article.className='gallery-crop-item';
  article.innerHTML=`<h5>${h(title||file.name)}</h5><label class="form-field">Finalidade<select data-image-purpose><option value="GALLERY">Galeria</option><option value="COVER">Capa do perfil</option></select></label><canvas width="1200" height="900" aria-label="Prévia do recorte da imagem"></canvas><div class="cover-crop-controls"><label>Zoom<input type="range" min="1" max="3" value="1" step="0.05"></label><label>Posição horizontal<input type="range" min="0" max="100" value="50" step="1"></label><label>Posição vertical<input type="range" min="0" max="100" value="50" step="1"></label></div><label class="form-field gallery-description">Descrição da imagem<input type="text" maxlength="255" value="${h(altText)}"></label><div class="hero-actions"><button type="button" class="btn btn-secondary" data-confirm-crop>Confirmar ajustes</button><button type="button" class="btn btn-outline" data-cancel-crop>Cancelar</button></div><p class="workflow-note" data-crop-state>Ajustes ainda não confirmados.</p>`;
  const canvas=article.querySelector('canvas');
  const context=canvas.getContext('2d');
  const [zoom,x,y]=article.querySelectorAll('input[type=range]');
  const item={article,file,objectUrl,replaceMediaId,confirmed:false,output:null};
  if(!selectedCover)selectedCover=item;
  const draw=()=>{const scale=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight)*Number(zoom.value);const width=image.naturalWidth*scale;const height=image.naturalHeight*scale;context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,-(width-canvas.width)*(Number(x.value)/100),-(height-canvas.height)*(Number(y.value)/100),width,height);item.confirmed=false;item.output=null;article.querySelector('[data-crop-state]').textContent='Ajustes ainda não confirmados.';dirty=true;};
  [zoom,x,y].forEach(control=>control.addEventListener('input',draw));
  article.querySelector('.gallery-description input').addEventListener('input',()=>{item.confirmed=false;article.querySelector('[data-crop-state]').textContent='Ajustes ainda não confirmados.';dirty=true;});
  article.querySelector('[data-image-purpose]').addEventListener('change',event=>{if(event.target.value==='COVER')selectedCover=item;else if(selectedCover===item||selectedCover===replaceMediaId)selectedCover=fallbackCover(item);dirty=true;renderExisting();syncPendingPurposes();});
  article.querySelector('[data-confirm-crop]').addEventListener('click',async()=>{try{item.output=await cropFile(canvas,file.name);item.confirmed=true;article.querySelector('[data-crop-state]').textContent='Enquadramento confirmado e pronto para salvar.';dirty=true;}catch(error){notice(feedback,error.message);}});
  article.querySelector('[data-cancel-crop]').addEventListener('click',()=>removePending(item));
  draw();
  pending.push(item);
  pendingList.append(article);
  syncPendingPurposes();
  updateSummary();
 };
 const renderExisting=()=>{
  existingList.innerHTML=existing.map(media=>{const removed=removals.has(media.id);const replacing=pending.some(item=>item.replaceMediaId===media.id);const cover=selectedCover===media.id||pending.some(item=>item.replaceMediaId===media.id&&selectedCover===item);return `<article class="portfolio-existing-item${removed?' is-removing':''}"><img src="${h(media.url)}" alt="${h(media.alt_text||media.original_filename||'Imagem do portfólio')}"><div><strong>${h(media.alt_text||media.original_filename||'Imagem do portfólio')}</strong>${cover?'<span class="tag">Capa</span>':''}${status(media.review_status)}${removed?'<p class="workflow-note">Esta imagem será removida ao salvar.</p>':replacing?'<p class="workflow-note">Novo enquadramento aguardando confirmação.</p>':''}<div class="hero-actions"><button type="button" class="btn btn-secondary" data-cover-existing="${h(media.id)}" ${removed||cover?'disabled':''}>Definir como capa</button><button type="button" class="btn btn-secondary" data-edit-existing="${h(media.id)}" ${removed||replacing?'disabled':''}>Editar imagem</button><button type="button" class="btn btn-secondary" data-replace-existing="${h(media.id)}" ${removed||replacing?'disabled':''}>Substituir</button><button type="button" class="btn btn-outline" data-remove-existing="${h(media.id)}" ${replacing?'disabled':''}>${removed?'Desfazer remoção':'Remover'}</button></div></div></article>`;}).join('')||'<p class="workflow-empty">Nenhuma imagem cadastrada.</p>';
  existingList.querySelectorAll('[data-cover-existing]').forEach(button=>button.addEventListener('click',()=>{selectedCover=button.dataset.coverExisting;dirty=true;renderExisting();syncPendingPurposes();}));
  existingList.querySelectorAll('[data-remove-existing]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.removeExisting;if(removals.has(id))removals.delete(id);else{removals.add(id);if(selectedCover===id)selectedCover=fallbackCover(id);}dirty=true;renderExisting();syncPendingPurposes();updateSummary();}));
  existingList.querySelectorAll('[data-edit-existing]').forEach(button=>button.addEventListener('click',async()=>{const media=existing.find(item=>item.id===button.dataset.editExisting);if(!media)return;try{const response=await fetch(media.url);if(!response.ok)throw new Error('Não foi possível carregar a imagem para edição.');const blob=await response.blob();const type=['image/jpeg','image/png','image/webp'].includes(blob.type)?blob.type:'image/jpeg';const file=new File([blob],media.original_filename||'imagem-perfil.jpg',{type});await addEditor(file,{replaceMediaId:media.id,title:media.alt_text||media.original_filename,altText:media.alt_text||''});renderExisting();}catch(error){notice(feedback,error.message);}}));
  existingList.querySelectorAll('[data-replace-existing]').forEach(button=>button.addEventListener('click',()=>{const media=existing.find(item=>item.id===button.dataset.replaceExisting);if(!media)return;const picker=document.createElement('input');picker.type='file';picker.accept='image/jpeg,image/png,image/webp';picker.addEventListener('change',async()=>{const file=picker.files?.[0];if(!file)return;try{await addEditor(file,{replaceMediaId:media.id,title:file.name,altText:media.alt_text||''});renderExisting();}catch(error){notice(feedback,error.message);}});picker.click();}));
 };
 renderExisting();
 updateSummary();
 input.addEventListener('change',async()=>{const files=[...input.files];input.value='';if(files.length>6-currentTotal()){notice(feedback,`Você pode adicionar no máximo ${Math.max(0,6-currentTotal())} imagem(ns). O limite total é 6.`);return;}for(const file of files){try{await addEditor(file);}catch(error){notice(feedback,error.message);break;}}});
 dialog.beforeWorkflowClose=()=>!dirty||confirm('As alterações nas imagens não foram salvas. Deseja fechar mesmo assim?');
 dialog.querySelector('[data-cancel-portfolio]').addEventListener('click',()=>dialog.requestWorkflowClose());
 dialog.querySelector('[data-save-portfolio]').addEventListener('click',event=>busy(event.currentTarget,async()=>{
  if(currentTotal()>6)throw new Error('O perfil pode ter no máximo 6 imagens.');
  if(pending.some(item=>!item.confirmed))throw new Error('Confirme os ajustes de todas as imagens antes de salvar.');
  const uploadedIds=new Map();
  for(const item of pending.filter(item=>item.replaceMediaId)){const uploaded=await api.upload(item.output,'/me/exhibitor/portfolio',{altText:item.article.querySelector('.gallery-description input').value.trim(),replaceMediaId:item.replaceMediaId});uploadedIds.set(item,uploaded.id);}
  for(const mediaId of removals)await api.request(`/me/exhibitor/portfolio/${mediaId}`,{method:'DELETE'});
  for(const item of pending.filter(item=>!item.replaceMediaId)){const uploaded=await api.upload(item.output,'/me/exhibitor/portfolio',{altText:item.article.querySelector('.gallery-description input').value.trim()});uploadedIds.set(item,uploaded.id);}
  let coverId=typeof selectedCover==='string'?selectedCover:uploadedIds.get(selectedCover);
  const coverReplacement=pending.find(item=>item.replaceMediaId===coverId);
  if(coverReplacement)coverId=uploadedIds.get(coverReplacement);
  if(coverId&&!removals.has(coverId))await api.request(`/me/exhibitor/portfolio/${coverId}/cover`,{method:'PUT'});
  dirty=false;
  dialog.close();
  await onSaved();
 },feedback));
 dialog.addEventListener('close',()=>pending.forEach(item=>item.objectUrl&&URL.revokeObjectURL(item.objectUrl)),{once:true});
}
export async function exhibitorDashboard() {
 const main=document.querySelector('main');
 try{
  const [profile,applications,categories,spaces,evaluations,opportunityEditions]=await Promise.all([api.myExhibitor(),api.myApplications(),api.exhibitorCategories(),api.request('/me/spaces'),api.myEvaluations(),api.opportunityEditions()]);
  main.innerHTML=`<div class="private-heading"><div><span class="eyebrow">${h(profile.display_name)}</span><h1>Minha área</h1><p>Acompanhe candidaturas, orientações e seu portfólio.</p></div><a class="btn btn-primary" href="feiras.html" target="_blank" rel="noopener noreferrer" data-find-fair>Encontrar uma feira</a></div><p data-page-feedback aria-live="polite"></p>
  <section class="dash-stats"><article><span>Cadastro</span><b>${status(profile.status)}</b></article><article><span>Inscrições</span><b>${applications.length}</b></article><article><span>Participações confirmadas</span><b>${applications.filter(a=>a.status==='CONFIRMED').length}</b></article><article><span>Perfil</span><b>${profile.profile_visibility==='PUBLIC'?'Público após aprovação':'Privado'}</b></article></section>
  <section class="panel" id="feiras-abertas"><div class="workflow-section-heading"><div><span class="eyebrow">Novas oportunidades</span><h2>Feiras abertas e confirmadas</h2></div></div><form class="workflow-toolbar" data-opportunity-filters><label>Situação <select name="status"><option value="">Todas</option><option value="OPEN">Inscrições abertas</option><option value="UPCOMING">Feiras confirmadas</option></select></label><label>Período inicial <input type="date" name="startsOn"></label><label>Período final <input type="date" name="endsOn"></label><button type="button" class="btn btn-outline" data-clear-opportunity-filters>Limpar filtros</button></form><p data-opportunity-result-count role="status" aria-live="polite"></p><div class="open-editions-grid" data-opportunity-list>${openEditionsHtml(opportunityEditions,applications)}</div></section>
  <section class="panel" id="inscricoes"><h2>Minhas inscrições</h2><div class="workflow-stack">${applications.map(a=>`<article class="application-card"><div class="application-card-header"><div><h3>${h(a.edition?.title||'Feira')}</h3><p>${h(date(a.edition?.starts_at))}</p><p>Estrutura: ${h(a.requested_space_type||'A definir')}</p></div>${status(a.status)}</div><div class="hero-actions"><button class="btn btn-secondary" data-view="${h(a.id)}">Ver formulário e orientações</button>${['DRAFT','AWAITING_UPDATE'].includes(a.status)?`<a class="btn btn-primary" href="inscricao-expositor.html?inscricao=${encodeURIComponent(a.id)}&edicao=${encodeURIComponent(a.fair_edition_id||a.edition?.id||'')}" target="_blank" rel="noopener noreferrer" data-continue-application>${a.status==='DRAFT'?'Continuar inscrição':'Fazer ajustes e reenviar'}</a>`:''}${!['CONFIRMED','CANCELLED','DECLINED'].includes(a.status)?`<button class="btn btn-outline" data-cancel="${h(a.id)}">Cancelar candidatura</button>`:''}</div></article>`).join('')||'<p class="workflow-empty">Você ainda não tem inscrições. Encontre uma feira e candidate-se a uma vaga.</p>'}</div></section>
  <section class="panel" id="espacos"><h2>Meus espaços confirmados</h2>${spaces.map(s=>`<article><h3>${h(s.edition?.title)}</h3><p>${h(s.assignedSpace?.code||'A definir')} · ${h(s.assignedSpace?.label||'')} · ${h(s.assignedSpace?.width_m||'')} × ${h(s.assignedSpace?.height_m||'')} m</p>${s.edition?.spacePlan?.url?`<div class="space-plan-stage space-plan-stage--readonly"><img src="${h(s.edition.spacePlan.url)}" alt="${h(s.edition.spacePlan.altText)}">${s.assignedSpace&&s.assignedSpace.x_coordinate!==null&&s.assignedSpace.x_coordinate!==undefined&&s.assignedSpace.y_coordinate!==null&&s.assignedSpace.y_coordinate!==undefined&&Number.isFinite(Number(s.assignedSpace.x_coordinate))&&Number.isFinite(Number(s.assignedSpace.y_coordinate))?`<span class="space-plan-pin is-own" style="left:${Number(s.assignedSpace.x_coordinate)}%;top:${Number(s.assignedSpace.y_coordinate)}%"><span>${h(s.assignedSpace.code)}</span></span>`:''}</div><p class="workflow-note">A planta completa é exibida apenas para orientação. Somente o seu espaço está identificado.</p>`:'<p class="workflow-empty">A organização ainda não publicou a imagem do espaço desta edição.</p>'}</article>`).join('')||'<p>Após a seleção, a curadoria informará seu espaço por aqui.</p>'}</section>
  <section class="panel" id="avaliacoes"><h2>Avaliações pós-evento</h2><p>As respostas individuais são privadas para a equipe. As médias públicas aparecem somente após três respostas elegíveis.</p><div class="workflow-stack">${evaluations.map(item=>`<article class="application-card"><div class="application-card-header"><div><h3>${h(item.edition?.title||'Evento')}</h3><p>${h(date(item.edition?.ends_at))}</p></div>${item.evaluation?'<span class="tag">Avaliação enviada</span>':item.eligible?'<span class="tag">Disponível</span>':'<span class="tag">Aguardando presença e encerramento</span>'}</div>${item.eligible?`<form data-evaluation="${h(item.id)}"><div class="form-grid">${[['organizationCommunicationRating','Organização e comunicação'],['structureRating','Estrutura'],['publicityRating','Divulgação'],['audienceRating','Público e visitação'],['overallRating','Experiência geral']].map(([name,title])=>`<label class="form-field">${title}<select name="${name}" required><option value="">Selecione</option>${[1,2,3,4,5].map(value=>`<option value="${value}" ${Number(item.evaluation?.[name.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())])===value?'selected':''}>${value}</option>`).join('')}</select></label>`).join('')}<label class="form-field">Vendas (opcional)<select name="salesRating"><option value="">Não se aplica</option>${[1,2,3,4,5].map(value=>`<option value="${value}" ${Number(item.evaluation?.sales_rating)===value?'selected':''}>${value}</option>`).join('')}</select></label><label class="form-field full">Comentário para a equipe<textarea name="comments" maxlength="3000">${h(item.evaluation?.comments||'')}</textarea></label></div><p data-feedback aria-live="polite"></p><button class="btn btn-primary" type="submit">${item.evaluation?'Atualizar avaliação':'Enviar avaliação'}</button></form>`:'<p>A avaliação será liberada quando a equipe registrar sua presença e o evento terminar.</p>'}</article>`).join('')||'<p>Nenhuma participação confirmada disponível para avaliação.</p>'}</div></section>
  <section class="panel" id="perfil"><div class="workflow-section-heading"><div><h2>Meu perfil</h2><p>Somente perfis aprovados e autorizados aparecem no diretório público.</p></div><button type="button" class="btn btn-primary" data-edit-profile>Editar perfil</button></div><div class="workflow-question"><h3>${h(profile.display_name)}</h3><p><b>Contato:</b> ${h(profile.contact_name)} · ${h(profile.phone)}</p><p><b>Localização:</b> ${h([profile.city,profile.state].filter(Boolean).join(' · ')||'Não informada')}</p><p><b>Categorias:</b> ${h(profile.categories.map(item=>item.name).join(', ')||'Não informadas')}</p><p>${h(profile.bio||'Nenhuma apresentação informada.')}</p>${status(profile.status)} ${profile.profile_visibility==='PUBLIC'?'<span class="tag">Perfil público</span>':'<span class="tag">Perfil privado</span>'}</div>${profile.status==='APPROVED'&&profile.profile_visibility==='PUBLIC'?`<div class="hero-actions"><a class="btn btn-secondary" href="expositor.html?id=${encodeURIComponent(profile.id)}" target="_blank" rel="noopener noreferrer" data-public-profile>Ver perfil público</a></div>`:''}</section>
  <section class="panel" id="portfolio"><div class="workflow-section-heading"><div><h2>Meu portfólio</h2><p>Até 6 imagens. Imagens novas ou substituídas ficam privadas até aprovação da curadoria.</p></div><button type="button" class="btn btn-primary" data-edit-portfolio>Gerenciar imagens</button></div><p class="workflow-note">${profile.portfolio.length} de 6 imagens utilizadas.</p><div class="workflow-media">${profile.portfolio.map(m=>`<article><img src="${h(m.url)}" alt="${h(m.alt_text||m.original_filename)}">${status(m.review_status)}<p>${h(m.curator_note||'')}</p></article>`).join('')||'<p>Nenhuma imagem enviada.</p>'}</div></section>`;
  const opportunityFilters=main.querySelector('[data-opportunity-filters]');
  opportunityFilters.addEventListener('submit',event=>event.preventDefault());
  main.addEventListener('click',event=>{
   const continueLink=event.target.closest('a[data-continue-application]');
   if(continueLink&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){
    event.preventDefault();
    event.stopImmediatePropagation();
    const opened=window.open(continueLink.href,'_blank');
    if(opened)opened.opener=null;
    return;
   }
   const link=event.target.closest('a[data-application-link]');
   if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   event.preventDefault();
   event.stopImmediatePropagation();
   window.open(link.href,'_blank','noopener,noreferrer');
  },true);
  const renderOpportunities=()=>{
   const values={status:opportunityFilters.elements.status.value,startsOn:opportunityFilters.elements.startsOn.value,endsOn:opportunityFilters.elements.endsOn.value};
   const filtered=filterOpportunities(opportunityEditions,applications,values);
   main.querySelector('[data-opportunity-list]').innerHTML=openEditionsHtml(filtered,applications);
   const availableTotal=filterOpportunities(opportunityEditions,applications).length;
   main.querySelector('[data-opportunity-result-count]').textContent=`${filtered.length} de ${availableTotal} oportunidade(s)`;
  };
  opportunityFilters.addEventListener('change',event=>{
   if(event.target.name==='startsOn')opportunityFilters.elements.endsOn.min=event.target.value;
   if(event.target.name==='endsOn')opportunityFilters.elements.startsOn.max=event.target.value;
   renderOpportunities();
  });
  main.querySelector('[data-clear-opportunity-filters]').addEventListener('click',()=>{opportunityFilters.reset();opportunityFilters.elements.startsOn.removeAttribute('max');opportunityFilters.elements.endsOn.removeAttribute('min');renderOpportunities();});
  renderOpportunities();
  main.querySelector('[data-find-fair]')?.addEventListener('click',event=>{
   if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   event.preventDefault();
   window.open(new URL(event.currentTarget.href,document.baseURI).href,'_blank','noopener,noreferrer');
  });
  const feedback=main.querySelector('[data-page-feedback]');if(new URLSearchParams(location.search).has('enviada'))notice(feedback,'Inscrição enviada com sucesso. Acompanhe a análise nesta página.',true);
  main.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>viewApplication(b.dataset.view));
  main.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{if(confirm('Deseja realmente cancelar esta candidatura? Você não poderá continuar o preenchimento após o cancelamento. As respostas já registradas não serão apagadas. Nenhuma alteração será feita se você escolher Cancelar nesta mensagem.'))busy(b,async()=>{await api.request(`/applications/${b.dataset.cancel}/cancel`,{method:'POST'});await exhibitorDashboard();},feedback);});
  main.querySelectorAll('[data-edit-profile]').forEach(button=>button.addEventListener('click',()=>editExhibitorProfile(profile,categories,exhibitorDashboard)));
  main.querySelector('[data-public-profile]')?.addEventListener('click',event=>{
   if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   event.preventDefault();
   window.open(new URL(event.currentTarget.href,document.baseURI).href,'_blank','noopener,noreferrer');
  });
  main.querySelector('[data-edit-portfolio]')?.addEventListener('click',()=>editPortfolioImages(profile,exhibitorDashboard));
  main.querySelectorAll('[data-evaluation]').forEach(form=>bindForm(form,async(data)=>{const number=name=>data[name]?Number(data[name]):null;await api.saveEvaluation(form.dataset.evaluation,{organizationCommunicationRating:number('organizationCommunicationRating'),structureRating:number('structureRating'),publicityRating:number('publicityRating'),audienceRating:number('audienceRating'),overallRating:number('overallRating'),salesRating:number('salesRating'),comments:data.comments});notice(form.querySelector('[data-feedback]'),'Avaliação salva. Obrigada pela contribuição.',true);await exhibitorDashboard();}));
 }catch(error){main.innerHTML='<div data-feedback></div><button class="btn btn-secondary" data-retry>Tentar novamente</button>';notice(main.querySelector('[data-feedback]'),error.message);main.querySelector('[data-retry]').onclick=exhibitorDashboard;}
}
