import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Glass } from './Glass';
import { PressScale } from './Pressable';
import { IconChevronRight } from './icons';
import { enter } from '../theme/motion';
import { icon, layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Screen header: an Apple-style large title, or a compact one with a back
 * button for screens you drilled into.
 *
 * Root screens — Home, Library — get the large bold title, because on those
 * the title is the only thing telling you which tab you are on. Pushed
 * screens get a glass back button and a smaller title, since the hero below
 * them already names what you opened.
 */
export interface ScreenHeaderProps {
  title: string;
  /** Optional right-hand slot for a single action. */
  action?: React.ReactNode;
  onBack?: () => void;
}

const BACK_SIZE = 36;

export function ScreenHeader({ title, action, onBack }: ScreenHeaderProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const large = onBack == null;

  return (
    <Animated.View entering={enter.fade()} style={[styles.root, large && styles.rootLarge]}>
      {onBack && (
        <PressScale
          noOrigin
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={space[3]}
          onPress={onBack}
          scaleTo={0.88}
          style={styles.back}
        >
          <Glass variant="thin" lite radius={BACK_SIZE / 2} style={StyleSheet.absoluteFill} />
          {/* Chevron rotated rather than shipping a second icon — the set is
              deliberately small and this keeps stroke weight identical. */}
          <IconChevronRight
            size={icon.size}
            strokeWidth={2}
            color={color.label}
            style={styles.backIcon}
          />
        </PressScale>
      )}

      <Text style={large ? styles.titleLarge : styles.title} numberOfLines={1}>
        {title}
      </Text>

      {action != null && <View style={styles.action}>{action}</View>}
    </Animated.View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: layout.screenPadding,
      paddingVertical: space[2],
      minHeight: layout.navBarHeight,
    },
    rootLarge: { paddingTop: space[3], paddingBottom: space[1] },
    back: {
      width: BACK_SIZE,
      height: BACK_SIZE,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space[3],
    },
    backIcon: { transform: [{ rotate: '180deg' }] },
    title: { ...type.headline, color: color.label, flex: 1 },
    titleLarge: { ...type.largeTitle, color: color.label, flex: 1 },
    action: { marginLeft: space[3] },
  });
