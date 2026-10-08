import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type { SerializedEntries, SerializedRequest, StorageAdapter } from '@urql/exchange-graphcache';

const DATA_KEY = 'splitease.graphcache.data.v1';
const META_KEY = 'splitease.graphcache.meta.v1';

/**
 * Native: persist the normalised cache and the offline mutation queue in
 * AsyncStorage, and replay queued mutations when NetInfo reports we're back
 * online. (A tiny stand-in for @urql/storage-rn, whose peer range doesn't
 * cover NetInfo 12 yet.)
 */
export function createCacheStorage(): StorageAdapter {
  let data: SerializedEntries = {};
  return {
    async readData() {
      try {
        data = JSON.parse((await AsyncStorage.getItem(DATA_KEY)) ?? '{}') as SerializedEntries;
      } catch {
        data = {};
      }
      return data;
    },
    async writeData(delta) {
      data = { ...data, ...delta };
      for (const [key, value] of Object.entries(delta)) if (value === undefined) delete data[key];
      await AsyncStorage.setItem(DATA_KEY, JSON.stringify(data));
    },
    async readMetadata() {
      try {
        return JSON.parse((await AsyncStorage.getItem(META_KEY)) ?? '[]') as SerializedRequest[];
      } catch {
        return [];
      }
    },
    writeMetadata(json) {
      void AsyncStorage.setItem(META_KEY, JSON.stringify(json));
    },
    onOnline(cb) {
      let wasOffline = false;
      return NetInfo.addEventListener((state) => {
        if (state.isConnected === false) wasOffline = true;
        else if (wasOffline && state.isConnected) {
          wasOffline = false;
          cb();
        }
      });
    },
  };
}

export async function clearCacheStorage() {
  await AsyncStorage.multiRemove([DATA_KEY, META_KEY]);
}
