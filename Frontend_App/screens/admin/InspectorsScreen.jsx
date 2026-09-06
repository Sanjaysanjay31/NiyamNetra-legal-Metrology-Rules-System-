import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Modal, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import SegmentControl from '../../components/SegmentControl';
import EmptyState from '../../components/EmptyState';
import Input from '../../components/Input';
import PrimaryButton from '../../components/PrimaryButton';
import { fetchUsers, createUser, updateUser, setUserActive, resetInstall } from '../../api/admin';

// §5.8 Admin Inspectors — live roster from /admin/users with full in-app
// management: create, edit, activate/deactivate, and reset device binding.
const initials = (name) => (name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

const EMPTY_FORM = { id: null, employee_id: '', full_name: '', password: '', role: 'inspector', jurisdiction: '', email: '', phone: '' };

export default function InspectorsScreen() {
  const [tab, setTab] = useState('all');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // form modal (create + edit)
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState('create'); // create | edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // reset-device modal
  const [resetOpen, setResetOpen] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { setUsers(await fetchUsers()); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const inspectors = users.filter((u) => u.role === 'inspector');
  const activeCount = inspectors.filter((u) => u.is_active).length;
  const shown = inspectors.filter((u) => (tab === 'all' ? true : tab === 'active' ? u.is_active : !u.is_active));

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => { setMode('create'); setForm(EMPTY_FORM); setFormError(''); setFormOpen(true); };
  const openEdit = (u) => {
    setMode('edit');
    setForm({ id: u.id, employee_id: u.employee_id, full_name: u.full_name, password: '', role: u.role, jurisdiction: u.jurisdiction || '', email: u.email || '', phone: u.phone || '', is_active: u.is_active });
    setFormError(''); setFormOpen(true);
  };

  const submitForm = async () => {
    const name = form.full_name.trim();
    if (name.length < 2) { setFormError('Full name is required (min 2 characters).'); return; }
    if (mode === 'create') {
      if (form.employee_id.trim().length < 3) { setFormError('Employee ID must be at least 3 characters.'); return; }
      if (form.password.length < 12) { setFormError('Password must be at least 12 characters.'); return; }
    }
    setSaving(true); setFormError('');
    try {
      if (mode === 'create') {
        // Empty optional strings are sent as null/omitted (same as edit), so
        // the server never stores "" as a jurisdiction/email/phone.
        const body = {
          employee_id: form.employee_id.trim(),
          full_name: name,
          password: form.password,
          role: form.role,
        };
        if (form.jurisdiction.trim()) body.jurisdiction = form.jurisdiction.trim();
        if (form.email.trim()) body.email = form.email.trim();
        if (form.phone.trim()) body.phone = form.phone.trim();
        await createUser(body);
      } else {
        // UserOut does not echo email/phone, so we cannot tell an unchanged
        // value from a cleared one — only send those if the admin typed
        // something, to avoid silently wiping a stored contact. jurisdiction IS
        // returned (form is pre-filled), so clearing it to null is intentional.
        const changes = { full_name: name, role: form.role, jurisdiction: form.jurisdiction.trim() || null };
        if (form.email.trim()) changes.email = form.email.trim();
        if (form.phone.trim()) changes.phone = form.phone.trim();
        await updateUser(form.id, changes);
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setFormError(typeof detail === 'string' ? detail : 'Could not save. Check the fields and your connection.');
    } finally { setSaving(false); }
  };

  const toggleActive = async () => {
    setSaving(true); setFormError('');
    try { await setUserActive(form.id, !form.is_active); setFormOpen(false); await load(); }
    catch { setFormError('Could not change status. Try again.'); }
    finally { setSaving(false); }
  };

  const openReset = (u) => { setResetTarget(u); setResetReason(''); setResetError(''); setFormOpen(false); setResetOpen(true); };
  const doReset = async () => {
    if (resetReason.trim().length < 10) { return; }
    setResetBusy(true); setResetError('');
    try {
      await resetInstall(resetTarget.id, resetReason.trim());
      // Close only on success — on failure the modal stays open with the
      // error so the admin can retry without retyping the reason.
      setResetOpen(false);
      await load();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Could not reset device binding. Try again.';
      setResetError(msg);
      Alert.alert('Reset failed', msg);
    }
    finally { setResetBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Inspectors" subtitle={`${inspectors.length} officers`} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <PrimaryButton title="Add inspector" icon="+" onPress={openCreate} style={{ marginBottom: spacing.md }} />

        <SegmentControl
          selected={tab}
          onSelect={setTab}
          options={[
            { key: 'all', label: 'All', count: inspectors.length },
            { key: 'active', label: 'Active', count: activeCount },
            { key: 'inactive', label: 'Inactive', count: inspectors.length - activeCount },
          ]}
          scrollable
        />

        {loading ? (
          <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.netraTeal} />
          </View>
        ) : error ? (
          <EmptyState icon="⚠️" title="Could not load inspectors" subtitle="Check your connection and try again." actionLabel="Retry" onAction={load} />
        ) : shown.length === 0 ? (
          <EmptyState icon="👥" title="No inspectors" subtitle="Tap “Add inspector” to create one." />
        ) : (
          <View style={{ marginTop: spacing.md }}>
            {shown.map((insp) => (
              <Pressable key={insp.id} onPress={() => openEdit(insp)}>
                <Card padding="md" style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.niyamBlue, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md }}>
                      <Text style={{ color: colors.white, fontSize: 15, fontWeight: '700' }}>{initials(insp.full_name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{insp.full_name}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>
                        {insp.employee_id}{insp.jurisdiction ? ` • ${insp.jurisdiction}` : ''}
                      </Text>
                      {!!insp.install_id && (
                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                          device {String(insp.install_id).slice(0, 12)}{String(insp.install_id).length > 12 ? '…' : ''}
                        </Text>
                      )}
                    </View>
                    <View style={{ backgroundColor: insp.is_active ? colors.pass.fill : colors.notAssessed.fill, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ color: insp.is_active ? colors.pass.text : colors.notAssessed.text, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{insp.is_active ? 'Active' : 'Inactive'}</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FORM_MODAL */}
      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '90%', paddingTop: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{mode === 'create' ? 'Add inspector' : 'Edit inspector'}</Text>
                <Pressable onPress={() => setFormOpen(false)} hitSlop={10}><Text style={{ fontSize: 22, color: colors.textMuted }}>✕</Text></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }} keyboardShouldPersistTaps="handled">
                {mode === 'create' && (
                  <Input label="Employee ID" value={form.employee_id} onChangeText={set('employee_id')} placeholder="e.g. INS-1042" autoCapitalize="characters" />
                )}
                {mode === 'edit' && (
                  <Input label="Employee ID" value={form.employee_id} editable={false} />
                )}
                <Input label="Full name" value={form.full_name} onChangeText={set('full_name')} placeholder="Officer name" autoCapitalize="words" />
                {mode === 'create' && (
                  <Input label="Password (min 12 characters)" value={form.password} onChangeText={set('password')} placeholder="Temporary password" secureTextEntry />
                )}
                <Text style={typography.label}>Role</Text>
                <View style={{ marginTop: spacing.xs, marginBottom: spacing.md }}>
                  <SegmentControl selected={form.role} onSelect={set('role')} options={[{ key: 'inspector', label: 'Inspector' }, { key: 'admin', label: 'Admin' }]} />
                </View>
                <Input label="Jurisdiction (optional)" value={form.jurisdiction} onChangeText={set('jurisdiction')} placeholder="e.g. Hyderabad North" autoCapitalize="words" />
                <Input label="Email (optional)" value={form.email} onChangeText={set('email')} placeholder="officer@lm.gov.in" keyboardType="email-address" />
                <Input label="Phone (optional)" value={form.phone} onChangeText={set('phone')} placeholder="10-digit mobile" keyboardType="phone-pad" />

                {!!formError && <Text style={{ color: colors.violation.text, fontSize: 12, marginBottom: spacing.sm }}>{formError}</Text>}

                <PrimaryButton title={mode === 'create' ? 'Create inspector' : 'Save changes'} onPress={submitForm} loading={saving} style={{ marginTop: spacing.xs }} />

                {mode === 'edit' && (
                  <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
                    <PrimaryButton title={form.is_active ? 'Deactivate account' : 'Reactivate account'} variant={form.is_active ? 'danger' : 'secondary'} onPress={toggleActive} loading={saving} style={{ marginBottom: spacing.sm }} />
                    <PrimaryButton title="Reset device binding" variant="outline" onPress={() => openReset(form)} />
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* RESET_MODAL */}
      <Modal visible={resetOpen} animationType="fade" transparent onRequestClose={() => setResetOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.lg }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.xs }}>Reset device binding</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.md }}>
              {resetTarget ? `${resetTarget.full_name} (${resetTarget.employee_id}) will be unbound from their current device and can sign in on a new phone. Their active sessions end immediately.` : ''}
            </Text>
            <Input label="Reason (min 10 characters)" value={resetReason} onChangeText={setResetReason} placeholder="e.g. Officer changed handset" multiline />
            {!!resetError && <Text style={{ color: colors.violation.text, fontSize: 12, marginBottom: spacing.sm }}>{resetError}</Text>}
            <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
              <PrimaryButton title="Cancel" variant="outline" onPress={() => setResetOpen(false)} style={{ flex: 1, marginRight: spacing.sm }} />
              <PrimaryButton title="Reset" variant="danger" onPress={doReset} loading={resetBusy} disabled={resetReason.trim().length < 10} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
