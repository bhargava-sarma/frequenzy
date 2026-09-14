import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { BlurTarget, BlurTargetScope } from '../components/BlurTarget';
import { TabBar } from '../components/TabBar';
import { AlbumScreen } from '../screens/AlbumScreen';
import { ArtistScreen } from '../screens/ArtistScreen';
import { DiagnosticScreen } from '../screens/DiagnosticScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { PlaylistScreen } from '../screens/PlaylistScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShowcaseScreen } from '../screens/ShowcaseScreen';
import { navigationRef } from './ref';
import { motion } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemeControls } from '../theme/ThemeProvider';
import type {
  HomeStackParamList,
  LibraryStackParamList,
  RootStackParamList,
  SearchStackParamList,
  TabParamList,
} from './types';

/**
 * Navigation.
 *
 * Every stack hides the native header: screens render their own ScreenHeader
 * from the design tokens instead. A platform header would drop stock Material
 * typography and a system back arrow into the middle of this design.
 *
 * Library and Search each own a stack so the bottom nav stays visible while
 * drilling into an artist or album, rather than pushing over it.
 */

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();
const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();
const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();

/**
 * Pushes cross-fade; the screen supplies the rest of the transition.
 *
 * The platform's lateral slide fought the expansion — content growing out of
 * a row while the whole screen travelled in from the right reads as two
 * animations disagreeing. A fade leaves the movement to ExpandFrom, which is
 * the part anchored to what you actually pressed, and still gives the pop a
 * transition rather than a cut.
 */
const screenOptions = {
  headerShown: false,
  animation: 'fade' as const,
  animationDuration: motion.durationScreen,
} as const;

/**
 * Paper is the app's ground; without this, pushes flash white between screens.
 *
 * Rebuilt per palette rather than defined once, since the flash it prevents
 * would otherwise come back inverted the moment the theme is switched.
 */
function buildNavigationTheme(color: Palette, dark: boolean): Theme {
  return {
    ...DefaultTheme,
    dark,
    colors: {
      ...DefaultTheme.colors,
      background: color.paper,
      card: color.paper,
      text: color.textPrimary,
      primary: color.accent,
      border: color.paperLine,
    },
  };
}

/**
 * Each tab's stack sits inside a named blur target.
 *
 * The dock is rendered by the tab navigator beside its screens, never inside
 * them, which is exactly the relationship a real blur on Android needs: a
 * blurring view may not live inside the content it blurs. One target per tab
 * rather than one around the whole navigator, because there is no element
 * that wraps the screens without also wrapping the dock.
 *
 * Wrapping is purely visual — the target is a plain container to layout and
 * gestures, and falls back to a View where blur is unavailable.
 */
const tabTarget = (routeName: string) => `tab:${routeName}`;

function LibraryNavigator() {
  return (
    <BlurTarget name={tabTarget('Library')} style={styles.fill}>
      <LibraryStack.Navigator screenOptions={screenOptions}>
        <LibraryStack.Screen name="Artists" component={LibraryScreen} />
        <LibraryStack.Screen name="Artist" component={ArtistScreen} />
        <LibraryStack.Screen name="Album" component={AlbumScreen} />
        <LibraryStack.Screen name="Playlist" component={PlaylistScreen} />
      </LibraryStack.Navigator>
    </BlurTarget>
  );
}

function SearchNavigator() {
  return (
    <BlurTarget name={tabTarget('Search')} style={styles.fill}>
      <SearchStack.Navigator screenOptions={screenOptions}>
        <SearchStack.Screen name="SearchHome" component={SearchScreen} />
        <SearchStack.Screen name="Artist" component={ArtistScreen} />
        <SearchStack.Screen name="Album" component={AlbumScreen} />
      </SearchStack.Navigator>
    </BlurTarget>
  );
}

function HomeNavigator() {
  return (
    <BlurTarget name={tabTarget('Home')} style={styles.fill}>
      <HomeStack.Navigator screenOptions={screenOptions}>
        <HomeStack.Screen name="HomeFeed" component={HomeScreen} />
        <HomeStack.Screen name="Artist" component={ArtistScreen} />
        <HomeStack.Screen name="Album" component={AlbumScreen} />
      </HomeStack.Navigator>
    </BlurTarget>
  );
}

/**
 * Tabs shift rather than cutting.
 *
 * Switching tabs was the one navigation in the app with no transition at all,
 * which made it the one that felt like a page reload. `shift` moves the
 * outgoing and incoming screens laterally; `fade` was tried first and left a
 * tab sitting at zero opacity when a modal was dismissed back over it, which
 * showed as a black screen.
 */
const tabScreenOptions = {
  ...screenOptions,
  animation: 'shift' as const,
  transitionSpec: {
    animation: 'timing' as const,
    config: { duration: motion.durationBase },
  },
};

function TabNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={tabScreenOptions}
      tabBar={(props) => (
        // Glass in the dock blurs whichever tab is on show.
        <BlurTargetScope name={tabTarget(props.state.routes[props.state.index].name)}>
          <TabBar {...props} />
        </BlurTargetScope>
      )}
    >
      <Tabs.Screen name="Home" component={HomeNavigator} />
      <Tabs.Screen name="Search" component={SearchNavigator} />
      <Tabs.Screen name="Library" component={LibraryNavigator} />
    </Tabs.Navigator>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export function RootNavigator() {
  const color = useTheme();
  const { resolved } = useThemeControls();
  const theme = useMemo(
    () => buildNavigationTheme(color, resolved === 'dark'),
    [color, resolved],
  );

  return (
    <NavigationContainer theme={theme} ref={navigationRef}>
      <RootStack.Navigator screenOptions={screenOptions}>
        <RootStack.Screen name="Tabs" component={TabNavigator} />
        {/**
         * The player and the queue are not here.
         *
         * They live in PlayerOverlay, above the navigator. A stack detaches
         * the screen underneath on Android, which left a black rectangle
         * behind on dismissal, and a stack can only slide a screen in from an
         * edge when the player should expand out of the dock you pressed.
         */}
        <RootStack.Screen name="Settings" component={SettingsScreen} />

        {/* Development surfaces. Reachable only from the diagnostics entry
            point and excluded from release builds. */}
        {__DEV__ && (
          <RootStack.Group screenOptions={{ animation: 'slide_from_bottom' }}>
            <RootStack.Screen name="Diagnostics" component={DiagnosticScreen} />
            <RootStack.Screen name="Showcase" component={ShowcaseScreen} />
          </RootStack.Group>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
