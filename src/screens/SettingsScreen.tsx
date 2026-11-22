import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import appConfig from '../../app.json';
import { ApiError } from '../api/errors';
import { GridPaper } from '../components/GridPaper';
import { IconButton } from '../components/IconButton';
import {
  IconCheck,
  IconChevronLeft,
  IconLogout,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconShare2,
  IconTrash,
} from '../components/icons';
import { Keycap, KeyRow } from '../components/Keycap';
import { Label } from '../components/Label';
import { Led } from '../components/Led';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { Sheet, SheetRow } from '../components/Sheet';
import { Slider } from '../components/Slider';
import { Toggle } from '../components/Toggle';
import { clearCrashLog, formatCrash, getCrashLog, onCrashLogChanged, type CrashEntry } from '../data/crashLog';
import { clearLyricsCache } from '../data/lyricsCache';
import { clearPlayHistory } from '../data/playHistory';
import { clearRecentSearches } from '../data/recentSearches';
import type { RootStackParamList } from '../navigation/types';
import { removeAllDownloads, retryFailed, setPaused, totalsOf } from '../offline/downloads';
import { freeSpace } from '../offline/nativeFs';
import { useDownloadStore } from '../store/useDownloadStore';
import { useServerStore } from '../store/useServerStore';
import { useSettingsStore, type Settings } from '../store/useSettingsStore';
import { errorMessage, toast } from '../store/useToastStore';
import { pickInk } from '../theme/color';
import { ACCENT_PRESET_ORDER, accentPresets, hairline, layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemeControls, useThemedStyles } from '../theme/ThemeProvider';
import { SubsonicErrorCode, type ScanStatus } from '../types/subsonic';
import { haptics } from '../utils/haptics';
import { formatBytes, formatRelative, pluralize } from '../utils/time';

/**
 * Settings, laid out as the back panel of the device: grouped modules, each
 * control a physical one — slide switches, faders, keys.
 *
 * Everything is either a preference or maintenance. There is deliberately no
 * quality setting: a control that could silently downgrade playback is the
 * thing this app exists to avoid.
 */

const THEMES = [
  { value: 'system' as const, label: 'Auto' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
  { value: 'black' as const, label: 'OLED' },
];
const FACES = [
  { value: 'artwork' as const, label: 'Art' },
  { value: 'vinyl' as const, label: 'Vinyl' },
  { value: 'tape' as const, label: 'Tape' },
];
const SIZES = [
  { value: 'small' as const, label: 'S' },
  { value: 'medium' as const, label: 'M' },
  { value: 'large' as const, label: 'L' },
];
const TABS = [
  { value: 'Home' as const, label: 'Home' },
  { value: 'Search' as const, label: 'Search' },
  { value: 'Library' as const, label: 'Library' },
];

const hostOf = (url?: string) => (url ? url.replace(/^https?:\/\//, '') : undefined);

/** The finish each palette is named for on the faceplate. */
const FINISH = { light: 'ALUMINIUM', dark: 'GRAPHITE', black: 'OLED' } as const;

/** "0.55.2 (a1b2c3d)" → "0.55.2": the build hash is noise on a phone. */
const shortVersion = (version?: string) => version?.replace(/\s*\(.*\)\s*$/, '').trim();

export function SettingsScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { name: themeName, resolved } = useThemeControls();

  const settings = useSettingsStore();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => settings.update({ [key]: value } as Partial<Settings>);

  const config = useServerStore((state) => state.config);
  const connection = useServerStore((state) => state.connection);
  const connecting = useServerStore((state) => state.connecting);
  const info = useServerStore((state) => state.info);
  const client = useServerStore((state) => state.client);
  const library = useServerStore((state) => state.library);
  const refreshConnection = useServerStore((state) => state.refreshConnection);
  const signOut = useServerStore((state) => state.signOut);

  const [scan, setScan] = useState<ScanStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'none' | 'signOut' | 'reset' | 'downloads'>('none');

  const downloads = useDownloadStore((state) => state.tracks);
  const downloadsPaused = useDownloadStore((state) => state.paused);
  const downloadsBlocked = useDownloadStore((state) => state.blocked);
  const downloadsUnsupported = useDownloadStore((state) => state.unsupported);
  const totals = useMemo(() => totalsOf(downloads), [downloads]);
  const free = freeSpace();

  /** The newest recorded error, kept in view as the log changes. */
  const [lastCrash, setLastCrash] = useState<CrashEntry | null>(null);
  const [crashCount, setCrashCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void getCrashLog().then((log) => {
        if (!alive) return;
        setLastCrash(log[0] ?? null);
        setCrashCount(log.length);
      });
    read();
    const unsubscribe = onCrashLogChanged(read);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    client
      .getScanStatus()
      .then((response) => {
        if (!cancelled) setScan(response.scanStatus);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  /**
   * While a scan runs, keep asking how it is going. Read once, the row said
   * "scanning…" for as long as the screen stayed open, whether the scan took
   * a second or had long since finished.
   */
  const scanning = scan?.scanning === true;
  useEffect(() => {
    if (!client || !scanning) return;
    let cancelled = false;
    const timer = setInterval(() => {
      client
        .getScanStatus()
        .then((response) => {
          if (!cancelled) setScan(response.scanStatus);
        })
        .catch(() => {});
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, scanning]);

  // A finished scan means the library changed. The cached lists describe
  // the one from before, so they are dropped rather than left to age out
  // over a day while new music fails to appear.
  const wasScanning = useRef(false);
  useEffect(() => {
    if (wasScanning.current && !scanning) {
      void library?.clear().catch(() => {});
      toast.show('Library scan finished', {
        icon: 'check',
        detail: scan?.count != null ? `${scan.count.toLocaleString()} tracks` : undefined,
      });
    }
    wasScanning.current = scanning;
    // Fires on the scan ending; the count is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  async function run(key: string, work: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await work();
      haptics.success();
      toast.success(done);
    } catch (error) {
      toast.error('Something went wrong', { detail: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function rescan() {
    if (!client) return;
    setBusy('scan');
    try {
      const response = await client.startScan();
      setScan(response.scanStatus);
      toast.show('Library scan started', { icon: 'info' });
    } catch (error) {
      // By the server's own code, not by looking for "50" in the wording —
      // which also matched an HTTP 500 or a 150ms timeout.
      const denied = error instanceof ApiError && error.code === SubsonicErrorCode.NotAuthorized;
      toast.error("Couldn't start a scan", {
        detail: denied ? 'Scanning needs an admin account.' : errorMessage(error),
      });
    } finally {
      setBusy(null);
    }
  }

  const linking = !connection && connecting;
  const ledColor =
    connection?.kind === 'local'
      ? color.ledGreen
      : connection?.kind === 'remote' || linking
        ? color.ledAmber
        : color.ledRed;

  return (
    <>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <GridPaper />
        <View style={styles.nav}>
          <IconButton icon={IconChevronLeft} accessibilityLabel="Back" variant="surface" onPress={() => navigation.goBack()} />
          <View style={styles.navText}>
            <Label tone="tertiary">{`FQ-1 · ${FINISH[themeName]}${settings.theme === 'system' ? ' · AUTO' : ''}`}</Label>
            <Text style={[type.largeTitle, { color: color.label }]}>Settings</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[8] }]} showsVerticalScrollIndicator={false}>
          {/* ── Appearance ── */}
          <Panel label="01 — Appearance" style={styles.panel}>
            <Text style={styles.controlLabel}>Theme</Text>
            <Segmented options={THEMES} value={settings.theme} onChange={(value) => set('theme', value)} />

            <View style={styles.divider} />
            <Row label="Colour from artwork" hint="The player and the wash behind every screen take the colours of the cover that's playing.">
              <Toggle
                value={settings.accentMode === 'artwork'}
                onChange={(on) => set('accentMode', on ? 'artwork' : 'preset')}
                accessibilityLabel="Colour from artwork"
              />
            </Row>

            <Text style={[styles.controlLabel, styles.spaced]}>Accent</Text>
            <View style={styles.swatches}>
              {ACCENT_PRESET_ORDER.map((preset) => {
                const fill = accentPresets[preset][resolved];
                const selected = settings.accentPreset === preset;
                return (
                  <Pressable
                    key={preset}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={accentPresets[preset].label}
                    onPress={() => {
                      haptics.tick();
                      set('accentPreset', preset);
                    }}
                    style={({ pressed }) => [
                      styles.swatch,
                      { backgroundColor: fill, borderColor: selected ? color.label : 'transparent' },
                      pressed && styles.pressed,
                    ]}
                  >
                    {selected && <IconCheck size={16} color={pickInk(fill)} strokeWidth={3} />}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.divider} />
            <Text style={styles.controlLabel}>Player face</Text>
            <Segmented options={FACES} value={settings.playerFace} onChange={(value) => set('playerFace', value)} />

            <View style={styles.divider} />
            <Row label="Grid paper" hint="A faint dot grid behind every screen.">
              <Toggle value={settings.gridPaper} onChange={(on) => set('gridPaper', on)} accessibilityLabel="Grid paper" />
            </Row>
            <Row label="Reduce motion" hint="Stills the record, the tape and the level bars, and turns every slide and fade into a cut." last>
              <Toggle value={settings.reduceMotion} onChange={(on) => set('reduceMotion', on)} accessibilityLabel="Reduce motion" />
            </Row>
          </Panel>

          {/* ── Colour ── */}
          <Panel label="02 — Colour wash" style={styles.panel}>
            <Slider
              label="Ambient wash"
              value={settings.ambient}
              onChange={(value) => set('ambient', value)}
              readout={settings.ambient <= 0 ? 'OFF' : `${Math.round(settings.ambient * 100)}%`}
            />
            <Text style={styles.hint}>
              A still wash of the playing cover's colours behind every screen. All the way down turns it off.
            </Text>
          </Panel>

          {/* ── Playback ── */}
          <Panel label="03 — Playback" style={styles.panel}>
            <Row label="Resume last queue" hint="Puts the queue back, paused, when the app starts with nothing playing.">
              <Toggle value={settings.resumeQueue} onChange={(on) => set('resumeQueue', on)} accessibilityLabel="Resume last queue" />
            </Row>
            <Row label="Scrobble to Navidrome" hint="Report plays so the server's recent and most-played lists stay true.">
              <Toggle value={settings.scrobble} onChange={(on) => set('scrobble', on)} accessibilityLabel="Scrobble" />
            </Row>
            <Row label="Haptics" hint="A tick under the finger on keys, swipes and scrubbing." last>
              <Toggle value={settings.haptics} onChange={(on) => set('haptics', on)} accessibilityLabel="Haptics" />
            </Row>
            <Slider
              label="Sleep timer fade"
              value={settings.sleepFade}
              onChange={(value) => set('sleepFade', value)}
              min={0}
              max={60}
              step={5}
              readout={settings.sleepFade === 0 ? 'OFF' : `${settings.sleepFade}S`}
            />
            <Text style={styles.hint}>
              Streams are always the original file — format=raw, no bitrate cap. There is deliberately no quality
              setting.
            </Text>
          </Panel>

          {/* ── Lyrics & navigation ── */}
          <Panel label="04 — Lyrics & navigation" style={styles.panel}>
            <Row label="Romanise lyrics" hint="Non-Latin lines get a singable transliteration beneath them.">
              <Toggle value={settings.lyricsRomanize} onChange={(on) => set('lyricsRomanize', on)} accessibilityLabel="Romanise lyrics" />
            </Row>
            <Text style={[styles.controlLabel, styles.spaced]}>Lyric size</Text>
            <Segmented options={SIZES} value={settings.lyricsSize} onChange={(value) => set('lyricsSize', value)} size="sm" />
            <Text style={[styles.controlLabel, styles.spaced]}>Open on</Text>
            <Segmented options={TABS} value={settings.startTab} onChange={(value) => set('startTab', value)} size="sm" />
          </Panel>

          {/* ── Downloads ── */}
          <Panel label="05 — Downloads" style={styles.panel}>
            {downloadsUnsupported ? (
              <Text style={styles.hint}>{downloadsUnsupported}</Text>
            ) : (
              <>
                <Info
                  label="On this device"
                  value={totals.done > 0 ? `${pluralize(totals.done, 'track')} · ${formatBytes(totals.bytes)}` : 'Nothing yet'}
                />
                <Info label="Free space" value={free != null ? formatBytes(free) : '—'} />
                <Info
                  label="Queue"
                  value={
                    totals.queued === 0
                      ? totals.failed > 0
                        ? `${totals.failed} failed`
                        : 'Idle'
                      : downloadsPaused
                        ? `Paused · ${totals.queued} waiting`
                        : downloadsBlocked === 'offline'
                          ? `No connection · ${totals.queued} waiting`
                          : downloadsBlocked === 'homeOnly'
                            ? `Away from home · ${totals.queued} waiting`
                            : downloadsBlocked === 'storage'
                              ? `Storage full · ${totals.queued} waiting`
                              : `Downloading · ${totals.queued} to go`
                  }
                  last
                />
                <Row
                  label="Only at home"
                  hint="Download only while the home address answers. Away, the queue waits instead of using mobile data."
                  last
                >
                  <Toggle
                    value={settings.downloadsHomeOnly}
                    onChange={(on) => set('downloadsHomeOnly', on)}
                    accessibilityLabel="Download only at home"
                  />
                </Row>
                <KeyRow style={styles.keys}>
                  <Keycap
                    label={downloadsPaused ? 'Resume' : 'Pause'}
                    icon={downloadsPaused ? IconPlayerPlay : IconPlayerPause}
                    size="sm"
                    flex
                    active={downloadsPaused}
                    disabled={!downloadsPaused && totals.queued === 0}
                    onPress={() => setPaused(!downloadsPaused)}
                  />
                  <Keycap
                    label="Retry failed"
                    icon={IconRefresh}
                    size="sm"
                    flex
                    disabled={totals.failed === 0}
                    onPress={() => {
                      retryFailed();
                      toast.show('Retrying failed downloads', { icon: 'download' });
                    }}
                  />
                </KeyRow>
                <View style={styles.dataKeys}>
                  <Keycap
                    label="Remove all downloads"
                    icon={IconTrash}
                    size="sm"
                    disabled={totals.done + totals.queued + totals.failed === 0}
                    busy={busy === 'downloads'}
                    onPress={() => setConfirm('downloads')}
                  />
                </View>
                <Text style={styles.hint}>
                  Downloads are the original files, exactly as streamed, and play with no connection. Plays made
                  offline are sent to Navidrome once it can be reached.
                </Text>
              </>
            )}
          </Panel>

          {/* ── Server ── */}
          <Panel label="06 — Server" style={styles.panel}>
            <View style={styles.status}>
              <Led color={ledColor} size={9} busy={connecting} />
              <View style={styles.statusText}>
                <Text style={[type.headline, { color: color.label }]}>
                  {connection
                    ? connection.kind === 'local'
                      ? 'Home network'
                      : 'Remote address'
                    : linking
                      ? 'Connecting…'
                      : 'Not connected'}
                </Text>
                <Label tone="secondary">
                  {hostOf(connection?.url) ?? (linking ? 'Trying your addresses' : 'No address answering')}
                </Label>
              </View>
            </View>
            <Info label="Server" value={info?.type ? `${info.type} ${shortVersion(info.version) ?? ''}`.trim() : '—'} />
            <Info label="Account" value={config?.username ?? '—'} />
            <Info label="Home address" value={hostOf(config?.localUrl) ?? 'Not set'} />
            <Info label="Away address" value={hostOf(config?.remoteUrl) ?? 'Not set'} />
            <Info
              label="Library"
              value={
                scan
                  ? [scan.count != null ? `${scan.count.toLocaleString()} tracks` : null, scan.scanning ? 'scanning…' : scan.lastScan ? `scanned ${formatRelative(scan.lastScan)}` : null]
                      .filter(Boolean)
                      .join(' · ') || '—'
                  : '—'
              }
              last
            />
            <KeyRow style={styles.keys}>
              <Keycap label="Reconnect" icon={IconRefresh} size="sm" flex onPress={() => {
                refreshConnection();
                toast.show('Reconnecting…', { icon: 'info' });
              }} />
              <Keycap label="Rescan" size="sm" flex busy={busy === 'scan'} onPress={() => void rescan()} />
            </KeyRow>
          </Panel>

          {/* ── Data ── */}
          <Panel label="07 — Data" style={styles.panel}>
            <Text style={styles.hint}>
              Library data and lyrics are cached on this device and refetched when stale. Play history feeds Home and
              Stats; clearing it doesn't touch the play counts already sent to Navidrome.
            </Text>
            <View style={styles.dataKeys}>
              <Keycap label="Clear library cache" size="sm" busy={busy === 'cache'} onPress={() => void run('cache', async () => library?.clear(), 'Library cache cleared')} />
              <Keycap label="Clear lyrics cache" size="sm" busy={busy === 'lyrics'} onPress={() => void run('lyrics', clearLyricsCache, 'Lyrics cache cleared')} />
              <Keycap label="Clear play history" size="sm" busy={busy === 'history'} onPress={() => void run('history', clearPlayHistory, 'Play history cleared')} />
              <Keycap label="Clear search history" size="sm" busy={busy === 'search'} onPress={() => void run('search', clearRecentSearches, 'Search history cleared')} />
            </View>
          </Panel>

          {/* ── Diagnostics ── */}
          <Panel label="08 — Diagnostics" style={styles.panel}>
            {lastCrash ? (
              <>
                <View style={styles.status}>
                  <Led color={color.ledRed} size={9} />
                  <View style={styles.statusText}>
                    <Text style={[type.headline, { color: color.label }]}>Last error</Text>
                    <Label tone="secondary">
                      {`${formatRelative(lastCrash.at)} · ${lastCrash.scope}${crashCount > 1 ? ` · ${crashCount} logged` : ''}`}
                    </Label>
                  </View>
                </View>
                <Text style={styles.crash} numberOfLines={4} selectable>
                  {lastCrash.message}
                </Text>
                <KeyRow style={styles.keys}>
                  <Keycap
                    label="Share report"
                    icon={IconShare2}
                    size="sm"
                    flex
                    onPress={() => {
                      void Share.share({ message: formatCrash(lastCrash) }).catch(() => {});
                    }}
                  />
                  <Keycap
                    label="Clear"
                    size="sm"
                    flex
                    onPress={() => {
                      void clearCrashLog();
                      toast.show('Error log cleared', { icon: 'check' });
                    }}
                  />
                </KeyRow>
              </>
            ) : (
              <View style={styles.status}>
                <Led color={color.ledGreen} size={9} />
                <View style={styles.statusText}>
                  <Text style={[type.headline, { color: color.label }]}>No errors recorded</Text>
                  <Label tone="secondary">Anything that goes wrong is noted here</Label>
                </View>
              </View>
            )}
          </Panel>

          {/* ── About ── */}
          <Panel label="09 — About" style={styles.panel}>
            <Info label="App" value={`${appConfig.expo.name} ${appConfig.expo.version}`} />
            <Info label="Streams" value="format=raw · maxBitRate=0" />
            <Info label="Lyrics" value="Server tags, then LRCLIB" last />
            <KeyRow style={styles.keys}>
              <Keycap label="Reset settings" size="sm" flex onPress={() => setConfirm('reset')} />
              <Keycap label="Sign out" icon={IconLogout} size="sm" variant="dark" flex onPress={() => setConfirm('signOut')} />
            </KeyRow>
          </Panel>

          {__DEV__ && (
            <Panel label="10 — Developer" style={styles.panel}>
              <KeyRow>
                <Keycap label="Diagnostics" size="sm" flex onPress={() => navigation.navigate('Diagnostics')} />
                <Keycap label="Components" size="sm" flex onPress={() => navigation.navigate('Showcase')} />
              </KeyRow>
            </Panel>
          )}
        </ScrollView>

        <Sheet
          visible={confirm === 'signOut'}
          onClose={() => setConfirm('none')}
          title="Sign out?"
          subtitle="The queue, history, downloads and cached library for this server are cleared."
        >
          <SheetRow
            label="Sign out"
            icon={IconLogout}
            tone="destructive"
            onPress={() => {
              setConfirm('none');
              toast.guard(signOut(), "Couldn't sign out");
            }}
          />
          <SheetRow label="Stay signed in" last onPress={() => setConfirm('none')} />
        </Sheet>

        <Sheet
          visible={confirm === 'downloads'}
          onClose={() => setConfirm('none')}
          title="Remove all downloads?"
          subtitle={`${pluralize(totals.done, 'track')} (${formatBytes(totals.bytes)}) are deleted from this device. Nothing on the server changes.`}
        >
          <SheetRow
            label="Remove all downloads"
            icon={IconTrash}
            tone="destructive"
            onPress={() => {
              setConfirm('none');
              void run('downloads', removeAllDownloads, 'Downloads removed');
            }}
          />
          <SheetRow label="Keep them" last onPress={() => setConfirm('none')} />
        </Sheet>

        {/* Asked first: one press used to put every preference back to
            default with no way back. */}
        <Sheet
          visible={confirm === 'reset'}
          onClose={() => setConfirm('none')}
          title="Reset settings?"
          subtitle="Theme, playback and lyric preferences go back to their defaults. Per-track lyric timings are kept."
        >
          <SheetRow
            label="Reset settings"
            icon={IconTrash}
            tone="destructive"
            onPress={() => {
              setConfirm('none');
              settings.reset();
              haptics.success();
              toast.show('Settings reset', { icon: 'check' });
            }}
          />
          <SheetRow label="Keep them" last onPress={() => setConfirm('none')} />
        </Sheet>
      </View>
    </>
  );
}

function Row({ label, hint, children, last = false }: { label: string; hint?: string; children: React.ReactNode; last?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Info({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.info, !last && styles.rowLine]}>
      <Label tone="tertiary">{label}</Label>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.background },
    nav: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: space[3],
      paddingHorizontal: layout.screenPadding,
      paddingTop: space[2],
      paddingBottom: space[3],
    },
    navText: { flex: 1 },
    content: { paddingHorizontal: layout.screenPadding, gap: space[3] },
    panel: {},
    controlLabel: { ...type.callout, color: color.label, marginBottom: space[2] },
    spaced: { marginTop: space[4] },
    divider: { height: hairline, backgroundColor: color.separator, marginVertical: space[4] },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    swatch: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    row: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[3] },
    rowLine: { borderBottomWidth: hairline, borderBottomColor: color.separator },
    rowText: { flex: 1 },
    rowLabel: { ...type.callout, color: color.label },
    rowHint: { ...type.footnote, color: color.labelSecondary, marginTop: 2, lineHeight: 17 },
    hint: { ...type.footnote, color: color.labelSecondary, lineHeight: 18, marginTop: space[2] },
    status: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingBottom: space[3] },
    statusText: { flex: 1, gap: 2 },
    info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[4], minHeight: 40 },
    infoValue: { ...type.callout, color: color.label, flexShrink: 1, textAlign: 'right' },
    keys: { marginTop: space[4] },
    dataKeys: { marginTop: space[4], gap: space[2] },
    crash: { ...type.footnote, fontFamily: type.mono.fontFamily, color: color.labelSecondary, lineHeight: 17 },
  });
