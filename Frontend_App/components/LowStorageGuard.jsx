import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
// Classic FileSystem API moved to 'expo-file-system/legacy' in SDK 54.
import * as FileSystem from 'expo-file-system/legacy';

export default function LowStorageGuard({ children }) {
  const [warn, setWarn] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const free = await FileSystem.getFreeDiskStorageAsync();
        if (free !== null) {
          const gb = free / (1024**3);
          if (gb < 0.5) setWarn(`Storage ${gb.toFixed(1)}GB — capture blocked. Sync now to free space.`);
          else if (gb < 2) setWarn(`Storage ${gb.toFixed(1)}GB — sync soon.`);
        }
      } catch {}
    })();
  }, []);
  if (warn) return <View style={{ backgroundColor: '#FEF2F2', padding: 12 }}><Text style={{ color: '#B91C1C', fontSize: 12 }}>{warn}</Text></View>;
  return children;
}
