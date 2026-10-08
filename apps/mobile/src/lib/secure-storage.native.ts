import * as SecureStore from 'expo-secure-store';

/** Native implementation: iOS Keychain / Android Keystore-backed storage. */
export const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  deleteItem: (key: string) => SecureStore.deleteItemAsync(key),
};
