import React from 'react';
import { View, Text } from 'react-native';
import { colors, spacing, typography, radius } from '../theme';
import PrimaryButton from './PrimaryButton';

// §8 Empty & error states
export default function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  variant = 'neutral', // neutral | warning | error
}) {
  const iconColor = {
    neutral: colors.border,
    warning: colors.warning,
    error: colors.violation.icon,
  }[variant];

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, flex: 1 }}>
      {icon && (
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: radius.full,
            backgroundColor: colors.background,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: spacing.lg,
          }}
        >
          <Text style={{ fontSize: 32, color: iconColor }}>{icon}</Text>
        </View>
      )}
      <Text style={{ ...typography.h3, textAlign: 'center', marginBottom: spacing.xs }}>
        {title}
      </Text>
      {subtitle && (
        <Text style={{ ...typography.bodySecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 20 }}>
          {subtitle}
        </Text>
      )}
      {actionLabel && onAction && (
        <PrimaryButton title={actionLabel} onPress={onAction} style={{ minWidth: 160 }} />
      )}
    </View>
  );
}
