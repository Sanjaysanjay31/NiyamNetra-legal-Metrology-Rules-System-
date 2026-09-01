// Expo entry point. registerRootComponent mounts <App/> for native AND web
// (it calls AppRegistry.registerComponent + runApplication against the root
// tag). Without this the bundle loads but nothing is ever rendered, which is
// exactly why the app was a blank white page on `w` (web) and on device.
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
