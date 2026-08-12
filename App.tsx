import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Inter_400Regular, Inter_500Medium, useFonts } from '@expo-google-fonts/inter';

import { DiagnosticScreen } from './src/screens/DiagnosticScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { useServerStore } from './src/store/useServerStore';
import { color } from './src/theme/tokens';

export default function App() {
  const status = useServerStore((state) => state.status);
  const hydrate = useServerStore((state) => state.hydrate);
  const refreshConnection = useServerStore((state) => state.refreshConnection);

  // Inter carries the tracked-out uppercase labels the design leans on. Render
  // nothing until it's resident — swapping the face mid-render reflows every
  // label and reads as a flash of the wrong typeface.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
  });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /**
   * Re-probe on resume. The phone may have moved between home Wi-Fi and
   * cellular while we were backgrounded, which would leave the cached base URL
   * pointing at an address that no longer resolves. Dropping it here means the
   * next request re-probes rather than eating a timeout.
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
    <View style={styles.root}>
      <StatusBar style="dark" />
      {status === 'needsSetup' ? <SetupScreen /> : <DiagnosticScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  blank: { flex: 1, backgroundColor: color.paper },
});
