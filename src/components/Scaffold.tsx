import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';

import { AmbientBackground } from './AmbientBackground';
import { NavBar } from './CollapsingHeader';
import { GridPaper } from './GridPaper';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The two screen shells.
 *
 * Both lay the same ground: the theme's colour, the engineering-paper dot
 * grid, then the artwork's still wash. Tab roots add the status-bar inset
 * and leave the header to the screen; detail screens float a bar over their
 * list that turns solid as the hero scrolls away.
 */

export function TabScaffold({ children }: { children: ReactNode }) {
  const color = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: color.background, paddingTop: insets.top }]}>
      <GridPaper />
      <AmbientBackground />
      {children}
    </View>
  );
}

export interface DetailScaffoldProps {
  children: ReactNode;
  /** Compact title, shown once the hero has scrolled away. */
  title?: string;
  progress: SharedValue<number> | DerivedValue<number>;
  onBack: () => void;
  trailing?: ReactNode;
  /** Painted beneath the grid and wash — usually a HeroBackdrop. */
  backdrop?: ReactNode;
}

export function DetailScaffold({ children, title, progress, onBack, trailing, backdrop }: DetailScaffoldProps) {
  const color = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: color.background }]}>
      {backdrop}
      <GridPaper />
      <AmbientBackground intensity={0.7} />
      {children}
      <NavBar title={title} progress={progress} onBack={onBack} trailing={trailing} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
