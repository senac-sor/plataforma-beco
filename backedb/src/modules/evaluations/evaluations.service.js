import { requireBecoAdmin } from '../../lib/auth.js';
import { HttpError } from '../../lib/http.js';
import { supabaseGateway } from '../../lib/supabase.js';
import { validateUuid } from '../fairs/fairs.validation.js';
import { FormsService } from '../forms/forms.service.js';
import { validateAttendance, validateEvaluation } from './evaluations.validation.js';

const metrics = [
  ['organizationCommunication', 'organization_communication_rating'],
  ['structure', 'structure_rating'],
  ['publicity', 'publicity_rating'],
  ['audience', 'audience_rating'],
  ['overall', 'overall_rating'],
  ['sales', 'sales_rating']
];

function ids(values) { return values.join(','); }

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return Number.NaN;
  // O driver PostgreSQL pode devolver TIMESTAMPTZ como Date, enquanto o
  // PostgREST devolve uma string ISO. Aceitamos explicitamente os dois casos.
  return Date.parse(value.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:)/, '$1T$2'));
}

function summarize(rows) {
  const result = {};
  for (const [key, column] of metrics) {
    const values = rows.map((row) => row[column]).filter(Number.isInteger);
    result[key] = values.length >= 3
      ? { average: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10, responses: values.length }
      : { average: null, responses: values.length };
  }
  return { responseCount: new Set(rows.map((row) => row.application_id)).size, metrics: result };
}

export class EvaluationsService {
  constructor(gateway = supabaseGateway, formsService = new FormsService(gateway)) {
    this.gateway = gateway;
    this.forms = formsService;
  }

  async exhibitor(principal) {
    if (principal.role !== 'EXHIBITOR') throw new HttpError(403, 'FORBIDDEN', 'Ação disponível somente para expositores.');
    const rows = await this.gateway.request(`rest/v1/exhibitors?select=id&user_id=eq.${principal.id}&limit=1`);
    if (!rows[0]) throw new HttpError(404, 'EXHIBITOR_NOT_FOUND', 'Perfil de expositor não encontrado.');
    return rows[0];
  }

  async adminEdition(editionId, principal) {
    requireBecoAdmin(principal);
    return this.forms.assertEditionAdmin(editionId, principal);
  }

  async editionParticipation(editionId, principal) {
    await this.adminEdition(editionId, principal);
    const applications = await this.gateway.request(`rest/v1/applications?select=id,exhibitor_id,status&fair_edition_id=eq.${editionId}&status=eq.CONFIRMED&order=created_at.asc`);
    if (!applications.length) return [];
    const exhibitorIds = [...new Set(applications.map((item) => item.exhibitor_id))];
    const applicationIds = applications.map((item) => item.id);
    const [exhibitors, attendance, evaluations] = await Promise.all([
      this.gateway.request(`rest/v1/exhibitors?select=id,display_name,contact_name,city,state&id=in.(${ids(exhibitorIds)})`),
      this.gateway.request(`rest/v1/application_attendance?select=*&application_id=in.(${ids(applicationIds)})`),
      this.gateway.request(`rest/v1/event_evaluations?select=*&application_id=in.(${ids(applicationIds)})`)
    ]);
    const exhibitorById = new Map(exhibitors.map((item) => [item.id, item]));
    const attendanceById = new Map(attendance.map((item) => [item.application_id, item]));
    const evaluationById = new Map(evaluations.map((item) => [item.application_id, item]));
    return applications.map((application) => ({
      ...application,
      exhibitor: exhibitorById.get(application.exhibitor_id) || null,
      attendance: attendanceById.get(application.id) || null,
      evaluation: evaluationById.get(application.id) || null
    }));
  }

  async recordAttendance(applicationId, input, principal) {
    requireBecoAdmin(principal);
    validateUuid(applicationId, 'Inscrição');
    const applications = await this.gateway.request(`rest/v1/applications?select=id,fair_edition_id,status&id=eq.${applicationId}&limit=1`);
    const application = applications[0];
    if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Inscrição não encontrada.');
    const edition = await this.adminEdition(application.fair_edition_id, principal);
    if (application.status !== 'CONFIRMED') throw new HttpError(409, 'ATTENDANCE_NOT_ALLOWED', 'A presença só pode ser registrada para uma participação confirmada.');
    if (edition.status === 'CANCELLED') throw new HttpError(409, 'EVENT_CANCELLED', 'Não é possível registrar presença em uma edição cancelada.');
    const startsAt = timestamp(edition.starts_at);
    const endsAt = timestamp(edition.ends_at);
    const nowMs = Date.now();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) throw new HttpError(409, 'INVALID_EVENT_DATE', 'As datas desta edição são inválidas. Revise os dados da edição.');
    // Uma edição já encerrada necessariamente também já começou. Essa
    // precedência evita bloquear o registro histórico por diferenças de
    // representação do TIMESTAMPTZ entre PostgreSQL local e PostgREST.
    if (endsAt > nowMs && startsAt > nowMs) throw new HttpError(409, 'EVENT_NOT_STARTED', 'A presença só pode ser registrada depois do início do evento.');
    const data = validateAttendance(input);
    const now = new Date().toISOString();
    const rows = await this.gateway.request('rest/v1/application_attendance?on_conflict=application_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: { application_id: applicationId, attended: data.attended, note: data.note, recorded_by_user_id: principal.id, recorded_at: now, updated_at: now }
    });
    return rows[0];
  }

  async mine(principal) {
    const exhibitor = await this.exhibitor(principal);
    const applications = await this.gateway.request(`rest/v1/applications?select=id,fair_edition_id,status&exhibitor_id=eq.${exhibitor.id}&status=eq.CONFIRMED`);
    if (!applications.length) return [];
    const applicationIds = applications.map((item) => item.id);
    const editionIds = [...new Set(applications.map((item) => item.fair_edition_id))];
    const [editions, attendance, evaluations] = await Promise.all([
      this.gateway.request(`rest/v1/fair_editions?select=id,title,slug,starts_at,ends_at,status&id=in.(${ids(editionIds)})&order=ends_at.desc`),
      this.gateway.request(`rest/v1/application_attendance?select=application_id,attended,recorded_at&application_id=in.(${ids(applicationIds)})`),
      this.gateway.request(`rest/v1/event_evaluations?select=*&application_id=in.(${ids(applicationIds)})`)
    ]);
    const editionById = new Map(editions.map((item) => [item.id, item]));
    const attendanceById = new Map(attendance.map((item) => [item.application_id, item]));
    const evaluationById = new Map(evaluations.map((item) => [item.application_id, item]));
    return applications.map((application) => {
      const edition = editionById.get(application.fair_edition_id);
      const attendanceItem = attendanceById.get(application.id) || null;
      return {
        ...application,
        edition,
        attendance: attendanceItem,
        evaluation: evaluationById.get(application.id) || null,
        eligible: Boolean(edition && attendanceItem?.attended && edition.status !== 'CANCELLED' && new Date(edition.ends_at).getTime() <= Date.now())
      };
    }).sort((a, b) => new Date(b.edition?.ends_at || 0) - new Date(a.edition?.ends_at || 0));
  }

  async submit(applicationId, input, principal) {
    const exhibitor = await this.exhibitor(principal);
    validateUuid(applicationId, 'Inscrição');
    const applications = await this.gateway.request(`rest/v1/applications?select=id,fair_edition_id,status,exhibitor_id&id=eq.${applicationId}&limit=1`);
    const application = applications[0];
    if (!application || application.exhibitor_id !== exhibitor.id) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Participação não encontrada.');
    const [edition, attendance] = await Promise.all([
      this.gateway.request(`rest/v1/fair_editions?select=id,ends_at,status&id=eq.${application.fair_edition_id}&limit=1`),
      this.gateway.request(`rest/v1/application_attendance?select=attended&application_id=eq.${application.id}&limit=1`)
    ]);
    if (application.status !== 'CONFIRMED' || !attendance[0]?.attended || !edition[0] || edition[0].status === 'CANCELLED' || new Date(edition[0].ends_at).getTime() > Date.now()) {
      throw new HttpError(409, 'EVALUATION_NOT_ALLOWED', 'A avaliação fica disponível após o evento para expositores com presença confirmada.');
    }
    const data = validateEvaluation(input);
    const now = new Date().toISOString();
    const rows = await this.gateway.request('rest/v1/event_evaluations?on_conflict=application_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: {
        application_id: application.id,
        organization_communication_rating: data.organizationCommunicationRating,
        structure_rating: data.structureRating,
        publicity_rating: data.publicityRating,
        audience_rating: data.audienceRating,
        overall_rating: data.overallRating,
        sales_rating: data.salesRating,
        comments: data.comments,
        updated_at: now
      }
    });
    return rows[0];
  }

  async publicEditionSummary(slug) {
    const editions = await this.gateway.request(`rest/v1/fair_editions?select=id,fair_id,title,ends_at,status&slug=eq.${encodeURIComponent(slug)}&status=eq.PUBLISHED&limit=1`);
    const edition = editions[0];
    if (!edition) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    const fairs = await this.gateway.request(`rest/v1/fairs?select=id,organization_id,is_active&id=eq.${edition.fair_id}&is_active=eq.true&limit=1`);
    if (!fairs[0]) throw new HttpError(404, 'FAIR_EDITION_NOT_FOUND', 'Edição não encontrada.');
    const applications = await this.gateway.request(`rest/v1/applications?select=id&fair_edition_id=eq.${edition.id}&status=eq.CONFIRMED`);
    const applicationIds = applications.map((item) => item.id);
    const rows = applicationIds.length ? await this.gateway.request(`rest/v1/event_evaluations?select=*&application_id=in.(${ids(applicationIds)})`) : [];
    return { editionId: edition.id, organizationId: fairs[0].organization_id, ...summarize(rows) };
  }

  async publicOrganizationSummary(organizationId) {
    validateUuid(organizationId, 'Associação');
    const organizations = await this.gateway.request(`rest/v1/organizations?select=id,display_name&id=eq.${organizationId}&limit=1`);
    if (!organizations[0]) throw new HttpError(404, 'ORGANIZATION_NOT_FOUND', 'Associação não encontrada.');
    const fairs = await this.gateway.request(`rest/v1/fairs?select=id&organization_id=eq.${organizationId}&is_active=eq.true`);
    if (!fairs.length) return { organization: organizations[0], responseCount: 0, metrics: summarize([]).metrics };
    const editions = await this.gateway.request(`rest/v1/fair_editions?select=id&fair_id=in.(${ids(fairs.map((item) => item.id))})&status=eq.PUBLISHED`);
    if (!editions.length) return { organization: organizations[0], responseCount: 0, metrics: summarize([]).metrics };
    const applications = await this.gateway.request(`rest/v1/applications?select=id,fair_edition_id&fair_edition_id=in.(${ids(editions.map((item) => item.id))})&status=eq.CONFIRMED`);
    if (!applications.length) return { organization: organizations[0], responseCount: 0, metrics: summarize([]).metrics };
    const rows = await this.gateway.request(`rest/v1/event_evaluations?select=*&application_id=in.(${ids(applications.map((item) => item.id))})`);
    const editionByApplication = new Map(applications.map((item) => [item.id, item.fair_edition_id]));
    const grouped = new Map();
    for (const row of rows) {
      const editionId = editionByApplication.get(row.application_id);
      if (!grouped.has(editionId)) grouped.set(editionId, []);
      grouped.get(editionId).push(row);
    }
    const eligibleRows = [...grouped.values()].filter((items) => items.length >= 3).flat();
    return { organization: organizations[0], ...summarize(eligibleRows) };
  }
}
