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
    <View style={{ backgroundColor: bg, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color, fontSize: 12 }}>{label}</Text>
      {online && pending > 0 && <Pressable onPress={syncNow}><Text style={{ color, fontWeight: '700' }}>Sync now</Text></Pressable>}
    </View>
  );
}
