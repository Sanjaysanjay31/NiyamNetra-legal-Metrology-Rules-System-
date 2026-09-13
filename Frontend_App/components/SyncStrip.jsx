import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSync } from '../offline/SyncProvider';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function SyncStrip() {
  const { pending, failedCount, isSyncing, syncNow, retryFailedSync } = useSync();
  const online = useOnlineStatus();
  if (online && pending === 0 && (!failedCount || failedCount === 0)) return null;

  if (failedCount > 0 && pending === 0) {
    return (
      <View
        style={{ backgroundColor: '#FEF2F2', padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        accessible
        accessibilityRole="status"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${failedCount} items failed to sync`}
      >
        <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '600' }}>
          ⚠️ {failedCount} item{failedCount === 1 ? '' : 's'} failed to sync
        </Text>
        <Pressable
          onPress={() => retryFailedSync()}
          accessibilityRole="button"
          accessibilityLabel="Retry failed sync items"
          hitSlop={8}
          style={({ focused }) => ([
            { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' },
            focused ? { outlineWidth: 2, outlineColor: '#991B1B', borderRadius: 6 } : null,
          ])}
        >
          <Text style={{ color: '#991B1B', fontWeight: '700' }}>Retry failed</Text>
        </Pressable>
      </View>
    );
  }

  const bg = !online ? '#FFFBEB' : isSyncing ? '#F0F9FF' : '#F0F9FF';
  const color = !online ? '#92400E' : '#0369A1';
  const label = !online
    ? `Offline — ${pending} will sync when connected`
    : isSyncing
      ? `Syncing ${pending}...`
      : `${pending} pending${failedCount > 0 ? ` (${failedCount} failed)` : ''} — tap Sync now`;
  return (
    <View
      style={{ backgroundColor: bg, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
      accessible
      accessibilityRole="status"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      <Text style={{ color, fontSize: 12 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {failedCount > 0 && (
          <Pressable
            onPress={() => retryFailedSync()}
            accessibilityRole="button"
            accessibilityLabel="Retry failed sync"
            hitSlop={8}
            style={{ padding: 8, minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: '#B91C1C', fontWeight: '700', fontSize: 12 }}>Retry failed</Text>
          </Pressable>
        )}
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
    </View>
  );
}
