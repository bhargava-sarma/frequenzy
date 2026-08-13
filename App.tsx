import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Inter_400Regular, Inter_500Medium, useFonts } from '@expo-google-fonts/inter';

import { RootNavigator } from './src/navigation/RootNavigator';
import { SetupScreen } from './src/screens/SetupScreen';
import { useServerStore } from './src/store/useServerStore';
import { color } from './src/theme/tokens';

/**
 * GestureHandlerRootView must wrap everything, and sit above SafeAreaProvider:
 * gestures registered outside it silently never fire on Android, which is the
 * kind of failure that looks like a broken swipe rather than missing setup.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const status = useServerStore((state) => state.status);
  const hydrate = useServerStore((state) => state.hydrate);
  const refreshConnection = useServerStore((state) => state.refreshConnection);

  // Inter carries the tracked-out uppercase labels the design leans on. Render
  // nothing until it's resident — swapping the face mid-render reflows every
  // label and reads as a flash of the wrong typeface.
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /**
   * Re-probe on resume. The phone may have moved between home Wi-Fi and
   * cellular while backgrounded, which would leave the cached base URL
   * pointing at an address that no longer resolves.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshConnection();
    });
    return () => subscription.remove();
  }, [refreshConnection]);

  if (!fontsLoaded || status === 'hydrating') {
    return (
      <View style={styles.blank}>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {status === 'needsSetup' ? <SetupScreen /> : <RootNavigator />}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  blank: { flex: 1, backgroundColor: color.paper },
});
