import React from 'react';
import { View, Text, Pressable, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius, shadows } from '../theme';

// §3.1 Top bar - Niyam Blue, white text, saffron accent
export default function Header({ title, subtitle, onBack, rightAction, rightLabel }) {
  const insets = useSafeAreaInsets();
  // Ensure ample breathing space for camera notch, clock, battery charge, and signal icons:
  const androidBar = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const topClearance = Math.max(insets.top || 0, androidBar, Platform.OS === 'ios' ? 44 : 24);

  return (
    <View
      style={{
        backgroundColor: colors.niyamBlue,
        paddingTop: topClearance + 16,
        paddingBottom: spacing.md + 4,
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
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={{
              width: 44,
              height: 44,
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
