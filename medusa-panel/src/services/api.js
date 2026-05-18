import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  timeout: 15_000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!err.response) {
      console.error('[API] Network Error — backend pode estar offline ou CORS bloqueando:', err.message);
    }
    return Promise.reject(err);
  }
);

// ── Identidade / WhatsApp ─────────────────────────────────────────────────────

export function startWhatsApp(accountId) {
  return api.post('/whatsapp/start', { accountId });
}

export function getQrCode(accountId) {
  return api.get(`/whatsapp/qrcode/${accountId}`);
}

// ── Relatórios / Dashboard ────────────────────────────────────────────────────

export function getDashboardStats() {
  return api.get('/reports/dashboard');
}

// ── Campanha / Teste ──────────────────────────────────────────────────────────

export function sendTestMessage(accountId, phone, text, media = null) {
  return api.post('/campaign/test-shoot', { accountId, phone, text, media });
}

// ── Orquestrador / Disparo ────────────────────────────────────────────────────

export function startCampaign(payload) {
  return api.post('/orchestrator/start', payload);
}

export function stopCampaign() {
  return api.post('/orchestrator/stop');
}

export function getCampaignStatus() {
  return api.get('/orchestrator/status');
}

// ── Aquecimento ───────────────────────────────────────────────────────────────

export function getWarmupConfig() {
  return api.get('/warmup/config');
}

export function updateWarmupConfig(config) {
  return api.post('/warmup/config', config);
}

export function getConnectedInstances() {
  return api.get('/whatsapp/instances');
}

export function disconnectWhatsApp(accountId) {
  return api.post(`/whatsapp/disconnect/${encodeURIComponent(accountId)}`);
}

export function getWhatsAppGroups(accountId) {
  return api.get(`/whatsapp/groups/${encodeURIComponent(accountId)}`);
}

export function deleteWhatsApp(accountId) {
  return api.delete(`/whatsapp/${encodeURIComponent(accountId)}`);
}

// ── Relatórios ────────────────────────────────────────────────────────────────

export function getCampaignsHistory() {
  return api.get('/reports/history');
}

// ── Pipeline / Listas ─────────────────────────────────────────────────────────

export function uploadList(campaignId, file) {
  const form = new FormData();
  form.append('campaign_id', campaignId);
  form.append('file', file);
  return api.post('/pipeline/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function uploadMedia(file) {
  const form = new FormData();
  form.append('file', file);
  return api.post('/media/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function getLists() {
  return api.get('/pipeline/lists');
}

export function mergeLists(newName, listIds) {
  return api.post('/pipeline/merge', { newName, listIds });
}

export function splitList(listId, blocks) {
  return api.post('/pipeline/split', { listId, blocks });
}

export function toggleList(listId, enabled) {
  return api.patch(`/pipeline/lists/${encodeURIComponent(listId)}/toggle`, { enabled });
}

export function deleteList(id) {
  return api.delete(`/pipeline/${encodeURIComponent(id)}`);
}

export function resetList(listId) {
  return api.post(`/pipeline/${encodeURIComponent(listId)}/reset`);
}

export function getListContacts(listId, page = 1, limit = 50, search = '') {
  return api.get(`/pipeline/${encodeURIComponent(listId)}/contacts`, {
    params: { page, limit, ...(search && { search }) },
  });
}

export function addListContacts(listId, phones) {
  return api.post(`/pipeline/${encodeURIComponent(listId)}/contacts`, { phones });
}

export function removeListContact(listId, phone) {
  return api.delete(`/pipeline/${encodeURIComponent(listId)}/contacts`, { data: { phone } });
}
