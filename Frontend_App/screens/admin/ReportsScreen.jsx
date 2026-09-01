import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import SegmentControl from '../../components/SegmentControl';
import EmptyState from '../../components/EmptyState';
import { fetchDashboard } from '../../api/admin';

// §5.10 Admin Reports - compliance analytics (live /admin/dashboard)
export default function ReportsScreen({ navigation }) {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setError(false);
    (async () => {
      try {
        const d = await fetchDashboard(period);
        if (mounted) setData(d);
      } catch { if (mounted) setError(true); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [period]);

  const counts = data?.counts || { total: 0, compliant: 0, violation: 0 };
  const rate = counts.total > 0 ? Math.round((counts.compliant / counts.total) * 100) : 0;
  const topChecks = data?.top_failed_checks || [];
  const trend = (data?.trend || []).slice(-7);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Reports" subtitle="Success analytics" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
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
          <EmptyState icon="⚠️" title="Could not load reports" subtitle="Check your connection and try again." />
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

            <Card title="Top Violation Types" padding="none" style={{ marginBottom: spacing.md }}>
              {topChecks.length === 0 ? (
                <View style={{ padding: spacing.md }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>No violations recorded in this period.</Text>
                </View>
              ) : topChecks.map((v, idx, arr) => (
                <View key={v.check_id} style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
                  <View style={{ width: 40, height: 32, borderRadius: 8, backgroundColor: colors.violation.fill, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md }}>
                    <Text style={{ color: colors.violation.text, fontSize: 11, fontWeight: '700' }}>{String(v.check_id).replace(/[^0-9]/g, '') || v.check_id}</Text>
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
