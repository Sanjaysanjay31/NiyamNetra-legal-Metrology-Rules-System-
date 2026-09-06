import React from 'react';
import { View, Text } from 'react-native';
import { colors, radius, spacing, typography, shadows } from '../theme';

// §3.4 KPI stat card for dashboards
export default function StatCard({ label, value, subtitle, color, alert }) {
  const accentColor = color || colors.niyamBlue;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: spacing.lg,
        borderColor: alert ? colors.violation.border : colors.borderLight,
        borderWidth: alert ? 2 : 1,
        borderLeftWidth: 4,
        borderLeftColor: alert ? colors.violation.text : accentColor,
        ...shadows.sm,
        flex: 1,
        marginHorizontal: 4,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ ...typography.statNumber, color: alert ? colors.violation.text : accentColor, marginTop: 4 }}>
        {value}
      </Text>
      {subtitle && (
        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</Text>
      )}
    </View>
  );
}
