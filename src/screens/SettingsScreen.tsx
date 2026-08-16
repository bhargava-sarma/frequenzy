import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { AmbientBackground } from '../components/AmbientBackground';
import { blurAvailable } from '../components/Frosted';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/Segmented';
import { clearPlayHistory } from '../data/playHistory';
import { useServerStore } from '../store/useServerStore';
import { hairline, layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemeControls, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Settings.
 *
 * Everything here is either a preference or a maintenance action. Nothing is
 * a feature toggle — an option that changes what the app *is* belongs in the
 * design, not behind a switch.
 */

const THEME_OPTIONS = [
  { value: 'system' as const, label: 'Auto' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
];

const ACCENT_OPTIONS = [
  { value: 'artwork' as const, label: 'Artwork' },
  { value: 'fixed' as const, label: 'Fixed' },
];

const AMBIENT_OPTIONS = [
  { value: 'off' as const, label: 'Off' },
  { value: 'subtle' as const, label: 'Subtle' },
  { value: 'full' as const, label: 'Full' },
];

const AMBIENT_VALUES: Record<'off' | 'subtle' | 'full', number> = {
  off: 0,
  subtle: 0.5,
  full: 1,
};

function ambientChoice(intensity: number): 'off' | 'subtle' | 'full' {
  if (intensity <= 0) return 'off';
  return intensity < 0.8 ? 'subtle' : 'full';
}

const BLUR_OPTIONS = [
  { value: 'on' as const, label: 'Blurred' },
  { value: 'off' as const, label: 'Solid' },
];

export function SettingsScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const {
    preference,
    resolved,
    setPreference,
    artworkAccentEnabled,
    setArtworkAccentEnabled,
    ambientIntensity,
    setAmbientIntensity,
    blurEnabled,
    setBlurEnabled,
  } = useThemeControls();

  const config = useServerStore((state) => state.config);
  const connection = useServerStore((state) => state.connection);
  const library = useServerStore((state) => state.library);
  const refreshConnection = useServerStore((state) => state.refreshConnection);
  const signOut = useServerStore((state) => state.signOut);

  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AmbientBackground />

      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Appearance" />
        <View style={styles.block}>
          <Segmented options={THEME_OPTIONS} value={preference} onChange={setPreference} />
          <Text style={styles.hint}>
            {preference === 'system'
              ? `Following the system, currently ${resolved}.`
              : 'Fixed regardless of the system setting.'}
          </Text>
        </View>

        <View style={styles.block}>
          <View style={styles.gap} />
          <Segmented
            options={ACCENT_OPTIONS}
            value={artworkAccentEnabled ? 'artwork' : 'fixed'}
            onChange={(next) => setArtworkAccentEnabled(next === 'artwork')}
          />
          <Text style={styles.hint}>
            {artworkAccentEnabled
              ? 'Highlights take their colour from the current cover, adjusted to stay legible on this theme.'
              : 'Highlights stay burnt orange, as the design spec fixes them.'}
          </Text>
        </View>

        <SectionHeader title="Background" />
        <View style={styles.block}>
          <Segmented
            options={AMBIENT_OPTIONS}
            value={ambientChoice(ambientIntensity)}
            onChange={(next) => setAmbientIntensity(AMBIENT_VALUES[next])}
          />
          <Text style={styles.hint}>
            A slow drift of the current track&apos;s colour behind every screen. Off removes it
            entirely rather than hiding it, so nothing is left animating.
          </Text>
        </View>

        <SectionHeader title="Surfaces" />
        <View style={styles.block}>
          <Segmented
            options={BLUR_OPTIONS}
            value={blurEnabled && blurAvailable ? 'on' : 'off'}
            onChange={(next) => setBlurEnabled(next === 'on')}
          />
          <Text style={styles.hint}>
            {blurAvailable
              ? 'The dock, the search field and the tab strips blur what passes behind them.'
              : 'This build has no blur module, so these surfaces are solid regardless. Installing a newer build enables the choice.'}
          </Text>
        </View>

        <SectionHeader title="Server" />
        <View style={styles.block}>
          <Row label="Signed in as" value={config?.username ?? '—'} />
          <Row
            label="Connection"
            value={connection ? `${connection.kind} · ${hostOf(connection.url)}` : 'Not connected'}
            emphasis={connection == null}
          />
          <Row label="Home address" value={hostOf(config?.localUrl) ?? 'Not set'} />
          <Row label="Away address" value={hostOf(config?.remoteUrl) ?? 'Not set'} last />

          <View style={styles.actions}>
            <Button label="Reconnect" onPress={refreshConnection} fullWidth />
          </View>
        </View>

        <SectionHeader title="Data" />
        <View style={styles.block}>
          <Text style={styles.hint}>
            Library data is cached on this device and refetched when stale. Play history is what
            the charts on Home are built from; clearing it does not touch the play counts already
            sent to Navidrome.
          </Text>

          <View style={styles.actions}>
            <Button
              label="Clear library cache"
              busy={busy === 'cache'}
              fullWidth
              onPress={() => void run('cache', async () => library?.clear() ?? Promise.resolve())}
            />
            <View style={styles.gap} />
            <Button
              label="Clear play history"
              busy={busy === 'history'}
              fullWidth
              onPress={() => void run('history', clearPlayHistory)}
            />
          </View>
        </View>

        <SectionHeader title="Playback" />
        <View style={styles.block}>
          <Text style={styles.hint}>
            Streams are always requested as the original file with no bitrate cap, so nothing is
            transcoded. That is deliberate and not configurable — a setting that could silently
            downgrade quality is the thing this app exists to avoid.
          </Text>
        </View>

        <View style={styles.signOut}>
          <Button
            label="Sign out"
            busy={busy === 'signout'}
            fullWidth
            onPress={() => void run('signout', signOut)}
          />
        </View>

        {__DEV__ && (
          <>
            <SectionHeader title="Developer" />
            <View style={styles.block}>
              <Button
                label="Diagnostics"
                fullWidth
                onPress={() => navigation.navigate('Diagnostics')}
              />
              <View style={styles.gap} />
              <Button
                label="Components"
                fullWidth
                onPress={() => navigation.navigate('Showcase')}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Strips the scheme so an address fits on one line without wrapping. */
function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/^https?:\/\//, '');
}

function Row({
  label,
  value,
  emphasis = false,
  last = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  last?: boolean;
}) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.row, !last && styles.rowSeparator]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, emphasis && { color: color.accent }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.paper },
    content: { paddingBottom: space[6] * 2 },
    block: { paddingHorizontal: layout.screenPadding },

    hint: {
      ...type.meta,
      color: color.textSecondary,
      lineHeight: 18,
      marginTop: space[3],
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space[3],
      gap: space[4],
    },
    rowSeparator: { borderBottomWidth: hairline, borderBottomColor: color.paperLine },
    rowLabel: { ...type.label, color: color.textSecondary },
    rowValue: { ...type.body, color: color.textPrimary, flexShrink: 1, textAlign: 'right' },

    actions: { marginTop: space[5] },
    gap: { height: space[3] },
    signOut: { paddingHorizontal: layout.screenPadding, marginTop: space[6] * 2 },
  });
