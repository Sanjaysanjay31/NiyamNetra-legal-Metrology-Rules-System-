import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import SegmentControl from '../../components/SegmentControl';
import EmptyState from '../../components/EmptyState';
import { fetchInspections, fetchStores, fetchUsers } from '../../api/admin';

// §5.9 Admin Records - live store-wise inspection records from /inspections
export default function RecordsScreen({ navigation }) {
  const [filter, setFilter] = useState('all');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
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
          status: i.status, // draft | submitted
          inspector: userMap[i.user_id] || `Officer #${i.user_id}`,
          checks: i.scan_count,
        };
      }));
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submittedCount = records.filter((r) => r.status === 'submitted').length;
  const draftCount = records.filter((r) => r.status === 'draft').length;
  const filtered = filter === 'all' ? records : records.filter((r) => r.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Records" subtitle="Store-wise inspection data" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <SegmentControl
          selected={filter}
          onSelect={setFilter}
          options={[
            { key: 'all', label: 'All', count: records.length },
            { key: 'submitted', label: 'Submitted', count: submittedCount },
            { key: 'draft', label: 'Draft', count: draftCount },
          ]}
          scrollable
        />

        <View style={{ marginTop: spacing.md }}>
          {loading ? (
            <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.netraTeal} />
            </View>
          ) : error ? (
            <EmptyState icon="⚠️" title="Could not load records" subtitle="Check your connection and try again." />
          ) : filtered.length === 0 ? (
            <EmptyState icon="📋" title="No records found" subtitle="Try adjusting your filters." />
          ) : (
            filtered.map((rec) => {
              const isSubmitted = rec.status === 'submitted';
              return (
                <Pressable key={rec.id}>
                  <Card padding="md" style={{ marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: spacing.sm }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{rec.store}</Text>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>{[rec.location, rec.date].filter(Boolean).join(' • ')}</Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{rec.inspector} • {rec.checks} checks</Text>
                      </View>
                      <View style={{
                        backgroundColor: isSubmitted ? colors.pass.fill : colors.notAssessed.fill,
                        borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3,
                      }}>
                        <Text style={{
                          color: isSubmitted ? colors.pass.text : colors.notAssessed.text,
                          fontSize: 10, fontWeight: '700', textTransform: 'uppercase',
                        }}>{isSubmitted ? 'Submitted' : 'Draft'}</Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
