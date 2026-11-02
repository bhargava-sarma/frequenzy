import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Label } from './Label';
import { Led } from './Led';
import { useServerStore } from '../store/useServerStore';
import { radius, space } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * Which address the app is talking to, as a status light: green on the LAN,
 * amber over the remote address, red when nothing answers. Pressing it
 * re-probes, which is the fix for most of the reasons it would be red.
 */
export const ConnectionBadge = memo(function ConnectionBadge({
  tone = 'default',
}: {
  tone?: 'default' | 'onArtwork';
}) {
  const color = useTheme();
  const connection = useServerStore((state) => state.connection);
  const refresh = useServerStore((state) => state.refreshConnection);

  const kind = connection?.kind;
  const led = kind === 'local' ? color.ledGreen : kind === 'remote' ? color.ledAmber : color.ledRed;
  const label = kind === 'local' ? 'LAN' : kind === 'remote' ? 'REMOTE' : 'OFFLINE';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Connection: ${label}. Reconnect.`}
      hitSlop={10}
      onPress={() => {
        haptics.tick();
        refresh();
      }}
      style={({ pressed }) => [
        styles.root,
        {
          borderColor: tone === 'onArtwork' ? 'rgba(255,255,255,0.2)' : color.separator,
          backgroundColor: tone === 'onArtwork' ? 'rgba(0,0,0,0.2)' : color.surface,
        },
        pressed && styles.pressed,
      ]}
    >
      <Led color={led} size={6} blink={!connection} />
      <View>
        <Label tone={tone === 'onArtwork' ? 'onArtwork' : 'secondary'} size={9.5} bold>
          {label}
        </Label>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space[2],
    height: 22,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  pressed: { opacity: 0.6 },
});
