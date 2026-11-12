let contentObserver;
let currentView = 'overview';

const views = {
 overview: { title: 'Minha área', description: 'Acompanhe suas oportunidades, inscrições e a apresentação pública do seu trabalho.' },
 opportunities: { title: 'Oportunidades', description: 'Encontre edições com inscrições abertas e escolha onde apresentar seu trabalho.' },
 applications: { title: 'Minhas inscrições', description: 'Acompanhe cada candidatura, consulte orientações e faça os ajustes solicitados.' },
 spaces: { title: 'Espaços confirmados', description: 'Consulte a localização e as informações do seu espaço nas feiras confirmadas.' },
 evaluations: { title: 'Avaliações', description: 'Compartilhe sua experiência após participar de uma feira.' },
 profile: { title: 'Meu perfil', description: 'Mantenha atualizadas as informações que identificam e apresentam seu trabalho.' },
 portfolio: { title: 'Meu portfólio', description: 'Organize as imagens que poderão apresentar seus produtos e sua produção autoral.' }
};

function decoratePanels(main) {
 main.querySelectorAll(':scope > .panel').forEach((panel, index) => {
  panel.classList.add('dashboard-panel');
  panel.style.setProperty('--panel-order', index);
 });
}

function setActiveView(view) {
 document.querySelectorAll('.private-sidebar [data-exhibitor-view]').forEach(link => {
  const active = link.dataset.exhibitorView === view;
  link.classList.toggle('active', active);
  if (active) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
 });
 const activeLink = document.querySelector(`.private-sidebar [data-exhibitor-view="${view}"]`);
 activeLink?.closest('details')?.setAttribute('open', '');
}

function buildOverview(main) {
 if (main.querySelector('[data-exhibitor-overview]')) return;
 const stats = [...main.querySelectorAll('.dash-stats article')];
 const statValue = index => stats[index]?.querySelector('b')?.textContent?.trim() || '—';
 const openCount = main.querySelectorAll('#feiras-abertas .open-edition-card').length;
 const overview = document.createElement('section');
 overview.className = 'dashboard-overview exhibitor-overview';
 overview.dataset.exhibitorOverview = '';
 overview.innerHTML = `<div class="overview-intro"><span class="eyebrow">Seu percurso no BECO</span><h2>Organize sua participação em um só lugar.</h2><p>Encontre oportunidades, acompanhe candidaturas e cuide do perfil que apresenta seu trabalho ao público.</p></div><div class="overview-edition"><span>Oportunidades abertas</span><strong>${openCount}</strong><small>${openCount===1?'edição disponível para inscrição':'edições disponíveis para inscrição'}</small><button type="button" class="btn btn-primary" data-exhibitor-view="opportunities">Ver oportunidades</button></div><div class="overview-actions"><button type="button" data-exhibitor-view="applications"><span>01</span><b>Minhas inscrições</b><small>${statValue(1)} candidatura(s) registrada(s)</small></button><button type="button" data-exhibitor-view="spaces"><span>02</span><b>Minha participação</b><small>${statValue(2)} participação(ões) confirmada(s)</small></button><button type="button" data-exhibitor-view="profile"><span>03</span><b>Dados do perfil</b><small>Cadastro ${statValue(0).toLowerCase()}</small></button><button type="button" data-exhibitor-view="portfolio"><span>04</span><b>Portfólio</b><small>Revise as imagens do seu trabalho</small></button></div>`;
 stats[0]?.parentElement?.after(overview);
}

export function applyView(view, { scroll = false } = {}) {
 const main = document.querySelector('.private-main');
 if (!main?.querySelector('#feiras-abertas')) return;
 currentView = views[view] ? view : 'overview';
 const panelByView = { opportunities: 'feiras-abertas', applications: 'inscricoes', spaces: 'espacos', evaluations: 'avaliacoes', profile: 'perfil', portfolio: 'portfolio' };
 main.dataset.exhibitorView = currentView;
 main.querySelectorAll(':scope > .panel').forEach(panel => { panel.hidden = panel.id !== panelByView[currentView]; });
 const overview = main.querySelector('[data-exhibitor-overview]');
 if (overview) overview.hidden = currentView !== 'overview';
 const stats = main.querySelector('.dash-stats');
 if (stats) stats.hidden = currentView !== 'overview';
 const heading = main.querySelector('.private-heading');
 if (heading) {
  const title = heading.querySelector('h1');
  const description = heading.querySelector('p');
  if (title) title.textContent = views[currentView].title;
  if (description) description.textContent = views[currentView].description;
 }
 setActiveView(currentView);
 history.replaceState(null, '', currentView === 'overview' ? '#visao-geral' : `#${panelByView[currentView]}`);
 if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function installViewNavigation(main) {
 const sidebar = document.querySelector('.private-sidebar');
 if (sidebar && sidebar.dataset.exhibitorViews !== 'ready') {
  sidebar.dataset.exhibitorViews = 'ready';
  sidebar.addEventListener('click', event => {
   const link = event.target.closest('[data-exhibitor-view]');
   if (!link) return;
   event.preventDefault();
   applyView(link.dataset.exhibitorView, { scroll: true });
   document.body.classList.remove('private-menu-open');
   document.querySelector('.private-menu-toggle')?.setAttribute('aria-expanded', 'false');
  });
 }
 if (main.dataset.exhibitorViews !== 'ready') {
  main.dataset.exhibitorViews = 'ready';
  main.addEventListener('click', event => {
   const button = event.target.closest('[data-exhibitor-view]');
   if (!button) return;
   event.preventDefault();
   applyView(button.dataset.exhibitorView, { scroll: false });
  });
 }
}

function installMobileNavigation() {
 const sidebar = document.querySelector('.private-sidebar');
 if (!sidebar || document.querySelector('.private-menu-toggle')) return;
 const button = document.createElement('button');
 button.type = 'button';
 button.className = 'private-menu-toggle';
 button.setAttribute('aria-controls', 'private-navigation');
 button.setAttribute('aria-expanded', 'false');
 button.innerHTML = '<span aria-hidden="true">☰</span><span>Menu</span>';
 sidebar.id = 'private-navigation';
 document.body.prepend(button);
 const close = () => { document.body.classList.remove('private-menu-open'); button.setAttribute('aria-expanded', 'false'); };
 button.addEventListener('click', () => {
  const open = document.body.classList.toggle('private-menu-open');
  button.setAttribute('aria-expanded', String(open));
 });
 sidebar.addEventListener('click', event => { if (event.target.closest('a')) close(); });
 document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
}

function installBackToTop() {
 if (document.querySelector('.back-to-top')) return;
 const link = document.createElement('a');
 link.className = 'back-to-top';
 link.href = '#conteudo';
 link.setAttribute('aria-label', 'Voltar ao início do painel');
 link.textContent = '↑';
 document.body.append(link);
 const update = () => link.classList.toggle('is-visible', window.scrollY > 600);
 window.addEventListener('scroll', update, { passive: true });
 update();
}

export function enhanceDashboard() {
 const main = document.querySelector('.private-main');
 if (!main) return;
 decoratePanels(main);
 buildOverview(main);
 installViewNavigation(main);
 installMobileNavigation();
 installBackToTop();
 applyView(currentView, { scroll: false });
 if (!contentObserver) {
  contentObserver = new MutationObserver(() => {
   if (!main.querySelector('.panel:not(.dashboard-panel)')) return;
   decoratePanels(main);
   buildOverview(main);
   applyView(currentView, { scroll: false });
  });
  contentObserver.observe(main, { childList: true, subtree: true });
 }
}
