import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors, spacing, typography, radius, shadows } from '../theme';

// §3.1 Top bar - Niyam Blue, white text, saffron accent
export default function Header({ title, subtitle, onBack, rightAction, rightLabel }) {
  return (
    <View
      style={{
        backgroundColor: colors.niyamBlue,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        ...shadows.md,
      }}
    >
      {/* Saffron accent bar */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: colors.saffron,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}>
        {onBack && (
          <Pressable
            onPress={onBack}
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.full,
              backgroundColor: 'rgba(255,255,255,0.15)',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: spacing.md,
            }}
          >
            <Text style={{ color: colors.white, fontSize: 18, fontWeight: '700' }}>←</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.white, fontSize: 18, fontWeight: '700' }}>{title}</Text>
          {subtitle && (
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
              {subtitle}
            </Text>
          )}
        </View>
        {rightAction && (
          <Pressable onPress={rightAction} style={{ padding: spacing.sm }}>
            <Text style={{ color: colors.saffron, fontWeight: '600', fontSize: 13 }}>
              {rightLabel || 'Action'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
