import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors, radius, spacing, typography, shadows } from '../theme';

// §3.3 Surface card
export default function Card({ children, onPress, style, title, subtitle, rightElement, padding = 'md' }) {
  const padSize = { none: 0, sm: spacing.sm, md: spacing.md, lg: spacing.lg }[padding] ?? spacing.md;

  const content = (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: padSize,
        borderColor: colors.borderLight,
        borderWidth: 1,
        ...shadows.sm,
        ...style,
      }}
    >
      {(title || subtitle) && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            {title && <Text style={typography.h4}>{title}</Text>}
            {subtitle && <Text style={{ ...typography.caption, marginTop: 2 }}>{subtitle}</Text>}
          </View>
          {rightElement}
        </View>
      )}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }
  return content;
}
