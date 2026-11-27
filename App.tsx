import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import TrackPlayer from '@rntp/player';

import { ArtworkAccentBridge } from './src/components/ArtworkAccentBridge';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { PlayerOverlay } from './src/components/PlayerOverlay';
import { ToastHost } from './src/components/ToastHost';
import { getCrashLog, installGlobalErrorHandler } from './src/data/crashLog';
import { importNativeCrashes } from './src/data/nativeCrash';
import { clearLyricsCache } from './src/data/lyricsCache';
import { clearPlayHistory } from './src/data/playHistory';
import { clearRecentSearches } from './src/data/recentSearches';
import { RootNavigator } from './src/navigation/RootNavigator';
import { removeAllDownloads, startDownloads } from './src/offline/downloads';
import { clearPendingScrobbles } from './src/player/pendingScrobbles';
import { clearSavedQueue, restoreQueue, startQueuePersistence } from './src/player/queuePersistence';
import { startControllerRecovery } from './src/player/controllerRecovery';
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
 * Errors thrown outside React's render — a timer, a press handler, a promise
 * callback — would otherwise close the app in a release build. They are
 * logged and reported instead (see crashLog). A burst of the same error is
 * one notice, not a toast per frame.
 */
let lastNotice = 0;
installGlobalErrorHandler((entry) => {
  if (Date.now() - lastNotice < 8000) return;
  lastNotice = Date.now();
  toast.error('Something went wrong', { detail: entry.message.slice(0, 80) });
});

/**
 * GestureHandlerRootView wraps everything and sits above SafeAreaProvider:
 * gestures registered outside it silently never fire on Android.
 *
 * The outermost boundary is the last line: anything the per-screen and
 * per-panel boundaries don't contain lands here, where it shows a recovery
 * panel rather than closing the app.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary scope="app">
            <AppContent />
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** The newest crash already mentioned this session. */
let lastSeenCrash = 0;

/**
 * A crash in native code leaves a note for the next launch (see
 * nativeCrash); it is moved into the log before anything reads the log.
 */
const nativeCrashesImported = importNativeCrashes().catch(() => {});

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

  // Plays are reported, and downloads fetched, for as long as the app
  // lives — not while a screen does.
  useEffect(() => {
    if (status !== 'ready') return;
    const stopDownloads = startDownloads();
    const stopScrobbler = startScrobbler(() => useServerStore.getState().client);
    const stopPersistence = startQueuePersistence();
    const stopRepair = startStreamRepair((message) =>
      toast.error('Playback stopped', { detail: message }),
    );
    const stopRecovery = startControllerRecovery((message) =>
      toast.error('Player unavailable', { detail: message }),
    );
    return () => {
      stopDownloads();
      stopScrobbler();
      stopPersistence();
      stopRepair();
      stopRecovery();
    };
  }, [status]);

  /**
   * Signing out drops everything that belongs to the account: the queue,
   * its downloads, and every record keyed on that server's ids. Left
   * behind, the next account would open onto someone else's playlists, a
   * history whose rows point at tracks that don't exist there, hearts lit
   * for the wrong songs — and gigabytes of files nothing could reach. Each
   * step stands alone, so one failing doesn't stop the rest.
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
        removeAllDownloads(),
        clearPendingScrobbles(),
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

  // A crash recorded since the last launch is mentioned once, so it gets
  // reported rather than forgotten.
  useEffect(() => {
    const launchedAt = Date.now();
    void nativeCrashesImported.then(getCrashLog).then((log) => {
      const latest = log[0];
      if (!latest || latest.at > launchedAt) return;
      if (launchedAt - latest.at > 24 * 60 * 60 * 1000) return;
      if (latest.at <= lastSeenCrash) return;
      lastSeenCrash = latest.at;
      toast.show('Recovered from an error', {
        icon: 'info',
        detail: 'Details in Settings → Diagnostics',
        duration: 4200,
      });
    });
  }, []);

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
        <ErrorBoundary scope="setup">
          <SetupScreen />
        </ErrorBoundary>
      ) : (
        <>
          <ErrorBoundary scope="artwork-colour" silent>
            <ArtworkAccentBridge />
          </ErrorBoundary>
          <RootNavigator />
          <PlayerOverlay />
        </>
      )}
      <ErrorBoundary scope="toasts" silent>
        <ToastHost />
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clipped to the window: the player's colour wash is drawn larger than the
  // screen on purpose, and nothing should be able to size itself by it.
  fill: { flex: 1, overflow: 'hidden' },
});
