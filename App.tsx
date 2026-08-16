import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
// Subpaths, not the package root — same reason as components/icons.ts. The
// root re-exports all 18 Inter weights, and Metro has no tree-shaking to drop
// the 16 we never name, so importing it ships ~6MB of unused .ttf.
import { useFonts } from '@expo-google-fonts/inter/useFonts';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';

import { ArtworkAccentBridge } from './src/components/ArtworkAccentBridge';
import { PlayerOverlay } from './src/components/PlayerOverlay';
import { RootNavigator } from './src/navigation/RootNavigator';
import { startScrobbler } from './src/player/scrobbler';
import { SetupScreen } from './src/screens/SetupScreen';
import { usePlayerStore } from './src/store/usePlayerStore';
import { useServerStore } from './src/store/useServerStore';
import { ThemeProvider, useTheme, useThemeControls } from './src/theme/ThemeProvider';

/**
 * GestureHandlerRootView must wrap everything, and sit above SafeAreaProvider:
 * gestures registered outside it silently never fire on Android, which is the
 * kind of failure that looks like a broken swipe rather than missing setup.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <ThemeProvider>
        <SafeAreaProvider>
          <AppContent />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const color = useTheme();
  // The status bar's glyphs are drawn by the OS, so they need telling which
  // way to contrast — they don't inherit anything from the palette.
  const { resolved } = useThemeControls();
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
      <View style={[styles.blank, { backgroundColor: color.paper }]}>
        <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      {status === 'needsSetup' ? (
        <SetupScreen />
      ) : (
        <>
          {/* Renders nothing; keeps the accent in step with what's playing. */}
          <ArtworkAccentBridge />
          <RootNavigator />
          {/* Above the navigator, so opening the player detaches nothing. */}
          <PlayerOverlay />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  blank: { flex: 1 },
});
