import { useMemo } from 'react';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { withScreenBoundary } from '../components/ErrorBoundary';
import { TabBar } from '../components/TabBar';
import { AlbumScreen as AlbumScreenBare } from '../screens/AlbumScreen';
import { ArtistScreen as ArtistScreenBare } from '../screens/ArtistScreen';
import { DiagnosticScreen as DiagnosticScreenBare } from '../screens/DiagnosticScreen';
import { GenreScreen as GenreScreenBare } from '../screens/GenreScreen';
import { HistoryScreen as HistoryScreenBare } from '../screens/HistoryScreen';
import { HomeScreen as HomeScreenBare } from '../screens/HomeScreen';
import { LibraryScreen as LibraryScreenBare } from '../screens/LibraryScreen';
import { PlaylistScreen as PlaylistScreenBare } from '../screens/PlaylistScreen';
import { SearchScreen as SearchScreenBare } from '../screens/SearchScreen';
import { SettingsScreen as SettingsScreenBare } from '../screens/SettingsScreen';
import { ShowcaseScreen as ShowcaseScreenBare } from '../screens/ShowcaseScreen';
import { StatsScreen as StatsScreenBare } from '../screens/StatsScreen';
import { getSettings } from '../store/useSettingsStore';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemeControls } from '../theme/ThemeProvider';
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
 * it started from.
 *
 * A push is a short native crossfade and a tab switch is a cut. Slides and a
 * tab crossfade were tried; on Android the tab fade animates the opacity of
 * a whole native stack, which draws each layer of the screen separately for
 * its duration and showed through itself, and neither proved itself on a
 * device. These two have. Reduce motion makes pushes a cut as well.
 *
 * Every screen sits inside its own error boundary, so a screen that fails
 * shows what went wrong and a way back instead of closing the app.
 */

const HomeScreen = withScreenBoundary(HomeScreenBare, 'Home');
const SearchScreen = withScreenBoundary(SearchScreenBare, 'Search');
const LibraryScreen = withScreenBoundary(LibraryScreenBare, 'Library');
const AlbumScreen = withScreenBoundary(AlbumScreenBare, 'Album');
const ArtistScreen = withScreenBoundary(ArtistScreenBare, 'Artist');
const PlaylistScreen = withScreenBoundary(PlaylistScreenBare, 'Playlist');
const GenreScreen = withScreenBoundary(GenreScreenBare, 'Genre');
const HistoryScreen = withScreenBoundary(HistoryScreenBare, 'History');
const StatsScreen = withScreenBoundary(StatsScreenBare, 'Stats');
const SettingsScreen = withScreenBoundary(SettingsScreenBare, 'Settings');
const DiagnosticScreen = withScreenBoundary(DiagnosticScreenBare, 'Diagnostics');
const ShowcaseScreen = withScreenBoundary(ShowcaseScreenBare, 'Showcase');

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();

const fadeOptions = {
  headerShown: false,
  animation: 'fade' as const,
  // iOS only; Android's native fade has its own fixed, short duration.
  animationDuration: 180,
} as const;
const stillOptions = { headerShown: false, animation: 'none' as const } as const;

/** The stack transition, given the Reduce motion setting. */
function useStackOptions() {
  const { reduceMotion } = useThemeControls();
  return reduceMotion ? stillOptions : fadeOptions;
}

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

function HomeNavigator() {
  const screenOptions = useStackOptions();
  return (
    <HomeStack.Navigator screenOptions={screenOptions}>
      <HomeStack.Screen name="HomeFeed" component={HomeScreen} />
      <HomeStack.Screen name="Album" component={AlbumScreen} />
      <HomeStack.Screen name="Artist" component={ArtistScreen} />
      <HomeStack.Screen name="Playlist" component={PlaylistScreen} />
      <HomeStack.Screen name="Genre" component={GenreScreen} />
      <HomeStack.Screen name="History" component={HistoryScreen} />
      <HomeStack.Screen name="Stats" component={StatsScreen} />
    </HomeStack.Navigator>
  );
}

function SearchNavigator() {
  const screenOptions = useStackOptions();
  return (
    <SearchStack.Navigator screenOptions={screenOptions}>
      <SearchStack.Screen name="SearchHome" component={SearchScreen} />
      <SearchStack.Screen name="Album" component={AlbumScreen} />
      <SearchStack.Screen name="Artist" component={ArtistScreen} />
      <SearchStack.Screen name="Playlist" component={PlaylistScreen} />
      <SearchStack.Screen name="Genre" component={GenreScreen} />
      <SearchStack.Screen name="History" component={HistoryScreen} />
      <SearchStack.Screen name="Stats" component={StatsScreen} />
    </SearchStack.Navigator>
  );
}

function LibraryNavigator() {
  const screenOptions = useStackOptions();
  return (
    <LibraryStack.Navigator screenOptions={screenOptions}>
      <LibraryStack.Screen name="LibraryHome" component={LibraryScreen} />
      <LibraryStack.Screen name="Album" component={AlbumScreen} />
      <LibraryStack.Screen name="Artist" component={ArtistScreen} />
      <LibraryStack.Screen name="Playlist" component={PlaylistScreen} />
      <LibraryStack.Screen name="Genre" component={GenreScreen} />
      <LibraryStack.Screen name="History" component={HistoryScreen} />
      <LibraryStack.Screen name="Stats" component={StatsScreen} />
    </LibraryStack.Navigator>
  );
}

/** Tabs cut: switching tabs is switching places, not going somewhere. */
const tabScreenOptions = { headerShown: false, animation: 'none' as const };

function TabNavigator() {
  // Read once: the start tab is where the app opens, not a live binding.
  const initialRouteName = useMemo(() => getSettings().startTab, []);

  return (
    <Tabs.Navigator
      initialRouteName={initialRouteName}
      screenOptions={tabScreenOptions}
      tabBar={(props) => <TabBar {...props} />}
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
  const screenOptions = useStackOptions();

  return (
    <NavigationContainer theme={theme} ref={navigationRef}>
      <RootStack.Navigator screenOptions={screenOptions}>
        <RootStack.Screen name="Tabs" component={TabNavigator} />
        {/* The player and its panels are not here: they live in
            PlayerOverlay, above the navigator, so they never detach the
            screen beneath. */}
        <RootStack.Screen name="Settings" component={SettingsScreen} />
        {__DEV__ && (
          <>
            <RootStack.Screen name="Diagnostics" component={DiagnosticScreen} />
            <RootStack.Screen name="Showcase" component={ShowcaseScreen} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
