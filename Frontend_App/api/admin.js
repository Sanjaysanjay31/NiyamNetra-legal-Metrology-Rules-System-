// Admin data layer — every admin screen pulls live data through these helpers
// instead of hardcoded arrays. All calls go through the shared axios instance
// (which already attaches the Bearer token after login). Endpoints verified
// against the backend routers: /admin/* , /inspections , /stores , /auth/me.
import { api } from './client';

// Map a UI period to a concrete [start,end] date range (YYYY-MM-DD, inclusive).
export function rangeFor(period) {
  const days = { today: 0, week: 6, month: 29, quarter: 89 }[period] ?? 29;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export async function fetchDashboard(period = 'month') {
  const { start, end } = rangeFor(period);
  const { data } = await api.get('/admin/dashboard', { params: { start, end } });
  return data; // AdminDashboardResponse
}

export async function fetchUsers() {
  const { data } = await api.get('/admin/users');
  return data; // UserOut[]
}

export async function fetchInspections(params = {}) {
  const { data } = await api.get('/inspections', { params });
  return data; // inspection dicts (newest first)
}

export async function fetchStores() {
  const { data } = await api.get('/stores');
  return data; // store rows
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me');
  return data; // UserOut
}

// ---- Inspector management (admin write actions) --------------------------
// Backed by routers/admin.py: POST /admin/users, PATCH /admin/users/{id},
// POST /admin/users/{id}/reset-install. All require an admin bearer token.

// Create an officer. password must be >= 12 chars (backend CreateUserRequest).
export async function createUser({ employee_id, full_name, password, role = 'inspector', jurisdiction, email, phone }) {
  const body = { employee_id, full_name, password, role };
  if (jurisdiction) body.jurisdiction = jurisdiction;
  if (email) body.email = email;
  if (phone) body.phone = phone;
  const { data } = await api.post('/admin/users', body);
  return data; // UserOut
}

// Patch mutable fields (full_name, role, jurisdiction, is_active, email, phone).
// Only send what changed — UpdateUserRequest treats every field as optional.
export async function updateUser(id, changes) {
  const { data } = await api.patch(`/admin/users/${id}`, changes);
  return data; // UserOut
}

// Deactivate / reactivate is just an is_active patch.
export async function setUserActive(id, isActive) {
  return updateUser(id, { is_active: isActive });
}

// Unbind an officer's device so they can sign in on a new phone. reason >= 10 chars.
export async function resetInstall(id, reason) {
  const { data } = await api.post(`/admin/users/${id}/reset-install`, { reason });
  return data; // { user_id, install_id: null }
}
