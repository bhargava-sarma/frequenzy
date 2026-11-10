import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import TrackPlayer from '@rntp/player';

import { ArtworkAccentBridge } from './src/components/ArtworkAccentBridge';
import { PlayerOverlay } from './src/components/PlayerOverlay';
import { ToastHost } from './src/components/ToastHost';
import { clearLyricsCache } from './src/data/lyricsCache';
import { clearPlayHistory } from './src/data/playHistory';
import { clearRecentSearches } from './src/data/recentSearches';
import { RootNavigator } from './src/navigation/RootNavigator';
import { clearSavedQueue, restoreQueue, startQueuePersistence } from './src/player/queuePersistence';
import { startScrobbler } from './src/player/scrobbler';
import { startStreamRepair } from './src/player/streamRepair';
import { SetupScreen } from './src/screens/SetupScreen';
import { useFavoritesStore } from './src/store/useFavoritesStore';
import { usePlayerStore } from './src/store/usePlayerStore';
import { usePlayerUiStore } from './src/store/usePlayerUiStore';
import { usePlaylistStore } from './src/store/usePlaylistStore';
import { useServerStore } from './src/store/useServerStore';
import { useSettingsStore } from './src/store/useSettingsStore';
import { toast } from './src/store/useToastStore';
import { ThemeProvider, useArtworkColorStore, useTheme } from './src/theme/ThemeProvider';

/**
 * GestureHandlerRootView wraps everything and sits above SafeAreaProvider:
 * gestures registered outside it silently never fire on Android.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** If stored settings take longer than this to load, render with defaults. */
const SETTINGS_GRACE_MS = 1500;

function AppContent() {
  const color = useTheme();
  const status = useServerStore((state) => state.status);
  const hydrate = useServerStore((state) => state.hydrate);
  const refreshConnection = useServerStore((state) => state.refreshConnection);
  const setOnSignOut = useServerStore((state) => state.setOnSignOut);
  const initPlayer = usePlayerStore((state) => state.init);
  const settingsReady = useSettingsStore((state) => state.hydrated);
  const [graceOver, setGraceOver] = useState(false);

  /**
   * Space Grotesk, Space Mono and Doto. Nothing renders until they're
   * resident — swapping faces mid-render reflows every title. Fonts are
   * assets, not packages, so a type change ships over the air.
   */
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular: require('./assets/fonts/SpaceGrotesk_400Regular.ttf'),
    SpaceGrotesk_500Medium: require('./assets/fonts/SpaceGrotesk_500Medium.ttf'),
    SpaceGrotesk_600SemiBold: require('./assets/fonts/SpaceGrotesk_600SemiBold.ttf'),
    SpaceGrotesk_700Bold: require('./assets/fonts/SpaceGrotesk_700Bold.ttf'),
    SpaceMono_400Regular: require('./assets/fonts/SpaceMono_400Regular.ttf'),
    SpaceMono_700Bold: require('./assets/fonts/SpaceMono_700Bold.ttf'),
    Doto_900Black: require('./assets/fonts/Doto_900Black.ttf'),
  });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Settings normally load in a few milliseconds; this only guards against
  // storage that never answers, which would otherwise leave a blank screen.
  useEffect(() => {
    const timer = setTimeout(() => setGraceOver(true), SETTINGS_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Player setup at launch rather than on first play: the MediaController
   * binds asynchronously and commands sent before it lands are dropped, so
   * starting early gives it the seconds it needs while you browse. Then the
   * last session's queue is put back, paused, if nothing is playing.
   */
  useEffect(() => {
    if (status !== 'ready') return;
    initPlayer();
    void restoreQueue().catch(() => {});
  }, [status, initPlayer]);

  // Plays are reported for as long as the app lives, not while a screen does.
  useEffect(() => {
    if (status !== 'ready') return;
    const stopScrobbler = startScrobbler(() => useServerStore.getState().client);
    const stopPersistence = startQueuePersistence();
    const stopRepair = startStreamRepair((message) =>
      toast.error('Playback stopped', { detail: message }),
    );
    return () => {
      stopScrobbler();
      stopPersistence();
      stopRepair();
    };
  }, [status]);

  /**
   * Signing out drops everything that belongs to the account: the queue,
   * and every record keyed on that server's ids. Left behind, the next
   * account would open onto someone else's playlists, a history whose rows
   * point at tracks that don't exist there, and hearts lit for the wrong
   * songs. Each step stands alone, so one failing doesn't stop the rest.
   */
  useEffect(() => {
    setOnSignOut(async () => {
      usePlayerUiStore.getState().closePlayer();
      try {
        if (usePlayerStore.getState().ready) usePlayerStore.getState().clearQueue();
        else TrackPlayer.clear();
      } catch {
        // A player that was never set up has no queue to clear.
      }
      usePlaylistStore.setState({ playlists: [], loading: false, error: null });
      useFavoritesStore.setState({ overrides: {} });
      useArtworkColorStore.getState().setColors(null);

      await Promise.allSettled([
        clearSavedQueue(),
        clearPlayHistory(),
        clearLyricsCache(),
        clearRecentSearches(),
        // Covers are cached under their ids, which mean nothing elsewhere.
        Image.clearMemoryCache(),
        Image.clearDiskCache(),
      ]);
    });
    return () => setOnSignOut(null);
  }, [setOnSignOut]);

  // Re-probe on resume: the phone may have moved between Wi-Fi and cellular.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshConnection();
    });
    return () => subscription.remove();
  }, [refreshConnection]);

  const statusBarStyle = color.mode === 'dark' ? 'light' : 'dark';

  // A font that fails to load is worth less than the app: carry on in the
  // platform face rather than sit on a blank screen forever.
  const fontsReady = fontsLoaded || fontError != null;

  if (!fontsReady || status === 'hydrating' || (!settingsReady && !graceOver)) {
    return (
      <View style={[styles.fill, { backgroundColor: color.background }]}>
        <StatusBar style={statusBarStyle} />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: color.background }]}>
      <StatusBar style={statusBarStyle} />
      {status === 'needsSetup' ? (
        <SetupScreen />
      ) : (
        <>
          <ArtworkAccentBridge />
          <RootNavigator />
          <PlayerOverlay />
        </>
      )}
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  // Clipped to the window: the player's colour wash is drawn larger than the
  // screen on purpose, and nothing should be able to size itself by it.
  fill: { flex: 1, overflow: 'hidden' },
});
