import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// No playback service registration here. The player handles remote controls
// natively (see setCommands handling: 'native' in src/player/setup.ts), so
// lock screen, notification and Android Auto work without a JS runtime alive
// to service them — which is the case a headless task can't cover anyway.
