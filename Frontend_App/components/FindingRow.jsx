import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import VerdictBadge from './VerdictBadge';

// §3.5 Inspection finding row
export default function FindingRow({ finding, onPress }) {
  const isCompliance = finding.result || finding.checkVerdict;
  const cfg = finding.checkVerdict
    ? { pass: 'pass', fail: 'fail', not_assessed: 'not_assessed' }[finding.checkVerdict]
    : { compliant: 'success', violation: 'violation', not_assessed: 'not_assessed', out_of_scope: 'out_of_scope' }[finding.result];

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.md,
        borderColor: colors.borderLight,
        borderWidth: 1,
        padding: spacing.md,
        marginBottom: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600', marginRight: 8 }}>
            {finding.code}
          </Text>
          <Text style={{ fontSize: 13, color: colors.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
            {finding.name}
          </Text>
        </View>
        {finding.reason && (
          <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }} numberOfLines={2}>
            {finding.reason}
          </Text>
        )}
        {finding.value !== undefined && (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            Value: {finding.value}{finding.unit ? ` ${finding.unit}` : ''}
          </Text>
        )}
      </View>
      <VerdictBadge checkVerdict={finding.checkVerdict} result={finding.result} />
    </Pressable>
  );
}
