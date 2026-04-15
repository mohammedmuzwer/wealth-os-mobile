import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HomeScreen } from './src/screens/HomeScreen';
import { WealthProvider } from './src/context/WealthContext';

export default function App() {
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
