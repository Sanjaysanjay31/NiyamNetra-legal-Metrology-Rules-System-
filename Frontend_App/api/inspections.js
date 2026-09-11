// api/inspections.js — Live endpoints for inspection & scan lifecycle
import { api } from './client';

export async function fetchStores() {
  const { data } = await api.get('/stores');
  return Array.isArray(data) ? data : data?.items || [];
}

export async function fetchTodayStats() {
  try {
    const { data } = await api.get('/reports/today');
    return data;
  } catch (e) {
    return null;
  }
}

export async function fetchInspectionsList(params = {}) {
  const { data } = await api.get('/inspections', { params });
  return Array.isArray(data) ? data : data?.items || [];
}

export async function fetchInspectionDetails(inspectionId) {
  const { data } = await api.get(`/inspections/${inspectionId}`);
  return data;
}

export async function createInspection(body) {
  const { data } = await api.post('/inspections', body);
  return data;
}

export async function createScan(inspectionId, scanBody) {
  const { data } = await api.post(`/inspections/${inspectionId}/scans`, scanBody);
  return data;
}

export async function uploadScanImage(scanId, panel, imageUri) {
  const formData = new FormData();
  formData.append('panel', panel);

  const filename = imageUri.split('/').pop() || `panel_${panel}.jpg`;
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  formData.append('file', {
    uri: imageUri,
    name: filename,
    type,
  });

  // Let axios/React Native generate the multipart boundary itself: an explicit
  // Content-Type arrives without a boundary on some RN builds and the backend
  // then cannot split the parts (same fix as uploadEvidenceFile in SyncProvider).
  const { data } = await api.post(`/scans/${scanId}/images`, formData, { timeout: 60000 });
  return data;
}

export async function updateScanScope(scanId, scopeFlags) {
  const { data } = await api.patch(`/scans/${scanId}`, scopeFlags);
  return data;
}

export async function assessScan(scanId) {
  const { data } = await api.post(`/scans/${scanId}/assess`);
  return data;
}

export async function fetchScanDetails(scanId) {
  const { data } = await api.get(`/scans/${scanId}`);
  return data;
}

export async function overrideFinding(findingId, humanVerdict, overrideReason) {
  // PATCH /admin/findings/{finding_id} (routers/admin.py, admin-only).
  // Guard the id so a bad caller gets a clear thrown error instead of a
  // confusing 404 from the literal path /admin/findings/undefined.
  const id = Number(findingId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error(`overrideFinding: invalid finding id ${JSON.stringify(findingId)}`);
    err.status = 400;
    throw err;
  }
  const { data } = await api.patch(`/admin/findings/${id}`, {
    human_verdict: humanVerdict,
    override_reason: overrideReason,
  });
  return data;
}

export async function submitInspection(inspectionId, { signature_status = 'signed', notes = '' }) {
  const { data } = await api.post(`/inspections/${inspectionId}/submit`, {
    signature_status,
    notes,
  });
  return data;
}
