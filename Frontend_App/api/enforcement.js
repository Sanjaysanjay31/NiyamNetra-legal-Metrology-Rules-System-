// api/enforcement.js — Real Phase 5C & 6C Enforcement and Report API
import { api, getApiBaseUrl } from './client';

/**
 * Fetch comprehensive compliance summary for an inspection.
 * Calls GET /enforcement/summary/{inspection_id}
 */
export async function fetchComplianceSummary(inspectionId) {
  const { data } = await api.get(`/enforcement/summary/${inspectionId}`);
  return data;
}

/**
 * Fetch violation dossier for an inspection or scan.
 * Calls GET /enforcement/dossier/{identifier}
 */
export async function fetchViolationDossier(identifier) {
  const { data } = await api.get(`/enforcement/dossier/${identifier}`);
  return data;
}

/**
 * Quick-lookup legal reference for a specific check ID.
 * Calls GET /enforcement/reference/{check_id}
 */
export async function fetchLegalReference(checkId) {
  const { data } = await api.get(`/enforcement/reference/${checkId}`);
  return data;
}

/**
 * Get the direct download URL for the deterministic inspection PDF.
 * Calls GET /reports/inspections/{inspection_id}/pdf
 */
export function getInspectionPdfUrl(inspectionId) {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/reports/inspections/${inspectionId}/pdf`;
}

/**
 * Fetch raw structured inspection report including live scan & finding data.
 */
export async function fetchInspectionReportData(inspectionId) {
  const [summary, inspDetails] = await Promise.all([
    fetchComplianceSummary(inspectionId).catch(() => null),
    api.get(`/inspections/${inspectionId}`).then((r) => r.data).catch(() => null),
  ]);

  return {
    inspection_id: inspectionId,
    summary,
    details: inspDetails,
    fetched_at: new Date().toISOString(),
  };
}
