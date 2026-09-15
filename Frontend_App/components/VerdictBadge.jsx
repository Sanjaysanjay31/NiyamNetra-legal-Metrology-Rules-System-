import React from 'react';
import { View, Text } from 'react-native';
import { radius, spacing, typography, scanResultConfig, verdictConfig, statusConfig } from '../theme';

// §2.4 Verdict & Status badge - word not colour, proper contrast
// ruleResult / result: compliant | violation | not_assessed | out_of_scope
// checkVerdict: compliant | violation | not_assessed | out_of_scope | pass | fail
// status: in_progress | submitted | synced | not_synced
export default function VerdictBadge({ result, checkVerdict, status, size = 'md' }) {
  const normKey = (val) => String(val || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const nResult = normKey(result);
  const nCheck = normKey(checkVerdict);
  const nStatus = normKey(status);

  let cfg = null;
  if (status) {
    cfg = statusConfig[nStatus] || statusConfig[status];
  } else if (checkVerdict) {
    cfg = verdictConfig[nCheck] || verdictConfig[checkVerdict];
  } else {
    cfg = scanResultConfig[nResult] || scanResultConfig[result] || statusConfig[nResult];
  }

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
