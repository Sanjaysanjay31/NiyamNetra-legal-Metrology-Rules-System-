import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import SegmentControl from '../../components/SegmentControl';
import EmptyState from '../../components/EmptyState';
import VerdictBadge from '../../components/VerdictBadge';
import { fetchInspections, fetchStores, fetchUsers } from '../../api/admin';

// §5.9 Admin Records - live store-wise inspection records from /inspections.
// Primary filter is the ASSESSMENT result (All/Compliant/Violation/Not
// assessed) — the workflow status (draft/submitted) is secondary detail, not
// the headline, because a submitted row can still be not_assessed.
function assessOf(i) {
  const r = String(i?.result || i?.overall_result || i?.verdict || '').toLowerCase();
  if (['compliant', 'success', 'pass'].includes(r)) return 'compliant';
  if (['violation', 'fail', 'non_compliant', 'non-compliant'].includes(r)) return 'violation';
  if (Number(i?.result_counts?.violation || 0) > 0) return 'violation';
  if (Number(i?.result_counts?.compliant || 0) > 0) return 'compliant';
  return 'not_assessed';
}

export default function RecordsScreen({ navigation }) {
  const [filter, setFilter] = useState('all');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // null | 'forbidden' | 'network'
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [inspections, stores, users] = await Promise.all([
        fetchInspections(),
        fetchStores(),
        fetchUsers(),
      ]);
      const storeMap = Object.fromEntries(stores.map((s) => [s.id, s]));
      const userMap = Object.fromEntries(users.map((u) => [u.id, u.full_name]));
      setRecords(inspections.map((i) => {
        const s = storeMap[i.store_id];
        const loc = s ? [s.city, s.district].filter(Boolean).join(', ') : '';
        return {
          id: i.id,
          store: s?.name || `Store #${i.store_id}`,
          location: loc,
          date: i.inspection_date,
          status: i.status, // draft | submitted (secondary)
          result: assessOf(i),
          inspector: userMap[i.user_id] || `Officer #${i.user_id}`,
          checks: i.scan_count,
        };
      }));
    } catch (e) {
      const status = e?.status ?? e?.response?.status;
      setError(status === 403 || e?.code === 'FORBIDDEN' ? 'forbidden' : 'network');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const compliantCount = records.filter((r) => r.result === 'compliant').length;
  const violationCount = records.filter((r) => r.result === 'violation').length;
  const naCount = records.filter((r) => r.result === 'not_assessed').length;
  const filtered = filter === 'all' ? records : records.filter((r) => r.result === filter);

  const badgeFor = (result) => (
    result === 'compliant' ? 'compliant' : result === 'violation' ? 'violation' : 'not_assessed'
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Records" subtitle="Store-wise inspection data" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <SegmentControl
          selected={filter}
          onSelect={setFilter}
          options={[
            { key: 'all', label: 'All', count: records.length },
            { key: 'compliant', label: 'Compliant', count: compliantCount },
            { key: 'violation', label: 'Violation', count: violationCount },
            { key: 'not_assessed', label: 'Not assessed', count: naCount },
          ]}
          scrollable
        />

        <View style={{ marginTop: spacing.md }}>
          {loading ? (
            <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.netraTeal} />
            </View>
          ) : error ? (
            <EmptyState
              icon="⚠️"
              title={error === 'forbidden' ? 'Not permitted' : 'Could not load records'}
              subtitle={error === 'forbidden'
                ? 'Your account cannot view records. Contact your administrator.'
                : 'Check your connection and try again.'}
            />
          ) : filtered.length === 0 ? (
            <EmptyState icon="📋" title="No records found" subtitle="Try adjusting your filters." />
          ) : (
            filtered.map((rec) => {
              return (
                <Pressable
                  key={rec.id}
                  onPress={() => setDetail(rec)}
                  accessibilityRole="button"
                  accessibilityLabel={`${rec.store}, ${rec.result}. View details.`}
                >
                  <Card padding="md" style={{ marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: spacing.sm }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{rec.store}</Text>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>{[rec.location, rec.date].filter(Boolean).join(' • ')}</Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                          {rec.inspector} • {rec.checks} checks • {rec.status || 'draft'}
                        </Text>
                      </View>
                      <VerdictBadge result={badgeFor(rec.result)} />
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Detail modal — result + secondary workflow status */}
      <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{detail?.store || 'Record'}</Text>
              <Pressable onPress={() => setDetail(null)} accessibilityRole="button" accessibilityLabel="Close details" hitSlop={10} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 22, color: colors.textMuted }}>✕</Text>
              </Pressable>
            </View>
            {!!detail && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                  <Text style={typography.body}>{[detail.location, detail.date].filter(Boolean).join(' • ')}</Text>
                  <VerdictBadge result={badgeFor(detail.result)} />
                </View>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {detail.inspector} • {detail.checks} checks • workflow status: {detail.status || 'draft'}
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
