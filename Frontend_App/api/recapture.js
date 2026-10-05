// api/recapture.js — Live endpoints for Smart Recapture Workflow (Phase 5B / 6B)
import { api } from './client';

/**
 * Fetch actionable recapture tasks for an inspection.
 * @param {number|string} inspectionId
 */
export async function fetchCaptureTasks(inspectionId) {
  const id = Number(inspectionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`fetchCaptureTasks: invalid inspection id ${inspectionId}`);
  }
  const { data } = await api.get(`/recapture/tasks/${id}`);
  return data;
}

/**
 * Fulfill or skip a capture task.
 * @param {string} taskId - The request_id
 * @param {Object} body
 * @param {number} body.inspection_id
 * @param {number} [body.scan_image_id] - ID of the uploaded evidence image
 * @param {string} [body.notes]
 * @param {string} [body.skip_reason] - Mandatory if skipping
 */
export async function fulfillCaptureTask(taskId, body) {
  if (!taskId) throw new Error('fulfillCaptureTask: taskId is required');
  if (!body.inspection_id) throw new Error('fulfillCaptureTask: inspection_id is required');
  const { data } = await api.post(`/recapture/tasks/${taskId}/fulfill`, body);
  return data;
}

/**
 * Trigger re-assessment of specified scans after new evidence has been uploaded.
 * @param {Object} body
 * @param {number} body.inspection_id
 * @param {number[]} body.scan_ids
 */
export async function triggerReassessment(body) {
  if (!body.inspection_id) throw new Error('triggerReassessment: inspection_id is required');
  if (!Array.isArray(body.scan_ids) || body.scan_ids.length === 0) {
    throw new Error('triggerReassessment: scan_ids array is required');
  }
  const { data } = await api.post('/recapture/reassess', body);
  return data;
}

/**
 * Fetch panel coverage and evidence completeness for an inspection.
 * @param {number|string} inspectionId
 */
export async function fetchPanelCoverage(inspectionId) {
  const id = Number(inspectionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`fetchPanelCoverage: invalid inspection id ${inspectionId}`);
  }
  const { data } = await api.get(`/recapture/coverage/${id}`);
  return data;
}
