import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import SegmentControl from '../../components/SegmentControl';
import EmptyState from '../../components/EmptyState';
import Input from '../../components/Input';
import PrimaryButton from '../../components/PrimaryButton';
import { fetchDashboard, fetchInspections, fetchStores, fetchUsers } from '../../api/admin';

let Sharing = null;
let LegacyFS = null;
try { Sharing = require('expo-sharing'); } catch { Sharing = null; }
try { LegacyFS = require('expo-file-system/legacy'); } catch { LegacyFS = null; }

// §5.10 Admin Reports - compliance analytics (live /admin/dashboard)
export default function ReportsScreen({ navigation }) {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [stores, setStores] = useState([]);
  const [users, setUsers] = useState([]);
  const [inspectorFilter, setInspectorFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // null | 'forbidden' | 'network'
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [d, insp, st, us] = await Promise.all([
          fetchDashboard(period),
          fetchInspections(),
          fetchStores(),
          fetchUsers(),
        ]);
        if (!mounted) return;
        setData(d);
        setInspections(Array.isArray(insp) ? insp : insp?.items || insp?.results || []);
        setStores(Array.isArray(st) ? st : []);
        setUsers(Array.isArray(us) ? us : []);
      } catch (e) {
        if (!mounted) return;
        const status = e?.status ?? e?.response?.status;
        setError(status === 403 || e?.code === 'FORBIDDEN' ? 'forbidden' : 'network');
      }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [period]);

  const counts = data?.counts || { total: 0, compliant: 0, violation: 0 };
  const rate = counts.total > 0 ? Math.round((counts.compliant / counts.total) * 100) : 0;
  const topChecks = data?.top_failed_checks || [];
  const trend = (data?.trend || []).slice(-7);

  // Inspector filter (client-side over /inspections — the dashboard aggregates
  // are period-wide and cannot be split server-side, so this filters the
  // breakdown lists below, not the headline cards).
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.full_name])), [users]);
  const filteredInspections = useMemo(() => {
    const f = inspectorFilter.trim().toLowerCase();
    if (!f) return inspections;
    return inspections.filter((i) => (userMap[i.user_id] || `officer #${i.user_id}`).toLowerCase().includes(f));
  }, [inspections, inspectorFilter, userMap]);

  // Store breakdown list from inspection rows (honest: counts of rows seen).
  const storeMap = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s.name])), [stores]);
  const storeBreakdown = useMemo(() => {
    const acc = {};
    filteredInspections.forEach((i) => {
      const name = storeMap[i.store_id] || `Store #${i.store_id}`;
      acc[name] = (acc[name] || 0) + 1;
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [filteredInspections, storeMap]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = [['inspection_id', 'store', 'inspector', 'date', 'status', 'scans']];
      filteredInspections.forEach((i) => {
        rows.push([
          i.id,
          `"${(storeMap[i.store_id] || `Store #${i.store_id}`).replace(/"/g, '""')}"`,
          `"${(userMap[i.user_id] || `Officer #${i.user_id}`).replace(/"/g, '""')}"`,
          i.inspection_date || '',
          i.status || '',
          i.scan_count ?? '',
        ]);
      });
      const csv = rows.map((r) => r.join(',')).join('\n');
      if (LegacyFS?.documentDirectory && Sharing?.shareAsync) {
        const path = `${LegacyFS.documentDirectory}niyamnetra-report-${period}.csv`;
        await LegacyFS.writeAsStringAsync(path, csv);
        const available = await Sharing.isAvailableAsync().catch(() => false);
        if (available) {
          await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export report CSV' });
        } else {
          Alert.alert('Export ready', `CSV written to ${path} but no share sheet is available on this device.`);
        }
      } else {
        Alert.alert('Export unavailable', 'CSV export needs a device build with expo-sharing (not available in this preview).');
      }
    } catch (e) {
      Alert.alert('Export failed', 'Could not generate the CSV. Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Analytics & Reports" subtitle="State-wide compliance data" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <SegmentControl
          selected={period}
          onSelect={setPeriod}
          options={[
            { key: 'week', label: 'Week' },
            { key: 'month', label: 'Month' },
            { key: 'quarter', label: 'Quarter' },
          ]}
        />

        {loading ? (
          <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.netraTeal} />
          </View>
        ) : error ? (
          <EmptyState
            icon="⚠️"
            title={error === 'forbidden' ? 'Not permitted' : 'Could not load reports'}
            subtitle={error === 'forbidden'
              ? 'Your account cannot view reports. Contact your administrator.'
              : 'Check your connection and try again.'}
          />
        ) : (
          <>
            <View style={{ flexDirection: 'row', marginTop: spacing.lg, marginBottom: spacing.md }}>
              <StatCard label="Inspections" value={data?.inspections ?? 0} />
              <StatCard label="Success" value={counts.compliant} color={colors.pass.text} />
            </View>
            <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
              <StatCard label="Violations" value={counts.violation} color={colors.violation.text} alert />
              <StatCard label="Success Rate" value={`${rate}%`} color={colors.netraTeal} />
            </View>

            <Input
              label="Filter by inspector"
              value={inspectorFilter}
              onChangeText={setInspectorFilter}
              placeholder="Type officer name"
            />
            {inspectorFilter.trim() ? (
              <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: spacing.md }}>
                Showing {filteredInspections.length} of {inspections.length} inspections. Headline cards stay period-wide.
              </Text>
            ) : null}

            <Card title="Store breakdown" padding="none" style={{ marginBottom: spacing.md }}>
              {storeBreakdown.length === 0 ? (
                <View style={{ padding: spacing.md }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>No inspections in this view.</Text>
                </View>
              ) : storeBreakdown.slice(0, 10).map(([name, n], idx, arr) => (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: idx < Math.min(arr.length, 10) - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }}>{name}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.niyamBlue }}>{n}</Text>
                </View>
              ))}
            </Card>

            <PrimaryButton title={exporting ? 'Exporting…' : 'Export CSV'} onPress={exportCsv} disabled={exporting} variant="outline" style={{ marginBottom: spacing.md }} />

            <Card title="Top Violation Types" padding="none" style={{ marginBottom: spacing.md }}>
              {topChecks.length === 0 ? (
                <View style={{ padding: spacing.md }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>No violations recorded in this period.</Text>
                </View>
              ) : topChecks.map((v, idx, arr) => (
                <View key={v.check_id} style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
                  <View style={{ width: 52, height: 32, borderRadius: 8, backgroundColor: colors.violation.fill, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md }}>
                    {/* Preserve the full check id incl. letter suffixes (CHK06b ≠ CHK06) */}
                    <Text style={{ color: colors.violation.text, fontSize: 11, fontWeight: '700' }}>{String(v.check_id)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{v.title}</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.violation.text }}>{v.count}</Text>
                </View>
              ))}
            </Card>

            <Card title="Daily Trend" padding="none">
              {trend.length === 0 ? (
                <View style={{ padding: spacing.md }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>No activity in this period.</Text>
                </View>
              ) : trend.map((t, idx, arr) => (
                <View key={t.day} style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
                  <Text style={{ flex: 1, fontSize: 13, color: colors.text }}>{t.day}</Text>
                  <Text style={{ fontSize: 12, color: colors.pass.text, marginRight: spacing.md }}>✓ {t.counts?.success ?? 0}</Text>
                  <Text style={{ fontSize: 12, color: colors.violation.text }}>! {t.counts?.violation ?? 0}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
