import 'react-native-gesture-handler';

import { initializeSentry } from './src/core/observability/sentry';
import { AppRoot } from './src/app/AppRoot';

initializeSentry();

export default function App() {
  return <AppRoot />;
}
