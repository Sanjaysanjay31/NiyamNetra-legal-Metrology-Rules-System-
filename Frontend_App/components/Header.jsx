import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors, spacing, typography, radius, shadows } from '../theme';

// SafeArea without a hard dependency: use react-native-safe-area-context when
// installed, otherwise fall back to a padded View so the header never renders
// under the notch/status bar. 11 §2.4 — never crash on a missing optional dep.
let SafeAreaView = View;
try {
  // eslint-disable-next-line global-require
  const sac = require('react-native-safe-area-context');
  if (sac?.SafeAreaView) SafeAreaView = sac.SafeAreaView;
} catch { /* optional — fall back to View + manual padding */ }

// §3.1 Top bar - Niyam Blue, white text, saffron accent
export default function Header({ title, subtitle, onBack, rightAction, rightLabel }) {
  // When react-native-safe-area-context is present its SafeAreaView applies
  // the notch/status-bar inset itself; otherwise a plain View with manual
  // top padding keeps the header clear of the status bar. No hooks here on
  // purpose: useSafeAreaInsets needs a provider ancestor that App.js does not
  // guarantee, and a missing provider would throw at render time.
  const Top = SafeAreaView;
  const fallbackPad = SafeAreaView === View ? { paddingTop: spacing.lg + 24 } : { paddingTop: spacing.lg };
  return (
    <Top
      style={{
        backgroundColor: colors.niyamBlue,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        ...fallbackPad,
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
    </Top>
  );
}
