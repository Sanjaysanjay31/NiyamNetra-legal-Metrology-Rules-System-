import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

export function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const s = await Network.getNetworkStateAsync();
      if (mounted) setOnline(!!s.isConnected);
    };
    check();
    const id = setInterval(check, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, []);
  return online;
}
