import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Inter_400Regular, Inter_500Medium, useFonts } from '@expo-google-fonts/inter';

import { DiagnosticScreen } from './src/screens/DiagnosticScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { ShowcaseScreen } from './src/screens/ShowcaseScreen';
import { useServerStore } from './src/store/useServerStore';
import { color, hairline, space, type } from './src/theme/tokens';

/**
 * Dev-only screen switcher, standing in until Phase 4 brings real navigation.
 * Gated on __DEV__ so it cannot reach a release build.
 */
const DEV_SCREENS = ['diagnostics', 'components'] as const;
type DevScreen = (typeof DEV_SCREENS)[number];

export default function App() {
  const status = useServerStore((state) => state.status);
  const hydrate = useServerStore((state) => state.hydrate);
  const refreshConnection = useServerStore((state) => state.refreshConnection);

  const [screen, setScreen] = useState<DevScreen>('diagnostics');

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

  if (status === 'needsSetup') {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <SetupScreen />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        {screen === 'components' ? <ShowcaseScreen /> : <DiagnosticScreen />}
      </View>

      {__DEV__ && (
        <View style={styles.switcher}>
          {DEV_SCREENS.map((name) => (
            <Pressable
              key={name}
              onPress={() => setScreen(name)}
              style={styles.switcherItem}
              accessibilityRole="button"
              accessibilityState={{ selected: screen === name }}
            >
              <Text style={[styles.switcherText, screen === name && styles.switcherTextActive]}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  blank: { flex: 1, backgroundColor: color.paper },
  screen: { flex: 1 },

  switcher: {
    flexDirection: 'row',
    borderTopWidth: hairline,
    borderTopColor: color.paperLine,
    backgroundColor: color.paper,
    paddingBottom: space[5],
  },
  switcherItem: { flex: 1, alignItems: 'center', paddingVertical: space[3] },
  switcherText: { ...type.label, color: color.textSecondary },
  switcherTextActive: { color: color.textPrimary },
});
