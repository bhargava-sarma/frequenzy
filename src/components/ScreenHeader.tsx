import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hairline, icon, layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { IconChevronRight } from './icons';

/**
 * Screen header with an optional back affordance.
 *
 * Uses the app's own header rather than the navigator's, so headers pull from
 * the design tokens instead of the platform default — a stock native header
 * would drop a Material title and back arrow into the middle of this design.
 *
 * The title is sentence case, not uppercase: the spec reserves uppercase for
 * labels and section headers, and a shouted album name reads wrong.
 */
export interface ScreenHeaderProps {
  title: string;
  /** Optional right-hand slot for a single action. */
  action?: React.ReactNode;
  onBack?: () => void;
}

export function ScreenHeader({ title, action, onBack }: ScreenHeaderProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.root}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={space[3]}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          {/* Chevron rotated rather than shipping a second icon — the set is
              deliberately small and this keeps stroke weight identical. */}
          <IconChevronRight
            size={icon.size}
            strokeWidth={icon.strokeWidth}
            color={color.textPrimary}
            style={styles.backIcon}
          />
        </Pressable>
      )}

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {action != null && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space[3],
    borderBottomWidth: hairline,
    borderBottomColor: color.paperLine,
    backgroundColor: color.paper,
  },
  back: { marginRight: space[2], padding: space[1] },
  backIcon: { transform: [{ rotate: '180deg' }] },
  pressed: { opacity: 0.6 },
  title: { ...type.title, color: color.textPrimary, flex: 1 },
  action: { marginLeft: space[3] },
});
