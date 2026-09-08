import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import SyncStrip from '../components/SyncStrip';
import LowStorageGuard from '../components/LowStorageGuard';
import { colors } from '../theme';
import InspectorFlow from '../screens/inspector/InspectorFlow';
import PassScreen from '../screens/inspector/PassScreen';
import ViolationsScreen from '../screens/inspector/ViolationsScreen';
import ReportsScreen from '../screens/inspector/ReportsScreen';
import MoreScreen from '../screens/inspector/MoreScreen';

const Tab = createBottomTabNavigator();

// Tab icon component — emoji kept (lucide-react-native is not installed; no
// new icon dependency). Each tab gets an accessibility label and a 2px active
// indicator bar so the selected tab is perceivable without colour alone.
function TabIcon({ label, focused, icon }) {
  return (
    <View style={styles.tabIconContainer} accessible accessibilityRole="image" accessibilityLabel={label}>
      {focused && (
        <View style={{ height: 2, width: 28, backgroundColor: colors.netraTeal, borderRadius: 1, marginBottom: 2 }} />
      )}
      <Text style={[styles.tabIcon, { color: focused ? colors.netraTeal : colors.textMuted }]}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: { alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 20 },
});

export default function InspectorTabs() {
  return (
    <LowStorageGuard>
      <View style={{ flex: 1 }}>
        <SyncStrip />
        <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.netraTeal,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.white,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 6,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
          },
        }}
      >
        <Tab.Screen
          name="Inspect"
          component={InspectorFlow}
          options={{
            tabBarLabel: 'Inspect',
            tabBarAccessibilityLabel: 'Inspect, establishment surveillance and sampling',
            tabBarIcon: ({ focused }) => <TabIcon icon="⚖️" focused={focused} label="Inspect" />,
          }}
        />
        <Tab.Screen
          name="Pass"
          component={PassScreen}
          options={{
            tabBarLabel: 'Pass',
            tabBarAccessibilityLabel: 'Pass, successful inspections',
            tabBarIcon: ({ focused }) => <TabIcon icon="✓" focused={focused} label="Pass" />,
          }}
        />
        <Tab.Screen
          name="Violations"
          component={ViolationsScreen}
          options={{
            tabBarLabel: 'Violations',
            tabBarAccessibilityLabel: 'Violations, flagged inspections',
            tabBarIcon: ({ focused }) => <TabIcon icon="!" focused={focused} label="Violations" />,
          }}
        />
        <Tab.Screen
          name="Reports"
          component={ReportsScreen}
          options={{
            tabBarLabel: 'Reports',
            tabBarAccessibilityLabel: 'Reports, inspection activity',
            tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} label="Reports" />,
          }}
        />
        <Tab.Screen
          name="More"
          component={MoreScreen}
          options={{
            tabBarLabel: 'More',
            tabBarAccessibilityLabel: 'More, profile and settings',
            tabBarIcon: ({ focused }) => <TabIcon icon="≡" focused={focused} label="More" />,
          }}
        />
        </Tab.Navigator>
      </View>
    </LowStorageGuard>
  );
}
