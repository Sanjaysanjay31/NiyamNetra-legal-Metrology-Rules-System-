import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import VerdictBadge from '../../components/VerdictBadge';
import EmptyState from '../../components/EmptyState';
import FindingRow from '../../components/FindingRow';

// §5.4 Violations list - with violation detail view
export default function ViolationsScreen({ navigation }) {
  const [view, setView] = useState('list'); // list | detail
  const [selectedInspection, setSelectedInspection] = useState(null);

  const violations = [
    {
      id: 1,
      store: 'Super Bazaar Market',
      date: '2026-08-30',
      commodity: 'Tata Salt 1kg',
      checks: 18,
      violated: 3,
      findings: [
        { code: 'CHK01', name: 'MRP Declaration', checkVerdict: 'fail', reason: 'MRP not visible — sticker obscured', value: 'N/A' },
        { code: 'CHK03', name: 'Net Quantity', checkVerdict: 'fail', reason: 'Declared 1kg, measured 945g — short weight', value: '945g' },
        { code: 'CHK07', name: 'Manufacturer Details', checkVerdict: 'pass' },
        { code: 'CHK08', name: 'Manufacturing Date', checkVerdict: 'not_assessed', reason: 'Batch code smeared, cannot read' },
      ],
    },
    {
      id: 2,
      store: 'Local Kirana',
      date: '2026-08-29',
      commodity: 'Amul Butter 500g',
      checks: 16,
      violated: 1,
      findings: [
        { code: 'CHK12', name: 'Expiry Date', checkVerdict: 'fail', reason: 'Product past expiry: 2026-07-15', value: '15 Jul 2026' },
      ],
    },
  ];

  if (view === 'detail' && selectedInspection) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header title="Violation Details" subtitle={selectedInspection.store} onBack={() => setView('list')} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          {/* Violation summary */}
          <Card title={selectedInspection.commodity} subtitle={`${selectedInspection.violated} of ${selectedInspection.checks} checks violated`} padding="lg" style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <View>
                <Text style={typography.label}>Store</Text>
                <Text style={typography.body}>{selectedInspection.store}</Text>
              </View>
              <VerdictBadge result="violation" />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={typography.label}>Date</Text>
                <Text style={typography.body}>{selectedInspection.date}</Text>
              </View>
              <View>
                <Text style={typography.label}>Checks run</Text>
                <Text style={typography.body}>{selectedInspection.checks} of 18</Text>
              </View>
            </View>
          </Card>

          {/* Findings */}
          <Text style={{ ...typography.h4, marginBottom: spacing.sm }}>Findings</Text>
          {selectedInspection.findings.map((f, i) => (
            <FindingRow key={i} finding={f} />
          ))}

          {/* Evidence link */}
          <Card title="Evidence" subtitle="Tap to view captured images" padding="md" style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[1, 2, 3].map(i => (
                <View key={i} style={{ width: 60, height: 60, borderRadius: radius.sm, backgroundColor: colors.border, margin: spacing.xs, borderWidth: 2, borderColor: colors.saffron }} />
              ))}
            </View>
          </Card>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Violations" subtitle={`${violations.length} flagged`} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {violations.length === 0 ? (
          <EmptyState
            icon="✓"
            title="No violations recorded today"
            subtitle="Finding no violations is a fact about the shelf, not a performance."
            variant="neutral"
          />
        ) : (
          violations.map((v) => (
            <Pressable key={v.id} onPress={() => { setSelectedInspection(v); setView('detail'); }}>
              <Card padding="md" style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 }}>
                      {v.store}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>{v.commodity}</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>{v.date}</Text>
                    <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                      <View style={{ backgroundColor: colors.violation.fill, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: colors.violation.text, fontSize: 11, fontWeight: '600' }}>✗ {v.violated} violation{v.violated > 1 ? 's' : ''}</Text>
                      </View>
                    </View>
                  </View>
                  <VerdictBadge result="violation" />
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
