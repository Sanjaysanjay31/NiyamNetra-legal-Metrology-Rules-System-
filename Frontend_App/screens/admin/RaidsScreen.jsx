import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import SegmentControl from '../../components/SegmentControl';
import EmptyState from '../../components/EmptyState';
import { fetchDashboard, fetchInspections, fetchStores, fetchUsers, rangeFor } from '../../api/admin';

// §5.7 Admin Raids - live totals + recent inspection activity
export default function RaidsScreen({ navigation }) {
  const [period, setPeriod] = useState('today');
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // null | 'forbidden' | 'network'
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!mounted.current) return;
    setLoading(true); setError(null);
    try {
      const { start } = rangeFor(period);
      const [d, inspections, stores, users] = await Promise.all([
        fetchDashboard(period),
        fetchInspections({ date_from: start }),
        fetchStores(),
        fetchUsers(),
      ]);
      if (!mounted.current) return; // unmount guard: never setState after unmount
      const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));
      const userMap = Object.fromEntries(users.map((u) => [u.id, u.full_name]));
      setStats(d);
      setRecent(inspections.slice(0, 8).map((i) => ({
        id: i.id,
        store: storeMap[i.store_id] || `Store #${i.store_id}`,
        store_id: i.store_id,
        inspector: userMap[i.user_id] || `Officer #${i.user_id}`,
        status: i.status, // draft | submitted
        checks: i.scan_count,
        date: i.inspection_date,
      })));
    } catch (e) {
      if (!mounted.current) return;
      const status = e?.status ?? e?.response?.status;
      setError(status === 403 || e?.code === 'FORBIDDEN' ? 'forbidden' : 'network');
    }
    finally { if (mounted.current) setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const counts = stats?.counts || { compliant: 0, violation: 0, not_assessed: 0 };
  const reviewQueue = stats?.review_queue ?? 0;

  // Store breakdown note: per-store inspection counts from the recent window.
  const storeBreakdown = recent.reduce((acc, r) => {
    acc[r.store] = (acc[r.store] || 0) + 1;
    return acc;
  }, {});
  const breakdownNote = Object.entries(storeBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => `${name} (${n})`)
    .join(' • ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Raids Monitor" subtitle="Live inspection tracking" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <SegmentControl
          selected={period}
          onSelect={setPeriod}
          options={[
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'This Week' },
            { key: 'month', label: 'This Month' },
          ]}
        />

        {loading ? (
          <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.netraTeal} />
          </View>
        ) : error ? (
          <EmptyState
            icon="⚠️"
            title={error === 'forbidden' ? 'Not permitted' : 'Could not load data'}
            subtitle={error === 'forbidden'
              ? 'Your account cannot view raid data. Contact your administrator.'
              : 'Check your connection and try again.'}
          />
        ) : (
          <>
            <View style={{ flexDirection: 'row', marginTop: spacing.lg, marginBottom: spacing.md }}>
              <StatCard label="Inspections" value={stats?.inspections ?? 0} />
              <StatCard label="Success" value={counts.compliant} color={colors.pass.text} />
            </View>
            <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
              <StatCard label="Violations" value={counts.violation} color={colors.violation.text} alert />
              <StatCard label="Not assessed" value={counts.not_assessed ?? 0} color={colors.textMuted} />
            </View>
            <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
              <StatCard label="Under review" value={reviewQueue} color={colors.warning} subtitle="review queue" />
              <StatCard label="Active Inspectors" value={stats?.active_inspectors ?? 0} color={colors.netraTeal} />
            </View>
            {breakdownNote ? (
              <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: spacing.md }}>
                Top stores: {breakdownNote}
              </Text>
            ) : null}

            <Text style={{ ...typography.h4, marginBottom: spacing.sm }}>Recent Activity</Text>
            {recent.length === 0 ? (
              <EmptyState icon="🗒️" title="No inspections yet" subtitle="Activity will appear here as inspectors submit." />
            ) : recent.map((r) => {
              const isSubmitted = r.status === 'submitted';
              return (
                <Card key={r.id} padding="md" style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{r.store}</Text>
                        <View style={{
                          backgroundColor: isSubmitted ? colors.pass.fill : colors.notAssessed.fill,
                          borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, marginLeft: spacing.sm,
                        }}>
                          <Text style={{
                            color: isSubmitted ? colors.pass.text : colors.notAssessed.text,
                            fontSize: 10, fontWeight: '600', textTransform: 'uppercase',
                          }}>{isSubmitted ? 'submitted' : 'draft'}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>{r.inspector} • {r.date}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.niyamBlue }}>{r.checks}</Text>
                      <Text style={{ fontSize: 10, color: colors.textMuted }}>checks</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}
