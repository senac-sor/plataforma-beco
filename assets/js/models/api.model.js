const SESSION_KEY = 'becoSession';
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3333/api/v1' : '/api/v1';

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ApiModel {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
    this.refreshing = null;
  }

  session() {
    try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  saveSession(payload) {
    const session = payload?.session;
    const account = payload?.account;
    if (!session?.accessToken || !account?.role) throw new ApiError('Sessao invalida.', 500, 'INVALID_SESSION');
    const value = { ...session, account, exhibitor: payload.exhibitor || null };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    return value;
  }

  clearSession() {
    window.localStorage.removeItem(SESSION_KEY);
  }

  async request(path, options = {}, retry = true) {
    const session = this.session();
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.auth !== false && session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    let response;
    try { response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    }); } catch { throw new ApiError('Não foi possível conectar. Confira sua conexão e tente novamente.', 0, 'NETWORK_ERROR'); }
    if (response.status === 401 && options.auth !== false && retry && session?.refreshToken && path !== '/auth/refresh') {
      try {
        this.refreshing ||= this.request('/auth/refresh', { method: 'POST', body: { refreshToken: session.refreshToken }, auth: false }, false).then(value => this.saveSession(value)).finally(() => { this.refreshing = null; });
        await this.refreshing;
      } catch (error) { if ([400,401,403].includes(error.status)) this.clearSession(); throw error; }
      return this.request(path, options, false);
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(payload?.error?.message || 'Nao foi possivel carregar os dados.', response.status, payload?.error?.code);
    return payload?.data ?? payload;
  }

  async upload(file, path, extra = {}) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) throw new ApiError('Envie imagens JPG, PNG ou WebP de até 10 MB.', 422, 'INVALID_FILE');
    const metadata = { originalFilename: file.name, mimeType: file.type, byteSize: file.size, ...extra };
    const signed = await this.request(`${path}/upload-url`, { method: 'POST', body: metadata });
    const response = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!response.ok) throw new ApiError('O envio da imagem falhou. Tente novamente.', response.status, 'UPLOAD_FAILED');
    return this.request(path, { method: 'POST', body: { ...metadata, objectPath: signed.objectPath } });
  }

  fairs(city) { return this.request(`/fairs${city ? `?city=${encodeURIComponent(city)}` : ''}`, { auth: false }); }
  async openEditions(now = new Date()) {
    const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const fairs = await this.fairs();
    return fairs.flatMap(fair => (fair.editions || []).map(edition => ({
      ...edition,
      fair: { id: fair.id, name: fair.name, slug: fair.slug, short_description: fair.short_description, description: fair.description }
    }))).filter(edition => {
      const opensAt = edition.registration_opens_at ? new Date(edition.registration_opens_at).getTime() : null;
      const closesAt = edition.registration_closes_at ? new Date(edition.registration_closes_at).getTime() : null;
      const endsAt = new Date(edition.ends_at).getTime();
      return edition.status === 'REGISTRATION_OPEN'
        && Number.isFinite(endsAt) && endsAt > timestamp
        && (opensAt === null || (Number.isFinite(opensAt) && opensAt <= timestamp))
        && (closesAt === null || (Number.isFinite(closesAt) && closesAt >= timestamp));
    }).sort((left, right) => new Date(left.registration_closes_at || left.starts_at) - new Date(right.registration_closes_at || right.starts_at));
  }
  fair(slug) { return this.request(`/fair-editions/${encodeURIComponent(slug)}`, { auth: false }); }
  exhibitors(city) { return this.request(`/exhibitors${city ? `?city=${encodeURIComponent(city)}` : ''}`, { auth: false }); }
  exhibitor(id) { return this.request(`/exhibitors/${encodeURIComponent(id)}`, { auth: false }); }
  exhibitorCategories() { return this.request('/exhibitor-categories', { auth: false }); }
  login(email, password) { return this.request('/auth/login', { method: 'POST', body: { email, password }, auth: false }); }
  me() { return this.request('/auth/me'); }
  myExhibitor() { return this.request('/me/exhibitor'); }
  myApplications() { return this.request('/me/applications'); }
  myEvaluations() { return this.request('/me/evaluations'); }
  saveEvaluation(applicationId, body) { return this.request(`/me/applications/${encodeURIComponent(applicationId)}/evaluation`, { method: 'PUT', body }); }
  editionEvaluationSummary(slug) { return this.request(`/fair-editions/${encodeURIComponent(slug)}/evaluation-summary`, { auth: false }); }
  organizationEvaluationSummary(id) { return this.request(`/organizations/${encodeURIComponent(id)}/evaluation-summary`, { auth: false }); }
  curationDashboard() { return this.request('/curation/dashboard'); }
  adminFairs() { return this.request('/admin/fairs'); }
  curationApplications(editionId) { return this.request(`/curation/fair-editions/${encodeURIComponent(editionId)}/applications`); }
  editionParticipation(editionId) { return this.request(`/curation/fair-editions/${encodeURIComponent(editionId)}/participation`); }
  recordAttendance(applicationId, body) { return this.request(`/curation/applications/${encodeURIComponent(applicationId)}/attendance`, { method: 'PUT', body }); }
  async logout() {
    try { await this.request('/auth/logout', { method: 'POST' }); } finally { this.clearSession(); }
  }
}

export const api = new ApiModel();
