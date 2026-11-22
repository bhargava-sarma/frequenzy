import { type ReactNode } from 'react';
import { StyleSheet, View, type Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientBackground, type AmbientBackgroundProps } from './AmbientBackground';
import { NavBar } from './CollapsingHeader';
import { GridPaper } from './GridPaper';
import { ScreenFocusProvider, useScreenFocused } from '../navigation/screenFocus';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The two screen shells.
 *
 * Both lay the same ground: the theme's colour, the engineering-paper dot
 * grid, then the artwork's still wash. Tab roots add the status-bar inset
 * and leave the header to the screen; detail screens float a bar over their
 * list that turns solid as the hero scrolls away.
 *
 * Each also tells what's inside whether its screen is the one on display.
 * The wash is drawn only there: tabs and stacks keep every visited screen
 * mounted, and each kept its own wash repainting and crossfading on every
 * track change behind screens nobody could see.
 */

function FocusedAmbient(props: AmbientBackgroundProps) {
  const focused = useScreenFocused();
  return focused ? <AmbientBackground {...props} /> : null;
}

export function TabScaffold({ children }: { children: ReactNode }) {
  const color = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScreenFocusProvider>
      <View style={[styles.root, { backgroundColor: color.background, paddingTop: insets.top }]}>
        <GridPaper />
        <FocusedAmbient />
        {children}
      </View>
    </ScreenFocusProvider>
  );
}

export interface DetailScaffoldProps {
  children: ReactNode;
  /** Compact title, shown once the hero has scrolled away. */
  title?: string;
  progress: Animated.AnimatedInterpolation<number>;
  onBack: () => void;
  trailing?: ReactNode;
  /** Painted beneath the grid and wash — usually a HeroBackdrop. */
  backdrop?: ReactNode;
}

export function DetailScaffold({ children, title, progress, onBack, trailing, backdrop }: DetailScaffoldProps) {
  const color = useTheme();
  return (
    <ScreenFocusProvider>
      <View style={[styles.root, { backgroundColor: color.background }]}>
        {backdrop}
        <GridPaper />
        <FocusedAmbient intensity={0.7} />
        {children}
        <NavBar title={title} progress={progress} onBack={onBack} trailing={trailing} />
      </View>
    </ScreenFocusProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
