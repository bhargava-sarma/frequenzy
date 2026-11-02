import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ConnectionBadge } from './ConnectionBadge';
import { Label } from './Label';
import { layout, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The top of a tab: a screen-printed eyebrow line and a large title.
 *
 *   MON 02 NOV · 14:32                         ● LAN
 *   Library                                   [+] [⚙]
 *
 * Root screens get this; screens you drill into get the collapsing glass
 * bar instead, since their hero already names what you opened.
 */
export interface ScreenHeaderProps {
  title: string;
  eyebrow?: string;
  /** Actions beside the title. */
  trailing?: React.ReactNode;
  /** Show the connection light on the eyebrow line. Default true. */
  status?: boolean;
  /** Use the larger greeting size. */
  hero?: boolean;
}

export const ScreenHeader = memo(function ScreenHeader({
  title,
  eyebrow,
  trailing,
  status = true,
  hero = false,
}: ScreenHeaderProps) {
  const color = useTheme();

  return (
    <View style={styles.root}>
      <View style={styles.eyebrowRow}>
        {eyebrow ? <Label tone="tertiary">{eyebrow}</Label> : <View />}
        {status && <ConnectionBadge />}
      </View>
      <View style={styles.titleRow}>
        <Text
          style={[hero ? type.hero : type.largeTitle, styles.title, { color: color.label }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {title}
        </Text>
        {trailing != null && <View style={styles.trailing}>{trailing}</View>}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[2],
    paddingBottom: space[2],
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space[1],
    minHeight: 48,
  },
  title: { flex: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginLeft: space[3] },
});
