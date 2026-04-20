import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WealthProvider } from './src/context/WealthContext';
import { HomeScreen } from './src/screens/HomeScreen';

/**
 * Generates and persists a stable device-local user ID on first launch.
 * All screens read wos_user_id from AsyncStorage — this guarantees
 * it exists before any screen mounts.
 */
const initUserId = async (): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem('wos_user_id');
    if (!existing) {
      const uid = 'user_' + Math.random().toString(36).substring(2, 15);
      await AsyncStorage.setItem('wos_user_id', uid);
    }
  } catch {}
};

export default function App() {
  const [ready, setReady] = useState(false);

  const [fontsLoaded] = useFonts({
    'DMSans-Regular': require('./assets/fonts/DMSans-Regular.ttf'),
    DMMonoMedium: require('./assets/fonts/DMMono-Medium.ttf'),
  });

  useEffect(() => {
    initUserId().then(() => setReady(true));
  }, []);

  if (!ready || !fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <WealthProvider>
          <HomeScreen />
        </WealthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
