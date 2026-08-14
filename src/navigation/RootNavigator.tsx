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
import { ShowcaseScreen } from '../screens/ShowcaseScreen';
import { color } from '../theme/tokens';
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

const screenOptions = { headerShown: false } as const;

/** Paper is the app's ground; without this, pushes flash white between screens. */
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: color.paper,
    card: color.paper,
    text: color.textPrimary,
    primary: color.accent,
    border: color.paperLine,
  },
};

function LibraryNavigator() {
  return (
    <LibraryStack.Navigator screenOptions={screenOptions}>
      <LibraryStack.Screen name="Artists" component={LibraryScreen} />
      <LibraryStack.Screen name="Artist" component={ArtistScreen} />
      <LibraryStack.Screen name="Album" component={AlbumScreen} />
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
      <HomeStack.Screen name="Playlist" component={PlaylistScreen} />
    </HomeStack.Navigator>
  );
}

function TabNavigator() {
  return (
    <Tabs.Navigator screenOptions={screenOptions} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="Home" component={HomeNavigator} />
      <Tabs.Screen name="Search" component={SearchNavigator} />
      <Tabs.Screen name="Library" component={LibraryNavigator} />
      <Tabs.Screen name="Queue" component={QueueScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator screenOptions={screenOptions}>
        <RootStack.Screen name="Tabs" component={TabNavigator} />
        <RootStack.Screen
          name="NowPlaying"
          component={NowPlayingScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />

        {/* Development surfaces. Reachable only from the diagnostics entry
            point and excluded from release builds. */}
        {__DEV__ && (
          <RootStack.Group screenOptions={{ presentation: 'modal' }}>
            <RootStack.Screen name="Diagnostics" component={DiagnosticScreen} />
            <RootStack.Screen name="Showcase" component={ShowcaseScreen} />
          </RootStack.Group>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
