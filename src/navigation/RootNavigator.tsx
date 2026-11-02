import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { BlurTarget, BlurTargetScope } from '../components/BlurTarget';
import { TabBar } from '../components/TabBar';
import { AlbumScreen } from '../screens/AlbumScreen';
import { ArtistScreen } from '../screens/ArtistScreen';
import { DiagnosticScreen } from '../screens/DiagnosticScreen';
import { GenreScreen } from '../screens/GenreScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { PlaylistScreen } from '../screens/PlaylistScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ShowcaseScreen } from '../screens/ShowcaseScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { getSettings } from '../store/useSettingsStore';
import { motion, type Palette } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { navigationRef } from './ref';
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
 * Every stack hides the native header — screens draw their own — and every
 * tab carries the same detail screens, so following a link stays in the tab
 * it started from. Pushes cross-fade while ExpandFrom grows the new screen
 * out of whatever was pressed, rather than sliding it in from an edge.
 */

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();

const screenOptions = {
  headerShown: false,
  animation: 'fade' as const,
  animationDuration: motion.durationScreen,
} as const;

/** The ground colour behind screens, so pushes never flash white. */
function buildNavigationTheme(color: Palette): Theme {
  return {
    ...DefaultTheme,
    dark: color.mode === 'dark',
    colors: {
      ...DefaultTheme.colors,
      background: color.background,
      card: color.background,
      text: color.label,
      primary: color.accent,
      border: color.separator,
    },
  };
}

/**
 * Each tab's stack sits inside a named blur target, so the dock — rendered
 * beside the screens, never inside them — can really blur whichever is on
 * show. See BlurTarget.tsx.
 */
const tabTarget = (routeName: string) => `tab:${routeName}`;

function HomeNavigator() {
  return (
    <BlurTarget name={tabTarget('Home')} style={styles.fill}>
      <HomeStack.Navigator screenOptions={screenOptions}>
        <HomeStack.Screen name="HomeFeed" component={HomeScreen} />
        <HomeStack.Screen name="Album" component={AlbumScreen} />
        <HomeStack.Screen name="Artist" component={ArtistScreen} />
        <HomeStack.Screen name="Playlist" component={PlaylistScreen} />
        <HomeStack.Screen name="Genre" component={GenreScreen} />
        <HomeStack.Screen name="History" component={HistoryScreen} />
        <HomeStack.Screen name="Stats" component={StatsScreen} />
      </HomeStack.Navigator>
    </BlurTarget>
  );
}

function SearchNavigator() {
  return (
    <BlurTarget name={tabTarget('Search')} style={styles.fill}>
      <SearchStack.Navigator screenOptions={screenOptions}>
        <SearchStack.Screen name="SearchHome" component={SearchScreen} />
        <SearchStack.Screen name="Album" component={AlbumScreen} />
        <SearchStack.Screen name="Artist" component={ArtistScreen} />
        <SearchStack.Screen name="Playlist" component={PlaylistScreen} />
        <SearchStack.Screen name="Genre" component={GenreScreen} />
        <SearchStack.Screen name="History" component={HistoryScreen} />
        <SearchStack.Screen name="Stats" component={StatsScreen} />
      </SearchStack.Navigator>
    </BlurTarget>
  );
}

function LibraryNavigator() {
  return (
    <BlurTarget name={tabTarget('Library')} style={styles.fill}>
      <LibraryStack.Navigator screenOptions={screenOptions}>
        <LibraryStack.Screen name="LibraryHome" component={LibraryScreen} />
        <LibraryStack.Screen name="Album" component={AlbumScreen} />
        <LibraryStack.Screen name="Artist" component={ArtistScreen} />
        <LibraryStack.Screen name="Playlist" component={PlaylistScreen} />
        <LibraryStack.Screen name="Genre" component={GenreScreen} />
        <LibraryStack.Screen name="History" component={HistoryScreen} />
        <LibraryStack.Screen name="Stats" component={StatsScreen} />
      </LibraryStack.Navigator>
    </BlurTarget>
  );
}

/**
 * Tabs shift rather than cut. `fade` was tried and left a tab at zero
 * opacity when a modal was dismissed back over it.
 */
const tabScreenOptions = {
  ...screenOptions,
  animation: 'shift' as const,
  transitionSpec: { animation: 'timing' as const, config: { duration: motion.durationBase } },
};

function TabNavigator() {
  // Read once: the start tab is where the app opens, not a live binding.
  const initialRouteName = useMemo(() => getSettings().startTab, []);

  return (
    <Tabs.Navigator
      initialRouteName={initialRouteName}
      screenOptions={tabScreenOptions}
      tabBar={(props) => (
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

export function RootNavigator() {
  const color = useTheme();
  const theme = useMemo(() => buildNavigationTheme(color), [color]);

  return (
    <NavigationContainer theme={theme} ref={navigationRef}>
      <RootStack.Navigator screenOptions={screenOptions}>
        <RootStack.Screen name="Tabs" component={TabNavigator} />
        {/* The player and its panels are not here: they live in
            PlayerOverlay, above the navigator, so they can grow out of the
            dock and never detach the screen beneath. */}
        <RootStack.Screen name="Settings" component={SettingsScreen} />
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
