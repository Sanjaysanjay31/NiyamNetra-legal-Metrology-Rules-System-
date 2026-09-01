import React from 'react';
import { View, Text } from 'react-native';
import { radius, spacing, typography, scanResultConfig, verdictConfig } from '../theme';

// §2.4 Verdict badge - word not colour, proper contrast
// checkVerdict: pass | fail | not_assessed
// scanResult: success | violation | not_assessed | out_of_scope
export default function VerdictBadge({ result, checkVerdict, size = 'md' }) {
  const cfg = checkVerdict
    ? verdictConfig[checkVerdict]
    : scanResultConfig[result];

  if (!cfg) return null;

  const isSmall = size === 'sm';
  const padV = isSmall ? 2 : 4;
  const padH = isSmall ? 6 : 10;
  const fontSize = isSmall ? 10 : 12;

  return (
    <View
      style={{
        backgroundColor: cfg.fill,
        borderColor: cfg.border,
        borderWidth: 1,
        borderRadius: radius.full,
        paddingVertical: padV,
        paddingHorizontal: padH,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
      }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={cfg.label}
    >
      <Text style={{ color: cfg.text, fontSize: fontSize + 1, marginRight: 3, fontWeight: '700' }}>
        {cfg.icon}
      </Text>
      <Text style={{ color: cfg.text, fontSize, fontWeight: '700', letterSpacing: 0.3 }}>
        {cfg.label}
      </Text>
    </View>
  );
}
