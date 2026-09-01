import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

// §3.2 Segmented control for tabs/filters
export default function SegmentControl({ options, selected, onSelect, scrollable = false }) {
  const Wrapper = scrollable ? ScrollView : View;
  const wrapperProps = scrollable
    ? { horizontal: true, showsHorizontalScrollIndicator: false, contentContainerStyle: { paddingHorizontal: spacing.sm } }
    : { style: { flexDirection: 'row' } };

  return (
    <Wrapper {...wrapperProps} style={!scrollable ? { flexDirection: 'row' } : wrapperProps.contentContainerStyle}>
      {options.map((opt) => {
        const isSelected = selected === (opt.key ?? opt.label);
        return (
          <Pressable
            key={opt.key ?? opt.label}
            onPress={() => onSelect(opt.key ?? opt.label)}
            style={{
              backgroundColor: isSelected ? colors.niyamBlue : colors.background,
              borderColor: isSelected ? colors.niyamBlue : colors.border,
              borderWidth: 1.5,
              borderRadius: radius.md,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              marginRight: spacing.sm,
              minWidth: scrollable ? 80 : undefined,
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {opt.icon && (
                <Text style={{ color: isSelected ? colors.white : colors.textMuted, marginRight: 6, fontSize: 14 }}>
                  {opt.icon}
                </Text>
              )}
              {opt.count !== undefined && (
                <View
                  style={{
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : colors.border,
                    borderRadius: radius.full,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    marginRight: 6,
                    minWidth: 20,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: isSelected ? colors.white : colors.textSecondary, fontSize: 10, fontWeight: '700' }}>
                    {opt.count}
                  </Text>
                </View>
              )}
              <Text
                style={{
                  color: isSelected ? colors.white : colors.textSecondary,
                  fontSize: 13,
                  fontWeight: isSelected ? '600' : '500',
                }}
              >
                {opt.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </Wrapper>
  );
}
