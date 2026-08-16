import { useMemo } from 'react';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabBar } from '../components/TabBar';
import { AlbumScreen } from '../screens/AlbumScreen';
import { ArtistScreen } from '../screens/ArtistScreen';
import { DiagnosticScreen } from '../screens/DiagnosticScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { NowPlayingScreen } from '../screens/NowPlayingScreen';
import { PlaylistScreen } from '../screens/PlaylistScreen';
import { QueueScreen } from '../screens/QueueScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShowcaseScreen } from '../screens/ShowcaseScreen';
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
 * Pushes are snappier than the platform default too — the same argument as the
 * sheets, applied to every drill-down in the library.
 */
const screenOptions = {
  headerShown: false,
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

function LibraryNavigator() {
  return (
    <LibraryStack.Navigator screenOptions={screenOptions}>
      <LibraryStack.Screen name="Artists" component={LibraryScreen} />
      <LibraryStack.Screen name="Artist" component={ArtistScreen} />
      <LibraryStack.Screen name="Album" component={AlbumScreen} />
      <LibraryStack.Screen name="Playlist" component={PlaylistScreen} />
    </LibraryStack.Navigator>
  );
}

function SearchNavigator() {
  return (
    <SearchStack.Navigator screenOptions={screenOptions}>
      <SearchStack.Screen name="SearchHome" component={SearchScreen} />
      <SearchStack.Screen name="Artist" component={ArtistScreen} />
      <SearchStack.Screen name="Album" component={AlbumScreen} />
    </SearchStack.Navigator>
  );
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={screenOptions}>
      <HomeStack.Screen name="HomeFeed" component={HomeScreen} />
      <HomeStack.Screen name="Artist" component={ArtistScreen} />
      <HomeStack.Screen name="Album" component={AlbumScreen} />
    </HomeStack.Navigator>
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
    <Tabs.Navigator screenOptions={tabScreenOptions} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="Home" component={HomeNavigator} />
      <Tabs.Screen name="Search" component={SearchNavigator} />
      <Tabs.Screen name="Library" component={LibraryNavigator} />
    </Tabs.Navigator>
  );
}

/**
 * How long a sheet takes to rise and fall.
 *
 * The platform default runs ~350ms, which on a sheet this large reads as the
 * screen labouring into place. The spec's motion section asks for mechanical
 * rather than cinematic, and this is the difference.
 */
const SHEET_DURATION_MS = motion.durationScreen;

export function RootNavigator() {
  const color = useTheme();
  const { resolved } = useThemeControls();
  const theme = useMemo(
    () => buildNavigationTheme(color, resolved === 'dark'),
    [color, resolved],
  );

  return (
    <NavigationContainer theme={theme}>
      <RootStack.Navigator screenOptions={screenOptions}>
        <RootStack.Screen name="Tabs" component={TabNavigator} />
        {/**
         * Sheets are ordinary pushed screens that happen to slide up, not
         * `presentation: 'modal'`.
         *
         * Android's modal presentation hands the screen to a separate native
         * container, and dismissing one left the screen underneath unpainted —
         * which is the black screen that appeared after swiping down. A plain
         * push keeps the previous screen mounted and drawn the whole time, and
         * looks identical going up.
         */}
        <RootStack.Group screenOptions={{ animation: 'slide_from_bottom' }}>
          <RootStack.Screen name="NowPlaying" component={NowPlayingScreen} />
          <RootStack.Screen name="Queue" component={QueueScreen} />
          <RootStack.Screen name="Settings" component={SettingsScreen} />
        </RootStack.Group>

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
