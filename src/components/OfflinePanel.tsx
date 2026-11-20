import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { IconArrowsShuffle, IconCircleArrowDown, IconPlayerPlayFilled } from './icons';
import { Keycap, KeyRow } from './Keycap';
import { Label } from './Label';
import { Led } from './Led';
import { Panel } from './Panel';
import type { RootStackParamList } from '../navigation/types';
import { downloadedSongs } from '../offline/downloads';
import { useDownloadedCount } from '../store/useDownloadStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { toast } from '../store/useToastStore';
import { layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { pluralize } from '../utils/time';

/**
 * Shown at the top of Home while no address answers and something is
 * downloaded: the rest of Home needs the server, so this says what still
 * works and puts it one press away.
 */

const SOURCE = { kind: 'downloads' as const, label: 'Downloads' };

export const OfflinePanel = memo(function OfflinePanel() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const offline = useServerStore((state) => state.connection == null && !state.connecting);
  const count = useDownloadedCount();

  if (!offline || count === 0) return null;

  const play = (shuffled: boolean) => {
    const songs = downloadedSongs();
    const player = usePlayerStore.getState();
    toast.guard(shuffled ? player.shufflePlay(songs, SOURCE) : player.playNow(songs, 0, SOURCE));
  };

  return (
    <Panel style={styles.panel}>
      <View style={styles.head}>
        <Led color={color.ledRed} size={9} />
        <View style={styles.text}>
          <Text style={styles.title}>Offline</Text>
          <Label tone="secondary">{`${pluralize(count, 'downloaded track')} ready to play`}</Label>
        </View>
      </View>
      <KeyRow style={styles.keys}>
        <Keycap
          icon={IconPlayerPlayFilled}
          iconFilled
          label="Play"
          size="sm"
          variant="primary"
          flex
          onPress={() => play(false)}
        />
        <Keycap icon={IconArrowsShuffle} label="Shuffle" size="sm" flex onPress={() => play(true)} />
        <Keycap
          icon={IconCircleArrowDown}
          size="sm"
          square
          accessibilityLabel="Open downloads"
          onPress={() => {
            useSettingsStore.getState().update({ libraryMode: 'downloads' });
            navigation.navigate('Tabs', { screen: 'Library', params: { screen: 'LibraryHome' } });
          }}
        />
      </KeyRow>
    </Panel>
  );
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    panel: { marginHorizontal: layout.screenPadding, marginBottom: space[4] },
    head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    text: { flex: 1, gap: 2 },
    title: { ...type.headline, color: color.label },
    keys: { marginTop: space[4] },
  });
