import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSync } from '../offline/SyncProvider';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function SyncStrip() {
  const { pending, isSyncing, syncNow } = useSync();
  const online = useOnlineStatus();
  if (online && pending === 0) return null;
  const bg = !online ? '#FFFBEB' : isSyncing ? '#F0F9FF' : '#F0F9FF';
  const color = !online ? '#92400E' : '#0369A1';
  const label = !online ? `Offline — ${pending} will sync when connected` : isSyncing ? `Syncing ${pending}...` : `${pending} pending — tap Sync now`;
  return (
    <View
      style={{ backgroundColor: bg, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
      accessible
      accessibilityRole="status"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      <Text style={{ color, fontSize: 12 }}>{label}</Text>
      {online && pending > 0 && (
        <Pressable
          onPress={syncNow}
          accessibilityRole="button"
          accessibilityLabel={`Sync now, ${pending} pending`}
          hitSlop={8}
          style={({ focused }) => ([
            { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' },
            focused ? { outlineWidth: 2, outlineColor: color, borderRadius: 6 } : null,
          ])}
        >
          <Text style={{ color, fontWeight: '700' }}>Sync now</Text>
        </Pressable>
      )}
    </View>
  );
}
