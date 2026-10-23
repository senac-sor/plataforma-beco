import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {
  location: { protocol: 'http:' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
};

const { ApiModel } = await import('../assets/js/models/api.model.js');
const { openEditionApplicationState, openEditionsHtml } = await import('../assets/js/controllers/exhibitor.controller.js');

const now = new Date('2026-10-23T15:00:00Z');
const fair = { id:'fair-1', name:'Feira BECO', short_description:'Economia criativa', editions:[] };

function modelWith(editions) {
  const model = new ApiModel('/api/v1');
  model.fairs = async () => [{ ...fair, editions }];
  return model;
}

test('openEditions returns only registration-open editions in the active period', async () => {
  const editions = await modelWith([
    { id:'open', status:'REGISTRATION_OPEN', registration_opens_at:'2026-10-01T00:00:00Z', registration_closes_at:'2026-10-30T23:59:59Z', ends_at:'2026-11-02T20:00:00Z' },
    { id:'published', status:'PUBLISHED', registration_opens_at:'2026-10-01T00:00:00Z', registration_closes_at:'2026-10-30T23:59:59Z', ends_at:'2026-11-02T20:00:00Z' }
  ]).openEditions(now);
  assert.deepEqual(editions.map(item => item.id), ['open']);
  assert.equal(editions[0].fair.name, 'Feira BECO');
});

test('openEditions excludes editions before opening, after the deadline, and already ended', async () => {
  const editions = await modelWith([
    { id:'not-started', status:'REGISTRATION_OPEN', registration_opens_at:'2026-10-24T00:00:00Z', registration_closes_at:'2026-10-30T00:00:00Z', ends_at:'2026-11-02T00:00:00Z' },
    { id:'closed', status:'REGISTRATION_OPEN', registration_opens_at:'2026-10-01T00:00:00Z', registration_closes_at:'2026-10-22T23:59:59Z', ends_at:'2026-11-02T00:00:00Z' },
    { id:'ended', status:'REGISTRATION_OPEN', registration_opens_at:'2026-10-01T00:00:00Z', registration_closes_at:null, ends_at:'2026-10-23T14:59:59Z' }
  ]).openEditions(now);
  assert.deepEqual(editions, []);
});

test('open edition action reflects an existing exhibitor application', () => {
  assert.equal(openEditionApplicationState({ id:'app-1', status:'DRAFT' }, 'edition-1').label, 'Continuar inscrição');
  assert.equal(openEditionApplicationState({ id:'app-2', status:'SUBMITTED' }, 'edition-1').label, 'Ver candidatura');
  assert.equal(openEditionApplicationState({ id:'app-3', status:'UNDER_REVIEW' }, 'edition-1').label, 'Candidatura em análise');
  assert.equal(openEditionApplicationState({ id:'app-4', status:'APPROVED' }, 'edition-1').label, 'Candidatura aprovada');
  assert.equal(openEditionApplicationState({ id:'app-5', status:'DECLINED' }, 'edition-1').label, 'Candidatura recusada');
  assert.equal(openEditionApplicationState({ id:'app-6', status:'WAITLISTED' }, 'edition-1').label, 'Lista de espera');
});

test('openEditions supports the empty state when no registration is open', async () => {
  const editions = await modelWith([]).openEditions(now);
  assert.deepEqual(editions, []);
  assert.match(openEditionsHtml(editions), /Não há feiras com inscrições abertas/);
});
