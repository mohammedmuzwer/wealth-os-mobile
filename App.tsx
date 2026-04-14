import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';
import { WealthProvider } from './src/context/WealthContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <WealthProvider>
        <HomeScreen />
      </WealthProvider>
    </SafeAreaProvider>
  );
}
