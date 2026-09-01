import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

// §3.2 Text input - government form style
export default function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  error,
  autoCapitalize = 'none',
  keyboardType,
  multiline,
  style,
  editable = true,
}) {
  return (
    <View style={{ marginBottom: spacing.md, ...style }}>
      {label && <Text style={typography.label}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        style={{
          backgroundColor: editable ? colors.white : colors.background,
          borderWidth: 1.5,
          borderColor: error ? colors.violation.text : colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          fontSize: 14,
          color: colors.text,
          marginTop: spacing.xs,
          minHeight: multiline ? 80 : 44,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {error && <Text style={{ color: colors.violation.text, fontSize: 11, marginTop: 4 }}>{error}</Text>}
    </View>
  );
}
