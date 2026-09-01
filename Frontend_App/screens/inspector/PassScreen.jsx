import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import VerdictBadge from '../../components/VerdictBadge';
import EmptyState from '../../components/EmptyState';
import SegmentControl from '../../components/SegmentControl';

// §5.3 Pass/Compliant inspections list
export default function PassScreen({ navigation }) {
  const [filter, setFilter] = useState('all');

  // Demo data - would come from API
  const inspections = [
    { id: 1, store: 'Ramesh General Store', date: '2026-08-30', checks: 18, passed: 17, violated: 0, notAssessed: 1, result: 'success' },
    { id: 2, store: 'Spencer\'s Retail', date: '2026-08-29', checks: 18, passed: 18, violated: 0, notAssessed: 0, result: 'success' },
    { id: 3, store: 'More Supermarket', date: '2026-08-29', checks: 16, passed: 14, violated: 0, notAssessed: 2, result: 'success' },
    { id: 4, store: 'Reliance Fresh', date: '2026-08-28', checks: 18, passed: 16, violated: 0, notAssessed: 2, result: 'success' },
  ];

  const filtered = filter === 'all' ? inspections : inspections.filter(i => {
    if (filter === 'today') return i.date === '2026-08-30';
    if (filter === 'week') return true;
    return true;
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Successful Inspections" subtitle={`${inspections.length} total`} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* Filter */}
        <SegmentControl
          selected={filter}
          onSelect={setFilter}
          options={[
            { key: 'all', label: 'All', count: inspections.length },
            { key: 'today', label: 'Today', count: 1 },
            { key: 'week', label: 'This week', count: 4 },
          ]}
          scrollable
        />

        {/* List */}
        <View style={{ marginTop: spacing.md }}>
          {filtered.length === 0 ? (
            <EmptyState
              icon="✓"
              title="No successful inspections"
              subtitle="Inspections that pass all checks will appear here."
              variant="neutral"
            />
          ) : (
            filtered.map((item) => (
              <Pressable key={item.id} onPress={() => {}}>
                <Card padding="md" style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 }}>
                        {item.store}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>{item.date} • {item.checks} checks</Text>
                      <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                        <View style={{ backgroundColor: colors.pass.fill, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2, marginRight: spacing.xs }}>
                          <Text style={{ color: colors.pass.text, fontSize: 11, fontWeight: '600' }}>✓ {item.passed} pass</Text>
                        </View>
                        {item.notAssessed > 0 && (
                          <View style={{ backgroundColor: colors.notAssessed.fill, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: colors.notAssessed.text, fontSize: 11, fontWeight: '600' }}>— {item.notAssessed} N/A</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <VerdictBadge result="success" />
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
