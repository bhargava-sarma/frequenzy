import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Inter_400Regular, Inter_500Medium, useFonts } from '@expo-google-fonts/inter';

import { RootNavigator } from './src/navigation/RootNavigator';
import { startScrobbler } from './src/player/scrobbler';
import { SetupScreen } from './src/screens/SetupScreen';
import { usePlayerStore } from './src/store/usePlayerStore';
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
  const initPlayer = usePlayerStore((state) => state.init);

  // Inter carries the tracked-out uppercase labels the design leans on. Render
  // nothing until it's resident — swapping the face mid-render reflows every
  // label and reads as a flash of the wrong typeface.
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /**
   * Set the player up as soon as the app is usable, not on the first play.
   *
   * setupPlayer kicks off an asynchronous MediaController bind, and commands
   * issued before it completes are silently discarded by the native module.
   * Doing this at launch gives the bind the seconds it needs while the user is
   * still browsing, so the first tap on Play actually plays.
   */
  useEffect(() => {
    if (status === 'ready') initPlayer();
  }, [status, initPlayer]);

  /**
   * Report plays to Navidrome for as long as the app is alive.
   *
   * This lives here rather than in a screen because playback outlives every
   * screen — scrobbling from the Now Playing screen would record nothing
   * while the phone is locked, which is most of the listening.
   */
  useEffect(() => {
    if (status !== 'ready') return;
    return startScrobbler(() => useServerStore.getState().client);
  }, [status]);

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
