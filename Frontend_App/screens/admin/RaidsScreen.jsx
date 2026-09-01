import React, { useEffect, useState, useCallback } from 'react';
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
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const { start } = rangeFor(period);
      const [d, inspections, stores, users] = await Promise.all([
        fetchDashboard(period),
        fetchInspections({ date_from: start }),
        fetchStores(),
        fetchUsers(),
      ]);
      const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));
      const userMap = Object.fromEntries(users.map((u) => [u.id, u.full_name]));
      setStats(d);
      setRecent(inspections.slice(0, 8).map((i) => ({
        id: i.id,
        store: storeMap[i.store_id] || `Store #${i.store_id}`,
        inspector: userMap[i.user_id] || `Officer #${i.user_id}`,
        status: i.status, // draft | submitted
        checks: i.scan_count,
        date: i.inspection_date,
      })));
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { let m = true; load(); return () => { m = false; }; }, [load]);

  const counts = stats?.counts || { compliant: 0, violation: 0 };

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
          <EmptyState icon="⚠️" title="Could not load data" subtitle="Check your connection and try again." />
        ) : (
          <>
            <View style={{ flexDirection: 'row', marginTop: spacing.lg, marginBottom: spacing.md }}>
              <StatCard label="Inspections" value={stats?.inspections ?? 0} />
              <StatCard label="Success" value={counts.compliant} color={colors.pass.text} />
            </View>
            <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
              <StatCard label="Violations" value={counts.violation} color={colors.violation.text} alert />
              <StatCard label="Active Inspectors" value={stats?.active_inspectors ?? 0} color={colors.netraTeal} />
            </View>

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
