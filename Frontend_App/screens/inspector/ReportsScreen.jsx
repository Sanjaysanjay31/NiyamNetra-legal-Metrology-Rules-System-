import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import SegmentControl from '../../components/SegmentControl';

// §5.5 Inspector Reports - calendar + stats
export default function ReportsScreen({ navigation }) {
  const [period, setPeriod] = useState('today');

  const stats = {
    today: { inspections: 5, success: 3, violations: 2, notAssessed: 0 },
    week: { inspections: 28, success: 22, violations: 5, notAssessed: 1 },
    month: { inspections: 112, success: 89, violations: 18, notAssessed: 5 },
  };

  const currentStats = stats[period];

  // Simple calendar grid
  const days = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    inspections: Math.floor(Math.random() * 6),
    hasViolation: Math.random() > 0.7,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Reports" subtitle="Your inspection activity" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* Period selector */}
        <SegmentControl
          selected={period}
          onSelect={setPeriod}
          options={[
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'This Week' },
            { key: 'month', label: 'This Month' },
          ]}
        />

        {/* Stats row */}
        <View style={{ flexDirection: 'row', marginTop: spacing.lg, marginBottom: spacing.lg }}>
          <StatCard label="Inspections" value={currentStats.inspections} />
          <StatCard label="Success" value={currentStats.success} color={colors.pass.text} />
          <StatCard label="Violations" value={currentStats.violations} color={colors.violation.text} alert={currentStats.violations > 0} />
        </View>

        {/* Calendar */}
        <Card title="August 2026" subtitle="Tap a day to view inspections" padding="md" style={{ marginBottom: spacing.md }}>
          {/* Day headers */}
          <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: colors.textMuted }}>{d}</Text>
            ))}
          </View>
          {/* Calendar grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {/* Offset for starting day (Aug 2026 starts on Saturday = 5) */}
            {[1, 2, 3, 4, 5].map(i => (
              <View key={`empty-${i}`} style={{ width: `${100/7}%`, aspectRatio: 1, padding: 2 }} />
            ))}
            {days.map((d) => (
              <View key={d.day} style={{ width: `${100/7}%`, aspectRatio: 1, padding: 2 }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: radius.sm,
                    backgroundColor: d.day === 30 ? colors.niyamBlue : d.hasViolation ? colors.violation.fill : d.inspections > 0 ? colors.pass.fill : 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: d.day === 30 ? 0 : 1,
                    borderColor: colors.borderLight,
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: d.day === 30 ? '700' : '500',
                    color: d.day === 30 ? colors.white : colors.text,
                  }}>
                    {d.day}
                  </Text>
                  {d.inspections > 0 && d.day !== 30 && (
                    <View style={{
                      position: 'absolute',
                      bottom: 3,
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: d.hasViolation ? colors.violation.text : colors.pass.text,
                    }} />
                  )}
                </View>
              </View>
            ))}
          </View>
        </Card>

        {/* Compliance rate */}
        <Card title="Compliance Rate" padding="lg">
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 48, fontWeight: '700', color: colors.niyamBlue }}>
              {Math.round((currentStats.success / currentStats.inspections) * 100)}%
            </Text>
            <Text style={typography.bodySecondary}>
              {currentStats.success} of {currentStats.inspections} inspections successful
            </Text>
          </View>
          {/* Progress bar */}
          <View style={{ height: 8, backgroundColor: colors.borderLight, borderRadius: radius.full, marginTop: spacing.md, overflow: 'hidden' }}>
            <View style={{
              width: `${(currentStats.success / currentStats.inspections) * 100}%`,
              height: '100%',
              backgroundColor: colors.pass.text,
              borderRadius: radius.full,
            }} />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
