import React from 'react';
import { View, Text, ActivityIndicator, ScrollView, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { SyncProvider } from './offline/SyncProvider';
import LoginScreen from './screens/LoginScreen';
import InspectorTabs from './navigation/InspectorTabs';
import AdminTabs from './navigation/AdminTabs';
import WebPhoneWrapper from './components/WebPhoneWrapper';
import { colors } from './theme';

const Stack = createNativeStackNavigator();

/**
 * Anything that throws while rendering unmounts the whole tree and leaves a
 * blank white page with nothing in the DOM — the hardest failure to diagnose,
 * because the screen looks identical to "still loading". This turns it into a
 * readable message on screen.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the full stack in the Metro console as well as on screen.
    console.error('[NiyamNetra] render error', error, info && info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.error, marginBottom: 8 }}>
          Something failed while drawing the screen
        </Text>
        <Text selectable style={{ fontSize: 13, color: colors.text, marginBottom: 12 }}>
          {String((e && e.message) || e)}
        </Text>
        <Text selectable style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' }}>
          {String((e && e.stack) || '').slice(0, 4000)}
        </Text>
      </ScrollView>
    );
  }
}

/** Shown during the auth bootstrap. Never render null here: null is a white page. */
function Splash() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.niyamBlue, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(14, 116, 144, 0.25)', borderWidth: 2.5, borderColor: colors.netraTeal, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: colors.saffron, backgroundColor: 'rgba(15, 42, 68, 0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.white, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.netraTeal, borderWidth: 1.5, borderColor: colors.saffron }} />
          </View>
        </View>
      </View>
      <Text style={{ color: colors.white, fontSize: 24, fontWeight: '800', letterSpacing: 1.2 }}>NiyamNetra</Text>
      <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 }}>Legal Metrology Enforcement</Text>
      <ActivityIndicator color={colors.saffron} style={{ marginTop: 24 }} />
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 10 }}>Initializing secure environment…</Text>
    </View>
  );
}

// The navigator is built INSIDE the container, with the screen chosen by role.
// Rendering <Stack.Screen> on its own (an earlier bug) draws nothing, which is
// one of the ways this app used to be a blank white page. Screens must be direct
// children of the Navigator, and which one is mounted is decided here.
function Root() {
  const { role, isLoading } = useAuth();
  if (isLoading) return <Splash />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!role ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : role === 'admin' ? (
          <Stack.Screen name="Admin" component={AdminTabs} />
        ) : (
          <Stack.Screen name="Inspector" component={InspectorTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WebPhoneWrapper>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" backgroundColor={colors.niyamBlue} translucent={true} />
          <AuthProvider>
            <SyncProvider>
              <Root />
            </SyncProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </WebPhoneWrapper>
    </ErrorBoundary>
  );
}
