import React from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { colors, radius, spacing, shadows } from '../theme';

// §3.2 Primary action button - Niyam Blue, full-width on mobile
export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary', // primary | secondary | outline | danger
  icon,
  style,
}) {
  const bg = {
    primary: disabled ? colors.disabled : colors.niyamBlue,
    secondary: disabled ? colors.disabled : colors.netraTeal,
    outline: 'transparent',
    danger: disabled ? colors.disabled : colors.violation.text,
  }[variant];

  const textColor = variant === 'outline' ? colors.niyamBlue : colors.white;
  const borderWidth = variant === 'outline' ? 2 : 0;
  const borderColor = variant === 'outline' ? (disabled ? colors.disabled : colors.niyamBlue) : 'transparent';

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={{
        backgroundColor: bg,
        borderColor,
        borderWidth,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        minHeight: 48,
        ...shadows.sm,
        ...style,
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icon && <Text style={{ color: textColor, fontSize: 16, marginRight: 8 }}>{icon}</Text>}
          <Text style={{ color: textColor, fontSize: 15, fontWeight: '600', letterSpacing: 0.3 }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
