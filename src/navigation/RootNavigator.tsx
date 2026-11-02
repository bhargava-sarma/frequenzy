import { useMemo } from 'react';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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
 * it started from. A push is a short crossfade and a tab switch is a cut:
 * the content is the point, not the trip between screens.
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

function HomeNavigator() {
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
const tabScreenOptions = {
  headerShown: false,
  animation: 'none' as const,
};

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
