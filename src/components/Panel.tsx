import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Label } from './Label';
import { layout, radius, space, stroke } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';

/**
 * A module on the panel: a flat card with a crisp edge and an optional
 * screen-printed label in its corner.
 *
 * Panels hold information that should sit still — charts, stats,
 * settings — in the same solid material as every other surface.
 */
export interface PanelProps {
  children?: React.ReactNode;
  /** Mono label in the top-left corner. */
  label?: string;
  /** Right-aligned content on the label row. */
  trailing?: React.ReactNode;
  /** 'surface' (default), 'sunken' for wells, 'raised' for emphasis. */
  tone?: 'surface' | 'sunken' | 'raised';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Panel({
  children,
  label,
  trailing,
  tone = 'surface',
  padded = true,
  style,
}: PanelProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.root, styles[tone], padded && styles.padded, style]}>
      {(label != null || trailing != null) && (
        <View style={[styles.header, !padded && styles.headerUnpadded]}>
          {label != null ? <Label tone="tertiary">{label}</Label> : <View />}
          {trailing}
        </View>
      )}
      {children}
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: {
      borderRadius: radius.lg,
      borderWidth: stroke,
      overflow: 'hidden',
    },
    surface: { backgroundColor: color.surface, borderColor: color.separator },
    sunken: { backgroundColor: color.surfaceSunken, borderColor: color.separator },
    raised: { backgroundColor: color.surfaceRaised, borderColor: color.border },
    padded: { padding: layout.panelPadding },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[3],
      marginBottom: space[3],
      minHeight: 16,
    },
    headerUnpadded: {
      paddingHorizontal: layout.panelPadding,
      paddingTop: layout.panelPadding,
    },
  });
